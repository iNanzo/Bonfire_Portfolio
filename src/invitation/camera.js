// The invitation toy's orbit camera, in plain numbers (stage.js hands its pose to three.js).
// Pure: no three.js, no DOM, no clock.
//
// A drag on empty space turns it: across, around the vertical axis (as far round as you like:
// the world turns with the finger, so the camera goes the other way; a drag across the whole
// stage is ORBIT.turn of a turn, so a phone and a desktop feel alike); down and up, its
// elevation between ORBIT.elevMin and elevMax (dragging down looks more from above; ORBIT.tilt
// for the stage's whole height). The
// mouse wheel and a two-finger pinch zoom between half and twice the default distance. The
// view eases toward where the input puts it (`goal`, damped, never overshooting) and a fling
// coasts a little once the finger lifts. The point it orbits sits at NEWT's middle height
// over the play area's centre at the default zoom (the whole play area in view) and follows
// NEWT softly the closer it zooms, all the way at the closest, so he stays in frame. On a
// phone (pixels.js compactStage), where he's drawn bigger and the play area doesn't all fit,
// it follows him ORBIT.phoneFollow of the way at the default zoom too, so a dash to the rim
// never takes him off the screen. Reset
// Camera eases back to the default view, the short way round. The light goes round with it
// (lightDir: the look's sun turned by the camera's yaw), so his shadow always falls the same way
// on screen, back and to one side. Angles in radians (yaw 0: the camera on the +z side, +
// toward +x), distances in world units, drags in CSS px.

import { FOCUS_Y, VIEW, compactStage } from './pixels.js';

/** @typedef {import('./types.js').XZ} XZ */
/** @typedef {import('./types.js').XYZ} XYZ */

const RAD = Math.PI / 180;

/**
 * elevMin/elevMax: radians up from the floor. zoomMin/zoomMax: the distance's range, × the
 * default. turn: the share of a whole turn for a drag across the stage's whole width; tilt:
 * radians for a drag down its whole height (π: today's feel on a 700 px stage). ease: seconds the view takes to
 * close most of the way to its goal (a time constant); resetEase: the same for Reset Camera.
 * A fling: the drag's speed (at most spinMax rad/s) carries on when the finger lifts within
 * flingWindow s of its last move, slowing at `coast` per second. follow: the time constant of
 * the orbit's point following NEWT; phoneFollow: how much of the way it follows him at the
 * default zoom on a phone's stage. wheel: zoom per px of wheel (a factor of e^(px × wheel)).
 */
export const ORBIT = {
  elevMin: 12 * RAD,
  elevMax: 70 * RAD,
  zoomMin: 0.5,
  zoomMax: 2,
  turn: 0.75,
  tilt: Math.PI,
  ease: 0.1,
  resetEase: 0.3,
  spinMax: 3,
  flingWindow: 0.08,
  coast: 6,
  follow: 0.5,
  phoneFollow: 0.8,
  wheel: 0.0015,
};
export { FOCUS_Y };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/**
 * @typedef {object} OrbitState  updated in place by the functions below
 * @property {number} yaw  the view now
 * @property {number} elevation
 * @property {number} distance
 * @property {XYZ} target  the point it orbits now
 * @property {{yaw: number, elevation: number, distance: number}} goal  where the input put it
 * @property {{yaw: number, elevation: number, distance: number}} home  the default view
 * @property {XZ} centre  the play area's centre
 * @property {{w: number, h: number}} span  the stage, CSS px (a drag's turn and tilt scale by it)
 * @property {number} followHome  how much the orbit follows NEWT at the default zoom (a phone's
 *   stage: ORBIT.phoneFollow; else 0)
 * @property {{yaw: number, elevation: number}} spin  a fling's coast, rad/s
 * @property {{yaw: number, elevation: number, t: number}|null} drag  a drag under way: its speed and last move
 * @property {boolean} resetting  easing back to the default
 */

/**
 * @param {{distance: number, elevation?: number, yaw?: number, centre?: XZ, span?: {w: number, h: number}}} o
 *   the default view (elevation: VIEW's by default) over the play area's centre, and the stage
 *   it's dragged on (CSS px: the 1280×800 desktop by default)
 * @returns {OrbitState}
 */
export function createOrbit({
  distance,
  elevation = VIEW.elevation * RAD,
  yaw = 0,
  centre = { x: 0, z: 0 },
  span = { w: 1280, h: 800 },
}) {
  const home = { yaw, elevation, distance };
  const w = span.w > 0 ? span.w : 1280;
  const h = span.h > 0 ? span.h : 800;
  return {
    yaw,
    elevation,
    distance,
    target: { x: centre.x, y: FOCUS_Y, z: centre.z },
    goal: { ...home },
    home,
    centre: { x: centre.x, z: centre.z },
    span: { w, h },
    followHome: compactStage(w, h) ? ORBIT.phoneFollow : 0,
    spin: { yaw: 0, elevation: 0 },
    drag: null,
    resetting: false,
  };
}

/**
 * Radians a CSS px dragged across turns it, on this stage.
 * @param {OrbitState} s
 */
export const turnPerPx = (s) => (ORBIT.turn * 2 * Math.PI) / s.span.w;
/**
 * Radians a CSS px dragged down tilts it, on this stage.
 * @param {OrbitState} s
 */
export const tiltPerPx = (s) => ORBIT.tilt / s.span.h;

/**
 * The stage's new size, CSS px (a resize): drags turn and tilt by it from now on, and on a
 * phone's stage the orbit follows NEWT at the default zoom too. A size that isn't one (0 or
 * less, not a number) keeps the last.
 * @param {OrbitState} s
 * @param {{w: number, h: number}} span
 */
export function orbitSpan(s, { w, h }) {
  if (w > 0) s.span.w = w;
  if (h > 0) s.span.h = h;
  s.followHome = compactStage(s.span.w, s.span.h) ? ORBIT.phoneFollow : 0;
}

/**
 * A drag's move on empty space, `dx`, `dy` CSS px at `t` seconds: across turns, down tilts up.
 * @param {OrbitState} s
 * @param {number} dx
 * @param {number} dy
 * @param {number} t
 */
export function orbitDrag(s, dx, dy, t) {
  const before = { yaw: s.goal.yaw, elevation: s.goal.elevation };
  s.goal.yaw -= dx * turnPerPx(s);
  s.goal.elevation = clamp(s.goal.elevation + dy * tiltPerPx(s), ORBIT.elevMin, ORBIT.elevMax);
  s.spin = { yaw: 0, elevation: 0 };
  s.resetting = false;
  const d = s.drag;
  const span = d ? t - d.t : 0;
  if (d && span > 1e-4) {
    // (The drag's speed, smoothed over about 50 ms of moves.)
    const k = Math.min(1, span / 0.05);
    d.yaw += ((s.goal.yaw - before.yaw) / span - d.yaw) * k;
    d.elevation += ((s.goal.elevation - before.elevation) / span - d.elevation) * k;
    d.t = t;
  } else if (!d) s.drag = { yaw: 0, elevation: 0, t };
}

/**
 * The finger lifts: a drag still moving within ORBIT.flingWindow coasts on.
 * @param {OrbitState} s
 * @param {number} t
 */
export function orbitRelease(s, t) {
  const d = s.drag;
  s.drag = null;
  if (!d || t - d.t > ORBIT.flingWindow) return;
  s.spin = {
    yaw: clamp(d.yaw, -ORBIT.spinMax, ORBIT.spinMax),
    elevation: clamp(d.elevation, -ORBIT.spinMax, ORBIT.spinMax),
  };
}

/**
 * Zoom by `factor`: above 1 closer (fingers spreading), below 1 further, within the range.
 * @param {OrbitState} s
 * @param {number} factor
 */
export function orbitZoom(s, factor) {
  if (!(factor > 0)) return;
  const h = s.home.distance;
  s.goal.distance = clamp(s.goal.distance / factor, h * ORBIT.zoomMin, h * ORBIT.zoomMax);
  s.resetting = false;
}

/**
 * The mouse wheel, `deltaY` px (positive: toward you, further away).
 * @param {OrbitState} s
 * @param {number} deltaY
 */
export function orbitWheel(s, deltaY) {
  orbitZoom(s, Math.exp(-deltaY * ORBIT.wheel));
}

/**
 * The frame's gestures (gesture.js): an orbit turns it, a pinch zooms it, an orbit letting go
 * (a release or cancel on the floor) may fling it; taps and NEWT's own gestures leave it be.
 * @param {OrbitState} s
 * @param {import('./types.js').GestureEvent[]} events
 */
export function orbitEvents(s, events) {
  for (const e of events) {
    if (e.type === 'orbit') orbitDrag(s, e.dx ?? 0, e.dy ?? 0, e.t);
    else if (e.type === 'pinch' && e.scale && e.scale !== 1) orbitZoom(s, e.scale);
    else if (e.on === 'floor' && (e.type === 'release' || e.type === 'cancel')) orbitRelease(s, e.t);
  }
}

/**
 * Reset Camera: ease back to the default view, the short way round.
 * @param {OrbitState} s
 */
export function orbitReset(s) {
  s.goal = {
    yaw: s.yaw + wrap(s.home.yaw - s.yaw),
    elevation: s.home.elevation,
    distance: s.home.distance,
  };
  s.spin = { yaw: 0, elevation: 0 };
  s.drag = null;
  s.resetting = true;
}

/**
 * A new default distance (the screen resized): the zoom stays what it was.
 * @param {OrbitState} s
 * @param {number} distance
 */
export function orbitHome(s, distance) {
  if (!(distance > 0)) return;
  const k = distance / s.home.distance;
  s.home.distance = distance;
  s.goal.distance *= k;
  s.distance *= k;
}

/**
 * How much the orbit follows NEWT at this zoom: `followHome` at the default distance or
 * further (0 but on a phone), 1 at the closest, a straight line between.
 * @param {OrbitState} s
 */
export function followShare(s) {
  const h = s.home.distance;
  const span = h * (1 - ORBIT.zoomMin);
  const closer = span > 0 ? clamp((h - s.distance) / span, 0, 1) : 0;
  return s.followHome + (1 - s.followHome) * closer;
}

/**
 * One frame: a fling coasts, the view eases toward its goal, and the orbit's point eases
 * toward NEWT (`focus`, his spot on the floor) as far as the zoom says.
 * @param {OrbitState} s
 * @param {number} dt
 * @param {XZ|null} focus
 */
export function orbitStep(s, dt, focus) {
  if (!(dt > 0)) return;
  if (!s.drag && (s.spin.yaw || s.spin.elevation)) {
    s.goal.yaw += s.spin.yaw * dt;
    const e = s.goal.elevation + s.spin.elevation * dt;
    s.goal.elevation = clamp(e, ORBIT.elevMin, ORBIT.elevMax);
    if (s.goal.elevation !== e) s.spin.elevation = 0;
    const slow = Math.exp(-ORBIT.coast * dt);
    s.spin.yaw = Math.abs(s.spin.yaw * slow) < 1e-3 ? 0 : s.spin.yaw * slow;
    s.spin.elevation = Math.abs(s.spin.elevation * slow) < 1e-3 ? 0 : s.spin.elevation * slow;
  }
  const k = 1 - Math.exp(-dt / (s.resetting ? ORBIT.resetEase : ORBIT.ease));
  s.yaw += (s.goal.yaw - s.yaw) * k;
  s.elevation += (s.goal.elevation - s.elevation) * k;
  s.distance += (s.goal.distance - s.distance) * k;
  // (Yaw goes round and round: both are kept within half a turn of zero together.)
  const turns = s.yaw - wrap(s.yaw);
  if (turns) {
    s.yaw -= turns;
    s.goal.yaw -= turns;
  }
  if (
    s.resetting &&
    Math.abs(s.goal.yaw - s.yaw) < 1e-4 &&
    Math.abs(s.goal.elevation - s.elevation) < 1e-4 &&
    Math.abs(s.goal.distance - s.distance) < 1e-3 * s.home.distance
  )
    s.resetting = false;
  const share = followShare(s);
  const want = focus
    ? { x: s.centre.x + (focus.x - s.centre.x) * share, z: s.centre.z + (focus.z - s.centre.z) * share }
    : s.centre;
  const f = 1 - Math.exp(-dt / ORBIT.follow);
  s.target.x += (want.x - s.target.x) * f;
  s.target.z += (want.z - s.target.z) * f;
}

/**
 * Where the camera is and what it looks at.
 * @param {OrbitState} s
 * @returns {{position: XYZ, target: XYZ}}
 */
export function orbitPose(s) {
  const c = Math.cos(s.elevation);
  const t = s.target;
  return {
    position: {
      x: t.x + s.distance * Math.sin(s.yaw) * c,
      y: t.y + s.distance * Math.sin(s.elevation),
      z: t.z + s.distance * Math.cos(s.yaw) * c,
    },
    target: { x: t.x, y: t.y, z: t.z },
  };
}

/**
 * The camera's spot on the floor (BrainIn.camera: a reaction turns him toward it).
 * @param {OrbitState} s
 * @returns {XZ}
 */
export function orbitSpot(s) {
  const { position } = orbitPose(s);
  return { x: position.x, z: position.z };
}

/**
 * The light turned with the camera: the look's sun direction (`dir`, toward the light, as at the
 * default view's yaw 0) turned round the vertical axis by the camera's yaw, so his shadow falls
 * the same way on screen however far round the camera has gone.
 * @param {number[]} dir  [x, y, z]
 * @param {number} yaw
 * @returns {XYZ}
 */
export function lightDir(dir, yaw) {
  const [x, y, z] = dir;
  if (!yaw) return { x, y, z };
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, y, z: z * c - x * s };
}
