// NEWT's pixel faces (public/models/newt-face.png, made by tools/newt-face.mjs; laid out by
// src/invitation/faceSheets.js): one 2×2 sheet (clips.js FACES' layout) for each of a ladder of
// cell sizes, so character.js can show the one whose cell is as many pixels as his half face
// covers texels (nearest sampling then neither drops nor doubles a feature, and the eyes keep
// one shape as he moves). Every sheet: opaque; solid eyes (a dark core, no highlight, no gap in
// a row), the same shape across the sizes (at least as tall as wide); no lone dark pixel; a
// 1 px brow line where there's room for it apart from the eye; a mouth in each face (darker
// than the skin, under the eyes, apart from them); four faces that differ. The pick between
// sheets holds on to the one showing until another fits clearly better (no flicker between two
// sizes), and his face's span is measured from its own geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import {
  FACE_ASPECT,
  FACE_HYSTERESIS,
  FACE_IMAGE,
  FACE_LAYOUT,
  FACE_SIZES,
  faceSpan,
  pickFaceSize,
} from '../src/invitation/faceSheets.js';

const FILE = fileURLToPath(new URL('../public/models/newt-face.png', import.meta.url));
const CELLS = { neutral: [0, 0], blink: [1, 0], happy: [0, 1], surprised: [1, 1] };
const luma = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** Every sheet's four cells: their pixels and which are dark. */
async function sheets() {
  const { data, info } = await sharp(FILE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = [];
  for (const sheet of FACE_LAYOUT) {
    /** @type {Record<string, {dark: boolean[], px: number[][], w: number, h: number}>} */
    const cells = {};
    for (const [name, [cx, cy]] of Object.entries(CELLS)) {
      const px = [];
      const dark = [];
      for (let y = 0; y < sheet.h; y++)
        for (let x = 0; x < sheet.w; x++) {
          const i = ((sheet.y + cy * sheet.h + y) * info.width + sheet.x + cx * sheet.w + x) * 4;
          const c = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          px.push(c);
          dark.push(luma(c[0], c[1], c[2]) < 0.3);
        }
      cells[name] = { dark, px, w: sheet.w, h: sheet.h };
    }
    out.push({ sheet, cells });
  }
  return out;
}

/** The 4-connected components of a w × h cell's pixels where `on(x, y)`, each with its box and pixels. */
function components(w, h, on) {
  const seen = new Set();
  const list = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on(x, y) || seen.has(y * w + x)) continue;
      const c = { l: x, r: x, t: y, b: y, px: [] };
      const stack = [[x, y]];
      seen.add(y * w + x);
      while (stack.length) {
        const [px, py] = stack.pop();
        c.px.push([px, py]);
        Object.assign(c, { l: Math.min(c.l, px), r: Math.max(c.r, px), t: Math.min(c.t, py), b: Math.max(c.b, py) });
        const next = [
          [px + 1, py],
          [px - 1, py],
          [px, py + 1],
          [px, py - 1],
        ].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && on(nx, ny) && !seen.has(ny * w + nx));
        for (const [nx, ny] of next) seen.add(ny * w + nx);
        stack.push(...next);
      }
      list.push(c);
    }
  return list;
}

/** The [x, y] of a w × h cell's pixels where `on(x, y)`. */
const pixels = (w, h, on) =>
  Array.from({ length: w * h }, (_, i) => [i % w, Math.floor(i / w)]).filter(([x, y]) => on(x, y));

/** A cell's mouth test (a warm dark, clearly darker than the skin) and its ink test (the rest of the dark). */
function partsOf({ px, dark, w, h }) {
  const at = (x, y) => px[y * w + x];
  // (The skin: the cell's commonest colour.)
  const count = new Map();
  for (const c of px) count.set(c.join(), (count.get(c.join()) ?? 0) + 1);
  const common = [...count]
    .sort((a, b) => b[1] - a[1])[0][0]
    .split(',')
    .map(Number);
  const skin = luma(common[0], common[1], common[2]);
  const isMouth = (x, y) => {
    const [r, g, b] = at(x, y);
    return luma(r, g, b) < skin - 0.25 && r - b > 25;
  };
  const isInk = (x, y) => x >= 0 && y >= 0 && x < w && y < h && dark[y * w + x] && !isMouth(x, y);
  return { isMouth, isInk };
}

test('the pixel faces: one 2×2 sheet a cell size, from a few texels to a desktop close-up, packed as faceSheets.js lays them out', async () => {
  const info = await sharp(FILE).metadata();
  assert.equal(info.width, FACE_IMAGE.w, 'the image is as wide as the layout');
  assert.equal(info.height, FACE_IMAGE.h, 'and as tall');
  assert.ok(FACE_SIZES[0] <= 4, `the smallest cell (${FACE_SIZES[0]} px) fits his half face at 4× on a phone`);
  assert.ok(FACE_SIZES.at(-1) >= 30, `the largest (${FACE_SIZES.at(-1)} px) fits a desktop zoomed in`);
  for (let i = 1; i < FACE_SIZES.length; i++)
    assert.ok(
      FACE_SIZES[i] / FACE_SIZES[i - 1] <= 1.34,
      `no wide gap between ${FACE_SIZES[i - 1]} and ${FACE_SIZES[i]} px (a feature would round off by a pixel)`,
    );
  assert.deepEqual(
    FACE_LAYOUT.map((s) => s.w),
    FACE_SIZES,
    'a sheet for every size, in order',
  );
  for (const s of FACE_LAYOUT) {
    assert.equal(s.h, Math.round(s.w * FACE_ASPECT), `a ${s.w} px cell keeps the face's proportions`);
    assert.ok(s.x + 2 * s.w <= FACE_IMAGE.w && s.y + 2 * s.h <= FACE_IMAGE.h, `the ${s.w} px sheet fits`);
  }
  for (let i = 1; i < FACE_LAYOUT.length; i++) {
    const a = FACE_LAYOUT[i - 1];
    const b = FACE_LAYOUT[i];
    assert.ok(b.x >= a.x + 2 * a.w || b.y >= a.y + 2 * a.h, `the ${a.w} and ${b.w} px sheets don't overlap`);
  }
  for (const { sheet, cells } of await sheets())
    for (const [name, c] of Object.entries(cells))
      assert.ok(
        c.px.every((p) => p[3] === 255),
        `${sheet.w} px ${name}: opaque`,
      );
});

test('the pixel faces: solid eyes of one shape at every size, no lone dark pixel, a 1 px brow where there’s room, four different faces', async () => {
  for (const { sheet, cells } of await sheets()) {
    const tag = `${sheet.w} px`;
    for (const [name, cell] of Object.entries(cells)) {
      const { w, h } = cell;
      const { isInk } = partsOf(cell);
      const ink = components(w, h, isInk);
      assert.ok(ink.length >= 1, `${tag} ${name}: an eye`);
      for (const c of ink) assert.ok(c.px.length >= 2, `${tag} ${name}: a lone dark pixel at (${c.l}, ${c.t})`);
      if (name !== 'neutral' && name !== 'surprised') continue;
      // The eye: the biggest ink; a dark core (each of its rows one unbroken run, nothing light
      // inside), at least 2 px tall and at least as tall as it's wide, whatever the size.
      const eye = [...ink].sort((a, b) => b.px.length - a.px.length)[0];
      const ew = eye.r - eye.l + 1;
      const eh = eye.b - eye.t + 1;
      assert.ok(eh >= 2 && eh >= ew, `${tag} ${name}: the eye is ${ew}×${eh} (one upright shape)`);
      for (let y = eye.t; y <= eye.b; y++) {
        const xs = eye.px.filter(([, py]) => py === y).map(([x]) => x);
        assert.equal(Math.max(...xs) - Math.min(...xs) + 1, xs.length, `${tag} ${name}: row ${y} of the eye is solid`);
      }
      // A brow: a 1 px line over the eye with skin between, once the cell has room for it.
      if (sheet.w < 6) continue;
      const brow = ink.find((c) => c !== eye && c.b < eye.t);
      assert.ok(brow, `${tag} ${name}: a brow over the eye`);
      assert.equal(brow.b, brow.t, `${tag} ${name}: the brow is a 1 px line`);
      assert.ok(brow.r > brow.l, `${tag} ${name}: the brow is at least 2 px long`);
      assert.ok(eye.t - brow.b >= 2, `${tag} ${name}: skin between the brow and the eye`);
    }
    const key = (c) => c.dark.map(Number).join('');
    assert.equal(new Set(Object.values(cells).map(key)).size, 4, `${tag}: neutral, blink, happy and surprised differ`);
    const inkOf = (c) => c.dark.filter(Boolean).length;
    assert.ok(inkOf(cells.neutral) > inkOf(cells.blink), `${tag}: an open eye holds more ink than a closed one`);
    assert.ok(
      inkOf(cells.surprised) >= inkOf(cells.neutral),
      `${tag}: a surprised eye is at least as big as a neutral one`,
    );
  }
});

test('the pixel faces: a mouth in every face at every size, darker than the skin, under the eyes and apart from them', async () => {
  for (const { sheet, cells } of await sheets())
    for (const [name, cell] of Object.entries(cells)) {
      const tag = `${sheet.w} px ${name}`;
      const { w, h } = cell;
      const { isMouth, isInk } = partsOf(cell);
      const eyeTop = Math.min(h, ...pixels(w, h, isInk).map(([, y]) => y));
      assert.ok(eyeTop < h, `${tag}: eyes`);
      // In the middle column (the cell's left edge is the middle of his face: mirrored, at least
      // 2 px wide), at least 1 px tall, below the top of the eyes.
      const rows = [];
      for (let y = 0; y < h; y++) if (isMouth(0, y)) rows.push(y);
      assert.ok(rows.length >= 1, `${tag}: a mouth at least 1 px tall and 2 px wide (mirrored)`);
      assert.ok(
        rows.every((y) => y > eyeTop),
        `${tag}: the mouth (rows ${rows}) sits under the top of the eyes (row ${eyeTop})`,
      );
      const mouth = pixels(w, h, isMouth);
      const touches = ([x, y]) => isInk(x + 1, y) || isInk(x - 1, y) || isInk(x, y + 1) || isInk(x, y - 1);
      assert.deepEqual(mouth.filter(touches), [], `${tag}: no mouth pixel touches an eye`);
    }
});

test('the sheet pick: the nearest size to his half face, held until another fits clearly better', () => {
  assert.equal(pickFaceSize(8, null), 8, 'a size that fits exactly');
  assert.equal(pickFaceSize(7.9, null), 8);
  assert.equal(pickFaceSize(100, null), FACE_SIZES.at(-1), 'past the largest: the largest');
  assert.equal(pickFaceSize(1, null), FACE_SIZES[0], 'under the smallest: the smallest');
  assert.equal(pickFaceSize(Number.NaN, 9), 9, 'no measure: the one showing stays');
  assert.equal(pickFaceSize(0, null), FACE_SIZES[0], 'no measure and none showing: the smallest');
  // Between two sizes the one showing holds: his head's breathing never flips the sheet.
  const between = Math.sqrt(8 * 9);
  for (const t of [between * 0.98, between, between * 1.02]) {
    assert.equal(pickFaceSize(t, 8), 8, `${t.toFixed(2)} texels: 8 stays`);
    assert.equal(pickFaceSize(t, 9), 9, `${t.toFixed(2)} texels: 9 stays`);
  }
  assert.ok(FACE_HYSTERESIS > 0.03 && FACE_HYSTERESIS < 0.15, `a margin of ${FACE_HYSTERESIS} (log)`);
  // A real change of size switches.
  assert.equal(pickFaceSize(12, 8), 12, 'his face grew: the bigger sheet');
  assert.equal(pickFaceSize(9.9, 8), 10, 'clearly nearer another: it switches');
  let current = 8;
  let flips = 0;
  for (let i = 0; i < 200; i++) {
    const next = pickFaceSize(between * (1 + 0.025 * Math.sin(i / 3)), current);
    if (next !== current) flips++;
    current = next;
  }
  assert.ok(flips <= 1, `a wobble of 2.5% about the middle flips it ${flips} times`);
});

test('his face’s span: model units across one cell at the eyes, from the face’s own triangles', () => {
  // A flat face 3 units wide over u 0..0.5 and 6 tall over v 0..0.5, the eyes' band inside it.
  const uv = [0, 0, 0.5, 0, 0, 0.5, 0.5, 0.5];
  const index = [0, 1, 2, 1, 3, 2];
  const flat = [0, 0, 0, 3, 0, 0, 0, -6, 0, 3, -6, 0];
  assert.ok(
    Math.abs(faceSpan(flat, uv, index) - 3) < 1e-9,
    `one cell is 3 units across (${faceSpan(flat, uv, index)})`,
  );
  // Mirrored (x negative) and slanted toward z: only its width across the face counts.
  const turned = [0, 0, 0, -3, 0, 4, 0, -6, 0, -3, -6, 4];
  assert.ok(Math.abs(faceSpan(turned, uv, index) - 3) < 1e-9, 'its sideways extent, not its slant');
  assert.equal(faceSpan([], [], []), 0, 'no face: 0');
});
