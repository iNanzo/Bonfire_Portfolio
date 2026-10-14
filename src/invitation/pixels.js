// The invitation toy's pixel grid and camera framing (pure: no three.js, no DOM).
//
// The grid: the scene is drawn at texel size and CSS `image-rendering: pixelated` stretches it.
// Pixel Size is NEWT's sprite resolution, N×N for N in RESOLUTIONS (16×16 to 256×256; 128×128 by
// default, DEFAULT_PIXEL), Native or Off: at N×N he's about N texels tall in the default view on
// any screen. A texel is a whole number of device pixels, pd = max(1, round(his default height
// in device px ÷ N)) (blockFor: 19 at 16×16 down to 1 at 256×256 on a 390-wide phone at DPR 3,
// 3 at 96×96), so it stays crisp, and two steps that come to the same block on a screen are one
// step there (pixelSteps, which the Look menu lists). Native is a texel a device pixel at the
// device's own DPR, uncapped (a DPR 3 phone's true pixels), with the pixel look still on; any
// resolution that comes to 1 px on a screen is Native there. The canvas is w × h texels, just
// covering the stage, and its CSS size w × pd / dpr is a little larger than the stage (which
// hides the overhang). Pixel Size Off is the smooth picture without the pixel look, drawn at
// the screen's resolution with its DPR capped at OFF_DPR.
//
// The zoom: with the camera zoomed in or out (k, NEWT's size on screen over the default view's:
// stage.js setZoomScale) the texel follows, round(his height in device px × k ÷ N) (blockAt), so
// he keeps the chosen sprite resolution at any zoom, bigger blocks zoomed in, still whole device
// pixels; a block in use is held until the zoom is clearly past the next one (ZOOM_HOLD), so the
// grid never flickers at a boundary. Native and Off never change with it. The frame-time governor
// (governor.js, in stage.js) adds `coarser` device px to every texel while frames are slow, at a
// resolution and at Native, never at Off, and never takes one away (never finer than the user's
// choice).
//
// The framing: a camera 36° up, low enough that his cap's brim leaves his face showing once he
// looks toward the camera (from 48° it hid the whole face; at 36° his look lifts his head the
// rest of the way: the highest angle at which his eyes read on a 390×844 phone), and 20° of
// view: a narrow view keeps him nearly the same size all over his play area. There's no room:
// NEWT stands on an invisible floor on a plain background, and the camera only places him.
// This is the default view the orbit camera (camera.js) starts from and comes back to: he's
// NEWT_SHARE of the stage's short side tall on a desktop (his height as the camera sees it:
// NEWT_SIDE), further back only where the play area (a disc, area.js) wouldn't all show; on a
// phone (a short side under PHONE_SIDE) he's PHONE_SHARE of it, about 30% bigger (99 CSS px on
// a 390-wide phone, 149 texels at the default 128×128 there), and the view never backs off for the
// disc (the camera follows him there instead, so he stays on screen at its rim). The point the
// camera looks at (his middle, at the origin) sits in the middle of the space over the
// toolbar: the view is shifted
// there (View.shift, an off-centre projection: stage.js camera.setViewOffset), so it stays
// there however the camera turns. While the Look sheet is open it sits in the middle of the
// clear space the sheet leaves instead (clearInsets: above it, or beside it on a phone held
// sideways), just as big, so a look's changes show on him. The framing never reads the Pixel
// Size: a coarser resolution only makes chunkier pixels (the block comes from his height on
// screen, never the other way round).

/**
 * @typedef {'16'|'24'|'32'|'48'|'64'|'96'|'128'|'192'|'256'|'native'|'off'} PixelSize  N×N
 *   (NEWT about N texels tall), Native (a texel a device pixel, the pixel look on) or Off (smooth)
 */
/**
 * @typedef {object} PixelStep  one Pixel Size a screen lists
 * @property {PixelSize} value
 * @property {number|null} n  the resolution (null: Native and Off)
 * @property {number} pd  device px a texel (1 at Native and Off)
 * @property {number} texels  NEWT's height in texels in the default view (0 at Off)
 * @property {PixelSize[]} covers  every Pixel Size it stands for here (itself, and any coarser
 *   or finer resolution that comes to the same block; Native: every one that comes to 1 px)
 */
/**
 * @typedef {object} Grid  the canvas in texels
 * @property {number} pd  device pixels per texel (1 at Native and Off, before the governor's)
 * @property {number} zoom  the camera's zoom it was sized for (k: 1 in the default view)
 * @property {number} coarser  device px the governor added to a texel
 * @property {number} w  texels across
 * @property {number} h  texels down
 * @property {number} dpr  the device pixel ratio drawn at (capped at OFF_DPR at Off)
 * @property {number} canvasW  the canvas's CSS width (w × pd / dpr: at least the stage's)
 * @property {number} canvasH
 * @property {boolean} off  Pixel Size Off (smooth, no pixel look)
 */
/** @typedef {{top: number, bottom: number, left: number, right: number}} Insets  CSS px the floor keeps clear of */
/** @typedef {{x: number, y: number, z: number}} XYZ */
/**
 * @typedef {object} View  a camera, in plain numbers (stage.js hands it to three.js)
 * @property {number} fov  vertical, degrees
 * @property {number} elevation  degrees up from the floor
 * @property {number} distance  from the target
 * @property {XYZ} target  the point it looks at
 * @property {XYZ} position
 * @property {{x: number, y: number}} shift  where the target shows, CSS px from the canvas's
 *   centre (an off-centre projection: the image moved, the camera not turned)
 * @property {number} aspect
 * @property {number} near
 * @property {number} far
 * @property {number} canvasW  CSS px
 * @property {number} canvasH
 */

/** NEWT's sprite resolutions: about this many texels tall in the default view. */
export const RESOLUTIONS = [16, 24, 32, 48, 64, 96, 128, 192, 256];
/** @type {PixelSize[]} the resolutions' Pixel Sizes, '16' to '256' */
const RESOLUTION_SIZES = /** @type {PixelSize[]} */ (RESOLUTIONS.map(String));
/**
 * @type {PixelSize[]} Pixel Size's values, coarse to fine, then Native (a texel a device pixel,
 *   the pixel look on), then Off (the screen's pixels, smooth)
 */
export const PIXEL_SIZES = [...RESOLUTION_SIZES, 'native', 'off'];
/**
 * The Pixel Size until the user picks one: 128×128, the user's Default look (2 device px a texel
 * on a 390-wide phone at DPR 3; on a 1280×800 desktop it comes to Native's 1 px). Changing the
 * default is this one line.
 * @type {PixelSize}
 */
export const DEFAULT_PIXEL = '128';
/** Pixel Size Off draws at the device's pixels up to this ratio (Native's DPR is never capped). */
export const OFF_DPR = 2;
/**
 * NEWT's height in the default view, as a share of the stage's short side, whatever the Pixel
 * Size: NEWT_SHARE on a desktop, PHONE_SHARE (about 30% bigger) on a phone, a stage whose short
 * side is under PHONE_SIDE CSS px (99 CSS px and 149 texels at the default size on a 390-wide
 * phone).
 */
export const NEWT_SHARE = 0.195;
export const PHONE_SHARE = 0.255;
export const PHONE_SIDE = 600;

/**
 * Whether a stage `cssW` × `cssH` is a phone's: its short side under PHONE_SIDE CSS px (NEWT is
 * drawn bigger there, and the camera follows him at the default zoom: camera.js).
 * @param {number} cssW
 * @param {number} cssH
 */
export const compactStage = (cssW, cssH) => Math.min(cssW, cssH) < PHONE_SIDE;

/**
 * NEWT's height in the default view as a share of a stage's short side.
 * @param {number} cssW
 * @param {number} cssH
 */
export const newtShare = (cssW, cssH) => (compactStage(cssW, cssH) ? PHONE_SHARE : NEWT_SHARE);
/**
 * NEWT's height in the default view, device px: his share of the short side (the framing's,
 * frameView; a desktop's view can back off a little further for the play area, never on the
 * screens the round checks).
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} dpr
 */
export const newtDevicePx = (cssW, cssH, dpr) =>
  newtShare(cssW, cssH) * Math.min(Math.max(1, cssW), Math.max(1, cssH)) * (dpr || 1);

/**
 * A Pixel Size's resolution N, or null (Native, Off, or not a step).
 * @param {unknown} pixelSize
 */
export const resolutionOf = (pixelSize) =>
  RESOLUTION_SIZES.includes(/** @type {PixelSize} */ (pixelSize)) ? Number(pixelSize) : null;

/**
 * Device px a texel at resolution `n` on a stage `cssW` × `cssH` at `dpr`: whole pixels, so NEWT
 * is about `n` texels tall (every pixel there is, once that would be under 1).
 * @param {number} n
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} dpr
 */
export const blockFor = (n, cssW, cssH, dpr) => Math.max(1, Math.round(newtDevicePx(cssW, cssH, dpr) / n));

/** How far past a block's boundary (in blocks) the zoom goes before a held block gives way. */
export const ZOOM_HOLD = 0.1;
/** Within this of k 1 (the default view) the block is the Pixel Size's own, never a held one. */
const HOME_ZOOM = 0.02;

/**
 * Device px a texel at resolution `n` with the camera zoomed by `zoom` (k: NEWT's size on screen
 * over the default view's), so he stays about `n` texels tall at any zoom: whole pixels, at least
 * one. `held`, the block in use, is kept while the zoom is within ZOOM_HOLD of a block past its
 * boundary (a zoom wobbling across it would otherwise switch the grid back and forth), except in
 * the default view, which always draws the Pixel Size's own grid.
 * @param {number} n
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} dpr
 * @param {number} [zoom]
 * @param {number} [held]
 */
export function blockAt(n, cssW, cssH, dpr, zoom = 1, held = 0) {
  const k = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const ideal = (newtDevicePx(cssW, cssH, dpr) * k) / n;
  const pd = Math.max(1, Math.round(ideal));
  const home = Math.abs(k - 1) < HOME_ZOOM;
  if (!home && held >= 1 && held !== pd && Math.abs(ideal - held) <= 0.5 + ZOOM_HOLD) return held;
  return pd;
}

/**
 * The Pixel Sizes a stage `cssW` × `cssH` at `dpr` lists, coarse to fine, then Native, then Off:
 * one a block size. Two resolutions that come to the same block here draw the same picture, so
 * they're one step, shown as the one whose N is nearest (by ratio) NEWT's real height in texels
 * there; the resolutions that come to 1 px here are Native's (the same grid), so Native stands
 * for them and the slider never shows two steps alike.
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} dpr
 * @returns {PixelStep[]}
 */
export function pixelSteps(cssW, cssH, dpr) {
  const tall = newtDevicePx(cssW, cssH, dpr);
  const off = (n) => Math.abs(Math.log(n / tall) + Math.log(blockFor(n, cssW, cssH, dpr)));
  /** @type {PixelStep[]} */
  const steps = [];
  for (const n of RESOLUTIONS) {
    const pd = blockFor(n, cssW, cssH, dpr);
    const value = /** @type {PixelSize} */ (String(n));
    const last = steps.at(-1);
    if (last?.pd === pd) {
      last.covers.push(value);
      if (off(n) < off(/** @type {number} */ (last.n))) Object.assign(last, { value, n });
    } else steps.push({ value, n, pd, texels: tall / pd, covers: [value] });
  }
  // (The finest step at 1 px a texel draws just what Native does: it folds into Native.)
  const covers = steps.at(-1)?.pd === 1 ? /** @type {PixelStep} */ (steps.pop()).covers : [];
  steps.push({ value: 'native', n: null, pd: 1, texels: tall, covers: [...covers, 'native'] });
  steps.push({ value: 'off', n: null, pd: 1, texels: 0, covers: ['off'] });
  return steps;
}

/**
 * The listed step a Pixel Size shows as on a screen (one of its pixelSteps): the one that
 * stands for it (the step with its block; the default's for anything else).
 * @param {unknown} pixelSize
 * @param {PixelStep[]} steps
 */
export const stepFor = (pixelSize, steps) =>
  steps.find((s) => s.covers.includes(/** @type {PixelSize} */ (pixelSize))) ??
  steps.find((s) => s.covers.includes(DEFAULT_PIXEL)) ??
  steps[0];

/** The camera: vertical field of view and elevation in degrees, near and far in world units. */
export const VIEW = { fov: 20, elevation: 36, near: 1, far: 120 };
/**
 * NEWT standing at the origin, facing +z, seen from his side: the convex hull of the glb's
 * vertices (× 0.16, world units) as [z, y] (his hair at the back, the fringe, the top of his
 * head, his toes). His height on screen is this hull's, from the camera's angle.
 * @type {Array<[number, number]>}
 */
export const NEWT_SIDE = [
  [-0.181, 0.84],
  [-0.179, 0.801],
  [-0.129, 0.062],
  [-0.09, 0],
  [0.112, 0],
  [0.321, 0.823],
  [0.146, 0.965],
  [0.095, 0.997],
  [-0.024, 1.001],
  [-0.13, 0.958],
  [-0.159, 0.924],
];
/** The top of his head, world units (the hull's highest point). */
const NEWT_TOP = Math.max(...NEWT_SIDE.map(([, y]) => y));
/** The height the camera looks at: NEWT's middle. */
export const FOCUS_Y = 0.5;
/** His head (his hair, which frames his face; the ears reach to 0.237): its centre and half its width. */
export const HEAD = { y: 0.8, r: 0.195 };
/** The 4×4 ordered-dither thresholds, row by row: (0..15 + ½) / 16. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const RAD = Math.PI / 180;

/**
 * The canvas's texel grid for a stage `cssW` × `cssH` at `dpr` (`devW`/`devH`: the stage in
 * device pixels where the browser measured them, devicePixelContentBoxSize), with the camera
 * zoomed by `zoom` (blockAt: at a resolution, the texel follows it; `held`, the block in use) and
 * `coarser` device px added to every texel (the frame-time governor's; never at Off).
 * @param {{cssW: number, cssH: number, dpr: number, pixelSize: PixelSize, devW?: number, devH?: number, zoom?: number, coarser?: number, held?: number}} o
 * @returns {Grid}
 */
export function texelGrid({ cssW, cssH, dpr, pixelSize, devW, devH, zoom = 1, coarser = 0, held = 0 }) {
  cssW = Math.max(1, cssW);
  cssH = Math.max(1, cssH);
  // (The resolution: NEWT about N texels tall; Native a texel a device pixel at the real DPR;
  // Off, or anything else, the screen's pixels with the DPR capped.)
  const n = resolutionOf(pixelSize);
  const off = n === null && pixelSize !== 'native';
  const d = off ? Math.min(dpr || 1, OFF_DPR) : dpr || 1;
  // (The browser's measured device pixels only hold at the real DPR, not a capped one, and
  // only when they agree with it: an emulated DPR leaves them at CSS size.)
  const near = (dev, css) => !off && dev > 0 && Math.abs(dev - css * d) <= Math.max(2, d);
  const dw = near(devW, cssW) ? devW : cssW * d;
  const dh = near(devH, cssH) ? devH : cssH * d;
  const k = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const more = off ? 0 : Math.max(0, Math.round(coarser || 0));
  const pd = (n === null ? 1 : blockAt(n, cssW, cssH, d, k, held)) + more;
  const w = Math.max(1, Math.ceil(dw / pd - 1e-6));
  const h = Math.max(1, Math.ceil(dh / pd - 1e-6));
  return { pd, w, h, dpr: d, canvasW: (w * pd) / d, canvasH: (h * pd) / d, off, zoom: k, coarser: more };
}

/** Where a camera at `distance` and `elevation` above `target` sits. */
function placed(target, distance, elevation) {
  const e = elevation * RAD;
  return {
    x: target.x,
    y: target.y + distance * Math.sin(e),
    z: target.z + distance * Math.cos(e),
  };
}

/**
 * A world point on the canvas, in CSS px from its top-left (`depth`: along the view, world
 * units). The camera has no roll and looks along −z (x is across).
 * @param {View} view
 * @param {XYZ} p
 */
export function project(view, p) {
  const e = view.elevation * RAD;
  const c = view.position;
  const vx = p.x - c.x;
  const vy = p.y - c.y;
  const vz = p.z - c.z;
  const up = vy * Math.cos(e) - vz * Math.sin(e);
  const depth = -vy * Math.sin(e) - vz * Math.cos(e);
  const t = Math.tan((view.fov * RAD) / 2);
  const nx = vx / (depth * t * view.aspect);
  const ny = up / (depth * t);
  const shift = view.shift ?? { x: 0, y: 0 };
  return { x: ((nx + 1) / 2) * view.canvasW + shift.x, y: ((1 - ny) / 2) * view.canvasH + shift.y, depth };
}

/** NEWT at the origin on screen: his top and bottom, CSS px. */
function newtBox(view) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const [z, y] of NEWT_SIDE) {
    const s = project(view, { x: 0, y, z });
    top = Math.min(top, s.y);
    bottom = Math.max(bottom, s.y);
  }
  return { top, bottom };
}

/**
 * NEWT's height in texels, standing where he starts (the origin), at the camera's zoom the grid
 * was sized for (`view` is the default view; zoomed by k he's k times as tall on screen).
 * @param {View} view
 * @param {Grid} grid
 */
export function newtTexels(view, grid) {
  const { top, bottom } = newtBox(view);
  return (((bottom - top) * grid.h) / view.canvasH) * (grid.zoom > 0 ? grid.zoom : 1);
}

/**
 * His head's width in texels, standing where he starts (the origin).
 * @param {View} view
 * @param {Grid} grid
 */
export function headTexels(view, grid) {
  const a = project(view, { x: -HEAD.r, y: HEAD.y, z: 0 });
  const b = project(view, { x: HEAD.r, y: HEAD.y, z: 0 });
  return ((b.x - a.x) * grid.w) / view.canvasW;
}

/** The smallest x in [lo, hi] for which `ok(x)` holds (it holds for every larger x). */
function least(lo, hi, ok) {
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) hi = m;
    else lo = m;
  }
  return hi;
}

/**
 * The insets that leave NEWT the clear space beside a panel covering `cover` (the open Look
 * sheet, CSS px from the stage's top-left; null: nothing covers, `insets` themselves), each
 * also clear of `insets` and `gap` px from the panel: the space above it where he fits there
 * with room to spare (1.5 times his height `tall`, CSS px, and as wide), else whichever of above,
 * left of it and right of it holds him biggest (he's about half as wide as he's tall).
 * @param {{cssW: number, cssH: number, insets: Insets, cover: {left: number, top: number, right: number, bottom: number}|null, tall: number, gap?: number}} o
 * @returns {Insets}
 */
export function clearInsets({ cssW, cssH, insets, cover, tall, gap = 8 }) {
  if (!cover) return insets;
  const above = { ...insets, bottom: Math.max(insets.bottom, cssH - cover.top + gap) };
  const left = { ...insets, right: Math.max(insets.right, cssW - cover.left + gap) };
  const right = { ...insets, left: Math.max(insets.left, cover.right + gap) };
  const w = (i) => cssW - i.left - i.right;
  const h = (i) => cssH - i.top - i.bottom;
  if (h(above) >= 1.5 * tall && w(above) >= tall) return above;
  const room = (i) => Math.min(2 * w(i), h(i));
  return [above, left, right].reduce((a, b) => (room(b) > room(a) ? b : a));
}

/**
 * The default camera for a stage `cssW` × `cssH` drawn at `grid` (the camera's aspect and the
 * canvas's CSS size): NEWT `share` of the short side tall (newtShare's by default), or on a
 * desktop smaller where a play area of radius `area` around the origin wouldn't all show (its
 * rim over the toolbar and inside the sides, his head at its back under the top; a phone's view
 * never backs off for it), looking at his middle (standing at the origin) from yaw 0, shifted
 * to the middle of the space `focus` leaves (`insets` by default: over the toolbar; the clear
 * space beside the open Look sheet, clearInsets, without changing how far back it is). (`fov`
 * and `elevation` default to VIEW's.)
 * @param {{cssW: number, cssH: number, grid: Grid, insets: Insets, focus?: Insets, share?: number, fov?: number, elevation?: number, area?: number}} o
 * @returns {View}
 */
export function frameView({
  cssW,
  cssH,
  grid,
  insets,
  focus = insets,
  share = newtShare(cssW, cssH),
  fov = VIEW.fov,
  elevation = VIEW.elevation,
  area = 0,
}) {
  const target = { x: 0, y: FOCUS_Y, z: 0 };
  /** Where the point it looks at shows, CSS px from the canvas's centre: the middle of the space `i` leaves. */
  const middleOf = (i) => ({
    x: (i.left + cssW - i.right) / 2 - grid.canvasW / 2,
    y: (i.top + cssH - i.bottom) / 2 - grid.canvasH / 2,
  });
  /** The camera `distance` back, the point it looks at shown at `shift`. */
  const at = (distance, shift = middleOf(insets)) => ({
    fov,
    elevation,
    near: VIEW.near,
    far: VIEW.far,
    aspect: grid.w / grid.h,
    canvasW: grid.canvasW,
    canvasH: grid.canvasH,
    distance,
    target,
    position: placed(target, distance, elevation),
    shift,
  });
  // NEWT's height, CSS px.
  const newtCss = share * Math.min(Math.max(1, cssW), Math.max(1, cssH));
  // NEWT's size first: the distance at which he's that tall.
  let distance = least(2, 400, (d) => {
    const { top, bottom } = newtBox(at(d));
    return bottom - top <= newtCss;
  });
  // Then, on a desktop, back as far as the play area needs to show whole.
  if (area > 0 && !compactStage(cssW, cssH)) {
    const rim = Array.from({ length: 48 }, (_, i) => [
      Math.sin((i / 48) * 2 * Math.PI),
      Math.cos((i / 48) * 2 * Math.PI),
    ]);
    const shows = (d) => {
      const v = at(d);
      return rim.every(([sx, sz]) => {
        const p = project(v, { x: area * sx, y: 0, z: area * sz });
        const head = project(v, { x: area * sx, y: NEWT_TOP, z: area * sz });
        return p.x >= 0 && p.x <= cssW && p.y <= cssH - insets.bottom && head.y >= 0;
      });
    };
    if (!shows(distance)) distance = least(distance, 400, shows);
  }
  // (How far back comes from the default view; `focus` only moves where it shows.)
  return at(distance, middleOf(focus));
}
