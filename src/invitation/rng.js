// Seeded randomness for the invitation toy's pure modules (mulberry32): the same seed gives the
// same NEWT, which ?seed=N and the tests rely on. Nothing here reads Math.random() or a clock.

/**
 * A generator of numbers in [0, 1) that repeats for the same seed.
 * @param {number} [seed]
 * @returns {() => number}
 */
export function createRng(seed = 1) {
  let a = Math.trunc(seed) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A number in [lo, hi).
 * @param {() => number} rng
 * @param {number} lo
 * @param {number} hi
 */
export function between(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}
