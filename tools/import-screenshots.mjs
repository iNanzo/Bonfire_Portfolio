// Copies curated project captures from the old portfolio + screenshot gallery
// into public/assets/projects as optimized WebP (full size + card size).
// Source files are only read, never modified.
//
//   npm run screenshots
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OLD = 'C:/Users/newto/Documents/ChatGPT/Portfolio';
const OUT = path.resolve('public/assets/projects');
const manifest = JSON.parse(fs.readFileSync(`${OLD}/screenshot-gallery/manifest.json`, 'utf8'));
const fromGallery = (id) => manifest.find((m) => m.id === id).path;
const fromOld = (p) => `${OLD}/site/public/assets/${p}`;

// [output name, source path]
const shots = [
  ['gamex/scene', fromGallery(44)],
  ['gamex/effects', fromGallery(35)],
  ['gamex/sprites', fromGallery(41)],
  ['gamex/puzzle', fromGallery(42)],

  ['reliquary/gamex-gameplay', fromGallery(27)],
  ['reliquary/gamex-title', fromGallery(28)],
  ['reliquary/godot-boss', fromGallery(454)],
  ['reliquary/godot-relics', fromGallery(456)],
  ['reliquary/godot-title', fromGallery(457)],

  ['spirits/formation', fromGallery(4)],
  ['spirits/battle', fromGallery(3)],
  ['spirits/shop', fromGallery(1)],

  ['pixel3d/forest', fromGallery(388)],
  ['pixel3d/kingdom', fromGallery(61)],
  ['pixel3d/classroom', fromGallery(369)],
  ['pixel3d/editor', fromGallery(386)],

  ['sandwich/menu', fromGallery(55)],
  ['sandwich/finish', fromGallery(46)],
  ['sandwich/inspect', fromGallery(45)],
  ['sandwich/shop', fromGallery(51)],

  ['extracted/cover', fromOld('extracted-coffee.webp')],
  ['nba/cover', fromOld('nba-sports-facts.webp')],
  ['flare/cover', fromOld('flare.jpg')],
  ['study/cover', fromOld('the-study.png')],
];

for (const [name, src] of shots) {
  const dir = path.join(OUT, path.dirname(name));
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(OUT, name);
  // Small captures (640×360 pixel-art games) are upscaled with nearest-neighbor
  // so they stay crisp instead of blurry.
  const meta = await sharp(src).metadata();
  const kernel = meta.width <= 800 ? 'nearest' : 'lanczos3';
  const full = Math.min(1600, meta.width <= 800 ? meta.width * 2 : meta.width);
  await sharp(src).resize({ width: full, kernel }).webp({ quality: 82 }).toFile(`${base}.webp`);
  await sharp(src).resize({ width: 720, kernel }).webp({ quality: 78 }).toFile(`${base}-card.webp`);
  console.log('✓', name, `${meta.width}×${meta.height}`);
}

// Playable Reliquary of Ash snapshot (self-contained HTML build).
fs.mkdirSync('public/games', { recursive: true });
fs.copyFileSync(`${OLD}/site/public/games/reliquary.html`, 'public/games/reliquary.html');
console.log('✓ games/reliquary.html');
