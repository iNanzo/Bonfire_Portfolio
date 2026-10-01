// The knight's styles (knightStyles.js): every look he has had, selectable by one name, each
// with a label, a hint, its model and its dither; the default is one of them; the models are
// shipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STYLES, STYLE_KEYS, STYLE_NAMES, DEFAULT_STYLE, MODELS, CEL_LOOKS, styleOr, styleModel } from '../src/bonfire/knightStyles.js';

test('six styles, each named, hinted and with its look, model and dither', () => {
  assert.deepEqual(STYLE_KEYS, ['pixel-cel', 'pixel-painterly', 'pixel-chiaroscuro', 'gunmetal', 'blackgold', 'first']);
  const looks = new Set();
  for (const k of STYLE_KEYS) {
    const s = STYLES[k];
    assert.match(STYLE_NAMES[k], /^[A-Z][a-z]*( ([A-Z][a-z]*|&))*$/, `${k}: a Title Case name (${STYLE_NAMES[k]})`);
    // (One short sentence: they're joined into one tip in Bonfire Live.)
    assert.ok(typeof s.hint === 'string' && s.hint.length > 20 && s.hint.length <= 90, `${k}: a one-line hint (${s.hint.length})`);
    assert.match(s.hint, /^[A-Z][^A-Z]*\.$/u, `${k}: a sentence, in sentence case`);
    assert.ok(Object.hasOwn(MODELS, s.model), `${k}: a known model`);
    assert.equal(typeof s.finish, 'boolean');
    assert.ok(Number.isInteger(s.look) && s.look >= 0 && s.look <= 5, `${k}: a shader look`);
    assert.ok(Number.isFinite(s.dither) && s.dither >= 0 && s.dither <= 1, `${k}: a dither amount 0..1`);
    looks.add(s.look);
  }
  assert.equal(looks.size, STYLE_KEYS.length, 'each style its own look');
  // The gunmetal style shows as Smooth Steel, so it isn't taken for the Gunmetal finish (its
  // key stays: saved settings and scenes name it).
  assert.equal(STYLE_NAMES.gunmetal, 'Smooth Steel');
  assert.equal(new Set(Object.values(STYLE_NAMES)).size, STYLE_KEYS.length, 'six different names');
  assert.deepEqual(Object.values(CEL_LOOKS), ['cel', 'painterly', 'chiaroscuro']);
  for (const look of Object.keys(CEL_LOOKS)) assert.ok(STYLE_KEYS.some((k) => STYLES[k].look === Number(look)));
});

test('the default is a style; anything else falls back to it; each style names its model file', () => {
  assert.equal(DEFAULT_STYLE, 'pixel-cel', "the round-9 finals' pick: the Pixel Cel sprite");
  assert.equal(styleOr('blackgold'), 'blackgold');
  assert.equal(styleOr('gold'), DEFAULT_STYLE);
  assert.equal(styleOr(undefined), DEFAULT_STYLE);
  assert.equal(styleModel('first'), 'models/knight-first.glb');
  assert.equal(styleModel('gunmetal'), 'models/knight.glb');
  assert.equal(styleModel('nope'), styleModel(DEFAULT_STYLE));
  for (const file of Object.values(MODELS)) assert.ok(fs.existsSync(new URL(`../public/${file}`, import.meta.url)), `${file} is shipped`);
  // (The finishes are the color option only where he's drawn in steel.)
  assert.equal(STYLES.blackgold.finish, false);
  assert.equal(STYLES.first.finish, false);
  assert.equal(STYLES.gunmetal.finish, true);
});
