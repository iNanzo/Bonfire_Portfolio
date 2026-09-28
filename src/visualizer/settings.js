// Bonfire Live's settings: kept in this browser (localStorage) and shown in the settings
// dialog. This module owns the values, their storage and the dialog; main.js decides
// what a change does (bindSettings' onChange).
import { esc } from '../html.js';
import { elements } from '../elements.js';
import { MOVES } from '../bonfire/bladeMotion.js';
import { DEFAULT_SETTINGS } from './director.js';
import { SHOTS, SWING_CAMS, HOLD_CAMS, TRANSITIONS } from './camera.js';
import { LOOKS, DROP_FX, MIRRORS, MODIFIER_MODES } from './looks.js';
import { FLY_MOVES } from './fireflyMoves.js';
import { COLOR_MODES, COLOR_SCHEMES } from './colors.js';

const STORE = 'bonfire-live';
// The page's own settings, on top of the director's.
const PAGE_DEFAULTS = { volume: 0.8, deviceId: '' };
// Switch groups (one checkbox each): a saved group keeps only the switches that still exist.
const GROUPS = ['elements', 'looks', 'moves', 'flyMoves', 'dropFx', 'mirrors'];
// Groups that always keep at least one switch on.
const AT_LEAST_ONE = new Set(['elements', 'looks', 'moves', 'flyMoves', 'mirrors']);
const NUMERIC = new Set(['sensitivity', 'offset', 'volume', 'reactivity', 'phraseBars', 'ringBars', 'cutBars', 'pixelSize', 'glitch', 'combos', 'comboBars', 'lookBars', 'flyBars', 'dropCount']);

/** The saved settings over the defaults (the defaults if nothing's saved or storage is off). */
export function loadSettings() {
  const out = structuredClone({ ...DEFAULT_SETTINGS, ...PAGE_DEFAULTS });
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    for (let [k, v] of Object.entries(saved)) {
      if (!(k in out)) continue;
      // (Scanlines and the mirror were on/off switches before they joined the looks' mix.)
      if ((k === 'scanlines' || k === 'mirror') && typeof v === 'boolean') v = v ? 'on' : 'mix';
      if (GROUPS.includes(k)) { for (const id of Object.keys(out[k])) if (typeof v?.[id] === 'boolean') out[k][id] = v[id]; }
      else if (typeof v === typeof out[k]) out[k] = v;
    }
  } catch { /* private mode or bad JSON: defaults */ }
  return out;
}

export function saveSettings(settings) {
  try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* private mode */ }
}

/** Back to the defaults, keeping the input device and the title card. */
export function resetSettings(settings) {
  const keep = { deviceId: settings.deviceId, title: settings.title, subtitle: settings.subtitle };
  Object.assign(settings, structuredClone({ ...DEFAULT_SETTINGS, ...PAGE_DEFAULTS }), keep);
}

// --- the dialog ---------------------------------------------------------------------------
const corners = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>';
const range = (key, label, min, max, step, help, unit = '') => `
  <label class="viz-field">
    <span class="viz-field-label">${label} <output data-out="${key}"></output>${unit ? `<span class="viz-unit">${unit}</span>` : ''}</span>
    <input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}">
    ${help ? `<span class="viz-help">${help}</span>` : ''}
  </label>`;
const check = (key, label) => `<label class="viz-check"><input type="checkbox" data-set="${key}"><span>${label}</span></label>`;
/** A row of checkboxes, one per entry of `names` ({ id: label }), for settings[group]. */
const checks = (group, label, names) => `
  <p class="viz-field-label">${label}</p>
  <div class="viz-checks">${Object.entries(names).map(([id, name]) => check(`${group}.${id}`, esc(name))).join('')}</div>`;
const options = (names, first = null) => [...(first ? [first] : []), ...Object.entries(names)];
const select = (key, label, opts) => `
  <label class="viz-field">
    <span class="viz-field-label">${label}</span>
    <select data-set="${key}">${opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>
  </label>`;

/** The settings dialog. `keys`: [key, what it does] pairs for its list of keys. */
export function settingsMarkup(settings, keys) {
  return `
  <dialog class="rest-menu viz-settings" data-settings aria-labelledby="viz-settings-title">
    <form method="dialog" class="rest-menu-inner frame viz-settings-inner">
      ${corners}
      <p class="rest-menu-title" id="viz-settings-title">Settings</p>
      <p class="rest-menu-flavor">Tend the fire to the room. Changes apply at once and stay in this browser.</p>
      <div class="viz-settings-grid">
        <fieldset>
          <legend>Sound</legend>
          <p class="viz-source-line"><span data-source-name>No source</span>
            <button class="pix-btn" type="button" data-act="change-source">Change</button></p>
          ${range('sensitivity', 'Sensitivity', 0.5, 2, 0.05, 'Higher catches softer kicks and hats.', '×')}
          ${range('offset', 'Visual Lead', -100, 200, 5, 'Beats show this early, to make up for projector and display lag.', 'ms')}
          <div data-volume-row>${range('volume', 'Playback Volume', 0, 1, 0.05, '', '')}</div>
        </fieldset>
        <fieldset>
          <legend>Reaction</legend>
          ${range('reactivity', 'Reactivity', 0, 2, 0.05, 'How hard the fire answers the music.', '×')}
          ${select('particles', 'Particles', [['normal', 'As on the site'], ['more', 'More'], ['max', 'Most (a strong GPU)']])}
          ${check('sparks', 'Hi-hats throw sparks')}
        </fieldset>
        <fieldset>
          <legend>Weapons</legend>
          ${check('autoDrops', 'Forge in breakdowns, strike on the drop')}
          ${select('phraseBars', 'New Weapon Every', [['0', 'Only on drops'], ['8', '8 bars'], ['16', '16 bars'], ['32', '32 bars'], ['64', '64 bars']])}
          ${select('ringBars', 'Extra Ring Every', [['0', 'Never'], ['1', 'Bar'], ['2', '2 bars'], ['4', '4 bars'], ['8', '8 bars']])}
          ${check('echo', 'The blade’s silhouette echoes out on the bar')}
          ${checks('elements', 'Elements', Object.fromEntries(Object.keys(settings.elements).map((id) => [id, elements[id]?.name ?? id])))}
        </fieldset>
        <fieldset>
          <legend>Living Blade</legend>
          ${select('combos', 'Leaves the Fire', [['-1', 'Never'], ['0', 'After drops'], ['16', 'Every 16 bars'], ['8', 'Every 8 bars'], ['4', 'Every 4 bars']])}
          ${select('comboBars', 'For', [['0', '1, 2 or 4 bars (random)'], ['1', '1 bar'], ['2', '2 bars'], ['4', '4 bars']])}
          ${checks('moves', 'Moves', MOVES)}
          ${select('rhythm', 'Rhythm', [['varied', 'Varied (rests, doubles)'], ['beats', 'Every beat']])}
          ${check('alive', 'Alive: twirls, flips, a shudder on hard beats, a held blade’s sway')}
        </fieldset>
        <fieldset>
          <legend>Colors</legend>
          ${select('colors', 'New Colors', options(COLOR_MODES))}
          ${select('scheme', 'Harmony', options(COLOR_SCHEMES))}
          ${check('sceneColors', 'Recolor the scenery with made palettes')}
          <p class="viz-help">Made palettes come from the admin’s palette generator: harmonious in the scheme picked, or fully random. <kbd>P</kbd> switches modes live.</p>
        </fieldset>
        <fieldset>
          <legend>Fireflies</legend>
          ${check('blink', 'Blink and move on the beat')}
          ${checks('flyMoves', 'Moves', FLY_MOVES)}
          ${select('flyBars', 'New Move Every', [['4', '4 bars'], ['8', '8 bars'], ['16', '16 bars'], ['32', '32 bars']])}
        </fieldset>
        <fieldset>
          <legend>Camera</legend>
          ${select('camera', 'Camera', [['still', 'Still'], ['drift', 'Slow drift'], ['cuts', 'Drift and cut on phrases']])}
          ${select('cutBars', 'Cut Every', [['1', 'Bar'], ['2', '2 bars'], ['4', '4 bars'], ['8', '8 bars'], ['16', '16 bars']])}
          ${select('transition', 'Between Shots', options(TRANSITIONS, ['mix', 'A mix']))}
          ${select('swingCam', 'The Blade Out', options(SWING_CAMS, ['mix', 'A mix, changing mid-move']))}
          ${select('holdCam', 'A Held Blade', options(HOLD_CAMS, ['mix', 'A mix']))}
          ${check('punch', 'Zoom punch on kicks, shake on the big hits')}
          ${select('shot', 'Shot', Object.entries(SHOTS).map(([k, s]) => [k, s.name]))}
          ${select('pixelSize', 'Pixel Size', [['2', '2 px (fine)'], ['3', '3 px'], ['4', '4 px (the site)'], ['6', '6 px (chunky)'], ['8', '8 px']])}
        </fieldset>
        <fieldset>
          <legend>Rave FX</legend>
          ${range('glitch', 'Effects', 0, 2, 0.05, 'How strong the looks are. They take turns: a new one every few bars and after each drop.', '×')}
          ${checks('looks', 'Looks', LOOKS)}
          ${select('lookBars', 'New Look Every', [['0', 'Only after drops'], ['8', '8 bars'], ['16', '16 bars'], ['32', '32 bars']])}
          ${select('scanlines', 'Scanlines', MODIFIER_MODES)}
          ${select('mirror', 'Mirror', MODIFIER_MODES)}
          ${checks('mirrors', 'Mirror Kinds', MIRRORS)}
          ${check('flash', 'Negative flash on drops (at most one every 2 seconds)')}
          ${checks('dropFx', 'Drop Hits', DROP_FX)}
          ${select('dropCount', 'Per Drop', [['1', 'One'], ['2', 'Up to two'], ['3', 'Up to three']])}
        </fieldset>
        <fieldset class="viz-span">
          <legend>Title Card</legend>
          <div class="viz-title-fields">
            <label class="viz-field"><span class="viz-field-label">Title</span><input type="text" data-set="title" maxlength="60" placeholder="DJ name or set title" autocomplete="off"></label>
            <label class="viz-field"><span class="viz-field-label">Subtitle</span><input type="text" data-set="subtitle" maxlength="90" placeholder="Venue, date, anything" autocomplete="off"></label>
          </div>
          <div class="viz-row">
            ${check('titleOnDrop', 'Show it on drops and when the music starts')}
            <button class="pix-btn" type="button" data-act="show-title">Show Now</button>
          </div>
        </fieldset>
      </div>
      <details class="viz-keys">
        <summary>Keys</summary>
        <dl>${keys.map(([k, v]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </details>
      <div class="viz-row viz-settings-foot">
        <button class="pix-btn" type="button" data-act="reset-settings">Reset to Defaults</button>
        <button class="pix-btn" value="close">Close</button>
      </div>
    </form>
  </dialog>`;
}

/**
 * Wire the dialog to `settings`: an input writes its value straight through (numbers as
 * numbers; a group keeps at least one switch on), then calls `onChange`. A click on the
 * backdrop closes it. Returns { fill (show the current values), open }.
 */
export function bindSettings(dialog, settings, { onChange }) {
  const getPath = (key) => key.split('.').reduce((o, k) => o?.[k], settings);
  function setPath(key, value) {
    const parts = key.split('.');
    const last = parts.pop();
    parts.reduce((o, k) => o[k], settings)[last] = value;
  }
  function showOutput(key) {
    const out = dialog.querySelector(`[data-out="${key}"]`);
    if (!out) return;
    const v = getPath(key);
    out.textContent = key === 'offset' ? String(v) : key === 'volume' ? `${Math.round(v * 100)}%` : Number(v).toFixed(2);
  }
  function fill() {
    for (const el of dialog.querySelectorAll('[data-set]')) {
      const v = getPath(el.dataset.set);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = String(v);
      showOutput(el.dataset.set);
    }
  }
  dialog.addEventListener('input', (e) => {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    const key = el.dataset.set;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (NUMERIC.has(key)) v = Number(v);
    const group = key.split('.')[0];
    if (AT_LEAST_ONE.has(group) && key.includes('.') && !v && Object.values(settings[group]).filter(Boolean).length <= 1) { el.checked = true; return; }
    setPath(key, v);
    showOutput(key);
    onChange();
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  fill();
  return {
    fill,
    open() { fill(); dialog.showModal(); },
  };
}
