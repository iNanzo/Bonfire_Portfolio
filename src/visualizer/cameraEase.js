// How the camera eases while it covers the blade (the visualizer's swing cameras). Each
// "feel" pairs two things:
//   follow  how a rig chases the blade: a lag (each frame closes a share of the gap, the
//           original feel) or a spring (it builds speed, and an underdamped one sails
//           past and settles back, like a hand-held operator catching up)
//   curve   the easing of a whip or glide from one framing to the next
// The director picks a feel per combo, and with the "mix" setting sometimes a new one
// between the combo's moves, so the same routine never moves the camera the same way.
import { clamp } from '../math.js';

// Easing curves, u 0..1 → 0..1.
const CURVES = {
  cubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  expo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2),
  sine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  quintOut: (u) => 1 - (1 - u) ** 5,
  // Overshoots by about 10% and settles back.
  backOut: (u) => { const c = 1.70158; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; },
};

/**
 * The feels. `lag`: multiplies a rig's follow times (bigger: heavier). `zeta`: a spring's
 * damping (1: no overshoot, below 1: overshoot); none: a plain lag. `dur`: multiplies how
 * long a move between framings takes.
 */
export const SWING_EASES = {
  smooth: { name: 'Smooth', hint: 'Glides after the blade with an even lag (the original)', lag: 1, curve: 'cubic', dur: 1 },
  spring: { name: 'Spring', hint: 'Builds speed and lands softly, no overshoot', lag: 1, zeta: 1, curve: 'expo', dur: 1 },
  bouncy: { name: 'Bouncy', hint: 'Swings past the blade a little and settles back, hand-held', lag: 0.9, zeta: 0.5, curve: 'backOut', dur: 1 },
  heavy: { name: 'Heavy', hint: 'A slow, weighty crane that trails well behind', lag: 1.8, curve: 'sine', dur: 1.3 },
  snappy: { name: 'Snappy', hint: 'Jumps onto the blade and eases into place', lag: 0.55, curve: 'quintOut', dur: 0.8 },
};
export const easeOr = (key) => (SWING_EASES[key] ? key : 'smooth');
/** The move between framings, for a feel (u 0..1 → 0..1). */
export const curveFor = (key) => CURVES[SWING_EASES[easeOr(key)].curve];

/**
 * A follower for one rig run: `num(state, key, target, tau, dt)` eases state[key] toward
 * target, `vec(v, target, tau, dt)` a vector in place. `tau` is the rig's own follow time;
 * the feel scales it and decides whether it's a lag or a spring. Spring velocities live
 * with the follower, so each new rig (a new follower) starts at rest.
 */
export function createFollower(key) {
  const feel = SWING_EASES[easeOr(key)];
  const velocities = new Map(); // vector → [vx, vy, vz]; `state.key` → speed
  // One axis of a damped spring. Its natural frequency makes it arrive about when the
  // lag would; substeps keep the stiff (short tau) ones stable at low frame rates.
  function spring(x, target, vel, i, tau, dt) {
    const w = 2 / Math.max(1e-3, tau);
    const n = Math.max(1, Math.ceil((dt * w) / 0.25));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      vel[i] += (w * w * (target - x) - 2 * feel.zeta * w * vel[i]) * h;
      x += vel[i] * h;
    }
    return x;
  }
  return {
    key: easeOr(key),
    num(state, name, target, tau, dt) {
      const t = tau * feel.lag;
      if (!feel.zeta) return (state[name] += (target - state[name]) * (1 - Math.exp(-dt / t)));
      let vel = velocities.get(state);
      if (!vel) velocities.set(state, (vel = {}));
      const v = [vel[name] ?? 0];
      state[name] = spring(state[name], target, v, 0, t, dt);
      vel[name] = clamp(v[0], -1e3, 1e3);
      return state[name];
    },
    vec(v, target, tau, dt) {
      const t = tau * feel.lag;
      if (!feel.zeta) return v.lerp(target, 1 - Math.exp(-dt / t));
      let vel = velocities.get(v);
      if (!vel) velocities.set(v, (vel = [0, 0, 0]));
      v.x = spring(v.x, target.x, vel, 0, t, dt);
      v.y = spring(v.y, target.y, vel, 1, t, dt);
      v.z = spring(v.z, target.z, vel, 2, t, dt);
      return v;
    },
  };
}
