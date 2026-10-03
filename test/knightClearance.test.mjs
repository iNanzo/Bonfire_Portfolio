// The knights against the scenery (src/bonfire/colliders.js). The shapes are the pieces
// scenery.js builds (every piece in a knight's reach inside them, to 2 cm) and the model's
// own in the ruins (public/models/bonfire.glb, decoded: its pillar's bounds to 2 cm). Then
// the knight on the real model (test/lib/knightMesh.mjs, every piece's surface every 3 cm)
// at the fire's 12 frames a second, on the scene's own height map (rebuilt here by rays
// straight down onto the same meshes: terrain.js renders them from above): seated at every
// seat in either seat pose he's 4 cm clear of everything, his boots resting on what's under
// them, with all the room for his arms there and stood up in front of it (the ruins' seat is
// the ground itself); and nothing he does there, nor any dancer at any place on the ring,
// goes more than 1.5 cm into a shape (a failure names the action, the piece of him and the
// shape), nor anyone sitting on the ground under it. Each point is tested against the shapes
// themselves (no rays: those took minutes), and only the pieces whose joint is within their
// reach of a shape (a broad phase). Nothing round a seat hems in his Praise the Sun (it's the
// one he throws with nothing there), and where something does stand right by him (a knight
// sat down by a piece), he eases back from it. Keeping out of it doesn't cost him his
// smoothness (nothing he does at his seat steps further at a time than round 9's did, give or
// take half, nor past that a quarter further than it would with nothing there), nor his place
// on the home view (stood up or dancing there, he stays left of the planted sword), nor much
// of a frame's time (a step solves at most four poses; round 9's solved one). Where his feet
// rest high (sitting on the ground, his knees up), a ring under him doesn't fold a knee down
// under his leg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKnights, GESTURES, SEAT_POSES } from '../src/bonfire/knights.js';
import { createArmorShared } from '../src/bonfire/armor.js';
import { BONE_NODES, GESTURE_TIME, DANCE_SEATED_TIME, MOVE_INFO } from '../src/bonfire/knightPose.js';
import { SEATS, FIRE_AT, ringOf, slotPlaces, ringPlaces } from '../src/bonfire/knightPlaces.js';
import { getPov } from '../src/bonfire/povs.js';
import { buildScenery } from '../src/bonfire/scenery.js';
import {
  CULT,
  RUINS,
  MOVE_REACH,
  REACH_BANDS,
  collidersOf,
  distanceTo,
  clearanceTo,
  roomAround,
  reachFits,
} from '../src/bonfire/colliders.js';
import { loadKnightMesh } from './lib/knightMesh.mjs';
import { loadGlb } from './lib/glb.mjs';

const NAMES = Object.keys(SEATS);
const material = () => new THREE.MeshLambertMaterial();
const MAT = {
  stone: material(),
  pillar: material(),
  wood: material(),
  char: material(),
  wax: material(),
  mortar: material(),
};
const fireDist = (x, z) => Math.hypot(x - FIRE_AT.x, z - FIRE_AT.z);
/** Every place the show stands a dancer on in a scenery (slotPlaces and ringPlaces, 1–4, steps -3..3). */
function placesOf(name) {
  const ring = ringOf(name);
  const seen = new Map();
  for (const n of [1, 2, 3, 4])
    for (const p of [...slotPlaces(ring, n), ...[-3, -2, -1, 0, 1, 2, 3].flatMap((st) => ringPlaces(ring, n, st))])
      seen.set(p.bearing.toFixed(1), p);
  return [...seen.values()];
}
/** The least distance from a point to a scenery's shapes. */
const nearestShape = (cs, x, y, z) => cs.reduce((m, c) => Math.min(m, distanceTo(c, x, y, z)), Infinity);

// --- the shapes ---------------------------------------------------------------------------------
test('every piece scenery.js builds in a knight’s reach is inside its shapes (to 2 cm), the stones leaning as it draws them', () => {
  for (const name of NAMES.filter((n) => n !== 'ruins')) {
    const s = buildScenery(name, MAT, () => new THREE.MeshBasicMaterial(), { merge: false }); // (each piece on its own: the drawn scenery merges them)
    s.group.updateMatrixWorld(true);
    const cs = collidersOf(name);
    const seat = SEATS[name];
    const near = [{ x: seat.x, z: seat.z }, ...placesOf(name)];
    const v = new THREE.Vector3();
    let pieces = 0;
    s.group.traverse((m) => {
      if (!m.isMesh) return;
      const box = new THREE.Box3().setFromObject(m);
      // (Above his shins, within an arm's reach of his seat or a dancer's place; the seat itself
      // and anything lower is his to rest on.)
      if (box.max.y < 0.3) return;
      const reach = Math.min(
        ...near.map((p) =>
          Math.hypot(Math.max(box.min.x - p.x, 0, p.x - box.max.x), Math.max(box.min.z - p.z, 0, p.z - box.max.z)),
        ),
      );
      if (reach > 1.2) return;
      pieces++;
      const pos = m.geometry.attributes.position;
      let worst = 0,
        at = null;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const d = nearestShape(cs, v.x, v.y, v.z);
        if (d > worst) {
          worst = d;
          at = v.toArray();
        }
      }
      assert.ok(
        worst <= 0.02,
        `${name}: a ${m.geometry.type} reaches ${worst.toFixed(3)} m out of the shapes at (${at?.map((q) => q.toFixed(2))})`,
      );
    });
    assert.ok(pieces > 8, `${name}: ${pieces} pieces in reach`);
  }
  // The cult's standing stones turn and tip by the seeded draws colliders.js has written down.
  const s = buildScenery('cult', MAT, () => new THREE.MeshBasicMaterial(), { merge: false });
  const stones = [];
  s.group.traverse((m) => {
    if (
      m.isMesh &&
      m.geometry.type === 'BoxGeometry' &&
      m.geometry.parameters.depth === CULT.stones.depth &&
      m.geometry.parameters.height > 1
    )
      stones.push(m.parent);
  });
  assert.equal(stones.length, 3);
  stones.forEach((g, i) => {
    assert.equal(g.rotation.y, CULT.stones.drawn[i][0], `stone ${'ABC'[i]} turns as drawn`);
    assert.equal(g.rotation.x, CULT.stones.drawn[i][1], `stone ${'ABC'[i]} tips as drawn`);
  });
});

test('the ruins’ shapes are the model’s own (bonfire.glb): the pillar’s bounds at RUINS.at to 2 cm, every piece in reach inside them', async () => {
  const glb = await loadGlb(new URL('../public/models/bonfire.glb', import.meta.url));
  const cs = collidersOf('ruins');
  const pillar = cs.find((c) => c.name === 'pillar');
  assert.deepEqual([pillar.x, pillar.z], RUINS.at, 'the pillar’s shape stands at RUINS.at');
  // The broken shaft: Static_Pillar's points round its axis (there), above the plinth.
  const pts = glb.worldPoints('Static_Pillar');
  const shaft = pts.filter(([x, y, z]) => y > pillar.y0 - 0.005 && Math.hypot(x - pillar.x, z - pillar.z) < 0.3);
  assert.ok(shaft.length > 16, `the shaft's corners (${shaft.length})`);
  const lo = [0, 1, 2].map((k) => Math.min(...shaft.map((p) => p[k]))),
    hi = [0, 1, 2].map((k) => Math.max(...shaft.map((p) => p[k])));
  const r = Math.max(pillar.r0, pillar.r1);
  const want = { lo: [pillar.x - r, pillar.y0, pillar.z - r], hi: [pillar.x + r, pillar.y1, pillar.z + r] };
  for (let k = 0; k < 3; k++) {
    assert.ok(
      Math.abs(lo[k] - want.lo[k]) <= 0.02 && Math.abs(hi[k] - want.hi[k]) <= 0.02,
      `the shaft's ${'xyz'[k]} ${lo[k].toFixed(3)}..${hi[k].toFixed(3)} (its shape's ${want.lo[k].toFixed(3)}..${want.hi[k].toFixed(3)})`,
    );
  }
  // Every piece of the model's pillar (plinth, shaft, wall; the fallen drum lies behind it, out
  // of anyone's reach) and its candles above the rubble, within reach of his seat or a dancer,
  // inside the shapes to 2 cm.
  const near = [{ x: SEATS.ruins.x, z: SEATS.ruins.z }, ...placesOf('ruins')];
  let checked = 0;
  for (const node of ['Static_Pillar', 'Static_Wax', 'CandleFlame_0', 'CandleFlame_1', 'CandleFlame_2']) {
    for (const [x, y, z] of glb.worldPoints(node)) {
      if (y < 0.2 || Math.min(...near.map((p) => Math.hypot(x - p.x, z - p.z))) > 1.2) continue;
      checked++;
      const d = nearestShape(cs, x, y, z);
      assert.ok(d <= 0.02, `${node}: (${[x, y, z].map((q) => q.toFixed(2))}) is ${d.toFixed(3)} m out of the shapes`);
    }
  }
  assert.ok(checked > 200, `${checked} points of the model checked`);
});

test('the room round a place: all of it in the open, less toward a piece, and a move fits only with its reach clear of it', () => {
  // Out on the open ground in front of the fire: nothing in reach.
  const open = roomAround('shrine', 0, 1.6, Math.PI);
  assert.ok(
    open.every((band) => band.every((r) => r >= 1.2 - 1e-9)),
    'all the room there is',
  );
  for (const move of Object.keys(MOVE_REACH)) assert.ok(reachFits(move, open), `${move} fits in the open`);
  // Beside the shrine's front lantern, facing the fire (it at his back and to his right):
  // less room behind him there than in front, at the light box's height.
  const [fx, fz] = [-1.9 + 0.62, 0.6 - 0.1];
  const yaw = Math.atan2(FIRE_AT.x - fx, FIRE_AT.z - fz);
  const room = roomAround('shrine', fx, fz, yaw);
  const band = REACH_BANDS.findIndex((y, i) => i && y > 1.0) - 1;
  assert.ok(
    room[band][2] < room[band][0],
    `behind him ${room[band][2].toFixed(2)} m, in front ${room[band][0].toFixed(2)} m`,
  );
  assert.ok(!reachFits('spin', room), 'a spin’s arms all round don’t fit by the lantern');
  // The shapes' distances: inside a cylinder, its depth; out from a box, the distance.
  const pillar = collidersOf('ruins').find((c) => c.name === 'pillar');
  assert.ok(
    Math.abs(
      distanceTo(pillar, pillar.x, 1, pillar.z) +
        pillar.r0 -
        (pillar.r0 - pillar.r1) * ((1 - pillar.y0) / (pillar.y1 - pillar.y0)),
    ) < 1e-9,
  );
  assert.ok(Math.abs(clearanceTo(pillar, pillar.x + 1, pillar.z) - (1 - pillar.r0)) < 0.01);
});

// --- the knight on the real model -----------------------------------------------------------------
const armor = () => createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1.45 } });
const HELM_NODES = { great: 'K_Helm_Great', armet: 'K_Helm_Armet', bascinet: 'K_Helm_Bascinet' };
const SIZE = 12,
  RES = 320,
  CELL = SIZE / RES,
  HALF = SIZE / 2; // (terrain.js's)
let statics = null;
/**
 * The scene's height map for a scenery (terrain.js: its cells, each the highest surface over
 * its middle, of the model's solid statics and the scenery's solids), a cell at a time.
 */
async function terrainOf(name) {
  if (!statics) {
    const glb = await loadGlb(new URL('../public/models/bonfire.glb', import.meta.url));
    const side = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    statics = [];
    for (const n of glb.nodes.values()) {
      if (!n.name.startsWith('Static_') || n.mesh == null) continue;
      for (const pr of glb.primitives(n.mesh)) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pr.pos, 3));
        g.setIndex(new THREE.BufferAttribute(pr.idx, 1));
        const m = new THREE.Mesh(g, side);
        m.name = n.name;
        m.matrixAutoUpdate = false;
        m.matrixWorld.copy(glb.matrix(n.name));
        statics.push(m);
      }
    }
  }
  // (The ruins' own pieces are hidden in the other sceneries: sceneScenery.js.)
  const ruinsOnly = (m) => /Static_(Pillar|Mortar|Wax)/.test(m.name);
  const s = buildScenery(name, MAT, () => new THREE.MeshBasicMaterial());
  s.group.updateMatrixWorld(true);
  const own = [];
  s.group.traverse((o) => {
    if (o.isMesh && !s.glows.includes(o)) {
      o.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      own.push(o);
    }
  });
  const meshes = name === 'ruins' ? [...statics, ...own] : [...statics.filter((m) => !ruinsOnly(m)), ...own];
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const H = new Map();
  const at = (i, j) => {
    if (i < 0 || j < 0 || i >= RES || j >= RES) return 0;
    let h = H.get(j * RES + i);
    if (h === undefined) {
      ray.set(new THREE.Vector3(-HALF + (i + 0.5) * CELL, 12, HALF - (j + 0.5) * CELL), down);
      h = Math.max(0, ray.intersectObjects(meshes, false)[0]?.point.y ?? 0);
      H.set(j * RES + i, h);
    }
    return h;
  };
  return {
    top: (x, z) => at(Math.floor((x + HALF) / CELL), Math.floor((HALF - z) / CELL)),
    height(x, z) {
      const fx = (x + HALF) / CELL - 0.5,
        fz = (HALF - z) / CELL - 0.5;
      const i = Math.floor(fx),
        j = Math.floor(fz),
        u = fx - i,
        v = fz - j;
      return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
    },
  };
}

let engine = null;
/** The engine on the real model, and each of its pieces' surface (its own space) and reach. */
async function realKnights() {
  if (engine) return engine;
  const model = await loadKnightMesh();
  const k = createKnights(model.scene(), { armor: armor(), max: 2 });
  const pieces = {},
    corners = {};
  for (const b of k.knights[0].bones) {
    const node = BONE_NODES[b.name] ?? HELM_NODES[b.name.replace('helm_', '')];
    const pts = model.surface(node, 0.03);
    if (pts.length)
      pieces[b.name] = { pts: Float32Array.from(pts.flat()), r: Math.max(...pts.map((p) => Math.hypot(...p))) };
    // (Its corners alone: the farthest it comes any way.)
    const vs = model.points(node);
    if (vs.length) corners[b.name] = Float32Array.from(vs.flat());
  }
  engine = { k, pieces, corners };
  return engine;
}
const _v = new THREE.Vector3();
const _j = new THREE.Vector3();
/** Every surface point of knight n as posed now (the helmet he wears, not the others): `fn(point, bone)` (the point reused). */
function eachPoint(env, n, fn) {
  n.group.updateMatrixWorld(true);
  for (const b of n.bones) {
    const pc = env.pieces[b.name];
    if (!pc || (b.name.startsWith('helm_') && !n.helms[b.name.slice(5)].visible)) continue;
    for (let p = 0; p < pc.pts.length; p += 3)
      fn(_v.set(pc.pts[p], pc.pts[p + 1], pc.pts[p + 2]).applyMatrix4(b.matrixWorld), b.name);
  }
}
/**
 * Knight i as posed now against shapes `cs`: the least distance of any of his pieces (`skip`:
 * pieces left out) to them, { d, bone, shape } (d < 0: that deep in). Only pieces whose joint
 * is within their reach (plus `margin`) of a shape are looked at.
 */
function nearestOf(env, i, cs, { skip = null, margin = 0 } = {}) {
  const n = env.k.knights[i];
  n.group.updateMatrixWorld(true);
  let best = { d: Infinity, bone: '', shape: '' };
  for (const b of n.bones) {
    const pc = env.pieces[b.name];
    if (!pc || skip?.(b.name) || (b.name.startsWith('helm_') && !n.helms[b.name.slice(5)].visible)) continue;
    b.getWorldPosition(_j);
    const near = cs.filter((c) => distanceTo(c, _j.x, _j.y, _j.z) < pc.r + margin);
    if (!near.length) continue;
    for (let p = 0; p < pc.pts.length; p += 3) {
      _v.set(pc.pts[p], pc.pts[p + 1], pc.pts[p + 2]).applyMatrix4(b.matrixWorld);
      for (const c of near) {
        const d = distanceTo(c, _v.x, _v.y, _v.z);
        if (d < best.d) best = { d, bone: b.name, shape: c.name };
      }
    }
  }
  return best;
}
// (The most poses a knight's step solves, keeping him out of the scenery: knights.js
// EASE_SOLVES. Round 9's solved one; each costs about what its whole step did.)
const MOST_SOLVES = 4;
/**
 * Step the engine `seconds` at 12 fps (`each(t)` first each step) and keep the deepest of
 * knight i in `cs` into `log[what]`, and the most poses a step of his solved into `solves`.
 */
function watch(env, i, cs, seconds, what, log, each = null, solves = null) {
  for (let t = 0; t < seconds; t += 1 / 12) {
    each?.(t);
    env.k.update(1 / 12 + 1e-7);
    const w = nearestOf(env, i, cs);
    if (-w.d > (log[what]?.depth ?? 0)) log[what] = { depth: -w.d, bone: w.bone, shape: w.shape, t };
    const n = env.k.knights[i].solves;
    if (solves && n > (solves.n ?? 0)) Object.assign(solves, { n, what, t });
  }
}
const DEEPEST = 0.015;
const report = (log) =>
  Object.entries(log)
    .filter(([, w]) => w.depth > DEEPEST)
    .map(([what, w]) => `${what}: ${w.bone} ${(w.depth * 100).toFixed(1)} cm into ${w.shape} (${w.t.toFixed(2)} s)`);

test('[slow] seated at every seat, either seat pose, he is 4 cm clear of the scenery all through his idle (his boots resting on what’s under them)', async () => {
  const env = await realKnights();
  const { k } = env;
  const boots = (b) => /^(foot|shin)[LR]$/.test(b);
  for (const name of NAMES) {
    const cs = collidersOf(name);
    k.setScenery(name, await terrainOf(name));
    for (const pose of SEAT_POSES) {
      k.setSeatPose(pose);
      k.summon(0, { instant: true });
      let least = { d: Infinity },
        boot = { d: Infinity };
      // (Over his idle, four times a second: the breathing, the doze and its start, the
      // glances, a shift of his weight and hands.)
      for (let t = 0; t < 26; t += 0.25) {
        k.update(0.25);
        const w = nearestOf(env, 0, cs, { skip: boots, margin: 0.05 });
        if (w.d < least.d) least = w;
        const f = nearestOf(env, 0, cs, { skip: (b) => !boots(b) });
        if (f.d < boot.d) boot = f;
      }
      assert.ok(
        least.d >= 0.04,
        `${name}, ${pose}: his ${least.bone} comes to ${(least.d * 100).toFixed(1)} cm of the ${least.shape}`,
      );
      assert.ok(
        boot.d >= -0.01,
        `${name}, ${pose}: his ${boot.bone} rests ${(-boot.d * 100).toFixed(1)} cm into the ${boot.shape}`,
      );
      k.dismiss(0, { instant: true });
    }
  }
  k.setSeatPose('resting');
});

test('at every seat, either seat pose, he has all the room for both arms, seated and stood up in front of it: nothing of the scenery in an arm’s reach', async () => {
  const env = await realKnights();
  const { k } = env;
  const n = k.knights[0];
  const bad = [];
  for (const name of NAMES) {
    k.setScenery(name, await terrainOf(name));
    for (const pose of SEAT_POSES) {
      k.setSeatPose(pose);
      k.summon(0, { instant: true });
      // (Up on his feet where he stands up to, then back down: both rooms are his home's.)
      k.stand(0);
      for (let t = 0; t < 1.8; t += 1 / 12) k.update(1 / 12 + 1e-7);
      k.sit(0);
      for (let t = 0; t < 1.8; t += 1 / 12) k.update(1 / 12 + 1e-7);
      const { room, roomUp } = n.home;
      if (![...room, ...(roomUp ?? [0, 0])].every((r) => r === 1))
        bad.push(
          `${name} (${pose}): seated ${room.map((r) => r.toFixed(2))}, stood up ${roomUp?.map((r) => r.toFixed(2))}`,
        );
      k.dismiss(0, { instant: true });
    }
  }
  k.setSeatPose('resting');
  assert.deepEqual(bad, [], 'less than all the room for an arm (left, right)');
});

// (A spot right by the shrine's front lantern: sat down there on the ground, a step back from
// it, he has the lantern behind his left shoulder, as near as no seat has a piece now.)
const BY_LANTERN = { x: -1.15, z: 0.55 };
test('[slow] nothing he does at his seat goes into the scenery (every helmet in the ruins): gestures seated and standing, the site’s dance, reactions, seated moves, getting up and sitting down; sat down right by a piece he eases back from it, no step solving more than 4 poses', async () => {
  const env = await realKnights();
  const { k } = env;
  const bad = [];
  const solves = {};
  /** Everything knight i does where he sits, each step of it seen by `see(seconds, what, each)`. */
  const everything = (i, see) => {
    see(1, 'sitting');
    // Every gesture seated (the site's dance gets up for its two bars and sits back down),
    // and the site's dance in his seat (a phone's view).
    for (const g of GESTURES) {
      k.gesture(g, { index: i });
      see(GESTURE_TIME[g] + 0.2, `seated ${g}`);
    }
    k.headroom = false;
    k.gesture('dance', { index: i });
    see(DANCE_SEATED_TIME + 0.2, 'the dance in his seat');
    k.headroom = true;
    for (const r of ['impact', 'stoke', 'ring']) {
      k.react(r, 1);
      see(1.4, `seated ${r}`);
    }
    // Every seated move on a beat clock (two beats a second).
    for (const m of Object.keys(MOVE_INFO).filter((mv) => MOVE_INFO[mv].seated)) {
      k.dance(i, { move: m, energy: 1, seated: true });
      let b = 0;
      see(Math.min(4, MOVE_INFO[m].cycle * 0.5) + 0.25, `seated ${m}`, () => k.clock((b += 1 / 6), 0.5));
    }
    k.sit(i);
    see(0.6, 'settling');
    // Up on his feet in front of where he sits (as Bonfire Live's breakdown has him watch),
    // every gesture there and the reactions, and back down.
    k.stand(i);
    see(1.4, 'getting up');
    for (const g of GESTURES.filter((q) => q !== 'dance')) {
      k.gesture(g, { index: i });
      see(GESTURE_TIME[g] + 0.2, `standing ${g}`);
    }
    for (const r of ['impact', 'stoke', 'ring']) {
      k.react(r, 1);
      see(1.4, `standing ${r}`);
    }
    k.sit(i);
    see(1.6, 'sitting down');
  };
  for (const name of NAMES) {
    const cs = collidersOf(name);
    k.setScenery(name, await terrainOf(name));
    // (The helmets reach differently: the bascinet's visor juts, its mail hangs low. One
    // seat's enough to see them all.)
    for (const helmet of name === 'ruins' ? ['great', 'armet', 'bascinet'] : ['great']) {
      for (const pose of SEAT_POSES) {
        const log = {};
        const at = (what) => `${name} (${pose}${helmet === 'great' ? '' : `, ${helmet}`}) ${what}`;
        k.setSeatPose(pose);
        k.summon(0, { instant: true });
        await k.setHelmet(helmet, { index: 0, instant: true });
        everything(0, (seconds, what, each = null) => watch(env, 0, cs, seconds, at(what), log, each, solves));
        bad.push(...report(log));
        k.dismiss(0, { instant: true });
      }
    }
  }
  await k.setHelmet('great', { index: 0, instant: true });
  // Sat down on the ground by the shrine's front lantern: his left arm hemmed in (knights.js
  // roomOf), and whatever of him would still go into it eased back.
  const cramped = {};
  const cs = collidersOf('shrine');
  k.setScenery('shrine', await terrainOf('shrine'));
  for (const pose of SEAT_POSES) {
    const log = {};
    k.setSeatPose(pose);
    k.summon(1, { instant: true, at: BY_LANTERN, facing: 'fire' });
    k.sit(1);
    for (let t = 0; t < 2; t += 1 / 12) k.update(1 / 12 + 1e-7);
    everything(1, (seconds, what, each = null) =>
      watch(env, 1, cs, seconds, `by the shrine's front lantern (${pose}) ${what}`, log, each, cramped),
    );
    bad.push(...report(log));
    k.dismiss(1, { instant: true });
  }
  k.setSeatPose('resting');
  assert.deepEqual(bad, [], `deeper than ${DEEPEST * 100} cm`);
  for (const s of [solves, cramped])
    assert.ok(s.n <= MOST_SOLVES, `${s.what}: a step solved ${s.n} poses (${s.t.toFixed(2)} s)`);
  assert.ok(cramped.n > 1, `by the lantern he never eases back (a step solves ${cramped.n} poses at most)`);
});

test('[slow] dancers at every place on the ring, every move that fits there facing the fire or the front, and the drop gestures, stay out of the scenery', async () => {
  const env = await realKnights();
  const { k } = env;
  const bad = [];
  const reach = Math.max(...Object.values(MOVE_REACH).flat(2));
  for (const name of NAMES) {
    const cs = collidersOf(name);
    k.setScenery(name, await terrainOf(name));
    // (Places with nothing within any move's reach can't meet anything.)
    const places = placesOf(name).filter((p) =>
      cs.some((c) => clearanceTo(c, p.x, p.z, { from: 0, to: 2.6 }) < reach + 0.1),
    );
    for (const p of places) {
      for (const facing of ['fire', 'front']) {
        const log = {};
        const at = (what) => `${name} ${p.bearing.toFixed(0)}° facing the ${facing}: ${what}`;
        k.dismiss(1, { instant: true });
        k.summon(1, { instant: true, at: p, facing });
        const fitting = Object.keys(MOVE_INFO).filter((m) => k.fits(m, p, facing));
        if (facing === 'fire')
          assert.ok(
            fitting.length > 2,
            `${name} ${p.bearing.toFixed(0)}°: moves fit there facing the fire (${fitting})`,
          );
        for (const m of fitting) {
          k.dance(1, { move: m, energy: 1, position: p, facing, seed: 0 });
          let b = 0;
          watch(env, 1, cs, MOVE_INFO[m].cycle * 0.5 + 0.1, at(m), log, () => k.clock((b += 1 / 6), 0.5));
        }
        // The drop's gestures over a groove.
        for (const g of ['praise', 'hurrah', 'joy', 'point']) {
          k.dance(1, { move: fitting[0] ?? 'nod', energy: 1, position: p, facing, seed: 0 });
          k.gesture(g, { index: 1 });
          let b = 0;
          watch(env, 1, cs, GESTURE_TIME[g], at(`gesture ${g}`), log, () => k.clock((b += 1 / 6), 0.5));
        }
        bad.push(...report(log));
      }
    }
  }
  k.dismiss(1, { instant: true });
  assert.deepEqual(bad, [], `deeper than ${DEEPEST * 100} cm`);
});

test('[slow] no dance move reaches further than colliders.js MOVE_REACH has it, in any band or way round', async () => {
  const env = await realKnights();
  const { k, pieces } = env;
  k.setScenery('nowhere', { height: () => 0, top: () => 0 });
  const at = { x: 0, z: 3 };
  const v = new THREE.Vector3();
  for (const move of Object.keys(MOVE_INFO)) {
    const most = REACH_BANDS.slice(1).map(() => [0, 0, 0]);
    // Every seed's way (mirrored, and the moves' variations), at full energy, over a cycle.
    for (const seed of [0, 1, 2, 3]) {
      k.dismiss(1, { instant: true });
      k.summon(1, { instant: true, at, facing: 0 });
      k.dance(1, { move, energy: 1, position: at, facing: 0, seed });
      let b = 0;
      for (let t = 0; t < MOVE_INFO[move].cycle * 0.5 + 0.5; t += 1 / 12) {
        k.clock((b += 1 / 6), 0.5);
        k.update(1 / 12 + 1e-7);
        if (t < 0.4) continue; // (in from where he stood)
        const n = k.knights[1];
        n.group.updateMatrixWorld(true);
        for (const bone of n.bones) {
          const pc = pieces[bone.name];
          if (!pc || (bone.name.startsWith('helm_') && !n.helms[bone.name.slice(5)].visible)) continue;
          for (let p = 0; p < pc.pts.length; p += 3) {
            v.set(pc.pts[p], pc.pts[p + 1], pc.pts[p + 2]).applyMatrix4(bone.matrixWorld);
            const band = REACH_BANDS.findIndex((y, i) => i && v.y < y) - 1;
            if (band < 0) continue;
            const a = Math.abs((Math.atan2(v.x - at.x, v.z - at.z) * 180) / Math.PI);
            const way = a <= 45 ? 0 : a < 135 ? 1 : 2;
            most[band][way] = Math.max(most[band][way], Math.hypot(v.x - at.x, v.z - at.z));
          }
        }
      }
    }
    most.forEach((band, i) =>
      band.forEach((r, w) => {
        assert.ok(
          r <= MOVE_REACH[move][i][w] + 0.005,
          `${move}: ${(r * 100).toFixed(1)} cm ${['in front', 'aside', 'behind'][w]} at ${REACH_BANDS[i]}–${REACH_BANDS[i + 1]} m (MOVE_REACH ${MOVE_REACH[move][i][w]})`,
        );
      }),
    );
  }
  k.dismiss(1, { instant: true });
});

test('in the ruins he sits on the ground itself, his boots on it out of the fire, the ground under him level to 6 cm; he stands straight up, nothing to step across', async () => {
  const env = await realKnights();
  const { k } = env;
  const terrain = await terrainOf('ruins');
  k.setScenery('ruins', terrain);
  const n = k.knights[0];
  for (const pose of SEAT_POSES) {
    k.setSeatPose(pose);
    k.summon(0, { instant: true });
    const at = `the ruins (${pose})`;
    assert.equal(n.home.h, 0, `${at}: no seat under him (${n.home.h} m)`);
    // Over a whole shift of his weight in his idle (12 s, four times a second; it steps his right
    // foot, lifting it): each sabaton's lowest point down on the ground under it (the height
    // map's, to 1.5 cm) and never into it, all of it out of the fire; and the ground under what
    // of him rests on it (his seat, the backs of his legs, his soles: within 3 cm of it) no more
    // than 6 cm from level (tools/bonfire.py keeps the rubble off his place).
    const boots = { footL: { low: Infinity, fire: Infinity }, footR: { low: Infinity, fire: Infinity } };
    let lo = Infinity,
      hi = -Infinity;
    for (let t = 0; t < 12.5; t += 0.25) {
      k.update(0.25);
      const low = {};
      eachPoint(env, n, (v, bone) => {
        const g = terrain.height(v.x, v.z);
        low[bone] = Math.min(low[bone] ?? Infinity, v.y - g);
        if (boots[bone]) boots[bone].fire = Math.min(boots[bone].fire, fireDist(v.x, v.z));
        if (v.y - g < 0.03) {
          lo = Math.min(lo, g);
          hi = Math.max(hi, g);
        }
      });
      for (const [name, boot] of Object.entries(boots)) boot.low = Math.min(boot.low, low[name]);
    }
    for (const [name, boot] of Object.entries(boots)) {
      assert.ok(
        Math.abs(boot.low) <= 0.015,
        `${at}: his ${name}'s sole comes down to ${(boot.low * 100).toFixed(1)} cm over the ground`,
      );
      assert.ok(boot.fire >= 1.05, `${at}: his ${name} comes to ${boot.fire.toFixed(2)} m from the fire's middle`);
    }
    assert.ok(
      hi - lo <= 0.06,
      `${at}: the ground under him from ${(lo * 100).toFixed(1)} to ${(hi * 100).toFixed(1)} cm`,
    );
    // Up on his feet straight in front of where he sits (nothing aside: SEATS standAside), with
    // nothing in front of him to step across on the way (knightPose.js rise()'s `over`).
    k.stand(0);
    k.update(1 / 12 + 1e-7);
    assert.equal(n.home.stand.x, 0, `${at}: he stands up ${n.home.stand.x.toFixed(2)} m to his side`);
    assert.ok(n.over && !n.over.cross, `${at}: he steps across something on his way up`);
    k.dismiss(0, { instant: true });
  }
  k.setSeatPose('resting');
});

// (The same seat with nothing round it: a scenery colliders.js has no shapes for, given the
// seat's own place and height map. Its room for his arms is all of it, and nothing turns them.)
const BARE = 'bare (a test’s)';
test('[slow] seated Praise the Sun at every seat, either seat pose, is the Praise he throws there with nothing round him (every joint to 5 mm, each step): nothing there hems it in', async () => {
  const env = await realKnights();
  const { k } = env;
  const n = k.knights[0];
  const [head, ...hands] = ['head', 'handL', 'handR'].map((b) => n.bones.findIndex((x) => x.name === b));
  /** Praise from his seat in scenery `name` (on `terrain`): where each joint is, each step. */
  const praise = (name, terrain) => {
    k.setScenery(name, terrain);
    k.summon(0, { instant: true });
    n.clock = 0; // (his idle from the same moment every time)
    k.update(0.5);
    k.gesture('praise', { index: 0 });
    const steps = [];
    for (let t = 0; t < GESTURE_TIME.praise + 0.2; t += 1 / 12) {
      k.update(1 / 12 + 1e-7);
      n.group.updateMatrixWorld(true);
      steps.push(n.bones.map((b) => b.getWorldPosition(new THREE.Vector3())));
    }
    k.dismiss(0, { instant: true });
    return steps;
  };
  const bad = [];
  try {
    for (const name of NAMES) {
      const terrain = await terrainOf(name);
      SEATS[BARE] = SEATS[name];
      for (const pose of SEAT_POSES) {
        k.setSeatPose(pose);
        const there = praise(name, terrain),
          bare = praise(BARE, terrain);
        // (Both hands thrown up over his head, or there's no Praise to compare.)
        for (const j of hands) {
          const over = Math.max(...bare.map((s) => s[j].y)) - bare[0][head].y;
          assert.ok(
            over > 0.2,
            `${name} (${pose}): his ${n.bones[j].name} comes ${over.toFixed(2)} m over his head in Praise`,
          );
        }
        let most = { d: 0, j: 0, t: 0 };
        there.forEach((step, s) =>
          step.forEach((v, j) => {
            const d = v.distanceTo(bare[s][j]);
            if (d > most.d) most = { d, j, t: s / 12 };
          }),
        );
        if (most.d > 0.005)
          bad.push(
            `${name} (${pose}): his ${n.bones[most.j].name} ${(most.d * 1000).toFixed(1)} mm off where it goes with nothing round him (${most.t.toFixed(2)} s)`,
          );
      }
    }
  } finally {
    delete SEATS[BARE];
    k.setSeatPose('resting');
  }
  assert.deepEqual(bad, [], 'a Praise held in');
});

// Round 9's (before the scenery kept him out), measured the same way on the same height maps:
// the largest step (m) of his head and of either hand at the fire's 12 frames a second in each
// thing he does at his seat, at any seat in either seat pose.
const ROUND9_STEP = {
  'getting up': { head: 0.241, hands: 0.243 },
  'sitting down': { head: 0.177, hands: 0.328 },
  'the site’s dance': { head: 0.242, hands: 0.369 },
  'seated praise': { head: 0.095, hands: 0.672 },
  'seated wave': { head: 0.057, hands: 0.436 },
  'seated bow': { head: 0.032, hands: 0.296 },
  'seated point': { head: 0.038, hands: 0.28 },
  'seated beckon': { head: 0.068, hands: 0.196 },
  'seated shrug': { head: 0.067, hands: 0.245 },
  'seated hurrah': { head: 0.115, hands: 0.588 },
  'seated joy': { head: 0.116, hands: 0.763 },
  'seated impact': { head: 0.199, hands: 0.628 },
  'seated stoke': { head: 0.099, hands: 0.339 },
  'seated ring': { head: 0.046, hands: 0.031 },
  'standing praise': { head: 0.29, hands: 0.652 },
  'standing wave': { head: 0.019, hands: 0.41 },
  'standing bow': { head: 0.084, hands: 0.146 },
  'standing point': { head: 0.052, hands: 0.387 },
  'standing beckon': { head: 0.017, hands: 0.254 },
  'standing shrug': { head: 0.019, hands: 0.179 },
  'standing hurrah': { head: 0.059, hands: 0.68 },
  'standing joy': { head: 0.368, hands: 0.978 },
  'standing impact': { head: 0.248, hands: 0.583 },
  'standing stoke': { head: 0.159, hands: 0.55 },
  'standing ring': { head: 0.114, hands: 0.224 },
};
// (Kept clear, a step that goes further than round 9's went goes at most this much further
// than the same step with nothing there to keep clear of, and 1 cm: the step he first touches
// something, he eases back about as little as clears him, not most of the way. Four poses a
// step find it to within a few hundredths of all the way back: round 10's seated beckon or
// Point, first touching the ruins' pillar then at his shoulder, went up to a fifth further.)
const CLEAR_STEP = 1.25;
// (Each from six moments in his idle, a quarter second and more apart, from its start: where
// his arms are when it starts, and how the fire's 12 frames a second fall on it, change what
// he first touches and when. From where the tests before left him, the moments moved with
// every test added or changed before this one.)
const IDLE = [0.5, 0.79, 1.08, 1.37, 1.66, 1.95];
test('[slow] everything he does at his seat moves on smoothly: no step of his head or hands more than 1.5× round 9’s, and none further than round 9’s a quarter further than with nothing there to keep clear of', async () => {
  const env = await realKnights();
  const { k } = env;
  const n = k.knights[0];
  const parts = ['head', 'handL', 'handR'].map((b) => n.bones.find((x) => x.name === b));
  const at = () => {
    n.group.updateMatrixWorld(true);
    return parts.map((b) => b.getWorldPosition(new THREE.Vector3()));
  };
  const STEP = 1 / 12 + 1e-7;
  const bad = [];
  // (An impact's flinch starts a moment late at random: the same moment every time here.)
  const random = Math.random;
  Math.random = () => 0.5;
  try {
    for (const name of NAMES) {
      k.setScenery(name, await terrainOf(name));
      for (const pose of SEAT_POSES) {
        k.setSeatPose(pose);
        // The largest step of his head and each hand (and when) over `seconds` from `start()`,
        // `idle` s after he's seated (or then `standing` up in front of it); `bare`, with
        // nothing near him to keep clear of (knights.js nearOf()'s list, emptied: his room for
        // his arms is still his seat's).
        const steps = (seconds, start, standing, idle, bare) => {
          const tick = () => {
            n.near = bare ? { scenery: name, x: n.group.position.x, z: n.group.position.z, list: [] } : null;
            k.update(STEP);
          };
          k.dismiss(0, { instant: true });
          k.summon(0, { instant: true });
          // (His idle from its start, whatever the tests before left his clock at.)
          n.clock = 0;
          k.update(idle);
          if (standing) {
            k.stand(0);
            for (let t = 0; t < 1.8; t += 1 / 12) tick();
          }
          start();
          let prev = at();
          const most = [0, 0, 0],
            when = [0, 0, 0];
          for (let t = 0; t < seconds; t += 1 / 12) {
            tick();
            const now = at();
            now.forEach((v, i) => {
              const d = v.distanceTo(prev[i]);
              if (d > most[i]) {
                most[i] = d;
                when[i] = t;
              }
            });
            prev = now;
          }
          n.near = null;
          return { most, when };
        };
        const run = (what, seconds, start, standing = false) => {
          const r9 = ROUND9_STEP[what];
          for (const idle of IDLE) {
            const kept = steps(seconds, start, standing, idle, false);
            // (Only a step further than round 9's needs the measure without.)
            const free = kept.most.some((d, i) => d > (i ? r9.hands : r9.head))
              ? steps(seconds, start, standing, idle, true)
              : null;
            kept.most.forEach((d, i) => {
              const was = i ? r9.hands : r9.head,
                without = free?.most[i] ?? 0;
              const step = `${name} (${pose}) ${what} (${idle} s into his idle): his ${parts[i].name} ${(d * 100).toFixed(1)} cm in a step (${kept.when[i].toFixed(2)} s)`;
              // (Where his seat itself has him go further than round 9's anywhere did, kept clear
              // or not, that's the measure: on the ground in the ruins he rests otherwise than
              // round 9's did, a knee drawn up high and a leg stretched out.)
              if (d > 1.5 * Math.max(was, without)) bad.push(`${step}; round 9's at most ${(was * 100).toFixed(1)}`);
              if (d > was && d > CLEAR_STEP * without + 0.01)
                bad.push(`${step}; with nothing to keep clear of ${(without * 100).toFixed(1)}`);
            });
          }
        };
        run('getting up', 1.6, () => k.stand(0));
        run('sitting down', 1.8, () => k.sit(0), true);
        for (const g of GESTURES)
          run(g === 'dance' ? 'the site’s dance' : `seated ${g}`, GESTURE_TIME[g] + 0.4, () =>
            k.gesture(g, { index: 0 }),
          );
        for (const r of ['impact', 'stoke', 'ring']) run(`seated ${r}`, 1.4, () => k.react(r, 1));
        for (const g of GESTURES.filter((q) => q !== 'dance'))
          run(`standing ${g}`, GESTURE_TIME[g] + 0.4, () => k.gesture(g, { index: 0 }), true);
        for (const r of ['impact', 'stoke', 'ring']) run(`standing ${r}`, 1.4, () => k.react(r, 1), true);
      }
    }
  } finally {
    Math.random = random;
    k.dismiss(0, { instant: true });
    k.setSeatPose('resting');
  }
  assert.deepEqual(bad, [], 'steps further than round 9’s, or than with nothing to keep clear of');
});

// (Bonfire Live rests the others on the ground round the fire: knightPlaces.js restPlaces.)
test('[slow] seated at every seat, either seat pose, and on the ground by the fire, his knees keep their bend through a ring under him (an impact with it too) and every seated gesture and move with a ring in it: never down under both his hip and his foot, nor swung round 18 cm a step with his foot all but still', async () => {
  const env = await realKnights();
  const { k } = env;
  const legs = [0, 1].flatMap((i) =>
    ['L', 'R'].map((s) => ({
      i,
      s,
      bones: ['thigh', 'shin', 'foot'].map((b) => k.knights[i].bones.find((x) => x.name === b + s)),
      knee: null,
      foot: null,
    })),
  );
  let low = { d: Infinity, what: '' };
  const swung = [];
  /**
   * Step `seconds` at 12 fps (`each(t)` first each step), keeping the lowest any knee comes
   * from under the lower of its hip and foot, and any step a knee swings round its hip 18 cm
   * or more while its foot moves under 10 cm (it folding through under the leg).
   */
  const see = (seconds, what, each = null) => {
    for (let t = 0; t < seconds; t += 1 / 12) {
      each?.(t);
      k.update(1 / 12 + 1e-7);
      for (const leg of legs) {
        const { i, s, bones } = leg;
        k.knights[i].group.updateMatrixWorld(true);
        const [hip, knee, foot] = bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
        const which = `${what}: ${i ? 'on the ground' : 'seated'}, his ${s === 'L' ? 'left' : 'right'} knee (${t.toFixed(2)} s)`;
        const d = knee.y - Math.min(hip.y, foot.y);
        if (d < low.d) low = { d, what: which };
        knee.sub(hip);
        foot.sub(hip);
        if (leg.knee && knee.distanceTo(leg.knee) >= 0.18 && foot.distanceTo(leg.foot) < 0.1)
          swung.push(`${which} ${(knee.distanceTo(leg.knee) * 100).toFixed(0)} cm`);
        leg.knee = knee;
        leg.foot = foot;
      }
    }
  };
  for (const name of NAMES) {
    k.setScenery(name, await terrainOf(name));
    for (const pose of SEAT_POSES) {
      k.setSeatPose(pose);
      for (const i of [0, 1]) k.summon(i, { instant: true });
      k.update(0.5);
      const at = (what) => `${name} (${pose}) ${what}`;
      k.react('ring', 1);
      see(1.4, at('a ring'));
      // (The site's weapon swap.)
      k.react('impact', 1);
      k.react('ring', 1);
      see(1.6, at('an impact and a ring'));
      const ringAt = (t) => {
        if (Math.abs(t - 0.5) < 0.01) k.react('ring', 1);
      };
      for (const g of GESTURES.filter((q) => q !== 'dance')) {
        for (const i of [0, 1]) k.gesture(g, { index: i });
        see(GESTURE_TIME[g] + 0.2, at(`seated ${g}, a ring in it`), ringAt);
      }
      for (const m of Object.keys(MOVE_INFO).filter((mv) => MOVE_INFO[mv].seated)) {
        for (const i of [0, 1]) k.dance(i, { move: m, energy: 1, seated: true });
        let b = 0;
        see(Math.min(4, MOVE_INFO[m].cycle * 0.5) + 0.25, at(`seated ${m}, a ring in it`), (t) => {
          ringAt(t);
          k.clock((b += 1 / 6), 0.5);
        });
      }
      for (const i of [0, 1]) k.dismiss(i, { instant: true });
      for (const leg of legs) leg.knee = leg.foot = null;
    }
  }
  k.setSeatPose('resting');
  assert.deepEqual(swung, [], 'a knee folding through');
  assert.ok(low.d > 0, `${low.what} comes ${(-low.d * 100).toFixed(1)} cm under both his hip and his foot`);
});

// Round 9's site's dance (no scenery in its way): how far each hand travelled (m), [left,
// right], from 2 s in to 2 s before the end, where he dances on his feet. The same at every seat.
const ROUND9_DANCE_PATH = [4.74, 4.8];
test('[slow] up from his seat for the site’s dance, an arm with all the room it wants up there swings as far as round 9’s (90 %)', async () => {
  const env = await realKnights();
  const { k } = env;
  const n = k.knights[0];
  const hands = ['handL', 'handR'].map((b) => n.bones.find((x) => x.name === b));
  const bad = [];
  let open = 0;
  for (const name of NAMES) {
    k.setSeatPose('resting');
    k.setScenery(name, await terrainOf(name));
    k.summon(0, { instant: true });
    k.update(0.5);
    k.gesture('dance', { index: 0 });
    const path = [0, 0];
    let prev = null;
    for (let t = 0; t < GESTURE_TIME.dance; t += 1 / 12) {
      k.update(1 / 12 + 1e-7);
      if (t < 2 || t > GESTURE_TIME.dance - 2) continue;
      n.group.updateMatrixWorld(true);
      const now = hands.map((b) => b.getWorldPosition(new THREE.Vector3()));
      if (prev)
        now.forEach((v, i) => {
          path[i] += v.distanceTo(prev[i]);
        });
      prev = now;
    }
    // (Where the scenery leaves an arm less room standing there, the dance keeps it in: keepClear's.)
    for (const i of [0, 1]) {
      if (n.home.roomUp[i] < 1) continue;
      open++;
      if (path[i] < 0.9 * ROUND9_DANCE_PATH[i])
        bad.push(
          `${name}: his ${hands[i].name} ${(path[i] * 100).toFixed(0)} cm (round 9: ${(ROUND9_DANCE_PATH[i] * 100).toFixed(0)})`,
        );
    }
    k.dismiss(0, { instant: true });
  }
  assert.ok(open >= 5, `${open} arms with all the room they want`);
  assert.deepEqual(bad, [], 'tucked in where there is room');
});

// Round 9's rightmost on the home view (its x at 16:9, -1..1) in Bonfire Live's breakdown's
// gestures, standing up in front of his seat: at the forge they already went over the blade.
const ROUND9_STANDING = {
  ruins: { praise: -0.0511, joy: -0.0892, hurrah: -0.1683 },
  forge: { praise: 0.0335, joy: 0.0395, hurrah: -0.0371 },
  shrine: { praise: 0.0046, joy: 0.0085, hurrah: -0.0681 },
  cathedral: { praise: -0.0131, joy: 0.0075, hurrah: -0.074 },
  cult: { praise: -0.0192, joy: 0.014, hurrah: -0.0711 },
};
test('[slow] stood up in front of his seat, and all through the site’s dance, he stays left of the planted sword on the home view (1920 and 1280 wide); his gestures up there no further over than round 9’s', async () => {
  const env = await realKnights();
  const { k, corners } = env;
  const n = k.knights[0];
  // The planted weapon's blade (sceneContext.js WEAPON_ANCHOR, weapons.js's holder: its lean).
  const holder = new THREE.Object3D();
  holder.position.set(0.04, 0, 0.03);
  holder.rotation.set(0.07, 0.16, -0.05);
  holder.updateMatrixWorld(true);
  // (The same camera on both: only the aspect differs, so a point's x across the view scales.)
  const pov = getPov('home', 'wide');
  const cam = new THREE.PerspectiveCamera(pov.fov, 16 / 9, 0.1, 50);
  cam.position.set(...pov.pos);
  cam.lookAt(new THREE.Vector3(...pov.target));
  cam.updateMatrixWorld(true);
  const toView = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const views = [
    [1920, 1080],
    [1280, 800],
  ].map(([W, H]) => ({ W, px: (x) => (((x * (16 / 9)) / (W / H) + 2 * pov.sx + 1) / 2) * W }));
  let blade = Infinity;
  for (let y = 0.3; y <= 1.6; y += 0.05)
    blade = Math.min(blade, new THREE.Vector3(0, y, 0).applyMatrix4(holder.matrixWorld).applyMatrix4(toView).x);
  const m = new THREE.Matrix4();
  /** His rightmost point now (the view's x, -1..1 at 16:9), or `most` if that's further. */
  const right = (most) => {
    n.group.updateMatrixWorld(true);
    for (const b of n.bones) {
      const vs = corners[b.name];
      if (!vs || (b.name.startsWith('helm_') && !n.helms[b.name.slice(5)].visible)) continue;
      m.multiplyMatrices(toView, b.matrixWorld);
      for (let p = 0; p < vs.length; p += 3)
        most = Math.max(most, _v.set(vs[p], vs[p + 1], vs[p + 2]).applyMatrix4(m).x);
    }
    return most;
  };
  for (const name of NAMES) {
    k.setSeatPose('resting');
    k.setScenery(name, await terrainOf(name));
    k.summon(0, { instant: true });
    k.update(0.5);
    const gestured = (g) => [
      `standing ${g}`,
      () => k.gesture(g, { index: 0 }),
      GESTURE_TIME[g] + 0.2,
      ROUND9_STANDING[name][g],
    ];
    for (const [what, act, seconds, was] of [
      ['stood up', () => k.stand(0), 2.4],
      // (Bonfire Live's breakdown has him up there; the drop throws a Praise or a cheer.)
      gestured('praise'),
      gestured('joy'),
      gestured('hurrah'),
      [
        'dancing',
        () => {
          k.sit(0);
          for (let t = 0; t < 1.8; t += 1 / 12) k.update(1 / 12 + 1e-7);
          k.gesture('dance', { index: 0 });
        },
        GESTURE_TIME.dance + 0.3,
      ],
    ]) {
      act();
      let most = -Infinity;
      for (let t = 0; t < seconds; t += 1 / 12) {
        k.update(1 / 12 + 1e-7);
        most = right(most);
      }
      // (A hundredth of the view's width to spare: his edge, then the blade. Or, where round 9's
      // gesture came nearer than that, no more than half a hundredth further than it did.)
      for (const view of views) {
        const [his, its] = [view.px(most), view.px(blade)];
        const most9 = was == null ? -Infinity : view.px(was) + view.W / 200;
        assert.ok(
          his <= Math.max(its - view.W / 100, most9),
          `${name}, ${what}, ${view.W} wide: he comes to ${his.toFixed(0)} px, the sword's blade is at ${its.toFixed(0)} px${was == null ? '' : ` (round 9: ${view.px(was).toFixed(0)} px)`}`,
        );
      }
    }
    k.dismiss(0, { instant: true });
  }
});

test('[slow] sitting on the ground, in the ruins and resting on the ring by the fire, either seat pose, nothing of him goes under it (1.5 cm): his idle, every seated gesture, the reactions and the seated moves', async () => {
  const env = await realKnights();
  const { k } = env;
  const terrain = await terrainOf('ruins');
  const where = ['in the ruins', 'on the ring'];
  const bad = [];
  for (const pose of SEAT_POSES) {
    k.setSeatPose(pose);
    k.setScenery('ruins', terrain);
    k.setCast({ count: 2, instant: true });
    // (A new scenery sends them home: the other one sits down where Bonfire Live rests him.)
    k.setScenery('ruins', terrain);
    const low = [{ d: Infinity }, { d: Infinity }];
    /** Step `seconds` at 12 fps (`each()` first each step), keeping the lowest each knight comes under the ground (the height map's). */
    const see = (seconds, what, each = null) => {
      for (let t = 0; t < seconds; t += 1 / 12) {
        each?.();
        k.update(1 / 12 + 1e-7);
        for (const i of [0, 1])
          eachPoint(env, k.knights[i], (v, bone) => {
            const d = v.y - terrain.height(v.x, v.z);
            if (d < low[i].d) low[i] = { d, what, bone, t };
          });
      }
    };
    see(6, 'his idle');
    // (The site's dance in his seat: a phone's view.)
    k.headroom = false;
    for (const g of GESTURES) {
      k.gesture(g, { index: 'all' });
      see((g === 'dance' ? DANCE_SEATED_TIME : GESTURE_TIME[g]) + 0.2, `seated ${g}`);
    }
    k.headroom = true;
    for (const r of ['impact', 'stoke', 'ring']) {
      k.react(r, 1);
      see(1.4, `seated ${r}`);
    }
    for (const m of Object.keys(MOVE_INFO).filter((mv) => MOVE_INFO[mv].seated)) {
      for (const i of [0, 1]) k.dance(i, { move: m, energy: 1, seated: true });
      let b = 0;
      see(Math.min(4, MOVE_INFO[m].cycle * 0.5) + 0.25, `seated ${m}`, () => k.clock((b += 1 / 6), 0.5));
    }
    low.forEach((w, i) => {
      if (w.d < -0.015)
        bad.push(
          `${where[i]} (${pose}), ${w.what}: his ${w.bone} ${(-w.d * 100).toFixed(1)} cm under the ground (${w.t.toFixed(2)} s)`,
        );
    });
    for (const i of [0, 1]) k.dismiss(i, { instant: true });
  }
  k.setCast({ count: 1, instant: true });
  k.dismiss(0, { instant: true });
  k.setSeatPose('resting');
  assert.deepEqual(bad, [], 'under the ground');
});
