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
const overlap = (a, b) =>
  a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;

/**
 * Close a tip left open by the last check, so the next measures its own: the pointer moved
 * off (a hovered tip goes after its grace) and the focus let go (a focused one goes at once);
 * one a tap opened stays until Esc.
 * @param {import('@playwright/test').Page} page
 */
async function closeTip(page) {
  const tip = tipOf(page);
  if (!(await tip.isVisible())) return;
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  if (
    await tip.waitFor({ state: 'hidden', timeout: 1000 }).then(
      () => true,
      () => false,
    )
  )
    return;
  await dismissTip(page);
}

/**
 * Open `trigger`'s tip and measure it. `mode`: 'hover' (the pointer resting on it), 'focus'
 * (the keyboard: a "?" that isn't a stop of its own is reached through a field that shows
 * it when focused, the one whose first hint is its; with none, it's hovered instead, and
 * `via` says so), or 'tap' (a touch context: `hasTouch`). Any tip still open is closed
 * first, and only a tip showing this trigger's words counts. Returns whether it showed, its
 * box, the window's size, whether it covers the trigger, its text, and how it was opened.
 * The tip is left open (Esc closes it).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} trigger
 * @param {{ mode?: 'hover' | 'focus' | 'tap', timeout?: number }} [o]
 * @returns {Promise<{ shown: boolean, rect: { x: number, y: number, width: number, height: number } | null,
 *   viewport: { width: number, height: number }, coversTrigger: boolean, text: string, via: 'hover' | 'focus' | 'tap' }>}
 */
export async function checkTip(page, trigger, { mode = 'hover', timeout = 2000 } = {}) {
  const tip = tipOf(page);
  await closeTip(page);
  await trigger.scrollIntoViewIfNeeded();
  const want = {
    text: (await trigger.getAttribute('data-tip')) ?? '',
    title: (await trigger.getAttribute('data-tip-title')) ?? '',
  };
  let via = mode;
  if (mode === 'focus') {
    // (A key first, so the focus that follows counts as the keyboard's: :focus-visible.)
    await page.keyboard.press('Shift');
    // The tooltip shows a focused field the "?" of the first hint it reads out (its
    // aria-describedby, or its switch's fieldset's: src/ui/tooltip.js), so a field whose
    // first hint is another's (its own, before its group's) won't do.
    const how = await trigger.evaluate((el) => {
      document.querySelectorAll('[data-tip-probe]').forEach((p) => p.removeAttribute('data-tip-probe'));
      if (el.getAttribute('tabindex') !== '-1') return 'self';
      const id = el.getAttribute('aria-describedby');
      if (!id) return 'none';
      const markOf = (h) => document.querySelector(`[data-tip][aria-describedby~="${CSS.escape(h)}"]`);
      const first = (f) => (f.getAttribute('aria-describedby') ?? '').split(/\s+/).find((h) => h && markOf(h));
      const holders = [...document.querySelectorAll(`[aria-describedby~="${CSS.escape(id)}"]`)].filter(
        (f) => f !== el && !f.hasAttribute('data-tip') && first(f) === id,
      );
      for (const holder of holders) {
        const target = holder.matches('fieldset')
          ? holder.querySelector('input:checked:not(:disabled), input:not(:disabled)')
          : holder;
        if (!target || target.matches(':disabled') || !target.getClientRects().length) continue;
        target.setAttribute('data-tip-probe', '');
        return 'field';
      }
      return 'none';
    });
    if (how === 'self') await trigger.focus();
    else if (how === 'field') {
      const probe = page.locator('[data-tip-probe]');
      await probe.focus();
      await probe.evaluate((el) => el.removeAttribute('data-tip-probe'));
    } else via = 'hover';
  }
  if (via === 'hover') {
    await page.mouse.move(0, 0);
    // The pointer travels onto the trigger as a hand would, before Playwright's hover: Bonfire
    // Live fades its HUD and lets clicks through to the picture when the mouse has rested 3 s
    // (body.is-idle), and only a pointer move wakes it. hover() waits for the trigger to be
    // hit-testable before moving the mouse at all, so on a slow machine (CI's software-rendered
    // browser), where a check takes over 3 s, it would wait for a wake that never comes.
    const box = await trigger.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x - 2, y);
      await page.mouse.move(x, y);
    }
    await trigger.hover();
  } else if (via === 'tap') await trigger.tap();
  // This trigger's tip: showing, with its words (not one still going from before). A label
  // that changes on its own while it's checked (Bonfire Live's Forge / Strike, as the demo
  // holds a weapon over the fire and strikes it) counts with either words: the ones it had when
  // the check began, or the ones it has now.
  const el = await trigger.elementHandle();
  const shown = await page
    .waitForFunction(
      ([node, w]) => {
        const t = document.querySelector('.ui-tip');
        if (!t || !t.getClientRects().length) return false;
        const text = t.querySelector('.ui-tip-text')?.textContent;
        const title = t.querySelector('.ui-tip-title')?.textContent ?? '';
        const now = { text: node.getAttribute('data-tip') ?? '', title: node.getAttribute('data-tip-title') ?? '' };
        return [w, now].some((words) => text === words.text && title === words.title);
      },
      [el, want],
      { timeout },
    )
    .then(
      () => true,
      () => false,
    );
  await el.dispose();
  const viewport = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  if (!shown) return { shown, rect: null, viewport, coversTrigger: false, text: '', via };
  const rect = await tip.boundingBox();
  const at = await trigger.boundingBox();
  const text = (await tip.textContent()) ?? '';
  return { shown, rect, viewport, coversTrigger: !!(rect && at && overlap(rect, at)), text, via };
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
