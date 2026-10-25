// Every drag kind the invitation toy can hold NEWT with, by name (hold.js DRAG_KINDS: each kind's
// own module; a designer only ever changes theirs), and createHold, which makes one for a grab.

import { createTodayHold, dragKind } from '../hold.js';
import { createBeadHold } from './bead.js';
import { createLevelHold } from './level.js';
import { createTiltHold } from './tilt.js';

/**
 * @typedef {object} HoldDeps  what the page hands a kind
 * @property {() => number} [rng]  a random number 0..1 (the page's seeded one)
 */

/** @type {Record<import('../hold.js').DragKind, (deps?: HoldDeps) => import('../hold.js').Hold>} */
export const HOLDS = {
  today: () => createTodayHold(),
  level: createLevelHold,
  tilt: createTiltHold,
  bead: createBeadHold,
};

/**
 * A hold of kind `kind` (anything else: today's).
 * @param {unknown} kind
 * @param {HoldDeps} [deps]
 * @returns {import('../hold.js').Hold}
 */
export function createHold(kind, deps = {}) {
  return HOLDS[dragKind(kind)](deps);
}
