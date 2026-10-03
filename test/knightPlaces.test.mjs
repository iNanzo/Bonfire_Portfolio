// Where the knights sit, stand and walk (src/bonfire/knightPlaces.js): every seat is on a
// blocked arc of the dance ring (nobody dances on it), walks go straight where that's clear,
// round the fire where it isn't, and by ember only when they're long or blocked. (And the
// sceneries' lamps fit sceneLights.js's fixed pool of lights, scenery.js MAX_LAMPS.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEATS,
  DANCE_RING,
  FIRE_AT,
  PIT,
  CLEAR,
  MAX_WALK,
  planWalk,
  ringOf,
  slotPlaces,
  ringPlaces,
  restPlaces,
  sideArcs,
} from '../src/bonfire/knightPlaces.js';
import { seatFeet } from '../src/bonfire/knightPose.js';
import { collidersOf, clearanceTo } from '../src/bonfire/colliders.js';
import * as THREE from 'three';
import * as scenery from '../src/bonfire/scenery.js';

const onRing = (b, r = DANCE_RING.radius) => ({
  x: FIRE_AT.x + Math.sin((b * Math.PI) / 180) * r,
  z: FIRE_AT.z + Math.cos((b * Math.PI) / 180) * r,
});
const fireDist = (p) => Math.hypot(p.x - FIRE_AT.x, p.z - FIRE_AT.z);
const bearing = (p) => ((Math.atan2(p.x - FIRE_AT.x, p.z - FIRE_AT.z) * 180) / Math.PI + 360) % 360;
/** Where knight 0 stands up in front of his seat (knights.js: his feet, a step toward the fire). */
function standSpot(name) {
  const s = SEATS[name];
  const yaw = Math.atan2(FIRE_AT.x - s.x, FIRE_AT.z - s.z);
  const f = seatFeet(s.top) - 0.03;
  return { x: s.x + Math.sin(yaw) * f, z: s.z + Math.cos(yaw) * f };
}
/** Every point a walk passes, every 2 cm. */
function along(from, path) {
  const out = [];
  let a = from;
  for (const b of path) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02);
    for (let i = 0; i <= n; i++)
      out.push({ x: a.x + ((b.x - a.x) * i) / Math.max(1, n), z: a.z + ((b.z - a.z) * i) / Math.max(1, n) });
    a = b;
  }
  return out;
}
const length = (from, path) =>
  along(from, path).reduce((s, p, i, all) => (i ? s + Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) : 0), 0);

test('scenery.js hands out the same seats and ring', () => {
  assert.equal(scenery.SEATS, SEATS);
  assert.equal(scenery.DANCE_RING, DANCE_RING);
});

test('every seat stands on a blocked arc of the ring (nobody dances on it), the extras rest clear of it', () => {
  for (const [name, s] of Object.entries(SEATS)) {
    const b = bearing(s);
    // (the seat's own width, about 0.25 m, either side of its bearing)
    const half = (Math.asin(0.25 / fireDist(s)) * 180) / Math.PI;
    const inside = (x) => DANCE_RING.blocked[name].some(([lo, hi]) => x >= lo && x <= hi);
    assert.ok(
      inside(b - half) && inside(b) && inside(b + half),
      `${name}: the seat (${b.toFixed(0)}° ± ${half.toFixed(0)}°) is blocked`,
    );
    for (const n of [2, 3, 4]) {
      for (const p of restPlaces(ringOf(name), n, s))
        assert.ok(Math.hypot(p.x - s.x, p.z - s.z) > 0.45, `${name}: resting ${p.bearing.toFixed(0)}° is off the seat`);
    }
  }
});

test('walks: straight where that is clear, round the fire where it isn’t, by ember when far or blocked', () => {
  // Straight, clear of the fire.
  assert.deepEqual(planWalk(onRing(270), onRing(300)), [onRing(300)]);
  // Across the fire: round it, never inside CLEAR, the shorter way.
  const from = onRing(300),
    to = onRing(40);
  const path = planWalk(from, to);
  assert.ok(path && path.length > 2, 'round the fire');
  for (const p of along(from, path))
    assert.ok(fireDist(p) >= CLEAR - 1e-6, `clear of the fire (${fireDist(p).toFixed(2)} m)`);
  assert.ok(
    path.every((p) => bearing(p) >= 299 || bearing(p) <= 41),
    'the shorter way, in front',
  );
  assert.equal(path.at(-1).x, to.x);
  // Too far round: by ember.
  assert.equal(planWalk(onRing(270), onRing(90)), null, 'half way round is too far');
  assert.equal(planWalk({ x: -2, z: 0 }, { x: 0.6, z: 0 }), null);
  // Blocked both ways: by ember.
  const wall = (x) => Math.abs(x + 1.1) < 0.05;
  assert.equal(planWalk({ x: -1.4, z: 0.3 }, { x: -0.8, z: 0.8 }, { blocked: (x) => wall(x) }), null);
  // A post on the ring between two near places: the straight walk and the way round
  // both pass it (he keeps 0.1 m either side), so by ember.
  const onArc = (x, z) => Math.hypot(x - onRing(285).x, z - onRing(285).z) < 0.12;
  assert.ok(planWalk(onRing(270, 1.0), onRing(300, 1.4)), 'a walk without the post');
  assert.equal(
    planWalk(onRing(270, 1.0), onRing(300, 1.4), { blocked: onArc }),
    null,
    'the post on the way round too: by ember',
  );
  // A post on the straight way (the chord, well inside the ring) but not on the way round: round it.
  const a = onRing(240, 1.4),
    b = onRing(320, 1.4);
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const post = (x, z) => Math.hypot(x - mid.x, z - mid.z) < 0.08;
  assert.equal(planWalk(a, b)?.length, 1, 'straight without the post');
  const round = planWalk(a, b, { blocked: post });
  assert.ok(round && round.length > 2, 'round the post, the long way round the fire');
  for (const p of along(a, round)) {
    assert.ok(Math.hypot(p.x - mid.x, p.z - mid.z) > 0.08 + 0.1, 'never through the post (nor brushing it)');
    assert.ok(fireDist(p) >= CLEAR - 1e-6, 'clear of the fire');
  }
  assert.ok(length(a, round) <= MAX_WALK);
});

test('every scenery’s lamps fit the scene’s fixed pool of lamp lights (a new place changes no light count)', () => {
  const material = () => new THREE.MeshLambertMaterial();
  const mat = {
    stone: material(),
    pillar: material(),
    wood: material(),
    char: material(),
    wax: material(),
    mortar: material(),
  };
  for (const name of Object.keys(SEATS).filter((n) => n !== 'ruins')) {
    const { lights } = scenery.buildScenery(name, mat, () => new THREE.MeshBasicMaterial());
    assert.ok(
      lights.length >= 1 && lights.length <= scenery.MAX_LAMPS,
      `${name}: ${lights.length} lamps (the pool has ${scenery.MAX_LAMPS})`,
    );
  }
});

test('from each seat to the dancers’ places on its side of the fire (and back) is a walk, clear of the pit', () => {
  for (const name of Object.keys(SEATS)) {
    const s = SEATS[name];
    const stand = standSpot(name);
    // His seat is in the way (he stands up in front of it); the pit is the fire's.
    const blocked = (x, z) => Math.hypot(x - s.x, z - s.z) < 0.22 || fireDist({ x, z }) < PIT - 0.05;
    const ring = ringOf(name);
    const places = [
      ...slotPlaces(ring, 1),
      ...[1, 2, 3, 4].flatMap((n) => [slotPlaces(ring, n), ringPlaces(ring, n, -2), ringPlaces(ring, n, 2)].flat()),
    ].filter((p) => p.bearing > 180);
    assert.ok(places.length > 4, name);
    for (const p of places) {
      for (const [a, b] of [
        [stand, p],
        [p, stand],
      ]) {
        const path = planWalk(a, b, { blocked });
        assert.ok(path, `${name}: ${bearing(a).toFixed(0)}° → ${bearing(b).toFixed(0)}° walks`);
        for (const q of along(a, path))
          assert.ok(fireDist(q) >= PIT, `${name}: out of the pit (${fireDist(q).toFixed(2)})`);
        assert.ok(length(a, path) <= MAX_WALK + 1e-6);
      }
    }
    // The dancers' side arcs are clear of the seat.
    for (const [lo, hi] of sideArcs(ring.free))
      for (let b = lo; b <= hi; b += 2)
        assert.ok(Math.hypot(onRing(b).x - s.x, onRing(b).z - s.z) > 0.3, `${name}: ${b}° is off the seat`);
  }
});

test('his summon sign lies in front of each seat, on open ground, in view of the home camera (wide and on phones)', async () => {
  const { getPov } = await import('../src/bonfire/povs.js');
  const { SIGN_HEIGHT, SIGN_STROKE } = await import('../src/bonfire/summonSign.js');
  const { LOGO_BOUNDS } = await import('../src/ui/logo.js');
  const material = () => new THREE.MeshLambertMaterial();
  const mat = {
    stone: material(),
    pillar: material(),
    wood: material(),
    char: material(),
    wax: material(),
    mortar: material(),
  };
  // The ruins' own pieces (the model's, not scenery.js's: their shapes, the pillar on its
  // plinth, its candles, the fallen drum and the wall).
  const RUINS = collidersOf('ruins');
  // The sign's footprint (its letters and halo), every 4 cm, laid as sceneKnight.js lays it: its
  // letters' tops pointing `yaw`, away from the home camera.
  const [x0, y0, x1, y1] = LOGO_BOUNDS;
  const w = (SIGN_HEIGHT * (x1 - x0)) / (y1 - y0) + SIGN_STROKE,
    d = SIGN_HEIGHT + SIGN_STROKE;
  const footprint = (sign) => {
    const pts = [];
    const c = Math.cos(sign.yaw),
      sn = Math.sin(sign.yaw);
    for (let u = -w / 2; u <= w / 2 + 1e-9; u += w / 8) {
      for (let v = -d / 2; v <= d / 2 + 1e-9; v += d / 12)
        pts.push({ x: sign.x + u * c + v * sn, z: sign.z - u * sn + v * c });
    }
    return pts;
  };
  for (const [name, s] of Object.entries(SEATS)) {
    const sign = s.sign;
    const out = Math.hypot(sign.x - s.x, sign.z - s.z);
    assert.ok(out > 0.35 && out < 0.95, `${name}: the sign is in front of his seat (${out.toFixed(2)} m)`);
    const pts = footprint(sign);
    const near = Math.min(...pts.map(fireDist));
    assert.ok(
      near > 0.82,
      `${name}: the sign is clear of the ring stones (0.78 m) (${near.toFixed(2)} m from the fire's middle)`,
    );
    // Nothing the scenery builds stands over it (a ray down onto the sign meets nothing above a
    // few cm), and none of the ruins' own pieces.
    const pieces = scenery.buildScenery(name, mat, () => new THREE.MeshBasicMaterial());
    pieces.group.updateMatrixWorld(true);
    const solids = [];
    pieces.group.traverse((o) => {
      if (o.isMesh && !pieces.glows.includes(o)) solids.push(o);
    });
    const ray = new THREE.Raycaster();
    for (const p of pts) {
      ray.set(new THREE.Vector3(p.x, 2, p.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(solids, false).find((h) => h.point.y > 0.06);
      assert.ok(
        !hit,
        `${name}: ${hit?.object.name || 'a piece'} stands over the sign at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}), ${hit?.point.y.toFixed(2)} m up`,
      );
    }
    if (name === 'ruins')
      for (const p of pts) {
        const under = RUINS.find((c) => clearanceTo(c, p.x, p.z, { from: 0, to: 2.6 }) < 0.01);
        assert.ok(
          !under,
          `ruins: the model's ${under?.name} stands over the sign at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`,
        );
      }
    // In view from the home camera, wide (1920×1080) and tall (a phone: above the page's panel,
    // which starts 40% of the way down; the ruins' sign, left of his seat, comes to the edge).
    for (const [layout, wd, ht, top, side] of [
      ['wide', 1920, 1080, -0.9, 0.97],
      ['tall', 390, 844, 0.25, 1.01],
    ]) {
      const pov = getPov('home', layout);
      const cam = new THREE.PerspectiveCamera(pov.fov, wd / ht, 0.1, 50);
      cam.position.set(...pov.pos);
      cam.lookAt(new THREE.Vector3(...pov.target));
      cam.updateMatrixWorld(true);
      for (const q of pts) {
        const p = new THREE.Vector3(q.x, 0.02, q.z).project(cam);
        const x = p.x + 2 * pov.sx,
          y = p.y + 2 * pov.sy;
        assert.ok(
          Math.abs(x) <= side && y < 0.95 && y > top,
          `${name} (${layout}): the sign is on screen (${x.toFixed(2)}, ${y.toFixed(2)})`,
        );
      }
    }
  }
});
