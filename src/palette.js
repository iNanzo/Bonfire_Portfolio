// Single source of truth for color — used by the 3D renderer (palette
// quantization) and the site UI (CSS custom properties).
//
// The scene palette = the neutral base below + the current flame's 4-color
// ramp. Swapping weapons swaps the ramp, which recolors the fire, the light it
// casts, and every accent color in the UI.

export const base = {
  void: '#07070b',
  shadow: '#15131d',
  stone: '#2c2a3a',
  wood: '#5b4535',
  bone: '#e9e3d2',
};

// Ramp order: lo (embers, deep glow) → mid (flame body) → hi (tips, UI text) → core.
// `hi` is used for colored text, so every `hi` must stay ≥ 4.5:1 on the void.
// `shade` is a dark tinted neutral for firelit stone (the ember flame uses wood).
export const flames = {
  ember: { name: 'Ember Flame', ramp: ['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'], shade: '#5b4535' },
  verdant: { name: 'Verdant Flame', ramp: ['#1f5e2c', '#4fbf3a', '#b8f06a', '#effce0'], shade: '#24382a' },
  blood: { name: 'Blood Flame', ramp: ['#4a0a1a', '#c21d3b', '#ff7474', '#ffd9d2'], shade: '#3d2027' },
  spirit: { name: 'Spirit Flame', ramp: ['#124a55', '#2fb8b0', '#7ff0e0', '#e6fffb'], shade: '#1d3a3f' },
  arcane: { name: 'Arcane Flame', ramp: ['#3a1566', '#8a4ce0', '#d09bff', '#f6e8ff'], shade: '#2e2447' },
  gilded: { name: 'Gilded Flame', ramp: ['#6b3a0e', '#e0a020', '#ffe066', '#fffbe0'], shade: '#40331f' },
  rose: { name: 'Rose Flame', ramp: ['#5c1240', '#d83a8c', '#ff9ccf', '#ffe6f3'], shade: '#3d2033' },
  azure: { name: 'Azure Flame', ramp: ['#0f2f66', '#2f7fe0', '#8cc8ff', '#e8f4ff'], shade: '#1d2b45' },
  phosphor: { name: 'Phosphor Flame', ramp: ['#4a4538', '#bdb49c', '#fffaf0', '#ffffff'], shade: '#35332d' },
  umbral: { name: 'Umbral Flame', ramp: ['#1c1a4a', '#5b5bd6', '#b0afff', '#ecebff'], shade: '#24233f' },
};

export const defaultFlame = 'ember';

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
