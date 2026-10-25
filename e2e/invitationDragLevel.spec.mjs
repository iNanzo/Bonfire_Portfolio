// The 'level' drag kind in the browser (?drag=level: holds/level.js): the shared drag checks
// (e2e/lib/drag.mjs, him lifted high with the wheel, as level lifts him), then level's own. Held,
// Ground Cues are on by default (the ring under him); a move up the screen carries him away
// across the floor at his hold height and one across never in depth, his collar on the cursor
// and his facing the one he had as he was grabbed;
// a wheel notch raises him 0.1 and the camera stays put, 30 of them stop at 2.4 over his hang
// height; an orbit down to 12° mid-hold keeps his collar on the cursor; a down drag keeps his
// lowest foot 0.02 or more over the floor. On a phone his collar is 48 px over the finger and a
// second finger dragged 100 px up raises him 0.8, never pinching. Every wait is on a state
// (snapshot().drag through ?test), never a duration. Playwright only.
import { test, expect } from '@playwright/test';
import { calm, dragDescribe, fingers, gap, glide, grab, on, onCursor, snapshot, until } from './lib/drag.mjs';

dragDescribe('level');

/** His hold height once it's stopped moving (two reads alike). */
async function steadyHold(page, message) {
  let was = NaN;
  await expect
    .poll(
      async () => {
        const y = (await snapshot(page)).drag.holdY;
        const still = Math.abs(y - was) < 1e-4;
        was = y;
        return still;
      },
      { message, timeout: 20_000 },
    )
    .toBe(true);
  return was;
}

test.describe('?drag=level, on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('level: held, the ring is under him by default; 100 px up carries him away about 1 at his hold height, 100 px across never in depth, his collar on the cursor, his facing as he was grabbed', async ({
    page,
  }) => {
    await calm(page, 'level');
    const heading = (await snapshot(page)).heading;
    let cursor = await grab(page, 'head');
    await until(page, (s) => s.drag.groundCues === 'always' && s.drag.ring?.alpha > 0.99, 'the ring, by default');
    const y0 = await steadyHold(page, 'at his hold height');
    const a = await snapshot(page);
    cursor = await glide(page, cursor, { x: cursor.x, y: cursor.y - 100 }, 10);
    await onCursor(page, 'up 100 px');
    await steadyHold(page, 'settled');
    const b = await snapshot(page);
    expect(b.drag.depth - a.drag.depth, 'away').toBeGreaterThan(0.85);
    expect(b.drag.depth - a.drag.depth, 'away').toBeLessThan(1.15);
    expect(Math.abs(b.drag.anchor.y - y0), 'at his hold height').toBeLessThan(0.02);
    await glide(page, cursor, { x: cursor.x + 100, y: cursor.y }, 10);
    await onCursor(page, 'across 100 px');
    const c = await snapshot(page);
    expect(Math.abs(c.drag.depth - b.drag.depth), 'no depth across').toBeLessThan(0.03);
    expect(
      gap({ x: c.drag.anchor.x, y: c.drag.anchor.z }, { x: b.drag.anchor.x, y: b.drag.anchor.z }),
      'across',
    ).toBeGreaterThan(0.45);
    // (He keeps the way he faced as he was grabbed: level never turns him to the camera or the move.)
    for (const s of [a, b, c]) expect(Math.abs(s.heading - heading), 'his facing kept').toBeLessThan(1e-3);
    await page.mouse.up();
  });

  test('level: a wheel notch up raises his hold height 0.1 and leaves the camera where it is; 30 of them stop 2.4 over his hang height', async ({
    page,
  }) => {
    await calm(page, 'level');
    const cursor = await grab(page, 'head');
    // (From further back, so he has room to come up the ray toward the camera.)
    await glide(page, cursor, { x: cursor.x, y: cursor.y - 150 }, 10);
    const y0 = await steadyHold(page, 'at his hold height');
    const distance = (await snapshot(page)).camera.distance;
    await page.mouse.wheel(0, -100);
    await until(page, (s) => Math.abs(s.drag.holdY - (y0 + 0.1)) < 0.015, 'a notch up');
    await onCursor(page, 'still on the cursor');
    expect((await snapshot(page)).camera.distance, 'no zoom').toBeCloseTo(distance, 6);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -100);
    const cap = y0 - 0.35 + 2.4;
    const top = await steadyHold(page, 'at the cap');
    expect(top, 'capped').toBeLessThan(cap + 0.01);
    expect(top, 'at the cap').toBeGreaterThan(cap - 0.02);
    const d = (await snapshot(page)).drag;
    expect(d.anchor.y, 'his collar under it').toBeLessThan(cap + 0.01);
    expect((await snapshot(page)).camera.distance, 'still no zoom').toBeCloseTo(distance, 6);
    await page.mouse.up();
  });

  test('level: an orbit down to 12° mid-hold keeps his collar on the cursor; a down drag keeps his lowest foot 0.02 over the floor', async ({
    page,
  }) => {
    await calm(page, 'level');
    let cursor = await grab(page, 'head');
    await onCursor(page, 'grabbed');
    await page.evaluate(() => window.__invitation.view({ elevation: (12 * Math.PI) / 180 }));
    let worst = 0;
    await expect
      .poll(
        async () => {
          const s = await snapshot(page);
          worst = Math.max(worst, s.drag.gap ?? 0);
          return Math.abs(s.camera.elevation - (12 * Math.PI) / 180) < 0.002;
        },
        { message: 'down to 12°', timeout: 20_000 },
      )
      .toBe(true);
    await onCursor(page, 'at 12°');
    expect(worst, 'the collar off the cursor during the orbit, px').toBeLessThan(6);
    await page.evaluate(() => window.__invitation.view({ elevation: (36 * Math.PI) / 180 }));
    await until(page, (s) => Math.abs(s.camera.elevation - (36 * Math.PI) / 180) < 0.002, 'back to 36°');
    await onCursor(page, 'at 36°');
    for (const dy of [60, 60, 60]) {
      cursor = await glide(page, cursor, { x: cursor.x, y: cursor.y + dy });
      await onCursor(page, `down to ${cursor.y}`);
      expect((await snapshot(page)).drag.lowestFoot, 'his lowest foot').toBeGreaterThan(0.02);
    }
    await page.mouse.up();
  });

  test('level: held high, its Ground Cues (the ring and the drop line) cost at most 2 draw calls a frame over Off, and no render target', async ({
    page,
  }) => {
    // (WebGL draw calls a frame, by the frame's time, and framebuffers made: before the page's scripts.)
    const count = () => {
      const rec = { draws: 0, fbs: 0, frames: new Map() };
      /** @type {any} */ (window).__draws = rec;
      for (const C of [WebGL2RenderingContext, WebGLRenderingContext])
        for (const k of [
          'drawElements',
          'drawArrays',
          'drawElementsInstanced',
          'drawArraysInstanced',
          'createFramebuffer',
        ]) {
          const f = C.prototype[k];
          if (!f) continue;
          C.prototype[k] = function (...a) {
            if (k === 'createFramebuffer') rec.fbs++;
            else rec.draws++;
            return f.apply(this, a);
          };
        }
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) =>
        raf((t) => {
          const d0 = rec.draws;
          cb(t);
          rec.frames.set(t, (rec.frames.get(t) ?? 0) + rec.draws - d0);
        });
    };
    // (Held and lifted high, the ring and the line both in where they're on: the most draw calls
    // of his last 20 frames, and the framebuffers made since the grab.)
    const held = async (p, look) => {
      await p.addInitScript(count);
      // (The page's own defaults when there's no look: none left from the other page in this context.)
      if (!look)
        await p.addInitScript(() => {
          try {
            localStorage.removeItem('invitation.look.v1');
          } catch {
            // (No storage: the defaults anyway.)
          }
        });
      await calm(p, 'level', look);
      const cursor = await grab(p, 'head');
      const fbs = await p.evaluate(() => /** @type {any} */ (window).__draws.fbs);
      await p.mouse.move(cursor.x, cursor.y);
      for (let i = 0; i < 3; i++) await p.mouse.wheel(0, -100);
      await until(p, (s) => s.drag.lowestFoot > 0.5, 'high');
      if (!look)
        await until(
          p,
          (s) => s.drag.line.visible && s.drag.line.alpha > 0.99 && s.drag.ring?.alpha > 0.99,
          'the cues in',
        );
      await steadyHold(p, 'still');
      const out = await p.evaluate(() => {
        const r = /** @type {any} */ (window).__draws;
        return { draws: Math.max(...[...r.frames.values()].slice(-20)), fbs: r.fbs };
      });
      await p.mouse.up();
      return { draws: out.draws, fbs: out.fbs - fbs };
    };
    const off = await held(page, { groundCues: 'off' });
    const cues = await held(await page.context().newPage(), undefined);
    expect(cues.draws - off.draws, 'the cues’ draw calls a frame').toBeLessThanOrEqual(2);
    expect(cues.draws - off.draws, 'the ring and the line drawn').toBeGreaterThan(0);
    expect(cues.fbs, 'no render target made while held').toBe(0);
    expect(off.fbs, 'no render target made while held, Off').toBe(0);
  });
});

test.describe('?drag=level, on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('level: his collar sits 48 px over the finger; a second finger dragged 100 px up raises him 0.8 and never zooms', async ({
    page,
  }) => {
    await calm(page, 'level');
    const head = await on(page, 'head');
    const f = await fingers(page);
    const at = { x: head.x, y: head.y + 60 };
    await f.start(1, at);
    await f.move(1, { x: at.x, y: at.y - 20 });
    await until(page, (s) => s.held && s.motion.heldFor >= 0.15, 'held, the lift in');
    await onCursor(page, 'over the finger');
    const d = (await snapshot(page)).drag;
    expect(d.pointer.y - d.aim.y, '48 px over the finger').toBeGreaterThan(46);
    expect(d.pointer.y - d.aim.y, '48 px over the finger').toBeLessThan(50);
    const y0 = await steadyHold(page, 'at his hold height');
    const distance = (await snapshot(page)).camera.distance;
    let two = { x: at.x + 120, y: 600 };
    await f.start(2, two);
    for (let i = 0; i < 10; i++) {
      two = { x: two.x, y: two.y - 10 };
      await f.move(2, two);
    }
    await until(page, (s) => Math.abs(s.drag.holdY - (y0 + 0.8)) < 0.05, '100 px up: 0.8 higher');
    expect((await snapshot(page)).camera.distance, 'no pinch').toBeCloseTo(distance, 6);
    await f.end(2);
    await onCursor(page, 'still over the finger');
    await f.end(1);
    await f.done();
    await until(page, (s) => !s.held, 'let go');
  });
});
