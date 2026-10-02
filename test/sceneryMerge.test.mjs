// A scenery's still pieces drawn as one mesh per material (src/bonfire/sceneryMerge.js): the
// same triangles where they were, the same material and shadow flags, the glows left alone,
// and the real places down to a handful of meshes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeKey, mergeStatic, mergeSteps } from '../src/bonfire/sceneryMerge.js';
import { buildScenery } from '../src/bonfire/scenery.js';

/** Every triangle of the meshes under `root` (not `skip`), in world space, as sorted strings to 4 dp. */
function worldTriangles(root, skip = new Set()) {
  root.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    const p = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = idx ? idx.count : p.count;
    for (let t = 0; t < n; t += 3) {
      const corners = [];
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(p, idx ? idx.getX(t + k) : t + k).applyMatrix4(o.matrixWorld);
        corners.push(`${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`);
      }
      // (The same triangle, the same way round: rotated to start at its smallest corner.)
      const s = corners.indexOf([...corners].sort()[0]);
      out.push(`${o.material.name}|${[0, 1, 2].map((k) => corners[(s + k) % 3]).join(' ')}`);
    }
  });
  return out.sort();
}

function sample() {
  const stone = new THREE.MeshLambertMaterial({ name: 'stone' });
  const wood = new THREE.MeshLambertMaterial({ name: 'wood' });
  const root = new THREE.Group();
  root.name = 'Scenery_test';
  const place = new THREE.Group();
  place.position.set(1.5, 0, -1);
  place.rotation.y = 0.4;
  place.scale.setScalar(0.8);
  root.add(place);
  const add = (geo, mat, parent, x, y, z, r = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(r, r * 2, -r);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.4, 0.2, 0.3), stone, place, 0, 0.1, 0, 0.1);
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 7), stone, place, 0.5, 0.3, 0);
  add(new THREE.IcosahedronGeometry(0.2), stone, root, -1, 0.2, 0.5, 0.3); // (a triangle soup: no index)
  const stump = add(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 9), wood, root, -1, 0.25, -1);
  stump.scale.set(1, 1.3, 0.9);
  add(new THREE.BoxGeometry(0.1, 0.5, 0.1), wood, place, -0.4, 0.25, 0.2, 0.05);
  const glow = add(new THREE.BoxGeometry(0.2, 0.05, 0.2), new THREE.MeshBasicMaterial({ name: 'glow' }), place, 0, 0.22, 0);
  glow.castShadow = false;
  return { root, place, glow, stone, wood };
}

test('the merge key: the same material, flags and vertex layout merge; anything else stays apart', () => {
  const a = new THREE.MeshLambertMaterial();
  const mk = (geo, mat = a) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.updateMatrixWorld(); return m; };
  const box = mk(new THREE.BoxGeometry());
  assert.equal(mergeKey(box), mergeKey(mk(new THREE.CylinderGeometry())), 'a box and a cylinder in one material: one key');
  assert.equal(mergeKey(box), mergeKey(mk(new THREE.IcosahedronGeometry())), 'indexed or not (the soup gets an index)');
  assert.notEqual(mergeKey(box), mergeKey(mk(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial())), 'another material object');
  const noShadow = mk(new THREE.BoxGeometry());
  noShadow.castShadow = false;
  assert.notEqual(mergeKey(box), mergeKey(noShadow), 'shadow flags');
  const fx = mk(new THREE.BoxGeometry());
  fx.layers.set(3);
  assert.notEqual(mergeKey(box), mergeKey(fx), 'layers');
  const late = mk(new THREE.BoxGeometry());
  late.renderOrder = 2;
  assert.notEqual(mergeKey(box), mergeKey(late), 'draw order');
  const bare = new THREE.BoxGeometry();
  bare.deleteAttribute('uv');
  assert.notEqual(mergeKey(box), mergeKey(mk(bare)), 'another vertex layout');
  const mirrored = mk(new THREE.BoxGeometry());
  mirrored.scale.x = -1;
  mirrored.updateMatrixWorld();
  assert.equal(mergeKey(mirrored), null, 'a mirroring transform (its faces would turn inside out)');
  assert.equal(mergeKey(mk(new THREE.BoxGeometry(), [a, a])), null, 'a material per group');
});

test('merging keeps every triangle where it was, in its material, and leaves the glows alone', () => {
  const { root, place, glow, stone, wood } = sample();
  const before = worldTriangles(root);
  const merged = mergeStatic(root, [glow]);
  assert.equal(merged.length, 2, 'one mesh per material');
  assert.deepEqual(merged.map((m) => m.material).sort((x, y) => x.id - y.id), [stone, wood].sort((x, y) => x.id - y.id));
  for (const m of merged) {
    assert.equal(m.parent, root);
    assert.ok(m.castShadow && m.receiveShadow, 'shadow flags kept');
    assert.ok(m.geometry.index, 'indexed');
    assert.equal(m.geometry.groups.length, 0);
  }
  assert.equal(glow.parent, place, 'the glow stays in its group');
  assert.ok(place.parent === root, 'a group with a glow left in it stays');
  const after = worldTriangles(root);
  assert.equal(after.length, before.length);
  assert.deepEqual(after, before, 'the same triangles, the same way round');
  let meshes = 0;
  root.traverse((o) => { if (o.isMesh) meshes++; });
  assert.equal(meshes, 3, 'two merged meshes and the glow');
});

test('a lone piece in its material is left as it is, and emptied groups go', () => {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  const one = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  g.add(one);
  assert.deepEqual(mergeStatic(root), []);
  assert.equal(one.parent, g, 'nothing to merge it with');
  const m = new THREE.MeshLambertMaterial();
  const g2 = new THREE.Group();
  root.add(g2);
  g2.add(new THREE.Mesh(new THREE.BoxGeometry(), m), new THREE.Mesh(new THREE.BoxGeometry(), m));
  assert.equal(mergeStatic(root).length, 1);
  assert.equal(g2.parent, null, 'its group, emptied, is gone');
  assert.equal(g.parent, root);
});

test('each place is a handful of meshes: its merged solids and its glows', () => {
  const material = (name) => new THREE.MeshLambertMaterial({ name });
  const mat = { stone: material('stone'), pillar: material('pillar'), wood: material('wood'), char: material('char'), wax: material('wax'), mortar: material('mortar') };
  for (const name of ['forge', 'shrine', 'cathedral', 'cult']) {
    const { group, glows } = buildScenery(name, mat, () => new THREE.MeshBasicMaterial());
    const solids = [];
    group.traverse((o) => { if (o.isMesh && !glows.includes(o)) solids.push(o); });
    assert.ok(solids.length <= Object.keys(mat).length, `${name}: ${solids.length} solid meshes, at most one per material`);
    assert.equal(new Set(solids.map((s) => s.material)).size, solids.length, `${name}: one mesh per material`);
    assert.ok(solids.every((s) => s.castShadow && s.receiveShadow), name);
    for (const g of glows) {
      assert.ok(g.parent, `${name}: every glow still in the scenery`);
      assert.ok(!g.castShadow && g.userData.glow, name);
    }
  }
});

test('merged a step at a time (a place built in idle moments), each place ends exactly as merged at once', () => {
  const material = (name) => new THREE.MeshLambertMaterial({ name });
  const mat = { stone: material('stone'), pillar: material('pillar'), wood: material('wood'), char: material('char'), wax: material('wax'), mortar: material('mortar') };
  const glow = () => new THREE.MeshBasicMaterial();
  /** Each mesh in tree order: its name, material, flags and every vertex as stored. */
  const meshes = (group) => {
    const out = [];
    group.traverse((o) => {
      if (o.isMesh) out.push([o.name, o.material.name, o.castShadow, o.receiveShadow, o.parent === group, [...o.geometry.attributes.position.array], [...(o.geometry.index?.array ?? [])]]);
    });
    return out;
  };
  for (const name of ['forge', 'shrine', 'cathedral', 'cult']) {
    const once = buildScenery(name, mat, glow);
    const later = buildScenery(name, mat, glow, { merge: false });
    assert.ok(meshes(later.group).length > meshes(once.group).length, `${name}: left unmerged when asked`);
    const steps = mergeSteps(later.group, later.glows);
    let yields = 0;
    let r = steps.next();
    while (!r.done) { yields++; r = steps.next(); }
    assert.ok(yields > 10, `${name}: in many small steps (${yields})`);
    assert.ok(r.value.length >= 1 && r.value.every((m) => m.parent === later.group), name);
    assert.deepEqual(meshes(later.group), meshes(once.group), `${name}: the same meshes, in the same order, vertex for vertex`);
  }
});
