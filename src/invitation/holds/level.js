// The 'level' drag kind (design.md's candidate: a level hold plane at a set height, the wheel or a
// second finger raising and lowering him). A stub until its designer builds it here: today's hold
// (hold.js createTodayHold) under its own name, so ?drag=level runs and every shared check measures
// it. Only this file changes when it's built.

import { createTodayHold } from '../hold.js';

/**
 * @param {import('./index.js').HoldDeps} [deps]
 * @returns {import('../hold.js').Hold}
 */
export function createLevelHold(deps = {}) {
  return Object.assign(createTodayHold(), { kind: /** @type {const} */ ('level') });
}
