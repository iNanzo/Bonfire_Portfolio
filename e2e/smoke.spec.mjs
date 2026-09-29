// Smoke tests: every screen and Bonfire Live load in a real browser with no errors, the
// bonfire draws, and the main controls answer (Q/E, Esc, the pack, the demo track).
import { test, expect } from '@playwright/test';

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

const SCREENS = [
  ['/', 'Newton Hoang'],
  ['/projects/', 'Project Inventory'],
  ['/experience/', 'Journey'],
  ['/skills/', 'Skills'],
  ['/about/', 'About'],
  ['/contact/', 'Contact'],
];

for (const [path, heading] of SCREENS) {
  test(`${path} loads, draws the bonfire, no errors`, async ({ page }) => {
    const errors = watch(page);
    await page.goto(path);
    await expect(page.locator('section.screen:not([hidden]) h1')).toHaveText(heading);
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    const drawn = await page.locator('.bonfire-canvas').evaluate((c) => c.width > 1 && c.height > 1);
    expect(drawn).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('a project opens from the inventory and Esc goes back', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/projects/');
  await page.locator('.slot-item').first().click();
  await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+\/$/);
  await expect(page.locator('#detail-title')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/projects\/$/);
  expect(errors).toEqual([]);
});

test('Q and E step through the screens; the tabs stay centered', async ({ page }) => {
  await page.goto('/experience/');
  await page.keyboard.press('e');
  await expect(page).toHaveURL(/\/skills\/$/);
  await page.keyboard.press('q');
  await page.keyboard.press('q');
  await expect(page).toHaveURL(/\/projects\/$/);
  const { mid, vw } = await page.locator('.tabs').evaluate((t) => { const r = t.getBoundingClientRect(); return { mid: r.left + r.width / 2, vw: innerWidth }; });
  expect(Math.abs(mid - vw / 2)).toBeLessThan(2);
});

test('the pack opens and swaps the scene', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await page.hover('[data-pack-toggle]');
  // The items rise in stepped frames (which can look settled mid-rise): let them land first.
  await page.waitForFunction(() => document.querySelector('.pack-items').getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
  await page.hover('[data-pack-slot="map"]');
  const shrine = page.locator('[data-pack-option="shrine"]');
  await expect(shrine).toBeVisible();
  await shrine.click();
  await expect(page.locator('[data-pack-option="shrine"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('Bonfire Live starts the demo track', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/visualizer/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('[data-home-link]')).toBeVisible();
  await page.click('[data-source="demo"]');
  await expect(page.locator('[data-hud]')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('Bonfire Live’s page takes this one apart (the breakdown)', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/projects/bonfire-live/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await page.getByRole('link', { name: /Take This Page Apart/ }).click();
  await expect(page.locator('html')).toHaveClass(/is-breakdown/);
  expect(errors).toEqual([]);
});
