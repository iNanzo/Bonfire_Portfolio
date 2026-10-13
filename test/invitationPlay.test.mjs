// The invitation toy's frame glue (src/invitation/play.js), the pure parts of main.js's loop:
// which of steer, carry or the fall moves NEWT's root and the hand-offs between them (a grab
// hangs him from the anchor, a release tosses him, the landing snaps his root to the floor and
// gives him back to steer), the clip mix (weights toward the brain's clip at clips.js's fades,
// the gait's step phase by stride, a restart of a clip still showing handing its weight to its
// twin so it never pops) and where he looks (the camera when asked or when the pointer is on
// him, the pointer's floor spot lifted 10°, and ahead meaning toward the viewer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEAD_SHARE,
  TWIN,
  bodyStep,
  createBody,
  createMix,
  lookAim,
  lookShare,
  mixStep,
  twinWeights,
} from '../src/invitation/play.js';
import { CLIPS, STRIDE, fadeFor } from '../src/invitation/clips.js';
import { CARRY } from '../src/invitation/carry.js';
import { LIMIT, LOOK, aimAngles } from '../src/invitation/lookAt.js';
import { xRange } from '../src/invitation/steer.js';

const DT = 1 / 60;
const BOUNDS = { minX: -1.4, maxX: 1.4, minZ: -8, maxZ: 5, minXBack: -2.3, maxXBack: 2.3 };
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);
const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);
const inside = (p) => {
  const [lo, hi] = xRange(BOUNDS, p.z);
  return p.z >= BOUNDS.minZ - 1e-6 && p.z <= BOUNDS.maxZ + 1e-6 && p.x >= lo - 1e-6 && p.x <= hi + 1e-6;
};
const stay = { mode: 'stay', goal: null, speed: 0 };

test('the body: steer on the ground, a grab hangs him from the anchor, a release tosses him into a fall that lands him snapped to the floor', () => {
  const s = createBody({ x: 0, z: 0, yaw: 0 });
  assert.deepEqual([s.mode, s.grounded, s.root.y], ['ground', true, 0]);
  // Walking: steer moves his root along the floor.
  let t = 0;
  for (let i = 0; i < 60; i++)
    bodyStep(s, {
      state: 'walk',
      move: { mode: 'goto', goal: { x: 1, z: 0 }, speed: 0.7 },
      pointer: null,
      bounds: BOUNDS,
      dt: DT,
      t: (t += DT),
    });
  assert.ok(s.root.x > 0.2 && s.root.y === 0 && s.body.speed > 0, JSON.stringify(s.root));
  assert.equal(s.root.x, s.body.x);
  // Grabbed: held from his collar, the anchor easing toward the target; standing still.
  const collar = { x: s.root.x, y: 0.59, z: 0 };
  const target = { x: s.root.x + 0.6, y: 1.1, z: -0.4 };
  bodyStep(s, { state: 'held', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT), collar, target });
  assert.deepEqual([s.mode, s.grounded, s.body.speed], ['held', false, 0]);
  assert.ok(s.carry, 'carrying');
  let swung = 0;
  for (let i = 0; i < 30; i++) {
    bodyStep(s, { state: 'held', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT), collar, target });
    swung = Math.max(swung, Math.hypot(s.tilt.x, s.tilt.z));
  }
  for (const k of ['x', 'y', 'z']) close(s.carry.anchor[k], target[k], 1e-3, `anchor ${k}`);
  assert.ok(swung > 0.05, `the swing tilts his root (${swung.toFixed(3)} rad)`);
  // Let go: a fall, from where the anchoring left his root, down to the floor.
  s.root = { x: target.x, y: 0.5, z: target.z };
  let n = 0;
  bodyStep(s, { state: 'fall', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT), footOffset: 0.03 });
  assert.equal(s.mode, 'fall');
  assert.equal(s.carry, null);
  while (s.mode === 'fall' && n++ < 200) {
    bodyStep(s, { state: 'fall', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT), footOffset: 0.03 });
    assert.ok(inside(s.root), JSON.stringify(s.root));
  }
  assert.deepEqual([s.mode, s.grounded], ['ground', true], 'landed');
  assert.equal(s.root.y, 0, 'his root snapped to the floor');
  assert.deepEqual(s.tilt, { x: 0, z: 0 });
  assert.deepEqual([s.body.x, s.body.z, s.body.speed], [s.root.x, s.root.z, 0], 'steer takes him from where he landed');
  close(s.landedAt, t, 1e-9);
  // A grab mid-fall catches him.
  s.root = { x: 0, y: 1, z: 0 };
  s.mode = 'fall';
  s.vel = { x: 0, y: -1, z: 0 };
  bodyStep(s, { state: 'held', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: t + DT, collar, target });
  assert.equal(s.mode, 'held');
});

test('the body: thrown at a screen edge he bounces off it, and a still release drops straight down', () => {
  const s = createBody();
  let t = 0;
  const collar = { x: 0, y: 0.59, z: 0 };
  // Carried quickly toward the right edge, then let go.
  for (let i = 0; i < 20; i++) {
    const target = { x: i * 0.07, y: 1.1, z: 0 };
    bodyStep(s, { state: 'held', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT), collar, target });
  }
  s.root = { x: s.carry.anchor.x, y: 0.5, z: 0 };
  let bounced = false;
  for (let i = 0; i < 120 && s.mode !== 'ground'; i++) {
    bodyStep(s, { state: 'fall', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT), footOffset: 0 });
    if (s.vel.x < 0) bounced = true;
    assert.ok(inside(s.root));
  }
  assert.ok(bounced, 'bounced off the edge');
  const still = createBody();
  for (let i = 0; i < 20; i++)
    bodyStep(still, {
      state: 'held',
      move: stay,
      pointer: null,
      bounds: BOUNDS,
      dt: DT,
      t: (t += DT),
      collar,
      target: { x: 0, y: 1.1, z: 0 },
    });
  still.root = { x: 0, y: 0.5, z: 0 };
  bodyStep(still, { state: 'fall', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: t + DT, footOffset: 0 });
  close(still.vel.x, 0, 1e-6);
  close(still.vel.z, 0, 1e-6);
  assert.ok(still.vel.y <= 0 && still.vel.y > -CARRY.fallGravity * 2 * DT, 'just gravity');
});

test('the mix: weights move toward the brain’s clip at clips.js’s fades and stay normalised; the gait phase advances by stride', () => {
  const m = createMix();
  assert.deepEqual(m.weights, { Idle: 1 });
  // Idle to Wave at Wave's fade.
  mixStep(m, { clip: 'Wave', speed: 0, dt: DT });
  close(m.fade, fadeFor('Idle', 'Wave'));
  close(m.weights.Wave, DT / CLIPS.Wave.fadeIn, 1e-9, 'a frame of the fade');
  for (let i = 0; i < 30; i++) {
    mixStep(m, { clip: 'Wave', speed: 0, dt: DT });
    close(sum(m.weights), 1, 1e-9, 'normalised');
  }
  close(m.weights.Wave, 1, 1e-9);
  close(m.weights.Idle, 0, 1e-9);
  // Back to the gait, walking: Walk takes over at Walk's fade; the phase moves by speed/stride.
  const p0 = m.phase;
  mixStep(m, { clip: 'gait', speed: 0.7, dt: DT });
  close(m.fade, fadeFor('Wave', 'Walk'));
  close(m.phase, p0 + (DT * 0.7) / STRIDE.Walk, 1e-9);
  for (let i = 0; i < 60; i++) mixStep(m, { clip: 'gait', speed: 0.7, dt: DT });
  close(m.weights.Walk, 1, 1e-9);
  // Standing still holds the phase.
  const held = m.phase;
  mixStep(m, { clip: 'gait', speed: 0, dt: DT });
  assert.equal(m.phase, held);
});

test('a restart of a clip still showing hands its weight to the clip’s twin, so its pose fades out instead of popping', () => {
  const m = createMix();
  for (let i = 0; i < 6; i++) mixStep(m, { clip: 'Wave', speed: 0, dt: DT });
  const before = m.weights.Wave;
  assert.ok(before > 0.3 && before < 1);
  m.weights = twinWeights(m.weights, 'Wave');
  assert.equal(TWIN, '~');
  close(m.weights[`Wave${TWIN}`], before, 1e-12);
  assert.equal(m.weights.Wave, 0, 'the new start comes in from nothing');
  close(sum(m.weights), 1, 1e-12);
  // Then the twin fades out as the restarted clip fades in, never jumping.
  let prev = m.weights[`Wave${TWIN}`];
  for (let i = 0; i < 30; i++) {
    mixStep(m, { clip: 'Wave', speed: 0, dt: DT });
    assert.ok(m.weights[`Wave${TWIN}`] <= prev + 1e-9);
    assert.ok(prev - m.weights[`Wave${TWIN}`] <= (2 * DT) / CLIPS.Wave.fadeIn + 1e-9, 'no jump');
    prev = m.weights[`Wave${TWIN}`];
  }
  close(m.weights.Wave, 1, 1e-9);
  // A twin left over from an earlier restart adds in (the weights still sum to 1).
  const w = twinWeights({ Wave: 0.5, [`Wave${TWIN}`]: 0.2, Idle: 0.3 }, 'Wave');
  close(w[`Wave${TWIN}`], 0.7, 1e-12);
  close(sum(w), 1, 1e-12);
});

test('where he looks: the camera when asked or when the pointer is on him, the pointer’s floor spot lifted 10°, and ahead is the viewer', () => {
  const D = Math.PI / 180;
  const head = { x: 0, y: 0.8, z: 0 };
  const camera = { x: 0, y: 17, z: 23 };
  const toCamera = aimAngles(head, 0, camera);
  const base = { head, yaw: 0, camera };
  assert.deepEqual(lookAim('camera', { ...base, pointer: null }).aim, toCamera);
  assert.deepEqual(lookAim('pointer', { ...base, pointer: { floor: { x: 1, z: 1 }, onNewt: true } }).aim, toCamera);
  const floor = lookAim('pointer', { ...base, pointer: { floor: { x: 1, z: 2 }, onNewt: false } }).aim;
  const plain = aimAngles(head, 0, { x: 1, y: 0, z: 2 });
  close(LOOK.floorBias, 10 * D);
  close(floor.yaw, plain.yaw);
  close(floor.pitch, plain.pitch + 10 * D, 1e-9, 'lifted 10° so his cap doesn’t hide his face');
  assert.equal(lookAim('pointer', { ...base, pointer: null }).aim, null);
  assert.equal(lookAim('forward', { ...base, pointer: { floor: { x: 1, z: 2 }, onNewt: false } }).aim, null);
  // Ahead: toward the viewer, his head lifted to the camera, within the neck's limits.
  const { ahead } = lookAim('forward', { ...base, pointer: null });
  close(ahead.yaw, 0);
  close(ahead.pitch, Math.min(LIMIT.pitchMax, Math.atan2(16.2, 23)), 1e-9);
  assert.ok(ahead.pitch > 25 * D, 'up toward the camera, so his face shows');
});

test('clips that lift his head themselves take the look at a share, blended by their weight, twins too', () => {
  assert.equal(lookShare({ Idle: 1 }), 1);
  for (const clip of ['Wave', 'Sit', 'SitDown', 'StandUp']) {
    assert.ok(HEAD_SHARE[clip] > 0 && HEAD_SHARE[clip] < 1, clip);
    close(lookShare({ [clip]: 1 }), HEAD_SHARE[clip], 1e-12);
  }
  assert.equal(HEAD_SHARE.Spook, undefined, 'Spook: the brain gives it no look at all');
  close(lookShare({ Idle: 0.5, Wave: 0.5 }), 1 - 0.5 * (1 - HEAD_SHARE.Wave), 1e-12);
  close(lookShare({ Wave: 0.3, [`Wave${TWIN}`]: 0.7 }), HEAD_SHARE.Wave, 1e-12);
});
