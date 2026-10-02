// The knights against the scenery (src/bonfire/colliders.js). The shapes are the pieces
// scenery.js builds (every piece in a knight's reach inside them, to 2 cm) and the model's
// own in the ruins (public/models/bonfire.glb, decoded: its pillar's bounds to 2 cm). Then
// the knight on the real model (test/lib/knightMesh.mjs, every piece's surface every 3 cm)
// at the fire's 12 frames a second, on the scene's own height map (rebuilt here by rays
// straight down onto the same meshes: terrain.js renders them from above): seated at every
// seat in either seat pose he's 4 cm clear of everything, his boots resting on what's under
// them; and nothing he does there, nor any dancer at any place on the ring, goes more than
// 1.5 cm into a shape (a failure names the action, the piece of him and the shape). Each
// point is tested against the shapes themselves (no rays: those took minutes), and only the
// pieces whose joint is within their reach of a shape (a broad phase). Keeping out of it
// doesn't cost him his smoothness (getting up, sitting down and the site's dance step no
// further at a time than round 9's did, give or take half), nor his place on the home view
// (stood up or dancing there, he stays left of the planted sword), nor much of a frame's time
// (a step solves at most four poses; round 9's solved one). Where his feet rest high (up
// on the ruins' drum, or sitting on the ground), a ring under him doesn't fold a knee down
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
import { CULT, MOVE_REACH, REACH_BANDS, collidersOf, distanceTo, clearanceTo, roomAround, reachFits } from '../src/bonfire/colliders.js';
import { loadKnightMesh } from './lib/knightMesh.mjs';
import { loadGlb } from './lib/glb.mjs';

const NAMES = Object.keys(SEATS);
const material = () => new THREE.MeshLambertMaterial();
const MAT = { stone: material(), pillar: material(), wood: material(), char: material(), wax: material(), mortar: material() };
const fireDist = (x, z) => Math.hypot(x - FIRE_AT.x, z - FIRE_AT.z);
/** Every place the show stands a dancer on in a scenery (slotPlaces and ringPlaces, 1–4, steps -3..3). */
function placesOf(name) {
  const ring = ringOf(name);
  const seen = new Map();
  for (const n of [1, 2, 3, 4]) for (const p of [...slotPlaces(ring, n), ...[-3, -2, -1, 0, 1, 2, 3].flatMap((st) => ringPlaces(ring, n, st))]) seen.set(p.bearing.toFixed(1), p);
  return [...seen.values()];
}
/** The least distance from a point to a scenery's shapes. */
const nearestShape = (cs, x, y, z) => cs.reduce((m, c) => Math.min(m, distanceTo(c, x, y, z)), Infinity);

// --- the shapes ---------------------------------------------------------------------------------
test('every piece scenery.js builds in a knight’s reach is inside its shapes (to 2 cm), the stones leaning as it draws them', () => {
  for (const name of NAMES.filter((n) => n !== 'ruins')) {
    const s = buildScenery(name, MAT, () => new THREE.MeshBasicMaterial());
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
      const reach = Math.min(...near.map((p) => Math.hypot(Math.max(box.min.x - p.x, 0, p.x - box.max.x), Math.max(box.min.z - p.z, 0, p.z - box.max.z))));
      if (reach > 1.2) return;
      pieces++;
      const pos = m.geometry.attributes.position;
      let worst = 0, at = null;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const d = nearestShape(cs, v.x, v.y, v.z);
        if (d > worst) { worst = d; at = v.toArray(); }
      }
      assert.ok(worst <= 0.02, `${name}: a ${m.geometry.type} reaches ${worst.toFixed(3)} m out of the shapes at (${at?.map((q) => q.toFixed(2))})`);
    });
    assert.ok(pieces > 8, `${name}: ${pieces} pieces in reach`);
  }
  // The cult's standing stones turn and tip by the seeded draws colliders.js has written down.
  const s = buildScenery('cult', MAT, () => new THREE.MeshBasicMaterial());
  const stones = [];
  s.group.traverse((m) => { if (m.isMesh && m.geometry.type === 'BoxGeometry' && m.geometry.parameters.depth === CULT.stones.depth && m.geometry.parameters.height > 1) stones.push(m.parent); });
  assert.equal(stones.length, 3);
  stones.forEach((g, i) => {
    assert.equal(g.rotation.y, CULT.stones.drawn[i][0], `stone ${'ABC'[i]} turns as drawn`);
    assert.equal(g.rotation.x, CULT.stones.drawn[i][1], `stone ${'ABC'[i]} tips as drawn`);
  });
});

test('the ruins’ shapes are the model’s own (bonfire.glb): the pillar’s bounds to 2 cm, every piece in reach inside them', async () => {
  const glb = await loadGlb(new URL('../public/models/bonfire.glb', import.meta.url));
  const cs = collidersOf('ruins');
  const pillar = cs.find((c) => c.name === 'pillar');
  // The broken shaft: Static_Pillar's points round its axis, above the plinth.
  const pts = glb.worldPoints('Static_Pillar');
  const shaft = pts.filter(([x, y, z]) => y > pillar.y0 - 0.005 && Math.hypot(x - pillar.x, z - pillar.z) < 0.3);
  assert.ok(shaft.length > 16, `the shaft's corners (${shaft.length})`);
  const lo = [0, 1, 2].map((k) => Math.min(...shaft.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...shaft.map((p) => p[k])));
  const r = Math.max(pillar.r0, pillar.r1);
  const want = { lo: [pillar.x - r, pillar.y0, pillar.z - r], hi: [pillar.x + r, pillar.y1, pillar.z + r] };
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(lo[k] - want.lo[k]) <= 0.02 && Math.abs(hi[k] - want.hi[k]) <= 0.02, `the shaft's ${'xyz'[k]} ${lo[k].toFixed(3)}..${hi[k].toFixed(3)} (its shape's ${want.lo[k].toFixed(3)}..${want.hi[k].toFixed(3)})`);
  }
  // Every piece of the model's pillar (plinth, shaft, fallen drum, wall) and its candles above
  // the rubble, within reach of his seat or a dancer, inside the shapes to 2 cm.
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
  assert.ok(open.every((band) => band.every((r) => r >= 1.2 - 1e-9)), 'all the room there is');
  for (const move of Object.keys(MOVE_REACH)) assert.ok(reachFits(move, open), `${move} fits in the open`);
  // Beside the shrine's front lantern, facing the fire (it at his back and to his right):
  // less room behind him there than in front, at the light box's height.
  const [fx, fz] = [-1.9 + 0.62, 0.6 - 0.1];
  const yaw = Math.atan2(FIRE_AT.x - fx, FIRE_AT.z - fz);
  const room = roomAround('shrine', fx, fz, yaw);
  const band = REACH_BANDS.findIndex((y, i) => i && y > 1.0) - 1;
  assert.ok(room[band][2] < room[band][0], `behind him ${room[band][2].toFixed(2)} m, in front ${room[band][0].toFixed(2)} m`);
  assert.ok(!reachFits('spin', room), 'a spin’s arms all round don’t fit by the lantern');
  // The shapes' distances: inside a cylinder, its depth; out from a box, the distance.
  const pillar = collidersOf('ruins').find((c) => c.name === 'pillar');
  assert.ok(Math.abs(distanceTo(pillar, pillar.x, 1, pillar.z) + pillar.r0 - (pillar.r0 - pillar.r1) * ((1 - pillar.y0) / (pillar.y1 - pillar.y0))) < 1e-9);
  assert.ok(Math.abs(clearanceTo(pillar, pillar.x + 1, pillar.z) - (1 - pillar.r0)) < 0.01);
});

// --- the knight on the real model -----------------------------------------------------------------
const armor = () => createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1.45 } });
const HELM_NODES = { great: 'K_Helm_Great', armet: 'K_Helm_Armet', bascinet: 'K_Helm_Bascinet' };
const SIZE = 12, RES = 320, CELL = SIZE / RES, HALF = SIZE / 2; // (terrain.js's)
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
  // (The ruins' own pieces are hidden in the other sceneries: scene.js.)
  const ruinsOnly = (m) => /Static_(Pillar|Mortar|Wax)/.test(m.name);
  const s = buildScenery(name, MAT, () => new THREE.MeshBasicMaterial());
  s.group.updateMatrixWorld(true);
  const own = [];
  s.group.traverse((o) => { if (o.isMesh && !s.glows.includes(o)) { o.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); own.push(o); } });
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
      const fx = (x + HALF) / CELL - 0.5, fz = (HALF - z) / CELL - 0.5;
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
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
  const pieces = {}, corners = {};
  for (const b of k.knights[0].bones) {
    const node = BONE_NODES[b.name] ?? HELM_NODES[b.name.replace('helm_', '')];
    const pts = model.surface(node, 0.03);
    if (pts.length) pieces[b.name] = { pts: Float32Array.from(pts.flat()), r: Math.max(...pts.map((p) => Math.hypot(...p))) };
    // (Its corners alone: the farthest it comes any way.)
    const vs = model.points(node);
    if (vs.length) corners[b.name] = Float32Array.from(vs.flat());
  }
  engine = { k, pieces, corners };
  return engine;
}
const _v = new THREE.Vector3();
const _j = new THREE.Vector3();
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
      for (const c of near) { const d = distanceTo(c, _v.x, _v.y, _v.z); if (d < best.d) best = { d, bone: b.name, shape: c.name }; }
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
const report = (log) => Object.entries(log).filter(([, w]) => w.depth > DEEPEST).map(([what, w]) => `${what}: ${w.bone} ${(w.depth * 100).toFixed(1)} cm into ${w.shape} (${w.t.toFixed(2)} s)`);

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
      let least = { d: Infinity }, boot = { d: Infinity };
      // (Over his idle, four times a second: the breathing, the doze and its start, the
      // glances, a shift of his weight and hands.)
      for (let t = 0; t < 26; t += 0.25) {
        k.update(0.25);
        const w = nearestOf(env, 0, cs, { skip: boots, margin: 0.05 });
        if (w.d < least.d) least = w;
        const f = nearestOf(env, 0, cs, { skip: (b) => !boots(b) });
        if (f.d < boot.d) boot = f;
      }
      assert.ok(least.d >= 0.04, `${name}, ${pose}: his ${least.bone} comes to ${(least.d * 100).toFixed(1)} cm of the ${least.shape}`);
      assert.ok(boot.d >= -0.01, `${name}, ${pose}: his ${boot.bone} rests ${(-boot.d * 100).toFixed(1)} cm into the ${boot.shape}`);
      k.dismiss(0, { instant: true });
    }
  }
  k.setSeatPose('resting');
});

test('[slow] nothing he does at his seat goes into the scenery (every helmet in the ruins): gestures seated and standing, the site’s dance, reactions, seated moves, getting up and sitting down; no step of it solves more than 4 poses', async () => {
  const env = await realKnights();
  const { k } = env;
  const bad = [];
  const solves = {};
  for (const name of NAMES) {
    const cs = collidersOf(name);
    k.setScenery(name, await terrainOf(name));
    // (The helmets reach differently: the bascinet's visor juts, its mail hangs low. In the
    // ruins he stands up over the drum, his head low over it.)
    for (const helmet of name === 'ruins' ? ['great', 'armet', 'bascinet'] : ['great']) {
      for (const pose of SEAT_POSES) {
        const log = {};
        const at = (what) => `${name} (${pose}${helmet === 'great' ? '' : `, ${helmet}`}) ${what}`;
        const see = (seconds, what, each = null) => watch(env, 0, cs, seconds, at(what), log, each, solves);
        k.setSeatPose(pose);
        k.summon(0, { instant: true });
        await k.setHelmet(helmet, { index: 0, instant: true });
        see(1, 'sitting');
        // Every gesture seated (the site's dance gets up for its two bars and sits back down),
        // and the site's dance in his seat (a phone's view).
        for (const g of GESTURES) { k.gesture(g, { index: 0 }); see(GESTURE_TIME[g] + 0.2, `seated ${g}`); }
        k.headroom = false;
        k.gesture('dance', { index: 0 });
        see(DANCE_SEATED_TIME + 0.2, 'the dance in his seat');
        k.headroom = true;
        for (const r of ['impact', 'stoke', 'ring']) { k.react(r, 1); see(1.4, `seated ${r}`); }
        // Every seated move on a beat clock (two beats a second).
        for (const m of Object.keys(MOVE_INFO).filter((mv) => MOVE_INFO[mv].seated)) {
          k.dance(0, { move: m, energy: 1, seated: true });
          let b = 0;
          see(Math.min(4, MOVE_INFO[m].cycle * 0.5) + 0.25, `seated ${m}`, () => k.clock((b += 1 / 6), 0.5));
        }
        k.sit(0);
        see(0.6, 'settling');
        // Up on his feet in front of his seat (as Bonfire Live's breakdown has him watch), every
        // gesture there and the reactions, and back down.
        k.stand(0);
        see(1.4, 'getting up');
        for (const g of GESTURES.filter((q) => q !== 'dance')) { k.gesture(g, { index: 0 }); see(GESTURE_TIME[g] + 0.2, `standing ${g}`); }
        for (const r of ['impact', 'stoke', 'ring']) { k.react(r, 1); see(1.4, `standing ${r}`); }
        k.sit(0);
        see(1.6, 'sitting down');
        bad.push(...report(log));
        k.dismiss(0, { instant: true });
      }
    }
  }
  k.setSeatPose('resting');
  await k.setHelmet('great', { index: 0, instant: true });
  assert.deepEqual(bad, [], `deeper than ${DEEPEST * 100} cm`);
  assert.ok(solves.n <= MOST_SOLVES, `${solves.what}: a step solved ${solves.n} poses (${solves.t.toFixed(2)} s)`);
  assert.ok(solves.n > 1, 'he eases back somewhere, a few poses a step');
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
    const places = placesOf(name).filter((p) => cs.some((c) => clearanceTo(c, p.x, p.z, { from: 0, to: 2.6 }) < reach + 0.1));
    for (const p of places) {
      for (const facing of ['fire', 'front']) {
        const log = {};
        const at = (what) => `${name} ${p.bearing.toFixed(0)}° facing the ${facing}: ${what}`;
        k.dismiss(1, { instant: true });
        k.summon(1, { instant: true, at: p, facing });
        const fitting = Object.keys(MOVE_INFO).filter((m) => k.fits(m, p, facing));
        if (facing === 'fire') assert.ok(fitting.length > 2, `${name} ${p.bearing.toFixed(0)}°: moves fit there facing the fire (${fitting})`);
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
    most.forEach((band, i) => band.forEach((r, w) => {
      assert.ok(r <= MOVE_REACH[move][i][w] + 0.005, `${move}: ${(r * 100).toFixed(1)} cm ${['in front', 'aside', 'behind'][w]} at ${REACH_BANDS[i]}–${REACH_BANDS[i + 1]} m (MOVE_REACH ${MOVE_REACH[move][i][w]})`);
    }));
  }
  k.dismiss(1, { instant: true });
});

test('in the ruins his boots rest up on the model’s fallen drum, well out of the fire; he stands up over them and steps across it', async () => {
  const env = await realKnights();
  const { k } = env;
  k.setSeatPose('resting');
  k.setScenery('ruins', await terrainOf('ruins'));
  k.summon(0, { instant: true });
  const n = k.knights[0];
  // His right boot up on the model's drum (his left on its flank); still out of the fire.
  assert.ok(n.home.feet[1] > 0.3, `his boots rest at ${n.home.feet.map((q) => q.toFixed(2))} m`);
  k.update(0.5);
  const foot = n.bones.find((b) => b.name === 'footR');
  foot.getWorldPosition(_v);
  assert.ok(fireDist(_v.x, _v.z) > 1.05, `his raised boot is ${fireDist(_v.x, _v.z).toFixed(2)} m from the fire's middle`);
  // He stands up to his right, in front of the pillar's plinth (SEATS standAside), across the
  // drum: up over his boots first, then a step across (knightPose.js rise()'s `over`).
  k.stand(0);
  k.update(1 / 12 + 1e-7);
  assert.ok(n.over?.cross, 'something to step across on his way up');
  assert.ok(n.home.stand.x < -0.3, `he stands up to his right (${n.home.stand.x.toFixed(2)} m)`);
  k.dismiss(0, { instant: true });
});

// Round 9's seated Praise the Sun (the scenery not yet in its way): how high each hand got over
// his hips (m), [left, right], at each seat in either seat pose. (Its room then raised a hand
// hemmed in at a side straight up, a little higher.)
const ROUND9_PRAISE = {
  ruins: { resting: [0.814, 0.897], watchful: [0.822, 0.905] },
  forge: { resting: [0.814, 0.897], watchful: [0.822, 0.905] },
  shrine: { resting: [0.814, 0.897], watchful: [0.822, 0.905] },
  cathedral: { resting: [0.814, 0.814], watchful: [0.822, 0.822] },
  cult: { resting: [0.897, 0.897], watchful: [0.905, 0.905] },
};
test('[slow] seated Praise the Sun at every seat, either seat pose, throws both arms up: each hand at least 90 % as high over his hips as round 9’s', async () => {
  const env = await realKnights();
  const { k } = env;
  const n = k.knights[0];
  const [hips, ...hands] = ['hips', 'handL', 'handR'].map((b) => n.bones.find((x) => x.name === b));
  const y = (b) => b.getWorldPosition(_v).y;
  const bad = [];
  for (const name of NAMES) {
    k.setScenery(name, await terrainOf(name));
    for (const pose of SEAT_POSES) {
      k.setSeatPose(pose);
      k.summon(0, { instant: true });
      k.update(0.5);
      n.group.updateMatrixWorld(true);
      const rest = y(hips);
      k.gesture('praise', { index: 0 });
      const top = [-Infinity, -Infinity];
      for (let t = 0; t < GESTURE_TIME.praise; t += 1 / 12) {
        k.update(1 / 12 + 1e-7);
        n.group.updateMatrixWorld(true);
        hands.forEach((b, i) => { top[i] = Math.max(top[i], y(b) - rest); });
      }
      top.forEach((h, i) => {
        const was = ROUND9_PRAISE[name][pose][i];
        if (h < 0.9 * was) bad.push(`${name} (${pose}): his ${hands[i].name} ${(h * 100).toFixed(0)} cm over his hips (round 9: ${(was * 100).toFixed(0)})`);
      });
      k.dismiss(0, { instant: true });
    }
  }
  k.setSeatPose('resting');
  assert.deepEqual(bad, [], 'a hand held down');
});

// Round 9's (before the scenery kept him out), measured the same way on the same height maps:
// the largest step (m) of his head and of either hand at the fire's 12 frames a second.
const ROUND9_STEP = { 'getting up': { head: 0.241, hands: 0.253 }, 'sitting down': { head: 0.177, hands: 0.328 }, 'the site’s dance': { head: 0.241, hands: 0.369 } };
test('[slow] getting up, sitting down and the site’s dance at every seat move on smoothly: no step of his head or hands more than 1.5× round 9’s', async () => {
  const env = await realKnights();
  const { k } = env;
  const n = k.knights[0];
  const parts = ['head', 'handL', 'handR'].map((b) => n.bones.find((x) => x.name === b));
  const at = () => { n.group.updateMatrixWorld(true); return parts.map((b) => b.getWorldPosition(new THREE.Vector3())); };
  const bad = [];
  for (const name of NAMES) {
    k.setScenery(name, await terrainOf(name));
    for (const pose of SEAT_POSES) {
      k.setSeatPose(pose);
      k.summon(0, { instant: true });
      k.update(0.5);
      const run = (what, seconds) => {
        let prev = at();
        const most = [0, 0, 0], when = [0, 0, 0];
        for (let t = 0; t < seconds; t += 1 / 12) {
          k.update(1 / 12 + 1e-7);
          const now = at();
          now.forEach((v, i) => { const d = v.distanceTo(prev[i]); if (d > most[i]) { most[i] = d; when[i] = t; } });
          prev = now;
        }
        const limit = ROUND9_STEP[what];
        if (most[0] > 1.5 * limit.head) bad.push(`${name} (${pose}) ${what}: his head ${(most[0] * 100).toFixed(1)} cm in a step (${when[0].toFixed(2)} s)`);
        for (const i of [1, 2]) if (most[i] > 1.5 * limit.hands) bad.push(`${name} (${pose}) ${what}: his ${parts[i].name} ${(most[i] * 100).toFixed(1)} cm in a step (${when[i].toFixed(2)} s)`);
      };
      k.stand(0);
      run('getting up', 1.6);
      k.sit(0);
      run('sitting down', 1.8);
      k.update(0.3);
      k.gesture('dance', { index: 0 });
      run('the site’s dance', GESTURE_TIME.dance + 0.4);
      k.dismiss(0, { instant: true });
    }
  }
  k.setSeatPose('resting');
  assert.deepEqual(bad, [], `more than 1.5× round 9's steps`);
});

// (Bonfire Live rests the others on the ground round the fire: knightPlaces.js restPlaces.)
test('[slow] seated at every seat, either seat pose, and on the ground by the fire, his knees keep their bend through a ring under him (an impact with it too) and every seated gesture and move with a ring in it: never down under both his hip and his foot, nor swung round 18 cm a step with his foot all but still', async () => {
  const env = await realKnights();
  const { k } = env;
  const legs = [0, 1].flatMap((i) => ['L', 'R'].map((s) => ({
    i, s, bones: ['thigh', 'shin', 'foot'].map((b) => k.knights[i].bones.find((x) => x.name === b + s)), knee: null, foot: null,
  })));
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
        if (leg.knee && knee.distanceTo(leg.knee) >= 0.18 && foot.distanceTo(leg.foot) < 0.1) swung.push(`${which} ${(knee.distanceTo(leg.knee) * 100).toFixed(0)} cm`);
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
      const ringAt = (t) => { if (Math.abs(t - 0.5) < 0.01) k.react('ring', 1); };
      for (const g of GESTURES.filter((q) => q !== 'dance')) {
        for (const i of [0, 1]) k.gesture(g, { index: i });
        see(GESTURE_TIME[g] + 0.2, at(`seated ${g}, a ring in it`), ringAt);
      }
      for (const m of Object.keys(MOVE_INFO).filter((mv) => MOVE_INFO[mv].seated)) {
        for (const i of [0, 1]) k.dance(i, { move: m, energy: 1, seated: true });
        let b = 0;
        see(Math.min(4, MOVE_INFO[m].cycle * 0.5) + 0.25, at(`seated ${m}, a ring in it`), (t) => { ringAt(t); k.clock((b += 1 / 6), 0.5); });
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
      if (prev) now.forEach((v, i) => { path[i] += v.distanceTo(prev[i]); });
      prev = now;
    }
    // (Where the scenery leaves an arm less room standing there, the dance keeps it in: keepClear's.)
    for (const i of [0, 1]) {
      if (n.home.roomUp[i] < 1) continue;
      open++;
      if (path[i] < 0.9 * ROUND9_DANCE_PATH[i]) bad.push(`${name}: his ${hands[i].name} ${(path[i] * 100).toFixed(0)} cm (round 9: ${(ROUND9_DANCE_PATH[i] * 100).toFixed(0)})`);
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
  // The planted weapon's blade (scene.js WEAPON_ANCHOR, weapons.js's holder: its lean).
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
  const views = [[1920, 1080], [1280, 800]].map(([W, H]) => ({ W, px: (x) => ((x * (16 / 9) / (W / H) + 2 * pov.sx + 1) / 2) * W }));
  let blade = Infinity;
  for (let y = 0.3; y <= 1.6; y += 0.05) blade = Math.min(blade, new THREE.Vector3(0, y, 0).applyMatrix4(holder.matrixWorld).applyMatrix4(toView).x);
  const m = new THREE.Matrix4();
  /** His rightmost point now (the view's x, -1..1 at 16:9), or `most` if that's further. */
  const right = (most) => {
    n.group.updateMatrixWorld(true);
    for (const b of n.bones) {
      const vs = corners[b.name];
      if (!vs || (b.name.startsWith('helm_') && !n.helms[b.name.slice(5)].visible)) continue;
      m.multiplyMatrices(toView, b.matrixWorld);
      for (let p = 0; p < vs.length; p += 3) most = Math.max(most, _v.set(vs[p], vs[p + 1], vs[p + 2]).applyMatrix4(m).x);
    }
    return most;
  };
  for (const name of NAMES) {
    k.setSeatPose('resting');
    k.setScenery(name, await terrainOf(name));
    k.summon(0, { instant: true });
    k.update(0.5);
    const gestured = (g) => [`standing ${g}`, () => k.gesture(g, { index: 0 }), GESTURE_TIME[g] + 0.2, ROUND9_STANDING[name][g]];
    for (const [what, act, seconds, was] of [
      ['stood up', () => k.stand(0), 2.4],
      // (Bonfire Live's breakdown has him up there; the drop throws a Praise or a cheer.)
      gestured('praise'), gestured('joy'), gestured('hurrah'),
      ['dancing', () => { k.sit(0); for (let t = 0; t < 1.8; t += 1 / 12) k.update(1 / 12 + 1e-7); k.gesture('dance', { index: 0 }); }, GESTURE_TIME.dance + 0.3],
    ]) {
      act();
      let most = -Infinity;
      for (let t = 0; t < seconds; t += 1 / 12) { k.update(1 / 12 + 1e-7); most = right(most); }
      // (A hundredth of the view's width to spare: his edge, then the blade. Or, where round 9's
      // gesture came nearer than that, no more than half a hundredth further than it did.)
      for (const view of views) {
        const [his, its] = [view.px(most), view.px(blade)];
        const most9 = was == null ? -Infinity : view.px(was) + view.W / 200;
        assert.ok(his <= Math.max(its - view.W / 100, most9), `${name}, ${what}, ${view.W} wide: he comes to ${his.toFixed(0)} px, the sword's blade is at ${its.toFixed(0)} px${was == null ? '' : ` (round 9: ${view.px(was).toFixed(0)} px)`}`);
      }
    }
    k.dismiss(0, { instant: true });
  }
});
