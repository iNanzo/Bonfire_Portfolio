// The invitation toy's frame glue: the pure parts of main.js's loop (types.js's frame order,
// steps 3, 4 and 7), so they're tested without a browser. Pure: no three.js, no DOM.
//
//   createBody / bodyStep   who moves NEWT's root this frame: steer on the ground (walk, flee,
//                           face the camera), carry while he's held (the anchor his collar
//                           follows and the swing; main.js moves the root by anchor − collar
//                           once the bones are posed), the fall once he's let go (tossed with
//                           the hold's last ~80 ms) until his lowest foot meets the floor, when
//                           his root is snapped to the floor and steer takes him from there
//   createMix / mixStep     the clip weights: each one moves toward what the brain plays at
//                           clips.js's fade for the change (fadeFor of the leading clips), the
//                           gait's step phase advancing by speed over the stride Walk and Run
//                           make at their share of the mix (quicker steps starting and stopping)
//   twinWeights             a restart of a clip that still shows: its weight goes to its twin
//                           (character.js keeps the old pose playing there), so it fades out
//                           while the new start fades in, never a pop
//   lookAim                 where he looks: the camera when asked or when the pointer is on
//                           him; with the pointer's ray, turned from the viewer toward the
//                           cursor so his gaze points right at it on screen (lookAt.js
//                           screenAim: down toward a cursor below his head, up at one above,
//                           round toward one to a side, a profile for one behind him; without
//                           a ray, its floor spot lifted by LOOK.floorBias so his cap leaves his
//                           face showing), and "ahead" meaning toward the viewer
//   lookShare               how much of the look goes on: clips that lift his head to show his
//                           face themselves (Wave, the Sit trio) take only HEAD_SHARE of it, so
//                           the look never cricks it back further

import { blendStep, blendTarget, gaitPhase, mainClip, movingShare, runShare } from './blend.js';
import { CARRY, fallStep, grab, holdStep, toss } from './carry.js';
import { fadeFor } from './clips.js';
import { LOOK, aimAngles, screenAim, viewerAim } from './lookAt.js';
import { steer } from './steer.js';

/** @typedef {import('./types.js').Body} Body */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').CarryState} CarryState */
/** @typedef {import('./types.js').XYZ} XYZ */
/** @typedef {import('./types.js').XZ} XZ */
/** @typedef {import('./types.js').Aim} Aim */

/** A clip's twin is the clip's name and this (character.js plays the old start there). */
export const TWIN = '~';

/**
 * @typedef {object} BodyState  NEWT's root and who moves it
 * @property {'ground'|'held'|'fall'} mode
 * @property {boolean} grounded  BrainIn.newt.grounded
 * @property {XYZ} root  where his root is (main.js writes it back after anchoring a hold)
 * @property {Body} body  steer's body on the floor (its yaw is his root's)
 * @property {CarryState|null} carry  while he's held
 * @property {XYZ} vel  while he's falling
 * @property {{x: number, z: number}} tilt  the root's swing: root.rotation.x and .z
 * @property {number|null} landedAt  when he last landed
 */

/**
 * @param {{x?: number, z?: number, yaw?: number}} [at]
 * @returns {BodyState}
 */
export function createBody({ x = 0, z = 0, yaw = 0 } = {}) {
  return {
    mode: 'ground',
    grounded: true,
    root: { x, y: 0, z },
    body: { x, z, yaw, speed: 0 },
    carry: null,
    vel: { x: 0, y: 0, z: 0 },
    tilt: { x: 0, z: 0 },
    landedAt: null,
  };
}

/**
 * @typedef {object} BodyIn
 * @property {string} state  BrainOut.state
 * @property {import('./types.js').BrainOut['move']} move
 * @property {XZ|null} pointer  the pointer on the floor (a flee runs from it)
 * @property {Bounds|null} bounds
 * @property {number} dt
 * @property {number} t
 * @property {XYZ} [collar]  held: the collar now (read when he's grabbed)
 * @property {XYZ} [target]  held: where the pointer's ray meets the lift height
 * @property {number} [footOffset]  falling: his lowest foot's height over his root
 */

/**
 * One frame of NEWT's root: grabbed in any state; let go into a fall that lands on the floor;
 * steered on the ground otherwise. Updates `s` in place and returns it.
 * @param {BodyState} s
 * @param {BodyIn} o
 * @returns {BodyState}
 */
export function bodyStep(s, { state, move, pointer, bounds, dt, t, collar, target, footOffset = 0 }) {
  if (state === 'held' && collar && target) {
    if (s.mode !== 'held') {
      s.carry = grab(collar, t);
      s.mode = 'held';
      s.grounded = false;
      s.vel = { x: 0, y: 0, z: 0 };
      s.body = { ...s.body, speed: 0 };
    }
    holdStep(/** @type {CarryState} */ (s.carry), target, dt, bounds, t);
    s.tilt = { .../** @type {CarryState} */ (s.carry).tilt };
    return s;
  }
  if (s.mode === 'held') {
    // Let go (or a state that isn't held): tossed with the hold's last samples.
    s.vel = s.carry ? toss(s.carry) : { x: 0, y: 0, z: 0 };
    s.carry = null;
    s.mode = 'fall';
  }
  if (s.mode === 'fall') {
    const f = fallStep(s.root, s.vel, s.root.y + footOffset, dt, bounds, s.tilt);
    s.root = f.root;
    s.vel = f.vel;
    s.tilt = f.tilt ?? { x: 0, z: 0 };
    if (f.landed) {
      s.root = { x: f.root.x, y: CARRY.floorY, z: f.root.z };
      s.vel = { x: 0, y: 0, z: 0 };
      s.tilt = { x: 0, z: 0 };
      s.body = { x: s.root.x, z: s.root.z, yaw: s.body.yaw, speed: 0 };
      s.mode = 'ground';
      s.grounded = true;
      s.landedAt = t;
    }
    return s;
  }
  s.body = steer(s.body, move, pointer, bounds, dt);
  s.root = { x: s.body.x, y: CARRY.floorY, z: s.body.z };
  s.tilt = { x: 0, z: 0 };
  return s;
}

/**
 * @typedef {object} Mix  the clip weights and the step phase
 * @property {Record<string, number>} weights  summing to 1 (twins included)
 * @property {number} phase  the gait's step phase, [0, 1)
 * @property {string} main  the clip leading the mix (blend.js mainClip)
 * @property {number} fade  the fade under way, seconds
 */

/** @returns {Mix} */
export function createMix() {
  return { weights: { Idle: 1 }, phase: 0, main: 'Idle', fade: fadeFor(null, 'Idle') };
}

/**
 * One frame of the mix: a change of leading clip sets the fade (clips.js fadeFor), the weights
 * move toward what the brain plays, and the step phase advances by speed over the stride Walk
 * and Run make at their share of the new weights (blend.js gaitPhase). Updates `m` in place and
 * returns it.
 * @param {Mix} m
 * @param {{clip: string, speed: number, dt: number}} o  clip: BrainOut.clip; speed: steer's
 *   body.speed (it ramps, as his feet do)
 * @returns {Mix}
 */
export function mixStep(m, { clip, speed, dt }) {
  const main = mainClip(clip, speed);
  if (main !== m.main) {
    m.fade = fadeFor(m.main, main);
    m.main = main;
  }
  m.weights = blendStep(m.weights, blendTarget(clip, speed), m.fade, dt);
  m.phase = gaitPhase(m.phase, dt, speed, runShare(m.weights), movingShare(m.weights));
  return m;
}

/**
 * The weights for a restart of `clip`: what it shows now moves to its twin (adding to a twin
 * left from an earlier restart) and the new start comes in from nothing. The sum stays.
 * @param {Record<string, number>} weights
 * @param {string} clip
 * @returns {Record<string, number>}
 */
export function twinWeights(weights, clip) {
  const twin = `${clip}${TWIN}`;
  return { ...weights, [twin]: (weights[twin] ?? 0) + (weights[clip] ?? 0), [clip]: 0 };
}

/**
 * Where he looks this frame, for lookStep: `aim` (null when the mode has none) and `ahead`.
 * - 'camera': the camera;
 * - 'pointer': the camera when the pointer is on him; else, with its ray, lookAt.js screenAim
 *   (turned from the viewer toward the cursor, so his gaze points at it on screen), not
 *   clamped, so lookStep keeps a target behind him on the side his head is turned to; without
 *   one, its floor spot, lifted by LOOK.floorBias; null without a pointer;
 * - 'forward', 'back': no aim.
 * `ahead` is toward the viewer (lookAt.js viewerAim).
 * @param {'pointer'|'camera'|'forward'|'back'} mode  BrainOut.look.mode
 * @param {{head: XYZ, yaw: number, camera: XYZ, pointer: {floor: XZ|null, onNewt: boolean, ray?: {o: XYZ, d: XYZ}|null}|null}} o
 * @returns {{aim: Aim|null, ahead: Aim}}
 */
export function lookAim(mode, { head, yaw, camera, pointer }) {
  const ahead = viewerAim(head, yaw, camera);
  if (mode === 'camera') return { aim: aimAngles(head, yaw, camera), ahead };
  if (mode !== 'pointer' || !pointer) return { aim: null, ahead };
  if (pointer.onNewt) return { aim: aimAngles(head, yaw, camera), ahead };
  if (pointer.ray) return { aim: screenAim(pointer.ray, head, yaw, camera), ahead };
  if (!pointer.floor) return { aim: null, ahead };
  return { aim: aimAngles(head, yaw, { x: pointer.floor.x, y: 0, z: pointer.floor.z }, LOOK.floorBias), ahead };
}

/** The share of the look the clips that lift his head themselves take (the rest take it all). */
export const HEAD_SHARE = { Wave: 0.4, Sit: 0.4, SitDown: 0.4, StandUp: 0.4 };

/**
 * The share of the brain's look weight to apply under the mix `weights`: 1, less each
 * HEAD_SHARE clip's (and its twin's) weight times what it gives up.
 * @param {Record<string, number>} weights
 */
export function lookShare(weights) {
  let k = 1;
  for (const [clip, share] of Object.entries(HEAD_SHARE))
    k -= ((weights[clip] ?? 0) + (weights[`${clip}${TWIN}`] ?? 0)) * (1 - share);
  return Math.max(0, k);
}
