// The shared drag checks for the invitation toy's drag kinds (hold.js DRAG_KINDS), as a harness
// a spec runs for a kind: dragDescribe(kind) adds them under ?drag=<kind> (e2e/invitationDrag.spec.mjs
// runs them for today; a candidate's own spec file runs them for its kind, then its own checks
// with the helpers here). Carried with the mouse, his collar is within 2 px of the cursor once
// the grab has eased in (0.15 s), up, across and down; the blob is within 0.03 world of his hips'
// floor point and his lowest foot above the floor all the while; a down drag from a standing grab
// leaves no gap; with a finger, his collar is within 2 px of where the kind aims it, above the
// finger; Ground Cues shows the ring under him and the drop line once he's high, or neither at
// Off. Every wait is on a state (snapshot().drag through ?test), never a duration (CI's software
// WebGL runs 3-5x slower than real time). Playwright only.
import { test, expect } from '@playwright/test';

export const snapshot = (page) => page.evaluate(() => window.__invitation.snapshot());
/** A point on NEWT (client px): 'head', 'body' or 'feet'. */
export const on = (page, part) => page.evaluate((p) => window.__invitation.screen(p), part);
/** Waits until `pred(snapshot)` holds (states, never durations). */
export const until = (page, pred, message, timeout = 20_000) =>
  expect.poll(async () => pred(await snapshot(page)), { message, timeout }).toBe(true);
export const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The toy under ?drag=<kind>, ready, calm (no wandering, no sitting by himself) and idle; with
 * `look`, that stored first (invitation.look.v1, as the Settings sheet keeps it).
 * @param {import('@playwright/test').Page} page
 * @param {string} kind
 * @param {object} [look]
 */
export async function calm(page, kind, look) {
  if (look) await page.addInitScript((l) => localStorage.setItem('invitation.look.v1', JSON.stringify(l)), look);
  await page.goto(`/invitation/?test&calm&seed=3&drag=${kind}`);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await until(page, (s) => s.state === 'idle' && s.clip === 'Idle', 'idle');
}

/** The mouse moved to `to` in `steps` moves (each a frame's worth of a drag). */
export async function glide(page, from, to, steps = 6) {
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  return to;
}

/**
 * Grabbed by `part` with the mouse, held until he's held and the grab has eased in (0.15 s);
 * returns where the cursor is.
 */
export async function grab(page, part = 'head') {
  // (Once the camera has stopped moving: two reads of it alike, so he's where he shows.)
  let was = '';
  await expect
    .poll(
      async () => {
        const c = (await snapshot(page)).camera;
        const now = [c.yaw, c.elevation, c.distance, c.target.x, c.target.z].map((v) => v.toFixed(4)).join();
        const still = !c.turning && now === was;
        was = now;
        return still;
      },
      { message: 'the camera still', timeout: 20_000 },
    )
    .toBe(true);
  const at = await on(page, part);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await until(page, (s) => s.held && s.motion.heldFor >= 0.15, 'held, the grab eased in');
  return { x: at.x, y: at.y };
}

/** Waits until the collar is within `px` of where the kind aims it (the cursor, for a mouse). */
export const onCursor = (page, message, px = 2) =>
  expect.poll(async () => (await snapshot(page)).drag.gap ?? Infinity, { message }).toBeLessThan(px);

/**
 * Up 200 px from `cursor`, and for a kind with a wheel for his height (a level hold keeps him at
 * its height however far up the screen he goes), six notches up as well; returns the cursor.
 */
export async function lift(page, cursor) {
  const to = await glide(page, cursor, { x: cursor.x, y: cursor.y - 200 });
  if ((await snapshot(page)).drag.controls.wheel) for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -100);
  return to;
}

/** The checks every held frame shares: the blob under his hips, his lowest foot over the floor. */
export async function grounded(page, at) {
  const d = (await snapshot(page)).drag;
  expect(
    gap({ x: d.blob.x, y: d.blob.z }, { x: d.hips.x, y: d.hips.z }),
    `${at}: the blob under his hips`,
  ).toBeLessThan(0.03);
  expect(d.lowestFoot, `${at}: his lowest foot over the floor`).toBeGreaterThan(0);
}

/**
 * A finger through CDP (real touches): down, move and up take client px.
 * @param {import('@playwright/test').Page} page
 */
export async function finger(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, p) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  return {
    down: (p) => touch('touchStart', p),
    move: (p) => touch('touchMove', p),
    up: () => touch('touchEnd', null),
    done: () => cdp.detach(),
  };
}

/**
 * The shared checks for drag kind `kind`. `baseline`: the checks the kind is known to fail (today's
 * hold leaves the collar off the cursor on a down drag: marked test.fail, so fixing it shows).
 * @param {string} kind
 * @param {{baseline?: string[]}} [o]
 */
export function dragDescribe(kind, { baseline = [] } = {}) {
  test.describe(`?drag=${kind}, on a desktop`, () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test(`${kind}: carried with the mouse, his collar is within 2 px of the cursor once the grab has eased in, up, across and down; the blob stays under his hips and his lowest foot over the floor`, async ({
      page,
    }) => {
      await calm(page, kind);
      expect((await snapshot(page)).drag.kind).toBe(kind);
      let cursor = await grab(page, 'head');
      expect((await snapshot(page)).drag.kind, 'held with it').toBe(kind);
      cursor = await glide(page, cursor, { x: cursor.x, y: cursor.y - 120 });
      for (const [dx, dy] of [
        [0, 0],
        [0, -80],
        [140, 0],
        [-200, -40],
        [60, 90],
      ]) {
        cursor = await glide(page, cursor, { x: cursor.x + dx, y: cursor.y + dy });
        await onCursor(page, `the collar at (${cursor.x}, ${cursor.y})`);
        await grounded(page, `(${cursor.x}, ${cursor.y})`);
      }
      await page.mouse.up();
      await until(page, (s) => !s.held && s.state !== 'held', 'let go');
      await until(page, (s) => s.state === 'idle' || s.state === 'flee', 'down again', 30_000);
    });

    test(`${kind}: a down drag from a standing grab leaves no gap between his collar and the cursor`, async ({
      page,
    }) => {
      test.fail(baseline.includes('down'), `${kind} leaves the collar off the cursor on a down drag (the baseline)`);
      await calm(page, kind);
      const cursor = await grab(page, 'head');
      await glide(page, cursor, { x: cursor.x, y: cursor.y + 100 });
      await expect
        .poll(async () => (await snapshot(page)).drag.gap ?? Infinity, { message: 'down 100 px', timeout: 5_000 })
        .toBeLessThan(2);
      await page.mouse.up();
    });

    test(`${kind}: Ground Cues Always shows the ring under his hips while he's held and the drop line once he's high`, async ({
      page,
    }) => {
      await calm(page, kind, { groundCues: 'always' });
      const cursor = await grab(page, 'head');
      await until(page, (s) => s.drag.groundCues === 'always' && s.drag.ring?.alpha > 0.99, 'the ring in');
      const d = (await snapshot(page)).drag;
      expect(gap({ x: d.ring.x, y: d.ring.z }, { x: d.hips.x, y: d.hips.z }), 'under his hips').toBeLessThan(0.03);
      await lift(page, cursor);
      await until(
        page,
        (s) => s.drag.lowestFoot > 0.5 && s.drag.line.visible && s.drag.line.alpha > 0.9,
        'high: the line',
      );
      await page.mouse.up();
      await until(page, (s) => !s.held && s.drag.ring === null && !s.drag.line.visible, 'let go: both go');
    });

    test(`${kind}: Ground Cues Off shows neither the ring nor the drop line, however high he is`, async ({ page }) => {
      await calm(page, kind, { groundCues: 'off' });
      const cursor = await grab(page, 'head');
      await lift(page, cursor);
      await until(page, (s) => s.drag.lowestFoot > 0.5, 'high');
      const off = (await snapshot(page)).drag;
      expect(off.groundCues).toBe('off');
      expect(off.ring, 'no ring').toBeNull();
      expect(off.line.visible, 'no line').toBe(false);
      await page.mouse.up();
    });
  });

  test.describe(`?drag=${kind}, on a phone`, () => {
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    test(`${kind}: carried with a finger, his collar is within 2 px of where the kind aims it, above the finger`, async ({
      page,
    }) => {
      await calm(page, kind);
      const head = await on(page, 'head');
      const f = await finger(page);
      let at = { x: head.x, y: head.y };
      await f.down(at);
      await until(page, (s) => s.held && s.motion.heldFor >= 0.15, 'held, the lift in');
      for (const [dx, dy] of [
        [0, -60],
        [50, -40],
        [-80, 30],
      ]) {
        at = { x: at.x + dx, y: at.y + dy };
        await f.move(at);
        await onCursor(page, `the collar over the finger at (${at.x}, ${at.y})`);
        const d = (await snapshot(page)).drag;
        expect(d.pointer.y - d.aim.y, 'aimed above the finger').toBeGreaterThan(10);
        await grounded(page, `(${at.x}, ${at.y})`);
      }
      await f.up();
      await f.done();
      await until(page, (s) => !s.held, 'let go');
    });
  });
}
