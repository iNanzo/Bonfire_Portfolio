// Which typeface may set a string (the design's font caveat): the display faces the site ships
// (@fontsource cinzel and pixelify-sans) have no Vietnamese subset, so a string is set in Cinzel or
// Pixelify Sans only when the face covers every one of its characters; otherwise the WHOLE string
// falls back to Inter (never single letters mid-word: U01). "Đội Phaolô" → Inter (ộ is U+1ED9),
// "Phaolô" and "Team Paul" → Cinzel. Pure; no DOM.
//
//   covers(text, face)          every code point (after NFC) is in the face's unicode-range
//   displayFace(text, preferred) the preferred face when it covers the text, else 'inter'
//   FACE_RANGES                 the ranges, copied from the installed @fontsource CSS files that
//                               src/tokens.css imports (cinzel/500.css, pixelify-sans/400.css);
//                               test/larpFonts.test.mjs reads those files and fails if they differ

/** @typedef {'cinzel'|'pixelify'|'inter'} Face */

/** @param {string} list 'U+0000-00FF,U+0131,…' @returns {ReadonlyArray<readonly [number, number]>} */
export function parseUnicodeRange(list) {
  return Object.freeze(
    String(list)
      .split(',')
      .map((part) => part.trim().replace(/^U\+/i, ''))
      .filter(Boolean)
      .map((part) => {
        const [lo, hi = lo] = part.split('-');
        return Object.freeze(/** @type {const} */ ([parseInt(lo, 16), parseInt(hi, 16)]));
      }),
  );
}

// @fontsource 5.3.0 subsets (same ranges in every weight).
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const CYRILLIC = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';

/** Each display face's subsets, as code point ranges. Inter (with its Vietnamese subset) is the fallback. */
export const FACE_RANGES = Object.freeze({
  cinzel: Object.freeze([...parseUnicodeRange(LATIN), ...parseUnicodeRange(LATIN_EXT)]),
  pixelify: Object.freeze([
    ...parseUnicodeRange(LATIN),
    ...parseUnicodeRange(LATIN_EXT),
    ...parseUnicodeRange(CYRILLIC),
  ]),
});

/**
 * Whether `face` covers every character of `text` (NFC first, so a decomposed "ô" counts as one
 * letter). Inter covers everything the game writes; an unknown face covers nothing.
 * @param {string} text
 * @param {Face|string} face
 * @returns {boolean}
 */
export function covers(text, face) {
  if (face === 'inter') return true;
  const ranges = Object.hasOwn(FACE_RANGES, face) ? FACE_RANGES[/** @type {'cinzel'|'pixelify'} */ (face)] : null;
  if (!ranges) return false;
  for (const ch of String(text ?? '').normalize('NFC')) {
    const cp = /** @type {number} */ (ch.codePointAt(0));
    if (!ranges.some(([lo, hi]) => cp >= lo && cp <= hi)) return false;
  }
  return true;
}

/**
 * The face to set `text` in: `preferred` when it covers the whole string, else 'inter'.
 * @param {string} text
 * @param {Face} preferred
 * @returns {Face}
 */
export function displayFace(text, preferred) {
  return preferred !== 'inter' && covers(text, preferred) ? preferred : 'inter';
}

/**
 * Every face and weight the game's CSS uses (src/tokens.css), each with text that needs all of its
 * subsets (Latin, Latin Extended, Vietnamese): loading them all at start means a face first used
 * later (a dialog's 600, a Vietnamese name in Cinzel's fallback) never needs the network (U11).
 */
export const GAME_FONTS = Object.freeze(
  [
    '400 1em Inter',
    'italic 400 1em Inter',
    '500 1em Inter',
    '600 1em Inter',
    '500 1em Cinzel',
    '600 1em Cinzel',
    '400 1em "Pixelify Sans"',
    '500 1em "Pixelify Sans"',
  ].map((font) => Object.freeze(/** @type {const} */ ([font, 'Aĕộ−']))),
);

/**
 * Asks the browser to load every face in GAME_FONTS now, while the network is there; failures are
 * ignored (offline already, or no FontFaceSet).
 * @param {{ load(font: string, text?: string): Promise<unknown> } | null | undefined} fonts document.fonts
 * @returns {Promise<void>}
 */
export function warmFonts(fonts) {
  if (!fonts || typeof fonts.load !== 'function') return Promise.resolve();
  return Promise.all(
    GAME_FONTS.map(([font, text]) =>
      Promise.resolve()
        .then(() => fonts.load(font, text))
        .catch(() => null),
    ),
  ).then(() => undefined);
}
