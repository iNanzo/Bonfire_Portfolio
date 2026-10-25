// What the brain feels while NEWT is held (carry.js createHand, handStep, handFeel): the shake and
// the drag speed come only from the user's own pointer, never from a drag kind easing his collar
// onto it (the grab offset, a finger's lift, the bead's spring along the ray and its hold height).
// Each kind (today, level, tilt, bead) is driven as main.js drives it on the toy's default desktop
// (1280x800) and phone (390x844) cameras, frame by frame at 60 fps, with the brain reading the
// hand: a still grab held 3 s is never shaken (no surprised face, so no "shaken" line), adds no
// stress (so no flee once he lands) and brings no early Thrash; a gentle carry isn't a shake;
// a real shake still is, with stress.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHold } from '../src/invitation/holds/index.js';
import { levelAxes, rayAtY } from '../src/invitation/hold.js';
import { bodyStep, createBody } from '../src/invitation/play.js';
import { NEWT_RADIUS, viewArea } from '../src/invitation/area.js';
import { frameView, texelGrid } from '../src/invitation/pixels.js';
import { HAND, createHand, handFeel, handStep } from '../src/invitation/carry.js';
import { TUNE, createBrain } from '../src/invitation/brain.js';
import { CUES } from '../src/invitation/cues.js';

const RAD = Math.PI / 180;
const LOW = 0.642;
const STAND = 0.589;
const DT = 1 / 60;
const INSETS = { top: 16, bottom: 80, left: 24, right: 24 };
const SCREENS = {
  desktop: { cssW: 1280, cssH: 800, dpr: 1, touch: false },
  phone: { cssW: 390, cssH: 844, dpr: 3, touch: true },
};
/** main.js FINGER_LIFT, the bead's own (holds/bead.js feel.fingerLift). */
const FINGER_LIFT = 80;

/** The toy's default camera on `screen`: rays through client px, points onto the screen, the play area. */
function rig(screen) {
  const { cssW: w, cssH: h, dpr } = SCREENS[screen];
  const grid = texelGrid({ cssW: w, cssH: h, dpr, pixelSize: '128' });
  const view = frameView({ cssW: w, cssH: h, grid, insets: INSETS, area: 2 + NEWT_RADIUS });
  const bounds = viewArea({ view, cssW: w, cssH: h, insets: INSETS });
  const e = 36 * RAD;
  const position = { x: 0, y: 0.5 + view.distance * Math.sin(e), z: view.distance * Math.cos(e) };
  const norm = (v) => {
    const n = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / n, y: v.y / n, z: v.z / n };
  };
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const f = norm({ x: -position.x, y: 0.5 - position.y, z: -position.z });
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
  const camera = { position, yaw: 0, elevation: e, distance: view.distance, target: { x: 0, z: 0 } };
  return { rayAt, project, camera, bounds, w, h };
}

/** CSS px a world unit across the screen at `p` (main.js's, from the camera's level right). */
function pxPerUnit(r, p) {
  const { right } = levelAxes(r.camera.yaw);
  const a = r.project(p);
  const b = r.project({ x: p.x + right.x * 0.1, y: p.y, z: p.z + right.z * 0.1 });
  return Math.hypot(b.x - a.x, b.y - a.y) / 0.1;
}

/**
 * NEWT grabbed standing in the middle of `screen` with `kind`, the pointer at `path(t)` (client
 * px, t from the grab) for `seconds`, as main.js does it: the kind's step (a finger's lift over
 * itself coming in over CARRY.liftIn), play.js bodyStep, the hand on the pointer itself and the
 * brain reading it. Returns every frame's brain output and the brain.
 */
function heldFor(kind, screen, path, seconds = 3) {
  const r = rig(screen);
  const { touch } = SCREENS[screen];
  const at = rayAtY(r.rayAt(r.w / 2, r.h / 2), 1);
  const collar = { x: at.x, y: STAND, z: at.z };
  const cpx = r.project(collar);
  const hold = createHold(kind, { rng: () => 0.5 });
  const body = createBody({ x: at.x, z: at.z });
  const brain = createBrain({ seed: 3, calm: true, bounds: r.bounds });
  brain.step({
    t: 0,
    dt: DT,
    events: [],
    button: null,
    pointer: null,
    newt: { x: at.x, z: at.z, yaw: 0, grounded: true },
    clip: null,
    carry: null,
  });
  const p0 = path(0);
  hold.start({
    t: DT,
    collar,
    // (The press began a few px off his collar; the grab came once it strayed.)
    press: { x: p0.x, y: p0.y },
    collarPx: cpx,
    rayAt: r.rayAt,
    camera: r.camera,
    low: LOW,
    bounds: r.bounds,
    touch,
  });
  const hand = createHand(p0, DT);
  let last = collar;
  const outs = [];
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    const t = DT + i * DT;
    const ptr = path(t - DT);
    const lift = touch ? FINGER_LIFT * Math.min(1, (t - DT) / 0.15) : 0;
    const st = hold.step({
      t,
      dt: DT,
      px: { x: ptr.x, y: ptr.y - lift },
      rayAt: r.rayAt,
      camera: r.camera,
      low: LOW,
      bounds: r.bounds,
      carry: body.mode === 'held' ? body.carry : null,
      clip: 'Held',
      project: r.project,
      stage: { top: 0, height: r.h },
    });
    bodyStep(body, {
      state: 'held',
      move: { mode: 'stay', goal: null, speed: 0 },
      pointer: null,
      bounds: r.bounds,
      dt: DT,
      t,
      collar: last,
      target: st.anchor,
    });
    last = body.carry.anchor;
    handStep(hand, ptr, DT, t, pxPerUnit(r, last));
    const out = brain.step({
      t,
      dt: DT,
      events: i === 1 ? [{ type: 'grab', on: 'newt', x: ptr.x, y: ptr.y, t }] : [],
      button: null,
      pointer: null,
      newt: { x: last.x, z: last.z, yaw: 0, grounded: false },
      clip: null,
      carry: i === 1 ? null : handFeel(hand),
    });
    outs.push({ t, out, stress: brain.snapshot().stress, feel: handFeel(hand) });
  }
  return outs;
}

/** The middle of the screen, where he's grabbed: a few px under his collar. */
const startPx = (screen) => {
  const r = rig(screen);
  const at = rayAtY(r.rayAt(r.w / 2, r.h / 2), 1);
  const c = r.project({ x: at.x, y: STAND, z: at.z });
  return { x: c.x + 4, y: c.y + 14 };
};

test('a still grab held 3 s, with every drag kind on the desktop and the phone: never shaken, no stress, no early Thrash', () => {
  for (const screen of /** @type {const} */ (['desktop', 'phone']))
    for (const kind of ['today', 'level', 'tilt', 'bead']) {
      const p = startPx(screen);
      const frames = heldFor(kind, screen, () => p);
      const tag = `${kind} on the ${screen}`;
      assert.equal(frames.at(-1).out.state, 'held', tag);
      for (const f of frames) {
        assert.notEqual(f.out.face, 'surprised', `${tag}: shaken at ${f.t.toFixed(3)} s`);
        assert.ok(f.feel.shake < TUNE.shakeSoft, `${tag}: shake ${f.feel.shake.toFixed(2)} at ${f.t.toFixed(3)} s`);
        assert.equal(f.feel.dragSpeed, 0, `${tag}: drag speed at ${f.t.toFixed(3)} s`);
        assert.equal(f.stress, 0, `${tag}: stress at ${f.t.toFixed(3)} s`);
        if (f.t < TUNE.thrashMin) assert.notEqual(f.out.clip, 'Thrash', `${tag}: a Thrash at ${f.t.toFixed(2)} s`);
      }
    }
});

test('carried gently side to side (about 140 px/s at most) is no shake, with every kind', () => {
  for (const screen of /** @type {const} */ (['desktop', 'phone']))
    for (const kind of ['today', 'level', 'tilt', 'bead']) {
      const p = startPx(screen);
      const A = screen === 'phone' ? 60 : 90;
      const w = 140 / A;
      const frames = heldFor(kind, screen, (t) => ({ x: p.x + A * Math.sin(w * t), y: p.y }), 4);
      for (const f of frames)
        assert.notEqual(f.out.face, 'surprised', `${kind} on the ${screen}: shaken at ${f.t.toFixed(2)} s`);
      assert.ok(
        frames.some((f) => f.feel.dragSpeed > 0.5),
        `${kind} on the ${screen}: dragged`,
      );
    }
});

test('a real shake (±40 px at 5 Hz from 1 s) still shakes him, with stress, with every kind', () => {
  for (const screen of /** @type {const} */ (['desktop', 'phone']))
    for (const kind of ['today', 'level', 'tilt', 'bead']) {
      const p = startPx(screen);
      const frames = heldFor(kind, screen, (t) => ({
        x: p.x + (t > 1 ? 40 * Math.sin(2 * Math.PI * 5 * (t - 1)) : 0),
        y: p.y,
      }));
      const tag = `${kind} on the ${screen}`;
      const first = frames.find((f) => f.out.face === 'surprised');
      assert.ok(first, `${tag}: shaken`);
      assert.ok(first.t > 1 && first.t < 1.4, `${tag}: shaken at ${first.t.toFixed(2)} s`);
      assert.ok(frames.at(-1).stress > 0.5, `${tag}: stress ${frames.at(-1).stress.toFixed(2)}`);
    }
});

test('the hand: still, nothing; a pointer already moving as he’s grabbed reads no shake while it settles (HAND.settle), then its own', () => {
  const h = createHand({ x: 100, y: 100 }, 0);
  for (let t = DT; t < 1; t += DT) handStep(h, { x: 100, y: 100 }, DT, t, 100);
  assert.deepEqual(handFeel(h), { dragSpeed: 0, shake: 0 });
  // (Grabbed mid-drag at 600 px/s, steady: the follow catching up from rest is not a shake.)
  const m = createHand({ x: 100, y: 100 }, 0);
  let most = 0;
  for (let t = DT; t < 1; t += DT) {
    handStep(m, { x: 100 + 600 * t, y: 100 }, DT, t, 100);
    most = Math.max(most, handFeel(m).shake);
  }
  assert.ok(most < TUNE.shakeSoft, `steady drag: shake ${most.toFixed(2)}`);
  assert.ok(
    Math.abs(handFeel(m).dragSpeed * CUES.dragPx - 600) < 30,
    `600 px/s, read ${(handFeel(m).dragSpeed * CUES.dragPx).toFixed(0)}`,
  );
  assert.ok(HAND.settle > 0 && HAND.settle <= 0.25);
});
