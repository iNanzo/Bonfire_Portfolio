// Bonfire Live's tooltips in a real browser (the shared tooltip, src/ui/tooltip.js, measured
// with e2e/lib/tips.mjs): every "?" and every other tip in each settings tab (All Settings),
// on a laptop (1280×720: hovered and reached by the keyboard) and on a phone (390×844 with
// touch: tapped). Each tip shows its own words, stays 8 px inside the window and doesn't cover
// what opened it; Esc hides it and leaves the dialog open. The start screen's and the HUD's
// tips too, and no native title tooltip anywhere in Bonfire Live's own UI.
import { test, expect } from '@playwright/test';
import { collectTips, checkTip, assertInViewport, tipOf } from './lib/tips.mjs';

// Each test opens a page of its own, so they can run side by side: with two workers, and
// split between CI's shards (this file is a third of the suite's time; .github/workflows/ci.yml).
test.describe.configure({ mode: 'parallel' });

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

const SIZES = {
  laptop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};
const TABS = ['sound', 'show', 'drops', 'picture', 'effects', 'camera', 'cast', 'scenes', 'setups'];

/** Bonfire Live's settings open on `tab`, All Settings showing (saved as the view). */
async function openTab(page, tab, { touch = false } = {}) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('bonfire-live', JSON.stringify({ view: 'all' })); }
  });
  await page.goto('/visualizer/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  const settings = page.locator('[data-start] [data-act="settings"]');
  if (touch) await settings.tap(); else await settings.click();
  await expect(page.locator('[data-settings]')).toBeVisible();
  await expect(page.locator('[data-settings] form')).toHaveAttribute('data-view', 'all');
  const button = page.locator(`[data-tab="${tab}"]`);
  if (touch) await button.tap(); else await button.click();
  await expect(page.locator(`#viz-tab-${tab}`)).toBeVisible();
}

/** How long a tip may take to show or go (ms): software-rendered WebGL starves a busy runner. */
const SLOW = 10_000;

/**
 * Close the tip left open by the last check (`via`: how it was opened), waiting as long as a
 * busy machine needs. A hovered or focused one goes as the pointer and the focus leave; a
 * tapped one stays until Esc. Esc is pressed only while a tip shows: with none, it closes the
 * dialog (and the focus going back to Settings would show that button's tip instead).
 * @param {import('@playwright/test').Page} page @param {string} [via]
 */
async function settle(page, via) {
  const tip = tipOf(page);
  if (!(await tip.isVisible())) return;
  if (via !== 'tap') {
    await page.mouse.move(0, 0);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    if (await tip.waitFor({ state: 'hidden', timeout: SLOW }).then(() => true, () => false)) return;
  }
  if (await tip.isVisible()) await page.keyboard.press('Escape');
  await expect(tip).toBeHidden({ timeout: SLOW });
}

/**
 * Every trigger under `root`, opened each way in `modes`: the ones whose tip didn't show, left
 * the window's edges, or covered its trigger. Returns how the last tip was opened too.
 */
async function sweep(page, root, modes) {
  const bad = [];
  const triggers = await collectTips(page, root);
  let via = '';
  for (const trigger of triggers) {
    const what = (await trigger.getAttribute('aria-label')) ?? (await trigger.getAttribute('data-tip'))?.slice(0, 40);
    for (const mode of modes) {
      // (A tap opens a "?"; other triggers say their piece to a pointer or the keyboard. The
      // HUD's meter and beat pips are pictures, hidden from screen readers: a pointer's only.)
      if (mode === 'tap' && !(await trigger.evaluate((el) => el.matches('.viz-tip')))) continue;
      if (mode === 'focus' && (await trigger.evaluate((el) => el.closest('[aria-hidden="true"]') && el.tabIndex < 0))) continue;
      await settle(page, via);
      const r = await checkTip(page, trigger, { mode, timeout: SLOW });
      via = r.via;
      if (!r.shown) { bad.push(`${mode} ${what}: didn't show`); continue; }
      const { rect, viewport } = r;
      const inside = rect.x >= 7.5 && rect.y >= 7.5 && rect.x + rect.width <= viewport.width - 7.5 && rect.y + rect.height <= viewport.height - 7.5;
      if (!inside) bad.push(`${mode} ${what}: outside the window (${JSON.stringify(rect)})`);
      if (r.coversTrigger) bad.push(`${mode} ${what}: covers its trigger`);
    }
  }
  return { bad, count: triggers.length, via };
}

for (const [size, opts] of Object.entries(SIZES)) {
  test.describe(`tips on a ${size}`, () => {
    test.use(opts);
    for (const tab of TABS) {
      test(`${tab}: every tip shows on screen, clear of what opened it`, async ({ page }) => {
        test.setTimeout(240_000);
        const errors = watch(page);
        const touch = size === 'phone';
        await openTab(page, tab, { touch });
        const { bad, count, via } = await sweep(page, `#viz-tab-${tab}`, touch ? ['tap'] : ['hover', 'focus']);
        expect(count, `${tab} has tips`).toBeGreaterThan(tab === 'setups' ? 1 : 3);
        expect(bad).toEqual([]);
        // Esc hides a tip and leaves the dialog open.
        const first = (await collectTips(page, `#viz-tab-${tab} .viz-tip`))[0] ?? (await collectTips(page, `#viz-tab-${tab}`))[0];
        const tappable = await first.evaluate((el) => el.matches('.viz-tip'));
        await settle(page, via);
        const r = await checkTip(page, first, { mode: touch && tappable ? 'tap' : 'hover', timeout: SLOW });
        expect(r.shown).toBe(true);
        assertInViewport(r.rect, r.viewport);
        await page.keyboard.press('Escape');
        await expect(tipOf(page)).toBeHidden({ timeout: SLOW });
        await expect(page.locator('[data-settings]')).toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  });
}

test('the dialog’s header tips, the start screen’s and the HUD’s: on screen, clear of their triggers', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/visualizer/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  // The start screen: each sound source's tip beside it, its presets and its buttons.
  let result = await sweep(page, '[data-start]', ['hover']);
  expect(result.bad).toEqual([]);
  await settle(page, result.via);
  const source = await checkTip(page, page.locator('[data-source="demo"]'), { mode: 'hover', timeout: SLOW });
  const at = await page.locator('[data-source="demo"]').boundingBox();
  expect(source.rect.x, 'beside its source, to the right').toBeGreaterThan(at.x + 40);
  // The dialog's header (presets, close).
  await settle(page, 'hover');
  await page.keyboard.press('s');
  result = await sweep(page, '.viz-settings-top', ['hover']);
  expect(result.bad).toEqual([]);
  await settle(page, result.via);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-settings]')).toBeHidden();
  await settle(page, 'focus'); // (Settings' own tip, its button focused again)
  // The HUD, with the demo playing.
  await page.click('[data-source="demo"]');
  await expect(page.locator('[data-hud]')).toBeVisible();
  result = await sweep(page, '[data-hud]', ['hover', 'focus']);
  expect(result.count).toBeGreaterThan(12);
  expect(result.bad).toEqual([]);
  // A label that changes takes its tip with it: Full Screen's says how to go back once full.
  await expect(page.locator('[data-act="combo"]')).toContainText('Living Weapon');
  expect(errors).toEqual([]);
});

test('no native title tooltips anywhere in Bonfire Live’s own UI', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/visualizer/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await page.keyboard.press('p'); // (Render Settings)
  await page.keyboard.press('s');
  await page.locator('[data-tab="setups"]').click();
  await page.locator('[data-setup-name]').fill('One');
  await page.locator('[data-setup-save]').click();
  await page.locator('[data-tab="scenes"]').click();
  await page.locator('[data-card-add]').click();
  // (The pack is the site's, checked with the site's tips.)
  const titled = await page.evaluate(() => [...document.querySelectorAll('[title]')].filter((el) => !el.closest('.pack')).map((el) => el.outerHTML.slice(0, 80)));
  expect(titled).toEqual([]);
  expect(errors).toEqual([]);
});
