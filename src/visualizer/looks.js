// Looks: the pixel pass's effects (scene.glitch → pixelPass.js), played as a set of
// styles that take turns, so it isn't always glitch. One look at a time; each answers
// the beat its own way and has its own burst for the big hits.
//
//   ember    clean: just the fire (the director's zoom punch and shake still land).
//   glitch   torn rows, an RGB split on the kick, crunchy pixels and static; tearing
//            more and more through a build.
//   echo     the last frame echoes out of the fire like a tunnel (or falls into it), and
//            on downbeats the flame's ramp colors cycle, old pixel-art palette animation
//            style.
//   ripple   a shockwave ring pushes out of the fire on every kick.
//   kaleido  a kaleidoscope around the screen's center, spinning with the kicks, its
//            segments changing each phrase, with a light echo.
//   ink      downbeats flash the scene to 1-bit (dithered to the void and the flame's
//            core), over scanlines.
//   vortex   echoes turning as they stream out: a spiral, flung faster on the kicks.
//   mosaic   the kicks crunch the picture into big pixels that settle back.
//   haze     the rows shimmer sideways like heat over the fire, swelling with the music.
//   prism    the colors split apart on every beat.
// Each time a look comes round it rolls its own details (the echo's direction, the
// spiral's turn, the kaleidoscope's segments) and, when they're "in the mix", a mirror
// and scanlines (thin, thick or columns). Set to "always", they stay on and still change
// style with the look. Mirrors come in three kinds (MIRRORS), each picked from those
// switched on: horizontal (either half copied onto the other), vertical (the top
// reflected down like a pool, or the bottom up) and quarter (one quarter, four ways).
// In any look a breakdown frames itself: letterbox bars slide in and an iris closes
// around the fire as the build rises; the drop snaps it open.
//
// Drops: besides the look's own burst (and the negative flash, a setting), each drop
// throws one to three hits drawn from DROP_FX, never the same set twice running:
// a shatter, shockwaves, an echo burst, a spiral, a kaleidoscope, mirror flips on the
// beat, a color cycle, an RGB burst, a crunch, an iris snapping open, a letterbox slam,
// an ink flash.
// Full-screen flashes (the ink flash, the negative on drops) stay on downbeats and big
// hits, well under three a second.
import { approach, pick } from '../math.js';

export const LOOKS = {
  ember: 'Ember', glitch: 'Glitch', echo: 'Echo', ripple: 'Ripple', kaleido: 'Kaleido', ink: 'Ink',
  vortex: 'Vortex', mosaic: 'Mosaic', haze: 'Haze', prism: 'Prism',
};
export const DROP_FX = {
  shatter: 'Shatter', shock: 'Shockwaves', burst: 'Echo Burst', spiral: 'Spiral', kaleido: 'Kaleidoscope', flips: 'Mirror Flips',
  cycle: 'Color Cycle', split: 'RGB Burst', crunch: 'Crunch', iris: 'Iris Snap', slam: 'Letterbox Slam', ink: 'Ink Flash',
};
/** Off, in the mix (some looks), always. */
export const MODIFIER_MODES = [['off', 'Off'], ['mix', 'In the mix'], ['on', 'Always']];
export const MIRRORS = { horizontal: 'Horizontal', vertical: 'Vertical', quarter: 'Quarter' };
// The pixel pass's mirror modes (x + 3y) for each kind; quarters mostly keep the top.
const MIRROR_MODES = { horizontal: [1, 2], vertical: [3, 6], quarter: [4, 5, 4, 5, 7, 8] };
/** A mirror mode from the kinds switched on, picked by two rolls in 0..1. */
function mirrorMode(kinds, r1, r2) {
  const on = Object.keys(MIRRORS).filter((k) => !kinds || kinds[k]);
  const modes = MIRROR_MODES[on[Math.floor(r1 * on.length)] ?? 'horizontal'];
  return modes[Math.floor(r2 * modes.length)];
}

const MIX_CHANCE = 0.3;

export function createLooks(g) {
  let look = 'ember';
  let slice = 0;
  let block = 0;
  let hitEnv = 0;       // the last big hit, decaying
  let kick = 0;
  let inkFor = 0;
  let invertFor = 0;
  let lastFlash = -Infinity;
  let cycleFor = 0;
  let cycleStep = 0;
  let spinFor = 0;      // the palette spinning (echo's burst, the color cycle drop)
  let ripples = [];     // { t, s }
  let kaleSeg = 6;
  let kaleRot = 0;
  let kaleSpin = 0;
  let letterbox = 0;
  let iris = 2;
  let clock = 0;
  // Rolled each time a look comes round.
  const roll = { zoomIn: false, turn: 1, mirror: [0, 0], mirrorOn: false, scan: 0, scanOn: false, crunch: 1 };
  // Drop hits: seconds left of each (and their envelopes).
  const FX_TIME = { shatter: 0.5, burst: 0.9, spiral: 1.2, kaleido: 1.6, flips: 2, split: 0.6, crunch: 0.5, iris: 0.45, slam: 0.6, ink: 0.2 };
  const fx = Object.fromEntries(Object.keys(FX_TIME).map((k) => [k, 0]));
  let flip = [0, 0]; // the mirror flips' current rolls
  let lastDrop = '';

  function reseed() { g.sliceSeed = Math.random() * 100; }

  function set(name) {
    if (!LOOKS[name] || name === look) return;
    look = name;
    if (name === 'kaleido') kaleSeg = pick([4, 6, 8]);
    roll.zoomIn = Math.random() < 0.35;
    roll.turn = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random());
    roll.mirror = [Math.random(), Math.random()];
    roll.mirrorOn = Math.random() < MIX_CHANCE;
    roll.scan = Math.floor(Math.random() * 3);
    roll.scanOn = Math.random() < MIX_CHANCE;
    roll.crunch = 2 + Math.floor(Math.random() * 3);
  }

  return {
    get look() { return look; },
    set,
    /** Another look from those switched on. */
    next(enabled) {
      const pool = Object.keys(LOOKS).filter((k) => enabled[k] && k !== look);
      if (pool.length) set(pick(pool));
    },
    beat(s, accent, period = 0.5) {
      kick = Math.max(kick, s);
      if (fx.flips > 0) flip = [Math.random(), Math.random()];
      if (s < 0.05) return;
      if (look === 'ripple' && s > 0.2) ripples.push({ t: 0, s: accent ? 1 : 0.6 * s });
      if (look === 'echo' && accent && s > 0.3) { cycleFor = period * 0.5; cycleStep = 1 + Math.floor(Math.random() * 3); }
      if (look === 'ink' && accent) inkFor = 0.09;
      if ((look === 'kaleido' || look === 'vortex') && accent) kaleSpin = Math.max(kaleSpin, 0.6 * s);
    },
    hat(s) {
      if (look === 'glitch' && s > 0.6 && Math.random() < 0.15) { slice = Math.max(slice, 0.2); reseed(); }
    },
    /** A big hit in the current look's style (drops, combos landing, rings, G). */
    bang(amount = 1, { flash = false } = {}) {
      hitEnv = Math.max(hitEnv, amount);
      if (look === 'glitch') { slice = Math.max(slice, amount); block = Math.max(block, amount); reseed(); }
      else if (look === 'echo') spinFor = 0.5 * amount;
      else if (look === 'ripple') for (let k = 0; k < 3; k++) ripples.push({ t: -k * 0.12, s: amount });
      else if (look === 'kaleido') { kaleSeg = pick([4, 6, 8, 10].filter((n) => n !== kaleSeg)); kaleSpin = Math.max(kaleSpin, 2 * amount); }
      else if (look === 'vortex') kaleSpin = Math.max(kaleSpin, 2.5 * amount);
      else if (look === 'ink') inkFor = 0.22 * amount;
      if (flash && amount >= 0.9 && clock - lastFlash > 2) { lastFlash = clock; invertFor = 0.07; }
    },
    /**
     * A drop: one to `max` hits from those switched on (`enabled`: { name: bool }), never the
     * same set as the last drop. Returns their names.
     */
    drop(enabled, max = 2) {
      const pool = Object.keys(DROP_FX).filter((k) => enabled[k]);
      if (!pool.length) return [];
      let chosen = [];
      for (let tries = 0; tries < 6; tries++) {
        const n = 1 + Math.floor(Math.random() * Math.min(max, pool.length));
        chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, n);
        if (chosen.slice().sort().join() !== lastDrop || pool.length === 1) break;
      }
      lastDrop = chosen.slice().sort().join();
      for (const name of chosen) {
        if (name === 'shock') for (let k = 0; k < 4; k++) ripples.push({ t: -k * 0.1, s: 1 });
        else if (name === 'cycle') spinFor = 0.6;
        else {
          fx[name] = FX_TIME[name];
          if (name === 'shatter') { slice = 1; block = 1; reseed(); }
          if (name === 'kaleido') kaleSeg = pick([6, 8, 10]);
          if (name === 'flips') flip = [Math.random(), Math.random()];
        }
      }
      return chosen.map((k) => DROP_FX[k]);
    },
    /** The look's effects, the drop hits, the mirror and scanlines, and every look's framing. */
    update(dt, { amt, build, low, energy, scanlines = 'mix', mirror = 'mix', mirrors }) {
      clock += dt;
      kick *= Math.exp(-dt / 0.14);
      hitEnv *= Math.exp(-dt / 0.5);
      slice *= Math.exp(-dt / 0.22);
      block *= Math.exp(-dt / 0.3);
      kaleSpin *= Math.exp(-dt / 0.4);
      inkFor -= dt;
      invertFor -= dt;
      cycleFor -= dt;
      spinFor -= dt;
      for (const k of Object.keys(fx)) fx[k] = Math.max(0, fx[k] - dt);
      const env = (k) => fx[k] / FX_TIME[k]; // 1 → 0 through a drop hit
      const L = look;
      const on = amt > 0 ? 1 : 0;

      // Glitch (and a shatter): tears and crunch.
      if (L === 'glitch' && amt > 0 && build > 0.3 && Math.random() < dt * 6 * build) { slice = Math.max(slice, 0.25 + 0.5 * build); reseed(); }
      const gl = L === 'glitch' || fx.shatter > 0 ? amt : 0;
      g.slice = gl * Math.min(1, slice);
      g.split = Math.round(
        (L === 'glitch' ? amt * (1.6 * kick + 3 * hitEnv + 1.5 * build) : 0)
        + (L === 'prism' ? amt * (1 + 5 * kick + 6 * hitEnv) : 0)
        + amt * 10 * env('split') ** 1.5,
      );
      g.block = 1 + Math.round(
        gl * 3 * block
        + (L === 'mosaic' ? amt * (roll.crunch * 1.6 * kick + 4 * hitEnv) : 0)
        + amt * 7 * env('crunch') ** 2,
      );
      g.wave = gl * (1.2 * build + 3 * hitEnv) + (L === 'haze' ? amt * (0.8 + 1.8 * energy + 2.5 * kick) : 0);
      g.noise = gl * (0.08 * build + 0.12 * hitEnv);

      // Echoes: the echo look, a light one under the kaleidoscope, the vortex, and the drop bursts.
      let echo = L === 'echo' ? 0.62 + 0.2 * energy + 0.2 * Math.max(0, spinFor) : L === 'kaleido' ? 0.4 : L === 'vortex' ? 0.7 + 0.15 * energy : 0;
      echo = Math.max(echo, 0.85 * env('burst'), 0.8 * env('spiral'));
      g.feedback = Math.min(0.9, amt * echo);
      const zoomBy = L === 'echo' ? 0.012 + 0.03 * kick + 0.05 * hitEnv : L === 'vortex' ? 0.01 + 0.02 * kick : 0.006;
      g.zoom = 1 + (L === 'echo' && roll.zoomIn ? -0.6 : 1) * zoomBy + 0.06 * env('burst');
      g.feedRot = (L === 'vortex' ? roll.turn * (0.02 + 0.05 * kaleSpin) : 0) + roll.turn * 0.07 * env('spiral');
      g.cycle = spinFor > 0 ? Math.floor(clock * 16) % 4 : cycleFor > 0 ? cycleStep : 0;

      // Ripple: rings out of the fire (radius as a fraction of the screen height).
      ripples = ripples.filter((r) => (r.t += dt) < 0.7);
      const front = ripples.filter((r) => r.t >= 0).at(-1);
      g.rippleR = front ? front.t * 1.6 : 0;
      g.rippleAmp = front && amt > 0 ? amt * 7 * front.s * (1 - front.t / 0.7) : 0;

      // Kaleidoscope.
      kaleRot += dt * (0.12 + 1.5 * kaleSpin);
      g.kaleido = (L === 'kaleido' || fx.kaleido > 0) && amt > 0 ? kaleSeg : 0;
      g.kaleidoRot = kaleRot;

      // Ink, the negative.
      g.ink = (L === 'ink' && inkFor > 0) || fx.ink > 0 ? Math.min(1, amt) : 0;
      g.invert = invertFor > 0 ? 1 : 0;

      // The mirror and scanlines: off, in the mix (this look rolled one), or always.
      const mirrored = mirror === 'on' || (mirror === 'mix' && roll.mirrorOn);
      g.mirror = fx.flips > 0 && on ? mirrorMode(mirrors, ...flip) : mirrored ? mirrorMode(mirrors, ...roll.mirror) : 0;
      const scanned = scanlines === 'on' || (scanlines === 'mix' && roll.scanOn) || L === 'ink';
      g.scan = scanned ? 0.22 : 0;
      g.scanMode = L === 'ink' ? 0 : roll.scan;

      // Framing in breakdowns: bars in, the iris closing with the build; snapping open.
      // A drop's iris snap opens from a pinhole; its letterbox slam shuts and springs back.
      letterbox = approach(letterbox, low ? 0.09 : 0, low ? 0.8 : 0.15, dt);
      iris = low ? approach(Math.min(iris, 1.3), 0.95 - 0.5 * build, 0.6, dt) : approach(iris, 2, 0.12, dt);
      const x = 1 - env('slam');
      const lb = Math.max(letterbox, fx.slam > 0 ? on * 0.24 * (x < 0.15 ? x / 0.15 : (1 - x) / 0.85) : 0);
      g.letterbox = lb < 0.004 ? 0 : lb;
      const snap = fx.iris > 0 && on ? 0.04 + 2 * (1 - env('iris')) ** 2 : 2;
      const ir = Math.min(iris, snap);
      g.iris = ir > 1.95 ? 2 : ir;
    },
  };
}
