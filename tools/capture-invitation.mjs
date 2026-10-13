// Real-speed clips of the invitation toy (/invitation/) for reviews: GPU Chrome plays scripted
// acts through the page's ?test hooks (window.__invitation) and real input (taps, a touch drag
// through CDP Input.dispatchTouchEvent, a mouse drag, the toolbar's buttons), and Chrome's
// screencast hands over the page's own frames as it draws them (never paused frames). Each act
// at each size becomes an animated WebP that plays at the speed it ran, plus a labelled contact
// sheet of its own and one a size. It starts its own Vite dev server from the folder it's run in
// (a worktree too) and stops it after, or uses one that's running (--url). Run it alone on the
// GPU (one capture at a time on the machine):
//
//   node tools/capture-invitation.mjs [--sizes 390x844@3,412x915@2.625,1280x800@1]
//        [--acts idle,clips,tap,drag,buttons,floor,chase,orbit] [--clips Wave,Spook] [--look ds|soft]
//        [--pixel off|2|3|4] [--dither on|off] [--outlines on|off] [--motion smooth|choppy] [--anim-fps 15]
//        [--seed 3] [--calm on|off] [--lead 300] [--fps 15] [--scale 1] [--sheet 8] [--crop 200]
//        [--port 5340] [--url <origin>] [--out .scratch/invitation-shots] [--tag now]
//
//   idle      three seconds of him standing (Idle, or the placeholder's T-pose)
//   clips     every clip in turn (--clips for some), forced through play() after 0.4 s of the
//             brain's own idle: one WebP each, a looping clip played twice, a one-shot once
//             (Walk and Run step in place at their own pace; floor and button-Run show them as
//             he plays them, moving)
//   tap       a tap on his head (a touch on a phone size, a click on a desktop one)
//   taps      two taps on his head 2.6 s apart (a Wave and a Spook when the --seed gives both)
//   drag      a press on his body dragged up and across the screen, then let go (a touch drag
//             on a phone size, a mouse drag on a desktop one)
//   swing     a press on his body held into a grab, lifted, swung left and right twice, brought
//             back to the middle, held still and let go (he falls and lands)
//   hover     (desktop sizes) the cursor circling him, then on him and off again: his head follows
//   buttons   Wave, Spook, Sit, Run and Wander pressed in turn
//   button-X  the toolbar's X button pressed once (button-Run: he runs for 3 s), 3.5 s
//   floor     a tap on the floor in front of him
//   chase     four quick taps on him (he runs off), then a press that catches him mid-run (the
//             finger or cursor follows him until it's a grab), carries him a little and lets go
//   orbit     a drag across empty space (the camera turns), then a pinch or the wheel zooming
//             in and out, then Reset Camera from the Look sheet
//   sitalone  no input until he sits by himself (20 s alone; the first 16 s aren't recorded:
//             needs --calm off), a little of him sitting, then a tap on him stands him up
//
// Files: <out>/<tag>-<act>-<W>x<H>.webp; <out>/<tag>-<act>-<W>x<H>-sheet.png (--sheet frames
// of the act, each a --crop CSS px square around him, the orbit act's whole frames, labelled
// with when it was drawn and his state then); <out>/<tag>-sheet-<W>x<H>.png (six whole frames
// an act); <out>/<tag>-<W>x<H>.json (each act's frames, the page's frame times while it ran,
// and the states and clips he went through, with when). --look, --pixel, --dither, --outlines
// and --motion set the Look menu first (its stored settings, invitation.look.v1; with --motion
// the report and the console say how many times a second his pose changed). --anim-fps sets
// every preset's animFps (choppy motion) in the page after each load, through the dev server's
// own looks/index.js module; nothing is written to the code. --seed and --calm go to the page's
// query (?calm is on unless --calm off). --lead keeps that many ms from before each act begins.
// --scale multiplies the CSS size of the output.
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
const DITHER = opt('dither', null);
const OUTLINES = opt('outlines', null);
const MOTION = opt('motion', null);
const ANIM_FPS = opt('anim-fps', null);
const SEED = opt('seed', null);
const CALM = opt('calm', 'on') !== 'off';
const LEAD = Number(opt('lead', '300'));
const FPS = Number(opt('fps', '15'));
const SCALE = Number(opt('scale', '1'));
const SHEET = Number(opt('sheet', '8'));
const CROP = Number(opt('crop', '200'));
const PORT = Number(opt('port', '5340'));
const OUT = opt('out', '.scratch/invitation-shots');
const TAG = opt('tag', `invitation${LOOK ? `-${LOOK}` : ''}${PIXEL ? `-${PIXEL}` : ''}${MOTION ? `-${MOTION}` : ''}`);
/** Quiet before he sits by himself that isn't recorded, ms (he sits after 20 s alone). */
const SIT_QUIET = 16_000;
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
 * Starts a record in the page, every frame (requestAnimationFrame, the toy's own cadence): the
 * time between frames, where he is on screen (his head and the middle of his body, client px),
 * and each change of his state, clip, reaction or being held. Times are performance.now() ms.
 */
function startRecord() {
  const rec = { on: true, raf: [], pos: [], line: [] };
  /** @type {any} */ (window).__capture = rec;
  let last = -1;
  let prev = '';
  const tick = (now) => {
    if (!rec.on) return;
    if (last >= 0) rec.raf.push([now, now - last]);
    last = now;
    const inv = /** @type {any} */ (window).__invitation;
    const s = inv?.snapshot();
    if (s?.ready) {
      const h = inv.screen('head');
      const b = inv.screen('body');
      rec.pos.push([now, Math.round(h.x), Math.round(h.y), Math.round(b.x), Math.round(b.y)]);
      const key = `${s.state}|${s.clip}|${s.reaction}|${s.held}`;
      if (key !== prev) {
        prev = key;
        rec.line.push({ t: now, state: s.state, clip: s.clip, reaction: s.reaction, held: s.held });
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function stopRecord() {
  const rec = /** @type {any} */ (window).__capture;
  rec.on = false;
  return { raf: rec.raf, pos: rec.pos, line: rec.line, end: window.__invitation?.snapshot() ?? null };
}

/**
 * The page's own frames while `act` runs (Chrome's screencast, capture-knight's realTime),
 * each with when it was drawn (ms after the act began, from --lead ms before it), and the
 * page's record over the same time (startRecord, in the same ms); null when the act says it
 * can't run (returns false: a clip the glb doesn't have).
 */
async function realTime(page, act, tail = 400) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.evaluate(startRecord);
  await sleep(Math.max(300, LEAD));
  const p0 = await page.evaluate(() => performance.now());
  const t0 = Date.now();
  const ran = await act();
  if (ran === false) {
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
    await page.evaluate(stopRecord);
    return null;
  }
  await sleep(tail);
  const t1 = Date.now();
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  const rec = await page.evaluate(stopRecord);
  const at = (t) => Math.round(t - p0);
  return {
    frames: frames.map((f) => ({ t: f.t - t0, data: f.data })),
    length: t1 - t0,
    raf: rec.raf.filter(([t]) => t >= p0).map(([, d]) => d),
    pos: rec.pos.map(([t, ...p]) => [at(t), ...p]),
    line: rec.line.map((l) => ({ ...l, t: at(l.t) })),
    end: rec.end,
  };
}

/** The frames at `FPS` from --lead ms before the act to its `length` (the latest drawn by each moment), as PNG buffers. */
function resample({ frames, length }) {
  const out = [];
  for (let t = -LEAD; t <= length; t += 1000 / FPS) {
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

/** The record's last entry at or before `t` (ms), or its first. */
const latest = (list, t) => list.filter((e) => (Array.isArray(e) ? e[0] : e.t) <= t).at(-1) ?? list[0];

/**
 * One tile of an act's sheet: a `CROP` CSS px square around him (where he was when the frame was
 * drawn), 2 px a CSS px, nearest; or the whole frame `full`, 480 px tall.
 */
async function tile(size, buf, pos, full) {
  if (full || !pos)
    return sharp(await fit(size, buf))
      .resize({ height: 480, kernel: 'nearest' })
      .png()
      .toBuffer();
  const { width } = await sharp(buf).metadata();
  const k = width / size.w;
  const side = Math.min(CROP, size.w, size.h);
  const cx = (pos[1] + pos[3]) / 2;
  const cy = (pos[2] + pos[4]) / 2;
  const left = Math.max(0, Math.min(size.w - side, cx - side / 2));
  const top = Math.max(0, Math.min(size.h - side, cy - side / 2));
  return sharp(buf)
    .extract({
      left: Math.round(left * k),
      top: Math.round(top * k),
      width: Math.round(side * k),
      height: Math.round(side * k),
    })
    .resize(side * 2, side * 2, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

/** Frame times, ms: the median, the 95th percentile, the longest, and how many took over 20 ms. */
function frameTimes(raf) {
  if (!raf.length) return null;
  const s = [...raf].sort((a, b) => a - b);
  const q = (p) => Number(s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1));
  return {
    frames: s.length,
    median: q(0.5),
    p95: q(0.95),
    max: Number(s.at(-1).toFixed(1)),
    over20: s.filter((d) => d > 20).length,
  };
}

async function ready(page) {
  const query = ['test', ...(CALM ? ['calm'] : []), ...(SEED !== null ? [`seed=${SEED}`] : [])].join('&');
  await page.goto(`${origin}/invitation/?${query}`);
  await page.waitForSelector('[data-stage].is-ready', { timeout: 30_000 });
  if (ANIM_FPS !== null) await setAnimFps(page, Number(ANIM_FPS));
  await sleep(400);
}
/**
 * Every preset's animFps, set in the page: the module the page loaded (the dev server's
 * looks/index.js, found by its URL among the page's resources), so nothing is written to the
 * code and a reload undoes it.
 */
function setAnimFps(page, fps) {
  return page.evaluate(async (f) => {
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => /\/src\/invitation\/looks\/index\.js(\?|$)/.test(n));
    if (!url) throw new Error('looks/index.js is not among the page’s modules (is this the dev server?)');
    const { PRESETS } = await import(/* @vite-ignore */ url);
    for (const p of Object.values(PRESETS)) p.animFps = f;
  }, fps);
}
/**
 * How many times a second his pose changes with Wave forced (his forearms from his root, a
 * second of frames; Wave runs on the clock, so it steps at animFps when that's set).
 */
function poseRate(page) {
  return page.evaluate(
    () =>
      new Promise((done) => {
        const inv = /** @type {any} */ (window).__invitation;
        inv.play('Wave');
        let prev = '';
        let n = -1;
        const t0 = performance.now();
        const tick = (now) => {
          const b = inv.bones();
          const k = [b.ForeArmL, b.ForeArmR].flatMap((p) => [p.x, p.y, p.z].map((v) => v.toFixed(5))).join();
          if (k !== prev) {
            n++;
            prev = k;
          }
          if (now - t0 < 1000) requestAnimationFrame(tick);
          else {
            inv.play(null);
            done(n);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}
const hook = (page, expr) => page.evaluate(expr);
const point = (page, part) => page.evaluate((p) => window.__invitation.screen(p), part);

/**
 * One press: a finger through CDP on a phone size (real touches, as a finger makes them), the
 * mouse on a desktop one; down, move and up take client px.
 */
async function presser(page, size) {
  if (!size.phone)
    return {
      down: async (p) => {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
      },
      move: (p) => page.mouse.move(p.x, p.y),
      up: () => page.mouse.up(),
      done: async () => {},
    };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, p) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  return {
    down: (p) => touch('touchStart', p),
    move: (p) => touch('touchMove', p),
    up: () => touch('touchEnd', null),
    done: () => cdp.detach(),
  };
}
/**
 * The press (or the cursor) along `path(k)`, k from 0 to 1 over `ms` by the clock, a move about
 * every frame (a move waits for the page to take it, so counting steps would run slow).
 */
async function along(move, path, ms) {
  const t0 = Date.now();
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / ms);
    await move(path(k));
    if (k >= 1) return;
    await sleep(16);
  }
}
/** A press on `from` held into a grab, dragged to `to` with a wobble across, `ms` long, let go. */
async function holdDrag(page, size, from, to, ms = 1200) {
  const press = await presser(page, size);
  await press.down(from);
  await sleep(320); // (held past the 280 ms that makes it a grab)
  await along(
    press.move,
    (k) => ({ x: from.x + (to.x - from.x) * k + Math.sin(k * Math.PI * 3) * 30, y: from.y + (to.y - from.y) * k }),
    ms,
  );
  await press.up();
  await press.done();
}
/** Two fingers through CDP spreading from `d0` to `d1` px apart about `at`, `ms` long. */
async function pinch(page, at, d0, d1, ms = 600) {
  const cdp = await page.context().newCDPSession(page);
  const points = (d) => [
    { x: at.x - d / 2, y: at.y, id: 1 },
    { x: at.x + d / 2, y: at.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(d0) });
  await along(
    (d) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(d) }),
    (k) => d0 + (d1 - d0) * k,
    ms,
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
/** A drag on empty space, straight, with no hold first (a touch through CDP on a phone size). */
async function sweep(page, size, from, to, ms = 800) {
  const press = await presser(page, size);
  await press.down(from);
  await along(press.move, (k) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }), ms);
  await press.up();
  await press.done();
}
async function tapAt(page, size, p) {
  if (size.phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
/** His state now (?test's snapshot). */
const stateOf = (page) => page.evaluate(() => window.__invitation.snapshot().state);
/** Wait until his state is `want`, up to `ms`; whether it came. */
async function until(page, want, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await stateOf(page)) === want) return true;
    await sleep(100);
  }
  return false;
}

/**
 * The acts, each {name, run(page), tail ms, setup?(page) (before the recording starts), full?
 * (the act's sheet shows whole frames, not him cropped), from? (ms: the act's sheet starts
 * there, not at the lead)}.
 */
function actsFor(size) {
  const list = [];
  const act = (name, run, tail, more = {}) => list.push({ name, run, tail, ...more });
  if (ACTS.includes('idle')) act('idle', () => sleep(3000), 0);
  if (ACTS.includes('clips'))
    for (const clip of ONLY_CLIPS)
      act(
        `clip-${clip}`,
        async (page) => {
          await sleep(400);
          if (!(await hook(page, `window.__invitation.play(${JSON.stringify(clip)})`))) return false;
          const c = CLIPS[clip];
          await sleep(((c?.length ?? 1.5) * (c?.loop ? 2 : 1) + 0.6) * 1000);
        },
        0,
        { from: 380 },
      );
  if (ACTS.includes('tap')) act('tap', async (page) => tapAt(page, size, await point(page, 'head')), 2200);
  if (ACTS.includes('taps'))
    act(
      'taps',
      async (page) => {
        await tapAt(page, size, await point(page, 'head'));
        await sleep(2600);
        await tapAt(page, size, await point(page, 'head'));
      },
      2600,
    );
  if (ACTS.includes('drag'))
    act(
      size.phone ? 'touch-drag' : 'mouse-drag',
      async (page) => {
        const from = await point(page, 'body');
        const to = { x: from.x + size.w * 0.18, y: from.y - size.h * 0.12 };
        await holdDrag(page, size, from, to);
      },
      2000,
    );
  if (ACTS.includes('swing'))
    act(
      'swing',
      async (page) => {
        const from = await point(page, 'body');
        const lift = { x: from.x, y: from.y - Math.min(size.h * 0.14, 120) };
        const amp = Math.min(size.w * 0.26, 220);
        const press = await presser(page, size);
        await press.down(from);
        await sleep(320); // (held past the 280 ms that makes it a grab)
        await along(press.move, (k) => ({ x: from.x, y: from.y + (lift.y - from.y) * k }), 400);
        await along(press.move, (k) => ({ x: lift.x + amp * Math.sin(k * Math.PI * 4), y: lift.y }), 2400);
        await sleep(350);
        await press.up();
        await press.done();
      },
      2400,
    );
  if (ACTS.includes('hover') && !size.phone)
    act(
      'hover',
      async (page) => {
        const head = await point(page, 'head');
        const body = await point(page, 'body');
        const r = Math.min(size.w, size.h) * 0.3;
        const move = (p) => page.mouse.move(p.x, p.y);
        await move({ x: body.x + r, y: body.y });
        await along(
          move,
          (k) => ({ x: body.x + r * Math.cos(k * Math.PI * 2), y: body.y + r * 0.7 * Math.sin(k * Math.PI * 2) }),
          4000,
        );
        await along(
          move,
          (k) => ({ x: body.x + r + (head.x - body.x - r) * k, y: body.y + (head.y - body.y) * k }),
          500,
        );
        await sleep(1000);
        await along(move, (k) => ({ x: head.x - r * 1.4 * k, y: head.y + r * 0.5 * k }), 500);
      },
      1200,
    );
  if (ACTS.includes('buttons'))
    act(
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
    );
  for (const name of ACTS.filter((a) => a.startsWith('button-')).map((a) => a.slice(7)))
    act(
      `button-${name}`,
      async (page) => {
        const b = page.locator(`[data-button="${name}"]`);
        if (size.phone) await b.tap();
        else await b.click();
        await sleep(3500);
      },
      0,
    );
  if (ACTS.includes('floor'))
    act(
      'floor',
      async (page) => {
        const body = await point(page, 'body');
        await tapAt(page, size, { x: body.x - size.w * 0.15, y: body.y + size.h * 0.12 });
      },
      2600,
    );
  if (ACTS.includes('chase'))
    act(
      'chase',
      async (page) => {
        for (let i = 0; i < 4; i++) {
          await tapAt(page, size, await point(page, 'head'));
          await sleep(180);
        }
        await sleep(1000);
        // Catch him mid-run: down on him, then after him (a press that moves is a grab at once).
        const press = await presser(page, size);
        let at = await point(page, 'body');
        await press.down(at);
        const t0 = Date.now();
        while (Date.now() - t0 < 200) {
          await sleep(16);
          at = await point(page, 'body');
          await press.move(at);
        }
        const from = at;
        const to = { x: from.x - size.w * 0.12, y: from.y - size.h * 0.06 };
        await along(press.move, (k) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }), 700);
        await sleep(200);
        await press.up();
        await press.done();
      },
      2400,
    );
  if (ACTS.includes('orbit'))
    act(
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
      { full: true },
    );
  if (ACTS.includes('sitalone')) {
    if (CALM) console.log('- sitalone: skipped (he never sits by himself with ?calm: pass --calm off)');
    else
      act(
        'sitalone',
        async (page) => {
          if (!(await until(page, 'sit', 15_000))) console.log('  (sitalone: he didn’t sit within 31 s)');
          await sleep(2500);
          await tapAt(page, size, await point(page, 'head'));
        },
        3500,
        { setup: () => sleep(SIT_QUIET) },
      );
  }
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
  const look = {
    ...(LOOK ? { style: LOOK } : {}),
    ...(PIXEL ? { pixelSize: PIXEL } : {}),
    ...(DITHER ? { dither: DITHER !== 'off' } : {}),
    ...(OUTLINES ? { outlines: OUTLINES !== 'off' } : {}),
    ...(MOTION ? { motion: MOTION } : {}),
  };
  if (Object.keys(look).length)
    await context.addInitScript((v) => localStorage.setItem('invitation.look.v1', v), JSON.stringify(look));
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${size.w}x${size.h}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${size.w}x${size.h}: ${m.text()}`));
  const report = { size, look, animFps: ANIM_FPS === null ? null : Number(ANIM_FPS), seed: SEED, calm: CALM, acts: {} };
  if (ANIM_FPS !== null || MOTION !== null) {
    await ready(page);
    report.poseChangesPerSecond = await poseRate(page);
    const how = MOTION !== null ? `Motion ${MOTION}` : `animFps ${ANIM_FPS}`;
    console.log(`  ${how}: his pose changed ${report.poseChangesPerSecond} times in a second`);
  }
  const sheet = [];
  const labels = [];
  for (const { name, run, tail, setup, full, from } of actsFor(size)) {
    await ready(page);
    if (setup) await setup(page);
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
    const base = `${OUT}/${TAG}-${name}-${size.w}x${size.h}`;
    await sharp(frames, { join: { animated: true } })
      .webp({ quality: 90, loop: 0, delay: frames.map(() => Math.round(1000 / FPS)) })
      .toFile(`${base}.webp`);
    const unique = new Set(shot.map((f) => f.drawn)).size;
    const times = frameTimes(taken.raf);
    const states = taken.line.map((l) => `${l.state}${l.clip && l.clip !== l.state ? `/${l.clip}` : ''}@${l.t}`);
    console.log(
      `✓ ${base}.webp: ${frames.length} frames over ${shot.at(-1).t} ms (${unique} different drawn frames); ` +
        `frame ms median ${times?.median} p95 ${times?.p95} max ${times?.max}; ${states.join(' → ')}`,
    );
    // The act's own sheet: him cropped (or whole frames), --sheet frames from its start to its end.
    const own = [];
    const ownLabels = [];
    const span = shot.filter((f) => f.t >= (from ?? -Infinity));
    for (let i = 0; i < SHEET; i++) {
      const f = span[Math.round((i / Math.max(1, SHEET - 1)) * (span.length - 1))];
      own.push(await tile(size, f.data, latest(taken.pos, f.drawn), full));
      // (His state, and the clip leading when it isn't the state's own name.)
      const l = latest(taken.line, f.drawn);
      const clip = l?.clip && l.clip.toLowerCase() !== l.state.toLowerCase() ? ` ${l.clip}` : '';
      ownLabels.push(`${f.drawn} ms ${l ? `${l.state}${clip}` : ''}`);
    }
    // (Whole phone frames are narrow: one row; crops and desktop frames: two rows past four.)
    const cols = (full && size.phone) || SHEET <= 4 ? SHEET : Math.ceil(SHEET / 2);
    await grid(own, cols, `${base}-sheet.png`, ownLabels);
    report.acts[name] = {
      webp: `${base}.webp`,
      sheet: `${base}-sheet.png`,
      frames: frames.length,
      ms: shot.at(-1).t,
      drawnFrames: unique,
      frameMs: times,
      line: taken.line,
      end: taken.end,
    };
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
  fs.writeFileSync(`${OUT}/${TAG}-${size.w}x${size.h}.json`, JSON.stringify(report, null, 1));
  await context.close();
}
await browser.close();
await server?.close();
if (problems.length) console.log(`Problems:\n  ${problems.join('\n  ')}`);
