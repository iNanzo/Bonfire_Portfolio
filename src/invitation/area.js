// Where NEWT may go in the invitation toy (pure: no three.js, no DOM). The camera orbits and
// zooms, so the play area can't be the floor on screen any more: it's a fixed invisible disc on
// the floor, AREA_RADIUS around the middle, about what a phone shows at the default zoom (a
// desktop's default view, pixels.js frameView, keeps all of it in sight; on a phone, where he's
// drawn bigger, the camera follows him so he stays on screen at its rim). Its rim is his wall for
// walking, wandering, fleeing (he slides along it when cornered) and carrying (the anchor, the
// toss and the fall's bounces): steer.js and carry.js read the disc from the Bounds' `r`.

/** @typedef {import('./types.js').Bounds} Bounds */

/** NEWT's radius on the floor, world units (his body, his toes ahead of his root). */
export const NEWT_RADIUS = 0.25;
/** His height, world units (the top of his hair; pixels.js NEWT_SIDE). */
export const NEWT_HEIGHT = 1.0;
/**
 * The play area's radius, world units: where his root may go. A 390 px phone at the default
 * zoom shows about ±1.9 across his middle, edge to edge (his size there: pixels.js
 * PHONE_SHARE), and its camera follows him most of the way (camera.js ORBIT.phoneFollow), which
 * keeps all of him (his body's 0.25 too) on that screen at the rim, whichever way it has turned.
 */
export const AREA_RADIUS = 2.0;

/**
 * The play area: a disc of `radius` around (`x`, `z`), as Bounds (its square, and `r`).
 * @param {number} [radius]
 * @param {{x: number, z: number}} [centre]
 * @returns {Bounds}
 */
export function playArea(radius = AREA_RADIUS, { x, z } = { x: 0, z: 0 }) {
  return { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius, r: radius };
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
