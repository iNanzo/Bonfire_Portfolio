// The campfire game's scoring (src/larp/scoring.js): award validation, the derived scores (round
// score = completion + team awards; team total = published rounds + team corrections; member
// totals from member awards only), the safe-integer guard, ranking with shared places (1, 1, 3),
// the review flags and the preview, which must equal what publication produces. Events are built
// by hand with the fixtures, so nothing here depends on the reducer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicatesOf,
  flags,
  isDuplicate,
  isLarge,
  isPoints,
  memberTotals,
  previewRound,
  rank,
  standings,
  teamRoundScore,
  teamTotals,
  totalsSafe,
  validateAward,
} from '../src/larp/scoring.js';
import { HOST_GM_ID, LIMITS } from '../src/larp/types.js';
import { atRound, deepFreeze, eventWithTeams, makeAdjustment, withAwards, withPublished } from './lib/larpFixtures.mjs';

const SKIT = 3; // round index of the 500-point Bible Skit

/**
 * A correction record.
 * @param {Partial<import('../src/larp/types.js').Correction>} over
 * @returns {import('../src/larp/types.js').Correction}
 */
const correction = (over) => ({
  id: 'corr-1',
  recipientType: 'team',
  recipientId: 'team-1',
  recipientName: 'Đội 1',
  teamId: 'team-1',
  points: -25,
  reason: 'Sửa Điểm',
  translation: 'Correction',
  note: '',
  roundId: null,
  targetAdjustmentId: null,
  authorId: HOST_GM_ID,
  createdAt: 0,
  ...over,
});

/** The design's worked example: the skit in Review, team-1 with +75, +50, −25 and Mai (m-1-1) +25. */
function workedExample() {
  const e = eventWithTeams(4, { membersPerTeam: 3, gms: 2 });
  const roster = e.roster.map((m) => (m.id === 'm-1-1' ? { ...m, name: 'Mai' } : m));
  return deepFreeze(
    withAwards(
      atRound({ ...e, roster }, SKIT, 'review', {
        statuses: { 'team-1': 'complete', 'team-2': 'complete', 'team-3': 'complete', 'team-4': 'complete' },
      }),
      [
        { recipientId: 'team-1', name: 'Cùng Nhau Tỏa Sáng', translation: 'Shine Together', points: 75 },
        { recipientId: 'team-1', name: 'Sáng Tạo', points: 50, authorId: 'gm-1' },
        { recipientId: 'team-1', name: 'Quá Giờ', translation: 'Over Time', points: -25 },
        { recipientType: 'member', recipientId: 'm-1-1', name: 'Clear Narration', points: 25 },
      ],
    ),
  );
}

// ---------------------------------------------------------------- validation

test('isPoints: safe integers only, zero and negatives allowed', () => {
  for (const v of [0, 50, -25, 1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])
    assert.equal(isPoints(v), true, v);
  for (const v of [
    0.5,
    -2.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    2 ** 60,
    '50',
    '',
    null,
    undefined,
    true,
    [5],
    {},
    5n,
  ]) {
    assert.equal(isPoints(v), false, String(v));
  }
});

test('isLarge: flagged only when |points| is above the base, either sign', () => {
  assert.equal(isLarge(500, 500), false);
  assert.equal(isLarge(501, 500), true);
  assert.equal(isLarge(-501, 500), true);
  assert.equal(isLarge(-500, 500), false);
  assert.equal(isLarge(0, 0), false);
  assert.equal(isLarge(1, 0), true);
});

test('validateAward: a good team award, an individual batch, zero points, a negative', () => {
  const e = deepFreeze(eventWithTeams(3, { membersPerTeam: 2, gms: 1 }));
  const ok = { recipientType: 'team', recipientIds: ['team-1'], name: 'Sáng Tạo', points: 50 };
  assert.equal(validateAward(ok, e), null);
  assert.equal(validateAward({ ...ok, points: 0, name: 'Recognition' }, e), null);
  assert.equal(validateAward({ ...ok, points: -25, name: 'Quá Giờ', translation: 'Over Time' }, e), null);
  assert.equal(validateAward({ ...ok, authorId: 'gm-1', note: 'great energy' }, e), null);
  assert.equal(
    validateAward(
      { recipientType: 'member', recipientIds: ['m-1-1', 'm-2-1', 'm-3-2'], name: 'Invited Someone In', points: 25 },
      e,
    ),
    null,
  );
  // Exactly at the limits (counted in code points: 'ạ' is one).
  assert.equal(validateAward({ ...ok, name: 'ạ'.repeat(LIMITS.awardName) }, e), null);
  assert.equal(validateAward({ ...ok, translation: 'x'.repeat(LIMITS.awardTranslation) }, e), null);
  assert.equal(validateAward({ ...ok, name: '🔥'.repeat(LIMITS.awardName) }, e), null);
});

test('validateAward: names, translations, notes and duplicate reasons out of bounds', () => {
  const e = deepFreeze(eventWithTeams(2, { membersPerTeam: 1 }));
  const ok = { recipientType: 'team', recipientIds: ['team-1'], name: 'Sáng Tạo', points: 50 };
  const code = (over) => validateAward({ ...ok, ...over }, e)?.code ?? null;
  assert.equal(code({ name: '' }), 'invalid_name');
  assert.equal(code({ name: '   \n\t ' }), 'invalid_name');
  assert.equal(code({ name: undefined }), 'invalid_name');
  assert.equal(code({ name: 42 }), 'invalid_name');
  assert.equal(code({ name: 'x'.repeat(LIMITS.awardName + 1) }), 'invalid_name');
  // Surrounding and repeated spaces don't count towards the limit.
  assert.equal(code({ name: `  ${'x'.repeat(LIMITS.awardName)}   ` }), null);
  assert.equal(code({ translation: 'x'.repeat(LIMITS.awardTranslation + 1) }), 'invalid_text');
  assert.equal(code({ translation: 7 }), 'invalid_text');
  assert.equal(code({ translation: '' }), null);
  assert.equal(code({ note: 'n'.repeat(LIMITS.note + 1) }), 'invalid_text');
  assert.equal(code({ note: 'n'.repeat(LIMITS.note) }), null);
  assert.equal(code({ duplicateReason: 'Two different moments' }), null);
  assert.equal(code({ duplicateReason: '  ' }), 'invalid_reason');
  assert.equal(code({ duplicateReason: 'r'.repeat(LIMITS.duplicateReason + 1) }), 'invalid_reason');
  assert.equal(code({ duplicateReason: null }), null);
  const err = validateAward({ ...ok, translation: 'x'.repeat(81) }, e);
  assert.equal(err?.field, 'translation');
});

test('validateAward: fractions, NaN, Infinity, strings and unsafe values are rejected', () => {
  const e = deepFreeze(eventWithTeams(1));
  const ok = { recipientType: 'team', recipientIds: ['team-1'], name: 'Sáng Tạo', points: 50 };
  for (const points of [0.5, -0.1, NaN, Infinity, -Infinity, '50', '+50', null, undefined, 2 ** 53, -(2 ** 53)]) {
    const err = validateAward({ ...ok, points }, e);
    assert.equal(err?.code, 'invalid_points', String(points));
    assert.equal(err?.field, 'points');
  }
});

test('validateAward: recipients must be given, distinct, existing and of the right kind', () => {
  const e = deepFreeze(eventWithTeams(2, { membersPerTeam: 2, gms: 1 }));
  const ok = { recipientType: 'team', recipientIds: ['team-1'], name: 'Sáng Tạo', points: 50 };
  const err = (over) => validateAward({ ...ok, ...over }, e);
  assert.equal(err({ recipientIds: [] })?.code, 'no_recipients');
  assert.equal(err({ recipientIds: undefined })?.code, 'no_recipients');
  assert.equal(err({ recipientIds: 'team-1' })?.code, 'no_recipients');
  assert.equal(err({ recipientIds: ['team-1', 7] })?.code, 'no_recipients');
  assert.equal(err({ recipientIds: ['team-1', 'team-1'] })?.code, 'no_recipients');
  assert.deepEqual(err({ recipientIds: ['team-1', 'team-1'] })?.ids, ['team-1']);
  // A member id given as a team, and a team id given as a member: the wrong kind.
  assert.equal(err({ recipientIds: ['m-1-1'] })?.code, 'no_recipients');
  assert.equal(err({ recipientType: 'member', recipientIds: ['team-1'] })?.code, 'no_recipients');
  assert.equal(err({ recipientType: 'everyone' })?.code, 'bad_payload');
  const missing = err({ recipientIds: ['team-1', 'team-9'] });
  assert.equal(missing?.code, 'not_found');
  assert.deepEqual(missing?.ids, ['team-9']);
  assert.equal(err({ authorId: 'gm-404' })?.code, 'not_found');
  assert.equal(err({ authorId: 'gm-404' })?.field, 'authorId');
  assert.equal(validateAward(/** @type {any} */ (null), e)?.code, 'bad_payload');
});

// ---------------------------------------------------------------- the worked example

test('A08: +75, +50 and −25 on a completed 500-point skit preview and publish as 600', () => {
  const e = workedExample();
  const round = e.rounds[SKIT];
  const drafts = e.adjustments.filter((a) => a.status === 'draft');
  assert.equal(teamRoundScore(round, 'team-1', drafts), 600);
  assert.equal(teamRoundScore(round, 'team-2', drafts), 500);

  const preview = previewRound(e, round.id);
  assert.equal(preview.teamRoundScores['team-1'], 600);
  assert.equal(preview.projectedTotals['team-1'], 600);
  assert.equal(teamTotals(e)['team-1'], 0, 'nothing counts before publication');

  const published = withPublished(e, round.id);
  assert.equal(teamTotals(published)['team-1'], 600);
  assert.deepEqual(preview.teamRoundScores, published.results[0].teamRoundScores);
  assert.deepEqual(preview.projectedTotals, teamTotals(published));
});

test('A09: Mai +25 individually gains 25 and the team’s round score stays 600', () => {
  const e = workedExample();
  const preview = previewRound(e, 'round-skit');
  assert.deepEqual(preview.memberPoints, { 'm-1-1': 25 });
  assert.equal(preview.teamRoundScores['team-1'], 600);

  const published = withPublished(e, 'round-skit');
  const members = memberTotals(published);
  assert.equal(members['m-1-1'], 25);
  assert.equal(members['m-1-2'], 0, 'team points are never copied onto members');
  assert.equal(teamTotals(published)['team-1'], 600, 'an individual award never adds to the team');
  // Every roster member has a key.
  assert.equal(Object.keys(members).length, e.roster.length);
});

test('A10: a batch of three +25 awards gives each recipient one award of 25', () => {
  const e = eventWithTeams(3, { membersPerTeam: 2 });
  const recipients = ['m-1-1', 'm-2-2', 'm-3-1'];
  assert.equal(
    validateAward({ recipientType: 'member', recipientIds: recipients, name: 'Helped Another Team', points: 25 }, e),
    null,
  );
  const batch = withAwards(
    atRound(e, 0, 'performances'),
    recipients.map((recipientId) => ({
      recipientType: 'member',
      recipientId,
      name: 'Helped Another Team',
      points: 25,
      batchId: 'batch-x',
    })),
  );
  const preview = previewRound(batch, 'round-faith');
  assert.deepEqual(preview.memberPoints, { 'm-1-1': 25, 'm-2-2': 25, 'm-3-1': 25 });
  // Same name, different recipients: not duplicates.
  assert.deepEqual(flags(batch, 'round-faith').duplicates, []);
  const published = withPublished(batch, 'round-faith');
  const totals = memberTotals(published);
  for (const id of recipients) assert.equal(totals[id], 25);
  assert.equal(totals['m-1-2'], 0);
  assert.deepEqual(teamTotals(published), { 'team-1': 100, 'team-2': 100, 'team-3': 100 });
});

test('A15: a published +75 that should have been +50: a −25 correction changes the total once', () => {
  const e = eventWithTeams(2);
  const played = withPublished(
    withAwards(atRound(e, 0, 'review', { statuses: { 'team-1': 'complete', 'team-2': 'complete' } }), [
      { id: 'adj-75', recipientId: 'team-1', name: 'Tinh Thần', points: 75 },
    ]),
    'round-faith',
  );
  assert.equal(teamTotals(played)['team-1'], 175);
  const corrected = deepFreeze({
    ...played,
    corrections: [correction({ points: -25, roundId: 'round-faith', targetAdjustmentId: 'adj-75' })],
  });
  assert.equal(teamTotals(corrected)['team-1'], 150);
  assert.equal(teamTotals(corrected)['team-2'], 100);
  // Both records remain; the published result is untouched.
  assert.equal(corrected.results[0].teamRoundScores['team-1'], 175);
  assert.equal(corrected.results[0].adjustments[0].points, 75);
  // A member correction moves only the member.
  const m = eventWithTeams(1, { membersPerTeam: 1 });
  const memberFix = {
    ...withPublished(atRound(m, 0, 'review'), 'round-faith'),
    corrections: [correction({ recipientType: 'member', recipientId: 'm-1-1', points: 10 })],
  };
  assert.equal(memberTotals(memberFix)['m-1-1'], 10);
  assert.equal(teamTotals(memberFix)['team-1'], 100);
});

test('A19: ties share a place and the next place skips (1, 1, 3), keeping input order', () => {
  assert.deepEqual(
    rank([
      { id: 'a', total: 300 },
      { id: 'b', total: 500 },
      { id: 'c', total: 500 },
      { id: 'd', total: 100 },
    ]),
    [
      { id: 'b', total: 500, place: 1 },
      { id: 'c', total: 500, place: 1 },
      { id: 'a', total: 300, place: 3 },
      { id: 'd', total: 100, place: 4 },
    ],
  );
  assert.deepEqual(
    rank([
      { id: 'x', total: 10 },
      { id: 'y', total: -5 },
      { id: 'z', total: -5 },
      { id: 'w', total: -5 },
      { id: 'v', total: -6 },
    ]).map((r) => [r.id, r.place]),
    [
      ['x', 1],
      ['y', 2],
      ['z', 2],
      ['w', 2],
      ['v', 5],
    ],
  );
  // Everyone tied: everyone first.
  assert.deepEqual(
    rank([
      { id: 'p', total: 0 },
      { id: 'q', total: 0 },
    ]).map((r) => r.place),
    [1, 1],
  );
  assert.deepEqual(rank([]), []);
  const input = deepFreeze([
    { id: 'a', total: 1 },
    { id: 'b', total: 2 },
  ]);
  assert.deepEqual(
    rank(input).map((r) => r.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    input.map((r) => r.id),
    ['a', 'b'],
    'rank never mutates its input',
  );
});

test('A19: tied teams in the standings and tied individuals share their place', () => {
  const e = eventWithTeams(3, { membersPerTeam: 1 });
  const played = withPublished(
    withAwards(atRound(e, 0, 'review'), [
      { recipientId: 'team-3', name: 'Đoàn Kết', points: 20 },
      { recipientType: 'member', recipientId: 'm-1-1', name: 'Clear Narration', points: 25 },
      { recipientType: 'member', recipientId: 'm-2-1', name: 'Clear Narration', points: 25 },
    ]),
    'round-faith',
  );
  assert.deepEqual(
    standings(played).map((r) => [r.id, r.total, r.place, r.movement]),
    [
      ['team-3', 120, 1, null],
      ['team-1', 100, 2, null],
      ['team-2', 100, 2, null],
    ],
  );
  const members = memberTotals(played);
  assert.deepEqual(
    rank(Object.entries(members).map(([id, total]) => ({ id, total }))).map((r) => [r.id, r.place]),
    [
      ['m-1-1', 1],
      ['m-2-1', 1],
      ['m-3-1', 3],
    ],
  );
});

test('A23: a passed team scores zero completion; its awards still count', () => {
  const e = eventWithTeams(2);
  const r = withAwards(atRound(e, 1, 'review', { statuses: { 'team-1': 'passed', 'team-2': 'absent' } }), [
    { recipientId: 'team-1', name: 'Can Đảm', translation: 'Courage', points: 30 },
  ]);
  assert.equal(teamRoundScore(r.rounds[1], 'team-1', r.adjustments), 30);
  assert.equal(teamRoundScore(r.rounds[1], 'team-2', r.adjustments), 0);
  const published = withPublished(r, 'round-dance');
  assert.deepEqual(teamTotals(published), { 'team-1': 30, 'team-2': 0 });
  assert.deepEqual(previewRound(r, 'round-dance').teamRoundScores, published.results[0].teamRoundScores);
});

test('A23: a skipped round counts zero; later rounds add up as usual', () => {
  let e = eventWithTeams(2);
  e = withPublished(atRound(e, 0, 'review'), 'round-faith');
  // Round 2 skipped: marked skipped, no result, its drafts discarded.
  e = {
    ...e,
    rounds: e.rounds.map((r) => (r.id === 'round-dance' ? { ...r, skipped: true } : r)),
    adjustments: [
      ...e.adjustments,
      makeAdjustment({ id: 'adj-gone', roundId: 'round-dance', points: 999, status: 'discarded' }),
    ],
  };
  e = withPublished(atRound(e, 2, 'review'), 'round-prayer');
  assert.deepEqual(teamTotals(e), { 'team-1': 400, 'team-2': 400 });
  const skipped = previewRound(e, 'round-dance');
  assert.deepEqual(skipped.teamRoundScores, {});
  assert.deepEqual(skipped.projectedTotals, teamTotals(e));
});

test('A23/A27: a deduction larger than the base goes negative, with no hidden clamp', () => {
  const e = eventWithTeams(2, { membersPerTeam: 1 });
  const r = deepFreeze(
    withAwards(atRound(e, 0, 'review', { statuses: { 'team-1': 'complete', 'team-2': 'passed' } }), [
      { id: 'adj-a', recipientId: 'team-1', name: 'Quá Giờ', translation: 'Over Time', points: -150 },
      { id: 'adj-b', recipientId: 'team-2', name: 'Quá Giờ', translation: 'Over Time', points: -25 },
      { id: 'adj-c', recipientType: 'member', recipientId: 'm-1-1', name: 'Off Task', points: -25 },
    ]),
  );
  const preview = previewRound(r, 'round-faith');
  assert.deepEqual(preview.teamRoundScores, { 'team-1': -50, 'team-2': -25 });
  assert.deepEqual(preview.memberPoints, { 'm-1-1': -25 });
  assert.deepEqual(flags(r, 'round-faith').large, ['adj-a']);
  const published = withPublished(r, 'round-faith');
  assert.deepEqual(teamTotals(published), preview.projectedTotals);
  assert.deepEqual(teamTotals(published), { 'team-1': -50, 'team-2': -25 });
  // A27: the individual −25 is the member's alone, and negative.
  assert.equal(memberTotals(published)['m-1-1'], -25);
  assert.deepEqual(
    standings(published).map((s) => [s.id, s.place]),
    [
      ['team-2', 1],
      ['team-1', 2],
    ],
  );
});

// ---------------------------------------------------------------- derived, never stored

test('totals come from the frozen results, not the live drafts or round statuses', () => {
  const e = withPublished(workedExample(), 'round-skit');
  const later = {
    ...e,
    rounds: e.rounds.map((r) => (r.id === 'round-skit' ? { ...r, statuses: { 'team-1': 'passed' } } : r)),
    adjustments: [
      ...e.adjustments.map((a) => ({ ...a, points: 9999 })),
      makeAdjustment({ id: 'late', roundId: 'round-skit', points: 40 }),
      makeAdjustment({ id: 'gone', roundId: 'round-skit', points: 40, status: 'discarded' }),
    ],
  };
  assert.deepEqual(teamTotals(later), teamTotals(e));
  assert.deepEqual(memberTotals(later), memberTotals(e));
});

test('team totals sum across rounds; a team added mid-game starts at zero (A28)', () => {
  let e = eventWithTeams(2, { membersPerTeam: 1 });
  e = withPublished(atRound(e, 0, 'review'), 'round-faith');
  e = {
    ...e,
    teams: [
      ...e.teams,
      { id: 'team-new', name: 'Đội Mới', translation: '', color: '#fff', emblem: 'star', patron: '', admittedRound: 1 },
    ],
  };
  assert.equal(teamTotals(e)['team-new'], 0);
  assert.equal(teamTotals(e)['team-1'], 100, 'published rounds unchanged');
  e = withPublished(atRound(e, 1, 'review'), 'round-dance');
  assert.deepEqual(teamTotals(e), { 'team-1': 300, 'team-2': 300, 'team-new': 200 });
  const rows = standings(e);
  assert.equal(rows.find((r) => r.id === 'team-new')?.movement, null, 'a new team has no movement');
});

test('a removed member keeps the published points; memberTotals keys every roster member', () => {
  let e = eventWithTeams(1, { membersPerTeam: 2 });
  e = withPublished(
    withAwards(atRound(e, 0, 'review'), [{ recipientType: 'member', recipientId: 'm-1-2', name: 'Kind', points: 25 }]),
    'round-faith',
  );
  e = { ...e, roster: e.roster.filter((m) => m.id !== 'm-1-2') };
  assert.deepEqual(memberTotals(e), { 'm-1-1': 0, 'm-1-2': 25 });
});

test('standings: movement is places gained since before the latest published round', () => {
  let e = eventWithTeams(3);
  e = withPublished(
    withAwards(atRound(e, 0, 'review'), [{ recipientId: 'team-1', name: 'Đoàn Kết', points: 50 }]),
    'round-faith',
  );
  assert.ok(
    standings(e).every((r) => r.movement === null),
    'one published round: no movement yet',
  );
  e = withPublished(
    withAwards(atRound(e, 1, 'review'), [
      { recipientId: 'team-3', name: 'Sáng Tạo', points: 80 },
      { recipientId: 'team-2', name: 'Sáng Tạo', points: 10 },
    ]),
    'round-dance',
  );
  // Before: team-1 150 (1st), team-2 100 (2nd), team-3 100 (2nd). Now: team-3 380, team-1 350, team-2 310.
  assert.deepEqual(
    standings(e).map((r) => [r.id, r.total, r.place, r.movement]),
    [
      ['team-3', 380, 1, 1],
      ['team-1', 350, 2, -1],
      ['team-2', 310, 3, -1],
    ],
  );
});

// ---------------------------------------------------------------- safety

test('totalsSafe: true for normal play, false once a derived total leaves the safe range', () => {
  const e = workedExample();
  assert.equal(totalsSafe(e), true);
  const max = Number.MAX_SAFE_INTEGER;
  // Each award is a safe integer, but the round preview would overflow.
  const drafts = withAwards(e, [{ recipientId: 'team-2', name: 'Huge', points: max }]);
  assert.equal(totalsSafe(drafts), false);
  // Published total plus a correction that overflows.
  const published = withPublished(atRound(eventWithTeams(1), 0, 'review'), 'round-faith');
  assert.equal(totalsSafe({ ...published, corrections: [correction({ points: max })] }), false);
  // A member total that overflows across corrections.
  const m = withPublished(atRound(eventWithTeams(1, { membersPerTeam: 1 }), 0, 'review'), 'round-faith');
  const two = [
    correction({ id: 'c1', recipientType: 'member', recipientId: 'm-1-1', points: max }),
    correction({ id: 'c2', recipientType: 'member', recipientId: 'm-1-1', points: 1 }),
  ];
  assert.equal(totalsSafe({ ...m, corrections: two }), false);
  assert.ok(!Number.isSafeInteger(memberTotals({ ...m, corrections: two })['m-1-1']), 'never a wrapped number');
  // Exact arithmetic: 100 + a large plus twice and one minus come back to exactly max.
  const back = [
    correction({ id: 'c1', points: max - 100 }),
    correction({ id: 'c2', points: max - 100 }),
    correction({ id: 'c3', points: -(max - 100) }),
  ];
  assert.equal(teamTotals({ ...published, corrections: back })['team-1'], max);
  assert.equal(totalsSafe({ ...published, corrections: back }), true, 'only the exact total matters, never the order');
});

// ---------------------------------------------------------------- flags and duplicates

test('flags: duplicates across authors, compared without case, accents or spacing', () => {
  const e = eventWithTeams(3, { membersPerTeam: 2, gms: 2 });
  const r = deepFreeze(
    withAwards(atRound(e, 0, 'performances'), [
      { id: 'a1', recipientId: 'team-1', name: 'Sáng Tạo', authorId: HOST_GM_ID },
      { id: 'a2', recipientId: 'team-1', name: '  sang   TAO ', authorId: 'gm-1' },
      { id: 'a3', recipientId: 'team-2', name: 'Sáng Tạo', authorId: 'gm-1' },
      { id: 'a4', recipientId: 'team-1', name: 'Đoàn Kết', authorId: 'gm-2' },
      { id: 'a5', recipientId: 'team-1', name: 'doan ket', authorId: HOST_GM_ID },
      { id: 'a6', recipientId: 'team-1', name: 'SÁNG TẠO', authorId: 'gm-2', status: 'discarded' },
      { id: 'a7', recipientType: 'member', recipientId: 'team-1', name: 'Sáng Tạo' },
      { id: 'a8', recipientId: 'team-1', name: 'Sáng Tạo', roundId: 'round-dance' },
    ]),
  );
  assert.deepEqual(flags(r, 'round-faith').duplicates, [
    ['a1', 'a2'],
    ['a4', 'a5'],
  ]);
});

test('isDuplicate and duplicatesOf: same round, recipient and normalized name; never itself or discarded', () => {
  const a = { id: 'x', roundId: 'r', recipientType: /** @type {const} */ ('team'), recipientId: 't', name: 'Đức Tin' };
  assert.equal(isDuplicate(a, { ...a, id: 'y', name: 'duc tin' }), true);
  assert.equal(isDuplicate(a, { ...a, id: 'y', name: 'DUC  TIN ' }), true);
  assert.equal(isDuplicate(a, { ...a, name: 'duc tin' }), false, 'the same award');
  assert.equal(isDuplicate(a, { ...a, id: undefined }), true, 'a candidate without an id');
  assert.equal(isDuplicate(a, { ...a, id: 'y', roundId: 'other' }), false);
  assert.equal(isDuplicate(a, { ...a, id: 'y', recipientId: 'u' }), false);
  assert.equal(isDuplicate(a, { ...a, id: 'y', recipientType: 'member' }), false);
  assert.equal(isDuplicate(a, { ...a, id: 'y', name: 'Đức Tin Mạnh' }), false);

  const e = withAwards(atRound(eventWithTeams(2, { gms: 1 }), 0, 'performances'), [
    { id: 'd1', name: 'Sáng Tạo' },
    { id: 'd2', name: 'Sáng Tạo', status: 'discarded' },
    { id: 'd3', name: 'Sáng Tạo', status: 'published' },
    { id: 'd4', name: 'Sáng Tạo', recipientId: 'team-2' },
  ]);
  const candidate = { roundId: 'round-faith', recipientType: /** @type {const} */ ('team'), recipientId: 'team-1' };
  assert.deepEqual(
    duplicatesOf(e, { ...candidate, name: 'sáng tạo' }).map((x) => x.id),
    ['d1', 'd3'],
  );
  // Editing d1: it never duplicates itself.
  assert.deepEqual(
    duplicatesOf(e, { ...candidate, id: 'd1', name: 'Sáng Tạo' }).map((x) => x.id),
    ['d3'],
  );
  assert.deepEqual(duplicatesOf(e, { ...candidate, name: 'Other' }), []);
});

test('flags: large values, unset statuses, teams without individual recognition', () => {
  const e = eventWithTeams(4, { membersPerTeam: 2 });
  // team-4 has no roster at all: nothing to recognize, never flagged.
  const roster = e.roster.filter((m) => m.teamId !== 'team-4');
  const r = deepFreeze(
    withAwards(atRound({ ...e, roster }, 1, 'review', { statuses: { 'team-1': 'complete', 'team-3': 'passed' } }), [
      { id: 'big', recipientId: 'team-1', name: 'Wow', points: 201 },
      { id: 'edge', recipientId: 'team-1', name: 'Edge', points: 200 },
      { id: 'neg', recipientId: 'team-2', name: 'Late', points: -250 },
      { id: 'mem', recipientType: 'member', recipientId: 'm-2-1', name: 'Kind', points: 0 },
      { id: 'old', recipientType: 'member', recipientId: 'm-3-1', name: 'Kind', points: 25, status: 'discarded' },
      { id: 'elsewhere', recipientType: 'member', recipientId: 'm-1-1', name: 'Kind', roundId: 'round-faith' },
    ]),
  );
  const f = flags(r, 'round-dance');
  assert.deepEqual(f.large, ['big', 'neg']);
  // Queue for round 2 is rotated: team-2, team-3, team-4, team-1.
  assert.deepEqual(f.unsetStatuses, ['team-2', 'team-4']);
  // A zero-point Recognition counts; discarded and other-round awards don't.
  assert.deepEqual(f.teamsWithoutIndividual, ['team-3', 'team-1']);
  assert.deepEqual(f.duplicates, []);
  assert.deepEqual(flags(r, 'round-nope'), {
    duplicates: [],
    large: [],
    teamsWithoutIndividual: [],
    unsetStatuses: [],
  });
});

// ---------------------------------------------------------------- the preview

test('previewRound equals publication for many teams, statuses and awards (100 teams)', () => {
  const e = eventWithTeams(100, { membersPerTeam: 2, gms: 3 });
  const statuses = /** @type {Record<string, 'complete'|'passed'|'absent'>} */ ({});
  e.teams.forEach((t, i) => (statuses[t.id] = /** @type {const} */ (['complete', 'passed', 'absent'])[i % 3]));
  let round0 = withPublished(atRound(e, 0, 'review'), 'round-faith');
  const awards = e.teams.flatMap((t, i) => [
    { recipientId: t.id, name: `Award ${i}`, points: (i % 7) * 10 - 20 },
    { recipientType: /** @type {const} */ ('member'), recipientId: `m-${i + 1}-2`, name: 'Kind', points: i % 4 },
  ]);
  round0 = withAwards(atRound(round0, 1, 'review', { statuses }), awards);
  const preview = previewRound(round0, 'round-dance');
  const published = withPublished(round0, 'round-dance');
  assert.deepEqual(preview.teamRoundScores, published.results[1].teamRoundScores);
  assert.deepEqual(preview.projectedTotals, teamTotals(published));
  const before = memberTotals(round0);
  const after = memberTotals(published);
  for (const [id, points] of Object.entries(preview.memberPoints)) assert.equal(after[id] - before[id], points);
  assert.equal(Object.keys(preview.memberPoints).length, 100);
  assert.equal(Object.keys(preview.teamRoundScores).length, 100);
});

test('previewRound: an unset status counts as zero; a team added during Performances is included', () => {
  const e = eventWithTeams(2);
  const r = atRound(e, 0, 'performances', { statuses: { 'team-1': 'complete' } });
  const withNew = {
    ...r,
    teams: [
      ...r.teams,
      { id: 'team-new', name: 'Mới', translation: '', color: '#fff', emblem: 'dove', patron: '', admittedRound: 0 },
    ],
    rounds: r.rounds.map((x, i) =>
      i === 0 ? { ...x, order: [...x.order, 'team-new'], admittedTeams: ['team-new'] } : x,
    ),
  };
  const p = previewRound(deepFreeze(withNew), 'round-faith');
  assert.deepEqual(p.teamRoundScores, { 'team-1': 100, 'team-2': 0, 'team-new': 0 });
  assert.deepEqual(p.projectedTotals, { 'team-1': 100, 'team-2': 0, 'team-new': 0 });
  assert.deepEqual(p.memberPoints, {});
});

test('previewRound of a published round shows its frozen result, never counted twice', () => {
  const e = withPublished(workedExample(), 'round-skit');
  const p = previewRound(e, 'round-skit');
  assert.equal(p.teamRoundScores['team-1'], 600);
  assert.equal(p.projectedTotals['team-1'], 600);
  assert.deepEqual(p.memberPoints, { 'm-1-1': 25 });
});

test('previewRound before Briefing uses the teams admitted by then', () => {
  const e = eventWithTeams(3);
  const p = previewRound(e, 'round-faith');
  assert.deepEqual(p.teamRoundScores, { 'team-1': 0, 'team-2': 0, 'team-3': 0 });
  assert.deepEqual(previewRound(e, 'round-missing'), {
    teamRoundScores: {},
    projectedTotals: teamTotals(e),
    memberPoints: {},
  });
});
