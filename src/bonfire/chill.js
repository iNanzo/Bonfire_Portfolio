// Cold mist for the ice element: the "tuft of chill" that rolls off an ice slam, trails
// the ring of shards and seeps off the crystals at rest. Cold air is heavier than
// the air around it, so the mist sinks, hugs the ground (the scenery's height map)
// and spreads outward, curling on the same noise as the fire while it thins away.
// Pale specks in the flame's lightest colors, normal-blended in the color pass like
// the fire's smoke, so they veil what's behind them before the palette dither.
import * as THREE from 'three';
import { createPoints, rampColors } from './points.js';

export function createChill({ material, field, origin, count = 1400, reducedMotion = false }) {
  const pts = createPoints(count, material);
  const g = pts.geometry;
  const P = g.attributes.position.array;
  const Cl = g.attributes.color.array;
  const Sz = g.attributes.size.array;
  const A = g.attributes.alpha.array;
  const vel = new Float32Array(count * 3);
  const turb = new Float32Array(count * 3);
  const age = new Float32Array(count).fill(1);
  const life = new Float32Array(count).fill(0);
  const peak = new Float32Array(count);
  const tone = new Uint8Array(count);
  let next = 0;
  let frame = 0;
  let live = false;
  let ground = () => 0;

  const cols = rampColors(['#e8f4ff', '#8cc8ff', '#2f7fe0']);
  const tint = new THREE.Color();

  /** One wisp at (x, y, z) moving (vx, vy, vz), for `span` seconds, at most `alpha` opaque. */
  function emit(x, y, z, vx, vy, vz, span = 2, alpha = 0.5) {
    if (reducedMotion) return;
    const i = next;
    next = (next + 1) % count;
    const ix = i * 3;
    P[ix] = x;
    P[ix + 1] = y;
    P[ix + 2] = z;
    vel[ix] = vx;
    vel[ix + 1] = vy;
    vel[ix + 2] = vz;
    turb[ix] = turb[ix + 1] = turb[ix + 2] = 0;
    age[i] = 0;
    life[i] = span * (0.8 + Math.random() * 0.4);
    peak[i] = alpha;
    tone[i] = Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2;
  }

  /** A puff rolling out from (x, z): `n` wisps, `speed` m/s outward. */
  function puff(x, z, n, { radius = 0.3, speed = 1, rise = 0.25, span = 2.2, alpha = 0.6 } = {}) {
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const s = speed * (0.45 + Math.random() * 0.75);
      emit(
        x + Math.cos(a) * r,
        ground(x, z) + 0.03 + Math.random() * 0.14,
        z + Math.sin(a) * r,
        Math.cos(a) * s,
        rise * (0.3 + Math.random()),
        Math.sin(a) * s,
        span,
        alpha,
      );
    }
  }

  function step(dt, t) {
    frame++;
    let any = false;
    for (let i = 0; i < count; i++) {
      if (age[i] >= life[i]) {
        Sz[i] = 0;
        continue;
      }
      any = true;
      age[i] += dt;
      const ix = i * 3;
      const k = Math.min(1, age[i] / life[i]);
      // Curl turbulence, refreshed every third frame (it's the costly part).
      if ((i + frame) % 3 === 0) {
        const c = field.fire(P[ix] - origin.x, P[ix + 1] * 0.6, P[ix + 2] - origin.z, t * 0.4);
        turb[ix] = c.x * 0.22;
        turb[ix + 1] = c.y * 0.06;
        turb[ix + 2] = c.z * 0.22;
      }
      const drag = Math.exp(-dt * 1.5);
      vel[ix] *= drag;
      vel[ix + 1] = vel[ix + 1] * drag - 0.4 * dt; // cold air sinks
      vel[ix + 2] *= drag;
      P[ix] += (vel[ix] + turb[ix]) * dt;
      P[ix + 1] += (vel[ix + 1] + turb[ix + 1]) * dt;
      P[ix + 2] += (vel[ix + 2] + turb[ix + 2]) * dt;
      const floor = ground(P[ix], P[ix + 2]) + 0.025;
      if (P[ix + 1] < floor) {
        P[ix + 1] = floor;
        vel[ix + 1] = 0;
      }
      const c = cols[tone[i]];
      Cl[ix] = c.r;
      Cl[ix + 1] = c.g;
      Cl[ix + 2] = c.b;
      Sz[i] = 1.6 + k * 1.8;
      A[i] = peak[i] * Math.min(1, age[i] * 5) * (1 - k) ** 1.4;
    }
    if (any || live) for (const k of ['position', 'color', 'size', 'alpha']) g.attributes[k].needsUpdate = true;
    live = any;
  }

  return {
    points: pts,
    emit,
    puff,
    step,
    sets: [{ pos: P, vel, n: count, geo: g, maxV: 1.2 }],
    setGround(fn) {
      ground = fn;
    },
    /** Pale mist in the flame's lightest colors. */
    setRamp(hexes) {
      cols[0].set(hexes[2]).lerp(tint.set(hexes[3]), 0.6);
      cols[1].set(hexes[2]);
      cols[2].set(hexes[1]).lerp(tint.set(hexes[2]), 0.5);
    },
  };
}
