// @ts-nocheck: 5 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// Debris: bits thrown out of a hit that bounce along the ground and come to rest.
//   fire       glowing coals: heavy, a few low bounces, cooling core → lo as they settle
//   ice        ice chips: lively bounces, glinting as a diamond each time they land
//   lightning  sparks: light and fast, zig-zagging, gone almost as soon as they land
// One pool per element (each draws with its element's particle shape, flame.js SHAPE),
// streaked by their motion. The ground is the scenery's height map, so debris bounces off
// flagstones and the ash pile, not a flat floor.
import * as THREE from 'three';
import { createPoints, markDirty } from './points.js';
import { arcJitter, arcHeat } from './signatures.js';
import { TAU } from '../math.js';

// Per element: gravity scale, bounciness, ground friction, life (s), launch speed.
const KINDS = {
  fire: { gravity: 1, bounce: 0.35, friction: 0.55, life: [1.6, 3], speed: [1.2, 2.6], up: [1.4, 2.6] },
  ice: { gravity: 1, bounce: 0.55, friction: 0.75, life: [1.2, 2.2], speed: [1, 2.4], up: [1.2, 2.4] },
  lightning: { gravity: 0.5, bounce: 0.4, friction: 0.6, life: [0.35, 0.8], speed: [1.6, 3.4], up: [0.8, 2] },
};
const GRAVITY = 6.5;
const rand = ([a, b]) => a + Math.random() * (b - a);

/**
 * @param {object} o
 * @param {'fire'|'ice'|'lightning'} o.kind
 * @param {THREE.Material} o.material  the element's particle material (its shape)
 * @param {number} o.count
 */
export function createDebris({ kind, material, count = 120, reducedMotion = false }) {
  const K = KINDS[kind];
  const vel = new Float32Array(count * 3);
  const points = createPoints(count, material, { vel });
  const g = points.geometry.attributes;
  const P = g.position.array,
    C = g.color.array,
    S = g.size.array,
    A = g.alpha.array;
  const age = new Float32Array(count).fill(1);
  const life = new Float32Array(count).fill(0);
  const landed = new Float32Array(count); // time since the last landing (glints, rest)
  let next = 0;
  let live = false;
  let ground = () => 0;
  const ramp = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const tmp = new THREE.Color();
  const white = new THREE.Color('#ffffff');

  return {
    points,
    /** The scenery's height at (x, z). */
    setGround(fn) {
      ground = fn;
    },
    /** [lo, mid, hi, core] as THREE.Colors. */
    setRamp(colors) {
      colors.forEach((c, i) => ramp[i].copy(c));
    },
    /**
     * Throw `n` bits from (x, y, z), spraying all around, or mostly along `dir` (x, z
     * heading, radians) when given. `power` scales their speed.
     */
    throw(x, y, z, n, { dir = null, power = 1 } = {}) {
      if (reducedMotion) return;
      for (let j = 0; j < n; j++) {
        const i = next;
        next = (next + 1) % count;
        const ix = i * 3;
        const a = dir == null ? Math.random() * TAU : dir + (Math.random() - 0.5) * 1.4;
        const s = rand(K.speed) * power;
        P[ix] = x;
        P[ix + 1] = y;
        P[ix + 2] = z;
        vel[ix] = Math.cos(a) * s;
        vel[ix + 1] = rand(K.up) * Math.sqrt(power);
        vel[ix + 2] = Math.sin(a) * s;
        age[i] = 0;
        life[i] = rand(K.life);
        landed[i] = 1;
      }
      live = true;
    },
    step(dt) {
      if (!live) return;
      let any = false;
      for (let i = 0; i < count; i++) {
        if (age[i] >= life[i]) {
          S[i] = 0;
          vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
          continue;
        }
        any = true;
        age[i] += dt;
        landed[i] += dt;
        const ix = i * 3;
        if (kind === 'lightning') arcJitter(vel, ix, dt, 12, 0.5);
        vel[ix + 1] -= GRAVITY * K.gravity * dt;
        P[ix] += vel[ix] * dt;
        P[ix + 1] += vel[ix + 1] * dt;
        P[ix + 2] += vel[ix + 2] * dt;
        const floor = ground(P[ix], P[ix + 2]) + 0.015;
        if (P[ix + 1] < floor) {
          P[ix + 1] = floor;
          if (vel[ix + 1] < -0.5) landed[i] = 0; // a real landing (not just resting)
          vel[ix + 1] = Math.abs(vel[ix + 1]) * K.bounce;
          if (vel[ix + 1] < 0.12) vel[ix + 1] = 0;
          vel[ix] *= K.friction;
          vel[ix + 2] *= K.friction;
        }
        const k = Math.min(1, age[i] / life[i]);
        const fade = Math.min(1, (1 - k) * 3);
        if (kind === 'fire') {
          // Coals cool from the core down to embers, and flicker as they tumble.
          const h = Math.min(2.999, (1 - k) * 3.2);
          const b = Math.floor(h);
          tmp
            .copy(ramp[b])
            .lerp(ramp[Math.min(3, b + 1)], h - b)
            .multiplyScalar(0.8 + 0.2 * Math.sin(age[i] * 31 + i));
          S[i] = k < 0.35 ? 2 : 1;
        } else if (kind === 'ice') {
          const glint = landed[i] < 0.06;
          tmp.copy(glint ? ramp[3] : i & 1 ? ramp[2] : ramp[3]).multiplyScalar(glint ? 1.1 : 0.8);
          S[i] = glint ? 3 : 1;
        } else {
          tmp.copy(ramp[2]).lerp(ramp[3], 0.5).lerp(white, arcHeat(age[i]));
          S[i] = age[i] < 0.06 ? 3 : 1;
        }
        C[ix] = tmp.r;
        C[ix + 1] = tmp.g;
        C[ix + 2] = tmp.b;
        A[i] = fade;
      }
      markDirty(points);
      live = any;
    },
  };
}
