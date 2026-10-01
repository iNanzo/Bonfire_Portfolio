// The knight's armor finishes: the small steel ramps his plate is drawn in.
//
// The scene's palette has no mid greys (only the dark blue-grey `stone` and the pale
// `bone`), so armor pixels snap to a ramp of their own (pixelPass.js setSteel): five greys,
// dark to light, that the armor's light (armor.js) walks up as a facet turns to the fire.
// The scenery's palette is untouched.
//
// Each ramp's tones are spaced at least ~21 sRGB steps apart (and the darkest as far above
// the void), so the pass's ordered dither (±0.04, about ±10 steps) never flips a facet that
// sits on a tone to its neighbour: flat plates stay flat, and only a facet the light puts
// between two tones dithers between them.
//
// The lit tones lean a little toward the fire's light (litRamp): steel by an ember fire is
// a warm grey, by an azure one a cold one; the shadowed tones stay the finish's own cool.
//
// The pixel styles (knightStyles.js) draw him in tones of their own instead (celRamp): the
// finish's steel for the darks and mids (CEL_STEEL: each finish a clearly different plate),
// the flame's own colors only where the fire lights.

/** The finishes' ramps: five sRGB hex greys each, dark to light. */
export const FINISHES = {
  // Cool mid grey: the default.
  gunmetal: ['#1c1d22', '#32343a', '#4a4d55', '#666a73', '#888d97'],
  // Darker and duller, with a low top: blackened plate that mostly shows its reflections.
  blackened: ['#1b1b1f', '#2e2f34', '#43444a', '#595a60', '#717379'],
  // Bright, wide: a mirror polish (and a stronger sheen, FINISH_LOOK).
  polished: ['#1d1f24', '#373a42', '#565a64', '#7d828d', '#b1b6c0'],
  // Warm browned steel, rubbed smooth.
  burnished: ['#241d1a', '#3e332d', '#5c4e45', '#806e61', '#a8968a'],
};

/** Their names for people (Title Case, for the admin, the pack and Bonfire Live). */
export const FINISH_NAMES = { gunmetal: 'Gunmetal', blackened: 'Blackened', polished: 'Polished Steel', burnished: 'Burnished' };

/**
 * How each finish takes the light: `bias` moves every facet up or down its ramp (tones),
 * `polish` scales its reflections (the sheen, the fire's reflection, the ground it mirrors).
 */
export const FINISH_LOOK = {
  gunmetal: { bias: 0, polish: 1 },
  blackened: { bias: -0.45, polish: 0.8 },
  polished: { bias: 0.15, polish: 1.3 },
  burnished: { bias: 0, polish: 1.1 },
};

/** A finish's name if it is one, else the default (gunmetal). */
export const finishOr = (name) => (Object.hasOwn(FINISHES, name) ? name : 'gunmetal');

// How far each tone leans toward the fire's light (the shadowed ones not at all).
const LEAN = [0, 0, 0.02, 0.04, 0.07];

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

const mix = (a, b, t) => hex(rgb(a).map((v, k) => v + (rgb(b)[k] - v) * t));
const isHex = (h) => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
const lumaOf = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** `a` leaned toward `b`'s hue by `t`, as light as `a` was (a hue shift, not a lift). */
const lean = (a, b, t) => {
  const m = rgb(mix(a, b, t));
  const k = lumaOf(rgb(a)) / Math.max(1, lumaOf(m));
  return hex(m.map((v) => v * k));
};

/** The pixel styles' tones, by name: celRamp's order (the armor and the pass index them). */
export const CEL_TONES = ['deep', 'shadow', 'mid', 'steel', 'body', 'highlight', 'terminator', 'ink'];

/**
 * The pixel styles' steel in each finish, [deep, shadow, mid, light] (sRGB hexes, before
 * celRamp darkens the deep and leans the rest toward the flame): hand-picked so a finish is
 * a clearly different plate at a glance, in the darks and mids that are most of him (the lit
 * bands are the flame's whatever the finish). Gunmetal's come from its ramp (the look the
 * round-9 judges chose); blackened is near-black plate that lives by the fire it catches;
 * polished a bright cool silver, more contrast; burnished a warm bronze-brown.
 */
export const CEL_STEEL = {
  gunmetal: [FINISHES.gunmetal[0], FINISHES.gunmetal[1], mix(FINISHES.gunmetal[2], FINISHES.gunmetal[3], 0.3), mix(FINISHES.gunmetal[3], FINISHES.gunmetal[4], 0.15)],
  blackened: ['#101013', '#1f2024', '#303137', '#474950'],
  polished: ['#17191e', '#3a3e48', '#6a707c', '#858c98'],
  burnished: ['#21170f', '#4a372a', '#7a5d45', '#9f8065'],
};

/**
 * The pixel styles' tones (knightStyles.js: pixel-cel, pixel-painterly, pixel-chiaroscuro):
 * six bands dark to light, [deep, shadow, mid, steel, body, highlight], then two the pass
 * draws, [terminator, ink]. The bands up to `steel` are the finish's own steel (CEL_STEEL),
 * leaning at most a touch toward the flame (gunmetal stays in the shadows and the mids, and he
 * reads as grey plate by a fire, not painted armor); only `body` and `highlight` are the
 * fire's: the flame's body and its tips, on the planes that face it, so he wears the
 * flame's color where it lights him and recolors with it. `terminator` is the flame's dark,
 * saturated shade, one texel where a lit band gives way to the steel (the warm edge
 * between light and shadow); `ink` the line art over his lit tones (the void elsewhere).
 * The armor draws each band in one of these (armor.js), the pass snaps his pixels to them
 * (pixelPass.js setSteel), with no dither of its own.
 *   cel          near-black backs, dark and mid gunmetal, a light steel between, the flame's
 *                body and cream tips; a dark warm ink on the lit side
 *   painterly    the cel tones with the shadows hue-shifted toward the flame's shade (as dark),
 *                the steel a little warmer, a lighter ink on the lit side
 *   chiaroscuro  deeper backs, the flame's body a little more saturated, cream tips; black
 *                ink everywhere
 * @param {'cel' | 'painterly' | 'chiaroscuro'} look
 * @param {string} finishName  a FINISHES key (anything else: gunmetal)
 * @param {{ ramp?: string[], shade?: string }} flame  the flame's [lo, mid, hi, core] and its
 *   shade (sRGB hexes); missing ones fall back to steel
 * @returns {string[]} eight sRGB hexes (CEL_TONES)
 */
export function celRamp(look, finishName, { ramp = [], shade } = {}) {
  const f = FINISHES[finishOr(finishName)];
  const [d0, s0, m0, l0] = CEL_STEEL[finishOr(finishName)];
  const [lo, mid, hi, core] = [0, 1, 2, 3].map((i) => (isHex(ramp[i]) ? ramp[i] : f[Math.min(4, i + 1)]));
  const sh = isHex(shade) ? shade : f[1];
  const VOID = '#07070b';
  // (The steel leans toward the flame's tips, not its body: a warm grey by an ember fire,
  // a cold one by an azure one, never pink.)
  const deep = mix(d0, VOID, 0.35);
  const midSteel = lean(m0, hi, 0.08);
  const lightSteel = lean(l0, hi, 0.14);
  const body = mix(mix(mid, hi, 0.45), f[4], 0.12);
  const highlight = mix(hi, core, 0.55);
  const terminator = mix(mix(lo, mid, 0.35), VOID, 0.12);
  if (look === 'painterly') {
    return [lean(deep, sh, 0.5), lean(s0, sh, 0.45), lean(midSteel, sh, 0.25), lean(lightSteel, hi, 0.24), body, highlight, terminator, mix(s0, sh, 0.55)];
  }
  if (look === 'chiaroscuro') {
    return [mix(d0, VOID, 0.6), s0, midSteel, lightSteel, mix(mix(mid, hi, 0.35), f[4], 0.06), mix(hi, core, 0.45), terminator, VOID];
  }
  return [deep, s0, midSteel, lightSteel, body, highlight, terminator, mix(VOID, sh, 0.5)];
}

/**
 * A finish's ramp by a fire's light: its lit tones leaned toward `light` (sRGB hex; none:
 * the finish's own).
 * @param {string} name   a FINISHES key (anything else: gunmetal)
 * @param {string} [light]
 * @returns {string[]}    five sRGB hexes, dark to light
 */
export function litRamp(name, light) {
  const ramp = FINISHES[finishOr(name)];
  if (!light || !/^#[0-9a-f]{6}$/i.test(light)) return [...ramp];
  const l = rgb(light);
  return ramp.map((h, i) => {
    const c = rgb(h);
    return hex(c.map((v, k) => v + (l[k] - v) * LEAN[i]));
  });
}
