// The invitation toy's text effects (src/invitation/markup.js): {a,b|text} tags in a line, read
// into styled runs, the letters that show (an emoji is one) and the plain text; a backslash
// escapes a brace; colours from the palette or hex, effects wave, shake, bold and big; one level
// of nesting; every mistake an error (and the text still shows, as plain as it can); a line
// clipped by its letters stays well formed; and the letter plan the dialogue box and the bubble
// build their spans from (words with a styled letter kept whole, each letter's index). The moves
// in markup.css keep a shaken or waved word legible: a letter only ever steps sideways one way, a
// pixel at most, so it never runs more than a pixel into its neighbour whatever their phases
// (e2e/invitationDialogue.spec.mjs measures the drawn boxes), and a shake's jitter is a pixel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TEXT_COLORS,
  TEXT_EFFECTS,
  clipMarkup,
  letterCount,
  letterPlan,
  paletteOf,
  parseMarkup,
  plainText,
} from '../src/invitation/markup.js';

const palette = paletteOf(DEFAULT_TEXT_COLORS);
const red = palette.get('red');

test('plain text is one unstyled run, its letters and plain text as written', () => {
  const p = parseMarkup('Oh, hi! I’m NEWT.', palette);
  assert.equal(p.plain, 'Oh, hi! I’m NEWT.');
  assert.equal(p.letters.length, 'Oh, hi! I’m NEWT.'.length);
  assert.deepEqual(p.errors, []);
  assert.equal(p.runs.length, 1);
  assert.equal(p.runs[0].style, null);
});

test('the content’s own *, ** and ~ stay literal: only braces make a tag', () => {
  const s = '*wave* **bold** ~shake~ a|b';
  const p = parseMarkup(s, palette);
  assert.equal(p.plain, s);
  assert.deepEqual(p.errors, []);
});

test('a colour tag: its letters coloured, the tag itself unseen', () => {
  const p = parseMarkup('I’m {red|NEWT}!', palette);
  assert.equal(p.plain, 'I’m NEWT!');
  assert.deepEqual(p.errors, []);
  assert.deepEqual(
    p.runs.map((r) => [r.text, r.style]),
    [
      ['I’m ', null],
      ['NEWT', { color: red }],
      ['!', null],
    ],
  );
});

test('hex colours, #rgb and #rrggbb, any case', () => {
  for (const [hex, want] of [
    ['#e44544', '#e44544'],
    ['#E44544', '#e44544'],
    ['#f80', '#f80'],
  ]) {
    const p = parseMarkup(`{${hex}|x}`, palette);
    assert.deepEqual(p.errors, [], hex);
    assert.equal(p.runs[0].style?.color, want, hex);
  }
});

test('effects, and colour with effects in one tag ({red,wave|…}); spaces round the commas are fine', () => {
  assert.deepEqual(TEXT_EFFECTS, ['wave', 'shake', 'bold', 'big']);
  for (const fx of TEXT_EFFECTS) assert.deepEqual(parseMarkup(`{${fx}|x}`, palette).runs[0].style, { [fx]: true });
  const p = parseMarkup('{red, wave ,BIG|hey}', palette);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.runs[0].style, { color: red, wave: true, big: true });
});

test('one level of nesting: the inner tag adds to the outer (its colour wins); deeper is an error', () => {
  const p = parseMarkup('{red|a {gold,wave|b} c}', palette);
  assert.deepEqual(p.errors, []);
  assert.equal(p.plain, 'a b c');
  assert.deepEqual(
    p.runs.map((r) => [r.text, r.style]),
    [
      ['a ', { color: red }],
      ['b', { color: palette.get('gold'), wave: true }],
      [' c', { color: red }],
    ],
  );
  const deep = parseMarkup('{red|{wave|{bold|x}}}', palette);
  assert.equal(deep.plain, 'x');
  assert.equal(deep.errors.length, 1);
  assert.match(deep.errors[0].message, /one level/i);
});

test('a backslash escapes a brace; elsewhere it is a backslash', () => {
  const p = parseMarkup('\\{red|no\\} and {red|\\{yes\\}} a\\b', palette);
  assert.deepEqual(p.errors, []);
  assert.equal(p.plain, '{red|no} and {yes} a\\b');
  assert.equal(p.runs.find((r) => r.style)?.text, '{yes}');
});

test('an emoji counts as one letter, a flag and a family too', () => {
  assert.equal(letterCount('hi 👋🏽'), 4);
  assert.equal(letterCount('{wave|🇻🇳👨‍👩‍👧}'), 2);
  assert.equal(parseMarkup('{big|é👍}', palette).letters.length, 2);
});

test('mistakes are errors, and the line still reads: stray braces literal, unknown styles plain', () => {
  const cases = [
    ['{red|never closed', /never closes/i, 'never closed'],
    ['a } b', /no tag to close/i, 'a } b'],
    ['{hello} you', /needs \|/i, '{hello} you'],
    ['{blue|x}', /unknown style/i, 'x'],
    ['{#12|x}', /hex/i, 'x'],
    ['{#ggg|x}', /hex/i, 'x'],
    ['{red,gold|x}', /one colou?r/i, 'x'],
    ['{red|}', /no text/i, ''],
    ['{red,|x}', /empty style|unknown style/i, 'x'],
  ];
  for (const [src, re, plain] of cases) {
    const p = parseMarkup(src, palette);
    assert.ok(p.errors.length >= 1, `${src}: an error`);
    assert.ok(
      p.errors.some((e) => re.test(e.message)),
      `${src}: ${p.errors.map((e) => e.message).join(' / ')}`,
    );
    for (const e of p.errors) assert.ok(e.message.length <= 160 && /[.!?]$/.test(e.message), e.message);
    assert.equal(p.plain, plain, src);
  }
  // (An unknown name leaves the letters unstyled.)
  assert.equal(parseMarkup('{blue|x}', palette).runs[0].style, null);
});

test('without a palette, names are left unchecked (letters and plain text are the same either way)', () => {
  const p = parseMarkup('{blue,wave|x}');
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.runs[0].style, { wave: true });
  assert.equal(plainText('{blue,wave|hey} you'), 'hey you');
  assert.equal(letterCount('{blue,wave|hey} you'), 7);
});

test('the palette: valid entries only, names lowercased, the first of a name kept', () => {
  const p = paletteOf([
    { name: 'Moss', color: '#4A7a3b' },
    { name: 'moss', color: '#000000' },
    { name: 'wave', color: '#ffffff' },
    { name: 'bad', color: 'red' },
    { name: '', color: '#123456' },
    null,
    'x',
  ]);
  assert.deepEqual([...p], [['moss', '#4a7a3b']]);
  assert.deepEqual(
    DEFAULT_TEXT_COLORS.map((c) => c.name),
    ['red', 'gold', 'rose', 'ink'],
  );
});

test('clipMarkup keeps the first n letters and stays well formed', () => {
  assert.equal(clipMarkup('hello', 10), 'hello');
  assert.equal(clipMarkup('hello', 3), 'hel');
  const c = clipMarkup('ab {red,wave|cdef} gh', 4);
  assert.equal(plainText(c), 'ab c');
  assert.deepEqual(parseMarkup(c, palette).errors, []);
  assert.deepEqual(parseMarkup(c, palette).runs.at(-1)?.style, { color: red, wave: true });
  const esc = clipMarkup('\\{x\\} {gold|\\{y\\}}', 5);
  assert.equal(plainText(esc), '{x} {');
  assert.deepEqual(parseMarkup(esc, palette).errors, []);
});

test('the letter plan: every letter with its index; a word with a styled letter kept whole', () => {
  const plan = letterPlan(parseMarkup('go {red,wave|NE}WT now', palette));
  const flat = plan.flatMap((g) => g.letters);
  assert.deepEqual(
    flat.map((l) => l.i),
    flat.map((_, i) => i),
  );
  assert.equal(flat.map((l) => l.ch).join(''), 'go NEWT now');
  const word = plan.find((g) => g.letters.map((l) => l.ch).join('') === 'NEWT');
  assert.ok(word?.whole, 'NEWT kept whole');
  assert.deepEqual(
    word.letters.map((l) => l.style),
    [{ color: red, wave: true }, { color: red, wave: true }, null, null],
  );
  assert.ok(!plan.find((g) => g.letters.map((l) => l.ch).join('') === 'now')?.whole, 'a plain word wraps as text does');
  // (Spaces and line breaks stand alone, between the words.)
  const lines = letterPlan(parseMarkup('a\n{big|b}', palette));
  assert.deepEqual(
    lines.map((g) => g.letters.map((l) => l.ch).join('')),
    ['a', '\n', 'b'],
  );
});

/**
 * markup.css's moves: each @keyframes inv-fx-* as its frames' offsets, from `transform:
 * translate(x, y)` (or translateX, translateY) or the `translate: x y` property, a length as px
 * plus em ({px, em}: '1px', '-0.12em', '0').
 */
function fxKeyframes() {
  const css = readFileSync(new URL('../src/invitation/markup.css', import.meta.url), 'utf8');
  const len = (s) => {
    const m = /^(-?[\d.]+)(px|em)?$/.exec(s.trim());
    assert.ok(m, `a length: ${s}`);
    const v = Number(m[1]);
    assert.ok(m[2] || v === 0, `a unit: ${s}`);
    return m[2] === 'em' ? { px: 0, em: v } : { px: v, em: 0 };
  };
  const zero = { px: 0, em: 0 };
  /** @type {Map<string, {at: number, x: {px: number, em: number}, y: {px: number, em: number}}[]>} */
  const out = new Map();
  for (const [, name, body] of css.matchAll(/@keyframes\s+(inv-fx-[\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    const frames = [...body.matchAll(/([\d.]+)%\s*\{\s*(transform|translate):\s*([^;]+);\s*\}/g)].map(
      ([, at, prop, v]) => {
        if (prop === 'translate') {
          const [x, y] = v.trim().split(/\s+/).map(len);
          return { at: Number(at), x, y: y ?? zero };
        }
        const m = /^translate(X|Y)?\(([^)]*)\)$/.exec(v.trim());
        assert.ok(m, `${name} ${at}%: a translation (${v})`);
        const [a, b] = m[2].split(',').map(len);
        if (m[1] === 'Y') return { at: Number(at), x: zero, y: a };
        return { at: Number(at), x: a, y: (m[1] ? null : b) ?? zero };
      },
    );
    out.set(name, frames);
  }
  return out;
}

test('a shaken or waved letter steps sideways one way only, a pixel at most (both at once too), so it never runs more than a pixel into a neighbour; a shake jitters a pixel', () => {
  const moves = fxKeyframes();
  for (const name of ['inv-fx-wave', 'inv-fx-shake'])
    assert.ok(moves.get(name)?.length >= 4, `${name}: stepped frames`);
  let most = 0;
  for (const [name, frames] of moves) {
    // (In px, not em: a big letter's step is the same pixel. One way: two neighbours a step apart
    // close by that step, never by two.)
    for (const f of frames) {
      assert.equal(f.x.em, 0, `${name} ${f.at}%: a sideways step in px`);
      assert.ok(f.x.px >= 0, `${name} ${f.at}%: sideways ${f.x.px}px, never to the left`);
    }
    most += Math.max(0, ...frames.map((f) => f.x.px));
  }
  // (A letter can run every move at once: their steps add up.)
  assert.ok(most <= 1, `every move's step across together: ${most}px, a pixel at most`);
  const shake = moves.get('inv-fx-shake') ?? [];
  for (const f of shake) {
    assert.equal(f.y.em, 0, `shake ${f.at}%: its jitter in px`);
    assert.ok(Math.abs(f.y.px) <= 1, `shake ${f.at}%: up or down ${f.y.px}px, a pixel at most`);
  }
  // (The shake moves at all: a pixel across and a pixel up and down.)
  assert.ok(new Set(shake.map((f) => f.x.px)).size >= 2, 'the shake steps across');
  assert.ok(new Set(shake.map((f) => f.y.px)).size >= 2, 'the shake steps up and down');
});
