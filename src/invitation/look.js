// The invitation toy's Look settings and presets (pure: no three.js, no DOM). The settings are what
// the Look menu sets: Pixel Size (NEWT's sprite resolution, 16×16 to 256×256, Native or Off,
// stored as '16' ... '256', 'native' or 'off': pixels.js PIXEL_SIZES), Dithering, Outlines,
// Style (a preset in looks/: the list and the Style the menu starts on come from
// looks/index.js, PRESETS and DEFAULT_STYLE) and Motion ('smooth', or 'choppy': his animation
// stepped at CHOPPY_FPS while the camera and the rest stay smooth; motionStep is its clock).
// They're kept in localStorage under `invitation.look.v1`, every read and write in try/catch:
// storage that's empty, broken, refused or missing gives the defaults, and each value is checked
// on its own, so one bad value never costs the others (a Pixel Size from before the resolutions
// loads as the nearest one: 2×, 3× and 4× as they looked on a 390-wide phone, OLD_PIXEL, and
// 'fine', 'ds' or 'chunky' as the default; the page never shipped with them; a look stored before
// Motion loads as Smooth with its other values kept).

import { DEFAULT_PIXEL, PIXEL_SIZES } from './pixels.js';
import { DEFAULT_STYLE, PRESETS } from './looks/index.js';

/**
 * @typedef {object} LookPreset  every look value, as data (looks/*.js)
 * @property {string} label  its name in the Look menu
 * @property {number} levels  colour levels a channel (64: 18-bit colour)
 * @property {number} dither  Bayer dither strength with Dithering on, 0..1
 * @property {{darken: number, tint: string, depth: number}} outline  a line's pixel: darkened by
 *   `darken` (0..1) and multiplied by `tint`; `depth`: how far (relative) the depth must jump
 * @property {{lift: number, gamma: number, saturation: number, tint: string, exposure: number}} grade
 * @property {number[]} toon  the toon gradient's bands, dark to light, 0..1 (evenly spaced over the light's angle)
 * @property {{type: 'basic'|'pcf'|'vsm', mapSize: number, bias: number, normalBias: number, radius: number, color?: number|string, opacity?: number}} shadow
 *   the shadow map, and the shadow the invisible floor shows (floor.js: its colour and strength)
 * @property {{dir: number[], color: string, intensity: number}} sun  the one light that casts (dir: toward it)
 * @property {{sky: string, ground: string, intensity: number}} hemi  the faint fill
 * @property {number} [background]  the page's colour (a hex number; there's no room, just this and the floor's shadows)
 * @property {{background: string, [k: string]: string}} [room]  the scrapped room's colours (floor.js falls back on its background)
 * @property {{color?: string, opacity: number, lifted: number}} blob  the soft shadow under him (lifted: while he's held; its colour is the shadow's)
 * @property {{color: string}} marker  the ring under the finger or cursor
 * @property {number} animFps  choppy motion: the animation stepped at this rate (0: smooth)
 */
/**
 * @typedef {object} Look  the Look menu's settings
 * @property {import('./pixels.js').PixelSize} pixelSize
 * @property {boolean} dither
 * @property {boolean} outlines
 * @property {string} style  a key of LOOKS
 * @property {Motion} motion
 */
/** @typedef {'smooth'|'choppy'} Motion  Smooth, or Choppy (his animation at CHOPPY_FPS) */

export const LOOK_KEY = 'invitation.look.v1';
/** @type {Record<string, LookPreset>} */
export const LOOKS = PRESETS;
export const STYLES = Object.keys(LOOKS);
/** @type {Motion[]} */
export const MOTIONS = ['smooth', 'choppy'];
/**
 * Pixel Sizes stored before the sprite resolutions (N×: a texel N×N CSS px) and the resolution
 * nearest what each drew on a 390-wide phone (NEWT 99 CSS px tall: 50, 33 and 25 texels).
 * @type {Record<string, import('./pixels.js').PixelSize>}
 */
export const OLD_PIXEL = { 2: '48', 3: '32', 4: '24' };
/** Motion Choppy: his animation steps this many times a second. */
export const CHOPPY_FPS = 15;
/** @type {Look} */
export const DEFAULT_LOOK = Object.freeze({
  pixelSize: DEFAULT_PIXEL,
  dither: true,
  outlines: true,
  style: DEFAULT_STYLE,
  motion: /** @type {Motion} */ ('smooth'),
});

/**
 * Settings from anything: each value kept when it's valid, the default's otherwise.
 * @param {any} raw
 * @returns {Look}
 */
export function validLook(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    pixelSize: PIXEL_SIZES.includes(o.pixelSize)
      ? o.pixelSize
      : typeof o.pixelSize === 'string' && Object.hasOwn(OLD_PIXEL, o.pixelSize)
        ? OLD_PIXEL[o.pixelSize]
        : DEFAULT_LOOK.pixelSize,
    dither: typeof o.dither === 'boolean' ? o.dither : DEFAULT_LOOK.dither,
    outlines: typeof o.outlines === 'boolean' ? o.outlines : DEFAULT_LOOK.outlines,
    style: Object.hasOwn(LOOKS, o.style) ? o.style : DEFAULT_LOOK.style,
    motion: MOTIONS.includes(o.motion) ? o.motion : DEFAULT_LOOK.motion,
  };
}

/**
 * The saved settings, or the defaults. `storage` defaults to localStorage (reaching it can
 * throw too, in a sandboxed frame).
 * @param {{getItem(key: string): string|null}|null} [storage]
 * @returns {Look}
 */
export function loadLook(storage) {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    const text = s?.getItem(LOOK_KEY);
    return validLook(text ? JSON.parse(text) : null);
  } catch {
    return validLook(null);
  }
}

/**
 * Keep the settings for next time; false when the storage refused.
 * @param {Look} look
 * @param {{setItem(key: string, value: string): void}|null} [storage]
 */
export function saveLook(look, storage) {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    if (!s) return false;
    s.setItem(LOOK_KEY, JSON.stringify(validLook(look)));
    return true;
  } catch {
    return false;
  }
}

/**
 * The preset a look's Style names.
 * @param {Look} look
 */
export const presetOf = (look) => LOOKS[look.style] ?? LOOKS[DEFAULT_LOOK.style];

/**
 * How many times a second his animation steps: CHOPPY_FPS with Motion Choppy, else the preset's
 * own animFps (0: every frame).
 * @param {Look} look
 */
export const animFps = (look) => (look.motion === 'choppy' ? CHOPPY_FPS : presetOf(look).animFps || 0);

/**
 * One frame of the stepped animation clock: the frame's `dt` joins the time waiting (`acc`) and,
 * once that's a tick (1/fps) or more, the animation steps by whole ticks and only they come off,
 * so the remainder carries and it runs at `fps` exactly, whatever the frame rate. At fps 0 every
 * frame steps by its own dt.
 * @param {number} acc  the time waiting since the last step, seconds
 * @param {number} dt
 * @param {number} fps
 * @returns {{acc: number, step: number}}  step: how far to advance the animation (0: hold the pose)
 */
export function motionStep(acc, dt, fps) {
  if (!(fps > 0)) return { acc: 0, step: dt };
  const tick = 1 / fps;
  const wait = acc + Math.max(0, dt);
  // (A hair of slack, so four frames of 1/60 make one tick of 1/15 despite rounding.)
  const n = Math.floor(wait / tick + 1e-9);
  if (n < 1) return { acc: wait, step: 0 };
  return { acc: Math.max(0, wait - n * tick), step: n * tick };
}
