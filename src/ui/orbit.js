// Orbit math: a camera circling a point it looks at, as three numbers (a turn round it, a
// tilt up from level, a distance) plus the point. Photo mode on the site (ui/photo.js) and
// the Painter's stage (painter/cameraRig.js) both frame the fire this way: drag to orbit,
// scroll to zoom, and in the Painter, Shift-drag to slide the point it looks at.
//
//   orbitPose(view)        the camera's { pos, target } for an orbit
//   poseToOrbit(pose)      the orbit a camera pose sits on (the way back)
//   dragOrbit(view, dx, dy)  a drag of dx, dy px from `view` (right turns it left round
//                          the point, as if the scene were grabbed; down tilts it up)
//   zoomOrbit(view, dy)    a wheel step: nearer or further, by a factor (smooth at any distance)
//   panOrbit(view, dx, dy, lens)  the point it looks at slid across the screen with the cursor
//
// Pure: no DOM, no three.js (arrays [x, y, z], meters and radians).
import { clamp } from '../math.js';

/** The fire, a little above the ground: what photo mode circles. */
export const ORBIT_TARGET = [0.02, 0.55, 0.02];
/** Photo mode's limits: never below the ground's line nor over the top, never inside the knight. */
export const PHOTO_LIMITS = { pitch: [0.04, 1.2], dist: [2.1, 7] };
/** Radians per pixel dragged (turn, tilt), and the wheel's zoom per pixel of scroll. */
export const DRAG_RATE = { yaw: 0.006, pitch: 0.004, zoom: 0.001 };

/**
 * @typedef {{ yaw: number, pitch: number, dist: number, target?: number[] }} Orbit
 *   yaw: the turn round the point (0: in front, +z); pitch: up from level; dist: meters
 * @typedef {{ pitch: number[], dist: number[] }} OrbitLimits
 */

/**
 * The camera's place and aim for an orbit.
 * @param {Orbit} view
 * @returns {{ pos: number[], target: number[] }}
 */
export function orbitPose({ yaw, pitch, dist, target = ORBIT_TARGET }) {
  const cp = Math.cos(pitch);
  return {
    pos: [target[0] + Math.sin(yaw) * cp * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * cp * dist],
    target: [...target],
  };
}

/**
 * The orbit a camera pose sits on: orbitPose(poseToOrbit(p)) is p again.
 * @param {{ pos: number[], target: number[] }} pose
 * @returns {Required<Orbit>}
 */
export function poseToOrbit({ pos, target }) {
  const dx = pos[0] - target[0];
  const dy = pos[1] - target[1];
  const dz = pos[2] - target[2];
  const dist = Math.max(1e-6, Math.hypot(dx, dy, dz));
  return { yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy / dist))), dist, target: [...target] };
}

/**
 * An orbit dragged `dx`, `dy` px from `view` (where the drag began): right turns the
 * camera left round the point, down tilts it up, the tilt kept within `limits`.
 * @param {Orbit} view
 * @param {number} dx
 * @param {number} dy
 * @param {OrbitLimits} [limits]
 * @returns {Orbit}
 */
export function dragOrbit(view, dx, dy, limits = PHOTO_LIMITS) {
  return { ...view, yaw: view.yaw - dx * DRAG_RATE.yaw, pitch: clamp(view.pitch + dy * DRAG_RATE.pitch, limits.pitch[0], limits.pitch[1]) };
}

/**
 * An orbit a wheel step nearer (`dy` < 0) or further, kept within `limits`.
 * @param {Orbit} view
 * @param {number} dy  the wheel's deltaY (px)
 * @param {OrbitLimits} [limits]
 * @returns {Orbit}
 */
export function zoomOrbit(view, dy, limits = PHOTO_LIMITS) {
  return { ...view, dist: clamp(view.dist * Math.exp(dy * DRAG_RATE.zoom), limits.dist[0], limits.dist[1]) };
}

/**
 * The point an orbit looks at slid with the cursor: dragged `dx`, `dy` px on a screen
 * `height` px tall through a lens of `fov` degrees, the scene moves with the cursor (the
 * point goes the other way, across the camera's own right and up).
 * @param {Orbit} view
 * @param {number} dx
 * @param {number} dy
 * @param {{ fov: number, height: number }} lens
 * @returns {Orbit}
 */
export function panOrbit(view, dx, dy, { fov, height }) {
  const t = view.target ?? ORBIT_TARGET;
  const perPx = (2 * view.dist * Math.tan((fov * Math.PI) / 360)) / Math.max(1, height);
  const right = [Math.cos(view.yaw), 0, -Math.sin(view.yaw)];
  const sp = Math.sin(view.pitch);
  const up = [-sp * Math.sin(view.yaw), Math.cos(view.pitch), -sp * Math.cos(view.yaw)];
  const target = t.map((v, i) => v - right[i] * dx * perPx + up[i] * dy * perPx);
  return { ...view, target };
}
