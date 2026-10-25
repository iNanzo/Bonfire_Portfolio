// The campfire game (/larp/) in a real browser, on the production build: the host console and the
// display window (opened from the console, so the same browser context and its BroadcastChannel)
// play a whole four-team, five-round event with the network switched off after loading (U11):
// teams, roster and a co-GM set up through the console; statuses; team and individual awards,
// −25 typed and toggled (U05), +25 each to three people (A10); a co-GM's award through Judge Mode;
// a duplicate kept with a reason (A06); Review, Publish (confirmed), the reveal paused, stepped,
// skipped and replayed (A14); the display's banners with signed points and the word Points (U03),
// shared places (A19) and never a private note, an author or a draft on the channel (A07). The host
// is reloaded mid-round and resumes (A16); the display is closed and reopened mid-reveal and picks up
// at the same banner (A17); a backup goes into a fresh browser with the same standings (A18). Plus
// the lock a second host tab sees (A25), and the portfolio's first load carrying no game code (U08).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Collect the page's errors (uncaught ones and console errors) for the test to check. */
function watch(page, errors = []) {
  page.on('pageerror', (e) => errors.push(e.message));
  // A request the network refused (offline, U11); one cancelled by a reload is not a failure.
  // The host's own reachability check (a HEAD to ?online while the display is closed) is expected to
  // fail offline: that is how it knows to warn.
  const probe = (url) => url.endsWith('?online');
  page.on('requestfailed', (r) => {
    if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? '') && !probe(r.url()))
      errors.push(`${r.failure()?.errorText}: ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !(probe(m.location().url ?? '') || /^Failed to load resource/.test(m.text())))
      errors.push(m.text());
  });
  return errors;
}

/** Every message the page hears on the game's channel, as JSON text (A07: what the display is sent). */
async function recordChannel(page) {
  await page.addInitScript(() => {
    window.__heard = [];
    const listen = new BroadcastChannel('larp.channel');
    listen.onmessage = (e) => window.__heard.push(JSON.stringify(e.data));
  });
}

const MINUS = '−';
const TEAMS = [
  ['Đội Phaolô', 'Team Paul', ['Mai', 'Bảo']],
  ['Đội Giuse', 'Team Joseph', ['Lan', 'Bình']],
  ['Đội Maria', 'Team Mary', ['Chi', 'Dũng']],
  ['Đội Phêrô', 'Team Peter', ['Hòa', 'Phúc']],
];
const SECRET = 'secret-note-xyz';

/** A fresh host console: storage cleared, a new event in Setup. */
async function freshHost(context) {
  const page = await context.newPage();
  const errors = watch(page);
  await page.goto('/larp/');
  await page.evaluate(() => (localStorage.clear(), sessionStorage.clear()));
  await page.reload();
  await expect(page.locator('.larp-topbar')).toBeVisible();
  return { page, errors };
}

const nextButton = (host) => host.locator('[data-action="next"]');

/** Pick the option of `select` whose text contains `text` (labels may carry a translation). */
async function choose(select, text) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value);
}

/** Press the one next action once it reads `label`, and wait for the step (unless it asks first). */
async function next(host, label, { asks = false } = {}) {
  await expect(nextButton(host)).toHaveText(label);
  await nextButton(host).click();
  if (!asks) await expect(nextButton(host)).not.toHaveText(label);
}

/** Teams, members and a co-GM, through Teams & Roster. */
async function setUp(host) {
  await host.getByRole('tab', { name: 'Teams & Roster' }).click();
  const add = host.getByRole('region', { name: 'Add Team' });
  for (const [name, translation] of TEAMS) {
    await add.getByRole('textbox', { name: 'Name' }).fill(name);
    await add.getByRole('textbox', { name: 'Translation' }).fill(translation);
    await add.getByRole('button', { name: 'Add Team' }).click();
    await expect(host.getByRole('button', { name: `Remove Team · ${name}` })).toBeVisible();
  }
  const roster = host.getByRole('region', { name: 'Roster' });
  for (const [team, , members] of TEAMS) {
    await roster.getByRole('textbox', { name: 'Names, One Per Line' }).fill(members.join('\n'));
    await choose(roster.getByRole('combobox', { name: 'Team' }), team);
    await roster.getByRole('button', { name: 'Add Members' }).click();
    await expect(host.getByRole('textbox', { name: `Name · ${members[1]}` })).toBeVisible();
  }
  await host.locator('#add-gm-name').fill('Anh B.');
  await host.getByRole('button', { name: 'Add Co-GM' }).click();
  await expect(host.getByRole('textbox', { name: 'Name · Anh B.' })).toBeVisible();
  await expect(host.locator('.larp-topbar')).toContainText('Saved');
}

const awardForm = (host) => host.getByRole('region', { name: 'Add Award' });

/** Tick exactly `names` in Add Award's recipients (the performing team comes ticked). */
async function recipients(host, names) {
  const group = awardForm(host).getByRole('group', { name: 'To' });
  const ticked = group.getByRole('checkbox', { checked: true });
  while ((await ticked.count()) > 0) await ticked.first().click();
  for (const name of names) {
    await group.getByRole('checkbox', { name }).click();
    await expect(group.getByRole('checkbox', { name })).toBeChecked();
  }
}

/**
 * Add an award on the Run tab. `points` is typed as given ('-25', '−25', '+75', '25' with
 * `minus: true` pressing the − toggle first); `button` is the Add button's label to expect.
 */
async function addAward(
  host,
  { type = 'Team', to, name, translation = '', points, minus = false, note = '', from, button, reason, enter = false },
) {
  await host.getByRole('tab', { name: 'Run' }).click();
  const form = awardForm(host);
  await form.getByRole('group', { name: 'Recipient Type' }).getByRole('button', { name: type }).click();
  await expect(form.getByRole('button', { name: type, pressed: true })).toBeVisible();
  await recipients(host, to);
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await form.getByRole('textbox', { name: 'Translation' }).fill(translation);
  if (minus) {
    await form.getByRole('button', { name: 'Minus' }).click();
    await host.keyboard.type(points); // The toggle hands focus back to the amount, the caret after the sign.
  } else await form.getByRole('textbox', { name: 'Points' }).fill(points);
  if (note) await form.getByRole('textbox', { name: 'Private Note' }).fill(note);
  if (from) await choose(form.getByRole('combobox', { name: 'From' }), from);
  if (reason) {
    await expect(form.locator('.larp-run-duplicate')).toBeVisible();
    await form.getByRole('textbox', { name: 'Reason To Keep' }).fill(reason);
  }
  const add = form.locator('[data-action="run.add"]');
  await expect(add).toHaveText(button);
  const entries = host.getByRole('region', { name: 'This Round' }).locator('li');
  const before = await entries.count();
  if (enter) {
    // The keyboard path: Enter in a field adds it, and focus goes back to Name for the next one.
    await form.getByRole('textbox', { name: 'Points' }).press('Enter');
    await expect(form.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  } else await add.dblclick(); // A05: a double-click adds it once.
  await expect(entries).toHaveCount(before + to.length);
  await expect(form.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('');
}

/** Set every team's status on the Run tab's queue (the round's team order). */
async function statuses(host, map) {
  await host.getByRole('tab', { name: 'Run' }).click();
  for (const [team, status] of Object.entries(map)) {
    const select = host.getByRole('combobox', { name: `Status · ${team}` });
    await select.selectOption({ label: status });
    await expect(select.locator('option:checked')).toHaveText(status);
  }
}

/** Every team performs in turn, ending on Review Round. */
async function performAll(host) {
  for (let guard = 0; guard < 10; guard++) {
    const label = (await nextButton(host).textContent()).trim();
    if (label === 'Review Round') return next(host, 'Review Round');
    expect(label).toMatch(/^Next Team: /);
    await next(host, label);
  }
  throw new Error('the queue never ended');
}

/** Publish And Reveal Round n, through its confirmation. */
async function publish(host, n) {
  await next(host, `Publish And Reveal Round ${n}`, { asks: true });
  const dialog = host.getByRole('alertdialog');
  await expect(dialog).toContainText("Publish this round? Afterwards the result can't be edited, only corrected.");
  await dialog.getByRole('button', { name: 'Publish And Reveal' }).click();
  await expect(host.locator('.larp-phase')).toHaveText(new RegExp(`^Round ${n} · .* · Reveal$`));
}

/** Every face the page asked for has loaded (the game warms them all at start, for offline use). */
async function fontsLoaded(page) {
  await page.evaluate(() => document.fonts.ready.then(() => document.fonts.status));
}

/** The display's bonfire and its knights are in (or it fell back to its still): nothing more to load. */
async function sceneLoaded(display) {
  await fontsLoaded(display);
  await expect(display.locator('.larp-display[data-stage="knights"], .larp-display[data-webgl="off"]')).toHaveCount(1, {
    timeout: 60_000,
  });
}

const displayRoot = (display) => display.locator('.larp-display-zones');
/** What the display shows, as its zones' keys (a zone's key changes when its content is new). */
const zoneKeys = (display) =>
  display.locator('[data-zone]').evaluateAll((els) => els.map((el) => el.getAttribute('data-key')).join('|'));

/** The standings' rows on the display: [place, name, total] for each. */
async function displayStandings(display) {
  await expect(displayRoot(display)).toHaveAttribute('data-scene', /results|finished/);
  return rowsOf(display.locator('.larp-drow:not(.larp-dleaders .larp-drow)'));
}

/** Rows as text: each cell's words, joined by spaces. */
function rowsOf(locator) {
  return locator.evaluateAll((rows) =>
    rows.map((r) =>
      [...r.children]
        .map((c) => c.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' '),
    ),
  );
}

/** A round with no awards: everyone performs, every status Complete, publish, skip the reveal. */
async function plainRound(host, display, n, title) {
  await next(host, n === 1 ? 'Start Round 1' : 'Start Next Round');
  await expect(host.locator('.larp-phase')).toHaveText(`Round ${n} · ${title} · Briefing`);
  await next(host, 'Start Preparation');
  await next(host, 'Start Performances');
  await performAll(host);
  await statuses(host, Object.fromEntries(TEAMS.map(([team]) => [team, 'Complete'])));
  await publish(host, n);
  await host.getByRole('button', { name: 'Skip To Results' }).click();
  await expect(host.locator('.larp-phase')).toHaveText(`Round ${n} · ${title} · Results`);
  await expect(displayRoot(display)).toHaveAttribute('data-scene', 'results');
}

/** The host's Run tab timer, in seconds. */
async function timerSeconds(host) {
  const text = await host.locator('main [data-clock="countdown"]').first().textContent();
  const [m, s] = text.trim().split(':').map(Number);
  return m * 60 + s;
}

test('a whole event, offline, with the display, Judge Mode, reloads and a backup (U11, A16, A17, A18)', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  await recordChannel(context);
  const { page: host, errors } = await freshHost(context);
  await setUp(host);

  // The display window, from the console's own button, and the projector checklist's test pattern.
  let [display] = await Promise.all([
    context.waitForEvent('page'),
    host.getByRole('button', { name: 'Open Display Window' }).click(),
  ]);
  const displayErrors = watch(display);
  await expect(host.locator('.larp-display-state')).toHaveText('Display Open');
  await expect(displayRoot(display)).toHaveAttribute('data-scene', 'welcome');
  for (const [team] of TEAMS) await expect(displayRoot(display)).toContainText(team);
  const checklist = host.getByRole('region', { name: 'Projector Checklist' });
  await expect(checklist).toContainText('Set your display to Extend, not Mirror');
  await checklist.getByRole('button', { name: 'Show Test Pattern' }).click();
  await expect(displayRoot(display)).toHaveAttribute('data-scene', 'test');
  await expect(displayRoot(display)).toContainText('Test Pattern');
  await checklist.getByRole('button', { name: 'Hide Test Pattern' }).click();
  await expect(displayRoot(display)).toHaveAttribute('data-scene', 'welcome');
  await checklist.getByRole('button', { name: 'Close' }).click();
  await expect(checklist).toHaveCount(0);

  // From here on nothing may touch the network (U11): the page and the display (its bonfire too) are loaded.
  await sceneLoaded(display);
  await fontsLoaded(host);
  await context.setOffline(true);
  await next(host, 'Start Event');

  // ── Round 1: every kind of award ─────────────────────────────────────────────────────────
  await next(host, 'Start Round 1');
  await expect(displayRoot(display)).toContainText('Khám Phá Đức Tin');
  await next(host, 'Start Preparation');
  await next(host, 'Start Performances');
  await next(host, 'Next Team: Đội Phaolô');
  await expect(displayRoot(display)).toHaveAttribute('data-scene', 'performances');
  await expect(display.locator('.larp-dturn')).toContainText('Đội Phaolô');
  await addAward(host, {
    to: ['Đội Phaolô'],
    name: 'Cùng Nhau Tỏa Sáng',
    translation: 'Shine Together',
    points: '+75',
    note: SECRET,
    button: 'Add +75',
  });
  await addAward(host, {
    type: 'Individual',
    to: ['Mai', 'Lan', 'Chi'],
    name: 'Lắng Nghe',
    translation: 'Good Listener',
    points: '25',
    button: 'Add +25 Each · 3 People',
  });
  await performAll(host);
  // Judging is closed in Review; reopen it so the co-GM can step up.
  await host.getByRole('tab', { name: 'Review' }).click();
  await host.getByRole('button', { name: 'Reopen Judging' }).click();
  await expect(host.locator('.larp-phase')).toHaveText('Round 1 · Faith Discovery · Performances');
  await addAward(host, {
    to: ['Đội Giuse'],
    name: 'Quá Giờ',
    translation: 'Over Time',
    points: '-25',
    button: `Add ${MINUS}25`,
    enter: true,
  });
  await addAward(host, {
    to: ['Đội Phêrô'],
    name: 'Đồng Lòng',
    translation: 'United',
    points: '75',
    button: 'Add +75',
  });
  await addAward(host, {
    type: 'Individual',
    to: ['Phúc'],
    name: 'Quên Lời',
    translation: 'Forgot the Words',
    points: '25',
    minus: true,
    button: `Add ${MINUS}25`,
  });

  // A co-GM gives an award through Judge Mode (J), then the host gives the same one: a duplicate.
  await host.locator('body').press('j');
  await host.getByRole('button', { name: 'Anh B.' }).click();
  const judge = host.locator('.larp-judge-shell');
  await expect(judge).toContainText('Anh B.');
  await expect(judge.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await choose(judge.getByRole('combobox', { name: 'To' }), 'Đội Maria');
  await judge.getByRole('textbox', { name: 'Name', exact: true }).fill('Sáng Tạo');
  await judge.getByRole('textbox', { name: 'Translation' }).fill('Creativity');
  await judge.getByRole('textbox', { name: 'Points' }).fill('50');
  await judge.getByRole('textbox', { name: 'Points' }).press('Enter'); // Enter adds it, as in the console
  // Listed under My Awards This Round, with Edit (a co-GM's own entry while judging is open).
  const mine = judge.getByRole('listitem').filter({ hasText: 'Sáng Tạo · Creativity' });
  await expect(mine.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(judge.locator('.larp-topbar, [data-action="next"]')).toHaveCount(0);
  await judge.getByRole('button', { name: 'Done' }).click();
  await expect(host.locator('.larp-topbar')).toBeVisible();
  await addAward(host, {
    to: ['Đội Maria'],
    name: 'Sáng Tạo',
    translation: 'Creativity',
    points: '50',
    button: 'Add +50',
    reason: 'Both HTs saw it',
  });
  const thisRound = host.getByRole('region', { name: 'This Round' });
  await expect(thisRound).toContainText('Anh B.');
  await expect(thisRound).toContainText('Kept Duplicate');

  await next(host, 'Review Round');
  await host.getByRole('tab', { name: 'Review' }).click();
  const publishBlocked = host.locator('.larp-next-why');
  await expect(publishBlocked).toHaveText('4 teams need a status.');
  await statuses(host, Object.fromEntries(TEAMS.map(([team]) => [team, 'Complete'])));
  await host.getByRole('tab', { name: 'Review' }).click();
  await expect(host.getByRole('tabpanel', { name: 'Review' })).toContainText('Both HTs saw it');
  await publish(host, 1);

  // The reveal: paused, stepped banner by banner, the display reloaded mid-way (A17), skipped, replayed.
  await host.getByRole('button', { name: 'Pause Reveal' }).click();
  await expect(host.getByRole('button', { name: 'Resume Reveal' })).toBeVisible();
  const seen = [];
  for (let step = 0; step < 30; step++) {
    const scene = await displayRoot(display).getAttribute('data-scene');
    if (scene !== 'reveal') break;
    const banner = display.locator('.larp-dbanner');
    if (await banner.count()) seen.push((await banner.textContent()).replace(/\s+/g, ' ').trim());
    if (seen.length === 3) {
      // A17: the display closes and comes back at the same banner.
      const before = seen.at(-1);
      await display.close();
      await expect(host.locator('.larp-display-state')).toContainText('Display Closed');
      // Offline, the console says reopening can't work yet (no service worker).
      await expect(host.locator('.larp-topbar')).toContainText('Reopening the display needs the network.');
      await context.setOffline(false); // (opening a page needs the network: no service worker yet)
      await expect(host.locator('.larp-topbar')).not.toContainText('needs the network', { timeout: 10_000 });
      const [again] = await Promise.all([
        context.waitForEvent('page'),
        host.getByRole('button', { name: 'Open Display Window' }).click(),
      ]);
      watch(again, displayErrors);
      await expect(again.locator('.larp-dbanner')).toHaveText(new RegExp(escapeRe(before.slice(0, 20))));
      await sceneLoaded(again);
      await context.setOffline(true);
      display = again;
    }
    if ((await nextButton(host).textContent()).trim() !== 'Next Banner') break;
    const key = await zoneKeys(display);
    await nextButton(host).click();
    await expect.poll(() => zoneKeys(display)).not.toBe(key);
  }
  const banners = seen.join(' | ');
  expect(banners).toContain('+75 Team Points');
  expect(banners).toContain(`${MINUS}25 Team Points`);
  expect(banners).toContain('+25 Individual Points');
  expect(banners).toContain(`${MINUS}25 Individual Points`);
  expect(banners).toContain('Point Deduction');
  expect(banners).toContain('Shine Together');
  expect(banners).not.toContain(SECRET);
  // The last banner leads to the standings, which are Results: the console moves on with the room
  // (its next action the real next step, the reveal's controls gone).
  await expect(host.locator('.larp-phase')).toHaveText('Round 1 · Faith Discovery · Results');
  await expect(nextButton(host)).toHaveText('Start Next Round');
  await expect(host.getByRole('button', { name: 'Skip To Results' })).toHaveCount(0);
  // Places share ties (A19): Maria 200; Phaolô and Phêrô 175 share second; Giuse 75 is fourth.
  let rows = await displayStandings(display);
  expect(rows).toEqual([
    expect.stringMatching(/^1 .*Đội Maria.* 200/),
    expect.stringMatching(/^2 .*Đội Ph(aolô|êrô).* 175/),
    expect.stringMatching(/^2 .*Đội Ph(aolô|êrô).* 175/),
    expect.stringMatching(/^4 .*Đội Giuse.* 75/),
  ]);
  await host.getByRole('button', { name: 'Replay Reveal' }).click();
  await expect(displayRoot(display)).toHaveAttribute('data-scene', 'reveal');
  await host.getByRole('button', { name: 'Skip To Results' }).click();
  expect(await displayStandings(display)).toEqual(rows); // A14: replaying never adds points.

  // ── Round 2: the host reloads mid-turn and resumes (A16) ─────────────────────────────────
  await next(host, 'Start Next Round');
  await next(host, 'Start Preparation');
  await next(host, 'Start Performances');
  await next(host, 'Next Team: Đội Giuse'); // the queue turns each round
  await host.getByRole('tab', { name: 'Run' }).click();
  await awardForm(host).getByRole('textbox', { name: 'Name', exact: true }).fill('Tinh Thần');
  const left = await timerSeconds(host);
  await context.setOffline(false);
  await host.reload();
  await expect(host.locator('.larp-flash')).toContainText('Resume the event: Round 2 · Dance, Performances');
  await fontsLoaded(host);
  await context.setOffline(true);
  await host.getByRole('button', { name: 'Resume Event' }).click();
  await expect(host.locator('.larp-flash')).toHaveCount(0);
  await expect(host.locator('.larp-phase')).toHaveText('Round 2 · Dance · Performances');
  await expect(awardForm(host).getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Tinh Thần');
  expect(await timerSeconds(host)).toBeLessThanOrEqual(left); // the turn's deadline was kept, not restarted
  await awardForm(host).getByRole('textbox', { name: 'Name', exact: true }).fill('');
  // The keys (silent while typing, so focus leaves the field first): T adds 30 s, Space pauses and
  // resumes, N moves on to the next team, A comes back to Add Award.
  await host.locator('.larp-phase').click();
  const before = await timerSeconds(host);
  await host.keyboard.press('t');
  await expect.poll(() => timerSeconds(host)).toBeGreaterThan(before + 20);
  await host.keyboard.press(' ');
  const timerPanel = host.getByRole('region', { name: 'Timer' });
  await expect(timerPanel.getByRole('button', { name: /^Resume/ })).toBeVisible();
  await host.keyboard.press(' ');
  await expect(timerPanel.getByRole('button', { name: /^Pause/ })).toBeVisible();
  const turn = (await nextButton(host).textContent()).trim();
  await host.keyboard.press('n');
  await expect(nextButton(host)).not.toHaveText(turn);
  await host.keyboard.press('a');
  await expect(awardForm(host).getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  // Space on a focused checkbox ticks it; it never reaches the timer (U09).
  const box = awardForm(host).getByRole('group', { name: 'To' }).getByRole('checkbox').last();
  const ticked = await box.isChecked();
  await box.focus();
  await host.keyboard.press(' ');
  await expect(box).toBeChecked({ checked: !ticked });
  await expect(timerPanel.getByRole('button', { name: /^Pause/ })).toBeVisible();
  await host.keyboard.press(' ');
  await expect(box).toBeChecked({ checked: ticked });
  await performAll(host);
  await statuses(host, Object.fromEntries(TEAMS.map(([team]) => [team, 'Complete'])));
  await publish(host, 2);
  await host.getByRole('button', { name: 'Skip To Results' }).click();
  await expect(displayRoot(display)).toHaveAttribute('data-scene', 'results');

  // ── Rounds 3 to 5 ────────────────────────────────────────────────────────────────────────
  await plainRound(host, display, 3, 'Prayer / Sacred Song');
  await plainRound(host, display, 4, 'Bible Skit');
  await plainRound(host, display, 5, 'Team Cheer');
  await next(host, 'End Event', { asks: true });
  await host.getByRole('alertdialog').getByRole('button', { name: 'End Event' }).click();
  await expect(host.locator('.larp-phase')).toHaveText('Finished');
  await expect(nextButton(host)).toHaveText('Export Results');
  // Rounds 2 to 5 added 1,300 to each team (all Complete), so round 1's ties still stand.
  rows = await displayStandings(display);
  expect(rows).toEqual([
    expect.stringMatching(/^1 .*Đội Maria.* 1,500/),
    expect.stringMatching(/^2 .*Đội Ph(aolô|êrô).* 1,475/),
    expect.stringMatching(/^2 .*Đội Ph(aolô|êrô).* 1,475/),
    expect.stringMatching(/^4 .*Đội Giuse.* 1,375/),
  ]);
  // U10: the leading individuals only (the three +25s share first), never the low or zero scores.
  expect(await rowsOf(display.locator('.larp-dleaders .larp-drow'))).toEqual([
    '1 MaiĐội Phaolô 25',
    '1 LanĐội Giuse 25',
    '1 ChiĐội Maria 25',
  ]);
  await expect(displayRoot(display)).not.toContainText(SECRET);

  // A07: nothing private ever went over the channel.
  const heard = (await display.evaluate(() => window.__heard)).join('\n');
  expect(heard).toContain('Shine Together');
  expect(heard).not.toContain(SECRET);
  expect(heard).not.toContain('Both HTs saw it');
  expect(heard).not.toContain('Anh B.');
  expect(heard).not.toContain('Tinh Thần');

  // ── A18: the backup into a fresh browser ─────────────────────────────────────────────────
  await context.setOffline(false);
  await host.getByRole('tab', { name: 'Setup' }).click();
  const [download] = await Promise.all([
    host.waitForEvent('download'),
    host.getByRole('button', { name: 'Export Backup' }).first().click(),
  ]);
  const backup = await download.path();
  expect(readFileSync(backup, 'utf8')).toContain(SECRET); // private notes are in the backup
  const fresh = await browser.newContext();
  const { page: other, errors: otherErrors } = await freshHost(fresh);
  await other.getByRole('tab', { name: 'Setup' }).click();
  await other.locator('input[type="file"][data-change="setup.importFile"]').setInputFiles(backup);
  await expect(other.locator('main')).toContainText('4 teams');
  await other.getByRole('button', { name: 'Import Backup' }).click();
  await other.getByRole('alertdialog').getByRole('button', { name: 'Import Backup' }).click();
  await expect(other.locator('.larp-phase')).toHaveText('Finished');
  const otherDisplay = await fresh.newPage();
  await otherDisplay.goto('/larp/#/display');
  expect(await displayStandings(otherDisplay)).toEqual(rows);
  expect([...errors, ...displayErrors, ...otherErrors]).toEqual([]);
  await fresh.close();
  await context.close();
});

/** @param {string} s */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('the host console loads with one primary next action, and the page is noindex', async ({ context }) => {
  const { page, errors } = await freshHost(context);
  await expect(page).toHaveTitle('Lửa Trại Nghĩa Sĩ · Nghĩa Sĩ Campfire');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('.larp-btn-primary')).toHaveCount(1);
  const start = nextButton(page);
  await expect(start).toHaveText('Start Event');
  await expect(start).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.larp-next-why')).toHaveText('Add at least one team to start.');
  await expect(page.getByRole('tab')).toHaveCount(5);
  // Keyboard only (U09): the tablist keys reach every tab from the one in the Tab order.
  await page.getByRole('tab', { name: 'Run' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Teams & Roster' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Teams & Roster' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Setup' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Setup' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Setup' })).toBeVisible();
  await expect(page.locator('.larp-saved')).toHaveText('Saved');
  await expect(page.locator('.larp-display-state')).toHaveText('Display Not Opened');
  // The ? key lists the shortcuts.
  await page.locator('body').press('?');
  await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a second host tab is locked until it takes over (A25)', async ({ context }) => {
  const { page: first } = await freshHost(context);
  const second = await context.newPage();
  await second.goto('/larp/');
  await expect(second.locator('.larp-lock')).toBeVisible();
  await expect(second.locator('[data-action="next"]')).toHaveCount(0);
  await second.locator('[data-action="takeOver"]').click();
  await expect(second.locator('.larp-topbar')).toBeVisible();
  await expect(first.locator('.larp-lock')).toContainText('Another tab took over the host console.');
});

test('Judge Mode stays behind the Host PIN in a new tab and after Take Over', async ({ context }) => {
  const { page: first, errors } = await freshHost(context);
  await first.getByRole('tab', { name: 'Setup' }).click();
  const pin = first.locator('#setup-hostPin');
  await expect(pin).toHaveAttribute('type', 'password');
  await pin.fill('4321');
  await pin.press('Tab');
  await first.getByRole('tab', { name: 'Teams & Roster' }).click();
  await first.locator('#add-gm-name').fill('Anh B.');
  await first.getByRole('button', { name: 'Add Co-GM' }).click();
  await expect(first.getByRole('textbox', { name: 'Name · Anh B.' })).toBeVisible();
  await first.locator('body').press('j');
  await first.getByRole('button', { name: 'Anh B.' }).click();
  await expect(first.locator('.larp-judge-shell')).toContainText('Anh B.');

  const second = await context.newPage();
  await second.goto('/larp/');
  await second.locator('[data-action="takeOver"]').click();
  await expect(second.locator('.larp-judge-shell')).toContainText('Judge Mode · Anh B.');
  await expect(second.locator('.larp-topbar')).toHaveCount(0);
  await second.getByRole('button', { name: 'Done' }).click();
  const pinBox = second.getByRole('textbox', { name: 'Host PIN' });
  await pinBox.fill('1111');
  await pinBox.press('Enter'); // Enter tries the PIN, as Return To Console does
  await expect(second.locator('.larp-judge-shell')).toContainText("That PIN isn't right.");
  await pinBox.fill('4321');
  await pinBox.press('Enter');
  await expect(second.locator('.larp-topbar')).toBeVisible();
  await expect(second.getByRole('button', { name: 'Judge Mode' })).toBeFocused();
  // Left with the PIN: once that tab closes, a new one opens straight on the console (the first,
  // taken over, stays locked and quiet).
  await second.close();
  const third = await context.newPage();
  await third.goto('/larp/');
  await expect(third.locator('.larp-topbar')).toBeVisible();
  await expect(third.locator('.larp-judge-shell')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a saved event it cannot read is kept, never written over', async ({ context }) => {
  const { page, errors } = await freshHost(context);
  await page.evaluate(() => localStorage.setItem('larp.event', '{"schemaVersion":1,"truncat'));
  await page.reload();
  await expect(page.locator('.larp-flash')).toContainText("The saved event is damaged and can't be read.");
  await expect(page.locator('.larp-flash')).toContainText('It was kept aside, untouched');
  const kept = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('larp.event.unreadable-'))
      .map((k) => localStorage.getItem(k)),
  );
  expect(kept).toEqual(['{"schemaVersion":1,"truncat']);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Unreadable Save' }).click(),
  ]);
  expect(readFileSync(await download.path(), 'utf8')).toBe('{"schemaVersion":1,"truncat');
  expect(errors).toEqual([]);
});

test("the portfolio's first load carries no game code (U08)", async ({ page }) => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  expect(html).not.toMatch(/larp|hostDom|displayDom/i);
  // By content, not by file name: a shared chunk (strings-*.js, dom-*.js) would pass a name check.
  // Every script the page loads up front, and every chunk those import, carries no game marker:
  // the store key, the channel's name, or the game's own words (strings.js).
  const dist = new URL('../dist/', import.meta.url);
  const first = [...html.matchAll(/(?:src|href)="\/?((?:[^"/]+\/)*[^"/]+\.js)"/g)].map((m) => m[1]);
  expect(first.length).toBeGreaterThan(0);
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(new URL(file, dist), 'utf8');
    expect(code, file).not.toMatch(/larp\.(event|channel|ui\.state)|Bảng Điều Khiển Quản Trò|Lửa Trại Nghĩa Sĩ/);
    for (const m of code.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)) walk(`assets/${m[1]}`);
  };
  for (const file of first) walk(file.replace(/^.*?(assets\/)/, '$1'));
  const requested = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.goto('/');
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  expect(
    requested.filter((p) => /larp|hostDom|displayDom|displayView|judge|hostRun|hostSetup|hostReview/i.test(p)),
  ).toEqual([]);
});
