// The knight's model made ready to draw and to check (knights.js builds his knights from it):
// its pieces merged into one rigidly skinned body and a mesh for each helmet, each vertex with
// its bone, its armor role, its plate, its smooth surface, its patch and how buried it is (the
// pixel styles: armor.js), and the points he's checked at against the scenery (probesOf). A
// template is built a step at a time (templateSteps), so the page can spread it over idle
// moments.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roleOf } from './armor.js';
import { BONES, BONE_NODES, PARENT, DEFAULT_REST, measurePlates } from './knightPose.js';

export const HELMETS = ['great', 'armet', 'bascinet'];
const HELM_NODES = { great: 'K_Helm_Great', armet: 'K_Helm_Armet', bascinet: 'K_Helm_Bascinet' };
export const ALL_BONES = [...BONES, ...HELMETS.map((h) => 'helm_' + h)];
const NODE_BONE = Object.fromEntries([
  ...Object.entries(BONE_NODES).map(([b, n]) => [n, b]),
  ...HELMETS.map((h) => [HELM_NODES[h], 'helm_' + h]),
]);
export const BONE_INDEX = Object.fromEntries(ALL_BONES.map((b, i) => [b, i]));
export const PARENT_ALL = { ...PARENT, ...Object.fromEntries(HELMETS.map((h) => ['helm_' + h, 'head'])) };

// The pieces that swing with the arm (the pauldron's lames, the arm, the gauntlet; not the
// dome, which stays on the shoulder). Each is checked at its farthest points in PROBE_DIRS
// (the 26 ways out of a cube) and at a point of its surface in every PROBE_CELL (m) it
// touches (GAUNTLET_CELL for the hand and fingers: small pieces, near what they reach for).
export const ARM = ['pauldron', 'upperArm', 'forearm', 'hand', 'fingers'];
const PROBE_DIRS = [-1, 0, 1]
  .flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => [x, y, z])))
  .filter((d) => d.some(Boolean));
const PROBE_CELL = 0.03;
const GAUNTLET_CELL = 0.02;
// (Each piece's points are kept in clumps PROBE_CLUMP (m) across, each with the ball round it:
// a clump whose ball can't come as near a shape as what's asked about is passed over whole.)
const PROBE_CLUMP = 0.06;
// At home, his body (all but those arm pieces, his helmet with it) is checked too, and his
// arms again once they're turned: whatever of him would still come nearer a shape near him
// than DEPTH (m; below 0, that far in) eases back toward his resting pose there, as little as
// keeps it out (a seated Praise arching back into a standing stone, a fist pumped into the
// stone at his side).
const BODY = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'shoulderR',
  'tassetL',
  'tassetR',
  'thighL',
  'thighR',
  'shinL',
  'shinR',
  'footL',
  'footR',
];
// (Which part of him each piece is, as the ease has them (PART_OF): his back, head and helmet
// 0, his left arm 1, his right 2, his hips and legs 3. The pauldrons' domes ride up and out
// with their arm's swing and lean with his back: one in eases his lean back first (a seated
// Praise arching back into a standing stone keeps its arms up), its arm only if that isn't
// enough (DOME_OF).)
const PART_OF_PIECE = { hips: 3, tassetL: 3, tassetR: 3, thighL: 3, thighR: 3, shinL: 3, shinR: 3, footL: 3, footR: 3 };
const DOME_OF = { shoulderL: 1, shoulderR: 2 };
// (Its points are a few centimetres apart: kept 5 mm out, no point between them goes in far.)
export const DEPTH = 0.005;
// (His boots and shins rest on what's under them, the ground or a seat's edge: 1 cm in.)
const RESTING = new Set(['shinL', 'shinR', 'footL', 'footR']);
const DEPTH_RESTING = -0.01;

/**
 * Each plate's id (`aPiece`, 0..1 per vertex, armor.js: each plate a touch lighter or darker
 * than its neighbours): the connected parts of each joint's geometry, welded by position
 * across its materials (a plate and its raised rim are one part; two lames that only
 * overlap are two), a well-spread value from where each part sits. A step (yield) a joint.
 * @param {[string, THREE.BufferGeometry][]} list  [bone, non-indexed geometry] pairs
 */
function* markPlates(list) {
  const byBone = new Map();
  for (const [bone, g] of list) byBone.set(bone, [...(byBone.get(bone) ?? []), g]);
  for (const geos of byBone.values()) {
    const ids = new Map(); // welded position -> vertex id
    const parent = [];
    const find = (a) => {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    };
    const at = geos.map((g) => {
      const p = g.attributes.position;
      const out = new Int32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        const key = `${Math.round(p.getX(i) * 500)},${Math.round(p.getY(i) * 500)},${Math.round(p.getZ(i) * 500)}`;
        let id = ids.get(key);
        if (id === undefined) {
          id = parent.length;
          parent.push(id);
          ids.set(key, id);
        }
        out[i] = id;
      }
      for (let i = 0; i + 2 < p.count; i += 3) {
        const a = find(out[i]);
        for (const j of [out[i + 1], out[i + 2]]) {
          const b = find(j);
          if (b !== a) parent[b] = a;
        }
      }
      return out;
    });
    // (Each part's value from its centre: the same model always gets the same plates.)
    const sums = new Map();
    geos.forEach((g, k) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const r = find(at[k][i]);
        const s = sums.get(r) ?? [0, 0, 0, 0];
        s[0] += p.getX(i);
        s[1] += p.getY(i);
        s[2] += p.getZ(i);
        s[3]++;
        sums.set(r, s);
      }
    });
    const value = new Map(
      [...sums].map(([r, [x, y, z, n]]) => {
        const h = Math.sin((x / n) * 127.1 + (y / n) * 311.7 + (z / n) * 74.7) * 43758.5453;
        return [r, h - Math.floor(h)];
      }),
    );
    geos.forEach((g, k) => {
      const v = new Float32Array(g.attributes.position.count);
      for (let i = 0; i < v.length; i++) v[i] = value.get(find(at[k][i]));
      g.setAttribute('aPiece', new THREE.Float32BufferAttribute(v, 1));
    });
    yield;
  }
}

// A plate turns less than this across an edge: one smooth surface there (the pixel styles; the
// model's facets bend up to ~60° round a curve, its creases and box edges 70° and more).
const SMOOTH_COS = Math.cos((64 * Math.PI) / 180);
// How close two corners are to be the same point (Draco quantizes each material's positions
// on its own grid, so a plate's corners in two materials can be a hair apart).
const WELD = 0.0012;
// How far a smooth surface's corners on its crease turn toward the surface across it: every
// plate shades as a rounded shape (a flat crown rolls toward the fire at its front and away
// at its back), not a flat one with a hard band across it.
const PILLOW = 0.55;
// A surface this slight (m, twice its area over its perimeter: a strip's width, half a
// square's side) has a neighbour it merges into when it's small on screen (armor.js: no line
// between a finger's faces, a fauld's hoops, a visor's breaths), and how near that
// neighbour's corners must come (m): the pieces beside it, not only those it's welded to.
const MERGE_SIZE = 0.07;
const MERGE_NEAR = 0.02;
// (A grid cell's key, from its three integer coordinates: a hash; two cells sharing one only
// share a bucket, every lookup checks the distance.)
const cellKey = (x, y, z) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0;
const push = (map, key, v) => {
  const l = map.get(key);
  if (l) l.push(v);
  else map.set(key, [v]);
};

/**
 * Each plate's smooth surfaces, for the pixel styles (armor.js): the faces of each joint's
 * pieces (welded by position across their materials) joined across every edge where they
 * turn less than 64°, each such surface a patch. Per corner:
 *   aSmooth  its normal averaged (by area) over its patch's faces round that corner, and at
 *            a crease turned a little toward the patches beyond (PILLOW), so a curved plate
 *            shades as one smooth, rounded surface and its edges roll
 *   aPatchN  the patch's own mean normal (the fire flashes in a plate as a whole)
 *   aPatch   x the patch's id, 0..63, different from every patch it touches (the pass draws a
 *            line wherever two ids meet on screen: every plate edge, crease and overlap; the
 *            ids start at a different place for each joint, so plates that only overlap
 *            rarely share one); y the id it takes when it's small on screen (a slight patch:
 *            the biggest one's of its joint's patches it merges with; else its own); z its
 *            size (m, MERGE_SIZE); w how flat it is (its face normals summed by area, over
 *            its area: 1 a flat plate, ~0.5 a pauldron's dome, ~0 a ring round a limb: the
 *            pixel styles shade a plate that isn't a ring across itself, armor.js)
 * A step (yield) a joint, and one for the merges.
 * @param {[string, THREE.BufferGeometry][]} list  [bone, non-indexed geometry] pairs
 */
function* markPatches(list) {
  const byBone = new Map();
  for (const [bone, g] of list) push(byBone, bone, g);
  let boneNo = 0;
  const all = []; // every patch: { bone, id, area, size, flat, pts: [x, y, z, ...], faces }
  for (const [bone, geos] of byBone) {
    // Weld the corners: a grid of cells, each point matched to one within WELD nearby.
    const cells = new Map();
    const pts = [];
    const weld = (x, y, z) => {
      const cx = Math.floor(x / (WELD * 2)),
        cy = Math.floor(y / (WELD * 2)),
        cz = Math.floor(z / (WELD * 2));
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            for (const i of cells.get(cellKey(cx + dx, cy + dy, cz + dz)) ?? []) {
              if (
                Math.abs(pts[i * 3] - x) < WELD &&
                Math.abs(pts[i * 3 + 1] - y) < WELD &&
                Math.abs(pts[i * 3 + 2] - z) < WELD
              )
                return i;
            }
          }
      const i = pts.length / 3;
      pts.push(x, y, z);
      push(cells, cellKey(cx, cy, cz), i);
      return i;
    };
    // Every face: its welded corners and its normal (length: twice its area).
    const faces = []; // { g, i (first corner), v: [a, b, c], n: [x, y, z], len }
    for (const g of geos) {
      const p = g.attributes.position;
      for (let i = 0; i + 2 < p.count; i += 3) {
        const v = [
          weld(p.getX(i), p.getY(i), p.getZ(i)),
          weld(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)),
          weld(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)),
        ];
        const ax = p.getX(i + 1) - p.getX(i),
          ay = p.getY(i + 1) - p.getY(i),
          az = p.getZ(i + 1) - p.getZ(i);
        const bx = p.getX(i + 2) - p.getX(i),
          by = p.getY(i + 2) - p.getY(i),
          bz = p.getZ(i + 2) - p.getZ(i);
        const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
        faces.push({ g, i, v, n, len: Math.hypot(n[0], n[1], n[2]) });
      }
    }
    const M = pts.length / 3 + 1; // (a pair of corners, or a patch and a corner, as one number)
    // Faces meeting across an edge at less than the smooth angle are one surface.
    const parent = faces.map((_, f) => f);
    const find = (a) => {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    };
    const edges = new Map(); // corner pair -> faces
    faces.forEach((f, fi) => {
      for (let e = 0; e < 3; e++) {
        const a = f.v[e],
          b = f.v[(e + 1) % 3];
        if (a !== b) push(edges, a < b ? a * M + b : b * M + a, fi);
      }
    });
    for (const fs of edges.values()) {
      if (fs.length !== 2) continue;
      const f = faces[fs[0]],
        g = faces[fs[1]];
      if (f.len < 1e-12 || g.len < 1e-12) continue;
      if ((f.n[0] * g.n[0] + f.n[1] * g.n[1] + f.n[2] * g.n[2]) / (f.len * g.len) > SMOOTH_COS) {
        const a = find(fs[0]),
          b = find(fs[1]);
        if (a !== b) parent[b] = a;
      }
    }
    // Each patch: its area, perimeter (the edges it doesn't share with itself) and mean normal.
    const patch = new Map(); // root -> { area, perim, n: [x, y, z], corners: Set, faces: [] }
    faces.forEach((f, fi) => {
      const r = find(fi);
      let P = patch.get(r);
      if (!P) patch.set(r, (P = { area: 0, perim: 0, n: [0, 0, 0], corners: new Set(), faces: [] }));
      P.area += f.len / 2;
      for (let k = 0; k < 3; k++) P.n[k] += f.n[k];
      for (const v of f.v) P.corners.add(v);
      P.faces.push(f);
    });
    for (const [key, fs] of edges) {
      const a = Math.floor(key / M),
        b = key % M;
      const l = Math.hypot(pts[a * 3] - pts[b * 3], pts[a * 3 + 1] - pts[b * 3 + 1], pts[a * 3 + 2] - pts[b * 3 + 2]);
      const roots = fs.map(find);
      for (const r of new Set(roots)) if (roots.filter((x) => x === r).length < 2) patch.get(r).perim += l;
    }
    // Each corner's smooth normal: its patch's faces round it, summed (by area)...
    const sums = new Map(); // patch * M + corner -> [x, y, z]
    faces.forEach((f, fi) => {
      const r = find(fi);
      for (const v of f.v) {
        const s = sums.get(r * M + v);
        if (s) {
          s[0] += f.n[0];
          s[1] += f.n[1];
          s[2] += f.n[2];
        } else sums.set(r * M + v, [...f.n]);
      }
    });
    const unit = (s) => {
      const l = Math.hypot(s[0], s[1], s[2]);
      return l > 1e-12 ? [s[0] / l, s[1] / l, s[2] / l] : null;
    };
    // ...and at a crease, turned toward the patches across it (PILLOW).
    const touching = new Map(); // welded corner -> patches there
    for (const [r, P] of patch) for (const v of P.corners) push(touching, v, r);
    const smooth = new Map();
    for (const [key, s] of sums) {
      const r = Math.floor(key / M),
        v = key % M;
      const own = unit(s);
      if (!own) continue;
      const out = [...own];
      for (const o of touching.get(v)) {
        if (o === r) continue;
        const n = unit(sums.get(o * M + v));
        if (n) for (let k = 0; k < 3; k++) out[k] += PILLOW * n[k];
      }
      smooth.set(key, unit(out) ?? own);
    }
    // Each patch's id: the first not taken by a patch it touches (sharing a corner).
    const ids = new Map();
    const start = (boneNo++ * 23) % 64;
    let order = 0;
    faces.forEach((f, fi) => {
      const r = find(fi);
      if (ids.has(r)) return;
      const taken = new Set();
      for (const v of patch.get(r).corners) for (const o of touching.get(v)) if (ids.has(o)) taken.add(ids.get(o));
      let id = (start + order++ * 11) % 64;
      for (let k = 0; k < 64 && taken.has(id); k++) id = (id + 1) % 64;
      ids.set(r, id);
    });
    // Onto the corners (the merge ids come once every joint's patches are known).
    for (const g of geos) {
      const n = g.attributes.position.count;
      g.setAttribute('aSmooth', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aPatchN', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aPatch', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 4));
    }
    for (const [r, P] of patch) {
      const mean = unit(P.n) ?? [0, 1, 0];
      const size = P.perim > 1e-9 ? (2 * P.area) / P.perim : Math.sqrt(P.area);
      // (How flat it is: its faces' normals summed by area over its area; 1 a flat plate,
      // about 0.5 a dome, near 0 a ring round a limb.)
      const flat = P.area > 1e-12 ? Math.min(1, Math.hypot(P.n[0], P.n[1], P.n[2]) / (2 * P.area)) : 1;
      const rec = { bone, id: ids.get(r), area: P.area, size, flat, pts: [], faces: P.faces };
      for (const v of P.corners) rec.pts.push(pts[v * 3], pts[v * 3 + 1], pts[v * 3 + 2]);
      for (const f of P.faces) {
        const sm = f.g.attributes.aSmooth,
          pn = f.g.attributes.aPatchN;
        f.v.forEach((v, k) => {
          const n = smooth.get(r * M + v) ?? (f.len > 1e-12 ? f.n.map((c) => c / f.len) : [0, 1, 0]);
          sm.setXYZ(f.i + k, n[0], n[1], n[2]);
          pn.setXYZ(f.i + k, mean[0], mean[1], mean[2]);
        });
      }
      all.push(rec);
    }
    yield;
  }
  // The merges: each slight patch joins the biggest patch of its joint whose corners come
  // near its own; a group of them takes its biggest one's id.
  const near = new Map(); // grid cell -> patches with a corner there
  const cell = (c) => Math.floor(c / MERGE_NEAR);
  all.forEach((P, pi) => {
    for (let j = 0; j < P.pts.length; j += 3) {
      const key = cellKey(cell(P.pts[j]), cell(P.pts[j + 1]), cell(P.pts[j + 2]));
      const l = near.get(key);
      if (!l) near.set(key, [pi]);
      else if (l[l.length - 1] !== pi) l.push(pi);
    }
  });
  const up = all.map((_, i) => i);
  const top = (a) => {
    while (up[a] !== a) {
      up[a] = up[up[a]];
      a = up[a];
    }
    return a;
  };
  all.forEach((P, pi) => {
    if (P.size >= MERGE_SIZE) return;
    let best = -1;
    for (let j = 0; j < P.pts.length; j += 3) {
      const x = P.pts[j],
        y = P.pts[j + 1],
        z = P.pts[j + 2];
      const cx = cell(x),
        cy = cell(y),
        cz = cell(z);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            for (const o of near.get(cellKey(cx + dx, cy + dy, cz + dz)) ?? []) {
              const Q = all[o];
              if (o === pi || Q.bone !== P.bone || (best >= 0 && Q.area <= all[best].area)) continue;
              for (let q = 0; q < Q.pts.length; q += 3) {
                if (Math.hypot(Q.pts[q] - x, Q.pts[q + 1] - y, Q.pts[q + 2] - z) < MERGE_NEAR) {
                  best = o;
                  break;
                }
              }
            }
          }
    }
    if (best >= 0) {
      const a = top(pi),
        b = top(best);
      if (a !== b) up[a] = b;
    }
  });
  const biggest = new Map(); // group root -> its biggest patch
  all.forEach((P, pi) => {
    const r = top(pi);
    if (!biggest.has(r) || all[biggest.get(r)].area < P.area) biggest.set(r, pi);
  });
  all.forEach((P, pi) => {
    const merge = all[biggest.get(top(pi))].id;
    for (const f of P.faces)
      for (let k = 0; k < 3; k++) f.g.attributes.aPatch.setXYZW(f.i + k, P.id, merge, P.size, P.flat);
  });
}

// Occlusion (the pixel styles): the model voxelized at VOX (m); from each corner, OCC_DIRS
// rays over its smooth normal's side, from OCC_FROM out to OCC_REACH (m), a hit counting
// the more the nearer it is.
const VOX = 0.015;
const OCC_FROM = 0.02;
const OCC_REACH = 0.1;
// (Cosine-weighted directions round +z: a spiral, the same every time; x, y, z each.)
const OCC_DIRS = Float32Array.from({ length: 12 * 3 }, (_, k) => {
  const i = Math.floor(k / 3),
    r = Math.sqrt((i + 0.5) / 12),
    a = i * 2.39996323;
  return [r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - r * r)][k % 3];
});

/**
 * How buried each corner is (`aOcc`, 0 open .. 1 buried: the pixel styles keep the fire out
 * of it and darken it; armor.js): the rays from it over its side of the plate that meet the
 * knight close by (under the helm, beneath the pauldrons, where plates overlap, between the
 * legs). Measured in the rest pose, so only against the pieces that stay put relative to
 * it: its own joint, its parent, its children and its siblings; the helmets count as the
 * head (the great helm for the body's own), a helmet against the head and the neck. A step
 * (yield) every few pieces voxelized, and every piece's rays.
 * @param {[string, THREE.BufferGeometry][]} list  [bone, non-indexed geometry] pairs (with aSmooth)
 */
function* markOcclusion(list) {
  const box = new THREE.Box3();
  for (const [, g] of list) {
    g.computeBoundingBox();
    box.union(g.boundingBox);
  }
  box.expandByScalar(OCC_REACH + VOX);
  const ox = box.min.x,
    oy = box.min.y,
    oz = box.min.z;
  const nx = Math.ceil((box.max.x - ox) / VOX),
    ny = Math.ceil((box.max.y - oy) / VOX),
    nz = Math.ceil((box.max.z - oz) / VOX);
  // Two occupants a cell (the joint's index + 1); a third (at a joint) is left out.
  const cellA = new Uint8Array(nx * ny * nz),
    cellB = new Uint8Array(nx * ny * nz);
  const cellAt = (x, y, z) => {
    const i = Math.floor((x - ox) / VOX),
      j = Math.floor((y - oy) / VOX),
      k = Math.floor((z - oz) / VOX);
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : (k * ny + j) * nx + i;
  };
  const boneNo = (b) => BONE_INDEX[b] + 1;
  let piece = 0;
  for (const [bone, g] of list) {
    if (++piece % 8 === 0) yield;
    const p = g.attributes.position.array;
    const b = boneNo(bone);
    for (let i = 0; i + 8 < p.length; i += 9) {
      const ax = p[i],
        ay = p[i + 1],
        az = p[i + 2];
      const ux = p[i + 3] - ax,
        uy = p[i + 4] - ay,
        uz = p[i + 5] - az,
        wx = p[i + 6] - ax,
        wy = p[i + 7] - ay,
        wz = p[i + 8] - az;
      const steps = Math.max(1, Math.ceil(Math.max(Math.hypot(ux, uy, uz), Math.hypot(wx, wy, wz)) / (VOX * 0.8)));
      for (let s = 0; s <= steps; s++)
        for (let t = 0; t <= steps - s; t++) {
          const c = cellAt(
            ax + (ux * s + wx * t) / steps,
            ay + (uy * s + wy * t) / steps,
            az + (uz * s + wz * t) / steps,
          );
          if (c < 0 || cellA[c] === b || cellB[c] === b) continue;
          if (!cellA[c]) cellA[c] = b;
          else if (!cellB[c]) cellB[c] = b;
        }
    }
  }
  // Who can bury whom.
  const kin = (bone) => {
    const par = PARENT_ALL[bone];
    const out = new Set([bone, par]);
    for (const b of ALL_BONES) if (PARENT_ALL[b] === bone || (par && PARENT_ALL[b] === par)) out.add(b);
    const helm = bone.startsWith('helm_');
    if (helm) out.add('neck');
    else if (out.has('head')) out.add('helm_great');
    for (const h of HELMETS)
      if (out.has('helm_' + h) && 'helm_' + h !== bone && (helm || h !== 'great')) out.delete('helm_' + h);
    const mask = new Uint8Array(ALL_BONES.length + 1);
    for (const b of out) if (b && BONE_INDEX[b] !== undefined) mask[boneNo(b)] = 1;
    return mask;
  };
  const seen = new Map(); // (a hash of the corner and its normal) -> its occlusion
  const n3 = OCC_DIRS.length / 3,
    step = VOX * 0.7;
  for (const [bone, g] of list) {
    const mask = kin(bone);
    const p = g.attributes.position.array,
      sm = g.attributes.aSmooth.array;
    const occ = new Float32Array(p.length / 3);
    for (let v = 0; v < occ.length; v++) {
      const x = p[v * 3],
        y = p[v * 3 + 1],
        z = p[v * 3 + 2],
        nX = sm[v * 3],
        nY = sm[v * 3 + 1],
        nZ = sm[v * 3 + 2];
      const key =
        (cellKey(Math.round(x * 2000), Math.round(y * 2000), Math.round(z * 2000)) ^
          (cellKey(Math.round(nX * 50), Math.round(nY * 50) + 7, Math.round(nZ * 50) + 13) * 31) ^
          boneNo(bone)) |
        0;
      const had = seen.get(key);
      if (had !== undefined) {
        occ[v] = had;
        continue;
      }
      // (A frame round the normal.)
      const hx = Math.abs(nY) < 0.9 ? 0 : 1,
        hy = 1 - hx;
      let tx = hy * nZ,
        ty = -hx * nZ,
        tz = hx * nY - hy * nX;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      const bx = nY * tz - nZ * ty,
        by = nZ * tx - nX * tz,
        bz = nX * ty - nY * tx;
      let hits = 0;
      for (let r = 0; r < n3; r++) {
        const a = OCC_DIRS[r * 3],
          b = OCC_DIRS[r * 3 + 1],
          c = OCC_DIRS[r * 3 + 2];
        const dx = tx * a + bx * b + nX * c,
          dy = ty * a + by * b + nY * c,
          dz = tz * a + bz * b + nZ * c;
        for (let t = OCC_FROM; t <= OCC_REACH; t += step) {
          const q = cellAt(x + dx * t, y + dy * t, z + dz * t);
          if (q >= 0 && (mask[cellA[q]] || mask[cellB[q]])) {
            hits += 1 - (t - OCC_FROM) / (OCC_REACH - OCC_FROM);
            break;
          }
        }
      }
      occ[v] = hits / n3;
      seen.set(key, occ[v]);
    }
    g.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
    yield;
  }
}

/**
 * The model's pieces, merged: the body's and each helmet's geometry in rest space, with bone,
 * role and plate per vertex (a template: createKnights builds his knights from it). A step at
 * a time: a generator that yields between its parts (each joint's plates and surfaces, the
 * occlusion's pieces: tens of ms in all on a desktop, several times that on a phone), so the
 * caller can spread it over idle moments (scene.js); its return value is the template
 * (`root`: the model it's from). buildTemplate() runs it through at once.
 * @param {THREE.Object3D} gltfRoot  a knight model's loaded scene
 */
export function* templateSteps(gltfRoot) {
  const knight = gltfRoot.getObjectByName('Knight') ?? gltfRoot.getObjectByName('K_Hips')?.parent ?? null;
  if (!knight) throw new Error('Model is missing required node: Knight');
  if (!knight.getObjectByName('K_Hips')) throw new Error('Model is missing required node: K_Hips');
  knight.updateMatrixWorld(true);
  const toKnight = knight.matrixWorld.clone().invert();
  const restPos = {};
  const restQuat = {};
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3(),
    quat = new THREE.Quaternion(),
    scl = new THREE.Vector3();
  knight.traverse((o) => {
    const b = NODE_BONE[o.name];
    if (!b) return;
    m.multiplyMatrices(toKnight, o.matrixWorld).decompose(pos, quat, scl);
    restPos[b] = pos.toArray();
    restQuat[b] = quat.clone();
  });
  for (const b of ALL_BONES) {
    if (restPos[b]) continue;
    // (A joint the model lacks: the default place, or a helmet on the head.)
    restPos[b] = b.startsWith('helm_') ? (restPos.head ?? DEFAULT_REST.head) : DEFAULT_REST[b];
    restQuat[b] = new THREE.Quaternion();
  }
  const body = [];
  const helm = Object.fromEntries(HELMETS.map((h) => ['helm_' + h, []]));
  const pieces = []; // [bone, geometry] (for markPlates)
  knight.traverse((o) => {
    if (!o.isMesh) return;
    let j = o;
    while (j && j !== knight && !NODE_BONE[j.name]) j = j.parent;
    const bone = j && NODE_BONE[j.name];
    if (!bone) return;
    const src = o.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone());
    if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(m.multiplyMatrices(toKnight, o.matrixWorld));
    if (!g.attributes.normal) g.computeVertexNormals();
    const flat = g.index ? g.toNonIndexed() : g;
    const n = flat.attributes.position.count;
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const aRole = new Float32Array(n).fill(roleOf([o.material].flat()[0]?.name ?? ''));
    for (let i = 0; i < n; i++) {
      skinIndex[i * 4] = BONE_INDEX[bone];
      skinWeight[i * 4] = 1;
    }
    flat.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    flat.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    flat.setAttribute('aRole', new THREE.Float32BufferAttribute(aRole, 1));
    (helm[bone] ?? body).push(flat);
    pieces.push([bone, flat]);
  });
  if (!body.length) throw new Error('Model has no knight pieces');
  yield;
  yield* markPlates(pieces);
  yield* markPatches(pieces);
  yield* markOcclusion(pieces);
  const merge = (list) => {
    const g = list.length ? mergeGeometries(list, false) : new THREE.BufferGeometry();
    for (const x of list) x.dispose();
    g.computeBoundingSphere?.();
    return g;
  };
  const bodyGeo = merge(body);
  const helmGeos = HELMETS.map((h) => merge(helm['helm_' + h]));
  /** The heights (rest space) the geometries span: [lo, hi], or the defaults. */
  const span = (list, lo, hi) => {
    const box = new THREE.Box3();
    for (const g of list) {
      g.computeBoundingBox?.();
      if (g.boundingBox) box.union(g.boundingBox);
    }
    return Number.isFinite(box.min.y) ? [box.min.y, box.max.y] : [lo, hi];
  };
  const follow = knight.getObjectByName('K_Tasset_L')?.userData?.follow;
  // (The points he's checked at against the scenery: knightClear.js keepClear, solveClear.)
  const probes = yield* probesOf({ bodyGeo, helmGeos, restPos });
  return {
    root: gltfRoot,
    // (The dissolve runs over all three helmets' heights, so each burns the same way.)
    restPos,
    restQuat,
    bodyGeo,
    helmGeos,
    bodySpan: span([bodyGeo], 0, 1.72),
    helmSpan: span(helmGeos, 1.4, 1.75),
    tassetFollow: Number.isFinite(follow) ? follow : null,
    probes,
  };
}
/**
 * Points over a piece (its own space, from `o`; the triangles of `pos`, three corners each,
 * that `keep` keeps by their first corner): its farthest corners in PROBE_DIRS, and over its
 * surface one in every `cell` (m) it touches, in clumps (PROBE_CLUMP). With how far the
 * farthest is from `o`: { pts, clumps, r }.
 */
function pointsOf(pos, keep, o, cell) {
  const best = PROBE_DIRS.map(() => ({ d: -Infinity, v: null }));
  const cells = new Map();
  const corner = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let j = 0; pos && j + 2 < pos.count; j += 3) {
    if (!keep(j)) continue;
    for (let q = 0; q < 3; q++) {
      const c = corner[q];
      c[0] = pos.getX(j + q) - o[0];
      c[1] = pos.getY(j + q) - o[1];
      c[2] = pos.getZ(j + q) - o[2];
      // (A piece's farthest point in any way is one of its corners.)
      for (let k = 0; k < PROBE_DIRS.length; k++) {
        const [dx, dy, dz] = PROBE_DIRS[k];
        const d = c[0] * dx + c[1] * dy + c[2] * dz;
        if (d > best[k].d) best[k] = { d, v: [...c] };
      }
    }
    const [a, b, c] = corner;
    const n = Math.max(
      1,
      Math.ceil(
        Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2])) /
          cell,
      ),
    );
    for (let u = 0; u <= n; u++) {
      for (let w = 0; w <= n - u; w++) {
        const f = u / n,
          g = w / n,
          e = 1 - f - g;
        const x = a[0] * e + b[0] * f + c[0] * g,
          y = a[1] * e + b[1] * f + c[1] * g,
          z = a[2] * e + b[2] * f + c[2] * g;
        // (Cells of a few centimetres a piece, keyed exactly: a piece is well under 10 m.)
        const key =
          (Math.floor(x / cell) + 512) * 1048576 + (Math.floor(y / cell) + 512) * 1024 + Math.floor(z / cell) + 512;
        if (!cells.has(key)) cells.set(key, [x, y, z]);
      }
    }
  }
  const all = new Map([...best.filter((e) => e.v).map((e) => e.v), ...cells.values()].map((v) => [v.join(), v]));
  // (Each clump's points together in `pts` (x, y, z, …), and in `clumps` each clump's middle,
  // the radius of the ball round it from there, and where its points are in `pts`: cx, cy, cz,
  // r, from, to, ….)
  const byClump = new Map();
  for (const v of all.values()) {
    const key =
      (Math.floor(v[0] / PROBE_CLUMP) + 512) * 1048576 +
      (Math.floor(v[1] / PROBE_CLUMP) + 512) * 1024 +
      Math.floor(v[2] / PROBE_CLUMP) +
      512;
    if (!byClump.has(key)) byClump.set(key, []);
    byClump.get(key).push(v);
  }
  const pts = [],
    clumps = [];
  for (const list of byClump.values()) {
    const c = [0, 1, 2].map((a) => list.reduce((sum, v) => sum + v[a], 0) / list.length);
    const ball = Math.max(...list.map((v) => Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2])));
    clumps.push(...c, ball, pts.length, pts.length + 3 * list.length);
    for (const v of list) pts.push(...v);
  }
  let r = 0;
  for (let j = 0; j < pts.length; j += 3) r = Math.max(r, Math.hypot(pts[j], pts[j + 1], pts[j + 2]));
  return { pts: Float32Array.from(pts), clumps: Float32Array.from(clumps), r };
}
/**
 * The points a knight is checked at against the scenery, from a template's pieces: each arm
 * piece's (`arms`, by bone index: its rim, its cop, its knuckles and fingertips, and its
 * surface a few centimetres apart, a gauntlet's closer), his body's (`body`, by bone, with
 * how near a shape each may come) and each helmet's on the head (`helms`). A step (yield) a
 * few pieces.
 * @param {{ bodyGeo: THREE.BufferGeometry, helmGeos: THREE.BufferGeometry[], restPos: Record<string, number[]> }} T
 */
export function* probesOf(T) {
  const pos = T.bodyGeo.attributes.position,
    bone = T.bodyGeo.attributes.skinIndex;
  const piece = (b, cell) => {
    const i = BONE_INDEX[b];
    return bone
      ? pointsOf(pos, (j) => bone.getX(j) === i, T.restPos[b], cell)
      : { pts: new Float32Array(0), clumps: new Float32Array(0), r: 0 };
  };
  const arms = new Map();
  for (const side of ['L', 'R']) {
    for (const b of ARM) {
      arms.set(BONE_INDEX[b + side], piece(b + side, b === 'hand' || b === 'fingers' ? GAUNTLET_CELL : PROBE_CELL));
      yield;
    }
  }
  const body = [];
  for (const b of BODY) {
    body.push({
      i: BONE_INDEX[b],
      depth: RESTING.has(b) ? DEPTH_RESTING : DEPTH,
      part: PART_OF_PIECE[b] ?? 0,
      dome: DOME_OF[b] ?? 0,
      ...piece(b, PROBE_CELL),
    });
    if (body.length % 3 === 0) yield;
  }
  const helms = {};
  for (const [j, h] of HELMETS.entries()) {
    helms[h] = pointsOf(T.helmGeos[j]?.attributes.position, () => true, T.restPos.head, PROBE_CELL);
    yield;
  }
  return { arms, body, helms };
}
/** Run a generator of steps through at once: its value. */
export function drain(steps) {
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** A knight model's template (templateSteps), built at once. */
export function buildTemplate(gltfRoot) {
  return drain(templateSteps(gltfRoot));
}

/**
 * The pauldrons' collision data (knightPose.js measurePlates) from the model: each helmet's
 * pieces (the bascinet's mail aventail too: a dome may sit in it no deeper than the model
 * has it at rest) in the head's space, and the left dome's and lames' triangles in their
 * joints' space; null when the model has no dome.
 * `lamesNode`: the lames are on their own node (K_Pauldron_*), not riding the dome.
 */
export function platesOf(T) {
  const tris = (g, keep, o) => {
    const p = g.attributes.position;
    const out = [];
    if (!p) return out;
    for (let i = 0; i + 2 < p.count; i += 3) {
      if (!keep(i)) continue;
      for (let j = i; j < i + 3; j++) out.push(p.getX(j) - o[0], p.getY(j) - o[1], p.getZ(j) - o[2]);
    }
    return out;
  };
  const bone = T.bodyGeo.attributes.skinIndex;
  const on = (b) => (i) => bone.getX(i) === BONE_INDEX[b];
  const dome = tris(T.bodyGeo, on('shoulderL'), T.restPos.shoulderL);
  if (!dome.length) return null;
  const lames = tris(T.bodyGeo, on('pauldronL'), T.restPos.pauldronL);
  const helmets = Object.fromEntries(HELMETS.map((h, j) => [h, tris(T.helmGeos[j], () => true, T.restPos.head)]));
  return { plates: measurePlates({ helmets, dome, lames }), lamesNode: lames.length > 0 };
}
