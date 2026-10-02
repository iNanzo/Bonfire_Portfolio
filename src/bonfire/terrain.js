// Height map of the clearing, rendered once from straight above when the model
// loads. The fireflies use it to steer over and around the pillar, wall, stones
// and logs (and never pass through them), and to find vertical faces to land on.
import * as THREE from 'three';

const MAX_H = 4; // heights are packed into 16 bits over [0, MAX_H] m

const vertexShader = /* glsl */ `
  varying float vY;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vY = w.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const fragmentShader = /* glsl */ `
  varying float vY;
  void main() {
    float v = floor(clamp(vY / ${MAX_H.toFixed(1)}, 0.0, 1.0) * 65535.0 + 0.5);
    gl_FragColor = vec4(floor(v / 256.0) / 255.0, mod(v, 256.0) / 255.0, 0.0, 1.0);
  }
`;

/**
 * The material the heights are drawn with. A scene that makes several height maps (one per
 * scenery) keeps one and passes it to each createTerrain: its shader is then built once, not
 * again for every map (a new material each time, freed after, took its program with it).
 */
export function createTerrainMaterial() {
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader, side: THREE.DoubleSide });
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Mesh[]} meshes  solid scenery (world matrices up to date)
 * @param {object} o
 * @param {number} o.size   side of the square area covered, centered on the origin (m)
 * @param {number} o.res    height map resolution (cells per side)
 * @param {number} o.pad    cells to grow obstacles by for flight clearance
 * @param {THREE.ShaderMaterial} [o.material]  createTerrainMaterial(), kept by the caller (one is made and freed here without it)
 */
export function createTerrain(renderer, meshes, { size = 12, res = 320, pad = 2, material: shared = null } = {}) {
  const half = size / 2;
  const cell = size / res;

  // --- render heights from above
  const scene = new THREE.Scene();
  const material = shared ?? createTerrainMaterial();
  for (const m of meshes) {
    const c = new THREE.Mesh(m.geometry, material);
    c.matrixAutoUpdate = false;
    c.matrix.copy(m.matrixWorld);
    scene.add(c);
  }
  scene.updateMatrixWorld(true);
  // Screen right = +x, screen up = -z.
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 30);
  cam.position.set(0, 12, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const rt = new THREE.WebGLRenderTarget(res, res, { depthBuffer: true });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(res * res * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, res, res, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  if (!shared) material.dispose();

  // H: raw heights (row 0 = +z edge). D: heights grown by `pad` cells.
  const H = new Float32Array(res * res);
  for (let k = 0; k < res * res; k++) H[k] = ((px[k * 4] * 256 + px[k * 4 + 1]) / 65535) * MAX_H;
  const rowMax = new Float32Array(res * res);
  const D = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      let m = 0;
      for (let a = Math.max(0, i - pad); a <= Math.min(res - 1, i + pad); a++) m = Math.max(m, H[j * res + a]);
      rowMax[j * res + i] = m;
    }
  }
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      let m = 0;
      for (let b = Math.max(0, j - pad); b <= Math.min(res - 1, j + pad); b++) m = Math.max(m, rowMax[b * res + i]);
      D[j * res + i] = m;
    }
  }

  const ci = (x) => Math.floor((x + half) / cell);
  const cj = (z) => Math.floor((half - z) / cell);
  const at = (A, i, j) => (i < 0 || j < 0 || i >= res || j >= res ? 0 : A[j * res + i]);

  /** Raw surface height under (x, z), bilinear. */
  function height(x, z) {
    const fx = (x + half) / cell - 0.5;
    const fz = (half - z) / cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    return (at(H, i, j) * (1 - u) + at(H, i + 1, j) * u) * (1 - v)
      + (at(H, i, j + 1) * (1 - u) + at(H, i + 1, j + 1) * u) * v;
  }
  /** Raw surface height of the cell under (x, z) — steps stay sharp. */
  const top = (x, z) => at(H, ci(x), cj(z));
  /** Height grown by the clearance margin — what flight must stay above. */
  const solid = (x, z) => at(D, ci(x), cj(z));
  /** Uphill direction of the raw heights around (x, z) (world x/z, unnormalized). */
  function slope(x, z, out) {
    const i = ci(x), j = cj(z);
    const gx = (at(H, i + 2, j) - at(H, i - 2, j)) + 0.5 * (at(H, i + 2, j - 1) - at(H, i - 2, j - 1) + at(H, i + 2, j + 1) - at(H, i - 2, j + 1));
    const gz = (at(H, i, j - 2) - at(H, i, j + 2)) + 0.5 * (at(H, i - 1, j - 2) - at(H, i - 1, j + 2) + at(H, i + 1, j - 2) - at(H, i + 1, j + 2));
    return out.set(gx, 0, gz);
  }

  // --- vertical faces worth landing on: steps of 25 cm or more
  const wallSpots = [];
  const g = new THREE.Vector3();
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let j = 1; j < res - 1; j++) {
    for (let i = 1; i < res - 1; i++) {
      const h = H[j * res + i];
      if (h < 0.3) continue;
      for (const [di, dj] of N4) {
        const lo = H[(j + dj) * res + i + di];
        if (h - lo < 0.25) continue;
        const x = -half + (i + 0.5 + di * 0.5) * cell;
        const z = half - (j + 0.5 + dj * 0.5) * cell;
        // outward normal: downhill, but always toward the low side
        slope(x, z, g).negate();
        const ox = di, oz = -dj;
        if (g.lengthSq() < 1e-6 || (g.x * ox + g.z * oz) / g.length() < 0.35) g.set(ox, 0, oz);
        g.normalize();
        wallSpots.push({ x, z, lo, hi: h, nx: g.x, nz: g.z });
      }
    }
  }

  return { height, top, solid, slope, wallSpots, cell };
}
