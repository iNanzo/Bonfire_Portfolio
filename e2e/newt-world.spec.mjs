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
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live')).page)).toBe('cream');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live')).world)).toBe('bonfire');

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
    const png = await page.locator('.bonfire-canvas').screenshot();
    const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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
