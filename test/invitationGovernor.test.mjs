// The invitation toy's frame-time governor (src/invitation/governor.js): slow seconds step the
// texel grid coarser, a run of fast ones steps it back, with a band between where it holds; a
// coarser step that doesn't help is taken back and never tried again at that frame time (a 30 Hz
// screen tries once in two minutes at most, then keeps the grid); a relapse after a finer step
// makes the next try wait twice as long, so a device only fast a level coarser is tried less and
// less often; gaps and the frames just after a change are left out; it never goes under 0 (the
// user's Pixel Size) or past its coarsest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOVERN, createGovernor, governReset, governStep, percentile } from '../src/invitation/governor.js';

/**
 * Feed `secs` seconds of frames, each `ms` long (or `ms(i)`), when a coarser grid would make them
 * `speedUp` times faster per level (the frames a render-bound page gets: fewer texels, faster).
 * Returns the levels after each frame.
 */
function run(g, secs, ms, speedUp = 0) {
  const levels = [];
  let t = 0;
  let i = 0;
  while (t < secs * 1000) {
    const base = typeof ms === 'function' ? ms(i) : ms;
    const d = base / (1 + speedUp * g.level);
    governStep(g, d);
    levels.push(g.level);
    t += d;
    i++;
  }
  return levels;
}

test('the p90 of a second of frames', () => {
  const a = Float64Array.from([5, 1, 4, 2, 3, 10, 6, 7, 8, 9]);
  assert.equal(percentile(a, 10, 0.9), 9);
  assert.equal(percentile(a, 10, 0.5), 5);
  assert.equal(percentile(a, 0, 0.9), 0);
});

test('steady 60 Hz frames leave the grid as the user picked it', () => {
  const g = createGovernor();
  const levels = run(g, 10, 1000 / 60);
  assert.ok(levels.every((l) => l === 0));
  assert.ok(g.p90 > 16 && g.p90 < 17.5, `p90 ${g.p90}`);
});

test('slow frames step it coarser, one level a second, up to its coarsest; it never goes past it', () => {
  const g = createGovernor();
  // (Each level here helps, as fewer texels do, yet it stays slow.)
  run(g, 1.05, 60, 0.4);
  assert.equal(g.level, 1, 'one slow second: a level coarser');
  run(g, 20, 60, 0.4);
  assert.equal(g.level, GOVERN.maxLevel);
  run(g, 10, 60, 0.4);
  assert.equal(g.level, GOVERN.maxLevel, 'never past its coarsest');
});

test('fast again: a run of fast seconds steps it back one level at a time, never finer than the user’s choice', () => {
  const g = createGovernor();
  governReset(g, 2);
  run(g, GOVERN.settle + GOVERN.recover - 0.5, 1000 / 60);
  assert.equal(g.level, 2, 'not before `recover` fast seconds');
  run(g, 1.2, 1000 / 60);
  assert.equal(g.level, 1);
  run(g, 30, 1000 / 60);
  assert.equal(g.level, 0, 'back to the user’s Pixel Size');
  run(g, 10, 5);
  assert.equal(g.level, 0, 'never finer than it');
});

test('between slow and fast it holds (the hysteresis band)', () => {
  const g = createGovernor();
  governReset(g, 1);
  const mid = (GOVERN.slowMs + GOVERN.fastMs) / 2;
  const levels = run(g, 20, mid);
  assert.ok(
    levels.every((l) => l === 1),
    'neither steps',
  );
  // A jittery page: mostly 60 Hz with one frame in twenty slow stays put too.
  const j = createGovernor();
  run(j, 20, (i) => (i % 20 === 0 ? 34 : 1000 / 60));
  assert.equal(j.level, 0);
});

test('a coarser step that doesn’t make the frames faster (a 30 Hz screen) is taken back, and none is tried for a while', () => {
  const g = createGovernor();
  const levels = run(g, 6, 1000 / 30);
  assert.equal(Math.max(...levels), 1, 'it tried one level');
  assert.equal(g.level, 0, 'and took it back: fewer texels didn’t help');
  run(g, GOVERN.block - 8, 1000 / 30);
  assert.equal(g.level, 0, 'no coarser step while it holds off');
});

/**
 * Feed `secs` seconds of frames whose length depends on the level (`at(level, i)`, ms): a page
 * whose cost the governor's level changes, or doesn't. Returns each change of level: when (s),
 * from and to.
 */
function changes(g, secs, at) {
  const out = [];
  let t = 0;
  let i = 0;
  while (t < secs * 1000) {
    const was = g.level;
    const d = at(g.level, i++);
    governStep(g, d);
    t += d;
    if (g.level !== was) out.push({ t: t / 1000, from: was, to: g.level });
  }
  return out;
}
/** Steady jitter in ±`by` ms, the same each run. */
const jitter = (by) => (i) => by * Math.sin(i * 12.9898) * Math.cos(i * 4.1414);

test('a screen locked at 30 Hz, or a 60 Hz one with a frame in eight late, never coarsens for nothing: one try in two minutes at most, taken back, and never tried again at that frame time', () => {
  const j = jitter(0.5);
  for (const [name, at] of [
    ['locked at 30 Hz', () => 1000 / 30],
    ['30 Hz with ±0.5 ms of jitter', (_, i) => 1000 / 30 + j(i)],
    ['60 Hz, one frame in eight at 34 ms', (_, i) => (i % 8 === 0 ? 34 : 1000 / 60)],
  ]) {
    const g = createGovernor();
    const c = changes(g, 120, at);
    assert.ok(c.filter((x) => x.to > x.from).length <= 1, `${name}: ${JSON.stringify(c)}`);
    assert.equal(g.level, 0, `${name}: back at the Pixel Size picked`);
  }
});

test('a coarser step that didn’t help is tried again once the frames get slower for another reason (fewer texels may help then)', () => {
  const g = createGovernor();
  changes(g, 40, () => 1000 / 30);
  assert.equal(g.level, 0);
  // Now a heavier load the grid's size does decide (50 ms, a third quicker each level).
  const c = changes(g, 10, (level) => 50 / (1 + 0.5 * level));
  assert.ok(
    c.some((x) => x.to > x.from),
    `it tried coarser again: ${JSON.stringify(c)}`,
  );
  // And a new Pixel Size forgets what it learned.
  governReset(g);
  assert.ok(
    changes(g, 3, () => 1000 / 30).some((x) => x.to > x.from),
    'tries afresh after a reset',
  );
});

test('fast only at a coarser level (a slow GPU): its tries at a finer level grow further and further apart, each relapse doubling the wait', () => {
  const g = createGovernor();
  const c = changes(g, 600, (level) => [28, 22, 1000 / 60][Math.min(level, 2)]);
  const tries = c.filter((x) => x.to < x.from).map((x) => x.t);
  assert.ok(
    tries.length >= 3 && tries.length <= 9,
    `${tries.length} tries in ten minutes: ${tries.map((t) => t.toFixed(0))}`,
  );
  for (let k = 2; k < tries.length; k++) {
    const gap = tries[k] - tries[k - 1];
    const was = tries[k - 1] - tries[k - 2];
    assert.ok(gap >= 1.6 * was || gap >= GOVERN.recoverMax, `try ${k}: ${gap.toFixed(1)} s after ${was.toFixed(1)}`);
  }
  assert.ok(tries.filter((t) => t > 120).length <= 3, 'rare once it has learned');
  // Once a finer step holds a while (the GPU got its time back), the wait is back to `recover`.
  const h = createGovernor();
  governReset(h, 1);
  changes(h, GOVERN.settle + GOVERN.recover + 0.5, () => 1000 / 60);
  assert.equal(h.level, 0);
  changes(h, 1.2, (level) => (level ? 1000 / 60 : 30));
  assert.equal(h.recover, GOVERN.recover * 2, 'a relapse');
  changes(h, GOVERN.recover * 2 + 1, () => 1000 / 60);
  assert.equal(h.level, 0, 'tried finer again');
  changes(h, GOVERN.calm + 1, () => 1000 / 60);
  assert.equal(h.recover, GOVERN.recover, 'held: back to the short wait');
});

test('a relapse after a finer step doubles the fast run the next try waits for', () => {
  const g = createGovernor();
  governReset(g, 1);
  run(g, GOVERN.settle + GOVERN.recover + 0.5, 1000 / 60);
  assert.equal(g.level, 0, 'tried finer');
  run(g, 1.2, 30, 1);
  assert.equal(g.level, 1, 'slow again at once: back coarser');
  assert.equal(g.recover, GOVERN.recover * 2, 'the next try waits twice as long');
  run(g, GOVERN.settle + GOVERN.recover + 0.5, 1000 / 60);
  assert.equal(g.level, 1, 'not after the old run');
  run(g, GOVERN.recover + 0.5, 1000 / 60);
  assert.equal(g.level, 0, 'after the doubled one');
});

test('gaps (a tab coming back) and the frames just after a change are left out', () => {
  const g = createGovernor();
  for (let i = 0; i < 20; i++) governStep(g, 900);
  assert.equal(g.level, 0, 'intervals over maxGap never count');
  run(g, 1.05, 30);
  assert.equal(g.level, 1);
  // Right after the change: a hitch from the grid's refit isn't judged.
  governStep(g, 200);
  assert.equal(g.settling > 0 || g.count === 0, true);
  assert.equal(g.level, 1);
  governReset(g);
  assert.equal(g.level, 0, 'a new Pixel Size starts at 0');
  governReset(g, 99);
  assert.equal(g.level, GOVERN.maxLevel, 'clamped');
});
