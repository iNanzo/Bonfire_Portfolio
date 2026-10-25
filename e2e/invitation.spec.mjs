// The invitation toy (/invitation/) in a real browser, on the production build: on a phone
// (390×844, touch) and a desktop (1280×800) it loads to ready with no errors and draws NEWT on his
// floor (not a blank canvas) in the Default look at 128×128 (2 device px texels on the phone); it's unlisted (noindex); a Look change (24×24:
// 4×4 CSS px texels) survives a reload, Pixel Size Native draws a texel a device pixel at a phone's
// full DPR with the pixel look on (and survives a reload), and Off draws smooth at the screen's
// resolution (its smooth face reported as such); and the portfolio's
// first load carries none of its code; the pixel atlas and face load alongside the glb and the
// first frame waits for them; the dialogue faces' sheets load too, and each of his eight faces
// shows on him by name. NEWT stands about a quarter of a phone's short side tall
// (a fifth of a desktop's), and running off to the rim never takes him off a phone's screen.
// Playing with him: a tap makes him wave or start, a touch
// drag holds him by the collar and letting go drops him (fall, then land), a finger on the floor
// turns his head, each button plays its clip (Replay Intro, Wave, Sit, Screen Time, Run, Camera
// and Settings: Phosphor icons beside their labels, a label shown on hover or focus with a mouse, on
// a press held still on touch), a floor tap walks him there, and the cursor turns his
// head on a desktop (down toward a cursor below him, up at one high over him, well round toward one
// level with his head off to the side), and running away he faces where he runs, not up at the
// viewer, glancing back over his shoulder. The camera: a finger's drag on empty
// space or the mouse's right-drag (on NEWT too, never holding him) turns it, the mouse's
// left-drag on empty space and two fingers pan it with the floor under the cursor (the pan stays
// put while he walks), the wheel and a two-finger pinch zoom it, the canvas shows no context
// menu, the Camera pad's buttons turn, tilt, zoom, follow him and reset it (Reset Camera clears
// the pan), and turned 90° a tap still reaches the screen's sides. The pixel cursors: an open hand
// over him, a closed one holding him or panning, the turn glyph orbiting, the pointing hand on
// the buttons (the carry itself, his collar under the cursor, is invitationCarry.spec.mjs's). He talks: clicked until he speaks, a line
// of the admin's types out in a bubble over his head, clear of the toolbar (and of the open Settings
// sheet, never over his face), heard whole by a screen reader, gone when its time is up, on its
// own time as talk counts it (a hidden tab pauses both); on a phone too, tapped, with the
// full-width sheet open, and lifted to the top of the screen (beside his head, never over him). A pinch over the toolbar or the Settings sheet never
// zooms the page, only the left mouse button holds or walks him, and the Settings sheet holds focus
// (Tab goes round inside it, the toolbar it covers is inert), closes on Escape wherever focus
// is, and leaves NEWT in sight above or beside it (Reset Camera too, on its way back). Every wait is on a state through `?test`'s window.__invitation, never on a duration (CI's
// software WebGL runs slower than real time), and touches are real ones (CDP
// Input.dispatchTouchEvent).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

/** Collect the page's errors (uncaught ones, console errors, failed requests) for the test to check. */
function watch(page, errors = []) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => {
    if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? '')) errors.push(`${r.failure()?.errorText}: ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}
/** The canvas, small and averaged over a few frames, as RGB. */
async function picture(page, frames = 3) {
  const sum = new Float64Array(36 * 64 * 3);
  for (let i = 0; i < frames; i++) {
    const png = await page.locator('[data-stage] canvas').screenshot();
    const raw = await sharp(png).resize(36, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    for (let k = 0; k < raw.length; k++) sum[k] += raw[k] / frames;
    await page.waitForTimeout(120);
  }
  return sum;
}
/**
 * NEWT and a little round him (from his head to his feet on screen), small and averaged over a
 * few frames, as RGB: a change to his look, not diluted by the plain floor round him.
 */
async function newtPicture(page, frames = 3) {
  const head = await page.evaluate(() => window.__invitation.screen('head'));
  const feet = await page.evaluate(() => window.__invitation.screen('feet'));
  const h = Math.max(40, feet.y - head.y) * 1.5;
  const clip = { x: head.x - h / 2, y: head.y - h * 0.3, width: h, height: h * 1.2 };
  const sum = new Float64Array(24 * 30 * 3);
  for (let i = 0; i < frames; i++) {
    const raw = await sharp(await page.screenshot({ clip }))
      .resize(24, 30, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
    for (let k = 0; k < raw.length; k++) sum[k] += raw[k] / frames;
    await page.waitForTimeout(120);
  }
  return sum;
}
/** How far apart two pictures are (the mean difference per channel). */
const apart = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
/**
 * The floor ring round `at` (client px, within `half` of it), from a screenshot in grey: the dark
 * runs across and down through its middle (px each), its width (px) and how many of its pixels
 * are in-between greys (neither floor nor ink: an edge's falloff).
 */
async function ringRuns(page, at, half) {
  const clip = { x: at.x - half, y: at.y - half, width: 2 * half, height: 2 * half };
  const { data, info } = await sharp(await page.screenshot({ clip }))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = (x, y) => data[(y * w + x) * info.channels];
  const floor = Math.max(px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1));
  let ink = 255;
  for (let i = 0; i < w * h; i++) ink = Math.min(ink, data[i * info.channels]);
  const dark = (x, y) => px(x, y) < (floor + ink) / 2;
  const box = [w, h, -1, -1];
  let greys = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = px(x, y);
      if (v > ink + 0.2 * (floor - ink) && v < floor - 0.2 * (floor - ink)) greys++;
      if (!dark(x, y)) continue;
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  const runs = (cells) =>
    (
      cells
        .map((d) => (d ? 1 : 0))
        .join('')
        .match(/1+/g) ?? []
    ).map((r) => r.length);
  const cx = Math.round((box[0] + box[2]) / 2);
  const cy = Math.round((box[1] + box[3]) / 2);
  return {
    across: runs(Array.from({ length: w }, (_, x) => dark(x, cy))),
    down: runs(Array.from({ length: h }, (_, y) => dark(cx, y))),
    width: box[2] - box[0] + 1,
    greys,
  };
}
/** A picture of one flat colour: the mean of `pic`. */
function flat(pic) {
  const mean = [0, 1, 2].map((c) => pic.filter((_, i) => i % 3 === c).reduce((s, v) => s + v, 0) / (pic.length / 3));
  return pic.map((_, i) => mean[i % 3]);
}
async function ready(page, path = '/invitation/?test') {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
}
const snapshot = (page) => page.evaluate(() => window.__invitation.snapshot());
/** A point on NEWT (client px): 'head' or 'body'. */
const on = (page, part) => page.evaluate((p) => window.__invitation.screen(p), part);
/** Where a client point meets the floor (world units), or null. */
const floorAt = (page, p) => page.evaluate(({ x, y }) => window.__invitation.floorAt(x, y), p);
/** Waits until `pred(snapshot)` holds (states, never durations). */
const until = (page, pred, message, timeout = 20_000) =>
  expect.poll(async () => pred(await snapshot(page)), { message, timeout }).toBe(true);
/** Ready, calm (no wandering, no sitting by himself) and standing still in idle. */
async function calm(page) {
  await ready(page, '/invitation/?test&calm&seed=3');
  await until(page, (s) => s.state === 'idle' && s.clip === 'Idle', 'idle');
}
/** Real touches through CDP: `touch(type, [{x, y, id}])`. */
async function toucher(page) {
  const cdp = await page.context().newCDPSession(page);
  return (type, points = []) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id ?? 1, radiusX: 2, radiusY: 2, force: 1 })),
    });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Waits until the page has drawn frames for `ms` of its own clock, and one more (for a check
 * that something did not happen: a slow software-rendered frame still counts its time).
 */
const framesFor = (page, ms) =>
  page.evaluate(
    (span) =>
      new Promise((done) => {
        const t0 = performance.now();
        const tick = (t) => (t - t0 >= span ? requestAnimationFrame(() => done()) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    ms,
  );
/**
 * NEWT's head, middle and feet on screen (client px), and whether the page shows him there: the
 * canvas, not the Settings sheet or the toolbar over it.
 */
const inView = (page) =>
  page.evaluate(() => {
    const out = {};
    for (const part of ['head', 'body', 'feet']) {
      const p = window.__invitation.screen(part);
      out[part] = {
        x: Math.round(p.x),
        y: Math.round(p.y),
        seen: document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS',
      };
    }
    return out;
  });
const allSeen = (v) => v.head.seen && v.body.seen && v.feet.seen;
/**
 * Turns the camera with the Camera pad's Turn Left, `turns` × 45° from where it is, and closes
 * the pad once it has come round.
 */
async function turnLeft(page, turns, press = (l) => l.tap()) {
  if (!turns) return;
  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await press(camera);
  const from = (await snapshot(page)).camera.yaw;
  for (let i = 0; i < turns; i++) await press(page.getByRole('button', { name: 'Turn Left' }));
  await until(
    page,
    (s) => Math.abs(Math.abs(s.camera.yaw - from) - (turns * Math.PI) / 4) < 0.01 && !s.camera.turning,
    `turned ${turns * 45}°`,
  );
  await press(camera);
  await expect(page.locator('#inv-camera')).toBeHidden();
}
/**
 * How far past the play area's rim each spot of an 11×11 grid over the stage (above the toolbar)
 * meets the floor, world units (0 or less: in reach).
 */
async function pastRim(page) {
  const { area } = await snapshot(page);
  const stage = await page.locator('[data-stage]').boundingBox();
  const bar = await page.locator('.inv-toolbar').boundingBox();
  const spots = await page.evaluate(
    ({ x0, y0, w, h }) => {
      const out = [];
      for (let j = 0; j <= 10; j++)
        for (let i = 0; i <= 10; i++) out.push(window.__invitation.floorAt(x0 + (i * w) / 10, y0 + (j * h) / 10));
      return out;
    },
    { x0: stage.x + 2, y0: stage.y + 2, w: stage.width - 4, h: bar.y - stage.y - 4 },
  );
  const c = { x: (area.minX + area.maxX) / 2, z: (area.minZ + area.maxZ) / 2 };
  return { area, past: spots.map((f) => (f ? Math.hypot(f.x - c.x, f.z - c.z) - area.r : Infinity)) };
}
/**
 * A tap on the floor at `at` (client px, near the top of the stage): he walks straight down the
 * screen from the finger to where his whole head shows under the stage's top, and stops there
 * (area.js tapReach: the play area stops short of the top by his height there). A touch, or
 * `tap`'s. Returns his feet on screen once he's there.
 */
async function topTap(page, at, where, tap = (p) => page.touchscreen.tap(p.x, p.y)) {
  const stage = await page.locator('[data-stage]').boundingBox();
  await tap(at);
  await until(page, (s) => s.state === 'walk', `${where}: walking`);
  await until(page, (s) => s.state === 'idle', `${where}: there`, 90_000);
  const head = await on(page, 'head');
  const feet = await page.evaluate(() => window.__invitation.screen('feet'));
  expect(head.y - head.r, `${where}: his whole head on the screen`).toBeGreaterThanOrEqual(stage.y);
  expect(feet.y, `${where}: short of the finger, lower down the screen`).toBeGreaterThan(at.y + 20);
  // (He stops within TUNE.arrive, 0.1, of where he walks to: a few px at the back.)
  expect(Math.abs(feet.x - at.x), `${where}: his feet straight down from the finger`).toBeLessThan(16);
  return feet;
}
/** A tap on the floor at `at` (client px) walks him all the way to the point under the finger. */
async function tapReaches(page, at, where) {
  const goal = await floorAt(page, at);
  await page.touchscreen.tap(at.x, at.y);
  await until(page, (s) => s.state === 'walk', `${where}: walking`);
  await until(
    page,
    (s) => s.state === 'idle' && Math.hypot(s.pos.x - goal.x, s.pos.z - goal.z) < 0.12,
    `${where}: there`,
    90_000,
  );
}
/** Opens the Settings sheet and waits until NEWT shows whole beside or above it. */
async function lookOpenWithNewtInSight(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  let last = null;
  await expect
    .poll(async () => allSeen((last = await inView(page))), {
      message: 'his head, middle and feet in sight with the Settings sheet open',
    })
    .toBe(true);
  return last;
}
/**
 * The speech bubble as it's drawn now, with what it keeps clear of, client px: its rect, his
 * head, the toolbar's, the open Settings sheet's (null while it's shut) and the stage's; whether it
 * waits out of sight (is-away) and the way its tail points.
 */
const bubbleAt = (page) =>
  page.evaluate(() => {
    const rect = (e) => {
      if (!e || e.hidden) return null;
      const r = e.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const el = document.querySelector('[data-stage] .inv-bubble');
    return {
      box: rect(el),
      away: !el || el.hidden || el.classList.contains('is-away'),
      tail: el?.dataset.tail ?? null,
      head: window.__invitation.screen('head'),
      bar: rect(document.querySelector('.inv-toolbar')),
      sheet: rect(document.querySelector('.inv-sheet')),
      stage: rect(document.querySelector('[data-stage]')),
    };
  });
/** Whether two client rects overlap. */
const overlaps = (a, b) =>
  Boolean(a && b) && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/**
 * His bones (from his root) every frame the page draws for `ms`: how many frames, how many of
 * them showed a new pose, the seconds it took, and his feet's spread each frame (world units).
 */
const poses = (page, ms) =>
  page.evaluate(
    (span) =>
      new Promise((done) => {
        const inv = window.__invitation;
        let last = '';
        const out = { frames: 0, changes: 0, secs: 0, spread: [] };
        const t0 = performance.now();
        const tick = () => {
          const b = inv.bones();
          const key = JSON.stringify(b);
          out.frames++;
          if (key !== last) out.changes++;
          last = key;
          out.spread.push(Math.hypot(b.FootL.x - b.FootR.x, b.FootL.z - b.FootR.z));
          out.secs = (performance.now() - t0) / 1000;
          if (out.secs * 1000 < span) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

/**
 * Records every Pixel Size the page saves (invitation.look.v1), in order, in window.__saved:
 * call before the page loads.
 */
const recordSaves = (page) =>
  page.addInitScript(() => {
    window.__saved = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'invitation.look.v1') window.__saved.push(JSON.parse(value).pixelSize);
      return set.call(this, key, value);
    };
  });
/** The Settings sheet's scroll: how far down it is and how far it can go, CSS px. */
const sheetScroll = (page) =>
  page.locator('.inv-sheet').evaluate((el) => ({ top: el.scrollTop, room: el.scrollHeight - el.clientHeight }));
/**
 * A real finger swiping straight up from the Pixel Size slider's track, well away from its thumb
 * (144 px in 12 moves), with the Settings sheet open. Returns the slider's value text before it.
 */
async function swipeUpFromSlider(page) {
  const pixel = page.getByRole('dialog', { name: 'Settings' }).getByRole('slider', { name: 'Pixel Size' });
  const before = await pixel.getAttribute('aria-valuetext');
  const at = await pixel.evaluate((el) => Number(el.value) / Number(el.max));
  const box = await pixel.boundingBox();
  const x = box.x + box.width * (at < 0.5 ? 0.9 : 0.1);
  const y = box.y + box.height / 2;
  const touch = await toucher(page);
  await touch('touchStart', [{ x, y }]);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x, y: y - i * 12 }]);
    await sleep(16);
  }
  await touch('touchEnd');
  return before;
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('loads to ready with no errors, draws NEWT, and is unlisted', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page).toHaveTitle('Invitation');
    const snap = await snapshot(page);
    expect(snap.ready).toBe(true);
    // 128×128 by default (the Default look): NEWT about 128 texels tall, a texel 2 device px
    // (two thirds of a CSS px) here, 149 texels.
    expect(snap.resolution).toBe(128);
    expect(snap.pixelScale, 'a texel is 2 device px').toBeCloseTo(2 / 3, 6);
    expect(snap.newtTexels).toBeCloseTo(149.2, 0);
    // Not a blank canvas: NEWT on the plain background, far from one flat colour.
    const pic = await picture(page);
    expect(apart(pic, flat(pic))).toBeGreaterThan(3);
    // NEWT stands where the hooks say, clear of the screen's edges, about a quarter of the
    // phone's short side tall (99 CSS px of its 390).
    const head = await page.evaluate(() => window.__invitation.screen('head'));
    const box = await page.locator('[data-stage]').boundingBox();
    expect(head.x).toBeGreaterThan(box.x + 24);
    expect(head.x).toBeLessThan(box.x + box.width - 24);
    expect(snap.newtTall / 390, `NEWT is ${snap.newtTall.toFixed(1)} CSS px tall`).toBeCloseTo(0.255, 2);
    // The toolbar: every button a thumb's height, named by its label (an icon beside it; on a
    // phone only the icon shows), the data-* hooks kept, and no tooltips.
    for (const [name, hook] of [
      ['Replay Intro', '[data-intro]'],
      ['Wave', '[data-button="Wave"]'],
      ['Sit', '[data-button="Sit"]'],
      ['Screen Time', '[data-button="Device"]'],
      ['Run', '[data-button="Run"]'],
      ['Camera', '[data-camera-open]'],
      ['Settings', '[data-look-open]'],
    ]) {
      const b = page.getByRole('button', { name, exact: true });
      await expect(b).toBeVisible();
      await expect(page.locator(hook)).toHaveAccessibleName(name);
      const size = await b.boundingBox();
      expect(size.height, name).toBeGreaterThanOrEqual(44);
      expect(size.width, name).toBeGreaterThanOrEqual(40);
      await expect(b.locator('svg.inv-icon')).toBeVisible();
      // (A Phosphor glyph, 24 px in the button's text colour.)
      const glyph = await b.locator('svg.inv-icon').boundingBox();
      expect([Math.round(glyph.width), Math.round(glyph.height)], `${name}: a 24 px glyph`).toEqual([24, 24]);
      expect(
        await b.locator('.inv-btn-label').evaluate((el) => Number(getComputedStyle(el).opacity)),
        `${name}: icon only`,
      ).toBe(0);
    }
    await expect(page.locator('[data-button="Spook"], [data-button="Wander"]')).toHaveCount(0);
    await expect(page.locator('[title]')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('with Pixel Shirt on (and Pixel Face, every style’s own), the pixel atlas and the pixel face load alongside the glb, and the first frame waits for them', async ({
    page,
  }) => {
    const errors = watch(page);
    await page.addInitScript(() =>
      localStorage.setItem('invitation.look.v1', JSON.stringify({ shader: { pixelShirt: true } })),
    );
    /** @type {number|null} when the glb was let through (it's held a while, as on a slow phone) */
    let glbAt = null;
    const asked = {};
    await page.route('**/models/newt.glb', async (route) => {
      await sleep(1000);
      glbAt = Date.now();
      await route.continue();
    });
    await page.route(/\/models\/newt-(atlas-pixel|face)\.png$/, async (route) => {
      const name = /newt-[a-z-]+\.png/.exec(route.request().url())[0];
      asked[name] = { at: Date.now(), glbThen: glbAt };
      // Held until a while after the glb: the page doesn't draw until they're in.
      while (glbAt === null) await sleep(20);
      await sleep(Math.max(0, glbAt + 600 - Date.now()));
      asked[name].readyBefore = await page.evaluate(() =>
        document.querySelector('[data-stage]').classList.contains('is-ready'),
      );
      await route.continue();
    });
    await ready(page);
    expect(Object.keys(asked).sort()).toEqual(['newt-atlas-pixel.png', 'newt-face.png']);
    for (const [name, a] of Object.entries(asked)) {
      expect(a.glbThen, `${name} asked for while the glb was still on its way`).toBeNull();
      expect(a.readyBefore, `the first frame waited for ${name}`).toBe(false);
    }
    expect(errors).toEqual([]);
  });

  test('with the default look (Pixel Face on, Pixel Shirt off) the first frame waits for the pixel face, never for the pixel atlas, and NEWT wears his real plaid and his pixel face', async ({
    page,
  }) => {
    const errors = watch(page);
    /** @type {number|null} when the glb was let through (it's held a while, as on a slow phone) */
    let glbAt = null;
    /** @type {boolean|null} whether the page had drawn by the time the pixel atlas was let through */
    let drawnFirst = null;
    /** @type {boolean|null} whether it had drawn by the time the pixel face was let through */
    let faceLate = null;
    await page.route('**/models/newt.glb', async (route) => {
      await sleep(1000);
      glbAt = Date.now();
      await route.continue();
    });
    await page.route(/\/models\/newt-face\.png$/, async (route) => {
      // Held until a while after the glb: the page doesn't draw until it's in.
      while (glbAt === null) await sleep(20);
      await sleep(Math.max(0, glbAt + 600 - Date.now()));
      faceLate = await page.evaluate(() => document.querySelector('[data-stage]').classList.contains('is-ready'));
      await route.continue();
    });
    await page.route(/\/models\/newt-atlas-pixel\.png$/, async (route) => {
      // (Held until the page draws, or 8 s: it never waits on it.)
      const t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        const drawn = await page
          .evaluate(() => document.querySelector('[data-stage]')?.classList.contains('is-ready'))
          .catch(() => false);
        if (drawn) break;
        await sleep(50);
      }
      drawnFirst ??= await page
        .evaluate(() => document.querySelector('[data-stage]')?.classList.contains('is-ready'))
        .catch(() => false);
      await route.continue();
    });
    await ready(page);
    await expect.poll(() => drawnFirst).not.toBeNull();
    expect(drawnFirst, 'drawn before the pixel atlas came').toBe(true);
    expect(faceLate, 'the first frame waited for the pixel face').toBe(false);
    const snap = await snapshot(page);
    expect(snap.atlas).toBe('original');
    expect(typeof snap.faceSheet, `a pixel face sheet (${snap.faceSheet})`).toBe('number');
    expect(snap.shader.pixelShirt).toBe(false);
    expect(snap.shader.pixelFace).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the dialogue faces: their two sheets come from beside the glb without holding up the first frame, and face() shows each of the eight on him, on the pixel sheet his size picks', async ({
    page,
  }) => {
    const errors = watch(page);
    /** @type {string[]} the dialogue sheets asked for */
    const asked = [];
    page.on('requestfinished', (r) => {
      const m = /models\/(newt-face(?:-smooth)?-extra\.png)$/.exec(r.url());
      if (m) asked.push(m[1]);
    });
    const drawn = () =>
      page.evaluate(() => document.querySelector('[data-stage]')?.classList.contains('is-ready')).catch(() => false);
    /** @type {boolean[]} whether the page had drawn by the time each sheet was let through */
    const drawnFirst = [];
    await page.route(/\/models\/newt-face(?:-smooth)?-extra\.png$/, async (route) => {
      // (Held until the page draws, or 8 s: it never waits on them.)
      const t0 = Date.now();
      while (Date.now() - t0 < 8000 && !(await drawn())) await sleep(50);
      drawnFirst.push(await drawn());
      await route.continue();
    });
    await calm(page);
    await expect.poll(() => [...asked].sort()).toEqual(['newt-face-extra.png', 'newt-face-smooth-extra.png']);
    expect(drawnFirst, 'drawn before either sheet came').toEqual([true, true]);
    for (const name of ['neutral', 'happy', 'surprised', 'blink', 'sad', 'angry', 'shy', 'smug']) {
      expect(await page.evaluate((n) => window.__invitation.face(n), name)).toBe(true);
      await until(page, (s) => s.faceShown === name, `${name} on his face`);
      const snap = await snapshot(page);
      expect(snap.face).toBe(name);
      expect(typeof snap.faceSheet, `${name}: a pixel face sheet (${snap.faceSheet})`).toBe('number');
    }
    expect(await page.evaluate(() => window.__invitation.face('grumpy'))).toBe(false);
    expect(await page.evaluate(() => window.__invitation.face(null))).toBe(false);
    await until(page, (s) => s.face === 'neutral' || s.face === 'blink', 'the brain’s face again');
    expect(errors).toEqual([]);
  });

  test('with Pixel Face off at 32×32 his smooth face still has its eyes: dark texels inside it, between his cheeks', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('invitation.look.v1', JSON.stringify({ pixelSize: '32', shader: { pixelFace: false } })),
    );
    await calm(page);
    const snap = await snapshot(page);
    expect(snap.faceSheet).toBe('smooth');
    const dpr = snap.pass.pd / snap.pixelScale;
    const canvas = await page.locator('[data-stage] canvas').boundingBox();
    /**
     * Dark texels inside his face (between skin on either side), in the middle half of its rows:
     * each texel read at its middle (the canvas's grid, `pd` device px a texel from its corner).
     */
    const eyes = async () => {
      const head = await on(page, 'head');
      const clip = { x: Math.round(head.x - 18), y: Math.round(head.y - 14), width: 36, height: 36 };
      const { data, info } = await sharp(await page.screenshot({ clip }))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { pd } = snap.pass;
      const at = (i, j) => {
        const x = Math.floor(canvas.x * dpr + (i + 0.5) * pd - clip.x * dpr);
        const y = Math.floor(canvas.y * dpr + (j + 0.5) * pd - clip.y * dpr);
        return x >= 0 && y >= 0 && x < info.width && y < info.height
          ? [0, 1, 2].map((c) => data[(y * info.width + x) * 3 + c])
          : null;
      };
      const i0 = Math.ceil((clip.x * dpr - canvas.x * dpr) / pd);
      const j0 = Math.ceil((clip.y * dpr - canvas.y * dpr) / pd);
      const skin = ([r, g, b]) => r > 190 && g > 120 && r - b > 40;
      const rows = [];
      for (let j = j0; at(i0, j); j++) {
        const row = [];
        for (let i = i0; at(i, j); i++) row.push(at(i, j));
        if (row.filter(skin).length >= 3) rows.push(row);
      }
      let dark = 0;
      for (const row of rows.slice(Math.floor(rows.length / 4), Math.ceil((rows.length * 3) / 4))) {
        const isSkin = row.map(skin);
        for (let x = isSkin.indexOf(true) + 1; x < isSkin.lastIndexOf(true); x++) {
          const [r, g, b] = row[x];
          if (!isSkin[x] && 0.299 * r + 0.587 * g + 0.114 * b < 80) dark++;
        }
      }
      return dark;
    };
    let most = 0;
    for (let i = 0; i < 3; i++) {
      most = Math.max(most, await eyes());
      await framesFor(page, 200);
    }
    // (His pupils and lashes: 5 or 6 dark texels a frame; the mip it was sampled at before left
    // their olive smudge, and the hair's 2 or 3.)
    expect(most, `dark texels in his face at ${dpr}×`).toBeGreaterThanOrEqual(4);
  });

  test('a Look change shows at once and survives a reload', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    const before = await picture(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet).toBeVisible();
    // Pixel Size, a slider: from the coarse end one step finer by the keyboard, 24×24 (NEWT about
    // 24 texels tall: 12 device px, 4 CSS px a texel here).
    const pixel = sheet.getByRole('slider', { name: 'Pixel Size' });
    await expect(pixel).toHaveAttribute('aria-valuetext', '128 by 128');
    // A first visit starts on the Default style, never Custom.
    const styles = sheet.getByRole('group', { name: 'Style' });
    await expect(styles.getByRole('radio').first()).toHaveAccessibleName('Default');
    await expect(styles.getByRole('radio', { name: 'Default' })).toBeChecked();
    await expect(styles.getByRole('radio', { name: 'Custom' })).toBeDisabled();
    await pixel.focus();
    await page.keyboard.press('Home');
    await expect(pixel).toHaveAttribute('aria-valuetext', '16 by 16');
    await page.keyboard.press('ArrowRight');
    await expect(pixel).toHaveAttribute('aria-valuetext', '24 by 24');
    await expect(sheet.locator('[data-pixel-value]')).toHaveText('24×24');
    await expect.poll(async () => (await snapshot(page)).resolution).toBe(24);
    const coarse = await snapshot(page);
    expect(coarse.pixelScale).toBe(4);
    expect(coarse.newtTexels).toBeCloseTo(24.9, 0);
    await sheet.getByRole('group', { name: 'Style' }).getByRole('radio', { name: 'DS' }).check();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    const changed = await picture(page);
    expect(apart(before, changed)).toBeGreaterThan(2);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(sheet.getByRole('slider', { name: 'Pixel Size' })).toHaveAttribute('aria-valuetext', '24 by 24');
    expect((await snapshot(page)).resolution).toBe(24);
    expect((await snapshot(page)).pixelScale).toBe(4);
    await expect(sheet.getByRole('group', { name: 'Style' }).getByRole('radio', { name: 'DS' })).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('Pixel Size Native, the step before Off, draws a texel a device pixel (a third of a CSS px here) with the pixel look on, and survives a reload', async ({
    page,
  }) => {
    const errors = watch(page);
    await ready(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    const pixel = sheet.getByRole('slider', { name: 'Pixel Size' });
    await pixel.focus();
    await page.keyboard.press('End');
    await expect(pixel).toHaveAttribute('aria-valuetext', 'Off');
    await page.keyboard.press('ArrowLeft');
    await expect(pixel).toHaveAttribute('aria-valuetext', 'Native');
    await expect(sheet.locator('[data-pixel-value]')).toHaveText('Native');
    await expect(sheet.locator('[data-pixel-note]')).toHaveText(
      'NEWT is about 298 pixels tall: every pixel this screen has.',
    );
    // 256×256 is already a device pixel a texel here: it's Native, so the step before is 128×128.
    await page.keyboard.press('ArrowLeft');
    await expect(pixel).toHaveAttribute('aria-valuetext', '128 by 128');
    await page.keyboard.press('ArrowRight');
    await expect(pixel).toHaveAttribute('aria-valuetext', 'Native');
    await expect.poll(async () => (await snapshot(page)).resolution).toBe('native');
    const snap = await snapshot(page);
    expect(snap.pixelScale, 'a texel a device pixel: no DPR cap').toBeCloseTo(1 / 3, 6);
    expect(snap.newtTexels).toBeCloseTo(298, 0);
    // The pixel look stays on: Dithering and Outlines still apply, no Off hint, the canvas is
    // every device pixel of the stage, stretched nearest.
    await expect(sheet.getByRole('switch', { name: 'Dithering' })).toBeEnabled();
    await expect(sheet.getByRole('switch', { name: 'Outlines' })).toBeEnabled();
    await expect(sheet.locator('[data-off-hint]')).toBeHidden();
    const canvas = await page
      .locator('[data-stage] canvas')
      .evaluate((c) => [c.width, c.height, getComputedStyle(c).imageRendering]);
    expect(canvas).toEqual([1170, 2532, 'pixelated']);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('invitation.look.v1') ?? '{}').pixelSize)).toBe(
      'native',
    );
    expect((await snapshot(page)).resolution).toBe('native');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(sheet.getByRole('slider', { name: 'Pixel Size' })).toHaveAttribute('aria-valuetext', 'Native');
    expect(errors).toEqual([]);
  });

  test('Motion Choppy steps his pose at most about 15 times a second, Smooth every frame, and it stays for the next visit', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const smooth = await poses(page, 1200);
    expect(smooth.changes, `Smooth: ${smooth.changes} new poses in ${smooth.frames} frames`).toBeGreaterThanOrEqual(
      0.8 * smooth.frames,
    );
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await sheet.getByRole('radio', { name: 'Choppy', exact: true }).check();
    await sheet.getByRole('button', { name: 'Done' }).click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('invitation.look.v1') ?? '{}'));
    expect(stored.motion).toBe('choppy');
    const choppy = await poses(page, 1500);
    const rate = choppy.changes / choppy.secs;
    expect(rate, `Choppy: ${choppy.changes} new poses in ${choppy.secs.toFixed(2)} s`).toBeLessThanOrEqual(16.5);
    expect(rate, 'he still moves').toBeGreaterThan(2);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(sheet.getByRole('radio', { name: 'Choppy', exact: true })).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('play() forces Walk and Run as they play: his feet go round the step, not one frozen pose', async ({ page }) => {
    await calm(page);
    for (const clip of ['Walk', 'Run']) {
      expect(await page.evaluate((c) => window.__invitation.play(c), clip)).toBe(true);
      await until(page, (s) => s.clip === clip, clip);
      const { spread } = await poses(page, 1200);
      const swing = Math.max(...spread) - Math.min(...spread);
      expect(swing, `${clip}: his feet's spread changes by ${swing.toFixed(3)}`).toBeGreaterThan(0.08);
    }
    await page.evaluate(() => window.__invitation.play(null));
  });

  test('tapping NEWT plays Wave or Spook', async ({ page }) => {
    const errors = watch(page);
    await calm(page);
    const head = await on(page, 'head');
    await page.touchscreen.tap(head.x, head.y);
    await until(page, (s) => s.state === 'react' && ['Wave', 'Spook'].includes(s.reaction), 'reacting');
    await until(page, (s) => ['Wave', 'Spook'].includes(s.clip), 'playing Wave or Spook');
    await until(page, (s) => s.state === 'idle', 'back to idle', 30_000);
    expect(errors).toEqual([]);
  });

  test('a touch drag holds him by the collar, and letting go gives fall, then land', async ({ page }) => {
    const errors = watch(page);
    await calm(page);
    const touch = await toucher(page);
    const from = await on(page, 'body');
    await touch('touchStart', [from]);
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', [{ x: from.x + i * 4, y: from.y - i * 9 }]);
      await sleep(16);
    }
    await until(page, (s) => s.state === 'held' && s.held, 'held');
    expect((await snapshot(page)).lift).toBeGreaterThan(0.1); // off the floor
    await touch('touchEnd');
    await until(page, (s) => s.state === 'idle' || s.state === 'flee', 'down again', 30_000);
    const states = (await snapshot(page)).states;
    expect(states.slice(states.lastIndexOf('held'), states.lastIndexOf('held') + 3)).toEqual(['held', 'fall', 'land']);
    expect(errors).toEqual([]);
  });

  test('lifted by a finger to the top of the screen, his head stays on it, and a line he says goes beside his head, never over his body', async ({
    page,
  }) => {
    await calm(page);
    const touch = await toucher(page);
    const from = await on(page, 'body');
    await touch('touchStart', [from]);
    for (let i = 1; i <= 16; i++) {
      await touch('touchMove', [{ x: from.x, y: from.y + ((70 - from.y) * i) / 16 }]);
      await sleep(16);
    }
    await until(page, (s) => s.held, 'held');
    await framesFor(page, 500);
    const head = await on(page, 'head');
    expect(head.y - head.r, 'the top of his head on the screen').toBeGreaterThanOrEqual(0);
    await page.evaluate(() => window.__invitation.say('Whoa there, up we go now!'));
    let at = null;
    await expect.poll(async () => !(at = await bubbleAt(page)).away, { message: 'placed' }).toBe(true);
    // Off all of him: his head and the line from it down to his feet.
    const feet = await on(page, 'feet');
    for (let k = 0; k <= 20; k++) {
      const p = { x: at.head.x + ((feet.x - at.head.x) * k) / 20, y: at.head.y + ((feet.y - at.head.y) * k) / 20 };
      const dot = { left: p.x - 1, top: p.y - 1, right: p.x + 1, bottom: p.y + 1 };
      expect(
        overlaps(at.box, dot),
        `off him at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}): ${JSON.stringify(at.box)}`,
      ).toBe(false);
    }
    expect(['left', 'right']).toContain(at.tail);
    expect(at.box.top).toBeGreaterThanOrEqual(at.stage.top);
    expect(at.box.left).toBeGreaterThanOrEqual(at.stage.left);
    expect(at.box.right).toBeLessThanOrEqual(at.stage.right);
    expect(overlaps(at.box, at.bar), 'clear of the toolbar').toBe(false);
    await touch('touchEnd');
  });

  test('tapped until he says something, the line types out over his head, clear of the toolbar, and in the stage', async ({
    page,
  }) => {
    const inv = JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8')).invitation ?? {};
    const tapped = ['wave', 'spook', 'flee'].some((k) => inv.speech?.[k]?.chance > 0 && inv.lines?.[k]?.length);
    test.skip(!tapped, 'the admin has a tap on him say nothing');
    await calm(page);
    const touch = await toucher(page);
    for (let i = 0; i < 10 && !(await snapshot(page)).talk.showing; i++) {
      const head = await on(page, 'head');
      await touch('touchStart', [head]);
      await touch('touchEnd');
      await until(page, (s) => s.state !== 'idle' || Boolean(s.talk.showing), 'reacting');
      await until(page, (s) => s.state === 'idle' || Boolean(s.talk.showing), 'back to idle', 30_000);
    }
    const { showing } = (await snapshot(page)).talk;
    expect(showing, 'he said something').toBeTruthy();
    await expect(page.locator('.inv-bubble-live')).toHaveText(`NEWT: ${showing.line}`);
    let at = null;
    await expect.poll(async () => !(at = await bubbleAt(page)).away, { message: 'placed' }).toBe(true);
    expect(at.tail).toBe('down');
    expect(at.box.bottom, 'over his head').toBeLessThan(at.head.y - at.head.r);
    expect(at.box.left).toBeLessThan(at.head.x);
    expect(at.box.right).toBeGreaterThan(at.head.x);
    expect(overlaps(at.box, at.bar), 'clear of the toolbar').toBe(false);
    expect(at.box.left).toBeGreaterThanOrEqual(at.stage.left);
    expect(at.box.right).toBeLessThanOrEqual(at.stage.right);
    expect(at.box.top).toBeGreaterThanOrEqual(at.stage.top);
  });

  test('with the Settings sheet open (a full-width sheet along the bottom), a line goes over his head above it, clear of the sheet and off his face', async ({
    page,
  }) => {
    await calm(page);
    await lookOpenWithNewtInSight(page);
    await page.evaluate(() => window.__invitation.say('A line long enough to wrap onto a second row on a phone.'));
    let at = null;
    await expect.poll(async () => !(at = await bubbleAt(page)).away, { message: 'placed' }).toBe(true);
    expect(at.sheet, 'the sheet is open').toBeTruthy();
    expect(at.sheet.left, 'the sheet runs the width of the screen').toBeLessThanOrEqual(at.stage.left + 1);
    expect(overlaps(at.box, at.sheet), 'clear of the open Settings sheet').toBe(false);
    const face = {
      left: at.head.x - at.head.r,
      top: at.head.y - at.head.r,
      right: at.head.x + at.head.r,
      bottom: at.head.y + at.head.r,
    };
    expect(overlaps(at.box, face), 'never over his face').toBe(false);
    expect(at.box.top).toBeGreaterThanOrEqual(at.stage.top);
    expect(at.box.left).toBeGreaterThanOrEqual(at.stage.left);
    expect(at.box.right).toBeLessThanOrEqual(at.stage.right);
  });

  test('a finger on the floor turns his head toward it, left and then right', async ({ page }) => {
    await calm(page);
    const touch = await toucher(page);
    const body = await on(page, 'body');
    for (const [side, ok] of [
      [-1, (s) => s.headYaw < -0.15],
      [1, (s) => s.headYaw > 0.15],
    ]) {
      await touch('touchStart', [{ x: body.x + side * 140, y: body.y + 40 }]);
      await until(page, ok, `his head turned ${side < 0 ? 'left' : 'right'}`);
      // (A press held this long is no floor tap: 650 ms of the page's own clock from once it's
      // seen the press, as a slow software-rendered frame can hold its handler back.)
      await framesFor(page, 650);
      await touch('touchEnd');
    }
    expect((await snapshot(page)).state).toBe('idle');
  });

  test('each button plays its clip', async ({ page }) => {
    const errors = watch(page);
    await calm(page);
    const press = (name) => page.locator(`[data-button="${name}"]`).tap();
    await press('Wave');
    await until(page, (s) => s.clip === 'Wave', 'Wave');
    await press('Sit');
    await until(page, (s) => s.clip === 'Sit' && s.state === 'sit', 'sitting', 30_000);
    // (Sit reads Stand while he sits: its label and its icon change, the button stays.)
    const sit = page.locator('[data-button="Sit"]');
    await expect(sit).toHaveText('Stand');
    await expect(sit).toHaveAccessibleName('Stand');
    await expect(sit.locator('svg.inv-icon')).toHaveCount(1);
    await press('Sit');
    await until(page, (s) => s.clip === 'StandUp', 'standing up');
    await expect(sit).toHaveText('Sit');
    await until(page, (s) => s.state === 'idle', 'up');
    await press('Device');
    await until(page, (s) => s.button === 'Device', 'Screen Time goes to the brain as Device');
    await expect(page.locator('[data-button="Device"]')).toHaveText(/^(Screen Time|Lie Down|Get Up)$/);
    await press('Run');
    await until(page, (s) => s.state === 'flee' && s.clip === 'Run', 'running', 30_000);
    // Wander is a setting now: a switch in Settings, kept for the next visit.
    await page.getByRole('button', { name: 'Settings' }).tap();
    const wander = page.getByRole('dialog', { name: 'Settings' }).getByRole('switch', { name: 'Wander' });
    await wander.scrollIntoViewIfNeeded();
    const before = (await snapshot(page)).wander;
    await expect(wander).toBeChecked({ checked: before });
    await wander.tap();
    await until(page, (s) => s.wander === !before, 'Wander toggled');
    await expect(wander).toBeChecked({ checked: !before });
    expect(await page.evaluate(() => localStorage.getItem('invitation.wander.v1'))).toBe(String(!before));
    expect(errors).toEqual([]);
  });

  test('running off to the rim never takes him off the screen: the run keeps to what the screen shows', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const box = await page.locator('[data-stage]').boundingBox();
    const bar = await page.locator('.inv-toolbar').boundingBox();
    await page.locator('[data-button="Run"]').tap();
    await until(page, (s) => s.state === 'flee', 'running');
    // Every frame of the run: his head, middle and feet on the screen, over the toolbar.
    const seen = await page.evaluate(
      () =>
        new Promise((done) => {
          const inv = window.__invitation;
          const out = [];
          const t0 = inv.clock();
          const tick = () => {
            const s = inv.snapshot();
            out.push({
              head: inv.screen('head'),
              body: inv.screen('body'),
              feet: inv.screen('feet'),
              state: s.state,
              r: Math.hypot(s.pos.x, s.pos.z),
            });
            // The scene clamps long frames, so wall time is not animation time.
            if (inv.clock() - t0 < 3.5) requestAnimationFrame(tick);
            else done(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(Math.max(...seen.map((f) => f.r)), 'he got out to the rim').toBeGreaterThan(1.6);
    for (const [i, f] of seen.entries()) {
      for (const part of ['head', 'body', 'feet']) {
        expect(f[part].x, `frame ${i}: his ${part} across`).toBeGreaterThan(box.x);
        expect(f[part].x, `frame ${i}: his ${part} across`).toBeLessThan(box.x + box.width);
      }
      expect(f.head.y, `frame ${i}: his head under the top`).toBeGreaterThan(box.y);
      expect(f.feet.y, `frame ${i}: his feet over the toolbar`).toBeLessThan(bar.y);
    }
    expect(errors).toEqual([]);
  });

  test('a floor tap walks him there', async ({ page }) => {
    await calm(page);
    const body = await on(page, 'body');
    const at = { x: body.x + 90, y: body.y + 110 };
    const goal = await floorAt(page, at);
    expect(goal).not.toBeNull();
    await page.touchscreen.tap(at.x, at.y);
    await until(page, (s) => s.state === 'walk', 'walking');
    await until(
      page,
      (s) => s.state === 'idle' && Math.hypot(s.pos.x - goal.x, s.pos.z - goal.z) < 0.25,
      'there',
      30_000,
    );
  });

  test('a two-finger pinch zooms the camera, and never taps or grabs him', async ({ page }) => {
    await calm(page);
    const touch = await toucher(page);
    const body = await on(page, 'body');
    const { camera } = await snapshot(page);
    const at = (d) => [
      { x: body.x - d, y: body.y + 160, id: 1 },
      { x: body.x + d, y: body.y + 160, id: 2 },
    ];
    await touch('touchStart', at(40));
    for (let d = 50; d <= 150; d += 10) {
      await touch('touchMove', at(d));
      await sleep(16);
    }
    await touch('touchEnd');
    await until(page, (s) => s.camera.distance < camera.distance * 0.8, 'zoomed in');
    const s = await snapshot(page);
    expect(s.state).toBe('idle');
    expect(s.states).not.toContain('walk');
    expect(s.states).not.toContain('held');
  });

  test('two fingers dragging together pan the view, and never tap or grab him', async ({ page }) => {
    await calm(page);
    const touch = await toucher(page);
    const body = await on(page, 'body');
    const before = await snapshot(page);
    const at = (dy) => [
      { x: body.x - 60, y: body.y + 150 + dy, id: 1 },
      { x: body.x + 60, y: body.y + 150 + dy, id: 2 },
    ];
    const grabbed = await floorAt(page, { x: body.x, y: body.y + 150 });
    await touch('touchStart', at(0));
    // (Up 60 px: within the pan's region on a phone, past which it gives like a rubber band.)
    for (let dy = -5; dy >= -60; dy -= 5) {
      await touch('touchMove', at(dy));
      await sleep(16);
    }
    await framesFor(page, 100);
    // The floor that was under their middle is still under it, give or take a finger's wobble.
    const now = await floorAt(page, { x: body.x, y: body.y + 90 });
    expect(Math.hypot(now.x - grabbed.x, now.z - grabbed.z), 'the floor went with the fingers').toBeLessThan(0.15);
    await touch('touchEnd');
    const s = await snapshot(page);
    expect(s.camera.panned).toBe(true);
    expect(Math.abs(s.camera.yaw - before.camera.yaw), 'not turned').toBeLessThan(0.01);
    expect(s.state).toBe('idle');
    expect(s.states).not.toContain('walk');
    expect(s.states).not.toContain('held');
  });

  test('a two-finger pinch over the toolbar or the Settings sheet never zooms the page', async ({ page }) => {
    await calm(page);
    const touch = await toucher(page);
    /** Two fingers spreading across the middle of `box`, then a moment for the page to settle. */
    const spread = async (box) => {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const at = (d) => [
        { x: x - d, y, id: 1 },
        { x: x + d, y, id: 2 },
      ];
      await touch('touchStart', at(20));
      for (let d = 30; d <= 150; d += 10) {
        await touch('touchMove', at(d));
        await sleep(16);
      }
      await touch('touchEnd');
      await sleep(400);
    };
    const scale = () => page.evaluate(() => window.visualViewport.scale);
    await spread(await page.locator('.inv-toolbar').boundingBox());
    expect(await scale(), 'the page after a pinch over the toolbar').toBe(1);
    await page.getByRole('button', { name: 'Settings' }).click();
    await spread(await page.locator('.inv-sheet').boundingBox());
    expect(await scale(), 'the page after a pinch over the Settings sheet').toBe(1);
  });

  test('a swipe up that starts on the Pixel Size slider leaves the Pixel Size as it was', async ({ page }) => {
    await recordSaves(page);
    await calm(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet).toBeVisible();
    const was = (await snapshot(page)).resolution;
    const before = await swipeUpFromSlider(page);
    await framesFor(page, 300);
    await expect(sheet.getByRole('slider', { name: 'Pixel Size' })).toHaveAttribute('aria-valuetext', before);
    expect(await page.evaluate(() => window.__saved), 'nothing saved').toEqual([]);
    expect((await snapshot(page)).resolution).toBe(was);
  });

  test('the Shader options by touch: a swipe up from the Colors slider scrolls the sheet and leaves it be, a drag along it sets it', async ({
    page,
  }) => {
    await calm(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    const colors = sheet.getByRole('slider', { name: 'Colors' });
    await colors.scrollIntoViewIfNeeded();
    const was = (await snapshot(page)).shader.levels;
    const before = await colors.getAttribute('aria-valuetext');
    const top = (await sheetScroll(page)).top;
    const box = await colors.boundingBox();
    const touch = await toucher(page);
    const x = box.x + box.width * 0.5;
    const y = box.y + box.height / 2;
    await touch('touchStart', [{ x, y }]);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', [{ x, y: y - i * 12 }]);
      await sleep(16);
    }
    await touch('touchEnd');
    await expect.poll(async () => (await sheetScroll(page)).top, 'the sheet scrolled').not.toBe(top);
    await framesFor(page, 200);
    await expect(colors).toHaveAttribute('aria-valuetext', before);
    expect((await snapshot(page)).shader.levels).toBe(was);
    expect((await snapshot(page)).custom).toBe(false);
    // Along it, to its coarse end: Colors 4.
    await colors.scrollIntoViewIfNeeded();
    const at = await colors.boundingBox();
    const yy = at.y + at.height / 2;
    await touch('touchStart', [{ x: at.x + at.width * 0.6, y: yy }]);
    for (let i = 1; i <= 16; i++) {
      await touch('touchMove', [{ x: at.x + at.width * 0.6 - (i * at.width) / 16, y: yy }]);
      await sleep(16);
    }
    await touch('touchEnd');
    await expect(colors).toHaveAttribute('aria-valuetext', '4 levels');
    await expect.poll(async () => (await snapshot(page)).pass.levels).toBe(4);
    expect((await snapshot(page)).custom).toBe(true);
  });

  test('with the Settings sheet open NEWT stays in sight above it, so its changes show on him', async ({ page }) => {
    await calm(page);
    const v = await lookOpenWithNewtInSight(page);
    const sheet = await page.locator('.inv-sheet').boundingBox();
    expect(v.feet.y, 'his feet over the sheet').toBeLessThan(sheet.y);
    expect(v.head.y, 'his head on the screen').toBeGreaterThan(0);
  });

  test('icons only on a phone: a press held still on a button shows its label as a tab and does nothing else; a quick tap still acts', async ({
    page,
  }) => {
    await calm(page);
    const touch = await toucher(page);
    const wave = page.locator('[data-button="Wave"]');
    const label = wave.locator('.inv-btn-label');
    const box = await wave.boundingBox();
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const shown = () => label.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(await shown(), 'icon only to begin with').toBe(0);
    // Held still: the label comes up as a tab over the button; let go, nothing else happens.
    await touch('touchStart', [mid]);
    await expect(wave).toHaveClass(/is-label/, { timeout: 5_000 });
    await expect.poll(shown, { message: 'the label shows' }).toBeGreaterThan(0.9);
    const tab = await label.boundingBox();
    expect(tab.y + tab.height, 'a tab over the button').toBeLessThanOrEqual(box.y + 2);
    await touch('touchEnd');
    await framesFor(page, 400);
    let s = await snapshot(page);
    expect(s.button, 'the press after a held label does nothing').toBeNull();
    expect(s.clip).toBe('Idle');
    // (No menu or callout on the bar either.)
    const menu = await wave.evaluate((el) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(menu, 'no long-press menu').toBe(true);
    // The tab goes again, and a quick tap acts as ever.
    await expect.poll(shown, { message: 'the label goes', timeout: 10_000 }).toBe(0);
    await touch('touchStart', [mid]);
    await touch('touchEnd');
    await until(page, (t) => t.clip === 'Wave', 'a tap waves');
    s = await snapshot(page);
    expect(s.button).toBe('Wave');
  });

  test('the Camera pad opens over the stage without moving the bar or the play area, and turned 90° with it a tap near either side of the screen walks him there', async ({
    page,
  }) => {
    await calm(page);
    const bar = await page.locator('.inv-toolbar').boundingBox();
    const area = (await snapshot(page)).area;
    const camera = page.getByRole('button', { name: 'Camera', exact: true });
    await camera.tap();
    await expect(camera).toHaveAttribute('aria-expanded', 'true');
    const pad = page.locator('#inv-camera');
    await expect(pad).toBeVisible();
    const padBox = await pad.boundingBox();
    expect(padBox.y + padBox.height, 'over the stage, above the bar').toBeLessThanOrEqual(bar.y + 1);
    expect(await page.locator('.inv-toolbar').boundingBox(), 'the bar where it was').toEqual(bar);
    await framesFor(page, 100);
    expect((await snapshot(page)).area, 'the play area as it was').toEqual(area);
    // Two turns of 45°: a quarter of the way round.
    const home = (await snapshot(page)).camera;
    await page.getByRole('button', { name: 'Turn Left' }).tap();
    await until(
      page,
      (s) => Math.abs(Math.abs(s.camera.yaw - home.yaw) - Math.PI / 4) < 0.01 && !s.camera.turning,
      '45°',
    );
    await page.getByRole('button', { name: 'Turn Left' }).tap();
    await until(
      page,
      (s) => Math.abs(Math.abs(s.camera.yaw - home.yaw) - Math.PI / 2) < 0.01 && !s.camera.turning,
      '90°',
    );
    await camera.tap();
    await expect(pad).toBeHidden();
    // Near each side, at his height on screen: he walks there, never stopping at a wall short of it.
    const stage = await page.locator('[data-stage]').boundingBox();
    for (const side of [-1, 1]) {
      const body = await on(page, 'body');
      const at = { x: side < 0 ? stage.x + 40 : stage.x + stage.width - 40, y: body.y + 30 };
      const goal = await floorAt(page, at);
      await page.touchscreen.tap(at.x, at.y);
      await until(page, (s) => s.state === 'walk', 'walking');
      await until(
        page,
        (s) => s.state === 'idle' && Math.hypot(s.pos.x - goal.x, s.pos.z - goal.z) < 0.25,
        `there, by the ${side < 0 ? 'left' : 'right'} side`,
        30_000,
      );
    }
  });

  test('a pan stays put while he walks, until he is tapped', async ({ page }) => {
    await calm(page);
    const touch = await toucher(page);
    const body = await on(page, 'body');
    const at = (dx) => [
      { x: body.x - 60 + dx, y: body.y + 150, id: 1 },
      { x: body.x + 60 + dx, y: body.y + 150, id: 2 },
    ];
    await touch('touchStart', at(0));
    for (let dx = -8; dx >= -80; dx -= 8) {
      await touch('touchMove', at(dx));
      await sleep(16);
    }
    await touch('touchEnd');
    await until(page, (s) => s.camera.panned, 'panned');
    await framesFor(page, 300);
    const put = (await snapshot(page)).camera.target;
    // A floor tap a little off to the side walks him there; the view stays where it was put.
    const goal = { x: body.x + 70, y: body.y + 60 };
    await page.touchscreen.tap(goal.x, goal.y);
    await until(page, (s) => s.state === 'walk', 'walking');
    await until(page, (s) => s.state === 'idle', 'there', 30_000);
    const s = await snapshot(page);
    expect(s.camera.panned, 'still panned').toBe(true);
    expect(Math.hypot(s.camera.target.x - put.x, s.camera.target.z - put.z), 'the view stayed put').toBeLessThan(1e-3);
    // A tap on him ends the pan: the view takes him again.
    const head = await on(page, 'head');
    await page.touchscreen.tap(head.x, head.y);
    await until(page, (t) => !t.camera.panned, 'the pan over');
  });

  test('the play area fills the screen: every spot of floor it shows is in reach at the default zoom, turned 0°, 45° and 90°; the URL bar showing leaves him be, and a tap at the top walks him as far as keeps his head on the screen and one under that all the way there, turned too', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await calm(page);
    for (const turns of [0, 1, 2]) {
      await turnLeft(page, turns ? 1 : 0);
      const { area, past } = await pastRim(page);
      expect(area.r, 'a disc').toBeGreaterThan(0);
      expect(Math.max(...past), `turned ${turns * 45}°: every spot in reach`).toBeLessThanOrEqual(0.1);
    }
    // The URL bar showing (the stage a little shorter): the play area's worked out again, and he
    // isn't moved.
    const was = await snapshot(page);
    await page.setViewportSize({ width: 390, height: 788 });
    await until(page, (s) => s.area.r !== was.area.r, 'the play area worked out again');
    await framesFor(page, 300);
    const now = await snapshot(page);
    expect(Math.hypot(now.pos.x - was.pos.x, now.pos.z - was.pos.z), 'not moved').toBeLessThan(1e-6);
    await page.setViewportSize({ width: 390, height: 844 });
    await until(page, (s) => s.area.r === was.area.r, 'back as it was');
    // Turned 90°, then not turned: a tap near the top, toward a corner, walks him straight down
    // from the finger to where his whole head shows; one a little under where he stopped, toward
    // the other side, walks him all the way to the finger.
    for (const turned of [true, false]) {
      if (!turned) await calm(page);
      const stage = await page.locator('[data-stage]').boundingBox();
      const where = `at the top${turned ? ', turned 90°' : ''}`;
      const feet = await topTap(page, { x: stage.x + stage.width * 0.2, y: stage.y + 30 }, where);
      await tapReaches(
        page,
        { x: stage.x + stage.width * 0.7, y: feet.y + 12 },
        `just under that${turned ? ', turned 90°' : ''}`,
      );
    }
  });

  test('a top tap after walking to the back still reaches as high as keeps his head on the screen: the view stays on the middle, so his feet end straight down from the finger, turned 90° too', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    for (const turned of [false, true]) {
      await calm(page);
      if (turned) await turnLeft(page, 2);
      const stage = await page.locator('[data-stage]').boundingBox();
      const home = (await snapshot(page)).camera;
      expect(home.fits, 'the play area fits the screen at the default zoom').toBe(true);
      // To the back first (the top left corner), then along the top (its middle).
      for (const [what, at] of [
        ['the top left corner', { x: stage.x + 30, y: stage.y + 30 }],
        ['the top middle', { x: stage.x + stage.width / 2, y: stage.y + 30 }],
      ]) {
        const where = `${what}${turned ? ', turned 90°' : ''}`;
        await topTap(page, at, where);
        const s = await snapshot(page);
        expect(
          Math.hypot(s.camera.target.x - home.target.x, s.camera.target.z - home.target.z),
          `${where}: the view stayed on the middle`,
        ).toBeLessThan(1e-3);
      }
    }
  });
});

test.describe('on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('a swipe up that starts on the Pixel Size slider scrolls the sheet and leaves the Pixel Size be; a drag along it still passes every step', async ({
    page,
  }) => {
    await recordSaves(page);
    await calm(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet).toBeVisible();
    const pixel = sheet.getByRole('slider', { name: 'Pixel Size' });
    expect((await sheetScroll(page)).room, 'the sheet scrolls on a phone held sideways').toBeGreaterThan(40);
    const was = (await snapshot(page)).resolution;
    const before = await swipeUpFromSlider(page);
    await expect.poll(async () => (await sheetScroll(page)).top, 'the sheet scrolled').toBeGreaterThan(40);
    await framesFor(page, 300);
    await expect(pixel, 'the slider kept its value').toHaveAttribute('aria-valuetext', before);
    expect(await page.evaluate(() => window.__saved), 'nothing saved').toEqual([]);
    expect((await snapshot(page)).resolution).toBe(was);
    // A drag along it from its coarse end (the sheet back at its top, the slider out from under
    // its head): every step on the way is the Pixel Size in turn, and the sheet stays where it is.
    await page.locator('.inv-sheet').evaluate((el) => (el.scrollTop = 0));
    await pixel.focus();
    await page.keyboard.press('Home');
    await expect(pixel).toHaveAttribute('aria-valuetext', '16 by 16');
    await page.evaluate(() => (window.__saved.length = 0));
    const top = (await sheetScroll(page)).top;
    const box = await pixel.boundingBox();
    const y = box.y + box.height / 2;
    const touch = await toucher(page);
    await touch('touchStart', [{ x: box.x + 14, y }]);
    for (let i = 1; i <= 32; i++) {
      await touch('touchMove', [{ x: box.x + 14 + (i * (box.width - 18)) / 32, y }]);
      await sleep(16);
    }
    await touch('touchEnd');
    await expect(pixel).toHaveAttribute('aria-valuetext', 'Off');
    const saved = await page.evaluate(() => window.__saved.filter((v, i, a) => v !== a[i - 1]));
    const max = Number(await pixel.getAttribute('max'));
    expect(saved, 'every step after 16×16, in turn').toHaveLength(max);
    expect(saved.at(-1)).toBe('off');
    expect(saved.at(-2)).toBe('native');
    expect((await sheetScroll(page)).top, 'the sheet stayed put').toBe(top);
  });

  test('scrolled to its end the Settings sheet keeps Done in reach, and Settings beside it closes it', async ({
    page,
  }) => {
    await calm(page);
    const look = page.getByRole('button', { name: 'Settings' });
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    const touch = await toucher(page);
    /** A real tap on the middle of `button`, when the page shows it there. */
    const tap = async (button) => {
      const shown = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, hit: Boolean(at && el.contains(at)) };
      });
      expect(shown.hit, `${await button.textContent()} shows at its middle`).toBe(true);
      // Queue both events before waiting: a CDP round trip under software WebGL can
      // exceed HOLD_MS and turn an intended tap into the toolbar's long press.
      await Promise.all([touch('touchStart', [shown]), touch('touchEnd')]);
    };
    for (const close of ['Done', 'Settings']) {
      await look.click();
      await expect(sheet).toBeVisible();
      await page.locator('.inv-sheet').evaluate((el) => (el.scrollTop = el.scrollHeight));
      await expect.poll(async () => (await sheetScroll(page)).top, 'scrolled to its end').toBeGreaterThan(40);
      await expect(sheet.getByRole('switch', { name: 'Wander' })).toBeInViewport();
      // Its head, Done with it, stays at its top; Settings, pressed beside it, closes it too.
      await tap(close === 'Done' ? sheet.getByRole('button', { name: 'Done' }) : look);
      await expect(sheet, `${close} closed it`).toBeHidden();
      await expect(look).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('with the Settings sheet open NEWT stays in sight beside it', async ({ page }) => {
    await calm(page);
    const v = await lookOpenWithNewtInSight(page);
    const sheet = await page.locator('.inv-sheet').boundingBox();
    const beside = v.head.x < sheet.x || v.head.x > sheet.x + sheet.width;
    expect(beside, `his head at x ${v.head.x}, the sheet from ${sheet.x} to ${sheet.x + sheet.width}`).toBe(true);
  });
});

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a window resize works the play area out again: every spot of floor in reach at 1280×800, turned too; smaller, it shrinks under him and he walks back inside, no jump, and the view comes back to the middle', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await calm(page);
    for (const turns of [0, 1, 2]) {
      await turnLeft(page, turns ? 1 : 0, (l) => l.click());
      const { past } = await pastRim(page);
      expect(Math.max(...past), `turned ${turns * 45}°: every spot in reach`).toBeLessThanOrEqual(0.1);
    }
    // Near the top-left corner of the screen: he walks as near there as keeps his head on the
    // screen.
    const stage = await page.locator('[data-stage]').boundingBox();
    await topTap(page, { x: stage.x + 12, y: stage.y + 12 }, 'the top-left corner', (p) => page.mouse.click(p.x, p.y));
    const there = (await snapshot(page)).pos;
    const far = Math.hypot(there.x, there.z);
    // Every frame from here, where he is and the play area's size.
    await page.evaluate(() => {
      window.__trail = [];
      const tick = () => {
        const s = window.__invitation.snapshot();
        window.__trail.push({ x: s.pos.x, z: s.pos.z, r: s.area.r, state: s.state });
        if (window.__trail.length < 3000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // (Small enough that the play area shrinks under him: his head kept on the screen, he's about
    // 5.9 out, and 540×540's play area is about 5.4.)
    await page.setViewportSize({ width: 540, height: 540 });
    await until(page, (s) => s.area.r < far - 0.2, 'the play area shrunk under him');
    await until(page, (s) => Math.hypot(s.pos.x, s.pos.z) <= s.area.r + 1e-6, 'back inside it', 30_000);
    const trail = await page.evaluate(() => window.__trail);
    const steps = trail.slice(1).map((q, i) => Math.hypot(q.x - trail[i].x, q.z - trail[i].z));
    expect(Math.max(...steps), 'eased back in, never in a jump').toBeLessThan(0.2);
    const out = trail.filter((q) => Math.hypot(q.x, q.z) > q.r + 0.05);
    expect(out.length, 'outside it for a few frames on the way in').toBeGreaterThan(2);
    expect(out.filter((q) => q.state === 'walk').length, 'walking back in, not slid').toBeGreaterThan(2);
    // Back on what the smaller screen shows, the view comes back to the play area's middle.
    await until(
      page,
      (s) => s.state === 'idle' && s.camera.fits && Math.hypot(s.camera.target.x, s.camera.target.z) < 0.02,
      'the view back on the middle',
      30_000,
    );
  });

  test('loads to ready with no errors and draws', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    const snap = await snapshot(page);
    // 128×128 by default: NEWT 156 CSS px tall, so a texel is a device pixel here (128×128 is
    // Native on this screen) and he's 156 texels tall.
    expect(snap.resolution).toBe('native');
    expect(snap.pixelScale).toBe(1);
    expect(snap.newtTexels).toBeCloseTo(156, 0);
    // (The frame-time governor is off under ?test unless ?govern asks for it: the specs measure the grid.)
    expect(snap.pass.governor).toEqual({ on: false, level: 0, p90: 0 });
    expect(snap.pass.zoom).toBe(1);
    expect(
      snap.newtTall / 800,
      `NEWT is ${snap.newtTall.toFixed(1)} CSS px tall: a fifth of the short side`,
    ).toBeCloseTo(0.195, 2);
    const pic = await picture(page);
    expect(apart(pic, flat(pic))).toBeGreaterThan(3);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('Pixel Size Off, one press at the slider’s end, draws smooth at the screen’s resolution', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    // (The buttons at its ends say what they set.)
    await expect(sheet.getByRole('button', { name: 'Pixel Size 16 by 16', exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Pixel Size Off', exact: true }).click();
    await expect(sheet.getByRole('slider', { name: 'Pixel Size' })).toHaveAttribute('aria-valuetext', 'Off');
    await expect.poll(async () => (await snapshot(page)).pixelScale).toBe(1);
    expect((await snapshot(page)).resolution).toBeNull();
    // (The smooth face shows at Off, and the snapshot says so: not the pixel sheet his size picks.)
    expect((await snapshot(page)).faceSheet).toBe('smooth');
    const size = await page
      .locator('[data-stage] canvas')
      .evaluate((c) => [c.width, c.height, Math.min(devicePixelRatio, 2), innerWidth, innerHeight]);
    expect(size[0]).toBe(Math.ceil(size[3] * size[2]));
    expect(size[1]).toBe(Math.ceil(size[4] * size[2]));
  });

  test('a first sweep of Pixel Size to Off and back, and every Shader option moved, link no new shaders: both paths are warmed once NEWT is in', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__links = 0;
      const link = WebGL2RenderingContext.prototype.linkProgram;
      WebGL2RenderingContext.prototype.linkProgram = function (program) {
        window.__links++;
        return link.call(this, program);
      };
    });
    await calm(page);
    await until(page, (s) => s.warmed, 'both paths warmed');
    await page.getByRole('button', { name: 'Settings' }).click();
    const pixel = page.getByRole('dialog', { name: 'Settings' }).getByRole('slider', { name: 'Pixel Size' });
    await pixel.focus();
    await page.keyboard.press('Home');
    await framesFor(page, 100);
    const before = await page.evaluate(() => window.__links);
    const max = Number(await pixel.getAttribute('max'));
    for (const key of ['ArrowRight', 'ArrowLeft'])
      for (let i = 0; i < max; i++) {
        await page.keyboard.press(key);
        await framesFor(page, 60);
        if (key === 'ArrowRight' && i === max - 1) await expect(pixel).toHaveAttribute('aria-valuetext', 'Off');
      }
    await expect(pixel).toHaveAttribute('aria-valuetext', '16 by 16');
    expect((await page.evaluate(() => window.__links)) - before, 'shaders linked during the sweep').toBe(0);
    // Every Shader option moved, end to end, its choices and switches each way: uniforms and the
    // toon ramp's texels only, never a new program.
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    for (const slider of await sheet.locator('input[type="range"][data-shader]').all()) {
      await slider.focus();
      for (const key of ['End', 'Home']) {
        await page.keyboard.press(key);
        await framesFor(page, 40);
      }
    }
    for (const radio of await sheet.locator('input[type="radio"][data-shader]').all()) {
      await radio.check({ force: true });
      await framesFor(page, 40);
    }
    for (const box of await sheet.locator('input[type="checkbox"][data-shader]').all())
      for (let i = 0; i < 2; i++) {
        await box.click({ force: true });
        await framesFor(page, 40);
      }
    expect((await snapshot(page)).custom, 'the options moved').toBe(true);
    expect((await page.evaluate(() => window.__links)) - before, 'shaders linked moving the Shader options').toBe(0);
  });

  test('the Shader options: a control changes NEWT at once, the Style row turns Custom, a reload keeps it, Reset To Style brings the style back, and another Style clears it', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const look = page.getByRole('button', { name: 'Settings' });
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    const style = sheet.getByRole('group', { name: 'Style' });
    const own = (await snapshot(page)).shader;
    const before = await newtPicture(page);
    await look.click();
    await expect(style.getByRole('radio', { name: 'Default' })).toBeChecked();
    await expect(style.getByRole('radio', { name: 'Custom' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Reset To Style' })).toBeDisabled();
    /** A slider by its name, moved by the keyboard. */
    const keys = async (name, ...presses) => {
      const slider = sheet.getByRole('slider', { name });
      await slider.focus();
      for (const key of presses) await page.keyboard.press(key);
      return slider;
    };
    const colors = await keys('Colors', 'Home');
    await expect(colors).toHaveAttribute('aria-valuetext', '4 levels');
    await expect.poll(async () => (await snapshot(page)).pass.levels, 'Colors reach the pass').toBe(4);
    await keys('Outline Strength', 'Home');
    await expect.poll(async () => (await snapshot(page)).pass.outline).toBe(0);
    await sheet.getByRole('radiogroup', { name: 'Toon Shading' }).getByRole('radio', { name: '4 Bands' }).check();
    await sheet.getByRole('radiogroup', { name: 'Shadow' }).getByRole('radio', { name: 'Hard' }).check();
    await expect.poll(async () => (await snapshot(page)).pass.shadeSoft, 'a hard shadow edge').toBe(0);
    const angle = await keys('Light Angle', ...Array(6).fill('ArrowRight'));
    await expect(angle).toHaveAttribute('aria-valuetext', '90 degrees');
    await expect.poll(async () => (await snapshot(page)).pass.turn, 'the light turned round him').toBe(90);
    await expect(style.getByRole('radio', { name: 'Custom' })).toBeChecked();
    await expect(style.getByRole('radio', { name: 'Default' })).not.toBeChecked();
    const custom = await snapshot(page);
    expect(custom.custom).toBe(true);
    expect(custom.shader).toEqual({ ...own, levels: 4, outline: 0, bands: '4', edge: 'hard', turn: 90 });
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    expect(apart(before, await newtPicture(page)), 'NEWT looks different').toBeGreaterThan(6);
    // A reload keeps the changes, and only they are stored.
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('invitation.look.v1') ?? '{}'));
    expect(stored.style).toBe('default');
    expect(stored.shader).toEqual({ levels: 4, outline: 0, bands: '4', edge: 'hard', turn: 90 });
    expect((await snapshot(page)).shader).toEqual(custom.shader);
    expect((await snapshot(page)).pass.levels).toBe(4);
    await look.click();
    await expect(style.getByRole('radio', { name: 'Custom' })).toBeChecked();
    await expect(sheet.getByRole('slider', { name: 'Colors' })).toHaveAttribute('aria-valuetext', '4 levels');
    // Reset To Style: Default's own values again, and focus on it (the button it was on rests now),
    // without the sheet jumping away from the Shader controls the user was at.
    // (Scrolled so Reset To Style sits just under the sheet's sticky header, the Style row out
    // of sight above it, as when the user has been at the Shader controls.)
    await page.locator('.inv-sheet').evaluate((el) => {
      const head = /** @type {HTMLElement} */ (el.querySelector('.inv-sheet-head'));
      const reset = /** @type {HTMLElement} */ (el.querySelector('[data-shader-reset]'));
      const top = reset.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      el.scrollTop = top - head.offsetHeight - 8;
    });
    const scrolled = (await sheetScroll(page)).top;
    expect(scrolled).toBeGreaterThan(40);
    await sheet.getByRole('button', { name: 'Reset To Style' }).click();
    expect(Math.abs((await sheetScroll(page)).top - scrolled)).toBeLessThan(2);
    await expect(style.getByRole('radio', { name: 'Default' })).toBeChecked();
    await expect(style.getByRole('radio', { name: 'Default' })).toBeFocused();
    await expect(style.getByRole('radio', { name: 'Custom' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Reset To Style' })).toBeDisabled();
    expect((await snapshot(page)).shader).toEqual(own);
    expect((await snapshot(page)).custom).toBe(false);
    await expect(sheet.getByRole('slider', { name: 'Colors' })).toHaveAttribute(
      'aria-valuetext',
      `${own.levels} levels`,
    );
    // A change, then another Style: that style's own values, the change cleared.
    await keys('Saturation', 'Home');
    await expect(style.getByRole('radio', { name: 'Custom' })).toBeChecked();
    await style.getByRole('radio', { name: 'Soft' }).check();
    await expect.poll(async () => (await snapshot(page)).custom).toBe(false);
    const soft = await snapshot(page);
    expect(soft.shader.saturation).not.toBe(0);
    expect(soft.pass.levels).toBe(soft.shader.levels);
    expect(soft.shader.ring, 'the outer ring Soft draws').toBe(true);
    expect(errors).toEqual([]);
  });

  test('at Pixel Size Off the Shader options of the pixel look rest, and toon shading, the shadow strength and the light still apply', async ({
    page,
  }) => {
    await calm(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await sheet.getByRole('button', { name: 'Pixel Size Off', exact: true }).click();
    await expect(sheet.locator('[data-shader-off-hint]')).toBeVisible();
    for (const name of [
      'Colors',
      'Dither Strength',
      'Outline Strength',
      'Saturation',
      'Warmth',
      'Brightness',
      'Contrast',
    ])
      await expect(sheet.getByRole('slider', { name }), name).toBeDisabled();
    for (const name of ['Shadow Strength', 'Light Angle', 'Light Strength'])
      await expect(sheet.getByRole('slider', { name }), name).toBeEnabled();
    await expect(sheet.getByRole('switch', { name: 'Highlight' })).toBeEnabled();
    const strength = sheet.getByRole('slider', { name: 'Light Strength' });
    await strength.focus();
    const was = (await snapshot(page)).pass.light;
    await page.keyboard.press('End');
    await expect
      .poll(async () => (await snapshot(page)).pass.light, 'the light twice as strong')
      .toBeCloseTo(was * 2, 3);
  });

  test('only the left mouse button holds or walks him: a right press on him, a right- or middle-click on the floor leave him be', async ({
    page,
  }) => {
    await calm(page);
    const body = await on(page, 'body');
    await page.mouse.move(body.x, body.y);
    await page.mouse.down({ button: 'right' });
    await framesFor(page, 500); // (longer than a left press takes to grab him)
    expect((await snapshot(page)).held, 'a right press on him').toBe(false);
    await page.mouse.up({ button: 'right' });
    const floor = { x: body.x + 200, y: body.y + 60 };
    await page.mouse.click(floor.x, floor.y, { button: 'right' });
    await page.mouse.click(floor.x, floor.y, { button: 'middle' });
    await framesFor(page, 600);
    const s = await snapshot(page);
    expect(s.state).toBe('idle');
    expect(s.states, 'never held').not.toContain('held');
    expect(s.states, 'never walked off').not.toContain('walk');
    // The left button still walks him there.
    await page.mouse.click(floor.x, floor.y);
    await until(page, (t) => t.state === 'walk', 'walking after a left click');
  });

  test('Escape closes the Settings sheet after a click or a drag on the canvas too, and focus goes back to Settings', async ({
    page,
  }) => {
    await calm(page);
    const look = page.getByRole('button', { name: 'Settings' });
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    // A click on empty space while it's open: focus leaves the sheet for the page.
    await look.click();
    await expect(sheet).toBeVisible();
    await page.mouse.click(200, 120);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(look).toBeFocused();
    // A drag on empty space (turning the camera) while it's open.
    await look.click();
    await expect(sheet).toBeVisible();
    await page.mouse.move(300, 120);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(300 + i * 20, 120 + i * 3);
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(look).toBeFocused();
  });

  test('the Settings sheet holds focus: it opens on Done, Tab goes round inside it, and the toolbar behind it is out of reach', async ({
    page,
  }) => {
    await calm(page);
    const look = page.getByRole('button', { name: 'Settings' });
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    /** The toolbar's buttons and whether each is inert. */
    const toolbarInert = () =>
      page
        .locator('.inv-toolbar')
        .evaluate((el) => [...el.querySelectorAll(':scope > .inv-btn')].map((b) => `${b.textContent} ${b.inert}`));
    await look.focus();
    await page.keyboard.press('Enter');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet.getByRole('button', { name: 'Done' })).toBeFocused();
    expect(await toolbarInert(), 'the buttons under the sheet are inert; Settings, which closes it, is not').toEqual([
      'Replay Intro true',
      'Wave true',
      'Sit true',
      'Screen Time true',
      'Run true',
      'Camera true',
      'Settings false',
    ]);
    /** What has focus, and whether it's in the sheet. */
    const focused = () =>
      page.evaluate(() => {
        const a = /** @type {HTMLElement} */ (document.activeElement);
        const key = a.dataset?.look ?? a.dataset?.shader ?? a.dataset?.setting;
        const what = key ? `${key}=${a.getAttribute('value') ?? ''}` : a.textContent?.trim();
        return { inside: Boolean(a.closest('.inv-sheet')), what: `${a.tagName} ${what}` };
      });
    const stops = new Set();
    for (let i = 1; i <= 30; i++) {
      await page.keyboard.press('Tab');
      const f = await focused();
      expect(f.inside, `Tab ${i}: ${f.what}`).toBe(true);
      stops.add(f.what);
    }
    for (let i = 1; i <= 8; i++) {
      await page.keyboard.press('Shift+Tab');
      const f = await focused();
      expect(f.inside, `Shift+Tab ${i}: ${f.what}`).toBe(true);
    }
    // Done, Pixel Size (its slider and the buttons at its two ends), Dithering, Outlines, Style,
    // Motion, the 17 Shader options (Reset To Style rests until one is the user's own), Ground
    // Cues and Wander (no Drag row: the bead hold is the only carry).
    expect(stops.size, [...stops].join(', ')).toBe(27);
    // Focus on the page (a click on empty space): Tab comes back into the sheet.
    await page.mouse.click(200, 120);
    await page.keyboard.press('Tab');
    expect((await focused()).inside, 'Tab from the page').toBe(true);
    await page.keyboard.press('Escape');
    await expect(look).toBeFocused();
    expect(await toolbarInert(), 'the toolbar back in reach').toEqual(
      ['Replay Intro', 'Wave', 'Sit', 'Screen Time', 'Run', 'Camera', 'Settings'].map((name) => `${name} false`),
    );
  });

  test('with the Settings sheet open NEWT stays in sight, and Reset Camera on the Camera pad eases back where he can be seen', async ({
    page,
  }) => {
    await calm(page);
    const body = await on(page, 'body');
    const home = (await snapshot(page)).camera;
    // Round and up a long way first (the right button turns it), and panned off to one side.
    await page.mouse.move(body.x + 300, body.y + 60);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 20; i++) await page.mouse.move(body.x + 300 - i * 22, body.y + 60 + i * 6);
    await page.mouse.up({ button: 'right' });
    await until(page, (s) => Math.abs(s.camera.yaw) > 0.8, 'turned');
    await page.mouse.move(body.x + 200, body.y + 100);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(body.x + 200 - i * 12, body.y + 100);
    await page.mouse.up();
    await until(page, (s) => s.camera.panned, 'panned');
    await lookOpenWithNewtInSight(page);
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    await page.getByRole('button', { name: 'Reset Camera' }).click();
    // Every frame of the way back: his head, middle and feet in sight.
    const frames = await page.evaluate(
      (h) =>
        new Promise((done) => {
          const inv = window.__invitation;
          const out = [];
          const t0 = performance.now();
          const tick = () => {
            const s = inv.snapshot();
            const f = { yaw: s.camera.yaw };
            for (const part of ['head', 'body', 'feet']) {
              const p = inv.screen(part);
              f[part] = document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS';
            }
            out.push(f);
            const back = Math.abs(s.camera.yaw - h.yaw) < 0.01 && Math.abs(s.camera.elevation - h.elevation) < 0.01;
            if (!back && performance.now() - t0 < 10_000) requestAnimationFrame(tick);
            else done(out);
          };
          requestAnimationFrame(tick);
        }),
      home,
    );
    expect(Math.abs(frames.at(-1).yaw - home.yaw), 'back to the default view').toBeLessThan(0.01);
    expect(frames.length, 'it eased back over several frames').toBeGreaterThan(3);
    expect((await snapshot(page)).camera.panned, 'the pan cleared').toBe(false);
    for (const [i, f] of frames.entries())
      expect(f.head && f.body && f.feet, `frame ${i} (yaw ${f.yaw.toFixed(2)}): ${JSON.stringify(f)}`).toBe(true);
  });

  test('a mouse shows each button’s label as a pixel tab with a dither fill on hover, and on keyboard focus', async ({
    page,
  }) => {
    await calm(page);
    const wave = page.getByRole('button', { name: 'Wave', exact: true });
    const label = wave.locator('.inv-btn-label');
    const opacity = () => label.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(await opacity(), 'hidden until hovered').toBe(0);
    await wave.hover();
    await expect.poll(opacity, { message: 'shown on hover' }).toBeGreaterThan(0.9);
    const box = await wave.boundingBox();
    const tab = await label.boundingBox();
    expect(tab.y + tab.height, 'a tab over the button').toBeLessThanOrEqual(box.y + 2);
    expect(await label.textContent()).toBe('Wave');
    // (Hover fills the squircle with an ordered dither; Pixelify Sans on the tab.)
    expect(await wave.evaluate((el) => getComputedStyle(el).backgroundImage), 'a dither fill').toMatch(
      /url\("data:image\/png/,
    );
    expect(await label.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Pixelify Sans/);
    await page.mouse.move(5, 5);
    await expect.poll(opacity, { message: 'gone once the mouse leaves' }).toBe(0);
    // Keyboard focus shows it too.
    await page.getByRole('button', { name: 'Replay Intro' }).focus();
    await page.keyboard.press('Tab');
    await expect(wave).toBeFocused();
    await expect.poll(opacity, { message: 'shown on focus' }).toBeGreaterThan(0.9);
    await expect(page.locator('[title]')).toHaveCount(0);
  });

  test('the Camera pad’s buttons turn, tilt and zoom the camera', async ({ page }) => {
    await calm(page);
    // The Camera pad: each of its buttons moves the camera.
    const camera = page.getByRole('button', { name: 'Camera', exact: true });
    await camera.click();
    await expect(page.locator('#inv-camera')).toBeVisible();
    const home = (await snapshot(page)).camera;
    const settled = (pred, msg) => until(page, (s) => !s.camera.turning && pred(s.camera), msg);
    await page.getByRole('button', { name: 'Turn Right' }).click();
    await settled((c) => Math.abs(c.yaw - home.yaw - Math.PI / 4) < 0.01, 'Turn Right: 45° clockwise');
    await page.getByRole('button', { name: 'Tilt Up' }).click();
    await settled((c) => Math.abs(c.elevation - home.elevation - (12 * Math.PI) / 180) < 0.01, 'Tilt Up: 12°');
    await page.getByRole('button', { name: 'Tilt Down' }).click();
    await settled((c) => Math.abs(c.elevation - home.elevation) < 0.01, 'Tilt Down: back');
    await page.getByRole('button', { name: 'Zoom In' }).click();
    await until(page, (s) => s.camera.distance < home.distance * 0.85, 'Zoom In');
    await page.getByRole('button', { name: 'Zoom Out' }).click();
    await until(page, (s) => Math.abs(s.camera.distance - home.distance) < home.distance * 0.02, 'Zoom Out');
  });

  test('the Camera pad follows NEWT, resets the view and restores focus on Escape', async ({ page }) => {
    await calm(page);
    const camera = page.getByRole('button', { name: 'Camera', exact: true });
    await camera.click();
    await expect(page.locator('#inv-camera')).toBeVisible();
    const home = (await snapshot(page)).camera;
    const settled = (pred, msg) => until(page, (s) => !s.camera.turning && pred(s.camera), msg);
    // Panned off him, then Follow NEWT: back onto him.
    const body = await on(page, 'body');
    await page.mouse.move(body.x + 300, body.y + 80);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(body.x + 300 - i * 15, body.y + 80);
    await page.mouse.up();
    await until(page, (s) => s.camera.panned, 'panned');
    await page.getByRole('button', { name: 'Follow NEWT' }).click();
    await until(
      page,
      (s) => !s.camera.panned && Math.hypot(s.camera.target.x - s.pos.x, s.camera.target.z - s.pos.z) < 0.05,
      'onto him',
    );
    // Turn Left turns the scene the way its arrow shows, counter-clockwise: a spot of floor to
    // his right on screen comes round away from the camera, up the screen and in toward him.
    const feet = await on(page, 'feet');
    const right = { x: feet.x + 120, y: feet.y };
    const spot = await floorAt(page, right);
    const before = (await snapshot(page)).camera.yaw;
    await page.getByRole('button', { name: 'Turn Left' }).click();
    await settled((c) => Math.abs(c.yaw - before + Math.PI / 4) < 0.01, 'Turn Left: 45° counter-clockwise');
    const now = await page.evaluate(
      ({ at, w }) => {
        let best = { x: at.x, y: at.y, d: Infinity };
        for (let dy = -160; dy <= 160; dy += 4)
          for (let dx = -160; dx <= 160; dx += 4) {
            const f = window.__invitation.floorAt(at.x + dx, at.y + dy);
            const d = f ? Math.hypot(f.x - w.x, f.z - w.z) : Infinity;
            if (d < best.d) best = { x: at.x + dx, y: at.y + dy, d };
          }
        return best;
      },
      { at: right, w: spot },
    );
    expect(now.y, 'the spot to his right went up the screen').toBeLessThan(right.y - 20);
    expect(now.x, 'and in toward him').toBeLessThan(right.x - 10);
    await page.getByRole('button', { name: 'Reset Camera' }).click();
    await settled(
      (c) => Math.abs(c.yaw - home.yaw) < 0.01 && Math.abs(c.distance - home.distance) < home.distance * 0.01,
      'reset',
    );
    // Escape closes the pad, and focus goes back to Camera.
    await page.keyboard.press('Escape');
    await expect(page.locator('#inv-camera')).toBeHidden();
    await expect(camera).toHaveAttribute('aria-expanded', 'false');
    await expect(camera).toBeFocused();
  });

  test('the pixel cursors: the arrow on the floor, an open hand over NEWT, a closed hand holding him and panning, the turn glyph orbiting, the pointing hand on the buttons', async ({
    page,
  }) => {
    await calm(page);
    const canvas = page.locator('[data-stage] canvas');
    const kind = () => page.evaluate(() => document.querySelector('[data-stage]').dataset.cursor);
    const cursorOf = (loc) => loc.evaluate((el) => getComputedStyle(el).cursor);
    // (Headless screenshots draw no cursor: what the CSS gives is what's checked.)
    // (Chrome gives the resolutions back as dppx.)
    const form =
      /image-set\(url\("data:image\/png[^)]*\) 1(x|dppx), url\("data:image\/png[^)]*\) 2(x|dppx)\) \d+ \d+, /;
    const body = await on(page, 'body');
    await page.mouse.move(body.x + 260, body.y + 40);
    await expect.poll(kind).toBe('arrow');
    expect(await cursorOf(canvas)).toMatch(new RegExp(form.source + 'default'));
    await page.mouse.move(body.x, body.y);
    await expect.poll(kind, { message: 'over him' }).toBe('open');
    expect(await cursorOf(canvas)).toMatch(new RegExp(form.source + 'grab'));
    await page.mouse.down();
    await until(page, (s) => s.held, 'held');
    await expect.poll(kind, { message: 'holding him' }).toBe('grab');
    expect(await cursorOf(canvas)).toMatch(new RegExp(form.source + 'grabbing'));
    await page.mouse.up();
    await until(page, (s) => s.state === 'idle', 'down again', 30_000);
    // A right-drag on empty space turns: the turn glyph while it goes.
    const from = { x: body.x + 280, y: body.y - 120 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(from.x - 20, from.y);
    await page.mouse.move(from.x - 40, from.y);
    await expect.poll(kind, { message: 'orbiting' }).toBe('turn');
    expect(await cursorOf(canvas)).toMatch(new RegExp(form.source + 'move'));
    await page.mouse.up({ button: 'right' });
    // A left-drag on empty space pans: the closed hand.
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 20, from.y);
    await page.mouse.move(from.x - 40, from.y);
    await expect.poll(kind, { message: 'panning' }).toBe('grab');
    await page.mouse.up();
    // The buttons and the hotspots: at most 32 CSS px, the arrow's at its tip.
    expect(await cursorOf(page.locator('[data-button="Wave"]'))).toMatch(new RegExp(form.source + 'pointer'));
    const sizes = await page.evaluate(async () => {
      const urls = [
        ...getComputedStyle(document.querySelector('[data-button="Wave"]')).cursor.matchAll(/url\("([^"]+)"\)/g),
      ].map((m) => m[1]);
      return Promise.all(
        urls.map(
          (u) =>
            new Promise((done) => {
              const img = new Image();
              img.onload = () => done([img.width, img.height]);
              img.src = u;
            }),
        ),
      );
    });
    expect(sizes, '1x then 2x').toEqual([
      [32, 32],
      [64, 64],
    ]);
  });

  test('the floor ring is drawn from its distance: at 48×48 a rim two texels wide across and down, six texels round at least; it fades as the view gets low over it, and at Off its edge is smooth', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('invitation.look.v1', JSON.stringify({ pixelSize: '48' })));
    await calm(page);
    const body = await on(page, 'body');
    const at = { x: Math.round(body.x + 260), y: Math.round(body.y + 30) };
    await page.mouse.move(at.x, at.y);
    await until(page, (s) => s.drag.marker.visible && s.drag.marker.alpha > 0.99, 'the cursor marker up');
    const { drag, pass } = await snapshot(page);
    expect(drag.marker.texels, 'six texels round at least').toBeGreaterThanOrEqual(5.99);
    const ring = await ringRuns(page, at, Math.ceil((drag.marker.texels + 4) * pass.pd));
    // (dpr 1: a texel is pd CSS px. Two runs across and two down through its middle, each about
    // two texels: the rim keeps its width on screen however the floor is foreshortened.)
    for (const [way, runs] of [
      ['across', ring.across],
      ['down', ring.down],
    ]) {
      expect(runs.length, `${way}: the rim twice`).toBe(2);
      for (const r of runs) {
        expect(r / pass.pd, `${way}: about two texels`).toBeGreaterThanOrEqual(1.5);
        expect(r / pass.pd, `${way}: about two texels`).toBeLessThanOrEqual(3);
      }
    }
    expect(ring.width / pass.pd, 'twelve texels across at least').toBeGreaterThanOrEqual(11);
    expect(ring.greys, 'a hard cut with the pixel look on').toBeLessThanOrEqual(ring.width / pass.pd);
    // A low view over it: the cursor marker fades (gone by 10°), and comes back up high.
    await page.evaluate(() => window.__invitation.view({ elevation: (12 * Math.PI) / 180 }));
    await until(page, (s) => !s.camera.turning && Math.abs(s.camera.elevation - (12 * Math.PI) / 180) < 0.01, '12°');
    const middle = await page.evaluate(() => {
      const r = document.querySelector('[data-stage]').getBoundingClientRect();
      const bar = document.querySelector('.inv-toolbar').getBoundingClientRect();
      return { x: r.left + r.width * 0.75, y: (r.top + bar.top) / 2 };
    });
    await page.mouse.move(middle.x, middle.y);
    await until(page, (s) => s.drag.marker.elevation < (14 * Math.PI) / 180 && s.drag.marker.alpha < 0.5, 'faded low');
    await page.evaluate(() => window.__invitation.view({ elevation: (70 * Math.PI) / 180 }));
    await page.mouse.move(middle.x + 1, middle.y);
    await until(page, (s) => !s.camera.turning && s.drag.marker.visible && s.drag.marker.alpha > 0.99, 'full high');
    // At Off: the same ring, its edge smooth (in-between greys on the way in and out).
    await page.addInitScript(() => localStorage.setItem('invitation.look.v1', JSON.stringify({ pixelSize: 'off' })));
    await calm(page);
    const again = await on(page, 'body');
    const spot = { x: Math.round(again.x + 260), y: Math.round(again.y + 30) };
    await page.mouse.move(spot.x, spot.y);
    await until(page, (s) => s.drag.marker.visible && s.drag.marker.alpha > 0.99, 'the cursor marker up at Off');
    const off = await ringRuns(page, spot, Math.ceil((await snapshot(page)).drag.marker.texels + 6));
    expect(off.across.length, 'the rim twice across').toBe(2);
    expect(off.greys, 'a smooth edge').toBeGreaterThanOrEqual(4);
  });

  test('hovering turns his head', async ({ page }) => {
    await calm(page);
    const body = await on(page, 'body');
    await page.mouse.move(body.x - 220, body.y + 60);
    await until(page, (s) => s.headYaw < -0.15, 'his head turned left');
    await page.mouse.move(body.x + 220, body.y + 60, { steps: 4 });
    await until(page, (s) => s.headYaw > 0.15, 'his head turned right');
  });

  test('NEWT talks: clicked until he says something, a line of the admin’s types out in a bubble over his head, clear of the toolbar, and a screen reader hears it whole', async ({
    page,
  }) => {
    const inv = JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8')).invitation ?? {};
    const lines = Object.values(inv.lines ?? {})
      .flat()
      .map((l) => String(l).trim());
    const tapped = ['wave', 'spook', 'flee'].some((k) => inv.speech?.[k]?.chance > 0 && inv.lines?.[k]?.length);
    test.skip(!tapped, 'the admin has a click on him say nothing');
    const errors = watch(page);
    await calm(page);
    // A click on him waves or startles him (or, clicked often, he runs off): each speaks at its
    // chance, so click again once he's back until one does.
    for (let i = 0; i < 10 && !(await snapshot(page)).talk.showing; i++) {
      const head = await on(page, 'head');
      await page.mouse.click(head.x, head.y);
      await until(page, (s) => s.state !== 'idle' || Boolean(s.talk.showing), 'reacting');
      await until(page, (s) => s.state === 'idle' || Boolean(s.talk.showing), 'back to idle', 30_000);
    }
    const { showing } = (await snapshot(page)).talk;
    expect(showing, 'he said something').toBeTruthy();
    expect(['wave', 'spook', 'flee']).toContain(showing.trigger);
    expect(lines).toContain(showing.line);
    await expect(page.locator('.inv-bubble-typed'), 'typed out to the whole line').toHaveText(showing.line);
    await expect(page.locator('.inv-bubble-live')).toHaveText(`NEWT: ${showing.line}`);
    let at = null;
    await expect.poll(async () => !(at = await bubbleAt(page)).away, { message: 'placed' }).toBe(true);
    expect(at.box.bottom, 'over his head').toBeLessThan(at.head.y);
    expect(at.box.left).toBeLessThan(at.head.x + 40);
    expect(at.box.right).toBeGreaterThan(at.head.x - 40);
    expect(at.tail).toBe('down');
    expect(overlaps(at.box, at.bar), 'clear of the toolbar').toBe(false);
    // Its time up, it goes.
    await expect(page.locator('.inv-bubble')).toBeHidden({ timeout: 20_000 });
    await expect(page.locator('.inv-bubble-live')).toHaveText('');
    expect(errors).toEqual([]);
  });

  test('the bubble keeps talk’s time: a tab hidden longer than a line lasts pauses both, so the line is still up in its bubble when it comes back, and both end together', async ({
    page,
  }) => {
    const inv = JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8')).invitation ?? {};
    const tapped = ['wave', 'spook', 'flee'].some((k) => inv.speech?.[k]?.chance > 0 && inv.lines?.[k]?.length);
    test.skip(!tapped, 'the admin has a click on him say nothing');
    await calm(page);
    for (let i = 0; i < 10 && !(await snapshot(page)).talk.showing; i++) {
      const head = await on(page, 'head');
      await page.mouse.click(head.x, head.y);
      await until(page, (s) => s.state !== 'idle' || Boolean(s.talk.showing), 'reacting');
      await until(page, (s) => s.state === 'idle' || Boolean(s.talk.showing), 'back to idle', 30_000);
    }
    const { talk } = await snapshot(page);
    expect(talk.showing, 'he said something').toBeTruthy();
    // The tab goes out of sight for a second longer than the line has left (the toy's clock
    // stops: main.js sync), then comes back.
    const visible = (hidden) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await visible(true);
    await sleep((talk.showing.until - talk.t + 1) * 1000);
    await visible(false);
    await framesFor(page, 100);
    const back = await snapshot(page);
    expect(back.talk.showing?.line, 'talk still has the line up').toBe(talk.showing.line);
    await expect(page.locator('.inv-bubble'), 'and its bubble still shows it').toBeVisible();
    await expect(page.locator('.inv-bubble-live')).toHaveText(`NEWT: ${talk.showing.line}`);
    // The bubble goes when talk's line is over, not before.
    await expect(page.locator('.inv-bubble')).toBeHidden({ timeout: 20_000 });
    await until(page, (s) => !s.talk.showing, 'talk’s line over too', 2_000);
  });

  test('the bubble sits under the toolbar and the Settings sheet, and with the sheet open it stays clear of it and off his face', async ({
    page,
  }) => {
    await calm(page);
    const order = await page.evaluate(() => {
      const b = document.querySelector('[data-stage] .inv-bubble');
      const hud = document.querySelector('[data-stage] .inv-hud');
      return Boolean(b && hud && b.compareDocumentPosition(hud) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order, 'in the stage before the HUD, so the toolbar and the sheet draw over it').toBe(true);
    await lookOpenWithNewtInSight(page);
    await page.evaluate(() =>
      window.__invitation.say('A line long enough to wrap onto a second row in the bubble, to see where it sits.'),
    );
    let at = null;
    await expect.poll(async () => !(at = await bubbleAt(page)).away, { message: 'placed' }).toBe(true);
    expect(at.sheet, 'the sheet is open').toBeTruthy();
    expect(overlaps(at.box, at.sheet), 'clear of the open Settings sheet').toBe(false);
    const face = { left: at.head.x - 4, top: at.head.y - 4, right: at.head.x + 4, bottom: at.head.y + 4 };
    expect(overlaps(at.box, face), 'never over his face').toBe(false);
    expect(at.box.left).toBeGreaterThanOrEqual(at.stage.left);
    expect(at.box.top).toBeGreaterThanOrEqual(at.stage.top);
    expect(at.box.right).toBeLessThanOrEqual(at.stage.right);
  });

  test('a right-drag turns the camera, on NEWT too and never holding him; the wheel zooms it; the canvas shows no context menu; Reset Camera brings it back', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const body = await on(page, 'body');
    const home = (await snapshot(page)).camera;
    expect(Math.abs(home.yaw)).toBeLessThan(1e-3);
    // No context menu over the canvas: its default is turned down.
    const menu = await page.evaluate(() => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 });
      document.querySelector('[data-stage] canvas').dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(menu, 'no context menu').toBe(true);
    // A right-drag that starts on NEWT: round it goes, and he stays where he was.
    await page.mouse.move(body.x, body.y);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 15; i++) await page.mouse.move(body.x - i * 16, body.y + i * 3);
    await page.mouse.up({ button: 'right' });
    await until(page, (s) => Math.abs(s.camera.yaw) > 0.5, 'turned');
    await until(page, (s) => s.camera.elevation > home.elevation + 0.05, 'tilted up a little');
    // By the stage's width: 240 of its 1280 px turn it about 0.88 rad (three quarters of a turn
    // across the whole width), plus a little coast; never the 2.2 rad of 2π per 700 px.
    // (Waits on the view coming to rest, by the toy's own clock: a software-rendered browser
    // draws slowly, so the coast and easing take longer there in real time.)
    await until(page, (s) => !s.camera.turning, 'the turn settles');
    const settled = (await snapshot(page)).camera.yaw;
    expect(Math.abs(settled), `turned ${settled.toFixed(2)} rad`).toBeGreaterThan(0.7);
    expect(Math.abs(settled), `turned ${settled.toFixed(2)} rad`).toBeLessThan(1.6);
    let s = await snapshot(page);
    expect(s.state).toBe('idle');
    expect(s.held).toBe(false);
    expect(s.states, 'never held').not.toContain('held');
    expect(s.camera.panned, 'a turn is no pan').toBe(false);
    // The wheel: toward you further, away from you closer.
    await page.mouse.move(body.x + 200, body.y);
    await page.mouse.wheel(0, 400);
    await until(page, (t) => t.camera.distance > home.distance * 1.3, 'zoomed out');
    await page.mouse.wheel(0, -1200);
    await until(page, (t) => t.camera.distance < home.distance * 0.8, 'zoomed in');
    // Reset Camera, on the Camera pad: back to the default view.
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    await page.getByRole('button', { name: 'Reset Camera' }).click();
    await until(
      page,
      (t) =>
        Math.abs(t.camera.yaw - home.yaw) < 0.01 &&
        Math.abs(t.camera.elevation - home.elevation) < 0.01 &&
        Math.abs(t.camera.distance - home.distance) < home.distance * 0.01,
      'back to the default view',
    );
    s = await snapshot(page);
    expect(s.states).not.toContain('walk');
    expect(errors).toEqual([]);
  });

  test('a right-drag that turns the camera and ends over the toolbar shows no context menu there either', async ({
    page,
  }) => {
    await calm(page);
    // Every context menu event, whatever it lands on, and whether its default was turned down.
    await page.evaluate(() => {
      window.__menus = [];
      window.addEventListener(
        'contextmenu',
        (e) => window.__menus.push({ on: String(e.target?.className ?? ''), e }),
        true,
      );
    });
    const bar = await page.locator('.inv-toolbar').boundingBox();
    const from = { x: bar.x + bar.width / 2 + 200, y: bar.y - 300 };
    const to = { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 15; i++)
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 15, from.y + ((to.y - from.y) * i) / 15);
    await page.mouse.up({ button: 'right' });
    // (Chrome on Windows fires it at the button's release on what's under the cursor, the
    // toolbar here; elsewhere at the press, on the canvas. As Windows does, at once:)
    const late = await page.evaluate(() => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      document.querySelector('.inv-toolbar').dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(late, 'the release’s menu over the toolbar turned down').toBe(true);
    await until(page, (s) => Math.abs(s.camera.yaw) > 0.2, 'the drag turned the camera');
    // (Read once each has been through every listener.)
    const menus = await page.evaluate(() => window.__menus.map((m) => ({ on: m.on, prevented: m.e.defaultPrevented })));
    expect(menus.length, JSON.stringify(menus)).toBeGreaterThan(0);
    for (const m of menus) expect(m.prevented, `a menu on ${m.on}`).toBe(true);
  });

  test('a left-drag on empty space pans the view: the floor under the cursor stays under it, nothing turns or zooms, he stays put, and Reset Camera clears it', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const body = await on(page, 'body');
    const home = await snapshot(page);
    const from = { x: body.x + 260, y: body.y + 70 };
    const grabbed = await floorAt(page, from);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();

    for (let i = 1; i <= 12; i++) {
      const at = { x: from.x - i * 18, y: from.y - i * 9 };
      await page.mouse.move(at.x, at.y);
      if (i % 4) continue;
      await framesFor(page, 60);
      const under = await floorAt(page, at);
      expect(
        Math.hypot(under.x - grabbed.x, under.z - grabbed.z),
        `step ${i}: the floor under the cursor`,
      ).toBeLessThan(0.05);
    }
    await page.mouse.up();
    const s = await snapshot(page);
    expect(s.camera.panned).toBe(true);
    expect(
      Math.hypot(s.camera.target.x - home.camera.target.x, s.camera.target.z - home.camera.target.z),
    ).toBeGreaterThan(0.5);
    expect(Math.abs(s.camera.yaw - home.camera.yaw), 'not turned').toBeLessThan(1e-3);
    expect(Math.abs(s.camera.distance - home.camera.distance), 'not zoomed').toBeLessThan(1e-3);
    expect(s.state).toBe('idle');
    expect(s.states, 'a drag is no floor tap').not.toContain('walk');
    expect(s.states).not.toContain('held');
    // It stays where it was put while he's on screen.
    await framesFor(page, 600);
    const after = await snapshot(page);
    expect(after.camera.target).toEqual(s.camera.target);
    // Reset Camera, on the Camera pad, clears it.
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    await page.getByRole('button', { name: 'Reset Camera' }).click();
    await until(
      page,
      (t) =>
        !t.camera.panned &&
        Math.hypot(t.camera.target.x - home.camera.target.x, t.camera.target.z - home.camera.target.z) < 0.02,
      'back where it was',
    );
    expect(errors).toEqual([]);
  });

  test('let go out at the screen’s edge, he’s eased back into view: the camera never jumps on the frame he drops', async ({
    page,
  }) => {
    await calm(page);
    const body = await on(page, 'body');
    await page.mouse.move(body.x, body.y);
    await page.mouse.down();
    await until(page, (s) => s.held, 'held');
    // Carried to 12 px from the window's right edge (the cursor never leaves it), a little up.
    const edge = page.viewportSize().width - 12;
    for (let i = 1; i <= 20; i++)
      await page.mouse.move(body.x + ((edge - body.x) * i) / 20, body.y - 2 * Math.min(i, 10));
    await framesFor(page, 300);
    // His head across the screen every frame from the moment he's let go, for 1.5 s.
    await page.evaluate(() => {
      window.__track = new Promise((done) => {
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          out.push(window.__invitation.screen('head').x);
          if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      });
    });
    await page.mouse.up();
    const xs = await page.evaluate(() => window.__track);
    // An ease: no one frame's move far bigger than any other's (a snap moved him 100 to 350 px
    // in one frame, then 10 to 20 a frame).
    const steps = xs
      .slice(1)
      .map((x, i) => Math.abs(x - xs[i]))
      .sort((p, q) => q - p);
    // (At the default zoom the view no longer follows him: he comes back in by the rim's own
    // ease, about 30-50 px, so the floor sits well under that spread.)
    const moved = xs[0] - Math.min(...xs);
    expect(moved, `he came back in by ${moved.toFixed(1)} px`).toBeGreaterThan(15);
    expect(steps[0], `${steps[0].toFixed(1)} px in a frame, then ${steps[1].toFixed(1)}`).toBeLessThan(3 * steps[1]);
  });

  test('where he looks with a mouse: down toward a cursor below him (under the look at the viewer it rests at), up at one above him, round toward one off to a side', async ({
    page,
  }) => {
    await calm(page);
    const head = await on(page, 'head');
    const feet = await on(page, 'feet');
    const tall = feet.y - head.y;
    // The cursor on him: he looks at the viewer, as he rests.
    await page.mouse.move(head.x, head.y);
    await framesFor(page, 700);
    const idle = (await snapshot(page)).headPitch;
    expect(idle, 'up at the viewer').toBeGreaterThan(0.4);
    // Below him: his head goes down toward it, well under the look at the viewer.
    await page.mouse.move(head.x, feet.y + tall, { steps: 4 });
    await until(page, (s) => s.headPitch < idle - 0.2, 'his head down toward the cursor below him');
    // Below and off to a side: turned that way, still down.
    for (const side of [-1, 1]) {
      await page.mouse.move(head.x + side * tall, feet.y + tall / 2, { steps: 4 });
      await until(
        page,
        (s) => Math.sign(s.headYaw) === side && Math.abs(s.headYaw) > 0.15 && s.headPitch < idle - 0.15,
        `down and ${side < 0 ? 'left' : 'right'}`,
      );
    }
    // High over him: up, above the look at the viewer.
    await page.mouse.move(head.x + 10, head.y - 3 * tall, { steps: 4 });
    await until(page, (s) => s.headPitch > idle + 0.15, 'his head tipped up');
    // Level with his head, far off to a side: well round toward it.
    for (const side of [-1, 1]) {
      await page.mouse.move(head.x + side * 4 * tall, head.y, { steps: 4 });
      await until(page, (s) => Math.sign(s.headYaw) === side && Math.abs(s.headYaw) > 0.8, `turned ${side}`);
    }
  });

  test('running away he faces where he runs (not up at the viewer), glancing back over his shoulder now and then', async ({
    page,
  }) => {
    await calm(page);
    await page.locator('[data-button="Run"]').click();
    await until(page, (s) => s.state === 'flee', 'running');
    const frames = await page.evaluate(
      () =>
        new Promise((done) => {
          const inv = window.__invitation;
          const out = [];
          const t0 = performance.now();
          const tick = () => {
            const s = inv.snapshot();
            out.push({ t: performance.now() - t0, state: s.state, yaw: s.headYaw, pitch: s.headPitch });
            const t = performance.now() - t0;
            if ((s.state === 'flee' || t < 300) && t < 10_000) requestAnimationFrame(tick);
            else done(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    // (The whole run, from 0.6 s in: his look has come round from the viewer by then.)
    const run = frames.filter((f) => f.state === 'flee' && f.t > 600);
    expect(run.length, 'frames of the run').toBeGreaterThan(20);
    // (By time, not by frames: a slow software-rendered frame is a longer stretch of the run.)
    let span = 0;
    let ahead = 0;
    for (let i = 1; i < run.length; i++) {
      const dt = run[i].t - run[i - 1].t;
      span += dt;
      if (Math.abs(run[i].yaw) < 0.2) ahead += dt;
    }
    expect(ahead / span, 'his head where he runs most of the run').toBeGreaterThan(0.5);
    expect(
      run.some((f) => Math.abs(f.yaw) > 0.6),
      'a glance back over his shoulder',
    ).toBe(true);
    for (const f of run) expect(f.pitch, 'his chin never up at the viewer').toBeLessThan(0.2);
  });
});

test.describe('on a 1429×1115 desktop', () => {
  test.use({ viewport: { width: 1429, height: 1115 } });

  test('a first visit’s Settings sheet reads the default 128×128 (it draws as 96×96 does here) and the Default style', async ({
    page,
  }) => {
    await ready(page, '/invitation/?test&calm&seed=3');
    await page.getByRole('button', { name: 'Settings' }).click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet.locator('[data-pixel-value]')).toHaveText('128×128');
    await expect(sheet.getByRole('slider', { name: 'Pixel Size' })).toHaveAttribute('aria-valuetext', '128 by 128');
    await expect(sheet.getByRole('group', { name: 'Style' }).getByRole('radio', { name: 'Default' })).toBeChecked();
    expect((await snapshot(page)).resolution).toBe(128);
  });
});

test.describe('on a hi-DPI desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

  test('with Pixel Shirt on at 128×128 his shirt is the Pixel Size’s to decide: zoomed in (bigger blocks) or with the governor a step coarser, it keeps the real plaid', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('invitation.look.v1', JSON.stringify({ pixelSize: '128', shader: { pixelShirt: true } })),
    );
    await ready(page, '/invitation/?test&calm&seed=3');
    const base = await snapshot(page);
    // (He's about 156 texels tall here: the glb's own plaid, over ORIGINAL_ATLAS_TEXELS.)
    expect(base.atlas).toBe('original');
    const body = await on(page, 'body');
    await page.mouse.move(body.x + 200, body.y);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -60);
      await framesFor(page, 250);
      const s = await snapshot(page);
      expect(
        s.atlas,
        `zoomed ${(s.cameraHome.distance / s.camera.distance).toFixed(2)}×, ${s.pass.pd} px a texel`,
      ).toBe('original');
    }
    expect((await snapshot(page)).pass.pd, 'the blocks grew with the zoom').toBeGreaterThan(base.pass.pd);
    // The governor a level coarser (a busy page) changes the texels, not the shirt.
    await ready(page, '/invitation/?test&calm&seed=3&govern');
    await page.evaluate(() => {
      const spin = () => {
        if (window.__calm) return;
        const t = performance.now();
        while (performance.now() - t < 35);
        requestAnimationFrame(spin);
      };
      requestAnimationFrame(spin);
    });
    await until(page, (s) => s.pass.governor.level === 1, 'a level coarser', 25_000);
    expect((await snapshot(page)).atlas).toBe('original');
    await page.evaluate(() => (window.__calm = true));
  });
});

test.describe('on a small window', () => {
  // (Few texels at 32×32, so the frames are quick even on CI's software WebGL: only the busy
  // page below makes them slow.)
  test.use({ viewport: { width: 640, height: 400 } });

  test('with slow frames the governor makes the texels a device pixel coarser and ?perf shows it; when the frames are quick again it comes back, never finer than the Pixel Size', async ({
    page,
  }) => {
    const errors = watch(page);
    // Control the sampled frame intervals, while every frame still renders the production
    // stage. Removing a busy loop does not make software WebGL sustain 60 fps on CI.
    await page.addInitScript(() => {
      localStorage.setItem('invitation.look.v1', JSON.stringify({ pixelSize: '32' }));
      const raf = window.requestAnimationFrame.bind(window);
      let now = performance.now();
      let previous = -1;
      window.__governFrameMs = 16;
      window.requestAnimationFrame = (callback) =>
        raf((stamp) => {
          // All callbacks in one browser frame share the same clock.
          if (stamp !== previous) {
            now += window.__governFrameMs;
            previous = stamp;
          }
          callback(now);
        });
      performance.now = () => now;
    });
    await ready(page, '/invitation/?test&calm&seed=3&perf&govern');
    const base = await snapshot(page);
    expect(base.pass.governor.on).toBe(true);
    expect(base.pass.governor.level).toBe(0);
    const perf = page.locator('.inv-perf');
    await expect(perf).toContainText('fps');
    await expect(perf).toContainText(`${base.texels.w}×${base.texels.h} texels`);
    await page.evaluate(() => (window.__governFrameMs = 60));
    // One level coarser: a device pixel more a texel, fewer texels.
    await until(page, (s) => s.pass.governor.level === 1, 'a level coarser', 15_000);
    // Hold in the hysteresis band while checking the rendered grid.
    await page.evaluate(() => (window.__governFrameMs = 19));
    const coarse = await snapshot(page);
    expect(coarse.pass.pd).toBe(base.pass.pd + 1);
    expect(coarse.pixelScale).toBeCloseTo(base.pixelScale + 1 / devicePixelRatioOf(base), 6);
    expect(coarse.texels.w).toBeLessThan(base.texels.w);
    expect(coarse.resolution, 'the Pixel Size stays the user’s').toBe(32);
    await expect(perf).toContainText('(+1 slow)');
    // A measured run of fast frames restores the user's grid. Unit tests independently
    // check the recovery duration, no-help rollback, hysteresis and relapse behavior.
    await page.evaluate(() => (window.__governFrameMs = 16));
    await until(page, (s) => s.pass.governor.level === 0, 'back at the Pixel Size', 25_000);
    const back = await snapshot(page);
    expect(back.pass.pd).toBe(base.pass.pd);
    expect(back.pixelScale).toBe(base.pixelScale);
    expect(errors).toEqual([]);
  });

  test('zoomed in at 32×32 the texels grow with NEWT, so he stays about 32 pixels tall, and zoomed out they shrink; Native never changes', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('invitation.look.v1'))
        localStorage.setItem('invitation.look.v1', JSON.stringify({ pixelSize: '32' }));
    });
    await calm(page);
    const base = await snapshot(page);
    const canvas = page.locator('[data-stage] canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 60, box.y + 60);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
    await until(page, (s) => s.camera.distance < base.camera.distance * 0.75, 'zoomed in');
    await framesFor(page, 800);
    const near = await snapshot(page);
    const k = base.camera.distance / near.camera.distance;
    expect(near.pass.zoom).toBeCloseTo(k, 2);
    expect(near.pixelScale, 'bigger texels zoomed in').toBeGreaterThan(base.pixelScale);
    expect(Number.isInteger(near.pass.pd), 'whole device pixels').toBe(true);
    expect(near.newtTexels / 32).toBeGreaterThan(0.7);
    expect(near.newtTexels / 32).toBeLessThan(1.4);
    // Zoomed out past the default view: smaller texels (never under a device pixel).
    for (let i = 0; i < 14; i++) await page.mouse.wheel(0, 240);
    await until(page, (s) => s.camera.distance > base.camera.distance * 1.4, 'zoomed out');
    await framesFor(page, 800);
    const far = await snapshot(page);
    expect(far.pixelScale, 'smaller texels zoomed out').toBeLessThan(base.pixelScale);
    expect(far.pass.pd).toBeGreaterThanOrEqual(1);
    // Native: a texel a device pixel at any zoom.
    await page.evaluate(() => localStorage.setItem('invitation.look.v1', JSON.stringify({ pixelSize: 'native' })));
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await page.mouse.move(box.x + 60, box.y + 60);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
    await framesFor(page, 800);
    const native = await snapshot(page);
    expect(native.pass.pd).toBe(1);
  });
});

/** The device pixel ratio a snapshot was drawn at (CSS px a texel over device px a texel). */
const devicePixelRatioOf = (s) => s.pass.pd / s.pixelScale;

test("the portfolio's first load carries no invitation code", async ({ page }) => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  expect(html).not.toMatch(/invitation|newt\.glb|newt-face/i);
  // By content, not by file name: a shared chunk would pass a name check. Every script the
  // page loads up front, and every chunk those import, carries no invitation marker: the Look
  // store's key, the test hook, the pixel face sheet or the page's own words. (Not "newt" alone:
  // the site is Newton's.)
  const dist = new URL('../dist/', import.meta.url);
  const first = [...html.matchAll(/(?:src|href)="\/?((?:[^"/]+\/)*[^"/]+\.js)"/g)].map((m) => m[1]);
  expect(first.length).toBeGreaterThan(0);
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(new URL(file, dist), 'utf8');
    expect(code, file).not.toMatch(/invitation\.look\.v1|__invitation|newt-face|Play With NEWT/);
    for (const m of code.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) walk(`assets/${m[1]}`);
  };
  for (const file of first) walk(file.replace(/^.*?(assets\/)/, '$1'));
  const requested = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  expect(requested.filter((p) => /invitation|newt\.glb|newt-face/i.test(p))).toEqual([]);
});
