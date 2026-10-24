// The 'tilt' drag kind (design.md's candidate): NEWT's collar is dragged on a plane tilted back
// from upright by the camera's elevation (tiltAngle: α = clamp(90° − e, 30°, 62°) from upright,
// so low down the floor point under him moves half as far as he does), so one gesture both
// carries him away and lifts him; the plane stands up as he rises (the band from 1.1 to 2.0) and
// as the cursor's ray goes past the back wall at his hang height (wallOut), so he can still be hoisted high. The plane
// goes through the last anchor and is only re-made when its angle has moved over 0.5° (or the
// camera moved: re-anchored on the new ray, hold.js reanchor), the floor and the ceiling and the
// walls on the ray (hold.js edgeClamp: the collar stays exactly under the cursor), and a lob on a
// throw. He keeps the way he faced as he was grabbed (the user's rule: no twist toward where he's
// carried). No height control of its own: the wheel keeps zooming. Pure: no three.js, no DOM.

import { CARRY } from '../carry.js';
import { clampTo } from '../steer.js';
import {
  HOLD,
  cameraMoved,
  edgeClamp,
  levelAxes,
  rayAtY,
  rayHit,
  reanchor,
  releaseVelocity,
  screenOffset,
  squash,
} from '../hold.js';
import { mixWants } from '../cues.js';

/** @typedef {import('../types.js').XYZ} XYZ */
/** @typedef {import('../types.js').XZ} XZ */
/** @typedef {import('../types.js').Bounds} Bounds */
/** @typedef {import('../hold.js').Ray} Ray */
/** @typedef {import('../hold.js').Plane} Plane */
/** @typedef {import('../hold.js').HoldCamera} HoldCamera */

const RAD = Math.PI / 180;

/**
 * The plane's angle from upright: `alpha` [least, most] radians, 90° less the camera's elevation
 * between them; the stand-up `band` (collar heights: the angle all there below its start, none
 * from its end); `wallOut`: how far past the back wall the cursor's ray (at his hang height) stands it up;
 * `reanchor`: radians the angle must change by before the plane is re-made through the anchor.
 * The throw: up by `lob` × his speed across the floor
 * once that's over `lobFrom` u/s. A finger carries him `fingerLift` CSS px above itself. In the
 * Mix (cues.js mixWants, his lowest foot taken as `footGap` over the floor at his hang height)
 * stays on `mixHold` s after it was last wanted, so a speed dipping under 1 u/s never flickers it.
 */
export const TILT = {
  alpha: [30 * RAD, 62 * RAD],
  band: [1.1, 2.0],
  wallOut: 0.6,
  reanchor: 0.5 * RAD,
  lob: 0.25,
  lobFrom: 1,
  fingerLift: 48,
  footGap: 0.06,
  mixHold: 0.5,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** @param {number} a @param {number} b @param {number} x */
const smoothstep = (a, b, x) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

/**
 * The plane's angle from upright (0: today's upright plane; 90°: level) at the camera's
 * `elevation` (radians), his collar `y` high, the cursor's ray `out` past the back wall (wallOut).
 * @param {number} elevation
 * @param {number} y
 * @param {number} out
 */
export function tiltAngle(elevation, y, out) {
  const a0 = clamp(Math.PI / 2 - elevation, TILT.alpha[0], TILT.alpha[1]);
  return a0 * (1 - smoothstep(TILT.band[0], TILT.band[1], y)) * (1 - smoothstep(0, TILT.wallOut, out));
}

/**
 * The plane's normal at camera `yaw` and angle `alpha` from upright: the level way toward the
 * camera, leant up into the sky.
 * @param {number} yaw
 * @param {number} alpha
 * @returns {XYZ}
 */
export function tiltNormal(yaw, alpha) {
  const { toward } = levelAxes(yaw);
  return { x: toward.x * Math.cos(alpha), y: Math.sin(alpha), z: toward.z * Math.cos(alpha) };
}

/**
 * How far past the back wall the cursor's ray is at height `y` (his hang height: where he'd be
 * carried to, low down): that point's distance outside the play area, the part of it away from
 * the camera (`toward`: the level way to it), so a side or the front wall never stands the plane
 * up. (design.md takes the ray's floor point; at a low camera that's past the back wall from the
 * middle of the area on, which stood the plane up everywhere: at 12° it took a sixth of the depth
 * away.) A ray that never gets down to `y` is all the way past.
 * @param {Ray} ray
 * @param {Bounds|null} bounds
 * @param {XZ} toward
 * @param {number} y
 */
export function wallOut(ray, bounds, toward, y) {
  if (!bounds) return 0;
  const f = rayAtY(ray, y);
  if (!f) return Infinity;
  const q = clampTo(bounds, f);
  return Math.max(0, -((f.x - q.x) * toward.x + (f.z - q.z) * toward.z));
}

/**
 * @param {import('./index.js').HoldDeps} [deps]
 * @returns {import('../hold.js').Hold}
 */
export function createTiltHold(deps = {}) {
  /** @type {Plane|null} */
  let plane = null;
  let alpha = 0;
  /** @type {XYZ} */
  let anchor = { x: 0, y: 0, z: 0 };
  let t0 = 0;
  let off0 = { x: 0, y: 0 };
  let from = 0;
  let clear = false;
  let walled = false;
  let wanted = -Infinity;
  /** his hang height (HoldStart.low): where wallOut reads the cursor's ray */
  let hang = 0;
  /** @type {HoldCamera|null} */
  let seen = null;

  /**
   * The plane through `p` at the angle for there.
   * @param {XYZ} p
   * @param {HoldCamera} camera
   * @param {Ray} ray
   * @param {Bounds|null} bounds
   */
  const remake = (p, camera, ray, bounds) => {
    alpha = tiltAngle(camera.elevation, p.y, wallOut(ray, bounds, levelAxes(camera.yaw).toward, hang));
    plane = { point: { ...p }, normal: tiltNormal(camera.yaw, alpha) };
  };

  return {
    kind: 'tilt',
    feel: { groundCues: 'mix', squash: true, fingerLift: TILT.fingerLift, secondFinger: false },
    get plane() {
      return plane;
    },
    start({ t, collar, press, collarPx, rayAt, camera, low, bounds }) {
      t0 = t;
      hang = low;
      off0 = { x: collarPx.x - press.x, y: collarPx.y - press.y };
      from = collar.y;
      clear = false;
      walled = false;
      wanted = -Infinity;
      anchor = { ...collar };
      seen = camera;
      remake(anchor, camera, rayAt(collarPx.x, collarPx.y), bounds);
    },
    step({ t, px, rayAt, camera, low, bounds, carry }) {
      hang = low;
      const off = screenOffset(off0, t0, t);
      const ray = rayAt(px.x + off.x, px.y + off.y);
      const { toward } = levelAxes(camera.yaw);
      // (The camera moved, a user's orbit or zoom: onto the new ray nearest where he was, and
      // the plane re-made through there.)
      if (seen && cameraMoved(seen, camera)) {
        anchor = reanchor(ray, anchor).point;
        remake(anchor, camera, ray, bounds);
      }
      seen = camera;
      // (The angle for where he is now; past TILT.reanchor off the plane's, re-made through him.)
      const want = tiltAngle(camera.elevation, anchor.y, wallOut(ray, bounds, toward, hang));
      if (!plane || Math.abs(want - alpha) > TILT.reanchor) remake(anchor, camera, ray, bounds);
      const hit = rayHit(ray, /** @type {Plane} */ (plane)) ?? anchor;
      if (hit.y >= low) clear = true;
      // (Grabbed standing, the lift's stretch, hold.js squash, lengthens him down from his collar:
      // his collar rises with it, so his feet stay on the floor.)
      const stretch = clear ? 0 : (squash(t - t0, null).y - 1) * Math.min(from, low);
      const floor = (clear ? low : Math.min(from, low)) + stretch;
      const edge = edgeClamp(ray, hit, { bounds, low: Math.min(floor, CARRY.liftMax), high: CARRY.liftMax, toward });
      anchor = edge.p;
      // (A wall met, not the floor or the ceiling: the ring pulses as it's met.)
      const wall = edge.clamp === 'side' || (edge.clamp === 'ray' && hit.y >= floor && hit.y <= CARRY.liftMax);
      const pulse = wall && !walled;
      walled = wall;
      // (In the Mix: as cues.js has it, held on TILT.mixHold after it was last wanted.)
      const v = carry?.vel ?? { x: 0, y: 0, z: 0 };
      if (mixWants(anchor.y - low + TILT.footGap, Math.hypot(v.x, v.z))) wanted = t;
      const mix = t - wanted <= TILT.mixHold;
      return {
        anchor: { ...anchor },
        plane: null,
        push: edge.clamp === 'side' ? edge.push : null,
        holdY: null,
        cues: pulse ? { pulse: true, mix } : { mix },
      };
    },
    grabbedAt(t, collar, project) {
      const at = project(collar);
      const off = screenOffset(off0, t0, t);
      return { x: at.x - off.x, y: at.y - off.y };
    },
    release(c, t) {
      const v = releaseVelocity(c.samples, t, { push: c.push });
      const level = Math.hypot(v.x, v.z);
      if (level > TILT.lobFrom) v.y = clamp(v.y + TILT.lob * level, HOLD.down, HOLD.up);
      return v;
    },
  };
}
