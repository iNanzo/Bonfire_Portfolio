// Where NEWT may go in the invitation toy (pure: no three.js, no DOM). The floor is endless, so
// the play area is one shape on it however the camera turns (viewArea): a disc round the default
// view's target, the orbit's centre, holding all the floor the default view shows edge to edge
// at the default zoom, turned any way round that centre, so a tap anywhere on the screen reaches
// it. The floor that view shows is a trapezoid widening toward the back (perspective: its top
// corners are the farthest), and turned it sweeps a disc, so the disc's rim is his radius past
// those corners: a tall phone's is the biggest, as it sees furthest back. That's more floor
// than the screen shows at any one yaw, so wander goals keep to what's on screen when they're
// picked and a flee to what was on screen as it began (steer.js, Bounds.sight from camera.js
// orbitSight), and the camera's soft follow keeps him in view. The walls stay where they are
// however the camera turns, pans and zooms; main.js works the disc out again on a resize. Its
// edges are his walls for walking,
// wandering, fleeing (he slides along them when cornered) and carrying (the anchor, the toss
// and the fall's bounces), and the camera's pan keeps to a disc inside it (camera.js
// panRegion): steer.js and carry.js read it as Bounds, a disc's `r`. The default view's own
// disc, AREA_RADIUS round the middle, is what a desktop's default view keeps in sight and the
// size of the shadow camera's box (stage.js, pixels.js frameView, floor.js fitShadow).

import { centreOf, inFrame } from './steer.js';

/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').XZ} XZ */
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
/** CSS px NEWT keeps from the clear space's edges where what's on screen ends (camera.js orbitSight). */
export const AREA_MARGIN = 8;
/** A ray at or over the horizon meets the floor no further off than this many times the view's distance. */
const REACH = 4;
const RAD = Math.PI / 180;

/**
 * A disc of `radius` around (`x`, `z`), as Bounds (its square, and `r`): the play area, the
 * default view's framing (AREA_RADIUS), and a disc any Bounds reader takes.
 * @param {number} [radius]
 * @param {{x: number, z: number}} [centre]
 * @returns {Bounds}
 */
export function playArea(radius = AREA_RADIUS, { x, z } = { x: 0, z: 0 }) {
  return { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius, r: radius };
}

/**
 * Where the floor shows at a point on the canvas, `sx`, `sy` CSS px from its top-left, in view
 * `v` (pixels.js project's inverse at the floor); a ray at or over the horizon meets it REACH
 * view distances off, straight out that way.
 * @param {View} v
 * @param {number} sx
 * @param {number} sy
 * @returns {XZ}
 */
export function floorAt(v, sx, sy) {
  const e = v.elevation * RAD;
  const t = Math.tan((v.fov * RAD) / 2);
  const shift = v.shift ?? { x: 0, y: 0 };
  const nx = ((sx - shift.x) / v.canvasW) * 2 - 1;
  const ny = 1 - ((sy - shift.y) / v.canvasH) * 2;
  // (Forward, plus nx of the screen's half width across and ny of its half height up.)
  const d = { x: nx * t * v.aspect, y: -Math.sin(e) + ny * t * Math.cos(e), z: -Math.cos(e) - ny * t * Math.sin(e) };
  const c = v.position;
  const most = v.distance * REACH;
  if (d.y < -1e-9) {
    const k = -c.y / d.y;
    const p = { x: c.x + d.x * k, z: c.z + d.z * k };
    const off = Math.hypot(p.x - v.target.x, p.z - v.target.z);
    if (off <= most) return p;
  }
  const flat = Math.hypot(d.x, d.z) || 1;
  return { x: v.target.x + (d.x / flat) * most, z: v.target.z + (d.z / flat) * most };
}

/**
 * The play area: one shape however the camera turns, a disc round the default `view`'s target
 * (the orbit's centre) holding every spot of floor that view shows `zoom` times as far back
 * (the default zoom by default), yaw 0, over the whole `cssW` × `cssH` stage, its target shown in
 * the middle of the clear space `insets` leave (so the open Settings sheet, which only shifts the
 * view, never changes it), turned any way round that target: his radius past the farthest of
 * the stage's corners, and never less than the default view's disc.
 * @param {{view: View, cssW: number, cssH: number, insets: Insets, zoom?: number}} o
 * @returns {Bounds}
 */
export function viewArea({ view, cssW, cssH, insets, zoom = 1 }) {
  const e = view.elevation * RAD;
  const t = view.target;
  const distance = view.distance * zoom;
  /** @type {View} */
  const v = {
    ...view,
    distance,
    position: { x: t.x, y: t.y + distance * Math.sin(e), z: t.z + distance * Math.cos(e) },
    shift: {
      x: (insets.left + cssW - insets.right) / 2 - view.canvasW / 2,
      y: (insets.top + cssH - insets.bottom) / 2 - view.canvasH / 2,
    },
  };
  let far = 0;
  for (const [sx, sy] of [
    [0, 0],
    [cssW, 0],
    [0, cssH],
    [cssW, cssH],
  ]) {
    const p = floorAt(v, sx, sy);
    far = Math.max(far, Math.hypot(p.x - t.x, p.z - t.z));
  }
  return playArea(Math.max(AREA_RADIUS, far + NEWT_RADIUS), { x: t.x, z: t.z });
}

/**
 * Points around a play area's edge, `n` of them (a disc's rim, a rounded square's corner arcs,
 * or a box's or a trapezoid's corners; turned bounds' turned with them).
 * @param {Bounds} b
 * @param {number} [n]
 * @returns {Array<{x: number, z: number}>}
 */
export function rimPoints(b, n = 32) {
  if (b.turn) {
    const flat = { ...b };
    delete flat.turn;
    return rimPoints(flat, n).map((p) => inFrame(b, p, true));
  }
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
  const { x: cx, z: cz } = centreOf(b);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { x: cx + b.r * Math.sin(a), z: cz + b.r * Math.cos(a) };
  });
}
