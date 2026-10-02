// The GitHub store against a fake GitHub: app auth (PKCS#1 keys as GitHub issues
// them), the one-commit save through the Git Data API, conflicts, deploy status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { appJwt, createGitHubStore } from '../server/github.js';
import { fromBase64, fromBase64url, fromUtf8, toBase64, utf8 } from '../server/bytes.js';

const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

test('signs a GitHub App JWT with a PKCS#1 key (and with escaped newlines)', async () => {
  for (const pem of [keys.privateKey, keys.privateKey.replace(/\n/g, '\\n')]) {
    const jwt = await appJwt(1234, pem, Date.parse('2026-09-25T00:00:00Z'));
    const [h, b, s] = jwt.split('.');
    const body = JSON.parse(fromUtf8(fromBase64url(b)));
    assert.equal(body.iss, '1234');
    assert.equal(body.exp - body.iat, 540);
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${b}`);
    assert.ok(v.verify(keys.publicKey, Buffer.from(fromBase64url(s))));
  }
});

/** A tiny in-memory GitHub: one branch, blobs, trees, commits, refs, runs. */
function fakeGitHub({ files }) {
  const calls = [];
  const blobs = new Map();
  let n = 0;
  const sha = () => (++n).toString(16).padStart(40, '0');
  const blobOf = (bytes) => {
    const s = sha();
    blobs.set(s, bytes);
    return s;
  };
  const tree = new Map(Object.entries(files).map(([p, text]) => [p, blobOf(utf8(text))]));
  const trees = new Map([['t0', tree]]);
  const commits = new Map([['c0', { tree: 't0', parents: [] }]]);
  const state = { head: 'c0', tokenRequests: 0, runs: [], moveRefBeforePatch: false };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push(`${method} ${u.pathname}`);
    const auth = init.headers?.Authorization ?? '';
    if (u.pathname.startsWith('/app/installations/')) {
      state.tokenRequests++;
      assert.match(auth, /^Bearer ey/);
      assert.deepEqual(body.permissions, { contents: 'write', actions: 'read' });
      return json({ token: 'inst-token', expires_at: new Date(Date.now() + 3600e3).toISOString() }, 201);
    }
    assert.equal(auth, 'Bearer inst-token');
    const m = u.pathname.replace('/repos/me/site', '');
    if (method === 'GET' && m.startsWith('/contents/')) {
      const path = decodeURIComponent(m.slice('/contents/'.length));
      const s = trees.get(commits.get(state.head).tree).get(path);
      if (!s) return json({ message: 'Not Found' }, 404);
      if (init.headers.Accept === 'application/vnd.github.raw') return new Response(blobs.get(s));
      return json({ type: 'file', sha: s, content: toBase64(blobs.get(s)) });
    }
    if (method === 'GET' && m === '/git/ref/heads/main') return json({ object: { sha: state.head } });
    if (method === 'GET' && m.startsWith('/git/commits/'))
      return json({ tree: { sha: commits.get(m.split('/').pop()).tree } });
    if (method === 'GET' && m.startsWith('/git/trees/')) {
      const t = trees.get(m.split('/').pop());
      return json({ truncated: false, tree: [...t].map(([path, s]) => ({ path, type: 'blob', sha: s })) });
    }
    if (method === 'POST' && m === '/git/blobs') {
      assert.equal(body.encoding, 'base64');
      return json({ sha: blobOf(fromBase64(body.content)) }, 201);
    }
    if (method === 'POST' && m === '/git/trees') {
      const next = new Map(trees.get(body.base_tree));
      for (const e of body.tree) {
        if (e.sha === null) {
          assert.ok(next.has(e.path), `deleting missing ${e.path}`);
          next.delete(e.path);
        } else next.set(e.path, e.sha);
      }
      const s = sha();
      trees.set(s, next);
      return json({ sha: s }, 201);
    }
    if (method === 'POST' && m === '/git/commits') {
      const s = sha();
      commits.set(s, { tree: body.tree, parents: body.parents, message: body.message });
      return json({ sha: s, html_url: `https://github.com/me/site/commit/${s}` }, 201);
    }
    if (method === 'PATCH' && m === '/git/refs/heads/main') {
      assert.equal(body.force, false);
      if (state.moveRefBeforePatch || commits.get(body.sha).parents[0] !== state.head)
        return json({ message: 'Update is not a fast forward' }, 422);
      state.head = body.sha;
      return json({ object: { sha: body.sha } });
    }
    if (method === 'GET' && m === '/actions/runs') return json({ workflow_runs: state.runs });
    return json({ message: `unhandled ${method} ${m}` }, 500);
  };
  const fileAt = (path) => {
    const s = trees.get(commits.get(state.head).tree).get(path);
    return s && fromUtf8(blobs.get(s));
  };
  return { fetchImpl, calls, state, fileAt, commits };
}

const env = {
  GITHUB_OWNER: 'me',
  GITHUB_REPO: 'site',
  GITHUB_BRANCH: 'main',
  GITHUB_API: 'https://gh.test',
  GITHUB_APP_ID: '42',
  GITHUB_APP_INSTALLATION_ID: '7',
  GITHUB_APP_PRIVATE_KEY: keys.privateKey,
};
const start = {
  'src/content.json': '{"v":1}\n',
  'public/assets/projects/a/old.webp': 'x',
  'public/assets/projects/a/old-card.webp': 'y',
  'index.html': '<html>',
};

test('reads a file and its blob sha; app token is fetched once and reused', async () => {
  const gh = fakeGitHub({ files: start });
  const store = createGitHubStore(env, { fetchImpl: gh.fetchImpl });
  const { text, sha } = await store.read('src/content.json');
  assert.equal(text, '{"v":1}\n');
  assert.match(sha, /^[0-9a-f]{40}$/);
  await store.read('index.html');
  assert.equal(gh.state.tokenRequests <= 1, true);
});

test('saves content, adds and removes images in one commit', async () => {
  const gh = fakeGitHub({ files: start });
  const store = createGitHubStore(env, { fetchImpl: gh.fetchImpl });
  const { sha } = await store.read('src/content.json');
  const res = await store.commit({
    baseSha: sha,
    files: [
      { path: 'src/content.json', bytes: utf8('{"v":2}\n') },
      { path: 'public/assets/projects/a/new.webp', bytes: utf8('webp') },
    ],
    deletes: [
      'public/assets/projects/a/old.webp',
      'public/assets/projects/a/old-card.webp',
      'public/never/existed.webp',
    ],
    message: 'Admin: edit projects',
  });
  assert.equal(gh.fileAt('src/content.json'), '{"v":2}\n');
  assert.equal(gh.fileAt('public/assets/projects/a/new.webp'), 'webp');
  assert.equal(gh.fileAt('public/assets/projects/a/old.webp'), undefined);
  assert.equal(gh.fileAt('index.html'), '<html>');
  assert.equal(gh.commits.get(res.commit.sha).message, 'Admin: edit projects');
  assert.equal(gh.calls.filter((c) => c === 'POST /repos/me/site/git/commits').length, 1);
  assert.match(res.commit.url, /commit\//);
  assert.equal(res.contentSha, (await store.read('src/content.json')).sha);
});

test('refuses to save over newer content, or when the branch moves mid-save', async () => {
  const gh = fakeGitHub({ files: start });
  const store = createGitHubStore(env, { fetchImpl: gh.fetchImpl });
  const stale = '0'.repeat(40);
  await assert.rejects(
    store.commit({ baseSha: stale, files: [{ path: 'src/content.json', bytes: utf8('{}') }], message: 'x' }),
    (e) => e.status === 409,
  );
  const { sha } = await store.read('src/content.json');
  gh.state.moveRefBeforePatch = true;
  await assert.rejects(
    store.commit({ baseSha: sha, files: [{ path: 'src/content.json', bytes: utf8('{}') }], message: 'x' }),
    (e) => e.status === 409,
  );
  assert.equal(gh.fileAt('src/content.json'), '{"v":1}\n');
});

test('deploy status follows the Pages workflow run', async () => {
  const gh = fakeGitHub({ files: start });
  const store = createGitHubStore({ ...env, GITHUB_TOKEN: 'inst-token' }, { fetchImpl: gh.fetchImpl });
  const c = 'a'.repeat(40);
  assert.deepEqual(await store.deployStatus(c), { state: 'pending' });
  gh.state.runs = [{ name: 'Deploy to GitHub Pages', status: 'in_progress', html_url: 'u' }];
  assert.equal((await store.deployStatus(c)).state, 'deploying');
  gh.state.runs = [{ name: 'Deploy to GitHub Pages', status: 'completed', conclusion: 'success', html_url: 'u' }];
  assert.equal((await store.deployStatus(c)).state, 'live');
  gh.state.runs = [{ name: 'Deploy to GitHub Pages', status: 'completed', conclusion: 'failure', html_url: 'u' }];
  assert.equal((await store.deployStatus(c)).state, 'failed');
  assert.equal(gh.state.tokenRequests, 0); // a fine-grained token skips the app exchange
});
