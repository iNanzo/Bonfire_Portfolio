// The invitation toy (/invitation/) in a real browser, on the production build: on a phone
// (390×844, touch) and a desktop (1280×800) it loads to ready with no errors and draws NEWT on his
// floor (not a blank canvas) in 2×2 CSS px texels; it's unlisted (noindex); a Look change (4×: 4×4
// CSS px texels) survives a reload and Pixel Size Off draws at native size; and the portfolio's
// first load carries none of its code. Playing with him: a tap makes him wave or start, a touch
// drag holds him by the collar and letting go drops him (fall, then land), a finger on the floor
// turns his head, each button plays its clip, a floor tap walks him there, and the cursor turns his
// head on a desktop. The camera: a drag on empty space turns it, the wheel and a two-finger pinch
// zoom it, and Reset Camera brings it back. Every wait is on a state through `?test`'s
// window.__invitation, never on a duration (CI's software WebGL runs slower than real time), and
// touches are real ones (CDP Input.dispatchTouchEvent).
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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('loads to ready with no errors, draws NEWT, and is unlisted', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page).toHaveTitle('Invitation');
    const snap = await snapshot(page);
    expect(snap.ready).toBe(true);
    expect(snap.pixelScale, '2× by default: a texel is 2×2 CSS px').toBe(2);
    // Not a blank canvas: NEWT on the plain background, far from one flat colour.
    const pic = await picture(page);
    expect(apart(pic, flat(pic))).toBeGreaterThan(3);
    // NEWT stands where the hooks say, clear of the screen's edges.
    const head = await page.evaluate(() => window.__invitation.screen('head'));
    const box = await page.locator('[data-stage]').boundingBox();
    expect(head.x).toBeGreaterThan(box.x + 24);
    expect(head.x).toBeLessThan(box.x + box.width - 24);
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

  test('a Look change shows at once and survives a reload', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    const before = await picture(page);
    await page.getByRole('button', { name: 'Look' }).click();
    const sheet = page.getByRole('dialog', { name: 'Look' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('radio', { name: '4×', exact: true }).check();
    await expect.poll(async () => (await snapshot(page)).pixelScale).toBe(4);
    await sheet.getByRole('radio', { name: 'Soft' }).check();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    const changed = await picture(page);
    expect(apart(before, changed)).toBeGreaterThan(2);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Look' }).click();
    await expect(sheet.getByRole('radio', { name: '4×', exact: true })).toBeChecked();
    expect((await snapshot(page)).pixelScale).toBe(4);
    await expect(sheet.getByRole('radio', { name: 'Soft' })).toBeChecked();
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
});

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('loads to ready with no errors and draws', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    expect((await snapshot(page)).pixelScale, '2× by default').toBe(2);
    const pic = await picture(page);
    expect(apart(pic, flat(pic))).toBeGreaterThan(3);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('Pixel Size Off draws at native size', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Look' }).click();
    await page.getByRole('dialog', { name: 'Look' }).getByRole('radio', { name: 'Off', exact: true }).check();
    await expect.poll(async () => (await snapshot(page)).pixelScale).toBe(1);
    const size = await page
      .locator('[data-stage] canvas')
      .evaluate((c) => [c.width, c.height, Math.min(devicePixelRatio, 2), innerWidth, innerHeight]);
    expect(size[0]).toBe(Math.ceil(size[3] * size[2]));
    expect(size[1]).toBe(Math.ceil(size[4] * size[2]));
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
