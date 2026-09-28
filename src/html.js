// Safe HTML from content: escaping text, vetting links, and building image paths. Every
// template (render.js, the inventory, the admin preview) goes through these, so content
// edited in the admin can never inject markup or a script link.
// Keep escaping separate from URL construction: attributes need both.

/** Text made safe to put in HTML, attributes included (& < > " ' escaped). */
export const esc = (value = '') => String(value).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/**
 * Whether a link from content may be used: an https/http URL (no user:password@), a
 * mailto: with one @, or a plain relative path on this site (no leading slash, no "..",
 * no scheme, no percent-escapes that could hide either). Anything else is refused.
 */
export function isSafeUrl(value) {
  if (typeof value !== 'string' || !value || /[\s<>"'\\]/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) {
    try { const u = new URL(value); return !!u.hostname && !u.username && !u.password; } catch { return false; }
  }
  if (/^mailto:[^@]+@[^@]+$/i.test(value)) return true;
  return !value.startsWith('/') && !value.includes(':') &&
    !value.split(/[/?#]/).some((part) => part === '..' || part === '.') && !/%/i.test(value);
}
/**
 * A project image's URL: `src` is "assets/projects/<folder>/<name>" (checked), served as
 * WebP under the site's `base`; `card` picks the ~720 px thumbnail.
 */
export function assetUrl(src, base = '/', card = false) {
  if (!/^assets\/projects\/[a-z0-9-]+\/[a-z0-9-]+$/.test(src)) throw new Error('Invalid project image path: ' + src);
  return base + src + (card ? '-card' : '') + '.webp';
}
