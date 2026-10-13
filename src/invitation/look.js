// The invitation toy's Look settings and presets (pure: no three.js, no DOM). The settings are
// what the Look menu sets: Pixel Size (Off, Fine, DS, Chunky), Dithering, Outlines and Style
// (a preset in looks/). They're kept in localStorage under `invitation.look.v1`, every read
// and write in try/catch: storage that's empty, broken, refused or missing gives the defaults,
// and each value is checked on its own, so one bad value never costs the others.

import { DEFAULT_PIXEL, PIXEL_SIZES } from './pixels.js';
import ds from './looks/ds.js';
import soft from './looks/soft.js';

/**
 * @typedef {object} LookPreset  every look value, as data (looks/*.js)
 * @property {string} label  its name in the Look menu
 * @property {import('./pixels.js').TexelTable} texels  target texels on the short side, per Pixel Size
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
 */

export const LOOK_KEY = 'invitation.look.v1';
/** @type {Record<string, LookPreset>} */
export const LOOKS = { ds, soft };
export const STYLES = Object.keys(LOOKS);
/** @type {Look} */
export const DEFAULT_LOOK = Object.freeze({ pixelSize: DEFAULT_PIXEL, dither: true, outlines: true, style: 'ds' });

/**
 * Settings from anything: each value kept when it's valid, the default's otherwise.
 * @param {any} raw
 * @returns {Look}
 */
export function validLook(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    pixelSize: PIXEL_SIZES.includes(o.pixelSize) ? o.pixelSize : DEFAULT_LOOK.pixelSize,
    dither: typeof o.dither === 'boolean' ? o.dither : DEFAULT_LOOK.dither,
    outlines: typeof o.outlines === 'boolean' ? o.outlines : DEFAULT_LOOK.outlines,
    style: Object.hasOwn(LOOKS, o.style) ? o.style : DEFAULT_LOOK.style,
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
