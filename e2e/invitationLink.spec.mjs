// The link button on /invitation/ (src/invitation/ui.js and link.js; the admin's
// invitation.link), in a real browser on the production build, on a desktop (1280×800) and a
// phone (390×844, touch). Every page here sets its own link through ?test's setLink (never the
// admin's, which ships empty: no button), a site path, so a press opens a page of the site's own.
// Over the envelope it sits at the top left, over the letter (Skip Intro keeps the top right);
// through the intro it stays in that corner, Skip Intro just right of it; in the toy it's at the
// top right. A click, a tap or Enter on it opens its page in a new tab, and never opens the
// envelope, swipes it, goes on or skips a line; a finger that goes down on it and drags never
// drags the envelope. When the intro ends (or the envelope's skipped) it fades out and back in at
// the top right, never sliding across, and only once what sat there has gone (reduced motion: out
// of sight and back, no fade), and Replay Intro takes it back
// to the top left. Tab reaches it after the letter and Skip Intro, after the intro's own buttons,
// and after the toolbar, its ring and its label (a pixel tab under it) only after a key; a
// mouse shows the label on hover, over a dither fill; on a phone a press held still shows the
// label and opens nothing. Under the Settings sheet it's inert; empty or unsafe it's hidden from
// everyone; a mailto: opens in place; under ?preview there's none. Nothing overlaps it or its
// label at 320×568, 390×844, 844×390, 700×600, 640×800, 1280×400, 1280×800 and 1920×1080, in any
// scene, and over the envelope and in the intro Skip Intro is as high up and as tall as it.
// Every wait is on a state (?test's snapshot), never on a duration.
import { test, expect } from '@playwright/test';

/** The test's own link: a page of the site's (cheap to open), and a name. */
const LINK = { href: 'favicon.svg', label: 'Portfolio' };
/** The longest name the admin takes (24 letters), for the overlap checks. */
const LONG = { href: 'favicon.svg', label: 'Twenty Four Letter Label' };
const ENVELOPE = '/invitation/?test&envelope&calm&seed=3';
const TOY = '/invitation/?test&calm&seed=3';
/** A short intro of the test's own: a long first line, then the end. */
const INTRO = {
  speaker: 'Tester',
  start: 'a',
  boxes: [
    {
      id: 'a',
      speaker: '',
      text: 'This first line is a long one, so that it is still typing out letter by letter for a good few seconds after it starts, whatever else happens on the screen meanwhile.',
      face: 'neutral',
      animation: 'none',
      camera: 'keep',
      next: '',
      end: false,
      auto: 0,
      choices: [],
    },
    {
      id: 'b',
      speaker: '',
      text: 'And that is all.',
      face: 'happy',
      animation: 'none',
      camera: 'keep',
      next: '',
      end: true,
      auto: 0,
      choices: [],
    },
  ],
};

/** Collect the page's errors for the test to check. */
function watch(page, errors = []) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}
const snapshot = (page) => page.evaluate(() => window.__invitation.snapshot());
/** Waits until `pred(snapshot)` holds (states, never durations). */
const until = (page, pred, message, timeout = 30_000) =>
  expect.poll(async () => pred(await snapshot(page)), { message, timeout }).toBe(true);
/** The page's hooks are in (the stage is up; newt.glb may still be loading). */
async function hooks(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.__invitation)), { timeout: 30_000 }).toBe(true);
}
/** The toy ready, calm, standing still in idle (no envelope). */
async function toy(page, path = TOY) {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await hooks(page);
  await until(page, (s) => s.state === 'idle' && s.clip === 'Idle', 'idle');
}
/** The envelope up over the toy, NEWT in behind it. */
async function envelopeUp(page, path = ENVELOPE) {
  await page.goto(path);
  await expect(page.locator('.inv-envelope')).toBeVisible();
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await hooks(page);
  await until(page, (s) => s.envelope === 'floating', 'the envelope floating');
}
/** Sets the page's link (the admin's never used here). */
const setLink = (page, link = LINK) => page.evaluate((l) => window.__invitation.setLink(l), link);
const linkEl = (page) => page.locator('[data-link]');
const label = (page) => linkEl(page).locator('.inv-btn-label');
const labelShown = (page) => label(page).evaluate((el) => Number(getComputedStyle(el).opacity));
/** It's settled in `corner` ('left' or 'right'), shown, not fading. */
const settled = (page, corner) =>
  until(
    page,
    (s) => s.link.shown && s.link.corner === corner && s.link.at === corner && !s.link.phase,
    `the link settled at the ${corner}`,
  );
/** The envelope's own snapshot (its state and the frames it has drawn). */
const envSnap = (page) => page.evaluate(() => window.__invitation.envelope());
/** Waits until the envelope has drawn `n` more frames (for a check that something did not happen). */
async function envelopeFrames(page, n = 20) {
  const from = (await envSnap(page)).frames;
  await expect
    .poll(async () => (await envSnap(page)).frames, { message: 'the envelope drawn on' })
    .toBeGreaterThan(from + n);
}
/** Waits until the toy's clock has gone on `s` seconds (for a check that something did not happen). */
async function clockOn(page, s = 0.6) {
  const from = await page.evaluate(() => window.__invitation.clock());
  await expect
    .poll(() => page.evaluate(() => window.__invitation.clock()), { message: 'the toy’s clock on' })
    .toBeGreaterThan(from + s);
}
/** A press on the link opens its page in a new tab: that page, then closed. (A press that opens
 *  none fails here in 15 s, named, not at the test's own 60 s timeout.) */
async function opensPage(page, press) {
  const [opened] = await Promise.all([
    page
      .context()
      .waitForEvent('page', { timeout: 15_000 })
      .catch((e) => {
        throw new Error(`the press opened no page: ${e.message}`);
      }),
    press(),
  ]);
  expect(opened.url(), 'its page, in a tab of its own').toMatch(/\/favicon\.svg$/);
  await opened.close();
}
/** Where focus is, its ring (:focus-visible) and the focused button's label's opacity. */
const focusState = (page) =>
  page.evaluate(() => {
    const el = /** @type {HTMLElement|null} */ (document.activeElement);
    const tab = el?.querySelector?.('.inv-btn-label');
    return {
      link: Boolean(el?.matches?.('[data-link]')),
      skip: Boolean(el?.matches?.('[data-intro-skip]')),
      letter: Boolean(el?.matches?.('[data-envelope]')),
      talk: el?.dataset?.talk ?? null,
      ring: Boolean(el?.matches?.(':focus-visible')),
      label: tab ? Number(getComputedStyle(tab).opacity) : null,
    };
  });
/** Real touches through CDP: `touch(type, [{x, y, id}])`. */
async function toucher(page) {
  const cdp = await page.context().newCDPSession(page);
  return (type, points = []) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id ?? 1, radiusX: 2, radiusY: 2, force: 1 })),
    });
}
const middle = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** Whether the top of the stack at a box's middle is the link (it sits over everything there). */
const onTop = (page) =>
  page.evaluate(() => {
    const el = /** @type {HTMLElement} */ (document.querySelector('[data-link]'));
    const b = el.getBoundingClientRect();
    return Boolean(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('[data-link]'));
  });
/**
 * Each frame from now until the link has settled at the right, as drawn: where it is (its box's
 * left), which corner it's at, its opacity, its fade's phase ('out', 'in' or null) and how much
 * shows of what sat at the top right (the envelope's Skip Intro, the intro's Auto, Next and Log:
 * the most of any, their layers' fades counted in). Start it before what moves it.
 */
const moveFrames = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        /** @type {{x: number, at: string, opacity: number, phase: string|null, under: number}[]} */
        const frames = [];
        /** How much of it shows, its own and its layers' opacity together (0: none, or hidden). */
        const shows = (/** @type {string} */ sel) => {
          const el = document.querySelector(sel);
          if (!el || el.closest('[hidden]')) return 0;
          let o = 1;
          for (let n = /** @type {Element|null} */ (el); n; n = n.parentElement)
            o *= Number(getComputedStyle(n).opacity);
          return o;
        };
        const tick = () => {
          const el = /** @type {HTMLElement} */ (document.querySelector('[data-link]'));
          const s = window.__invitation.snapshot().link;
          frames.push({
            x: el.getBoundingClientRect().x,
            at: el.dataset.corner ?? '',
            opacity: Number(getComputedStyle(el).opacity),
            phase: s.phase,
            under: Math.max(shows('.inv-envelope-skip'), shows('.inv-talk-top')),
          });
          const last = frames.at(-1);
          if ((last.at === 'right' && !last.phase && last.opacity > 0.99) || frames.length > 900)
            return resolve(frames);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
/**
 * A plain fade out at the left, then in at the right: never between the two (no slide), out
 * till it's gone before it changes corners, then back in.
 */
async function fadedAcross(page, frames, vw) {
  const flip = frames.findIndex((f) => f.at === 'right');
  expect(flip, 'it reached the right').toBeGreaterThan(0);
  expect(
    frames.slice(flip).every((f) => f.at === 'right'),
    'one move, left to right',
  ).toBe(true);
  for (const f of frames.slice(0, flip)) expect(f.x, 'at the left while it’s there').toBeLessThan(vw / 4);
  for (const f of frames.slice(flip)) expect(f.x, 'at the right once it’s there').toBeGreaterThan((3 * vw) / 4);
  expect(
    frames.some((f) => f.phase),
    'a fade',
  ).toBe(true);
  for (const f of frames) if (f.phase === 'out') expect(f.at, 'out at the left').toBe('left');
  for (const f of frames) if (f.phase === 'in') expect(f.at, 'in at the right').toBe('right');
  const outs = frames.filter((f) => f.phase === 'out').map((f) => f.opacity);
  const ins = frames.filter((f) => f.phase === 'in').map((f) => f.opacity);
  outs.forEach((o, i) => i && expect(o, 'fading out').toBeLessThanOrEqual(outs[i - 1] + 1e-6));
  ins.forEach((o, i) => i && expect(o, 'fading in').toBeGreaterThanOrEqual(ins[i - 1] - 1e-6));
  // (In at the right only once what sat there had gone.)
  for (const f of frames.slice(flip))
    if (f.opacity > 0.02) expect(f.under, 'the top right clear before it comes in').toBeLessThan(0.02);
  // (Out of sight as it changed corners: the fade out was done.)
  expect((await snapshot(page)).link.swapOpacity, 'gone before it moves').toBeLessThan(0.05);
  expect(frames.at(-1).opacity).toBeGreaterThan(0.99);
}

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('over the envelope: at the top left over the letter, a click opens its page and never the envelope, and a drag from it never moves the letter; Skip Intro sends it to the top right with a fade, and Replay Intro brings it back', async ({
    page,
  }) => {
    const errors = watch(page);
    await envelopeUp(page);
    await setLink(page);
    await settled(page, 'left');
    const link = linkEl(page);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/favicon.svg');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByRole('link', { name: 'Portfolio', exact: true })).toBeVisible();
    const box = await link.boundingBox();
    expect(box.x, 'the top left').toBeLessThan(24);
    expect(box.y).toBeLessThan(24);
    expect(await onTop(page), 'over the envelope').toBe(true);
    const skip = await page.locator('.inv-envelope-skip').boundingBox();
    expect(skip.x, 'Skip Intro keeps the top right').toBeGreaterThan(640);
    await expect(page.locator('.inv-envelope')).toHaveAttribute('aria-owns', 'inv-link');

    // A click opens its page; the envelope floats on.
    await opensPage(page, () => link.click());
    await envelopeFrames(page);
    expect((await snapshot(page)).envelope, 'not opened').toBe('floating');
    // A drag that starts on it, down the screen (a skip, on the letter), never moves the letter.
    const at = middle(box);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(at.x + 4 * i, at.y + 40 * i);
    await page.mouse.up();
    await envelopeFrames(page);
    expect((await snapshot(page)).envelope, 'not skipped').toBe('floating');

    // Skipped: out at the top left, then in at the top right.
    const frames = moveFrames(page);
    await page.locator('.inv-envelope-skip').click();
    await fadedAcross(page, await frames, 1280);
    await settled(page, 'right');
    const right = await link.boundingBox();
    expect(right.x + right.width, 'the top right').toBeGreaterThan(1280 - 24);
    expect(right.y).toBeLessThan(24);

    // Replay Intro: the envelope again, and the link with it at the top left.
    await page.getByRole('button', { name: 'Replay Intro', exact: true }).click();
    await until(page, (s) => s.envelope === 'floating', 'the envelope back');
    await settled(page, 'left');
    expect(await onTop(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('over the envelope by keyboard: Tab goes letter, Skip Intro, link and round, its ring and label only from a key; Enter on it opens its page, not the envelope', async ({
    page,
  }) => {
    await envelopeUp(page);
    await setLink(page);
    await settled(page, 'left');
    expect((await focusState(page)).letter, 'the letter has focus at boot').toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await focusState(page)).skip).toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await focusState(page)).link, 'after Skip Intro, the link').toBe(true);
    await expect.poll(async () => (await focusState(page)).label, 'its label, from a key').toBeGreaterThan(0.9);
    expect((await focusState(page)).ring, 'its ring').toBe(true);
    const tab = await label(page).boundingBox();
    const box = await linkEl(page).boundingBox();
    expect(tab.y, 'its label a tab under it').toBeGreaterThanOrEqual(box.y + box.height);
    expect(tab.x, 'on screen').toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await focusState(page)).letter, 'and round to the letter').toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(async () => (await focusState(page)).link, 'back to the link').toBe(true);
    // Enter on it: its page, and the envelope floats on (Space does nothing there either).
    await opensPage(page, () => page.keyboard.press('Enter'));
    await page.keyboard.press('Space');
    await envelopeFrames(page);
    expect((await snapshot(page)).envelope, 'not opened').toBe('floating');
  });

  test('through the intro: at the top left, Skip Intro just right of it, the Tab order round its buttons and the link; a click or Enter on it opens its page and never goes on; at the end it fades to the top right', async ({
    page,
  }) => {
    const errors = watch(page);
    await toy(page);
    await page.evaluate((i) => window.__invitation.setIntro(i), INTRO);
    await setLink(page);
    await settled(page, 'right');
    await page.getByRole('button', { name: 'Replay Intro', exact: true }).click();
    await until(page, (s) => s.dialogue && !s.dialogue.waiting, 'the intro under way');
    await settled(page, 'left');
    await expect(page.locator('.inv-talk')).toHaveAttribute('aria-owns', 'inv-link');
    const link = await linkEl(page).boundingBox();
    const skip = await page.locator('.inv-talk-skip-intro').boundingBox();
    expect(link.x).toBeLessThan(24);
    const gap = skip.x - (link.x + link.width);
    expect(gap, 'Skip Intro just right of it').toBeGreaterThanOrEqual(5);
    expect(gap).toBeLessThanOrEqual(10);
    expect(Math.abs(skip.y - link.y), 'level with it').toBeLessThanOrEqual(1);
    expect(Math.abs(skip.height - link.height), 'as tall').toBeLessThanOrEqual(1);
    expect(await onTop(page), 'over the chat screen').toBe(true);
    // The line all typed first: from here a press that reached the layer would go on at once.
    await until(page, (s) => s.dialogue?.typed === true, 'the first line typed');

    // A click opens its page; the same box, not gone on.
    const before = (await snapshot(page)).dialogue;
    await opensPage(page, () => linkEl(page).click());
    await clockOn(page);
    let now = (await snapshot(page)).dialogue;
    expect([now.id, now.seq], 'the same box, not gone on by the click').toEqual([before.id, before.seq]);

    // Tab: round the intro's buttons and the link.
    await page.keyboard.press('Tab');
    const order = [];
    for (let i = 0; i < 6; i++) {
      const f = await focusState(page);
      order.push(f.link ? 'link' : f.skip ? 'skipIntro' : f.talk);
      await page.keyboard.press('Tab');
    }
    expect(order, 'its buttons, then the link, and round').toEqual([
      'auto',
      'skip',
      'log',
      'skipIntro',
      'link',
      'auto',
    ]);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect.poll(async () => (await focusState(page)).link).toBe(true);
    expect((await focusState(page)).ring, 'its ring, from a key').toBe(true);
    // Enter on it opens its page; Space and Enter there never go on.
    await opensPage(page, () => page.keyboard.press('Enter'));
    await page.keyboard.press('Space');
    await clockOn(page);
    now = (await snapshot(page)).dialogue;
    expect([now.id, now.seq], 'still the same box').toEqual([before.id, before.seq]);

    // Skip Intro: the intro's over, and the link fades out at the left and in at the right.
    const frames = moveFrames(page);
    await page.locator('.inv-talk-skip-intro').click();
    await fadedAcross(page, await frames, 1280);
    await settled(page, 'right');
    await until(page, (s) => s.dialogue === null, 'the intro over');
    await expect(page.locator('.inv-talk')).not.toHaveAttribute('aria-owns', /./);
    expect(errors).toEqual([]);
  });

  test('with reduced motion it changes corners with no fade, out of sight till the top right is clear', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toy(page);
    await page.evaluate((i) => window.__invitation.setIntro(i), INTRO);
    await setLink(page);
    await page.getByRole('button', { name: 'Replay Intro', exact: true }).click();
    await until(page, (s) => s.dialogue && !s.dialogue.waiting, 'the intro under way');
    await settled(page, 'left');
    const frames = moveFrames(page);
    await page.locator('.inv-talk-skip-intro').click();
    const seen = await frames;
    expect(
      seen.every((f) => f.opacity < 0.01 || f.opacity > 0.99),
      'never half faded',
    ).toBe(true);
    expect(
      seen.some((f) => f.phase === 'in'),
      'never fading in',
    ).toBe(false);
    for (const f of seen)
      if (f.at === 'right' && f.opacity > 0.02) expect(f.under, 'the top right clear first').toBeLessThan(0.02);
    expect(seen.at(-1).at).toBe('right');
    await settled(page, 'right');
  });

  test('in the toy: at the top right, after the toolbar in Tab order, its label a tab under it on hover (a dither fill) and on keyboard focus; inert under the Settings sheet', async ({
    page,
  }) => {
    const errors = watch(page);
    await toy(page);
    await setLink(page);
    await settled(page, 'right');
    const link = linkEl(page);
    const box = await link.boundingBox();
    expect(box.x + box.width).toBeGreaterThan(1280 - 24);
    expect(box.y).toBeLessThan(24);
    await expect(page.locator('.inv-envelope')).toHaveCount(0);
    // Hover: its label, a tab under it and on screen, and the toolbar's dither fill.
    expect(await labelShown(page), 'hidden until hovered').toBe(0);
    await link.hover();
    await expect.poll(() => labelShown(page), { message: 'shown on hover' }).toBeGreaterThan(0.9);
    const tab = await label(page).boundingBox();
    expect(tab.y, 'under it').toBeGreaterThanOrEqual(box.y + box.height);
    expect(tab.x + tab.width, 'on screen').toBeLessThanOrEqual(1280);
    expect(await label(page).textContent()).toBe('Portfolio');
    expect(await link.evaluate((el) => getComputedStyle(el).backgroundImage), 'a dither fill').toMatch(
      /url\("data:image\/png/,
    );
    await page.mouse.move(640, 400);
    await expect.poll(() => labelShown(page), { message: 'gone once the mouse leaves' }).toBe(0);
    // A click with the mouse opens its page, and shows no ring on it.
    await opensPage(page, () => link.click());
    expect((await focusState(page)).ring, 'no ring after a click').toBe(false);
    // Keyboard: after the toolbar's last button (Settings), with its ring and its label.
    await page.getByRole('button', { name: 'Settings', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await focusState(page)).link, 'after the toolbar').toBe(true);
    await expect.poll(async () => (await focusState(page)).label).toBeGreaterThan(0.9);
    expect((await focusState(page)).ring).toBe(true);
    // Under the Settings sheet: inert (no focus, no press, out of the tree), and back after.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.locator('.inv-sheet')).toBeVisible();
    await until(page, (s) => s.link.inert, 'inert under the sheet');
    expect(await link.evaluate((el) => /** @type {HTMLElement} */ (el).inert)).toBe(true);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      expect((await focusState(page)).link, 'Tab never reaches it under the sheet').toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.inv-sheet')).toBeHidden();
    await until(page, (s) => !s.link.inert, 'live again');
    expect(await link.evaluate((el) => /** @type {HTMLElement} */ (el).inert)).toBe(false);
    await expect(page.locator('[title]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('empty or unsafe it’s hidden from everyone; a mailto: opens in place; under ?preview there’s none', async ({
    page,
  }) => {
    await toy(page);
    // (As shipped, the admin's link is empty: no button.)
    for (const href of ['', 'javascript:alert(1)', 'data:text/html,<b>x</b>', '//evil.example']) {
      await setLink(page, { href, label: 'Gone' });
      await until(page, (s) => !s.link.shown, `${href || 'empty'}: hidden`);
      await expect(linkEl(page)).toBeHidden();
      await expect(linkEl(page)).not.toHaveAttribute('href', /./);
      await expect(page.getByRole('link', { name: 'Gone' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Settings', exact: true }).focus();
      await page.keyboard.press('Tab');
      expect((await focusState(page)).link, 'not in the Tab order').toBe(false);
    }
    await setLink(page, { href: 'mailto:hi@example.com', label: 'Write' });
    await until(page, (s) => s.link.shown, 'a mailto: shows');
    await expect(linkEl(page)).toHaveAttribute('href', 'mailto:hi@example.com');
    await expect(linkEl(page)).not.toHaveAttribute('target', /./);
    // An empty label: named Link.
    await setLink(page, { href: 'favicon.svg', label: '' });
    await expect(page.getByRole('link', { name: 'Link', exact: true })).toBeVisible();
    // The admin's intro preview: none at all.
    await page.goto('/invitation/?preview&test&seed=3');
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await hooks(page);
    await setLink(page);
    await clockOn(page, 0.2);
    expect((await snapshot(page)).link.shown, 'none under ?preview').toBe(false);
    await expect(linkEl(page)).toBeHidden();
  });

  test('nothing overlaps it or its label, in any scene, at 320×568, 390×844, 844×390, 700×600, 640×800, 1280×400, 1280×800 and 1920×1080; Skip Intro level with it over the envelope and in the intro', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const SIZES = [
      [320, 568],
      [390, 844],
      [844, 390],
      // (The link's big size but under the hint's 720px; 844×390 and 1280×400, wide but short,
      // are the other way round. Skip Intro keeps level with it at each.)
      [700, 600],
      [640, 800],
      [1280, 400],
      [1280, 800],
      [1920, 1080],
    ];
    /** Every box at once, client px: the link, its label shown, and what's on screen near it. */
    const measure = (others) =>
      page.evaluate(async (sel) => {
        const link = /** @type {HTMLElement} */ (document.querySelector('[data-link]'));
        link.classList.add('is-label');
        const tab = /** @type {HTMLElement} */ (link.querySelector('.inv-btn-label'));
        // (The label's in, its transition done.)
        await new Promise((done) => {
          const tick = () =>
            getComputedStyle(tab).opacity === '1' && getComputedStyle(tab).transform.endsWith(', 0)')
              ? done(null)
              : requestAnimationFrame(tick);
          tick();
        });
        const box = (el) => {
          const b = el.getBoundingClientRect();
          return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        };
        const out = {
          link: box(link),
          tab: box(tab),
          vw: innerWidth,
          vh: innerHeight,
          others: [...document.querySelectorAll(sel)]
            .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
            .map((el) => ({ what: el.className || el.tagName, ...box(el) })),
        };
        link.classList.remove('is-label');
        return out;
      }, others);
    const overlap = (a, b) =>
      a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    /** At each size: the link and its label on screen, clear of each other one, and the `level`
     *  button (if any) as high up and as tall as the link. */
    async function check(scene, others, level) {
      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(w);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const m = await measure(others);
        const at = `${scene} at ${w}×${h}`;
        if (level) {
          const l = await page.locator(level).boundingBox();
          expect(l, `${at}: ${level} there`).not.toBeNull();
          expect(Math.abs(l.y - m.link.top), `${at}: ${level} level with it`).toBeLessThanOrEqual(1);
          expect(Math.abs(l.height - (m.link.bottom - m.link.top)), `${at}: ${level} as tall`).toBeLessThanOrEqual(1);
        }
        for (const [name, b] of [
          ['the link', m.link],
          ['its label', m.tab],
        ]) {
          expect(b.left, `${at}: ${name} on screen`).toBeGreaterThanOrEqual(0);
          expect(b.top, `${at}: ${name} on screen`).toBeGreaterThanOrEqual(0);
          expect(b.right, `${at}: ${name} on screen`).toBeLessThanOrEqual(m.vw);
          expect(b.bottom, `${at}: ${name} on screen`).toBeLessThanOrEqual(m.vh);
        }
        expect(m.others.length, `${at}: something to check against`).toBeGreaterThan(0);
        for (const o of m.others) {
          expect(overlap(m.link, o), `${at}: the link clear of ${o.what}`).toBe(false);
          expect(overlap(m.tab, o), `${at}: its label clear of ${o.what}`).toBe(false);
        }
      }
    }
    await envelopeUp(page);
    await setLink(page, LONG);
    await settled(page, 'left');
    await check('the envelope', '.inv-envelope-skip', '.inv-envelope-skip');
    // Opened: the intro, the link still at the top left.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press('Enter');
    await until(
      page,
      (s) => (s.envelope === 'gone' || s.envelope === null) && s.dialogue && !s.dialogue.waiting,
      'the intro under way',
    );
    await settled(page, 'left');
    await check('the intro', '.inv-talk .inv-btn, .inv-talk-box', '.inv-talk-skip-intro');
    // Skipped to the toy: the link at the top right.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('.inv-talk-skip-intro').click();
    await settled(page, 'right');
    await check('the toy', '.inv-toolbar > .inv-btn, .inv-bubble:not(.is-away)');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('over the envelope: icons only; a press held still shows its label and opens nothing, a swipe from it never moves the letter, and a quick tap opens its page and not the envelope', async ({
    page,
  }) => {
    const errors = watch(page);
    await envelopeUp(page);
    await setLink(page);
    await settled(page, 'left');
    const touch = await toucher(page);
    const box = await linkEl(page).boundingBox();
    const at = middle(box);
    expect(await labelShown(page), 'icon only to begin with').toBe(0);
    let opened = 0;
    page.context().on('page', () => opened++);
    // Held still: its label comes up under it; let go, nothing opens.
    await touch('touchStart', [at]);
    await expect(linkEl(page)).toHaveClass(/is-label/, { timeout: 5_000 });
    await expect.poll(() => labelShown(page), { message: 'the label shows' }).toBeGreaterThan(0.9);
    const tab = await label(page).boundingBox();
    expect(tab.y, 'a tab under it').toBeGreaterThanOrEqual(box.y + box.height);
    await touch('touchEnd');
    await envelopeFrames(page);
    expect(opened, 'the press after a held label opens nothing').toBe(0);
    expect((await snapshot(page)).envelope).toBe('floating');
    // No long-press menu either.
    const menu = await linkEl(page).evaluate((el) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(menu, 'no long-press menu').toBe(true);
    // A swipe down from it (a skip, on the letter) never moves the letter.
    await touch('touchStart', [at]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: at.x + 2 * i, y: at.y + 50 * i }]);
    await touch('touchEnd');
    await envelopeFrames(page);
    expect((await snapshot(page)).envelope, 'not skipped').toBe('floating');
    expect(opened).toBe(0);
    // A quick tap opens its page; the envelope floats on.
    await expect.poll(() => labelShown(page), { message: 'the label goes', timeout: 10_000 }).toBe(0);
    await opensPage(page, async () => {
      await touch('touchStart', [at]);
      await touch('touchEnd');
    });
    await envelopeFrames(page);
    expect((await snapshot(page)).envelope, 'not opened').toBe('floating');
    expect(errors).toEqual([]);
  });

  test('in the toy: at the top right, a tap opens its page', async ({ page }) => {
    await toy(page);
    await setLink(page);
    await settled(page, 'right');
    const box = await linkEl(page).boundingBox();
    expect(box.x + box.width).toBeGreaterThan(390 - 24);
    expect(box.y).toBeLessThan(24);
    const touch = await toucher(page);
    await opensPage(page, async () => {
      await touch('touchStart', [middle(box)]);
      await touch('touchEnd');
    });
  });
});
