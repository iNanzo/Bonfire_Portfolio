// The rose petals drawn (petals.js moves them): an instanced mesh a shape, each petal's shade an
// instanced attribute (a step lighter or darker through the three reds), never dissolved; and
// each frame the petals up written into their meshes.
import * as THREE from 'three';
import { IDS, PETAL, toon } from './envelopeLook.js';
import { PETAL_SHAPES, POOL, petalGrid } from './petals.js';

/**
 * The petals: an instanced mesh a shape (petals.js petalGrid), each petal's shade an instanced
 * attribute (a step lighter or darker through the three reds); never dissolved.
 * @param {ReturnType<typeof import('./envelopeLook.js').shared>} u
 */
export function buildPetals(u) {
  return PETAL_SHAPES.map((shape, i) => {
    const grid = petalGrid(shape);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(grid.positions, 3));
    geo.setIndex(grid.index);
    const shade = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
    geo.setAttribute('aShade', shade);
    const mat = toon(PETAL, u, IDS.petal + i, { uniforms: { uDissolve: { value: 0 } }, defines: { PETAL: '' } });
    const mesh = new THREE.InstancedMesh(geo, mat, POOL);
    mesh.count = 0;
    mesh.frustumCulled = false;
    return { mesh, shade };
  });
}

const tmp = new THREE.Object3D();

/**
 * Each petal up, as petals.js poses it (in letter widths), into its shape's mesh at `L` world
 * units a letter width.
 * @param {ReturnType<typeof buildPetals>} petals
 * @param {{petal: import('./petals.js').Petal, pose: import('./petals.js').PetalPose}[]} up
 * @param {number} L
 */
export function drawPetals(petals, up, L) {
  const counts = petals.map(() => 0);
  for (const { petal, pose } of up) {
    const k = PETAL_SHAPES.indexOf(petal.shape);
    const n = counts[k]++;
    tmp.position.set(pose.x * L, pose.y * L, pose.z * L);
    tmp.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]);
    tmp.scale.setScalar(pose.scale * L);
    tmp.updateMatrix();
    petals[k].mesh.setMatrixAt(n, tmp.matrix);
    petals[k].shade.setX(n, petal.shade);
  }
  petals.forEach((m, k) => {
    m.mesh.count = counts[k];
    m.mesh.instanceMatrix.needsUpdate = true;
    m.shade.needsUpdate = true;
  });
}
