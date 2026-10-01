// The knights' culling bounds (src/bonfire/knights.js BOUNDS): every mesh of a knight is
// culled by one fixed sphere in his own space, so no pose may ever reach outside it or he'd
// blink out of a frame (or out of the fire's shadow). Checked on the real model's
// proportions: its joints' rest places and each piece's reach from its joint, read from
// public/models/knight.glb's JSON (the pieces are rigid, so a piece's farthest point stays
// that far from its joint in any pose). Then the whole engine on the real model's pieces
// (decoded: test/lib/knightMesh.mjs): the plates' spring swings and settles, the same steps
// always swing the same, and, sprung, the pauldrons still stay out of the helmet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createKnights, HELMETS, MOVES, GESTURES, SEAT_POSES } from '../src/bonfire/knights.js';
import { createArmorShared } from '../src/bonfire/armor.js';
import { BONE_NODES, PARENT, GESTURE_TIME, DANCE_SEATED_TIME } from '../src/bonfire/knightPose.js';
import { loadKnightMesh } from './lib/knightMesh.mjs';
import { SEATS } from '../src/bonfire/scenery.js';
import { ringOf, slotPlaces } from '../src/bonfire/knightPlaces.js';

const buf = fs.readFileSync(new URL('../public/models/knight.glb', import.meta.url));
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
const byName = new Map(gltf.nodes.map((n, i) => [n.name, n]));
const HELM_NODES = { great: 'K_Helm_Great', armet: 'K_Helm_Armet', bascinet: 'K_Helm_Bascinet' };
/** Bone name → the model's node for it. */
const NODE_OF = { ...BONE_NODES, ...Object.fromEntries(HELMETS.map((h) => ['helm_' + h, HELM_NODES[h]])) };

/** How far a joint's piece reaches from the joint (its mesh's bounds are in the joint's space). */
function reach(nodeName) {
  const mesh = gltf.meshes[byName.get(`${nodeName}_Mesh`)?.mesh];
  if (!mesh) return 0;
  let r = 0;
  for (const prim of mesh.primitives) {
    const { min, max } = gltf.accessors[prim.attributes.POSITION];
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) r = Math.max(r, Math.hypot(x, y, z));
  }
  return r;
}

/** The model's rig with its own rest places, a small box on every joint (the pieces' shapes don't matter here). */
function realRig() {
  const knight = new THREE.Group();
  knight.name = 'Knight';
  const make = (name) => {
    const g = new THREE.Group();
    g.name = name;
    const t = byName.get(name)?.translation;
    if (t) g.position.set(...t);
    const piece = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), Object.assign(new THREE.MeshStandardMaterial(), { name: 'K_Plate' }));
    piece.name = `${name}_Mesh`;
    g.add(piece);
    return g;
  };
  const nodes = Object.fromEntries(Object.entries(BONE_NODES).map(([b, n]) => [b, make(n)]));
  for (const [b, g] of Object.entries(nodes)) (PARENT[b] ? nodes[PARENT[b]] : knight).add(g);
  for (const h of HELMETS) nodes.head.add(make(HELM_NODES[h]));
  const root = new THREE.Group();
  root.add(knight);
  return root;
}

const armor = () => createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1.45 } });
const flatAt = (name) => ({
  height: () => 0.02,
  top: (x, z) => (Math.hypot(x - SEATS[name].x, z - SEATS[name].z) < 0.15 ? SEATS[name].top : 0.02),
});

test('every pose stays inside the fixed culling sphere, with room to spare', () => {
  const k = createKnights(realRig(), { armor: armor(), max: 2 });
  const sphere = k.knights[0].body.boundingSphere;
  assert.ok(sphere && sphere.radius > 0, 'a fixed sphere, not computed from the first pose');
  for (const n of k.knights) for (const m of n.meshes) {
    assert.ok(m.frustumCulled, `${m.name} is culled`);
    assert.ok(m.boundingSphere.equals(sphere), `${m.name} has the same bounds`);
  }
  const reaches = Object.fromEntries(Object.entries(NODE_OF).map(([b, node]) => [b, reach(node)]));
  assert.ok(reaches.chest > 0.1 && reaches.helm_great > 0.1, 'the pieces were read from the model');
  let worst = { d: 0, what: '' };
  const local = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  /** Every piece of knight i inside the sphere now (the pose as it is: `what` says which). */
  function check(i, what) {
    const n = k.knights[i];
    n.group.updateMatrixWorld(true);
    inv.copy(n.body.matrixWorld).invert();
    for (const bone of n.bones) {
      if (bone.name.startsWith('helm_') && !n.helms[bone.name.slice(5)].visible) continue;
      bone.getWorldPosition(local).applyMatrix4(inv);
      const d = local.distanceTo(sphere.center) + reaches[bone.name];
      if (d > worst.d) worst = { d, what: `${what}: ${bone.name}` };
    }
  }
  const run = (i, seconds, what, clock = null) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      if (clock) clock(t);
      k.update(1 / 60);
      check(i, what);
    }
  };
  for (const name of Object.keys(SEATS)) {
    k.setScenery(name, flatAt(name));
    k.summon(0, { instant: true });
    for (const h of HELMETS) { k.setHelmet(h, { index: 0, instant: true }); run(0, 0.2, `${name} seated, ${h}`); }
    // Every gesture and reaction, seated.
    for (const g of GESTURES) { k.gesture(g, { index: 0 }); run(0, 2.4, `${name} seated ${g}`); }
    for (const r of ['impact', 'stoke', 'ring']) { k.react(r, 1); run(0, 1.5, `${name} seated ${r}`); }
    // Up from the seat (standing in front of it), then seated dancing.
    k.stand(0); run(0, 1.5, `${name} standing at the seat`);
    for (const g of GESTURES) { k.gesture(g, { index: 0 }); run(0, 2.4, `${name} standing at the seat ${g}`); }
    for (const r of ['impact', 'stoke', 'ring']) { k.react(r, 1); run(0, 1.5, `${name} standing ${r}`); }
    k.sit(0); run(0, 1.5, `${name} sitting down`);
    for (const move of MOVES) {
      k.dance(0, { move, energy: 1, seated: true });
      run(0, 4, `${name} seated ${move}`, (t) => k.clock(t * 2, 0.5));
    }
    k.dismiss(0, { instant: true });
  }
  // Every move on his feet, at full energy, with the gestures and reactions over it.
  const place = slotPlaces(ringOf('ruins'), 1)[0];
  k.setScenery('ruins', flatAt('ruins'));
  k.summon(1, { instant: true, at: place, facing: 'fire' });
  for (const move of MOVES) {
    k.dance(1, { move, energy: 1, position: place, facing: 'fire' });
    run(1, 4, `standing ${move}`, (t) => k.clock(t * 2, 0.5));
    for (const g of ['praise', 'hurrah', 'beckon']) { k.gesture(g, { index: 1 }); run(1, 2.4, `standing ${move} ${g}`, (t) => k.clock(t * 2, 0.5)); }
    k.react('ring', 1); run(1, 1, `standing ${move} hop`, (t) => k.clock(t * 2, 0.5));
  }
  // Walking off to another place, and turning.
  k.dance(1, { move: 'nod', position: slotPlaces(ringOf('ruins'), 3)[2], facing: 'out' });
  run(1, 6, 'walking');
  // The site's dance, all of it, from every seat, sitting either way.
  for (const name of Object.keys(SEATS)) {
    k.setScenery(name, flatAt(name));
    k.summon(0, { instant: true });
    for (const style of SEAT_POSES) {
      k.setSeatPose(style);
      run(0, 1, `${name} ${style}`);
      k.gesture('dance', { index: 0 });
      run(0, GESTURE_TIME.dance + 0.3, `${name} ${style} dance`);
      // (…and in his seat, as on a phone.)
      k.headroom = false;
      k.gesture('dance', { index: 0 });
      run(0, DANCE_SEATED_TIME + 0.3, `${name} ${style} dance in his seat`);
      k.headroom = true;
    }
    k.setSeatPose('resting');
    k.dismiss(0, { instant: true });
  }
  assert.ok(worst.d > 1.2, `the poses reached well out (${worst.d.toFixed(2)} m): the check means something`);
  const room = sphere.radius - worst.d;
  assert.ok(room > 0.1, `the farthest piece (${worst.what}, ${worst.d.toFixed(2)} m) is inside ${sphere.radius} m with room (${room.toFixed(2)} m)`);
});

test('on the real model, the plates swing on their springs and settle, the same every time, and stay out of the helmet', async () => {
  const model = await loadKnightMesh();
  const make = () => createKnights(model.scene(), { armor: armor(), max: 2 });
  const k = make();
  assert.ok(k.rig.plates && k.rig.lamesNode, 'the pauldrons and helmets were measured from the model');
  k.setScenery('ruins', flatAt('ruins'));
  k.summon(0, { instant: true });
  const n = k.knights[0];
  const bone = (name) => n.bones.find((b) => b.name === name);
  const run = (seconds, each = null) => { for (let t = 0; t < seconds; t += 1 / 60) { k.update(1 / 60); if (each) each(); } };
  run(1);
  // At rest the plates hang still: no redraws.
  let redraws = 0;
  run(2, () => { if (k.moving) redraws++; });
  assert.equal(redraws, 0, 'resting, no redraws');
  // Through Praise the Sun the pauldrons swing off their pose (a lag, an overshoot: never
  // further than their straps allow), the shadow redrawn meanwhile, and settle after it.
  const strays = () => n.spring.map((x) => x.q.angleTo(x.pose));
  let most = 0, last = -1, f = 0;
  k.gesture('praise', { index: 0 });
  run(GESTURE_TIME.praise + 1.5, () => { f++; if (k.moving) last = f; most = Math.max(most, ...strays()); });
  assert.ok(most > 0.02 && most <= 0.13 + 1e-6, `the plates swing up to ${(most * 180 / Math.PI).toFixed(1)}° off their pose`);
  const after = last / 60 - GESTURE_TIME.praise;
  assert.ok(after > 0.1 && after < 0.8, `the plates settle ${after.toFixed(2)} s after the gesture ends`);
  assert.ok(Math.max(...strays()) < 0.01, 'settled on their pose');
  // Deterministic: two engines stepped the same way swing the same.
  const drive = (e) => {
    e.setScenery('ruins', flatAt('ruins'));
    e.summon(0, { instant: true });
    for (let t = 0; t < 1; t += 1 / 60) e.update(1 / 60);
    e.gesture('hurrah', { index: 0 });
    const out = [];
    for (let t = 0; t < 2.5; t += 1 / 60) { e.update(1 / 60); out.push(e.knights[0].bones.find((b) => b.name === 'pauldronL').quaternion.clone()); }
    return out;
  };
  const a = drive(make()), b = drive(make());
  assert.ok(a.every((q, i) => q.angleTo(b[i]) < 1e-9), 'the same steps, the same swing');
  // Sprung, the pauldrons still stay out of the helmet he wears.
  const HELMS = { great: 'K_Helm_Great', armet: 'K_Helm_Armet', bascinet: 'K_Helm_Bascinet' };
  const soft = { skip: ['K_Mail'] };
  const pts = { dome: model.surface('K_Shoulder_L', 0.03), lames: model.surface('K_Pauldron_L', 0.03) };
  const mirror = (list) => list.map(([x, y, z]) => [-x, y, z]);
  const pieces = [['shoulderL', pts.dome], ['pauldronL', pts.lames], ['shoulderR', mirror(pts.dome)], ['pauldronR', mirror(pts.lames)]];
  const v = new THREE.Vector3(), inv = new THREE.Matrix4();
  for (const helm of HELMETS) {
    const inside = model.inside(HELMS[helm], soft), dist = model.distance(HELMS[helm], soft);
    k.setHelmet(helm, { index: 0, instant: true });
    const deepest = () => {
      n.group.updateMatrixWorld(true);
      inv.copy(bone('head').matrixWorld).invert();
      let d = 0;
      for (const [b, list] of pieces) {
        const m = bone(b).matrixWorld;
        for (const p of list) {
          v.fromArray(p).applyMatrix4(m).applyMatrix4(inv);
          if (inside(v.x, v.y, v.z)) d = Math.max(d, dist(v.x, v.y, v.z));
        }
      }
      return d;
    };
    k.sit(0);
    run(2);
    const rest = deepest();
    let worst = { d: 0, what: '' };
    const check = (what) => { const d = deepest(); if (d > worst.d) worst = { d, what }; };
    for (const g of ['praise', 'shrug', 'hurrah', 'joy', 'dance']) {
      k.gesture(g, { index: 0 });
      let i = 0;
      run(GESTURE_TIME[g] + 0.5, () => { if (i++ % 5 === 0) check(`seated ${g}`); });
    }
    // (The site's dance in his seat: a phone's view.)
    k.headroom = false;
    k.gesture('dance', { index: 0 });
    let j = 0;
    run(DANCE_SEATED_TIME + 0.5, () => { if (j++ % 5 === 0) check('the dance in his seat'); });
    k.headroom = true;
    for (const move of ['headbang', 'swayArms', 'fistPump', 'defaultDance']) {
      k.dance(0, { move, energy: 1, seated: true });
      let i = 0, beat = 0;
      run(3, () => { k.clock((beat += 1 / 30), 0.5); if (i++ % 5 === 0) check(`seated ${move}`); });
    }
    k.sit(0);
    run(1.5);
    assert.ok(worst.d <= Math.max(rest, 0.03) + 0.012, `${helm}: sprung, the deepest a pauldron goes is ${worst.d.toFixed(3)} m (${worst.what}; ${rest.toFixed(3)} at rest)`);
  }
});
