// Carrying NEWT by the collar in the invitation toy: the anchor his collar follows (eased in
// over ~0.15 s, kept inside the play area), a damped pendulum that swings his root as the
// anchor speeds up and slows down (procedural motion never touches his bones), the toss
// velocity from the last ~80 ms when he's let go, and the fall that follows, with gravity and
// soft bounces off the play area's edges (a disc's rim, or a box's sides), until his lowest
// foot meets the floor. Pure: no three.js.

import { centreOf, clampTo, xRange } from './steer.js';

/** @typedef {import('./types.js').XYZ} XYZ */
/** @typedef {import('./types.js').Bounds} Bounds */
/** @typedef {import('./types.js').CarryState} CarryState */

/**
 * ease: seconds for the anchor to come from his collar to the pointer; window: seconds of
 * samples a toss reads. The swing: a pendulum `length` long (collar to his middle) under
 * `gravity`, `damping` per second, at most `tiltMax` radians, fed accelerations up to
 * `accelMax`, integrated in steps of at most `substep`; `shakeSmooth` smooths the shake reading.
 * A toss is capped at `tossMax` across and `tossUp`/`tossDown` up and down. The fall: `fallGravity`,
 * `restitution` off the edges, the floor at `floorY`, the tilt relaxing at `tiltRelax` per second.
 */
export const CARRY = {
  ease: 0.15,
  window: 0.08,
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
  floorY: 0,
  tiltRelax: 6,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth01 = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

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
    from: { ...p },
    anchor: { ...p },
    vel: { x: 0, y: 0, z: 0 },
    tilt: { x: 0, z: 0 },
    tiltVel: { x: 0, z: 0 },
    samples: [{ t, ...p }],
    dragSpeed: 0,
    shake: 0,
  };
}

/**
 * One frame held: the anchor moves toward `target` (where the pointer's ray meets the lift
 * height), kept inside the bounds, and the swing answers its acceleration. Updates `c` in
 * place and returns it.
 * @param {CarryState} c
 * @param {XYZ} target
 * @param {number} dt
 * @param {Bounds|null} bounds
 * @param {number} t
 * @returns {CarryState}
 */
export function holdStep(c, target, dt, bounds, t) {
  const { x: gx, z: gz } = bounds ? clampTo(bounds, target) : target;
  const k = CARRY.ease > 0 ? smooth01((t - c.t0) / CARRY.ease) : 1;
  const next = {
    x: c.from.x + (gx - c.from.x) * k,
    y: c.from.y + (target.y - c.from.y) * k,
    z: c.from.z + (gz - c.from.z) * k,
  };
  if (dt > 0) {
    const vel = { x: (next.x - c.anchor.x) / dt, y: (next.y - c.anchor.y) / dt, z: (next.z - c.anchor.z) / dt };
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
  }
  c.anchor = next;
  c.t = t;
  c.samples.push({ t, ...next });
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
 * What the brain reads while he's held (BrainIn.carry).
 * @param {CarryState} c
 * @returns {{dragSpeed: number, shake: number}}
 */
export function carryFeel(c) {
  return { dragSpeed: c.dragSpeed, shake: c.shake };
}

/**
 * The velocity he's let go with: across the last ~80 ms of samples, capped.
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
  if (bounds?.r !== undefined) {
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
