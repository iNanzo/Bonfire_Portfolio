// The invitation toy's page around the canvas: the status line ("Loading…", or what went wrong),
// the toolbar along the bottom (Wave, Spook, Sit or Stand, Run, Wander, Look: every button a
// thumb's height, labelled, never a tooltip) and the Look menu, a bottom sheet (Pixel Size in
// steps, Off, 2×, 3× and 4×; Dithering, Outlines, Style, Motion (Smooth or Choppy), and Reset
// Camera with a line on turning and zooming the view). The sheet is a modal dialog: it opens on
// Done, Tab goes round inside it, the toolbar it covers is inert while it's open, and Escape
// closes it wherever focus is; the canvas stays live (turning the camera while choosing a look).
// Pure markup functions (no DOM) plus a thin binding (bindUi) that puts them in the stage and
// reports presses; main.js decides what they do.
//
//   parseQuery(search)   ?test (the window.__invitation hooks), ?seed=N, ?calm, ?perf

import { PIXEL_SIZES } from './pixels.js';
import { LOOKS, MOTIONS, STYLES, validLook } from './look.js';

/** @typedef {import('./types.js').ButtonName} ButtonName */

/** The toolbar's action buttons, in order (Look comes last, on its own). */
export const BUTTONS = /** @type {const} */ (['Wave', 'Spook', 'Sit', 'Run', 'Wander']);
/** @type {Record<import('./pixels.js').PixelSize, string>} Pixel Size's labels: Off, then N× (a texel N×N CSS px) */
export const PIXEL_LABELS = { off: 'Off', 2: '2×', 3: '3×', 4: '4×' };
/** @type {Record<import('./look.js').Motion, string>} Motion's labels */
export const MOTION_LABELS = { smooth: 'Smooth', choppy: 'Choppy' };

/**
 * The page's options from the query string.
 * @param {string} search  location.search
 */
export function parseQuery(search) {
  const q = new URLSearchParams(search);
  const seed = Number.parseInt(q.get('seed') ?? '', 10);
  return {
    test: q.has('test'),
    seed: Number.isFinite(seed) ? seed : null,
    calm: q.has('calm'),
    perf: q.has('perf'),
  };
}

/** The toolbar: the action buttons and Look. */
export function toolbarHtml() {
  const buttons = BUTTONS.map((name) =>
    name === 'Wander'
      ? `<button type="button" class="inv-btn" data-button="Wander" aria-pressed="false">Wander</button>`
      : `<button type="button" class="inv-btn" data-button="${name}">${name}</button>`,
  ).join('');
  return `<nav class="inv-toolbar" aria-label="Play With NEWT">${buttons}<button type="button" class="inv-btn inv-btn-look" data-look-open aria-expanded="false" aria-controls="inv-look">Look</button></nav>`;
}

/**
 * One choice of a radio group, as a chunky segment.
 * @param {string} group  the input's name
 * @param {string} key  the Look setting it sets
 * @param {string} value
 * @param {string} label
 * @param {boolean} checked
 */
const segment = (group, key, value, label, checked) =>
  `<label class="inv-seg"><input type="radio" name="${group}" value="${value}" data-look="${key}"${checked ? ' checked' : ''}><span>${label}</span></label>`;

/**
 * An on/off switch.
 * @param {string} key
 * @param {string} label
 * @param {boolean} on
 */
const toggle = (key, label, on) =>
  `<label class="inv-switch"><input type="checkbox" role="switch" data-look="${key}"${on ? ' checked' : ''}><span class="inv-switch-label">${label}</span><span class="inv-knob" aria-hidden="true"></span></label>`;

/**
 * The Look menu, a bottom sheet (hidden until Look opens it).
 * @param {import('./look.js').Look} look
 */
export function sheetHtml(look) {
  const l = validLook(look);
  const sizes = PIXEL_SIZES.map((p) => segment('inv-pixel', 'pixelSize', p, PIXEL_LABELS[p], l.pixelSize === p)).join(
    '',
  );
  const styles = STYLES.map((s) => segment('inv-style', 'style', s, LOOKS[s].label, l.style === s)).join('');
  const motions = MOTIONS.map((m) => segment('inv-motion', 'motion', m, MOTION_LABELS[m], l.motion === m)).join('');
  return `<section class="inv-sheet" id="inv-look" role="dialog" aria-modal="true" aria-labelledby="inv-look-title" hidden>
  <header class="inv-sheet-head"><h2 id="inv-look-title">Look</h2><button type="button" class="inv-btn inv-btn-done" data-look-close>Done</button></header>
  <p class="inv-hint">Changes show right away and stay for your next visit.</p>
  <fieldset class="inv-field"><legend>Pixel Size</legend><div class="inv-segs">${sizes}</div></fieldset>
  <div class="inv-switches">${toggle('dither', 'Dithering', l.dither)}${toggle('outlines', 'Outlines', l.outlines)}</div>
  <p class="inv-hint inv-hint-off" data-off-hint${l.pixelSize === 'off' ? '' : ' hidden'}>Dithering and outlines are part of the pixel look: pick a pixel size to see them.</p>
  <fieldset class="inv-field"><legend>Style</legend><div class="inv-segs">${styles}</div></fieldset>
  <fieldset class="inv-field"><legend>Motion</legend><div class="inv-segs">${motions}</div></fieldset>
  <div class="inv-camera"><p class="inv-hint">Drag empty space to turn the view, and pinch or scroll to zoom.</p><button type="button" class="inv-btn" data-reset-camera>Reset Camera</button></div>
</section>`;
}

/** The status line: shown while loading and when something went wrong. */
export function statusHtml() {
  return `<div class="inv-status" role="status" aria-live="polite"><p class="inv-status-text">Loading…</p><button type="button" class="inv-btn" data-reload hidden>Reload</button></div>`;
}

/**
 * Put the page's controls in the stage and report what's pressed.
 * @param {HTMLElement} stage
 * @param {{look: import('./look.js').Look, onButton(name: ButtonName): void, onLook(look: import('./look.js').Look): void, onResetCamera?(): void}} o
 */
export function bindUi(stage, { look, onButton, onLook, onResetCamera }) {
  const hud = document.createElement('div');
  hud.className = 'inv-hud';
  hud.innerHTML = statusHtml() + toolbarHtml() + sheetHtml(look);
  stage.append(hud);
  const $ = (sel) => /** @type {HTMLElement} */ (hud.querySelector(sel));
  const sheet = $('.inv-sheet');
  const opener = $('[data-look-open]');
  const toolbar = $('.inv-toolbar');
  /** The sheet's first and last stops for Tab. */
  const first = $('[data-look-close]');
  const last = $('[data-reset-camera]');
  const status = $('.inv-status');
  let current = validLook(look);

  const syncOff = () => {
    $('[data-off-hint]').hidden = current.pixelSize !== 'off';
    for (const key of ['dither', 'outlines'])
      /** @type {HTMLInputElement} */ ($(`input[data-look="${key}"]`)).disabled = current.pixelSize === 'off';
  };
  syncOff();
  /**
   * While the sheet is open, on the whole document: Escape closes it wherever focus is (a click
   * or a drag on the canvas leaves focus on the page, outside the sheet), and Tab goes round
   * inside it (from its last stop to its first, and back with Shift; from the page, into it).
   * @param {KeyboardEvent} e
   */
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      openSheet(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const at = document.activeElement;
    if (at && sheet.contains(at) && at !== (e.shiftKey ? first : last)) return;
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  };
  /** @param {boolean} open */
  const openSheet = (open) => {
    sheet.hidden = !open;
    // (The toolbar under the sheet: no focus, no presses, hidden from screen readers.)
    toolbar.inert = open;
    opener.setAttribute('aria-expanded', String(open));
    stage.classList.toggle('is-looking', open);
    if (open) {
      document.addEventListener('keydown', onKey);
      first.focus();
    } else {
      document.removeEventListener('keydown', onKey);
      opener.focus();
    }
  };

  hud.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!el || !hud.contains(el)) return;
    if (el.matches('[data-look-open]')) openSheet(Boolean(sheet.hidden));
    else if (el.matches('[data-look-close]')) openSheet(false);
    else if (el.matches('[data-reload]')) location.reload();
    else if (el.matches('[data-reset-camera]')) onResetCamera?.();
    else if (el.dataset.button) onButton(/** @type {ButtonName} */ (el.dataset.button));
  });
  hud.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const key = input.dataset.look;
    if (!key) return;
    current = validLook({ ...current, [key]: input.type === 'checkbox' ? input.checked : input.value });
    syncOff();
    onLook(current);
  });
  return {
    /**
     * Show a message in place of the toy ("Loading…", what went wrong), or hide it (null).
     * @param {string|null} text
     * @param {{reload?: boolean}} [o]
     */
    setStatus(text, { reload = false } = {}) {
      status.hidden = text === null;
      $('.inv-status-text').textContent = text ?? '';
      $('[data-reload]').hidden = !reload;
    },
    /** @param {'Sit'|'Stand'} label */
    setSitLabel(label) {
      $('[data-button="Sit"]').textContent = label;
    },
    /** @param {boolean} on */
    setWander(on) {
      $('[data-button="Wander"]').setAttribute('aria-pressed', String(on));
    },
    /**
     * The action buttons on or off (off while he's held or falling; Look stays on).
     * @param {boolean} on
     */
    setEnabled(on) {
      for (const name of BUTTONS) /** @type {HTMLButtonElement} */ ($(`[data-button="${name}"]`)).disabled = !on;
    },
    /** @param {boolean} on */
    setToolbar(on) {
      $('.inv-toolbar').hidden = !on;
    },
    get toolbar() {
      return $('.inv-toolbar');
    },
    get sheetOpen() {
      return !sheet.hidden;
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
      hud.remove();
    },
  };
}
