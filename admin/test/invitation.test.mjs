// The invitation toy's content (content.json `invitation`) in the admin: src/contentRules.js
// checks it (the default look: Pixel Size, Dithering, Outlines, the style it's built on, Motion
// and every Shader value within its control's range or choices; the speech: the quiet spell and
// each trigger's chance and cooldown within their ranges; the lines: lists of short text, at most
// 20 a trigger, none over 120 characters, a warning past 80), with each problem at its path, and
// content from before the toy (no `invitation` key) still passes. Its page (admin/ui/schema.js):
// every field named and helped, the toy's own lists as dropdowns, its ranges as sliders, the
// triggers grouped by the plan's kinds, and the search finding them there. (The intro has its
// own tests: test/invitationIntro.test.mjs for its rules and admin/test/invitationIntro.test.mjs
// for its section; the text effects too: admin/test/invitationText.test.mjs.) The lines here are the test's own:
// content.json's are the admin's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INVITATION_STYLES, validateContent } from '../../src/contentRules.js';
import { DEFAULT_LOOK, MOTIONS } from '../../src/invitation/look.js';
import { PRESETS } from '../../src/invitation/looks/index.js';
import { PIXEL_SIZES } from '../../src/invitation/pixels.js';
import { SHADER_CONTROLS, styleShader } from '../../src/invitation/shader.js';
import { LINE_MAX, LINES_MAX, SPEECH_DEFAULTS, SPEECH_RANGES, TRIGGERS } from '../../src/invitation/speech.js';
import {
  ADD_LABELS,
  HELP,
  STARTERS,
  LABELS,
  PAGES,
  SELECTS,
  SUBGROUPS,
  hint,
  keywordsFor,
  rangeFor,
  resolveHelp,
  subgroupsOf,
} from '../ui/schema.js';
import { patternOf } from '../ui/paths.js';
import { titleCase } from '../ui/text.js';

globalThis.document ??= /** @type {any} */ ({
  createElement: () => {
    throw new Error('no DOM in these tests');
  },
});
const { buildIndex, crumbsOf, pageOf } = await import('../ui/search.js');

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));

/** A whole, valid invitation section (its own words). */
const valid = () => ({
  defaults: {
    pixelSize: '128',
    dither: true,
    outlines: true,
    style: 'soft',
    motion: 'smooth',
    shader: {
      levels: 6,
      dither: 1,
      outline: 1,
      ink: 'tinted',
      ring: true,
      bands: '2',
      highlight: true,
      edge: 'soft',
      shadow: 0.6,
      turn: 0,
      light: 1,
      saturation: 0.95,
      warmth: 0,
      exposure: 1.02,
      contrast: 1,
    },
  },
  speech: {
    idleMin: 20,
    idleMax: 40,
    ...Object.fromEntries(TRIGGERS.map((k) => [k, { ...SPEECH_DEFAULTS.triggers[k] }])),
  },
  lines: Object.fromEntries(TRIGGERS.map((k) => [k, ['One line.', 'Another!']])),
});
/** The content with this invitation section. */
const withInvitation = (inv) => ({ ...content(), invitation: inv });
const problems = (inv) => validateContent(withInvitation(inv));
const errorsAt = (inv) =>
  problems(inv)
    .errors.map((e) => e.path)
    .sort();

test('content from before the toy (no invitation key) passes, and a whole valid section does', () => {
  const old = content();
  delete old.invitation;
  assert.deepEqual(validateContent(old).errors, []);
  assert.deepEqual(problems(valid()).errors, []);
  assert.deepEqual(problems(valid()).warnings, []);
  // Every part is optional: the toy falls back on its own defaults for what's missing.
  assert.deepEqual(problems({}).errors, []);
  assert.deepEqual(problems({ speech: { wave: { chance: 1, cooldown: 0 } } }).errors, []);
  assert.deepEqual(problems({ lines: { idle: [] } }).errors, []);
  assert.deepEqual(problems({ defaults: { pixelSize: 'off' } }).errors, []);
});

test('content from before the toy can still be edited: each of the Invitation page’s sections starts from the toy’s own built-in values, which pass the rules', () => {
  const keys = ['invitation.defaults', 'invitation.speech', 'invitation.lines', 'invitation.intro', 'invitation.text'];
  for (const key of keys) assert.equal(typeof STARTERS[key], 'function', `${key} has a way to start`);
  const inv = Object.fromEntries(keys.map((key) => [key.split('.')[1], STARTERS[key]()]));
  const old = content();
  delete old.invitation;
  assert.deepEqual(validateContent({ ...old, invitation: inv }).errors, [], 'all five, started');
  for (const key of keys) {
    const part = key.split('.')[1];
    assert.deepEqual(validateContent({ ...old, invitation: { [part]: inv[part] } }).errors, [], `${key} alone`);
  }
  // The defaults: the toy's built-in Default style (Soft with the Default preset's Shader values),
  // at the built-in Pixel Size and Motion.
  assert.equal(inv.defaults.pixelSize, DEFAULT_LOOK.pixelSize);
  assert.equal(inv.defaults.dither, DEFAULT_LOOK.dither);
  assert.equal(inv.defaults.outlines, DEFAULT_LOOK.outlines);
  assert.equal(inv.defaults.motion, DEFAULT_LOOK.motion);
  assert.ok(INVITATION_STYLES.includes(inv.defaults.style), inv.defaults.style);
  assert.deepEqual(inv.defaults.shader, styleShader(PRESETS.default));
  // The speech: the toy's built-in quiet spell and every trigger's chance and cooldown.
  assert.deepEqual([inv.speech.idleMin, inv.speech.idleMax], SPEECH_DEFAULTS.idleEvery);
  for (const k of TRIGGERS) assert.deepEqual(inv.speech[k], SPEECH_DEFAULTS.triggers[k], k);
  // The lines: every trigger, none yet (the toy says nothing without them, as before).
  assert.deepEqual(Object.keys(inv.lines), TRIGGERS);
  for (const k of TRIGGERS) assert.deepEqual(inv.lines[k], [], k);
  // Each start is a copy of its own.
  assert.notEqual(STARTERS['invitation.lines'](), STARTERS['invitation.lines']());
  assert.notEqual(STARTERS['invitation.defaults']().shader, STARTERS['invitation.defaults']().shader);
});

test('the section itself: a group of fields, with only its five parts', () => {
  assert.deepEqual(errorsAt('nope'), ['invitation']);
  assert.deepEqual(errorsAt([]), ['invitation']);
  assert.deepEqual(errorsAt({ ...valid(), extra: 1 }), ['invitation.extra']);
  for (const part of ['defaults', 'speech', 'lines', 'intro', 'text'])
    assert.deepEqual(errorsAt({ ...valid(), [part]: [] }), [`invitation.${part}`], `${part}: a group`);
});

test('the default look: Pixel Size, the switches, its style and Motion from their lists', () => {
  const v = valid();
  v.defaults.pixelSize = 128;
  v.defaults.dither = 'yes';
  v.defaults.outlines = 1;
  v.defaults.style = 'gameboy';
  v.defaults.motion = 'jerky';
  v.defaults.colour = 'red';
  assert.deepEqual(
    errorsAt(v),
    [
      'invitation.defaults.colour',
      'invitation.defaults.dither',
      'invitation.defaults.motion',
      'invitation.defaults.outlines',
      'invitation.defaults.pixelSize',
      'invitation.defaults.style',
    ].sort(),
  );
  const msg = (path) => problems(v).errors.find((e) => e.path === path).message;
  assert.match(msg('invitation.defaults.pixelSize'), /128/, 'names the sizes it can be');
  assert.match(msg('invitation.defaults.style'), /soft/);
  for (const ok of ['16', '256', 'native', 'off']) {
    const w = valid();
    w.defaults.pixelSize = ok;
    assert.deepEqual(errorsAt(w), [], ok);
  }
  const ds = valid();
  ds.defaults.style = 'ds';
  ds.defaults.motion = 'choppy';
  assert.deepEqual(errorsAt(ds), []);
});

test('the default look’s Shader values: each within its control’s range, steps or choices', () => {
  for (const c of SHADER_CONTROLS) {
    const bad = valid();
    const v = c.kind === 'switch' ? 'on' : c.kind === 'choice' ? 'sparkly' : c.steps ? 5 : Number(c.max) + 1;
    bad.defaults.shader[c.key] = v;
    assert.deepEqual(errorsAt(bad), [`invitation.defaults.shader.${c.key}`], `${c.key}: ${v} is refused`);
    const good = valid();
    good.defaults.shader[c.key] =
      c.kind === 'switch' ? false : c.kind === 'choice' ? c.options.at(-1).value : c.steps ? c.steps.at(-1) : c.min;
    assert.deepEqual(errorsAt(good), [], `${c.key}: its last choice or lowest value is fine`);
    if (c.kind === 'range') {
      const word = valid();
      word.defaults.shader[c.key] = 'high';
      assert.deepEqual(errorsAt(word), [`invitation.defaults.shader.${c.key}`], `${c.key}: a number`);
    }
  }
  // Pixel Shirt & Face, the one switch Pixel Shirt and Pixel Face split from (the toy reads it
  // as both, look.js LEGACY_SHADER): a switch still, with a warning to set the two instead.
  const legacy = valid();
  legacy.defaults.shader.pixelArt = true;
  assert.deepEqual(errorsAt(legacy), [], 'the old switch is still read');
  assert.deepEqual(
    problems(legacy).warnings.map((w) => w.path),
    ['invitation.defaults.shader.pixelArt'],
    'with a warning at it',
  );
  const legacyBad = valid();
  legacyBad.defaults.shader.pixelArt = 'on';
  assert.deepEqual(errorsAt(legacyBad), ['invitation.defaults.shader.pixelArt'], 'only on or off');
  const unknown = valid();
  unknown.defaults.shader.bloom = 1;
  assert.deepEqual(errorsAt(unknown), ['invitation.defaults.shader.bloom']);
  const notGroup = valid();
  notGroup.defaults.shader = 'soft';
  assert.deepEqual(errorsAt(notGroup), ['invitation.defaults.shader']);
});

test('speech: the quiet spell and each trigger’s chance and cooldown in range; unknown triggers refused', () => {
  const v = valid();
  v.speech.idleMin = 2;
  v.speech.idleMax = 'long';
  v.speech.wave.chance = 1.5;
  v.speech.spook.cooldown = -1;
  v.speech.flee = 'often';
  v.speech.caught.volume = 3;
  v.speech.dancing = { chance: 1, cooldown: 1 };
  assert.deepEqual(
    errorsAt(v),
    [
      'invitation.speech.caught.volume',
      'invitation.speech.dancing',
      'invitation.speech.flee',
      'invitation.speech.idleMax',
      'invitation.speech.idleMin',
      'invitation.speech.spook.cooldown',
      'invitation.speech.wave.chance',
    ].sort(),
  );
  const backwards = valid();
  backwards.speech.idleMin = 50;
  backwards.speech.idleMax = 30;
  assert.deepEqual(errorsAt(backwards), ['invitation.speech.idleMax'], 'the longest at least the shortest');
  const half = valid();
  delete half.speech.wave.cooldown;
  assert.deepEqual(errorsAt(half), [], 'a missing value takes the default');
});

test('lines: lists of short text, at most 20 a trigger; a long one is a warning', () => {
  const v = valid();
  v.lines.wave = 'Hi!';
  v.lines.spook = ['Boo!', '', 7];
  v.lines.flee = Array.from({ length: LINES_MAX + 1 }, (_, i) => `Line ${i}`);
  v.lines.landed = ['x'.repeat(LINE_MAX + 1)];
  v.lines.dancing = ['La la'];
  assert.deepEqual(
    errorsAt(v),
    [
      'invitation.lines.dancing',
      'invitation.lines.flee',
      'invitation.lines.landed[0]',
      'invitation.lines.spook[1]',
      'invitation.lines.spook[2]',
      'invitation.lines.wave',
    ].sort(),
  );
  const ok = valid();
  ok.lines.flee = Array.from({ length: LINES_MAX }, (_, i) => `Line ${i}`);
  ok.lines.landed = ['x'.repeat(LINE_MAX)];
  const r = problems(ok);
  assert.deepEqual(r.errors, [], `${LINES_MAX} lines, ${LINE_MAX} characters: fine`);
  assert.deepEqual(
    r.warnings.map((w) => w.path),
    ['invitation.lines.landed[0]'],
    'but that long a line wraps a lot in his bubble',
  );
  // (Characters, not UTF-16 units: an emoji is one.)
  const emoji = valid();
  emoji.lines.wave = ['🦎'.repeat(LINE_MAX)];
  assert.deepEqual(errorsAt(emoji), []);
});

// ---- its page ---------------------------------------------------------------------------------

/** Every path in the invitation section (groups and fields), as the editor walks it. */
function walk(v, path = ['invitation'], out = []) {
  out.push(path);
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i], out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...path, k], out);
  return out;
}

test('the Invitation page: the default look, the speech, the lines, the text effects and the intro, in a group of their own', () => {
  const page = PAGES.find((p) => p.id === 'invitation');
  assert.ok(page, 'a page of its own');
  assert.equal(titleCase(page.label), 'Invitation');
  assert.deepEqual(page.keys, [
    'invitation.defaults',
    'invitation.speech',
    'invitation.lines',
    'invitation.text',
    'invitation.intro',
  ]);
  assert.ok(page.blurb.length >= 12 && page.blurb.length <= 160, 'a blurb');
  assert.ok(!PAGES.filter((p) => p.id !== 'invitation').some((p) => p.group === page.group), 'its own group');
  for (const k of page.keys) assert.equal(pageOf(`${k}.x`).id, 'invitation', `${k}: found on it`);
});

test('every field on it is named and helped (no name made from its key)', () => {
  const inv = content().invitation;
  for (const path of walk(inv)) {
    if (typeof path.at(-1) === 'number') continue; // (a line in a list: the list's name)
    const pattern = patternOf(path);
    if (pattern === 'invitation') continue;
    const label = hint(LABELS, pattern);
    assert.ok(label, `${pattern}: a label of its own`);
    assert.ok(titleCase(label).length <= 48, `${pattern}: a short label`);
    const help = resolveHelp(hint(HELP, pattern), {});
    assert.ok(help.length >= 12 && help.length <= 160, `${pattern}: help a sentence long (${help.length})`);
    assert.notEqual(help.toLowerCase(), titleCase(label).toLowerCase(), `${pattern}: more than its label`);
  }
  // Each Shader option goes by the Look menu's own name.
  for (const c of SHADER_CONTROLS) assert.equal(LABELS[`invitation.defaults.shader.${c.key}`], c.label);
  // …and has help of its own, not the stand-in a control added to the Look menu gets.
  for (const c of SHADER_CONTROLS) {
    const help = resolveHelp(hint(HELP, `invitation.defaults.shader.${c.key}`), {});
    assert.ok(!/as the Look menu’s Shader section shows it/.test(help), `${c.key}: help of its own`);
  }
  assert.ok(keywordsFor('invitation.lines').includes('speech bubble'), 'found by what it is');
});

test('the toy’s own lists are dropdowns: Pixel Size, the style, Motion and the Shader choices', () => {
  const d = content();
  const values = (path) => SELECTS[path](d).map((o) => o.value);
  const labels = (path) => SELECTS[path](d).map((o) => o.label);
  assert.deepEqual(values('invitation.defaults.pixelSize'), PIXEL_SIZES);
  assert.deepEqual(labels('invitation.defaults.pixelSize'), [
    ...PIXEL_SIZES.filter((v) => /^\d+$/.test(v)).map((v) => `${v}×${v}`),
    'Native',
    'Off',
  ]);
  assert.deepEqual(values('invitation.defaults.style'), INVITATION_STYLES);
  assert.deepEqual(
    labels('invitation.defaults.style'),
    INVITATION_STYLES.map((k) => PRESETS[k].label),
  );
  assert.deepEqual(values('invitation.defaults.motion'), MOTIONS);
  assert.deepEqual(labels('invitation.defaults.motion'), ['Smooth', 'Choppy']);
  for (const c of SHADER_CONTROLS) {
    const path = `invitation.defaults.shader.${c.key}`;
    if (c.kind === 'choice') {
      assert.deepEqual(
        values(path),
        c.options.map((o) => o.value),
        c.key,
      );
      assert.deepEqual(
        labels(path),
        c.options.map((o) => o.spoken ?? o.label),
      );
    } else if (c.steps) {
      assert.deepEqual(values(path), c.steps, `${c.key}: its steps`);
      assert.deepEqual(
        labels(path),
        c.steps.map((v) => c.text(v)[0]),
      );
    } else assert.equal(SELECTS[path], undefined, `${c.key}: not a dropdown`);
  }
});

test('the ranges are sliders: the Shader options’, each chance and cooldown, the quiet spell', () => {
  for (const c of SHADER_CONTROLS) {
    const r = rangeFor(`invitation.defaults.shader.${c.key}`);
    if (c.kind !== 'range' || c.steps) assert.equal(r, undefined, c.key);
    else assert.deepEqual(r.slice(0, 3), [c.min, c.max, c.step], c.key);
  }
  assert.equal(rangeFor('invitation.defaults.shader.turn')[3], '°');
  assert.deepEqual(rangeFor('invitation.speech.idleMin'), SPEECH_RANGES.idle);
  assert.deepEqual(rangeFor('invitation.speech.idleMax'), SPEECH_RANGES.idle);
  for (const k of TRIGGERS) {
    assert.deepEqual(rangeFor(`invitation.speech.${k}.chance`), SPEECH_RANGES.chance, k);
    assert.deepEqual(rangeFor(`invitation.speech.${k}.cooldown`), SPEECH_RANGES.cooldown, k);
  }
  // (The effects' own ranges still come from where they always did.)
  assert.ok(rangeFor('effects.fire.size'));
});

test('the speech and the lines go under the plan’s kinds, every trigger in one, nothing left over', () => {
  const kinds = ['Reactions', 'Running', 'Carried', 'Moving', 'Sitting', 'Passive', 'Camera'];
  const inv = content().invitation;
  for (const key of ['invitation.speech', 'invitation.lines']) {
    const groups = subgroupsOf(key, Object.keys(inv[key.split('.')[1]]));
    assert.deepEqual(
      groups.map((g) => titleCase(g.label)),
      kinds,
      `${key}: no More group`,
    );
    assert.deepEqual(
      groups
        .flatMap((g) => g.keys)
        .filter((k) => TRIGGERS.includes(k))
        .sort(),
      [...TRIGGERS].sort(),
    );
  }
  assert.deepEqual(SUBGROUPS['invitation.speech'].find((g) => g.label === 'Passive').keys, [
    'idleMin',
    'idleMax',
    'idle',
  ]);
  assert.deepEqual(SUBGROUPS['invitation.lines'].find((g) => g.label === 'Carried').keys, [
    'pickedUp',
    'shaken',
    'thrash',
    'dropped',
    'landed',
  ]);
  // (Screen Time's two moments go with sitting: he sits down with the tablet, then lies down with it.)
  assert.deepEqual(SUBGROUPS['invitation.lines'].find((g) => g.label === 'Sitting').keys, [
    'sitDown',
    'sitting',
    'standUp',
    'device',
    'lieDown',
  ]);
  // Each of round 16's moments named and helped, and in content.json with lines of its own.
  const now = content().invitation;
  for (const k of ['thrash', 'device', 'lieDown']) {
    assert.ok(titleCase(LABELS[`invitation.speech.${k}`] ?? '').length > 3, `${k}: named`);
    assert.ok(now.speech[k] && now.lines[k]?.length >= 3 && now.lines[k].length <= 6, `${k}: 3–6 starter lines`);
  }
  for (const k of TRIGGERS) assert.equal(titleCase(hint(ADD_LABELS, `invitation.lines.${k}`)), 'Line', k);
});

test('the search finds the invitation’s fields on its page, under its kinds', () => {
  const index = buildIndex(content());
  const at = (id) => index.find((e) => e.id === id);
  assert.equal(at('invitation.lines.wave').page, 'invitation');
  assert.deepEqual(crumbsOf(at('invitation.speech.shaken.chance')), [
    'Invitation',
    'Speech',
    'Carried',
    titleCase(LABELS['invitation.speech.shaken']),
  ]);
  assert.equal(at('invitation.defaults.shader.levels').label, 'Colors');
});
