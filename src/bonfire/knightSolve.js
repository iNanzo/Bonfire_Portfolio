// Solving a pose (knightPose.js hands it out): its channels turned into each bone's rotation
// and place, with two-bone IK for the arms and legs, the tassets following the thighs and
// the pauldrons riding the arms, kept out of the helmet he wears (createSolver).
import * as THREE from 'three';
import { clamp, clamp01, smooth } from '../math.js';
import {
  DEG,
  POSE,
  BONES,
  PARENT,
  IDX,
  PAULDRON,
  TASSET_FOLLOW,
  DEFAULT_RIG,
  helmDepth,
  sideOf,
  legOf,
  eulerQ,
} from './knightRig.js';

// --- solving: pose → bone rotations ----------------------------------------------------------
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dn = new THREE.Vector3();
const _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** A frame whose y is `dir` and whose x is `hinge` (made square to it). */
function frame(out, dir, hinge) {
  const y = _v.copy(dir).normalize();
  const x = _v2.copy(hinge).addScaledVector(y, -hinge.dot(y));
  if (x.lengthSq() < 1e-10) x.copy(Math.abs(y.x) < 0.9 ? X : Y).addScaledVector(y, -(Math.abs(y.x) < 0.9 ? y.x : y.y));
  x.normalize();
  _m.makeBasis(x, y, _v3.crossVectors(x, y));
  return out.setFromRotationMatrix(_m);
}

/**
 * Two bones from S reaching for T (m, lengths a and b), bending toward `pole`: writes the
 * middle joint to `mid` and the reached point to `end` (T, or as near as the bones allow).
 * Returns the unit bend direction (toward the middle joint, square to S→end).
 */
function twoBone(S, T, a, b, pole, mid, end, bendOut) {
  const dn = _dn.copy(T).sub(S);
  let dist = dn.length();
  const lo = Math.abs(a - b) + 1e-3;
  const hi = (a + b) * 0.999;
  if (dist < 1e-6) {
    dn.set(0, -1, 0);
    dist = lo;
  } else dn.divideScalar(dist);
  dist = clamp(dist, lo, hi);
  const pp = bendOut.copy(pole).addScaledVector(dn, -pole.dot(dn));
  if (pp.lengthSq() < 1e-8) pp.set(0, 0, 1).addScaledVector(dn, -dn.z);
  if (pp.lengthSq() < 1e-8) pp.set(0, 1, 0).addScaledVector(dn, -dn.y);
  pp.normalize();
  const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  mid
    .copy(S)
    .addScaledVector(dn, a * cosA)
    .addScaledVector(pp, a * sinA);
  end.copy(S).addScaledVector(dn, dist);
  return pp;
}

/**
 * A solver for one rig. solve(pose, ground?, helmet?) returns { q, p, knee, elbow }: each
 * bone's rotation from its rest orientation (knight space, a "world delta") and its position
 * (knight space), by BONES index; `ground` [left, right] raises each foot's floor (m);
 * `helmet` (with the rig's plates) keeps the pauldrons out of it. clampPlates(helmet) does
 * that again on the last solve's plates (after knightPlates.js springs them);
 * swingArm(side, axis, angle, helmet) turns an arm of the last solve about its shoulder. The
 * arrays are reused: copy what you keep.
 */
export function createSolver(rig = DEFAULT_RIG) {
  const n = BONES.length;
  const q = Array.from({ length: n }, () => new THREE.Quaternion());
  const p = Array.from({ length: n }, () => new THREE.Vector3());
  const rest = BONES.map((b) => rig.pos[b]);
  const off = BONES.map((b, i) => (PARENT[b] ? rest[i].clone().sub(rest[IDX[PARENT[b]]]) : rest[i].clone()));
  // Each limb bone's rest frame (its direction and a hinge across it).
  const restFrame = (from, to, hinge) =>
    frame(new THREE.Quaternion(), rest[IDX[to]].clone().sub(rest[IDX[from]]), hinge);
  const hingeX = new THREE.Vector3(1, 0, 0);
  const R = {};
  const hang = {};
  for (const s of ['L', 'R']) {
    R['upperArm' + s] = restFrame('upperArm' + s, 'forearm' + s, hingeX).invert();
    R['forearm' + s] = restFrame('forearm' + s, 'hand' + s, hingeX).invert();
    R['thigh' + s] = restFrame('thigh' + s, 'shin' + s, hingeX).invert();
    R['shin' + s] = restFrame('shin' + s, 'foot' + s, hingeX).invert();
    hang[s] = rest[IDX['forearm' + s]]
      .clone()
      .sub(rest[IDX['upperArm' + s]])
      .normalize();
  }
  const [A1, A2] = rig.arm;
  const [L1, L2] = rig.leg;
  const S = new THREE.Vector3();
  const T = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const end = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const hinge = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const out = { q, p, knee: [0, 0], elbow: [0, 0] };

  /** Place bone i: rotation `rot` (world delta), position from its parent. */
  const fk = (i, rot) => {
    q[i].copy(rot);
    const par = PARENT[BONES[i]];
    if (par) p[i].copy(off[i]).applyQuaternion(q[IDX[par]]).add(p[IDX[par]]);
  };
  /** A two-bone limb's upper and lower bones from the solved joints, square to the bend plane. */
  function limb(upper, lower, s0, m, e, hingeDir) {
    q[IDX[upper]].copy(frame(qa, dir.copy(m).sub(s0), hingeDir)).multiply(R[upper]);
    p[IDX[lower]].copy(m);
    q[IDX[lower]].copy(frame(qa, dir.copy(e).sub(m), hingeDir)).multiply(R[lower]);
  }

  // --- the pauldrons ----------------------------------------------------------------------------
  const swing = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const share = new THREE.Quaternion();
  const up = new THREE.Vector3();
  const axis = new THREE.Vector3();
  /**
   * The dome and the lames of side s (sg its sign) from the arm just solved: a share of the
   * arm's swing from hanging, in the chest's frame (no twist), and above level a lift and
   * an outward roll.
   */
  function pauldron(s, sg, chest) {
    const sh = IDX['shoulder' + s],
      pa = IDX['pauldron' + s];
    up.copy(mid).sub(S).normalize().applyQuaternion(qa.copy(chest).invert());
    swing.setFromUnitVectors(hang[s], up);
    const half = Math.acos(clamp(swing.w, -1, 1));
    let wf = 1;
    if (half > 1e-5) {
      // A raise out to the side turns about the chest's forward axis and counts fully; forward
      // or back (about its left) and round at shoulder height (about its up) count less.
      axis.set(swing.x, swing.y, swing.z).divideScalar(Math.sin(half));
      wf = axis.z * axis.z + PAULDRON.flexion * axis.x * axis.x + PAULDRON.sweep * axis.y * axis.y;
    }
    const over = smooth(clamp01((Math.acos(clamp(-up.y, -1, 1)) - 80 * DEG) / (80 * DEG)));
    turn.setFromAxisAngle(Z_AXIS, -sg * PAULDRON.roll * over);
    const dome = rig.lamesNode === false ? PAULDRON.alone : PAULDRON.dome;
    q[sh].copy(chest).multiply(_q.copy(turn).multiply(share.identity().slerp(swing, dome * wf)));
    p[sh].copy(S).add(_v.set(sg * PAULDRON.lift[0] * over, PAULDRON.lift[1] * over, 0).applyQuaternion(chest));
    q[pa].copy(chest).multiply(_q.copy(turn).multiply(share.identity().slerp(swing, PAULDRON.lames * wf)));
    p[pa].copy(off[pa]).applyQuaternion(q[sh]).add(p[sh]);
  }
  const hq = new THREE.Quaternion();
  const away = new THREE.Vector3();
  const w = new THREE.Vector3();
  const pq = new THREE.Quaternion();
  /** Whether any of a plate's points go deeper than `allow` into the helmet, the pauldron pushed `d` m `away`. */
  function deeper(pts, sg, bone, env, d, allow) {
    // (Its points straight into the head's space: its turn and place, the head's undone. The
    // knights check the pauldrons every pose they solve: a matrix, not two turns a point.)
    const { x, y, z, w: qw } = pq.multiplyQuaternions(hq, q[bone]);
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2,
      yy = y * y2,
      yz = y * z2,
      zz = z * z2,
      wx = qw * x2,
      wy = qw * y2,
      wz = qw * z2;
    const r00 = sg * (1 - (yy + zz)),
      r01 = xy - wz,
      r02 = xz + wy;
    const r10 = sg * (xy + wz),
      r11 = 1 - (xx + zz),
      r12 = yz - wx;
    const r20 = sg * (xz - wy),
      r21 = yz + wx,
      r22 = 1 - (xx + yy);
    w.copy(p[bone]).addScaledVector(away, d).sub(p[IDX.head]).applyQuaternion(hq);
    for (let i = 0; i < pts.length; i += 3) {
      const px = pts[i],
        py = pts[i + 1],
        pz = pts[i + 2];
      if (
        helmDepth(
          env,
          r00 * px + r01 * py + r02 * pz + w.x,
          r10 * px + r11 * py + r12 * pz + w.y,
          r20 * px + r21 * py + r22 * pz + w.z,
        ) > allow
      )
        return true;
    }
    return false;
  }
  /** Whether side s's pauldron (its sign sg; dome sh, lames pa) goes further into the helmet than it may, pushed `d` m `away`. */
  const platesIn = (env, sg, sh, pa, d) =>
    deeper(rig.plates.dome, sg, sh, env, d, env.allow.dome) ||
    deeper(rig.plates.lames, sg, pa, env, d, env.allow.lames);
  /**
   * Keep the pauldrons out of the helmet (no deeper than the model sits at rest): a dome or
   * its lames that would go further in are shoved out from the neck and a little down, the
   * whole pauldron together, as little as it takes (at most PAULDRON.push).
   */
  function clampPlates(helmet) {
    const env = helmet && rig.plates?.helmets?.[helmet];
    if (!env) return;
    hq.copy(q[IDX.head]).invert();
    for (let side = 0; side < 2; side++) {
      const sg = side ? -1 : 1;
      const sh = side ? IDX.shoulderR : IDX.shoulderL,
        pa = side ? IDX.pauldronR : IDX.pauldronL;
      away.set(sg, -0.3, 0).normalize().applyQuaternion(q[IDX.chest]);
      if (!platesIn(env, sg, sh, pa, 0)) continue;
      let lo = 0,
        hi = PAULDRON.push;
      if (platesIn(env, sg, sh, pa, hi)) lo = hi;
      for (let it = 0; it < 7 && lo < hi; it++) {
        const m = (lo + hi) / 2;
        if (platesIn(env, sg, sh, pa, m)) lo = m;
        else hi = m;
      }
      p[sh].addScaledVector(away, hi);
      p[pa].copy(off[pa]).applyQuaternion(q[sh]).add(p[sh]);
    }
  }

  const turnQ = new THREE.Quaternion();
  /**
   * Turn side s's arm as last solved (the upper arm, forearm, hand and fingers, about its
   * shoulder socket) by `angle` (rad) about `axis` (knight space, unit): its pauldron rides it
   * again (kept out of `helmet`'s way if given: clampPlates). (knightClear.js keepClear: an
   * arm turned out of a pillar.)
   */
  function swingArm(s, axis, angle, helmet = null) {
    turnQ.setFromAxisAngle(axis, angle);
    S.copy(p[IDX['upperArm' + s]]);
    for (const b of ['upperArm', 'forearm', 'hand', 'fingers']) {
      const i = IDX[b + s];
      q[i].premultiply(turnQ);
      p[i].sub(S).applyQuaternion(turnQ).add(S);
    }
    mid.copy(p[IDX['forearm' + s]]);
    pauldron(s, s === 'L' ? 1 : -1, q[IDX.chest]);
    clampPlates(helmet);
    return out;
  }

  function solve(pose, ground = null, helmet = null) {
    // The spine, from the hips.
    const H = IDX.hips;
    p[H].set(rest[H].x + pose[0], rest[H].y + pose[1], rest[H].z + pose[2]);
    eulerQ(q[H], pose[POSE.hips], pose[POSE.hips + 1], pose[POSE.hips + 2]);
    for (const j of ['spine', 'chest', 'neck', 'head']) {
      const i = IDX[j];
      fk(i, _q.copy(q[IDX[PARENT[j]]]).multiply(eulerQ(_q2, pose[POSE[j]], pose[POSE[j] + 1], pose[POSE[j] + 2])));
    }
    const chest = q[IDX.chest];
    // Arms: the hand's place from the shoulder socket, the elbow toward its pole.
    for (const [si, s] of /** @type {[number, string][]} */ ([
      [0, 'L'],
      [1, 'R'],
    ])) {
      const sg = s === 'L' ? 1 : -1;
      const o = sideOf(s);
      fk(IDX['shoulder' + s], chest);
      fk(IDX['upperArm' + s], chest);
      S.copy(p[IDX['upperArm' + s]]);
      const yaw = pose[o],
        pitch = pose[o + 1];
      dir.set(sg * Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      // The elbow's natural way: back when the hand is down, down when it's forward, forward
      // and out when it's up; then turned about the arm by `elbow`.
      pole.crossVectors(X, dir).add(_v.set(0.3 * sg, 0, -0.3));
      pole.applyQuaternion(_q.setFromAxisAngle(dir, -sg * pose[o + 3]));
      dir.applyQuaternion(chest);
      pole.applyQuaternion(chest);
      T.copy(S).addScaledVector(dir, clamp(pose[o + 2], 0.2, 1) * (A1 + A2));
      const bd = twoBone(S, T, A1, A2, pole, mid, end, bend);
      // Hinge across the arm, the forearm folding toward the hand (away from the elbow).
      hinge.crossVectors(end.clone().sub(S), bd).normalize();
      limb('upperArm' + s, 'forearm' + s, S, mid, end, hinge);
      out.elbow[si] = Math.PI - mid.clone().sub(S).angleTo(end.clone().sub(mid).negate());
      const hand = IDX['hand' + s];
      p[hand].copy(end);
      q[hand].copy(q[IDX['forearm' + s]]).multiply(eulerQ(_q, pose[o + 4], 0, sg * pose[o + 5]));
      const fingers = IDX['fingers' + s];
      fk(fingers, _q.copy(q[hand]).multiply(_q2.setFromAxisAngle(Z_AXIS, -sg * pose[o + 6] * 1.5)));
      pauldron(s, sg, chest);
    }
    clampPlates(helmet);
    // Legs: the ankle's place (on its floor), the knee forward and a little out.
    const hipsYaw = pose[POSE.hips + 1];
    for (const [si, s] of /** @type {[number, string][]} */ ([
      [0, 'L'],
      [1, 'R'],
    ])) {
      const sg = s === 'L' ? 1 : -1;
      const o = legOf(s);
      const th = IDX['thigh' + s];
      fk(th, q[H]);
      S.copy(p[th]);
      const ra = rest[IDX['foot' + s]];
      T.set(ra.x + sg * pose[o], ra.y + pose[o + 1] + (ground ? ground[si] : 0), ra.z + pose[o + 2]);
      const kn = pose[o + 4];
      // (Up counts too: a leg drawn in along the ground folds its knee upward, not out.)
      pole.set(sg * Math.sin(kn), 1, Math.cos(kn)).applyAxisAngle(Y, hipsYaw);
      const bd = twoBone(S, T, L1, L2, pole, mid, end, bend);
      hinge.crossVectors(bd, end.clone().sub(S)).normalize();
      limb('thigh' + s, 'shin' + s, S, mid, end, hinge);
      out.knee[si] = Math.PI - mid.clone().sub(S).angleTo(end.clone().sub(mid).negate());
      const foot = IDX['foot' + s];
      p[foot].copy(end);
      // Feet stay flat to the ground whatever the leg does, turned with the body.
      eulerQ(q[foot], pose[o + 3], hipsYaw, 0);
      q[IDX['tasset' + s]].copy(q[H]).slerp(q[IDX['thigh' + s]], rig.tassetFollow ?? TASSET_FOLLOW);
      p[IDX['tasset' + s]]
        .copy(off[IDX['tasset' + s]])
        .applyQuaternion(q[H])
        .add(p[H]);
    }
    return out;
  }
  return { solve, clampPlates, swingArm, rest, n };
}
