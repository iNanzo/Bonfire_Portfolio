// Real-speed clips of carrying NEWT in the invitation toy (/invitation/) under each drag kind
// (?drag=today|level|tilt|bead: hold.js), for comparing them: GPU Chrome runs the same scripted
// moves through real input (a mouse on a desktop size, a finger through CDP on a phone one) from
// each of the camera's views, and Chrome's screencast hands over the page's own frames as it
// draws them (never paused frames: capture-invitation.mjs's way). The moves: grabbed by the head
// (held into a grab), 200 px up slowly, back down past where he was grabbed, 200 px across, a lift
// (the kind's own height control: the wheel on a desktop, a second finger on a phone; or, without
// one, a drag on up to the stage's top, past the back wall), then a flick up and let go (a throw),
// and his landing. Headless frames have no cursor, so a ring marks the pointer, and a dot where
// the kind aims his collar while he's held (a finger's lift over itself). It starts its own Vite
// dev server from the folder it's run in (a worktree too) and stops it after, or uses one that's
// running (--url). Run it alone on the GPU (one capture at a time on the machine):
//
//   node tools/capture-invitation-drag.mjs [--kinds today,level,tilt,bead] [--sizes 390x844@3,1280x800@1]
//        [--views 0/36,90/36,0/15,90/15] [--compare] [--fps 15] [--scale 1] [--sheet 8] [--seed 3]
//        [--port 5400] [--url <origin>] [--out .scratch/invitation-drag] [--tag drag]
//
//   --views    the camera's yaw/elevation, degrees (camera.js: yaw 0 looks toward −z; the
//              elevation within 12 to 70)
//   --compare  also put the same moves for every kind side by side in one WebP a view and size
//
// Files: <out>/<tag>-<kind>-<view>-<W>x<H>.webp (a view is y<yaw>e<elevation>); <out>/<tag>-<kind>-
// <W>x<H>-sheet.png (--sheet frames of each view, a row a view, labelled with when and what the
// move was); with --compare, <out>/<tag>-compare-<view>-<W>x<H>.webp; <out>/<tag>-<W>x<H>.json
// (each run's frames and frame times and, frame by frame, the drag's numbers from
// snapshot().drag: the collar's gap from where it's aimed, the hold height, the anchor's depth
// along the camera's level axis, his lowest foot, the blob, the ring; and the most the gap was
// once the grab was in). The console prints the same in short.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import { createServer } from 'vite';
import { DRAG_KINDS } from '../src/invitation/hold.js';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const KINDS = opt('kinds', 'today').split(',');
for (const k of KINDS) if (!DRAG_KINDS.includes(k)) throw new Error(`--kinds ${k}: one of ${DRAG_KINDS.join(', ')}`);
const SIZES = opt('sizes', '390x844@3,1280x800@1')
  .split(',')
  .map((s) => {
    const [wh, dpr = '1'] = s.split('@');
    const [w, h] = wh.split('x').map(Number);
    return { w, h, dpr: Number(dpr), phone: w < 768 };
  });
const VIEWS = opt('views', '0/36,90/36,0/15,90/15')
  .split(',')
  .map((v) => {
    const [yaw, elevation] = v.split('/').map(Number);
    return { yaw, elevation, name: `y${yaw}e${elevation}` };
  });
const COMPARE = argv.includes('--compare');
const FPS = Number(opt('fps', '15'));
const SCALE = Number(opt('scale', '1'));
const SHEET = Number(opt('sheet', '8'));
const SEED = opt('seed', '3');
const PORT = Number(opt('port', '5400'));
const OUT = opt('out', '.scratch/invitation-drag');
const TAG = opt('tag', 'drag');
const RAD = Math.PI / 180;
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
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });

/** Tiles of one size into a grid, each with its label, written to `file`. */
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
 * In the page: a ring where the pointer is (a mouse's or a finger's; headless frames draw no
 * cursor), a dot where the drag kind aims his collar while he's held, and a record of the drag's
 * numbers every frame (snapshot().drag), with what the script is doing (window.__dragMove).
 */
function installMarks() {
  const mark = (css) => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647;border-radius:50%;display:none;${css}`;
    document.body.append(el);
    return el;
  };
  const ring = mark(
    'width:14px;height:14px;margin:-9px 0 0 -9px;border:2px solid #fff;box-shadow:0 0 0 1px #000,inset 0 0 0 1px #000;',
  );
  const dot = mark('width:6px;height:6px;margin:-3px 0 0 -3px;background:#e0245e;box-shadow:0 0 0 1px #fff;');
  const at = (el, x, y) => {
    el.style.display = 'block';
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
  for (const type of ['pointermove', 'pointerdown'])
    document.addEventListener(type, (e) => at(ring, e.clientX, e.clientY), { capture: true, passive: true });
  const rec = { on: true, rows: [], raf: [] };
  /** @type {any} */ (window).__dragRec = rec;
  let last = -1;
  const tick = (now) => {
    if (!rec.on) return;
    if (last >= 0) rec.raf.push(now - last);
    last = now;
    const s = /** @type {any} */ (window).__invitation?.snapshot();
    const d = s?.drag;
    if (d?.aim) at(dot, d.aim.x, d.aim.y);
    else dot.style.display = 'none';
    if (d) {
      const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
      rec.rows.push({
        t: Math.round(now),
        move: /** @type {any} */ (window).__dragMove ?? '',
        held: s.held,
        heldFor: r3(s.motion.heldFor),
        gap: r3(d.gap),
        holdY: r3(d.holdY),
        depth: r3(d.depth),
        foot: r3(d.lowestFoot),
        blob: { r: r3(d.blob.radius), a: r3(d.blob.alpha) },
        ring: d.ring ? { x: r3(d.ring.x), z: r3(d.ring.z), a: r3(d.ring.alpha) } : null,
        lift: r3(s.lift),
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** The press: a finger through CDP on a phone size, the mouse on a desktop one; client px. */
async function presser(page, size) {
  if (!size.phone)
    return {
      down: async (p) => {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
      },
      move: (p) => page.mouse.move(p.x, p.y),
      second: null,
      up: () => page.mouse.up(),
      done: async () => {},
    };
  const cdp = await page.context().newCDPSession(page);
  let one = null;
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  return {
    down: (p) => send('touchStart', [{ x: (one = p).x, y: p.y, id: 1 }]),
    move: (p) => send('touchMove', [{ x: (one = p).x, y: p.y, id: 1 }]),
    // (A second finger beside the first: down, moved, lifted.)
    second: {
      down: (p) =>
        send('touchStart', [
          { ...one, id: 1 },
          { x: p.x, y: p.y, id: 2 },
        ]),
      move: (p) =>
        send('touchMove', [
          { ...one, id: 1 },
          { x: p.x, y: p.y, id: 2 },
        ]),
      up: () => send('touchEnd', [{ ...one, id: 1 }]),
    },
    up: () => send('touchEnd', []),
    done: () => cdp.detach(),
  };
}

/** The press (or the cursor) along `path(k)`, k 0 to 1 over `ms` by the clock, a move about every frame. */
async function along(move, path, ms) {
  const t0 = Date.now();
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / ms);
    await move(path(k));
    if (k >= 1) return;
    await sleep(16);
  }
}
const line = (a, b) => (k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const ease = (f) => (k) => f(k * k * (3 - 2 * k));
const say = (page, what) => page.evaluate((w) => /** @type {any} */ (window.__dragMove = w), what);

/** The scripted moves: grabbed by the head, up, down past the start, across, a lift, a flick and let go. */
async function moves(page, size) {
  const s0 = await page.evaluate(() => window.__invitation.snapshot());
  const head = await page.evaluate(() => window.__invitation.screen('head'));
  const top = await page.evaluate(() => document.querySelector('[data-stage]').getBoundingClientRect().top);
  const press = await presser(page, size);
  let at = { x: head.x, y: head.y };
  await say(page, 'grab');
  await press.down(at);
  await sleep(340); // (held past the 280 ms that makes it a grab)
  await say(page, 'up 200');
  const up = { x: at.x, y: at.y - 200 };
  await along(press.move, ease(line(at, up)), 1600);
  await say(page, 'down past');
  const down = { x: at.x, y: at.y + 60 };
  await along(press.move, ease(line(up, down)), 2000);
  await say(page, 'across 200');
  // (200 px the way with more room, kept 24 px inside the screen: a phone's is narrower.)
  const way = size.w - down.x >= down.x ? 1 : -1;
  const across = { x: Math.min(size.w - 24, Math.max(24, down.x + way * 200)), y: down.y - 80 };
  await along(press.move, ease(line(down, across)), 1200);
  at = across;
  await say(page, 'lift');
  if (!size.phone && s0.drag.controls.wheel) {
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, -100);
      await sleep(110);
    }
  } else if (size.phone && s0.drag.controls.secondFinger && press.second) {
    const f = { x: Math.min(size.w - 30, at.x + 90), y: at.y + 40 };
    await press.second.down(f);
    await along(press.second.move, ease(line(f, { x: f.x, y: f.y - 160 })), 1300);
    await press.second.up();
  } else {
    // (No height control: on up to the stage's top and past it, out past the back wall.)
    const high = { x: at.x, y: top + 24 };
    await along(press.move, ease(line(at, high)), 1400);
    at = high;
  }
  await sleep(300);
  await say(page, 'flick');
  const mid = { x: at.x, y: Math.max(top + 140, at.y + 160) };
  await along(press.move, ease(line(at, mid)), 600);
  await sleep(150);
  await along(press.move, line(mid, { x: mid.x + 30, y: mid.y - 100 }), 100);
  await press.up();
  await press.done();
  await say(page, 'thrown');
  await sleep(1600);
}

/** One run: the page under ?drag=<kind> at a view, the moves recorded at real speed. */
async function run(page, size, kind, view) {
  await page.goto(`${origin}/invitation/?test&calm&seed=${SEED}&drag=${kind}`);
  await page.waitForSelector('[data-stage].is-ready', { timeout: 30_000 });
  await page.waitForFunction(() => window.__invitation.snapshot().state === 'idle', null, { timeout: 20_000 });
  await page.evaluate((v) => window.__invitation.view(v), { yaw: view.yaw * RAD, elevation: view.elevation * RAD });
  await page.waitForFunction(
    (e) => {
      const c = window.__invitation.snapshot().camera;
      return !c.turning && Math.abs(c.elevation - e) < 0.01;
    },
    view.elevation * RAD,
    { timeout: 20_000 },
  );
  await sleep(500);
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await page.evaluate(installMarks);
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await sleep(300);
  const t0 = Date.now();
  const p0 = await page.evaluate(() => performance.now());
  await moves(page, size);
  const length = Date.now() - t0;
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  const rec = await page.evaluate(() => {
    const r = /** @type {any} */ (window).__dragRec;
    r.on = false;
    return { rows: r.rows, raf: r.raf };
  });
  // (Frames at FPS from the moves' start: the latest drawn by each moment.)
  const shot = [];
  for (let t = 0; t <= length; t += 1000 / FPS) {
    const shown = frames.filter((f) => f.t - t0 <= t).at(-1) ?? frames[0];
    if (shown) shot.push({ t: Math.round(t), data: Buffer.from(shown.data, 'base64') });
  }
  const rows = rec.rows.filter((r) => r.t >= p0).map((r) => ({ ...r, t: Math.round(r.t - p0) }));
  return { shot, rows, raf: rec.raf, length };
}

/** A frame at the output size (the page's CSS size × SCALE), nearest. */
const fit = (size, buf) =>
  sharp(buf)
    .resize(Math.round(size.w * SCALE), Math.round(size.h * SCALE), { kernel: 'nearest', fit: 'fill' })
    .png()
    .toBuffer();
const label = async (buf, text) => {
  const { width } = await sharp(buf).metadata();
  return sharp(buf)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="22"><rect width="100%" height="22" fill="black" opacity="0.7"/><text x="6" y="16" font-family="monospace" font-size="14" fill="white">${text}</text></svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
};
const moveAt = (rows, t) => rows.filter((r) => r.t <= t).at(-1)?.move ?? '';

const problems = [];
for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: size.dpr,
    isMobile: size.phone,
    hasTouch: size.phone,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${size.w}x${size.h}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${size.w}x${size.h}: ${m.text()}`));
  const report = { size, views: VIEWS, runs: {} };
  /** @type {Record<string, Record<string, Buffer[]>>} each view's frames, by kind (for --compare) */
  const byView = {};
  for (const kind of KINDS) {
    const tiles = [];
    const labels = [];
    for (const view of VIEWS) {
      const taken = await run(page, size, kind, view);
      const frames = await Promise.all(taken.shot.map((f) => fit(size, f.data)));
      const base = `${OUT}/${TAG}-${kind}-${view.name}-${size.w}x${size.h}`;
      await sharp(frames, { join: { animated: true } })
        .webp({ quality: 90, loop: 0, delay: frames.map(() => Math.round(1000 / FPS)) })
        .toFile(`${base}.webp`);
      (byView[view.name] ??= {})[kind] = frames;
      const held = taken.rows.filter((r) => r.held && r.heldFor >= 0.15 && r.gap !== null);
      const most = held.reduce((m, r) => Math.max(m, r.gap), 0);
      const depths = held.map((r) => r.depth);
      const lowest = held.reduce((m, r) => Math.min(m, r.foot), Infinity);
      const sorted = [...taken.raf].sort((a, b) => a - b);
      console.log(
        `✓ ${base}.webp: ${frames.length} frames over ${taken.length} ms; the gap at most ${most.toFixed(1)} px once in; ` +
          `depth ${Math.min(...depths).toFixed(2)} to ${Math.max(...depths).toFixed(2)}; lowest foot ${lowest.toFixed(3)}; ` +
          `frame ms median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)}`,
      );
      report.runs[`${kind}/${view.name}`] = { webp: `${base}.webp`, ms: taken.length, mostGap: most, rows: taken.rows };
      for (let i = 0; i < SHEET; i++) {
        const f = taken.shot[Math.round((i / Math.max(1, SHEET - 1)) * (taken.shot.length - 1))];
        tiles.push(
          await sharp(await fit(size, f.data))
            .resize({ height: size.phone ? 420 : 300, kernel: 'nearest' })
            .png()
            .toBuffer(),
        );
        labels.push(`${view.name} ${f.t} ms ${moveAt(taken.rows, f.t)}`);
      }
    }
    await grid(tiles, SHEET, `${OUT}/${TAG}-${kind}-${size.w}x${size.h}-sheet.png`, labels);
  }
  if (COMPARE && KINDS.length > 1)
    for (const view of VIEWS) {
      const runs = KINDS.map((k) => byView[view.name][k]);
      const n = Math.max(...runs.map((r) => r.length));
      const { width, height } = await sharp(runs[0][0]).metadata();
      const out = [];
      for (let i = 0; i < n; i++) {
        const cells = await Promise.all(runs.map((r, j) => label(r[Math.min(i, r.length - 1)], KINDS[j])));
        out.push(
          await sharp({ create: { width: width * cells.length, height, channels: 3, background: '#000' } })
            .composite(cells.map((c, j) => ({ input: c, left: j * width, top: 0 })))
            .png()
            .toBuffer(),
        );
      }
      const file = `${OUT}/${TAG}-compare-${view.name}-${size.w}x${size.h}.webp`;
      await sharp(out, { join: { animated: true } })
        .webp({ quality: 85, loop: 0, delay: out.map(() => Math.round(1000 / FPS)) })
        .toFile(file);
      console.log(`✓ ${file}`);
    }
  fs.writeFileSync(`${OUT}/${TAG}-${size.w}x${size.h}.json`, JSON.stringify(report, null, 1));
  await context.close();
}
await browser.close();
await server?.close();
if (problems.length) console.log(`Problems:\n  ${problems.join('\n  ')}`);
