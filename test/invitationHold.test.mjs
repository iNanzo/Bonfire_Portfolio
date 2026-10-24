// How NEWT is held in the invitation toy, from the pure modules: the drag kinds (hold.js
// DRAG_KINDS, holds/index.js createHold: today the default, level, tilt and bead, each its own
// module, the candidates not yet built today's hold under their own names: level and bead); today's
// hold through the interface, the same as carry.js's camera-facing plane frame for frame; and the
// solve helpers every kind shares: a ray meeting a plane (grazing and backward rays turned
// away), a height on the ray, the ray's inside span (the play area and the height limits) and the
// edge clamp on it (the collar stays on the ray: the back wall a climb, the front wall and the
// floor his hang height; a side wall across only, never deeper, with the push kept), re-anchoring
// after the camera moves (never a jump over 0.15 in a frame of orbit), the grab offset easing out
// in screen px, the release velocity over [t − 70 ms, t − 20 ms], and the squash and stretch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DRAG,
  DRAG_KINDS,
  HOLD,
  along,
  cameraMoved,
  closestOnRay,
  createTodayHold,
  depthAlong,
  dragKind,
  edgeClamp,
  insideHold,
  levelAxes,
  rayAtY,
  rayHit,
  rayInterval,
  reanchor,
  releaseVelocity,
  screenOffset,
  squash,
} from '../src/invitation/hold.js';
import { HOLDS, createHold } from '../src/invitation/holds/index.js';
import { CARRY, dragPlane, dragTarget, gripFor, offsetAt } from '../src/invitation/carry.js';

const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);
const RAD = Math.PI / 180;

/**
 * A pinhole camera like the toy's (20° of view) at `yaw`, `elevation` (degrees) and `distance`
 * from a point 0.6 up over `target`, on a `w`×`h` px screen: rays through client px and points
 * onto it.
 */
function rig({ yaw = 0, elevation = 36, distance = 14, w = 1280, h = 800, target = { x: 0, z: 0 } } = {}) {
  const T = { x: target.x, y: 0.6, z: target.z };
  const e = elevation * RAD;
  const p = yaw * RAD;
  const position = {
    x: T.x + distance * Math.sin(p) * Math.cos(e),
    y: T.y + distance * Math.sin(e),
    z: T.z + distance * Math.cos(p) * Math.cos(e),
  };
  const norm = (v) => {
    const n = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / n, y: v.y / n, z: v.z / n };
  };
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const f = norm({ x: T.x - position.x, y: T.y - position.y, z: T.z - position.z });
  const r = norm(cross(f, { x: 0, y: 1, z: 0 }));
  const u = cross(r, f);
  const F = h / 2 / Math.tan(10 * RAD);
  const rayAt = (x, y) => {
    const a = (x - w / 2) / F;
    const b = (h / 2 - y) / F;
    return {
      o: { ...position },
      d: norm({ x: f.x + r.x * a + u.x * b, y: f.y + r.y * a + u.y * b, z: f.z + r.z * a + u.z * b }),
    };
  };
  const project = (q) => {
    const v = { x: q.x - position.x, y: q.y - position.y, z: q.z - position.z };
    const z = v.x * f.x + v.y * f.y + v.z * f.z;
    return {
      x: w / 2 + (F * (v.x * r.x + v.y * r.y + v.z * r.z)) / z,
      y: h / 2 - (F * (v.x * u.x + v.y * u.y + v.z * u.z)) / z,
    };
  };
  return { position, rayAt, project, camera: { position, yaw: p, elevation: e, distance, target } };
}
const onRay = (ray, p) => {
  const q = closestOnRay(ray, p);
  return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
};

test('the drag kinds: today (the default), level, tilt and bead; anything else is today; holds/index.js makes each by name, its own module', () => {
  assert.deepEqual([...DRAG_KINDS], ['today', 'level', 'tilt', 'bead']);
  assert.equal(DEFAULT_DRAG, 'today');
  for (const bad of [undefined, null, '', 'Level', 'sticker', 3, {}]) assert.equal(dragKind(bad), 'today', String(bad));
  for (const k of DRAG_KINDS) assert.equal(dragKind(k), k);
  assert.deepEqual(Object.keys(HOLDS).sort(), [...DRAG_KINDS].sort(), 'every kind listed once');
  for (const k of DRAG_KINDS) {
    const h = createHold(k);
    assert.equal(h.kind, k);
    assert.ok(['off', 'mix', 'always'].includes(h.feel.groundCues), `${k}: a Ground Cues default`);
    assert.equal(typeof h.start, 'function');
    assert.equal(typeof h.step, 'function');
    assert.equal(typeof h.release, 'function');
    assert.equal(typeof h.grabbedAt, 'function');
  }
  assert.equal(createHold('nope').kind, 'today');
});

test('today’s hold through the interface is carry.js’s camera-facing plane, frame for frame: the same anchors, the same plane, the same point grabbed, and tossed with carry.js toss', () => {
  const { rayAt, project, camera, position } = rig({ yaw: 30 });
  const collar = { x: 0.3, y: 0.62, z: -0.4 };
  const press = project({ x: 0.28, y: 0.4, z: -0.38 });
  const t0 = 2;
  const low = 0.7;
  const hold = createTodayHold();
  hold.start({ t: t0, collar, press, collarPx: project(collar), rayAt, camera, low, bounds: null });
  const grip = gripFor(rayAt(press.x, press.y), dragPlane(position, collar), collar, t0);
  assert.deepEqual(hold.plane, grip.plane);
  const path = [
    press,
    { x: press.x, y: press.y - 30 },
    { x: press.x + 40, y: press.y - 90 },
    { x: press.x - 20, y: press.y + 60 },
  ];
  path.forEach((px, i) => {
    const t = t0 + i * 0.05;
    const s = hold.step({ t, dt: 0.05, px, rayAt, camera, low, bounds: null, carry: null });
    assert.deepEqual(s.anchor, dragTarget(grip, rayAt(px.x, px.y), low, t), `frame ${i}`);
    assert.deepEqual(s.plane, grip.plane);
    assert.deepEqual(s.cues, {});
    assert.equal(s.push, undefined, 'holdStep’s own push');
    const o = offsetAt(grip, t);
    assert.deepEqual(
      hold.grabbedAt(t, collar, project),
      project({ x: collar.x - o.x, y: collar.y - o.y, z: collar.z - o.z }),
    );
  });
  assert.equal(hold.release(/** @type {any} */ ({ samples: [] }), 3), null, 'carry.js toss');
  assert.deepEqual(hold.feel, { groundCues: 'off', squash: false, fingerLift: null, secondFinger: false });
});

test('the candidates not yet built (level, bead) are today’s hold under their own names', () => {
  const { rayAt, project, camera } = rig();
  const collar = { x: 0, y: 0.62, z: 0 };
  const press = project({ x: 0, y: 0.45, z: 0 });
  const run = (h) => {
    h.start({ t: 0, collar, press, collarPx: project(collar), rayAt, camera, low: 0.7, bounds: null });
    return [0, 1, 2, 3].map(
      (i) =>
        h.step({
          t: i * 0.05,
          dt: 0.05,
          px: { x: press.x + i * 9, y: press.y - i * 20 },
          rayAt,
          camera,
          low: 0.7,
          bounds: null,
          carry: null,
        }).anchor,
    );
  };
  const today = run(createHold('today'));
  // (level and tilt are built: holds/level.js, holds/tilt.js and their tests.)
  for (const k of ['bead']) assert.deepEqual(run(createHold(k)), today, k);
});

test('a ray meets a plane where it crosses it; one that grazes it (the cosine under HOLD.grazing) or has it behind is turned away', () => {
  const plane = { point: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
  const down = { o: { x: 0, y: 5, z: 0 }, d: { x: 0, y: -2, z: 0 } };
  assert.deepEqual(rayHit(down, plane), { x: 0, y: 1, z: 0 });
  const steep = HOLD.grazing + 0.01;
  const ok = { o: { x: 0, y: 5, z: 0 }, d: { x: Math.sqrt(1 - steep * steep), y: -steep, z: 0 } };
  assert.ok(rayHit(ok, plane), 'just steeper than grazing');
  const shallow = HOLD.grazing - 0.01;
  const graze = { o: { x: 0, y: 5, z: 0 }, d: { x: Math.sqrt(1 - shallow * shallow), y: -shallow, z: 0 } };
  assert.equal(rayHit(graze, plane), null, 'grazing');
  assert.equal(rayHit({ o: { x: 0, y: 5, z: 0 }, d: { x: 0, y: 1, z: 0 } }, plane), null, 'behind it');
  // A height on the ray.
  assert.deepEqual(rayAtY(down, 2), { x: 0, y: 2, z: 0 });
  assert.equal(rayAtY(down, 6), null, 'behind');
  assert.equal(rayAtY({ o: { x: 0, y: 1, z: 0 }, d: { x: 1, y: 0, z: 0 } }, 0), null, 'level');
});

// The play areas a hold meets: a rounded square (the toy's), a plain box and a disc.
const AREAS = {
  rounded: { minX: -3, maxX: 3, minZ: -3, maxZ: 3, round: 1.2 },
  box: { minX: -2, maxX: 2.5, minZ: -3, maxZ: 1.5 },
  disc: { minX: -2, maxX: 2, minZ: -2, maxZ: 2, r: 2 },
};

/** The ray's inside span by brute force: inside at steps of 1 mm. */
function brute(ray, b) {
  let lo = null;
  let hi = null;
  for (let s = 0; s < 30; s += 0.001)
    if (insideHold(along(ray, s), b, 0.7, 5)) {
      lo ??= s;
      hi = s;
    }
  return [lo, hi];
}

test('the ray’s inside span: where its floor point is in the play area and it’s between the heights, as brute force finds it', () => {
  for (const [name, b] of Object.entries(AREAS))
    for (const yaw of [0, 45, 90, 135])
      for (const [x, y] of [
        [640, 400],
        [640, 60],
        [100, 700],
        [1200, 200],
      ]) {
        const ray = rig({ yaw, distance: 9 }).rayAt(x, y);
        const span = rayInterval(ray, b, 0.7, 5);
        const [lo, hi] = brute(ray, b);
        const at = `${name} yaw ${yaw} (${x}, ${y})`;
        if (lo === null) assert.equal(span, null, at);
        else {
          assert.ok(span, at);
          close(span[0], lo, 2e-3, `${at} from`);
          close(span[1], hi, 2e-3, `${at} to`);
        }
      }
});

test('the edge clamp: inside, as it is; past the back wall he climbs along the ray, past the front wall and below his hang height he drops along it to that height, the collar on the ray either way', () => {
  const b = AREAS.rounded;
  const { rayAt, camera } = rig({ distance: 9, elevation: 14 });
  const { toward } = levelAxes(camera.yaw);
  const o = { bounds: b, low: 0.7, high: 5, toward };
  // Inside.
  const mid = rayAt(640, 380);
  const p = rayAtY(mid, 1.2);
  assert.deepEqual(edgeClamp(mid, p, o), { p, clamp: 'none', push: null });
  // Past the back wall (z under −3): the inside point nearest along the ray is nearer the camera
  // and higher; on the ray, at the wall.
  const back = rayAt(640, 10);
  // (A kind's surface carries him past it a little at a time: just past it.)
  const far = along(back, (b.minZ - 0.3 - back.o.z) / back.d.z);
  assert.ok(far.y > 0.7, `still over his hang height: ${far.y}`);
  const c = edgeClamp(back, far, o);
  assert.equal(c.clamp, 'ray');
  assert.equal(c.push, null);
  assert.ok(onRay(back, c.p) < 1e-9, 'on the ray: under the cursor');
  assert.ok(insideHold(c.p, b, 0.7, 5), 'inside');
  close(c.p.z, b.minZ, 1e-4, 'at the back wall');
  assert.ok(c.p.y > far.y, 'he climbs');
  // Below his hang height: onto it, along the ray (no gap however far below).
  const low = rayAt(640, 500);
  for (const y of [0.6, 0.2, -1, -4]) {
    const under = rayAtY(low, y);
    const d = edgeClamp(low, under, o);
    assert.equal(d.clamp, 'ray', `${y}`);
    close(d.p.y, 0.7, 1e-4, `${y}: at his hang height`);
    assert.ok(onRay(low, d.p) < 1e-9, `${y}: on the ray`);
  }
  // Over the ceiling: down to it, on the ray.
  const up = rayAt(640, 100);
  const high = edgeClamp(up, along(up, 1), { ...o, bounds: null, high: 2 });
  close(high.p.y, 2, 1e-4, 'at the ceiling');
  assert.ok(onRay(up, high.p) < 1e-9);
});

test('the edge clamp at a side wall: no inside point on the ray near enough, so across only along the camera’s level-right axis (never deeper or nearer), the height clamped, the push kept for the toss', () => {
  // Zoomed in by the side wall, turned 45° (today's glitch: 400 px past it slid him 0.55 deeper).
  const b = AREAS.rounded;
  for (const yaw of [0, 45, 90]) {
    const { rayAt, camera } = rig({
      yaw,
      distance: 7,
      target: { x: 2.4 * Math.cos(yaw * RAD), z: -2.4 * Math.sin(yaw * RAD) },
    });
    const { toward, right } = levelAxes(camera.yaw);
    const o = { bounds: b, low: 0.7, high: 5, toward };
    const start = rayAtY(rayAt(640, 400), 1);
    let last = null;
    for (let px = 640; px <= 1240; px += 40) {
      const ray = rayAt(px, 400);
      const q = rayAtY(ray, 1);
      const c = edgeClamp(ray, q, o);
      assert.ok(insideHold(c.p, b, 0.7, 5), `yaw ${yaw}, ${px}: inside`);
      if (c.clamp === 'side') {
        const depth = (c.p.x - q.x) * toward.x + (c.p.z - q.z) * toward.z;
        close(depth, 0, 1e-6, `yaw ${yaw}, ${px}: never deeper or nearer`);
        assert.ok(c.push, 'pushed');
        assert.ok(c.push.x * right.x + c.push.z * right.z > 0, 'out through the wall, to the right');
        last = c;
      }
    }
    assert.ok(last, `yaw ${yaw}: he reached the side wall`);
    close(depthAlong(last.p, camera.yaw), depthAlong(start, camera.yaw), 0.05, `yaw ${yaw}: depth kept`);
  }
});

test('re-anchoring after the camera moves: the closest point on the new cursor ray to the anchor, never a jump over 0.15 in a frame as the camera orbits from 36° down to 12° and round', () => {
  let anchor = { x: 0.4, y: 1.3, z: -0.6 };
  let before = rig({ elevation: 36, distance: 10 });
  const px = before.project(anchor);
  for (let i = 1; i <= 60; i++) {
    const now = rig({ elevation: 36 - (24 * i) / 60, yaw: i * 1.5, distance: 10 - i * 0.03 });
    assert.ok(cameraMoved(before.camera, now.camera), `frame ${i}: it moved`);
    const ray = now.rayAt(px.x, px.y);
    const { point, jump } = reanchor(ray, anchor);
    assert.ok(onRay(ray, point) < 1e-9, 'on the new ray: the collar stays under the cursor');
    assert.ok(jump < HOLD.reanchorMax, `frame ${i}: a jump of ${jump}`);
    anchor = point;
    before = now;
  }
  assert.equal(cameraMoved(before.camera, { ...before.camera }), false, 'still');
  assert.equal(
    cameraMoved(before.camera, { ...before.camera, yaw: before.camera.yaw + 0.05 * RAD }),
    false,
    'under 0.1°',
  );
  assert.equal(
    cameraMoved(before.camera, { ...before.camera, distance: before.camera.distance * 1.01 }),
    true,
    'a zoom',
  );
});

test('the grab offset in screen px: all of it at the grab, less each moment, none from HOLD.offsetEase (0.12 s) on', () => {
  close(HOLD.offsetEase, CARRY.offsetEase);
  const off = { x: 12, y: -40 };
  assert.deepEqual(screenOffset(off, 1, 1), off);
  let left = Infinity;
  for (let k = 1; k <= 6; k++) {
    const o = screenOffset(off, 1, 1 + (k * HOLD.offsetEase) / 6);
    const now = Math.hypot(o.x, o.y);
    assert.ok(now < left, `${k}/6`);
    left = now;
  }
  close(left, 0, 1e-12);
  assert.deepEqual(screenOffset(off, 1, 9), { x: 0, y: 0 });
});

test('the release velocity: the solved collar from 70 ms to 20 ms before letting go (a finger slowing as it lifts doesn’t count), capped, none across while pushed against a wall', () => {
  close(HOLD.lead, 0.02);
  close(HOLD.span, 0.05);
  // A steady 2 u/s across and 1 up, then stopped dead for the last 15 ms.
  const samples = [];
  for (let t = 0; t <= 0.2 + 1e-9; t += 1 / 120) {
    const k = Math.min(t, 0.185);
    samples.push({ t, x: 2 * k, y: 1 + k, z: -0.5 * k });
  }
  const v = releaseVelocity(samples, 0.2);
  close(v.x, 2, 1e-6);
  close(v.y, 1, 1e-6);
  close(v.z, -0.5, 1e-6);
  // Fast: capped across at HOLD.maxLevel, up and down at HOLD.up and HOLD.down.
  const fast = samples.map((s) => ({ ...s, x: s.x * 10, y: s.y * 10, z: 0 }));
  const f = releaseVelocity(fast, 0.2);
  close(Math.hypot(f.x, f.z), HOLD.maxLevel, 1e-9);
  close(f.y, HOLD.up, 1e-9);
  const drop = samples.map((s) => ({ ...s, y: -s.y * 10 }));
  close(releaseVelocity(drop, 0.2).y, HOLD.down, 1e-9);
  // Pushed against a wall: nothing across, up and down kept.
  const pushed = releaseVelocity(samples, 0.2, { push: { x: 1, z: 0 } });
  assert.deepEqual([pushed.x, pushed.z], [0, 0]);
  close(pushed.y, 1, 1e-6);
  // Too few samples, or none in the window: still.
  assert.deepEqual(releaseVelocity([samples[0]], 0.2), { x: 0, y: 0, z: 0 });
});

test('the squash and stretch: 1.08 tall over 80 ms as he’s lifted; landing, 0.88 tall and 1.08 wide over 70 ms, back over 200 ms', () => {
  assert.deepEqual(squash(null, null), { y: 1, xz: 1 });
  close(squash(HOLD.stretchTime / 2, null).y, HOLD.stretch, 1e-9, 'the stretch at its height');
  assert.deepEqual(squash(HOLD.stretchTime + 0.01, null), { y: 1, xz: 1 }, 'over');
  const land = squash(null, HOLD.squashTime);
  close(land.y, HOLD.squashY, 1e-9);
  close(land.xz, HOLD.squashXZ, 1e-9);
  assert.ok(squash(null, HOLD.squashTime + HOLD.recover / 2).y > HOLD.squashY, 'coming back');
  assert.deepEqual(squash(null, HOLD.squashTime + HOLD.recover + 0.01), { y: 1, xz: 1 }, 'back');
  assert.deepEqual(
    [HOLD.stretch, HOLD.stretchTime, HOLD.squashY, HOLD.squashXZ, HOLD.squashTime, HOLD.recover],
    [1.08, 0.08, 0.88, 1.08, 0.07, 0.2],
  );
});

test('the camera’s level axes: toward it and right on screen; depth along it grows away from the camera', () => {
  for (const yaw of [0, 45, 90, 180]) {
    const { position, camera, project } = rig({ yaw });
    const { toward, right } = levelAxes(camera.yaw);
    const len = Math.hypot(position.x, position.z);
    close(toward.x, position.x / len, 1e-9);
    close(toward.z, position.z / len, 1e-9);
    assert.ok(
      project({ x: right.x, y: 0.6, z: right.z }).x > project({ x: 0, y: 0.6, z: 0 }).x,
      `yaw ${yaw}: right on screen`,
    );
    assert.ok(depthAlong({ x: -toward.x, z: -toward.z }, camera.yaw) > depthAlong({ x: 0, z: 0 }, camera.yaw), 'away');
  }
});

test('let go, he falls with the velocity the drag kind lets him go with, or carry.js toss with none', async () => {
  const { bodyStep, createBody } = await import('../src/invitation/play.js');
  const held = (released) => {
    const s = createBody();
    const o = { move: { mode: 'stay', goal: null, speed: 0 }, pointer: null, bounds: null, dt: 1 / 60 };
    const collar = { x: 0, y: 1, z: 0 };
    for (let i = 0; i < 6; i++)
      bodyStep(s, { ...o, state: 'held', t: i / 60, collar, target: { x: i * 0.05, y: 1, z: 0 } });
    bodyStep(s, { ...o, state: 'fall', t: 0.1, footOffset: 0.4, released });
    return s;
  };
  const kind = held({ x: 0, y: 2, z: -1.5 });
  assert.equal(kind.mode, 'fall');
  close(kind.vel.x, 0, 1e-9);
  close(kind.vel.z, -1.5, 1e-9, 'the kind’s, in depth too');
  assert.ok(held(null).vel.x > 1, 'tossed with the last samples');
});
