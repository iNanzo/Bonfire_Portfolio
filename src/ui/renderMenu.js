// The render menu (P): the pixel pass's settings as a short list, one row each. A row is a
// button: click it (or press its digit) and the setting steps to its next value, shown live
// beside it. The site shows it as a HUD in the top-right corner and as a fold of the
// breakdown panel ("How it's made"); Bonfire Live can hand it its own rows.
//
//   Render settings                P
//   1  Pixel size     3px (427×267)
//   2  Palette          Ember Flame
//   …
//   0  Reset to the site's look
//
// Values are only ever written as text, so a row keeps focus through a refresh (and the
// menu refreshes itself while it's open). It doesn't know what a setting does: `read` says
// what each one is now and `pick` steps one (the site's are fire.describe() and
// fire.cycle() in bonfire/scene.js). Keys come in through handleKey() from the page's own
// keydown, so each page decides when they apply (not while typing, not under a dialog).
// Closed with focus inside, focus isn't lost to the page: a fold keeps it on its heading, a
// HUD gives it back to what had it when it opened (ui/focus.js).
import { esc } from '../html.js';
import { focusedNow, returnFocus } from './focus.js';

/**
 * @typedef {object} RenderRow
 * @property {string} key    the digit that steps it ('1'…'9')
 * @property {string} id     the setting (a key of `read()`'s values)
 * @property {string} label
 */

/** The site's rows: fire.cycle(id) steps one, fire.describe()[id] says what it is. */
export const RENDER_ROWS = /** @type {RenderRow[]} */ ([
  { key: '1', id: 'pixel', label: 'Pixel size' },
  { key: '2', id: 'palette', label: 'Palette' },
  { key: '3', id: 'dither', label: 'Dither' },
  { key: '4', id: 'matrix', label: 'Dither pattern' },
  { key: '5', id: 'outlines', label: 'Outlines' },
  { key: '6', id: 'interaction', label: 'Cursor' },
]);

/** What a value shows as when `read()` doesn't have it (yet). */
export const NO_VALUE = '—';

/**
 * The key a key press stands for: a digit by its place on the keyboard ('Digit3' and
 * 'Numpad3' are '3', whatever the layout types there), anything else by what it types.
 * @param {{ key: string, code?: string }} e
 */
export const keyOf = (e) => (/^(Digit|Numpad)\d$/.test(e.code ?? '') ? e.code.slice(-1) : e.key);

/**
 * The row a key steps, or null.
 * @param {RenderRow[]} rows
 * @param {string} key  as keyOf() gives it
 */
export const rowForKey = (rows, key) => rows.find((r) => r.key === key) ?? null;

/**
 * The rows' buttons, with their values (all text escaped).
 * @param {RenderRow[]} rows
 * @param {Record<string, unknown>} [values]
 */
export function rowsHtml(rows, values = {}) {
  return rows.map((r) => `
    <button class="render-row" type="button" data-render-row="${esc(r.id)}">
      <span class="cursor" aria-hidden="true"></span><kbd aria-hidden="true">${esc(r.key)}</kbd><span class="render-row-label">${esc(r.label)}</span>
      <b class="render-row-value" data-render-value>${esc(String(values[r.id] ?? NO_VALUE))}</b>
    </button>`).join('');
}

/**
 * @param {object} o
 * @param {() => Record<string, unknown> | null} o.read   every setting's value now (null: nothing to show yet)
 * @param {(id: string, dir: 1 | -1) => (Record<string, unknown> | void)} o.pick
 *   step one setting (dir -1: back, from a Shift+click; a setting that can only go forward
 *   may ignore it); may return the new values
 * @param {RenderRow[]} [o.rows]
 * @param {string} [o.title]      the heading
 * @param {string} [o.toggleKey]  the key that opens and closes it, shown by the heading
 * @param {'all' | 'rows'} [o.collapse]  closed, 'all' hides the whole menu (a HUD); 'rows'
 *   keeps the heading as a button and folds the rows under it (a section of a panel)
 * @param {{ key?: string, label: string, hint?: string, run: () => void, disabled?: () => boolean } | null} [o.reset]
 *   a last row that puts every setting back (disabled while `disabled()` says so)
 * @param {string} [o.className]
 * @param {(what: 'move' | 'select' | 'open' | 'back') => void} [o.onSound]
 * @param {(open: boolean) => void} [o.onToggle]  it opened or closed (by key, click or call)
 * @param {number} [o.poll]  ms between refreshes while it's open and on screen (0: only on picks)
 */
export function createRenderMenu({
  read, pick, rows = RENDER_ROWS, title = 'Render settings', toggleKey = 'P', collapse = 'all',
  reset = null, className = '', onSound = () => {}, onToggle = () => {}, poll = 250,
}) {
  const el = document.createElement('section');
  el.className = `render-menu ${className}`.trim();
  el.dataset.renderMenu = collapse;
  const bodyId = `render-menu-${Math.random().toString(36).slice(2, 8)}`;
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <button class="render-menu-head" type="button" aria-expanded="false" aria-controls="${bodyId}" data-render-head>
      <span class="render-menu-title">${esc(title)}</span><kbd aria-hidden="true">${esc(toggleKey)}</kbd>
    </button>
    <div class="render-menu-rows" id="${bodyId}" role="group" data-render-rows>
      ${rowsHtml(rows)}
      ${reset ? `
      <button class="render-row render-reset" type="button" data-render-reset>
        <span class="cursor" aria-hidden="true"></span>${reset.key ? `<kbd aria-hidden="true">${esc(reset.key)}</kbd>` : '<span></span>'}<span class="render-row-label">${esc(reset.label)}</span>
        <b class="render-row-value">${esc(reset.hint ?? '')}</b>
      </button>` : ''}
    </div>`;
  const head = /** @type {HTMLButtonElement} */ (el.querySelector('[data-render-head]'));
  const body = /** @type {HTMLElement} */ (el.querySelector('[data-render-rows]'));
  const resetBtn = /** @type {HTMLButtonElement | null} */ (el.querySelector('[data-render-reset]'));
  const rowEl = (id) => el.querySelector(`[data-render-row="${CSS.escape(id)}"]`);

  let isOpen = false;
  let timer = 0;
  let opener = null; // (a HUD: what had focus as it opened)
  const shown = () => (collapse === 'all' ? el : body);
  shown().hidden = true;

  /** Write the values in (text only, so focus stays where it is). */
  function refresh(values = read()) {
    if (values) for (const r of rows) {
      const v = rowEl(r.id)?.querySelector('[data-render-value]');
      const text = String(values[r.id] ?? NO_VALUE);
      if (v && v.textContent !== text) v.textContent = text;
    }
    if (resetBtn) resetBtn.disabled = !!reset.disabled?.();
  }
  const onScreen = () => el.isConnected && el.getClientRects().length > 0;

  /** @param {{ focus?: boolean, quiet?: boolean }} [o]  focus: into the first row; quiet: no sound */
  function open({ focus = false, quiet = false } = {}) {
    if (!isOpen) {
      isOpen = true;
      opener = focusedNow(); // (and where focus came in from: focusin below)
      shown().hidden = false;
      head.setAttribute('aria-expanded', 'true');
      refresh();
      if (poll) timer = window.setInterval(() => { if (onScreen()) refresh(); }, poll);
      if (!quiet) onSound('open');
      onToggle(true);
    }
    if (focus) /** @type {HTMLElement | null} */ (body.querySelector('.render-row:not(:disabled)'))?.focus();
  }
  /** @param {{ quiet?: boolean }} [o] */
  function close({ quiet = false } = {}) {
    if (!isOpen) return;
    const hadFocus = el.contains(document.activeElement);
    isOpen = false;
    clearInterval(timer);
    shown().hidden = true;
    head.setAttribute('aria-expanded', 'false');
    // (Not lost into the page: a fold's heading stays; a HUD's gone, so back where it was.)
    if (hadFocus && collapse === 'rows') head.focus();
    else if (hadFocus) returnFocus(opener);
    opener = null;
    if (!quiet) onSound('back');
    onToggle(false);
  }
  const toggle = (o = {}) => (isOpen ? close(o) : open(o));

  /** Step one setting and show every value (a pick can change another's text too). */
  function step(id, dir = 1) {
    const values = pick(id, dir === -1 ? -1 : 1);
    refresh(values || read());
    onSound('move');
    const row = rowEl(id);
    row?.classList.remove('is-hit');
    void (/** @type {HTMLElement} */ (row))?.offsetWidth; // (restart the flash)
    row?.classList.add('is-hit');
  }
  function doReset() {
    if (!reset || reset.disabled?.()) return;
    reset.run();
    refresh();
    onSound('select');
  }

  el.addEventListener('click', (e) => {
    const t = /** @type {Element} */ (e.target);
    if (t.closest('[data-render-head]')) { toggle(); return; }
    const row = /** @type {HTMLElement | null} */ (t.closest('[data-render-row]'));
    if (row) step(row.dataset.renderRow, e.shiftKey ? -1 : 1);
    else if (t.closest('[data-render-reset]')) doReset();
  });
  // Focus coming in (Tab, a click) from somewhere on the page: that's where it goes back to.
  el.addEventListener('focusin', (e) => {
    const from = /** @type {Element | null} */ (e.relatedTarget);
    if (from && !el.contains(from)) opener = from;
  });
  // Up and down move between the rows, like a game menu; Esc closes a HUD from inside it.
  el.addEventListener('keydown', (e) => {
    const t = /** @type {Element} */ (e.target);
    if (e.key === 'Escape' && collapse === 'all' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (!t.closest('.render-row') || !['ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S'].includes(e.key)) return;
    const all = /** @type {HTMLElement[]} */ ([...body.querySelectorAll('.render-row:not(:disabled)')]);
    const by = e.key === 'ArrowUp' || e.key.toLowerCase() === 'w' ? -1 : 1;
    const next = all[(all.indexOf(/** @type {HTMLElement} */ (t.closest('.render-row'))) + by + all.length) % all.length];
    e.preventDefault();
    e.stopPropagation();
    next?.focus();
    onSound('move');
  });

  return {
    el,
    open,
    close,
    toggle,
    get isOpen() { return isOpen; },
    refresh,
    /**
     * The menu's keys from a page-wide keydown: its toggle key opens or closes it; open, a
     * row's digit steps that row and the reset's key resets. Returns true when it used the
     * key (the caller then stops it). The caller checks for typing and dialogs first.
     * @param {KeyboardEvent} e
     */
    handleKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
      if (e.key.toLowerCase() === toggleKey.toLowerCase()) { toggle(); return true; }
      if (!isOpen) return false;
      const key = keyOf(e);
      const row = rowForKey(rows, key);
      if (row) { step(row.id); return true; }
      if (reset?.key && key === reset.key) { doReset(); return true; }
      return false;
    },
  };
}
