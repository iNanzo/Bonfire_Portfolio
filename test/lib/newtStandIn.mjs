// A stand-in for NEWT for the character tests (test/invitationCharacter*.test.mjs), three.js in
// Node: his 17 bones (clips.js BONES) and a skinned box bound to them, like newt.glb's scene; the
// same with a face quad in NEWT_Face's material on his head; a renderer's viewport and a camera
// in front of a point, as his meshes' onBeforeRender see them.
import * as THREE from 'three';
import { BONES } from '../../src/invitation/clips.js';

/**
 * A stand-in for newt.glb's scene: a Hip group holding the 17 bones (three's names, model
 * units) and one skinned box bound to them, like the glb's meshes.
 */
export function standIn(animations = []) {
  const at = {
    [BONES.hips]: [null, 0, 1.82, 0],
    [BONES.spare]: [BONES.hips, 0, 0.417, 0],
    [BONES.chest]: [BONES.hips, 0.1, 0.417, 0],
    [BONES.neck]: [BONES.chest, 0, 1.445, 0],
    [BONES.head]: [BONES.neck, 0, 0.3, 0],
    [BONES.shoulderL]: [BONES.chest, 0.25, 1.34, 0],
    [BONES.bicepL]: [BONES.shoulderL, 0, 0.37, 0],
    [BONES.forearmL]: [BONES.bicepL, 0, 0.59, 0],
    [BONES.shoulderR]: [BONES.chest, -0.25, 1.34, 0],
    [BONES.bicepR]: [BONES.shoulderR, 0, 0.37, 0],
    [BONES.forearmR]: [BONES.bicepR, 0, 0.59, 0],
    [BONES.thighL]: [BONES.hips, 0.4, 0.18, 0],
    [BONES.calfL]: [BONES.thighL, 0, -0.65, 0],
    [BONES.footL]: [BONES.calfL, 0, -0.97, 0],
    [BONES.thighR]: [BONES.hips, -0.4, 0.18, 0],
    [BONES.calfR]: [BONES.thighR, 0, -0.65, 0],
    [BONES.footR]: [BONES.calfR, 0, -0.97, 0],
  };
  const bones = {};
  for (const [name, [parent, x, y, z]] of Object.entries(at)) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) bones[parent].add(b);
    bones[name] = b;
  }
  const hip = new THREE.Group();
  hip.name = 'Hip';
  hip.add(bones[BONES.hips]);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const n = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(
      Float32Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
      4,
    ),
  );
  const map = new THREE.Texture();
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ name: 'NEWT_Atlas', map }));
  mesh.name = 'Body';
  hip.add(mesh);
  const scene = new THREE.Group();
  scene.add(hip);
  mesh.bind(new THREE.Skeleton(Object.values(bones)));
  return { gltf: { scene, animations }, bones, mesh, map };
}

/**
 * The stand-in with a face: a quad bound to his head bone (a plain mesh under it) in
 * NEWT_Face's material, 3 model units across one cell of the face sheet at the eyes (u 0..0.5
 * over x 0..3: faceSheets.js faceSpan), facing +z.
 */
export function withFace() {
  const s = standIn();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 3, 0, 0, 0, -6, 0, 3, -6, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, 0.5, 0.5, 0.5], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  const face = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'NEWT_Face' }));
  face.name = 'Face';
  s.bones[BONES.head].add(face);
  return { ...s, face };
}
/** A renderer as onBeforeRender sees it: only its viewport (the colour target's texels). */
export const viewportOf = (w, h) => ({ getCurrentViewport: (v) => v.set(0, 0, w, h) });
/** The camera `d` world units in front of a point, looking at it (20° of view, a phone's shape). */
export function cameraAt(p, d) {
  const camera = new THREE.PerspectiveCamera(20, 195 / 422, 0.5, 400);
  camera.position.set(p.x, p.y, p.z + d);
  camera.lookAt(p);
  camera.updateMatrixWorld();
  return camera;
}
