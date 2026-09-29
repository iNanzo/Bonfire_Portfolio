// Looks: the pixel pass's effects (scene.glitch → pixelPass.js), played as a set of
// styles that take turns, so it isn't always glitch. One look at a time takes its turn;
// looks switched to "always" stay on underneath it. Each answers the beat its own way and
// has its own burst for the big hits.
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
//
// Every effect has one switch with three settings (MODES): off, in the mix, or always.
// Looks in the mix take turns; drop hits in the mix are drawn at random; layers and the
// director's effects in the mix (LAYERS, FEEL) come and go: each time a look comes round
// it re-rolls which of them are on, and each rolls its own details (the echo's
// direction, the glow's size, the gradient's colors, how each layer blends…), so the
// picture keeps finding new combinations.
//
// Layers go over whatever look is playing:
//   scanlines, mirror   as before (thin, thick or column lines; horizontal, vertical or
//                       quarter mirrors, from the kinds switched on).
//   blend modes         the layers blend in new ways: echoes in screen or difference,
//                       ink in overlay, the kaleidoscope ghosted over the plain picture…
//   ghosting            a fading trail of everything that moves.
//   motion blur         the camera's moves smear the picture (whips, shakes, punches).
//   glow                light spills from the bright parts.
//   gradient map        the picture recolored by brightness through three palette colors.
//   painterly/watercolor  the picture repainted in strokes, or washed flat (one at a time).
//   flicker             the light dips on the beat, rolls, jitters like film, or wavers.
// In the mix, at most two of the heavier layers come in at once (always-on ones aside).
// In any look a breakdown frames itself: letterbox bars slide in and an iris closes
// around the fire as the build rises; the drop snaps it open.
//
// Drops: besides the look's own burst (and the negative flash, a setting), each drop
// throws the hits set to always, plus one to three drawn from those in the mix, never
// the same set twice running: a shatter, shockwaves, an echo burst, a spiral, a
// kaleidoscope, mirror flips on the beat, a color cycle, an RGB burst, a crunch, an iris
// snapping open, a letterbox slam, an ink flash.
// Full-screen flashes (the ink flash, the negative on drops) stay on downbeats and big
// hits, well under three a second; the flicker's fast kinds stay faint.
import { approach, pick, shuffle } from '../math.js';

export const LOOKS = {
  ember: 'Ember', glitch: 'Glitch', echo: 'Echo', ripple: 'Ripple', kaleido: 'Kaleido', ink: 'Ink',
  vortex: 'Vortex', mosaic: 'Mosaic', haze: 'Haze', prism: 'Prism',
};
export const DROP_FX = {
  shatter: 'Shatter', shock: 'Shockwaves', burst: 'Echo Burst', spiral: 'Spiral', kaleido: 'Kaleidoscope', flips: 'Mirror Flips',
  cycle: 'Color Cycle', split: 'RGB Burst', crunch: 'Crunch', iris: 'Iris Snap', slam: 'Letterbox Slam', ink: 'Ink Flash',
};
/** Every effect's switch: never, in the mix (it comes and goes), always. */
export const MODES = [['off', 'Off'], ['mix', 'In the mix'], ['on', 'Always']];
const MODE_IDS = new Set(MODES.map(([id]) => id));
/** A saved switch as a mode. (Switches were on/off before; `yes` is what `true` meant.) */
export const modeOf = (v, yes = 'on') => (v === true ? yes : MODE_IDS.has(v) ? v : 'off');
/** Layers over any look, each with its own switch (settings keys). */
export const LAYERS = {
  scanlines: 'Scanlines', mirror: 'Mirror', blend: 'Blend Modes', ghost: 'Ghosting', blur: 'Motion Blur', glow: 'Glow',
  gradient: 'Gradient Map', paint: 'Painterly', wash: 'Watercolor', flicker: 'Flicker',
};
export const MIRRORS = { horizontal: 'Horizontal', vertical: 'Vertical', quarter: 'Quarter' };
// The pixel pass's mirror modes (x + 3y) for each kind; quarters mostly keep the top.
const MIRROR_MODES = { horizontal: [1, 2], vertical: [3, 6], quarter: [4, 5, 4, 5, 7, 8] };
/** A mirror mode from the kinds switched on, picked by two rolls in 0..1. */
function mirrorMode(kinds, r1, r2) {
  const on = Object.keys(MIRRORS).filter((k) => !kinds || kinds[k]);
  const modes = MIRROR_MODES[on[Math.floor(r1 * on.length)] ?? 'horizontal'];
  return modes[Math.floor(r2 * modes.length)];
}

// How likely each switch in the mix is to be on for a look's turn: the layers, and the
// director's own effects (sparks, the blade's echo, the zoom punch, the feel, the drop's
// blackout and negative flash).
const CHANCE = {
  scanlines: 0.3, mirror: 0.3, blend: 0.5,
  ghost: 0.3, blur: 0.35, glow: 0.4, gradient: 0.3, paint: 0.2, wash: 0.2, flicker: 0.25,
  sparks: 0.6, echo: 0.6, punch: 0.75, temperature: 0.6, breathe: 0.6, blackout: 0.5, flash: 0.5,
};
const HEAVY = ['ghost', 'blur', 'glow', 'gradient', 'paint', 'wash', 'flicker'];
const MAX_HEAVY = 2;

// The pixel pass's blend modes (pixelPass.js blendMode), and the ones each layer may
// roll: the first is its classic way. Echoes and glow only get modes where black
// leaves the picture alone (their layer is mostly black).
export const BLEND = {
  normal: 0, add: 1, subtract: 2, multiply: 3, screen: 4, darken: 5, lighten: 6, overlay: 7, hardLight: 8, softLight: 9, difference: 10, exclusion: 11,
};
const LAYER_BLENDS = {
  feed: ['lighten', 'screen', 'difference', 'exclusion'],
  ghost: ['normal', 'lighten', 'screen', 'difference', 'softLight'],
  warp: ['normal', 'screen', 'lighten', 'darken', 'difference', 'overlay'],
  ink: ['normal', 'overlay', 'multiply', 'difference', 'exclusion', 'hardLight'],
  invert: ['normal', 'difference', 'exclusion'],
  scan: ['multiply', 'screen', 'overlay'],
  glow: ['add', 'screen', 'lighten'],
  gradient: ['normal', 'overlay', 'softLight', 'hardLight', 'multiply', 'screen'],
};
const CLASSIC = Object.fromEntries(Object.entries(LAYER_BLENDS).map(([k, list]) => [k, BLEND[list[0]]]));
// Gradient maps: palette slots (scenePalette: 0 void, 1 shadow, 2 stone, 3 wood, 4 bone,
// 5–8 the flame's ramp lo → core, 9 its shade), dark to light.
const GRADIENTS = [[0, 6, 8], [9, 5, 7], [0, 2, 4], [1, 6, 4], [0, 5, 7], [2, 7, 8], [0, 3, 8]];
// The flicker's kinds: a dip on each beat, a band rolling down, film jitter, a candle's
// waver. The fast ones stay faint.
const FLICKER_AMP = [0.22, 0.25, 0.06, 0.09];

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

export function createLooks(g) {
  let look = 'ember';
  let modes = {};       // the settings, as of the last update
  let slice = 0;
  let block = 0;
  let hitEnv = 0;       // the last big hit, decaying
  let kick = 0;
  let dip = 0;          // the flicker's beat dip
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
  // Rolled each time a look comes round: its details, which switches in the mix are on,
  // and how the layers look and blend.
  const roll = { zoomIn: false, turn: 1, mirror: [0, 0], scan: 0, crunch: 1, on: {}, p: {}, blends: { ...CLASSIC } };
  // Drop hits: seconds left of each (and their envelopes).
  const FX_TIME = { shatter: 0.5, burst: 0.9, spiral: 1.2, kaleido: 1.6, flips: 2, split: 0.6, crunch: 0.5, iris: 0.45, slam: 0.6, ink: 0.2 };
  const fx = Object.fromEntries(Object.keys(FX_TIME).map((k) => [k, 0]));
  let flip = [0, 0]; // the mirror flips' current rolls
  let lastDrop = '';

  function reseed() { g.sliceSeed = Math.random() * 100; }

  function reroll() {
    roll.zoomIn = Math.random() < 0.35;
    roll.turn = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random());
    roll.mirror = [Math.random(), Math.random()];
    roll.scan = Math.floor(Math.random() * 3);
    roll.crunch = 2 + Math.floor(Math.random() * 3);
    for (const [k, c] of Object.entries(CHANCE)) roll.on[k] = Math.random() < c;
    // Keep the mix from piling up: two heavy layers at most, one restyle.
    const heavy = shuffle(HEAVY.filter((k) => roll.on[k]));
    heavy.forEach((k, i) => { roll.on[k] = i < MAX_HEAVY; });
    if (roll.on.paint && roll.on.wash) roll.on[Math.random() < 0.5 ? 'paint' : 'wash'] = false;
    const grad = pick(GRADIENTS);
    roll.p = {
      ghostKeep: rand(0.8, 0.94), ghostMix: rand(0.35, 0.7),
      blur: rand(0.6, 1.2),
      glowSize: rand(1.5, 3.2), glowCut: rand(0.12, 0.3), glowAmt: rand(0.5, 1.1),
      // Mostly a picked map; sometimes random slots, sometimes turned upside down.
      grad: Math.random() < 0.25 ? [0, 0, 0].map(() => Math.floor(Math.random() * 10)) : Math.random() < 0.2 ? [...grad].reverse() : grad,
      gradAmt: rand(0.35, 0.8),
      paintR: 2 + Math.floor(Math.random() * 3), paintAngle: Math.random() * Math.PI, paintAspect: rand(1, 2.4),
      washR: 2 + Math.floor(Math.random() * 3), washEdge: rand(0, 0.7),
      styleMix: rand(0.7, 1), styleFlip: Math.random() < 0.5,
      flicker: Math.floor(Math.random() * FLICKER_AMP.length),
      warpMix: rand(0.5, 0.9),
    };
    for (const [k, list] of Object.entries(LAYER_BLENDS)) roll.blends[k] = BLEND[pick(list)];
  }
  reroll();

  function set(name) {
    if (!LOOKS[name] || name === look) return;
    look = name;
    if (name === 'kaleido') kaleSeg = pick([4, 6, 8]);
    reroll();
  }
  /** A switch's mode says it's on right now (always, or in the mix and rolled on for this look). */
  function active(key, mode) {
    const m = modeOf(mode);
    return m === 'on' || (m === 'mix' && !!roll.on[key]);
  }
  /** A look is playing: its turn, or switched to always. */
  const has = (k) => k === look || modeOf(modes.looks?.[k], 'mix') === 'on';
  const mixLooks = (enabled) => Object.keys(LOOKS).filter((k) => modeOf(enabled?.[k], 'mix') === 'mix');

  return {
    get look() { return look; },
    /** The looks playing: the one taking its turn, then those always on. */
    get playing() {
      const always = Object.keys(LOOKS).filter((k) => k !== look && k !== 'ember' && modeOf(modes.looks?.[k], 'mix') === 'on');
      return look === 'ember' && always.length ? always : [look, ...always];
    },
    set,
    active,
    /** Another look from those in the mix (with none, the clean fire); the mix re-rolls either way. */
    next(enabled) {
      const pool = mixLooks(enabled).filter((k) => k !== look);
      if (pool.length) set(pick(pool));
      else {
        if (!mixLooks(enabled).includes(look)) look = 'ember';
        reroll();
      }
    },
    /** Keep the look's turn to one still in the mix (the settings may have changed). */
    sync(enabled) {
      const pool = mixLooks(enabled);
      if (pool.includes(look) || (!pool.length && look === 'ember')) return;
      this.next(enabled);
    },
    beat(s, accent, period = 0.5) {
      kick = Math.max(kick, s);
      dip = Math.max(dip, s);
      if (fx.flips > 0) flip = [Math.random(), Math.random()];
      if (s < 0.05) return;
      if (has('ripple') && s > 0.2) ripples.push({ t: 0, s: accent ? 1 : 0.6 * s });
      if (has('echo') && accent && s > 0.3) { cycleFor = period * 0.5; cycleStep = 1 + Math.floor(Math.random() * 3); }
      if (has('ink') && accent) inkFor = 0.09;
      if ((has('kaleido') || has('vortex')) && accent) kaleSpin = Math.max(kaleSpin, 0.6 * s);
    },
    hat(s) {
      if (has('glitch') && s > 0.6 && Math.random() < 0.15) { slice = Math.max(slice, 0.2); reseed(); }
    },
    /** A big hit in the playing looks' style (drops, combos landing, rings, G). */
    bang(amount = 1, { flash = false } = {}) {
      hitEnv = Math.max(hitEnv, amount);
      if (has('glitch')) { slice = Math.max(slice, amount); block = Math.max(block, amount); reseed(); }
      if (has('echo')) spinFor = 0.5 * amount;
      if (has('ripple')) for (let k = 0; k < 3; k++) ripples.push({ t: -k * 0.12, s: amount });
      if (has('kaleido')) { kaleSeg = pick([4, 6, 8, 10].filter((n) => n !== kaleSeg)); kaleSpin = Math.max(kaleSpin, 2 * amount); }
      if (has('vortex')) kaleSpin = Math.max(kaleSpin, 2.5 * amount);
      if (has('ink')) inkFor = 0.22 * amount;
      if (flash && amount >= 0.9 && clock - lastFlash > 2) { lastFlash = clock; invertFor = 0.07; }
    },
    /**
     * A drop: the hits set to always, and up to `max` in all with one or more drawn from
     * those in the mix (`enabled`: { name: mode }), never the same draw as the last drop.
     * Returns their names.
     */
    drop(enabled, max = 2) {
      const always = Object.keys(DROP_FX).filter((k) => modeOf(enabled?.[k], 'mix') === 'on');
      const pool = Object.keys(DROP_FX).filter((k) => modeOf(enabled?.[k], 'mix') === 'mix');
      let drawn = [];
      const room = Math.min(pool.length, Math.max(always.length ? 0 : 1, max - always.length));
      for (let tries = 0; room && tries < 6; tries++) {
        const n = 1 + Math.floor(Math.random() * room);
        drawn = shuffle([...pool]).slice(0, n);
        if (drawn.slice().sort().join() !== lastDrop || pool.length === 1) break;
      }
      if (drawn.length) lastDrop = drawn.slice().sort().join();
      const chosen = [...always, ...drawn];
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
    /**
     * The looks' effects, the drop hits, the layers, and every look's framing. `modes`: the
     * settings (looks, the layers' switches, mirror kinds).
     */
    update(dt, { amt, build, low, energy, modes: m = {} }) {
      modes = m;
      clock += dt;
      kick *= Math.exp(-dt / 0.14);
      dip *= Math.exp(-dt / 0.09);
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
      const on = amt > 0 ? 1 : 0;
      const a = Math.min(1, amt);
      const layer = (k) => on && active(k, m[k]);
      const P = roll.p;

      // Glitch (and a shatter): tears and crunch.
      if (has('glitch') && amt > 0 && build > 0.3 && Math.random() < dt * 6 * build) { slice = Math.max(slice, 0.25 + 0.5 * build); reseed(); }
      const gl = has('glitch') || fx.shatter > 0 ? amt : 0;
      g.slice = gl * Math.min(1, slice);
      g.split = Math.round(
        (has('glitch') ? amt * (1.6 * kick + 3 * hitEnv + 1.5 * build) : 0)
        + (has('prism') ? amt * (1 + 5 * kick + 6 * hitEnv) : 0)
        + amt * 10 * env('split') ** 1.5,
      );
      g.block = 1 + Math.round(
        gl * 3 * block
        + (has('mosaic') ? amt * (roll.crunch * 1.6 * kick + 4 * hitEnv) : 0)
        + amt * 7 * env('crunch') ** 2,
      );
      g.wave = gl * (1.2 * build + 3 * hitEnv) + (has('haze') ? amt * (0.8 + 1.8 * energy + 2.5 * kick) : 0);
      g.noise = gl * (0.08 * build + 0.12 * hitEnv);

      // Echoes: the echo look, a light one under the kaleidoscope, the vortex, and the drop bursts.
      let echo = Math.max(
        has('echo') ? 0.62 + 0.2 * energy + 0.2 * Math.max(0, spinFor) : 0,
        has('kaleido') ? 0.4 : 0,
        has('vortex') ? 0.7 + 0.15 * energy : 0,
      );
      echo = Math.max(echo, 0.85 * env('burst'), 0.8 * env('spiral'));
      g.feedback = Math.min(0.9, amt * echo);
      const zoomBy = has('echo') ? 0.012 + 0.03 * kick + 0.05 * hitEnv : has('vortex') ? 0.01 + 0.02 * kick : 0.006;
      g.zoom = 1 + (has('echo') && roll.zoomIn ? -0.6 : 1) * zoomBy + 0.06 * env('burst');
      g.feedRot = (has('vortex') ? roll.turn * (0.02 + 0.05 * kaleSpin) : 0) + roll.turn * 0.07 * env('spiral');
      g.cycle = spinFor > 0 ? Math.floor(clock * 16) % 4 : cycleFor > 0 ? cycleStep : 0;

      // Ripple: rings out of the fire (radius as a fraction of the screen height).
      ripples = ripples.filter((r) => (r.t += dt) < 0.7);
      const front = ripples.filter((r) => r.t >= 0).at(-1);
      g.rippleR = front ? front.t * 1.6 : 0;
      g.rippleAmp = front && amt > 0 ? amt * 7 * front.s * (1 - front.t / 0.7) : 0;

      // Kaleidoscope.
      kaleRot += dt * (0.12 + 1.5 * kaleSpin);
      g.kaleido = (has('kaleido') || fx.kaleido > 0) && amt > 0 ? kaleSeg : 0;
      g.kaleidoRot = kaleRot;

      // Ink, the negative.
      g.ink = (has('ink') && inkFor > 0) || fx.ink > 0 ? Math.min(1, amt) : 0;
      g.invert = invertFor > 0 ? 1 : 0;

      // The mirror and scanlines: off, in the mix (this look rolled one), or always.
      g.mirror = fx.flips > 0 && on ? mirrorMode(m.mirrors, ...flip) : layer('mirror') ? mirrorMode(m.mirrors, ...roll.mirror) : 0;
      const scanned = layer('scanlines') || has('ink');
      g.scan = scanned ? 0.22 : 0;
      g.scanMode = has('ink') ? 0 : roll.scan;

      // The layers, each rolled in (or always on), scaled by the effects' strength.
      g.ghost = layer('ghost') ? Math.min(0.85, a * P.ghostMix * (0.8 + 0.4 * energy)) : 0;
      g.ghostKeep = P.ghostKeep;
      g.blur = layer('blur') ? a * P.blur : 0;
      g.glow = layer('glow') ? a * P.glowAmt * (0.7 + 0.5 * kick + 0.3 * hitEnv) : 0;
      g.glowSize = P.glowSize;
      g.glowCut = P.glowCut;
      g.grad = layer('gradient') ? Math.min(1, a * P.gradAmt * (1 + 0.3 * kick)) : 0;
      [g.gradA, g.gradB, g.gradC] = P.grad;
      const paint = layer('paint');
      const wash = layer('wash');
      g.style = paint && wash ? (P.styleFlip ? 1 : 2) : paint ? 1 : wash ? 2 : 0;
      g.styleR = g.style === 1 ? P.paintR : P.washR;
      g.styleMix = a * P.styleMix;
      g.paintAngle = P.paintAngle;
      g.paintAspect = P.paintAspect;
      g.washEdge = P.washEdge;
      g.flickerMode = P.flicker;
      g.flicker = layer('flicker') ? a * FLICKER_AMP[P.flicker] * (P.flicker === 0 ? dip : 1) : 0;
      // How the layers blend: their classic ways, or ones rolled for this look.
      const b = layer('blend') ? roll.blends : CLASSIC;
      g.feedMode = b.feed;
      g.ghostMode = b.ghost;
      g.warpMode = b.warp;
      g.warpMix = b === CLASSIC ? 1 : P.warpMix;
      g.inkMode = b.ink;
      g.invertMode = b.invert;
      g.scanBlend = b.scan;
      g.glowMode = b.glow;
      g.gradMode = b.gradient;

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
