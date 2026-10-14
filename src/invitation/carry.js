// Carrying NEWT by the collar in the invitation toy. He's dragged on a vertical plane facing the
// camera through where he was grabbed (dragPlane, gripFor: his collar's offset from the point
// grabbed is kept, so that point stays under the cursor; dragTarget: up the screen lifts him, up
// to CARRY.liftMax, across moves him across, never lower than he was grabbed, and once he's been
// lifted clear of the floor never with his soles back on it: a still cursor never lifts him off
// it). The anchor his collar hangs from is the
// pointer's spot each frame, no lag, kept inside the play area; a damped pendulum swings his root
// as the hold speeds up and slows down (driven by a critically damped follow of the anchor, so
// it reads the same whether the pointer's spot changes every frame or only every second or third
// one, as a 60 Hz finger on a 120 Hz screen does; procedural motion never touches his bones);
// the toss velocity from the last ~80 ms when he's let go (none across while the pointer pushes
// him out against the edge: the edge is invisible, so he drops right there instead of skidding
// along it or flying back off it), and the fall that follows, with gravity and soft bounces off
// the play area's edges (a disc's rim, or a box's sides) for a fall that reaches one, until his
// lowest foot meets the floor. Pure: no three.js.

import { rayPlane } from './gesture.js';
import { centreOf, clampTo, xRange } from './steer.js';

/** @typedef {import('./types.js').XYZ} XYZ */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').CarryState} CarryState */

/**
 * follow: how fast the swing's drive follows the anchor (rad/s: a critically damped follow; it
 * smooths out a spot that only moves on some frames, which read as a hard shake frame by frame);
 * window: seconds of samples a toss reads. liftIn: seconds a finger's lift over itself (main.js)
 * takes to come in once he's grabbed; liftMax: the highest his collar is carried, world units. The swing: a pendulum `length` long (collar to his middle) under
 * `gravity`, `damping` per second, at most `tiltMax` radians, fed accelerations up to
 * `accelMax`, integrated in steps of at most `substep`; `shakeSmooth` smooths the shake reading.
 * A toss is capped at `tossMax` across and `tossUp`/`tossDown` up and down. The fall: `fallGravity`,
 * `restitution` off the edges, the floor at `floorY`, the tilt relaxing at `tiltRelax` per second.
 */
export const CARRY = {
  follow: 25,
  window: 0.08,
  liftIn: 0.15,
  liftMax: 5,
  length: 0.55,
  gravity: 9.8,
  damping: 2.4,
  tiltMax: 0.8,
  accelMax: 40,
  substep: 1 / 120,
  shakeSmooth: 0.08,
  tossMax: 3.5,
  tossUp: 2.5,
  tossDown: -3,
  fallGravity: 12,
  restitution: 0.3,
  rimEase: 1.5,
  floorY: 0,
  tiltRelax: 6,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The exact critically damped step of `x` (velocity `v`) toward a still `goal` over `dt` at
 * CARRY.follow.
 * @returns {[number, number]}
 */
function follow(x, v, goal, dt) {
  const w = CARRY.follow;
  const e = x - goal;
  const k = Math.exp(-w * dt);
  const j = (v + w * e) * dt;
  return [goal + (e + j) * k, (v - w * j) * k];
}

/**
 * Picks him up by the collar.
 * @param {XYZ} collar  the collar's world position (the Neck bone's head)
 * @param {number} t
 * @returns {CarryState}
 */
export function grab(collar, t) {
  const p = { x: collar.x, y: collar.y, z: collar.z };
  return {
    t0: t,
    t,
    anchor: { ...p },
    drive: { ...p },
    vel: { x: 0, y: 0, z: 0 },
    tilt: { x: 0, z: 0 },
    tiltVel: { x: 0, z: 0 },
    samples: [{ t, ...p }],
    dragSpeed: 0,
    shake: 0,
    push: null,
  };
}

/**
 * One frame held: the anchor is `target` (dragTarget's spot), kept inside the bounds, and the
 * swing answers the acceleration of its drive (a critically damped follow of the anchor).
 * Updates `c` in place and returns it.
 * @param {CarryState} c
 * @param {XYZ} target
 * @param {number} dt
 * @param {Bounds|null} bounds
 * @param {number} t
 * @returns {CarryState}
 */
export function holdStep(c, target, dt, bounds, t) {
  const { x: gx, z: gz } = bounds ? clampTo(bounds, target) : target;
  // (The pointer's spot out past the edge: the way it pushes him, out through it.)
  const px = target.x - gx;
  const pz = target.z - gz;
  const pushed = Math.hypot(px, pz);
  c.push = pushed > 1e-9 ? { x: px / pushed, z: pz / pushed } : null;
  const anchor = { x: gx, y: target.y, z: gz };
  if (dt > 0) {
    const [x, vx] = follow(c.drive.x, c.vel.x, anchor.x, dt);
    const [y, vy] = follow(c.drive.y, c.vel.y, anchor.y, dt);
    const [z, vz] = follow(c.drive.z, c.vel.z, anchor.z, dt);
    const vel = { x: vx, y: vy, z: vz };
    let ax = (vel.x - c.vel.x) / dt;
    let ay = (vel.y - c.vel.y) / dt;
    let az = (vel.z - c.vel.z) / dt;
    const a = Math.hypot(ax, ay, az);
    if (a > CARRY.accelMax) {
      const s = CARRY.accelMax / a;
      ax *= s;
      ay *= s;
      az *= s;
    }
    swing(c, ax, ay, az, dt);
    c.vel = vel;
    c.dragSpeed = Math.hypot(vel.x, vel.y, vel.z);
    c.shake += (Math.min(a, CARRY.accelMax) - c.shake) * Math.min(1, dt / CARRY.shakeSmooth);
    c.drive = { x, y, z };
  }
  c.anchor = anchor;
  c.t = t;
  c.samples.push({ t, ...c.anchor });
  while (c.samples.length > 2 && t - c.samples[0].t > CARRY.window + 1e-9) c.samples.shift();
  return c;
}

/**
 * The pendulum: his feet trail the anchor's acceleration and swing back under gravity.
 * tilt.z is root.rotation.z (positive puts his feet toward +x); tilt.x is root.rotation.x
 * (positive puts them toward −z).
 */
function swing(c, ax, ay, az, dt) {
  const n = Math.max(1, Math.ceil(dt / CARRY.substep));
  const h = dt / n;
  const g = Math.max(0, CARRY.gravity + ay) / CARRY.length;
  const L = CARRY.length;
  const { tilt, tiltVel } = c;
  for (let i = 0; i < n; i++) {
    tiltVel.z += (-g * Math.sin(tilt.z) - (ax / L) * Math.cos(tilt.z) - CARRY.damping * tiltVel.z) * h;
    tiltVel.x += (-g * Math.sin(tilt.x) + (az / L) * Math.cos(tilt.x) - CARRY.damping * tiltVel.x) * h;
    tilt.z += tiltVel.z * h;
    tilt.x += tiltVel.x * h;
    for (const k of /** @type {const} */ (['x', 'z'])) {
      if (Math.abs(tilt[k]) > CARRY.tiltMax) {
        tilt[k] = Math.sign(tilt[k]) * CARRY.tiltMax;
        tiltVel[k] = 0;
      }
    }
  }
}

/**
 * The plane he's dragged on: upright, through `through` (where he's grabbed: his collar), facing
 * the camera across the floor (its normal the level way from there to the camera; +z with the
 * camera straight overhead).
 * @param {XYZ} camera  the camera's position
 * @param {XYZ} through
 * @returns {{point: XYZ, normal: XYZ}}
 */
export function dragPlane(camera, through) {
  const dx = camera.x - through.x;
  const dz = camera.z - through.z;
  const d = Math.hypot(dx, dz);
  return {
    point: { x: through.x, y: through.y, z: through.z },
    normal: d > 1e-9 ? { x: dx / d, y: 0, z: dz / d } : { x: 0, y: 0, z: 1 },
  };
}

/**
 * @typedef {object} Grip  how he's held: the plane he's dragged on, his collar's offset from the
 *   point grabbed (kept, so that point stays under the cursor), when, his collar's height then,
 *   whether he's been lifted clear of the floor since (to his hang height), and the last spot
 *   (for a ray that misses the plane)
 * @property {{point: XYZ, normal: XYZ}} plane
 * @property {XYZ} offset
 * @property {number} t0
 * @property {number} from
 * @property {boolean} clear
 * @property {XYZ} last
 */

/**
 * He's grabbed where `ray` (the cursor's: origin and direction) meets `plane`, his collar at
 * `collar`, at `t`.
 * @param {{o: XYZ, d: XYZ}} ray
 * @param {{point: XYZ, normal: XYZ}} plane
 * @param {XYZ} collar
 * @param {number} t
 * @returns {Grip}
 */
export function gripFor(ray, plane, collar, t) {
  const at = rayPlane(ray.o, ray.d, plane) ?? collar;
  return {
    plane,
    offset: { x: collar.x - at.x, y: collar.y - at.y, z: collar.z - at.z },
    t0: t,
    from: collar.y,
    clear: false,
    last: { x: collar.x, y: collar.y, z: collar.z },
  };
}

/**
 * Where his collar goes this frame: where `ray` meets the grip's plane, plus the grab offset
 * (the point grabbed under the cursor), no higher than CARRY.liftMax and no lower than his
 * collar was grabbed at, or `low` (his hang height: his soles off the floor) once he's been
 * lifted to it (grabbed standing, his collar starts under it: held still there he stays put, the
 * point pressed under the cursor, and he only hangs clear once the cursor lifts him clear). A
 * ray that misses the plane keeps the last spot. Updates `g.last` and `g.clear`.
 * @param {Grip} g
 * @param {{o: XYZ, d: XYZ}} ray
 * @param {number} low
 * @returns {XYZ}
 */
export function dragTarget(g, ray, low) {
  const at = rayPlane(ray.o, ray.d, g.plane);
  if (!at) return { ...g.last };
  const asked = at.y + g.offset.y;
  if (asked >= low) g.clear = true;
  const floor = g.clear ? low : Math.min(g.from, low);
  const y = Math.min(CARRY.liftMax, Math.max(Math.min(floor, CARRY.liftMax), asked));
  g.last = { x: at.x + g.offset.x, y, z: at.z + g.offset.z };
  return { ...g.last };
}

/**
 * What the brain reads while he's held (BrainIn.carry).
 * @param {CarryState} c
 * @returns {{dragSpeed: number, shake: number}}
 */
export function carryFeel(c) {
  return { dragSpeed: c.dragSpeed, shake: c.shake };
}

/**
 * The velocity he's let go with: across the last ~80 ms of samples, capped; while the pointer
 * pushes him out against the edge, none across (its samples hold his rush toward the edge and
 * the clamp's slide along it: tossed with them he'd skid along an edge nobody can see, or
 * bounce back off it, so he drops right there).
 * @param {CarryState} c
 * @returns {XYZ}
 */
export function toss(c) {
  const s = c.samples;
  const a = s[0];
  const b = s[s.length - 1];
  const span = b.t - a.t;
  if (s.length < 2 || span < 1e-4) return { x: 0, y: 0, z: 0 };
  let x = (b.x - a.x) / span;
  let z = (b.z - a.z) / span;
  const across = Math.hypot(x, z);
  if (across > CARRY.tossMax) {
    x *= CARRY.tossMax / across;
    z *= CARRY.tossMax / across;
  }
  if (c.push) {
    x = 0;
    z = 0;
  }
  return { x, y: clamp((b.y - a.y) / span, CARRY.tossDown, CARRY.tossUp), z };
}

/**
 * One frame of falling: gravity, soft bounces off the edges, and a landing once his lowest
 * foot reaches the floor (the root is then lifted so that foot sits on it, and stops).
 * @param {XYZ} root
 * @param {XYZ} vel
 * @param {number} footY  his lowest foot's world height, with the root where it is now
 * @param {number} dt
 * @param {Bounds|null} bounds
 * @param {{x: number, z: number}|null} [tilt]  the swing, relaxed back to upright as he falls
 * @returns {{root: XYZ, vel: XYZ, landed: boolean, tilt: {x: number, z: number}|null}}
 */
export function fallStep(root, vel, footY, dt, bounds, tilt = null) {
  const v = { x: vel.x, y: vel.y - CARRY.fallGravity * dt, z: vel.z };
  const r = { x: root.x + v.x * dt, y: root.y + v.y * dt, z: root.z + v.z * dt };
  const c0 = bounds?.r !== undefined ? centreOf(bounds) : null;
  const d0 = c0 ? Math.hypot(root.x - c0.x, root.z - c0.z) : 0;
  if (c0 && bounds && d0 > bounds.r) {
    // Let go past the rim (held, only his collar is kept inside: the swing can hang his root
    // out past it): no more speed outward, and eased back in at rimEase rather than snapped.
    const nx = (root.x - c0.x) / d0;
    const nz = (root.z - c0.z) / d0;
    const out = v.x * nx + v.z * nz;
    if (out > 0) {
      v.x -= out * nx;
      v.z -= out * nz;
    }
    const back = Math.min(d0 - bounds.r, CARRY.rimEase * dt);
    r.x = root.x + v.x * dt - nx * back;
    r.z = root.z + v.z * dt - nz * back;
    // (Never further out than he was; on the frame he reaches the rim, onto it.)
    const d1 = Math.hypot(r.x - c0.x, r.z - c0.z);
    const most = back < d0 - bounds.r ? d0 : bounds.r;
    if (d1 > most) {
      r.x = c0.x + ((r.x - c0.x) * most) / d1;
      r.z = c0.z + ((r.z - c0.z) * most) / d1;
    }
  } else if (bounds?.r !== undefined) {
    // Off a disc's rim: back inside, the speed out of it reversed and softened, along it kept.
    const c = centreOf(bounds);
    const ox = r.x - c.x;
    const oz = r.z - c.z;
    const d = Math.hypot(ox, oz);
    if (d > bounds.r && d > 0) {
      const nx = ox / d;
      const nz = oz / d;
      r.x = c.x + nx * bounds.r;
      r.z = c.z + nz * bounds.r;
      const out = v.x * nx + v.z * nz;
      if (out > 0) {
        v.x -= (1 + CARRY.restitution) * out * nx;
        v.z -= (1 + CARRY.restitution) * out * nz;
      }
    }
  } else if (bounds) {
    if (r.z < bounds.minZ || r.z > bounds.maxZ) {
      r.z = clamp(r.z, bounds.minZ, bounds.maxZ);
      v.z = (r.z === bounds.minZ ? 1 : -1) * Math.abs(v.z) * CARRY.restitution;
    }
    const [lo, hi] = xRange(bounds, r.z);
    if (r.x < lo || r.x > hi) {
      r.x = clamp(r.x, lo, hi);
      v.x = (r.x === lo ? 1 : -1) * Math.abs(v.x) * CARRY.restitution;
    }
  }
  const relax = Math.exp(-CARRY.tiltRelax * dt);
  const t2 = tilt ? { x: tilt.x * relax, z: tilt.z * relax } : null;
  const foot = footY + (r.y - root.y);
  if (foot <= CARRY.floorY) {
    r.y += CARRY.floorY - foot;
    return { root: r, vel: { x: 0, y: 0, z: 0 }, landed: true, tilt: t2 };
  }
  return { root: r, vel: v, landed: false, tilt: t2 };
}
