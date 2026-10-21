// Play Intro, the invitation toy's chat (/invitation/), in a real browser on the production build,
// on a phone (390×844, touch) and a desktop (1280×800): the button opens the chat box over the
// stage (the toolbar rests out of sight, NEWT goes into his talk state and turns to the camera),
// the line types out, a tap finishes it and the next tap goes on; Skip goes to the box with
// replies, which show as buttons stacked mid-screen, and picking one goes where it leads; Auto
// goes on by itself; the Log lists the lines shown and closes again; each box's shot sends the
// camera nearer or further (close nearer than wide); Escape asks before it skips the intro and a
// second Escape ends it, Space and Enter go on; reduced motion shows each line at once and cuts
// the camera; and after the end the toolbar, the camera and his free play come back. The script
// is read from the page (?test's intro()), never pinned here, and every wait is on a state (it's
// content.json's intro, as content.js reads it). Down every reply each box shows its face (the
// four dialogue faces from their own sheets).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

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
/** Ready, calm, standing still in idle. */
async function calm(page, path = '/invitation/?test&calm&seed=3') {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await until(page, (s) => s.state === 'idle' && s.clip === 'Idle', 'idle');
}
/** The script Play Intro runs (the admin's, or the placeholder). */
const script = (page) => page.evaluate(() => window.__invitation.intro());
const playIntro = (page) => page.getByRole('button', { name: 'Play Intro', exact: true });
const box = (page) => page.locator('.inv-talk-box');
/** Opens the intro and waits for its first box, with him turned and talking. */
async function open(page, tap = false) {
  if (tap) await playIntro(page).tap();
  else await playIntro(page).click();
  await expect(box(page)).toBeVisible();
  await until(page, (s) => s.dialogue && s.state === 'talk', 'the intro under way');
}
/** A tap (or click) on empty space over the stage: off every button, over NEWT's head. */
async function goOn(page, touch = false) {
  const vp = page.viewportSize();
  const at = { x: vp.width * 0.18, y: vp.height * 0.3 };
  if (touch) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}
/** The boxes a script can reach from its start (each box's choices, else its next). */
function reachable(intro) {
  const byId = new Map(intro.boxes.map((b) => [b.id, b]));
  const seen = new Set();
  const stack = [intro.start];
  while (stack.length) {
    const b = byId.get(stack.pop());
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    if (b.choices?.length) stack.push(...b.choices.map((c) => c.next));
    else if (b.next) stack.push(b.next);
  }
  return [...seen];
}

test.describe('the admin’s intro', () => {
  test('Play Intro plays content.json’s invitation.intro, box for box', async ({ page }) => {
    const inv = JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8')).invitation ?? {};
    const own = Array.isArray(inv.intro?.boxes) ? inv.intro.boxes : [];
    test.skip(!own.length, 'content.json has no intro: the toy plays its own');
    await calm(page);
    const intro = await script(page);
    expect(intro.boxes.map((b) => ({ id: b.id, text: b.text }))).toEqual(
      own.map((b) => ({ id: b.id, text: String(b.text).trim() })),
    );
    await open(page);
    const s = await snapshot(page);
    expect(s.dialogue.id).toBe(intro.start);
    expect(s.dialogue.text).toBe(intro.boxes.find((b) => b.id === intro.start).text);
  });

  test('down every reply, each box shows its face', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watch(page);
    await calm(page);
    const intro = await script(page);
    const byId = new Map(intro.boxes.map((b) => [b.id, b]));
    /** @type {Set<string>} */
    const checked = new Set();
    const runs = Math.max(1, ...intro.boxes.map((b) => b.choices?.length ?? 0));
    for (let run = 0; run < runs; run++) {
      await open(page);
      const visited = new Set();
      for (let i = 0; i < 60; i++) {
        const s = await snapshot(page);
        if (!s.dialogue) break;
        const b = byId.get(s.dialogue.id);
        // (Round again, through a reply that leads back: this run's done.)
        if (visited.has(b.id)) break;
        visited.add(b.id);
        if (!checked.has(b.id)) {
          await until(
            page,
            (x) => x.dialogue?.id === b.id && x.face === b.face && x.faceShown === b.face,
            `${b.id}: the ${b.face} face`,
          );
          checked.add(b.id);
        }
        // On: this run's reply (or the last there is), else a click or two (finished, then on).
        const seq = s.dialogue.seq;
        if (b.choices?.length) {
          await until(page, (x) => Boolean(x.dialogue?.choices), `${b.id}: its replies`);
          await page
            .locator('.inv-talk-choice')
            .nth(Math.min(run, b.choices.length - 1))
            .click();
        } else {
          await goOn(page);
          const now = await snapshot(page);
          if (now.dialogue?.seq === seq) await goOn(page);
        }
        await until(page, (x) => !x.dialogue || x.dialogue.seq > seq, `${b.id}: on`);
      }
      if ((await snapshot(page)).dialogue) {
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      }
      await expect(box(page)).toBeHidden();
      await until(page, (x) => !x.dialogue && x.state !== 'talk' && x.buttonsEnabled, 'back to play');
    }
    // (Every box he can reach got its turn, when one box at most offers replies.)
    if (intro.boxes.filter((b) => b.choices?.length).length <= 1)
      expect(reachable(intro).filter((id) => !checked.has(id))).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('Play Intro opens the chat box: the toolbar rests, he turns to talk, the line types, a tap finishes it and the next goes on', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const intro = await script(page);
    await expect(playIntro(page)).toBeVisible();
    expect((await playIntro(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await open(page, true);
    await expect(page.locator('.inv-toolbar')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Wave' })).toBeHidden();
    // The box: along the bottom, the screen's width less a margin, the name tab on it.
    const b = await box(page).boundingBox();
    expect(b.y + b.height).toBeGreaterThan(844 - 60);
    expect(b.width).toBeGreaterThan(390 - 40);
    let s = await snapshot(page);
    expect(s.dialogue.id).toBe(intro.start);
    await expect(page.locator('.inv-talk-name')).toHaveText(s.dialogue.speaker);
    // A screen reader hears the whole line at once.
    await expect(page.locator('.inv-talk-live')).toContainText(s.dialogue.text);
    // Typing (on slow software WebGL the toy's clock runs slow, so it's still typing here), then
    // a tap finishes it: the whole line, the same box, the ▼.
    await until(page, (x) => x.dialogue.shown > 0, 'typing');
    s = await snapshot(page);
    const seq = s.dialogue.seq;
    if (!s.dialogue.typed) {
      await goOn(page, true);
      await until(page, (x) => x.dialogue.typed && x.dialogue.seq === seq, 'a tap finishes the line');
    }
    await expect(page.locator('.inv-talk-next')).toBeVisible();
    expect(await page.locator('.inv-talk-typed').textContent()).toBe(s.dialogue.text);
    // NEWT faces the camera, looking at it.
    await until(page, (x) => x.dialogue.phase === 'on' && x.state === 'talk', 'turned to the camera, talking');
    // The next tap goes on.
    await goOn(page, true);
    await until(page, (x) => x.dialogue.seq === seq + 1, 'the next box');
    await expect(page.locator('[title]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Skip goes to the box with replies; they’re buttons stacked mid-screen, and one goes where it leads', async ({
    page,
  }) => {
    await calm(page);
    const intro = await script(page);
    const ask = intro.boxes.find((b) => b.choices?.length);
    test.skip(!ask, 'this script has no replies');
    await open(page, true);
    await page.getByRole('button', { name: 'Skip', exact: true }).tap();
    await until(page, (s) => s.dialogue.id === ask.id && Boolean(s.dialogue.choices), 'at the replies');
    const replies = page.locator('.inv-talk-choice');
    await expect(replies).toHaveCount(ask.choices.length);
    await expect(replies.first()).toBeFocused();
    const boxes = await replies.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom);
    const mid = (boxes[0].top + boxes.at(-1).bottom) / 2;
    expect(mid).toBeGreaterThan(844 * 0.25);
    expect(mid).toBeLessThan(844 * 0.65);
    for (const r of boxes) expect(Math.abs((r.left + r.right) / 2 - 195)).toBeLessThan(4);
    // A tap off them never passes them.
    await goOn(page, true);
    await until(page, (s) => s.dialogue.id === ask.id, 'still at the replies');
    const pick = ask.choices.length - 1;
    await replies.nth(pick).tap();
    const to = ask.choices[pick].next;
    await until(page, (s) => (s.dialogue ? s.dialogue.id === to : !intro.boxes.some((b) => b.id === to)), 'its box');
  });

  test('Auto goes on by itself, box after box', async ({ page }) => {
    await calm(page);
    await open(page, true);
    const auto = page.getByRole('button', { name: 'Auto', exact: true });
    await auto.tap();
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    const seq = (await snapshot(page)).dialogue.seq;
    await until(
      page,
      (s) => !s.dialogue || s.dialogue.seq >= seq + 2 || Boolean(s.dialogue.choices),
      'on by itself',
      60_000,
    );
  });

  test('the Log lists the lines shown and closes again; the intro waits meanwhile', async ({ page }) => {
    await calm(page);
    await open(page, true);
    const seen = [];
    for (let i = 0; i < 3; i++) {
      const s = await snapshot(page);
      if (!s.dialogue || s.dialogue.choices) break;
      if (!seen.includes(s.dialogue.text)) seen.push(s.dialogue.text);
      await goOn(page, true);
    }
    const s = await snapshot(page);
    if (s.dialogue && !seen.includes(s.dialogue.text)) seen.push(s.dialogue.text);
    await page.getByRole('button', { name: 'Log', exact: true }).tap();
    const log = page.getByRole('dialog', { name: 'Log' });
    await expect(log).toBeVisible();
    await expect(log.getByRole('button', { name: 'Close' })).toBeFocused();
    const items = log.locator('li');
    expect(await items.count()).toBe(s.dialogue.log);
    for (const text of seen) await expect(log).toContainText(text);
    await until(page, (x) => x.dialogue.paused && x.dialogue.logOpen, 'paused under the Log');
    // (A tap in the Log never goes on.)
    await log.locator('li').first().tap();
    expect((await snapshot(page)).dialogue.seq).toBe(s.dialogue.seq);
    await log.getByRole('button', { name: 'Close' }).tap();
    await expect(log).toBeHidden();
    await expect(page.getByRole('button', { name: 'Log', exact: true })).toBeFocused();
    await until(page, (x) => !x.dialogue.paused, 'on again');
  });

  test('each box’s shot moves the camera: close nearer than medium, medium nearer than wide', async ({ page }) => {
    await calm(page);
    const home = (await snapshot(page)).cameraHome.distance;
    await open(page, true);
    /** @type {Record<string, number>} */
    const at = {};
    for (let i = 0; i < 40; i++) {
      const s = await snapshot(page);
      if (!s.dialogue) break;
      const shot = s.dialogue.shot;
      if (shot && !(shot in at)) {
        await until(
          page,
          (x) =>
            !x.dialogue || Math.abs(x.camera.distance - x.dialogue.goal.distance) < 0.02 * x.dialogue.goal.distance,
          `the camera at the ${shot} shot`,
        );
        const now = await snapshot(page);
        if (now.dialogue?.shot === shot) at[shot] = now.camera.distance;
      }
      if (s.dialogue.choices) await page.locator('.inv-talk-choice').first().tap();
      else await goOn(page, true);
    }
    const shots = Object.keys(at);
    expect(shots.length, `shots seen: ${JSON.stringify(at)}`).toBeGreaterThanOrEqual(2);
    if (at.close && at.medium) expect(at.close).toBeLessThan(at.medium);
    if (at.medium && at.wide) expect(at.medium).toBeLessThan(at.wide);
    if (at.close) expect(at.close).toBeLessThan(home * 0.6);
    if (at.wide) expect(Math.abs(at.wide - home)).toBeLessThan(home * 0.05);
  });

  test('after the end the toolbar, the camera and his free play come back', async ({ page }) => {
    await calm(page);
    const home = (await snapshot(page)).camera;
    await open(page, true);
    for (let i = 0; i < 40; i++) {
      const s = await snapshot(page);
      if (!s.dialogue) break;
      if (s.dialogue.choices) await page.locator('.inv-talk-choice').first().tap();
      else await page.getByRole('button', { name: 'Skip', exact: true }).tap();
    }
    await expect(box(page)).toBeHidden();
    await expect(page.locator('.inv-toolbar')).toBeVisible();
    await until(page, (s) => s.state !== 'talk' && s.buttonsEnabled && !s.toolbarTalking, 'back to play');
    await expect(playIntro(page)).toBeEnabled();
    await until(
      page,
      (s) => Math.abs(s.camera.distance - home.distance) < 0.02 * home.distance && !s.camera.turning,
      'the camera back where it was',
    );
    // (Its close shots aren't the visitor's zoom: he never remarks on being so close.)
    expect((await snapshot(page)).talk.showing?.trigger ?? null).not.toBe('zoom');
    expect((await snapshot(page)).talk.ready.zoom ?? null, 'the zoom line never came up').toBe(null);
    // Free play: a tap on him reacts again.
    await until(page, (s) => s.state === 'idle', 'idle');
    const head = await page.evaluate(() => window.__invitation.screen('head'));
    await page.touchscreen.tap(head.x, head.y);
    await until(page, (s) => s.state === 'react', 'a tap makes him react');
  });

  test('Play Intro rests while he’s held', async ({ page }) => {
    await calm(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, points = []) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 })),
      });
    const body = await page.evaluate(() => window.__invitation.screen('body'));
    await touch('touchStart', [body]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: body.x + i * 4, y: body.y - i * 6 }]);
    await until(page, (s) => s.held, 'held');
    await expect(playIntro(page)).toBeDisabled();
    await touch('touchEnd');
    await until(page, (s) => s.state === 'idle', 'down again');
    await expect(playIntro(page)).toBeEnabled();
  });
});

test.describe('on a desktop', () => {
  test('a click goes on; Space and Enter go on; Escape asks before skipping, and a second Escape ends it', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    await open(page);
    await expect(page.locator('.inv-talk')).toBeFocused();
    const seqOf = async () => (await snapshot(page)).dialogue?.seq ?? -1;
    const next = async (press) => {
      const s = await snapshot(page);
      if (s.dialogue.choices) return;
      // (Finished, then on: a press or two.)
      await press();
      if (!(await snapshot(page)).dialogue?.typed) await press();
      if ((await seqOf()) === s.dialogue.seq) await press();
      await until(page, (x) => !x.dialogue || x.dialogue.seq > s.dialogue.seq, 'on to the next box');
    };
    await next(() => goOn(page));
    await next(() => page.keyboard.press('Space'));
    await next(() => page.keyboard.press('Enter'));
    await page.keyboard.press('Escape');
    const ask = page.getByRole('alertdialog');
    await expect(ask).toBeVisible();
    await expect(ask.getByRole('button', { name: 'Keep Watching' })).toBeFocused();
    await until(page, (s) => s.dialogue.asking && s.dialogue.paused, 'asking, paused');
    await page.keyboard.press('Enter');
    await expect(ask).toBeHidden();
    await until(page, (s) => Boolean(s.dialogue) && !s.dialogue.paused, 'kept watching');
    await page.keyboard.press('Escape');
    await expect(ask).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(box(page)).toBeHidden();
    await until(page, (s) => !s.dialogue && s.state !== 'talk', 'ended');
    await expect(playIntro(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('the box sits along the bottom under his face, the replies over him, and Auto, Skip and Log at the top right', async ({
    page,
  }) => {
    await calm(page);
    await open(page);
    const b = await box(page).boundingBox();
    expect(b.y + b.height).toBeGreaterThan(800 - 80);
    expect(Math.abs(b.x + b.width / 2 - 640)).toBeLessThan(4);
    const top = await page.locator('.inv-talk-top').boundingBox();
    expect(top.x + top.width).toBeGreaterThan(1280 - 40);
    expect(top.y).toBeLessThan(40);
    // His head shows over the box once the shot's there.
    await until(
      page,
      (s) => Math.abs(s.camera.distance - s.dialogue.goal.distance) < 0.02 * s.dialogue.goal.distance,
      'at the shot',
    );
    const head = await page.evaluate(() => window.__invitation.screen('head'));
    expect(head.y + head.r).toBeLessThan(b.y);
    expect(head.y - head.r).toBeGreaterThan(top.y + top.height - 20);
  });

  test('with reduced motion each line shows at once and the camera cuts to its shot', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await calm(page);
    await open(page);
    let s = await snapshot(page);
    expect(s.dialogue.typed, 'the whole line at once').toBe(true);
    for (let i = 0; i < 12 && s.dialogue && !s.dialogue.choices; i++) {
      await goOn(page);
      await until(page, (x) => !x.dialogue || x.dialogue.seq > s.dialogue.seq, 'on');
      s = await snapshot(page);
      if (!s.dialogue) break;
      expect(s.dialogue.typed).toBe(true);
      if (s.dialogue.camera !== 'keep')
        expect(Math.abs(s.camera.distance - s.dialogue.goal.distance)).toBeLessThan(0.01 * s.dialogue.goal.distance);
    }
  });
});
