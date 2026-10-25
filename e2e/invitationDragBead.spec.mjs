// The 'bead' drag kind in the browser (?test&calm&drag=bead): the shared drag checks
// (e2e/lib/drag.mjs dragDescribe), then what only the page can measure: his collar within 1 px of
// the cursor after a flick up and down, 100 px up the screen held still carrying him away about as
// far as design.md's level plane (1.45-1.75 on a phone, 0.90-1.10 on a desktop, at 36°), the wheel
// moving his hold height and not the camera, a finger 80 px under his collar, a second finger's
// lift leaving him held once it lifts, and a sideways throw landing where the ring waited for
// him. Every wait is on a state, never a duration.
import { test, expect } from '@playwright/test';
import { calm, dragDescribe, finger, fingers, glide, grab, on, onCursor, snapshot, until } from './lib/drag.mjs';

dragDescribe('bead');

/** The camera to `yaw`, 36° up, home zoom, and still (two reads alike). */
async function frame(page, yaw = 0) {
  await page.evaluate((y) => window.__invitation.view({ yaw: y, elevation: (36 * Math.PI) / 180, zoom: 1 }), yaw);
  let was = '';
  await expect
    .poll(
      async () => {
        const c = (await snapshot(page)).camera;
        const now = [c.yaw, c.elevation, c.distance].map((v) => v.toFixed(4)).join();
        const still = !c.turning && now === was && Math.abs(c.elevation - (36 * Math.PI) / 180) < 1e-3;
        was = now;
        return still;
      },
      { message: 'the camera still at 36°', timeout: 20_000 },
    )
    .toBe(true);
}

/** Waits until the hold has settled: his anchor and hold height alike across two reads. */
async function settled(page, message) {
  let was = '';
  await expect
    .poll(
      async () => {
        const d = (await snapshot(page)).drag;
        if (!d.anchor) return false;
        const now = [d.anchor.x, d.anchor.y, d.anchor.z, d.holdY].map((v) => v.toFixed(3)).join();
        const still = now === was;
        was = now;
        return still;
      },
      { message, timeout: 20_000, intervals: [150] },
    )
    .toBe(true);
  return (await snapshot(page)).drag;
}

for (const [name, viewport, lo, hi] of [
  ['a desktop', { width: 1280, height: 800 }, 0.9, 1.1],
  ['a phone', { width: 390, height: 844 }, 1.45, 1.75],
]) {
  test.describe(`?drag=bead, on ${name}`, () => {
    test.use({ viewport });

    test(`bead on ${name}: flicked up and down his collar is back within 1 px of the cursor; 100 px up held still carries him ${lo}-${hi} away at 36°, level`, async ({
      page,
    }) => {
      await calm(page, 'bead');
      await frame(page);
      let cursor = await grab(page, 'head');
      const a = await settled(page, 'held still at the hold height');
      expect(a.kind).toBe('bead');
      cursor = await glide(page, cursor, { x: cursor.x, y: cursor.y - 100 }, 4);
      await onCursor(page, 'after a flick up', 1);
      const b = await settled(page, 'settled after 100 px up');
      expect(b.depth - a.depth, 'away').toBeGreaterThanOrEqual(lo);
      expect(b.depth - a.depth, 'away').toBeLessThanOrEqual(hi);
      expect(Math.abs(b.anchor.y - a.anchor.y), 'level').toBeLessThan(0.02);
      await glide(page, cursor, { x: cursor.x, y: cursor.y + 100 }, 4);
      await onCursor(page, 'after a flick down', 1);
      expect((await snapshot(page)).drag.lowestFoot, 'his feet over the floor').toBeGreaterThan(0.02);
      await page.mouse.up();
      await until(page, (s) => !s.held, 'let go');
    });
  });
}

test.describe('?drag=bead, on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('bead: a wheel notch while he’s held moves his hold height 0.1 and leaves the camera be', async ({ page }) => {
    await calm(page, 'bead');
    await frame(page);
    await grab(page, 'head');
    const a = await settled(page, 'held still');
    const distance = (await snapshot(page)).camera.distance;
    await page.mouse.wheel(0, 100);
    await until(page, (s) => s.drag.holdY < a.holdY - 0.05, 'lowered');
    const b = await settled(page, 'lowered and still');
    expect(a.holdY - b.holdY).toBeGreaterThan(0.085);
    expect(a.holdY - b.holdY).toBeLessThan(0.115);
    expect((await snapshot(page)).camera.distance, 'no zoom').toBeCloseTo(distance, 6);
    await page.mouse.up();
  });

  test('bead: thrown across, he lands where the ring waited for him (within 0.15)', async ({ page }) => {
    await calm(page, 'bead');
    await frame(page);
    let cursor = await grab(page, 'head');
    await settled(page, 'held still');
    cursor = await glide(page, cursor, { x: cursor.x - 200, y: cursor.y }, 6);
    await settled(page, 'to the left');
    // (A sweep right, let go while it's still going.)
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(cursor.x + i * 40, cursor.y);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    }
    await page.mouse.up();
    await until(page, (s) => !s.held && s.drag.ring !== null, 'let go, the ring out');
    const ring = (await snapshot(page)).drag.ring;
    await until(page, (s) => s.state !== 'held' && s.lift < 1e-3 && !s.held, 'landed', 30_000);
    const s = await snapshot(page);
    expect(Math.hypot(s.pos.x - ring.x, s.pos.z - ring.z), 'where the ring was').toBeLessThan(0.15);
  });
});

test.describe('?drag=bead, on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('bead: carried with a finger, his collar is 80 ± 2 px above it', async ({ page }) => {
    await calm(page, 'bead');
    await frame(page);
    const head = await on(page, 'body');
    const f = await finger(page);
    let at = { x: head.x, y: head.y + 40 };
    await f.down(at);
    await until(page, (s) => s.held && s.motion.heldFor >= 0.2, 'held, the lift in');
    at = { x: at.x + 20, y: at.y + 20 };
    await f.move(at);
    await onCursor(page, 'the collar where it’s aimed');
    const d = (await snapshot(page)).drag;
    expect(d.pointer.y - d.aim.y, 'aimed 80 px above the finger').toBeGreaterThan(78);
    expect(d.pointer.y - d.aim.y, 'aimed 80 px above the finger').toBeLessThan(82);
    expect(Math.abs(d.pointer.x - d.aim.x)).toBeLessThan(1);
    await f.up();
    await f.done();
    await until(page, (s) => !s.held, 'let go');
  });

  test('bead: a second finger dragged up lifts him; once it lifts, he is still held, and the next move of the first puts his collar back over it', async ({
    page,
  }) => {
    await calm(page, 'bead');
    const body = await on(page, 'body');
    const f = await fingers(page);
    const at = { x: body.x, y: body.y + 40 };
    await f.start(1, at);
    await f.move(1, { x: at.x, y: at.y - 20 });
    await until(page, (s) => s.held && s.motion.heldFor >= 0.2, 'held, the lift in');
    const y0 = (await snapshot(page)).drag.holdY;
    let two = { x: Math.min(370, at.x + 120), y: 600 };
    await f.start(2, two);
    for (let i = 0; i < 10; i++) {
      two = { x: two.x, y: two.y - 10 };
      await f.move(2, two);
    }
    await until(page, (s) => s.drag.holdY > y0 + 0.4, 'the second finger lifted him');
    await f.end(2);
    const heldFor = (await snapshot(page)).motion.heldFor;
    // (Ends on a let-go too, so a dropped hold fails at once rather than timing out.)
    await until(page, (s) => !s.held || s.motion.heldFor >= heldFor + 0.3, '0.3 s on, or let go');
    expect((await snapshot(page)).held, 'still held').toBe(true);
    await f.move(1, { x: at.x + 10, y: at.y - 20 });
    await onCursor(page, 'over the finger once more');
    await f.end(1);
    await f.done();
    await until(page, (s) => !s.held, 'let go');
  });
});
