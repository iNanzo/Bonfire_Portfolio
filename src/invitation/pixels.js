// The invitation toy's pixel grid and camera framing (pure: no three.js, no DOM).
//
// The grid: the scene is drawn at texel size and CSS `image-rendering: pixelated` stretches it.
// A texel is a whole number of device pixels, pd = round(cssPx × dpr), where cssPx makes the
// short side about the Pixel Size's target count (Fine ~270, DS ~200, Chunky ~150 texels: each
// look preset carries its own table). The canvas is w × h texels, just covering the stage, and
// its CSS size w × pd / dpr is a little larger than the stage (which hides the overhang). Pixel
// Size Off draws at native size, its DPR capped at 2.
//
// The framing: a camera 36° up, low enough that his cap's brim leaves his face showing once he
// looks toward the camera (from 48° it hid the whole face; at 36° his look lifts his head the
// rest of the way: the highest angle at which his eyes read on a 390×844 phone), and 20° of
// view: the floor on screen is his play area (area.js), and a narrow view keeps him nearly the
// same size all over it (32 to 43 texels on a phone at DS, where 30° gave 27 to 46). There's no
// room: NEWT stands on an invisible floor on a plain background, and the camera only places
// him. He's 38 texels tall at the default size (DS) whatever the screen (his height as the
// camera sees it: NEWT_SIDE), standing at the origin in the middle of the space over the
// toolbar. The framing is the same at every Pixel Size: NEWT just has more or fewer texels.

/** @typedef {'off'|'fine'|'ds'|'chunky'} PixelSize */
/** @typedef {{fine: number, ds: number, chunky: number}} TexelTable  target texels on the short side */
/**
 * @typedef {object} Grid  the canvas in texels
 * @property {number} pd  device pixels per texel (1 at native size)
 * @property {number} w  texels across
 * @property {number} h  texels down
 * @property {number} dpr  the device pixel ratio drawn at (capped at native size)
 * @property {number} canvasW  the canvas's CSS width (w × pd / dpr: at least the stage's)
 * @property {number} canvasH
 * @property {boolean} native  Pixel Size Off
 */
/** @typedef {{top: number, bottom: number, left: number, right: number}} Insets  CSS px the floor keeps clear of */
/** @typedef {{x: number, y: number, z: number}} XYZ */
/**
 * @typedef {object} View  a camera, in plain numbers (stage.js hands it to three.js)
 * @property {number} fov  vertical, degrees
 * @property {number} elevation  degrees up from the floor
 * @property {number} distance  from the target
 * @property {XYZ} target
 * @property {XYZ} position
 * @property {number} aspect
 * @property {number} near
 * @property {number} far
 * @property {number} canvasW  CSS px
 * @property {number} canvasH
 */

/** @type {PixelSize[]} */
export const PIXEL_SIZES = ['off', 'fine', 'ds', 'chunky'];
/** @type {TexelTable} */
export const TEXELS = { fine: 270, ds: 200, chunky: 150 };
/** @type {PixelSize} */
export const DEFAULT_PIXEL = 'ds';
/** Pixel Size Off draws at the device's pixels, up to this ratio. */
export const NATIVE_DPR = 2;
/** NEWT's height in texels at the default size. */
export const NEWT_TEXELS = 38;
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
/** His head (his hair, which frames his face; the ears reach to 0.237): its centre and half its width. */
export const HEAD = { y: 0.8, r: 0.195 };
/** The 4×4 ordered-dither thresholds, row by row: (0..15 + ½) / 16. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const RAD = Math.PI / 180;

/**
 * The canvas's texel grid for a stage `cssW` × `cssH` at `dpr` (`devW`/`devH`: the stage in
 * device pixels where the browser measured them, devicePixelContentBoxSize).
 * @param {{cssW: number, cssH: number, dpr: number, pixelSize: PixelSize, texels?: TexelTable, devW?: number, devH?: number}} o
 * @returns {Grid}
 */
export function texelGrid({ cssW, cssH, dpr, pixelSize, texels = TEXELS, devW, devH }) {
  cssW = Math.max(1, cssW);
  cssH = Math.max(1, cssH);
  const native = pixelSize === 'off' || !texels[pixelSize];
  const d = native ? Math.min(dpr || 1, NATIVE_DPR) : dpr || 1;
  // (The browser's measured device pixels only hold at the real DPR, not a capped one, and
  // only when they agree with it: an emulated DPR leaves them at CSS size.)
  const near = (dev, css) => !native && dev > 0 && Math.abs(dev - css * d) <= Math.max(2, d);
  const dw = near(devW, cssW) ? devW : cssW * d;
  const dh = near(devH, cssH) ? devH : cssH * d;
  const pd = native ? 1 : Math.max(1, Math.round((Math.min(cssW, cssH) / texels[pixelSize]) * d));
  const w = Math.max(1, Math.ceil(dw / pd - 1e-6));
  const h = Math.max(1, Math.ceil(dh / pd - 1e-6));
  return { pd, w, h, dpr: d, canvasW: (w * pd) / d, canvasH: (h * pd) / d, native };
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
  return { x: ((nx + 1) / 2) * view.canvasW, y: ((1 - ny) / 2) * view.canvasH, depth };
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
 * NEWT's height in texels, standing where he starts (the origin).
 * @param {View} view
 * @param {Grid} grid
 */
export function newtTexels(view, grid) {
  const { top, bottom } = newtBox(view);
  return ((bottom - top) * grid.h) / view.canvasH;
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
 * The camera for a stage `cssW` × `cssH` drawn at `grid` (the camera's aspect and the canvas's
 * CSS size): NEWT `newt` texels tall at the default size's grid (`texels` on the short side),
 * standing at the origin in the middle of the space `insets` leave (over the toolbar).
 * (`fov` and `elevation` default to VIEW's.)
 * @param {{cssW: number, cssH: number, dpr: number, grid: Grid, insets: Insets, texels?: number, newt?: number, fov?: number, elevation?: number}} o
 * @returns {View}
 */
export function frameView({
  cssW,
  cssH,
  dpr,
  grid,
  insets,
  texels = TEXELS[DEFAULT_PIXEL],
  newt = NEWT_TEXELS,
  fov = VIEW.fov,
  elevation = VIEW.elevation,
}) {
  const base = {
    fov,
    elevation,
    near: VIEW.near,
    far: VIEW.far,
    aspect: grid.w / grid.h,
    canvasW: grid.canvasW,
    canvasH: grid.canvasH,
  };
  // NEWT's height at the default size, in CSS px (its texels are whole device pixels too).
  const pd = Math.max(1, Math.round((Math.min(cssW, cssH) / texels) * (dpr || 1)));
  const newtCss = (newt * pd) / (dpr || 1);
  /** The camera `distance` back, aimed at (tx, 0, tz). */
  const at = (distance, tx, tz) => {
    const target = { x: tx, y: 0, z: tz };
    return { ...base, distance, target, position: placed(target, distance, elevation) };
  };
  // NEWT's size first: the distance at which he's `newt` texels tall.
  const distance = least(2, 400, (d) => {
    const { top, bottom } = newtBox(at(d, 0, 0));
    return bottom - top <= newtCss;
  });
  // Then the aim that puts his middle halfway down the free band and across between the side
  // insets (a target further forward moves him up the screen; one to his left, right).
  const middle = { x: 0, y: 0.5, z: 0 };
  const midY = (insets.top + cssH - insets.bottom) / 2;
  const midX = (insets.left + cssW - insets.right) / 2;
  const reach = distance / 2;
  const tz = least(-reach, reach, (z) => project(at(distance, 0, z), middle).y <= midY);
  const tx = least(-reach, reach, (x) => project(at(distance, x, tz), middle).x <= midX);
  return at(distance, tx, tz);
}
