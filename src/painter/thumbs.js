// Scene thumbnails for the library's cards (and Bonfire Live's Scenes tab): the stage as it
// is now, 192×108, a small WebP data URL (sceneStore.js keeps them up to THUMB_MAX long).
//
// The panel covers part of the stage, and the fire is framed in the middle of the rest
// (painter/main.js visibleArea). So the picture is taken as the stage shows it a couple of
// frames on (fire.capture: the frame at the screen's size; an edit just made is on it by
// then), with nothing moved for it, and cropped to 16:9 round the middle of that visible
// part, then scaled down.
import { THUMB_MAX } from '../sceneStore.js';

export const THUMB_W = 192;
export const THUMB_H = 108;

/** Resolves after `n` frames (an edit made just before is on the stage by then). */
const frames = (n) =>
  new Promise((resolve) => {
    const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

/**
 * The part of a frame the thumbnail is cut from: the largest 16:9 box centered in the
 * visible area (it fills the thumbnail; what's past its sides or top and bottom is cut).
 * @param {number} width  the frame's size (px)
 * @param {number} height
 * @param {{ x: number, y: number, w: number, h: number }} [area]  the visible part, as fractions of the frame
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function thumbCrop(width, height, area = { x: 0, y: 0, w: 1, h: 1 }) {
  const aw = Math.max(1, area.w * width);
  const ah = Math.max(1, area.h * height);
  const k = Math.max(THUMB_W / aw, THUMB_H / ah);
  const sw = THUMB_W / k;
  const sh = THUMB_H / k;
  return { sx: area.x * width + (aw - sw) / 2, sy: area.y * height + (ah - sh) / 2, sw, sh };
}

/**
 * A thumbnail of what the stage shows now.
 * @param {any} fire  the bonfire (scene.js): its capture()
 * @param {{ x: number, y: number, w: number, h: number }} [area]  the part of the stage the
 *   panel leaves showing, as fractions of it (default: all of it)
 * @returns {Promise<string | null>} a data URL, or null if the picture couldn't be taken
 */
export async function captureThumb(fire, area) {
  await frames(2);
  const blob = await fire.capture().catch(() => null);
  if (!blob) return null;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const g = canvas.getContext('2d');
  // Cover: the visible part's middle 16:9, smoothed down (a small painting of it).
  const { sx, sy, sw, sh } = thumbCrop(bmp.width, bmp.height, area);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
  bmp.close?.();
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/webp', q);
    if (url.startsWith('data:image/webp') && url.length <= THUMB_MAX) return url;
  }
  const jpeg = canvas.toDataURL('image/jpeg', 0.6); // (no WebP encoder: Safari)
  return jpeg.length <= THUMB_MAX ? jpeg : null;
}
