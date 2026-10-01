// The knight's body language (src/bonfire/knightPose.js): seated legs meet the ground at any
// seat height (resting or watchful), every move and gesture gives a sound pose, the moves
// keep to the beat, the joints stay within what a body (in plate) can do, the head looks
// level, the feet step instead of sliding, the pauldrons ride the arms and stay out of every
// helmet (on the real model's pieces), and the Default Dance and the site's dance read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BONES, BONE_NODES, POSE_SIZE, DEFAULT_RIG, DEFAULT_REST, SEAT_DEPTH, SEAT_POSES, MOVES, MOVE_INFO, GESTURES, GESTURE_TIME, CHEERS,
  DANCE_BPM, PAULDRON, createSolver, measureRig, measurePlates, newPose, seatedPose, standingPose, standBy, seatFeet, dance,
  gesture, idle, look, flinch, shield, hop, rise, walk, mirrorPose, RISE_TIME,
} from '../src/bonfire/knightPose.js';
import { loadKnightMesh } from './lib/knightMesh.mjs';

const solver = createSolver(DEFAULT_RIG);
const I = Object.fromEntries(BONES.map((b, i) => [b, i]));
const DEG = 180 / Math.PI;

/** Every number in a pose and its solution is finite. */
function assertSound(p, label) {
  for (let i = 0; i < POSE_SIZE; i++) assert.ok(Number.isFinite(p[i]), `${label}: channel ${i} is ${p[i]}`);
  const s = solver.solve(p);
  for (let i = 0; i < BONES.length; i++) {
    const q = s.q[i];
    assert.ok([q.x, q.y, q.z, q.w].every(Number.isFinite) && Math.abs(q.length() - 1) < 1e-4, `${label}: ${BONES[i]} rotation`);
    assert.ok(s.p[i].toArray().every(Number.isFinite), `${label}: ${BONES[i]} position`);
  }
  return s;
}
/** Knees and elbows bend the way they can, and not past closed. */
function assertLimits(s, label) {
  for (const k of s.knee) assert.ok(k >= -0.02 && k <= 155 / DEG, `${label}: knee bent ${(k * DEG).toFixed(0)}°`);
  for (const e of s.elbow) assert.ok(e >= -0.02 && e <= 168 / DEG, `${label}: elbow bent ${(e * DEG).toFixed(0)}°`);
  for (const side of ['L', 'R']) {
    // The knee bends forward (or up, legs drawn in): it's in front of or above the line from
    // hip to ankle, in the body's own frame.
    const hip = s.p[I['thigh' + side]], knee = s.p[I['shin' + side]], ankle = s.p[I['foot' + side]];
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(s.q[I.hips]).setY(0).normalize();
    const mid = hip.clone().lerp(ankle, 0.5);
    assert.ok(knee.clone().sub(mid).dot(fwd.add(new THREE.Vector3(0, 1, 0)).normalize()) > -0.03, `${label}: ${side} knee bends backward`);
    // Feet never go through the ground.
    assert.ok(ankle.y > DEFAULT_RIG.ankleY - 0.03, `${label}: ${side} foot under the ground (${ankle.y.toFixed(3)})`);
  }
  // The head stays on a neck: not turned or bent past what the helmet allows.
  const headUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.q[I.head]);
  const chestUp = new THREE.Vector3(0, 1, 0).applyQuaternion(s.q[I.chest]);
  assert.ok(headUp.angleTo(chestUp) < 95 / DEG, `${label}: head bent ${(headUp.angleTo(chestUp) * DEG).toFixed(0)}° from the chest`);
}

test('seated, the feet meet the ground for every seat height, the hips on the seat', () => {
  for (const h of [0, 0.23, 0.28, 0.32, 0.36, 0.4, 0.42]) {
    const p = seatedPose(newPose(), h);
    const s = assertSound(p, `seat ${h}`);
    assertLimits(s, `seat ${h}`);
    for (const side of ['L', 'R']) {
      const ankle = s.p[I['foot' + side]];
      assert.ok(Math.abs(ankle.y - DEFAULT_RIG.ankleY) < 0.002, `seat ${h}: ${side} foot at ${ankle.y.toFixed(3)}, not on the ground`);
      assert.ok(ankle.z > 0.2, `seat ${h}: ${side} foot in front of the seat`);
    }
    assert.ok(Math.abs(s.p[I.hips].y - (h + SEAT_DEPTH)) < 1e-6, `seat ${h}: hips on the seat`);
    // Uneven ground: a foot on a stone 8 cm up still meets it.
    const t = solver.solve(p, [0.08, 0]);
    assert.ok(Math.abs(t.p[I.footL].y - (DEFAULT_RIG.ankleY + 0.08)) < 0.002, `seat ${h}: the raised foot meets its stone`);
  }
});

test('the rest-like standing pose barely bends anything, and a mirrored pose mirrors back', () => {
  const p = standingPose();
  const s = assertSound(p, 'standing');
  assertLimits(s, 'standing');
  for (const b of ['thighL', 'shinL', 'thighR', 'shinR']) assert.ok(2 * Math.acos(Math.min(1, Math.abs(s.q[I[b]].w))) < 0.35, `${b} barely turned`);
  const m = mirrorPose(mirrorPose(Float32Array.from(p)));
  assert.deepEqual([...m], [...p]);
});

test('every move gives a sound pose in its limits over 64 beats, standing and (where it can) seated', () => {
  const stand = standingPose();
  const sit = seatedPose(newPose(), 0.36);
  for (const move of MOVES) {
    for (const seated of [false, true]) {
      if (seated && !MOVE_INFO[move].seated) continue;
      for (let b = 0; b < 64; b += 0.13) {
        for (const seed of [0, 1, 2, 3]) {
          const p = Float32Array.from(seated ? sit : stand);
          dance(p, move, b, { period: b > 32 ? 0.35 : 0.5, energy: (b % 7) / 7, seed, seated });
          const label = `${move}${seated ? ' seated' : ''} b=${b.toFixed(2)} seed ${seed}`;
          assertLimits(assertSound(p, label), label);
        }
      }
    }
  }
});

test('moves repeat on the beat: the pose at b and b + its cycle are the same', () => {
  const stand = standingPose();
  const a = new THREE.Quaternion();
  for (const move of MOVES) {
    const cycle = MOVE_INFO[move].cycle;
    for (let b = 0.05; b < 16; b += 0.37) {
      const p = dance(Float32Array.from(stand), move, b, { period: 0.5, energy: 0.8, seed: 2 });
      const s1 = solver.solve(p);
      const q1 = s1.q.map((q) => q.clone());
      const p1 = s1.p.map((v) => v.clone());
      const s2 = solver.solve(dance(Float32Array.from(stand), move, b + cycle, { period: 0.5, energy: 0.8, seed: 2 }));
      for (let i = 0; i < BONES.length; i++) {
        assert.ok(a.copy(q1[i]).angleTo(s2.q[i]) < 1e-3, `${move}: ${BONES[i]} differs a cycle later (b=${b.toFixed(2)})`);
        assert.ok(p1[i].distanceTo(s2.p[i]) < 1e-4, `${move}: ${BONES[i]} moved a cycle later`);
      }
    }
  }
});

test('moves are big: the body really moves over a bar (readable at a hundred texels)', () => {
  const stand = standingPose();
  for (const move of MOVES.filter((m) => m !== 'praise')) {
    let travel = 0;
    let prev = null;
    for (let b = 0; b < 4; b += 1 / 6) {
      const s = solver.solve(dance(Float32Array.from(stand), move, b, { period: 0.5, energy: 0.6 }));
      const pts = ['head', 'handL', 'handR', 'footL', 'footR', 'hips'].map((n) => s.p[I[n]].clone());
      if (prev) travel += pts.reduce((sum, v, i) => sum + v.distanceTo(prev[i]), 0);
      prev = pts;
    }
    assert.ok(travel > 2.5, `${move}: head, hands, feet and hips travel ${travel.toFixed(2)} m over a bar`);
  }
});

test('every gesture, reaction and transition gives a sound pose in its limits', () => {
  const stand = standingPose();
  const sit = seatedPose(newPose(), 0.36);
  for (const name of [...GESTURES, 'helm']) {
    for (const seated of [false, true]) {
      for (let t = 0; t <= GESTURE_TIME[name] + 0.2; t += 0.05) {
        const p = gesture(Float32Array.from(seated ? sit : stand), name, t, seated);
        const label = `${name}${seated ? ' seated' : ''} t=${t.toFixed(2)}`;
        assertLimits(assertSound(p, label), label);
      }
      // Over and done: back to the pose it started from.
      const end = gesture(Float32Array.from(seated ? sit : stand), name, GESTURE_TIME[name] + 0.01, seated);
      assert.deepEqual([...end], [...(seated ? sit : stand)], `${name}: ends where it began`);
    }
  }
  for (let t = 0; t < 1.4; t += 0.05) {
    for (const seated of [false, true]) {
      const base = seated ? sit : stand;
      for (const [name, fn] of [['flinch', flinch], ['shield', shield], ['hop', hop]]) {
        const label = `${name}${seated ? ' seated' : ''} t=${t.toFixed(2)}`;
        assertLimits(assertSound(fn(Float32Array.from(base), t, 1, seated), label), label);
      }
      const label = `idle${seated ? ' seated' : ''} t=${t.toFixed(2)}`;
      assertLimits(assertSound(idle(Float32Array.from(base), t * 20, 3, seated), label), label);
    }
  }
  const up = standingPose(); up[2] = seatFeet(0.36) - 0.03; up[34] = up[39] = up[2] + 0.02;
  for (const down of [false, true]) {
    for (let t = 0; t <= RISE_TIME; t += 0.04) {
      const label = `${down ? 'sitting down' : 'standing up'} t=${t.toFixed(2)}`;
      assertLimits(assertSound(rise(newPose(), sit, up, t, down), label), label);
    }
  }
  for (let ph = 0; ph < 2; ph += 0.05) assertLimits(assertSound(walk(newPose(), stand, ph, 0.28), `walk ${ph}`), `walk ${ph}`);
});

test('look turns chest, neck and head toward a point, within the neck’s reach', () => {
  const s0 = solver.solve(standingPose());
  const face = () => new THREE.Vector3(0, 0, 1).applyQuaternion(solver.solve(p).q[I.head]);
  const p = look(standingPose(), 0.8, -0.3, 1);
  const f = face();
  assert.ok(Math.abs(Math.atan2(f.x, f.z) - 0.8) < 0.08, `turned ${Math.atan2(f.x, f.z).toFixed(2)} toward 0.8`);
  assert.ok(f.y > 0.2, 'looking up');
  // Far behind him: he turns as far as a neck goes, not round like an owl.
  const q = look(standingPose(), 3, 0, 1);
  const g = new THREE.Vector3(0, 0, 1).applyQuaternion(solver.solve(q).q[I.head]);
  assert.ok(Math.abs(Math.atan2(g.x, g.z)) < 1.6, 'no further than a neck turns');
  assert.ok(s0.q[I.head].angleTo(solver.solve(look(standingPose(), 0.8, -0.3, 0)).q[I.head]) < 1e-6, 'weight 0 leaves him be');
});

test('both seat poses sit on the seat with the feet on the ground; watchful leans in, hands on his knees, head up at the fire', () => {
  for (const style of SEAT_POSES) {
    for (const h of [0, 0.23, 0.32, 0.4, 0.42]) {
      const s = assertSound(seatedPose(newPose(), h, DEFAULT_RIG, style), `${style} ${h}`);
      assertLimits(s, `${style} ${h}`);
      for (const side of ['L', 'R']) assert.ok(Math.abs(s.p[I['foot' + side]].y - DEFAULT_RIG.ankleY) < 0.002, `${style} ${h}: ${side} foot on the ground`);
      assert.ok(Math.abs(s.p[I.hips].y - (h + SEAT_DEPTH)) < 1e-6, `${style} ${h}: hips on the seat`);
      if (style === 'watchful' && h > 0.12) {
        for (const side of ['L', 'R']) {
          const d = s.p[I['hand' + side]].distanceTo(s.p[I['shin' + side]]);
          assert.ok(d < 0.22, `${style} ${h}: ${side} hand by the knee (${d.toFixed(2)} m)`);
        }
      }
    }
  }
  // Watchful looks up at the fire (his face turned further up than resting's head, sunk in
  // the rest), leaning in over his knees: at the sceneries' seats (0.21–0.23 m) his head is no
  // higher than the rest's (a phone frames the seat right under the page's header).
  const face = (p) => new THREE.Vector3(0, 0, 1).applyQuaternion(solver.solve(p).q[I.head]);
  for (const h of [0.21, 0.23, 0.38]) {
    const rest = seatedPose(newPose(), h), watch = seatedPose(newPose(), h, DEFAULT_RIG, 'watchful');
    assert.ok(face(watch).y > face(rest).y + 0.2, `${h}: watchful looks up at the fire`);
    if (h < 0.25) assert.ok(solver.solve(watch).p[I.head].y < solver.solve(rest).p[I.head].y + 0.01, `${h}: watchful's head no higher than the rest's`);
  }
});

test('look aims the head level: a few degrees of tilt at most, seated or standing, wherever he looks', () => {
  const tilt = (p) => {
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(solver.solve(p).q[I.head]);
    return Math.abs(Math.asin(x.y)) * DEG;
  };
  const bases = [['standing', standingPose()], ...SEAT_POSES.flatMap((st) => [0, 0.23, 0.4].map((h) => [`${st} ${h}`, seatedPose(newPose(), h, DEFAULT_RIG, st)]))];
  for (const [name, base] of bases) {
    for (let yaw = -1.4; yaw <= 1.41; yaw += 0.35) {
      for (const pitch of [-0.7, -0.35, 0, 0.35, 0.7]) {
        const p = look(Float32Array.from(base), yaw, pitch, 1);
        assert.ok(tilt(p) < 3, `${name}: looking ${yaw.toFixed(2)}, ${pitch}: the helm tilts ${tilt(p).toFixed(1)}°`);
        assertLimits(assertSound(p, name), `${name} looking ${yaw.toFixed(2)}, ${pitch}`);
      }
    }
  }
  // The flinch turns the head away without cocking it (no more than the rest's own tip).
  const restTilt = tilt(seatedPose(newPose(), 0.4));
  for (let t = 0.05; t < 1.4; t += 0.05) {
    const p = flinch(seatedPose(newPose(), 0.4), t, 1, true);
    assert.ok(tilt(p) < Math.max(3, restTilt + 1), `flinch t=${t.toFixed(2)}: tilt ${tilt(p).toFixed(1)}° (at rest ${restTilt.toFixed(1)}°)`);
  }
});

/** A pose's solved joints (knight space), copied (the solver's arrays are reused). */
const joints = (p, s = solver) => s.solve(p).p.map((v) => v.clone());
/** How far (m) each foot slides while on the ground over `T` s of a pose over time. */
function slides(fn, T, dt = 1 / 120) {
  const tot = { L: 0, R: 0 }, prev = {};
  for (let t = 0; t <= T + 1e-9; t += dt) {
    const s = solver.solve(fn(t));
    for (const side of ['L', 'R']) {
      const a = s.p[I['foot' + side]].clone();
      const on = a.y < DEFAULT_RIG.ankleY + 0.006;
      if (prev[side]?.on && on) tot[side] += Math.hypot(a.x - prev[side].a.x, a.z - prev[side].a.z);
      prev[side] = { a, on };
    }
  }
  return tot;
}

test('standing up and sitting down, and the idle shifts, the feet step (lifted) and never slide', () => {
  for (const style of SEAT_POSES) {
    for (const h of [0, 0.23, 0.32, 0.4]) {
      const sit = seatedPose(newPose(), h, DEFAULT_RIG, style), up = standBy(newPose(), h);
      for (const down of [false, true]) {
        const s = slides((t) => rise(newPose(), sit, up, t, down), RISE_TIME);
        for (const side of ['L', 'R']) assert.ok(s[side] < 0.005, `${style} ${h} ${down ? 'sitting down' : 'standing up'}: ${side} foot slid ${s[side].toFixed(3)} m`);
      }
    }
  }
  // (…and they do move: from the rest's feet, one drawn in and one out, to under him.)
  const sit = joints(seatedPose(newPose(), 0.4)), up = joints(standBy(newPose(), 0.4));
  assert.ok(sit[I.footR].distanceTo(up[I.footR]) > 0.1 && sit[I.footL].distanceTo(up[I.footL]) > 0.05, 'the feet change places');
  const idleSlide = slides((t) => idle(seatedPose(newPose(), 0.36), t, 3, true), 60, 1 / 30);
  assert.ok(idleSlide.L + idleSlide.R < 0.005, `idle: the feet slid ${(idleSlide.L + idleSlide.R).toFixed(3)} m in a minute`);
});

test('seated gestures sit up first and throw the arms where they would standing (in the room)', () => {
  const sit = seatedPose(newPose(), 0.4);
  const at = (name, t) => solver.solve(gesture(Float32Array.from(sit), name, t, true));
  // Hurrah: the right hand above the helmet.
  let s = at('hurrah', 1);
  assert.ok(s.p[I.handR].y > s.p[I.head].y + 0.2, `hurrah: hand at ${s.p[I.handR].y.toFixed(2)}, head at ${s.p[I.head].y.toFixed(2)}`);
  // Point: the right hand out in front, about shoulder height (not at the floor).
  s = at('point', 1);
  assert.ok(s.p[I.handR].z - s.p[I.upperArmR].z > 0.35 && Math.abs(s.p[I.handR].y - s.p[I.upperArmR].y) < 0.15, 'point: forward, level');
  // Wave: the hand up above the shoulder.
  s = at('wave', 1);
  assert.ok(s.p[I.handR].y > s.p[I.upperArmR].y + 0.15, 'wave: the hand up');
  // Praise the Sun: both hands high.
  s = at('praise', 1.2);
  assert.ok(s.p[I.handL].y > s.p[I.head].y + 0.15 && s.p[I.handR].y > s.p[I.head].y + 0.15, 'praise: both hands high');
  // The helmet swap: the hands at the helmet's sides, never in front of its face.
  for (const seated of [false, true]) {
    const g = solver.solve(gesture(seated ? Float32Array.from(sit) : standingPose(), 'helm', 0.9, seated));
    const h = g.p[I.head];
    for (const side of ['L', 'R']) {
      const hand = g.p[I['hand' + side]].clone().sub(h);
      assert.ok(Math.abs(hand.x) > 0.17 && Math.abs(hand.z) < 0.08 && Math.abs(hand.y) < 0.12, `helm${seated ? ' seated' : ''}: ${side} hand beside the helm (${hand.toArray().map((v) => v.toFixed(2))})`);
    }
  }
  // A seated bow nods the chest, not a slump into the knees; joy keeps the hips on the stone.
  s = at('bow', 1.1);
  const lean = Math.acos(new THREE.Vector3(0, 1, 0).applyQuaternion(s.q[I.chest]).y) * DEG;
  assert.ok(lean < 60, `bow seated: the chest ${lean.toFixed(0)}° forward`);
  for (let t = 0; t < GESTURE_TIME.joy; t += 0.05) assert.ok(Math.abs(at('joy', t).p[I.hips].y - (0.4 + SEAT_DEPTH)) < 1e-6, 'joy: hips on the seat');
  // Praise's up-throw takes at least three of the pose's steps (12 a second): no pop.
  const handY = (t) => at('praise', t).p[I.handR].y;
  let biggest = 0;
  for (let t = 0; t < GESTURE_TIME.praise; t += 1 / 12) biggest = Math.max(biggest, Math.abs(handY(t + 1 / 12) - handY(t)));
  const range = handY(1.2) - Math.min(handY(0.3), handY(0.4));
  assert.ok(biggest < range * 0.55, `praise: the biggest step moves the hand ${biggest.toFixed(2)} of ${range.toFixed(2)} m`);
});

test('the pauldrons swing with the arm (no twist), a raise to the side more than one forward, the lames more than the dome', () => {
  const rot = (s, b) => 2 * Math.acos(Math.min(1, Math.abs(new THREE.Quaternion().copy(s.q[I.chest]).invert().multiply(s.q[I[b]]).w))) * DEG;
  const pose = (yaw, pitch, elbow = 0, reach = 1) => { const p = standingPose(); p[18] = yaw / DEG; p[19] = pitch / DEG; p[20] = reach; p[21] = elbow / DEG; return p; };
  // The arm's twist about itself (a straight arm, its elbow turned) never turns the dome.
  const a = solver.solve(pose(40, 20, -60));
  const qa = a.q[I.shoulderL].clone(), ua = a.q[I.upperArmL].clone();
  const b = solver.solve(pose(40, 20, 60));
  // (A straight arm is 0.999 of its length: the elbow still bends a degree or two its way.)
  assert.ok(qa.angleTo(b.q[I.shoulderL]) * DEG < 4, `the dome twisted ${(qa.angleTo(b.q[I.shoulderL]) * DEG).toFixed(1)}°`);
  assert.ok(ua.angleTo(b.q[I.upperArmL]) * DEG > 20, 'the upper arm did twist');
  // Out to the side vs forward, both level.
  const side = solver.solve(pose(90, 0));
  const sideDome = rot(side, 'shoulderL'), sideLames = rot(side, 'pauldronL'), sideY = side.p[I.shoulderL].y;
  const fwdDome = rot(solver.solve(pose(0, 0)), 'shoulderL');
  assert.ok(sideDome > fwdDome * 1.3, `dome: side ${sideDome.toFixed(0)}° vs forward ${fwdDome.toFixed(0)}°`);
  assert.ok(sideLames > sideDome * 1.4, 'the lames follow further than the dome');
  const share = sideDome / 78; // (level to the side: the arm swung about 78° from its hang)
  assert.ok(share > 0.3 && share < 0.55, `the dome follows ${share.toFixed(2)} of the raise`);
  // Straight up: lifted.
  const lift = solver.solve(pose(80, 85)).p[I.shoulderL].y - sideY;
  assert.ok(lift > 0.01, `overhead, the pauldron lifts (${lift.toFixed(3)} m)`);
  // Without its lames node (an older model), the dome takes a bigger share.
  const alone = createSolver(measureRig(DEFAULT_REST, { lamesNode: false })).solve(pose(90, 0));
  assert.ok(rot(alone, 'shoulderL') > sideDome, 'no lames node: the dome carries them further');
  assert.ok(PAULDRON.lames > PAULDRON.dome);
});

test('the Default Dance: arms swinging across the chest, then heel kicks with the arms thrown down and out', () => {
  const at = (b) => joints(dance(standingPose(), 'defaultDance', b, { period: 60 / DANCE_BPM, energy: 0.8 }));
  // Beats 0–3: on each beat both hands are over to one side, one across the chest, and over
  // to the other side on the beat next to it; the hands at the chest.
  for (let beat = 0; beat < 4; beat++) {
    const s = at(beat), t = at(beat < 3 ? beat + 1 : beat - 1); // (beat 4 starts the kicks)
    const mid = (s[I.handL].x + s[I.handR].x) / 2, next = (t[I.handL].x + t[I.handR].x) / 2;
    assert.ok(Math.abs(mid) > 0.12 && Math.sign(mid) !== Math.sign(next), `beat ${beat}: the arms swing across (${mid.toFixed(2)} then ${next.toFixed(2)})`);
    const across = mid > 0 ? s[I.handR].x : s[I.handL].x;
    assert.ok(Math.sign(across) === Math.sign(mid), `beat ${beat}: one hand across the chest`);
    for (const h of [s[I.handL], s[I.handR]]) assert.ok(h.y > 0.95 && h.y < 1.4, `beat ${beat}: hands at the chest (${h.y.toFixed(2)})`);
  }
  // Beats 4–7: a heel kicked out in front, the other leg on the next beat, the arms down and out.
  for (let beat = 4; beat < 8; beat++) {
    const s = at(beat + 0.1);
    const kick = beat % 2 === 0 ? 'R' : 'L', stay = kick === 'R' ? 'L' : 'R';
    const k = s[I['foot' + kick]], o = s[I['foot' + stay]];
    assert.ok(k.z - o.z > 0.18 && k.y - o.y > 0.07, `beat ${beat}: the ${kick} heel kicks out (${(k.z - o.z).toFixed(2)} forward, ${(k.y - o.y).toFixed(2)} up)`);
    for (const side of ['L', 'R']) {
      const h = s[I['hand' + side]], sh = s[I['upperArm' + side]];
      assert.ok(Math.abs(h.x) - Math.abs(sh.x) > 0.2 && h.y < sh.y - 0.15, `beat ${beat}: the ${side} arm thrown down and out`);
    }
  }
  assert.ok(MOVE_INFO.defaultDance.cycle === 8 && MOVE_INFO.defaultDance.seated, 'eight beats, and it works sitting down');
  // Seated: the arms swing across the chest just the same, the hips on the seat.
  const sit = seatedPose(newPose(), 0.36);
  const seatedAt = (b) => joints(dance(Float32Array.from(sit), 'defaultDance', b, { seated: true }));
  const m0 = seatedAt(0), m1 = seatedAt(1);
  assert.ok((m0[I.handL].x + m0[I.handR].x) * (m1[I.handL].x + m1[I.handR].x) < 0, 'seated: the arms swing across');
  assert.ok(Math.abs(m0[I.hips].y - (0.36 + SEAT_DEPTH)) < 1e-6, 'seated: on the seat');
});

test("the site's dance: up from the seat, two bars of the Default Dance facing the front, and back down", () => {
  const T = GESTURE_TIME.dance;
  const beat = 60 / DANCE_BPM;
  assert.ok(Math.abs(T - (2 * RISE_TIME + 0.8 + 8 * beat)) < 0.01, `it lasts ${T.toFixed(2)} s: up, eight beats at ${DANCE_BPM} BPM, down`);
  assert.ok(GESTURES.includes('dance') && CHEERS.includes('dance'), 'a gesture, and nothing interrupts it');
  const sit = seatedPose(newPose(), 0.36);
  const at = (t) => solver.solve(gesture(Float32Array.from(sit), 'dance', t, true, 0, { turn: 0.6 }));
  // Standing and turned to the front while he dances.
  for (let t = RISE_TIME + 0.5; t < T - RISE_TIME - 0.5; t += 0.25) {
    const s = at(t);
    assert.ok(s.p[I.hips].y > 0.8, `t=${t.toFixed(2)}: on his feet`);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(s.q[I.hips]);
    assert.ok(Math.abs(Math.atan2(f.x, f.z) - 0.6) < 0.35, `t=${t.toFixed(2)}: facing the front`);
  }
  // Seated at both ends; the feet slide no more than a couple of centimetres all told.
  for (const t of [0.01, T - 0.01]) assert.ok(Math.abs(at(t).p[I.hips].y - (0.36 + SEAT_DEPTH)) < 0.02, `t=${t.toFixed(2)}: seated`);
  const s = slides((t) => gesture(Float32Array.from(sit), 'dance', t, true, 0, { turn: 0.6 }), T);
  assert.ok(s.L < 0.03 && s.R < 0.03, `the feet slid ${s.L.toFixed(3)} / ${s.R.toFixed(3)} m`);
});

test('the pauldrons stay out of every helmet (no deeper than the model sits at rest), over every move, gesture and look (the real model)', async () => {
  const model = await loadKnightMesh();
  const HELMS = { great: 'K_Helm_Great', armet: 'K_Helm_Armet', bascinet: 'K_Helm_Bascinet' };
  assert.ok(model.has('K_Pauldron_L') && model.has('K_Pauldron_R'), 'the model has its lames on K_Pauldron_*');
  const rest = Object.fromEntries(BONES.map((b) => [b, model.has(BONE_NODES[b]) ? model.rest(BONE_NODES[b]) : DEFAULT_REST[b]]));
  const soft = { skip: ['K_Mail'] }; // (mail drapes: the bascinet's aventail isn't a solid)
  const plates = measurePlates({
    helmets: Object.fromEntries(Object.entries(HELMS).map(([k, n]) => [k, model.triangles(n, soft).flat(2)])),
    dome: model.triangles('K_Shoulder_L').flat(2), lames: model.triangles('K_Pauldron_L').flat(2),
  });
  const rig = measureRig(rest, { tassetFollow: 0.85, plates });
  const real = createSolver(rig);
  const inside = Object.fromEntries(Object.entries(HELMS).map(([k, n]) => [k, model.inside(n, soft)]));
  const dist = Object.fromEntries(Object.entries(HELMS).map(([k, n]) => [k, model.distance(n, soft)]));
  const PIECES = [['dome', 'K_Shoulder', 'shoulder'], ['lames', 'K_Pauldron', 'pauldron'], ['upper arm', 'K_UpperArm', 'upperArm']];
  const pts = Object.fromEntries(PIECES.flatMap(([, node]) => ['L', 'R'].map((s) => [`${node}_${s}`, model.surface(`${node}_${s}`, 0.03)])));
  const v = new THREE.Vector3(), hq = new THREE.Quaternion();
  /** The deepest each piece goes into the helmet (m), by piece and side. */
  const depths = (p, helm, clampOn = true) => {
    const s = real.solve(p, null, clampOn ? helm : null);
    hq.copy(s.q[I.head]).invert();
    const out = {};
    for (const [piece, node, bone] of PIECES) {
      for (const side of ['L', 'R']) {
        const b = I[bone + side];
        let deep = 0;
        for (const q of pts[`${node}_${side}`]) {
          v.set(q[0], q[1], q[2]).applyQuaternion(s.q[b]).add(s.p[b]).sub(s.p[I.head]).applyQuaternion(hq);
          if (inside[helm](v.x, v.y, v.z)) deep = Math.max(deep, dist[helm](v.x, v.y, v.z));
        }
        out[`${piece} ${side}`] = deep;
      }
    }
    return out;
  };
  const poses = [['standing', standingPose()]];
  for (const st of SEAT_POSES) for (const h of [0.23, 0.4]) poses.push([`seated ${st} ${h}`, seatedPose(newPose(), h, rig, st)]);
  const sit = seatedPose(newPose(), 0.36, rig);
  for (const g of [...GESTURES, 'helm']) {
    for (const f of [0.25, 0.5, 0.75]) {
      const t = GESTURE_TIME[g] * f;
      poses.push([`${g} t=${t.toFixed(2)}`, gesture(standingPose(), g, t)]);
      poses.push([`${g} seated t=${t.toFixed(2)}`, gesture(Float32Array.from(sit), g, t, true, 0, { turn: 0.6 })]);
    }
  }
  for (const m of MOVES) {
    for (let b = 0; b < MOVE_INFO[m].cycle; b += 0.5) {
      poses.push([`${m} b=${b}`, dance(standingPose(), m, b, { energy: 1 })]);
      if (MOVE_INFO[m].seated) poses.push([`${m} seated b=${b}`, dance(Float32Array.from(sit), m, b, { energy: 1, seated: true })]);
    }
  }
  for (let yaw = -1.2; yaw <= 1.21; yaw += 0.6) for (const pitch of [-0.5, 0.3]) poses.push([`look ${yaw.toFixed(1)} ${pitch}`, look(seatedPose(newPose(), 0.4, rig), yaw, pitch, 1)]);
  for (const t of [0.1, 0.3]) poses.push([`flinch ${t}`, flinch(seatedPose(newPose(), 0.4, rig), t, 1, true)]);
  const TOLERANCE = 0.01; // (m: the clamp works on the helmets' outlines, a little coarser than their faces)
  for (const helm of Object.keys(HELMS)) {
    const base = depths(newPose(), helm, false);
    assert.ok(base['lames L'] === 0 && base['upper arm L'] === 0, `${helm}: at rest the lames and arms are clear`);
    for (const [name, p] of poses) {
      const d = depths(p, helm);
      for (const [k, x] of Object.entries(d)) {
        assert.ok(x <= base[k] + TOLERANCE, `${helm}, ${name}: the ${k} ${x.toFixed(3)} m into the helmet (${base[k].toFixed(3)} at rest)`);
      }
    }
  }
});

test("the pauldrons stay out of the bascinet's mail aventail (no deeper than the model has them at rest), over every move, gesture and look", async () => {
  const model = await loadKnightMesh();
  const rest = Object.fromEntries(BONES.map((b) => [b, model.has(BONE_NODES[b]) ? model.rest(BONE_NODES[b]) : DEFAULT_REST[b]]));
  const HELMS = { great: 'K_Helm_Great', armet: 'K_Helm_Armet', bascinet: 'K_Helm_Bascinet' };
  const inHead = (name) => {
    const o = model.rest(name), h = rest.head;
    return model.triangles(name).flat(2).map((v, i) => v + o[i % 3] - h[i % 3]);
  };
  const plates = measurePlates({
    helmets: Object.fromEntries(Object.entries(HELMS).map(([k, n]) => [k, inHead(n)])),
    dome: model.triangles('K_Shoulder_L').flat(2), lames: model.triangles('K_Pauldron_L').flat(2),
  });
  const rig = measureRig(rest, { tassetFollow: 0.85, plates });
  const real = createSolver(rig);
  // The skirt as the tests see it (not the runtime's rows): round the head's vertical axis,
  // its farthest reach at each height (1 cm) and bearing (16ths); a point nearer the axis
  // than the skirt at its height and bearing is under it (as deep as its shortest way out).
  // The model drapes it over the domes' inner halves; a dome pushed further in under it is
  // rising into the mail.
  const o = model.rest('K_Helm_Bascinet'), h = rest.head;
  const skirt = new Map();
  const bin = (x, y, z) => `${Math.round(y / 0.01)},${Math.round((Math.atan2(x, z) / (2 * Math.PI)) * 16) & 15}`;
  let low = Infinity;
  for (const [x0, y0, z0] of model.surface('K_Helm_Bascinet', 0.008)) {
    const x = x0 + o[0] - h[0], y = y0 + o[1] - h[1], z = z0 + o[2] - h[2];
    const k = bin(x, y, z);
    skirt.set(k, Math.max(skirt.get(k) ?? 0, Math.hypot(x, z)));
    low = Math.min(low, y);
  }
  assert.ok(low < -0.1, `the bascinet's aventail hangs to ${low.toFixed(3)} m below the head joint (over the domes)`);
  const pts = { dome: model.surface('K_Shoulder_L', 0.02), lames: model.surface('K_Pauldron_L', 0.02) };
  const v = new THREE.Vector3(), hq = new THREE.Quaternion();
  const depth = (p, clampOn = true) => {
    const s = real.solve(p, null, clampOn ? 'bascinet' : null);
    hq.copy(s.q[I.head]).invert();
    const out = { dome: 0, lames: 0 };
    for (const [piece, bone] of [['dome', 'shoulder'], ['lames', 'pauldron']]) {
      for (const [side, sg] of [['L', 1], ['R', -1]]) {
        const b = I[bone + side];
        for (const q of pts[piece]) {
          v.set(sg * q[0], q[1], q[2]).applyQuaternion(s.q[b]).add(s.p[b]).sub(s.p[I.head]).applyQuaternion(hq);
          // (How deep: its shortest way out, sideways or down past the hem.)
          const R = v.y >= low ? skirt.get(bin(v.x, v.y, v.z)) : 0;
          if (R) out[piece] = Math.max(out[piece], Math.min(R - Math.hypot(v.x, v.z), v.y - low));
        }
      }
    }
    return out;
  };
  const base = depth(newPose(), false);
  const sit = seatedPose(newPose(), 0.36, rig);
  const poses = [];
  for (const st of SEAT_POSES) poses.push([`seated ${st}`, seatedPose(newPose(), 0.4, rig, st)]);
  for (const g of [...GESTURES, 'helm']) for (const f of [0.3, 0.6]) poses.push([`${g} seated ${f}`, gesture(Float32Array.from(sit), g, GESTURE_TIME[g] * f, true)], [`${g} ${f}`, gesture(standingPose(), g, GESTURE_TIME[g] * f)]);
  for (const m of MOVES) {
    for (let b = 0; b < MOVE_INFO[m].cycle; b += 0.5) {
      poses.push([`${m} b=${b}`, dance(standingPose(), m, b, { energy: 1 })]);
      if (MOVE_INFO[m].seated) poses.push([`${m} seated b=${b}`, dance(Float32Array.from(sit), m, b, { energy: 1, seated: true })]);
    }
  }
  for (let yaw = -1.2; yaw <= 1.21; yaw += 0.6) for (const pitch of [-0.5, 0.3]) poses.push([`look ${yaw.toFixed(1)} ${pitch}`, look(seatedPose(newPose(), 0.4, rig), yaw, pitch, 1)]);
  let worst = { d: 0, what: '' };
  for (const [name, p] of poses) {
    const d = depth(p);
    for (const k of ['dome', 'lames']) if (d[k] - base[k] > worst.d) worst = { d: d[k] - base[k], what: `${name}, the ${k}` };
  }
  assert.ok(worst.d <= 0.015, `under the aventail at most 1.5 cm deeper than at rest (${base.dome.toFixed(3)} m): the worst ${worst.d.toFixed(3)} m (${worst.what})`);
});
