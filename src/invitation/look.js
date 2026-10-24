// The invitation toy's Look settings and presets (pure: no three.js, no DOM). The settings are what
// the Look menu sets: Pixel Size (NEWT's sprite resolution, 16×16 to 256×256, Native or Off,
// stored as '16' ... '256', 'native' or 'off': pixels.js PIXEL_SIZES), Dithering, Outlines,
// Style (a preset in looks/: the list and the Style the menu starts on come from
// looks/index.js, PRESETS and DEFAULT_STYLE) and Motion ('smooth', or 'choppy': his animation
// stepped at CHOPPY_FPS while the camera and the rest stay smooth; motionStep is its clock)
// and the Shader options (shader.js SHADER_CONTROLS: the style sets every one; `shader` keeps
// only the user's changes, each snapped onto its control or dropped on its own, and a change
// back to the style's own value is no change; isCustom: the Style row shows Custom; shaderOf:
// every value; lookPreset: the style with the changes written into a copy, for the renderer).
// They're kept in localStorage under `invitation.look.v1`, every read and write in try/catch:
// storage that's empty, broken, refused or missing gives the defaults, and each value is checked
// on its own, so one bad value never costs the others (a Pixel Size from before the resolutions
// loads as the nearest one: 2×, 3× and 4× as they looked on a 390-wide phone, OLD_PIXEL, and
// 'fine', 'ds' or 'chunky' as the default; the page never shipped with them; a look stored before
// Motion loads as Smooth with its other values kept, one stored before the Shader options as its
// style, and one with Pixel Shirt & Face, the one switch Pixel Shirt and Pixel Face split from,
// with both set as it was: LEGACY_SHADER). The admin's Default look (content.json
// `invitation.defaults`, which main.js hands installDefaults at boot) overrides the built-in
// Default style and the first visit's settings; a stored look still wins, a value it lacks
// taking the Default look's. Ground Cues (the ring and the drop line under him while he's held:
// Off, In the Mix or Always) is only stored once it's picked; till then the drag kind's own plays.

import { DEFAULT_PIXEL, PIXEL_SIZES } from './pixels.js';
import { DEFAULT_STYLE, PRESETS } from './looks/index.js';
import { CUE_MODES } from './cues.js';
import { SHADER_CONTROLS, controlFor, snapShader, styleShader } from './shader.js';

/**
 * @typedef {object} LookPreset  every look value, as data (looks/*.js)
 * @property {string} label  its name in the Look menu
 * @property {number} levels  colour levels a channel (64: 18-bit colour)
 * @property {number} dither  Bayer dither strength with Dithering on, 0..1
 * @property {{darken: number, tint: string, depth: number, ink?: 'dark'|'tinted', outside?: boolean}} outline
 *   a line's pixel: darkened by `darken` (0..1) and, with `ink` 'tinted' (the default),
 *   multiplied by `tint`; `depth`: how far (relative) the depth must jump; `outside`: on the
 *   paper just outside him (retro.js RetroExtras)
 * @property {{lift: number, gamma: number, saturation: number, tint: string, exposure: number, contrast?: number, warmth?: number}} grade
 *   contrast: about mid grey (1: as it is); warmth: toward warm or cool (shader.js warmthTint)
 * @property {import('./shader.js').ToonSpec|number[]} toon  the toon shading (shader.js toonRamp;
 *   an older preset's own bands, dark to light, evenly over the light's angle)
 * @property {{type: 'basic'|'pcf'|'vsm', mapSize: number, bias: number, normalBias: number, radius: number, color?: number|string, opacity?: number}} shadow
 *   the shadow map, and the shadow the invisible floor shows (floor.js: its colour and strength)
 * @property {{dir: number[], color: string, intensity: number, turn?: number, strength?: number}} sun
 *   the one light that casts (dir: toward it; turn: degrees round him on top of following the
 *   camera; strength: its intensity's multiplier)
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
 * @property {import('./shader.js').ShaderValues} shader  the user's changes to the style's
 *   Shader options (none: the style as it is)
 * @property {import('./hold.js').CueMode} [groundCues]  the ring and the drop line under him while
 *   he's held (cues.js): Off, In the Mix or Always; left out until it's picked, the drag kind's own
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
/**
 * The built-in first look: Default at DEFAULT_PIXEL, Motion Smooth (installDefaults puts the
 * admin's over it).
 * @type {Look}
 */
export const DEFAULT_LOOK = Object.freeze({
  pixelSize: DEFAULT_PIXEL,
  dither: true,
  outlines: true,
  style: DEFAULT_STYLE,
  motion: /** @type {Motion} */ ('smooth'),
  shader: Object.freeze({}),
});

/** The built-in Default style (looks/default.js) and first look: installDefaults starts from them. */
const BUILT_IN = Object.freeze({ preset: LOOKS[DEFAULT_STYLE], look: DEFAULT_LOOK });
/**
 * The look a first visit gets, and each value's fallback in validLook: DEFAULT_LOOK, or the
 * admin's Default look once installDefaults has it.
 * @type {Look}
 */
let first = DEFAULT_LOOK;

/**
 * Shader options split from one stored before them: each one's old key, read where a look has
 * no value of its own (Pixel Shirt & Face, `pixelArt`, became Pixel Shirt and Pixel Face).
 * @type {Record<string, string>}
 */
export const LEGACY_SHADER = { pixelShirt: 'pixelArt', pixelFace: 'pixelArt' };

/**
 * The user's Shader changes from anything, against the style `style`: each value snapped onto
 * its control (shader.js snapShader) or dropped on its own, unknown keys dropped (an old one in
 * LEGACY_SHADER read for the options split from it), and a value that's the style's own dropped
 * (no change).
 * @param {unknown} raw
 * @param {string} style  a key of LOOKS
 * @returns {import('./shader.js').ShaderValues}
 */
function validShader(raw, style) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const own = styleShader(LOOKS[style]);
  const values = /** @type {Record<string, unknown>} */ (raw);
  /** @type {import('./shader.js').ShaderValues} */
  const out = {};
  for (const c of SHADER_CONTROLS) {
    // (A look stored with the one switch they split from, Pixel Shirt & Face: it sets both.)
    const legacy = Object.hasOwn(LEGACY_SHADER, c.key) && !Object.hasOwn(values, c.key);
    const v = snapShader(c, values[legacy ? LEGACY_SHADER[c.key] : c.key]);
    if (v !== undefined && v !== own[c.key]) out[c.key] = v;
  }
  return out;
}

/**
 * Settings from anything: each value kept when it's valid, the default's otherwise.
 * @param {any} raw
 * @returns {Look}
 */
export function validLook(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const style = Object.hasOwn(LOOKS, o.style) ? o.style : first.style;
  return {
    pixelSize: PIXEL_SIZES.includes(o.pixelSize)
      ? o.pixelSize
      : typeof o.pixelSize === 'string' && Object.hasOwn(OLD_PIXEL, o.pixelSize)
        ? OLD_PIXEL[o.pixelSize]
        : first.pixelSize,
    dither: typeof o.dither === 'boolean' ? o.dither : first.dither,
    outlines: typeof o.outlines === 'boolean' ? o.outlines : first.outlines,
    style,
    motion: MOTIONS.includes(o.motion) ? o.motion : first.motion,
    shader: validShader(o.shader, style),
    // (Only once it's picked: left out, the drag kind's own default plays.)
    ...(CUE_MODES.includes(o.groundCues)
      ? { groundCues: o.groundCues }
      : first.groundCues
        ? { groundCues: first.groundCues }
        : {}),
  };
}

/**
 * The admin's Default look (content.json `invitation.defaults`, content.js invitationDefaults)
 * over the built-in one, for the whole page; main.js calls it once, before anything reads a
 * look. It's read through validLook, each value kept when it's valid and the built-in's
 * otherwise. The style it's built on (DS or Soft; with none, the built-in Default) with its
 * Shader values written in becomes the Default style (LOOKS.default, still named Default and
 * first in the row; the style it's built on never changes), and its Pixel Size, Dithering,
 * Outlines and Motion the first visit's, so a first visit sees Default, never Custom. Stored
 * looks still win (loadLook), a value one lacks taking these. Each call starts from the
 * built-ins (nothing valid: they come back as they were).
 * @param {unknown} raw
 * @returns {Look}  the look a first visit gets
 */
export function installDefaults(raw) {
  LOOKS[DEFAULT_STYLE] = BUILT_IN.preset;
  first = BUILT_IN.look;
  const d = validLook(raw);
  const own = d.style === DEFAULT_STYLE && !Object.keys(d.shader).length;
  LOOKS[DEFAULT_STYLE] = own ? BUILT_IN.preset : { ...structuredClone(lookPreset(d)), label: BUILT_IN.preset.label };
  first = Object.freeze({ ...d, style: DEFAULT_STYLE, shader: Object.freeze({}) });
  return first;
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
export const presetOf = (look) => LOOKS[look.style] ?? LOOKS[DEFAULT_STYLE];

/**
 * Whether the user changed any of the style's Shader options (the Style row shows Custom).
 * @param {Look} look
 */
export const isCustom = (look) => Object.keys(validShader(look.shader, presetKey(look))).length > 0;

/** The key of the style a look names (the default's for anything else). */
const presetKey = (/** @type {Look} */ look) => (Object.hasOwn(LOOKS, look.style) ? look.style : DEFAULT_STYLE);

/**
 * Every Shader option's value for a look: the style's, with the user's changes.
 * @param {Look} look
 * @returns {import('./shader.js').ShaderValues}
 */
export const shaderOf = (look) => ({
  ...styleShader(presetOf(look)),
  ...validShader(look.shader, presetKey(look)),
});

/**
 * The preset the renderer draws a look with: its style, or (with Shader changes) a copy of it
 * with them written in (the style itself is never changed).
 * @param {Look} look
 * @returns {LookPreset}
 */
export function lookPreset(look) {
  const base = presetOf(look);
  const changes = Object.entries(validShader(look.shader, presetKey(look)));
  if (!changes.length) return base;
  const p = structuredClone(base);
  for (const [key, v] of changes) controlFor(key)?.set(p, v);
  return p;
}

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
