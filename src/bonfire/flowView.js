// The flow field made visible (the site's breakdown mode): a grid of short strokes
// through the fire's volume, each pointing where the flame's flow would carry a fresh
// particle there right now: buoyancy up, curl-noise swirl (calm at the base, turbulent
// toward the tips), and the pull toward the axis that tapers the plume. It's the same
// formula flame.js steps its particles with, sampled on a grid instead of at particles.
import * as THREE from 'three';
import { createRingLines } from './rings.js';

const N = 6;        // strokes per axis
const SPAN = 0.62;  // half-width of the grid (m)
const LENGTH = 0.22; // stroke length per m/s

export function createFlowView({ fxMaterial, field, origin, params }) {
  const L = createRingLines(fxMaterial, N * N * N * 2);
  const lo = new THREE.Color();
  const hi = new THREE.Color();
  const tmp = new THREE.Color();
  let on = false;
  L.lines.visible = false;

  return {
    object: L.lines,
    /** [lo, mid, hi, core] sRGB hexes: strokes run from the dim tail to the bright head. */
    setRamp(hexes) { lo.set(hexes[1]).multiplyScalar(0.35); hi.set(hexes[3]); },
    set visible(v) { on = v; L.lines.visible = v; if (!v) L.clear(); },
    get visible() { return on; },
    step(t) {
      if (!on) return;
      const f = params.curlFreq;
      const amp = params.curlAmp;
      const rise = params.rise;
      let v = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
        const lx = (i / (N - 1) - 0.5) * 2 * SPAN;
        const ly = 0.08 + (j / (N - 1)) * 1.3;
        const lz = (k / (N - 1) - 0.5) * 2 * SPAN;
        const c = field.curl(lx * f, ly * f - t * 1.35, lz * f + t * 0.25);
        const turb = amp * Math.min(1, 0.25 + ly * 1.6);
        const taper = 2.2 * Math.min(1, ly * 1.6);
        const fx = c.x * turb - lx * taper;
        const fy = rise + c.y * turb * 0.5;
        const fz = c.z * turb - lz * taper;
        const speed = Math.hypot(fx, fy, fz);
        const x = origin.x + lx, y = origin.y + ly, z = origin.z + lz;
        const ix = v * 3;
        L.pos[ix] = x; L.pos[ix + 1] = y; L.pos[ix + 2] = z;
        L.pos[ix + 3] = x + fx * LENGTH; L.pos[ix + 4] = y + fy * LENGTH; L.pos[ix + 5] = z + fz * LENGTH;
        // Faster flow draws brighter.
        const b = Math.min(1, 0.35 + speed * 0.5);
        tmp.copy(lo).multiplyScalar(b);
        L.col[ix] = tmp.r; L.col[ix + 1] = tmp.g; L.col[ix + 2] = tmp.b;
        tmp.copy(hi).multiplyScalar(b);
        L.col[ix + 3] = tmp.r; L.col[ix + 4] = tmp.g; L.col[ix + 5] = tmp.b;
        L.alpha[v] = 0.5; L.alpha[v + 1] = 1;
        v += 2;
      }
      L.commit();
    },
  };
}
