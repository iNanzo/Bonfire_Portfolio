// Saving the campfire game (src/larp/store.js): a game comes back as it was saved, a save it
// can't read is copied aside and never written over, the first version's event ('larp.event')
// loads with its teams, rounds and points, export files round-trip, and storage that throws only
// stops the saving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, scores, newGame } from '../src/larp/game.js';
import {
  ASIDE_KEY,
  FILE_APP,
  fromOldEvent,
  gameFile,
  loadGame,
  OLD_KEY,
  readGameFile,
  saveGame,
  STORE_KEY,
} from '../src/larp/store.js';

let n = 0;
const env = { now: 1_700_000_000_000, newId: () => `s${++n}` };
function memory(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), map: m };
}

test('store: nothing saved gives a new game; a saved one comes back as it was', () => {
  const s = memory();
  assert.equal(loadGame(s, env).from, 'new');
  let g = newGame(env);
  g = reduce(g, { type: 'award', teamId: g.teams[1].id, points: 15 }, env);
  g = reduce(g, { type: 'timer', op: 'toggle' }, env);
  assert.equal(saveGame(s, g), true);
  const back = loadGame(s, env);
  assert.equal(back.from, 'saved');
  assert.deepEqual(back.game, g);
});

test('store: a save it can’t read is copied aside, never written over', () => {
  for (const text of ['{broken', JSON.stringify({ v: 99, teams: [] }), 'null']) {
    const s = memory({ [STORE_KEY]: text });
    const r = loadGame(s, env);
    assert.equal(r.from, 'unreadable');
    assert.equal(s.map.get(ASIDE_KEY), text);
    assert.ok(r.game.teams.length);
  }
});

/** The first version's event, as its store.js saved it (schema 1), trimmed to what's read. */
const OLD_EVENT = {
  id: 'ev1',
  schemaVersion: 1,
  config: { title: 'Lửa Trại', displayMode: 'bilingual', hostLang: 'en' },
  teams: [
    {
      id: 'tA',
      name: 'Đội Phêrô',
      translation: 'Team Peter',
      color: '#e8b04a',
      emblem: 'shield',
      patron: '',
      admittedRound: 0,
    },
    { id: 'tB', name: 'Đội Phaolô', translation: '', color: '#5fa8d3', emblem: 'star', patron: '', admittedRound: 0 },
  ],
  roster: [{ id: 'm1', name: 'An', teamId: 'tA', captain: true }],
  rounds: [
    { id: 'r1', category: 'faith', prepMs: 90_000, turnMs: 45_000, skipped: false },
    { id: 'r2', category: 'dance', prepMs: 120_000, turnMs: 60_000, skipped: true },
    { id: 'r3', category: 'cheer', prepMs: 60_000, turnMs: 30_000, skipped: false },
  ],
  results: [{ roundId: 'r1', teamRoundScores: { tA: 120, tB: 100 } }],
  corrections: [{ teamId: 'tB', points: -10 }],
};

test('store: the first version’s event loads with its teams, rounds and points', () => {
  const s = memory({ [OLD_KEY]: JSON.stringify(OLD_EVENT) });
  const { game, from } = loadGame(s, env);
  assert.equal(from, 'old');
  assert.deepEqual(
    game.teams.map((t) => [t.id, t.name, t.color]),
    [
      ['tA', 'Team Peter', '#e8b04a'],
      ['tB', 'Đội Phaolô', '#5fa8d3'],
    ],
  );
  assert.deepEqual(
    game.rounds.map((r) => [r.name, r.durationMs]),
    [
      ['Faith Discovery', 90_000],
      ['Team Cheer', 60_000],
    ],
  );
  assert.equal(scores(game).get('tA'), 120);
  assert.equal(scores(game).get('tB'), 90);
  assert.equal(game.title, 'Lửa Trại');
  assert.equal(s.map.get(OLD_KEY), JSON.stringify(OLD_EVENT), 'the old key is left as it was');
  assert.equal(fromOldEvent({ nope: 1 }), null);
  assert.equal(loadGame(memory({ [OLD_KEY]: '{bad' }), env).from, 'new');
});

test('store: a new save wins over the first version’s event', () => {
  const g = newGame(env);
  const s = memory({ [OLD_KEY]: JSON.stringify(OLD_EVENT), [STORE_KEY]: JSON.stringify(g) });
  assert.equal(loadGame(s, env).from, 'saved');
});

test('store: a failed backup prevents overwriting an unreadable save, and saving can recover', () => {
  for (const original of ['{broken', JSON.stringify({ v: 99, teams: [] })]) {
    const s = memory({ [STORE_KEY]: original });
    const setItem = s.setItem;
    s.setItem = (key, value) => {
      if (key === ASIDE_KEY) throw new Error('quota exceeded');
      setItem(key, value);
    };
    const loaded = loadGame(s, env);
    assert.equal(loaded.from, 'unreadable');
    assert.equal(saveGame(s, loaded.game), false);
    assert.equal(s.map.get(STORE_KEY), original, 'the only copy survives a failed backup');
    assert.equal(s.map.has(ASIDE_KEY), false);

    s.setItem = setItem;
    assert.equal(saveGame(s, loaded.game), true);
    assert.equal(s.map.get(ASIDE_KEY), original, 'the backup is written before replacement');
    assert.deepEqual(loadGame(s, env).game, loaded.game);
  }
});

test('store: export files round-trip; anything else is refused', () => {
  const g = newGame(env);
  const file = JSON.stringify(gameFile(g));
  assert.equal(JSON.parse(file).app, FILE_APP);
  assert.deepEqual(readGameFile(file, env), g);
  assert.deepEqual(readGameFile(JSON.stringify(g), env), g, 'a bare game too');
  for (const bad of ['', '{', '[]', JSON.stringify({ app: FILE_APP, game: { v: 9, teams: [] } }), '{"title":"x"}'])
    assert.equal(readGameFile(bad, env), null);
});

test('store: storage that throws or is missing only stops the saving', () => {
  const boom = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('full');
    },
  };
  assert.equal(loadGame(boom, env).from, 'new');
  assert.equal(saveGame(boom, newGame(env)), false);
  assert.equal(loadGame(null, env).from, 'new');
  assert.equal(saveGame(null, newGame(env)), false);
});
