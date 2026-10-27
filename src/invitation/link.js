// The invitation toy's link button: where the admin's link goes (content.json invitation.link:
// its href and its label, the button's name), as the toy reads it (linkFrom: the label "Link"
// when it has none, at most LINK_LABEL_MAX letters) and uses it (linkTarget: a site path from the
// site's root, a new tab for every link but a mailto:, so the toy keeps its state; nothing at all
// for an empty or unsafe one, and then no button), and the corner each scene puts it in
// (linkCorner: the top left while the envelope is up and while the intro runs or is about to,
// so it stays put from the one into the other; else the top right). Between the two it fades
// out and back in (LINK_FADE: invitation.css fades it a little quicker, so it's gone before it
// moves; with reduced motion it moves at once). ui.js draws and binds it (linkHtml, bindUi).
// Its safe-link rule is the site's own (src/html.js isSafeUrl), copied (safeHref): the toy
// imports nothing from src/ (it would share a chunk with the portfolio's first load), and
// test/invitationLink.test.mjs holds the two together. Pure.

/** The button's name when the admin gives it none. */
export const LINK_LABEL = 'Link';
/** The longest name it takes, in letters (an emoji is one): its label tab stays a tab. */
export const LINK_LABEL_MAX = 24;
/** Its move between corners: out, then in at the new one, ms each way (invitation.css .inv-link). */
export const LINK_FADE = { ms: 120 };

/** @typedef {{href: string, label: string}} Link  the admin's link as the toy reads it */
/** @typedef {'left'|'right'} LinkCorner  the top left or the top right */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Whether an address may be used (src/html.js isSafeUrl's rule, copied): an https/http URL (no
 * user:password@), a mailto: with one @, or a plain relative path on this site (no leading
 * slash, no "..", no scheme, no percent-escapes that could hide either). Anything else is refused.
 * @param {unknown} value
 */
export function safeHref(value) {
  if (typeof value !== 'string' || !value || /[\s<>"'\\]/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      return !!u.hostname && !u.username && !u.password;
    } catch {
      return false;
    }
  }
  if (/^mailto:[^@]+@[^@]+$/i.test(value)) return true;
  return (
    !value.startsWith('/') &&
    !value.includes(':') &&
    !value.split(/[/?#]/).some((part) => part === '..' || part === '.') &&
    !/%/i.test(value)
  );
}

/**
 * The admin's link as the toy reads it, from anything: its href trimmed ('' when it's none),
 * its label trimmed, LINK_LABEL when empty, cut to LINK_LABEL_MAX letters.
 * @param {unknown} data  content.json's invitation.link
 * @returns {Link}
 */
export function linkFrom(data) {
  const o = /** @type {Record<string, unknown>} */ (isObj(data) ? data : {});
  const href = typeof o.href === 'string' ? o.href.trim() : '';
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  return { href, label: label ? Array.from(label).slice(0, LINK_LABEL_MAX).join('') : LINK_LABEL };
}

/**
 * Where the button goes, as the page uses it: `url` (a site path from the site's root, `base`;
 * any other as it is) and whether it opens in a new tab (all but a mailto:); null for an empty
 * or unsafe href (no button).
 * @param {string} href
 * @param {string} [base]  the site's base URL (Vite's BASE_URL)
 * @returns {{url: string, newTab: boolean}|null}
 */
export function linkTarget(href, base = '/') {
  if (!safeHref(href)) return null;
  if (/^mailto:/i.test(href)) return { url: href, newTab: false };
  if (/^https?:/i.test(href)) return { url: href, newTab: true };
  return { url: `${base}${href}`, newTab: true };
}

/**
 * The corner the button sits in: the top left while the envelope is up, or the intro runs or
 * is about to start (the envelope opened), else the top right.
 * @param {{envelope?: boolean, intro?: boolean}} o
 * @returns {LinkCorner}
 */
export const linkCorner = ({ envelope = false, intro = false }) => (envelope || intro ? 'left' : 'right');
