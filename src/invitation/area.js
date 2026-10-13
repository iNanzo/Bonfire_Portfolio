// Where NEWT may go in the invitation toy (pure: no three.js, no DOM). There's no room: the play
// area is the floor that shows on screen, over the toolbar and inset from the screen's edges
// (the insets: about 24 CSS px from the sides, a top margin, the toolbar, the safe areas), and
// those edges are his walls for walking, wandering, fleeing and carrying. It's worked out from
// the camera (pixels.js View) whenever the stage resizes, as where his root may stay:
//   - front: his toes (his radius ahead of his root) stay over the toolbar;
//   - back: the top of his head stays under the top margin;
//   - sides: his body's edge, at his feet and at his head (which leans out further on screen),
//     stays inside the side insets. Perspective widens the floor on screen toward the back, so
//     the sides are measured at the front (minX, maxX) and at the back (minXBack, maxXBack):
//     a trapezoid, straight sides between (a screen edge is a straight line on the floor).
// A screen too small for all that gives a single spot (its middle), never an empty or NaN area.

import { project } from './pixels.js';

/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./pixels.js').View} View */
/** @typedef {import('./pixels.js').Insets} Insets */

/** NEWT's radius on the floor, world units (his body, his toes ahead of his root). */
export const NEWT_RADIUS = 0.25;
/** His height, world units (the top of his hair; pixels.js NEWT_SIDE). */
export const NEWT_HEIGHT = 1.0;
/** How far from the target the search looks, world units (the floor shows far less). */
const REACH = 200;

/**
 * The value in [lo, hi] where `ok` turns from true to false (true below it), by bisection.
 * @param {number} lo
 * @param {number} hi
 * @param {(v: number) => boolean} ok
 */
function edge(lo, hi, ok) {
  if (!ok(lo)) return lo;
  if (ok(hi)) return hi;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) lo = m;
    else hi = m;
  }
  return lo;
}

/**
 * Where NEWT's root may stay (a trapezoid: the Bounds of types.js with its back corners), for
 * the camera `view` over a stage `cssW` × `cssH` CSS px with `insets` kept clear.
 * @param {View} view
 * @param {{cssW: number, cssH: number, insets: Insets, radius?: number, height?: number}} o
 * @returns {Bounds}
 */
export function playArea(view, { cssW, cssH, insets, radius = NEWT_RADIUS, height = NEWT_HEIGHT }) {
  const tz = view.target.z;
  const tx = view.target.x;
  // (Points must stay in front of the camera: the search stops short of it.)
  const near = view.position.z - view.near - radius;
  const sy = (p) => project(view, p).y;
  // Front: his toes stay over the toolbar (further forward is lower on screen).
  let maxZ = edge(tz - REACH, near, (z) => sy({ x: tx, y: 0, z: z + radius }) <= cssH - insets.bottom);
  // Back: the top of his head stays under the top margin (further back is higher on screen).
  let minZ = -edge(-near, REACH - tz, (nz) => sy({ x: tx, y: height, z: -nz - radius }) >= insets.top);
  if (minZ > maxZ) minZ = maxZ = (minZ + maxZ) / 2;
  // The sides at a depth, by his feet and his head.
  const inside = (x, side, z) =>
    [0, height].every((y) => {
      const px = project(view, { x: x + side * radius, y, z }).x;
      return side > 0 ? px <= cssW - insets.right : px >= insets.left;
    });
  const sides = (z) => {
    const hi = edge(tx - REACH, tx + REACH, (x) => inside(x, 1, z));
    const lo = -edge(-tx - REACH, -tx + REACH, (nx) => inside(-nx, -1, z));
    return lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2];
  };
  const [minX, maxX] = sides(maxZ);
  const [minXBack, maxXBack] = sides(minZ);
  return { minX, maxX, minZ, maxZ, minXBack, maxXBack };
}
