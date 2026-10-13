// The invitation toy's look (pure parts): the pixel grid (src/invitation/pixels.js) in whole
// device pixels on the phones and the desktop the round checks, Pixel Size Off at native size
// (its DPR capped at 2), the camera framing NEWT 36 to 40 texels tall at the default size with
// the floor clear of the toolbar and the side edges, the Bayer matrix the retro pass dithers
// with, the Look settings (src/invitation/look.js) surviving any storage, and the presets
// (src/invitation/looks/) carrying every look value, so a designer only ever edits data. With
// three.js in Node: the room (room.js), the surface ids and the retro pass's order and uniforms
// (retro.js, a stand-in renderer); and the toolbar's and Look sheet's markup (ui.js).
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
import * as THREE from 'three';
import {
  DEFAULT_LOOK,
  LOOKS,
  LOOK_KEY,
  STYLES,
  loadLook,
  presetOf,
  saveLook,
  validLook,
} from '../src/invitation/look.js';
import { createRoom, roomBounds } from '../src/invitation/room.js';
import { ID, createRetro, decalMaterial, markId } from '../src/invitation/retro.js';
import { BUTTONS, parseQuery, sheetHtml, statusHtml, toolbarHtml } from '../src/invitation/ui.js';

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

test('the room: its side walls at the width’s edges, the preset’s colours, shadows taken and never cast', () => {
  const room = createRoom(LOOKS.ds);
  room.setWidth(4.2);
  assert.equal(room.width, 4.2);
  assert.deepEqual(room.bounds, roomBounds(4.2));
  const walls = room.group.children.filter((m) => m.geometry.type === 'PlaneGeometry');
  const sides = walls.filter((m) => Math.abs(m.rotation.y) > 1);
  assert.deepEqual(
    sides.map((m) => m.position.x).sort((a, b) => a - b),
    [-2.1, 2.1],
  );
  for (const m of room.group.children) {
    assert.equal(m.receiveShadow, true);
    assert.equal(m.castShadow, false);
  }
  room.setLook(LOOKS.soft);
  const floor = walls.find((m) => Math.abs(m.rotation.x) > 1);
  assert.equal(`#${floor.material.color.getHexString()}`, LOOKS.soft.room.floor);
  assert.equal(floor.material.gradientMap.image.width, LOOKS.soft.toon.length, 'the preset’s toon bands');
  assert.doesNotThrow(() => room.dispose());
});

test('surface ids: a marked material writes its id into alpha last; what’s drawn over the floor keeps it', () => {
  const m = markId(new THREE.MeshToonMaterial(), ID.floor);
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: THREE.ShaderLib.toon.fragmentShader };
  m.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.uSurfaceId.value, ID.floor / 16);
  assert.match(shader.fragmentShader, /uniform float uSurfaceId;\s*uniform float uIdOn;\s*void main\(\) \{/);
  // (After every include that writes gl_FragColor: three's toon shader still ends that way.)
  assert.match(
    shader.fragmentShader,
    /#include <dithering_fragment>\s*gl_FragColor\.a = mix\(1\.0, uSurfaceId, uIdOn\);\s*\}\s*$/,
  );
  assert.equal(m.customProgramCacheKey(), 'invitation-surface-id');
  const decal = decalMaterial({ opacity: 0.2 });
  assert.equal(decal.depthWrite, false, 'no depth written: no lines');
  assert.equal(decal.blendSrcAlpha, THREE.ZeroFactor);
  assert.equal(decal.blendDstAlpha, THREE.OneFactor, 'the id under it is kept');
  assert.equal(new Set(Object.values(ID)).size, Object.keys(ID).length, 'every surface its own id');
});

test('the retro pass: the colour pass then the post pass, Off straight to the canvas, the settings in its uniforms', () => {
  const calls = [];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 80);
  const renderer = {
    setRenderTarget: (t) => calls.push(t ? 'target' : 'canvas'),
    setClearColor: (c, alpha) => calls.push(`clear ${alpha}`),
    clear: () => {},
    render: (s) => calls.push(s === scene ? 'scene' : 'post'),
  };
  const retro = createRetro(renderer);
  retro.setSize(195, 422);
  retro.setParams(LOOKS.ds, DEFAULT_LOOK);
  retro.render(scene, camera);
  assert.deepEqual(calls, ['target', 'clear 0', 'scene', 'canvas', 'post'], 'nothing drawn is alpha 0: id 0');
  const u = retro.uniforms;
  assert.deepEqual([u.uRes.value.x, u.uRes.value.y], [195, 422]);
  assert.equal(u.uLevels.value, LOOKS.ds.levels);
  assert.equal(u.uDither.value, LOOKS.ds.dither);
  assert.equal(u.uOutline.value, 1);
  assert.equal(u.uBayer.value, BAYER4);
  retro.setParams(LOOKS.soft, { ...DEFAULT_LOOK, dither: false, outlines: false, style: 'soft' });
  assert.equal(u.uDither.value, 0, 'Dithering off');
  assert.equal(u.uOutline.value, 0, 'Outlines off');
  assert.equal(u.uLevels.value, LOOKS.soft.levels);
  calls.length = 0;
  retro.setParams(LOOKS.ds, { ...DEFAULT_LOOK, pixelSize: 'off' });
  assert.equal(retro.pixel, false);
  retro.render(scene, camera);
  assert.deepEqual(calls, ['canvas', 'clear 1', 'scene'], 'Pixel Size Off: the scene straight to the canvas');
  assert.doesNotThrow(() => retro.dispose());
});

test('the toolbar and the Look sheet: every button labelled, the settings checked, no tooltips', () => {
  const bar = toolbarHtml();
  for (const name of [...BUTTONS, 'Look']) assert.match(bar, new RegExp(`>${name}</button>`), name);
  assert.match(bar, /data-button="Wander" aria-pressed="false"/);
  const sheet = sheetHtml({ pixelSize: 'chunky', dither: false, outlines: true, style: 'soft' });
  assert.match(sheet, /value="chunky" data-look="pixelSize" checked/);
  assert.match(sheet, /value="soft" data-look="style" checked/);
  assert.doesNotMatch(sheet, /data-look="dither" checked/);
  assert.match(sheet, /data-look="outlines" checked/);
  assert.match(sheet, /data-off-hint hidden/, 'the Off hint only shows at Pixel Size Off');
  assert.doesNotMatch(sheetHtml({ ...DEFAULT_LOOK, pixelSize: 'off' }), /data-off-hint hidden/);
  assert.equal([...sheet.matchAll(/data-look="pixelSize"/g)].length, PIXEL_SIZES.length);
  for (const html of [bar, sheet, statusHtml()]) assert.doesNotMatch(html, /\stitle=/, 'no title= tooltips');
  // Labels in Title Case (the hints are sentences).
  const labels = [...`${bar}${sheet}`.matchAll(/>([^<>]+)</g)]
    .map((m) => m[1].trim())
    .filter((t) => t && !/[.:]/.test(t));
  for (const label of labels) assert.match(label, /^[A-Z0-9][^ ]*( [A-Z][^ ]*)*$/, label);
  assert.equal(presetOf({ ...DEFAULT_LOOK, style: 'soft' }), LOOKS.soft);
  assert.deepEqual(parseQuery('?test&seed=42&calm'), { test: true, seed: 42, calm: true, perf: false });
  assert.deepEqual(parseQuery(''), { test: false, seed: null, calm: false, perf: false });
});
