// The invitation toy's play area (src/invitation/area.js). The floor is endless: the play area is
// the floor the default view shows fully zoomed out (twice the default distance, yaw 0, no pan),
// inside the clear space over the toolbar with NEWT whole a margin in from its edges wherever he
// stands: a trapezoid widening toward the back, far bigger than the old disc, the same whatever
// the Pixel Size, the open Look sheet or the camera does, and new on a resize; walking,
// wandering, fleeing and carrying stay inside it. The disc it replaced is still the default
// view's framing: a desktop's default view (pixels.js frameView) shows all of it, at every Pixel
// Size, with NEWT still about a fifth of the screen's short side tall; on a phone he's drawn
// about 30% bigger, the disc no longer all fits, and the camera follows him softly (camera.js)
// so a dash to its rim, or round it, never takes him off the screen. A disc's Bounds still work
// everywhere (steer.js and carry.js read a disc's radius from its Bounds: walking, wandering,
// fleeing, sliding along the rim when cornered with no zig-zag, carrying, the toss and the
// fall's bounces). The light's shadow camera (floor.js fitShadow) covers the disc up to the
// highest he's lifted, wherever the camera has turned the light (camera.js lightDir), and moved
// to wherever he is in the play area (shadow texels whole, so his shadow doesn't shimmer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AREA_MARGIN, AREA_RADIUS, NEWT_HEIGHT, NEWT_RADIUS, playArea, viewArea } from '../src/invitation/area.js';
import { centreOf, clampTo, steer, wanderGoal, xRange } from '../src/invitation/steer.js';
import { CARRY, fallStep, grab, holdStep } from '../src/invitation/carry.js';
import { fitShadow } from '../src/invitation/floor.js';
import {
  NEWT_SHARE,
  PHONE_SHARE,
  PIXEL_SIZES,
  frameView,
  newtTexels,
  project,
  texelGrid,
  clearInsets,
} from '../src/invitation/pixels.js';
import { ORBIT, createOrbit, lightDir, orbitPose, orbitStep } from '../src/invitation/camera.js';
import { DEFAULT_LOOK, LOOKS } from '../src/invitation/look.js';
import { GAIT } from '../src/invitation/clips.js';
import { createRng } from '../src/invitation/rng.js';

const SIZES = [
  [390, 844, 3],
  [412, 915, 2.625],
  [1280, 800, 1],
];
/** The stage's insets: a top margin, the toolbar, the side edges. */
const INSETS = { top: 16, bottom: 72, left: 24, right: 24 };
const DT = 1 / 60;
const AREA = playArea();
const R = AREA.r ?? NaN;
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} should be ${b} (±${tol})`);
const radius = (p) => Math.hypot(p.x, p.z);
const inDisc = (p, msg = '') => assert.ok(radius(p) <= R + 1e-6, `${msg} ${JSON.stringify(p)} is outside the disc`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** The default camera for a screen at a Pixel Size, as the stage frames it. */
function viewFor(cssW, cssH, dpr, pixelSize = DEFAULT_LOOK.pixelSize) {
  const grid = texelGrid({ cssW, cssH, dpr, pixelSize });
  const view = frameView({ cssW, cssH, grid, insets: INSETS, area: R + NEWT_RADIUS });
  return { grid, view };
}

/** The play area for a screen at a Pixel Size, with its default view and the view fully zoomed out. */
function areaFor(cssW, cssH, dpr, pixelSize = DEFAULT_LOOK.pixelSize) {
  const { grid, view } = viewFor(cssW, cssH, dpr, pixelSize);
  const area = viewArea({ view, cssW, cssH, insets: INSETS });
  const d = view.distance * ORBIT.zoomMax;
  const e = (view.elevation * Math.PI) / 180;
  const far = {
    ...view,
    distance: d,
    position: { x: 0, y: view.target.y + d * Math.sin(e), z: d * Math.cos(e) },
    shift: {
      x: (INSETS.left + cssW - INSETS.right) / 2 - view.canvasW / 2,
      y: (INSETS.top + cssH - INSETS.bottom) / 2 - view.canvasH / 2,
    },
  };
  return { grid, view, area, far };
}
/** Points along a trapezoid's four edges (its corners among them). */
function edgePoints(b, n = 16) {
  const at = (z) => {
    const k = (b.maxZ - z) / (b.maxZ - b.minZ);
    return [b.minX + ((b.minXBack ?? b.minX) - b.minX) * k, b.maxX + ((b.maxXBack ?? b.maxX) - b.maxX) * k];
  };
  const out = [];
  for (let i = 0; i <= n; i++) {
    const z = b.maxZ + ((b.minZ - b.maxZ) * i) / n;
    const [lo, hi] = at(z);
    out.push({ x: lo, z }, { x: hi, z });
    for (const zz of [b.minZ, b.maxZ]) {
      const [l2, h2] = at(zz);
      out.push({ x: l2 + ((h2 - l2) * i) / n, z: zz });
    }
  }
  return out;
}
/** NEWT standing at `p` on screen in view `v`: the extremes of his body (his width, feet to head). */
function newtBox(v, p) {
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const y of [0, NEWT_HEIGHT])
    for (const [dx, dz] of [
      [-NEWT_RADIUS, 0],
      [NEWT_RADIUS, 0],
      [0, -NEWT_RADIUS],
      [0, NEWT_RADIUS],
    ]) {
      const s = project(v, { x: p.x + dx, y, z: p.z + dz });
      box.left = Math.min(box.left, s.x);
      box.right = Math.max(box.right, s.x);
      box.top = Math.min(box.top, s.y);
      box.bottom = Math.max(box.bottom, s.y);
    }
  return box;
}
const MORE_SIZES = [...SIZES, [844, 390, 3], [1920, 1080, 1], [768, 1024, 2]];

test('the play area is the floor the default view shows fully zoomed out: a trapezoid widening toward the back, NEWT whole and a margin inside the clear space wherever he stands in it, snug at its edges', () => {
  assert.ok(AREA_MARGIN >= 4 && AREA_MARGIN <= 16, `margin ${AREA_MARGIN}`);
  for (const [cssW, cssH, dpr] of MORE_SIZES) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const { area: b, far } = areaFor(cssW, cssH, dpr);
    assert.ok(b.r === undefined, `${at}: no disc`);
    assert.ok(
      b.minZ < -2 && b.maxZ > 1,
      `${at}: deep, round the middle (${b.minZ.toFixed(2)} to ${b.maxZ.toFixed(2)})`,
    );
    assert.ok(b.minX < -1.5 && b.maxX > 1.5, `${at}: wide at the front (${b.minX.toFixed(2)} to ${b.maxX.toFixed(2)})`);
    assert.ok(b.minXBack < b.minX && b.maxXBack > b.maxX, `${at}: wider at the back`);
    assert.ok((b.maxXBack - b.minXBack) * (b.maxZ - b.minZ) > 4 * R * R * 4, `${at}: far bigger than the old disc`);
    const clear = {
      left: INSETS.left + AREA_MARGIN,
      right: cssW - INSETS.right - AREA_MARGIN,
      top: INSETS.top + AREA_MARGIN,
      bottom: cssH - INSETS.bottom - AREA_MARGIN,
    };
    for (const p of edgePoints(b)) {
      const box = newtBox(far, p);
      const where = `${at}: NEWT at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
      assert.ok(
        box.left >= clear.left - 0.5 && box.right <= clear.right + 0.5,
        `${where} across ${box.left.toFixed(1)}–${box.right.toFixed(1)}`,
      );
      assert.ok(
        box.top >= clear.top - 0.5 && box.bottom <= clear.bottom + 0.5,
        `${where} down ${box.top.toFixed(1)}–${box.bottom.toFixed(1)}`,
      );
    }
    // Snug: at the back his head reaches the clear space's top, at the front his toes its bottom,
    // and at the corners his side its sides.
    const back = newtBox(far, { x: (b.minXBack + b.maxXBack) / 2, z: b.minZ });
    const front = newtBox(far, { x: (b.minX + b.maxX) / 2, z: b.maxZ });
    close(back.top, clear.top, 1, `${at}: his head at the back`);
    close(front.bottom, clear.bottom, 1, `${at}: his toes at the front`);
    close(newtBox(far, { x: b.maxX, z: b.maxZ }).right, clear.right, 1, `${at}: his side at a front corner`);
    close(newtBox(far, { x: b.minXBack, z: b.minZ }).left, clear.left, 1, `${at}: his side at a back corner`);
  }
});

test('the play area keeps to the default view: the Pixel Size and the open Look sheet never change it, nor does what the camera does (it reads only the default view); a resize does', () => {
  for (const [cssW, cssH, dpr] of MORE_SIZES) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const { area: base, view } = areaFor(cssW, cssH, dpr);
    for (const pixelSize of PIXEL_SIZES) {
      const { area } = areaFor(cssW, cssH, dpr, pixelSize);
      for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'minXBack', 'maxXBack'])
        assert.ok(
          Math.abs(area[k] - base[k]) <= 0.01 * Math.abs(base[k]) + 1e-6,
          `${at} ${pixelSize}: ${k} ${area[k]} vs ${base[k]}`,
        );
    }
    // The Look sheet open over the bottom: the view shows NEWT in the clear space above it (a
    // shifted view, as far back), and the play area stays where it was.
    const grid = texelGrid({ cssW, cssH, dpr, pixelSize: DEFAULT_LOOK.pixelSize });
    const focus = clearInsets({
      cssW,
      cssH,
      insets: INSETS,
      cover: { left: 0, top: cssH * 0.55, right: cssW, bottom: cssH },
      tall: 100,
    });
    const sheet = frameView({ cssW, cssH, grid, insets: INSETS, focus, area: R + NEWT_RADIUS });
    assert.notDeepEqual(sheet.shift, view.shift, `${at}: the sheet moves where the view shows him`);
    assert.deepEqual(
      viewArea({ view: sheet, cssW, cssH, insets: INSETS }),
      base,
      `${at}: the sheet leaves the play area be`,
    );
  }
  // Another screen, another play area.
  assert.notDeepEqual(areaFor(390, 844, 3).area, areaFor(844, 390, 3).area);
  assert.notDeepEqual(areaFor(1280, 800, 1).area, areaFor(1280, 700, 1).area);
});

test('in the play area walking stops at its edge, wander goals cover it, and fleeing and carrying stay inside it', () => {
  for (const [cssW, cssH, dpr] of [
    [390, 844, 3],
    [1280, 800, 1],
  ]) {
    const { area: b } = areaFor(cssW, cssH, dpr);
    const inArea = (p, msg) => {
      const [lo, hi] = xRange(b, p.z);
      assert.ok(
        p.z >= b.minZ - 1e-6 && p.z <= b.maxZ + 1e-6 && p.x >= lo - 1e-6 && p.x <= hi + 1e-6,
        `${msg} ${JSON.stringify(p)}`,
      );
    };
    const rng = createRng(9);
    let from = { x: 0, z: 0 };
    let back = 0;
    for (let i = 0; i < 300; i++) {
      const g = wanderGoal(rng, b, from);
      inArea(g, 'a wander goal');
      if (g.z < b.minZ / 2) back++;
      from = g;
    }
    assert.ok(back > 30, `${back} wander goals in the back half`);
    let w = { x: 0, z: 0, yaw: 0, speed: 0 };
    for (let i = 0; i < 40 * 60; i++) {
      w = steer(w, { mode: 'goto', goal: { x: 40, z: -80 }, speed: GAIT.run }, null, b, DT);
      inArea(w, 'walking');
    }
    const [, hi] = xRange(b, w.z);
    assert.ok(Math.abs(w.x - hi) < 0.05 || Math.abs(w.z - b.minZ) < 0.05, `stopped at the edge ${JSON.stringify(w)}`);
    let f = { x: 0, z: 0, yaw: 0, speed: 0 };
    for (let i = 0; i < 20 * 60; i++) {
      const chaser = { x: f.x - 0.5 * Math.sin(f.yaw), z: f.z - 0.5 * Math.cos(f.yaw) };
      f = steer(f, { mode: 'flee', goal: null, speed: GAIT.run }, chaser, b, DT);
      inArea(f, 'fleeing');
    }
    const c = grab({ x: 0, y: 0.8, z: 0 }, 0);
    for (let i = 1; i <= 30; i++) {
      holdStep(c, { x: 50, y: 2, z: 50 }, DT, b, i * DT);
      inArea(c.anchor, 'carried');
    }
  }
});

test('the default view’s disc (stage.js frames a desktop to show all of it) is about 2 in radius round the floor’s centre, the same on every screen', () => {
  assert.ok(R >= 2 && R <= 2.5, `radius ${R}`);
  assert.equal(AREA_RADIUS, R);
  assert.deepEqual(AREA, { minX: -R, maxX: R, minZ: -R, maxZ: R, r: R }, 'its square holds it');
  assert.deepEqual(centreOf(AREA), { x: 0, z: 0 });
  assert.deepEqual(playArea(), AREA, 'nothing about the screen changes it');
  assert.ok(NEWT_RADIUS > 0 && NEWT_HEIGHT > 0.9);
});

test('at a desktop’s default zoom the whole play area, his body at its rim included, is in view at every Pixel Size and NEWT is still about a fifth of the short side, at 1280x800@1; a phone’s default view never backs off for it, NEWT about a quarter of the short side', () => {
  for (const [cssW, cssH, dpr, pixelSize] of SIZES.flatMap((s) => PIXEL_SIZES.map((p) => [...s, p]))) {
    const at = `${cssW}x${cssH}@${dpr} ${pixelSize}`;
    const { grid, view } = viewFor(cssW, cssH, dpr, pixelSize);
    const share = (newtTexels(view, grid) * grid.pd) / grid.dpr / Math.min(cssW, cssH);
    if (cssW < 600) {
      // A phone: his size exactly, the disc left to the camera following him (the next test).
      assert.ok(Math.abs(share - PHONE_SHARE) < 0.002, `${at}: NEWT is ${(share * 100).toFixed(1)}% of the short side`);
      continue;
    }
    // (Only ever smaller than his share, and only where the disc needs it.)
    assert.ok(
      share <= NEWT_SHARE + 0.002 && share >= 0.9 * NEWT_SHARE,
      `${at}: NEWT is ${(share * 100).toFixed(1)}% of the short side`,
    );
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * 2 * Math.PI;
      const rim = { x: (R + NEWT_RADIUS) * Math.sin(a), y: 0, z: (R + NEWT_RADIUS) * Math.cos(a) };
      const p = project(view, rim);
      assert.ok(p.x >= -0.5 && p.x <= cssW + 0.5, `${at}: the rim at ${i * 5}° is off the side (${p.x.toFixed(1)})`);
      assert.ok(
        p.y <= cssH - INSETS.bottom + 0.5,
        `${at}: the rim at ${i * 5}° is under the toolbar (${p.y.toFixed(1)})`,
      );
      const head = project(view, { ...rim, y: NEWT_HEIGHT });
      assert.ok(head.y >= -0.5, `${at}: his head at the rim at ${i * 5}° is off the top (${head.y.toFixed(1)})`);
    }
  }
});

/**
 * A point on screen (CSS px from the canvas's top-left) with the camera where orbit `o` has it:
 * the default view's camera turned by the orbit's yaw round its target, so the point is turned
 * back by it (pixels.js project looks from yaw 0).
 */
function onScreen(view, o, p) {
  const { target } = orbitPose(o);
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const dx = p.x - target.x;
  const dz = p.z - target.z;
  const e = o.elevation;
  const camera = { x: target.x, y: target.y + o.distance * Math.sin(e), z: target.z + o.distance * Math.cos(e) };
  return project(
    { ...view, elevation: (e * 180) / Math.PI, target, position: camera },
    { x: target.x + dx * c - dz * s, y: p.y, z: target.z + dx * s + dz * c },
  );
}

test('on a phone, at the default zoom, running to the rim, across the disc and round its rim never takes NEWT off the screen: the camera follows him softly', () => {
  // Portrait and landscape phones, the camera turned three ways.
  for (const [cssW, cssH, dpr] of [...SIZES.filter(([w]) => w < 600), [360, 740, 3], [844, 390, 3]]) {
    const { view } = viewFor(cssW, cssH, dpr);
    for (const yaw of [0, 1, 2.6]) {
      const at = `${cssW}x${cssH}@${dpr} at yaw ${yaw}`;
      /** His body (his width across the screen, feet to head) is on the stage and over the toolbar. */
      const check = (o, n, when) => {
        const right = { x: Math.cos(o.yaw), z: -Math.sin(o.yaw) };
        for (const y of [0, NEWT_HEIGHT])
          for (const k of [-1, 1]) {
            const p = onScreen(view, o, { x: n.x + k * NEWT_RADIUS * right.x, y, z: n.z + k * NEWT_RADIUS * right.z });
            const ok = p.x >= 0 && p.x <= cssW && p.y >= 0 && p.y <= cssH - INSETS.bottom;
            assert.ok(ok, `${at}, ${when}: his ${y ? 'head' : 'feet'} at (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
          }
      };
      /** A run at running speed from `a` to `b` (the camera settled on `a`), then 2 s standing. */
      const run = (a, b, when) => {
        const o = createOrbit({ distance: view.distance, yaw, span: { w: cssW, h: cssH } });
        for (let i = 0; i < 6 * 60; i++) orbitStep(o, DT, a);
        const T = dist(a, b) / GAIT.run;
        for (let t = 0; t < T + 2; t += DT) {
          const k = Math.min(1, t / T);
          const n = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
          orbitStep(o, DT, n);
          check(o, n, when);
        }
      };
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        const rim = { x: R * Math.sin(a), z: R * Math.cos(a) };
        run({ x: 0, z: 0 }, rim, `to the rim at ${i * 30}°`);
        run({ x: -rim.x, z: -rim.z }, rim, `across to ${i * 30}°`);
      }
      // Round the rim, both ways, for two turns.
      for (const way of [1, -1]) {
        const o = createOrbit({ distance: view.distance, yaw, span: { w: cssW, h: cssH } });
        for (let i = 0; i < 6 * 60; i++) orbitStep(o, DT, { x: 0, z: R });
        for (let t = 0; t < (4 * Math.PI * R) / GAIT.run; t += DT) {
          const a = (way * GAIT.run * t) / R;
          const n = { x: R * Math.sin(a), z: R * Math.cos(a) };
          orbitStep(o, DT, n);
          check(o, n, `round the rim at ${((a * 180) / Math.PI).toFixed(0)}°`);
        }
      }
    }
  }
});

test('a disc’s sides, clamp and centre: x between the rim at a depth, a point outside pulled straight in to the rim', () => {
  assert.deepEqual(xRange(AREA, 0), [-R, R]);
  const top = xRange(AREA, -R);
  close(top[0], 0, 1e-9);
  close(top[1], 0, 1e-9);
  const half = xRange(AREA, R / 2);
  close(half[1], R * Math.sqrt(3 / 4), 1e-9);
  assert.deepEqual(xRange(AREA, 9), [0, 0], 'past the rim: nothing but the middle');
  const c = clampTo(AREA, { x: 3 * R, z: 4 * R });
  close(c.x, R * 0.6, 1e-9);
  close(c.z, R * 0.8, 1e-9, 'along the same direction');
  assert.deepEqual(clampTo(AREA, { x: 0.5, z: -0.7 }), { x: 0.5, z: -0.7 }, 'inside: untouched');
  // A disc away from the origin is around its box's centre.
  const off = { minX: 1, maxX: 3, minZ: -2, maxZ: 0, r: 1 };
  assert.deepEqual(xRange(off, -1), [1, 3]);
  const o = clampTo(off, { x: 2, z: 5 });
  close(o.x, 2, 1e-9);
  close(o.z, 0, 1e-9);
});

test('walking and wandering stay inside the disc, wander goals all over it', () => {
  const rng = createRng(5);
  let from = { x: 0, z: 0 };
  let far = 0;
  for (let i = 0; i < 400; i++) {
    const g = wanderGoal(rng, AREA, from);
    inDisc(g, 'a wander goal');
    if (radius(g) > 0.7 * R) far++;
    from = g;
  }
  assert.ok(far > 80, `${far} goals out toward the rim`);
  // A goal past the rim: he walks to the rim and stops there.
  let b = { x: 0, z: 0, yaw: 0, speed: 0 };
  for (let i = 0; i < 8 * 60; i++) {
    b = steer(b, { mode: 'goto', goal: { x: 9, z: 9 }, speed: GAIT.walk }, null, AREA, DT);
    inDisc(b, 'walking');
  }
  close(radius(b), R, 0.07, 'at the rim');
  close(Math.atan2(b.x, b.z), Math.PI / 4, 0.05, 'toward the goal');
});

test('fleeing stays inside the disc; cornered at the rim he slides along it and never sticks', () => {
  const flee = { mode: 'flee', goal: null, speed: GAIT.run };
  // At the rim, the pointer between him and the middle: off along the rim, always moving.
  let b = { x: 0, z: -(R - 0.05), yaw: Math.PI, speed: 0 };
  const pointer = { x: 0.1, z: -(R - 0.6) };
  const start = Math.atan2(b.x, b.z);
  for (let i = 0; i < 2 * 60; i++) {
    const n = steer(b, flee, pointer, AREA, DT);
    inDisc(n, 'fleeing');
    if (i > 36) assert.ok(dist(n, b) > 0.3 * DT, `stuck at ${(i * DT).toFixed(2)} s`);
    b = n;
  }
  const turned = Math.abs(Math.atan2(Math.sin(Math.atan2(b.x, b.z) - start), Math.cos(Math.atan2(b.x, b.z) - start)));
  assert.ok(turned > 0.5, `slid round the rim (${turned.toFixed(2)} rad)`);
  assert.ok(dist(b, pointer) > 1.5, `and away (${dist(b, pointer).toFixed(2)})`);
  // Chased round and round for twenty seconds: inside all the time, never stuck for long.
  let c = { x: 0, z: 0, yaw: 0, speed: 0 };
  let still = 0;
  for (let i = 0; i < 20 * 60; i++) {
    const a = c;
    const chaser = { x: a.x - 0.5 * Math.sin(a.yaw), z: a.z - 0.5 * Math.cos(a.yaw) };
    c = steer(a, flee, chaser, AREA, DT);
    inDisc(c, 'chased');
    still = dist(c, a) < 0.2 * DT ? still + 1 : 0;
    assert.ok(still < 30, `stuck for half a second at ${(i * DT).toFixed(1)} s`);
  }
});

test('fleeing round the disc for 6 s, his heading turns smoothly: no zig-zag (at most 1.5 turn reversals a second), little hard turning, and he never slows against the rim', () => {
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const fps of [30, 60, 120]) {
    for (const yaw of [0, 1, -1.5, 3]) {
      const dt = 1 / fps;
      // The Run button: he runs from the disc's centre, out to the rim and round it.
      let body = { x: 0, z: 0, yaw, speed: 0 };
      let fast = 0;
      let slow = 0;
      let reversals = 0;
      let turning = 0;
      for (let i = 0; i < 6 * fps; i++) {
        const next = steer(body, { mode: 'flee', goal: null, speed: GAIT.run }, null, AREA, dt);
        const rate = wrapA(next.yaw - body.yaw) / dt;
        if (Math.abs(rate) > 3) fast += dt;
        if (Math.abs(rate) > 0.5) {
          if (turning && Math.sign(rate) !== turning) reversals++;
          turning = Math.sign(rate);
        }
        if (i * dt > 0.6 && next.speed < GAIT.run / 3) slow += dt;
        inDisc(next, 'fleeing');
        body = next;
      }
      const at = `${fps} fps from yaw ${yaw}`;
      assert.ok(reversals <= 9, `${at}: his turn changed way ${reversals} times in 6 s`);
      assert.ok(fast < 0.8, `${at}: ${fast.toFixed(2)} s turning faster than 3 rad/s`);
      assert.ok(slow < 0.2, `${at}: ${slow.toFixed(2)} s held up against the rim`);
    }
  }
});

test('carrying stays inside the disc: the anchor, and a toss that bounces softly off the rim', () => {
  const c = grab({ x: 0, y: 0.6, z: 0 }, 0);
  for (let i = 1; i <= 60; i++) {
    holdStep(c, { x: 9, y: 1.2, z: 9 }, DT, AREA, i * DT);
    inDisc(c.anchor, 'carried');
  }
  close(radius(c.anchor), R, 1e-6, 'the anchor on the rim');
  close(c.anchor.y, 1.2, 1e-9);
  let root = { x: R - 0.3, y: 1.2, z: 0 };
  let vel = { x: 3, y: 0, z: 1 };
  let bounced = false;
  for (let i = 0; i < 40; i++) {
    const f = fallStep(root, vel, root.y - 0.1, DT, AREA);
    inDisc(f.root, 'falling');
    if (f.vel.x < 0) bounced = true;
    root = f.root;
    vel = f.vel;
    if (f.landed) break;
  }
  assert.ok(bounced, 'bounced back off the rim');
  // Softly: the speed back off the rim is a fraction of the speed into it; along it is kept.
  const hit = fallStep({ x: R - 0.01, y: 1, z: 0 }, { x: 2, y: 0, z: 1 }, 0.9, DT, AREA);
  assert.ok(hit.vel.x < 0 && hit.vel.x > -1, `off the rim at ${hit.vel.x.toFixed(2)}`);
  close(hit.vel.z, 1, 0.2, 'along it');
});

test('a fall that starts outside the rim, where the swing hung him, eases back in instead of jumping', () => {
  // (Held, only his collar is kept inside the disc: the swing's tilt can hang his root up to a
  // third of a unit past the rim. Let go there, he used to land back on it in one frame.)
  let root = { x: R + 0.33, y: 1.2, z: 0 };
  let vel = { x: 0.5, y: 0, z: 0.4 };
  let inside = false;
  for (let i = 0; i < 60; i++) {
    const f = fallStep(root, vel, root.y - 0.6, DT, AREA);
    const step = Math.hypot(f.root.x - root.x, f.root.z - root.z);
    assert.ok(
      step <= CARRY.rimEase * DT + Math.hypot(vel.x, vel.z) * DT + 1e-9,
      `frame ${i}: moved ${step.toFixed(3)}`,
    );
    if (radius(root) > R) assert.ok(radius(f.root) <= radius(root) + 1e-9, `frame ${i}: never further out`);
    root = f.root;
    vel = f.vel;
    if (radius(root) <= R + 1e-6) inside = true;
    if (f.landed) break;
  }
  assert.ok(inside, `back inside by the time he lands (at ${radius(root).toFixed(3)} of ${R})`);
});

test('the light’s shadow camera covers the disc, up to the highest he’s lifted, for every look and wherever the camera has turned the light', () => {
  const top = 2.2 + NEWT_HEIGHT;
  const cases = Object.entries(LOOKS).flatMap(([look, p]) => [0, 1.1, -2.4, Math.PI].map((yaw) => ({ look, p, yaw })));
  const reach = R + NEWT_RADIUS;
  // (Round the disc's rim, his reach past it, at the floor, half way up and the top.)
  const points = Array.from({ length: 24 }, (_, i) => i).flatMap((i) => [0, top / 2, top].map((y) => [i, y]));
  for (const { look, p, yaw } of cases) {
    const name = `${look} at yaw ${yaw.toFixed(2)}`;
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    const d = lightDir(p.sun.dir, yaw);
    sun.position.copy(new THREE.Vector3(d.x, d.y, d.z).normalize().multiplyScalar(12));
    sun.target.position.set(0, 0, 0);
    fitShadow(sun, AREA, top);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    const cam = sun.shadow.camera;
    for (const [i, y] of points) {
      const a = (i / 24) * 2 * Math.PI;
      const q = new THREE.Vector3(reach * Math.sin(a), y, reach * Math.cos(a)).project(cam);
      for (const k of ['x', 'y', 'z'])
        assert.ok(
          Math.abs(q[k]) <= 1 + 1e-6,
          `${name}: (${i * 15}°, ${y}) is outside the shadow camera (${k} ${q[k]})`,
        );
    }
    // Snug: not much more than the disc and its shadows.
    assert.ok(cam.right - cam.left < 4 * reach + 2 * top, `${name}: ${(cam.right - cam.left).toFixed(1)} wide`);
  }
});
