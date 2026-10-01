// The bonfire's frame cap (src/bonfire/frameGate.js, fire.setMaxFps): which of the display's
// frames are drawn. No cap draws them all; a cap draws at most that many a second on average,
// on any refresh rate, without drifting, skipping none for vsync jitter, and never bursting
// after a stall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameGate } from '../src/bonfire/frameGate.js';

/** Drive the gate with `frames` frame intervals (ms); returns which were drawn. */
function run(gate, intervals) {
  return intervals.map((ms) => gate.due(ms));
}
const steady = (hz, seconds, jitter = 0, seed = 3) => {
  let s = seed;
  const r = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 * 2 - 1; };
  return Array.from({ length: Math.round(hz * seconds) }, () => 1000 / hz + r() * jitter);
};

test('no cap (the default): every frame is drawn', () => {
  const gate = createFrameGate();
  assert.equal(gate.maxFps, 0);
  assert.ok(run(gate, steady(144, 1)).every(Boolean));
  gate.setMaxFps(60);
  gate.setMaxFps(0);
  assert.ok(run(gate, steady(144, 1)).every(Boolean));
  for (const bad of [-30, NaN, Infinity, undefined]) {
    gate.setMaxFps(bad);
    assert.equal(gate.maxFps, 0, String(bad));
  }
});

test('a cap draws that many a second on average, on every refresh rate, with no drift', () => {
  for (const [hz, cap] of [[144, 60], [165, 60], [120, 60], [120, 30], [75, 60], [144, 30], [240, 60]]) {
    const gate = createFrameGate();
    gate.setMaxFps(cap);
    const drawn = run(gate, steady(hz, 20)).filter(Boolean).length;
    assert.ok(Math.abs(drawn / 20 - cap) <= 1, `${hz} Hz capped at ${cap}: ${drawn / 20} fps`);
  }
});

test('120 Hz at 60 draws exactly every other frame; 120 at 30 every fourth', () => {
  const gate = createFrameGate();
  gate.setMaxFps(60);
  assert.deepEqual(run(gate, steady(120, 0.1)), [true, false, true, false, true, false, true, false, true, false, true, false]);
  gate.setMaxFps(30);
  const quarter = run(gate, steady(120, 0.1));
  assert.deepEqual(quarter.map((d, i) => (d ? i : -1)).filter((i) => i >= 0), [0, 4, 8]);
});

test('a cap at the display’s own rate skips nothing, jitter or a display a hair fast', () => {
  for (const [hz, jitter] of [[60, 0.4], [60.05, 0], [59.94, 0.3], [30, 0.5]]) {
    const gate = createFrameGate();
    gate.setMaxFps(60);
    const drawn = run(gate, steady(hz, 30, jitter));
    assert.ok(drawn.every(Boolean), `${hz} Hz ±${jitter} ms: ${drawn.filter((d) => !d).length} skipped`);
  }
});

test('the first frame after a cap is set draws, and a stall comes back as one draw, not a burst', () => {
  const gate = createFrameGate();
  gate.setMaxFps(60);
  assert.equal(gate.due(0), true);
  run(gate, steady(144, 1));
  // A 500 ms stall (a long task, a hidden tab): one draw, then the usual cadence.
  assert.equal(gate.due(500), true);
  const after = run(gate, steady(144, 0.05));
  assert.equal(after[0], false, 'no second draw right after the stall');
  assert.ok(after.filter(Boolean).length <= 3);
  // Faster than the cap the cadence is two or three display frames apart, never one.
  const gaps = [];
  let last = -1;
  run(gate, steady(144, 2)).forEach((d, i) => { if (d) { if (last >= 0) gaps.push(i - last); last = i; } });
  assert.ok(gaps.every((g) => g === 2 || g === 3), gaps.join());
});
