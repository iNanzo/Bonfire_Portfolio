// The Bonfire Painter (/painter/) in a real browser: it loads and draws with no errors, a
// look chip changes the picture, undo takes it back, a saved scene is still in the library
// after a reload, its export is a file the Painter (and the admin) can read, unsaved changes
// survive a reload (and a link to another scene sets them aside), the top bar keeps every
// button in reach from tablet to desktop, Play on an untouched built-in saves nothing, hands
// it to an open Bonfire Live with no tab opened (else opens one on it, or links to it when
// that's blocked), and a scene sent from the admin (#scene=) opens with its banner. The panel:
// it remembers which sections are open; a shape change draws only its own section again; a
// bulk toolbar's button is one undo step; the search narrows the panel (and says what the
// scene's shape leaves out), keeping its focus through a redraw; the Tools menu, the keys
// overlay, the render menu and the library's name filter. (Reduced motion showing the look
// being painted, on the stage and in its thumbnail, waits on the bonfire.)
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
  await expect(page.locator('[data-sec="look"]')).toHaveAttribute('data-open', ''); // (left open: remembered)
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
  // (Off Play, so its tooltip goes: a tip showing takes the first Esc, and this one's the library's.)
  await page.mouse.move(0, 0);
  await expect(page.locator('.ui-tip')).toBeHidden();
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
  // (The stand-in answers on its own page's thread: a machine running every spec at once is slow to.)
  await expect(page.locator('[data-note]')).toHaveText('Playing “Frozen Shrine” in Bonfire Live.', { timeout: 15_000 });
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
  test.setTimeout(180_000); // (a few averaged captures of a software-rendered stage, slower beside other specs)
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
  // (A thumbnail is the stage a couple of frames on: a software-rendered stage beside other
  // specs can take longer than a poll's 5 s to draw them.)
  await expect.poll(() => page.evaluate(() => window.__thumbs.length), { timeout: 30_000 }).toBe(1);
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
  await expect.poll(() => page.evaluate(() => window.__thumbs.length), { timeout: 30_000 }).toBe(2);
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

test('the panel remembers its open sections; a shape change draws only its own section again', async ({ page }) => {
  test.setTimeout(120_000); // (a reload and two window sizes of a software-rendered stage)
  const errors = watch(page);
  await ready(page);
  await page.click('[data-sec-toggle="layers"]');
  await page.click('[data-sec-toggle="place"]'); // (closed)
  await page.reload();
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('[data-sec="layers"]')).toHaveAttribute('data-open', '');
  await expect(page.locator('[data-sec="place"]')).not.toHaveAttribute('data-open', '');
  // Glow on: only Layers is drawn again (an element of another section is still the same one).
  await page.evaluate(() => {
    window.__kept = [document.querySelector('#pnt-b-colors').firstElementChild, document.querySelector('[data-set-group="layers.mirror"]')];
  });
  const glow = page.locator('[data-set-group="layers.glow"]');
  await glow.locator('label', { hasText: 'Always' }).click();
  await expect(page.locator('[data-row="detail.glowAmt"]')).toBeVisible();
  const kept = await page.evaluate(() => [window.__kept[0].isConnected, window.__kept[1].isConnected]);
  expect(kept, 'Colors kept, Layers drawn again').toEqual([true, false]);
  // The keyboard keeps its place through it: the switch's radio, focused again.
  await expect(glow.locator('input[value="on"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); // (In the Mix: the same shape, the radios only)
  await expect(glow.locator('input[value="mix"]')).toBeChecked();
  await expect(glow.locator('input[value="mix"]')).toBeFocused();
  // Only the sections scroll, never the panel round them: the search box stays in sight
  // whatever's focused or scrolled into view (a phone's bottom sheet too).
  for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.locator('[data-row="detail.glowAmt"] input').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    expect(await page.locator('[data-panel]').evaluate((el) => [el.scrollTop, el.scrollHeight - el.clientHeight])).toEqual([0, 0]);
  }
  expect(errors).toEqual([]);
});

test('a bulk toolbar sets every layer at once, and one Ctrl+Z puts them all back', async ({ page }) => {
  const errors = watch(page);
  await ready(page);
  await page.click('[data-sec-toggle="layers"]');
  await page.click('[data-bulk="on"][data-bulk-group="layers"]');
  const radios = page.locator('[data-sec="layers"] fieldset.tri input:checked');
  await expect(radios).toHaveCount(14);
  const values = await radios.evaluateAll((els) => els.map((el) => /** @type {HTMLInputElement} */ (el).value));
  expect(values.filter((v) => v === 'on').length).toBe(13); // (Painterly and Watercolor never both Always)
  await expect(page.locator('[data-note]')).toContainText('Layers: All Always');
  await page.keyboard.press('Control+z');
  await expect.poll(() => radios.evaluateAll((els) => els.every((el) => /** @type {HTMLInputElement} */ (el).value === 'off'))).toBe(true);
  await expect(page.locator('[data-cmd="undo"]')).toBeDisabled(); // (one step: nothing more to undo)
  expect(errors).toEqual([]);
});

test('a move list’s boxes follow its bulk buttons, undo and redo', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watch(page);
  await ready(page);
  await page.click('[data-sec-toggle="knights"]');
  const list = page.locator('[data-list="knights.moves"]');
  const ticked = list.locator('[data-list-item]:checked');
  // (The scene as the draft keeps it: written a moment after each change.)
  const moves = () => page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-painter-draft') ?? 'null')?.scene.knights.moves?.length ?? null);
  await list.locator('[data-list-show]').click(); // (the scene's own list: every move)
  await expect(ticked).toHaveCount(13);
  for (const key of ['nod', 'stepTouch', 'fistPump']) await list.locator(`[data-list-item="${key}"]`).click();
  await expect(ticked).toHaveCount(10);
  await list.locator('[data-bulk="all"]').click();
  await expect(ticked).toHaveCount(13);
  await expect.poll(moves).toBe(13);
  await page.mouse.move(10, 400);
  await page.keyboard.press('Control+z');
  await expect(ticked).toHaveCount(10);
  await page.keyboard.press('Control+Shift+z');
  await expect(ticked).toHaveCount(13);
  // A box ticked by hand now keeps what All added (the boxes are what it's read from).
  await list.locator('[data-list-item="clap"]').click();
  await expect(ticked).toHaveCount(12);
  await expect.poll(moves).toBe(12);
  // None stays unavailable (a list keeps one); Defaults gives the moves back to the show.
  await expect(list.locator('[data-bulk="none"]')).toHaveAttribute('aria-disabled', 'true');
  await list.locator('[data-bulk="defaults"]').click();
  await expect(list.locator('[data-list-show]')).toBeChecked();
  await page.keyboard.press('Control+z');
  await expect(list.locator('[data-list-show]')).not.toBeChecked();
  await expect(ticked).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('search: "glow" finds the Glow layer and Edge Glow, says what the shape hides, and keeps its focus', async ({ page }) => {
  const errors = watch(page);
  await ready(page);
  await page.keyboard.press('/');
  const box = page.locator('#pnt-search');
  await expect(box).toBeFocused();
  await page.keyboard.type('glow');
  await expect(page.locator('[data-row="layer.glow"]')).toBeVisible();
  await expect(page.locator('[data-row="knightGlow"]')).toBeVisible();
  await expect(page.locator('[data-row="knightRim"]')).toBeVisible();
  await expect(page.locator('[data-row="exposure"]')).toBeHidden();
  await expect(page.locator('[data-sec="pixels"]')).toBeHidden(); // (nothing found there)
  await expect(page.locator('[data-row="layer.glow"] mark')).toHaveText('Glow');
  // Glow is off: its details aren't drawn, so the box says how to bring them back.
  const notes = page.locator('[data-search-notes]');
  await expect(notes).toContainText('Glow Strength: turn on Glow in Layers to see this');
  await expect(page.locator('[data-panel] [data-search-status]')).toContainText('settings found');
  // The scene changes under the search (a redraw of Layers): the box keeps its focus and its
  // query, and Glow's details are found now.
  await page.evaluate(() => /** @type {HTMLInputElement} */ (document.querySelector('[data-set-group="layers.glow"] input[value="mix"]')).click());
  await expect(page.locator('[data-row="detail.glowAmt"]')).toBeVisible();
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('glow');
  await expect(notes).not.toContainText('Glow Strength');
  // A row left out shows the row that brings it back, scrolled to: "iris" with the show's
  // drop hits is Drop Hits' own choice (not an empty panel), and one is found.
  await box.fill('iris');
  const source = page.locator('[data-row="dropSource"]');
  await expect(source).toBeVisible();
  await expect(source).toBeInViewport();
  await expect(notes).toContainText('Iris Snap: pick This Scene’s Own under Drop Hits to see this');
  await expect(page.locator('[data-panel] [data-search-status]')).toHaveText('1 setting found');
  // "drop": Drop Hits, not every hint that mentions a drop; the hits it leaves out share a line.
  await box.fill('drop');
  await expect(source).toBeVisible();
  await expect(page.locator('[data-row="knightReactions"]')).toBeHidden();
  await expect(notes.locator('li')).toHaveCount(1);
  await expect(notes).toContainText('and 12 more: pick This Scene’s Own under Drop Hits to see this');
  // Esc clears it: every section back as it was (only Place open).
  await page.keyboard.press('Escape');
  await expect(box).toHaveValue('');
  await expect(page.locator('[data-row="exposure"]')).toBeVisible();
  await expect(page.locator('[data-sec="layers"]')).not.toHaveAttribute('data-open', '');
  await expect(notes).toBeHidden();
  expect(errors).toEqual([]);
});

test('Tools: Render Settings in Bonfire Live’s words, and the keyboard shortcuts (also by ?)', async ({ page }) => {
  const errors = watch(page);
  await ready(page);
  const tools = page.locator('[data-cmd="tools"]');
  await tools.click();
  await expect(tools).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-tool="render"]')).toBeFocused();
  await page.keyboard.press('Enter');
  const menu = page.locator('.pnt-render-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.render-menu-title')).toHaveText('Render Settings');
  await expect(menu.locator('[data-render-row="outlines"] [data-render-value]')).toHaveText('Always');
  await expect(menu.locator('[data-render-row="xray"] [data-render-value]')).toHaveText('Off');
  await expect(menu.locator('[data-render-reset] .render-row-label')).toHaveText('Reset Render Settings');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // A key the menu shows picks its item, the menu shut first (not left over what it opened);
  // another key the page answers shuts it too. Its tooltip never comes up over it.
  await tools.click();
  await expect(page.locator('[data-tool="render"]')).toBeFocused();
  await page.keyboard.press('p');
  await expect(menu).toBeVisible();
  await expect(page.locator('[data-tools-menu]')).toBeHidden();
  await expect(tools).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape'); // (one Esc: Render Settings closes)
  await expect(menu).toBeHidden();
  await tools.click();
  await page.keyboard.press('h');
  await expect(page.locator('[data-tools-menu]')).toBeHidden();
  await expect(page.locator('[data-panel]')).toBeHidden();
  await page.keyboard.press('h');
  await expect(page.locator('[data-panel]')).toBeVisible();
  await tools.click();
  await tools.locator('.pnt-tools-word').hover(); // (onto the word inside it: a fresh pointerover)
  await page.waitForTimeout(800);
  await expect(page.locator('.ui-tip')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tools-menu]')).toBeHidden();
  await expect(tools).toHaveAttribute('data-tip', /Render Settings/); // (back for next time)
  // The keys: from the menu, and from ?.
  await tools.click();
  await page.keyboard.press('End');
  await expect(page.locator('[data-tool="keys"]')).toBeFocused();
  await page.keyboard.press('Enter');
  const keys = page.locator('dialog.keys-overlay');
  await expect(keys).toBeVisible();
  await expect(keys.locator('.keys-group-title')).toHaveText(['The Scene', 'Preview', 'Panels & Tools', 'Camera']);
  await keys.locator('.keys-group').last().scrollIntoViewIfNeeded();
  await expect(keys.locator('.keys-group').last()).toBeInViewport(); // (not run off past the edge)
  await keys.locator('[data-keys-filter]').fill('lens');
  await expect(keys.locator('.keys-row:visible')).toHaveCount(2);
  await keys.locator('[data-keys-filter]').press('Escape'); // (clears the filter)
  await page.keyboard.press('Escape'); // (closes)
  await expect(keys).toBeHidden();
  await page.keyboard.press('Shift+?');
  await expect(keys).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  // On a phone the menu hangs from the button's right edge, inside the window.
  await page.setViewportSize({ width: 390, height: 844 });
  await tools.click();
  const box = await page.locator('[data-tools-menu]').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(tools).toBeFocused();
  expect(errors).toEqual([]);
});

test('the library filters its scenes by name', async ({ page }) => {
  const errors = watch(page);
  await ready(page);
  await page.keyboard.press('l');
  const cards = page.locator('[data-lib-built] [data-card]:visible');
  const all = await cards.count();
  expect(all).toBeGreaterThan(1);
  await page.keyboard.press('/');
  await expect(page.locator('#pnt-lib-filter')).toBeFocused();
  await page.keyboard.type('shrine');
  await expect(cards).toHaveCount(1);
  await expect(cards.locator('[data-card-name]')).toHaveText('Frozen Shrine');
  await page.keyboard.press('Escape'); // (clears it; the drawer stays)
  await expect(cards).toHaveCount(all);
  await expect(page.locator('[data-library]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-library]')).toBeHidden();
  expect(errors).toEqual([]);
});
