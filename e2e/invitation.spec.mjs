// The invitation toy (/invitation/) in a real browser, on the production build: on a phone
// (390×844, touch) and a desktop (1280×800) it loads to ready with no errors and draws NEWT on
// his floor (not a blank canvas); it's unlisted (noindex); a Look change survives a reload and
// Pixel Size Off draws at native size; and the portfolio's first load carries none of its
// code. The behaviour tests (tapping, holding, the head following the finger, the buttons,
// floor taps, hover) are placeholders the integration step fills in: they wait on states
// through `?test`'s window.__invitation, never on durations (CI's software WebGL runs slower
// than real time), and drag with real touches (CDP Input.dispatchTouchEvent).
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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('loads to ready with no errors, draws NEWT, and is unlisted', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page).toHaveTitle('Invitation');
    const snap = await snapshot(page);
    expect(snap.ready).toBe(true);
    expect(snap.pixelScale).toBeGreaterThan(1);
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
    await sheet.getByRole('radio', { name: 'Chunky' }).check();
    await expect.poll(async () => (await snapshot(page)).pixelScale).toBeGreaterThan(6);
    await sheet.getByRole('radio', { name: 'Soft' }).check();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    const changed = await picture(page);
    expect(apart(before, changed)).toBeGreaterThan(2);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Look' }).click();
    await expect(sheet.getByRole('radio', { name: 'Chunky' })).toBeChecked();
    await expect(sheet.getByRole('radio', { name: 'Soft' })).toBeChecked();
    expect(errors).toEqual([]);
  });

  test.fixme('tapping NEWT plays Wave or Spook', async () => {});
  test.fixme('a touch drag holds him by the collar, and letting go gives fall, then land', async () => {});
  test.fixme('a finger moving across the floor turns his head', async () => {});
  test.fixme('each button plays its clip', async () => {});
  test.fixme('a floor tap walks him there', async () => {});
});

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('loads to ready with no errors and draws', async ({ page }) => {
    const errors = watch(page);
    await ready(page);
    const pic = await picture(page);
    expect(apart(pic, flat(pic))).toBeGreaterThan(3);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('Pixel Size Off draws at native size', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Look' }).click();
    await page.getByRole('dialog', { name: 'Look' }).getByRole('radio', { name: 'Off' }).check();
    await expect.poll(async () => (await snapshot(page)).pixelScale).toBe(1);
    const size = await page
      .locator('[data-stage] canvas')
      .evaluate((c) => [c.width, c.height, Math.min(devicePixelRatio, 2), innerWidth, innerHeight]);
    expect(size[0]).toBe(Math.ceil(size[3] * size[2]));
    expect(size[1]).toBe(Math.ceil(size[4] * size[2]));
  });

  test.fixme('hovering turns his head', async () => {});
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
