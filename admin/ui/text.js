// Title Case for every admin heading and label: each word capitalized except the
// articles a / an / the (unless first). Only a word's first letter changes, so
// "WebP", "404" and "ID" keep their own casing.
const ARTICLES = new Set(['a', 'an', 'the']);

export function titleCase(text) {
  return String(text).split(' ').map((word, i) => {
    if (i > 0 && ARTICLES.has(word.toLowerCase())) return word.toLowerCase();
    return word.replace(/\p{L}/u, (c) => c.toUpperCase());
  }).join(' ');
}
