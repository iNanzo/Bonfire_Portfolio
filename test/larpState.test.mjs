// The campfire game's reducer and projection (src/larp/state.js): a new event, every command's
// rules (who may send it, in which phase, with what payload), a double-click never applying
// anything twice (A05, A13), batch awards (A10), duplicate warnings kept only with a reason (A06),
// Review locking Judge Mode (A11), publishing exactly one immutable result (A12, A13), the reveal
// never touching a score (A14), corrections (A15), ties (A19), passed, skipped and over-the-base
// rounds (A23), negative awards (A27), teams added mid-game (A28), and a display projection that
// never carries drafts, notes, authors or reasons (A07). Every input event is deep-frozen, so a
// reducer that mutated one would throw; one test also checks every command leaves its input
// deep-equal to what it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvent, projection, reduce } from '../src/larp/state.js';
import { flags, memberTotals, previewRound, teamTotals } from '../src/larp/scoring.js';
import { idleTimer, remaining, revealSteps } from '../src/larp/phases.js';
import { COMMAND_TYPES, EMBLEMS, HOST_GM_ID, LIMITS, TEAM_COLORS } from '../src/larp/types.js';
import {
  T0,
  atRound,
  blankEvent,
  deepFreeze,
  eventWithTeams,
  makeClock,
  makeIds,
  rotatedQueue,
} from './lib/larpFixtures.mjs';
import { adjIds, game } from './lib/larpGame.mjs';

/** @typedef {import('../src/larp/types.js').LarpEvent} LarpEvent */

/** @param {string[]} recipientIds @param {string} name @param {number} points @param {object} [extra] */
const teamAward = (recipientIds, name, points, extra = {}) => ({
  recipientType: 'team',
  recipientIds,
  name,
  points,
  ...extra,
});
/** @param {string[]} recipientIds @param {string} name @param {number} points @param {object} [extra] */
const memberAward = (recipientIds, name, points, extra = {}) => ({
  recipientType: 'member',
  recipientIds,
  name,
  points,
  ...extra,
});

/**
 * A game at round `index` in `phase`, built with the fixtures: n teams of three members, two co-GMs.
 * @param {number} index
 * @param {import('../src/larp/types.js').RoundPhase} phase
 * @param {{ teams?: number, clock?: ReturnType<typeof makeClock> }} [opts]
 */
const at = (index, phase, { teams = 4, clock } = {}) =>
  game(atRound(eventWithTeams(teams, { membersPerTeam: 3, gms: 2 }), index, phase), { clock });

/** The last `n` adjustments of the event. */
const lastAdjustments = (/** @type {LarpEvent} */ e, n = 1) => e.adjustments.slice(-n);

test('createEvent: a Setup event with the host GM, the default config and the five rounds', () => {
  const e = createEvent({ id: 'event-1', now: T0 });
  assert.deepEqual(e, blankEvent());
  const f = createEvent({ id: 'event-1', now: T0 });
  assert.notEqual(e.config, f.config);
  assert.notEqual(e.rounds[0].order, f.rounds[0].order);
  assert.notEqual(e.gms, f.gms);
});

test('a malformed command, an unknown type or a bad payload is refused; a missing context throws', () => {
  const g = game(createEvent({ id: 'e', now: T0 }));
  const good = g.cmd.host('addTeam', { name: 'Đội A' });
  for (const bad of [
    null,
    'addTeam',
    {},
    { ...good, id: '' },
    { ...good, id: 7 },
    { ...good, type: undefined },
    { ...good, actorId: undefined },
    { ...good, mode: undefined },
  ]) {
    g.refuse(/** @type {any} */ (bad), 'bad_command');
  }
  g.refuse(/** @type {any} */ ({ ...good, type: 'launchFireworks' }), 'unknown_command');
  g.refuse(
    /** @type {any} */ ({ ...good, type: 'launchFireworks', mode: 'judge', actorId: 'gm-9' }),
    'unknown_command',
  );
  g.refuse({ ...good, payload: 'Đội A' }, 'bad_payload');
  g.refuse({ ...good, payload: ['Đội A'] }, 'bad_payload');
  assert.throws(() => reduce(g.event, good, /** @type {any} */ (undefined)), TypeError);
  assert.throws(() => reduce(g.event, good, /** @type {any} */ ({ now: T0 })), TypeError);
  assert.throws(() => reduce(g.event, good, /** @type {any} */ ({ now: NaN, newId: makeIds() })), TypeError);
  assert.equal(g.event.revision, 0);
  // A command with no payload at all is fine when the command needs none.
  const s = game(eventWithTeams(1));
  s.ok({ ...s.cmd.host('startEvent'), payload: undefined });
});

test('Setup: teams, roster, co-GMs, rounds and settings; each accepted command recorded once', () => {
  const g = game(createEvent({ id: 'e', now: T0 }), { ids: makeIds('s') });
  const added = g.host('addTeam', { name: '  Đội   Phaolô ', translation: 'Team Paul', patron: 'Thánh Phaolô' });
  assert.deepEqual(g.event.teams[0], {
    id: 's-team-1',
    name: 'Đội Phaolô',
    translation: 'Team Paul',
    color: TEAM_COLORS[0],
    emblem: EMBLEMS[0],
    patron: 'Thánh Phaolô',
    admittedRound: 0,
  });
  assert.deepEqual(added.events, [{ type: 'teamAdded', teamId: 's-team-1' }]);
  g.host('addTeam', { name: 'Đội Phêrô', color: '#123456', emblem: 'dove' });
  const [paul, peter] = g.event.teams.map((t) => t.id);
  assert.deepEqual([g.event.teams[1].color, g.event.teams[1].emblem], ['#123456', 'dove']);
  g.host('editTeam', { teamId: peter, translation: 'Team Peter' });
  assert.equal(g.event.teams[1].translation, 'Team Peter');
  assert.equal(g.event.teams[1].name, 'Đội Phêrô');
  g.refuse(g.cmd.host('editTeam', { teamId: peter, name: '   ' }), 'invalid_name');
  g.refuse(g.cmd.host('editTeam', { teamId: 'team-x', name: 'X' }), 'not_found');
  g.refuse(g.cmd.host('addTeam', { name: 'X', color: 'red' }), 'bad_payload');
  g.refuse(g.cmd.host('addTeam', { name: 'x'.repeat(LIMITS.teamName + 1) }), 'invalid_name');

  g.host('addMembers', { teamId: paul, names: ['Mai', '', '  An  ', 'Bình'] });
  assert.deepEqual(
    g.event.roster.map((m) => [m.name, m.teamId, m.captain]),
    [
      ['Mai', paul, false],
      ['An', paul, false],
      ['Bình', paul, false],
    ],
  );
  g.host('addMember', { name: 'Chi', teamId: peter, captain: true });
  g.refuse(g.cmd.host('addMember', { name: 'Dũng', teamId: 'team-x' }), 'not_found');
  g.refuse(g.cmd.host('addMembers', { teamId: paul, names: ['  ', ''] }), 'invalid_name');
  g.refuse(g.cmd.host('addMembers', { teamId: paul, names: 'Mai\nAn' }), 'bad_payload');
  g.refuse(g.cmd.host('addMembers', { teamId: paul, names: ['Mai', 7] }), 'bad_payload');
  const [mai, an] = g.event.roster.map((m) => m.id);
  g.host('editMember', { memberId: mai, teamId: peter, captain: true });
  assert.deepEqual(g.event.roster[0], { id: mai, name: 'Mai', teamId: peter, captain: true });
  g.refuse(g.cmd.host('editMember', { memberId: 'nobody', name: 'X' }), 'not_found');
  g.refuse(g.cmd.host('editMember', { memberId: mai, teamId: 'team-x' }), 'not_found');
  g.host('removeMember', { memberId: an });
  assert.ok(!g.event.roster.some((m) => m.id === an));
  g.refuse(g.cmd.host('removeMember', { memberId: an }), 'not_found');

  g.host('addGm', { name: 'Anh B.' });
  const gmId = g.event.gms[1].id;
  g.host('editGm', { gmId, name: 'Anh  Bảo' });
  assert.deepEqual(g.event.gms[1], { id: gmId, name: 'Anh Bảo', host: false });
  g.refuse(g.cmd.host('addGm', { name: '' }), 'invalid_name');
  g.refuse(g.cmd.host('removeGm', { gmId: HOST_GM_ID }), 'host_required');
  g.refuse(g.cmd.host('editGm', { gmId: 'gm-x', name: 'X' }), 'not_found');
  g.host('removeGm', { gmId });
  assert.deepEqual(
    g.event.gms.map((x) => x.id),
    [HOST_GM_ID],
  );

  g.host('editRound', { roundId: 'round-skit', base: 600, prompt: ' Diễn  dụ ngôn ', turnMs: 120_000 });
  const skit = g.event.rounds[3];
  assert.deepEqual([skit.base, skit.prompt, skit.turnMs], [600, 'Diễn dụ ngôn', 120_000]);
  g.refuse(g.cmd.host('editRound', { roundId: 'round-skit', turnMs: LIMITS.maxDurationMs + 1 }), 'invalid_duration');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-skit', prepMs: -1 }), 'invalid_duration');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-skit', base: 1.5 }), 'invalid_points');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-skit', base: -100 }), 'invalid_points');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-skit', prompt: '  ' }), 'invalid_text');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-skit', prompt: 'x'.repeat(LIMITS.prompt + 1) }), 'invalid_text');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-x', base: 1 }), 'not_found');

  g.host('setConfig', { displayMode: 'vi-only', hostPin: '1234', title: ' Lửa Trại  2026 ', sound: true });
  assert.deepEqual(
    [g.event.config.displayMode, g.event.config.hostPin, g.event.config.title, g.event.config.sound],
    ['vi-only', '1234', 'Lửa Trại 2026', true],
  );
  g.host('setConfig', { hostPin: null });
  assert.equal(g.event.config.hostPin, null);
  g.refuse(g.cmd.host('setConfig', { scenery: 'forge' }), 'invalid_config');
  g.refuse(g.cmd.host('setConfig', { colour: 'red' }), 'invalid_config');
  g.refuse(g.cmd.host('setConfig', { sound: 'yes' }), 'invalid_config');
  g.refuse(g.cmd.host('setConfig', { title: '' }), 'invalid_config');
  g.refuse(g.cmd.host('setConfig', { targetMs: -1 }), 'invalid_duration');

  g.host('removeTeam', { teamId: peter });
  assert.deepEqual(
    g.event.teams.map((t) => t.id),
    [paul],
  );
  assert.ok(
    g.event.roster.every((m) => m.teamId === paul),
    "a removed team's members go with it",
  );
  g.refuse(g.cmd.host('removeTeam', { teamId: peter }), 'not_found');

  assert.equal(g.event.revision, g.event.history.length);
  assert.equal(g.event.seenCommandIds.length, g.event.history.length);
  assert.deepEqual(
    g.event.history.slice(0, 3).map((h) => [h.revision, h.type, h.actorId, h.mode, h.ids]),
    [
      [1, 'addTeam', HOST_GM_ID, 'host', [paul]],
      [2, 'addTeam', HOST_GM_ID, 'host', [peter]],
      [3, 'editTeam', HOST_GM_ID, 'host', [peter]],
    ],
  );
  assert.equal(g.event.updatedAt, T0);
});

test('startEvent opens the Welcome; the round flow refuses every step out of order', () => {
  const empty = game(createEvent({ id: 'e', now: T0 }));
  empty.refuse(empty.cmd.host('startEvent'), 'no_teams');

  const clock = makeClock();
  const g = game(eventWithTeams(3, { membersPerTeam: 1 }), { clock });
  g.refuse(g.cmd.host('nextRound'), 'wrong_phase');
  clock.advance(1000);
  const started = g.host('startEvent');
  assert.deepEqual(
    [g.event.phase, g.event.roundIndex, g.event.roundPhase, g.event.startedAt],
    ['running', -1, null, T0 + 1000],
  );
  assert.ok(started.events.some((e) => e.type === 'eventStarted'));
  g.refuse(g.cmd.host('startEvent'), 'wrong_phase');
  g.refuse(g.cmd.host('addTeam', { name: 'Late' }), 'wrong_phase');
  g.refuse(g.cmd.host('removeTeam', { teamId: 'team-1' }), 'wrong_phase');
  for (const type of /** @type {const} */ (['startPreparation', 'endPreparation', 'nextTeam', 'beginReview'])) {
    g.refuse(g.cmd.host(type), 'wrong_phase');
  }
  g.refuse(g.cmd.host('publishRound', { roundId: 'round-faith' }), 'wrong_phase');

  const briefing = g.host('nextRound');
  assert.deepEqual([g.event.roundIndex, g.event.roundPhase, g.event.currentTurn], [0, 'briefing', -1]);
  assert.deepEqual(g.round().order, rotatedQueue(g.event.teams, 0));
  assert.deepEqual(briefing.events[0], { type: 'roundStarted', roundId: 'round-faith' });
  g.refuse(g.cmd.host('nextRound'), 'wrong_phase');
  g.refuse(g.cmd.host('endPreparation'), 'wrong_phase');
  g.refuse(g.cmd.host('reopenJudging'), 'wrong_phase');

  g.host('startPreparation');
  assert.equal(g.event.roundPhase, 'preparation');
  g.refuse(g.cmd.host('reopenJudging'), 'wrong_phase');
  g.refuse(g.cmd.host('nextTeam'), 'wrong_phase');
  g.host('endPreparation');
  assert.deepEqual([g.event.roundPhase, g.event.currentTurn, g.event.timer.kind], ['performances', -1, null]);
  for (let i = 0; i < 3; i++) {
    const turn = g.host('nextTeam');
    assert.equal(g.event.currentTurn, i);
    assert.deepEqual(turn.events[0], { type: 'turnStarted', roundId: 'round-faith', teamId: g.round().order[i] });
  }
  g.refuse(g.cmd.host('nextTeam'), 'no_next_team');
  g.refuse(g.cmd.host('publishRound', { roundId: 'round-faith' }), 'wrong_phase');
  g.host('beginReview');
  g.refuse(g.cmd.host('beginReview'), 'wrong_phase');
  g.refuse(g.cmd.host('publishRound', { roundId: 'round-faith' }), 'status_unset');
  g.refuse(g.cmd.host('publishRound', { roundId: 'round-dance' }), 'wrong_phase');
  g.refuse(g.cmd.host('publishRound', { roundId: 'round-x' }), 'not_found');
  g.refuse(g.cmd.host('publishRound', {}), 'bad_payload');
});

test('timers: the prep and turn countdowns run on the laptop clock, pause, resume and take added time', () => {
  const clock = makeClock();
  const g = game(eventWithTeams(2), { clock });
  g.host('startEvent');
  g.host('nextRound');
  g.refuse(g.cmd.host('startTimer'), 'timer_state');
  g.refuse(g.cmd.host('addTime', { ms: 1000 }), 'timer_state');
  g.host('startPreparation');
  assert.deepEqual(g.event.timer, {
    kind: 'preparation',
    status: 'running',
    durationMs: 90_000,
    deadline: T0 + 90_000,
    remainingMs: null,
  });
  g.refuse(g.cmd.host('startTimer'), 'timer_state');
  g.refuse(g.cmd.host('resumeTimer'), 'timer_state');
  clock.advance(30_000);
  g.host('pauseTimer');
  assert.deepEqual([g.event.timer.status, g.event.timer.remainingMs, g.event.timer.deadline], ['paused', 60_000, null]);
  g.refuse(g.cmd.host('pauseTimer'), 'timer_state');
  clock.advance(100_000);
  assert.equal(remaining(g.event.timer, clock.now()), 60_000, 'a paused countdown holds');
  for (const ms of [0, -5, 1.5, '30', LIMITS.maxDurationMs + 1]) {
    g.refuse(g.cmd.host('addTime', { ms }), 'invalid_duration');
  }
  g.host('addTime', { ms: 30_000 });
  assert.deepEqual([g.event.timer.remainingMs, g.event.timer.durationMs], [90_000, 120_000]);
  g.host('resumeTimer');
  assert.equal(g.event.timer.deadline, clock.now() + 90_000);
  clock.advance(200_000);
  assert.equal(remaining(g.event.timer, clock.now()), 0);
  assert.equal(g.event.roundPhase, 'preparation', 'a countdown at zero never moves the phase');
  g.host('endPreparation');
  assert.equal(g.event.timer.kind, null);
  g.refuse(g.cmd.host('pauseTimer'), 'timer_state');
  g.host('nextTeam');
  assert.deepEqual(
    [g.event.timer.kind, g.event.timer.status, g.event.timer.deadline],
    ['turn', 'running', clock.now() + 45_000],
  );
  g.host('beginReview');
  assert.equal(g.event.timer.kind, null, 'Review has no countdown');
});

test('A03: Judge Mode never reaches phases, timers, setup, statuses, publishing, corrections or others’ awards', () => {
  const g = at(0, 'performances');
  for (const [type, payload] of /** @type {Array<[import('../src/larp/types.js').CommandType, any]>} */ ([
    ['nextTeam', {}],
    ['beginReview', {}],
    ['publishRound', { roundId: 'round-faith' }],
    ['startTimer', {}],
    ['addTime', { ms: 1000 }],
    ['addTeam', { name: 'X' }],
    ['editTeam', { teamId: 'team-1', name: 'X' }],
    ['addMember', { name: 'X', teamId: 'team-1' }],
    ['setStatus', { teamId: 'team-1', status: 'complete' }],
    ['addCorrection', { recipientType: 'team', recipientId: 'team-1', points: 5, reason: 'x' }],
    ['setConfig', { sound: true }],
    ['skipRound', { roundId: 'round-faith' }],
    ['endEvent', {}],
    ['addTeamMidGame', { name: 'X' }],
    ['revealSkip', {}],
  ])) {
    g.refuse(g.cmd.judge('gm-1', type, payload), 'forbidden');
  }
  g.host('addAward', teamAward(['team-1'], 'Đồng Đội', 50));
  g.judge('gm-2', 'addAward', teamAward(['team-2'], 'Chuẩn Bị', 25));
  const [hostAward, gm2Award] = g.event.adjustments.map((a) => a.id);
  g.refuse(g.cmd.judge('gm-1', 'editAward', { adjustmentId: hostAward, points: 99 }), 'not_own_award');
  g.refuse(g.cmd.judge('gm-1', 'removeAward', { adjustmentId: gm2Award }), 'not_own_award');
  g.refuse(g.cmd.judge('gm-1', 'editAward', { adjustmentId: 'adj-x', points: 1 }), 'not_own_award');
  g.refuse(g.cmd.judge('gm-1', 'addAward', teamAward(['team-1'], 'Giả Danh', 5, { authorId: 'gm-2' })), 'forbidden');
  g.refuse(g.cmd.judge('gm-9', 'addAward', teamAward(['team-1'], 'Lạ', 5)), 'forbidden');
  g.refuse({ ...g.cmd.judge('gm-1', 'nextTeam'), mode: 'host' }, 'forbidden');
  g.refuse({ ...g.cmd.judge('gm-1', 'addAward', teamAward(['team-1'], 'X', 5)), mode: 'spectator' }, 'forbidden');

  g.judge('gm-2', 'editAward', { adjustmentId: gm2Award, points: 30, note: 'rõ ràng' });
  assert.deepEqual(
    [g.event.adjustments[1].points, g.event.adjustments[1].note, g.event.adjustments[1].updatedAt],
    [30, 'rõ ràng', T0],
  );
  g.judge('gm-2', 'removeAward', { adjustmentId: gm2Award });
  assert.equal(g.event.adjustments[1].status, 'discarded', 'a removed award is kept, marked discarded');
  g.refuse(g.cmd.judge('gm-2', 'editAward', { adjustmentId: gm2Award, points: 1 }), 'not_draft');
  g.refuse(g.cmd.host('removeAward', { adjustmentId: gm2Award }), 'not_draft');
  g.refuse(g.cmd.host('editAward', { adjustmentId: 'adj-x', points: 1 }), 'not_found');
});

test('A04, A05: the host and a co-GM award one team and both keep their authors; a double-click adds once', () => {
  const g = at(0, 'performances');
  const add = g.cmd.host(
    'addAward',
    teamAward(['team-1'], 'Đồng Đội', 50, { translation: 'Teamwork', authorId: 'gm-2' }),
  );
  const first = g.ok(add);
  assert.deepEqual(first.events, [{ type: 'awardAdded', roundId: 'round-faith', ids: [g.event.adjustments[0].id] }]);
  const once = g.event;
  const again = reduce(once, add, g.ctx());
  assert.deepEqual(again, { event: once, events: [], error: null, duplicate: true });
  assert.equal(again.event, once, 'a repeated command id returns the very same event');

  g.judge('gm-1', 'addAward', teamAward(['team-1'], 'Chuẩn Bị Kỹ', 25, { note: 'nhóm nhỏ' }));
  const repeat = g.cmd.judge('gm-1', 'addAward', teamAward(['team-1'], 'Chuẩn Bị Kỹ', 25), {
    id: g.event.seenCommandIds.at(-1),
  });
  assert.equal(g.apply(repeat).duplicate, true);

  assert.deepEqual(
    g.event.adjustments.map((a) => [a.recipientId, a.name, a.points, a.authorId, a.status]),
    [
      ['team-1', 'Đồng Đội', 50, 'gm-2', 'draft'],
      ['team-1', 'Chuẩn Bị Kỹ', 25, 'gm-1', 'draft'],
    ],
  );
  assert.equal(g.event.revision, 2);
  assert.equal(previewRound(g.event, 'round-faith').teamRoundScores['team-1'], 75);

  // A refused command's id isn't remembered: fixing the form and sending again works.
  const blank = g.cmd.host('addAward', teamAward(['team-2'], '  ', 10));
  g.refuse(blank, 'invalid_name');
  g.ok({ ...blank, payload: teamAward(['team-2'], 'Vui Vẻ', 10) });
  assert.equal(g.event.adjustments.length, 3);
});

test('A06: the same award name (any case or accents) for the same recipient warns until a reason is given', () => {
  const g = at(0, 'performances');
  g.host('addAward', teamAward(['team-1'], 'Sáng Tạo', 50));
  const original = g.event.adjustments[0].id;
  const second = g.refuse(
    g.cmd.judge('gm-1', 'addAward', teamAward(['team-1'], '  sang   TAO ', 25)),
    'duplicate_award',
  );
  assert.deepEqual(second.error?.ids, [original]);
  g.refuse(
    g.cmd.judge('gm-1', 'addAward', teamAward(['team-1'], 'sang tao', 25, { duplicateReason: ' ' })),
    'duplicate_award',
  );
  g.judge('gm-1', 'addAward', teamAward(['team-2'], 'Sáng Tạo', 25));
  g.judge('gm-1', 'addAward', teamAward(['team-1'], 'sang tao', 25, { duplicateReason: 'Một ý tưởng khác' }));
  const kept = g.event.adjustments.at(-1);
  assert.deepEqual([kept.duplicateReason, kept.authorId], ['Một ý tưởng khác', 'gm-1']);
  assert.equal(g.event.adjustments[0].duplicateReason, null);
  assert.deepEqual(flags(g.event, 'round-faith').duplicates, [[original, kept.id]]);

  // A batch with one duplicate recipient is refused whole, naming the existing award.
  const batch = g.refuse(g.cmd.host('addAward', teamAward(['team-3', 'team-2'], 'SÁNG TẠO', 10)), 'duplicate_award');
  assert.deepEqual(batch.error?.ids, [g.event.adjustments[1].id]);

  // Renaming an award into a duplicate warns too; changing only its points never does.
  g.host('addAward', teamAward(['team-1'], 'Chuẩn Bị', 20));
  const prep = g.event.adjustments.at(-1).id;
  g.refuse(g.cmd.host('editAward', { adjustmentId: prep, name: 'Sáng tạo' }), 'duplicate_award');
  g.host('editAward', { adjustmentId: original, points: 60 });
  g.host('editAward', { adjustmentId: prep, name: 'Sáng tạo', duplicateReason: 'Lần thứ ba' });
  assert.deepEqual(
    [g.event.adjustments.at(-1).name, g.event.adjustments.at(-1).duplicateReason],
    ['Sáng tạo', 'Lần thứ ba'],
  );
  g.host('editAward', { adjustmentId: prep, name: 'Chuẩn Bị' });
  assert.equal(g.event.adjustments.at(-1).duplicateReason, null, 'no longer a duplicate, so no reason kept');
  assert.equal(
    g.event.adjustments.filter((a) => a.status === 'draft').length,
    4,
    'both duplicates remain, each with its author',
  );
});

test('A07: the display projection never carries drafts, notes, authors, reasons, the PIN or history', () => {
  const clock = makeClock();
  const base = eventWithTeams(4, { membersPerTeam: 2, gms: 2 });
  const g = game(atRound({ ...base, config: { ...base.config, hostPin: '4321' } }, 0, 'performances'), { clock });
  g.host('nextTeam');
  g.judge('gm-1', 'addAward', teamAward(['team-1'], 'Bí Mật Nháp', 40, { note: 'nói nhỏ quá' }));
  g.host('addAward', memberAward(['m-1-1'], 'Bí Mật Nháp', 10, { authorId: 'gm-2', note: 'ghi chú riêng' }));
  g.host('addAward', memberAward(['m-1-1'], 'bi mat nhap', 5, { duplicateReason: 'Lý do kín đáo' }));
  clock.advance(5000);
  const p = projection(g.event, clock.now());
  const text = JSON.stringify(p);
  for (const secret of ['Bí Mật Nháp', 'bi mat nhap', 'nói nhỏ quá', 'ghi chú riêng', 'Lý do kín đáo', '4321']) {
    assert.ok(!text.includes(secret), `the projection leaks ${secret}`);
  }
  for (const secret of ['Anh 1', 'Anh 2', '"gm-1"', '"gm-2"', HOST_GM_ID, 'cmd-', 'Member 1.1', 'hostLang']) {
    assert.ok(!text.includes(secret), `the projection leaks ${secret}`);
  }
  assert.deepEqual(p.results, []);
  assert.deepEqual(p.members, []);
  assert.deepEqual(p.leaders, []);
  assert.equal(p.phase, 'running');
  assert.equal(p.roundPhase, 'performances');
  assert.equal(p.round?.en, 'Faith Discovery');
  assert.equal(p.round?.vi, 'Khám Phá Đức Tin');
  assert.equal(p.round?.prompt, g.round().prompt);
  assert.deepEqual([p.currentTeamId, p.nextTeamId], ['team-1', 'team-2']);
  assert.deepEqual(p.queue, ['team-1', 'team-2', 'team-3', 'team-4']);
  assert.equal(p.timer.kind, 'turn');
  assert.equal(p.timerRemainingMs, 40_000);
  assert.deepEqual(
    p.standings.map((s) => [s.id, s.total, s.place]),
    [
      ['team-1', 0, 1],
      ['team-2', 0, 1],
      ['team-3', 0, 1],
      ['team-4', 0, 1],
    ],
  );
  assert.deepEqual(p.revealSteps, []);
  assert.deepEqual(Object.keys(p.config).sort(), ['displayMode', 'reducedMotion', 'scenery', 'sound', 'title']);

  // After publication the awards are public by name and points, still without authors or notes.
  g.publish();
  const after = projection(g.event, clock.now());
  const published = after.results[0];
  assert.deepEqual(
    published.adjustments.map((a) => [a.recipientName, a.name, a.points]),
    [
      ['Đội 1', 'Bí Mật Nháp', 40],
      ['Member 1.1', 'Bí Mật Nháp', 10],
      ['Member 1.1', 'bi mat nhap', 5],
    ],
  );
  for (const a of published.adjustments) {
    for (const key of ['authorId', 'note', 'duplicateReason']) assert.ok(!(key in a), `published ${key} leaks`);
  }
  assert.ok(!('commandId' in published));
  const afterText = JSON.stringify(after);
  for (const secret of ['nói nhỏ quá', 'ghi chú riêng', 'Lý do kín đáo', '"gm-1"', '"gm-2"', HOST_GM_ID, '4321']) {
    assert.ok(!afterText.includes(secret), `the published projection leaks ${secret}`);
  }
  assert.deepEqual(after.revealSteps, revealSteps(g.event, 'round-faith'));
  assert.deepEqual(after.reveal, g.event.reveal);

  // Members are listed only when the host turns showMembers on.
  g.host('setConfig', { showMembers: true });
  assert.deepEqual(projection(g.event, clock.now()).members[0], { id: 'm-1-1', name: 'Member 1.1', teamId: 'team-1' });
});

test('the projection in Setup, Welcome, Briefing and Finished', () => {
  const g = game(eventWithTeams(3));
  let p = projection(g.event, T0);
  assert.deepEqual(
    [p.phase, p.round, p.queue, p.currentTeamId, p.nextTeamId, p.roundCount, p.timerRemainingMs],
    ['setup', null, [], null, null, 5, 0],
  );
  assert.equal(p.teams.length, 3);
  assert.deepEqual(Object.keys(p.teams[0]).sort(), [
    'admittedRound',
    'color',
    'emblem',
    'id',
    'isNew',
    'name',
    'patron',
    'translation',
  ]);
  g.host('startEvent');
  p = projection(g.event, T0);
  assert.deepEqual([p.phase, p.roundIndex, p.roundPhase, p.round], ['running', -1, null, null]);
  g.host('nextRound');
  p = projection(g.event, T0);
  assert.deepEqual([p.round?.id, p.nextTeamId, p.currentTeamId], ['round-faith', 'team-1', null]);
  assert.equal(p.round?.calm, false);
  g.host('endEvent');
  p = projection(g.event, T0);
  assert.deepEqual([p.phase, p.round, p.queue], ['finished', null, []]);
});

test('A08, A09: the worked example previews and publishes 600; Mai’s +25 is hers and leaves the team at 600', () => {
  const g = at(3, 'performances');
  g.host('editMember', { memberId: 'm-1-1', name: 'Mai' });
  g.host('addAward', teamAward(['team-1'], 'Cùng Nhau Tỏa Sáng', 75, { translation: 'Shine Together' }));
  g.judge('gm-1', 'addAward', teamAward(['team-1'], 'Sáng Tạo', 50, { translation: 'Creativity' }));
  g.judge('gm-2', 'addAward', teamAward(['team-1'], 'Quá Giờ', -25, { translation: 'Over Time' }));
  g.judge('gm-2', 'addAward', memberAward(['m-1-1'], 'Dẫn Truyện Rõ Ràng', 25, { translation: 'Clear Narration' }));
  g.host('beginReview');
  for (const teamId of g.round().order) g.host('setStatus', { teamId, status: 'complete' });
  const preview = previewRound(g.event, 'round-skit');
  assert.equal(preview.teamRoundScores['team-1'], 600);
  assert.equal(preview.teamRoundScores['team-2'], 500);
  assert.deepEqual(preview.memberPoints, { 'm-1-1': 25 });

  const published = g.host('publishRound', { roundId: 'round-skit' });
  const [result] = g.event.results;
  assert.equal(result.teamRoundScores['team-1'], 600);
  assert.deepEqual(result.completion['team-1'], { status: 'complete', points: 500 });
  assert.equal(teamTotals(g.event)['team-1'], 600);
  assert.equal(memberTotals(g.event)['m-1-1'], 25);
  const mai = result.adjustments.find((a) => a.recipientType === 'member');
  assert.deepEqual([mai?.recipientName, mai?.teamId, mai?.points], ['Mai', 'team-1', 25]);
  assert.deepEqual(
    result.adjustments.map((a) => a.authorId),
    [HOST_GM_ID, 'gm-1', 'gm-2', 'gm-2'],
  );
  assert.ok(g.event.adjustments.every((a) => a.status === 'published'));
  assert.deepEqual([result.roundId, result.roundIndex, result.base, result.publishedAt], ['round-skit', 3, 500, T0]);
  assert.equal(g.event.roundPhase, 'reveal');
  assert.deepEqual(g.event.reveal, {
    roundId: 'round-skit',
    step: 0,
    total: 4 + 4 + 1,
    paused: false,
    stepStartedAt: T0,
  });
  assert.deepEqual(
    published.events.map((e) => e.type),
    ['roundPublished', 'phaseChanged', 'revealStep'],
  );
});

test('A10: one award to three members is three records sharing a batch id', () => {
  const g = at(1, 'performances');
  const added = g.host(
    'addAward',
    memberAward(['m-2-1', 'm-2-2', 'm-3-1'], 'Mời Bạn Mới', 25, { translation: 'Invited Someone In' }),
  );
  const batch = lastAdjustments(g.event, 3);
  assert.equal(new Set(batch.map((a) => a.batchId)).size, 1);
  assert.equal(new Set(batch.map((a) => a.id)).size, 3);
  assert.deepEqual(
    batch.map((a) => [a.recipientId, a.points, a.name, a.translation]),
    [
      ['m-2-1', 25, 'Mời Bạn Mới', 'Invited Someone In'],
      ['m-2-2', 25, 'Mời Bạn Mới', 'Invited Someone In'],
      ['m-3-1', 25, 'Mời Bạn Mới', 'Invited Someone In'],
    ],
  );
  assert.deepEqual(
    added.events[0].ids,
    batch.map((a) => a.id),
  );
  assert.deepEqual(
    g.event.history.at(-1)?.ids,
    batch.map((a) => a.id),
  );
  assert.deepEqual(previewRound(g.event, 'round-dance').memberPoints, { 'm-2-1': 25, 'm-2-2': 25, 'm-3-1': 25 });

  g.host('removeAward', { adjustmentId: batch[1].id });
  assert.deepEqual(previewRound(g.event, 'round-dance').memberPoints, { 'm-2-1': 25, 'm-3-1': 25 });

  g.host('addAward', teamAward(['team-1', 'team-2'], 'Giúp Đội Bạn', 50));
  assert.equal(new Set(lastAdjustments(g.event, 2).map((a) => a.batchId)).size, 1);
  assert.notEqual(lastAdjustments(g.event, 2)[0].batchId, batch[0].batchId);

  g.refuse(g.cmd.host('addAward', memberAward([], 'X', 5)), 'no_recipients');
  g.refuse(g.cmd.host('addAward', memberAward(['m-1-1', 'm-1-1'], 'X', 5)), 'no_recipients');
  g.refuse(g.cmd.host('addAward', teamAward(['m-1-1'], 'X', 5)), 'no_recipients');
  g.refuse(g.cmd.host('addAward', memberAward(['m-9-9'], 'X', 5)), 'not_found');
  g.refuse(g.cmd.host('addAward', memberAward(['m-1-1'], 'X', 2.5)), 'invalid_points');
  g.refuse(g.cmd.host('addAward', memberAward(['m-1-1'], 'X', 5, { authorId: 'gm-9' })), 'not_found');
  g.refuse(g.cmd.host('addAward', memberAward(['m-1-1'], 'x'.repeat(LIMITS.awardName + 1), 5)), 'invalid_name');
});

test('A11: Review locks Judge Mode (entries stay), the host still edits, Reopen Judging unlocks it', () => {
  const g = at(1, 'performances');
  g.judge('gm-1', 'addAward', teamAward(['team-2'], 'Đồng Lòng', 30));
  const own = g.event.adjustments[0].id;
  const review = g.host('beginReview');
  assert.ok(review.events.some((e) => e.type === 'reviewBegan'));
  const locked = g.refuse(g.cmd.judge('gm-1', 'addAward', teamAward(['team-2'], 'Thêm', 5)), 'judging_closed');
  assert.match(locked.error?.message ?? '', /Review/);
  g.refuse(g.cmd.judge('gm-1', 'editAward', { adjustmentId: own, points: 35 }), 'judging_closed');
  g.refuse(g.cmd.judge('gm-1', 'removeAward', { adjustmentId: own }), 'judging_closed');
  assert.deepEqual([g.event.adjustments[0].status, g.event.adjustments[0].points], ['draft', 30]);

  g.host('editAward', { adjustmentId: own, points: 35 });
  g.host('addAward', teamAward(['team-3'], 'Thẻ Trao Tay', 20, { authorId: 'gm-2' }));
  assert.equal(g.event.adjustments[1].authorId, 'gm-2');
  g.host('reopenJudging');
  assert.equal(g.event.roundPhase, 'performances');
  g.judge('gm-1', 'editAward', { adjustmentId: own, points: 40 });
  assert.equal(g.event.adjustments[0].points, 40);

  const briefing = at(0, 'briefing');
  briefing.refuse(briefing.cmd.judge('gm-1', 'addAward', teamAward(['team-1'], 'Sớm', 5)), 'judging_closed');
  briefing.refuse(briefing.cmd.host('addAward', teamAward(['team-1'], 'Sớm', 5)), 'wrong_phase');
});

test('A12: publishing waits for every queued team’s status; null unsets one again', () => {
  const g = at(0, 'review');
  for (const teamId of ['team-1', 'team-2', 'team-4']) g.host('setStatus', { teamId, status: 'complete' });
  const blocked = g.refuse(g.cmd.host('publishRound', { roundId: 'round-faith' }), 'status_unset');
  assert.deepEqual(blocked.error?.ids, ['team-3']);
  g.refuse(g.cmd.host('setStatus', { teamId: 'team-3', status: 'done' }), 'invalid_status');
  g.refuse(g.cmd.host('setStatus', { teamId: 'team-9', status: 'complete' }), 'not_found');
  g.refuse(g.cmd.host('setStatus', { status: 'complete' }), 'bad_payload');
  g.host('setStatus', { teamId: 'team-3', status: 'absent' });
  g.host('setStatus', { teamId: 'team-1', status: null });
  assert.ok(!Object.hasOwn(g.round().statuses, 'team-1'));
  g.refuse(g.cmd.host('publishRound', { roundId: 'round-faith' }), 'status_unset');
  g.host('setStatus', { teamId: 'team-1', status: 'passed' });
  g.host('publishRound', { roundId: 'round-faith' });
  assert.deepEqual(g.event.results[0].teamRoundScores, { 'team-1': 0, 'team-2': 100, 'team-3': 0, 'team-4': 100 });

  const prep = at(0, 'preparation');
  prep.refuse(prep.cmd.host('setStatus', { teamId: 'team-1', status: 'complete' }), 'wrong_phase');
});

test('A13: a double-clicked Publish makes one immutable result; later changes never rewrite it', () => {
  const g = at(0, 'review');
  g.host('addAward', teamAward(['team-1'], 'Đồng Đội', 50));
  g.host('addAward', memberAward(['m-1-1'], 'Dẫn Dắt', 25));
  for (const teamId of g.round().order) g.host('setStatus', { teamId, status: 'complete' });
  const publish = g.cmd.host('publishRound', { roundId: 'round-faith' });
  g.ok(publish);
  const once = g.event;
  assert.equal(reduce(once, publish, g.ctx()).duplicate, true);
  assert.equal(reduce(once, publish, g.ctx()).event, once);
  g.refuse(g.cmd.host('publishRound', { roundId: 'round-faith' }), 'already_published');
  assert.equal(g.event.results.length, 1);
  assert.equal(g.event.results[0].commandId, publish.id);
  const frozen = structuredClone(g.event.results[0]);
  const totals = teamTotals(g.event);

  g.host('revealSkip');
  g.refuse(g.cmd.host('reopenJudging'), 'wrong_phase');
  g.host('editMember', { memberId: 'm-1-1', name: 'Đổi Tên', teamId: 'team-2' });
  g.host('editTeam', { teamId: 'team-1', name: 'Đội Mới Tên' });
  g.host('nextRound');
  g.host('startPreparation');
  g.host('addAward', teamAward(['team-1'], 'Đồng Đội', 70));
  const publishedAdj = g.event.adjustments[0].id;
  g.refuse(g.cmd.host('editAward', { adjustmentId: publishedAdj, points: 500 }), 'not_draft');
  g.refuse(g.cmd.host('removeAward', { adjustmentId: publishedAdj }), 'not_draft');
  g.refuse(g.cmd.host('skipRound', { roundId: 'round-faith' }), 'already_published');
  assert.deepEqual(g.event.results[0], frozen);
  assert.deepEqual(teamTotals(g.event), totals);
  assert.equal(memberTotals(g.event)['m-1-1'], 25);
});

test('A14: advancing, pausing, resuming or skipping the reveal never changes a score', () => {
  const clock = makeClock();
  const g = at(0, 'performances', { clock });
  g.host('addAward', teamAward(['team-1'], 'Đồng Đội', 50));
  g.host('addAward', teamAward(['team-3'], 'Quá Giờ', -25));
  g.host('addAward', memberAward(['m-2-1'], 'Mời Bạn', 25));
  g.publish();
  const totals = teamTotals(g.event);
  const members = memberTotals(g.event);
  const adjustments = g.event.adjustments;
  const results = g.event.results;
  const { total } = /** @type {import('../src/larp/types.js').RevealPosition} */ (g.event.reveal);
  assert.equal(total, revealSteps(g.event, 'round-faith').length);
  assert.equal(total, 4 + 3 + 1);
  const unchanged = () => {
    assert.deepEqual(teamTotals(g.event), totals);
    assert.deepEqual(memberTotals(g.event), members);
    assert.deepEqual(g.event.adjustments, adjustments);
    assert.deepEqual(g.event.results, results);
  };

  clock.advance(3000);
  g.host('revealAdvance');
  assert.deepEqual([g.event.reveal?.step, g.event.reveal?.stepStartedAt], [1, clock.now()]);
  g.host('revealPause');
  assert.equal(g.event.reveal?.paused, true);
  g.refuse(g.cmd.host('revealPause'), 'wrong_phase');
  g.host('revealAdvance');
  assert.deepEqual([g.event.reveal?.step, g.event.reveal?.paused], [2, true]);
  clock.advance(10_000);
  g.host('revealResume');
  assert.deepEqual([g.event.reveal?.paused, g.event.reveal?.stepStartedAt], [false, clock.now()]);
  g.refuse(g.cmd.host('revealResume'), 'wrong_phase');
  unchanged();
  const p = projection(g.event, clock.now());
  assert.equal(p.reveal?.step, 2);
  assert.equal(p.revealSteps.length, total);
  let last;
  while (g.event.roundPhase === 'reveal') last = g.host('revealAdvance');
  assert.deepEqual([g.event.roundPhase, g.event.reveal], ['results', null]);
  assert.deepEqual(
    last?.events.map((e) => e.type),
    ['revealFinished', 'phaseChanged'],
  );
  g.refuse(g.cmd.host('revealAdvance'), 'wrong_phase');
  g.refuse(g.cmd.host('revealSkip'), 'wrong_phase');
  unchanged();

  const s = at(0, 'performances');
  s.host('addAward', teamAward(['team-1'], 'Đồng Đội', 50));
  s.publish();
  const before = teamTotals(s.event);
  s.host('revealSkip');
  assert.deepEqual([s.event.roundPhase, s.event.reveal], ['results', null]);
  assert.deepEqual(teamTotals(s.event), before);
  assert.equal(s.event.adjustments[0].status, 'published');
});

test('A15: a published +75 that should have been +50: a −25 correction counts once; both records remain', () => {
  const clock = makeClock();
  const g = at(0, 'performances', { clock });
  g.host('addAward', teamAward(['team-1'], 'Cùng Nhau Tỏa Sáng', 75));
  const original = g.event.adjustments[0].id;
  g.publish();
  g.host('revealSkip');
  assert.equal(teamTotals(g.event)['team-1'], 175);
  clock.advance(60_000);
  const fix = g.cmd.host('addCorrection', {
    recipientType: 'team',
    recipientId: 'team-1',
    points: -25,
    reason: ' Sửa  điểm ',
    translation: 'Score fix',
    note: 'nhập nhầm 75',
    targetAdjustmentId: original,
  });
  const added = g.ok(fix);
  assert.equal(g.apply(fix).duplicate, true);
  assert.equal(teamTotals(g.event)['team-1'], 150);
  assert.equal(g.event.corrections.length, 1);
  const [c] = g.event.corrections;
  assert.deepEqual(
    [c.recipientName, c.teamId, c.points, c.reason, c.roundId, c.targetAdjustmentId, c.authorId, c.createdAt],
    ['Đội 1', 'team-1', -25, 'Sửa điểm', 'round-faith', original, HOST_GM_ID, clock.now()],
  );
  assert.deepEqual(added.events, [{ type: 'correctionAdded', teamId: 'team-1', ids: [c.id] }]);
  assert.equal(g.event.results[0].adjustments[0].points, 75, 'the original stays as published');
  const pc = projection(g.event, clock.now()).corrections[0];
  assert.ok(!('note' in pc) && !('authorId' in pc));
  assert.equal(pc.reason, 'Sửa điểm');

  /** @param {object} over */
  const correction = (over) =>
    g.cmd.host('addCorrection', { recipientType: 'team', recipientId: 'team-2', points: 10, reason: 'Lý do', ...over });
  g.refuse(correction({ points: 0 }), 'zero_correction');
  g.refuse(correction({ points: 1.5 }), 'invalid_points');
  g.refuse(correction({ reason: '  ' }), 'invalid_reason');
  g.refuse(correction({ reason: 'x'.repeat(LIMITS.reason + 1) }), 'invalid_reason');
  g.refuse(correction({ translation: 'x'.repeat(LIMITS.reasonTranslation + 1) }), 'invalid_text');
  g.refuse(correction({ recipientId: 'team-9' }), 'not_found');
  g.refuse(correction({ recipientType: 'crowd' }), 'bad_payload');
  g.refuse(correction({ roundId: 'round-dance' }), 'not_found');
  g.refuse(correction({ targetAdjustmentId: 'adj-x' }), 'not_found');
  g.refuse(correction({ targetAdjustmentId: original }), 'bad_payload');
  g.refuse(
    g.cmd.judge('gm-1', 'addCorrection', { recipientType: 'team', recipientId: 'team-2', points: 5, reason: 'x' }),
    'forbidden',
  );

  g.host('addCorrection', { recipientType: 'member', recipientId: 'm-2-1', points: 10, reason: 'Quên ghi' });
  assert.deepEqual(
    [memberTotals(g.event)['m-2-1'], g.event.corrections[1].teamId, g.event.corrections[1].roundId],
    [10, 'team-2', null],
  );
  assert.equal(teamTotals(g.event)['team-2'], 100, 'a member correction never touches the team');
  g.host('endEvent');
  g.host('addCorrection', { recipientType: 'team', recipientId: 'team-2', points: 5, reason: 'Sau cùng' });
  assert.equal(teamTotals(g.event)['team-2'], 105);

  const setup = game(eventWithTeams(2));
  setup.refuse(
    setup.cmd.host('addCorrection', { recipientType: 'team', recipientId: 'team-1', points: 5, reason: 'x' }),
    'wrong_phase',
  );
});

test('A19: tied teams and individuals share a place (1, 1, 3)', () => {
  const g = at(0, 'performances');
  g.host('addAward', teamAward(['team-1', 'team-2'], 'Đồng Đội', 50));
  g.host('addAward', memberAward(['m-1-1', 'm-2-1'], 'Mời Bạn', 25));
  g.host('addAward', memberAward(['m-3-1'], 'Giúp Đỡ', 10));
  g.host('addAward', memberAward(['m-4-1'], 'Ồn Ào', -5));
  g.publish({ 'team-4': 'passed' });
  const p = projection(g.event, T0);
  assert.deepEqual(
    p.standings.map((s) => [s.id, s.total, s.place]),
    [
      ['team-1', 150, 1],
      ['team-2', 150, 1],
      ['team-3', 100, 3],
      ['team-4', 0, 4],
    ],
  );
  assert.deepEqual(p.leaders, [], 'individual leaders wait for the end');
  g.host('revealSkip');
  g.host('endEvent');
  const end = projection(g.event, T0);
  assert.deepEqual(
    end.leaders.map((l) => [l.id, l.name, l.teamId, l.total, l.place]),
    [
      ['m-1-1', 'Member 1.1', 'team-1', 25, 1],
      ['m-2-1', 'Member 2.1', 'team-2', 25, 1],
      ['m-3-1', 'Member 3.1', 'team-3', 10, 3],
    ],
  );
});

test('A23: Passed scores zero, a skipped round discards its drafts and counts zero, a deduction may pass the base', () => {
  const g = at(0, 'performances');
  g.host('addAward', teamAward(['team-1'], 'Quá Giờ', -150, { translation: 'Over Time' }));
  const big = g.event.adjustments[0].id;
  assert.deepEqual(flags(g.event, 'round-faith').large, [big]);
  g.publish({ 'team-2': 'passed', 'team-3': 'absent' });
  assert.deepEqual(g.event.results[0].teamRoundScores, { 'team-1': -50, 'team-2': 0, 'team-3': 0, 'team-4': 100 });
  assert.deepEqual(teamTotals(g.event), { 'team-1': -50, 'team-2': 0, 'team-3': 0, 'team-4': 100 });
  g.host('revealSkip');

  g.host('nextRound');
  g.host('startPreparation');
  g.judge('gm-1', 'addAward', teamAward(['team-2'], 'Nháp', 80));
  g.host('addAward', memberAward(['m-2-1'], 'Nháp Cá Nhân', 20));
  const drafts = adjIds(g.event, (a) => a.roundId === 'round-dance');
  const skipped = g.host('skipRound', { roundId: 'round-dance' });
  assert.deepEqual(skipped.events[0], { type: 'roundSkipped', roundId: 'round-dance', ids: drafts });
  assert.deepEqual([g.event.roundPhase, g.round().skipped, g.event.timer.kind], ['results', true, null]);
  assert.ok(g.event.adjustments.filter((a) => drafts.includes(a.id)).every((a) => a.status === 'discarded'));
  assert.equal(g.event.results.length, 1, 'a skipped round has no result');
  assert.deepEqual(teamTotals(g.event), { 'team-1': -50, 'team-2': 0, 'team-3': 0, 'team-4': 100 });
  assert.deepEqual(memberTotals(g.event)['m-2-1'], 0);
  g.refuse(g.cmd.host('skipRound', { roundId: 'round-dance' }), 'wrong_phase');
  g.refuse(g.cmd.host('skipRound', { roundId: 'round-faith' }), 'already_published');
  g.refuse(g.cmd.host('skipRound', { roundId: 'round-x' }), 'not_found');

  g.host('skipRound', { roundId: 'round-skit' });
  assert.equal(g.event.rounds[3].skipped, true);
  assert.equal(g.event.roundPhase, 'results', 'skipping a later round leaves the current phase alone');
  g.host('nextRound');
  assert.equal(g.round().id, 'round-prayer');
  g.perform();
  g.publish();
  g.host('revealSkip');
  g.host('nextRound');
  assert.equal(g.round().id, 'round-cheer', 'the skipped skit is passed over');
  g.perform();
  g.publish();
  g.host('revealSkip');
  g.refuse(g.cmd.host('nextRound'), 'no_more_rounds');
  assert.deepEqual(teamTotals(g.event), { 'team-1': 550, 'team-2': 600, 'team-3': 600, 'team-4': 700 });
});

test('A27: a custom −25 for a team and for an individual: preview, result, reveal and history agree', () => {
  const g = at(0, 'performances');
  g.host('addAward', teamAward(['team-1'], 'Quá Giờ', -25, { translation: 'Over Time' }));
  g.judge('gm-1', 'addAward', memberAward(['m-1-2'], 'Chen Ngang', -25, { translation: 'Interrupting' }));
  const [teamAdj, memberAdj] = g.event.adjustments.map((a) => a.id);
  g.host('beginReview');
  for (const teamId of g.round().order) g.host('setStatus', { teamId, status: 'complete' });
  const preview = previewRound(g.event, 'round-faith');
  assert.deepEqual([preview.teamRoundScores['team-1'], preview.memberPoints['m-1-2']], [75, -25]);
  g.host('publishRound', { roundId: 'round-faith' });
  assert.equal(g.event.results[0].teamRoundScores['team-1'], 75);
  assert.equal(teamTotals(g.event)['team-1'], 75);
  assert.equal(memberTotals(g.event)['m-1-2'], -25);
  const steps = revealSteps(g.event, 'round-faith');
  assert.deepEqual(
    steps.filter((s) => s.kind === 'award').map((s) => s.adjustmentId),
    [teamAdj, memberAdj],
  );
  assert.deepEqual(
    projection(g.event, T0).results[0].adjustments.map((a) => a.points),
    [-25, -25],
  );
  const awards = g.event.history.filter((h) => h.type === 'addAward');
  assert.deepEqual(
    awards.map((h) => [h.ids, h.actorId, h.mode]),
    [
      [[teamAdj], HOST_GM_ID, 'host'],
      [[memberAdj], 'gm-1', 'judge'],
    ],
  );
});

test('A28: a team added mid-game starts at zero and joins the next round; during Performances, the end of the queue', () => {
  const g = at(0, 'performances');
  g.host('addAward', teamAward(['team-2'], 'Đồng Đội', 40));
  g.publish();
  g.host('revealSkip');
  const result = structuredClone(g.event.results[0]);
  const totals = teamTotals(g.event);
  const added = g.host('addTeamMidGame', { name: 'Đội Mới', translation: 'New Team' });
  const fresh = g.event.teams.at(-1);
  assert.deepEqual([fresh?.name, fresh?.admittedRound, fresh?.color], ['Đội Mới', 1, TEAM_COLORS[4]]);
  assert.deepEqual(added.events, [{ type: 'teamAdded', teamId: fresh?.id }]);
  assert.deepEqual(g.event.results[0], result);
  assert.deepEqual(teamTotals(g.event), { ...totals, [String(fresh?.id)]: 0 });
  assert.ok(!g.event.rounds[0].order.includes(String(fresh?.id)));
  assert.equal(projection(g.event, T0).teams.at(-1)?.isNew, true);
  assert.equal(projection(g.event, T0).standings.at(-1)?.total, 0);

  g.host('nextRound');
  assert.deepEqual(g.round().order, rotatedQueue(g.event.teams, 1));
  assert.ok(g.round().order.includes(String(fresh?.id)));
  // Added in Briefing: not this round (its queue is built), the next one; it can't be awarded here.
  g.host('addTeamMidGame', { name: 'Đội Trễ' });
  const late = String(g.event.teams.at(-1)?.id);
  assert.equal(g.event.teams.at(-1)?.admittedRound, 2);
  assert.ok(!g.round().order.includes(late));
  g.host('startPreparation');
  g.refuse(g.cmd.host('addAward', teamAward([late], 'Sớm Quá', 10)), 'not_found');
  g.host('endPreparation');
  g.host('nextTeam');
  // Added during Performances: the end of this round's queue.
  g.host('addTeamMidGame', { name: 'Đội Muộn' });
  const latest = String(g.event.teams.at(-1)?.id);
  assert.equal(g.event.teams.at(-1)?.admittedRound, 1);
  assert.equal(g.round().order.at(-1), latest);
  assert.deepEqual(g.round().admittedTeams, [latest]);
  while (g.event.currentTurn < g.round().order.length - 1) g.host('nextTeam');
  assert.equal(projection(g.event, T0).currentTeamId, latest);
  g.publish();
  assert.equal(g.event.results[1].teamRoundScores[latest], 200);
  assert.equal(teamTotals(g.event)[latest], 200, 'no completion for the round it missed');
  assert.equal(teamTotals(g.event)[late], 0);
  assert.deepEqual(g.event.results[0], result);

  const setup = game(eventWithTeams(1));
  setup.refuse(setup.cmd.host('addTeamMidGame', { name: 'X' }), 'wrong_phase');
  const playing = at(0, 'performances');
  playing.refuse(playing.cmd.host('addTeamMidGame', { name: '' }), 'invalid_name');
});

test('editRound: bases lock once the event runs, and only rounds not yet started can change', () => {
  const g = at(1, 'performances');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-skit', base: 900 }), 'locked');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-dance', prompt: 'Mới' }), 'locked');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-faith', turnMs: 1000 }), 'locked');
  g.host('editRound', {
    roundId: 'round-skit',
    prompt: 'Người Samari nhân hậu',
    promptTranslation: 'The Good Samaritan',
    turnMs: 100_000,
  });
  assert.deepEqual(
    [g.event.rounds[3].promptTranslation, g.event.rounds[3].turnMs, g.event.rounds[3].base],
    ['The Good Samaritan', 100_000, 500],
  );
  g.host('endEvent');
  g.refuse(g.cmd.host('editRound', { roundId: 'round-cheer', prompt: 'X' }), 'locked');
});

test('the roster while running: a removed member’s drafts are discarded, published points stay theirs', () => {
  const g = at(0, 'performances');
  g.host('addAward', memberAward(['m-1-1'], 'Dẫn Dắt', 25));
  g.publish();
  g.host('revealSkip');
  g.host('nextRound');
  g.host('startPreparation');
  g.host('addAward', memberAward(['m-1-1', 'm-1-2'], 'Mời Bạn', 10));
  const [toGone, toStay] = adjIds(g.event, (a) => a.status === 'draft');
  g.host('addMember', { name: 'Đến Muộn', teamId: 'team-2' });
  g.host('removeMember', { memberId: 'm-1-1' });
  assert.equal(g.event.adjustments.find((a) => a.id === toGone)?.status, 'discarded');
  assert.equal(g.event.adjustments.find((a) => a.id === toStay)?.status, 'draft');
  assert.equal(memberTotals(g.event)['m-1-1'], 25, 'published points stay with the removed member');
  // A removed member can still be corrected (by the name their award was published with).
  g.host('addCorrection', { recipientType: 'member', recipientId: 'm-1-1', points: -5, reason: 'Sửa' });
  assert.deepEqual([g.event.corrections[0].recipientName, g.event.corrections[0].teamId], ['Member 1.1', 'team-1']);
  // Removing a co-GM keeps their awards and attribution.
  g.judge('gm-1', 'addAward', teamAward(['team-3'], 'Chuẩn Bị', 15));
  g.host('removeGm', { gmId: 'gm-1' });
  assert.equal(g.event.adjustments.at(-1)?.authorId, 'gm-1');
  g.refuse(g.cmd.judge('gm-1', 'addAward', teamAward(['team-3'], 'Nữa', 5)), 'forbidden');
});

test('endEvent: an unpublished round counts zero and its drafts are discarded', () => {
  const clock = makeClock();
  const g = at(2, 'performances', { clock });
  g.host('addAward', teamAward(['team-1'], 'Nháp', 50));
  clock.advance(1000);
  const ended = g.host('endEvent');
  assert.deepEqual(
    [g.event.phase, g.event.roundPhase, g.event.roundIndex, g.event.finishedAt, g.event.currentTurn],
    ['finished', null, 2, T0 + 1000, -1],
  );
  assert.equal(g.event.adjustments[0].status, 'discarded');
  assert.deepEqual(teamTotals(g.event)['team-1'], 0);
  assert.ok(ended.events.some((e) => e.type === 'eventFinished'));
  for (const type of /** @type {const} */ (['endEvent', 'nextRound', 'startTimer']))
    g.refuse(g.cmd.host(type), 'wrong_phase');
  g.refuse(g.cmd.host('addTeamMidGame', { name: 'X' }), 'wrong_phase');
  g.refuse(g.cmd.host('addAward', teamAward(['team-1'], 'Muộn', 5)), 'wrong_phase');
  g.host('editTeam', { teamId: 'team-1', name: 'Đội Một' });
  assert.equal(g.event.teams[0].name, 'Đội Một', 'names can still be fixed before exporting');
});

test('a command that would take a derived total past the safe integer range is refused (unsafe_total)', () => {
  const g = at(0, 'performances');
  const near = Number.MAX_SAFE_INTEGER - 50;
  g.host('addAward', teamAward(['team-1'], 'Rất Lớn', near));
  g.refuse(g.cmd.host('addAward', teamAward(['team-1'], 'Thêm', 100)), 'unsafe_total');
  g.refuse(g.cmd.host('setStatus', { teamId: 'team-1', status: 'complete' }), 'unsafe_total');
  g.refuse(g.cmd.host('addAward', teamAward(['team-2'], 'Quá', Number.MAX_SAFE_INTEGER + 1)), 'invalid_points');
  g.host('addAward', teamAward(['team-1'], 'Bớt', -60));
  g.host('setStatus', { teamId: 'team-1', status: 'complete' });
  g.refuse(g.cmd.host('removeAward', { adjustmentId: g.event.adjustments[1].id }), 'unsafe_total');
});

test('the remembered command ids stay within LIMITS.maxSeenCommands, oldest dropped first', () => {
  const g = game(createEvent({ id: 'e', now: T0 }));
  const n = LIMITS.maxSeenCommands + 10;
  for (let i = 0; i < n; i++) g.host('setConfig', { sound: i % 2 === 0 });
  assert.equal(g.event.seenCommandIds.length, LIMITS.maxSeenCommands);
  assert.equal(g.event.seenCommandIds[0], 'cmd-11');
  assert.equal(g.event.seenCommandIds.at(-1), `cmd-${n}`);
  assert.equal(g.event.revision, n);
  assert.equal(g.event.history.length, n);
});

test('reduce never mutates its input: every command type leaves the event it was given deep-equal', () => {
  const clock = makeClock();
  const g = game(createEvent({ id: 'e', now: T0 }), { clock });
  const used = new Set();
  const original = g.apply;
  g.apply = (command) => {
    const before = g.event;
    const snapshot = structuredClone(before);
    const result = original(command);
    assert.deepEqual(before, snapshot, `${command.type} changed its input`);
    used.add(command.type);
    return result;
  };
  g.host('addTeam', { name: 'Đội A' });
  g.host('addTeam', { name: 'Đội B' });
  g.host('addTeam', { name: 'Đội C' });
  const [a, b, c] = g.event.teams.map((t) => t.id);
  g.host('editTeam', { teamId: a, patron: 'Thánh Giuse' });
  g.host('removeTeam', { teamId: c });
  g.host('addMember', { name: 'Mai', teamId: a });
  g.host('addMembers', { names: ['An', 'Bình'], teamId: b });
  const [mai, an, binh] = g.event.roster.map((m) => m.id);
  g.host('editMember', { memberId: an, captain: true });
  g.host('removeMember', { memberId: binh });
  g.host('addGm', { name: 'Chị C.' });
  const gm = g.event.gms[1].id;
  g.host('editGm', { gmId: gm, name: 'Chị Cúc' });
  g.host('addGm', { name: 'Anh D.' });
  g.host('removeGm', { gmId: g.event.gms[2].id });
  g.host('editRound', { roundId: 'round-faith', prepMs: 60_000 });
  g.host('setConfig', { scenery: 'shrine' });
  g.host('startEvent');
  g.host('addTeamMidGame', { name: 'Đội Muộn' });
  g.host('nextRound');
  g.host('startPreparation');
  g.host('pauseTimer');
  g.host('resumeTimer');
  g.host('addTime', { ms: 5000 });
  g.judge(gm, 'addAward', teamAward([a], 'Đồng Đội', 50));
  const adj = g.event.adjustments[0].id;
  g.judge(gm, 'editAward', { adjustmentId: adj, points: 60 });
  g.host('addAward', memberAward([mai, an], 'Mời Bạn', 25));
  g.host('removeAward', { adjustmentId: g.event.adjustments[2].id });
  g.host('endPreparation');
  g.host('nextTeam');
  g.host('beginReview');
  g.host('reopenJudging');
  for (const teamId of g.round().order) g.host('setStatus', { teamId, status: 'complete' });
  g.host('beginReview');
  g.host('publishRound', { roundId: g.round().id });
  g.host('revealAdvance');
  g.host('revealPause');
  g.host('revealResume');
  g.host('revealSkip');
  g.host('revealReplay');
  g.host('revealSkip');
  g.host('addCorrection', {
    recipientType: 'team',
    recipientId: a,
    points: -10,
    reason: 'Sửa',
    targetAdjustmentId: adj,
  });
  g.host('skipRound', { roundId: 'round-skit' });
  g.host('nextRound');
  g.host('startPreparation');
  g.refuse(g.cmd.host('startTimer'), 'timer_state');
  // An idle countdown (as a save from before timers auto-started migrates to) is started by hand.
  g.event = deepFreeze({ ...g.event, timer: idleTimer('preparation', 30_000) });
  g.host('startTimer');
  assert.deepEqual([g.event.timer.status, g.event.timer.deadline], ['running', clock.now() + 30_000]);
  g.host('skipRound', { roundId: g.round().id });
  g.host('endEvent');
  assert.deepEqual(
    COMMAND_TYPES.filter((type) => !used.has(type)),
    [],
  );
});

test('edge cases: a broken id generator, a long prompt translation, unknown members, a removed leader', () => {
  const g = game(createEvent({ id: 'e', now: T0 }));
  assert.throws(
    () => reduce(g.event, g.cmd.host('addTeam', { name: 'A' }), { now: T0, newId: () => '' }),
    /newId/,
    'an id generator that never gives a usable id is a programming error',
  );
  // A generator restarted after a reload skips the ids the event already holds.
  g.host('addTeam', { name: 'A' });
  const restarted = reduce(g.event, g.cmd.host('addTeam', { name: 'B' }), { now: T0, newId: makeIds('g') });
  assert.deepEqual(
    restarted.event.teams.map((t) => t.id),
    ['g-team-1', 'g-team-2'],
  );
  g.refuse(
    g.cmd.host('editRound', { roundId: 'round-dance', promptTranslation: 'x'.repeat(LIMITS.prompt + 1) }),
    'invalid_text',
  );

  const p = at(0, 'performances');
  p.host('addAward', memberAward(['m-2-1'], 'Dẫn Dắt', 30));
  p.publish();
  p.refuse(
    p.cmd.host('addCorrection', { recipientType: 'member', recipientId: 'm-9-9', points: 5, reason: 'x' }),
    'not_found',
  );
  // A member corrected and then removed is still celebrated by the name the correction recorded.
  p.host('addCorrection', { recipientType: 'member', recipientId: 'm-3-1', points: 40, reason: 'Quên ghi' });
  p.host('removeMember', { memberId: 'm-3-1' });
  p.host('endEvent');
  assert.deepEqual(
    projection(p.event, T0).leaders.map((l) => [l.id, l.name, l.teamId, l.place]),
    [
      ['m-3-1', 'Member 3.1', 'team-3', 1],
      ['m-2-1', 'Member 2.1', 'team-2', 2],
    ],
  );
});

/**
 * An id generator with one counter per kind ('member-1', 'gm-1', 'adj-1'), like one a page might
 * build; a new one starts again from 1, as it would after a reload.
 */
const perKindIds = () => {
  /** @type {Record<string, number>} */
  const n = {};
  return (kind = 'id') => `${kind}-${(n[kind] = (n[kind] ?? 0) + 1)}`;
};

test('a restarted id generator never reissues an id the event still references (removed members and GMs)', () => {
  const clock = makeClock();
  const g = game(createEvent({ id: 'e', now: T0 }), { clock, ids: perKindIds() });
  g.host('addTeam', { name: 'Đội A' });
  const team = g.event.teams[0].id;
  g.host('addMembers', { names: ['Mai', 'Bảo'], teamId: team });
  const [mai] = g.event.roster.map((m) => m.id);
  g.host('addGm', { name: 'Anh B.' });
  const anh = g.event.gms[1].id;
  g.host('startEvent');
  g.host('nextRound');
  g.host('startPreparation');
  g.host('addAward', memberAward([mai], 'Dẫn Chuyện', 25));
  g.host('endPreparation');
  g.host('nextTeam');
  g.publish();
  g.host('revealSkip');
  g.host('nextRound');
  g.host('startPreparation');
  g.judge(anh, 'addAward', teamAward([team], 'Sáng Tạo', 75));
  const draft = g.event.adjustments.at(-1);
  g.host('removeMember', { memberId: mai });
  g.host('removeGm', { gmId: anh });

  // The page reloads: the same event, a generator counting from 1 again.
  const r = game(g.event, { clock, ids: perKindIds(), commandPrefix: 'reload' });
  r.host('addMembers', { names: ['Bình', 'Lan', 'Huơng'], teamId: team });
  r.host('addGm', { name: 'Chị C.' });
  r.host('addGm', { name: 'Dũng D.' });
  const newMembers = r.event.roster.slice(-3).map((m) => m.id);
  const newGms = r.event.gms.slice(-2).map((x) => x.id);
  assert.ok(!newMembers.includes(mai), `a new member took ${mai}`);
  assert.ok(!newGms.includes(anh), `a new GM took ${anh}`);
  const totals = memberTotals(r.event);
  assert.deepEqual(
    newMembers.map((id) => totals[id]),
    [0, 0, 0],
    'nobody inherits Mai’s published points',
  );
  assert.equal(totals[mai], 25);
  for (const gm of newGms) {
    r.refuse(r.cmd.judge(gm, 'editAward', { adjustmentId: draft.id, points: -500 }), 'not_own_award');
  }
  // Every other id the event holds stays unique too.
  r.host('addAward', teamAward([team], 'Đồng Đội', 10));
  const ids = [...r.event.teams, ...r.event.roster, ...r.event.gms, ...r.event.adjustments].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.notEqual(r.event.adjustments.at(-1)?.batchId, draft.batchId);
});

test('Add Time during a turn applies to the whole round: every later turn gets it too', () => {
  const clock = makeClock();
  const g = game(eventWithTeams(3), { clock });
  g.host('startEvent');
  g.host('nextRound');
  g.host('startPreparation');
  g.host('endPreparation');
  g.host('nextTeam');
  g.host('addTime', { ms: 30_000 });
  assert.equal(remaining(g.event.timer, clock.now()), 75_000);
  assert.equal(g.round().turnMs, 75_000);
  assert.equal(projection(g.event, clock.now()).round?.turnMs, 75_000, 'the display shows the longer turn');
  clock.advance(75_000);
  g.host('nextTeam');
  assert.deepEqual([g.event.timer.durationMs, remaining(g.event.timer, clock.now())], [75_000, 75_000]);
  g.host('pauseTimer');
  g.host('addTime', { ms: 5_000 });
  g.host('nextTeam');
  assert.equal(g.event.timer.durationMs, 80_000, 'a paused turn’s added time reaches later turns too');
  // The round's own allowance never passes the longest duration a round may have.
  g.refuse(g.cmd.host('addTime', { ms: LIMITS.maxDurationMs }), 'invalid_duration');
  // The longer allowance stays with the round through Review and Reopen Judging.
  g.host('beginReview');
  g.host('reopenJudging');
  assert.equal(g.round().turnMs, 80_000);
});

test('A06: a kept duplicate cannot lose its reason by editing; the first award edits freely', () => {
  const g = at(0, 'performances');
  g.host('addAward', teamAward(['team-1'], 'Dong Doi', 50));
  const first = g.event.adjustments[0].id;
  g.host('addAward', teamAward(['team-1'], 'Đồng  đội', 50, { duplicateReason: 'twice on purpose' }));
  const second = g.event.adjustments[1].id;
  const refused = g.refuse(g.cmd.host('editAward', { adjustmentId: second, duplicateReason: null }), 'duplicate_award');
  assert.deepEqual(refused.error?.ids, [first]);
  g.host('editAward', { adjustmentId: second, points: 40 });
  assert.equal(g.event.adjustments[1].duplicateReason, 'twice on purpose');
  g.host('editAward', { adjustmentId: second, duplicateReason: 'a second skit' });
  assert.equal(g.event.adjustments[1].duplicateReason, 'a second skit');
  // The first award carries no reason and still edits freely.
  g.host('editAward', { adjustmentId: first, points: 60 });
  // Once it no longer duplicates anything, the reason may go.
  g.host('removeAward', { adjustmentId: first });
  g.host('editAward', { adjustmentId: second, duplicateReason: null });
  assert.equal(g.event.adjustments[1].duplicateReason, null);
});

test('A14: replaying banners (one, or the whole reveal from Results) never changes a score', () => {
  const clock = makeClock();
  const g = at(0, 'performances', { clock });
  g.host('addAward', teamAward(['team-1'], 'Đồng Đội', 50));
  g.host('addAward', memberAward(['m-2-1'], 'Mời Bạn', 25));
  g.publish();
  const totals = teamTotals(g.event);
  const members = memberTotals(g.event);
  const { adjustments, results, history } = g.event;
  const total = g.event.reveal?.total ?? 0;
  const unchanged = () => {
    assert.deepEqual(teamTotals(g.event), totals);
    assert.deepEqual(memberTotals(g.event), members);
    assert.deepEqual(g.event.adjustments, adjustments);
    assert.deepEqual(g.event.results, results);
    assert.deepEqual(g.event.history.slice(0, history.length), history, 'every award stays in history');
  };
  g.host('revealAdvance');
  g.host('revealAdvance');
  clock.advance(4000);
  g.host('revealReplay', { step: 1 });
  assert.deepEqual(g.event.reveal, {
    roundId: 'round-faith',
    step: 1,
    total,
    paused: false,
    stepStartedAt: clock.now(),
  });
  for (const step of [-1, total, 1.5, '0']) g.refuse(g.cmd.host('revealReplay', { step }), 'bad_payload');
  g.host('revealSkip');
  unchanged();
  g.host('revealReplay');
  assert.deepEqual([g.event.roundPhase, g.event.reveal?.step, g.event.reveal?.total], ['reveal', 0, total]);
  unchanged();
  g.host('revealSkip');
  assert.deepEqual([g.event.roundPhase, g.event.reveal], ['results', null]);
  unchanged();
  // Judge Mode never replays; there's nothing to replay before a result or in another phase.
  g.refuse(g.cmd.judge('gm-1', 'revealReplay'), 'forbidden');
  g.host('nextRound');
  g.refuse(g.cmd.host('revealReplay'), 'wrong_phase');
  const skipped = at(0, 'performances');
  skipped.host('skipRound', { roundId: 'round-faith' });
  skipped.refuse(skipped.cmd.host('revealReplay'), 'wrong_phase');
});
