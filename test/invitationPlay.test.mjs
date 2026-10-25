// The invitation toy's frame glue (src/invitation/play.js), the pure parts of main.js's loop:
// which of steer, carry or the fall moves NEWT's root and the hand-offs between them (a grab
// hangs him from the anchor, a release tosses him, the landing snaps his root to the floor and
// gives him back to steer), the clip mix (weights toward the brain's clip at clips.js's fades,
// the gait's step phase by stride, a restart of a clip still showing handing its weight to its
// twin so it never pops) and where he looks (the camera when asked or when the pointer is on
// him, the pointer's floor spot lifted 10°, and ahead meaning toward the viewer). With the
// pointer's ray, over a grid of cursor positions across the whole screen at the default view,
// zoomed in, on a phone and turned: his gaze points at the cursor on screen (performative gaze:
// turned from the viewer toward it, more the further it is from his head, at the viewer within a
// third of a head of it, well off the viewer two heads out), below his head he looks down toward
// it, lower the further below, above him up, higher the further above, to a side round toward it,
// behind him a profile on its side, chin down; with the camera at his side a cursor below him
// still reads as down; a sweep moves it smoothly; his reach (his neck's limits with his chest's
// share on top) is soft; his chest joins in only for big looks; with his back to the camera a
// cursor wiggling behind him doesn't flip his head from side to side; and running away he faces
// where he runs, glancing back over his shoulder toward the pursuer every few seconds (over the
// shoulder nearer the camera when it's straight behind him), never at the viewer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEAD_SHARE,
  TWIN,
  bodyStep,
  createBody,
  createMix,
  lookAim,
  lookFront,
  lookShare,
  mixStep,
  twinWeights,
} from '../src/invitation/play.js';
import { CLIPS, GAIT, STRIDE, fadeFor } from '../src/invitation/clips.js';
import { STEP_SHARE_MIN, gaitPhase } from '../src/invitation/blend.js';
import { CARRY } from '../src/invitation/carry.js';
import {
  CHEST,
  LIMIT,
  LOOK,
  REACH,
  aimAngles,
  aimAt,
  chestShare,
  createLook,
  lookStep,
  softAim,
  torsoStep,
} from '../src/invitation/lookAt.js';
import { createBrain } from '../src/invitation/brain.js';
import { createRng } from '../src/invitation/rng.js';
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

test('the body: held, falling and landing he keeps the yaw he had when grabbed, however he’s dragged and tossed, and steers on from it', () => {
  for (const yaw of [0, 2, -2.6]) {
    const s = createBody({ x: 0, z: 0, yaw });
    let t = 0;
    const collar = { x: 0, y: 0.59, z: 0 };
    // Dragged round in a loop, quickly, then let go mid-swing.
    for (let i = 0; i < 90; i++) {
      const a = (i / 30) * Math.PI;
      const target = { x: Math.sin(a) * 0.8, y: 1.1 + 0.2 * Math.cos(2 * a), z: Math.cos(a) * 0.5 - 0.5 };
      bodyStep(s, { state: 'held', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT), collar, target });
      assert.equal(s.body.yaw, yaw, 'held');
    }
    s.root = { x: s.carry.anchor.x, y: 0.5, z: s.carry.anchor.z };
    for (let i = 0; i < 200 && s.mode !== 'ground'; i++) {
      bodyStep(s, { state: 'fall', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT), footOffset: 0.03 });
      assert.equal(s.body.yaw, yaw, 'falling');
    }
    assert.equal(s.mode, 'ground');
    bodyStep(s, { state: 'land', move: stay, pointer: null, bounds: BOUNDS, dt: DT, t: t + DT });
    close(s.body.yaw, yaw, 1e-9, 'landed, the way he faced when grabbed:');
  }
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
  // Back to the gait, walking: Walk takes over at Walk's fade; the phase moves by speed over
  // the stride Walk's share of the mix makes (a slight share: STEP_SHARE_MIN's).
  const p0 = m.phase;
  mixStep(m, { clip: 'gait', speed: 0.7, dt: DT });
  close(m.fade, fadeFor('Wave', 'Walk'));
  close(m.phase, p0 + (DT * 0.7) / (STRIDE.Walk * Math.max(STEP_SHARE_MIN, m.weights.Walk)), 1e-9);
  for (let i = 0; i < 60; i++) mixStep(m, { clip: 'gait', speed: 0.7, dt: DT });
  close(m.weights.Walk, 1, 1e-9);
  // Standing still holds the phase.
  const held = m.phase;
  mixStep(m, { clip: 'gait', speed: 0, dt: DT });
  assert.equal(m.phase, held);
});

test('starting off and slowing to a stop, the step phase quickens as Walk’s share of the mix falls, so a planted foot keeps pace with the floor instead of skating', () => {
  const s = createBody();
  const m = createMix();
  let t = 0;
  let partial = 0;
  for (let i = 0; i < 240; i++) {
    const move = { mode: 'goto', goal: { x: 1.2, z: 0.4 }, speed: GAIT.walk };
    bodyStep(s, { state: 'walk', move, pointer: null, bounds: BOUNDS, dt: DT, t: (t += DT) });
    const before = m.phase;
    mixStep(m, { clip: 'gait', speed: s.body.speed, dt: DT });
    const walk = m.weights.Walk ?? 0;
    if (s.body.speed > 0.01 && walk >= STEP_SHARE_MIN && !m.weights.Run) {
      // Walk's stride at its share of the mix, times the share of a step taken: the floor covered.
      const advance = (m.phase - before + 1) % 1;
      close(advance * STRIDE.Walk * walk, s.body.speed * DT, 1e-9, `frame ${i}`);
      if (walk < 0.95) partial++;
    }
  }
  assert.ok(partial > 10, `${partial} frames with Walk only part of the mix (starting off, slowing down)`);
  assert.ok(Math.hypot(s.root.x - 1.2, s.root.z - 0.4) < 0.1, 'and he got there');
  close(gaitPhase(0.2, DT, 0.7, 0), gaitPhase(0.2, DT, 0.7, 0, 1), 1e-12, 'all Walk: as before');
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

test('ahead, held: his own front with his head hung (no turn to the camera), coming round and up toward the viewer as he glances up (BrainOut.look.up)', () => {
  const ahead = { yaw: 0.6, pitch: 0.4 };
  // No pitch asked for: the viewer.
  assert.deepEqual(lookFront(ahead, { mode: 'forward', weight: 1 }), ahead);
  // A pitch without a glance: that pitch, toward the viewer as before.
  assert.deepEqual(lookFront(ahead, { mode: 'forward', weight: 0.2, pitch: -0.5 }), { yaw: 0.6, pitch: -0.5 });
  // Held: straight ahead of himself, hung; at the glance's top, the viewer; between, in step.
  assert.deepEqual(lookFront(ahead, { mode: 'forward', weight: 0.15, pitch: -0.5, up: 0 }), { yaw: 0, pitch: -0.5 });
  assert.deepEqual(lookFront(ahead, { mode: 'forward', weight: 0.85, pitch: -0.5, up: 1 }), ahead);
  const half = lookFront(ahead, { mode: 'forward', weight: 0.5, pitch: -0.5, up: 0.5 });
  close(half.yaw, 0.3);
  close(half.pitch, -0.05);
  // With a lift (making up for the clip's own droop, which the look is applied over): that much higher at the top.
  const lifted = lookFront(ahead, { mode: 'forward', weight: 1, pitch: -0.5, up: 1, lift: 0.5 });
  close(lifted.yaw, 0.6);
  close(lifted.pitch, 0.9);
  close(
    lookFront(ahead, { mode: 'forward', weight: 0.15, pitch: -0.5, up: 0, lift: 0.5 }).pitch,
    -0.5,
    1e-9,
    'none hung:',
  );
});

// ---- the look over the whole screen ---------------------------------------------------------

const RAD = Math.PI / 180;
/**
 * A camera as the default view has it (36° up, 20° of view, `distance` back from his middle
 * at the origin, turned by `yaw`) on a stage `ch` CSS px tall: the ray through a point on
 * screen (CSS px from where his middle shows) and where a world point shows.
 */
function viewCamera({ distance = 13.3, yaw = 0, ch = 800 } = {}) {
  const e = 36 * RAD;
  const f = ch / 2 / Math.tan(10 * RAD);
  const ce = Math.cos(e);
  const se = Math.sin(e);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const target = { x: 0, y: 0.5, z: 0 };
  const position = { x: distance * sy * ce, y: 0.5 + distance * se, z: distance * cy * ce };
  const fwd = { x: -sy * ce, y: -se, z: -cy * ce };
  const right = { x: cy, y: 0, z: -sy };
  const up = { x: -sy * se, y: ce, z: -cy * se };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  return {
    position,
    target,
    up,
    ray: (p) => ({
      o: position,
      d: {
        x: fwd.x + (p.x / f) * right.x - (p.y / f) * up.x,
        y: fwd.y + (p.x / f) * right.y - (p.y / f) * up.y,
        z: fwd.z + (p.x / f) * right.z - (p.y / f) * up.z,
      },
    }),
    screen: (q) => {
      const v = { x: q.x - position.x, y: q.y - position.y, z: q.z - position.z };
      const depth = dot(v, fwd);
      return { x: (dot(v, right) / depth) * f, y: (-dot(v, up) / depth) * f };
    },
  };
}
/** The way his face points, world, for a look (yaw, pitch) from a body facing `bodyYaw`. */
const gaze = (bodyYaw, a) => ({
  x: Math.sin(bodyYaw + a.yaw) * Math.cos(a.pitch),
  y: Math.sin(a.pitch),
  z: Math.cos(bodyYaw + a.yaw) * Math.cos(a.pitch),
});
const angleBetween = (a, b) =>
  Math.acos(
    Math.max(
      -1,
      Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / Math.hypot(a.x, a.y, a.z) / Math.hypot(b.x, b.y, b.z)),
    ),
  );
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** A grid of cursor positions over a 1280×800 stage, CSS px from where his middle shows. */
const GRID = [];
for (let x = -600; x <= 600; x += 50) for (let y = -360; y <= 300; y += 40) GRID.push({ x, y });
const HEAD = { x: 0, y: 0.75, z: 0 };
/** Where his head shows and how tall it is on screen, CSS px. */
function headOnScreen(cam, head = HEAD) {
  const h = LOOK.headSize / 2;
  const top = cam.screen({ x: head.x + cam.up.x * h, y: head.y + cam.up.y * h, z: head.z + cam.up.z * h });
  const bottom = cam.screen({ x: head.x - cam.up.x * h, y: head.y - cam.up.y * h, z: head.z - cam.up.z * h });
  return { ...cam.screen(head), size: Math.hypot(top.x - bottom.x, top.y - bottom.y) };
}
/**
 * The pointer's look for the cursor at `p` (lookAim, then softAim as lookStep has it), and how it
 * reads on screen: the angle from the head-to-cursor direction to his gaze's, his gaze's angle
 * to the camera, and whether his neck reaches it (inside its limits; softAim may ease it).
 */
function readLook(cam, p, bodyYaw = 0, head = HEAD) {
  const { aim } = lookAim('pointer', {
    head,
    yaw: bodyYaw,
    camera: cam.position,
    pointer: { floor: null, onNewt: false, ray: cam.ray(p) },
  });
  const a = softAim(aim);
  const g = gaze(bodyYaw, a);
  const at = headOnScreen(cam, head);
  const tip = cam.screen({ x: head.x + 0.3 * g.x, y: head.y + 0.3 * g.y, z: head.z + 0.3 * g.z });
  const want = Math.atan2(p.y - at.y, p.x - at.x);
  const got = Math.atan2(tip.y - at.y, tip.x - at.x);
  const toCam = { x: cam.position.x - head.x, y: cam.position.y - head.y, z: cam.position.z - head.z };
  return {
    aim,
    a,
    at,
    off: Math.hypot(p.x - at.x, p.y - at.y) / at.size,
    err: Math.abs(wrap(got - want)),
    across: Math.hypot(tip.x - at.x, tip.y - at.y),
    atCamera: angleBetween(g, toCam),
    camPitch: Math.atan2(toCam.y, Math.hypot(toCam.x, toCam.z)),
    // (Short of the last tenth of his reach, where softAim's easing bends the aim a little.)
    reached:
      Math.abs(aim.yaw) <= 0.9 * REACH.yaw && aim.pitch <= 0.9 * REACH.pitchMax && aim.pitch >= 0.9 * REACH.pitchMin,
    tip,
  };
}
const VIEWS = [
  { distance: 13.3, yaw: 0, name: 'desktop default' },
  { distance: 22, yaw: 0, ch: 844, name: 'phone default' },
  { distance: 6.7, yaw: 0, name: 'zoomed in' },
  { distance: 13.3, yaw: -Math.PI / 2, name: 'turned a quarter' },
  { distance: 22, yaw: Math.PI / 2, ch: 844, name: 'phone turned the other way' },
];

test('his reach: his neck’s ±70° of yaw and −20°…+55° of pitch with his chest’s share on top (±100°, −30°…+80°), soft from three quarters of the way (no dead stop at the limit)', () => {
  close(LIMIT.yaw, 70 * RAD);
  close(LIMIT.pitchMin, -20 * RAD, 1e-9, 'with the camera above him nothing needs a deeper look down');
  close(LIMIT.pitchMax, 55 * RAD);
  close(REACH.yaw, LIMIT.yaw + CHEST.yaw, 1e-9);
  close(REACH.yaw, 100 * RAD, 1e-9);
  close(REACH.pitchMin, -30 * RAD, 1e-9);
  close(REACH.pitchMax, 80 * RAD, 1e-9);
  // Inside three quarters of a limit: as asked.
  for (const a of [
    { yaw: 0.5, pitch: 0.3 },
    { yaw: -0.74 * REACH.yaw, pitch: 0.74 * REACH.pitchMin },
    { yaw: 0.74 * REACH.yaw, pitch: 0.74 * REACH.pitchMax },
  ])
    assert.deepEqual(softAim(a), a);
  // Past it: eased toward the limit, never past it, never turning back, with no corner.
  let last = -Infinity;
  for (let y = 0; y <= 4; y += 0.01) {
    const s = softAim({ yaw: y, pitch: 0 }).yaw;
    assert.ok(s >= last - 1e-12 && s <= REACH.yaw + 1e-12, `yaw ${y.toFixed(2)} → ${s}`);
    if (y > 0) assert.ok(s - last <= 0.01 + 1e-9, 'never steeper than as asked');
    last = s;
  }
  close(softAim({ yaw: 4, pitch: 0 }).yaw, REACH.yaw, 1e-3);
  close(softAim({ yaw: 0, pitch: -3 }).pitch, REACH.pitchMin, 1e-3);
  close(softAim({ yaw: 0, pitch: 3 }).pitch, REACH.pitchMax, 1e-3);
  close(softAim({ yaw: -4, pitch: 0 }).yaw, -REACH.yaw, 1e-3);
});

test('his chest joins in only for big looks: none for the looks he gives the viewer, smoothly more toward his reach, where his neck turns no more than its own limits from his chest', () => {
  // The looks he gives the viewer from the default view (up 25–40°, a little to a side): none.
  for (const [y, p] of [
    [0, 0],
    [20, 36],
    [-30, 30],
    [10, -10],
    [0, 40],
  ]) {
    const c = chestShare(y * RAD, p * RAD);
    assert.ok(c.yaw === 0 && c.pitch === 0, `${y}°, ${p}°: ${JSON.stringify(c)}`);
  }
  // At his reach: the neck's own limits from the chest.
  const top = chestShare(REACH.yaw, REACH.pitchMax);
  close(REACH.yaw - top.yaw, LIMIT.yaw, 1e-9, 'yaw: his neck at its limit');
  close(REACH.pitchMax - top.pitch, LIMIT.pitchMax, 1e-9, 'up: his neck at its limit');
  close(REACH.pitchMin - chestShare(0, REACH.pitchMin).pitch, LIMIT.pitchMin, 1e-9, 'down');
  close(chestShare(-REACH.yaw, 0).yaw, -CHEST.yaw, 1e-9, 'either way round');
  assert.ok(CHEST.yaw >= 20 * RAD && CHEST.yaw <= 35 * RAD, 'a twist you see, not a spin');
  // Smooth: never turning back, never quicker than the look itself (so his neck's share never
  // turns back either), the neck's share never past its limit on the way.
  for (const axis of ['yaw', 'pitch']) {
    const [lo, hi] = axis === 'yaw' ? [-REACH.yaw, REACH.yaw] : [REACH.pitchMin, REACH.pitchMax];
    let last = null;
    for (let v = lo; v <= hi + 1e-9; v += 0.25 * RAD) {
      const c = axis === 'yaw' ? chestShare(v, 0).yaw : chestShare(0, v).pitch;
      if (last != null) {
        assert.ok(c >= last.c - 1e-12, `${axis} ${(v / RAD).toFixed(1)}°: never turning back`);
        assert.ok(c - last.c <= 0.25 * RAD, `${axis} ${(v / RAD).toFixed(1)}°: no quicker than the look`);
      }
      const neck = v - c;
      const [nlo, nhi] = axis === 'yaw' ? [-LIMIT.yaw, LIMIT.yaw] : [LIMIT.pitchMin, LIMIT.pitchMax];
      assert.ok(
        neck >= nlo - 1e-9 && neck <= nhi + 1e-9,
        `${axis} ${(v / RAD).toFixed(1)}°: neck ${(neck / RAD).toFixed(1)}°`,
      );
      last = { c };
    }
  }
});

test('his chest’s share comes and goes over a quarter of a second as he leaves the floor and lands, never jumping', () => {
  let k = 1;
  const seen = [];
  for (let i = 0; i < 30; i++) seen.push((k = torsoStep(k, false, DT)));
  close(k, 0, 1e-12, 'held: gone');
  for (let i = 0; i < 30; i++) seen.push((k = torsoStep(k, true, DT)));
  close(k, 1, 1e-12, 'on his feet: back');
  for (let i = 1; i < seen.length; i++)
    assert.ok(Math.abs(seen[i] - seen[i - 1]) <= LOOK.torsoRate * DT + 1e-12, 'never jumping');
  assert.ok(LOOK.torsoRate >= 2 && LOOK.torsoRate <= 8, `${LOOK.torsoRate} a second`);
});

test('over the whole screen, at every view, his gaze points at the cursor on screen: the camera-relative look (performative gaze) turns his face from the viewer toward it, by how far the cursor is from his head', () => {
  for (const view of VIEWS) {
    const cam = viewCamera(view);
    let checked = 0;
    for (const p of GRID) {
      const r = readLook(cam, p);
      const at = `${view.name}, cursor (${p.x}, ${p.y}), ${r.off.toFixed(1)} heads off`;
      // Within LOOK.deadZone of his head: at the viewer, as with the cursor on him.
      if (r.off < LOOK.deadZone) {
        const toCam = aimAt(HEAD, 0, cam.position);
        close(r.aim.yaw, toCam.yaw, 1e-6, `${at}: at the viewer`);
        close(r.aim.pitch, toCam.pitch, 1e-6, `${at}: at the viewer`);
        continue;
      }
      if (r.off < LOOK.deadZone + 0.3 || !r.reached) continue;
      // Where his neck reaches: his gaze on screen at the cursor (eased into his limits, a few
      // degrees off at most).
      assert.ok(r.err < 7 * RAD, `${at}: his gaze ${(r.err / RAD).toFixed(1)}° off the cursor`);
      // Two heads away or more, any way round, his face has clearly turned off the viewer (the 2D
      // angle alone would pass a tiny turn the right way: from the default view that read as a
      // look at the viewer).
      if (r.off >= 2) assert.ok(r.atCamera >= 30 * RAD, `${at}: ${(r.atCamera / RAD).toFixed(0)}° from the viewer`);
      checked++;
    }
    // (Turned a quarter, half the screen is behind him.)
    assert.ok(checked > GRID.length / (view.yaw ? 4 : 3), `${view.name}: ${checked} cells in his reach`);
  }
});

test('a cursor below his head has him look down toward it (never up at the viewer), lower the further below, one above him look up, higher the further above, one to a side turn toward it', () => {
  for (const view of VIEWS.filter((v) => v.yaw === 0)) {
    const cam = viewCamera(view);
    const at = headOnScreen(cam);
    const S = at.size;
    const look = (dx, dy) => readLook(cam, { x: at.x + dx * S, y: at.y + dy * S });
    const camPitch = look(0, 0).camPitch;
    // Straight below him on screen: lower the further below, down to well under the camera,
    // still going down three heads out (not one bowed pose for every cursor under his chin).
    let last = Infinity;
    for (const dy of [0.6, 1, 1.5, 2, 2.5, 3, 4]) {
      const r = look(0, dy);
      assert.ok(
        r.a.pitch < camPitch - 2 * RAD,
        `${view.name}, ${dy} heads below: pitch ${(r.a.pitch / RAD).toFixed(0)}°`,
      );
      assert.ok(
        r.a.pitch < last - (dy <= 3 ? 1 * RAD : -1e-9),
        `${view.name}, ${dy} heads below: lower the further below`,
      );
      last = r.a.pitch;
    }
    const near = look(0, 1).a.pitch;
    const far = look(0, 4).a.pitch;
    assert.ok(
      far <= near - 15 * RAD,
      `${view.name}: far below ${(far / RAD).toFixed(0)}°, a head below ${(near / RAD).toFixed(0)}°`,
    );
    assert.ok(
      LOOK.turnDown >= 35 * RAD && far <= camPitch - 0.95 * LOOK.turnDown,
      `${view.name}: far below, ${(far / RAD).toFixed(0)}° (camera ${(camPitch / RAD).toFixed(0)}°)`,
    );
    assert.ok(far >= REACH.pitchMin, 'within his reach');
    // Below and off to a side: lower than the viewer too, turned toward it, well off the viewer.
    for (const dx of [-2, -1, 1, 2]) {
      const r = look(dx, 2);
      assert.ok(
        r.a.pitch < camPitch - 15 * RAD,
        `${view.name}, (${dx}, 2) heads: pitch ${(r.a.pitch / RAD).toFixed(0)}°`,
      );
      assert.equal(Math.sign(r.a.yaw), Math.sign(dx), `${view.name}, (${dx}, 2): turned toward it`);
      assert.ok(r.atCamera > 30 * RAD, `${view.name}, (${dx}, 2): ${(r.atCamera / RAD).toFixed(0)}° off the viewer`);
    }
    // Above him: up, higher the higher it is (still rising two heads out), and three heads up
    // or more, at least 35° up from the line to the camera.
    last = -Infinity;
    for (const dy of [-1, -1.5, -2, -2.5, -3, -5]) {
      const r = look(0, dy);
      assert.ok(
        r.a.pitch > camPitch + 5 * RAD,
        `${view.name}, ${-dy} heads above: pitch ${(r.a.pitch / RAD).toFixed(0)}°`,
      );
      assert.ok(r.a.pitch > last + (dy >= -2.5 ? 1 * RAD : -1e-9), `${view.name}, ${-dy} heads above: higher`);
      if (dy <= -3)
        assert.ok(
          r.atCamera >= 35 * RAD,
          `${view.name}, ${-dy} heads above: ${(r.atCamera / RAD).toFixed(0)}° from the viewer`,
        );
      last = r.a.pitch;
    }
    assert.ok(last <= REACH.pitchMax, 'within his reach');
    // Level with his head, off to a side: turned well round toward it, his gaze across the
    // screen toward it.
    for (const side of [-1, 1]) {
      const r = look(side * 4, 0);
      assert.equal(Math.sign(r.a.yaw), side);
      assert.ok(Math.abs(r.a.yaw) > 50 * RAD, `${view.name}: turned ${(r.a.yaw / RAD).toFixed(0)}°`);
      assert.ok(r.err < 10 * RAD, `${view.name}: gaze ${(r.err / RAD).toFixed(0)}° off`);
    }
  }
});

test('with the camera turned to his side, a cursor below him reads as down on screen, never up: his head (and chest) come round to the camera and his chin follows the cursor', () => {
  for (const view of VIEWS.filter((v) => Math.abs(v.yaw) === Math.PI / 2)) {
    const cam = viewCamera(view);
    const at = headOnScreen(cam);
    const errs = [];
    for (const p of GRID) {
      if (p.y <= at.y + at.size) continue;
      const r = readLook(cam, p);
      if (r.off < 1) continue;
      errs.push(r.err);
      // (In front of him on screen, where his face can come round: right at it, and his gaze
      // under the camera's line.)
      const ahead = Math.sign(p.x - at.x) === Math.sign(Math.sin(-view.yaw)) || Math.abs(p.x - at.x) < at.size / 4;
      if (ahead && r.off >= 1.5) {
        assert.ok(r.err < 12 * RAD, `${view.name}, (${p.x}, ${p.y}): ${(r.err / RAD).toFixed(0)}° off`);
        assert.ok(
          r.a.pitch < r.camPitch - 10 * RAD,
          `${view.name}, (${p.x}, ${p.y}): pitch ${(r.a.pitch / RAD).toFixed(0)}°`,
        );
      }
    }
    errs.sort((a, b) => a - b);
    const median = errs[Math.floor(errs.length / 2)];
    assert.ok(
      median <= 15 * RAD,
      `${view.name}: median ${(median / RAD).toFixed(0)}° off over ${errs.length} spots below him`,
    );
    // Straight below: he turns round to the camera (past his neck's own reach: his chest helps).
    const r = readLook(cam, { x: at.x, y: at.y + 3 * at.size });
    assert.ok(Math.abs(r.a.yaw) > LIMIT.yaw + 10 * RAD, `${view.name}: turned ${(r.a.yaw / RAD).toFixed(0)}°`);
    assert.ok(r.err < 5 * RAD, `${view.name}: straight below, ${(r.err / RAD).toFixed(0)}° off`);
  }
});

test('with the camera round behind him, a cursor he can’t turn to gets a profile on its side, his chin up or down with the cursor', () => {
  const cam = viewCamera({ distance: 13.3, yaw: Math.PI });
  const at = headOnScreen(cam);
  // High over him, then low under him: up, then down.
  const high = readLook(cam, { x: at.x + 3 * at.size, y: at.y - 3 * at.size });
  const low = readLook(cam, { x: at.x + 3 * at.size, y: at.y + 3 * at.size });
  assert.ok(
    high.a.pitch > low.a.pitch + 30 * RAD,
    `up ${(high.a.pitch / RAD).toFixed(0)}°, down ${(low.a.pitch / RAD).toFixed(0)}°`,
  );
  // Far to one side on screen: a profile on that side.
  for (const side of [-1, 1]) {
    const r = readLook(cam, { x: at.x + side * 6 * at.size, y: at.y });
    assert.equal(Math.sign(r.tip.x - at.x), side, `his gaze to the ${side < 0 ? 'left' : 'right'}`);
    assert.ok(Math.abs(r.a.yaw) > 0.9 * LIMIT.yaw, `a profile (${(r.a.yaw / RAD).toFixed(0)}°)`);
  }
});

test('a cursor swept across the screen moves his look smoothly: no jumps between neighbouring spots, the dead zone round his head and the top of his reach over it included', () => {
  for (const view of VIEWS.filter((v) => Math.abs(v.yaw) < 2)) {
    const cam = viewCamera(view);
    const at = headOnScreen(cam);
    for (const dy of [-4, -3, -2, -0.5, 0, 0.2, 1, 2.5]) {
      let last = null;
      // (Steps of a fiftieth of a head: a jump shows at any step, his turn's pace does not.)
      for (let x = -600; x <= 600; x += at.size / 50) {
        const { a } = readLook(cam, { x, y: at.y + dy * at.size });
        if (last)
          assert.ok(
            Math.abs(a.yaw - last.yaw) < 3 * RAD && Math.abs(a.pitch - last.pitch) < 3 * RAD,
            `${view.name}, row ${dy}, x ${x}: jumped`,
          );
        last = a;
      }
    }
  }
});

test('running away, "ahead" is where he runs, his chin level whatever the camera, and the pursuer is aimed at for his glances back', () => {
  const head = { x: 0, y: 0.75, z: 0 };
  for (const camera of [
    { x: 0, y: 8, z: 11 },
    { x: 0, y: 8, z: -11 },
    { x: 11, y: 8, z: 0 },
  ]) {
    const { aim, ahead } = lookAim('back', { head, yaw: 0, camera, pointer: null, pursuer: null });
    assert.equal(aim, null);
    assert.deepEqual(ahead, { yaw: 0, pitch: LOOK.runPitch }, 'never up at the camera');
  }
  assert.ok(LOOK.runPitch <= 0 && LOOK.runPitch > -20 * RAD, 'level, against the Run clip’s own chin lift');
  // The pursuer behind him to his right: the aim turns that way, round behind him.
  const { aim } = lookAim('back', {
    head,
    yaw: 0,
    camera: { x: 0, y: 8, z: 11 },
    pointer: { floor: { x: 5, z: 5 }, onNewt: false },
    pursuer: { x: 1, z: -2 },
  });
  assert.ok(aim.yaw > 2, `behind him on his right (${(aim.yaw / RAD).toFixed(0)}°)`);
  assert.ok(aim.pitch < 0, 'down at the floor');
});

test('with the pursuer straight behind him, he glances back over the shoulder nearer the camera, so the viewer sees his face look back', () => {
  const head = { x: 0, y: 0.75, z: 0 };
  // Running toward −z, away from a cursor right behind him (a hair to one side or the other).
  for (const camX of [-8, 8]) {
    const camera = { x: camX, y: 8, z: 6 };
    const camSide = Math.sign(aimAt(head, Math.PI, camera).yaw);
    for (const px of [-0.15, 0.15]) {
      const pursuer = { x: px, z: 2 };
      const raw = aimAt(head, Math.PI, { x: pursuer.x, y: 0, z: pursuer.z });
      assert.ok(Math.abs(raw.yaw) > LOOK.backSide, 'straight behind him');
      const { aim } = lookAim('back', { head, yaw: Math.PI, camera, pointer: null, pursuer });
      assert.equal(Math.sign(aim.yaw), camSide, `camera at x ${camX}, cursor at x ${px}: the camera's side`);
      close(Math.cos(aim.yaw), Math.cos(raw.yaw), 1e-9, 'the same way round, taken on that side');
      close(aim.pitch, raw.pitch, 1e-9);
      // The glance goes that way, as far round as he goes.
      const s = createLook();
      const rng = createRng(1);
      let t = 0;
      while (!s.glance && t < 3) lookStep(s, 'back', aim, DT, (t += DT), rng, 1, { yaw: 0, pitch: LOOK.runPitch });
      assert.equal(Math.sign(s.glance.yaw), camSide);
      close(Math.abs(s.glance.yaw), LOOK.backYaw * REACH.yaw, 1e-9);
    }
  }
  // Off to a side behind him (inside backSide), the cursor's own side, whatever the camera.
  const camera = { x: -8, y: 8, z: 6 };
  const { aim } = lookAim('back', { head, yaw: Math.PI, camera, pointer: null, pursuer: { x: -1.5, z: 1 } });
  const raw = aimAt(head, Math.PI, { x: -1.5, y: 0, z: 1 });
  assert.ok(Math.abs(raw.yaw) <= LOOK.backSide);
  assert.deepEqual(aim, raw);
});

test('fleeing from the cursor, his head faces where he runs, glancing back over his shoulder toward the cursor every few seconds, never at the viewer', () => {
  const camera = { x: 0, y: 8.3, z: 10.8 };
  for (const [seed, pointer] of [
    [3, { x: -1.2, z: 0.2 }],
    [4, { x: 1.2, z: -0.3 }],
    [5, { x: 0.3, z: 1.4 }],
  ]) {
    const brain = createBrain({ seed, calm: true, bounds: BOUNDS });
    const body = createBody({ x: 0, z: 0, yaw: 0 });
    const look = createLook();
    const rng = createRng(seed);
    let t = 0;
    let n = 0;
    let straight = 0;
    let frames = 0;
    const glances = [];
    for (let i = 0; i < 3 * 60; i++) {
      t += DT;
      const out = brain.step({
        t,
        dt: DT,
        events: [],
        button: i === 0 ? 'Run' : null,
        pointer,
        newt: { x: body.body.x, z: body.body.z, yaw: body.body.yaw, grounded: true },
        clip: null,
        carry: null,
        camera: { x: camera.x, z: camera.z },
      });
      bodyStep(body, { state: out.state, move: out.move, pointer, bounds: BOUNDS, dt: DT, t });
      const head = { x: body.root.x, y: 0.75, z: body.root.z };
      const { aim, ahead } = lookAim(out.look.mode, {
        head,
        yaw: body.body.yaw,
        camera,
        pointer: { floor: pointer, onNewt: false },
        pursuer: out.look.at ?? null,
      });
      lookStep(look, out.look.mode, aim, DT, t, rng, out.look.weight, ahead, out.look.ease);
      assert.equal(out.state, 'flee');
      assert.deepEqual(out.look.at, pointer, 'the cursor is who he runs from');
      if (look.glances > n) {
        // Over his shoulder on the cursor's side (straight behind him, the camera's side).
        const toward = aimAt(head, body.body.yaw, { x: pointer.x, y: 0, z: pointer.z });
        const cam = aimAt(head, body.body.yaw, camera);
        const side = Math.abs(toward.yaw) > LOOK.backSide ? Math.sign(cam.yaw) : Math.sign(toward.yaw);
        glances.push({ t, yaw: look.target.yaw, side });
      }
      n = look.glances;
      if (t < 0.3) continue;
      frames++;
      if (!look.glance && Math.abs(look.yaw) < 10 * RAD) straight++;
      // Never at the viewer: his gaze stays well off the line to the camera.
      const g = gaze(body.body.yaw, look);
      const toCam = { x: camera.x - head.x, y: camera.y - head.y, z: camera.z - head.z };
      const off = angleBetween(g, toCam) / RAD;
      assert.ok(off > 30, `seed ${seed}, ${t.toFixed(2)} s: ${off.toFixed(0)}° from the viewer`);
      assert.ok(look.target.pitch <= 10 * RAD, 'his chin never up at the viewer');
    }
    const share = straight / frames;
    assert.ok(share > 0.5, `seed ${seed}: facing where he runs ${(100 * share).toFixed(0)}% of the run`);
    // (The first glance comes LOOK.backFirstMin–backFirstMax s in, the next backEveryMin–Max
    // after it: one or two in a 3 s run.)
    assert.ok(glances.length >= 1 && glances.length <= 2, `seed ${seed}: ${glances.length} glances back in 3 s`);
    for (const g of glances) {
      assert.equal(Math.sign(g.yaw), g.side, `seed ${seed}, ${g.t.toFixed(2)} s: toward the cursor side`);
      assert.ok(Math.abs(g.yaw) > 0.5 * LIMIT.yaw, 'right over his shoulder');
    }
    assert.ok(
      glances.some((g) => Math.abs(g.yaw) > LIMIT.yaw),
      `seed ${seed}: past his neck's reach, his chest twisting`,
    );
    for (let i = 1; i < glances.length; i++) {
      const gap = glances[i].t - glances[i - 1].t;
      assert.ok(gap >= LOOK.backEveryMin - 1e-6 && gap <= LOOK.backEveryMax + DT, `a glance every ${gap.toFixed(2)} s`);
    }
  }
});

test('with his back to the camera, a cursor wiggling behind him (in front of the camera) keeps his head to one side, and it goes round to the other only once the cursor clearly has', () => {
  const cam = viewCamera();
  const head = { x: 0, y: 0.92, z: 0 };
  const h = cam.screen(head);
  const rng = createRng(2);
  const s = createLook();
  let t = 0;
  const step = (px) => {
    const { aim } = lookAim('pointer', {
      head,
      yaw: Math.PI,
      camera: cam.position,
      pointer: { floor: null, onNewt: false, ray: cam.ray({ x: h.x + px, y: h.y + 200 }) },
    });
    for (let i = 0; i < 6; i++) lookStep(s, 'pointer', aim, DT, (t += DT), rng);
    return Math.sign(s.yaw);
  };
  // From well off to his left (on screen), wiggling across the middle behind him.
  for (let i = 0; i < 20; i++) step(-300);
  const side = Math.sign(s.yaw);
  assert.notEqual(side, 0);
  for (const px of [-20, 15, -10, 25, 0, 30, -25, 20]) assert.equal(step(px), side, `wiggled to ${px} px: no flip`);
  // Clearly over to the other side: round it goes.
  for (let i = 0; i < 30; i++) step(300);
  assert.equal(Math.sign(s.yaw), -side, 'over to the other side');
  assert.ok(Math.abs(s.yaw) > 0.8 * LIMIT.yaw, `a profile (${(s.yaw / RAD).toFixed(0)}°)`);
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
