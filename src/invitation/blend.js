// NEWT's animation blending for the invitation toy, done by hand rather than with three's
// crossFade or warp: every clip's weight moves toward its target at 1/fade per second with the
// sum kept at 1 (applied with setEffectiveWeight); Idle, Walk and Run are one blend by speed on
// a single shared step phase (it goes quicker while Walk and Run are only part of the mix,
// starting off and slowing down, so a planted foot keeps pace with the floor); and a one-shot
// starts fading out when its time left equals the next clip's fade. Pure: no three.js.

import { GAIT, STRIDE, fadeFor } from './clips.js';

/** What follows each one-shot when nothing else is asked for. */
export const NEXT_CLIP = { Wave: 'Idle', Spook: 'Idle', Land: 'Idle', SitDown: 'Sit', StandUp: 'Idle' };

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * The least share of the mix Walk and Run are counted at for the step phase (below it the steps
 * would get frantic for a stride too small to see).
 */
export const STEP_SHARE_MIN = 0.3;

/**
 * Idle, Walk and Run weights for a speed: Idle at 0, Walk at GAIT.walk, Run at GAIT.run,
 * straight lines between.
 * @param {number} speed  world units/s
 * @returns {{Idle: number, Walk: number, Run: number}}
 */
export function gaitWeights(speed) {
  if (!(speed > 0)) return { Idle: 1, Walk: 0, Run: 0 };
  if (speed < GAIT.walk) {
    const w = speed / GAIT.walk;
    return { Idle: 1 - w, Walk: w, Run: 0 };
  }
  const r = clamp01((speed - GAIT.walk) / (GAIT.run - GAIT.walk));
  return { Idle: 0, Walk: 1 - r, Run: r };
}

/**
 * The target weights for what the brain plays: the gait blend by speed, or one clip.
 * @param {string} clip  BrainOut.clip: 'gait' or a clip name
 * @param {number} speed  his speed (steer's body.speed follows his feet best)
 * @returns {Record<string, number>}
 */
export function blendTarget(clip, speed) {
  return clip === 'gait' ? gaitWeights(speed) : { [clip]: 1 };
}

/**
 * The clip that leads what the brain plays, for fadeFor: the gait's heaviest clip at that
 * speed, or the clip itself (so a fade is `fadeFor(mainClip(was, wasSpeed), mainClip(now, speed))`).
 * @param {string} clip  BrainOut.clip
 * @param {number} speed
 */
export function mainClip(clip, speed) {
  if (clip !== 'gait') return clip;
  const w = gaitWeights(speed);
  return w.Run > w.Walk && w.Run > w.Idle ? 'Run' : w.Walk > w.Idle ? 'Walk' : 'Idle';
}

/**
 * Moves each weight toward its target at 1/fade per second, then scales them to sum to 1. A
 * clip that has faded out stays in the result at 0 so the page can zero it.
 * @param {Record<string, number>} weights  now
 * @param {Record<string, number>} target  summing to 1 (clips left out are 0)
 * @param {number|Record<string, number>} fades  seconds: one for every clip (fadeFor of the
 *   change under way), or per clip (a clip left out takes 0.2)
 * @param {number} dt
 * @returns {Record<string, number>}
 */
export function blendStep(weights, target, fades, dt) {
  /** @type {Record<string, number>} */
  const out = {};
  let sum = 0;
  for (const k of new Set([...Object.keys(weights), ...Object.keys(target)])) {
    const now = weights[k] ?? 0;
    const want = target[k] ?? 0;
    const fade = typeof fades === 'number' ? fades : (fades[k] ?? 0.2);
    const step = fade > 0 ? dt / fade : 1;
    const w = now < want ? Math.min(want, now + step) : Math.max(want, now - step);
    out[k] = w;
    sum += w;
  }
  if (sum > 0) for (const k in out) out[k] /= sum;
  else Object.assign(out, target);
  return out;
}

/**
 * Advances the one step phase in [0, 1) that Walk and Run both play from: by dt·speed over a
 * stride blended from Walk's to Run's by the run share, at the share of the mix they have
 * (`moving`, at least STEP_SHARE_MIN): mixed with Idle, which steps nowhere, their stride
 * shrinks with their weight, so the steps come quicker and a planted foot still keeps pace with
 * the floor. Standing still holds it.
 * @param {number} phase
 * @param {number} dt
 * @param {number} speed  world units/s
 * @param {number} wRun  Run's share of the moving weight (runShare)
 * @param {number} [moving]  Walk's and Run's share of the whole mix (movingShare; 1 by default)
 */
export function gaitPhase(phase, dt, speed, wRun, moving = 1) {
  if (!(speed > 0) || !(dt > 0)) return phase;
  const r = clamp01(wRun);
  const stride = (STRIDE.Walk + (STRIDE.Run - STRIDE.Walk) * r) * Math.max(STEP_SHARE_MIN, Math.min(1, moving));
  const p = (phase + (dt * speed) / stride) % 1;
  return p < 0 ? p + 1 : p;
}

/**
 * Walk's and Run's share of the whole mix (the weights sum to 1).
 * @param {Record<string, number>} weights
 */
export function movingShare(weights) {
  return (weights.Walk ?? 0) + (weights.Run ?? 0);
}

/**
 * Run's share of Walk + Run (0 when neither plays).
 * @param {Record<string, number>} weights
 */
export function runShare(weights) {
  const walk = weights.Walk ?? 0;
  const run = weights.Run ?? 0;
  return walk + run > 0 ? run / (walk + run) : 0;
}

/**
 * Walk's and Run's times for a phase: both at the same point of their step cycle.
 * @param {number} phase
 * @param {{Walk: number, Run: number}} lengths  seconds (character.clipLength)
 */
export function gaitTimes(phase, lengths) {
  return { Walk: phase * lengths.Walk, Run: phase * lengths.Run };
}

/**
 * Whether a one-shot should start fading out: its time left is down to the next clip's fade.
 * @param {string} clip
 * @param {number} remaining  seconds left in the clip
 * @param {string} [next]  the clip that follows (NEXT_CLIP by default)
 */
export function fadeOutDue(clip, remaining, next = NEXT_CLIP[clip] ?? 'Idle') {
  return remaining <= fadeFor(clip, next) + 1e-9;
}
