// Ray helpers for the invitation hold tests (test/invitationHold*.test.mjs,
// test/invitationHeldFeel.test.mjs): where a ray reaches a height and the closest point on a ray,
// as the tests reason about the bead hold's geometry (src/invitation/hold.js has what the page
// itself uses).
import { along, unitRay } from '../../src/invitation/hold.js';

/** @typedef {{x: number, y: number, z: number}} XYZ */
/** @typedef {{o: XYZ, d: XYZ}} Ray */

/**
 * Where a ray reaches height `y`, or null when it never does (level, or the height behind it).
 * @param {Ray} ray
 * @param {number} y
 * @returns {XYZ|null}
 */
export function rayAtY(ray, y) {
  const r = unitRay(ray);
  if (Math.abs(r.d.y) < 1e-9) return null;
  const s = (y - r.o.y) / r.d.y;
  return s >= 0 ? along(r, s) : null;
}

/**
 * The closest point on a ray to `p` (never behind it).
 * @param {Ray} ray
 * @param {XYZ} p
 * @returns {XYZ}
 */
export function closestOnRay(ray, p) {
  const r = unitRay(ray);
  const s = (p.x - r.o.x) * r.d.x + (p.y - r.o.y) * r.d.y + (p.z - r.o.z) * r.d.z;
  return along(r, Math.max(0, s));
}
