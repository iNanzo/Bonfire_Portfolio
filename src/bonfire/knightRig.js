// The knight's rig and the pose layout (knightPose.js hands all of it out): the channels a
// pose has (POSE), the bones it drives and their rest places (BONES, DEFAULT_REST), how the
// pauldrons ride the arms (PAULDRON), and the measurements a solver works from (measureRig),
// with the plates' collision data from the model's helmets and pauldrons (measurePlates).
import * as THREE from 'three';

export const DEG = Math.PI / 180;

// --- the pose layout ---------------------------------------------------------------------
export const POSE = {
  root: 0, hips: 3, spine: 6, chest: 9, neck: 12, head: 15,
  armL: 18, armR: 25, // yaw, pitch, reach, elbow, wrist pitch, wrist roll, fist
  legL: 32, legR: 37, // x (out), y, z, foot pitch, knee out
};
export const POSE_SIZE = 42;
export const AXIAL = ['hips', 'spine', 'chest', 'neck', 'head'];

/** A new pose (every channel 0: the rest pose, standing, arms as modeled). */
export const newPose = () => new Float32Array(POSE_SIZE);
/** Where a side's arm (sideOf) or leg (legOf) starts in a pose. */
export const sideOf = (s) => (s === 'L' ? POSE.armL : POSE.armR);
export const legOf = (s) => (s === 'L' ? POSE.legL : POSE.legR);
const _e = new THREE.Euler();
/** A joint's turn from its pitch, yaw and roll (radians; YXZ, as every joint takes them). */
export const eulerQ = (out, pitch, yaw, roll) => out.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));

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
export const IDX = Object.fromEntries(BONES.map((b, i) => [b, i]));

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
export function helmDepth(env, x, y, z) {
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
