// The knights (src/bonfire/knights.js) on a stand-in model: one rigidly skinned mesh per
// knight (and one for each helmet, only the worn one drawn), geometry shared, helmets that
// swap, tassets that follow the thighs, feet on the ground, dancing to a clock, walking (not
// burning away) between the seat and the ring, the others at home on the ring's clear
// sides, each knight's own pose for the cameras and the blade, the shadow redrawn whenever
// what casts it changes, the show's comings and goings (a new scenery, an ember walk, the
// cast's count), reactions that leave a dance alone, the room for his arms at home and
// where a dance move fits (from the scenery's shapes), and nothing left behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKnights, HELMETS, MOVES } from '../src/bonfire/knights.js';
import { createArmorShared } from '../src/bonfire/armor.js';
import {
  BONES,
  BONE_NODES,
  PARENT,
  DEFAULT_REST,
  TASSET_FOLLOW,
  SEAT_DEPTH,
  SEAT_POSES,
  GESTURE_TIME,
  DANCE_SEATED_TIME,
} from '../src/bonfire/knightPose.js';
import { createResourceScope } from '../src/bonfire/resources.js';
import { SEATS, DANCE_RING } from '../src/bonfire/scenery.js';
import { restPlaces, ringOf, sideArcs, slotPlaces, FRONT, FIRE_AT, PIT } from '../src/bonfire/knightPlaces.js';

/** The model's rig as plain groups (docs/knight.md), a box on every joint, three helmets on the head. */
function standInModel() {
  const knight = new THREE.Group();
  knight.name = 'Knight';
  const nodes = {};
  const box = (mat) =>
    new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      Object.assign(new THREE.MeshStandardMaterial(), { name: mat }),
    );
  for (const [bone, name] of Object.entries(BONE_NODES)) {
    const g = new THREE.Group();
    g.name = name;
    nodes[bone] = g;
  }
  for (const [bone, g] of Object.entries(nodes)) {
    const par = PARENT[bone];
    const at = new THREE.Vector3(...DEFAULT_REST[bone]);
    if (par) at.sub(new THREE.Vector3(...DEFAULT_REST[par]));
    g.position.copy(at);
    (par ? nodes[par] : knight).add(g);
    // A piece in two materials (a multi-material mesh loads as a group of meshes).
    const piece = new THREE.Group();
    piece.name = `${g.name}_Mesh`;
    piece.add(box('K_Plate'), box(bone === 'chest' ? 'K_Trim' : 'K_Edge'));
    g.add(piece);
  }
  for (const h of ['Great', 'Armet', 'Bascinet']) {
    const helm = new THREE.Group();
    helm.name = `K_Helm_${h}`;
    helm.add(box('K_Plate'), box('K_Void'));
    nodes.head.add(helm);
  }
  const root = new THREE.Group();
  root.add(knight);
  return root;
}

const armor = () => createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1.45 } });
/** A flat clearing with each scenery's seat standing in it (the height map's two questions). */
const flat = (seatTop = 0.4) => ({
  height: () => 0.02,
  top: (x, z) => (Math.hypot(x - SEATS.ruins.x, z - SEATS.ruins.z) < 0.15 ? seatTop : 0.02),
});
/** Flat ground with the scenery's seat in it, at its height. */
const flatAt = (name) => ({
  height: () => 0.02,
  top: (x, z) => (Math.hypot(x - SEATS[name].x, z - SEATS[name].z) < 0.15 ? SEATS[name].top : 0.02),
});
const make = (o = {}) => createKnights(standInModel(), { armor: armor(), max: 3, castShadows: true, ...o });
const run = (k, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) {
    k.update(dt);
    k.group.updateMatrixWorld(true);
  }
};
const bone = (k, i, name) => k.knights[i].bones.find((b) => b.name === name);

test('each knight is one skinned body and a mesh for each helmet, sharing geometry, on one skeleton', () => {
  const k = make();
  assert.equal(k.knights.length, 3);
  const meshes = k.knights.map((n) => n.group.children.filter((o) => o.isSkinnedMesh));
  for (const m of meshes) {
    assert.equal(m.length, 4, 'body + three helmets');
    for (const h of m) assert.equal(h.skeleton, m[0].skeleton, 'one skeleton');
    assert.ok(m[0].frustumCulled && m[0].boundingSphere, 'culled by fixed bounds (test/knightsBounds.test.mjs)');
    assert.ok(m[0].castShadow && m[0].receiveShadow);
  }
  assert.equal(meshes[0][0].geometry, meshes[1][0].geometry, 'body geometry shared between knights');
  for (let j = 1; j < 4; j++) assert.equal(meshes[0][j].geometry, meshes[2][j].geometry, 'helmet geometry shared');
  assert.notEqual(meshes[0][1].geometry, meshes[0][2].geometry, 'a geometry for each helmet');
  const body = meshes[0][0].geometry;
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight', 'aRole'])
    assert.ok(body.attributes[name], `has ${name}`);
  // Rigid: every vertex fully on one bone.
  const w = body.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) assert.equal(w.getX(i), 1);
  // Roles came from the material names: plate (0), edge (1), trim (2) on the body; void (6) on the helmets.
  const roles = new Set(body.attributes.aRole.array);
  assert.deepEqual([...roles].sort(), [0, 1, 2]);
  for (let j = 1; j < 4; j++) assert.ok(new Set(meshes[0][j].geometry.attributes.aRole.array).has(6));
  assert.equal(k.skeletons[0].bones.length, BONES.length + 3, 'every joint and 3 helmets');
});

test('helmets: only the one worn is drawn; swaps at once or with the gesture', async () => {
  const k = make();
  k.setScenery('ruins', flat());
  k.summon(0, { instant: true });
  const shown = () => HELMETS.map((h) => k.knights[0].helms[h].visible);
  assert.deepEqual(shown(), [true, false, false]);
  await k.setHelmet('bascinet', { index: 0, instant: true });
  assert.deepEqual(shown(), [false, false, true]);
  assert.equal(k.helmet, 'bascinet');
  // Animated: hands up, the old one burns away, the new one forms, all within 1.6 s.
  const done = k.setHelmet('armet', { index: 0 });
  run(k, 0.5);
  assert.equal(k.helmet, 'bascinet', 'the old helmet is still burning away');
  assert.ok(k.knights[0].helmMat.userData.uniforms.uDissolve.value > 0.2, 'dissolving');
  assert.equal(k.knights[0].helms.bascinet.layers.mask, 1 << 2, 'on the ghost layer while it dissolves');
  assert.equal(k.knights[0].helms.bascinet.castShadow, false, 'no shadow of the holes');
  // (His hands are on his helm: a gesture can't start, and says so.)
  assert.equal(k.gesture('wave', { index: 0 }), false, 'no gesture during the swap');
  assert.equal(k.gesture('wave', { index: 'all' }), false);
  run(k, 1.2);
  assert.equal(await done, true);
  assert.deepEqual(shown(), [false, true, false]);
  assert.equal(k.knights[0].helmMat.userData.uniforms.uDissolve.value, 0);
  assert.equal(k.knights[0].helms.armet.layers.mask, 1, 'back on the solid layer (outlined)');
  assert.equal(k.knights[0].helms.armet.castShadow, true);
  assert.equal(k.gesture('wave', { index: 0 }), true, 'and now he can');
});

test('seated on a raised seat (the forge’s stump): the feet on the ground, facing the fire (turned a little to the cameras), tassets halfway with the thighs', () => {
  const k = make();
  // (The height map's stump 5 cm higher than the table's seat: within 10 cm, so the map's is taken.)
  const seat = SEATS.forge,
    top = seat.top + 0.05;
  assert.ok(!seat.ground && seat.top > 0.15, 'the forge’s seat is a raised one');
  k.setScenery('forge', {
    height: () => 0.02,
    top: (x, z) => (Math.hypot(x - seat.x, z - seat.z) < 0.15 ? top : 0.02),
  });
  k.summon(0, { instant: true });
  run(k, 0.2);
  const n = k.knights[0];
  assert.equal(k.list[0].state, 'sitting');
  const toFire = Math.atan2(0.02 - n.group.position.x, 0.02 - n.group.position.z);
  assert.ok(Math.abs(n.yaw - seat.yaw) < 1e-6, 'sits the way his seat says');
  const off = Math.atan2(Math.sin(n.yaw - toFire), Math.cos(n.yaw - toFire));
  assert.ok(
    off < 0 && off > -0.6,
    `turned from the fire toward the cameras by ${((off * 180) / Math.PI).toFixed(0)}°, not away from it`,
  );
  const foot = bone(k, 0, 'footL').getWorldPosition(new THREE.Vector3());
  assert.ok(
    Math.abs(foot.y - (0.02 + DEFAULT_REST.footL[1])) < 0.01,
    `left ankle at ${foot.y.toFixed(3)}, on the ground`,
  );
  const hips = bone(k, 0, 'hips').getWorldPosition(new THREE.Vector3());
  assert.ok(
    Math.abs(hips.y - (top + SEAT_DEPTH)) < 0.01,
    `hips at ${hips.y.toFixed(3)}, on the stump (its top at ${top.toFixed(2)})`,
  );
  // The tasset turns about TASSET_FOLLOW of the way from the hips to the thigh.
  const q = (name) => bone(k, 0, name).getWorldQuaternion(new THREE.Quaternion());
  const full = q('hips').angleTo(q('thighL'));
  const half = q('hips').angleTo(q('tassetL'));
  assert.ok(full > 1, 'the thigh is well up, seated');
  assert.ok(Math.abs(half / full - TASSET_FOLLOW) < 0.08, `tasset follows ${(half / full).toFixed(2)} of the thigh`);
  // The model can ask for its own share (its tasset nodes' `follow`).
  const model = standInModel();
  model.getObjectByName('K_Tasset_L').userData.follow = 0.85;
  const k2 = createKnights(model, { armor: armor(), max: 1 });
  assert.equal(k2.rig.tassetFollow, 0.85);
});

test('seated on the ground (the ruins): on the ground under him, a flagstone lifting him, never up on a stone’s top there; his boots on the ground in front of him', () => {
  const seat = SEATS.ruins;
  assert.ok(seat.ground && seat.top === 0, 'the ruins’ seat is the ground itself');
  const under = (x, z, r) => Math.hypot(x - seat.x, z - seat.z) < r;
  for (const [what, ground, y] of [
    // (A stone's top under him that a raised seat would take for its own: within 10 cm of it.)
    ['a stone’s top under him', { height: () => 0.02, top: (x, z) => (under(x, z, 0.15) ? 0.08 : 0.02) }, 0.02],
    // (A flagstone under his hips, his boots down off it in front.)
    [
      'on a flagstone',
      { height: (x, z) => (under(x, z, 0.2) ? 0.07 : 0.02), top: (x, z) => (under(x, z, 0.2) ? 0.07 : 0.02) },
      0.07,
    ],
  ]) {
    for (const pose of SEAT_POSES) {
      const k = make();
      k.setSeatPose(pose);
      k.setScenery('ruins', ground);
      k.summon(0, { instant: true });
      run(k, 0.2);
      const n = k.knights[0];
      const at = `${what} (${pose})`;
      assert.equal(k.list[0].state, 'sitting');
      assert.equal(n.home.h, 0, `${at}: he sits on the ground, no seat under him (${n.home.h} m)`);
      assert.ok(
        Math.abs(n.group.position.y - y) < 1e-9,
        `${at}: placed at ${n.group.position.y.toFixed(3)} m, the ground under him at ${y}`,
      );
      const hips = bone(k, 0, 'hips').getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(hips.y - (y + SEAT_DEPTH)) < 0.01, `${at}: his hips at ${hips.y.toFixed(3)} m`);
      // (His own space: z ahead of him.)
      const ahead = (v) =>
        v
          .clone()
          .sub(n.group.position)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), -n.yaw).z;
      for (const side of ['L', 'R']) {
        const foot = bone(k, 0, `foot${side}`).getWorldPosition(new THREE.Vector3());
        assert.ok(
          Math.abs(foot.y - (0.02 + DEFAULT_REST[`foot${side}`][1])) < 0.01,
          `${at}: his ${side === 'L' ? 'left' : 'right'} ankle at ${foot.y.toFixed(3)} m, on the ground (0.02)`,
        );
        assert.ok(
          ahead(foot) > ahead(hips) + 0.25,
          `${at}: his ${side === 'L' ? 'left' : 'right'} boot ${(ahead(foot) - ahead(hips)).toFixed(2)} m in front of his hips`,
        );
      }
    }
  }
});

test('dancing: up, over to the slot and on the clock; shadows redraw only when a pose steps', () => {
  const k = make();
  k.setScenery('ruins', flat());
  k.summon(0, { instant: true });
  run(k, 1);
  // Sitting still, breathing: never a shadow redraw.
  let moved = 0;
  for (let f = 0; f < 120; f++) {
    k.update(1 / 60);
    if (k.moving) moved++;
  }
  assert.equal(moved, 0, 'idle motion leaves the shadow alone');
  assert.ok(k.dance(0, { move: 'jump', slot: 1, facing: 'front' }));
  for (let f = 0; f < 60 * 8 && k.list[0].state !== 'dancing'; f++) k.update(1 / 60);
  assert.equal(k.list[0].state, 'dancing', `dancing (${k.list[0].state})`);
  const slot = k.slots('ruins').slots[0];
  assert.ok(k.list[0].position.distanceTo(new THREE.Vector3(slot.x, k.list[0].position.y, slot.z)) < 0.01, 'at slot 1');
  moved = 0;
  let steps = 0;
  for (let f = 0; f < 60; f++) {
    k.clock(f / 30, 0.5); // 120 bpm
    k.update(1 / 60);
    if (k.moving) moved++;
    steps = f;
  }
  assert.ok(
    moved >= 10 && moved <= 13,
    `the shadow redraws at the pose's 12 steps a second (${moved} of ${steps + 1} frames)`,
  );
  // On the beat the jump lands (hips low); half a beat later he's in the air.
  k.clock(40, 0.5);
  run(k, 1 / 12);
  const low = bone(k, 0, 'hips').getWorldPosition(new THREE.Vector3()).y;
  k.clock(40.5, 0.5);
  run(k, 1 / 12);
  const high = bone(k, 0, 'hips').getWorldPosition(new THREE.Vector3()).y;
  assert.ok(high - low > 0.15, `a big jump (${(high - low).toFixed(2)} m)`);
  // Called again every bar (the visualizer): the move changes in place, no new trip.
  for (let bar = 0; bar < 4; bar++) {
    assert.ok(k.dance(0, { move: bar % 2 ? 'clap' : 'stomp', slot: 1, facing: 'front', energy: bar / 4 }));
    run(k, 0.25);
    assert.equal(k.list[0].state, 'dancing', `still dancing after bar ${bar}`);
  }
  assert.equal(k.list[0].move, 'clap');
  // A knight who isn't there forms right at his slot, on his feet, already dancing.
  assert.ok(k.dance(2, { move: 'march', slot: 3 }));
  assert.equal(k.list[2].state, 'arriving');
  run(k, 0.8);
  assert.equal(k.list[2].state, 'dancing');
  const s3 = k.slots('ruins').slots[2];
  assert.ok(Math.hypot(k.list[2].position.x - s3.x, k.list[2].position.z - s3.z) < 0.01, 'at slot 3');
  // Back to the seat.
  assert.ok(k.sit(0));
  for (let f = 0; f < 60 * 8 && k.list[0].state !== 'sitting'; f++) k.update(1 / 60);
  assert.equal(k.list[0].state, 'sitting');
});

test('asked to dance where he already stands, facing that way, he dances at once (not stands there)', () => {
  // (Every queued step is skipped at once: the dance must already be noted when it starts.)
  const k = make();
  k.setScenery('ruins', flat());
  const slot = k.slots('ruins').slots[0];
  assert.ok(k.summon(1, { instant: true, at: { x: slot.x, z: slot.z }, facing: 'fire' }));
  run(k, 0.2);
  assert.equal(k.list[1].state, 'standing');
  assert.ok(k.dance(1, { move: 'clap', position: { x: slot.x, z: slot.z }, facing: 'fire' }));
  assert.equal(k.list[1].state, 'dancing', `dancing at once (${k.list[1].state})`);
  assert.equal(k.list[1].move, 'clap');
  run(k, 0.5);
  assert.equal(k.list[1].state, 'dancing');
  // Stood up by hand first (nothing noted), then asked to dance right there: the same.
  k.stand(1);
  run(k, 0.2);
  assert.equal(k.list[1].state, 'standing');
  const at = k.list[1].position;
  assert.ok(k.dance(1, { move: 'stomp', position: { x: at.x, z: at.z }, facing: k.list[1].facing }));
  assert.equal(k.list[1].state, 'dancing');
  assert.equal(k.list[1].move, 'stomp');
  // Seated: asked to dance sitting down, he does so at once.
  k.summon(0, { instant: true });
  assert.ok(k.dance(0, { move: 'nod', seated: true }));
  assert.equal(k.list[0].state, 'dancing');
});

test('from his seat to the ring and back is a walk in every scenery, never a trip by ember', () => {
  for (const name of Object.keys(SEATS)) {
    const k = make();
    k.setScenery(name, flatAt(name));
    k.summon(0, { instant: true });
    run(k, 0.3);
    const seat = { ...k.list[0].position };
    // The first dancer's place in a line (the show's usual), then Round the Fire's.
    for (const place of [
      slotPlaces(ringOf(name), 1)[0],
      ...slotPlaces(ringOf(name), 3).filter((p) => p.bearing > 180),
    ]) {
      assert.ok(k.dance(0, { move: 'clap', position: { x: place.x, z: place.z }, facing: 'fire' }));
      const states = new Set();
      let dissolved = 0;
      for (let f = 0; f < 60 * 6 && k.list[0].state !== 'dancing'; f++) {
        k.update(1 / 60);
        states.add(k.list[0].state);
        dissolved = Math.max(dissolved, k.knights[0].bodyMat.userData.uniforms.uDissolve.value);
      }
      assert.equal(k.list[0].state, 'dancing', `${name}: dancing at ${place.bearing.toFixed(0)}°`);
      assert.ok(states.has('walk'), `${name}: walked there (${[...states]})`);
      assert.equal(dissolved, 0, `${name}: never burnt away on the way to ${place.bearing.toFixed(0)}°`);
      assert.ok(
        Math.hypot(k.list[0].position.x - place.x, k.list[0].position.z - place.z) < 0.02,
        `${name}: at the place`,
      );
      // Back to the seat, walking.
      k.sit(0);
      for (let f = 0; f < 60 * 8 && k.list[0].state !== 'sitting'; f++) {
        k.update(1 / 60);
        dissolved = Math.max(dissolved, k.knights[0].bodyMat.userData.uniforms.uDissolve.value);
        // (never through the fire pit on the way)
        const p = k.list[0].position;
        assert.ok(Math.hypot(p.x - 0.02, p.z - 0.02) > 0.7, `${name}: clear of the fire pit`);
      }
      assert.equal(k.list[0].state, 'sitting', `${name}: back on his seat`);
      assert.equal(dissolved, 0, `${name}: walked back from ${place.bearing.toFixed(0)}°`);
      assert.ok(
        Math.hypot(k.list[0].position.x - seat.x, k.list[0].position.z - seat.z) < 0.02,
        `${name}: on the seat again`,
      );
    }
  }
});

test('the others are at home on the ring’s clear sides, where the show rests them, never in front of the fire', () => {
  for (const name of Object.keys(SEATS)) {
    for (const n of [2, 3, 4]) {
      const k = make({ max: 4 });
      k.setScenery(name, flatAt(name));
      k.setCast({ count: n, instant: true });
      // (A new scenery sends everyone home there: the same places.)
      k.setScenery(name, flatAt(name));
      run(k, 0.1);
      const want = restPlaces(ringOf(name), n, SEATS[name]);
      const arcs = sideArcs(DANCE_RING.free(name));
      for (let i = 1; i < n; i++) {
        const p = k.list[i].position;
        assert.equal(k.list[i].state, 'arriving');
        // Sitting a step out from the place, feet on it, facing the fire.
        const b = ((Math.atan2(p.x - 0.02, p.z - 0.02) * 180) / Math.PI + 360) % 360;
        assert.ok(
          Math.abs(b - want[i - 1].bearing) < 1,
          `${name} ×${n}: knight ${i} at ${b.toFixed(0)}° (the show's ${want[i - 1].bearing.toFixed(0)}°)`,
        );
        assert.ok(
          arcs.some(([lo, hi]) => (b >= lo && b <= hi) || (b + 360 >= lo && b + 360 <= hi)),
          `${name}: ${b.toFixed(0)}° is on a clear side`,
        );
        assert.ok(Math.min(b, 360 - b) >= FRONT, `${name}: ${b.toFixed(0)}° isn't in front of the fire`);
      }
    }
  }
});

test('cast, summon and dismiss; reactions; a knight picked by a ray; capsules for the blade', () => {
  const k = make();
  k.setScenery('ruins', flat());
  k.setCast({ count: 3, helmets: ['great', 'armet', 'bascinet'], instant: true });
  assert.equal(k.present, 3);
  assert.deepEqual(
    k.list.map((n) => n.helmet),
    ['great', 'armet', 'bascinet'],
  );
  run(k, 0.2);
  const caps = k.capsules();
  assert.equal(caps.length, 3);
  const c = caps[1];
  const ray = new THREE.Ray(new THREE.Vector3(c.a.x, 0.9, c.a.z + 4), new THREE.Vector3(0, 0, -1));
  assert.equal(k.pick(ray), 1, 'the ray through knight 1 picks him');
  k.dismiss(2);
  run(k, 1);
  assert.equal(k.present, 2);
  assert.equal(k.knights[2].group.visible, false);
  // A flinch is real motion: the shadow redraws while it plays.
  k.react('impact', 1);
  let moved = 0;
  for (let f = 0; f < 30; f++) {
    k.update(1 / 60);
    if (k.moving) moved++;
  }
  assert.ok(moved > 3, 'flinching moves him');
});

test('the fire’s reflection sweeps the armor when the fire flares, now and then at rest, never under reduced motion', () => {
  const a = armor();
  const u = a.uniforms.uSweep.value;
  const step = (s) => {
    for (let t = 0; t < s; t += 1 / 60) a.step(1 / 60);
  };
  a.setShine({ rest: false });
  step(12);
  assert.equal(u.z, 0, 'rest sweeps off: nothing');
  // A stoke: at once, bright (its leading edge in core), out from the fire, gone within a second.
  a.flare(1);
  step(1 / 12);
  assert.ok(u.z > 0.8 && u.w === 1, `a bright sweep (${u.z.toFixed(2)})`);
  assert.equal(a.uniforms.uSweepAxis.value.w, 1, 'out from the fire');
  const front = u.x;
  step(0.3);
  assert.ok(u.x > front && u.z < 0.95, 'it runs across and fades');
  step(0.7);
  assert.equal(u.z, 0, 'done within a second');
  // A weaker flare doesn't cut a strong one short; a stronger one takes over.
  a.flare(1);
  step(0.05);
  const s1 = u.z;
  a.flare(0.3);
  step(1 / 60);
  assert.ok(u.z >= s1 - 0.05, 'the strong one runs on');
  // At rest: a gentler one (no core) within a few seconds.
  step(1.2);
  a.setShine({ rest: true });
  let seen = 0;
  for (let t = 0; t < 10; t += 1 / 60) {
    a.step(1 / 60);
    if (u.z > 0) {
      seen = Math.max(seen, u.z);
      assert.equal(u.w, 0, 'rest sweeps stay in hi');
    }
  }
  assert.ok(seen > 0.3 && seen < 0.8, `a rest sweep ran (${seen.toFixed(2)})`);
  // Switched off, or reduced motion: none.
  a.setShine({ flares: false });
  a.flare(1);
  step(1 / 12);
  assert.ok(u.w === 0, 'flares off');
  const still = createArmorShared({ fireAt: new THREE.Vector3(), exposure: { value: 1 }, reducedMotion: true });
  still.flare(1);
  for (let t = 0; t < 10; t += 1 / 60) {
    still.step(1 / 60);
    assert.equal(still.uniforms.uSweep.value.z, 0);
  }
});

test('disposing frees the shared geometry, the materials and the skeletons', () => {
  const scope = createResourceScope();
  const k = make();
  scope.trackTree(k.group);
  for (const r of [...k.materials, ...k.geometries]) scope.own(r);
  let freed = 0;
  for (const s of k.skeletons) {
    const d = s.dispose.bind(s);
    s.dispose = () => {
      freed++;
      d();
    };
  }
  scope.cleanup(() => k.skeletons.forEach((s) => s.dispose()));
  let geo = 0;
  for (const g of k.geometries) {
    const d = g.dispose.bind(g);
    g.dispose = () => {
      geo++;
      d();
    };
  }
  scope.dispose();
  assert.equal(freed, 3);
  assert.equal(geo, 4, 'each shared geometry once (the body, the three helmets)');
});

test('the living blade fights clear of a knight (the capsules basis() hands over)', async () => {
  const { createRoutine } = await import('../src/bonfire/bladeMotion.js');
  // A knight dancing at slot 1, as knights.capsules() gives him.
  const knight = { a: new THREE.Vector3(-1.18, 0.35, 0.02), b: new THREE.Vector3(-1.18, 1.5, 0.02), r: 0.32 };
  const camPos = new THREE.Vector3(0.3, 1.3, 3.2);
  const len = 1.2;
  const blade = { grip: new THREE.Vector3(0, 1.0 - 0.12 * len, 0), tip: new THREE.Vector3(0, -0.2, 0), len };
  const home = { pos: new THREE.Vector3(0.04, 0, 0.03), quat: new THREE.Quaternion() };
  const seg = new THREE.Vector3(),
    tmp = new THREE.Vector3();
  const inside = (p) => {
    seg.subVectors(knight.b, knight.a);
    const u = Math.min(1, Math.max(0, tmp.subVectors(p, knight.a).dot(seg) / seg.lengthSq()));
    return p.distanceTo(tmp.copy(knight.a).addScaledVector(seg, u)) < knight.r;
  };
  const pos = new THREE.Vector3(),
    quat = new THREE.Quaternion();
  /** How often the tip or grip is inside him around the hits, over 30 routines. */
  function cuts(avoid) {
    let s = 7;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const basis = () => {
      const toCam = camPos
        .clone()
        .sub(new THREE.Vector3(0, 0.9, 0))
        .normalize();
      const right = new THREE.Vector3(0, 1, 0).cross(toCam).normalize();
      return { right, up: new THREE.Vector3().crossVectors(toCam, right), toCam, pos: camPos.clone(), avoid };
    };
    let n = 0;
    for (let run = 0; run < 30; run++) {
      const r = createRoutine({
        blade,
        home,
        center: new THREE.Vector3(0.04, 1.1, 0.03),
        basis,
        hits: [0.6, 1.1, 1.6, 2.1],
        plunge: 2.8,
        rng,
      });
      for (const h of r.hits) {
        for (let t = h.t - 0.08; t <= h.t + 0.04; t += 0.02) {
          r.pose(t, pos, quat);
          for (const local of [blade.tip, blade.grip]) if (inside(local.clone().applyQuaternion(quat).add(pos))) n++;
        }
      }
    }
    return n;
  }
  assert.ok(cuts([]) > 10, 'without the capsule the blade does cut through where he stands (the test means something)');
  assert.equal(cuts([knight]), 0, 'with it, never');
});

test('knights sent away as the scenery changes stay gone (the show’s drop that sends them off and moves the fire)', () => {
  const k = make({ max: 4 });
  k.setScenery('ruins', flatAt('ruins'));
  k.summon(0, { instant: true });
  const [a, b] = slotPlaces(ringOf('ruins'), 2);
  assert.ok(k.dance(1, { move: 'jump', position: a, facing: 'fire' }));
  assert.ok(k.dance(2, { move: 'jump', position: b, facing: 'fire' }));
  run(k, 1);
  assert.deepEqual(
    k.list.slice(1, 3).map((n) => n.state),
    ['dancing', 'dancing'],
  );
  assert.equal(k.count, 3);
  // The same frame: sent away, then the new scenery.
  k.dismiss(1);
  k.dismiss(2);
  assert.equal(k.count, 1, 'the cast is down to the one staying');
  k.setScenery('forge', flatAt('forge'));
  for (let bar = 0; bar < 6; bar++) run(k, 1);
  assert.deepEqual(
    k.list.map((n) => n.state),
    ['sitting', 'away', 'away', 'away'],
    'only the seated one re-forms there',
  );
  assert.equal(k.present, 1);
  assert.equal(k.positions.length, 1, 'the cameras get no heads of knights who left');
  assert.equal(k.knights[1].group.visible, false);
  const seat = SEATS.forge;
  assert.ok(
    Math.hypot(k.list[0].position.x - seat.x, k.list[0].position.z - seat.z) < 0.02,
    'knight 0 on the forge’s seat',
  );
});

test('each knight keeps his own solved pose: head positions and blade capsules are his, not the last one solved', () => {
  const k = make();
  k.setScenery('ruins', flat());
  k.summon(0, { instant: true });
  const place = slotPlaces(ringOf('ruins'), 1)[0];
  assert.ok(k.dance(1, { move: 'jump', position: place, facing: 'fire' }));
  for (let f = 0; f < 90; f++) {
    k.clock(f / 30, 0.5);
    k.update(1 / 60);
  }
  k.group.updateMatrixWorld(true);
  const heads = k.positions;
  const caps = k.capsules();
  assert.equal(heads.length, 2);
  for (const i of [0, 1]) {
    const head = bone(k, i, 'head').getWorldPosition(new THREE.Vector3());
    assert.ok(
      heads[i].distanceTo(head) < 0.01,
      `knight ${i}'s head (${heads[i].y.toFixed(2)} vs ${head.y.toFixed(2)})`,
    );
    assert.ok(Math.abs(caps[i].b.y - (head.y + 0.12)) < 0.01, `knight ${i}'s capsule reaches his own head`);
  }
  assert.ok(heads[1].y - heads[0].y > 0.3, 'the dancer stands taller than the seated knight');
});

test('the shadow is redrawn whenever what casts it changes: forming, burning away, a new place', () => {
  const k = make();
  k.setScenery('ruins', flat());
  k.summon(0, { instant: true });
  run(k, 1);
  const frames = (n) => {
    const m = [];
    for (let f = 0; f < n; f++) {
      k.update(1 / 60);
      m.push(k.moving);
    }
    return m;
  };
  assert.ok(!frames(60).some(Boolean), 'sitting still: never');
  // Burning away: at once (he stops casting), and not again while he's gone.
  k.dismiss(0);
  assert.equal(frames(1)[0], true, 'he stops casting a shadow: redrawn');
  frames(60);
  assert.equal(k.present, 0);
  assert.ok(!frames(30).some(Boolean), 'gone: nothing more to redraw');
  // Forming: redrawn when he's solid again (his shadow's back).
  k.summon(0);
  let solidAt = -1,
    redrawn = false;
  for (let f = 0; f < 90; f++) {
    k.update(1 / 60);
    if (solidAt < 0 && !k.knights[0].ghost) {
      solidAt = f;
      redrawn = k.moving;
    }
  }
  assert.ok(solidAt > 0 && redrawn, 'the frame he forms, the shadow is redrawn');
  // A gesture: redrawn while it plays, and while his pauldrons and tassets settle after it
  // (the plates' spring: well under a second), then not.
  assert.ok(k.gesture('wave', { index: 0 }));
  let last = -1;
  for (let f = 0; f < 60 * 3; f++) {
    k.update(1 / 60);
    if (k.moving) last = f;
  }
  const ended = Math.ceil(2 * 60); // (GESTURE_TIME.wave: 2 s)
  assert.ok(
    last >= ended - 1 && last <= ended + 40,
    `the last redraw is once the wave has ended and his plates settled (frame ${last}, ends ~${ended})`,
  );
  // Put somewhere new at once (reduced motion: no dissolve): redrawn.
  const still = make({ reducedMotion: true });
  still.setScenery('ruins', flat());
  still.summon(0, { instant: true });
  run(still, 0.5);
  still.setScenery('forge', flatAt('forge'));
  still.update(1 / 60);
  assert.equal(still.moving, true, 'a new place: redrawn');
  // A helmet changed at once: redrawn.
  run(still, 0.5);
  still.setHelmet('armet', { index: 0, instant: true });
  still.update(1 / 60);
  assert.equal(still.moving, true, 'a new helmet: redrawn');
});

test('summoned mid-way through an ember walk, he carries on and dances where he was going; asked to dance while burning away, he comes back', () => {
  const k = make();
  k.setScenery('ruins', flat());
  k.summon(0, { instant: true });
  run(k, 0.3);
  // Round the far side of the fire: too far to walk, so by ember.
  const far = slotPlaces(ringOf('ruins'), 3).find((p) => p.bearing < 180);
  assert.ok(k.dance(0, { move: 'clap', position: far, facing: 'fire' }));
  let f = 0;
  for (; f < 60 * 4 && k.list[0].state !== 'ember'; f++) k.update(1 / 60);
  assert.equal(k.list[0].state, 'ember', 'going by ember (not "leaving": he stays in the cast)');
  assert.equal(k.count, 1);
  assert.equal(k.summon(0), true, 'he is on his way already');
  for (f = 0; f < 60 * 4 && k.list[0].state !== 'dancing'; f++) k.update(1 / 60);
  assert.equal(k.list[0].state, 'dancing');
  assert.ok(
    Math.hypot(k.list[0].position.x - far.x, k.list[0].position.z - far.z) < 0.02,
    'at the place he was going to',
  );
  // Burning away, then asked to dance: he forms again and dances.
  k.dismiss(0);
  run(k, 0.2);
  assert.equal(k.list[0].state, 'leaving');
  assert.ok(k.dance(0, { move: 'stomp', position: far, facing: 'fire' }));
  for (f = 0; f < 60 * 6 && k.list[0].state !== 'dancing'; f++) k.update(1 / 60);
  assert.equal(k.list[0].state, 'dancing', 'back and dancing, not gone');
  assert.equal(k.present, 1);
  assert.equal(k.list[0].move, 'stomp');
});

test('the cast shrinks as knights are sent away, so a new scenery rests the others by the right count', () => {
  const k = make({ max: 4 });
  k.setScenery('forge', flatAt('forge'));
  k.setCast({ count: 4, instant: true });
  assert.equal(k.count, 4);
  k.dismiss(3);
  assert.equal(k.count, 3, 'one leaving: three in the cast');
  run(k, 1);
  k.setScenery('shrine', flatAt('shrine'));
  run(k, 0.1);
  const want = restPlaces(ringOf('shrine'), 3, SEATS.shrine);
  for (let i = 1; i < 3; i++) {
    const p = k.list[i].position;
    const b = ((Math.atan2(p.x - 0.02, p.z - 0.02) * 180) / Math.PI + 360) % 360;
    assert.ok(
      Math.abs(b - want[i - 1].bearing) < 1,
      `knight ${i} rests at ${b.toFixed(0)}° (three's place: ${want[i - 1].bearing.toFixed(0)}°)`,
    );
  }
  k.dismiss(0, { instant: true });
  assert.equal(k.count, 3, 'the highest one staying sets the count');
  k.setCast({ count: 0, instant: true });
  assert.equal(k.count, 0);
});

test('a dancer on his feet, or a knight cheering, doesn’t flinch or lean away (the drop reads whole); the ring still makes him hop', () => {
  const k = make();
  k.setScenery('ruins', flat());
  k.summon(0, { instant: true });
  const place = slotPlaces(ringOf('ruins'), 1)[0];
  assert.ok(k.dance(1, { move: 'jump', position: place, facing: 'fire' }));
  run(k, 1);
  const [seated, dancer] = k.knights;
  k.react('impact', 1);
  k.react('stoke');
  k.react('ring', 1);
  assert.ok(seated.react.flinch >= 0 && seated.react.stoke >= 0, 'the seated knight flinches and leans');
  assert.equal(dancer.react.flinch, -9, 'the dancer doesn’t flinch');
  assert.equal(dancer.react.stoke, -9, '...or lean away');
  assert.ok(dancer.react.hop >= 0, 'he hops the ring');
  // Seated and cheering (Praise the Sun): no flinch over it either.
  run(k, 2);
  const was = seated.react.flinch;
  assert.ok(k.gesture('praise', { index: 0 }));
  k.react('impact', 1);
  assert.equal(seated.react.flinch, was, 'no flinch over Praise the Sun');
  // A seated dance (nodding along) still flinches.
  run(k, 3);
  assert.ok(k.dance(0, { move: 'nod', seated: true }));
  k.react('impact', 1);
  assert.ok(seated.react.flinch > was, 'nodding in his seat, he flinches');
});

test('asked to sit halfway through an ember walk, he forms again where he is and walks back (no jump to the old destination)', () => {
  const k = make();
  k.setScenery('ruins', flatAt('ruins'));
  k.summon(0, { instant: true });
  run(k, 0.2);
  assert.ok(k.dance(0, { move: 'nod', position: { x: 1.2, z: 0.3 }, facing: 'fire' })); // across the front: by ember
  run(k, 1.3);
  assert.equal(k.list[0].state, 'ember', 'on his way by ember');
  k.sit(0);
  let last = k.knights[0].group.position.clone();
  let jump = 0;
  for (let t = 0; t < 6; t += 1 / 60) {
    k.update(1 / 60);
    const p = k.knights[0].group.position;
    jump = Math.max(jump, Math.hypot(p.x - last.x, p.z - last.z));
    last = p.clone();
  }
  assert.ok(jump < 0.3, `no jump (largest step ${jump.toFixed(2)} m)`);
  assert.equal(k.list[0].state, 'sitting');
  assert.ok(Math.hypot(last.x - SEATS.ruins.x, last.z - SEATS.ruins.z) < 0.05, 'back on his seat');
});

test('the living blade swinging close: knights within reach flinch (a dancer a little less), the rest don’t', () => {
  const k = make();
  k.setScenery('ruins', flat());
  k.summon(0, { instant: true });
  const place = slotPlaces(ringOf('ruins'), 1)[0];
  assert.ok(k.dance(1, { move: 'stomp', position: place, facing: 'fire' }));
  run(k, 1);
  const [seated, dancer] = k.knights;
  const at = { x: dancer.group.position.x, z: dancer.group.position.z };
  k.react('impact', 0.5, { at, radius: 1.1 });
  assert.ok(dancer.react.flinch >= 0, 'the dancer by the blade flinches');
  assert.ok(Math.abs(dancer.react.flinchK - 0.3) < 1e-9, '...a little less than a knight at rest would');
  const far = Math.hypot(seated.group.position.x - at.x, seated.group.position.z - at.z) > 1.1;
  if (far) assert.equal(seated.react.flinch, -9, 'the seated knight across the fire takes no notice');
});

test('summoned and sent off by the forge: he waits burnt away, hands over his posed body, and ends whole or gone', () => {
  const k = make();
  k.setScenery('ruins', flatAt('ruins'));
  assert.equal(k.list[0].state, 'away');
  assert.ok(k.summon(0, { forge: true }));
  const n = k.knights[0];
  assert.equal(k.list[0].state, 'arriving');
  assert.ok(n.group.visible && n.ghost, 'shown on the ghost layer (no outline, no shadow of the holes)');
  for (const m of [n.bodyMat, n.helmMat])
    assert.equal(m.userData.uniforms.uDissolve.value, 1, 'burnt away until the forge builds him');
  run(k, 0.5);
  assert.equal(n.bodyMat.userData.uniforms.uDissolve.value, 1, 'nothing but the forge touches his dissolve');
  assert.equal(k.list[0].state, 'arriving');
  // His posed body as a forge subject.
  const s = k.forgeSubject(0, 300);
  assert.equal(s.samples.length, 900);
  assert.ok(s.samples.every(Number.isFinite) && s.heights.every((h) => h >= 0 && h <= 1));
  const world = new THREE.Vector3(s.samples[0], s.samples[1], s.samples[2]).applyMatrix4(s.matrixWorld);
  assert.ok(world.distanceTo(n.group.position) < 1.2, 'the samples are on him');
  assert.ok(s.silhouette().segs.length > 20, 'his silhouette traced');
  s.uniforms.uDissolve.value = 0.5;
  s.uniforms.uEdge.value.copy(new THREE.Color('#ff0000'));
  for (const m of [n.bodyMat, n.helmMat]) {
    assert.equal(m.userData.uniforms.uDissolve.value, 0.5, 'both his materials burn together');
    assert.equal(m.userData.uniforms.uEdge.value.r, 1);
  }
  assert.deepEqual(
    n.helmMat.userData.uniforms.uSpan.value.toArray(),
    n.bodyMat.userData.uniforms.uSpan.value.toArray(),
    'his helmet burns over his whole height, last',
  );
  s.show(false);
  assert.equal(n.group.visible, false, 'the strobe hides him');
  s.show(true);
  assert.ok(k.forged(0));
  assert.equal(k.list[0].state, 'sitting');
  assert.ok(!n.ghost && n.body.castShadow, 'solid again, casting his shadow');
  assert.equal(n.bodyMat.userData.uniforms.uDissolve.value, 0);
  assert.notDeepEqual(
    n.helmMat.userData.uniforms.uSpan.value.toArray(),
    n.bodyMat.userData.uniforms.uSpan.value.toArray(),
    'the helmet has its own span back (for its swaps)',
  );
  // Sent off: still there, leaving, till the forge is done with him.
  assert.ok(k.dismiss(0, { forge: true }));
  assert.equal(k.list[0].state, 'leaving');
  assert.equal(k.count, 0, 'leaving: out of the cast');
  run(k, 0.5);
  assert.equal(k.present, 1);
  assert.ok(k.forged(0));
  assert.equal(k.list[0].state, 'away');
  assert.equal(n.group.visible, false);
  // A new scenery while the forge builds him: he forms at the new seat at once (the plain fade).
  k.summon(0, { forge: true });
  k.setScenery('forge', flatAt('forge'));
  assert.equal(n.forging, null);
  run(k, 1);
  assert.equal(k.list[0].state, 'sitting');
  assert.ok(Math.hypot(k.list[0].position.x - SEATS.forge.x, k.list[0].position.z - SEATS.forge.z) < 0.02);
});

/** The real model's rig (its joints where the file has them, a token piece on each) for createKnights. */
function realRig(model) {
  const knight = new THREE.Group();
  knight.name = 'Knight';
  const make1 = (name) => {
    const g = new THREE.Group();
    g.name = name;
    const t = model.nodes.get(name)?.translation;
    if (t) g.position.set(...t);
    const piece = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.04),
      Object.assign(new THREE.MeshStandardMaterial(), { name: 'K_Plate' }),
    );
    piece.name = `${name}_Mesh`;
    g.add(piece);
    return g;
  };
  const nodes = Object.fromEntries(Object.entries(BONE_NODES).map(([b, name]) => [b, make1(name)]));
  for (const [b, g] of Object.entries(nodes)) (PARENT[b] ? nodes[PARENT[b]] : knight).add(g);
  for (const h of ['Great', 'Armet', 'Bascinet']) nodes.head.add(make1(`K_Helm_${h}`));
  const root = new THREE.Group();
  root.add(knight);
  return root;
}

/**
 * The 390×844 phone's home view (the site: tall layout) and where on it (px from the top) the
 * highest point of knight 0's helmet comes over `seconds` of `k.update` (every 6th frame); and
 * (frame()) how far left and right on it (px) any piece of him comes, with that helmet.
 */
async function phoneView() {
  const { loadKnightMesh } = await import('./lib/knightMesh.mjs');
  const { getPov } = await import('../src/bonfire/povs.js');
  const model = await loadKnightMesh();
  const W = 390,
    H = 844;
  const pov = getPov('home', 'tall');
  const cam = new THREE.PerspectiveCamera(pov.fov, W / H, 0.1, 50);
  cam.position.set(...pov.pos);
  cam.lookAt(new THREE.Vector3(...pov.target));
  cam.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const helmPoints = (helmet) => model.points(`K_Helm_${helmet[0].toUpperCase()}${helmet.slice(1)}`);
  const piecePoints = Object.fromEntries(Object.entries(BONE_NODES).map(([b, node]) => [b, model.points(node)]));
  return {
    model,
    helmPoints,
    W,
    HEADER: 64, // (the site header's bottom there, px)
    /** The helmet's top (px from the top) and his silhouette's left and right (px) over `seconds`. */
    frame(k, helmet, seconds) {
      const helm = helmPoints(helmet);
      let top = Infinity,
        left = Infinity,
        right = -Infinity;
      for (let f = 0; f < 60 * seconds; f++) {
        k.update(1 / 60);
        if (f % 6) continue;
        k.group.updateMatrixWorld(true);
        for (const b of k.knights[0].bones) {
          const pts = b.name === 'head' ? [...piecePoints.head, ...helm] : piecePoints[b.name];
          for (const p of pts ?? []) {
            v.set(...p)
              .applyMatrix4(b.matrixWorld)
              .project(cam);
            const x = ((v.x + 2 * pov.sx + 1) / 2) * W;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, ((1 - (v.y + 2 * pov.sy)) / 2) * H);
          }
        }
      }
      return { top, left, right };
    },
    helmetTop(k, helmet, seconds) {
      const pts = helmPoints(helmet);
      let top = Infinity;
      for (let f = 0; f < 60 * seconds; f++) {
        k.update(1 / 60);
        if (f % 6) continue;
        k.group.updateMatrixWorld(true);
        const head = k.knights[0].bones.find((x) => x.name === 'head');
        for (const p of pts) {
          v.set(...p)
            .applyMatrix4(head.matrixWorld)
            .project(cam);
          top = Math.min(top, ((1 - (v.y + 2 * pov.sy)) / 2) * H);
        }
      }
      return top;
    },
  };
}

test('his room for each arm at home comes from the scenery’s shapes; a dance move fits a place only with room for its reach', () => {
  const k = make();
  // Sat down on the ground right by the shrine's front lantern (colliders.js), it behind his
  // right shoulder: less room for that arm, all of it for the other. (Every scenery's seat
  // stands clear of what's round it: all the room there, test/knightClearance.test.mjs.)
  const by = { x: -1.4, z: 0.3 };
  const sitDown = (name) => {
    k.setScenery(name, flatAt(name));
    k.dismiss(1, { instant: true });
    k.summon(1, { instant: true, at: by, facing: 'fire' });
    k.sit(1);
    run(k, 2);
    assert.equal(k.list[1].state, 'sitting');
    return k.knights[1].home.room;
  };
  const [left, right] = sitDown('shrine');
  assert.ok(
    right < 0.7 && left === 1,
    `sat down by the lantern: room ${left.toFixed(2)} left, ${right.toFixed(2)} right`,
  );
  // The same spot in the ruins, nothing there: all the room.
  assert.deepEqual(sitDown('ruins'), [1, 1], 'sat down there in the ruins');
  k.dismiss(1, { instant: true });
  // On the open ground of the ring (a knight at home there), nothing in an arm's reach.
  k.setScenery('ruins', flatAt('ruins'));
  k.setCast({ count: 2, instant: true });
  run(k, 0.3);
  assert.deepEqual(k.knights[1].home.room, [1, 1], 'the others at home on the ring: all the room');
  // A spin's arms all round don't fit beside the shrine's front lantern; on the open side of
  // the ring every move does.
  const ring = k.slots('shrine');
  const tight = slotPlaces(ring, 1)[0];
  assert.equal(k.fits('spin', tight, 'front', 'shrine'), false, `a spin by the lantern (${tight.bearing}°)`);
  const open = {
    x: FIRE_AT.x + Math.sin((70 * Math.PI) / 180) * 1.2,
    z: FIRE_AT.z + Math.cos((70 * Math.PI) / 180) * 1.2,
  };
  for (const move of MOVES) assert.ok(k.fits(move, open, 'fire', 'shrine'), `${move} at 70°`);
});

test('the settings’ helmets are his (effectsDefaults KNIGHT_HELMETS, less random: sceneKnight.js reads them before his code loads)', async () => {
  const { KNIGHT_HELMETS } = await import('../src/effectsDefaults.js');
  assert.deepEqual(
    KNIGHT_HELMETS.filter((h) => h !== 'random'),
    HELMETS,
  );
});

test('his template built a step at a time (templateSteps) is the one built at once, and createKnights takes it', async () => {
  const { templateSteps } = await import('../src/bonfire/knights.js');
  const model = standInModel();
  const steps = templateSteps(model);
  let r = steps.next(),
    n = 0;
  while (!r.done) {
    r = steps.next();
    n++;
  }
  assert.ok(n > 5, `it yields between its parts (${n} steps)`);
  const t = r.value;
  assert.equal(t.root, model);
  const k = createKnights(model, { armor: armor(), max: 1, template: t });
  assert.equal(k.knights[0].body.geometry, t.bodyGeo, 'built from the template given, not again');
  const fresh = createKnights(standInModel(), { armor: armor(), max: 1 });
  const a = t.bodyGeo.attributes,
    b = fresh.knights[0].body.geometry.attributes;
  for (const name of ['position', 'aPiece', 'aSmooth', 'aPatch', 'aOcc'])
    assert.deepEqual([...a[name].array], [...b[name].array], name);
  // Another model's, adopted beforehand: setStyle with it needn't build it.
  const other = standInModel();
  const steps2 = templateSteps(other);
  let r2 = steps2.next();
  while (!r2.done) r2 = steps2.next();
  assert.equal(k.hasTemplate(other), false);
  k.adoptTemplate(r2.value);
  assert.equal(k.hasTemplate(other), true);
});

test('seated at every seat (either seat pose), his helmet stays under the page header on a 390×844 phone (the home view), and all of him 10 px inside its sides', async () => {
  const view = await phoneView();
  for (const pose of SEAT_POSES) {
    for (const name of Object.keys(SEATS)) {
      for (const helmet of HELMETS) {
        assert.ok(view.helmPoints(helmet).length > 20, `the ${helmet}'s vertices`);
        const k = createKnights(realRig(view.model), { armor: armor(), max: 1 });
        k.setSeatPose(pose);
        k.setScenery(name, flatAt(name));
        k.setHelmet(helmet, { index: 0, instant: true });
        k.summon(0, { instant: true });
        // (Over his idle: breathing, the doze and its start, the glances, a shift of his weight.)
        const { top, left, right } = view.frame(k, helmet, 14);
        // (Scrolled, the header's bar covers its 64 px: his helmet stays clear of it.)
        assert.ok(
          top >= view.HEADER + 1,
          `${pose}, ${name}, ${helmet}: his helmet's top comes to ${top.toFixed(1)} px (the header ends at ${view.HEADER})`,
        );
        // (Seated left of the fire, his far shoulder nears the frame's left edge.)
        assert.ok(
          left >= 10 && right <= view.W - 10,
          `${pose}, ${name}, ${helmet}: he spans ${left.toFixed(1)}–${right.toFixed(1)} px of the phone's ${view.W}`,
        );
      }
    }
  }
});

test('the site’s dance on a phone (no headroom): he dances it in his seat, his helmet under the page header all through', async () => {
  const view = await phoneView();
  for (const name of Object.keys(SEATS)) {
    for (const helmet of HELMETS) {
      const k = createKnights(realRig(view.model), { armor: armor(), max: 1 });
      k.setScenery(name, flatAt(name));
      k.setHelmet(helmet, { index: 0, instant: true });
      k.summon(0, { instant: true });
      for (let f = 0; f < 30; f++) k.update(1 / 60);
      k.headroom = false;
      assert.equal(k.gesture('dance'), true, 'he dances');
      const n = k.knights[0];
      const top = view.helmetTop(k, helmet, DANCE_SEATED_TIME + 0.2);
      assert.ok(
        top >= view.HEADER + 1,
        `${name}, ${helmet}: dancing, his helmet's top comes to ${top.toFixed(1)} px (the header ends at ${view.HEADER})`,
      );
      // (Seated all through, and done in the seated dance's own time.)
      assert.equal(n.mode, 'sit');
      assert.equal(n.gestureName, null);
      assert.equal(k.list[0].state, 'sitting');
    }
  }
  // With headroom (a desktop), he gets up for it: standing in front of his seat mid-dance.
  const k = createKnights(realRig(view.model), { armor: armor(), max: 1 });
  k.setScenery('ruins', flatAt('ruins'));
  k.summon(0, { instant: true });
  for (let f = 0; f < 30; f++) k.update(1 / 60);
  const seatedHead = k.positions[0].y;
  k.gesture('dance');
  for (let f = 0; f < 60 * 3; f++) k.update(1 / 60);
  assert.ok(k.positions[0].y > seatedHead + 0.3, 'up on his feet for it');
  // (Turned to a phone halfway: the dance under way keeps its way.)
  k.headroom = false;
  assert.ok(k.knights[0].gestureName === 'dance');
  for (let f = 0; f < 60 * (GESTURE_TIME.dance - 3) + 30; f++) k.update(1 / 60);
  assert.equal(k.knights[0].gestureName, null);
  assert.equal(k.list[0].state, 'sitting');
});

/**
 * The real model's joints (a small box on each) for createKnights, and how near a knight's real
 * sabatons come to the fire's middle (m).
 */
async function realBoots() {
  const { loadKnightMesh } = await import('./lib/knightMesh.mjs');
  const model = await loadKnightMesh();
  const rig = () => {
    const knight = new THREE.Group();
    knight.name = 'Knight';
    const make1 = (name) => {
      const g = new THREE.Group();
      g.name = name;
      const t = model.nodes.get(name)?.translation;
      if (t) g.position.set(...t);
      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.04),
        Object.assign(new THREE.MeshStandardMaterial(), { name: 'K_Plate' }),
      );
      piece.name = `${name}_Mesh`;
      g.add(piece);
      return g;
    };
    const nodes = Object.fromEntries(Object.entries(BONE_NODES).map(([b, name]) => [b, make1(name)]));
    for (const [b, g] of Object.entries(nodes)) (PARENT[b] ? nodes[PARENT[b]] : knight).add(g);
    for (const h of ['Great', 'Armet', 'Bascinet']) nodes.head.add(make1(`K_Helm_${h}`));
    const root = new THREE.Group();
    root.add(knight);
    return root;
  };
  const boots = { footL: model.points('K_Foot_L'), footR: model.points('K_Foot_R') };
  assert.ok(boots.footL.length > 20, 'the sabatons were read from the model');
  const v = new THREE.Vector3();
  const nearFire = (k, i) => {
    let near = Infinity;
    k.group.updateMatrixWorld(true);
    for (const [b, pts] of Object.entries(boots)) {
      const foot = bone(k, i, b);
      for (const p of pts) {
        v.set(...p).applyMatrix4(foot.matrixWorld);
        near = Math.min(near, Math.hypot(v.x - FIRE_AT.x, v.z - FIRE_AT.z));
      }
    }
    return near;
  };
  return { rig, nearFire };
}
const everySeating = () => SEAT_POSES.flatMap((pose) => Object.keys(SEATS).map((name) => [pose, name]));

test('seated at every scenery’s seat (either seat pose), his boots stay well out of the fire (the real sabatons: ≥ 1.05 m from its middle)', async () => {
  const { rig, nearFire } = await realBoots();
  for (const [pose, name] of everySeating()) {
    const k = createKnights(rig(), { armor: armor(), max: 1 });
    k.setSeatPose(pose);
    k.setScenery(name, flatAt(name));
    k.summon(0, { instant: true });
    let near = Infinity;
    // (Over his idle: breathing, the doze, the glances, a shift of his weight.)
    for (let f = 0; f < 60 * 14; f++) {
      k.update(1 / 60);
      if (f % 10 === 0) near = Math.min(near, nearFire(k, 0));
    }
    assert.ok(near >= 1.05, `${pose}, ${name}: his boots come to ${near.toFixed(2)} m from the fire's middle`);
  }
});

test('the others resting on the ground round the fire (Bonfire Live), either seat pose, keep their boots out of its pit’s stones (a leg stretched out toward it too)', async () => {
  const { rig, nearFire } = await realBoots();
  for (const [pose, name] of everySeating()) {
    const k = createKnights(rig(), { armor: armor(), max: 4 });
    k.setSeatPose(pose);
    k.setScenery(name, flatAt(name));
    k.setCast({ count: 4, instant: true });
    k.setScenery(name, flatAt(name));
    let near = Infinity;
    // (Over their idle, a shift of the weight and all: the right foot steps out and back.)
    for (let f = 0; f < 30 * 13; f++) {
      k.update(1 / 30);
      if (f % 5 === 0) for (let i = 1; i < 4; i++) near = Math.min(near, nearFire(k, i));
    }
    assert.ok(
      near >= PIT + 0.02,
      `${pose}, ${name}: the others' boots come to ${near.toFixed(2)} m from the fire's middle`,
    );
  }
});
