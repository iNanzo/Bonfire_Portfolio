// The campfire game (/larp/) in a real browser, on the production build: one screen, the bonfire
// with the scoreboard, the round's timer and the banners over it, and the host's controls as an
// overlay. A night's run: Setup (a team renamed, a round given a scene), the timer started and
// paused, a Special modifier through the team picker (its banner: title, subtitle and "+50 ·
// Owls"), a multiplier and the points after it doubled, undo, the next round, and a reload that
// keeps it all. The output window: the picture streamed, the scoreboard, clock and banner
// copied across, the controls never. The first version's save carried over, and the portfolio's
// first load carrying no game code.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page, errors = []) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** A fresh game: storage cleared; Setup opens by itself on a new game. */
async function fresh(page) {
  const errors = watch(page);
  await page.goto('/larp/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-setup]')).toBeVisible();
  return errors;
}

const board = (page) => page.locator('.larp-show [data-board]');
const rowOf = (page, name) => board(page).locator('.larp-row', { hasText: name });
/** The second of the new game's two teams (the first is renamed Owls). */
const OTHER = 'Blue Team';

test('a game night: setup, the timer, a Special banner, a multiplier, undo, rounds and a reload', async ({ page }) => {
  const errors = await fresh(page);
  const setup = page.locator('[data-setup]');
  // Setup: the first team renamed; round 2 given the first scene there is.
  await setup.locator('input[data-set$=".name"]').first().fill('Owls');
  await setup.getByRole('tab', { name: 'Rounds' }).click();
  const scene = setup.locator('select[data-set$=".scene"]').nth(1);
  const firstScene = await scene.locator('option').nth(1).getAttribute('value');
  expect(firstScene).toMatch(/^[bm]:/);
  await scene.selectOption(firstScene ?? '');
  await setup.getByRole('button', { name: 'Done' }).click();
  await expect(setup).toBeHidden();
  await expect(rowOf(page, 'Owls').locator('.larp-row-score')).toHaveText('0');

  // The timer: Space starts it, it counts down, Space pauses it.
  const time = page.locator('[data-clock-time]');
  const before = (await time.textContent()) ?? '';
  await page.keyboard.press('Space');
  await expect(page.locator('[data-timer-label]')).toHaveText('Pause');
  await expect(time).not.toHaveText(before, { timeout: 3000 });
  await page.keyboard.press('Space');
  await expect(page.locator('[data-timer-label]')).toHaveText('Resume');

  // A Special modifier: the picker asks which team, the banner says it all.
  const special = page.locator('.larp-mod.is-special').first();
  const title = (await special.locator('.larp-mod-title').textContent()) ?? '';
  await special.click();
  await expect(page.locator('[data-picker]')).toBeVisible();
  await page.locator('[data-picker] .larp-pick', { hasText: 'Owls' }).click();
  const banner = page.locator('[data-banner]');
  await expect(banner).toBeVisible();
  await expect(banner.locator('[data-banner-title]')).toHaveText(title);
  await expect(banner.locator('[data-banner-sub]')).not.toBeEmpty();
  await expect(banner.locator('[data-banner-points]')).toHaveText(/^\+\d+ · Owls$/);
  const points = Number((await banner.locator('[data-banner-points]').textContent())?.match(/\d+/)?.[0]);
  await expect(rowOf(page, 'Owls').locator('.larp-row-score')).toHaveText(String(points));
  await expect(rowOf(page, 'Owls').locator('.larp-row-place')).toHaveText('1');

  // A multiplier for the other team, then points by keys: they land doubled, a chip shows it.
  await page.keyboard.press('3'); // Twice the Flame
  await page.keyboard.press('2');
  await expect(page.locator('[data-mults] .larp-mult')).toHaveText(`×2 ${OTHER}`);
  await page.keyboard.press('1'); // Well Played
  await page.keyboard.press('2');
  await expect(rowOf(page, OTHER).locator('.larp-row-score')).toHaveText('20');
  // The banners wait their turn: the last one's points come up in the end.
  await expect(banner.locator('[data-banner-points]')).toHaveText(`+20 · ${OTHER}`, { timeout: 15_000 });

  // Undo takes the last points back.
  await page.keyboard.press('z');
  await expect(rowOf(page, OTHER).locator('.larp-row-score')).toHaveText('0');

  // The next round: its name on the clock, its timer fresh, the multiplier gone.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-clock-round]')).toHaveText(/^Round 2 · 2 of 3$/);
  await expect(page.locator('[data-timer-label]')).toHaveText('Start');
  await expect(page.locator('[data-mults] .larp-mult')).toHaveCount(0);

  // A reload keeps the game.
  await page.reload();
  await expect(page.locator('[data-setup]')).toBeHidden();
  await expect(rowOf(page, 'Owls').locator('.larp-row-score')).toHaveText(String(points));
  await expect(page.locator('[data-clock-round]')).toHaveText(/^Round 2/);
  expect(errors).toEqual([]);
});

test('the output window shows the fire, the scores, the clock and the banners, never the controls', async ({
  page,
  context,
}) => {
  const errors = await fresh(page);
  await page.locator('[data-setup]').getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  const [out] = await Promise.all([context.waitForEvent('page'), page.locator('[data-act="output"]').click()]);
  await expect(page.locator('[data-output-label]')).toHaveText('Output (Open)');
  await expect(out.locator('video')).toHaveCount(1);
  expect(await out.locator('video').evaluate((v) => !!v.srcObject)).toBe(true);
  await expect(out.locator('[data-mirror="board"] .larp-row')).toHaveCount(2);
  await expect(out.locator('[data-mirror="clock"] [data-clock-time]')).toHaveText(/^\d+:\d\d$/);
  await expect(out.locator('.larp-hud, [data-picker], [data-setup]')).toHaveCount(0);
  // A banner given on the laptop comes up there too.
  await page.bringToFront();
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await expect(out.locator('[data-mirror="banner"]')).toBeVisible();
  await expect(out.locator('[data-mirror="banner"] [data-banner-points]')).toHaveText(/^\+10 · /);
  // The timer ticks there.
  await page.keyboard.press('Space');
  const t0 = (await out.locator('[data-clock-time]').textContent()) ?? '';
  await expect(out.locator('[data-clock-time]')).not.toHaveText(t0, { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('another tab follows team edits and the game title without reloading', async ({ page, context }) => {
  const errors = await fresh(page);
  const setup = page.locator('[data-setup]');
  await setup.locator('input[data-set$=".name"]').first().fill('Owls');
  const other = await context.newPage();
  try {
    await other.goto('/larp/');
    await other.locator('[data-act="setup"]').click();
    const otherSetup = other.locator('[data-setup]');
    await expect(otherSetup.locator('input[data-set$=".name"]').first()).toHaveValue('Owls');
    await setup.locator('input[data-set$=".name"]').first().fill('Foxes');
    await expect(rowOf(other, 'Foxes')).toBeVisible();
    await expect(otherSetup.locator('input[data-set$=".name"]').first()).toHaveValue('Foxes');
    await setup.getByRole('tab', { name: 'Game', exact: true }).click();
    await setup.locator('[data-set="game.title"]').fill('Shared Game Night');
    await expect(other).toHaveTitle('Shared Game Night');
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});

test('the first version’s save is carried over: its teams, rounds and points', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/larp/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'larp.event',
      JSON.stringify({
        schemaVersion: 1,
        config: { title: 'Lửa Trại' },
        teams: [
          { id: 'tA', name: 'Đội Phêrô', translation: 'Team Peter', color: '#e8b04a' },
          { id: 'tB', name: 'Đội Phaolô', translation: 'Team Paul', color: '#5fa8d3' },
        ],
        rounds: [{ id: 'r1', category: 'dance', prepMs: 120000, skipped: false }],
        results: [{ teamRoundScores: { tA: 100, tB: 40 } }],
        corrections: [],
      }),
    );
  });
  await page.reload();
  await expect(rowOf(page, 'Team Peter').locator('.larp-row-score')).toHaveText('100');
  await expect(rowOf(page, 'Team Paul').locator('.larp-row-score')).toHaveText('40');
  await expect(page.locator('[data-clock-round]')).toHaveText(/^Dance · 1 of 1$/);
  await expect(page.locator('[data-clock-time]')).toHaveText('2:00');
  expect(errors).toEqual([]);
});

test('a saved game it cannot read is kept aside, never written over', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/larp/');
  await page.evaluate(() => (localStorage.clear(), localStorage.setItem('larp.game', '{"v":1,"truncat')));
  await page.reload();
  await expect(page.locator('[data-note]')).toHaveText(
    'The saved game couldn’t be read. A new game started; the original is preserved.',
  );
  expect(await page.evaluate(() => localStorage.getItem('larp.game.unreadable'))).toBe('{"v":1,"truncat');
  expect(errors).toEqual([]);
});

test("the portfolio's first load carries no game code (U08)", async ({ page }) => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  expect(html).not.toMatch(/larp/i);
  // By content, not by file name: a shared chunk would pass a name check. Every script the page
  // loads up front, and every chunk those import, carries no game marker: the store keys or the
  // game's export name.
  const dist = new URL('../dist/', import.meta.url);
  const first = [...html.matchAll(/(?:src|href)="\/?((?:[^"/]+\/)*[^"/]+\.js)"/g)].map((m) => m[1]);
  expect(first.length).toBeGreaterThan(0);
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(new URL(file, dist), 'utf8');
    expect(code, file).not.toMatch(/larp\.(game|event)|campfire-game/);
    for (const m of code.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) walk(`assets/${m[1]}`);
  };
  for (const file of first) walk(file.replace(/^.*?(assets\/)/, '$1'));
  const requested = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  expect(requested.filter((p) => /larp/i.test(p))).toEqual([]);
});
