import { test, expect } from '@playwright/test';

test('page and duck survive a held breakdown and drop', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/visualizer/?world=newt&bench');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/);
  await page.click('[data-source="demo"]');
  await page.keyboard.press('a');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__viz.fire.snapshot().holding)).toBe(false);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.flame)).toBeTruthy();
  expect(errors).toEqual([]);
});
