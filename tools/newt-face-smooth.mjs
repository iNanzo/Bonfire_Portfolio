// NEWT's smooth dialogue faces for the invitation toy (public/models/newt-face-smooth-extra.png): a
// second 1024 sheet beside the glb's own NEWT_Face sheet, laid out like it (a 2×2 sheet of half
// faces, each cell's left edge the middle of his face, which mirrors about it; clips.js
// EXTRA_FACES: sad, angry, shy, smug). Each is drawn from his own smooth neutral face by editing
// its parts in the same art style (tools/newt-face-design.mjs: the flat skin, the heavy round-ended
// ink lid and brow, the white, the grey iris with its darker band, the dark pupil, the thin brown
// lash, the small brown mouth, the soft blush), in its colours, sampled from the glb's sheet.
// character.js shows it wherever the smooth face shows (the pixel filter off, Pixel Face off, or
// zoomed in past the largest pixel sheet). Re-runnable:
//
//   node tools/newt-face-smooth.mjs [--glb public/models/newt.glb]
//                                   [--out public/models/newt-face-smooth-extra.png]
//                                   [--preview <png>] [--calibrate <png>]
//
//   --preview    also write all eight faces mirrored into whole faces, side by side
//   --calibrate  also write the glb's neutral cell beside this tool's drawing of it (NEUTRAL) and
//                their difference, to check the drawing matches his own face
import fs from 'node:fs';
import sharp from 'sharp';
import { CELL, EXTRA, NEUTRAL, SHY_BLUSH } from './newt-face-design.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const GLB = opt('glb', 'public/models/newt.glb');
const OUT = opt('out', 'public/models/newt-face-smooth-extra.png');
const PREVIEW = opt('preview', null);
const CALIBRATE = opt('calibrate', null);
/** The cells, as clips.js EXTRA_FACES has them: [column, row] on the 2×2 sheet. */
const CELLS = { sad: [0, 0], angry: [1, 0], shy: [0, 1], smug: [1, 1] };
/** The glb sheet's own cells (clips.js FACES), for the preview. */
const BASE_CELLS = { neutral: [0, 0], blink: [1, 0], happy: [0, 1], surprised: [1, 1] };

/** The bytes of the image the material `name` uses as its base colour, from a .glb. */
function glbImage(file, name) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const material = gltf.materials.find((m) => m.name === name);
  if (!material) throw new Error(`${file}: no material ${name}`);
  const texture = gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const source = texture.extensions?.EXT_texture_webp?.source ?? texture.source;
  const view = gltf.bufferViews[gltf.images[source].bufferView];
  const at = 20 + jsonLen + 8 + (view.byteOffset ?? 0);
  return buf.subarray(at, at + view.byteLength);
}

const luma = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * The face's colours from the glb's neutral and happy cells, where NEUTRAL has its parts (the
 * median of a small box; the lash and the mouth the median of their thin lines' cores): skin
 * (the cell's commonest colour), ink, white, iris, band, lash, mouth, blush.
 * @param {Buffer} px  the sheet, RGBA
 * @param {number} W  its width
 */
function colours(px, W) {
  const k = W / 2 / CELL;
  const at = (x, y) => {
    const i = (Math.round(y * k) * W + Math.round(x * k)) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  /** The colours of the box [x0, x1] × [y0, y1] in cell [cx, cy]. */
  const box = ([cx, cy], [x0, x1], [y0, y1]) => {
    const out = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(at(cx * CELL + x, cy * CELL + y));
    return out;
  };
  const median = (list) => [0, 1, 2].map((c) => list.map((v) => v[c]).sort((a, b) => a - b)[list.length >> 1]);
  // (A thin line's core: its pixels no lighter than its darkest by much, not its soft edge.)
  const core = (list) => {
    const dark = Math.min(...list.map((v) => luma(...v)));
    return list.filter((v) => luma(...v) <= dark + 0.06);
  };
  const bins = new Map();
  for (const c of box([0, 0], [0, 511], [0, 200])) {
    const key = c.join(',');
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  const skin = [...bins]
    .sort((a, b) => b[1] - a[1])[0][0]
    .split(',')
    .map(Number);
  return {
    skin,
    ink: median(box([0, 0], [160, 250], [303, 312])),
    white: median(box([0, 0], [100, 115], [335, 350])),
    iris: median(box([0, 0], [135, 155], [330, 345])),
    band: median(box([0, 0], [150, 250], [362, 372])),
    lash: median(core(box([0, 0], [190, 215], [382, 388]))),
    mouth: median(core(box([0, 0], [5, 25], [452, 460]))),
    blush: median(box([0, 1], [270, 300], [430, 438])),
  };
}

const rgb = (c) => `rgb(${c.map(Math.round).join(',')})`;
/** @param {number[][]} pts */
const points = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
/** @param {{pts: number[][], w: number}|null} s @param {number[]} col */
const stroke = (s, col) =>
  s
    ? `<polyline points="${points(s.pts)}" fill="none" stroke="${rgb(col)}" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
/** @param {{cx: number, cy: number, rx: number, ry: number}} e @param {number[]} col */
const ellipse = (e, col) => `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${rgb(col)}"/>`;

/**
 * One face as an SVG cell `size` px square, drawn in the sheet's own order: skin, the white (under
 * the lid's centre line), the iris and its band and the pupil inside the white, the lash, the lid
 * and its hook over them, the
 * brow, the mouth, the blush and its hatching.
 * @param {import('./newt-face-design.mjs').FaceDesign} f
 * @param {ReturnType<typeof colours>} c
 * @param {number} size
 */
function svg(f, c, size) {
  const blush = f.blush
    ? ellipse(f.blush, SHY_BLUSH.fill) +
      f.blush.hatch.map((pts) => stroke({ pts, w: f.blush.hatchW }, SHY_BLUSH.hatch)).join('')
    : '';
  // (The eye only under the lid's centre line: the white's and the iris's tops are tucked under it.)
  const lid = f.lid.pts;
  const open = [[0, lid[0][1]], ...lid, [CELL, lid.at(-1)[1]], [CELL, CELL], [0, CELL]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${CELL} ${CELL}">
<defs>
<clipPath id="open"><polygon points="${points(open)}"/></clipPath>
<clipPath id="white"><ellipse cx="${f.white.cx}" cy="${f.white.cy}" rx="${f.white.rx}" ry="${f.white.ry}"/></clipPath>
<clipPath id="band"><rect x="0" y="${f.iris.band}" width="${CELL}" height="${CELL}"/></clipPath>
</defs>
<rect width="${CELL}" height="${CELL}" fill="${rgb(c.skin)}"/>
<g clip-path="url(#open)">
${ellipse(f.white, c.white)}
<g clip-path="url(#white)">
${ellipse(f.iris, c.iris)}
<g clip-path="url(#band)">${ellipse(f.iris, c.band)}</g>
${ellipse(f.pupil, c.ink)}
${stroke(f.lash, c.lash)}
</g>
</g>
${stroke(f.lid, c.ink)}
${stroke(f.hook, c.ink)}
${stroke(f.brow, c.ink)}
${stroke(f.mouth, c.mouth)}
${blush}
</svg>`;
}

/** @param {import('./newt-face-design.mjs').FaceDesign} f @param {ReturnType<typeof colours>} c @param {number} size */
const render = (f, c, size) =>
  sharp(Buffer.from(svg(f, c, size)))
    .removeAlpha()
    .ensureAlpha()
    .png()
    .toBuffer();

/** A half face (a cell, PNG) mirrored into a whole one about its left edge. */
async function whole(cell, size) {
  return sharp({ create: { width: 2 * size, height: size, channels: 4, background: '#000' } })
    .composite([
      { input: await sharp(cell).flop().png().toBuffer(), left: 0, top: 0 },
      { input: cell, left: size, top: 0 },
    ])
    .png()
    .toBuffer();
}

const source = glbImage(GLB, 'NEWT_Face');
const sheet = sharp(source).ensureAlpha();
const { data, info } = await sheet.clone().raw().toBuffer({ resolveWithObject: true });
const c = colours(data, info.width);
const half = info.width / 2;
console.log(
  `colours: ${Object.entries(c)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}`,
);
/** @type {Record<string, Buffer>} */
const cells = {};
for (const name of Object.keys(CELLS)) cells[name] = await render(EXTRA[name], c, half);
await sharp({
  create: { width: 2 * half, height: 2 * half, channels: 4, background: { r: c.skin[0], g: c.skin[1], b: c.skin[2] } },
})
  .composite(Object.entries(CELLS).map(([name, [cx, cy]]) => ({ input: cells[name], left: cx * half, top: cy * half })))
  .removeAlpha()
  .png({ compressionLevel: 9, palette: true, colours: 256, dither: 0 })
  .toFile(OUT);
console.log(`✓ ${OUT}: ${2 * half}×${2 * half}, ${Object.keys(CELLS).join(' ')}`);

if (PREVIEW) {
  // All eight faces whole, the glb's four then these four, at half size, on grey.
  const S = half / 2;
  const tiles = [];
  let x = 0;
  for (const [name, [cx, cy]] of Object.entries({ ...BASE_CELLS, ...CELLS })) {
    const cell =
      name in CELLS
        ? cells[name]
        : await sheet
            .clone()
            .extract({ left: cx * half, top: cy * half, width: half, height: half })
            .png()
            .toBuffer();
    const small = await sharp(cell).resize(S, S).png().toBuffer();
    tiles.push({ input: await whole(small, S), left: x, top: 0 });
    x += 2 * S + 8;
  }
  await sharp({ create: { width: x, height: S, channels: 4, background: '#777' } })
    .composite(tiles)
    .png()
    .toFile(PREVIEW);
  console.log(`✓ ${PREVIEW}`);
}

if (CALIBRATE) {
  // The glb's neutral cell, this tool's NEUTRAL, and where they differ (white: a difference).
  const real = await sheet.clone().extract({ left: 0, top: 0, width: half, height: half }).png().toBuffer();
  const mine = await render(NEUTRAL, c, half);
  const a = await sharp(real).raw().toBuffer();
  const b = await sharp(mine).raw().toBuffer();
  const diff = Buffer.alloc(a.length);
  let off = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    const v = Math.min(255, d * 2);
    if (d > 60) off++;
    diff.set([v, v, v, 255], i);
  }
  const d = await sharp(diff, { raw: { width: half, height: half, channels: 4 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: 3 * half, height: half, channels: 4, background: '#000' } })
    .composite([
      { input: real, left: 0, top: 0 },
      { input: mine, left: half, top: 0 },
      { input: d, left: 2 * half, top: 0 },
    ])
    .png()
    .toFile(CALIBRATE);
  console.log(`✓ ${CALIBRATE}: ${off} pixels differ clearly (${((100 * off) / (half * half)).toFixed(2)}%)`);
}
