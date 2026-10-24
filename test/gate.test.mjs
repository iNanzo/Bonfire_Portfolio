// The sitewide password lock (content.json `gate`, the admin's Access page): the check a locked
// page runs first (src/gate/check.js: no nh_gate cookie → the destination kept, the page stopped,
// off to /unlock/?to=<its path>; the right cookie, or the admin's framed ?preview, stays), the
// way back (only a path on this site, never /unlock/ itself), the hash and the cookie's token
// (src/gate/crypto.js, the same PBKDF2 the admin hashes with), the switches (src/gate/pages.js:
// everything locked but the invitation), the rules (contentRules.js validateGate: on needs a
// key, no plaintext anywhere) and the build (vite.config.js: the check in each locked page and
// in the Reliquary page, the lock page's config, a sitemap without locked routes, the lock
// page's first load kept lean). The lock page's words are content's: never pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { validateContent, validateGate } from '../src/contentRules.js';
import { gateCheck, gateScript, safeDestination } from '../src/gate/check.js';
import { deriveHash, fromBase64, makeKey, toBase64, tokenOf, unlockToken } from '../src/gate/crypto.js';
import {
  GATE_COOKIE,
  GATE_ITER,
  GATE_LOCK,
  GATE_PAGES,
  GATE_TO,
  gateDefaults,
  gatePages,
  lockedPages,
  unlockConfig,
} from '../src/gate/pages.js';

const content = () => JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8'));
const ORIGIN = 'https://nhoang.dev';

/** A key as the admin writes one, made here from random bytes (no password needed). */
const someKey = () => ({
  alg: 'PBKDF2-SHA256',
  iter: GATE_ITER,
  salt: randomBytes(16).toString('base64'),
  hash: randomBytes(32).toString('base64'),
  set: '2026-10-24',
});
/** The cookie's token for a key, worked out here on its own: the first 16 hex of SHA-256 of the hash. */
const tokenFor = (key) => createHash('sha256').update(Buffer.from(key.hash, 'base64')).digest('hex').slice(0, 16);
/** A whole gate, on, with a key. */
const lockedGate = (over = {}) => ({ ...gateDefaults(), on: true, key: someKey(), ...over });

/** A stand-in window for the check: what it was asked to do, in order. */
function fakeWindow({ cookie = '', path = '/larp/', search = '', hash = '', framed = false, storage = true } = {}) {
  const calls = [];
  const w = {
    document: { cookie },
    location: { pathname: path, search, hash, replace: (u) => calls.push(['replace', u]) },
    sessionStorage: {
      setItem: (k, v) => {
        if (!storage) throw new Error('storage blocked');
        calls.push(['store', k, v]);
      },
    },
    stop: () => calls.push(['stop']),
  };
  w.parent = framed ? {} : w;
  return { w, calls };
}
const opts = (token, base = '/') => ({ token, base, cookie: GATE_COOKIE, store: GATE_TO });

// ---- the check on a locked page ---------------------------------------------------------------

test('no cookie: the destination kept, the page stopped, then off to the lock with its path', () => {
  const { w, calls } = fakeWindow({ path: '/visualizer/', search: '?scene=b:moon', hash: '#x' });
  assert.equal(gateCheck(w, opts('0123456789abcdef')), 'locked');
  assert.deepEqual(calls, [
    ['store', GATE_TO, '/visualizer/?scene=b:moon#x'],
    ['stop'],
    ['replace', `/unlock/?to=${encodeURIComponent('/visualizer/')}`],
  ]);
  // (Stopped before it goes: a stop after the replace would cancel it.)
});

test('the right cookie stays; a wrong one, a lookalike name or another cookie does not', () => {
  const t = 'feedfacecafebeef';
  for (const cookie of [`${GATE_COOKIE}=${t}`, `a=1; ${GATE_COOKIE}=${t}; b=2`, `a=1;${GATE_COOKIE}=${t}`]) {
    const { w, calls } = fakeWindow({ cookie });
    assert.equal(gateCheck(w, opts(t)), 'open', cookie);
    assert.deepEqual(calls, [], `${cookie}: nothing done`);
  }
  for (const cookie of ['', `${GATE_COOKIE}=0000000000000000`, `x${GATE_COOKIE}=${t}`, `${GATE_COOKIE}=${t}0`]) {
    const { w } = fakeWindow({ cookie });
    assert.equal(gateCheck(w, opts(t)), 'locked', cookie || '(no cookie)');
  }
});

test('the admin’s live preview (?preview in a frame) stays; ?preview on its own, or a frame without it, does not', () => {
  const t = '00ff00ff00ff00ff';
  assert.equal(gateCheck(fakeWindow({ search: '?preview=1', framed: true }).w, opts(t)), 'preview');
  assert.equal(gateCheck(fakeWindow({ search: '?a=2&preview', framed: true }).w, opts(t)), 'preview');
  assert.equal(gateCheck(fakeWindow({ search: '?preview=1' }).w, opts(t)), 'locked', 'not framed');
  assert.equal(gateCheck(fakeWindow({ framed: true }).w, opts(t)), 'locked', 'framed, no ?preview');
  assert.equal(gateCheck(fakeWindow({ search: '?previewer=1', framed: true }).w, opts(t)), 'locked', 'a lookalike');
});

test('blocked storage still goes to the lock; a project site goes to its own /unlock/', () => {
  const { w, calls } = fakeWindow({ storage: false, path: '/repo/larp/' });
  assert.equal(gateCheck(w, opts('1111111111111111', '/repo/')), 'locked');
  assert.deepEqual(calls.at(-1), ['replace', `/repo/unlock/?to=${encodeURIComponent('/repo/larp/')}`]);
});

test('the script the build inlines is that check, whole: it runs on its own in a bare window', () => {
  const t = 'abcdefabcdef0123';
  const script = gateScript(t, '/');
  assert.ok(script.length < 900, `small enough to sit before the charset (${script.length} characters)`);
  assert.doesNotMatch(script, /<\/?script/i, 'nothing that could end its tag');
  assert.doesNotMatch(script, /\n/, 'one line');
  const locked = fakeWindow({ path: '/painter/', hash: '#scene=abc' });
  vm.runInNewContext(script, { window: locked.w });
  assert.deepEqual(locked.calls, [
    ['store', GATE_TO, '/painter/#scene=abc'],
    ['stop'],
    ['replace', `/unlock/?to=${encodeURIComponent('/painter/')}`],
  ]);
  const open = fakeWindow({ cookie: `${GATE_COOKIE}=${t}` });
  vm.runInNewContext(script, { window: open.w });
  assert.deepEqual(open.calls, []);
  // A window that throws everywhere: the page loads (the lock fails open, never a blank page).
  assert.doesNotThrow(() => vm.runInNewContext(script, { window: {} }));
});

// ---- the way back ---------------------------------------------------------------------------

test('the way back: the kept destination for the same page, else ?to, only ever a path on this site', () => {
  assert.equal(safeDestination('/larp/', '/larp/?x=1#y', ORIGIN), '/larp/?x=1#y', 'the full one kept');
  assert.equal(safeDestination('/larp/', '/visualizer/?scene=1', ORIGIN), '/larp/', 'kept for another page');
  assert.equal(safeDestination(null, '/painter/#scene=abc', ORIGIN), '/painter/#scene=abc');
  assert.equal(safeDestination('/projects/nba/', null, ORIGIN), '/projects/nba/');
  for (const bad of [
    'https://evil.example/',
    '//evil.example/x',
    '/\\evil.example/',
    'javascript:alert(1)',
    'larp/',
    '',
    '/unlock/',
    '/unlock/?to=/larp/',
  ])
    assert.equal(safeDestination(bad, null, ORIGIN), '/', `refused: ${bad || '(empty)'}`);
  assert.equal(safeDestination('/larp/', 'https://evil.example/larp/', ORIGIN), '/larp/', 'a kept one off the site');
  assert.equal(safeDestination('/elsewhere/', null, ORIGIN, '/repo/'), '/repo/', 'outside a project site’s base');
  assert.equal(safeDestination('/repo/larp/', null, ORIGIN, '/repo/'), '/repo/larp/');
});

// ---- the hash and the token -----------------------------------------------------------------

test('the hash is PBKDF2-SHA256 as Node makes it; the token is the first 16 hex of SHA-256 of it', async () => {
  const salt = randomBytes(16);
  const mine = await deriveHash('correct horse battery staple', salt, 1000);
  assert.deepEqual(Buffer.from(mine), pbkdf2Sync('correct horse battery staple', salt, 1000, 32, 'sha256'));
  assert.equal(mine.length, 32);
  const key = someKey();
  assert.equal(await tokenOf(fromBase64(key.hash)), tokenFor(key));
  assert.match(await tokenOf(fromBase64(key.hash)), /^[0-9a-f]{16}$/);
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'));
});

test('makeKey: a 16-byte salt, 600k iterations, the hash and the day; unlockToken knows only that password', async () => {
  const key = await makeKey('a long walk to the fire', { iter: 2000, today: new Date('2026-10-24T12:00:00Z') });
  assert.deepEqual(Object.keys(key).sort(), ['alg', 'hash', 'iter', 'salt', 'set']);
  assert.equal(key.alg, 'PBKDF2-SHA256');
  assert.equal(key.iter, 2000);
  assert.equal(Buffer.from(key.salt, 'base64').length, 16);
  assert.equal(key.set, '2026-10-24');
  assert.deepEqual(
    Buffer.from(key.hash, 'base64'),
    pbkdf2Sync('a long walk to the fire', Buffer.from(key.salt, 'base64'), 2000, 32, 'sha256'),
  );
  assert.equal(await unlockToken('a long walk to the fire', key), tokenFor(key));
  assert.equal(await unlockToken('a long walk to the fir', key), null);
  assert.equal(await unlockToken('', key), null);
  const again = await makeKey('a long walk to the fire', { iter: 2000 });
  assert.notEqual(again.salt, key.salt, 'a new salt each time');
  assert.equal((await makeKey('x')).iter, GATE_ITER, '600k by default');
  assert.equal(GATE_ITER, 600000);
});

// ---- the switches ---------------------------------------------------------------------------

test('the switches: everything locked but the invitation; a missing switch takes its default', () => {
  assert.deepEqual(Object.keys(GATE_PAGES), ['portfolio', 'live', 'painter', 'larp', 'games', 'invitation']);
  assert.deepEqual(
    Object.entries(GATE_PAGES).filter(([, on]) => !on),
    [['invitation', false]],
  );
  assert.deepEqual(gatePages({ pages: { larp: false } }), { ...GATE_PAGES, larp: false });
  assert.deepEqual(gatePages(undefined), GATE_PAGES);
  assert.deepEqual(gatePages({ pages: { larp: 'no', blog: true } }), GATE_PAGES, 'only switches, only its own');
  const d = gateDefaults();
  assert.equal(d.on, false, 'ships off');
  assert.equal(d.remember, 30);
  assert.equal('key' in d, false, 'no key');
  assert.deepEqual(d.pages, GATE_PAGES);
  assert.deepEqual(Object.keys(d.lock), Object.keys(GATE_LOCK));
  assert.notEqual(gateDefaults().pages, gateDefaults().pages, 'a fresh copy each time');
});

test('locked pages: none while it’s off or has no key; the switched ones once it’s on', () => {
  assert.deepEqual(lockedPages(undefined), []);
  assert.deepEqual(lockedPages(gateDefaults()), []);
  assert.deepEqual(lockedPages({ ...gateDefaults(), on: true }), [], 'on, but no key');
  assert.deepEqual(lockedPages({ ...lockedGate(), on: false }), [], 'a key, but off');
  assert.deepEqual(lockedPages(lockedGate()), ['portfolio', 'live', 'painter', 'larp', 'games']);
  assert.deepEqual(lockedPages(lockedGate({ pages: { larp: false } })), ['portfolio', 'live', 'painter', 'games']);
  assert.ok(lockedPages(lockedGate({ pages: { invitation: true } })).includes('invitation'), 'its switch works');
});

test('the lock page’s config: the words (defaults where content has none) and the key, never more', () => {
  const g = lockedGate({ lock: { title: 'Mine' } });
  const cfg = unlockConfig(g);
  assert.equal(cfg.on, true);
  assert.equal(cfg.remember, 30);
  assert.deepEqual(Object.keys(cfg.key).sort(), ['alg', 'hash', 'iter', 'salt']);
  assert.equal(cfg.lock.title, 'Mine');
  assert.equal(cfg.lock.button, GATE_LOCK.button, 'a default for the rest');
  assert.deepEqual(unlockConfig(gateDefaults()).key, null);
  assert.equal(unlockConfig(gateDefaults()).on, false);
  assert.equal(unlockConfig({ ...lockedGate(), remember: 400 }).remember, 30, 'out of range: the default');
});

// ---- the rules ------------------------------------------------------------------------------

/** The errors validateGate finds in `g`, as [path, message]. */
const errorsOf = (g) => {
  const out = [];
  validateGate(g, (path, message) => out.push([path, message]));
  return out;
};

test('content.json’s gate passes the rules, ships off with no key unless one was set; content without it passes', () => {
  const c = content();
  assert.ok(c.gate, 'the section is there');
  assert.deepEqual(
    validateContent(c).errors.filter((e) => e.path.startsWith('gate')),
    [],
  );
  if (!c.gate.key) assert.equal(c.gate.on, false, 'no key: off');
  delete c.gate;
  assert.deepEqual(validateContent(c).errors, [], 'content from before the lock');
});

test('validateGate: a whole gate passes; on needs a key; switches, days and words each checked', () => {
  assert.deepEqual(errorsOf(lockedGate()), []);
  assert.deepEqual(errorsOf(gateDefaults()), []);
  assert.deepEqual(errorsOf({}), [], 'every part optional');
  assert.deepEqual(
    errorsOf({ on: true }).map(([p]) => p),
    ['gate.on'],
    'on with no key',
  );
  assert.deepEqual(
    errorsOf({ on: true, key: null }).map(([p]) => p),
    ['gate.on'],
  );
  const paths = (g) => errorsOf(g).map(([p]) => p);
  assert.deepEqual(paths({ on: 'yes' }), ['gate.on']);
  assert.deepEqual(paths({ pages: { blog: true } }), ['gate.pages.blog']);
  assert.deepEqual(paths({ pages: { larp: 'no' } }), ['gate.pages.larp']);
  assert.deepEqual(paths({ pages: [] }), ['gate.pages']);
  for (const remember of [0, 366, 1.5, '30', null])
    assert.deepEqual(paths({ remember }), ['gate.remember'], `${remember}`);
  assert.deepEqual(paths({ remember: 1 }), []);
  assert.deepEqual(paths({ remember: 365 }), []);
  assert.deepEqual(paths({ lock: { title: '' } }), ['gate.lock.title']);
  assert.deepEqual(paths({ lock: { title: 3 } }), ['gate.lock.title']);
  assert.deepEqual(paths({ lock: { flavor: 'x'.repeat(161) } }), ['gate.lock.flavor']);
  assert.deepEqual(paths({ lock: { motto: 'Hi' } }), ['gate.lock.motto']);
  assert.deepEqual(paths({ door: 1 }), ['gate.door']);
  assert.deepEqual(paths('on'), ['gate']);
});

test('validateGate: the key is exactly the admin’s: its algorithm, iterations, salt and hash lengths, day', () => {
  const paths = (key) => errorsOf({ key }).map(([p]) => p);
  assert.deepEqual(paths(someKey()), []);
  const { set, ...noDay } = someKey();
  assert.ok(set);
  assert.deepEqual(paths(noDay), [], 'the day is optional');
  assert.deepEqual(paths({ ...someKey(), alg: 'SHA-1' }), ['gate.key.alg']);
  for (const iter of [99999, 5000001, 1.5, '600000'])
    assert.deepEqual(paths({ ...someKey(), iter }), ['gate.key.iter']);
  assert.deepEqual(paths({ ...someKey(), salt: randomBytes(8).toString('base64') }), ['gate.key.salt']);
  assert.deepEqual(paths({ ...someKey(), salt: 'not base64!!' }), ['gate.key.salt']);
  assert.deepEqual(paths({ ...someKey(), hash: randomBytes(16).toString('base64') }), ['gate.key.hash']);
  assert.deepEqual(paths({ ...someKey(), set: '24/10/2026' }), ['gate.key.set']);
  assert.deepEqual(paths({ ...someKey(), note: 'x' }), ['gate.key.note']);
  assert.deepEqual(paths('hunter2'), ['gate.key']);
});

test('validateGate: anything that looks like a password, anywhere in the gate, is refused', () => {
  for (const g of [
    { password: 'hunter2' },
    { pass: 'hunter2' },
    { key: { ...someKey(), plain: 'hunter2' } },
    { lock: { secret: 'hunter2' } },
    { pages: { pwd: true } },
    { key: { ...someKey(), passphrase: 'a b c d' } },
    { Password: 'x' },
  ]) {
    const errs = errorsOf(g);
    assert.ok(
      errs.some(([, m]) => /password/i.test(m)),
      `${JSON.stringify(g).slice(0, 60)}: refused as a password (${JSON.stringify(errs)})`,
    );
  }
});

// ---- the build ------------------------------------------------------------------------------

/** A content.json in a folder of its own, with this gate. */
function tempContent(gate) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  const c = content();
  if (gate === undefined) delete c.gate;
  else c.gate = gate;
  writeFileSync(join(dir, 'content.json'), JSON.stringify(c, null, 2) + '\n');
  return { dir, file: join(dir, 'content.json') };
}
const HTML =
  '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n  </head>\n  <body></body>\n</html>\n';
const PAGE_FILES = {
  portfolio: '/index.html',
  live: '/visualizer/index.html',
  painter: '/painter/index.html',
  larp: '/larp/index.html',
  invitation: '/invitation/index.html',
};

/** The gate plugin, resolved as a build (or `command`), on that content. */
async function plugin(file, command = 'build', outDir = join(tmpdir(), 'none')) {
  const { gate } = await import('../vite.config.js');
  const p = gate(file);
  p.configResolved({ command, base: '/', root: '/', build: { outDir } });
  return p;
}
const run = async (p, path) => (await p.transformIndexHtml.handler(HTML, { path, filename: path })) ?? [];
const gateTag = (tags) => tags.filter((t) => t.tag === 'script' && t.attrs?.['data-gate'] !== undefined);
const configTag = (tags) => tags.find((t) => t.tag === 'script' && t.attrs?.id === 'gate-config');

test('the build: the check first in each locked page’s head, never the invitation, 404 or the lock page', async () => {
  const g = lockedGate();
  const { dir, file } = tempContent(g);
  try {
    const p = await plugin(file);
    assert.equal(p.apply, undefined, 'one plugin for both: the lock page’s config is in dev too');
    assert.equal(p.transformIndexHtml.order, 'post', 'after Vite’s own tags, so it stays first');
    for (const [page, path] of Object.entries(PAGE_FILES)) {
      const tags = gateTag(await run(p, path));
      if (page === 'invitation') {
        assert.deepEqual(tags, [], 'the invitation stays open');
        continue;
      }
      assert.equal(tags.length, 1, `${page}: one check`);
      assert.equal(tags[0].injectTo, 'head-prepend', `${page}: before the preloads and the entry module`);
      assert.equal(tags[0].children, gateScript(tokenFor(g.key), '/'), `${page}: the check, with the token`);
    }
    for (const path of ['/404.html', '/unlock/index.html']) assert.deepEqual(gateTag(await run(p, path)), [], path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the build: off, no key or a dev server locks nothing; a page’s switch off leaves it open', async () => {
  for (const g of [gateDefaults(), { ...gateDefaults(), on: true }, undefined]) {
    const { dir, file } = tempContent(g);
    try {
      const p = await plugin(file);
      for (const path of Object.values(PAGE_FILES)) assert.deepEqual(gateTag(await run(p, path)), [], path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const { dir, file } = tempContent(lockedGate({ pages: { larp: false, invitation: true } }));
  try {
    const dev = await plugin(file, 'serve');
    for (const path of Object.values(PAGE_FILES)) assert.deepEqual(gateTag(await run(dev, path)), [], `dev: ${path}`);
    const p = await plugin(file);
    assert.deepEqual(gateTag(await run(p, '/larp/index.html')), [], 'larp switched off');
    assert.equal(gateTag(await run(p, '/invitation/index.html')).length, 1, 'the invitation, once switched on');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the lock page gets its config inline (dev too), escaped so no word can end the tag', async () => {
  const g = lockedGate({ lock: { ...GATE_LOCK, flavor: 'A </script><b>trap' } });
  const { dir, file } = tempContent(g);
  try {
    for (const command of ['build', 'serve']) {
      const tag = configTag(await run(await plugin(file, command), '/unlock/index.html'));
      assert.ok(tag, `${command}: the config`);
      assert.equal(tag.attrs.type, 'application/json');
      assert.doesNotMatch(tag.children, /<\//, 'no closing tag inside');
      assert.deepEqual(JSON.parse(tag.children), unlockConfig(g));
    }
    assert.equal(configTag(await run(await plugin(file), '/larp/index.html')), undefined, 'only on the lock page');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the build: the Reliquary page (public/, no HTML transform) gets the check in its head too', async () => {
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>R</title></head><body>game</body></html>';
  for (const [g, locked] of [
    [lockedGate(), true],
    [lockedGate({ pages: { games: false } }), false],
    [gateDefaults(), false],
  ]) {
    const { dir, file } = tempContent(g);
    try {
      const out = join(dir, 'dist');
      mkdirSync(join(out, 'games'), { recursive: true });
      writeFileSync(join(out, 'games', 'reliquary.html'), page);
      const p = await plugin(file, 'build', out);
      await p.closeBundle();
      const html = readFileSync(join(out, 'games', 'reliquary.html'), 'utf8');
      if (!locked) assert.equal(html, page, 'left as it is');
      else {
        assert.ok(
          html.startsWith(
            `<!doctype html><html lang="en"><head><script data-gate>${gateScript(tokenFor(g.key), '/')}</script><meta`,
          ),
          'first in its head',
        );
        assert.ok(html.endsWith('<body>game</body></html>'), 'the rest as it was');
        await p.closeBundle();
        assert.equal(readFileSync(join(out, 'games', 'reliquary.html'), 'utf8'), html, 'once, however often it runs');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the sitemap leaves out the locked routes', async () => {
  const { sitemapFor } = await import('../vite.config.js');
  const urls = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const open = urls(sitemapFor([]));
  assert.ok(open.includes('/') && open.includes('/visualizer/') && open.includes('/painter/'));
  assert.ok(open.some((u) => u.startsWith('/projects/')));
  assert.deepEqual(urls(sitemapFor(['portfolio', 'live', 'painter', 'larp', 'games'])), []);
  const some = urls(sitemapFor(['live']));
  assert.ok(!some.includes('/visualizer/') && some.includes('/painter/') && some.includes('/'));
  assert.deepEqual(urls(sitemapFor(['portfolio'])), ['/visualizer/', '/painter/']);
});

test('the lock page’s first load: never content, the renderer or three.js, and small', async () => {
  const { unlockLoad, SHOW_ONLY } = await import('../vite.config.js');
  const chunk = (fileName, modules, imports = [], extra = {}) => ({
    type: 'chunk',
    fileName,
    imports,
    code: 'x'.repeat(200),
    modules: Object.fromEntries(modules.map((id) => [id, { renderedLength: 10 }])),
    ...extra,
  });
  const lean = {
    'assets/unlock.js': chunk('assets/unlock.js', ['/r/src/gate/main.js', '/r/src/gate/crypto.js'], [], {
      isEntry: true,
      name: 'unlock',
      viteMetadata: { importedCss: new Set(['assets/unlock.css']) },
    }),
    'assets/unlock.css': { type: 'asset', fileName: 'assets/unlock.css', source: 'a{b:c}'.repeat(50) },
  };
  const r = unlockLoad(lean);
  assert.deepEqual(r.stray, []);
  assert.ok(r.gzip > 0 && r.gzip < 10 * 1024, `${r.gzip} bytes gzip`);
  const heavy = {
    ...lean,
    'assets/unlock.js': { ...lean['assets/unlock.js'], imports: ['assets/logo.js', 'assets/three.js'] },
    'assets/logo.js': chunk('assets/logo.js', ['/r/src/content.json', '/r/src/content.js', '/r/src/render.js']),
    'assets/three.js': chunk('assets/three.js', ['/r/node_modules/three/build/three.core.js']),
  };
  assert.deepEqual(unlockLoad(heavy).stray.sort(), [
    '/r/node_modules/three/build/three.core.js',
    '/r/src/content.js',
    '/r/src/content.json',
    '/r/src/render.js',
  ]);
  assert.ok(SHOW_ONLY.test('/r/src/gate/main.js'), 'the site never carries the lock page’s modules');
});

// ---- the browser specs' way past the lock ---------------------------------------------------

test('the specs’ storage state: the cookie content.json’s key opens, none without one', async () => {
  const { gateState } = await import('../e2e/lib/gateSetup.mjs');
  const key = someKey();
  const state = await gateState({ gate: lockedGate({ key }) });
  assert.deepEqual(state.origins, []);
  assert.equal(state.cookies.length, 1);
  const [c] = state.cookies;
  assert.equal(c.name, GATE_COOKIE);
  assert.equal(c.value, tokenFor(key), 'what the build checks for');
  assert.equal(c.domain, '127.0.0.1');
  assert.equal(c.path, '/');
  assert.equal(c.sameSite, 'Lax');
  assert.deepEqual((await gateState({ gate: gateDefaults() })).cookies, [], 'no key: nothing to open');
  assert.deepEqual((await gateState({})).cookies, []);
  const { readFileSync: read } = await import('node:fs');
  const config = read(new URL('../playwright.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /globalSetup:/, 'made before every run');
  assert.match(config, /storageState: GATE_STATE/, 'every context starts with it');
});
