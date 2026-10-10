// The knight's body language under the gestures and the dance (knightPose.js hands all of it
// out): writing a pose's channels, aiming his arms and head in knight space whatever his
// chest is doing, the base poses (standing; seated at any height), idle life, looking, the
// reactions, and getting up, sitting down and walking.
import * as THREE from 'three';
import { TAU, clamp, clamp01, smooth, smoother } from '../math.js';
import {
  DEG,
  POSE,
  POSE_SIZE,
  AXIAL,
  newPose,
  IDX,
  DEFAULT_REST,
  SEAT_DEPTH,
  DEFAULT_RIG,
  sideOf,
  legOf,
  toeOf,
  eulerQ,
} from './knightRig.js';
import { createSolver } from './knightSolve.js';

// --- writing poses -------------------------------------------------------------------------
/** Set a joint's pitch, yaw, roll (degrees). */
export function joint(p, name, pitch, yaw = 0, roll = 0) {
  const o = POSE[name];
  p[o] = pitch * DEG;
  p[o + 1] = yaw * DEG;
  p[o + 2] = roll * DEG;
}
/** Add to a joint's pitch, yaw, roll (degrees). */
export function nudge(p, name, pitch, yaw = 0, roll = 0) {
  const o = POSE[name];
  p[o] += pitch * DEG;
  p[o + 1] += yaw * DEG;
  p[o + 2] += roll * DEG;
}
/** A hand: yaw/pitch in degrees, reach 0..1, elbow/wrist/roll in degrees, fist 0..1. */
export function arm(p, s, yaw, pitch, reach, elbow = 0, wrist = 0, fist = 0.8, roll = 0) {
  const o = sideOf(s);
  p[o] = yaw * DEG;
  p[o + 1] = pitch * DEG;
  p[o + 2] = reach;
  p[o + 3] = elbow * DEG;
  p[o + 4] = wrist * DEG;
  p[o + 5] = roll * DEG;
  p[o + 6] = fist;
}
/** An ankle, as an offset from its rest place (m; x out to that side), foot pitch and knee out (degrees). */
export function leg(p, s, x, y, z, pitch = 0, knee = 8) {
  const o = legOf(s);
  p[o] = x;
  p[o + 1] = y;
  p[o + 2] = z;
  p[o + 3] = pitch * DEG;
  p[o + 4] = knee * DEG;
}
/** A foot's toe turned in toward his middle, about the vertical (degrees). */
export function toeIn(p, s, deg) {
  p[toeOf(s)] = deg * DEG;
}
export function root(p, x, y, z) {
  p[0] = x;
  p[1] = y;
  p[2] = z;
}
/** Blend `a` toward `b` by t into `out` (the hips' turn the short way round). */
export function lerpPose(out, a, b, t) {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  const y = POSE.hips + 1;
  let d = (b[y] - a[y]) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
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
/** Swap a pose's sides: his left does what his right did (a toe turned in stays turned in). */
export function mirrorPose(p) {
  for (let i = 0; i < 7; i++) {
    const t = p[POSE.armL + i];
    p[POSE.armL + i] = p[POSE.armR + i];
    p[POSE.armR + i] = t;
  }
  for (let i = 0; i < 5; i++) {
    const t = p[POSE.legL + i];
    p[POSE.legL + i] = p[POSE.legR + i];
    p[POSE.legR + i] = t;
  }
  const toe = p[POSE.toeInL];
  p[POSE.toeInL] = p[POSE.toeInR];
  p[POSE.toeInR] = toe;
  for (const j of AXIAL) {
    p[POSE[j] + 1] *= -1;
    p[POSE[j] + 2] *= -1;
  }
  p[0] *= -1;
  return p;
}
export const copy = (out, p) => {
  out.set(p);
  return out;
};

// --- frames: the chest, and aiming arms and the head in knight space ---------------------------
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
export function chestFrame(p, rig = DEFAULT_RIG, out = _frame) {
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
const armVec = (out, yaw, pitch, sg) =>
  out.set(sg * Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
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
export function reframeArms(p, from, to, s = null) {
  _rq.copy(to).invert().multiply(from);
  for (const side of s ? [s] : ['L', 'R']) {
    const o = sideOf(side),
      sg = side === 'L' ? 1 : -1;
    setArmDir(p, o, armVec(_rv, p[o], p[o + 1], sg).applyQuaternion(_rq), sg);
  }
}
/** An arm aimed in knight space (yaw, pitch in degrees, as for arm()), over the pose's chest. */
export function armRoom(p, s, yaw, pitch, reach, elbow = 0, wrist = 0, fist = 0.8, roll = 0, rig = DEFAULT_RIG) {
  arm(p, s, yaw, pitch, reach, elbow, wrist, fist, roll);
  reframeArms(p, IDENTITY, chestFrame(p, rig).q, s);
}
/**
 * A hand put at a place in knight space (m: x, y, z), over the pose's chest: the arm's yaw,
 * pitch and reach from its shoulder socket.
 */
export function armAt(p, s, x, y, z, elbow = 0, wrist = 0, fist = 0.8, roll = 0, rig = DEFAULT_RIG) {
  const f = chestFrame(p, rig);
  const sock = _fv2
    .copy(rig.pos['upperArm' + s])
    .sub(rig.pos.chest)
    .applyQuaternion(f.q)
    .add(f.pos);
  const d = _rv.set(x, y, z).sub(sock);
  const reach = d.length() / (rig.arm[0] + rig.arm[1]);
  d.applyQuaternion(_rq.copy(f.q).invert()).normalize();
  const o = sideOf(s),
    sg = s === 'L' ? 1 : -1;
  arm(p, s, 0, 0, clamp(reach, 0.2, 1), elbow, wrist, fist, roll);
  setArmDir(p, o, d, sg);
}

/**
 * Keep side s's arm in the room it has there (`r` 0..1): its reach back behind him scaled by
 * it, and what it would have swung out to that side swung forward instead, so an arm that
 * would be flung into a pillar goes up or out in front of him. In the pose's own terms (the
 * chest's frame). `from` (a pose): as far out and back as its arm already is, his arm is left
 * as it is (his arm at rest, clear where he sits): only what's more than that is hemmed.
 */
function hem(p, s, r, from = null) {
  if (!(r < 1)) return p;
  const o = sideOf(s);
  const yaw = p[o],
    pitch = p[o + 1];
  let out = Math.sin(yaw) * Math.cos(pitch),
    fwd = Math.cos(yaw) * Math.cos(pitch);
  const up = Math.sin(pitch);
  const k = clamp01(r);
  // (How far out and back `from`'s arm already points.)
  const out0 = from ? Math.max(0, Math.sin(from[o]) * Math.cos(from[o + 1])) : 0;
  const back0 = from ? Math.max(0, -Math.cos(from[o]) * Math.cos(from[o + 1])) : 0;
  if (fwd < -back0) fwd = -back0 + (fwd + back0) * k;
  if (out > out0) {
    fwd += (out - out0) * (1 - k);
    out = out0 + (out - out0) * k;
  }
  // (Hardly anywhere left to point, it points ahead.)
  const len = Math.hypot(out, up, fwd);
  if (len < 0.5) fwd += 0.5 - len;
  const y = Math.atan2(out, fwd);
  p[o] = y + TAU * Math.round((yaw - y) / TAU);
  p[o + 1] = Math.asin(clamp(up / Math.hypot(out, up, fwd), -1, 1));
  return p;
}
/**
 * Both arms kept in their room ([left, right] 0..1); with `from` (a pose), only past where its
 * arms already are (hem).
 */
export const hemArms = (p, room, from = null) => {
  if (room[0] < 1) hem(p, 'L', room[0], from);
  if (room[1] < 1) hem(p, 'R', room[1], from);
  return p;
};
const _fa = new THREE.Vector3();
const _fs = new THREE.Vector3();
/**
 * Keep the hands off the floor: a wrist that would go lower than `y` (m, knight space: the
 * ground he's placed on) is drawn up to it along its arm's own line, the reach shortened (the
 * elbow bending), the aim kept. For a knight sitting on the ground, whose gestures and moves
 * were made for a seat: a hand dropped to a knee or flung low would go into the floor. (Not
 * turned up about the shoulder, its reach kept: an arm hanging all but straight down points
 * nowhere in particular, so its hand would be flung a third of a metre out to whichever side
 * it tipped, then to another the next step, as he leans in to get up.)
 */
export function floorArms(p, y, rig = DEFAULT_RIG) {
  const f = chestFrame(p, rig);
  const armLen = rig.arm[0] + rig.arm[1];
  for (const s of ['L', 'R']) {
    const o = sideOf(s),
      sg = s === 'L' ? 1 : -1;
    const sock = _fs
      .copy(rig.pos['upperArm' + s])
      .sub(rig.pos.chest)
      .applyQuaternion(f.q)
      .add(f.pos);
    // (How far down the arm goes for each metre it reaches; its reach as the solver takes it.)
    const fall = -armVec(_fa, p[o], p[o + 1], sg).applyQuaternion(f.q).y;
    if (sock.y - fall * clamp(p[o + 2], 0.2, 1) * armLen >= y) continue;
    // (A shoulder that low, or an arm not going down, can only be drawn in as far as it goes.)
    p[o + 2] = fall > 1e-4 ? Math.max(0.2, (sock.y - y) / fall / armLen) : 0.2;
  }
  return p;
}

const _lq = new THREE.Quaternion();
const _lv = new THREE.Vector3();
/** How low the lower of his hip sockets sits under the hips joint, turned so (pitch, yaw, roll). */
function lowerHip(pitch, yaw, roll, rig) {
  eulerQ(_lq, pitch, yaw, roll);
  let low = Infinity;
  for (const s of ['L', 'R'])
    low = Math.min(
      low,
      _lv
        .copy(rig.pos['thigh' + s])
        .sub(rig.pos.hips)
        .applyQuaternion(_lq).y,
    );
  return low;
}
/**
 * Sitting on the ground, his hips roll about the lower of his sitting bones, not their middle:
 * he's raised as far as the roll (the pose's, and his idle's shifts of weight, up to 3° either
 * way) would have sunk that side below where it sat unrolled, the other side lifting as a
 * body does. (Rolled about their middle, 6° took a thigh 1 cm further into the ground.)
 */
export function sitOnLowerHip(p, rig = DEFAULT_RIG) {
  const o = POSE.hips;
  if (Math.abs(p[o + 2]) < 1e-6) return p;
  p[1] += Math.max(0, lowerHip(p[o], p[o + 1], 0, rig) - lowerHip(p[o], p[o + 1], p[o + 2], rig));
  return p;
}

const _ha = new THREE.Vector3();
/** Where the head joint is (knight space) in a pose. Reused: copy what you keep. */
export function headAt(p, rig = DEFAULT_RIG) {
  const f = chestFrame(p, rig);
  const P = rig.pos;
  const nq = _fq.copy(f.q).multiply(eulerQ(_hh, p[POSE.neck], p[POSE.neck + 1], p[POSE.neck + 2]));
  return _ha
    .copy(P.neck)
    .sub(P.chest)
    .applyQuaternion(f.q)
    .add(f.pos)
    .add(_fv.copy(P.head).sub(P.neck).applyQuaternion(nq));
}
/** The helmet swap's hold: each wrist this far out, up, forward from the head (m); the elbow's turn, the wrist, its roll (degrees). */
export const HELM_HOLD = [0.215, 0.04, 0.0, -40, -10, -75];
const _hn = new THREE.Quaternion();
const _hh = new THREE.Quaternion();
const _hd = new THREE.Quaternion();
const _hr = new THREE.Quaternion();
const _he = new THREE.Euler();
const _hx = new THREE.Vector3();
const _hy = new THREE.Vector3();
const _hz = new THREE.Vector3();
/** How far the neck and head together turn from the chest (rad): side to side, up, down. */
const NECK_YAW = 72 * DEG,
  NECK_UP = 62 * DEG,
  NECK_DOWN = 55 * DEG;
/** The neck's share of a look (the head takes the rest). */
const NECK_SHARE = 0.4;
/** The head's facing in knight space (unit), from a pose. */
export function headDir(p, out) {
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
export function aimHead(p, dir, w = 1) {
  if (w <= 0) return p;
  const c = chestFrame(p).q;
  // Where the neck and head point now, from the chest.
  const cur = eulerQ(_hr, p[POSE.neck], p[POSE.neck + 1], p[POSE.neck + 2]).multiply(
    eulerQ(_hh, p[POSE.head], p[POSE.head + 1], p[POSE.head + 2]),
  );
  // The aim in the chest's frame, turned and nodded no further than a neck goes.
  const f = _hz.copy(dir).normalize().applyQuaternion(_hd.copy(c).invert());
  let yaw = Math.atan2(f.x, f.z),
    pitch = Math.asin(clamp(-f.y, -1, 1));
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
  for (const [name, q] of /** @type {[string, THREE.Quaternion][]} */ ([
    ['neck', _hn],
    ['head', _hh],
  ])) {
    _he.setFromQuaternion(q, 'YXZ');
    const o = POSE[name];
    p[o] = _he.x;
    p[o + 1] = _he.y;
    p[o + 2] = _he.z;
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
  joint(p, 'spine', 3);
  joint(p, 'chest', 2);
  joint(p, 'head', -4);
  arm(p, 'L', 62, -80, 0.95, 0, 0, 0.7);
  arm(p, 'R', 62, -80, 0.95, 0, 0, 0.7);
  leg(p, 'L', 0.03, 0, 0.01, 0, 10);
  leg(p, 'R', 0.03, 0, 0.01, 0, 10);
  return p;
}

/**
 * How far the boot of the leg he stretches out resting on the ground turns in toward his other
 * foot (degrees, from his hips' facing). That leg points nearly at the home camera, which
 * foreshortens the turn: at 35° the boot read as pointing straight at it, at 50° in toward
 * the drawn-up foot, as in the user's reference (round 11's captures).
 */
const GROUND_TOE_IN = 50;
/** Where the feet go in front of a seat of height `h` (m above the ground), knight space z. */
export const seatFeet = (h) => clamp(0.3 + 0.35 * h, 0.3, 0.46);
/** The seat's height (m) a seated pose sits on (from where its hips are). */
export const seatOf = (p, rig = DEFAULT_RIG) => p[1] + rig.hipsY - SEAT_DEPTH;
/**
 * Where each foot of a pose rests on the ground, knight space: [[x, z, turn] left, [x, z,
 * turn] right] (the ankle's place, and which way its toe points, rad from straight ahead, +
 * toward his left: turned with his hips and turned in by its toe-in, as solved; knights.js
 * looks up the ground under its sole and keeps its toe out of the fire).
 */
export function feetAt(p, rig = DEFAULT_RIG) {
  const L = rig.pos.footL,
    R = rig.pos.footR,
    yaw = p[POSE.hips + 1];
  return [
    [L.x + p[POSE.legL], L.z + p[POSE.legL + 2], yaw - p[POSE.toeInL]],
    [R.x - p[POSE.legR], R.z + p[POSE.legR + 2], yaw + p[POSE.toeInR]],
  ];
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
const solverOf = (rig) => {
  let s = solvers.get(rig);
  if (!s) {
    s = createSolver(rig);
    solvers.set(rig, s);
  }
  return s;
};
const _kL = new THREE.Vector3();
const _kR = new THREE.Vector3();

/**
 * Sitting on a seat `h` m above the ground (0.23–0.42 for the sceneries' seats; under 0.12 he
 * sits on the ground itself). `style`:
 *   'resting'   the Dark Souls bonfire rest: slumped forward over his knees, his left foot
 *               drawn in and that arm laid over the knee with the gauntlet hanging past it,
 *               the right leg out with that forearm along the thigh and the hand on the knee,
 *               the head sunk and tipped a little aside (the higher the seat, the deeper the
 *               slump, which keeps his helmet low on tall layouts). On the ground, a knight
 *               spent by the road: the left knee drawn up high with that arm hung over it, the
 *               forearm across the kneecap and the gauntlet hanging limp inside it, the right
 *               leg stretched out along the ground, slumped toward the knee, the head sunk and
 *               tipped to it
 *   'watchful'  leaning in over his knees, forearms on them, both feet planted under them,
 *               the head up watching the fire, awake (no higher at the helmet than the rest:
 *               tall layouts frame his seat right under the page's header). On the ground,
 *               sitting up with both knees drawn up, the left the higher, the left forearm over
 *               its knee and the right along its thigh, the hands hanging past them, the chest
 *               and the head turned to the fire
 * The hips sit over knight-space (0, 0); the hands are placed on his knees (knight space),
 * so they stay there whatever the torso does. `feet` [left, right] (m): the ground under
 * each foot above the ground he's placed on (a foot up on a log), where feetAt() says they
 * rest (knights.js measures them from the height map).
 */
export function seatedPose(p = newPose(), h = 0.36, rig = DEFAULT_RIG, style = 'resting', feet = null) {
  p.fill(0);
  root(p, 0, h + SEAT_DEPTH - rig.hipsY, 0);
  const watch = style === 'watchful';
  const ground = h < 0.12;
  const z = seatFeet(h);
  const k = clamp01((h - 0.22) / 0.18);
  if (ground && watch) {
    // Sitting up, leaning back a little from the hips, both knees drawn up: the left the
    // higher, its foot near him (the fire is ahead on his left: his boots stay out of it),
    // the right a little further out (no further, nor fallen out more: the back of that
    // thigh would go into the ground as his weight shifts). The chest turned a little to the
    // fire, the head up and turned to it.
    joint(p, 'hips', -16);
    joint(p, 'spine', 10, 6);
    joint(p, 'chest', 4, 8);
    joint(p, 'neck', -2, 8);
    joint(p, 'head', 0, 12);
    leg(p, 'L', 0.03, 0, 0.32, 0, 24);
    leg(p, 'R', 0.1, 0, 0.44, 0, 22);
  } else if (ground) {
    // Slumped toward his left knee, drawn up high and fallen out a little, its foot near him
    // (out of the fire, ahead on his left), his weight on that side (the hips rolled off the
    // right, about the left hip at home: sitOnLowerHip, which knights.js applies; it lifts
    // the back of that rolled-out thigh off the ground); the right leg stretched out along
    // the ground, away from the fire, the knee a little bent and rolled a little out, its
    // boot turned in toward his other foot (both as in the user's Dark Souls reference; no
    // straighter: as his weight shifts the foot steps out and the leg would lock, the back
    // of the thigh dropping into the ground). The head sunk and tipped toward the knee.
    joint(p, 'hips', -16, -6, -3);
    joint(p, 'spine', 20, 4, -3);
    joint(p, 'chest', 10, 4, -5);
    joint(p, 'neck', 12, 4);
    joint(p, 'head', 17, 8, -13);
    leg(p, 'L', 0.02, 0, 0.38, 0, 40);
    leg(p, 'R', 0.32, 0, 0.69, 0, 40);
    toeIn(p, 'R', GROUND_TOE_IN);
  } else if (watch) {
    // Leaning in over his knees, the head tipped back up to watch the fire, feet planted a
    // stride apart under his knees. (No higher at the helmet than the rest: a phone frames
    // his seat right under the page's header. His boots stay as far out of the fire.)
    joint(p, 'hips', 8);
    joint(p, 'spine', 20 + 4 * k);
    joint(p, 'chest', 8 + 3 * k);
    joint(p, 'neck', -6);
    joint(p, 'head', -12);
    leg(p, 'L', 0.06, 0, z - 0.055, 0, 16);
    leg(p, 'R', 0.08, 0, z - 0.025, 0, 18);
  } else {
    joint(p, 'hips', -2 + 2 * k);
    joint(p, 'spine', 21 + 6 * k);
    joint(p, 'chest', 12 + 3 * k);
    joint(p, 'neck', 3, -3);
    joint(p, 'head', -2 - 2 * k, -8, -4);
    leg(p, 'L', 0.03, 0, Math.max(0.22, z - 0.2), 0, 10);
    leg(p, 'R', 0.1, 0, z + 0.12, 0, 26);
  }
  if (feet) {
    p[POSE.legL + 1] += feet[0];
    p[POSE.legR + 1] += feet[1];
  }
  // The knees, where the hands go.
  const s = solverOf(rig).solve(p);
  const kL = _kL.copy(s.p[IDX.shinL]),
    kR = _kR.copy(s.p[IDX.shinR]);
  if (ground && watch) {
    // His left forearm over the knee, the elbow on it and the hand hanging past; the right
    // forearm along the thigh, the hand hanging over the knee, bent down at the wrist and
    // rolled little (a rolled hand points straight down as a gesture blends in: at the stone
    // by his right knee in the ruins).
    armAt(p, 'L', kL.x, kL.y - 0.09, kL.z + 0.2, -155, -30, 0.3, 0, rig);
    armAt(p, 'R', kR.x + 0.02, kR.y + 0.08, kR.z + 0.08, 22, 80, 0.45, -10, rig);
  } else if (ground) {
    // His left arm hung over the drawn-up knee, the elbow out over its top and the forearm
    // across the kneecap, the gauntlet hanging limp inside it; the right forearm along the
    // stretched thigh, the hand on the knee.
    armAt(p, 'L', kL.x - 0.09, kL.y - 0.07, kL.z + 0.2, -130, -45, 0.3, 0, rig);
    armAt(p, 'R', kR.x, kR.y + 0.13, kR.z - 0.02, -20, 30, 0.6, 0, rig);
  } else if (watch) {
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

// --- curves -------------------------------------------------------------------------------------
export const fr = (x) => x - Math.floor(x);
/** An accent on the beat: 1 as it lands, gone by mid-beat, winding up just before the next. */
export const accent = (ph) => Math.exp(-7 * ph) + Math.exp(-18 * (1 - ph));
/** A rise over [a, a + r], a hold, a fall over [T − f, T]. */
export const env = (t, a, r, T, f) =>
  t < a ? 0 : t < a + r ? smooth((t - a) / r) : t < T - f ? 1 : t < T ? smooth((T - t) / f) : 0;
/** A seeded 0..1 from a number. */
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

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
  const a = hash(k + seed * 7),
    b = hash(k - 1 + seed * 7);
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
  if (seated) {
    p[POSE.armL + 1] -= 10 * DEG * w;
    p[POSE.armR + 1] -= 10 * DEG * w;
  }
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
  nudge(p, 'spine', -18 * e);
  nudge(p, 'chest', -12 * e);
  nudge(p, 'neck', -8 * e);
  turnHead(p, 32 * DEG, 12 * DEG, e);
  // The forearms up in front of the face (in the room, however he sits).
  const g = copy(scratchA, p);
  armRoom(g, 'L', -8, 36, 0.4, 60, 20, 1);
  armRoom(g, 'R', -14, 44, 0.38, 55, 20, 1);
  lerpArms(p, g, clamp01(e * 1.1));
  if (!seated) {
    p[1] -= 0.05 * e;
    p[2] -= 0.04 * e;
  }
  return p;
}
/** Leaning away from the stoked fire, `t` s after (over in ~1.2 s), an arm up against the heat. */
export function shield(p, t, k = 1, seated = true) {
  const e = env(t, 0, 0.12, 1.2, 0.8) * k;
  if (e <= 0.001) return p;
  nudge(p, 'spine', -12 * e);
  nudge(p, 'chest', -6 * e);
  turnHead(p, -24 * DEG, 10 * DEG, e);
  const g = copy(scratchA, p);
  armRoom(g, 'R', -8, 28, 0.45, 60, 35, 0.4);
  lerpArms(p, g, e, 'R');
  if (!seated) p[2] -= 0.08 * e;
  return p;
}
// (How far a seated ring lifts his feet (m).)
const HOP_FEET = 0.2;
/**
 * A ground ring passing under him, `t` s after it reaches him: seated, he lifts his feet
 * and leans back; standing, a hop with the knees tucked. `rise` (seated) [left, right] (m):
 * how far each foot may lift; one resting high (up on a stone, say) lifts only that
 * far, or stays put (knights.js riseOf), so its knee keeps its bend.
 */
export function hop(p, t, k = 1, seated = true, rise = null) {
  if (t < 0 || t > 0.6) return p;
  if (seated) {
    const e = Math.sin(Math.PI * clamp01(t / 0.55)) * k;
    nudge(p, 'spine', -10 * e);
    nudge(p, 'chest', -4 * e);
    for (let i = 0; i < 2; i++) {
      const o = i ? POSE.legR : POSE.legL,
        f = rise ? e * clamp01(rise[i] / HOP_FEET) : e;
      p[o + 1] += HOP_FEET * f;
      p[o + 2] -= 0.04 * f;
      p[o + 3] -= 12 * DEG * f;
    }
    p[POSE.armL + 1] -= 12 * DEG * e;
    p[POSE.armR + 1] -= 12 * DEG * e;
    return p;
  }
  const u = clamp01(t / 0.42);
  const air = 4 * u * (1 - u) * k;
  p[1] += 0.2 * air;
  for (const s of ['L', 'R']) {
    const o = legOf(s);
    p[o + 1] += 0.2 * air + 0.1 * air;
    p[o + 3] += 10 * DEG * air;
  }
  p[POSE.armL + 1] += 30 * DEG * air;
  p[POSE.armR + 1] += 30 * DEG * air;
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
  const P0 = keys[Math.max(0, k - 1)],
    P1 = keys[k],
    P2 = keys[k + 1],
    P3 = keys[Math.min(n - 1, k + 2)];
  const u2 = u * u,
    u3 = u2 * u;
  for (let i = 0; i < POSE_SIZE; i++) {
    out[i] =
      0.5 *
      (2 * P1[i] +
        (P2[i] - P0[i]) * u +
        (2 * P0[i] - 5 * P1[i] + 4 * P2[i] - P3[i]) * u2 +
        (3 * P1[i] - P0[i] - 3 * P2[i] + P3[i]) * u3);
  }
  return out;
}
/** How high a stepping foot lifts (m). */
const STEP_LIFT = 0.06;
/** A step up to this long (m) takes the time it's given; a longer one, longer in proportion. */
const STEP_LONG = 0.3;
/**
 * How much higher a foot stepping between its seated and its standing place has to go, `e`
 * 0..1 of the way from the seated end (`h`: rise()'s `over`, at evenly spaced points; 0 at
 * both ends).
 */
function overAt(h, e) {
  if (!h || h.length < 2) return 0;
  const f = clamp01(e) * (h.length - 1),
    i = Math.min(h.length - 2, Math.floor(f));
  return h[i] + (h[i + 1] - h[i]) * (f - i);
}
/**
 * The feet of `out` stepping from `from` to `to` (poses), each over its own [t0, t1] (s), or
 * longer for a long step (a leg stretched out along the ground drawn in under him), done by
 * RISE_TIME: planted before and after, lifted on the way (over what lies there: `over`,
 * rise()'s, from the seated end, `back` when `from` is the standing one), the toes dipping and
 * turning (a toe turned in turns out on the way: never on the ground). (Only the legs.)
 */
function steps(out, from, to, t, plan, over = null, back = false) {
  for (const [s, t0, t1] of plan) {
    const o = legOf(s),
      toe = toeOf(s);
    const long = Math.max(1, Math.hypot(to[o] - from[o], to[o + 2] - from[o + 2]) / STEP_LONG);
    const u = clamp01((t - t0) / (Math.min(RISE_TIME, t0 + (t1 - t0) * long) - t0));
    if (u >= 1) {
      for (let i = 0; i < 5; i++) out[o + i] = to[o + i];
      out[toe] = to[toe];
      continue;
    }
    const e = smooth(u),
      lift = Math.sin(Math.PI * u);
    for (let i = 0; i < 5; i++) out[o + i] = from[o + i] + (to[o + i] - from[o + i]) * e;
    out[toe] = from[toe] + (to[toe] - from[toe]) * e;
    out[o + 1] += STEP_LIFT * lift + overAt(over?.[s], back ? 1 - e : e);
    out[o + 3] += 10 * DEG * lift;
  }
  return out;
}
/** Seconds to stand up or sit down. */
export const RISE_TIME = 1.2;
/**
 * The furthest down he looks leaning in to get up from his seat or to sit down on it (rad,
 * ahead): at the ground in front of him, his head lifted out of a deep slump (which would
 * curl him into a ball, the top of his helmet to the camera).
 */
const RISE_LOOK = 50 * DEG;
const _hu = new THREE.Vector3();
/** Lift the head of `p` to look ahead no further down than `pitch` (rad), if it's bowed further. */
function headUpTo(p, pitch) {
  if (Math.asin(clamp(-headDir(p, _hu).y, -1, 1)) > pitch) look(p, 0, pitch);
  return p;
}
const riseKeys = Array.from({ length: 5 }, newPose);
const riseOver = newPose();
/**
 * Standing up over where a seated pose's feet rest (`sit`'s feet, each on its own ground,
 * the hips over the middle of them; the rest of him as `stand`), into `out`.
 */
function standOver(out, sit, stand) {
  copy(out, stand);
  for (const o of [POSE.legL, POSE.legR]) for (let i = 0; i < 3; i++) out[o + i] = sit[o + i];
  out[POSE.toeInL] = sit[POSE.toeInL];
  out[POSE.toeInR] = sit[POSE.toeInR];
  out[0] = (sit[POSE.legL] - sit[POSE.legR]) / 2;
  out[2] = (sit[POSE.legL + 2] + sit[POSE.legR + 2]) / 2 - 0.02;
  return out;
}
/**
 * Getting up from a seat (`t` 0..RISE_TIME s; `sit` and `stand` the two ends, `stand`
 * with the hips over the feet): the feet step in under him (the one out in front first),
 * he leans forward with his hands to his knees, pushes off and rises, a little overshoot
 * back as he straightens. `down` plays it the other way: bend, reach back, lower onto the
 * seat and settle, then the feet step out to where they rest. `over` ({ L, R, cross }, each
 * foot's extra lift (m) at evenly spaced points from its seated place to its standing one,
 * 0 at both ends; knights.js, from the scenery's shapes): a foot stepping off or over
 * something (a stone or a log in his way) lifts over it on its way instead of through it, and
 * where one has to go over something on its way (`cross`) he stands up first, over his feet
 * where they rest, and then steps across (sitting down: steps back across, then sits).
 */
export function rise(out, sit, stand, t, down = false, over = null) {
  const [k0, k1, k2, k3, k4] = riseKeys;
  if (over?.cross) return riseAcross(out, sit, stand, t, down, over);
  if (!down) {
    copy(k0, sit);
    copy(k1, sit);
    nudge(k1, 'hips', 12);
    nudge(k1, 'spine', 26);
    nudge(k1, 'chest', 8);
    nudge(k1, 'head', -26);
    headUpTo(k1, RISE_LOOK);
    arm(k1, 'L', 14, -40, 0.72, 25, 20, 0.6);
    arm(k1, 'R', 12, -40, 0.72, 25, 20, 0.6);
    k1[2] += 0.05;
    lerpPose(k2, sit, stand, 0.5);
    k2[2] = sit[2] + (stand[2] - sit[2]) * 0.8;
    nudge(k2, 'hips', 16);
    nudge(k2, 'spine', 24);
    nudge(k2, 'chest', 6);
    nudge(k2, 'head', -18);
    headUpTo(k2, RISE_LOOK - 10 * DEG);
    arm(k2, 'L', 22, -62, 0.9, 20, 10, 0.7);
    arm(k2, 'R', 22, -62, 0.9, 20, 10, 0.7);
    copy(k3, stand);
    k3[1] += 0.015;
    nudge(k3, 'spine', -5);
    nudge(k3, 'chest', -3);
    arm(k3, 'L', 95, -84, 0.97, 0, 0, 0.7);
    arm(k3, 'R', 95, -84, 0.97, 0, 0, 0.7);
    copy(k4, stand);
    spline(out, riseKeys, [0, 0.3, 0.68, 0.98, RISE_TIME], t);
    return steps(
      out,
      sit,
      stand,
      t,
      [
        ['R', 0.0, 0.2],
        ['L', 0.12, 0.32],
      ],
      over,
    );
  }
  copy(k0, stand);
  copy(k1, stand);
  k1[1] -= 0.1;
  k1[2] -= 0.06;
  nudge(k1, 'hips', 14);
  nudge(k1, 'spine', 26);
  nudge(k1, 'head', -20);
  arm(k1, 'L', 30, -30, 0.92, 10, 0, 0.6);
  arm(k1, 'R', 30, -30, 0.92, 10, 0, 0.6);
  copy(k2, sit);
  k2[1] += 0.03;
  nudge(k2, 'hips', 10);
  nudge(k2, 'spine', 18);
  nudge(k2, 'head', -10);
  headUpTo(k2, RISE_LOOK - 5 * DEG);
  arm(k2, 'L', 40, -60, 0.9, 10, 0, 0.6);
  arm(k2, 'R', 40, -60, 0.9, 10, 0, 0.6);
  copy(k3, sit);
  nudge(k3, 'spine', 6);
  nudge(k3, 'head', 6);
  copy(k4, sit);
  spline(out, riseKeys, [0, 0.35, 0.78, 1.0, RISE_TIME], t);
  return steps(
    out,
    stand,
    sit,
    t,
    [
      ['R', 0.8, 0.99],
      ['L', 0.96, 1.18],
    ],
    over,
    true,
  );
}
/**
 * rise() where a foot has something to step over on its way (`over.cross`): up, he leans in
 * and pushes up off his seat over his feet where they rest (one up on a stone, say),
 * then steps across to where he stands, the right foot and then the left, each lifted over
 * what's in its way; down, the other way round: he steps back across, then bends and sits.
 */
function riseAcross(out, sit, stand, t, down, over) {
  const [k0, k1, k2, k3, k4] = riseKeys;
  const mid = standOver(riseOver, sit, stand);
  if (!down) {
    copy(k0, sit);
    copy(k1, sit);
    nudge(k1, 'hips', 12);
    nudge(k1, 'spine', 26);
    nudge(k1, 'chest', 8);
    nudge(k1, 'head', -26);
    headUpTo(k1, RISE_LOOK);
    arm(k1, 'L', 14, -40, 0.72, 25, 20, 0.6);
    arm(k1, 'R', 12, -40, 0.72, 25, 20, 0.6);
    k1[2] += 0.04;
    lerpPose(k2, sit, mid, 0.55);
    nudge(k2, 'hips', 16);
    nudge(k2, 'spine', 22);
    nudge(k2, 'chest', 6);
    nudge(k2, 'head', -16);
    headUpTo(k2, RISE_LOOK - 10 * DEG);
    arm(k2, 'L', 22, -62, 0.9, 20, 10, 0.7);
    arm(k2, 'R', 22, -62, 0.9, 20, 10, 0.7);
    copy(k3, mid);
    k3[1] += 0.01;
    nudge(k3, 'spine', -3);
    nudge(k3, 'chest', -2);
    arm(k3, 'L', 80, -82, 0.96, 0, 0, 0.7);
    arm(k3, 'R', 80, -82, 0.96, 0, 0, 0.7);
    copy(k4, stand);
    spline(out, riseKeys, [0, 0.3, 0.6, 0.86, RISE_TIME], t);
    return steps(
      out,
      sit,
      stand,
      t,
      [
        ['R', 0.78, 0.98],
        ['L', 0.94, 1.16],
      ],
      over,
    );
  }
  copy(k0, stand);
  copy(k1, mid);
  copy(k2, mid);
  k2[1] -= 0.1;
  k2[2] -= 0.05;
  nudge(k2, 'hips', 14);
  nudge(k2, 'spine', 26);
  nudge(k2, 'head', -20);
  arm(k2, 'L', 30, -30, 0.92, 10, 0, 0.6);
  arm(k2, 'R', 30, -30, 0.92, 10, 0, 0.6);
  copy(k3, sit);
  k3[1] += 0.03;
  nudge(k3, 'hips', 10);
  nudge(k3, 'spine', 18);
  nudge(k3, 'head', -10);
  headUpTo(k3, RISE_LOOK - 5 * DEG);
  arm(k3, 'L', 40, -60, 0.9, 10, 0, 0.6);
  arm(k3, 'R', 40, -60, 0.9, 10, 0, 0.6);
  copy(k4, sit);
  spline(out, riseKeys, [0, 0.4, 0.68, 0.98, RISE_TIME], t);
  return steps(
    out,
    stand,
    sit,
    t,
    [
      ['L', 0.04, 0.26],
      ['R', 0.2, 0.42],
    ],
    over,
    true,
  );
}

/**
 * Walking: `phase` in strides (one left and one right step per unit), `stride` the length
 * of one step (m). The feet stay put on the ground while he moves over them (knights.js
 * moves him `2 × stride` per unit of phase); 0 marks time in place (turning).
 */
export function walk(out, base, phase, stride = 0.28) {
  copy(out, base);
  const u = fr(phase);
  for (const [s, off] of /** @type {[string, number][]} */ ([
    ['L', 0],
    ['R', 0.5],
  ])) {
    const o = legOf(s);
    const v = fr(u + off);
    // Swing (0..0.5): lifted and brought forward; stance (0.5..1): planted, sliding back under him.
    const z = v < 0.5 ? -stride / 2 + stride * smooth(v / 0.5) : stride / 2 - stride * ((v - 0.5) / 0.5);
    const lift = v < 0.5 ? Math.sin((Math.PI * v) / 0.5) : 0;
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
export function turnPose(p, a, fL = 1, fR = 1, cx = p[0], cz = p[2]) {
  const rot = (x, z, ang) => {
    const c = Math.cos(ang),
      s = Math.sin(ang);
    return [cx + (x - cx) * c + (z - cz) * s, cz - (x - cx) * s + (z - cz) * c];
  };
  for (const [s, f] of /** @type {[string, number][]} */ ([
    ['L', fL],
    ['R', fR],
  ])) {
    const o = legOf(s),
      sg = s === 'L' ? 1 : -1;
    const rx = DEFAULT_REST['foot' + s][0];
    const [x, z] = rot(rx + sg * p[o], p[o + 2], a * f);
    p[o] = sg * (x - rx);
    p[o + 2] = z;
    p[o + 1] += STEP_LIFT * 0.8 * Math.sin(Math.PI * clamp01(f)) * Math.min(1, Math.abs(a) / 0.3);
  }
  p[POSE.hips + 1] += (a * (fL + fR)) / 2;
  return p;
}
