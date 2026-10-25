// What the bonfire and the knights do for a banner (src/larp/reactions.js): a named reaction
// plays as asked, Random rolls a different one over time, Off does nothing, a loss is softer, a
// Special banner calls the knights in and they gesture once they've formed, knights who are
// already here gesture every time, and reduced motion keeps only a gentle stoke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHEERS, FORM_MS, LOSSES, REACTIONS, ROLLED, rollReaction, sizeOf } from '../src/larp/reactions.js';
import { GESTURES } from '../src/bonfire/knightGestures.js';

/** A repeatable random. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const gain = { points: 50, mult: 1 };

test('reactions: the choices start with Random and end with Off, and every rolled one is a choice', () => {
  const keys = Object.keys(REACTIONS);
  assert.equal(keys[0], 'random');
  assert.equal(keys.at(-1), 'off');
  for (const k of ROLLED) assert.ok(keys.includes(k));
  for (const name of [...CHEERS, ...LOSSES]) assert.ok(GESTURES.includes(name), `${name} is a knight's gesture`);
});

test('reactions: a named reaction plays as asked', () => {
  assert.deepEqual(
    rollReaction({ ...gain, reaction: 'ring' }, { rand: seeded() }).fire.map((c) => c.method),
    ['ring', 'sparkle'],
  );
  assert.deepEqual(
    rollReaction({ ...gain, reaction: 'pulse' }).fire.map((c) => c.method),
    ['pulse'],
  );
  const swap = rollReaction({ ...gain, reaction: 'swap' }, { element: 'fire', rand: seeded() }).fire[0];
  assert.equal(swap.method, 'swapElement');
  assert.notEqual(swap.args[0], 'fire', 'a swap goes to another element');
});

test('reactions: Random finds different reactions over time', () => {
  const rand = seeded(7);
  const kinds = new Set(Array.from({ length: 60 }, () => rollReaction(gain, { rand }).kind));
  assert.ok(kinds.size >= 4, `rolled ${[...kinds]}`);
  for (const k of kinds) assert.ok(ROLLED.includes(k));
});

test('reactions: Off does nothing, an unknown reaction counts as Random', () => {
  const off = rollReaction({ ...gain, reaction: 'off' }, { knightsHere: 2 });
  assert.deepEqual([off.fire, off.knights], [[], []]);
  assert.ok(ROLLED.includes(rollReaction({ ...gain, reaction: 'nope' }).kind));
});

test('reactions: bigger awards hit harder; a loss is softer and never rings', () => {
  assert.ok(sizeOf({ points: 100, mult: 1 }) > sizeOf({ points: 10, mult: 1 }));
  assert.ok(sizeOf({ points: 0, mult: 2 }) > 0, 'a multiplier counts');
  assert.equal(rollReaction({ points: 100, mult: 1, reaction: 'stoke' }).fire.length, 2, 'a big one stokes twice');
  const loss = rollReaction({ points: -10, mult: 1, reaction: 'ring' });
  assert.ok(!loss.fire.some((c) => c.method === 'ring'));
});

test('reactions: a Special banner calls the knights in, and they gesture once formed', () => {
  const r = rollReaction({ ...gain, special: true }, { knightsHere: 0, knightCount: 3, rand: seeded() });
  assert.deepEqual(r.knights[0], { method: 'setCast', args: [{ count: 3 }], delayMs: 0 });
  const gestures = r.knights.filter((c) => c.method === 'gesture');
  assert.equal(gestures.length, 3);
  assert.deepEqual(gestures.map((c) => c.args[1].index).sort(), [0, 1, 2], 'each knight once');
  for (const g of gestures) {
    assert.ok(g.delayMs >= FORM_MS);
    assert.ok(CHEERS.includes(g.args[0]));
  }
  const already = rollReaction({ ...gain, special: true }, { knightsHere: 3, knightCount: 3 });
  assert.ok(!already.knights.some((c) => c.method === 'setCast'), 'no second summons');
});

test('reactions: knights already here gesture at every banner, shrugging or bowing at a loss', () => {
  const none = rollReaction(gain, { knightsHere: 0 });
  assert.equal(none.knights.length, 0);
  const cheer = rollReaction(gain, { knightsHere: 2, rand: seeded() });
  assert.equal(cheer.knights.length, 2);
  assert.equal(cheer.knights[0].delayMs, 0);
  assert.ok(cheer.knights[1].delayMs > 0, 'one after the other');
  const loss = rollReaction({ points: -5, mult: 1 }, { knightsHere: 2, rand: seeded() });
  for (const c of loss.knights) assert.ok(LOSSES.includes(c.args[0]));
});

test('reactions: reduced motion keeps a gentle stoke and the knights coming, no gestures', () => {
  const r = rollReaction({ ...gain, special: true, reaction: 'ring' }, { reducedMotion: true, knightsHere: 0 });
  assert.deepEqual(
    r.fire.map((c) => c.method),
    ['stoke'],
  );
  assert.deepEqual(
    r.knights.map((c) => c.method),
    ['setCast'],
  );
});
