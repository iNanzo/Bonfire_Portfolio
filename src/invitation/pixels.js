// The invitation toy's pixel grid and camera framing (pure: no three.js, no DOM).
//
// The grid: the scene is drawn at texel size and CSS `image-rendering: pixelated` stretches it.
// Pixel Size is an explicit step, Off, 2×, 3× or 4× (2× by default): at N× a texel is N×N CSS
// px, as a whole number of device pixels, pd = round(N × dpr) (6, 9 or 12 on a phone at DPR 3).
// The canvas is w × h texels, just covering the stage, and its CSS size w × pd / dpr is a
// little larger than the stage (which hides the overhang). Pixel Size Off draws at native
// size, its DPR capped at 2.
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
// a 390-wide phone, 50 texels at the default size there), and the view never backs off for the
// disc (the camera follows him there instead, so he stays on screen at its rim). The point the
// camera looks at (his middle, at the origin) sits in the middle of the space over the
// toolbar: the view is shifted
// there (View.shift, an off-centre projection: stage.js camera.setViewOffset), so it stays
// there however the camera turns. The framing never reads the Pixel Size: a bigger block only
// makes chunkier pixels, and a bigger screen gives him more texels.

/** @typedef {'off'|'2'|'3'|'4'} PixelSize  Off, or N× (a texel N×N CSS px) */
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

/** @type {PixelSize[]} */
export const PIXEL_SIZES = ['off', '2', '3', '4'];
/** @type {PixelSize} */
export const DEFAULT_PIXEL = '2';
/** Pixel Size Off draws at the device's pixels, up to this ratio. */
export const NATIVE_DPR = 2;
/**
 * NEWT's height in the default view, as a share of the stage's short side, whatever the Pixel
 * Size: NEWT_SHARE on a desktop, PHONE_SHARE (about 30% bigger) on a phone, a stage whose short
 * side is under PHONE_SIDE CSS px (99 CSS px and 50 texels at the default size on a 390-wide
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
 * device pixels where the browser measured them, devicePixelContentBoxSize).
 * @param {{cssW: number, cssH: number, dpr: number, pixelSize: PixelSize, devW?: number, devH?: number}} o
 * @returns {Grid}
 */
export function texelGrid({ cssW, cssH, dpr, pixelSize, devW, devH }) {
  cssW = Math.max(1, cssW);
  cssH = Math.max(1, cssH);
  // (The step: N CSS px a texel at N×; Off, or anything else, draws natively.)
  const step = PIXEL_SIZES.includes(pixelSize) ? Number(pixelSize) : NaN;
  const native = !(step >= 1);
  const d = native ? Math.min(dpr || 1, NATIVE_DPR) : dpr || 1;
  // (The browser's measured device pixels only hold at the real DPR, not a capped one, and
  // only when they agree with it: an emulated DPR leaves them at CSS size.)
  const near = (dev, css) => !native && dev > 0 && Math.abs(dev - css * d) <= Math.max(2, d);
  const dw = near(devW, cssW) ? devW : cssW * d;
  const dh = near(devH, cssH) ? devH : cssH * d;
  const pd = native ? 1 : Math.max(1, Math.round(step * d));
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
 * The default camera for a stage `cssW` × `cssH` drawn at `grid` (the camera's aspect and the
 * canvas's CSS size): NEWT `share` of the short side tall (newtShare's by default), or on a
 * desktop smaller where a play area of radius `area` around the origin wouldn't all show (its
 * rim over the toolbar and inside the sides, his head at its back under the top; a phone's view
 * never backs off for it), looking at his middle (standing at the origin) from yaw 0, shifted
 * to the middle of the space `insets` leave (over the toolbar). (`fov` and `elevation` default
 * to VIEW's.)
 * @param {{cssW: number, cssH: number, grid: Grid, insets: Insets, share?: number, fov?: number, elevation?: number, area?: number}} o
 * @returns {View}
 */
export function frameView({
  cssW,
  cssH,
  grid,
  insets,
  share = newtShare(cssW, cssH),
  fov = VIEW.fov,
  elevation = VIEW.elevation,
  area = 0,
}) {
  const target = { x: 0, y: FOCUS_Y, z: 0 };
  const shift = {
    x: (insets.left + cssW - insets.right) / 2 - grid.canvasW / 2,
    y: (insets.top + cssH - insets.bottom) / 2 - grid.canvasH / 2,
  };
  /** The camera `distance` back. */
  const at = (distance) => ({
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
  return at(distance);
}
