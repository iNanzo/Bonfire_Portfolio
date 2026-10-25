// The campfire game's configuration rules (src/larp/config.js): the five default rounds, the
// design's schedule estimate (50:00 for four teams, +6:00 per extra team, skipped rounds left
// out, overrun shown, never a team limit), the performance queue that rotates the first performer
// each round and includes every team (1, 4, 12 and 100), team colors and emblems that cycle
// forever, and the team, member and GM input checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultRounds,
  emblem,
  estimate,
  performanceQueue,
  teamColor,
  validateGm,
  validateMember,
  validateTeam,
} from '../src/larp/config.js';
import { DEFAULT_CONFIG, EMBLEMS, ERROR_CODES, LIMITS, ROUND_CATEGORIES, TEAM_COLORS } from '../src/larp/types.js';
import { deepFreeze, eventWithTeams, makeRounds, rotatedQueue } from './lib/larpFixtures.mjs';

const MIN = 60_000;
const SEC = 1000;

/** The estimate's input at the defaults. */
const defaults = (rounds = defaultRounds()) => ({
  rounds,
  targetMs: DEFAULT_CONFIG.targetMs,
  openingMs: DEFAULT_CONFIG.openingMs,
  finaleMs: DEFAULT_CONFIG.finaleMs,
  bufferMs: DEFAULT_CONFIG.bufferMs,
});

// ---------------------------------------------------------------------------------------------
// defaultRounds

test('defaultRounds: five rounds in play order with the catalogue defaults and empty state', () => {
  const rounds = defaultRounds();
  assert.deepEqual(rounds, makeRounds());
  assert.deepEqual(
    rounds.map((r) => r.id),
    ['round-faith', 'round-dance', 'round-prayer', 'round-skit', 'round-cheer'],
  );
  assert.equal(
    rounds.reduce((s, r) => s + r.base, 0),
    1400,
  );
});

test('defaultRounds: every call gives fresh, mutable records (no shared arrays between events)', () => {
  const a = defaultRounds();
  const b = defaultRounds();
  assert.notEqual(a, b);
  for (let i = 0; i < a.length; i++) {
    assert.notEqual(a[i], b[i]);
    assert.notEqual(a[i].order, b[i].order);
    assert.notEqual(a[i].statuses, b[i].statuses);
    assert.notEqual(a[i].admittedTeams, b[i].admittedTeams);
    assert.ok(!Object.isFrozen(a[i]));
  }
  a[0].order.push('team-1');
  a[0].statuses['team-1'] = 'complete';
  a[1].base = 999;
  assert.deepEqual(defaultRounds(), makeRounds(), 'editing one set never leaks into the next');
  assert.equal(ROUND_CATEGORIES[1].base, 200);
});

// ---------------------------------------------------------------------------------------------
// estimate

test('estimate: four teams at the defaults is exactly 50:00 with no overrun', () => {
  const e = estimate(defaults(), 4);
  assert.equal(e.totalMs, 50 * MIN);
  assert.equal(e.targetMs, 50 * MIN);
  assert.equal(e.overrunMs, 0);
});

test('estimate: per-round rows match the design table (6:00, 8:00, 8:00, 12:00, 6:00 at four teams)', () => {
  const e = estimate(defaults(), 4);
  assert.deepEqual(e.perRound, [
    { roundId: 'round-faith', category: 'faith', ms: 6 * MIN },
    { roundId: 'round-dance', category: 'dance', ms: 8 * MIN },
    { roundId: 'round-prayer', category: 'prayer', ms: 8 * MIN },
    { roundId: 'round-skit', category: 'skit', ms: 12 * MIN },
    { roundId: 'round-cheer', category: 'cheer', ms: 6 * MIN },
  ]);
  const fixed = DEFAULT_CONFIG.openingMs + DEFAULT_CONFIG.finaleMs + DEFAULT_CONFIG.bufferMs;
  assert.equal(fixed + e.perRound.reduce((s, r) => s + r.ms, 0), e.totalMs);
});

test('estimate: 5 and 6 teams are 56:00 and 62:00, and each extra team adds exactly 6:00', () => {
  assert.equal(estimate(defaults(), 5).totalMs, 56 * MIN);
  assert.equal(estimate(defaults(), 6).totalMs, 62 * MIN);
  for (let n = 0; n < 30; n++) {
    assert.equal(estimate(defaults(), n + 1).totalMs - estimate(defaults(), n).totalMs, 6 * MIN, `team ${n + 1}`);
  }
});

test('estimate: the overrun is shown plainly and never negative', () => {
  assert.equal(estimate(defaults(), 5).overrunMs, 6 * MIN);
  assert.equal(estimate(defaults(), 6).overrunMs, 12 * MIN);
  const under = estimate(defaults(), 2);
  assert.equal(under.totalMs, 38 * MIN);
  assert.equal(under.overrunMs, 0);
  const longer = estimate({ ...defaults(), targetMs: 60 * MIN }, 5);
  assert.equal(longer.targetMs, 60 * MIN);
  assert.equal(longer.overrunMs, 0);
});

test('estimate: no team limit; 100 teams still estimate (and grow linearly)', () => {
  const e = estimate(defaults(), 100);
  assert.equal(e.totalMs, 50 * MIN + 96 * 6 * MIN);
  assert.equal(e.overrunMs, 96 * 6 * MIN);
  assert.equal(e.perRound.length, 5);
});

test('estimate: zero teams leaves only the fixed segments and each round prep + review', () => {
  const e = estimate(defaults(), 0);
  const prepAndReview = ROUND_CATEGORIES.reduce((s, c) => s + c.prepMs + c.reviewRevealMs, 0);
  assert.equal(e.totalMs, 10 * MIN + prepAndReview);
});

test('estimate: a skipped round counts 0 ms and drops out of the total', () => {
  const rounds = defaultRounds().map((r) => (r.category === 'skit' ? { ...r, skipped: true } : r));
  const e = estimate(defaults(rounds), 4);
  assert.equal(e.totalMs, 38 * MIN);
  assert.deepEqual(
    e.perRound.map((r) => r.ms),
    [6 * MIN, 8 * MIN, 8 * MIN, 0, 6 * MIN],
  );
  // And a skipped round no longer grows with the team count: 4:45 - 1:30 - 0:15 per team.
  assert.equal(estimate(defaults(rounds), 5).totalMs - e.totalMs, 6 * MIN - 105 * SEC);
});

test('estimate: follows every edited allowance and fixed segment', () => {
  const rounds = defaultRounds().map((r, i) =>
    i === 0 ? { ...r, prepMs: 60 * SEC, turnMs: 30 * SEC, transitionMs: 10 * SEC, reviewRevealMs: 20 * SEC } : r,
  );
  const input = { ...defaults(rounds), openingMs: 4 * MIN, finaleMs: 2 * MIN, bufferMs: 0 };
  const e = estimate(input, 3);
  // Round 1: 60 + 3 × 40 + 20 = 200 s; the rest at the defaults for three teams.
  assert.equal(e.perRound[0].ms, 200 * SEC);
  const rest = ROUND_CATEGORIES.slice(1).reduce(
    (s, c) => s + c.prepMs + 3 * (c.turnMs + c.transitionMs) + c.reviewRevealMs,
    0,
  );
  assert.equal(e.totalMs, 6 * MIN + 200 * SEC + rest);
});

test('estimate: never mutates its input and keeps the rounds order (including reordered rounds)', () => {
  const rounds = deepFreeze(defaultRounds().reverse());
  const input = deepFreeze(defaults(rounds));
  const e = estimate(input, 4);
  assert.deepEqual(
    e.perRound.map((r) => r.category),
    ['cheer', 'skit', 'prayer', 'dance', 'faith'],
  );
  assert.equal(e.totalMs, 50 * MIN);
});

test('estimate: a bad team count (negative, fractional, NaN) is treated as zero or whole teams', () => {
  const zero = estimate(defaults(), 0).totalMs;
  assert.equal(estimate(defaults(), -3).totalMs, zero);
  assert.equal(estimate(defaults(), Number.NaN).totalMs, zero);
  assert.equal(estimate(defaults(), 4.7).totalMs, 50 * MIN);
});

// ---------------------------------------------------------------------------------------------
// performanceQueue

for (const n of [1, 4, 12, 100]) {
  test(`performanceQueue: ${n} team(s): every team exactly once in every round, rotated by round`, () => {
    const event = deepFreeze(eventWithTeams(n));
    const firsts = [];
    for (let i = 0; i < event.rounds.length; i++) {
      const queue = performanceQueue(event.rounds[i], event.teams, i);
      assert.equal(queue.length, n);
      assert.equal(new Set(queue).size, n);
      assert.deepEqual([...queue].sort(), event.teams.map((t) => t.id).sort());
      assert.deepEqual(queue, rotatedQueue(event.teams, i));
      firsts.push(queue[0]);
    }
    if (n >= 5) assert.equal(new Set(firsts).size, 5, 'a different team opens each of the five rounds');
  });
}

test('performanceQueue: four teams open 1, 2, 3, 4, 1 and keep their cyclic order', () => {
  const { teams, rounds } = eventWithTeams(4);
  assert.deepEqual(performanceQueue(rounds[0], teams, 0), ['team-1', 'team-2', 'team-3', 'team-4']);
  assert.deepEqual(performanceQueue(rounds[1], teams, 1), ['team-2', 'team-3', 'team-4', 'team-1']);
  assert.deepEqual(performanceQueue(rounds[2], teams, 2), ['team-3', 'team-4', 'team-1', 'team-2']);
  assert.deepEqual(performanceQueue(rounds[3], teams, 3), ['team-4', 'team-1', 'team-2', 'team-3']);
  assert.deepEqual(performanceQueue(rounds[4], teams, 4), ['team-1', 'team-2', 'team-3', 'team-4']);
});

test('performanceQueue: a team admitted later is left out until its round, then rotates in', () => {
  const event = eventWithTeams(3);
  const teams = [...event.teams, { ...event.teams[0], id: 'team-late', name: 'Muộn', admittedRound: 2 }];
  assert.deepEqual(performanceQueue(event.rounds[1], teams, 1), ['team-2', 'team-3', 'team-1']);
  assert.deepEqual(performanceQueue(event.rounds[2], teams, 2), ['team-3', 'team-late', 'team-1', 'team-2']);
  assert.ok(performanceQueue(event.rounds[3], teams, 3).includes('team-late'));
});

test('performanceQueue: no teams (or none admitted yet) gives an empty queue', () => {
  const { rounds } = eventWithTeams(0);
  assert.deepEqual(performanceQueue(rounds[0], [], 0), []);
  const late = eventWithTeams(2).teams.map((t) => ({ ...t, admittedRound: 3 }));
  assert.deepEqual(performanceQueue(rounds[0], late, 0), []);
});

test('performanceQueue: returns a new array and never mutates the teams', () => {
  const event = deepFreeze(eventWithTeams(4));
  const q = performanceQueue(event.rounds[0], event.teams, 0);
  q.push('x');
  assert.equal(performanceQueue(event.rounds[0], event.teams, 0).length, 4);
});

// ---------------------------------------------------------------------------------------------
// teamColor / emblem

test('teamColor and emblem: follow the palette in order, then cycle without a limit', () => {
  for (let i = 0; i < TEAM_COLORS.length; i++) assert.equal(teamColor(i), TEAM_COLORS[i]);
  for (let i = 0; i < EMBLEMS.length; i++) assert.equal(emblem(i), EMBLEMS[i]);
  assert.equal(teamColor(TEAM_COLORS.length), TEAM_COLORS[0]);
  assert.equal(emblem(EMBLEMS.length + 2), EMBLEMS[2]);
  for (let i = 0; i < 1000; i++) {
    assert.match(teamColor(i), /^#[0-9a-f]{6}$/i);
    assert.ok(EMBLEMS.includes(emblem(i)));
  }
  assert.equal(teamColor(99), TEAM_COLORS[99 % TEAM_COLORS.length]);
});

test('teamColor and emblem: odd indexes (negative, fractional, NaN) still give a valid entry', () => {
  for (const i of [-1, -9, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.ok(TEAM_COLORS.includes(teamColor(i)), `color for ${i}`);
    assert.ok(EMBLEMS.includes(emblem(i)), `emblem for ${i}`);
  }
  assert.equal(teamColor(-1), TEAM_COLORS[TEAM_COLORS.length - 1]);
});

// ---------------------------------------------------------------------------------------------
// validateTeam

/** @param {import('../src/larp/types.js').LarpError|null} err */
const code = (err) => err && err.code;

test('validateTeam: a full valid team, and a name-only one, pass', () => {
  assert.equal(
    validateTeam({
      name: 'Đội Phaolô',
      translation: 'Team Paul',
      patron: 'Thánh Phaolô',
      color: '#E8B04A',
      emblem: 'dove',
    }),
    null,
  );
  assert.equal(validateTeam({ name: 'Đội Phêrô' }), null);
});

test('validateTeam: a blank, whitespace-only or missing name is invalid_name on field name', () => {
  for (const name of ['', '   ', '\t\n', ' ', undefined, null]) {
    const err = validateTeam({ name });
    assert.equal(code(err), 'invalid_name', JSON.stringify(name));
    assert.equal(err?.field, 'name');
  }
  assert.equal(code(validateTeam({})), 'invalid_name');
});

test('validateTeam: the name cap counts code points after trimming and collapsing spaces', () => {
  const max = LIMITS.teamName;
  assert.equal(validateTeam({ name: 'a'.repeat(max) }), null);
  assert.equal(code(validateTeam({ name: 'a'.repeat(max + 1) })), 'invalid_name');
  assert.equal(validateTeam({ name: `   ${'a'.repeat(max)}   ` }), null, 'outer spaces are trimmed');
  assert.equal(
    validateTeam({ name: `${'a'.repeat(max / 2)}      ${'b'.repeat(max / 2 - 1)}` }),
    null,
    'inner runs collapse',
  );
  // Vietnamese typed decomposed (NFD) counts as its composed letters.
  const decomposed = 'ệ'.normalize('NFD').repeat(max);
  assert.equal(decomposed.length, 3 * max);
  assert.equal(validateTeam({ name: decomposed }), null);
  // Emoji count as one character each.
  assert.equal(validateTeam({ name: '🔥'.repeat(max) }), null);
  assert.equal(code(validateTeam({ name: '🔥'.repeat(max + 1) })), 'invalid_name');
});

test('validateTeam: a non-string name or a non-object input is bad_payload', () => {
  assert.equal(code(validateTeam({ name: 42 })), 'bad_payload');
  assert.equal(code(validateTeam({ name: ['x'] })), 'bad_payload');
  assert.equal(code(validateTeam(/** @type {any} */ (null))), 'bad_payload');
  assert.equal(code(validateTeam(/** @type {any} */ ('Đội'))), 'bad_payload');
  assert.equal(code(validateTeam(/** @type {any} */ ([]))), 'bad_payload');
});

test('validateTeam: translation and patron are optional, may be blank, and are capped', () => {
  assert.equal(validateTeam({ name: 'A', translation: '', patron: '' }), null);
  assert.equal(validateTeam({ name: 'A', translation: 't'.repeat(LIMITS.teamTranslation) }), null);
  let err = validateTeam({ name: 'A', translation: 't'.repeat(LIMITS.teamTranslation + 1) });
  assert.equal(code(err), 'invalid_text');
  assert.equal(err?.field, 'translation');
  err = validateTeam({ name: 'A', patron: 'p'.repeat(LIMITS.patron + 1) });
  assert.equal(code(err), 'invalid_text');
  assert.equal(err?.field, 'patron');
  assert.equal(code(validateTeam({ name: 'A', patron: 7 })), 'bad_payload');
  assert.equal(code(validateTeam({ name: 'A', translation: false })), 'bad_payload');
});

test('validateTeam: color must be #rrggbb and emblem one of the emblems', () => {
  for (const color of ['#e8b04a', '#E8B04A', '#000000']) assert.equal(validateTeam({ name: 'A', color }), null);
  for (const color of ['e8b04a', '#e8b', '#e8b04a00', 'red', '#gggggg', '', 5]) {
    const err = validateTeam({ name: 'A', color });
    assert.equal(code(err), 'bad_payload', String(color));
    assert.equal(err?.field, 'color');
  }
  for (const e of EMBLEMS) assert.equal(validateTeam({ name: 'A', emblem: e }), null);
  const err = validateTeam({ name: 'A', emblem: /** @type {any} */ ('skull') });
  assert.equal(code(err), 'bad_payload');
  assert.equal(err?.field, 'emblem');
});

test('validateTeam: partial edits skip missing fields but still check the ones given', () => {
  assert.equal(validateTeam({}, true), null);
  assert.equal(validateTeam({ color: '#5fa8d3' }, true), null);
  assert.equal(validateTeam({ translation: 'Team Peter' }, true), null);
  assert.equal(code(validateTeam({ name: '  ' }, true)), 'invalid_name', 'an edit may not blank the name');
  assert.equal(code(validateTeam({ color: 'blue' }, true)), 'bad_payload');
  assert.equal(code(validateTeam({ patron: 'p'.repeat(LIMITS.patron + 1) }, true)), 'invalid_text');
});

test('validateTeam: every code it returns is a contract error code', () => {
  const inputs = [{}, { name: 1 }, { name: 'A', color: 'x' }, { name: 'A', translation: 'x'.repeat(99) }];
  for (const input of inputs) assert.ok(ERROR_CODES.includes(/** @type {any} */ (code(validateTeam(input)))));
});

// ---------------------------------------------------------------------------------------------
// validateMember

test('validateMember: a valid member passes, captain optional', () => {
  const event = deepFreeze(eventWithTeams(3));
  assert.equal(validateMember({ name: 'Anna', teamId: 'team-2' }, event), null);
  assert.equal(validateMember({ name: 'Bảo', teamId: 'team-3', captain: true }, event), null);
  assert.equal(validateMember({ name: 'Chi', teamId: 'team-1', captain: false }, event), null);
});

test('validateMember: name blank or too long is invalid_name', () => {
  const event = eventWithTeams(1);
  assert.equal(code(validateMember({ name: ' ', teamId: 'team-1' }, event)), 'invalid_name');
  assert.equal(code(validateMember({ teamId: 'team-1' }, event)), 'invalid_name');
  assert.equal(validateMember({ name: 'm'.repeat(LIMITS.memberName), teamId: 'team-1' }, event), null);
  assert.equal(
    code(validateMember({ name: 'm'.repeat(LIMITS.memberName + 1), teamId: 'team-1' }, event)),
    'invalid_name',
  );
});

test('validateMember: the team must exist (not_found), be given (bad_payload) and be a string', () => {
  const event = eventWithTeams(2);
  let err = validateMember({ name: 'Anna', teamId: 'team-9' }, event);
  assert.equal(code(err), 'not_found');
  assert.equal(err?.field, 'teamId');
  assert.deepEqual(err?.ids, ['team-9']);
  err = validateMember({ name: 'Anna' }, event);
  assert.equal(code(err), 'bad_payload');
  assert.equal(err?.field, 'teamId');
  assert.equal(code(validateMember({ name: 'Anna', teamId: 2 }, event)), 'bad_payload');
  assert.equal(code(validateMember({ name: 'Anna', teamId: 'team-1' }, eventWithTeams(0))), 'not_found');
});

test('validateMember: captain must be a boolean when given; non-object input is bad_payload', () => {
  const event = eventWithTeams(1);
  const err = validateMember({ name: 'A', teamId: 'team-1', captain: /** @type {any} */ ('yes') }, event);
  assert.equal(code(err), 'bad_payload');
  assert.equal(err?.field, 'captain');
  assert.equal(code(validateMember(/** @type {any} */ (undefined), event)), 'bad_payload');
});

test('validateMember: partial edits check only what is given', () => {
  const event = eventWithTeams(2);
  assert.equal(validateMember({}, event, true), null);
  assert.equal(validateMember({ captain: true }, event, true), null);
  assert.equal(validateMember({ teamId: 'team-2' }, event, true), null);
  assert.equal(code(validateMember({ teamId: 'nope' }, event, true)), 'not_found');
  assert.equal(code(validateMember({ name: '' }, event, true)), 'invalid_name');
});

test('validateMember: finds teams among 100', () => {
  const event = eventWithTeams(100);
  assert.equal(validateMember({ name: 'Z', teamId: 'team-100' }, event), null);
});

// ---------------------------------------------------------------------------------------------
// validateGm

test('validateGm: a name is required and capped', () => {
  assert.equal(validateGm({ name: 'Anh Minh' }), null);
  assert.equal(validateGm({ name: 'g'.repeat(LIMITS.gmName) }), null);
  for (const input of [{ name: '' }, { name: '   ' }, {}, { name: 'g'.repeat(LIMITS.gmName + 1) }]) {
    const err = validateGm(input);
    assert.equal(code(err), 'invalid_name', JSON.stringify(input));
    assert.equal(err?.field, 'name');
  }
  assert.equal(code(validateGm({ name: /** @type {any} */ (3) })), 'bad_payload');
  assert.equal(code(validateGm(/** @type {any} */ (null))), 'bad_payload');
});
