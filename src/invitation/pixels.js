// The invitation toy's pixel grid and camera framing (pure: no three.js, no DOM).
//
// The grid: the scene is drawn at texel size and CSS `image-rendering: pixelated` stretches it.
// A texel is a whole number of device pixels, pd = round(cssPx × dpr), where cssPx makes the
// short side about the Pixel Size's target count (Fine ~270, DS ~200, Chunky ~150 texels: each
// look preset carries its own table). The canvas is w × h texels, just covering the stage, and
// its CSS size w × pd / dpr is a little larger than the stage (which hides the overhang). Pixel
// Size Off draws at native size, its DPR capped at 2.
//
// The framing: a camera about 30° of view, 48° up, looking in through the room's missing front
// wall. NEWT stands 38 texels tall at the default size (DS) whatever the screen (his height as
// the camera sees it: NEWT_SIDE), the room is as wide as fits between the side margins (clamped
// 3.6–5.6), the floor sits above the toolbar and at least 24 px from the side edges (where iOS
// takes edge swipes). The room is centred in the space over the toolbar; when it's taller than
// that space (a laptop's wide screen) the back wall's top runs off the top, a third of it at
// least still showing. Where all that doesn't fit (a phone on its side) the camera backs off
// until it does. The framing is the same at every Pixel Size: NEWT just has more or fewer texels.

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
 * @property {number} roomWidth
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
/** The room: depth and wall height fixed, the width fitted to the screen. World units. */
export const ROOM = { depth: 4.4, wall: 1.8, minWidth: 3.6, maxWidth: 5.6 };
export const VIEW = { fov: 30, elevation: 48, near: 1, far: 80 };
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
/** When the whole back wall can't fit over the floor, at least this much of it shows. */
const WALL_SHOWN = 0.35;

/** The 4×4 ordered-dither thresholds, row by row: (0..15 + ½) / 16. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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
 * units). The camera has no roll and looks straight down the room (x is across).
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
 * NEWT's height in texels, standing in the middle of the room.
 * @param {View} view
 * @param {Grid} grid
 */
export function newtTexels(view, grid) {
  const { top, bottom } = newtBox(view);
  return ((bottom - top) * grid.h) / view.canvasH;
}

/**
 * His head's width in texels, standing in the middle of the room.
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
 * The camera and the room's width for a stage `cssW` × `cssH` drawn at `grid` (the camera's
 * aspect and the canvas's CSS size), with the floor clear of `insets`, NEWT `newt` texels tall
 * at the default size's grid (`texels` on the short side).
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
  const half = ROOM.depth / 2;
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
  const lo = insets.top;
  const hi = cssH - insets.bottom;
  const frontY = (v) => project(v, { x: 0, y: 0, z: half }).y;
  /**
   * At `distance`, the target that puts the room (the floor's front edge to the back wall's top)
   * halfway down the free band; or, when it's taller than the band, the floor's front edge on
   * the band's bottom (the wall's top then runs off the top of the screen).
   */
  const view = (distance, roomWidth = ROOM.minWidth) => {
    const at = (tz) => {
      const target = { x: 0, y: 0, z: tz };
      return { ...base, distance, roomWidth, target, position: placed(target, distance, elevation) };
    };
    const middle = (v) => (frontY(v) + project(v, { x: 0, y: ROOM.wall, z: -half }).y) / 2;
    // (A target further forward moves the room up the screen.)
    const centred = at(least(-20, 20, (z) => middle(at(z)) <= (lo + hi) / 2));
    return frontY(centred) <= hi ? centred : at(least(-20, 20, (z) => frontY(at(z)) <= hi));
  };
  /** Whether the room fits: the floor in the free band and clear of the sides, the walls on screen. */
  const fits = (v) => {
    const front = project(v, { x: v.roomWidth / 2, y: 0, z: half });
    const frontL = project(v, { x: -v.roomWidth / 2, y: 0, z: half });
    const back = project(v, { x: 0, y: ROOM.wall * WALL_SHOWN, z: -half });
    return (
      front.y <= hi + 1e-6 &&
      back.y >= lo - 1e-6 &&
      frontL.x >= insets.left - 1e-6 &&
      front.x <= cssW - insets.right + 1e-6
    );
  };
  // NEWT's size first: the distance at which he's `newt` texels tall.
  const d0 = least(2, 200, (d) => {
    const { top, bottom } = newtBox(view(d));
    return bottom - top <= newtCss;
  });
  // The room as wide as the side margins allow there (clamped), then backed off if it must.
  const v0 = view(d0);
  const width = clamp(
    least(0.1, 40, (w) => project({ ...v0, roomWidth: w }, { x: w / 2, y: 0, z: half }).x >= cssW - insets.right) -
      1e-4,
    ROOM.minWidth,
    ROOM.maxWidth,
  );
  if (fits(view(d0, width))) return view(d0, width);
  return view(
    least(d0, 400, (d) => fits(view(d, width))),
    width,
  );
}
