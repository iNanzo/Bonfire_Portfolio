// The swing camera's feels (src/visualizer/cameraEase.js): every one arrives, the
// springs stay stable at low frame rates, and only the bouncy one overshoots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SWING_EASES, createFollower, curveFor } from '../src/visualizer/cameraEase.js';

test('camera feels: every follower reaches its target, stable at any frame rate', () => {
  for (const key of Object.keys(SWING_EASES)) {
    for (const dt of [1 / 144, 1 / 60, 1 / 20, 0.1]) {
      const f = createFollower(key);
      const st = { x: 0 };
      let peak = 0;
      for (let t = 0; t < 3; t += dt) { f.num(st, 'x', 1, 0.07, dt); peak = Math.max(peak, st.x); }
      assert.ok(Math.abs(st.x - 1) < 0.02, `${key} at ${dt}: ${st.x}`);
      if (SWING_EASES[key].zeta < 1) assert.ok(peak > 1.02, `${key} overshoots`);
      else assert.ok(peak < 1.005, `${key} doesn't overshoot (${peak})`);
    }
  }
});

test('camera feels: the curves between framings start at 0 and end at 1', () => {
  for (const key of Object.keys(SWING_EASES)) {
    const c = curveFor(key);
    assert.ok(Math.abs(c(0)) < 1e-9 && Math.abs(c(1) - 1) < 1e-9, key);
  }
  assert.equal(curveFor('nonsense')(0.5), curveFor('smooth')(0.5), 'unknown feels fall back to smooth');
});
