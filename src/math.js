// Small math helpers shared by the bonfire and the visualizer.

export const TAU = Math.PI * 2;

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x) => clamp(x, 0, 1);
/** x mod m, always in [0, m). */
export const wrap = (x, m) => ((x % m) + m) % m;

// --- curves on 0..1 -----------------------------------------------------------------
/** Smoothstep: 0 → 1 with zero slope at both ends. */
export const smooth = (t) => t * t * (3 - 2 * t);
/** Where x sits between a and b, smoothstepped. */
export const smoothstep = (a, b, x) => smooth(clamp01((x - a) / (b - a)));
/** Smootherstep: like smooth, with zero curvature at the ends too (rest to rest, C2). */
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
/** Cubic ease in and out. */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/**
 * Ease out past 1 and settle back (0 → 1 with an overshoot): `c` sets how far it
 * overshoots (the lightning ball grows with 1.6, ice snaps up with 1.9).
 * @param {number} t @param {number} c
 */
export const easeOutBack = (t, c) => 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;

// --- over time ------------------------------------------------------------------------
/**
 * Move `cur` toward `target`, closing 63% of the gap every `tau` seconds, whatever the
 * frame rate (an exponential ease).
 */
export const approach = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

// --- random ---------------------------------------------------------------------------
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Shuffle in place (Fisher–Yates). */
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
