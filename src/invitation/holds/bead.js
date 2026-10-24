// The 'bead' drag kind (design.md's candidate: the collar a bead on the cursor's ray, sprung toward
// a level hold plane, with a rope body and a 3D throw). A stub until its designer builds it here:
// today's hold (hold.js createTodayHold) under its own name, so ?drag=bead runs and every shared
// check measures it. Only this file changes when it's built.

import { createTodayHold } from '../hold.js';

/**
 * @param {import('./index.js').HoldDeps} [deps]
 * @returns {import('../hold.js').Hold}
 */
export function createBeadHold(deps = {}) {
  return Object.assign(createTodayHold(), { kind: /** @type {const} */ ('bead') });
}
