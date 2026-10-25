// Moves NEWT's root across the invitation toy's floor: walking to a goal (slowing to arrive),
// running away from the pointer or the play area's centre (choosing the open direction most
// away from it, so its edges push him off and a corner slides him along an edge, never stuck;
// the way he runs, Body.run, settles toward that choice over a quarter of a second, faster with
// an edge close ahead, so his heading curves instead of zig-zagging between neighbours),
// and turning to face the camera, all with acceleration and a capped turn rate (slower when he
// isn't moving: on the spot his feet only glide round, so he pivots, never spins). Also picks his
// wander goals. The play area (Bounds) is a box, a box with rounded corners (Bounds.round), a box
// that widens toward the back, or a disc (Bounds.r, around its box's centre: the toy's, area.js);
// any of them turned about its middle (Bounds.turn: what's on screen, in the camera's frame;
// turnBounds): xRange gives its sides at a depth (in its own frame), clampTo pulls a point inside
// (to its nearest point on a rounded box's rim, a disc's straight in toward its centre) and
// centreOf is its middle. Where the play area is bigger than the screen it carries what's on
// screen now (Bounds.sight, camera.js orbitSight): wander goals keep inside both, and a flee
// keeps to what was on screen as it began (Body.fence). A play area shrunk under him (a resize):
// the brain walks him back in (backInGoal: just inside it, on screen), a walk that's never slid;
// standing, sitting or turning he's eased back in, STEER.backIn, never in one jump. Pure: no three.js. NEWT faces +z at yaw 0
// (forward is (sin yaw, cos yaw)) and the camera looks in from the +z side.

/** @typedef {import('./types.js').Body} Body */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').XZ} XZ */

/**
 * accel/decel: units/s²; turnRate: rad/s on the move, from turnStill standing (his feet glide
 * while he turns on the spot: slowly, they read as a pivot, not a turntable) up to it at
 * turnFullAt units/s; arrive: a goto stops inside this radius; slowRadius:
 * he slows over this last stretch, to no less than minApproach of his speed. Flee: fleeDirs
 * directions tried, room counted up to fleeRoom ahead (weighted fleeRoomWeight), a direction
 * with less than fleeBlocked of room is out, fleeKeep favours the way he runs, the way he runs
 * settles toward the best direction with a time constant of fleeSmooth s (fleeSmoothNear with
 * less than fleeNear of room ahead, so he still turns off an edge in time), and fleeMinPace of
 * his speed is kept while he turns. wanderMin: a wander goal is at least this far;
 * wanderMargin: and this far inside the bounds. backIn: outside the bounds (shrunk under him by a
 * resize) and not walking he's eased back in with this time constant, s, at least backInMin and
 * at most backInMax units/s; backInPast: further out than this, the brain walks him back in, to
 * backInDepth inside them.
 */
export const STEER = {
  accel: 5,
  decel: 7,
  turnRate: 9,
  turnStill: 3.5,
  turnFullAt: 0.35,
  arrive: 0.06,
  slowRadius: 0.3,
  minApproach: 0.25,
  fleeDirs: 24,
  fleeRoom: 1.2,
  fleeRoomWeight: 1,
  fleeBlocked: 0.35,
  fleeKeep: 0.15,
  fleeSmooth: 0.25,
  fleeSmoothNear: 0.08,
  fleeNear: 0.6,
  fleeMinPace: 0.3,
  wanderMin: 1,
  wanderMargin: 0.1,
  backIn: 0.3,
  backInMin: 0.15,
  backInMax: 2,
  backInPast: 0.02,
  backInDepth: 0.25,
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
 * (minZ), straight lines between (a box without the back ones); a disc's rim at that depth
 * (its middle alone past the rim). Turned bounds' in their own frame (inFrame takes a point there
 * back out).
 * @param {Bounds} b
 * @param {number} z
 * @returns {[number, number]}
 */
export function xRange(b, z) {
  const r = rounded(b);
  if (r > 0) {
    // (A rounded box: its flat sides, narrowing round the corners' arcs; the middle alone past it.)
    const dz = Math.max(0, b.minZ + r - z, z - (b.maxZ - r));
    if (dz > r) {
      const mid = (b.minX + b.maxX) / 2;
      return [mid, mid];
    }
    const out = Math.sqrt(r * r - dz * dz);
    return [b.minX + r - out, b.maxX - r + out];
  }
  if (b.r !== undefined) {
    const { x: cx, z: cz } = centreOf(b);
    const u = b.r > 0 ? clamp((z - cz) / b.r, -1, 1) : 1;
    const half = b.r * Math.sqrt(1 - u * u);
    return [cx - half, cx + half];
  }
  if (b.minXBack === undefined && b.maxXBack === undefined) return [b.minX, b.maxX];
  const span = b.maxZ - b.minZ;
  const k = span > 1e-9 ? clamp((b.maxZ - z) / span, 0, 1) : 0;
  return [b.minX + ((b.minXBack ?? b.minX) - b.minX) * k, b.maxX + ((b.maxXBack ?? b.maxX) - b.maxX) * k];
}

/**
 * A point kept inside the bounds: its depth clamped, then its x between the sides there; for a
 * disc, pulled straight in toward its centre onto the rim; turned bounds' in their own frame.
 * @param {Bounds} b
 * @param {XZ} p
 * @returns {XZ}
 */
export function clampTo(b, p) {
  if (b.turn) return inFrame(b, clampTo(flatOf(b), inFrame(b, p)), true);
  const r = rounded(b);
  if (r > 0) {
    // (A rounded box is its inner box grown by r all round: inside within r of it, else onto
    // the rim, r out from the inner box's nearest point.)
    const ix = clamp(p.x, b.minX + r, b.maxX - r);
    const iz = clamp(p.z, b.minZ + r, b.maxZ - r);
    const d = Math.hypot(p.x - ix, p.z - iz);
    if (d <= r) return { x: p.x, z: p.z };
    return { x: ix + ((p.x - ix) * r) / d, z: iz + ((p.z - iz) * r) / d };
  }
  if (b.r !== undefined) {
    const c = centreOf(b);
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d <= b.r) return { x: p.x, z: p.z };
    const k = d > 0 ? b.r / d : 0;
    return { x: c.x + (p.x - c.x) * k, z: c.z + (p.z - c.z) * k };
  }
  const z = clamp(p.z, b.minZ, b.maxZ);
  const [lo, hi] = xRange(b, z);
  return { x: clamp(p.x, lo, hi), z };
}

/**
 * A point in turned bounds' own frame (Bounds.turn: the shape turned that far about its box's
 * middle, + toward +x, as NEWT's yaw and the camera's), or, `back`, a point there back out in the
 * world; as it is for bounds that aren't turned.
 * @param {Bounds} b
 * @param {XZ} p
 * @param {boolean} [back]
 * @returns {XZ}
 */
export function inFrame(b, p, back = false) {
  const a = b.turn ?? 0;
  if (!a) return { x: p.x, z: p.z };
  const c = centreOf(b);
  return turnedBy({ x: p.x - c.x, z: p.z - c.z }, back ? a : -a, c);
}

/**
 * `v` turned `a` radians (+ toward +x: +z goes to (sin a, cos a)), plus `at`.
 * @param {XZ} v
 * @param {number} a
 * @param {XZ} [at]
 */
function turnedBy(v, a, at = { x: 0, z: 0 }) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: at.x + v.x * c + v.z * s, z: at.z - v.x * s + v.z * c };
}

/** Turned bounds as they are in their own frame (no turn). */
function flatOf(b) {
  const flat = { ...b };
  delete flat.turn;
  return flat;
}

/**
 * Bounds `b`, given in a frame turned `yaw` about `about` (camera.js orbitSight: what's on screen,
 * worked out at yaw 0 round the point the camera looks at), as turned Bounds: the same shape,
 * its box moved so that turning it about its own middle puts it there.
 * @param {Bounds} b
 * @param {number} yaw
 * @param {XZ} about
 * @returns {Bounds}
 */
export function turnBounds(b, yaw, about) {
  const m = centreOf(b);
  const v = { x: about.x - m.x, z: about.z - m.z };
  const w = turnedBy(v, yaw);
  const dx = v.x - w.x;
  const dz = v.z - w.z;
  /** @type {Bounds} */
  const out = { ...b, minX: b.minX + dx, maxX: b.maxX + dx, minZ: b.minZ + dz, maxZ: b.maxZ + dz, turn: yaw };
  if (b.minXBack !== undefined) out.minXBack = b.minXBack + dx;
  if (b.maxXBack !== undefined) out.maxXBack = b.maxXBack + dx;
  return out;
}

/**
 * A rounded box's corner radius (0 for any other bounds), no more than half its narrower side.
 * @param {Bounds} b
 */
export function rounded(b) {
  if (b.r !== undefined || !(Number(b.round) > 0)) return 0;
  return Math.min(Number(b.round), (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2);
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
 * Where he walks back in to from `p` once the bounds have shrunk under him (a resize) and he's
 * more than STEER.backInPast outside them: their nearest point, STEER.backInDepth further in
 * toward their middle, and on what's on screen (Bounds.sight) where they carry it; null while
 * he's inside them.
 * @param {Bounds} b
 * @param {XZ} p
 * @returns {XZ|null}
 */
export function backInGoal(b, p) {
  const c = clampTo(b, p);
  if (Math.hypot(c.x - p.x, c.z - p.z) <= STEER.backInPast) return null;
  const m = centreOf(b);
  const d = Math.hypot(m.x - c.x, m.z - c.z);
  const k = d > 1e-9 ? Math.min(1, STEER.backInDepth / d) : 0;
  const g = { x: c.x + (m.x - c.x) * k, z: c.z + (m.z - c.z) * k };
  return b.sight ? clampTo(b, clampTo(b.sight, g)) : g;
}

/**
 * One frame of movement.
 * @param {Body} body
 * @param {{mode: 'stay'|'goto'|'flee'|'face', goal: XZ|null, speed: number}} move  BrainOut.move
 *   (goto: where to; face: the camera's spot, or null for +z; flee: where the threat was last
 *   seen, used when there's no pointer)
 * @param {XZ|null} pointer  the pointer on the floor (flee runs from it, else from move.goal,
 *   else from the play area's centre)
 * @param {Bounds|null} bounds  the play area; its `sight`, what's on screen now, fences a flee
 *   that begins this frame (Body.fence, kept until it ends)
 * @param {number} dt
 * @returns {Body}
 */
export function steer(body, move, pointer, bounds, dt) {
  let { x, z, yaw, speed } = body;
  let want = 0;
  let aim = yaw;
  let room = Infinity;
  /** @type {XZ|undefined} the way he runs, fleeing */
  let run;
  /** @type {Bounds|null} what was on screen as the flee began: he keeps inside it too */
  let fence = null;
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
    ({ run, aim, want, fence } = fleeing(body, move, pointer, bounds, dt));
  } else if (mode === 'face') {
    aim = move.goal ? Math.atan2(move.goal.x - x, move.goal.z - z) : 0;
  }
  const turn = STEER.turnStill + (STEER.turnRate - STEER.turnStill) * clamp(speed / STEER.turnFullAt, 0, 1);
  yaw = turnToward(yaw, aim, turn * dt);
  const rate = (want > speed ? STEER.accel : STEER.decel) * dt;
  speed = want > speed ? Math.min(want, speed + rate) : Math.max(want, speed - rate);
  const step = Math.min(speed * dt, room);
  let nx = x + Math.sin(yaw) * step;
  let nz = z + Math.cos(yaw) * step;
  if (fence) ({ x: nx, z: nz } = clampTo(fence, { x: nx, z: nz }));
  if (bounds) {
    ({ x: nx, z: nz } = backInside(bounds, { x, z }, { x: nx, z: nz }, dt, mode === 'goto'));
    // Pressed against an edge, he only goes as fast as he really moves.
    if (dt > 0 && step > 0) speed = Math.min(speed, Math.hypot(nx - x, nz - z) / dt);
  }
  /** @type {Body} */
  const out = { x: nx, z: nz, yaw, speed };
  if (run) out.run = run;
  if (fence) out.fence = fence;
  return out;
}

/**
 * A frame of a flee: the way he runs (Body.run, settling toward the best way), where he aims,
 * how fast he wants to go, and the flee's fence (what was on screen as it began).
 * @param {Body} body
 * @param {{goal: XZ|null, speed: number}} move
 * @param {XZ|null} pointer
 * @param {Bounds|null} bounds
 * @param {number} dt
 * @returns {{run: XZ, aim: number, want: number, fence: Bounds|null}}
 */
function fleeing(body, move, pointer, bounds, dt) {
  const { x, z, yaw } = body;
  const keep = body.run ?? { x: Math.sin(yaw), z: Math.cos(yaw) };
  const fence = body.run ? (body.fence ?? null) : fenceFor(bounds, { x, z });
  /** @type {Bounds[]} */
  const walls = [];
  if (bounds) walls.push(bounds);
  if (fence) walls.push(fence);
  const best = fleeDirection({ x, z }, keep, pointer ?? move.goal ?? centreOf(bounds), walls);
  // (The way he runs settles toward the best one over fleeSmooth s: picked afresh each frame
  // from a ring of directions, it flicked between neighbours several times a second.)
  const near = walls.length && body.run ? roomIn(walls, { x, z }, keep.x, keep.z) < STEER.fleeNear : false;
  const k = body.run ? 1 - Math.exp(-dt / (near ? STEER.fleeSmoothNear : STEER.fleeSmooth)) : 1;
  const rx = keep.x + (best.x - keep.x) * k;
  const rz = keep.z + (best.z - keep.z) * k;
  const len = Math.hypot(rx, rz);
  const run = len > 1e-6 ? { x: rx / len, z: rz / len } : best;
  const aim = Math.atan2(run.x, run.z);
  const err = Math.abs(wrapAngle(aim - yaw));
  const want = move.speed * (STEER.fleeMinPace + (1 - STEER.fleeMinPace) * Math.max(0, Math.cos(err)));
  return { run, aim, want, fence };
}

/**
 * What's on screen as a flee begins (the play area's `sight`), its fence, if he's inside it
 * then; else none.
 * @param {Bounds|null} bounds
 * @param {XZ} p
 * @returns {Bounds|null}
 */
function fenceFor(bounds, p) {
  const s = bounds?.sight;
  if (!s) return null;
  const c = clampTo(s, p);
  return Math.hypot(c.x - p.x, c.z - p.z) < 1e-6 ? s : null;
}

/**
 * `to`, a step on from `from`, kept inside `b`: onto its edge; or, where `from` was already
 * outside (the bounds shrunk under him: a resize), no further out than it was less this frame's
 * easing back in (STEER.backIn), so he comes back in over a moment rather than in a jump;
 * `walking` (back in), no further out than it was, his walk alone bringing him in, never slid.
 * @param {Bounds} b
 * @param {XZ} from
 * @param {XZ} to
 * @param {number} dt
 * @param {boolean} [walking]
 * @returns {XZ}
 */
function backInside(b, from, to, dt, walking = false) {
  const c = clampTo(b, to);
  const over = Math.hypot(to.x - c.x, to.z - c.z);
  if (over < 1e-12) return to;
  const f = clampTo(b, from);
  const was = Math.hypot(from.x - f.x, from.z - f.z);
  if (was < 1e-9 || !(dt > 0)) return c;
  const back = walking
    ? 0
    : clamp(was * (1 - Math.exp(-dt / STEER.backIn)), STEER.backInMin * dt, STEER.backInMax * dt);
  const allow = Math.max(0, was - back);
  if (over <= allow) return to;
  const k = allow / over;
  return { x: c.x + (to.x - c.x) * k, z: c.z + (to.z - c.z) * k };
}

/**
 * How far he can go from `p` along (dx, dz) before leaving any of `walls`.
 * @param {Bounds[]} walls
 * @param {XZ} p
 * @param {number} dx
 * @param {number} dz
 */
function roomIn(walls, p, dx, dz) {
  let t = Infinity;
  for (const b of walls) t = Math.min(t, roomAlong(p, dx, dz, b));
  return t;
}

/**
 * The way to run: of a ring of directions (and straight away), the one that best mixes "away
 * from the threat", "open room ahead" and "the way he already runs" (`keep`, a unit
 * direction); one with almost no room is out, so he turns along a wall before he meets it.
 * @param {XZ} p
 * @param {XZ} keep
 * @param {XZ} threat
 * @param {Bounds[]} walls  the play area, and the flee's fence (none: room everywhere)
 * @returns {XZ}
 */
function fleeDirection(p, keep, threat, walls) {
  let ax = p.x - threat.x;
  let az = p.z - threat.z;
  const n = Math.hypot(ax, az);
  const fx = keep.x;
  const fz = keep.z;
  if (n < 1e-6) {
    ax = fx;
    az = fz;
  } else {
    ax /= n;
    az /= n;
  }
  const score = (dx, dz) => {
    const room = walls.length ? roomIn(walls, p, dx, dz) : STEER.fleeRoom;
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

/** How far he can go from `p` along (dx, dz), a unit direction, before leaving the bounds (slanted sides, a rounded box's corners, a disc's rim and turned bounds too). */
function roomAlong(p, dx, dz, b) {
  if (b.turn) {
    const q = inFrame(b, p);
    const d = turnedBy({ x: dx, z: dz }, -b.turn);
    return roomAlong(q, d.x, d.z, flatOf(b));
  }
  const rr = rounded(b);
  if (rr > 0) {
    // (Out of the box first; where that's past a corner's arc, out of the arc instead.)
    let t = Infinity;
    if (dz > 1e-9) t = Math.min(t, (b.maxZ - p.z) / dz);
    else if (dz < -1e-9) t = Math.min(t, (b.minZ - p.z) / dz);
    if (dx > 1e-9) t = Math.min(t, (b.maxX - p.x) / dx);
    else if (dx < -1e-9) t = Math.min(t, (b.minX - p.x) / dx);
    t = Math.max(0, t);
    const qx = p.x + dx * t;
    const qz = p.z + dz * t;
    const cx = clamp(qx, b.minX + rr, b.maxX - rr);
    const cz = clamp(qz, b.minZ + rr, b.maxZ - rr);
    if (Math.hypot(qx - cx, qz - cz) <= rr + 1e-9) return t;
    const ox = p.x - cx;
    const oz = p.z - cz;
    const along = ox * dx + oz * dz;
    const disc = along * along - (ox * ox + oz * oz - rr * rr);
    return disc > 0 ? Math.max(0, -along + Math.sqrt(disc)) : 0;
  }
  if (b.r !== undefined) {
    const c = centreOf(b);
    const ox = p.x - c.x;
    const oz = p.z - c.z;
    const along = ox * dx + oz * dz;
    const inside = b.r * b.r - (ox * ox + oz * oz);
    return Math.max(0, -along + Math.sqrt(Math.max(0, along * along + inside)));
  }
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
 * of the tries). Where the bounds carry what's on screen (`sight`), inside that too, so he
 * wanders where he's seen; the bounds alone if none of the tries there is in them.
 * @param {() => number} rng
 * @param {Bounds} bounds
 * @param {XZ} from
 * @returns {XZ}
 */
export function wanderGoal(rng, bounds, from) {
  if (bounds.sight) {
    const inside = (/** @type {XZ} */ p) => {
      const c = clampTo(bounds, p);
      return Math.hypot(c.x - p.x, c.z - p.z) < 1e-9;
    };
    const g = pickIn(rng, bounds.sight, from, inside);
    if (g) return g;
  }
  return pickIn(rng, bounds, from, null) ?? centreOf(bounds);
}

/**
 * Of 32 tries inside `b` (a little in from it, between its sides at a depth, turned with it),
 * the first at least STEER.wanderMin from `from`, else the farthest (the middle if none is):
 * only tries `ok` takes count, and with `ok`, null where none does.
 * @param {() => number} rng
 * @param {Bounds} b
 * @param {XZ} from
 * @param {((p: XZ) => boolean)|null} ok
 * @returns {XZ|null}
 */
function pickIn(rng, b, from, ok) {
  const m = Math.min(STEER.wanderMargin, (b.maxX - b.minX) / 4, (b.maxZ - b.minZ) / 4);
  const z0 = b.minZ + m;
  const h = b.maxZ - m - z0;
  let best = ok ? null : centreOf(b);
  let far = -1;
  for (let i = 0; i < 32; i++) {
    const u = rng();
    const z = z0 + rng() * h;
    const [lo, hi] = xRange(b, z);
    const g = inFrame(b, { x: lo + m + u * (hi - lo - 2 * m), z }, true);
    if (ok && !ok(g)) continue;
    const d = Math.hypot(g.x - from.x, g.z - from.z);
    if (d >= STEER.wanderMin) return g;
    if (d > far) {
      far = d;
      best = g;
    }
  }
  return best;
}
