// Camera and input acts for tools/capture-invitation.mjs (its header lists them: pan, lift,
// sweep): the view slid, turned and zoomed with the mouse's buttons or fingers, NEWT carried up
// high with the grabbed point's distance from the press measured as it goes, and where he looks
// over the whole screen. They take the capture tool's own helpers (cameraActs), so a press, a
// sweep and a pinch work here as they do there.

/**
 * The acts, given the capture tool's helpers: `point(page, part)` (a point on NEWT, client px),
 * `presser(page, size, button?)` (one press: a finger or the mouse), `sweep(page, size, from,
 * to, ms?, button?)` (a drag on empty space), `pinch(page, at, d0, d1, ms?)`, `along(move,
 * path, ms)` (a press along a path by the clock) and `sleep(ms)`.
 * @param {{point: Function, presser: Function, sweep: Function, pinch: Function, along: Function, sleep: (ms: number) => Promise<void>}} kit
 */
export function cameraActs({ point, presser, sweep, pinch, along, sleep }) {
  /** Two fingers through CDP dragged together from `from` by `by`, `gap` px apart, `ms` long. */
  async function twoFingerDrag(page, from, by, gap = 120, ms = 900) {
    const cdp = await page.context().newCDPSession(page);
    const points = (k) => [
      { x: from.x - gap / 2 + by.x * k, y: from.y + by.y * k, id: 1 },
      { x: from.x + gap / 2 + by.x * k, y: from.y + by.y * k, id: 2 },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
    await along(
      (k) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(k) }),
      (k) => k,
      ms,
    );
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
  /**
   * The view slid, turned, zoomed and slid back, then Reset Camera: on a desktop the mouse's left
   * button pans, its right one turns, the wheel zooms; on a phone two fingers pan, one turns and a
   * pinch zooms.
   */
  async function panTurnZoom(page, size) {
    const body = await point(page, 'body');
    const low = { x: size.w * 0.7, y: Math.min(size.h * 0.75, body.y + size.h * 0.15) };
    const slide = { x: -size.w * 0.3, y: -size.h * 0.15 };
    if (size.phone) await twoFingerDrag(page, low, slide);
    else await sweep(page, size, low, { x: low.x + slide.x, y: low.y + slide.y }, 900, 'left');
    await sleep(700);
    await sweep(page, size, { x: size.w * 0.2, y: low.y }, { x: size.w * 0.65, y: low.y + 20 }, 900, 'right');
    await sleep(900);
    if (size.phone) {
      await pinch(page, { x: size.w / 2, y: low.y }, 60, 200);
      await sleep(600);
      await pinch(page, { x: size.w / 2, y: low.y }, 220, 70);
    } else {
      await page.mouse.move(size.w / 2, low.y);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -120);
        await sleep(60);
      }
      await sleep(600);
      for (let i = 0; i < 9; i++) {
        await page.mouse.wheel(0, 120);
        await sleep(60);
      }
    }
    await sleep(700);
    const back = { x: size.w * 0.35, y: size.h * 0.35 };
    if (size.phone) await twoFingerDrag(page, back, { x: size.w * 0.3, y: size.h * 0.2 });
    else await sweep(page, size, back, { x: back.x + size.w * 0.3, y: back.y + size.h * 0.2 }, 900, 'left');
    await sleep(800);
    await page.locator('[data-camera-open]').click();
    await page.locator('[data-reset-camera]').click();
    await sleep(300);
    await page.locator('[data-camera-open]').click();
  }
  /**
   * A press on his body held into a grab, carried up near the top of the screen, across and back,
   * held a moment and let go; the grabbed point's distance from the press, CSS px, each frame the
   * press moves (window.__capture.grip), for the report.
   */
  async function liftHigh(page, size) {
    const from = await point(page, 'body');
    const press = await presser(page, size);
    // (A finger carries him 48 px over itself.)
    const lift = size.phone ? 48 : 0;
    const grip = [];
    const measure = async (p) => {
      const g = await page.evaluate(() => window.__invitation.grabbed());
      if (g) grip.push(Math.round(Math.hypot(g.x - p.x, g.y - (p.y - lift)) * 10) / 10);
    };
    const moveTo = async (p) => {
      await press.move(p);
      await measure(p);
    };
    await press.down(from);
    await sleep(320); // (held past the 280 ms that makes it a grab)
    const top = { x: from.x, y: Math.max(60, size.h * 0.12) };
    await along(moveTo, (k) => ({ x: from.x, y: from.y + (top.y - from.y) * k }), 1200);
    const amp = Math.min(size.w * 0.3, 260);
    await along(moveTo, (k) => ({ x: top.x + amp * Math.sin(k * Math.PI * 2), y: top.y }), 1800);
    await sleep(500);
    await press.up();
    await press.done();
    await page.evaluate((g) => {
      /** @type {any} */ (window).__capture.grip = g;
    }, grip);
  }
  /**
   * Where he looks over the whole screen: the cursor in rows across it, top to bottom, on a
   * desktop; a finger held still at a grid of spots on a phone (each held 0.7 s, longer than a
   * floor tap, so he doesn't walk; a moving finger would turn the camera).
   */
  async function lookSweep(page, size) {
    const rows = size.phone ? 6 : 5;
    const ys = Array.from({ length: rows }, (_, i) => size.h * (0.06 + (0.8 * i) / (rows - 1)));
    if (!size.phone) {
      const move = (p) => page.mouse.move(p.x, p.y);
      for (const [i, y] of ys.entries()) {
        const [a, b] = i % 2 ? [size.w * 0.97, size.w * 0.03] : [size.w * 0.03, size.w * 0.97];
        await along(move, (k) => ({ x: a + (b - a) * k, y }), 2200);
        await sleep(250);
      }
      return;
    }
    const press = await presser(page, size);
    for (const y of ys)
      for (const x of [0.1, 0.5, 0.9].map((k) => size.w * k)) {
        await press.down({ x, y });
        await sleep(700);
        await press.up();
        await sleep(150);
      }
    await press.done();
  }

  return { panTurnZoom, liftHigh, lookSweep };
}
