// NEWT's character (src/invitation/character.js) with three.js in Node: a stand-in skeleton
// named like clips.js BONES, synthetic quaternion clips, no WebGL. The look is applied on top
// of the saved animation pose, so it never adds up from frame to frame (three's PropertyMixer
// skips writing a channel whose value didn't change, as a clamped one-shot's doesn't); weights
// go to the actions as given; Walk and Run follow the shared step phase while Idle keeps its
// own clock; restarting a clip that still shows hands its old pose to a twin that fades out (no
// pop); the collar is read from the current matrices, so carrying can anchor him by it. With
// the pixel filter on: his face's sheet is picked by his half face in texels (held through a
// small change; faceSheet says the smooth one shows at Off), what's on his head moves onto the
// texel grid by his head's centre and the rest of him by his feet, and his atlas is the pixel
// one (nearest, no mipmaps), the glb's own at Off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ORIGINAL_ATLAS_TEXELS, createCharacter, pixelAtlasUrl } from '../src/invitation/character.js';
import { FACE_IMAGE, pickFaceSize } from '../src/invitation/faceSheets.js';
import { LOOKS } from '../src/invitation/look.js';
import { TOON_CELLS, toonRamp } from '../src/invitation/shader.js';
import { TWIN } from '../src/invitation/play.js';
import { BONES, COLLAR, SCALE } from '../src/invitation/clips.js';

const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);
/**
 * The angle between two rotations, in radians: from the chord between the unit quaternions
 * (|a − b| = 2 sin(θ/4)), which holds up for tiny angles where acos of the dot doesn't (a
 * clip's keys are 32-bit floats, a hair off unit length).
 */
function angle(a, b) {
  const u = a.clone().normalize();
  const v = b.clone().normalize();
  const d = (s) => Math.hypot(u.x - s * v.x, u.y - s * v.y, u.z - s * v.z, u.w - s * v.w);
  return 4 * Math.asin(Math.min(1, Math.min(d(1), d(-1)) / 2));
}

/**
 * A stand-in for newt.glb's scene: a Hip group holding the 17 bones (three's names, model
 * units) and one skinned box bound to them, like the glb's meshes.
 */
function standIn(animations = []) {
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

/** A clip turning one bone between keyed rotations. */
function clip(name, length, bone, times, quats) {
  return new THREE.AnimationClip(name, length, [
    new THREE.QuaternionKeyframeTrack(
      `${bone}.quaternion`,
      times,
      quats.flatMap((v) => v.toArray()),
    ),
  ]);
}
/** A clip holding one bone still in one rotation. */
const still = (name, length, bone, rot) => clip(name, length, bone, [0, length], [rot, rot]);

test('the look restore stops it adding up across frames, even on a clamped one-shot', () => {
  const end = q(X, 25);
  const wave = clip('Wave', 1.5, BONES.head, [0, 1.5], [q(X, 0), end]);
  const { gltf, bones } = standIn([wave]);
  const ch = createCharacter(gltf);
  const head = bones[BONES.head];
  ch.setWeights({ Wave: 1 }, 0);
  ch.restart('Wave');
  const seen = [];
  for (let i = 0; i < 240; i++) {
    ch.update(1 / 60);
    ch.applyLook(0.5, 0.2, 1);
    seen.push(head.quaternion.clone());
  }
  // (Wave ends at frame 90 and clamps there: the mixer stops writing the head's channel.)
  assert.ok(
    angle(seen[120], seen[239]) < 1e-6,
    `the head holds still once Wave has ended (${angle(seen[120], seen[239])})`,
  );
  // Weight 0 hands back the clip's own last pose, exactly.
  ch.update(1 / 60);
  ch.applyLook(0.5, 0.2, 0);
  assert.ok(angle(head.quaternion, end) < 1e-6, 'with no look, the head is in the clip’s pose');
  // And the placeholder (no clips at all) doesn't add up either.
  const bare = standIn();
  const b = createCharacter(bare.gltf);
  const bh = bare.bones[BONES.head];
  b.update(1 / 60);
  b.applyLook(0.4, -0.1, 1);
  const first = bh.quaternion.clone();
  for (let i = 0; i < 30; i++) {
    b.update(1 / 60);
    b.applyLook(0.4, -0.1, 1);
  }
  assert.ok(angle(first, bh.quaternion) < 1e-6, 'with no clips, the look stays the same look');
});

test('the look turns his head by the yaw and pitch asked, relative to his root, 30% at the neck', () => {
  for (const rootYaw of [0, Math.PI / 2]) {
    const { gltf, bones } = standIn([still('Idle', 2, BONES.head, q(X, 10))]);
    const ch = createCharacter(gltf);
    ch.root.rotation.y = rootYaw;
    ch.root.updateMatrixWorld(true);
    ch.setWeights({ Idle: 1 }, 0);
    ch.update(1 / 60);
    ch.applyLook(0, 0, 0);
    const rest = bones[BONES.head].getWorldQuaternion(new THREE.Quaternion());
    const neckRest = bones[BONES.neck].getWorldQuaternion(new THREE.Quaternion());
    ch.update(1 / 60);
    ch.applyLook(0.5, 0.2, 1);
    const looked = bones[BONES.head].getWorldQuaternion(new THREE.Quaternion());
    // The rotation the look added, in his root's frame, turns his forward to that yaw and pitch.
    const added = looked.clone().multiply(rest.clone().invert());
    const rootQ = ch.root.getWorldQuaternion(new THREE.Quaternion());
    const local = rootQ.clone().invert().multiply(added).multiply(rootQ);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(local);
    assert.ok(
      Math.abs(Math.atan2(fwd.x, fwd.z) - 0.5) < 1e-6,
      `yaw ${Math.atan2(fwd.x, fwd.z)} at root yaw ${rootYaw}`,
    );
    assert.ok(Math.abs(Math.asin(fwd.y) - 0.2) < 1e-6, `pitch ${Math.asin(fwd.y)} at root yaw ${rootYaw}`);
    // The neck carries 30% of the turn.
    const neck = bones[BONES.neck].getWorldQuaternion(new THREE.Quaternion());
    const neckTurn = angle(neck, neckRest);
    const total = angle(looked, rest);
    assert.ok(Math.abs(neckTurn / total - 0.3) < 1e-3, `the neck turns ${neckTurn / total} of the way`);
  }
});

test('weights are applied as given, and missing clips are ignored', () => {
  const a = q(X, 0);
  const b = q(X, 40);
  const { gltf, bones } = standIn([still('Idle', 2, BONES.head, a), still('Walk', 20 / 24, BONES.head, b)]);
  const ch = createCharacter(gltf);
  ch.setWeights({ Idle: 0.25, Walk: 0.75, Wave: 1 }, 0);
  assert.equal(ch.weightOf('Idle'), 0.25);
  assert.equal(ch.weightOf('Walk'), 0.75);
  assert.equal(ch.weightOf('Wave'), 0, 'a clip the glb lacks has no weight');
  ch.update(1 / 60);
  const want = a.clone().slerp(b, 0.75);
  assert.ok(angle(bones[BONES.head].quaternion, want) < 1e-6, 'the pose is the weighted blend');
  ch.setWeights({ Walk: 1 }, 0);
  assert.equal(ch.weightOf('Idle'), 0, 'a clip left out of the weights goes to 0');
  assert.doesNotThrow(() => ch.restart('Wave'));
});

test('Walk and Run follow the shared step phase; Idle keeps its own clock', () => {
  const L = 20 / 24;
  const R = 14 / 24;
  const walk = clip('Walk', L, BONES.thighL, [0, L], [q(X, 0), q(X, 90)]);
  const run = clip('Run', R, BONES.thighR, [0, R], [q(X, 0), q(X, 90)]);
  const idle = clip('Idle', 2, BONES.chest, [0, 2], [q(Y, 0), q(Y, 30)]);
  const { gltf, bones } = standIn([walk, run, idle]);
  const ch = createCharacter(gltf);
  ch.setWeights({ Walk: 0.5, Run: 0.5, Idle: 0 }, 0.5);
  ch.update(0.1);
  assert.ok(Math.abs(ch.timeOf('Walk') - 0.5 * L) < 1e-6, 'Walk at half its length');
  assert.ok(Math.abs(ch.timeOf('Run') - 0.5 * R) < 1e-6, 'Run at half its length');
  ch.setWeights({ Walk: 1 }, 1.25);
  ch.update(0.1);
  assert.ok(Math.abs(ch.timeOf('Walk') - 0.25 * L) < 1e-6, 'the phase wraps');
  const thigh = bones[BONES.thighL].quaternion;
  assert.ok(angle(thigh, q(X, 22.5)) < 1e-6, 'the pose is the clip’s at that phase');
  const t0 = ch.timeOf('Idle');
  ch.update(0.2);
  assert.ok(Math.abs(ch.timeOf('Idle') - t0 - 0.2) < 1e-6, 'Idle moves on with the clock');
  assert.ok(Math.abs(ch.clipLength('Walk') - L) < 1e-6);
  assert.equal(ch.clipLength('Spook'), 0);
  assert.equal(ch.has('Run'), true);
  assert.equal(ch.has('Spook'), false);
});

test('a one-shot restarts from its start', () => {
  const spook = clip('Spook', 20 / 24, BONES.head, [0, 20 / 24], [q(X, 0), q(X, 30)]);
  const { gltf } = standIn([spook]);
  const ch = createCharacter(gltf);
  ch.setWeights({ Spook: 1 }, 0);
  ch.restart('Spook');
  for (let i = 0; i < 90; i++) ch.update(1 / 60);
  assert.ok(Math.abs(ch.timeOf('Spook') - 20 / 24) < 1e-6, 'it ran to its end and holds there');
  ch.restart('Spook');
  assert.equal(ch.timeOf('Spook'), 0);
  ch.update(0.1);
  assert.ok(Math.abs(ch.timeOf('Spook') - 0.1) < 1e-6, 'and plays again');
});

test('restarting a clip that still shows plays it again from its start while its old pose fades out as its twin', () => {
  const wave = clip('Wave', 1.5, BONES.head, [0, 1.5], [q(X, 0), q(X, 60)]);
  const idle = still('Idle', 2, BONES.head, q(X, 0));
  const { gltf, bones } = standIn([wave, idle]);
  const ch = createCharacter(gltf);
  const head = bones[BONES.head];
  ch.setWeights({ Idle: 1 }, 0);
  assert.equal(ch.restart('Wave'), false, 'not showing: just restarted');
  ch.setWeights({ Wave: 1 }, 0);
  for (let i = 0; i < 45; i++) ch.update(1 / 60);
  const before = head.quaternion.clone();
  assert.ok(angle(before, q(X, 30)) < 1e-3, 'half way through');
  // Showing: restarted from its start, the old one carries on as `Wave~`.
  assert.equal(ch.restart('Wave'), true);
  assert.equal(ch.timeOf('Wave'), 0);
  assert.ok(Math.abs(ch.timeOf(`Wave${TWIN}`) - 0.75) < 1e-6, 'the old one where it was');
  ch.setWeights({ Wave: 0, [`Wave${TWIN}`]: 1 }, 0);
  ch.update(0);
  assert.ok(angle(head.quaternion, before) < 1e-6, 'no pop: the pose is the old one');
  assert.equal(ch.weightOf(`Wave${TWIN}`), 1);
  ch.setWeights({ Wave: 0.5, [`Wave${TWIN}`]: 0.5 }, 0);
  assert.equal(ch.weightOf('Wave'), 0.5);
  ch.update(1 / 60);
  const mid = angle(head.quaternion, q(X, 0));
  assert.ok(mid > 1 * DEG && mid < 30 * DEG, `between the new start and the old pose (${mid / DEG}°)`);
  // Restarted again: they swap back, each keeping its own clock.
  assert.equal(ch.restart('Wave'), true);
  assert.equal(ch.timeOf('Wave'), 0);
  assert.ok(Math.abs(ch.timeOf(`Wave${TWIN}`) - 1 / 60) < 1e-6);
  assert.equal(ch.has(`Wave${TWIN}`), false, 'the twin is no clip of its own');
});

test('the collar’s bonePos reads the current matrices, so carrying can anchor him by it', () => {
  const { gltf } = standIn();
  const ch = createCharacter(gltf);
  ch.root.position.set(1, 0, 2);
  ch.root.rotation.y = Math.PI / 2;
  ch.root.updateMatrixWorld(true);
  const out = { x: 0, y: 0, z: 0 };
  ch.bonePos(COLLAR, out);
  // (Chest sits 0.1 to the side of the hips: turned a quarter, that's along −z.)
  const want = { x: 1, y: SCALE * (1.82 + 0.417 + 1.445), z: 2 - SCALE * 0.1 };
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(out[k] - want[k]) < 1e-6, `${k}: ${out[k]} vs ${want[k]}`);
  // The frame order: read the collar, move the root by anchor − collar, update: he hangs there.
  const anchor = { x: 0.5, y: 2, z: -0.3 };
  ch.bonePos(COLLAR, out);
  ch.root.position.x += anchor.x - out.x;
  ch.root.position.y += anchor.y - out.y;
  ch.root.position.z += anchor.z - out.z;
  ch.root.updateMatrixWorld(true);
  ch.bonePos(COLLAR, out);
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(out[k] - anchor[k]) < 1e-6, `${k} at the anchor`);
});

test('his meshes: toon materials keeping their maps, cast but never receive shadows, never culled', () => {
  const { gltf, mesh, map } = standIn();
  const ch = createCharacter(gltf);
  assert.equal(ch.root.scale.x, SCALE);
  assert.ok(mesh.material.isMeshToonMaterial, 'a toon material');
  assert.equal(mesh.material.map, map, 'the map is kept');
  assert.equal(mesh.material.gradientMap.magFilter, THREE.NearestFilter, 'a nearest gradient map: bands');
  assert.equal(mesh.frustumCulled, false);
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, false);
  assert.doesNotThrow(() => ch.setFace('happy'), 'no face sheet: setFace does nothing');
  assert.doesNotThrow(() => ch.dispose());
});

test('his toon shading is the style’s ramp (shader.js toonRamp), and a new one goes into the same gradient map: no new texture, no new program', () => {
  const { gltf, mesh } = standIn();
  const ch = createCharacter(gltf, { preset: LOOKS.ds });
  const gradient = mesh.material.gradientMap;
  const cells = () =>
    Array.from(
      gradient.image.data.filter((_, i) => i % 4 === 0),
      (v) => v / 255,
    );
  const want = (toon) => toonRamp(toon).map((v) => Math.round(v * 255) / 255);
  assert.equal(gradient.image.width, TOON_CELLS);
  assert.deepEqual(cells(), want(LOOKS.ds.toon), 'DS’s two bands and highlight');
  const version = gradient.version;
  const four = { ...LOOKS.ds, toon: { ...LOOKS.ds.toon, bands: 4, highlight: false } };
  ch.setStyle(four, true);
  assert.equal(mesh.material.gradientMap, gradient, 'the same texture');
  assert.ok(gradient.version > version, 'uploaded again');
  assert.deepEqual(cells(), want(four.toon), 'four bands, no highlight');
  assert.equal(new Set(cells()).size, 4);
  ch.setStyle({ ...LOOKS.ds, toon: { ...LOOKS.ds.toon, bands: 0 } }, false);
  assert.equal(mesh.material.gradientMap, gradient, 'Smooth too, at Off');
  assert.ok(new Set(cells()).size >= 16, 'Smooth: no bands to speak of');
  assert.doesNotThrow(() => ch.dispose());
});

test('his screen shape: a head circle over a body capsule, each at least 11 px', () => {
  const { gltf } = standIn();
  const ch = createCharacter(gltf);
  ch.root.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(30, 390 / 844, 1, 80);
  const rect = { left: 0, top: 0, width: 390, height: 844 };
  camera.position.set(0, 6, 6);
  camera.lookAt(0, 0.5, 0);
  camera.updateMatrixWorld();
  const near = ch.screenShape(camera, rect);
  assert.ok(near.head.y < near.body.a.y && near.head.y < near.body.b.y, 'the head is over the body');
  assert.ok(near.head.r > 11, `close up, the head is wider than the least (${near.head.r})`);
  assert.ok(Math.abs(near.head.x - 195) < 5, `he stands at the middle (${near.head.x})`);
  camera.position.set(0, 300, 300);
  camera.lookAt(0, 0.5, 0);
  camera.updateMatrixWorld();
  const far = ch.screenShape(camera, rect);
  assert.equal(far.head.r, 11, 'far away, the head keeps a finger’s worth');
  assert.equal(far.body.r, 11);
});

/**
 * The stand-in with a face: a quad bound to his head bone (a plain mesh under it) in
 * NEWT_Face's material, 3 model units across one cell of the face sheet at the eyes (u 0..0.5
 * over x 0..3: faceSheets.js faceSpan), facing +z.
 */
function withFace() {
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
const viewportOf = (w, h) => ({ getCurrentViewport: (v) => v.set(0, 0, w, h) });
/** The camera `d` world units in front of a point, looking at it (20° of view, a phone's shape). */
function cameraAt(p, d) {
  const camera = new THREE.PerspectiveCamera(20, 195 / 422, 0.5, 400);
  camera.position.set(p.x, p.y, p.z + d);
  camera.lookAt(p);
  camera.updateMatrixWorld();
  return camera;
}

test('the face sheet: picked by his half face in texels at his head (camera, grid, face span), held through a small change', () => {
  const { gltf, face } = withFace();
  const ch = createCharacter(gltf);
  ch.root.updateMatrixWorld(true);
  const head = ch.root.getObjectByName(BONES.head);
  // (His head's centre: a unit up Neck001, character.js HEAD.)
  const c = head.localToWorld(new THREE.Vector3(0, 1, 0));
  const draw = (d, h = 422) =>
    face.onBeforeRender(viewportOf(195, h), null, cameraAt(c, d), face.geometry, face.material, null);
  // One cell is 3 model units across, × SCALE in the world; a world unit is h / (2 d tan 10°) texels there.
  const expect = (d, h = 422) => 3 * SCALE * (h / (2 * d * Math.tan(10 * DEG)));
  draw(40);
  assert.ok(Math.abs(ch.faceTexels / expect(40) - 1) < 0.02, `half face ${ch.faceTexels} texels (${expect(40)})`);
  assert.equal(ch.faceSize, pickFaceSize(expect(40), null));
  const size = ch.faceSize;
  draw(40 * 1.03);
  assert.equal(ch.faceSize, size, 'a 3% change keeps the sheet');
  draw(20);
  assert.ok(ch.faceSize > size, `twice as close: a bigger sheet (${ch.faceSize} after ${size})`);
  draw(20, 211);
  assert.equal(ch.faceSize, pickFaceSize(expect(20, 211), ch.faceSize), 'half the texels: the grid counts too');
  // Very close at a fine resolution (256×256 zoomed in): past the largest sheet, the smooth one;
  // and back to pixels as he's seen from further.
  draw(0.5, 2532);
  assert.equal(ch.faceSize, 'smooth', `half face ${ch.faceTexels.toFixed(0)} texels: smooth`);
  draw(40);
  assert.equal(ch.faceSize, pickFaceSize(expect(40), null), 'further again: a pixel sheet');
  ch.dispose();
});

test('faceSheet says which face sheet shows: the smooth one at Off (whatever size was picked) and without the pixel image, the picked pixel sheet with the pixel filter on', () => {
  // (Splitting a sheet into cells draws on a canvas: a stand-in document whose canvases only
  // remember their size, enough for three's CanvasTexture in Node.)
  const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) },
  });
  try {
    const { gltf, face } = withFace();
    // (The glb's own 1024 face sheet on his face material, as the real glb has.)
    face.material.map = new THREE.Texture({ width: 1024, height: 1024 });
    const pixelFace = new THREE.Texture({ width: FACE_IMAGE.w, height: FACE_IMAGE.h });
    const ch = createCharacter(gltf, { pixel: false, pixelFace });
    ch.root.updateMatrixWorld(true);
    const c = ch.root.getObjectByName(BONES.head).localToWorld(new THREE.Vector3(0, 1, 0));
    const toon = /** @type {any} */ (face.material);
    const draw = (d) => face.onBeforeRender(viewportOf(195, 422), null, cameraAt(c, d), face.geometry, toon, null);
    assert.equal(ch.faceSheet, 'smooth', 'Off from the start: the smooth face');
    draw(40);
    assert.equal(typeof ch.faceSize, 'number', 'a pixel size is still picked by his texels');
    assert.equal(ch.faceSheet, 'smooth', 'yet Off shows the smooth face, and says so');
    assert.notEqual(toon.map.magFilter, THREE.NearestFilter, 'the smooth sheet’s cell on his face');
    ch.setStyle(LOOKS.ds, true);
    assert.equal(ch.faceSheet, ch.faceSize, 'the pixel filter on: the picked pixel sheet');
    assert.equal(toon.map.magFilter, THREE.NearestFilter, 'a pixel cell on his face');
    assert.equal(toon.map.image.width, ch.faceSize, 'that size’s cell');
    ch.setStyle(LOOKS.ds, false);
    assert.equal(ch.faceSheet, 'smooth', 'Off again: the smooth face');
    ch.dispose();
    // Without the pixel image the smooth sheet stays, pixel filter or not.
    const bare = withFace();
    bare.face.material.map = new THREE.Texture({ width: 1024, height: 1024 });
    const b = createCharacter(bare.gltf, { pixel: true });
    b.root.updateMatrixWorld(true);
    const bc = b.root.getObjectByName(BONES.head).localToWorld(new THREE.Vector3(0, 1, 0));
    const bt = /** @type {any} */ (bare.face.material);
    bare.face.onBeforeRender(viewportOf(195, 422), null, cameraAt(bc, 40), bare.face.geometry, bt, null);
    assert.equal(b.faceSheet, 'smooth', 'no pixel image: the smooth face');
    b.dispose();
  } finally {
    if (had) Object.defineProperty(globalThis, 'document', had);
    else delete (/** @type {any} */ (globalThis).document);
  }
});

test('the texel snap: what’s on his head moves by his head’s centre, the rest of him by his feet, each onto a texel’s centre; Off moves nothing', () => {
  const { gltf, face, mesh } = withFace();
  const ch = createCharacter(gltf);
  ch.root.position.set(0.0123, 0, -0.0456);
  ch.root.updateMatrixWorld(true);
  const head = ch.root.getObjectByName(BONES.head);
  const c = head.localToWorld(new THREE.Vector3(0, 1, 0));
  const feet = ch.root.getWorldPosition(new THREE.Vector3());
  const camera = cameraAt(new THREE.Vector3(0.0371, c.y + 0.0219, 0), 9);
  const [w, h] = [195, 422];
  mesh.onBeforeRender(viewportOf(w, h), null, camera, mesh.geometry, mesh.material, null);
  const snaps = ch.texelSnap;
  const onCentre = (point, snap, what) => {
    const p = point.clone().project(camera);
    const px = ((p.x + snap.x + 1) / 2) * w;
    const py = ((p.y + snap.y + 1) / 2) * h;
    assert.ok(Math.abs(px - Math.floor(px) - 0.5) < 1e-4, `${what}: on a texel's centre across (${px})`);
    assert.ok(Math.abs(py - Math.floor(py) - 0.5) < 1e-4, `${what}: and down (${py})`);
  };
  onCentre(c, snaps.head, 'his head’s centre');
  onCentre(feet, snaps.body, 'his feet');
  assert.ok(Math.abs(snaps.head.x) > 0 || Math.abs(snaps.head.y) > 0, 'it moved');
  // His materials read their part's shift (retro.js markId's snap): the face's is the head's.
  const uniformOf = (material) => {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.toon.vertexShader,
      fragmentShader: THREE.ShaderLib.toon.fragmentShader,
    };
    material.onBeforeCompile(shader, null);
    return shader.uniforms.uTexelSnap.value;
  };
  assert.equal(uniformOf(mesh.material), snaps.body, 'his body: the feet’s shift (planted feet stay put)');
  assert.equal(uniformOf(face.material), snaps.head, 'his face: the head’s (its features keep their texels)');
  ch.setStyle(LOOKS.ds, false);
  face.onBeforeRender(viewportOf(w, h), null, camera, face.geometry, face.material, null);
  assert.deepEqual(
    [snaps.head.x, snaps.head.y, snaps.body.x, snaps.body.y],
    [0, 0, 0, 0],
    'Pixel Size Off: drawn where he is',
  );
  ch.dispose();
});

test('his face samples its sheet at the mip three picks (the smooth sheet stays sharp where it shows), the rest of him at the shared coarser bias', () => {
  const { gltf, face, mesh } = withFace();
  const ch = createCharacter(gltf);
  const biasOf = (material) => {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.toon.vertexShader,
      fragmentShader: THREE.ShaderLib.toon.fragmentShader,
    };
    material.onBeforeCompile(shader, null);
    return shader.uniforms.uMapBias;
  };
  assert.equal(biasOf(face.material).value, 0, 'the face: no bias');
  assert.notEqual(biasOf(face.material), biasOf(mesh.material), 'its own, not the shared one the preset sets');
  ch.dispose();
});

test('the pixel atlas: on his atlas material while the pixel filter is on (nearest, no mipmaps), the glb’s own at Off', () => {
  const { gltf, mesh, map } = standIn();
  const pixelAtlas = new THREE.Texture();
  const ch = createCharacter(gltf, { pixelAtlas });
  assert.equal(mesh.material.map, pixelAtlas, 'the pixel filter is on by default: the pixel atlas');
  assert.equal(pixelAtlas.magFilter, THREE.NearestFilter);
  assert.equal(pixelAtlas.minFilter, THREE.NearestFilter);
  assert.equal(pixelAtlas.generateMipmaps, false);
  assert.equal(pixelAtlas.flipY, false, 'the glb’s UVs (v down the image)');
  assert.equal(pixelAtlas.colorSpace, THREE.SRGBColorSpace);
  ch.setStyle(LOOKS.ds, false);
  assert.equal(mesh.material.map, map, 'Off: the glb’s atlas as it was');
  ch.setStyle(LOOKS.soft, true);
  assert.equal(mesh.material.map, pixelAtlas, 'on again, whatever the Style');
  ch.dispose();
  const plain = standIn();
  createCharacter(plain.gltf, { pixel: true });
  assert.equal(plain.mesh.material.map, plain.map, 'no pixel atlas: the glb’s');
});

test('the glb’s own atlas replaces the bold pixel plaid once NEWT is ORIGINAL_ATLAS_TEXELS tall or more (its checks resolve there); the pixel plaid below it, and before he’s measured', () => {
  assert.ok(
    ORIGINAL_ATLAS_TEXELS >= 64 && ORIGINAL_ATLAS_TEXELS <= 200,
    `a fine resolution (${ORIGINAL_ATLAS_TEXELS} texels tall)`,
  );
  const { gltf, mesh, map } = standIn();
  const pixelAtlas = new THREE.Texture();
  const ch = createCharacter(gltf, { pixelAtlas });
  assert.equal(mesh.material.map, pixelAtlas, 'not measured yet: the pixel plaid');
  assert.equal(ch.atlas, 'pixel');
  ch.setResolution(ORIGINAL_ATLAS_TEXELS - 0.5);
  assert.equal(mesh.material.map, pixelAtlas, 'just under: the pixel plaid');
  ch.setResolution(ORIGINAL_ATLAS_TEXELS);
  assert.equal(mesh.material.map, map, 'there: the glb’s atlas');
  assert.equal(ch.atlas, 'original');
  ch.setResolution(16);
  assert.equal(mesh.material.map, pixelAtlas, '16×16: the pixel plaid again');
  ch.setResolution(300);
  ch.setStyle(LOOKS.soft, true);
  assert.equal(mesh.material.map, map, 'a Style change keeps it');
  ch.setStyle(LOOKS.ds, false);
  assert.equal(mesh.material.map, map, 'Off: the glb’s, as ever');
  ch.setResolution(16);
  assert.equal(mesh.material.map, map, 'Off at any resolution: the glb’s');
  ch.dispose();
});

test('his atlas’s mip bias: the preset’s mipBias under the pixel filter, its fineMipBias once he’s ORIGINAL_ATLAS_TEXELS tall (the real plaid’s checks resolve), none at Off', () => {
  const { gltf, mesh } = standIn();
  const preset = { ...LOOKS.ds, texture: { mipBias: 1.5, fineMipBias: 0.5 } };
  const ch = createCharacter(gltf, { preset, pixel: true, pixelAtlas: new THREE.Texture() });
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.toon.vertexShader,
    fragmentShader: THREE.ShaderLib.toon.fragmentShader,
  };
  mesh.material.onBeforeCompile(shader, null);
  const bias = shader.uniforms.uMapBias;
  assert.equal(bias.value, 1.5, 'not measured yet (the pixel atlas has no mips; a fallback glb atlas is coarse)');
  ch.setResolution(ORIGINAL_ATLAS_TEXELS + 10);
  assert.equal(bias.value, 0.5, 'a fine resolution: the glb’s plaid a mip less blurred');
  ch.setStyle({ ...preset, texture: { mipBias: 2 } }, true);
  assert.equal(bias.value, 2, 'a preset without fineMipBias: its mipBias');
  ch.setStyle(preset, false);
  assert.equal(bias.value, 0, 'Off: as three picks');
  ch.dispose();
});

test('a pixel atlas still on its way (a promise) goes on him when it comes; one that fails leaves the glb’s', async () => {
  const late = standIn();
  const atlas = new THREE.Texture();
  let arrive = () => {};
  const ch = createCharacter(late.gltf, { pixelAtlas: new Promise((done) => (arrive = () => done(atlas))) });
  assert.equal(late.mesh.material.map, late.map, 'the glb’s atlas until it comes');
  arrive();
  await ch.atlasReady;
  assert.equal(late.mesh.material.map, atlas, 'then the pixel atlas');
  const failed = standIn();
  const none = createCharacter(failed.gltf, { pixelAtlas: Promise.resolve(null) });
  await none.atlasReady;
  assert.equal(failed.mesh.material.map, failed.map);
});

test('the pixel atlas sits beside the glb: loadCharacter derives its address from the glb’s', () => {
  assert.equal(pixelAtlasUrl('/invitation/models/newt.glb'), '/invitation/models/newt-atlas-pixel.png');
  assert.equal(pixelAtlasUrl('models/newt.glb?v=2'), 'models/newt-atlas-pixel.png');
});

test('the texel snap holds his texel while his head wobbles across an edge (no step back and forth with each breath)', () => {
  const { gltf, mesh } = withFace();
  const ch = createCharacter(gltf);
  const [w, h] = [195, 422];
  const head = ch.root.getObjectByName(BONES.head);
  const camera = cameraAt(new THREE.Vector3(0, 0.9, 0), 9);
  /** Where his head's centre is drawn, texels across, with him moved `dx` world units. */
  const drawnAt = (dx) => {
    ch.root.position.x = dx;
    ch.root.updateMatrixWorld(true);
    mesh.onBeforeRender(viewportOf(w, h), null, camera, mesh.geometry, mesh.material, null);
    const p = head.localToWorld(new THREE.Vector3(0, 1, 0)).project(camera);
    return { at: ((p.x + ch.texelSnap.head.x + 1) / 2) * w, raw: ((p.x + 1) / 2) * w };
  };
  // A texel in world units at his head, across.
  const texel = (drawnAt(1).raw - drawnAt(0).raw) ** -1;
  // Start just right of an edge, then wobble a fifth of a texel each side of it.
  const { raw } = drawnAt(0);
  const edge = Math.floor(raw) + 1;
  const start = (edge + 0.05 - raw) * texel;
  ch.setStyle(LOOKS.ds, true); // (a fresh start: the measuring above moved its hold)
  const first = drawnAt(start).at;
  assert.ok(Math.abs(first - edge - 0.5) < 1e-3, `first, on its own texel's centre (${first})`);
  for (const k of [-0.2, 0.15, -0.18, 0.1, -0.2])
    assert.ok(Math.abs(drawnAt(start + k * texel).at - first) < 1e-3, `${k} texel: drawn on the same texel`);
  assert.ok(Math.abs(drawnAt(start + 1.4 * texel).at - first - 1) < 1e-3, 'clearly into the next texel: one texel on');
  ch.dispose();
});
