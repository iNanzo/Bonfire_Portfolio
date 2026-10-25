// NEWT's pixel dialogue faces (sad, angry, shy, smug: clips.js EXTRA_FACES) for tools/newt-face.mjs,
// which draws them onto public/models/newt-face-extra.png: each is neutral's pixel face as that
// tool draws it, its parts moved as tools/newt-face-design.mjs moves his smooth face's (the lid
// column by column, the brow, the white, the iris and pupil), by the same rules (the opening under
// the lid, the pupil a bar under it, the band, the lash, the brow over a row of skin), and drawn as
// each reads in pixels where its design as it is wouldn't (EXTRA_PIXELS). The first four's design
// and drawing come in as a kit from newt-face.mjs, so the two never drift apart.
import { CELL, EXTRA, NEUTRAL, SHY_BLUSH } from './newt-face-design.mjs';

/**
 * @typedef {object} Kit  what newt-face.mjs draws the first four with
 * @property {any} DESIGN  their design, measured off the smooth sheet (shares of a cell)
 * @property {(w: number, h: number, skin: number[]) => any} canvas  a cell to draw on
 * @property {(g: any) => number} eyeShift  how many rows the eyes go up in the smallest cells
 * @property {(g: any, shift: number) => [number, number]|null} browColumns  the brows' columns
 * @property {(...a: any[]) => {iris: Array<[number, number]>, band: Set<number>}} bandOf  the iris's band
 * @property {(points: Array<[number, number]>) => Map<number, number[]>} rowsOf  points by row
 * @property {(x0: number, y0: number, pw: number, pr: number, hang: boolean) => Array<[number, number]>} oval
 * @property {(rows: Map<number, [number, number]>) => void} joinStairs  a stroke's steps joined along an edge
 */

/**
 * How the dialogue faces read in pixels, where drawing their design as it is wouldn't (each a cell
 * width in pixels from which it holds): a brow tilted a row at least from `tiltFrom` (sad up toward
 * the middle, angry down), its steps joined along an edge; the iris and pupil moved (shy and sad
 * looking down) from `gazeFrom` (in a smaller cell the iris would cover the white); smug's lid a row
 * lower than neutral's at least from `lowerFrom` (half-lidded; smaller, the eye would close); the
 * mouths by their columns a side (the cell's left edge is his face's middle): sad turned down at
 * its end from `frownFrom`, angry flat with its end turned down from `tightFrom`, shy a wave from
 * `waveFrom` (its middle down, the next column up, the next down: 3 a side), smug a ω from
 * `catFrom` (its middle up, then down, its end up again: 3 or 4 a side) and a small smile from
 * `smirkFrom` under that (its end a row up); the shy blush an oval two rows tall at least from
 * `blushFrom`, its hatching (a diagonal pixel line a hatch) from `hatchFrom`. Shy's pupil hangs a
 * row at least under the lid from 16 px (DESIGN.pupil.barFrom: he's looking down).
 */
export const EXTRA_PIXELS = {
  tiltFrom: 8,
  gazeFrom: 12,
  lowerFrom: 12,
  frownFrom: 10,
  tightFrom: 14,
  waveFrom: 26,
  smirkFrom: 8,
  catFrom: 20,
  blushFrom: 8,
  hatchFrom: 40,
};

/** A line's y at x, linear between its points (clamped to its ends), in the line's own units. */
function along(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++)
    if (x <= pts[i][0]) {
      const [[x0, y0], [x1, y1]] = [pts[i - 1], pts[i]];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  return pts.at(-1)[1];
}

/**
 * DESIGN's neutral line `pts` (shares of a cell) moved down as far as the dialogue face's line
 * `to` is under his smooth neutral face's `from` at each point, so a face that doesn't move a part
 * draws it exactly as neutral does.
 * @param {number[][]} pts
 * @param {number[][]} from
 * @param {number[][]} to
 */
const moved = (pts, from, to) => pts.map(([u, v]) => [u, v + (along(to, u * CELL) - along(from, u * CELL)) / CELL]);

/**
 * A dialogue face's design in DESIGN's terms (shares of a cell): neutral's lid, hook, brow, white,
 * iris and pupil moved and resized as the face moves his smooth neutral's (EXTRA against
 * NEUTRAL); its mouth and blush its own, scaled to shares.
 * @param {any} DESIGN
 * @param {'sad'|'angry'|'shy'|'smug'} name
 */
export function extraDesign(DESIGN, name) {
  const f = EXTRA[name];
  const n = NEUTRAL;
  const slope = along(f.brow.pts, 297) - along(f.brow.pts, 105);
  return {
    lid: moved(DESIGN.lid.neutral, n.lid.pts, f.lid.pts),
    hook: moved(DESIGN.lid.hook, n.hook?.pts ?? n.lid.pts, f.hook?.pts ?? f.lid.pts),
    brow: moved(DESIGN.brow.neutral, n.brow.pts, f.brow.pts),
    // (Tilted where its ends are 15 px of the smooth cell apart or more, sad's and angry's; smug's
    // and shy's gentler slopes show where the cell has the rows.)
    browTilt: Math.abs(slope) >= 15 ? Math.sign(slope) : 0,
    lower: name === 'smug',
    white: {
      ...DESIGN.white,
      v: DESIGN.white.v + (f.white.cy - n.white.cy) / CELL,
      rv: DESIGN.white.rv + (f.white.ry - n.white.ry) / CELL,
    },
    iris: { ...DESIGN.iris.neutral, v: DESIGN.iris.neutral.v + (f.iris.cy - n.iris.cy) / CELL },
    pupil: {
      ...DESIGN.pupil.neutral,
      v: DESIGN.pupil.neutral.v + (f.pupil.cy - n.pupil.cy) / CELL,
      scale: f.pupil.rx / n.pupil.rx,
    },
    // (Looking down: the pupil apart from the lid.)
    drop: f.pupil.cy - f.pupil.ry > along(f.lid.pts, f.pupil.cx) + f.lid.w / 2,
    lash: Boolean(f.lash),
    mouth: f.mouth.pts.map(([x, y]) => [x / CELL, y / CELL]),
    blush: f.blush && {
      u: f.blush.cx / CELL,
      v: f.blush.cy / CELL,
      ru: f.blush.rx / CELL,
      rv: f.blush.ry / CELL,
      hatch: f.blush.hatch.map((pts) => pts.map(([x, y]) => [x / CELL, y / CELL])),
    },
  };
}

/** @typedef {ReturnType<typeof extraDesign>} ExtraDesign */

/**
 * The lid on cell `g`: neutral's as drawn, each column moved as many rows as the face moves the
 * lid there (so where it doesn't move it, it's on neutral's row; smug's a row lower at least from
 * EXTRA_PIXELS.lowerFrom), never so low it leaves under two rows open over `bottom`; no column a
 * row over or under both its neighbours (where two roundings cross); from 14 px its steps joined
 * along an edge. Returns its rows by column and neutral's top row.
 * @param {Kit} k
 * @param {any} g
 * @param {ExtraDesign} d
 * @param {number} shift
 */
function lidOf(k, g, d, shift) {
  const { DESIGN } = k;
  const { w, h } = g;
  const flat = g.stroke(DESIGN.lid.neutral, DESIGN.lid.t, shift, w >= DESIGN.lid.levelFrom ? DESIGN.lid.level : null);
  const top = Math.min(...[...flat.values()].map(([t]) => t));
  const depth = d.white.v + d.white.rv - (DESIGN.lid.neutral[3][1] - DESIGN.lid.t / 2);
  const n = Math.max(1, Math.round(DESIGN.lid.t * h));
  const bottom = top + Math.max(n + 1, Math.round(depth * h)) - 1;
  const least = d.lower && w >= EXTRA_PIXELS.lowerFrom ? 1 : 0;
  /** @type {Map<number, [number, number]>} */
  const lid = new Map();
  for (const [x, [t, b]] of flat) {
    const by = Math.round((along(d.lid, g.uOf(x)) - along(DESIGN.lid.neutral, g.uOf(x))) * h);
    const move = Math.min(Math.max(0, bottom - b - 2), Math.max(least, by));
    lid.set(x, [t + move, b + move]);
  }
  const xs = [...lid.keys()].sort((a, b) => a - b);
  for (let i = 1; i + 1 < xs.length; i++) {
    const [[l], [t, b], [r]] = [lid.get(xs[i - 1]), lid.get(xs[i]), lid.get(xs[i + 1])];
    const to = Math.min(Math.max(t, Math.min(l, r)), Math.max(l, r));
    lid.set(xs[i], [to, to + b - t]);
  }
  if (w >= 14) k.joinStairs(lid);
  return { lid, bottom };
}

/**
 * The pupil on cell `g`: from DESIGN.pupil.barFrom a bar hanging from the lid over the iris's
 * middle (the lid's lowest row there; a row of grey between below DESIGN.iris.bandFrom, as
 * neutral's; shy's further down, looking down), as wide as the face's pupil makes neutral's bar;
 * under that the face's pupil's ellipse; a pixel at least (the opening's nearest its centre).
 * @param {Kit} k
 * @param {any} g
 * @param {ExtraDesign} d
 * @param {number} shift
 * @param {Map<number, [number, number]>} lid
 * @param {Array<[number, number]>} open
 * @param {Array<[number, number]>} iris
 */
function pupilOf(k, g, d, shift, lid, open, iris) {
  const { DESIGN } = k;
  const { w, h } = g;
  const opened = new Set(open.map(([x, y]) => y * w + x));
  let dots;
  if (w >= DESIGN.pupil.barFrom) {
    const mid = Math.round(d.pupil.u * w - 0.5);
    const lidB = Math.max(...[mid - 1, mid, mid + 1].map((x) => lid.get(x)?.[1] ?? -1));
    const banded = w >= DESIGN.iris.bandFrom;
    const drop = d.drop ? Math.max(1, Math.round(((d.pupil.v - DESIGN.pupil.neutral.v) * h) / 2)) : 0;
    const y0 = lidB + (banded ? 1 : 2) + drop;
    const byRow = k.rowsOf(iris);
    const row = byRow.get(y0) ?? byRow.get(lidB + 1) ?? [];
    const pw = Math.max(2, Math.round(DESIGN.pupil.bar * d.pupil.scale * w));
    const pr = banded ? Math.max(2, Math.round(h / DESIGN.pupil.barRows)) : 2;
    const x0 = row.length
      ? row[0] + Math.round((row.at(-1) - row[0] + 1 - pw) / 2)
      : Math.round(d.pupil.u * w - pw / 2);
    dots = k.oval(x0, y0, pw, pr, true).filter(([x, y]) => opened.has(y * w + x));
  } else {
    const p = { ...d.pupil, ru: d.pupil.ru * d.pupil.scale };
    dots = open.filter(([x, y]) => g.inside(p, x, y, shift));
  }
  if (dots.length) return dots;
  const dist = ([x, y]) => (g.uOf(x) - d.pupil.u) ** 2 + ((g.vOf(y - shift) - d.pupil.v) * 0.5) ** 2;
  return [open.reduce((a, b) => (dist(b) < dist(a) ? b : a))];
}

/**
 * A dialogue face's open eye on cell `g`, by the open eye's rules (newt-face.mjs openEye, pupilOf,
 * bandOf) from its own lid, hook, white, iris and pupil: the opening under its lid (lidOf) down to
 * its white's bottom (as deep under neutral's lid top as its white reaches), the pupil (pupilOf),
 * the band, the lash where the face has one, the hook. Under EXTRA_PIXELS.gazeFrom the iris and
 * pupil stay where neutral's are. Returns the lid's rows.
 * @param {Kit} k
 * @param {any} g
 * @param {ExtraDesign} gazed
 * @param {number} shift
 * @param {any} c  the colours
 */
function drawEye(k, g, gazed, shift, c) {
  const { DESIGN } = k;
  const { w } = g;
  const still = { iris: DESIGN.iris.neutral, pupil: { ...gazed.pupil, v: DESIGN.pupil.neutral.v }, drop: false };
  const d = w >= EXTRA_PIXELS.gazeFrom ? gazed : { ...gazed, ...still };
  const { lid, bottom } = lidOf(k, g, d, shift);
  /** @type {Array<[number, number]>} */
  const open = [];
  for (const [x, [, lidB]] of lid) {
    const du = Math.abs(g.uOf(x) - d.white.u) / d.white.ru;
    for (let y = lidB + 1; y <= bottom; y++)
      if (g.inside(d.white, x, y, shift) || (du <= 1 && y === lidB + 1) || du <= 0.5) open.push([x, y]);
  }
  const opened = new Set(open.map(([x, y]) => y * w + x));
  const lash = d.lash
    ? [...k.rowsOf(open.map(([x, y]) => [y, x]))]
        .filter(([x, ys]) => g.uOf(x) >= DESIGN.lash.u[0] && g.uOf(x) <= DESIGN.lash.u[1] && ys.length >= 5)
        .map(([x, ys]) => /** @type {[number, number]} */ ([x, Math.max(...ys)]))
    : [];
  const iris = open.filter(([x, y]) => g.inside(d.iris, x, y, shift));
  const dots = pupilOf(k, g, d, shift, lid, open, iris);
  const { iris: kept, band } = k.bandOf(g, 'neutral', shift, iris, lash, dots, opened);
  for (const [x, y] of open) g.put(x, y, c.white);
  for (const [x, y] of kept) g.put(x, y, band.has(y * w + x) ? c.irisDark : c.iris);
  for (const [x, y] of lash) g.put(x, y, c.lash);
  for (const [x, y] of dots) g.put(x, y, c.ink);
  g.paint(lid, c.ink);
  // The hook, on the lid's own columns (its last at least), below the lid down to the white (never
  // past it: a drooping lid's hook would hang a lone pixel under the eye).
  const last = Math.max(...lid.keys());
  for (const [hx, [t, b]] of g.stroke(d.hook, DESIGN.lid.t, shift)) {
    const x = Math.min(hx, last);
    const lidB = lid.get(x)?.[1] ?? t - 1;
    for (let y = Math.min(t, lidB + 1); y <= b && !opened.has(y * w + x); y++) g.put(x, y, c.ink);
  }
  return lid;
}

/**
 * A dialogue face's brow on cell `g` over its lid `lid`: its own line (rows by column where it
 * strays half a row, as stroke draws it; tilted a row at least from EXTRA_PIXELS.tiltFrom, its
 * raised half a row up), over neutral's columns from DESIGN.brow.insetFrom (browColumns), its steps
 * joined along an edge from EXTRA_PIXELS.tiltFrom (a step meeting only at a corner reads as two
 * dashes), raised to leave a row of skin over the lid all along.
 * @param {Kit} k
 * @param {any} g
 * @param {ExtraDesign} d
 * @param {Map<number, [number, number]>} lid
 * @param {number} shift
 * @param {any} c
 */
function drawBrow(k, g, d, lid, shift, c) {
  const { w } = g;
  if (w < 5) return;
  let rows = g.stroke(d.brow, k.DESIGN.brow.t, shift);
  const cols = k.browColumns(g, shift);
  if (cols) {
    const xs = [...rows.keys()];
    const near = (x) => xs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const from = rows;
    rows = new Map(Array.from({ length: cols[1] - cols[0] + 1 }, (_, i) => [cols[0] + i, from.get(near(cols[0] + i))]));
  }
  const xs = [...rows.keys()].sort((a, b) => a - b);
  if (w >= EXTRA_PIXELS.tiltFrom && d.browTilt && new Set(xs.map((x) => rows.get(x)[0])).size === 1)
    xs.forEach((x, i) => {
      const [t, b] = rows.get(x);
      if (d.browTilt > 0 ? i < xs.length / 2 : i >= xs.length / 2) rows.set(x, [t - 1, b - 1]);
    });
  if (w >= EXTRA_PIXELS.tiltFrom) k.joinStairs(rows);
  let lift = 0;
  for (const [x, [, b]] of rows) {
    const under = lid.get(x) ?? lid.get(x - 1) ?? lid.get(x + 1);
    if (under) lift = Math.max(lift, b - (under[0] - 2));
  }
  for (const [x, [t, b]] of rows) rows.set(x, [t - lift, b - lift]);
  g.paint(rows, c.ink);
}

/**
 * A dialogue face's mouth on cell `g`, a row thick, its middle at column 0: its line's row at each
 * column (as many columns as it's long, a pixel at least), drawn as each reads in pixels
 * (EXTRA_PIXELS): sad turned down, angry flat with its end down, shy a wave, smug a ω (a small
 * smile in the smaller cells); on its mean row where none of those holds yet.
 * @param {any} g
 * @param {'sad'|'angry'|'shy'|'smug'} name
 * @param {ExtraDesign} d
 * @param {any} c
 */
function drawMouth(g, name, d, c) {
  const { w, h } = g;
  const line = d.mouth.map(([u, v]) => [u * CELL, v]);
  const base = Math.round((d.mouth.reduce((s, [, v]) => s + v, 0) / d.mouth.length) * h - 0.5);
  let n = Math.max(1, Math.round(d.mouth.at(-1)[0] * w));
  /** @type {number[]} each column's row */
  let rows = Array.from({ length: n }, (_, x) => Math.round(along(line, g.uOf(x) * CELL) * h - 0.5));
  if (name === 'sad' && w >= EXTRA_PIXELS.frownFrom) {
    // (Never up again once down; its end a row under its middle at least.)
    n = Math.max(2, n);
    const top = Math.min(...rows);
    rows = Array.from({ length: n }, (_, x) => Math.max(rows[x] ?? top, top));
    if (rows[n - 1] === top) rows[n - 1] = top + 1;
    for (let x = 1; x < n; x++) rows[x] = Math.max(rows[x], rows[x - 1]);
  } else if (name === 'angry' && w >= EXTRA_PIXELS.tightFrom) {
    n = Math.max(3, n);
    rows = Array.from({ length: n }, (_, x) => base + (x === n - 1 ? 1 : 0));
  } else if (name === 'shy' && w >= EXTRA_PIXELS.waveFrom) rows = [base, base - 1, base];
  else if (name === 'smug' && w >= EXTRA_PIXELS.catFrom) {
    n = Math.max(3, Math.min(4, n));
    rows = Array.from({ length: n }, (_, x) => (x === 0 || x === n - 1 ? base - 1 : base));
  } else if (name === 'smug' && w >= EXTRA_PIXELS.smirkFrom) {
    n = Math.max(2, n);
    rows = Array.from({ length: n }, (_, x) => (x === n - 1 ? base - 1 : base));
  } else rows = Array.from({ length: n }, () => base);
  rows.forEach((y, x) => g.put(x, y, c.mouth));
}

/**
 * The shy blush on cell `g`: an oval as the design has it (a row at least; two from
 * EXTRA_PIXELS.blushFrom, its top and bottom rows a pixel in at each end from three), in the
 * strong blush's colour, its hatching from EXTRA_PIXELS.hatchFrom (each hatch a diagonal line of
 * pixels in the darker colour, inside it).
 * @param {any} g
 * @param {NonNullable<ExtraDesign['blush']>} b
 */
function drawBlush(g, b) {
  const { w, h } = g;
  const x0 = Math.round((b.u - b.ru) * w);
  const cols = Math.max(1, Math.round(2 * b.ru * w));
  const rows = w >= EXTRA_PIXELS.blushFrom ? Math.max(2, Math.round(2 * b.rv * h)) : 1;
  const y0 = Math.round(b.v * h - rows / 2);
  const inside = new Set();
  for (let r = 0; r < rows; r++) {
    const inset = rows >= 3 && (r === 0 || r === rows - 1) ? 1 : 0;
    for (let x = x0 + inset; x < x0 + cols - inset; x++) {
      g.put(x, y0 + r, SHY_BLUSH.fill);
      inside.add((y0 + r) * w + x);
    }
  }
  if (w < EXTRA_PIXELS.hatchFrom) return;
  for (const [[u0, v0], [u1, v1]] of b.hatch) {
    const [ax, ay, bx, by] = [u0 * w, v0 * h, u1 * w, v1 * h];
    const steps = Math.max(1, Math.round(Math.abs(by - ay)));
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor(ax + ((bx - ax) * i) / steps);
      const y = Math.floor(ay + ((by - ay) * i) / steps);
      if (inside.has(y * w + x)) g.put(x, y, SHY_BLUSH.hatch);
    }
  }
}

/**
 * A dialogue face (sad, angry, shy, smug) in a w × h cell, RGBA: neutral's face as the pixel
 * sheets draw it, its parts moved as the face moves them (extraDesign), on the same rows as the
 * other four (eyeShift) and under the same brow columns: the open eye, the brow, the blush, the
 * mouth.
 * @param {'sad'|'angry'|'shy'|'smug'} name
 * @param {number} w
 * @param {number} h
 * @param {any} c  the colours newt-face.mjs samples from his smooth sheet
 * @param {Kit} k
 * @returns {Uint8Array}
 */
export function extraFace(name, w, h, c, k) {
  const g = k.canvas(w, h, c.skin.neutral);
  const d = extraDesign(k.DESIGN, name);
  const shift = k.eyeShift(g);
  const lid = drawEye(k, g, d, shift, c);
  drawBrow(k, g, d, lid, shift, c);
  if (d.blush && w >= 5) drawBlush(g, d.blush);
  drawMouth(g, name, d, c);
  return g.cell;
}
