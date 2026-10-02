// A scenery's still pieces drawn as one mesh per material (scenery.js buildScenery calls it
// last, or sceneScenery.js in steps). The forge, shrine, cathedral and cult are built from dozens of small pieces (a
// course of blocks is a box per block), and every mesh is a draw of its own in each pass
// that sees it: the normals, the color, and each of the fire's six shadow faces it falls in.
// Merged, a place costs a handful of draws instead of a hundred or more, every frame.
//
// What changes nothing on screen: each piece's place, turn and scale are baked into its
// vertices (the same triangles, where they were); the merged mesh keeps the pieces' material,
// shadow flags and layers, so it outlines, lights and casts as they did; and it stays one of
// the place's solids (sceneScenery.js), so the fireflies' height map and their raycasts still see
// every face. What isn't merged: the glows (sceneUpdate.js recolors each one, and the candle
// flames stretch), and anything in `keep`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * What must be the same for two meshes to be drawn as one: the material (the same object),
 * how they're drawn (shadows, layers, order, culling, shown) and the shape of their vertex
 * data (the same attributes, each the same size and type). Null for a mesh that can't be
 * merged (several materials, morphs, skinning, instancing, or a mirroring transform, which
 * would turn its faces inside out).
 * @param {THREE.Mesh} mesh
 * @param {THREE.Matrix4} [matrix]  its transform into the merged mesh's space
 * @returns {string | null}
 */
export function mergeKey(mesh, matrix = mesh.matrixWorld) {
  const g = mesh.geometry;
  const m = mesh.material;
  if (!g || !m || Array.isArray(m) || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh) return null;
  if (Object.keys(g.morphAttributes).length || matrix.determinant() <= 0) return null;
  const attrs = Object.keys(g.attributes).sort().map((name) => {
    const a = g.attributes[name];
    return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
  });
  return [m.uuid, mesh.castShadow, mesh.receiveShadow, mesh.layers.mask, mesh.renderOrder, mesh.frustumCulled, mesh.visible, ...attrs].join('|');
}

/**
 * Merge `group`'s still pieces per mergeKey: each set of two or more becomes one mesh, a
 * child of `group` with its transform baked in; the pieces leave the tree, and groups left
 * empty go too. `keep` (the glows) are left as they are. Returns the merged meshes.
 * @param {THREE.Object3D} group
 * @param {Iterable<THREE.Object3D>} [keep]
 * @returns {THREE.Mesh[]}
 */
export function mergeStatic(group, keep = []) {
  const steps = mergeSteps(group, keep);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/**
 * mergeStatic a little at a time, for a place built in idle moments (sceneScenery.js): it yields
 * after each piece and each merge, and returns the merged meshes. Between steps the group is
 * half merged (not to be shown till it's done); the end is mergeStatic's, mesh for mesh.
 * @param {THREE.Object3D} group
 * @param {Iterable<THREE.Object3D>} [keep]
 * @returns {Generator<void, THREE.Mesh[], void>}
 */
export function* mergeSteps(group, keep = []) {
  const kept = new Set(keep);
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  /** @type {Map<string, { mesh: THREE.Mesh, matrix: THREE.Matrix4 }[]>} */
  const sets = new Map();
  group.traverse((o) => {
    const mesh = /** @type {THREE.Mesh} */ (o);
    if (!mesh.isMesh || kept.has(mesh) || mesh === group) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(toGroup, mesh.matrixWorld);
    const key = mergeKey(mesh, matrix);
    if (key === null) return;
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push({ mesh, matrix });
  });
  const merged = [];
  for (const pieces of sets.values()) {
    if (pieces.length < 2) continue;
    // (Every piece indexed, so the triangle soups (rocks) join the boxes and cylinders: an
    // index of 0, 1, 2… draws the same triangles in the same order.)
    const geometries = [];
    for (const { mesh, matrix } of pieces) {
      const g = mesh.geometry.clone().applyMatrix4(matrix);
      g.clearGroups(); // (a box's or a cylinder's groups are for a material per face: one material draws them all)
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      geometries.push(g);
      yield;
    }
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!geometry) continue;
    const first = pieces[0].mesh;
    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.name = `${group.name || 'Merged'}_${merged.length}`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.layers.mask = first.layers.mask;
    mesh.renderOrder = first.renderOrder;
    mesh.frustumCulled = first.frustumCulled;
    mesh.visible = first.visible;
    for (const { mesh: piece } of pieces) {
      piece.removeFromParent();
      piece.geometry.dispose();
    }
    group.add(mesh);
    merged.push(mesh);
    yield;
  }
  // (Groups whose pieces all went into merged meshes are left empty: they go too.)
  const prune = (o) => {
    for (const c of [...o.children]) prune(c);
    if (o !== group && !o.isMesh && !o.isLight && o.type === 'Group' && o.children.length === 0) o.removeFromParent();
  };
  prune(group);
  group.updateMatrixWorld(true);
  return merged;
}
