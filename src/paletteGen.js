// Palette generators, shared by the admin's Effects page and the visualizer's random
// colors: harmonious random flames, fully random ones, and suggestions built around a
// color you pick. Pure functions (no DOM), so they're unit-tested
// (admin/test/palettes.test.mjs).
//
// The harmony rules work in OKLCH — perceptual lightness, chroma and hue — so a
// "lighter" or "more saturated" step looks like one to the eye at every hue:
//
//   • Lightness makes the ramp. A flame is lo → mid → hi → core, darkest to palest,
//     each in its own lightness band, so the four read as one light source and the
//     palette quantizer can always tell them apart.
//   • Chroma follows the light: fullest in the body (mid), a little less in the
//     embers and tips, almost none in the white-hot core. Chroma is taken as a share
//     of the most the sRGB gamut allows at that lightness and hue, so every hue gets
//     equally vivid colors and nothing clips.
//   • Hue comes from a scheme. The default is the pixel-art "hue shift": shadows
//     lean toward blue-violet and highlights toward yellow, the way firelight and
//     shade actually tint things. The classic color-wheel harmonies (analogous,
//     complementary, split complementary, triadic, monochrome) place the embers and
//     core on the related hues.
//   • It must still work on the site: the tips (`hi`) double as accent text, so they
//     are lightened until they reach 4.5:1 contrast on the background, and `shade`
//     is a dark, barely tinted neutral for firelit stone.
import { contrast, HEX_RE } from './contentRules.js';

// ---- color math ---------------------------------------------------------------------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** #rrggbb → { L, C, h } (OKLCH; h in degrees). */
export function hexToOklch(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH → linear sRGB [r, g, b] (may be out of gamut). */
function oklchToLinear(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The most chroma sRGB can show at this lightness and hue. */
export function maxChroma(L, h) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, h))) lo = mid; else hi = mid;
  }
  return lo;
}

/** OKLCH → #rrggbb, pulling chroma in until it fits the gamut (hue and lightness kept). */
export function oklchToHex(L, C, h) {
  L = Math.min(1, Math.max(0, L));
  let rgb = oklchToLinear(L, C, h);
  if (!inGamut(rgb)) rgb = oklchToLinear(L, Math.min(C, maxChroma(L, h)), h);
  return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const wrap = (h) => ((h % 360) + 360) % 360;
/** Turn hue `h` toward `target` by up to `amount` degrees, the short way round. */
function toward(h, target, amount) {
  const d = ((target - h + 540) % 360) - 180;
  return wrap(h + Math.sign(d) * Math.min(Math.abs(d), amount));
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---- flames -------------------------------------------------------------------------------
export const FLAME_KEYS = ['lo', 'mid', 'hi', 'core', 'shade'];
const RAMP = ['lo', 'mid', 'hi', 'core'];
/** Lightness band per ramp step, and each step's share of the gamut's chroma. */
const BANDS = { lo: [0.36, 0.44], mid: [0.6, 0.7], hi: [0.83, 0.9], core: [0.955, 0.975] };
const CHROMA = { lo: 0.82, mid: 0.95, hi: 0.9, core: 0.42 };
const COOL = 285; // blue-violet: where shadows lean
const WARM = 95;  // yellow: where highlights lean

/** Hue of each ramp step for a base hue. `shift` = how far (degrees) the scheme bends hues; `dir` = ±1. */
const SCHEME_HUES = {
  shift: (h, s) => ({ lo: toward(h, COOL, s), mid: h, hi: toward(h, WARM, s * 1.2), core: toward(h, WARM, s * 1.5) }),
  analogous: (h, s, dir) => ({ lo: wrap(h - dir * (s + 10)), mid: h, hi: wrap(h + dir * s), core: wrap(h + dir * (s + 15)) }),
  mono: (h) => ({ lo: h, mid: h, hi: h, core: h }),
  complementary: (h) => ({ lo: wrap(h + 180), mid: h, hi: wrap(h + 12), core: wrap(h + 20) }),
  split: (h, s, dir) => ({ lo: wrap(h + dir * 150), mid: h, hi: wrap(h - dir * 25), core: wrap(h - dir * 210) }),
  triadic: (h, s, dir) => ({ lo: wrap(h + dir * 120), mid: h, hi: wrap(h + dir * 15), core: wrap(h + dir * 240) }),
};

export const SCHEMES = [
  { id: 'shift', label: 'Hue Shift', blurb: 'Embers lean cool, tips lean warm — the pixel-art classic.', weight: 4 },
  { id: 'analogous', label: 'Analogous', blurb: 'Neighboring hues, sliding one way up the ramp.', weight: 3 },
  { id: 'mono', label: 'Monochrome', blurb: 'One hue, from deep to pale.', weight: 1 },
  { id: 'complementary', label: 'Complementary', blurb: 'Embers in the opposite hue.', weight: 1.5 },
  { id: 'split', label: 'Split Complementary', blurb: 'Embers and core in the two hues beside the opposite.', weight: 1 },
  { id: 'triadic', label: 'Triadic', blurb: 'Body, embers and core a third of the wheel apart.', weight: 0.8 },
];

function pickScheme(rng) {
  const total = SCHEMES.reduce((sum, s) => sum + s.weight, 0);
  let r = rng() * total;
  for (const s of SCHEMES) { r -= s.weight; if (r < 0) return s.id; }
  return SCHEMES[0].id;
}

/** Lighten a text color until it reads on the background (4.5:1, with a hair of margin). */
export function readableOn(hex, bg, min = 4.6) {
  let { L, C, h } = hexToOklch(hex);
  let out = hex;
  while (contrast(out, bg) < min && L < 1) {
    L = Math.min(1, L + 0.01);
    out = oklchToHex(L, C, h);
  }
  return out;
}

/**
 * A flame ramp from a recipe.
 * @param {object} o
 * @param {number} o.hue      base hue (the body color), degrees
 * @param {string} o.scheme   one of SCHEMES
 * @param {number} [o.vivid]  0..1, how much of the available chroma to use
 * @param {number} [o.shift]  degrees the scheme bends hues (hue shift / analogous)
 * @param {number} [o.dir]    1 or -1: which way analogous-style schemes turn
 * @param {number[]} [o.lightness]  0..1 per ramp step: where in its band it sits
 * @param {number[]} [o.L]          exact OKLCH lightness per ramp step (overrides `lightness`)
 * @param {string} o.voidHex  the page background (for the text-contrast rule)
 * @returns {{ lo: string, mid: string, hi: string, core: string, shade: string }}
 */
export function makeFlame({ hue, scheme = 'shift', vivid = 0.85, shift = 25, dir = 1, lightness = [0.5, 0.5, 0.5, 0.5], L: fixedL = null, voidHex }) {
  const hues = SCHEME_HUES[scheme](wrap(hue), shift, dir);
  /** @type {any} */
  const out = {};
  RAMP.forEach((k, i) => {
    const L = fixedL?.[i] ?? lerp(BANDS[k][0], BANDS[k][1], lightness[i]);
    out[k] = oklchToHex(L, maxChroma(L, hues[k]) * CHROMA[k] * vivid, hues[k]);
  });
  out.hi = readableOn(out.hi, voidHex);
  // Stone lit by this fire: dark, faintly tinted toward the embers.
  const shadeL = 0.285;
  out.shade = oklchToHex(shadeL, Math.min(0.04, maxChroma(shadeL, hues.lo) * 0.5) * (0.6 + 0.4 * vivid), hues.lo);
  return out;
}

/**
 * A random flame that holds together: a random hue, scheme (weighted toward hue shift) and intensity.
 * @param {() => number} rng
 * @param {{ voidHex?: string, scheme?: string, hue?: number }} [o]
 */
export function harmoniousFlame(rng, { voidHex, scheme = 'auto', hue = rng() * 360 } = {}) {
  const id = scheme === 'auto' ? pickScheme(rng) : scheme;
  const colors = makeFlame({
    hue, scheme: id, voidHex,
    vivid: 0.62 + rng() * 0.38,
    shift: 16 + rng() * 22,
    dir: rng() < 0.5 ? -1 : 1,
    lightness: RAMP.map(() => rng()),
  });
  return { colors, scheme: id };
}

const randomHex = (rng) => `#${Math.floor(rng() * 0x1000000).toString(16).padStart(6, '0')}`;

/** Anything goes: five random colors. Only the tips are lightened if they'd be unreadable as text. */
export function wildFlame(rng, { voidHex }) {
  const out = Object.fromEntries(FLAME_KEYS.map((k) => [k, randomHex(rng)]));
  out.hi = readableOn(out.hi, voidHex);
  return out;
}

/** A whole set of flames with their hues spread round the wheel, so each one looks different. */
export function flameSet(count, rng, { voidHex, wild = false }) {
  const start = rng() * 360;
  return Array.from({ length: count }, (_, i) => (wild
    ? wildFlame(rng, { voidHex })
    : harmoniousFlame(rng, { voidHex, hue: start + (i * 360) / count + (rng() - 0.5) * (180 / count) }).colors));
}

/** Which ramp step a color would naturally be, by its lightness. */
export function slotFor(hex) {
  const { L } = hexToOklch(hex);
  return L < 0.52 ? 'lo' : L < 0.77 ? 'mid' : L < 0.935 ? 'hi' : 'core';
}

/**
 * Flames built around a color: one per scheme. The color keeps its exact value in
 * the step its lightness suits (a dark color becomes the embers, a light one the
 * tips…), and the other steps are placed around it in hue and lightness.
 */
export function suggestFlames(seedHex, { voidHex }) {
  if (!HEX_RE.test(seedHex ?? '')) return [];
  const seed = hexToOklch(seedHex);
  const slot = slotFor(seedHex);
  const at = RAMP.indexOf(slot);
  // Lightness: shift the bands toward the seed, less the further a step is from it,
  // then keep the steps apart so the ramp still climbs.
  const centers = RAMP.map((k) => (BANDS[k][0] + BANDS[k][1]) / 2);
  const delta = seed.L - centers[at];
  const L = centers.map((c, i) => (i === at ? seed.L : c + delta * [1, 0.5, 0.25, 0.1][Math.abs(i - at)]));
  const GAP = [0.16, 0.13, 0.06];
  for (let i = at + 1; i < 4; i++) L[i] = Math.min(0.985, Math.max(L[i], L[i - 1] + GAP[i - 1]));
  for (let i = at - 1; i >= 0; i--) L[i] = Math.max(0.18, Math.min(L[i], L[i + 1] - GAP[i]));
  const vivid = Math.min(1, Math.max(0.3, seed.C / Math.max(1e-3, maxChroma(seed.L, seed.h)) / CHROMA[slot]));
  const achromatic = seed.C < 0.02;
  return SCHEMES.filter((s) => !(achromatic && s.id !== 'mono' && s.id !== 'shift')).map((s) => {
    // Find the base hue that puts the seed's own hue on its step (hue shift bends
    // non-linearly, so settle it in a few passes).
    let hue = seed.h;
    for (let k = 0; k < 4; k++) {
      const got = SCHEME_HUES[s.id](hue, 24, 1)[slot];
      hue = wrap(hue + (((seed.h - got + 540) % 360) - 180));
    }
    const colors = makeFlame({ hue, scheme: s.id, vivid: achromatic ? 0.25 : vivid, shift: 24, dir: 1, L, voidHex });
    colors[slot] = slot === 'hi' ? readableOn(seedHex, voidHex) : seedHex;
    return { scheme: s.id, label: s.label, blurb: s.blurb, colors };
  });
}

// ---- scene colors -------------------------------------------------------------------------
export const SCENE_KEYS = ['void', 'shadow', 'stone', 'wood', 'bone'];
const SCENE_L = { void: [0.1, 0.125], shadow: [0.19, 0.215], stone: [0.31, 0.345], wood: [0.4, 0.46], bone: [0.9, 0.93] };

/** Darken the background until every flame's text color reads on it. */
function keepFlamesReadable(scene, flames) {
  let { L, C, h } = hexToOklch(scene.void);
  while (L > 0.04 && flames.some((f) => HEX_RE.test(f?.hi ?? '') && contrast(f.hi, scene.void) < 4.5)) {
    L -= 0.01;
    scene.void = oklchToHex(L, C, h);
  }
  return scene;
}

/**
 * Tinted neutrals with a warm (or complementary) accent: the background, shadow and
 * stone share one faint hue; wood and bone take the accent.
 */
export function makeScene({ hue, accent, tint = 0.02, lightness = [0.5, 0.5, 0.5, 0.5, 0.5] }, flames = []) {
  const Ls = SCENE_KEYS.map((k, i) => lerp(SCENE_L[k][0], SCENE_L[k][1], lightness[i]));
  const scene = {
    void: oklchToHex(Ls[0], tint * 0.8, hue),
    shadow: oklchToHex(Ls[1], tint, hue),
    stone: oklchToHex(Ls[2], tint * 1.25, wrap(hue + 8)),
    wood: oklchToHex(Ls[3], 0.03 + tint * 1.2, accent),
    bone: oklchToHex(Ls[4], 0.012 + tint * 0.6, wrap(accent + 15)),
  };
  return keepFlamesReadable(scene, flames);
}

export function harmoniousScene(rng, { flames = [] } = {}) {
  const hue = rng() * 360;
  const accent = wrap(hue + (rng() < 0.55 ? 180 : rng() < 0.5 ? 40 : -40) + (rng() - 0.5) * 30);
  return makeScene({ hue, accent, tint: 0.012 + rng() * 0.022, lightness: SCENE_KEYS.map(() => rng()) }, flames);
}

/**
 * Scenery with real color (the visualizer's recolors): harmoniousScene's tinted neutrals
 * two to four times stronger, around a hue that follows the flame's (`hue`: the same,
 * next to it, opposite, a third of the way round) or any hue at all.
 * @param {() => number} rng
 * @param {{ flames?: Array<{ hi?: string }>, hue?: number }} [o]  the flames to keep readable, the hue to follow
 */
export function vividScene(rng, { flames = [], hue } = {}) {
  const turns = [0, 30, -30, 180, 120, -120];
  const h = hue === undefined || rng() < 0.2 ? rng() * 360 : wrap(hue + turns[Math.floor(rng() * turns.length)] + (rng() - 0.5) * 20);
  const accent = wrap(h + (rng() < 0.5 ? 180 : rng() < 0.5 ? 40 : -40) + (rng() - 0.5) * 30);
  return makeScene({ hue: h, accent, tint: 0.035 + rng() * 0.05, lightness: SCENE_KEYS.map(() => rng()) }, flames);
}

/** Random hues and strengths for every scene color; lightness stays in order (the background darkest, bone lightest) so the site stays readable. */
export function wildScene(rng, { flames = [] } = {}) {
  const scene = Object.fromEntries(SCENE_KEYS.map((k) => {
    const L = lerp(SCENE_L[k][0], SCENE_L[k][1], rng());
    return [k, oklchToHex(L, rng() * 0.12, rng() * 360)];
  }));
  return keepFlamesReadable(scene, flames);
}

/** Scene palettes built around a color: its hue tints the neutrals, or it becomes the accent. */
export function suggestScenes(seedHex, { flames = [] } = {}) {
  if (!HEX_RE.test(seedHex ?? '')) return [];
  const { h, C } = hexToOklch(seedHex);
  const tint = Math.min(0.035, Math.max(0.012, C * 0.25));
  return [
    { label: 'Tinted, Complementary Accent', colors: makeScene({ hue: h, accent: wrap(h + 180), tint }, flames) },
    { label: 'Tinted, Warm Accent', colors: makeScene({ hue: h, accent: toward(h, 60, 60), tint }, flames) },
    { label: 'Tinted, Same Hue', colors: makeScene({ hue: h, accent: wrap(h + 20), tint: tint * 1.2 }, flames) },
    { label: 'As the Accent', colors: makeScene({ hue: wrap(h + 180), accent: h, tint: tint * 0.7 }, flames) },
  ];
}

