// Who may do what in the campfire game. Pure; no DOM. On one shared laptop this is attribution
// and mistake-avoidance, not security.
//
//   check(actor, action, event, target?)  the reason an action isn't allowed, or null
//   can(actor, action, event, target?)    check(...) === null
//
// Rules: mode 'host' needs the host GM (gms[].host) and may do everything, including adding an
// award "from" any GM. Mode 'judge' (any GM in Judge Mode) may only addAward as themselves, and
// editAward / removeAward on their own draft awards, and only while judging is open
// (JUDGING_OPEN_PHASES: Preparation, Performances) in the current round; 'viewJudging' only for
// the current round. Never phases, timers, setup, statuses, review, publish, reveal or
// corrections. An unknown GM: 'forbidden'. Judge actions outside judging: 'judging_closed';
// another GM's award: 'not_own_award'; a non-draft award: 'not_draft'.
/**
 * @typedef {import('./types.js').Actor} Actor
 * @typedef {import('./types.js').RoleAction} RoleAction
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').LarpError} LarpError
 * @typedef {import('./types.js').Adjustment} Adjustment
 */

import { COMMAND_TYPES, JUDGING_OPEN_PHASES, VIEW_ACTIONS, larpError } from './types.js';

/**
 * What an action is aimed at: the adjustment for editAward / removeAward, the round for
 * viewJudging, the award's would-be author for addAward (`authorId`).
 * @typedef {Partial<Pick<Adjustment, 'authorId'|'status'|'roundId'>>} RoleTarget
 */

/** Every action roles.check() knows; anything else is refused, even for the host. */
const KNOWN_ACTIONS = new Set([...COMMAND_TYPES, ...VIEW_ACTIONS]);

/** The only actions Judge Mode offers. */
const JUDGE_ACTIONS = new Set(['addAward', 'editAward', 'removeAward', 'viewJudging']);

/** @type {ReadonlySet<string>} */
const OPEN_PHASES = new Set(JUDGING_OPEN_PHASES);

/**
 * The current round's id, or null outside a round (Setup, Welcome, Finished).
 * @param {LarpEvent} event
 * @returns {string|null}
 */
function currentRoundId(event) {
  if (!event || event.phase !== 'running' || event.roundPhase == null) return null;
  return event.rounds?.[event.roundIndex]?.id ?? null;
}

/**
 * Why `actor` may not do `action` now, or null when they may. Only role questions: payload
 * validity and phase legality for the host are reduce()'s job.
 *
 * Checked in this order (the first failure wins):
 *   1. no actor, an unknown action, an unknown or removed GM, a bad mode, or host mode without
 *      the host GM: 'forbidden'. Host mode then may do anything.
 *   2. Judge Mode: an action outside addAward / editAward / removeAward / viewJudging, adding an
 *      award with another author (`target.authorId`), or viewing another round: 'forbidden'.
 *   3. an award action while judging is closed (not Preparation/Performances of a running event)
 *      or aimed at another round (`target.roundId`): 'judging_closed'.
 *   4. editAward / removeAward: the target's author isn't this GM (or no target): 'not_own_award';
 *      the target isn't a draft: 'not_draft'. Pass the whole Adjustment as `target`.
 * @param {Actor} actor
 * @param {RoleAction} action
 * @param {LarpEvent} event
 * @param {RoleTarget} [target]
 * @returns {LarpError|null}
 */
export function check(actor, action, event, target) {
  if (!actor || typeof actor !== 'object' || typeof actor.gmId !== 'string') {
    return larpError('forbidden', 'No GM is at the controls (the display can do nothing)');
  }
  if (!KNOWN_ACTIONS.has(action)) return larpError('forbidden', `Unknown action: ${String(action)}`);
  const gm = (event?.gms ?? []).find((g) => g.id === actor.gmId);
  if (!gm) return larpError('forbidden', 'This GM is not in the event', { ids: [actor.gmId] });

  if (actor.mode === 'host') {
    return gm.host ? null : larpError('forbidden', 'Only the host GM may use the host console', { ids: [gm.id] });
  }
  if (actor.mode !== 'judge') return larpError('forbidden', `Unknown mode: ${String(actor.mode)}`);

  return judgeCheck(gm.id, action, event, target);
}

/**
 * check() for a GM in Judge Mode (steps 2 to 4 above).
 * @param {string} gmId
 * @param {RoleAction} action
 * @param {LarpEvent} event
 * @param {RoleTarget} [target]
 * @returns {LarpError|null}
 */
function judgeCheck(gmId, action, event, target) {
  if (!JUDGE_ACTIONS.has(action)) return larpError('forbidden', `Judge Mode cannot ${action}`);
  const roundId = currentRoundId(event);
  const otherRound = target?.roundId != null && target.roundId !== roundId;

  if (action === 'viewJudging') {
    return roundId && !otherRound ? null : larpError('forbidden', 'Judge Mode sees the current round only');
  }
  if (action === 'addAward' && target?.authorId != null && target.authorId !== gmId) {
    return larpError('forbidden', 'Judge Mode adds awards only as yourself', { field: 'authorId' });
  }
  if (!roundId || !OPEN_PHASES.has(/** @type {string} */ (event.roundPhase))) {
    return larpError('judging_closed', 'Judging is closed: the host has started Review (or no round is open)');
  }
  if (otherRound) return larpError('judging_closed', 'Judging is closed for that round');
  if (action === 'addAward') return null;

  if (target?.authorId !== gmId) return larpError('not_own_award', 'Judge Mode edits only your own awards');
  if (target.status !== 'draft') return larpError('not_draft', 'This award is already published or removed');
  return null;
}

/**
 * Whether `actor` may do `action` now (for showing and hiding controls).
 * @param {Actor} actor
 * @param {RoleAction} action
 * @param {LarpEvent} event
 * @param {RoleTarget} [target]
 * @returns {boolean}
 */
export function can(actor, action, event, target) {
  return check(actor, action, event, target) === null;
}
