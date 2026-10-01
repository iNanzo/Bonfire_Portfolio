// The real knight model's pieces for the tests: public/models/knight.glb decoded in Node
// (test/lib/glb.mjs: its meshes are Draco-compressed), so a test can pose the actual plates
// and helmets instead of stand-in boxes.
//
//   const model = await loadKnightMesh();
//   model.nodes.get('K_Shoulder_L')   { name, translation: [x, y, z], parent, children }
//   model.rest('K_Shoulder_L')        its rest place in knight space (the rig has no rest rotations)
//   model.points('K_Shoulder_L')      its piece's vertices in the joint's own space: [x, y, z][]
//   model.surface('K_Helm_Great', s)  points over its triangles about `s` m apart (a surface
//                                     sample: low-poly faces are big, their corners are few)
//   model.triangles(name), .inside(name), .distance(name)   its triangles, a point-inside
//                                     test and the distance to its surface
// Each takes { skip: ['K_Mail'] } to leave out a material's primitives (mail drapes: the
// bascinet's aventail is an open skirt of it, not a solid).
//   model.scene()                     the model as a three.js tree (for createKnights)
import * as THREE from 'three';
import { loadGlb } from './glb.mjs';

export { loadGlb };
const MODEL = new URL('../../public/models/knight.glb', import.meta.url);

let cached = null;

/** The distance from a point to a triangle (Ericson's closest point, by region). */
function triDistance(px, py, pz, A, B, C) {
  const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], ap = [px - A[0], py - A[1], pz - A[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = (s, t) => Math.hypot(A[0] + ab[0] * s + ac[0] * t - px, A[1] + ab[1] * s + ac[1] * t - py, A[2] + ab[2] * s + ac[2] * t - pz);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bp = [px - B[0], py - B[1], pz - B[2]];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cp = [px - C[0], py - C[1], pz - C[2]];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at(1 - w, w); }
  const den = 1 / (va + vb + vc);
  return at(vb * den, vc * den);
}

/** Decode the model once: its node tree and each mesh's positions and triangles. */
export async function loadKnightMesh() {
  if (cached) return cached;
  const { nodes, primitives: decode } = await loadGlb(MODEL);
  const geometries = new Map();
  /** The mesh under a joint: `<joint>_Mesh` (or the node's own). */
  const meshOf = (name) => nodes.get(`${name}_Mesh`)?.mesh ?? nodes.get(name)?.mesh;
  /** A piece's primitives, less those in a skipped material (e.g. mail, which drapes). */
  const prims = (name, skip = []) => { const m = meshOf(name); return m == null ? [] : decode(m).filter((pr) => !skip.includes(pr.material)); };
  cached = {
    nodes,
    has: (name) => nodes.has(name),
    rest(name) {
      const at = [0, 0, 0];
      for (let n = nodes.get(name); n && n.name !== 'Knight'; n = nodes.get(n.parent)) {
        at[0] += n.translation[0]; at[1] += n.translation[1]; at[2] += n.translation[2];
      }
      return at;
    },
    points(name, { skip = [] } = {}) {
      const pts = [];
      for (const { pos } of prims(name, skip)) for (let i = 0; i < pos.length; i += 3) pts.push([pos[i], pos[i + 1], pos[i + 2]]);
      return pts;
    },
    triangles(name, { skip = [] } = {}) {
      const out = [];
      for (const { pos, idx } of prims(name, skip)) {
        for (let f = 0; f < idx.length; f += 3) {
          out.push([0, 1, 2].map((k) => { const a = idx[f + k] * 3; return [pos[a], pos[a + 1], pos[a + 2]]; }));
        }
      }
      return out;
    },
    /**
     * A point-inside test for a piece's closed shells (its own space): the winding number
     * (the solid angle its triangles subtend, over 4π) is 1 inside a shell and 0 outside,
     * and overlapping shells (a raised band over a skull) just add up. Points outside the
     * piece's box (grown by `pad`) are outside without the sum.
     */
    inside(name, { skip = [], pad = 0.005 } = {}) {
      const T = this.triangles(name, { skip });
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const t of T) for (const p of t) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      const flat = new Float64Array(T.length * 9);
      T.forEach((t, i) => t.forEach((p, j) => flat.set(p, i * 9 + j * 3)));
      return (x, y, z) => {
        if (x < lo[0] - pad || y < lo[1] - pad || z < lo[2] - pad || x > hi[0] + pad || y > hi[1] + pad || z > hi[2] + pad) return false;
        let w = 0;
        for (let i = 0; i < flat.length; i += 9) {
          const ax = flat[i] - x, ay = flat[i + 1] - y, az = flat[i + 2] - z;
          const bx = flat[i + 3] - x, by = flat[i + 4] - y, bz = flat[i + 5] - z;
          const cx = flat[i + 6] - x, cy = flat[i + 7] - y, cz = flat[i + 8] - z;
          const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
          const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
          const div = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
          w += 2 * Math.atan2(det, div);
        }
        return Math.abs(w / (4 * Math.PI)) > 0.5;
      };
    },
    /** How far a point is from a piece's surface (its own space; m), over its triangles. */
    distance(name, { skip = [] } = {}) {
      const T = this.triangles(name, { skip });
      return (x, y, z) => {
        let best = Infinity;
        for (const [A, B, C] of T) best = Math.min(best, triDistance(x, y, z, A, B, C));
        return best;
      };
    },
    /**
     * The model as three.js loads it, without a loader: a tree of named groups at their
     * places, each piece's primitives as meshes whose materials carry their names (for
     * createKnights on the real pieces). A new tree each call; the geometry is shared.
     */
    scene() {
      const made = new Map();
      const make = (name) => {
        const n = nodes.get(name);
        const g = new THREE.Group();
        g.name = name;
        g.position.fromArray(n.translation);
        if (n.mesh != null) {
          for (const pr of decode(n.mesh)) {
            let geo = geometries.get(pr);
            if (!geo) {
              geo = new THREE.BufferGeometry();
              geo.setAttribute('position', new THREE.BufferAttribute(pr.pos, 3));
              geo.setIndex(new THREE.BufferAttribute(pr.idx, 1));
              geo.computeVertexNormals();
              geometries.set(pr, geo);
            }
            const mat = new THREE.MeshBasicMaterial();
            mat.name = pr.material;
            g.add(new THREE.Mesh(geo, mat));
          }
        }
        for (const c of n.children) g.add(make(c));
        made.set(name, g);
        return g;
      };
      const root = new THREE.Group();
      root.add(make('Knight'));
      return root;
    },
    surface(name, step = 0.012, { skip = [] } = {}) {
      const pts = [];
      for (const { pos, idx } of prims(name, skip)) {
        for (let f = 0; f < idx.length; f += 3) {
          const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
          const A = [pos[a], pos[a + 1], pos[a + 2]], B = [pos[b], pos[b + 1], pos[b + 2]], C = [pos[c], pos[c + 1], pos[c + 2]];
          const len = Math.max(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]));
          const n = Math.max(1, Math.ceil(len / step));
          for (let i = 0; i <= n; i++) {
            for (let j = 0; j <= n - i; j++) {
              const u = i / n, v = j / n, w = 1 - u - v;
              pts.push([A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v, A[2] * w + B[2] * u + C[2] * v]);
            }
          }
        }
      }
      return pts;
    },
  };
  return cached;
}
