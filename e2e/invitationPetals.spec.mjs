// The page's rose petals on /invitation/ (src/invitation/petalLayer.js, petals.js): a fixed layer
// over the whole page that every press goes through; the mouse moving over the toy trails petals
// and a click bursts a ring of them; on a phone a finger dragging trails them and a finger held
// still keeps a few coming; with Rose Petals off (Settings) or reduced motion, none at all; and
// it sleeps once they've gone. Every wait is on a state (?test's snapshot), never a duration.
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

test.describe('with a mouse', () => {
  test('the layer is over the whole page, lets every press through, sleeps at rest, and has no renderer till a move', async ({
    page,
  }) => {
    await toyUp(page);
    const layer = page.locator('canvas.inv-petals');
    await expect(layer).toHaveCount(1);
    const style = await layer.evaluate((el) => {
      const s = getComputedStyle(el);
      return { pe: s.pointerEvents, pos: s.position, z: Number(s.zIndex) };
    });
    expect(style).toEqual({ pe: 'none', pos: 'fixed', z: 4 });
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

  test('a drag across NEWT and the floor trails petals as it goes', async ({ page }) => {
    await toyUp(page);
    const at = await page.evaluate(() => window.__invitation.screen('body'));
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    const before = (await petals(page)).emitted.trail;
    await page.mouse.move(at.x + 160, at.y - 40, { steps: 16 });
    await expect.poll(async () => (await petals(page)).emitted.trail).toBeGreaterThan(before + 3);
    await page.mouse.up();
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

  test('over the envelope too, the mouse trails petals and the letter keeps floating', async ({ page }) => {
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
});
