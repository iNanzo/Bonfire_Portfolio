// The invitation toy's look (pure parts): the pixel grid (src/invitation/pixels.js) in whole
// device pixels on the phones and the desktop the round checks, Pixel Size Off at native size
// (its DPR capped at 2), the camera framing NEWT 36 to 40 texels tall at the default size with
// the floor clear of the toolbar and the side edges, the Bayer matrix the retro pass dithers
// with, the Look settings (src/invitation/look.js) surviving any storage, and the presets
// (src/invitation/looks/) carrying every look value, so a designer only ever edits data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAYER4,
  DEFAULT_PIXEL,
  NATIVE_DPR,
  PIXEL_SIZES,
  ROOM,
  frameView,
  headTexels,
  newtTexels,
  project,
  texelGrid,
} from '../src/invitation/pixels.js';
import { DEFAULT_LOOK, LOOKS, LOOK_KEY, STYLES, loadLook, saveLook, validLook } from '../src/invitation/look.js';
import { roomBounds } from '../src/invitation/room.js';

const SIZES = [
  [390, 844, 3],
  [412, 915, 2.625],
  [1280, 800, 1],
];
/** Where the floor must stay: under a top margin, over the toolbar, clear of the side edges. */
const INSETS = { top: 16, bottom: 72, left: 24, right: 24 };
const preset = LOOKS[DEFAULT_LOOK.style];

test('the pixel grid is whole device pixels at 390x844@3, 412x915@2.625 and 1280x800@1', () => {
  for (const [cssW, cssH, dpr] of SIZES) {
    for (const pixelSize of PIXEL_SIZES.filter((p) => p !== 'off')) {
      const g = texelGrid({ cssW, cssH, dpr, pixelSize, texels: preset.texels });
      const at = `${cssW}x${cssH}@${dpr} ${pixelSize}`;
      assert.ok(Number.isInteger(g.pd) && g.pd >= 1, `${at}: a texel is ${g.pd} whole device pixels`);
      assert.equal(g.dpr, dpr);
      assert.ok(g.w * g.pd >= cssW * dpr && (g.w - 1) * g.pd < cssW * dpr, `${at}: the width just covers the stage`);
      assert.ok(g.h * g.pd >= cssH * dpr && (g.h - 1) * g.pd < cssH * dpr, `${at}: the height just covers the stage`);
      assert.ok(Math.abs(g.canvasW * dpr - g.w * g.pd) < 1e-6, `${at}: the canvas is whole device pixels wide`);
      assert.ok(Math.abs(g.canvasH * dpr - g.h * g.pd) < 1e-6, `${at}: and tall`);
      const short = Math.min(g.w, g.h);
      const want = preset.texels[pixelSize];
      assert.ok(Math.abs(short - want) / want < 0.12, `${at}: ${short} texels on the short side, about ${want}`);
      assert.equal(g.native, false);
    }
  }
});

test('Pixel Size Off draws at native size, its DPR capped at 2', () => {
  const at = (cssW, cssH, dpr) => texelGrid({ cssW, cssH, dpr, pixelSize: 'off', texels: preset.texels });
  assert.equal(NATIVE_DPR, 2);
  assert.deepEqual((({ pd, dpr, w, h, native }) => ({ pd, dpr, w, h, native }))(at(390, 844, 3)), {
    pd: 1,
    dpr: 2,
    w: 780,
    h: 1688,
    native: true,
  });
  const g = at(412, 915, 2.625);
  assert.deepEqual([g.w, g.h, g.dpr], [824, 1830, 2]);
  const d = at(1280, 800, 1);
  assert.deepEqual([d.w, d.h, d.pd, d.dpr, d.canvasW, d.canvasH], [1280, 800, 1, 1, 1280, 800]);
  // A device-pixel box the browser measured wins over CSS × DPR (where it can say).
  const m = texelGrid({ cssW: 390, cssH: 844, dpr: 3, devW: 1171, devH: 2532, pixelSize: 'ds', texels: preset.texels });
  assert.equal(m.w, Math.ceil(1171 / m.pd));
});

test('NEWT is 36 to 40 texels tall at the default size, on a phone and on a desktop', () => {
  for (const [cssW, cssH, dpr] of SIZES) {
    const grid = texelGrid({ cssW, cssH, dpr, pixelSize: DEFAULT_LOOK.pixelSize, texels: preset.texels });
    const view = frameView({ cssW, cssH, dpr, grid, insets: INSETS, texels: preset.texels[DEFAULT_PIXEL] });
    const at = `${cssW}x${cssH}@${dpr}`;
    const tall = newtTexels(view, grid);
    assert.ok(tall >= 36 && tall <= 40, `${at}: NEWT is ${tall.toFixed(1)} texels tall`);
    assert.ok(headTexels(view, grid) > 10, `${at}: his head is ${headTexels(view, grid).toFixed(1)} texels wide`);
    assert.ok(view.roomWidth >= ROOM.minWidth && view.roomWidth <= ROOM.maxWidth, `${at}: room ${view.roomWidth}`);
    // The floor stays clear of the side edges and the toolbar; a third of the back wall at least
    // shows (on a wide screen its top runs off the top, as an Animal Crossing room's does).
    const front = ROOM.depth / 2;
    const left = project(view, { x: -view.roomWidth / 2, y: 0, z: front });
    const right = project(view, { x: view.roomWidth / 2, y: 0, z: front });
    const top = project(view, { x: 0, y: ROOM.wall / 3, z: -front });
    assert.ok(
      left.x >= INSETS.left - 0.5 && right.x <= cssW - INSETS.right + 0.5,
      `${at}: floor ${left.x}..${right.x}`,
    );
    assert.ok(left.y <= cssH - INSETS.bottom + 0.5, `${at}: the floor's front edge (${left.y}) is over the toolbar`);
    assert.ok(top.y >= INSETS.top - 0.5, `${at}: a third of the back wall (${top.y}) shows`);
    assert.ok(view.elevation === 48 && Math.abs(view.fov - 30) < 1e-6, 'about 30° of view, 48° up');
  }
});

test('the framing stays the same whatever the pixel size: NEWT just has more or fewer texels', () => {
  const [cssW, cssH, dpr] = SIZES[0];
  const tall = {};
  for (const pixelSize of ['fine', 'ds', 'chunky']) {
    const grid = texelGrid({ cssW, cssH, dpr, pixelSize, texels: preset.texels });
    const view = frameView({ cssW, cssH, dpr, grid, insets: INSETS, texels: preset.texels[DEFAULT_PIXEL] });
    tall[pixelSize] = newtTexels(view, grid);
  }
  assert.ok(tall.fine > tall.ds && tall.ds > tall.chunky, JSON.stringify(tall));
});

test('the Bayer matrix is normalised', () => {
  assert.equal(BAYER4.length, 16);
  const sorted = [...BAYER4].sort((a, b) => a - b);
  sorted.forEach((v, i) => assert.ok(Math.abs(v - (i + 0.5) / 16) < 1e-6, `threshold ${i}`));
  assert.ok(Math.abs(BAYER4.reduce((s, v) => s + v, 0) / 16 - 0.5) < 1e-6, 'its mean is a half');
  // Every 2×2 block takes one threshold from each quarter of the range (an ordered dither).
  for (const [x, y] of [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ]) {
    const block = [BAYER4[y * 4 + x], BAYER4[y * 4 + x + 1], BAYER4[(y + 1) * 4 + x], BAYER4[(y + 1) * 4 + x + 1]];
    assert.deepEqual(block.map((v) => Math.floor(v * 4)).sort(), [0, 1, 2, 3]);
  }
});

/** A storage stand-in: `get` and `set` behave as asked. */
const store = (get, set = () => {}) => ({ getItem: get, setItem: set });

test('Look settings survive storage that is empty, broken or throws', () => {
  assert.deepEqual(loadLook(store(() => null)), DEFAULT_LOOK, 'empty: the defaults');
  assert.deepEqual(loadLook(store(() => '{"pixelSize":')), DEFAULT_LOOK, 'broken JSON: the defaults');
  assert.deepEqual(loadLook(store(() => '[1,2]')), DEFAULT_LOOK, 'not an object: the defaults');
  assert.deepEqual(
    loadLook(
      store(() => {
        throw new Error('SecurityError');
      }),
    ),
    DEFAULT_LOOK,
    'throws: the defaults',
  );
  assert.deepEqual(loadLook(null), DEFAULT_LOOK, 'no storage at all');
  assert.deepEqual(
    loadLook(store(() => JSON.stringify({ pixelSize: 'huge', dither: 'yes', outlines: false, style: 'soft' }))),
    { ...DEFAULT_LOOK, outlines: false, style: 'soft' },
    'each value checked on its own: the good ones kept',
  );
  // Saving: the key, the round trip, and a storage that refuses.
  let saved = null;
  const ok = saveLook(
    { ...DEFAULT_LOOK, pixelSize: 'chunky' },
    store(
      () => saved,
      (k, v) => (saved = [k, v]),
    ),
  );
  assert.equal(ok, true);
  assert.equal(saved[0], LOOK_KEY);
  assert.equal(LOOK_KEY, 'invitation.look.v1');
  assert.deepEqual(loadLook(store(() => saved[1])), { ...DEFAULT_LOOK, pixelSize: 'chunky' });
  const refused = saveLook(
    DEFAULT_LOOK,
    store(
      () => null,
      () => {
        throw new Error('QuotaExceededError');
      },
    ),
  );
  assert.equal(refused, false);
  assert.deepEqual(validLook(undefined), DEFAULT_LOOK);
  assert.ok(PIXEL_SIZES.includes(DEFAULT_LOOK.pixelSize) && STYLES.includes(DEFAULT_LOOK.style));
});

test('every look preset carries every look value (a designer edits data, never code)', () => {
  const colour = /^#[0-9a-f]{6}$/i;
  assert.deepEqual(Object.keys(LOOKS).sort(), [...STYLES].sort());
  for (const [name, p] of Object.entries(LOOKS)) {
    const at = (k) => `${name}: ${k}`;
    assert.ok(typeof p.label === 'string' && p.label.length > 0, at('label'));
    for (const size of ['fine', 'ds', 'chunky'])
      assert.ok(p.texels[size] >= 64 && p.texels[size] <= 400, at(`texels.${size}`));
    assert.ok(p.texels.fine > p.texels.ds && p.texels.ds > p.texels.chunky, at('texels: fine > ds > chunky'));
    assert.ok(Number.isInteger(p.levels) && p.levels >= 2 && p.levels <= 256, at('levels'));
    assert.ok(p.dither >= 0 && p.dither <= 1, at('dither'));
    assert.ok(p.outline.darken >= 0 && p.outline.darken <= 1, at('outline.darken'));
    assert.match(p.outline.tint, colour, at('outline.tint'));
    assert.ok(p.outline.depth > 0, at('outline.depth'));
    for (const k of ['lift', 'gamma', 'saturation', 'exposure'])
      assert.equal(typeof p.grade[k], 'number', at(`grade.${k}`));
    assert.match(p.grade.tint, colour, at('grade.tint'));
    assert.ok(p.toon.length >= 2 && p.toon.every((v) => v >= 0 && v <= 1), at('toon bands'));
    assert.ok(['basic', 'pcf', 'vsm'].includes(p.shadow.type), at('shadow.type'));
    assert.ok(p.shadow.mapSize >= 256, at('shadow.mapSize'));
    assert.equal(p.sun.dir.length, 3, at('sun.dir'));
    assert.match(p.sun.color, colour, at('sun.color'));
    assert.ok(p.sun.intensity > 0, at('sun.intensity'));
    assert.match(p.hemi.sky, colour, at('hemi.sky'));
    assert.match(p.hemi.ground, colour, at('hemi.ground'));
    assert.ok(p.hemi.intensity >= 0, at('hemi.intensity'));
    for (const k of ['background', 'floor', 'wall', 'side', 'baseboard'])
      assert.match(p.room[k], colour, at(`room.${k}`));
    assert.ok(p.blob.opacity >= 0 && p.blob.lifted >= p.blob.opacity, at('blob'));
    assert.match(p.marker.color, colour, at('marker.color'));
    assert.equal(p.animFps, 0, at('animFps (choppy motion stays off until Stop 1)'));
  }
});

test('NEWT’s bounds stay inside the walls and the front edge, by his radius', () => {
  for (const width of [ROOM.minWidth, 4.4, ROOM.maxWidth]) {
    const b = roomBounds(width);
    assert.ok(b.minX >= -width / 2 + 0.2 && b.maxX <= width / 2 - 0.2, `width ${width}: x`);
    assert.ok(b.minZ >= -ROOM.depth / 2 + 0.2 && b.maxZ <= ROOM.depth / 2 - 0.2, `width ${width}: z`);
    assert.ok(b.maxX - b.minX > 2.5 && b.maxZ - b.minZ > 3, `width ${width}: room to walk`);
  }
});
