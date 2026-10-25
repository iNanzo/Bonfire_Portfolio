// How NEWT moves in the invitation toy, from the pure modules: steer.js walks him to a goal,
// turns him to the camera and runs him away from the pointer (pushed off the play area's edges,
// the screen's, sliding along one when he's cornered, never stuck) with a capped turn rate, and
// picks wander goals inside the bounds (the front edge over the toolbar too). carry.js holds
// him by the collar: dragged on a camera-facing vertical plane through where he was grabbed,
// the point pressed under the cursor at the grab and his collar from about 0.12 s on (the grab
// offset eases out; no lag), up lifts him (up to
// CARRY.liftMax, far higher than the old fixed carry height) and across moves him across, never
// below his hang height; the anchor stays in the play area, stopping at its edge along the drag
// plane's line (never sliding along it in depth), a damped pendulum swings his root against a
// soft limit and settles (as much, and with no hard shake, when the pointer's spot only moves
// on some frames), a toss uses the last 80 ms, and a fall bounces softly off the edges and
// lands when his lowest foot reaches the floor. blend.js keeps clip weights normalised, runs Idle/Walk/Run on one
// shared phase, and starts a one-shot's fade-out before it ends. lookAt.js clamps and eases
// his look without overshoot, glances by a seeded rng, and the brain zeroes the look's weight
// in Spook, Fall and Land. Last, all of them together under two minutes of rough random play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIPS, GAIT, STRIDE, fadeFor } from '../src/invitation/clips.js';
import { createRng } from '../src/invitation/rng.js';
import { steer, wanderGoal, wrapAngle, clampTo, xRange, STEER } from '../src/invitation/steer.js';
import {
  grab,
  holdStep,
  toss,
  fallStep,
  carryFeel,
  CARRY,
  dragPlane,
  dragTarget,
  gripFor,
  limbStep,
  restLimb,
  LIMP,
} from '../src/invitation/carry.js';
import { rayPlane } from '../src/invitation/gesture.js';
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
import {
  aimAngles,
  aimAt,
  lookStep,
  createLook,
  splitLook,
  viewerAim,
  LIMIT,
  REACH,
  SPLIT,
  LOOK,
} from '../src/invitation/lookAt.js';
import { TUNE, createBrain, talkPhase, dangleLift, DANGLE } from '../src/invitation/brain.js';

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

test('fleeing grows the distance from the pointer, or from the play area’s centre without one', () => {
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

test('turning on the spot he pivots slowly (no faster than STEER.turnStill, about 3.5 rad/s: his feet glide less), and at the full rate once he’s on the move', () => {
  assert.ok(STEER.turnStill >= 3 && STEER.turnStill <= 4.5, `${STEER.turnStill} rad/s standing`);
  // Turning to the camera from side-on (a reaction, sitting down): no speed, a slow pivot.
  let f = { x: 0, z: 0, yaw: Math.PI / 2, speed: 0 };
  let t = 0;
  let most = 0;
  while (Math.abs(wrapAngle(f.yaw)) > 0.01 && t < 2) {
    const next = steer(f, { mode: 'face', goal: { x: 0, z: 6 }, speed: 0 }, null, BOUNDS, DT);
    most = Math.max(most, Math.abs(wrapAngle(next.yaw - f.yaw)) / DT);
    f = next;
    t += DT;
  }
  assert.ok(most <= STEER.turnStill + 1e-6, `pivoted at ${most.toFixed(2)} rad/s`);
  assert.ok(t > 0.35 && t < 0.6, `a quarter turn in ${t.toFixed(2)} s`);
  // A floor tap behind him: slow while he can't walk toward it yet, the full rate once walking.
  let b = { x: 0, z: 0, yaw: 0, speed: 0 };
  let standing = 0;
  let moving = 0;
  for (let i = 0; i < 90; i++) {
    const next = steer(b, { mode: 'goto', goal: { x: 0.3, z: -1.5 }, speed: GAIT.walk }, null, BOUNDS, DT);
    const rate = Math.abs(wrapAngle(next.yaw - b.yaw)) / DT;
    if (b.speed === 0) standing = Math.max(standing, rate);
    else if (b.speed >= STEER.turnFullAt) moving = Math.max(moving, rate);
    b = next;
  }
  assert.ok(standing <= STEER.turnStill + 1e-6, `standing, he turned at ${standing.toFixed(2)} rad/s`);
  assert.ok(moving > STEER.turnStill + 1, `walking, he turns faster (${moving.toFixed(2)} rad/s)`);
  assert.ok(Math.abs(wrapAngle(b.yaw - Math.atan2(0.3, -1.5))) < 0.05, 'and came round to the goal');
});

test('goto arrives inside the arrive radius and stops; face turns him toward the camera', () => {
  const goal = { x: 1, z: -1 };
  let body = { x: -1, z: 0.5, yaw: 0, speed: 0 };
  let top = 0;
  body = drive(body, { mode: 'goto', goal, speed: GAIT.walk }, null, 6, (b) => (top = Math.max(top, b.speed)));
  assert.ok(dist(body, goal) <= STEER.arrive, `stopped ${dist(body, goal)} away`);
  assert.ok(body.speed < 0.05);
  close(top, GAIT.walk, 0.02, 'walks at walking speed');

  // A goal outside the play area is clamped to it.
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

test('carrying: the anchor is the pointer’s spot at once, every frame (no lag), and stays inside the play area', () => {
  const c = grab({ x: 0, y: 0.6, z: 0 }, 10);
  let t = 10;
  for (const target of [
    { x: 0.05, y: 0.62, z: 0 },
    { x: 1, y: 1.2, z: 0 },
    { x: -0.4, y: 2.1, z: 0.3 },
  ]) {
    holdStep(c, target, DT, BOUNDS, (t += DT));
    assert.deepEqual(c.anchor, target, 'on the spot in the frame it comes');
  }
  for (let i = 0; i < 60; i++) {
    holdStep(c, { x: 9, y: 1.2, z: -9 }, DT, BOUNDS, (t += DT));
    assert.ok(inside(BOUNDS, c.anchor), JSON.stringify(c.anchor));
  }
  close(c.anchor.x, BOUNDS.maxX, 1e-6);
  close(c.anchor.z, BOUNDS.minZ, 1e-6);
});

test('dragging: on a camera-facing vertical plane through where he was grabbed; the grab offset eases out over CARRY.offsetEase (about 0.12 s), so the point pressed is under the cursor at the grab and his collar is from then on; up lifts him, across moves him across; never under his hang height or over the highest lift', () => {
  const camera = { x: 1.5, y: 9, z: 13 };
  const ray = (q) => ({ o: camera, d: { x: q.x - camera.x, y: q.y - camera.y, z: q.z - camera.z } });
  const collar = { x: 0.2, y: 0.85, z: 0.1 };
  const plane = dragPlane(camera, collar);
  // The plane: through his collar, upright, square to the way the camera looks across the floor.
  close(plane.normal.y, 0, 1e-6, 'upright');
  close(Math.hypot(plane.normal.x, plane.normal.z), 1, 1e-6);
  const toward = Math.hypot(camera.x - collar.x, camera.z - collar.z);
  close(plane.normal.x, (camera.x - collar.x) / toward, 1e-6);
  close(plane.normal.z, (camera.z - collar.z) / toward, 1e-6);
  assert.deepEqual(plane.point, collar);
  // Grabbed by his belly, below his collar.
  const t0 = 3;
  const low = 1.1;
  const later = t0 + 1;
  assert.ok(CARRY.offsetEase >= 0.08 && CARRY.offsetEase <= 0.16, `the offset eases out over ${CARRY.offsetEase} s`);
  const grabRay = ray({ x: 0.15, y: 0.45, z: 0.12 });
  const grip = gripFor(grabRay, plane, collar, t0);
  const at = rayPlane(grabRay.o, grabRay.d, plane);
  close(grip.offset.x, collar.x - at.x, 1e-6, 'the grab offset: his collar from the grabbed point');
  close(grip.offset.y, collar.y - at.y, 1e-6);
  close(grip.offset.z, collar.z - at.z, 1e-6);
  // The moment he's grabbed, nothing moves: the point pressed is under the cursor.
  for (let frame = 0; frame < 3; frame++)
    assert.deepEqual(dragTarget(grip, grabRay, low, t0), collar, `frame ${frame}, the cursor still`);
  // Then the offset eases out: up where nothing clamps him, less of it left each moment, none
  // once CARRY.offsetEase is up, and from then on his collar is on the cursor's ray, exactly.
  const right = { x: plane.normal.z, z: -plane.normal.x };
  const q0 = { x: at.x + 0.3 * right.x, y: 2, z: at.z + 0.3 * right.z };
  const easing = gripFor(grabRay, plane, collar, t0);
  let left = Infinity;
  for (let k = 1; k <= 6; k++) {
    const p = dragTarget(easing, ray(q0), low, t0 + (k * CARRY.offsetEase) / 6);
    const now = Math.hypot(p.x - q0.x, p.y - q0.y, p.z - q0.z);
    assert.ok(now < left - 1e-6 || now < 1e-6, `${k}/6 of the way: ${now} left, ${left} before`);
    left = now;
  }
  close(left, 0, 1e-6, 'none left once it’s eased out');
  // Held still where he was pressed (by his belly, below his collar): never pulled down to the
  // point pressed, he stays at the height he was grabbed at; up a little, under his hang
  // height, and back: he goes with it, both ways.
  const below = (dy) => ray({ x: collar.x, y: collar.y + dy, z: collar.z });
  close(dragTarget(grip, grabRay, low, later).y, collar.y, 1e-6, 'held still: never pulled down');
  close(dragTarget(grip, below(-0.3), low, later).y, collar.y, 1e-6, 'pressed down where he stood');
  const bit = (low - collar.y) / 2;
  close(dragTarget(grip, below(bit), low, later).y, collar.y + bit, 1e-6, 'a little up');
  close(dragTarget(grip, below(0), low, later).y, collar.y, 1e-6, 'and back down');
  // Once lifted clear to his hang height, his soles stay off the floor: down again, he stops there.
  close(dragTarget(grip, below(low - collar.y + 0.2), low, later).y, low + 0.2, 1e-6, 'lifted clear');
  close(dragTarget(grip, below(0), low, later).y, low, 1e-6, 'his soles off the floor from then on');
  close(dragTarget(grip, below(-1), low, later).y, low, 1e-6);
  // Grabbed higher than his hang height (mid-fall): never under it.
  const high = gripFor(grabRay, plane, { ...collar, y: low + 0.5 }, t0);
  close(dragTarget(high, below(-2), low, later).y, low, 1e-6, 'grabbed high, never under his hang height');
  // Anywhere on the plane within the limits: his collar on the cursor's ray, so under the
  // cursor, and on the plane.
  for (const [across, up] of [
    [0, 1],
    [0.6, 1.2],
    [-1.1, 2.4],
    [1.5, 1.6],
  ]) {
    const q = { x: collar.x + across * right.x, y: collar.y + up, z: collar.z + across * right.z };
    const target = dragTarget(grip, ray(q), low, later);
    close(target.x, q.x, 1e-6, `(${across}, ${up}): under the cursor, across`);
    close(target.y, q.y, 1e-6, `(${across}, ${up}): and up`);
    close(target.z, q.z, 1e-6);
    const off = (target.x - collar.x) * plane.normal.x + (target.z - collar.z) * plane.normal.z;
    close(off, 0, 1e-6, 'on the plane: no nearer the camera, no further');
  }
  // Up lifts him, across moves him across.
  const a = dragTarget(grip, ray({ x: collar.x, y: collar.y + 1, z: collar.z }), low, later);
  const b = dragTarget(grip, ray({ x: collar.x, y: collar.y + 1.5, z: collar.z }), low, later);
  close(b.y - a.y, 0.5, 1e-6);
  close(Math.hypot(b.x - a.x, b.z - a.z), 0, 1e-6);
  const c = dragTarget(grip, ray({ x: collar.x + right.x, y: collar.y + 1, z: collar.z + right.z }), low, later);
  close(c.y, a.y, 1e-6);
  close(Math.hypot(c.x - a.x, c.z - a.z), 1, 1e-6);
  // Limits: never under his hang height, never over the highest lift, far over the old carry's.
  // (High enough to reach the top of a phone's screen at the default zoom, about 4.3 over him.)
  assert.ok(CARRY.liftMax >= 4.5, `the highest lift ${CARRY.liftMax}`);
  close(dragTarget(grip, ray({ x: at.x, y: -3, z: at.z }), low, later).y, low, 1e-6, 'pressed into the floor');
  close(dragTarget(grip, ray({ x: at.x, y: 40, z: at.z }), low, later).y, CARRY.liftMax, 1e-6, 'reaching for the sky');
  // A ray that never meets the plane keeps the last spot.
  const away = { o: camera, d: { x: 0, y: 1, z: 1 } };
  assert.deepEqual(dragTarget(grip, away, low, later), dragTarget(grip, away, low, later));
  assert.ok(Number.isFinite(dragTarget(grip, away, low, later).y));
  // A camera straight over him still gives an upright plane.
  const top = dragPlane({ x: 0.2, y: 20, z: 0.1 }, collar);
  close(top.normal.y, 0, 1e-6);
  close(Math.hypot(top.normal.x, top.normal.z), 1, 1e-6);
});

test('held at the play area’s edge, he stops there (a box, a disc, a trapezoid or a rounded square, round its corners too): the anchor keeps to the drag plane’s line across the floor (never slid along the edge in depth), and the push points on out along it', () => {
  const disc = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, r: 2 };
  const trapezoid = { minX: -1.5, maxX: 1.5, minZ: -2, maxZ: 1.4, minXBack: -2.5, maxXBack: 2.5 };
  // (A rounded square, Bounds.round: the line below runs out through its corners.)
  const rounded = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, round: 1 };
  const inBounds = (b, p) => {
    const q = clampTo(b, p);
    return Math.hypot(q.x - p.x, q.z - p.z) < 1e-6;
  };
  for (const [name, bounds] of [
    ['a box', BOUNDS],
    ['a disc', disc],
    ['a trapezoid', trapezoid],
    ['a rounded square', rounded],
  ])
    for (const side of [1, -1]) {
      // The camera orbited round to the side: the plane's line runs aslant across the floor.
      const camera = { x: 9, y: 6, z: 7 };
      const collar = { x: 0.3, y: 1, z: 0.2 };
      const plane = dragPlane(camera, collar);
      const right = { x: plane.normal.z * side, z: -plane.normal.x * side };
      const c = grab(collar, 0);
      let t = 0;
      /** @type {{x: number, z: number}|null} */
      let stopped = null;
      for (let i = 0; i <= 160; i++) {
        const s = i * 0.05;
        holdStep(c, { x: collar.x + right.x * s, y: 1.2, z: collar.z + right.z * s }, DT, bounds, (t += DT), plane);
        const depth = (c.anchor.x - collar.x) * plane.normal.x + (c.anchor.z - collar.z) * plane.normal.z;
        close(depth, 0, 1e-6, `${name} (${side}), ${s.toFixed(2)} out: on the plane, no nearer the camera, no further`);
        assert.ok(inBounds(bounds, c.anchor), `${name} (${side}): inside, ${JSON.stringify(c.anchor)}`);
        if (stopped) {
          close(c.anchor.x, stopped.x, 1e-6, `${name} (${side}): stopped at the edge`);
          close(c.anchor.z, stopped.z, 1e-6);
          assert.ok(c.push && c.push.x * right.x + c.push.z * right.z > 1 - 1e-6, `${name}: pushed on out along it`);
        } else if (c.push) stopped = { x: c.anchor.x, z: c.anchor.z };
      }
      assert.ok(stopped, `${name} (${side}): he reached the edge`);
      // (The edge is where he stopped: just past it along the line is outside.)
      const past = { x: stopped.x + right.x * 0.01, z: stopped.z + right.z * 0.01 };
      assert.ok(!inBounds(bounds, past), `${name} (${side}): stopped at the edge, not short of it`);
    }
  // A line that misses the play area altogether (he was grabbed out past it): the nearest spot
  // inside, as without a plane.
  const c = grab({ x: 5, y: 1, z: 0 }, 0);
  const plane = dragPlane({ x: 15, y: 6, z: 0 }, { x: 5, y: 1, z: 0 });
  holdStep(c, { x: 5, y: 1, z: 1 }, DT, BOUNDS, DT, plane);
  assert.deepEqual({ x: c.anchor.x, z: c.anchor.z }, clampTo(BOUNDS, { x: 5, z: 1 }));
});

test('the swing’s limit is soft: hard flicks tilt him a little past CARRY.tiltSoft and ease him into it, never past CARRY.tiltMax, and never stop him dead', () => {
  assert.ok(
    CARRY.tiltSoft >= 0.5 && CARRY.tiltSoft < CARRY.tiltMax,
    `${CARRY.tiltSoft} soft, ${CARRY.tiltMax} at most`,
  );
  const c = grab({ x: 0, y: 1, z: 0 }, 0);
  let t = 0;
  let most = 0;
  let jolt = 0;
  let before = 0;
  // The anchor flung back and forth 2.4 units every quarter second (the drive's acceleration
  // capped at accelMax): the old hard stop zeroed a swing of several radians a second.
  for (let i = 0; i < 240; i++) {
    const x = Math.floor(i / 15) % 2 ? 1.2 : -1.2;
    holdStep(c, { x, y: 1, z: 0 }, DT, BOUNDS, (t += DT));
    most = Math.max(most, Math.abs(c.tilt.z));
    jolt = Math.max(jolt, Math.abs(c.tiltVel.z - before));
    before = c.tiltVel.z;
  }
  assert.ok(most > CARRY.tiltSoft, `${most.toFixed(3)} rad: past the soft limit`);
  assert.ok(most < CARRY.tiltMax, `${most.toFixed(3)} rad: never at the hard one`);
  // (The old hard stop took about 10 rad/s off it in one frame.)
  assert.ok(jolt < 3.5, `the swing's speed changed by at most ${jolt.toFixed(2)} rad/s in a frame`);
});

test('carrying: a swing reads the same when the pointer’s spot only moves every second or third frame (a 60 Hz finger on a 120–144 Hz screen): as big, and no hard shake', () => {
  /** A gentle swing, ±0.3 units at 1 Hz for 4 s, the spot moving on every `every`th frame. */
  const swingAt = (fps, every) => {
    const dt = 1 / fps;
    const c = grab({ x: 0, y: 1.2, z: 0 }, 0);
    let target = { x: 0, y: 1.2, z: 0 };
    let tilt = 0;
    let shake = 0;
    for (let i = 1; i <= 4 * fps; i++) {
      const t = i * dt;
      if (i % every === 0) target = { x: 0.3 * Math.sin(2 * Math.PI * t), y: 1.2, z: 0 };
      holdStep(c, target, dt, BOUNDS, t);
      if (t > 0.3) {
        tilt = Math.max(tilt, Math.abs(c.tilt.z));
        shake = Math.max(shake, c.shake);
      }
    }
    return { tilt, shake };
  };
  const smooth = swingAt(120, 1);
  assert.ok(smooth.tilt > 0.5, `a swing with the spot moving every frame (${smooth.tilt.toFixed(2)} rad)`);
  assert.ok(smooth.shake < TUNE.shakeHard, `and no hard shake (${smooth.shake.toFixed(1)})`);
  for (const [fps, every] of [
    [120, 2],
    [144, 2],
    [144, 3],
    [240, 2],
  ]) {
    const r = swingAt(fps, every);
    const at = `${fps} fps, the spot moving every ${every} frames`;
    assert.ok(r.tilt > 0.9 * smooth.tilt, `${at}: swings ${r.tilt.toFixed(2)} rad (${smooth.tilt.toFixed(2)})`);
    assert.ok(r.shake < TUNE.shakeHard, `${at}: shake at most ${r.shake.toFixed(1)}, under ${TUNE.shakeHard}`);
  }
  // A gentle lift (half a unit in a second) at 131 fps with the spot moving every other frame.
  const c = grab({ x: 0, y: 0.7, z: 0 }, 0);
  let target = { x: 0, y: 0.7, z: 0 };
  let most = 0;
  for (let i = 1; i <= 131 * 1.2; i++) {
    const t = i / 131;
    if (i % 2 === 0) target = { x: 0, y: 0.7 + 0.5 * Math.min(1, t), z: 0 };
    holdStep(c, target, 1 / 131, BOUNDS, t);
    if (t > 0.2) most = Math.max(most, c.shake);
  }
  assert.ok(most < TUNE.shakeSoft, `a gentle lift is no shake at all (${most.toFixed(1)})`);
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
  // A hard shake (a hand's: ±0.15 units, four times a second) reads as one.
  let most = 0;
  for (let i = 0; i < 60; i++) {
    holdStep(c, { x: 1 + 0.15 * Math.sin(2 * Math.PI * 4 * i * DT), y: 1, z: 0 }, DT, BOUNDS, (t += DT));
    most = Math.max(most, carryFeel(c).shake);
  }
  assert.ok(most > TUNE.shakeHard, `shake ${most}`);
});

test('the limp integrator (carry.js limbStep): a point mass on a limb, sprung back to the clip’s direction at about 7 rad/s with damping about 0.35, swung by the force on it, its length kept, never past its cone', () => {
  assert.ok(LIMP.omega >= 6 && LIMP.omega <= 8, `ω ${LIMP.omega}`);
  assert.ok(LIMP.zeta >= 0.3 && LIMP.zeta <= 0.4, `ζ ${LIMP.zeta}`);
  close(LIMP.cone, (60 * Math.PI) / 180, 0.02, 'a 60° cone');
  const len = Math.hypot(0.05, -0.12);
  const rest = { x: 0.05, y: -0.12, z: 0 };
  const angle = (a, b) =>
    Math.acos(
      Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z))),
    );
  // At rest with nothing on it, it stays put.
  const m = restLimb(rest);
  for (let i = 0; i < 60; i++) limbStep(m, rest, { x: 0, y: 0, z: 0 }, DT);
  close(angle(m.at, rest), 0, 1e-6, 'at rest it stays put');
  // A steady push across settles it a little way over (ω²·displacement balances the push).
  for (let i = 0; i < 600; i++) limbStep(m, rest, { x: 0, y: 0, z: 0.5 }, DT);
  close(Math.hypot(m.at.x, m.at.y, m.at.z), len, 1e-6, 'its length kept');
  close(m.at.z, 0.5 / LIMP.omega ** 2, 0.002, 'settled where the spring balances the push');
  // Let go, it swings back past the clip's pose and settles: about 2π/(ω√(1−ζ²)) a swing, each
  // swing back about e^(−2πζ/√(1−ζ²)) of the one before.
  const peaks = [];
  let before = m.at.z;
  let rising = false;
  for (let i = 0; i < 300; i++) {
    limbStep(m, rest, { x: 0, y: 0, z: 0 }, DT);
    const z = m.at.z;
    if (rising && z < before) peaks.push({ i: i - 1, z: before });
    rising = z > before;
    before = z;
  }
  assert.ok(peaks.length >= 1, 'it swings back up');
  const damped = Math.sqrt(1 - LIMP.zeta ** 2);
  const period = (2 * Math.PI) / (LIMP.omega * damped);
  close(peaks[0].i * DT, period, 0.1, 'about a period to swing back up');
  close(
    peaks[0].z / (0.5 / LIMP.omega ** 2),
    Math.exp((-2 * Math.PI * LIMP.zeta) / damped),
    0.05,
    'its swing dies away',
  );
  close(angle(m.at, rest), 0, 0.01, 'settled in 5 s');
  // However hard it's flung, never past its cone.
  let most = 0;
  for (let i = 0; i < 120; i++) {
    limbStep(m, rest, { x: 300 * Math.sign(Math.sin(i / 7)), y: 200, z: -300 }, DT);
    most = Math.max(most, angle(m.at, rest));
    close(Math.hypot(m.at.x, m.at.y, m.at.z), len, 1e-6);
  }
  assert.ok(most <= LIMP.cone + 1e-6, `${most} rad`);
  // A cone of its own (an earring's: it swings freely about straight down).
  const e = restLimb({ x: 0, y: -0.06, z: 0 });
  const loose = { ...LIMP, omega: 12, zeta: 0.15, cone: 1.2 };
  for (let i = 0; i < 30; i++) limbStep(e, { x: 0, y: -0.06, z: 0 }, { x: -400, y: 0, z: 0 }, DT, loose);
  assert.ok(angle(e.at, { x: 0, y: -1, z: 0 }) <= 1.2 + 1e-6);
  assert.ok(e.at.x < 0, 'pushed −x, it swings −x');
});

test('in the intro’s boxes: Walk and Run step in place at their own pace (talkPhase), and Held, Thrash and Fall dangle him from an unseen hand, his lowest sole clear of the floor, Fall a short hop (dangleLift)', () => {
  // In place: on round by dt over the clip's length, whatever his speed (none).
  close(talkPhase(0.25, 0.1, 0.5), 0.45, 1e-6);
  close(talkPhase(0.9, 0.2, 0.5), 0.3, 1e-6, 'round again');
  close(talkPhase(0.3, 0.1, 0), 0.3, 1e-6, 'no clip: held');
  // Dangling: lifted by as much as his lowest sole sits under the gap, by their share of the mix.
  close(dangleLift({ hang: 1, sole: -0.05 }), DANGLE.gap + 0.05, 1e-6, 'his toes under the floor');
  close(dangleLift({ hang: 1, sole: DANGLE.gap + 0.1 }), 0, 1e-6, 'clear already');
  close(dangleLift({ hang: 0.5, sole: -0.05 }), 0.5 * (DANGLE.gap + 0.05), 1e-6, 'half in');
  close(dangleLift({ hang: 0, sole: -0.05 }), 0, 1e-6, 'none of it playing');
  assert.ok(DANGLE.gap > 0 && DANGLE.gap <= 0.1, `${DANGLE.gap}`);
  // Fall: a hop, up and back down over its length.
  close(dangleLift({ hang: 1, sole: DANGLE.gap, fall: 1, fallU: 0 }), 0, 1e-6);
  close(dangleLift({ hang: 1, sole: DANGLE.gap, fall: 1, fallU: 0.5 }), DANGLE.hop, 1e-6, 'its top halfway');
  close(dangleLift({ hang: 1, sole: DANGLE.gap, fall: 1, fallU: 1 }), 0, 1e-6, 'down by its end');
  assert.ok(DANGLE.hop >= 0.08 && DANGLE.hop <= 0.25, `a short hop: ${DANGLE.hop}`);
});

test('a toss uses the last 80 ms of samples, capped', () => {
  const c = grab({ x: 0, y: 1, z: 0 }, 0);
  let t = 0;
  let x = 0;
  for (let i = 0; i < 30; i++) holdStep(c, { x: 0, y: 1, z: (t += DT) * 0.1 }, DT, BOUNDS, t);
  const z = c.anchor.z;
  // (Long enough for the anchor to have come up to the drag's speed.)
  for (let i = 0; i < 40; i++) {
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

  for (let i = 0; i < 60; i++) holdStep(c, { x, y: 1, z }, DT, BOUNDS, (t += DT));
  const still = toss(c);
  close(Math.hypot(still.x, still.y, still.z), 0, 1e-6, 'a still release drops straight down');
});

test('let go while the pointer pushes him out against the rim, he drops right there: no toss across, so he never skids along it or flies back off it', () => {
  const DISC = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, r: 2 };
  // Flicked out along +x, fast, the pointer's spot ending well past the rim.
  const c = grab({ x: 1, y: 1.1, z: 0.65 }, 0);
  let t = 0;
  for (let i = 1; i <= 12; i++) holdStep(c, { x: 1 + 0.16 * i, y: 1.1, z: 0.65 }, DT, DISC, (t += DT));
  assert.ok(Math.hypot(c.anchor.x, c.anchor.z) > 1.8, 'he got out near the rim');
  const v = toss(c);
  assert.deepEqual([v.x, v.z], [0, 0], `no speed across (${JSON.stringify(v)})`);
  // The fall that follows never turns back against the flick, and he lands about where he was let go.
  let root = { x: c.anchor.x, y: 0.8, z: c.anchor.z };
  const from = { ...root };
  let vel = v;
  for (let i = 0; i < 60; i++) {
    const f = fallStep(root, vel, root.y - 0.55, DT, DISC);
    assert.ok(f.vel.x >= -1e-9, `frame ${i}: back against the flick at ${f.vel.x.toFixed(2)}`);
    root = f.root;
    vel = f.vel;
    if (f.landed) break;
  }
  assert.ok(dist(root, from) < 1e-9, `landed ${dist(root, from).toFixed(2)} from where he was let go`);
  // Let go inside the disc, the pointer inside too: the whole toss.
  const d = grab({ x: 0, y: 1.1, z: 0 }, 0);
  let x = 0;
  t = 0;
  for (let i = 0; i < 40; i++) holdStep(d, { x: (x += 2 * DT), y: 1.1, z: 0 }, DT, DISC, (t += DT));
  close(toss(d).x, 2, 0.05, 'inside, the toss is whole');
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

test('falling in a rounded square: a drop or a throw into a corner stays inside its arc (not the box round it), bouncing softly off the arc', () => {
  const b = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, round: 1 };
  const inArc = (p) => Math.hypot(Math.max(0, Math.abs(p.x) - 1), Math.max(0, Math.abs(p.z) - 1)) <= 1 + 1e-6;
  const FOOT = -0.1;
  // Dropped still in a corner, outside the arc but inside the box: it lands inside the arc.
  let root = { x: 1.9, y: 1, z: -1.9 };
  let vel = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 120; i++) {
    const r = fallStep(root, vel, root.y + FOOT, DT, b);
    root = r.root;
    vel = r.vel;
    if (r.landed) break;
  }
  assert.ok(inArc(root), `landed ${JSON.stringify(root)} inside the corner’s arc`);
  // Thrown diagonally into a corner: inside the arc every frame, its speed out of it turned back, softened.
  root = { x: 1, y: 1.2, z: 1 };
  vel = { x: 3, y: 0, z: 3 };
  let bounced = null;
  for (let i = 0; i < 60 && !bounced; i++) {
    const r = fallStep(root, vel, root.y + FOOT, DT, b);
    assert.ok(inArc(r.root), `frame ${i}: ${JSON.stringify(r.root)} inside the arc`);
    if (r.vel.x < 0 && r.vel.z < 0) bounced = r.vel;
    root = r.root;
    vel = r.vel;
  }
  assert.ok(bounced, 'bounced off the arc');
  close(Math.hypot(bounced.x, bounced.z), Math.hypot(3, 3) * CARRY.restitution, 1e-6, 'softly:');
  // Along a straight side it's the box's as before.
  root = { x: 1.98, y: 1.2, z: 0 };
  vel = { x: 3, y: 0, z: 0 };
  const r = fallStep(root, vel, root.y + FOOT, DT, b);
  close(r.root.x, 2, 1e-9);
  close(r.vel.x, -3 * CARRY.restitution, 1e-9);
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

test('a look at a point clamps to his neck’s ±70° of yaw and −20°…+55° of pitch; the look splits between his chest (big looks only) and 30% neck, 70% head of the rest; lookStep keeps to his reach', () => {
  const D = Math.PI / 180;
  close(LIMIT.yaw, 70 * D);
  close(LIMIT.pitchMin, -20 * D);
  close(LIMIT.pitchMax, 55 * D);
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
  // A look at the viewer: the neck bones alone.
  let s = splitLook(0.4, 0.5);
  assert.deepEqual(s.chest, { yaw: 0, pitch: 0 });
  close(s.neck.yaw, 0.12);
  close(s.neck.pitch, 0.15);
  close(s.head.yaw, 0.28);
  close(s.head.pitch, 0.35);
  // A big one: the chest takes some, the neck bones split the rest, and it all adds up.
  s = splitLook(1.5, 1.2);
  assert.ok(s.chest.yaw > 0.1 && s.chest.pitch > 0.1, 'his chest turns and leans with it');
  close(s.chest.yaw + s.neck.yaw + s.head.yaw, 1.5, 1e-9);
  close(s.chest.pitch + s.neck.pitch + s.head.pitch, 1.2, 1e-9);
  close(s.neck.yaw / (s.neck.yaw + s.head.yaw), 0.3, 1e-9);
  // lookStep keeps inside his reach even when an aim isn't.
  const rng = createRng(1);
  let st = createLook();
  for (let i = 0, t = 0; i < 120; i++) st = lookStep(st, 'camera', { yaw: 3, pitch: -2 }, DT, (t += DT), rng);
  close(st.yaw, REACH.yaw, 1e-3);
  close(st.pitch, REACH.pitchMin, 1e-3);
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

test('look-at glances are seeded: forward 1.5 s after the pointer goes, every 3–7 s; fleeing glances back every 2.2–3.4 s', () => {
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
  assert.ok(mean > LOOK.backEveryMin && mean < LOOK.backEveryMax, `glances back every ${mean} s`);
  assert.ok(
    back.every((g) => Math.abs(g.yaw) >= 0.8 * LIMIT.yaw),
    'over the shoulder',
  );
});

test('the look weight is 0 in Spook, Fall and Land (fading out slowly in Fall and Land); camera while waving; while held, a light look (about 0.15) aimed down, so his head hangs; back while fleeing', () => {
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
  assert.equal(out.look.mode, 'forward', 'held: ahead, with glances');
  assert.ok(out.look.weight >= 0.1 && out.look.weight <= 0.2, `held: a light look, ${out.look.weight}`);
  assert.ok((out.look.pitch ?? 0) < -0.2, `held: aimed down, ${out.look.pitch}`);
  grounded = false;
  out = step({ events: [ev('release')] });
  assert.equal(out.state, 'fall');
  for (let i = 0; i < 10; i++) {
    assert.equal(out.look.weight, 0, 'Fall');
    assert.equal(out.look.ease, TUNE.dropLookEase, 'Fall: slowly');
    out = step();
  }
  assert.ok(TUNE.dropLookEase > 3 / LOOK.weightRate, `${TUNE.dropLookEase} s, not a fifth of one`);
  grounded = true;
  out = step();
  assert.equal(out.state, 'land');
  assert.equal(out.look.weight, 0, 'Land');
  assert.equal(out.look.ease, TUNE.dropLookEase, 'Land: slowly');
  out = step({ button: 'Run' });
  assert.equal(out.state, 'flee');
  assert.deepEqual(out.look, { mode: 'back', weight: 1, at: null }, 'the Run button with no pointer: no pursuer');
  out = step({ pointer: { x: 0.5, z: 0.5 } });
  assert.deepEqual(out.look, { mode: 'back', weight: 1, at: { x: 0.5, z: 0.5 } }, 'the pointer: who he runs from');
});

test('dropped facing away, his head comes round gently over the fall and the landing, never snapping round', () => {
  const brain = createBrain({ seed: 2, calm: true, bounds: BOUNDS });
  const look = createLook();
  const rng = createRng(4);
  const D = 180 / Math.PI;
  // The camera off to his side: held, he looks round at it ("ahead", the viewer, as lookAim
  // gives it: viewerAim, kept to his neck's LIMIT) as far as his neck goes, by his held look's
  // light weight (TUNE.heldLook: his head hangs).
  const camera = { yaw: LIMIT.yaw, pitch: 0.3 };
  let t = 0;
  let grounded = true;
  const frame = (extra = {}) => {
    t += DT;
    const out = brain.step({
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
    const ahead = out.state === 'held' ? camera : { yaw: 0, pitch: 0 };
    lookStep(look, out.look.mode, null, DT, t, rng, out.look.weight, ahead, out.look.ease);
    return out;
  };
  const turned = () => look.yaw * look.weight;
  let out = frame({ events: [{ type: 'grab', on: 'newt', x: 0, y: 0, t }] });
  for (let i = 0; i < 90; i++) out = frame();
  assert.equal(out.state, 'held');
  const full = turned();
  assert.ok(
    full > 0.95 * TUNE.heldLook * LIMIT.yaw,
    `held, his head turned round to the camera (${(full * D).toFixed(0)}°)`,
  );
  // Let go: a fall of about 0.23 s (from the hang), then the landing, then idle.
  grounded = false;
  out = frame({ events: [{ type: 'release', on: 'newt', x: 0, y: 0, t }] });
  assert.equal(out.state, 'fall');
  let last = turned();
  let fastest = Math.abs(full - last) / DT;
  for (let i = 0; i < 13; i++) {
    out = frame();
    fastest = Math.max(fastest, Math.abs(turned() - last) / DT);
    last = turned();
  }
  const landing = turned();
  grounded = true;
  for (let i = 0; i < 60; i++) {
    out = frame();
    fastest = Math.max(fastest, Math.abs(turned() - last) / DT);
    last = turned();
  }
  assert.equal(out.state, 'idle');
  // (His held look is light, TUNE.heldLook: what turn there is goes in a fifth of a second or so,
  // gently.)
  assert.ok(landing <= full + 1e-9, `no further round as he lands (${(landing * D).toFixed(0)}°)`);
  assert.ok(fastest * D <= 200, `never faster than 200°/s (${(fastest * D).toFixed(0)}°/s)`);
  assert.ok(Math.abs(turned()) * D < 5, `round to ahead a second after (${(turned() * D).toFixed(1)}°)`);
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

test('two minutes of rough random play: valid states and clips, always in the play area, weights summing to 1', () => {
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
      assert.ok(inside(BOUNDS, w.body), `left the play area at ${JSON.stringify(w.body)}`);
      assert.ok([w.body.x, w.body.z, w.body.yaw, w.body.speed].every(Number.isFinite));
      const now = mainClip(out.clip, w.body.speed);
      weights = blendStep(weights, blendTarget(out.clip, w.body.speed), fadeFor(main, now), DT);
      main = now;
      close(sum(weights), 1, 1e-6, 'weights');
    }
    for (const st of STATES) assert.ok(visited.has(st), `seed ${seed} never reached ${st}`);
  }
});

// ---- a play area that widens toward the back ----------------------------------------------
// With the room gone the play area is the floor on screen (area.js), which perspective makes a
// trapezoid: minX/maxX hold at the front (maxZ), minXBack/maxXBack at the back (minZ).

const TRAP = { minX: -1.3, maxX: 1.3, minZ: -10, maxZ: 5, minXBack: -2.8, maxXBack: 2.8 };
/** Inside the trapezoid: z in range, x between its slanted sides at that z. */
const insideTrap = (p) => {
  const [lo, hi] = xRange(TRAP, Math.min(TRAP.maxZ, Math.max(TRAP.minZ, p.z)));
  return p.z >= TRAP.minZ - 1e-6 && p.z <= TRAP.maxZ + 1e-6 && p.x >= lo - 1e-6 && p.x <= hi + 1e-6;
};

test('a play area that widens toward the back: its sides slant, and a box is still a box', () => {
  assert.deepEqual(xRange(TRAP, TRAP.maxZ), [-1.3, 1.3]);
  assert.deepEqual(xRange(TRAP, TRAP.minZ), [-2.8, 2.8]);
  const mid = xRange(TRAP, (TRAP.minZ + TRAP.maxZ) / 2);
  close(mid[0], -2.05, 1e-9);
  close(mid[1], 2.05, 1e-9);
  assert.deepEqual(xRange(BOUNDS, 0), [BOUNDS.minX, BOUNDS.maxX], 'no back corners: a box');
  // Clamped to the slanted side at the point's own depth (after its depth is clamped).
  const c = clampTo(TRAP, { x: 9, z: -2.5 });
  close(c.x, xRange(TRAP, -2.5)[1], 1e-9);
  assert.equal(c.z, -2.5);
  assert.deepEqual(clampTo(TRAP, { x: -9, z: 20 }), { x: -1.3, z: 5 });
});

test('in a widening play area, wander goals use its whole width and stay inside it', () => {
  const rng = createRng(11);
  let from = { x: 0, z: 0 };
  let wide = 0;
  for (let i = 0; i < 400; i++) {
    const g = wanderGoal(rng, TRAP, from);
    assert.ok(insideTrap(g), `goal ${JSON.stringify(g)} is outside`);
    if (Math.abs(g.x) > TRAP.maxX + 0.2) wide++;
    from = g;
  }
  assert.ok(wide > 40, `${wide} goals out past the front's width, toward the back`);
});

test('in a widening play area, walking, fleeing and carrying stay inside its slanted sides', () => {
  const run = (body, move, pointer, seconds, each) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const next = steer(body, move, pointer, TRAP, DT);
      each?.(next, body, i * DT);
      body = next;
    }
    return body;
  };
  // A goal out past the slanted side: he walks to the side and stops there, inside.
  const b = run({ x: 0, z: 0, yaw: 0, speed: 0 }, { mode: 'goto', goal: { x: 6, z: -4 }, speed: GAIT.walk }, null, 8);
  assert.ok(insideTrap(b), JSON.stringify(b));
  assert.ok(b.x > TRAP.maxX + 0.3, `he got out past the front's width (x = ${b.x.toFixed(2)})`);
  // Fleeing into a slanted side, he slides along it; cornered at the front, he gets out.
  const flee = { mode: 'flee', goal: null, speed: GAIT.run };
  const threat = { x: 0.6, z: -5.2 };
  const fled = run({ x: 1.6, z: -5, yaw: Math.PI / 2, speed: 0 }, flee, threat, 2, (n, prev, t) => {
    assert.ok(insideTrap(n), `fled out at ${JSON.stringify(n)}`);
    if (t > 0.6) assert.ok(dist(n, prev) > 0.3 * DT, `stuck at ${t.toFixed(2)} s`);
  });
  assert.ok(dist(fled, threat) > 2.5, `got well away (${dist(fled, threat).toFixed(2)})`);
  run({ x: 1.25, z: 4.95, yaw: 0, speed: 0 }, flee, { x: 0.8, z: 4.4 }, 2, (n, prev, t) => {
    assert.ok(insideTrap(n), `fled out at ${JSON.stringify(n)}`);
    if (t > 0.6) assert.ok(dist(n, prev) > 0.3 * DT, `stuck in the corner at ${t.toFixed(2)} s`);
  });
  // Carried out past a side: the anchor stays inside.
  const c = grab({ x: 0, y: 0.6, z: -6 }, 0);
  for (let i = 1; i <= 60; i++) holdStep(c, { x: 9, y: 1.2, z: -6 }, DT, TRAP, i * DT);
  assert.ok(insideTrap(c.anchor), JSON.stringify(c.anchor));
  close(c.anchor.x, xRange(TRAP, -6)[1], 1e-6, 'up against the slanted side');
  // Thrown at the slanted side: he bounces off softly and stays inside.
  let root = { x: 2, y: 1.2, z: -6 };
  let vel = { x: 3, y: 0, z: 0 };
  let bounced = false;
  for (let i = 0; i < 30; i++) {
    const r = fallStep(root, vel, root.y - 0.1, DT, TRAP);
    assert.ok(insideTrap(r.root), JSON.stringify(r.root));
    if (r.vel.x < 0) bounced = true;
    root = r.root;
    vel = r.vel;
  }
  assert.ok(bounced, 'bounced off the side');
});

// ---- looking at the viewer ------------------------------------------------------------------
// From the toy's camera (36° up) his cap's brim hides his face unless he lifts his head, so
// "ahead" means toward the viewer: the camera, faded back to straight ahead as he turns away.

test('ahead means toward the viewer: up at the camera, fading to straight ahead as he turns away from it', () => {
  const D = Math.PI / 180;
  const head = { x: 0, y: 0.8, z: 0 };
  const cam = { x: 0, y: 10, z: 15 };
  let a = viewerAim(head, 0, cam);
  close(a.yaw, 0);
  close(a.pitch, Math.atan2(9.2, 15), 1e-9, 'up at the camera');
  // Facing +x the camera is a quarter turn to his right: as far as his neck goes.
  a = viewerAim(head, Math.PI / 2, cam);
  close(a.yaw, -LIMIT.yaw);
  close(a.pitch, Math.atan2(9.2, 15), 1e-9);
  // Facing away: straight ahead (no cricked neck, no looking at the sky).
  assert.deepEqual(viewerAim(head, Math.PI, cam), { yaw: 0, pitch: 0 });
  // Half way through the fade, half the look.
  a = viewerAim(head, 125 * D, cam);
  close(a.pitch, Math.atan2(9.2, 15) / 2, 1e-9);
  close(a.yaw, -LIMIT.yaw / 2, 1e-9);
  // The floor bias: a pitch added before the clamp.
  const plain = aimAt(head, 0, { x: 0, y: 0, z: 2 });
  close(aimAngles(head, 0, { x: 0, y: 0, z: 2 }, 10 * D).pitch, plain.pitch + 10 * D, 1e-9);
  close(aimAngles(head, 0, { x: 0, y: 0, z: 0.1 }, 10 * D).pitch, LIMIT.pitchMin, 1e-9, 'still clamped');
});

test('running away he looks where he runs, chin level (whatever the camera), with a brief glance back over his shoulder every 2.2–3.4 s: toward the pursuer’s side when there is one, either side when there isn’t', () => {
  const D = Math.PI / 180;
  const ahead = { yaw: 0, pitch: LOOK.runPitch };
  /** 12 s of fleeing with the pursuer at `at` (an aim, or null): each glance, and the targets. */
  const flee = (seed, at) => {
    const rng = createRng(seed);
    const s = createLook();
    let t = 0;
    let n = 0;
    const glances = [];
    let glancing = 0;
    let frames = 0;
    for (let i = 0; i < 12 * 60; i++) {
      lookStep(s, 'back', at, DT, (t += DT), rng, 1, ahead);
      if (s.glances > n) glances.push({ t, yaw: s.target.yaw, pitch: s.target.pitch });
      n = s.glances;
      frames++;
      if (s.glance) glancing++;
      else {
        close(s.target.yaw, 0, 1e-9, 'where he runs');
        close(s.target.pitch, LOOK.runPitch, 1e-9, 'chin level');
      }
      assert.ok(s.target.pitch <= 10 * D, 'never up at the sky or the viewer');
    }
    return { glances, share: glancing / frames };
  };
  const gaps = (g) => g.slice(1).map((x, i) => x.t - g[i].t);
  /** @type {number[]} the sides he glances to with no pursuer, over every seed */
  const unchased = [];
  for (let seed = 1; seed <= 12; seed++) {
    // The pursuer behind him on his left, then on his right, then nowhere.
    for (const at of [{ yaw: -2.6, pitch: -0.4 }, { yaw: 2.9, pitch: -0.2 }, null]) {
      const { glances, share } = flee(seed, at);
      // (The first LOOK.backFirstMin–backFirstMax s in, then every backEveryMin–backEveryMax s.)
      const fewest = 1 + Math.floor((12 - LOOK.backFirstMax) / LOOK.backEveryMax);
      const most = 1 + Math.floor((12 - LOOK.backFirstMin) / LOOK.backEveryMin);
      assert.ok(glances.length >= fewest && glances.length <= most, `seed ${seed}: ${glances.length} glances in 12 s`);
      assert.ok(glances[0].t <= LOOK.backEveryMin + 1e-6, `the first ${glances[0].t.toFixed(2)} s in`);
      for (const gap of gaps(glances))
        assert.ok(gap >= LOOK.backEveryMin - 1e-6 && gap <= LOOK.backEveryMax + DT, `every ${gap.toFixed(2)} s`);
      assert.ok(share < 0.4, `brief: ${(share * 100).toFixed(0)}% of the time glancing`);
      for (const g of glances) {
        assert.ok(Math.abs(g.yaw) >= 0.8 * LIMIT.yaw, `seed ${seed}: over his shoulder (${(g.yaw / D).toFixed(0)}°)`);
        if (at) assert.equal(Math.sign(g.yaw), Math.sign(at.yaw), `seed ${seed}: toward the pursuer`);
        if (at)
          assert.ok(
            g.pitch < 0 && g.pitch >= LOOK.backPitchMin - 1e-9,
            'down toward the pursuer, not the floor at his heels',
          );
      }
      if (!at) unchased.push(...glances.map((g) => Math.sign(g.yaw)));
    }
  }
  // (With no pursuer, either side: about as often over the seeds, a few glances each.)
  const left = unchased.filter((x) => x < 0).length / unchased.length;
  assert.ok(left > 0.3 && left < 0.7, `either side with no pursuer: ${(left * 100).toFixed(0)}% to his left`);
  // The pursuer roughly ahead (he runs past it): the glance goes right to it.
  const { glances } = flee(2, { yaw: 0.4, pitch: -0.1 });
  for (const g of glances) close(g.yaw, 0.4, 1e-9);
});

test('looking ahead, around and back: forward and an idle pointer aim at "ahead", glances go around it; fleeing looks at its own ahead', () => {
  const ahead = { yaw: 0.2, pitch: 0.5 };
  const rng = createRng(4);
  let s = createLook();
  let t = 0;
  let glanced = 0;
  for (let i = 0; i < 20 * 60; i++) {
    s = lookStep(s, 'forward', null, DT, (t += DT), rng, 1, ahead);
    if (s.glance) {
      glanced++;
      assert.ok(Math.abs(s.target.yaw - ahead.yaw) > 0.1 * LIMIT.yaw, 'a glance looks off to one side');
      assert.ok(Math.abs(s.target.yaw) <= LIMIT.yaw + 1e-9);
    } else {
      close(s.target.yaw, ahead.yaw, 1e-9);
      close(s.target.pitch, ahead.pitch, 1e-9);
    }
  }
  assert.ok(glanced > 0, 'he still glances around');
  close(lookStep(createLook(), 'camera', null, DT, 1, rng, 1, ahead).target.pitch, ahead.pitch, 1e-9);
  close(lookStep(createLook(), 'pointer', null, DT, 1, rng, 1, ahead).target.pitch, ahead.pitch, 1e-9);
  const back = lookStep(createLook(), 'back', null, DT, 0.01, rng, 1, ahead);
  assert.deepEqual(
    back.target,
    { yaw: ahead.yaw, pitch: ahead.pitch },
    'running off, he looks at "ahead" (lookAim gives where he runs, chin level)',
  );
  // Without `ahead`, ahead is straight ahead, as before.
  close(lookStep(createLook(), 'forward', null, DT, 0.01, createRng(1)).target.pitch, 0);
});
