// The lock's arithmetic, one copy for the lock page, the admin's Set Password and the build:
// PBKDF2-SHA256 over the password (WebCrypto, in the browser and in Node alike), the key the
// admin stores (a 16-byte salt, 600k iterations, the hash and the day; never the password), and
// the cookie's token, the first 16 hex of SHA-256 of the hash (so a new password locks out
// every browser that unlocked with the old one).
import { GATE_ALG, GATE_HASH_BYTES, GATE_ITER, GATE_SALT_BYTES } from './pages.js';

/** @param {Uint8Array} bytes */
export const toBase64 = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
/** @param {string} text */
export const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const subtleOf = () => globalThis.crypto.subtle;

/**
 * PBKDF2-SHA256 of `password` (NFC, so the same word typed on any keyboard matches).
 * @param {string} password @param {Uint8Array} salt @param {number} iter
 * @param {SubtleCrypto} [subtle]
 * @returns {Promise<Uint8Array>} the hash's GATE_HASH_BYTES bytes
 */
export async function deriveHash(password, salt, iter, subtle = subtleOf()) {
  const raw = new TextEncoder().encode(password.normalize('NFC'));
  const base = await subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base,
    GATE_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/**
 * The cookie's token for a hash: the first 16 hex of SHA-256 of its bytes.
 * @param {Uint8Array} hash @param {SubtleCrypto} [subtle]
 */
export async function tokenOf(hash, subtle = subtleOf()) {
  const digest = new Uint8Array(await subtle.digest('SHA-256', hash));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The key the admin stores for `password`: { alg, iter, salt, hash, set } (base64, and the day
 * as YYYY-MM-DD). The password itself is in none of it.
 * @param {string} password
 * @param {{ iter?: number, today?: Date, subtle?: SubtleCrypto, random?: (n: number) => Uint8Array }} [o]
 */
export async function makeKey(password, o = {}) {
  const iter = o.iter ?? GATE_ITER;
  const random = o.random ?? ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
  const salt = random(GATE_SALT_BYTES);
  const hash = await deriveHash(password, salt, iter, o.subtle);
  const day = (o.today ?? new Date()).toISOString().slice(0, 10);
  return { alg: GATE_ALG, iter, salt: toBase64(salt), hash: toBase64(hash), set: day };
}

/**
 * The token `password` unlocks with, or null when it isn't the key's.
 * @param {string} password
 * @param {{ iter: number, salt: string, hash: string }} key
 * @param {SubtleCrypto} [subtle]
 */
export async function unlockToken(password, key, subtle = subtleOf()) {
  if (!password) return null;
  const mine = await deriveHash(password, fromBase64(key.salt), key.iter, subtle);
  const want = fromBase64(key.hash);
  if (mine.length !== want.length || mine.some((b, i) => b !== want[i])) return null;
  return tokenOf(mine, subtle);
}
