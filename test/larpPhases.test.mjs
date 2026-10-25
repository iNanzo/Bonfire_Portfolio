// The campfire game's phase rules and timers (src/larp/phases.js): every legal and illegal move
// of the round machine (briefing → preparation → performances → review → reveal → results, and
// review back to performances), publishing only from Review with every queued team's status set,
// skipping only an unpublished round, the host's one obvious next step from Setup to Finished,
// and the countdowns on an injected clock (deadline while running, remainingMs while paused) that
// survive a reload, never go negative and never move the phase. Events are built by hand with the
// fixtures, so nothing here depends on the reducer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addTime,
  canAdvance,
  canSkip,
  emptyTimer,
  expired,
  idleTimer,
  nextPhase,
  nextRoundIndex,
  pauseTimer,
  remaining,
  resumeTimer,
  revealMs,
  revealSteps,
  startTimer,
} from '../src/larp/phases.js';
import { REVEAL_BANNER_MS, ROUND_PHASES } from '../src/larp/types.js';
import {
  T0,
  atRound,
  blankEvent,
  deepFreeze,
  eventWithTeams,
  makeAdjustment,
  withAwards,
  withPublished,
} from './lib/larpFixtures.mjs';

/** @typedef {import('../src/larp/types.js').LarpEvent} LarpEvent */
/** @typedef {import('../src/larp/types.js').RoundPhase} RoundPhase */

const ALL_SET = { 'team-1': 'complete', 'team-2': 'passed', 'team-3': 'absent', 'team-4': 'complete' };
const SEC = 1000;

/** Four teams, running, at round `idx` in `phase`. */
const at = (idx, phase, opts = {}) => deepFreeze(atRound(eventWithTeams(4, { membersPerTeam: 2 }), idx, phase, opts));

/** The running Welcome screen: after startEvent, before round 1. */
const welcome = () => deepFreeze({ ...eventWithTeams(4), phase: 'running', roundIndex: -1, roundPhase: null });

/** The event with the rounds at these indexes marked skipped. */
const skipping = (event, ...idx) => ({
  ...event,
  rounds: event.rounds.map((r, i) => (idx.includes(i) ? { ...r, skipped: true } : r)),
});

/** @param {import('../src/larp/types.js').Check} check */
const code = (check) => (check.ok ? 'ok' : check.error.code);

// ---------------------------------------------------------------------------------------------
// canAdvance: the round machine

test('canAdvance: exactly the design transitions are legal from each round phase', () => {
  /** @type {Record<RoundPhase, RoundPhase[]>} */
  const legal = {
    briefing: ['preparation'],
    preparation: ['performances'],
    performances: ['review'],
    review: ['performances', 'reveal'],
    reveal: ['results'],
    results: ['briefing'],
  };
  for (const from of ROUND_PHASES) {
    // Reveal and Results come after publication, so give those a result (and Review its statuses).
    let event = at(1, from, { statuses: ALL_SET });
    if (from === 'reveal' || from === 'results') event = withPublished(event, 'round-dance');
    for (const to of ROUND_PHASES) {
      const got = code(canAdvance(event, to));
      const want = legal[from].includes(to) ? 'ok' : 'wrong_phase';
      assert.equal(got, want, `${from} → ${to}`);
    }
  }
});

test('canAdvance: nothing moves in Setup or once Finished', () => {
  const setup = deepFreeze(eventWithTeams(4));
  const finished = deepFreeze({ ...at(4, 'results'), phase: 'finished', roundPhase: null });
  for (const to of ROUND_PHASES) {
    assert.equal(code(canAdvance(setup, to)), 'wrong_phase', `setup → ${to}`);
    assert.equal(code(canAdvance(finished, to)), 'wrong_phase', `finished → ${to}`);
  }
});

test('canAdvance: Welcome only leads to a Briefing', () => {
  const event = welcome();
  assert.deepEqual(canAdvance(event, 'briefing'), { ok: true });
  for (const to of ROUND_PHASES.filter((p) => p !== 'briefing')) {
    assert.equal(code(canAdvance(event, to)), 'wrong_phase', `welcome → ${to}`);
  }
});

test('canAdvance: no Briefing after the last round, or when every later round is skipped', () => {
  const last = withPublished(at(4, 'results', { statuses: ALL_SET }), 'round-cheer');
  assert.equal(code(canAdvance(last, 'briefing')), 'no_more_rounds');
  const rest = skipping(withPublished(at(2, 'results', { statuses: ALL_SET }), 'round-prayer'), 3, 4);
  assert.equal(code(canAdvance(rest, 'briefing')), 'no_more_rounds');
  const allSkipped = skipping(welcome(), 0, 1, 2, 3, 4);
  assert.equal(code(canAdvance(allSkipped, 'briefing')), 'no_more_rounds');
});

test('canAdvance: a skipped round sitting in Results still leads on to the next Briefing', () => {
  const event = skipping(at(1, 'results'), 1);
  assert.deepEqual(canAdvance(event, 'briefing'), { ok: true });
});

test('canAdvance: publishing needs every queued team, including a mid-game arrival, to have a status', () => {
  const ready = at(0, 'review', { statuses: ALL_SET });
  assert.deepEqual(canAdvance(ready, 'reveal'), { ok: true });

  const missing = at(0, 'review', { statuses: { 'team-1': 'complete', 'team-3': 'absent' } });
  const check = canAdvance(missing, 'reveal');
  assert.equal(code(check), 'status_unset');
  assert.ok(!check.ok);
  assert.deepEqual(check.error.ids, ['team-2', 'team-4'], 'names the teams still unset, in queue order');

  const none = at(0, 'review');
  assert.equal(code(canAdvance(none, 'reveal')), 'status_unset');

  // A team added during Performances joins the end of the queue and must be judged too.
  const joined = {
    ...ready,
    teams: [...ready.teams, { ...ready.teams[0], id: 'team-5', name: 'Đội 5', admittedRound: 0 }],
    rounds: ready.rounds.map((r, i) =>
      i === 0 ? { ...r, order: [...r.order, 'team-5'], admittedTeams: ['team-5'] } : r,
    ),
  };
  const late = canAdvance(joined, 'reveal');
  assert.equal(code(late), 'status_unset');
  assert.ok(!late.ok);
  assert.deepEqual(late.error.ids, ['team-5']);
});

test('canAdvance: a status for a team outside the queue does not stand in for a queued one', () => {
  const event = at(0, 'review', { statuses: { 'team-1': 'complete', 'team-2': 'complete', 'team-3': 'complete' } });
  const stray = {
    ...event,
    rounds: event.rounds.map((r, i) => (i === 0 ? { ...r, statuses: { ...r.statuses, 'team-99': 'complete' } } : r)),
  };
  assert.equal(code(canAdvance(stray, 'reveal')), 'status_unset');
});

test('canAdvance: a round with a result can never be published again, nor its judging reopened', () => {
  const event = withPublished(at(2, 'review', { statuses: ALL_SET }), 'round-prayer');
  assert.equal(code(canAdvance(event, 'reveal')), 'already_published');
  assert.equal(code(canAdvance(event, 'performances')), 'already_published');
});

test('canAdvance: never mutates the event', () => {
  const event = at(0, 'review', { statuses: ALL_SET });
  for (const to of ROUND_PHASES) canAdvance(event, to);
  assert.ok(Object.isFrozen(event.rounds[0].statuses));
});

// ---------------------------------------------------------------------------------------------
// canSkip

test('canSkip: the current round may be skipped from Briefing, Preparation, Performances and Review only', () => {
  for (const phase of ROUND_PHASES) {
    let event = at(1, phase, { statuses: ALL_SET });
    if (phase === 'reveal' || phase === 'results') event = withPublished(event, 'round-dance');
    const want = ['briefing', 'preparation', 'performances', 'review'].includes(phase) ? 'ok' : 'already_published';
    assert.equal(code(canSkip(event, 'round-dance')), want, phase);
  }
});

test('canSkip: a future round may be skipped while running, from Welcome or mid-round; a past one never', () => {
  assert.equal(code(canSkip(welcome(), 'round-faith')), 'ok');
  assert.equal(code(canSkip(welcome(), 'round-cheer')), 'ok');
  const mid = at(2, 'performances');
  assert.equal(code(canSkip(mid, 'round-skit')), 'ok');
  assert.equal(code(canSkip(mid, 'round-cheer')), 'ok');
  const past = withPublished(mid, 'round-faith');
  assert.equal(code(canSkip(past, 'round-faith')), 'already_published');
  // An earlier round left behind without a result (it was skipped) can't be skipped twice.
  assert.equal(code(canSkip(skipping(mid, 1), 'round-dance')), 'wrong_phase');
});

test('canSkip: refuses in Setup and once Finished, a round already skipped, and an unknown round', () => {
  assert.equal(code(canSkip(deepFreeze(eventWithTeams(3)), 'round-faith')), 'wrong_phase');
  const finished = deepFreeze({ ...at(4, 'results'), phase: 'finished', roundPhase: null });
  assert.equal(code(canSkip(finished, 'round-cheer')), 'wrong_phase');
  assert.equal(code(canSkip(skipping(at(0, 'briefing'), 3), 'round-skit')), 'wrong_phase');
  assert.equal(code(canSkip(at(0, 'briefing'), 'round-nope')), 'not_found');
});

// ---------------------------------------------------------------------------------------------
// nextRoundIndex and nextPhase

test('nextRoundIndex: the next unskipped round after the current one, or -1', () => {
  assert.equal(nextRoundIndex(welcome()), 0);
  assert.equal(nextRoundIndex(skipping(welcome(), 0, 1)), 2);
  assert.equal(nextRoundIndex(at(1, 'results')), 2);
  assert.equal(nextRoundIndex(skipping(at(1, 'results'), 2, 3)), 4);
  assert.equal(nextRoundIndex(at(4, 'results')), -1);
  assert.equal(nextRoundIndex(skipping(at(2, 'results'), 3, 4)), -1);
});

test('nextPhase: walks a whole event from Setup to Finished, one obvious step at a time', () => {
  /** @type {LarpEvent} */
  let event = eventWithTeams(4);
  const seen = [];
  for (let guard = 0; guard < 100; guard++) {
    const next = nextPhase(event);
    if (!next) break;
    seen.push(next.roundPhase ? `${next.roundIndex}:${next.roundPhase}` : `${next.phase}:${next.roundIndex}`);
    event = { ...event, ...next };
  }
  const rounds = [0, 1, 2, 3, 4].flatMap((i) => ROUND_PHASES.map((p) => `${i}:${p}`));
  assert.deepEqual(seen, ['running:-1', ...rounds, 'finished:4']);
  assert.equal(nextPhase(event), null);
});

test('nextPhase: skipped rounds are passed over; after the last playable round comes Finished', () => {
  const fromWelcome = nextPhase(skipping(welcome(), 0));
  assert.deepEqual(fromWelcome, { phase: 'running', roundIndex: 1, roundPhase: 'briefing' });
  const fromResults = nextPhase(skipping(at(1, 'results'), 2, 3));
  assert.deepEqual(fromResults, { phase: 'running', roundIndex: 4, roundPhase: 'briefing' });
  const done = nextPhase(skipping(at(2, 'results'), 3, 4));
  assert.deepEqual(done, { phase: 'finished', roundIndex: 2, roundPhase: null });
  // Every round skipped: Welcome goes straight to Finished, the round index untouched.
  assert.deepEqual(nextPhase(skipping(welcome(), 0, 1, 2, 3, 4)), {
    phase: 'finished',
    roundIndex: -1,
    roundPhase: null,
  });
});

test('nextPhase: Setup starts the Welcome; inside a round it is the next phase, without checking gates', () => {
  assert.deepEqual(nextPhase(blankEvent()), { phase: 'running', roundIndex: -1, roundPhase: null });
  assert.deepEqual(nextPhase(at(3, 'performances')), { phase: 'running', roundIndex: 3, roundPhase: 'review' });
  // Review → Reveal is where the action leads even while statuses are missing; canAdvance says no.
  const review = at(3, 'review');
  assert.deepEqual(nextPhase(review), { phase: 'running', roundIndex: 3, roundPhase: 'reveal' });
  assert.equal(code(canAdvance(review, 'reveal')), 'status_unset');
});

// ---------------------------------------------------------------------------------------------
// Timers

test('timers: the empty timer and an idle countdown have the documented shape', () => {
  assert.deepEqual(emptyTimer(), { kind: null, status: 'idle', durationMs: 0, deadline: null, remainingMs: null });
  assert.deepEqual(idleTimer('preparation', 90 * SEC), {
    kind: 'preparation',
    status: 'idle',
    durationMs: 90 * SEC,
    deadline: null,
    remainingMs: 90 * SEC,
  });
  assert.equal(remaining(emptyTimer(), T0), 0);
  assert.equal(expired(emptyTimer(), T0), false);
  assert.equal(remaining(idleTimer('turn', 45 * SEC), T0 + 999 * SEC), 45 * SEC, 'idle never counts down');
  assert.equal(expired(idleTimer('turn', 0), T0), false, 'not started, so not run out');
});

test('timers: start sets a deadline, pause keeps what was left, resume sets a new deadline', () => {
  const idle = deepFreeze(idleTimer('turn', 60 * SEC));
  const running = startTimer(idle, T0);
  assert.deepEqual(running, {
    kind: 'turn',
    status: 'running',
    durationMs: 60 * SEC,
    deadline: T0 + 60 * SEC,
    remainingMs: null,
  });
  assert.equal(remaining(running, T0 + 15 * SEC), 45 * SEC);

  const paused = pauseTimer(deepFreeze(running), T0 + 20 * SEC);
  assert.deepEqual(paused, {
    kind: 'turn',
    status: 'paused',
    durationMs: 60 * SEC,
    deadline: null,
    remainingMs: 40 * SEC,
  });
  assert.equal(remaining(paused, T0 + 500 * SEC), 40 * SEC, 'a paused timer does not count down');

  const resumed = resumeTimer(deepFreeze(paused), T0 + 100 * SEC);
  assert.deepEqual(resumed, {
    kind: 'turn',
    status: 'running',
    durationMs: 60 * SEC,
    deadline: T0 + 140 * SEC,
    remainingMs: null,
  });
  assert.equal(remaining(resumed, T0 + 130 * SEC), 10 * SEC);
  assert.equal(expired(resumed, T0 + 139_999), false);
  assert.equal(expired(resumed, T0 + 140 * SEC), true);
});

test('timers: a timer in the wrong state comes back unchanged (the reducer reports timer_state)', () => {
  const idle = deepFreeze(idleTimer('turn', 60 * SEC));
  const running = deepFreeze(startTimer(idle, T0));
  const paused = deepFreeze(pauseTimer(running, T0 + SEC));
  const none = deepFreeze(emptyTimer());
  assert.equal(startTimer(running, T0 + 5 * SEC), running, 'start while running');
  assert.equal(startTimer(paused, T0 + 5 * SEC), paused, 'start while paused');
  assert.equal(startTimer(none, T0), none, 'start with no timer');
  assert.equal(pauseTimer(idle, T0), idle, 'pause while idle');
  assert.equal(pauseTimer(paused, T0 + 5 * SEC), paused, 'pause twice');
  assert.equal(pauseTimer(none, T0), none, 'pause with no timer');
  assert.equal(resumeTimer(idle, T0), idle, 'resume while idle');
  assert.equal(resumeTimer(running, T0 + 5 * SEC), running, 'resume while running');
  assert.equal(resumeTimer(none, T0), none, 'resume with no timer');
});

test('timers: remaining never goes negative, and running out only reports it', () => {
  const running = startTimer(idleTimer('preparation', 30 * SEC), T0);
  assert.equal(remaining(running, T0 + 31 * SEC), 0);
  assert.equal(remaining(running, T0 + 3_600 * SEC), 0);
  assert.equal(expired(running, T0 + 31 * SEC), true);
  // expired() is a question, not a transition: the timer still says running with its deadline.
  assert.equal(running.status, 'running');
  assert.equal(running.deadline, T0 + 30 * SEC);
});

test('timers: pausing at or past zero stores 0 left; resuming it stays expired', () => {
  const running = startTimer(idleTimer('turn', 10 * SEC), T0);
  const atZero = pauseTimer(running, T0 + 10 * SEC);
  assert.equal(atZero.remainingMs, 0);
  const late = pauseTimer(running, T0 + 25 * SEC);
  assert.deepEqual(late, { kind: 'turn', status: 'paused', durationMs: 10 * SEC, deadline: null, remainingMs: 0 });
  assert.equal(expired(late, T0 + 26 * SEC), true, 'a started timer paused at zero has run out');
  const resumed = resumeTimer(late, T0 + 40 * SEC);
  assert.equal(resumed.deadline, T0 + 40 * SEC);
  assert.equal(remaining(resumed, T0 + 40 * SEC), 0);
  assert.equal(expired(resumed, T0 + 40 * SEC), true);
});

test('timers: Add 30 Seconds works while running, paused or idle, and grows the duration', () => {
  const idle = deepFreeze(idleTimer('turn', 60 * SEC));
  const idlePlus = addTime(idle, 30 * SEC, T0);
  assert.deepEqual(idlePlus, { ...idle, durationMs: 90 * SEC, remainingMs: 90 * SEC });

  const running = deepFreeze(startTimer(idle, T0));
  const runningPlus = addTime(running, 30 * SEC, T0 + 20 * SEC);
  assert.equal(runningPlus.status, 'running');
  assert.equal(runningPlus.deadline, T0 + 90 * SEC);
  assert.equal(runningPlus.durationMs, 90 * SEC);
  assert.equal(remaining(runningPlus, T0 + 20 * SEC), 70 * SEC);

  const paused = deepFreeze(pauseTimer(running, T0 + 50 * SEC));
  const pausedPlus = addTime(paused, 30 * SEC, T0 + 200 * SEC);
  assert.deepEqual(pausedPlus, {
    kind: 'turn',
    status: 'paused',
    durationMs: 90 * SEC,
    deadline: null,
    remainingMs: 40 * SEC,
  });
  assert.equal(remaining(resumeTimer(pausedPlus, T0 + 300 * SEC), T0 + 300 * SEC), 40 * SEC);
});

test('timers: adding time to an expired timer gives the full amount from now, not from the old deadline', () => {
  const running = startTimer(idleTimer('turn', 10 * SEC), T0);
  const plus = addTime(running, 30 * SEC, T0 + 25 * SEC);
  assert.equal(plus.deadline, T0 + 55 * SEC);
  assert.equal(remaining(plus, T0 + 25 * SEC), 30 * SEC);
  assert.equal(expired(plus, T0 + 25 * SEC), false);
});

test('timers: adding nothing, a negative or fractional amount, or to no timer changes nothing', () => {
  const running = deepFreeze(startTimer(idleTimer('turn', 10 * SEC), T0));
  for (const ms of [0, -30 * SEC, Number.NaN, Infinity, 1.5])
    assert.equal(addTime(running, ms, T0), running, String(ms));
  const none = deepFreeze(emptyTimer());
  assert.equal(addTime(none, 30 * SEC, T0), none);
});

test('timers: a reload (JSON round trip) keeps the same deadline, so nothing restarts', () => {
  const running = startTimer(idleTimer('preparation', 120 * SEC), T0);
  const reloaded = JSON.parse(JSON.stringify(running));
  assert.deepEqual(reloaded, running);
  assert.equal(reloaded.deadline, T0 + 120 * SEC);
  // The laptop restarts 50 s later: the countdown carries on from the saved deadline.
  assert.equal(remaining(reloaded, T0 + 50 * SEC), 70 * SEC);
  // Restarted long after: it ran out meanwhile, and only prompts.
  assert.equal(expired(reloaded, T0 + 600 * SEC), true);

  const paused = pauseTimer(running, T0 + 30 * SEC);
  const reloadedPaused = JSON.parse(JSON.stringify(paused));
  assert.equal(remaining(reloadedPaused, T0 + 9_999 * SEC), 90 * SEC, 'a paused timer reloads still paused');
});

// ---------------------------------------------------------------------------------------------
// Reveal steps

/** The skit (round 3) with awards: team-1 two team awards and a member award; team-3 one; one discarded. */
function skitWithAwards() {
  const base = at(3, 'review', { statuses: ALL_SET });
  return withAwards(base, [
    { recipientId: 'team-1', name: 'Cùng Nhau Tỏa Sáng', points: 75 },
    { recipientType: 'member', recipientId: 'm-1-1', name: 'Narration', points: 25 },
    { recipientId: 'team-3', name: 'Quá Giờ', points: -25 },
    { recipientId: 'team-1', name: 'Sáng Tạo', points: 50 },
    { recipientId: 'team-2', name: 'Gone', points: 10, status: 'discarded' },
    { recipientType: 'member', recipientId: 'm-4-2', name: 'Recognition', points: 0 },
  ]);
}

/** Step kinds and ids, as one string each, for readable comparisons. */
const show = (steps) => steps.map((s) => [s.kind, s.teamId, s.adjustmentId].filter(Boolean).join(':'));

test('revealSteps: per team in queue order, its header, team awards, then individual awards; standings last', () => {
  const event = deepFreeze(skitWithAwards());
  const order = event.rounds[3].order; // rotated by 3: team-4, team-1, team-2, team-3
  assert.deepEqual(order, ['team-4', 'team-1', 'team-2', 'team-3']);
  const steps = revealSteps(event, 'round-skit');
  assert.deepEqual(show(steps), [
    'team:team-4',
    'award:team-4:adj-6',
    'team:team-1',
    'award:team-1:adj-1',
    'award:team-1:adj-4',
    'award:team-1:adj-2',
    'team:team-2',
    'team:team-3',
    'award:team-3:adj-3',
    'standings',
  ]);
  assert.equal(revealMs(steps), 10 * REVEAL_BANNER_MS);
});

test('revealSteps: after publishing it follows the frozen result, whatever the roster does next', () => {
  const published = withPublished(skitWithAwards(), 'round-skit');
  // Mai changes team after publication, and a new draft appears: the reveal doesn't move.
  const later = deepFreeze({
    ...published,
    roster: published.roster.map((m) => (m.id === 'm-1-1' ? { ...m, teamId: 'team-2' } : m)),
    adjustments: [...published.adjustments, makeAdjustment({ id: 'adj-late', roundId: 'round-skit' })],
  });
  const steps = show(revealSteps(later, 'round-skit'));
  assert.deepEqual(steps, show(revealSteps(deepFreeze(skitWithAwards()), 'round-skit')));
  assert.ok(!steps.some((s) => s.includes('adj-late')));
});

test('revealSteps: every award appears, even one whose recipient is outside the queue', () => {
  const event = withAwards(at(0, 'review', { statuses: ALL_SET }), [
    { recipientType: 'member', recipientId: 'm-gone', name: 'Lost', points: 5 },
    { recipientId: 'team-9', name: 'Stray', points: 5 },
  ]);
  const steps = revealSteps(deepFreeze(event), 'round-faith');
  const ids = steps.map((s) => s.adjustmentId).filter(Boolean);
  assert.deepEqual(ids.sort(), ['adj-1', 'adj-2']);
  assert.equal(steps.at(-1)?.kind, 'standings');
});

test('revealSteps: a long queue keeps every banner (100 teams, 300 awards)', () => {
  const big = atRound(eventWithTeams(100, { membersPerTeam: 1 }), 0, 'review');
  const list = big.teams.flatMap((t, i) => [
    { recipientId: t.id, name: 'A', points: 1 },
    { recipientId: t.id, name: 'B', points: -1 },
    { recipientType: /** @type {const} */ ('member'), recipientId: `m-${i + 1}-1`, name: 'C', points: 2 },
  ]);
  const steps = revealSteps(deepFreeze(withAwards(big, list)), 'round-faith');
  assert.equal(steps.length, 100 + 300 + 1);
  assert.equal(new Set(steps.map((s) => s.adjustmentId).filter(Boolean)).size, 300);
});

test('revealSteps: a skipped or unknown round has no reveal; an award-free round is headers and standings', () => {
  assert.deepEqual(revealSteps(skipping(at(1, 'results'), 1), 'round-dance'), []);
  assert.deepEqual(revealSteps(at(1, 'review'), 'round-nope'), []);
  assert.deepEqual(show(revealSteps(at(1, 'review'), 'round-dance')), [
    'team:team-2',
    'team:team-3',
    'team:team-4',
    'team:team-1',
    'standings',
  ]);
  assert.equal(revealMs([]), 0);
});
