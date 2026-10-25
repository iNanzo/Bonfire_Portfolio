// The invitation toy's text effects in the admin: content.json `invitation.text` (its colours, a
// list of {name, color}) checked by src/contentRules.js, and the tags in NEWT's lines and the
// intro's chat boxes ({red,wave|…}, src/invitation/markup.js) checked against them: an
// unbalanced or unknown tag, an unknown colour name and a bad hex are errors at the line's path,
// the length limits count the letters that show (the raw text is capped too), and content
// without `invitation.text` still passes (the built-in colours stand in). Its section on the
// Invitation page (admin/ui/schema.js): named and helped (the help shows the tag syntax),
// started from the toy's own colours, a colour added with a template, and a live preview under
// each intro box's text and each line (the same parser; the palette from the draft).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTRO_TEXT_MAX, validateContent } from '../../src/contentRules.js';
import { DEFAULT_TEXT_COLORS, paletteOf } from '../../src/invitation/markup.js';
import { LINE_MAX, TRIGGERS } from '../../src/invitation/speech.js';
import {
  ADD_LABELS,
  HELP,
  LABELS,
  PAGES,
  PREVIEWS,
  STARTERS,
  TEMPLATES,
  hint,
  moreFor,
  previewPalette,
  resolveHelp,
} from '../ui/schema.js';
import { patternOf } from '../ui/paths.js';
import { titleCase } from '../ui/text.js';

const content = () => JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
/** The content with this invitation section (the rest as content.json has it). */
const withInvitation = (inv) => ({ ...content(), invitation: inv });
const problems = (inv) => validateContent(withInvitation(inv));
const errorsAt = (inv) =>
  problems(inv)
    .errors.map((e) => e.path)
    .sort();
const box = (text) => ({ id: 'a', text, face: 'happy', animation: 'Talk', camera: 'close' });
const intro = (text) => ({ speaker: 'NEWT', start: 'a', boxes: [box(text)] });

test('content.json’s text colours pass, and content without them (or the whole section) still does', () => {
  const c = content();
  assert.ok(Array.isArray(c.invitation.text?.colors), 'content.json has its colours');
  assert.deepEqual(validateContent(c).errors, []);
  const old = content();
  delete old.invitation.text;
  assert.deepEqual(validateContent(old).errors, [], 'no invitation.text');
  assert.deepEqual(problems({ text: { colors: DEFAULT_TEXT_COLORS } }).errors, []);
  assert.deepEqual(problems({ text: {} }).errors, [], 'every part optional');
});

test('the colours: a list of {name, color}, each name its own and no effect’s, each a #rrggbb', () => {
  assert.deepEqual(errorsAt({ text: [] }), ['invitation.text']);
  assert.deepEqual(errorsAt({ text: { colors: 'red' } }), ['invitation.text.colors']);
  assert.deepEqual(errorsAt({ text: { colors: [], extra: 1 } }), ['invitation.text.extra']);
  assert.deepEqual(
    errorsAt({
      text: {
        colors: [
          { name: 'red', color: '#c8323c' },
          { name: 'red', color: '#000000' },
          { name: 'Moss', color: '#4a7a3b' },
          { name: 'wave', color: '#ffffff' },
          { name: 'sky', color: 'blue' },
          { name: 'sea', color: '#09f' },
          { name: '', color: '#123456' },
          { name: 'dusk', color: '#123456', glow: true },
          'teal',
        ],
      },
    }),
    [
      'invitation.text.colors[1].name',
      'invitation.text.colors[2].name',
      'invitation.text.colors[3].name',
      'invitation.text.colors[4].color',
      'invitation.text.colors[5].color',
      'invitation.text.colors[6].name',
      'invitation.text.colors[7].glow',
      'invitation.text.colors[8]',
    ].sort(),
  );
  const many = Array.from({ length: 25 }, (_, i) => ({ name: `c${i}`.replace(/^c/, 'c-'), color: '#123456' }));
  assert.deepEqual(errorsAt({ text: { colors: many } }), ['invitation.text.colors']);
});

test('tags in the lines and the intro: mistakes are errors at the line, checked against the section’s colours', () => {
  const at = (line) => errorsAt({ lines: { wave: [line] } });
  const boxAt = (text) => errorsAt({ intro: intro(text) });
  for (const ok of [
    'Plain *as* **it** ~was~.',
    '{red,wave|Hey!} you',
    '{#e44544|a} {#f80,big|b}',
    '\\{not a tag\\}',
    '{gold|a {shake|b} c}',
  ]) {
    assert.deepEqual(at(ok), [], ok);
    assert.deepEqual(boxAt(ok), [], ok);
  }
  for (const bad of ['{red|open', 'a } b', '{hello} you', '{blue|x}', '{#12|x}', '{red|{wave|{bold|x}}}', '{red|}']) {
    assert.deepEqual(at(bad), ['invitation.lines.wave[0]'], bad);
    assert.deepEqual(boxAt(bad), ['invitation.intro.boxes[0].text'], bad);
  }
  const msg = problems({ lines: { wave: ['{blue|x}'] } }).errors[0].message;
  assert.match(msg, /Unknown style “blue”/);
  // (The section's own colours: a name it has is fine, one it dropped isn't.)
  const own = { text: { colors: [{ name: 'moss', color: '#4a7a3b' }] } };
  assert.deepEqual(errorsAt({ ...own, lines: { wave: ['{moss|x}'] } }), []);
  assert.deepEqual(errorsAt({ ...own, lines: { wave: ['{red|x}'] } }), ['invitation.lines.wave[0]']);
  // (Choice labels and names aren't styled: braces there are only text.)
  const labelled = intro('Pick');
  labelled.boxes[0].speaker = '{red|x';
  assert.deepEqual(errorsAt({ intro: labelled }), []);
});

test('the length limits count the letters that show; the raw text is capped too', () => {
  const tagged = (n) => `{red,wave|${'a'.repeat(n)}}`;
  assert.deepEqual(errorsAt({ lines: { wave: [tagged(LINE_MAX)] } }), [], `${LINE_MAX} letters in a tag`);
  assert.deepEqual(errorsAt({ lines: { wave: [tagged(LINE_MAX + 1)] } }), ['invitation.lines.wave[0]']);
  assert.deepEqual(errorsAt({ intro: intro(tagged(INTRO_TEXT_MAX)) }), [], `${INTRO_TEXT_MAX} letters in a tag`);
  assert.deepEqual(errorsAt({ intro: intro(tagged(INTRO_TEXT_MAX + 1)) }), ['invitation.intro.boxes[0].text']);
  // (A short line under a pile of tags: too long as written.)
  const piled = '{red|a}'.repeat(60);
  assert.deepEqual(errorsAt({ lines: { wave: [piled] } }), ['invitation.lines.wave[0]']);
  assert.match(problems({ lines: { wave: [piled] } }).errors[0].message, /with its tags/);
  assert.deepEqual(errorsAt({ intro: intro('{red|a}'.repeat(120)) }), ['invitation.intro.boxes[0].text']);
  // (The warnings count letters too: a long line under tags warns only past its letters' limit.)
  assert.deepEqual(problems({ lines: { wave: [tagged(70)] } }).warnings, []);
});

// ---- its section ------------------------------------------------------------------------------

test('Text Effects is on the Invitation page, named and helped, its help showing the tags', () => {
  const page = PAGES.find((p) => p.id === 'invitation');
  assert.ok(page?.keys.includes('invitation.text'));
  for (const pattern of [
    'invitation.text',
    'invitation.text.colors',
    'invitation.text.colors[].name',
    'invitation.text.colors[].color',
  ]) {
    const label = hint(LABELS, pattern);
    assert.ok(label && titleCase(label).length <= 48, `${pattern}: a short label`);
    const help = resolveHelp(hint(HELP, pattern), {});
    assert.ok(help.length >= 12 && help.length <= 160, `${pattern}: help a sentence long (${help.length})`);
  }
  assert.equal(titleCase(LABELS['invitation.text']), 'Text Effects');
  const help = `${HELP['invitation.text']} ${HELP['invitation.text.colors']} ${moreFor('invitation.text')}`;
  for (const shown of ['{red|', '{wave|', 'shake', 'bold', 'big', '{red,wave|', '#e44544', '\\{'])
    assert.ok(help.includes(shown), `the help shows ${shown}`);
  // (The lines' and the boxes' help say they take tags.)
  assert.match(HELP['invitation.intro.boxes[].text'], /\{red,wave\|/);
  assert.match(HELP['invitation.lines'], /Text Effects/);
});

test('it starts from the toy’s own colours, and a colour is added with a name to fill in', () => {
  const start = STARTERS['invitation.text']();
  assert.deepEqual(start, { colors: DEFAULT_TEXT_COLORS });
  assert.notEqual(start.colors[0], DEFAULT_TEXT_COLORS[0], 'a copy');
  assert.deepEqual(problems({ text: start }).errors, []);
  const added = TEMPLATES['invitation.text.colors']();
  assert.deepEqual(Object.keys(added).sort(), ['color', 'name']);
  assert.match(added.color, /^#[0-9a-f]{6}$/);
  assert.equal(ADD_LABELS['invitation.text.colors'], 'color');
});

test('a live preview under each intro box’s text and each line, with the draft’s colours', () => {
  assert.ok(hint(PREVIEWS, 'invitation.intro.boxes[].text'));
  for (const k of TRIGGERS) assert.ok(hint(PREVIEWS, patternOf(['invitation', 'lines', k, 0])), k);
  for (const no of [
    'invitation.intro.boxes[].id',
    'invitation.intro.boxes[].choices[].label',
    'invitation.intro.speaker',
  ])
    assert.ok(!hint(PREVIEWS, no), `${no}: none`);
  assert.deepEqual(previewPalette({}), paletteOf(DEFAULT_TEXT_COLORS), 'none yet: the toy’s own');
  assert.deepEqual(
    [...previewPalette({ invitation: { text: { colors: [{ name: 'moss', color: '#4a7a3b' }] } } })],
    [['moss', '#4a7a3b']],
  );
});
