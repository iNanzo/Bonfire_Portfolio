// Preset scenes in Bonfire Live, in a real browser: scenes of this browser's own (as the
// Painter saves them, seeded before the page runs) open on ?scene=<ref> behind the start
// menu, the HUD names the one playing once the music starts, N moves on to the next, the
// loop (Settings › Scenes & Cards) lists them and its switches keep one out of it. The site's
// built-in scenes (content.json) are on the start screen and in the loop, open by their ref
// (and play on the demo track), and the Painter lists them and opens one read-only. No
// errors anywhere.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { defaultScene, normalizeScene } from '../src/scenes.js';

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

/** A scene of mine, as the Painter would save it. */
function mine(name, id, edit = () => {}) {
  const s = defaultScene(name);
  s.id = id;
  edit(s);
  return normalizeScene(s);
}
const ONE = mine('Test Scene', 'test', (s) => { s.place.scenery = 'shrine'; s.look = { name: 'kaleido', amount: 1, params: {} }; });
const TWO = mine('Second Scene', 'second', (s) => { s.place.scenery = 'forge'; s.look = { name: 'mosaic', amount: 1, params: {} }; });

/** Seed this browser's scenes (and settings) before the page's scripts run. */
async function seed(page, scenes, settings = null) {
  await page.addInitScript(({ scenes, settings }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('bonfire-scenes', JSON.stringify({ v: 1, order: scenes.map((s) => s.id), scenes: Object.fromEntries(scenes.map((s) => [s.id, s])) }));
    if (settings) localStorage.setItem('bonfire-live', JSON.stringify(settings));
  }, { scenes, settings });
}

test('?scene= opens on a scene of mine behind the start menu', async ({ page }) => {
  const errors = watch(page);
  await seed(page, [ONE, TWO], { sceneFrom: 'mine' }); // (just mine: the site's built-in ones are tested below)
  await page.goto('/visualizer/?scene=m:test');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  const chips = page.locator('[data-scene-chips]');
  await expect(chips).toBeVisible();
  await expect(chips.locator('[data-scene-chip]')).toHaveCount(2);
  await expect(chips.locator('[data-scene-chip="m:test"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(chips.locator('[data-scene-chip="m:second"]')).toHaveAttribute('aria-pressed', 'false');
  // A chip plays another behind the menu; N steps on to the next at once.
  await chips.locator('[data-scene-chip="m:second"]').click();
  await expect(chips.locator('[data-scene-chip="m:second"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('n');
  await expect(chips.locator('[data-scene-chip="m:test"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('the demo names the scene playing in the HUD, and N moves on to the next', async ({ page }) => {
  const errors = watch(page);
  await seed(page, [ONE, TWO], { scenes: 'on', sceneFrom: 'mine' });
  await page.goto('/visualizer/?scene=m:test&solo');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('[data-solo]')).toContainText('Test Scene');
  await page.click('[data-source="demo"]');
  await expect(page.locator('[data-hud]')).toBeVisible();
  const line = page.locator('[data-scene-line]');
  await expect(line).toBeVisible();
  await expect(line.locator('[data-scene-name]')).toContainText('Test Scene', { timeout: 10_000 });
  // N: on the next downbeat, the other one (the loop has two, and scenes are Always).
  await page.keyboard.press('n');
  await expect(line.locator('[data-scene-name]')).toContainText('Second Scene', { timeout: 15_000 });
  // The line opens Scenes & Cards. (The controls hide when the mouse rests 3 s: the pointer
  // moving onto the line wakes them for the click; a check before it could find them asleep.)
  await page.mouse.move(640, 400);
  await line.click({ force: true });
  await expect(page.locator('[data-settings]')).toBeVisible();
  await expect(page.locator('#viz-tab-scenes')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Scenes & Cards lists the loop; a switch keeps a scene out, and it’s remembered', async ({ page }) => {
  const errors = watch(page);
  await seed(page, [ONE, TWO]);
  await page.goto('/visualizer/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await page.keyboard.press('s');
  await page.click('[data-tab="scenes"]');
  const rows = page.locator('#viz-tab-scenes [data-scene-row^="m:"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('.viz-scene-badge')).toHaveText('Mine');
  await expect(rows.first().locator('a', { hasText: 'Edit In Painter' })).toHaveAttribute('href', /painter\/\?scene=m:test$/);
  await page.locator('[data-scene-toggle="m:second"]').uncheck();
  // (Saving waits for a burst of changes to settle: a moment later it's kept.)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live') ?? '{}').sceneList)).toEqual({ 'm:second': false });
  // Play Now closes the settings and plays it (behind the start menu here).
  await page.locator('[data-scene-play="m:test"]').click();
  await expect(page.locator('[data-settings]')).toBeHidden();
  await expect(page.locator('[data-scene-chip="m:test"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

// The site's own scenes (content.json: made in the Painter, kept by the admin's Scenes page).
const BUILT_IN = JSON.parse(fs.readFileSync(new URL('../src/content.json', import.meta.url), 'utf8')).scenes ?? [];
const inLoop = BUILT_IN.filter((s) => !s.hidden);

test('the built-in scenes are on the start screen and in the loop; ?scene=b: opens one', async ({ page }) => {
  expect(inLoop.length, 'content.json has built-in scenes in the loop').toBeGreaterThan(1);
  const errors = watch(page);
  const [first, second] = inLoop;
  await page.goto(`/visualizer/?scene=b:${second.id}`);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  // A chip for each (up to the start screen's 8), the one asked for pressed.
  const chips = page.locator('[data-scene-chips] [data-scene-chip]');
  await expect(chips).toHaveCount(Math.min(8, inLoop.length));
  await expect(page.locator(`[data-scene-chip="b:${second.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-scene-chip="b:${first.id}"]`)).toHaveAttribute('aria-pressed', 'false');
  // The loop lists each one (the admin's hidden ones stay out), with its Painter link.
  await page.keyboard.press('s');
  await page.click('[data-tab="scenes"]');
  const rows = page.locator('#viz-tab-scenes [data-scene-row^="b:"]');
  await expect(rows).toHaveCount(inLoop.length);
  await expect(rows.first().locator('.viz-scene-badge')).toHaveText('Built-In');
  await expect(rows.first().locator('a', { hasText: 'Edit In Painter' })).toHaveAttribute('href', new RegExp(`painter/\\?scene=b:${first.id}$`));
  expect(errors).toEqual([]);
});

test('a built-in scene plays on the demo track, named in the HUD', async ({ page }) => {
  const errors = watch(page);
  const [scene] = inLoop;
  await page.goto(`/visualizer/?scene=b:${scene.id}&solo`);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await page.click('[data-source="demo"]');
  await expect(page.locator('[data-hud]')).toBeVisible();
  await expect(page.locator('[data-scene-line] [data-scene-name]')).toContainText(scene.name, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('the Painter lists the built-in scenes and opens one read-only', async ({ page }) => {
  const errors = watch(page);
  const [scene] = inLoop;
  await page.goto(`/painter/?scene=b:${scene.id}`);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('[data-name]')).toHaveValue(scene.name);
  await expect(page.locator('[data-saved]')).toContainText('Built-In');
  await page.keyboard.press('l');
  const cards = page.locator('[data-lib-built] [data-card-name]');
  await expect(cards).toHaveCount(BUILT_IN.length);
  await expect(cards).toHaveText(BUILT_IN.map((s) => s.name));
  expect(errors).toEqual([]);
});
