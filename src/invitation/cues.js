// The ground cues under NEWT while he's held in the invitation toy (main.js draws them, stage.js
// holds the meshes): the blob shadow straight down under his hips while he's off the floor, its
// size, strength and edge set by his lowest foot's height (blobLook: smaller, fainter and softer
// the higher he is; eased in as he's picked up and out once he's down, blobWeight); the ring under
// him and the dashed drop line from his collar to it while he's held, the Ground Cues setting
// (Off / In the Mix / Always, look.js: none picked plays In the Mix, the bead hold's, CUE_DEFAULT
// and groundCueMode;
// In the Mix shows them while he's high or moving fast, mixWants, faded in and out, cueStep), the
// ring pulsing to full on a wall clamp or kept at the hold's floor In the Mix (ringFloor), the line fading in with his height (lineShare); and the
// brain's drag speed in screen px a second, so a stress threshold reads the same however deep he
// is (dragSpeedOf). Pure: no three.js, no DOM.

import { NEWT_HEIGHT } from './area.js';

/** @typedef {import('./hold.js').CueMode} CueMode */

/** Ground Cues' values, in Settings' order, and their labels. @type {readonly CueMode[]} */
export const CUE_MODES = Object.freeze(['off', 'mix', 'always']);
export const CUE_LABELS = Object.freeze({ off: 'Off', mix: 'In the Mix', always: 'Always' });
/** What Ground Cues plays until the look picks one: In the Mix, the bead hold's. @type {CueMode} */
export const CUE_DEFAULT = 'mix';

/**
 * The blob: `radius` × his height on contact, shrinking to `far` of it with his lowest foot two
 * heights up, `near` to `far` strength over the same (times the look's lifted strength over
 * `lookRef`), its soft edge `softNear` to `softFar` of the radius. The ring: `ring` × his height
 * across its middle. In the Mix: shown while his lowest foot is over `mixFoot` × his height or
 * he moves over `mixSpeed` u/s across the floor; cues fade over `fade` s, a pulse lasts `pulse` s.
 * The drop line fades in from `lineFrom` to `lineTo` × his height. The blob eases in and out over
 * `blobEase` s. The brain's drag speed: screen px a second over `dragPx`.
 */
export const CUES = {
  radius: 0.35,
  far: 0.6,
  near: 0.45,
  farAlpha: 0.2,
  lookRef: 0.34,
  softNear: 0.15,
  softFar: 0.5,
  ring: 0.4,
  mixFoot: 0.5,
  mixSpeed: 1,
  fade: 0.15,
  pulse: 0.12,
  lineFrom: 0.15,
  lineTo: 0.5,
  blobEase: 0.15,
  dragPx: 110,
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * The blob as he's off the floor: its radius, strength and soft edge (a share of the radius) with
 * his lowest foot `footH` world units over the floor and the look's `lifted` strength.
 * @param {number} footH
 * @param {number} lifted  the look preset's blob.lifted (floor.js floorLook)
 * @returns {{radius: number, alpha: number, soft: number}}
 */
export function blobLook(footH, lifted) {
  const f = clamp01(footH / (2 * NEWT_HEIGHT));
  return {
    radius: CUES.radius * NEWT_HEIGHT * lerp(1, CUES.far, f),
    alpha: clamp01(lerp(CUES.near, CUES.farAlpha, f) * (lifted / CUES.lookRef)),
    soft: lerp(CUES.softNear, CUES.softFar, f),
  };
}

/**
 * The blob's share of its lifted look, eased toward 1 while he's off the floor (held or falling)
 * and to 0 once he's down, over CUES.blobEase.
 * @param {number} w
 * @param {boolean} off  held or falling
 * @param {number} dt
 */
export const blobWeight = (w, off, dt) => clamp01(w + (off ? 1 : -1) * (CUES.blobEase > 0 ? dt / CUES.blobEase : 1));

/**
 * The Ground Cues setting as it plays: the look's own choice, or with none made (or one no longer
 * offered, such as an old 'auto') CUE_DEFAULT.
 * @param {unknown} value  look.groundCues
 * @returns {CueMode}
 */
export const groundCueMode = (value) =>
  CUE_MODES.includes(/** @type {any} */ (value)) ? /** @type {CueMode} */ (value) : CUE_DEFAULT;

/**
 * In the Mix's shared rule: the cues show while his lowest foot is high or he moves fast across
 * the floor.
 * @param {number} footH  world units
 * @param {number} levelSpeed  world units a second
 */
export const mixWants = (footH, levelSpeed) => footH > CUES.mixFoot * NEWT_HEIGHT || levelSpeed > CUES.mixSpeed;

/**
 * A cue's strength (0..1) eased over CUES.fade toward what its mode wants: Always 1, Off 0, In the
 * Mix 1 while `want`; never shown while he isn't held.
 * @param {number} k
 * @param {{mode: CueMode, want: boolean, held: boolean, dt: number}} o
 */
export function cueStep(k, { mode, want, held, dt }) {
  const goal = held && (mode === 'always' || (mode === 'mix' && want)) ? 1 : 0;
  const rate = CUES.fade > 0 ? dt / CUES.fade : 1;
  return goal > k ? Math.min(goal, k + rate) : Math.max(goal, k - rate);
}

/**
 * The ring's strength: its cue's, or full for CUES.pulse after a wall clamp (`sincePulse`
 * seconds ago; null: none), never with Ground Cues Off.
 * @param {number} k
 * @param {number|null} sincePulse
 * @param {CueMode} mode
 */
export const ringStrength = (k, sincePulse, mode) =>
  mode !== 'off' && sincePulse !== null && sincePulse >= 0 && sincePulse < CUES.pulse ? 1 : k;

/**
 * The ring's strength while he's held: In the Mix, never under the hold's `floor` (hold.js
 * HoldCues.floor), that eased in over CUES.fade from the grab (`heldFor` s ago); Always and Off as
 * they are.
 * @param {number} k
 * @param {CueMode} mode
 * @param {number|undefined} floor
 * @param {number} heldFor
 */
export const ringFloor = (k, mode, floor, heldFor) =>
  mode === 'mix' && floor ? Math.max(k, floor * clamp01(CUES.fade > 0 ? heldFor / CUES.fade : 1)) : k;

/**
 * The drop line's mode: Ground Cues' `mode`, except that the hold can keep it out of In the Mix
 * (`holdLine` false: hold.js HoldCues.line, in flight to the ring); Always still shows it and Off
 * never does, as every effect's setting.
 * @param {CueMode} mode
 * @param {boolean} [holdLine]
 * @returns {CueMode}
 */
export const lineMode = (mode, holdLine) => (holdLine === false && mode === 'mix' ? 'off' : mode);

/**
 * The drop line's share by his height: none with his lowest foot under CUES.lineFrom × his
 * height, all of it from CUES.lineTo, smoothly between.
 * @param {number} footH
 */
export function lineShare(footH) {
  const u = clamp01((footH / NEWT_HEIGHT - CUES.lineFrom) / (CUES.lineTo - CUES.lineFrom));
  return u * u * (3 - 2 * u);
}

/**
 * The brain's drag speed (BrainIn.carry.dragSpeed) from the pointer's speed on screen (carry.js handFeel).
 * @param {number} pxPerSecond  CSS px a second
 */
export const dragSpeedOf = (pxPerSecond) => Math.max(0, pxPerSecond) / CUES.dragPx;
