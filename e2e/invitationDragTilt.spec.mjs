// The 'tilt' drag kind in the browser (?test&calm&drag=tilt): the shared drag checks (e2e/lib/drag.mjs,
// the down drag's gap fixed, so no baseline), then its own that only a page can measure: carried
// up the screen he goes away and up at once (his depth along the camera's level axis and his
// height both grow), his collar on the cursor; hoisted to the stage's top his root goes over 1.2;
// a zoom mid-hold keeps his collar under the cursor; Ground Cues plays In the Mix by default (the
// ring once he's high, none while he's low and still); carried across and up and let go, he keeps
// the way he faced as he was grabbed until he's landed; and a finger carries him 48 px above itself.
// Every wait is on a state, never a duration.
import { test, expect } from '@playwright/test';
import { calm, dragDescribe, finger, glide, grab, on, onCursor, snapshot, until } from './lib/drag.mjs';

dragDescribe('tilt');

test.describe('?drag=tilt, its own checks on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('tilt: 100 px up the screen carries him away and lifts him at once, his collar on the cursor', async ({
    page,
  }) => {
    await calm(page, 'tilt');
    let cursor = await grab(page, 'head');
    cursor = await glide(page, cursor, { x: cursor.x, y: cursor.y - 60 });
    await onCursor(page, 'up 60 px');
    const a = (await snapshot(page)).drag;
    await glide(page, cursor, { x: cursor.x, y: cursor.y - 100 });
    await onCursor(page, 'up 100 px more');
    const b = (await snapshot(page)).drag;
    expect(b.depth - a.depth, 'away from the camera').toBeGreaterThan(0.25);
    expect(b.anchor.y - a.anchor.y, 'and up').toBeGreaterThan(0.2);
    await page.mouse.up();
    await until(page, (s) => !s.held, 'let go');
  });

  test('tilt: hoisted to the stage’s top, his root goes over 1.2', async ({ page }) => {
    await calm(page, 'tilt');
    const cursor = await grab(page, 'head');
    await glide(page, cursor, { x: cursor.x, y: 60 }, 16);
    await until(page, (s) => s.held && s.lift > 1.2, 'his root over 1.2');
    await onCursor(page, 'at the top');
    await page.mouse.up();
  });

  test('tilt: a zoom mid-hold keeps his collar under the cursor', async ({ page }) => {
    await calm(page, 'tilt');
    let cursor = await grab(page, 'head');
    cursor = await glide(page, cursor, { x: cursor.x, y: cursor.y - 80 });
    await onCursor(page, 'up 80 px');
    const d0 = (await snapshot(page)).camera.distance;
    await page.evaluate(() => window.__invitation.view({ zoom: 1.4 }));
    await until(page, (s) => s.held && Math.abs(s.camera.distance - d0) > 0.05 * d0, 'zoomed in');
    await until(page, (s) => !s.camera.turning, 'the zoom done');
    await onCursor(page, 'after the zoom');
    await glide(page, cursor, { x: cursor.x + 80, y: cursor.y - 40 });
    await onCursor(page, 'moved after the zoom');
    await page.mouse.up();
  });

  test('tilt: carried across and up, then let go, he keeps the way he faced as he was grabbed, held, falling and landed', async ({
    page,
  }) => {
    await calm(page, 'tilt');
    const off = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    // (Read held, falling and landing only: once he's up again, a fright may send him running.)
    let most = 0;
    let landed = false;
    const read = async () => {
      const s = await snapshot(page);
      const carried = s.held || s.state === 'fall' || s.state === 'land';
      if (carried) most = Math.max(most, off(s.drag.facing, f0));
      if (s.state === 'land') landed = true;
      return carried;
    };
    const f0 = (await snapshot(page)).drag.facing;
    let cursor = await grab(page, 'head');
    // (Each move read as it lands, so a turn eased in mid-sweep shows.)
    for (const to of [
      { x: cursor.x + 300, y: cursor.y },
      { x: cursor.x + 100, y: cursor.y - 160 },
      { x: cursor.x - 200, y: cursor.y - 120 },
    ]) {
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(cursor.x + ((to.x - cursor.x) * i) / 10, cursor.y + ((to.y - cursor.y) * i) / 10);
        await read();
      }
      cursor = to;
    }
    await page.mouse.up();
    await expect
      .poll(async () => !(await read()) && landed, { message: 'let go, fallen and landed', timeout: 20_000 })
      .toBe(true);
    expect(most, `turned ${((most * 180) / Math.PI).toFixed(2)}° off the way he faced`).toBeLessThan(Math.PI / 180);
  });

  test('tilt: Ground Cues plays In the Mix by default: no ring while he’s low and still, the ring once he’s high', async ({
    page,
  }) => {
    await calm(page, 'tilt');
    const cursor = await grab(page, 'head');
    await until(page, (s) => s.drag.groundCues === 'mix', 'In the Mix');
    await until(
      page,
      (s) => s.drag.lowestFoot < 0.5 && (s.drag.ring === null || s.drag.ring.alpha < 0.05),
      'low and still: no ring',
    );
    await glide(page, cursor, { x: cursor.x, y: cursor.y - 260 });
    await until(
      page,
      (s) => s.drag.lowestFoot > 0.5 && s.drag.ring !== null && s.drag.ring.alpha > 0.9,
      'high: the ring',
    );
    await page.mouse.up();
  });
});

test.describe('?drag=tilt, its own checks on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('tilt: a finger carries his collar 48 px above itself, within 2 px', async ({ page }) => {
    await calm(page, 'tilt');
    const head = await on(page, 'head');
    const f = await finger(page);
    let at = { x: head.x, y: head.y };
    await f.down(at);
    await until(page, (s) => s.held && s.motion.heldFor >= 0.15, 'held, the lift in');
    for (const [dx, dy] of [
      [0, 30],
      [40, 20],
    ]) {
      at = { x: at.x + dx, y: at.y + dy };
      await f.move(at);
      await onCursor(page, `over the finger at (${at.x}, ${at.y})`);
      const d = (await snapshot(page)).drag;
      expect(Math.abs(d.pointer.y - d.aim.y - 48), `48 px above (${d.pointer.y - d.aim.y})`).toBeLessThanOrEqual(2);
      expect(d.kind).toBe('tilt');
    }
    await f.up();
    await f.done();
    await until(page, (s) => !s.held, 'let go');
  });
});
