// Carrying NEWT and Give Device in a real browser (/invitation/, the production build), through
// `?test`'s window.__invitation and real input. Carried with a mouse, his collar comes under the
// cursor within 2 px once the grab has eased in (0.15 s), up and across; at the play area's
// edge he stops (the cursor carries on, he stays put, never sliding toward or away from the
// camera); his limbs swing against a quick drag and settle; held, he keeps the way he faced
// when grabbed, glances up now and then, and lands facing the same way; he thrashes now and then
// (an angry kick and flail, then back to hanging). Give Device's three presses sit him down with the
// tablet (visible in his hands), lie him on his stomach with it, each the way he was facing (no
// turn to the camera), and get him up; the button's label (the brain's deviceLabel) goes Give Device, Lie Down, Get
// Up. Every wait is on a state, never a duration (CI's software WebGL runs slower than real
// time).
import { test, expect } from '@playwright/test';

/** Collect the page's errors (uncaught ones, console errors) for the test to check. */
function watch(page, errors = []) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}
async function ready(page, path) {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
}
const snapshot = (page) => page.evaluate(() => window.__invitation.snapshot());
/** A point on NEWT (client px): 'head', 'body' or 'feet'. */
const on = (page, part) => page.evaluate((p) => window.__invitation.screen(p), part);
/** Waits until `pred(snapshot)` holds (states, never durations). */
const until = (page, pred, message, timeout = 20_000) =>
  expect.poll(async () => pred(await snapshot(page)), { message, timeout }).toBe(true);
/** Ready, calm (no wandering, no sitting by himself) and standing still in idle. */
async function calm(page) {
  await ready(page, '/invitation/?test&calm&seed=3');
  await until(page, (s) => s.state === 'idle' && s.clip === 'Idle', 'idle');
}
/** The mouse moved to `to` in `steps` moves (each a frame's worth of a drag). */
async function glide(page, from, to, steps = 6) {
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  return to;
}
/** Grabbed by his body with the mouse and lifted clear of the floor; returns where the cursor is. */
async function pickUp(page) {
  const body = await on(page, 'body');
  await page.mouse.move(body.x, body.y);
  await page.mouse.down();
  await until(page, (s) => s.held, 'held');
  return glide(page, body, { x: body.x, y: body.y - 120 });
}
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('carried with the mouse, his collar comes under the cursor within 2 px once the grab has eased in (0.15 s), up and across', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    let cursor = await pickUp(page);
    await until(page, (s) => s.motion.heldFor >= 0.15, 'the grab eased in');
    for (const [dx, dy] of [
      [0, 0],
      [0, -60],
      [90, -40],
      [-140, -60],
      [-60, 80],
    ]) {
      cursor = await glide(page, cursor, { x: cursor.x + dx, y: cursor.y + dy });
      // (Once the moves are in: the collar is where the last one put it.)
      await expect
        .poll(async () => gap((await snapshot(page)).motion.collar, cursor), {
          message: `the collar at (${cursor.x}, ${cursor.y})`,
        })
        .toBeLessThan(2);
    }
    await page.mouse.up();
    await until(page, (s) => s.state === 'idle' || s.state === 'flee', 'down again', 30_000);
    expect(errors).toEqual([]);
  });

  test('carried to the play area’s edge, he stops there: the cursor carries on, he stays put, never sliding toward or away from the camera', async ({
    page,
  }) => {
    await calm(page);
    // (Zoomed all the way out, the play area's sides come inside the screen.)
    await page.mouse.move(80, 120);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 400);
    await until(page, (s) => s.camera.distance >= s.cameraHome.distance * 1.9 && !s.camera.turning, 'zoomed out');
    let cursor = await pickUp(page);
    await until(page, (s) => s.motion.heldFor >= 0.15, 'the grab eased in');
    const start = (await snapshot(page)).motion;
    const depth = (a) => (a.x - start.anchor.x) * start.plane.x + (a.z - start.anchor.z) * start.plane.z;
    let stopped = null;
    for (let x = cursor.x - 40; x > 4; x -= 40) {
      cursor = await glide(page, cursor, { x, y: cursor.y }, 2);
      const m = (await snapshot(page)).motion;
      expect(Math.abs(depth(m.anchor)), 'on the plane he was grabbed on').toBeLessThan(1e-3);
      if (stopped) {
        expect(Math.hypot(m.anchor.x - stopped.x, m.anchor.z - stopped.z), 'stopped at the edge').toBeLessThan(0.01);
      } else if (m.pushed) stopped = { x: m.anchor.x, z: m.anchor.z };
    }
    expect(stopped, 'he reached the edge').not.toBeNull();
    await page.mouse.up();
  });

  test('his limbs swing against a quick drag, then settle while he hangs still', async ({ page }) => {
    await calm(page);
    const cursor = await pickUp(page);
    await until(page, (s) => s.motion.limp.weight === 1 && s.motion.limp.most < 0.03, 'hanging still');
    await glide(page, cursor, { x: cursor.x + 220, y: cursor.y }, 3);
    await until(page, (s) => s.motion.limp.most > 0.15, 'his limbs swung');
    await until(page, (s) => s.motion.limp.most < 0.05, 'and settled', 30_000);
    await page.mouse.up();
    await until(page, (s) => s.state === 'idle' || s.state === 'flee', 'down again', 30_000);
    await until(page, (s) => s.motion.limp.weight === 0, 'the limp layer off once he’s down');
  });

  test('held, he keeps the way he faced when grabbed, glances up at you now and then, and lands facing the same way', async ({
    page,
  }) => {
    await calm(page);
    const heading = (await snapshot(page)).heading;
    const off = (h) => Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading)));
    const cursor = await pickUp(page);
    await glide(page, cursor, { x: cursor.x + 160, y: cursor.y - 40 }, 4);
    await until(page, (s) => s.held && s.lookUp === 1, 'a glance up', 40_000);
    let s = await snapshot(page);
    expect(off(s.heading), 'held, facing as when grabbed').toBeLessThan(1e-3);
    expect(s.headPitch, 'his head up').toBeGreaterThan(-0.2);
    await until(page, (o) => o.held && o.lookUp === 0, 'and back down', 20_000);
    await page.mouse.up();
    await until(page, (o) => o.state === 'idle' || o.state === 'flee', 'down again', 30_000);
    s = await snapshot(page);
    expect(s.states).toContain('land');
    if (s.state === 'idle') expect(off(s.heading), 'landed, facing as when grabbed').toBeLessThan(1e-3);
  });

  test('held, he thrashes now and then: an angry kick and flail, then back to hanging', async ({ page }) => {
    await calm(page);
    await pickUp(page);
    await until(page, (s) => s.clip === 'Thrash', 'a thrash', 40_000);
    expect((await snapshot(page)).face).toBe('angry');
    await until(page, (s) => s.clip === 'Held' && s.held, 'back to hanging', 20_000);
    await page.mouse.up();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('Give Device, pressed on the toolbar (it reads Lie Down, then Get Up): sits him down with the tablet in his hands, lies him on his stomach with it, each the way he was facing, and gets him up', async ({
    page,
  }) => {
    const errors = watch(page);
    await calm(page);
    const device = async () => (await snapshot(page)).motion.device;
    expect(await device()).toMatchObject({ state: null, label: 'Give Device', shown: false });
    // (The toolbar's Give Device: it reads what its next press does, the brain's deviceLabel.)
    const button = page.locator('[data-button="Device"]');
    await expect(button).toHaveAccessibleName('Give Device');
    const press = () => button.tap();
    // (The way he faces as it's pressed: he keeps it, sitting and lying.)
    const heading = (await snapshot(page)).heading;
    const kept = async (what) => {
      const h = (await snapshot(page)).heading;
      expect(
        Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading))),
        `${what}: facing as he was`,
      ).toBeLessThan(1e-3);
    };
    await press();
    await until(page, (s) => s.state === 'deviceSit' && s.motion.device.shown, 'sitting with the tablet', 30_000);
    expect(await device()).toMatchObject({ state: 'sit', label: 'Lie Down', shown: true });
    await expect(button).toHaveAccessibleName('Lie Down');
    await expect(button).toHaveText('Lie Down');
    // The tablet in his hands, on screen.
    const at = (await device()).screen;
    const body = await on(page, 'body');
    const head = await on(page, 'head');
    expect(gap(at, body), 'by his body').toBeLessThan(head.r * 3);
    await kept('sitting');
    await press();
    await until(page, (s) => s.state === 'deviceLie' && s.motion.device.shown, 'lying with it', 30_000);
    await kept('lying');
    expect(await device()).toMatchObject({ state: 'lie', label: 'Get Up', shown: true });
    await expect(button).toHaveAccessibleName('Get Up');
    await press();
    await until(page, (s) => s.state === 'getUp', 'getting up');
    await until(page, (s) => s.state === 'idle', 'up', 30_000);
    expect(await device()).toMatchObject({ state: null, label: 'Give Device', shown: false });
    await expect(button).toHaveAccessibleName('Give Device');
    expect(errors).toEqual([]);
  });
});
