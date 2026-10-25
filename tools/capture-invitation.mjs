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
//        [--pixel 16|24|32|48|64|96|128|192|256|native|off] [--dither on|off] [--outlines on|off] [--motion smooth|choppy]
//        [--anim-fps 15] [--seed 3] [--calm on|off] [--lead 300] [--fps 15] [--scale 1] [--sheet 8] [--crop 200]
//        [--raw] [--port 5340] [--url <origin>] [--out .scratch/invitation-shots] [--tag now]
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
//   flick     a press on his body held into a grab, lifted, flicked 260 px across in half a second,
//             held still 1.5 s and let go: no shake (no surprised face, no "shaken" line)
//   shake     the same grab shaken ±40 px across at 5 Hz for 1.6 s and let go: shaken (the line),
//             stressed, and he runs once he lands
//   stroll    the same grab carried about gently for 8 s (134 px/s at most) and let go: he lands
//             calm, no flee
//   hover     (desktop sizes) the cursor circling him, then on him and off again: his head follows
//   buttons   Wave, Sit, Screen Time and Run pressed in turn
//   device    Screen Time pressed three times: he sits with the tablet and plays, lies down on
//             his stomach with it, then gets up (each press once he's settled in the last)
//   button-X  the toolbar's X button pressed once (button-Run: he runs for 3 s), 3.5 s
//   floor     a tap on the floor in front of him
//   chase     four quick taps on him (he runs off), then a press that catches him mid-run (the
//             finger or cursor follows him until it's a grab), carries him a little and lets go
//   orbit     a drag across empty space (the camera turns: a finger, or the mouse's right
//             button), then a pinch or the wheel zooming in and out, then Reset Camera from
//             the Camera pad
//   turn      drags across empty space, one after another, until the camera has gone a whole
//             turn round him (whole frames: his shadow should keep its side on screen)
//   pan       the view slid across and up the screen (the mouse's left button on empty space,
//             or two fingers), turned (the right button, or one finger), zoomed in and out (the
//             wheel, or a pinch), slid back, then Reset Camera (whole frames)
//   lift      a press on his body held into a grab and carried up near the top of the screen,
//             across and back, held a moment and let go (the point grabbed stays under the
//             cursor: the report's `grip` says how far from it, CSS px, frame by frame)
//   sweep     where he looks over the whole screen: the cursor in rows across it, top to bottom
//             (desktop sizes), or a finger held still at a grid of spots (phone sizes: a moving
//             finger would turn the camera); whole frames
//   reach     a tap near the top of the screen, toward a corner: he walks all the way there
//             (whole frames); reach-turned, the same with the camera turned 90° first
//   rim       four quick taps on him (he runs off), then a tap on him every 0.8 s for 5 s,
//             which keeps him running to the play area's rim and along it (it should keep him
//             on screen), then a press that catches him and carries him a little
//   sitalone  no input until he sits by himself (20 s alone; the first 16 s aren't recorded:
//             needs --calm off), a little of him sitting, then a tap on him stands him up
//   envelope  the envelope that opens the page (?test&envelope; whole frames): on a phone, left
//             alone until its hint shows, then a swipe up; on a desktop, the cursor onto it (the
//             hint shows), then a click; it opens and fades and the intro starts by itself
//   envelope-skip  the same, skipped: a swipe down on a phone, a drag down on a desktop
//   intro     Replay Intro played through as a visitor would (tools/capture-invitation-intro.mjs):
//             each line typed and read, one finished early with a tap, a reply picked at the
//             question, the Log opened and closed partway, on to the end (whole frames)
//
// Files: <out>/<tag>-<act>-<W>x<H>.webp; <out>/<tag>-<act>-<W>x<H>-sheet.png (--sheet frames
// of the act, each a --crop CSS px square around him, the orbit act's whole frames, labelled
// with when it was drawn and his state then); <out>/<tag>-sheet-<W>x<H>.png (six whole frames
// an act); <out>/<tag>-<W>x<H>.json (each act's frames, the page's frame times while it ran,
// the states and clips he went through, with when, and `inFrame`: the closest his head, middle
// and feet came to the stage's sides and top and to the toolbar, CSS px, how far his root went
// from the play area's middle, and how far the camera turned, which the console says too; and
// `track`, those points, the camera's yaw, his root, his heading and his head's look, frame by
// frame, and `faces`, each change of his face, blinks too, with when); with --raw,
// <out>/<tag>-<act>-<W>x<H>-raw/NNN.png, the act's frames at the device's pixels (the WebP's,
// before they're scaled to the CSS size: one PNG a drawn frame, for crops that show every
// texel; Chrome runs a size at a time then, its screen at that size's DPR), listed in the
// report's `raw` with when each was drawn. --look, --pixel, --dither, --outlines and --motion
// set the Look menu first (its stored settings, invitation.look.v1; with --motion the report and
// the console say how many times a second his pose changed; --pixel is NEWT's sprite
// resolution, N or N×N such as 64 or 64x64, native (a texel a device pixel, the pixel look on)
// or off). --anim-fps sets every preset's animFps (choppy motion) in the page after each load,
// through the dev server's own looks/index.js module; nothing is written to the code.
// --seed and --calm go to the page's query (?calm is on unless --calm off). --lead keeps that
// many ms from before each act begins. --scale multiplies the CSS size of the output.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'node:fs';
import { createServer } from 'vite';
import { ORBIT } from '../src/invitation/camera.js';
import { cameraActs } from './capture-invitation-camera.mjs';
import { introActs } from './capture-invitation-intro.mjs';
import { frameTimes, grid, halfTurn, inFrame, keepRaw, latest, recorder } from './capture-invitation-record.mjs';
import { CLIP_NAMES, CLIPS } from '../src/invitation/clips.js';
import { PIXEL_SIZES } from '../src/invitation/pixels.js';

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
/** --pixel as a Pixel Size: 64, 64x64 and 64×64 are 64×64; native is Native; off is Off. */
const PIXEL = (() => {
  const raw = opt('pixel', null);
  if (raw === null) return null;
  const v = String(raw)
    .toLowerCase()
    .replace(/^(\d+)[x×]\1$/, '$1');
  if (!PIXEL_SIZES.includes(/** @type {any} */ (v)))
    throw new Error(`--pixel ${raw}: one of ${PIXEL_SIZES.join(', ')} (or N×N for a resolution)`);
  return v;
})();
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
const RAW = argv.includes('--raw');
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
/**
 * GPU Chrome; at `dpr` (--raw) one whose screen has that many pixels a CSS px, without which
 * the screencast hands over frames at the CSS size whatever the page's device pixel ratio.
 * @param {number} [dpr]
 */
const launch = (dpr) =>
  chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', ...(dpr ? [`--force-device-scale-factor=${dpr}`] : [])],
  });
const browser = RAW ? null : await launch();

const { realTime, resample, fit, tile } = recorder({ lead: LEAD, fps: FPS, scale: SCALE, crop: CROP, raw: RAW, sleep });

/**
 * The page loaded and NEWT in (`extra`: more of the query, such as `envelope`; the envelope
 * up over him then).
 * @param {any} page
 * @param {string} [extra]
 */
async function ready(page, extra) {
  const query = [
    'test',
    ...(CALM ? ['calm'] : []),
    ...(SEED !== null ? [`seed=${SEED}`] : []),
    ...(extra ? [extra] : []),
  ].join('&');
  await page.goto(`${origin}/invitation/?${query}`);
  await page.waitForSelector('[data-stage].is-ready', { timeout: 30_000 });
  if (extra === 'envelope') await page.waitForSelector('.inv-envelope', { timeout: 10_000 });
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
 * mouse on a desktop one (`button`: 'left' by default; the right one turns the camera); down,
 * move and up take client px.
 * @param {any} page
 * @param {{phone: boolean}} size
 * @param {'left'|'right'|'middle'} [button]
 */
async function presser(page, size, button = 'left') {
  if (!size.phone)
    return {
      down: async (p) => {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down({ button });
      },
      move: (p) => page.mouse.move(p.x, p.y),
      up: () => page.mouse.up({ button }),
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
/**
 * A drag on empty space, straight, with no hold first (a touch through CDP on a phone size; the
 * mouse's `button` on a desktop one: the right one turns the camera, the left one pans it).
 */
async function sweep(page, size, from, to, ms = 800, button = 'right') {
  const press = await presser(page, size, button);
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
 * Catches him mid-run: down on him, then after him for 0.2 s (a press that moves is a grab at
 * once), carried up and to the left a little, let go.
 */
async function catchHim(page, size) {
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
}
/**
 * Drags across empty space under him, one after another, until the camera has turned a whole
 * turn: each at most half the stage's width and only as long as the rest of the turn needs
 * (a drag across the whole width is camera.js ORBIT.turn of a turn), held still before the
 * lift so it doesn't coast past.
 */
async function wholeTurn(page, size) {
  const yaw = () => page.evaluate(() => window.__invitation.snapshot().camera.yaw);
  const pxPerTurn = size.w / ORBIT.turn;
  // (The page keeps the yaw within half a turn of zero, and a drag here turns it less than
  // that, so the turn so far adds up each drag's change.)
  let was = await yaw();
  let turned = 0;
  for (let i = 0; i < 6; i++) {
    const now = await yaw();
    turned += halfTurn(now - was);
    was = now;
    const left = 2 * Math.PI - Math.abs(turned);
    if (left < 0.05) return;
    const across = Math.min(size.w * 0.5, (left / (2 * Math.PI)) * pxPerTurn);
    const body = await point(page, 'body');
    const y = Math.min(size.h * 0.8, body.y + size.h * 0.2);
    const from = { x: size.w / 2 - across / 2, y };
    const press = await presser(page, size, 'right');
    await press.down(from);
    await along(press.move, (k) => ({ x: from.x + across * k, y }), 1000 * (across / (size.w * 0.5)));
    await sleep(150);
    await press.up();
    await press.done();
    await sleep(600);
  }
}

/**
 * The acts, each {name, run(page), tail ms, setup?(page) (before the recording starts), full?
 * (the act's sheet shows whole frames, not him cropped), from? (ms: the act's sheet starts
 * there, not at the lead)}.
 */
/**
 * The envelope's acts (`act` as actsFor's), when --acts asks for them.
 * @param {{w: number, h: number, phone: boolean}} size
 * @param {(name: string, run: (page: any) => Promise<unknown>, tail: number, more?: object) => void} act
 */
function envelopeActs(size, act) {
  if (!ACTS.includes('envelope') && !ACTS.includes('envelope-skip')) return;
  /** A drag from the middle of the screen `dy` px (up is negative), like a quick swipe. */
  const swipe = async (page, dy) => {
    const mid = { x: size.w / 2, y: size.h / 2 };
    const press = await presser(page, size);
    await press.down(mid);
    await along(press.move, (k) => ({ x: mid.x + 6 * k, y: mid.y + dy * k }), 380);
    await press.up();
    await press.done();
  };
  /** Left alone (a phone: the hint shows after a while), or the cursor brought onto it. */
  const approach = async (page) => {
    if (size.phone) return sleep(1700);
    const mid = { x: size.w / 2, y: size.h / 2 };
    const from = { x: size.w * 0.92, y: size.h * 0.92 };
    await page.mouse.move(from.x, from.y);
    await sleep(500);
    await along(
      (p) => page.mouse.move(p.x, p.y),
      (k) => ({ x: from.x + (mid.x - from.x) * k, y: from.y + (mid.y - from.y) * k }),
      600,
    );
    await sleep(1300);
  };
  if (ACTS.includes('envelope'))
    act(
      'envelope',
      async (page) => {
        await approach(page);
        if (size.phone) await swipe(page, -size.h * 0.3);
        else await page.mouse.click(size.w / 2, size.h / 2);
      },
      3500,
      { query: 'envelope', full: true },
    );
  if (ACTS.includes('envelope-skip'))
    act(
      'envelope-skip',
      async (page) => {
        await approach(page);
        await swipe(page, size.h * 0.3);
      },
      2000,
      { query: 'envelope', full: true },
    );
}

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
  // (What he feels from the hand, real speed: carry.js HAND, brain.js stress.)
  /** A press on his body held into a grab and lifted 60 px; then `then(press, lift)`, and let go. */
  const held = async (page, then) => {
    const from = await point(page, 'body');
    const lift = { x: from.x, y: from.y - 60 };
    const press = await presser(page, size);
    await press.down(from);
    await sleep(320); // (held past the 280 ms that makes it a grab)
    await along(press.move, (k) => ({ x: from.x, y: from.y + (lift.y - from.y) * k }), 300);
    await sleep(600);
    await then(press, lift);
    await press.up();
    await press.done();
  };
  const eased = (/** @type {number} */ k) => (1 - Math.cos(Math.PI * k)) / 2;
  if (ACTS.includes('flick'))
    act(
      'flick',
      (page) =>
        held(page, async (press, at) => {
          const d = Math.min(260, size.w * 0.3);
          await along(press.move, (k) => ({ x: at.x - d / 2 + d * eased(k), y: at.y }), 500);
          await sleep(1500);
        }),
      2500,
    );
  if (ACTS.includes('shake'))
    act(
      'shake',
      (page) =>
        held(page, async (press, at) => {
          await along(press.move, (k) => ({ x: at.x + 40 * Math.sin(2 * Math.PI * 5 * 1.6 * k), y: at.y }), 1600);
          await sleep(600);
        }),
      3500,
    );
  if (ACTS.includes('stroll'))
    act(
      'stroll',
      (page) =>
        held(page, async (press, at) => {
          await along(
            press.move,
            (k) => ({ x: at.x + 90 * Math.sin(1.2 * 8 * k), y: at.y - 40 * Math.sin(2 * 8 * k) }),
            8000,
          );
        }),
      3500,
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
  envelopeActs(size, act);
  if (ACTS.includes('buttons'))
    act(
      'buttons',
      async (page) => {
        for (const name of ['Wave', 'Sit', 'Device', 'Run']) {
          const b = page.locator(`[data-button="${name}"]`);
          if (size.phone) await b.tap();
          else await b.click();
          await sleep(1300);
        }
      },
      600,
    );
  if (ACTS.includes('device'))
    act(
      'device',
      async (page) => {
        const b = page.locator('[data-button="Device"]');
        const press = () => (size.phone ? b.tap() : b.click());
        for (const [want, stay] of [
          ['deviceSit', 2500],
          ['deviceLie', 3000],
          ['idle', 0],
        ]) {
          await press();
          if (!(await until(page, want, 15_000))) console.log(`  (device: he never got to ${want})`);
          await sleep(stay);
        }
      },
      800,
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
        await catchHim(page, size);
      },
      2400,
    );
  if (ACTS.includes('rim'))
    act(
      'rim',
      async (page) => {
        for (let i = 0; i < 4; i++) {
          await tapAt(page, size, await point(page, 'head'));
          await sleep(180);
        }
        // (A tap on him adds stress, which keeps him running, and puts the threat on the floor
        // past him from the camera, so he runs on toward the camera's side of the rim.)
        const t0 = Date.now();
        while (Date.now() - t0 < 5000) {
          await sleep(800);
          await tapAt(page, size, await point(page, 'head'));
        }
        await sleep(600);
        await catchHim(page, size);
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
        await page.locator('[data-camera-open]').click();
        await page.locator('[data-reset-camera]').click();
        await sleep(300);
        await page.locator('[data-camera-open]').click();
      },
      1600,
      { full: true },
    );
  if (ACTS.includes('turn')) act('turn', (page) => wholeTurn(page, size), 1200, { full: true });
  const more = cameraActs({ point, presser, sweep, pinch, along, sleep });
  if (ACTS.includes('pan')) act('pan', (page) => more.panTurnZoom(page, size), 1400, { full: true });
  if (ACTS.includes('lift')) act('lift', (page) => more.liftHigh(page, size), 2400);
  if (ACTS.includes('sweep')) act('sweep', (page) => more.lookSweep(page, size), 600, { full: true });
  more.addReach(act, ACTS, size);
  if (ACTS.includes('intro'))
    act('intro', (page) => introActs({ tapAt, sleep }).playIntro(page, size), 600, { full: true });
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
  const sized = RAW ? await launch(size.dpr) : null;
  const context = await (sized ?? browser).newContext({
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
  for (const { name, run, tail, setup, full, from, query } of actsFor(size)) {
    await ready(page, query);
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
    const seen = inFrame(taken.pos, taken.view);
    if (seen)
      console.log(
        `  in frame: ${seen.left} px from the left, ${seen.right} from the right, ${seen.top} from the top, ` +
          `his feet ${seen.toolbar} above the toolbar; root up to ${seen.farthest} u from the middle; ` +
          `camera turned ${seen.turned}° (${seen.widest}° at the most)`,
      );
    const faces = taken.faces.map((f) => `${f.face}@${f.t}`).join(' ');
    const most = Math.max(0, ...taken.stress.map((f) => f.stress));
    const said = taken.says.map((f) => `"${f.text}"@${f.t}`).join(' ');
    console.log(`  faces ${faces}; stress up to ${most}; said ${said || 'nothing'}`);
    if (taken.grip?.length)
      console.log(
        `  the grabbed point from the press: at most ${Math.max(...taken.grip)} px over ${taken.grip.length} moves; ` +
          `lifted to ${taken.end?.lift?.toFixed?.(2) ?? '?'} at the end`,
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
      inFrame: seen,
      // (Each frame: ms, his head, middle and feet, client px, the camera's yaw, his root's x, z,
      // his heading and his head's look yaw and pitch.)
      track: taken.pos,
      faces: taken.faces,
      stress: taken.stress,
      says: taken.says,
      ...(taken.grip ? { grip: taken.grip } : {}),
      ...(RAW ? { raw: await keepRaw(`${base}-raw`, shot) } : {}),
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
  await sized?.close();
}
await browser?.close();
await server?.close();
if (problems.length) console.log(`Problems:\n  ${problems.join('\n  ')}`);
