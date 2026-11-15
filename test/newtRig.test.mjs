import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readGlbAnim, skinnedMesh, nearestDistance } from './lib/glbAnim.mjs';
import { standIn } from './lib/newtStandIn.mjs';
import { assertSound, assertLimits } from './lib/poseChecks.mjs';
import { createNewtRig, K, NEWT_NODES } from '../src/visualizer/newt/newtRig.js';
import { BONES, MOVES, GESTURES, GESTURE_TIME, standingPose, dance, gesture } from '../src/bonfire/knightPose.js';

const IDX = Object.fromEntries(BONES.map((b, i) => [b, i]));
const glb = readGlbAnim(new URL('../public/models/newt.glb', import.meta.url));
const blenderName = new Map(glb.gltf.nodes.map((n) => [n.name.replaceAll('.', ''), n.name]));
const rawWorld = glb.world(new Map());
const world = (name) => rawWorld(blenderName.get(name));
const { rig, solver } = createNewtRig(world);
const { gltf, bones } = standIn();
for (const node of glb.gltf.nodes) {
  const bone = bones[node.name.replaceAll('.', '')];
  if (!bone) continue;
  bone.position.fromArray(node.translation ?? [0, 0, 0]);
  bone.quaternion.fromArray(node.rotation ?? [0, 0, 0, 1]);
  bone.scale.fromArray(node.scale ?? [1, 1, 1]);
}
gltf.scene.updateMatrixWorld(true);
const restQuat = Object.fromEntries(
  Object.values(NEWT_NODES).map((name) => [name, bones[name].getWorldQuaternion(new THREE.Quaternion())]),
);
const mapped = new Map(Object.entries(NEWT_NODES).map(([key, name]) => [name, IDX[key]]));
const hands = skinnedMesh(glb, 'Hands');
const body = skinnedMesh(glb, 'Body');
const sleeves = Array.from({ length: body.count }, (_, i) => i).filter(
  (i) => body.weightOn(i, ['Bicep.L', 'ForeArm.L', 'Bicep.R', 'ForeArm.R']) > 0.5,
);
const heads = ['Head', 'Hat', 'BackHair', 'Plane', 'Plane.001', 'Plane.002'].map((name) => skinnedMesh(glb, name));

/** Apply knights.js's world = delta * rest, then parent world inverse, onto NEWT's bones. */
function clearanceOf(pose) {
  const solved = solver.solve(pose);
  for (const key of BONES) {
    const name = NEWT_NODES[key];
    if (!name) continue;
    const bone = bones[name];
    const i = IDX[key];
    const q = solved.q[i].clone().multiply(restQuat[name]);
    const pi = mapped.get(bone.parent.name);
    if (pi !== undefined) {
      const inv = solved.q[pi].clone().multiply(restQuat[bone.parent.name]).invert();
      bone.quaternion.copy(inv).multiply(q);
      bone.position
        .copy(solved.p[i])
        .sub(solved.p[pi])
        .multiplyScalar(1 / K)
        .applyQuaternion(inv);
    } else {
      bone.quaternion.copy(q);
      bone.position.copy(solved.p[i]).multiplyScalar(1 / K);
    }
  }
  gltf.scene.updateMatrixWorld(true);
  const local = new Map(
    Object.entries(bones).map(([name, b]) => [
      blenderName.get(name),
      { translation: b.position.toArray(), rotation: b.quaternion.toArray(), scale: b.scale.toArray() },
    ]),
  );
  const shells = heads.map((h) => ({ v: h.at(local), tris: h.tris }));
  const head = shells[0];
  const ray = new THREE.Ray();
  const direction = new THREE.Vector3(1, 0.137, 0.219).normalize();
  const hit = new THREE.Vector3();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  function distance(point) {
    const d = nearestDistance(point, shells);
    if (point.some((v, i) => v < head.box.min[i] || v > head.box.max[i])) return d;
    ray.set(new THREE.Vector3(...point), direction);
    const crossings = new Set();
    for (const [i, j, k] of head.tris) {
      if (ray.intersectTriangle(a.fromArray(head.v[i]), b.fromArray(head.v[j]), c.fromArray(head.v[k]), false, hit))
        crossings.add(ray.origin.distanceTo(hit).toFixed(7));
    }
    return crossings.size % 2 ? -d : d;
  }
  let hand = Infinity,
    arm = Infinity;
  for (const point of hands.at(local)) hand = Math.min(hand, distance(point));
  const bv = body.at(local);
  for (const i of sleeves) arm = Math.min(arm, distance(bv[i]));
  return Math.min(hand, arm);
}

// Measured at the literal 0.1 model-unit threshold; stomp and beckon are draft blockers.
const KNOWN_INTRUDING = new Set([
  'stepTouch',
  'fistPump',
  'swayArms',
  'march',
  'spin',
  'jump',
  'jumpingJack',
  'clap',
  'stomp',
  'praise',
  'defaultDance',
  'gesture:praise',
  'gesture:wave',
  'gesture:point',
  'gesture:beckon',
  'gesture:shrug',
  'gesture:hurrah',
  'gesture:joy',
  'gesture:dance',
  'gesture:helm',
]);

test('NEWT rest rig solves every move and gesture; clearance stays documented [slow]', () => {
  const observed = new Set();
  const required = new Set(['nod', 'stomp', 'gesture:beckon']);
  const clearances = new Map();
  for (const name of [
    ...MOVES,
    ...Array.from(new Set([...GESTURES, ...Object.keys(GESTURE_TIME)]), (g) => `gesture:${g}`),
  ]) {
    let room = Infinity;
    for (const seed of [0, 3])
      for (let frame = 0; frame <= 64; frame++) {
        const beat = frame / 4;
        const p = standingPose();
        if (name.startsWith('gesture:')) {
          const g = name.slice(8);
          gesture(p, g, (beat / 16) * (GESTURE_TIME[g] - 1e-6), false, seed);
        } else dance(p, name, beat, { seated: false, seed });
        const solved = assertSound(p, `${name} ${seed}/${beat}`, { solver, rig });
        assertLimits(solved, name, { solver, rig });
        // Measure required clear moves fully; every move and gesture still gets solved and checked.
        if (room >= 0.1 || required.has(name)) room = Math.min(room, clearanceOf(p));
      }
    console.log(name, room);
    if (room < 0.1) observed.add(name);
    clearances.set(name, room);
  }
  assert.deepEqual(observed, KNOWN_INTRUDING);
  // Check the literal acceptance gate after every move/gesture has been measured.
  for (const name of required)
    assert.ok(clearances.get(name) >= 0.1, `${name}: ${clearances.get(name)} model units from head`);
});
