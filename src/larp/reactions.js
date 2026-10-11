// What the bonfire (and the knights, once they're here) do when a banner comes up: every
// banner makes the fire answer, rolled fresh each time ("endless variations") unless the
// modifier names one, or has it Off. The size of the award sets how hard: a big one stokes
// and rings, a small one pulses; a loss dims to a quick pulse with no ring. A Special
// modifier calls the knights in with its banner; while they're here every banner has each of
// them gesture in turn, cheering a gain (praise, hurrah, joy, a dance in place) and shrugging
// or bowing at a loss. Off: no reaction at all (a Special one still calls the knights in).
// Reduced motion keeps only a gentle stoke and the knights' coming.
//
//   REACTIONS                      the choices a modifier offers (Random first, Off last)
//   rollReaction(entry, o)         → { fire: Call[], knights: Call[] }: pure, with `rand`
//
// A Call is { method, args, delayMs }: the stage plays it on the scene (scene.js createBonfire)
// or its knights after `delayMs`, and a method the scene doesn't have does nothing.
import { ELEMENT_IDS } from '../effectsDefaults.js';

/** The reactions a modifier may ask for. */
export const REACTIONS = Object.freeze({
  random: 'Random',
  stoke: 'Stoke',
  pulse: 'Pulse',
  sparkle: 'Sparkle',
  ring: 'Ring',
  flash: 'Firefly Flash',
  swap: 'Element Swap',
  off: 'Off',
});

/** What Random draws from (Off and Random themselves aside). */
export const ROLLED = Object.freeze(['stoke', 'pulse', 'sparkle', 'ring', 'flash', 'swap']);

/** Cheers for a gain, gestures for a loss (knightGestures.js GESTURES). */
export const CHEERS = Object.freeze(['praise', 'hurrah', 'joy', 'dance']);
export const LOSSES = Object.freeze(['shrug', 'bow']);

/** How long a summoned knight takes to form before he can gesture (ms). */
export const FORM_MS = 1600;
/** The gap between one knight's gesture and the next's (ms). */
export const STAGGER_MS = 260;

/**
 * @typedef {{ method: string, args: unknown[], delayMs: number }} Call
 * @typedef {{ points: number, mult: number, reaction?: string, special?: boolean }} Moment
 */

/** @param {string} method @param {unknown[]} [args] @param {number} [delayMs] @returns {Call} */
const call = (method, args = [], delayMs = 0) => ({ method, args, delayMs });

/** @template T @param {readonly T[]} list @param {() => number} rand @returns {T} */
const pick = (list, rand) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

/**
 * How big a moment is, 0..1: points against 100, a multiplier counting as 50 a step.
 * @param {Moment} m
 */
export function sizeOf(m) {
  const p = Math.abs(Number(m.points) || 0);
  const x = Math.max(0, (Number(m.mult) || 1) - 1) * 50;
  return Math.min(1, (p + x) / 100);
}

/**
 * The fire's calls for one reaction `kind` at `size` (0..1); `loss` softens it.
 * @param {string} kind
 * @param {number} size
 * @param {boolean} loss
 * @param {() => number} rand
 * @param {string|null} element the element burning now (a swap goes to another)
 * @returns {Call[]}
 */
function fireCalls(kind, size, loss, rand, element) {
  const s = loss ? 0.35 : 0.5 + size * 0.5;
  switch (kind) {
    case 'stoke':
      return loss ? [call('pulse', [0.4])] : size > 0.6 ? [call('stoke'), call('stoke', [], 220)] : [call('stoke')];
    case 'pulse':
      return [call('pulse', [s, { accent: !loss }])];
    case 'sparkle':
      return [call('sparkle', [loss ? 2 : 3 + Math.round(size * 5)])];
    case 'ring':
      return loss ? [call('pulse', [s])] : [call('ring', [s]), call('sparkle', [2 + Math.round(rand() * 3)], 300)];
    case 'flash':
      return [call('flash', ['center']), call('pulse', [s * 0.6], 120)];
    case 'swap': {
      const others = ELEMENT_IDS.filter((e) => e !== element);
      return [call('swapElement', [pick(others.length ? others : ELEMENT_IDS, rand)])];
    }
    default:
      return [];
  }
}

/**
 * What the fire and the knights do for a banner. `knightsHere` is how many knights are present
 * before it; a Special one brings `knightCount` (setCast) when fewer are here, and they gesture
 * once they've formed.
 * @param {Moment} m
 * @param {{ rand?: () => number, reducedMotion?: boolean, knightsHere?: number, knightCount?: number, element?: string|null }} [o]
 * @returns {{ fire: Call[], knights: Call[], kind: string }}
 */
export function rollReaction(m, o = {}) {
  const { rand = Math.random, reducedMotion = false, knightsHere = 0, knightCount = 2, element = null } = o;
  const loss = (Number(m.points) || 0) < 0;
  const size = sizeOf(m);
  const asked = m.reaction && Object.hasOwn(REACTIONS, m.reaction) ? m.reaction : 'random';
  const kind = asked === 'random' ? pick(ROLLED, rand) : asked;

  /** @type {Call[]} */
  const knights = [];
  let here = Math.max(0, knightsHere | 0);
  let wait = 0;
  if (m.special && here < knightCount) {
    knights.push(call('setCast', [{ count: knightCount }]));
    here = knightCount;
    wait = FORM_MS;
  }

  if (kind === 'off') return { kind, fire: [], knights };
  if (reducedMotion) return { kind: 'stoke', fire: [call('stoke')], knights };

  const fire = fireCalls(kind, size, loss, rand, element);
  if (here > 0) {
    const pool = loss ? LOSSES : CHEERS;
    // (Fisher–Yates on `rand`: who goes first changes every time.)
    const order = Array.from({ length: here }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((index, n) => knights.push(call('gesture', [pick(pool, rand), { index }], wait + n * STAGGER_MS)));
  }
  return { kind, fire, knights };
}
