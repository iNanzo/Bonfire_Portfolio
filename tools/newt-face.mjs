// NEWT's pixel faces for the invitation toy (public/models/newt-face.png): one 2×2 sheet of his
// four faces (neutral, blink, happy, surprised: clips.js FACES' layout) for every cell size in
// src/invitation/faceSheets.js's ladder, side by side as its FACE_LAYOUT packs them, each drawn
// for its size so every feature is whole pixels: solid upright eyes with a dark core and no
// highlight (a white texel in a 3-texel eye reads as noise), a 1 px brow line over each once
// there's room for a pixel of skin between, and a mouth in every face, under the eyes and apart
// from them (without one his face reads as two eye blocks). character.js shows the sheet whose
// cell matches his half face in texels (nearest, no mipmaps) while the pixel filter is on; the
// 1024 sheet inside public/models/newt.glb averages down to a blank face at those sizes. The
// skin is each of that sheet's cells' commonest colour, the ink its darkest; where the eyes and
// the mouth sit in a cell follows that sheet, the eyes a little narrower (two almond eyes a
// cell wide meet in the middle and read as sunglasses at a few texels). Re-runnable:
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
/** A closed mouth's line (lighter: a dark line a pixel tall reads as a hole), an open one, the blush. */
const MOUTH = { line: [128, 68, 58], open: [86, 46, 40] };
const BLUSH = [240, 160, 150];
/**
 * Where the features sit in a cell, as shares of its width (x, from the middle of his face) and
 * height (y, down), from the 1024 sheet's neutral face: the eye's centre and size, the mouth's
 * half width and its margin under it.
 */
const LAYOUT = { eyeX: 0.375, eyeY: 0.75, eyeW: 0.25, eyeH: 0.2, mouthW: 0.125, mouthBottom: 1 / 14 };

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
 * Each face's skin (its cell's commonest colour, in 4-bit bins, averaged) and the sheet's ink
 * (its darkest pixel).
 * @param {Buffer} px  the 1024 sheet, RGBA
 * @param {number} W  its width
 */
function colours(px, W) {
  const half = W / 2;
  /** @type {Record<string, number[]>} */
  const skin = {};
  let ink = [24, 20, 24];
  let inkL = 1;
  for (const [name, [cx, cy]] of Object.entries(CELLS)) {
    const bins = new Map();
    for (let y = cy * half; y < (cy + 1) * half; y += 2)
      for (let x = cx * half; x < (cx + 1) * half; x += 2) {
        const i = (y * W + x) * 4;
        const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
        const b = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        b.n++;
        b.r += px[i];
        b.g += px[i + 1];
        b.b += px[i + 2];
        bins.set(key, b);
        const l = luma(px[i], px[i + 1], px[i + 2]);
        if (l < inkL) {
          inkL = l;
          ink = [px[i], px[i + 1], px[i + 2]];
        }
      }
    const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
    skin[name] = [top.r / top.n, top.g / top.n, top.b / top.n].map(Math.round);
  }
  return { skin, ink };
}

/**
 * Where a w × h cell's features go (its left edge is the middle of his face): the eye's box,
 * the brow's row (null without room for a pixel of skin under it), the mouth's half width and
 * the closed mouth's rows. The eye clears the mouth's columns and ends a row above the mouth.
 */
function placement(w, h) {
  const ew = Math.max(2, Math.round(w * LAYOUT.eyeW));
  const eh = Math.max(h >= 11 ? 3 : 2, Math.round(h * LAYOUT.eyeH));
  const mw = Math.max(1, Math.round(w * LAYOUT.mouthW));
  const mouthBottom = h - 1 - Math.round(h * LAYOUT.mouthBottom);
  const mouthTop = mouthBottom - Math.max(1, Math.round(h / 28)) + 1;
  // (A row of skin between the eye and the mouth: touching, the two read as one U.)
  const left = Math.max(mw, Math.round(w * LAYOUT.eyeX - ew / 2));
  const top = Math.max(0, Math.min(Math.round(h * LAYOUT.eyeY - eh / 2), mouthTop - 1 - eh));
  const brow = w >= 6 && top - 2 >= 0 ? top - 2 : null;
  return { eye: { left, top, w: ew, h: eh }, brow, mw, mouthTop, mouthBottom };
}

/**
 * One face in a w × h cell, RGBA.
 * @param {string} name  a key of CELLS
 * @param {number} w
 * @param {number} h
 * @param {{skin: Record<string, number[]>, ink: number[]}} c
 */
function face(name, w, h, c) {
  const cell = new Uint8Array(w * h * 4);
  for (let i = 0; i < cell.length; i += 4) cell.set([...c.skin[name], 255], i);
  const put = (x, y, col) => {
    if (x >= 0 && y >= 0 && x < w && y < h) cell.set([...col, 255], (y * w + x) * 4);
  };
  const p = placement(w, h);
  const { eye } = p;
  /**
   * An upright oval in the box (left, top, ew × eh): the pixels whose centres fall inside it, or
   * the whole box while it's under 4 px either way (cut corners there read as a plus).
   */
  const oval = (left, top, ew, eh) => {
    const cx = left + ew / 2;
    const cy = top + eh / 2;
    const round = Math.min(ew, eh) >= 4;
    for (let y = top; y < top + eh; y++)
      for (let x = left; x < left + ew; x++) {
        const dx = (x + 0.5 - cx) / (ew / 2);
        const dy = (y + 0.5 - cy) / (eh / 2);
        if (!round || dx * dx + dy * dy <= 1.0001) put(x, y, c.ink);
      }
  };
  /** The brow on `row`: as long as the eye (one longer toward his ear once there's room), 2 px at least. */
  const browLine = (row) => {
    if (row === null || row < 0) return;
    const len = Math.max(2, eye.w + (w >= 10 ? 1 : 0));
    for (let x = eye.left; x < eye.left + len; x++) put(x, row, c.ink);
  };
  const mouth = (top, bottom, half, col) => {
    for (let y = top; y <= bottom; y++) for (let x = 0; x < half; x++) put(x, y, col);
  };
  if (name === 'neutral') {
    oval(eye.left, eye.top, eye.w, eye.h);
    browLine(p.brow);
    mouth(p.mouthTop, p.mouthBottom, p.mw, MOUTH.line);
  } else if (name === 'blink') {
    // A lid: a line across the middle of the eye, one wider toward his ear, its end turned down
    // (unless the eye is only 2 px tall, where the turn would hold as much ink as the open eye).
    const row = eye.top + Math.floor(eye.h / 2);
    const t = Math.max(1, Math.round(eye.h / 6));
    for (let y = row; y < row + t; y++) for (let x = eye.left; x <= eye.left + eye.w; x++) put(x, y, c.ink);
    if (eye.h >= 3) for (let y = row + t; y < row + 2 * t; y++) put(eye.left + eye.w, y, c.ink);
    browLine(p.brow);
    mouth(p.mouthTop, p.mouthBottom, p.mw, MOUTH.line);
  } else if (name === 'happy') {
    // A ^: an n a pixel wider each side than the eye, from its top to two thirds down, its top
    // corners rounded off once it's 6 px wide (and a bar over the eye's top at 2 px, where an n
    // would fill the open eye's square).
    const left = Math.max(p.mw, eye.left - 1);
    const right = Math.min(w, eye.left + eye.w + 1) - 1;
    const aw = right - left + 1;
    const ah = Math.max(2, Math.ceil(eye.h * 0.67));
    const t = Math.max(1, Math.round(aw / 6));
    const round = aw >= 6 ? 1 : 0;
    for (let y = eye.top; y < eye.top + ah; y++)
      for (let x = left; x <= right; x++) {
        const bar = y < eye.top + t && x >= left + round && x <= right - round;
        const leg = aw >= 3 && y >= eye.top + round && (x < left + t || x > right - t);
        if (bar || leg) put(x, y, c.ink);
      }
    browLine(p.brow);
    if (w >= 8) for (let x = eye.left; x < eye.left + Math.max(2, eye.w); x++) put(x, eye.top + eye.h, BLUSH);
    // (A smile a pixel taller, where it stays clear of the ^ beside it.)
    const smile = Math.max(eye.top + 1, p.mouthTop - 1);
    mouth(left > p.mw || eye.top + ah <= smile ? smile : p.mouthTop, p.mouthBottom, p.mw, MOUTH.line);
  } else {
    // Surprised: the eye a pixel bigger up and out, the brow raised with it, the mouth open.
    const mouthTop = Math.max(eye.top + 1, p.mouthBottom - Math.max(1, Math.round(h / 14)));
    oval(eye.left, eye.top - 1, Math.min(eye.w + 1, w - eye.left), Math.min(eye.h + 1, mouthTop - eye.top + 1));
    browLine(p.brow !== null && p.brow >= 1 ? p.brow - 1 : null);
    mouth(mouthTop, p.mouthBottom, p.mw, MOUTH.open);
  }
  return cell;
}

const source = glbImage(GLB, 'NEWT_Face');
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const c = colours(data, info.width);
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
