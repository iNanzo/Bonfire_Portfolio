// The trail a swinging blade leaves (the visualizer's sword combos), in the bonfire's
// element and colors.
//
//   particles  shed along the swept blade each frame (more toward the tip, more the
//              faster it moves):
//                fire       embers carried a little by the blade, then rising and curling
//                           through the fire's flow field, cooling down the ramp; hot ones
//                           small and solid, cooling ones swelling into dithered wisps.
//                lightning  white-hot sparks that snap outward, jitter and die fast.
//                frost      pale glints that drift down and twinkle as they fall.
//   arc        a glowing ribbon along the tip's last fifth of a second, widest and hottest
//              at the blade, with a fainter band halfway up it, so each slash draws a
//              crescent. Lightning's is jagged and re-strikes every frame, with bolts
//              crackling across the swept area; frost's is thinner and pale.
import * as THREE from 'three';
import { createBoltLines, seeded } from './bolts.js';

const HISTORY = 24;

export function createSwingTrail({ fxMaterial, field, count = 1600, reducedMotion = false }) {
  const N = reducedMotion ? 1 : count;
  const geo = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['color', 3], ['size', 1], ['alpha', 1]]) {
    geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(N * size), size));
  }
  const points = new THREE.Points(geo, fxMaterial);
  points.frustumCulled = false;
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

  const arcs = createBoltLines(fxMaterial, HISTORY * 4, HISTORY * 4 + 8); // two arcs, two segments per step
  const rng = seeded(7);
  // The tip's recent path (and a point halfway up the blade): [x, y, z, time].
  const tipHist = [];
  const midHist = [];
  let clock = 0;
  let element = 'fire';

  let ramp = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
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
    const n = Math.min(90, Math.round(speed * dt * (element === 'fire' ? 230 : 140)));
    for (let k = 0; k < n; k++) {
      const s = Math.random() ** 0.55; // toward the tip
      const lam = Math.random();
      const ax = g0.x + (t0.x - g0.x) * s, ay = g0.y + (t0.y - g0.y) * s, az = g0.z + (t0.z - g0.z) * s;
      const bx = g1.x + (t1.x - g1.x) * s, by = g1.y + (t1.y - g1.y) * s, bz = g1.z + (t1.z - g1.z) * s;
      const i = next;
      next = (next + 1) % N;
      P[i * 3] = ax + (bx - ax) * lam;
      P[i * 3 + 1] = ay + (by - ay) * lam;
      P[i * 3 + 2] = az + (bz - az) * lam;
      age[i] = 0;
      if (element === 'lightning') {
        // Sparks snap out in any direction, fast, and die in a blink.
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u) * (1.5 + Math.random() * 2.5);
        V[i * 3] = Math.cos(a) * r; V[i * 3 + 1] = u * 2; V[i * 3 + 2] = Math.sin(a) * r;
        life[i] = 0.1 + Math.random() * 0.2;
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
    tipHist.push([t1.x, t1.y, t1.z, clock]);
    midHist.push([g1.x + (t1.x - g1.x) * 0.55, g1.y + (t1.y - g1.y) * 0.55, g1.z + (t1.z - g1.z) * 0.55, clock]);
    if (tipHist.length > HISTORY) { tipHist.shift(); midHist.shift(); }
  }

  function drawArc(hist, width, alpha, hot) {
    const keep = element === 'lightning' ? 0.14 : 0.2;
    const zap = element === 'lightning';
    for (let j = hist.length - 1; j > 0; j--) {
      const a = hist[j];
      const b = hist[j - 1];
      const ka = (clock - a[3]) / keep;
      const kb = (clock - b[3]) / keep;
      if (kb >= 1) break;
      arcs.bolt(a[0], a[1], a[2], b[0], b[1], b[2], {
        rng, depth: zap ? 2 : 1, jag: zap ? 0.35 : 0,
        color: (t, out) => sampleRamp(hot - (ka + (kb - ka) * t) * 0.8, out),
        alpha: (t) => alpha * Math.max(0, 1 - (ka + (kb - ka) * t)),
        width: (t) => 1 + width * Math.max(0, 1 - (ka + (kb - ka) * t)),
        heat: ka < 0.1 ? 1.4 : 0.4,
      });
    }
  }

  function step(dt, t) {
    clock += dt;
    // Embers: rise and curl through the fire's field, cooling.
    if (live) {
      let any = 0;
      const drag = Math.exp(-dt * 2.6);
      for (let i = 0; i < N; i++) {
        if (age[i] >= life[i]) { S[i] = 0; continue; }
        any++;
        age[i] += dt;
        const k = Math.min(1, age[i] / life[i]);
        const ix = i * 3;
        if (element === 'lightning') {
          // Snap and jitter, no rise; white-hot to the flame's bright tone, flickering.
          const d = Math.exp(-dt * 7);
          V[ix] *= d; V[ix + 1] *= d; V[ix + 2] *= d;
          P[ix] += V[ix] * dt + (Math.random() - 0.5) * 0.02;
          P[ix + 1] += V[ix + 1] * dt + (Math.random() - 0.5) * 0.02;
          P[ix + 2] += V[ix + 2] * dt + (Math.random() - 0.5) * 0.02;
          sampleRamp(1 - 0.35 * k, tmp).multiplyScalar(1.1 - 0.5 * k);
          C[ix] = tmp.r; C[ix + 1] = tmp.g; C[ix + 2] = tmp.b;
          S[i] = Math.random() < 0.25 ? 0 : k < 0.3 ? 1.5 : 1;
          A[i] = 1;
        } else if (element === 'ice') {
          // Drift down slowly, swaying; pale, twinkling as they turn.
          const c = field.fire(P[ix], P[ix + 1], P[ix + 2], t);
          const d = Math.exp(-dt * 1.5);
          V[ix] = (V[ix] + c.x * 0.25 * dt) * d;
          V[ix + 1] = (V[ix + 1] - 0.5 * dt) * d;
          V[ix + 2] = (V[ix + 2] + c.z * 0.25 * dt) * d;
          P[ix] += V[ix] * dt; P[ix + 1] += V[ix + 1] * dt; P[ix + 2] += V[ix + 2] * dt;
          const glint = Math.sin(t * 17 + i * 1.7) > 0.7;
          sampleRamp(heat0[i] * (glint ? 1 : 0.85), tmp).multiplyScalar((glint ? 1 : 0.6) * (1 - 0.6 * k));
          C[ix] = tmp.r; C[ix + 1] = tmp.g; C[ix + 2] = tmp.b;
          S[i] = glint ? 1.6 : 1;
          A[i] = 0.4 + 0.6 * (1 - k);
        } else {
          const c = field.fire(P[ix], P[ix + 1], P[ix + 2], t);
          V[ix] = (V[ix] + c.x * 1.1 * dt) * drag;
          V[ix + 1] = (V[ix + 1] + (0.9 * (1 - k) + c.y * 0.5) * dt) * drag;
          V[ix + 2] = (V[ix + 2] + c.z * 1.1 * dt) * drag;
          P[ix] += V[ix] * dt; P[ix + 1] += V[ix + 1] * dt; P[ix + 2] += V[ix + 2] * dt;
          const h = heat0[i] * (1 - k) ** 1.2;
          sampleRamp(h, tmp).multiplyScalar(0.55 + 0.6 * h);
          C[ix] = tmp.r; C[ix + 1] = tmp.g; C[ix + 2] = tmp.b;
          S[i] = grain[i] * (h > 0.6 ? 0.8 : 1 + 0.6 * k);
          A[i] = h > 0.6 ? 1 : 0.35 + 0.65 * (1 - k);
        }
      }
      live = any;
      for (const name of ['position', 'color', 'size', 'alpha']) geo.attributes[name].needsUpdate = true;
    }
    // The arcs.
    arcs.begin();
    if (tipHist.length > 1 && clock - tipHist.at(-1)[3] < 0.25) {
      const ice = element === 'ice';
      drawArc(midHist, 1.5, 0.45, ice ? 0.95 : 0.7);
      drawArc(tipHist, ice ? 2.5 : 4, 1, 1);
      if (element === 'lightning' && tipHist.length > 3) {
        // Bolts crackling across what the blade just swept.
        for (let b = 0; b < 3; b++) {
          const p = tipHist[tipHist.length - 1 - Math.floor(Math.random() * Math.min(6, tipHist.length))];
          const q = midHist[midHist.length - 1 - Math.floor(Math.random() * Math.min(6, midHist.length))];
          arcs.bolt(p[0], p[1], p[2], q[0], q[1], q[2], {
            rng, depth: 3, jag: 0.4, width: 1, heat: 1.2,
            color: (u, out) => sampleRamp(0.95 - 0.3 * u, out), alpha: 0.9,
          });
        }
      }
    }
    arcs.end();
  }

  return {
    objects: [points, ...arcs.objects],
    emit,
    step,
    setRamp(hexes) { ramp = hexes.map((h) => new THREE.Color(h)); },
    /** fire | lightning | ice */
    setElement(key) { element = key; },
    clear() {
      age.fill(1e3);
      S.fill(0);
      geo.attributes.size.needsUpdate = true;
      tipHist.length = 0;
      midHist.length = 0;
      arcs.clear();
    },
  };
}
