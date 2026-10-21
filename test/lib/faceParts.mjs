// Measuring NEWT's faces in the tests (test/invitationFace*.test.mjs): a face sheet's pixels by
// kind (ink, the iris's greys, the white, the mouth, the blush, skin), its parts (the brow, the
// eye, the mouth, the blush) as their pixels and boxes, the finer kinds an open eye's anatomy
// needs, and the glb's own smooth sheet.
import fs from 'node:fs';
import sharp from 'sharp';

export const luma = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** The 4-connected components of a w × h cell's pixels where `on(x, y)`, each with its box and pixels. */
export function components(w, h, on) {
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
export const pixels = (w, h, on) =>
  Array.from({ length: w * h }, (_, i) => [i % w, Math.floor(i / w)]).filter(([x, y]) => on(x, y));

/** What a pixel of a face is, by its colour: ink (lids, brows, pupils), the iris's greys, the white, the mouth, the blush, or skin. */
export function kindOf([r, g, b]) {
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
export function box(points) {
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
export function partsOf(w, h, kind, speck = 0) {
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

/**
 * The glb's smooth face sheet (NEWT_Face), RGBA.
 * @param {string} glb  the .glb's path
 */
export async function smoothSheet(glb) {
  const buf = fs.readFileSync(glb);
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

/** A pixel cell's kinds, and its parts. */
export function cellParts({ px, w, h }) {
  const kinds = px.map(kindOf);
  const kind = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? kinds[y * w + x] : 'skin');
  return { kind, ...partsOf(w, h, kind) };
}

/**
 * A pixel cell's finer kinds: the iris's mid grey and its darker band apart, the brown lash line
 * (and any mid brown), as the shapes below need them told apart.
 * @param {{px: number[][], w: number, h: number}} cell
 */
export function finer(cell) {
  const { px, w, h } = cell;
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? px[y * w + x] : null);
  /** @returns {'ink'|'grey'|'band'|'white'|'brown'|'mouth'|'blush'|'skin'} */
  const kind = (x, y) => {
    const c = at(x, y);
    if (!c) return 'skin';
    const k = kindOf(c);
    const l = luma(c[0], c[1], c[2]);
    if (k === 'iris') return l < 0.32 ? 'band' : 'grey';
    if (k === 'skin' && l >= 0.38 && l < 0.62 && c[0] - c[2] > 25) return 'brown';
    return k;
  };
  /** The [x, y] of the cell's pixels of a kind, in rows y0..y1. */
  const all = (k, y0 = 0, y1 = h - 1) => pixels(w, h, (x, y) => y >= y0 && y <= y1 && kind(x, y) === k);
  return { kind, all, at };
}

/** The [x, y] points by row: row → sorted xs. */
export function byRow(points) {
  /** @type {Map<number, number[]>} */
  const rows = new Map();
  for (const [x, y] of points)
    rows.set(
      y,
      [...(rows.get(y) ?? []), x].sort((a, b) => a - b),
    );
  return rows;
}
