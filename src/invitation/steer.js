// Moves NEWT's root across the invitation toy's floor: walking to a goal (slowing to arrive),
// running away from the pointer or the play area's centre (choosing the open direction most
// away from it, so its edges push him off and a corner slides him along an edge, never stuck),
// and turning to face the camera, all with acceleration and a capped turn rate. Also picks his
// wander goals. The play area (Bounds) may widen toward the back, as the floor on screen does:
// xRange gives its sides at a depth. Pure: no three.js. NEWT faces +z at yaw 0 (forward is
// (sin yaw, cos yaw)) and the camera looks in from the +z side.

/** @typedef {import('./types.js').Body} Body */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').XZ} XZ */

/**
 * accel/decel: units/s²; turnRate: rad/s; arrive: a goto stops inside this radius; slowRadius:
 * he slows over this last stretch, to no less than minApproach of his speed. Flee: fleeDirs
 * directions tried, room counted up to fleeRoom ahead (weighted fleeRoomWeight), a direction
 * with less than fleeBlocked of room is out, fleeKeep favours the way he faces, and fleeMinPace
 * of his speed is kept while he turns. wanderMin: a wander goal is at least this far;
 * wanderMargin: and this far inside the bounds.
 */
export const STEER = {
  accel: 5,
  decel: 7,
  turnRate: 9,
  arrive: 0.06,
  slowRadius: 0.3,
  minApproach: 0.25,
  fleeDirs: 24,
  fleeRoom: 1.2,
  fleeRoomWeight: 1,
  fleeBlocked: 0.35,
  fleeKeep: 0.15,
  fleeMinPace: 0.3,
  wanderMin: 1,
  wanderMargin: 0.1,
};

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * An angle in [−π, π).
 * @param {number} a
 */
export function wrapAngle(a) {
  const r = (((a + Math.PI) % TAU) + TAU) % TAU;
  return r - Math.PI;
}

/**
 * `yaw` turned toward `target` by at most `maxStep`, the short way round.
 * @param {number} yaw
 * @param {number} target
 * @param {number} maxStep
 */
export function turnToward(yaw, target, maxStep) {
  return wrapAngle(yaw + clamp(wrapAngle(target - yaw), -maxStep, maxStep));
}

/**
 * The bounds' sides at depth `z`: minX/maxX at the front (maxZ), minXBack/maxXBack at the back
 * (minZ), straight lines between (a box without the back ones).
 * @param {Bounds} b
 * @param {number} z
 * @returns {[number, number]}
 */
export function xRange(b, z) {
  if (b.minXBack === undefined && b.maxXBack === undefined) return [b.minX, b.maxX];
  const span = b.maxZ - b.minZ;
  const k = span > 1e-9 ? clamp((b.maxZ - z) / span, 0, 1) : 0;
  return [b.minX + ((b.minXBack ?? b.minX) - b.minX) * k, b.maxX + ((b.maxXBack ?? b.maxX) - b.maxX) * k];
}

/**
 * A point kept inside the bounds: its depth clamped, then its x between the sides there.
 * @param {Bounds} b
 * @param {XZ} p
 * @returns {XZ}
 */
export function clampTo(b, p) {
  const z = clamp(p.z, b.minZ, b.maxZ);
  const [lo, hi] = xRange(b, z);
  return { x: clamp(p.x, lo, hi), z };
}

/**
 * The middle of the bounds.
 * @param {Bounds|null} b
 * @returns {XZ}
 */
export function centreOf(b) {
  return b ? { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 } : { x: 0, z: 0 };
}

/**
 * One frame of movement.
 * @param {Body} body
 * @param {{mode: 'stay'|'goto'|'flee'|'face', goal: XZ|null, speed: number}} move  BrainOut.move
 *   (goto: where to; face: the camera's spot, or null for +z; flee: where the threat was last
 *   seen, used when there's no pointer)
 * @param {XZ|null} pointer  the pointer on the floor (flee runs from it, else from move.goal,
 *   else from the room's centre)
 * @param {Bounds|null} bounds
 * @param {number} dt
 * @returns {Body}
 */
export function steer(body, move, pointer, bounds, dt) {
  let { x, z, yaw, speed } = body;
  let want = 0;
  let aim = yaw;
  let room = Infinity;
  const mode = move?.mode ?? 'stay';
  if (mode === 'goto' && move.goal) {
    const g = bounds ? clampTo(bounds, move.goal) : move.goal;
    const dx = g.x - x;
    const dz = g.z - z;
    const d = Math.hypot(dx, dz);
    if (d > STEER.arrive) {
      aim = Math.atan2(dx, dz);
      const err = Math.abs(wrapAngle(aim - yaw));
      want = move.speed * clamp(d / STEER.slowRadius, STEER.minApproach, 1) * Math.max(0, Math.cos(err));
      room = d;
    }
  } else if (mode === 'flee') {
    const dir = fleeDirection({ x, z }, yaw, pointer ?? move.goal ?? centreOf(bounds), bounds);
    aim = Math.atan2(dir.x, dir.z);
    const err = Math.abs(wrapAngle(aim - yaw));
    want = move.speed * (STEER.fleeMinPace + (1 - STEER.fleeMinPace) * Math.max(0, Math.cos(err)));
  } else if (mode === 'face') {
    aim = move.goal ? Math.atan2(move.goal.x - x, move.goal.z - z) : 0;
  }
  yaw = turnToward(yaw, aim, STEER.turnRate * dt);
  const rate = (want > speed ? STEER.accel : STEER.decel) * dt;
  speed = want > speed ? Math.min(want, speed + rate) : Math.max(want, speed - rate);
  const step = Math.min(speed * dt, room);
  let nx = x + Math.sin(yaw) * step;
  let nz = z + Math.cos(yaw) * step;
  if (bounds) {
    ({ x: nx, z: nz } = clampTo(bounds, { x: nx, z: nz }));
    // Pressed against an edge, he only goes as fast as he really moves.
    if (dt > 0 && step > 0) speed = Math.min(speed, Math.hypot(nx - x, nz - z) / dt);
  }
  return { x: nx, z: nz, yaw, speed };
}

/**
 * The way to run: of a ring of directions (and straight away), the one that best mixes "away
 * from the threat", "open room ahead" and "the way he already faces"; one with almost no room
 * is out, so he turns along a wall before he meets it.
 * @param {XZ} p
 * @param {number} yaw
 * @param {XZ} threat
 * @param {Bounds|null} bounds
 * @returns {XZ}
 */
function fleeDirection(p, yaw, threat, bounds) {
  let ax = p.x - threat.x;
  let az = p.z - threat.z;
  const n = Math.hypot(ax, az);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  if (n < 1e-6) {
    ax = fx;
    az = fz;
  } else {
    ax /= n;
    az /= n;
  }
  const score = (dx, dz) => {
    const room = bounds ? roomAlong(p, dx, dz, bounds) : STEER.fleeRoom;
    return (
      dx * ax +
      dz * az +
      (STEER.fleeRoomWeight * Math.min(room, STEER.fleeRoom)) / STEER.fleeRoom +
      STEER.fleeKeep * (dx * fx + dz * fz) -
      (room < STEER.fleeBlocked ? 3 : 0)
    );
  };
  let best = { x: ax, z: az };
  let top = score(ax, az);
  for (let i = 0; i < STEER.fleeDirs; i++) {
    const a = (i / STEER.fleeDirs) * TAU;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const s = score(dx, dz);
    if (s > top) {
      top = s;
      best = { x: dx, z: dz };
    }
  }
  return best;
}

/** How far he can go from `p` along (dx, dz) before leaving the bounds (slanted sides too). */
function roomAlong(p, dx, dz, b) {
  let t = Infinity;
  if (dz > 1e-9) t = Math.min(t, (b.maxZ - p.z) / dz);
  else if (dz < -1e-9) t = Math.min(t, (b.minZ - p.z) / dz);
  const span = b.maxZ - b.minZ;
  // Each side is the line x = front + slope·(z − maxZ); `gap` is how far inside it he is and
  // `rate` how fast that closes along the direction.
  for (const [front, back, sign] of [
    [b.maxX, b.maxXBack ?? b.maxX, 1],
    [b.minX, b.minXBack ?? b.minX, -1],
  ]) {
    const slope = span > 1e-9 ? (front - back) / span : 0;
    const gap = sign * (front + slope * (p.z - b.maxZ) - p.x);
    const rate = sign * (dx - slope * dz);
    if (rate > 1e-9) t = Math.min(t, gap / rate);
  }
  return Math.max(0, t);
}

/**
 * Somewhere to wander to: inside the bounds (a little in from them, between the sides at its
 * depth), at least STEER.wanderMin from `from` (in a play area too small for that, the farthest
 * of the tries).
 * @param {() => number} rng
 * @param {Bounds} bounds
 * @param {XZ} from
 * @returns {XZ}
 */
export function wanderGoal(rng, bounds, from) {
  const m = Math.min(STEER.wanderMargin, (bounds.maxX - bounds.minX) / 4, (bounds.maxZ - bounds.minZ) / 4);
  const z0 = bounds.minZ + m;
  const h = bounds.maxZ - m - z0;
  let best = centreOf(bounds);
  let far = -1;
  for (let i = 0; i < 32; i++) {
    const u = rng();
    const z = z0 + rng() * h;
    const [lo, hi] = xRange(bounds, z);
    const g = { x: lo + m + u * (hi - lo - 2 * m), z };
    const d = Math.hypot(g.x - from.x, g.z - from.z);
    if (d >= STEER.wanderMin) return g;
    if (d > far) {
      far = d;
      best = g;
    }
  }
  return best;
}
