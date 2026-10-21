// NEWT's four dialogue faces (clips.js EXTRA_FACES: sad, angry, shy, smug), on sheets of their own
// laid out like the first four's: the smooth 1024 sheet (public/models/newt-face-smooth-extra.png,
// tools/newt-face-smooth.mjs) drawn from his own smooth face, and the pixel sheets
// (public/models/newt-face-extra.png, tools/newt-face.mjs) at every cell size of faceSheets.js's
// ladder. Smooth: each face his own neutral one with its parts edited (sad: the brows up toward
// the middle, the lid drooping toward his ear, the mouth turned down; angry: the brows down and
// in, the eye narrowed, a tight mouth; shy: looking down, a strong blush, a wavy mouth; smug:
// half-lidded, a ω of a mouth), each one's cue still there at the size his face shows in the
// default view at Pixel Size Off (the lid's shape, the mouths bolder than his own). Pixel: each placed where its smooth face has its parts, drawn by
// the first four's rules (a heavy lid over the white, a pupil under it in a grey iris, a small
// mouth under the eyes, a brow with skin under it, no lone dark pixel), its expression readable
// from a few pixels up, and different from every other face.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { cellParts, components, finer, kindOf, partsOf, smoothSheet } from './lib/faceParts.mjs';
import { FACE_IMAGE, FACE_LAYOUT } from '../src/invitation/faceSheets.js';
import { EXTRA_FACES, FACE_NAMES, FACES } from '../src/invitation/clips.js';

const file = (name) => fileURLToPath(new URL(`../public/models/${name}`, import.meta.url));
const PIXEL = file('newt-face.png');
const PIXEL_EXTRA = file('newt-face-extra.png');
const SMOOTH_EXTRA = file('newt-face-smooth-extra.png');
const GLB = file('newt.glb');
/** [column, row] on a 2×2 sheet, from clips.js's offsets. */
const cellsOf = (faces) => Object.fromEntries(Object.entries(faces).map(([n, [u, v]]) => [n, [u * 2, v * 2]]));
const BASE_CELLS = cellsOf(FACES);
const EXTRA_CELLS = cellsOf(EXTRA_FACES);
/** Brows told apart from lids by column (theirs tilt: their boxes overlap). */
const TILTED = { tilted: true };
const NAMES = /** @type {Array<'sad'|'angry'|'shy'|'smug'>} */ (Object.keys(EXTRA_CELLS));

/** Every sheet's cells in a pixel image: each face's pixels. */
async function sheetsOf(path, cells) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return FACE_LAYOUT.map((sheet) => {
    /** @type {Record<string, {px: number[][], w: number, h: number}>} */
    const out = {};
    for (const [name, [cx, cy]] of Object.entries(cells)) {
      const px = [];
      for (let y = 0; y < sheet.h; y++)
        for (let x = 0; x < sheet.w; x++) {
          const i = ((sheet.y + cy * sheet.h + y) * info.width + sheet.x + cx * sheet.w + x) * 4;
          px.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
        }
      out[name] = { px, w: sheet.w, h: sheet.h };
    }
    return { sheet, cells: out };
  });
}

/** Every size's eight faces: the first four from newt-face.png, the dialogue's from newt-face-extra.png. */
async function allSheets() {
  const [base, extra] = await Promise.all([sheetsOf(PIXEL, BASE_CELLS), sheetsOf(PIXEL_EXTRA, EXTRA_CELLS)]);
  return base.map((s, i) => ({ sheet: s.sheet, cells: { ...s.cells, ...extra[i].cells } }));
}

/**
 * A smooth sheet's faces (RGBA `data`, `width` wide): each one's kind(x, y), its parts (patches
 * of 40 pixels or fewer left out: antialiased edges) and its cell size.
 */
function smoothFaces({ data, info }, cells) {
  const n = info.width / 2;
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, [cx, cy]] of Object.entries(cells)) {
    const kind = (x, y) => {
      if (x < 0 || y < 0 || x >= n || y >= n) return 'skin';
      const i = ((cy * n + y) * info.width + cx * n + x) * 4;
      return kindOf([data[i], data[i + 1], data[i + 2]]);
    };
    out[name] = { kind, n, ...partsOf(n, n, kind, 40, TILTED) };
  }
  return out;
}

const smoothExtra = async () =>
  smoothFaces(await sharp(SMOOTH_EXTRA).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), EXTRA_CELLS);
const smoothBase = async () => smoothFaces(await smoothSheet(GLB), BASE_CELLS);

/** The mean row of a part's pixels in its first (`side` 'inner') or last ('outer') share of its columns. */
function endRow(part, side, share = 0.15) {
  const span = part.r - part.l + 1;
  const cut = Math.max(1, Math.round(span * share));
  const px = part.px.filter(([x]) => (side === 'inner' ? x < part.l + cut : x > part.r - cut));
  return px.reduce((s, [, y]) => s + y, 0) / px.length;
}

/** A part's mean row in column x (NaN where it has none). */
function rowAt(part, x) {
  const ys = part.px.filter(([px]) => px === x).map(([, y]) => y);
  return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : Number.NaN;
}

/** The first row from `y0` down in column x where kind(x, y) is `k` (null: none before y1). */
function firstRow(kind, x, k, y0, y1) {
  for (let y = y0; y <= y1; y++) if (kind(x, y) === k) return y;
  return null;
}

test('the dialogue faces’ sheets: the pixel image as big as the first four’s (a sheet a cell size), the smooth one as big as the glb’s, every pixel opaque', async () => {
  const pixel = await sharp(PIXEL_EXTRA).metadata();
  assert.deepEqual([pixel.width, pixel.height], [FACE_IMAGE.w, FACE_IMAGE.h], 'laid out as faceSheets.js packs it');
  const smooth = await sharp(SMOOTH_EXTRA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const glb = await smoothSheet(GLB);
  assert.deepEqual([smooth.info.width, smooth.info.height], [glb.info.width, glb.info.height], 'as big as his own');
  for (let i = 3; i < smooth.data.length; i += 4) assert.equal(smooth.data[i], 255, 'the smooth sheet opaque');
  for (const { sheet, cells } of await sheetsOf(PIXEL_EXTRA, EXTRA_CELLS))
    for (const [name, c] of Object.entries(cells))
      assert.ok(
        c.px.every((p) => p[3] === 255),
        `${sheet.w} px ${name}: opaque`,
      );
  assert.deepEqual(
    FACE_NAMES.filter((n) => !FACES[n] && !EXTRA_FACES[n]),
    [],
    'every face on one sheet or the other',
  );
});

test('the smooth faces read apart where his face is smallest (the default view at Off, his half face 33 to 42 texels): sad from neutral, angry from smug, by the eye and the mouth', async () => {
  const glb = await smoothSheet(GLB);
  const extra = await sharp(SMOOTH_EXTRA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  /** A cell of a 2×2 sheet shrunk to `size` px square, grey. */
  const small = async ({ data, info }, [cx, cy], size) => {
    const n = info.width / 2;
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: cx * n, top: cy * n, width: n, height: n })
      .removeAlpha()
      .resize(size, size, { kernel: 'cubic' })
      .greyscale()
      .raw()
      .toBuffer();
  };
  /** The mean grey difference of two shrunk cells over a window (shares of the cell). */
  const apart = (a, b, size, [x0, x1], [y0, y1]) => {
    let sum = 0;
    let n = 0;
    for (let y = Math.floor(y0 * size); y < Math.ceil(y1 * size); y++)
      for (let x = Math.floor(x0 * size); x < Math.ceil(x1 * size); x++) {
        sum += Math.abs(a[y * size + x] - b[y * size + x]);
        n++;
      }
    return sum / n;
  };
  const EYE = [
    [0.12, 0.72],
    [0.52, 0.8],
  ];
  const MOUTH = [
    [0, 0.12],
    [0.84, 0.96],
  ];
  for (const size of [42, 33]) {
    const neutral = await small(glb, BASE_CELLS.neutral, size);
    const f = Object.fromEntries(
      await Promise.all(NAMES.map(async (n) => [n, await small(extra, EXTRA_CELLS[n], size)])),
    );
    const eye = (a, b) => apart(a, b, size, ...EYE);
    const mouth = (a, b) => apart(a, b, size, ...MOUTH);
    // (The sheets as first drawn: eyes 23 and 19 apart, mouths 2 to 4, under the motion's own noise.)
    assert.ok(eye(neutral, f.sad) >= 21, `${size} px: sad’s eye from neutral’s ${eye(neutral, f.sad).toFixed(1)}`);
    assert.ok(eye(f.angry, f.smug) >= 22, `${size} px: angry’s eye from smug’s ${eye(f.angry, f.smug).toFixed(1)}`);
    for (const [a, b] of [
      ['neutral', 'sad'],
      ['angry', 'smug'],
      ['neutral', 'smug'],
      ['neutral', 'angry'],
    ]) {
      const d = mouth(a === 'neutral' ? neutral : f[a], f[b]);
      assert.ok(d >= 6, `${size} px: ${b}’s mouth from ${a}’s ${d.toFixed(1)}`);
    }
  }
});

test('the smooth dialogue faces are his own face edited: an eye, a brow and a mouth each where his are, a blush only when shy, and each expression in its parts', async () => {
  const faces = await smoothExtra();
  const base = await smoothBase();
  const n = faces.sad.n;
  const k = n / 512; // (pixels of a 512 cell)
  const neutral = base.neutral;
  for (const [name, f] of Object.entries(faces)) {
    assert.ok(f.eye.px.length && f.brow && f.mouth.px.length, `${name}: an eye, a brow and a mouth`);
    assert.equal(f.blush.px.length > 0, name === 'shy', `${name}: a blush only when shy`);
    // (His features where his are: the eye over the same span, the mouth at the middle.)
    assert.ok(
      Math.abs(f.eye.l - neutral.eye.l) <= 12 * k && Math.abs(f.eye.r - neutral.eye.r) <= 24 * k,
      `${name}: the eye`,
    );
    assert.equal(f.mouth.l, 0, `${name}: the mouth in the middle`);
    assert.ok(Math.abs(f.mouth.t - neutral.mouth.t) <= 12 * k, `${name}: the mouth where his is`);
    assert.ok(f.mouth.r <= 48 * k, `${name}: a small mouth`);
  }
  const tilt = (f) => endRow(f.brow, 'inner') - endRow(f.brow, 'outer');
  assert.ok(Math.abs(tilt(neutral)) <= 8 * k, 'his neutral brow about level');
  assert.ok(tilt(faces.sad) <= -15 * k, `sad: the brow up toward the middle (${tilt(faces.sad).toFixed(0)})`);
  assert.ok(tilt(faces.angry) >= 15 * k, `angry: the brow down toward the middle (${tilt(faces.angry).toFixed(0)})`);
  assert.ok(tilt(faces.shy) < 0, 'shy: the brow a little up toward the middle');
  // Sad: the lid droops toward his ear (lower there than his neutral one), the mouth turned down.
  const outer = Math.round(0.62 * n);
  const lidTop = (f) => firstRow(f.kind, outer, 'ink', Math.round(0.55 * n), Math.round(0.75 * n));
  assert.ok(lidTop(faces.sad) - lidTop(neutral) >= 10 * k, 'sad: the lid lower toward his ear');
  const m = faces.sad.mouth;
  assert.ok(endRow(m, 'outer') - endRow(m, 'inner') >= 8 * k, 'sad: the mouth’s end down');
  // Angry: narrowed (the white and iris fewer rows), the mouth flat with its end down.
  const lit = (f) => f.eye.px.filter(([x, y]) => ['white', 'iris'].includes(f.kind(x, y)));
  const litRows = (f) => new Set(lit(f).map(([, y]) => y)).size;
  assert.ok(litRows(faces.angry) <= 0.8 * litRows(neutral), 'angry: the eye narrowed');
  const a = faces.angry.mouth;
  assert.ok(Math.abs(rowAt(a, 2) - rowAt(a, Math.round(a.r * 0.5))) <= 2 * k, 'angry: the mouth flat');
  assert.ok(endRow(a, 'outer', 0.1) - rowAt(a, 2) >= 4 * k, 'angry: its end down');
  // Shy: looking down (iris between the lid and the pupil), a strong blush, a wavy mouth.
  const pupilCol = Math.round((199 / 512) * n);
  const below = (f) => {
    const lid = firstRow(f.kind, pupilCol, 'ink', Math.round(0.5 * n), n - 1);
    const gap = firstRow(f.kind, pupilCol, 'iris', lid, n - 1);
    const pupil = firstRow(f.kind, pupilCol, 'ink', gap ?? lid, n - 1);
    return { gap: gap ?? Number.NaN, pupil: pupil ?? Number.NaN };
  };
  assert.ok(below(faces.shy).pupil > below(faces.shy).gap, 'shy: grey between the lid and the pupil');
  assert.ok(Number.isNaN(below(neutral).pupil), 'his neutral pupil hangs from the lid (no grey over it)');
  assert.ok(faces.shy.blush.px.length >= 2 * base.happy.blush.px.length, 'shy: a blush twice the happy one');
  const s = faces.shy.mouth;
  let turns = 0;
  let was = 0;
  for (let x = 1; x <= s.r; x++) {
    const d = Math.sign(rowAt(s, x) - rowAt(s, x - 1));
    if (d && was && d !== was) turns++;
    if (d) was = d;
  }
  assert.ok(turns >= 2, `shy: a wavy mouth (${turns} turns)`);
  // Smug: half-lidded (the lid lower than his neutral one), a ω.
  assert.ok(faces.smug.eye.t - neutral.eye.t >= 8 * k, 'smug: the lid lower');
  assert.ok(litRows(faces.smug) < litRows(neutral), 'smug: half-lidded');
  const w = faces.smug.mouth;
  const low = Math.max(...w.px.map(([, y]) => y));
  assert.ok(rowAt(w, 0) < low - 6 * k, 'smug: the ω’s middle up');
  assert.ok(endRow(w, 'outer', 0.1) < low - 6 * k, 'smug: its end up');
});

test('the pixel dialogue faces are their smooth faces scaled down: the eye, the brow, the mouth and the blush where the smooth sheet has them', async () => {
  const smooth = await smoothExtra();
  for (const { sheet, cells } of await sheetsOf(PIXEL_EXTRA, EXTRA_CELLS)) {
    const { w, h } = sheet;
    if (w < 5) continue;
    const tx = 1 + 0.05 * w;
    const ty = 1 + 0.04 * h;
    for (const name of NAMES) {
      const tag = `${w} px ${name}`;
      const p = cellParts(cells[name], TILTED);
      const s = smooth[name];
      const n = s.n;
      const near = (got, want, tol, what) =>
        assert.ok(
          Math.abs(got - want) <= tol,
          `${tag}: ${what} at ${got}, the smooth face’s at ${want.toFixed(1)} (±${tol.toFixed(1)})`,
        );
      const fits = (b, sb, what, { top = ty, bottom = ty, side = tx } = {}) => {
        assert.ok(b && b.px.length, `${tag}: ${what}`);
        near(b.l, (sb.l / n) * w, side, `${what}'s left`);
        near(b.r + 1, ((sb.r + 1) / n) * w, side, `${what}'s right`);
        near(b.t, (sb.t / n) * h, top, `${what}'s top`);
        near(b.b + 1, ((sb.b + 1) / n) * h, bottom, `${what}'s bottom`);
      };
      fits(p.eye, s.eye, 'the eye', { top: ty + 0.5, bottom: ty + 0.5 });
      fits(p.mouth, s.mouth, 'the mouth', { top: ty + 0.5, bottom: ty + 0.5, side: tx + 1 });
      if (w >= 10) fits(p.brow, s.brow, 'the brow', { top: ty + 2, bottom: ty + 2 });
      if (name === 'shy' && w >= 8) fits(p.blush, s.blush, 'the blush', { top: ty + 0.5, bottom: ty + 0.5 });
      if (name !== 'shy') assert.equal(p.blush.px.length, 0, `${tag}: no blush`);
    }
  }
});

test('the pixel dialogue faces by the first four’s rules: a lid over the whole opening, a pupil under it in a grey iris, a small mouth under the eyes and apart from them, a brow with skin under it, no lone dark pixel but a pupil or a line’s step', async () => {
  for (const { sheet, cells } of await allSheets()) {
    for (const name of NAMES) {
      const tag = `${sheet.w} px ${name}`;
      const cell = cells[name];
      const { w, h } = cell;
      const p = cellParts(cell, TILTED);
      const { kind } = p;
      const e = p.eye;
      assert.ok(e.px.length >= 2, `${tag}: an eye`);
      // The lid: ink right over the opening's top in each of its columns (no white peeking over it).
      const lit = e.px.filter(([x, y]) => ['white', 'iris'].includes(kind(x, y)));
      for (const x of new Set(lit.map(([px]) => px))) {
        const top = Math.min(...lit.filter(([px]) => px === x).map(([, y]) => y));
        const over = top > 0 && kind(x, top - 1) === 'ink';
        const pupilCol = kind(x, top) === 'ink';
        assert.ok(over || pupilCol || sheet.w < 5, `${tag}: the lid over the opening at column ${x}`);
      }
      if (w >= 5) {
        assert.ok(p.count('white') >= 1, `${tag}: the white of the eye`);
        const pupil = e.px.filter(
          ([x, y]) =>
            kind(x, y) === 'ink' && [kind(x - 1, y), kind(x + 1, y)].some((k) => k === 'white' || k === 'iris'),
        );
        assert.ok(pupil.length >= 1, `${tag}: a pupil`);
      }
      if (w >= 10) assert.ok(p.count('iris') >= 2, `${tag}: a grey iris`);
      // The mouth: in the middle, small, under the eyes, apart from them.
      const m = p.mouth;
      assert.ok(m.px.length >= 1 && m.l === 0, `${tag}: a mouth in the middle`);
      assert.ok(m.r + 1 <= Math.max(1, Math.ceil(w * 0.1)) + 1, `${tag}: a small mouth (${m.r + 1} px a side)`);
      assert.ok(m.t > e.b, `${tag}: the mouth (row ${m.t}) under the eyes (row ${e.b})`);
      assert.ok(
        m.px.every(([mx, my]) => !e.px.some(([x, y]) => Math.abs(x - mx) + Math.abs(y - my) <= 1)),
        `${tag}: no mouth pixel touches an eye`,
      );
      // The brow: from 8 px, as thin as the first four's in each column (a row more at a joined
      // step), two pixels long at least, a row of skin under it all along.
      if (w >= 8) {
        assert.ok(p.brow, `${tag}: a brow`);
        const thin = sheet.h >= 100 ? 2 : 1;
        for (let x = p.brow.l; x <= p.brow.r; x++) {
          const ys = p.brow.px.filter(([px]) => px === x).map(([, y]) => y);
          assert.ok(ys.length >= 1 && ys.length <= thin + 1, `${tag}: the brow ${ys.length} rows at ${x}`);
          const under = Math.max(...ys);
          const next = firstRow((xx, yy) => (kind(xx, yy) === 'skin' ? 'skin' : 'part'), x, 'part', under + 1, h - 1);
          assert.ok(next === null || next - under >= 2, `${tag}: skin under the brow at ${x}`);
        }
        assert.ok(p.brow.r > p.brow.l, `${tag}: at least 2 px long`);
      }
      for (const c of components(w, h, (x, y) => kind(x, y) === 'ink')) {
        if (c.px.length >= 2) continue;
        const [[x, y]] = c.px;
        const corner = [-1, 1].some((dx) => [-1, 1].some((dy) => kind(x + dx, y + dy) === 'ink'));
        const round = [kind(x - 1, y), kind(x + 1, y)];
        assert.ok(
          corner || round.every((k) => k === 'white' || k === 'iris'),
          `${tag}: a lone dark pixel at (${x}, ${y})`,
        );
      }
    }
    // Eight faces that differ from each other from 8 px (under that a face is a few dots).
    if (sheet.w >= 8) {
      const key = (c) => c.px.map((q) => kindOf(q)).join('');
      assert.equal(new Set(Object.values(cells).map(key)).size, 8, `${sheet.w} px: the eight faces differ`);
    }
  }
});

test('the pixel dialogue faces read: sad’s brows up toward the middle and its mouth down; angry’s brows down, its eye narrowed, its mouth tight; shy looking down, blushing, its mouth a wave; smug half-lidded with a ω', async () => {
  for (const { sheet, cells } of await allSheets()) {
    const { w, h } = sheet;
    if (w < 8) continue;
    const p = Object.fromEntries(Object.entries(cells).map(([n, c]) => [n, cellParts(c, TILTED)]));
    const tag = (name) => `${w} px ${name}`;
    /** The brow's top row in its first and last columns. */
    const ends = (b) => [
      Math.min(...b.px.filter(([x]) => x === b.l).map(([, y]) => y)),
      Math.min(...b.px.filter(([x]) => x === b.r).map(([, y]) => y)),
    ];
    const [si, so] = ends(p.sad.brow);
    assert.ok(si < so, `${tag('sad')}: the brow’s inner end (row ${si}) over its outer end (row ${so})`);
    const [ai, ao] = ends(p.angry.brow);
    assert.ok(ai > ao, `${tag('angry')}: the brow’s inner end (row ${ai}) under its outer end (row ${ao})`);
    const lit = (q) => q.count('white') + q.count('iris');
    /** A mouth's top row in column x. */
    const top = (q, x) => Math.min(...q.mouth.px.filter(([px]) => px === x).map(([, y]) => y));
    if (w >= 10) {
      const m = p.sad.mouth;
      assert.ok(top(p.sad, m.r) > top(p.sad, 0), `${tag('sad')}: the mouth’s end under its middle`);
    }
    // (Angry narrowed and smug half-lidded from 12 px: under that the open eye is two rows.)
    if (w >= 12) {
      assert.ok(lit(p.angry) < lit(p.neutral), `${tag('angry')}: less of the eye than neutral’s`);
      assert.ok(lit(p.smug) < lit(p.neutral), `${tag('smug')}: less of the eye than neutral’s`);
    }
    if (w >= 14) {
      // (The sad lid lower toward his ear than neutral’s.)
      const col = Math.round(0.6 * w);
      const lidAt = (q) => firstRow(q.kind, col, 'ink', Math.round(0.4 * h), h - 1);
      assert.ok(lidAt(p.sad) > lidAt(p.neutral), `${tag('sad')}: the lid lower toward his ear`);
      const a = p.angry.mouth;
      assert.ok(a.r >= 2, `${tag('angry')}: a mouth three pixels a side`);
      for (let x = 0; x < a.r; x++) assert.equal(top(p.angry, x), top(p.angry, 0), `${tag('angry')}: flat at ${x}`);
      assert.equal(top(p.angry, a.r), top(p.angry, 0) + 1, `${tag('angry')}: its end a row down`);
    }
    if (w >= 12) assert.ok(p.smug.eye.t > p.neutral.eye.t, `${tag('smug')}: the lid lower than neutral’s`);
    if (w < 20) assert.ok(top(p.smug, p.smug.mouth.r) < top(p.smug, 0), `${tag('smug')}: a small smile, its end up`);
    // Shy: a blush two rows tall at least, more of it than happy's; looking down from 16 px.
    const blush = p.shy.blush;
    assert.ok(blush.b - blush.t + 1 >= 2, `${tag('shy')}: a blush two rows tall`);
    assert.ok(blush.px.length > p.happy.blush.px.length, `${tag('shy')}: more blush than happy’s`);
    if (w >= 16) {
      // (The pupil apart from the lid, in the iris: the eye's ink that isn't the lid's.)
      const f = finer(cells.shy);
      const eyeInk = new Set(p.shy.eye.px.filter(([x, y]) => p.shy.kind(x, y) === 'ink').map(([x, y]) => y * w + x));
      const inks = components(w, h, (x, y) => eyeInk.has(y * w + x)).sort((a, b) => a.t - b.t);
      const pupil = inks
        .slice(1)
        .find((c) => c.px.some(([x, y]) => [f.kind(x - 1, y), f.kind(x + 1, y)].includes('grey')));
      assert.ok(pupil, `${tag('shy')}: a pupil in the iris, apart from the lid`);
      const pt = pupil.t;
      const px = pupil.px.find(([, y]) => y === pt)[0];
      assert.equal(f.kind(px, pt - 1), 'grey', `${tag('shy')}: grey over the pupil (looking down)`);
      const np = cellParts(cells.neutral, TILTED).eye.px.filter(
        ([x, y]) => p.neutral.kind(x, y) === 'ink' && ['white', 'iris'].includes(p.neutral.kind(x - 1, y)),
      );
      assert.ok(pt > Math.min(...np.map(([, y]) => y)), `${tag('shy')}: the pupil lower than neutral’s`);
    }
    if (w >= 26) {
      assert.equal(p.shy.mouth.r, 2, `${tag('shy')}: the wave three pixels a side`);
      assert.deepEqual(
        [0, 1, 2].map((x) => top(p.shy, x) - top(p.shy, 0)),
        [0, -1, 0],
        `${tag('shy')}: down, up, down`,
      );
    }
    if (w >= 40)
      assert.ok(
        cells.shy.px.some(([r, g, bb]) => kindOf([r, g, bb]) === 'blush' && r - g > 105),
        `${tag('shy')}: the blush hatched`,
      );
    if (w >= 20) {
      const m = p.smug.mouth;
      assert.ok(m.r >= 2, `${tag('smug')}: a ω three pixels a side at least`);
      assert.ok(top(p.smug, 0) < top(p.smug, 1), `${tag('smug')}: its middle up`);
      assert.ok(top(p.smug, m.r) < top(p.smug, m.r - 1), `${tag('smug')}: its end up`);
    }
  }
});

test('the pixel dialogue faces grow steadily with the cell: each size’s eye at least as wide as the size under it, and as tall give or take the row a moved lid rounds to', async () => {
  const sheets = await sheetsOf(PIXEL_EXTRA, EXTRA_CELLS);
  for (const name of NAMES) {
    let was = null;
    for (const { sheet, cells } of sheets) {
      const e = cellParts(cells[name], TILTED).eye;
      const now = { w: e.r - e.l + 1, h: e.b - e.t + 1 };
      if (was) {
        assert.ok(now.w >= was.w, `${sheet.w} px ${name}: the eye ${now.w} wide after ${was.w}`);
        assert.ok(now.h >= was.h - 1, `${sheet.w} px ${name}: the eye ${now.h} tall after ${was.h}`);
      }
      was = now;
    }
  }
});
