// The shared drag checks (e2e/lib/drag.mjs) for carrying NEWT, the bead hold: his collar under
// the cursor, the blob in the ring’s middle under him, his lowest foot over the floor, no gap on
// a down drag, a finger's collar where it's aimed, Ground Cues. Settings has no Drag (the bead is the only
// carry); Ground Cues shows the one that plays (In the Mix until one is picked, unless the admin's
// Default look has one: the specs never depend on it), and a pick is kept in invitation.look.v1
// for the next visit; an old address's ?drag=level carries him with the bead
// too. e2e/invitationDragBead.spec.mjs has the bead's own checks.
import { test, expect } from '@playwright/test';
import { calm, dragDescribe, glide, grab, onCursor, snapshot, until } from './lib/drag.mjs';

dragDescribe();

test.describe('Settings', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('no Drag row; Ground Cues shows the one that plays, and a pick is kept for the next visit', async ({ page }) => {
    await calm(page);
    await page.locator('[data-look-open]').click();
    await expect(page.locator('fieldset', { hasText: 'Ground Cues' })).toBeVisible();
    await expect(page.locator('input[name="inv-drag"]')).toHaveCount(0);
    await expect(page.locator('legend', { hasText: /^Drag$/ })).toHaveCount(0);
    // Ground Cues: the one that plays checked, then a pick (another one) kept.
    await expect(page.locator('input[name="inv-ground"]:checked')).toHaveCount(1);
    const shown = await page.locator('input[name="inv-ground"]:checked').inputValue();
    await until(page, (s) => s.drag.groundCues === shown, `${shown} checked and playing`);
    const [pick, label] = shown === 'always' ? ['off', 'Off'] : ['always', 'Always'];
    await page.locator('fieldset', { hasText: 'Ground Cues' }).locator('label.inv-seg', { hasText: label }).click();
    await expect(page.locator(`input[name="inv-ground"][value="${pick}"]`)).toBeChecked();
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('invitation.look.v1'))).groundCues).toBe(pick);
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await until(page, (s) => s.drag.groundCues === pick, `${label} kept`);
  });

  test('an old address with ?drag=level carries him with the bead: its wheel and second finger, his collar on the cursor', async ({
    page,
  }) => {
    await calm(page, undefined, '&drag=level');
    expect((await snapshot(page)).drag.controls).toEqual({ wheel: true, secondFinger: true });
    const cursor = await grab(page, 'head');
    await glide(page, cursor, { x: cursor.x + 80, y: cursor.y - 100 });
    await onCursor(page, 'the collar on the cursor');
    await page.mouse.up();
    await until(page, (s) => !s.held, 'let go');
  });
});
