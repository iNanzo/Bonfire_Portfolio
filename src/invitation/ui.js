// The invitation toy's page around the canvas: the status line ("Loading…", or what went wrong),
// the toolbar along the bottom and the Settings sheet. The toolbar: Replay Intro, Wave, Sit (or
// Stand), Screen Time (Lie Down, Get Up: what its next press does), Run, Camera and Settings,
// each a squircle with a Phosphor icon (icons.js) and its label, the button's own text in a
// span (its name: no tooltip, no title=). With a mouse the label shows as a pixel tab over the
// button on hover and keyboard focus; on touch the bar shows icons only, and a press held still
// for HOLD_MS shows the label and swallows the click that follows (createHold; a quicker press
// acts as ever). Hover and press fill the button with ordered dither. Replay Intro starts the
// intro's dialogue (dialogueUi.js), and while it runs the toolbar rests out of sight
// (setTalking); once it's over, or the envelope's skipped (focusToolbar), focus goes to the
// toolbar's first button, with its ring (and label) only if the visitor's last press was a key,
// as a browser shows it for focus their own press moves. Camera opens the Camera pad over the
// stage (above the bar, never moving it, so the view's clear space and the play area stay as
// they are): Turn Left and Right, Tilt Up and
// Down, Zoom In and Out, Follow NEWT and Reset Camera, and a line on moving the view by hand;
// Escape or Camera again closes it. Settings opens the Settings sheet, a bottom sheet (Pixel
// Size, a
// slider over NEWT's sprite resolutions, 16×16 to 256×256, then Native (a texel a device pixel)
// and Off at its fine end, with a button at each end (named for what it sets: "Pixel Size
// Off") and a line saying how many pixels tall he is on this screen; Dithering, Outlines,
// Style (Default, DS, Soft, and Custom, the row's own once a Shader option is the user's), Motion
// (Smooth or Choppy), Shader (every control in shader.js's table, rendered from it: a slider
// with its value beside it, a row of segments or a switch; Reset To Style; the pixel look's
// ones resting at Pixel Size Off, the lines' while Outlines is off, the dither's while
// Dithering is), Ground Cues (the ring and the dashed drop line under him while he's held: Off,
// In the Mix or Always, In the Mix until it's picked: cues.js CUE_DEFAULT), and Wander, whether
// he walks about by himself, kept for the next visit (loadWander, in localStorage, every read and
// write in try/catch)). The slider's steps are the screen's (pixels.js pixelSteps: two resolutions that come
// to the same block there are one step, and one that comes to 1 px is Native), set by main.js
// as the stage is measured (setPixelSteps); every Pixel Size is a step until then. The sheet is a modal dialog: it opens on Done, Tab goes
// round inside it, the toolbar's other buttons are inert while it's open (Settings, pressed,
// closes it, as Done does; the sheet's head with Done stays at its top as it scrolls), and
// Escape closes it wherever focus is; the canvas stays live (turning the camera while choosing a look). A finger
// on a slider only moves it once it goes along it (slideIntent): a swipe up or down that starts
// there scrolls the sheet, and the value the slider jumped to under the finger is put back.
// Pure markup functions (no DOM) plus a thin binding (bindUi) that puts them in the stage and
// reports presses; main.js decides what they do.
//
//   parseQuery(search)   ?test (the window.__invitation hooks), ?seed=N, ?calm, ?perf (frame
//                        times and the governor's level on screen: stage.js), ?govern (the
//                        frame-time governor on under ?test; ?govern=off, off for anyone)
//                        (an old address's ?drag= is ignored: the bead hold is the only carry)

import { PIXEL_SIZES, resolutionOf, shownPixel, stepFor } from './pixels.js';
import { LOOKS, MOTIONS, STYLES, isCustom, shaderOf, validLook } from './look.js';
import { SHADER_CONTROLS, controlFor, shaderText } from './shader.js';
import { CUE_DEFAULT, CUE_LABELS, CUE_MODES } from './cues.js';
import { LABEL_ICONS, iconSvg, installDither } from './icons.js';

/** @typedef {import('./types.js').ButtonName} ButtonName */

/**
 * Text as HTML: its ampersands and angle brackets as entities (a label or a hint may hold one).
 * @param {string} s
 */
const html = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

/**
 * The toolbar's action buttons, in order, by the brain's name (Replay Intro comes first, Camera
 * and Settings last). Spook and Wander have left the bar: a tap on him still spooks or waves
 * him, and Wander is a setting.
 */
export const BUTTONS = /** @type {const} */ (['Wave', 'Sit', 'Device', 'Run']);
/** Each action button's label (Sit's and Screen Time's change as he sits or lies: setSitLabel, setDeviceLabel). */
export const BUTTON_LABELS = { Wave: 'Wave', Sit: 'Sit', Device: 'Screen Time', Run: 'Run' };
/** Replay Intro's label. */
export const INTRO_LABEL = 'Replay Intro';
/** Screen Time's labels: what its next press does (none under way, sitting with the tablet, lying with it). */
export const DEVICE_LABELS = /** @type {const} */ (['Screen Time', 'Lie Down', 'Get Up']);
/**
 * Screen Time's label for the brain's output: its own deviceLabel when it's one of
 * DEVICE_LABELS, else from what's under way (sitting: Lie Down; lying: Get Up), else Screen Time.
 * @param {{deviceLabel?: unknown, device?: 'sit'|'lie'|null}} o
 * @returns {typeof DEVICE_LABELS[number]}
 */
export function deviceLabelOf(o) {
  const own = DEVICE_LABELS.find((l) => l === o.deviceLabel);
  if (own) return own;
  return o.device === 'sit' ? 'Lie Down' : o.device === 'lie' ? 'Get Up' : 'Screen Time';
}
/**
 * The Camera pad's controls, in order: a key main.js acts on (camera.js orbitNudge, orbitZoom,
 * orbitFollow, orbitReset) and the label.
 */
export const CAMERA_CONTROLS = /** @type {const} */ ([
  { key: 'left', label: 'Turn Left' },
  { key: 'right', label: 'Turn Right' },
  { key: 'up', label: 'Tilt Up' },
  { key: 'down', label: 'Tilt Down' },
  { key: 'in', label: 'Zoom In' },
  { key: 'out', label: 'Zoom Out' },
  { key: 'follow', label: 'Follow NEWT' },
  { key: 'reset', label: 'Reset Camera' },
]);
/** @typedef {typeof CAMERA_CONTROLS[number]['key']} CameraKey */

/** How long a touch on a tool button is held still before its label shows, ms. */
export const HOLD_MS = 450;
/** How far a finger may wander and still be held still, CSS px. */
export const HOLD_SLOP = 10;
/**
 * A touch on a tool button: held still HOLD_MS (tick says when) it shows the label, and its
 * release swallows the click ('label'); a quicker press, one that moved off, or one cancelled
 * is an ordinary press ('click'). Times in seconds.
 * @param {{ms?: number, slop?: number}} [o]
 */
export function createHold({ ms = HOLD_MS, slop = HOLD_SLOP } = {}) {
  /** @type {{x: number, y: number, t: number, moved: boolean, shown: boolean}|null} */
  let p = null;
  return {
    /** @param {number} x @param {number} y @param {number} t */
    down(x, y, t) {
      p = { x, y, t, moved: false, shown: false };
    },
    /** @param {number} x @param {number} y */
    move(x, y) {
      if (p && Math.hypot(x - p.x, y - p.y) > slop) p.moved = true;
    },
    /** Whether the label shows now. @param {number} t */
    tick(t) {
      if (p && !p.moved && !p.shown && t - p.t >= ms / 1000 - 1e-9) p.shown = true;
      return Boolean(p?.shown);
    },
    /** @param {number} t @returns {'label'|'click'} */
    up(t) {
      const shown = this.tick(t);
      p = null;
      return shown ? 'label' : 'click';
    },
    cancel() {
      p = null;
    },
  };
}

/** Where Wander is kept (true or false; unset: the brain's own, on unless ?calm). */
export const WANDER_KEY = 'invitation.wander.v1';
/**
 * Wander as the visitor last left it, or null (never set, unreadable, or no storage).
 * `storage` defaults to localStorage (reaching it can throw).
 * @param {Pick<Storage, 'getItem'>|null} [storage]
 * @returns {boolean|null}
 */
export function loadWander(storage) {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    const v = s ? JSON.parse(s.getItem(WANDER_KEY) ?? 'null') : null;
    return typeof v === 'boolean' ? v : null;
  } catch {
    return null;
  }
}
/**
 * Keep Wander for the next visit; whether it could be.
 * @param {boolean} on
 * @param {Pick<Storage, 'setItem'>|null} [storage]
 */
export function saveWander(on, storage) {
  try {
    const s = storage === undefined ? globalThis.localStorage : storage;
    if (!s) return false;
    s.setItem(WANDER_KEY, JSON.stringify(Boolean(on)));
    return true;
  } catch {
    return false;
  }
}
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
 * it), its value as N×N (the stored one where its step stands for it: pixels.js shownPixel), a
 * button at each end, and the line under it.
 * @param {import('./pixels.js').PixelSize} value
 * @param {import('./pixels.js').PixelStep[]} steps
 */
function pixelHtml(value, steps) {
  const step = stepFor(value, steps);
  const shown = shownPixel(value, steps);
  const note = pixelNote(step);
  return `<div class="inv-field inv-pixel">
    <div class="inv-pixel-head"><label for="inv-pixel-range">Pixel Size</label><output class="inv-pixel-value" for="inv-pixel-range" data-pixel-value aria-hidden="true">${pixelLabel(shown)}</output></div>
    <div class="inv-pixel-row"><button type="button" class="inv-btn inv-pixel-end" data-pixel-end="first" aria-label="${pixelEndName(steps[0].value)}">${pixelLabel(steps[0].value)}</button><input type="range" class="inv-range" id="inv-pixel-range" min="0" max="${steps.length - 1}" step="1" value="${steps.indexOf(step)}" aria-valuetext="${pixelSpoken(shown)}" data-look="pixelSize"><button type="button" class="inv-btn inv-pixel-end" data-pixel-end="last" aria-label="${pixelEndName(steps[steps.length - 1].value)}">${pixelLabel(steps[steps.length - 1].value)}</button></div>
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
  const settle = Number.parseInt(q.get('settle') ?? '', 10);
  return {
    test: q.has('test'),
    seed: Number.isFinite(seed) ? seed : null,
    calm: q.has('calm'),
    perf: q.has('perf'),
    // (The frame-time governor: on for visitors, off under ?test unless asked for; null: as such.)
    govern: q.has('govern') ? q.get('govern') !== 'off' : null,
    // (The intro's reply settle in ms, stretched for the browser specs: only under ?test.)
    settle: q.has('test') && settle > 0 ? settle : null,
    // (The envelope that opens the page, every visit; ?test starts in the toy unless &envelope.)
    envelope: !q.has('test') || q.has('envelope'),
  };
}

/**
 * A tool button: a squircle with its icon and its label, the label its name.
 * @param {string} label
 * @param {string} attrs  its hook and state attributes
 * @param {string} [cls]  more classes
 */
const tool = (label, attrs, cls = '') =>
  `<button type="button" class="inv-btn inv-tool${cls ? ` ${cls}` : ''}" ${attrs}>${iconSvg(LABEL_ICONS[label])}<span class="inv-btn-label">${html(label)}</span></button>`;

/** The Camera pad: its controls and a line on moving the view by hand (closed to begin with). */
function padHtml() {
  const buttons = CAMERA_CONTROLS.map((c) =>
    tool(c.label, c.key === 'reset' ? 'data-camera="reset" data-reset-camera' : `data-camera="${c.key}"`),
  ).join('');
  return `<div class="inv-camera-pad" id="inv-camera" role="group" aria-label="Camera Controls" hidden>${buttons}<p class="inv-hint">Drag empty space to turn or slide the view, and pinch or scroll to zoom.</p></div>`;
}

/** The toolbar: Replay Intro, the action buttons, Camera (and its pad) and Settings. */
export function toolbarHtml() {
  const buttons = BUTTONS.map((name) => tool(BUTTON_LABELS[name], `data-button="${name}"`)).join('');
  const intro = tool(INTRO_LABEL, 'data-intro', 'inv-btn-intro');
  const camera = tool('Camera', 'data-camera-open aria-expanded="false" aria-controls="inv-camera"', 'inv-btn-camera');
  const settings = tool('Settings', 'data-look-open aria-expanded="false" aria-controls="inv-look"', 'inv-btn-look');
  return `<nav class="inv-toolbar" aria-label="Play With NEWT">${intro}${buttons}${camera}${settings}${padHtml()}</nav>`;
}

/**
 * One choice of a radio group, as a chunky segment.
 * @param {string} group  the input's name
 * @param {string} key  the Look setting it sets
 * @param {string} value
 * @param {string} label
 * @param {boolean} checked
 * @param {{disabled?: boolean, attr?: string, spoken?: string}} [o]  attr: its data attribute
 *   (data-look by default); spoken: its name where the label alone is a bare number
 */
const segment = (group, key, value, label, checked, { disabled = false, attr = 'data-look', spoken } = {}) =>
  `<label class="inv-seg"><input type="radio" name="${group}" value="${value}" ${attr}="${key}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}${spoken ? ` aria-label="${spoken}"` : ''}><span>${label}</span></label>`;

/**
 * Whether a Shader control rests (disabled) under a look: one that's part of the pixel look at
 * Pixel Size Off, and one that hangs on Dithering or Outlines while that's off.
 * @param {import('./shader.js').ShaderControl} c
 * @param {import('./look.js').Look} look
 */
export const shaderRests = (c, look) =>
  (c.pixelOnly && look.pixelSize === 'off') ||
  (c.needs === 'dither' && !look.dither) ||
  (c.needs === 'outlines' && !look.outlines);

/**
 * A slider's position for a Shader value: its index on a list of steps, else the value itself.
 * @param {import('./shader.js').ShaderControl} c
 * @param {import('./shader.js').ShaderValue} v
 */
const rangeValue = (c, v) => (c.steps ? Math.max(0, c.steps.indexOf(/** @type {number} */ (v))) : v);

/**
 * One Shader control: a slider with its label and its value beside it, a row of segments, or a
 * switch.
 * @param {import('./shader.js').ShaderControl} c
 * @param {import('./shader.js').ShaderValue} v
 * @param {boolean} rests
 */
function controlHtml(c, v, rests) {
  const id = `inv-shader-${c.key}`;
  const off = rests ? ' disabled' : '';
  if (c.kind === 'switch')
    return `<label class="inv-switch inv-control-switch"><input type="checkbox" role="switch" data-shader="${c.key}"${v ? ' checked' : ''}${off}><span class="inv-switch-label">${html(c.label)}</span><span class="inv-knob" aria-hidden="true"></span></label>`;
  if (c.kind === 'choice') {
    const segs = (c.options ?? [])
      .map((o) =>
        segment(id, c.key, o.value, o.label, o.value === v, { disabled: rests, attr: 'data-shader', spoken: o.spoken }),
      )
      .join('');
    return `<div class="inv-control inv-control-choice" role="radiogroup" aria-labelledby="${id}-label"><span class="inv-control-label" id="${id}-label">${html(c.label)}</span><div class="inv-segs">${segs}</div></div>`;
  }
  const { shown, spoken } = shaderText(c, v);
  const range = c.steps
    ? `min="0" max="${c.steps.length - 1}" step="1"`
    : `min="${c.min}" max="${c.max}" step="${c.step}"`;
  return `<div class="inv-control"><label class="inv-control-label" for="${id}">${html(c.label)}</label><input type="range" class="inv-range" id="${id}" ${range} value="${rangeValue(c, v)}" aria-valuetext="${spoken}" data-shader="${c.key}"${off}><output class="inv-control-value" for="${id}" data-shader-value="${c.key}" aria-hidden="true">${shown}</output></div>`;
}

/**
 * The Shader section: every control in shader.js's table at the look's value (the style's,
 * with the user's changes), Reset To Style (on once a value is the user's own), and a line on
 * the ones resting at Pixel Size Off.
 * @param {import('./look.js').Look} look
 */
function shaderHtml(look) {
  const values = shaderOf(look);
  const controls = SHADER_CONTROLS.map((c) => controlHtml(c, values[c.key], shaderRests(c, look))).join('');
  return `<div class="inv-field inv-shader" role="group" aria-labelledby="inv-shader-title">
    <div class="inv-shader-head"><h3 id="inv-shader-title">Shader</h3><button type="button" class="inv-btn inv-btn-small" data-shader-reset${isCustom(look) ? '' : ' disabled'}>Reset To Style</button></div>
    <p class="inv-hint">Each style sets these. Change one and the style becomes Custom.</p>
    ${controls}
    <p class="inv-hint inv-hint-off" data-shader-off-hint${look.pixelSize === 'off' ? '' : ' hidden'}>Colors, lines, the shadow’s edge and the grade are part of the pixel look: pick a pixel size to see them.</p>
  </div>`;
}

/**
 * An on/off switch.
 * @param {string} key
 * @param {string} label
 * @param {boolean} on
 * @param {string} [attr]  its data attribute (data-look: a Look setting; data-setting: the toy's own)
 */
const toggle = (key, label, on, attr = 'data-look') =>
  `<label class="inv-switch"><input type="checkbox" role="switch" ${attr}="${key}"${on ? ' checked' : ''}><span class="inv-switch-label">${label}</span><span class="inv-knob" aria-hidden="true"></span></label>`;

/**
 * The Settings sheet, a bottom sheet (hidden until Settings opens it).
 * @param {import('./look.js').Look} look
 * @param {import('./pixels.js').PixelStep[]} [steps]  Pixel Size's steps on this screen (pixels.js
 *   pixelSteps; every Pixel Size its own step by default)
 * @param {{wander?: boolean}} [o]  whether he wanders by himself (on by default)
 */
export function sheetHtml(look, steps = ALL_STEPS, { wander = true } = {}) {
  const l = validLook(look);
  const custom = isCustom(l);
  // (Custom is the style row's own once a Shader value is the user's: it's never picked.)
  const styles =
    STYLES.map((s) => segment('inv-style', 'style', s, LOOKS[s].label, !custom && l.style === s)).join('') +
    segment('inv-style', 'style', 'custom', 'Custom', custom, { disabled: !custom });
  const motions = MOTIONS.map((m) => segment('inv-motion', 'motion', m, MOTION_LABELS[m], l.motion === m)).join('');
  // (In the Mix, the bead hold's, until one is picked.)
  const ground = l.groundCues ?? CUE_DEFAULT;
  const cues = CUE_MODES.map((m) => segment('inv-ground', 'groundCues', m, CUE_LABELS[m], ground === m)).join('');
  return `<section class="inv-sheet" id="inv-look" role="dialog" aria-modal="true" aria-labelledby="inv-look-title" hidden>
  <header class="inv-sheet-head"><h2 id="inv-look-title">Settings</h2><button type="button" class="inv-btn inv-btn-done" data-look-close>Done</button></header>
  <p class="inv-hint">Changes show right away and stay for your next visit.</p>
  ${pixelHtml(l.pixelSize, steps)}
  <div class="inv-switches">${toggle('dither', 'Dithering', l.dither)}${toggle('outlines', 'Outlines', l.outlines)}</div>
  <p class="inv-hint inv-hint-off" data-off-hint${l.pixelSize === 'off' ? '' : ' hidden'}>Dithering and outlines are part of the pixel look: pick a pixel size to see them.</p>
  <fieldset class="inv-field"><legend>Style</legend><div class="inv-segs">${styles}</div></fieldset>
  <fieldset class="inv-field"><legend>Motion</legend><div class="inv-segs">${motions}</div></fieldset>
  ${shaderHtml(l)}
  <fieldset class="inv-field"><legend>Ground Cues</legend><div class="inv-segs">${cues}</div><p class="inv-hint">The ring and the dashed line under NEWT while he’s held, showing where he is over the floor.</p></fieldset>
  <div class="inv-field inv-play">${toggle('wander', 'Wander', wander, 'data-setting')}<p class="inv-hint">Left be, he walks about by himself now and then.</p></div>
</section>`;
}

/**
 * A tool button's label and icon changed in place (Sit's, Screen Time's): only its span's text and
 * its SVG, so the button, its focus and its hooks stay.
 * @param {HTMLElement} button
 * @param {string} label
 */
function relabel(button, label) {
  const span = button.querySelector('.inv-btn-label');
  if (span && span.textContent === label) return;
  if (span) span.textContent = label;
  const name = LABEL_ICONS[label];
  const svg = button.querySelector('svg.inv-icon');
  if (!name || !svg) return;
  const t = document.createElement('template');
  t.innerHTML = iconSvg(name);
  if (t.content.firstElementChild) svg.replaceWith(t.content.firstElementChild);
}

/** The status line: shown while loading and when something went wrong. */
export function statusHtml() {
  return `<div class="inv-status" role="status" aria-live="polite"><p class="inv-status-text">Loading…</p><button type="button" class="inv-btn" data-reload hidden>Reload</button></div>`;
}

/** Keys that alone aren't a visitor using the keyboard (a modifier held for a click). */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/**
 * Put the page's controls in the stage and report what's pressed.
 * @param {HTMLElement} stage
 * @param {{look: import('./look.js').Look, wander?: boolean, onButton(name: ButtonName): void, onLook(look: import('./look.js').Look): void, onCamera?(key: CameraKey): void, onWander?(on: boolean): void, onSheet?(open: boolean): void, onIntro?(): void}} o
 *   wander: the Wander switch's state to begin with; onCamera: a Camera pad control pressed
 *   (reset: Reset Camera); onWander: the Wander switch flipped; onSheet: the Settings sheet
 *   opened or closed (main.js keeps NEWT in sight beside it); onIntro: Replay Intro pressed
 */
export function bindUi(stage, { look, wander = true, onButton, onLook, onCamera, onWander, onSheet, onIntro }) {
  const hud = document.createElement('div');
  hud.className = 'inv-hud';
  hud.innerHTML = statusHtml() + toolbarHtml() + sheetHtml(look, ALL_STEPS, { wander });
  stage.append(hud);
  // (The buttons' hover and press fills: the ink's ordered dither.)
  installDither(hud, getComputedStyle(hud).getPropertyValue('--inv-ink').trim() || '#3a332d');
  const $ = (sel) => /** @type {HTMLElement} */ (hud.querySelector(sel));
  const sheet = $('.inv-sheet');
  const opener = $('[data-look-open]');
  const intro = /** @type {HTMLButtonElement} */ ($('[data-intro]'));
  const pad = $('.inv-camera-pad');
  const padOpener = $('[data-camera-open]');
  /** The intro is running: the toolbar rests (setTalking). */
  let talking = false;
  /** Focus goes back to Replay Intro once it's on again (the intro just ended). */
  let refocus = false;
  /** The visitor's last press was a key (not a pointer, a touch, or nothing yet). */
  let byKey = false;
  const onAnyKey = (/** @type {KeyboardEvent} */ e) => {
    if (!MODIFIERS.has(e.key)) byKey = true;
  };
  const onAnyPointer = () => {
    byKey = false;
  };
  // (On the window, so they hear a key before anything over the page takes it.)
  window.addEventListener('keydown', onAnyKey, true);
  window.addEventListener('pointerdown', onAnyPointer, true);
  /**
   * Focus moved for the visitor: its ring (and a button's label) only after a key. A scripted
   * focus() alone shows the ring in Chrome when nothing before it was a pointer's. focusVisible
   * is newer than the DOM's types.
   * @param {HTMLElement|null} el
   */
  const focusFor = (el) => el?.focus(/** @type {FocusOptions} */ ({ preventScroll: true, focusVisible: byKey }));
  /** The sheet's first and last stops for Tab. */
  const first = $('[data-look-close]');
  const last = $('[data-setting="wander"]');
  const status = $('.inv-status');
  let current = validLook(look);
  let steps = ALL_STEPS;
  const range = /** @type {HTMLInputElement} */ ($('#inv-pixel-range'));

  /** Pixel Size's slider, value, ends and line, from the current look and the screen's steps. */
  const syncPixel = () => {
    const step = stepFor(current.pixelSize, steps);
    const shown = shownPixel(current.pixelSize, steps);
    range.max = String(steps.length - 1);
    range.value = String(steps.indexOf(step));
    range.setAttribute('aria-valuetext', pixelSpoken(shown));
    $('[data-pixel-value]').textContent = pixelLabel(shown);
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
    // (Back to the step that stands for the Pixel Size picked: it stays the one picked.)
    if (step.covers.includes(current.pixelSize) && step.n !== null) return syncPixel();
    const changed = step.value !== current.pixelSize;
    current = validLook({ ...current, pixelSize: step.value });
    syncPixel();
    syncOff();
    if (changed) onLook(current);
  };

  /**
   * The Shader section from the current look: each control at its value (the style's, with
   * the user's changes) and resting where it doesn't apply, the Style row's Custom, and Reset
   * To Style.
   */
  const syncShader = () => {
    const values = shaderOf(current);
    for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (hud.querySelectorAll('input[data-shader]'))) {
      const c = /** @type {import('./shader.js').ShaderControl} */ (controlFor(input.dataset.shader ?? ''));
      const v = values[c.key];
      input.disabled = shaderRests(c, current);
      if (c.kind === 'switch') input.checked = v === true;
      else if (c.kind === 'choice') input.checked = input.value === v;
      else {
        const { shown, spoken } = shaderText(c, v);
        input.value = String(rangeValue(c, v));
        input.setAttribute('aria-valuetext', spoken);
        $(`[data-shader-value="${c.key}"]`).textContent = shown;
      }
    }
    const custom = isCustom(current);
    for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (hud.querySelectorAll('input[name="inv-style"]'))) {
      radio.checked = radio.value === 'custom' ? custom : !custom && radio.value === current.style;
      if (radio.value === 'custom') radio.disabled = !custom;
    }
    /** @type {HTMLButtonElement} */ ($('[data-shader-reset]')).disabled = !custom;
    $('[data-shader-off-hint]').hidden = current.pixelSize !== 'off';
  };
  const syncOff = () => {
    $('[data-off-hint]').hidden = current.pixelSize !== 'off';
    for (const key of ['dither', 'outlines'])
      /** @type {HTMLInputElement} */ ($(`input[data-look="${key}"]`)).disabled = current.pixelSize === 'off';
    syncShader();
  };
  syncOff();
  /** Every control from the current look (a swipe that started on a slider puts its value back). */
  const syncAll = () => {
    syncPixel();
    syncShader();
  };
  /**
   * A Shader control moved: its value is the user's own (or, back at the style's, no change),
   * at once.
   * @param {HTMLInputElement} input
   */
  const pickShader = (input) => {
    const c = controlFor(input.dataset.shader ?? '');
    if (!c || (c.kind === 'choice' && !input.checked)) return;
    const v =
      c.kind === 'switch'
        ? input.checked
        : c.kind === 'choice'
          ? input.value
          : c.steps
            ? c.steps[Math.round(Number(input.value))]
            : Number(input.value);
    const was = JSON.stringify(current.shader);
    current = validLook({ ...current, shader: { ...current.shader, [c.key]: v } });
    syncShader();
    if (JSON.stringify(current.shader) !== was) onLook(current);
  };
  /**
   * A Style picked: the preset's values, the user's Shader changes cleared (Custom is the row's
   * own, never picked); or Reset To Style (style: null).
   * @param {string|null} style
   */
  const pickStyle = (style) => {
    if (style === 'custom') return;
    current = validLook({ ...current, style: style ?? current.style, shader: {} });
    syncShader();
    onLook(current);
  };
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
  /**
   * While the Camera pad is open, on the whole document: Escape closes it and focus goes back to
   * Camera.
   * @param {KeyboardEvent} e
   */
  const onPadKey = (e) => {
    if (e.key !== 'Escape' || !sheet.hidden) return;
    e.preventDefault();
    openPad(false);
    padOpener.focus();
  };
  /** @param {boolean} open */
  const openPad = (open) => {
    if (open === !pad.hidden) return;
    pad.hidden = !open;
    padOpener.setAttribute('aria-expanded', String(open));
    if (open) document.addEventListener('keydown', onPadKey);
    else document.removeEventListener('keydown', onPadKey);
  };
  /** @param {boolean} open */
  const openSheet = (open) => {
    sheet.hidden = !open;
    if (open) openPad(false);
    // (The other buttons under the sheet: no focus, no presses, hidden from screen readers.
    // Settings stays, pressed: another press closes the sheet, as Done does.)
    for (const name of BUTTONS) /** @type {HTMLElement} */ ($(`[data-button="${name}"]`)).inert = open;
    intro.inert = open;
    padOpener.inert = open;
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
  /** A slider's value as the look's (a no-op when it's the look's already). */
  const takeRange = (/** @type {HTMLInputElement} */ input) => {
    if (input === range) pickPixel(Number(range.value));
    else if (input.dataset.shader) pickShader(input);
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
    else if (finger.intent === 'swipe') syncAll();
  });
  /** @param {PointerEvent} e */
  const fingerUp = (e) => {
    if (!finger || e.pointerId !== finger.id) return;
    const { range: input, intent } = finger;
    finger = null;
    // (Lifted without moving: a tap on the track, which sets it there. A swipe, or a finger the
    // browser took for scrolling: the look's value back.)
    if (e.type === 'pointerup' && intent !== 'swipe') takeRange(input);
    else syncAll();
  };
  hud.addEventListener('pointerup', fingerUp);
  hud.addEventListener('pointercancel', fingerUp);

  // --- A touch held still on a tool button shows its label (icons only on touch) and swallows
  // the click that follows; the bar shows no long-press menu.
  const hold = createHold();
  const now = () => performance.now() / 1000;
  /** @type {{button: HTMLElement, id: number, timer: number}|null} */
  let held = null;
  /** The button whose click to swallow, until when (performance.now(), ms). */
  let swallow = { button: /** @type {HTMLElement|null} */ (null), until: 0 };
  /** @type {Map<HTMLElement, number>} each label's timer to go again */
  const hiding = new Map();
  /** @param {HTMLElement} button @param {boolean} on */
  const showLabel = (button, on) => {
    clearTimeout(hiding.get(button));
    hiding.delete(button);
    button.classList.toggle('is-label', on);
  };
  /** @param {HTMLElement} button */
  const hideSoon = (button) => {
    clearTimeout(hiding.get(button));
    hiding.set(
      button,
      window.setTimeout(() => showLabel(button, false), 1200),
    );
  };
  const holdEnd = () => {
    if (!held) return null;
    clearTimeout(held.timer);
    const b = held.button;
    held = null;
    return b;
  };
  $('.inv-toolbar').addEventListener('pointerdown', (e) => {
    const button = /** @type {HTMLElement} */ (e.target).closest?.('.inv-tool');
    if (e.pointerType === 'mouse' || !(button instanceof HTMLButtonElement) || button.disabled) return;
    holdEnd();
    hold.down(e.clientX, e.clientY, now());
    held = {
      button,
      id: e.pointerId,
      timer: window.setTimeout(() => {
        if (held?.button === button && hold.tick(now())) showLabel(button, true);
      }, HOLD_MS + 10),
    };
  });
  $('.inv-toolbar').addEventListener('pointermove', (e) => {
    if (!held || e.pointerId !== held.id) return;
    // (Moved off its spot: no label for this press; the timer finds it moved.)
    hold.move(e.clientX, e.clientY);
  });
  $('.inv-toolbar').addEventListener('pointerup', (e) => {
    if (!held || e.pointerId !== held.id) return;
    const button = /** @type {HTMLElement} */ (holdEnd());
    if (hold.up(now()) === 'label') {
      showLabel(button, true);
      hideSoon(button);
      swallow = { button, until: performance.now() + 700 };
    }
  });
  $('.inv-toolbar').addEventListener('pointercancel', (e) => {
    if (!held || e.pointerId !== held.id) return;
    const button = holdEnd();
    hold.cancel();
    if (button?.classList.contains('is-label')) hideSoon(button);
  });
  $('.inv-toolbar').addEventListener('contextmenu', (e) => e.preventDefault());
  hud.addEventListener(
    'click',
    (e) => {
      const b = swallow.button;
      if (!b || performance.now() > swallow.until) return;
      swallow = { button: null, until: 0 };
      if (!b.contains(/** @type {Node} */ (e.target))) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  hud.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!el || !hud.contains(el)) return;
    if (el.matches('[data-look-open]')) openSheet(Boolean(sheet.hidden));
    else if (el.matches('[data-look-close]')) openSheet(false);
    else if (el.matches('[data-camera-open]')) openPad(Boolean(pad.hidden));
    else if (el.dataset.camera) onCamera?.(/** @type {CameraKey} */ (el.dataset.camera));
    else if (el.matches('[data-reload]')) location.reload();
    else if (el.matches('[data-intro]')) onIntro?.();
    else if (el.matches('[data-pixel-end]')) pickPixel(el.dataset.pixelEnd === 'first' ? 0 : steps.length - 1);
    else if (el.matches('[data-shader-reset]')) {
      pickStyle(null);
      // (The button rests now: focus goes to the style it went back to, still in the sheet,
      // without scrolling the sheet away from the Shader controls the user was at.)
      /** @type {HTMLElement|null} */ (hud.querySelector('input[name="inv-style"]:checked'))?.focus({
        preventScroll: true,
      });
    } else if (el.dataset.button) onButton(/** @type {ButtonName} */ (el.dataset.button));
  });
  // (A slider while it's dragged, not only once it's let go: each step shows as it's passed.
  // Under a finger, only once it goes along it.)
  hud.addEventListener('input', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.type === 'range' && !waiting(input)) takeRange(input);
  });
  hud.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.type === 'range') return waiting(input) ? undefined : takeRange(input);
    if (input.dataset.shader) return pickShader(input);
    if (input.dataset.setting === 'wander') return onWander?.(input.checked);
    const key = input.dataset.look;
    if (!key) return;
    if (key === 'style') return pickStyle(input.value);
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
    /**
     * Sit's label, Sit or Stand: its label and its icon (the button stays, focus and all).
     * @param {'Sit'|'Stand'} label
     */
    setSitLabel(label) {
      relabel($('[data-button="Sit"]'), label);
    },
    /**
     * Screen Time's label: what its next press does (DEVICE_LABELS), its label and its icon.
     * @param {typeof DEVICE_LABELS[number]} label
     */
    setDeviceLabel(label) {
      relabel($('[data-button="Device"]'), label);
    },
    /**
     * The Wander switch as the brain has it.
     * @param {boolean} on
     */
    setWander(on) {
      /** @type {HTMLInputElement} */ ($('[data-setting="wander"]')).checked = on;
    },
    /**
     * The action buttons on or off (off while he's held or falling; Camera and Settings stay on).
     * @param {boolean} on
     */
    setEnabled(on) {
      for (const name of BUTTONS) /** @type {HTMLButtonElement} */ ($(`[data-button="${name}"]`)).disabled = !on;
      intro.disabled = !on;
      if (on && refocus) {
        refocus = false;
        focusFor(intro);
      }
    },
    /**
     * The intro running (on): the toolbar rests out of sight and out of reach, its place kept (so
     * the view and the play area, which keep clear of it, stay as they are); off, it's back, and
     * focus goes back to Replay Intro.
     * @param {boolean} on
     */
    setTalking(on) {
      if (on === talking) return;
      talking = on;
      if (on) openPad(false);
      hud.classList.toggle('is-talking', on);
      $('.inv-toolbar').inert = on;
      // (Focus back on Replay Intro, once it's on again: the brain turns the buttons back on.)
      refocus = !on;
      if (refocus && !intro.disabled) {
        refocus = false;
        focusFor(intro);
      }
    },
    get talking() {
      return talking;
    },
    /** @param {boolean} on */
    setToolbar(on) {
      $('.inv-toolbar').hidden = !on;
    },
    get toolbar() {
      return $('.inv-toolbar');
    },
    /** Focus on the toolbar's first button that's on (the envelope skipped: the toy is free). */
    focusToolbar() {
      focusFor(/** @type {HTMLElement|null} */ ($('.inv-toolbar').querySelector('button:not(:disabled)')));
    },
    get sheetOpen() {
      return !sheet.hidden;
    },
    get padOpen() {
      return !pad.hidden;
    },
    get pad() {
      return pad;
    },
    get sheet() {
      return sheet;
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onPadKey);
      window.removeEventListener('keydown', onAnyKey, true);
      window.removeEventListener('pointerdown', onAnyPointer, true);
      hud.remove();
    },
  };
}
