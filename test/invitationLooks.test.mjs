// The invitation toy's two look presets (src/invitation/looks/) after the judge's notes, read
// at real speed on a phone with the orbit camera: the default style in one place
// (looks/index.js), no smooth blob smear under him while he stands (the cast shadow is his
// shadow; the blob only shows, as a flat pixel shape, while he's lifted), a coarser texture mip
// so his shirt doesn't alias into a patchwork, dithers that show (the Dithering switch does
// something you can see in every style) yet stay light enough not to crawl over him as he
// moves, and a soft shadow's edge no wider than a texel, so it doesn't shimmer as the camera
// turns. Neither sets the grid: the Pixel Size alone does (pixels.js), whatever the Style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STYLE, PRESETS } from '../src/invitation/looks/index.js';
import { DEFAULT_LOOK, LOOKS, STYLES } from '../src/invitation/look.js';
import { floorLook } from '../src/invitation/floor.js';

test('the presets in one place, the default style among them: DS', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['ds', 'soft']);
  assert.equal(DEFAULT_STYLE, 'ds');
  assert.ok(Object.hasOwn(PRESETS, DEFAULT_STYLE));
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(LOOKS[name], p, `look.js offers ${name} as it is`);
  // look.js reads both from here: the list and the Style the Look menu starts on.
  assert.equal(LOOKS, PRESETS, 'look.js offers looks/index.js’s presets');
  assert.deepEqual(STYLES, Object.keys(PRESETS));
  assert.equal(DEFAULT_LOOK.style, DEFAULT_STYLE);
});

test('no smooth blob under him while he stands; while he’s lifted it shows', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    const { blob } = floorLook(p);
    assert.equal(blob.opacity, 0, `${name}: standing, his cast shadow is the only one`);
    assert.ok(blob.lifted > 0.15, `${name}: lifted, a blob marks where he'd land (${blob.lifted})`);
  }
});

test('his textures sample a coarser mip, so the toon bands shade him, not the texture’s noise; less so at the fine resolutions, where the glb’s plaid has the texels to resolve', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    assert.ok(p.texture.mipBias >= 1 && p.texture.mipBias <= 2.5, `${name}: mip bias ${p.texture.mipBias}`);
    assert.ok(
      p.texture.fineMipBias >= 0 && p.texture.fineMipBias < p.texture.mipBias && p.texture.fineMipBias <= 1,
      `${name}: fine mip bias ${p.texture.fineMipBias}`,
    );
  }
});

test('Dithering shows in every style, yet stays light enough not to crawl over him at real speed; soft shadows a texel wide at most', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    // (A pixel the dither flips moves a whole level: at 64 levels that's 4/255, which no one
    // sees, and DS's switch did nothing to the eye. A level of 1/40 or more, and a dither that
    // reaches 0.15 of a level or more either way, show as a fine checker.)
    assert.ok(p.levels - 1 <= 40, `${name}: a level is ${(255 / (p.levels - 1)).toFixed(1)}/255`);
    assert.ok(p.dither * 0.47 >= 0.15, `${name}: the dither reaches ${(p.dither * 0.47).toFixed(2)} of a level`);
    assert.ok(p.dither <= 0.5, `${name}: dither ${p.dither}, light enough not to crawl`);
  }
  assert.ok(PRESETS.soft.levels >= 24, `Soft keeps its dither in the soft gradients (${PRESETS.soft.levels} levels)`);
  for (const [name, p] of Object.entries(PRESETS)) {
    assert.ok((p.shadow.soft ?? 0) <= 1, `${name}: a shadow edge of ${p.shadow.soft} texels`);
    assert.equal(p.animFps, 0, `${name}: smooth motion by default (choppy is an option)`);
  }
});

test('no preset sets the grid: the Pixel Size alone does, so every Style gives NEWT the same texels', () => {
  for (const [name, p] of Object.entries(PRESETS)) assert.equal('texels' in p, false, `${name} carries a texel table`);
});

test('DS grades him close to neutral, so his skin and trousers keep their own colours at the pixel sizes', () => {
  // (Off draws him ungraded; a warm tint and extra saturation turned his skin orange and his
  // dark grey trousers brown at 2×, 3× and 4×.)
  const { grade } = PRESETS.ds;
  const tint = [1, 3, 5].map((i) => Number.parseInt(grade.tint.slice(i, i + 2), 16) / 255);
  assert.ok(Math.max(...tint) - Math.min(...tint) <= 0.025, `a near-white tint (${grade.tint})`);
  assert.ok(grade.saturation >= 0.95 && grade.saturation <= 1.06, `saturation ${grade.saturation}`);
  assert.ok(grade.exposure <= 1.04, `exposure ${grade.exposure}: his skin doesn't clip`);
});
