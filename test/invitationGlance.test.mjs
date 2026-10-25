// NEWT's glance up at you while he's held (src/invitation/lookAt.js createGlance, glanceStep,
// glanceLook; play.js glanceFront), the pure parts main.js runs each frame: a look of its own on
// the viewer, and how far up he is following the brain's BrainOut.look.up (a Thrash's cut or a
// let-go eased out). The look put on goes straight from his hung look to the glance's in the
// turn each puts on (weight × angle), so the glance only ever lifts his head: never under where
// it hung, never further to a side than it was or will be, even from the middle of a glance to
// one side (which a plain blend of the two looks' weights and angles dipped and swung first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glanceFront, lookFront } from '../src/invitation/play.js';
import { createGlance, createLook, glanceLook, glanceStep, lookStep } from '../src/invitation/lookAt.js';
import { createRng } from '../src/invitation/rng.js';

const DT = 1 / 60;
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);

test('held, the look put on goes from his hung look to the glance’s in the turn each puts on (weight × angle): at 0 the hung one, at 1 the glance’s, between in step, its pitch only ever rising', () => {
  const droop = { yaw: 0.6, pitch: -0.5, weight: 0.15 };
  const glance = { look: { yaw: 0, pitch: 1.09, weight: 1 }, k: 0 };
  const turn = (k, w = 1) => {
    const l = glanceLook(droop, { ...glance, k }, w);
    return { yaw: l.yaw * l.weight, pitch: l.pitch * l.weight, weight: l.weight };
  };
  assert.deepEqual(
    glanceLook(droop, glance, 1),
    { yaw: 0.6, pitch: -0.5, weight: 0.15 },
    'none up: the hung look as it is',
  );
  const top = turn(1);
  close(top.yaw, 0);
  close(top.pitch, 1.09);
  close(top.weight, 1);
  close(turn(1, 0.8).pitch, 1.09 * 0.8, 1e-9, 'the glance at its own weight:');
  let last = turn(0);
  for (let k = 0.01; k <= 1 + 1e-9; k += 0.01) {
    const at = turn(k);
    assert.ok(at.pitch >= last.pitch - 1e-12, `k ${k.toFixed(2)}: pitch ${at.pitch} after ${last.pitch}`);
    assert.ok(
      at.yaw <= last.yaw + 1e-12 && at.yaw >= -1e-12,
      `k ${k.toFixed(2)}: yaw ${at.yaw} straight back from 0.09`,
    );
    close(at.pitch, -0.075 + (1.09 + 0.075) * k, 1e-9, `k ${k.toFixed(2)}:`);
    last = at;
  }
  // (Nothing to turn: none.)
  assert.deepEqual(glanceLook({ yaw: 0, pitch: 0, weight: 0 }, { ...glance, k: 0 }, 0), {
    yaw: 0,
    pitch: 0,
    weight: 0,
  });
});

test('held, frame by frame as main.js runs it: a glance up only ever lifts his head (never under where it hung, never further to a side than it was or will be), even from the middle of a glance to one side, and a Thrash’s cut or a let-go eases it out', () => {
  const T = { heldLook: 0.15, heldPitch: -0.5, lift: 0.5, ease: 0.25 };
  // (The brain's up: smoothstep in over T.ease from `from`, out over it to `until`.)
  const upAt = (t, from, until) => {
    const e = (x) => {
      const u = Math.min(1, Math.max(0, x / T.ease));
      return u * u * (3 - 2 * u);
    };
    return t < from || t > until ? 0 : Math.min(e(t - from), e(until - t));
  };
  // (The viewer from his head, facing the camera: lookAim's `ahead`.)
  const ahead = { yaw: 0, pitch: 0.59 };
  for (const seed of [1, 2, 3, 4]) {
    const rng = createRng(seed);
    const gaze = createLook();
    const glance = createGlance();
    let t = 0;
    let from = Infinity;
    let sideAt = Infinity;
    let start = null;
    let wide = 0;
    let low = Infinity;
    let topYaw = 0;
    let sawUp = false;
    for (let i = 0; i < Math.round(14 / DT); i++) {
      t += DT;
      // (Up once a glance to one side has turned his hung look, while it holds.)
      if (from === Infinity && gaze.glance && t > 1) {
        sideAt = Math.min(sideAt, t);
        if (t - sideAt >= 0.3) from = t;
      }
      const up = upAt(t, from, from + 1);
      const want = { mode: 'forward', weight: T.heldLook, pitch: T.heldPitch, up, lift: T.lift, upWeight: 1 };
      lookStep(gaze, 'forward', null, DT, t, rng, want.weight, lookFront(ahead, want));
      glanceStep(glance, up, glanceFront(ahead, want), DT, t, rng);
      const l = glanceLook(gaze, glance, want.upWeight);
      const on = { yaw: l.yaw * l.weight, pitch: l.pitch * l.weight };
      if (t < from) start = on;
      else if (t <= from + 0.5) {
        low = Math.min(low, on.pitch);
        wide = Math.max(wide, Math.abs(on.yaw));
        topYaw = on.yaw;
        if (up === 1) sawUp = true;
      }
    }
    assert.ok(from < Infinity && start, `seed ${seed}: a glance to one side came`);
    assert.ok(Math.abs(start.yaw) > 0.02, `seed ${seed}: hung, his head turned to a side ${start.yaw.toFixed(3)}`);
    assert.ok(sawUp, `seed ${seed}: all the way up`);
    assert.ok(
      low >= start.pitch - 1e-3,
      `seed ${seed}: as it rose his head dipped to ${low.toFixed(3)} from ${start.pitch.toFixed(3)}`,
    );
    assert.ok(
      wide <= Math.max(Math.abs(start.yaw), Math.abs(topYaw)) + 0.01,
      `seed ${seed}: swung ${wide.toFixed(3)} to a side (hung ${start.yaw.toFixed(3)}, up ${topYaw.toFixed(3)})`,
    );
  }
  // A cut (the Thrash takes up from 1 to 0 in a frame), then a let-go (up gone): it eases out.
  const rng = createRng(5);
  const glance = createGlance();
  for (let i = 0; i < 60; i++) glanceStep(glance, 1, { yaw: 0, pitch: 1 }, DT, i * DT, rng);
  assert.equal(glance.k, 1);
  let prev = glance.k;
  for (let i = 0; i < 30; i++) {
    glanceStep(glance, i < 15 ? 0 : undefined, { yaw: 0, pitch: 1 }, DT, 1 + i * DT, rng);
    assert.ok(prev - glance.k <= 0.15 + 1e-9, `eased: ${prev} → ${glance.k}`);
    prev = glance.k;
  }
  assert.equal(glance.k, 0, 'out within half a second');
});
