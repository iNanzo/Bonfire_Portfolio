// Element signatures: the small habits that make loose particles read as their element at
// a glance, whichever system threw them (the bonfire, the rings, the blade's trail):
//   fire       embers rise, cool core → lo and twinkle as they tumble; fast ones streak
//   lightning  sparks are born as a white-hot cross-shaped flash, then zig-zag: their
//              path snaps sideways at random, like the arcs they came from
//   ice        frost glints as a diamond now and then, drifts slowly and falls softly
// Shapes and streaks are drawn by the particle shader (flame.js SHAPE / STRETCH).

/** How long a lightning spark flashes white as a cross when it's born (s). */
export const ARC_FLASH = 0.07;

/**
 * Lightning: now and then (about `rate` times a second) the spark at `ix` in `vel` snaps
 * sideways, keeping roughly its speed, so its streak reads as a zig-zag.
 */
export function arcJitter(vel, ix, dt, rate = 18, amount = 0.9) {
  if (Math.random() >= dt * rate) return;
  const speed = Math.hypot(vel[ix], vel[ix + 1], vel[ix + 2]);
  const kick = (0.4 + speed * 0.6) * amount;
  vel[ix] += (Math.random() - 0.5) * 2 * kick;
  vel[ix + 1] += (Math.random() - 0.5) * kick;
  vel[ix + 2] += (Math.random() - 0.5) * 2 * kick;
}

/** Lightning: 0..1, how white-hot a spark `age` seconds old still is. */
export const arcHeat = (age) => Math.max(0, 1 - age / ARC_FLASH);

/**
 * Ice: a glint for particle `i` at `time` (s): 1 for a moment every few seconds, else 0.
 * Each particle glints on its own schedule.
 */
export function iceGlint(time, i) {
  const phase = (time * 0.37 + i * 0.6180339) % 1;
  return phase < 0.018 ? 1 : 0;
}
