// Where NEWT may go in the invitation toy (pure: no three.js, no DOM). The floor is endless, so
// the play area is the floor the default view shows fully zoomed out (viewArea: twice the
// default distance, yaw 0, no pan, inside the clear space over the toolbar, NEWT whole a margin
// in from its edges wherever he stands), a fixed region on the floor that the camera's turns,
// pans and zooms never move; main.js works it out again on a resize. Its edges are his walls for
// walking, wandering, fleeing (he slides along them when cornered) and carrying (the anchor, the
// toss and the fall's bounces), and the camera's pan keeps to it (camera.js): steer.js and
// carry.js read it as Bounds, a trapezoid widening toward the back (perspective: the far edge of
// the screen holds more floor than the near one). The disc it replaced, AREA_RADIUS round the
// middle, is still what a desktop's default view keeps in sight (stage.js, pixels.js frameView).

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
 * The play area: the floor the default `view` (pixels.js frameView, its focus whatever it is)
 * shows `zoom` times as far back, from yaw 0 and looking at its own target, the point it looks at
 * shown in the middle of the clear space `insets` leave in a `cssW` × `cssH` stage (so the open
 * Look sheet, which only shifts the view, never changes it), NEWT whole (his height, his radius
 * round his root) `margin` CSS px inside that clear space wherever his root is in it: his toes
 * at its bottom on the front edge, the back of his head at its top on the back edge, his side at
 * its sides at the corners. A trapezoid widening toward the back (Bounds' minXBack/maxXBack:
 * screen sides are straight lines on the floor, and his head, further out than his feet, sets
 * them). A clear space too small to hold him falls back on the default view's disc.
 * @param {{view: View, cssW: number, cssH: number, insets: Insets, zoom?: number, margin?: number}} o
 * @returns {Bounds}
 */
export function viewArea({ view, cssW, cssH, insets, zoom = ZOOMED_OUT, margin = AREA_MARGIN }) {
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
  if (clear.right - clear.left < 4 || clear.bottom - clear.top < 4) return playArea();
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
  if (!(maxZ > minZ && maxX > minX && maxXBack > minXBack)) return playArea();
  return { minX, maxX, minZ, maxZ, minXBack, maxXBack };
}

/**
 * Points around a play area's edge, `n` of them (a disc's rim, or a box's corners).
 * @param {Bounds} b
 * @param {number} [n]
 * @returns {Array<{x: number, z: number}>}
 */
export function rimPoints(b, n = 32) {
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
