// Replay Intro, the invitation toy's chat (/invitation/), in a real browser on the production build,
// on a phone (390×844, touch) and a desktop (1280×800): the button opens the chat box over the
// stage (the toolbar rests out of sight, NEWT goes into his talk state and turns to the camera);
// out near the edge the first line waits until he's walked in and turned (then its line, face and
// gesture begin together); the line types out, a tap finishes it and the next tap goes on; Next
// (top right) goes to the box with replies, which show as buttons stacked mid-screen under his face, take no
// press until the presses that went on have settled, and picking one goes where it leads; Auto
// goes on by itself; the Log lists the lines shown and closes again; each box's shot sends the
// camera nearer or further (close nearer than wide), framed over the box as its own line has it
// and again when the box grows; Escape asks before it skips the intro and a second Escape ends
// it, while Skip Intro, on screen all through, ends it at once with no question; a line's own
// line breaks show; a line's text effects ({red,wave|…}) type out styled while the live region and
// the Log read it plain, in the bubble too, and a shaken or waved word stays legible (no letter
// ever runs more than a pixel into the next, every step of its moves measured); Space and Enter go on (after a click on Auto, Next or
// Log too); under the Log or the
// question the buttons over the stage are out of reach; reduced motion shows each line at once
// and cuts the camera (round to the front, to each shot, back at the end); and after the end the
// toolbar, the camera and his free play come back. The script is read from the page (?test's
// intro()). Tests requiring a specific script shape install a fixture; the admin integration
// tests exercise the current content. Every wait is on a state (the script as
// content.js reads it). Down every reply each box shows its face (the four dialogue faces from
// their own sheets) and plays its animation.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { routeToEnd } from './helpers/dialogue-route.mjs';

// A deliberate mix of line lengths, shots and branches, independent of admin edits.
const behaviorIntro = JSON.parse(readFileSync(new URL('./fixtures/invitation-intro.json', import.meta.url), 'utf8'));
const useBehaviorIntro = (page) => page.evaluate((intro) => window.__invitation.setIntro(intro), behaviorIntro);

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
/** The script Replay Intro runs (the admin's, or the placeholder). */
const script = (page) => page.evaluate(() => window.__invitation.intro());
const replayIntro = (page) => page.getByRole('button', { name: 'Replay Intro', exact: true });
const box = (page) => page.locator('.inv-talk-box');
/** The letters of the chat box's line that show (typed: the rest keep their place, unseen). */
const shownLine = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.inv-talk-typed .inv-fx:not(.is-unseen)')].map((e) => e.textContent).join(''),
  );
/** Opens the intro and waits for its first box, with him turned and talking (its line begun). */
async function open(page, tap = false) {
  if (tap) await replayIntro(page).tap();
  else await replayIntro(page).click();
  await expect(box(page)).toBeVisible();
  await until(page, (s) => s.dialogue && s.state === 'talk' && !s.dialogue.waiting, 'the intro under way');
}
/** A tap (or click) on empty space over the stage: off every button, over NEWT's head. */
async function goOn(page, touch = false) {
  const vp = page.viewportSize();
  const at = { x: vp.width * 0.18, y: vp.height * 0.3 };
  if (touch) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}
/**
 * The clip a box's animation shows as in the snapshot's dialogue.clips: Idle plays as the gait,
 * Sit sits him down first; none keeps what he does (null: nothing to see).
 * @param {string} a
 */
const clipFor = (a) => (a === 'none' ? null : a === 'Idle' ? 'gait' : a === 'Sit' ? 'SitDown' : a);
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

/**
 * Picks reply `i` once the replies show and have settled (dialogueUi.js REPLY_SETTLE: a press
 * straight after the one that finished the line goes nowhere).
 */
async function pick(page, i, tap = false) {
  await until(page, (s) => Boolean(s.dialogue?.repliesLive), 'the replies settled');
  const reply = page.locator('.inv-talk-choice').nth(i);
  if (tap) await reply.tap();
  else await reply.click();
}
/** Finish the actual admin script by choosing a path to an ending, including cyclic menus. */
async function finishIntro(page, tap = false) {
  const intro = await script(page);
  for (let i = 0; i < intro.boxes.length * 2; i++) {
    const s = (await snapshot(page)).dialogue;
    if (!s) return;
    const route = routeToEnd(intro, s.id);
    const current = intro.boxes.find((b) => b.id === s.id);
    if (!s.typed) {
      await goOn(page, tap);
      await until(page, (x) => Boolean(x.dialogue?.typed), 'the current line revealed');
    }
    if (current.choices?.length) {
      await pick(
        page,
        current.choices.findIndex((c) => c.next === route[1]),
        tap,
      );
    } else await goOn(page, tap);
    await until(page, (x) => !x.dialogue || x.dialogue.seq > s.seq, 'following a route to the ending');
  }
  throw new Error('Dialogue did not finish along its route to an ending');
}

/**
 * The box with replies, and the one a tap goes on to it from (null: none).
 * @param {any} intro
 */
function askAndBefore(intro) {
  const ask = intro.boxes.find((b) => b.choices?.length);
  const before = ask
    ? intro.boxes.find(
        (b, i) => !b.choices?.length && !b.end && (b.next ? b.next === ask.id : intro.boxes[i + 1]?.id === ask.id),
      )
    : null;
  return { ask, before };
}
/**
 * At the box with replies (Next goes there), once they show and the camera's at its shot: his
 * head is over the replies, clear of them and of the Auto row, and the shot was framed over them
 * from the box's start (they don't move it as they show).
 */
async function repliesClearOfHim(page, tap) {
  const intro = await script(page);
  const ask = intro.boxes.find((b) => b.choices?.length);
  test.skip(!ask, 'this script has no replies');
  await open(page, tap);
  const next = page.getByRole('button', { name: 'Next', exact: true });
  if (tap) await next.tap();
  else await next.click();
  await until(page, (s) => s.dialogue.id === ask.id && Boolean(s.dialogue.choices), 'at the replies');
  // Distance can already match while the shot is still tilting or raising its target.
  // Measure the head, camera and overlay together, and wait for the actual framing.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = window.__invitation.snapshot();
          const head = window.__invitation.screen('head');
          const replies = document.querySelector('.inv-talk-choices').getBoundingClientRect();
          const top = document.querySelector('.inv-talk-top').getBoundingClientRect();
          return {
            atShot:
              !s.camera.turning &&
              Math.abs(s.camera.distance - s.dialogue.goal.distance) < 0.01 * s.dialogue.goal.distance,
            framedOverReplies: Math.abs(s.dialogue.framed.bottom - replies.top) < 1.5,
            headAboveReplies: head.y + head.r < replies.top,
            headBelowToolbar: head.y - head.r > top.bottom - 20,
            headLargeEnough: head.r > 30,
          };
        }),
      { message: 'the settled shot frames his head between the toolbar and replies', timeout: 30_000 },
    )
    .toEqual({
      atShot: true,
      framedOverReplies: true,
      headAboveReplies: true,
      headBelowToolbar: true,
      headLargeEnough: true,
    });
}

test.describe('the admin’s intro', () => {
  test('Replay Intro plays content.json’s invitation.intro, box for box', async ({ page }) => {
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

  test('down every reply, each box shows its face and plays its animation', async ({ page }) => {
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
          const clip = clipFor(b.animation);
          if (clip)
            await until(
              page,
              (x) => x.dialogue?.id === b.id && x.dialogue.clips.includes(clip),
              `${b.id}: ${b.animation} plays`,
            );
          checked.add(b.id);
        }
        // On: this run's reply (or the last there is), else a click or two (finished, then on).
        const seq = s.dialogue.seq;
        if (b.choices?.length) {
          await pick(page, Math.min(run, b.choices.length - 1));
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

/** The lines the moving text checks type: a shake beside a space, waves, both on one word, a big one. */
const MOVING = {
  box: '{#e44544,wave|Hey} there, {big|friend}! I {shake|really} {#c9822a,bold|love} {#3a7bd5,wave,shake|parties}.',
  bubble: '{#c8323c,wave|Hi!} I’m {big|NEWT}, and I {shake|really} {#c9822a,bold|like} {#3a7bd5,wave,shake|you}.',
};
/**
 * How far a styled line's letters run into the next one on their line, CSS px, at its worst
 * through two seconds of their moves: every animation on its letters paused and stepped through
 * together 5 ms at a time (each keeps its stagger), each letter's drawn box against the next one's,
 * a space's too. With the letters that move, how many run both moves at once, and the moves seen,
 * so a still line can't pass.
 * @param {import('@playwright/test').Page} page
 * @param {string} sel  the line's container
 */
const crowding = (page, sel) =>
  page.evaluate(async (container) => {
    await document.fonts.ready;
    const letters = [...document.querySelectorAll(`${container} .inv-fx`)];
    const anims = document.getAnimations().filter((a) => letters.includes(/** @type {any} */ (a.effect)?.target));
    const size = parseFloat(getComputedStyle(letters[0]).fontSize);
    let worst = { px: -Infinity, ms: 0, pair: '' };
    for (const a of anims) a.pause();
    try {
      for (let ms = 0; ms <= 2000; ms += 5) {
        for (const a of anims) a.currentTime = ms;
        const r = letters.map((e) => e.getBoundingClientRect());
        for (let k = 1; k < r.length; k++) {
          const [a, b] = [r[k - 1], r[k]];
          // (Not on the next line: back at its start, or a line down.)
          if (b.left < a.left - size / 2 || Math.abs(a.top + a.bottom - b.top - b.bottom) / 2 > size / 2) continue;
          if (a.right - b.left > worst.px)
            worst = { px: a.right - b.left, ms, pair: `${letters[k - 1].textContent}|${letters[k].textContent}` };
        }
      }
    } finally {
      for (const a of anims) a.play();
    }
    return {
      worst,
      moving: new Set(anims.map((a) => /** @type {any} */ (a.effect).target)).size,
      both: letters.filter((e) => anims.filter((a) => /** @type {any} */ (a.effect).target === e).length > 1).length,
      moves: [...new Set(anims.map((a) => /** @type {any} */ (a).animationName))].sort(),
    };
  }, sel);
/** A shaken word reads: no letter in the bubble or the box ever runs more than a pixel into the next. */
async function movesStayLegible(page, tap) {
  const errors = watch(page);
  await calm(page);
  // (Both on one letter: the wave on its translate, the shake on its transform, two animations.)
  const all = ['inv-fx-shake', 'inv-fx-wave'];
  await page.evaluate((line) => window.__invitation.say(line), MOVING.bubble);
  await expect(page.locator('.inv-bubble')).toBeVisible();
  await expect(page.locator('.inv-bubble-typed .inv-fx')).not.toHaveCount(0);
  await expect(page.locator('.inv-bubble-typed .inv-fx.is-unseen')).toHaveCount(0);
  const inBubble = await crowding(page, '.inv-bubble-typed');
  expect(inBubble.moves, 'the bubble: wave and shake').toEqual(all);
  expect(inBubble.moving).toBe(Array.from('Hi!reallyyou').length);
  expect(inBubble.both, 'the bubble: “you” waves and shakes').toBe(3);
  expect(inBubble.worst.px, `the bubble: ${JSON.stringify(inBubble.worst)}`).toBeLessThanOrEqual(1);
  const intro = structuredClone(behaviorIntro);
  intro.boxes.find((b) => b.id === intro.start).text = MOVING.box;
  await page.evaluate((i) => window.__invitation.setIntro(i), intro);
  await open(page, tap);
  await goOn(page, tap);
  await until(page, (x) => x.dialogue.typed, 'the line up');
  const inBox = await crowding(page, '.inv-talk-typed');
  expect(inBox.moves, 'the box: wave and shake').toEqual(all);
  expect(inBox.moving).toBe(Array.from('Heyreallyparties').length);
  expect(inBox.both, 'the box: “parties” waves and shakes').toBe(7);
  expect(inBox.worst.px, `the box: ${JSON.stringify(inBox.worst)}`).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
}

/** An intro whose name, line, replies and second name carry tags (the test's own words). */
const TAGGED_INTRO = {
  speaker: '{gold,wave|Newt}',
  start: 'a',
  boxes: [
    {
      id: 'a',
      speaker: '',
      text: 'So {italic|very} happy.',
      face: 'happy',
      animation: 'Talk',
      camera: 'medium',
      next: '',
      end: false,
      auto: 0,
      choices: [
        { label: '{red,italic|Yes}!', next: 'b' },
        { label: '{bold|No}', next: 'b' },
      ],
    },
    {
      id: 'b',
      speaker: '{#3a7bd5,italic|Narrator}',
      text: 'Done.',
      face: 'neutral',
      animation: 'none',
      camera: 'keep',
      next: '',
      end: true,
      auto: 0,
      choices: [],
    },
  ],
};
/**
 * Tags in a reply and a name show styled (the name tab, the reply buttons, the Log's names and
 * replies), while a screen reader gets them plain (the live region, the buttons' names, the
 * Log's own plain text); an italic word's letters slant about -10 deg, each keeping its width.
 */
async function tagsShowStyled(page, tap) {
  const errors = watch(page);
  await calm(page);
  await page.evaluate((i) => window.__invitation.setIntro(i), TAGGED_INTRO);
  await open(page, tap);
  const name = page.locator('.inv-talk-name');
  await expect(name).toHaveText('Newt');
  await expect(name).toHaveAttribute('aria-hidden', 'true');
  await expect(name.locator('.inv-fx-wave').first()).toHaveCSS('color', 'rgb(201, 130, 42)');
  await expect(page.locator('.inv-talk-live')).toHaveText('Newt: So very happy.');
  await goOn(page, tap);
  await until(page, (x) => x.dialogue.typed, 'the line up');
  // Italic: each letter slanted in place (a skew about -10 deg), as wide as it is upright.
  const slant = await page.evaluate(() => {
    const letters = [...document.querySelectorAll('.inv-talk-typed .inv-fx-italic')];
    return letters.map((e) => {
      const c = getComputedStyle(e);
      const m = new DOMMatrix(c.transform);
      const upright = document.createElement('span');
      upright.className = 'inv-fx';
      upright.textContent = e.textContent;
      e.after(upright);
      const widths = [e.getBoundingClientRect().width, upright.getBoundingClientRect().width];
      upright.remove();
      // (Its layout box: offsetWidth is the box before the transform.)
      return {
        ch: e.textContent,
        display: c.display,
        skew: (Math.atan(m.c) * 180) / Math.PI,
        box: e.offsetWidth,
        upright: widths[1],
      };
    });
  });
  expect(slant.map((l) => l.ch).join('')).toBe('very');
  for (const l of slant) {
    expect(l.display).toBe('inline-block');
    expect(l.skew).toBeGreaterThan(-12);
    expect(l.skew).toBeLessThan(-8);
    expect(Math.abs(l.box - l.upright), `${l.ch} keeps its width`).toBeLessThan(1);
  }
  // The replies: styled words, plain names.
  await until(page, (x) => Boolean(x.dialogue?.choices), 'the replies');
  const yes = page.getByRole('button', { name: 'Yes!', exact: true });
  await expect(yes).toBeVisible();
  await expect(yes.locator('.inv-fx-italic').first()).toHaveCSS('color', 'rgb(200, 50, 60)');
  await expect(yes).toHaveText('Yes!');
  await expect(page.getByRole('button', { name: 'No', exact: true }).locator('.inv-fx-bold')).toHaveCount(2);
  await pick(page, 0, tap);
  await until(page, (x) => x.dialogue?.id === 'b', 'on to b');
  await expect(name).toHaveText('Narrator');
  await expect(name.locator('.inv-fx-italic').first()).toHaveCSS('color', 'rgb(58, 123, 213)');
  // The Log: the names and the reply styled, read plain, never a tag.
  const logBtn = page.getByRole('button', { name: 'Log', exact: true });
  if (tap) await logBtn.tap();
  else await logBtn.click();
  const list = page.locator('.inv-talk-log-list');
  await expect(list.locator('.inv-talk-log-who .inv-talk-styled .inv-fx-wave').first()).toHaveCSS(
    'color',
    'rgb(201, 130, 42)',
  );
  await expect(list.locator('.inv-talk-log-reply .inv-talk-styled .inv-fx-italic')).toHaveCount(3);
  await expect(list.locator('.inv-talk-log-reply .inv-talk-sr')).toHaveText('Yes!');
  await expect(list).not.toContainText('{');
  expect(await list.locator('.inv-talk-styled').first().getAttribute('aria-hidden')).toBe('true');
  expect(errors).toEqual([]);
}

test.describe('on a phone', () => {
  test('tags in a reply and a name show styled, read plain; an italic word slants in place', async ({ page }) => {
    await tagsShowStyled(page, true);
  });

  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('a shaken or waved word stays legible: no letter runs more than a pixel into the next, in the bubble or the box', async ({
    page,
  }) => {
    await movesStayLegible(page, true);
  });

  test('Replay Intro opens the chat box: the toolbar rests, he turns to talk, the line types, a tap finishes it and the next goes on', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const intro = await script(page);
    await expect(replayIntro(page)).toBeVisible();
    expect((await replayIntro(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
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
    expect(await shownLine(page)).toBe(s.dialogue.text);
    // NEWT faces the camera, looking at it.
    await until(page, (x) => x.dialogue.phase === 'on' && x.state === 'talk', 'turned to the camera, talking');
    // The next tap goes on.
    await goOn(page, true);
    await until(page, (x) => x.dialogue.seq === seq + 1, 'the next box');
    await expect(page.locator('[title]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('out near the edge, the first line waits for him: walked in and turned, its line, face and gesture begin together', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const intro = await script(page);
    const first = intro.boxes.find((b) => b.id === intro.start);
    // A floor tap out by the screen's right edge, level with his feet: he walks out there.
    const feet = await page.evaluate(() => window.__invitation.screen('feet'));
    const far = { x: 390 - 24, y: feet.y };
    expect(await page.evaluate(({ x, y }) => window.__invitation.floorAt(x, y), far)).not.toBe(null);
    await page.touchscreen.tap(far.x, far.y);
    await until(page, (s) => s.state === 'walk', 'walking out');
    await until(page, (s) => s.state === 'idle', 'there');
    // Every frame from Replay Intro on: what the screen shows against what he's doing.
    await page.evaluate(() => {
      const rec = (window.__rec = []);
      const tick = () => {
        const s = window.__invitation.snapshot();
        const d = s.dialogue;
        if (d)
          rec.push({
            phase: d.phase,
            waiting: d.waiting,
            id: d.id,
            seq: d.seq,
            shown: d.shown,
            typed: d.typed,
            clips: d.clips,
            face: s.face,
            text: [...document.querySelectorAll('.inv-talk-typed .inv-fx:not(.is-unseen)')]
              .map((e) => e.textContent)
              .join(''),
            next: !document.querySelector('.inv-talk-next')?.hidden,
          });
        if (rec.length < 2000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await replayIntro(page).tap();
    await until(page, (s) => s.dialogue?.phase === 'walk', 'walking in');
    // (A tap meanwhile finishes nothing: the line hasn't begun.)
    await goOn(page, true);
    const clip = clipFor(first.animation);
    await until(
      page,
      (s) => s.dialogue?.phase === 'on' && (!clip || s.dialogue.clips.includes(clip)),
      'in place, its gesture under way',
    );
    await until(page, (s) => s.dialogue.typed, 'its line typed');
    const rec = await page.evaluate(() => window.__rec);
    const on = rec.findIndex((r) => r.phase === 'on');
    expect(on, 'he got into place').toBeGreaterThan(0);
    expect(rec.slice(0, on).some((r) => r.phase === 'walk')).toBe(true);
    for (const r of rec.slice(0, on)) {
      expect(r.id, 'still the first box').toBe(first.id);
      expect([r.shown, r.typed, r.text, r.next], `${r.phase}: nothing of the line yet`).toEqual([0, false, '', false]);
      if (first.face !== 'neutral') expect(r.face, `${r.phase}: the box’s face waits`).not.toBe(first.face);
    }
    const after = rec.slice(on).filter((r) => r.seq === rec[on].seq);
    expect(after[0].id).toBe(first.id);
    if (clip) expect(after.at(-1).clips, 'its gesture played').toContain(clip);
    expect(after.at(-1).face).toBe(first.face);
    expect(errors).toEqual([]);
  });

  test('Next goes to the box with replies; they’re buttons stacked mid-screen, and one goes where it leads', async ({
    page,
  }) => {
    await calm(page);
    const intro = await script(page);
    const ask = intro.boxes.find((b) => b.choices?.length);
    test.skip(!ask, 'this script has no replies');
    await open(page, true);
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
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
    const last = ask.choices.length - 1;
    await pick(page, last, true);
    const to = ask.choices[last].next;
    await until(page, (s) => (s.dialogue ? s.dialogue.id === to : !intro.boxes.some((b) => b.id === to)), 'its box');
  });

  test('the replies show under his face: the shot frames him over them', async ({ page }) => {
    await calm(page);
    await repliesClearOfHim(page, true);
  });

  test('a quick second tap where the replies pop in picks none; a tap once they’ve settled does', async ({ page }) => {
    await page.clock.install();
    await calm(page);
    const intro = await script(page);
    const { ask, before } = askAndBefore(intro);
    test.skip(!ask || !before, 'no box goes on to the replies');
    await open(page, true);
    // (On to the box before the question, its line up.)
    for (let i = 0; i < 30; i++) {
      const s = await snapshot(page);
      if (s.dialogue.id === before.id && s.dialogue.typed) break;
      await goOn(page, true);
      await until(page, (x) => x.dialogue.typed || x.dialogue.seq !== s.dialogue.seq, 'on');
    }
    await until(page, (s) => s.dialogue.id === before.id && s.dialogue.typed, 'just before the question');
    // Native taps at a controlled interval, regardless of software-rendering or protocol latency.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
    // On to the question; then a tap where its first reply will show (laid out already, out of
    // sight) finishes its line, and one more 150 ms later lands on the reply.
    await goOn(page, true);
    await until(page, (s) => s.dialogue.id === ask.id, 'at the question');
    const spot = await page
      .locator('.inv-talk-choice')
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    const log = (await snapshot(page)).dialogue.log;
    await page.touchscreen.tap(spot.x, spot.y);
    await until(page, (s) => Boolean(s.dialogue.choices), 'its replies');
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? '', spot);
    expect(hit, 'the spot is a reply now').toContain('inv-talk-choice');
    await page.clock.runFor(150);
    await page.touchscreen.tap(spot.x, spot.y);
    await page.clock.runFor(16);
    let s = await snapshot(page);
    expect([s.dialogue.id, s.dialogue.log], 'still the question').toEqual([ask.id, log]);
    // Settled, a tap picks it.
    await page.clock.runFor(s.replySettle);
    await pick(page, 0, true);
    const to = ask.choices[0].next;
    await until(page, (x) => (x.dialogue ? x.dialogue.id === to : true), 'its box');
    s = await snapshot(page);
    // (The reply picked, then its box's line.)
    if (s.dialogue) expect(s.dialogue.log).toBe(log + 2);
    await page.clock.resume();
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
    // Own the script shape and the expected visible words: the Log strips styling tags.
    const lines = [
      { text: '{#c8323c,wave|Hello} from {bold|NEWT}.', plain: 'Hello from NEWT.' },
      { text: 'A {shake|second} line.', plain: 'A second line.' },
      { text: 'See you there.', plain: 'See you there.' },
      { text: 'Until next time.', plain: 'Until next time.' },
    ];
    await page.evaluate(
      (fixtureLines) =>
        window.__invitation.setIntro({
          speaker: 'NEWT',
          start: 'log-0',
          boxes: fixtureLines.map(({ text }, i) => ({
            id: `log-${i}`,
            text,
            face: 'happy',
            animation: 'Talk',
            camera: 'close',
            next: i + 1 < fixtureLines.length ? `log-${i + 1}` : '',
            end: i === fixtureLines.length - 1,
          })),
        }),
      lines,
    );
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
    for (const text of seen) await expect(log).toContainText(lines.find((line) => line.text === text).plain);
    await expect(items.first()).toContainText('Hello from NEWT.');
    await expect(log).not.toContainText('{');
    await until(page, (x) => x.dialogue.paused && x.dialogue.logOpen, 'paused under the Log');
    // (A tap in the Log never goes on.)
    await log.locator('li').first().tap();
    expect((await snapshot(page)).dialogue.seq).toBe(s.dialogue.seq);
    await log.getByRole('button', { name: 'Close' }).tap();
    await expect(log).toBeHidden();
    // A reply is the keyboard destination when choices are visible; otherwise the layer.
    const destination = (await snapshot(page)).dialogue.choices
      ? page.locator('.inv-talk-choice').first()
      : page.locator('.inv-talk');
    await expect(destination).toBeFocused();
    await until(page, (x) => !x.dialogue.paused, 'on again');
  });

  test('under the open Log or the Skip question, Auto, Next and Log are out of reach', async ({ page }) => {
    await calm(page);
    await open(page, true);
    const centre = (name) =>
      page.getByRole('button', { name, exact: true }).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    const at = { auto: await centre('Auto'), skip: await centre('Next') };
    /** Taps where Auto and Next are: nothing moves on and Auto stays off. */
    const tapsDoNothing = async (why) => {
      const before = (await snapshot(page)).dialogue;
      await page.touchscreen.tap(at.skip.x, at.skip.y);
      await page.touchscreen.tap(at.auto.x, at.auto.y);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
      const s = (await snapshot(page)).dialogue;
      expect([s.seq, s.log, s.auto], `${why}: Next and Auto out of reach`).toEqual([before.seq, before.log, false]);
      await expect(page.locator('.inv-talk-top')).toHaveAttribute('inert', '');
    };
    // The Log.
    await page.getByRole('button', { name: 'Log', exact: true }).tap();
    const log = page.getByRole('dialog', { name: 'Log' });
    await expect(log).toBeVisible();
    await tapsDoNothing('under the Log');
    await expect(log.locator('li')).toHaveCount((await snapshot(page)).dialogue.log);
    await log.getByRole('button', { name: 'Close' }).tap();
    await expect(log).toBeHidden();
    await expect(page.locator('.inv-talk-top')).not.toHaveAttribute('inert', '');
    // The question (Escape asks it).
    await page.keyboard.press('Escape');
    const ask = page.getByRole('alertdialog');
    await expect(ask).toBeVisible();
    await tapsDoNothing('under the question');
    await expect(ask.getByRole('button', { name: 'Keep Watching' })).toBeFocused();
    await ask.getByRole('button', { name: 'Keep Watching' }).tap();
    await expect(ask).toBeHidden();
    // Back in reach.
    await page.getByRole('button', { name: 'Auto', exact: true }).tap();
    await until(page, (s) => s.dialogue.auto, 'Auto on again');
  });

  test('each box’s shot moves the camera: close nearer than medium, medium nearer than wide', async ({ page }) => {
    await calm(page);
    await useBehaviorIntro(page);
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
      if (s.dialogue.choices) await pick(page, 0, true);
      else await goOn(page, true);
    }
    const shots = Object.keys(at);
    expect(shots.length, `shots seen: ${JSON.stringify(at)}`).toBeGreaterThanOrEqual(2);
    if (at.close && at.medium) expect(at.close).toBeLessThan(at.medium);
    if (at.medium && at.wide) expect(at.medium).toBeLessThan(at.wide);
    if (at.close) expect(at.close).toBeLessThan(home * 0.6);
    if (at.wide) expect(Math.abs(at.wide - home)).toBeLessThan(home * 0.05);
  });

  test('each shot is framed over the chat box as its own line has it, and framed again when the box grows', async ({
    page,
  }) => {
    await calm(page);
    await useBehaviorIntro(page);
    // (The box as tall as its line, not three lines' room: lines of different lengths, boxes of
    // different heights.)
    await page.addStyleTag({ content: '.inv-talk-text { min-height: 0 !important; }' });
    await open(page, true);
    const boxTop = () => box(page).evaluate((el) => el.getBoundingClientRect().top);
    /** The shot's space ends at the chat box showing now (once it has risen into place). */
    const framedOverBox = async (seq) => {
      await until(page, (x) => x.dialogue?.seq === seq && Boolean(x.dialogue.framed), 'framed');
      await expect
        .poll(async () => Math.abs((await boxTop()) - (await snapshot(page)).dialogue.framed.bottom))
        .toBeLessThan(1.5);
    };
    let s = await snapshot(page);
    // The first box's shot, then the box grows under it: framed again over it, further out.
    test.skip(!['close', 'medium'].includes(s.dialogue.camera), 'the first box isn’t a close or medium shot');
    await framedOverBox(s.dialogue.seq);
    await until(
      page,
      (x) => Math.abs(x.camera.distance - x.dialogue.goal.distance) < 0.02 * x.dialogue.goal.distance,
      'at the shot',
    );
    const before = (await snapshot(page)).dialogue;
    const grow = await page.addStyleTag({ content: '.inv-talk-box { padding-top: 200px !important; }' });
    await until(page, (x) => x.dialogue.framed.bottom < before.framed.bottom - 60, 'framed over the taller box');
    await framedOverBox(s.dialogue.seq);
    expect((await snapshot(page)).dialogue.goal.distance).toBeGreaterThan(before.goal.distance);
    await grow.evaluate((el) => el.remove());
    await until(page, (x) => Math.abs(x.dialogue.framed.bottom - before.framed.bottom) < 1.5, 'and back');
    // Box by box: each shot framed for its own line's box, whatever the last one's was (up to the
    // box with replies, framed over them).
    const intro = await script(page);
    const asks = new Set(intro.boxes.filter((b) => b.choices?.length).map((b) => b.id));
    const tops = new Set();
    for (let i = 0; i < 6; i++) {
      s = await snapshot(page);
      if (!s.dialogue || asks.has(s.dialogue.id)) break;
      if (s.dialogue.camera !== 'keep') {
        await framedOverBox(s.dialogue.seq);
        tops.add(Math.round(await boxTop()));
      }
      await goOn(page, true);
      const now = (await snapshot(page)).dialogue;
      if (now?.choices) break;
      if (now?.seq === s.dialogue.seq) await goOn(page, true);
      await until(page, (x) => !x.dialogue || x.dialogue.seq > s.dialogue.seq, 'on');
    }
    expect(tops.size, 'boxes of different heights').toBeGreaterThan(1);
  });

  test('after the end the toolbar, the camera and his free play come back', async ({ page }) => {
    await calm(page);
    const home = (await snapshot(page)).camera;
    await open(page, true);
    await finishIntro(page, true);
    await expect(box(page)).toBeHidden();
    await expect(page.locator('.inv-toolbar')).toBeVisible();
    await until(page, (s) => s.state !== 'talk' && s.buttonsEnabled && !s.toolbarTalking, 'back to play');
    await expect(replayIntro(page)).toBeEnabled();
    // (Focus back on Replay Intro, but tapped to its end: no ring, no label.)
    await expect(replayIntro(page)).toBeFocused();
    expect(await replayIntro(page).evaluate((el) => el.matches(':focus-visible'))).toBe(false);
    await expect(replayIntro(page).locator('.inv-btn-label')).toHaveCSS('opacity', '0');
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

  test('Replay Intro rests while he’s held', async ({ page }) => {
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
    await expect(replayIntro(page)).toBeDisabled();
    await touch('touchEnd');
    await until(page, (s) => s.state === 'idle', 'down again');
    await expect(replayIntro(page)).toBeEnabled();
  });
});

test.describe('on a desktop', () => {
  test('tags in a reply and a name show styled, read plain; an italic word slants in place', async ({ page }) => {
    await tagsShowStyled(page, false);
  });

  test('a shaken or waved word stays legible: no letter runs more than a pixel into the next, in the bubble or the box', async ({
    page,
  }) => {
    await movesStayLegible(page, false);
  });

  test('a click goes on; Space and Enter go on; Escape asks before skipping, and a second Escape ends it', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    await useBehaviorIntro(page);
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
    await expect(replayIntro(page)).toBeFocused();
    // (Ended from the keyboard: its ring shows.)
    expect(await replayIntro(page).evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('Replay Intro replays only the dialogue: no envelope, straight to its first box', async ({ page }) => {
    await calm(page);
    const intro = await script(page);
    await open(page);
    await expect(page.locator('.inv-envelope')).toHaveCount(0);
    expect((await snapshot(page)).dialogue.id).toBe(intro.start);
  });

  test('Skip Intro is on screen all through the intro and ends it at once, with no question', async ({ page }) => {
    const errors = watch(page);
    await calm(page);
    await useBehaviorIntro(page);
    await open(page);
    const skipIntro = page.locator('.inv-talk [data-intro-skip]');
    await expect(skipIntro).toBeVisible();
    await expect(skipIntro).toHaveAccessibleName('Skip Intro');
    // (Still there under the Log.)
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await expect(page.locator('.inv-talk-log')).toBeVisible();
    await expect(skipIntro).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await skipIntro.click();
    await expect(box(page)).toBeHidden();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await until(page, (s) => !s.dialogue && !s.toolbarTalking, 'ended');
    await expect(replayIntro(page)).toBeFocused();
    // (Ended with a click: no ring, and its label stays hidden.)
    expect(await replayIntro(page).evaluate((el) => el.matches(':focus-visible'))).toBe(false);
    await expect(replayIntro(page).locator('.inv-btn-label')).toHaveCSS('opacity', '0');
    expect(errors).toEqual([]);
  });

  test('a styled line types out styled; the live region and the Log read it plain; reduced motion stills it', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const intro = structuredClone(behaviorIntro);
    const first = intro.boxes.find((b) => b.id === intro.start);
    first.text = '{red,wave|Hey} there, {big|friend} {#3a7bd5,bold|NEWT}!';
    const plain = 'Hey there, friend NEWT!';
    await page.evaluate((i) => window.__invitation.setIntro(i), intro);
    await open(page);
    // The live region and the line's length: plain, from the start.
    await expect(page.locator('.inv-talk-live')).toHaveText(`${first.speaker}: ${plain}`);
    const s = await snapshot(page);
    expect(s.dialogue.length).toBe(Array.from(plain).length);
    // Typing: what shows is always the start of the plain line, every letter in its place.
    await until(page, (x) => x.dialogue.shown > 0, 'typing');
    const part = await shownLine(page);
    expect(plain.startsWith(part)).toBe(true);
    expect(await page.locator('.inv-talk-typed .inv-fx').count()).toBe(Array.from(plain).length);
    await goOn(page);
    await until(page, (x) => x.dialogue.typed, 'the line up');
    expect(await shownLine(page)).toBe(plain);
    // Styled: red waving letters (stepped keyframes, staggered), a big word, a bold hex-coloured one.
    const look = await page.evaluate(() => {
      const css = (sel) => {
        const e = document.querySelector(sel);
        const c = getComputedStyle(e);
        return {
          text: e.textContent,
          color: c.color,
          display: c.display,
          animation: c.animationName,
          timing: c.animationTimingFunction,
          delay: c.animationDelay,
          weight: c.fontWeight,
          size: parseFloat(c.fontSize),
        };
      };
      const letters = [...document.querySelectorAll('.inv-talk-typed .inv-fx')];
      const line = parseFloat(getComputedStyle(document.querySelector('.inv-talk-text')).fontSize);
      return {
        first: css('.inv-talk-typed .inv-fx-wave'),
        second: { delay: getComputedStyle(letters[1]).animationDelay },
        big: css('.inv-talk-typed .inv-fx-big'),
        bold: css('.inv-talk-typed .inv-fx-bold'),
        plainLetter: css('.inv-talk-typed > .inv-fx:not(.inv-fx-wave)'),
        word: getComputedStyle(document.querySelector('.inv-talk-typed .inv-fx-word')).whiteSpace,
        line,
      };
    });
    expect(look.first).toMatchObject({
      text: 'H',
      color: 'rgb(200, 50, 60)',
      display: 'inline-block',
      animation: 'inv-fx-wave',
    });
    expect(look.first.timing).toMatch(/steps|step-end/);
    expect(look.second.delay, 'staggered down the line').not.toBe(look.first.delay);
    expect(look.big.size / look.line).toBeCloseTo(1.2, 1);
    expect(look.bold).toMatchObject({ color: 'rgb(58, 123, 213)', weight: '600' });
    expect(look.plainLetter.animation).toBe('none');
    expect(look.word, 'a styled word never breaks').toBe('nowrap');
    // The Log lists it plain.
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    await expect(page.locator('.inv-talk-log-list')).toContainText(plain);
    await expect(page.locator('.inv-talk-log-list')).not.toContainText('{');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    // Reduced motion: the letters stand still.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.inv-talk-typed .inv-fx-wave').first()).toHaveCSS('animation-name', 'none');
    expect(errors).toEqual([]);
  });

  test('his bubble shows a styled line styled, and a screen reader hears it plain', async ({ page }) => {
    const errors = watch(page);
    await calm(page);
    await page.evaluate(() => window.__invitation.say('{red,shake|Hey!} Put me {big|down}.'));
    await expect(page.locator('.inv-bubble-live')).toHaveText('NEWT: Hey! Put me down.');
    await expect(page.locator('.inv-bubble')).toBeVisible();
    const shake = page.locator('.inv-bubble-typed .inv-fx-shake').first();
    await expect(shake).toHaveCSS('color', 'rgb(200, 50, 60)');
    await expect(shake).toHaveCSS('animation-name', 'inv-fx-shake');
    await expect(page.locator('.inv-bubble-typed .inv-fx')).toHaveCount(Array.from('Hey! Put me down.').length);
    expect(errors).toEqual([]);
  });

  test('a line’s own line breaks show as breaks', async ({ page }) => {
    await calm(page);
    const intro = structuredClone(behaviorIntro);
    const first = intro.boxes.find((b) => b.id === intro.start);
    first.text = 'One short line.' + String.fromCharCode(10) + 'And a second one.';
    await page.evaluate((i) => window.__invitation.setIntro(i), intro);
    await open(page);
    await goOn(page);
    await until(page, (s) => s.dialogue?.typed, 'the line up');
    const text = page.locator('.inv-talk-text');
    await expect(text).toHaveCSS('white-space', 'pre-line');
    const lines = await text.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el.querySelector('.inv-talk-typed'));
      return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size;
    });
    expect(lines).toBe(2);
  });

  test('after a click on Auto, Next or Log, Space and Enter still go on; from the keyboard, focus stays on the button', async ({
    page,
  }) => {
    await calm(page);
    await useBehaviorIntro(page);
    await open(page);
    const layer = page.locator('.inv-talk');
    const logBtn = page.getByRole('button', { name: 'Log', exact: true });
    const autoBtn = page.getByRole('button', { name: 'Auto', exact: true });
    const log = page.getByRole('dialog', { name: 'Log' });
    /** Waits for the line, then `key` goes on to the next box (and opens nothing). */
    const goesOn = async (key, why) => {
      await until(page, (s) => s.dialogue.typed && !s.dialogue.paused, `${why}: the line up`);
      const seq = (await snapshot(page)).dialogue.seq;
      await page.keyboard.press(key);
      await until(page, (s) => !s.dialogue || s.dialogue.seq === seq + 1, `${why}: ${key} goes on`);
      await expect(log).toBeHidden();
    };
    // The Log opened with a click and closed with Escape, or with a click on Close.
    await logBtn.click();
    await expect(log).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(log).toBeHidden();
    await expect(layer).toBeFocused();
    await goesOn('Space', 'after the Log and Escape');
    await logBtn.click();
    await log.getByRole('button', { name: 'Close' }).click();
    await expect(layer).toBeFocused();
    await goesOn('Enter', 'after the Log and Close');
    // Auto clicked on: Space goes on, and Auto stays on.
    await autoBtn.click();
    await expect(autoBtn).toHaveAttribute('aria-pressed', 'true');
    await goesOn('Space', 'after Auto');
    await expect(autoBtn).toHaveAttribute('aria-pressed', 'true');
    await autoBtn.click();
    await expect(autoBtn).toHaveAttribute('aria-pressed', 'false');
    // From the keyboard: Tab to the Log, Enter opens it, Escape closes it and focus is back on it.
    await layer.focus();
    for (let i = 0; i < 4 && !(await logBtn.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab');
    await expect(logBtn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(log).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(log).toBeHidden();
    await expect(logBtn).toBeFocused();
  });

  test('the box sits along the bottom under his face, the replies over him, and Auto, Next and Log at the top right', async ({
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

  test('the replies show under his face: the shot frames him over them', async ({ page }) => {
    await calm(page);
    await repliesClearOfHim(page, false);
  });

  test('a press that goes on never picks a reply: Enter or Space a frame apart, or every 250 ms; once they’ve settled one does', async ({
    page,
  }) => {
    const errors = watch(page);
    // Keep native key events, but control the page's clock during the press rhythm: WebGL
    // and protocol round trips on a slow runner must not turn 250 ms into a settled reply.
    // Install before loading so every animation/timer uses the same clock.
    await page.clock.install();
    await calm(page);
    const intro = await script(page);
    const { ask, before } = askAndBefore(intro);
    test.skip(!ask || !before, 'no box goes on to the replies');
    const settle = (await snapshot(page)).replySettle;
    expect(settle, 'the production reply settle').toBe(450);
    for (const key of ['Enter', 'Space']) {
      await open(page);
      for (let i = 0; i < 30; i++) {
        const s = await snapshot(page);
        if (s.dialogue.id === before.id && s.dialogue.typed) break;
        await page.keyboard.press('Enter');
        await until(page, (x) => x.dialogue.typed || x.dialogue.seq !== s.dialogue.seq, 'on');
      }
      await until(page, (s) => s.dialogue.id === before.id && s.dialogue.typed, 'just before the question');
      // Pause ahead of the current time (pauseAt cannot move backwards), before any replies
      // show. Their settle then advances only when this test advances the clock.
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
      // On to the question, its line finished a frame later, and a frame after that one more.
      await page.keyboard.press(key);
      await page.clock.runFor(16);
      await page.keyboard.press(key);
      await until(page, (s) => s.dialogue.id === ask.id && Boolean(s.dialogue.choices), `${key}: its replies`);
      const log = (await snapshot(page)).dialogue.log;
      await page.clock.runFor(16);
      await page.keyboard.press(key);
      await page.clock.runFor(16);
      expect((await snapshot(page)).dialogue.log, `${key}: a frame apart, no reply`).toBe(log);
      // Pressed every 250 ms, as someone reading along does: still none.
      for (let i = 0; i < 6; i++) {
        await page.clock.runFor(250);
        await page.keyboard.press(key);
        const s = await snapshot(page);
        expect([s.dialogue.id, s.dialogue.log], `${key}: press ${i + 1}, no reply`).toEqual([ask.id, log]);
      }
      await page.clock.runFor(16);
      let s = await snapshot(page);
      expect([s.dialogue.id, s.dialogue.log], `${key}: every 250 ms, no reply`).toEqual([ask.id, log]);
      // Settled: the focused reply takes the press.
      await page.clock.runFor(settle);
      await until(page, (x) => Boolean(x.dialogue?.repliesLive), 'settled');
      await expect(page.locator('.inv-talk-choice').first()).toBeFocused();
      await page.keyboard.press(key);
      const to = ask.choices[0].next;
      await until(page, (x) => (x.dialogue ? x.dialogue.id === to : true), `${key}: picked`);
      s = await snapshot(page);
      if (s.dialogue) {
        expect(s.dialogue.log, 'the reply, then its box’s line').toBe(log + 2);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      }
      await page.clock.resume();
      await until(page, (x) => !x.dialogue && x.buttonsEnabled, 'ended');
    }
    expect(errors).toEqual([]);
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

  test('with reduced motion the camera cuts round to the front at the start, and back at the end', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await calm(page);
    // Turned round and zoomed out a little first (a right-drag across, the wheel).
    await page.mouse.move(900, 300);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 8; i++) await page.mouse.move(900 - i * 40, 300);
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, 200);
    await until(page, (s) => !s.camera.turning, 'the view at rest');
    await expect.poll(async () => (await snapshot(page)).camera.distance).toBeGreaterThan(0);
    const before = (await snapshot(page)).camera;
    const home = (await snapshot(page)).cameraHome;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    expect(Math.abs(wrap(before.yaw - home.yaw)), 'turned round').toBeGreaterThan(0.5);
    // Every frame: the camera, and whether the intro's up.
    await page.evaluate(() => {
      const rec = (window.__cam = []);
      const tick = () => {
        const s = window.__invitation.snapshot();
        rec.push({ on: Boolean(s.dialogue), yaw: s.camera.yaw, distance: s.camera.distance });
        if (rec.length < 4000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await replayIntro(page).click();
    await until(page, (s) => Boolean(s.dialogue), 'the intro up');
    await finishIntro(page);
    await until(page, (s) => !s.dialogue, 'over');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    const rec = await page.evaluate(() => window.__cam);
    const first = rec.findIndex((r) => r.on);
    expect(Math.abs(wrap(rec[first].yaw - home.yaw)), 'at the front on its first frame').toBeLessThan(1e-3);
    const back = rec.findIndex((r, i) => i > first && !r.on);
    expect(back, 'it ended').toBeGreaterThan(first);
    expect(Math.abs(wrap(rec[back].yaw - before.yaw)), 'back round on the first frame after').toBeLessThan(1e-3);
    expect(Math.abs(rec[back].distance - before.distance)).toBeLessThan(0.005 * before.distance);
  });
});

test.describe('on a short desktop window', () => {
  test.use({ viewport: { width: 1280, height: 460 } });

  test('the Log scrolls with the mouse wheel once it outgrows the window, and its lines keep "fi" as two letters', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    await useBehaviorIntro(page);
    await open(page);
    // (Most of the intro, a reply picked on the way, stopping short of its last box: enough to
    // outgrow a short window's Log.)
    const intro = await script(page);
    const last = (id) => {
      const i = intro.boxes.findIndex((b) => b.id === id);
      const b = intro.boxes[i];
      return !b || b.end || (!b.next && !b.choices?.length && i === intro.boxes.length - 1);
    };
    for (let i = 0; i < 12; i++) {
      // This checks the Log, not typing speed: reveal each line through the normal
      // advance action, so slow rendered frames do not hold up filling the history.
      await until(page, (s) => !s.dialogue || (!s.dialogue.waiting && !s.dialogue.paused), 'ready to reveal');
      let now = (await snapshot(page)).dialogue;
      if (now && !now.typed) {
        await goOn(page);
        await until(page, (s) => Boolean(s.dialogue?.typed), 'the line revealed');
        now = (await snapshot(page)).dialogue;
      }
      if (!now || last(now.id)) break;
      if (now.choices) await pick(page, 0);
      else await page.keyboard.press('Space');
      await until(page, (s) => !s.dialogue || s.dialogue.seq === now.seq + 1, 'on to the next');
    }
    await page.getByRole('button', { name: 'Log', exact: true }).click();
    const list = page.locator('.inv-talk-log-list');
    await expect(list).toBeVisible();
    const room = await list.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(room, 'the Log outgrows this window').toBeGreaterThan(20);
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const at = await list.evaluate((el) => el.scrollTop);
    const r = await list.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.wheel(0, -400);
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop), { message: 'the wheel scrolls it up' })
      .toBeLessThan(at);
    // (Pixelify Sans's "fi" ligature reads as an "A": the Log's lines draw the two letters.)
    expect(await list.evaluate((el) => getComputedStyle(el).fontVariantLigatures)).toBe('none');
    expect(errors).toEqual([]);
  });
});
