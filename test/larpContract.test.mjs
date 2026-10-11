// The campfire game's shared contract (src/larp/types.js) and its fixtures
// (test/lib/larpFixtures.mjs): the five rounds' defaults add up to the design's 50-minute run
// for four teams and grow 6:00 per extra team; the catalogues have no repeats; the fixtures build
// events of the right shape and score the design's worked example; and the pure modules never
// reach for the browser, the clock or randomness, never opt out of the type check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMMAND_TYPES,
  DEFAULT_CONFIG,
  ERROR_CODES,
  GAME_EVENT_TYPES,
  HOST_GM_ID,
  JUDGING_OPEN_PHASES,
  ROUND_CATEGORIES,
  ROUND_KEYS,
  ROUND_PHASES,
  larpError,
} from '../src/larp/types.js';
import {
  atRound,
  blankEvent,
  commander,
  deepFreeze,
  eventWithTeams,
  makeClock,
  makeIds,
  makeRounds,
  rotatedQueue,
  withAwards,
  withPublished,
} from './lib/larpFixtures.mjs';

const MIN = 60_000;
/** The design's formula, by hand: opening + Σ [prep + teams × (turn + transition) + review] + finale + buffer. */
const estimateByHand = (teams) =>
  DEFAULT_CONFIG.openingMs +
  makeRounds().reduce((s, r) => s + r.prepMs + teams * (r.turnMs + r.transitionMs) + r.reviewRevealMs, 0) +
  DEFAULT_CONFIG.finaleMs +
  DEFAULT_CONFIG.bufferMs;

test('the five rounds: their order, bases (1,400 in all) and allowances', () => {
  assert.deepEqual(
    ROUND_CATEGORIES.map((c) => c.key),
    [...ROUND_KEYS],
  );
  assert.deepEqual(
    ROUND_CATEGORIES.map((c) => c.base),
    [100, 200, 300, 500, 300],
  );
  assert.equal(
    ROUND_CATEGORIES.reduce((s, c) => s + c.base, 0),
    1400,
  );
  assert.deepEqual(
    ROUND_CATEGORIES.map((c) => [c.prepMs / 1000, c.turnMs / 1000]),
    [
      [90, 45],
      [120, 60],
      [120, 60],
      [240, 90],
      [120, 30],
    ],
  );
  for (const [i, c] of ROUND_CATEGORIES.entries()) {
    assert.equal(c.transitionMs, 15_000);
    assert.equal(c.reviewRevealMs, i === 0 ? 30_000 : 60_000);
    assert.ok(c.vi && c.en && c.prompt, `${c.key} has its names and a prompt`);
  }
  assert.deepEqual(
    ROUND_CATEGORIES.filter((c) => c.calm).map((c) => c.key),
    ['prayer'],
  );
  assert.ok(Object.isFrozen(ROUND_CATEGORIES) && Object.isFrozen(ROUND_CATEGORIES[0]));
});

test('the defaults run four teams in exactly 50:00, and each extra team adds 6:00', () => {
  assert.equal(DEFAULT_CONFIG.targetMs, 50 * MIN);
  assert.equal(estimateByHand(4), 50 * MIN);
  assert.equal(estimateByHand(5), 56 * MIN);
  assert.equal(estimateByHand(6), 62 * MIN);
});

test('the catalogues: no repeats; judging is open in Preparation and Performances only', () => {
  for (const list of [COMMAND_TYPES, ERROR_CODES, GAME_EVENT_TYPES, ROUND_PHASES]) {
    assert.equal(new Set(list).size, list.length);
  }
  assert.deepEqual([...JUDGING_OPEN_PHASES], ['preparation', 'performances']);
  for (const type of ['addAward', 'editAward', 'removeAward', 'publishRound', 'addTeamMidGame', 'addCorrection']) {
    assert.ok(COMMAND_TYPES.includes(type), type);
  }
  // Judge Mode is UI-only.
  assert.equal(
    COMMAND_TYPES.some((t) => /judge/i.test(t)),
    false,
  );
  assert.deepEqual(larpError('forbidden', 'no', { field: 'x' }), { code: 'forbidden', message: 'no', field: 'x' });
});

test('fixtures: deterministic clock and ids; set-up events of any size, the same shape as a blank one', () => {
  const clock = makeClock(1000);
  assert.equal(clock.advance(500), 1500);
  assert.equal(clock.now(), 1500);
  const ids = makeIds('t');
  assert.deepEqual([ids('team'), ids('adj'), ids()], ['t-team-1', 't-adj-2', 't-id-3']);

  for (const n of [1, 4, 12, 100]) {
    const e = eventWithTeams(n, { membersPerTeam: 3, gms: 2 });
    assert.deepEqual(Object.keys(e).sort(), Object.keys(blankEvent()).sort());
    assert.equal(e.teams.length, n);
    assert.equal(e.roster.length, 3 * n);
    assert.equal(new Set(e.teams.map((t) => t.id)).size, n);
    assert.deepEqual(
      e.gms.map((g) => g.id),
      [HOST_GM_ID, 'gm-1', 'gm-2'],
    );
    assert.equal(e.phase, 'setup');
  }
  const host = commander({ clock }).host('nextTeam');
  assert.deepEqual(host, { id: 'cmd-1', type: 'nextTeam', actorId: HOST_GM_ID, mode: 'host', payload: {}, at: 1500 });
});

test('fixtures: the queue rotates each round; the worked example publishes 600 and leaves Mai’s 25 apart', () => {
  const e = eventWithTeams(4, { membersPerTeam: 2 });
  assert.deepEqual(rotatedQueue(e.teams, 0), ['team-1', 'team-2', 'team-3', 'team-4']);
  assert.deepEqual(rotatedQueue(e.teams, 1), ['team-2', 'team-3', 'team-4', 'team-1']);
  assert.deepEqual(rotatedQueue(e.teams, 5), ['team-2', 'team-3', 'team-4', 'team-1']);

  const skit = deepFreeze(
    withAwards(atRound(e, 3, 'review'), [
      { recipientId: 'team-1', name: 'Cùng Nhau Tỏa Sáng', points: 75 },
      { recipientId: 'team-1', name: 'Sáng Tạo', points: 50 },
      { recipientId: 'team-1', name: 'Quá Giờ', points: -25 },
      { recipientType: 'member', recipientId: 'm-1-1', name: 'Clear Narration', points: 25 },
    ]),
  );
  const published = withPublished(skit, 'round-skit');
  const [result] = published.results;
  assert.equal(result.teamRoundScores['team-1'], 600);
  assert.equal(result.teamRoundScores['team-2'], 500);
  assert.equal(result.adjustments.find((a) => a.recipientType === 'member').teamId, 'team-1');
  assert.ok(published.adjustments.every((a) => a.status === 'published'));
});

// The Stage 1 modules are pure: time and ids are injected, storage is handed in.
const PURE = ['types', 'strings', 'config', 'scoring', 'phases', 'roles', 'store', 'state'];
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('the pure game modules: no browser globals, clock, randomness or three.js, and they type-check', () => {
  for (const name of PURE) {
    const src = readFileSync(new URL(`../src/larp/${name}.js`, import.meta.url), 'utf8');
    const body = code(src);
    assert.doesNotMatch(src, /@ts-nocheck/, `${name}.js opts out of the type check`);
    assert.doesNotMatch(
      body,
      /\b(window|document|localStorage|sessionStorage|navigator|indexedDB|BroadcastChannel)\b/,
      `${name}.js uses a browser global`,
    );
    assert.doesNotMatch(
      body,
      /\bDate\.now\(|\bnew Date\(\)|\bMath\.random\(|\bperformance\.now\(/,
      `${name}.js reads a clock`,
    );
    assert.doesNotMatch(body, /from\s+['"]three|bonfire\//, `${name}.js imports the scene`);
  }
});
