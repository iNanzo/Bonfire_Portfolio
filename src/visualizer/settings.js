// Bonfire Live's settings: the values, kept in this browser (localStorage). This module is
// the store: what every setting starts as, how a saved one is read back (old saves included:
// mergeInto), saving, the presets (many settings at once, for a kind of night) and the setups
// (your own saved snapshots, which can be exported to a file and imported on another
// computer). The dialog that shows them is settingsDialog.js (its fields: settingsControls.js;
// their names, hints and places: src/settingsMap.js); main.js decides what a change does.
//
// Saving waits for the changes to settle (a slider dragged writes once, SAVE_MS after it
// stops); flushSettings() writes at once, and the page calls it as it's hidden or left.
//
// The preset scenes' loop keeps its switches here too (settings.sceneList, by ref: 'b:<id>'
// or 'm:<id>'; missing = in the loop): scenesFrom, inLoop, setInLoop.
import { DEFAULT_SETTINGS } from './director.js';
import { LAYERS, MODES, modeOf } from './looks.js';
import { FORMATIONS, SEAT_POSES, KNIGHT_STYLES } from './knightShow.js';
import { FINISHES } from '../bonfire/steel.js';
import { RANDOMIZABLE, RANDOM } from './bars.js';

export { RANDOM };

const STORE = 'bonfire-live';
const SETUPS = 'bonfire-live-setups';
/** How long saving waits for the changes to settle (ms). */
export const SAVE_MS = 300;

// The page's own settings, on top of the director's.
export const PAGE_DEFAULTS = {
  volume: 0.8,
  deviceId: '',
  beatFrom: 'music',  // music (heard) | link (an Ableton Link session, through tools/link-bridge.mjs)
  linkPort: 17001,
  view: 'simple',     // the settings dialog: simple | all
  intro: true,        // the main title card when the music starts
  cards: [],          // more title cards: [{ title, subtitle, show: drops | phrases | manual }]
  frameRate: 'display', // how often the picture is drawn: display (every frame the screen shows) | '60' | '30'
};
// Switch groups (one checkbox each): a saved group keeps only the switches that still exist.
export const GROUPS = ['elements', 'moves', 'flyMoves', 'mirrors', 'xrayViews', 'knightMoves', 'knightHelmets'];
// Groups that always keep at least one switch on.
export const AT_LEAST_ONE = new Set(['elements', 'moves', 'flyMoves', 'mirrors', 'xrayViews', 'knightMoves', 'knightHelmets']);
// Effect switches (off | mix | on): groups with one per effect, and single ones.
export const MODE_GROUPS = ['looks', 'dropFx'];
export const MODE_KEYS = new Set([
  'sparks', 'echo', 'punch', 'temperature', 'breathe', 'blackout', 'flash', 'sceneColors', ...Object.keys(LAYERS),
  'pixelShift', 'outlines', 'fewColors', 'xray', 'hitStop', 'hitFlash', 'debris', 'marks',
  'knights', 'knightDance', 'knightCam', 'knightSummon', 'knightGestures', 'knightShine', 'knightReactions', 'knightGlow',
  'scenes', 'sceneCards',
]);
// (Ember is the clean fire: taking turns, or not. "Always" would add nothing.)
export const NO_ALWAYS = { looks: ['ember'] };
export const NUMERIC = new Set([
  'sensitivity', 'offset', 'volume', 'reactivity', 'phraseBars', 'ringBars', 'cutBars', 'pixelSize', 'glitch', 'combos', 'comboBars', 'lookBars', 'flyBars', 'dropCount', 'linkPort',
  'dither', 'vignette', 'exposure', 'flameFps', 'colorChange', 'knightCount', 'danceBars', 'sceneBars', 'knightRim',
]);
// Settings with a fixed set of choices of more than one type (a number or 'random'), or
// strings read without a fallback: a saved value is kept only if it's one of them.
export const CHOICES = {
  knightCount: [1, 2, 3, 4, RANDOM],
  knightFormation: [...Object.keys(FORMATIONS), 'mix'],
  knightFinish: [...Object.keys(FINISHES), 'mix'],
  knightSeat: [...Object.keys(SEAT_POSES), 'mix'],
  knightStyle: [...Object.keys(KNIGHT_STYLES), 'mix'],
  sceneFrom: ['both', 'builtin', 'mine'],
  sceneOrder: ['turn', 'shuffle'],
  sceneHold: ['scene', 'hold', 'base'],
  frameRate: ['display', '60', '30'],
};
// What a setup (or a preset) never changes: this computer's own things.
export const LOCAL = ['deviceId', 'volume', 'view', 'frameRate'];
export const CARD_SHOWS = { drops: 'On Drops (Taking Turns)', phrases: 'Every 32 Bars', manual: 'Only When I Press Its Key' };

/** The most frames a second Frame Rate allows (0: every frame the display shows). */
export const frameCap = (rate) => (rate === '60' ? 60 : rate === '30' ? 30 : 0);

/** A scene's place in the loop, by ref: 'b:<id>' (built in) or 'm:<id>' (mine). */
const SCENE_REF = /^(b|m):[a-z0-9-]{1,48}$/;
/** The loop's switches as saved: known-shaped refs with a boolean, at most 200. */
const cleanSceneList = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([ref, on]) => SCENE_REF.test(ref) && typeof on === 'boolean').slice(0, 200))
  : {});
const cleanCards = (v) => (Array.isArray(v) ? v.filter((c) => c && typeof c.title === 'string').slice(0, 9).map((c) => ({
  title: c.title.slice(0, 60), subtitle: typeof c.subtitle === 'string' ? c.subtitle.slice(0, 90) : '', show: CARD_SHOWS[c.show] ? c.show : 'drops',
})) : []);

/**
 * How a value saved by an older version reads now, per key: the value to merge, or
 * undefined to skip the saved one (the default stands). No key has ever been renamed: these
 * are values whose meaning changed.
 * @type {Record<string, (v: any) => any>}
 */
const MIGRATIONS = {
  // Scanlines and the mirror were on/off switches before they joined the looks' mix.
  scanlines: (v) => (typeof v === 'boolean' ? (v ? 'on' : 'mix') : v),
  mirror: (v) => (typeof v === 'boolean' ? (v ? 'on' : 'mix') : v),
  // The scenery recolor's old "off" was its default, back when it only worked with made
  // palettes: it takes the new default.
  sceneColors: (v) => (v === false ? undefined : v),
};

/**
 * `saved` over `out` (in place): known keys of the right type only. Effect switches saved
 * as on/off (before they had three settings) come back as always/off; a look or drop hit
 * that was switched on comes back in the mix (as they were: taking turns, drawn at random).
 * Exported for the tests.
 */
export function mergeInto(out, saved) {
  for (let [k, v] of Object.entries(saved ?? {})) {
    if (!(k in out)) continue;
    if (Object.hasOwn(MIGRATIONS, k)) v = MIGRATIONS[k](v);
    if (v === undefined) continue;
    if (k === 'cards') out.cards = cleanCards(v);
    else if (k === 'sceneList') out.sceneList = cleanSceneList(v);
    else if (k === 'knightRim') { if (typeof v === 'number' && Number.isFinite(v)) out.knightRim = Math.min(1, Math.max(0, v)); }
    else if (GROUPS.includes(k)) mergeGroup(out[k], v);
    else if (MODE_GROUPS.includes(k)) mergeModes(out[k], v, NO_ALWAYS[k]);
    else if (MODE_KEYS.has(k)) { if (typeof v === 'boolean' || MODES.some(([id]) => id === v)) out[k] = modeOf(v); }
    else if (CHOICES[k]) { if (CHOICES[k].includes(v)) out[k] = v; }
    else if (typeof v === typeof out[k] || (v === RANDOM && RANDOMIZABLE.includes(k))) out[k] = v;
  }
  return out;
}
/** A group of switches: each one that still exists, if it was saved as one. */
function mergeGroup(into, v) {
  for (const id of Object.keys(into)) if (typeof v?.[id] === 'boolean') into[id] = v[id];
}
/** A group of effect switches: each saved as a mode (or an old on/off); Always only where there is one. */
function mergeModes(into, v, noAlways = []) {
  for (const id of Object.keys(into)) {
    if (v?.[id] === undefined) continue;
    const m = modeOf(v[id], 'mix');
    into[id] = m === 'on' && noAlways.includes(id) ? 'mix' : m;
  }
}

/** A fresh copy of every setting's default (the director's and the page's). */
export const defaults = () => structuredClone({ ...DEFAULT_SETTINGS, ...PAGE_DEFAULTS });

/** The saved settings over the defaults (the defaults if nothing's saved or storage is off). */
export function loadSettings() {
  const out = defaults();
  try { mergeInto(out, JSON.parse(localStorage.getItem(STORE) ?? '{}')); } catch { /* private mode or bad JSON: defaults */ }
  return out;
}

let unsaved = null; // the settings waiting to be written
let saveTimer = 0;
/**
 * Save the settings: SAVE_MS after the last call (a slider dragged, a burst of keys writes
 * once), or at once with `now`.
 * @param {Record<string, any>} settings @param {{ now?: boolean }} [o]
 */
export function saveSettings(settings, { now = false } = {}) {
  unsaved = settings;
  clearTimeout(saveTimer);
  if (now) flushSettings();
  else saveTimer = setTimeout(flushSettings, SAVE_MS);
}
/** Write what's waiting now (the page is hidden or going; a preset, a setup or a reset). */
export function flushSettings() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!unsaved) return;
  const settings = unsaved;
  unsaved = null;
  try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* private mode */ }
}

/** Back to the defaults, keeping the input device and the title cards. */
export function resetSettings(settings) {
  const keep = { deviceId: settings.deviceId, title: settings.title, subtitle: settings.subtitle, cards: settings.cards, view: settings.view };
  Object.assign(settings, defaults(), keep);
}

// --- presets: many settings at once, for a kind of night ------------------------------------
// (Club is the defaults, and sets back everything the others change. The preset scenes stay
// safe under Low Flash without it touching them: a scene never turns on a flashy effect the
// settings have off.)
export const PRESETS = {
  chill: {
    name: 'Chill', hint: 'Slow and warm: long-held scenes, a drifting camera, soft looks, thick fog and no flashes; one knight rests by the fire in painterly steel.',
    values: {
      // (No flashes: no negative flash, no Ink look or Ink Flash hit, no Color Cycle's palette
      // spin, which stills the Echo look's palette steps too (the director's `cycles`), no X-Ray hit.)
      reactivity: 0.8, glitch: 0.4, camera: 'drift', combos: 16, phraseBars: 32, ringBars: 0, flash: 'off', dropCount: 1,
      dropFx: { xray: 'off', ink: 'off', cycle: 'off' }, looks: { ink: 'off' }, punch: 'off', mirror: 'off', lookBars: 32, blackout: 'off',
      blend: 'mix', ghost: 'mix', glow: 'mix', gradient: 'mix', paint: 'mix', wash: 'mix', blur: 'off', flicker: 'off',
      pixelShift: 'off', xray: 'off', fewColors: 'mix', outlines: 'on', fog: 'thick', grain: 'mix', cinema: 'mix', spotlight: 'mix', chroma: 'off', hitStop: 'off', hitFlash: 'off',
      knights: 'on', knightCount: 1, knightDance: 'off', knightShine: 'on', knightReactions: 'off',
      knightStyle: 'pixel-painterly', knightFinish: 'burnished', knightGlow: 'on', knightRim: 0.7, knightSeat: 'resting',
      scenes: 'on', sceneBars: 64, sceneHold: 'hold',
    },
  },
  club: {
    name: 'Club', hint: 'The defaults: scenes come and go every 32 bars, cuts on phrases, a living weapon every 8 bars, the full drop, most switches In the Mix.',
    values: {
      reactivity: 1.2, glitch: 1, camera: 'cuts', cutBars: 2, transition: 'mix', combos: 8, phraseBars: 16, ringBars: 4, flash: 'on', dropCount: 2, dropFx: { xray: 'mix', ink: 'mix', cycle: 'mix' }, looks: { ink: 'mix' },
      punch: 'on', mirror: 'mix', scanlines: 'mix', lookBars: 16, blackout: 'on',
      blend: 'mix', ghost: 'mix', glow: 'mix', gradient: 'mix', paint: 'mix', wash: 'mix', blur: 'mix', flicker: 'mix',
      pixelShift: 'mix', xray: 'mix', fewColors: 'mix', outlines: 'mix', fog: 'light', grain: 'mix', cinema: 'mix', spotlight: 'mix', chroma: 'mix', hitStop: 'on', hitFlash: 'on',
      knights: 'mix', knightCount: 'random', knightDance: 'mix', knightShine: 'mix', knightReactions: 'mix',
      knightStyle: 'site', knightFinish: 'mix', knightGlow: 'mix', knightRim: 0.5, knightSeat: 'mix',
      scenes: 'mix', sceneBars: 32, sceneHold: 'scene',
    },
  },
  rave: {
    name: 'Rave', hint: 'Everything faster: a scene every 16 bars, cuts every bar, strong looks, x-ray flips, up to three drop hits, four knights dancing.',
    values: {
      reactivity: 1.6, glitch: 1.6, camera: 'cuts', cutBars: 1, combos: 4, phraseBars: 8, ringBars: 2, flash: 'on', dropCount: 3, punch: 'on', mirror: 'mix', scanlines: 'mix', lookBars: 8, blackout: 'on',
      blend: 'on', ghost: 'mix', glow: 'mix', gradient: 'mix', paint: 'mix', wash: 'mix', blur: 'mix', flicker: 'mix',
      pixelShift: 'on', xray: 'on', fewColors: 'mix', outlines: 'mix', fog: 'mix', grain: 'mix', cinema: 'mix', spotlight: 'mix', chroma: 'mix', hitStop: 'on', hitFlash: 'on',
      knights: 'on', knightCount: 4, knightDance: 'on', knightShine: 'on', knightReactions: 'on',
      knightStyle: 'pixel-chiaroscuro', knightFinish: 'polished', knightGlow: 'on', knightRim: 1, knightSeat: 'watchful',
      scenes: 'mix', sceneBars: 16,
    },
  },
  safe: {
    name: 'Low Flash', hint: 'No negative or hit flashes, blackouts, flicker, x-ray flips, ink flashes, palette spins or armor sweeps. For sensitive rooms and big screens.',
    values: {
      flash: 'off', blackout: 'off', flicker: 'off', glitch: 0.5, punch: 'off', dropCount: 1, dropFx: { xray: 'off', ink: 'off', cycle: 'off' }, looks: { ink: 'off' }, cutBars: 4, transition: 'glide',
      xray: 'off', pixelShift: 'off', fewColors: 'off', hitFlash: 'off', knightShine: 'off',
    },
  },
};
/** Apply a preset's values (the device, volume, frame rate and the dialog's view are kept). */
export function applyPreset(settings, id) {
  const p = PRESETS[id];
  if (p) mergeInto(settings, p.values);
}
/** A preset's value is what the settings hold (a switch group's switch by switch: a preset sets only some). */
const holds = (settings, k, v) => (MODE_GROUPS.includes(k) && v && typeof v === 'object'
  ? Object.entries(v).every(([id, m]) => modeOf(settings[k]?.[id], 'mix') === m)
  : settings[k] === v);
/** The preset the settings are on right now (every one of its values as it set them), or null. */
export function presetOf(settings) {
  const on = Object.entries(PRESETS).find(([, p]) => Object.entries(p.values).every(([k, v]) => holds(settings, k, v)));
  return on ? on[0] : null;
}

// --- setups: your own saved snapshots ------------------------------------------------------
/** The setups saved in this browser: { name: settings }. */
export function readSetups() {
  try { const v = JSON.parse(localStorage.getItem(SETUPS) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function writeSetups(all) { try { localStorage.setItem(SETUPS, JSON.stringify(all)); } catch { /* private mode */ } }
/** The settings as a setup keeps them: everything but this computer's own (LOCAL). */
export const snapshot = (settings) => Object.fromEntries(Object.entries(structuredClone(settings)).filter(([k]) => !LOCAL.includes(k)));
/** Save the settings as they are under `name` (a blank one is numbered); returns the name kept. */
export function saveSetup(settings, name) {
  const all = readSetups();
  const kept = (name.trim() || `Setup ${Object.keys(all).length + 1}`).slice(0, 40);
  writeSetups({ ...all, [kept]: snapshot(settings) });
  return kept;
}
/**
 * Load the setup `name` into the settings: the keys it set, or null if there's none by that
 * name. (This computer's own stay as they are, even if an imported file carries them.)
 */
export function loadSetup(settings, name) {
  const saved = readSetups()[name];
  if (!saved || typeof saved !== 'object') return null;
  const values = Object.fromEntries(Object.entries(saved).filter(([k]) => !LOCAL.includes(k)));
  mergeInto(settings, values);
  return Object.keys(values);
}
export function deleteSetup(name) {
  const all = readSetups();
  delete all[name];
  writeSetups(all);
}
/** Every saved setup as an export file's text. */
export const exportSetups = () => JSON.stringify({ app: 'bonfire-live', setups: readSetups() }, null, 2);
/**
 * An exported file's setups added to this browser's (one by the same name replaced): how
 * many it held. Throws if the text isn't JSON. Names are kept as text (shown escaped).
 * @param {string} text
 */
export function importSetups(text) {
  const incoming = JSON.parse(text);
  const all = readSetups();
  let n = 0;
  for (const [name, values] of Object.entries(incoming?.setups ?? {})) {
    if (typeof name === 'string' && values && typeof values === 'object' && !Array.isArray(values)) { all[name.slice(0, 40)] = values; n++; }
  }
  writeSetups(all);
  return n;
}

// --- the preset scenes' loop ------------------------------------------------------------------
/**
 * The library as the loop has it: Scenes From (settings.sceneFrom) picks whose scenes.
 * @template {{ ref: string }} T
 * @param {T[]} library
 * @param {Record<string, any>} settings
 * @returns {T[]}
 */
export const scenesFrom = (library, settings) => library.filter(({ ref }) => (
  settings.sceneFrom === 'builtin' ? ref.startsWith('b:') : settings.sceneFrom === 'mine' ? ref.startsWith('m:') : true));

/** Is this scene in the loop (settings.sceneList: only the ones left out are kept)? */
export const inLoop = (settings, ref) => settings.sceneList?.[ref] !== false;

/** Put a scene in the loop or take it out (in is the default: nothing is kept for it). */
export function setInLoop(settings, ref, on) {
  if (on) delete settings.sceneList[ref];
  else settings.sceneList[ref] = false;
}
