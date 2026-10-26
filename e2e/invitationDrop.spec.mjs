// NEWT's landings in a real browser (/invitation/, the production build), through `?test`'s
// window.__invitation (snapshot().drop) and real input: dropped from high he lands in a full ring
// of dust (dust.js: the count its landing speed gives) and the screen shakes (camera.js
// shakeKick: the picture moved a few CSS px through the projection, then still, the canvas itself
// never moved); let go from the
// hold's own height, a smaller puff and a shake only over SHAKE.min; set down gently, no dust or a
// puff, no shake; with Screen Shake off (Settings, kept in invitation.look.v1) or reduced motion
// the dust still comes, never the shake; on a phone, a finger's drop raises dust, and lifted high
// by a second finger he lands hard enough to shake. Each landing is read in the page on every
// frame (watchLanding) until its dust has gone and its shake is over: states, never durations
// (CI's software WebGL runs slower than real time).
import { test, expect } from '@playwright/test';
import { calm, fingers, glide, grab, on, snapshot, until } from './lib/drag.mjs';
import { DUST, dustShare } from '../src/invitation/dust.js';
import { SHAKE, shakeKick } from '../src/invitation/camera.js';

/** The puffs a landing at `speed` raises (dust.js dustLand's count). */
const puffsFor = (speed) =>
  speed >= DUST.min ? Math.round(DUST.count[0] + (DUST.count[1] - DUST.count[0]) * dustShare(speed)) : 0;

/**
 * From now until the next landing's dust has gone and its shake is over, read in the page every
 * frame: the landing, the most puffs drawn, the biggest shake offset (CSS px) and how many frames
 * showed one, its kick, and the canvas's own transform (never set: the shake is the projection's).
 * @param {import('@playwright/test').Page} page
 */
const watchLanding = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('.inv-canvas'));
        const before = window.__invitation.snapshot().drop.landing?.t ?? null;
        const out = { landing: null, puffs: 0, shake: 0, shakeFrames: 0, kick: null, moved: '', after: null };
        const own = () => canvas.style.transform || getComputedStyle(canvas).transform.replace('none', '');
        let frames = 0;
        const tick = () => {
          const d = window.__invitation.snapshot().drop;
          frames++;
          if (d.landing && d.landing.t !== before) {
            out.landing = d.landing;
            out.puffs = Math.max(out.puffs, d.dust.count);
            const m = Math.hypot(d.shake.x, d.shake.y);
            if (m > 0) out.shakeFrames++;
            if (m > out.shake) {
              out.shake = m;
              out.moved = own();
            }
            out.kick ??= d.kick;
            if (!d.dust.count && !d.kick && m === 0) {
              out.after = own();
              return resolve(out);
            }
          }
          // (A landing that never comes ends it, so the test fails on what it read.)
          if (frames > 20_000) return resolve(out);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );

/** Grabbed by his body with the mouse and lifted high (up into the stage's top band, the wheel). */
async function liftHigh(page) {
  const at = await grab(page, 'body');
  await glide(page, at, { x: at.x, y: 70 }, 10);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -100);
  await until(page, (s) => s.drag.lowestFoot > 1.6, 'lifted high');
}

/** What every landing shares: the dust its speed raises, and a shake exactly when it's due. */
function checkLanding(w, { shakes = true } = {}) {
  expect(w.landing, 'he landed').not.toBeNull();
  expect(w.puffs, `the puffs for a landing at ${w.landing.speed.toFixed(2)} u/s`).toBe(puffsFor(w.landing.speed));
  const due = shakes ? shakeKick(w.landing.speed) : null;
  if (!due) {
    expect(w.kick, 'no shake').toBeNull();
    expect(w.shakeFrames).toBe(0);
    expect(w.moved).toBe('');
  } else {
    expect(w.kick?.px).toBeCloseTo(due.px, 6);
    expect(w.shakeFrames, 'it shook').toBeGreaterThan(1);
    expect(w.shake, 'a few CSS px').toBeGreaterThan(0.5);
    expect(w.shake).toBeLessThanOrEqual(due.px + 1);
    expect(w.moved, 'the canvas itself never moves').toBe('');
  }
  expect(w.after, 'the canvas never moved').toBe('');
}

test.describe('landing, on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('dropped from high, he lands in a full ring of dust and the picture shakes a few CSS px, then is still', async ({
    page,
  }) => {
    await calm(page);
    await liftHigh(page);
    const watching = watchLanding(page);
    await page.mouse.up();
    const w = await watching;
    expect(w.landing.speed, 'a big drop').toBeGreaterThanOrEqual(SHAKE.min);
    checkLanding(w);
    const s = await snapshot(page);
    expect(s.drop.shake).toEqual({ x: 0, y: 0 });
    expect(s.drop.dust).toEqual({ count: 0, box: null });
  });

  test('let go from the hold’s own height, a smaller puff, and a shake only over SHAKE.min; set down gently, no shake', async ({
    page,
  }) => {
    await calm(page);
    await grab(page, 'body');
    let watching = watchLanding(page);
    await page.mouse.up();
    let w = await watching;
    expect(w.puffs, 'some dust').toBeGreaterThan(0);
    expect(w.puffs, 'less than a big drop’s').toBeLessThan(DUST.count[1]);
    checkLanding(w);
    // (Lowered to the floor first, the wheel down, and let go there.)
    await until(page, (s) => s.state === 'idle' && s.clip === 'Idle', 'idle again', 30_000);
    await grab(page, 'body');
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 100);
    await until(page, (s) => s.drag.lowestFoot < 0.1, 'lowered to the floor');
    // Reaching the floor is not yet a gentle release: the wheel's lowering motion and
    // the dangling pose can still contribute to the throw. Wait for both to settle
    // across simulation time, including the release velocity's sampling window.
    let stillSince = null;
    let previous = null;
    await expect
      .poll(
        async () => {
          const s = await snapshot(page);
          const a = s.drag.anchor;
          const h = s.drag.hips;
          const point = a && h ? [a.x, a.y, a.z, h.x, h.z, s.drag.lowestFoot] : null;
          const quiet =
            s.held &&
            s.drag.lowestFoot < 0.1 &&
            s.motion.limp.most < 0.03 &&
            point &&
            previous &&
            point.every((v, i) => Math.abs(v - previous[i]) < 0.001);
          previous = point;
          if (!quiet) stillSince = null;
          else stillSince ??= s.motion.heldFor;
          return stillSince !== null && s.motion.heldFor - stillSince >= 0.25;
        },
        { message: 'still at the floor before the gentle set-down', timeout: 30_000, intervals: [100] },
      )
      .toBe(true);
    watching = watchLanding(page);
    await page.mouse.up();
    w = await watching;
    expect(w.landing.speed, 'a set-down').toBeLessThan(SHAKE.min);
    expect(w.puffs, 'none or a puff').toBeLessThanOrEqual(DUST.count[0] + 1);
    checkLanding(w);
  });

  test('with Screen Shake off in Settings, a big drop still raises its dust but never shakes; the switch is kept', async ({
    page,
  }) => {
    await calm(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const sw = page.getByRole('switch', { name: 'Screen Shake' });
    await expect(sw).toBeChecked();
    await sw.scrollIntoViewIfNeeded();
    await sw.click();
    await expect(sw).not.toBeChecked();
    await page.keyboard.press('Escape');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('invitation.look.v1') ?? '{}'));
    expect(stored.shake).toBe(false);
    await until(page, (s) => s.state === 'idle' && s.clip === 'Idle', 'idle');
    await liftHigh(page);
    const watching = watchLanding(page);
    await page.mouse.up();
    const w = await watching;
    expect(w.landing.speed, 'a big drop').toBeGreaterThanOrEqual(SHAKE.min);
    expect(w.puffs).toBeGreaterThan(0);
    checkLanding(w, { shakes: false });
  });

  test('with reduced motion, the dust and no shake', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await calm(page);
    await liftHigh(page);
    const watching = watchLanding(page);
    await page.mouse.up();
    const w = await watching;
    expect(w.landing.speed, 'a big drop').toBeGreaterThanOrEqual(SHAKE.min);
    expect(w.puffs).toBeGreaterThan(0);
    checkLanding(w, { shakes: false });
  });
});

test.describe('landing, on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('a finger’s drop raises dust; lifted high by a second finger he lands hard enough to shake', async ({
    page,
  }) => {
    await calm(page);
    const f = await fingers(page);
    let body = await on(page, 'body');
    await f.start(1, body);
    await until(page, (s) => s.held && s.motion.heldFor >= 0.2, 'held');
    let watching = watchLanding(page);
    await f.end(1);
    let w = await watching;
    expect(w.puffs, 'some dust').toBeGreaterThan(0);
    checkLanding(w);

    await until(page, (s) => s.state === 'idle' && s.clip === 'Idle', 'idle again', 30_000);
    body = await on(page, 'body');
    await f.start(1, body);
    await until(page, (s) => s.held && s.motion.heldFor >= 0.2, 'held');
    const y0 = (await snapshot(page)).drag.holdY;
    let two = { x: Math.min(370, body.x + 100), y: 700 };
    await f.start(2, two);
    for (let i = 0; i < 30; i++) {
      two = { x: two.x, y: two.y - 12 };
      await f.move(2, two);
    }
    await until(page, (s) => s.drag.holdY > y0 + 1.2, 'the second finger lifted him high');
    await f.end(2);
    watching = watchLanding(page);
    await f.end(1);
    w = await watching;
    await f.done();
    expect(w.landing.speed, 'a big drop').toBeGreaterThanOrEqual(SHAKE.min);
    checkLanding(w);
  });
});
