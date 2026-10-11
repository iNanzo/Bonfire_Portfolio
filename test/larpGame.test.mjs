// The campfire game's state (src/larp/game.js): scores as the log's sums, multipliers that
// count from the moment they're given to the end of that round for that team, undo, the setup
// lists (teams, rounds, modifiers) edited, moved and removed without losing anyone's points
// elsewhere, ties sharing a place, the round's timer, and any stored value cleaned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeMults,
  gainText,
  LIMITS,
  multOf,
  newGame,
  normalizeGame,
  reduce,
  scores,
  standings,
  TEAM_COLORS,
} from '../src/larp/game.js';

let n = 0;
const env = { now: 1_700_000_000_000, newId: () => `t${++n}` };
const fresh = () => newGame(env);
/** @param {any} g @param {any[]} actions */
const run = (g, actions) => actions.reduce((acc, a) => reduce(acc, a, env), g);
/** A modifier added with these values. */
function withModifier(g, values) {
  let next = reduce(g, { type: 'add', list: 'modifiers' }, env);
  const id = next.modifiers.at(-1).id;
  for (const [key, value] of Object.entries(values))
    next = reduce(next, { type: 'edit', list: 'modifiers', id, key, value }, env);
  return { game: next, id };
}

test('game: a new game has teams, rounds and modifiers, and every score at zero', () => {
  const g = fresh();
  assert.ok(g.teams.length >= 2);
  assert.ok(g.rounds.length >= 1);
  assert.ok(g.modifiers.length >= 1);
  assert.ok(
    g.modifiers.some((m) => m.special),
    'one modifier shows the knights off',
  );
  assert.ok(
    g.modifiers.some((m) => m.mult > 1),
    'one shows a multiplier',
  );
  assert.equal(g.roundIndex, 0);
  assert.equal(g.timer.durationMs, g.rounds[0].durationMs);
  for (const s of scores(g).values()) assert.equal(s, 0);
  assert.deepEqual(normalizeGame(g, env), g, 'a new game is already clean');
});

test('game: points from a modifier, by hand, and undo', () => {
  let g = fresh();
  const [red, blue] = g.teams;
  const { game, id } = withModifier(g, { title: 'Brave', subtitle: 'Well done', points: 30 });
  g = run(game, [
    { type: 'award', teamId: red.id, modId: id },
    { type: 'award', teamId: blue.id, points: -5 },
  ]);
  assert.equal(scores(g).get(red.id), 30);
  assert.equal(scores(g).get(blue.id), -5);
  const last = g.log.at(-1);
  assert.equal(last.title, 'Points', 'points by hand get a plain banner');
  assert.equal(g.log[0].title, 'Brave');
  assert.equal(g.log[0].subtitle, 'Well done');
  g = reduce(g, { type: 'undo' }, env);
  assert.equal(scores(g).get(blue.id), 0);
  assert.equal(reduce(fresh(), { type: 'undo' }, env).log.length, 0);
});

test('game: an award for no one, a missing modifier, or zero by hand changes nothing', () => {
  const g = fresh();
  assert.equal(reduce(g, { type: 'award', teamId: 'nobody', points: 5 }, env), g);
  assert.equal(reduce(g, { type: 'award', teamId: g.teams[0].id, modId: 'gone' }, env), g);
  assert.equal(reduce(g, { type: 'award', teamId: g.teams[0].id, points: 0 }, env), g);
});

test('game: a multiplier counts for its team from then to the end of the round', () => {
  let g = fresh();
  const [red, blue] = g.teams;
  const { game, id: double } = withModifier(g, { title: 'Double', points: 0, mult: 2 });
  g = run(game, [
    { type: 'award', teamId: red.id, points: 10 }, // before: 10
    { type: 'award', teamId: red.id, modId: double },
    { type: 'award', teamId: red.id, points: 10 }, // after: 20
    { type: 'award', teamId: blue.id, points: 10 }, // the other team: 10
  ]);
  assert.equal(scores(g).get(red.id), 30);
  assert.equal(scores(g).get(blue.id), 10);
  assert.equal(multOf(g, red.id), 2);
  assert.deepEqual(
    activeMults(g).map((x) => [x.team.id, x.mult]),
    [[red.id, 2]],
  );
  assert.equal(gainText(g.log[1]), '×2');
  assert.equal(gainText(g.log[2]), '+20');
  g = run(g, [
    { type: 'award', teamId: red.id, modId: double },
    { type: 'award', teamId: red.id, points: 5 },
  ]);
  assert.equal(g.log.at(-1).gain, 20, 'two doubles multiply');
  g = reduce(g, { type: 'round', index: 1 }, env);
  assert.equal(multOf(g, red.id), 1, 'a new round starts without');
  g = reduce(g, { type: 'award', teamId: red.id, points: 5 }, env);
  assert.equal(g.log.at(-1).gain, 5);
  assert.equal(activeMults(g).length, 0);
});

test('game: points and a multiplier together give the points at the old rate, then start it', () => {
  let g = fresh();
  const red = g.teams[0];
  const { game, id } = withModifier(g, { points: 10, mult: 3 });
  g = run(game, [
    { type: 'award', teamId: red.id, modId: id },
    { type: 'award', teamId: red.id, points: 1 },
  ]);
  assert.equal(g.log[0].gain, 10);
  assert.equal(gainText(g.log[0]), '+10 ×3');
  assert.equal(g.log[1].gain, 3);
});

test('game: a banner keeps what it gave when the modifier changes later', () => {
  let g = fresh();
  const { game, id } = withModifier(g, { title: 'Old', points: 10 });
  g = reduce(game, { type: 'award', teamId: g.teams[0].id, modId: id }, env);
  g = reduce(g, { type: 'edit', list: 'modifiers', id, key: 'points', value: 99 }, env);
  g = reduce(g, { type: 'edit', list: 'modifiers', id, key: 'title', value: 'New' }, env);
  assert.equal(scores(g).get(g.teams[0].id), 10);
  assert.equal(g.log[0].title, 'Old');
  g = reduce(g, { type: 'remove', list: 'modifiers', id }, env);
  assert.equal(scores(g).get(g.teams[0].id), 10, 'removing a modifier keeps its points');
});

test('game: standings by score, ties sharing a place', () => {
  let g = run(fresh(), [{ type: 'add', list: 'teams' }]);
  const [a, b, c] = g.teams;
  g = run(g, [
    { type: 'award', teamId: b.id, points: 20 },
    { type: 'award', teamId: c.id, points: 20 },
    { type: 'award', teamId: a.id, points: 5 },
  ]);
  assert.deepEqual(
    standings(g).map((r) => [r.team.id, r.score, r.place]),
    [
      [b.id, 20, 1],
      [c.id, 20, 1],
      [a.id, 5, 3],
    ],
  );
});

test('game: teams are added with an unused color, renamed, recolored, moved and removed', () => {
  let g = run(fresh(), [{ type: 'add', list: 'teams' }]);
  assert.equal(g.teams.length, 3);
  assert.equal(new Set(g.teams.map((t) => t.color)).size, 3);
  const t = g.teams[2];
  g = run(g, [
    { type: 'edit', list: 'teams', id: t.id, key: 'name', value: '  Gold  ' },
    { type: 'edit', list: 'teams', id: t.id, key: 'color', value: '#ABCDEF' },
    { type: 'edit', list: 'teams', id: t.id, key: 'color', value: 'red' },
    { type: 'edit', list: 'teams', id: t.id, key: 'name', value: '' },
  ]);
  assert.equal(g.teams[2].color, TEAM_COLORS[2], 'a bad color falls back to the team’s place');
  assert.match(g.teams[2].name, /\S/, 'a blank name gets one');
  g = reduce(g, { type: 'edit', list: 'teams', id: t.id, key: 'name', value: 'Gold' }, env);
  assert.equal(g.teams[2].name, 'Gold');
  g = reduce(g, { type: 'move', list: 'teams', id: t.id, by: -1 }, env);
  assert.equal(g.teams[1].id, t.id);
  g = run(g, [{ type: 'award', teamId: t.id, points: 5 }]);
  g = reduce(g, { type: 'remove', list: 'teams', id: t.id }, env);
  assert.equal(g.teams.length, 2);
  assert.equal(g.log.length, 0, 'its points go with it');
  assert.equal(reduce(g, { type: 'edit', list: 'teams', id: g.teams[0].id, key: 'id', value: 'x' }, env), g);
});

test('game: the last team and the last round stay; lists stop at their limits', () => {
  let g = fresh();
  g = reduce(g, { type: 'remove', list: 'teams', id: g.teams[0].id }, env);
  assert.equal(reduce(g, { type: 'remove', list: 'teams', id: g.teams[0].id }, env), g);
  let r = fresh();
  while (r.rounds.length > 1) r = reduce(r, { type: 'remove', list: 'rounds', id: r.rounds[0].id }, env);
  assert.equal(reduce(r, { type: 'remove', list: 'rounds', id: r.rounds[0].id }, env), r);
  let full = fresh();
  for (let i = 0; i < 20; i++) full = reduce(full, { type: 'add', list: 'teams' }, env);
  assert.equal(full.teams.length, LIMITS.teams);
});

test('game: changing round resets its timer to that round’s length; the timer toggles and takes more time', () => {
  let g = fresh();
  g = reduce(g, { type: 'edit', list: 'rounds', id: g.rounds[1].id, key: 'durationMs', value: 90_000 }, env);
  g = reduce(g, { type: 'timer', op: 'toggle' }, env);
  assert.equal(g.timer.status, 'running');
  g = reduce(g, { type: 'round', index: 1 }, env);
  assert.deepEqual([g.roundIndex, g.timer.status, g.timer.durationMs], [1, 'idle', 90_000]);
  assert.equal(reduce(g, { type: 'round', index: 1 }, env), g, 'the same round: nothing');
  assert.equal(reduce(g, { type: 'round', index: 99 }, env), g);
  g = reduce(g, { type: 'timer', op: 'add', ms: 60_000 }, env);
  assert.equal(g.timer.remainingMs, 150_000);
  g = reduce(g, { type: 'timer', op: 'reset' }, env);
  assert.equal(g.timer.remainingMs, 90_000);
  g = reduce(g, { type: 'edit', list: 'rounds', id: g.rounds[1].id, key: 'durationMs', value: 30_000 }, env);
  assert.equal(g.timer.remainingMs, 30_000, 'an idle timer follows its round’s new length');
});

test('game: removing or moving a round keeps every entry with its own round', () => {
  let g = fresh();
  const red = g.teams[0].id;
  g = run(g, [
    { type: 'award', teamId: red, points: 1 },
    { type: 'round', index: 1 },
    { type: 'award', teamId: red, points: 2 },
    { type: 'round', index: 2 },
    { type: 'award', teamId: red, points: 4 },
  ]);
  const moved = reduce(g, { type: 'move', list: 'rounds', id: g.rounds[2].id, by: -1 }, env);
  assert.equal(moved.roundIndex, 1, 'the round being played moves with it');
  assert.deepEqual(
    moved.log.map((e) => [e.gain, e.round]),
    [
      [1, 0],
      [2, 2],
      [4, 1],
    ],
  );
  const removed = reduce(g, { type: 'remove', list: 'rounds', id: g.rounds[1].id }, env);
  assert.deepEqual(
    removed.log.map((e) => [e.gain, e.round]),
    [
      [1, 0],
      [4, 1],
    ],
  );
  assert.equal(removed.roundIndex, 1);
  assert.equal(removed.rounds.length, 2);
});

test('game: each round keeps its own scene', () => {
  let g = fresh();
  g = reduce(g, { type: 'edit', list: 'rounds', id: g.rounds[0].id, key: 'scene', value: 'b:forge-rave' }, env);
  g = reduce(g, { type: 'edit', list: 'rounds', id: g.rounds[1].id, key: 'scene', value: 'm:my-scene' }, env);
  g = reduce(g, { type: 'edit', list: 'rounds', id: g.rounds[2].id, key: 'scene', value: 'javascript:alert(1)' }, env);
  assert.deepEqual(
    g.rounds.map((r) => r.scene),
    ['b:forge-rave', 'm:my-scene', null],
  );
});

test('game: settings are clamped; clearing scores keeps the setup', () => {
  let g = fresh();
  g = run(g, [
    { type: 'set', key: 'bannerMs', value: 999_999 },
    { type: 'set', key: 'knightCount', value: 0 },
    { type: 'set', key: 'title', value: 'Our Night' },
    { type: 'set', key: 'reducedMotion', value: true },
  ]);
  assert.equal(g.bannerMs, 10000);
  assert.equal(g.knightCount, 1);
  assert.equal(g.title, 'Our Night');
  assert.equal(g.reducedMotion, true);
  assert.equal(reduce(g, { type: 'set', key: 'teams', value: [] }, env), g);
  g = run(g, [
    { type: 'award', teamId: g.teams[0].id, points: 5 },
    { type: 'round', index: 2 },
    { type: 'clearScores' },
  ]);
  assert.deepEqual([g.log.length, g.roundIndex, g.teams.length], [0, 0, 2]);
});

test('game: any stored value comes back as a valid game', () => {
  for (const raw of [null, 7, 'x', [], { teams: 'no' }, { rounds: [] }]) {
    const g = normalizeGame(raw, env);
    assert.ok(g.teams.length && g.rounds.length);
  }
  const g = normalizeGame(
    {
      teams: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }, {}],
      rounds: [{ name: 'R', durationMs: -1, scene: 5 }],
      modifiers: [{ title: 'M', points: 1e9, mult: 77, reaction: 'nope' }],
      roundIndex: 9,
      log: [
        { teamId: 'a', gain: 5, round: 0 },
        { teamId: 'ghost', gain: 99 },
      ],
    },
    env,
  );
  assert.equal(new Set(g.teams.map((t) => t.id)).size, 3, 'repeated ids made unique');
  assert.deepEqual([g.rounds[0].durationMs, g.rounds[0].scene, g.roundIndex], [0, null, 0]);
  assert.deepEqual(
    [g.modifiers[0].points, g.modifiers[0].mult, g.modifiers[0].reaction],
    [LIMITS.points, LIMITS.mult, 'random'],
  );
  assert.equal(g.log.length, 1, 'an entry for a team that is gone is dropped');
  assert.equal(scores(g).get('a'), 5);
});
