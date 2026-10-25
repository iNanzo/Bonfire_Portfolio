// NEWT's model for the invitation toy (public/models/newt.glb, built by tools/newt.py): every
// clip in src/invitation/clips.js is in the file at its length, keys all 17 bones and really
// moves (a rest-pose export fails); the loops end where they start; every clip stays in place
// (the page moves his root) and Held and Thrash keep the collar where it rests, so the page can
// hang him from it; round 16's clips: Held hangs limp with no kick and his head down, Thrash kicks
// from and back to Held's first pose, Screen Time's DeviceSit and DeviceLie keep both palms on the
// tablet's grip (clips.js DEVICE: its side edges sitting, its near corners lying), lying he's flat
// with his chest raised 15-25 degrees, arms forward, the tablet past his face and the feet kicking
// (round 17), LieDown and GetUp join them to Idle, and lying he rests on the floor without his back hair digging into his shirt; Walk and Run start on the same foot and their STRIDE values match what the
// planted feet do, measured by forward kinematics; Run reaches both arms straight out in
// front, leans forward and tips his face up to the camera (the user's reference); the dialogue's
// gestures (round 15) start and end on Idle's pose, keep the hands and sleeves clear of his huge
// head, hair and cap (the skinned meshes, frame by frame), and each does what it's named for
// broadly enough to read at 128 px (Nod shallow enough that his eyes show at its bottom); and the
// file itself: a 17-joint skin with at most 4 influences, WebP textures, no Draco, no lights, 27
// uniquely named nodes as three.js names them, the face's UVs inside its sheet's first cell,
// and its size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readGlbAnim, quatAngle, quatDistance, footStride, skinnedMesh, nearestDistance } from './lib/glbAnim.mjs';
import {
  CLIPS,
  CLIP_NAMES,
  BLENDER_BONES,
  DIALOGUE_CLIPS,
  STRIDE,
  SCALE,
  FPS,
  ANKLE_HEIGHT,
  DEVICE,
} from '../src/invitation/clips.js';

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

/** The clips that hang him by the collar: they pin it and let the body swing under it. */
const PINNED = ['Held', 'Thrash'];

test('every clip stays in place: the hips keep within 0.02 world units of rest across the floor', () => {
  // Held and Thrash are the exception: they pin the collar (the next test) and let the body sway.
  const rest = glb.worldPos(new Map(), 'Bone');
  for (const name of CLIP_NAMES.filter((n) => !PINNED.includes(n))) {
    let most = 0;
    for (const [, pose] of samples(clip(name))) {
      const p = glb.worldPos(pose, 'Bone');
      most = Math.max(most, Math.hypot(p[0] - rest[0], p[2] - rest[2]) * SCALE);
    }
    assert.ok(most <= 0.02, `${name}'s hips wander ${most.toFixed(3)} world units`);
  }
});

test("Held and Thrash keep the collar (the Neck bone's head) within 0.15 model units of its rest place", () => {
  const rest = glb.worldPos(new Map(), 'Neck');
  for (const name of PINNED) {
    let most = 0;
    for (const [, pose] of samples(clip(name))) {
      const p = glb.worldPos(pose, 'Neck');
      most = Math.max(most, Math.hypot(p[0] - rest[0], p[1] - rest[1], p[2] - rest[2]));
    }
    assert.ok(most <= 0.15, `${name}: the collar moves ${most.toFixed(3)} model units`);
  }
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

/** Round 15's talking gestures, the ones tools/newt.py made for the dialogue. */
const GESTURES = ['Talk', 'Nod', 'Shrug', 'Point', 'Think', 'Cheer'];

test('the dialogue plays only clips the file has, the gestures among them', () => {
  for (const name of DIALOGUE_CLIPS) clip(name);
  for (const name of GESTURES) assert.ok(DIALOGUE_CLIPS.includes(name), `${name} is a dialogue clip`);
});

/** Asserts two poses match: every bone's turn and the hips' place, within 1e-3. */
function samePose(pose, want, label) {
  for (const bone of BLENDER_BONES) {
    const d = quatDistance(pose.get(bone).rotation, want.get(bone).rotation);
    assert.ok(d < 1e-3, `${label}: ${bone} is ${d.toExponential(2)} off`);
  }
  const hips = want.get('Bone').translation;
  const off = Math.max(...pose.get('Bone').translation.map((v, i) => Math.abs(v - hips[i])));
  assert.ok(off < 1e-3, `${label}: the hips are ${off.toExponential(2)} off`);
}
const first = (name) => glb.poseAt(clip(name), 0);
const last = (name) => glb.poseAt(clip(name), clip(name).duration);

test("the one-shot gestures start and end on Idle's first pose", () => {
  const idle = first('Idle');
  for (const name of [...GESTURES.filter((n) => !CLIPS[n].loop), 'Wave', 'Spook']) {
    samePose(first(name), idle, `${name} at its start, against Idle`);
    samePose(last(name), idle, `${name} at its end, against Idle`);
  }
});

const ARM_BONES = ['Bicep.L', 'ForeArm.L', 'Bicep.R', 'ForeArm.R'];
const HEAD_MESHES = ['Head', 'Hat', 'BackHair', 'Plane', 'Plane.001', 'Plane.002'];

/** The closest the hands and the sleeves come to his head, hair and cap over a clip, model units. */
function clearance(name, rate = FPS) {
  const hands = skinnedMesh(glb, 'Hands');
  const body = skinnedMesh(glb, 'Body');
  const sleeve = Array.from({ length: body.count }, (_, i) => i).filter((i) => body.weightOn(i, ARM_BONES) > 0.5);
  const heads = HEAD_MESHES.map((m) => skinnedMesh(glb, m));
  let hand = Infinity;
  let arm = Infinity;
  for (const [, pose] of samples(clip(name), rate)) {
    const shells = heads.map((h) => ({ v: h.at(pose), tris: h.tris }));
    for (const p of hands.at(pose)) hand = Math.min(hand, nearestDistance(p, shells));
    const bv = body.at(pose);
    for (const i of sleeve) arm = Math.min(arm, nearestDistance(bv[i], shells));
  }
  return { hand, arm };
}

test('the gestures keep the hands and sleeves clear of his head, hair and cap', () => {
  // Think's hand comes up under his chin, so it may come closer; nothing goes into the head.
  const room = { Think: 0.05 };
  for (const name of GESTURES) {
    const { hand, arm } = clearance(name);
    const min = room[name] ?? 0.1;
    assert.ok(hand >= min, `${name}: a hand comes ${hand.toFixed(3)} model units from his head (at least ${min})`);
    assert.ok(arm >= 0.05, `${name}: a sleeve comes ${arm.toFixed(3)} model units from his head`);
  }
});

const FOREARM = 0.9; // the ForeArm bones' length (tools/newt.py's rig)
/**
 * Where things are over a clip, in glTF space (+Y up, +Z his front, +X his left): each hand
 * (the ForeArm bone's tip), elbow and shoulder joint, the hips, the ankles, and the face's
 * direction (the head's turn from rest applied to +Z) as elevation, and the head's tilt, degrees.
 */
function track(name, rate = 48) {
  const restWorld = glb.world(new Map());
  const restHead = new THREE.Quaternion().setFromRotationMatrix(restWorld('Neck.001')).invert();
  return samples(clip(name), rate).map(([t, pose]) => {
    const w = glb.world(pose);
    const at = (n) => new THREE.Vector3().setFromMatrixPosition(w(n));
    const tip = (s) => at(`ForeArm.${s}`).add(new THREE.Vector3(0, FOREARM, 0).transformDirection(w(`ForeArm.${s}`)));
    const turn = new THREE.Quaternion().setFromRotationMatrix(w('Neck.001')).multiply(restHead);
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(turn);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(turn);
    return {
      t,
      hand: { L: tip('L'), R: tip('R') },
      elbow: { L: at('ForeArm.L'), R: at('ForeArm.R') },
      shoulder: { L: at('Bicep.L'), R: at('Bicep.R') },
      hips: at('Bone'),
      ankle: { L: at('Foot.L'), R: at('Foot.R') },
      faceUp: Math.asin(face.y) / DEG,
      tilt: Math.atan2(-up.x, up.y) / DEG,
    };
  });
}
const idleAt0 = () => track('Idle')[0];
const most = (rows, f) => Math.max(...rows.map(f));
const least = (rows, f) => Math.min(...rows.map(f));

test('Talk raises a hand in front of his chest and moves it, and his head bobs as he speaks', () => {
  const rows = track('Talk');
  const idle = idleAt0();
  const lift = most(rows, (r) => Math.max(r.hand.L.y - idle.hand.L.y, r.hand.R.y - idle.hand.R.y));
  assert.ok(lift >= 0.6, `a hand rises ${lift.toFixed(2)} model units over Idle's`);
  let path = 0;
  for (let k = 1; k < rows.length; k++)
    path += Math.max(rows[k].hand.L.distanceTo(rows[k - 1].hand.L), rows[k].hand.R.distanceTo(rows[k - 1].hand.R));
  assert.ok(path >= 1.5, `the hands travel ${path.toFixed(2)} model units a loop`);
  const nod = most(rows, (r) => r.faceUp) - least(rows, (r) => r.faceUp);
  const tilt = most(rows, (r) => r.tilt) - least(rows, (r) => r.tilt);
  assert.ok(nod >= 5 && nod <= 20, `his face bobs through ${nod.toFixed(1)}°`);
  assert.ok(tilt >= 4, `his head tilts through ${tilt.toFixed(1)}°`);
});

test('Nod tips his face down and back up, shallow enough that his eyes show, his body dipping with it', () => {
  const rows = track('Nod');
  const idle = idleAt0();
  const dip = idle.faceUp - least(rows, (r) => r.faceUp);
  // (Past about 16° his big head's fringe hides his eyes from the default view's 36° up and the
  // medium shot's 16°: the nod then reads as a bow, his face gone.)
  assert.ok(dip >= 10 && dip <= 16, `his face dips ${dip.toFixed(1)}° below Idle's`);
  const drop = idle.hips.y - least(rows, (r) => r.hips.y);
  assert.ok(drop >= 0.13, `his hips dip ${drop.toFixed(2)} model units with it`);
});

test('Shrug lifts both shoulders and opens both hands out to the sides', () => {
  const rows = track('Shrug');
  const idle = idleAt0();
  for (const s of ['L', 'R']) {
    const rise = most(rows, (r) => r.shoulder[s].y - idle.shoulder[s].y);
    assert.ok(rise >= 0.12, `the ${s} shoulder rises ${rise.toFixed(2)}`);
    const out = most(rows, (r) => Math.abs(r.hand[s].x) - Math.abs(idle.hand[s].x));
    assert.ok(out >= 0.3, `the ${s} hand opens ${out.toFixed(2)} out to the side`);
    const up = most(rows, (r) => r.hand[s].y - r.elbow[s].y);
    assert.ok(up >= -0.1, `the ${s} hand comes up to ${up.toFixed(2)} of the elbow's height`);
  }
});

test('Point reaches the right hand out in front of him, above the shoulder, the arm nearly straight', () => {
  const rows = track('Point');
  // the point itself: the frame the hand is furthest from the shoulder
  const best = rows.reduce((a, r) => (r.hand.R.distanceTo(r.shoulder.R) > a.hand.R.distanceTo(a.shoulder.R) ? r : a));
  const reach = best.hand.R.z - best.shoulder.R.z;
  assert.ok(reach >= 1.0, `the right hand reaches ${reach.toFixed(2)} ahead of the shoulder`);
  assert.ok(best.hand.R.y > best.shoulder.R.y, 'the right hand is above the shoulder');
  const upper = best.elbow.R.clone().sub(best.shoulder.R);
  const fore = best.hand.R.clone().sub(best.elbow.R);
  const bend = upper.angleTo(fore) / DEG;
  assert.ok(bend <= 30, `the elbow bends ${bend.toFixed(0)}°`);
  const left = most(rows, (r) => r.hand.L.y - idleAt0().hand.L.y);
  assert.ok(left <= 0.5, `the left hand rises ${left.toFixed(2)}: it stays down`);
});

test('Think holds the right hand up by his chin the whole loop, the head tilted', () => {
  const rows = track('Think');
  for (const r of rows) {
    const over = r.hand.R.y - r.shoulder.R.y;
    assert.ok(over >= 0.25, `the right hand ${over.toFixed(2)} over the shoulder`);
    assert.ok(Math.abs(r.hand.R.x) <= 0.9, `the right hand ${r.hand.R.x.toFixed(2)} off his middle`);
    assert.ok(r.hand.R.z >= 0.8, `the right hand ${r.hand.R.z.toFixed(2)} in front of him`);
  }
  const tilt = rows.reduce((sum, r) => sum + Math.abs(r.tilt), 0) / rows.length;
  assert.ok(tilt >= 6, `his head tilts ${tilt.toFixed(1)}° on average`);
});

test('Cheer throws both fists up beside his head and hops', () => {
  const rows = track('Cheer');
  const idle = idleAt0();
  const top = (r) => Math.min(r.hand.L.y, r.hand.R.y);
  const peak = rows.reduce((a, r) => (top(r) > top(a) ? r : a));
  const head = glb.worldPos(new Map(), 'Neck.001')[1];
  assert.ok(top(peak) >= head + 0.3, `the fists reach ${top(peak).toFixed(2)}, the head's base is ${head.toFixed(2)}`);
  const hop = most(rows, (r) => r.hips.y - idle.hips.y);
  assert.ok(hop >= 0.25, `the hips rise ${hop.toFixed(2)}`);
  const air = most(rows, (r) => Math.min(r.ankle.L.y, r.ankle.R.y)) - ANKLE_HEIGHT;
  assert.ok(air >= 0.15, `both feet leave the floor by ${air.toFixed(2)}`);
});

// Round 16: the limp carry, Thrash and Screen Time.

test('Held hangs limp: no kick (both ankles stay near their mean height) and his head down', () => {
  const rows = track('Held');
  for (const s of ['L', 'R']) {
    const mean = rows.reduce((sum, r) => sum + r.ankle[s].y, 0) / rows.length;
    const off = most(rows, (r) => Math.abs(r.ankle[s].y - mean));
    assert.ok(off <= 0.1, `the ${s} ankle strays ${off.toFixed(2)} model units from its mean height`);
  }
  // (Defeat: about 25-30 degrees down. The page's held look keeps a low weight, so it stays down.)
  const up = most(rows, (r) => r.faceUp);
  assert.ok(up <= -20, `his face points at most ${up.toFixed(1)}° above the horizontal`);
});

test("Thrash starts and ends on Held's first pose and kicks both feet up", () => {
  const held = first('Held');
  samePose(first('Thrash'), held, 'Thrash at its start, against Held');
  samePose(last('Thrash'), held, 'Thrash at its end, against Held');
  const rows = track('Thrash');
  const rest = track('Held')[0];
  for (const s of ['L', 'R']) {
    const kick = most(rows, (r) => r.ankle[s].y - rest.ankle[s].y);
    assert.ok(kick >= 0.3, `the ${s} ankle kicks up ${kick.toFixed(2)} model units`);
  }
});

test("LieDown goes from DeviceSit's first pose to DeviceLie's, and GetUp from DeviceLie's to Idle's", () => {
  samePose(first('LieDown'), first('DeviceSit'), 'LieDown at its start, against DeviceSit');
  samePose(last('LieDown'), first('DeviceLie'), 'LieDown at its end, against DeviceLie');
  samePose(first('GetUp'), first('DeviceLie'), 'GetUp at its start, against DeviceLie');
  samePose(last('GetUp'), first('Idle'), 'GetUp at its end, against Idle');
});

test("the tablet's screen faces the default camera, 36 degrees up from his front", () => {
  for (const name of ['DeviceSit', 'DeviceLie']) {
    const { tilt } = DEVICE.clips[name];
    assert.ok(tilt >= 0 && tilt < 36, `${name}'s tablet tilts ${tilt}° toward his face`);
  }
});

/**
 * Where the contract (clips.js DEVICE) puts a clip's palms and the tablet's far edge, in glTF's
 * space: Blender armature space (+X his left, -Y his front, +Z up) to glTF's is (x, z, -y). The
 * palms sit `grip` from the tablet's middle (across it, and back toward him along its screen)
 * and `lift` above its mid-plane along the screen's normal.
 */
function deviceGeometry(name) {
  const { centre, tilt, lift, grip } = DEVICE.clips[name];
  const [x, y, z] = centre;
  const t = tilt * DEG;
  const mid = new THREE.Vector3(x, z, -y);
  const normal = new THREE.Vector3(0, Math.cos(t), -Math.sin(t));
  // Along the screen, away from him (its far edge rises as it tips toward his face).
  const ahead = new THREE.Vector3(0, Math.sin(t), Math.cos(t));
  const palm = (sign) =>
    mid
      .clone()
      .add(new THREE.Vector3(sign * grip[0], 0, 0))
      .addScaledVector(ahead, -grip[1])
      .addScaledVector(normal, lift);
  return { palm: { L: palm(1), R: palm(-1) }, far: mid.clone().addScaledVector(ahead, DEVICE.size[1] / 2) };
}

test("DeviceSit holds the tablet by its side edges and DeviceLie by its near edge's corners, both palms on the grip every frame", () => {
  assert.deepEqual(DEVICE.clips.DeviceSit.grip, [DEVICE.size[0] / 2, 0], 'sitting: the side edges’ middles');
  const [gx, gy] = DEVICE.clips.DeviceLie.grip;
  assert.ok(Math.abs(gy - DEVICE.size[1] / 2) < 1e-9, 'lying: on its near edge');
  assert.ok(gx >= DEVICE.size[0] / 2 - 0.15 && gx <= DEVICE.size[0] / 2, 'lying: at its corners');
  for (const name of ['DeviceSit', 'DeviceLie']) {
    const { palm } = deviceGeometry(name);
    for (const [t, pose] of samples(clip(name), FPS)) {
      const w = glb.world(pose);
      for (const s of ['L', 'R']) {
        // (track()'s hand is 1.0 along the bone: transformDirection normalizes)
        const m = w(`ForeArm.${s}`);
        const along = new THREE.Vector3(0, 1, 0).transformDirection(m).multiplyScalar(DEVICE.palm);
        const d = new THREE.Vector3().setFromMatrixPosition(m).add(along).distanceTo(palm[s]);
        assert.ok(d <= 0.08, `${name} at ${t.toFixed(2)} s: the ${s} palm is ${d.toFixed(3)} from the grip`);
      }
    }
  }
});

test("DeviceLie (the user's pose): belly and hips flat, chest raised 15-25 degrees, arms nearly straight forward, the tablet past his face, the feet kicking", () => {
  const above = (w, n) => {
    const d = new THREE.Vector3(0, 1, 0).transformDirection(w(n));
    return Math.asin(d.y) / DEG;
  };
  const head = skinnedMesh(glb, 'Head');
  const { far } = deviceGeometry('DeviceLie');
  const rows = track('DeviceLie', FPS);
  for (const [t, pose] of samples(clip('DeviceLie'), FPS)) {
    const w = glb.world(pose);
    const at = `at ${t.toFixed(2)} s`;
    const hips = above(w, 'Bone');
    assert.ok(Math.abs(hips) <= 10, `${at} his hips are ${hips.toFixed(1)}° off flat`);
    const chest = above(w, 'Chest');
    assert.ok(chest >= 15 && chest <= 25, `${at} his chest is raised ${chest.toFixed(1)}°`);
    for (const s of ['L', 'R']) {
      const upper = new THREE.Vector3(0, 1, 0).transformDirection(w(`Bicep.${s}`));
      const lower = new THREE.Vector3(0, 1, 0).transformDirection(w(`ForeArm.${s}`));
      const bend = upper.angleTo(lower) / DEG;
      assert.ok(bend <= 30, `${at} the ${s} elbow bends ${bend.toFixed(0)}°`);
      assert.ok(lower.z >= 0.8, `${at} the ${s} forearm points forward (${lower.z.toFixed(2)})`);
    }
    const face = Math.max(...head.at(pose).map((p) => p[2]));
    assert.ok(far.z >= face + 0.3, `${at} the tablet reaches ${far.z.toFixed(2)}, his face ${face.toFixed(2)}`);
  }
  for (const s of ['L', 'R']) {
    const kick = most(rows, (r) => r.ankle[s].y) - least(rows, (r) => r.ankle[s].y);
    assert.ok(kick >= 0.35, `the ${s} foot kicks ${kick.toFixed(2)} model units up and down`);
  }
  // In turn: when one is up the other is down.
  const mean = (s) => rows.reduce((a, r) => a + r.ankle[s].y, 0) / rows.length;
  const [mL, mR] = [mean('L'), mean('R')];
  const cov = rows.reduce((a, r) => a + (r.ankle.L.y - mL) * (r.ankle.R.y - mR), 0);
  assert.ok(cov < 0, 'the feet kick in turn');
});

test('DeviceLie rests on the floor, and his back hair keeps clear of his shirt', () => {
  const meshes = gltf.nodes.filter((n) => n.mesh != null && n.skin != null).map((n) => skinnedMesh(glb, n.name));
  const hair = skinnedMesh(glb, 'BackHair');
  const body = skinnedMesh(glb, 'Body');
  // (The hair's lower edge rests on his collar at rest: each vertex keeps 0.03, or what it has.)
  const restShell = [{ v: body.at(new Map()), tris: body.tris }];
  const room = hair.at(new Map()).map((p) => Math.min(0.03, nearestDistance(p, restShell)) - 0.005);
  for (const [t, pose] of samples(clip('DeviceLie'), 12)) {
    let low = Infinity;
    for (const m of meshes) for (const p of m.at(pose)) low = Math.min(low, p[1]);
    low *= SCALE;
    assert.ok(low >= -0.02 && low <= 0.08, `at ${t.toFixed(2)} s his lowest point is ${low.toFixed(3)} world units`);
    const shell = [{ v: body.at(pose), tris: body.tris }];
    hair.at(pose).forEach((p, i) => {
      const d = nearestDistance(p, shell);
      assert.ok(d >= room[i], `at ${t.toFixed(2)} s a back hair vertex is ${d.toFixed(3)} from his shirt`);
    });
  }
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

// (800 kB since round 16: its five clips (Thrash, DeviceSit, LieDown, DeviceLie, GetUp) cost about
// 20 kB each, most of it glTF JSON, and the old 650 kB had 10 kB to spare. The file loads behind
// the envelope that opens the page, which covers the wait.)
test('the file is under 800 kB', () => {
  assert.ok(glb.bytes < 800 * 1024, `${(glb.bytes / 1024).toFixed(0)} kB`);
});
