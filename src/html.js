// Keep escaping separate from URL construction: attributes need both.
export const esc = (value = '') => String(value).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function isSafeUrl(value) {
  if (typeof value !== 'string' || !value || /[\s<>"'\\]/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) {
    try { const u = new URL(value); return !!u.hostname && !u.username && !u.password; } catch { return false; }
  }
  if (/^mailto:[^@]+@[^@]+$/i.test(value)) return true;
  return !value.startsWith('/') && !value.includes(':') &&
    !value.split(/[/?#]/).some((part) => part === '..' || part === '.') && !/%/i.test(value);
}
export function assetUrl(src, base = '/', card = false) {
  if (!/^assets\/projects\/[a-z0-9-]+\/[a-z0-9-]+$/.test(src)) throw new Error('Invalid project image path: ' + src);
  return base + src + (card ? '-card' : '') + '.webp';
}
