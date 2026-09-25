// One curl-noise field shared by everything that burns — the bonfire, the ground
// flame ring and the weapon forge particles — so they all move with the same
// fluid undulation. Curl of a 3D noise potential is divergence-free, so it
// swirls like a fluid instead of jittering.
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export function createCurlField() {
  const noise = new SimplexNoise();
  const E = 0.08;
  const n1 = (x, y, z) => noise.noise3d(x, y, z);
  const n2 = (x, y, z) => noise.noise3d(x + 31.4, y + 17.1, z - 9.2);
  const n3 = (x, y, z) => noise.noise3d(x - 13.7, y + 41.3, z + 23.9);
  const out = new THREE.Vector3();

  /** Curl at (x, y, z) in noise space. Returns a shared vector — copy it if you keep it. */
  function curl(x, y, z) {
    const d3dy = (n3(x, y + E, z) - n3(x, y - E, z)) / (2 * E);
    const d2dz = (n2(x, y, z + E) - n2(x, y, z - E)) / (2 * E);
    const d1dz = (n1(x, y, z + E) - n1(x, y, z - E)) / (2 * E);
    const d3dx = (n3(x + E, y, z) - n3(x - E, y, z)) / (2 * E);
    const d2dx = (n2(x + E, y, z) - n2(x - E, y, z)) / (2 * E);
    const d1dy = (n1(x, y + E, z) - n1(x, y - E, z)) / (2 * E);
    return out.set(d3dy - d2dz, d1dz - d3dx, d2dx - d1dy);
  }

  /** The bonfire's flow at a world point: noise scrolling upward over time. */
  const FREQ = 2.6;
  function fire(x, y, z, t) {
    return curl(x * FREQ, y * FREQ - t * 1.35, z * FREQ + t * 0.25);
  }

  return { curl, fire, noise };
}
