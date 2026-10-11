// The browser's side of the game's injected dependencies: the laptop clock, ids and storage. The
// pure modules (state.js, store.js, app.js…) never touch these globals themselves.

/** The laptop's clock (epoch ms). */
export const clock = () => Date.now();

let fallback = 0;
/**
 * A unique id with a readable kind prefix ('team-3f2a…'): crypto.randomUUID where there is one
 * (secure contexts: https and localhost), else time and a counter.
 * @param {string} [kind]
 * @returns {string}
 */
export function newId(kind = 'id') {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${(++fallback).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${kind}-${uuid}`;
}

/**
 * A Web Storage area, or null when the browser refuses it (a private window, blocked site data:
 * merely reading `localStorage` can throw).
 * @param {'localStorage'|'sessionStorage'} [name]
 * @returns {Storage|null}
 */
export function storage(name = 'localStorage') {
  try {
    const area = window[name];
    return area ?? null;
  } catch {
    return null;
  }
}

/**
 * Which window a page is, from its hash: 'display' for #/display, otherwise 'host' (#/host, or
 * none at all).
 * @param {string} hash
 * @returns {'host'|'display'}
 */
export function route(hash) {
  return /^#\/display(?:[/?]|$)/.test(String(hash ?? '')) ? 'display' : 'host';
}
