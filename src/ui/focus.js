// Focus handed back when an overlay closes (the breakdown, photo mode, the render HUD).
// Each notes what had focus as it opened (focusedNow) and, as it closes, gives focus back
// if focus was inside it or already lost to the page (holdsFocus), so a keyboard user
// carries on where they were instead of from the top of the page. If what had it isn't on
// screen any more (hidden, gone, or there was nothing), focus goes to the page's main
// region (#main), where there is one.

/** What has focus now, or null when nothing does (the page itself). */
export function focusedNow() {
  const a = document.activeElement;
  return a && a !== document.body && a !== document.documentElement ? a : null;
}

/**
 * Whether an overlay closing now should hand focus back: focus is inside it, or nowhere.
 * Ask before hiding it (a hidden element can still be document.activeElement for a moment).
 * @param {Element} overlay
 */
export function holdsFocus(overlay) {
  const a = focusedNow();
  return !a || overlay.contains(a);
}

/**
 * Give focus back to `to` if it's still on screen and takes focus, else to #main.
 * @param {Element | null} to
 */
export function returnFocus(to) {
  const target = /** @type {HTMLElement | null} */ (to);
  if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
  if (target && document.activeElement === target) return;
  document.getElementById('main')?.focus({ preventScroll: true });
}
