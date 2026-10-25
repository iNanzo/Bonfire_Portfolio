// The envelope that opens /invitation/, as pure logic (no DOM, no three.js; envelopeScene.js draws
// it and takes the input): its states (types.js EnvelopeState: floating until it's opened or
// skipped; opening while the wax seal blooms into rose petals and only then the flap lifts;
// waiting when it's open before NEWT is in, with a small pulse; fading as the letter dissolves
// into particles, like a weapon on the Bonfire site, while the white page behind it clears;
// gone, or skipped, as it drops away), how a drag on it reads (envelopeGesture: a swipe up opens
// it, a swipe down skips, far enough or a fast flick, and mostly up or down), the keys
// (envelopeKey), how it follows a finger with some give while the seal starts to open
// (dragPose), the live hint while dragging (dragHint), the hint's words for a touch screen or a
// mouse (hintFor), how it settles in as it arrives, the whole opening as functions of time
// (pose), the seal shrinking away as it blooms (sealBloom: its petals are petals.js's), the
// hover's slow pulse (hoverStep, hoverPulse) and how it shows (hoverLook: a wide glow, a lift
// toward the camera and the paper a step brighter at its peak; pressStep, a finger down on it,
// strong at once), the letter's turn toward the pointer and with a
// sideways drag or the arrow keys (turnGoal, turnStep), and the
// dissolve: where its noisy edge has reached on the letter (dissolveAt, DISSOLVE: the scene's
// shader runs the same sums) and the specks it sheds there, drifting up and fading
// (shedParticles, particleAt). Reduced motion: no bob or sway, no bloom (the seal simply fades
// with the letter), the flap snaps open, and a short plain fade in place of the dissolve.
import { createRng } from './rng.js';

/** @typedef {import('./types.js').EnvelopeState} EnvelopeState */

/** The words on it: labels in Title Case, hints in sentences. */
export const ENVELOPE_TEXT = {
  layer: 'Invitation',
  open: 'Open the Invitation',
  hint: 'Click or swipe up to open',
  hintTouch: 'Tap or swipe up to open',
  hintSkip: 'Swipe down to skip',
  dragOpen: 'Open ↑',
  dragSkip: 'Skip ↓',
  skip: 'Skip Intro',
};

/**
 * The hint to open it: a tap on a touch screen, a click with a mouse.
 * @param {boolean} touch  a touch screen (no hover)
 */
export const hintFor = (touch) => (touch ? ENVELOPE_TEXT.hintTouch : ENVELOPE_TEXT.hint);

/**
 * How a drag reads, CSS px and ms: up or down by `min` px or `share` of the screen's height,
 * whichever is more, or a flick of `flick` px/ms over `flickMin` px or more, and `ratio` times
 * more up or down than across; under `tap` px it's a press (a tap opens it).
 */
export const SWIPE = { min: 48, share: 0.12, flick: 0.6, flickMin: 24, ratio: 1.2, tap: 10 };

/**
 * The timeline, seconds: it settles in over `arrive` as it's made; opened, the seal blooms into
 * rose petals over `bloom` (a brisk beat: the visitor is waiting), and only then, from `flapAt`,
 * the flap lifts over `flap`; opening lasts `opening`; the dissolve's edge sweeps the letter over `dissolve` while the page
 * behind clears over `clear`, and a speck drifts for up to `drift` once it's shed, so the fade
 * lasts `fade`; a skip's drop `skip`; reduced motion's plain fade `reducedFade`; the touch hint
 * shows after `idleHint` with no input.
 */
export const TIMES = {
  arrive: 0.55,
  bloom: 0.45,
  flapAt: 0.45,
  flap: 0.4,
  opening: 0.85,
  dissolve: 0.9,
  clear: 0.3,
  drift: 0.6,
  fade: 1.5,
  skip: 0.45,
  reducedFade: 0.2,
  idleHint: 1.2,
  pulse: 0.9,
};

/** How far it bobs, world units, and sways, radians (±). */
export const BOB = 0.03;
export const SWAY = (8 * Math.PI) / 180;
/** The flap's angle fully open, radians: folded right back. */
export const FLAP_OPEN = Math.PI * 0.94;

/** (A clock's sums land a hair short: 13 + 0.7 − 13 is 0.6999….) */
const EPS = 1e-9;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
const easeIn = (v) => clamp01(v) ** 2;
const smooth = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/**
 * The dissolve's sums (the scene's shader runs the same, with a screen-locked dither on top):
 * each point of the letter has a value, mostly how far up it is (`rise` of it, leaning `lean`
 * across, so it sweeps up from the lower left) and the rest a smooth noise `scale` across; it's
 * gone once the edge, `edge(dissolve)`, passes its value. The edge starts `slack` under 0 and
 * ends `slack` over 1, so the dither (+-`dither`/2) can't keep a texel at either end.
 */
export const DISSOLVE = {
  rise: 0.62,
  lean: 0.35,
  scale: 2.6,
  dither: 0.12,
  slack: 0.08,
  /** @param {number} d  the dissolve, 0..1 */
  edge: (d) => d * (1 + 2 * DISSOLVE.slack) - DISSOLVE.slack,
};

/** The shader's hash and value noise (fract-based, so JS and GLSL agree closely enough). */
const fract = (v) => v - Math.floor(v);
/**
 * @param {number} x
 * @param {number} y
 */
function hash2(x, y) {
  const a = fract(x * 0.3183099 + 0.1) * 17;
  const b = fract(y * 0.3183099 + 0.1) * 17;
  return fract(a * b * (a + b));
}
/**
 * @param {number} x
 * @param {number} y
 */
function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy) + (hash2(ix + 1, iy) - hash2(ix, iy)) * fx;
  const b = hash2(ix, iy + 1) + (hash2(ix + 1, iy + 1) - hash2(ix, iy + 1)) * fx;
  return a + (b - a) * fy;
}

/**
 * The dissolve's value at a point of the letter, 0..1 (it's gone once the edge passes it).
 * @param {number} x  across the letter, -1 left to 1 right
 * @param {number} y  up it, -1 bottom to 1 top
 */
export function dissolveAt(x, y) {
  const h = Math.min(1, Math.max(0, ((y + x * DISSOLVE.lean) / (1 + DISSOLVE.lean)) * 0.5 + 0.5));
  return h * DISSOLVE.rise + noise2((x + 1.3) * DISSOLVE.scale, (y + 2.1) * DISSOLVE.scale) * (1 - DISSOLVE.rise);
}

/**
 * The open flap's tip over the letter's top, in its units (−1…1 is the letter's whole height):
 * the flap is 0.64 of its height deep (envelopeScene.js buildEnvelope), folded back over its top.
 */
export const FLAP_TIP = 1.28;

/**
 * Whether the letter still hides the point (x, y) of it, in its own units (−1…1 across and up
 * its body; its flap, as far as it's folded back, a triangle over its top to FLAP_TIP at the
 * middle): until the dissolve's edge has passed the point's value with half the dither on top,
 * so no texel of it is left there (reduced motion's plain fade: until it's half gone). Outside
 * it, never.
 * @param {EnvelopePose} p
 * @param {number} x
 * @param {number} y
 */
export function letterCovers(p, x, y) {
  const across = Math.abs(x);
  const folded = Math.max(0, -Math.cos(p.flap));
  const onBody = across <= 1 && Math.abs(y) <= 1;
  const onFlap = across <= 1 && y > 1 && y <= 1 + FLAP_TIP * folded * (1 - across);
  if (!onBody && !onFlap) return false;
  if (p.crossfade) return p.fade < 0.5;
  return DISSOLVE.edge(p.dissolve) < dissolveAt(x, y) + DISSOLVE.dither / 2;
}

/**
 * When the edge reaches the value `v`, seconds into the fade (the dissolve eases in and out:
 * smooth(), whose inverse this is).
 * @param {number} v
 */
function reachedAt(v) {
  const d = Math.min(1, Math.max(0, (v + DISSOLVE.slack) / (1 + 2 * DISSOLVE.slack)));
  return TIMES.dissolve * (0.5 - Math.sin(Math.asin(1 - 2 * d) / 3));
}

/**
 * @typedef {object} Speck  a speck the letter sheds
 * @property {number} x  where on the letter, -1..1 across
 * @property {number} y  -1..1 up
 * @property {'paper'|'ember'|'wax'} kind
 * @property {number} at  when the edge reaches it, seconds into the fade
 * @property {number} life  how long it drifts, seconds (up to TIMES.drift)
 * @property {number} vx  its drift across, envelope widths a second
 * @property {number} vy  and up
 * @property {number} phase  its flutter's
 * @property {number} size  texels
 */

/**
 * The specks the letter sheds as it dissolves, the same every visit: mostly paper, some embers
 * from the burning edge, and a few crumbs of wax where the seal was (`seal`, in the letter's
 * -1..1 units).
 * @param {number} n
 * @param {{seal?: [number, number]}} [o]
 * @returns {Speck[]}
 */
export function shedParticles(n, { seal = [0, -0.24] } = {}) {
  const rng = createRng(16);
  return Array.from({ length: n }, (_, i) => {
    /** @type {Speck['kind']} */
    const kind = i % 9 === 4 ? 'wax' : i % 4 === 1 ? 'ember' : 'paper';
    let x = rng() * 2 - 1;
    let y = rng() * 2 - 1;
    if (kind === 'wax') {
      x = seal[0] + (rng() - 0.5) * 0.4;
      y = seal[1] + (rng() - 0.5) * 0.5;
    }
    x = Math.min(1, Math.max(-1, x));
    y = Math.min(1, Math.max(-1, y));
    return {
      x,
      y,
      kind,
      at: reachedAt(dissolveAt(x, y)),
      life: TIMES.drift * (kind === 'ember' ? 0.55 + rng() * 0.35 : 0.7 + rng() * 0.3),
      vx: (rng() - 0.5) * 0.24,
      vy: kind === 'ember' ? 0.42 + rng() * 0.3 : 0.24 + rng() * 0.22,
      phase: rng() * Math.PI * 2,
      size: kind === 'ember' ? 2 + (rng() < 0.3 ? 1 : 0) : 3 + (rng() < 0.25 ? 1 : 0),
    };
  });
}

/**
 * A speck `t` seconds into the fade: how far it's drifted from where it was shed (envelope
 * widths: x across, y up, z toward the camera) and how much of it shows (0 before the edge
 * reaches it and once it's drifted its life).
 * @param {Speck} s
 * @param {number} t
 */
export function particleAt(s, t) {
  const age = t - s.at;
  if (age < 0 || age >= s.life) return { x: 0, y: 0, z: 0, alpha: 0 };
  const k = age / s.life;
  // (It rises, slowing a little, with a flutter across.)
  const y = s.vy * age * (1 - 0.3 * k);
  const x = s.vx * age + 0.025 * Math.sin(s.phase + age * 9) * k;
  const z = 0.15 * age;
  const alpha = s.kind === 'ember' ? 1 - easeIn(k) : 1 - smooth((k - 0.35) / 0.65);
  return { x, y, z, alpha: Math.max(0, alpha) };
}

/**
 * What a drag on the envelope did once it's let go.
 * @param {number} dx  across, CSS px
 * @param {number} dy  down, CSS px (up is negative)
 * @param {number} ms  how long it took
 * @param {number} viewportH  the screen's height, CSS px
 * @returns {'open'|'skip'|'none'}
 */
export function envelopeGesture(dx, dy, ms, viewportH) {
  const ady = Math.abs(dy);
  if (ady <= SWIPE.ratio * Math.abs(dx) || ady < SWIPE.flickMin) return 'none';
  const far = ady >= Math.max(SWIPE.min, SWIPE.share * viewportH);
  const fast = ady / Math.max(ms, 1e-6) >= SWIPE.flick;
  if (!far && !fast) return 'none';
  return dy < 0 ? 'open' : 'skip';
}

/**
 * What a press on the envelope did once it's let go. It is a tap (open) only if the pointer
 * never got as far as the tap slop from where it went down; past that, the swipe its last offset
 * makes, so a drag out and back to its start (turning the letter, or up and down) does nothing.
 * @param {{dx: number, dy: number, far: number, ms: number}} drag  the last offset across and
 *   down, CSS px; the farthest it got along either axis, CSS px; how long it took
 * @param {number} viewportH  the screen's height, CSS px
 * @returns {'open'|'skip'|'none'}
 */
export function releaseGesture({ dx, dy, far, ms }, viewportH) {
  if (far < SWIPE.tap) return 'open';
  return envelopeGesture(dx, dy, ms, viewportH);
}

/**
 * What a key does on the envelope.
 * @param {string} key  KeyboardEvent.key
 * @returns {'open'|'skip'|null}
 */
export function envelopeKey(key) {
  if (key === 'Enter' || key === ' ' || key === 'ArrowUp') return 'open';
  if (key === 'Escape' || key === 'ArrowDown') return 'skip';
  return null;
}

/**
 * Where the envelope goes while a finger drags it: it follows with some give (less and less
 * the further it goes, never more than about a third of the screen) and, going up, the flap
 * lifts toward opening (its share of the way, 0..1: the scene starts the seal opening with it).
 * @param {number} dy  down, CSS px
 * @param {number} viewportH
 * @returns {{follow: number, lift: number}}  follow: CSS px down
 */
export function dragPose(dy, viewportH) {
  if (!dy) return { follow: 0, lift: 0 };
  const reach = Math.max(80, viewportH * 0.3);
  const follow = Math.sign(dy) * reach * (1 - Math.exp((-0.8 * Math.abs(dy)) / reach));
  const lift = dy < 0 ? clamp01(-dy / Math.max(SWIPE.min, SWIPE.share * viewportH)) * 0.45 : 0;
  return { follow, lift };
}

/**
 * The live hint while dragging: which way it goes, or nothing under the tap slop.
 * @param {number} dy
 * @returns {'open'|'skip'|null}
 */
export function dragHint(dy) {
  if (Math.abs(dy) < SWIPE.tap) return null;
  return dy < 0 ? 'open' : 'skip';
}

/**
 * @typedef {object} EnvelopePose  the envelope at a moment
 * @property {number} bob  up, world units (±BOB while it floats)
 * @property {number} yaw  its sway, radians (±SWAY)
 * @property {number} arrive  settling in as it's made, 0..1 (1 once it's there)
 * @property {number} bloom  the seal blooming into petals, 0 whole to 1 all petals (sealBloom)
 * @property {number} flap  the flap's angle, radians (FLAP_OPEN fully open)
 * @property {number} push  toward the camera, 0..1 (a little, as it dissolves)
 * @property {number} fade  how far it's gone, 0 there to 1 gone (dissolved, or crossfaded)
 * @property {number} dissolve  the dissolve's edge across the letter, 0 whole to 1 gone
 * @property {number} since  seconds into the fade (the specks' clock; 0 before it)
 * @property {number} backdrop  the white page behind it, 1 up to 0 clear (a plain fade)
 * @property {number} drop  how far it's dropped away (a skip), 0..1
 * @property {number} pulse  waiting for NEWT: 0..1
 * @property {boolean} crossfade  reduced motion: fade is an opacity, not a dissolve
 */

/**
 * The seal as it blooms (`b`, 0..1): a little swell as it starts to open, then shrinking away to
 * nothing while its petals unfurl out of it, turning a little like a rose opening.
 * @param {number} b
 * @returns {{scale: number, spin: number}}  spin: radians
 */
export function sealBloom(b) {
  const k = clamp01(b);
  if (k === 0) return { scale: 1, spin: 0 };
  const swell = 1 + 0.12 * Math.sin(Math.PI * Math.min(1, k / 0.3));
  const scale = k >= 1 ? 0 : k < 0.15 ? swell : Math.min(swell, 1.12 * (1 - smooth((k - 0.15) / 0.85)));
  return { scale, spin: 0.5 * easeOut(k) };
}

/**
 * The letter's turn, radians: it leans up to `lean` toward the pointer's x, eased out (most of it
 * by halfway to the edge: about 0.1 there, so it reads at a glance); a sideways drag (by `reach`
 * of the screen's width, softly) or a held arrow key turns it up to `push` further; never more
 * than `max` in all; it eases toward that over about `ease` seconds and springs back. (The
 * paper's tones don't change with its yaw, so the whole range reads as one flat letter turning.)
 */
export const TURN = { lean: 0.14, push: 0.16, reach: 0.25, max: 0.24, ease: 0.12, roll: 0.45 };

/**
 * The roll that goes with a turn (radians about the screen's axis, clockwise for a turn right):
 * `roll` of it, its top tipping the way it turns. A yaw of a flat letter seen face on only narrows
 * it a little; with this it reads as leaning toward the cursor.
 * @param {number} turn
 */
export const turnRoll = (turn) => -TURN.roll * turn;

/**
 * Where the letter's turn heads (radians, its face toward +x for more): toward the pointer
 * (`pointer`: its x across the screen, −1 at the left edge to 1 at the right; null without one:
 * on a touch screen, no finger down), plus a sideways drag (`dx` CSS px on a screen `w` wide) or a
 * held arrow key (`key`: −1 ArrowLeft, 1 ArrowRight, else 0).
 * @param {{pointer?: number|null, dx?: number, w?: number, key?: number}} o
 */
export function turnGoal({ pointer = null, dx = 0, w = 1, key = 0 }) {
  const x = pointer === null ? 0 : Math.max(-1, Math.min(1, pointer));
  const lean = TURN.lean * Math.sign(x) * (1 - (1 - Math.abs(x)) ** 2);
  const push = TURN.push * (Math.tanh(dx / (TURN.reach * Math.max(1, w))) + key);
  return Math.max(-TURN.max, Math.min(TURN.max, lean + push));
}

/**
 * The turn a step on toward `goal`, eased (and back, once there's nothing turning it); reduced
 * motion keeps it square on.
 * @param {number} turn
 * @param {number} goal
 * @param {number} dt  seconds
 * @param {boolean} [reduced]
 */
export function turnStep(turn, goal, dt, reduced = false) {
  if (reduced) return 0;
  return turn + (goal - turn) * (1 - Math.exp(-dt / TURN.ease));
}

/**
 * The hover's pulse: one every `period` seconds; the hover eases in over `in` and out over `out`
 * seconds; with reduced motion it's a steady `still`.
 */
export const HOVER_PULSE = { period: 2.8, in: 0.25, out: 0.4, still: 0.5 };

/**
 * The hover a step on: toward 1 while `on` (the pointer over the letter, keyboard focus, or a
 * touch screen left alone), toward 0 otherwise.
 * @param {number} k  0..1
 * @param {boolean} on
 * @param {number} dt  seconds
 */
export function hoverStep(k, on, dt) {
  return on ? Math.min(1, k + dt / HOVER_PULSE.in) : Math.max(0, k - dt / HOVER_PULSE.out);
}

/**
 * How strong the hover's gold rim and halo show round the letter: the hover (`k`, eased) times a
 * slow pulse `t` seconds into it, from nothing to full and back to nothing (so between pulses the
 * letter shows clean); with reduced motion, steady.
 * @param {number} k
 * @param {number} t
 * @param {boolean} [reduced]
 */
export function hoverPulse(k, t, reduced = false) {
  if (reduced) return k * HOVER_PULSE.still;
  return k * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / HOVER_PULSE.period));
}

/**
 * How the hover shows at full strength (hoverLook): the letter scaled up by `scale` and brought
 * `toward` of the camera's distance nearer; a glow `reach` texels past its line (from the two
 * the old gold halo had) and a warm rim `rim` texels deep inside its edge; its paper a step
 * brighter from `bright` of the pulse up. A finger down on it (pressStep) shows it in over `in`
 * seconds and, lifted, out over `out`.
 */
export const HOVER_LOOK = {
  scale: 0.03,
  toward: 0.015,
  reach: [2, 6],
  rim: [2, 3],
  bright: 0.6,
  in: 0.06,
  out: 0.35,
};

/**
 * The hover as drawn at `pulse` (0..1: hoverPulse, or a finger's press, shownPulse): its lift (the
 * letter's scale and how far toward the camera, a share of its distance), the glow's reach and
 * the rim's depth (texels; 0 none) and the paper's brightening (0..1, only near the peak). At 0 it's
 * all clean.
 * @param {number} pulse
 */
export function hoverLook(pulse) {
  const k = clamp01(pulse);
  const L = HOVER_LOOK;
  if (k === 0) return { scale: 1, toward: 0, reach: 0, rim: 0, bright: 0 };
  return {
    scale: 1 + L.scale * smooth(k),
    toward: L.toward * smooth(k),
    reach: L.reach[0] + (L.reach[1] - L.reach[0]) * k,
    rim: L.rim[0] + (L.rim[1] - L.rim[0]) * k,
    bright: smooth((k - L.bright) / (1 - L.bright)),
  };
}

/**
 * A finger (or the mouse) down on the letter a step on: in fast while it's `down`, out once it's
 * lifted.
 * @param {number} k  0..1
 * @param {boolean} down
 * @param {number} dt  seconds
 */
export function pressStep(k, down, dt) {
  return down ? Math.min(1, k + dt / HOVER_LOOK.in) : Math.max(0, k - dt / HOVER_LOOK.out);
}

/**
 * The hover as shown: the pulse, or a press on the letter where that's stronger.
 * @param {number} pulse
 * @param {number} press
 */
export const shownPulse = (pulse, press) => Math.max(pulse, press);

/**
 * The envelope's states and timeline; `t` is any clock in seconds that only goes forward.
 * @param {{reduced?: boolean, born?: number}} [o]  reduced motion; when it was made (it settles
 *   in from then)
 */
export function createEnvelope({ reduced = false, born = 0 } = {}) {
  /** @type {EnvelopeState} */
  let state = 'floating';
  let openedAt = 0;
  let fadeAt = 0;
  let skippedAt = 0;
  let waitAt = 0;
  const opening = reduced ? 0 : TIMES.opening;
  const fadeLen = reduced ? TIMES.reducedFade : TIMES.fade;
  const skipLen = reduced ? TIMES.reducedFade : TIMES.skip;

  return {
    /** @returns {EnvelopeState} */
    get state() {
      return state;
    },
    /** It still covers the toy (floating, opening or waiting): the toy waits behind it. */
    get covers() {
      return state === 'floating' || state === 'opening' || state === 'waiting';
    },
    /** It was opened (not skipped). */
    get opened() {
      return state === 'opening' || state === 'waiting' || state === 'fading' || state === 'gone';
    },
    get reduced() {
      return reduced;
    },
    /**
     * Open it (from floating only).
     * @param {number} t
     */
    open(t) {
      if (state !== 'floating') return false;
      state = 'opening';
      openedAt = t;
      return true;
    },
    /**
     * Skip it (until it starts to fade: by then the intro is under way).
     * @param {number} t
     */
    skip(t) {
      if (state !== 'floating' && state !== 'opening' && state !== 'waiting') return false;
      state = 'skipped';
      skippedAt = t;
      return true;
    },
    /**
     * On through the timeline.
     * @param {number} t
     * @param {boolean} ready  NEWT is in (the toy's first frame is drawn)
     * @returns {EnvelopeState}
     */
    step(t, ready) {
      if (state === 'opening' && t - openedAt >= opening - EPS) {
        if (ready) {
          state = 'fading';
          fadeAt = t;
        } else {
          state = 'waiting';
          waitAt = t;
        }
      } else if (state === 'waiting' && ready) {
        state = 'fading';
        fadeAt = t;
      }
      if (state === 'fading' && t - fadeAt >= fadeLen - EPS) state = 'gone';
      return state;
    },
    /**
     * Whether it's all over and can go (gone, or skipped and dropped away).
     * @param {number} t
     */
    done(t) {
      return state === 'gone' || (state === 'skipped' && t - skippedAt >= skipLen - EPS);
    },
    /**
     * The envelope at `t`.
     * @param {number} t
     * @returns {EnvelopePose}
     */
    pose(t) {
      const bob = reduced ? 0 : BOB * Math.sin((t * 2 * Math.PI) / 3.2);
      const yaw = reduced ? 0 : SWAY * Math.sin((t * 2 * Math.PI) / 5.3 + 0.7);
      /** @type {EnvelopePose} */
      const p = {
        bob,
        yaw,
        arrive: reduced ? 1 : easeOut((t - born) / TIMES.arrive),
        bloom: 0,
        flap: 0,
        push: 0,
        fade: 0,
        dissolve: 0,
        since: 0,
        backdrop: 1,
        drop: 0,
        pulse: 0,
        crossfade: reduced,
      };
      if (state === 'floating') return p;
      if (state === 'skipped') {
        const k = (t - skippedAt) / skipLen;
        p.drop = reduced ? 0 : easeIn(k);
        p.fade = reduced ? smooth(k) : smooth(k * 1.25);
        p.backdrop = 1 - p.fade;
        return p;
      }
      const since = t - openedAt;
      p.bloom = reduced ? 0 : smooth(since / TIMES.bloom);
      p.flap = reduced ? FLAP_OPEN : FLAP_OPEN * easeOut((since - TIMES.flapAt) / TIMES.flap);
      if (since >= opening - EPS) p.flap = FLAP_OPEN;
      if (state === 'waiting' && !reduced) p.pulse = 0.5 - 0.5 * Math.cos(((t - waitAt) * 2 * Math.PI) / TIMES.pulse);
      if (state === 'fading' || state === 'gone') {
        const inFade = state === 'gone' ? fadeLen : t - fadeAt;
        if (reduced) {
          p.fade = smooth(inFade / fadeLen);
          p.backdrop = 1 - p.fade;
        } else {
          p.since = inFade;
          p.push = easeOut(inFade / fadeLen);
          p.dissolve = smooth(inFade / TIMES.dissolve);
          p.fade = p.dissolve;
          p.backdrop = 1 - smooth(inFade / TIMES.clear);
        }
      }
      return p;
    },
  };
}
