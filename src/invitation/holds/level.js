// The 'level' drag kind (design.md's candidate): NEWT carried like a toy held over a tabletop. His
// collar rides the cursor's ray where it meets a level plane at his hold height, so a move up the
// screen sends him away across the floor and one across moves him across, never in depth; the
// wheel or a second finger raises and lowers that height (0.1 of his height a 100 px wheel notch,
// 0.8 a 100 px of finger, within his hang height and 2.4 over it), eased (critically damped). With
// the camera low the plane stands up to face it (smoothly from 35° down to 12°, where a level plane
// would run off to the horizon), so there a move up lifts him. Picked up, the hold height eases
// from where his collar was to his hang height + 0.35. The grab offset eases out in screen px, the
// shared edge clamp keeps him inside (the back wall a climb on the ray, a side wall across only),
// a camera move re-anchors on the new ray, and he's let go with the shared release velocity. Ground
// Cues default to Always (the ring under him, the drop line), with the squash and stretch on. Pure.

import { CARRY } from '../carry.js';
import {
  HOLD,
  along,
  cameraMoved,
  closestOnRay,
  edgeClamp,
  levelAxes,
  rayInterval,
  releaseVelocity,
  screenOffset,
  unitRay,
} from '../hold.js';
import { NEWT_HEIGHT } from '../area.js';
import { clampTo } from '../steer.js';

/** @typedef {import('../types.js').XYZ} XYZ */
/** @typedef {import('../hold.js').Plane} Plane */
/** @typedef {import('../hold.js').HoldCamera} HoldCamera */

const RAD = Math.PI / 180;

/**
 * lift: the hold height a grab eases to, over his hang height (× his height); range: the most it
 * goes over it; wheel, finger: how much a wheel px and a second finger's px raise it (× his
 * height; up the screen, a negative delta, raises him); grabHalf: the halflife (s) of the ease up
 * as he's picked up, half: of every change after; levelFrom, uprightAt: the camera's elevations
 * (degrees) the plane is level from and upright at, smoothly between; fingerLift: CSS px a finger
 * carries him above itself; floor: the margin (× his height) over his hang height his collar is
 * kept above once he's clear of the floor, so his swinging, limp feet never touch it; wallCos: out past the play area within 45° of straight away from the
 * camera (the cosine) is the back wall, within 45° of toward it the front wall, else a side wall.
 */
export const LEVEL = {
  lift: 0.35,
  range: 2.4,
  wheel: 0.001,
  finger: 0.008,
  grabHalf: 0.06,
  half: 0.08,
  levelFrom: 35,
  uprightAt: 12,
  fingerLift: 48,
  floor: 0.06,
  wallCos: Math.SQRT1_2,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
/** @param {XYZ} a @param {XYZ} b */
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/**
 * The plane's normal with the camera at `elevation` and `yaw` (radians): up from LEVEL.levelFrom,
 * facing the camera across the floor at LEVEL.uprightAt and lower, smoothstepped between.
 * @param {number} elevation
 * @param {number} yaw
 * @returns {XYZ}
 */
export function levelNormal(elevation, yaw) {
  const u = clamp((LEVEL.levelFrom - elevation / RAD) / (LEVEL.levelFrom - LEVEL.uprightAt), 0, 1);
  const w = u * u * (3 - 2 * u);
  const { toward } = levelAxes(yaw);
  const n = { x: w * toward.x, y: 1 - w, z: w * toward.z };
  const len = Math.hypot(n.x, n.y, n.z);
  return { x: n.x / len, y: n.y / len, z: n.z / len };
}

/**
 * One step of a critically damped ease toward `goal` with halflife `half` (Holden's form).
 * @param {number} x
 * @param {number} v
 * @param {number} goal
 * @param {number} half
 * @param {number} dt
 * @returns {[number, number]}
 */
function damp(x, v, goal, half, dt) {
  const y = (2 * Math.LN2) / half;
  const j0 = x - goal;
  const j1 = v + j0 * y;
  const e = Math.exp(-y * dt);
  return [e * (j0 + j1 * dt) + goal, e * (v - j1 * y * dt)];
}

/**
 * @param {import('./index.js').HoldDeps} [_deps]
 * @returns {import('../hold.js').Hold}
 */
export function createLevelHold(_deps = {}) {
  /** @type {Plane|null} */
  let plane = null;
  let t0 = 0;
  let off0 = { x: 0, y: 0 };
  let holdY = 0;
  let holdV = 0;
  let goal = 0;
  /** His hang height, and whether his height's been changed since the grab. */
  let low = 0;
  let touched = false;
  /** His collar's height as he was grabbed: under his hang height, he's lifted clear first. */
  let startY = 0;
  let clear = false;
  /** @type {XYZ} */
  let anchor = { x: 0, y: 0, z: 0 };
  /** @type {HoldCamera|null} */
  let cam = null;
  let wall = false;

  const top = () => low + LEVEL.range * NEWT_HEIGHT;
  /** The lowest his collar's carried once he's clear of the floor: his hang height and a margin. */
  const bottom = () => low + LEVEL.floor * NEWT_HEIGHT;
  /** @param {number} dy */
  const raise = (dy) => {
    goal = clamp(goal + dy, bottom(), top());
    touched = true;
  };

  return {
    kind: 'level',
    feel: { groundCues: 'always', squash: true, fingerLift: LEVEL.fingerLift, secondFinger: true },
    get plane() {
      return plane;
    },
    start(s) {
      t0 = s.t;
      off0 = { x: s.collarPx.x - s.press.x, y: s.collarPx.y - s.press.y };
      low = s.low;
      startY = s.collar.y;
      clear = startY >= bottom();
      holdY = startY;
      holdV = 0;
      goal = clamp(low + LEVEL.lift * NEWT_HEIGHT, bottom(), top());
      touched = false;
      anchor = { ...s.collar };
      cam = { ...s.camera };
      plane = { point: { ...s.collar }, normal: levelNormal(s.camera.elevation, s.camera.yaw) };
      wall = false;
    },
    step(f) {
      const p = /** @type {Plane} */ (plane);
      low = f.low;
      const off = screenOffset(off0, t0, f.t);
      const ray = unitRay(f.rayAt(f.px.x + off.x, f.px.y + off.y));
      // (The camera moved, a user's orbit or zoom: onto the new ray as near as can be to where he
      // was, the plane rebuilt through there, the height he's at kept as his hold height.)
      if (cam && cameraMoved(cam, f.camera)) {
        const at = closestOnRay(ray, anchor);
        p.normal = levelNormal(f.camera.elevation, f.camera.yaw);
        holdY = goal = clamp(at.y, Math.min(bottom(), holdY), top());
        holdV = 0;
        p.point = { x: at.x, y: holdY, z: at.z };
      }
      cam = { ...f.camera };
      // (The hold height, eased toward its goal: the plane moves with it.)
      if (f.dt > 0 && (holdY !== goal || holdV !== 0)) {
        [holdY, holdV] = damp(holdY, holdV, goal, touched ? LEVEL.half : LEVEL.grabHalf, f.dt);
        if (Math.abs(holdY - goal) < 1e-6 && Math.abs(holdV) < 1e-5) {
          holdY = goal;
          holdV = 0;
        }
        p.point = { x: anchor.x, y: holdY, z: anchor.z };
      }
      const floor = clear ? bottom() : Math.min(bottom(), startY);
      // (Where the ray meets the plane; a grazing ray, or one with the plane behind it, keeps him
      // on the ray as near as can be to where he was, inside.)
      const denom = dot(ray.d, p.normal);
      const s = denom < -HOLD.grazing ? dot(sub(p.point, ray.o), p.normal) / denom : -1;
      let hit;
      if (s >= 0) hit = along(ray, s);
      else {
        const span = rayInterval(ray, f.bounds, floor, CARRY.liftMax);
        const sNear = Math.max(0, dot(sub(anchor, ray.o), ray.d));
        hit = along(ray, span ? clamp(sNear, span[0], span[1]) : sNear);
      }
      // (Out past the back wall, he climbs the ray however far, up to the ceiling; past the front
      // wall he drops along it to the floor within the shared reach; past a side wall, across
      // only, never deeper or nearer.)
      const { toward } = levelAxes(f.camera.yaw);
      const kept = f.bounds ? clampTo(f.bounds, hit) : hit;
      const ox = hit.x - kept.x;
      const oz = hit.z - kept.z;
      const out = Math.hypot(ox, oz);
      const depthOut = -(ox * toward.x + oz * toward.z);
      const reach =
        out < 1e-9
          ? HOLD.reach
          : depthOut >= LEVEL.wallCos * out
            ? Infinity
            : -depthOut >= LEVEL.wallCos * out
              ? HOLD.reach
              : 0;
      const e = edgeClamp(ray, hit, {
        bounds: f.bounds,
        low: floor,
        high: CARRY.liftMax,
        toward,
        reach,
      });
      // (A wall clamp, not the floor's or the ceiling's: the ring pulses as it starts.)
      const atWall = e.clamp === 'side' || (e.clamp === 'ray' && out > 1e-9);
      const pulse = atWall && !wall;
      wall = atWall;
      anchor = e.p;
      if (!clear && anchor.y >= bottom() - 1e-9) clear = true;
      return { anchor: { ...anchor }, plane: null, push: e.push, holdY, cues: pulse ? { pulse: true } : {} };
    },
    grabbedAt(t, collar, project) {
      const at = project(collar);
      const off = screenOffset(off0, t0, t);
      return { x: at.x - off.x, y: at.y - off.y };
    },
    release(c, t) {
      return releaseVelocity(c.samples, t, { push: c.push });
    },
    onWheel(dy) {
      raise(-dy * LEVEL.wheel * NEWT_HEIGHT);
      return true;
    },
    onSecondFinger(dy) {
      raise(-dy * LEVEL.finger * NEWT_HEIGHT);
    },
  };
}
