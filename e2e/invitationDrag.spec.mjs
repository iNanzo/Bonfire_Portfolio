// The shared drag checks (e2e/lib/drag.mjs) for today's hold, the default (?drag=today): his
// collar under the cursor, the blob under his hips, his lowest foot over the floor, a finger's
// collar where it's aimed, Ground Cues; today's down-drag gap is the known baseline (test.fail,
// so a fix shows). Settings' Drag lists the four kinds, the one ?drag= names checked, and picks
// the kind the next grab gets; Ground Cues in Settings is kept in invitation.look.v1. Each
// candidate's own spec file runs dragDescribe for its kind, then its own checks.
import { test, expect } from '@playwright/test';
import { calm, dragDescribe, grab, snapshot, until } from './lib/drag.mjs';

dragDescribe('today', { baseline: ['down'] });

test.describe('Settings', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Drag lists Today, Level, Tilt and Bead, ?drag= checked, and a pick is what the next grab gets; Ground Cues shows the kind’s default and a pick is kept for the next visit', async ({
    page,
  }) => {
    await calm(page, 'tilt');
    await page.locator('[data-look-open]').click();
    const drag = page.locator('input[name="inv-drag"]');
    await expect(drag).toHaveCount(4);
    expect(await drag.evaluateAll((els) => els.map((e) => e.value))).toEqual(['today', 'level', 'tilt', 'bead']);
    await expect(page.locator('input[name="inv-drag"][value="tilt"]')).toBeChecked();
    await page.locator('label.inv-seg', { hasText: 'Bead' }).click();
    await expect(page.locator('input[name="inv-drag"][value="bead"]')).toBeChecked();
    await until(page, (s) => s.drag.setting === 'bead', 'Bead picked');
    // Ground Cues: the kind's default checked (none picked), then a pick kept.
    const ground = page.locator('input[name="inv-ground"]:checked');
    await expect(ground).toHaveCount(1);
    expect(['off', 'mix', 'always']).toContain(await ground.inputValue());
    await page.locator('fieldset', { hasText: 'Ground Cues' }).locator('label.inv-seg', { hasText: 'Always' }).click();
    await expect(page.locator('input[name="inv-ground"][value="always"]')).toBeChecked();
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('invitation.look.v1'))).groundCues).toBe('always');
    await page.locator('[data-look-close]').click();
    await grab(page, 'head');
    expect((await snapshot(page)).drag.kind, 'the next grab: Bead').toBe('bead');
    await page.mouse.up();
    // The pick is for this visit only: back to ?drag='s.
    await page.reload();
    await expect(page.locator('[data-stage]')).toHaveClass(/is-ready/, { timeout: 30_000 });
    await until(page, (s) => s.drag.setting === 'tilt' && s.drag.groundCues === 'always', 'tilt again, Always kept');
  });
});
