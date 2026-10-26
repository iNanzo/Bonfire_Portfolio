// The dust NEWT raises when he lands in the invitation toy, as pure maths (no three.js, no DOM,
// no clock: time comes in as t; dustLayer.js draws it, on the stage's decal layer): a ring of
// small puffs bursting out from his feet along the floor, rising a little as they go, swelling
// and fading out in about half a second to 0.8 s. The landing's speed (landingSpeed: how fast he
// came down, and a share of how fast he slid) sizes it (dustShare): under DUST.min a set-down
// raises nothing, just over it a puff or two that barely leave his feet, and from DUST.full up a
// full ring of DUST.count[1] going out DUST.spread[1], bigger, rising higher and lasting longer.
// Never more than DUST.max puffs at once (a landing's ring whole: the oldest go first).
//
// The maths is the Bonfire's impact puff's (src/bonfire/impact.js, the billow when a weapon
// lands, copied here: the invitation imports only its own modules): each puff set off on its own
// heading round the impact at a jittered speed, slowed by exponential drag (here in closed form,
// so a puff's place is a function of its age: out = 1 − e^(−drag·u), over its life's share u), and
// its strength falling as a power of (1 − u), faded in over its first moments, so it bursts out
// strong and thins away. The ring's headings are spread evenly round him with a little jitter (the Bonfire's
// fire ring's emitters), so a big drop's ring has no gaps.
//
//   landingSpeed(impact)   the speed a landing raises dust by, from carry.js fallStep's impact
//   dustShare(speed)       0 at DUST.min (or under) to 1 at DUST.full (or over)
//   createDust()           no puffs
//   dustLand(d, at, speed, t, rng)  a landing at `at` (his feet, on the floor) at time t
//   dustPuffs(d, t)        the puffs alive at t ({x, y, z} its middle, r its radius, a its
//                          strength 0..1, world units), the spent ones dropped
//   dustBounds(puffs)      the box they fill, for the retro pass's area (null: none)

/** @typedef {import('./types.js').XZ} XZ */

/**
 * The dust: none under `min` (world units a second), a full ring from `full`; `count` puffs at
 * min and at full (rounded between), at most `max` kept; each starts within `start` of his feet's
 * middle, goes `spread` further out (at min, at full: × 0.8–1.25 each), rises `rise` (× 0.6–1.25),
 * is `size` in radius (× 0.75–1.25), swelling from 0.7 to 1.4 of it, and lasts `life` seconds
 * (× 0.9–1.15), slowed by `drag` over it, at a strength of `strength` (at min, at full), faded in
 * over its first 1/`fadeIn` s and out as (1 − u)^`fade` (the Bonfire puff's 1.3 thinned it too
 * soon to read at real speed). `slide`: the share of his speed across the floor that adds to the
 * landing's.
 */
export const DUST = Object.freeze({
  min: 1.5,
  full: 8,
  count: Object.freeze([2, 14]),
  max: 28,
  start: 0.12,
  spread: Object.freeze([0.18, 0.6]),
  rise: Object.freeze([0.03, 0.18]),
  size: Object.freeze([0.05, 0.12]),
  life: Object.freeze([0.5, 0.75]),
  drag: 3.2,
  strength: Object.freeze([0.75, 1]),
  fade: 0.85,
  fadeIn: 16,
  slide: 0.3,
});

/**
 * @typedef {object} Puff  one puff, as dustLand sets it off
 * @property {number} x0  his feet's middle
 * @property {number} z0
 * @property {number} dx  its heading out along the floor (a unit vector)
 * @property {number} dz
 * @property {number} start  how far out it starts
 * @property {number} spread  how much further out it goes
 * @property {number} rise
 * @property {number} size
 * @property {number} life  seconds
 * @property {number} strength
 * @property {number} born  t
 */
/** @typedef {{puffs: Puff[]}} Dust */
/** @typedef {{x: number, y: number, z: number, r: number, a: number, born: number}} PuffNow */

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * The speed a landing raises dust by: how fast he came down, and DUST.slide of how fast he slid
 * across the floor; 0 without an impact.
 * @param {import('./types.js').XYZ|null|undefined} impact  carry.js fallStep's, as he hit the floor
 */
export function landingSpeed(impact) {
  if (!impact) return 0;
  const down = Math.max(0, -impact.y);
  const across = Math.hypot(impact.x, impact.z);
  const v = down + DUST.slide * across;
  return Number.isFinite(v) ? v : 0;
}

/**
 * How big a landing at `speed` is: 0 at DUST.min (or under, or not a number) to 1 at DUST.full.
 * @param {number} speed
 */
export function dustShare(speed) {
  const k = (speed - DUST.min) / (DUST.full - DUST.min);
  return k > 0 ? Math.min(1, k) : 0;
}

/** @returns {Dust} */
export function createDust() {
  return { puffs: [] };
}

/**
 * A landing at `at` (his feet's middle on the floor) at time `t`: under DUST.min, nothing; else
 * its ring of puffs (dustShare sizes it), the oldest puffs dropped past DUST.max. Updates `d` in
 * place and returns it.
 * @param {Dust} d
 * @param {XZ} at
 * @param {number} speed  landingSpeed's
 * @param {number} t
 * @param {() => number} rng  0..1 (the page's seeded one)
 */
export function dustLand(d, at, speed, t, rng) {
  if (!(speed >= DUST.min) || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return d;
  const k = dustShare(speed);
  const n = Math.round(lerp(DUST.count[0], DUST.count[1], k));
  const turn = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const a = turn + ((i + (rng() - 0.5) * 0.6) / n) * TAU;
    d.puffs.push({
      x0: at.x,
      z0: at.z,
      dx: Math.cos(a),
      dz: Math.sin(a),
      start: DUST.start * lerp(0.6, 1, rng()),
      spread: lerp(DUST.spread[0], DUST.spread[1], k) * lerp(0.8, 1.25, rng()),
      rise: lerp(DUST.rise[0], DUST.rise[1], k) * lerp(0.6, 1.25, rng()),
      size: lerp(DUST.size[0], DUST.size[1], k) * lerp(0.75, 1.25, rng()),
      life: lerp(DUST.life[0], DUST.life[1], k) * lerp(0.9, 1.15, rng()),
      strength: lerp(DUST.strength[0], DUST.strength[1], k),
      born: t,
    });
  }
  if (d.puffs.length > DUST.max) d.puffs.splice(0, d.puffs.length - DUST.max);
  return d;
}

/** The share of the way out drag has taken a puff by `u` of its life (0 → 0, 1 → 1). */
const OUT_END = 1 - Math.exp(-DUST.drag);
const outAt = (/** @type {number} */ u) => (1 - Math.exp(-DUST.drag * u)) / OUT_END;

/**
 * The puffs alive at `t`: each out along its heading (slowing), swelling, its middle risen over
 * its radius (so it never dips under the floor), its strength fading; a puff not born yet isn't
 * shown, and a spent one is dropped from `d`.
 * @param {Dust} d
 * @param {number} t
 * @returns {PuffNow[]}
 */
export function dustPuffs(d, t) {
  /** @type {PuffNow[]} */
  const out = [];
  let kept = 0;
  for (const p of d.puffs) {
    const age = t - p.born;
    if (age >= p.life) continue;
    d.puffs[kept++] = p;
    if (age < 0) continue;
    const u = age / p.life;
    const go = p.start + p.spread * outAt(u);
    const r = p.size * (0.7 + 0.7 * Math.sqrt(u));
    out.push({
      x: p.x0 + p.dx * go,
      y: r + p.rise * (1 - (1 - u) * (1 - u)),
      z: p.z0 + p.dz * go,
      r,
      a: Math.min(1, Math.max(0, p.strength * (1 - u) ** DUST.fade * Math.min(1, age * DUST.fadeIn))),
      born: p.born,
    });
  }
  d.puffs.length = kept;
  return out;
}

/**
 * The box the puffs fill (their middles grown by their radii; `top` the highest): the retro
 * pass draws only inside an area round NEWT, and the stage grows it by this. Null for none.
 * @param {PuffNow[]} puffs
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number, top: number}|null}
 */
export function dustBounds(puffs) {
  if (!puffs.length) return null;
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, top: 0 };
  for (const p of puffs) {
    b.minX = Math.min(b.minX, p.x - p.r);
    b.maxX = Math.max(b.maxX, p.x + p.r);
    b.minZ = Math.min(b.minZ, p.z - p.r);
    b.maxZ = Math.max(b.maxZ, p.z + p.r);
    b.top = Math.max(b.top, p.y + p.r);
  }
  return b;
}
