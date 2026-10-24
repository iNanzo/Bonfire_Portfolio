// The lock's two ends. gateCheck is the check a locked page runs before anything else (the build
// inlines it, gateScript, first in the page's head): without the right nh_gate cookie it keeps
// where the visitor was going (sessionStorage), stops the page (so its module and the model
// preloads below never load) and goes to /unlock/?to=<its path>; the admin's live preview, the
// page with ?preview inside a frame, stays (a cross-site frame gets no cookie). It fails open:
// a browser that throws loads the page. safeDestination is the way back, on the lock page: only
// a path on this site, under its base, never the lock page itself.
import { GATE_COOKIE, GATE_TO } from './pages.js';

/**
 * The check (a plain function: its source is what the build inlines, so it uses nothing from
 * outside but `w` and `o`).
 * @param {any} w  the window
 * @param {{ token: string, base: string, cookie: string, store: string }} o
 * @returns {'open' | 'preview' | 'locked' | 'error'}
 */
export function gateCheck(w, o) {
  try {
    const l = w.location;
    const m = new RegExp('(?:^|;\\s*)' + o.cookie + '=([^;]*)').exec(w.document.cookie);
    if (m && m[1] === o.token) return 'open';
    if (w.parent !== w && /[?&]preview(?:[=&]|$)/.test(l.search)) return 'preview';
    try {
      w.sessionStorage.setItem(o.store, l.pathname + l.search + l.hash);
    } catch {
      /* no storage: the way back is ?to alone */
    }
    if (w.stop) w.stop();
    l.replace(o.base + 'unlock/?to=' + encodeURIComponent(l.pathname));
    return 'locked';
  } catch {
    return 'error';
  }
}

/**
 * The check as the build inlines it: on one line (its source has no line comments, and every
 * statement ends in a semicolon, so joining its lines changes nothing), called with the token.
 * @param {string} token  the first 16 hex of SHA-256 of the key's hash
 * @param {string} [base]  the site's base ('/', or '/repo/' on a project site)
 */
export function gateScript(token, base = '/') {
  const source = String(gateCheck).replace(/\s*\n\s*/g, ' ');
  const o = { token, base, cookie: GATE_COOKIE, store: GATE_TO };
  return `(${source})(window,${JSON.stringify(o)});`;
}

/**
 * Where the lock page sends a visitor once unlocked: the kept destination when it's for the
 * page ?to names (or ?to is missing), else ?to, else the base. Each only when it's a path on
 * this site under `base` and not the lock page.
 * @param {string | null | undefined} to  ?to
 * @param {string | null | undefined} stored  sessionStorage's kept destination
 * @param {string} origin  location.origin
 * @param {string} [base]
 * @returns {string} a path, its query and hash
 */
export function safeDestination(to, stored, origin, base = '/') {
  const check = (v) => {
    if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return null;
    let u;
    try {
      u = new URL(v, origin);
    } catch {
      return null;
    }
    if (u.origin !== origin || !u.pathname.startsWith(base) || u.pathname.startsWith(`${base}unlock/`)) return null;
    return u;
  };
  const a = check(to);
  const b = check(stored);
  const pick = b && (!a || b.pathname === a.pathname) ? b : a;
  return pick ? pick.pathname + pick.search + pick.hash : base;
}
