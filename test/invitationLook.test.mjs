// The invitation toy's look (pure parts): the pixel grid (src/invitation/pixels.js) in whole
// device pixels on the phones and the desktop the round checks, Pixel Size Off at native size
// (its DPR capped at 2), the camera framing NEWT about a fifth of the screen's short side tall
// whatever the Pixel Size (76 CSS px on a 390-wide phone: 38 texels at the default size), low
// enough to see his face, standing in the middle of the space over the toolbar, the Bayer matrix
// the retro pass dithers with, the Look settings (src/invitation/look.js) surviving any storage,
// and the presets (src/invitation/looks/) carrying every look value, so a designer only ever
// edits data. With three.js in Node: the floor (floor.js: invisible, it only catches his
// shadows; there's no room), the surface ids and the retro pass's order and uniforms (retro.js,
// a stand-in renderer); and the toolbar's and Look sheet's markup (ui.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAYER4,
  NATIVE_DPR,
  NEWT_SHARE,
  PIXEL_SIZES,
  VIEW,
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
import { FLOOR_SIZE, createFloor, floorLook } from '../src/invitation/floor.js';
import { ID, createRetro, decalMaterial, markId } from '../src/invitation/retro.js';
import { BUTTONS, parseQuery, sheetHtml, statusHtml, toolbarHtml } from '../src/invitation/ui.js';
import { NEWT_RADIUS, playArea } from '../src/invitation/area.js';

const SIZES = [
  [390, 844, 3],
  [412, 915, 2.625],
  [1280, 800, 1],
];
/** Where the floor must stay: under a top margin, over the toolbar, clear of the side edges. */
const INSETS = { top: 16, bottom: 72, left: 24, right: 24 };
const preset = LOOKS[DEFAULT_LOOK.style];
/** The play area and his body at its rim, as the stage frames it. */
const AREA = (playArea().r ?? 0) + NEWT_RADIUS;
/** NEWT's height on screen, CSS px: his texels × a texel's CSS size. */
const cssTall = (view, grid) => (newtTexels(view, grid) * grid.pd) / grid.dpr;

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

test('NEWT is about a fifth of the short side on a phone and on a desktop: 76 CSS px and 38 texels at the default size on a 390-wide phone', () => {
  assert.ok(NEWT_SHARE >= 0.18 && NEWT_SHARE <= 0.21, `a share of ${NEWT_SHARE}`);
  for (const [cssW, cssH, dpr] of SIZES) {
    const grid = texelGrid({ cssW, cssH, dpr, pixelSize: DEFAULT_LOOK.pixelSize, texels: preset.texels });
    const view = frameView({ cssW, cssH, grid, insets: INSETS });
    const at = `${cssW}x${cssH}@${dpr}`;
    const share = cssTall(view, grid) / Math.min(cssW, cssH);
    assert.ok(Math.abs(share - NEWT_SHARE) < 0.002, `${at}: NEWT is ${(share * 100).toFixed(1)}% of the short side`);
    assert.ok(headTexels(view, grid) > 10, `${at}: his head is ${headTexels(view, grid).toFixed(1)} texels wide`);
    // He starts in the middle of the space over the toolbar (the play area is all the floor
    // around him: area.js), seen from low enough that his cap's brim leaves his face showing.
    const middle = project(view, { x: 0, y: 0.5, z: 0 });
    assert.ok(Math.abs(middle.x - cssW / 2) < 1.5, `${at}: centred across (${middle.x})`);
    assert.ok(
      Math.abs(middle.y - (INSETS.top + cssH - INSETS.bottom) / 2) < 1.5,
      `${at}: halfway down the space over the toolbar (${middle.y})`,
    );
    assert.equal(view.elevation, VIEW.elevation);
    assert.ok(view.elevation >= 30 && view.elevation <= 36, `about 30–36° up (${view.elevation}°)`);
    assert.ok(view.fov === VIEW.fov && view.fov >= 15 && view.fov <= 30, `a narrow view (${view.fov}°)`);
    assert.equal('roomWidth' in view, false, 'no room');
  }
  // Today's framing on the phone the round checks: 76 CSS px, 38 texels at the default size.
  const grid = texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: DEFAULT_LOOK.pixelSize, texels: preset.texels });
  const view = frameView({ cssW: 390, cssH: 844, grid, insets: INSETS, area: AREA });
  assert.ok(Math.abs(cssTall(view, grid) - 76) < 1, `390x844@3: NEWT is ${cssTall(view, grid).toFixed(1)} CSS px tall`);
  const tall = newtTexels(view, grid);
  assert.ok(tall >= 37 && tall <= 39, `390x844@3: NEWT is ${tall.toFixed(1)} texels tall at the default size`);
});

test('the framing stays the same whatever the pixel size: NEWT just has more or fewer texels', () => {
  for (const [cssW, cssH, dpr] of SIZES) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const css = [];
    const tall = [];
    for (const pixelSize of PIXEL_SIZES) {
      const grid = texelGrid({ cssW, cssH, dpr, pixelSize, texels: preset.texels });
      const view = frameView({ cssW, cssH, grid, insets: INSETS, area: AREA });
      css.push(cssTall(view, grid));
      tall.push(newtTexels(view, grid));
    }
    const sizes = css.map((v) => v.toFixed(1)).join(', ');
    assert.ok(Math.max(...css) - Math.min(...css) < 0.5, `${at}: NEWT is ${sizes} CSS px tall at ${PIXEL_SIZES}`);
    // Off first, then bigger and bigger blocks: fewer and fewer texels.
    for (let i = 1; i < tall.length; i++)
      assert.ok(tall[i] < tall[i - 1], `${at}: ${tall.map((v) => v.toFixed(1))} texels at ${PIXEL_SIZES}`);
  }
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
    // The scene: a background, the shadows the invisible floor catches and the blob shadow
    // (floorLook reads them, with fallbacks while a preset still has the room's colours).
    const f = floorLook(p);
    assert.ok(Number.isInteger(f.background) && f.background >= 0 && f.background <= 0xffffff, at('background'));
    assert.ok(Number.isInteger(f.shadow.color) && f.shadow.opacity > 0 && f.shadow.opacity <= 1, at('shadow'));
    assert.ok(f.blob.opacity >= 0 && f.blob.lifted >= f.blob.opacity, at('blob'));
    assert.match(p.marker.color, colour, at('marker.color'));
    assert.equal(p.animFps, 0, at('animFps (choppy motion stays off until Stop 1)'));
  }
});

test('the floor reads the preset’s background, shadow and blob, falling back when one is missing', () => {
  const full = floorLook({
    background: 0xfafafa,
    shadow: { type: 'basic', color: 0x334455, opacity: 0.4 },
    blob: { opacity: 0.2, lifted: 0.35 },
  });
  assert.deepEqual(full, {
    background: 0xfafafa,
    shadow: { color: 0x334455, opacity: 0.4 },
    blob: { color: 0x334455, opacity: 0.2, lifted: 0.35 },
  });
  // A preset still carrying the room's colours (as strings), and one with nothing at all.
  const old = floorLook({ room: { background: '#f3f0ea' }, blob: { color: '#5a5048', opacity: 0.16 } });
  assert.equal(old.background, 0xf3f0ea);
  assert.equal(old.shadow.color, 0x5a5048, 'the blob’s colour stands in for the shadow’s');
  assert.ok(old.blob.lifted > old.blob.opacity, 'stronger while he’s lifted');
  const none = floorLook(/** @type {any} */ ({}));
  assert.equal(none.background, 0xffffff, 'white');
  assert.ok(none.shadow.opacity > 0 && none.shadow.opacity < 1);
  assert.ok(none.blob.lifted >= none.blob.opacity);
  assert.equal(floorLook(/** @type {any} */ ({ shadow: { opacity: 7 } })).shadow.opacity, 1, 'clamped');
});

test('the floor: no room, an invisible shadow catcher far wider than the view, drawing no lines', () => {
  const floor = createFloor(LOOKS.ds);
  const { mesh } = floor;
  assert.equal(mesh.isMesh, true);
  assert.equal(mesh.children.length, 0, 'no walls, no baseboard: just the floor');
  assert.equal(mesh.material.isShadowMaterial, true, 'only his shadows show on it');
  assert.ok(Math.abs(mesh.rotation.x + Math.PI / 2) < 1e-9, 'level');
  assert.ok(FLOOR_SIZE >= 100, 'no edge or horizon ever shows');
  assert.equal(mesh.receiveShadow, true);
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.material.depthWrite, false, 'no depth written: no line where it meets the background');
  assert.equal(mesh.material.blendSrcAlpha, THREE.ZeroFactor);
  assert.equal(mesh.material.blendDstAlpha, THREE.OneFactor, 'the surface id under it is kept: no lines in the shadow');
  const want = floorLook(LOOKS.ds).shadow;
  assert.equal(mesh.material.color.getHex(), want.color);
  assert.equal(mesh.material.opacity, want.opacity);
  floor.setLook(
    /** @type {any} */ ({ ...LOOKS.soft, shadow: { ...LOOKS.soft.shadow, color: 0x203040, opacity: 0.5 } }),
  );
  assert.equal(mesh.material.color.getHex(), 0x203040);
  assert.equal(mesh.material.opacity, 0.5);
  assert.doesNotThrow(() => floor.dispose());
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
  // The camera: a button that eases it back to the default view, and a hint on moving it.
  assert.match(sheet, /<button type="button" class="inv-btn[^"]*" data-reset-camera>Reset Camera<\/button>/);
  assert.match(
    sheet,
    /inv-hint[^>]*>[^<]*(drag|Drag)[^<]*(pinch|scroll)[^<]*\./,
    'how to turn and zoom, in a sentence',
  );
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
