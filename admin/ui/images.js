// Image uploads, converted in the browser to the site's convention (the same as
// tools/import-screenshots.mjs): a full-size WebP up to 1600 px wide and a 720 px
// card, with small captures (≤ 800 px, usually pixel-art games) doubled using
// nearest-neighbor so they stay crisp. "Pixel art" forces nearest-neighbor at any size.

const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

async function encode(bitmap, width, crisp, quality) {
  const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = !crisp;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp')
    throw new Error('This browser can’t save WebP images. Try Chrome, Edge or Firefox.');
  return blob;
}

/** A File → { full, card } as base64 WebP, plus a preview URL for the card. */
export async function processImage(file, { pixel = false } = {}) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn’t an image.`);
  const bitmap = await createImageBitmap(file);
  try {
    const small = bitmap.width <= 800;
    const fullWidth = Math.min(1600, small ? bitmap.width * 2 : bitmap.width);
    const full = await encode(bitmap, fullWidth, pixel || small, 0.82);
    const card = await encode(bitmap, Math.min(720, fullWidth), pixel || small, 0.78);
    return {
      full: toBase64(await full.arrayBuffer()),
      card: toBase64(await card.arrayBuffer()),
      preview: URL.createObjectURL(card),
      size: `${fullWidth} × ${Math.round((bitmap.height * fullWidth) / bitmap.width)}`,
      bytes: full.size + card.size,
    };
  } finally {
    bitmap.close();
  }
}

/** A name for a new image in `folder` from its file name, not clashing with `taken` srcs. */
export function newImageSrc(folder, fileName, taken) {
  const stem =
    fileName
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image';
  let src = `assets/projects/${folder}/${stem}`;
  for (let n = 2; taken.has(src); n++) src = `assets/projects/${folder}/${stem}-${n}`;
  return src;
}
