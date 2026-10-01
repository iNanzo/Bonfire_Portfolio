// What every front end's page does the same way: finding elements, telling whether a key
// press is someone typing, full screen, and what happens when the scene can't start. (Each
// main.js has had its own copy of these; they move here one app at a time.)

/** The first element matching `s` under `r`. */
export const q = (s, r = document) => r.querySelector(s);
/** Every element matching `s` under `r`, as an array. */
export const qa = (s, r = document) => [...r.querySelectorAll(s)];

// Inputs that take a press rather than typing: a key pressed on one is still a shortcut.
const PRESSED = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);
/**
 * Whether a key pressed at `el` is someone typing (or choosing from a list), so a page's
 * single-key shortcuts leave it alone: a text-like input, a textarea, a select, editable
 * text. A slider, a checkbox, a radio, a button or a color well isn't.
 * @param {EventTarget | null | undefined} el
 */
export function typing(el) {
  const field = /** @type {any} */ (el)?.closest?.('input, select, textarea, [contenteditable]:not([contenteditable="false"])');
  if (!field) return false;
  return !(field.tagName === 'INPUT' && PRESSED.has(String(field.type).toLowerCase()));
}

/** Full screen for `el` (the whole page by default), or back out of it. */
export function toggleFullscreen(el = document.documentElement) {
  const doc = el.ownerDocument ?? document;
  if (doc.fullscreenElement) doc.exitFullscreen?.()?.catch(() => {});
  else el.requestFullscreen?.()?.catch(() => {});
}

/** What a page says when the bonfire can't start. */
export const NO_WEBGL = 'This browser couldn’t start WebGL, so the bonfire can’t render here. Try Chrome or Edge with hardware acceleration on.';
/**
 * The scene couldn't start (no WebGL): the page is marked `no-webgl` (each app's CSS hides
 * what needs the scene by it), `el` (the page's error line, if it has one) says so, and why
 * goes to the console. The page disposes its own bonfire first.
 * @param {HTMLElement | null} el
 * @param {unknown} error
 * @param {{ doc?: Document, log?: string }} [o]
 */
export function failScene(el, error, { doc = document, log = 'Bonfire unavailable.' } = {}) {
  doc.documentElement.classList.add('no-webgl');
  if (el) {
    el.textContent = NO_WEBGL;
    el.hidden = false;
  }
  console.warn(log, error);
}
