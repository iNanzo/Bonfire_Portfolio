// Smoke tests: every screen and Bonfire Live load in a real browser with no errors, the
// bonfire draws, and the main controls answer (Q/E, Esc, the pack, the breakdown and its
// render settings, the knight's model, his summon sign and his pack item, the demo track). Plus layout and
// focus checks: the pack's lists on screen at phone to desktop sizes, the title menu's box
// no wider than its items (the sign beside it takes the pointer), focus back after the
// breakdown, and no render HUD left behind on touch screens.
import { test, expect } from '@playwright/test';
import { content, screenLabel, startsWith } from './lib/content.mjs';

// The words checked for are content.json's, which the admin edits (CONTRIBUTING.md): read
// here, not pinned. The scene's description (#scene-label): the scene, then the knight's
// sentence while he's by the fire or his summon sign's while he's away.
const { sceneLabel: SCENE, sceneKnight: KNIGHT_HERE, sceneSign: SIGN } = content.hero;
/** The Portfolio page's link that opens the breakdown (its href is #how-its-made), by its name. */
const TAKE_APART = startsWith(
  content.projects.find((p) => p.id === 'portfolio').links.find((l) => l.href === '#how-its-made').label,
);

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Open the pack (a click pins it open) and the Knight item's list. */
async function knightList(page) {
  await page.click('[data-pack-toggle]');
  await page.waitForFunction(() =>
    document
      .querySelector('.pack-items')
      .getAnimations({ subtree: true })
      .every((a) => a.playState !== 'running'),
  );
  await page.click('[data-pack-slot="knight"]');
  await expect(page.locator('[data-pack-list="knight"]')).toBeVisible();
}

/**
 * Where the knight's summon sign is: the pointer moved out from where it lies on the home
 * screen at this size until the stage says it's over it (its hover: data-hover="sign").
 */
async function findSign(page) {
  const { width, height } = page.viewportSize();
  const cx = Math.round(width * 0.49),
    cy = Math.round(height * 0.574);
  for (const r of [0, 30, 60, 90, 120]) {
    for (let dx = -r; dx <= r; dx += 30) {
      for (let dy = -r; dy <= r; dy += 30) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        await page.mouse.move(cx + dx, cy + dy);
        await page.waitForTimeout(130); // (hover is checked ~12 times a second)
        if ((await page.locator('[data-stage]').getAttribute('data-hover')) === 'sign')
          return { x: cx + dx, y: cy + dy };
      }
    }
  }
  return null;
}

/** A screen's heading: the site's name on the title screen, else its section's title (or its name). */
const titleOf = (id) => (id === 'home' ? content.site.name : (content.sections[id]?.title ?? screenLabel(id)));
const SCREENS = [
  ['/', titleOf('home')],
  ['/projects/', titleOf('projects')],
  ['/experience/', titleOf('experience')],
  ['/skills/', titleOf('skills')],
  ['/about/', titleOf('about')],
  ['/contact/', titleOf('contact')],
];

for (const [path, heading] of SCREENS) {
  test(`${path} loads, draws the bonfire, no errors`, async ({ page }) => {
    const errors = watch(page);
    await page.goto(path);
    await expect(page.locator('section.screen:not([hidden]) h1')).toHaveText(heading);
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    const drawn = await page.locator('.bonfire-canvas').evaluate((c) => c.width > 1 && c.height > 1);
    expect(drawn).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('a project opens from the inventory and Esc goes back', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/projects/');
  await page.locator('.slot-item').first().click();
  await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+\/$/);
  await expect(page.locator('#detail-title')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/projects\/$/);
  expect(errors).toEqual([]);
});

test('Q and E step through the screens; the tabs stay centered', async ({ page }) => {
  await page.goto('/experience/');
  await page.keyboard.press('e');
  await expect(page).toHaveURL(/\/skills\/$/);
  await page.keyboard.press('q');
  await page.keyboard.press('q');
  await expect(page).toHaveURL(/\/projects\/$/);
  const { mid, vw } = await page.locator('.tabs').evaluate((t) => {
    const r = t.getBoundingClientRect();
    return { mid: r.left + r.width / 2, vw: innerWidth };
  });
  expect(Math.abs(mid - vw / 2)).toBeLessThan(2);
});

test('the pack opens and its Map fast travels to another place', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await page.hover('[data-pack-toggle]');
  // The items rise in stepped frames (which can look settled mid-rise): let them land first.
  await page.waitForFunction(() =>
    document
      .querySelector('.pack-items')
      .getAnimations({ subtree: true })
      .every((a) => a.playState !== 'running'),
  );
  await page.hover('[data-pack-slot="map"]');
  const shrine = page.locator('[data-pack-option="shrine"]');
  await expect(shrine).toBeVisible();
  await shrine.click();
  await expect(page.locator('[data-pack-option="shrine"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

for (const path of ['/', '/visualizer/']) {
  test(`the knight's model loads on ${path}`, async ({ page }) => {
    const errors = watch(page);
    const knight = page.waitForResponse((r) => r.url().endsWith('/models/knight.glb'));
    await page.goto(path);
    expect((await knight).ok()).toBe(true);
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    expect(errors).toEqual([]);
  });
}

test('the knight isn’t there on first load: his sign glows, and a click on it summons him', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  const label = page.locator('#scene-label');
  await expect(label).toContainText(SIGN, { timeout: 30_000 }); // (his model is in: the sign waits)
  await expect(label).not.toContainText(KNIGHT_HERE);
  // The title menu's box ends with its widest item: beside them the stage takes the pointer,
  // however wide a longer name makes the copy above (it covered the sign).
  const menuRight = await page.locator('.title-menu').evaluate((m) => m.getBoundingClientRect().right);
  const items = page.locator('.title-menu [data-title-item]');
  const itemsRight = Math.max(...(await items.evaluateAll((as) => as.map((a) => a.getBoundingClientRect().right))));
  expect(menuRight).toBeLessThanOrEqual(itemsRight + 1);
  const sign = await findSign(page);
  expect(sign, 'the sign is on the ground, and hovering it says so').not.toBeNull();
  expect(await page.locator('[data-stage]').evaluate((s) => getComputedStyle(s).cursor)).toBe('pointer');
  await page.mouse.click(sign.x, sign.y);
  // He forms out of it in the fire's element (~3 s), then rests.
  await expect(label).toContainText(KNIGHT_HERE, { timeout: 15_000 });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('the pack’s knight item summons him, swaps his helmet and style (remembered), asks for a gesture and sends him off', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watch(page);
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await knightList(page);
  // Away: only the summons.
  const summon = page.locator('[data-pack-list="knight"] [data-pack-option="summon"]');
  await expect(summon).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('[data-pack-list="knight"] [data-pack-option]')).toHaveCount(1);
  await summon.click();
  // Resting: send him off, his helmets, styles, finishes and gestures (the Default Dance too).
  const dismiss = page.locator('[data-pack-list="knight"] [data-pack-option="dismiss"]');
  await expect(dismiss).toBeEnabled({ timeout: 15_000 });
  const helmets = page.locator('[data-pack-list="knight"] [data-pack-option^="helm:"]');
  await expect(helmets).toHaveCount(3);
  await expect(page.locator('[data-pack-list="knight"] [data-pack-option^="gesture:"]')).toHaveCount(9);
  await expect(page.locator('[data-pack-option="gesture:dance"]')).toHaveText(/Default Dance/);
  await expect(page.locator('[data-pack-list="knight"] [data-pack-option^="style:"]')).toHaveCount(6);
  await expect(page.locator('[data-pack-list="knight"] [data-pack-option^="finish:"]')).toHaveCount(4);
  // Pick one he isn't wearing: it becomes the current one, and this browser keeps it.
  const next = page.locator('[data-pack-list="knight"] [data-pack-option^="helm:"][aria-pressed="false"]').first();
  const id = await next.getAttribute('data-pack-option');
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.locator(`[data-pack-option="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('knightHelmet'))).toBe(id.slice(5));
  await page.locator('[data-pack-option="gesture:praise"]').click();
  await page.waitForTimeout(1800); // (the swap and the gesture play out)
  // A style he isn't in: he burns away and forms again in it; this browser keeps it.
  const style = page.locator('[data-pack-list="knight"] [data-pack-option^="style:"][aria-pressed="false"]').first();
  const styleId = await style.getAttribute('data-pack-option');
  await style.click();
  await expect(page.locator(`[data-pack-option="${styleId}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('knightStyle'))).toBe(styleId.slice(6));
  await page.waitForTimeout(1800);
  // Sent off: he burns away into his sign, and the pack offers the summons again.
  await dismiss.click();
  await expect(summon).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('#scene-label')).toContainText(SIGN);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('the pack keeps the keyboard: Summon and Send Him Off picked with Enter leave focus in it, and Esc closes it, not the page', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watch(page);
  await page.goto('/projects/portfolio/'); // (a project page: an Esc that got past the pack would go back to the inventory)
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  const inPack = () => page.evaluate(() => !!document.activeElement?.closest('[data-pack]'));
  /** Into the Knight item's list from its slot, as the keys do (the first option that can be picked gets focus). */
  const intoKnight = async () => {
    await page.locator('[data-pack-slot="knight"]').focus();
    await page.keyboard.press('ArrowLeft');
  };
  await expect(page.locator('#scene-label')).toContainText(SIGN, { timeout: 30_000 }); // (his model is in)
  await page.keyboard.press('i');
  await intoKnight();
  const summon = page.locator('[data-pack-option="summon"]');
  await expect(summon).toBeEnabled({ timeout: 15_000 });
  if (!(await summon.evaluate((b) => b === document.activeElement))) await intoKnight(); // (drawn before it could be picked)
  await expect(summon).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300); // (the redraw after the pick)
  expect(await inPack(), 'focus stays in the pack once Summon is gone').toBe(true);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/projects\/portfolio\/$/);
  // Once he rests, the same for Send Him Off.
  if (await page.locator('.pack-items').isHidden()) await page.keyboard.press('i');
  await intoKnight();
  const dismiss = page.locator('[data-pack-option="dismiss"]');
  await expect(dismiss).toBeEnabled({ timeout: 15_000 });
  await intoKnight(); // (into the list again, now it can be picked)
  await expect(dismiss).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(await inPack(), 'focus stays in the pack once Send Him Off is gone').toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/projects\/portfolio\/$/);
  await expect(page.locator('.pack-items')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Bonfire Live starts the demo track', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/visualizer/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('[data-home-link]')).toBeVisible();
  await page.click('[data-source="demo"]');
  await expect(page.locator('[data-hud]')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('the Portfolio’s page takes this one apart: the breakdown, its render settings and the pack', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/projects/portfolio/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await page.getByRole('link', { name: TAKE_APART }).click();
  await expect(page.locator('html')).toHaveClass(/is-breakdown/);
  // The pack stays, and its key works with focus on the panel's views.
  await expect(page.locator('[data-pack-toggle]')).toBeVisible();
  await page.keyboard.press('i');
  await expect(page.locator('.pack-items')).toBeVisible();
  await page.keyboard.press('Escape'); // (the pack closes; the breakdown stays)
  await expect(page.locator('html')).toHaveClass(/is-breakdown/);
  // P folds the render settings open inside the panel; a click on a row steps it.
  await page.locator('.breakdown input:checked').focus();
  await page.keyboard.press('p');
  const outlines = page.locator('.breakdown [data-render-row="outlines"]');
  await expect(outlines).toBeVisible();
  const was = await outlines.locator('b').textContent();
  await outlines.click();
  await expect(outlines.locator('b')).not.toHaveText(was);
  // B leaves it, and focus goes back to the link that opened it.
  await page.keyboard.press('b');
  await expect(page.locator('html')).not.toHaveClass(/is-breakdown/);
  await expect(page.getByRole('link', { name: TAKE_APART })).toBeFocused();
  expect(errors).toEqual([]);
});

test('the breakdown counts the scene’s particle systems only: the stats overlay’s other counts aren’t among them', async ({
  page,
}) => {
  const errors = watch(page);
  // (?perf shows the stats overlay on the site too, from the same scene.)
  await page.goto('/projects/portfolio/?perf');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  // The overlay's rows counted in something other than particles: a count of a whole (live of
  // how many, "x / y") with a unit by it (the fireflies lit), by name.
  const others = () =>
    page.locator('.stats-overlay').evaluate((el) =>
      [...el.firstElementChild.children].flatMap((block) => {
        const cells = [...(block.children[1]?.children ?? [])];
        const names = [];
        for (let i = 0; i < cells.length; i += 2) {
          const value = cells[i + 1].textContent;
          if (value.includes(' / ') && /[a-z]/i.test(value)) names.push(cells[i].textContent);
        }
        return names;
      }),
    );
  await expect.poll(others, { timeout: 15_000 }).not.toEqual([]);
  const names = await others();
  await page.getByRole('link', { name: TAKE_APART }).click();
  await expect(page.locator('html')).toHaveClass(/is-breakdown/);
  const rows = page.locator('[data-bd-stats] dt');
  await expect(rows.first()).toBeVisible();
  const listed = await rows.allTextContents();
  for (const name of names) expect(listed, name).not.toContain(name);
  expect(errors).toEqual([]);
});

// Every list the pack has, opened one by one: all of it in the window and below the header
// (which is over the pack outside the breakdown), phones to desktops, the breakdown open
// (the pack steps aside, over its sheet on phones) and closed.
const SIZES = [
  [390, 844],
  [768, 1024],
  [844, 390],
  [1024, 768],
  [1280, 800],
  [1920, 1080],
];
test('the pack’s lists stay on screen at every size, with the breakdown open and closed', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watch(page);
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  // (The Knight item is there once his model is in: it's its own file, after the scene.)
  await expect(page.locator('#scene-label')).toContainText(SIGN, { timeout: 30_000 });
  // (The items rising and the list sliding in have landed; the icons' own loops don't end.)
  const settled = () =>
    page.waitForFunction(() =>
      document
        .querySelector('[data-pack]')
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .every((a) => a.playState !== 'running'),
    );
  const off = [];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const inBreakdown of [false, true]) {
      if (inBreakdown) {
        await page.keyboard.press('b');
        await expect(page.locator('html')).toHaveClass(/is-breakdown/);
      }
      await page.locator('[data-pack-toggle]').click();
      await expect(page.locator('.pack-items')).toBeVisible();
      await page.waitForTimeout(260); // (the pack glides to its corner)
      await settled();
      const ids = await page
        .locator('.pack-item:not([hidden])')
        .evaluateAll((els) => els.map((e) => e.dataset.packItem));
      expect(ids).toEqual(['map', 'anvil', 'tome', 'knight']);
      for (const id of ids) {
        await page.locator(`[data-pack-slot="${id}"]`).click();
        const list = page.locator(`[data-pack-list="${id}"]`);
        await expect(list).toBeVisible();
        await settled();
        const box = await list.evaluate((l) => {
          const r = l.getBoundingClientRect();
          const header = document.querySelector('[data-header]').getBoundingClientRect().bottom;
          return {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            vw: document.documentElement.clientWidth,
            vh: document.documentElement.clientHeight,
            header,
          };
        });
        const inside = box.left >= 0 && box.right <= box.vw && box.top >= box.header && box.bottom <= box.vh;
        if (!inside) off.push({ size: `${width}x${height}`, inBreakdown, id, box });
      }
      await page.locator('[data-pack-toggle]').click(); // (closes it)
      await expect(page.locator('.pack-items')).toBeHidden();
      if (inBreakdown) {
        await page.keyboard.press('b');
        await expect(page.locator('html')).not.toHaveClass(/is-breakdown/);
      }
    }
  }
  expect(off).toEqual([]);
  expect(errors).toEqual([]);
});

test('no knight (his model doesn’t load): no Knight item in the pack, nor a word of him in the scene’s description', async ({
  page,
}) => {
  const errors = watch(page);
  await page.route('**/models/knight.glb', (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('#scene-label'), 'the scene alone').toHaveText(SCENE);
  await page.locator('[data-pack-toggle]').click();
  await expect(page.locator('[data-pack-slot="map"]')).toBeVisible();
  await expect(page.locator('[data-pack-item="knight"]')).toBeHidden();
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]); // (the blocked model)
});

test('touch screens: closing the breakdown folds its render settings away (no stray HUD)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = watch(page);
  await page.goto('/projects/portfolio/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect(page.locator('html')).toHaveClass(/\btouch\b/);
  await page.getByRole('link', { name: TAKE_APART }).tap();
  await expect(page.locator('html')).toHaveClass(/is-breakdown/);
  await page.locator('.breakdown [data-render-head]').tap();
  await expect(page.locator('.breakdown [data-render-row="outlines"]')).toBeVisible();
  await page.locator('.breakdown [data-bd-close]').tap();
  await expect(page.locator('html')).not.toHaveClass(/is-breakdown/);
  await expect(page.locator('.debug-hud')).toBeHidden();
  expect(errors).toEqual([]);
  await context.close();
});

test('a link to #how-its-made opens the breakdown on arrival; Bonfire Live’s page points at the Portfolio', async ({
  page,
}) => {
  const errors = watch(page);
  await page.goto('/#how-its-made');
  await expect(page.locator('html')).toHaveClass(/is-breakdown/, { timeout: 30_000 });
  await page.goto('/projects/bonfire-live/');
  await expect(page.getByRole('link', { name: TAKE_APART })).toHaveCount(0);
  await expect(page.locator('.detail-link[href$="/projects/portfolio/"]')).toBeVisible();
  expect(errors).toEqual([]);
});
