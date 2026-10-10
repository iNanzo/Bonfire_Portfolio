// Whole campfire events played through the reducer (src/larp/state.js), from createEvent to the
// final standings: five rounds at 1, 4, 12 and 100 teams (A26) with rotating queues, co-GMs
// judging in Judge Mode, individual awards, passed teams, reveals, and scores checked against an
// independent hand count, the projection and the results CSV naming every team; the design's
// own evening (Mai's skit, a team arriving mid-game, a correction); and a save, reload and
// resume mid-round through the store that carries on exactly as if nothing happened (A16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvent, projection, reduce } from '../src/larp/state.js';
import { createStore, exportBackup, exportResultsCsv, importBackup } from '../src/larp/store.js';
import { memberTotals, previewRound, teamTotals } from '../src/larp/scoring.js';
import { estimate } from '../src/larp/config.js';
import { remaining, revealSteps } from '../src/larp/phases.js';
import { HOST_GM_ID, ROUND_CATEGORIES } from '../src/larp/types.js';
import { T0, deepFreeze, fakeStorage, makeClock, makeIds } from './lib/larpFixtures.mjs';
import { game } from './lib/larpGame.mjs';

/** @typedef {import('../src/larp/types.js').LarpEvent} LarpEvent */
/** @typedef {import('../src/larp/types.js').CompletionStatus} CompletionStatus */

const BASES = ROUND_CATEGORIES.map((c) => c.base);

/** Team i's own award in round r: −15 … +35 in steps of 5 (zeros and deductions included). */
const awardPoints = (/** @type {number} */ r, /** @type {number} */ i) => (((i * 7 + r * 13) % 11) - 3) * 5;
/** Team i's status in round r: now and then a team passes. */
const statusOf = (/** @type {number} */ r, /** @type {number} */ i) =>
  /** @type {CompletionStatus} */ ((i + r) % 7 === 3 ? 'passed' : 'complete');
/** The first member of every even team gets 10 + r individual points each round. */
const memberPoints = (/** @type {number} */ r) => 10 + r;

/** The ids in `ids` rotated left by k (what each round's queue should be). */
const rotate = (/** @type {string[]} */ ids, /** @type {number} */ k) => [
  ...ids.slice(k % ids.length),
  ...ids.slice(0, k % ids.length),
];

/**
 * The CSV's rows as arrays of cells (the scenario's text has no commas or quotes to escape).
 * @param {string} csv
 */
const csvRows = (csv) =>
  csv
    .trimEnd()
    .split('\r\n')
    .map((line) => line.split(','));

/**
 * Plays a whole event with `n` teams through reduce() and checks it as it goes.
 * @param {number} n
 */
function playFullEvent(n) {
  const clock = makeClock();
  const g = game(createEvent({ id: `camp-${n}`, now: T0 }), { clock, ids: makeIds('c') });
  for (let i = 0; i < n; i++) g.host('addTeam', { name: `Đội ${i + 1}`, translation: `Team ${i + 1}` });
  const teamIds = g.event.teams.map((t) => t.id);
  for (const [i, teamId] of teamIds.entries()) {
    g.host('addMembers', { teamId, names: [`Em ${i + 1}A`, `Em ${i + 1}B`] });
  }
  const firstMember = new Map(teamIds.map((teamId) => [teamId, g.event.roster.find((m) => m.teamId === teamId)?.id]));
  g.host('addGm', { name: 'Anh Bảo' });
  g.host('addGm', { name: 'Chị Cúc' });
  const [, bao, cuc] = g.event.gms.map((x) => x.id);
  const est = estimate({ ...g.event.config, rounds: g.event.rounds }, n);
  assert.equal(est.totalMs, (26 + 6 * n) * 60_000, 'the estimate grows 6:00 a team and never blocks a team');

  g.host('startEvent');
  for (let r = 0; r < 5; r++) {
    g.host('nextRound');
    assert.deepEqual(g.round().order, rotate(teamIds, r), `round ${r + 1}'s queue rotates and holds every team`);
    g.host('startPreparation');
    clock.advance(g.round().prepMs);
    g.host('endPreparation');
    for (let turn = 0; turn < n; turn++) {
      g.host('nextTeam');
      const teamId = g.round().order[turn];
      const i = teamIds.indexOf(teamId);
      assert.equal(projection(g.event, clock.now()).currentTeamId, teamId);
      // The co-GMs take turns judging at the laptop during the changeovers.
      g.judge(turn % 2 ? cuc : bao, 'addAward', {
        recipientType: 'team',
        recipientIds: [teamId],
        name: `Điểm ${r + 1}.${i + 1}`,
        points: awardPoints(r, i),
        note: 'ghi chú riêng',
      });
      if (i % 2 === 0) {
        g.host('addAward', {
          recipientType: 'member',
          recipientIds: [firstMember.get(teamId)],
          name: 'Dẫn Dắt',
          translation: 'Leadership',
          points: memberPoints(r),
          authorId: bao,
        });
      }
      clock.advance(g.round().turnMs + g.round().transitionMs);
    }
    g.host('beginReview');
    for (const [i, teamId] of teamIds.entries()) g.host('setStatus', { teamId, status: statusOf(r, i) });
    const preview = previewRound(g.event, g.round().id);
    g.host('publishRound', { roundId: g.round().id });
    assert.deepEqual(g.event.results[r].teamRoundScores, preview.teamRoundScores, 'preview equals publication');
    const steps = revealSteps(g.event, g.round().id);
    assert.equal(g.event.reveal?.total, steps.length);
    assert.equal(steps.filter((s) => s.kind === 'team').length, n, 'the reveal shows every team');
    assert.equal(steps.filter((s) => s.kind === 'award').length, n + Math.ceil(n / 2), 'and every award');
    if (n <= 12) {
      while (g.event.roundPhase === 'reveal') {
        clock.advance(3000);
        g.host('revealAdvance');
      }
    } else {
      g.host('revealAdvance');
      g.host('revealSkip');
    }
    assert.equal(g.event.roundPhase, 'results');
  }
  g.refuse(g.cmd.host('nextRound'), 'no_more_rounds');
  g.host('endEvent');
  return { g, teamIds, firstMember };
}

for (const n of [1, 4, 12, 100]) {
  test(`A26: a five-round event with ${n} team${n === 1 ? '' : 's'}: every team queued, scored, shown and exported`, () => {
    const { g, teamIds, firstMember } = playFullEvent(n);
    const e = g.event;
    /** @type {Record<string, number>} */
    const expected = {};
    for (const [i, teamId] of teamIds.entries()) {
      expected[teamId] = BASES.reduce(
        (sum, base, r) => sum + (statusOf(r, i) === 'complete' ? base : 0) + awardPoints(r, i),
        0,
      );
    }
    assert.deepEqual(teamTotals(e), expected);
    const members = memberTotals(e);
    for (const [i, teamId] of teamIds.entries()) {
      const id = String(firstMember.get(teamId));
      assert.equal(members[id], i % 2 === 0 ? 10 + 11 + 12 + 13 + 14 : 0);
    }
    assert.equal(e.results.length, 5);
    assert.ok(e.adjustments.every((a) => a.status === 'published'));
    assert.equal(e.revision, e.history.length);

    const p = projection(e, g.clock.now());
    assert.equal(p.phase, 'finished');
    assert.equal(p.standings.length, n);
    assert.deepEqual(new Set(p.standings.map((s) => s.id)), new Set(teamIds));
    for (const s of p.standings) assert.equal(s.total, expected[s.id]);
    const sorted = [...p.standings].sort((a, b) => b.total - a.total);
    assert.deepEqual(
      p.standings.map((s) => s.total),
      sorted.map((s) => s.total),
    );
    assert.ok(p.leaders.length >= 1 && p.leaders.every((l) => l.total > 0 && l.place <= 3));
    const text = JSON.stringify(p);
    assert.ok(!text.includes('ghi chú riêng') && !text.includes('Anh Bảo') && !text.includes(HOST_GM_ID));

    const rows = csvRows(exportResultsCsv(e));
    const section = (/** @type {string} */ name) => rows.filter((row) => row[0] === name);
    assert.deepEqual(new Set(section('Standing').map((row) => row[2])), new Set(e.teams.map((t) => t.name)));
    assert.equal(section('Round Score').length, n * 5);
    assert.equal(section('Award').length, 5 * (n + Math.ceil(n / 2)));
    assert.equal(section('Member Total').length, 2 * n);
    assert.ok(!rows.flat().includes('ghi chú riêng'), 'private notes never reach the export');
  });
}

test('the design’s evening: Mai’s skit, a team arriving mid-game and a correction, saved after every command', () => {
  const clock = makeClock();
  const storage = fakeStorage();
  const store = createStore({ storage });
  const g = game(createEvent({ id: 'nghia-si', now: T0 }), { clock, ids: makeIds('n') });
  const original = g.apply;
  g.apply = (command) => {
    const result = original(command);
    if (!result.error && !result.duplicate) assert.deepEqual(store.save(g.event), { ok: true });
    return result;
  };
  for (const [name, translation] of [
    ['Đội Phaolô', 'Team Paul'],
    ['Đội Giuse', 'Team Joseph'],
    ['Đội Maria', 'Team Mary'],
    ['Đội Phêrô', 'Team Peter'],
  ]) {
    g.host('addTeam', { name, translation });
  }
  const [paul, joseph, mary, peter] = g.event.teams.map((t) => t.id);
  g.host('addMembers', { teamId: paul, names: ['Mai', 'Tuấn'] });
  g.host('addMembers', { teamId: joseph, names: ['Lan', 'Huy'] });
  const mai = String(g.event.roster.find((m) => m.name === 'Mai')?.id);
  g.host('addGm', { name: 'Anh B.' });
  const coGm = g.event.gms[1].id;
  g.host('startEvent');

  // Rounds 1–3: everyone completes; a team arrives after round 1.
  for (let r = 0; r < 3; r++) {
    g.host('nextRound');
    g.perform();
    g.publish();
    g.host('revealSkip');
    if (r === 0) {
      g.host('addTeamMidGame', { name: 'Đội Gioan', translation: 'Team John' });
      assert.equal(teamTotals(g.event)[g.event.teams[4].id], 0);
    }
  }
  const john = g.event.teams[4].id;
  assert.deepEqual(teamTotals(g.event), { [paul]: 600, [joseph]: 600, [mary]: 600, [peter]: 600, [john]: 500 });

  // Round 4: the skit, as the design tells it.
  g.host('nextRound');
  assert.equal(g.round().category, 'skit');
  g.perform();
  g.host('addAward', {
    recipientType: 'team',
    recipientIds: [paul],
    name: 'Cùng Nhau Tỏa Sáng',
    translation: 'Shine Together',
    points: 75,
  });
  g.judge(coGm, 'addAward', {
    recipientType: 'team',
    recipientIds: [paul],
    name: 'Sáng Tạo',
    translation: 'Creativity',
    points: 50,
  });
  g.host('addAward', {
    recipientType: 'team',
    recipientIds: [paul],
    name: 'Quá Giờ',
    translation: 'Over Time',
    points: -25,
  });
  g.judge(coGm, 'addAward', {
    recipientType: 'member',
    recipientIds: [mai],
    name: 'Dẫn Truyện Rõ Ràng',
    translation: 'Clear Narration',
    points: 25,
  });
  g.host('beginReview');
  for (const teamId of g.round().order) g.host('setStatus', { teamId, status: 'complete' });
  assert.equal(previewRound(g.event, 'round-skit').teamRoundScores[paul], 600);
  g.host('publishRound', { roundId: 'round-skit' });
  const skit = g.event.results[3];
  assert.equal(skit.teamRoundScores[paul], 600);
  assert.equal(memberTotals(g.event)[mai], 25);
  const reveal = projection(g.event, clock.now());
  const paulSteps = reveal.revealSteps.filter((s) => s.teamId === paul).map((s) => s.kind);
  assert.deepEqual(paulSteps, ['team', 'award', 'award', 'award', 'award']);
  const maiBanner = reveal.results[3].adjustments.find((a) => a.recipientType === 'member');
  assert.deepEqual([maiBanner?.recipientName, maiBanner?.teamId, maiBanner?.points], ['Mai', paul, 25]);
  g.host('revealSkip');

  // The +75 should have been +50.
  const shine = skit.adjustments[0].id;
  g.host('addCorrection', {
    recipientType: 'team',
    recipientId: paul,
    points: -25,
    reason: 'Sửa điểm',
    translation: 'Score fix',
    targetAdjustmentId: shine,
  });
  assert.equal(teamTotals(g.event)[paul], 600 + 575);

  g.host('nextRound');
  g.perform();
  g.publish({ [peter]: 'absent' });
  g.host('revealSkip');
  g.host('endEvent');
  assert.deepEqual(teamTotals(g.event), {
    [paul]: 600 + 575 + 300,
    [joseph]: 1400,
    [mary]: 1400,
    [peter]: 1100,
    [john]: 1300,
  });
  const end = projection(g.event, clock.now());
  assert.deepEqual(
    end.standings.map((s) => [s.id, s.place]),
    [
      [paul, 1],
      [joseph, 2],
      [mary, 2],
      [john, 4],
      [peter, 5],
    ],
  );
  assert.deepEqual(
    end.leaders.map((l) => [l.name, l.total]),
    [['Mai', 25]],
  );

  // What the browser kept is the event, whole; a backup moves it to another laptop unchanged.
  assert.deepEqual(store.load(), { ok: true, event: g.event });
  const moved = importBackup(exportBackup(g.event));
  assert.ok(moved.ok);
  assert.deepEqual(moved.ok && moved.event, g.event);
  const csv = exportResultsCsv(g.event);
  for (const name of ['Đội Phaolô', 'Đội Gioan', 'Cùng Nhau Tỏa Sáng', 'Sửa điểm', 'Mai'])
    assert.ok(csv.includes(name));
});

test('A16: saved mid-round and reloaded, the event resumes exactly: phase, drafts, timer, scores, no repeats', () => {
  const clock = makeClock();
  const storage = fakeStorage();
  const g = game(createEvent({ id: 'resume', now: T0 }), { clock, ids: makeIds('r') });
  for (let i = 1; i <= 4; i++) g.host('addTeam', { name: `Đội ${i}` });
  for (const t of g.event.teams) g.host('addMembers', { teamId: t.id, names: [`${t.name} A`] });
  g.host('addGm', { name: 'Chị C.' });
  const coGm = g.event.gms[1].id;
  g.host('startEvent');
  g.host('nextRound');
  g.perform();
  g.publish();
  g.host('revealSkip');
  g.host('nextRound');
  g.host('startPreparation');
  clock.advance(g.round().prepMs);
  g.host('endPreparation');
  g.host('nextTeam');
  g.judge(coGm, 'addAward', {
    recipientType: 'team',
    recipientIds: [g.round().order[0]],
    name: 'Đồng Lòng',
    points: 40,
  });
  const last = g.cmd.host('addAward', {
    recipientType: 'member',
    recipientIds: [g.event.roster[0].id],
    name: 'Mời Bạn',
    points: 25,
    note: 'riêng',
  });
  g.ok(last);
  clock.advance(10_000);
  g.host('pauseTimer');
  clock.advance(5000);
  g.host('resumeTimer');
  clock.advance(7000);

  // The page reloads: everything comes back from the save.
  const store = createStore({ storage });
  assert.deepEqual(store.save(g.event), { ok: true });
  const loaded = createStore({ storage }).load();
  assert.ok(loaded.ok && loaded.event);
  const reloaded = /** @type {LarpEvent} */ (loaded.ok && loaded.event);
  assert.deepEqual(reloaded, g.event);
  assert.equal(remaining(reloaded.timer, clock.now()), remaining(g.event.timer, clock.now()));
  assert.equal(remaining(reloaded.timer, clock.now()), g.round().turnMs - 17_000, 'the countdown kept running');
  assert.deepEqual(projection(reloaded, clock.now()), projection(g.event, clock.now()));
  assert.equal(reloaded.adjustments.filter((a) => a.status === 'draft').length, 2);
  // A command sent again after the reload (the Add clicked twice across it) is still a repeat.
  const again = reduce(deepFreeze(reloaded), last, { now: clock.now(), newId: makeIds('r') });
  assert.equal(again.duplicate, true);

  // Both copies carry on with the same commands. Each gets an id generator restarted as a reload
  // restarts it, so it repeats ids the save already holds; those are skipped, and both end the same.
  const original = game(g.event, { clock, ids: makeIds('r'), commandPrefix: 'after' });
  const twin = game(reloaded, { clock, ids: makeIds('r'), commandPrefix: 'after' });
  for (const run of [original, twin]) {
    const start = clock.now();
    run.host('addAward', { recipientType: 'team', recipientIds: [run.round().order[1]], name: 'Sáng Tạo', points: 30 });
    run.host('nextTeam');
    run.host('nextTeam');
    run.host('nextTeam');
    run.publish();
    run.host('revealSkip');
    run.host('endEvent');
    clock.set(start);
  }
  assert.notDeepEqual(original.event, g.event);
  assert.deepEqual(twin.event, original.event);
  assert.equal(twin.event.results.length, 2);
  assert.equal(twin.event.adjustments.length, 3, 'the award added after the reload exists once');
  const allIds = [...twin.event.adjustments.map((a) => a.id), ...twin.event.teams.map((t) => t.id)];
  assert.equal(new Set(allIds).size, allIds.length, 'no id was handed out twice');
  assert.deepEqual(teamTotals(twin.event), teamTotals(original.event));
});
