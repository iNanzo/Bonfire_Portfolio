// How NEWT moves in the invitation toy, from the pure modules: steer.js walks him to a goal,
// turns him to the camera and runs him away from the pointer (pushed off the walls, sliding
// along one when he's cornered, never stuck) with a capped turn rate, and picks wander goals
// inside the room's bounds (the invisible front edge too). carry.js holds him by the collar:
// the anchor eases in and stays in the room, a damped pendulum swings his root and settles, a
// toss uses the last 80 ms, and a fall bounces softly off the walls and lands when his lowest
// foot reaches the floor. blend.js keeps clip weights normalised, runs Idle/Walk/Run on one
// shared phase, and starts a one-shot's fade-out before it ends. lookAt.js clamps and eases
// his look without overshoot, glances by a seeded rng, and the brain zeroes the look's weight
// in Spook, Fall and Land. Last, all of them together under two minutes of rough random play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIPS, GAIT, STRIDE, fadeFor } from '../src/invitation/clips.js';
import { createRng } from '../src/invitation/rng.js';
import { steer, wanderGoal, wrapAngle, STEER } from '../src/invitation/steer.js';
import { grab, holdStep, toss, fallStep, carryFeel, CARRY } from '../src/invitation/carry.js';
import {
  gaitWeights,
  blendStep,
  blendTarget,
  gaitPhase,
  gaitTimes,
  runShare,
  fadeOutDue,
  mainClip,
  NEXT_CLIP,
} from '../src/invitation/blend.js';
import { aimAngles, lookStep, createLook, splitLook, LIMIT, SPLIT, LOOK } from '../src/invitation/lookAt.js';
import { createBrain } from '../src/invitation/brain.js';

const BOUNDS = { minX: -2, maxX: 2, minZ: -2, maxZ: 1.4 };
const DT = 1 / 60;
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inside = (b, p) => p.x >= b.minX - 1e-6 && p.x <= b.maxX + 1e-6 && p.z >= b.minZ - 1e-6 && p.z <= b.maxZ + 1e-6;
const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);

/** Steers a body for `seconds`, checking each frame. */
function drive(body, move, pointer, seconds, each) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const next = steer(body, move, pointer, BOUNDS, DT);
    each?.(next, body);
    body = next;
  }
  return body;
}

// ---- steer --------------------------------------------------------------------------------

test('wander goals stay inside the bounds, the invisible front edge included, at least 1 unit away', () => {
  const rng = createRng(7);
  let from = { x: 0, z: 0 };
  for (let i = 0; i < 500; i++) {
    const g = wanderGoal(rng, BOUNDS, from);
    assert.ok(inside(BOUNDS, g), `goal ${JSON.stringify(g)} is outside`);
    assert.ok(g.z <= BOUNDS.maxZ, 'never past the front edge');
    assert.ok(dist(g, from) >= 1 - 1e-6, 'at least a unit away');
    from = g;
  }
  const a = createRng(3);
  const b = createRng(3);
  const ga = [1, 2, 3].map(() => wanderGoal(a, BOUNDS, { x: 0, z: 0 }));
  const gb = [1, 2, 3].map(() => wanderGoal(b, BOUNDS, { x: 0, z: 0 }));
  assert.deepEqual(ga, gb, 'seeded');
});

test('fleeing grows the distance from the pointer, or from the room centre without one', () => {
  const flee = { mode: 'flee', goal: null, speed: GAIT.run };
  const pointer = { x: 0.3, z: 0.2 };
  let body = { x: 0, z: 0, yaw: 0, speed: 0 };
  const d0 = dist(body, pointer);
  body = drive(body, flee, pointer, 1.2, (b) => assert.ok(inside(BOUNDS, b)));
  assert.ok(dist(body, pointer) > d0 + 0.8, `ran from ${d0.toFixed(2)} to ${dist(body, pointer).toFixed(2)}`);
  assert.ok(body.speed > GAIT.walk, 'at running pace');

  const centre = { x: 0, z: (BOUNDS.minZ + BOUNDS.maxZ) / 2 };
  let alone = { x: 0.4, z: centre.z + 0.1, yaw: 0, speed: 0 };
  const c0 = dist(alone, centre);
  alone = drive(alone, flee, null, 1, (b) => assert.ok(inside(BOUNDS, b)));
  assert.ok(dist(alone, centre) > c0 + 0.6);

  // With no pointer, move.goal (where the brain last saw it) is what he runs from.
  const seen = { x: 0.6, z: -0.3 };
  let lifted = { x: 0.3, z: -0.3, yaw: Math.PI / 2, speed: 0 };
  lifted = drive(lifted, { mode: 'flee', goal: seen, speed: GAIT.run }, null, 1);
  assert.ok(lifted.x < 0.3 - 0.6, `ran from the last-seen spot (x = ${lifted.x.toFixed(2)})`);
});

test('cornered, he slides along the wall away from the pointer and never sticks', () => {
  const flee = { mode: 'flee', goal: null, speed: GAIT.run };
  // Against the back wall, the pointer just in front of him and a little to his right.
  const pointer = { x: 0.15, z: -1.4 };
  let body = { x: 0, z: -1.95, yaw: Math.PI, speed: 0 };
  body = drive(body, flee, pointer, 1.5, (b) => assert.ok(inside(BOUNDS, b)));
  assert.ok(body.x < -0.8, `slid left along the wall (x = ${body.x.toFixed(2)})`);

  // In a corner, the pointer on the diagonal: out along one of the walls, always moving.
  const p2 = { x: -1.5, z: -1.5 };
  let c = { x: -1.95, z: -1.95, yaw: 0, speed: 0 };
  let t = 0;
  c = drive(c, flee, p2, 2, (b, prev) => {
    t += DT;
    assert.ok(inside(BOUNDS, b));
    if (t > 0.6) assert.ok(dist(b, prev) > 0.3 * DT, `stuck at ${t.toFixed(2)} s`);
  });
  assert.ok(dist(c, { x: -1.95, z: -1.95 }) > 1.2, 'got out of the corner');
});

test('turn rate is capped', () => {
  let body = { x: 0, z: 0, yaw: 0, speed: 0 };
  const go = { mode: 'goto', goal: { x: 0, z: -1.5 }, speed: GAIT.walk };
  let maxStep = 0;
  body = drive(body, go, null, 1, (b, prev) => {
    maxStep = Math.max(maxStep, Math.abs(wrapAngle(b.yaw - prev.yaw)));
  });
  assert.ok(maxStep <= STEER.turnRate * DT + 1e-6, `turned ${maxStep} in a frame`);
  assert.ok(maxStep > STEER.turnRate * DT * 0.99, 'and turns at the cap when it must');
  assert.ok(Math.abs(wrapAngle(body.yaw - Math.PI)) < 0.05, 'came round to face the goal');
  const flee = drive(
    { x: 0, z: 0, yaw: 0, speed: 0 },
    { mode: 'flee', speed: GAIT.run, goal: null },
    { x: 0, z: -0.5 },
    0.5,
    (b, prev) => assert.ok(Math.abs(wrapAngle(b.yaw - prev.yaw)) <= STEER.turnRate * DT + 1e-6),
  );
  assert.ok(flee);
});

test('goto arrives inside the arrive radius and stops; face turns him toward the camera', () => {
  const goal = { x: 1, z: -1 };
  let body = { x: -1, z: 0.5, yaw: 0, speed: 0 };
  let top = 0;
  body = drive(body, { mode: 'goto', goal, speed: GAIT.walk }, null, 6, (b) => (top = Math.max(top, b.speed)));
  assert.ok(dist(body, goal) <= STEER.arrive, `stopped ${dist(body, goal)} away`);
  assert.ok(body.speed < 0.05);
  close(top, GAIT.walk, 0.02, 'walks at walking speed');

  // A goal outside the room is clamped to it.
  body = drive({ x: 0, z: 0, yaw: 0, speed: 0 }, { mode: 'goto', goal: { x: 0, z: 9 }, speed: GAIT.walk }, null, 4);
  assert.ok(inside(BOUNDS, body));
  assert.ok(BOUNDS.maxZ - body.z <= STEER.arrive + 1e-6);

  // Face: the camera is on the +z side (NEWT faces +z at yaw 0).
  let f = { x: 0, z: 0, yaw: 2.5, speed: 0.5 };
  f = drive(f, { mode: 'face', goal: null, speed: 0 }, null, 1);
  assert.ok(Math.abs(wrapAngle(f.yaw)) < 0.02);
  assert.equal(f.speed, 0);
  // Given the camera's spot on the floor, he faces that.
  f = drive({ x: 1, z: 0, yaw: 0, speed: 0 }, { mode: 'face', goal: { x: 0, z: 6 }, speed: 0 }, null, 1);
  close(f.yaw, Math.atan2(-1, 6), 0.02);
});

// ---- carry --------------------------------------------------------------------------------

test('carrying: the anchor eases in over about 0.15 s and stays inside the room', () => {
  const c = grab({ x: 0, y: 0.6, z: 0 }, 10);
  const target = { x: 1, y: 1.2, z: 0 };
  holdStep(c, target, 0.05, BOUNDS, 10.05);
  assert.ok(c.anchor.x > 0.01 && c.anchor.x < 0.9, `part way at 50 ms (${c.anchor.x})`);
  holdStep(c, target, 0.05, BOUNDS, 10.1);
  holdStep(c, target, 0.06, BOUNDS, 10.16);
  close(c.anchor.x, 1);
  close(c.anchor.y, 1.2);
  holdStep(c, { x: 9, y: 1.2, z: -9 }, DT, BOUNDS, 10.17);
  close(c.anchor.x, BOUNDS.maxX);
  close(c.anchor.z, BOUNDS.minZ);
});

test('carrying: a drag swings his root like a pendulum, and the swing settles', () => {
  const c = grab({ x: 0, y: 1, z: 0 }, 0);
  let t = 0;
  for (let i = 0; i < 20; i++) holdStep(c, { x: 0, y: 1, z: 0 }, DT, BOUNDS, (t += DT));
  let minZ = 0;
  let maxAbs = 0;
  // Dragged to the right at 3 units/s for a third of a second: his feet trail to the left.
  for (let i = 0; i < 20; i++) {
    holdStep(c, { x: Math.min(1, (i + 1) * 3 * DT), y: 1, z: 0 }, DT, BOUNDS, (t += DT));
    minZ = Math.min(minZ, c.tilt.z);
    maxAbs = Math.max(maxAbs, Math.abs(c.tilt.z), Math.abs(c.tilt.x));
  }
  assert.ok(minZ < -0.1, `tilt.z ${minZ}: positive tilt.z puts his feet toward +x, so a drag to +x tilts it negative`);
  assert.ok(carryFeel(c).dragSpeed >= 0, 'carryFeel reports the drag');
  // Toward the viewer (+z): positive tilt.x (feet trail to -z).
  const c2 = grab({ x: 0, y: 1, z: 0 }, 0);
  let t2 = 0;
  let maxX = 0;
  for (let i = 0; i < 20; i++) holdStep(c2, { x: 0, y: 1, z: 0 }, DT, BOUNDS, (t2 += DT));
  for (let i = 0; i < 20; i++) {
    holdStep(c2, { x: 0, y: 1, z: Math.min(1, (i + 1) * 3 * DT) }, DT, BOUNDS, (t2 += DT));
    maxX = Math.max(maxX, c2.tilt.x);
  }
  assert.ok(maxX > 0.1, `tilt.x ${maxX}`);
  // Held still for 4 s, the swing dies down.
  for (let i = 0; i < 240; i++) {
    holdStep(c, { x: 1, y: 1, z: 0 }, DT, BOUNDS, (t += DT));
    maxAbs = Math.max(maxAbs, Math.abs(c.tilt.z), Math.abs(c.tilt.x));
  }
  assert.ok(Math.abs(c.tilt.z) < 0.02 && Math.abs(c.tiltVel.z) < 0.05, `still swinging: ${c.tilt.z}`);
  assert.ok(maxAbs <= CARRY.tiltMax + 1e-6);
  assert.ok(carryFeel(c).dragSpeed < 0.01);
  // A hard shake reads as one.
  for (let i = 0; i < 30; i++) holdStep(c, { x: 1 + (i % 2 ? 0.3 : -0.3), y: 1, z: 0 }, DT, BOUNDS, (t += DT));
  assert.ok(carryFeel(c).shake > 10, `shake ${carryFeel(c).shake}`);
});

test('a toss uses the last 80 ms of samples, capped', () => {
  const c = grab({ x: 0, y: 1, z: 0 }, 0);
  let t = 0;
  let x = 0;
  for (let i = 0; i < 30; i++) holdStep(c, { x: 0, y: 1, z: (t += DT) * 0.1 }, DT, BOUNDS, t);
  const z = c.anchor.z;
  for (let i = 0; i < 8; i++) {
    x -= 2 * DT;
    holdStep(c, { x, y: 1, z }, DT, BOUNDS, (t += DT));
  }
  const span = c.samples[c.samples.length - 1].t - c.samples[0].t;
  assert.ok(span <= CARRY.window + 1e-6 && span >= CARRY.window - 2 * DT, `kept ${span} s of samples`);
  const v = toss(c);
  close(v.x, -2, 0.05, 'the last 80 ms only');
  close(v.z, 0, 0.05);
  close(v.y, 0, 0.05);

  for (let i = 0; i < 8; i++) {
    x += 50 * DT;
    holdStep(c, { x, y: 1, z }, DT, { minX: -1e3, maxX: 1e3, minZ: -1e3, maxZ: 1e3 }, (t += DT));
  }
  const fling = toss(c);
  assert.ok(Math.hypot(fling.x, fling.z) <= CARRY.tossMax + 1e-6, 'capped');
  assert.ok(Math.hypot(fling.x, fling.z) > CARRY.tossMax - 1e-3);

  for (let i = 0; i < 10; i++) holdStep(c, { x, y: 1, z }, DT, BOUNDS, (t += DT));
  const still = toss(c);
  close(Math.hypot(still.x, still.y, still.z), 0, 1e-6, 'a still release drops straight down');
});

test('falling: gravity, soft wall bounces, and he lands when his lowest foot reaches the floor', () => {
  const FOOT = -0.1;
  let root = { x: 0, y: 1.2, z: 0 };
  let vel = { x: 0, y: 0, z: 0 };
  let n = 0;
  let landed = false;
  let lastVy = 0;
  while (!landed && n < 300) {
    const r = fallStep(root, vel, root.y + FOOT, DT, BOUNDS);
    if (!r.landed) assert.ok(r.vel.y < lastVy, 'gravity speeds him up');
    lastVy = r.vel.y;
    root = r.root;
    vel = r.vel;
    landed = r.landed;
    n++;
  }
  assert.ok(landed);
  close(root.y + FOOT, CARRY.floorY, 1e-6, 'the lowest foot on the floor');
  close(n * DT, Math.sqrt((2 * (1.2 + FOOT)) / CARRY.fallGravity), 2 * DT, 'falls in the time gravity gives');
  assert.deepEqual(vel, { x: 0, y: 0, z: 0 });

  // Thrown at the right wall: he bounces off softly and stays inside.
  root = { x: 1.9, y: 1.2, z: 0 };
  vel = { x: 3, y: 0, z: 0 };
  let bounced = null;
  for (let i = 0; i < 20 && !bounced; i++) {
    const r = fallStep(root, vel, root.y + FOOT, DT, BOUNDS);
    assert.ok(inside(BOUNDS, r.root));
    if (r.vel.x < 0) bounced = r.vel.x;
    root = r.root;
    vel = r.vel;
  }
  assert.ok(bounced != null, 'bounced');
  close(bounced, -3 * CARRY.restitution, 1e-6);

  // Already on the floor: landed at once.
  assert.equal(fallStep({ x: 0, y: 0.1, z: 0 }, { x: 0, y: 0, z: 0 }, -0.05, DT, BOUNDS).landed, true);
});

// ---- blend --------------------------------------------------------------------------------

test('gait weights by speed: Idle at 0, Walk at walking speed, Run at running speed, linear between', () => {
  const near = (w, e) => {
    for (const k of ['Idle', 'Walk', 'Run']) close(w[k], e[k], 1e-6, k);
  };
  near(gaitWeights(0), { Idle: 1, Walk: 0, Run: 0 });
  near(gaitWeights(-1), { Idle: 1, Walk: 0, Run: 0 });
  near(gaitWeights(GAIT.walk / 2), { Idle: 0.5, Walk: 0.5, Run: 0 });
  near(gaitWeights(GAIT.walk), { Idle: 0, Walk: 1, Run: 0 });
  near(gaitWeights((GAIT.walk + GAIT.run) / 2), { Idle: 0, Walk: 0.5, Run: 0.5 });
  near(gaitWeights(GAIT.run), { Idle: 0, Walk: 0, Run: 1 });
  near(gaitWeights(GAIT.run * 2), { Idle: 0, Walk: 0, Run: 1 });
  for (let s = 0; s < 3; s += 0.05) close(sum(gaitWeights(s)), 1);
  assert.deepEqual(blendTarget('Wave', 1), { Wave: 1 });
  near(blendTarget('gait', GAIT.walk), { Idle: 0, Walk: 1, Run: 0 });
});

test('blend weights move toward their targets at 1/fade per second and stay normalised', () => {
  const fade = fadeFor('Idle', 'Wave');
  let w = blendStep({ Idle: 1 }, { Wave: 1 }, fade, 0.05);
  close(w.Wave, 0.05 / fade);
  close(w.Idle, 1 - 0.05 / fade);
  for (let i = 0; i < 20; i++) {
    w = blendStep(w, { Wave: 1 }, fade, DT);
    close(sum(w), 1);
  }
  close(w.Wave, 1);
  close(w.Idle, 0);
  assert.ok('Idle' in w, 'a clip that faded out stays listed at 0, so the page can zero it');

  // Per-clip fades still sum to 1.
  let m = { Idle: 0.5, Walk: 0.5 };
  for (let i = 0; i < 40; i++) {
    m = blendStep(m, { Held: 1 }, { Held: fadeFor('Walk', 'Held'), Idle: 0.25, Walk: 0.1 }, DT);
    close(sum(m), 1);
    assert.ok(Object.values(m).every((v) => v >= 0 && v <= 1));
  }
  close(m.Held, 1);
  // A target that moves (the gait by speed) is followed the same way.
  let g = { Idle: 1, Walk: 0, Run: 0 };
  for (let i = 0; i < 60; i++) g = blendStep(g, gaitWeights(GAIT.walk), 0.25, DT);
  close(g.Walk, 1);
});

test('the gait phase is shared: one phase, a stride blended by the run share, held at speed 0', () => {
  let p = 0;
  for (let i = 0; i < 60; i++) p = gaitPhase(p, DT, GAIT.walk, 0);
  close(p, (GAIT.walk / STRIDE.Walk) % 1, 1e-6, 'a second of walking');
  close(gaitPhase(0.2, 0.1, GAIT.run, 1), (0.2 + (0.1 * GAIT.run) / STRIDE.Run) % 1);
  close(gaitPhase(0, 0.1, 1.4, 0.5), (0.1 * 1.4) / ((STRIDE.Walk + STRIDE.Run) / 2));
  assert.equal(gaitPhase(0.37, 0.1, 0, 0), 0.37, 'standing still holds the phase');
  for (let i = 0, q = 0.9; i < 50; i++) {
    q = gaitPhase(q, 0.07, 1.9, 1);
    assert.ok(q >= 0 && q < 1);
  }
  const times = gaitTimes(0.25, { Walk: CLIPS.Walk.length, Run: CLIPS.Run.length });
  close(times.Walk, 0.25 * CLIPS.Walk.length);
  close(times.Run, 0.25 * CLIPS.Run.length);
  close(runShare({ Idle: 0.2, Walk: 0.4, Run: 0.4 }), 0.5);
  assert.deepEqual(
    [0, 0.3, GAIT.walk, 1.5, GAIT.run].map((v) => mainClip('gait', v)),
    ['Idle', 'Idle', 'Walk', 'Run', 'Run'],
  );
  assert.equal(mainClip('Held', 1), 'Held');
  close(fadeFor(mainClip('gait', GAIT.walk), mainClip('gait', GAIT.run)), CLIPS.Run.fadeIn);
  assert.equal(runShare({ Idle: 1 }), 0);
});

test('a one-shot fades out before it ends', () => {
  for (const clip of ['Wave', 'Spook', 'Land', 'SitDown', 'StandUp']) {
    const next = NEXT_CLIP[clip];
    assert.ok(next, `${clip} has a next clip`);
    const f = fadeFor(clip, next);
    assert.ok(f > 0 && f < CLIPS[clip].length);
    assert.equal(fadeOutDue(clip, f + 0.01), false);
    assert.equal(fadeOutDue(clip, f), true);
    assert.equal(fadeOutDue(clip, 0), true);
  }
  assert.equal(fadeOutDue('Land', 0.2, 'Run'), false, 'the next clip picks the fade');
  assert.equal(fadeOutDue('Land', 0.15, 'Run'), true);

  // The brain leaves a reaction with its fade still to go, so Idle has the whole weight as it ends.
  const brain = createBrain({ seed: 4, calm: true, bounds: BOUNDS });
  let t = 0;
  let clip = null;
  let start = 0;
  let left = null;
  for (let i = 0; i < 200 && left == null; i++) {
    t += DT;
    const info = clip ? { name: clip, time: t - start, remaining: CLIPS[clip].length - (t - start) } : null;
    const out = brain.step({
      t,
      dt: DT,
      events: i === 0 ? [{ type: 'tap', on: 'newt', x: 0, y: 0, t }] : [],
      button: null,
      pointer: null,
      newt: { x: 0, z: 0, yaw: 0, grounded: true },
      clip: info,
      carry: null,
    });
    if (out.clip !== 'gait' && (out.restart || out.clip !== clip)) {
      clip = out.clip;
      start = t;
    }
    if (clip && out.state !== 'react') left = { clip, remaining: CLIPS[clip].length - (t - start), to: out.clip };
  }
  assert.ok(left, 'the reaction ended');
  assert.equal(left.to, 'gait');
  const f = fadeFor(left.clip, 'Idle');
  assert.ok(left.remaining > 0 && left.remaining <= f + 1e-6, `left react with ${left.remaining} s to go`);
  assert.ok(left.remaining > f - DT - 1e-6);
  // Blending from there, the reaction's weight is (within a frame) gone as its clip ends.
  let w = { [left.clip]: 1 };
  for (let s = 0; s < left.remaining - 1e-6; s += DT) w = blendStep(w, blendTarget('gait', 0), f, DT);
  assert.ok(w[left.clip] <= DT / f + 1e-6, `${left.clip} still at ${w[left.clip]} when it ends`);
});

// ---- look-at ------------------------------------------------------------------------------

test('look-at clamps to ±70° of yaw and −30°…+35° of pitch, split 30% neck and 70% head', () => {
  const D = Math.PI / 180;
  close(LIMIT.yaw, 70 * D);
  close(LIMIT.pitchMin, -30 * D);
  close(LIMIT.pitchMax, 35 * D);
  assert.deepEqual(SPLIT, { neck: 0.3, head: 0.7 });
  const head = { x: 0, y: 0.9, z: 0 };
  let a = aimAngles(head, 0, { x: 0, y: 0.9, z: 2 });
  close(a.yaw, 0);
  close(a.pitch, 0);
  a = aimAngles(head, 0, { x: 1, y: 0.9, z: 1 });
  close(a.yaw, Math.PI / 4, 1e-6, 'toward +x is positive yaw');
  a = aimAngles(head, Math.PI / 4, { x: 1, y: 0.9, z: 1 });
  close(a.yaw, 0, 1e-6, "relative to the body's yaw");
  a = aimAngles(head, 0, { x: 0.1, y: 0.9, z: -2 });
  close(a.yaw, LIMIT.yaw, 1e-6, 'behind him: as far as he can turn');
  a = aimAngles(head, 0, { x: -0.1, y: 0.9, z: -2 });
  close(a.yaw, -LIMIT.yaw);
  a = aimAngles(head, 0, { x: 0, y: 1.9, z: 1 });
  close(a.pitch, Math.PI / 4 > LIMIT.pitchMax ? LIMIT.pitchMax : Math.PI / 4, 1e-6, 'up is positive');
  close(aimAngles(head, 0, { x: 0, y: 5, z: 0.5 }).pitch, LIMIT.pitchMax);
  close(aimAngles(head, 0, { x: 0, y: -5, z: 0.5 }).pitch, LIMIT.pitchMin);
  const s = splitLook(1, 0.5);
  close(s.neck.yaw, 0.3);
  close(s.neck.pitch, 0.15);
  close(s.head.yaw, 0.7);
  close(s.head.pitch, 0.35);
  // lookStep keeps inside the limits even when an aim isn't.
  const rng = createRng(1);
  let st = createLook();
  for (let i = 0, t = 0; i < 120; i++) st = lookStep(st, 'camera', { yaw: 3, pitch: -2 }, DT, (t += DT), rng);
  close(st.yaw, LIMIT.yaw, 1e-3);
  close(st.pitch, LIMIT.pitchMin, 1e-3);
});

test('look-at is critically damped: it eases onto a target without overshoot', () => {
  const rng = createRng(1);
  let s = createLook();
  let prevYaw = s.yaw;
  let prevPitch = s.pitch;
  let t = 0;
  let reached = null;
  for (let i = 0; i < 120; i++) {
    s = lookStep(s, 'camera', { yaw: 1, pitch: 0.3 }, DT, (t += DT), rng);
    assert.ok(s.yaw >= prevYaw - 1e-6 && s.yaw <= 1 + 1e-6, `yaw ${s.yaw} at ${t}`);
    assert.ok(s.pitch >= prevPitch - 1e-6 && s.pitch <= 0.3 + 1e-6);
    prevYaw = s.yaw;
    prevPitch = s.pitch;
    if (reached == null && s.yaw > 0.98) reached = t;
  }
  assert.ok(reached != null && reached < 0.8, `reached the target at ${reached} s`);
  for (let i = 0; i < 120; i++) {
    s = lookStep(s, 'camera', { yaw: 0, pitch: 0 }, DT, (t += DT), rng);
    assert.ok(s.yaw <= prevYaw + 1e-6 && s.yaw >= -1e-6, 'and back without overshoot');
    prevYaw = s.yaw;
  }
  // The weight eases too, never jumping.
  s = createLook();
  let w = s.weight;
  for (let i = 0; i < 30; i++) {
    s = lookStep(s, 'forward', null, DT, (t += DT), rng, 0);
    assert.ok(Math.abs(s.weight - w) <= LOOK.weightRate * DT + 1e-6);
    w = s.weight;
  }
  close(s.weight, 0);
});

test('look-at glances are seeded: forward 1.5 s after the pointer goes, every 3–7 s; fleeing glances back about every 1.2 s', () => {
  function idle(seed) {
    const rng = createRng(seed);
    let s = createLook();
    let t = 0;
    const starts = [];
    for (let i = 0; i < 60; i++) s = lookStep(s, 'pointer', { yaw: 0.8, pitch: 0 }, DT, (t += DT), rng);
    const gone = t;
    let glances = s.glances;
    for (let i = 0; i < 40 * 60; i++) {
      s = lookStep(s, 'pointer', null, DT, (t += DT), rng);
      if (t - gone < LOOK.idleAfter - DT) close(s.target.yaw, 0.8, 1e-6, 'holds the last aim for a moment');
      if (s.glances > glances) starts.push(t);
      else if (t - gone > LOOK.idleAfter + DT && starts.length === 0) close(s.target.yaw, 0, 1e-6, 'then forward');
      glances = s.glances;
    }
    const first = starts[0] - gone;
    assert.ok(first >= LOOK.idleAfter + LOOK.glanceMin - DT, `the first glance ${first} s after the pointer went`);
    assert.ok(first <= LOOK.idleAfter + LOOK.glanceMax + DT);
    return starts;
  }
  const a = idle(5);
  assert.deepEqual(a, idle(5), 'the same seed glances the same way');
  assert.notDeepEqual(a, idle(6));
  assert.ok(a.length >= 4 && a.length <= 13, `${a.length} glances in 40 s`);
  for (let i = 1; i < a.length; i++) {
    const gap = a[i] - a[i - 1];
    assert.ok(gap >= LOOK.glanceMin - 1e-6 && gap <= LOOK.glanceMax + DT + 1e-6, `glance gap ${gap}`);
  }

  const rng = createRng(9);
  let s = createLook();
  let t = 0;
  const back = [];
  let n = 0;
  for (let i = 0; i < 12 * 60; i++) {
    s = lookStep(s, 'back', null, DT, (t += DT), rng);
    if (s.glances > n) back.push({ t, yaw: s.target.yaw });
    n = s.glances;
  }
  const mean = (back[back.length - 1].t - back[0].t) / (back.length - 1);
  assert.ok(mean > 0.9 && mean < 1.5, `glances back every ${mean} s`);
  assert.ok(
    back.every((g) => Math.abs(g.yaw) >= 0.8 * LIMIT.yaw),
    'over the shoulder',
  );
});

test('the look weight is 0 in Spook, Fall and Land; camera while held or waving; back while fleeing', () => {
  const brain = createBrain({ seed: 2, calm: true, bounds: BOUNDS });
  let t = 0;
  let grounded = true;
  const step = (extra = {}) => {
    t += DT;
    return brain.step({
      t,
      dt: DT,
      events: [],
      button: null,
      pointer: null,
      newt: { x: 0, z: 0, yaw: 0, grounded },
      clip: null,
      carry: null,
      ...extra,
    });
  };
  const ev = (type) => ({ type, on: 'newt', x: 0, y: 0, t });
  let out = step();
  assert.deepEqual(out.look, { mode: 'pointer', weight: 1 });
  out = step({ button: 'Spook' });
  assert.equal(out.reaction, 'Spook');
  while (out.state === 'react') {
    assert.equal(out.look.weight, 0, 'Spook');
    out = step();
  }
  out = step({ button: 'Wave' });
  for (let i = 0; i < 20; i++) out = step();
  assert.equal(out.reaction, 'Wave');
  assert.deepEqual(out.look, { mode: 'camera', weight: 1 });
  out = step({ events: [ev('grab')] });
  assert.equal(out.state, 'held');
  assert.deepEqual(out.look, { mode: 'camera', weight: 1 });
  grounded = false;
  out = step({ events: [ev('release')] });
  assert.equal(out.state, 'fall');
  for (let i = 0; i < 10; i++) {
    assert.equal(out.look.weight, 0, 'Fall');
    out = step();
  }
  grounded = true;
  out = step();
  assert.equal(out.state, 'land');
  assert.equal(out.look.weight, 0, 'Land');
  out = step({ button: 'Run' });
  assert.equal(out.state, 'flee');
  assert.deepEqual(out.look, { mode: 'back', weight: 1 });
});

// ---- all together -------------------------------------------------------------------------

/** Random input: busy for 14 s, then quiet for 11 s (long enough to sit down by himself). */
function rollInput(r, t, holding) {
  const BUTTONS = ['Wave', 'Spook', 'Sit', 'Run', 'Wander'];
  if (t % 25 >= 14) return { events: [], button: null, pointer: null, quiet: true };
  const roll = r();
  const at = (type, on, more = {}) => [{ type, on, x: 0, y: 0, t, ...more }];
  let events = [];
  if (roll < 0.004) events = at('tap', 'newt');
  else if (roll < 0.008) events = at('tap', 'floor', { floor: { x: r() * 6 - 3, z: r() * 6 - 3 } });
  else if (roll < 0.01) events = at('grab', 'newt');
  else if (holding && roll < 0.05) events = at(r() < 0.5 ? 'release' : 'cancel', 'newt');
  const button = roll > 0.996 ? BUTTONS[Math.floor(r() * BUTTONS.length)] : null;
  const pointer = r() < 0.01 ? (r() < 0.3 ? null : { x: r() * 4 - 2, z: r() * 3.4 - 2 }) : undefined;
  return { events, button, pointer, quiet: false };
}

/** Moves NEWT the way main.js does: carried, falling or steered. */
function moveNewt(w, out, t) {
  if (out.state === 'held') {
    w.carry ??= grab({ x: w.body.x, y: 0.9, z: w.body.z }, t);
    holdStep(w.carry, { x: Math.sin(t * 3) * 3, y: 1.2, z: Math.cos(t * 2) }, DT, BOUNDS, t);
    w.body = { ...w.body, x: w.carry.anchor.x, z: w.carry.anchor.z, speed: 0 };
    return;
  }
  if (out.state === 'fall') {
    if (w.carry)
      w.fall = { root: { x: w.carry.anchor.x, y: w.carry.anchor.y - 0.9, z: w.carry.anchor.z }, vel: toss(w.carry) };
    w.carry = null;
    if (!w.fall) return;
    const f = fallStep(w.fall.root, w.fall.vel, w.fall.root.y, DT, BOUNDS);
    w.fall = f.landed ? null : { root: f.root, vel: f.vel };
    w.body = { ...w.body, x: f.root.x, z: f.root.z };
    return;
  }
  w.carry = null;
  w.fall = null;
  w.body = steer(w.body, out.move, w.pointer, BOUNDS, DT);
}

test('two minutes of rough random play: valid states and clips, always in the room, weights summing to 1', () => {
  const STATES = ['idle', 'walk', 'react', 'flee', 'held', 'fall', 'land', 'sitDown', 'sit', 'standUp'];
  for (const seed of [1, 2, 3]) {
    const r = createRng(seed * 101);
    const brain = createBrain({ seed, calm: false, bounds: BOUNDS, tune: { sitAfter: 6 } });
    const w = { body: { x: 0, z: 0, yaw: 0, speed: 0 }, carry: null, fall: null, pointer: null, clip: null, start: 0 };
    let weights = { Idle: 1 };
    let main = 'Idle';
    let t = 0;
    const visited = new Set();
    for (let i = 0; i < 120 * 60; i++) {
      t += DT;
      const input = rollInput(r, t, w.carry && t - w.carry.t0 > 0.8);
      if (input.quiet) w.pointer = null;
      else if (input.pointer !== undefined) w.pointer = input.pointer;
      const out = brain.step({
        t,
        dt: DT,
        events: input.events,
        button: input.button,
        pointer: w.pointer,
        newt: { x: w.body.x, z: w.body.z, yaw: w.body.yaw, grounded: !w.carry && !w.fall },
        clip: w.clip ? { name: w.clip, time: t - w.start, remaining: CLIPS[w.clip].length - (t - w.start) } : null,
        carry: w.carry ? carryFeel(w.carry) : null,
      });
      visited.add(out.state);
      assert.ok(STATES.includes(out.state), out.state);
      assert.ok(out.clip === 'gait' || out.clip in CLIPS, out.clip);
      assert.ok(out.stress >= 0 && out.stress <= 6 + 1e-6);
      assert.equal(out.buttonsEnabled, out.state !== 'held' && out.state !== 'fall');
      if (out.clip === 'gait') w.clip = null;
      else if (out.restart || out.clip !== w.clip) [w.clip, w.start] = [out.clip, t];
      moveNewt(w, out, t);
      assert.ok(inside(BOUNDS, w.body), `left the room at ${JSON.stringify(w.body)}`);
      assert.ok([w.body.x, w.body.z, w.body.yaw, w.body.speed].every(Number.isFinite));
      const now = mainClip(out.clip, w.body.speed);
      weights = blendStep(weights, blendTarget(out.clip, w.body.speed), fadeFor(main, now), DT);
      main = now;
      close(sum(weights), 1, 1e-6, 'weights');
    }
    for (const st of STATES) assert.ok(visited.has(st), `seed ${seed} never reached ${st}`);
  }
});
