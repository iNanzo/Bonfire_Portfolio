// The Painter's tooltips in a real browser (the shared one, src/ui/tooltip.js): a scene with
// every part filled (its own place colors and drop hits, every layer on, four knights with
// their own moves), every section open, at a laptop's 1280×720 and a phone's 390×844 (touch,
// the panel a bottom sheet). Every "?", lock, toolbar and preview button: hovered and focused
// on the laptop, tapped ("?"s: a tap opens them) and focused on the phone. Each tip shows its
// own words, stays 8 px inside the window (the phone's bottom sheet too) without covering
// what opened it, and Esc hides it (the panel and the scene left as they were). No native
// title tooltips are left.
//
// The tips are the page's, not the stage's, so the browser here has no WebGL: the stage stays
// blank (the page's no-WebGL fallback) and every frame is cheap. On the software-rendered
// stage the other specs use, a frame takes 100–300 ms, every hover and focus waits on a few,
// and these ~600 checks would take half an hour.
import { test, expect } from '@playwright/test';
import { collectTips, checkTip, assertInViewport, tipOf } from './lib/tips.mjs';
import { defaultScene, encodeSceneHash } from '../src/scenes.js';
import { DROP_FX, LAYERS } from '../src/visualizer/looks.js';
import { PAINTER_SECTIONS } from '../src/settingsMap.js';

/** Every optional part of a scene filled (as test/painterPanel.test.mjs paints one). */
function fullScene() {
  const s = defaultScene('Everything');
  s.colors.scenery = { void: '#050608', shadow: '#15131d', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' };
  s.drops = { fx: Object.fromEntries(Object.keys(DROP_FX).map((k) => [k, 'mix'])), count: 3 };
  s.layers = Object.fromEntries(Object.keys(LAYERS).map((k) => [k, 'mix']));
  s.details = { ghostKeep: 0.9, glowSize: 3, grad: [0, 6, 8], paintR: 3, scan: 1, mirror: 2, flicker: 1, chroma: 2 };
  s.look = { name: 'kaleido', amount: 1.2, params: { segments: 8 } };
  s.render.palette = [0, 6, 8];
  s.knights = { ...s.knights, count: 4, helmets: ['great', null, 'armet', null], moves: ['nod', 'defaultDance'], style: 'mix' };
  s.fireflies.moves = ['swing'];
  s.camera.move = { kind: 'push', amount: 0.5, bars: 8 };
  return s;
}
const SECTIONS = PAINTER_SECTIONS.map((s) => s.id);
// (No WebGL: see the top.)
test.use({ launchOptions: { args: ['--disable-3d-apis', '--disable-webgl'] } });

/**
 * The Painter on the full scene, every section open (as if left open last time), with undo
 * and redo both on (an edit, another, one undone) so their tips can show.
 */
async function ready(page) {
  await page.addInitScript((open) => { try { localStorage.setItem('bonfire-painter-panel', JSON.stringify(open)); } catch { /* none */ } }, SECTIONS);
  await page.goto(`/painter/#scene=${encodeSceneHash(fullScene())}`);
  await expect(page.locator('html')).toHaveClass(/no-webgl/, { timeout: 30_000 }); // (no stage: see the top)
  await page.addStyleTag({ content: '[data-error] { display: none !important; }' }); // (its note would sit over the banner)
  for (const id of SECTIONS) await expect(page.locator(`[data-sec="${id}"]`)).toHaveAttribute('data-open', '');
  await page.locator('[data-pick="music"][data-value="\\"base\\""]').dispatchEvent('click');
  await page.locator('[data-pick="music"][data-value="\\"hold\\""]').dispatchEvent('click');
  await page.locator('[data-cmd="undo"]').click();
  await expect(page.locator('[data-cmd="redo"]')).toBeEnabled();
  await expect(page.locator('[data-cmd="undo"]')).toBeEnabled();
  await page.mouse.move(0, 0);
  // (Undo's click left the focus on it: focusing it again would be no news to the page.)
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
}

/**
 * Close an open tip with Esc and wait for it to go: hidden, or showing another trigger's
 * words (the panel scrolled under a resting pointer brings up what's under it now). (The
 * shared helper's dismissTip waits 2 s: on a machine running every spec at once, the other
 * specs' software-rendered stages can keep this page's thread from answering that soon,
 * though Esc hides the tip at once.)
 */
async function dismiss(page) {
  const was = await tipOf(page).textContent();
  await page.keyboard.press('Escape');
  await page.waitForFunction((text) => {
    const t = document.querySelector('.ui-tip');
    return !t || !t.getClientRects().length || t.textContent !== text;
  }, was, { timeout: 15_000 });
}

/**
 * Open each trigger's tip `how` (hover, focus or tap), check where it lands, then close it
 * with Esc (every tip: a tap's stays until then). (On a machine running every spec at once a
 * hover now and then lands before the page has caught up with the last one: a tip that
 * doesn't show is opened once more before it counts as missing.)
 */
async function checkAll(page, triggers, how) {
  const missing = [];
  for (const t of triggers) {
    const isMark = await t.evaluate((el) => el.classList.contains('viz-tip'));
    // (A tap opens a "?" only: on a lock, a bulk button or the bar's, a tap is the click.)
    const mode = how === 'tap' && !isMark ? 'hover' : how;
    let r = await checkTip(page, t, { mode, timeout: 5000 });
    if (!r.shown) r = await checkTip(page, t, { mode, timeout: 5000 });
    const what = (await t.getAttribute('aria-label')) ?? (await t.getAttribute('data-tip'))?.slice(0, 40);
    if (!r.shown) { missing.push(`${mode}: ${what}`); continue; }
    assertInViewport(r.rect, r.viewport, 8);
    expect(r.coversTrigger, `${what}: the tip covers what opened it`).toBe(false);
    await dismiss(page);
  }
  expect(missing, 'every tip shows').toEqual([]);
}
/** Sections with so many tips they're checked in parts (each a test: they run side by side). */
const PARTS = { layers: 3 };

for (const [label, viewport, touch] of [['laptop', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  test.describe(`the Painter's tooltips (${label})`, () => {
    test.use({ viewport, hasTouch: touch });
    test.describe.configure({ mode: 'parallel' });

    // (Each way of opening them a test of its own: Layers alone has about 80.)
    for (const how of touch ? ['tap', 'focus'] : ['hover', 'focus']) {
      test(`the bar (${how}): undo, redo, Tools, the previews, Play and the banner’s close`, async ({ page }) => {
        test.setTimeout(240_000);
        await ready(page);
        const triggers = [...await collectTips(page, '[data-bar]'), ...await collectTips(page, '.pnt-banners')];
        expect(triggers.length).toBeGreaterThanOrEqual(touch ? 6 : 8);
        await checkAll(page, triggers, how);
      });

      for (const id of SECTIONS) {
        const parts = PARTS[id] ?? 1;
        for (let part = 0; part < parts; part++) {
          const name = parts > 1 ? `the ${id} section, part ${part + 1} of ${parts}` : `the ${id} section`;
          test(`${name} (${how}): every "?", lock and bulk button`, async ({ page }) => {
            test.setTimeout(300_000);
            await ready(page);
            const all = await collectTips(page, `[data-sec="${id}"]`);
            expect(all.length, `${id} has tips`).toBeGreaterThan(0);
            const triggers = all.filter((_, i) => i % parts === part);
            const before = await page.evaluate(() => location.href);
            await checkAll(page, triggers, how);
            // Esc hid each tip, and only it: the panel and the scene stay as they were.
            await expect(tipOf(page)).toBeHidden();
            await expect(page.locator(`[data-sec="${id}"]`)).toHaveAttribute('data-open', '');
            expect(await page.evaluate(() => location.href)).toBe(before);
          });
        }
      }
    }

    test('no native title tooltips are left', async ({ page }) => {
      await ready(page);
      await page.keyboard.press('l'); // (the library's cards too)
      await expect(page.locator('[data-library]')).toBeVisible();
      // (The pack's toggle is the site's shared pack, src/ui/pack.js: its title is another package's to take out.)
      const titled = await page.evaluate(() => [...document.querySelectorAll('[title]')].filter((el) => !el.closest('.pack')).map((el) => el.outerHTML.slice(0, 80)));
      expect(titled).toEqual([]);
    });
  });
}
