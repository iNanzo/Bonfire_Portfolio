import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BONES, POSE_SIZE } from '../../src/bonfire/knightPose.js';
const I = Object.fromEntries(BONES.map((b, i) => [b, i]));
const DEG = 180 / Math.PI;
/** Every number in a pose and its solution is finite. */
export function assertSound(p, label, { solver, rig }) {
  for (let i = 0; i < POSE_SIZE; i++) assert.ok(Number.isFinite(p[i]), `${label}: channel ${i} is ${p[i]}`);
  const s = solver.solve(p);
  for (let i = 0; i < BONES.length; i++) {
    const q = s.q[i];
    assert.ok(
      [q.x, q.y, q.z, q.w].every(Number.isFinite) && Math.abs(q.length() - 1) < 1e-4,
      `${label}: ${BONES[i]} rotation`,
    );
    assert.ok(s.p[i].toArray().every(Number.isFinite), `${label}: ${BONES[i]} position`);
  }
  return s;
}
/** Knees and elbows bend the way they can, and not past closed. */
export function assertLimits(s, label, { solver, rig }) {
  for (const k of s.knee) assert.ok(k >= -0.02 && k <= 155 / DEG, `${label}: knee bent ${(k * DEG).toFixed(0)}°`);
  for (const e of s.elbow) assert.ok(e >= -0.02 && e <= 168 / DEG, `${label}: elbow bent ${(e * DEG).toFixed(0)}°`);
  for (const side of ['L', 'R']) {
    // The knee bends forward (or up, legs drawn in): it's in front of or above the line from
    // hip to ankle, in the body's own frame.
    const hip = s.p[I['thigh' + side]],
      knee = s.p[I['shin' + side]],
      ankle = s.p[I['foot' + side]];
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(s.q[I.hips]).setY(0).normalize();
    const mid = hip.clone().lerp(ankle, 0.5);
    assert.ok(
      knee
        .clone()
        .sub(mid)
        .dot(fwd.add(new THREE.Vector3(0, 1, 0)).normalize()) > -0.03,
      `${label}: ${side} knee bends backward`,
    );
    // Feet never go through the ground.
    assert.ok(ankle.y > rig.ankleY - 0.03, `${label}: ${side} foot under the ground (${ankle.y.toFixed(3)})`);
  }
  // The head stays on a neck: not turned or bent past what the helmet allows.
  const headUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.q[I.head]);
  const chestUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.q[I.chest]);
  assert.ok(
    headUp.angleTo(chestUp) < 95 / DEG,
    `${label}: head bent ${(headUp.angleTo(chestUp) * DEG).toFixed(0)}° from the chest`,
  );
}
