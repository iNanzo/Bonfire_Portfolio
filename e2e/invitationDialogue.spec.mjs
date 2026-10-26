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
// and cuts the camera (round to the front, to each shot, back at the end); and at the end the
// whole screen fades out plainly, out of reach from its first step,
// and the toolbar, the camera and his free play come back. The script is read from the page (?test's
// intro()). Tests requiring a specific script shape install a fixture; the admin integration
// tests exercise the current content. Every wait is on a state (the script as
// content.js reads it). Down every reply each box shows its face (the four dialogue faces from
// their own sheets) and plays its animation. The screen is plain, as before round 18: no dither
// on its buttons (a finger held on one presses it down, as a mouse does), no flash on the box,
// no outline round the words, the replies popping in together, the ▼ bobbing smoothly, and the
// box rising in with a plain fade over a gentle dim. Its one dither: a press that goes on (a
// click, a tap, Space or Enter) or a reply picked dithers the old line out with its name tab
// (and the replies), then the next line in, and only then does it type, so the two never show
// together; Auto and Next change lines at once, and reduced motion fades plainly. The box keeps
// the shape it had before round 18 and grows
// little: on a desktop, a half-width and a half-height window, a phone and a phone held
// sideways, a short line keeps its three rows (two on a short screen) at the height it had then,
// and a long one grows it by a row at most, his head clear over it; a line taller than that
// scrolls inside it (the box keeps its size as it types): it follows the typing, then a finger,
// the wheel or the arrow keys scroll it, with cues where there's more.
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
/**
 * A button (or the box) as drawn: held (.is-pressed), any background image (a dither tile), its
 * words' outline (text-shadow), how far it's moved down (px), and its fill.
 */
const looksOf = (loc) =>
  loc.evaluate((b) => {
    const c = getComputedStyle(b);
    return {
      pressed: b.classList.contains('is-pressed'),
      image: c.backgroundImage,
      shadow: c.textShadow,
      down: new DOMMatrix(c.transform).f + (parseFloat(c.translate.split(' ')[1] ?? '0') || 0),
      fill: c.backgroundColor,
    };
  });
/** A computed colour's red, green and blue, 0 to 255 (rgb(), or color(srgb …) as color-mix gives). */
function rgbOf(c) {
  const rgb = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c);
  if (rgb) return rgb.slice(1, 4).map(Number);
  const srgb = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(c);
  if (srgb) return srgb.slice(1, 4).map((v) => Number(v) * 255);
  throw new Error(`not a colour: ${c}`);
}
/** How light a colour is (luma, 0 to 255). */
const lightOf = (c) => {
  const [r, g, b] = rgbOf(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** How warm a colour is: its red over its blue. */
const warmthOf = (c) => {
  const [r, , b] = rgbOf(c);
  return r - b;
};
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
 * With the page's clock paused (page.clock.pauseAt), runs it on a frame at a time until the
 * replies are on the screen: once the press that brought their box on has dithered it in.
 */
async function runUntilReplies(page) {
  const showing = () =>
    page.evaluate(() => !document.querySelector('.inv-talk-choices:not(.is-ghost)').classList.contains('is-waiting'));
  for (let i = 0; i < 120 && !(await showing()); i++) await page.clock.runFor(16);
  expect(await showing(), 'the replies on the screen').toBe(true);
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
  // (Its words plain on its fill, as before round 18: no outline round them or its styled letters.)
  const shadows = await yes.evaluate((b) =>
    [b, ...b.querySelectorAll('.inv-fx')].map((e) => getComputedStyle(e).textShadow),
  );
  expect(shadows.length).toBeGreaterThan(1);
  for (const shadow of shadows) expect(shadow).toBe('none');
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

/** A long line (the test's own words, about 230 letters): more than a phone's three rows. */
const LONG_LINE =
  'This line runs on and on, far longer than three rows of the box on a phone, so the box grows. ' +
  'It keeps going with more words about nothing much at all, then a few more, and still more, ' +
  'until at last it reaches the very end of it.';
/** A line taller than the box on any screen: 24 short rows of its own (about 180 letters). */
const TALL_LINE = Array.from({ length: 24 }, (_, i) => `Row ${i + 1}.`).join('\n');
/** The long line's view: how far it's scrolled, its room, its height, and the cues. */
const lineView = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('.inv-talk-text');
    const shown = [...document.querySelectorAll('.inv-talk-typed .inv-fx:not(.is-unseen)')];
    const last = shown.at(-1)?.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    return {
      typed: Boolean(window.__invitation.snapshot().dialogue?.typed),
      top: t.scrollTop,
      room: t.scrollHeight - t.clientHeight,
      height: r.height,
      box: document.querySelector('.inv-talk-box').getBoundingClientRect().height,
      newestInView: !last || (last.bottom <= r.bottom + 1 && last.top >= r.top - 1),
      canScroll: t.classList.contains('can-scroll'),
      up: !document.querySelector('.inv-talk-more-up').hidden,
      down: !document.querySelector('.inv-talk-more-down').hidden,
    };
  });
/**
 * A line taller than the box's room (four rows) scrolls in the box: the box keeps
 * its size, the view follows the typing (the newest row in view), and once it's all typed a
 * finger (`tap`) or the wheel and the keys scroll it, with the cues saying where there's more; a
 * tap still goes on.
 */
async function longLineScrolls(page, tap) {
  const errors = watch(page);
  await calm(page);
  const intro = structuredClone(behaviorIntro);
  const first = intro.boxes.find((b) => b.id === intro.start);
  first.text = TALL_LINE;
  first.choices = [];
  await page.evaluate((i) => window.__invitation.setIntro(i), intro);
  await open(page, tap);
  const start = await lineView(page);
  // Typing: the newest letter always in view, the view scrolled down to it by the end.
  for (const part of [0.25, 0.5, 0.75]) {
    await until(page, (x) => x.dialogue.shown >= Math.floor(x.dialogue.length * part), `typed ${part * 100}%`);
    const v = await lineView(page);
    expect(v.newestInView, `the newest row in view at ${part * 100}%`).toBe(true);
    if (!v.typed) expect(v.canScroll, 'not scrollable while it types').toBe(false);
  }
  await until(page, (x) => x.dialogue.typed, 'the line up');
  let v = await lineView(page);
  expect(v.room, 'longer than the box').toBeGreaterThan(10);
  expect(v.top, 'scrolled to its end').toBeGreaterThan(v.room - 2);
  expect(v.box, 'the box keeps its size').toBeCloseTo(start.box, 0);
  expect(v.canScroll).toBe(true);
  expect(v.up && !v.down, 'the cue says there’s more above').toBe(true);
  const seq = (await snapshot(page)).dialogue.seq;
  const text = page.locator('.inv-talk-text');
  const r = await text.boundingBox();
  if (tap) {
    // A finger dragged down the line scrolls it back up, and goes nowhere.
    const cdp = await page.context().newCDPSession(page);
    const at = (y) => [{ x: r.x + r.width / 2, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(r.y + 4) });
    for (let k = 1; k <= 8; k++)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(r.y + 4 + k * 12) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    // The wheel over the line scrolls it back up.
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.wheel(0, -400);
  }
  await expect.poll(async () => (await lineView(page)).top, { message: 'scrolled back up' }).toBeLessThan(v.top - 10);
  v = await lineView(page);
  expect(v.down, 'the cue says there’s more below').toBe(true);
  expect((await snapshot(page)).dialogue.seq, 'scrolling never goes on').toBe(seq);
  if (!tap) {
    // The arrow keys scroll it a row at a time.
    const before = v.top;
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await lineView(page)).top).toBeGreaterThan(before);
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await lineView(page)).top).toBeLessThan(before + 1);
    expect((await snapshot(page)).dialogue.seq).toBe(seq);
  }
  // A tap still goes on, and the next line starts from its top. (Once the line's at rest: a
  // touch while a finger's fling still scrolls it only stops the fling, as a phone has it.)
  await scrollStill(page);
  await goOn(page, tap);
  await until(page, (x) => x.dialogue?.seq > seq, 'on to the next line');
  v = await lineView(page);
  expect(v.top).toBe(0);
  expect(v.canScroll).toBe(false);
  expect(errors).toEqual([]);
}
/** Until the long line's view stops moving: its scroll the same for five frames running. */
const scrollStill = (page) =>
  page.evaluate(
    () =>
      new Promise((done) => {
        const t = document.querySelector('.inv-talk-text');
        let last = t.scrollTop;
        let same = 0;
        const tick = () => {
          same = t.scrollTop === last ? same + 1 : 0;
          last = t.scrollTop;
          if (same >= 5) done(true);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

/**
 * Records every frame from now on (stopFrames returns them): when (performance.now()), what was
 * done last (window.__mark), which line is up (its letters' first node), how many of its letters
 * show of all, the old line's copy going (its mask, its fade's keyframes and its letters), the replies'
 * copy going (its mask), the name tab (its mask and opacity, while it shows), the box's fade
 * (data-fade: out, in or none) and the ▼.
 */
const recordFrames = (page) =>
  page.evaluate(() => {
    const typed = document.querySelector('.inv-talk-typed');
    const name = document.querySelector('.inv-talk-name');
    const boxEl = document.querySelector('.inv-talk-box');
    const lines = new Map();
    const rec = (window.__frames = []);
    const css = (el) => getComputedStyle(el);
    const tick = () => {
      const head = typed.firstChild;
      if (head && !lines.has(head)) lines.set(head, lines.size);
      const ghost = document.querySelector('.inv-talk-ghost');
      const replies = document.querySelector('.inv-talk-choices.is-ghost');
      rec.push({
        at: performance.now(),
        mark: window.__mark ?? '',
        line: head ? lines.get(head) : -1,
        letters: typed.querySelectorAll('.inv-fx:not(.is-unseen)').length,
        all: typed.querySelectorAll('.inv-fx').length,
        ghost: ghost
          ? {
              mask: css(ghost).maskImage,
              // (Its fade's keyframes: each opacity, or each mask.)
              keys: ghost
                .getAnimations()
                .flatMap((a) =>
                  a.effect.getKeyframes().map((k) => (k.opacity !== undefined ? `opacity ${k.opacity}` : k.maskImage)),
                ),
              letters: ghost.querySelectorAll('.inv-fx:not(.is-unseen)').length,
            }
          : null,
        replies: replies ? css(replies).maskImage : null,
        name: name.hidden ? null : { mask: css(name).maskImage, opacity: Number(css(name).opacity) },
        fade: boxEl.dataset.fade ?? '',
        next: !document.querySelector('.inv-talk-next').hidden,
      });
      window.__framesTick = requestAnimationFrame(tick);
    };
    tick();
  });
const stopFrames = (page) =>
  page.evaluate(() => {
    cancelAnimationFrame(window.__framesTick);
    return window.__frames;
  });
/** A dither tile as the computed style gives one. */
const TILE = /^url\("data:image\/png;base64,[^"]+"\)$/;
/**
 * From the frame a press brought a new line on (`i`) to its first letter: first the old line's
 * copy goes, dithered (`plain`: a plain fade, reduced motion), the name tab with it (and the
 * replies' copy, a reply picked); then the name tab comes in the same way, the copy gone; then
 * (a letter's time on) the line types from its start, nothing fading. Never the copy and a new
 * letter together, and the first letter no sooner than the two fades.
 */
function dithersOutThenIn(rec, i, what, { replies = false, plain = false } = {}) {
  const first = rec.findIndex((r, j) => j >= i && r.letters > 0);
  expect(first, `${what}: it types`).toBeGreaterThan(i);
  const span = rec.slice(i, first);
  const out = span.filter((r) => r.fade === 'out');
  const inn = span.filter((r) => r.fade === 'in');
  expect(out.length, `${what}: the old line goes`).toBeGreaterThan(0);
  expect(inn.length, `${what}: then the next comes`).toBeGreaterThan(0);
  expect(span[0].fade, `${what}: out from the press`).toBe('out');
  const lastIn = span.findLastIndex((r) => r.fade === 'in');
  expect(
    span.findLastIndex((r) => r.fade === 'out'),
    `${what}: out, then in`,
  ).toBeLessThan(span.findIndex((r) => r.fade === 'in'));
  expect(
    span.slice(0, lastIn).every((r) => r.fade),
    `${what}: out straight into in`,
  ).toBe(true);
  // (After it, until its first letter: nothing going, nothing typed.)
  for (const r of span.slice(lastIn + 1))
    expect([r.fade, r.ghost, r.replies, r.letters], `${what}: the letter's wait`).toEqual(['', null, null, 0]);
  const look = plain ? /^none$/ : TILE;
  for (const r of out) {
    expect(r.ghost, `${what}: the old line's copy going`).not.toBeNull();
    expect(r.ghost.letters, `${what}: the old line in it`).toBeGreaterThan(0);
    expect(r.ghost.mask, `${what}: going ${plain ? 'plainly' : 'dithered'}`).toMatch(look);
    if (r.name) expect(r.name.mask, `${what}: its name going with it`).toMatch(look);
    if (replies) expect(r.replies, `${what}: the replies going`).toMatch(look);
    expect(r.letters, `${what}: none of the new line yet`).toBe(0);
  }
  // (Its name tab coming dithered, or plainly; whole in a last frame before the fade's over.)
  for (const r of inn) {
    expect([r.ghost, r.replies], `${what}: the old line gone`).toEqual([null, null]);
    if (r.name)
      expect(r.name.mask, `${what}: its name coming ${plain ? 'plainly' : 'dithered'}`).toMatch(
        plain ? look : /^url\(|^none$/,
      );
    expect([r.letters, r.next], `${what}: nothing typed yet`).toEqual([0, false]);
  }
  if (!plain && inn.some((r) => r.name))
    expect(
      inn.some((r) => TILE.test(r.name?.mask ?? '')),
      `${what}: its name dithering in`,
    ).toBe(true);
  // (Its fade: a plain one, its opacity down; or the dither's steps, each a tile, then nothing.)
  const keys = out[0].ghost.keys;
  if (plain) expect(keys, `${what}: a plain fade`).toEqual(['opacity 1', 'opacity 0']);
  else {
    expect(keys.length, `${what}: a few steps`).toBeGreaterThanOrEqual(3);
    for (const k of keys) expect(k, `${what}: each step a tile`).toMatch(TILE);
    expect(new Set(keys).size, `${what}: each step its own`).toBe(keys.length);
    if (out.length >= 6) expect(new Set(out.map((r) => r.ghost.mask)).size, `${what}: stepping`).toBeGreaterThan(1);
  }
  const typing = rec[first];
  expect([typing.fade, typing.ghost], `${what}: typing, nothing fading`).toEqual(['', null]);
  if (!plain) expect(typing.letters, `${what}: from its start`).toBeLessThan(typing.all);
  expect(typing.at - rec[i].at, `${what}: once out and in are over`).toBeGreaterThan(280);
}

/**
 * The box as laid out, client px: its height and its name tab's top, its line's row height, how
 * many rows show and how many it has, and whether it scrolls.
 */
const boxShape = (page) =>
  page.evaluate(() => {
    const b = document.querySelector('.inv-talk-box').getBoundingClientRect();
    const t = document.querySelector('.inv-talk-text');
    const row = parseFloat(getComputedStyle(t).lineHeight);
    return {
      height: b.height,
      tab: document.querySelector('.inv-talk-name').getBoundingClientRect().top,
      row,
      shows: t.clientHeight / row,
      rows: t.scrollHeight / row,
      canScroll: t.classList.contains('can-scroll'),
    };
  });
/**
 * The box takes its line's shape at this screen's size: a short line in its least rows (three;
 * two on a short screen), as before round 18 (`was`: its height then, px); a longer one grows it
 * by a row at most (`most`: four rows' height; three on a short screen) and scrolls past that; a
 * tall line holds it there; and the shot frames NEWT's head clear over the box each time.
 * @param {import('@playwright/test').Page} page
 * @param {{touch: boolean, short: boolean, was: number, most: number}} o
 */
async function boxAdapts(page, { touch, short, was, most }) {
  const errors = watch(page);
  await calm(page);
  // (The fixture's first three boxes, one after another: a short line, a long one, a tall one.)
  const intro = structuredClone(behaviorIntro);
  const [first, second, third] = intro.boxes;
  expect(first.id).toBe(intro.start);
  second.text = LONG_LINE;
  third.text = TALL_LINE;
  for (const b of [first, second, third]) Object.assign(b, { next: '', end: false, choices: [] });
  await page.evaluate((i) => window.__invitation.setIntro(i), intro);
  await open(page, touch);
  const least = short ? 2 : 3;
  const cap = least + 1;
  /** @type {Record<string, any>} */
  const shapes = {};
  for (const kind of ['short', 'long', 'tall']) {
    const s = await snapshot(page);
    if (!s.dialogue.typed) {
      await goOn(page, touch);
      await until(page, (x) => x.dialogue.typed, `the ${kind} line up`);
    }
    // (Once the shot's framed over the box as this line has it: his head over its name tab.)
    await expect
      .poll(
        async () => {
          const x = await snapshot(page);
          const head = await page.evaluate(() => window.__invitation.screen('head'));
          const tab = (await boxShape(page)).tab;
          const at =
            !x.camera.turning &&
            Math.abs(x.camera.distance - x.dialogue.goal.distance) < 0.01 * x.dialogue.goal.distance;
          return at && head.y + head.r < tab;
        },
        { message: `the ${kind} line: his head clear over the box`, timeout: 30_000 },
      )
      .toBe(true);
    shapes[kind] = await boxShape(page);
    if (kind !== 'tall') {
      await goOn(page, touch);
      await until(page, (x) => x.dialogue?.seq > s.dialogue.seq, 'on to the next line');
    }
  }
  const { short: sh, long: lo, tall: ta } = shapes;
  // A short line: the box's least rows, as before.
  expect(sh.shows, 'a short line in the least rows').toBeCloseTo(least, 1);
  expect(sh.canScroll).toBe(false);
  expect(Math.abs(sh.height - was), `${sh.height} px, as it was (${was})`).toBeLessThan(1.5);
  // A long line: all of its rows up to a row more than that, the box grown with it; past the
  // cap it scrolls.
  expect(lo.shows, 'its rows, a row more at most').toBeCloseTo(Math.max(least, Math.min(Math.round(lo.rows), cap)), 1);
  expect(lo.canScroll, 'scrolls only past the cap').toBe(Math.round(lo.rows) > cap);
  if (Math.round(lo.rows) > least)
    expect(Math.abs(lo.height - most), `${lo.height} px, a row up (${most})`).toBeLessThan(1.5);
  expect(lo.height, 'never more than a row up').toBeLessThanOrEqual(sh.height + sh.row + 0.5);
  // A tall line: the box at its cap and never more, the rest scrolling.
  expect(Math.abs(ta.height - most), `${ta.height} px, at the cap (${most})`).toBeLessThan(1.5);
  expect(ta.shows, `${cap} rows`).toBeCloseTo(cap, 1);
  expect(ta.rows).toBeGreaterThan(ta.shows + 1);
  expect(ta.canScroll, 'the rest scrolls').toBe(true);
  expect(errors).toEqual([]);
}

/**
 * The five screens the box adapts to: its height there for a short line before round 18 (px;
 * c5fa4f6), and at its cap, a row more (four rows; three on a short screen).
 */
const SCREENS = [
  {
    name: 'on a desktop, 1280×800',
    use: { viewport: { width: 1280, height: 800 } },
    touch: false,
    short: false,
    was: 153,
    most: 183,
  },
  {
    name: 'in a half-width window, 640×800',
    use: { viewport: { width: 640, height: 800 } },
    touch: false,
    short: false,
    was: 133,
    most: 158,
  },
  {
    name: 'in a half-height window, 1280×400',
    use: { viewport: { width: 1280, height: 400 } },
    touch: false,
    short: true,
    was: 89,
    most: 112,
  },
  {
    name: 'on a phone, 390×844',
    use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    touch: true,
    short: false,
    was: 133,
    most: 158,
  },
  {
    name: 'on a phone held sideways, 844×390',
    use: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    touch: true,
    short: true,
    was: 89,
    most: 112,
  },
];
for (const screen of SCREENS)
  test.describe(`the chat box ${screen.name}`, () => {
    test.use(screen.use);
    test(`a short line keeps ${screen.short ? 'two' : 'three'} rows, a long one grows the box a row at most (${screen.short ? 'three' : 'four'}), then it scrolls`, async ({
      page,
    }) => {
      await boxAdapts(page, screen);
    });
  });

test.describe('on a phone', () => {
  test('a line taller than four rows scrolls in the box: it follows the typing, then a finger scrolls it', async ({
    page,
  }) => {
    await longLineScrolls(page, true);
  });

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
    // (On the screen once the question has come in: the tap that brought it dithers it in.)
    await runUntilReplies(page);
    // (Its words are letters in it: the reply is what's under them.)
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('.inv-talk-choice')?.className ?? '',
      spot,
    );
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

  test('a finger held on Next, a reply or the box presses it a step darker and down, plainly, with no dither', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    await useBehaviorIntro(page);
    const { ask } = askAndBefore(await script(page));
    test.skip(!ask, 'this script has no replies');
    await open(page, true);
    // (The steps' ends, not their fades.)
    await page.addStyleTag({ content: '.inv-talk, .inv-talk * { transition: none !important; }' });
    const cdp = await page.context().newCDPSession(page);
    const finger = (type, p) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] : [],
      });
    const centre = async (loc) => {
      const r = await loc.boundingBox();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    /** Held: a step darker than at rest, down `by` px, with no dither and no outline round its words. */
    const heldLooksPressed = async (loc, rest, what, by = 3) => {
      await expect.poll(async () => (await looksOf(loc)).pressed, { message: `${what}: pressed` }).toBe(true);
      const l = await looksOf(loc);
      expect([l.image, l.shadow, l.down], `${what}: plain, down ${by} px`).toEqual(['none', 'none', by]);
      expect(lightOf(l.fill), `${what}: a step darker`).toBeLessThan(lightOf(rest.fill) - 4);
    };
    const next = page.getByRole('button', { name: 'Next', exact: true });
    const nextRest = await looksOf(next);
    expect(nextRest.pressed).toBe(false);
    const at = await centre(next);
    await finger('touchStart', at);
    await heldLooksPressed(next, nextRest, 'Next held');
    // Slid off it, not pressed any more.
    await finger('touchMove', { x: at.x - 160, y: at.y + 160 });
    await expect.poll(async () => (await looksOf(next)).pressed, { message: 'slid off' }).toBe(false);
    expect((await looksOf(next)).fill, 'its own fill again').toBe(nextRest.fill);
    await finger('touchEnd');
    // The box held (it goes on when it's tapped): a step darker, down 2 px; lifted, it goes on.
    const boxEl = box(page);
    const boxRest = await looksOf(boxEl);
    const seq = (await snapshot(page)).dialogue.seq;
    const onBox = await centre(boxEl);
    await finger('touchStart', onBox);
    await heldLooksPressed(boxEl, boxRest, 'the box held', 2);
    await finger('touchEnd');
    await expect.poll(async () => (await looksOf(boxEl)).pressed, { message: 'the box let go' }).toBe(false);
    await until(page, (s) => s.dialogue.typed || s.dialogue.seq > seq, 'the tap on the box went on');
    // A reply held: pressed the same, from its cream; the touch cancelled, not.
    await next.tap();
    await until(page, (s) => s.dialogue.id === ask.id && Boolean(s.dialogue.repliesLive), 'at the replies');
    const reply = page.locator('.inv-talk-choice').first();
    const replyRest = await looksOf(reply);
    expect(replyRest.fill, 'the replies’ cream, not the paper at the top').not.toBe(nextRest.fill);
    await finger('touchStart', await centre(reply));
    await heldLooksPressed(reply, replyRest, 'a reply held');
    await finger('touchCancel');
    await expect.poll(async () => (await looksOf(reply)).pressed, { message: 'cancelled' }).toBe(false);
    expect((await snapshot(page)).dialogue.id, 'a cancelled press picks nothing').toBe(ask.id);
    // With the replies up the box goes nowhere, so a finger on it shows nothing.
    const hold = await centre(boxEl);
    await finger('touchStart', hold);
    await expect.poll(async () => (await looksOf(boxEl)).fill, { message: 'the box as it was' }).toBe(boxRest.fill);
    expect((await looksOf(boxEl)).down, 'not down').toBe(0);
    await finger('touchCancel');
    expect(errors).toEqual([]);
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
  test('a line taller than four rows scrolls in the box: it follows the typing, then the wheel and keys scroll it', async ({
    page,
  }) => {
    await longLineScrolls(page, false);
  });

  test('the chat screen is plain as before round 18: no dither on its buttons, no press flash, the box rising in plainly over its dim', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    await useBehaviorIntro(page);
    // Opening: nothing on the screen dithers in; the box rises into place with a plain fade
    // (read the moment the layer shows).
    await page.evaluate(() => {
      const layer = document.querySelector('.inv-talk');
      new MutationObserver((_, observer) => {
        if (layer.hidden) return;
        observer.disconnect();
        const boxEl = layer.querySelector('.inv-talk-box');
        const dim = layer.querySelector('.inv-talk-dim');
        const css = (el) => getComputedStyle(el);
        window.opening = {
          layer: css(layer).animationName,
          layerMask: css(layer).maskImage,
          box: css(boxEl).animationName,
          boxEasing: css(boxEl).animationTimingFunction,
          boxMask: css(boxEl).maskImage,
          dim: css(dim).animationName,
          dimLook: css(dim).backgroundImage.startsWith('linear-gradient('),
          dimMask: css(dim).maskImage,
          dimTakes: css(dim).pointerEvents,
        };
      }).observe(layer, { attributes: true, attributeFilter: ['hidden'] });
    });
    await replayIntro(page).click();
    await expect.poll(() => page.evaluate(() => window.opening ?? null)).not.toBeNull();
    expect(await page.evaluate(() => window.opening)).toEqual({
      layer: 'none',
      layerMask: 'none',
      box: 'inv-talk-rise',
      boxEasing: 'ease-out',
      boxMask: 'none',
      // (The gentle dim behind the box, as before round 18: a smooth gradient fading in plainly.)
      dim: 'inv-talk-fade',
      dimLook: true,
      dimMask: 'none',
      dimTakes: 'none',
    });
    await until(page, (s) => s.dialogue && s.state === 'talk' && !s.dialogue.waiting, 'the intro under way');
    // No dither on the box: no bands, no flash, no plates, no copy of a line going, its fill plain.
    await expect(page.locator('.inv-talk-shade, .inv-talk-flash, .inv-talk-label, .inv-talk-ghost')).toHaveCount(0);
    await expect(box(page)).toHaveCSS('background-image', 'none');
    // The ▼ bobs smoothly, as it did.
    const arrow = page.locator('.inv-talk-next');
    await expect(arrow).toHaveCSS('animation-name', 'inv-talk-bob');
    await expect(arrow).toHaveCSS('animation-timing-function', 'ease-in-out');
    // A button at rest, under the mouse and pressed: no dither and no outline round its words,
    // pressed down its drop.
    const auto = page.getByRole('button', { name: 'Auto', exact: true });
    const plainly = async (what) => {
      const l = await looksOf(auto);
      expect([l.image, l.shadow], `Auto ${what}: plain`).toEqual(['none', 'none']);
    };
    await plainly('at rest');
    await auto.hover();
    await plainly('hovered');
    await page.mouse.down();
    await expect.poll(async () => (await looksOf(auto)).down, { message: 'Auto pressed down' }).toBe(3);
    await plainly('pressed');
    await page.mouse.move(5, 5);
    await page.mouse.up();
    // A press that goes on: no flash, and the box itself doesn't dip (nothing run on it from script).
    await page.evaluate(() => {
      window.seen = [];
      // (After the layer's own click handler: what it started on the box, read at once.)
      document.addEventListener('click', () =>
        window.seen.push(
          document
            .querySelector('.inv-talk-box')
            .getAnimations()
            .filter((a) => !(a instanceof CSSAnimation)).length,
        ),
      );
    });
    const before = await snapshot(page);
    if (!before.dialogue.typed) {
      await goOn(page);
      await until(page, (s) => s.dialogue.typed, 'the line up');
    }
    await goOn(page);
    await until(page, (s) => s.dialogue?.seq > before.dialogue.seq, 'the next line');
    expect(await page.evaluate(() => window.seen), 'nothing on the box from script').toEqual(
      before.dialogue.typed ? [0] : [0, 0],
    );
    // Auto on: its fill turns to the on colour, still plain.
    const rest = (await looksOf(auto)).fill;
    await auto.click();
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await looksOf(auto)).fill, { message: 'Auto’s on colour' }).not.toBe(rest);
    await plainly('on');
    await auto.click();
    await expect(auto).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });

  test('a mouse over a button or the box warms it a step (a button lifts a pixel); pressed, a step darker and down; never a dither', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    await useBehaviorIntro(page);
    const { ask } = askAndBefore(await script(page));
    test.skip(!ask, 'this script has no replies');
    await open(page);
    // (The steps' ends, not their fades.)
    await page.addStyleTag({ content: '.inv-talk, .inv-talk * { transition: none !important; }' });
    await page.mouse.move(5, 5);
    /**
     * At rest, under the mouse, then held down on it; let go off it, the click that makes (on the
     * layer, the two's common ancestor) kept from the screen, so it presses nothing.
     */
    const steps = async (loc) => {
      const rest = await looksOf(loc);
      const r = await loc.boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      const over = await looksOf(loc);
      await page.mouse.down();
      const down = await looksOf(loc);
      await page.evaluate(() => {
        window.__keep = (e) => e.stopImmediatePropagation();
        window.addEventListener('click', window.__keep, true);
      });
      await page.mouse.move(5, 5);
      await page.mouse.up();
      await page.evaluate(() => window.removeEventListener('click', window.__keep, true));
      return { rest, over, down };
    };
    const plain = (l, what) => expect([l.image, l.shadow], `${what}: no dither, no outline`).toEqual(['none', 'none']);
    for (const name of ['Auto', 'Next', 'Log', 'Skip Intro']) {
      const { rest, over, down } = await steps(page.getByRole('button', { name, exact: true }));
      for (const [l, what] of [
        [rest, 'at rest'],
        [over, 'hovered'],
        [down, 'pressed'],
      ])
        plain(l, `${name} ${what}`);
      expect(warmthOf(over.fill), `${name} hovered: a step warmer`).toBeGreaterThan(warmthOf(rest.fill) + 4);
      expect([rest.down, over.down, down.down], `${name}: lifted a pixel, then down`).toEqual([0, -1, 3]);
      expect(lightOf(down.fill), `${name} pressed: a step darker`).toBeLessThan(lightOf(rest.fill) - 4);
    }
    // Auto on: its own colour, a step lighter under the mouse.
    const auto = page.getByRole('button', { name: 'Auto', exact: true });
    await auto.click();
    await page.mouse.move(5, 5);
    const on = await looksOf(auto);
    const r = await auto.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    expect(lightOf((await looksOf(auto)).fill), 'Auto on, hovered: lighter').toBeGreaterThan(lightOf(on.fill) + 4);
    await auto.click();
    await page.mouse.move(5, 5);
    // The box: a step warmer under the mouse, a step darker and down 2 px pressed (let go off it).
    const b = await steps(box(page));
    for (const [l, what] of [
      [b.rest, 'at rest'],
      [b.over, 'hovered'],
      [b.down, 'pressed'],
    ])
      plain(l, `the box ${what}`);
    expect(warmthOf(b.over.fill), 'the box hovered: a step warmer').toBeGreaterThan(warmthOf(b.rest.fill) + 4);
    expect([b.rest.down, b.over.down, b.down.down], 'the box: not lifted, then down 2 px').toEqual([0, 0, 2]);
    expect(lightOf(b.down.fill), 'the box pressed: a step darker').toBeLessThan(lightOf(b.rest.fill) - 4);
    // A reply the same, from its cream; and with the replies up the box takes no hover (a click
    // on it goes nowhere then).
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await until(page, (s) => s.dialogue.id === ask.id && Boolean(s.dialogue.repliesLive), 'at the replies');
    await page.mouse.move(5, 5);
    const reply = await steps(page.locator('.inv-talk-choice').first());
    expect(warmthOf(reply.over.fill), 'a reply hovered: warmer').toBeGreaterThan(warmthOf(reply.rest.fill) + 4);
    expect([reply.over.down, reply.down.down], 'a reply: lifted, then down').toEqual([-1, 3]);
    expect(lightOf(reply.down.fill), 'a reply pressed: darker').toBeLessThan(lightOf(reply.rest.fill) - 4);
    const idle = await looksOf(box(page));
    const bb = await box(page).boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    expect((await looksOf(box(page))).fill, 'the box under the replies: as it was').toBe(idle.fill);
    expect((await snapshot(page)).dialogue.id, 'nothing picked').toBe(ask.id);
    expect(errors).toEqual([]);
  });

  test('a press that goes on dithers the old line out, then the next one in, then it types; a reply picked too; Auto and Next change lines plainly', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    await useBehaviorIntro(page);
    const { ask } = askAndBefore(await script(page));
    test.skip(!ask, 'this script has no replies');
    await open(page);
    await recordFrames(page);
    /** Notes what's done next, in every frame from here, and waits for its line to come. */
    const act = async (what, doIt) => {
      const s = await snapshot(page);
      if (!s.dialogue.typed) {
        await goOn(page);
        await until(page, (x) => x.dialogue.typed, 'the line up');
      }
      await page.evaluate((m) => (window.__mark = m), what);
      await doIt();
      await until(page, (x) => !x.dialogue || x.dialogue.seq > s.dialogue.seq, `${what}: the next line`);
      await until(page, (x) => !x.dialogue || x.dialogue.typed, `${what}: typed`);
      // (Its letters all up on the screen too, nothing fading.)
      await expect
        .poll(() => page.evaluate(() => document.querySelectorAll('.inv-talk-typed .inv-fx.is-unseen').length))
        .toBe(0);
    };
    await act('click', () => goOn(page));
    await act('space', () => page.keyboard.press('Space'));
    await act('next', () => page.getByRole('button', { name: 'Next', exact: true }).click());
    expect((await snapshot(page)).dialogue.id).toBe(ask.id);
    await act('reply', () => pick(page, 0));
    const auto = page.getByRole('button', { name: 'Auto', exact: true });
    await act('auto', async () => {
      await auto.click();
      await page.mouse.move(5, 5);
    });
    await auto.click();
    // Reduced motion: plain quick fades, in the same order.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await act('reduced', () => goOn(page));
    const rec = await stopFrames(page);
    const comes = rec.flatMap((r, i) => (i > 0 && r.line !== rec[i - 1].line ? [i] : []));
    const by = Object.fromEntries(comes.map((i) => [rec[i].mark, i]));
    expect(Object.keys(by).sort()).toEqual(['auto', 'click', 'next', 'reduced', 'reply', 'space']);
    for (const what of ['click', 'space']) dithersOutThenIn(rec, by[what], what);
    dithersOutThenIn(rec, by.reply, 'a reply picked', { replies: true });
    dithersOutThenIn(rec, by.reduced, 'reduced motion', { plain: true });
    // Nothing else dithers: Auto's next line types at once, Next's shows whole at once.
    for (const what of ['auto', 'next']) {
      const i = by[what];
      const first = rec.findIndex((r, j) => j >= i && r.letters > 0);
      for (const r of rec.slice(i, first + 1))
        expect([r.fade, r.ghost, r.replies], `${what}: no fade`).toEqual(['', null, null]);
      expect(rec[first].at - rec[i].at, `${what}: no wait`).toBeLessThan(150);
    }
    expect(rec[by.next].letters, 'Next: the line whole at once').toBe(rec[by.next].all);
    expect(errors).toEqual([]);
  });

  test('the replies pop in together, plainly; with reduced motion they just show', async ({ page }) => {
    await calm(page);
    await useBehaviorIntro(page);
    const { ask } = askAndBefore(await script(page));
    test.skip(!ask, 'this script has no replies');
    await open(page);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await until(page, (s) => s.dialogue.id === ask.id && Boolean(s.dialogue.choices), 'at the replies');
    const looks = await page.locator('.inv-talk-choices:not(.is-ghost) .inv-talk-choice').evaluateAll((els) =>
      els.map((e) => {
        const c = getComputedStyle(e);
        return { name: c.animationName, delay: parseFloat(c.animationDelay), mask: c.maskImage };
      }),
    );
    expect(looks.length).toBeGreaterThan(1);
    for (const l of looks) expect(l).toEqual({ name: 'inv-talk-pop', delay: 0, mask: 'none' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.inv-talk-choice').first()).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.inv-talk')).toHaveCSS('animation-name', 'none');
    await expect(box(page)).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.inv-talk-next')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.inv-talk-dim')).toHaveCSS('animation-name', 'none');
  });

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

  test('the end fades the whole chat screen out plainly, out of reach from its first step', async ({ page }) => {
    const errors = watch(page);
    await calm(page);
    await useBehaviorIntro(page);
    /** Notes each change to the layer as it goes: shown, out of reach, its fade's frames. */
    const watchLeave = () =>
      page.evaluate(() => {
        const layer = document.querySelector('.inv-talk');
        window.leave = [];
        window.leaveWatch?.disconnect();
        window.leaveWatch = new MutationObserver(() =>
          window.leave.push({
            hidden: layer.hidden,
            leaving: layer.classList.contains('is-leaving'),
            inert: layer.inert,
            through: getComputedStyle(layer).pointerEvents === 'none',
            frames: layer
              .getAnimations()
              .filter((a) => !(a instanceof CSSAnimation))
              .flatMap((a) =>
                a.effect.getKeyframes().map((k) => (k.opacity !== undefined ? `opacity ${k.opacity}` : k.maskImage)),
              ),
          }),
        );
        window.leaveWatch.observe(layer, { attributes: true, attributeFilter: ['hidden', 'class', 'inert'] });
      });
    const leave = () => page.evaluate(() => window.leave);
    for (const motion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion: motion });
      await open(page);
      await watchLeave();
      await page.locator('.inv-talk [data-intro-skip]').click();
      await expect(box(page)).toBeHidden();
      const steps = await leave();
      const first = steps.findIndex((s) => s.leaving);
      expect(first, 'it went through a leave').toBeGreaterThanOrEqual(0);
      const going = steps[first];
      expect(going.hidden, 'still on screen as it starts').toBe(false);
      expect(going.inert && going.through, 'out of reach from its first step').toBe(true);
      expect(going.frames, 'a plain fade, no dither').toEqual(['opacity 1', 'opacity 0']);
      const hid = steps.findIndex((s) => s.hidden);
      expect(hid, 'hidden once it’s gone').toBeGreaterThan(first);
      expect(steps[hid].leaving || steps[hid].inert, 'nothing of the leave left').toBe(false);
      // Free play as before: the toolbar back, Replay Intro focused, and the next open whole.
      await until(page, (s) => !s.dialogue && !s.toolbarTalking && s.buttonsEnabled, 'free play');
      await expect(replayIntro(page)).toBeFocused();
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page);
    await expect(page.locator('.inv-talk')).toHaveCSS('mask-image', 'none');
    await expect(page.locator('.inv-talk')).toHaveCSS('opacity', '1');
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
      // (On the screen once the question has come in: the press that brought it dithers it in.)
      await runUntilReplies(page);
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
