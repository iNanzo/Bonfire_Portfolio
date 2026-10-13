// The invitation toy (/invitation/) in a real browser, on the production build: on a phone
// (390×844, touch) and a desktop (1280×800) it loads to ready with no errors and draws NEWT on his
// floor (not a blank canvas) in 2×2 CSS px texels; it's unlisted (noindex); a Look change (24×24:
// 4×4 CSS px texels) survives a reload, Pixel Size Native draws a texel a device pixel at a phone's
// full DPR with the pixel look on (and survives a reload), and Off draws smooth at the screen's
// resolution (its smooth face reported as such); and the portfolio's
// first load carries none of its code; the pixel atlas and face load alongside the glb and the
// first frame waits for them. NEWT stands about a quarter of a phone's short side tall
// (a fifth of a desktop's), and running off to the rim never takes him off a phone's screen.
// Playing with him: a tap makes him wave or start, a touch
// drag holds him by the collar and letting go drops him (fall, then land), a finger on the floor
// turns his head, each button plays its clip, a floor tap walks him there, and the cursor turns his
// head on a desktop. The camera: a drag on empty space turns it, the wheel and a two-finger pinch
// zoom it, and Reset Camera brings it back. A pinch over the toolbar or the Look sheet never
// zooms the page, only the left mouse button holds or walks him, and the Look sheet holds focus
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
/** How far apart two pictures are (the mean difference per channel). */
const apart = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
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
 * canvas, not the Look sheet or the toolbar over it.
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
/** Opens the Look sheet and waits until NEWT shows whole beside or above it. */
async function lookOpenWithNewtInSight(page) {
  await page.getByRole('button', { name: 'Look' }).click();
  await expect(page.getByRole('dialog', { name: 'Look' })).toBeVisible();
  let last = null;
  await expect
    .poll(async () => allSeen((last = await inView(page))), {
      message: 'his head, middle and feet in sight with the Look sheet open',
    })
    .toBe(true);
  return last;
}
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
/** The Look sheet's scroll: how far down it is and how far it can go, CSS px. */
const sheetScroll = (page) =>
  page.locator('.inv-sheet').evaluate((el) => ({ top: el.scrollTop, room: el.scrollHeight - el.clientHeight }));
/**
 * A real finger swiping straight up from the Pixel Size slider's track, well away from its thumb
 * (144 px in 12 moves), with the Look sheet open. Returns the slider's value text before it.
 */
async function swipeUpFromSlider(page) {
  const pixel = page.getByRole('dialog', { name: 'Look' }).getByRole('slider', { name: 'Pixel Size' });
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
    // 48×48 by default: NEWT about 48 texels tall, a texel 6 device px (2×2 CSS px) here.
    expect(snap.resolution).toBe(48);
    expect(snap.pixelScale, 'a texel is 2×2 CSS px').toBe(2);
    expect(snap.newtTexels).toBeCloseTo(49.7, 0);
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
    // The toolbar: every button a thumb's height, labelled.
    for (const name of ['Wave', 'Spook', 'Sit', 'Run', 'Wander', 'Look']) {
      const b = page.getByRole('button', { name, exact: true });
      await expect(b).toBeVisible();
      expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole('button', { name: 'Wander' })).toHaveAttribute('aria-pressed', /true|false/);
    await expect(page.locator('[title]')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('the pixel atlas and the pixel face load alongside the glb, and the first frame waits for them', async ({
    page,
  }) => {
    const errors = watch(page);
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

  test('a Look change shows at once and survives a reload', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    const before = await picture(page);
    await page.getByRole('button', { name: 'Look' }).click();
    const sheet = page.getByRole('dialog', { name: 'Look' });
    await expect(sheet).toBeVisible();
    // Pixel Size, a slider: from the coarse end one step finer by the keyboard, 24×24 (NEWT about
    // 24 texels tall: 12 device px, 4 CSS px a texel here).
    const pixel = sheet.getByRole('slider', { name: 'Pixel Size' });
    await expect(pixel).toHaveAttribute('aria-valuetext', '48 by 48');
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
    await sheet.getByRole('radio', { name: 'Soft' }).check();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    const changed = await picture(page);
    expect(apart(before, changed)).toBeGreaterThan(2);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Look' }).click();
    await expect(sheet.getByRole('slider', { name: 'Pixel Size' })).toHaveAttribute('aria-valuetext', '24 by 24');
    expect((await snapshot(page)).resolution).toBe(24);
    expect((await snapshot(page)).pixelScale).toBe(4);
    await expect(sheet.getByRole('radio', { name: 'Soft' })).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('Pixel Size Native, the step before Off, draws a texel a device pixel (a third of a CSS px here) with the pixel look on, and survives a reload', async ({
    page,
  }) => {
    const errors = watch(page);
    await ready(page);
    await page.getByRole('button', { name: 'Look' }).click();
    const sheet = page.getByRole('dialog', { name: 'Look' });
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
    await page.getByRole('button', { name: 'Look' }).click();
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
    await page.getByRole('button', { name: 'Look' }).click();
    const sheet = page.getByRole('dialog', { name: 'Look' });
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
    await page.getByRole('button', { name: 'Look' }).click();
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

  test('a finger on the floor turns his head toward it, left and then right', async ({ page }) => {
    await calm(page);
    const touch = await toucher(page);
    const body = await on(page, 'body');
    for (const [side, ok] of [
      [-1, (s) => s.headYaw < -0.15],
      [1, (s) => s.headYaw > 0.15],
    ]) {
      const t0 = Date.now();
      await touch('touchStart', [{ x: body.x + side * 140, y: body.y + 40 }]);
      await until(page, ok, `his head turned ${side < 0 ? 'left' : 'right'}`);
      await sleep(Math.max(0, 650 - (Date.now() - t0))); // (a press held this long is no floor tap)
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
    await press('Spook');
    await until(page, (s) => s.clip === 'Spook', 'Spook');
    await press('Sit');
    await until(page, (s) => s.clip === 'Sit' && s.state === 'sit', 'sitting', 30_000);
    await expect(page.locator('[data-button="Sit"]')).toHaveText('Stand');
    await press('Sit');
    await until(page, (s) => s.clip === 'StandUp', 'standing up');
    await expect(page.locator('[data-button="Sit"]')).toHaveText('Sit');
    await press('Run');
    await until(page, (s) => s.state === 'flee' && s.clip === 'Run', 'running', 30_000);
    const wander = page.locator('[data-button="Wander"]');
    const before = await wander.getAttribute('aria-pressed');
    await press('Wander');
    await expect(wander).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    expect(errors).toEqual([]);
  });

  test('running off to the rim never takes him off the screen: the camera follows him', async ({ page }) => {
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
          const t0 = performance.now();
          const tick = () => {
            const s = inv.snapshot();
            out.push({
              head: inv.screen('head'),
              body: inv.screen('body'),
              feet: inv.screen('feet'),
              state: s.state,
              r: Math.hypot(s.pos.x, s.pos.z),
            });
            if (performance.now() - t0 < 3500) requestAnimationFrame(tick);
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

  test('a two-finger pinch over the toolbar or the Look sheet never zooms the page', async ({ page }) => {
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
    await page.getByRole('button', { name: 'Look' }).click();
    await spread(await page.locator('.inv-sheet').boundingBox());
    expect(await scale(), 'the page after a pinch over the Look sheet').toBe(1);
  });

  test('a swipe up that starts on the Pixel Size slider leaves the Pixel Size as it was', async ({ page }) => {
    await recordSaves(page);
    await calm(page);
    await page.getByRole('button', { name: 'Look' }).click();
    const sheet = page.getByRole('dialog', { name: 'Look' });
    await expect(sheet).toBeVisible();
    const was = (await snapshot(page)).resolution;
    const before = await swipeUpFromSlider(page);
    await framesFor(page, 300);
    await expect(sheet.getByRole('slider', { name: 'Pixel Size' })).toHaveAttribute('aria-valuetext', before);
    expect(await page.evaluate(() => window.__saved), 'nothing saved').toEqual([]);
    expect((await snapshot(page)).resolution).toBe(was);
  });

  test('with the Look sheet open NEWT stays in sight above it, so its changes show on him', async ({ page }) => {
    await calm(page);
    const v = await lookOpenWithNewtInSight(page);
    const sheet = await page.locator('.inv-sheet').boundingBox();
    expect(v.feet.y, 'his feet over the sheet').toBeLessThan(sheet.y);
    expect(v.head.y, 'his head on the screen').toBeGreaterThan(0);
  });
});

test.describe('on a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('a swipe up that starts on the Pixel Size slider scrolls the sheet and leaves the Pixel Size be; a drag along it still passes every step', async ({
    page,
  }) => {
    await recordSaves(page);
    await calm(page);
    await page.getByRole('button', { name: 'Look' }).click();
    const sheet = page.getByRole('dialog', { name: 'Look' });
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
    // A drag along it from its coarse end: every step on the way is the Pixel Size in turn, and
    // the sheet stays where it is.
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

  test('with the Look sheet open NEWT stays in sight beside it', async ({ page }) => {
    await calm(page);
    const v = await lookOpenWithNewtInSight(page);
    const sheet = await page.locator('.inv-sheet').boundingBox();
    const beside = v.head.x < sheet.x || v.head.x > sheet.x + sheet.width;
    expect(beside, `his head at x ${v.head.x}, the sheet from ${sheet.x} to ${sheet.x + sheet.width}`).toBe(true);
  });
});

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('loads to ready with no errors and draws', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    const snap = await snapshot(page);
    // 48×48 by default: NEWT 156 CSS px tall, so a texel is 3 px and he's 52 texels tall.
    expect(snap.resolution).toBe(48);
    expect(snap.pixelScale).toBe(3);
    expect(snap.newtTexels).toBeCloseTo(52, 0);
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
    await page.getByRole('button', { name: 'Look' }).click();
    const sheet = page.getByRole('dialog', { name: 'Look' });
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

  test('Escape closes the Look sheet after a click or a drag on the canvas too, and focus goes back to Look', async ({
    page,
  }) => {
    await calm(page);
    const look = page.getByRole('button', { name: 'Look' });
    const sheet = page.getByRole('dialog', { name: 'Look' });
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

  test('the Look sheet holds focus: it opens on Done, Tab goes round inside it, and the toolbar behind it is out of reach', async ({
    page,
  }) => {
    await calm(page);
    const look = page.getByRole('button', { name: 'Look' });
    const sheet = page.getByRole('dialog', { name: 'Look' });
    const toolbarInert = () => page.locator('.inv-toolbar').evaluate((el) => el.inert);
    await look.focus();
    await page.keyboard.press('Enter');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet.getByRole('button', { name: 'Done' })).toBeFocused();
    expect(await toolbarInert(), 'the toolbar under the sheet is inert').toBe(true);
    /** What has focus, and whether it's in the sheet. */
    const focused = () =>
      page.evaluate(() => {
        const a = /** @type {HTMLElement} */ (document.activeElement);
        const what = a.dataset?.look ? `${a.dataset.look}=${a.getAttribute('value') ?? ''}` : a.textContent?.trim();
        return { inside: Boolean(a.closest('.inv-sheet')), what: `${a.tagName} ${what}` };
      });
    const stops = new Set();
    for (let i = 1; i <= 20; i++) {
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
    // Motion and Reset Camera.
    expect(stops.size, [...stops].join(', ')).toBe(9);
    // Focus on the page (a click on empty space): Tab comes back into the sheet.
    await page.mouse.click(200, 120);
    await page.keyboard.press('Tab');
    expect((await focused()).inside, 'Tab from the page').toBe(true);
    await page.keyboard.press('Escape');
    await expect(look).toBeFocused();
    expect(await toolbarInert(), 'the toolbar back in reach').toBe(false);
  });

  test('with the Look sheet open NEWT stays in sight, and Reset Camera eases back where it can be seen', async ({
    page,
  }) => {
    await calm(page);
    const body = await on(page, 'body');
    const home = (await snapshot(page)).camera;
    // Round and up a long way first.
    await page.mouse.move(body.x + 300, body.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(body.x + 300 - i * 22, body.y + 60 + i * 6);
    await page.mouse.up();
    await until(page, (s) => Math.abs(s.camera.yaw) > 0.8, 'turned');
    await lookOpenWithNewtInSight(page);
    await page.getByRole('dialog', { name: 'Look' }).getByRole('button', { name: 'Reset Camera' }).click();
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
    for (const [i, f] of frames.entries())
      expect(f.head && f.body && f.feet, `frame ${i} (yaw ${f.yaw.toFixed(2)}): ${JSON.stringify(f)}`).toBe(true);
  });

  test('hovering turns his head', async ({ page }) => {
    await calm(page);
    const body = await on(page, 'body');
    await page.mouse.move(body.x - 220, body.y + 60);
    await until(page, (s) => s.headYaw < -0.15, 'his head turned left');
    await page.mouse.move(body.x + 220, body.y + 60, { steps: 4 });
    await until(page, (s) => s.headYaw > 0.15, 'his head turned right');
  });

  test('a drag on empty space turns the camera, the wheel zooms it, and Reset Camera brings it back', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const body = await on(page, 'body');
    const home = (await snapshot(page)).camera;
    expect(Math.abs(home.yaw)).toBeLessThan(1e-3);
    // A drag across empty floor: round it goes, and NEWT stays where he was.
    await page.mouse.move(body.x + 260, body.y + 80);
    await page.mouse.down();
    for (let i = 1; i <= 15; i++) await page.mouse.move(body.x + 260 - i * 16, body.y + 80 + i * 3);
    await page.mouse.up();
    await until(page, (s) => Math.abs(s.camera.yaw) > 0.5, 'turned');
    await until(page, (s) => s.camera.elevation > home.elevation + 0.05, 'tilted up a little');
    // By the stage's width: 240 of its 1280 px turn it about 0.88 rad (three quarters of a turn
    // across the whole width), plus a little coast; never the 2.2 rad of 2π per 700 px.
    let settled = NaN;
    await expect
      .poll(async () => {
        const was = settled;
        settled = (await snapshot(page)).camera.yaw;
        return Math.abs(settled - was) < 1e-4;
      }, 'the turn settles')
      .toBe(true);
    expect(Math.abs(settled), `turned ${settled.toFixed(2)} rad`).toBeGreaterThan(0.7);
    expect(Math.abs(settled), `turned ${settled.toFixed(2)} rad`).toBeLessThan(1.6);
    let s = await snapshot(page);
    expect(s.state).toBe('idle');
    expect(s.held).toBe(false);
    // The wheel: toward you further, away from you closer.
    await page.mouse.move(body.x + 200, body.y);
    await page.mouse.wheel(0, 400);
    await until(page, (t) => t.camera.distance > home.distance * 1.3, 'zoomed out');
    await page.mouse.wheel(0, -1200);
    await until(page, (t) => t.camera.distance < home.distance * 0.8, 'zoomed in');
    // Reset Camera: back to the default view.
    await page.getByRole('button', { name: 'Look' }).click();
    await page.getByRole('dialog', { name: 'Look' }).getByRole('button', { name: 'Reset Camera' }).click();
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
});

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
