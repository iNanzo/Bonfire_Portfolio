// The invitation toy's two look presets (src/invitation/looks/) after the judge's notes, read
// at real speed on a phone with the orbit camera: the default style in one place
// (looks/index.js), no smooth blob smear under him while he stands (the cast shadow is his
// shadow; the blob only shows, as a flat pixel shape, while he's lifted), a coarser texture mip
// so his shirt doesn't alias into a patchwork, dithers light enough not to crawl over him as he
// moves, and a soft shadow's edge no wider than a texel, so it doesn't shimmer as the camera
// turns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STYLE, PRESETS } from '../src/invitation/looks/index.js';
import { LOOKS } from '../src/invitation/look.js';
import { floorLook } from '../src/invitation/floor.js';

test('the presets in one place, the default style among them: DS', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['ds', 'soft']);
  assert.equal(DEFAULT_STYLE, 'ds');
  assert.ok(Object.hasOwn(PRESETS, DEFAULT_STYLE));
  for (const [name, p] of Object.entries(PRESETS)) assert.equal(LOOKS[name], p, `look.js offers ${name} as it is`);
});

test('no smooth blob under him while he stands; while he’s lifted it shows', () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    const { blob } = floorLook(p);
    assert.equal(blob.opacity, 0, `${name}: standing, his cast shadow is the only one`);
    assert.ok(blob.lifted > 0.15, `${name}: lifted, a blob marks where he'd land (${blob.lifted})`);
  }
});

test('his textures sample a coarser mip, so the toon bands shade him, not the texture’s noise', () => {
  for (const [name, p] of Object.entries(PRESETS))
    assert.ok(p.texture.mipBias >= 1 && p.texture.mipBias <= 2.5, `${name}: mip bias ${p.texture.mipBias}`);
});

test('dithers light enough not to crawl over him at real speed; soft shadows a texel wide at most', () => {
  assert.ok(PRESETS.ds.dither > 0 && PRESETS.ds.dither <= 0.3, `DS dither ${PRESETS.ds.dither}`);
  assert.ok(PRESETS.soft.levels >= 24, `Soft keeps its dither in the soft gradients (${PRESETS.soft.levels} levels)`);
  assert.ok(PRESETS.soft.dither <= 0.4, `Soft dither ${PRESETS.soft.dither}`);
  for (const [name, p] of Object.entries(PRESETS)) {
    assert.ok((p.shadow.soft ?? 0) <= 1, `${name}: a shadow edge of ${p.shadow.soft} texels`);
    assert.equal(p.animFps, 0, `${name}: smooth motion by default (choppy is an option)`);
  }
});

test('Soft’s head has room for a face: more texels than DS’s three quarters', () => {
  // (main.js frames NEWT by DS's texel count; Soft's head is DS's × soft / ds texels wide.)
  for (const size of ['fine', 'ds', 'chunky'])
    assert.ok(PRESETS.soft.texels[size] >= 0.9 * PRESETS.ds.texels[size], `Soft ${size}: ${PRESETS.soft.texels[size]}`);
});
