// GitHub as the content store. Reads files from the repo, and saves an edit as ONE
// commit on the branch (content.json, new images, and removal of images nothing
// refers to anymore) through the Git Data API. That push runs the Pages workflow,
// which rebuilds and deploys the site.
//
// Auth, in order of preference:
//   • a GitHub App (GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY):
//     each hour the Worker trades a signed app JWT for an installation token scoped
//     to this one repository with contents:write + actions:read. Nothing long-lived
//     can write to the repo.
//   • or a fine-grained personal access token (GITHUB_TOKEN) limited to this repo.
import { HttpError } from './errors.js';
import { base64url, fromBase64, fromUtf8, toBase64, utf8 } from './bytes.js';
import { CONTENT_PATH } from '../../src/contentRules.js';

const tokens = new Map(); // installation id → { token, exp } (reused across requests in one isolate)

/** PEM → PKCS#8 DER. GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"); WebCrypto wants PKCS#8, so wrap it. */
export function pemToPkcs8(pem) {
  const text = String(pem).replace(/\\n/g, '\n');
  const der = fromBase64(text.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  if (!/BEGIN RSA PRIVATE KEY/.test(text)) return der;
  const len = (n) => (n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : n < 0x10000 ? [0x82, n >> 8, n & 0xff] : [0x83, n >> 16, (n >> 8) & 0xff, n & 0xff]);
  const rsaAlgorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const body = [0x02, 0x01, 0x00, ...rsaAlgorithm, 0x04, ...len(der.length), ...der];
  return Uint8Array.from([0x30, ...len(body.length), ...body]);
}

/** A GitHub App JWT (RS256, 9 minutes), used only to fetch an installation token. */
export async function appJwt(appId, pem, now = Date.now()) {
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(now / 1000) - 60; // allow for clock drift
  const head = base64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = base64url(utf8(JSON.stringify({ iat, exp: iat + 9 * 60, iss: String(appId) })));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(`${head}.${body}`)));
  return `${head}.${body}.${base64url(sig)}`;
}

export function createGitHubStore(env, { fetchImpl = fetch } = {}) {
  const api = (env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!owner || !repo) throw new HttpError(500, 'The admin isn’t configured: set GITHUB_OWNER and GITHUB_REPO.');
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const filePath = (p) => p.split('/').map(encodeURIComponent).join('/');
  const headers = (token, accept = 'application/vnd.github+json') => ({
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'nhoang-admin',
  });

  async function token() {
    if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
    const id = env.GITHUB_APP_INSTALLATION_ID;
    if (!env.GITHUB_APP_ID || !id || !env.GITHUB_APP_PRIVATE_KEY) {
      throw new HttpError(500, 'The admin isn’t configured: set the GitHub App secrets (or GITHUB_TOKEN).');
    }
    const cached = tokens.get(id);
    if (cached && cached.exp - Date.now() > 5 * 60 * 1000) return cached.token;
    const jwt = await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
    const res = await fetchImpl(`${api}/app/installations/${encodeURIComponent(id)}/access_tokens`, {
      method: 'POST',
      headers: { ...headers(jwt), 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositories: [repo], permissions: { contents: 'write', actions: 'read' } }),
    });
    if (!res.ok) throw new HttpError(502, `GitHub App sign-in failed (${res.status}). Check the app id, installation id and key.`);
    const { token: t, expires_at: exp } = await res.json();
    tokens.set(id, { token: t, exp: Date.parse(exp) });
    return t;
  }

  async function gh(method, path, body, { accept, allow = [] } = {}) {
    const res = await fetchImpl(api + path, {
      method,
      headers: { ...headers(await token(), accept), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && !allow.includes(res.status)) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new HttpError(res.status === 404 ? 404 : 502, `GitHub ${method} ${path.split('?')[0]} failed (${res.status}).`, { detail });
    }
    return res;
  }

  async function readBytes(path) {
    const res = await gh('GET', `${base}/contents/${filePath(path)}?ref=${encodeURIComponent(branch)}`, null, { accept: 'application/vnd.github.raw' });
    return new Uint8Array(await res.arrayBuffer());
  }

  return {
    mode: 'github',
    label: `${owner}/${repo} · ${branch}`,

    /** A text file and its blob sha (the version token used to catch conflicting edits). */
    async read(path) {
      const meta = await (await gh('GET', `${base}/contents/${filePath(path)}?ref=${encodeURIComponent(branch)}`)).json();
      if (meta.type !== 'file') throw new HttpError(404, `${path} isn’t a file.`);
      const bytes = meta.content ? fromBase64(meta.content) : await readBytes(path); // content is omitted past 1 MB
      return { text: fromUtf8(bytes), sha: meta.sha };
    },

    readBytes,

    /**
     * One commit: `files` [{ path, bytes }] written, `deletes` [path] removed (if
     * present). Refuses if content.json on the branch isn't `baseSha` any more, or
     * if the branch moves while the commit is being built.
     */
    async commit({ baseSha, files, deletes = [], message }) {
      const ref = await (await gh('GET', `${base}/git/ref/heads/${encodeURIComponent(branch)}`)).json();
      const headSha = ref.object.sha;
      const head = await (await gh('GET', `${base}/git/commits/${headSha}`)).json();
      const tree = await (await gh('GET', `${base}/git/trees/${head.tree.sha}?recursive=1`)).json();
      if (tree.truncated) throw new HttpError(500, 'The repository tree is too large to edit safely.');
      const existing = new Map(tree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
      if (existing.get(CONTENT_PATH) !== baseSha) {
        throw new HttpError(409, 'The content changed on GitHub since you opened it. Reload to get the latest.');
      }
      const entries = [];
      for (const f of files) {
        const blob = await (await gh('POST', `${base}/git/blobs`, { content: toBase64(f.bytes), encoding: 'base64' })).json();
        entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      for (const p of deletes) if (existing.has(p)) entries.push({ path: p, mode: '100644', type: 'blob', sha: null });
      const newTree = await (await gh('POST', `${base}/git/trees`, { base_tree: head.tree.sha, tree: entries })).json();
      const commit = await (await gh('POST', `${base}/git/commits`, { message, tree: newTree.sha, parents: [headSha] })).json();
      const moved = await gh('PATCH', `${base}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha, force: false }, { allow: [409, 422] });
      if (!moved.ok) throw new HttpError(409, 'Someone pushed to the branch while saving. Reload and try again.');
      return {
        commit: { sha: commit.sha, url: commit.html_url || `https://github.com/${owner}/${repo}/commit/${commit.sha}` },
        contentSha: entries.find((e) => e.path === CONTENT_PATH)?.sha ?? baseSha,
      };
    },

    /** Where the deploy for a commit is: pending (no run yet), deploying, live or failed. */
    async deployStatus(commitSha) {
      const { workflow_runs: runs = [] } = await (await gh('GET', `${base}/actions/runs?head_sha=${commitSha}&per_page=10`)).json();
      const run = runs.find((r) => /deploy|pages/i.test(r.name ?? '')) ?? runs[0];
      if (!run) return { state: 'pending' };
      if (run.status !== 'completed') return { state: 'deploying', url: run.html_url };
      return { state: run.conclusion === 'success' ? 'live' : 'failed', url: run.html_url };
    },
  };
}
