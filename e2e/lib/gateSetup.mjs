// Playwright's global setup (playwright.config.mjs): the cookie that gets the browser specs past
// the sitewide lock, made now from src/content.json's gate.key (the first 16 hex of SHA-256 of
// its hash: src/gate/crypto.js tokenOf, what the build checks for), so the specs pass whatever
// password the admin has set and a password change never fails CI. It's written as a storage
// state that every context starts with, a manual browser.newContext() too, and a cookie
// outlives the specs' localStorage.clear(). Without a key there's nothing to open: no cookie.
// e2e/gate.spec.mjs starts with none. The benchmark (tools/bench-viz.mjs) uses gateStateFor, the
// same cookie for the checkout it builds.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromBase64, tokenOf } from '../../src/gate/crypto.js';
import { GATE_COOKIE } from '../../src/gate/pages.js';

/** Where the storage state goes (test output: Playwright empties it before this runs). */
export const GATE_STATE = fileURLToPath(new URL('../../test-results/.gate-state.json', import.meta.url));

/**
 * The storage state for `content`: the nh_gate cookie its key opens, for the preview server's host.
 * @param {any} content @param {string} [host]
 */
export async function gateState(content, host = '127.0.0.1') {
  const hash = content?.gate?.key?.hash;
  if (typeof hash !== 'string' || !hash) return { cookies: [], origins: [] };
  const value = await tokenOf(fromBase64(hash));
  const cookie = { name: GATE_COOKIE, value, domain: host, path: '/', expires: -1, httpOnly: false, secure: false };
  return { cookies: [{ ...cookie, sameSite: /** @type {const} */ ('Lax') }], origins: [] };
}

/**
 * The storage state for a checkout's own build (tools/bench-viz.mjs): the cookie `root`'s
 * src/content.json opens, for the host of `url`. None when that checkout has no lock or no
 * content.json (a commit from before the lock).
 * @param {string} root @param {string} url
 */
export async function gateStateFor(root, url) {
  let content;
  try {
    content = JSON.parse(readFileSync(join(root, 'src', 'content.json'), 'utf8'));
  } catch {
    content = {};
  }
  return gateState(content, new URL(url).hostname);
}

export default async function globalSetup() {
  const content = JSON.parse(readFileSync(new URL('../../src/content.json', import.meta.url), 'utf8'));
  mkdirSync(dirname(GATE_STATE), { recursive: true });
  writeFileSync(GATE_STATE, `${JSON.stringify(await gateState(content), null, 2)}\n`);
}
