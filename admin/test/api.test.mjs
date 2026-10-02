// The admin API against an in-memory store holding the real content.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleApi } from '../server/api.js';
import { HttpError } from '../server/errors.js';
import { gitBlobSha, toBase64, utf8 } from '../server/bytes.js';

const CONTENT = readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8');
const WEBP = toBase64(
  Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]),
);

function memoryStore() {
  const files = new Map([
    ['src/content.json', utf8(CONTENT)],
    ['public/assets/projects/nba/cover.webp', utf8('img')],
    ['public/assets/projects/nba/cover-card.webp', utf8('card')],
  ]);
  const commits = [];
  return {
    files,
    commits,
    mode: 'test',
    label: 'memory',
    async read(p) {
      const b = files.get(p);
      if (!b) throw new HttpError(404, 'missing');
      return { text: new TextDecoder().decode(b), sha: await gitBlobSha(b) };
    },
    async readBytes(p) {
      const b = files.get(p);
      if (!b) throw new HttpError(404, 'missing');
      return b;
    },
    async commit({ baseSha, files: fs, deletes, message }) {
      if ((await this.read('src/content.json')).sha !== baseSha) throw new HttpError(409, 'stale');
      commits.push({ files: fs.map((f) => f.path), deletes, message });
      for (const f of fs) files.set(f.path, f.bytes);
      for (const d of deletes) files.delete(d);
      return { commit: { sha: 'f'.repeat(40), url: 'u' }, contentSha: await gitBlobSha(files.get('src/content.json')) };
    },
    async deployStatus() {
      return { state: 'live' };
    },
  };
}

const ORIGIN = 'https://admin.test';
const call = async (store, method, path, body, headers = {}) => {
  const res = await handleApi(
    new Request(ORIGIN + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    { store, user: { email: 'me@gmail.com' }, siteUrl: 'https://site.test/' },
  );
  const type = res.headers.get('Content-Type') ?? '';
  return {
    status: res.status,
    data: type.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()),
  };
};
const load = async (store) => (await call(store, 'GET', '/api/content')).data;

test('session and content', async () => {
  const store = memoryStore();
  assert.deepEqual((await call(store, 'GET', '/api/session')).data, {
    email: 'me@gmail.com',
    mode: 'test',
    store: 'memory',
    siteUrl: 'https://site.test/',
  });
  const { content, sha } = await load(store);
  assert.deepEqual(content, JSON.parse(CONTENT));
  assert.match(sha, /^[0-9a-f]{40}$/);
});

test('saves an edit (hide + reorder) as one commit with a summary message', async () => {
  const store = memoryStore();
  const { content, sha } = await load(store);
  content.projects[0].hidden = true;
  content.projects.reverse();
  const res = await call(store, 'POST', '/api/save', { baseSha: sha, content, uploads: [], message: 'Edit projects' });
  assert.equal(res.status, 200);
  assert.equal(store.commits.at(-1).message, 'Admin: Edit projects');
  const saved = JSON.parse(new TextDecoder().decode(store.files.get('src/content.json')));
  assert.equal(saved.projects.at(-1).hidden, true);
  assert.equal(saved.projects[0].id, 'nba');
  assert.equal(res.data.contentSha, (await load(store)).sha);
});

test('refuses content that would break the site, with field paths', async () => {
  const store = memoryStore();
  const { content, sha } = await load(store);
  content.contact.links[0].href = 'javascript:alert(1)';
  const res = await call(store, 'POST', '/api/save', { baseSha: sha, content });
  assert.equal(res.status, 422);
  assert.deepEqual(
    res.data.errors.map((e) => e.path),
    ['contact.links[0].href'],
  );
  assert.equal(store.commits.length, 0);
});

test('refuses a save based on stale content', async () => {
  const store = memoryStore();
  const { content } = await load(store);
  const res = await call(store, 'POST', '/api/save', { baseSha: '0'.repeat(40), content });
  assert.equal(res.status, 409);
});

test('uploads: must be WebP, must be used, and new images must be uploaded', async () => {
  const store = memoryStore();
  const { content, sha } = await load(store);
  content.projects[0].images.push({ src: 'assets/projects/reliquary/fresh', alt: 'A fresh capture' });
  const noUpload = await call(store, 'POST', '/api/save', { baseSha: sha, content });
  assert.equal(noUpload.status, 422);
  assert.deepEqual(noUpload.data.missing, ['assets/projects/reliquary/fresh']);
  const notWebp = await call(store, 'POST', '/api/save', {
    baseSha: sha,
    content,
    uploads: [{ src: 'assets/projects/reliquary/fresh', full: toBase64(utf8('<svg/>')), card: WEBP }],
  });
  assert.equal(notWebp.status, 415);
  const unused = await call(store, 'POST', '/api/save', {
    baseSha: sha,
    content,
    uploads: [
      { src: 'assets/projects/reliquary/fresh', full: WEBP, card: WEBP },
      { src: 'assets/projects/x/stray', full: WEBP, card: WEBP },
    ],
  });
  assert.equal(unused.status, 400);
  const traversal = await call(store, 'POST', '/api/save', {
    baseSha: sha,
    content,
    uploads: [{ src: '../../src/main', full: WEBP, card: WEBP }],
  });
  assert.equal(traversal.status, 400);
  const ok = await call(store, 'POST', '/api/save', {
    baseSha: sha,
    content,
    uploads: [{ src: 'assets/projects/reliquary/fresh', full: WEBP, card: WEBP }],
  });
  assert.equal(ok.status, 200);
  assert.ok(store.files.has('public/assets/projects/reliquary/fresh.webp'));
  assert.ok(store.files.has('public/assets/projects/reliquary/fresh-card.webp'));
});

test('images nothing refers to anymore are removed in the same commit', async () => {
  const store = memoryStore();
  const { content, sha } = await load(store);
  const nba = content.projects.find((p) => p.id === 'nba');
  content.projects = content.projects.filter((p) => p !== nba);
  const res = await call(store, 'POST', '/api/save', { baseSha: sha, content });
  assert.equal(res.status, 200);
  assert.deepEqual(store.commits.at(-1).deletes, [
    'public/assets/projects/nba/cover.webp',
    'public/assets/projects/nba/cover-card.webp',
  ]);
});

test('cross-site and non-JSON posts are refused', async () => {
  const store = memoryStore();
  const { content, sha } = await load(store);
  assert.equal(
    (await call(store, 'POST', '/api/save', { baseSha: sha, content }, { Origin: 'https://evil.test' })).status,
    403,
  );
  const form = await handleApi(
    new Request(`${ORIGIN}/api/save`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' },
      body: '{}',
    }),
    { store, user: { email: 'x' } },
  );
  assert.equal(form.status, 415);
});

test('image thumbnails: only project images', async () => {
  const store = memoryStore();
  const card = await call(store, 'GET', '/api/image?src=assets/projects/nba/cover&card=1');
  assert.equal(card.status, 200);
  assert.equal(new TextDecoder().decode(card.data), 'card');
  assert.equal((await call(store, 'GET', '/api/image?src=../src/content')).status, 400);
  assert.equal((await call(store, 'GET', '/api/deploy?commit=nope')).status, 400);
  assert.deepEqual((await call(store, 'GET', `/api/deploy?commit=${'a'.repeat(40)}`)).data, { state: 'live' });
});
