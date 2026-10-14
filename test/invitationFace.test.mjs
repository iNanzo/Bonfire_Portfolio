// NEWT's pixel faces (public/models/newt-face.png, made by tools/newt-face.mjs; laid out by
// src/invitation/faceSheets.js): one 2×2 sheet (clips.js FACES' layout) for each of a ladder of
// cell sizes, so character.js can show the one whose cell is as many pixels as his half face
// covers texels (nearest sampling then neither drops nor doubles a feature, and the eyes keep
// one shape as he moves). Every sheet: opaque; his smooth face (the glb's own sheet) scaled down,
// each expression's eye, brow, mouth and blush where the smooth sheet has them; an open eye as it
// draws it (a heavy dark lid over the white, a dark pupil just under it in a grey iris), closed a
// lid line, happy an arc; surprised wider, its brow higher and its mouth a dark o; a small mouth
// under the eyes and apart from them, a 1 px brow with skin under it where there's room; no lone
// dark pixel but a pupil; four faces that differ, each size's eye at least as big as the one
// under it. The pick between sheets holds on to the one showing until another fits clearly
// better (no flicker between two sizes), and his face's span is measured from its own geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import {
  FACE_ASPECT,
  FACE_HYSTERESIS,
  FACE_IMAGE,
  FACE_LAYOUT,
  FACE_SIZES,
  SMOOTH_FACE_OVER,
  faceSpan,
  pickFaceSize,
} from '../src/invitation/faceSheets.js';

const FILE = fileURLToPath(new URL('../public/models/newt-face.png', import.meta.url));
const GLB = fileURLToPath(new URL('../public/models/newt.glb', import.meta.url));
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

/** What a pixel of a face is, by its colour: ink (lids, brows, pupils), the iris's greys, the white, the mouth, the blush, or skin. */
function kindOf([r, g, b]) {
  const l = luma(r, g, b);
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (l < 0.15) return 'ink';
  if (sat < 24 && l > 0.85) return 'white';
  if (sat < 24 && l < 0.6) return 'iris';
  if (r > 215 && r - g > 60) return 'blush';
  if (r - b > 25 && l < 0.4) return 'mouth';
  return 'skin';
}

/** A box round [x, y] points: left, right, top, bottom (inclusive), or null for none. */
function box(points) {
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

/**
 * A face's parts in a w × h grid of kinds (kind(x, y)): the brow (the topmost ink, a line apart
 * from the eye), the eye (the rest of the ink, the white and the iris), the mouth (in the lowest
 * quarter) and the blush, each as its pixels and box; ink, white and iris in
 * patches of `speck` pixels or fewer left out (the smooth sheet's antialiased edges).
 */
function partsOf(w, h, kind, speck = 0) {
  const low = Math.floor(h * 0.75);
  const ink = components(w, h, (x, y) => kind(x, y) === 'ink')
    .filter((c) => c.px.length > speck)
    .sort((a, b) => a.t - b.t);
  const lit = components(w, h, (x, y) => y < low && (kind(x, y) === 'white' || kind(x, y) === 'iris'))
    .filter((c) => c.px.length > speck)
    .flatMap((c) => c.px);
  const litTop = Math.min(h, ...lit.map(([, y]) => y));
  // (The brow: the topmost ink when there's more below it and it's clear of the eye's white.)
  const brow = ink.length >= 2 && ink[0].b < litTop && ink[0].b < ink[1].t ? ink[0] : null;
  const eyePx = [...ink.filter((c) => c !== brow).flatMap((c) => c.px), ...lit];
  const mouthPx = pixels(w, h, (x, y) => y >= low && kind(x, y) === 'mouth');
  const blushPx = pixels(w, h, (x, y) => kind(x, y) === 'blush');
  return {
    brow: brow && { px: brow.px, ...box(brow.px) },
    eye: { px: eyePx, ...box(eyePx) },
    mouth: { px: mouthPx, ...box(mouthPx) },
    blush: { px: blushPx, ...box(blushPx) },
    count: (k) => pixels(w, h, (x, y) => kind(x, y) === k).length,
  };
}

/** The glb's smooth face sheet (NEWT_Face), RGBA. */
async function smoothSheet() {
  const buf = fs.readFileSync(GLB);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const material = gltf.materials.find((m) => m.name === 'NEWT_Face');
  const texture = gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const view = gltf.bufferViews[gltf.images[texture.extensions?.EXT_texture_webp?.source ?? texture.source].bufferView];
  const at = 20 + jsonLen + 8 + (view.byteOffset ?? 0);
  return sharp(buf.subarray(at, at + view.byteLength))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/** Each face's parts on the smooth sheet, as shares of a cell (u across from the middle of his face, v down). */
async function smoothParts() {
  const { data, info } = await smoothSheet();
  const n = info.width / 2;
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, [cx, cy]] of Object.entries(CELLS)) {
    const kind = (x, y) => {
      const i = ((cy * n + y) * info.width + cx * n + x) * 4;
      return kindOf([data[i], data[i + 1], data[i + 2]]);
    };
    const p = partsOf(n, n, kind, 40);
    const uv = (b) => b && b.px.length && { u0: b.l / n, u1: (b.r + 1) / n, v0: b.t / n, v1: (b.b + 1) / n };
    out[name] = { brow: uv(p.brow), eye: uv(p.eye), mouth: uv(p.mouth), blush: uv(p.blush) };
  }
  return out;
}

/** A pixel cell's kinds, and its parts. */
function cellParts({ px, w, h }) {
  const kinds = px.map(kindOf);
  const kind = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? kinds[y * w + x] : 'skin');
  return { kind, ...partsOf(w, h, kind) };
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

test('the pixel faces are his smooth face scaled down: per expression the eye, the brow, the mouth and the blush sit where the smooth sheet has them, scaled to each cell', async () => {
  const smooth = await smoothParts();
  // (The smooth sheet itself: an eye, a brow and a mouth in every face, the blush on happy.)
  for (const [name, s] of Object.entries(smooth)) {
    assert.ok(s.eye && s.brow && s.mouth, `smooth ${name}: an eye, a brow and a mouth`);
    assert.equal(Boolean(s.blush), name === 'happy', `smooth ${name}: a blush only when happy`);
  }
  for (const { sheet, cells } of await sheets()) {
    const { w, h } = sheet;
    if (w < 5) continue;
    // (A pixel either way, and a share of the cell for the rounding a feature's thickness needs.)
    const tx = 1 + 0.05 * w;
    const ty = 1 + 0.04 * h;
    for (const [name, cell] of Object.entries(cells)) {
      const tag = `${w} px ${name}`;
      const p = cellParts(cell);
      const s = smooth[name];
      const near = (got, want, tol, what) =>
        assert.ok(
          Math.abs(got - want) <= tol,
          `${tag}: ${what} at ${got}, the smooth face's at ${want.toFixed(1)} (±${tol.toFixed(1)})`,
        );
      const fits = (b, uv, what, { top = ty, bottom = ty } = {}) => {
        assert.ok(b && b.px.length, `${tag}: ${what}`);
        near(b.l, uv.u0 * w, tx, `${what}'s left`);
        near(b.r + 1, uv.u1 * w, tx, `${what}'s right`);
        near(b.t, uv.v0 * h, top, `${what}'s top`);
        near(b.b + 1, uv.v1 * h, bottom, `${what}'s bottom`);
      };
      fits(p.eye, s.eye, 'the eye');
      fits(p.mouth, s.mouth, 'the mouth', { top: ty + 0.5, bottom: ty + 0.5 });
      // (The brow may sit a row or two higher, for a row of skin between it and the lid.)
      if (w >= 10) fits(p.brow, s.brow, 'the brow', { top: ty + 2, bottom: ty + 2 });
      if (name === 'happy' && w >= 8) fits(p.blush, s.blush, 'the blush', { top: ty + 0.5, bottom: ty + 0.5 });
      if (name !== 'happy') assert.equal(p.blush.px.length, 0, `${tag}: no blush`);
    }
  }
});

test('his eye as the smooth face draws it: a heavy dark upper lid over the white, a dark pupil just under it in a grey iris; closed, a lid line; happy, an arc', async () => {
  for (const { sheet, cells } of await sheets()) {
    const { w } = sheet;
    for (const [name, cell] of Object.entries(cells)) {
      const tag = `${w} px ${name}`;
      const p = cellParts(cell);
      const { kind } = p;
      const e = p.eye;
      assert.ok(e.px.length >= 2, `${tag}: an eye`);
      const ew = e.r - e.l + 1;
      /** The longest unbroken run of ink along row y of the eye. */
      const run = (y) => {
        let best = 0;
        let n = 0;
        for (let x = e.l; x <= e.r; x++) best = Math.max(best, (n = kind(x, y) === 'ink' ? n + 1 : 0));
        return best;
      };
      if (name === 'neutral' || name === 'surprised') {
        // The lid: an unbroken run of ink along the eye's top, most of its width (thick as the
        // cell needs: 2 rows at most).
        assert.ok(run(e.t) >= Math.ceil(ew * 0.6), `${tag}: a lid along the eye's top (${run(e.t)} of ${ew})`);
        let lid = 0;
        while (run(e.t + lid) >= Math.ceil(ew * 0.6)) lid++;
        assert.ok(lid <= 2, `${tag}: a lid ${lid} rows thick`);
        if (w < 5) continue;
        // Under it, the white, and a dark pupil with the white or the iris beside it.
        assert.ok(p.count('white') >= 1, `${tag}: the white of the eye`);
        const pupil = e.px.filter(
          ([x, y]) =>
            y > e.t + lid - 1 &&
            kind(x, y) === 'ink' &&
            [kind(x - 1, y), kind(x + 1, y)].some((k) => k === 'white' || k === 'iris'),
        );
        assert.ok(pupil.length >= 1, `${tag}: a pupil under the lid`);
        if (w >= 10) assert.ok(p.count('iris') >= 2, `${tag}: a grey iris round the pupil`);
      } else {
        assert.equal(p.count('white'), 0, `${tag}: no white`);
        assert.equal(p.count('iris'), 0, `${tag}: no iris`);
        assert.ok(e.b - e.t + 1 <= (name === 'blink' ? 2 : Math.max(2, Math.round(sheet.h * 0.09))), `${tag}: a line`);
        assert.ok(ew >= 2, `${tag}: as wide as an eye`);
        if (name === 'happy' && w >= 8) {
          // An arc: its middle column's top no lower than its ends', its ends reaching lower.
          const ys = (x) => e.px.filter(([px]) => px === x).map(([, y]) => y);
          const m = Math.round((e.l + e.r) / 2);
          assert.ok(Math.min(...ys(m)) <= Math.min(...ys(e.l), ...ys(e.r)), `${tag}: an arc, its middle up`);
          for (const x of [e.l, e.r])
            assert.ok(Math.max(...ys(x)) > Math.max(...ys(m)), `${tag}: its end at ${x} down`);
        }
      }
    }
  }
});

test('the faces between them: surprised eyes wider and brows higher than neutral, its mouth a dark o; an open eye holds more than a closed one; no lone dark pixel but a pupil or a line’s step; four different faces', async () => {
  for (const { sheet, cells } of await sheets()) {
    const tag = `${sheet.w} px`;
    const parts = Object.fromEntries(Object.entries(cells).map(([n, c]) => [n, cellParts(c)]));
    const { neutral, surprised, blink } = parts;
    const lit = (p) => p.count('white') + p.count('iris');
    if (sheet.w >= 8) {
      assert.ok(
        lit(surprised) >= lit(neutral),
        `${tag}: a surprised eye shows as much white and iris as a neutral one`,
      );
      assert.ok(surprised.eye.t <= neutral.eye.t, `${tag}: its lid no lower`);
    }
    if (sheet.w >= 10) assert.ok(surprised.brow.t <= neutral.brow.t, `${tag}: its brow no lower`);
    /** The mouth's darkest pixel (luma) in a face. */
    const dark = (name) => {
      const c = cells[name];
      return Math.min(...parts[name].mouth.px.map(([x, y]) => luma(...c.px[y * c.w + x].slice(0, 3))));
    };
    assert.ok(
      surprised.mouth.b - surprised.mouth.t >= neutral.mouth.b - neutral.mouth.t,
      `${tag}: an o at least as tall as the neutral mouth`,
    );
    assert.ok(dark('surprised') <= dark('neutral'), `${tag}: and as dark`);
    const held = (p) => p.eye.px.length;
    assert.ok(held(neutral) > held(blink), `${tag}: an open eye holds more than a closed one`);
    for (const [name, p] of Object.entries(parts)) {
      const { w, h } = cells[name];
      for (const c of components(w, h, (x, y) => p.kind(x, y) === 'ink')) {
        if (c.px.length >= 2) continue;
        const [[x, y]] = c.px;
        const round = [p.kind(x - 1, y), p.kind(x + 1, y)];
        // (A line's step, touching the rest of it at a corner, is part of the line.)
        const corner = [-1, 1].some((dx) => [-1, 1].some((dy) => p.kind(x + dx, y + dy) === 'ink'));
        assert.ok(
          corner || round.every((k) => k === 'white' || k === 'iris'),
          `${tag} ${name}: a lone dark pixel at (${x}, ${y}) that isn't a pupil`,
        );
      }
    }
    const key = (c) => c.px.map((q) => kindOf(q)).join('');
    assert.equal(new Set(Object.values(cells).map(key)).size, 4, `${tag}: neutral, blink, happy and surprised differ`);
  }
});

test('the pixel faces: a small mouth in every face at every size, under the eyes and apart from them, and a 1 px brow with skin under it where there’s room', async () => {
  for (const { sheet, cells } of await sheets())
    for (const [name, cell] of Object.entries(cells)) {
      const tag = `${sheet.w} px ${name}`;
      const { w } = cell;
      const p = cellParts(cell);
      const m = p.mouth;
      // In the middle column (the cell's left edge is the middle of his face: mirrored, at least
      // 2 px wide), at least 1 px tall, small (the smooth face's is a seventh of a cell across).
      assert.ok(m.px.length >= 1 && m.l === 0, `${tag}: a mouth in the middle`);
      assert.ok(m.r + 1 <= Math.max(1, Math.ceil(w * 0.1)) + 1, `${tag}: a small mouth (${m.r + 1} px a side)`);
      assert.ok(m.t > p.eye.b, `${tag}: the mouth (row ${m.t}) under the eyes (row ${p.eye.b})`);
      const touches = ([x, y]) => [p.kind(x + 1, y), p.kind(x - 1, y), p.kind(x, y + 1), p.kind(x, y - 1)];
      assert.ok(
        m.px.every(
          (q) =>
            touches(q).every((k) => k !== 'white' && k !== 'iris') &&
            !p.eye.px.some(([x, y]) => Math.abs(x - q[0]) + Math.abs(y - q[1]) <= 1),
        ),
        `${tag}: no mouth pixel touches an eye`,
      );
      if (w < 8) continue;
      assert.ok(p.brow, `${tag}: a brow`);
      assert.equal(p.brow.b, p.brow.t, `${tag}: the brow is a 1 px line`);
      assert.ok(p.brow.r > p.brow.l, `${tag}: at least 2 px long`);
      assert.ok(p.eye.t - p.brow.b >= 2, `${tag}: skin between the brow and the eye`);
    }
});

test('the pixel faces grow steadily with the cell: each size’s eye at least as wide and tall as the size under it', async () => {
  let was = null;
  for (const { sheet, cells } of await sheets()) {
    const e = cellParts(cells.neutral).eye;
    const now = { w: e.r - e.l + 1, h: e.b - e.t + 1 };
    if (was) {
      assert.ok(now.w >= was.w, `${sheet.w} px: the eye ${now.w} wide after ${was.w}`);
      assert.ok(now.h >= was.h, `${sheet.w} px: the eye ${now.h} tall after ${was.h}`);
    }
    was = now;
  }
});

test('the sheet pick: the nearest size to his half face, held until another fits clearly better', () => {
  assert.equal(pickFaceSize(8, null), 8, 'a size that fits exactly');
  assert.equal(pickFaceSize(7.9, null), 8);
  assert.equal(
    pickFaceSize(FACE_SIZES.at(-1) * 1.1, null),
    FACE_SIZES.at(-1),
    'a little past the largest: the largest',
  );
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

test('past the largest sheet (zoomed in at the finest resolutions) the face is the smooth sheet, held through a small change; under the smallest, the smallest sheet', () => {
  const largest = FACE_SIZES.at(-1);
  const at = largest * SMOOTH_FACE_OVER;
  assert.ok(
    SMOOTH_FACE_OVER >= 1.1 && SMOOTH_FACE_OVER <= 1.5,
    `a quarter or so past the largest (${SMOOTH_FACE_OVER})`,
  );
  assert.equal(pickFaceSize(at * 0.98, null), largest, 'just under: the largest pixel sheet');
  assert.equal(pickFaceSize(at * 1.02, null), 'smooth', 'past it: smooth');
  assert.equal(pickFaceSize(400, null), 'smooth', 'a face hundreds of texels across (256×256, zoomed in)');
  // Held both ways: no flicker between the two as he breathes or the camera eases.
  assert.equal(pickFaceSize(at * 0.97, 'smooth'), 'smooth', 'a little under: it stays smooth');
  assert.equal(pickFaceSize(at * 1.03, largest), 'smooth');
  assert.equal(pickFaceSize(at * 0.8, 'smooth'), largest, 'clearly under: pixels again');
  assert.equal(pickFaceSize(Number.NaN, 'smooth'), 'smooth', 'no measure: the one showing stays');
  // 16×16: his half face under 3 texels, the smallest sheet.
  assert.equal(pickFaceSize(2.2, null), FACE_SIZES[0]);
  assert.equal(pickFaceSize(2.2, 'smooth'), FACE_SIZES[0]);
  // A one-sheet image (an older one cached): smooth past its own size the same way.
  assert.equal(pickFaceSize(20, null, [12]), 'smooth');
  assert.equal(pickFaceSize(13, null, [12]), 12);
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
