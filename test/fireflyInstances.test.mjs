// The fireflies drawn as instances (src/bonfire/fireflies.js place()): one InstancedMesh per
// part and one for the halos, each instance's matrix the part's view-space matrix (what
// three.js would have used as its own mesh's modelViewMatrix), the lantern and halo tints,
// and the halos back to front, a fly's inner halo before its outer one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFireflies } from '../src/bonfire/fireflies.js';

function template() {
  const t = new THREE.Object3D();
  t.name = 'Firefly';
  const part = (name, geo, color, pos) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.name = name;
    m.position.set(...pos);
    t.add(m);
    return m;
  };
  part('Firefly_Body', new THREE.BoxGeometry(0.01, 0.01, 0.03), 0x222222, [0, 0, 0]);
  part('Firefly_Lantern', new THREE.SphereGeometry(1, 4, 3), 0xffaa00, [0, 0, -0.014]).scale.set(0.01, 0.009, 0.021);
  part('Firefly_Wings', new THREE.PlaneGeometry(0.03, 0.01), 0x666666, [0, 0.004, 0]).scale.set(0.35, 1, 1);
  return t;
}
const terrain = {
  height: () => 0,
  top: () => 0,
  solid: () => 0,
  slope: (x, z, out) => out.set(0, 0, 0),
  wallSpots: [],
  cell: 0.04,
};

function setup() {
  const flies = createFireflies(template(), {
    count: 6,
    litCount: 3,
    lightCount: 2,
    center: new THREE.Vector3(),
    layer: 2,
    terrain,
    raycast: () => null,
  });
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 40);
  camera.position.set(0.4, 1.6, 6);
  camera.lookAt(0, 0.8, 0);
  for (let i = 0; i < 40; i++) flies.update(1 / 60, i / 60, camera, { present: false }, null);
  flies.pulse(1); // (every one lit, its halos showing)
  flies.update(1 / 60, 41 / 60, camera, { present: false }, null);
  camera.position.x += 0.3; // (the camera moves after the update, before the draw)
  flies.place(camera);
  return { flies, camera };
}
const f32 = (m) => Float32Array.from(m.elements);
const at = (mesh, i) => mesh.instanceMatrix.array.slice(i * 16, i * 16 + 16);

test("four draws for all the flies (five a fly before): a mesh per part and one for the halos, on the flies' layer", () => {
  const { flies } = setup();
  const meshes = flies.group.children.filter((o) => o.isInstancedMesh);
  assert.equal(meshes.length, 4, 'body, lantern, wings, halos');
  assert.equal(flies.group.children.filter((o) => o.isPointLight).length, 2, 'the lights stay');
  assert.ok(meshes.every((m) => m.layers.mask === 1 << 2));
  assert.equal(meshes.at(-1).renderOrder, 2, 'the halos last');
  assert.ok(meshes.at(-1).material.transparent && meshes.at(-1).material.blending === THREE.AdditiveBlending);
});

test("each part's instance holds its view-space matrix, for the camera as it is at the draw", () => {
  const { flies, camera } = setup();
  const [body, lantern, wings] = flies.group.children.filter((o) => o.isInstancedMesh);
  for (const m of [body, lantern, wings])
    assert.deepEqual(m.matrixWorld.elements, camera.matrixWorld.elements, 'standing at the camera');
  flies.flies.forEach((f, i) => {
    f.obj.updateMatrixWorld(true);
    [body, lantern, wings].forEach((m, p) => {
      const mv = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, f.rig[p].matrixWorld);
      assert.deepEqual(at(m, i), f32(mv), `fly ${i}, part ${p}`);
    });
    const tint = lantern.geometry.attributes.tint;
    assert.deepEqual(
      [tint.getX(i), tint.getY(i), tint.getZ(i), tint.getW(i)],
      [...Float32Array.from([f.lanternColor.r, f.lanternColor.g, f.lanternColor.b, 1])],
    );
  });
});

test('the halos showing, back to front as three.js sorts see-through meshes, each with its tint', () => {
  const { flies, camera } = setup();
  const halos = flies.group.children.filter((o) => o.isInstancedMesh).at(-1);
  const on = flies.flies.filter((f) => f.haloOn);
  assert.ok(on.length > 0);
  assert.equal(halos.count, on.length * 2);
  const proj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const center = halos.geometry.boundingSphere.center;
  // Which halo each instance is: match its matrix.
  const seen = [];
  for (let j = 0; j < halos.count; j++) {
    const m = at(halos, j);
    let hit = null;
    flies.flies.forEach((f, i) =>
      f.halos.forEach((h, k) => {
        if (
          m.every(
            (v, e) => v === f32(new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, h.matrixWorld))[e],
          )
        )
          hit = { i, k, f, h };
      }),
    );
    assert.ok(hit, `instance ${j} is a halo`);
    const z = new THREE.Vector4().copy(center).applyMatrix4(hit.h.matrixWorld).applyMatrix4(proj).z;
    seen.push({ ...hit, z });
    const tint = halos.geometry.attributes.tint;
    assert.equal(tint.getW(j), Math.fround(hit.f.haloOpacity[hit.k]), 'its opacity');
    assert.equal(tint.getX(j), Math.fround(hit.f.haloColor[hit.k].r));
  }
  for (let j = 1; j < seen.length; j++) {
    const a = seen[j - 1],
      b = seen[j];
    assert.ok(
      a.z > b.z || (a.z === b.z && a.i * 2 + a.k < b.i * 2 + b.k),
      'farther first; on a tie, the one made first',
    );
  }
  for (const f of on) assert.equal(seen.filter((s) => s.f === f).length, 2, "both of a lit fly's halos");
  // Dark ones show no halo at all.
  for (const f of flies.flies) f.haloOn = false;
  flies.place(camera);
  assert.equal(halos.count, 0);
  assert.equal(halos.visible, false);
});
