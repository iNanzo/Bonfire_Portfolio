// The onset detector's history (src/visualizer/analyser.js onsetDetector) is a ring of the
// last `history` seconds that grows when frames come faster than it holds: it must give
// exactly what the plain arrays it replaced gave (same values, same order, same sums), at any
// frame rate, through a growth, and across gaps that empty it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onsetDetector } from '../src/visualizer/analyser.js';

/** The detector as it was: push, shift what's too old, mean and spread over the arrays. */
function reference({ refractory, history = 0.8 }) {
  const times = [];
  const values = [];
  let peak = 1e-6;
  let over = false;
  let last = -Infinity;
  const out = { onset: 0, value: 0 };
  return (now, dt, rate, sensitivity) => {
    times.push(now);
    values.push(rate);
    while (times.length && now - times[0] > history) {
      times.shift();
      values.shift();
    }
    let mean = 0;
    for (const v of values) mean += v;
    mean /= values.length;
    let varSum = 0;
    for (const v of values) varSum += (v - mean) ** 2;
    const std = Math.sqrt(varSum / values.length);
    peak = Math.max(rate, peak * Math.exp(-dt / 6), 1e-6);
    const threshold = mean + (1.6 / sensitivity) * std;
    const wasOver = over;
    over = rate > threshold && rate > 0.12 * peak;
    out.onset = 0;
    if (over && !wasOver && now - last > refractory) {
      last = now;
      out.onset = Math.min(1, rate / (0.6 * peak));
    }
    out.value = Math.max(0, rate - mean) / peak;
    return out;
  };
}

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

test('the ring gives exactly what the arrays gave: 60, 144 and 1000 fps, a growth, gaps', () => {
  for (const [fps, seconds, history] of [
    [60, 20, 0.8],
    [144, 10, 0.8],
    [1000, 3, 0.8],
    [240, 5, 0.5],
  ]) {
    const r = rng(fps);
    const ring = onsetDetector({ refractory: 0.1, history });
    const ref = reference({ refractory: 0.1, history });
    let now = 5;
    for (let i = 0; i < fps * seconds; i++) {
      // Jittery frames, now and then a long one (a hitch, a hidden tab) that empties the history.
      const dt = i % 997 === 500 ? 1.5 : (1 / fps) * (0.7 + 0.6 * r());
      now += dt;
      const rate = r() < 0.05 ? 40 + 60 * r() : 5 * r();
      const sens = 0.5 + 1.5 * r();
      const a = ring(now, dt, rate, sens);
      const b = ref(now, dt, rate, sens);
      assert.equal(a.onset, b.onset, `${fps} fps frame ${i}: onset`);
      assert.equal(a.value, b.value, `${fps} fps frame ${i}: value`);
    }
  }
});
