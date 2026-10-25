// NEWT's pixel faces at many sizes (pure: no three.js, no DOM): the ladder of cell sizes
// public/models/newt-face.png holds (tools/newt-face.mjs draws one 2×2 sheet a size, clips.js
// FACES' layout, the sheets side by side), how they're packed (and which of them an image of a
// given size holds: an older copy cached from before the ladder grew), which one fits his half
// face on screen, and how wide one cell of the face is on his head.
//
// Why many: with nearest sampling a feature only keeps its shape when one pixel of the sheet
// covers about one texel. His half face is about 3 texels across at 16×16, 7 to 10 at 48×48,
// 20 at 96×96, 30 at 128×128 on a phone, about 62 at Native on one, and more zoomed in; one
// fixed sheet sampled at 0.8 or 1.3 pixels a texel turns a 2-pixel eye into 1 or 3 texels as his
// head moves a fraction of a texel, frame to frame (the eyes flicker between shapes).
// character.js measures his half face in texels each frame and shows the sheet whose cell
// matches it, holding on to the one showing until another fits clearly better (pickFaceSize), so
// his breathing never flips it. Past the largest sheet (zoomed in at Native or the finest sprite
// resolutions, his half face over about 78 texels) a pixel sheet would be stretched, nearest,
// into blocks: there the face is the smooth 1024 sheet, as at Off
// ('smooth'); under the smallest (16×16: his half face about 2 texels) it's the smallest sheet.
// The dialogue's four faces have sheets of their own laid out the same way (newt-face-extra.png
// and the smooth newt-face-smooth-extra.png), shown at the same size; FACE_FALLBACK stands in
// for one until its sheet comes.

/**
 * The face each of the dialogue's four (clips.js EXTRA_FACES) shows until its sheet has come, or
 * where its sheet hasn't the size showing (an older copy cached): the nearest of the first four.
 * @type {Record<'sad'|'angry'|'shy'|'smug', import('./clips.js').FaceName>}
 */
export const FACE_FALLBACK = { sad: 'neutral', angry: 'neutral', shy: 'happy', smug: 'happy' };

/**
 * The cells' widths, pixels: a step of at most about 15% between neighbours, up to his half face
 * at Native on a phone (about 62 texels), so the phone's close-up has pixel eyes too.
 */
export const FACE_SIZES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 23, 26, 30, 34, 40, 46, 53, 62];
/**
 * A cell's height over its width: one cell is half his face across (the face mirrors it) and
 * all of it down, seen from the toy's camera about 36° up (his face's 1.0 by 2.1 on the head,
 * foreshortened).
 */
export const FACE_ASPECT = 1.75;
/** How much better (as a log of the size ratio) another size must fit before the sheet switches. */
export const FACE_HYSTERESIS = 0.06;
/**
 * The smooth sheet shows once his half face is this many times the largest sheet's cell (62 px:
 * past about 78 texels), until it's FACE_HYSTERESIS × 2 (log) under that again.
 */
export const SMOOTH_FACE_OVER = 1.25;
/**
 * The face sheet's eyes, in its UVs (the neutral cell's: u 0..0.5 from the middle of his face
 * to his ear, v down the image): the band where the face's width is measured.
 */
const EYE_BAND = { u: [0.088, 0.342], v: [0.25, 0.42] };

/**
 * @typedef {object} FaceSheet  one size's 2×2 sheet in newt-face.png
 * @property {number} w  a cell's width, pixels
 * @property {number} h  a cell's height
 * @property {number} x  the sheet's left in the image
 * @property {number} y  its top
 */

/** @type {FaceSheet[]} the sheets side by side, each 2w × 2h, top-aligned */
export const FACE_LAYOUT = (() => {
  let x = 0;
  return FACE_SIZES.map((w) => {
    const sheet = { w, h: Math.round(w * FACE_ASPECT), x, y: 0 };
    x += 2 * w;
    return sheet;
  });
})();
/** newt-face.png's size, pixels. */
export const FACE_IMAGE = {
  w: FACE_LAYOUT.reduce((s, f) => s + 2 * f.w, 0),
  h: Math.max(...FACE_LAYOUT.map((f) => 2 * f.h)),
};

/**
 * The sheets an image `width` × `height` holds: the whole ladder for this one (FACE_IMAGE); for an
 * older one cached from when the ladder stopped sooner (sheets are only ever added at its end,
 * so its sheets sit where FACE_LAYOUT has them), the sheets it's exactly as wide and tall as; for
 * any other, one 2×2 sheet filling it (the first pixel face).
 * @param {number} width
 * @param {number} height
 * @returns {FaceSheet[]}
 */
export function layoutFor(width, height) {
  if (width === FACE_IMAGE.w && height === FACE_IMAGE.h) return FACE_LAYOUT;
  for (let n = FACE_LAYOUT.length - 1; n > 0; n--) {
    const last = FACE_LAYOUT[n - 1];
    const tall = Math.max(...FACE_LAYOUT.slice(0, n).map((s) => 2 * s.h));
    if (last.x + 2 * last.w === width && tall === height) return FACE_LAYOUT.slice(0, n);
  }
  return [{ w: Math.floor(width / 2), h: Math.floor(height / 2), x: 0, y: 0 }];
}

/**
 * The size of sheet to show for a half face `texels` across: the nearest (by ratio), unless
 * `current` fits within FACE_HYSTERESIS of it; 'smooth' (the 1024 sheet) past SMOOTH_FACE_OVER
 * times the largest, held until it's clearly under that again.
 * @param {number} texels
 * @param {number|'smooth'|null} current  the size showing, or null
 * @param {number[]} [sizes]
 * @param {number} [margin]
 * @returns {number|'smooth'}
 */
export function pickFaceSize(texels, current, sizes = FACE_SIZES, margin = FACE_HYSTERESIS) {
  if (!(texels > 0)) return current ?? sizes[0];
  const smoothAt = Math.max(...sizes) * SMOOTH_FACE_OVER;
  if (texels > smoothAt || (current === 'smooth' && Math.log(smoothAt / texels) < 2 * margin)) return 'smooth';
  const err = (s) => Math.abs(Math.log(texels / s));
  let best = sizes[0];
  for (const s of sizes) if (err(s) < err(best)) best = s;
  if (typeof current === 'number' && sizes.includes(current) && err(current) <= err(best) + margin) return current;
  return best;
}

/**
 * How wide one cell of the face is across his face at the eyes, in the geometry's units: the
 * face's triangles in EYE_BAND, each one's ∂x/∂u (its sideways extent per unit of u; the face
 * mirrors about x = 0, so its sign is dropped) averaged by UV area, times the cell's 0.5 of u.
 * @param {ArrayLike<number>} position  x, y, z per vertex
 * @param {ArrayLike<number>} uv  u, v per vertex
 * @param {ArrayLike<number>} index  three vertices a triangle
 */
export function faceSpan(position, uv, index) {
  let sum = 0;
  let area = 0;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    const cu = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3;
    const cv = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
    if (cu < EYE_BAND.u[0] || cu > EYE_BAND.u[1] || cv < EYE_BAND.v[0] || cv > EYE_BAND.v[1]) continue;
    const du1 = uv[b * 2] - uv[a * 2];
    const dv1 = uv[b * 2 + 1] - uv[a * 2 + 1];
    const du2 = uv[c * 2] - uv[a * 2];
    const dv2 = uv[c * 2 + 1] - uv[a * 2 + 1];
    const det = du1 * dv2 - dv1 * du2;
    if (Math.abs(det) < 1e-12) continue;
    const dx1 = position[b * 3] - position[a * 3];
    const dx2 = position[c * 3] - position[a * 3];
    const dxdu = (dx1 * dv2 - dx2 * dv1) / det;
    sum += Math.abs(dxdu) * Math.abs(det);
    area += Math.abs(det);
  }
  return area > 0 ? (sum / area) * 0.5 : 0;
}
