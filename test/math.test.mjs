// The shared math helpers (src/math.js) against the local copies they replaced: the
// orbit's and the Painter rig's clamps, the cursor's smoothstep (bonfire/interaction.js),
// and ice's and the lightning ball's easeOutBack. The numbers must be the very same, bit
// for bit, so the fire, the ice and the cameras move exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, clamp01, easeOutBack, smooth, smoothstep } from '../src/math.js';

// The copies, as they were.
const oldClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v)); // painter/cameraRig.js
const oldRangeClamp = (v, range) => Math.min(range[1], Math.max(range[0], v)); // ui/orbit.js
const oldClamp01 = (x) => Math.min(1, Math.max(0, x));
const oldSmoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }; // bonfire/interaction.js
const iceEase = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }; // bonfire/ice.js
const ballEase = (t) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }; // bonfire/plasma.js

/** -0.5 … 1.5 in small uneven steps, plus the ends and some odd values. */
const SAMPLES = [...Array.from({ length: 401 }, (_, i) => -0.5 + i * 0.005 + (i % 7) * 1e-7), 0, 1, -0, 0.5, 1e-12, 1 - 1e-12, -3, 7, Infinity, -Infinity];

test('clamp and clamp01 give the same numbers as the copies they replaced', () => {
  for (const x of SAMPLES) {
    assert.ok(Object.is(clamp01(x), oldClamp01(x)), `clamp01(${x})`);
    for (const [lo, hi] of [[0, 1], [-0.35, 1.45], [0.6, 9], [0.04, 1.2], [2.1, 7]]) {
      assert.ok(Object.is(clamp(x, lo, hi), oldClamp(x, lo, hi)), `clamp(${x}, ${lo}, ${hi})`);
      assert.ok(Object.is(clamp(x * 10, lo, hi), oldRangeClamp(x * 10, [lo, hi])), `the orbit's clamp(${x * 10}, [${lo}, ${hi}])`);
    }
  }
  assert.ok(Number.isNaN(clamp01(NaN)) && Number.isNaN(oldClamp01(NaN)), 'NaN stays NaN, as before');
});

test('smoothstep gives the cursor the same numbers as its own copy did', () => {
  for (const [a, b] of [[900, 2600], [0, 1], [2.6, 0.7], [-1, 3]]) {
    for (const t of SAMPLES) {
      const x = a + (b - a) * t;
      assert.ok(Object.is(smoothstep(a, b, x), oldSmoothstep(a, b, x)), `smoothstep(${a}, ${b}, ${x})`);
    }
  }
  assert.equal(smoothstep(900, 2600, 0), 0);
  assert.equal(smoothstep(900, 2600, 5000), 1);
  assert.equal(smoothstep(0, 1, 0.5), smooth(0.5));
});

test('easeOutBack(t, c): ice (1.9) and the lightning ball (1.6) the same as their copies, 0 → 1 with an overshoot', () => {
  for (const t of SAMPLES) {
    assert.ok(Object.is(easeOutBack(t, 1.9), iceEase(t)), `ice at ${t}`);
    assert.ok(Object.is(easeOutBack(t, 1.6), ballEase(t)), `the ball at ${t}`);
  }
  for (const c of [1.6, 1.9]) {
    assert.equal(easeOutBack(0, c), 0);
    assert.equal(easeOutBack(1, c), 1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100, c)));
    assert.ok(peak > 1.05, `c ${c} overshoots (${peak.toFixed(3)})`);
  }
  assert.ok(easeOutBack(0.8, 1.9) > easeOutBack(0.8, 1.6), 'a bigger c overshoots further');
});
