// The campfire game's phase rules and timer arithmetic: which round phase may follow which, the
// one obvious next step, countdowns on the laptop's clock, and the reveal's steps and length.
// Pure; no DOM. Every time is passed in (`now`, epoch ms); nothing reads a clock.
//
//   canAdvance(event, to)   may the round move to `to` now? (Check with the reason)
//   nextPhase(event)        where the one obvious next action leads (null once finished)
//   nextRoundIndex(event)   the next unskipped round after the current one, or -1
//   canSkip(event, roundId) may this round be skipped now? (Check with the reason)
//   emptyTimer / idleTimer  a phase with no timer; a countdown set but not started
//   startTimer, pauseTimer, resumeTimer, addTime   total: a timer not in the right state comes
//                           back unchanged (reduce() checks status first for 'timer_state')
//   remaining(timer, now)   ms left, never negative
//   expired(timer, now)     ran out (it only prompts the host; nothing advances by itself)
//   revealSteps / revealMs  a round's reveal sequence and its estimated length
/**
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').RoundPhase} RoundPhase
 * @typedef {import('./types.js').EventPhase} EventPhase
 * @typedef {import('./types.js').Check} Check
 * @typedef {import('./types.js').Timer} Timer
 * @typedef {import('./types.js').TimerKind} TimerKind
 * @typedef {import('./types.js').RevealStep} RevealStep
 * @typedef {import('./types.js').ErrorCode} ErrorCode
 */
import { REVEAL_BANNER_MS, ROUND_PHASES, larpError } from './types.js';

/**
 * Where a phase change leads.
 * @typedef {{ phase: EventPhase, roundIndex: number, roundPhase: RoundPhase|null }} PhaseTarget
 */

/** The round phases from which the current, unpublished round may be skipped. */
const SKIPPABLE = /** @type {readonly RoundPhase[]} */ (['briefing', 'preparation', 'performances', 'review']);

/**
 * Which round phase may follow which inside a round (Results → Briefing crosses to the next
 * round and is handled on its own).
 * @type {Readonly<Record<RoundPhase, readonly RoundPhase[]>>}
 */
const FOLLOWS = Object.freeze({
  briefing: ['preparation'],
  preparation: ['performances'],
  performances: ['review'],
  review: ['performances', 'reveal'],
  reveal: ['results'],
  results: ['briefing'],
});

/** @type {Check} */
const OK = Object.freeze({ ok: true });

/**
 * @param {ErrorCode} code
 * @param {string} message
 * @param {string[]} [ids]
 * @returns {Check}
 */
const fail = (code, message, ids) => ({ ok: false, error: larpError(code, message, ids ? { ids } : {}) });

/**
 * @param {LarpEvent} event
 * @param {string} roundId
 */
const hasResult = (event, roundId) => event.results.some((r) => r.roundId === roundId);

/**
 * Whether the event may move to round phase `to` now. Within a round: briefing → preparation →
 * performances → review → reveal → results, plus review → performances (Reopen Judging).
 * `to` 'briefing' means the next unskipped round's Briefing, from Welcome (running, roundIndex
 * -1) or from Results ('no_more_rounds' when there is none). review → reveal also needs every
 * queued team's status ('status_unset', `ids` the unset teams in queue order) and no result yet
 * ('already_published'; reopening a published round's judging too). Anything else: 'wrong_phase'.
 * @param {LarpEvent} event
 * @param {RoundPhase} to
 * @returns {Check}
 */
export function canAdvance(event, to) {
  if (event.phase !== 'running') return fail('wrong_phase', `the event is ${event.phase}`);
  const from = event.roundPhase;
  if (from === null) {
    // Welcome: only the first playable round's Briefing.
    if (to !== 'briefing') return fail('wrong_phase', `Welcome cannot go to ${to}`);
    return nextRoundIndex(event) === -1 ? fail('no_more_rounds', 'every round is skipped') : OK;
  }
  if (!(FOLLOWS[from] ?? []).includes(to)) return fail('wrong_phase', `${from} cannot go to ${to}`);
  if (to === 'briefing') {
    return nextRoundIndex(event) === -1 ? fail('no_more_rounds', 'that was the last round') : OK;
  }
  const round = event.rounds[event.roundIndex];
  if (!round) return fail('wrong_phase', `no round ${event.roundIndex}`);
  if (from === 'review') {
    if (hasResult(event, round.id)) return fail('already_published', `${round.id} is already published`);
    if (to === 'reveal') {
      const unset = round.order.filter((teamId) => !Object.hasOwn(round.statuses, teamId));
      if (unset.length) return fail('status_unset', `${unset.length} team(s) have no status`, unset);
    }
  }
  return OK;
}

/**
 * Whether round `roundId` may be skipped now (the event running): the current round while it is
 * unpublished and in Briefing, Preparation, Performances or Review, or any later round. A round
 * with a result: 'already_published'; one already skipped, an earlier one, or the current one in
 * Reveal or Results: 'wrong_phase'; no such round: 'not_found'.
 * @param {LarpEvent} event
 * @param {string} roundId
 * @returns {Check}
 */
export function canSkip(event, roundId) {
  if (event.phase !== 'running') return fail('wrong_phase', `the event is ${event.phase}`);
  const index = event.rounds.findIndex((r) => r.id === roundId);
  if (index === -1) return fail('not_found', `no round ${roundId}`);
  if (hasResult(event, roundId)) return fail('already_published', `${roundId} is already published`);
  if (event.rounds[index].skipped) return fail('wrong_phase', `${roundId} is already skipped`);
  if (index < event.roundIndex) return fail('wrong_phase', `${roundId} is over`);
  if (index === event.roundIndex && !(event.roundPhase && SKIPPABLE.includes(event.roundPhase))) {
    return fail('wrong_phase', `${roundId} cannot be skipped in ${event.roundPhase}`);
  }
  return OK;
}

/**
 * The destination of the host's one obvious next action: Setup → running Welcome; Welcome or
 * Results → the next unskipped round's Briefing, or finished after the last (roundIndex kept);
 * otherwise the next phase in ROUND_PHASES. It doesn't check gates (statuses, results):
 * canAdvance does. null once finished.
 * @param {LarpEvent} event
 * @returns {PhaseTarget|null}
 */
export function nextPhase(event) {
  if (event.phase === 'finished') return null;
  if (event.phase === 'setup') return { phase: 'running', roundIndex: -1, roundPhase: null };
  const from = event.roundPhase;
  if (from === null || from === 'results') {
    const next = nextRoundIndex(event);
    return next === -1
      ? { phase: 'finished', roundIndex: event.roundIndex, roundPhase: null }
      : { phase: 'running', roundIndex: next, roundPhase: 'briefing' };
  }
  const i = ROUND_PHASES.indexOf(from);
  return { phase: 'running', roundIndex: event.roundIndex, roundPhase: ROUND_PHASES[i + 1] };
}

/**
 * The index of the next round after event.roundIndex that isn't skipped, or -1.
 * @param {LarpEvent} event
 * @returns {number}
 */
export function nextRoundIndex(event) {
  for (let i = Math.max(-1, event.roundIndex) + 1; i < event.rounds.length; i++) {
    if (!event.rounds[i].skipped) return i;
  }
  return -1;
}

/**
 * No timer: kind null, idle, 0 ms.
 * @returns {Timer}
 */
export function emptyTimer() {
  return { kind: null, status: 'idle', durationMs: 0, deadline: null, remainingMs: null };
}

/**
 * A countdown set but not started: idle, remainingMs = durationMs, deadline null.
 * @param {TimerKind} kind
 * @param {number} durationMs
 * @returns {Timer}
 */
export function idleTimer(kind, durationMs) {
  return { kind, status: 'idle', durationMs, deadline: null, remainingMs: durationMs };
}

/**
 * Starts an idle timer: running, deadline = now + remainingMs. Any other state (or kind null):
 * unchanged.
 * @param {Timer} timer
 * @param {number} now
 * @returns {Timer}
 */
export function startTimer(timer, now) {
  if (timer.kind === null || timer.status !== 'idle') return timer;
  return { ...timer, status: 'running', deadline: now + (timer.remainingMs ?? timer.durationMs), remainingMs: null };
}

/**
 * Pauses a running timer: paused, remainingMs = max(0, deadline − now), deadline null.
 * Any other state: unchanged.
 * @param {Timer} timer
 * @param {number} now
 * @returns {Timer}
 */
export function pauseTimer(timer, now) {
  if (timer.kind === null || timer.status !== 'running') return timer;
  return { ...timer, status: 'paused', deadline: null, remainingMs: remaining(timer, now) };
}

/**
 * Resumes a paused timer: running, deadline = now + remainingMs. Any other state: unchanged.
 * @param {Timer} timer
 * @param {number} now
 * @returns {Timer}
 */
export function resumeTimer(timer, now) {
  if (timer.kind === null || timer.status !== 'paused') return timer;
  return { ...timer, status: 'running', deadline: now + (timer.remainingMs ?? 0), remainingMs: null };
}

/**
 * Adds `ms` (a positive whole number) to the countdown in any state with a kind: running moves
 * the deadline (from max(deadline, now), so an expired timer gets the full `ms`), paused/idle add
 * to remainingMs; durationMs grows by `ms` too. A timer with kind null, or an `ms` that isn't a
 * positive safe integer, comes back unchanged (the reducer validates first: 'invalid_duration').
 * @param {Timer} timer
 * @param {number} ms
 * @param {number} now
 * @returns {Timer}
 */
export function addTime(timer, ms, now) {
  if (timer.kind === null || !Number.isSafeInteger(ms) || ms <= 0) return timer;
  const durationMs = timer.durationMs + ms;
  if (timer.status === 'running') {
    return { ...timer, durationMs, deadline: Math.max(timer.deadline ?? now, now) + ms };
  }
  return { ...timer, durationMs, remainingMs: (timer.remainingMs ?? 0) + ms };
}

/**
 * The ms left: running max(0, deadline − now); paused or idle remainingMs; kind null 0.
 * @param {Timer} timer
 * @param {number} now
 * @returns {number}
 */
export function remaining(timer, now) {
  if (timer.kind === null) return 0;
  if (timer.status === 'running') return Math.max(0, (timer.deadline ?? now) - now);
  return Math.max(0, timer.remainingMs ?? 0);
}

/**
 * Whether a timer with a kind has run out (remaining(timer, now) === 0 and it was started, so
 * a paused timer at zero counts). It only prompts the host; nothing advances by itself.
 * @param {Timer} timer
 * @param {number} now
 * @returns {boolean}
 */
export function expired(timer, now) {
  return timer.kind !== null && timer.status !== 'idle' && remaining(timer, now) === 0;
}

/**
 * A round's reveal sequence: for each team in the round's queue, its header ('team'), then its
 * team awards, then its members' individual awards ('award', grouped under the member's team);
 * then one 'standings' step. Uses the published result when there is one (its frozen teams),
 * otherwise the round's drafts as they would publish (members' current teams, for Review's
 * estimate). Every award appears; none is dropped: an award whose team isn't in the queue comes
 * after the queue's groups, before the standings (teamId null when it has no team). A skipped or
 * unknown round has no steps.
 * @param {LarpEvent} event
 * @param {string} roundId
 * @returns {RevealStep[]}
 */
export function revealSteps(event, roundId) {
  const round = event.rounds.find((r) => r.id === roundId);
  if (!round || round.skipped) return [];
  const result = event.results.find((r) => r.roundId === roundId);

  /** @type {Array<{ id: string, individual: boolean, teamId: string }>} */
  let awards;
  /** @type {string[]} */
  let order;
  if (result) {
    awards = result.adjustments.map((a) => ({ id: a.id, individual: a.recipientType === 'member', teamId: a.teamId }));
    const frozen = Object.keys(result.completion);
    order = [...round.order.filter((id) => frozen.includes(id)), ...frozen.filter((id) => !round.order.includes(id))];
  } else {
    const teamOf = new Map(event.roster.map((m) => [m.id, m.teamId]));
    awards = event.adjustments
      .filter((a) => a.roundId === roundId && a.status === 'draft')
      .map((a) => ({
        id: a.id,
        individual: a.recipientType === 'member',
        teamId: a.recipientType === 'member' ? (teamOf.get(a.recipientId) ?? '') : a.recipientId,
      }));
    order = round.order;
  }

  /** @type {RevealStep[]} */
  const steps = [];
  const shown = new Set();
  for (const teamId of order) {
    steps.push({ kind: 'team', teamId, adjustmentId: null });
    for (const individual of [false, true]) {
      for (const a of awards) {
        if (a.teamId === teamId && a.individual === individual && !shown.has(a.id)) {
          steps.push({ kind: 'award', teamId, adjustmentId: a.id });
          shown.add(a.id);
        }
      }
    }
  }
  for (const a of awards) {
    if (!shown.has(a.id)) steps.push({ kind: 'award', teamId: a.teamId || null, adjustmentId: a.id });
  }
  steps.push({ kind: 'standings', teamId: null, adjustmentId: null });
  return steps;
}

/**
 * The estimated reveal length: steps × REVEAL_BANNER_MS.
 * @param {RevealStep[]} steps
 * @returns {number}
 */
export function revealMs(steps) {
  return steps.length * REVEAL_BANNER_MS;
}
