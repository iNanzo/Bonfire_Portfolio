// Text rules shared by every front end (the site, Bonfire Live, the Painter, the admin).
//
// Title Case for labels, headings, tabs, buttons and options: each word capitalized except
// the articles a / an / the (unless first). Only a word's first letter changes, so "WebP",
// "404" and "ID" keep their own casing. (Hints and descriptions are written as sentences.)
const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * @param {unknown} text
 * @returns {string}
 */
export function titleCase(text) {
  return String(text)
    .split(' ')
    .map((word, i) => {
      if (i > 0 && ARTICLES.has(word.toLowerCase())) return word.toLowerCase();
      return word.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join(' ');
}
