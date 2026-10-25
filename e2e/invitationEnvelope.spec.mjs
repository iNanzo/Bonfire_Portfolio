// The envelope that opens /invitation/ (src/invitation/envelope.js, envelopeScene.js, petals.js),
// in a real browser on the production build, on a desktop (1280×800) and a phone (390×844,
// touch). It's the front door and the loading screen: it shows over the toy on a white page
// under a soft flurry of rose petals, with focus on it but no ring until a key is pressed, and
// takes every press (a drag on it never turns the camera); the mouse over it or a touch stirs a
// few petals (the page's petal layer's); a click, Enter or a swipe up opens it (the seal blooms
// into petals first, and only then the flap lifts with petals pouring out and the letter dissolves as the page behind clears)
// and the intro starts by itself at its first box with no toolbar button pressed, its first line
// and his gesture held until the letter no longer hides him; Escape, a
// swipe down or Skip Intro skips it (a spill of petals; no intro, the toolbar back, focus on
// it, its ring showing only after a key). Opened before newt.glb is in, it waits, then fades once he is. Reduced motion: no bob, no
// petals, the flap open at once, a short crossfade. The touch hint says Tap, the mouse's Click.
// Skip Intro also ends the intro at once, with no question, once it's under way. ?test skips the
// envelope unless &envelope asks for it, so every page here asks. Every wait is on a state
// (?test's snapshot), never on a duration.
import { test, expect } from '@playwright/test';

const PAGE = '/invitation/?test&envelope&calm&seed=3';
const snapshot = (page) => page.evaluate(() => window.__invitation.snapshot());
/** Waits until `pred(snapshot)` holds (states, never durations). */
const until = (page, pred, message, timeout = 30_000) =>
  expect.poll(async () => pred(await snapshot(page)), { message, timeout }).toBe(true);
/** The page's hooks are in (the stage is up; newt.glb may still be loading). */
async function hooks(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.__invitation)), { timeout: 30_000 }).toBe(true);
}
/** The envelope up over the toy, NEWT in behind it (his first frame drawn). */
async function envelopeUp(page, path = PAGE) {
  await page.goto(path);
  await expect(page.locator('.inv-envelope')).toBeVisible();
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await hooks(page);
  await until(page, (s) => s.envelope === 'floating', 'the envelope floating');
}
const envelope = (page) => page.locator('[data-envelope]');
/** The envelope's own snapshot (its state, pose and petals). */
const envSnap = (page) => page.evaluate(() => window.__invitation.envelope());
/** The page's petal layer's snapshot (the cursor's and a finger's petals). */
const layerSnap = (page) => page.evaluate(() => window.__invitation.petals());
const skipIntro = (page) => page.locator('[data-intro-skip]:visible');
/** The intro's script as the page reads it. */
const script = (page) => page.evaluate(() => window.__invitation.intro());
/** Opened: it's gone and the intro is at its first box, with no toolbar button pressed. */
async function introStarted(page) {
  const intro = await script(page);
  await until(page, (s) => s.envelope === 'gone', 'the envelope gone');
  await expect(page.locator('.inv-envelope')).toHaveCount(0);
  await until(page, (s) => s.dialogue?.id === intro.start, 'the intro at its first box');
  const s = await snapshot(page);
  expect(s.button).toBeNull();
  await expect(page.locator('.inv-talk-box')).toBeVisible();
}
/**
 * Opened: each frame from the fade's start until the intro's first line is under way, as the page
 * has it (the envelope over his head, the line still held, the clips his first box has played),
 * sampled in the page every frame. Start it before opening the envelope.
 */
const greeting = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        /** @type {{envelope: string|null, veils: boolean, waiting: boolean, clips: number}[]} */
        const frames = [];
        const tick = () => {
          const s = window.__invitation.snapshot();
          if (s.envelope === 'fading' || s.envelope === 'gone')
            frames.push({
              envelope: s.envelope,
              veils: s.envelopeVeils,
              waiting: s.dialogue ? s.dialogue.waiting : true,
              clips: s.dialogue ? s.dialogue.clips.length : 0,
            });
          if ((s.dialogue && !s.dialogue.waiting) || frames.length > 900) return resolve(frames);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
/** NEWT's greeting waited for the letter: nothing of his first box while it hid him. */
function waitedForLetter(frames) {
  expect(frames.length, 'frames from the fade').toBeGreaterThan(0);
  expect(frames[0].veils, 'the letter over him as it starts to fade').toBe(true);
  for (const [i, f] of frames.entries()) {
    if (!f.veils) continue;
    expect(f.waiting, `frame ${i}: the line held while the letter hides him`).toBe(true);
    expect(f.clips, `frame ${i}: no gesture of the box yet`).toBe(0);
  }
  const last = frames[frames.length - 1];
  expect(last.waiting, 'the line under way').toBe(false);
  expect(last.veils, 'once the letter has cleared his head').toBe(false);
}
/** Skipped: it's gone, no intro, the toolbar back with focus on it. */
async function skipped(page) {
  await until(page, (s) => s.envelope === 'skipped', 'the envelope skipped');
  await expect(page.locator('.inv-envelope')).toHaveCount(0);
  const s = await snapshot(page);
  expect(s.dialogue).toBeNull();
  expect(s.toolbarTalking).toBe(false);
  await expect(page.locator('.inv-toolbar')).toBeVisible();
  await expect(page.locator('.inv-toolbar button').first()).toBeFocused();
  await expect(page.locator('.inv-hud')).not.toHaveAttribute('inert', '');
}
/**
 * Where focus is, whether it shows its ring (:focus-visible) and its button's label's opacity
 * (a toolbar button's label shows on hover and keyboard focus only).
 */
const focusState = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    const label = el?.querySelector?.('.inv-btn-label');
    return {
      cls: String(el?.className ?? ''),
      ring: Boolean(el?.matches?.(':focus-visible')),
      label: label ? getComputedStyle(label).opacity : null,
    };
  });
/** Skipped by a pointer: focus on the toolbar, but no ring and no label (they're the keyboard's). */
async function noRing(page) {
  await expect.poll(async () => (await focusState(page)).ring, { message: 'no focus ring' }).toBe(false);
  const f = await focusState(page);
  expect(f.cls).toContain('inv-btn-intro');
  await expect(page.locator('.inv-btn-intro .inv-btn-label')).toHaveCSS('opacity', '0');
}
/** Real touches through CDP: `touch(type, [{x, y, id}])`. */
async function toucher(page) {
  const cdp = await page.context().newCDPSession(page);
  return (type, points = []) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id ?? 1, radiusX: 2, radiusY: 2, force: 1 })),
    });
}
/** A finger from the middle of the screen `dy` px up (negative) or down, in `steps` moves. */
async function swipe(page, dy, steps = 8) {
  const touch = await toucher(page);
  const vp = page.viewportSize();
  const x = vp.width / 2;
  const y = vp.height / 2;
  await touch('touchStart', [{ x, y }]);
  for (let i = 1; i <= steps; i++) await touch('touchMove', [{ x, y: y + (dy * i) / steps }]);
  await touch('touchEnd', []);
}

test.describe('on a desktop', () => {
  test('it shows over the toy with focus on it, the toolbar out of reach, and the toy paused behind it', async ({
    page,
  }) => {
    await envelopeUp(page);
    await expect(envelope(page)).toBeFocused();
    // (On a plain white page: white, not the toy's off-white, as the user asked.)
    await expect(page.locator('.inv-envelope-paper')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('.inv-hud')).toHaveAttribute('inert', '');
    await expect(skipIntro(page)).toBeVisible();
    await expect(skipIntro(page)).toHaveAccessibleName('Skip Intro');
    const s = await snapshot(page);
    expect(s.ready).toBe(true);
    expect(s.dialogue).toBeNull();
    // Paused: his clock stands still while it covers him.
    const t0 = await page.evaluate(() => window.__invitation.clock());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect
      .poll(() => page.evaluate(() => window.__invitation.envelope().frames), { timeout: 10_000 })
      .toBeGreaterThan(5);
    expect(await page.evaluate(() => window.__invitation.clock())).toBe(t0);
  });

  test('its seal shows at its own size from the first frame, a reload too: no red box', async ({ page }) => {
    const len = (/** @type {number[]} */ a, k = 0) => Math.hypot(a[k], a[k + 1]);
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      else await page.goto(PAGE);
      await hooks(page);
      await expect.poll(async () => Boolean((await envSnap(page))?.seal?.last), { timeout: 30_000 }).toBe(true);
      const { seal } = await envSnap(page);
      // (Placed before its first frame was drawn, at about the size it goes on showing: settling in
      // it's a touch small; the red box was 37 times the size.)
      expect(seal.first.frame).toBe(1);
      for (const k of [0, 2]) {
        const share = len(seal.first.axes, k) / len(seal.last.axes, k);
        expect(share, `axis ${k / 2}`).toBeGreaterThan(0.85);
        expect(share, `axis ${k / 2}`).toBeLessThan(1.15);
      }
      expect(len(seal.first.axes, 0) / len(seal.first.axes, 2)).toBeGreaterThan(0.8);
      expect(len(seal.first.axes, 0) / len(seal.first.axes, 2)).toBeLessThan(1.25);
    }
  });

  test('the mouse over the letter pulses a gold rim round it, slowly, clean between pulses; off it, it fades', async ({
    page,
  }) => {
    await envelopeUp(page);
    const hover = async () => (await envSnap(page)).hover;
    const vp = page.viewportSize();
    // (Off the letter, though on the page over the toy: no pulse.)
    await page.mouse.move(8, vp.height - 8);
    expect((await hover()).k).toBe(0);
    await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 4 });
    await expect.poll(async () => (await hover()).k, { message: 'hovered' }).toBe(1);
    // (Read often: the peak and the trough each last a fraction of the 2.8 s pulse, and slower
    // reads can step right over them.)
    const often = { intervals: [40], timeout: 10_000 };
    await expect
      .poll(async () => (await hover()).pulse, { ...often, message: 'a pulse at its peak' })
      .toBeGreaterThan(0.9);
    await expect
      .poll(async () => (await hover()).pulse, { ...often, message: 'and back to nothing' })
      .toBeLessThan(0.05);
    await page.mouse.move(8, vp.height - 8, { steps: 4 });
    await expect.poll(async () => (await hover()).pulse, { message: 'gone off the letter' }).toBe(0);
  });

  test('a drag across it never turns the camera, and a sideways drag turns the letter but neither opens nor skips it', async ({
    page,
  }) => {
    await envelopeUp(page);
    const before = (await snapshot(page)).camera;
    const vp = page.viewportSize();
    await page.mouse.move(vp.width * 0.3, vp.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(vp.width * 0.3 + i * 40, vp.height * 0.5 + i * 2);
    // (Dragged right, it turns its face right, further than the cursor alone leans it.)
    await expect
      .poll(async () => (await envSnap(page)).turn.now, { message: 'turned by the drag' })
      .toBeGreaterThan(0.08);
    expect((await envSnap(page)).turn.now).toBeLessThanOrEqual(0.15);
    await page.mouse.up();
    // (Let go, it springs back to its lean toward the cursor.)
    await expect.poll(async () => (await envSnap(page)).turn.now, { message: 'sprung back' }).toBeLessThan(0.07);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(vp.width * 0.2, vp.height * 0.4, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, 0.1);
    const s = await snapshot(page);
    expect(s.envelope).toBe('floating');
    expect(s.camera.yaw).toBe(before.yaw);
    expect(s.camera.distance).toBe(before.distance);
    expect(s.camera.target).toEqual(before.target);
  });

  test('hovered it says how to open and skip it; a click opens it and the intro starts by itself, its greeting held until the letter clears him', async ({
    page,
  }) => {
    await envelopeUp(page);
    const hint = page.locator('.inv-envelope-hint');
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Click or swipe up to open');
    await expect(hint).toContainText('Swipe down to skip');
    const greeted = greeting(page);
    await page.mouse.click(vp.width / 2, vp.height / 2);
    await until(page, (s) => s.envelope !== 'floating', 'opening');
    await until(page, (s) => s.envelope === 'fading' || s.envelope === 'gone', 'dissolving');
    // (The letter dissolves, not a fade over the screen; the page behind clears.)
    const gone = await page.evaluate(() => window.__invitation.envelope());
    expect(gone.pose.crossfade).toBe(false);
    expect(gone.pose.fade).toBe(gone.pose.dissolve);
    waitedForLetter(await greeted);
    await introStarted(page);
    const end = await page.evaluate(() => window.__invitation.envelope());
    expect(end.pose.dissolve).toBe(1);
    expect(end.pose.backdrop).toBe(0);
    // The camera cut to the talk shot as it opened.
    expect((await snapshot(page)).toolbarTalking).toBe(true);
  });

  test('it appears under a flurry of rose petals, and the mouse over it trails a few more', async ({ page }) => {
    await envelopeUp(page);
    expect((await envSnap(page)).petals.emitted.spawn).toBeGreaterThan(0);
    const vp = page.viewportSize();
    await page.mouse.move(vp.width * 0.95, vp.height * 0.95);
    await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 6 });
    // (The cursor's petals are the page's petal layer's.)
    await expect.poll(async () => (await layerSnap(page)).emitted.trail, { timeout: 10_000 }).toBeGreaterThan(0);
    expect((await envSnap(page)).state).toBe('floating');
  });

  test('opened, the seal blooms into petals first; only then the flap lifts, petals pouring out of it', async ({
    page,
  }) => {
    await envelopeUp(page);
    await page.keyboard.press('Enter');
    const seen = [];
    await expect
      .poll(
        async () => {
          const e = await envSnap(page);
          seen.push(e);
          return e.state === 'fading' || e.state === 'gone';
        },
        { timeout: 30_000, intervals: [16] },
      )
      .toBe(true);
    expect(seen[0].petals.emitted.bloom).toBeGreaterThan(0);
    for (const e of seen) if (e.pose.flap > 0) expect(e.pose.bloom).toBe(1);
    expect(seen.at(-1).petals.emitted.pour).toBeGreaterThan(0);
    await introStarted(page);
  });

  test('it leans toward the cursor; the arrows across turn it further while they’re held, and it springs back', async ({
    page,
  }) => {
    await envelopeUp(page);
    const turn = async () => (await envSnap(page)).turn.now;
    const vp = page.viewportSize();
    await page.mouse.move(vp.width - 4, vp.height / 2, { steps: 3 });
    await expect.poll(turn, { message: 'toward the cursor on the right' }).toBeGreaterThan(0.04);
    await page.mouse.move(4, vp.height / 2, { steps: 3 });
    await expect.poll(turn, { message: 'toward the cursor on the left' }).toBeLessThan(-0.04);
    await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 3 });
    await expect.poll(async () => Math.abs(await turn()), { message: 'square on in the middle' }).toBeLessThan(0.01);
    await page.keyboard.down('ArrowRight');
    await expect.poll(turn, { message: 'ArrowRight held' }).toBeGreaterThan(0.1);
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => Math.abs(await turn()), { message: 'sprung back' }).toBeLessThan(0.01);
    await page.keyboard.down('ArrowLeft');
    await expect.poll(turn, { message: 'ArrowLeft held' }).toBeLessThan(-0.1);
    await page.keyboard.up('ArrowLeft');
    const s = await snapshot(page);
    expect(s.envelope).toBe('floating');
    expect(s.dialogue).toBeNull();
  });

  test('focused at boot it shows no ring; once Tab is pressed, the ring follows focus', async ({ page }) => {
    await envelopeUp(page);
    await expect(envelope(page)).toBeFocused();
    await expect(envelope(page)).toHaveCSS('box-shadow', 'none');
    await page.keyboard.press('Tab');
    await expect(skipIntro(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(envelope(page)).toBeFocused();
    await expect(envelope(page)).not.toHaveCSS('box-shadow', 'none');
  });

  test('Enter opens it', async ({ page }) => {
    await envelopeUp(page);
    await page.keyboard.press('Enter');
    await introStarted(page);
  });

  test('Escape skips it: no intro, the toolbar back with focus on it, its ring showing (a key)', async ({ page }) => {
    await envelopeUp(page);
    await page.keyboard.press('Escape');
    await skipped(page);
    expect((await focusState(page)).ring).toBe(true);
  });

  test('a drag down skips it: focus on the toolbar, with no ring and no label (a pointer)', async ({ page }) => {
    await envelopeUp(page);
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, vp.height * 0.4);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(vp.width / 2, vp.height * 0.4 + i * 30);
    await page.mouse.up();
    await skipped(page);
    await noRing(page);
  });

  test('ArrowUp opens it and ArrowDown skips it', async ({ page }) => {
    await envelopeUp(page);
    await page.keyboard.press('ArrowDown');
    await skipped(page);
    await envelopeUp(page);
    await page.keyboard.press('ArrowUp');
    await introStarted(page);
  });

  test('Replay Intro resets the scene and brings the envelope back; opened, the intro starts as at boot', async ({
    page,
  }) => {
    await envelopeUp(page);
    const home = (await snapshot(page)).camera;
    await page.keyboard.press('Escape');
    await skipped(page);
    // The scene moved on: NEWT sat down and the camera turned.
    await page.evaluate(() => window.__invitation.press('Sit'));
    await until(page, (s) => s.state === 'sit' || s.state === 'sitDown', 'sitting');
    const vp = page.viewportSize();
    await page.mouse.move(vp.width * 0.3, vp.height * 0.3);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(vp.width * 0.6, vp.height * 0.35, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    await expect.poll(async () => (await snapshot(page)).camera.yaw, { message: 'turned' }).not.toBe(home.yaw);
    await page.locator('.inv-btn-intro').click();
    // The envelope again over a scene as it started: NEWT idle on his feet, the camera home.
    await until(page, (s) => s.envelope === 'floating', 'the envelope back');
    await expect(page.locator('.inv-envelope')).toBeVisible();
    await expect(page.locator('.inv-hud')).toHaveAttribute('inert', '');
    await expect(envelope(page)).toBeFocused();
    const s = await snapshot(page);
    expect(s.state).toBe('idle');
    expect(s.held).toBe(false);
    expect(s.dialogue).toBeNull();
    expect(s.camera.yaw).toBeCloseTo(home.yaw, 6);
    expect(s.camera.distance).toBeCloseTo(home.distance, 6);
    await expect(page.locator('.inv-bubble')).toBeHidden();
    // (Paused behind it, as at boot.)
    const t0 = await page.evaluate(() => window.__invitation.clock());
    const f0 = (await envSnap(page)).frames;
    await expect.poll(async () => (await envSnap(page)).frames, { timeout: 10_000 }).toBeGreaterThan(f0 + 5);
    expect(await page.evaluate(() => window.__invitation.clock())).toBe(t0);
    // Opened, the intro starts by itself at its first box.
    await page.keyboard.press('Enter');
    await introStarted(page);
  });

  test('Replay Intro’s envelope brings its petals back, and none with Rose Petals off', async ({ page }) => {
    const replayed = async () => {
      await page.locator('.inv-btn-intro').click();
      await until(page, (s) => s.envelope === 'floating', 'the envelope back');
      // (Long enough for the flurry, on its first frame, and the swirl filling in.)
      const f0 = (await envSnap(page)).frames;
      await expect.poll(async () => (await envSnap(page)).frames, { timeout: 15_000 }).toBeGreaterThan(f0 + 60);
      return (await envSnap(page)).petals;
    };
    await envelopeUp(page);
    await page.keyboard.press('Escape');
    await skipped(page);
    const on = await replayed();
    expect(on.emitted.spawn).toBeGreaterThan(0);
    expect(on.emitted.swirl).toBeGreaterThan(0);
    expect(on.live).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await skipped(page);
    // Rose Petals off in Settings: the next envelope has none at all.
    await page.getByRole('button', { name: 'Settings' }).click();
    const sw = page.getByRole('switch', { name: 'Rose Petals' });
    await expect(sw).toBeChecked();
    await sw.scrollIntoViewIfNeeded();
    await sw.click();
    await expect(sw).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(sw).toBeHidden();
    const off = await replayed();
    expect(off.live).toBe(0);
    expect(Object.values(off.emitted).reduce((a, b) => a + b, 0)).toBe(0);
  });

  test('Skip Intro on it skips it', async ({ page }) => {
    await envelopeUp(page);
    await skipIntro(page).click();
    await skipped(page);
  });

  test('Skip Intro ends the intro at once once it’s under way, with no question', async ({ page }) => {
    await envelopeUp(page);
    await envelope(page).click();
    await introStarted(page);
    await expect(skipIntro(page)).toHaveCount(1);
    await skipIntro(page).click();
    await until(page, (s) => s.dialogue === null && !s.toolbarTalking, 'the intro over');
    await expect(page.locator('.inv-talk-ask')).toBeHidden();
    await expect(page.locator('.inv-toolbar')).toBeVisible();
  });

  test('opened before newt.glb is in, it waits open, then fades once he is', async ({ page }) => {
    /** @type {() => void} */
    let release = () => {};
    const held = new Promise((r) => (release = r));
    await page.route('**/models/newt.glb', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(PAGE);
    await expect(page.locator('.inv-envelope')).toBeVisible();
    await hooks(page);
    await until(page, (s) => s.envelope === 'floating' && !s.ready, 'floating, NEWT not in yet');
    await envelope(page).click();
    await until(page, (s) => s.envelope === 'waiting', 'waiting for him');
    await expect(page.locator('.inv-envelope')).toBeVisible();
    release();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await introStarted(page);
  });

  test('with reduced motion it doesn’t bob, the flap is open at once, and it crossfades', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await envelopeUp(page);
    const still = await page.evaluate(() => window.__invitation.envelope());
    expect(still.reduced).toBe(true);
    expect(still.pose.bob).toBe(0);
    expect(still.pose.yaw).toBe(0);
    await page.keyboard.press('Enter');
    const open = await page.evaluate(() => window.__invitation.envelope());
    if (open.state !== 'gone') expect(open.pose.flap).toBeCloseTo(open.flapOpen, 5);
    if (open.state === 'fading') expect(open.pose.crossfade).toBe(true);
    expect(open.pose.bloom).toBe(0);
    await introStarted(page);
    // No petals at all.
    const end = await envSnap(page);
    expect(end.petals.live).toBe(0);
    expect(Object.values(end.petals.emitted).every((n) => n === 0)).toBe(true);
  });

  test('?test alone starts in the toy, with no envelope', async ({ page }) => {
    await page.goto('/invitation/?test&calm&seed=3');
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await expect(page.locator('.inv-envelope')).toHaveCount(0);
    expect((await snapshot(page)).envelope).toBeNull();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('a swipe up opens it and the intro starts, its greeting held until the letter clears him', async ({ page }) => {
    await envelopeUp(page);
    const greeted = greeting(page);
    await swipe(page, -260);
    waitedForLetter(await greeted);
    await introStarted(page);
  });

  test('a swipe down skips it with a spill of petals: no intro, the toolbar back, focus on it with no ring', async ({
    page,
  }) => {
    await envelopeUp(page);
    await swipe(page, 260);
    await skipped(page);
    expect((await envSnap(page)).petals.emitted.spill).toBeGreaterThan(0);
    await noRing(page);
  });

  test('a touch that slides across sheds petals where it goes and turns the letter its way, and leaves it floating', async ({
    page,
  }) => {
    await envelopeUp(page);
    const turn = async () => (await envSnap(page)).turn.now;
    expect(await turn()).toBe(0);
    const touch = await toucher(page);
    const vp = page.viewportSize();
    const at = { x: vp.width * 0.4, y: vp.height * 0.5 };
    await touch('touchStart', [at]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: at.x + i * 20, y: at.y }]);
    await expect.poll(turn, { message: 'turned toward the finger' }).toBeGreaterThan(0.05);
    await touch('touchEnd', []);
    const e = await layerSnap(page);
    expect(e.emitted.ring + e.emitted.trail).toBeGreaterThan(0);
    // (The finger lifted: nothing to lean toward; it springs back square on.)
    await expect.poll(async () => Math.abs(await turn()), { message: 'sprung back' }).toBeLessThan(0.01);
    await until(page, (s) => s.envelope === 'floating', 'still floating');
  });

  test('a short drag springs back and leaves it floating; left alone, the hint shows', async ({ page }) => {
    await envelopeUp(page);
    await swipe(page, -40, 4);
    await until(page, (s) => s.envelope === 'floating', 'still floating');
    await expect(page.locator('.inv-envelope-hint')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.inv-envelope-hint')).toContainText('Tap or swipe up to open');
    await expect(page.locator('.inv-envelope-hint')).toContainText('Swipe down to skip');
  });

  test('a tap opens it', async ({ page }) => {
    await envelopeUp(page);
    await envelope(page).tap();
    await introStarted(page);
  });
});
