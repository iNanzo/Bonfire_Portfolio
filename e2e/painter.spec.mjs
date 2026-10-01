// The Bonfire Painter (/painter/) in a real browser: it loads and draws with no errors, a
// look chip changes the picture, undo takes it back, a saved scene is still in the library
// after a reload, its export is a file the Painter (and the admin) can read, unsaved changes
// survive a reload (and a link to another scene sets them aside), the top bar keeps every
// button in reach from tablet to desktop, Play on an untouched built-in saves nothing, hands
// it to an open Bonfire Live with no tab opened (else opens one on it, or links to it when
// that's blocked), and a scene sent from the admin (#scene=) opens with its banner. (Reduced
// motion showing the look being painted, on the stage and in its thumbnail, waits on the bonfire.)
import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { defaultScene, encodeSceneHash, readSceneFile } from '../src/scenes.js';

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
/** The stage, small and averaged over a few frames (so the flames' flicker averages out), as RGB. */
async function picture(page, frames = 3) {
  const sum = new Float64Array(64 * 36 * 3);
  for (let i = 0; i < frames; i++) {
    const png = await page.locator('.bonfire-canvas').screenshot();
    const raw = await sharp(png).resize(64, 36, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    for (let k = 0; k < raw.length; k++) sum[k] += raw[k] / frames;
    await page.waitForTimeout(120);
  }
  return sum;
}
/** How far apart two pictures are (the mean difference per channel). */
const apart = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
async function ready(page, path = '/painter/') {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
}

test('the Painter loads and draws, no errors', async ({ page }) => {
  const errors = watch(page);
  await ready(page);
  const drawn = await page.locator('.bonfire-canvas').evaluate((c) => c.width > 1 && c.height > 1);
  expect(drawn).toBe(true);
  await expect(page.locator('[data-name]')).toHaveValue('New Scene');
  await expect(page.locator('[data-sec="place"] [data-pick="place.scenery"]')).toHaveCount(5);
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test('a look chip changes the picture, and undo takes it back', async ({ page }) => {
  test.setTimeout(90_000); // (a few averaged captures of a software-rendered stage)
  const errors = watch(page);
  await ready(page);
  await page.click('[data-preview="still"]');
  await page.click('[data-sec-toggle="look"]');
  await page.waitForTimeout(3500); // (the start's puff settles)
  const a = await picture(page);
  await page.waitForTimeout(1200);
  const b = await picture(page);
  const kaleido = page.locator('[data-pick="look.name"][data-value="\\"kaleido\\""]');
  await kaleido.click();
  await page.mouse.move(10, 400); // (off the chip: no audition, the scene itself)
  await expect(kaleido).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1200);
  const c = await picture(page);
  // (The same look twice, as far apart, against before and after the chip.)
  expect(apart(b, c)).toBeGreaterThan(Math.max(4, 2 * apart(a, b)));
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-pick="look.name"][data-value="\\"ember\\""]')).toHaveAttribute('aria-pressed', 'true');
  await expect(kaleido).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+Shift+z');
  await expect(kaleido).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('a saved scene is still in the library after a reload, and its export reads back', async ({ page }) => {
  const errors = watch(page);
  await ready(page);
  await page.locator('[data-name]').fill('Smoke Test Shrine');
  await page.click('[data-pick="place.scenery"][data-value="\\"shrine\\""]');
  await page.click('[data-cmd="save"]');
  await expect(page.locator('[data-saved]')).toHaveText('Saved');
  await expect(page).toHaveURL(/scene=m%3Asmoke-test-shrine/);
  await page.reload();
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('[data-name]')).toHaveValue('Smoke Test Shrine');
  await page.keyboard.press('l');
  const card = page.locator('[data-card="m:smoke-test-shrine"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.pnt-card-name')).toHaveText('Smoke Test Shrine');
  const [download] = await Promise.all([page.waitForEvent('download'), card.locator('[data-lib="export"]').click()]);
  const text = await readFile(await download.path(), 'utf8');
  const { scenes, errors: readErrors } = readSceneFile(text);
  expect(readErrors).toEqual([]);
  expect(scenes).toHaveLength(1);
  expect(scenes[0].name).toBe('Smoke Test Shrine');
  expect(scenes[0].place.scenery).toBe('shrine');
  expect(JSON.parse(text).app).toBe('bonfire-painter');
  expect(errors).toEqual([]);
});

test('unsaved changes come back after a reload, and a link to another scene sets them aside', async ({ page }) => {
  const errors = watch(page);
  await ready(page);
  await page.locator('[data-name]').fill('Reload Test');
  await page.keyboard.press('Enter');
  await page.click('[data-cmd="save"]');
  await expect(page.locator('[data-saved]')).toHaveText('Saved');
  await page.click('[data-sec-toggle="look"]');
  const kaleido = page.locator('[data-pick="look.name"][data-value="\\"kaleido\\""]');
  await kaleido.click();
  await page.reload(); // (at once: the draft is written as the page goes)
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('[data-saved]')).toHaveText('Unsaved Changes');
  await page.click('[data-sec-toggle="look"]');
  await expect(kaleido).toHaveAttribute('aria-pressed', 'true');
  // A link to a built-in: the unsaved work waits in a banner.
  await ready(page, '/painter/?scene=b:frozen-shrine');
  await expect(page.locator('[data-name]')).toHaveValue('Frozen Shrine');
  await expect(page.locator('[data-aside-restore]')).toHaveText('Restore “Reload Test”');
  await page.click('[data-aside-restore]');
  await expect(page.locator('[data-name]')).toHaveValue('Reload Test');
  await expect(page.locator('[data-aside]')).toBeHidden(); // (the built-in had no changes to set aside)
  expect(errors).toEqual([]);
});

test('the top bar keeps every button in reach and the name uncovered, tablet to desktop', async ({ page }) => {
  await ready(page, '/painter/?scene=b:cathedral-kaleidoscope');
  for (const width of [820, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const hit = (el, f = 0.5) => { const b = el.getBoundingClientRect(); const x = b.left + b.width * f; return x > 0 && x < innerWidth && el.contains(document.elementFromPoint(x, b.top + b.height / 2)); };
      const buttons = [...document.querySelectorAll('[data-bar] [data-cmd], [data-bar] [data-preview]')];
      const name = document.querySelector('[data-name]');
      return {
        unreachable: buttons.filter((b) => !hit(b)).map((b) => b.dataset.cmd ?? b.dataset.preview),
        nameCovered: [0.1, 0.5, 0.9].some((f) => !hit(name, f)),
        nameShown: name.clientWidth >= name.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(r, `at ${width}px`).toEqual({ unreachable: [], nameCovered: false, nameShown: true, overflow: false });
  }
});

/**
 * Bonfire Live's tab stood in for (what the Painter does with it is what's checked): every
 * window.open is kept in window.__opened; `blocked`: the browser blocks them all.
 */
async function standInTabs(page, { blocked = false } = {}) {
  await page.addInitScript((blockAll) => {
    window.__opened = [];
    window.open = (url, name) => {
      window.__opened.push({ url, name });
      return blockAll ? null : { closed: false, opener: window, close() { this.closed = true; }, focus() {} };
    };
  }, blocked);
}

test('Play on an untouched built-in saves nothing and opens Bonfire Live on its ref; Space on a button presses it', async ({ page }) => {
  await standInTabs(page);
  const errors = watch(page);
  await ready(page, '/painter/?scene=b:frozen-shrine');
  await page.click('[data-cmd="play"]');
  // (No Bonfire Live answered: its tab opens once, on the scene, with no blank one first.)
  await expect.poll(() => page.evaluate(() => window.__opened.length)).toBe(1);
  expect(await page.evaluate(() => window.__opened.map(({ url, name }) => [url, name]))).toEqual([['/visualizer/?scene=b%3Afrozen-shrine&solo', 'bonfire-live']]);
  await expect(page.locator('[data-note]')).toHaveText('Opened Bonfire Live with “Frozen Shrine”.');
  await expect(page.locator('[data-saved]')).toHaveText('Built-In');
  // Space on the focused Library button opens the library (the preview stays as it was).
  const beat = page.locator('[data-preview="beat"]');
  const pressed = await beat.getAttribute('aria-pressed');
  await page.focus('[data-cmd="library"]');
  await page.keyboard.press(' ');
  await expect(page.locator('[data-library]')).toBeVisible();
  await expect(beat).toHaveAttribute('aria-pressed', pressed);
  await expect(page.locator('[data-lib-mine] [data-card]')).toHaveCount(0); // (nothing saved for Play)
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-library]')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Play hands the scene to an open Bonfire Live with no tab opened; a blocked tab gets a link', async ({ page, context }) => {
  await standInTabs(page);
  // An open Bonfire Live stood in for: it answers on the scene store's channel (sceneStore.js).
  await page.addInitScript(() => {
    const live = new BroadcastChannel('bonfire-scenes');
    window.__played = [];
    live.onmessage = ({ data }) => {
      if (data?.type !== 'play') return;
      window.__played.push(data.ref);
      live.postMessage({ type: 'playing', nonce: data.nonce });
    };
  });
  const errors = watch(page);
  await ready(page, '/painter/?scene=b:frozen-shrine');
  await page.click('[data-cmd="play"]');
  await expect(page.locator('[data-note]')).toHaveText('Playing “Frozen Shrine” in Bonfire Live.');
  expect(await page.evaluate(() => window.__played)).toEqual(['b:frozen-shrine']);
  expect(await page.evaluate(() => window.__opened)).toEqual([]); // (not even a blank one, opened and shut)
  expect(errors).toEqual([]);

  // No Bonfire Live open (the stand-in closed with its page), and the browser blocks the tab:
  // the note links to it instead.
  await page.close();
  const blocked = await context.newPage();
  await standInTabs(blocked, { blocked: true });
  await ready(blocked, '/painter/?scene=b:frozen-shrine');
  await blocked.click('[data-cmd="play"]');
  await expect(blocked.locator('[data-note]')).toContainText('The browser blocked Bonfire Live’s tab.');
  await expect(blocked.locator('[data-note] a')).toHaveAttribute('href', '/visualizer/?scene=b%3Afrozen-shrine&solo');
  expect(await blocked.evaluate(() => window.__opened.map(({ url }) => url))).toEqual(['/visualizer/?scene=b%3Afrozen-shrine&solo']);
});

// (The Painter's director and bonfire both take paintedLook: the look being painted shows,
// held still, only what flashes or jitters kept off (stillFx.js), so Kaleido's kaleidoscope
// and echo reach the stage and its thumbnail.)
test('under reduced motion the look being painted still shows, on the stage and in its thumbnail', async ({ page }) => {
  test.setTimeout(120_000); // (a few averaged captures of a software-rendered stage)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // (Every thumbnail written, in order, so a new one is seen even if it's the same picture.)
  await page.addInitScript(() => {
    window.__thumbs = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'bonfire-scene-thumbs') { try { window.__thumbs.push(Object.values(JSON.parse(value)).at(-1)); } catch { /* not ours */ } }
      return set.call(this, key, value);
    };
  });
  const errors = watch(page);
  await ready(page);
  await expect(page.locator('[data-preview="still"]')).toHaveAttribute('aria-pressed', 'true'); // (reduced motion starts still)
  await page.locator('[data-name]').fill('Reduced Motion Look');
  await page.keyboard.press('Enter');
  await page.click('[data-sec-toggle="look"]');
  await page.waitForTimeout(3500); // (the start's puff settles)
  const a = await picture(page);
  await page.click('[data-cmd="save"]');
  await expect.poll(() => page.evaluate(() => window.__thumbs.length)).toBe(1);
  const b = await picture(page);
  const kaleido = page.locator('[data-pick="look.name"][data-value="\\"kaleido\\""]');
  await kaleido.click();
  await page.mouse.move(10, 400); // (off the chip: no audition, the scene itself)
  await expect(kaleido).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(1200);
  const c = await picture(page);
  // The stage: Kaleido as painted, not Ember held still (as far from Ember as Ember from itself, twice over).
  expect(apart(b, c)).toBeGreaterThan(Math.max(4, 2 * apart(a, b)));
  // The thumbnail: saved again, it's Kaleido's too.
  await page.click('[data-cmd="save"]');
  await expect.poll(() => page.evaluate(() => window.__thumbs.length)).toBe(2);
  const [ember, kal] = await page.evaluate(() => window.__thumbs);
  const pixels = async (url) => {
    const raw = await sharp(Buffer.from(url.split(',')[1], 'base64')).resize(32, 18, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    return Float64Array.from(raw);
  };
  expect(apart(await pixels(ember), await pixels(kal))).toBeGreaterThan(Math.max(4, 2 * apart(a, b)));
  expect(errors).toEqual([]);
});

test('a scene from the admin (#scene=) opens with its banner', async ({ page }) => {
  const errors = watch(page);
  const scene = { ...defaultScene('From the Admin'), look: { name: 'haze', amount: 1, params: {} } };
  await ready(page, `/painter/#scene=${encodeSceneHash(scene)}`);
  await expect(page.locator('[data-banner]')).toBeVisible();
  await expect(page.locator('[data-name]')).toHaveValue('From the Admin');
  await page.click('[data-sec-toggle="look"]');
  await expect(page.locator('[data-pick="look.name"][data-value="\\"haze\\""]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
