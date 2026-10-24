// The 'tilt' drag kind (design.md's candidate: a plane tilted by the camera's elevation that stands
// upright as he goes higher). A stub until its designer builds it here: today's hold (hold.js
// createTodayHold) under its own name, so ?drag=tilt runs and every shared check measures it. Only
// this file changes when it's built.

import { createTodayHold } from '../hold.js';

/**
 * @param {import('./index.js').HoldDeps} [deps]
 * @returns {import('../hold.js').Hold}
 */
export function createTiltHold(deps = {}) {
  return Object.assign(createTodayHold(), { kind: /** @type {const} */ ('tilt') });
}
