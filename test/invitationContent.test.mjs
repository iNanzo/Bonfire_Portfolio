// The invitation toy's content: content.json's `invitation` key, which the admin edits (its
// Invitation page). It passes the content rules (src/contentRules.js), content from before the
// toy (no key) still does, it carries every trigger's speech settings and lines (the words are
// the admin's: never pinned here), and its default look is one the toy shows as stored (look.js
// validLook keeps every value, each Shader value on its control).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateContent } from '../src/contentRules.js';
import {
  DEFAULT_LOOK,
  LOOKS,
  installDefaults,
  isCustom,
  loadLook,
  shaderOf,
  validLook,
} from '../src/invitation/look.js';
import { SHADER_CONTROLS } from '../src/invitation/shader.js';
import { TRIGGERS, linesFrom, speechFrom } from '../src/invitation/speech.js';

const content = () => JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8'));

test('content.json’s invitation passes the rules; content from before it still does', () => {
  const c = content();
  assert.ok(c.invitation, 'the key is there');
  const r = validateContent(c);
  assert.deepEqual(
    r.errors.filter((e) => e.path.startsWith('invitation')),
    [],
  );
  assert.deepEqual(r.errors, []);
  delete c.invitation;
  assert.deepEqual(validateContent(c).errors, []);
});

test('it carries every trigger’s chance, cooldown and lines, all read as they are', () => {
  const inv = content().invitation;
  for (const k of TRIGGERS) {
    assert.equal(typeof inv.speech[k]?.chance, 'number', `${k}: its chance`);
    assert.equal(typeof inv.speech[k]?.cooldown, 'number', `${k}: its cooldown`);
    assert.ok(Array.isArray(inv.lines[k]), `${k}: its lines`);
  }
  // The toy reads them without dropping or changing a thing.
  const s = speechFrom(inv.speech);
  assert.deepEqual(s.idleEvery, [inv.speech.idleMin, inv.speech.idleMax]);
  for (const k of TRIGGERS) assert.deepEqual(s.triggers[k], inv.speech[k]);
  assert.deepEqual(
    linesFrom(inv.lines),
    Object.fromEntries(TRIGGERS.map((k) => [k, inv.lines[k].map((l) => l.trim())])),
  );
});

test('its default look is one the toy shows as stored: every value kept, every Shader option set', () => {
  const d = content().invitation.defaults;
  const look = validLook(d);
  for (const k of ['pixelSize', 'dither', 'outlines', 'style', 'motion']) assert.equal(look[k], d[k], k);
  assert.deepEqual(Object.keys(d.shader).sort(), SHADER_CONTROLS.map((c) => c.key).sort(), 'every option');
  assert.deepEqual(shaderOf(look), d.shader, 'each on its control, as stored');
});

test('its default look is what a first visit sees: the Default style with the admin’s values, never Custom', () => {
  const d = content().invitation.defaults;
  const builtIn = LOOKS.default;
  try {
    const first = installDefaults(d);
    assert.deepEqual(loadLook({ getItem: () => null }), first);
    for (const k of ['pixelSize', 'dither', 'outlines', 'motion']) assert.equal(first[k], d[k], k);
    assert.equal(first.style, 'default');
    assert.equal(isCustom(first), false);
    assert.deepEqual(shaderOf(first), d.shader, 'every Shader value the admin’s');
    assert.equal(LOOKS.default.background, LOOKS[d.style].background, 'the colours of the style it’s built on');
  } finally {
    installDefaults({});
  }
  assert.equal(LOOKS.default, builtIn);
  assert.deepEqual(loadLook({ getItem: () => null }), { ...DEFAULT_LOOK });
});

// ---- the toy's way in: virtual:invitation-content (vite.config.js) and content.js ------------

/** Every import specifier in a module's source (static, side-effect, dynamic, JSDoc types). */
const specifiers = (code) =>
  [
    ...code.matchAll(
      /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g,
    ),
  ].map((m) => m[1] ?? m[2] ?? m[3]);

test('the toy imports only three.js, its GLTFLoader, its font, its own modules and its content', async () => {
  const { readdirSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../src/invitation/', import.meta.url));
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.js'))
    .map((f) => path.join(f.parentPath, f.name));
  assert.ok(files.length > 20);
  const seen = new Set();
  for (const file of files)
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      seen.add(spec);
      if (spec.startsWith('.')) {
        const to = path.relative(dir, path.resolve(path.dirname(file), spec));
        assert.ok(!to.startsWith('..'), `${path.basename(file)}: ${spec} stays in src/invitation/`);
      } else
        assert.match(
          spec,
          /^(three|three\/examples\/jsm\/loaders\/GLTFLoader\.js|@fontsource\/pixelify-sans\/\d+\.css|virtual:invitation-content)$/,
          `${path.basename(file)}: ${spec}`,
        );
    }
  assert.ok(seen.has('virtual:invitation-content'), 'its content through the virtual module');
  assert.ok(![...seen].some((s) => /content\.json$/.test(s)), 'never content.json itself');
});

test('virtual:invitation-content: only the invitation subtree, read from content.json and watched', async () => {
  const { invitationContent } = await import('../vite.config.js');
  const { fileURLToPath } = await import('node:url');
  const file = fileURLToPath(new URL('../src/content.json', import.meta.url));
  const plugin = invitationContent(file);
  const id = plugin.resolveId('virtual:invitation-content');
  assert.equal(id, '\0virtual:invitation-content');
  assert.equal(plugin.resolveId('./content.json'), null);
  const watched = [];
  const code = plugin.load.call({ addWatchFile: (f) => watched.push(f) }, id);
  assert.deepEqual(watched, [file], 'an edit to content.json reloads it');
  const mod = await import(`data:text/javascript,${encodeURIComponent(code)}`);
  assert.deepEqual(mod.default, content().invitation, 'the invitation subtree…');
  assert.ok(!/"projects"|"effects"|"hero"/.test(code), '…and nothing else of content.json');
  assert.equal(plugin.load.call({ addWatchFile() {} }, 'other'), null);
  // Content from before the toy: an empty section (content.js falls back).
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(`${tmpdir()}/inv-`);
  try {
    const old = content();
    delete old.invitation;
    writeFileSync(`${dir}/content.json`, JSON.stringify(old));
    const bare = invitationContent(`${dir}/content.json`).load.call({ addWatchFile() {} }, id);
    assert.deepEqual((await import(`data:text/javascript,${encodeURIComponent(bare)}`)).default, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the portfolio’s own content.json import leaves the invitation and the lock out (weight in every visit)', async () => {
  const { invitationContent } = await import('../vite.config.js');
  const { fileURLToPath } = await import('node:url');
  const file = fileURLToPath(new URL('../src/content.json', import.meta.url));
  const plugin = invitationContent(file);
  const text = readFileSync(file, 'utf8');
  const posix = file.replaceAll(String.fromCharCode(92), '/');
  for (const id of [file, posix, `${posix}?import`]) {
    const out = plugin.transform(text, id);
    const c = JSON.parse(out.code);
    assert.equal(c.invitation, undefined, id);
    // (The lock's words and key are the build's and the lock page's: the site never reads them.)
    assert.equal(c.gate, undefined, id);
    const rest = content();
    delete rest.invitation;
    delete rest.gate;
    assert.deepEqual(c, rest, 'the rest as it is');
  }
  const onlyGate = content();
  delete onlyGate.invitation;
  assert.equal(JSON.parse(plugin.transform(JSON.stringify(onlyGate), file).code).gate, undefined, 'the lock alone too');
  assert.equal(plugin.transform('{"a":1}', '/elsewhere/content.json'), null, 'another file is left alone');
  assert.equal(plugin.transform('export {}', `${posix.replace(/\.json$/, '.js')}`), null);
});

test('content.js: the lines, the speech settings and the default look, with fallbacks', async () => {
  const { register } = await import('node:module');
  const sub = JSON.stringify(content().invitation);
  const hooks = `export async function resolve(spec, ctx, next) {
    if (spec === 'virtual:invitation-content')
      return { url: 'data:text/javascript,' + encodeURIComponent('export default ' + ${JSON.stringify(sub)}), shortCircuit: true };
    return next(spec, ctx);
  }`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
  const { introFrom, invitationDefaults, invitationLines, readContent, speechSettings } =
    await import('../src/invitation/content.js');
  const inv = content().invitation;
  assert.deepEqual(invitationLines(), linesFrom(inv.lines));
  assert.deepEqual(speechSettings(), speechFrom(inv.speech));
  assert.deepEqual(invitationDefaults(), inv.defaults);
  invitationDefaults().shader.levels = 99;
  assert.equal(invitationDefaults().shader.levels, inv.defaults.shader.levels, 'a copy each time');
  // Missing or broken: no lines (he stays quiet), the built-in speech, the built-in look, the
  // toy's own intro (test/invitationIntro.test.mjs has the intro).
  for (const raw of [undefined, null, 'x', {}, { lines: 'x', speech: 3, defaults: [], intro: 'x' }])
    assert.deepEqual(
      readContent(raw),
      { lines: {}, speech: speechFrom(undefined), defaults: {}, intro: introFrom(undefined) },
      String(raw),
    );
  assert.deepEqual(
    readContent({ defaults: { pixelSize: 128, dither: 'yes', outlines: false, style: 'soft', shader: 'x', extra: 1 } })
      .defaults,
    { outlines: false, style: 'soft' },
    'each field kept only with the right type (look.js validLook checks the values)',
  );
});
