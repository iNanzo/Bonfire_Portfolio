// Bonfire Live's preset scenes in a loop (src/visualizer/sceneLoop.js): Off changes nothing,
// Always opens with a scene and changes on phrase lines (Change Every) and drops, In the mix
// leaves stretches of the free show; in turn or a shuffled deck that deals every scene before
// a repeat and never the same one twice running; "only on drops" changes on drops alone; the
// filters (Scenes From, The Loop, the admin's hidden ones); N and the solo lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSceneLoop, loopEntries, FREE_AFTER_SCENE } from '../src/visualizer/sceneLoop.js';
import { createBarClock } from '../src/visualizer/bars.js';
import { defaultScene } from '../src/scenes.js';
import { seeded } from './lib/fakeScene.mjs';

const entry = (ref, o = {}) => ({ ref, scene: { ...defaultScene(ref.slice(2)), ...o } });
const LIB = [entry('b:cathedral'), entry('b:frozen'), entry('m:rave'), entry('m:moonlit'), entry('b:ruins')];
function loopFor(over = {}, { library = LIB, seed = 5 } = {}) {
  const settings = { scenes: 'on', sceneFrom: 'both', sceneOrder: 'turn', sceneBars: 32, sceneList: {}, ...over };
  const rng = seeded(seed);
  const loop = createSceneLoop(settings, { library: () => library, clock: createBarClock(settings, rng), rng });
  return { settings, loop };
}
const refOf = (e) => (e && e !== 'free' ? e.ref : e);
/** Play `n` bars, asking at each line whether a change is due; returns the refs taken, in order. */
function run(loop, n, { dropsAt = [] } = {}) {
  const took = [];
  let bar = 0;
  for (let i = 1; i <= n; i++) {
    loop.bar();
    bar++;
    if (dropsAt.includes(i)) {
      bar = 0; // (the grid counts from the drop)
      if (loop.dropDue()) {
        const e = loop.advance();
        if (e) took.push(refOf(e));
      }
    } else if (loop.due(bar)) {
      const e = loop.advance();
      if (e) took.push(refOf(e));
    }
  }
  return took;
}

test('the filters: Scenes From, The Loop and the admin’s hidden ones', () => {
  const lib = [...LIB, entry('b:hidden', { hidden: true })];
  const refs = (o) => loopEntries(lib, { sceneFrom: 'both', sceneList: {}, ...o }).map((e) => e.ref);
  assert.deepEqual(refs({}), ['b:cathedral', 'b:frozen', 'm:rave', 'm:moonlit', 'b:ruins'], 'hidden stays out');
  assert.deepEqual(refs({ sceneFrom: 'builtin' }), ['b:cathedral', 'b:frozen', 'b:ruins']);
  assert.deepEqual(refs({ sceneFrom: 'mine' }), ['m:rave', 'm:moonlit']);
  assert.deepEqual(
    refs({ sceneList: { 'b:frozen': false, 'm:rave': true } }),
    ['b:cathedral', 'm:rave', 'm:moonlit', 'b:ruins'],
    'switched out of The Loop',
  );
  assert.deepEqual(loopEntries([null, { ref: 3 }, { ref: 'b:x' }], {}), [], 'junk');
});

test('Off: nothing at the start, on phrase lines or drops; a scene picked by hand carries on', () => {
  const { loop } = loopFor({ scenes: 'off' });
  assert.equal(loop.start(), null);
  assert.deepEqual(run(loop, 128, { dropsAt: [40, 80] }), []);
  assert.equal(loop.peek(), null);
  loop.jump(LIB[2]);
  assert.equal(refOf(loop.start()), 'm:rave', 'the hand-picked one plays on at the start');
  // N still works with Scenes off.
  assert.equal(refOf(loop.next()), 'm:moonlit');
});

test('Always, in turn: the first at the start, the next on every Change Every phrase line', () => {
  const { loop } = loopFor({ scenes: 'on', sceneBars: 32 });
  assert.equal(refOf(loop.start()), 'b:cathedral');
  const took = run(loop, 32 * 5);
  assert.deepEqual(
    took,
    ['b:frozen', 'm:rave', 'm:moonlit', 'b:ruins', 'b:cathedral'],
    'on bars 32, 64… in the library’s order, round again',
  );
  // ...and only on those lines.
  const { loop: l2 } = loopFor({ scenes: 'on', sceneBars: 16 });
  l2.start();
  let bar = 0;
  const lines = [];
  for (let i = 1; i <= 64; i++) {
    l2.bar();
    bar++;
    if (l2.due(bar)) {
      lines.push(bar);
      l2.advance();
    }
  }
  assert.deepEqual(lines, [16, 32, 48, 64]);
});

test('a drop brings the next once half a stretch has played; "only on drops" (0) changes on drops alone', () => {
  const { loop } = loopFor({ scenes: 'on', sceneBars: 32 });
  loop.start();
  // A drop 8 bars in: too soon. 20 bars after that: due.
  assert.deepEqual(run(loop, 8, { dropsAt: [8] }), []);
  assert.deepEqual(run(loop, 20, { dropsAt: [20] }), ['b:frozen']);
  // A breakdown's forge asks ahead (its drop some 8 bars off); the stretch counts from the arrival.
  const { loop: ahead } = loopFor({ scenes: 'on', sceneBars: 32 });
  ahead.start();
  for (let i = 0; i < 10; i++) ahead.bar();
  assert.equal(ahead.dropDue(), false, '10 bars in');
  assert.equal(ahead.dropDue(8), true, '...but 18 by the drop 8 bars off');
  // The forecast is only that: the drop itself deals the scene once a quarter has played.
  const { loop: fresh } = loopFor({ scenes: 'on', sceneBars: 32 });
  fresh.start();
  fresh.bar();
  assert.equal(fresh.dropDue(16), true, 'a bar in, the drop 16 off: its blade may be forged');
  assert.equal(fresh.dropReady(), false, '...but a drop a bar in doesn’t end it (a short breakdown)');
  for (let i = 0; i < 7; i++) fresh.bar();
  assert.equal(fresh.dropReady(), true, 'a quarter in: it may');
  ahead.advance();
  for (let i = 0; i < 6; i++) ahead.bar();
  ahead.arrived();
  for (let i = 0; i < 10; i++) ahead.bar();
  assert.equal(ahead.since, 10, 'counted from the arrival');
  assert.equal(ahead.due(16), false);
  const { loop: drops } = loopFor({ scenes: 'on', sceneBars: 0 });
  drops.start();
  assert.deepEqual(run(drops, 200), [], 'no phrase lines');
  assert.deepEqual(run(drops, 6, { dropsAt: [1, 3, 6] }), ['b:frozen', 'm:rave', 'm:moonlit'], 'every drop');
});

test('16 bars: a scene arriving on the line where a breakdown begins gives way at its drop, 8 bars on (exactly half)', () => {
  const { loop } = loopFor({ scenes: 'on', sceneBars: 16 });
  loop.start();
  assert.deepEqual(run(loop, 16), ['b:frozen'], 'the line at bar 16');
  loop.arrived();
  // The breakdown's forge, at once: the drop some 8 bars off will be half a stretch in.
  assert.equal(loop.dropDue(8), true, 'forecast: 0 + 8 of 16');
  assert.equal(refOf(loop.peek()), 'm:rave', 'the blade is the next one’s; nothing dealt yet');
  assert.equal(refOf(loop.current), 'b:frozen');
  for (let i = 0; i < 8; i++) loop.bar();
  assert.equal(loop.dropReady(), true, '8 bars in at the drop');
  assert.equal(loop.dropDue(), true, 'half a stretch, exactly: due (>=)');
  assert.equal(refOf(loop.advance()), 'm:rave', 'the one peeked is dealt');
  // 32 bars: the same breakdown forges no scene blade (8 of 32 by the drop).
  const { loop: long } = loopFor({ scenes: 'on', sceneBars: 32 });
  long.start();
  run(long, 32);
  long.arrived();
  assert.equal(long.dropDue(8), false);
});

test('"only on drops": every drop is ready, a breakdown ending with no drop deals nothing (peek keeps it next)', () => {
  const { loop } = loopFor({ scenes: 'on', sceneBars: 0 });
  loop.start();
  for (let i = 0; i < 9; i++) loop.bar();
  assert.deepEqual([loop.dropDue(8), loop.dropReady(), loop.due(16), loop.due(11)], [true, true, false, false]);
  const next = loop.peek();
  // The breakdown ends with no drop: nothing advanced, the same one comes at the next real drop.
  for (let i = 0; i < 15; i++) assert.equal(loop.due(i + 10), false, `no phrase line at ${i + 10}`);
  assert.equal(loop.peek(), next);
  assert.equal(loop.advance(), next);
});

test('Change Every on Random rolls a new length at each change, still on its own multiples', () => {
  const { loop } = loopFor({ scenes: 'on', sceneBars: 'random' }, { seed: 9 });
  loop.start();
  let bar = 0;
  const gaps = [];
  let lastAt = 0;
  for (let i = 1; i <= 2000; i++) {
    loop.bar();
    bar++;
    if (loop.due(bar)) {
      gaps.push(bar - lastAt);
      lastAt = bar;
      loop.advance();
    }
  }
  assert.ok(gaps.length > 10);
  assert.ok(new Set(gaps).size > 1, `more than one length: ${[...new Set(gaps)]}`);
});

test('Shuffled: a deck that deals every scene before a repeat, never the same twice running', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { loop } = loopFor({ scenes: 'on', sceneOrder: 'shuffle', sceneBars: 16 }, { seed });
    const played = [refOf(loop.start()), ...run(loop, 16 * 40)];
    for (let i = 1; i < played.length; i++)
      assert.notEqual(played[i], played[i - 1], `seed ${seed}: twice running at ${i}`);
    for (let r = 0; r + 5 <= played.length; r += 5) {
      assert.equal(new Set(played.slice(r, r + 5)).size, 5, `seed ${seed}: round ${r / 5} deals all five`);
    }
    assert.notDeepEqual(played.slice(0, 5), played.slice(5, 10), 'shuffled again');
  }
  // The library changing mid-deck: a scene taken out never comes; a new one joins the next round.
  const lib = LIB.slice(0, 3);
  const { loop } = loopFor({ scenes: 'on', sceneOrder: 'shuffle', sceneBars: 16 }, { library: lib, seed: 4 });
  loop.start();
  lib.splice(1, 1);
  lib.push(entry('m:new'));
  const later = run(loop, 16 * 12);
  assert.ok(!later.includes(LIB[1].ref));
  assert.ok(later.includes('m:new'));
});

test('In the mix: stretches of the free show between scenes, scenes most of the time', () => {
  const { loop } = loopFor({ scenes: 'mix', sceneBars: 16 }, { seed: 12 });
  const played = [refOf(loop.start()), ...run(loop, 16 * 400)];
  const free = played.filter((p) => p === 'free').length;
  assert.ok(free > 0 && free < played.length / 2, `${free} free of ${played.length}`);
  const scenesOnly = played.filter((p) => p !== 'free');
  // After a scene the free show comes about FREE_AFTER_SCENE of the time.
  let afterScene = 0;
  let toFree = 0;
  for (let i = 1; i < played.length; i++)
    if (played[i - 1] !== 'free') {
      afterScene++;
      if (played[i] === 'free') toFree++;
    }
  assert.ok(Math.abs(toFree / afterScene - FREE_AFTER_SCENE) < 0.1, `${(toFree / afterScene).toFixed(2)}`);
  // Never the same scene twice running, a free stretch between or not.
  for (let i = 1; i < scenesOnly.length; i++) assert.notEqual(scenesOnly[i], scenesOnly[i - 1], `at ${i}`);
});

test('peek() tells what advance() will hand out; an empty loop hands out nothing', () => {
  const { loop } = loopFor({ scenes: 'mix', sceneBars: 16 }, { seed: 3 });
  loop.start();
  for (let i = 0; i < 20; i++) {
    const seen = loop.peek();
    assert.equal(loop.peek(), seen, 'kept');
    assert.equal(loop.advance(), seen);
  }
  const { loop: empty } = loopFor({ scenes: 'on' }, { library: [] });
  assert.equal(empty.start(), null);
  assert.equal(empty.peek(), null);
  assert.equal(empty.advance(), null);
  assert.equal(empty.next(), null);
  assert.equal(empty.dropDue(), false);
  const { loop: out } = loopFor({ scenes: 'on', sceneList: Object.fromEntries(LIB.map((e) => [e.ref, false])) });
  assert.equal(out.start(), null, 'every scene switched out');
});

test('the solo lock: only that scene (no changes); N goes back to the loop', () => {
  const { loop } = loopFor({ scenes: 'on', sceneBars: 16 });
  loop.lock('m:rave');
  assert.equal(refOf(loop.start()), 'm:rave');
  assert.deepEqual(run(loop, 16 * 8, { dropsAt: [20, 60] }), []);
  assert.equal(loop.dropDue(), false);
  assert.equal(refOf(loop.next()), 'm:moonlit', 'N: the one after it');
  assert.equal(loop.locked, null);
  assert.ok(run(loop, 64).length > 0, 'the loop runs again');
});
