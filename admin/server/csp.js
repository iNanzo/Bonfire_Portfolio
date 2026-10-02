// The admin page's security headers, in one place for the two servers that send them: the
// Cloudflare Worker (admin/worker.js) and `npm run admin:preview` (admin/vite.config.js), so
// the policy can be tried locally before a deploy. (`npm run admin`, the dev server, sends
// none: Vite's dev client injects styles inline, which this policy blocks.)
//
// No inline scripts, no inline styles (a style="" attribute included: set styles through the
// style object, as admin/ui/el.js does), no eval, nothing fetched from elsewhere. The one
// outside page allowed is the site itself, framed by the live preview.

/**
 * The Content Security Policy. `siteUrl`: the public site the preview frames (its origin is
 * the one frame allowed; none without a valid address). `styleNonce`: a page of the server's
 * own with a <style nonce> block (the Worker's sign-in notice); the admin itself has none.
 * @param {string} [siteUrl]
 * @param {{ styleNonce?: string }} [o]
 */
export function csp(siteUrl = '', { styleNonce = '' } = {}) {
  let frame = "'none'";
  try {
    if (siteUrl) frame = new URL(siteUrl).origin;
  } catch {
    /* a bad address: no preview */
  }
  return [
    "default-src 'self'",
    "img-src 'self' blob: data:",
    `style-src 'self'${styleNonce ? ` 'nonce-${styleNonce}'` : ''}`,
    "font-src 'self'",
    "connect-src 'self'",
    `frame-src ${frame}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * Every security header the admin's responses carry (the page, its files and the API).
 * @param {string} [siteUrl]
 * @param {{ styleNonce?: string }} [o]
 * @returns {Record<string, string>}
 */
export const securityHeaders = (siteUrl = '', o = {}) => ({
  'Content-Security-Policy': csp(siteUrl, o),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});
