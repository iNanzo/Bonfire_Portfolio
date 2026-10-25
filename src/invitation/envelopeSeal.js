// The envelope's wax seal (envelopeScene.js), drawn like the user's reference: a round seal of red
// wax with a gently wavy edge, a raised rim (lit on the side toward the light, a band of the
// light tone there and on the inner wall across from it, shade on the far side), a thin dark ring
// inside the rim, a flat recessed field, and the NH monogram debossed in that field, with exactly
// one stray splotch of wax beside it. Its face is a small picture drawn texel by texel
// (sealFace), in the wax's three tones lit by the envelope's one light (envelopeLook.js LIGHT and
// bandOf), at the size it shows on the screen; the seal's material puts it on the screen texel for
// texel, its middle snapped to a texel's corner (place), so moving the letter moves a steady
// picture and never resamples the stamp. Only blooming (swelling, spinning and shrinking away) does
// it scale. The monogram is logo.js's PATH (copied: the page takes no shared modules), its strokes
// one texel wide (stampLayout: snapped to whole texels, four even mirrored uprights, the crossbar
// as thin, the N's diagonal a row-by-row run from the top of the outer stem to the foot of the
// inner one), each a dark floor with a one-texel light lip on its lit side: right of every stroke
// and under the crossbar and the stems' feet (stampCell). It's one piece: opened, it blooms
// (envelope.js sealBloom), shrinking away while plain rose petals (petals.js) unfurl out of it, so
// the monogram never rides on a petal.
import * as THREE from 'three';
import { IDS, LIGHT, WAX, bandOf, rgb, toon } from './envelopeLook.js';

export { SEAL_SIZE } from './envelopeLook.js';

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

/**
 * The seal's parts, as shares of its radius: the thin ring's, the rim's crest (a share of the way
 * from the rim's foot to the edge) and the rim's height (of its width); the splotch's size, the
 * texels clear between it and the edge, and its angle (on the right, under the flap's edge).
 */
const SEAL = { ring: 0.7, crest: 0.4, height: 0.6, splotch: 0.14, gap: 3.5, angle: -0.2 };
/** The stamp's height, a share of the seal's radius (inside the ring). */
const STAMP = { height: 1.1 };

/**
 * The seal's edge at angle `a`, as a share of its radius: round, gently wavy (a few soft swells,
 * never more than about 6% off).
 * @param {number} a
 */
export function sealEdge(a) {
  return 1 + 0.04 * Math.sin(5 * a + 0.6) + 0.022 * Math.sin(8 * a + 2.1);
}

/**
 * The seal's layout for a seal `R` texels across its radius, texels from its middle: the flat
 * field out to `field`, the thin ring round it at `ring`, a texel of field past it, the rim from
 * `rim` out to the edge (R × sealEdge), and its one stray splotch (x, y its middle, r its radius).
 * @param {number} R
 */
export function sealLayout(R) {
  const ring = SEAL.ring * R;
  const a = SEAL.angle;
  // (Clear of the edge's nearest swell, not just the edge straight in.)
  let edge = 0;
  for (let k = -8; k <= 8; k++) edge = Math.max(edge, sealEdge(a + k * 0.05));
  const r = Math.max(2.5, SEAL.splotch * R);
  const d = R * edge + SEAL.gap + r;
  return {
    radius: R,
    field: ring - 1,
    ring,
    rim: ring + 1.5,
    splotches: [{ x: Math.cos(a) * d, y: Math.sin(a) * d, r }],
  };
}

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
 * logo's strokes at their places, one texel wide, rounded so the uprights are mirrored, the
 * diagonal a row-by-row run.
 * @param {number} radius
 * @returns {StampLayout}
 */
export function stampLayout(radius) {
  const H = Math.round(STAMP.height * radius);
  const k = H / 76;
  const stem = 1;
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
    diagonal: stem,
  };
}

/**
 * The N's diagonal's cells in row `j`: [i0, i1) (empty outside its rows).
 * @param {StampLayout} L
 * @param {number} j
 * @returns {[number, number]}
 */
export function diagonalAt(L, j) {
  const { x0, y0, x1, y1 } = L.diag;
  if (j < y1 || j >= y0) return [0, 0];
  const cx = x0 + ((y0 - (j + 0.5)) / (y0 - y1)) * (x1 - x0);
  // (Every cell whose middle is within half its width.)
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
 * Whether cell (i, j) is in any of the stamp's strokes (the diagonal too).
 * @param {StampLayout} L
 * @param {number} i
 * @param {number} j
 */
const inStroke = (L, i, j) => {
  if (inBox(L, i, j)) return true;
  const [a, b] = diagonalAt(L, j);
  return i >= a && i < b;
};

/**
 * What the stamp shows in cell (i, j): 'deep' on a stroke's floor; 'lip' on its lit wall, lit
 * from the upper left: the cell right of any stroke, or under a straight one (the crossbar, the
 * stems' feet; never under the diagonal's steps, where it would be a dotted line); else null.
 * @param {StampLayout} L
 * @param {number} i
 * @param {number} j
 * @returns {'deep'|'lip'|null}
 */
export function stampCell(L, i, j) {
  if (inStroke(L, i, j)) return 'deep';
  return inStroke(L, i - 1, j) || inBox(L, i, j + 1) ? 'lip' : null;
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

/**
 * The tone (1 light, 2 mid, 3 shade) of wax whose height falls `slope` texels a texel outward
 * at angle `a`: its normal on the light (envelopeLook.js bandOf).
 * @param {number} slope  rising outward > 0
 * @param {number} a
 */
function lit(slope, a) {
  const toward = Math.cos(a) * LIGHT[0] + Math.sin(a) * LIGHT[1];
  return bandOf((-slope * toward + LIGHT[2]) / Math.hypot(1, slope)) + 1;
}

/**
 * The seal's face for a seal `R` texels across its radius: `size` × `size` texels round its middle
 * (texel (i, j) from the middle, j up, is at column i + c, row j + c), each 0 (no wax) or a tone:
 * 1 light, 2 mid, 3 shade. The field is flat (mid); the stamp and the ring are dark floors with
 * a light lip on their lit side; the rim rises from the field to a crest and falls to the edge,
 * each texel lit by its slope; the splotch is a small dome.
 * @param {number} R
 */
export function sealFace(R) {
  const L = sealLayout(R);
  const S = stampLayout(R);
  const [sp] = L.splotches;
  const c = Math.ceil(Math.max(R * 1.07, Math.hypot(sp.x, sp.y) + sp.r)) + 2;
  const size = c * 2;
  const tones = new Uint8Array(size * size);
  // (Texels set by a rule, not by the light: kept as they are by the tidying below.)
  const fixed = new Uint8Array(size * size);
  const lx = LIGHT[0] / Math.hypot(LIGHT[0], LIGHT[1]);
  const ly = LIGHT[1] / Math.hypot(LIGHT[0], LIGHT[1]);
  for (let j = -c; j < c; j++)
    for (let i = -c; i < c; i++) {
      const k = (j + c) * size + (i + c);
      const x = i + 0.5;
      const y = j + 0.5;
      const d = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      const edge = R * sealEdge(a);
      if (d < edge) {
        const stamp = stampCell(S, i, j);
        const toward = (x * lx + y * ly) / d;
        let t = 0;
        if (stamp) t = stamp === 'deep' ? 3 : 1;
        else if (Math.abs(d - L.ring) < 0.5) t = 3;
        // (The ring's lit wall: inside it toward the light, outside it away from the light.)
        else if (Math.abs(d - L.ring + 1) < 0.5 && toward > 0.35) t = 1;
        else if (Math.abs(d - L.ring - 1) < 0.5 && toward < -0.35) t = 1;
        if (t) {
          tones[k] = t;
          fixed[k] = 1;
          continue;
        }
        if (d < L.rim) {
          tones[k] = 2;
          fixed[k] = 1;
          continue;
        }
        const w = edge - L.rim;
        const s = (d - L.rim) / w;
        const A = SEAL.height * w;
        const q = SEAL.crest;
        const slope =
          s < q
            ? ((A * Math.PI) / 2 / q / w) * Math.cos(((Math.PI / 2) * s) / q)
            : -((A * Math.PI) / 2 / (1 - q) / w) * Math.sin(((Math.PI / 2) * (s - q)) / (1 - q));
        tones[k] = lit(slope, a);
        continue;
      }
      const dx = (x - sp.x) / sp.r;
      const dy = (y - sp.y) / sp.r;
      const e = Math.hypot(dx, dy);
      if (e < 1) tones[k] = lit(-1.6 * e, Math.atan2(dy, dx));
    }
  // Tidy: a lone texel of the rim or the splotch whose four neighbours all agree takes theirs.
  const out = tones.slice();
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      const k = y * size + x;
      if (!tones[k] || fixed[k]) continue;
      const n = [tones[k - 1], tones[k + 1], tones[k - size], tones[k + size]];
      if (n.every((t) => t && t === n[0]) && n[0] !== tones[k]) out[k] = n[0];
    }
  return {
    size,
    c,
    tones: out,
    /** The tone at texel (i, j) from the middle (0 off the face). */
    at(/** @type {number} */ i, /** @type {number} */ j) {
      const x = i + c;
      const y = j + c;
      return x < 0 || y < 0 || x >= size || y >= size ? 0 : out[y * size + x];
    },
  };
}

const onScreen = { c: new THREE.Vector3(), e: new THREE.Vector3() };

/**
 * Where the seal (`group`, radius `r` in its own units) shows on a `tw` × `th` drawing through
 * `camera`: its middle (texels from the drawing's lower left) and its two axes, each its radius
 * along its own x and y, as texels on the screen (`axes`: [x, y] of its x axis, then of its y).
 * It brings the camera's and the seal's matrices up to date first: three only does that as it
 * draws, so the first frame's placement, made before anything was drawn, read a view that wasn't
 * there yet and put a seal 37 times its size on the screen (the red box on reload, 2026-10-25).
 * @param {THREE.Object3D} group
 * @param {THREE.Camera} camera
 * @param {number} r
 * @param {number} tw
 * @param {number} th
 */
export function sealOnScreen(group, camera, r, tw, th) {
  camera.updateMatrixWorld();
  group.updateWorldMatrix(true, false);
  const c = onScreen.c.setFromMatrixPosition(group.matrixWorld).project(camera);
  const x = (c.x * 0.5 + 0.5) * tw;
  const y = (c.y * 0.5 + 0.5) * th;
  /** @param {number} ux @param {number} uy */
  const axis = (ux, uy) => {
    const e = group.localToWorld(onScreen.e.set(ux * r, uy * r, 0)).project(camera);
    return [(e.x * 0.5 + 0.5) * tw - x, (e.y * 0.5 + 0.5) * th - y];
  };
  return { x, y, axes: [...axis(1, 0), ...axis(0, 1)] };
}

/** The seal's face from its texture (toon's SEAL): texel for texel round its middle on the screen. */
const SEAL_GLSL = /* glsl */ `
  uniform sampler2D uFace;
  uniform float uFaceSize;
  uniform float uFaceC;
  uniform vec2 uCenter;
  uniform float uZoom;
  uniform float uSpin;
  vec4 sealFace() {
    vec2 q = gl_FragCoord.xy - uCenter;
    float cs = cos(uSpin);
    float sn = sin(uSpin);
    q = vec2(cs * q.x + sn * q.y, -sn * q.x + cs * q.y) / uZoom;
    vec2 cell = floor(q) + uFaceC;
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uFaceSize || cell.y >= uFaceSize) return vec4(0.0);
    return texture2D(uFace, (cell + 0.5) / uFaceSize);
  }
`;

/** Within this of whole (and upright) it's drawn texel for texel: the sway never resamples it. */
const SNAP = 0.035;

/**
 * The seal, radius `r` (the letter's units): `group` (to place: its quad covers the face, splotch
 * and all, as it swells), `material`; `setRadius(R)`, its radius on the screen in texels (its face
 * is drawn for that); and `place(x, y, zoom, spin)` each frame: where its middle falls on the
 * screen (texels from the drawing's lower left), and how much bigger and turned it shows than at
 * rest (both snapped to whole and upright when near).
 * @param {ReturnType<typeof import('./envelopeLook.js').shared>} u
 * @param {number} r
 */
export function buildSeal(u, r) {
  const uniforms = {
    uFace: { value: /** @type {THREE.DataTexture|null} */ (null) },
    uFaceSize: { value: 1 },
    uFaceC: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uZoom: { value: 1 },
    uSpin: { value: 0 },
  };
  const material = toon(WAX, u, IDS.seal, { uniforms, defines: { SEAL: '' }, glsl: SEAL_GLSL });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.PlaneGeometry(r * 3.6, r * 3.6), material));
  const colours = WAX.map(rgb).map((v) => [Math.round(v.x * 255), Math.round(v.y * 255), Math.round(v.z * 255)]);
  let radius = 0;
  /** @param {number} R */
  const setRadius = (R) => {
    if (Math.abs(R - radius) < 0.01) return;
    radius = R;
    const f = sealFace(R);
    const data = new Uint8Array(f.size * f.size * 4);
    f.tones.forEach((t, k) => {
      if (!t) return;
      data.set([...colours[t - 1], 255], k * 4);
    });
    const tex = new THREE.DataTexture(data, f.size, f.size, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    uniforms.uFace.value?.dispose();
    uniforms.uFace.value = tex;
    uniforms.uFaceSize.value = f.size;
    uniforms.uFaceC.value = f.c;
  };
  setRadius(30);
  return {
    group,
    material,
    setRadius,
    /** Its radius on the screen, texels, as its face is drawn. */
    get radius() {
      return radius;
    },
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} zoom
     * @param {number} spin
     */
    place(x, y, zoom, spin) {
      uniforms.uCenter.value.set(Math.round(x), Math.round(y));
      uniforms.uZoom.value = Math.abs(zoom - 1) < SNAP ? 1 : zoom;
      uniforms.uSpin.value = Math.abs(spin) < SNAP ? 0 : spin;
    },
    dispose() {
      uniforms.uFace.value?.dispose();
    },
  };
}
