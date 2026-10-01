// The Bonfire Painter project's screenshots (content.json's `bonfire-painter` item), taken
// from the real Painter and Bonfire Live on a running dev server (the Painter is driven
// through its dev hook, window.__painter, so it has to be `npm run dev`, not a build):
//
//   npm run dev                                   (in one terminal)
//   node tools/capture-painter.mjs [--base http://localhost:5173/] [--only editor,live]
//   node tools/capture-painter.mjs --write editor=<candidate.png> [scene=<png> …]
//
//   editor   the Painter over a scene: Frozen Shrine (a built-in) on the Beat preview, its
//            Knights section open (style, finish, edge glow, seat pose…)
//   scene    a finished built-in scene, full-bleed: Cathedral Kaleidoscope's rose window,
//            the stage's own picture (fire.capture) with the panel hidden
//   library  the library drawer with thumbnails: Bonfire Live plays the demo track and N
//            brings each built-in scene (it keeps a thumbnail of each the first time it
//            plays live); two scenes are painted here by clicking chips and saved (Save
//            takes their thumbnails); then L, a built-in card hovered (its glow)
//   live     Bonfire Live playing Forge Rave on its own (?scene=b:forge-rave&solo) on the
//            demo track, the HUD awake with its Scene line naming it
//
// Each is a burst of candidates, kept with a contact sheet in --raw (default
// .scratch/painter-shots/); the default one (PICK) is written at once. Look at the sheets:
// if another moment reads better, write it with --write, without capturing again.
//
// Pixel-exact: GPU Chrome at 1600×1000 CSS px and a 0.9 device scale, so each picture is
// 1440×900 of a 1600-wide desktop, and the stage's texels (pixel size 4: 4 CSS px × 0.9,
// rounded by the renderer to 4 device px) are exact 4×4 squares. Written under
// public/assets/projects/bonfire-painter/ as <name>.webp (1440×900 as captured, q82) and
// <name>-card.webp (720×450, q78: every 2×2 block averaged, so each texel is still one
// hard-edged 2 px square and the UI's text stays smooth).
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = opt('base', 'http://localhost:5173/').replace(/\/?$/, '/');
const RAW = opt('raw', '.scratch/painter-shots');
const OUT = 'public/assets/projects/bonfire-painter';
const NAMES = ['editor', 'scene', 'library', 'live'];
const ONLY = (opt('only', NAMES.join(',')) ?? '').split(',').filter((n) => NAMES.includes(n));
/** Which candidate is written by default (a settled moment of each burst). */
const PICK = { editor: 2, scene: 0, library: 1, live: 2 };

/** A 1440×900 PNG → <name>.webp (as is) and <name>-card.webp (2×2 blocks averaged). */
async function write(name, png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w !== 1440 || h !== 900) throw new Error(`${name}: ${w}×${h}, not 1440×900`);
  const half = Buffer.alloc((w / 2) * (h / 2) * 3);
  for (let y = 0; y < h / 2; y++) {
    for (let x = 0; x < w / 2; x++) {
      for (let c = 0; c < 3; c++) {
        const at = (yy, xx) => data[(yy * w + xx) * 3 + c];
        half[(y * (w / 2) + x) * 3 + c] = Math.round((at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1)) / 4);
      }
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  await sharp(data, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 82 }).toFile(`${OUT}/${name}.webp`);
  await sharp(half, { raw: { width: w / 2, height: h / 2, channels: 3 } }).webp({ quality: 78 }).toFile(`${OUT}/${name}-card.webp`);
  console.log(`✓ ${OUT}/${name}.webp, ${name}-card.webp`);
}

/** How many 4×4 blocks of a region aren't one color (0: the stage's texels there are exact). */
async function mixedBlocks(png, { x0 = 0, y0 = 0, x1 = 1440, y1 = 900 } = {}) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  let mixed = 0;
  for (let by = y0; by + 4 <= y1; by += 4) {
    for (let bx = x0; bx + 4 <= x1; bx += 4) {
      const o = (by * w + bx) * 3;
      let same = true;
      for (let p = 0; p < 16 && same; p++) {
        const q = ((by + (p >> 2)) * w + bx + (p & 3)) * 3;
        same = data[q] === data[o] && data[q + 1] === data[o + 1] && data[q + 2] === data[o + 2];
      }
      if (!same) mixed++;
    }
  }
  return mixed;
}

/** A contact sheet of a burst (numbered), to pick from. */
async function contactSheet(name, pngs) {
  const W = 480, H = 300, cols = 3;
  const tiles = await Promise.all(pngs.map(async (b, i) => ({
    input: await sharp(b).resize(W, H).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="34" height="26" fill="#000" opacity="0.7"/><text x="8" y="19" font-family="Verdana" font-size="16" fill="#fff">${i}</text></svg>`) }]).png().toBuffer(),
    left: (i % cols) * (W + 4),
    top: Math.floor(i / cols) * (H + 4),
  })));
  const file = path.join(RAW, `${name}-sheet.png`);
  await sharp({ create: { width: cols * (W + 4), height: Math.ceil(pngs.length / cols) * (H + 4), channels: 3, background: '#111' } }).composite(tiles).png().toFile(file);
  return file;
}

/** `n` page screenshots `ms` apart (`each` runs before every one). */
async function burst(page, n, ms, each = async () => {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    await each(i);
    const t0 = Date.now();
    out.push(await page.screenshot());
    const left = ms - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
  }
  return out;
}

// --- Writing chosen candidates only ----------------------------------------------------------
if (argv.includes('--write')) {
  for (const pair of argv.slice(argv.indexOf('--write') + 1)) {
    const [name, file] = pair.split('=');
    if (!NAMES.includes(name) || !file) throw new Error(`--write name=file.png (name: ${NAMES.join(', ')})`);
    await write(name, fs.readFileSync(file));
  }
  process.exit(0);
}

// --- Capturing ---------------------------------------------------------------------------------
fs.mkdirSync(RAW, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function newPage(context) {
  const ctx = context ?? await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 0.9 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`); });
  return { page, context: ctx };
}
async function openPainter(page, query = '') {
  await page.goto(`${BASE}painter/${query}`);
  await page.waitForFunction(() => window.__painter && document.querySelector('[data-stage]')?.classList.contains('is-ready'), null, { timeout: 90_000 });
  await page.waitForTimeout(800);
}
/** Open one section of the Painter's panel, fold the rest. */
async function section(page, id) {
  await page.evaluate((id) => {
    for (const b of document.querySelectorAll('[data-sec-toggle]')) {
      if ((b.getAttribute('aria-expanded') === 'true') !== (b.dataset.secToggle === id)) b.click();
    }
    document.querySelector('[data-panel]').scrollTop = 0;
  }, id);
  await page.waitForTimeout(250);
}
async function liveDemo(page, query = '') {
  await page.goto(`${BASE}visualizer/${query}`);
  await page.waitForSelector('[data-stage].is-ready', { timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.click('[data-source="demo"]');
  await page.waitForSelector('[data-hud]', { state: 'visible', timeout: 20_000 });
}
/** Keep the candidates and the sheet, write the default pick. */
async function keep(name, pngs, check) {
  pngs.forEach((b, i) => fs.writeFileSync(path.join(RAW, `${name}-${i}.png`), b));
  const sheet = await contactSheet(name, pngs);
  const pick = Math.min(PICK[name], pngs.length - 1);
  console.log(`${name}: ${pngs.length} candidates (${sheet}); writing ${name}-${pick}.png; 4×4 blocks not one color in the stage: ${await mixedBlocks(pngs[pick], check)}`);
  await write(name, pngs[pick]);
}

if (ONLY.includes('editor')) {
  const { page, context } = await newPage();
  await openPainter(page, '?scene=b:frozen-shrine');
  await page.evaluate(() => window.__painter.setPreview('beat'));
  await section(page, 'knights');
  await page.waitForTimeout(2500);
  // (The stage left of the panel, below the bar, clear of the pack's button.)
  await keep('editor', await burst(page, 6, 800), { y0: 60, x1: 1000 });
  await context.close();
}

if (ONLY.includes('scene')) {
  const { page, context } = await newPage();
  await openPainter(page, '?scene=b:cathedral-kaleidoscope');
  await page.keyboard.press('h');
  await page.evaluate(() => window.__painter.setPreview('still'));
  await page.waitForTimeout(2500);
  const grab = async () => Buffer.from(await page.evaluate(async () => {
    const buf = new Uint8Array(await (await window.__painter.fire.capture()).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }), 'base64');
  const shots = [];
  for (let i = 0; i < 3; i++) { shots.push(await grab()); await page.waitForTimeout(700); }
  await page.evaluate(() => window.__painter.setPreview('beat'));
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(700); shots.push(await grab()); }
  await keep('scene', shots, {});
  await context.close();
}

if (ONLY.includes('library') || ONLY.includes('live')) {
  const { page, context } = await newPage();
  if (ONLY.includes('live')) {
    await liveDemo(page, '?scene=b:forge-rave&solo');
    await page.waitForTimeout(3000);
    // (A pointer move keeps the HUD awake; it's out of the picture, over the HUD's corner.)
    const shots = await burst(page, 8, 1000, (i) => page.mouse.move(40 + (i % 2) * 6, 980));
    console.log('live: the HUD says', JSON.stringify(await page.textContent('[data-scene-line]')));
    // (The stage above the HUD, clear of the pack's button.)
    await keep('live', shots, { y1: 760, x1: 1340 });
  }
  if (ONLY.includes('library')) {
    // Bonfire Live's thumbnails of the built-ins: each brought live once (N), until it has
    // one of every built-in.
    await liveDemo(page);
    await page.waitForTimeout(2000);
    const builtIns = JSON.parse(fs.readFileSync('src/content.json', 'utf8')).scenes?.length ?? 0;
    const thumbs = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('bonfire-scene-thumbs') ?? '{}')).filter((r) => r.startsWith('b:')).length);
    for (let i = 0; i < 2 * builtIns && (await thumbs()) < builtIns; i++) { await page.keyboard.press('n'); await page.waitForTimeout(4500); }
    console.log(`library: Bonfire Live kept ${await thumbs()} of ${builtIns} built-in thumbnails`);
    // Two scenes of mine, painted by hand and saved.
    await openPainter(page);
    const chip = (sec, text) => page.locator(`[data-sec="${sec}"] [data-pick]`, { hasText: text }).first().click();
    const paint = async ({ name, scenery, flame, look }) => {
      await section(page, 'place'); await chip('place', scenery);
      await section(page, 'colors'); await chip('colors', flame);
      await section(page, 'look'); await chip('look', look);
      await page.fill('[data-name]', name);
      await page.press('[data-name]', 'Enter');
      await page.waitForTimeout(3500);
      await page.click('[data-cmd="save"]');
      await page.waitForTimeout(800);
    };
    await paint({ name: 'Blood Rite', scenery: 'Cult Altar', flame: 'Blood Flame', look: 'Ink' });
    await page.click('[data-cmd="library"]');
    await page.click('[data-lib="new"]');
    await page.waitForTimeout(1500);
    await paint({ name: 'Gilded Vigil', scenery: 'Gothic Ruins', flame: 'Gilded Flame', look: 'Echo' });
    // (Behind the drawer: the scene just saved, still, the panel hidden.)
    await page.evaluate(() => window.__painter.setPreview('still'));
    await page.keyboard.press('h');
    await page.keyboard.press('l');
    await page.waitForTimeout(1500);
    const card = page.locator('[data-card="b:frozen-shrine"] .pnt-card-open');
    const shots = await burst(page, 4, 700, async (i) => { if (i === 1) { await card.hover(); await page.waitForTimeout(500); } });
    // (The stage right of the drawer and its shadow, clear of the pack's button.)
    await keep('library', shots, { x0: 660, y0: 60, x1: 1340 });
  }
  await context.close();
}

await browser.close();
if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exitCode = 1; }
