// Where NEWT may go in the invitation toy (pure: no three.js, no DOM). The floor is endless, so
// the play area is one shape on it however the camera turns (viewArea): a rounded square round
// the default view's target, the orbit's centre, the biggest that the default view fully zoomed
// out (twice the default distance, yaw 0, no pan) shows him whole in, a margin inside the clear
// space over the toolbar wherever he stands in it. The floor that view shows is a trapezoid
// widening toward the back (perspective: viewFloor), so its narrower span sets the square: a
// phone's width, a desktop's depth. Turned, the walls stay where they were and keep their shape,
// so they never sit mid-screen; the camera's turns, pans and zooms never move it, and main.js
// works it out again on a resize. Its edges are his walls for walking, wandering, fleeing (he
// slides along them when cornered) and carrying (the anchor, the toss and the fall's bounces),
// and the camera's pan keeps to a region inside it (camera.js panRegion): steer.js and carry.js
// read it as Bounds, a box with `round` corners. The disc it replaced, AREA_RADIUS round the
// middle, is still what a desktop's default view keeps in sight and the size of the shadow
// camera's box (stage.js, pixels.js frameView, floor.js fitShadow).

import { project } from './pixels.js';

/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./pixels.js').View} View */
/** @typedef {import('./pixels.js').Insets} Insets */

/** NEWT's radius on the floor, world units (his body, his toes ahead of his root). */
export const NEWT_RADIUS = 0.25;
/** His height, world units (the top of his hair; pixels.js NEWT_SIDE). */
export const NEWT_HEIGHT = 1.0;
/**
 * The default view's disc, world units: a desktop's default view keeps all of it (and his body
 * at its rim) in sight (stage.js passes it to pixels.js frameView). A 390 px phone at the
 * default zoom shows about ±1.9 across his middle, edge to edge.
 */
export const AREA_RADIUS = 2.0;
/** CSS px NEWT keeps from the clear space's edges, standing anywhere in the play area, fully zoomed out. */
export const AREA_MARGIN = 8;
/** The default view zoomed out this far (camera.js ORBIT.zoomMax) shows the play area. */
const ZOOMED_OUT = 2;
/** The play area's corners: their radius, a share of its half side. */
export const AREA_ROUND = 0.35;
const RAD = Math.PI / 180;

/**
 * A disc of `radius` around (`x`, `z`), as Bounds (its square, and `r`): the default view's
 * framing (AREA_RADIUS), and a disc any Bounds reader takes.
 * @param {number} [radius]
 * @param {{x: number, z: number}} [centre]
 * @returns {Bounds}
 */
export function playArea(radius = AREA_RADIUS, { x, z } = { x: 0, z: 0 }) {
  return { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius, r: radius };
}

/** The `x` in [lo, hi] where `f(x)`, increasing, reaches `want` (lo or hi past either end). */
function solve(lo, hi, f, want) {
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (f(m) < want) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * The floor the default `view` (pixels.js frameView, its focus whatever it is) shows `zoom`
 * times as far back, from yaw 0 and looking at its own target, the point it looks at shown in
 * the middle of the clear space `insets` leave in a `cssW` × `cssH` stage (so the open Settings
 * sheet, which only shifts the view, never changes it), where NEWT stands whole (his height, his
 * radius round his root) `margin` CSS px inside that clear space: his toes at its bottom on the
 * front edge, the back of his head at its top on the back edge, his side at its sides at the
 * corners. A trapezoid widening toward the back (Bounds' minXBack/maxXBack: screen sides are
 * straight lines on the floor, and his head, further out than his feet, sets them); null where
 * the clear space is too small to hold him.
 * @param {{view: View, cssW: number, cssH: number, insets: Insets, zoom?: number, margin?: number}} o
 * @returns {Bounds|null}
 */
export function viewFloor({ view, cssW, cssH, insets, zoom = ZOOMED_OUT, margin = AREA_MARGIN }) {
  const e = view.elevation * RAD;
  const t = view.target;
  const distance = view.distance * zoom;
  /** @type {View} */
  const far = {
    ...view,
    distance,
    position: { x: t.x, y: t.y + distance * Math.sin(e), z: t.z + distance * Math.cos(e) },
    shift: {
      x: (insets.left + cssW - insets.right) / 2 - view.canvasW / 2,
      y: (insets.top + cssH - insets.bottom) / 2 - view.canvasH / 2,
    },
  };
  const clear = {
    left: insets.left + margin,
    right: cssW - insets.right - margin,
    top: insets.top + margin,
    bottom: cssH - insets.bottom - margin,
  };
  if (clear.right - clear.left < 4 || clear.bottom - clear.top < 4) return null;
  // (Toward the camera, +z, things show lower down: screen y grows with z. The furthest floor
  // looked at is well short of the horizon at the default view's 36°.)
  const reach = distance * 4;
  const lowest = (p) => project(far, p).y;
  const near = t.z + distance / 2;
  const minZ = solve(t.z - reach, near, (z) => lowest({ x: t.x, y: NEWT_HEIGHT, z: z - NEWT_RADIUS }), clear.top);
  const maxZ = solve(t.z - reach, near, (z) => lowest({ x: t.x, y: 0, z: z + NEWT_RADIUS }), clear.bottom);
  /** His root's x range at depth `z`: his head's side (further out than his feet) inside the clear sides. */
  const sides = (z) => {
    const at = (x) => project(far, { x, y: NEWT_HEIGHT, z }).x;
    const a = at(t.x);
    const per = at(t.x + 1) - a;
    return [t.x + (clear.left - a) / per + NEWT_RADIUS, t.x + (clear.right - a) / per - NEWT_RADIUS];
  };
  const [minX, maxX] = sides(maxZ);
  const [minXBack, maxXBack] = sides(minZ);
  if (!(maxZ > minZ && maxX > minX && maxXBack > minXBack)) return null;
  return { minX, maxX, minZ, maxZ, minXBack, maxXBack };
}

/**
 * A rounded square round (`x`, `z`), `half` from its middle to each side, its corners
 * AREA_ROUND of that round, as Bounds.
 * @param {{x: number, z: number}} c
 * @param {number} half
 * @returns {Bounds}
 */
export function roundSquare({ x, z }, half) {
  return { minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half, round: half * AREA_ROUND };
}

/**
 * Whether `p` is inside trapezoid `b` (its sides straight lines from the front to the back).
 * @param {Bounds} b
 * @param {{x: number, z: number}} p
 */
function inTrapezoid(b, p) {
  if (p.z < b.minZ - 1e-9 || p.z > b.maxZ + 1e-9) return false;
  const k = (b.maxZ - p.z) / (b.maxZ - b.minZ);
  const lo = b.minX + ((b.minXBack ?? b.minX) - b.minX) * k;
  const hi = b.maxX + ((b.maxXBack ?? b.maxX) - b.maxX) * k;
  return p.x >= lo - 1e-9 && p.x <= hi + 1e-9;
}

/**
 * The play area: one shape however the camera turns, a rounded square round the default `view`'s
 * target (the orbit's centre), the biggest whose every point the floor the view shows fully
 * zoomed out holds him whole on (viewFloor), so it's snug where that floor is narrowest. A clear
 * space too small to hold him falls back on the default view's disc.
 * @param {{view: View, cssW: number, cssH: number, insets: Insets, zoom?: number, margin?: number}} o
 * @returns {Bounds}
 */
export function viewArea(o) {
  const floor = viewFloor(o);
  const c = { x: o.view.target.x, z: o.view.target.z };
  if (!floor || !inTrapezoid(floor, c)) return playArea();
  const fits = (half) => rimPoints(roundSquare(c, half), 64).every((p) => inTrapezoid(floor, p));
  let lo = 0;
  let hi = Math.max(floor.maxZ - floor.minZ, (floor.maxXBack ?? floor.maxX) - (floor.minXBack ?? floor.minX));
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo > NEWT_RADIUS ? roundSquare(c, lo) : playArea();
}

/**
 * Points around a play area's edge, `n` of them (a disc's rim, a rounded square's corner arcs,
 * or a box's corners).
 * @param {Bounds} b
 * @param {number} [n]
 * @returns {Array<{x: number, z: number}>}
 */
export function rimPoints(b, n = 32) {
  if (b.r === undefined && b.round) {
    // (A rounded square: round each corner's arc, a quarter of the points each.)
    const r = Math.min(b.round, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2);
    const each = Math.max(2, Math.round(n / 4));
    /** @type {Array<[number, number, number]>} each corner's arc: its middle and its quarter */
    const corners = [
      [b.maxX - r, b.maxZ - r, 0],
      [b.maxX - r, b.minZ + r, 1],
      [b.minX + r, b.minZ + r, 2],
      [b.minX + r, b.maxZ - r, 3],
    ];
    return corners.flatMap(([cx, cz, q]) =>
      Array.from({ length: each }, (_, i) => {
        const a = ((q + i / (each - 1)) * Math.PI) / 2;
        return { x: cx + r * Math.sin(a), z: cz + r * Math.cos(a) };
      }),
    );
  }
  if (b.r === undefined) {
    return [
      { x: b.minX, z: b.maxZ },
      { x: b.maxX, z: b.maxZ },
      { x: b.minXBack ?? b.minX, z: b.minZ },
      { x: b.maxXBack ?? b.maxX, z: b.minZ },
    ];
  }
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { x: cx + b.r * Math.sin(a), z: cz + b.r * Math.cos(a) };
  });
}
