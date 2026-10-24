// The 'level' drag kind in the invitation toy (holds/level.js), from the pure modules, on the
// toy's own cameras (pixels.js frameView, camera.js createOrbit and screenOf, area.js viewArea,
// as main.js builds them for a 390×844 phone and a 1280×800 desktop): carried like a toy over a
// tabletop, a cursor move up the screen sends him away across the floor at his hold height
// (1.45-1.75 a 100 px on the phone, 0.90-1.10 on the desktop at the default 36°, less at 70°, an
// upright lift at 12°, both between), across without any depth; his collar on the cursor's ray
// every frame once the grab offset has eased out, through sweeps, the wheel and an orbit from 36°
// to 12° (never a jump over 0.15); the wheel and a second finger raise and lower him (0.1 a notch,
// 0.8 a 100 px, within his hang height and 2.4 over it); the floor under him moving with the
// cursor; the floor and the walls on the ray, a side wall across only; let go, a flick up throws
// him away and one across never in depth; and the cost of a frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as camera from '../src/invitation/camera.js';
import * as pixels from '../src/invitation/pixels.js';
import { NEWT_RADIUS, viewArea } from '../src/invitation/area.js';
import { CARRY, fallStep, grab, holdStep } from '../src/invitation/carry.js';
import { rayPlaneY } from '../src/invitation/gesture.js';
import { blobLook, cueStep, lineShare, mixWants } from '../src/invitation/cues.js';
import { depthAlong } from '../src/invitation/hold.js';
import { createHold } from '../src/invitation/holds/index.js';
import { LEVEL, createLevelHold, levelNormal } from '../src/invitation/holds/level.js';

const RAD = Math.PI / 180;
const INSETS = { top: 16, bottom: 80, left: 24, right: 24 };
const SCREENS = { phone: { cssW: 390, cssH: 844, dpr: 3 }, desktop: { cssW: 1280, cssH: 800, dpr: 1 } };
/** His hang height in these tests: the hold height then starts at 1.0. */
const LOW = 1 - LEVEL.lift;
const DT = 1 / 60;

/**
 * The toy's default view on `screen`, turned to `yaw` and tilted to `elevation` (degrees), at
 * `zoom` (the home distance over the distance): rays through screen px (from where the point it
 * looks at shows, +y down), points onto it, CSS px a unit covers at a point, and the play area.
 */
function env(screen, { yaw = 0, elevation = 36, zoom = 1 } = {}) {
  const { cssW, cssH, dpr } = SCREENS[screen];
  const grid = pixels.texelGrid({ cssW, cssH, dpr, pixelSize: '128' });
  const view = pixels.frameView({ cssW, cssH, grid, insets: INSETS, area: 2 + NEWT_RADIUS });
  const s = camera.createOrbit({ distance: view.distance, span: { w: cssW, h: cssH } });
  camera.orbitSpan(s, {
    w: cssW,
    h: cssH,
    ch: grid.canvasH,
    hw: (cssW - INSETS.left - INSETS.right) / 2,
    hh: (cssH - INSETS.top - INSETS.bottom) / 2,
  });
  const bounds = viewArea({ view, cssW, cssH, insets: INSETS });
  const focal = grid.canvasH / 2 / Math.tan((pixels.VIEW.fov * RAD) / 2);
  const e = {
    s,
    bounds,
    /** Points the camera at `yaw`, `elevation` (radians) and `distance`. */
    set({ yaw: y = s.yaw, elevation: el = s.elevation, distance = s.distance }) {
      s.yaw = s.goal.yaw = y;
      s.elevation = s.goal.elevation = el;
      s.distance = s.goal.distance = distance;
    },
    rayAt(x, y) {
      const ce = Math.cos(s.elevation);
      const se = Math.sin(s.elevation);
      const sy = Math.sin(s.yaw);
      const cy = Math.cos(s.yaw);
      const u = x / focal;
      const v = -y / focal;
      const d = { x: -sy * ce + cy * u - sy * se * v, y: -se + ce * v, z: -cy * ce - sy * u - cy * se * v };
      const n = Math.hypot(d.x, d.y, d.z);
      return { o: camera.orbitPose(s).position, d: { x: d.x / n, y: d.y / n, z: d.z / n } };
    },
    project: (p) => {
      const q = camera.screenOf(s, p);
      return { x: q.x, y: q.y };
    },
    pxPerUnit: (p) => focal / camera.screenOf(s, p).depth,
    camera() {
      return {
        position: camera.orbitPose(s).position,
        yaw: s.yaw,
        elevation: s.elevation,
        distance: s.distance,
        target: { x: s.target.x, z: s.target.z },
      };
    },
  };
  e.set({ yaw: yaw * RAD, elevation: elevation * RAD, distance: s.home.distance / zoom });
  return e;
}

/** Where the cursor's ray through `px` is at height `y`. */
const onRayAt = (E, px, y) => {
  const r = E.rayAt(px.x, px.y);
  const q = rayPlaneY(r.o, r.d, y);
  return { x: q.x, y, z: q.z };
};

/**
 * A hold of `kind` grabbed with his collar at `collar` (pressed `press` px off its screen point),
 * carried as main.js carries him (the kind's step, then carry.js holdStep with the kind's plane
 * and push), frame by frame: `go(px)` is a frame with the cursor at `px`.
 */
function carried(E, collar, { press = { x: 0, y: 0 }, low = LOW, kind = 'level', t0 = 0 } = {}) {
  const hold = createHold(kind, { rng: () => 0.5 });
  const at = E.project(collar);
  const p0 = { x: at.x + press.x, y: at.y + press.y };
  hold.start({
    t: t0,
    collar,
    press: p0,
    collarPx: at,
    rayAt: E.rayAt,
    camera: E.camera(),
    low,
    bounds: E.bounds,
  });
  const c = grab(collar, t0);
  let t = t0;
  const out = {
    hold,
    c,
    p0,
    get t() {
      return t;
    },
    /** @type {import('../src/invitation/hold.js').HoldStep|null} */
    last: null,
    go(px, dt = DT) {
      t += dt;
      const step = hold.step({ t, dt, px, rayAt: E.rayAt, camera: E.camera(), low, bounds: E.bounds, carry: c });
      c.plane = step.plane;
      holdStep(c, step.anchor, dt, E.bounds, t);
      if (step.push !== undefined) c.push = step.push;
      out.last = step;
      return c.anchor;
    },
    /** `n` frames still at `px`. */
    rest(px, n = 30) {
      for (let i = 0; i < n; i++) out.go(px);
      return c.anchor;
    },
  };
  return out;
}

/** A straight cursor path from `a` to `b` in `n` frames. */
function* path(a, b, n) {
  for (let i = 1; i <= n; i++) yield { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
}

/** His collar grabbed at the middle of the view at height 1, settled. */
function settled(E, o = {}) {
  const collar = onRayAt(E, { x: 0, y: 0 }, 1);
  const h = carried(E, collar, o);
  h.rest(h.p0, 30);
  return { h, at: E.project(h.c.anchor) };
}

/** 100 px of cursor (up: dy −100; across: dx 100) from settled: the move in world units. */
function move100(screen, { yaw = 0, elevation = 36, dx = 0, dy = -100 } = {}) {
  const E = env(screen, { yaw, elevation });
  const { h, at } = settled(E);
  const a = { ...h.c.anchor };
  const k0 = E.pxPerUnit(a);
  const to = { x: at.x + dx, y: at.y + dy };
  for (const p of path(at, to, 10)) h.go(p);
  const b = { ...h.rest(to, 30) };
  const { right } = { right: { x: Math.cos(yaw * RAD), z: -Math.sin(yaw * RAD) } };
  return {
    away: depthAlong(b, yaw * RAD) - depthAlong(a, yaw * RAD),
    lift: b.y - a.y,
    across: (b.x - a.x) * right.x + (b.z - a.z) * right.z,
    size: E.pxPerUnit(b) / k0 - 1,
    E,
    h,
    a,
    b,
  };
}

const within = (v, lo, hi, msg) => assert.ok(v >= lo && v <= hi, `${msg}: ${v.toFixed(3)} should be in ${lo}..${hi}`);

test('level’s own defaults: Ground Cues Always, the squash and stretch, a finger 48 px under him, a second finger and the wheel his height', () => {
  const h = createLevelHold();
  assert.equal(h.kind, 'level');
  assert.deepEqual(h.feel, { groundCues: 'always', squash: true, fingerLift: 48, secondFinger: true });
  assert.equal(typeof h.onWheel, 'function');
  assert.equal(typeof h.onSecondFinger, 'function');
  assert.equal(h.plane, null, 'no surface before a grab');
});

test('the surface: level from 35° up, upright facing the camera from 12° down, smoothly between', () => {
  for (const yaw of [0, 90]) {
    const toward = { x: Math.sin(yaw * RAD), z: Math.cos(yaw * RAD) };
    const at = (e) => levelNormal(e * RAD, yaw * RAD);
    assert.deepEqual(
      Object.values(at(36)).map((v) => Math.round(v * 1e9) / 1e9),
      [0, 1, 0],
      'level at 36°',
    );
    const up = at(12);
    assert.ok(Math.abs(up.y) < 1e-6 && Math.abs(up.x - toward.x) < 1e-6 && Math.abs(up.z - toward.z) < 1e-6, 'upright');
    let was = 1;
    for (let e = 35; e >= 12; e -= 1) {
      const n = at(e);
      assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-6, 'unit');
      assert.ok(n.y <= was + 1e-6, `standing up as the camera comes down (${e}°)`);
      was = n.y;
    }
  }
});

test('motion per 100 px of cursor up at 36°: away 1.45-1.75 on a phone and 0.90-1.10 on a desktop, level (|Δy| ≤ 0.01), 5-7% smaller, at yaw 0 and 90', () => {
  for (const yaw of [0, 90])
    for (const [screen, lo, hi] of [
      ['phone', 1.45, 1.75],
      ['desktop', 0.9, 1.1],
    ]) {
      const m = move100(screen, { yaw });
      within(m.away, lo, hi, `${screen} yaw ${yaw}: away`);
      assert.ok(Math.abs(m.lift) <= 0.01, `${screen} yaw ${yaw}: level (${m.lift})`);
      within(-m.size, 0.05, 0.07, `${screen} yaw ${yaw}: smaller`);
    }
});

test('motion per 100 px of cursor up at 70°: away 0.85-1.05 on a phone and 0.55-0.67 on a desktop', () => {
  for (const yaw of [0, 90])
    for (const [screen, lo, hi] of [
      ['phone', 0.85, 1.05],
      ['desktop', 0.55, 0.67],
    ]) {
      const m = move100(screen, { yaw, elevation: 70 });
      within(m.away, lo, hi, `${screen} yaw ${yaw}: away`);
      assert.ok(Math.abs(m.lift) <= 0.01, `${screen} yaw ${yaw}: level`);
    }
});

test('motion per 100 px of cursor up at 12°: an upright lift, 0.75-0.90 on a phone and 0.44-0.54 on a desktop, away ≤ 0.05', () => {
  for (const yaw of [0, 90])
    for (const [screen, lo, hi] of [
      ['phone', 0.75, 0.9],
      ['desktop', 0.44, 0.54],
    ]) {
      const m = move100(screen, { yaw, elevation: 12 });
      within(m.lift, lo, hi, `${screen} yaw ${yaw}: lift`);
      assert.ok(Math.abs(m.away) <= 0.05, `${screen} yaw ${yaw}: away ${m.away}`);
    }
});

test('motion per 100 px of cursor up at 24°: both away and up (≥ 0.2 each)', () => {
  for (const yaw of [0, 90])
    for (const screen of ['phone', 'desktop']) {
      const m = move100(screen, { yaw, elevation: 24 });
      assert.ok(m.away >= 0.2, `${screen} yaw ${yaw}: away ${m.away}`);
      assert.ok(m.lift >= 0.2, `${screen} yaw ${yaw}: lift ${m.lift}`);
    }
});

test('motion per 100 px of cursor across: 0.80-0.98 on a phone and 0.50-0.60 on a desktop, depth ≤ 0.02', () => {
  for (const yaw of [0, 90])
    for (const [screen, lo, hi] of [
      ['phone', 0.8, 0.98],
      ['desktop', 0.5, 0.6],
    ]) {
      const m = move100(screen, { yaw, dx: 100, dy: 0 });
      within(m.across, lo, hi, `${screen} yaw ${yaw}: across`);
      assert.ok(Math.abs(m.away) <= 0.02, `${screen} yaw ${yaw}: depth ${m.away}`);
      assert.ok(Math.abs(m.lift) <= 0.01, `${screen} yaw ${yaw}: level`);
    }
});

test('cursor contact: grabbed 40 px off his collar, the collar is within 2 px of the cursor every frame from 0.15 s, through 3 u/s sweeps, wheel notches and an orbit from 36° to 12° (no frame’s anchor jump over 0.15)', () => {
  for (const screen of ['phone', 'desktop']) {
    const E = env(screen);
    const collar = onRayAt(E, { x: 0, y: 0 }, 1);
    const h = carried(E, collar, { press: { x: 10, y: -40 } });
    let worst = 0;
    let jump = 0;
    let prev = { ...h.c.anchor };
    const check = (px) => {
      const a = h.go(px);
      jump = Math.max(jump, Math.hypot(a.x - prev.x, a.y - prev.y, a.z - prev.z));
      prev = { ...a };
      if (h.t >= 0.15) worst = Math.max(worst, Math.hypot(E.project(a).x - px.x, E.project(a).y - px.y));
    };
    let px = { ...h.p0 };
    for (let i = 0; i < 12; i++) check(px);
    // (Sweeps at 3 u/s: across and back, up and down.)
    const k = E.pxPerUnit(h.c.anchor);
    const step = (3 * k) / 60;
    for (const [dx, dy, n] of [
      [1, 0, 30],
      [-1, 0, 50],
      [0, -1, 20],
      [0, 1, 30],
      [0.7, -0.7, 20],
    ])
      for (let i = 0; i < n; i++) {
        px = { x: px.x + dx * step, y: px.y + dy * step };
        check(px);
      }
    // (Wheel notches, up and down.)
    for (const dy of [-100, -100, -100, 100, -100]) {
      assert.equal(h.hold.onWheel(dy), true, 'the wheel is taken');
      for (let i = 0; i < 10; i++) check(px);
    }
    const sweepJump = jump;
    jump = 0;
    // (An orbit from 36° down to 12° over a second.)
    for (let i = 1; i <= 60; i++) {
      E.set({ elevation: (36 - (24 * i) / 60) * RAD });
      check(px);
    }
    for (let i = 0; i < 20; i++) check(px);
    assert.ok(worst <= 2, `${screen}: the collar ${worst.toFixed(2)} px off the cursor at worst`);
    assert.ok(jump <= 0.15, `${screen}: the orbit moved the anchor ${jump.toFixed(3)} in a frame`);
    assert.ok(sweepJump < 0.5, `${screen}: sweeps ${sweepJump}`);
  }
});

test('height: a wheel notch (deltaY 100) moves his hold height by 0.10 ± 0.015 within 0.3 s, down lowers and up raises him; 30 notches up stop at 2.4 over his hang height', () => {
  const E = env('desktop');
  const { h, at } = settled(E);
  const y0 = h.last.holdY;
  assert.ok(Math.abs(y0 - 1) < 1e-3, `held at his hang height + 0.35 (${y0})`);
  h.hold.onWheel(-100);
  for (let i = 0; i < 18; i++) h.go(at);
  within(h.last.holdY - y0, 0.085, 0.115, 'a notch up');
  within(h.c.anchor.y - y0, 0.085, 0.115, 'his collar with it');
  h.hold.onWheel(100);
  h.hold.onWheel(100);
  for (let i = 0; i < 18; i++) h.go(at);
  within(y0 - h.last.holdY, 0.085, 0.115, 'two notches down');
  // (Up 30 notches, from further back so the front wall leaves room.)
  const back = { x: at.x, y: at.y - 250 };
  for (const p of path(at, back, 20)) h.go(p);
  for (let i = 0; i < 30; i++) h.hold.onWheel(-100);
  h.rest(back, 60);
  assert.ok(h.last.holdY <= LOW + LEVEL.range + 0.01, `capped (${h.last.holdY})`);
  assert.ok(h.last.holdY >= LOW + LEVEL.range - 0.01, `at the cap (${h.last.holdY})`);
  assert.ok(h.c.anchor.y <= LOW + LEVEL.range + 0.01, `his collar under the cap (${h.c.anchor.y})`);
  for (let i = 0; i < 40; i++) h.hold.onWheel(100);
  h.rest(back, 60);
  assert.ok(Math.abs(h.last.holdY - LOW) < 1e-3, `down to his hang height, no lower (${h.last.holdY})`);
});

test('height: a second finger dragged 100 px up raises him 0.8 ± 0.05, down lowers him', () => {
  const E = env('phone');
  const { h, at } = settled(E);
  const y0 = h.last.holdY;
  for (let i = 0; i < 10; i++) {
    h.hold.onSecondFinger(-10);
    h.go(at);
  }
  h.rest(at, 30);
  within(h.last.holdY - y0, 0.75, 0.85, '100 px up');
  for (let i = 0; i < 5; i++) h.hold.onSecondFinger(10);
  h.rest(at, 30);
  within(h.last.holdY - y0, 0.35, 0.45, '50 px back down');
});

test('picked up off the floor, his hold height eases from his collar to his hang height + 0.35 (60 ms halflife), his collar on the ray all the while', () => {
  const E = env('desktop');
  const collar = onRayAt(E, { x: 0, y: 0 }, 0.59);
  const h = carried(E, collar, { low: 0.64 });
  const at = { ...h.p0 };
  h.go(at);
  assert.ok(h.c.anchor.y < 0.64, 'no jump on the first frame');
  const ys = [];
  for (let i = 0; i < 30; i++) {
    const a = h.go(at);
    ys.push(a.y);
    const p = E.project(a);
    assert.ok(Math.hypot(p.x - at.x, p.y - at.y) < 0.5, 'on the ray');
  }
  assert.ok(
    ys.every((y, i) => i === 0 || y >= ys[i - 1] - 1e-6),
    'rising',
  );
  assert.ok(Math.abs(ys.at(-1) - 0.99) < 0.01, `to 0.99 (${ys.at(-1)})`);
  // (60 ms halflife, critically damped: well over half way by 0.15 s.)
  assert.ok(ys[8] - 0.59 > 0.5 * 0.4, 'quick');
});

test('the shadow’s floor point: 100 px of cursor up at 36° moves the floor under him ≥ 95 px on screen', () => {
  for (const screen of ['phone', 'desktop'])
    for (const yaw of [0, 90]) {
      const m = move100(screen, { yaw });
      const a = m.E.project({ x: m.a.x, y: 0, z: m.a.z });
      const b = m.E.project({ x: m.b.x, y: 0, z: m.b.z });
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) >= 95, `${screen} yaw ${yaw}: ${Math.hypot(b.x - a.x, b.y - a.y)} px`);
    }
});

test('the floor: a 100 px down drag keeps his collar on the cursor (no gap) and never under his hang height', () => {
  for (const screen of ['phone', 'desktop']) {
    const E = env(screen);
    const { h, at } = settled(E);
    const to = { x: at.x, y: at.y + 100 };
    let worst = 0;
    for (const p of path(at, to, 10)) {
      const a = h.go(p);
      assert.ok(a.y >= LOW - 1e-6, `${screen}: at least his hang height (${a.y})`);
      const q = E.project(a);
      worst = Math.max(worst, Math.hypot(q.x - p.x, q.y - p.y));
    }
    h.rest(to, 10);
    assert.ok(worst <= 2, `${screen}: ${worst.toFixed(2)} px off the cursor`);
    assert.ok(Math.abs(h.c.anchor.y - 1) < 0.01, `${screen}: still at his hold height (${h.c.anchor.y})`);
  }
});

test('the floor: grabbed standing (his collar under his hang height), a 100 px down drag right away leaves no gap between his collar and the cursor', () => {
  for (const screen of ['phone', 'desktop']) {
    const E = env(screen);
    const collar = onRayAt(E, { x: 0, y: 0 }, 0.59);
    const h = carried(E, collar, { low: 0.64, press: { x: 0, y: -30 } });
    const to = { x: h.p0.x, y: h.p0.y + 100 };
    for (const p of path(h.p0, to, 6)) h.go(p);
    h.rest(to, 12);
    const q = E.project(h.c.anchor);
    assert.ok(
      Math.hypot(q.x - to.x, q.y - to.y) <= 2,
      `${screen}: ${Math.hypot(q.x - to.x, q.y - to.y).toFixed(2)} px`,
    );
    assert.ok(h.c.anchor.y >= 0.64 - 1e-6, `${screen}: clear of the floor`);
  }
});

test('the walls: past the back wall he climbs the cursor’s ray; at yaw 45 zoomed out to 0.5x, 400 px past a side wall changes his depth ≤ 0.05 and his size ≤ 2%, the push kept and the ring pulsed', () => {
  // (Back wall: up past it, the collar stays on the cursor and rises.)
  const E = env('desktop');
  const { h, at } = settled(E);
  const up = { x: at.x, y: at.y - 700 };
  for (const p of path(at, up, 60)) h.go(p);
  h.rest(up, 10);
  const q = E.project(h.c.anchor);
  assert.ok(Math.hypot(q.x - up.x, q.y - up.y) <= 2, 'on the cursor past the back wall');
  assert.ok(h.c.anchor.y > 1.2, `climbing (${h.c.anchor.y})`);
  // (A side wall.)
  for (const screen of ['phone', 'desktop']) {
    const S = env(screen, { yaw: 45, zoom: 0.5 });
    const { h: g, at: a0 } = settled(S);
    let px = { ...a0 };
    let first = null;
    for (let i = 0; i < 400 && !first; i++) {
      px = { x: px.x + 3, y: px.y };
      g.go(px);
      if (g.last.cues.pulse) first = { ...g.c.anchor };
    }
    assert.ok(first, `${screen}: reached the side wall, the ring pulsed`);
    const d0 = depthAlong(first, 45 * RAD);
    const k0 = S.pxPerUnit(first);
    let most = 0;
    let size = 0;
    for (let i = 0; i < 100; i++) {
      px = { x: px.x + 4, y: px.y };
      const a = g.go(px);
      most = Math.max(most, Math.abs(depthAlong(a, 45 * RAD) - d0));
      size = Math.max(size, Math.abs(S.pxPerUnit(a) / k0 - 1));
    }
    assert.ok(g.c.push, `${screen}: pushed, for the toss`);
    assert.ok(most <= 0.05, `${screen}: depth ${most.toFixed(3)}`);
    assert.ok(size <= 0.02, `${screen}: size ${(size * 100).toFixed(1)}%`);
  }
});

/** Let go at the end of `h`'s frames: where he lands (his feet `hang` under his collar). */
function landing(h, hang = LOW - 0.06) {
  const v = h.hold.release(h.c, h.t);
  assert.ok(v, 'level lets go with its own velocity');
  let root = { x: h.c.anchor.x, y: h.c.anchor.y - hang, z: h.c.anchor.z };
  let vel = { ...v };
  for (let i = 0; i < 300; i++) {
    const f = fallStep(root, vel, root.y, DT, null);
    root = f.root;
    vel = f.vel;
    if (f.landed) return { root, v };
  }
  assert.fail('never landed');
}

test('let go: a 100 px flick up in 0.1 s at 36° lands him 0.6-1.2 further away; one across lands within 0.1 in depth; capped at 4 u/s across and -3..2.5 up', () => {
  for (const screen of ['phone', 'desktop'])
    for (const yaw of [0, 90]) {
      for (const [dx, dy] of [
        [0, -100],
        [100, 0],
      ]) {
        const E = env(screen, { yaw });
        const { h, at } = settled(E);
        const to = { x: at.x + dx, y: at.y + dy };
        for (const p of path(at, to, 6)) h.go(p);
        const from = { ...h.c.anchor };
        const { root, v } = landing(h);
        assert.ok(Math.hypot(v.x, v.z) <= 4 + 1e-6 && v.y <= 2.5 && v.y >= -3, 'capped');
        const away = depthAlong(root, yaw * RAD) - depthAlong(from, yaw * RAD);
        if (dy) within(away, 0.6, 1.2, `${screen} yaw ${yaw}: a flick up lands further away`);
        else assert.ok(Math.abs(away) <= 0.1, `${screen} yaw ${yaw}: across, depth ${away}`);
      }
    }
});

test('let go pushed against a side wall: no speed across (the push rule)', () => {
  const S = env('desktop', { yaw: 45, zoom: 0.5 });
  const { h, at } = settled(S);
  let px = { ...at };
  for (let i = 0; i < 500 && !h.c.push; i++) h.go((px = { x: px.x + 6, y: px.y }));
  for (let i = 0; i < 6; i++) h.go((px = { x: px.x + 6, y: px.y }));
  assert.ok(h.c.push);
  const v = h.hold.release(h.c, h.t);
  assert.ok(v && Math.hypot(v.x, v.z) < 1e-6, 'none across');
});

test('the cost: a frame of the level hold and the shared cue numbers under 0.1 ms in a 10k-frame bench', () => {
  const E = env('desktop');
  const { h, at } = settled(E);
  const N = 10_000;
  let k = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const px = { x: at.x + 200 * Math.sin(i * 0.05), y: at.y + 120 * Math.cos(i * 0.031) };
    const a = h.go(px);
    const foot = a.y - 0.6;
    const b = blobLook(foot, 0.34);
    k = cueStep(k, { mode: 'always', want: mixWants(foot, 1), held: true, dt: DT }) * lineShare(foot) + b.alpha * 0;
  }
  const per = (performance.now() - t0) / N;
  assert.ok(per <= 0.1, `${per.toFixed(4)} ms a frame`);
  assert.ok(Number.isFinite(k));
});

test('the release window and the follow: level’s CARRY numbers are the shared ones', () => {
  assert.ok(CARRY.window >= 0.07, 'the samples cover the 70 ms window');
});
