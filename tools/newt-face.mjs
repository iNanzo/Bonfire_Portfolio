// NEWT's pixel face sheet for the invitation toy (public/models/newt-face.png), made from the
// face sheet inside public/models/newt.glb. At the toy's pixel sizes his half face (each cell
// holds half: the head mirrors it) covers only about 6-8 texels across and 12-14 down on a
// phone, and the 1024 sheet averages down to a blank face; this redraws each of its four cells
// (neutral, blink, happy, surprised: clips.js FACES, the same 2x2 layout) as a small pixel cell
// about as many pixels as those texels, so nearest sampling neither drops nor doubles a
// feature. The dark features (eyes, lids, brows, mouth) are found and kept at least `--min`
// pixels thick both ways, in the darker half of their colours (an eye's grey iris and black
// lashes read as one dark eye, not a grey smudge); the eyes' whites turn to ink too (--whites
// dark: a white texel in a 3-texel eye reads as noise); the other light features (a blush) are
// kept where they cover enough of a pixel; the rest is the skin. character.js uses it (nearest,
// no mipmaps) while the pixel filter is on. Re-runnable:
//
//   node tools/newt-face.mjs [--cell 8x14] [--min 2] [--whites dark|keep] [--brows off|on]
//                            [--drop 1] [--mode drawn|traced] [--eye-x 2.5]
//                            [--glb public/models/newt.glb] [--out public/models/newt-face.png]
//                            [--preview <png>]
//
//   --cell     a cell's size in pixels, W x H (or one number for a square); the sheet is twice
//              that each way
//   --min      the least thickness of a dark feature, pixels, across and down
//   --whites   dark: the eyes' whites become part of the dark eye; keep: drawn as light features
//   --mode     drawn: pixel-art eyes stamped where the traced eyes sit (GLYPHS); traced: the
//              sheet itself, cell by cell (the options below shape it)
//   --eye-x    drawn: the eyes' centres this many pixels from the middle of his face (traced:
//              where the sheet has them)
//   --drop     the features moved this many pixels down the cell, out from under his brim
//   --brows    off: a stroke over another (a brow over its eye or lid) is left out; on: kept
//   --preview  also write a x16 picture of the cells beside the whole faces, for looking at
import fs from 'node:fs';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const [CELL_W, CELL_H] = (() => {
  const [w, h = w] = String(opt('cell', '8x14')).split('x').map(Number);
  return [w, h];
})();
const MIN = Number(opt('min', '2'));
const WHITES = opt('whites', 'dark');
const BROWS = opt('brows', 'off');
const DROP = Number(opt('drop', '1'));
const MODE = opt('mode', 'drawn');
/** Drawn eyes: their centre's distance from the middle of his face, cell pixels (traced: --eye-x traced). */
const EYE_X = opt('eye-x', '2.5');
const GLB = opt('glb', 'public/models/newt.glb');
const OUT = opt('out', 'public/models/newt-face.png');
const PREVIEW = opt('preview', null);
/** A source pixel is dark under this luma (0..1); a feature when this far (0..255 RGB) from the skin. */
const DARK_LUMA = 0.42;
const FEATURE_DIST = 22;
/** How much of an output pixel the dark or the light features must cover to show. */
const DARK_COVER = 0.1;
const FEATURE_COVER = 0.15;
/** The cells, as clips.js FACES has them: [column, row] on the 2×2 sheet. */
const CELLS = { neutral: [0, 0], blink: [1, 0], happy: [0, 1], surprised: [1, 1] };

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
/** An eye's white: light and grey (a blush is light but pink, and stays a light feature). */
const isWhite = (c) => luma(...c) > 0.72 && Math.max(...c) - Math.min(...c) < 40;

/**
 * One cell of the sheet as a CELL_W × CELL_H pixel cell (RGBA).
 * @param {Buffer} px  the sheet, RGBA
 * @param {number} W  the sheet's width
 * @param {number} x0  the cell's left, sheet pixels
 * @param {number} y0  its top
 * @param {number} size  its width and height, sheet pixels
 */
function pixelCell(px, W, x0, y0, size) {
  const brow = BROWS === 'off' ? brows(px, W, x0, y0, size) : null;
  const sheetAt = (x, y) => !brow || !brow[(y - y0) * size + (x - x0)];
  // The skin: the commonest colour (in 4-bit bins), averaged.
  const bins = new Map();
  for (let y = y0; y < y0 + size; y += 2)
    for (let x = x0; x < x0 + size; x += 2) {
      const i = (y * W + x) * 4;
      const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
      const b = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n++;
      b.r += px[i];
      b.g += px[i + 1];
      b.b += px[i + 2];
      bins.set(key, b);
    }
  const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  const skin = [top.r / top.n, top.g / top.n, top.b / top.n];
  const all = [];
  for (let y = y0; y < y0 + size; y += 2)
    for (let x = x0; x < x0 + size; x += 2) {
      const i = (y * W + x) * 4;
      if (sheetAt(x, y) && luma(px[i], px[i + 1], px[i + 2]) < DARK_LUMA) all.push([px[i], px[i + 1], px[i + 2]]);
    }
  const cellInk = all.length ? inkOf(all) : [24, 20, 24];
  const out = new Uint8Array(CELL_W * CELL_H * 4);
  const dark = new Uint8Array(CELL_W * CELL_H);
  const darkColour = new Float64Array(CELL_W * CELL_H * 3);
  const sx = size / CELL_W;
  const sy = size / CELL_H;
  for (let oy = 0; oy < CELL_H; oy++)
    for (let ox = 0; ox < CELL_W; ox++) {
      const b = block(
        px,
        W,
        [Math.floor(x0 + ox * sx), Math.floor(x0 + (ox + 1) * sx)],
        [Math.floor(y0 + oy * sy), Math.floor(y0 + (oy + 1) * sy)],
        skin,
        sheetAt,
      );
      const o = oy * CELL_W + ox;
      let colour = skin;
      if (b.dark.length / b.n >= DARK_COVER) {
        colour = inkOf(b.dark);
        // (A grey, the iris, reads as the eye's ink; a coloured dark, the mouth, keeps its colour.)
        if (Math.max(...colour) - Math.min(...colour) < 36) colour = cellInk;
        dark[o] = 1;
        darkColour.set(colour, o * 3);
      } else if (b.nf / b.n >= FEATURE_COVER) colour = b.f.map((v) => v / b.nf);
      out.set([...colour.map(Math.round), 255], o * 4);
    }
  thicken(out, dark, darkColour);
  return lower(out, skin);
}

/**
 * The features moved DROP pixels down the cell (his cap's brim and fringe cover the top of his
 * face from the toy's camera: this keeps the eyes out from under them), the skin filling in.
 */
function lower(out, skin) {
  if (DROP <= 0) return out;
  const moved = new Uint8Array(out.length);
  for (let y = 0; y < CELL_H; y++)
    for (let x = 0; x < CELL_W; x++) {
      const from = y - DROP;
      const o = (y * CELL_W + x) * 4;
      if (from >= 0) moved.set(out.subarray((from * CELL_W + x) * 4, (from * CELL_W + x) * 4 + 4), o);
      else moved.set([...skin.map(Math.round), 255], o);
    }
  return moved;
}

/**
 * The brows: a mask (1: drop) of the dark strokes that sit over another dark stroke they mostly
 * overlap across (a brow over its eye, or over its closed lid). At these sizes a brow merges
 * with the eye below it into one blob that reads as an open eye, closed or not; under his
 * fringe it rarely shows anyway.
 */
function brows(px, W, x0, y0, size) {
  const label = new Int32Array(size * size).fill(-1);
  const boxes = [];
  const dark = (x, y) => {
    const i = ((y0 + y) * W + x0 + x) * 4;
    return luma(px[i], px[i + 1], px[i + 2]) < DARK_LUMA;
  };
  const visit = (x, y, id, stack) => {
    if (x < 0 || y < 0 || x >= size || y >= size || label[y * size + x] >= 0 || !dark(x, y)) return;
    label[y * size + x] = id;
    stack.push([x, y]);
  };
  for (let sy = 0; sy < size; sy++)
    for (let sx = 0; sx < size; sx++) {
      if (label[sy * size + sx] >= 0 || !dark(sx, sy)) continue;
      const box = { l: sx, r: sx, t: sy, b: sy, n: 0, id: boxes.length };
      const stack = [[sx, sy]];
      label[sy * size + sx] = box.id;
      while (stack.length) {
        const [x, y] = stack.pop();
        box.n++;
        Object.assign(box, {
          l: Math.min(box.l, x),
          r: Math.max(box.r, x),
          t: Math.min(box.t, y),
          b: Math.max(box.b, y),
        });
        visit(x + 1, y, box.id, stack);
        visit(x - 1, y, box.id, stack);
        visit(x, y + 1, box.id, stack);
        visit(x, y - 1, box.id, stack);
      }
      boxes.push(box);
    }
  const big = boxes.filter((b) => b.n > size / 4);
  const drop = new Set(
    big
      .filter((a) =>
        big.some((b) => {
          if (b === a || b.t <= a.b) return false;
          const overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l);
          return overlap > 0.5 * Math.min(a.r - a.l, b.r - b.l) && b.t - a.b < size / 6;
        }),
      )
      .map((b) => b.id),
  );
  return label.map((id) => (drop.has(id) ? 1 : 0));
}

/** The darker half of some dark colours, averaged (lashes over a grey iris: the lashes win). */
function inkOf(colours) {
  const sorted = colours.slice().sort((a, b) => luma(...a) - luma(...b));
  const half = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  return [0, 1, 2].map((k) => half.reduce((s, c) => s + c[k], 0) / half.length);
}

/**
 * What covers a block of the sheet ([x0, x1) × [y0, y1)): how many pixels (n), the dark ones'
 * colours (dark: with --whites dark an eye's whites count, in the ink of the darks around
 * them) and how many light features (nf, their colours summed in f).
 */
function block(px, W, [x0, x1], [y0, y1], skin, kept) {
  const b = { n: 0, dark: [], whites: 0, nf: 0, f: [0, 0, 0] };
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const c = kept(x, y) ? [px[i], px[i + 1], px[i + 2]] : skin;
      b.n++;
      if (luma(...c) < DARK_LUMA) b.dark.push(c);
      else if (WHITES === 'dark' && isWhite(c)) b.whites++;
      else if (!near(c, skin)) {
        b.nf++;
        c.forEach((v, k) => (b.f[k] += v));
      }
    }
  // (An eye's white joins the dark only beside some dark: a white with no iris is no eye.)
  if (b.whites && b.dark.length) {
    const ink = inkOf(b.dark);
    for (let k = 0; k < b.whites; k++) b.dark.push(ink);
  }
  return b;
}
const near = (c, skin) => Math.hypot(c[0] - skin[0], c[1] - skin[1], c[2] - skin[2]) <= FEATURE_DIST;

/**
 * Every dark run at least MIN pixels long, down each column and along each row: a run that's
 * shorter grows over the skin beside it (down, or right; up, or left, at the cell's far edge),
 * in its own colour.
 */
function thicken(out, dark, darkColour) {
  const grow = (from, to) => {
    if (dark[to]) return;
    dark[to] = 2;
    darkColour.copyWithin(to * 3, from * 3, from * 3 + 3);
    out.set([...Array.from(darkColour.subarray(to * 3, to * 3 + 3), Math.round), 255], to * 4);
  };
  // (Round until nothing grows: a pixel grown along a row may itself need growing down.)
  let before = -1;
  for (let pass = 0; pass < 16 && dark.reduce((s, v) => s + (v ? 1 : 0), 0) !== before; pass++) {
    before = dark.reduce((s, v) => s + (v ? 1 : 0), 0);
    for (const vertical of [true, false]) thickenAlong(vertical, out, dark, darkColour, grow);
  }
}

/** One pass of thicken: down every column, or along every row. */
function thickenAlong(vertical, out, dark, darkColour, grow) {
  {
    const lines = vertical ? CELL_W : CELL_H;
    const len = vertical ? CELL_H : CELL_W;
    for (let a = 0; a < lines; a++) {
      const at = (b) => (vertical ? b * CELL_W + a : a * CELL_W + b);
      let run = 0;
      for (let b = 0; b <= len; b++) {
        if (b < len && dark[at(b)]) {
          run++;
          continue;
        }
        // (A run just ended before b: grow it to MIN, onward from its end, or back from its start.)
        let short = MIN - run;
        for (let end = b; run > 0 && short > 0 && end < len && !dark[at(end)]; end++, short--)
          grow(at(end - 1), at(end));
        for (let start = b - run - 1; run > 0 && short > 0 && start >= 0 && !dark[at(start)]; start--, short--)
          grow(at(start + 1), at(start));
        run = 0;
      }
    }
  }
}

/**
 * The drawn faces (--mode drawn): pixel-art eyes stamped where the traced neutral eye sits,
 * each at least 2 px each way, with 4+ px of skin between the two (traced, two almond eyes
 * a cell wide meet in the middle and read as sunglasses at this size), and a mouth in every
 * face, under the eyes and a pixel apart from them (without one his face read as two eye
 * blocks, its expression lost). Rows top to bottom, x toward his ear (the cell's left edge is
 * the middle of his face, so a mouth in the first column is 2 px wide once mirrored): X the
 * eye's ink, m the open mouth's dark, t a closed mouth's lighter line (a pixel tall, a dark
 * would read as a hole), p the blush.
 */
const GLYPHS = {
  neutral: { eye: ['XX', 'XX', 'XX'], mouth: ['t'] },
  blink: { eye: ['..', 'XXX', '..X'], mouth: ['t'] },
  happy: { eye: ['.XX.', 'XXXX', 'X..X'], blush: ['pp'], mouth: ['t', 't'] },
  surprised: { eye: ['XXX', 'XXX', 'XXX'], mouth: ['mm', 'mm'] },
};

/**
 * The drawn cells, on the traced cells' skin, placed by the traced neutral eye.
 * @param {Record<string, Uint8Array>} traced
 */
function drawn(traced) {
  const lum = (c, i) => luma(c[i], c[i + 1], c[i + 2]);
  // The neutral eye: the dark pixels away from the middle (the mouth sits on it).
  const eye = { l: CELL_W, r: -1, t: CELL_H, b: -1 };
  const n = traced.neutral;
  for (let y = 0; y < CELL_H; y++)
    for (let x = 2; x < CELL_W; x++)
      if (lum(n, (y * CELL_W + x) * 4) < 0.3)
        Object.assign(eye, {
          l: Math.min(eye.l, x),
          r: Math.max(eye.r, x),
          t: Math.min(eye.t, y),
          b: Math.max(eye.b, y),
        });
  // (Traced, his almond eyes sit at his sideburns, where a 2-texel eye reads as hair.)
  const cx = EYE_X !== 'traced' ? Number(EYE_X) : eye.r >= 0 ? (eye.l + eye.r) / 2 : CELL_W / 2;
  const cy = eye.b >= 0 ? (eye.t + eye.b) / 2 : CELL_H / 2;
  // Colours: the skin (each cell's corner), the ink (the darkest traced pixel), the mouth.
  let ink = [24, 20, 24];
  let inkL = 1;
  for (const c of Object.values(traced))
    for (let i = 0; i < c.length; i += 4)
      if (lum(c, i) < inkL) {
        inkL = lum(c, i);
        ink = [c[i], c[i + 1], c[i + 2]];
      }
  const MOUTH = { m: [86, 46, 40], t: [128, 68, 58] };
  const BLUSH = [240, 160, 150];
  /** @type {Record<string, Uint8Array>} */
  const out = {};
  for (const [name, glyph] of Object.entries(GLYPHS)) {
    const skin = Array.from(traced[name].subarray(0, 3));
    const cell = new Uint8Array(CELL_W * CELL_H * 4);
    for (let i = 0; i < cell.length; i += 4) cell.set([...skin, 255], i);
    const put = (x, y, c) => {
      if (x >= 0 && y >= 0 && x < CELL_W && y < CELL_H) cell.set([...c, 255], (y * CELL_W + x) * 4);
    };
    const rows = glyph.eye;
    const w = Math.max(...rows.map((r) => r.length));
    const x0 = Math.round(cx - (w - 1) / 2);
    // (The traced cells are already lowered by DROP.)
    const y0 = Math.round(cy - (rows.length - 1) / 2);
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && put(x0 + x, y0 + y, ink)));
    glyph.blush?.forEach((row, y) =>
      [...row].forEach((ch, x) => ch === 'p' && put(x0 + w - row.length + x, y0 + rows.length + 1 + y, BLUSH)),
    );
    glyph.mouth?.forEach((row, y) => [...row].forEach((ch, x) => MOUTH[ch] && put(x, y0 + rows.length + y, MOUTH[ch])));
    out[name] = cell;
  }
  return out;
}

const sheet = glbImage(GLB, 'NEWT_Face');
const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const half = Math.floor(info.width / 2);
const composite = [];
const traced = Object.fromEntries(
  Object.entries(CELLS).map(([name, [cx, cy]]) => [name, pixelCell(data, info.width, cx * half, cy * half, half)]),
);
const cells = MODE === 'drawn' ? drawn(traced) : traced;
for (const [name, [cx, cy]] of Object.entries(CELLS))
  composite.push({
    input: await sharp(Buffer.from(cells[name]), { raw: { width: CELL_W, height: CELL_H, channels: 4 } })
      .png()
      .toBuffer(),
    left: cx * CELL_W,
    top: cy * CELL_H,
  });
await sharp({ create: { width: CELL_W * 2, height: CELL_H * 2, channels: 4, background: '#00000000' } })
  .composite(composite)
  .png({ compressionLevel: 9 })
  .toFile(OUT);
console.log(`✓ ${OUT}: ${CELL_W * 2}×${CELL_H * 2}, cells of ${CELL_W}×${CELL_H} px, features at least ${MIN} px`);

if (PREVIEW) {
  // Each cell beside the whole face it makes (the cell mirrored onto the other half), ×16.
  const tiles = [];
  for (const cell of Object.values(cells)) {
    const raw = sharp(Buffer.from(cell), { raw: { width: CELL_W, height: CELL_H, channels: 4 } });
    const mirrored = await raw.clone().flop().png().toBuffer();
    const plain = await raw.clone().png().toBuffer();
    tiles.push(
      await sharp({ create: { width: CELL_W * 2, height: CELL_H, channels: 4, background: '#000000ff' } })
        .composite([
          { input: mirrored, left: 0, top: 0 },
          { input: plain, left: CELL_W, top: 0 },
        ])
        .png()
        .toBuffer(),
    );
  }
  const S = 16;
  const rows = await Promise.all(
    tiles.map(async (face, i) => ({
      input: await sharp(face)
        .resize(CELL_W * 2 * S, CELL_H * S, { kernel: 'nearest' })
        .png()
        .toBuffer(),
      left: i * (CELL_W * 2 * S + 8),
      top: 0,
    })),
  );
  await sharp({
    create: { width: tiles.length * (CELL_W * 2 * S + 8), height: CELL_H * S, channels: 4, background: '#000' },
  })
    .composite(rows)
    .png()
    .toFile(PREVIEW);
  console.log(`✓ ${PREVIEW}`);
}
