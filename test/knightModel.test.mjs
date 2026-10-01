// The committed knight model (public/models/knight.glb, built by tools/knight.py): the
// rig the site poses by name (with the pauldrons' lames on their own joints), the three
// helmets, the material roles the armor shader looks up (K_Trim marks round 8's gilt bands:
// only the Black & Gold style draws them gilt, knightStyles.js), the rest pose's size and
// facing, and the triangle budgets; and the first build (public/models/knight-first.glb,
// the First Build style's) on the same rig. Read straight from the GLB's JSON chunk (Draco
// needs a Worker, so no loader here); and the pixel styles' surfaces built from it (the
// decoded model: test/lib/knightMesh.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/** A GLB's JSON chunk. */
function readGlb(path) {
  const buf = fs.readFileSync(new URL(path, import.meta.url));
  assert.equal(buf.toString('latin1', 0, 4), 'glTF', 'a binary glTF');
  return JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
}
const gltf = readGlb('../public/models/knight.glb');

const nodes = gltf.nodes;
const byName = new Map(nodes.map((n, i) => [n.name, i]));
const parent = new Map();
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
const parentName = (name) => nodes[parent.get(byName.get(name))]?.name;

// joint -> parent, as in docs/knight.md
const RIG = { K_Hips: 'Knight', K_Spine: 'K_Hips', K_Chest: 'K_Spine', K_Neck: 'K_Chest', K_Head: 'K_Neck' };
for (const s of ['L', 'R']) {
  Object.assign(RIG, {
    [`K_Shoulder_${s}`]: 'K_Chest', [`K_Pauldron_${s}`]: `K_Shoulder_${s}`, [`K_UpperArm_${s}`]: `K_Shoulder_${s}`, [`K_Forearm_${s}`]: `K_UpperArm_${s}`,
    [`K_Hand_${s}`]: `K_Forearm_${s}`, [`K_Fingers_${s}`]: `K_Hand_${s}`,
    [`K_Tasset_${s}`]: 'K_Hips', [`K_Thigh_${s}`]: 'K_Hips', [`K_Shin_${s}`]: `K_Thigh_${s}`, [`K_Foot_${s}`]: `K_Shin_${s}`,
  });
}
const HELMS = ['K_Helm_Great', 'K_Helm_Armet', 'K_Helm_Bascinet'];
// The roles in the file: armor.js ROLES, in its order (the shader's role index).
const ROLES = ['K_Plate', 'K_Edge', 'K_Trim', 'K_Mail', 'K_Leather', 'K_Cloth', 'K_Void'];

/** Rest-pose world position of a node (the rig has no rotations or scales at rest). */
function worldPos(name) {
  const p = [0, 0, 0];
  for (let i = byName.get(name); i !== undefined; i = parent.get(i)) {
    const t = nodes[i].translation ?? [0, 0, 0];
    p[0] += t[0]; p[1] += t[1]; p[2] += t[2];
  }
  return p;
}

/** Bounds of a joint's mesh in world space, from the POSITION accessors' min/max. */
function meshBounds(joint) {
  const mesh = gltf.meshes[nodes[byName.get(`${joint}_Mesh`)].mesh];
  const at = worldPos(joint);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.primitives) {
    const acc = gltf.accessors[prim.attributes.POSITION];
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], acc.min[k] + at[k]);
      max[k] = Math.max(max[k], acc.max[k] + at[k]);
    }
  }
  return { min, max };
}

const triangles = (name) => gltf.meshes[nodes[byName.get(name)].mesh].primitives
  .reduce((sum, prim) => sum + gltf.accessors[prim.indices].count / 3, 0);

test('the rig: every joint under its parent, the root marked as the knight', () => {
  const root = nodes[byName.get('Knight')];
  assert.ok(root, 'a Knight root');
  assert.equal(root.extras?.kind, 'knight');
  assert.ok(gltf.scenes[gltf.scene ?? 0].nodes.includes(byName.get('Knight')), 'the root is in the scene');
  for (const [joint, par] of Object.entries(RIG)) {
    assert.ok(byName.has(joint), `${joint} exists`);
    assert.equal(parentName(joint), par, `${joint} hangs from ${par}`);
    assert.equal(nodes[byName.get(joint)].mesh, undefined, `${joint} is an empty`);
    assert.equal(nodes[byName.get(joint)].rotation, undefined, `${joint} has no rest rotation`);
  }
});

test("each joint's pieces are one mesh on the joint, with no offset", () => {
  for (const joint of [...Object.keys(RIG), ...HELMS]) {
    const name = `${joint}_Mesh`;
    const node = nodes[byName.get(name)];
    assert.ok(node && node.mesh !== undefined, `${name} is a mesh`);
    assert.equal(parentName(name), joint, `${name} sits on ${joint}`);
    for (const key of ['translation', 'rotation', 'scale']) assert.equal(node[key], undefined, `${name} has no ${key}`);
  }
});

test('three helmets on the head, at the head pivot', () => {
  for (const helm of HELMS) {
    assert.equal(parentName(helm), 'K_Head', `${helm} is on the head`);
    assert.deepEqual(nodes[byName.get(helm)].translation ?? [0, 0, 0], [0, 0, 0], `${helm} is at the pivot`);
  }
});

test('materials are the armor roles, and no weapon names leak in', async () => {
  const names = gltf.materials.map((m) => m.name).sort();
  assert.deepEqual(names, [...ROLES].sort());
  // Every role in the file is one the armor shader knows, at the index it expects.
  const armor = await import('../src/bonfire/armor.js');
  assert.deepEqual(armor.ROLES, ROLES);
  for (const r of ROLES) assert.equal(armor.ROLES[armor.roleOf(r)], r, `${r} is a known role`);
  for (const n of nodes) assert.ok(!n.name.startsWith('Weapon_'), `${n.name} is not a weapon`);
  for (const n of nodes) assert.match(n.name, /^[A-Za-z0-9_]+$/, `${n.name} survives three's name sanitizing`);
});

test('the pauldrons: the dome on the shoulder, its two lames on their own joint at the socket', () => {
  for (const s of ['L', 'R']) {
    assert.deepEqual(worldPos(`K_Pauldron_${s}`), worldPos(`K_Shoulder_${s}`), `K_Pauldron_${s} pivots at the socket`);
    const dome = meshBounds(`K_Shoulder_${s}`);
    const lames = meshBounds(`K_Pauldron_${s}`);
    const arm = meshBounds(`K_UpperArm_${s}`);
    // The dome caps the shoulder; the lames hang below its top, over the arm; the third
    // lame (on the upper arm) lower still.
    assert.ok(dome.max[1] > lames.max[1] + 0.05, `the dome (${dome.max[1].toFixed(3)}) over the lames (${lames.max[1].toFixed(3)})`);
    assert.ok(lames.min[1] > arm.min[1], 'the lames above the rest of the arm');
    const out = s === 'L' ? 1 : -1;
    assert.ok(out * (lames.max[0] + lames.min[0]) / 2 > out * worldPos(`K_Shoulder_${s}`)[0], 'the lames wrap the outside of the arm');
    assert.ok(triangles(`K_Pauldron_${s}_Mesh`) > 20 && triangles(`K_Pauldron_${s}_Mesh`) < 400, 'two lames');
  }
});

test('the rest pose: about 1.72 m, feet on the ground, centered, facing +z, left arm on +x', () => {
  const great = meshBounds('K_Helm_Great');
  assert.ok(Math.abs(great.max[1] - 1.72) < 0.03, `great helm top ${great.max[1].toFixed(3)}`);
  for (const helm of HELMS) {
    const b = meshBounds(helm);
    assert.ok(b.max[1] > 1.68 && b.max[1] < 1.8, `${helm} top ${b.max[1].toFixed(3)}`);
  }
  for (const s of ['L', 'R']) {
    const foot = meshBounds(`K_Foot_${s}`);
    assert.ok(Math.abs(foot.min[1]) < 0.01, `${s} foot on the ground (${foot.min[1].toFixed(3)})`);
    assert.ok(foot.max[2] > 0.2, `${s} toes point to +z (${foot.max[2].toFixed(3)})`);
  }
  assert.ok(worldPos('K_Shoulder_L')[0] > 0.1 && worldPos('K_Shoulder_R')[0] < -0.1, 'the left side is +x');
  const l = worldPos('K_Hand_L');
  const r = worldPos('K_Hand_R');
  assert.ok(Math.abs(l[0] + r[0]) < 1e-4 && Math.abs(l[1] - r[1]) < 1e-4, 'mirror-symmetric');
  assert.ok(worldPos('K_Shin_L')[1] < worldPos('K_Thigh_L')[1] && worldPos('K_Foot_L')[1] < 0.15, 'knee and ankle heights');
});

test('triangle budgets: body about 5000, each helmet 900', () => {
  const body = Object.keys(RIG).filter((j) => j !== 'Knight').reduce((sum, j) => sum + triangles(`${j}_Mesh`), 0);
  assert.ok(body <= 5000, `body ${body} triangles`);
  for (const helm of HELMS) assert.ok(triangles(`${helm}_Mesh`) <= 900, `${helm} ${triangles(`${helm}_Mesh`)} triangles`);
});

test("the trim (K_Trim): round 8's gilt bands, on the chest, hips, pauldron domes, cuffs, ankles and two helmets", () => {
  const trimOf = (name) => gltf.meshes[nodes[byName.get(name)].mesh].primitives
    .filter((prim) => gltf.materials[prim.material].name === 'K_Trim')
    .reduce((sum, prim) => sum + gltf.accessors[prim.indices].count / 3, 0);
  for (const name of ['K_Chest_Mesh', 'K_Hips_Mesh', 'K_Shoulder_L_Mesh', 'K_Shoulder_R_Mesh', 'K_Hand_L_Mesh', 'K_Hand_R_Mesh',
    'K_Shin_L_Mesh', 'K_Shin_R_Mesh', 'K_Helm_Great_Mesh', 'K_Helm_Armet_Mesh']) {
    assert.ok(trimOf(name) > 0, `${name} has its trim`);
  }
  assert.equal(trimOf('K_Helm_Bascinet_Mesh'), 0, 'the bascinet had none');
  assert.equal(trimOf('K_Pauldron_L_Mesh'), 0, 'nor the lames');
});

test('the first build (knight-first.glb): the same rig, less the pauldron joints, with its own trim', () => {
  const first = readGlb('../public/models/knight-first.glb');
  const fNodes = first.nodes;
  const fIndex = new Map(fNodes.map((n, i) => [n.name, i]));
  const fParent = new Map();
  fNodes.forEach((n, i) => (n.children ?? []).forEach((c) => fParent.set(c, i)));
  const fPos = (name) => {
    const p = [0, 0, 0];
    for (let i = fIndex.get(name); i !== undefined; i = fParent.get(i)) {
      const t = fNodes[i].translation ?? [0, 0, 0];
      p[0] += t[0]; p[1] += t[1]; p[2] += t[2];
    }
    return p;
  };
  for (const joint of [...Object.keys(RIG), ...HELMS]) {
    if (joint.startsWith('K_Pauldron_')) { assert.ok(!fIndex.has(joint), `${joint}: not in the first build (its lames ride the dome)`); continue; }
    assert.ok(fIndex.has(joint), `${joint} exists`);
    const a = worldPos(joint), b = fPos(joint);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-4, `${joint} where the knight's is (the styles share one rig)`);
  }
  const names = first.materials.map((m) => m.name);
  assert.ok(names.includes('K_Trim'), 'the first build has its trim');
  for (const n of names) assert.ok(ROLES.includes(n), `${n} is a role`);
});

test("the pixel styles' surfaces, built from the model: smooth rounded plates, their ids, merges, flatness and occlusion", async () => {
  const THREE = await import('three');
  const { loadKnightMesh } = await import('./lib/knightMesh.mjs');
  const { createKnights } = await import('../src/bonfire/knights.js');
  const { createArmorShared } = await import('../src/bonfire/armor.js');
  const { BONES } = await import('../src/bonfire/knightPose.js');
  const model = await loadKnightMesh();
  const armor = createArmorShared({ fireAt: new THREE.Vector3(0, 0.95, 0.28), exposure: { value: 1 } });
  const [body, ...helms] = createKnights(model.scene(), { armor, max: 1 }).geometries;
  for (const g of [body, ...helms]) {
    const { aSmooth, aPatchN, aPatch, aOcc, position } = g.attributes;
    for (const a of [aSmooth, aPatchN, aPatch, aOcc]) assert.equal(a.count, position.count, 'on every corner');
    for (let i = 0; i < position.count; i++) {
      assert.ok(Math.abs(Math.hypot(aSmooth.getX(i), aSmooth.getY(i), aSmooth.getZ(i)) - 1) < 1e-3, 'a smooth normal');
      assert.ok(Math.abs(Math.hypot(aPatchN.getX(i), aPatchN.getY(i), aPatchN.getZ(i)) - 1) < 1e-3, "its patch's mean normal");
      const [id, merge, size, flat] = [aPatch.getX(i), aPatch.getY(i), aPatch.getZ(i), aPatch.getW(i)];
      assert.ok(Number.isInteger(id) && id >= 0 && id < 64 && Number.isInteger(merge) && merge >= 0 && merge < 64, 'ids 0..63');
      assert.ok(size > 0, 'a size');
      assert.ok(flat >= 0 && flat <= 1, 'a flatness 0..1');
      if (size >= 0.07) assert.equal(merge, id, "a patch that isn't slight keeps its id");
      assert.ok(aOcc.getX(i) >= 0 && aOcc.getX(i) <= 1, 'occlusion 0..1');
    }
  }
  // Per joint: the fingers' slight faces merge (no line between them far off); the neck under
  // the helm is more buried than the pauldron domes open to the sky.
  const bone = body.attributes.skinIndex, pa = body.attributes.aPatch, occ = body.attributes.aOcc;
  const mean = (b) => { let s = 0, n = 0; for (let i = 0; i < bone.count; i++) if (BONES[bone.getX(i)] === b) { s += occ.getX(i); n++; } return s / n; };
  const merged = new Set();
  for (let i = 0; i < bone.count; i++) if (BONES[bone.getX(i)] === 'fingersR' && pa.getX(i) !== pa.getY(i)) merged.add(pa.getX(i));
  assert.ok(merged.size >= 4, `the fingers' faces merge (${merged.size})`);
  assert.ok(mean('neck') > mean('shoulderL') + 0.2, `the gorget is buried under the helm (${mean('neck').toFixed(2)} vs ${mean('shoulderL').toFixed(2)})`);
  // A curved plate is one smooth surface: the helm's corners, pillowed, turn more ways than its facets.
  const great = helms[0].attributes;
  // How flat each patch is (the pixel styles shade a plate that isn't a ring across itself):
  // the pauldrons' domes are domes, the great helm's crown is flat, a cuisse is a ring round
  // the thigh.
  const flatOf = (g, keep) => { let lo = 1, hi = 0; for (let i = 0; i < g.aPatch.count; i++) if (keep(i)) { lo = Math.min(lo, g.aPatch.getW(i)); hi = Math.max(hi, g.aPatch.getW(i)); } return [lo, hi]; };
  const biggestOn = (b) => { let best = -1, id = -1; for (let i = 0; i < bone.count; i++) if (BONES[bone.getX(i)] === b && pa.getZ(i) > best) { best = pa.getZ(i); id = pa.getX(i); } return id; };
  for (const b of ['shoulderL', 'shoulderR']) {
    const id = biggestOn(b);
    const [lo, hi] = flatOf(body.attributes, (i) => BONES[bone.getX(i)] === b && pa.getX(i) === id);
    assert.ok(lo > 0.35 && hi < 0.65, `${b}'s dome is curved, not flat or a ring (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  }
  const thigh = biggestOn('thighL');
  assert.ok(flatOf(body.attributes, (i) => BONES[bone.getX(i)] === 'thighL' && pa.getX(i) === thigh)[1] < 0.2, 'the cuisse is a ring');
  let crownY = -Infinity;
  for (let i = 0; i < great.position.count; i++) crownY = Math.max(crownY, great.position.getY(i));
  const onTop = (i) => great.position.getY(i) > crownY - 1e-3;
  const crown = (i) => { const f = i - (i % 3); return onTop(f) && onTop(f + 1) && onTop(f + 2); };
  assert.ok(flatOf(great, crown)[0] > 0.99, "the great helm's crown is flat");
  const dirs = new Set();
  for (let i = 0; i < great.aSmooth.count; i++) dirs.add([great.aSmooth.getX(i), great.aSmooth.getY(i), great.aSmooth.getZ(i)].map((v) => v.toFixed(2)).join());
  const flat = new Set();
  for (let i = 0; i < great.normal.count; i++) flat.add([great.normal.getX(i), great.normal.getY(i), great.normal.getZ(i)].map((v) => v.toFixed(2)).join());
  assert.ok(dirs.size > flat.size, `smooth normals vary over the plates (${dirs.size} vs ${flat.size} facet normals)`);
});
