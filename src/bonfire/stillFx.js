// Which of the pixel pass's effects (scene.glitch → pixelPass.js) reach the picture under
// reduced motion (createBonfire's `reducedMotion`).
//
//   the show's    (Bonfire Live, the site) only the still ones (STILL): the framing, the
//                 palette's recolors and repaints, and how everything blends. Everything
//                 else is off (OFF: its resting value).
//   the Painter's (`paintedLook`: the look being painted must show, on the stage and in its
//                 thumbnail) everything but what flashes or jitters (HELD): the palette
//                 cycle, the negative, the ink flash and the drop's blackout, the flicker,
//                 torn rows and the RGB split, the ripple's shock, and the kaleidoscope's
//                 turn (held at its resting angle). A kaleidoscope, the echo, glow, the ghost
//                 trail, a gradient map, the repaints, grain, the bars and the spotlight show
//                 as painted; the pass's clock holds still (stillClock), so the grain and the
//                 heat shimmer are still pictures too.
// Pure (no three.js): node's tests read it as it is.

/** Effects that are a still look rather than motion or flashing (kept under reduced motion). */
export const STILL = new Set([
  'mirror',
  'scan',
  'scanMode',
  'block',
  'letterbox',
  'iris',
  'zoom',
  'temp',
  'grad',
  'gradA',
  'gradB',
  'gradC',
  'style',
  'styleR',
  'styleMix',
  'paintAngle',
  'paintAspect',
  'washEdge',
  'glowSize',
  'glowCut',
  'ghostKeep',
  'flickerMode',
  'feedMode',
  'ghostMode',
  'warpMode',
  'warpMix',
  'inkMode',
  'invertMode',
  'scanBlend',
  'glowMode',
  'gradMode',
]);
/** What flashes, jitters or turns: off under reduced motion even in the Painter's painted look. */
export const HELD = new Set([
  'cycle',
  'invert',
  'ink',
  'blackout',
  'flicker',
  'slice',
  'sliceSeed',
  'split',
  'rippleR',
  'rippleAmp',
  'kaleidoRot',
]);
/** Resting values that aren't 0. */
export const OFF = { iris: 2, zoom: 1, block: 1 };

/**
 * The value the pass takes for the effect `key` now set to `value`.
 * @param {string} key  a scene.glitch key
 * @param {number} value
 * @param {{ reducedMotion?: boolean, paintedLook?: boolean }} o
 */
export function passValue(key, value, { reducedMotion = false, paintedLook = false }) {
  if (!reducedMotion) return value;
  const kept = paintedLook ? !HELD.has(key) : STILL.has(key);
  return kept ? value : (OFF[key] ?? 0);
}

/** Whether the pass's clock (uTime: the grain, the shimmer, the flicker) holds still. */
export const stillClock = ({ reducedMotion = false, paintedLook = false }) => reducedMotion && paintedLook;
