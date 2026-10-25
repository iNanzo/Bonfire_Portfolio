// The envelope's wax seal (envelopeScene.js): a lumpy round blob of red wax, as if pressed by
// hand, its outline wobbling with a few overtones, a raised and uneven rim round a softly domed
// face, and a few small beads of wax squeezed out at its edge. The NH monogram is stamped into the
// face: logo.js's PATH (copied: the page takes no shared modules), drawn on the seal's own texels
// so it reads as the logo at the seal's size and not as a hash mark. Each texel of the face is a
// cell of the stamp (stampLayout: the strokes snapped to whole cells, four even uprights two
// texels or more wide, the crossbar as thick, the N's diagonal a texel wider, stepping across
// from the top of the outer stem to the foot of the inner one); a stroke's cells are a solid dark
// recess, and the face just under a straight stroke (under the crossbar, at the stems' feet: the
// wall that faces the light from above) a lighter lip one texel high (stampCell runs the
// shader's sums). It's one piece: opened, it blooms (envelope.js sealBloom), shrinking away while
// plain rose petals (petals.js) unfurl out of it, so the monogram never rides on a petal.
import * as THREE from 'three';
import { IDS, WAX, toon } from './envelopeLook.js';

/** logo.js's PATH, copied as it is: the NH monogram (x −27.5…27.5 across, y 2…78 down). */
export const MONOGRAM_PATH = 'M-15 78V27M-15 27L-4.5 68M-4.5 68V2M4.5 2V68M15 27V78M-27.5 47H27.5';

/**
 * The path's strokes as straight segments [x0, y0, x1, y1] (logo.js strokesOf: M, L, H and V,
 * absolute).
 * @param {string} d
 * @returns {number[][]}
 */
function strokesOf(d) {
  const out = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
    const n = args
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (cmd === 'M') {
      [x, y] = n;
      continue;
    }
    const [nx, ny] = cmd === 'L' ? n : cmd === 'H' ? [n[0], y] : [x, n[0]];
    out.push([x, y, nx, ny]);
    x = nx;
    y = ny;
  }
  return out;
}

/** The monogram's six strokes, in the path's units (logo.js LOGO_STROKES). */
export const MONOGRAM_STROKES = strokesOf(MONOGRAM_PATH);

/** The seal's radius, a share of the letter's width (a little bigger, for its stamp's room). */
export const SEAL_SIZE = 0.2;

/**
 * The stamp: its height a share of the seal's radius (it stays inside the rim), its strokes'
 * width a share of that (two texels at the least), and how much wider the N's diagonal is.
 */
const STAMP = { height: 1.28, stem: 0.045, diagonal: 1 };

/** Rounds half away from zero, so the stamp's cells mirror across its middle. */
const round = (/** @type {number} */ u) => Math.sign(u) * Math.round(Math.abs(u));

/**
 * @typedef {object} StampLayout
 * @property {number[][]} boxes  the uprights (N's outer, N's inner, H's inner, H's outer) and the
 *   crossbar, in cells: [i0, j0, i1, j1], i across from the seal's middle, j up, ends exclusive
 * @property {{x0: number, y0: number, x1: number, y1: number}} diag  the N's diagonal's middle
 *   line, from the top of the outer stem (x0, y0: its middle, its top edge) to the foot of the
 *   inner one (x1, y1), in cells
 * @property {number} stem  the strokes' width, cells
 * @property {number} diagonal  the diagonal's width across a row, cells
 */

/**
 * The stamp on a seal `radius` texels across its radius, snapped to whole texels (cells): the
 * logo's strokes at their places, rounded so the uprights are even and mirrored, the diagonal a
 * row-by-row run.
 * @param {number} radius
 * @returns {StampLayout}
 */
export function stampLayout(radius) {
  const H = Math.round(STAMP.height * radius);
  const k = H / 76;
  const stem = Math.max(2, Math.round(STAMP.stem * H));
  const row = (/** @type {number} */ y) => round((40 - y) * k);
  const left = (/** @type {number} */ x) => round(x * k + stem / 2) - stem;
  const [nOuter, diag, nInner, hInner, hOuter, bar] = MONOGRAM_STROKES;
  const upright = (/** @type {number[]} */ [x, ya, , yb]) => {
    const i0 = left(x);
    return [i0, Math.min(row(ya), row(yb)), i0 + stem, Math.max(row(ya), row(yb))];
  };
  const j0 = round((40 - bar[1]) * k + stem / 2) - stem;
  const boxes = [
    upright(nOuter),
    upright(nInner),
    upright(hInner),
    upright(hOuter),
    [round(bar[0] * k), j0, round(bar[2] * k), j0 + stem],
  ];
  return {
    boxes,
    diag: { x0: left(diag[0]) + stem / 2, y0: row(diag[1]), x1: left(diag[2]) + stem / 2, y1: row(diag[3]) },
    stem,
    diagonal: stem + STAMP.diagonal,
  };
}

/**
 * The N's diagonal's cells in row `j`: [i0, i1) (empty outside its rows). The shader's
 * inDiagonal.
 * @param {StampLayout} L
 * @param {number} j
 * @returns {[number, number]}
 */
export function diagonalAt(L, j) {
  const { x0, y0, x1, y1 } = L.diag;
  if (j < y1 || j >= y0) return [0, 0];
  const cx = x0 + ((y0 - (j + 0.5)) / (y0 - y1)) * (x1 - x0);
  // (Every cell whose middle is within half its width; a hair under, so the shader agrees.)
  const i0 = Math.ceil(cx - L.diagonal / 2 - 0.5 - 1e-3);
  return [i0, i0 + L.diagonal];
}

/**
 * Whether cell (i, j) is in one of the stamp's straight strokes.
 * @param {StampLayout} L
 * @param {number} i
 * @param {number} j
 */
const inBox = (L, i, j) => L.boxes.some(([x0, y0, x1, y1]) => i >= x0 && i < x1 && j >= y0 && j < y1);

/**
 * What the stamp shows in cell (i, j): 'deep' in a stroke's recess, 'lip' on the face right
 * under one of its straight strokes (the lit wall: under the crossbar, at the stems' feet; never
 * under the diagonal's steps, where it would be a dotted line), else null. The shader
 * (SEAL_GLSL's sealStamp) runs the same sums.
 * @param {StampLayout} L
 * @param {number} i
 * @param {number} j
 * @returns {'deep'|'lip'|null}
 */
export function stampCell(L, i, j) {
  const [a, b] = diagonalAt(L, j);
  if (inBox(L, i, j) || (i >= a && i < b)) return 'deep';
  return inBox(L, i, j + 1) ? 'lip' : null;
}

/**
 * A texel at the seal's face, in the letter's units: the view's height `viewH` over its `rows`
 * of texels at the letter (the camera `dist` away, the letter drawn at `scale`), smaller by how
 * much nearer the face is (`faceZ`, world units toward the camera).
 * @param {number} viewH
 * @param {number} rows
 * @param {number} scale
 * @param {number} faceZ
 * @param {number} dist
 */
export function sealTexel(viewH, rows, scale, faceZ, dist) {
  return (viewH * (dist - faceZ)) / dist / rows / scale;
}

/** The rings of the blob from its middle out: [share of the radius, height as a share of it]. */
const RINGS = [
  [0.3, 0.3],
  [0.55, 0.285],
  [0.68, 0.27],
  [0.78, 0.36],
  [0.87, 0.38],
  [0.95, 0.25],
  [1.0, 0.06],
];
/** Round the blob. */
const SIDES = 40;

/**
 * The seal's outline at angle `a`, as a share of its radius: round, wobbling with a few
 * overtones (never more than about 15% off).
 * @param {number} a
 */
export function sealEdge(a) {
  return 1 + 0.06 * Math.sin(3 * a + 0.4) + 0.045 * Math.sin(5 * a + 1.9) + 0.03 * Math.sin(8 * a + 0.7);
}

/**
 * The rim's unevenness at angle `a`, as a share of the radius (added to its height).
 * @param {number} a
 */
const rimLift = (a) => 0.06 * Math.sin(4 * a + 1.1) + 0.035 * Math.sin(7 * a + 2.6);

/**
 * The blob as a mesh's geometry, radius `r`, the face up +z: a fan in the middle and rings out to
 * the edge.
 * @param {number} r
 */
export function sealGeometry(r) {
  const pos = [0, 0, r * 0.31];
  for (const [rho, z] of RINGS) {
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      const rim = rho >= 0.75 && rho < 1 ? rimLift(a) : 0;
      // (The rim's crest wanders in and out a little too.)
      const wob = rho >= 0.75 && rho < 1 ? 0.02 * Math.sin(6 * a + rho * 9) : 0;
      const k = r * (rho + wob) * sealEdge(a);
      pos.push(Math.cos(a) * k, Math.sin(a) * k, r * (z + rim * Math.min(1, (rho - 0.7) * 6)));
    }
  }
  const idx = [];
  for (let i = 0; i < SIDES; i++) idx.push(0, 1 + i, 1 + ((i + 1) % SIDES));
  for (let ring = 0; ring < RINGS.length - 1; ring++) {
    const a0 = 1 + ring * SIDES;
    const b0 = a0 + SIDES;
    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES;
      idx.push(a0 + i, b0 + i, b0 + j, a0 + i, b0 + j, a0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** The stamp, in GLSL (the seal's material: toon's SEAL): stampCell's sums on the texel grid. */
const SEAL_GLSL = /* glsl */ `
  uniform vec4 uBox[5];
  uniform vec4 uDiag;
  uniform float uDiagW;
  uniform float uTexelS;
  uniform vec3 uDeep;
  uniform vec3 uLip;
  // (All of it without branches: cells are whole numbers, so a < b is a <= b - 0.5. Branching
  // here left the face's shading, which takes the texel's neighbours, wrong round the strokes.)
  float within(float a, float lo, float hi) {
    return step(lo, a) * step(a, hi - 0.5);
  }
  float inBoxes(vec2 c) {
    float k = 0.0;
    for (int i = 0; i < 5; i++) {
      vec4 b = uBox[i];
      k = max(k, within(c.x, b.x, b.z) * within(c.y, b.y, b.w));
    }
    return k;
  }
  float inDiagonal(vec2 c) {
    float cx = uDiag.x + (uDiag.y - (c.y + 0.5)) / (uDiag.y - uDiag.w) * (uDiag.z - uDiag.x);
    float i0 = ceil(cx - uDiagW * 0.5 - 0.5 - 1e-3);
    return within(c.y, uDiag.w, uDiag.y) * within(c.x, i0, i0 + uDiagW);
  }
  vec3 sealStamp(vec2 p, vec3 c) {
    // (The face's texel this is, counted from the seal's middle: a cell of the stamp.)
    vec2 cell = floor(p / uTexelS);
    float deep = max(inBoxes(cell), inDiagonal(cell));
    float lip = (1.0 - deep) * inBoxes(cell + vec2(0.0, 1.0));
    return mix(mix(c, uLip, lip), uDeep, deep);
  }
`;

/**
 * The seal, radius `r`: `group` (to place), and `setTexel` (a texel at its face in its own units:
 * the stamp is drawn on that grid).
 * @param {ReturnType<typeof import('./envelopeLook.js').shared>} u
 * @param {number} r
 */
export function buildSeal(u, r) {
  const geo = sealGeometry(r);
  const boxes = Array.from({ length: 5 }, () => new THREE.Vector4());
  const stamp = {
    uBox: { value: boxes },
    uDiag: { value: new THREE.Vector4() },
    uDiagW: { value: 1 },
    uTexelS: { value: 1 },
    uDeep: { value: new THREE.Vector3(0x4a / 255, 0x0b / 255, 0x0a / 255) },
    uLip: { value: new THREE.Vector3(0xe3 / 255, 0x86 / 255, 0x78 / 255) },
  };
  /** @param {number} s  a texel at its face, in the seal's units */
  const setTexel = (s) => {
    const L = stampLayout(r / s);
    L.boxes.forEach((b, i) => boxes[i].set(b[0], b[1], b[2], b[3]));
    stamp.uDiag.value.set(L.diag.x0, L.diag.y0, L.diag.x1, L.diag.y1);
    stamp.uDiagW.value = L.diagonal;
    stamp.uTexelS.value = s;
  };
  setTexel(r / 30);
  const bead = toon(WAX, u, IDS.seal);
  const group = new THREE.Group();
  const mat = toon(WAX, u, IDS.seal, { uniforms: stamp, defines: { SEAL: '' }, glsl: SEAL_GLSL });
  group.add(new THREE.Mesh(geo, mat));
  // The beads squeezed out at the edge: small squashed lumps.
  for (const [a, size] of [
    [0.35, 0.15],
    [2.5, 0.11],
    [4.25, 0.18],
    [5.3, 0.09],
  ]) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * size, 1), bead);
    const k = r * sealEdge(a) * (1.0 + size * 0.45);
    m.position.set(Math.cos(a) * k, Math.sin(a) * k, r * 0.04);
    m.scale.set(1.15, 0.9, 0.55);
    group.add(m);
  }
  return {
    group,
    setTexel,
  };
}
