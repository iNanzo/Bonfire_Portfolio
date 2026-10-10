// Bonfire Live's settings dialog in a real browser: the search (it filters every tab in
// place, counts each tab's finds, shows an All Settings row in the Simple view, marks the words
// found without ever running an imported name as markup), its keys (/ from the page, / and
// Ctrl+F in the dialog, Esc to clear and then to close, ↓ and ↑ through the results without
// changing them, Enter to reveal the one meant, the tabs' arrow keys going to each tab's finds
// and keeping them all), the bulk buttons and their Undo (one change, one save, the focus
// kept), a setting that does nothing as things stand (disabled, saying why, the focus still
// kept in the dialog when it's gone to), the keyboard shortcuts (?, every group in sight),
// short screens and phones (the header in sight, the presets' note whole and right after an
// Undo), Frame Rate capping how often the picture is drawn, and the Stats Overlay (U, or
// Picture › Performance; ?perf shows it too). No errors anywhere.
import { test, expect } from '@playwright/test';

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Bonfire Live with its scene ready; every localStorage write counted (window.__writes). */
async function open(page, query = '') {
  await page.addInitScript(() => {
    window.__writes = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      window.__writes.push(k);
      return set.call(this, k, v);
    };
  });
  await page.goto(`/visualizer/${query}`);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
}
const dialog = (page) => page.locator('[data-settings]');
const box = (page) => page.locator('#viz-settings-search');
/** The rows a search shows (found, not hidden). */
const shown = (page) =>
  page
    .locator('[data-settings] [data-row].is-hit')
    .evaluateAll((rows) => rows.filter((r) => r.getClientRects().length).map((r) => r.dataset.row));
const count = (page, tab) => page.locator(`[data-tab="${tab}"] [data-tab-count]`);

test('search: "strobe" finds the flashes in every tab, each tab counting its finds; Esc clears, then closes', async ({
  page,
}) => {
  const errors = watch(page);
  await open(page);
  // / on the page opens the settings with the box focused.
  await page.keyboard.press('/');
  await expect(dialog(page)).toBeVisible();
  await expect(box(page)).toBeFocused();
  await page.keyboard.type('strobe');
  await expect(page.locator('[data-settings] form')).toHaveAttribute('data-searching', '');
  // (A pass takes a few ms; the time allowed is for a runner starved by software-rendered WebGL.)
  await expect
    .poll(() => shown(page), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['flash', 'flicker', 'hitFlash']));
  for (const id of ['flash', 'hitFlash', 'flicker']) await expect(page.locator(`[data-row="${id}"]`)).toBeVisible();
  // Each tab with finds says how many; the rest are greyed at 0.
  expect(Number(await count(page, 'drops').textContent())).toBeGreaterThanOrEqual(2);
  expect(Number(await count(page, 'effects').textContent())).toBeGreaterThanOrEqual(1);
  await expect(count(page, 'sound')).toHaveText('0');
  await expect(page.locator('[data-tab="sound"]')).toHaveClass(/is-empty/);
  // The words found are marked in the names; settings that don't match are gone.
  await expect(page.locator('[data-row="flash"] mark')).toHaveText('Flash');
  await expect(page.locator('[data-row="sensitivity"]')).toBeHidden();
  await expect(page.locator('[data-settings-search] [role="status"]')).toContainText(/settings? found/);
  // Esc clears the search (the dialog stays), and a second Esc closes it.
  await page.keyboard.press('Escape');
  await expect(box(page)).toHaveValue('');
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('[data-row="sensitivity"]')).toBeVisible();
  await expect(page.locator('[data-settings] mark')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('search: the arrow keys, Home and End on the tabs go to each tab’s finds and keep every result', async ({
  page,
}) => {
  const errors = watch(page);
  await open(page);
  await page.keyboard.press('/');
  await expect(box(page)).toBeFocused();
  await page.keyboard.type('glow');
  await expect.poll(async () => (await shown(page)).length, { timeout: 15_000 }).toBeGreaterThan(3);
  const found = await shown(page);
  const tab = (id) => page.locator(`[data-tab="${id}"]`);
  // From Sound (no finds) to Show (none either), then Drops (some): the results all stay.
  await tab('sound').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('show')).toBeFocused();
  expect(await shown(page)).toEqual(found);
  await page.keyboard.press('ArrowRight');
  await expect(tab('drops')).toBeFocused();
  await expect(tab('drops')).toHaveAttribute('tabindex', '0');
  await expect(tab('sound')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('[data-tab-panel="drops"] [data-row].is-hit').first()).toBeInViewport();
  await page.keyboard.press('End');
  await expect(tab('setups')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab('sound')).toBeFocused();
  expect(await shown(page)).toEqual(found);
  await expect(box(page)).toHaveValue('glow');
  await expect(page.locator('[data-settings] form')).toHaveAttribute('data-searching', '');
  // With the search cleared, the arrows show one tab at a time again.
  await box(page).fill('');
  await expect(page.locator('[data-settings] form')).not.toHaveAttribute('data-searching', '');
  await tab('sound').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('show')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-tab-panel="show"]')).toBeVisible();
  await expect(page.locator('[data-tab-panel="sound"]')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Esc with a focused field’s tip showing takes the tip away and leaves the dialog open; the next Esc closes it', async ({
  page,
}) => {
  const errors = watch(page);
  await open(page);
  await page.keyboard.press('s');
  await expect(dialog(page)).toBeVisible();
  const tip = page.locator('.ui-tip');
  await page.keyboard.press('Shift'); // (so the focus that follows is the keyboard's: :focus-visible)
  await page.locator('[data-set="sensitivity"]').focus();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('search: a row only All Settings has shows in the Simple view, badged; ↓ goes into the results; Enter reveals one', async ({
  page,
}) => {
  const errors = watch(page);
  await open(page);
  await page.keyboard.press('s');
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('[data-settings] form')).toHaveAttribute('data-view', 'simple');
  await expect(page.locator('[data-row="ditherMatrix"]')).toBeHidden();
  // Ctrl+F in the dialog goes to the box.
  await page.locator('[data-tab="camera"]').click();
  await page.keyboard.press('Control+f');
  await expect(box(page)).toBeFocused();
  await page.keyboard.type('dither pattern');
  const row = page.locator('[data-row="ditherMatrix"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.viz-adv-badge')).toBeVisible();
  await expect(row.locator('.viz-adv-badge')).toHaveText('All Settings');
  // ↓: the first result, the row itself (↓ again on its field would change the setting);
  // ↓ past the last stays, ↑ from the first goes back to the box, Enter goes into the row.
  await page.keyboard.press('ArrowDown');
  await expect(row).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(row).toBeFocused();
  await expect(page.locator('[data-set="ditherMatrix"]')).toHaveValue('4');
  await page.keyboard.press('ArrowUp');
  await expect(box(page)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-set="ditherMatrix"]')).toBeFocused();
  await expect(box(page)).toHaveValue('dither pattern');
  // Enter on a single result: its tab, shown and focused (the search cleared).
  await box(page).focus();
  await page.keyboard.press('Enter');
  await expect(box(page)).toHaveValue('');
  await expect(page.locator('[data-tab="picture"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-set="ditherMatrix"]')).toBeFocused();
  await expect(row).toBeVisible();
  await expect(row).toBeInViewport();
  // / in the dialog (not while typing) goes back to the box.
  await page.locator('[data-tab="picture"]').focus();
  await page.keyboard.press('/');
  await expect(box(page)).toBeFocused();
  // Several results, one named just as typed: Enter reveals that one.
  await page.keyboard.type('frame rate');
  await expect.poll(() => shown(page), { timeout: 15_000 }).toEqual(expect.arrayContaining(['frameRate', 'flameFps']));
  await page.keyboard.press('Enter');
  await expect(box(page)).toHaveValue('');
  await expect(page.locator('[data-set="frameRate"]')).toBeFocused();
  // Several with none named so: Enter goes to the first, changing nothing.
  await box(page).focus();
  await page.keyboard.type('strobe');
  await expect.poll(() => shown(page), { timeout: 15_000 }).toEqual(expect.arrayContaining(['flash', 'flicker']));
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-settings] [data-row].is-hit:focus')).toHaveCount(1);
  await expect(box(page)).toHaveValue('strobe');
  await page.keyboard.press('/');
  // Nothing found: words to try.
  await page.keyboard.type('zzqqx');
  await expect(page.locator('[data-search-empty]')).toBeVisible();
  await expect(page.locator('[data-search-suggest] [data-suggest]').first()).toBeVisible();
  await page.locator('[data-search-suggest] [data-suggest]').first().click();
  await expect(page.locator('[data-search-empty]')).toBeHidden();
  expect(errors).toEqual([]);
});

test('search: an imported setup named like markup is found and marked as text, never run', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  await page.keyboard.press('s');
  await page.locator('[data-tab="setups"]').click();
  const name = '<img src=x onerror="window.__xss=1">';
  await page.locator('[data-setup-file]').setInputFiles({
    name: 'setups.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'bonfire-live', setups: { [name]: { glitch: 0.5 } } })),
  });
  await expect(page.locator('[data-setups] [data-name]')).toHaveText(name);
  await box(page).fill('img');
  const found = page.locator('[data-setups] [data-row^="setup:"]');
  await expect(found).toBeVisible();
  await expect(found.locator('mark')).toHaveText('img');
  await expect(found.locator('[data-name]')).toHaveText(name);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('[data-settings] img[src="x"]').count()).toBe(0);
  // Deleted, then undone: back, and the toast says so (no Undo left that does nothing).
  await box(page).fill('');
  await page.locator('[data-setups] [data-setup-delete]').click();
  await expect(page.locator('[data-setups] [data-name]')).toHaveCount(0);
  await page.locator('[data-toast-undo]').click();
  await expect(page.locator('[data-setups] [data-name]')).toHaveText(name);
  await expect(page.locator('[data-toast]')).toContainText('undone');
  await expect(page.locator('[data-toast-undo]')).toBeHidden();
  await expect(page.locator('[data-setups] [data-setup-delete]')).toBeFocused();
  expect(errors).toEqual([]);
});

test('setups: Load (by key or click) keeps the focus on its button, so the dialog’s keys still work; and its Undo', async ({
  page,
}) => {
  const errors = watch(page);
  await open(page);
  await page.keyboard.press('s');
  await page.locator('[data-tab="setups"]').click();
  await page.locator('[data-setup-name]').fill('Mine');
  await page.locator('[data-setup-save]').click();
  const load = page.locator('[data-setups] [data-setup-load="Mine"]');
  await load.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-toast-text]')).toHaveText('Loaded “Mine”');
  await expect(load).toBeFocused(); // (the list drawn again: the new Load for Mine)
  await page.keyboard.press('?');
  await expect(page.locator('.keys-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.keys-overlay')).toBeHidden();
  await expect(dialog(page)).toBeVisible();
  await load.click();
  await expect(load).toBeFocused();
  await page.keyboard.press('Control+f');
  await expect(box(page)).toBeFocused();
  // Undo draws the list again too: the focus stays in the dialog.
  await page.locator('[data-toast-undo]').click();
  await expect(page.locator('[data-toast-undo]')).toBeHidden();
  expect(
    await page.evaluate(() => document.querySelector('[data-settings]').contains(document.activeElement)),
    'the focus in the dialog',
  ).toBe(true);
  await page.keyboard.press('/');
  await expect(box(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('bulk buttons: All Off on the Looks is one change and one save; Undo puts every look back', async ({ page }) => {
  const errors = watch(page);
  await open(page, '?bench');
  await page.keyboard.press('s');
  await page.locator('[data-tab="effects"]').click();
  const looks = () => page.evaluate(() => JSON.stringify(window.__viz.settings.looks));
  const before = await looks();
  await page.evaluate(() => {
    window.__writes.length = 0;
  });
  await page.locator('[data-bulk-group="looks"][data-bulk="off"]').click();
  expect(Object.values(JSON.parse(await looks())).every((v) => v === 'off')).toBe(true);
  // Each switch shows it.
  await expect(page.locator('[data-row="looks.glitch"] input[value="off"]')).toBeChecked();
  await expect(page.locator('[data-toast]')).toContainText('Looks: All Off');
  await page.waitForTimeout(700); // (saving waits 300 ms for the changes to settle)
  expect(await page.evaluate(() => window.__writes.filter((k) => k === 'bonfire-live').length)).toBe(1);
  // Undo from the keyboard: the button that made the change gets the focus back (the dialog's
  // keys keep working).
  await page.locator('[data-toast-undo]').focus();
  await page.keyboard.press('Enter');
  expect(await looks()).toBe(before);
  await expect(page.locator('[data-row="looks.glitch"] input[value="mix"]')).toBeChecked();
  await expect(page.locator('[data-bulk-group="looks"][data-bulk="off"]')).toBeFocused();
  await expect(page.locator('[data-toast-undo]')).toBeHidden();
  // Layers shows nothing in the Simple view: its cue names what's there, its Reset Section
  // waits for All Settings; the cue shows them and goes to the first.
  await expect(page.locator('[data-show-all="layers"]')).toHaveText('Only In All Settings: Layers, Mirror Kinds');
  await expect(page.locator('[data-reset-section="layers"]')).toBeHidden();
  await page.locator('[data-show-all="layers"]').click();
  await expect(page.locator('[data-settings] form')).toHaveAttribute('data-view', 'all');
  await expect(page.locator('[data-section="layers"] [data-set]:focus')).toHaveCount(1);
  await page.locator('[data-view-pick][value="simple"]').check();
  // Shuffle and All Always (Ember has no Always: it takes In the Mix).
  await page.locator('[data-bulk-group="looks"][data-bulk="on"]').click();
  expect(JSON.parse(await looks()).ember).toBe('mix');
  // A checklist that keeps one on: None is unavailable, and says why.
  await page.locator('[data-view-pick][value="all"]').check();
  const none = page.locator('[data-bulk-group="mirrors"][data-bulk="none"]');
  await expect(none).toHaveAttribute('aria-disabled', 'true');
  await none.dispatchEvent('click'); // (a click on it does nothing: its tip says why)
  expect(Object.values(await page.evaluate(() => window.__viz.settings.mirrors)).some(Boolean)).toBe(true);
  // Reset Section, undone.
  await page.locator('[data-tab="cast"]').click();
  await page.locator('[data-row="knightStyle"] select').selectOption('first');
  await page.locator('[data-reset-section="armor"]').click();
  expect(await page.evaluate(() => window.__viz.settings.knightStyle)).toBe('site');
  await page.locator('[data-toast-undo]').click();
  expect(await page.evaluate(() => window.__viz.settings.knightStyle)).toBe('first');
  expect(errors).toEqual([]);
});

test('a setting that does nothing as things stand is disabled, saying why; Edge Glow back on brings it back', async ({
  page,
}) => {
  const errors = watch(page);
  await open(page);
  await page.keyboard.press('s');
  await page.locator('[data-tab="cast"]').click();
  const rim = page.locator('[data-set="knightRim"]');
  await expect(rim).toBeEnabled();
  await page.locator('[data-set="knightGlow"][value="off"]').check();
  await expect(rim).toBeDisabled();
  await expect(page.locator('#viz-why-knightRim')).toHaveText('Edge Glow is Off');
  await expect(page.locator('#viz-why-knightRim')).toBeVisible();
  await expect(rim).toHaveAttribute('aria-describedby', /viz-why-knightRim/);
  await page.locator('[data-set="knightGlow"][value="mix"]').check();
  await expect(rim).toBeEnabled();
  await expect(page.locator('#viz-why-knightRim')).toBeHidden();
  await expect(rim).not.toHaveAttribute('aria-describedby', /viz-why-knightRim/);
  // A checklist: the firefly dances, with their light show and the preset scenes both Off.
  await page.locator('[data-view-pick][value="all"]').check();
  await page.locator('[data-tab="scenes"]').click();
  await page.locator('[data-set="scenes"][value="off"]').check();
  await page.locator('[data-tab="cast"]').click();
  await page.locator('[data-set="blink"]').uncheck();
  const fly = page.locator('[data-row="flyMoves"]');
  await expect(fly.locator('#viz-why-flyMoves')).toHaveText('Blink & Dance and Preset Scenes are Off');
  for (const item of await fly.locator('input[data-set]').all()) {
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute('aria-describedby', /viz-why-flyMoves/);
  }
  for (const b of await fly.locator('.bulk-btn').all()) await expect(b).toBeDisabled();
  // (Dimmed, its name too.)
  expect(
    Number(
      await fly
        .locator('.viz-field-label [data-name]')
        .first()
        .evaluate((el) => getComputedStyle(el.closest('.viz-field-label > *')).opacity),
    ),
  ).toBeLessThan(1);
  await page.locator('[data-set="blink"]').check();
  for (const item of await fly.locator('input[data-set]').all()) await expect(item).toBeEnabled();
  await expect(fly.locator('#viz-why-flyMoves')).toBeHidden();
  // One that's off still takes the focus, which never drops out of the dialog (where / and ?
  // stop working): the Beat cue's one setting, Link Bridge Port (until Beat From is Link)…
  await page.locator('[data-view-pick][value="simple"]').check();
  await page.locator('[data-tab="sound"]').click();
  await page.locator('[data-show-all="beat"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-row="linkPort"]')).toBeFocused();
  await page.keyboard.press('/');
  await expect(box(page)).toBeFocused();
  // …and a result stepped to with nothing to go into, Harmony: Enter shows it in its place.
  await page.keyboard.type('harmony');
  await page.keyboard.press('ArrowDown');
  const harmony = page.locator('[data-row="scheme"]');
  await expect(harmony).toBeFocused();
  await expect(page.locator('[data-set="scheme"]').first()).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(box(page)).toHaveValue('');
  await expect(harmony).toBeFocused();
  await page.keyboard.press('/');
  await expect(box(page)).toBeFocused();
  expect(errors).toEqual([]);
});

/** Every group of the shortcuts lies inside the overlay's box (scrolled to, if need be). */
async function groupsInSight(page) {
  const keys = page.locator('.keys-overlay');
  const groups = keys.locator('.keys-overlay-groups');
  expect(await groups.evaluate((g) => g.scrollWidth <= g.clientWidth + 1), 'nothing off to the side').toBe(true);
  for (const title of await keys.locator('.keys-group-title').all()) {
    await title.evaluate((t) => t.scrollIntoView({ block: 'nearest' }));
    const [t, g] = [await title.boundingBox(), await groups.boundingBox()];
    expect(
      t.x >= g.x - 1 && t.x + t.width <= g.x + g.width + 1 && t.y >= g.y - 1 && t.y + t.height <= g.y + g.height + 1,
      `${await title.textContent()} in sight`,
    ).toBe(true);
  }
}

test('? lists the keyboard shortcuts in groups, from the page and from the settings', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await page.keyboard.press('?');
  const keys = page.locator('.keys-overlay');
  await expect(keys).toBeVisible();
  await expect(keys.locator('.keys-group-title')).toHaveText(['Moments', 'Beat', 'Show', 'View & Menus']);
  await groupsInSight(page);
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  await page.keyboard.press('s');
  await expect(dialog(page)).toBeVisible();
  // ? in the settings (not while typing), and the footer's button, open it over them.
  await page.keyboard.press('?');
  await expect(keys).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  await expect(dialog(page)).toBeVisible();
  await page.locator('.viz-keys-btn').click();
  await expect(keys).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  await expect(dialog(page)).toBeVisible();
  // Typed in the search box, ? is only a character.
  await box(page).focus();
  await page.keyboard.press('?');
  await expect(box(page)).toHaveValue('?');
  await expect(keys).toBeHidden();
  // A shortcut found, stepped to with ↓: Enter opens the shortcuts (it has no field to go into).
  await box(page).fill('tap the tempo');
  await expect(page.locator('[data-settings] [data-row^="key:"].is-hit')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-settings] [data-row^="key:"]:focus')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(keys).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  expect(errors).toEqual([]);
});

/** The presets' note read whole: as tall as it is with no line limit, and no line cut short. */
const noteWhole = (page) =>
  page.locator('[data-preset-note]').evaluate((el) => {
    const h = el.getBoundingClientRect().height;
    el.style.webkitLineClamp = 'none';
    const all = el.getBoundingClientRect().height;
    el.style.webkitLineClamp = '';
    return h > 0 && Math.abs(h - all) < 1 && el.scrollWidth <= el.clientWidth + 1;
  });
/** Nothing off the dialog's sides: its ✕ and both views in it. */
const headerFits = (page) =>
  page.evaluate(() => {
    const inner = document.querySelector('.viz-settings-inner');
    const edge = inner.getBoundingClientRect();
    const inside = (el) => {
      const r = el.getBoundingClientRect();
      return r.left >= edge.left - 1 && r.right <= edge.right + 1;
    };
    return {
      wide: inner.scrollWidth <= inner.clientWidth + 1,
      close: inside(document.querySelector('.viz-close')),
      views: [...document.querySelectorAll('.viz-view-switch label')].every(inside),
    };
  });

test('a short screen keeps most of the dialog for the settings; a phone reads the toast whole, the presets’ note and every shortcut group', async ({
  browser,
}) => {
  const baseURL = test.info().project.use.baseURL;
  const fits = { wide: true, close: true, views: true };
  // A phone on its side: the note beside the presets' names (two lines hold it), then, a
  // narrower one, on a line of its own.
  const land = await browser.newPage({
    baseURL,
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const errors = watch(land);
  await open(land);
  await land.locator('[data-start] [data-act="settings"]').click();
  await expect(dialog(land)).toBeVisible();
  const [body, whole] = await land.evaluate(() => [
    document.querySelector('[data-settings-body]').clientHeight,
    document.querySelector('.viz-settings-inner').clientHeight,
  ]);
  expect(body / whole, `${body} of ${whole} px for the settings`).toBeGreaterThan(0.5);
  await expect(land.locator('[data-preset-note]')).toContainText('Club');
  expect(await headerFits(land)).toEqual(fits);
  for (const [width, height] of [
    [844, 390],
    [667, 375],
  ]) {
    await land.setViewportSize({ width, height });
    for (const id of ['chill', 'club', 'rave', 'safe']) {
      await land.locator(`.viz-presets-top [data-preset="${id}"]`).dispatchEvent('pointerover');
      expect(await noteWhole(land), `${id}'s note whole at ${width}×${height}`).toBe(true);
    }
  }
  await land.close();
  // A phone.
  const phone = await browser.newPage({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const phoneErrors = watch(phone);
  await open(phone);
  await phone.locator('[data-start] [data-act="settings"]').click();
  await expect(phone.locator('[data-preset-note]')).toBeVisible();
  // Low Flash tapped, then Undo: Club's in use again and the note says so (not Low Flash,
  // which the Undo gave the focus back to).
  await phone.locator('.viz-presets-top [data-preset="safe"]').tap();
  await expect(phone.locator('[data-preset-note]')).toContainText('Low Flash');
  await phone.locator('[data-toast-undo]').tap();
  await expect(phone.locator('.viz-presets-top [data-preset="club"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(phone.locator('[data-preset-note]')).toContainText('Club');
  await phone.locator('[data-tab="effects"]').click();
  await phone.locator('[data-bulk-group="looks"][data-bulk="shuffle"]').click();
  const toast = phone.locator('[data-toast-text]');
  await expect(toast).toHaveText('Looks: Shuffle');
  expect(await toast.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the toast read whole').toBe(true);
  await expect(phone.locator('[data-toast-undo]')).toBeVisible();
  await phone.locator('.viz-keys-btn').click();
  await expect(phone.locator('.keys-overlay')).toBeVisible();
  await groupsInSight(phone);
  await phone.keyboard.press('Escape');
  await expect(phone.locator('.keys-overlay')).toBeHidden();
  // A small phone held upright, under its browser's bars (short as a phone on its side): the
  // phone's header, nothing off the side, the whole note (the longest, Low Flash's; the looks
  // shuffled, no preset is in use).
  await phone.setViewportSize({ width: 360, height: 560 });
  expect(await headerFits(phone)).toEqual(fits);
  await phone.locator('.viz-presets-top [data-preset="safe"]').dispatchEvent('pointerover');
  expect(await noteWhole(phone), 'the note whole at 360×560').toBe(true);
  await phone.close();
  expect([...errors, ...phoneErrors]).toEqual([]);
});

test('Frame Rate 30 caps how often the picture is drawn; Display takes the cap off; it isn’t in a setup', async ({
  page,
}) => {
  const errors = watch(page);
  await open(page, '?bench');
  expect(await page.evaluate(() => window.__viz.fire.maxFps)).toBe(0);
  await page.keyboard.press('s');
  await page.locator('[data-tab="picture"]').click();
  await page.locator('[data-set="frameRate"]').selectOption('30');
  expect(await page.evaluate(() => window.__viz.fire.maxFps)).toBe(30);
  // Frames drawn in two seconds: at most 30 a second.
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const off = window.__viz.fire.onRendered(() => {
          n++;
        });
        setTimeout(() => {
          off();
          resolve(n / 2);
        }, 2000);
      }),
  );
  expect(fps).toBeLessThanOrEqual(31.5);
  await page.locator('[data-set="frameRate"]').selectOption('display');
  expect(await page.evaluate(() => window.__viz.fire.maxFps)).toBe(0);
  await page.locator('[data-set="frameRate"]').selectOption('60');
  await page.locator('[data-tab="setups"]').click();
  await page.locator('[data-setup-name]').fill('Capped');
  await page.locator('[data-setup-save]').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live-setups')).Capped);
  expect(saved).not.toHaveProperty('frameRate');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live') ?? '{}').frameRate))
    .toBe('60');
  expect(errors).toEqual([]);
});

test('Stats Overlay: U shows the frames, the particles and the show in a corner, out of the way; kept here, not in a setup', async ({
  page,
}) => {
  const errors = watch(page);
  await open(page);
  const overlay = page.locator('.stats-overlay');
  await expect(overlay).toHaveCount(0);
  await page.click('[data-source="demo"]');
  await page.keyboard.press('u');
  await expect(overlay).toBeVisible();
  // (Its text is built twice a second.)
  for (const words of ['Frames', 'fps', 'Particles', 'Bonfire flames', 'Show', 'Section', 'Look', 'Layers', 'Loop'])
    await expect(overlay).toContainText(words, { timeout: 10_000 });
  // It never takes the pointer, isn't read out, and sits top left, clear of the HUD below.
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  expect(await overlay.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  const corner = await overlay.boundingBox();
  const hud = await page.locator('[data-hud]').boundingBox();
  expect(corner.x).toBeLessThan(80);
  expect(corner.y + corner.height).toBeLessThan(hud.y);
  // The setting it is: kept on this computer, ticked in Picture › Performance, never in a setup.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live') ?? '{}').stats))
    .toBe(true);
  await page.keyboard.press('s');
  await page.locator('[data-tab="picture"]').click();
  await expect(page.locator('[data-set="stats"]')).toBeChecked();
  await page.locator('[data-tab="setups"]').click();
  await page.locator('[data-setup-name]').fill('Watching');
  await page.locator('[data-setup-save]').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bonfire-live-setups')).Watching);
  expect(saved).not.toHaveProperty('stats');
  // Unticked: gone.
  await page.locator('[data-tab="picture"]').click();
  await page.locator('[data-set="stats"]').uncheck();
  await expect(overlay).toHaveCount(0);
  await page.keyboard.press('Escape');
  // ?perf shows the same overlay, the setting off.
  await page.goto('/visualizer/?perf');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(overlay).toContainText('Frames', { timeout: 10_000 });
  await expect(overlay).toContainText('Particles');
  // U there switches the setting; switched off, the note says ?perf keeps it showing (it does).
  await page.click('[data-source="demo"]');
  await page.keyboard.press('u');
  await page.keyboard.press('u');
  await expect(page.locator('[data-state]')).toContainText('?perf');
  await expect(overlay).toBeVisible();
  expect(errors).toEqual([]);
});

/** Two boxes (boundingBox's) overlap. */
const crosses = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** The stacking order of an element (its computed z-index). */
const zOf = (locator) => locator.evaluate((el) => Number(getComputedStyle(el).zIndex));
/** The stats overlay, kept to less room than its rows need, ends on a whole row: none is cut through. */
const wholeRows = (overlay) =>
  overlay.evaluate((el) => {
    const end = el.getBoundingClientRect().bottom;
    return [...el.querySelectorAll('span')].every(
      (s) => !s.getClientRects().length || s.getBoundingClientRect().bottom <= end,
    );
  });

test('Stats Overlay: under Render Settings (P) and clear of it, on the start screen and in the show, wide and on a phone', async ({
  page,
}) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await open(page);
  const overlay = page.locator('.stats-overlay');
  const menu = page.locator('.viz-render-menu');
  /** P opens Render Settings: the overlay, still showing, never crosses it (and is under it). */
  async function clearOfMenu() {
    await page.keyboard.press('p');
    await expect(menu).toBeVisible();
    await expect.poll(async () => crosses(await overlay.boundingBox(), await menu.boundingBox())).toBe(false);
    expect((await overlay.boundingBox()).height).toBeGreaterThan(40);
    expect(await zOf(overlay)).toBeLessThan(await zOf(menu));
    await page.keyboard.press('p');
    await expect(menu).toBeHidden();
  }
  // The start screen (Render Settings works there too), wide.
  await page.keyboard.press('u');
  await expect(overlay).toContainText('Frames', { timeout: 10_000 });
  await clearOfMenu();
  // The show, wide, then on a phone (where Render Settings takes the width).
  await page.click('[data-source="demo"]');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'live');
  await clearOfMenu();
  await page.setViewportSize({ width: 390, height: 844 });
  await clearOfMenu();
  expect(errors).toEqual([]);
});

test('Stats Overlay: on a phone’s start screen it keeps to the room above the start menu, clear of its words', async ({
  page,
}) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const overlay = page.locator('.stats-overlay');
  const copy = page.locator('.viz-start-copy');
  const home = page.locator('.viz-home');
  /** What the overlay shows (nothing, held to no room, counts as clear) crosses none of these. */
  const clearOf = async (...others) => {
    const o = await overlay.boundingBox();
    if (!o?.height) return true;
    for (const other of others) if (crosses(o, await other.boundingBox())) return false;
    return true;
  };
  await page.keyboard.press('u');
  await expect(overlay).toContainText('Frames', { timeout: 10_000 });
  await expect.poll(() => clearOf(copy, home)).toBe(true);
  // (Its first rows, the frame rate, fit above the start menu here; the rest are left out.)
  expect((await overlay.boundingBox()).height).toBeGreaterThan(40);
  await expect.poll(() => wholeRows(overlay)).toBe(true);
  // A smaller phone, where the start menu takes the whole screen; a tablet, beside it.
  for (const [width, height] of [
    [360, 640],
    [800, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => clearOf(copy, home), { message: `${width}×${height}` }).toBe(true);
  }
  // The show: all of it, top left.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-source="demo"]');
  await expect(overlay).toContainText('Section', { timeout: 10_000 });
  expect((await overlay.boundingBox()).height).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('Stats Overlay: on a phone held sideways it keeps above the HUD while the HUD is up, all of it once it fades', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = watch(page);
  await page.addInitScript(() => localStorage.setItem('bonfire-live', JSON.stringify({ stats: true })));
  await open(page);
  await page.locator('[data-source="demo"]').tap();
  const overlay = page.locator('.stats-overlay');
  const hud = page.locator('[data-hud]');
  await expect(overlay).toContainText('Section', { timeout: 10_000 });
  const above = async () => {
    const o = await overlay.boundingBox();
    return !o?.height || o.y + o.height <= (await hud.boundingBox()).y;
  };
  for (const [width, height] of [
    [844, 390],
    [740, 360],
  ]) {
    await page.setViewportSize({ width, height });
    await page.touchscreen.tap(width / 2, height / 3);
    await expect(hud).toHaveCSS('opacity', '1');
    await expect.poll(above, { message: `${width}×${height}` }).toBe(true);
    await expect.poll(() => wholeRows(overlay), { message: `${width}×${height}: whole rows` }).toBe(true);
  }
  // The HUD fades: the overlay has the screen's height again.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.touchscreen.tap(422, 130);
  await expect.poll(above).toBe(true);
  const capped = (await overlay.boundingBox()).height;
  await expect(hud).toHaveCSS('opacity', '0', { timeout: 10_000 });
  await expect.poll(async () => (await overlay.boundingBox()).height).toBeGreaterThan(capped);
  await context.close();
  expect(errors).toEqual([]);
});

test('the HUD stays while the mouse rests on it (its tip with it), and fades when it rests on the picture', async ({
  page,
}) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await page.click('[data-source="demo"]');
  const drop = page.locator('[data-hud] [data-act="drop"]');
  await expect(drop).toBeVisible();
  const at = await drop.boundingBox();
  await page.mouse.move(at.x + at.width / 2 - 2, at.y + at.height / 2);
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect(page.locator('.ui-tip')).toBeVisible();
  await page.waitForTimeout(3600); // past the 3 s the HUD waits before fading
  await expect(page.locator('body')).not.toHaveClass(/is-idle/);
  await expect(page.locator('.ui-tip')).toBeVisible();
  // Off the HUD, over the picture, the same rest fades it.
  await page.mouse.move(640, 260);
  await expect(page.locator('body')).toHaveClass(/is-idle/, { timeout: 8000 });
  expect(errors).toEqual([]);
});
