// The portfolio site's tooltips (the shared one, src/ui/tooltip.js): every tip in the
// header, the rest menu, the render settings, the photo toolbar and the pack's lists, and
// the skills at the ends of each group (where a tip is likeliest to meet an edge), comes up
// the ways a person would ask for it (a pointer resting on it and the keyboard's focus at
// 1280×720; the keyboard, or a tap for a skill, on a 390×844 touch screen), inside the window
// by 8 px and off what it explains; and no native title= is left on the site.
import { test, expect } from '@playwright/test';
import { collectTips, checkTip, assertInViewport, dismissTip, tipOf } from './lib/tips.mjs';

const SIZES = [
  { name: '1280×720', viewport: { width: 1280, height: 720 }, touch: false },
  { name: '390×844 (touch)', viewport: { width: 390, height: 844 }, touch: true },
];

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
const ready = (page) => expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });

/**
 * Check every tip under `root`: on a desktop by hover and by focus; on a touch screen by
 * focus, or by a tap where a tap is how it opens (data-tip-tap). A disabled option can't
 * take focus: hover only. Returns how many were checked.
 */
async function checkAll(page, root, { touch, label }) {
  const triggers = await collectTips(page, root);
  for (const trigger of triggers) {
    const name = `${label}: ${(await trigger.getAttribute('aria-label')) ?? (await trigger.textContent())?.replace(/\s+/g, ' ').trim()}`;
    const disabled = await trigger.isDisabled().catch(() => false);
    const tapped = (await trigger.getAttribute('data-tip-tap')) !== null;
    const modes = touch ? (tapped ? ['tap'] : disabled ? [] : ['focus']) : ['hover', ...(disabled ? [] : ['focus'])];
    for (const mode of modes) {
      const r = await checkTip(page, trigger, { mode });
      expect(r.shown, `${name} (${mode}) shows its tip`).toBe(true);
      assertInViewport(r.rect, r.viewport, 8);
      expect(r.coversTrigger, `${name} (${mode}) leaves its trigger in sight`).toBe(false);
    }
  }
  // (Nothing left open for the next surface.)
  if (await tipOf(page).isVisible()) await dismissTip(page).catch(() => {});
  return triggers.length;
}

/** No native title tooltips anywhere on the page now (the shared tooltip replaced them). */
const noTitles = (page, where) => expect(page.locator('body [title]'), `${where}: no title=`).toHaveCount(0);

/** A context at this size (touch where it says so), and its page. */
async function open(browser, size) {
  const context = await browser.newContext({ viewport: size.viewport, ...(size.touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  return { context, page, errors: watch(page), tap: (loc) => (size.touch ? loc.tap() : loc.click()) };
}

for (const size of SIZES) {
  test.describe(`site tips at ${size.name}`, () => {
    test.describe.configure({ timeout: 240_000 });

    test('the header, the rest menu, the render settings and the photo toolbar', async ({ browser }) => {
      const { context, page, errors, tap } = await open(browser, size);
      await page.goto('/experience/');
      await ready(page);
      await noTitles(page, 'the page');
      // The header: Q / E (where the tabs show) and Sound.
      expect(await checkAll(page, '[data-header]', { ...size, label: 'header' })).toBeGreaterThanOrEqual(size.touch ? 1 : 3);
      // The rest menu's tools.
      await tap(page.locator('[data-menu-open]'));
      await expect(page.locator('[data-menu]')).toBeVisible();
      expect(await checkAll(page, '[data-menu]', { ...size, label: 'menu' })).toBe(6);
      await noTitles(page, 'the menu');
      // Render Settings from it: every row's tip, and its close button's.
      await tap(page.getByRole('button', { name: /^Render Settings/ }));
      const hud = page.locator('.debug-hud');
      await expect(hud).toBeVisible();
      expect(await checkAll(page, '.debug-hud', { ...size, label: 'render settings' })).toBe(7);
      await tap(hud.locator('[data-render-close]'));
      await expect(hud).toBeHidden();
      // The photo toolbar (F; a phone gets there from the menu).
      if (size.touch) {
        await tap(page.locator('[data-menu-open]'));
        await tap(page.getByRole('button', { name: /^Photo Mode/ }));
      } else await page.keyboard.press('f');
      await expect(page.locator('.photo-bar')).toBeVisible();
      expect(await checkAll(page, '.photo-bar', { ...size, label: 'photo' })).toBe(3);
      await noTitles(page, 'photo mode');
      expect(errors).toEqual([]);
      await context.close();
    });

    test('the pack’s lists: the living weapon, the ring and elements, the knight’s styles and why his finishes are off', async ({ browser }) => {
      const { context, page, errors, tap } = await open(browser, size);
      await page.goto('/');
      await ready(page);
      await expect(page.locator('#scene-label')).toContainText(/summon sign/i, { timeout: 15_000 });
      await tap(page.locator('[data-pack-toggle]'));
      await page.waitForFunction(() => document.querySelector('.pack-items').getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
      await noTitles(page, 'the pack');
      for (const id of ['anvil', 'tome']) {
        await tap(page.locator(`[data-pack-slot="${id}"]`));
        await expect(page.locator(`[data-pack-list="${id}"]`)).toBeVisible();
        expect(await checkAll(page, `[data-pack-list="${id}"]`, { ...size, label: id }), `${id} has tips`).toBeGreaterThan(0);
      }
      // The knight: summoned, then dressed in Black & Gold (whose finishes are off, and say why).
      await tap(page.locator('[data-pack-slot="knight"]'));
      const summon = page.locator('[data-pack-option="summon"]');
      await expect(summon).toBeEnabled({ timeout: 15_000 });
      await tap(summon);
      const style = page.locator('[data-pack-option="style:blackgold"]');
      await expect(style).toBeEnabled({ timeout: 15_000 });
      await tap(style);
      await expect(style).toHaveAttribute('aria-pressed', 'true');
      const knight = page.locator('[data-pack-list="knight"]');
      await expect(knight.getByRole('group', { name: 'Finish', exact: true })).toContainText('wear their own colors');
      expect(await checkAll(page, '[data-pack-list="knight"]', { ...size, label: 'knight' })).toBe(10); // (6 styles, 4 finishes)
      expect(errors).toEqual([]);
      await context.close();
    });

    test('the skills: the first and last of each group', async ({ browser }) => {
      const { context, page, errors } = await open(browser, size);
      await page.goto('/skills/');
      await ready(page);
      await noTitles(page, 'the skills');
      expect(await checkAll(page, '[data-skill-grid] li:is(:first-child, :last-child)', { ...size, label: 'skills' })).toBeGreaterThanOrEqual(6);
      expect(errors).toEqual([]);
      await context.close();
    });
  });
}
