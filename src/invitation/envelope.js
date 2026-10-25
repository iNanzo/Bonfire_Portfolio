// The envelope that opens /invitation/, as pure logic (no DOM, no three.js; envelopeScene.js draws
// it and takes the input): its states (types.js EnvelopeState: floating until it's opened or
// skipped; opening while the seal cracks and the flap lifts; waiting when it's open before NEWT is
// in, with a small pulse; fading as it pushes toward the camera and dithers out; gone, or
// skipped, as it drops away), how a drag on it reads (envelopeGesture: a swipe up opens it, a
// swipe down skips, far enough or a fast flick, and mostly up or down), the keys (envelopeKey),
// how it follows a finger with some give while the flap lifts (dragPose), the live hint while
// dragging (dragHint) and the whole opening as functions of time (pose). Reduced motion: no bob
// or sway, the flap snaps open, and a short crossfade in place of the push and the dither.

/** @typedef {import('./types.js').EnvelopeState} EnvelopeState */

/** The words on it: labels in Title Case, hints in sentences. */
export const ENVELOPE_TEXT = {
  layer: 'Invitation',
  open: 'Open the Invitation',
  hint: 'Click or swipe up to open',
  hintSkip: 'Swipe down to skip',
  dragOpen: 'Open ↑',
  dragSkip: 'Skip ↓',
  skip: 'Skip Intro',
};

/**
 * How a drag reads, CSS px and ms: up or down by `min` px or `share` of the screen's height,
 * whichever is more, or a flick of `flick` px/ms over `flickMin` px or more, and `ratio` times
 * more up or down than across; under `tap` px it's a press (a tap opens it).
 */
export const SWIPE = { min: 48, share: 0.12, flick: 0.6, flickMin: 24, ratio: 1.2, tap: 10 };

/**
 * The timeline, seconds: the seal cracks over `crack`; the flap lifts from `flapAt` over `flap`;
 * opening lasts `opening`; the push and the dither-out `fade`; a skip's drop `skip`; reduced
 * motion's crossfade `reducedFade`; the touch hint shows after `idleHint` with no input.
 */
export const TIMES = {
  crack: 0.22,
  flapAt: 0.12,
  flap: 0.5,
  opening: 0.72,
  fade: 0.7,
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
 * lifts (its share of the way to opening, 0..1).
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
 * @property {number} crack  the seal's crack, 0 whole to 1 split
 * @property {number} flap  the flap's angle, radians (FLAP_OPEN fully open)
 * @property {number} push  toward the camera, 0..1
 * @property {number} fade  how far it's gone, 0 there to 1 gone (dithered out, or crossfaded)
 * @property {number} drop  how far it's dropped away (a skip), 0..1
 * @property {number} pulse  waiting for NEWT: 0..1
 * @property {boolean} crossfade  reduced motion: fade is an opacity, not a dither
 */

/**
 * The envelope's states and timeline; `t` is any clock in seconds that only goes forward.
 * @param {{reduced?: boolean}} [o]  reduced motion
 */
export function createEnvelope({ reduced = false } = {}) {
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
      const p = { bob, yaw, crack: 0, flap: 0, push: 0, fade: 0, drop: 0, pulse: 0, crossfade: reduced };
      if (state === 'floating') return p;
      if (state === 'skipped') {
        const k = (t - skippedAt) / skipLen;
        p.drop = reduced ? 0 : easeIn(k);
        p.fade = reduced ? smooth(k) : smooth(k * 1.25);
        return p;
      }
      const since = t - openedAt;
      p.crack = reduced ? 1 : easeOut(since / TIMES.crack);
      p.flap = reduced ? FLAP_OPEN : FLAP_OPEN * easeOut((since - TIMES.flapAt) / TIMES.flap);
      if (since >= opening - EPS) p.flap = FLAP_OPEN;
      if (state === 'waiting' && !reduced) p.pulse = 0.5 - 0.5 * Math.cos(((t - waitAt) * 2 * Math.PI) / TIMES.pulse);
      if (state === 'fading' || state === 'gone') {
        const k = state === 'gone' ? 1 : (t - fadeAt) / fadeLen;
        p.push = reduced ? 0 : easeIn(k);
        p.fade = reduced ? smooth(k) : smooth((k - 0.15) / 0.85);
      }
      return p;
    },
  };
}
