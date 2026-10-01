// Helpers for the tooltip specs (tips-*.spec.mjs): find a page's tip triggers, open one the
// way a person would (hovering it, tabbing to it or its field, tapping it) and measure the
// shared tooltip (src/ui/tooltip.js) that comes up: on screen, clear of the window's edges,
// not over what opened it. Playwright only; the specs make the assertions.
import { expect } from '@playwright/test';

/** The shared tooltip element. */
export const tipOf = (page) => page.locator('.ui-tip');

/**
 * The visible tip triggers (`[data-tip]`) under `rootSelector`, as locators.
 * @param {import('@playwright/test').Page} page @param {string} [rootSelector]
 */
export async function collectTips(page, rootSelector = 'body') {
  const all = page.locator(`${rootSelector} [data-tip]`);
  const out = [];
  for (let i = 0, n = await all.count(); i < n; i++) {
    const one = all.nth(i);
    if (await one.isVisible()) out.push(one);
  }
  return out;
}

/** Two boxes overlapping by more than a pixel's rounding. */
const overlap = (a, b) => a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;

/**
 * Open `trigger`'s tip and measure it. `mode`: 'hover' (the pointer resting on it), 'focus'
 * (the keyboard: a "?" that isn't a stop of its own is reached through the field it
 * describes), or 'tap' (a touch context: `hasTouch`). Returns whether it showed, its box,
 * the window's size, and whether it covers the trigger. The tip is left open (Esc closes it).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} trigger
 * @param {{ mode?: 'hover' | 'focus' | 'tap', timeout?: number }} [o]
 * @returns {Promise<{ shown: boolean, rect: { x: number, y: number, width: number, height: number } | null,
 *   viewport: { width: number, height: number }, coversTrigger: boolean, text: string }>}
 */
export async function checkTip(page, trigger, { mode = 'hover', timeout = 2000 } = {}) {
  const tip = tipOf(page);
  await trigger.scrollIntoViewIfNeeded();
  if (mode === 'hover') {
    await page.mouse.move(0, 0);
    await trigger.hover();
  } else if (mode === 'tap') {
    await trigger.tap();
  } else {
    // (A key first, so the focus that follows counts as the keyboard's: :focus-visible.)
    await page.keyboard.press('Shift');
    // (A "?" that isn't a stop: the first field reading its hint out, a radio of a switch's group.)
    const field = await trigger.evaluate((el) => {
      if (el.getAttribute('tabindex') !== '-1') return false;
      const id = el.getAttribute('aria-describedby');
      const holder = id && [...document.querySelectorAll(`[aria-describedby~="${CSS.escape(id)}"]`)].find((f) => f !== el && !f.hasAttribute('data-tip'));
      const target = holder?.matches('fieldset') ? holder.querySelector('input:checked, input') : holder;
      if (!target) return false;
      document.querySelectorAll('[data-tip-probe]').forEach((p) => p.removeAttribute('data-tip-probe'));
      target.setAttribute('data-tip-probe', '');
      return true;
    });
    if (field) {
      await page.locator('[data-tip-probe]').focus();
      await page.locator('[data-tip-probe]').evaluate((el) => el.removeAttribute('data-tip-probe'));
    } else await trigger.focus();
  }
  const shown = await tip.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
  const viewport = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  if (!shown) return { shown, rect: null, viewport, coversTrigger: false, text: '' };
  const rect = await tip.boundingBox();
  const at = await trigger.boundingBox();
  const text = (await tip.textContent()) ?? '';
  return { shown, rect, viewport, coversTrigger: !!(rect && at && overlap(rect, at)), text };
}

/**
 * The tip's box stays `margin` px inside the window on every side (half a pixel for rounding).
 * @param {{ x: number, y: number, width: number, height: number } | null} rect
 * @param {{ width: number, height: number }} viewport
 * @param {number} [margin]
 */
export function assertInViewport(rect, viewport, margin = 8) {
  expect(rect, 'the tip has a box').not.toBeNull();
  const slack = 0.5;
  expect(rect.x, 'left edge').toBeGreaterThanOrEqual(margin - slack);
  expect(rect.y, 'top edge').toBeGreaterThanOrEqual(margin - slack);
  expect(rect.x + rect.width, 'right edge').toBeLessThanOrEqual(viewport.width - margin + slack);
  expect(rect.y + rect.height, 'bottom edge').toBeLessThanOrEqual(viewport.height - margin + slack);
}

/** Close an open tip the way a person would (Esc), and wait for it to go. */
export async function dismissTip(page) {
  await page.keyboard.press('Escape');
  await tipOf(page).waitFor({ state: 'hidden', timeout: 2000 });
}
