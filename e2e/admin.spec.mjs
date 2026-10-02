// The admin as it's deployed: built, under its production security headers (admin:preview,
// admin/server/csp.js), with its API read-only, so nothing here writes content.json.
//   • nothing it draws breaks the policy: the flame swatches, the table columns and the
//     palette and scene chips are styled, and no policy error reaches the console;
//   • the search: Ctrl+K "dither" + Enter lands on Dither (Picture), "Fast Travel" finds the
//     pack's Map action, / opens it and Esc clears then closes;
//   • a result lands in sight, below the sticky top bar, page strip and pinned preview, on a
//     laptop and a phone, from a page with the preview and to one without; a search that
//     finds nothing says so on a phone too;
//   • #effects still opens (on Colors); Reset Flame Colors keeps your palettes, with Undo,
//     which the focus goes to (and back to Reset from);
//   • a deploy check for an older save that answers after a newer save is dropped: the
//     status follows the newer save's commit, with one "live" toast and one loop;
//   • every page's hover tips stay inside the window at 1280×720 and 390×844, and no title
//     attribute is left (the shared tooltip shows hints).
import { test, expect } from '@playwright/test';
import { assertInViewport, checkTip } from './lib/tips.mjs';

const ADMIN = process.env.PW_ADMIN_ORIGIN ?? `http://127.0.0.1:${(Number(process.env.PW_PORT) || 4173) + 100}`;
const PAGES = [
  'projects',
  'home',
  'about',
  'journey',
  'skills',
  'contact',
  'colors',
  'fire',
  'picture',
  'knight',
  'scenes',
  'headings',
  'interface',
];

/** Collect what the Content Security Policy refuses: its events in the page, and the console's words. */
async function watchPolicy(page) {
  const said = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (apply|load|execute|frame|connect)/i.test(m.text())) said.push(m.text());
  });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective}: ${e.blockedURI || e.sample}`),
    );
  });
  return async () => [...said, ...(await page.evaluate(() => window.__csp))];
}

/** Open an admin page; returns the response (headers included). */
async function open(page, id) {
  const res = await page.goto(`${ADMIN}/#${id}`);
  await expect(page.locator('.page-title')).toBeVisible();
  return res;
}

const background = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
/** The field that has the focus: its data-path. */
const focusedPath = (page) =>
  page.evaluate(() => document.activeElement?.closest('[data-path]')?.getAttribute('data-path') ?? null);

/**
 * The admin given its content with the pack's map action named "Fast Travel", whatever
 * content.json calls it now: the admin can rename it, so the words searched for are the
 * test's own, never pinned from the file.
 */
const FAST_TRAVEL = 'Fast Travel';
async function withPackVerb(page) {
  await page.route('**/api/content', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.content.ui.packMapVerb = FAST_TRAVEL;
    await route.fulfill({ response, json });
  });
}

/**
 * Where the focused control is, and the part of the window it should be in: below whatever
 * sticks across the top (the top bar; on a phone the page strip; under 1280 px a pinned preview).
 */
const landing = (page) =>
  page.evaluate(() => {
    const r = document.activeElement.getBoundingClientRect();
    const stuck = [...document.querySelectorAll('.topbar, .sidebar, [data-preview-slot]')]
      .map((n) => [n, n.getBoundingClientRect()])
      .filter(
        ([n, b]) =>
          !n.hidden && getComputedStyle(n).position === 'sticky' && b.top < innerHeight / 2 && b.width > innerWidth / 2,
      )
      .map(([, b]) => b.bottom);
    return { top: r.top, bottom: r.bottom, below: Math.max(0, ...stuck), height: innerHeight };
  });

/**
 * The tip triggers that show, as locators, found in one pass over the page (a locator's own
 * isVisible() is a round trip each, and a page has hundreds).
 */
async function visibleTips(page) {
  const all = page.locator('[data-tip]');
  const shown = await all.evaluateAll((els) =>
    els.flatMap((el, i) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' ? [i] : [];
    }),
  );
  return shown.map((i) => all.nth(i));
}

// The live preview frames the real site (software-rendered WebGL: heavy). Only the policy
// test lets it load; the rest leave the frame empty.
test.beforeEach(async ({ page, baseURL }, info) => {
  if (!info.title.startsWith('under the production policy'))
    await page.route(`${new URL(baseURL).origin}/**`, (route) => route.abort());
});

test('under the production policy: swatches, table columns and chips are styled, and nothing is refused', async ({
  page,
}) => {
  test.slow(); // (the preview loads the whole site)
  const refused = await watchPolicy(page);
  const res = await open(page, 'colors');
  const policy = res.headers()['content-security-policy'] ?? '';
  expect(policy, 'served with the Worker’s policy').toContain("style-src 'self'");
  expect(policy).not.toContain('unsafe-inline');
  // The one frame allowed: the site, in the live preview (it says it's ready over postMessage).
  await expect(page.locator('.preview-state')).toHaveText('Live', { timeout: 90_000 });

  // A flame card's swatch strip (was blank under this policy: style attributes are refused).
  const swatch = page.locator('[data-path="effects.flames"] .card .swatch').first();
  await expect(swatch).toBeVisible();
  expect(await background(swatch)).not.toBe(TRANSPARENT);
  // A flame's palette tools: its colors as dots, and suggestion chips built from one.
  const card = page.locator('[data-path="effects.flames"] .collection > .card').first();
  await card.locator('.card-toggle').click();
  const dot = card.locator('.pt-dot').first();
  expect(await background(dot)).not.toBe(TRANSPARENT);
  await dot.click();
  const chip = card.locator('.pt-chip .pt-strip i').first();
  await expect(chip).toBeVisible();
  expect(await background(chip)).not.toBe(TRANSPARENT);

  // The key prompts table: its column count drives the grid (a custom property set by script).
  await open(page, 'interface');
  const table = page.locator('[data-path="ui.prompts"] .rows.table');
  await expect(table).toBeVisible();
  expect(await table.evaluate((el) => getComputedStyle(el).getPropertyValue('--cols').trim())).toBe('3');
  const tracks = await table
    .locator('.row')
    .nth(1)
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(tracks, 'handle, 3 columns, ↑ ↓ ✕').toBe(7);

  // A scene card's swatches.
  await open(page, 'scenes');
  const sceneSwatch = page.locator('.scene-swatches .swatch').first();
  await expect(sceneSwatch).toBeVisible();
  expect(await background(sceneSwatch)).not.toBe(TRANSPARENT);

  expect(await refused(), 'no policy violations').toEqual([]);
});

test('Ctrl+K “dither” + Enter lands on Dither, on Picture, focused', async ({ page }) => {
  await open(page, 'projects');
  await page.keyboard.press('Control+K');
  await expect(page.locator('#admin-search-input')).toBeFocused();
  await page.keyboard.type('dither');
  const first = page.locator('#admin-search-list .search-result').first();
  await expect(first).toHaveAttribute('data-key', 'effects.render.dither');
  await expect(first).toContainText('Picture');
  await expect(first.locator('mark').first()).toHaveText(/dither/i);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#picture$/);
  await expect.poll(() => focusedPath(page)).toBe('effects.render.dither');
  await expect(page.locator('#admin-search-list')).toBeHidden();
});

test('“Fast Travel” finds the pack’s Map action; / opens the search and Esc clears, then closes', async ({ page }) => {
  await withPackVerb(page);
  await open(page, 'colors');
  await page.keyboard.press('/');
  await expect(page.locator('#admin-search-input')).toBeFocused();
  await page.keyboard.type(FAST_TRAVEL);
  const first = page.locator('#admin-search-list .search-result').first();
  await expect(first).toHaveAttribute('data-key', 'ui.packMapVerb');
  await expect(first.locator('.sr-hint')).toContainText(FAST_TRAVEL);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#interface$/);
  await expect.poll(() => focusedPath(page)).toBe('ui.packMapVerb');

  await page.keyboard.press('Control+K');
  await page.keyboard.type('knight');
  await expect(page.locator('#admin-search-list .search-result').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#admin-search-input')).toHaveValue('');
  await expect(page.locator('#admin-search-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#admin-search-input')).not.toBeFocused();
  expect(await focusedPath(page), 'back where it was').toBe('ui.packMapVerb');
});

for (const [w, h] of [
  [1024, 768],
  [390, 844],
]) {
  test(`at ${w}×${h} a result lands in sight, below the bars and the pinned preview`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await withPackVerb(page);
    // From a page with the preview: fields on other preview pages, far down them, and one on
    // a page without it (the room below the bars changes on the way).
    const trips = [
      ['edge glow', 'effects.knight.rim'],
      ['reactions', 'effects.knight.reactions'],
      ['screen shake', 'effects.render.shake'],
      [FAST_TRAVEL.toLowerCase(), 'ui.packMapVerb'],
    ];
    for (const [query, key] of trips) {
      await open(page, 'colors');
      await page.keyboard.press('Control+K');
      await page.keyboard.type(query);
      await expect(page.locator('#admin-search-list .search-result').first()).toHaveAttribute('data-key', key);
      await page.keyboard.press('Enter');
      await expect.poll(() => focusedPath(page)).toBe(key);
      const at = await landing(page);
      expect(at.top, `“${query}”: below the bars (${at.below} px)`).toBeGreaterThanOrEqual(at.below - 0.5);
      expect(at.bottom, `“${query}”: above the window’s bottom (${at.height} px)`).toBeLessThanOrEqual(at.height + 0.5);
    }
    // Nothing found: it says so (on a phone that line hangs below the page strip).
    await page.keyboard.press('Control+K');
    await page.keyboard.type('zzqxv');
    const status = page.locator('.admin-search .settings-search-status');
    await expect(status).toContainText('No results');
    const box = await status.boundingBox();
    const seen = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('.settings-search-status'),
      [box.x + 4, box.y + box.height / 2],
    );
    expect(seen, 'not clipped').toBe(true);
  });
}

test('#effects opens Colors; Reset Flame Colors keeps your palettes, and Undo puts it back', async ({ page }) => {
  await page.goto(`${ADMIN}/#effects`);
  await expect(page.locator('.page-title')).toHaveText('Colors');
  await expect(page).toHaveURL(/#colors$/);
  const cards = page.locator('[data-path="effects.flames"] .collection > .card');
  // A palette of your own (in this draft only: the API is read-only), and something to
  // reset: a different color, typed in.
  await page.locator('[data-path="effects.flames"] .collection > .add').click();
  const names = await cards.locator('.card-title').allTextContents();
  await cards.first().locator('.card-toggle').click();
  const hex = cards.first().locator('[data-path$=".mid"] input.hex');
  await hex.fill('#123456');
  // By keyboard: Reset, and the focus is on the note's Undo, which waits while it has it.
  const reset = page.locator('[data-path="effects.flames"] > .block-head [data-reset]');
  await reset.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast').last()).toContainText(/own palettes? (is|are) kept/);
  await expect(page.locator('.toast-action')).toBeFocused();
  await expect(cards).toHaveCount(names.length);
  expect(await cards.locator('.card-title').allTextContents()).toEqual(names);
  await page.keyboard.press('Enter');
  await expect(reset, 'back on Reset').toBeFocused();
  await cards.first().locator('.card-toggle').click();
  await expect(cards.first().locator('[data-path$=".mid"] input.hex')).toHaveValue('#123456');
});

test('a deploy check that answers after a newer save is dropped: the status follows the newer save', async ({
  page,
}) => {
  // Two saves "to GitHub" (the API here is read-only: the save is answered by the test), and
  // the first one's check still out when the second save starts following its own commit.
  await page.clock.install();
  const commits = ['aaa111', 'bbb222'];
  await page.route('**/api/save', (route) => {
    const sha = commits.shift();
    return route.fulfill({ json: { contentSha: `c-${sha}`, commit: { sha, url: `https://example.test/c/${sha}` } } });
  });
  const asked = [];
  let firstAsked;
  const firstOut = new Promise((resolve) => (firstAsked = resolve));
  let answerFirst;
  const firstHeld = new Promise((resolve) => (answerFirst = resolve));
  await page.route(/\/api\/deploy\?/, async (route) => {
    const sha = new URL(route.request().url()).searchParams.get('commit');
    asked.push(sha);
    if (sha !== 'aaa111') return route.fulfill({ json: { state: 'live' } });
    firstAsked();
    await firstHeld; // (the newer push cancels this run: it answers "failed")
    return route.fulfill({ json: { state: 'failed', url: 'https://example.test/run/a' } });
  });
  await open(page, 'home');
  const field = page.locator('[data-path="hero.eyebrow"]').locator('input, textarea').first();
  const status = page.locator('[data-status]');

  await field.fill('First save');
  await page.locator('[data-save]').click();
  await expect(status).toContainText('waiting for the deploy');
  await page.clock.fastForward(4000); // (the first check)
  await firstOut;
  await field.fill('Second save');
  await page.locator('[data-save]').click();
  await expect(status.getByRole('link', { name: 'commit' })).toHaveAttribute('href', /bbb222$/);
  const late = page.waitForResponse(/commit=aaa111/);
  answerFirst();
  await late;
  await page.waitForTimeout(300); // (time for the page to read it, if it were going to)
  await expect(status, 'not the older run’s result').toContainText('waiting for the deploy');
  await expect(status.getByRole('link', { name: 'commit' })).toHaveAttribute('href', /bbb222$/);

  await page.clock.fastForward(4000); // (the newer save's first check)
  await expect(status).toContainText('Live on the site');
  await expect(page.locator('.toast', { hasText: 'Your changes are live.' })).toHaveCount(1);
  await page.clock.fastForward(60_000);
  expect(asked, 'one check each: nothing left following the older commit').toEqual(['aaa111', 'bbb222']);
});

for (const [w, h] of [
  [1280, 720],
  [390, 844],
]) {
  test.describe(`tips at ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const id of PAGES) {
      test(`${id}: hover tips stay inside the window, and no title is left`, async ({ page }) => {
        test.setTimeout(90_000);
        await open(page, id);
        expect(await page.locator('[title]').count(), 'no title attributes').toBe(0);
        const tips = await visibleTips(page);
        // A spread of them, the first and last included (they all go through one placement).
        const pick =
          tips.length <= 8 ? tips : Array.from({ length: 8 }, (_, i) => tips[Math.round((i * (tips.length - 1)) / 7)]);
        for (const [i, trigger] of pick.entries()) {
          await trigger.evaluate((el) => el.scrollIntoView({ block: 'center' }));
          // (The keyboard too, on the first two that take focus: buttons, links, selects.)
          const focusable = await trigger.evaluate((el) => el.matches('button, a[href], select, input'));
          const r = await checkTip(page, trigger, { mode: i < 2 && w > 800 && focusable ? 'focus' : 'hover' });
          expect(r.shown, `${id}: “${(await trigger.getAttribute('data-tip'))?.slice(0, 40)}” shows`).toBe(true);
          assertInViewport(r.rect, r.viewport);
          expect(r.coversTrigger, 'clear of what opened it').toBe(false);
        }
      });
    }
  });
}
