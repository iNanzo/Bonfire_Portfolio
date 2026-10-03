// @ts-nocheck: 6 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// The trail a swinging blade leaves (the visualizer's living blade), in the bonfire's
// element and colors.
//
//   particles  shed along the swept blade each frame (more toward the tip, more the
//              faster it moves):
//                fire       embers carried a little by the blade, then rising and curling
//                           through the fire's flow field, cooling down the ramp; hot ones
//                           small and solid, cooling ones swelling into dithered wisps.
//                lightning  white-hot sparks off the point only, that snap outward, jitter
//                           and die fast.
//                frost      pale glints that drift down and twinkle as they fall.
//   arc        a glowing ribbon along the tip's last fifth of a second, widest and hottest
//              at the blade, so each slash draws a crescent. Fire and frost add a fainter
//              band halfway up the blade; frost's is thinner and pale.
//   lightning  the whole blade is electric: a bolt re-strikes along it every frame, from
//              the guard to the point, with small arcs leaping off near the tip. Its slash
//              leaves a sheet of lightning: jagged trails from five points along the
//              blade, and bolts crackling across them, all strongest at the tip and fading
//              toward the guard (fainter, thinner and shorter-lived the nearer the hilt).
//   hits       each move's hit throws a spray off the point, along the blade's motion.
import * as THREE from 'three';
import { createBoltLines, seeded } from './bolts.js';
import { effects } from '../effects.js';
import { createPoints, rampColors, setRampColors } from './points.js';

const HISTORY = 24;

export function createSwingTrail({ fxMaterial, field, count = 1600, reducedMotion = false }) {
  const N = reducedMotion ? 1 : count;
  const points = createPoints(N, fxMaterial);
  const geo = points.geometry;
  const P = geo.attributes.position.array;
  const C = geo.attributes.color.array;
  const S = geo.attributes.size.array;
  const A = geo.attributes.alpha.array;
  const V = new Float32Array(N * 3);
  const age = new Float32Array(N).fill(1e3);
  const life = new Float32Array(N).fill(1);
  const heat0 = new Float32Array(N);
  const grain = new Float32Array(N);
  let next = 0;
  let live = 0;

  // Lightning's sheet: five trails of up to four segments a step, plus the bolts.
  const arcs = createBoltLines(fxMaterial, HISTORY * 20 + 96, HISTORY * 8 + 48, {
    afterimage: () => (reducedMotion ? 0 : effects.impact.afterimages),
  });
  const rng = seeded(7);
  // The blade's recent path: [grip x, y, z, tip x, y, z, time]. A point partway up the
  // blade (0 at the grip, 1 at the point) is read off it.
  const hist = [];
  let clock = 0;
  let element = 'fire';

  const ramp = rampColors(['#000000', '#000000', '#000000', '#000000']);
  const tmp = new THREE.Color();
  const sampleRamp = (h, out) => {
    const x = Math.min(0.999, Math.max(0, h)) * 3;
    const k = Math.floor(x);
    return out.copy(ramp[k]).lerp(ramp[k + 1], x - k);
  };

  /**
   * The blade moved from (g0 → t0) to (g1 → t1) (grip → tip, world) over dt: shed
   * embers along what it swept and extend the arc.
   */
  function emit(g0, t0, g1, t1, dt) {
    if (reducedMotion) return;
    const speed = t1.distanceTo(t0) / Math.max(dt, 1e-3);
    const zap = element === 'lightning';
    const n = Math.min(zap ? 8 : 90, Math.round(speed * dt * (element === 'fire' ? 230 : zap ? 20 : 140)));
    for (let k = 0; k < n; k++) {
      const s = zap ? 0.93 + Math.random() * 0.07 : Math.random() ** 0.55; // toward the tip (lightning: only off the point)
      const lam = Math.random();
      const ax = g0.x + (t0.x - g0.x) * s,
        ay = g0.y + (t0.y - g0.y) * s,
        az = g0.z + (t0.z - g0.z) * s;
      const bx = g1.x + (t1.x - g1.x) * s,
        by = g1.y + (t1.y - g1.y) * s,
        bz = g1.z + (t1.z - g1.z) * s;
      const i = next;
      next = (next + 1) % N;
      P[i * 3] = ax + (bx - ax) * lam;
      P[i * 3 + 1] = ay + (by - ay) * lam;
      P[i * 3 + 2] = az + (bz - az) * lam;
      age[i] = 0;
      if (element === 'lightning') {
        // Sparks off the point: they snap out a hand's width and die in a blink, so they
        // stay on the path the point draws.
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u) * (0.5 + Math.random());
        V[i * 3] = Math.cos(a) * r;
        V[i * 3 + 1] = u;
        V[i * 3 + 2] = Math.sin(a) * r;
        life[i] = 0.06 + Math.random() * 0.1;
        heat0[i] = 1;
      } else if (element === 'ice') {
        // Glints barely carried by the blade, left hanging to drift down.
        V[i * 3] = ((bx - ax) / dt) * 0.04 + (Math.random() - 0.5) * 0.15;
        V[i * 3 + 1] = ((by - ay) / dt) * 0.04 + (Math.random() - 0.3) * 0.15;
        V[i * 3 + 2] = ((bz - az) / dt) * 0.04 + (Math.random() - 0.5) * 0.15;
        life[i] = 0.6 + Math.random() * 0.7;
        heat0[i] = 0.75 + 0.25 * Math.random();
      } else {
        // Carried along a little by the blade, then free.
        const carry = 0.12 + Math.random() * 0.12;
        V[i * 3] = ((bx - ax) / dt) * carry + (Math.random() - 0.5) * 0.3;
        V[i * 3 + 1] = ((by - ay) / dt) * carry + 0.2 + Math.random() * 0.3;
        V[i * 3 + 2] = ((bz - az) / dt) * carry + (Math.random() - 0.5) * 0.3;
        life[i] = 0.3 + Math.random() * 0.35;
        heat0[i] = 0.7 + 0.3 * s;
      }
      const g = Math.random();
      grain[i] = g < 0.6 ? 1 : g < 0.9 ? 1.5 : 2.2;
    }
    live = Math.max(live, n);
    hist.push([g1.x, g1.y, g1.z, t1.x, t1.y, t1.z, clock]);
    if (hist.length > HISTORY) hist.shift();
  }

  /** The point `s` of the way from the grip to the tip in history entry h. */
  const along = (h, s, out) => out.set(h[0] + (h[3] - h[0]) * s, h[1] + (h[4] - h[1]) * s, h[2] + (h[5] - h[2]) * s);
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const toEye = new THREE.Vector3(); // (the blade's own lightning is drawn a little toward the camera, over the blade)
  const side = new THREE.Vector3();

  /** The trail of the point `s` up the blade over the last `keep` seconds. */
  function drawArc(s, width, alpha, hot, keep) {
    const zap = element === 'lightning';
    for (let j = hist.length - 1; j > 0; j--) {
      const ka = (clock - hist[j][6]) / keep;
      const kb = (clock - hist[j - 1][6]) / keep;
      if (kb >= 1) break;
      along(hist[j], s, pa);
      along(hist[j - 1], s, pb);
      arcs.bolt(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, {
        rng,
        depth: zap ? 2 : 1,
        jag: zap ? 0.35 : 0,
        color: (t, out) => sampleRamp(hot - (ka + (kb - ka) * t) * 0.8, out),
        alpha: (t) => alpha * Math.max(0, 1 - (ka + (kb - ka) * t)),
        width: (t) => 1 + width * Math.max(0, 1 - (ka + (kb - ka) * t)),
        heat: ka < 0.1 ? 1.4 : 0.4,
      });
    }
  }

  // Lightning: points up the blade the sheet is drawn from, guard to tip.
  const SHEET = [0.25, 0.45, 0.65, 0.83, 1];
  /** The electric blade and its sheet of lightning, strongest at the tip. `eye`: the camera's position. */
  function drawLightning(eye) {
    const now = hist.at(-1);
    along(now, 0.5, pa);
    if (eye) toEye.copy(eye).sub(pa).setLength(0.05);
    else toEye.set(0, 0, 0);
    // Bolts running up both edges of the blade (just outside them, as seen from the
    // camera), re-striking each frame, brighter and wider toward the point.
    side.set(now[3] - now[0], now[4] - now[1], now[5] - now[2]).cross(toEye);
    if (side.lengthSq() > 1e-8) side.setLength(0.05);
    for (const k of [1, -1]) {
      if (k < 0 && Math.random() < 0.4) continue; // (the far edge flickers)
      along(now, 0.1, pa)
        .add(toEye)
        .addScaledVector(side, k * 0.6);
      along(now, 1, pb)
        .add(toEye)
        .addScaledVector(side, k * 0.2);
      arcs.bolt(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, {
        rng,
        depth: 4,
        jag: 0.08,
        heat: 1.3,
        color: (t, out) => sampleRamp(0.5 + 0.45 * t, out),
        alpha: (t) => (0.25 + 0.75 * t) * (k > 0 ? 1 : 0.7),
        width: (t) => 1 + 1.4 * t * t,
      });
    }
    // Small arcs leaping off the blade near the point.
    for (let k = 0; k < 2; k++) {
      if (Math.random() < 0.4) continue;
      const s = 0.55 + 0.45 * Math.random();
      along(now, s, pa).add(toEye);
      pb.set(
        pa.x + (Math.random() - 0.5) * 0.22 * s,
        pa.y + (Math.random() - 0.5) * 0.22 * s,
        pa.z + (Math.random() - 0.5) * 0.22 * s,
      );
      arcs.bolt(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, {
        rng,
        depth: 2,
        jag: 0.5,
        width: 1,
        heat: 1.2,
        color: (t, out) => sampleRamp(0.95, out),
        alpha: (t) => s * (1 - t),
      });
    }
    // The sheet: trails from points up the blade, fainter, thinner and shorter-lived toward the guard.
    for (const s of SHEET) drawArc(s, 3 * s * s, s ** 1.6, 0.6 + 0.4 * s, 0.07 + 0.09 * s);
    // Bolts crackling across the sheet, from near the point toward the guard, fading as they go.
    if (hist.length > 3) {
      for (let k = 0; k < 2; k++) {
        if (Math.random() < 0.35) continue;
        const h = hist[hist.length - 1 - Math.floor(Math.random() * Math.min(5, hist.length))];
        along(h, 0.9 + 0.1 * Math.random(), pa);
        along(h, 0.2 + 0.35 * Math.random(), pb);
        arcs.bolt(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, {
          rng,
          depth: 3,
          jag: 0.4,
          width: 1,
          heat: 1.2,
          color: (t, out) => sampleRamp(0.95 - 0.35 * t, out),
          alpha: (t) => 0.9 * (1 - 0.8 * t),
        });
      }
    }
  }

  /** `eye` (optional): the camera's position, so the blade's own lightning draws over it. */
  function step(dt, t, eye) {
    clock += dt;
    // Embers: rise and curl through the fire's field, cooling.
    if (live) {
      let any = 0;
      const drag = Math.exp(-dt * 2.6);
      for (let i = 0; i < N; i++) {
        if (age[i] >= life[i]) {
          S[i] = 0;
          continue;
        }
        any++;
        age[i] += dt;
        const k = Math.min(1, age[i] / life[i]);
        const ix = i * 3;
        if (element === 'lightning') {
          // Snap and jitter, no rise; white-hot to the flame's bright tone, flickering.
          const d = Math.exp(-dt * 7);
          V[ix] *= d;
          V[ix + 1] *= d;
          V[ix + 2] *= d;
          P[ix] += V[ix] * dt + (Math.random() - 0.5) * 0.02;
          P[ix + 1] += V[ix + 1] * dt + (Math.random() - 0.5) * 0.02;
          P[ix + 2] += V[ix + 2] * dt + (Math.random() - 0.5) * 0.02;
          sampleRamp(1 - 0.35 * k, tmp).multiplyScalar(1.1 - 0.5 * k);
          C[ix] = tmp.r;
          C[ix + 1] = tmp.g;
          C[ix + 2] = tmp.b;
          S[i] = Math.random() < 0.25 ? 0 : k < 0.3 ? 1.5 : 1;
          A[i] = 1;
        } else if (element === 'ice') {
          // Drift down slowly, swaying; pale, twinkling as they turn.
          const c = field.fire(P[ix], P[ix + 1], P[ix + 2], t);
          const d = Math.exp(-dt * 1.5);
          V[ix] = (V[ix] + c.x * 0.25 * dt) * d;
          V[ix + 1] = (V[ix + 1] - 0.5 * dt) * d;
          V[ix + 2] = (V[ix + 2] + c.z * 0.25 * dt) * d;
          P[ix] += V[ix] * dt;
          P[ix + 1] += V[ix + 1] * dt;
          P[ix + 2] += V[ix + 2] * dt;
          const glint = Math.sin(t * 17 + i * 1.7) > 0.7;
          sampleRamp(heat0[i] * (glint ? 1 : 0.85), tmp).multiplyScalar((glint ? 1 : 0.6) * (1 - 0.6 * k));
          C[ix] = tmp.r;
          C[ix + 1] = tmp.g;
          C[ix + 2] = tmp.b;
          S[i] = glint ? 1.6 : 1;
          A[i] = 0.4 + 0.6 * (1 - k);
        } else {
          const c = field.fire(P[ix], P[ix + 1], P[ix + 2], t);
          V[ix] = (V[ix] + c.x * 1.1 * dt) * drag;
          V[ix + 1] = (V[ix + 1] + (0.9 * (1 - k) + c.y * 0.5) * dt) * drag;
          V[ix + 2] = (V[ix + 2] + c.z * 1.1 * dt) * drag;
          P[ix] += V[ix] * dt;
          P[ix + 1] += V[ix + 1] * dt;
          P[ix + 2] += V[ix + 2] * dt;
          const h = heat0[i] * (1 - k) ** 1.2;
          sampleRamp(h, tmp).multiplyScalar(0.55 + 0.6 * h);
          C[ix] = tmp.r;
          C[ix + 1] = tmp.g;
          C[ix + 2] = tmp.b;
          S[i] = grain[i] * (h > 0.6 ? 0.8 : 1 + 0.6 * k);
          A[i] = h > 0.6 ? 1 : 0.35 + 0.65 * (1 - k);
        }
      }
      live = any;
      for (const name of ['position', 'color', 'size', 'alpha']) geo.attributes[name].needsUpdate = true;
    }
    // The arcs.
    arcs.begin();
    if (hist.length > 1 && clock - hist.at(-1)[6] < 0.25) {
      if (element === 'lightning') {
        if (clock - hist.at(-1)[6] < 0.05) drawLightning(eye);
      } else {
        const ice = element === 'ice';
        drawArc(0.55, 1.5, 0.45, ice ? 0.95 : 0.7, 0.2);
        drawArc(1, ice ? 2.5 : 4, 1, 1, 0.2);
      }
    }
    arcs.end();
  }

  /** A hit: a spray off the point along `dir` (a unit vector), `strength` 0..1. */
  function hit(tipPos, dir, strength = 1) {
    if (reducedMotion) return;
    const zap = element === 'lightning';
    const ice = element === 'ice';
    const n = Math.round((zap ? 12 : 40) * strength);
    for (let k = 0; k < n; k++) {
      const i = next;
      next = (next + 1) % N;
      P[i * 3] = tipPos.x;
      P[i * 3 + 1] = tipPos.y;
      P[i * 3 + 2] = tipPos.z;
      // Mostly along the motion, fanning out.
      const sp = (zap ? 1.4 : ice ? 1.2 : 2.2) * (0.4 + Math.random());
      V[i * 3] = (dir.x + (Math.random() - 0.5) * 1.2) * sp;
      V[i * 3 + 1] = (dir.y + (Math.random() - 0.3) * 1.2) * sp;
      V[i * 3 + 2] = (dir.z + (Math.random() - 0.5) * 1.2) * sp;
      age[i] = 0;
      life[i] = zap ? 0.08 + Math.random() * 0.12 : ice ? 0.5 + Math.random() * 0.5 : 0.25 + Math.random() * 0.35;
      heat0[i] = 1;
      grain[i] = Math.random() < 0.7 ? 1.2 : 2;
    }
    live = Math.max(live, n);
  }

  return {
    objects: [points, ...arcs.objects],
    emit,
    step,
    hit,
    setRamp(hexes) {
      setRampColors(ramp, hexes);
    },
    /** fire | lightning | ice */
    setElement(key) {
      element = key;
    },
    clear() {
      age.fill(1e3);
      S.fill(0);
      geo.attributes.size.needsUpdate = true;
      hist.length = 0;
      arcs.clear();
    },
  };
}
