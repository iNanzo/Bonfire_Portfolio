// The 'bead' drag kind (src/invitation/holds/bead.js), checked as numbers against design.md's
// candidate on the toy's own default phone (390x844) and desktop (1280x800) cameras (pixels.js
// frameView's distance, a 20° pinhole like camera.js's): held still, 100 px up the screen carries
// him away as far as a level plane would; a flick up lofts him toward the camera and he settles
// back; a flick down skims the floor; his collar is on the cursor every frame; the wheel and a
// second finger set his hold height; the back wall is a climb and a side wall never slides him in
// depth; the rope goes slack on a drop and its swing dies away; a throw lands where the preview
// ring said, an up flick further away with a lob (not as far as one across); he keeps the heading
// he was grabbed with; and a frame costs well under 0.15 ms.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEAD,
  beadPlane,
  createBeadHold,
  hangRope,
  landingPoint,
  ropeStep,
  ropeTilt,
} from '../src/invitation/holds/bead.js';
import { createHold } from '../src/invitation/holds/index.js';
import { depthAlong, levelAxes, rayAtY } from '../src/invitation/hold.js';
import { bodyStep, createBody } from '../src/invitation/play.js';
import { NEWT_RADIUS, viewArea } from '../src/invitation/area.js';
import { frameView, texelGrid } from '../src/invitation/pixels.js';
import { clampTo } from '../src/invitation/steer.js';

const RAD = Math.PI / 180;
/** main.js hangY on the model (hangHeight 0.582 + HANG_GAP 0.06), and his collar standing. */
const LOW = 0.642;
const STAND = 0.589;
const HANG = LOW - 0.06;
const INSETS = { top: 16, bottom: 80, left: 24, right: 24 };
const SCREENS = { phone: { cssW: 390, cssH: 844, dpr: 3 }, desktop: { cssW: 1280, cssH: 800, dpr: 1 } };

/**
 * The toy's default camera on `screen` turned to `yaw`, at `elevation` (degrees), zoomed by
 * `zoom` (home distance over distance): rays through client px, points onto the screen, the
 * play area.
 */
function rig(screen, { yaw = 0, elevation = 36, zoom = 1 } = {}) {
  const { cssW: w, cssH: h, dpr } = SCREENS[screen];
  const grid = texelGrid({ cssW: w, cssH: h, dpr, pixelSize: '128' });
  const view = frameView({ cssW: w, cssH: h, grid, insets: INSETS, area: 2 + NEWT_RADIUS });
  const bounds = viewArea({ view, cssW: w, cssH: h, insets: INSETS });
  const distance = view.distance / zoom;
  const T = { x: 0, y: 0.5, z: 0 };
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
  const depth = (q) => (q.x - position.x) * f.x + (q.y - position.y) * f.y + (q.z - position.z) * f.z;
  const project = (q) => {
    const v = { x: q.x - position.x, y: q.y - position.y, z: q.z - position.z };
    const z = depth(q);
    return {
      x: w / 2 + (F * (v.x * r.x + v.y * r.y + v.z * r.z)) / z,
      y: h / 2 - (F * (v.x * u.x + v.y * u.y + v.z * u.z)) / z,
    };
  };
  const camera = { position, yaw: p, elevation: e, distance, target: { x: 0, z: 0 } };
  return { rayAt, project, camera, bounds, scale: (q) => F / depth(q), w, h };
}

/** A seeded 0..1 (mulberry32). */
function seeded(seed = 7) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * NEWT held by the bead as main.js does it, frame by frame at 60 fps: grabbed standing at
 * `at` (his collar, pressed `pressOff` px from it on screen), the cursor at `path(t)` (client px,
 * t from the grab), the hold's anchor through play.js bodyStep (carry.js holdStep), until
 * `until`; then, with `release`, let go and fallen with play.js bodyStep until he lands.
 * `act(t, hold)` runs before each frame (the wheel, a second finger); `given`, more for its start
 * (what main.js once handed it).
 */
function sim(
  r,
  { path, until, at = home(r), pressOff = { x: 0, y: 0 }, release = false, act = null, clip = 'Held', given = {} },
) {
  const hold = createBeadHold({ rng: seeded() });
  const collar = { x: at.x, y: STAND, z: at.z };
  const cpx = r.project(collar);
  const press = { x: cpx.x + pressOff.x, y: cpx.y + pressOff.y };
  const body = createBody({ x: at.x, z: at.z });
  const dt = 1 / 60;
  const move = { mode: 'stay', goal: null, speed: 0 };
  hold.start({
    t: 0,
    collar,
    press,
    collarPx: cpx,
    rayAt: r.rayAt,
    camera: r.camera,
    low: LOW,
    bounds: r.bounds,
    ...given,
  });
  const frames = [];
  let t = 0;
  let last = collar;
  for (; t <= until + 1e-9; t += dt) {
    act?.(t, hold);
    const px = path(t);
    const st = hold.step({
      t,
      dt,
      px,
      rayAt: r.rayAt,
      camera: r.camera,
      low: LOW,
      bounds: r.bounds,
      carry: body.mode === 'held' ? body.carry : null,
      clip,
      project: r.project,
    });
    bodyStep(body, { state: 'held', move, pointer: null, bounds: r.bounds, dt, t, collar: last, target: st.anchor });
    if (st.push !== undefined && body.carry) body.carry.push = st.push;
    last = body.carry.anchor;
    const rope = hold.state.rope;
    const k = HANG / BEAD.rope;
    const feet = {
      x: last.x + (rope.bob.x - last.x) * k,
      y: last.y + (rope.bob.y - last.y) * k,
      z: last.z + (rope.bob.z - last.z) * k,
    };
    const on = r.project(last);
    frames.push({
      t,
      px,
      step: st,
      anchor: { ...last },
      feet,
      gap: Math.hypot(on.x - px.x, on.y - px.y),
      holdY: st.holdY,
      scale: r.scale(last),
      state: hold.state,
    });
  }
  if (!release) return { frames, hold };
  const end = frames[frames.length - 1];
  const v = hold.release(body.carry, t - dt);
  const landing = hold.landing;
  body.root = { ...end.feet };
  let apex = end.feet.y;
  let fall = 0;
  for (let i = 0; i < 600 && body.mode !== 'ground'; i++) {
    bodyStep(body, {
      state: 'fall',
      move,
      pointer: null,
      bounds: r.bounds,
      dt,
      t: t + i * dt,
      footOffset: 0,
      released: i ? null : v,
    });
    apex = Math.max(apex, body.root.y);
    fall += dt;
  }
  return {
    frames,
    hold,
    v,
    landing,
    landed: { x: body.root.x, z: body.root.z },
    apex: apex - end.feet.y,
    from: end.feet,
    fall,
  };
}

const still = (p) => () => p;
const ramp = (a, b, t0, t1) => (t) => {
  const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
};
/**
 * Where he's grabbed by default: under where the middle of the screen's ray is 1.0 high (as
 * design.md measures, his collar there), standing.
 */
const home = (r) => {
  const p = rayAtY(r.rayAt(r.w / 2, r.h / 2), 1);
  return { x: p.x, z: p.z };
};
const centrePx = (r) => {
  const at = home(r);
  return r.project({ x: at.x, y: STAND, z: at.z });
};
/** Settled at the hold height (1.2 s), then the cursor `d` px over `span` s, then `hold` s still. */
const moveBy = (r, d, span, hold = 1.2, extra = {}) => {
  const at = extra.at ?? home(r);
  const a = r.project({ x: at.x, y: STAND, z: at.z });
  const b = { x: a.x + d.x, y: a.y + d.y };
  return sim(r, { path: ramp(a, b, 1.2, 1.2 + span), until: 1.2 + span + hold, ...extra });
};
const settledAt = (frames, t) => frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best));

test('bead: a hold of its own kind, In the Mix by default, with the squash, an 80 px finger lift (the ring over the finger) and a second finger for height', () => {
  const h = createHold('bead');
  assert.equal(h.kind, 'bead');
  assert.deepEqual(h.feel, { groundCues: 'mix', squash: true, fingerLift: 80, secondFinger: true });
  assert.equal(typeof h.onWheel, 'function');
  assert.equal(typeof h.onSecondFinger, 'function');
  assert.equal(h.plane, null, 'no plane before a grab');
});

test('bead: the plane it springs toward is level from 35° of elevation up, upright facing the camera by 12°, smoothly between', () => {
  for (const yaw of [0, 90]) {
    const cam = (e) => ({ position: { x: 0, y: 0, z: 0 }, yaw: yaw * RAD, elevation: e * RAD, distance: 10 });
    const { toward } = levelAxes(yaw * RAD);
    assert.ok(Math.abs(beadPlane(cam(36), { x: 0, z: 0 }, 1).normal.y - 1) < 1e-9, 'level at 36°');
    const up = beadPlane(cam(12), { x: 0, z: 0 }, 1).normal;
    assert.ok(
      Math.abs(up.y) < 1e-9 && Math.abs(up.x - toward.x) < 1e-9 && Math.abs(up.z - toward.z) < 1e-9,
      'upright at 12°',
    );
    const mid = beadPlane(cam(24), { x: 0, z: 0 }, 1).normal;
    assert.ok(mid.y > 0.1 && mid.y < 0.99, 'between at 24°');
  }
});

test('bead, settled: per 100 px of cursor up held still at 36°, he goes as far away as level’s plane puts him (within 0.03): 1.45-1.75 on the phone, 0.90-1.10 on the desktop, at yaw 0 and 90; a little smaller with distance', () => {
  for (const [screen, lo, hi] of [
    ['phone', 1.45, 1.75],
    ['desktop', 0.9, 1.1],
  ])
    for (const yaw of [0, 90]) {
      const r = rig(screen, { yaw });
      const { frames } = moveBy(r, { x: 0, y: -100 }, 0.25);
      const a = settledAt(frames, 1.2);
      const b = frames[frames.length - 1];
      const away = depthAlong(b.anchor, r.camera.yaw) - depthAlong(a.anchor, r.camera.yaw);
      assert.ok(away >= lo && away <= hi, `${screen} yaw ${yaw}: away ${away.toFixed(3)}`);
      assert.ok(
        Math.abs(b.anchor.y - a.anchor.y) <= 0.01,
        `${screen} yaw ${yaw}: level, Δy ${(b.anchor.y - a.anchor.y).toFixed(3)}`,
      );
      const level = rayAtY(r.rayAt(b.px.x, b.px.y), b.holdY);
      const off = Math.hypot(level.x - b.anchor.x, level.y - b.anchor.y, level.z - b.anchor.z);
      assert.ok(off <= 0.03, `${screen} yaw ${yaw}: on level’s plane, ${off.toFixed(3)} off`);
      const size = b.scale / a.scale - 1;
      assert.ok(size <= -0.04 && size >= -0.08, `${screen} yaw ${yaw}: size ${(size * 100).toFixed(1)}%`);
    }
});

test('bead, a finger (HoldStart.touch): per 100 px up held still he goes 0.55-0.65 as far away as with the mouse at 24°, 36° and 50°, his collar on the finger’s ray; held still, the ring shows at or above the finger', () => {
  const finger = createHold('bead').feel.fingerLift ?? 0;
  for (const elevation of [24, 36, 50]) {
    for (const yaw of [0, 90]) {
      const r = rig('phone', { yaw, elevation });
      const at = `phone ${elevation}° yaw ${yaw}`;
      const away = (given) => {
        const { frames } = moveBy(r, { x: 0, y: -100 }, 0.25, 1.2, { given });
        const a = settledAt(frames, 1.2);
        const b = frames[frames.length - 1];
        assert.ok(b.gap <= 1, `${at}: ${b.gap.toFixed(2)} px off the ray`);
        return depthAlong(b.anchor, r.camera.yaw) - depthAlong(a.anchor, r.camera.yaw);
      };
      const share = away({ touch: true }) / away({});
      assert.ok(share >= 0.55 && share <= 0.65, `${at}: a finger goes ${share.toFixed(3)} as far`);
      const { frames } = sim(r, { path: still(centrePx(r)), until: 1.5, given: { touch: true } });
      const f = frames[frames.length - 1];
      const ring = r.project({ x: f.step.cues.ring.x, y: 0, z: f.step.cues.ring.z });
      assert.ok(
        ring.y <= f.px.y + finger,
        `${at}: the ring ${(ring.y - f.px.y - finger).toFixed(1)} px under the finger`,
      );
    }
  }
});

test('bead, settled: 70° still carries him away (0.85-1.05 / 0.55-0.67), 12° stands the plane up so it’s a lift (0.75-0.90 / 0.44-0.54, away ≤ 0.05), and 24° does some of both', () => {
  for (const [screen, a70, l12, mix] of [
    ['phone', [0.85, 1.05], [0.75, 0.9], 0.2],
    ['desktop', [0.55, 0.67], [0.44, 0.54], 0.1],
  ]) {
    const at = (elevation) => {
      const r = rig(screen, { elevation });
      const { frames } = moveBy(r, { x: 0, y: -100 }, 0.25);
      const a = settledAt(frames, 1.2).anchor;
      const b = frames[frames.length - 1].anchor;
      return { away: depthAlong(b, r.camera.yaw) - depthAlong(a, r.camera.yaw), lift: b.y - a.y };
    };
    const e70 = at(70);
    assert.ok(e70.away >= a70[0] && e70.away <= a70[1], `${screen} 70°: away ${e70.away.toFixed(3)}`);
    const e12 = at(12);
    assert.ok(e12.lift >= l12[0] && e12.lift <= l12[1], `${screen} 12°: lift ${e12.lift.toFixed(3)}`);
    assert.ok(Math.abs(e12.away) <= 0.05, `${screen} 12°: away ${e12.away.toFixed(3)}`);
    const e24 = at(24);
    assert.ok(
      e24.away >= mix && e24.lift >= mix,
      `${screen} 24°: away ${e24.away.toFixed(3)}, lift ${e24.lift.toFixed(3)}`,
    );
  }
});

test('bead, settled: 100 px across carries him across (0.80-0.98 / 0.50-0.60) at the same depth (≤ 0.02)', () => {
  for (const [screen, lo, hi] of [
    ['phone', 0.8, 0.98],
    ['desktop', 0.5, 0.6],
  ])
    for (const yaw of [0, 90]) {
      const r = rig(screen, { yaw });
      const { frames } = moveBy(r, { x: 100, y: 0 }, 0.25);
      const a = settledAt(frames, 1.2).anchor;
      const b = frames[frames.length - 1].anchor;
      const { right } = levelAxes(r.camera.yaw);
      const across = (b.x - a.x) * right.x + (b.z - a.z) * right.z;
      const depth = depthAlong(b, r.camera.yaw) - depthAlong(a, r.camera.yaw);
      assert.ok(across >= lo && across <= hi, `${screen} yaw ${yaw}: across ${across.toFixed(3)}`);
      assert.ok(Math.abs(depth) <= 0.02, `${screen} yaw ${yaw}: depth ${depth.toFixed(3)}`);
    }
});

test('bead: his collar is within 1 px of the cursor every frame from 0.15 s after the grab, grabbed off his collar, through flicks up and down and 3 u/s sweeps', () => {
  for (const screen of ['phone', 'desktop']) {
    const r = rig(screen);
    const c = centrePx(r);
    const path = (t) => {
      if (t < 0.6) return { x: c.x, y: c.y };
      if (t < 0.7) return { x: c.x, y: c.y - (t - 0.6) * 1000 };
      if (t < 1.4) return { x: c.x, y: c.y - 100 };
      if (t < 1.5) return { x: c.x, y: c.y - 100 + (t - 1.4) * 1500 };
      // (A sweep across at about 3 u/s, there and back.)
      const k = Math.sin((t - 1.5) * 4) * (screen === 'phone' ? 120 : 200);
      return { x: c.x + k, y: c.y + 50 };
    };
    const { frames } = sim(r, { path, until: 3.5, pressOff: { x: 0, y: -40 } });
    const worst = Math.max(...frames.filter((f) => f.t >= 0.15).map((f) => f.gap));
    assert.ok(worst <= 1, `${screen}: worst gap ${worst.toFixed(2)} px`);
  }
});

test('bead, a flick up (100 px in 0.1 s): he lofts 0.40-0.70 (phone) / 0.25-0.45 (desktop) over his hold height toward the camera, his feet swing 0.3 or more toward it, and he’s back within 0.02 by 0.65 s', () => {
  for (const [screen, lo, hi] of [
    ['phone', 0.4, 0.7],
    ['desktop', 0.25, 0.45],
  ]) {
    const r = rig(screen);
    const { frames } = moveBy(r, { x: 0, y: -100 }, 0.1, 1.2);
    const after = frames.filter((f) => f.t >= 1.2);
    const holdY = after[0].holdY;
    const peak = Math.max(...after.map((f) => f.anchor.y)) - holdY;
    assert.ok(peak >= lo && peak <= hi, `${screen}: loft ${peak.toFixed(3)}`);
    const { toward } = levelAxes(r.camera.yaw);
    const swing = Math.max(
      ...after.map((f) => (f.feet.x - f.anchor.x) * toward.x + (f.feet.z - f.anchor.z) * toward.z),
    );
    assert.ok(swing >= 0.3, `${screen}: feet toward the camera ${swing.toFixed(3)}`);
    const out = after.filter((f) => Math.abs(f.anchor.y - f.holdY) > 0.02);
    const settle = out.length ? out[out.length - 1].t - 1.2 : 0;
    assert.ok(settle <= 0.65, `${screen}: settled by ${settle.toFixed(2)} s`);
    // (The loft keeps his distance from the camera, so he's as big as he was through it, then
    // shrinks as he settles into the distance: 4-10% bigger at the loft than once he's settled.)
    const most = Math.max(...after.map((f) => f.scale));
    assert.ok(most >= after[0].scale * 0.995, `${screen}: no smaller through the loft`);
    const swell = most / after[after.length - 1].scale - 1;
    assert.ok(swell > 0.04 && swell < 0.1, `${screen}: swell ${(swell * 100).toFixed(1)}%`);
  }
});

test('bead, a flick down (100 px in 0.1 s): he skims the floor at his hang height, his lowest foot 0.02 or more over it every frame, and he’s back within 0.02 of his hold height by 0.55 s', () => {
  for (const screen of ['phone', 'desktop']) {
    const r = rig(screen);
    // (From the middle of the play area: 100 px down from design.md's spot is past the phone's front wall.)
    const { frames } = moveBy(r, { x: 0, y: 100 }, 0.1, 1.2, { at: { x: 0, z: 0 } });
    const lowest = Math.min(...frames.filter((f) => f.t >= 0.3).map((f) => f.feet.y));
    assert.ok(lowest >= 0.02, `${screen}: lowest foot ${lowest.toFixed(3)}`);
    const after = frames.filter((f) => f.t >= 1.2);
    if (screen === 'phone')
      assert.ok(Math.min(...after.map((f) => f.anchor.y)) <= LOW + 0.05, `${screen}: down to the floor’s clamp`);
    const out = after.filter((f) => Math.abs(f.anchor.y - f.holdY) > 0.02);
    const settle = out.length ? out[out.length - 1].t - 1.2 : 0;
    assert.ok(settle <= 0.55, `${screen}: settled by ${settle.toFixed(2)} s`);
  }
});

test('bead, flicks at 12° and 70°: the loft peaks at 0.8 or less and settles within 0.7 s', () => {
  for (const screen of ['phone', 'desktop'])
    for (const elevation of [12, 70]) {
      const r = rig(screen, { elevation });
      const { frames } = moveBy(r, { x: 0, y: -100 }, 0.1, 1.2);
      const after = frames.filter((f) => f.t >= 1.2);
      const end = after[after.length - 1].anchor;
      const peak = Math.max(...after.map((f) => f.anchor.y - f.holdY));
      assert.ok(peak <= 0.8, `${screen} ${elevation}°: loft ${peak.toFixed(3)}`);
      const out = after.filter((f) => Math.hypot(f.anchor.x - end.x, f.anchor.y - end.y, f.anchor.z - end.z) > 0.02);
      const settle = out.length ? out[out.length - 1].t - 1.2 : 0;
      assert.ok(settle <= 0.7, `${screen} ${elevation}°: settled by ${settle.toFixed(2)} s`);
    }
});

test('bead, height: a wheel notch (deltaY 100) moves his hold height 0.10 ± 0.015 within 0.3 s and is taken from the zoom; 30 notches up reach the cap (his hang height + 2.4); a second finger 100 px up lifts it 0.8 ± 0.05', () => {
  const r = rig('desktop');
  const c = centrePx(r);
  let taken = null;
  const down = sim(r, {
    path: still(c),
    until: 1.5,
    act: (t, h) => {
      if (Math.abs(t - 1.2) < 1e-6 || (t > 1.19 && t < 1.205 && taken === null)) taken = h.onWheel(100);
    },
  });
  assert.equal(taken, true, 'taken: no zoom');
  const before = settledAt(down.frames, 1.18).holdY;
  const after = down.frames[down.frames.length - 1].holdY;
  assert.ok(Math.abs(before - after - 0.1) <= 0.015, `down a notch: ${(before - after).toFixed(3)}`);
  let n = 0;
  const up = sim(r, {
    path: still(c),
    until: 3,
    act: (t, h) => {
      if (t > 1 && n < 30) {
        h.onWheel(-100);
        n++;
      }
    },
  });
  const top = up.frames[up.frames.length - 1];
  assert.ok(top.holdY <= LOW + 2.4 + 0.01 && top.holdY >= LOW + 2.4 - 0.02, `the cap: ${top.holdY.toFixed(3)}`);
  assert.ok(top.anchor.y <= LOW + 2.4 + 0.01, `collar at the cap: ${top.anchor.y.toFixed(3)}`);
  let done = false;
  const lift = sim(r, {
    path: still(c),
    until: 1.6,
    act: (t, h) => {
      if (t >= 1.2 && !done) {
        h.onSecondFinger(-100);
        done = true;
      }
    },
  });
  const gain = lift.frames[lift.frames.length - 1].holdY - settledAt(lift.frames, 1.18).holdY;
  assert.ok(Math.abs(gain - 0.8) <= 0.05, `a second finger: ${gain.toFixed(3)}`);
});

test('bead, height (the wheel.log check): at 12°, 15°, 20°, 24°, 30° and 36° a wheel notch lifts him straight up 0.1 (0.085-0.115), his spot on the floor moving 0.02 or less, and the next move closes the gap to the cursor within 0.12 s', () => {
  for (const screen of ['phone', 'desktop']) {
    for (const elevation of [12, 15, 20, 24, 30, 36]) {
      const r = rig(screen, { elevation });
      const c = centrePx(r);
      let done = false;
      // (Still till 1.5 s, a notch up at 1.2 s; then 20 px across over 0.05 s, and still.)
      const run = sim(r, {
        path: ramp(c, { x: c.x + 20, y: c.y }, 1.5, 1.55),
        until: 2,
        act: (t, h) => {
          if (t >= 1.2 && !done) {
            h.onWheel(-100);
            done = true;
          }
        },
      });
      const at = `${screen} at ${elevation}°`;
      const a = settledAt(run.frames, 1.18).anchor;
      const b = settledAt(run.frames, 1.5).anchor;
      const rise = b.y - a.y;
      assert.ok(rise >= 0.085 && rise <= 0.115, `${at}: a notch rose ${rise.toFixed(3)}`);
      const slid = Math.hypot(b.x - a.x, b.z - a.z);
      assert.ok(slid <= 0.02, `${at}: his spot on the floor moved ${slid.toFixed(3)}`);
      // (Still from the notch till the move: never a slide on the floor.)
      const pinned = run.frames.filter((f) => f.t >= 1.2 && f.t < 1.5);
      const drift = Math.max(...pinned.map((f) => Math.hypot(f.anchor.x - a.x, f.anchor.z - a.z)));
      assert.ok(drift <= 0.02, `${at}: drifted ${drift.toFixed(3)} on the floor while he rose`);
      const after = run.frames.filter((f) => f.t >= 1.55 + 0.12 + 1e-6);
      const gap = Math.max(...after.map((f) => f.gap));
      assert.ok(gap <= 1, `${at}: ${gap.toFixed(2)} px off the cursor 0.12 s after the move`);
    }
  }
});

test('bead, edges: pushing up past the back wall climbs along the ray with his collar on the cursor; past a side wall at yaw 45 (zoom 0.5x) 400 px more changes his depth 0.05 or less and his size 2% or less', () => {
  const r = rig('phone', { zoom: 0.5 });
  const c = centrePx(r);
  // (Up the screen till the plane's spot is past the back wall: he climbs it.)
  const back = sim(r, { path: ramp(c, { x: c.x, y: c.y - 220 }, 1.2, 2.2), until: 3 });
  const end = back.frames[back.frames.length - 1];
  assert.ok(end.anchor.z >= r.bounds.minZ - 1e-6, 'inside the back wall');
  assert.ok(end.anchor.y > end.holdY + 0.05, `climbing: ${(end.anchor.y - end.holdY).toFixed(3)} over the hold height`);
  assert.ok(Math.max(...back.frames.filter((f) => f.t > 0.15).map((f) => f.gap)) <= 1, 'on the cursor all the way');
  const s = rig('phone', { yaw: 45, zoom: 0.5 });
  const sc = centrePx(s);
  const side = sim(s, { path: ramp(sc, { x: sc.x + 900, y: sc.y }, 1.2, 4.2), until: 4.6 });
  const pushed = side.frames.filter((f) => f.step.push);
  assert.ok(pushed.length > 0, 'pushed at the side wall');
  const first = pushed[0];
  const later = side.frames.filter((f) => f.px.x >= first.px.x + 400);
  assert.ok(later.length > 0, '400 px past it');
  const last = later[later.length - 1];
  const depth = Math.abs(depthAlong(last.anchor, s.camera.yaw) - depthAlong(first.anchor, s.camera.yaw));
  assert.ok(depth <= 0.05, `depth ${depth.toFixed(3)}`);
  assert.ok(Math.abs(last.scale / first.scale - 1) <= 0.02, 'size');
  for (const f of side.frames) assert.ok(f.feet.y >= 0.02 || f.t < 0.3, 'feet over the floor');
});

test('bead, his heading: no step hands one back (he keeps the one he had as he was grabbed: main.js, the user’s rule), through sweeps across, flicks up and down and Thrash', () => {
  for (const screen of ['phone', 'desktop']) {
    const r = rig(screen);
    const c = centrePx(r);
    // (Handed a heading as he's grabbed, as main.js once did: still none back.)
    const given = { yaw: 2.2 };
    const runs = [
      sim(r, { path: ramp(c, { x: c.x + 500, y: c.y }, 1.2, 1.6), until: 2.4, given }),
      sim(r, { path: ramp(c, { x: c.x, y: c.y - 100 }, 1.2, 1.3), until: 2, given }),
      sim(r, { path: ramp(c, { x: c.x - 80, y: c.y + 100 }, 1.2, 1.3), until: 2, given }),
      sim(r, { path: still(c), until: 2, clip: 'Thrash', given }),
    ];
    for (const { frames } of runs)
      for (const f of frames) assert.ok(!('yaw' in f.step), `${screen}: a heading at ${f.t.toFixed(2)} s`);
  }
});

test('bead, the rope: a 0.5 in 0.1 s drop of the collar goes slack for a frame or more; after a 3 u/s move across stops, the swing dies to under 10% within 2 s; kicks swing it', () => {
  const dt = 1 / 60;
  const top = { x: 0, y: 1.5, z: 0 };
  const r = hangRope(top);
  for (let i = 0; i < 30; i++) ropeStep(r, top, dt);
  let slack = 0;
  for (let i = 1; i <= 12; i++) {
    const c = { x: 0, y: 1.5 - 0.5 * Math.min(1, (i * dt) / 0.1), z: 0 };
    ropeStep(r, c, dt);
    const len = Math.hypot(r.bob.x - c.x, r.bob.y - c.y, r.bob.z - c.z);
    if (len < BEAD.rope - 0.02) slack++;
  }
  assert.ok(slack >= 1, `slack for ${slack} frames`);
  const q = hangRope(top);
  let x = 0;
  for (let i = 0; i < 30; i++) {
    x += 3 * dt;
    ropeStep(q, { x, y: 1.5, z: 0 }, dt);
  }
  const angle = () => Math.abs(ropeTilt(q).z);
  let first = 0;
  let later = 0;
  for (let i = 0; i < 2.75 * 60; i++) {
    ropeStep(q, { x, y: 1.5, z: 0 }, dt);
    const a = angle();
    if (i * dt < 0.75) first = Math.max(first, a);
    if (i * dt >= 2) later = Math.max(later, a);
  }
  assert.ok(first > 0.1, `it swung: ${first.toFixed(3)}`);
  assert.ok(later < 0.1 * first, `died away: ${later.toFixed(4)} of ${first.toFixed(3)}`);
  // (A hold with Thrash: the rope kicked, the tilt swinging though the collar is still.)
  const rr = rig('desktop');
  const { frames } = sim(rr, { path: still(centrePx(rr)), until: 2, clip: 'Thrash' });
  const most = Math.max(...frames.filter((f) => f.t > 0.8).map((f) => Math.hypot(f.step.tilt.x, f.step.tilt.z)));
  assert.ok(most > 0.05 && most < BEAD.tiltMax, `Thrash kicks: ${most.toFixed(3)}`);
});

test('bead, the rope’s tilt: lifted high with the wheel, dropped 160 px and flicked (the capture’s moves) at 15° and 36°, he never flips side to side (read over the top it flipped 2.2 rad in a frame): his tilt changes 0.5 rad a frame or less and stays within tiltMax', () => {
  const sm = (k) => k * k * (3 - 2 * k);
  for (const screen of ['phone', 'desktop']) {
    for (const [yaw, elevation] of [
      [90, 15],
      [0, 15],
      [0, 36],
    ]) {
      const r = rig(screen, { yaw, elevation });
      const c = centrePx(r);
      const mid = { x: c.x, y: c.y + 160 };
      const path = (t) => {
        if (t < 2) return c;
        if (t < 2.6) return { x: c.x, y: c.y + 160 * sm((t - 2) / 0.6) };
        const k = Math.min(1, Math.max(0, (t - 2.75) / 0.1));
        return { x: mid.x + 30 * k, y: mid.y - 100 * k };
      };
      let notches = 0;
      const act = (t, hold) => {
        if (notches < 12 && t >= 0.3 + notches * 0.11) {
          hold.onWheel(-100);
          notches++;
        }
      };
      const { frames } = sim(r, { path, until: 3.2, act });
      let jump = 0;
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1].step.tilt;
        const b = frames[i].step.tilt;
        jump = Math.max(jump, Math.hypot(b.x - a.x, b.z - a.z));
        assert.ok(Math.hypot(b.x, b.z) <= BEAD.tiltMax + 1e-9, `${screen} y${yaw}e${elevation}: tilt within tiltMax`);
      }
      assert.ok(jump <= 0.5, `${screen} y${yaw}e${elevation}: the tilt jumped ${jump.toFixed(3)} rad in a frame`);
    }
  }
});

test('bead, the throw: the landing preview is within 0.15 of where he lands for throws of 1-4 u/s; a 100 px up flick at 36° lands 0.8-1.6 further away with a lob 0.25 or more over where he was let go', () => {
  for (const screen of ['phone', 'desktop']) {
    const r = rig(screen);
    const c = centrePx(r);
    const left = r.project({ x: -1.2, y: STAND, z: 0 });
    let tried = 0;
    for (const pxs of [130, 220, 330, 450, 700]) {
      const run = sim(r, {
        path: ramp(left, { x: left.x + pxs * 2, y: left.y }, 1.2, 3.2),
        until: 2,
        at: { x: -1.2, z: 0 },
        release: true,
      });
      const level = Math.hypot(run.v.x, run.v.z);
      // (Throws that land clear of the edges: at one, carry.js fallStep's bounce takes him back
      // a little, and the ring waits by the edge.)
      const free = landingPoint(run.from, run.v);
      const clearOf = Math.hypot(free.x - clampTo(r.bounds, free).x, free.z - clampTo(r.bounds, free).z) < 1e-9;
      if (level < 1 || level > 4.001 || !clearOf) continue;
      tried++;
      const miss = Math.hypot(run.landing.x - run.landed.x, run.landing.z - run.landed.z);
      assert.ok(miss <= 0.15, `${screen} ${level.toFixed(2)} u/s: preview ${miss.toFixed(3)} off`);
      const ring = run.frames[run.frames.length - 1].step.cues.ring;
      assert.ok(
        ring && Math.hypot(ring.x - run.landed.x, ring.z - run.landed.z) <= 0.1 + level * (BEAD.ringHalf / Math.LN2),
        `${screen} ${level.toFixed(2)} u/s: the ring held near it`,
      );
    }
    assert.ok(tried >= 3, `${screen}: ${tried} throws of 1-4 u/s`);
    const flick = sim(r, { path: ramp(c, { x: c.x, y: c.y - 100 }, 1.2, 1.3), until: 1.3, release: true });
    const away = depthAlong(flick.landed, r.camera.yaw) - depthAlong(flick.from, r.camera.yaw);
    assert.ok(away > 0.8, `${screen}: an up flick throws him away, ${away.toFixed(3)}`);
    assert.ok(flick.apex >= 0.25, `${screen}: lob ${flick.apex.toFixed(3)}`);
  }
});

test('bead, the ring held still: under his collar, not his swinging hips (within 0.05 from 0.5 s after he’s stopped, while his feet swing 0.1 or more), and let go still he lands within 0.08 of it', () => {
  for (const screen of ['phone', 'desktop']) {
    const r = rig(screen);
    const c = centrePx(r);
    const run = sim(r, { path: ramp(c, { x: c.x + 150, y: c.y }, 1.2, 1.5), until: 2.4, release: true });
    const swing = Math.max(
      ...run.frames.filter((f) => f.t >= 1.5).map((f) => Math.hypot(f.feet.x - f.anchor.x, f.feet.z - f.anchor.z)),
    );
    assert.ok(swing >= 0.1, `${screen}: his feet swung ${swing.toFixed(3)}`);
    for (const f of run.frames.filter((g) => g.t >= 2)) {
      const ring = f.step.cues.ring;
      assert.ok(ring, `${screen}: a ring at ${f.t.toFixed(2)} s`);
      const off = Math.hypot(ring.x - f.anchor.x, ring.z - f.anchor.z);
      assert.ok(off <= 0.05, `${screen}: the ring ${off.toFixed(3)} off his collar at ${f.t.toFixed(2)} s`);
    }
    const ring = run.frames[run.frames.length - 1].step.cues.ring;
    const miss = Math.hypot(ring.x - run.landed.x, ring.z - run.landed.z);
    assert.ok(miss <= 0.08, `${screen}: let go still, he landed ${miss.toFixed(3)} off the ring`);
    assert.ok(Math.hypot(run.landing.x - ring.x, run.landing.z - ring.z) <= 0.02, `${screen}: the ring waits there`);
  }
});

test('bead, its cues: In the Mix the ring never under 0.35 while he’s held, and the drop line as the shared rule has it (In the Mix once he’s high)', () => {
  const r = rig('desktop');
  const { frames } = sim(r, { path: still(centrePx(r)), until: 0.5 });
  for (const f of frames) {
    assert.equal(f.step.cues.floor, 0.35);
    assert.ok(!('line' in f.step.cues), 'no line of its own');
  }
});

test('bead, the up flick throw: 100 px in 0.1 s at 36° lands 0.8-1.6 further away with a lob of 0.25 or more, at yaw 0 and 90, not as far as the same flick across throws him', () => {
  for (const screen of ['phone', 'desktop']) {
    for (const yaw of [0, 90]) {
      const r = rig(screen, { yaw });
      const c = centrePx(r);
      const flick = sim(r, { path: ramp(c, { x: c.x, y: c.y - 100 }, 1.2, 1.3), until: 1.3, release: true });
      const away = depthAlong(flick.landed, r.camera.yaw) - depthAlong(flick.from, r.camera.yaw);
      assert.ok(away >= 0.8 && away <= 1.6, `${screen} yaw ${yaw}: up flick lands ${away.toFixed(3)} further away`);
      assert.ok(flick.apex >= 0.25, `${screen} yaw ${yaw}: lob ${flick.apex.toFixed(3)}`);
      const side = sim(r, { path: ramp(c, { x: c.x + 100, y: c.y }, 1.2, 1.3), until: 1.3, release: true });
      const { right } = levelAxes(r.camera.yaw);
      const across = (side.landed.x - side.from.x) * right.x + (side.landed.z - side.from.z) * right.z;
      assert.ok(across > away, `${screen} yaw ${yaw}: across ${across.toFixed(3)}, away ${away.toFixed(3)}`);
    }
  }
});

test('bead, the landing point: straight down from rest, and where a throw’s arc meets the floor under the fall’s gravity', () => {
  assert.deepEqual(landingPoint({ x: 1, y: 0.5, z: 2 }, { x: 0, y: 0, z: 0 }), { x: 1, z: 2 });
  const p = landingPoint({ x: 0, y: 0.6, z: 0 }, { x: 2, y: 1, z: 0 });
  const t = p.x / 2;
  assert.ok(Math.abs(0.6 + t - 6 * t * t) < 1e-9, 'on the floor then');
});

test('bead: a frame (the bead, the rope, the cues) costs 0.15 ms or less over 10k frames', () => {
  const r = rig('phone');
  const c = centrePx(r);
  const hold = createBeadHold({ rng: seeded() });
  const collar = { x: 0, y: STAND, z: 0 };
  hold.start({
    t: 0,
    collar,
    press: c,
    collarPx: c,
    rayAt: r.rayAt,
    camera: r.camera,
    low: LOW,
    bounds: r.bounds,
    yaw: 0,
  });
  const carry = {
    vel: { x: 2, y: 0, z: 0 },
    samples: [
      { t: 0, ...collar },
      { t: 0.05, x: 0.1, y: STAND, z: 0 },
    ],
    push: null,
  };
  const n = 10_000;
  const go = (k) => {
    for (let i = 0; i < k; i++) {
      const t = i / 60;
      hold.step({
        t,
        dt: 1 / 60,
        px: { x: c.x + Math.sin(t) * 80, y: c.y + Math.cos(t) * 60 },
        rayAt: r.rayAt,
        camera: r.camera,
        low: LOW,
        bounds: r.bounds,
        carry: /** @type {any} */ (carry),
        clip: 'Held',
      });
    }
  };
  go(500);
  const t0 = performance.now();
  go(n);
  const ms = (performance.now() - t0) / n;
  assert.ok(ms <= 0.15, `${ms.toFixed(4)} ms a frame`);
});
