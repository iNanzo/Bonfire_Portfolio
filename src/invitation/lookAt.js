// Where NEWT looks in the invitation toy: the yaw and pitch toward a target, clamped to what a
// neck can do (yaw ±70°, pitch −20°…+55°, the last quarter of each eased in rather than a dead
// stop: softAim) and split 30/70 between Neck and Neck001, eased by a critically damped spring
// (no overshoot). The pointer's look (screenAim) is camera-relative, film's "performative
// gaze": his face turns from the viewer toward the cursor, round the line to the camera, so on
// screen his gaze points right at the cursor whatever the view, zoom or screen; the further the
// cursor is from his head on screen (in heads), the further round (none within a third of a
// head: he looks at the viewer; most a couple of heads out), up to LOOK.turnUp, turnSide or
// turnDown from the line to the camera by the way the cursor lies (down least, so his face still
// shows under his cap when the cursor is far below him). A cursor below his head has him look
// down toward it, one above up, one to a side round toward it; one he can't turn to (round
// behind him) a profile on its side, chin up or down with the cursor, and his head keeps to the
// side it's turned to until the target is clearly round the other side (no flip from shoulder
// to shoulder). With no pointer for 1.5 s he looks ahead and glances about every 3–7 s.
// Running away, he looks where he runs, his chin up toward the viewer as "ahead" has it, and
// glances over his shoulder about every 1.2 s, the glances smaller and fewer the more the camera
// is in front of him (LOOK.backFront). "Ahead" is otherwise the viewer (viewerAim): up at the camera, faded back to
// straight ahead as he turns away from it. Looking at a floor spot without a ray, his head is
// lifted by LOOK.floorBias so his cap leaves his face showing. A slower ease (the brain's, as
// he's let go) brings the look and its weight round over about a second instead of a fifth.
// Pure: time comes in as t, randomness from rng.js; the state object is updated in place.

import { between } from './rng.js';
import { wrapAngle } from './steer.js';

/** @typedef {import('./types.js').Aim} Aim */
/** @typedef {import('./types.js').LookState} LookState */
/** @typedef {import('./types.js').XYZ} XYZ */

const DEG = Math.PI / 180;
/** How far he can turn his head, radians (with the camera above him nothing needs a deeper look down). */
export const LIMIT = { yaw: 70 * DEG, pitchMin: -20 * DEG, pitchMax: 55 * DEG };
/** The share of the look each bone takes. */
export const SPLIT = { neck: 0.3, head: 0.7 };
/**
 * omega: the spring's speed (rad/s; ~99% there in 6.6/omega s). idleAfter: seconds without a
 * pointer before he looks ahead. Idle glances: every glanceMin–glanceMax s, held
 * glanceHoldMin–glanceHoldMax s, up to glanceYaw of the yaw limit. weightRate: the look's weight
 * eases at this much per second. The viewer: looked at fully while the camera is within
 * viewerFull of the way he faces, not at all past viewerNone (radians). floorBias: the pitch
 * added to a look at a floor spot (radians). soft: the share of each limit taken as asked, the
 * rest eased into (softAim).
 *
 * The pointer (screenAim): headSize, his head's height (world units: Neck001's sphere, 1.65
 * model units across the radius at clips.js SCALE 0.16), the unit the cursor's distance from his
 * head on screen is counted in; within deadZone heads he looks at the viewer, and his face turns
 * from the viewer toward the cursor over the next `ramp` heads (eased out), as far as turnUp,
 * turnSide or turnDown from the line to the camera for a cursor above, beside or below his head
 * (radians, blended between by the way it lies); turned any way, his chin no lower than turnDown
 * under the camera's line (where his eyes still peek under his cap), while the camera is within
 * faceSide of the way he faces, fading out by faceBack (radians: behind him there's no face to
 * keep in sight).
 *
 * Back glances: every backEvery ± backJitter s, held backHold s, at backYaw of the yaw limit;
 * with the camera dead ahead of him, backFront of that turn and half as often (his face toward
 * the viewer).
 * backSide: a target further round behind him than this (radians) keeps his head on the side
 * it's turned to.
 */
export const LOOK = {
  omega: 10,
  idleAfter: 1.5,
  glanceMin: 3,
  glanceMax: 7,
  glanceHoldMin: 0.6,
  glanceHoldMax: 1.2,
  glanceYaw: 0.85,
  weightRate: 5,
  viewerFull: 100 * DEG,
  viewerNone: 150 * DEG,
  floorBias: 10 * DEG,
  soft: 0.75,
  headSize: 0.53,
  deadZone: 0.3,
  ramp: 2,
  turnUp: 60 * DEG,
  turnSide: 65 * DEG,
  turnDown: 15 * DEG,
  faceSide: 90 * DEG,
  faceBack: 135 * DEG,
  backEvery: 1.2,
  backJitter: 0.25,
  backHold: 0.4,
  backYaw: 0.95,
  backFront: 0.35,
  backSide: 150 * DEG,
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
 * `v` as asked inside LOOK.soft of a limit, past it eased toward the limit (tanh: the same slope
 * where it starts, never reaching past it), so a look sweeping out to his neck's reach slows
 * into it instead of stopping dead.
 * @param {number} v
 * @param {number} lo  negative
 * @param {number} hi  positive
 */
function soften(v, lo, hi) {
  const k = LOOK.soft;
  if (v > hi * k) return hi * k + hi * (1 - k) * Math.tanh((v - hi * k) / (hi * (1 - k)));
  if (v < lo * k) return lo * k + lo * (1 - k) * Math.tanh((v - lo * k) / (lo * (1 - k)));
  return v;
}

/**
 * An aim kept inside LIMIT, softly: as asked within LOOK.soft of each limit, eased toward it past
 * that (lookStep's target).
 * @param {Aim} a
 * @returns {Aim}
 */
export function softAim(a) {
  return { yaw: soften(a.yaw, -LIMIT.yaw, LIMIT.yaw), pitch: soften(a.pitch, LIMIT.pitchMin, LIMIT.pitchMax) };
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
 * The pointer's look: camera-relative ("performative gaze"). Seen from the camera, the cursor's
 * ray lies some way from his head (in heads: LOOK.headSize at his distance) in some direction φ
 * on screen; his face turns from the line to the camera by α toward φ, round that line, so on
 * screen his gaze points right at the cursor (a line through his head toward the camera and
 * turned toward φ shows along φ, at any view or zoom), and turned more the further the cursor
 * is: none within LOOK.deadZone heads (at the viewer), then eased out to LOOK.turnUp, turnSide
 * or turnDown (by φ) over LOOK.ramp heads; straight up or down, no further than brings his
 * pitch from the camera's to his neck's limit (so his gaze never tips over the top into a look
 * backwards, and points along φ as far as his neck lets it). Round behind him past his reach
 * he turns as far as he can on that side, his chin up or down with the cursor: a profile. Not
 * clamped (lookStep keeps a target behind him on the side his head is turned to). Null when the
 * ray points away from him or the camera is right over his head.
 * @param {{o: XYZ, d: XYZ}} ray  the cursor's ray, from the camera
 * @param {XYZ} head  between his eyes
 * @param {number} bodyYaw
 * @param {XYZ} camera
 * @returns {Aim|null}
 */
export function screenAim({ d }, head, bodyYaw, camera) {
  // w: from the camera to his head; right and up: the screen's directions there.
  const wx0 = head.x - camera.x;
  const wy0 = head.y - camera.y;
  const wz0 = head.z - camera.z;
  const dist = Math.hypot(wx0, wy0, wz0);
  const flat = Math.hypot(wx0, wz0);
  const len = Math.hypot(d.x, d.y, d.z);
  if (!(dist > 1e-9) || !(flat > 1e-6 * dist) || !(len > 0)) return null;
  const w = { x: wx0 / dist, y: wy0 / dist, z: wz0 / dist };
  const right = { x: -w.z / (flat / dist), y: 0, z: w.x / (flat / dist) };
  const up = { x: -right.z * w.y, y: right.z * w.x - right.x * w.z, z: right.x * w.y };
  const along = (d.x * w.x + d.y * w.y + d.z * w.z) / len;
  if (!(along > 1e-6)) return null;
  // Where the cursor lies from his head as seen from the camera (tangents), and in heads.
  const sx = (d.x * right.x + d.z * right.z) / len / along;
  const sy = (d.x * up.x + d.y * up.y + d.z * up.z) / len / along;
  const heads = (Math.hypot(sx, sy) * dist) / LOOK.headSize;
  const k = clamp((heads - LOOK.deadZone) / LOOK.ramp, 0, 1);
  const phi = Math.atan2(sy, sx);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  // (Straight up or down, no further than brings his pitch to his neck's limit from the
  // camera's: the camera's pitch from his head is asin(−w.y).)
  const camPitch = Math.asin(-w.y);
  const upMost = clamp(LIMIT.pitchMax - camPitch, 0, LOOK.turnUp);
  const downMost = clamp(camPitch - LIMIT.pitchMin, 0, LOOK.turnDown);
  const most = LOOK.turnSide + ((sy > 0 ? upMost : downMost) - LOOK.turnSide) * sp * sp;
  let a = (1 - (1 - k) * (1 - k)) * most;
  // (Any way round, no lower than turnDown under the camera's line, where his eyes still peek
  // under his cap: his gaze's height as he turns is −w.y·cos α + up.y·sin φ·sin α =
  // R·cos(α − δ), past its top only ever falling, so the α where it reaches that is as far as
  // he turns. It still points along φ. With his back to the camera there's no face to show:
  // it fades out as the camera goes from his side, faceSide, to behind him, faceBack.)
  const camOff = Math.abs(wrapAngle(Math.atan2(-w.x, -w.z) - bodyYaw));
  const facing = clamp((LOOK.faceBack - camOff) / (LOOK.faceBack - LOOK.faceSide), 0, 1);
  const R = Math.hypot(-w.y, up.y * sp);
  const floor = Math.sin(Math.max(LIMIT.pitchMin, camPitch - LOOK.turnDown));
  if (facing > 0 && floor > -R) {
    const most = Math.atan2(up.y * sp, -w.y) + Math.acos(Math.min(1, floor / R));
    a = Math.min(a, most) * facing + a * (1 - facing);
  }
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const g = {
    x: -w.x * ca + (right.x * cp + up.x * sp) * sa,
    y: -w.y * ca + up.y * sp * sa,
    z: -w.z * ca + (right.z * cp + up.z * sp) * sa,
  };
  return aimAt(head, bodyYaw, { x: head.x + g.x, y: head.y + g.y, z: head.z + g.z });
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
 * - 'pointer': at `aim` (screenAim, or the camera when the pointer is on him); when it goes, the
 *   last aim for LOOK.idleAfter, then `ahead` with idle glances.
 * - 'forward': `ahead` with idle glances around it.
 * - 'back': straight ahead (where he runs), chin up to `ahead`'s pitch, glancing over a shoulder
 *   about every LOOK.backEvery s (smaller and fewer glances with the viewer in front: backGlance).
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
  else if (mode === 'back') target = backGlance(s, t, rng, ahead);
  else target = idleGlance(s, t, rng, ahead);
  s.target = softAim(sided(target, s.yaw));
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

/**
 * Where he runs, his chin up to `ahead`'s pitch (the viewer's: none once he runs away from the
 * camera), with a look over one shoulder about every backEvery s (the first one sooner). The more
 * the viewer is in front of him (`ahead` up at the camera, little turned: the camera within his
 * neck's reach of straight ahead), the smaller and fewer the glances, down to LOOK.backFront of
 * the turn and half as often with it dead ahead, so the Run clip's face stays toward the viewer.
 * @param {LookState} s
 * @param {number} t
 * @param {() => number} rng
 * @param {Aim} ahead
 * @returns {Aim}
 */
function backGlance(s, t, rng, ahead) {
  const front = ahead.pitch > 0 ? clamp(1 - Math.abs(ahead.yaw) / LIMIT.yaw, 0, 1) : 0;
  const pitch = Math.max(0, ahead.pitch);
  const every = () => between(rng, LOOK.backEvery - LOOK.backJitter, LOOK.backEvery + LOOK.backJitter) * (1 + front);
  if (s.nextGlance == null) s.nextGlance = t + every() / 2;
  if (s.glance && t >= s.glanceUntil) s.glance = null;
  if (!s.glance && t >= s.nextGlance) {
    const turn = LOOK.backYaw * LIMIT.yaw * (1 - (1 - LOOK.backFront) * front);
    s.glance = { yaw: (rng() < 0.5 ? -1 : 1) * turn, pitch: 0 };
    s.glanceUntil = t + LOOK.backHold;
    s.nextGlance = t + every();
    s.glances++;
  }
  return { yaw: s.glance?.yaw ?? 0, pitch };
}
