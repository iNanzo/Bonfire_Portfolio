// The invitation toy's page around the canvas: the status line ("Loading…", or what went wrong),
// the toolbar along the bottom (Wave, Spook, Sit or Stand, Run, Wander, Look: every button a
// thumb's height, labelled, never a tooltip) and the Look menu, a bottom sheet (Pixel Size, a
// slider over NEWT's sprite resolutions, 16×16 to 256×256, then Native (a texel a device pixel)
// and Off at its fine end, with a button at each end (named for what it sets: "Pixel Size
// Off") and a line saying how many pixels tall he is on this screen; Dithering, Outlines,
// Style, Motion (Smooth or Choppy), and Reset Camera with a line on turning and zooming the
// view). The slider's steps are the screen's (pixels.js pixelSteps: two resolutions that come
// to the same block there are one step, and one that comes to 1 px is Native), set by main.js
// as the stage is measured (setPixelSteps); every Pixel Size is a step until then. The sheet is a modal dialog: it opens on Done, Tab goes
// round inside it, the toolbar's action buttons are inert while it's open (Look, pressed,
// closes it, as Done does; the sheet's head with Done stays at its top as it scrolls), and
// Escape closes it wherever focus is; the canvas stays live (turning the camera while choosing a look). A finger
// on a slider only moves it once it goes along it (slideIntent): a swipe up or down that starts
// there scrolls the sheet, and the value the slider jumped to under the finger is put back.
// Pure markup functions (no DOM) plus a thin binding (bindUi) that puts them in the stage and
// reports presses; main.js decides what they do.
//
//   parseQuery(search)   ?test (the window.__invitation hooks), ?seed=N, ?calm, ?perf

import { PIXEL_SIZES, resolutionOf, stepFor } from './pixels.js';
import { LOOKS, MOTIONS, STYLES, validLook } from './look.js';

/** @typedef {import('./types.js').ButtonName} ButtonName */

/** How far a finger on a slider moves before it's a drag along it or a swipe across it, CSS px. */
export const SLIDE_SLOP = 8;
/**
 * What a finger that went down on a slider and has since moved (dx, dy) CSS px is doing: 'drag'
 * (mostly along it: it moves the slider), 'swipe' (up or down, or diagonally: the sheet scrolls
 * and the slider keeps its value), or null (within SLIDE_SLOP: a tap, or not yet known).
 * @param {number} dx
 * @param {number} dy
 * @returns {'drag'|'swipe'|null}
 */
export function slideIntent(dx, dy) {
  if (Math.hypot(dx, dy) < SLIDE_SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'drag' : 'swipe';
}

/** The toolbar's action buttons, in order (Look comes last, on its own). */
export const BUTTONS = /** @type {const} */ (['Wave', 'Spook', 'Sit', 'Run', 'Wander']);
/** @type {Record<string, string>} the Pixel Sizes named by a word, not N×N */
const PIXEL_WORDS = { native: 'Native', off: 'Off' };
/**
 * A Pixel Size's label: N×N (NEWT about N texels tall), Native or Off.
 * @param {import('./pixels.js').PixelSize} p
 */
export const pixelLabel = (p) => PIXEL_WORDS[p] ?? `${p}×${p}`;
/**
 * A Pixel Size as a screen reader says it: "N by N", Native or Off.
 * @param {import('./pixels.js').PixelSize} p
 */
export const pixelSpoken = (p) => PIXEL_WORDS[p] ?? `${p} by ${p}`;
/**
 * The name a button at an end of Pixel Size's slider goes by: what it sets, as a screen reader
 * says it ("Pixel Size 16 by 16", "Pixel Size Off"), where it shows only the step.
 * @param {import('./pixels.js').PixelSize} p
 */
export const pixelEndName = (p) => `Pixel Size ${pixelSpoken(p)}`;
/** @type {import('./pixels.js').PixelStep[]} every Pixel Size a step of its own (no screen measured yet) */
const ALL_STEPS = PIXEL_SIZES.map((p) => ({ value: p, n: resolutionOf(p), pd: 0, texels: 0, covers: [p] }));

/**
 * The line under Pixel Size: how many texels tall NEWT is at `step` on this screen (every pixel
 * there is at Native; '' at Off, and before the screen's measured).
 * @param {import('./pixels.js').PixelStep} step
 */
export function pixelNote(step) {
  if (step.value === 'off' || !(step.texels > 0)) return '';
  const tall = Math.round(step.texels);
  return step.pd === 1
    ? `NEWT is about ${tall} pixels tall: every pixel this screen has.`
    : `NEWT is about ${tall} pixels tall on this screen.`;
}

/**
 * Pixel Size: the slider over the screen's steps (the stored value at the step that stands for
 * it), its value as N×N, a button at each end, and the line under it.
 * @param {import('./pixels.js').PixelSize} value
 * @param {import('./pixels.js').PixelStep[]} steps
 */
function pixelHtml(value, steps) {
  const step = stepFor(value, steps);
  const note = pixelNote(step);
  return `<div class="inv-field inv-pixel">
    <div class="inv-pixel-head"><label for="inv-pixel-range">Pixel Size</label><output class="inv-pixel-value" for="inv-pixel-range" data-pixel-value aria-hidden="true">${pixelLabel(step.value)}</output></div>
    <div class="inv-pixel-row"><button type="button" class="inv-btn inv-pixel-end" data-pixel-end="first" aria-label="${pixelEndName(steps[0].value)}">${pixelLabel(steps[0].value)}</button><input type="range" class="inv-range" id="inv-pixel-range" min="0" max="${steps.length - 1}" step="1" value="${steps.indexOf(step)}" aria-valuetext="${pixelSpoken(step.value)}" data-look="pixelSize"><button type="button" class="inv-btn inv-pixel-end" data-pixel-end="last" aria-label="${pixelEndName(steps[steps.length - 1].value)}">${pixelLabel(steps[steps.length - 1].value)}</button></div>
    <p class="inv-hint" data-pixel-note${note ? '' : ' hidden'}>${note}</p>
  </div>`;
}
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
 * @param {import('./pixels.js').PixelStep[]} [steps]  Pixel Size's steps on this screen (pixels.js
 *   pixelSteps; every Pixel Size its own step by default)
 */
export function sheetHtml(look, steps = ALL_STEPS) {
  const l = validLook(look);
  const styles = STYLES.map((s) => segment('inv-style', 'style', s, LOOKS[s].label, l.style === s)).join('');
  const motions = MOTIONS.map((m) => segment('inv-motion', 'motion', m, MOTION_LABELS[m], l.motion === m)).join('');
  return `<section class="inv-sheet" id="inv-look" role="dialog" aria-modal="true" aria-labelledby="inv-look-title" hidden>
  <header class="inv-sheet-head"><h2 id="inv-look-title">Look</h2><button type="button" class="inv-btn inv-btn-done" data-look-close>Done</button></header>
  <p class="inv-hint">Changes show right away and stay for your next visit.</p>
  ${pixelHtml(l.pixelSize, steps)}
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
 * @param {{look: import('./look.js').Look, onButton(name: ButtonName): void, onLook(look: import('./look.js').Look): void, onResetCamera?(): void, onSheet?(open: boolean): void}} o
 *   onSheet: the Look sheet opened or closed (main.js keeps NEWT in sight beside it)
 */
export function bindUi(stage, { look, onButton, onLook, onResetCamera, onSheet }) {
  const hud = document.createElement('div');
  hud.className = 'inv-hud';
  hud.innerHTML = statusHtml() + toolbarHtml() + sheetHtml(look);
  stage.append(hud);
  const $ = (sel) => /** @type {HTMLElement} */ (hud.querySelector(sel));
  const sheet = $('.inv-sheet');
  const opener = $('[data-look-open]');
  /** The sheet's first and last stops for Tab. */
  const first = $('[data-look-close]');
  const last = $('[data-reset-camera]');
  const status = $('.inv-status');
  let current = validLook(look);
  let steps = ALL_STEPS;
  const range = /** @type {HTMLInputElement} */ ($('#inv-pixel-range'));

  /** Pixel Size's slider, value, ends and line, from the current look and the screen's steps. */
  const syncPixel = () => {
    const step = stepFor(current.pixelSize, steps);
    range.max = String(steps.length - 1);
    range.value = String(steps.indexOf(step));
    range.setAttribute('aria-valuetext', pixelSpoken(step.value));
    $('[data-pixel-value]').textContent = pixelLabel(step.value);
    for (const [end, at] of /** @type {const} */ ([
      ['first', steps[0]],
      ['last', steps[steps.length - 1]],
    ])) {
      const button = $(`[data-pixel-end="${end}"]`);
      button.textContent = pixelLabel(at.value);
      button.setAttribute('aria-label', pixelEndName(at.value));
    }
    const note = $('[data-pixel-note]');
    note.textContent = pixelNote(step);
    note.hidden = !note.textContent;
  };
  /**
   * The slider moved (dragged, a key, an end's button): its step is the Pixel Size, at once.
   * @param {number} index
   */
  const pickPixel = (index) => {
    const step = steps[Math.min(steps.length - 1, Math.max(0, Math.round(index)))];
    if (!step) return;
    const changed = step.value !== current.pixelSize;
    current = validLook({ ...current, pixelSize: step.value });
    syncPixel();
    syncOff();
    if (changed) onLook(current);
  };

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
    // (The action buttons under the sheet: no focus, no presses, hidden from screen readers.
    // Look stays, pressed: another press closes the sheet, as Done does.)
    for (const name of BUTTONS) /** @type {HTMLElement} */ ($(`[data-button="${name}"]`)).inert = open;
    opener.setAttribute('aria-expanded', String(open));
    if (open) {
      document.addEventListener('keydown', onKey);
      first.focus();
    } else {
      document.removeEventListener('keydown', onKey);
      opener.focus();
    }
    onSheet?.(open);
  };

  /**
   * A finger (or pen) on a slider, from when it goes down until it's let go: which, where it went
   * down, and what it's doing (slideIntent). Chrome moves a range to where a finger lands as it
   * lands, so nothing it shows is taken until the finger goes along it, or lifts without moving
   * (a tap on the track); a swipe puts back the value the look has.
   * @type {{id: number, x: number, y: number, range: HTMLInputElement, intent: 'drag'|'swipe'|null}|null}
   */
  let finger = null;
  /** A slider's value as the look's (pickPixel: a no-op when it's the look's already). */
  const takeRange = (/** @type {HTMLInputElement} */ input) => {
    if (input === range) pickPixel(Number(range.value));
  };
  /** Whether a slider's input waits on the finger on it (not yet a drag along it). */
  const waiting = (/** @type {EventTarget|null} */ input) =>
    finger !== null && finger.range === input && finger.intent !== 'drag';
  hud.addEventListener('pointerdown', (e) => {
    const input = /** @type {HTMLElement} */ (e.target);
    if (e.pointerType === 'mouse' || !(input instanceof HTMLInputElement) || input.type !== 'range') return;
    finger = { id: e.pointerId, x: e.clientX, y: e.clientY, range: input, intent: null };
  });
  hud.addEventListener('pointermove', (e) => {
    if (!finger || e.pointerId !== finger.id || finger.intent) return;
    finger.intent = slideIntent(e.clientX - finger.x, e.clientY - finger.y);
    if (finger.intent === 'drag') takeRange(finger.range);
    else if (finger.intent === 'swipe') syncPixel();
  });
  /** @param {PointerEvent} e */
  const fingerUp = (e) => {
    if (!finger || e.pointerId !== finger.id) return;
    const { range: input, intent } = finger;
    finger = null;
    // (Lifted without moving: a tap on the track, which sets it there. A swipe, or a finger the
    // browser took for scrolling: the look's value back.)
    if (e.type === 'pointerup' && intent !== 'swipe') takeRange(input);
    else syncPixel();
  };
  hud.addEventListener('pointerup', fingerUp);
  hud.addEventListener('pointercancel', fingerUp);

  hud.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!el || !hud.contains(el)) return;
    if (el.matches('[data-look-open]')) openSheet(Boolean(sheet.hidden));
    else if (el.matches('[data-look-close]')) openSheet(false);
    else if (el.matches('[data-reload]')) location.reload();
    else if (el.matches('[data-reset-camera]')) onResetCamera?.();
    else if (el.matches('[data-pixel-end]')) pickPixel(el.dataset.pixelEnd === 'first' ? 0 : steps.length - 1);
    else if (el.dataset.button) onButton(/** @type {ButtonName} */ (el.dataset.button));
  });
  // (The slider while it's dragged, not only once it's let go: each step shows as it's passed.
  // Under a finger, only once it goes along it.)
  hud.addEventListener('input', (e) => {
    if (e.target === range && !waiting(range)) pickPixel(Number(range.value));
  });
  hud.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input === range) return waiting(range) ? undefined : pickPixel(Number(range.value));
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
    /**
     * Pixel Size's steps on this screen (pixels.js pixelSteps), as the stage is measured.
     * @param {import('./pixels.js').PixelStep[]} next
     */
    setPixelSteps(next) {
      if (!next.length) return;
      steps = next;
      syncPixel();
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
    get sheet() {
      return sheet;
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
      hud.remove();
    },
  };
}
