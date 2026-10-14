// NEWT's face from moment to moment in the invitation toy: the base face the brain picks from
// FACE_TRACK, with blinks on top: 'normal' every 2–5 s (a quick one, now and then twice),
// 'slow' every 3–6 s (a long, sleepy one), 'none' never. Pure: time comes in as t, randomness
// from rng.js; the state object is updated in place.

import { between } from './rng.js';

/** @typedef {import('./clips.js').FaceName} FaceName */
/** @typedef {import('./clips.js').BlinkMode} BlinkMode */
/** @typedef {import('./types.js').FaceState} FaceState */

/**
 * Seconds between blinks (min to max, start to start), how long one lasts, the chance it's a
 * double, and the gap inside a double.
 */
export const BLINK = {
  normal: { min: 2, max: 5, length: 0.12, double: 0.15, gap: 0.08 },
  slow: { min: 3, max: 6, length: 0.25, double: 0, gap: 0 },
};

/** @returns {FaceState} */
export function createFaceState() {
  return { mode: null, next: null, until: 0, again: null };
}

/**
 * The face to show now: `base`, or 'blink' while a blink is on. A change of blink mode starts
 * a fresh wait, so a new mode never blinks at once.
 * @param {FaceState} s
 * @param {FaceName} base
 * @param {BlinkMode} blinkMode
 * @param {number} t  seconds
 * @param {() => number} rng
 * @returns {FaceName}
 */
export function faceStep(s, base, blinkMode, t, rng) {
  const spec = BLINK[blinkMode];
  if (!spec) {
    s.mode = blinkMode;
    s.next = null;
    s.again = null;
    s.until = 0;
    return base;
  }
  if (s.mode !== blinkMode || s.next == null) {
    s.mode = blinkMode;
    s.next = t + between(rng, spec.min, spec.max);
    s.again = null;
  }
  if (t >= s.next) {
    s.until = t + spec.length;
    s.again = rng() < spec.double ? s.until + spec.gap : null;
    s.next = t + between(rng, spec.min, spec.max);
  } else if (s.again != null && t >= s.again) {
    s.until = t + spec.length;
    s.again = null;
  }
  return t < s.until ? 'blink' : base;
}
