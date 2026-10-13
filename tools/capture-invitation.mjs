// Real-speed clips of the invitation toy (/invitation/) for reviews: GPU Chrome plays scripted
// acts through the page's ?test hooks (window.__invitation) and real input (taps, a touch drag
// through CDP Input.dispatchTouchEvent, a mouse drag, the toolbar's buttons), and Chrome's
// screencast hands over the page's own frames as it draws them (never paused frames). Each act
// at each size becomes an animated WebP that plays at the speed it ran, plus a labelled contact
// sheet a size. It starts its own Vite dev server from the folder it's run in (a worktree too)
// and stops it after, or uses one that's running (--url). Run it alone on the GPU (one capture
// at a time on the machine):
//
//   node tools/capture-invitation.mjs [--sizes 390x844@3,412x915@2.625,1280x800@1]
//        [--acts idle,clips,tap,drag,buttons,floor,chase,orbit] [--clips Wave,Spook] [--look ds|soft]
//        [--pixel off|2|3|4] [--fps 15] [--scale 1] [--port 5340] [--url <origin>]
//        [--out .scratch/invitation-shots] [--tag now]
//
//   idle      three seconds of him standing (Idle, or the placeholder's T-pose)
//   clips     every clip in turn (--clips for some), forced through play(): one WebP each
//   tap       a tap on his head (a touch on a phone size, a click on a desktop one)
//   drag      a press on his body dragged up and across the screen, then let go (a touch drag
//             on a phone size, a mouse drag on a desktop one)
//   buttons   Wave, Spook, Sit, Run and Wander pressed in turn
//   floor     a tap on the floor in front of him
//   chase     four quick taps on him (he runs off), then a touch or mouse drag catching him
//   orbit     a drag across empty space (the camera turns), then a pinch or the wheel zooming
//             in and out, then Reset Camera from the Look sheet
//
// Files: <out>/<tag>-<act>-<W>x<H>.webp and <out>/<tag>-sheet-<W>x<H>.png (six frames an act,
// each labelled with when it was drawn). --look and --pixel set the Look menu first (its
// stored settings, invitation.look.v1). --scale multiplies the CSS size of the output.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import { createServer } from 'vite';
import { CLIP_NAMES, CLIPS } from '../src/invitation/clips.js';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const SIZES = opt('sizes', '390x844@3,412x915@2.625,1280x800@1')
  .split(',')
  .map((s) => {
    const [wh, dpr = '1'] = s.split('@');
    const [w, h] = wh.split('x').map(Number);
    return { w, h, dpr: Number(dpr), phone: w < 768 };
  });
const ACTS = opt('acts', 'idle,clips,tap,drag,buttons,floor,chase,orbit').split(',');
const ONLY_CLIPS = opt('clips', null)?.split(',') ?? CLIP_NAMES;
const LOOK = opt('look', null);
const PIXEL = opt('pixel', null);
const FPS = Number(opt('fps', '15'));
const SCALE = Number(opt('scale', '1'));
const PORT = Number(opt('port', '5340'));
const OUT = opt('out', '.scratch/invitation-shots');
const TAG = opt('tag', `invitation${LOOK ? `-${LOOK}` : ''}${PIXEL ? `-${PIXEL}` : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });
const server = opt('url', null)
  ? null
  : await createServer({
      configFile: 'vite.config.js',
      cacheDir: '.scratch/.vite',
      logLevel: 'warn',
      server: { port: PORT, strictPort: true, fs: { allow: [process.cwd(), fs.realpathSync('node_modules')] } },
    });
if (server) await server.listen();
const origin = opt('url', `http://localhost:${PORT}`);
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'],
});

/** Tiles of one size into a grid, each with its label, written to `file` (capture-knight's). */
async function grid(tiles, cols, file, labels) {
  const { width: w, height: h } = await sharp(tiles[0]).metadata();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const comp = tiles.flatMap((t, i) => [
    { input: t, left: (i % cols) * w, top: Math.floor(i / cols) * h },
    {
      input: Buffer.from(
        `<svg width="${w}" height="20"><rect width="100%" height="20" fill="black" opacity="0.65"/><text x="5" y="14" font-family="monospace" font-size="12" fill="white">${esc(labels[i] ?? '')}</text></svg>`,
      ),
      left: (i % cols) * w,
      top: Math.floor(i / cols) * h,
    },
  ]);
  await sharp({
    create: { width: w * cols, height: h * Math.ceil(tiles.length / cols), channels: 3, background: '#000' },
  })
    .composite(comp)
    .png()
    .toFile(file);
  console.log(`✓ ${file}`);
}

/**
 * The page's own frames while `act` runs (Chrome's screencast, capture-knight's realTime),
 * each with when it was drawn (ms after the act began); null when the act says it can't run
 * (returns false: a clip the glb doesn't have).
 */
async function realTime(page, act, tail = 400) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await sleep(300);
  const t0 = Date.now();
  const ran = await act();
  if (ran === false) {
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    return null;
  }
  await sleep(tail);
  const t1 = Date.now();
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  return { frames: frames.map((f) => ({ t: f.t - t0, data: f.data })), length: t1 - t0 };
}

/** The frames at `FPS` from 0 to `length` (the latest drawn by each moment), as PNG buffers. */
function resample({ frames, length }) {
  const out = [];
  for (let t = 0; t <= length; t += 1000 / FPS) {
    const shown = frames.filter((f) => f.t <= t).at(-1) ?? frames[0];
    if (shown) out.push({ t: Math.round(t), drawn: Math.round(shown.t), data: Buffer.from(shown.data, 'base64') });
  }
  return out;
}

/** A device-pixel frame at the output size (the page's CSS size × SCALE), nearest. */
const fit = (size, buf) =>
  sharp(buf)
    .resize(Math.round(size.w * SCALE), Math.round(size.h * SCALE), { kernel: 'nearest', fit: 'fill' })
    .png()
    .toBuffer();

async function ready(page) {
  await page.goto(`${origin}/invitation/?test&calm`);
  await page.waitForSelector('[data-stage].is-ready', { timeout: 30_000 });
  await sleep(400);
}
const hook = (page, expr) => page.evaluate(expr);
const point = (page, part) => page.evaluate((p) => window.__invitation.screen(p), part);

/** A touch drag through CDP (real touches, as a finger makes them), `ms` long. */
async function touchDrag(page, from, to, ms = 1200) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, p) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  await touch('touchStart', from);
  await sleep(320); // (held past the 280 ms that makes it a grab)
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const wave = Math.sin(k * Math.PI * 3) * 30;
    await touch('touchMove', { x: from.x + (to.x - from.x) * k + wave, y: from.y + (to.y - from.y) * k });
    await sleep(16);
  }
  await touch('touchEnd', null);
  await cdp.detach();
}
async function mouseDrag(page, from, to, ms = 1200) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await sleep(320);
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * k + Math.sin(k * Math.PI * 3) * 30, from.y + (to.y - from.y) * k);
    await sleep(16);
  }
  await page.mouse.up();
}
/** Two fingers through CDP spreading from `d0` to `d1` px apart about `at`, `ms` long. */
async function pinch(page, at, d0, d1, ms = 600) {
  const cdp = await page.context().newCDPSession(page);
  const points = (d) => [
    { x: at.x - d / 2, y: at.y, id: 1 },
    { x: at.x + d / 2, y: at.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(d0) });
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(d0 + ((d1 - d0) * i) / steps),
    });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
/** A drag on empty space, straight, with no hold first (a touch through CDP on a phone size). */
async function sweep(page, size, from, to, ms = 800) {
  const steps = Math.round(ms / 16);
  if (size.phone) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, p) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
    await touch('touchStart', from);
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      });
      await sleep(16);
    }
    await touch('touchEnd', null);
    await cdp.detach();
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(16);
  }
  await page.mouse.up();
}
async function tapAt(page, size, p) {
  if (size.phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

/** The acts, each a list of [name, run(page, size), tail ms]. */
function actsFor(size) {
  const list = [];
  if (ACTS.includes('idle')) list.push(['idle', () => sleep(3000), 0]);
  if (ACTS.includes('clips'))
    for (const clip of ONLY_CLIPS)
      list.push([
        `clip-${clip}`,
        async (page) => {
          if (!(await hook(page, `window.__invitation.play(${JSON.stringify(clip)})`))) return false;
          await sleep(((CLIPS[clip]?.length ?? 1.5) + 0.6) * 1000);
        },
        0,
      ]);
  if (ACTS.includes('tap')) list.push(['tap', async (page) => tapAt(page, size, await point(page, 'head')), 2200]);
  if (ACTS.includes('drag'))
    list.push([
      size.phone ? 'touch-drag' : 'mouse-drag',
      async (page) => {
        const from = await point(page, 'body');
        const to = { x: from.x + size.w * 0.18, y: from.y - size.h * 0.12 };
        await (size.phone ? touchDrag(page, from, to) : mouseDrag(page, from, to));
      },
      2000,
    ]);
  if (ACTS.includes('buttons'))
    list.push([
      'buttons',
      async (page) => {
        for (const name of ['Wave', 'Spook', 'Sit', 'Run', 'Wander']) {
          const b = page.locator(`[data-button="${name}"]`);
          if (size.phone) await b.tap();
          else await b.click();
          await sleep(1300);
        }
      },
      600,
    ]);
  if (ACTS.includes('floor'))
    list.push([
      'floor',
      async (page) => {
        const body = await point(page, 'body');
        await tapAt(page, size, { x: body.x - size.w * 0.15, y: body.y + size.h * 0.12 });
      },
      2600,
    ]);
  if (ACTS.includes('chase'))
    list.push([
      'chase',
      async (page) => {
        for (let i = 0; i < 4; i++) {
          await tapAt(page, size, await point(page, 'head'));
          await sleep(180);
        }
        await sleep(1400);
        const from = await point(page, 'body');
        const to = { x: from.x - size.w * 0.12, y: from.y - size.h * 0.06 };
        await (size.phone ? touchDrag(page, from, to, 700) : mouseDrag(page, from, to, 700));
      },
      2400,
    ]);
  if (ACTS.includes('orbit'))
    list.push([
      'orbit',
      async (page) => {
        const body = await point(page, 'body');
        const from = { x: size.w * 0.15, y: Math.min(size.h * 0.8, body.y + size.h * 0.2) };
        await sweep(page, size, from, { x: size.w * 0.7, y: from.y + 30 });
        await sleep(900);
        if (size.phone) {
          await pinch(page, { x: size.w / 2, y: from.y }, 60, 220);
          await sleep(700);
          await pinch(page, { x: size.w / 2, y: from.y }, 220, 80);
        } else {
          await page.mouse.move(size.w / 2, from.y);
          for (let i = 0; i < 6; i++) {
            await page.mouse.wheel(0, -120);
            await sleep(60);
          }
          await sleep(700);
          for (let i = 0; i < 8; i++) {
            await page.mouse.wheel(0, 120);
            await sleep(60);
          }
        }
        await sleep(800);
        await page.locator('[data-look-open]').click();
        await page.locator('[data-reset-camera]').click();
        await sleep(300);
        await page.locator('[data-look-close]').click();
      },
      1600,
    ]);
  return list;
}

const problems = [];
for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: size.dpr,
    isMobile: size.phone,
    hasTouch: size.phone,
  });
  if (LOOK || PIXEL) {
    const look = { ...(LOOK ? { style: LOOK } : {}), ...(PIXEL ? { pixelSize: PIXEL } : {}) };
    await context.addInitScript((v) => localStorage.setItem('invitation.look.v1', v), JSON.stringify(look));
  }
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${size.w}x${size.h}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${size.w}x${size.h}: ${m.text()}`));
  const sheet = [];
  const labels = [];
  for (const [name, run, tail] of actsFor(size)) {
    await ready(page);
    const taken = await realTime(page, () => run(page), tail);
    if (!taken) {
      console.log(`- ${name} at ${size.w}x${size.h}: skipped (not in the glb)`);
      continue;
    }
    const shot = resample(taken);
    if (!shot.length) {
      problems.push(`${size.w}x${size.h} ${name}: no frames`);
      continue;
    }
    const frames = await Promise.all(shot.map((f) => fit(size, f.data)));
    const file = `${OUT}/${TAG}-${name}-${size.w}x${size.h}.webp`;
    await sharp(frames, { join: { animated: true } })
      .webp({ quality: 90, loop: 0, delay: frames.map(() => Math.round(1000 / FPS)) })
      .toFile(file);
    const unique = new Set(shot.map((f) => f.drawn)).size;
    console.log(`✓ ${file}: ${frames.length} frames over ${shot.at(-1).t} ms (${unique} different drawn frames)`);
    for (let i = 0; i < 6; i++) {
      const f = shot[Math.round((i / 5) * (shot.length - 1))];
      sheet.push(
        await sharp(await fit(size, f.data))
          .resize({ height: 360, kernel: 'nearest' })
          .png()
          .toBuffer(),
      );
      labels.push(`${name} ${f.drawn} ms`);
    }
  }
  if (sheet.length) await grid(sheet, 6, `${OUT}/${TAG}-sheet-${size.w}x${size.h}.png`, labels);
  await context.close();
}
await browser.close();
await server?.close();
if (problems.length) console.log(`Problems:\n  ${problems.join('\n  ')}`);
