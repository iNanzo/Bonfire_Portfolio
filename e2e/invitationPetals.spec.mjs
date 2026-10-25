// The page's rose petals on /invitation/ (src/invitation/petalLayer.js, petals.js): a fixed layer
// over the stage and under the HUD and the dialogue (over the envelope while it's up) that every
// press goes through; the mouse moving over the toy trails petals and a click bursts a ring of
// them, but none over a button, the toolbar, the pad, Settings or the dialogue, and no trail while
// NEWT is carried; on a phone a finger dragging trails them and a finger held still keeps a few
// coming; each about 10-16 CSS px long, whatever the screen; with Rose Petals off (Settings) or
// reduced motion, none at all; and it sleeps once they've gone. Every wait is on a state (?test's
// snapshot), never a duration.
import { test, expect } from '@playwright/test';

const PAGE = '/invitation/?test&calm&seed=3';
/** The layer's snapshot (petalLayer.js snapshot), null without one. */
const petals = (page) => page.evaluate(() => window.__invitation.petals());
/** The toy up, NEWT in, the hooks there. */
async function toyUp(page, path = PAGE) {
  await page.goto(path);
  await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__invitation?.petals)), { timeout: 30_000 }).toBe(true);
}
/** A point on the floor clear of NEWT and the toolbar, as a share of the screen. */
const clear = (page, fx = 0.2, fy = 0.35) => {
  const vp = page.viewportSize();
  return { x: vp.width * fx, y: vp.height * fy };
};
/** Touches through CDP (as a phone's finger). */
async function toucher(page) {
  const cdp = await page.context().newCDPSession(page);
  return (type, points = []) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 })),
    });
}
const total = (emitted) => Object.values(emitted).reduce((a, b) => a + b, 0);
/** The toy's snapshot (main.js ?test). */
const toy = (page) => page.evaluate(() => window.__invitation.snapshot());
/** Where the layer sits among the stage's children, and its z-index. */
const stacking = (page) =>
  page.evaluate(() => {
    const kids = [...document.querySelector('[data-stage]').children];
    const at = (sel) => kids.findIndex((k) => k.matches(sel));
    const layer = document.querySelector('canvas.inv-petals');
    return {
      canvas: at('canvas.inv-canvas'),
      petals: at('canvas.inv-petals'),
      hud: at('.inv-hud'),
      talk: at('.inv-talk'),
      z: getComputedStyle(layer).zIndex,
    };
  });
/** The middle of an element's box. */
const middle = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test.describe('with a mouse', () => {
  test('the layer covers the page over the stage and under the HUD, lets every press through, sleeps at rest, and has no renderer till a move', async ({
    page,
  }) => {
    await toyUp(page);
    const layer = page.locator('canvas.inv-petals');
    await expect(layer).toHaveCount(1);
    const style = await layer.evaluate((el) => {
      const s = getComputedStyle(el);
      return { pe: s.pointerEvents, pos: s.position };
    });
    expect(style).toEqual({ pe: 'none', pos: 'fixed' });
    // (After the stage's canvas and before the HUD, in their own order: no z-index of its own.)
    const order = await stacking(page);
    expect(order.canvas).toBeGreaterThanOrEqual(0);
    expect(order.petals).toBeGreaterThan(order.canvas);
    expect(order.hud).toBeGreaterThan(order.petals);
    expect(order.z).toBe('auto');
    await expect.poll(async () => (await petals(page)).running).toBe(false);
    expect((await petals(page)).on).toBe(true);
    // (No WebGL context at boot: it comes with the first move that may shed petals.)
    expect((await petals(page)).gpu).toBe('none');
    const a = clear(page);
    await page.mouse.move(a.x, a.y);
    await expect.poll(async () => (await petals(page)).gpu).toBe('up');
  });

  test('the mouse moving over the toy trails petals, a click bursts a ring, and then it sleeps', async ({ page }) => {
    await toyUp(page);
    const a = clear(page, 0.15, 0.3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(a.x + 300, a.y + 60, { steps: 20 });
    await expect.poll(async () => (await petals(page)).emitted.trail).toBeGreaterThan(4);
    const moved = await petals(page);
    expect(moved.live).toBeGreaterThan(0);
    expect(moved.emitted.ring).toBe(0);
    await page.mouse.down();
    await page.mouse.up();
    const rung = await petals(page);
    expect(rung.emitted.ring).toBeGreaterThanOrEqual(10);
    expect(rung.emitted.ring).toBeLessThanOrEqual(14);
    expect(rung.running).toBe(true);
    // (Once they've all gone, no more frames.)
    await expect.poll(async () => (await petals(page)).running, { timeout: 15_000 }).toBe(false);
    expect((await petals(page)).live).toBe(0);
  });

  test('the mouse leaving the window and coming back elsewhere sheds nothing across the gap', async ({ page }) => {
    await toyUp(page);
    const a = clear(page, 0.1, 0.3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(a.x + 60, a.y, { steps: 6 });
    await expect.poll(async () => (await petals(page)).gpu).toBe('up');
    const before = (await petals(page)).emitted.trail;
    // (It leaves the window: the browser's pointerout with no element it went to.)
    await page.evaluate(() =>
      document.dispatchEvent(new PointerEvent('pointerout', { isPrimary: true, pointerType: 'mouse', bubbles: true })),
    );
    const b = clear(page, 0.85, 0.7);
    await page.mouse.move(b.x, b.y);
    expect((await petals(page)).emitted.trail, 'nothing along a path it never took').toBe(before);
    // (From there it trails as usual.)
    await page.mouse.move(b.x - 200, b.y, { steps: 16 });
    await expect.poll(async () => (await petals(page)).emitted.trail).toBeGreaterThan(before);
  });

  test('carrying NEWT trails nothing across him (only the grab’s ring); put down, the floor trails again', async ({
    page,
  }) => {
    await toyUp(page);
    const at = await page.evaluate(() => window.__invitation.screen('body'));
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await expect.poll(async () => (await toy(page)).held, { message: 'held' }).toBe(true);
    const grab = await petals(page);
    expect(grab.emitted.ring, 'a ring at the grab').toBeGreaterThanOrEqual(10);
    for (let i = 1; i <= 16; i++) await page.mouse.move(at.x + i * 10, at.y - i * 4);
    for (let i = 15; i >= 0; i--) await page.mouse.move(at.x + i * 10, at.y - 64 - i * 2);
    expect((await toy(page)).held).toBe(true);
    expect((await petals(page)).emitted.trail, 'none while he is carried').toBe(grab.emitted.trail);
    await page.mouse.up();
    await expect.poll(async () => (await toy(page)).held, { message: 'let go' }).toBe(false);
    const a = clear(page, 0.15, 0.3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(a.x + 300, a.y + 60, { steps: 20 });
    await expect.poll(async () => (await petals(page)).emitted.trail).toBeGreaterThan(grab.emitted.trail + 3);
  });

  test('over the toolbar, the camera pad, Settings and the dialogue: no trail and no burst', async ({ page }) => {
    await toyUp(page);
    // (Its renderer up from a move over the floor, then still.)
    const a = clear(page);
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(a.x + 120, a.y, { steps: 8 });
    await expect.poll(async () => (await petals(page)).emitted.trail).toBeGreaterThan(0);
    const start = (await petals(page)).emitted;
    // Along the toolbar, button to button, its labels showing.
    const tools = page.locator('.inv-toolbar .inv-tool:visible');
    const first = await middle(tools.first());
    const last = await middle(tools.last());
    await page.mouse.move(first.x, first.y);
    await page.mouse.move(last.x, last.y, { steps: 30 });
    await page.mouse.move(first.x, first.y + 4, { steps: 30 });
    // Camera opens the pad; a pad control; Settings opens its sheet.
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const pad = page.locator('.inv-camera-pad');
    await expect(pad).toBeVisible();
    await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
    const p0 = await middle(pad.locator('button:visible').first());
    const p1 = await middle(pad.locator('button:visible').last());
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.move(p1.x, p1.y, { steps: 20 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.locator('.inv-sheet')).toBeVisible();
    const sheet = await page.locator('.inv-sheet').boundingBox();
    await page.mouse.move(sheet.x + 20, sheet.y + 20);
    await page.mouse.move(sheet.x + sheet.width - 20, sheet.y + sheet.height / 2, { steps: 20 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.inv-sheet')).toBeHidden();
    let now = (await petals(page)).emitted;
    expect(now.trail, 'no trail over the toolbar, the pad or Settings').toBe(start.trail);
    expect(now.ring, 'no burst on a button').toBe(start.ring);
    // Replay Intro: no burst over the dialogue it opens, and none moving over its box.
    await page.getByRole('button', { name: 'Replay Intro', exact: true }).click();
    const box = page.locator('.inv-talk-box');
    await expect(box).toBeVisible();
    const order = await stacking(page);
    expect(order.talk, 'the dialogue over the layer').toBeGreaterThan(order.petals);
    const b = await box.boundingBox();
    await page.mouse.move(b.x + 20, b.y + b.height / 2);
    await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2, { steps: 24 });
    now = (await petals(page)).emitted;
    expect(now.trail, 'no trail over the dialogue box').toBe(start.trail);
    expect(now.ring, 'no burst from Replay Intro').toBe(start.ring);
  });

  test('its petals are about 10-16 CSS px long, not sized by the screen', async ({ page }) => {
    await toyUp(page);
    const a = clear(page);
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(a.x + 60, a.y, { steps: 4 });
    await expect.poll(async () => (await petals(page)).gpu).toBe('up');
    const px = (await petals(page)).petalPx;
    expect(px * 0.75).toBeGreaterThanOrEqual(9);
    expect(px * 1.3).toBeLessThanOrEqual(17);
    const texels = (await petals(page)).texels;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect.poll(async () => (await petals(page)).texels[0]).not.toBe(texels[0]);
    expect((await petals(page)).petalPx, 'the same on a bigger screen').toBeCloseTo(px, 5);
  });

  test('with Rose Petals off, none at all; on again, they come back', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('invitation.look.v1', JSON.stringify({ petals: false }));
      } catch {
        // (no storage)
      }
    });
    await toyUp(page);
    expect((await petals(page)).on).toBe(false);
    const a = clear(page);
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(a.x + 300, a.y + 40, { steps: 20 });
    await page.mouse.down();
    await page.mouse.up();
    const off = await petals(page);
    expect(total(off.emitted)).toBe(0);
    expect(off.live).toBe(0);
    expect(off.running).toBe(false);
    expect(off.gpu, 'no renderer made while they are off').toBe('none');
    // The Settings switch shows it off; switched on, a move trails them again.
    await page.getByRole('button', { name: 'Settings' }).click();
    const sw = page.getByRole('switch', { name: 'Rose Petals' });
    await expect(sw).not.toBeChecked();
    await sw.scrollIntoViewIfNeeded();
    await sw.click();
    await expect.poll(async () => (await petals(page)).on).toBe(true);
    await page.keyboard.press('Escape');
    await page.mouse.move(a.x, a.y + 100);
    await page.mouse.move(a.x + 300, a.y + 140, { steps: 20 });
    await expect.poll(async () => (await petals(page)).emitted.trail).toBeGreaterThan(0);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('invitation.look.v1') ?? '{}'));
    expect(stored.petals).toBe(true);
  });

  test('with reduced motion, none at all', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toyUp(page);
    const a = clear(page);
    await page.mouse.move(a.x, a.y);
    await page.mouse.move(a.x + 300, a.y + 40, { steps: 20 });
    await page.mouse.down();
    await page.mouse.up();
    const s = await petals(page);
    expect(s.on).toBe(false);
    expect(total(s.emitted)).toBe(0);
    expect(s.gpu, 'no renderer made').toBe('none');
  });

  test('over the envelope too, the mouse trails petals over it and the letter keeps floating; once it’s gone the layer goes back under the HUD', async ({
    page,
  }) => {
    await page.goto('/invitation/?test&envelope&calm&seed=3');
    await expect(page.locator('.inv-envelope')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__invitation?.envelope()?.state ?? null), { timeout: 30_000 })
      .toBe('floating');
    const vp = page.viewportSize();
    await page.mouse.move(vp.width * 0.9, vp.height * 0.9);
    await page.mouse.move(vp.width * 0.5, vp.height * 0.5, { steps: 12 });
    await expect.poll(async () => (await petals(page)).emitted.trail).toBeGreaterThan(0);
    expect((await page.evaluate(() => window.__invitation.envelope())).state).toBe('floating');
    // (Over the envelope's z-index 3 while it's up.)
    expect((await stacking(page)).z).toBe('4');
    await page.keyboard.press('Escape');
    await expect(page.locator('.inv-envelope')).toHaveCount(0, { timeout: 15_000 });
    await page.mouse.move(vp.width * 0.2, vp.height * 0.3);
    await page.mouse.move(vp.width * 0.4, vp.height * 0.35, { steps: 12 });
    await expect.poll(async () => (await stacking(page)).z).toBe('auto');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('a finger dragging trails petals, a tap bursts a ring, and a finger held still keeps a few coming', async ({
    page,
  }) => {
    await toyUp(page);
    const touch = await toucher(page);
    const a = clear(page, 0.2, 0.3);
    await touch('touchStart', [a]);
    await expect.poll(async () => (await petals(page)).emitted.ring).toBeGreaterThanOrEqual(10);
    for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: a.x + i * 20, y: a.y + i * 6 }]);
    await expect.poll(async () => (await petals(page)).emitted.trail).toBeGreaterThan(3);
    // Held still where it stopped: still more.
    const held = (await petals(page)).emitted.trail;
    await expect.poll(async () => (await petals(page)).emitted.trail, { timeout: 10_000 }).toBeGreaterThan(held + 2);
    await touch('touchEnd', []);
    await expect.poll(async () => (await petals(page)).running, { timeout: 15_000 }).toBe(false);
  });

  test('a finger carrying NEWT, moving or held still, trails nothing; the petals are a little smaller than on a desktop', async ({
    page,
  }) => {
    await toyUp(page);
    const touch = await toucher(page);
    const at = await page.evaluate(() => window.__invitation.screen('body'));
    await touch('touchStart', [at]);
    await expect.poll(async () => (await toy(page)).held, { message: 'held' }).toBe(true);
    const grab = (await petals(page)).emitted.trail;
    for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: at.x + i * 8, y: at.y - i * 10 }]);
    // (Held still up there while the toy's clock goes on: still none.)
    const c0 = await page.evaluate(() => window.__invitation.clock());
    await expect.poll(() => page.evaluate(() => window.__invitation.clock())).toBeGreaterThan(c0 + 0.6);
    expect((await toy(page)).held).toBe(true);
    expect((await petals(page)).emitted.trail, 'none while he is carried').toBe(grab);
    await touch('touchEnd', []);
    const px = (await petals(page)).petalPx;
    expect(px * 0.75).toBeGreaterThanOrEqual(8);
    expect(px * 1.3).toBeLessThanOrEqual(15);
  });
});
