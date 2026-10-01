// The portfolio site's menus (round 10): the Menu button at every width (Discoveries is only
// in it), its two groups (Go To hides where the header has tabs) and its arrow keys, the
// keyboard shortcuts (?), the pack's Anvil and Spell Tome in labelled groups, the render
// settings from the menu (touch too: a close button, no P to press) with the cursor's pick
// remembered, and the keys that mustn't fire while typing or with Shift.
import { test, expect } from '@playwright/test';

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
const ready = (page) => expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '');

test('the Menu button shows on desktop; Go To hides there (the tabs do it), Tools opens Discoveries', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await ready(page);
  const open = page.locator('[data-menu-open]');
  await expect(open).toBeVisible();
  await open.click();
  const menu = page.locator('[data-menu]');
  await expect(menu).toBeVisible();
  await expect(page.getByRole('group', { name: 'Tools' })).toBeVisible();
  await expect(page.locator('.menu-go-to')).toBeHidden();
  // Focus starts on the first item that shows, and the arrows skip the hidden ones.
  expect(await focusedText(page)).toMatch(/^Photo Mode/);
  await page.keyboard.press('ArrowUp');
  expect(await focusedText(page)).toMatch(/^Close/);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await focusedText(page)).toMatch(/^How It’s Made/);
  // Discoveries: the dialog, with every discovery (found or a hint).
  await page.getByRole('button', { name: /^Discoveries/ }).click();
  const list = page.locator('[data-discoveries]');
  await expect(list).toBeVisible();
  await expect(menu).toBeHidden();
  expect(await list.locator('.discovery').count()).toBeGreaterThan(20);
  await expect(list.locator('[data-discovery-count]')).toHaveText(/^\d+ \/ \d+$/);
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  expect(errors).toEqual([]);
});

test('a phone: the menu has Go To and Tools, and nothing needs a scroll to reach', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = watch(page);
  await page.goto('/');
  await ready(page);
  await page.locator('[data-menu-open]').tap();
  await expect(page.getByRole('group', { name: 'Go To' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Tools' })).toBeVisible();
  const close = page.locator('[data-menu] [data-menu-close]');
  const box = await close.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(844);
  await page.getByRole('link', { name: 'Skills' }).first().tap();
  await expect(page).toHaveURL(/\/skills\/$/);
  await expect(page.locator('[data-menu]')).toBeHidden();
  expect(errors).toEqual([]);
  await context.close();
});

test('? lists every key; Esc closes it; Shift with a letter does nothing', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/experience/');
  await ready(page);
  await page.locator('#experience-title').focus();
  await page.keyboard.press('Shift+E'); // (not E: no step to the next screen)
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/experience\/$/);
  await page.keyboard.press('Shift+Slash');
  const keys = page.locator('.keys-overlay');
  await expect(keys).toBeVisible();
  await expect(keys.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();
  for (const k of ['Q', 'E', 'F', 'B', 'I', 'P', '0', '?', '1–6']) await expect(keys.locator('kbd', { hasText: new RegExp(`^${k.replace('?', '\\?')}$`) }).first()).toBeVisible();
  // Its filter narrows the list as you type (and typing there is just typing).
  await page.keyboard.type('photo');
  await expect(keys.locator('[data-keys-row]:visible')).toHaveCount(1);
  await page.keyboard.press('Escape'); // (clears the filter)
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  // From the menu too.
  await page.locator('[data-menu-open]').click();
  await page.getByRole('button', { name: /^Keyboard Shortcuts/ }).click();
  await expect(keys).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  await expect(page).toHaveURL(/\/experience\/$/);
  expect(errors).toEqual([]);
});

test('typing in the shortcuts’ filter over the breakdown types: b doesn’t close it, p doesn’t open the render settings', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await ready(page);
  await page.keyboard.press('b');
  await expect(page.locator('html')).toHaveClass(/is-breakdown/);
  await page.keyboard.press('Shift+Slash');
  const filter = page.locator('.keys-overlay [data-keys-filter]');
  await expect(filter).toBeFocused();
  await page.keyboard.type('bp1');
  await expect(filter).toHaveValue('bp1');
  await expect(page.locator('html')).toHaveClass(/is-breakdown/);
  await expect(page.locator('.breakdown [data-render-row="pixel"]')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); // (the overlay, not the breakdown)
  await expect(page.locator('.keys-overlay')).toBeHidden();
  await expect(page.locator('html')).toHaveClass(/is-breakdown/);
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveClass(/is-breakdown/);
  expect(errors).toEqual([]);
});

test('the pack’s Anvil: the living weapon first, then the weapons in labelled groups; the Tome’s Elements and Flame Colors', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await ready(page);
  await page.locator('[data-pack-toggle]').click();
  await page.waitForFunction(() => document.querySelector('.pack-items').getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
  await page.locator('[data-pack-slot="anvil"]').click();
  const anvil = page.locator('[data-pack-list="anvil"]');
  await expect(anvil).toBeVisible();
  await expect(anvil.locator('[data-pack-option]').first()).toHaveAttribute('data-pack-option', 'living');
  const groups = anvil.getByRole('group');
  await expect(groups).toHaveCount(4);
  for (const [name, has, hasNot] of [['Swords', 'longsword', 'spear'], ['Greatswords', 'claymore', 'mace'], ['Polearms', 'wingedspear', 'katana'], ['Axes & Hammers', 'warhammer', 'longsword']]) {
    const g = anvil.getByRole('group', { name, exact: true });
    await expect(g).toBeVisible();
    await expect(g.locator(`[data-pack-option="${has}"]`)).toHaveCount(1);
    await expect(g.locator(`[data-pack-option="${hasNot}"]`)).toHaveCount(0);
  }
  await expect(anvil.locator('[aria-hidden="true"].pack-heading')).toHaveCount(0);
  expect(await anvil.locator('[data-pack-option]').count()).toBe(24); // (23 weapons and the living weapon)
  await page.locator('[data-pack-slot="tome"]').click();
  const tome = page.locator('[data-pack-list="tome"]');
  await expect(tome.getByRole('group', { name: 'Elements' })).toBeVisible();
  await expect(tome.getByRole('group', { name: 'Flame Colors' })).toBeVisible();
  await expect(tome.locator('[data-pack-option="living"]')).toHaveCount(0);
  await expect(tome.locator('[data-pack-option="element:ice"]')).toHaveAttribute('data-tip', /forges a new weapon/i);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('render settings from the menu: grouped rows with their keys; the cursor’s pick survives a reload; Reset forgets it', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await ready(page);
  await page.locator('[data-menu-open]').click();
  await page.getByRole('button', { name: /^Render Settings/ }).click();
  const hud = page.locator('.debug-hud');
  await expect(hud).toBeVisible();
  await expect(hud.locator('[data-render-row="pixel"]')).toBeFocused();
  await expect(hud.getByRole('group', { name: 'Picture' })).toBeVisible();
  const cursor = hud.getByRole('group', { name: 'Interaction' }).locator('[data-render-row="interaction"]');
  await expect(cursor).toHaveAttribute('aria-keyshortcuts', '6');
  await expect(hud.locator('[data-render-reset]')).toContainText('Reset Render Settings');
  const was = (await cursor.locator('b').textContent()).trim();
  await cursor.click();
  const now = (await cursor.locator('b').textContent()).trim();
  expect(now).not.toBe(was);
  expect(await page.evaluate(() => localStorage.getItem('fireInteraction'))).toBeTruthy();
  await page.reload();
  await ready(page);
  await page.keyboard.press('p');
  await expect(hud).toBeVisible();
  await expect(hud.locator('[data-render-row="interaction"] b')).toHaveText(now);
  // Reset: the site's own cursor again, and nothing remembered.
  await hud.locator('[data-render-reset]').click();
  await expect(hud.locator('[data-render-row="interaction"] b')).toHaveText(was);
  expect(await page.evaluate(() => localStorage.getItem('fireInteraction'))).toBeNull();
  // The close button.
  await hud.locator('[data-render-close]').click();
  await expect(hud).toBeHidden();
  expect(errors).toEqual([]);
});

test('touch: Render Settings opens from the menu and its close button closes it', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = watch(page);
  await page.goto('/');
  await ready(page);
  await page.locator('[data-menu-open]').tap();
  await page.getByRole('button', { name: /^Render Settings/ }).tap();
  const hud = page.locator('.debug-hud');
  await expect(hud).toBeVisible();
  const close = hud.getByRole('button', { name: 'Close Render Settings' });
  await expect(close).toBeVisible();
  await hud.locator('[data-render-row="outlines"]').tap();
  await close.tap();
  await expect(hud).toBeHidden();
  expect(errors).toEqual([]);
  await context.close();
});
