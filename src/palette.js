// Single source of truth for color — used by the 3D renderer (palette
// quantization) and the site UI (CSS custom properties).
//
// The scene palette = the neutral base + the current flame's 4-color ramp.
// Swapping weapons swaps the ramp, which recolors the fire, the light it casts,
// and every accent color in the UI.
//
// Both come from content.json's `effects` (edited in the admin). `base` and
// `flames` are updated in place when the admin preview changes them, so importers
// always see the current values.
import { effects, onEffects } from './effects.js';

export const base = {};

// Ramp order: lo (embers, deep glow) → mid (flame body) → hi (tips, UI text) → core.
// `hi` is used for colored text, so every `hi` must stay ≥ 4.5:1 on the void
// (contentRules enforces it). `shade` is a dark tinted neutral for firelit stone.
// `light` is how far the cast light is washed toward white. `hidden` flames are
// never drawn at random.
export const flames = {};

function load(e) {
  Object.assign(base, e.colors);
  for (const k of Object.keys(flames)) delete flames[k];
  for (const f of e.flames) {
    flames[f.id] = { name: f.name, ramp: [f.lo, f.mid, f.hi, f.core], shade: f.shade, light: f.light ?? 0.34, hidden: !!f.hidden };
  }
}
load(effects);
onEffects(load);

/** Flames a random draw can pick. */
export const rotation = () => Object.keys(flames).filter((k) => !flames[k].hidden);

/** `key` if it still exists (the preview can delete flames), else the first one. */
export const flameOr = (key) => (Object.hasOwn(flames, key) ? key : Object.keys(flames)[0]);

/** Scene quantization palette for a flame: index 0 must be the darkest (outline) color. */
export function scenePalette(flame) {
  return [base.void, base.shadow, base.stone, base.wood, base.bone, ...flame.ramp, flame.shade];
}

const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
/** Blend two sRGB hex colors. */
export function mixHex(a, b, t) {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
/** A flame partway between two others: { ramp, shade }. */
export function mixFlame(from, to, t) {
  return { ramp: from.ramp.map((h, i) => mixHex(h, to.ramp[i], t)), shade: mixHex(from.shade, to.shade, t) };
}

/**
 * Color-change curve: an ease-in-out crossfade with a small damped wobble, so the
 * fire "breathes" into its new color instead of snapping or strobing.
 */
export function flameEase(t) {
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  return Math.min(1, Math.max(0, e + Math.sin(t * Math.PI * 5) * 0.07 * (1 - t)));
}

// Alternate looks for the render debug HUD (press P, then 2).
export const debugPalettes = {
  'Current flame': null,
  'Ashen (3 color)': ['#07070b', '#e0582a', '#e9e3d2'],
  'Moonlit (4 color)': ['#07070b', '#1d2a3a', '#6f8fb0', '#e9e3d2'],
};

/** Expose the base palette + accent ramp as CSS custom properties. */
export function applyCssPalette(el = document.documentElement) {
  for (const [name, hex] of Object.entries(base)) el.style.setProperty(`--c-${name}`, hex);
}
