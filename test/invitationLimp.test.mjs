// NEWT's limp limbs and his earrings (src/invitation/character.js) with three.js in Node, on the
// stand-in skeleton (test/lib/newtStandIn.mjs) and, for where the earrings hang, newt.glb's own
// head mesh. While he's carried (and through the fall), a spring layer on his 12 arm and leg
// bones (carry.js limbStep: a point mass at each limb's end, pinned at its joint) answers his
// joints' acceleration and gravity against the clip's upright pose, and springs back to that
// pose: still and upright, his limbs keep it exactly; dragged, they lag behind; tilted by the
// swing, they hang back toward the floor. It never adds up from frame to frame (restored before
// the mixer like the look's bones), never touches his chest, neck or head, does nothing on a
// frame his pose didn't step (limp(0): Motion Choppy) and eases out over 0.2 s once he's down.
// His earrings: a flat black stud on each earlobe (measured from the glb's head mesh), a thin
// black line and a Latin cross about 2.5 times the stud's width, toon and marked as his so they
// get his outlines; each hangs straight down from its stud and swings back against his head's
// acceleration (the same integrator), then settles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter, EARLOBES, EARRING, LIMBS } from '../src/invitation/character.js';
import { LIMP } from '../src/invitation/carry.js';
import { BONES } from '../src/invitation/clips.js';
import { standIn } from './lib/newtStandIn.mjs';
import { readGlbAnim, skinnedMesh } from './lib/glbAnim.mjs';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);
/** The angle between two rotations, radians (from the chord, so tiny angles hold up). */
function angle(a, b) {
  const u = a.clone().normalize();
  const v = b.clone().normalize();
  const d = (s) => Math.hypot(u.x - s * v.x, u.y - s * v.y, u.z - s * v.z, u.w - s * v.w);
  return 4 * Math.asin(Math.min(1, Math.min(d(1), d(-1)) / 2));
}
/** A clip holding some bones still, each in one rotation. */
function still(name, length, rots) {
  return new THREE.AnimationClip(
    name,
    length,
    Object.entries(rots).map(
      ([bone, r]) =>
        new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, [0, length], [...r.toArray(), ...r.toArray()]),
    ),
  );
}
/** Where a bone points in the world: its +Y. */
const axisOf = (bone) => new THREE.Vector3(0, 1, 0).transformDirection(bone.matrixWorld);
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * The stand-in in a held pose: his left arm hanging (the shoulder turned half round), the rest
 * as the stand-in has them; `frame(on)` steps one frame as main.js does (update, limp, matrices).
 */
function held() {
  const pose = still('Held', 1.5, { [BONES.shoulderL]: q(Z, 180), [BONES.chest]: q(X, 0) });
  const s = standIn([pose]);
  const ch = createCharacter(s.gltf);
  ch.setWeights({ Held: 1 }, 0);
  ch.restart('Held');
  const frame = (on = true, dt = DT) => {
    ch.update(dt);
    ch.limp(dt, on);
    ch.root.updateMatrixWorld(true);
  };
  frame();
  return { ...s, ch, frame };
}

test('the limp layer: 12 bones, his arms’ and legs’ (never his chest, neck or head), each in a cone of at most 60°', () => {
  const names = LIMBS.map((l) => l.bone);
  assert.deepEqual(
    [...names].sort(),
    [
      BONES.bicepL,
      BONES.bicepR,
      BONES.calfL,
      BONES.calfR,
      BONES.footL,
      BONES.footR,
      BONES.forearmL,
      BONES.forearmR,
      BONES.shoulderL,
      BONES.shoulderR,
      BONES.thighL,
      BONES.thighR,
    ].sort(),
  );
  for (const l of LIMBS) assert.ok(l.cone > 0 && l.cone <= LIMP.cone + 1e-6, `${l.bone}: ${l.cone}`);
});

test('still and upright, his limbs keep the clip’s pose exactly; dragged, they lag behind the drag and spring back, settling', () => {
  const { ch, bones, frame } = held();
  const forearm = bones[BONES.forearmL];
  const rest = forearm.quaternion.clone();
  for (let i = 0; i < 30; i++) frame();
  assert.ok(angle(forearm.quaternion, rest) < 1e-6, 'held still: the clip’s pose');
  assert.equal(ch.limpWeight, 1, 'on while he’s held');
  // Dragged along +x, harder and harder for a third of a second: his hanging hand trails −x.
  const before = axisOf(forearm);
  let v = 0;
  let most = 0;
  for (let i = 0; i < 20; i++) {
    v += 12 * DT;
    ch.root.position.x += v * DT;
    frame();
    most = Math.max(most, ...Object.values(ch.limpAngles()));
  }
  const lag = axisOf(forearm).sub(before);
  assert.ok(lag.x < -0.05, `the hand trails the drag: the forearm's end swings toward −x ${lag.x}`);
  assert.ok(most > 0.1, `a limb swung ${most} rad`);
  // Then held still: it swings back and settles on the clip's pose.
  for (let i = 0; i < 300; i++) frame();
  assert.ok(Math.max(...Object.values(ch.limpAngles())) < 0.01, 'settled in 5 s');
  assert.ok(angle(forearm.quaternion, rest) < 0.01);
});

test('tilted by the swing, his hanging limbs hang back toward the floor (gravity against the clip’s upright pose)', () => {
  const { ch, bones, frame } = held();
  ch.root.rotation.z = 0.6;
  for (let i = 0; i < 300; i++) frame();
  const off = axisOf(bones[BONES.forearmL]).negate().angleTo(DOWN);
  assert.ok(off < 0.6 * 0.5, `his hanging arm ${off.toFixed(3)} rad off straight down, the body tilted 0.6`);
  assert.ok(off > 0.02, 'not stiff as a pendulum either: the clip’s pose still pulls');
});

test('it never adds up, never touches his chest, neck or head, does nothing on a frame his pose didn’t step, and eases out over 0.2 s once he’s down', () => {
  const { ch, bones, frame } = held();
  const look = [BONES.chest, BONES.neck, BONES.head].map((n) => bones[n]);
  // Shaken about for two seconds: the look's bones are the clip's (and the look's) alone.
  for (let i = 0; i < 120; i++) {
    ch.update(DT);
    const saved = look.map((b) => b.quaternion.clone());
    ch.root.position.x = 0.3 * Math.sin(i / 3);
    ch.root.position.y = 0.2 * Math.cos(i / 4);
    ch.limp(DT, true);
    look.forEach((b, k) => assert.ok(angle(b.quaternion, saved[k]) < 1e-6, `${b.name} untouched`));
    ch.root.updateMatrixWorld(true);
  }
  // A frame his pose didn't step (Motion Choppy): nothing moves.
  const now = Object.fromEntries(LIMBS.map((l) => [l.bone, bones[l.bone].quaternion.clone()]));
  ch.root.position.x += 0.4;
  ch.limp(0, true);
  for (const l of LIMBS) assert.ok(angle(bones[l.bone].quaternion, now[l.bone]) < 1e-6, `${l.bone}: no step`);
  // Let down: eased out over 0.2 s, then the clip's own pose exactly, frame after frame.
  frame(false);
  assert.ok(ch.limpWeight < 1 && ch.limpWeight > 0.8, `easing out: ${ch.limpWeight}`);
  for (let i = 0; i < 5; i++) frame(false);
  assert.ok(Math.abs(ch.limpWeight - (1 - (6 * DT) / LIMP.ease)) < 1e-6, `${ch.limpWeight} after 0.1 s`);
  for (let i = 0; i < 12; i++) frame(false);
  assert.equal(ch.limpWeight, 0);
  const rest = held();
  for (const l of LIMBS)
    assert.ok(angle(bones[l.bone].quaternion, rest.bones[l.bone].quaternion) < 1e-6, `${l.bone}: the clip's pose`);
  // Picked up again, it starts from the clip's pose (no pop).
  frame(true);
  for (const l of LIMBS)
    assert.ok(angle(bones[l.bone].quaternion, rest.bones[l.bone].quaternion) < 1e-6, `${l.bone}: no pop`);
});

test('his earrings: at each earlobe on his head bone a flat black stud, a thin black line and a Latin cross about 2.5 times the stud’s width, toon and marked as his', () => {
  const { gltf, bones } = standIn();
  const ch = createCharacter(gltf);
  assert.equal(ch.earrings.length, 2);
  const size = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  for (const e of ch.earrings) {
    assert.equal(e.group.parent, bones[BONES.head], `${e.side}: on his head bone`);
    assert.deepEqual(e.group.position.toArray(), EARLOBES[e.side], `${e.side}: at the earlobe`);
    for (const part of [e.stud, e.line, ...e.cross]) {
      const m = part.material;
      assert.ok(m.isMeshToonMaterial, `${part.name}: toon`);
      assert.ok(m.color.r + m.color.g + m.color.b < 0.3, `${part.name}: black`);
      assert.match(m.customProgramCacheKey(), /invitation-surface-id/, `${part.name}: marked as his`);
      assert.equal(part.castShadow, true);
    }
  }
  ch.root.updateMatrixWorld(true);
  const e = ch.earrings[0];
  const stud = size(e.stud);
  const studWide = Math.max(stud.y, stud.z);
  assert.ok(stud.x < studWide / 2, 'the stud is flat, facing out');
  const [bar, arm] = e.cross.map(size);
  const crossWide = Math.max(arm.x, arm.z);
  assert.ok(Math.abs(crossWide / studWide - 2.5) < 0.4, `the cross ${crossWide / studWide}× the stud`);
  assert.ok(bar.y > crossWide * 1.3, 'a Latin cross: taller than wide');
  const line = size(e.line);
  assert.ok(Math.max(line.x, line.z) < studWide / 3 && line.y > Math.max(line.x, line.z) * 4, 'a thin line');
  assert.ok(Math.abs(EARRING.cross.w / EARRING.stud - 2.5) < 0.4, 'the sizes as the module has them');
});

test('his earrings sit at his earlobes as newt.glb’s head mesh has them', () => {
  const glb = readGlbAnim(new URL('../public/models/newt.glb', import.meta.url));
  const pose = new Map();
  const head = glb.worldPos(pose, 'Neck.001');
  const verts = skinnedMesh(glb, 'Head').at(pose);
  for (const [side, sign] of [
    ['L', 1],
    ['R', -1],
  ]) {
    // His ear: the head mesh out past his hair at that side; its lobe, the ear's lowest part.
    const ear = verts.filter((p) => sign * p[0] > 1.25).sort((a, b) => a[1] - b[1]);
    assert.ok(ear.length > 10, `${side}: an ear`);
    const lobe = ear.slice(0, Math.ceil(ear.length / 5));
    const mean = [0, 1, 2].map((k) => lobe.reduce((s, p) => s + p[k], 0) / lobe.length);
    const at = EARLOBES[side].map((v, k) => v + head[k]);
    assert.ok(Math.abs(at[0] - mean[0]) < 0.12, `${side}: x ${at[0]} by the lobe's ${mean[0]}`);
    assert.ok(Math.abs(at[1] - mean[1]) < 0.12, `${side}: y ${at[1]} by the lobe's ${mean[1]}`);
    assert.ok(Math.abs(at[2] - mean[2]) < 0.15, `${side}: z ${at[2]} by the lobe's ${mean[2]}`);
    assert.ok(sign * at[0] >= sign * mean[0] - 0.02, `${side}: on the lobe's outside`);
  }
});

test('each earring hangs straight down from its stud, swings back against his head’s acceleration and settles, whichever way he faces', () => {
  const { gltf } = standIn();
  const ch = createCharacter(gltf);
  const hang = (e) => {
    const top = e.pivot.getWorldPosition(new THREE.Vector3());
    const end = e.cross[0].getWorldPosition(new THREE.Vector3());
    return end.sub(top).normalize();
  };
  const frame = () => {
    ch.update(DT);
    ch.root.updateMatrixWorld(true);
    ch.accessories(DT, 0);
    ch.root.updateMatrixWorld(true);
  };
  for (const yaw of [0, 1.2, -2.5]) {
    ch.root.rotation.y = yaw;
    ch.root.position.set(0, 0, 0);
    for (let i = 0; i < 240; i++) frame();
    for (const e of ch.earrings) assert.ok(hang(e).angleTo(DOWN) < 0.02, `yaw ${yaw}: ${e.side} hangs straight down`);
  }
  // His head jerked along +z: they swing back (−z), then settle again.
  let v = 0;
  for (let i = 0; i < 12; i++) {
    v += 15 * DT;
    ch.root.position.z += v * DT;
    frame();
  }
  for (const e of ch.earrings) assert.ok(hang(e).z < -0.1, `${e.side} swings back: ${hang(e).z}`);
  for (let i = 0; i < 300; i++) frame();
  for (const e of ch.earrings) assert.ok(hang(e).angleTo(DOWN) < 0.02, `${e.side} settled`);
  // A frame his pose didn't step (Motion Choppy): they don't move.
  const was = ch.earrings.map((e) => e.pivot.quaternion.clone());
  ch.root.position.x += 0.5;
  ch.root.updateMatrixWorld(true);
  ch.accessories(0, 0);
  ch.earrings.forEach((e, k) => assert.ok(angle(e.pivot.quaternion, was[k]) < 1e-6));
});
