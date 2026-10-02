// The admin API, independent of where it runs (Cloudflare Worker or the local Vite
// server) and where content lives (GitHub or the local files):
//
//   GET  /api/session              who's signed in, and where saves go
//   GET  /api/content              content.json + its version (blob sha)
//   POST /api/save                 { baseSha, content, uploads, message } → one commit
//   GET  /api/deploy?commit=<sha>  is that commit live yet?
//   GET  /api/image?src=…&card=1   a project image from the store (thumbnails)
//
// Every save is checked against src/contentRules.js here, whatever the browser
// said: content that would break the site is refused, uploads must be WebP and
// actually used, and images nothing refers to anymore are removed in the same commit.
import { CONTENT_PATH, IMAGE_RE, imageRefs, validateContent } from '../../src/contentRules.js';
import { fromBase64, fromUtf8, isWebp, utf8 } from './bytes.js';
import { HttpError } from './errors.js';

const MAX_BODY = 48 * 1024 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** State-changing requests must come from the admin page itself (no cross-site posts). */
function assertSameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (origin ? origin !== url.origin : site && site !== 'same-origin')
    throw new HttpError(403, 'Cross-site request refused.');
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json'))
    throw new HttpError(415, 'Expected JSON.');
}

async function save(request, store) {
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_BODY)
    throw new HttpError(413, 'That save is too large. Try uploading fewer images at once.');
  let body;
  try {
    body = JSON.parse(fromUtf8(raw));
  } catch {
    throw new HttpError(400, 'Couldn’t read the request.');
  }
  const { baseSha, content, uploads = [], message = '' } = body ?? {};
  if (typeof baseSha !== 'string' || !Array.isArray(uploads)) throw new HttpError(400, 'Malformed save request.');

  const { errors } = validateContent(content);
  if (errors.length) throw new HttpError(422, 'Some fields need fixing before this can be saved.', { errors });

  const current = await store.read(CONTENT_PATH);
  if (current.sha !== baseSha)
    throw new HttpError(
      409,
      'The content changed since you opened it (another tab or device?). Reload to get the latest.',
    );
  const before = imageRefs(JSON.parse(current.text));
  const after = imageRefs(content);

  const files = [{ path: CONTENT_PATH, bytes: utf8(JSON.stringify(content, null, 2) + '\n') }];
  const uploaded = new Set();
  for (const u of uploads) {
    if (typeof u?.src !== 'string' || !IMAGE_RE.test(u.src)) throw new HttpError(400, 'Bad image path.');
    if (!after.has(u.src) || uploaded.has(u.src)) throw new HttpError(400, `Image ${u.src} isn’t used by any project.`);
    for (const [suffix, data] of [
      ['', u.full],
      ['-card', u.card],
    ]) {
      let bytes;
      try {
        bytes = fromBase64(String(data ?? ''));
      } catch {
        throw new HttpError(400, 'Image data is corrupt.');
      }
      if (!isWebp(bytes)) throw new HttpError(415, `${u.src}${suffix} isn’t a WebP image.`);
      if (bytes.byteLength > MAX_IMAGE)
        throw new HttpError(413, `${u.src}${suffix} is over ${MAX_IMAGE / 1024 / 1024} MB.`);
      files.push({ path: `public/${u.src}${suffix}.webp`, bytes });
    }
    uploaded.add(u.src);
  }
  const missing = [...after].filter((src) => !before.has(src) && !uploaded.has(src));
  if (missing.length) throw new HttpError(422, 'Some new images were never uploaded.', { missing });
  const deletes = [...before]
    .filter((src) => !after.has(src))
    .flatMap((src) => [`public/${src}.webp`, `public/${src}-card.webp`]);

  const summary = String(message).replace(/\s+/g, ' ').trim().slice(0, 120) || 'Update content';
  return store.commit({ baseSha, files, deletes, message: `Admin: ${summary}` });
}

/** @param {{ store, user: { email }, siteUrl?: string }} ctx */
export async function handleApi(request, { store, user, siteUrl = '' }) {
  const url = new URL(request.url);
  try {
    const route = `${request.method} ${url.pathname}`;
    if (route === 'GET /api/session') {
      return json({ email: user.email, mode: store.mode, store: store.label, siteUrl });
    }
    if (route === 'GET /api/content') {
      const { text, sha } = await store.read(CONTENT_PATH);
      return json({ content: JSON.parse(text), sha });
    }
    if (route === 'POST /api/save') {
      assertSameOrigin(request, url);
      return json(await save(request, store));
    }
    if (route === 'GET /api/deploy') {
      const sha = url.searchParams.get('commit') ?? '';
      if (!/^[0-9a-f]{40}$/.test(sha)) throw new HttpError(400, 'Bad commit id.');
      return json(await store.deployStatus(sha));
    }
    if (route === 'GET /api/image') {
      const src = url.searchParams.get('src') ?? '';
      if (!IMAGE_RE.test(src)) throw new HttpError(400, 'Bad image path.');
      const bytes = await store.readBytes(`public/${src}${url.searchParams.get('card') ? '-card' : ''}.webp`);
      return new Response(bytes, {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=300' },
      });
    }
    throw new HttpError(404, 'Not found.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on the server.' }, 500);
  }
}
