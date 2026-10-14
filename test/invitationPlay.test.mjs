// The invitation toy's frame glue (src/invitation/play.js), the pure parts of main.js's loop:
// which of steer, carry or the fall moves NEWT's root and the hand-offs between them (a grab
// hangs him from the anchor, a release tosses him, the landing snaps his root to the floor and
// gives him back to steer), the clip mix (weights toward the brain's clip at clips.js's fades,
// the gait's step phase by stride, a restart of a clip still showing handing its weight to its
// twin so it never pops) and where he looks (the camera when asked or when the pointer is on
// him, the pointer's floor spot lifted 10°, and ahead meaning toward the viewer). With the
// pointer's ray, over a grid of cursor positions across the whole screen: his head turns all
// the way to the cursor's side (exactly at it over his head), he looks up at a cursor high over
// him (up to about 55°), his chin never drops so far that his cap hides his face from the
// camera, he turns no further round from the camera than still shows his face under his cap's
// brim (LOOK.faceTurn: a cursor level with his head far off to a side), and with his back to
// the camera a cursor wiggling behind him doesn't flip his head from side to side.
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
import { CLIPS, GAIT, STRIDE, fadeFor } from '../src/invitation/clips.js';
import { STEP_SHARE_MIN, gaitPhase } from '../src/invitation/blend.js';
import { CARRY } from '../src/invitation/carry.js';
import { LIMIT, LOOK, aimAngles, createLook, faceUp, lookStep, pointerTarget } from '../src/invitation/lookAt.js';
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
const clampA = (a) => ({
  yaw: Math.min(LIMIT.yaw, Math.max(-LIMIT.yaw, a.yaw)),
  pitch: Math.min(LIMIT.pitchMax, Math.max(LIMIT.pitchMin, a.pitch)),
});
/** A grid of cursor positions over a 1280×800 stage, CSS px from where his middle shows. */
const GRID = [];
for (let x = -600; x <= 600; x += 75) for (let y = -360; y <= 300; y += 60) GRID.push({ x, y });

test('the pointer’s target is the first of the floor and the camera-facing upright plane through his head the cursor’s ray meets, brought toward the camera along the ray', () => {
  const cam = viewCamera();
  const head = { x: 0.1, y: 0.92, z: -0.2 };
  const toward = { x: cam.position.x - head.x, z: cam.position.z - head.z };
  const n = Math.hypot(toward.x, toward.z);
  for (const p of GRID) {
    const ray = cam.ray(p);
    const { point, floor } = pointerTarget(ray, head, cam.position);
    // On the cursor's ray, so it shows right under the cursor.
    const s = cam.screen(point);
    close(s.x, p.x, 1e-6, `(${p.x}, ${p.y}) across`);
    close(s.y, p.y, 1e-6, `(${p.x}, ${p.y}) down`);
    // Brought toward the camera from what the ray met first: the floor (in front of the plane),
    // or the plane (above the floor).
    const len = Math.hypot(ray.d.x, ray.d.y, ray.d.z);
    const back = (-(ray.d.x * toward.x + ray.d.z * toward.z) / n / len) * LOOK.towardViewer;
    const off = ((point.x - head.x) * toward.x + (point.z - head.z) * toward.z) / n;
    if (floor) assert.ok(off > back, `(${p.x}, ${p.y}): the floor it met is in front of the plane`);
    else close(off, back, 1e-6, `(${p.x}, ${p.y}): the plane it met, brought toward the camera`);
  }
  assert.ok(LOOK.towardViewer > 0.2 && LOOK.towardViewer < 1.5);
});

test('over the whole screen his head turns to the cursor’s side (right at it over his head), he looks up at a cursor high over him (up to about 55°), and his face always shows under his cap: chin up, and no further round from the camera than LOOK.faceTurn', () => {
  close(LIMIT.pitchMax, 55 * RAD, 1e-6, 'his head tips up to 55°');
  // (Turned further, from the camera's 36° up, the brim hides both eyes: a model-level count of
  // the eye triangles the camera sees fell from 14 of 18 facing it to 9 at 55° and 5 at 70°.)
  assert.ok(LOOK.faceTurn >= 45 * RAD && LOOK.faceTurn <= 55 * RAD, `faceTurn ${(LOOK.faceTurn / RAD).toFixed(0)}°`);
  for (const distance of [13.3, 26.6, 6.7]) {
    const cam = viewCamera({ distance });
    const body = { yaw: 0 };
    const head = { x: 0, y: 0.92, z: 0 };
    const headAt = cam.screen(head);
    let pitchAbove = -Infinity;
    for (const p of GRID) {
      const at = `zoom ${distance}, cursor (${p.x}, ${p.y})`;
      const { aim } = lookAim('pointer', {
        head,
        yaw: body.yaw,
        camera: cam.position,
        pointer: { floor: null, onNewt: false, ray: cam.ray(p) },
      });
      const a = clampA(aim);
      const g = gaze(body.yaw, a);
      // His face: never further round from the camera than LOOK.faceTurn, and his chin up
      // enough that his cap never hides it (within LOOK.faceUnder under the camera's pitch).
      const toCam = Math.atan2(cam.position.x - head.x, cam.position.z - head.z);
      const face = Math.abs(Math.atan2(Math.sin(Math.atan2(g.x, g.z) - toCam), Math.cos(Math.atan2(g.x, g.z) - toCam)));
      assert.ok(face <= LOOK.faceTurn + 1e-6, `${at}: his face ${(face / RAD).toFixed(0)}° round from the camera`);
      const camPitch = Math.atan2(
        cam.position.y - head.y,
        Math.hypot(cam.position.x - head.x, cam.position.z - head.z),
      );
      assert.ok(a.pitch >= camPitch - LOOK.faceUnder - 1e-6, `${at}: his chin at ${(a.pitch / RAD).toFixed(0)}°`);
      // His gaze on screen: toward the cursor's side always, and right at it over his head
      // (where his neck lets it; lower down his chin comes up so his face shows).
      const tip = cam.screen({ x: head.x + 0.3 * g.x, y: head.y + 0.3 * g.y, z: head.z + 0.3 * g.z });
      const want = Math.atan2(p.y - headAt.y, p.x - headAt.x);
      const got = Math.atan2(tip.y - headAt.y, tip.x - headAt.x);
      const err = Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want)));
      const far = Math.hypot(p.x - headAt.x, p.y - headAt.y) > 40;
      const free =
        Math.abs(aim.yaw) < LIMIT.yaw &&
        face < LOOK.faceTurn - 1e-3 &&
        aim.pitch < LIMIT.pitchMax &&
        aim.pitch > camPitch - LOOK.faceUnder;
      if (far && free && p.y < headAt.y)
        assert.ok(err < 3 * RAD, `${at}: his gaze ${(err / RAD).toFixed(1)}° off the cursor`);
      if (Math.abs(p.x - headAt.x) > 40)
        assert.equal(
          Math.sign(tip.x - headAt.x),
          Math.sign(p.x - headAt.x),
          `${at}: his gaze toward the cursor's side`,
        );
      // Up over his head: he looks up.
      if (p.y < headAt.y - 40 && Math.abs(p.x - headAt.x) < 200) {
        assert.ok(a.pitch > 0.2, `${at}: looks up (${(a.pitch / RAD).toFixed(0)}°)`);
        pitchAbove = Math.max(pitchAbove, a.pitch);
      }
    }
    close(pitchAbove, LIMIT.pitchMax, 1e-6, `zoom ${distance}: right up at a cursor high over him`);
  }
  // Level with his head, far to a side, either way: turned well round toward it, as far as still
  // shows his face (LOOK.faceTurn from the camera), not to side on, where his cap hides it.
  const cam = viewCamera();
  const head = { x: 0, y: 0.92, z: 0 };
  const h = cam.screen(head);
  const toCam = Math.atan2(cam.position.x - head.x, cam.position.z - head.z);
  for (const side of [-1, 1]) {
    const { aim } = lookAim('pointer', {
      head,
      yaw: 0,
      camera: cam.position,
      pointer: { floor: null, onNewt: false, ray: cam.ray({ x: h.x + side * 500, y: h.y }) },
    });
    close(aim.yaw - toCam, side * LOOK.faceTurn, 1e-6, `turned ${side}: ${(aim.yaw / RAD).toFixed(0)}°`);
    assert.ok(
      aim.pitch > 25 * RAD && aim.pitch < 40 * RAD,
      `chin up to show his face: ${(aim.pitch / RAD).toFixed(0)}°`,
    );
  }
  // In front of him, low down: toward the cursor, his cap kept off his face.
  const { aim } = lookAim('pointer', {
    head,
    yaw: 0,
    camera: cam.position,
    pointer: { floor: null, onNewt: false, ray: cam.ray({ x: h.x + 120, y: h.y + 260 }) },
  });
  assert.ok(aim.yaw > 0.15 && aim.yaw < LIMIT.yaw, `toward the cursor (${(aim.yaw / RAD).toFixed(0)}°)`);
  assert.ok(aim.pitch > 25 * RAD, `his chin up so his face shows (${(aim.pitch / RAD).toFixed(0)}°)`);
  // Turned away from the camera, his chin is left be (there's no face to show).
  const away = faceUp({ yaw: 0, pitch: -0.4 }, head, Math.PI, cam.position);
  assert.deepEqual(away, { yaw: 0, pitch: -0.4 });
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
