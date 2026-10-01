// The knight's helmets, gestures, styles and finishes as the menus name them (knights.js
// HELMETS and knightPose.js GESTURES are the 3D and the poses; knightStyles.js and steel.js
// own the styles and finishes and their names). They live here, apart from the 3D code like
// sceneries.js, so the pack, Bonfire Live and the admin can list them without loading
// three.js. test/pack.test.mjs checks they match the model's.
import { STYLE_NAMES } from './bonfire/knightStyles.js';
import { FINISH_NAMES } from './bonfire/steel.js';

export { STYLE_NAMES, FINISH_NAMES };

/** The three helmets, by the key knights.js uses. */
export const HELMET_NAMES = { great: 'Great Helm', armet: 'Armet', bascinet: 'Bascinet' };

/**
 * The gestures, by the key knightPose.js uses (the helmet swap's own 'helm' isn't one).
 * 'dance' is the Default Dance: on the site he stands, dances two bars and sits back down.
 */
export const GESTURE_NAMES = {
  praise: 'Praise the Sun', wave: 'Wave', bow: 'Bow', point: 'Point Forward',
  beckon: 'Beckon', shrug: 'Shrug', hurrah: 'Hurrah', joy: 'Joy', dance: 'Default Dance',
};

// Praise the Sun comes up four times as often as any other gesture. (The Default Dance is
// asked for from the pack, never a click's answer: it's a whole performance.)
const GREETINGS = Object.keys(GESTURE_NAMES).filter((g) => g !== 'dance').flatMap((g) => (g === 'praise' ? [g, g, g, g] : [g]));
/**
 * The knight's answer when he's greeted (a click on him on the site): Praise the Sun the
 * first time and most often after that, never the gesture he made last, never the dance.
 * `rand` is 0..1.
 * @param {string | null} [last]
 * @param {() => number} [rand]
 */
export function greeting(last = null, rand = Math.random) {
  if (!last) return 'praise';
  const pool = GREETINGS.filter((g) => g !== last);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
