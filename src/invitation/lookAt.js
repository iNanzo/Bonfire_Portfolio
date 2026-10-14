// Where NEWT looks in the invitation toy: the yaw and pitch toward a target, clamped to what a
// neck can do (yaw ±70°, pitch −30°…+55°) and split 30/70 between Neck and Neck001, eased by a
// critically damped spring (no overshoot). The pointer's target (pointerTarget) is where its ray
// first meets the floor or the upright plane through his head facing the camera, brought a
// little toward the camera along the ray: a cursor high over him has him look up at it (his
// gaze on screen right at it), one level with his head off to a side turns him to a profile
// (never the back of his head), and his head turns all the way to the cursor's side. From the
// camera's 36° a look down hides his face under his cap, so his chin never drops below where it
// shows (faceUp: a cursor low in front of him has him turn to it, chin up, face showing). Behind
// him past his reach, his head keeps to the side it's turned to until the
// target is clearly round the other side (no flip from shoulder to shoulder). With no pointer
// for 1.5 s he looks ahead and glances about every 3–7 s; running away, he glances over his
// shoulder about every 1.2 s. "Ahead" is the viewer (viewerAim): up at the camera, which is what
// shows his face under his cap's brim, faded back to straight ahead as he turns away from it.
// Looking at a floor spot without a ray, his head is lifted by LOOK.floorBias for the same
// reason. A slower ease (the brain's, as he's let go) brings the look and its weight round over
// about a second instead of a fifth. Pure: time comes in as t, randomness from rng.js; the state
// object is updated in place.

import { between } from './rng.js';
import { wrapAngle } from './steer.js';

/** @typedef {import('./types.js').Aim} Aim */
/** @typedef {import('./types.js').LookState} LookState */
/** @typedef {import('./types.js').XYZ} XYZ */

const DEG = Math.PI / 180;
/** How far he can turn his head, radians. */
export const LIMIT = { yaw: 70 * DEG, pitchMin: -30 * DEG, pitchMax: 55 * DEG };
/** The share of the look each bone takes. */
export const SPLIT = { neck: 0.3, head: 0.7 };
/**
 * omega: the spring's speed (rad/s; ~99% there in 6.6/omega s). idleAfter: seconds without a
 * pointer before he looks ahead. Idle glances: every glanceMin–glanceMax s, held
 * glanceHoldMin–glanceHoldMax s, up to glanceYaw of the yaw limit. Back glances: every
 * backEvery ± backJitter s, held backHold s, at backYaw of the yaw limit. weightRate: the look's
 * weight eases at this much per second. The viewer: looked at fully while the camera is within
 * viewerFull of the way he faces, not at all past viewerNone (radians). floorBias: the pitch
 * added to a look at a floor spot (radians). towardViewer: how far the pointer's target is
 * brought toward the camera along its ray, world units (his face turns to the viewer while his
 * gaze still points at the cursor on screen). faceUnder: how far under the camera (as seen from
 * his head) his look may pitch and still show his face under his cap's brim, radians (from the
 * front and side on alike: side on, the brim reaches out over his eye). backSide:
 * a target further round behind him than this (radians) keeps his head on the side it's turned to.
 */
export const LOOK = {
  omega: 10,
  idleAfter: 1.5,
  glanceMin: 3,
  glanceMax: 7,
  glanceHoldMin: 0.6,
  glanceHoldMax: 1.2,
  glanceYaw: 0.85,
  backEvery: 1.2,
  backJitter: 0.25,
  backHold: 0.4,
  backYaw: 0.95,
  weightRate: 5,
  viewerFull: (100 * Math.PI) / 180,
  viewerNone: (150 * Math.PI) / 180,
  floorBias: (10 * Math.PI) / 180,
  towardViewer: 0.6,
  faceUnder: (4 * Math.PI) / 180,
  backSide: (150 * Math.PI) / 180,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const AHEAD = Object.freeze({ yaw: 0, pitch: 0 });

/** @returns {LookState} */
export function createLook() {
  return {
    yaw: 0,
    pitch: 0,
    vyaw: 0,
    vpitch: 0,
    weight: 1,
    target: { yaw: 0, pitch: 0 },
    mode: null,
    lastAim: null,
    lastAimT: 0,
    glance: null,
    glanceUntil: 0,
    nextGlance: null,
    glances: 0,
  };
}

/**
 * An aim kept inside LIMIT.
 * @param {Aim} a
 * @returns {Aim}
 */
export function clampAim(a) {
  return { yaw: clamp(a.yaw, -LIMIT.yaw, LIMIT.yaw), pitch: clamp(a.pitch, LIMIT.pitchMin, LIMIT.pitchMax) };
}

/**
 * The look toward `target` from his head, relative to the way his body faces, as it is (not
 * clamped: lookStep clamps it, keeping a target behind him on the side his head is turned to).
 * @param {XYZ} headPos
 * @param {number} bodyYaw  root.rotation.y (0 faces +z)
 * @param {XYZ} target
 * @param {number} [pitchBias]  added to the pitch (LOOK.floorBias for a floor spot)
 * @returns {Aim}
 */
export function aimAt(headPos, bodyYaw, target, pitchBias = 0) {
  const dx = target.x - headPos.x;
  const dy = target.y - headPos.y;
  const dz = target.z - headPos.z;
  return { yaw: wrapAngle(Math.atan2(dx, dz) - bodyYaw), pitch: Math.atan2(dy, Math.hypot(dx, dz)) + pitchBias };
}

/**
 * The look toward `target` from his head, relative to the way his body faces, clamped.
 * @param {XYZ} headPos
 * @param {number} bodyYaw  root.rotation.y (0 faces +z)
 * @param {XYZ} target
 * @param {number} [pitchBias]  added to the pitch before the clamp (LOOK.floorBias for the floor)
 * @returns {Aim}
 */
export function aimAngles(headPos, bodyYaw, target, pitchBias = 0) {
  return clampAim(aimAt(headPos, bodyYaw, target, pitchBias));
}

/**
 * A look (from his head, his body facing `bodyYaw`) tipped up, where it must be, to the lowest
 * pitch at which his face still shows to the camera under his cap's brim: the camera's own pitch
 * from his head, less LOOK.faceUnder (a look turned away from the camera is left be). Its yaw is
 * kept: he still turns all the way to what he looks at, only his chin comes up (from the
 * camera's 36°, a look down at the floor, or level, is the top of his cap).
 * @param {Aim} aim
 * @param {XYZ} head
 * @param {number} bodyYaw
 * @param {XYZ} camera
 * @returns {Aim}
 */
export function faceUp(aim, head, bodyYaw, camera) {
  const cx = camera.x - head.x;
  const cz = camera.z - head.z;
  if (Math.abs(wrapAngle(bodyYaw + aim.yaw - Math.atan2(cx, cz))) > Math.PI / 2) return aim;
  const lowest = Math.atan2(camera.y - head.y, Math.hypot(cx, cz)) - LOOK.faceUnder;
  return aim.pitch >= lowest ? aim : { yaw: aim.yaw, pitch: lowest };
}

/**
 * What he looks at for the pointer: where its ray (`o`, `d`) first meets the floor or the
 * upright plane through his head facing the camera (across the floor), brought
 * LOOK.towardViewer toward the camera along the ray (so it still shows under the cursor);
 * `floor` when the floor came first (a spot in front of him), null when the ray meets neither.
 * @param {{o: XYZ, d: XYZ}} ray
 * @param {XYZ} head
 * @param {XYZ} camera
 * @returns {{point: XYZ, floor: boolean}|null}
 */
export function pointerTarget({ o, d }, head, camera) {
  const len = Math.hypot(d.x, d.y, d.z);
  if (!(len > 0)) return null;
  const u = { x: d.x / len, y: d.y / len, z: d.z / len };
  const nx = camera.x - head.x;
  const nz = camera.z - head.z;
  const n = Math.hypot(nx, nz);
  const normal = n > 1e-9 ? { x: nx / n, z: nz / n } : { x: 0, z: 1 };
  const along = u.x * normal.x + u.z * normal.z;
  let s = Infinity;
  if (Math.abs(along) > 1e-9) {
    const hit = ((head.x - o.x) * normal.x + (head.z - o.z) * normal.z) / along;
    if (hit > 0) s = hit;
  }
  let floor = false;
  if (u.y < -1e-9 && -o.y / u.y < s) {
    s = -o.y / u.y;
    floor = true;
  }
  if (!Number.isFinite(s)) return null;
  const k = Math.max(0, s - LOOK.towardViewer);
  return { point: { x: o.x + u.x * k, y: o.y + u.y * k, z: o.z + u.z * k }, floor };
}

/**
 * "Ahead": toward the viewer. The look at the camera (clamped), all of it while the camera is
 * within LOOK.viewerFull of the way he faces, fading to straight ahead by LOOK.viewerNone (he
 * doesn't crick his neck or look at the sky walking away).
 * @param {XYZ} headPos
 * @param {number} bodyYaw
 * @param {XYZ} camera
 * @returns {Aim}
 */
export function viewerAim(headPos, bodyYaw, camera) {
  const dx = camera.x - headPos.x;
  const dz = camera.z - headPos.z;
  const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - bodyYaw));
  const k = clamp((LOOK.viewerNone - off) / (LOOK.viewerNone - LOOK.viewerFull), 0, 1);
  if (k <= 0) return { yaw: 0, pitch: 0 };
  const a = aimAngles(headPos, bodyYaw, camera);
  return { yaw: a.yaw * k, pitch: a.pitch * k };
}

/**
 * The look split between the two neck bones.
 * @param {number} yaw
 * @param {number} pitch
 */
export function splitLook(yaw, pitch) {
  return {
    neck: { yaw: yaw * SPLIT.neck, pitch: pitch * SPLIT.neck },
    head: { yaw: yaw * SPLIT.head, pitch: pitch * SPLIT.head },
  };
}

/**
 * One frame of looking.
 * - 'camera': at `aim` (the page aims at the camera), `ahead` when it's null.
 * - 'pointer': at `aim` (the surface under the pointer, or the camera when the pointer is on
 *   him); when it goes, the last aim for LOOK.idleAfter, then `ahead` with idle glances.
 * - 'forward': `ahead` with idle glances around it.
 * - 'back': straight ahead (where he runs), glancing over a shoulder about every LOOK.backEvery s.
 * @param {LookState} s
 * @param {'pointer'|'camera'|'forward'|'back'} mode  BrainOut.look.mode
 * @param {Aim|null} aim
 * @param {number} dt
 * @param {number} t
 * @param {() => number} rng
 * @param {number} [weight]  BrainOut.look.weight; s.weight eases toward it
 * @param {Aim} [ahead]  where "ahead" is (viewerAim; straight ahead by default)
 * @param {number} [ease]  BrainOut.look.ease: a slower look, seconds for it (and its weight) to
 *   come about 95% of the way round; LOOK.omega's and LOOK.weightRate's pace without it
 * @returns {LookState}
 */
export function lookStep(s, mode, aim, dt, t, rng, weight = 1, ahead = AHEAD, ease = 0) {
  if (mode !== s.mode) {
    s.mode = mode;
    s.glance = null;
    s.nextGlance = null;
  }
  let target;
  if (mode === 'camera') target = aim ?? ahead;
  else if (mode === 'pointer' && aim) {
    s.lastAim = { yaw: aim.yaw, pitch: aim.pitch };
    s.lastAimT = t;
    s.glance = null;
    s.nextGlance = null;
    target = aim;
  } else if (mode === 'pointer' && s.lastAim && t - s.lastAimT < LOOK.idleAfter) target = s.lastAim;
  else if (mode === 'back') target = backGlance(s, t, rng);
  else target = idleGlance(s, t, rng, ahead);
  s.target = clampAim(sided(target, s.yaw));
  // (A critically damped spring is 95% of the way at omega × t = 4.74.)
  const omega = ease > 0 ? Math.min(LOOK.omega, 4.74 / ease) : LOOK.omega;
  [s.yaw, s.vyaw] = spring(s.yaw, s.vyaw, s.target.yaw, dt, omega);
  [s.pitch, s.vpitch] = spring(s.pitch, s.vpitch, s.target.pitch, dt, omega);
  s.yaw = clamp(s.yaw, -LIMIT.yaw, LIMIT.yaw);
  s.pitch = clamp(s.pitch, LIMIT.pitchMin, LIMIT.pitchMax);
  const step = (ease > 0 ? Math.min(LOOK.weightRate, 1 / ease) : LOOK.weightRate) * dt;
  s.weight = s.weight < weight ? Math.min(weight, s.weight + step) : Math.max(weight, s.weight - step);
  return s;
}

/**
 * A target round behind him past his reach (further than LOOK.backSide) on the other side from
 * where his head is turned (`yaw`) is taken on this side: his head stays put rather than flip
 * over to the other shoulder, until the target is clearly round that side.
 * @param {Aim} a
 * @param {number} yaw
 * @returns {Aim}
 */
function sided(a, yaw) {
  if (Math.abs(a.yaw) <= LOOK.backSide || Math.abs(yaw) < 0.1 || Math.sign(a.yaw) === Math.sign(yaw)) return a;
  return { yaw: -a.yaw, pitch: a.pitch };
}

/**
 * The exact critically damped step toward a still target: from rest it never overshoots.
 * @returns {[number, number]}
 */
function spring(x, v, target, dt, w = LOOK.omega) {
  const e = x - target;
  const k = Math.exp(-w * dt);
  const j = (v + w * e) * dt;
  return [target + (e + j) * k, (v - w * j) * k];
}

/**
 * `ahead`, with a glance to one side every glanceMin–glanceMax s (s.glance: the glance's turn
 * away from `ahead`, toward the side with room for it).
 */
function idleGlance(s, t, rng, ahead) {
  if (s.nextGlance == null) s.nextGlance = t + between(rng, LOOK.glanceMin, LOOK.glanceMax);
  if (s.glance && t >= s.glanceUntil) s.glance = null;
  if (!s.glance && t >= s.nextGlance) {
    let side = rng() < 0.5 ? -1 : 1;
    const yaw = between(rng, 0.3, LOOK.glanceYaw) * LIMIT.yaw;
    if (Math.abs(ahead.yaw + side * yaw) > LIMIT.yaw) side = -side;
    s.glance = { yaw: side * yaw, pitch: between(rng, -0.15, 0.25) };
    s.glanceUntil = t + between(rng, LOOK.glanceHoldMin, LOOK.glanceHoldMax);
    s.nextGlance = t + between(rng, LOOK.glanceMin, LOOK.glanceMax);
    s.glances++;
  }
  return s.glance ? { yaw: ahead.yaw + s.glance.yaw, pitch: ahead.pitch + s.glance.pitch } : ahead;
}

/** Ahead, with a look over one shoulder about every backEvery s (the first one sooner). */
function backGlance(s, t, rng) {
  const every = () => between(rng, LOOK.backEvery - LOOK.backJitter, LOOK.backEvery + LOOK.backJitter);
  if (s.nextGlance == null) s.nextGlance = t + every() / 2;
  if (s.glance && t >= s.glanceUntil) s.glance = null;
  if (!s.glance && t >= s.nextGlance) {
    s.glance = { yaw: (rng() < 0.5 ? -1 : 1) * LOOK.backYaw * LIMIT.yaw, pitch: 0 };
    s.glanceUntil = t + LOOK.backHold;
    s.nextGlance = t + every();
    s.glances++;
  }
  return s.glance ?? AHEAD;
}
