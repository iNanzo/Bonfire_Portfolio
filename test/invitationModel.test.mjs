// NEWT's model for the invitation toy (public/models/newt.glb, built by tools/newt.py): every
// clip in src/invitation/clips.js is in the file at its length, keys all 17 bones and really
// moves (a rest-pose export fails); the loops end where they start; every clip stays in place
// (the page moves his root) and Held keeps the collar where it rests, so the page can hang
// him from it; Walk and Run start on the same foot and their STRIDE values match what the
// planted feet do, measured by forward kinematics; Run reaches both arms straight out in
// front, leans forward and tips his face up to the camera (the user's reference); and the file
// itself: a 17-joint skin with at most 4 influences, WebP textures, no Draco, no lights, 27
// uniquely named nodes as three.js names them, the face's UVs inside its sheet's first cell,
// and its size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readGlbAnim, quatAngle, quatDistance, footStride } from './lib/glbAnim.mjs';
import { CLIPS, CLIP_NAMES, BLENDER_BONES, STRIDE, SCALE, FPS } from '../src/invitation/clips.js';

const glb = readGlbAnim(new URL('../public/models/newt.glb', import.meta.url));
const { gltf } = glb;
const DEG = Math.PI / 180;

/** Samples of a clip at `rate` per second, ends included: [t, pose]. */
function samples(anim, rate = 60) {
  const n = Math.max(1, Math.round(anim.duration * rate));
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = (k / n) * anim.duration;
    return [t, glb.poseAt(anim, t)];
  });
}
const clip = (name) => {
  const a = glb.animations.get(name);
  assert.ok(a, `${name} is in the file`);
  return a;
};

test('every clip is in the file at its length', () => {
  for (const name of CLIP_NAMES) {
    const a = clip(name);
    assert.ok(
      Math.abs(a.duration - CLIPS[name].length) < 0.5 / FPS,
      `${name} lasts ${a.duration.toFixed(3)} s, the contract says ${CLIPS[name].length.toFixed(3)} s`,
    );
  }
});

test('every clip has a rotation channel for each of the 17 bones', () => {
  assert.equal(BLENDER_BONES.length, 17);
  for (const name of CLIP_NAMES) {
    const turned = new Set(
      clip(name)
        .channels.filter((c) => c.path === 'rotation')
        .map((c) => c.node),
    );
    for (const bone of BLENDER_BONES) assert.ok(turned.has(bone), `${name} rotates ${bone}`);
  }
});

test('every clip turns some bone more than 5 degrees from rest', () => {
  for (const name of CLIP_NAMES) {
    let most = 0;
    for (const ch of clip(name).channels.filter((c) => c.path === 'rotation')) {
      const rest = glb.rest.get(ch.node).rotation;
      for (let k = 0; k < ch.times.length; k++)
        most = Math.max(most, quatAngle(rest, Array.from(ch.values.subarray(k * 4, k * 4 + 4))));
    }
    assert.ok(most > 5 * DEG, `${name} turns a bone at most ${(most / DEG).toFixed(1)}°`);
  }
});

test('the loops end where they start', () => {
  for (const name of CLIP_NAMES.filter((n) => CLIPS[n].loop)) {
    for (const ch of clip(name).channels) {
      const { size, values } = ch;
      const first = Array.from(values.subarray(0, size));
      const last = Array.from(values.subarray(values.length - size));
      const d =
        ch.path === 'rotation' ? quatDistance(first, last) : Math.max(...first.map((v, i) => Math.abs(v - last[i])));
      assert.ok(d < 1e-3, `${name}: ${ch.node} ${ch.path} ends ${d.toExponential(2)} from its start`);
    }
  }
});

test('every clip stays in place: the hips keep within 0.02 world units of rest across the floor', () => {
  // Held is the exception: it pins the collar (the next test) and lets the body sway under it.
  const rest = glb.worldPos(new Map(), 'Bone');
  for (const name of CLIP_NAMES.filter((n) => n !== 'Held')) {
    let most = 0;
    for (const [, pose] of samples(clip(name))) {
      const p = glb.worldPos(pose, 'Bone');
      most = Math.max(most, Math.hypot(p[0] - rest[0], p[2] - rest[2]) * SCALE);
    }
    assert.ok(most <= 0.02, `${name}'s hips wander ${most.toFixed(3)} world units`);
  }
});

test("Held keeps the collar (the Neck bone's head) within 0.15 model units of its rest place", () => {
  const rest = glb.worldPos(new Map(), 'Neck');
  let most = 0;
  for (const [, pose] of samples(clip('Held'))) {
    const p = glb.worldPos(pose, 'Neck');
    most = Math.max(most, Math.hypot(p[0] - rest[0], p[1] - rest[1], p[2] - rest[2]));
  }
  assert.ok(most <= 0.15, `the collar moves ${most.toFixed(3)} model units`);
});

test('Walk and Run start with the left foot forward', () => {
  for (const name of ['Walk', 'Run']) {
    const pose = glb.poseAt(clip(name), 0);
    const ahead = glb.worldPos(pose, 'Foot.L')[2] - glb.worldPos(pose, 'Foot.R')[2];
    assert.ok(ahead > 0.2, `${name}: the left foot is ${ahead.toFixed(2)} model units ahead of the right`);
  }
});

test('STRIDE matches what the planted feet do (within 10%)', () => {
  for (const name of ['Walk', 'Run']) {
    const measured = footStride(glb, clip(name)) * SCALE;
    assert.ok(
      Math.abs(STRIDE[name] - measured) <= 0.1 * measured,
      `${name}: STRIDE says ${STRIDE[name]}, the feet cover ${measured.toFixed(3)} world units a cycle`,
    );
  }
});

/**
 * Run's shape across the cycle, in glTF space (+Y up, +Z his front): each arm's upper arm
 * (shoulder joint to elbow) and forearm (the ForeArm bone's +Y) as elevation above the
 * horizontal and heading off straight ahead, the elbow's bend, the trunk's lean (hips to collar,
 * from the vertical toward his front) and where his face points (the head's turn from rest
 * applied to the rest face direction, +Z), in degrees.
 */
function runShape() {
  const restWorld = glb.world(new Map());
  const restHead = new THREE.Quaternion().setFromRotationMatrix(restWorld('Neck.001')).invert();
  const up = (v) => Math.asin(v.y / v.length()) / DEG;
  const off = (v) => Math.abs(Math.atan2(v.x, v.z)) / DEG;
  return samples(clip('Run'), 48).map(([, pose]) => {
    const w = glb.world(pose);
    const at = (n) => new THREE.Vector3().setFromMatrixPosition(w(n));
    const arms = ['L', 'R'].map((s) => {
      const upper = at(`ForeArm.${s}`).sub(at(`Bicep.${s}`));
      const fore = new THREE.Vector3(0, 1, 0).transformDirection(w(`ForeArm.${s}`));
      return {
        upperUp: up(upper),
        upperOff: off(upper),
        foreUp: up(fore),
        foreOff: off(fore),
        bend: upper.angleTo(fore) / DEG,
        elbowOverShoulder: at(`ForeArm.${s}`).y - at(`Bicep.${s}`).y,
      };
    });
    const trunk = at('Neck').sub(at('Bone'));
    const turn = new THREE.Quaternion().setFromRotationMatrix(w('Neck.001')).multiply(restHead);
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(turn);
    return { arms, lean: Math.atan2(trunk.z, trunk.y) / DEG, faceUp: up(face) };
  });
}

test("Run reaches both arms straight out in front at shoulder height, as the user's reference", () => {
  const shape = runShape();
  const arms = shape.flatMap((s) => s.arms);
  for (const a of arms) {
    assert.ok(Math.abs(a.upperUp) <= 20, `an upper arm ${a.upperUp.toFixed(0)}° off the horizontal`);
    assert.ok(a.foreUp >= -15 && a.foreUp <= 25, `a forearm ${a.foreUp.toFixed(0)}° above the horizontal`);
    assert.ok(
      a.upperOff <= 30 && a.foreOff <= 30,
      `an arm heads ${a.upperOff.toFixed(0)}°/${a.foreOff.toFixed(0)}° off ahead`,
    );
    assert.ok(a.bend <= 30, `an elbow bent ${a.bend.toFixed(0)}° (nearly straight)`);
    assert.ok(
      Math.abs(a.elbowOverShoulder) <= 0.45,
      `an elbow ${a.elbowOverShoulder.toFixed(2)} off the shoulder's height`,
    );
  }
  // a small pump: the arms rise and fall a little, never flail
  const pump = Math.max(...arms.map((a) => a.foreUp)) - Math.min(...arms.map((a) => a.foreUp));
  assert.ok(pump >= 3 && pump <= 25, `the forearms pump through ${pump.toFixed(1)}°`);
});

test('Run leans the trunk forward and tips the head back so the high camera sees his face', () => {
  const shape = runShape();
  const mean = (k) => shape.reduce((sum, s) => sum + s[k], 0) / shape.length;
  assert.ok(mean('lean') >= 12, `the trunk leans ${mean('lean').toFixed(1)}° forward on average`);
  // the toy's camera looks down from about 36° above his front: a face tipped up shows it
  for (const s of shape)
    assert.ok(s.faceUp >= 0 && s.faceUp <= 40, `his face points ${s.faceUp.toFixed(0)}° above the horizontal`);
  assert.ok(mean('faceUp') >= 8, `his face points ${mean('faceUp').toFixed(1)}° up on average`);
});

test('one skin of 17 joints with at most 4 influences a vertex', () => {
  assert.equal(gltf.skins?.length, 1);
  assert.equal(gltf.skins[0].joints.length, 17);
  const joints = new Set(gltf.skins[0].joints.map((j) => gltf.nodes[j].name));
  for (const bone of BLENDER_BONES) assert.ok(joints.has(bone), `${bone} is a joint`);
  for (const mesh of gltf.meshes)
    for (const p of mesh.primitives) {
      assert.ok('JOINTS_0' in p.attributes, `${mesh.name} is skinned`);
      assert.ok(!('JOINTS_1' in p.attributes), `${mesh.name} has more than 4 influences`);
    }
});

test('WebP textures, no Draco, no lights', () => {
  assert.ok(gltf.images?.length > 0);
  for (const img of gltf.images) assert.equal(img.mimeType, 'image/webp', `${img.name} is WebP`);
  const ext = [...(gltf.extensionsUsed ?? []), ...(gltf.extensionsRequired ?? [])];
  assert.ok(!ext.includes('KHR_draco_mesh_compression'), 'no Draco');
  assert.ok(!ext.includes('KHR_lights_punctual'), 'no lights');
  assert.ok(!gltf.cameras?.length, 'no cameras');
});

test('27 nodes, every name unique as three.js sanitizes it', () => {
  assert.equal(gltf.nodes.length, 27);
  // PropertyBinding.sanitizeNodeName: whitespace becomes _, and [ ] . : / are dropped.
  const names = gltf.nodes.map((n) => n.name.replace(/\s/g, '_').replace(/[[\].:/]/g, ''));
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dupes, [], 'no two nodes share a name');
});

test("the face's UVs stay in its sheet's first cell (u <= 0.5, v <= 0.53)", () => {
  let seen = 0;
  for (const mesh of gltf.meshes)
    for (const p of mesh.primitives) {
      if (gltf.materials[p.material]?.name !== 'NEWT_Face') continue;
      const uv = glb.accessor(p.attributes.TEXCOORD_0);
      for (let i = 0; i < uv.length; i += 2) {
        assert.ok(uv[i] <= 0.5 + 1e-4 && uv[i + 1] <= 0.53 + 1e-4, `face UV (${uv[i]}, ${uv[i + 1]})`);
        seen++;
      }
    }
  assert.ok(seen > 0, 'a primitive uses NEWT_Face');
});

test('the file is under 650 kB', () => {
  assert.ok(glb.bytes < 650 * 1024, `${(glb.bytes / 1024).toFixed(0)} kB`);
});
