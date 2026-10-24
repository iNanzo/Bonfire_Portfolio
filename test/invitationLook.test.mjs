// The invitation toy's look (pure parts): the pixel grid (src/invitation/pixels.js) at NEWT's
// sprite resolutions (at N×N he's about N texels tall, a texel whole device pixels; the steps a
// screen lists, two that come to the same block there shown as one, and a 1-pixel block shown as
// Native) on the phones and the desktop the round checks, Native at the device's own pixels (a
// texel a device pixel, no DPR cap), Off smooth at the screen's (its DPR capped at 2), the camera framing NEWT
// about a quarter of a phone's short side tall and a fifth of a desktop's whatever the Pixel Size
// (99 CSS px on a 390-wide phone: 99 texels at the default 96×96), low enough to see his face,
// standing in the middle of the space over the toolbar (in the clear space beside the open Look sheet, just as
// big), the Bayer matrix the retro pass dithers with, the Look
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
  OFF_DPR,
  NEWT_SHARE,
  PHONE_SHARE,
  PHONE_SIDE,
  PIXEL_SIZES,
  RESOLUTIONS,
  blockAt,
  blockFor,
  compactStage,
  newtDevicePx,
  newtShare,
  pixelSteps,
  shownPixel,
  resolutionOf,
  stepFor,
  VIEW,
  clearInsets,
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
  OLD_PIXEL,
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
import {
  BUTTONS,
  BUTTON_LABELS,
  CAMERA_CONTROLS,
  DEVICE_LABELS,
  HOLD_MS,
  HOLD_SLOP,
  INTRO_LABEL,
  WANDER_KEY,
  createHold,
  deviceLabelOf,
  loadWander,
  parseQuery,
  SLIDE_SLOP,
  pixelLabel,
  pixelSpoken,
  saveWander,
  sheetHtml,
  slideIntent,
  statusHtml,
  toolbarHtml,
} from '../src/invitation/ui.js';
import { LABEL_ICONS, iconSvg } from '../src/invitation/icons.js';
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
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} should be ${b} (±${tol})`);

test('the pixel grid: at a sprite resolution N NEWT is about N texels tall in the default view, a texel max(1, round(his height in device px ÷ N)) whole device pixels, at 390x844@3, 412x915@2.625 and 1280x800@1', () => {
  assert.deepEqual(RESOLUTIONS, [16, 24, 32, 48, 64, 96, 128, 192, 256]);
  assert.deepEqual(
    PIXEL_SIZES,
    ['16', '24', '32', '48', '64', '96', '128', '192', '256', 'native', 'off'],
    'Native, then Off, at the fine end',
  );
  assert.equal(DEFAULT_PIXEL, '128', 'the user’s Default look: 128×128');
  assert.deepEqual(
    PIXEL_SIZES.map((p) => resolutionOf(p)),
    [...RESOLUTIONS, null, null],
  );
  assert.equal(resolutionOf('2'), null, 'not a step');
  for (const [cssW, cssH, dpr] of SIZES) {
    const tallPx = newtShare(cssW, cssH) * Math.min(cssW, cssH) * dpr;
    close(newtDevicePx(cssW, cssH, dpr), tallPx, 1e-9, `${cssW}x${cssH}@${dpr}: his height in device px`);
    for (const pixelSize of RESOLUTIONS.map(String)) {
      const n = Number(pixelSize);
      const g = texelGrid({ cssW, cssH, dpr, pixelSize });
      const at = `${cssW}x${cssH}@${dpr} ${n}×${n}`;
      assert.equal(
        g.pd,
        Math.max(1, Math.round(tallPx / n)),
        `${at}: a texel is round(${tallPx.toFixed(1)} / ${n}) device px`,
      );
      assert.equal(blockFor(n, cssW, cssH, dpr), g.pd);
      assert.ok(Number.isInteger(g.pd) && g.pd >= 1);
      assert.equal(g.dpr, dpr);
      assert.ok(g.w * g.pd >= cssW * dpr && (g.w - 1) * g.pd < cssW * dpr, `${at}: the width just covers the stage`);
      assert.ok(g.h * g.pd >= cssH * dpr && (g.h - 1) * g.pd < cssH * dpr, `${at}: the height just covers the stage`);
      assert.ok(Math.abs(g.canvasW * dpr - g.w * g.pd) < 1e-6, `${at}: the canvas is whole device pixels wide`);
      assert.ok(Math.abs(g.canvasH * dpr - g.h * g.pd) < 1e-6, `${at}: and tall`);
      assert.equal(g.off, false);
      // NEWT's height in texels in the default view: his device px over the block, so about N
      // (within a quarter while the block is 2 px or more; at 1 px he has every pixel there is).
      const view = frameView({ cssW, cssH, grid: g, insets: INSETS, area: AREA });
      const tall = newtTexels(view, g);
      close(tall, tallPx / g.pd, 0.5, `${at}: NEWT's texels`);
      if (tallPx / n >= 1.5) assert.ok(tall / n >= 0.75 && tall / n <= 1.25, `${at}: ${tall.toFixed(1)} texels`);
      else assert.ok(g.pd === 1 && tall < 1.5 * n, `${at}: native pixels (${tall.toFixed(1)} texels)`);
    }
  }
  // The phones and the desktop the round checks, exactly: device px a texel at 16..256.
  const pds = (cssW, cssH, dpr) => RESOLUTIONS.map((n) => texelGrid({ cssW, cssH, dpr, pixelSize: String(n) }).pd);
  assert.deepEqual(pds(390, 844, 3), [19, 12, 9, 6, 5, 3, 2, 2, 1]);
  assert.deepEqual(pds(412, 915, 2.625), [17, 11, 9, 6, 4, 3, 2, 1, 1]);
  assert.deepEqual(pds(1280, 800, 1), [10, 7, 5, 3, 2, 2, 1, 1, 1]);
  // 96×96 on a 390-wide phone: 3 device px a texel (a CSS px), 390 × 844 texels; the default,
  // 128×128, 2 device px a texel there (585 × 1266), and 1 on a 1280×800 desktop (Native's grid).
  const phone = texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: '96' });
  assert.deepEqual([phone.pd, phone.w, phone.h], [3, 390, 844]);
  const byDefault = texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: DEFAULT_PIXEL });
  assert.deepEqual([byDefault.pd, byDefault.w, byDefault.h], [2, 585, 1266]);
  assert.equal(texelGrid({ cssW: 1280, cssH: 800, dpr: 1, pixelSize: DEFAULT_PIXEL }).pd, 1);
});

test("Pixel Size's steps on a screen: each one a different block (two steps that come to the same block here are one, the one nearest NEWT's real height in texels), coarse to fine, then Native (any resolution that comes to 1 device px here is Native), then Off", () => {
  const values = (cssW, cssH, dpr) => pixelSteps(cssW, cssH, dpr).map((s) => s.value);
  // 390x844@3: 128 and 192 both come to 2 device px (149 texels): 128 is nearer; 256 comes to 1
  // px (298 texels): Native.
  assert.deepEqual(values(390, 844, 3), ['16', '24', '32', '48', '64', '96', '128', 'native', 'off']);
  // 412x915@2.625: 192 and 256 both 1 px (276 texels): Native.
  assert.deepEqual(values(412, 915, 2.625), ['16', '24', '32', '48', '64', '96', '128', 'native', 'off']);
  // 1280x800@1: 64 and 96 at 2 px (78 texels): 64; 128, 192, 256 at 1 px (156): Native.
  assert.deepEqual(values(1280, 800, 1), ['16', '24', '32', '48', '64', 'native', 'off']);
  // A screen where even 256×256 is 2 px a texel (1024x1366@2: 192 and 256 at 2 px, 200 texels:
  // 192): Native is a step of its own, finer still.
  assert.deepEqual(values(1024, 1366, 2).slice(-3), ['192', 'native', 'off']);
  for (const [cssW, cssH, dpr] of [...SIZES, [360, 780, 3], [1920, 1080, 2], [1024, 1366, 2]]) {
    const steps = pixelSteps(cssW, cssH, dpr);
    const at = `${cssW}x${cssH}@${dpr}`;
    assert.equal(steps.at(-1).value, 'off', `${at}: Off at the fine end`);
    // Native just before it: a texel a device pixel, NEWT every pixel he covers, standing for
    // itself and every resolution that comes to 1 px here.
    const native = steps.at(-2);
    assert.equal(native.value, 'native', `${at}: Native before Off`);
    assert.equal(native.n, null);
    assert.equal(native.pd, 1);
    close(native.texels, newtDevicePx(cssW, cssH, dpr), 1e-9, `${at}: Native's texels`);
    assert.deepEqual(
      native.covers,
      [...RESOLUTIONS.map(String).filter((p) => blockFor(Number(p), cssW, cssH, dpr) === 1), 'native'],
      `${at}: Native stands for the 1-px resolutions`,
    );
    const blocks = steps.slice(0, -1).map((s) => s.pd);
    for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i] < blocks[i - 1], `${at}: ${blocks} coarse to fine`);
    for (const s of steps.slice(0, -1)) {
      assert.equal(s.pd, texelGrid({ cssW, cssH, dpr, pixelSize: s.value }).pd);
      close(s.texels, newtDevicePx(cssW, cssH, dpr) / s.pd, 1e-9, `${at} ${s.value}: his texels`);
    }
    // Every step, listed or not, shows as the listed one with its block.
    for (const p of PIXEL_SIZES) {
      const shown = stepFor(p, steps);
      assert.ok(steps.includes(shown), `${at} ${p}`);
      if (p === 'off') assert.equal(shown.value, 'off');
      else assert.equal(shown.pd, texelGrid({ cssW, cssH, dpr, pixelSize: p }).pd, `${at} ${p}: the same block`);
    }
  }
  assert.equal(stepFor('192', pixelSteps(390, 844, 3)).value, '128');
  assert.equal(stepFor('96', pixelSteps(1280, 800, 1)).value, '64');
  assert.equal(stepFor('256', pixelSteps(390, 844, 3)).value, 'native', '256×256 is Native on a DPR 3 phone');
  assert.equal(stepFor('128', pixelSteps(1280, 800, 1)).value, 'native', '128×128 is Native on a DPR 1 desktop');
  assert.equal(stepFor('native', pixelSteps(390, 844, 3)).value, 'native');
  // What the slider shows for a Pixel Size: itself, where its step is a resolution's that stands
  // for it too; Native for those Native stands for; the step's own otherwise.
  const desk = pixelSteps(1429, 1115, 1);
  assert.equal(stepFor('128', desk).value, '96', '96 and 128 are one step there');
  assert.equal(shownPixel('128', desk), '128');
  assert.equal(shownPixel('96', desk), '96');
  assert.equal(shownPixel('192', pixelSteps(390, 844, 3)), '192');
  assert.equal(shownPixel('256', pixelSteps(390, 844, 3)), 'native');
  assert.equal(shownPixel('128', pixelSteps(1280, 800, 1)), 'native');
  assert.equal(shownPixel('off', desk), 'off');
  assert.equal(shownPixel('2', desk), stepFor('2', desk).value, 'anything else: the step it shows as');
});

test('Pixel Size Native draws a texel a device pixel at the device’s own DPR (no cap), the same grid as a resolution that comes to 1 px there', () => {
  const at = (cssW, cssH, dpr, o = {}) => texelGrid({ cssW, cssH, dpr, pixelSize: 'native', ...o });
  const pick = ({ pd, dpr, w, h, canvasW, canvasH, off }) => ({ pd, dpr, w, h, canvasW, canvasH, off });
  // A DPR 3 phone gets its true pixels: 1170 × 2532, not Off's 780 × 1688.
  assert.deepEqual(pick(at(390, 844, 3)), { pd: 1, dpr: 3, w: 1170, h: 2532, canvasW: 390, canvasH: 844, off: false });
  const g = at(412, 915, 2.625);
  assert.deepEqual([g.pd, g.dpr, g.w, g.h], [1, 2.625, Math.ceil(412 * 2.625), Math.ceil(915 * 2.625)]);
  assert.deepEqual(pick(at(1280, 800, 1)), { pd: 1, dpr: 1, w: 1280, h: 800, canvasW: 1280, canvasH: 800, off: false });
  // The device pixels the browser measured win, as at any resolution.
  assert.equal(at(390, 844, 3, { devW: 1171, devH: 2532 }).w, 1171);
  // 256×256 on a DPR 3 phone and 128×128 on a DPR 1 desktop are already 1 px a texel: the same grid.
  assert.deepEqual(pick(texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: '256' })), pick(at(390, 844, 3)));
  assert.deepEqual(pick(texelGrid({ cssW: 1280, cssH: 800, dpr: 1, pixelSize: '128' })), pick(at(1280, 800, 1)));
  // NEWT's height in texels there: every device pixel he covers (298 on a 390-wide phone at DPR 3).
  const grid = at(390, 844, 3);
  const view = frameView({ cssW: 390, cssH: 844, grid, insets: INSETS, area: AREA });
  close(newtTexels(view, grid), newtDevicePx(390, 844, 3), 0.5, 'NEWT at Native');
  close(cssTall(view, grid), PHONE_SHARE * 390, 0.5, 'the same size on screen as at any Pixel Size');
});

test('Pixel Size Off draws smooth at the screen’s resolution, its DPR capped at 2', () => {
  const at = (cssW, cssH, dpr) => texelGrid({ cssW, cssH, dpr, pixelSize: 'off' });
  assert.equal(OFF_DPR, 2);
  assert.deepEqual((({ pd, dpr, w, h, off }) => ({ pd, dpr, w, h, off }))(at(390, 844, 3)), {
    pd: 1,
    dpr: 2,
    w: 780,
    h: 1688,
    off: true,
  });
  const g = at(412, 915, 2.625);
  assert.deepEqual([g.w, g.h, g.dpr], [824, 1830, 2]);
  const d = at(1280, 800, 1);
  assert.deepEqual([d.w, d.h, d.pd, d.dpr, d.canvasW, d.canvasH], [1280, 800, 1, 1, 1280, 800]);
  // A device-pixel box the browser measured wins over CSS × DPR (where it can say).
  const m = texelGrid({ cssW: 390, cssH: 844, dpr: 3, devW: 1171, devH: 2532, pixelSize: '48' });
  assert.deepEqual([m.pd, m.w], [6, Math.ceil(1171 / 6)]);
});

test('NEWT is about a quarter of the short side on a phone (99 CSS px, 99 texels at the default size on a 390-wide phone) and about a fifth on a desktop', () => {
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
  // On the phones the round checks, at 96×96: 99 CSS px and 99 texels at 390x844@3
  // (3 device px a texel), 105 CSS px and 92 texels at 412x915@2.625 (3 device px a texel); on
  // the desktop, 156 CSS px and 78 texels (2 px a texel: 96×96 and 64×64 are one step there).
  for (const [cssW, cssH, dpr, css, texels] of [
    [390, 844, 3, 99.5, 99.45],
    [412, 915, 2.625, 105.1, 91.9],
    [1280, 800, 1, 156, 78],
  ]) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const grid = texelGrid({ cssW, cssH, dpr, pixelSize: '96' });
    const view = frameView({ cssW, cssH, grid, insets: INSETS, area: AREA });
    assert.ok(Math.abs(cssTall(view, grid) - css) < 1, `${at}: NEWT is ${cssTall(view, grid).toFixed(1)} CSS px tall`);
    const tall = newtTexels(view, grid);
    assert.ok(Math.abs(tall - texels) < 1, `${at}: NEWT is ${tall.toFixed(1)} texels tall at 96×96`);
  }
});

test('with the Look sheet open the camera shows NEWT in the clear space it leaves, just as big: above it on a phone or a desktop, beside it on a phone held sideways', () => {
  // The sheet as ui.js lays it out: full width on a phone, 520 px wide and centred on a wider
  // stage, from the bottom up, at most the stage's height.
  const sheetOver = (cssW, cssH, tall) => {
    const w = Math.min(cssW, 520);
    return { left: (cssW - w) / 2, right: (cssW + w) / 2, top: Math.max(0, cssH - tall), bottom: cssH };
  };
  for (const [cssW, cssH, dpr, sheetTall, where] of [
    [390, 844, 3, 519, 'above'],
    [360, 780, 3, 524, 'above'],
    [1280, 800, 1, 493, 'above'],
    [1920, 1080, 1, 493, 'above'],
    [844, 390, 3, 519, 'beside'],
  ]) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const grid = texelGrid({ cssW, cssH, dpr, pixelSize: DEFAULT_LOOK.pixelSize });
    const view = frameView({ cssW, cssH, grid, insets: INSETS, area: AREA });
    const cover = sheetOver(cssW, cssH, sheetTall);
    const tall = newtShare(cssW, cssH) * Math.min(cssW, cssH);
    const focus = clearInsets({ cssW, cssH, insets: INSETS, cover, tall });
    const open = frameView({ cssW, cssH, grid, insets: INSETS, focus, area: AREA });
    assert.equal(open.distance, view.distance, `${at}: just as far away, so just as big`);
    // His middle in the middle of the clear space, his whole height inside it and off the sheet.
    const middle = project(open, { x: 0, y: 0.5, z: 0 });
    close(middle.x, (focus.left + cssW - focus.right) / 2, 1.5, `${at}: across`);
    close(middle.y, (focus.top + cssH - focus.bottom) / 2, 1.5, `${at}: down`);
    const top = project(open, { x: 0, y: 1.0, z: 0 }).y;
    const feet = project(open, { x: 0, y: 0, z: 0 }).y;
    assert.ok(top > 0, `${at}: his head on the screen (${top.toFixed(0)})`);
    if (where === 'above') {
      assert.ok(feet < cover.top, `${at}: his feet over the sheet (${feet.toFixed(0)} < ${cover.top})`);
    } else {
      assert.ok(middle.x + tall / 4 < cover.left, `${at}: to the sheet's left (${middle.x.toFixed(0)})`);
      assert.ok(feet < cssH - INSETS.bottom, `${at}: over the toolbar`);
    }
  }
  // Closed (nothing covering): the default view's own insets.
  const none = clearInsets({ cssW: 390, cssH: 844, insets: INSETS, cover: null, tall: 99 });
  assert.deepEqual(none, INSETS);
});

test('the framing stays the same whatever the sprite resolution: NEWT just has more or fewer texels', () => {
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
    // 16×16 first, then finer and finer: never fewer texels.
    for (let i = 1; i < RESOLUTIONS.length; i++)
      assert.ok(tall[i] >= tall[i - 1] - 1e-9, `${at}: ${tall.map((v) => v.toFixed(1))} texels at ${PIXEL_SIZES}`);
    assert.ok(tall[RESOLUTIONS.length - 1] > 2.5 * tall[0], `${at}: 256×256 much finer than 16×16`);
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
    { ...DEFAULT_LOOK, pixelSize: '128' },
    store(
      () => saved,
      (k, v) => (saved = [k, v]),
    ),
  );
  assert.equal(ok, true);
  assert.equal(saved[0], LOOK_KEY);
  assert.equal(LOOK_KEY, 'invitation.look.v1');
  assert.deepEqual(loadLook(store(() => saved[1])), { ...DEFAULT_LOOK, pixelSize: '128' });
  // Native too: stored as 'native', and it loads again as Native (a reload keeps it).
  saveLook(
    { ...DEFAULT_LOOK, pixelSize: 'native', style: 'soft' },
    store(
      () => saved,
      (k, v) => (saved = [k, v]),
    ),
  );
  assert.equal(JSON.parse(saved[1]).pixelSize, 'native');
  assert.deepEqual(loadLook(store(() => saved[1])), { ...DEFAULT_LOOK, pixelSize: 'native', style: 'soft' });
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

test('a Pixel Size saved before the sprite resolutions loads as the nearest one (2×, 3×, 4× as they looked on a phone), Fine, DS and Chunky as the default, the other settings kept', () => {
  for (const [old, now] of [
    ['fine', DEFAULT_PIXEL],
    ['ds', DEFAULT_PIXEL],
    ['chunky', DEFAULT_PIXEL],
    ['2', '48'],
    ['3', '32'],
    ['4', '24'],
  ]) {
    const saved = JSON.stringify({ pixelSize: old, dither: false, outlines: true, style: 'soft' });
    assert.deepEqual(
      loadLook(store(() => saved)),
      { pixelSize: now, dither: false, outlines: true, style: 'soft', motion: 'smooth', shader: {} },
      old,
    );
  }
  // (Each old step's texels on a 390-wide phone, where 2× was drawn: the nearest resolution.)
  for (const [old, now] of Object.entries(OLD_PIXEL)) {
    const texels = (PHONE_SHARE * 390) / Number(old);
    const nearest = RESOLUTIONS.reduce((a, b) =>
      Math.abs(Math.log(b / texels)) < Math.abs(Math.log(a / texels)) ? b : a,
    );
    assert.equal(now, String(nearest), `${old}×: ${texels.toFixed(1)} texels`);
  }
  for (const pixelSize of PIXEL_SIZES)
    assert.equal(loadLook(store(() => JSON.stringify({ pixelSize }))).pixelSize, pixelSize, `${pixelSize} is kept`);
  for (const pixelSize of ['8', '512', 48, 'Off', 'Native', 'native ', '48x48', null])
    assert.equal(validLook({ pixelSize }).pixelSize, DEFAULT_PIXEL, `${JSON.stringify(pixelSize)}: the default`);
  assert.equal(DEFAULT_LOOK.pixelSize, '128', '128×128 by default');
});

test('a stored look from before Motion loads with Motion Smooth and keeps its other values; Smooth and Choppy are kept, anything else is Smooth', () => {
  assert.deepEqual(MOTIONS, ['smooth', 'choppy']);
  assert.equal(DEFAULT_LOOK.motion, 'smooth', 'smooth by default');
  const before = JSON.stringify({ pixelSize: '32', dither: false, outlines: false, style: 'soft' });
  assert.deepEqual(loadLook(store(() => before)), {
    pixelSize: '32',
    dither: false,
    outlines: false,
    style: 'soft',
    motion: 'smooth',
    shader: {},
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
    // (The toon shading as a spec the Shader options set: shader.js toonRamp builds the bands.)
    assert.ok([0, 2, 3, 4].includes(p.toon.bands) && typeof p.toon.highlight === 'boolean', at('toon'));
    assert.ok(p.toon.shade >= 0 && p.toon.shade < p.toon.lit && p.toon.lit <= 1, at('toon shade and lit'));
    assert.ok(['dark', 'tinted'].includes(p.outline.ink), at('outline.ink'));
    assert.equal(typeof p.outline.outside, 'boolean', at('outline.outside'));
    for (const k of ['contrast', 'warmth']) assert.equal(typeof p.grade[k], 'number', at(`grade.${k}`));
    for (const k of ['turn', 'strength']) assert.equal(typeof p.sun[k], 'number', at(`sun.${k}`));
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
  assert.match(shader.fragmentShader, /uniform float uSurfaceId;\s*uniform float uIdOn;/);
  // (After every include that writes gl_FragColor: three's toon shader still ends that way. Only
  // the hover's tint at Pixel Size Off follows it, and that touches the colour, never the alpha.)
  assert.match(
    shader.fragmentShader,
    /#include <dithering_fragment>\s*gl_FragColor\.a = mix\(1\.0, uSurfaceId, uIdOn\);/,
  );
  const after = shader.fragmentShader.slice(shader.fragmentShader.indexOf('gl_FragColor.a = mix('));
  assert.equal([...after.matchAll(/gl_FragColor\.a/g)].length, 1, 'nothing writes the alpha after it');
  assert.match(
    after,
    /^gl_FragColor\.a = [^\n]*\n\tif \(uIdOn < 0\.5 && uHover > 0\.0[^\n]*\n\t\tgl_FragColor\.rgb = [^\n]*\n\}\s*$/,
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
  // Native keeps the pixel look: the colour pass and the post pass, at the device's pixels.
  calls.length = 0;
  retro.setParams(LOOKS.ds, { ...DEFAULT_LOOK, pixelSize: 'native' });
  assert.equal(retro.pixel, true);
  assert.equal(u.uOutline.value, 1, 'its outlines');
  assert.equal(u.uDither.value, LOOKS.ds.dither, 'its dither');
  retro.render(scene, camera);
  assert.deepEqual(calls, ['target', 'clear 0', 'scene', 'canvas', 'post'], 'Native: through the pixel pass');
  calls.length = 0;
  retro.setParams(LOOKS.ds, { ...DEFAULT_LOOK, pixelSize: 'off' });
  assert.equal(retro.pixel, false);
  retro.render(scene, camera);
  assert.deepEqual(calls, ['canvas', 'clear 1', 'scene'], 'Pixel Size Off: the scene straight to the canvas');
  assert.doesNotThrow(() => retro.dispose());
});

test('the retro pass warms the path it isn’t drawing (the canvas’s while the pixels show; the colour target’s and the post shader’s at Off), so the first switch never stalls on shader links', async () => {
  let bound = null;
  const calls = [];
  const scene = new THREE.Scene();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial());
  const own = floor.material;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 80);
  const renderer = {
    getRenderTarget: () => bound,
    setRenderTarget: (t) => (bound = t),
    setClearColor: () => {},
    clear: () => {},
    render: () => {},
    compileAsync: (s) => {
      const what = s === scene ? (floor.material === own ? 'scene, its own floor' : 'scene, the catcher') : 'post';
      calls.push(`${what} to the ${bound ? 'target' : 'canvas'}`);
      return Promise.resolve(s);
    },
  };
  const retro = createRetro(renderer);
  retro.setSize(195, 422);
  retro.setParams(LOOKS.ds, DEFAULT_LOOK);
  await retro.warm(scene, camera);
  assert.deepEqual(calls, ['scene, its own floor to the canvas'], 'pixels showing: Off’s programs');
  assert.equal(bound, null, 'the render target put back');
  calls.length = 0;
  retro.setParams(LOOKS.ds, { ...DEFAULT_LOOK, pixelSize: 'off' });
  await retro.warm(scene, camera);
  assert.deepEqual(calls, ['scene, the catcher to the target', 'post to the canvas'], 'at Off: the pixel pass’s');
  assert.equal(floor.material, own, 'the floor’s own material back');
  assert.equal(bound, null);
  // A renderer that can't compile ahead (a stand-in): nothing to warm, nothing thrown.
  const plain = createRetro({ ...renderer, compileAsync: undefined });
  plain.setSize(10, 10);
  await assert.doesNotReject(plain.warm(scene, camera));
});

test('the toolbar, the camera pad and the Settings sheet: every button named by its own label beside a pixel icon, the settings checked, no tooltips', () => {
  const bar = toolbarHtml();
  // The bar: Replay Intro, Wave, Sit, Give Device, Run, Camera and Settings, each a squircle with
  // its pixel icon and its label in a span (the button's name: no aria-label, no title=). Spook
  // and Wander have left it (a tap on him still spooks or waves him; Wander is a setting).
  assert.equal(INTRO_LABEL, 'Replay Intro');
  assert.deepEqual([...BUTTONS], ['Wave', 'Sit', 'Device', 'Run']);
  assert.deepEqual(BUTTON_LABELS, { Wave: 'Wave', Sit: 'Sit', Device: 'Give Device', Run: 'Run' });
  /** The bar's own buttons (not the pad's), in order: their attributes and their inside. */
  const own = [
    ...bar.replace(/<div class="inv-camera-pad"[^]*?<\/div>/, '').matchAll(/<button ([^>]*)>([^]*?)<\/button>/g),
  ];
  const labels = own.map((m) => /<span class="inv-btn-label">([^<]+)<\/span>$/.exec(m[2])?.[1]);
  assert.deepEqual(labels, ['Replay Intro', 'Wave', 'Sit', 'Give Device', 'Run', 'Camera', 'Settings']);
  for (const [i, m] of own.entries()) {
    const label = labels[i] ?? '';
    assert.match(m[1], /^type="button" class="inv-btn inv-tool[^"]*"/, `${label}: a tool button`);
    assert.doesNotMatch(m[1], /aria-label|title=/, `${label}: named by its label`);
    assert.equal(
      m[2],
      `${iconSvg(LABEL_ICONS[label])}<span class="inv-btn-label">${label}</span>`,
      `${label}: icon, label`,
    );
  }
  assert.match(own[0][1], /data-intro/);
  for (const [i, name] of BUTTONS.entries()) assert.match(own[i + 1][1], new RegExp(`data-button="${name}"`), name);
  assert.match(own[5][1], /data-camera-open aria-expanded="false" aria-controls="inv-camera"/);
  assert.match(own[6][1], /data-look-open aria-expanded="false" aria-controls="inv-look"/);
  assert.doesNotMatch(bar, /data-button="(Spook|Wander)"/, 'Spook and Wander are off the bar');
  // The camera pad, over the stage and closed to begin with: Turn Left and Right (45°), Tilt Up
  // and Down (12°), Zoom In and Out, Follow NEWT and Reset Camera, each a tool button; and a
  // line on moving the view by hand.
  assert.match(bar, /<div class="inv-camera-pad" id="inv-camera" role="group" aria-label="Camera Controls" hidden>/);
  assert.deepEqual(
    CAMERA_CONTROLS.map((c) => [c.key, c.label]),
    [
      ['left', 'Turn Left'],
      ['right', 'Turn Right'],
      ['up', 'Tilt Up'],
      ['down', 'Tilt Down'],
      ['in', 'Zoom In'],
      ['out', 'Zoom Out'],
      ['follow', 'Follow NEWT'],
      ['reset', 'Reset Camera'],
    ],
  );
  const pad = /<div class="inv-camera-pad"[^]*?<\/div>/.exec(bar)?.[0] ?? '';
  const padButtons = [...pad.matchAll(/<button ([^>]*)>([^]*?)<\/button>/g)];
  assert.equal(padButtons.length, CAMERA_CONTROLS.length);
  for (const [i, c] of CAMERA_CONTROLS.entries()) {
    const [, attrs, inside] = padButtons[i];
    assert.match(attrs, new RegExp(`^type="button" class="inv-btn inv-tool[^"]*" data-camera="${c.key}"`), c.label);
    assert.equal(inside, `${iconSvg(LABEL_ICONS[c.label])}<span class="inv-btn-label">${c.label}</span>`, c.label);
  }
  assert.match(pad, /data-camera="reset" data-reset-camera/, 'Reset Camera keeps its hook');
  assert.match(
    pad,
    /inv-hint[^>]*>[^<]*(drag|Drag)[^<]*(pinch|scroll)[^<]*\./,
    'how to turn and zoom by hand, in a sentence',
  );
  // Give Device reads as what its next press does: Lie Down while he sits with the tablet, Get
  // Up while he lies (BrainOut.deviceLabel; with none, from BrainOut.device, else Give Device).
  assert.deepEqual([...DEVICE_LABELS], ['Give Device', 'Lie Down', 'Get Up']);
  assert.equal(deviceLabelOf({}), 'Give Device');
  assert.equal(deviceLabelOf({ device: null }), 'Give Device');
  assert.equal(deviceLabelOf({ device: 'sit' }), 'Lie Down');
  assert.equal(deviceLabelOf({ device: 'lie' }), 'Get Up');
  assert.equal(deviceLabelOf({ deviceLabel: 'Get Up', device: 'sit' }), 'Get Up', 'the brain’s label first');
  assert.equal(deviceLabelOf({ deviceLabel: 'Fly' }), 'Give Device', 'never a label it doesn’t know');
  for (const label of DEVICE_LABELS) assert.ok(LABEL_ICONS[label], `${label}: an icon`);
  const sheet = sheetHtml({ pixelSize: '24', dither: false, outlines: true, style: 'soft' });
  assert.match(sheet, /role="dialog" aria-modal="true"/, 'a modal dialog: what lies behind it is out of reach');
  assert.match(sheet, /id="inv-look"[^>]*aria-labelledby="inv-look-title"/);
  assert.match(sheet, /<h2 id="inv-look-title">Settings<\/h2>/, 'Look is Settings now');
  // Wander, off the bar: a switch in Settings, on unless he's been told to stay.
  assert.match(
    sheet,
    /<input type="checkbox" role="switch" data-setting="wander" checked><span class="inv-switch-label">Wander<\/span>/,
  );
  assert.match(sheetHtml(DEFAULT_LOOK, undefined, { wander: false }), /data-setting="wander">/);
  assert.match(sheet, /data-setting="wander"[^]*?inv-hint[^>]*>[^<]+\.</, 'a line on what Wander does');
  assert.doesNotMatch(sheet, /Reset Camera|data-reset-camera/, 'Reset Camera has moved to the camera pad');
  // Pixel Size: a slider over NEWT's sprite resolutions, coarse to fine, then Off at its end;
  // its value shown as N×N and spoken as "N by N", and a button at each end (Off one press away).
  const range = /<input type="range"[^>]*>/.exec(sheet)?.[0] ?? '';
  assert.match(range, /id="inv-pixel-range"/);
  assert.match(range, /min="0"/);
  assert.match(range, new RegExp(`max="${PIXEL_SIZES.length - 1}"`));
  assert.match(range, /step="1"/);
  assert.match(range, new RegExp(`value="${PIXEL_SIZES.indexOf('24')}"`));
  assert.match(range, /aria-valuetext="24 by 24"/);
  assert.match(range, /data-look="pixelSize"/);
  assert.match(sheet, /<label[^>]*for="inv-pixel-range"[^>]*>Pixel Size<\/label>/, 'labelled Pixel Size');
  assert.match(sheet, /data-pixel-value[^>]*>24×24</, 'its value, N×N');
  assert.match(sheet, /<button type="button"[^>]*data-pixel-end="first"[^>]*>16×16<\/button>/);
  assert.match(sheet, /<button type="button"[^>]*data-pixel-end="last"[^>]*>Off<\/button>/);
  // (Each named for what it sets, as a screen reader says it: never a bare "16×16" or "Off".)
  assert.match(sheet, /data-pixel-end="first" aria-label="Pixel Size 16 by 16"/);
  assert.match(sheet, /data-pixel-end="last" aria-label="Pixel Size Off"/);
  assert.deepEqual(
    PIXEL_SIZES.map((p) => [pixelLabel(p), pixelSpoken(p)]),
    PIXEL_SIZES.map((p) =>
      p === 'off' ? ['Off', 'Off'] : p === 'native' ? ['Native', 'Native'] : [`${p}×${p}`, `${p} by ${p}`],
    ),
  );
  // A screen's own steps (two that come to the same block there are one): the stored value sits
  // at the step that stands for it, and shows as itself (192×192 and 128×128 draw alike on this
  // phone: the slider is at their one step, which reads as the one picked); NEWT's height in
  // texels there is said under it.
  const phone = sheetHtml({ ...DEFAULT_LOOK, pixelSize: '192' }, pixelSteps(390, 844, 3));
  const onPhone = /<input type="range"[^>]*>/.exec(phone)?.[0] ?? '';
  assert.match(onPhone, /max="8"/, '9 steps on a 390-wide phone at DPR 3');
  assert.match(onPhone, /value="6"/, '192×192 at the step it shares with 128×128 there');
  assert.match(onPhone, /aria-valuetext="192 by 192"/);
  assert.match(phone, /data-pixel-value[^>]*>192×192</);
  assert.match(phone, /data-pixel-note>NEWT is about 149 pixels tall on this screen\.</);
  // The default on a 1429×1115 desktop at DPR 1: 96×96 and 128×128 both come to 2 px a texel
  // there (one step, 96 the nearer his 109 texels), and the first visit's 128×128 reads 128×128.
  const desk = sheetHtml({ ...DEFAULT_LOOK, pixelSize: '128' }, pixelSteps(1429, 1115, 1));
  assert.match(desk, /data-pixel-value[^>]*>128×128</);
  assert.match(desk, /aria-valuetext="128 by 128"/);
  assert.match(
    sheetHtml({ ...DEFAULT_LOOK, pixelSize: '96' }, pixelSteps(1429, 1115, 1)),
    /data-pixel-value[^>]*>96×96</,
  );
  // Native, the step before Off: a texel a device pixel. 256×256 is 1 px a texel on this phone,
  // so it shows as Native there (never two steps alike); the line still gives his height.
  for (const pixelSize of ['native', '256']) {
    const native = sheetHtml({ ...DEFAULT_LOOK, pixelSize }, pixelSteps(390, 844, 3));
    const onNative = /<input type="range"[^>]*>/.exec(native)?.[0] ?? '';
    assert.match(onNative, /value="7"/, `${pixelSize}: the step before Off`);
    assert.match(onNative, /aria-valuetext="Native"/, pixelSize);
    assert.match(native, /data-pixel-value[^>]*>Native</, pixelSize);
    assert.match(native, /data-pixel-note>NEWT is about 298 pixels tall: every pixel this screen has\.</);
    assert.match(native, /data-off-hint hidden/, `${pixelSize}: the pixel look is on, no Off hint`);
  }
  assert.match(sheetHtml(DEFAULT_LOOK), /data-pixel-note hidden>/, 'no screen measured yet: no height');
  assert.match(sheetHtml({ ...DEFAULT_LOOK, pixelSize: 'off' }, pixelSteps(390, 844, 3)), /data-pixel-note hidden>/);
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
  assert.equal([...sheet.matchAll(/data-look="pixelSize"/g)].length, 1, 'one control');
  for (const html of [bar, sheet, statusHtml()]) assert.doesNotMatch(html, /\stitle=/, 'no title= tooltips');
  // Labels in Title Case (the hints are sentences).
  const texts = [...`${bar}${sheet}`.matchAll(/>([^<>]+)</g)]
    .map((m) => m[1].trim())
    .filter((t) => t && !/[.:]/.test(t));
  // (Articles stay lower case past the first word, as text.js titleCase has them: In the Mix.)
  for (const label of texts) assert.match(label, /^[A-Z0-9][^ ]*( ([A-Z][^ ]*|&amp;|a|an|the))*$/, label);
  assert.equal(presetOf({ ...DEFAULT_LOOK, style: 'soft' }), LOOKS.soft);
  assert.deepEqual(parseQuery('?test&seed=42&calm'), {
    test: true,
    seed: 42,
    calm: true,
    perf: false,
    govern: null,
    settle: null,
    envelope: false,
    drag: 'today',
  });
  assert.deepEqual(parseQuery(''), {
    test: false,
    seed: null,
    calm: false,
    perf: false,
    govern: null,
    settle: null,
    envelope: true,
    drag: 'today',
  });
  // The envelope opens every visit; ?test skips it (the specs and tools start in the toy) unless
  // &envelope asks for it.
  assert.equal(parseQuery('?test&envelope').envelope, true);
  assert.equal(parseQuery('?seed=3').envelope, true);
  // ?settle stretches the intro's reply settle (ms), for the specs only: under ?test.
  assert.equal(parseQuery('?test&settle=1500').settle, 1500);
  assert.equal(parseQuery('?settle=1500').settle, null);
  assert.equal(parseQuery('?test&settle=-5').settle, null);
  // ?perf shows the frame times; ?govern turns the frame-time governor on (it's off under ?test
  // unless asked for), ?govern=off off.
  assert.equal(parseQuery('?perf').perf, true);
  assert.equal(parseQuery('?test&govern').govern, true);
  assert.equal(parseQuery('?govern=off').govern, false);
});

test('on touch, a press held still on a tool button shows its label and swallows the click; a shorter or moving press acts as usual', () => {
  assert.ok(HOLD_MS >= 400 && HOLD_MS <= 500, `${HOLD_MS} ms`);
  assert.ok(HOLD_SLOP >= 6 && HOLD_SLOP <= 14, `${HOLD_SLOP} CSS px`);
  const h = createHold();
  h.down(100, 100, 0);
  assert.equal(h.tick(HOLD_MS / 1000 - 0.01), false, 'not yet');
  h.move(103, 98);
  assert.equal(h.tick(HOLD_MS / 1000), true, 'held still long enough: the label shows');
  assert.equal(h.up(HOLD_MS / 1000 + 0.3), 'label', 'and the click that follows is swallowed');
  h.down(100, 100, 5);
  assert.equal(h.up(5.2), 'click', 'a tap acts');
  h.down(100, 100, 9);
  h.move(100 + HOLD_SLOP + 2, 100);
  assert.equal(h.tick(10), false, 'moved off: no label');
  assert.equal(h.up(10), 'click', 'the browser decides about a press that moved, as usual');
  h.down(0, 0, 20);
  h.cancel();
  assert.equal(h.tick(30), false, 'cancelled');
  assert.equal(h.up(30), 'click');
});

test('Wander, a setting now, is kept like the look: in storage that is empty, broken or throws it’s unset; a save that throws is refused', () => {
  assert.equal(WANDER_KEY, 'invitation.wander.v1');
  /** A storage whose getItem gives `get()` and whose setItem records into `saved`. */
  const keep = (get, saved = []) => ({
    getItem: () => get(),
    setItem: (k, v) => saved.push([k, v]),
  });
  assert.equal(loadWander(keep(() => null)), null, 'never set: the brain’s own');
  assert.equal(loadWander(keep(() => 'true')), true);
  assert.equal(loadWander(keep(() => 'false')), false);
  assert.equal(loadWander(keep(() => '{"x":')), null, 'broken');
  assert.equal(loadWander(keep(() => '7')), null, 'not a yes or no');
  assert.equal(
    loadWander(
      keep(() => {
        throw new Error('denied');
      }),
    ),
    null,
    'throws',
  );
  assert.equal(loadWander(null), null, 'no storage at all');
  const saved = [];
  assert.equal(
    saveWander(
      false,
      keep(() => null, saved),
    ),
    true,
  );
  assert.deepEqual(saved, [[WANDER_KEY, 'false']]);
  assert.equal(
    saveWander(true, {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    }),
    false,
  );
  assert.equal(saveWander(true, null), false);
});

test('a finger on a slider: along it past the slop it drags the slider, up or down it scrolls the sheet, and until then it is neither', () => {
  assert.ok(SLIDE_SLOP >= 6 && SLIDE_SLOP <= 12, `a fingertip's wobble: ${SLIDE_SLOP} CSS px`);
  assert.equal(slideIntent(0, 0), null, 'not moved yet');
  assert.equal(slideIntent(3, -4), null, 'within the slop: a tap, or not decided');
  assert.equal(slideIntent(SLIDE_SLOP + 1, 2), 'drag', 'along it');
  assert.equal(slideIntent(-(SLIDE_SLOP + 1), -2), 'drag', 'along it, the other way');
  assert.equal(slideIntent(2, -(SLIDE_SLOP + 1)), 'swipe', 'up: the sheet scrolls');
  assert.equal(slideIntent(-3, 40), 'swipe', 'down');
  assert.equal(slideIntent(10, -10), 'swipe', 'diagonal: the sheet scrolls, the slider keeps its value');
  assert.equal(slideIntent(12, 11), 'drag', 'mostly along it');
});

test('adaptive pixels: with the camera zoomed (k: NEWT’s size over the default view’s) the texel follows, so he keeps the chosen sprite resolution, in whole device pixels; Native and Off never change', () => {
  for (const [cssW, cssH, dpr] of SIZES) {
    const at = `${cssW}x${cssH}@${dpr}`;
    for (const n of [32, 64, 128]) {
      const pixelSize = String(n);
      const base = texelGrid({ cssW, cssH, dpr, pixelSize });
      assert.equal(texelGrid({ cssW, cssH, dpr, pixelSize, zoom: 1 }).pd, base.pd, `${at} ${n}: k 1 is the default`);
      for (const k of [0.5, 0.75, 1.5, 2, 3]) {
        const g = texelGrid({ cssW, cssH, dpr, pixelSize, zoom: k });
        const ideal = (newtDevicePx(cssW, cssH, dpr) * k) / n;
        assert.ok(Number.isInteger(g.pd) && g.pd >= 1, `${at} ${n} k ${k}: whole device px`);
        assert.equal(g.pd, Math.max(1, Math.round(ideal)), `${at} ${n} k ${k}`);
        assert.equal(blockAt(n, cssW, cssH, dpr, k), g.pd);
        // NEWT, k times as tall on screen, is still about n texels tall (all the pixels there are, under 1 px).
        const tall = (newtDevicePx(cssW, cssH, dpr) * k) / g.pd;
        if (ideal >= 1.5) assert.ok(tall / n > 0.7 && tall / n < 1.4, `${at} ${n} k ${k}: ${tall.toFixed(1)} texels`);
        assert.equal(g.zoom, k);
      }
    }
    // Zoomed in, the blocks are bigger; zoomed out, smaller (never under a device pixel).
    const p = (k) => texelGrid({ cssW, cssH, dpr, pixelSize: '32', zoom: k }).pd;
    assert.ok(p(2) > p(1) && p(1) > p(0.5), `${at}: ${p(0.5)} ${p(1)} ${p(2)}`);
    for (const pixelSize of /** @type {const} */ (['native', 'off'])) {
      const a = texelGrid({ cssW, cssH, dpr, pixelSize });
      const b = texelGrid({ cssW, cssH, dpr, pixelSize, zoom: 2.5 });
      assert.deepEqual([b.pd, b.w, b.h, b.dpr], [a.pd, a.w, a.h, a.dpr], `${at} ${pixelSize}: unaffected`);
    }
  }
  // A held block keeps through a small wobble of the zoom, so the grid doesn't flicker at a boundary.
  // (390x844@3 at 32×32: 298 device px tall, 9.32 a texel at k 1; ideal 6.5 at k 0.697.)
  const k65 = 6.5 / ((PHONE_SHARE * 390 * 3) / 32);
  assert.equal(blockAt(32, 390, 844, 3, k65 * 0.99), 6, 'no hold: rounded');
  assert.equal(blockAt(32, 390, 844, 3, k65 * 0.99, 7), 7, 'held at 7 a little past the boundary');
  assert.equal(blockAt(32, 390, 844, 3, k65 * 0.95, 7), 6, 'clearly past it: 6');
  assert.equal(blockAt(32, 390, 844, 3, k65 * 1.01, 6), 6, 'and held at 6 coming back');
  assert.equal(texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: '32', zoom: k65 * 0.99, held: 7 }).pd, 7);
  // Back at the default view the grid is the Pixel Size's own, whatever was held on the way
  // (390x844@3 at 128×128: 2 px a texel, ideal 2.33, a third of a block from 3).
  for (const held of [1, 2, 3, 4]) assert.equal(blockAt(128, 390, 844, 3, 1, held), 2, `held ${held}`);
  assert.equal(blockAt(128, 390, 844, 3, 1.005, 3), 2, 'within a hair of the default view too');
  // Odd k: a fallback of 1.
  for (const zoom of [0, -1, Number.NaN, Infinity])
    assert.equal(texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: '64', zoom }).pd, 5, `k ${zoom}: as at 1`);
});

test('the frame-time governor’s coarser texels: `coarser` device px on every texel at a resolution and at Native, never at Off; never finer than the user’s choice', () => {
  for (const [cssW, cssH, dpr] of SIZES) {
    for (const pixelSize of /** @type {const} */ (['32', '128', 'native'])) {
      const base = texelGrid({ cssW, cssH, dpr, pixelSize });
      for (const coarser of [1, 2, 4]) {
        const g = texelGrid({ cssW, cssH, dpr, pixelSize, coarser });
        assert.equal(g.pd, base.pd + coarser, `${cssW}x${cssH}@${dpr} ${pixelSize} +${coarser}`);
        assert.equal(g.coarser, coarser);
        assert.ok(g.w < base.w && g.h < base.h, 'fewer texels');
        assert.ok(g.w * g.pd >= cssW * g.dpr - 1e-6, 'still covers the stage');
      }
      assert.equal(texelGrid({ cssW, cssH, dpr, pixelSize, coarser: -3 }).pd, base.pd, 'never finer');
    }
    const off = texelGrid({ cssW, cssH, dpr, pixelSize: 'off' });
    assert.deepEqual(texelGrid({ cssW, cssH, dpr, pixelSize: 'off', coarser: 2 }), { ...off, coarser: 0 });
  }
  // His height in texels follows: at the zoom, over the coarser texel.
  const g = texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: '128', coarser: 1 });
  const view = frameView({ cssW: 390, cssH: 844, grid: g, insets: INSETS, area: AREA });
  assert.ok(Math.abs(newtTexels(view, g) - 298.35 / 3) < 1, `${newtTexels(view, g)}`);
  const z = texelGrid({ cssW: 390, cssH: 844, dpr: 3, pixelSize: '64', zoom: 2 });
  const zv = frameView({ cssW: 390, cssH: 844, grid: z, insets: INSETS, area: AREA });
  assert.ok(Math.abs(newtTexels(zv, z) - 64) < 64 * 0.15, `zoomed ×2 at 64×64: ${newtTexels(zv, z)} texels`);
});

test('Ground Cues, the ring and the dashed drop line under him while he’s held: Off, In the Mix or Always in Settings, the drag kind’s own until one is picked, then kept in invitation.look.v1 (a look stored before it loads as it was)', () => {
  // Not picked: left out of the look (the drag kind's default plays); picked, kept.
  assert.equal('groundCues' in validLook(null), false);
  for (const mode of ['off', 'mix', 'always']) assert.equal(validLook({ groundCues: mode }).groundCues, mode);
  for (const bad of ['auto', 'On', 1, null, {}])
    assert.equal('groundCues' in validLook({ groundCues: bad }), false, String(bad));
  const saved = JSON.stringify({ ...DEFAULT_LOOK, groundCues: 'always' });
  assert.equal(loadLook({ getItem: () => saved }).groundCues, 'always');
  const before = JSON.stringify({ pixelSize: '64', dither: true, outlines: true, style: 'soft', motion: 'smooth' });
  assert.deepEqual(loadLook({ getItem: () => before }), { ...DEFAULT_LOOK, pixelSize: '64', style: 'soft' });
  /** @type {Record<string, string>} */
  const kept = {};
  saveLook({ ...DEFAULT_LOOK, groundCues: 'mix' }, { setItem: (k, v) => (kept[k] = v) });
  assert.equal(JSON.parse(kept[LOOK_KEY]).groundCues, 'mix');
  // In Settings: three segments, the look's own checked, or the kind's default with none.
  const cues = (html) => [
    ...html.matchAll(/<input type="radio" name="inv-ground" value="(\w+)" data-look="groundCues"( checked)?>/g),
  ];
  const sheet = sheetHtml(DEFAULT_LOOK, undefined, { groundDefault: 'mix' });
  assert.match(sheet, /<legend>Ground Cues<\/legend>/);
  assert.deepEqual(
    cues(sheet).map((m) => [m[1], Boolean(m[2])]),
    [
      ['off', false],
      ['mix', true],
      ['always', false],
    ],
  );
  assert.match(sheet, /value="mix" data-look="groundCues"[^>]*><span>In the Mix<\/span>/);
  assert.equal(
    cues(sheetHtml({ ...DEFAULT_LOOK, groundCues: 'always' }, undefined, { groundDefault: 'mix' })).find(
      (m) => m[2],
    )?.[1],
    'always',
  );
  assert.equal(cues(sheetHtml(DEFAULT_LOOK)).find((m) => m[2])?.[1], 'off', 'today’s default: Off');
  assert.match(
    sheet,
    /<legend>Ground Cues<\/legend>[^]*?<p class="inv-hint">([^<]{1,160})\.<\/p>/,
    'a line on what they are',
  );
});

test('Drag in Settings: Today, Level, Tilt and Bead, the kind ?drag= names checked (anything else: Today), for this visit only (never stored)', () => {
  assert.equal(parseQuery('').drag, 'today');
  for (const k of ['today', 'level', 'tilt', 'bead']) assert.equal(parseQuery(`?drag=${k}`).drag, k);
  for (const bad of ['?drag=', '?drag=Level', '?drag=fly', '?drag']) assert.equal(parseQuery(bad).drag, 'today', bad);
  const drags = (html) => [
    ...html.matchAll(
      /<input type="radio" name="inv-drag" value="(\w+)" data-setting="drag"( checked)?><span>([^<]+)<\/span>/g,
    ),
  ];
  assert.deepEqual(
    drags(sheetHtml(DEFAULT_LOOK, undefined, { drag: 'tilt' })).map((m) => [m[1], Boolean(m[2]), m[3]]),
    [
      ['today', false, 'Today'],
      ['level', false, 'Level'],
      ['tilt', true, 'Tilt'],
      ['bead', false, 'Bead'],
    ],
  );
  assert.equal(drags(sheetHtml(DEFAULT_LOOK)).find((m) => m[2])?.[1], 'today');
  assert.equal('drag' in validLook({ drag: 'tilt' }), false, 'not a Look setting');
  // Wander stays the sheet's last stop (Tab goes round from it to Done).
  const sheet = sheetHtml(DEFAULT_LOOK);
  assert.ok(sheet.indexOf('data-setting="drag"') < sheet.indexOf('data-setting="wander"'));
});
