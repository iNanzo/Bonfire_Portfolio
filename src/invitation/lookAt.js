// Where NEWT looks in the invitation toy: the yaw and pitch toward a target, clamped to what a
// neck can do (yaw ±70°, pitch −30°…+35°) and split 30/70 between Neck and Neck001, eased by a
// critically damped spring (no overshoot). With no pointer for 1.5 s he looks ahead and glances
// about every 3–7 s; running away, he glances over his shoulder about every 1.2 s. Pure: time
// comes in as t, randomness from rng.js; the state object is updated in place.

import { between } from './rng.js';
import { wrapAngle } from './steer.js';

/** @typedef {import('./types.js').Aim} Aim */
/** @typedef {import('./types.js').LookState} LookState */
/** @typedef {import('./types.js').XYZ} XYZ */

const DEG = Math.PI / 180;
/** How far he can turn his head, radians. */
export const LIMIT = { yaw: 70 * DEG, pitchMin: -30 * DEG, pitchMax: 35 * DEG };
/** The share of the look each bone takes. */
export const SPLIT = { neck: 0.3, head: 0.7 };
/**
 * omega: the spring's speed (rad/s; ~99% there in 6.6/omega s). idleAfter: seconds without a
 * pointer before he looks ahead. Idle glances: every glanceMin–glanceMax s, held
 * glanceHoldMin–glanceHoldMax s, up to glanceYaw of the yaw limit. Back glances: every
 * backEvery ± backJitter s, held backHold s, at backYaw of the yaw limit. weightRate: the look's
 * weight eases at this much per second.
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
 * The look toward `target` from his head, relative to the way his body faces, clamped.
 * @param {XYZ} headPos
 * @param {number} bodyYaw  root.rotation.y (0 faces +z)
 * @param {XYZ} target
 * @returns {Aim}
 */
export function aimAngles(headPos, bodyYaw, target) {
  const dx = target.x - headPos.x;
  const dy = target.y - headPos.y;
  const dz = target.z - headPos.z;
  return clampAim({ yaw: wrapAngle(Math.atan2(dx, dz) - bodyYaw), pitch: Math.atan2(dy, Math.hypot(dx, dz)) });
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
 * - 'camera': at `aim` (the page aims at the camera), ahead when it's null.
 * - 'pointer': at `aim` (the surface under the pointer, or the camera when the pointer is on
 *   him); when it goes, the last aim for LOOK.idleAfter, then ahead with idle glances.
 * - 'forward': ahead with idle glances.
 * - 'back': ahead, glancing over a shoulder about every LOOK.backEvery s.
 * @param {LookState} s
 * @param {'pointer'|'camera'|'forward'|'back'} mode  BrainOut.look.mode
 * @param {Aim|null} aim
 * @param {number} dt
 * @param {number} t
 * @param {() => number} rng
 * @param {number} [weight]  BrainOut.look.weight; s.weight eases toward it
 * @returns {LookState}
 */
export function lookStep(s, mode, aim, dt, t, rng, weight = 1) {
  if (mode !== s.mode) {
    s.mode = mode;
    s.glance = null;
    s.nextGlance = null;
  }
  let target;
  if (mode === 'camera') target = aim ?? AHEAD;
  else if (mode === 'pointer' && aim) {
    s.lastAim = { yaw: aim.yaw, pitch: aim.pitch };
    s.lastAimT = t;
    s.glance = null;
    s.nextGlance = null;
    target = aim;
  } else if (mode === 'pointer' && s.lastAim && t - s.lastAimT < LOOK.idleAfter) target = s.lastAim;
  else if (mode === 'back') target = backGlance(s, t, rng);
  else target = idleGlance(s, t, rng);
  s.target = clampAim(target);
  [s.yaw, s.vyaw] = spring(s.yaw, s.vyaw, s.target.yaw, dt);
  [s.pitch, s.vpitch] = spring(s.pitch, s.vpitch, s.target.pitch, dt);
  s.yaw = clamp(s.yaw, -LIMIT.yaw, LIMIT.yaw);
  s.pitch = clamp(s.pitch, LIMIT.pitchMin, LIMIT.pitchMax);
  const step = LOOK.weightRate * dt;
  s.weight = s.weight < weight ? Math.min(weight, s.weight + step) : Math.max(weight, s.weight - step);
  return s;
}

/**
 * The exact critically damped step toward a still target: from rest it never overshoots.
 * @returns {[number, number]}
 */
function spring(x, v, target, dt) {
  const w = LOOK.omega;
  const e = x - target;
  const k = Math.exp(-w * dt);
  const j = (v + w * e) * dt;
  return [target + (e + j) * k, (v - w * j) * k];
}

/** Ahead, with a glance to one side every glanceMin–glanceMax s. */
function idleGlance(s, t, rng) {
  if (s.nextGlance == null) s.nextGlance = t + between(rng, LOOK.glanceMin, LOOK.glanceMax);
  if (s.glance && t >= s.glanceUntil) s.glance = null;
  if (!s.glance && t >= s.nextGlance) {
    const side = rng() < 0.5 ? -1 : 1;
    s.glance = { yaw: side * between(rng, 0.3, LOOK.glanceYaw) * LIMIT.yaw, pitch: between(rng, -0.15, 0.25) };
    s.glanceUntil = t + between(rng, LOOK.glanceHoldMin, LOOK.glanceHoldMax);
    s.nextGlance = t + between(rng, LOOK.glanceMin, LOOK.glanceMax);
    s.glances++;
  }
  return s.glance ?? AHEAD;
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
