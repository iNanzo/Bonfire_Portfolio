// The invitation toy's play area (src/invitation/area.js). The floor is endless: the play area
// fills the screen, one shape however the camera turns, a disc round the default view's target
// (the orbit's centre) holding every spot of floor the default view shows across the whole stage
// turned any way, his radius past the farthest (a tall phone's the biggest), the same whatever
// the Pixel Size, the open Settings sheet or the camera does, and new on a resize (a shrink under
// him eases him back in, no jump; one that still holds him never moves him); walking, wandering,
// fleeing and carrying stay inside it. It's more floor than the screen shows, so wander goals
// keep to what's on screen when they're picked and a flee to what was on screen as it began
// (camera.js orbitSight, a trapezoid turned with the camera: turned Bounds work like the rest).
// The default view's own disc is its framing: a desktop's default view (pixels.js frameView)
// shows all of it, at every Pixel Size, with NEWT still about a fifth of the screen's short side
// tall; on a phone he's drawn about 30% bigger, the disc no longer all fits, and the camera
// moves on just far enough (camera.js) that a dash to its rim, or round it, never takes his feet
// off the screen. A disc's Bounds work everywhere (steer.js and carry.js read a disc's radius from its
// Bounds: walking, wandering, fleeing, sliding along the rim when cornered with no zig-zag,
// carrying, the toss and the fall's bounces). The light's shadow camera (floor.js fitShadow)
// covers the disc up to the highest he's lifted, wherever the camera has turned the light
// (camera.js lightDir), and moved to wherever he is in the play area (shadow texels whole, so
// his shadow doesn't shimmer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AREA_RADIUS, NEWT_HEIGHT, NEWT_RADIUS, playArea, rimPoints, viewArea } from '../src/invitation/area.js';
import { STEER, centreOf, clampTo, steer, turnBounds, wanderGoal, xRange } from '../src/invitation/steer.js';
import { CARRY, fallStep, grab, holdStep } from '../src/invitation/carry.js';
import { fitShadow, shadowTop } from '../src/invitation/floor.js';
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
import {
  ORBIT,
  createOrbit,
  lightDir,
  orbitArea,
  orbitPose,
  orbitSight,
  orbitSpan,
  orbitStep,
  screenOf,
} from '../src/invitation/camera.js';
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
const MORE_SIZES = [...SIZES, [844, 390, 3], [1920, 1080, 1], [768, 1024, 2]];

/** Where the floor shows at a stage point (CSS px) in view `v`: pixels.js project's inverse there. */
function floorOf(v, sx, sy) {
  const e = (v.elevation * Math.PI) / 180;
  const t = Math.tan((v.fov * Math.PI) / 360);
  const nx = ((sx - v.shift.x) / v.canvasW) * 2 - 1;
  const ny = 1 - ((sy - v.shift.y) / v.canvasH) * 2;
  const d = {
    x: nx * t * v.aspect,
    y: -Math.sin(e) + ny * t * Math.cos(e),
    z: -Math.cos(e) - ny * t * Math.sin(e),
  };
  assert.ok(d.y < 0, 'the floor shows there');
  const k = -v.position.y / d.y;
  return { x: v.position.x + d.x * k, z: v.position.z + d.z * k };
}
/** `p` turned `a` radians about `c` (yaw: + toward +x). */
const turnedAbout = (p, c, a) => ({
  x: c.x + (p.x - c.x) * Math.cos(a) + (p.z - c.z) * Math.sin(a),
  z: c.z - (p.x - c.x) * Math.sin(a) + (p.z - c.z) * Math.cos(a),
});

test('the play area fills the screen: a disc round the default view’s target holding every spot of floor the default view shows, the whole stage edge to edge, however the camera turns, the farthest his radius inside its rim', () => {
  for (const [cssW, cssH, dpr] of MORE_SIZES) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const { area: b, view } = areaFor(cssW, cssH, dpr);
    assert.ok(
      b.r !== undefined && b.round === undefined && b.minXBack === undefined && b.maxXBack === undefined,
      `${at}: a disc`,
    );
    const c = centreOf(b);
    assert.deepEqual(c, { x: view.target.x, z: view.target.z }, `${at}: round the orbit's centre`);
    assert.ok(b.r > R, `${at}: bigger than the old disc (${b.r.toFixed(2)})`);
    let far = 0;
    for (let j = 0; j <= 10; j++)
      for (let i = 0; i <= 10; i++) {
        const f = floorOf(view, (i * cssW) / 10, (j * cssH) / 10);
        far = Math.max(far, dist(f, c));
        // (Turned, the view shows that floor turned round the point it orbits.)
        for (let deg = 0; deg < 360; deg += 15) {
          const p = turnedAbout(f, c, (deg * Math.PI) / 180);
          const k = clampTo(b, p);
          assert.ok(dist(k, p) < 1e-6, `${at} at ${deg}°: the floor at (${i}, ${j}) of the grid is out of reach`);
        }
      }
    close(b.r, far + NEWT_RADIUS, 1e-6, `${at}: snug, his radius past the farthest`);
  }
  // A tall phone sees furthest back, so its disc is the biggest; a desktop's is a little smaller.
  const r = (w, h, dpr) => areaFor(w, h, dpr).area.r ?? NaN;
  assert.ok(r(390, 844, 3) > 8.8 && r(390, 844, 3) < 10.5, `a phone: ${r(390, 844, 3).toFixed(2)}`);
  assert.ok(r(768, 1024, 2) > 7.6 && r(768, 1024, 2) < 9.2, `a tablet: ${r(768, 1024, 2).toFixed(2)}`);
  assert.ok(r(1280, 800, 1) > 7.2 && r(1280, 800, 1) < 8.8, `a desktop: ${r(1280, 800, 1).toFixed(2)}`);
  assert.ok(r(390, 844, 3) > r(1280, 800, 1), 'a tall phone sees further back than a desktop');
});

test('a rounded square’s sides, clamp and middle: x between its sides at a depth (narrower round the corners), a point outside pulled to its nearest point on the rim, a ray’s room up to the rim', () => {
  const b = { minX: -3, maxX: 3, minZ: -3, maxZ: 3, round: 1 };
  assert.deepEqual(xRange(b, 0), [-3, 3]);
  assert.deepEqual(xRange(b, 2), [-3, 3], 'the flat part of the sides');
  const [lo, hi] = xRange(b, 2.6);
  close(hi, 2 + Math.sqrt(1 - 0.6 * 0.6), 1e-9, 'round the corner');
  close(lo, -hi, 1e-9);
  assert.deepEqual(xRange(b, 3), [-2, 2], 'its front edge: the flat part');
  assert.deepEqual(xRange(b, 4), [0, 0], 'past it: the middle alone');
  assert.deepEqual(clampTo(b, { x: 1, z: -2 }), { x: 1, z: -2 }, 'inside: as it is');
  assert.deepEqual(clampTo(b, { x: 5, z: 0.5 }), { x: 3, z: 0.5 }, 'past a side: onto it');
  const c = clampTo(b, { x: 5, z: 5 });
  close(c.x, 2 + Math.SQRT1_2, 1e-9, 'past a corner: onto its arc');
  close(c.z, 2 + Math.SQRT1_2, 1e-9);
  assert.deepEqual(centreOf(b), { x: 0, z: 0 });
  // Room along a direction: to a side, and to a corner's arc.
  let f = { x: 0, z: 0, yaw: Math.PI / 2, speed: 0 };
  for (let i = 0; i < 20 * 60; i++) f = steer(f, { mode: 'goto', goal: { x: 9, z: 9 }, speed: GAIT.run }, null, b, DT);
  const corner = clampTo(b, { x: 9, z: 9 });
  assert.ok(
    Math.hypot(f.x - corner.x, f.z - corner.z) <= STEER.arrive + 1e-6,
    `walked into the corner, onto its arc ${JSON.stringify(f)}`,
  );
  // Fleeing from the middle, he runs straight out and turns along the rim, never past it.
  let g = { x: 0.2, z: 0.1, yaw: 0, speed: 0 };
  for (let i = 0; i < 10 * 60; i++) {
    g = steer(g, { mode: 'flee', goal: null, speed: GAIT.run }, { x: 0, z: 0 }, b, DT);
    const k = clampTo(b, g);
    assert.ok(Math.hypot(k.x - g.x, k.z - g.z) < 1e-9, `fleeing: inside ${JSON.stringify(g)}`);
  }
  // Wander goals all over it, never past the corners.
  const rng = createRng(3);
  const quarters = new Set();
  for (let i = 0; i < 200; i++) {
    const w = wanderGoal(rng, b, { x: 0, z: 0 });
    const k = clampTo(b, w);
    assert.ok(Math.hypot(k.x - w.x, k.z - w.z) < 1e-9, `a wander goal inside ${JSON.stringify(w)}`);
    quarters.add(`${Math.sign(w.x)},${Math.sign(w.z)}`);
  }
  assert.equal(quarters.size, 4, 'all four quarters');
  // A fall that bounces off the rim stays inside.
  let root = { x: 2.5, y: 1, z: 2.5 };
  let vel = { x: 4, y: 0, z: 4 };
  for (let i = 0; i < 2 * 60; i++) {
    const fell = fallStep(root, vel, root.y, DT, b);
    ({ root, vel } = fell);
    const [l2, h2] = xRange(b, root.z);
    assert.ok(
      root.z >= b.minZ - 1e-6 && root.z <= b.maxZ + 1e-6 && root.x >= l2 - 1e-6 && root.x <= h2 + 1e-6,
      `falling ${JSON.stringify(root)}`,
    );
  }
});

test('the play area keeps to the default view: the Pixel Size and the open Settings sheet never change it, nor does what the camera does (it reads only the default view); a resize does', () => {
  for (const [cssW, cssH, dpr] of MORE_SIZES) {
    const at = `${cssW}x${cssH}@${dpr}`;
    const { area: base, view } = areaFor(cssW, cssH, dpr);
    for (const pixelSize of PIXEL_SIZES) {
      const { area } = areaFor(cssW, cssH, dpr, pixelSize);
      for (const k of Object.keys(base))
        assert.ok(
          Math.abs(area[k] - base[k]) <= 0.01 * Math.abs(base[k]) + 1e-6,
          `${at} ${pixelSize}: ${k} ${area[k]} vs ${base[k]}`,
        );
    }
    // The Settings sheet open over the bottom: the view shows NEWT in the clear space above it (a
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
    const edge = clampTo(b, { x: 40, z: -80 });
    assert.ok(
      Math.hypot(w.x - edge.x, w.z - edge.z) <= STEER.arrive + 1e-6,
      `stopped at the edge ${JSON.stringify(w)}`,
    );
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

test('on a phone, at the default zoom, running to the rim, across the disc and round its rim never takes NEWT’s feet off the screen: the camera moves on only as far as keeps them on it', () => {
  // Portrait and landscape phones, the camera turned three ways.
  for (const [cssW, cssH, dpr] of [...SIZES.filter(([w]) => w < 600), [360, 740, 3], [844, 390, 3]]) {
    const { view } = viewFor(cssW, cssH, dpr);
    const frame = { hw: (cssW - INSETS.left - INSETS.right) / 2, hh: (cssH - INSETS.top - INSETS.bottom) / 2 };
    /** The toolbar's top: the clear space's bottom is 8 CSS px over it. */
    const bar = cssH - INSETS.bottom + 8;
    for (const yaw of [0, 1, 2.6]) {
      const at = `${cssW}x${cssH}@${dpr} at yaw ${yaw}`;
      /** His feet are on the stage and over the toolbar. */
      const check = (o, n, when) => {
        const p = onScreen(view, o, { x: n.x, y: 0, z: n.z });
        const ok = p.x >= 0 && p.x <= cssW && p.y >= 0 && p.y <= bar + 0.5;
        assert.ok(ok, `${at}, ${when}: his feet at (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
      };
      const make = () => {
        const o = createOrbit({ distance: view.distance, yaw, span: { w: cssW, h: cssH } });
        orbitSpan(o, { w: cssW, h: cssH, ch: view.canvasH, ...frame });
        return o;
      };
      /** A run at running speed from `a` to `b` (the camera settled on `a`), then 2 s standing. */
      const run = (a, b, when) => {
        const o = make();
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
        const o = make();
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

test('moved to wherever NEWT is in the play area, the shadow camera covers him and his shadow up to the highest he’s lifted, as big as at the middle, by whole shadow texels so his shadow never shimmers', () => {
  const top = 3.6;
  const { area } = areaFor(390, 844, 3);
  const spots = [
    { x: 0, z: 0 },
    { x: area.maxX, z: area.maxZ },
    { x: area.minX, z: area.minZ },
    { x: 1.234, z: -5.678 },
    { x: 0.001, z: 0.002 },
  ];
  const cases = Object.entries(LOOKS).flatMap(([look, p]) => [0, 2.1].map((yaw) => ({ look, p, yaw })));
  // (Round him, his reach out: at the floor, half way up and the top.)
  const reach = Array.from({ length: 16 }, (_, i) => (i / 16) * 2 * Math.PI).flatMap((a) =>
    [0, top / 2, top].map((y) => ({ a, y })),
  );
  for (const { look, p, yaw } of cases) {
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.shadow.mapSize.set(p.shadow.mapSize, p.shadow.mapSize);
    const d = lightDir(p.sun.dir, yaw);
    sun.position.copy(new THREE.Vector3(d.x, d.y, d.z).normalize().multiplyScalar(12));
    sun.target.position.set(0, 0, 0);
    fitShadow(sun, AREA, top);
    const home = { ...sun.shadow.camera };
    for (const at of spots) {
      const name = `${look} at yaw ${yaw}, NEWT at (${at.x.toFixed(2)}, ${at.z.toFixed(2)})`;
      fitShadow(sun, AREA, top, at);
      sun.updateMatrixWorld();
      sun.shadow.updateMatrices(sun);
      const cam = sun.shadow.camera;
      close(cam.right - cam.left, home.right - home.left, 1e-6, `${name}: as wide`);
      close(cam.top - cam.bottom, home.top - home.bottom, 1e-6, `${name}: as tall`);
      const tx = (home.right - home.left) / p.shadow.mapSize;
      const ty = (home.top - home.bottom) / p.shadow.mapSize;
      const wx = (cam.left - home.left) / tx;
      const wy = (cam.bottom - home.bottom) / ty;
      close(wx, Math.round(wx), 1e-6, `${name}: whole texels across`);
      close(wy, Math.round(wy), 1e-6, `${name}: whole texels up`);
      const r = NEWT_RADIUS + 0.7;
      for (const { a, y } of reach) {
        const q = new THREE.Vector3(at.x + r * Math.sin(a), y, at.z + r * Math.cos(a)).project(cam);
        const most = Math.max(Math.abs(q.x), Math.abs(q.y), Math.abs(q.z));
        assert.ok(most <= 1 + 1e-6, `${name}: his reach at ${a.toFixed(2)} rad, ${y}: ${q.toArray()}`);
      }
    }
  }
});

test('the shadow camera reaches as high as before while he stands or is carried low, and over the top of his head however high he is lifted, in half-unit steps', () => {
  const base = 3.2;
  for (const lift of [0, 0.4, 1.2, 1.8]) assert.equal(shadowTop(lift, base), base, `his root at ${lift}`);
  let last = base;
  for (let lift = 0; lift <= 5; lift += 0.01) {
    const top = shadowTop(lift, base);
    assert.ok(top >= lift + NEWT_HEIGHT + 0.2, `his root at ${lift.toFixed(2)}: the top ${top}`);
    assert.ok(top >= last, 'never lower as he goes up');
    assert.ok(Number.isInteger(top * 2) || top === base, `in half units (${top})`);
    last = top;
  }
});

test('turned bounds (Bounds.turn: what’s on screen, in the camera’s frame) are the same shape turned about their middle: a point outside is pulled onto it, a walk stops at its edge, wander goals cover it and a flee keeps inside it', () => {
  const flat = { minX: -1, maxX: 1, minZ: -6, maxZ: 2, minXBack: -2.5, maxXBack: 2.5 };
  const about = { x: 0.3, z: -0.4 };
  for (const yaw of [0.7, Math.PI / 2, -2.4]) {
    const at = `turned ${yaw}`;
    const b = turnBounds(flat, yaw, about);
    assert.equal(b.turn, yaw);
    // Its corners: the flat one's, turned about `about`.
    const want = rimPoints(flat).map((p) => turnedAbout(p, about, yaw));
    rimPoints(b).forEach((p, i) => {
      close(p.x, want[i].x, 1e-6, `${at}: corner ${i}`);
      close(p.z, want[i].z, 1e-6);
    });
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const p = { x: (rng() - 0.5) * 20, z: (rng() - 0.5) * 20 };
      const k = clampTo(b, p);
      const w = turnedAbout(clampTo(flat, turnedAbout(p, about, -yaw)), about, yaw);
      close(k.x, w.x, 1e-6, `${at}: clamped ${JSON.stringify(p)}`);
      close(k.z, w.z, 1e-6);
    }
    const inside = (p) => dist(clampTo(b, p), p) < 1e-6;
    let w = { x: about.x, z: about.z, yaw: 0, speed: 0 };
    for (let i = 0; i < 20 * 60; i++) {
      w = steer(w, { mode: 'goto', goal: { x: 30, z: -30 }, speed: GAIT.run }, null, b, DT);
      assert.ok(inside(w), `${at}: walking ${JSON.stringify(w)}`);
    }
    assert.ok(dist(w, clampTo(b, { x: 30, z: -30 })) <= STEER.arrive + 1e-6, `${at}: stopped at its edge`);
    const goals = Array.from({ length: 200 }, () => wanderGoal(rng, b, about));
    for (const g of goals) assert.ok(inside(g), `${at}: a wander goal ${JSON.stringify(g)}`);
    // (Spread over it, its back to its front.)
    const depth = goals.map((g) => turnedAbout(g, about, -yaw).z);
    assert.ok(Math.min(...depth) < -4.5 && Math.max(...depth) > 1, `${at}: goals all over it`);
    let f = { x: about.x, z: about.z, yaw: 0, speed: 0 };
    let ran = 0;
    for (let i = 0; i < 10 * 60; i++) {
      const chaser = { x: f.x - 0.5 * Math.sin(f.yaw), z: f.z - 0.5 * Math.cos(f.yaw) };
      const n = steer(f, { mode: 'flee', goal: null, speed: GAIT.run }, chaser, b, DT);
      ran += dist(n, f);
      f = n;
      assert.ok(inside(f), `${at}: fleeing ${JSON.stringify(f)}`);
    }
    assert.ok(ran > 10, `${at}: he keeps running (${ran.toFixed(1)})`);
  }
});

test('where the play area is bigger than the screen, a wander goal is on screen when it’s picked and a flee keeps to what was on screen as it began (orbitSight; the camera keeps his feet on screen beyond that)', () => {
  for (const [cssW, cssH, dpr] of [
    [390, 844, 3],
    [1280, 800, 1],
  ]) {
    const { area, view } = areaFor(cssW, cssH, dpr);
    const frame = { hw: (cssW - INSETS.left - INSETS.right) / 2, hh: (cssH - INSETS.top - INSETS.bottom) / 2 };
    for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
      const at = `${cssW}x${cssH} at yaw ${yaw.toFixed(2)}`;
      const o = createOrbit({ distance: view.distance, yaw, span: { w: cssW, h: cssH } });
      orbitSpan(o, { w: cssW, h: cssH, ch: view.canvasH, ...frame });
      orbitArea(o, area);
      for (let i = 0; i < 120; i++) orbitStep(o, DT, { x: 0, z: 0 });
      const sight = orbitSight(o);
      assert.ok(sight, `${at}: something's on screen`);
      /** NEWT standing at `n` shows whole inside the clear space. */
      const whole = (n) => {
        const right = { x: Math.cos(o.yaw), z: -Math.sin(o.yaw) };
        for (const y of [0, NEWT_HEIGHT])
          for (const k of [-1, 1]) {
            const s = screenOf(o, { x: n.x + k * NEWT_RADIUS * right.x, y, z: n.z + k * NEWT_RADIUS * right.z });
            if (!s || Math.abs(s.x) > frame.hw + 0.5 || Math.abs(s.y) > frame.hh + 0.5) return false;
          }
        return true;
      };
      const inArea = (p) => dist(clampTo(area, p), p) < 1e-6;
      const b = { ...area, sight };
      const rng = createRng(11);
      let from = { x: 0, z: 0 };
      let top = 0;
      for (let i = 0; i < 200; i++) {
        const g = wanderGoal(rng, b, from);
        assert.ok(inArea(g) && whole(g), `${at}: a wander goal off the screen ${JSON.stringify(g)}`);
        top = Math.min(top, screenOf(o, { x: g.x, y: 0, z: g.z })?.y ?? 0);
        from = g;
      }
      assert.ok(top < -frame.hh * 0.4, `${at}: wander goals up near the top of the screen too (${top.toFixed(0)})`);
      // A flee: inside what was on screen as it began, however what's on screen changes after.
      let f = { x: 0, z: 0, yaw: 0, speed: 0 };
      const live = { ...area, sight };
      for (let i = 0; i < 8 * 60; i++) {
        const chaser = { x: f.x - 0.5 * Math.sin(f.yaw), z: f.z - 0.5 * Math.cos(f.yaw) };
        f = steer(f, { mode: 'flee', goal: null, speed: GAIT.run }, chaser, live, DT);
        if (i === 60) live.sight = turnBounds(sight, 2, { x: 0, z: 0 });
        assert.ok(inArea(f) && whole(f), `${at}: fleeing off what was on screen ${JSON.stringify(f)}`);
      }
      // Without what's on screen, as before: anywhere in the play area.
      const anywhere = Array.from({ length: 300 }, () => wanderGoal(rng, area, { x: 0, z: 0 }));
      assert.ok(
        anywhere.some((g) => !whole(g)),
        `${at}: with nothing on screen given, wander goals go all over the play area`,
      );
    }
  }
});

test('a resize that shrinks the play area under him eases him back inside, a little a frame and never further out; one that still holds him never moves him', () => {
  const small = playArea(5);
  // Inside it: not moved.
  const still = { x: 2, z: -3, yaw: 1, speed: 0 };
  const s2 = steer(still, { mode: 'stay', goal: null, speed: 0 }, null, small, DT);
  assert.equal(s2.x, still.x);
  assert.equal(s2.z, still.z);
  /** @type {Array<[any, any]>} */
  const moves = [
    ['stay', null],
    ['goto', { x: 0, z: -9 }],
    ['face', { x: 0, z: 9 }],
  ];
  for (const [mode, goal] of moves) {
    let p = { x: 0.3, z: -5.9, yaw: Math.PI, speed: 0 };
    let was = dist(p, clampTo(small, p));
    let t = 0;
    for (; t < 4 && was > 1e-6; t += DT) {
      const n = steer(p, { mode, goal, speed: GAIT.walk }, null, small, DT);
      assert.ok(dist(n, p) <= (STEER.backInMax + GAIT.walk) * DT + 1e-6, `${mode}: no jump at ${t.toFixed(2)} s`);
      const now = dist(n, clampTo(small, n));
      assert.ok(now <= was + 1e-12, `${mode}: never further out (${now} after ${was})`);
      p = n;
      was = now;
    }
    assert.ok(was < 1e-6 && t < 2.5, `${mode}: back inside after ${t.toFixed(2)} s`);
  }
  // A phone's URL bar showing or hiding: the play area a little different, and him inside both untouched.
  const tall = areaFor(390, 844, 3).area;
  const short = areaFor(390, 788, 3).area;
  assert.notDeepEqual(tall, short, 'the play area changes with the height');
  const r = Math.min(tall.r ?? 0, short.r ?? 0) - 0.01;
  for (const a of [0, 1, 2, 3, 4, 5]) {
    const n = { x: r * Math.sin(a), z: r * Math.cos(a), yaw: a, speed: 0 };
    for (const b of [tall, short]) {
      const m = steer(n, { mode: 'stay', goal: null, speed: 0 }, null, b, DT);
      assert.ok(m.x === n.x && m.z === n.z, `at ${a}: not moved`);
    }
  }
});
