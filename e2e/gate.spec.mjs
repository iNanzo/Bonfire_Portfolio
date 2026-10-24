// The password lock in a real browser, on the production build. The build ships the lock off (or
// with the admin's password, which no test knows), so each test locks pages of that one build
// itself: page.route puts the check in a page's head with this run's own token (exactly what the
// build inlines: src/gate/check.js gateScript) and gives the lock page this run's key in its
// config, made here from a password made up for the run. Every other spec gets past the lock with
// the cookie playwright.config.mjs's global setup makes from content.json; this one starts with
// none. The lock page's words are content's (the admin's), never pinned. Every wait is on a
// state (the lock page's body[data-gate]: ready, working, wrong, open), never on a duration.
import { test, expect } from '@playwright/test';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { content } from './lib/content.mjs';
import { gateScript } from '../src/gate/check.js';
import { GATE_COOKIE, GATE_ITER, gateDefaults, unlockConfig } from '../src/gate/pages.js';

test.use({ storageState: { cookies: [], origins: [] } });

// This run's password and its key, as the admin would make them (never content's).
const PASSWORD = `test-${randomBytes(6).toString('hex')}`;
const SALT = randomBytes(16);
const HASH = pbkdf2Sync(PASSWORD, SALT, GATE_ITER, 32, 'sha256');
const KEY = {
  alg: 'PBKDF2-SHA256',
  iter: GATE_ITER,
  salt: SALT.toString('base64'),
  hash: HASH.toString('base64'),
  set: '2026-10-24',
};
const TOKEN = createHash('sha256').update(HASH).digest('hex').slice(0, 16);
const GATE = { ...gateDefaults(), ...content.gate, on: true, key: KEY };
const CONFIG = unlockConfig(GATE);
const LOCK = CONFIG.lock;

const GATE_TAG = /<script data-gate>[\s\S]*?<\/script>/g;
const CONFIG_TAG = /<script type="application\/json" id="gate-config">[\s\S]*?<\/script>/;

/**
 * Lock `paths` of the build for this page: the check with this run's token first in their head
 * (any check the build has taken out), and the lock page's config with this run's key.
 * @param {import('@playwright/test').Page} page @param {string[]} paths
 */
async function lock(page, paths) {
  await page.route(
    (url) => paths.includes(url.pathname),
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const res = await route.fetch();
      const html = (await res.text())
        .replace(GATE_TAG, '')
        .replace('<head>', () => `<head><script data-gate>${gateScript(TOKEN, '/')}</script>`);
      await route.fulfill({ response: res, body: html });
    },
  );
  await page.route(
    (url) => url.pathname === '/unlock/',
    async (route) => {
      const res = await route.fetch();
      const json = JSON.stringify(CONFIG).replace(/</g, '\\u003c');
      const html = (await res.text()).replace(
        CONFIG_TAG,
        () => `<script type="application/json" id="gate-config">${json}</script>`,
      );
      await route.fulfill({ response: res, body: html });
    },
  );
}

/** The page's uncaught errors, to check none happened. */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const state = (page) => page.locator('body');
const button = (page) => page.getByRole('button', { name: LOCK.button });

test('a locked page sends you to the lock and back: a wrong password says so, the right one opens it', async ({
  page,
  context,
}) => {
  const errors = watch(page);
  await lock(page, ['/larp/']);
  // (It goes on to the lock while it loads: wait for the lock, not the page's own load.)
  await page.goto('/larp/?from=test#top', { waitUntil: 'commit' });
  await page.waitForURL((u) => u.pathname === '/unlock/');
  expect(new URL(page.url()).searchParams.get('to'), 'its path, checked on the way back').toBe('/larp/');
  await expect(state(page)).toHaveAttribute('data-gate', 'ready');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LOCK.title);
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow');

  const box = page.getByLabel(LOCK.label);
  await expect(box).toBeFocused();
  await box.fill('not the password');
  await button(page).click();
  await expect(state(page)).toHaveAttribute('data-gate', 'wrong');
  await expect(page.getByRole('status')).toHaveText(LOCK.wrong);
  expect(
    (await context.cookies()).filter((c) => c.name === GATE_COOKIE),
    'no cookie for a wrong one',
  ).toEqual([]);

  await box.fill(PASSWORD);
  await box.press('Enter');
  await page.waitForURL((u) => u.pathname === '/larp/');
  expect(page.url(), 'back where it was going, its query and hash kept').toMatch(/\/larp\/\?from=test#top$/);
  await expect(page.locator('.larp-topbar'), 'and it stays: the cookie opens it').toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === GATE_COOKIE);
  expect(cookie?.value).toBe(TOKEN);
  expect(cookie?.path).toBe('/');
  expect(cookie?.sameSite).toBe('Lax');
  const days = (cookie.expires - Date.now() / 1000) / 86400;
  expect(Math.round(days), 'remembered for the days the admin set').toBe(CONFIG.remember);
  expect(errors).toEqual([]);
});

test('the right password, deriveBits stubbed: a working state while it checks, then on to ?to', async ({ page }) => {
  const errors = watch(page);
  // The stand-in returns this run's hash for whatever is typed, once the test lets it.
  await page.addInitScript(
    (hash) => {
      const w = /** @type {any} */ (window);
      w.__gateRelease = null;
      crypto.subtle.deriveBits = () =>
        new Promise((resolve) => {
          w.__gateRelease = () => resolve(new Uint8Array(hash).buffer);
        });
    },
    [...HASH],
  );
  await lock(page, []);
  await page.goto(`/unlock/?to=${encodeURIComponent('/larp/')}`);
  await expect(state(page)).toHaveAttribute('data-gate', 'ready');
  await page.getByLabel(LOCK.label).fill('anything at all');
  await button(page).click();
  await expect(state(page)).toHaveAttribute('data-gate', 'working');
  await expect(button(page)).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText(LOCK.working);
  await page.waitForFunction(() => typeof (/** @type {any} */ (window).__gateRelease) === 'function');
  await page.evaluate(() => /** @type {any} */ (window).__gateRelease());
  await page.waitForURL((u) => u.pathname === '/larp/');
  await expect(page.locator('.larp-topbar')).toBeVisible();
  expect(errors).toEqual([]);
});

test('already unlocked: the lock page goes straight on, and never off the site', async ({ page, context, baseURL }) => {
  await lock(page, []);
  await context.addCookies([{ name: GATE_COOKIE, value: TOKEN, url: baseURL }]);
  for (const to of ['https://evil.example/', '//evil.example/x', '/\\evil.example/', 'javascript:alert(1)']) {
    await page.goto(`/unlock/?to=${encodeURIComponent(to)}`, { waitUntil: 'commit' });
    await page.waitForURL((u) => u.pathname === '/', { waitUntil: 'commit' });
    expect(new URL(page.url()).origin, `${to}: home instead`).toBe(new URL(baseURL).origin);
  }
  await page.goto(`/unlock/?to=${encodeURIComponent('/larp/')}`, { waitUntil: 'commit' });
  await page.waitForURL((u) => u.pathname === '/larp/');
});

test('the admin’s live preview (?preview in a frame) stays open; ?preview on its own goes to the lock', async ({
  page,
  baseURL,
}) => {
  await lock(page, ['/larp/']);
  await page.setContent(`<iframe src="${baseURL}/larp/?preview=1" width="800" height="600"></iframe>`);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.larp-topbar')).toBeVisible();
  expect(
    page.frames().some((f) => /\/larp\/\?preview=1$/.test(f.url())),
    'never sent to the lock',
  ).toBe(true);
  await page.goto('/larp/?preview=1', { waitUntil: 'commit' });
  await page.waitForURL((u) => u.pathname === '/unlock/');
});

test('/invitation/ stays open with no cookie, and the build puts no check in it', async ({ page, request }) => {
  const errors = watch(page);
  const html = await (await request.get('/invitation/')).text();
  expect(html).not.toContain('data-gate');
  await page.goto('/invitation/');
  await expect(page.locator('[data-stage] canvas')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/invitation/');
  expect(errors).toEqual([]);
});
