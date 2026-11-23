import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { PAGES } from '../src/visualizer/newt/pages.js';

const ready = async (page, path = '/visualizer/?world=newt&bench') => {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
};

test('the URL world lasts one visit and another setting change does not save it', async ({ page }) => {
  await ready(page);
  await expect.poll(() => page.evaluate(() => window.__viz.settings.world)).toBe('newt');
  await page.keyboard.press('s');
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="page"]').selectOption('cream');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live') ?? 'null')?.page ?? null))
    .toBe('cream');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live') ?? 'null')?.world)).toBe('bonfire');

  await ready(page, '/visualizer/?bench');
  await expect.poll(() => page.evaluate(() => window.__viz.settings.world)).toBe('bonfire');
  expect(await page.evaluate(() => typeof window.__viz.fire.snapshot)).toBe('undefined');
});

test('the empty NEWT canvas is exactly one page color on every page', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  for (const [key, paper] of Object.entries(PAGES)) {
    await page.evaluate((pageKey) => localStorage.setItem('bonfire-live', JSON.stringify({ page: pageKey })), key);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => window.__viz.settings.world)).toBe('newt');
    const dataUrl = await page.evaluate(async () => {
      const blob = await window.__viz.fire.capture();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    });
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    // The page remains flat outside NEWT and his shadow. This corner is outside the
    // centered Idle actor in the default framing; actor presence is checked separately.
    const { width, height } = await sharp(png).metadata();
    const { data } = await sharp(png)
      .extract({
        left: 0,
        top: 0,
        width: Math.max(1, Math.floor(width / 10)),
        height: Math.max(1, Math.floor(height / 10)),
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const colors = new Set();
    for (let i = 0; i < data.length; i += 3) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    const expected = `${(paper.color >> 16) & 255},${(paper.color >> 8) & 255},${paper.color & 255}`;
    expect([...colors], key).toEqual([expected]);
  }
});

test('page and duck survive a held breakdown and drop', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page);
  await page.click('[data-source="demo"]');
  await page.keyboard.press('a');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(false);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.flame)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Night drop builds page effects and Dusk fire leaves a darker scorch', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded-night')) {
      localStorage.setItem('bonfire-live', JSON.stringify({ page: 'night', pageTurns: 'off' }));
      sessionStorage.setItem('seeded-night', 'yes');
    }
  });
  await ready(page);
  await page.click('[data-source="demo"]');
  await page.keyboard.press('a');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().rings.marks)).toBeGreaterThan(0);
  await page.evaluate(() => localStorage.setItem('bonfire-live', JSON.stringify({ page: 'dusk', pageTurns: 'off' })));
  // A fresh visit avoids carrying the previous ring into the scorch comparison.
  await page.goto('/visualizer/?world=newt&bench');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  const capture = async () => {
    const dataUrl = await page.evaluate(async () => {
      const blob = await window.__viz.fire.capture();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    });
    const { data } = await sharp(Buffer.from(dataUrl.split(',')[1], 'base64'))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (let i = 0; i < data.length; i += 3)
      if (
        data[i] + data[i + 1] + data[i + 2] <
        PAGES.dusk.color
          .toString(16)
          .match(/../g)
          .reduce((s, v) => s + parseInt(v, 16), 0) -
          20
      )
        dark++;
    return dark;
  };
  const before = await capture();
  await page.evaluate(() => window.__viz.fire.onEvent('dropfx', { names: ['ring'] }));
  await expect.poll(capture, { timeout: 15_000 }).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

test('world hides bonfire controls and Page changes immediately without rebuilding', async ({ page }) => {
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-world', 'newt');
  await expect(page.locator('.viz-scene-chip')).toHaveCount(0);
  await expect(page.locator('.pack')).toBeHidden();
  await expect(page.locator('[data-act="combo"]')).toBeHidden();
  await expect(page.locator('[data-act="dance"]')).toBeHidden();
  await page.locator('canvas.bonfire-canvas').evaluate((canvas) => {
    canvas.dataset.sameWorld = 'yes';
  });
  await page.keyboard.press('s');
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="page"]').selectOption('cream');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().page.name)).toBe('Cream');
  await expect(page.locator('canvas.bonfire-canvas')).toHaveAttribute('data-same-world', 'yes');
  await page.locator('[data-set="world"]').selectOption('bonfire');
  await expect
    .poll(() => page.evaluate(() => typeof window.__viz.fire.snapshot), { timeout: 30_000 })
    .toBe('undefined');
  await expect(page.locator('html')).toHaveAttribute('data-world', 'bonfire');
  await expect(page.locator('.pack')).toBeVisible();
});

test('floating letter seal snapshots equal the half-texel values actually placed', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    void window.__viz.fire.equip('axe', 'ember', { hold: true });
  });
  const samples = [];
  for (let i = 0; i < 20; i++) {
    await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().letter?.seal ?? null)).not.toBeNull();
    samples.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const off = window.__viz.fire.onRendered(() => {
              off();
              resolve(window.__viz.fire.snapshot().letter.seal);
            });
          }),
      ),
    );
  }
  for (const seal of samples) {
    for (const value of [seal.x, seal.y, ...seal.axes]) expect(Number.isInteger(value * 2)).toBe(true);
    expect(seal.placedAt).toEqual({ x: seal.x, y: seal.y, axes: seal.axes });
  }
});

test('NEWT is ready on the page in Idle', async ({ page }) => {
  await ready(page);
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().newt?.clip)).toBe('Idle');
  expect(await page.evaluate(() => window.__viz.fire.snapshot().newt)).toEqual({
    state: 'idle',
    clip: 'Idle',
    grounded: true,
  });
});

test('a held letter at stage three emits a ring before release', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    void window.__viz.fire.equip('axe', 'ember', { hold: true });
  });
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
  const before = await page.evaluate(() => window.__viz.fire.snapshot().rings.marks);
  await page.evaluate(() => window.__viz.fire.onEvent('stage', { stage: 3 }));
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().rings.marks)).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
});

test('switching a playing Bonfire scene to NEWT clears the scene and its chips', async ({ page }) => {
  await ready(page, '/visualizer/?bench');
  const chip = page.locator('[data-scene-chip]').first();
  const ref = await chip.getAttribute('data-scene-chip');
  await chip.click();
  await expect.poll(() => page.evaluate(() => window.__viz.director.sceneRef)).toBe(ref);
  await page.keyboard.press('s');
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="world"]').selectOption('newt');
  await expect.poll(() => page.evaluate(() => typeof window.__viz.fire.snapshot), { timeout: 30_000 }).toBe('function');
  await expect(page.locator('.viz-scene-chip')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__viz.director.sceneRef)).toBeNull();
  await page.locator('[data-tab="scenes"]').click();
  await page.locator('[data-scene-play]').first().click();
  await expect(page.locator('[data-settings]')).toBeVisible();
  expect(await page.evaluate(() => window.__viz.director.sceneRef)).toBeNull();
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="world"]').selectOption('bonfire');
  await expect
    .poll(() => page.evaluate(() => typeof window.__viz.fire.snapshot), { timeout: 30_000 })
    .toBe('undefined');
  expect(await page.evaluate(() => window.__viz.director.sceneRef)).toBeNull();
});

test('a live Cream page change paints the corner and the whole frame in its palette', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('s');
  await page.locator('[data-tab="show"]').click();
  await page.locator('[data-set="page"]').selectOption('cream');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().page.name)).toBe('Cream');
  const url = await page.evaluate(async () => {
    const blob = await window.__viz.fire.capture();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  });
  const png = Buffer.from(url.split(',')[1], 'base64');
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const palette = new Set(PAGES.cream.palette);
  const unexpected = new Set();
  const corner = new Set();
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      if (!palette.has(color)) unexpected.add(color);
      if (x < Math.floor(info.width / 10) && y < Math.floor(info.height / 10)) corner.add(color);
    }
  expect([...corner]).toEqual([PAGES.cream.color]);
  expect([...unexpected]).toEqual([]);
});
