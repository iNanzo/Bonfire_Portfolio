// The display faces' coverage (src/larp/fonts.js, U01): a string is set in Cinzel or Pixelify Sans
// only when the face covers every character, else all of it in Inter, never single letters. The
// ranges are checked against the @fontsource CSS files src/tokens.css actually imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACE_RANGES, GAME_FONTS, covers, displayFace, parseUnicodeRange, warmFonts } from '../src/larp/fonts.js';

/** Every unicode-range in a @fontsource CSS file, as [lo, hi] pairs. */
function rangesIn(path) {
  const css = readFileSync(new URL(`../node_modules/@fontsource/${path}`, import.meta.url), 'utf8');
  return [...css.matchAll(/unicode-range:\s*([^;]+);/g)].flatMap((m) => parseUnicodeRange(m[1]));
}
const key = (ranges) => ranges.map(([lo, hi]) => `${lo}-${hi}`).sort();

test('the ranges are the installed @fontsource subsets (the weights tokens.css imports)', () => {
  const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
  for (const [face, file] of [
    ['cinzel', 'cinzel/500.css'],
    ['cinzel', 'cinzel/600.css'],
    ['pixelify', 'pixelify-sans/400.css'],
    ['pixelify', 'pixelify-sans/500.css'],
  ]) {
    assert.ok(tokens.includes(`@fontsource/${file}`), `tokens.css imports ${file}`);
    assert.deepEqual(key(FACE_RANGES[face]), key(rangesIn(file)), `${face} matches ${file}`);
  }
});

test('the design examples: Vietnamese tone marks fall back to Inter, whole strings only', () => {
  assert.equal(displayFace('Đội Phaolô', 'cinzel'), 'inter', 'ộ (U+1ED9) is outside Cinzel');
  assert.equal(displayFace('Team Paul', 'cinzel'), 'cinzel');
  assert.equal(displayFace('Phaolô', 'cinzel'), 'cinzel', 'ô is Latin-1');
  assert.equal(displayFace('Lửa Trại', 'cinzel'), 'inter', 'ử and ạ are outside Cinzel');
  assert.equal(displayFace('Lửa Trại', 'pixelify'), 'inter');
  assert.equal(displayFace('ĐỘI', 'cinzel'), 'inter');
  assert.equal(displayFace('Đức', 'cinzel'), 'inter', 'ứ (U+1EE9)');
  assert.equal(displayFace('Đan', 'cinzel'), 'cinzel', 'Đ alone is Latin Extended-A');
  assert.equal(displayFace('Ỳ', 'cinzel'), 'cinzel', 'U+1EF2 is in the latin-ext subset');
});

test('decomposed input counts as its composed letters; anything outside every subset falls back', () => {
  assert.equal(covers('Phaolô', 'cinzel'), true, 'o + combining circumflex is ô');
  assert.equal(covers('Trại', 'cinzel'), false, 'a + dot below is ạ');
  assert.equal(covers('', 'cinzel'), true);
  assert.equal(covers('+75 · 1:12 −25', 'pixelify'), true, 'digits, signs, the middle dot and U+2212');
  assert.equal(covers('Привет', 'pixelify'), true, 'Pixelify Sans has Cyrillic');
  assert.equal(covers('Привет', 'cinzel'), false);
  assert.equal(covers('🔥', 'cinzel'), false);
  assert.equal(covers('Anything ử', 'inter'), true);
  assert.equal(covers('abc', 'comic'), false, 'an unknown face covers nothing');
  assert.equal(displayFace('abc', 'inter'), 'inter');
  assert.equal(covers(/** @type {any} */ (null), 'cinzel'), true, 'nothing to draw');
});

test('parseUnicodeRange reads single points and spans', () => {
  assert.deepEqual(parseUnicodeRange('U+0000-00FF, U+0131 ,U+1E00-1E9F'), [
    [0, 255],
    [0x131, 0x131],
    [0x1e00, 0x1e9f],
  ]);
  assert.deepEqual(parseUnicodeRange(''), []);
});

test('warmFonts asks for every face and weight the CSS uses, with every subset, and never throws', async () => {
  const asked = [];
  await warmFonts({
    load: (font, text) => {
      asked.push([font, text]);
      if (font.includes('Cinzel')) throw new Error('offline');
      return Promise.resolve([]);
    },
  });
  assert.equal(asked.length, GAME_FONTS.length);
  assert.ok(asked.some(([f]) => f === '600 1em Inter'));
  assert.ok(asked.every(([, text]) => /ộ/.test(text) && /ĕ/.test(text) && /A/.test(text)));
  await warmFonts(null);
  await warmFonts({ load: () => Promise.reject(new Error('x')) });
  // The faces tokens.css imports are all warmed.
  const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
  for (const [, family, weight] of tokens.matchAll(/@fontsource\/([a-z-]+)\/(\d+)(?:-italic)?\.css/g)) {
    const name = family === 'pixelify-sans' ? '"Pixelify Sans"' : family[0].toUpperCase() + family.slice(1);
    assert.ok(
      GAME_FONTS.some(([f]) => f.endsWith(`${weight} 1em ${name}`)),
      `${family} ${weight} is warmed`,
    );
  }
});
