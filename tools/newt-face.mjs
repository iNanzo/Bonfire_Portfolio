// NEWT's pixel face sheet for the invitation toy (public/models/newt-face.png), made from the
// face sheet inside public/models/newt.glb. At the toy's pixel sizes his head is only a dozen
// or two texels wide, and the 1024 sheet averages down to a blank face; this redraws each of its
// four cells (neutral, blink, happy, surprised: clips.js FACES, the same 2×2 layout) as a small
// pixel cell: the dark features (eyes, brows, lids, mouth) found and kept at least `--min`
// pixels thick, the light ones (the eyes' whites, a blush) kept where they cover enough of a
// pixel, the rest the skin. character.js uses it (nearest, no mipmaps) while the pixel filter
// is on. Re-runnable:
//
//   node tools/newt-face.mjs [--cell 24] [--min 2] [--glb public/models/newt.glb]
//                            [--out public/models/newt-face.png] [--preview <png>]
//
//   --cell     a cell's size in pixels (the sheet is twice that each way)
//   --min      the least thickness of a dark feature, pixels
//   --preview  also write a ×8 picture of the cells beside the whole faces (each cell holds
//              half the face: the head mirrors it), for looking at
import fs from 'node:fs';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const CELL = Number(opt('cell', '24'));
const MIN = Number(opt('min', '2'));
const GLB = opt('glb', 'public/models/newt.glb');
const OUT = opt('out', 'public/models/newt-face.png');
const PREVIEW = opt('preview', null);
/** A source pixel is dark under this luma (0..1); a feature when this far (0..255 RGB) from the skin. */
const DARK_LUMA = 0.42;
const FEATURE_DIST = 48;
/** How much of an output pixel the dark or the light features must cover to show. */
const DARK_COVER = 0.16;
const FEATURE_COVER = 0.3;
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

/**
 * One cell of the sheet as a CELL × CELL pixel cell (RGBA).
 * @param {Buffer} px  the sheet, RGBA
 * @param {number} W  the sheet's width
 * @param {number} x0  the cell's left, sheet pixels
 * @param {number} y0  its top
 * @param {number} size  its width and height, sheet pixels
 */
function pixelCell(px, W, x0, y0, size) {
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
  const out = new Uint8Array(CELL * CELL * 4);
  const dark = new Uint8Array(CELL * CELL);
  const darkColour = new Float64Array(CELL * CELL * 3);
  const step = size / CELL;
  for (let oy = 0; oy < CELL; oy++)
    for (let ox = 0; ox < CELL; ox++) {
      const [x1, y1] = [Math.floor(x0 + ox * step), Math.floor(y0 + oy * step)];
      const b = block(px, W, x1, y1, Math.floor(x0 + (ox + 1) * step), Math.floor(y0 + (oy + 1) * step), skin);
      const o = oy * CELL + ox;
      let colour = skin;
      if (b.nd / b.n >= DARK_COVER) {
        colour = b.d.map((v) => v / b.nd);
        dark[o] = 1;
        darkColour.set(colour, o * 3);
      } else if (b.nf / b.n >= FEATURE_COVER) colour = b.f.map((v) => v / b.nf);
      out.set([...colour.map(Math.round), 255], o * 4);
    }
  thicken(out, dark, darkColour);
  return out;
}

/**
 * What covers a block of the sheet ([x0, x1) × [y0, y1)): how many pixels (n), how many dark
 * (nd, their colours summed in d) and how many light features (nf, summed in f).
 */
function block(px, W, x0, y0, x1, y1, skin) {
  const b = { n: 0, nd: 0, nf: 0, d: [0, 0, 0], f: [0, 0, 0] };
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const c = [px[i], px[i + 1], px[i + 2]];
      b.n++;
      const sum = luma(...c) < DARK_LUMA ? (b.nd++, b.d) : near(c, skin) ? null : (b.nf++, b.f);
      if (sum) c.forEach((v, k) => (sum[k] += v));
    }
  return b;
}
const near = (c, skin) => Math.hypot(c[0] - skin[0], c[1] - skin[1], c[2] - skin[2]) <= FEATURE_DIST;

/**
 * Every dark run at least MIN pixels long, down each column and along each row: a run that's
 * shorter grows (down, or right) over the skin beside it, in its own colour.
 */
function thicken(out, dark, darkColour) {
  const grow = (from, to) => {
    if (dark[to]) return;
    dark[to] = 2;
    darkColour.copyWithin(to * 3, from * 3, from * 3 + 3);
    out.set([...Array.from(darkColour.subarray(to * 3, to * 3 + 3), Math.round), 255], to * 4);
  };
  for (const vertical of [true, false])
    for (let a = 0; a < CELL; a++) {
      const at = (b) => (vertical ? b * CELL + a : a * CELL + b);
      let run = 0;
      for (let b = 0; b <= CELL; b++) {
        if (b < CELL && dark[at(b)] === 1) {
          run++;
          continue;
        }
        // (A run just ended before b: grow it to MIN, onward from its end.)
        for (let end = b; run > 0 && end < Math.min(CELL, b - run + MIN); end++) grow(at(end - 1), at(end));
        run = 0;
      }
    }
}

const sheet = glbImage(GLB, 'NEWT_Face');
const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const half = Math.floor(info.width / 2);
const composite = [];
const cells = {};
for (const [name, [cx, cy]] of Object.entries(CELLS)) {
  const cell = pixelCell(data, info.width, cx * half, cy * half, half);
  cells[name] = cell;
  composite.push({
    input: await sharp(Buffer.from(cell), { raw: { width: CELL, height: CELL, channels: 4 } })
      .png()
      .toBuffer(),
    left: cx * CELL,
    top: cy * CELL,
  });
}
await sharp({ create: { width: CELL * 2, height: CELL * 2, channels: 4, background: '#00000000' } })
  .composite(composite)
  .png({ compressionLevel: 9 })
  .toFile(OUT);
console.log(`✓ ${OUT}: ${CELL * 2}×${CELL * 2}, cells of ${CELL} px, features at least ${MIN} px`);

if (PREVIEW) {
  // Each cell beside the whole face it makes (the cell mirrored onto the other half), ×8.
  const tiles = [];
  for (const [name, cell] of Object.entries(cells)) {
    const raw = sharp(Buffer.from(cell), { raw: { width: CELL, height: CELL, channels: 4 } });
    const mirrored = await raw.clone().flop().png().toBuffer();
    const plain = await raw.clone().png().toBuffer();
    const face = await sharp({ create: { width: CELL * 2, height: CELL, channels: 4, background: '#000000ff' } })
      .composite([
        { input: mirrored, left: 0, top: 0 },
        { input: plain, left: CELL, top: 0 },
      ])
      .png()
      .toBuffer();
    tiles.push({ name, face });
  }
  const S = 8;
  const rows = await Promise.all(
    tiles.map(async (t, i) => ({
      input: await sharp(t.face)
        .resize(CELL * 2 * S, CELL * S, { kernel: 'nearest' })
        .png()
        .toBuffer(),
      left: 0,
      top: i * CELL * S,
    })),
  );
  await sharp({ create: { width: CELL * 2 * S, height: CELL * S * tiles.length, channels: 4, background: '#000' } })
    .composite(rows)
    .png()
    .toFile(PREVIEW);
  console.log(`✓ ${PREVIEW}`);
}
