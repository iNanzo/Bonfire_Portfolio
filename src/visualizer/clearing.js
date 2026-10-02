// The clearing round the fire, where a camera may stand (no three.js: plain {x, y, z}),
// and a preset scene's camera move.
//
// keepInClearing clamps a camera position: above the ground, out of the fire (not low and
// close to it), no further than the ruins' edge, and in front of them (a bearing of at
// most CLEARING.bearing either side of straight in front of the fire).
//
// movePose plays a scene's framing (a CameraPin: where it stands, what it looks at, the
// lens, the tilt, and a move) over time. Each move is periodic and a whole number of bars
// long, a ping-pong that starts and ends on the painted framing, so it never drifts:
//   still    the painted framing.
//   sway     swings round what it looks at, a little either side, and back.
//   sweep    a long glide round it, wide either side, and back.
//   push     pushes in toward what it looks at and pulls back out.
//   crane    rises and sinks back, still looking at the same spot.
//   vertigo  a dolly zoom: pushes in while the lens widens to match (the fire keeps its
//            size, the world stretches behind it), and back out.
// A move is shrunk until its whole cycle stays in the clearing; a sway or sweep painted
// near the clearing's edge swings the other way only (one-sided, with the same arc) when
// that leaves it more room.

/** The clearing (meters, radians): the fire, the bearing limit, the radius and height limits. */
export const CLEARING = {
  fire: [0.02, 0, 0.02],
  bearing: 1.75,
  maxR: 6.5,
  minR: 0.9,
  lowY: 1.7,
  minY: 0.25,
  maxY: 6.5,
};
/** The camera moves a scene can have (their labels: scenes.js CAMERA_MOVES). */
export const MOVE_KINDS = ['still', 'sway', 'sweep', 'push', 'crane', 'vertigo'];
/** How many bars a move's cycle may take. */
export const MOVE_BARS = [2, 4, 8, 16, 32];
// Each move at full amount: radians of swing (sway, sweep), a fraction of the distance
// (push, vertigo), meters (crane).
const REACH = { sway: 0.35, sweep: 1.2, push: 0.35, crane: 1.8, vertigo: 0.5 };
const MAX_FOV = 80;
const MIN_FOV = 10;

/**
 * Keep a camera position in the clearing (in place; returns it).
 * @template {{ x: number, y: number, z: number }} T
 * @param {T} p
 * @returns {T}
 */
export function keepInClearing(p) {
  const [fx, , fz] = CLEARING.fire;
  const dx = p.x - fx;
  const dz = p.z - fz;
  let r = Math.hypot(dx, dz);
  let a = Math.atan2(dx, dz); // 0: straight in front
  if (Math.abs(a) > CLEARING.bearing) a = Math.sign(a) * CLEARING.bearing;
  r = Math.min(CLEARING.maxR, p.y < CLEARING.lowY ? Math.max(CLEARING.minR, r) : r);
  p.x = fx + Math.sin(a) * r;
  p.z = fz + Math.cos(a) * r;
  p.y = Math.min(CLEARING.maxY, Math.max(CLEARING.minY, p.y));
  return p;
}

/**
 * A scene's framing: where the camera stands and looks, the lens (degrees), the tilt
 * (radians) and a periodic move (`amount` 0..1, over `bars` bars).
 * @typedef {{ pos: number[], target: number[], fov: number, roll: number,
 *   move?: { kind: string, amount: number, bars: number } }} CameraPin
 */
/** @typedef {{ pos: number[], target: number[], fov: number, roll: number }} CameraPose */

/** @param {number[]} p */
const inClearing = ([x, y, z]) => {
  const p = keepInClearing({ x, y, z });
  return Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6 && Math.abs(p.z - z) < 1e-6;
};
const clampFov = (f) => Math.min(MAX_FOV, Math.max(MIN_FOV, f));
// Ping-pong curves over a cycle u (0..1): out and back either side, or one side.
const swing = (u) => Math.sin(2 * Math.PI * u);
const outBack = (u) => (1 - Math.cos(2 * Math.PI * u)) / 2;

/**
 * The pose at cycle point `u` (0..1) of a move `kind`, `reach` as big (REACH units),
 * `side`: 0 either side, ±1 one side only.
 * @returns {CameraPose}
 */
function poseAt(base, kind, reach, side, u) {
  const [px, py, pz] = base.pos;
  const [tx, ty, tz] = base.target;
  let dx = px - tx;
  let dy = py - ty;
  let dz = pz - tz;
  let fov = base.fov;
  if (kind === 'sway' || kind === 'sweep') {
    const yaw = side ? side * 2 * reach * outBack(u) : reach * swing(u);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
  } else if (kind === 'push' || kind === 'vertigo') {
    const k = 1 - reach * outBack(u);
    dx *= k;
    dy *= k;
    dz *= k;
    if (kind === 'vertigo') fov = (2 * Math.atan(Math.tan((base.fov * Math.PI) / 360) / k) * 180) / Math.PI;
  } else if (kind === 'crane') dy += reach * outBack(u);
  return { pos: [tx + dx, ty + dy, tz + dz], target: [tx, ty, tz], fov, roll: base.roll };
}
/** Whether a whole cycle stays in the clearing (and the lens in range). */
function fits(base, kind, reach, side) {
  for (let i = 0; i <= 64; i++) {
    const p = poseAt(base, kind, reach, side, i / 64);
    if (!inClearing(p.pos) || p.fov > MAX_FOV + 1e-6) return false;
  }
  return true;
}
/** The biggest share (0..1) of `reach` whose whole cycle fits. */
function fitShare(base, kind, reach, side) {
  if (fits(base, kind, reach, side)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (fits(base, kind, reach * mid, side)) lo = mid;
    else hi = mid;
  }
  return lo;
}

let memoKey = '';
let memo = null;
/**
 * A pin's move as it will play: the painted framing kept in the clearing, and the move's
 * reach and side fitted so its whole cycle stays there too.
 * @param {CameraPin} pin
 */
export function fitMove(pin) {
  const key = JSON.stringify([pin.pos, pin.target, pin.fov, pin.roll, pin.move]);
  if (key === memoKey) return memo;
  const [x, y, z] = pin.pos;
  const p = keepInClearing({ x, y, z });
  const base = { pos: [p.x, p.y, p.z], target: [...pin.target], fov: clampFov(pin.fov), roll: pin.roll ?? 0 };
  const kind = MOVE_KINDS.includes(pin.move?.kind) ? pin.move.kind : 'still';
  const amount = Math.min(1, Math.max(0, pin.move?.amount ?? 0));
  const bars = MOVE_BARS.includes(pin.move?.bars) ? pin.move.bars : 8;
  let reach = kind === 'still' ? 0 : REACH[kind] * amount;
  let side = 0;
  if (reach > 0) {
    const both = fitShare(base, kind, reach, 0);
    if (both < 0.999 && (kind === 'sway' || kind === 'sweep')) {
      // Near the edge: one side only, if that leaves more of the arc.
      const plus = fitShare(base, kind, reach, 1);
      const minus = fitShare(base, kind, reach, -1);
      const best = Math.max(both, plus, minus);
      side = best === both ? 0 : best === plus ? 1 : -1;
      reach *= best;
    } else reach *= both;
  }
  memoKey = key;
  memo = { base, kind: reach > 1e-4 ? kind : 'still', reach, side, bars };
  return memo;
}

/**
 * A scene's framing at `t` seconds into its move, `beat` seconds a beat: periodic over the
 * move's bars, back on the painted framing at each cycle's start, always in the clearing.
 * @param {CameraPin} pin
 * @param {number} t
 * @param {number} beat
 * @returns {CameraPose}
 */
export function movePose(pin, t, beat) {
  return poseOnCycle(pin, t / (fitMove(pin).bars * 4 * Math.max(0.2, beat || 0.5)));
}
/**
 * The same at a point `u` of the move's cycle (whole numbers: the painted framing), for a
 * camera that keeps its own place in the cycle through tempo changes.
 * @param {CameraPin} pin
 * @param {number} u
 * @returns {CameraPose}
 */
export function poseOnCycle(pin, u) {
  const m = fitMove(pin);
  if (m.kind === 'still')
    return { pos: [...m.base.pos], target: [...m.base.target], fov: m.base.fov, roll: m.base.roll };
  return poseAt(m.base, m.kind, m.reach, m.side, ((u % 1) + 1) % 1);
}
