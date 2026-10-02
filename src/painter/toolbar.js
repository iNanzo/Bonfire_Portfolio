// The Painter's top bar, the parts that aren't the scene's: the Tools menu (what only a key
// reached before: Render Settings P, Pack I, Capture C, Full Screen F, Keyboard Shortcuts ?),
// the bar buttons' tooltips, and the list of every key the Painter answers, for the keys
// overlay (src/ui/keysOverlay.js).
// No key changes by being listed here: main.js and cameraRig.js answer them as they always
// have.
//
// The menu is a menu button: Enter, Space or ↓ on it opens it on its first item (↑ on its
// last); ↑ ↓ Home End move; Enter picks; Esc closes it back onto the button; Tab or a click
// elsewhere closes it. A key an item shows (P, I, C, F, ?) picks that item, as the same key
// does on the page; any other key the page answers closes the menu first, so nothing it
// opens comes up under the menu. While it's open the button's tooltip steps aside (it
// would cover the menu), and coming back to the button from it doesn't bring the tip up.
import { esc } from '../html.js';

/** The Tools menu's items: what each does (main.js runs it by `cmd`) and its key. */
export const TOOLS = [
  { cmd: 'render', label: 'Render Settings', key: 'P' },
  { cmd: 'pack', label: 'Pack', key: 'I' },
  { cmd: 'capture', label: 'Capture', key: 'C' },
  { cmd: 'fullscreen', label: 'Full Screen', key: 'F' },
  { cmd: 'keys', label: 'Keyboard Shortcuts', key: '?' },
];

/**
 * Every key the Painter answers, in groups (the keys overlay's): the page's (main.js), the
 * render menu's (P, then its digits) and the camera's (cameraRig.js).
 * @type {import('../ui/keysOverlay.js').KeyGroup[]}
 */
export const PAINTER_KEYS = [
  {
    title: 'The Scene',
    keys: [
      { keys: ['Ctrl', 'S'], label: 'Save it in My Scenes' },
      { keys: ['Ctrl', 'Z'], label: 'Undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: 'Redo' },
      { keys: ['Ctrl', 'Y'], label: 'Redo' },
    ],
  },
  {
    title: 'Preview',
    keys: [
      { keys: ['Space'], label: 'Beat on or off (Still)' },
      { keys: ['D'], label: 'A drop now' },
    ],
  },
  {
    title: 'Panels & Tools',
    keys: [
      { keys: ['H'], label: 'Hide or show the panel' },
      { keys: ['/'], label: 'Search the panel' },
      { keys: ['L'], label: 'Library (L or Esc closes it)' },
      { keys: ['I'], label: 'Pack: it paints into the scene' },
      { keys: ['P'], label: 'Render Settings' },
      { keys: ['1–8'], label: 'With Render Settings open: step a setting' },
      { keys: ['0'], label: 'With Render Settings open: reset them' },
      { keys: ['C'], label: 'Capture a picture of the stage' },
      { keys: ['F'], label: 'Full screen' },
      { keys: ['?'], label: 'These keyboard shortcuts' },
    ],
  },
  {
    title: 'Camera',
    keys: [
      { keys: ['Arrow Keys'], label: 'Orbit a step' },
      { keys: ['Shift', 'Arrow Keys'], label: 'Slide a step' },
      { keys: ['+'], label: 'Come nearer' },
      { keys: ['-'], label: 'Go further' },
      { keys: ['Q'], label: 'Tilt the horizon one way' },
      { keys: ['E'], label: 'Tilt it the other way' },
      { keys: ['['], label: 'Narrow the lens' },
      { keys: [']'], label: 'Widen the lens' },
    ],
  },
];

/** A key as aria-keyshortcuts names it ("?" is "Shift+?", as it's typed on most keyboards). */
const shortcut = (key) => (key === '?' ? 'Shift+?' : key);

/**
 * A bar button's tooltip, read out too (the shared tip is hidden from screen readers): its
 * data-tip and an aria-describedby for the button, and the hidden text it names (after it).
 * @param {string} id @param {string} text
 */
const tipped = (id, text) => ({ attrs: `data-tip="${esc(text)}" aria-describedby="${id}"`, note: `<span class="visually-hidden" id="${id}">${esc(text)}</span>` });
/** The bar's other buttons' tooltips (main.js draws them): undo, redo, Play and the banner's ✕. */
export const TIPS = {
  undo: tipped('pnt-tip-undo', 'Undo the last change (Ctrl+Z)'),
  redo: tipped('pnt-tip-redo', 'Redo what was undone (Ctrl+Shift+Z or Ctrl+Y)'),
  play: tipped('pnt-tip-play', 'Plays this scene in Bonfire Live: an open Bonfire Live tab at once, else a new one. Changes are saved first.'),
  close: tipped('pnt-tip-close', 'Close this note (the scene stays as it is)'),
};
/** The Tools button's tooltip (read out too, the same way). */
const TOOLS_TIP = 'Render Settings, the pack, a capture, full screen and the keyboard shortcuts';

/**
 * The Tools menu's markup: its button (`data-cmd="tools"`: the bar's other buttons are
 * commands too) and the menu, hidden.
 * @param {string} [id]  the menu's id
 */
export const toolsMarkup = (id = 'pnt-tools-menu') => `
  <div class="pnt-tools" data-tools>
    <button type="button" class="pix-btn" data-cmd="tools" aria-label="Tools" aria-haspopup="menu" aria-expanded="false" aria-controls="${esc(id)}" aria-describedby="${esc(id)}-tip" data-tip="${TOOLS_TIP}" data-tip-side="bottom"><span class="pnt-tools-word">Tools</span><span class="pnt-caret" aria-hidden="true">▾</span></button>
    <span class="visually-hidden" id="${esc(id)}-tip">${TOOLS_TIP}</span>
    <div class="pnt-tools-menu" id="${esc(id)}" role="menu" aria-label="Tools" data-tools-menu hidden>
      ${TOOLS.map((t) => `<button type="button" role="menuitem" class="pnt-tools-item" data-tool="${esc(t.cmd)}" tabindex="-1" aria-keyshortcuts="${esc(shortcut(t.key))}"><span>${esc(t.label)}</span><kbd aria-hidden="true">${esc(t.key)}</kbd></button>`).join('')}
    </div>
  </div>`;

/** The Tools item a key picks (its letter in either case, or ?), or undefined. */
const toolForKey = (key) => TOOLS.find((t) => t.key.toLowerCase() === String(key).toLowerCase());

/**
 * Wire the Tools menu drawn by toolsMarkup into `el`. `run(cmd)` does an item (after the
 * menu closes, so what it opens takes the focus). The page calls toggle() from the button's
 * command. `hideTip`: the shared tooltip's hide (a tip showing as the menu opens goes).
 * @param {HTMLElement} el
 * @param {(cmd: string) => void} run
 * @param {{ hideTip?: () => void }} [o]
 */
export function bindTools(el, run, { hideTip = () => {} } = {}) {
  const button = /** @type {HTMLButtonElement} */ (el.querySelector('[data-cmd="tools"]'));
  const menu = /** @type {HTMLElement} */ (el.querySelector('[data-tools-menu]'));
  const items = /** @type {HTMLButtonElement[]} */ ([...menu.querySelectorAll('[data-tool]')]);
  const doc = el.ownerDocument;
  const tipText = button.getAttribute('data-tip') ?? '';

  const isOpen = () => !menu.hidden;
  /** @param {number} [at]  the item to focus (-1: the last) */
  function open(at = 0) {
    // (Its tip steps aside while the menu shows: no tooltip over what it describes.)
    hideTip();
    button.removeAttribute('data-tip');
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    items.at(at)?.focus();
  }
  /** @param {{ focus?: boolean }} [o]  focus: back onto the button */
  function close({ focus = false } = {}) {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus(); // (before its tip is back: returning from the menu isn't news)
    if (tipText) button.setAttribute('data-tip', tipText);
  }
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open(e.key === 'ArrowUp' ? -1 : 0);
    }
  });
  menu.addEventListener('keydown', (e) => {
    const at = items.indexOf(/** @type {HTMLButtonElement} */ (doc.activeElement));
    const go = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
    if (go !== undefined) {
      e.preventDefault();
      items[(go + items.length) % items.length].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // (the page's Esc is for what's under it)
      close({ focus: true });
    } else if (e.key === 'Tab') close();
    else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // A key the menu shows picks its item; any other goes on to the page, the menu shut first.
      const t = toolForKey(e.key);
      close({ focus: true });
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      run(t.cmd);
    }
  });
  menu.addEventListener('click', (e) => {
    const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-tool]'));
    if (!item) return;
    close({ focus: true });
    run(item.dataset.tool);
  });
  doc.addEventListener('pointerdown', (e) => { if (isOpen() && !el.contains(/** @type {Node} */ (e.target))) close(); });
  menu.addEventListener('focusout', (e) => {
    const to = /** @type {Node | null} */ (e.relatedTarget);
    if (to && !el.contains(to)) close();
  });
  return {
    /** Open it on its first item, or close it. (A click or a key on the button.) */
    toggle() { if (isOpen()) close({ focus: true }); else open(0); },
    close,
    get isOpen() { return isOpen(); },
  };
}
