// The invitation toy's look (pure parts): the pixel grid (src/invitation/pixels.js) in explicit
// steps (at 2×, 3× and 4× a texel is N×N CSS px, in whole device pixels) on the phones and the
// desktop the round checks, Pixel Size Off at native size (its DPR capped at 2), the camera framing
// NEWT about a quarter of a phone's short side tall and a fifth of a desktop's whatever the Pixel
// Size (99 CSS px on a 390-wide phone: 50 texels at the default size), low enough to see his face, standing in the
// middle of the space over the toolbar, the Bayer matrix the retro pass dithers with, the Look
// settings (src/invitation/look.js) surviving any storage, and the presets (src/invitation/looks/)
// carrying every look value, so a designer only ever edits data. With three.js in Node: the floor
// (floor.js: invisible, it only catches his shadows; there's no room), the surface ids and the
// retro pass's order and uniforms (retro.js, a stand-in renderer); and the toolbar's and Look
// sheet's markup (ui.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAYER4,
  DEFAULT_PIXEL,
  NATIVE_DPR,
  NEWT_SHARE,
  PHONE_SHARE,
  PHONE_SIDE,
  PIXEL_SIZES,
  compactStage,
  newtShare,
  VIEW,
  frameView,
  headTexels,
  newtTexels,
  project,
  texelGrid,
} from '../src/invitation/pixels.js';
import * as THREE from 'three';
import {
  CHOPPY_FPS,
  DEFAULT_LOOK,
  LOOKS,
  LOOK_KEY,
  MOTIONS,
  STYLES,
  animFps,
  loadLook,
  motionStep,
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
/** The play area and his body at its rim, as the stage frames it. */
const AREA = (playArea().r ?? 0) + NEWT_RADIUS;
/** NEWT's height on screen, CSS px: his texels × a texel's CSS size. */
const cssTall = (view, grid) => (newtTexels(view, grid) * grid.pd) / grid.dpr;

test('the pixel grid: at N× a texel is N×N CSS px in whole device pixels, at 390x844@3, 412x915@2.625 and 1280x800@1', () => {
  assert.deepEqual(PIXEL_SIZES, ['off', '2', '3', '4']);
  assert.equal(DEFAULT_PIXEL, '2');
  for (const [cssW, cssH, dpr] of SIZES) {
    for (const pixelSize of PIXEL_SIZES.filter((p) => p !== 'off')) {
      const n = Number(pixelSize);
      const g = texelGrid({ cssW, cssH, dpr, pixelSize });
      const at = `${cssW}x${cssH}@${dpr} ${pixelSize}×`;
      assert.equal(g.pd, Math.round(n * dpr), `${at}: a texel is round(${n} × ${dpr}) device pixels`);
      assert.ok(Math.abs(g.pd / dpr - n) <= 0.5 / dpr + 1e-9, `${at}: a texel is about ${n} CSS px (${g.pd / dpr})`);
      assert.equal(g.dpr, dpr);
      assert.ok(g.w * g.pd >= cssW * dpr && (g.w - 1) * g.pd < cssW * dpr, `${at}: the width just covers the stage`);
      assert.ok(g.h * g.pd >= cssH * dpr && (g.h - 1) * g.pd < cssH * dpr, `${at}: the height just covers the stage`);
      assert.ok(Math.abs(g.canvasW * dpr - g.w * g.pd) < 1e-6, `${at}: the canvas is whole device pixels wide`);
      assert.ok(Math.abs(g.canvasH * dpr - g.h * g.pd) < 1e-6, `${at}: and tall`);
      assert.equal(g.native, false);
    }
  }
  // The phone the round checks, exactly: 6, 9 and 12 device pixels a texel.
  const phone = (pixelSize) => {
    const { pd, w, h } = texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize });
    return { pd, w, h };
  };
  assert.deepEqual(phone('2'), { pd: 6, w: 195, h: 422 });
  assert.deepEqual(phone('3'), { pd: 9, w: 130, h: 282 });
  assert.deepEqual(phone('4'), { pd: 12, w: 98, h: 211 });
});

test('Pixel Size Off draws at native size, its DPR capped at 2', () => {
  const at = (cssW, cssH, dpr) => texelGrid({ cssW, cssH, dpr, pixelSize: 'off' });
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
  const m = texelGrid({ cssW: 390, cssH: 844, dpr: 3, devW: 1171, devH: 2532, pixelSize: '2' });
  assert.deepEqual([m.pd, m.w], [6, Math.ceil(1171 / 6)]);
});

test('NEWT is about a quarter of the short side on a phone (99 CSS px, 50 texels at the default size on a 390-wide phone) and about a fifth on a desktop', () => {
  assert.ok(NEWT_SHARE >= 0.18 && NEWT_SHARE <= 0.21, `a desktop share of ${NEWT_SHARE}`);
  assert.ok(Math.abs(PHONE_SHARE / NEWT_SHARE - 1.3) < 0.03, `a phone's is about 30% bigger (${PHONE_SHARE})`);
  assert.equal(PHONE_SIDE, 600);
  assert.deepEqual(
    [
      compactStage(390, 844),
      compactStage(844, 390),
      compactStage(599, 1000),
      compactStage(600, 900),
      compactStage(1280, 800),
    ],
    [true, true, true, false, false],
    'a phone: a short side under 600 CSS px',
  );
  assert.deepEqual([newtShare(390, 844), newtShare(1280, 800)], [PHONE_SHARE, NEWT_SHARE]);
  for (const [cssW, cssH, dpr] of SIZES) {
    const grid = texelGrid({ cssW, cssH, dpr, pixelSize: DEFAULT_LOOK.pixelSize });
    // (The play area given too: a phone's default view never backs off for it.)
    const view = frameView({ cssW, cssH, grid, insets: INSETS, area: AREA });
    const at = `${cssW}x${cssH}@${dpr}`;
    const share = cssTall(view, grid) / Math.min(cssW, cssH);
    const want = cssW < 600 ? PHONE_SHARE : NEWT_SHARE;
    assert.ok(Math.abs(share - want) < 0.002, `${at}: NEWT is ${(share * 100).toFixed(1)}% of the short side`);
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
  // On the phones the round checks, at the default size: 99 CSS px and 50 texels at 390x844@3
  // (2 CSS px a texel), 105 CSS px and 55 texels at 412x915@2.625 (5 device px a texel); on the
  // desktop, 156 CSS px and 78 texels.
  for (const [cssW, cssH, dpr, css, texels] of [
    [390, 844, 3, 99.5, 49.7],
    [412, 915, 2.625, 105.1, 55.2],
    [1280, 800, 1, 156, 78],
  ]) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const grid = texelGrid({ cssW, cssH, dpr, pixelSize: DEFAULT_LOOK.pixelSize });
    const view = frameView({ cssW, cssH, grid, insets: INSETS, area: AREA });
    assert.ok(Math.abs(cssTall(view, grid) - css) < 1, `${at}: NEWT is ${cssTall(view, grid).toFixed(1)} CSS px tall`);
    const tall = newtTexels(view, grid);
    assert.ok(Math.abs(tall - texels) < 1, `${at}: NEWT is ${tall.toFixed(1)} texels tall at the default size`);
  }
});

test('the framing stays the same whatever the pixel size: NEWT just has more or fewer texels', () => {
  for (const [cssW, cssH, dpr] of SIZES) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const css = [];
    const tall = [];
    for (const pixelSize of PIXEL_SIZES) {
      const grid = texelGrid({ cssW, cssH, dpr, pixelSize });
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
    { ...DEFAULT_LOOK, pixelSize: '4' },
    store(
      () => saved,
      (k, v) => (saved = [k, v]),
    ),
  );
  assert.equal(ok, true);
  assert.equal(saved[0], LOOK_KEY);
  assert.equal(LOOK_KEY, 'invitation.look.v1');
  assert.deepEqual(loadLook(store(() => saved[1])), { ...DEFAULT_LOOK, pixelSize: '4' });
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

test('a Pixel Size saved before the steps (Fine, DS, Chunky) loads as the default, the other settings kept', () => {
  for (const old of ['fine', 'ds', 'chunky']) {
    const saved = JSON.stringify({ pixelSize: old, dither: false, outlines: true, style: 'soft' });
    assert.deepEqual(
      loadLook(store(() => saved)),
      { pixelSize: DEFAULT_PIXEL, dither: false, outlines: true, style: 'soft', motion: 'smooth' },
      old,
    );
  }
  for (const pixelSize of PIXEL_SIZES)
    assert.equal(loadLook(store(() => JSON.stringify({ pixelSize }))).pixelSize, pixelSize, `${pixelSize} is kept`);
  assert.equal(DEFAULT_LOOK.pixelSize, '2', '2× by default');
});

test('a stored look from before Motion loads with Motion Smooth and keeps its other values; Smooth and Choppy are kept, anything else is Smooth', () => {
  assert.deepEqual(MOTIONS, ['smooth', 'choppy']);
  assert.equal(DEFAULT_LOOK.motion, 'smooth', 'smooth by default');
  const before = JSON.stringify({ pixelSize: '3', dither: false, outlines: false, style: 'soft' });
  assert.deepEqual(loadLook(store(() => before)), {
    pixelSize: '3',
    dither: false,
    outlines: false,
    style: 'soft',
    motion: 'smooth',
  });
  for (const motion of MOTIONS)
    assert.equal(loadLook(store(() => JSON.stringify({ motion }))).motion, motion, `${motion} is kept`);
  for (const motion of ['Choppy', 'fast', 15, true, null])
    assert.equal(validLook({ ...DEFAULT_LOOK, motion }).motion, 'smooth', `${JSON.stringify(motion)} is not a Motion`);
  // Saved and read back under the same key.
  let saved = null;
  saveLook(
    { ...DEFAULT_LOOK, motion: 'choppy' },
    store(
      () => null,
      (k, v) => (saved = [k, v]),
    ),
  );
  assert.equal(saved[0], 'invitation.look.v1');
  assert.equal(JSON.parse(saved[1]).motion, 'choppy');
  assert.equal(loadLook(store(() => saved[1])).motion, 'choppy');
});

test('Motion Choppy steps his animation at 15 fps, Smooth every frame (and a preset’s own animFps still counts when Smooth)', () => {
  assert.equal(CHOPPY_FPS, 15);
  assert.equal(animFps({ ...DEFAULT_LOOK, motion: 'choppy' }), 15);
  assert.equal(animFps({ ...DEFAULT_LOOK, motion: 'smooth' }), presetOf(DEFAULT_LOOK).animFps);
  // Smooth: every frame steps by its own dt, nothing waits.
  assert.deepEqual(motionStep(0, 0.016, 0), { acc: 0, step: 0.016 });
  /** Frames of `dts` through motionStep at `fps`: the steps taken and the time stepped. */
  const run = (dts, fps) => {
    let acc = 0;
    let steps = 0;
    let stepped = 0;
    for (const dt of dts) {
      const m = motionStep(acc, dt, fps);
      acc = m.acc;
      if (m.step > 0) {
        steps++;
        stepped += m.step;
        assert.ok(Math.abs(m.step * fps - Math.round(m.step * fps)) < 1e-9, `a step is whole ticks (${m.step})`);
      }
      assert.ok(acc >= 0 && acc < 1 / fps + 1e-9, `what waits is under a tick (${acc})`);
    }
    const total = dts.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(stepped + acc - total) < 1e-9, `nothing is lost: ${stepped} + ${acc} = ${total}`);
    return steps;
  };
  // At 60 Hz: one step of 1/15 s every fourth frame, exactly 15 a second (resetting the wait
  // to 0 instead of taking a tick off it would lose the remainder and run at 12 to 14).
  assert.equal(run(Array(120).fill(1 / 60), 15), 30, '60 Hz: 15 a second');
  // At 144 Hz and at uneven frame times too: 15 a second, give or take the last.
  const at144 = run(Array(288).fill(1 / 144), 15);
  assert.ok(at144 >= 29 && at144 <= 30, `144 Hz: ${at144} in 2 s`);
  const uneven = Array.from({ length: 240 }, (_, i) => [0.014, 0.019, 0.016, 0.0177][i % 4]);
  const n = run(uneven, 15);
  const secs = uneven.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(n / secs - 15) < 0.6, `uneven frames: ${(n / secs).toFixed(2)} a second`);
  // A slow frame catches up in one step of whole ticks.
  assert.deepEqual(motionStep(0.05, 0.05, 15).step, 1 / 15);
});

test('every look preset carries every look value (a designer edits data, never code)', () => {
  const colour = /^#[0-9a-f]{6}$/i;
  assert.deepEqual(Object.keys(LOOKS).sort(), [...STYLES].sort());
  for (const [name, p] of Object.entries(LOOKS)) {
    const at = (k) => `${name}: ${k}`;
    assert.ok(typeof p.label === 'string' && p.label.length > 0, at('label'));
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
  const sheet = sheetHtml({ pixelSize: '4', dither: false, outlines: true, style: 'soft' });
  assert.match(sheet, /value="4" data-look="pixelSize" checked/);
  // Pixel Size in explicit steps, in order.
  const steps = [...sheet.matchAll(/name="inv-pixel" value="([^"]+)"[^>]*><span>([^<]+)<\/span>/g)];
  assert.deepEqual(
    steps.map((m) => [m[1], m[2]]),
    [
      ['off', 'Off'],
      ['2', '2×'],
      ['3', '3×'],
      ['4', '4×'],
    ],
  );
  assert.match(sheet, /value="soft" data-look="style" checked/);
  // Motion: Smooth or Choppy, the stored one checked (Smooth for a look from before it).
  const motions = [
    ...sheet.matchAll(/name="inv-motion" value="([^"]+)" data-look="motion"( checked)?><span>([^<]+)<\/span>/g),
  ];
  assert.deepEqual(
    motions.map((m) => [m[1], m[3], Boolean(m[2])]),
    [
      ['smooth', 'Smooth', true],
      ['choppy', 'Choppy', false],
    ],
  );
  assert.match(sheet, /<legend>Motion<\/legend>/);
  assert.match(sheetHtml({ ...DEFAULT_LOOK, motion: 'choppy' }), /value="choppy" data-look="motion" checked/);
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
