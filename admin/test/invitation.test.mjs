// The invitation toy's content (content.json `invitation`) in the admin: src/contentRules.js
// checks it (the default look: Pixel Size, Dithering, Outlines, the style it's built on, Motion
// and every Shader value within its control's range or choices; the speech: the quiet spell and
// each trigger's chance and cooldown within their ranges; the lines: lists of short text, at most
// 20 a trigger, none over 120 characters, a warning past 80), with each problem at its path, and
// content from before the toy (no `invitation` key) still passes. The lines here are the test's
// own: content.json's are the admin's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateContent } from '../../src/contentRules.js';
import { SHADER_CONTROLS } from '../../src/invitation/shader.js';
import { LINE_MAX, LINES_MAX, SPEECH_DEFAULTS, TRIGGERS } from '../../src/invitation/speech.js';

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

test('the section itself: a group of fields, with only its three parts', () => {
  assert.deepEqual(errorsAt('nope'), ['invitation']);
  assert.deepEqual(errorsAt([]), ['invitation']);
  assert.deepEqual(errorsAt({ ...valid(), extra: 1 }), ['invitation.extra']);
  for (const part of ['defaults', 'speech', 'lines'])
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
