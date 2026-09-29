// Forge lines for the weapon swap, drawn with the shock-ring line material:
//   • helix   — a double helix wrapping the new weapon (two lines, no rungs), one
//               growing from the point up and one from the pommel down, bright
//               heads leading, tapering out at the ends, until they meet as the
//               form completes; the caller closes them in to the blade's width
//   • outline — the new weapon's own silhouette, echoed outward from the blade as
//               it finishes forming: an expanding, noise-wobbled contour in its shape
// Each takes after the element being forged (`style`): fire's lines are smooth and
// shimmer; lightning's crackle (jagged, jumping, broken in flickering gaps); ice's are
// faceted, a hexagonal spiral of straight runs, and its echo's contour is snapped to a
// coarse grid so it reads as cut crystal.
// Both come from one raster of the weapon's side profile (weaponSilhouette), built
// once per weapon: the contour for the echo, a width profile for the helix.
import * as THREE from 'three';
import { createRingLines } from './rings.js';
import { smoothstep, TAU } from '../math.js';

const HELIX_SEGS = 96;
const MAX_OUTLINE = 1200; // contour segments
const HELIX_VERTS = 2 * 2 * HELIX_SEGS * 2; // strands × (lead, trail) × segments × 2
const OUTLINE_VERTS = 2 * MAX_OUTLINE * 2; // (lead, trail) × segments × 2

// Marching squares: corners bl=1, br=2, tr=4, tl=8; edges b=0, r=1, t=2, l=3.
const CASES = [
  [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]],
  [[3, 2]], [[0, 2]], [[0, 1], [3, 2]], [[1, 2]], [[3, 1]], [[0, 1]], [[3, 0]], [],
];

/**
 * The weapon's side profile as a closed contour in its own space: its triangles
 * are projected onto the blade's face plane (the wider of x/z with y), scan-filled
 * into a grid and traced with marching squares. Returns 2D vertices (u across the
 * blade, y along it) with outward normals, segment index pairs, and where the
 * face plane sits, so the contour can be lifted back into 3D.
 */
export function weaponSilhouette(toRoot, cell = 0.014) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const p = new THREE.Vector3();
  const tris = [];
  for (const [o, m] of toRoot) {
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i++) {
      p.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
      tris.push(p.x, p.y, p.z);
      min.min(p); max.max(p);
    }
  }
  const useX = max.x - min.x >= max.z - min.z;
  const uMin = useX ? min.x : min.z, uMax = useX ? max.x : max.z;
  for (;;) {
    const u0 = uMin - cell * 1.5, y0 = min.y - cell * 1.5;
    const cols = Math.ceil((uMax - u0) / cell) + 3;
    const rows = Math.ceil((max.y - y0) / cell) + 3;
    const fill = new Uint8Array(cols * rows);
    // Exact cross-section extents per row: across the blade (u) and through it (depth).
    const ext = { uLo: new Float32Array(rows).fill(Infinity), uHi: new Float32Array(rows).fill(-Infinity), dLo: new Float32Array(rows).fill(Infinity), dHi: new Float32Array(rows).fill(-Infinity) };
    // Conservative scan fill: every cell a triangle's row span touches.
    for (let i = 0; i < tris.length; i += 9) {
      const U = [0, 3, 6].map((k) => tris[i + k + (useX ? 0 : 2)]);
      const Dp = [0, 3, 6].map((k) => tris[i + k + (useX ? 2 : 0)]);
      const Y = [0, 3, 6].map((k) => tris[i + k + 1]);
      const ya = Math.min(...Y), yb = Math.max(...Y);
      for (let r = Math.floor((ya - y0) / cell); r <= Math.floor((yb - y0) / cell); r++) {
        const yc = Math.min(yb - 1e-6, Math.max(ya + 1e-6, y0 + (r + 0.5) * cell));
        let xa = Infinity, xb = -Infinity, da = Infinity, db = -Infinity;
        for (let e = 0; e < 3; e++) {
          const f = (e + 1) % 3;
          if ((Y[e] <= yc) === (Y[f] <= yc)) continue;
          const k = (yc - Y[e]) / (Y[f] - Y[e]);
          const x = U[e] + k * (U[f] - U[e]);
          const d = Dp[e] + k * (Dp[f] - Dp[e]);
          xa = Math.min(xa, x); xb = Math.max(xb, x);
          da = Math.min(da, d); db = Math.max(db, d);
        }
        if (xa > xb) continue;
        ext.uLo[r] = Math.min(ext.uLo[r], xa); ext.uHi[r] = Math.max(ext.uHi[r], xb);
        ext.dLo[r] = Math.min(ext.dLo[r], da); ext.dHi[r] = Math.max(ext.dHi[r], db);
        for (let c = Math.floor((xa - u0) / cell); c <= Math.floor((xb - u0) / cell); c++) fill[r * cols + c] = 1;
      }
    }
    const at = (c, r) => fill[r * cols + c];
    const keyOf = new Map();
    const verts = [];
    const normals = [];
    const segs = [];
    let cu = 0, cy = 0, filled = 0;
    const vertex = (c, r, edge) => {
      const key = edge === 0 ? (r * cols + c) * 2 : edge === 2 ? ((r + 1) * cols + c) * 2 : edge === 3 ? (r * cols + c) * 2 + 1 : (r * cols + c + 1) * 2 + 1;
      let id = keyOf.get(key);
      if (id === undefined) {
        id = verts.length / 2;
        keyOf.set(key, id);
        const gu = edge === 0 || edge === 2 ? c + 1 : edge === 3 ? c + 0.5 : c + 1.5;
        const gy = edge === 3 || edge === 1 ? r + 1 : edge === 0 ? r + 0.5 : r + 1.5;
        verts.push(u0 + gu * cell, y0 + gy * cell);
        normals.push(0, 0);
      }
      return id;
    };
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (at(c, r)) { cu += c; cy += r; filled++; }
        const idx = at(c, r) | (at(c + 1, r) << 1) | (at(c + 1, r + 1) << 2) | (at(c, r + 1) << 3);
        for (const [ea, eb] of CASES[idx]) {
          const a = vertex(c, r, ea), b = vertex(c, r, eb);
          segs.push(a, b);
          // Outward normal: perpendicular to the segment, pointing at an empty corner.
          const dx = verts[b * 2] - verts[a * 2], dy = verts[b * 2 + 1] - verts[a * 2 + 1];
          const len = Math.hypot(dx, dy) || 1;
          let nx = dy / len, ny = -dx / len;
          const mu = (verts[a * 2] + verts[b * 2]) / 2 + nx * cell * 0.5;
          const my = (verts[a * 2 + 1] + verts[b * 2 + 1]) / 2 + ny * cell * 0.5;
          const pc = Math.min(c + 1, Math.max(c, Math.round((mu - u0) / cell - 0.5)));
          const pr = Math.min(r + 1, Math.max(r, Math.round((my - y0) / cell - 0.5)));
          if (at(pc, pr)) { nx = -nx; ny = -ny; }
          normals[a * 2] += nx; normals[a * 2 + 1] += ny;
          normals[b * 2] += nx; normals[b * 2 + 1] += ny;
        }
      }
    }
    if (segs.length / 2 > MAX_OUTLINE) { cell *= 1.3; continue; }
    for (let i = 0; i < normals.length; i += 2) {
      const l = Math.hypot(normals[i], normals[i + 1]) || 1;
      normals[i] /= l; normals[i + 1] /= l;
    }
    return {
      verts: new Float32Array(verts),
      normals: new Float32Array(normals),
      segs: new Uint32Array(segs),
      useX,
      depth: useX ? (min.z + max.z) / 2 : (min.x + max.x) / 2,
      center: [u0 + (cu / filled + 0.5) * cell, y0 + (cy / filled + 0.5) * cell],
      profile: crossSection(ext, rows, y0, cell, useX),
    };
  }
}

const PROFILE = 64;
/**
 * How far the weapon itself reaches from its axis at 64 heights between its point
 * and pommel, along local x and z (its width one way, its thickness the other), from
 * the exact cross-section extents. Lightly blurred and nothing more, so the helix
 * that closes in on it follows the weapon, not a padded outline.
 */
function crossSection(ext, rows, y0, cell, useX) {
  let rLo = rows, rHi = -1;
  for (let r = 0; r < rows; r++) if (ext.uLo[r] <= ext.uHi[r]) { rLo = Math.min(rLo, r); rHi = Math.max(rHi, r); }
  const half = (lo, hi) => {
    const raw = Float32Array.from({ length: PROFILE }, (_, i) => {
      const r = Math.round(rLo + (i / (PROFILE - 1)) * (rHi - rLo));
      return lo[r] <= hi[r] ? Math.max(0, -lo[r], hi[r]) : 0;
    });
    const at = (i) => raw[Math.min(PROFILE - 1, Math.max(0, i))];
    return Float32Array.from({ length: PROFILE }, (_, i) => (at(i - 2) + at(i - 1) + at(i) + at(i + 1) + at(i + 2)) / 5);
  };
  const width = half(ext.uLo, ext.uHi);
  const depth = half(ext.dLo, ext.dHi);
  return { y0: y0 + (rLo + 0.5) * cell, y1: y0 + (rHi + 0.5) * cell, rx: useX ? width : depth, rz: useX ? depth : width };
}

/** A cross-section table (profile.rx / profile.rz) at normalized height s (0 = point, 1 = pommel). */
export function profileAt(table, s) {
  const x = Math.min(1, Math.max(0, s)) * (PROFILE - 1);
  const i = Math.min(PROFILE - 2, Math.floor(x));
  return table[i] + (table[i + 1] - table[i]) * (x - i);
}

const P = new THREE.Vector3();
const C = new THREE.Color();

/** Helix + silhouette-echo lines for the forge, on one draw-ranged line buffer. */
export function createForgeFx(fxMaterial, noise) {
  const buf = createRingLines(fxMaterial, HELIX_VERTS + OUTLINE_VERTS);
  const geo = buf.lines.geometry;
  let v = 0;
  let scratch = new Float32Array(256);

  function put(x, y, z, color, alpha) {
    const ix = v * 3;
    buf.pos[ix] = x; buf.pos[ix + 1] = y; buf.pos[ix + 2] = z;
    buf.col[ix] = color.r; buf.col[ix + 1] = color.g; buf.col[ix + 2] = color.b;
    buf.alpha[v] = alpha;
    v++;
  }

  /**
   * Double helix around the weapon's axis in `matrix` space, from y0 (s = 0, the
   * point) to y1 (s = 1, the pommel). `growth` 0..1: strand one runs from the point
   * up to s = growth, strand two from the pommel down to 1 − growth; each leads
   * with a bright head. Both taper out toward the ends. `radiusX(s)`/`radiusZ(s)`
   * set how far each strand sits from the axis along local x and z (an oval, so it
   * can hug a flat blade); a slow noise drifting along the strands thins them in
   * patches (subtle dithered transparency), with a faster flicker on top.
   */
  function helix({ matrix, y0, y1, spin, turns, growth, alpha, radiusX, radiusZ, lead, trail, head, t, style = 'fire' }) {
    const len = y1 - y0;
    const zap = style === 'lightning';
    const frame = Math.floor(t * 18); // lightning jumps to a new shape ~18 times a second
    const point = (strand, s, lift) => {
      const a = strand * Math.PI + s * turns * TAU + spin;
      let w = 1 + 0.1 * noise.noise3d(s * 5, strand * 7.3, t * 2.4);
      if (zap) w += 0.45 * noise.noise3d(s * 26, strand * 5.1, frame * 1.7);
      return P.set(Math.cos(a) * radiusX(s) * w, y0 + s * len + lift, Math.sin(a) * radiusZ(s) * w).applyMatrix4(matrix);
    };
    const SEGS = style === 'ice' ? Math.round(turns * 6) : HELIX_SEGS; // ice: six straight runs a turn, a hexagonal spiral
    for (let strand = 0; strand < 2; strand++) {
      const headS = strand ? 1 - growth : growth;
      for (let sub = 0; sub < 2; sub++) {
        for (let i = 0; i < SEGS; i++) {
          let s0 = i / SEGS, s1 = (i + 1) / SEGS;
          // Lightning breaks into flickering gaps.
          const gap = zap && noise.noise3d(i * 0.31, strand * 3.7 + sub, frame * 2.3) > 0.42;
          if (strand === 0) { if (s0 >= growth) break; s1 = Math.min(s1, growth); }
          else { if (s1 <= 1 - growth) continue; s0 = Math.max(s0, 1 - growth); }
          for (const s of [s0, s1]) {
            const nearHead = Math.abs(s - headS) < 0.05 && growth < 1;
            const taper = smoothstep(0, 0.16, s) * smoothstep(0, 0.16, 1 - s);
            const drift = 0.5 + 0.5 * noise.noise3d(s * 6 - t * 1.8, strand * 4.1 + sub * 1.3, t * 0.9);
            const flick = noise.noise3d(s * 9 + strand * 3, 1.7, t * 6);
            const body = (sub ? 0.55 : 1) * (0.55 + 0.45 * drift) * (0.88 + 0.12 * flick);
            C.copy(nearHead ? head : sub ? trail : lead);
            point(strand, s, sub * 0.022);
            put(P.x, P.y, P.z, C, gap ? 0 : alpha * taper * (nearHead ? 1 : body));
          }
        }
      }
    }
  }

  /**
   * The silhouette `sil`, pushed out along its normals by `dilate` and scaled about its center.
   * `facet` (m, 0: none) snaps the contour to a grid that coarse: cut crystal.
   */
  function outline({ sil, matrix, dilate, scale, wobble, alpha, lead, trail, hot, t, seed, facet = 0 }) {
    const { verts, normals, segs, useX, depth, center } = sil;
    const nv = verts.length / 2;
    if (scratch.length < nv) scratch = new Float32Array(nv);
    for (let i = 0; i < nv; i++) scratch[i] = noise.noise3d(verts[i * 2] * 6 + seed, verts[i * 2 + 1] * 6, t * 3);
    for (let sub = 0; sub < 2; sub++) {
      const d0 = dilate - sub * 0.012;
      for (let k = 0; k < segs.length; k++) {
        const i = segs[k];
        const n = scratch[i];
        const d = d0 + n * wobble;
        let pu = center[0] + (verts[i * 2] - center[0]) * scale + normals[i * 2] * d;
        let py = center[1] + (verts[i * 2 + 1] - center[1]) * scale + normals[i * 2 + 1] * d;
        if (facet) { pu = Math.round(pu / facet) * facet; py = Math.round(py / facet) * facet; }
        P.set(useX ? pu : depth, py, useX ? depth : pu).applyMatrix4(matrix);
        C.copy(!sub && n > 0.5 ? hot : sub ? trail : lead);
        put(P.x, P.y, P.z, C, alpha * (sub ? 0.55 : 1) * (0.6 + 0.2 * (n + 1)));
      }
    }
  }

  return {
    lines: buf.lines,
    begin() { v = 0; },
    helix,
    outline,
    end() {
      geo.setDrawRange(0, v);
      if (v) buf.commit();
    },
    clear() { v = 0; geo.setDrawRange(0, 0); },
  };
}
