// The knight's body language, as pure functions: no scene, no DOM, no clock of its own
// (knights.js drives it and puts the result on the bones).
//
// A pose is a flat array of numbers (POSE_SIZE), so any two blend with a lerp:
//   root         where the hips are, as an offset from their rest place (knight space, m)
//   hips…head    each joint's turn (yaw), nod (pitch) and tilt (roll), in degrees' radians
//   arms         where each hand is, seen from its shoulder in the chest's frame: yaw (0
//                forward, + out to that side), pitch (−90 down … +90 up) and reach (0..1 of
//                the arm's length); which way the elbow points; the wrist; the fist
//   legs         where each ankle is, as an offset from its rest place (x + out to that side,
//                y up, z forward; knight space); the foot's pitch; how far the knee turns out
// Limbs are written by side ("out" is +x for the left, −x for the right), so a pose mirrors
// by swapping its sides. solve() turns a pose into each bone's rotation with two-bone IK for
// the arms and legs: feet stay flat on the ground and meet it at any seat height, and hands
// go where they're put. The tassets follow the thighs most of the way; the pauldrons ride
// the arms like plates on straps (see "the pauldrons" below). Arm and head targets that
// mean something in the room (a hand on a knee, a look at the camera, an arm thrown up while
// seated) are written in knight space and turned into the chest's frame here, so a slumped
// chest never bends them down.
//
// On top of the base poses (standing; seated at any height, resting or watchful; sitting on
// the ground) come:
//   transitions  sitting down and standing up (~1.2 s): a lean, a push-off, a settle, the feet
//                moving in small lifted steps (they never skate)
//   idle         breathing, the head sinking slowly and lifting, glances, a shift of weight
//                now and then (the knights module never redraws shadows for these)
//   reactions    a flinch, leaning away from a stoke, lifting the feet (or a hop) as a ring
//                passes, and look(), which aims the head at a point, level, whatever the
//                chest is doing
//   gestures     Dark Souls' own: Praise the Sun, wave, bow, point, beckon, shrug, hurrah,
//                joy (a jump); 'helm', both hands to the helmet's sides (the helmet swap); and
//                'dance', the site's: up, the Default Dance for two bars, and back down (or,
//                `inPlace`, the two bars in his seat, leaning in: a phone's view has no room
//                over him). Seated, he sits up first and the arms go where they would standing.
//   moves        the dance library: pure functions of (beatPos, period, energy, seed), so
//                a dancer stays on the beat through hit-stops and tempo jumps. Every move is
//                periodic on the beat (its `cycle`, in beats) and big enough to read at a
//                hundred texels tall: weight shifts, follow-through, the head reacting.
//                Seated, the upper body of the move plays over the seat, a little sat up.
//
// The pauldrons. Each is a dome on the shoulder joint (K_Shoulder_*) over two lames on their
// own node (K_Pauldron_*); a third lame rides the upper arm. The dome and lames take a share
// of the arm's swing away from hanging (swing only: the arm's twist about itself never turns
// them), more of a raise out to the side than forward (PAULDRON); above level they lift and
// roll outward, riding up over the shoulder. Given the model's helmets (measurePlates), a
// dome or lame is never pushed further into the helmet he wears than the model sits at rest:
// a head tilted onto a shoulder, or an arm swinging the plates up against it, shoves the
// pauldron out from the neck instead (clampPlates). knights.js adds a spring on top (they
// lag and overshoot a little) and clamps again.
//
// Room for the arms. Hemmed in at a side (`room`, knights.js: a pillar at his shoulder, a
// standing stone, a lantern; 0..1 a side), every gesture and dance move keeps that arm's swing
// out to the side and back behind him within it (hem): the arm goes up or forward instead.
// knights.js then checks the solved arm against the scenery's shapes and turns it clear
// (swingArm).
import * as THREE from 'three';
import { TAU, clamp, clamp01, smooth, smoother } from '../math.js';

const DEG = Math.PI / 180;

// --- the pose layout ---------------------------------------------------------------------
export const POSE = {
  root: 0, hips: 3, spine: 6, chest: 9, neck: 12, head: 15,
  armL: 18, armR: 25, // yaw, pitch, reach, elbow, wrist pitch, wrist roll, fist
  legL: 32, legR: 37, // x (out), y, z, foot pitch, knee out
};
export const POSE_SIZE = 42;
const AXIAL = ['hips', 'spine', 'chest', 'neck', 'head'];

/** A new pose (every channel 0: the rest pose, standing, arms as modeled). */
export const newPose = () => new Float32Array(POSE_SIZE);

// --- the rig -------------------------------------------------------------------------------
/**
 * The bones the pose drives, parents first. The helmets hang off the head (knights.js). The
 * pauldrons' lames (added in round 9) come last, so the older bones keep their indices.
 */
export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'forearmL', 'handL', 'fingersL',
  'shoulderR', 'upperArmR', 'forearmR', 'handR', 'fingersR',
  'tassetL', 'thighL', 'shinL', 'footL',
  'tassetR', 'thighR', 'shinR', 'footR',
  'pauldronL', 'pauldronR',
];
export const PARENT = {
  spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', upperArmL: 'shoulderL', forearmL: 'upperArmL', handL: 'forearmL', fingersL: 'handL',
  shoulderR: 'chest', upperArmR: 'shoulderR', forearmR: 'upperArmR', handR: 'forearmR', fingersR: 'handR',
  tassetL: 'hips', thighL: 'hips', shinL: 'thighL', footL: 'shinL',
  tassetR: 'hips', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
  pauldronL: 'shoulderL', pauldronR: 'shoulderR',
};
/** The model's node for each bone (docs/knight.md). */
export const BONE_NODES = Object.fromEntries(BONES.map((b) => {
  const side = /[LR]$/.test(b) ? b.slice(-1) : '';
  const base = side ? b.slice(0, -1) : b;
  const name = { upperArm: 'UpperArm' }[base] ?? base[0].toUpperCase() + base.slice(1);
  return [b, side ? `K_${name}_${side}` : `K_${name}`];
}));
const IDX = Object.fromEntries(BONES.map((b, i) => [b, i]));

/**
 * The model's intended proportions (a 1.72 m knight in a great helm): each joint's rest
 * position in knight space, feet on y = 0, facing +z, his left at +x. knights.js measures
 * the real ones from the model; this is for tests and a missing joint.
 */
export const DEFAULT_REST = {
  hips: [0, 0.935, 0], spine: [0, 1.01, -0.005], chest: [0, 1.17, -0.01], neck: [0, 1.385, -0.012], head: [0, 1.465, 0],
  shoulderL: [0.195, 1.325, -0.01], upperArmL: [0.195, 1.325, -0.01], forearmL: [0.253, 1.051, -0.01], handL: [0.305, 0.806, -0.01], fingersL: [0.325, 0.713, -0.01],
  shoulderR: [-0.195, 1.325, -0.01], upperArmR: [-0.195, 1.325, -0.01], forearmR: [-0.253, 1.051, -0.01], handR: [-0.305, 0.806, -0.01], fingersR: [-0.325, 0.713, -0.01],
  tassetL: [0.112, 0.885, 0], thighL: [0.1, 0.885, 0], shinL: [0.105, 0.49, 0.012], footL: [0.105, 0.095, -0.012],
  tassetR: [-0.112, 0.885, 0], thighR: [-0.1, 0.885, 0], shinR: [-0.105, 0.49, 0.012], footR: [-0.105, 0.095, -0.012],
  pauldronL: [0.195, 1.325, -0.01], pauldronR: [-0.195, 1.325, -0.01],
};

/**
 * How far the hips joint sits above whatever he sits on, m: the backs of the thighs are
 * 0.112 m behind the hip sockets, which are 0.05 below the hips joint (docs/knight.md).
 */
export const SEAT_DEPTH = 0.162;
/**
 * The tassets follow the thighs this much (the model can say otherwise: its tasset nodes'
 * `follow`, which lays them on a seated knight's thighs).
 */
export const TASSET_FOLLOW = 0.55;
/**
 * How the pauldrons ride the arm: the dome's and the lames' shares of the arm's swing from
 * hanging (`alone`: the dome's when the model has no lames node, so the lames ride it); a
 * swing forward or back counts `flexion` of a raise to the side, a sweep round at shoulder
 * height `sweep`; by the time the arm is straight up they've rolled out `roll` and lifted
 * `lift` (out, up; m), from level on (the swing tips a dome's top toward the neck: the roll
 * tips it back out); the helmet shoves a pauldron out by at most `push` (m).
 */
export const PAULDRON = { dome: 0.4, lames: 0.72, alone: 0.52, flexion: 0.6, sweep: 0.45, roll: 16 * DEG, lift: [0.018, 0.014], push: 0.05 };
/** The seated poses: slumped at rest like the Dark Souls knight, or watchful: leaning in over his knees, forearms on them, head up at the fire. */
export const SEAT_POSES = ['resting', 'watchful'];
/** Room on both sides (gesture()'s `room`). */
const FREE = [1, 1];

// --- the plates' collision data (the helmets and the pauldrons) ------------------------------
const ROW_STEP = 0.01;  // m between a helmet's rows, from its rim up
const ROWS = 26;
const Z0 = -0.26;       // its rows' bins front to back (head space)
const Z_STEP = 0.04;
const ZN = 13;

/**
 * The plates' collision data from the model's pieces (knights.js reads them from the loaded
 * model; the tests from knight.glb): `helmets` { great, armet, bascinet }, `dome` and
 * `lames` as flat triangle lists (x, y, z, three points a triangle), the helmets in the
 * head's space, the dome and lames (the left pauldron's) in their joints' (the right is
 * their mirror). Each helmet (its mail too: the bascinet's aventail hangs over the domes)
 * becomes rows up from its lowest edge, each row its half width in bins front to back; the dome
 * keeps its upper points (a centimetre apart), the lames all theirs.
 * measureRig adds how deep each already sits in each helmet at rest (`allow`).
 * @param {{ helmets: Record<string, ArrayLike<number>>, dome: ArrayLike<number>, lames?: ArrayLike<number> }} pieces
 */
export function measurePlates({ helmets, dome, lames = [] }) {
  const out = { helmets: {}, dome: pick(sample(dome), (x, y) => y > -0.05), lames: pick(sample(lames), () => true) };
  for (const [name, tri] of Object.entries(helmets)) {
    if (!tri?.length) continue;
    let y0 = Infinity;
    for (let i = 1; i < tri.length; i += 3) y0 = Math.min(y0, tri[i]);
    const hx = new Float32Array(ROWS * ZN);
    const put = (x, z, r) => {
      const zi = Math.floor((z - Z0) / Z_STEP);
      if (zi >= 0 && zi < ZN) hx[r * ZN + zi] = Math.max(hx[r * ZN + zi], Math.abs(x));
    };
    for (let t = 0; t < tri.length; t += 9) {
      const ys = [tri[t + 1], tri[t + 4], tri[t + 7]];
      const lo = Math.max(0, Math.ceil((Math.min(...ys) - y0) / ROW_STEP - 1e-6));
      const hi = Math.min(ROWS - 1, Math.floor((Math.max(...ys) - y0) / ROW_STEP + 1e-6));
      for (let r = lo; r <= hi; r++) {
        // The triangle's cross-section at this row's height: a segment, sampled every cm.
        const y = y0 + r * ROW_STEP;
        const ends = [];
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const ya = tri[t + a * 3 + 1], yb = tri[t + b * 3 + 1];
          if ((ya - y) * (yb - y) > 0 || ya === yb) { if (ya === y) ends.push([tri[t + a * 3], tri[t + a * 3 + 2]]); continue; }
          const u = (y - ya) / (yb - ya);
          ends.push([tri[t + a * 3] + (tri[t + b * 3] - tri[t + a * 3]) * u, tri[t + a * 3 + 2] + (tri[t + b * 3 + 2] - tri[t + a * 3 + 2]) * u]);
        }
        for (let i = 0; i < ends.length; i++) {
          const [x1, z1] = ends[i], [x2, z2] = ends[(i + 1) % ends.length];
          const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.01));
          for (let j = 0; j <= n; j++) put(x1 + (x2 - x1) * (j / n), z1 + (z2 - z1) * (j / n), r);
        }
      }
    }
    out.helmets[name] = { y0, hx, allow: { dome: 0, lames: 0 } };
  }
  return out;
}
/** Points over a triangle list (flat xyz, three points a triangle) about 2 cm apart. */
function sample(tri) {
  const out = [];
  for (let t = 0; t + 8 < tri.length; t += 9) {
    const len = Math.max(Math.hypot(tri[t + 3] - tri[t], tri[t + 4] - tri[t + 1], tri[t + 5] - tri[t + 2]), Math.hypot(tri[t + 6] - tri[t], tri[t + 7] - tri[t + 1], tri[t + 8] - tri[t + 2]));
    const n = Math.max(1, Math.ceil(len / 0.02));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        for (let k = 0; k < 3; k++) out.push(tri[t + k] * w + tri[t + 3 + k] * u + tri[t + 6 + k] * v);
      }
    }
  }
  return out;
}
/** A piece's points (x, y, z flat) that pass `keep`, one to each 2.5 cm cell, flat again. */
function pick(pts, keep) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    if (!keep(x, y, z)) continue;
    const key = `${Math.round(x / 0.025)},${Math.round(y / 0.025)},${Math.round(z / 0.025)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x, y, z);
  }
  return Float32Array.from(out);
}
/** How deep a point (head space) is inside a helmet's rows (m): its way out sideways or down. */
function helmDepth(env, x, y, z) {
  const fy = (y - env.y0) / ROW_STEP;
  if (fy < 0 || fy >= ROWS - 1) return 0;
  const zi = Math.floor((z - Z0) / Z_STEP);
  if (zi < 0 || zi >= ZN) return 0;
  const j = Math.floor(fy), f = fy - j;
  const hx = env.hx[j * ZN + zi] * (1 - f) + env.hx[(j + 1) * ZN + zi] * f;
  const side = hx - Math.abs(x);
  return side > 0 ? Math.min(side, y - env.y0) : 0;
}

/**
 * The rig's measurements from rest positions ({ bone: [x, y, z] }, knight space; missing
 * bones fall back to DEFAULT_REST); `tassetFollow` from the model if it gives one; `plates`
 * (measurePlates) for the pauldrons' helmet clearance; `lamesNode`: the model has its lames
 * on their own node (else they ride the dome).
 */
export function measureRig(rest = DEFAULT_REST, { tassetFollow = TASSET_FOLLOW, plates = null, lamesNode = true } = {}) {
  const at = (b) => new THREE.Vector3(...(rest[b] ?? DEFAULT_REST[b]));
  const pos = Object.fromEntries(BONES.map((b) => [b, at(b)]));
  const len = (a, b) => pos[a].distanceTo(pos[b]);
  const rig = {
    pos,
    hipsY: pos.hips.y,
    ankleY: (pos.footL.y + pos.footR.y) / 2,
    arm: [len('upperArmL', 'forearmL'), len('forearmL', 'handL')],
    leg: [len('thighL', 'shinL'), len('shinL', 'footL')],
    headY: pos.head.y,
    tassetFollow,
    plates,
    lamesNode,
  };
  // How deep the plates sit in each helmet at rest (the model's own overlap): the most any
  // pose may push them in.
  if (plates) {
    const h = pos.head, s = pos.pauldronL ?? pos.shoulderL, d = pos.shoulderL;
    for (const env of Object.values(plates.helmets)) {
      const deepest = (pts, o) => {
        let m = 0;
        for (let i = 0; i < pts.length; i += 3) m = Math.max(m, helmDepth(env, pts[i] + o.x - h.x, pts[i + 1] + o.y - h.y, pts[i + 2] + o.z - h.z));
        return m;
      };
      env.allow = { dome: deepest(plates.dome, d) + 0.002, lames: deepest(plates.lames, s) + 0.002 };
    }
  }
  return rig;
}
export const DEFAULT_RIG = measureRig();

// --- writing poses -------------------------------------------------------------------------
const sideOf = (s) => (s === 'L' ? POSE.armL : POSE.armR);
const legOf = (s) => (s === 'L' ? POSE.legL : POSE.legR);
/** Set a joint's pitch, yaw, roll (degrees). */
function joint(p, name, pitch, yaw = 0, roll = 0) {
  const o = POSE[name];
  p[o] = pitch * DEG; p[o + 1] = yaw * DEG; p[o + 2] = roll * DEG;
}
/** Add to a joint's pitch, yaw, roll (degrees). */
function nudge(p, name, pitch, yaw = 0, roll = 0) {
  const o = POSE[name];
  p[o] += pitch * DEG; p[o + 1] += yaw * DEG; p[o + 2] += roll * DEG;
}
/** A hand: yaw/pitch in degrees, reach 0..1, elbow/wrist/roll in degrees, fist 0..1. */
function arm(p, s, yaw, pitch, reach, elbow = 0, wrist = 0, fist = 0.8, roll = 0) {
  const o = sideOf(s);
  p[o] = yaw * DEG; p[o + 1] = pitch * DEG; p[o + 2] = reach; p[o + 3] = elbow * DEG;
  p[o + 4] = wrist * DEG; p[o + 5] = roll * DEG; p[o + 6] = fist;
}
/** An ankle, as an offset from its rest place (m; x out to that side), foot pitch and knee out (degrees). */
function leg(p, s, x, y, z, pitch = 0, knee = 8) {
  const o = legOf(s);
  p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = pitch * DEG; p[o + 4] = knee * DEG;
}
function root(p, x, y, z) { p[0] = x; p[1] = y; p[2] = z; }
/** Blend `a` toward `b` by t into `out` (the hips' turn the short way round). */
export function lerpPose(out, a, b, t) {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  const y = POSE.hips + 1;
  let d = (b[y] - a[y]) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  out[y] = a[y] + d * t;
  return out;
}
/** Blend only the arms (a side, or both) of `out` toward `b` by t. */
function lerpArms(out, b, t, s = null) {
  for (const side of s ? [s] : ['L', 'R']) {
    const o = sideOf(side);
    for (let i = 0; i < 7; i++) out[o + i] += (b[o + i] - out[o + i]) * t;
  }
}
/** Swap a pose's sides: his left does what his right did. */
export function mirrorPose(p) {
  for (let i = 0; i < 7; i++) { const t = p[POSE.armL + i]; p[POSE.armL + i] = p[POSE.armR + i]; p[POSE.armR + i] = t; }
  for (let i = 0; i < 5; i++) { const t = p[POSE.legL + i]; p[POSE.legL + i] = p[POSE.legR + i]; p[POSE.legR + i] = t; }
  for (const j of AXIAL) { p[POSE[j] + 1] *= -1; p[POSE[j] + 2] *= -1; }
  p[0] *= -1;
  return p;
}
const copy = (out, p) => { out.set(p); return out; };

// --- frames: the chest, and aiming arms and the head in knight space ---------------------------
const _e = new THREE.Euler();
const eulerQ = (out, pitch, yaw, roll) => out.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
const _fq = new THREE.Quaternion();
const _fv = new THREE.Vector3();
const _fv2 = new THREE.Vector3();
const _fm = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const _frame = { q: new THREE.Quaternion(), pos: new THREE.Vector3(), hq: new THREE.Quaternion() };
/**
 * The chest's turn (knight space) from a pose's hips, spine and chest, and where the chest
 * joint is (the rig's rest places). Reused: copy what you keep.
 */
function chestFrame(p, rig = DEFAULT_RIG, out = _frame) {
  const P = rig.pos;
  eulerQ(out.hq, p[POSE.hips], p[POSE.hips + 1], p[POSE.hips + 2]);
  out.pos.set(P.hips.x + p[0], P.hips.y + p[1], P.hips.z + p[2]);
  out.pos.add(_fv.copy(P.spine).sub(P.hips).applyQuaternion(out.hq));
  out.q.copy(out.hq).multiply(eulerQ(_fq, p[POSE.spine], p[POSE.spine + 1], p[POSE.spine + 2]));
  out.pos.add(_fv.copy(P.chest).sub(P.spine).applyQuaternion(out.q));
  out.q.multiply(eulerQ(_fq, p[POSE.chest], p[POSE.chest + 1], p[POSE.chest + 2]));
  return out;
}
/** A hand's direction (unit, the chest's frame) from its yaw and pitch. */
const armVec = (out, yaw, pitch, sg) => out.set(sg * Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
/** Write a direction (the chest's frame) as an arm's yaw and pitch, the yaw nearest `near`. */
function setArmDir(p, o, d, sg) {
  const near = p[o];
  let yaw = Math.atan2(sg * d.x, d.z);
  // (Straight up or down the yaw means nothing: keep it where it was.)
  if (Math.hypot(d.x, d.z) < 1e-4) yaw = near;
  yaw += TAU * Math.round((near - yaw) / TAU);
  p[o] = yaw;
  p[o + 1] = Math.asin(clamp(d.y, -1, 1));
}
const _rq = new THREE.Quaternion();
const _rv = new THREE.Vector3();
const IDENTITY = new THREE.Quaternion();
/**
 * Turn the arms of `p` so they point in the room where they pointed from a chest turned
 * `from` (knight space), now that the chest is turned `to` (a side, or both).
 */
function reframeArms(p, from, to, s = null) {
  _rq.copy(to).invert().multiply(from);
  for (const side of s ? [s] : ['L', 'R']) {
    const o = sideOf(side), sg = side === 'L' ? 1 : -1;
    setArmDir(p, o, armVec(_rv, p[o], p[o + 1], sg).applyQuaternion(_rq), sg);
  }
}
/** An arm aimed in knight space (yaw, pitch in degrees, as for arm()), over the pose's chest. */
function armRoom(p, s, yaw, pitch, reach, elbow = 0, wrist = 0, fist = 0.8, roll = 0, rig = DEFAULT_RIG) {
  arm(p, s, yaw, pitch, reach, elbow, wrist, fist, roll);
  reframeArms(p, IDENTITY, chestFrame(p, rig).q, s);
}
/**
 * A hand put at a place in knight space (m: x, y, z), over the pose's chest: the arm's yaw,
 * pitch and reach from its shoulder socket.
 */
function armAt(p, s, x, y, z, elbow = 0, wrist = 0, fist = 0.8, roll = 0, rig = DEFAULT_RIG) {
  const f = chestFrame(p, rig);
  const sock = _fv2.copy(rig.pos['upperArm' + s]).sub(rig.pos.chest).applyQuaternion(f.q).add(f.pos);
  const d = _rv.set(x, y, z).sub(sock);
  const reach = d.length() / (rig.arm[0] + rig.arm[1]);
  d.applyQuaternion(_rq.copy(f.q).invert()).normalize();
  const o = sideOf(s), sg = s === 'L' ? 1 : -1;
  arm(p, s, 0, 0, clamp(reach, 0.2, 1), elbow, wrist, fist, roll);
  setArmDir(p, o, d, sg);
}

/**
 * Keep side s's arm in the room it has there (`r` 0..1): its reach back behind him scaled by
 * it, and what it would have swung out to that side swung forward instead, so an arm that
 * would be flung into a pillar goes up or out in front of him. In the pose's own terms (the
 * chest's frame).
 */
function hem(p, s, r) {
  if (!(r < 1)) return p;
  const o = sideOf(s);
  const yaw = p[o], pitch = p[o + 1];
  let out = Math.sin(yaw) * Math.cos(pitch), fwd = Math.cos(yaw) * Math.cos(pitch);
  const up = Math.sin(pitch);
  const k = clamp01(r);
  if (fwd < 0) fwd *= k;
  if (out > 0) { fwd += out * (1 - k); out *= k; }
  // (Hardly anywhere left to point, it points ahead.)
  const len = Math.hypot(out, up, fwd);
  if (len < 0.5) fwd += 0.5 - len;
  const y = Math.atan2(out, fwd);
  p[o] = y + TAU * Math.round((yaw - y) / TAU);
  p[o + 1] = Math.asin(clamp(up / Math.hypot(out, up, fwd), -1, 1));
  return p;
}
/** Both arms kept in their room ([left, right] 0..1). */
const hemArms = (p, room) => { if (room[0] < 1) hem(p, 'L', room[0]); if (room[1] < 1) hem(p, 'R', room[1]); return p; };

const _ha = new THREE.Vector3();
/** Where the head joint is (knight space) in a pose. Reused: copy what you keep. */
function headAt(p, rig = DEFAULT_RIG) {
  const f = chestFrame(p, rig);
  const P = rig.pos;
  const nq = _fq.copy(f.q).multiply(eulerQ(_hh, p[POSE.neck], p[POSE.neck + 1], p[POSE.neck + 2]));
  return _ha.copy(P.neck).sub(P.chest).applyQuaternion(f.q).add(f.pos).add(_fv.copy(P.head).sub(P.neck).applyQuaternion(nq));
}
/** The helmet swap's hold: each wrist this far out, up, forward from the head (m); the elbow's turn, the wrist, its roll (degrees). */
const HELM_HOLD = [0.215, 0.04, 0.0, -40, -10, -75];
const _hn = new THREE.Quaternion();
const _hh = new THREE.Quaternion();
const _hd = new THREE.Quaternion();
const _hr = new THREE.Quaternion();
const _he = new THREE.Euler();
const _hx = new THREE.Vector3();
const _hy = new THREE.Vector3();
const _hz = new THREE.Vector3();
/** How far the neck and head together turn from the chest (rad): side to side, up, down. */
const NECK_YAW = 72 * DEG, NECK_UP = 62 * DEG, NECK_DOWN = 55 * DEG;
/** The neck's share of a look (the head takes the rest). */
const NECK_SHARE = 0.4;
/** The head's facing in knight space (unit), from a pose. */
function headDir(p, out) {
  const c = chestFrame(p).q;
  _hn.copy(c).multiply(eulerQ(_hh, p[POSE.neck], p[POSE.neck + 1], p[POSE.neck + 2]));
  _hn.multiply(eulerQ(_hh, p[POSE.head], p[POSE.head + 1], p[POSE.head + 2]));
  return out.set(0, 0, 1).applyQuaternion(_hn);
}
/**
 * Aim the head along `dir` (knight space) and keep it level: the helm's top toward the
 * sky, whatever the chest is doing (a slumped chest turned by Euler angles would cock it to
 * the side). Within what a neck does from the chest; shared between neck and head; `w`
 * 0..1 blends from where it was.
 */
function aimHead(p, dir, w = 1) {
  if (w <= 0) return p;
  const c = chestFrame(p).q;
  // Where the neck and head point now, from the chest.
  const cur = eulerQ(_hr, p[POSE.neck], p[POSE.neck + 1], p[POSE.neck + 2]).multiply(eulerQ(_hh, p[POSE.head], p[POSE.head + 1], p[POSE.head + 2]));
  // The aim in the chest's frame, turned and nodded no further than a neck goes.
  const f = _hz.copy(dir).normalize().applyQuaternion(_hd.copy(c).invert());
  let yaw = Math.atan2(f.x, f.z), pitch = Math.asin(clamp(-f.y, -1, 1));
  yaw = clamp(yaw, -NECK_YAW, NECK_YAW);
  pitch = clamp(pitch, -NECK_UP, NECK_DOWN);
  f.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(c);
  // Level: his left (+x) square to the sky's up.
  const x = _hx.crossVectors(UP, f);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0).applyQuaternion(c);
  x.normalize();
  const y = _hy.crossVectors(f, x);
  _hd.setFromRotationMatrix(_fm.makeBasis(x, y, f));
  // …as a turn from the chest, blended in and shared between neck and head.
  const goal = _hd.premultiply(_fq.copy(c).invert());
  cur.slerp(goal, clamp01(w));
  _hn.identity().slerp(cur, NECK_SHARE);
  _hh.copy(_hn).invert().multiply(cur);
  for (const [name, q] of /** @type {[string, THREE.Quaternion][]} */ ([['neck', _hn], ['head', _hh]])) {
    _he.setFromQuaternion(q, 'YXZ');
    const o = POSE[name];
    p[o] = _he.x; p[o + 1] = _he.y; p[o + 2] = _he.z;
  }
  return p;
}
const _td = new THREE.Vector3();
/**
 * Turn the head from where it faces now by `dyaw` (+ his left) and `dpitch` (+ down), in
 * knight space, level; `w` 0..1.
 */
function turnHead(p, dyaw, dpitch, w = 1) {
  if (w <= 0.001) return p;
  const d = headDir(p, _td);
  const yaw = Math.atan2(d.x, d.z) + dyaw;
  const pitch = clamp(Math.asin(clamp(-d.y, -1, 1)) + dpitch, -1.3, 1.3);
  _td.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  return aimHead(p, _td, w);
}

// --- base poses ------------------------------------------------------------------------------
/** Standing easy: soft knees, arms hanging a little forward, gauntlets half closed. */
export function standingPose(p = newPose()) {
  p.fill(0);
  root(p, 0, -0.025, 0);
  joint(p, 'spine', 3); joint(p, 'chest', 2); joint(p, 'head', -4);
  arm(p, 'L', 62, -80, 0.95, 0, 0, 0.7);
  arm(p, 'R', 62, -80, 0.95, 0, 0, 0.7);
  leg(p, 'L', 0.03, 0, 0.01, 0, 10);
  leg(p, 'R', 0.03, 0, 0.01, 0, 10);
  return p;
}

/** Where the feet go in front of a seat of height `h` (m above the ground), knight space z. */
export const seatFeet = (h) => clamp(0.3 + 0.35 * h, 0.3, 0.46);
/** The seat's height (m) a seated pose sits on (from where its hips are). */
const seatOf = (p, rig = DEFAULT_RIG) => p[1] + rig.hipsY - SEAT_DEPTH;
/**
 * Where each foot of a pose rests on the ground, knight space: [[x, z] left, [x, z] right]
 * (the ankle's place; knights.js looks up the ground under it).
 */
export function feetAt(p, rig = DEFAULT_RIG) {
  const L = rig.pos.footL, R = rig.pos.footR;
  return [[L.x + p[POSE.legL], L.z + p[POSE.legL + 2]], [R.x - p[POSE.legR], R.z + p[POSE.legR + 2]]];
}
/**
 * Standing up in front of a seat of height `h`, over his feet (where standing up from it
 * ends and sitting down on it begins; knights.js stands him there too).
 */
export function standBy(p, h) {
  standingPose(p);
  const z = seatFeet(h) - 0.03;
  p[2] = z;
  p[POSE.legL + 2] = z + 0.02;
  p[POSE.legR + 2] = z + 0.02;
  return p;
}

const solvers = new WeakMap();
/** A solver for a rig, made once (the seated poses measure their knees with it). */
const solverOf = (rig) => { let s = solvers.get(rig); if (!s) { s = createSolver(rig); solvers.set(rig, s); } return s; };
const _kL = new THREE.Vector3();
const _kR = new THREE.Vector3();

/**
 * Sitting on a seat `h` m above the ground (0.23–0.42 for the sceneries' seats; 0 sits on
 * the ground, knees up). `style`:
 *   'resting'   the Dark Souls bonfire rest: slumped forward over his knees, his left foot
 *               drawn in and that arm laid over the knee with the gauntlet hanging past it,
 *               the right leg out with that forearm along the thigh and the hand on the knee,
 *               the head sunk and tipped a little aside (the higher the seat, the deeper the
 *               slump, which keeps his helmet low on tall layouts)
 *   'watchful'  leaning in over his knees, forearms on them, both feet planted under them,
 *               the head up watching the fire, awake (no higher at the helmet than the rest:
 *               tall layouts frame his seat right under the page's header)
 * The hips sit over knight-space (0, 0); the hands are placed on his knees (knight space),
 * so they stay there whatever the torso does. `feet` [left, right] (m): the ground under
 * each foot above the ground he's placed on (a foot up on a log), where feetAt() says they
 * rest (knights.js measures them from the height map).
 */
export function seatedPose(p = newPose(), h = 0.36, rig = DEFAULT_RIG, style = 'resting', feet = null) {
  p.fill(0);
  root(p, 0, h + SEAT_DEPTH - rig.hipsY, 0);
  const watch = style === 'watchful';
  const z = seatFeet(h);
  const grounded = () => { if (feet) { p[POSE.legL + 1] += feet[0]; p[POSE.legR + 1] += feet[1]; } };
  if (h < 0.12) {
    // On the ground: knees drawn up, forearms across them (watchful: sitting up, head up).
    joint(p, 'hips', -14); joint(p, 'spine', watch ? 12 : 20); joint(p, 'chest', watch ? 4 : 10);
    joint(p, 'neck', watch ? -2 : 4); joint(p, 'head', watch ? -8 : 14);
    leg(p, 'L', 0.05, 0, z, 10, 22);
    leg(p, 'R', 0.07, 0, z - 0.04, 6, 26);
    grounded();
    arm(p, 'L', 18, -28, 0.66, 30, 20, 0.6);
    arm(p, 'R', 18, -28, 0.66, 30, 20, 0.6);
    if (watch) { p[POSE.armL + 1] += 6 * DEG; p[POSE.armR + 1] += 6 * DEG; }
    return p;
  }
  const k = clamp01((h - 0.22) / 0.18);
  if (watch) {
    // Leaning in over his knees, the head tipped back up to watch the fire, feet planted a
    // stride apart under his knees. (No higher at the helmet than the rest: a phone frames
    // his seat right under the page's header. His boots stay as far out of the fire.)
    joint(p, 'hips', 8); joint(p, 'spine', 20 + 4 * k); joint(p, 'chest', 8 + 3 * k);
    joint(p, 'neck', -6); joint(p, 'head', -12);
    leg(p, 'L', 0.06, 0, z - 0.055, 0, 16);
    leg(p, 'R', 0.08, 0, z - 0.025, 0, 18);
  } else {
    joint(p, 'hips', -2 + 2 * k); joint(p, 'spine', 21 + 6 * k); joint(p, 'chest', 12 + 3 * k);
    joint(p, 'neck', 3, -3); joint(p, 'head', -2 - 2 * k, -8, -4);
    leg(p, 'L', 0.03, 0, Math.max(0.22, z - 0.2), 0, 10);
    leg(p, 'R', 0.1, 0, z + 0.12, 0, 26);
  }
  grounded();
  // The knees, where the hands go.
  const s = solverOf(rig).solve(p);
  const kL = _kL.copy(s.p[IDX.shinL]), kR = _kR.copy(s.p[IDX.shinR]);
  if (watch) {
    // Forearms on the knees, the hands loosely together in front of them.
    armAt(p, 'L', kL.x - 0.05, kL.y + 0.05, kL.z + 0.14, 55, 25, 0.55, 0, rig);
    armAt(p, 'R', kR.x + 0.05, kR.y + 0.05, kR.z + 0.14, 55, 25, 0.55, 0, rig);
  } else {
    // His left arm over the drawn-in knee, the gauntlet hanging past it; the right forearm
    // along the thigh, the hand on the knee.
    armAt(p, 'L', kL.x + 0.02, kL.y - 0.09, kL.z + 0.12, 45, 55, 0.3, 0, rig);
    armAt(p, 'R', kR.x + 0.01, kR.y + 0.05, kR.z - 0.02, 0, 20, 0.6, 0, rig);
  }
  return p;
}

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
  if (dist < 1e-6) { dn.set(0, -1, 0); dist = lo; } else dn.divideScalar(dist);
  dist = clamp(dist, lo, hi);
  const pp = bendOut.copy(pole).addScaledVector(dn, -pole.dot(dn));
  if (pp.lengthSq() < 1e-8) pp.set(0, 0, 1).addScaledVector(dn, -dn.z);
  if (pp.lengthSq() < 1e-8) pp.set(0, 1, 0).addScaledVector(dn, -dn.y);
  pp.normalize();
  const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  mid.copy(S).addScaledVector(dn, a * cosA).addScaledVector(pp, a * sinA);
  end.copy(S).addScaledVector(dn, dist);
  return pp;
}

/**
 * A solver for one rig. solve(pose, ground?, helmet?) returns { q, p, knee, elbow }: each
 * bone's rotation from its rest orientation (knight space, a "world delta") and its position
 * (knight space), by BONES index; `ground` [left, right] raises each foot's floor (m);
 * `helmet` (with the rig's plates) keeps the pauldrons out of it. clampPlates(helmet) does
 * that again on the last solve's plates (after knights.js springs them); swingArm(side, axis,
 * angle, helmet) turns an arm of the last solve about its shoulder. The arrays are reused:
 * copy what you keep.
 */
export function createSolver(rig = DEFAULT_RIG) {
  const n = BONES.length;
  const q = Array.from({ length: n }, () => new THREE.Quaternion());
  const p = Array.from({ length: n }, () => new THREE.Vector3());
  const rest = BONES.map((b) => rig.pos[b]);
  const off = BONES.map((b, i) => (PARENT[b] ? rest[i].clone().sub(rest[IDX[PARENT[b]]]) : rest[i].clone()));
  // Each limb bone's rest frame (its direction and a hinge across it).
  const restFrame = (from, to, hinge) => frame(new THREE.Quaternion(), rest[IDX[to]].clone().sub(rest[IDX[from]]), hinge);
  const hingeX = new THREE.Vector3(1, 0, 0);
  const R = {};
  const hang = {};
  for (const s of ['L', 'R']) {
    R['upperArm' + s] = restFrame('upperArm' + s, 'forearm' + s, hingeX).invert();
    R['forearm' + s] = restFrame('forearm' + s, 'hand' + s, hingeX).invert();
    R['thigh' + s] = restFrame('thigh' + s, 'shin' + s, hingeX).invert();
    R['shin' + s] = restFrame('shin' + s, 'foot' + s, hingeX).invert();
    hang[s] = rest[IDX['forearm' + s]].clone().sub(rest[IDX['upperArm' + s]]).normalize();
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
    const sh = IDX['shoulder' + s], pa = IDX['pauldron' + s];
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
  /** Whether any of a plate's points go deeper than `allow` into the helmet, the pauldron pushed `d` m `away`. */
  function deeper(pts, sg, bone, env, d, allow) {
    for (let i = 0; i < pts.length; i += 3) {
      w.set(sg * pts[i], pts[i + 1], pts[i + 2]).applyQuaternion(q[bone]).add(p[bone]).addScaledVector(away, d).sub(p[IDX.head]).applyQuaternion(hq);
      if (helmDepth(env, w.x, w.y, w.z) > allow) return true;
    }
    return false;
  }
  /**
   * Keep the pauldrons out of the helmet (no deeper than the model sits at rest): a dome or
   * its lames that would go further in are shoved out from the neck and a little down, the
   * whole pauldron together, as little as it takes (at most PAULDRON.push).
   */
  function clampPlates(helmet) {
    const env = helmet && rig.plates?.helmets?.[helmet];
    if (!env) return;
    hq.copy(q[IDX.head]).invert();
    for (const [s, sg] of /** @type {[string, number][]} */ ([['L', 1], ['R', -1]])) {
      const sh = IDX['shoulder' + s], pa = IDX['pauldron' + s];
      away.set(sg, -0.3, 0).normalize().applyQuaternion(q[IDX.chest]);
      const over = (d) => deeper(rig.plates.dome, sg, sh, env, d, env.allow.dome) || deeper(rig.plates.lames, sg, pa, env, d, env.allow.lames);
      if (!over(0)) continue;
      let lo = 0, hi = PAULDRON.push;
      if (over(hi)) lo = hi;
      for (let it = 0; it < 7 && lo < hi; it++) {
        const m = (lo + hi) / 2;
        if (over(m)) lo = m; else hi = m;
      }
      p[sh].addScaledVector(away, hi);
      p[pa].copy(off[pa]).applyQuaternion(q[sh]).add(p[sh]);
    }
  }

  const turnQ = new THREE.Quaternion();
  /**
   * Turn side s's arm as last solved (the upper arm, forearm, hand and fingers, about its
   * shoulder socket) by `angle` (rad) about `axis` (knight space, unit): its pauldron rides it
   * again (kept out of `helmet`'s way if given: clampPlates). (knights.js: an arm turned out
   * of a pillar.)
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
    for (const [si, s] of /** @type {[number, string][]} */ ([[0, 'L'], [1, 'R']])) {
      const sg = s === 'L' ? 1 : -1;
      const o = sideOf(s);
      fk(IDX['shoulder' + s], chest);
      fk(IDX['upperArm' + s], chest);
      S.copy(p[IDX['upperArm' + s]]);
      const yaw = pose[o], pitch = pose[o + 1];
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
    for (const [si, s] of /** @type {[number, string][]} */ ([[0, 'L'], [1, 'R']])) {
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
      p[IDX['tasset' + s]].copy(off[IDX['tasset' + s]]).applyQuaternion(q[H]).add(p[H]);
    }
    return out;
  }
  return { solve, clampPlates, swingArm, rest, n };
}

// --- curves -------------------------------------------------------------------------------------
const fr = (x) => x - Math.floor(x);
/** An accent on the beat: 1 as it lands, gone by mid-beat, winding up just before the next. */
export const accent = (ph) => Math.exp(-7 * ph) + Math.exp(-18 * (1 - ph));
/** A rise over [a, a + r], a hold, a fall over [T − f, T]. */
const env = (t, a, r, T, f) => (t < a ? 0 : t < a + r ? smooth((t - a) / r) : t < T - f ? 1 : t < T ? smooth((T - t) / f) : 0);
/** A seeded 0..1 from a number. */
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// --- idle -------------------------------------------------------------------------------------
/**
 * Idle life, added to a sitting or standing pose at `t` seconds: breathing, the head
 * sinking slowly and lifting, glances, and every so often a shift of weight or hands (a
 * foot that moves is lifted, a small step, never slid). `alert` 0..1 (watchful): he dozes
 * less and glances more.
 */
export function idle(p, t, seed = 0, seated = true, alert = 0) {
  const breath = Math.sin((TAU * t) / 4.2 + seed);
  nudge(p, 'chest', -1.6 * breath);
  nudge(p, 'neck', 1.0 * breath);
  p[POSE.armL + 1] += 1.2 * DEG * breath;
  p[POSE.armR + 1] += 1.2 * DEG * breath;
  // The head sinks over a few seconds, then lifts with a small start (a doze, now and then).
  const cyc = 9 + 4 * hash(seed + 1);
  const u = fr(t / cyc + hash(seed));
  const sink = (u < 0.72 ? smooth(u / 0.72) : 1 - smoother(Math.min(1, (u - 0.72) / 0.06))) * (1 - 0.7 * alert);
  nudge(p, 'head', (seated ? 9 : 6) * sink);
  nudge(p, 'neck', (seated ? 3 : 2) * sink);
  // Glances: a slow look aside and back, level.
  const g = Math.sin((TAU * t) / 13 + seed * 3) * Math.max(0, Math.sin((TAU * t) / 29 + seed));
  if (Math.abs(g) > 0.002) turnHead(p, (18 + 8 * alert) * DEG * g, 0, Math.abs(g));
  // A shift every ~12 s: the weight rolls, a hand moves, a foot steps.
  const k = Math.floor(t / 12 + hash(seed + 2));
  const v = clamp01((fr(t / 12 + hash(seed + 2)) * 12) / 0.9);
  const w = smooth(v);
  const a = hash(k + seed * 7), b = hash(k - 1 + seed * 7);
  const roll = (a - 0.5) * 6 * w + (b - 0.5) * 6 * (1 - w);
  nudge(p, 'hips', 0, 0, roll);
  nudge(p, 'chest', 0, (a - 0.5) * 8 * w + (b - 0.5) * 8 * (1 - w), -roll * 0.6);
  const hand = (hash(k * 3 + seed) - 0.5) * w + (hash((k - 1) * 3 + seed) - 0.5) * (1 - w);
  p[POSE.armL + 2] += 0.05 * hand;
  p[POSE.armR + 1] += 6 * DEG * hand;
  if (seated) {
    const dz = 0.05 * (a - b);
    p[POSE.legR + 2] += 0.05 * ((a - 0.5) * w + (b - 0.5) * (1 - w));
    p[POSE.legR + 1] += Math.min(0.03, 0.012 + Math.abs(dz) * 0.8) * Math.sin(Math.PI * v);
  }
  return p;
}

// --- looking -----------------------------------------------------------------------------------
/**
 * Turn toward a direction: `yaw` (radians, + to his left) and `pitch` (+ down) in knight
 * space (0, 0: straight ahead, level), whatever the body is doing: the chest takes a little
 * of the turn and the head is aimed there, level (a quaternion aim with the sky's up, shared
 * between neck and head). `w` 0..1 blends from where the pose looked.
 */
export function look(p, yaw, pitch, w = 1) {
  if (w <= 0) return p;
  const bodyYaw = p[POSE.hips + 1] + p[POSE.spine + 1];
  let dy = yaw - bodyYaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const y = clamp(dy, -1.5, 1.5);
  p[POSE.chest + 1] += (y * 0.2 - p[POSE.chest + 1]) * w;
  const x = clamp(pitch, -1.1, 1.1);
  const ay = bodyYaw + y;
  _td.set(Math.sin(ay) * Math.cos(x), -Math.sin(x), Math.cos(ay) * Math.cos(x));
  return aimHead(p, _td, w);
}

// --- reactions -----------------------------------------------------------------------------------
/**
 * Watching something (a weapon rising out of the fire): the slump straightens and the chest
 * lifts, seated or standing; `w` 0..1. (look() turns him to it.)
 */
export function attend(p, w, seated = true) {
  if (w <= 0.001) return p;
  nudge(p, 'hips', (seated ? 4 : 0) * w);
  nudge(p, 'spine', (seated ? -16 : -4) * w);
  nudge(p, 'chest', -8 * w);
  if (seated) { p[POSE.armL + 1] -= 10 * DEG * w; p[POSE.armR + 1] -= 10 * DEG * w; }
  return p;
}
const scratchA = newPose();
/**
 * A flinch at a hit, `t` s after it (over by 1.4 s, easing out to nothing): he jerks back,
 * turns his head away (level) and throws his forearms up over his face; `k` 0..1 how hard;
 * `seated` keeps his seat.
 */
export function flinch(p, t, k = 1, seated = true) {
  const e = (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) / 0.42)) * k * (1 - smooth(clamp01((t - 0.9) / 0.5)));
  if (e <= 0.001) return p;
  nudge(p, 'spine', -18 * e); nudge(p, 'chest', -12 * e); nudge(p, 'neck', -8 * e);
  turnHead(p, 32 * DEG, 12 * DEG, e);
  // The forearms up in front of the face (in the room, however he sits).
  const g = copy(scratchA, p);
  armRoom(g, 'L', -8, 36, 0.4, 60, 20, 1);
  armRoom(g, 'R', -14, 44, 0.38, 55, 20, 1);
  lerpArms(p, g, clamp01(e * 1.1));
  if (!seated) { p[1] -= 0.05 * e; p[2] -= 0.04 * e; }
  return p;
}
/** Leaning away from the stoked fire, `t` s after (over in ~1.2 s), an arm up against the heat. */
export function shield(p, t, k = 1, seated = true) {
  const e = env(t, 0, 0.12, 1.2, 0.8) * k;
  if (e <= 0.001) return p;
  nudge(p, 'spine', -12 * e); nudge(p, 'chest', -6 * e);
  turnHead(p, -24 * DEG, 10 * DEG, e);
  const g = copy(scratchA, p);
  armRoom(g, 'R', -8, 28, 0.45, 60, 35, 0.4);
  lerpArms(p, g, e, 'R');
  if (!seated) p[2] -= 0.08 * e;
  return p;
}
/**
 * A ground ring passing under him, `t` s after it reaches him: seated, he lifts his feet
 * and leans back; standing, a hop with the knees tucked.
 */
export function hop(p, t, k = 1, seated = true) {
  if (t < 0 || t > 0.6) return p;
  if (seated) {
    const e = Math.sin(Math.PI * clamp01(t / 0.55)) * k;
    nudge(p, 'spine', -10 * e); nudge(p, 'chest', -4 * e);
    for (const s of ['L', 'R']) { const o = legOf(s); p[o + 1] += 0.2 * e; p[o + 2] -= 0.04 * e; p[o + 3] -= 12 * DEG * e; }
    p[POSE.armL + 1] -= 12 * DEG * e; p[POSE.armR + 1] -= 12 * DEG * e;
    return p;
  }
  const u = clamp01(t / 0.42);
  const air = 4 * u * (1 - u) * k;
  p[1] += 0.2 * air;
  for (const s of ['L', 'R']) { const o = legOf(s); p[o + 1] += 0.2 * air + 0.1 * air; p[o + 3] += 10 * DEG * air; }
  p[POSE.armL + 1] += 30 * DEG * air; p[POSE.armR + 1] += 30 * DEG * air;
  return p;
}

// --- transitions --------------------------------------------------------------------------------
/** Catmull-Rom through key poses at times `ts` (s), at `t`. */
function spline(out, keys, ts, t) {
  const n = keys.length;
  if (t <= ts[0]) return copy(out, keys[0]);
  if (t >= ts[n - 1]) return copy(out, keys[n - 1]);
  let k = 0;
  while (t > ts[k + 1]) k++;
  const u = (t - ts[k]) / (ts[k + 1] - ts[k]);
  const P0 = keys[Math.max(0, k - 1)], P1 = keys[k], P2 = keys[k + 1], P3 = keys[Math.min(n - 1, k + 2)];
  const u2 = u * u, u3 = u2 * u;
  for (let i = 0; i < POSE_SIZE; i++) {
    out[i] = 0.5 * (2 * P1[i] + (P2[i] - P0[i]) * u + (2 * P0[i] - 5 * P1[i] + 4 * P2[i] - P3[i]) * u2 + (3 * P1[i] - P0[i] - 3 * P2[i] + P3[i]) * u3);
  }
  return out;
}
/** How high a stepping foot lifts (m). */
const STEP_LIFT = 0.06;
/**
 * The feet of `out` stepping from `from` to `to` (poses), each over its own [t0, t1] (s):
 * planted before and after, lifted on the way, the toes dipping. (Only the legs.)
 */
function steps(out, from, to, t, plan) {
  for (const [s, t0, t1] of plan) {
    const o = legOf(s);
    const u = clamp01((t - t0) / (t1 - t0));
    if (u >= 1) { for (let i = 0; i < 5; i++) out[o + i] = to[o + i]; continue; }
    const e = smooth(u), lift = Math.sin(Math.PI * u);
    for (let i = 0; i < 5; i++) out[o + i] = from[o + i] + (to[o + i] - from[o + i]) * e;
    out[o + 1] += STEP_LIFT * lift;
    out[o + 3] += 10 * DEG * lift;
  }
  return out;
}
/** Seconds to stand up or sit down. */
export const RISE_TIME = 1.2;
const riseKeys = Array.from({ length: 5 }, newPose);
/**
 * Getting up from a seat (`t` 0..RISE_TIME s; `sit` and `stand` the two ends, `stand`
 * with the hips over the feet): the feet step in under him (the one out in front first),
 * he leans forward with his hands to his knees, pushes off and rises, a little overshoot
 * back as he straightens. `down` plays it the other way: bend, reach back, lower onto the
 * seat and settle, then the feet step out to where they rest.
 */
export function rise(out, sit, stand, t, down = false) {
  const [k0, k1, k2, k3, k4] = riseKeys;
  if (!down) {
    copy(k0, sit);
    copy(k1, sit); nudge(k1, 'hips', 12); nudge(k1, 'spine', 26); nudge(k1, 'chest', 8); nudge(k1, 'head', -26);
    arm(k1, 'L', 14, -40, 0.72, 25, 20, 0.6); arm(k1, 'R', 12, -40, 0.72, 25, 20, 0.6);
    k1[2] += 0.05;
    lerpPose(k2, sit, stand, 0.5); k2[2] = sit[2] + (stand[2] - sit[2]) * 0.8;
    nudge(k2, 'hips', 16); nudge(k2, 'spine', 24); nudge(k2, 'chest', 6); nudge(k2, 'head', -18);
    arm(k2, 'L', 22, -62, 0.9, 20, 10, 0.7); arm(k2, 'R', 22, -62, 0.9, 20, 10, 0.7);
    copy(k3, stand); k3[1] += 0.015; nudge(k3, 'spine', -5); nudge(k3, 'chest', -3);
    arm(k3, 'L', 95, -84, 0.97, 0, 0, 0.7); arm(k3, 'R', 95, -84, 0.97, 0, 0, 0.7);
    copy(k4, stand);
    spline(out, riseKeys, [0, 0.3, 0.68, 0.98, RISE_TIME], t);
    return steps(out, sit, stand, t, [['R', 0.0, 0.2], ['L', 0.12, 0.32]]);
  }
  copy(k0, stand);
  copy(k1, stand); k1[1] -= 0.1; k1[2] -= 0.06; nudge(k1, 'hips', 14); nudge(k1, 'spine', 26); nudge(k1, 'head', -20);
  arm(k1, 'L', 30, -30, 0.92, 10, 0, 0.6); arm(k1, 'R', 30, -30, 0.92, 10, 0, 0.6);
  copy(k2, sit); k2[1] += 0.03; nudge(k2, 'hips', 10); nudge(k2, 'spine', 18); nudge(k2, 'head', -10);
  arm(k2, 'L', 40, -60, 0.9, 10, 0, 0.6); arm(k2, 'R', 40, -60, 0.9, 10, 0, 0.6);
  copy(k3, sit); nudge(k3, 'spine', 6); nudge(k3, 'head', 6);
  copy(k4, sit);
  spline(out, riseKeys, [0, 0.35, 0.78, 1.0, RISE_TIME], t);
  return steps(out, stand, sit, t, [['R', 0.8, 0.99], ['L', 0.96, 1.18]]);
}

/**
 * Walking: `phase` in strides (one left and one right step per unit), `stride` the length
 * of one step (m). The feet stay put on the ground while he moves over them (knights.js
 * moves him `2 × stride` per unit of phase); 0 marks time in place (turning).
 */
export function walk(out, base, phase, stride = 0.28) {
  copy(out, base);
  const u = fr(phase);
  for (const [s, off] of /** @type {[string, number][]} */ ([['L', 0], ['R', 0.5]])) {
    const o = legOf(s);
    const v = fr(u + off);
    // Swing (0..0.5): lifted and brought forward; stance (0.5..1): planted, sliding back under him.
    const z = v < 0.5 ? -stride / 2 + stride * smooth(v / 0.5) : stride / 2 - stride * ((v - 0.5) / 0.5);
    const lift = v < 0.5 ? Math.sin(Math.PI * v / 0.5) : 0;
    out[o + 2] += z;
    out[o + 1] += (0.09 + (stride ? 0 : 0.03)) * lift;
    out[o + 3] += 10 * DEG * lift;
  }
  const sw = Math.sin(TAU * u);
  out[1] += 0.025 * Math.abs(Math.cos(TAU * u)) - 0.02;
  nudge(out, 'hips', 0, 6 * sw, 3 * sw);
  nudge(out, 'chest', 2, -9 * sw, 0);
  nudge(out, 'spine', 4);
  arm(out, 'L', sw > 0 ? 40 : 150, -80 + 30 * Math.abs(sw), 0.85, 0, 0, 0.8);
  arm(out, 'R', sw < 0 ? 40 : 150, -80 + 30 * Math.abs(sw), 0.85, 0, 0, 0.8);
  return out;
}

/**
 * Turn a standing pose about the point between its feet (or `cx`, `cz`) by `a` (rad, + to his left),
 * each foot stepping round a moment apart (`fL`, `fR` 0..1: how far round it has come,
 * lifted on the way): the body turns with the hips, the feet with their own steps.
 */
function turnPose(p, a, fL = 1, fR = 1, cx = p[0], cz = p[2]) {
  const rot = (x, z, ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [cx + (x - cx) * c + (z - cz) * s, cz - (x - cx) * s + (z - cz) * c]; };
  for (const [s, f] of /** @type {[string, number][]} */ ([['L', fL], ['R', fR]])) {
    const o = legOf(s), sg = s === 'L' ? 1 : -1;
    const rx = DEFAULT_REST['foot' + s][0];
    const [x, z] = rot(rx + sg * p[o], p[o + 2], a * f);
    p[o] = sg * (x - rx); p[o + 2] = z;
    p[o + 1] += STEP_LIFT * 0.8 * Math.sin(Math.PI * clamp01(f)) * Math.min(1, Math.abs(a) / 0.3);
  }
  p[POSE.hips + 1] += a * (fL + fR) / 2;
  return p;
}

// --- gestures ------------------------------------------------------------------------------------
/** The site's dance: its tempo and length (beats), and how long each turn to the front takes (s). */
export const DANCE_BPM = 118;
const DANCE_BEATS = 8;
const DANCE_TURN = 0.4;
const DANCE_LEN = (DANCE_BEATS * 60) / DANCE_BPM;
const DANCE_EASE = 0.35; // (seated: into the dance and out of it, s)
/**
 * The gestures, and how long each lasts (s). 'helm' is the helmet swap's (both hands to it);
 * 'dance' is up from the seat, the Default Dance for two bars at DANCE_BPM, and back down.
 */
export const GESTURE_TIME = {
  praise: 2.3, wave: 2, bow: 2.2, point: 1.9, beckon: 2.1, shrug: 1.6, hurrah: 1.8, joy: 1.6, helm: 1.6,
  dance: 2 * RISE_TIME + 2 * DANCE_TURN + DANCE_LEN,
};
/**
 * The site's dance danced in his seat (gesture()'s `inPlace`: where the view has no room over
 * his seat for him to stand up in): how long it lasts (s), easing into the two bars and out.
 */
export const DANCE_SEATED_TIME = DANCE_LEN + 2 * DANCE_EASE;
export const GESTURES = ['praise', 'wave', 'bow', 'point', 'beckon', 'shrug', 'hurrah', 'joy', 'dance'];
/** Gestures that throw the arms up (or dance): a flinch or a lean over one would hide it. */
export const CHEERS = ['praise', 'hurrah', 'joy', 'dance'];
const gTarget = newPose();
const gStand = newPose();
const gWind = newPose();
const gFrom = new THREE.Quaternion();
const gLook = new THREE.Vector3();
/** How far a seated knight sits up for a gesture (a share of attend()). */
const SIT_UP = { praise: 1, wave: 0.8, bow: 0.7, point: 0.9, beckon: 0.7, shrug: 0.8, hurrah: 1, joy: 1, helm: 0.9 };
/** Gestures with a hand thrown out to his right: with no room there, he uses his left. */
const RIGHT_HANDED = new Set(['wave']);

/**
 * One gesture's pose at `t` into `g` (a copy of the pose it's over); returns its weight.
 * `seated` changes what the legs and hips do (they keep the seat) and a few gestures;
 * `room` [left, right] 0..1: how much room there is out to each side for an arm flung out
 * (a pillar beside him: less; the arm goes up more than out).
 */
function gestureTarget(g, p, name, t, seated, room = FREE) {
  const T = GESTURE_TIME[name];
  const keepLegs = () => { if (seated) { for (let i = 0; i < 3; i++) g[i] = p[i]; for (let i = POSE.legL; i < POSE_SIZE; i++) g[i] = p[i]; g[POSE.hips] = p[POSE.hips]; } };
  switch (name) {
    case 'praise': {
      // The arms fly up and out, the back arches, the feet plant wide (hemmed in on a side,
      // that arm goes up in front of him instead).
      arm(g, 'L', 8 + 70 * room[0], 58 - 2 * room[0], 1, 0, -20, 0); arm(g, 'R', 8 + 70 * room[1], 58 - 2 * room[1], 1, 0, -20, 0);
      joint(g, 'spine', -10); joint(g, 'chest', -10); joint(g, 'neck', -6); joint(g, 'head', -22); joint(g, 'hips', 0);
      root(g, 0, -0.01 + 0.05 * Math.sin(Math.PI * clamp01((t - 0.42) / 0.3)), 0);
      leg(g, 'L', 0.13, 0, 0.02, 0, 16); leg(g, 'R', 0.13, 0, 0.02, 0, 16);
      keepLegs();
      return env(t, 0.36, 0.34, T, 0.5);
    }
    case 'wave': {
      const sw = Math.sin(TAU * 2.2 * Math.max(0, t - 0.3)) * env(t, 0.25, 0.2, T - 0.3, 0.3);
      arm(g, 'R', 72 + 22 * sw, 48, 0.72, -15, -10, 0.1);
      nudge(g, 'head', 0, -8, -6); nudge(g, 'chest', 0, -8, -4);
      if (!seated) g[0] += 0.03;
      return env(t, 0, 0.3, T, 0.4);
    }
    case 'bow': {
      // A hand to the heart, the other out behind; seated, a nod of the chest and head.
      if (seated) { nudge(g, 'spine', 10); nudge(g, 'chest', 5); nudge(g, 'head', 14); }
      else { joint(g, 'hips', 8); nudge(g, 'spine', 24); nudge(g, 'chest', 10); nudge(g, 'head', 12); }
      arm(g, 'R', -40, -12, 0.36, 40, 20, 0.8);
      arm(g, 'L', seated ? 70 : 120, -50, 0.95, 0, 0, 0.6);
      if (!seated) { leg(g, 'R', 0.02, 0, -0.16, 0, 14); g[1] -= 0.04; g[2] -= 0.03; }
      keepLegs();
      return env(t, 0, 0.45, T, 0.55);
    }
    case 'point': {
      arm(g, 'R', 4, 6, 1, 0, 0, 0.6);
      arm(g, 'L', 80, -52, 0.5, -70, 20, 1);
      nudge(g, 'spine', 6); nudge(g, 'chest', 2, -6); nudge(g, 'head', -6, -4);
      if (!seated) { g[2] += 0.05; leg(g, 'R', 0.03, 0, 0.1, 0, 10); }
      return env(t, 0.05, 0.22, T, 0.4);
    }
    case 'beckon': {
      const c = Math.sin(TAU * 1.6 * Math.max(0, t - 0.3)) * env(t, 0.25, 0.15, T - 0.35, 0.2);
      arm(g, 'R', 26, -8 + 10 * c, 0.78 - 0.22 * c, 10, -30 - 40 * c, 0.2 + 0.5 * Math.max(0, c));
      nudge(g, 'spine', -5); nudge(g, 'head', -4, -6, -6);
      return env(t, 0, 0.3, T, 0.4);
    }
    case 'shrug': {
      arm(g, 'L', 70, -38, 0.5, -45, -45, 0);
      arm(g, 'R', 70, -38, 0.5, -45, -45, 0);
      nudge(g, 'neck', -6); nudge(g, 'head', 0, 0, 11); nudge(g, 'chest', -4);
      if (!seated) g[1] += 0.03;
      return env(t, 0.05, 0.25, T, 0.45);
    }
    case 'hurrah': {
      arm(g, 'R', 30, 80, 1, 0, 0, 1);
      arm(g, 'L', 58, -26 + 20 * Math.sin(TAU * 2.4 * t), 0.5, 20, 0, 1);
      nudge(g, 'spine', -8); nudge(g, 'chest', -4); nudge(g, 'head', -16);
      if (!seated) g[1] += 0.07 * Math.max(0, Math.sin(Math.PI * clamp01((t - 0.12) / 0.3)));
      return env(t, 0.05, 0.22, T, 0.45);
    }
    case 'joy': {
      // A crouch, a leap with the arms flung up, a landing (seated: a bounce on the seat, the
      // heels kicking up; the hips stay on the stone).
      const crouch = env(t, 0, 0.25, 0.42, 0.1) + env(t, 0.78, 0.06, 1.1, 0.25) * 0.6;
      const u = clamp01((t - 0.36) / 0.44);
      const air = t > 0.36 && t < 0.8 ? 4 * u * (1 - u) : 0;
      if (!seated) {
        g[1] = p[1] - 0.14 * crouch + 0.32 * air;
        for (const s of ['L', 'R']) { const o = legOf(s); g[o + 1] = p[o + 1] + 0.32 * air + 0.12 * air; g[o + 3] = 20 * DEG * air; }
        nudge(g, 'spine', 22 * crouch - 6 * air);
      } else {
        nudge(g, 'spine', 10 * crouch - 8 * air);
        for (const s of ['L', 'R']) { const o = legOf(s); g[o + 1] = p[o + 1] + 0.09 * air; g[o + 2] = p[o + 2] - 0.03 * air; g[o + 3] = p[o + 3] - 14 * DEG * air; }
      }
      const fling = clamp01((t - 0.3) / 0.14) * (1 - clamp01((t - 1.1) / 0.4));
      arm(g, 'L', 10 + (50 + 20 * crouch) * room[0], -70 + (125 + 10 * room[0]) * fling, 0.95, 0, 0, 0.3);
      arm(g, 'R', 10 + (50 + 20 * crouch) * room[1], -70 + (125 + 10 * room[1]) * fling, 0.95, 0, 0, 0.3);
      nudge(g, 'head', -18 * fling);
      return env(t, 0, 0.12, T, 0.3);
    }
    case 'helm': {
      // Both hands up to the helmet's sides, holding it while it changes: the elbows out
      // wide, the gauntlets upright beside the helm (never over its face).
      nudge(g, 'head', -4); nudge(g, 'chest', -3);
      const h = headAt(g);
      for (const [s, sg] of /** @type {[string, number][]} */ ([['L', 1], ['R', -1]])) {
        armAt(g, s, h.x + sg * HELM_HOLD[0], h.y + HELM_HOLD[1], h.z + HELM_HOLD[2], HELM_HOLD[3], HELM_HOLD[4], 0.25, HELM_HOLD[5]);
      }
      return env(t, 0, 0.3, T, 0.35);
    }
    default: return 0;
  }
}

/**
 * A gesture `t` s in, over the pose already in `p` (sitting or standing: `seated` keeps the
 * legs and hips where they are). Seated, he sits up first, and the arms and head go where
 * they would standing (in the room: an arm thrown up is thrown up however he was slumped;
 * the helmet swap's hands still hold the helmet where it is). `turn` (rad,
 * + his left) is for 'dance': where the front is, to face it while he dances; `stand` (a
 * pose) where he stands up to for it (standBy() in front of the seat if not given).
 * `room` [left, right] 0..1: the room out to each side (knights.js, from the height map: a
 * pillar beside him): an arm that would be flung into something goes up instead (every
 * gesture keeps its arms' swing out and back within it: hem), and a wave changes hands.
 * `inPlace` (seated, 'dance'): he dances it in his seat instead of getting up
 * (DANCE_SEATED_TIME long): the view has no room over him to stand up in.
 */
export function gesture(p, name, t, seated = false, seed = 0, { turn = 0, stand = null, room = FREE, inPlace = false } = {}) {
  const T = GESTURE_TIME[name];
  if (!T || t < 0 || t >= T) return p;
  if (name === 'dance') return hemArms(seated && inPlace ? seatedDanceGesture(p, t, seed, room) : danceGesture(p, t, seated, seed, turn, stand, room), room);
  // (The other hand, as his mirror image: the pose mirrored, gestured, mirrored back.)
  if (RIGHT_HANDED.has(name) && room[1] < 0.5 && room[0] > room[1]) {
    mirrorPose(p);
    gesture(p, name, t, seated, seed, { room: [room[1], room[0]] });
    return mirrorPose(p);
  }
  const up = seated ? env(t, 0, 0.25, T, 0.5) * (SIT_UP[name] ?? 0.8) : 0;
  // Praise the Sun winds up first: the arms swing down and back, a dip, then the up-throw.
  if (name === 'praise') {
    const wind = copy(gWind, p);
    arm(wind, 'L', 20, -86, 0.8, 0, 0, 0.9); arm(wind, 'R', 20, -86, 0.8, 0, 0, 0.9);
    nudge(wind, 'spine', 10); nudge(wind, 'head', 10);
    if (seated) attend(wind, up); else wind[1] -= 0.06;
    if (seated) {
      const s = standingPose(gStand);
      nudge(s, 'spine', 10);
      gFrom.copy(chestFrame(s).q);
      reframeArms(wind, gFrom, chestFrame(wind).q);
    }
    const w = env(t, 0.36, 0.34, T, 0.5);
    lerpPose(p, p, wind, env(t, 0, 0.3, 0.7, 0.34) * (1 - w));
  }
  if (up > 0) attend(p, up);
  const g = copy(gTarget, p);
  const w = gestureTarget(g, p, name, t, seated, room);
  if (seated) {
    // Where the arms would point standing, in the room, now from his seated chest.
    const s = standingPose(gStand);
    gestureTarget(s, s, name, t, false, room);
    gFrom.copy(chestFrame(s).q);
    headDir(s, gLook);
    for (const side of ['L', 'R']) { const o = sideOf(side); for (let i = 0; i < 7; i++) g[o + i] = s[o + i]; }
    reframeArms(g, gFrom, chestFrame(g).q);
    // …and the head looks where it would standing (up with a cheer, down in a bow), level.
    aimHead(g, gLook, 1);
    if (name === 'helm') { const h = headAt(g); for (const [side, sg] of /** @type {[string, number][]} */ ([['L', 1], ['R', -1]])) armAt(g, side, h.x + sg * HELM_HOLD[0], h.y + HELM_HOLD[1], h.z + HELM_HOLD[2], HELM_HOLD[3], HELM_HOLD[4], 0.25, HELM_HOLD[5]); }
  }
  // (Hemmed in at a side: that arm keeps to the room it has, on its way there too.)
  hemArms(g, room);
  lerpPose(p, p, g, w);
  hemArms(p, room);
  if (seed < 0) return p; // (every knight gestures alike today; `seed` is for variations)
  return p;
}

const dBase = newPose();
const dStand = newPose();
const dMove = newPose();
const dRef = newPose();
/**
 * The site's dance, a gesture: seated, he gets up (his feet stepping out to `stand`), turns
 * toward the front (`turn`), dances the Default Dance for two bars at DANCE_BPM on his own
 * clock, turns back and sits down again; standing, he just dances. Pure in `t`, like the
 * others.
 */
function danceGesture(p, t, seated, seed, turn, standAt = null, room = FREE) {
  const base = copy(dBase, p);
  const stand = !seated ? copy(dStand, base) : standAt ? copy(dStand, standAt) : standBy(dStand, clamp(seatOf(base), 0, 0.6));
  const t0 = seated ? RISE_TIME + DANCE_TURN : 0;
  const t1 = t0 + DANCE_LEN;
  if (seated && t < RISE_TIME) return rise(p, base, stand, t);
  if (seated && t >= t1 + DANCE_TURN) return rise(p, base, stand, t - t1 - DANCE_TURN, true);
  if (!seated && t >= t1) return p;
  // On his feet: the dance over his standing pose, eased in and out over a quarter second.
  const period = 60 / DANCE_BPM;
  const m = standingPose(dMove);
  dance(m, 'defaultDance', clamp(t - t0, 0, DANCE_LEN) / period, { period, energy: 0.85, seed: seed & ~1, room });
  // (Moved from over the rest place to where he stands, feet and all.)
  const ref = standingPose(dRef);
  for (let i = 0; i < 3; i++) m[i] += stand[i] - ref[i];
  for (const o of [POSE.legL, POSE.legR]) for (let i = 0; i < 3; i++) m[o + i] += stand[o + i] - ref[o + i];
  const inOut = smooth(clamp01((t - t0) / 0.25)) * smooth(clamp01((t1 - t) / 0.25));
  lerpPose(p, stand, m, inOut);
  // (Into the dance's stance and out of it with a little hop.)
  const hop = 0.04 * Math.sin(Math.PI * inOut);
  p[POSE.legL + 1] += hop; p[POSE.legR + 1] += hop;
  if (seated && turn) {
    // Round to the front before, and back after (each foot stepping round).
    const a = clamp(turn, -1.3, 1.3);
    const f = t < t0 ? (t - RISE_TIME) / DANCE_TURN : t > t1 ? 1 - (t - t1) / DANCE_TURN : 1;
    const u = clamp01(f);
    const first = t < t0 ? 0 : 1; // (which foot leads: the left going round, the right coming back)
    const fL = smooth(clamp01((u - (first ? 0.4 : 0)) / 0.6)), fR = smooth(clamp01((u - (first ? 0 : 0.4)) / 0.6));
    turnPose(p, a, fL, fR, stand[0], stand[2]);
  }
  return p;
}
const dSeat = newPose();
/**
 * The site's dance in his seat (gesture()'s `inPlace`): the Default Dance's seated version
 * (its arm swings and head bob over the seat, dance()'s `seated`) for the same two bars,
 * eased in from the pose he's in and back out to it. He leans in over his knees for it
 * instead of sitting up (SEATED_DANCE_UP, SEATED_DANCE_LEAN), so his helmet stays as low as
 * it sits: the view it's for frames his seat right under the page's header. Pure in `t`.
 */
function seatedDanceGesture(p, t, seed, room = FREE) {
  const period = 60 / DANCE_BPM;
  const m = copy(dSeat, p);
  nudge(m, 'spine', SEATED_DANCE_LEAN);
  dance(m, 'defaultDance', clamp(t - DANCE_EASE, 0, DANCE_LEN) / period, { period, energy: 0.85, seed: seed & ~1, seated: true, up: SEATED_DANCE_UP, room });
  const w = smooth(clamp01(t / DANCE_EASE)) * smooth(clamp01((DANCE_SEATED_TIME - t) / DANCE_EASE));
  return lerpPose(p, p, m, w);
}

// --- dancing --------------------------------------------------------------------------------------
/**
 * The dance moves. Each is a pure function of the beat: `b` beats (fractional), `period`
 * seconds a beat, `energy` 0..1 (how big), `seed` (small variations, a mirrored side).
 * `cycle`: beats until it repeats; `seated`: it works sitting down too (the upper body).
 */
export const MOVE_INFO = {
  nod: { cycle: 2, seated: true },
  stepTouch: { cycle: 2, seated: false },
  fistPump: { cycle: 8, seated: true },
  headbang: { cycle: 2, seated: true },
  swayArms: { cycle: 2, seated: true },
  march: { cycle: 2, seated: false },
  spin: { cycle: 4, seated: false },
  jump: { cycle: 2, seated: false },
  jumpingJack: { cycle: 2, seated: false },
  clap: { cycle: 2, seated: true },
  stomp: { cycle: 2, seated: false },
  praise: { cycle: 1, seated: true },
  defaultDance: { cycle: 8, seated: true },
};
export const MOVES = Object.keys(MOVE_INFO);

const sStand = newPose();
const sRef = new THREE.Quaternion();
const sLook = new THREE.Vector3();
/** How much of a standing move's torso a seated dancer keeps, and how far he sits up for it. */
const SEATED_TORSO = 0.6;
const SEATED_UP = 1;
/**
 * ...and for the site's dance in his seat (seatedDanceGesture): he doesn't sit up, he leans
 * in over his knees (°) and grooves there, so his helmet stays as low as it sits.
 */
const SEATED_DANCE_UP = 0;
const SEATED_DANCE_LEAN = 14;

/**
 * A dance move at beat `b` over the pose in `p` (a standing or seated base): writes the
 * move into `p`. Unknown moves nod. `seated`: the upper body of the move over the seat — he
 * sits up (`up` 0..1 how far: all the way by default), keeps part of the move's lean and
 * sway, and his arms and head go where they would standing (the head level); the legs and
 * hips keep the seat (the nod drums on his knees). `room` [left, right] 0..1: hemmed in at a
 * side, that arm's swing out and back keeps within it (as for gesture()).
 */
export function dance(p, move, b, { period = 0.5, energy = 0.7, seed = 0, seated = false, up = SEATED_UP, room = FREE } = {}) {
  const info = MOVE_INFO[move] ?? MOVE_INFO.nod;
  if (!MOVE_INFO[move] || (seated && !info.seated)) move = 'nod';
  if (!seated) return hemArms(danceOn(p, move, b, period, energy, seed, false), room);
  // The move standing, for its torso and where its arms go.
  const s = danceOn(standingPose(sStand), move, b, period, energy, seed, true);
  const ref = standingPose(dMove);
  sRef.copy(chestFrame(s).q);
  headDir(s, sLook);
  attend(p, up);
  for (const j of ['spine', 'chest']) {
    const o = POSE[j];
    for (let i = 0; i < 3; i++) p[o + i] += (s[o + i] - ref[o + i]) * SEATED_TORSO;
  }
  for (const side of ['L', 'R']) { const o = sideOf(side); for (let i = 0; i < 7; i++) p[o + i] = s[o + i]; }
  reframeArms(p, sRef, chestFrame(p).q);
  // The head looks where it would standing (nodding, banging), level.
  aimHead(p, sLook, 1);
  if (move === 'nod') drum(p, b, 0.8 + 0.45 * clamp01(energy));
  return hemArms(p, room);
}
/**
 * Seated nodding along: the forearms drumming on the knees, bent at the elbow, one hand
 * then the other (knight space, whatever the chest does).
 */
function drum(p, b, A) {
  const pat = (s) => Math.max(0, Math.sin(Math.PI * (b + s)));
  for (const [s, off] of /** @type {[string, number][]} */ ([['L', 0], ['R', 1]])) {
    const h = pat(off) * A;
    armRoom(p, s, 14, -34 + 16 * h, 0.64 - 0.05 * h, 30, 10 - 20 * h, 0.9);
  }
}

/** The moves themselves, over a standing base (`forSeat`: the seated version's upper body). */
function danceOn(p, move, b, period, energy, seed, forSeat) {
  const A = 0.8 + 0.45 * clamp01(energy);
  const mirror = seed % 2 === 1;
  if (mirror) mirrorPose(p);
  const hipsY = p[1];
  const ph = fr(b);
  const beat = Math.floor(b);
  const d = accent(ph);
  const lag = accent(fr(b - 0.07)); // the head and arms follow through a moment late
  const seated = forSeat;
  switch (move) {
    case 'nod': {
      const sway = Math.sin(Math.PI * b);
      p[0] += 0.04 * sway * A; p[1] += -0.075 * d * A;
      nudge(p, 'hips', 0, 0, 7 * sway);
      leg(p, 'L', 0.07, 0, 0.02, 0, 22); leg(p, 'R', 0.07, 0, 0.02, 0, 22);
      arm(p, 'L', 40 + 18 * sway, -58 + 16 * lag, 0.7, 20, 10, 1);
      arm(p, 'R', 40 - 18 * sway, -58 + 16 * lag, 0.7, 20, 10, 1);
      nudge(p, 'spine', 4 + 10 * d * A);
      nudge(p, 'chest', 5 * d * A, 0, -4 * sway);
      nudge(p, 'head', -6 + (seated ? 20 : 30) * lag * A, 0, -7 * sway);
      break;
    }
    case 'stepTouch': {
      // Step out to one side on the beat, the other foot closing to touch; clap as it touches.
      const side = beat % 2 === 0 ? 1 : -1;        // 1: his right, this beat
      const moving = smooth(clamp01((ph - 0.45) / 0.45)); // over to the other side before the next beat
      const cx = -0.13 * A * side * (1 - 2 * moving);
      p[0] = cx; p[1] = hipsY - 0.06 * d * A - 0.03;
      const lead = side > 0 ? 'R' : 'L', trail = side > 0 ? 'L' : 'R';
      // The lead foot holds wide; the trailing one touches beside it, then both swap roles.
      const wide = 0.16 * A, touch = -0.02;
      const liftT = Math.sin(Math.PI * clamp01((ph - 0.45) / 0.45));
      leg(p, lead, wide - (wide - touch) * moving, 0.08 * liftT * (moving > 0.5 ? 1 : 0), 0.02, 0, 16);
      leg(p, trail, touch + (wide - touch) * moving, 0.1 * liftT * (moving <= 0.5 ? 1 : 0) + 0.03 * (1 - moving) * (ph < 0.45 ? 1 : 0), 0.04, 18 * (ph < 0.45 ? 1 : 0), 16);
      // Arms swing open between beats and clap together on the touch.
      const open = 1 - d;
      arm(p, 'L', -4 + 60 * open, -8 - 18 * open, 0.62, 20, 0, 0.2);
      arm(p, 'R', -4 + 60 * open, -8 - 18 * open, 0.62, 20, 0, 0.2);
      nudge(p, 'hips', 0, 8 * side, -9 * side * (1 - 2 * moving));
      nudge(p, 'chest', 4 * d, -6 * side, 5 * side * (1 - 2 * moving));
      nudge(p, 'head', 8 * lag, 8 * side, 7 * side * (1 - 2 * moving));
      break;
    }
    case 'fistPump': {
      // One fist pumps the sky on every beat (four with the right, four with the left); the other on the hip.
      const s = Math.floor(fr(b / 8) * 2) === 0 ? 'R' : 'L';
      const o = s === 'R' ? 'L' : 'R';
      const up = accent(fr(b + 0.03));
      arm(p, s, 18, 8 + 74 * up * A, 0.45 + 0.55 * up, 30 - 20 * up, 0, 1);
      arm(p, o, 82, -54, 0.52, -65, 25, 1);
      nudge(p, 'chest', -9 * up, (s === 'R' ? 6 : -6), (s === 'R' ? 5 : -5) * up);
      nudge(p, 'head', -16 * up + 8 * (1 - lag), 0, (s === 'R' ? -9 : 9) * up); // (the head kept clear of the fist's arm)
      p[1] += -0.07 * (1 - up) * A + 0.02;
      leg(p, 'L', 0.09, 0, 0.02, 0, 20); leg(p, 'R', 0.09, 0, 0.02, 0, 20);
      nudge(p, 'hips', 0, 0, (s === 'R' ? -6 : 6));
      break;
    }
    case 'headbang': {
      // The whole upper body slams down on the beat; air guitar or both fists down.
      const guitar = Math.floor(seed / 2) % 2 === 0;
      nudge(p, 'spine', 6 + 14 * d * A); nudge(p, 'chest', 22 * d * A); nudge(p, 'neck', 18 * lag * A);
      nudge(p, 'head', -18 + 46 * lag * A);
      if (guitar) {
        arm(p, 'L', 22, -6, 0.86, 45, -20, 0.9);
        arm(p, 'R', -18, -34 + 36 * (1 - d), 0.6, 30, 10, 1);
      } else {
        arm(p, 'L', 28, -38 - 30 * d, 0.72, 10, 0, 1);
        arm(p, 'R', 28, -38 - 30 * d, 0.72, 10, 0, 1);
      }
      p[1] += -0.09 * d * A;
      leg(p, 'L', 0.12, 0, 0, 0, 26); leg(p, 'R', 0.12, 0, 0, 0, 26);
      break;
    }
    case 'swayArms': {
      // Arms high in a V, swaying from side to side over two beats, the hips going the other way.
      const s = Math.cos(Math.PI * b); // + to his left on even beats
      arm(p, 'L', 72 + 28 * s, 62 - 16 * s, 0.97, 10, -10, 0.1);
      arm(p, 'R', 72 - 28 * s, 62 + 16 * s, 0.97, 10, -10, 0.1);
      nudge(p, 'spine', 0, 0, -9 * s * A); nudge(p, 'chest', -4, 0, -8 * s * A);
      nudge(p, 'head', -12, 0, -7 * Math.cos(Math.PI * (b - 0.12)) * A);
      p[0] = -0.07 * s * A; p[1] += -0.05 * d;
      leg(p, 'L', 0.1, 0, 0, 0, 16); leg(p, 'R', 0.1, 0, 0, 0, 16);
      nudge(p, 'hips', 0, 0, 7 * s);
      break;
    }
    case 'march': {
      // Knees high, one each beat, the opposite arm swinging forward.
      for (const [s, off] of /** @type {[string, number][]} */ ([['L', 0], ['R', 1]])) {
        const v = fr((b + off) / 2);            // this foot is up in the first half of its two beats
        const lift = v < 0.5 ? Math.sin(Math.PI * v / 0.5) : 0;
        leg(p, s, 0.04, 0.26 * lift * A, 0.1 * lift, 22 * lift, 14);
      }
      const sw = Math.sin(Math.PI * b); // + : left leg up → right arm forward
      arm(p, 'R', sw > 0 ? 25 : 160, -84 + 58 * Math.abs(sw), 0.8, 0, 0, 1);
      arm(p, 'L', sw < 0 ? 25 : 160, -84 + 58 * Math.abs(sw), 0.8, 0, 0, 1);
      p[1] += 0.02 * Math.abs(sw) - 0.04 * d;
      nudge(p, 'hips', 0, 6 * sw, -6 * sw); nudge(p, 'chest', -3, -10 * sw);
      nudge(p, 'head', -6 + 8 * lag);
      break;
    }
    case 'spin': {
      // A full turn over a bar, stepping round on each beat, arms flung out.
      const turn = TAU * (b / 4);
      nudge(p, 'hips', 0, turn / DEG, 0);
      const cs = Math.cos(turn), sn = Math.sin(turn);
      for (const [s, off] of /** @type {[string, number][]} */ ([['L', 0], ['R', 0.5]])) {
        const sg = s === 'L' ? 1 : -1;
        const v = fr(b + off);
        const lift = Math.max(0, Math.sin(TAU * v)) * 0.09;
        // The feet go round with him: a stance ±0.14 m about the hips, turned.
        const lx = sg * 0.14;
        const wx = lx * cs, wz = -lx * sn;
        const rest = sg * DEFAULT_RIG.pos.footL.x;
        leg(p, s, sg * (wx - rest), lift, wz, 10 * lift / 0.09, 10);
      }
      arm(p, 'L', 88, 4 + 26 * d, 1, 0, 0, 0.3);
      arm(p, 'R', 88, 4 + 26 * d, 1, 0, 0, 0.3);
      p[1] += -0.05 * d; nudge(p, 'head', -8, 0, 8);
      break;
    }
    case 'jump': {
      // A leap every beat (every other beat when it's fast), landing on the beat.
      const n = period < 0.42 ? 2 : 1;
      const u = fr(b / n);
      const s = clamp01((u - 0.18) / 0.72);
      const air = u > 0.18 && u < 0.9 ? 4 * s * (1 - s) : 0;
      const crouch = Math.exp(-u * 9) + Math.exp(-(1 - u) * 26) * 0.7;
      p[1] += 0.22 * air * A - 0.12 * crouch;
      for (const side of ['L', 'R']) { const o = legOf(side); p[o + 1] = (0.22 * A + 0.1) * air; p[o + 3] = 18 * DEG * air; p[o] = 0.06; p[o + 4] = 18 * DEG; }
      arm(p, 'L', 50, -60 + 130 * air, 0.95, 0, 0, 1);
      arm(p, 'R', 50, -60 + 130 * air, 0.95, 0, 0, 1);
      nudge(p, 'spine', 16 * crouch - 4 * air); nudge(p, 'head', 10 * crouch - 14 * air);
      break;
    }
    case 'jumpingJack': {
      // Out on one beat (feet wide, arms up), in on the next, hopping between.
      const out = beat % 2 === 0;
      const m = smooth(clamp01((ph - 0.5) / 0.45));
      const k = out ? 1 - m : m; // 1: out
      const hopY = Math.sin(Math.PI * clamp01((ph - 0.5) / 0.5)) * 0.12 * A;
      p[1] += hopY - 0.05 * d;
      leg(p, 'L', -0.04 + 0.24 * k * A, hopY + 0.05 * Math.sin(Math.PI * clamp01((ph - 0.5) / 0.5)), 0, 0, 20);
      leg(p, 'R', -0.04 + 0.24 * k * A, hopY + 0.05 * Math.sin(Math.PI * clamp01((ph - 0.5) / 0.5)), 0, 0, 20);
      arm(p, 'L', 88, -84 + 158 * k, 1, 0, 0, 0.2);
      arm(p, 'R', 88, -84 + 158 * k, 1, 0, 0, 0.2);
      nudge(p, 'head', -10 * k);
      break;
    }
    case 'clap': {
      // Hands meet high overhead on the beat (a low clap in front on the second, for some).
      const low = seed % 4 >= 2 && beat % 2 === 1;
      const open = 1 - accent(fr(b + 0.02));
      if (low) { arm(p, 'L', 2 + 50 * open, 6, 0.62, 30, 0, 0); arm(p, 'R', 2 + 50 * open, 6, 0.62, 30, 0, 0); }
      else { arm(p, 'L', -4 + 52 * open, 70 - 10 * open, 0.92, 20, 0, 0); arm(p, 'R', -4 + 52 * open, 70 - 10 * open, 0.92, 20, 0, 0); }
      nudge(p, 'chest', -6 * d); nudge(p, 'head', -18 + 6 * lag);
      p[1] += -0.07 * d * A; leg(p, 'L', 0.07, 0, 0, 0, 20); leg(p, 'R', 0.07, 0, 0, 0, 20);
      break;
    }
    case 'stomp': {
      // A knee comes up high off the beat and the foot slams down on it, the body dropping into it.
      const s = (beat + 1) % 2 === 0 ? 'R' : 'L'; // the foot that lands on the next beat
      const up = ph < 0.3 ? 0 : ph < 0.78 ? smooth((ph - 0.3) / 0.48) : 1 - ((ph - 0.78) / 0.22) ** 2;
      const other = s === 'R' ? 'L' : 'R';
      leg(p, s, 0.1, 0.3 * up * A, 0.08 * up, 25 * up, 22);
      leg(p, other, 0.1, 0, 0, 0, 18);
      p[1] += -0.1 * d * A + 0.03 * up;
      p[0] = (s === 'R' ? 0.035 : -0.035) * up;
      nudge(p, 'spine', 8 + 16 * d); nudge(p, 'chest', 10 * d); nudge(p, 'head', -8 + 22 * lag);
      arm(p, 'L', 40, -40 - 40 * d, 0.62, 20, 0, 1);
      arm(p, 'R', 40, -40 - 40 * d, 0.62, 20, 0, 1);
      nudge(p, 'hips', 0, 0, (s === 'R' ? 8 : -8) * up);
      break;
    }
    case 'praise': {
      // Praise the Sun, held (for a drop), breathing on the beat.
      arm(p, 'L', 78, 56 + 5 * d, 1, 0, -20, 0); arm(p, 'R', 78, 56 + 5 * d, 1, 0, -20, 0);
      joint(p, 'spine', -10); joint(p, 'chest', -9 - 3 * d); joint(p, 'neck', -6); joint(p, 'head', -22);
      root(p, 0, -0.01 - 0.02 * d, 0); leg(p, 'L', 0.13, 0, 0.02, 0, 16); leg(p, 'R', 0.13, 0, 0.02, 0, 16); joint(p, 'hips', 0);
      break;
    }
    case 'defaultDance': {
      defaultDance(p, b, A, d, lag, hipsY);
      break;
    }
  }
  if (mirror) mirrorPose(p);
  return p;
}

const ddA = newPose();
const ddB = newPose();
/**
 * Fortnite's Default Dance, eight beats. Beats 0–3, the arm swing: both forearms level
 * across the chest, swinging together to one side on the beat and the other on the next
 * (the elbows bent, one arm across the chest and the other out), bouncing on the knees,
 * the chest twisting against the arms and the head bobbing. Beats 4–7, the kicks: a hop on
 * one foot as the other heel kicks out in front, both arms thrown down and out, the other
 * leg on the next beat. Each half eases into the other over the last half beat before it.
 */
function defaultDance(p, b, A, d, lag, hipsY) {
  const base = p;
  const a = copy(ddA, base), k = copy(ddB, base);
  // The arm swing.
  {
    const c = Math.cos(Math.PI * b); // +1 on even beats: swung to his left
    const s = Math.sign(c) * Math.abs(c) ** 0.65;
    arm(a, 'L', 22 + 62 * s, -14 + 12 * d, 0.56, 70 - 20 * s, -10, 1);
    arm(a, 'R', 22 - 62 * s, -14 + 12 * d, 0.56, 70 + 20 * s, -10, 1);
    a[1] = hipsY - 0.11 * d * A - 0.02;
    a[0] = 0.035 * s * A;
    leg(a, 'L', 0.09, 0, 0.02, 0, 22); leg(a, 'R', 0.09, 0, 0.02, 0, 22);
    nudge(a, 'hips', 0, 10 * s, 4 * s);
    nudge(a, 'spine', 5 + 6 * d * A, 0, -3 * s);
    nudge(a, 'chest', 3 * d, -14 * s * A, -4 * s);
    nudge(a, 'head', -2 + 16 * lag * A, 6 * s, 0);
  }
  // The kicks: the right heel on beats 4 and 6, the left on 5 and 7. Each snaps out on its
  // beat, holds a moment and comes back as the other leg winds up for the next.
  {
    const kick = Math.floor(b) % 2 === 0 ? 'R' : 'L';
    const next = kick === 'R' ? 'L' : 'R';
    const ph = fr(b);
    const out = ph < 0.4 ? 1 : ph < 0.82 ? 1 - smooth((ph - 0.4) / 0.42) : 0;
    const pre = ph > 0.84 ? smooth((ph - 0.84) / 0.16) : 0;
    const hopY = 0.05 * A * Math.sin(Math.PI * clamp01((ph - 0.5) / 0.5));
    k[1] = hipsY + hopY - 0.07 * d;
    // (Out on the diagonal and up, the heel leading: it reads from the front as well as aside.)
    const kickLeg = (s, e) => leg(k, s, 0.16 * e + 0.05, 0.2 * e * A + hopY, 0.3 * e * A, -32 * e, 14);
    kickLeg(kick, out);
    kickLeg(next, pre);
    const sgn = kick === 'R' ? 1 : -1;
    nudge(k, 'hips', 0, -8 * sgn * out, 4 * sgn * out);
    nudge(k, 'spine', -6 * out + 4, 0, 0);
    // Both arms thrown down and out with the kick, swinging back in front between.
    const fling = Math.max(out, pre);
    arm(k, 'L', 12 + 62 * fling, -74 + 36 * fling, 0.96, 0, 0, 1);
    arm(k, 'R', 12 + 62 * fling, -74 + 36 * fling, 0.96, 0, 0, 1);
    nudge(k, 'chest', -4 * fling, 6 * sgn * out, 0);
    nudge(k, 'head', -4 + 14 * lag * A, -6 * sgn * out, 0);
  }
  const u = fr(b / 8) * 8; // 0..8
  const m = u < 3.5 ? 0 : u < 4 ? smooth((u - 3.5) / 0.5) : u < 7.5 ? 1 : smooth((8 - u) / 0.5);
  lerpPose(p, a, k, m);
  // (From one half to the other his feet change stance with a hop, never a slide.)
  const hop = 0.045 * Math.sin(Math.PI * m);
  p[1] += hop * 0.6; p[POSE.legL + 1] += hop; p[POSE.legR + 1] += hop;
  return p;
}
