// NEWT's pixel faces for the invitation toy (public/models/newt-face.png): one 2×2 sheet of his
// four faces (neutral, blink, happy, surprised: clips.js FACES' layout) for every cell size in
// src/invitation/faceSheets.js's ladder, side by side as its FACE_LAYOUT packs them. Each is his
// smooth face (the 1024 sheet inside public/models/newt.glb, which averages down to a blank face
// at a few texels) scaled down faithfully: its design measured from that sheet (DESIGN: the heavy
// dark upper lid with its turned-down end, the white, the grey iris and the dark pupil under it,
// the lash, the brow; closed, a lid line; happy, an arc and a blush; surprised, the lid and brow
// raised, the eye wide, a small o; the small mouth), kept where it is in a cell and drawn in
// whole pixels for that size, a line a pixel thick at least, a feature a pixel at least, so it
// stays readable and the same at every size (colours sampled from the sheet too). Where a shape
// scaled down as it is would read wrong through the page's dither (a pupil tapering into the lid
// or the band, steps meeting only at a corner, a blush or an o as a block or a bar), it's drawn
// as the smooth face reads at that size instead: a flat bar of a pupil, an arc joined along its
// edges, a one-row blush, a round o. character.js
// shows the sheet whose cell matches his half face in texels (nearest, no mipmaps) while the
// pixel filter and Pixel Face are on. Re-runnable:
//
//   node tools/newt-face.mjs [--glb public/models/newt.glb] [--out public/models/newt-face.png]
//                            [--preview <png>]
//
//   --preview  also write each size's four faces mirrored into whole faces, ×8, for looking at
import fs from 'node:fs';
import sharp from 'sharp';
import { FACE_IMAGE, FACE_LAYOUT } from '../src/invitation/faceSheets.js';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const GLB = opt('glb', 'public/models/newt.glb');
const OUT = opt('out', 'public/models/newt-face.png');
const PREVIEW = opt('preview', null);
/** The cells, as clips.js FACES has them: [column, row] on a 2×2 sheet. */
const CELLS = { neutral: [0, 0], blink: [1, 0], happy: [0, 1], surprised: [1, 1] };
/**
 * His smooth face (the 1024 sheet's cells), measured, as shares of a cell: u across from the
 * middle of his face to his ear, v down. A stroke is its centre line, [u, v] points, and its
 * thickness (v); an ellipse its centre and radii. The open eye: a heavy dark upper lid whose
 * outer end turns down (the hook), the white under it, a big grey iris (darker under the pupil's
 * bottom, `band`) mostly hidden by the lid, a dark pupil right under the lid, a thin brown lash
 * line along the white's bottom; surprised, the lid and brow higher, the white all round a
 * smaller iris and pupil. Closed: a lid line with a slight dip. Happy: an arc over the eye and a
 * blush under it toward his ear. The mouth: a short line at the middle, its ends a little down
 * (neutral) or up (happy); surprised, a small dark o. The values after a feature's shape say how
 * it's drawn in pixels where scaling it down as it is wouldn't read.
 */
const DESIGN = {
  brow: {
    t: 0.0156,
    // (From 20 px it starts this share of the lid's length in from its inner end and stops this
    // share short of its hook: the 1024 sheet's lid runs 85 to 355, its brow 105 to 300.)
    insetFrom: 20,
    inset: [0.074, 0.2],
    neutral: [
      [0.201, 0.5596],
      [0.3125, 0.5537],
      [0.4375, 0.5488],
      [0.588, 0.5498],
    ],
    happy: [
      [0.201, 0.55],
      [0.3125, 0.5449],
      [0.4375, 0.5391],
      [0.588, 0.541],
    ],
    surprised: [
      [0.201, 0.5273],
      [0.3125, 0.5215],
      [0.4375, 0.5156],
      [0.588, 0.5166],
    ],
  },
  lid: {
    t: 0.0254,
    neutral: [
      [0.185, 0.618],
      [0.25, 0.6064],
      [0.3125, 0.6015],
      [0.5, 0.6015],
      [0.59, 0.61],
      [0.66, 0.6189],
      [0.695, 0.625],
    ],
    // (Surprised: the same lid, raised.)
    raise: 0.0335,
    hook: [
      [0.64, 0.626],
      [0.695, 0.643],
    ],
  },
  white: { u: 0.4, v: 0.665, ru: 0.23, rv: 0.095 },
  iris: {
    neutral: { u: 0.395, v: 0.54, ru: 0.2, rv: 0.2 },
    surprised: { u: 0.393, v: 0.668, ru: 0.105, rv: 0.058 },
    band: 0.693,
    // (The darker band from cells this wide: in a smaller one it joins the pupil into one dark
    // column under the lid. Neutral, it's the iris's bottom rows, this share of the cell: two
    // rows to 40 px, as the smooth band reads.)
    bandFrom: 26,
    bandRows: 0.035,
  },
  pupil: {
    neutral: { u: 0.39, v: 0.62, ru: 0.07, rv: 0.072 },
    surprised: { u: 0.393, v: 0.659, ru: 0.048, rv: 0.03 },
    // How the pupil reads in pixels, as the smooth face shows it (the ellipses above are mostly
    // under the lid there): neutral from `barFrom`, a flat bar `bar` of the cell wide hanging
    // from the lid, two rows (a row for every `barRows` of the cell's height from 26 px), its
    // bottom corners rounded off; surprised from `wideFrom`, a wide oval `wide` of the cell
    // across and `flat` times wider than it's tall.
    barFrom: 16,
    bar: 0.14,
    barRows: 30,
    wideFrom: 23,
    wide: 0.12,
    flat: 1.8,
  },
  lash: { u: [0.31, 0.47] },
  closed: {
    t: 0.019,
    line: [
      [0.172, 0.665],
      [0.25, 0.669],
      [0.3125, 0.675],
      [0.4, 0.68],
      [0.53, 0.676],
      [0.6, 0.674],
      [0.672, 0.672],
    ],
  },
  arc: {
    t: 0.02,
    // (Its steps joined along an edge from cells this wide.)
    joinFrom: 14,
    line: [
      [0.195, 0.68],
      [0.22, 0.677],
      [0.25, 0.665],
      [0.28, 0.658],
      [0.3125, 0.652],
      [0.375, 0.646],
      [0.4375, 0.648],
      [0.5, 0.654],
      [0.5625, 0.672],
      [0.6015, 0.682],
    ],
  },
  blush: { u: 0.555, v: 0.8477, ru: 0.072, rv: 0.0156 },
  mouth: {
    t: 0.008,
    // (Neutral a tiny ㅅ from `tickFrom`, happy turned up from `smileFrom`; the o round, a mid
    // brown at its outer column, from `roundFrom`, `oRows` of the cell tall, two rows at least.)
    tickFrom: 26,
    smileFrom: 20,
    roundFrom: 26,
    oRows: 0.037,
    neutral: [
      [0, 0.8825],
      [0.072, 0.9],
    ],
    happy: [
      [0, 0.8935],
      [0.03, 0.892],
      [0.088, 0.884],
    ],
    o: { u: 0, v: 0.8945, ru: 0.044, rv: 0.024 },
  },
};

/** The bytes of the image the material `name` uses as its base colour, from a .glb. */
function glbImage(file, name) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const bin = 20 + jsonLen + 8;
  const material = gltf.materials.find((m) => m.name === name);
  if (!material) throw new Error(`${file}: no material ${name}`);
  const texture = gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const source = texture.extensions?.EXT_texture_webp?.source ?? texture.source;
  const view = gltf.bufferViews[gltf.images[source].bufferView];
  const at = bin + (view.byteOffset ?? 0);
  return buf.subarray(at, at + view.byteLength);
}

const luma = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * The faces' colours from the 1024 sheet: each face's skin (its cell's commonest colour, in 4-bit
 * bins, averaged), and the rest sampled where the design has them in its cells (the median of a
 * small box; the mouth's line the mean of its pixels, its soft edge too, as the thin line reads a
 * pixel wide; the lash its darkest): the ink of the lids, brows and pupils, the white, the iris's
 * two greys, the lash, the mouth's line and its open o, the blush; and the o's soft edge, halfway
 * between the o and his skin.
 * @param {Buffer} px  the 1024 sheet, RGBA
 * @param {number} W  its width
 */
function colours(px, W) {
  const half = W / 2;
  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  /** @type {Record<string, number[]>} */
  const skin = {};
  for (const [name, [cx, cy]] of Object.entries(CELLS)) {
    const bins = new Map();
    for (let y = cy * half; y < (cy + 1) * half; y += 2)
      for (let x = cx * half; x < (cx + 1) * half; x += 2) {
        const [r, g, b] = at(x, y);
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        bin.n++;
        bin.r += r;
        bin.g += g;
        bin.b += b;
        bins.set(key, bin);
      }
    const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
    skin[name] = [top.r / top.n, top.g / top.n, top.b / top.n].map(Math.round);
  }
  /** The pixels of face `name`'s box [u0, u1] × [v0, v1]. */
  const box = (name, [u0, u1], [v0, v1]) => {
    const [cx, cy] = CELLS[name];
    const out = [];
    for (let y = Math.floor(v0 * half); y < Math.ceil(v1 * half); y++)
      for (let x = Math.floor(u0 * half); x < Math.ceil(u1 * half); x++) out.push(at(cx * half + x, cy * half + y));
    return out;
  };
  const median = (list) => [0, 1, 2].map((k) => list.map((c) => c[k]).sort((a, b) => a - b)[list.length >> 1]);
  const mean = (list) => [0, 1, 2].map((k) => Math.round(list.reduce((t, col) => t + col[k], 0) / list.length));
  const darkest = (list) => list.reduce((a, b) => (luma(...b) < luma(...a) ? b : a));
  const picked = {
    skin,
    ink: median(box('neutral', [0.3, 0.5], [0.592, 0.61])),
    white: median(box('neutral', [0.205, 0.235], [0.65, 0.7])),
    iris: median(box('neutral', [0.26, 0.3], [0.63, 0.66])),
    irisDark: median(box('neutral', [0.36, 0.43], [0.7, 0.725])),
    lash: darkest(box('neutral', [0.37, 0.42], [0.745, 0.756])),
    mouth: mean(box('neutral', [0, 0.07], [0.86, 0.92]).filter(([r, g, b]) => r - b > 25 && luma(r, g, b) < 0.6)),
    open: median(box('surprised', [0, 0.02], [0.885, 0.905])),
    blush: median(box('happy', [0.53, 0.58], [0.84, 0.855])),
  };
  // (The o's soft edge: halfway between it and his skin.)
  return { ...picked, openEdge: picked.open.map((v, k) => Math.round((v + skin.surprised[k]) / 2)) };
}

/**
 * A w × h cell to draw a face on (its left edge the middle of his face), filled with `skin`: its
 * pixels, `put`, and DESIGN's shapes scaled to it in whole pixels.
 * @param {number} w
 * @param {number} h
 * @param {number[]} skin
 */
function canvas(w, h, skin) {
  const cell = new Uint8Array(w * h * 4);
  for (let i = 0; i < cell.length; i += 4) cell.set([...skin, 255], i);
  const uOf = (x) => (x + 0.5) / w;
  const vOf = (y) => (y + 0.5) / h;
  /** @param {number} x @param {number} y @param {number[]} col */
  const put = (x, y, col) => {
    if (x >= 0 && y >= 0 && x < w && y < h) cell.set([...col, 255], (y * w + x) * 4);
  };
  /** A centre line's v at u, linear between its points (clamped to its ends). */
  const lineAt = (pts, u) => {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++)
      if (u <= pts[i][0]) {
        const [[u0, v0], [u1, v1]] = [pts[i - 1], pts[i]];
        return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0 || 1);
      }
    return pts.at(-1)[1];
  };
  return {
    w,
    h,
    cell,
    put,
    uOf,
    vOf,
    /**
     * A stroke: a run of columns from where it starts, as many as it's long (rounded: so it grows
     * steadily with the cell; 2 at least once it's a pixel long, 1 at least), `round(t × h)` rows
     * (1 at least) round its centre line at each, moved `shift` rows. The rows
     * follow the line's mean, stepping only where the line strays half a pixel or more from it,
     * so a nearly flat line stays one straight row at every size. Returns column → [top, bottom].
     * @param {number[][]} pts
     * @param {number} t
     * @param {number} [shift]
     */
    stroke(pts, t, shift = 0) {
      const n = Math.max(1, Math.round(t * h));
      const [a, b] = [pts[0][0] * w, pts.at(-1)[0] * w];
      const len = Math.max(b - a >= 1 ? 2 : 1, Math.round(b - a));
      const x0 = Math.max(0, Math.min(w - len, Math.round(a)));
      const cols = Array.from({ length: len }, (_, i) => x0 + i);
      const vs = cols.map((x) => lineAt(pts, Math.min(pts.at(-1)[0], Math.max(pts[0][0], uOf(x)))));
      const mean = vs.reduce((s, v) => s + v, 0) / vs.length;
      const base = Math.round(mean * h - n / 2);
      /** @type {Map<number, [number, number]>} */
      const rows = new Map();
      cols.forEach((x, i) => {
        const top = base + Math.round((vs[i] - mean) * h) + shift;
        rows.set(x, [top, top + n - 1]);
      });
      return rows;
    },
    /** @param {Map<number, [number, number]>} rows @param {number[]} col */
    paint(rows, col) {
      for (const [x, [t, b]] of rows) for (let y = t; y <= b; y++) put(x, y, col);
    },
    /** Whether pixel x, y's centre is inside an ellipse moved `shift` rows. */
    inside(e, x, y, shift = 0) {
      return ((uOf(x) - e.u) / e.ru) ** 2 + ((vOf(y - shift) - e.v) / e.rv) ** 2 <= 1;
    },
    /** An ellipse's pixels, or the one nearest its centre where it covers none. */
    blob(e) {
      const out = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (this.inside(e, x, y)) out.push([x, y]);
      if (!out.length) out.push([Math.min(w - 1, Math.floor(e.u * w)), Math.min(h - 1, Math.floor(e.v * h))]);
      return out;
    },
  };
}

/**
 * The open eye's pixels on cell `g` (neutral, or surprised: the lid raised a row at least, so the
 * eye opens wider at every size), all moved `shift` rows: the lid's rows by column, the opening
 * under it (inside the white, its first row right under the lid wherever the lid is over the
 * white; down to the eye's bottom row in the middle, the white's depth under the lid's top
 * rounded, so the eye grows steadily with the cell; never below it), the hook.
 * @param {ReturnType<typeof canvas>} g
 * @param {boolean} wide
 * @param {number} shift
 */
function openEye(g, wide, shift) {
  const raise = wide ? Math.max(1, Math.round(DESIGN.lid.raise * g.h)) : 0;
  const lid = g.stroke(DESIGN.lid.neutral, DESIGN.lid.t, shift - raise);
  if (wide) {
    // (Surprised, the lid starts straight: only its outer end turns down.)
    const xs = [...lid.keys()].sort((a, b) => a - b);
    const mid = xs[xs.length >> 1];
    const [mt, mb] = lid.get(mid);
    for (const x of xs) if (x < mid && lid.get(x)[0] > mt) lid.set(x, [mt, mb]);
  }
  const flat = g.stroke(DESIGN.lid.neutral, DESIGN.lid.t, shift);
  const { white } = DESIGN;
  const top = Math.min(...[...flat.values()].map(([t]) => t));
  const depth = white.v + white.rv - (DESIGN.lid.neutral[3][1] - DESIGN.lid.t / 2);
  const n = Math.max(1, Math.round(DESIGN.lid.t * g.h));
  const bottom = top + Math.max(n + 1, Math.round(depth * g.h)) - 1;
  /** @type {Array<[number, number]>} */
  const open = [];
  for (const [x, [, lidB]] of lid) {
    // (The white tucks right under the lid along its width, as on the smooth face: no skin
    // between the two where the ellipse's top curves away at this size.)
    const du = Math.abs(g.uOf(x) - white.u) / white.ru;
    for (let y = lidB + 1; y <= bottom; y++)
      if (g.inside(white, x, y, shift) || (du <= 1 && y === lidB + 1) || du <= 0.5) open.push([x, y]);
  }
  // (The hook on the lid's own columns, its last at least: past the lid it would stand apart.)
  const hook = new Map();
  const last = Math.max(...lid.keys());
  for (const [x, rows] of g.stroke(DESIGN.lid.hook, DESIGN.lid.t, shift - raise)) hook.set(Math.min(x, last), rows);
  return { lid, open, hook };
}

/**
 * How many rows his eyes go up in a cell this size so that a row of skin stays between the
 * open eye and the mouth (the smallest cells: in DESIGN they'd touch); 0 from a few pixels up.
 * The same for all four faces, so a blink or a smile never moves them.
 * @param {ReturnType<typeof canvas>} g
 */
function eyeShift(g) {
  const { lid, open } = openEye(g, false, 0);
  const bottom = Math.max(...open.map(([, y]) => y), ...[...lid.values()].map(([, b]) => b));
  const mouthTop = Math.min(
    ...[...g.stroke(DESIGN.mouth.neutral, DESIGN.mouth.t).values()].map(([t]) => t),
    ...g.blob(DESIGN.mouth.o).map(([, y]) => y),
  );
  return Math.min(0, mouthTop - 2 - bottom);
}

/**
 * [x, y] points by row: row → its xs, in order.
 * @param {Array<[number, number]>} points
 */
function rowsOf(points) {
  /** @type {Map<number, number[]>} */
  const rows = new Map();
  for (const [x, y] of points) rows.set(y, [...(rows.get(y) ?? []), x]);
  for (const xs of rows.values()) xs.sort((a, b) => a - b);
  return rows;
}

/**
 * The pixels of an ellipse `pw` columns wide and `pr` rows tall from column x0 and row y0 (a
 * half ellipse hanging from its top row when `hang`: a pupil under the lid), each row the
 * columns whose centres are inside it.
 * @param {number} x0
 * @param {number} y0
 * @param {number} pw
 * @param {number} pr
 * @param {boolean} hang
 */
function oval(x0, y0, pw, pr, hang) {
  const cx = x0 + pw / 2;
  /** @type {Array<[number, number]>} */
  const out = [];
  for (let k = 0; k < pr; k++) {
    const dy = hang ? (k + 0.5) / pr : (k + 0.5 - pr / 2) / (pr / 2);
    const half = (pw / 2) * Math.sqrt(Math.max(0, 1 - dy * dy));
    for (let x = x0; x < x0 + pw; x++) if (Math.abs(x + 0.5 - cx) <= half) out.push([x, y0 + k]);
  }
  return out;
}

/**
 * A stroke's steps joined along an edge (its rows by column, changed in place): where two
 * columns would meet only at a corner, the step's column holds both rows, so the page's dither
 * can't break the line into dashes. The pixel goes in the upper row (that run reaches one
 * further), or, where the lower run is a single pixel (an end), in the lower row under the upper
 * run's end, so an end never stands up as a leg.
 * @param {Map<number, [number, number]>} rows
 */
function joinStairs(rows) {
  const xs = [...rows.keys()].sort((a, b) => a - b);
  const was = xs.map((x) => rows.get(x));
  const same = (i, j) => was[i][0] === was[j][0] && was[i][1] === was[j][1];
  const runOf = (i) => {
    let n = 1;
    for (let j = i - 1; j >= 0 && same(j, i); j--) n++;
    for (let j = i + 1; j < xs.length && same(j, i); j++) n++;
    return n;
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    const [a, b] = [was[i], was[i + 1]];
    let up;
    let lo;
    if (b[0] > a[1]) [up, lo] = [i, i + 1];
    else if (a[0] > b[1]) [up, lo] = [i + 1, i];
    else continue;
    const grow = (k, t, bottom) => {
      const [t0, b0] = rows.get(xs[k]);
      rows.set(xs[k], [Math.min(t0, t), Math.max(b0, bottom)]);
    };
    if (runOf(lo) === 1) grow(up, was[up][0], was[lo][0]);
    else grow(lo, was[up][1], was[lo][1]);
  }
}

/**
 * The open eye's iris on cell `g`: DESIGN's ellipse, or, surprised from DESIGN.pupil.wideFrom, the
 * same ellipse fitted round its pupil (as many columns either side of it, so the two stay
 * centred however the cell rounds) with that pupil, `pw` columns by `pr` rows, centred in it.
 * @param {ReturnType<typeof canvas>} g
 * @param {'neutral'|'surprised'} name
 * @param {number} shift
 */
function irisOf(g, name, shift) {
  const { w, h } = g;
  const e = DESIGN.iris[name];
  if (name !== 'surprised' || w < DESIGN.pupil.wideFrom) return { iris: e, pupil: null };
  const pw = Math.round(DESIGN.pupil.wide * w);
  const pr = Math.max(2, Math.round(pw / DESIGN.pupil.flat));
  const side = Math.max(1, Math.round((2 * e.ru * w - pw) / 2));
  const across = pw + 2 * side;
  const x0 = Math.round(e.u * w - across / 2);
  const iris = { u: (x0 + across / 2) / w, v: e.v, ru: across / 2 / w, rv: e.rv };
  const y0 = Math.round(DESIGN.pupil.surprised.v * h - pr / 2) + shift;
  return { iris, pupil: oval(x0 + side, y0, pw, pr, false) };
}

/**
 * The open eye's pupil on cell `g`, as its pixels: neutral from DESIGN.pupil.barFrom a flat bar
 * centred in the iris's top row, right under the lid from DESIGN.iris.bandFrom and a row of grey
 * under it in the cells under that (where the dither ran the two together); surprised from
 * DESIGN.pupil.wideFrom the oval irisOf fits the iris round; otherwise DESIGN's ellipse, a pixel
 * at least.
 * @param {ReturnType<typeof canvas>} g
 * @param {'neutral'|'surprised'} name
 * @param {number} shift
 * @param {{lid: Map<number, [number, number]>, open: Array<[number, number]>}} eye
 * @param {Array<[number, number]>} iris  the iris's pixels
 * @param {Array<[number, number]>|null} fitted  irisOf's pupil
 * @returns {Array<[number, number]>}
 */
function pupilOf(g, name, shift, { lid, open }, iris, fitted) {
  const { w, h } = g;
  if (name === 'neutral' && w >= DESIGN.pupil.barFrom) {
    const xs = [...lid.keys()].sort((a, b) => a - b);
    const lidB = lid.get(xs[xs.length >> 1])[1];
    const banded = w >= DESIGN.iris.bandFrom;
    const row = rowsOf(iris).get(lidB + 1) ?? [];
    const pw = Math.round(DESIGN.pupil.bar * w);
    const pr = banded ? Math.max(2, Math.round(h / DESIGN.pupil.barRows)) : 2;
    const x0 = row.length ? row[0] + Math.round((row.at(-1) - row[0] + 1 - pw) / 2) : Math.round(0.39 * w - pw / 2);
    return oval(x0, lidB + (banded ? 1 : 2), pw, pr, true);
  }
  if (fitted) return fitted;
  const pupil = DESIGN.pupil[name];
  const dots = open.filter(([x, y]) => g.inside(pupil, x, y, shift));
  if (dots.length) return dots;
  // (The pupil a pixel at least: the opening's pixel nearest its centre.)
  const d = ([x, y]) => (g.uOf(x) - pupil.u) ** 2 + ((g.vOf(y - shift) - pupil.v) * 0.5) ** 2;
  return [open.reduce((a, b) => (d(b) < d(a) ? b : a))];
}

/**
 * The iris's darker band on cell `g` from DESIGN.iris.bandFrom (none under that): the iris kept a
 * row of white at least over the lash, its narrow tip under the band left white (a drip, or one
 * dark stroke from the pupil down to the lash); then neutral, the band its bottom rows
 * (DESIGN.iris.bandRows of the cell, 2 at least, under a row of grey under the pupil), each its
 * whole width, the lowest a pixel in at each end; surprised, its rows from DESIGN.iris.band down,
 * one at least. Returns the iris's pixels left and the band's, as y × w + x.
 * @param {ReturnType<typeof canvas>} g
 * @param {'neutral'|'surprised'} name
 * @param {number} shift
 * @param {Array<[number, number]>} iris
 * @param {Array<[number, number]>} lash
 * @param {Array<[number, number]>} pupil
 */
function bandOf(g, name, shift, iris, lash, pupil) {
  const { w, h } = g;
  /** @type {Set<number>} */
  const band = new Set();
  if (w < DESIGN.iris.bandFrom) return { iris, band };
  const lashTop = Math.min(h, ...lash.map(([, y]) => y));
  let kept = iris.filter(([, y]) => y < lashTop - 1);
  let rows = rowsOf(kept);
  const widest = Math.max(...[...rows.values()].map((r) => r.length));
  let lowest = Math.max(...rows.keys());
  while (rows.get(lowest).length < widest / 2) {
    kept = kept.filter(([, y]) => y !== lowest);
    rows = rowsOf(kept);
    lowest = Math.max(...rows.keys());
  }
  let from = Math.min(lowest, Math.ceil(DESIGN.iris.band * h - 0.5) + shift);
  if (name === 'neutral') {
    const under = Math.max(...pupil.map(([, y]) => y)) + 2;
    from = Math.max(under, lowest - Math.max(2, Math.round(DESIGN.iris.bandRows * h)) + 1);
    if (lowest > from) {
      const over = rows.get(lowest - 1);
      kept = kept.filter(([x, y]) => y !== lowest || (x > over[0] && x < over.at(-1)));
    }
  }
  for (const [x, y] of kept) if (y >= Math.min(from, lowest)) band.add(y * w + x);
  return { iris: kept, band };
}

/**
 * The open eye on cell `g` (neutral, or surprised): the white, the iris and its darker band, the
 * lash, the pupil, the lid and its hook, drawn as the smooth eye reads at each size (pupilOf,
 * bandOf: a flat bar of a pupil, a grey row between it and the band, the band a full row or two,
 * no iris over the lash), so the page's dither never runs the pupil into the lid nor pupil, band
 * and lash into one dark stroke. Returns the lid's rows.
 * @param {ReturnType<typeof canvas>} g
 * @param {'neutral'|'surprised'} name
 * @param {number} shift
 * @param {ReturnType<typeof colours>} c
 */
function drawOpenEye(g, name, shift, c) {
  const { w } = g;
  const eye = openEye(g, name === 'surprised', shift);
  const { lid, open, hook } = eye;
  const opened = new Set(open.map(([x, y]) => y * w + x));
  // The lash: the white's bottom pixel along the middle, where the white keeps 4 rows over it
  // (rowsOf with x and y swapped: x → the opening's rows there).
  const lash = [...rowsOf(open.map(([x, y]) => [y, x]))]
    .filter(([x, ys]) => g.uOf(x) >= DESIGN.lash.u[0] && g.uOf(x) <= DESIGN.lash.u[1] && ys.length >= 5)
    .map(([x, ys]) => /** @type {[number, number]} */ ([x, Math.max(...ys)]));
  const fitted = irisOf(g, name, shift);
  const round = open.filter(([x, y]) => g.inside(fitted.iris, x, y, shift));
  const dots = pupilOf(g, name, shift, eye, round, fitted.pupil);
  const { iris, band } = bandOf(g, name, shift, round, lash, dots);
  for (const [x, y] of open) g.put(x, y, c.white);
  for (const [x, y] of iris) g.put(x, y, band.has(y * w + x) ? c.irisDark : c.iris);
  for (const [x, y] of lash) g.put(x, y, c.lash);
  for (const [x, y] of dots) g.put(x, y, c.ink);
  g.paint(lid, c.ink);
  // The hook: the lid's outer end turned down, below the lid where the white isn't.
  for (const [x, [t, b]] of hook) {
    const lidB = lid.get(x)?.[1] ?? t - 1;
    for (let y = Math.min(t, lidB + 1); y <= b; y++) if (!opened.has(y * w + x)) g.put(x, y, c.ink);
  }
  return lid;
}

/**
 * The brow's columns on cell `g` from DESIGN.brow.insetFrom (null under that: the stroke's own):
 * the neutral lid's, hook and all, a little in from its inner end and well short of its hook, as
 * on the smooth face; the same in every face, so a blink or a smile never moves it.
 * @param {ReturnType<typeof canvas>} g
 * @param {number} shift
 * @returns {[number, number]|null}
 */
function browColumns(g, shift) {
  if (g.w < DESIGN.brow.insetFrom) return null;
  const { lid, hook } = openEye(g, false, shift);
  const span = [...lid.keys(), ...hook.keys()];
  const [l0, l1] = [Math.min(...span), Math.max(...span)];
  const reach = l1 - l0 + 1;
  return [l0 + Math.max(1, Math.round(DESIGN.brow.inset[0] * reach)), l1 - Math.round(DESIGN.brow.inset[1] * reach)];
}

/**
 * The closed lid on cell `g`, level where a column of it came out over the rest (no stray pixel
 * over its inner end), its steps joined along an edge from DESIGN.arc.joinFrom.
 * @param {ReturnType<typeof canvas>} g
 * @param {number} shift
 * @param {ReturnType<typeof colours>} c
 */
function drawClosed(g, shift, c) {
  const line = g.stroke(DESIGN.closed.line, DESIGN.closed.t, shift);
  const tops = [...line.values()].map(([t]) => t);
  const count = (t) => tops.filter((u) => u === t).length;
  const level = [...tops].sort((a, b) => count(b) - count(a))[0];
  for (const [x, [t, b]] of line) if (t < level) line.set(x, [level, level + b - t]);
  if (g.w >= DESIGN.arc.joinFrom) joinStairs(line);
  g.paint(line, c.ink);
}

/**
 * The happy eye on cell `g`: the blush, one row as thin as the smooth one reads (from 5 px), and
 * the arc, never a box: where an end came out level with its middle it goes a row under the
 * column inside it (of two columns, the outer one reaches a row down); from DESIGN.arc.joinFrom
 * its steps are joined along an edge, so the dither keeps it one line.
 * @param {ReturnType<typeof canvas>} g
 * @param {number} shift
 * @param {ReturnType<typeof colours>} c
 */
function drawHappy(g, shift, c) {
  const { w, h } = g;
  if (w >= 5) {
    const { u, v, ru } = DESIGN.blush;
    const x0 = Math.round((u - ru) * w);
    const y = Math.round(v * h - 0.5);
    for (let x = x0; x < x0 + Math.max(1, Math.round(2 * ru * w)); x++) g.put(x, y, c.blush);
  }
  const arc = g.stroke(DESIGN.arc.line, DESIGN.arc.t, shift);
  const xs = [...arc.keys()].sort((a, b) => a - b);
  const midTop = arc.get(xs[xs.length >> 1])[0];
  if (xs.length === 2) {
    const [t, b] = arc.get(xs[1]);
    if (t <= midTop) arc.set(xs[1], [t, b + 1]);
  } else
    for (const [end, inner] of [
      [xs[0], xs[1]],
      [xs.at(-1), xs.at(-2)],
    ]) {
      const [t, b] = arc.get(end);
      const [it] = arc.get(inner);
      if (t <= midTop) arc.set(end, [it + 1, it + 1 + b - t]);
    }
  if (w >= DESIGN.arc.joinFrom) joinStairs(arc);
  g.paint(arc, c.ink);
}

/**
 * The mouth on cell `g`. Surprised, a small dark o, round: from 14 px a dot two rows tall a column
 * a side (2 × 2), from DESIGN.mouth.roundFrom wider with its outer column a mid brown, its top and
 * bottom rows a column narrower once it's three rows tall; under 14 px two rows tall from a 6 px
 * cell. Otherwise the small line: from DESIGN.mouth.tickFrom neutral a tiny ㅅ (its middle half a
 * row up), from DESIGN.mouth.smileFrom happy turned up (its outer half a row up).
 * @param {ReturnType<typeof canvas>} g
 * @param {string} name
 * @param {ReturnType<typeof colours>} c
 */
function drawMouth(g, name, c) {
  const { w, h } = g;
  const { o } = DESIGN.mouth;
  if (name === 'surprised' && w >= DESIGN.mouth.roundFrom) {
    const half = Math.max(2, Math.round(o.ru * w + 0.5));
    const rows = Math.max(2, Math.round(DESIGN.mouth.oRows * h));
    const y0 = Math.round(o.v * h - rows / 2);
    for (let k = 0; k < rows; k++) {
      const n = half - (rows >= 3 && (k === 0 || k === rows - 1) ? 1 : 0);
      for (let x = 0; x < n; x++) g.put(x, y0 + k, x === n - 1 ? c.openEdge : c.open);
    }
  } else if (name === 'surprised') {
    const dot = w >= 14 ? [[0, Math.round(o.v * h - 1)]] : g.blob(o);
    if (w >= 6 && new Set(dot.map(([, y]) => y)).size < 2) dot.push(...dot.map(([x, y]) => [x, y + 1]));
    for (const [x, y] of dot) g.put(x, y, c.open);
  } else {
    const happy = name === 'happy';
    const mouth = g.stroke(DESIGN.mouth[happy ? 'happy' : 'neutral'], DESIGN.mouth.t);
    const n = mouth.size;
    if (n >= 2 && w >= (happy ? DESIGN.mouth.smileFrom : DESIGN.mouth.tickFrom))
      for (const [x, [t, b]] of mouth) if (happy ? x >= n / 2 : x < n / 2) mouth.set(x, [t - 1, b - 1]);
    g.paint(mouth, c.mouth);
  }
}

/**
 * One face in a w × h cell (its left edge the middle of his face), RGBA: DESIGN scaled to the cell
 * and drawn in whole pixels, a stroke column by column and a shape by the pixels whose centres
 * are inside it (canvas). Kept readable as it's scaled down: the white at least a row under the
 * lid, the pupil a pixel at least, the surprised lid a row higher at least, the brow raised to
 * leave a row of skin over the lid (none under 5 px) and from 20 px over the lid's middle
 * (browColumns), the eyes raised to leave one over the mouth in the smallest cells, the blush
 * (from 5 px) one row and a pixel at least, the mouth a pixel at least (a tiny ㅅ, or a smile, in
 * the larger cells), the surprised o two rows tall from a 6 px cell and round from 26, the lash
 * only where the white has rows to spare, the closed lid and the happy arc never a stray pixel
 * nor a box.
 * @param {string} name  a key of CELLS
 * @param {number} w
 * @param {number} h
 * @param {ReturnType<typeof colours>} c
 */
function face(name, w, h, c) {
  const g = canvas(w, h, c.skin[name]);
  const shift = eyeShift(g);
  const cols = browColumns(g, shift);
  /** The brow over the lid `lid` (rows by column): raised to leave a row of skin between. */
  const brow = (pts, lid) => {
    if (w < 5) return;
    let rows = g.stroke(pts, DESIGN.brow.t, shift);
    if (cols) {
      const xs = [...rows.keys()];
      const near = (x) => xs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
      const from = rows;
      rows = new Map(
        Array.from({ length: cols[1] - cols[0] + 1 }, (_, i) => [cols[0] + i, from.get(near(cols[0] + i))]),
      );
    }
    let lift = 0;
    for (const [x, [, b]] of rows) {
      const under = lid.get(x) ?? lid.get(x - 1) ?? lid.get(x + 1);
      if (under) lift = Math.max(lift, b - (under[0] - 2));
    }
    for (const [x, [t, b]] of rows) rows.set(x, [t - lift, b - lift]);
    g.paint(rows, c.ink);
  };
  if (name === 'neutral' || name === 'surprised') brow(DESIGN.brow[name], drawOpenEye(g, name, shift, c));
  else {
    if (name === 'blink') drawClosed(g, shift, c);
    else drawHappy(g, shift, c);
    brow(DESIGN.brow[name === 'blink' ? 'neutral' : 'happy'], openEye(g, false, shift).lid);
  }
  drawMouth(g, name, c);
  return g.cell;
}

const source = glbImage(GLB, 'NEWT_Face');
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const c = colours(data, info.width);
console.log(
  `colours: ${Object.entries(c)
    .filter(([k]) => k !== 'skin')
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}`,
);
const composite = [];
/** @type {Array<{w: number, h: number, faces: Record<string, Uint8Array>}>} */
const drawn = [];
for (const s of FACE_LAYOUT) {
  /** @type {Record<string, Uint8Array>} */
  const faces = {};
  for (const [name, [cx, cy]] of Object.entries(CELLS)) {
    faces[name] = face(name, s.w, s.h, c);
    composite.push({
      input: await sharp(Buffer.from(faces[name]), { raw: { width: s.w, height: s.h, channels: 4 } })
        .png()
        .toBuffer(),
      left: s.x + cx * s.w,
      top: s.y + cy * s.h,
    });
  }
  drawn.push({ w: s.w, h: s.h, faces });
}
// (The space under the smaller sheets is skin too: nothing samples it.)
const [r, g, b] = c.skin.neutral;
await sharp({ create: { width: FACE_IMAGE.w, height: FACE_IMAGE.h, channels: 4, background: { r, g, b, alpha: 1 } } })
  .composite(composite)
  .png({ compressionLevel: 9 })
  .toFile(OUT);
console.log(`✓ ${OUT}: ${FACE_IMAGE.w}×${FACE_IMAGE.h}, cells ${FACE_LAYOUT.map((s) => `${s.w}×${s.h}`).join(' ')}`);

if (PREVIEW) {
  // Each size's faces mirrored into whole faces, a row a size, ×8, on grey.
  const S = 8;
  const tiles = [];
  let y = 0;
  let width = 0;
  for (const { w, h, faces } of drawn) {
    let x = 0;
    for (const cell of Object.values(faces)) {
      const raw = sharp(Buffer.from(cell), { raw: { width: w, height: h, channels: 4 } });
      const whole = await sharp({ create: { width: 2 * w, height: h, channels: 4, background: '#000' } })
        .composite([
          { input: await raw.clone().flop().png().toBuffer(), left: 0, top: 0 },
          { input: await raw.clone().png().toBuffer(), left: w, top: 0 },
        ])
        .png()
        .toBuffer();
      tiles.push({
        input: await sharp(whole)
          .resize(2 * w * S, h * S, { kernel: 'nearest' })
          .png()
          .toBuffer(),
        left: x,
        top: y,
      });
      x += 2 * w * S + 8;
    }
    width = Math.max(width, x);
    y += h * S + 8;
  }
  await sharp({ create: { width, height: y, channels: 4, background: '#777' } })
    .composite(tiles)
    .png()
    .toFile(PREVIEW);
  console.log(`✓ ${PREVIEW}`);
}
