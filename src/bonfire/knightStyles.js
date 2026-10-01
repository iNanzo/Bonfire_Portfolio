// The knight's styles: every look he has had stays selectable, one name each.
//
// A style is how his armor is drawn (armor.js: the shader's look, uLook), which model he is
// built from (knights.js: the template), and which colors the pass may snap his steel to
// (pixelPass.js setSteel). The steel finishes (steel.js FINISHES) are the color option within
// the styles that draw steel (`finish: true`); the others have their own colors.
//
//   pixel-cel          the default: a hand-drawn sprite. Each plate one smooth, rounded
//                      surface cut into four flat bands by the fire's light, their edges
//                      dithered in the scene's pattern, a 1-texel ink line on every plate edge,
//                      seam and overlap, near-black where the fire can't reach; the planes
//                      squarely facing the fire wear the flame's body and cream tips, the
//                      rest stays cool gunmetal
//   pixel-painterly    the cel look with a painter's touches: shadows hue-shifted toward the
//                      flame's shade, lips a little further round the lit edges, a lighter
//                      ink on the lit side, a warm terminator
//   pixel-chiaroscuro  fewer, harder bands: near-black backs and gaps, mid steel, the fire's
//                      color where it strikes, cream highlights, black ink, a little dither
//   gunmetal           round 9's look, shown as Smooth Steel (the Gunmetal finish keeps that
//                      name): natural light on gunmetal steel, plate wear, a thin fire rim,
//                      the fire's reflection flashing across his facets
//   blackgold          round 8's: blackened plate in the scene's own stone, shadow and void,
//                      flat facets, dark gilt trim that catches the fire, the reflection
//                      column and sweeps (the look Bonfire Live was praised in)
//   first              round 8's first build: the boxy original model, blackened, its trim
//                      glowing in the flame's colors (its own model, loaded when chosen)
// Pure data: no three.js, so the admin, the pack and Bonfire Live can list them.

/** The model files (under public/): the knight, and the first build (loaded only when chosen). */
export const MODELS = { main: 'models/knight.glb', first: 'models/knight-first.glb' };

/**
 * Each style: `look` the armor shader's (armor.js uLook), `model` a MODELS key, `finish`
 * whether the steel finishes apply, `dither` how far the pixel styles dither across their
 * band edges at the site's Dither (0..1: at 1 a band's texels step up to ~4.6 texels into the
 * next, armor.js celDither; uCelDither, which follows the Dither setting: 0 none), `hint` a
 * line for people.
 */
export const STYLES = {
  'pixel-cel': { look: 1, model: 'main', finish: true, dither: 1, hint: 'Hand-drawn sprite: flat bands with dithered edges, ink lines, lit in the fire’s color.' },
  'pixel-painterly': { look: 2, model: 'main', finish: true, dither: 0.8, hint: 'The sprite with a painter’s touch: warm shadows, softer ink, lit lips.' },
  'pixel-chiaroscuro': { look: 3, model: 'main', finish: true, dither: 0.4, hint: 'Hard firelight: near-black backs, the flame’s color only where it strikes.' },
  gunmetal: { look: 0, model: 'main', finish: true, dither: 0, hint: 'Natural light on smooth steel, plate wear and a thin fire rim.' },
  blackgold: { look: 4, model: 'main', finish: false, dither: 0, hint: 'Blackened plate and dark gilt trim that catches the fire.' },
  first: { look: 5, model: 'first', finish: false, dither: 0, hint: 'The boxy first build, its trim glowing in the flame’s colors.' },
};

/** The styles' keys, in menu order. */
export const STYLE_KEYS = Object.keys(STYLES);

/**
 * Their names for people (Title Case, for the admin, the pack and Bonfire Live). The
 * `gunmetal` style shows as Smooth Steel, so it isn't mistaken for the Gunmetal finish (the
 * key stays: saved settings and scenes name it).
 */
export const STYLE_NAMES = {
  'pixel-cel': 'Pixel Cel',
  'pixel-painterly': 'Pixel Painterly',
  'pixel-chiaroscuro': 'Pixel Chiaroscuro',
  gunmetal: 'Smooth Steel',
  blackgold: 'Black & Gold',
  first: 'First Build',
};

/** The site's style when the settings name none (effects.knight.style). */
export const DEFAULT_STYLE = 'pixel-cel';

/** A style's key if it is one, else the default. */
export const styleOr = (name) => (Object.hasOwn(STYLES, name) ? name : DEFAULT_STYLE);

/** The model file (under public/) a style is built from. */
export const styleModel = (name) => MODELS[STYLES[styleOr(name)].model];

/** The pixel styles (the shader's cel path): their look for steel.js celRamp. */
export const CEL_LOOKS = { 1: 'cel', 2: 'painterly', 3: 'chiaroscuro' };
