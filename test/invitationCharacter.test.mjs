// NEWT's character (src/invitation/character.js) with three.js in Node: a stand-in skeleton
// named like clips.js BONES, synthetic quaternion clips, no WebGL. The look is applied on top
// of the saved animation pose, so it never adds up from frame to frame (three's PropertyMixer
// skips writing a channel whose value didn't change, as a clamped one-shot's doesn't); weights
// go to the actions as given; Walk and Run follow the shared step phase while Idle keeps its
// own clock; the collar is read from the current matrices, so carrying can anchor him by it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter } from '../src/invitation/character.js';
import { BONES, COLLAR, SCALE } from '../src/invitation/clips.js';

const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);
/** The angle between two rotations, in radians. */
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));

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
