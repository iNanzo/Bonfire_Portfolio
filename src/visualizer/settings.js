// Bonfire Live's settings: kept in this browser (localStorage) and shown in the settings
// dialog. This module owns the values, their storage and the dialog; main.js decides
// what a change does (bindSettings' onChange).
//
// The dialog is in tabs (Sound, Show, Blade, Look, Render, Effects, Scenes, Camera,
// Fireflies, Knights, Title Cards, Setups). "Simple" shows the settings that matter most;
// "All settings" shows every one (the rest carry `adv`). Every setting has a hint: hover its
// "?" (or tab to the setting) to read what it does. Every effect has a three-way switch: off,
// in the mix (it comes and goes), always. Presets set many at once for a kind of night; setups
// are your own saved snapshots (and can be exported to a file and imported on another computer).
//
// The Scenes tab is the preset scenes' loop (the director's scene loop and player): how
// often they change and how they hold, and the loop itself, a list drawn from the library
// main.js hands over (the site's built-in scenes and this browser's own from the Painter),
// each with a checkbox that keeps it in or out (settings.sceneList, by ref: 'b:<id>' or
// 'm:<id>'; missing = in), Play Now and Edit in Painter.
import { esc, corners } from '../html.js';
import { elements } from '../elements.js';
import { MOVES } from '../bonfire/bladeMotion.js';
import { DEFAULT_SETTINGS } from './director.js';
import { SHOTS, SWING_CAMS, HOLD_CAMS, TRANSITIONS } from './camera.js';
import { SWING_EASES } from './cameraEase.js';
import { LOOKS, DROP_FX, LAYERS, MIRRORS, MODES, modeOf } from './looks.js';
import { FLY_MOVES } from './fireflyMoves.js';
import { COLOR_MODES, COLOR_SCHEMES } from './colors.js';
import { RANDOMIZABLE, RANDOM } from './bars.js';
import { range, check, checks, options, barOptions, select, mode, modeGrid, text } from '../ui/fields.js';
import { PALETTES, FOGS, FLAME_FPS, PIXEL_SIZES, XRAY_VIEWS } from './render.js';
import { KNIGHT_MOVES, HELMETS, FORMATIONS, SEAT_POSES, KNIGHT_STYLES } from './knightShow.js';
import { FINISHES, FINISH_NAMES } from '../bonfire/steel.js';
import { STYLE_KEYS, STYLE_NAMES, STYLES } from '../bonfire/knightStyles.js';
import { SCENERIES } from '../bonfire/scenery.js';
import { sceneSwatches, sceneSummary } from '../scenes.js';

const STORE = 'bonfire-live';
const SETUPS = 'bonfire-live-setups';
// The page's own settings, on top of the director's.
const PAGE_DEFAULTS = {
  volume: 0.8,
  deviceId: '',
  beatFrom: 'music',  // music (heard) | link (an Ableton Link session, through tools/link-bridge.mjs)
  linkPort: 17001,
  view: 'simple',     // the settings dialog: simple | all
  intro: true,        // the main title card when the music starts
  cards: [],          // more title cards: [{ title, subtitle, show: drops | phrases | manual }]
};
// Switch groups (one checkbox each): a saved group keeps only the switches that still exist.
const GROUPS = ['elements', 'moves', 'flyMoves', 'mirrors', 'xrayViews', 'knightMoves', 'knightHelmets'];
// Groups that always keep at least one switch on.
const AT_LEAST_ONE = new Set(['elements', 'moves', 'flyMoves', 'mirrors', 'xrayViews', 'knightMoves', 'knightHelmets']);
// Effect switches (off | mix | on): groups with one per effect, and single ones.
const MODE_GROUPS = ['looks', 'dropFx'];
const MODE_KEYS = new Set([
  'sparks', 'echo', 'punch', 'temperature', 'breathe', 'blackout', 'flash', 'sceneColors', ...Object.keys(LAYERS),
  'pixelShift', 'outlines', 'fewColors', 'xray', 'hitStop', 'hitFlash', 'debris', 'marks',
  'knights', 'knightDance', 'knightCam', 'knightSummon', 'knightGestures', 'knightShine', 'knightReactions', 'knightGlow',
  'scenes', 'sceneCards',
]);
// (Ember is the clean fire: taking turns, or not. "Always" would add nothing.)
const NO_ALWAYS = { looks: ['ember'] };
const NUMERIC = new Set([
  'sensitivity', 'offset', 'volume', 'reactivity', 'phraseBars', 'ringBars', 'cutBars', 'pixelSize', 'glitch', 'combos', 'comboBars', 'lookBars', 'flyBars', 'dropCount', 'linkPort',
  'dither', 'vignette', 'exposure', 'flameFps', 'colorChange', 'knightCount', 'danceBars', 'sceneBars', 'knightRim',
]);
// Settings with a fixed set of choices of more than one type (a number or 'random'), or
// strings read without a fallback: a saved value is kept only if it's one of them.
const CHOICES = {
  knightCount: [1, 2, 3, 4, RANDOM],
  knightFormation: [...Object.keys(FORMATIONS), 'mix'],
  knightFinish: [...Object.keys(FINISHES), 'mix'],
  knightSeat: [...Object.keys(SEAT_POSES), 'mix'],
  knightStyle: [...Object.keys(KNIGHT_STYLES), 'mix'],
  sceneFrom: ['both', 'builtin', 'mine'],
  sceneOrder: ['turn', 'shuffle'],
  sceneHold: ['scene', 'hold', 'base'],
};
// What a setup (or a preset) never changes: this computer's own things.
const LOCAL = ['deviceId', 'volume', 'view'];
export const CARD_SHOWS = { drops: 'On drops (taking turns)', phrases: 'Every 32 bars', manual: 'Only when I press its key' };

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
 * `saved` over `out` (in place): known keys of the right type only. Effect switches saved
 * as on/off (before they had three settings) come back as always/off; a look or drop hit
 * that was switched on comes back in the mix (as they were: taking turns, drawn at random).
 * Exported for the tests.
 */
export function mergeInto(out, saved) {
  for (let [k, v] of Object.entries(saved ?? {})) {
    if (!(k in out)) continue;
    // (Scanlines and the mirror were on/off switches before they joined the looks' mix.
    // The scenery recolor's old "off" was its default, back when it only worked with made
    // palettes: it takes the new default.)
    if ((k === 'scanlines' || k === 'mirror') && typeof v === 'boolean') v = v ? 'on' : 'mix';
    if (k === 'sceneColors' && v === false) continue;
    if (k === 'cards') out.cards = cleanCards(v);
    else if (k === 'sceneList') out.sceneList = cleanSceneList(v);
    else if (k === 'knightRim') { if (typeof v === 'number' && Number.isFinite(v)) out.knightRim = Math.min(1, Math.max(0, v)); }
    else if (GROUPS.includes(k)) { for (const id of Object.keys(out[k])) if (typeof v?.[id] === 'boolean') out[k][id] = v[id]; }
    else if (MODE_GROUPS.includes(k)) {
      for (const id of Object.keys(out[k])) {
        if (v?.[id] === undefined) continue;
        const m = modeOf(v[id], 'mix');
        out[k][id] = m === 'on' && NO_ALWAYS[k]?.includes(id) ? 'mix' : m;
      }
    } else if (MODE_KEYS.has(k)) { if (typeof v === 'boolean' || MODES.some(([id]) => id === v)) out[k] = modeOf(v); }
    else if (CHOICES[k]) { if (CHOICES[k].includes(v)) out[k] = v; }
    else if (typeof v === typeof out[k] || (v === RANDOM && RANDOMIZABLE.includes(k))) out[k] = v;
  }
  return out;
}
/** A fresh copy of every setting's default (the director's and the page's). */
export const defaults = () => structuredClone({ ...DEFAULT_SETTINGS, ...PAGE_DEFAULTS });

/** The saved settings over the defaults (the defaults if nothing's saved or storage is off). */
export function loadSettings() {
  const out = defaults();
  try { mergeInto(out, JSON.parse(localStorage.getItem(STORE) ?? '{}')); } catch { /* private mode or bad JSON: defaults */ }
  return out;
}

export function saveSettings(settings) {
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
    name: 'Chill', hint: 'Slow and warm: each preset scene held for 64 bars, drifting camera, soft looks and layers (glow, ghosting, paint), thick fog, no flashes (negative, 1-bit ink, or a color cycle: the Echo look’s palette steps stay still too), freezes or x-ray flips, one knight resting by the fire in painterly burnished steel, his edges always catching the firelight, unbothered by the blade. Lounges, warm-ups, long sets.',
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
    name: 'Club', hint: 'The default balance: preset scenes coming and going every 32 bars, cuts on phrases, a swing every 8 bars, the full drop, every layer and most render switches in the mix, knights coming and going and dancing at the right moments, their style, steel and edge glow rolled now and then.',
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
    name: 'Rave', hint: 'Everything, faster: a new preset scene every 16 bars, cuts every bar, a swing every 4, strong looks, new blend modes every look, pixel shifts and x-ray flips every look, up to three drop hits, and four watchful knights in hard chiaroscuro and polished steel dancing whenever the groove is locked, their armor always flashing with the fire.',
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
    name: 'Low Flash', hint: 'For sensitive rooms and big screens: no negative flashes, blackouts, flicker, hit flashes, x-ray flips (the drop’s X-Ray hit too), 1-bit ink flashes (the Ink look and the drop’s Ink Flash), palette swaps (the drop’s Color Cycle, and the Echo look’s palette steps and spins) or light sweeping over the knights’ armor; gentle looks, glides between shots.',
    values: {
      flash: 'off', blackout: 'off', flicker: 'off', glitch: 0.5, punch: 'off', dropCount: 1, dropFx: { xray: 'off', ink: 'off', cycle: 'off' }, looks: { ink: 'off' }, cutBars: 4, transition: 'glide',
      xray: 'off', pixelShift: 'off', fewColors: 'off', hitFlash: 'off', knightShine: 'off',
    },
  },
};
/** Apply a preset's values (the device, volume and the dialog's view are kept). */
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
/** The presets as a row of buttons (the settings dialog's top, the start screen). */
export const presetButtons = (cls = '') => Object.entries(PRESETS).map(([id, p]) => `<button class="pix-btn viz-preset ${cls}" type="button" data-preset="${id}" aria-pressed="false" title="${esc(p.hint)}"><b>${esc(p.name)}</b><span>${esc(p.hint)}</span></button>`).join('');
/** Mark the preset in use (aria-pressed) on every preset button under `root`. */
export function markPreset(root, settings) {
  const on = presetOf(settings);
  for (const b of root.querySelectorAll('[data-preset]')) b.setAttribute('aria-pressed', String(b.dataset.preset === on));
}

// --- setups: your own saved snapshots ------------------------------------------------------
function readSetups() {
  try { const v = JSON.parse(localStorage.getItem(SETUPS) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function writeSetups(all) { try { localStorage.setItem(SETUPS, JSON.stringify(all)); } catch { /* private mode */ } }
const snapshot = (settings) => Object.fromEntries(Object.entries(structuredClone(settings)).filter(([k]) => !LOCAL.includes(k)));

// --- the dialog ---------------------------------------------------------------------------
// (The fields themselves, "?" hints and all, are src/ui/fields.js: the Painter draws the same.)
const LAYER_HINTS = {
  scanlines: 'CRT-style lines over the picture: dark, light or contrast lines.',
  mirror: 'The picture folded onto itself (the kinds below). M switches live.',
  blend: 'The layers blend in new ways each look: echoes in screen or difference, ink in overlay, a kaleidoscope ghosted over the plain picture… Off: each keeps its classic way.',
  ghost: 'Everything that moves leaves a fading trail.',
  blur: 'The camera’s moves smear the picture: whips, shakes and zoom punches.',
  glow: 'Light spills from the bright parts, swelling on the kicks.',
  gradient: 'The picture recolored by brightness through three palette colors (the fire’s, the stone’s, or any three).',
  paint: 'The picture repainted in brush strokes, their size and direction new each time.',
  wash: 'The picture washed into flat watercolor patches, pigment pooling at the edges.',
  flicker: 'The light dips on the beat, a dark band rolls down, film jitters, or it wavers like a candle. Kept faint; off with the Low Flash preset.',
  grain: 'Film grain over the picture, its amount new each time; sometimes it swells on the kicks.',
  cinema: 'Black bars slide in top and bottom for a widescreen frame, their height new each time.',
  spotlight: 'A dithered circle of light round the fire, the rest dark, breathing wider with the music and the kicks.',
  chroma: 'The red and blue drift a pixel or two apart, like a cheap lens, kicked wider on the beat.',
};
// Hints of their own for a few looks and drop hits (the rest read their grid's).
const LOOK_HINTS = {
  echo: 'The last frame echoes out of the fire like a tunnel (or falls into it); on downbeats the flame’s colors step round its palette, and big hits spin them, unless Color Cycle (Drop Hits) is Off: then the echo plays with its colors still.',
};
const DROP_HINTS = {
  cycle: 'The flame’s colors spin round its palette for a moment. Off: no palette cycling at all, the Echo look’s downbeat color steps and spins too (Low Flash and Chill), and a scene can’t bring it back.',
};
/**
 * A group's switches as a modeGrid's items: [`group.id`, name, its own hint if it has one].
 * @param {string} group @param {Record<string, string>} names @param {Record<string, string>} [hints]
 * @returns {[string, string, string?][]}
 */
const effectItems = (group, names, hints = {}) =>Object.entries(names).map(([id, name]) => [`${group}.${id}`, name, hints[id]]);
const PIXEL_NOTES = { 2: ' (fine)', 4: ' (the site)', 6: ' (chunky)' };
// The flame's frame rates, with the site's own among them.
const FLAME_FPS_OPTIONS = [...new Set([...FLAME_FPS, DEFAULT_SETTINGS.flameFps])].sort((a, b) => a - b)
  .map((fps) => [String(fps), `${fps} fps${fps === DEFAULT_SETTINGS.flameFps ? ' (as on the site)' : fps < 12 ? ' (choppy)' : fps >= 60 ? ' (smooth)' : ''}`]);

const TABS = [
  ['sound', 'Sound'], ['show', 'Show'], ['blade', 'Blade'], ['look', 'Look'], ['render', 'Render'], ['effects', 'Effects'],
  ['scenes', 'Scenes'], ['camera', 'Camera'], ['flies', 'Fireflies'], ['knights', 'Knights'], ['titles', 'Title Cards'], ['setups', 'My Setups'],
];
// The knights' three-way switches, each worded for what it does.
const switchOf = (off, mix, on) => [['off', off], ['mix', mix], ['on', on]];

// The knights' style and steel: one for the whole cast (the steel ramp is per frame).
const STYLE_HINT = `How the knights are drawn, one style for them all. The Site’s Own: as the portfolio draws him. ${STYLE_KEYS.map((k) => `${STYLE_NAMES[k]}: ${STYLES[k].hint}`).join(' ')} In the mix: a new one at the hidden moments (the music starting, a big drop’s flash, a new scene).`;
const FINISH_HINT = 'The color of their steel, one for the whole cast: Gunmetal (a cool mid grey, his own), Blackened (darker, mostly its reflections), Polished Steel (bright, a mirror sheen) or Burnished (warm browned steel). In the mix: rolled at the hidden moments, gunmetal most often. (Black & Gold and First Build wear colors of their own.)';

/**
 * The settings dialog. `keys`: [key, what it does] pairs for its list of keys; `base`: the
 * site's base URL (the Painter's links).
 */
export function settingsMarkup(settings, keys, { base = '/' } = {}) {
  const painter = `${base}painter/`;
  const panel = (id, inner) => `<div class="viz-tab-panel" role="tabpanel" id="viz-tab-${id}" aria-labelledby="viz-tabbtn-${id}" data-tab-panel="${id}" hidden><div class="viz-settings-grid">${inner}</div></div>`;
  return `
  <dialog class="rest-menu viz-settings" data-settings aria-labelledby="viz-settings-title">
    <form method="dialog" class="rest-menu-inner frame viz-settings-inner" data-view="simple">
      ${corners}
      <div class="viz-settings-head">
        <div>
          <p class="rest-menu-title" id="viz-settings-title">Settings</p>
          <p class="rest-menu-flavor">Tend the fire to the room. Changes apply at once and stay in this browser.</p>
        </div>
        <div class="viz-view-switch" role="radiogroup" aria-label="How many settings to show">
          <label><input type="radio" name="viz-view" value="simple" data-view-pick> Simple</label>
          <label><input type="radio" name="viz-view" value="all" data-view-pick> All settings</label>
        </div>
      </div>
      <div class="viz-presets viz-presets-top" role="group" aria-label="Presets: a kind of night in one click">
        ${presetButtons()}
      </div>
      <div class="viz-tabs" role="tablist" aria-label="Settings sections">
        ${TABS.map(([id, name], i) => `<button type="button" role="tab" class="viz-tab" id="viz-tabbtn-${id}" aria-controls="viz-tab-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${id}">${esc(name)}</button>`).join('')}
      </div>

      ${panel('sound', `
        <fieldset>
          <legend>Source</legend>
          <p class="viz-source-line"><span data-source-name>No source</span>
            <button class="pix-btn" type="button" data-act="change-source">Change</button></p>
          ${range('sensitivity', 'Sensitivity', 0.5, 2, 0.05, { unit: '×', hint: 'How easily a sound counts as a kick or a hi-hat. Raise it for quiet or muddy sound, lower it if the fire reacts to everything.' })}
          ${range('offset', 'Visual Lead', -100, 200, 5, { unit: 'ms', hint: 'Shows each beat this much early, to make up for the lag of projectors, TVs and Bluetooth speakers. If the fire hits after the kick you hear, raise it.' })}
          <div data-volume-row>${range('volume', 'Playback Volume', 0, 1, 0.05, { hint: 'The volume of a file or the demo track through this computer. Doesn’t change what the fire hears.' })}</div>
        </fieldset>
        <fieldset>
          <legend>Beat</legend>
          ${select('beatFrom', 'Beat From', [['music', 'The music (heard)'], ['link', 'Ableton Link (a helper app)']], { hint: 'Where the beat grid comes from. The music: worked out from what the fire hears. Ableton Link: exactly in time with djay, rekordbox, Live or Traktor on the same network, through the Link bridge (see below).' })}
          <p class="viz-help" data-link-status></p>
          <details class="viz-link-help" data-adv>
            <summary>Setting up Ableton Link</summary>
            <ol>
              <li>Get <a href="https://github.com/Deep-Symmetry/carabiner/releases" target="_blank" rel="noopener noreferrer">Carabiner</a> (free) for this computer and start it.</li>
              <li>Turn Link on in your DJ software.</li>
              <li>Run the bridge from this project: <code>npm run link</code>.</li>
              <li>Pick Ableton Link above. The BPM in the controls turns to “Link”.</li>
            </ol>
          </details>
          ${range('linkPort', 'Bridge Port', 1024, 65535, 1, { hint: 'The port the Link bridge listens on (17001 unless you started it with --port).', adv: true })}
        </fieldset>
        <fieldset class="viz-span">
          <legend>MIDI Controller</legend>
          <p class="viz-help">Play the moments from a pad controller: connect it, press Learn beside an action, then the pad. The mapping stays with this computer.</p>
          <div class="viz-row"><button class="pix-btn" type="button" data-midi-connect>Connect MIDI</button><span class="viz-help" data-midi-status></span></div>
          <ul class="viz-midi" role="list" data-midi-list></ul>
        </fieldset>`)}

      ${panel('show', `
        <fieldset>
          <legend>Reaction</legend>
          ${range('reactivity', 'Reactivity', 0, 2, 0.05, { unit: '×', hint: 'How hard the fire answers the music: how high it jumps, how bright it flares.' })}
          ${select('particles', 'Particles', [['normal', 'As on the site'], ['more', 'More'], ['max', 'Most (a strong GPU)']], { hint: 'How many particles each effect uses. More looks richer but needs a stronger graphics card. Changing it restarts the scene.', adv: true })}
          ${mode('sparks', 'Hi-Hat Sparks', { hint: 'Each hi-hat throws a few sparks up out of the fire.', adv: true })}
        </fieldset>
        <fieldset>
          <legend>Weapons</legend>
          ${check('autoDrops', 'Forge in breakdowns, strike on the drop', { hint: 'When the bass drops out, a new weapon is forged over the fire and held; when the drop hits, it slams in.' })}
          ${select('phraseBars', 'New Weapon Every', barOptions('phraseBars'), { hint: 'Swap the weapon, colors and element on a phrase, landing exactly on its first beat. Random picks one of these intervals each time.' })}
          ${select('ringBars', 'Extra Ring Every', barOptions('ringBars'), { hint: 'The element’s ring races across the ground on the bar, with no swap.', adv: true })}
          ${mode('echo', 'Blade Outline Echo', { hint: 'An outline of the planted weapon bursts out of it on each bar.', adv: true })}
          ${checks('elements', 'Elements', Object.fromEntries(Object.keys(settings.elements).map((id) => [id, elements[id]?.name ?? id])), { hint: 'Which elements new weapons can bring: fire, lightning (a tesla ball) or ice (crystals).' })}
        </fieldset>
        <fieldset data-adv>
          <legend>Feel</legend>
          ${mode('temperature', 'Color Temperature', { hint: 'Bright music cools the colors: strong highs tint the picture cooler, heavy lows warmer. Subtle.' })}
          ${mode('breathe', 'Sub-Bass Breathing', { hint: 'The fire and the view swell slowly with the low end.' })}
          ${check('stages', 'Build-ups climb in stages', { hint: 'A build-up adds a notch every quarter of the way: pulses, a look burst, a ring, then sparks and tremors.' })}
          ${mode('blackout', 'Black Beat Before the Drop', { hint: 'After a build-up, the screen goes black for a split second and the drop lands out of it. Off with the Low Flash preset.' })}
          ${check('budget', 'Effects follow the song’s shape', { hint: 'Calm in intros and breakdowns, busy in the groove, everything in the bars after a drop. Off: always as busy as the settings allow.' })}
        </fieldset>`)}

      ${panel('blade', `
        <fieldset>
          <legend>Living Blade</legend>
          ${select('combos', 'Leaves the Fire', barOptions('combos'), { hint: 'How often the planted blade pulls itself out and fights on the beat, then plunges back in.' })}
          ${select('comboBars', 'For', barOptions('comboBars'), { hint: 'How long it stays out each time.', adv: true })}
          ${checks('moves', 'Moves', MOVES, { hint: 'The moves it can make: slashes, thrusts and spins.', adv: true })}
          ${select('rhythm', 'Rhythm', [['varied', 'Varied (rests, doubles)'], ['beats', 'Every beat']], { hint: 'Varied: it rests now and then, and at slow tempos hits twice in a beat. Every beat: one move per beat.', adv: true })}
          ${check('alive', 'Alive: twirls, flips, a shudder on hard beats', { hint: 'The blade moves on its own between moves, and a held one sways and trembles as the build rises.' })}
        </fieldset>`)}

      ${panel('look', `
        <fieldset>
          <legend>Place</legend>
          ${select('scenery', 'Scene', options(SCENERIES, ['mix', 'A new place every other drop']), { hint: 'What stands around the fire: the Gothic ruins, a blacksmith’s forge, a hillside shrine with a torii gate and stone lanterns, a cathedral’s altar under stained glass, or a cult’s altar among hooded figures and rune stones.' })}
        </fieldset>
        <fieldset>
          <legend>Colors</legend>
          ${select('colors', 'New Colors', options(COLOR_MODES), { hint: 'Where each new weapon’s colors come from: the site’s palettes, ones made to go together, fully random ones, or a mix. Shift+P switches live. (The palette itself, few colors and all, is in the Render tab: P opens its menu.)' })}
          ${select('scheme', 'Harmony', options(COLOR_SCHEMES), { hint: 'For made palettes: how their colors relate (next to each other on the color wheel, opposite, …).', adv: true })}
          ${select('sceneColors', 'Recolor the Scenery', [['off', 'Off'], ['mix', 'With some flames'], ['on', 'With every flame']], { hint: 'As a new flame lands, the stone, wood, shadows and background blend to colors made for it on the spot, around its hue or any hue, a new set every time, whatever palette it came from. Off: the site’s own scenery.' })}
        </fieldset>
        <fieldset>
          <legend>Picture</legend>
          ${range('glitch', 'Effects Strength', 0, 2, 0.05, { unit: '×', hint: 'How strong every picture effect is (the looks and the layers in the Effects tab). 0 = a clean picture.' })}
        </fieldset>`)}

      ${panel('render', `
        <fieldset>
          <legend>Pixels</legend>
          ${select('pixelSize', 'Pixel Size', PIXEL_SIZES.map((px) => [String(px), `${px} px${PIXEL_NOTES[px] ?? ''}`]), { hint: 'How big each pixel of the picture is. Bigger is chunkier and lighter on the graphics card.' })}
          ${select('pixelShift', 'Pixel Size Shifts', MODES, { hint: 'The pixel size jumps to another, from half to twice the one set: with a new look, and again when a drop lands. In the mix: some looks. Always: every look and every drop.' })}
          ${range('dither', 'Dither', 0, 0.4, 0.02, { hint: 'How much the colors are dithered where they meet: 0 is flat bands, more is a finer checkered blend (the site uses a little).', adv: true })}
          ${select('ditherMatrix', 'Dither Pattern', [['4', '4×4 (as on the site)'], ['8', '8×8 (finer)'], ['mix', 'A mix, new each look']], { hint: 'The ordered dither’s grid: 4×4 is the classic crosshatch, 8×8 a finer one with more steps.', adv: true })}
          ${select('outlines', 'Outlines', MODES, { hint: 'Dark outlines round everything solid, and the bright creases between facets. In the mix: most looks have them, some drop them for a flat, painted picture. Always: every look.' })}
        </fieldset>
        <fieldset>
          <legend>Colors and Light</legend>
          ${select('palette', 'Palette', options(PALETTES), { hint: 'The colors everything snaps to: the flame’s own (as on the site), Ashen’s three (black, ember orange, bone) or Moonlit’s four (black and three blues).' })}
          ${select('fewColors', 'Few Colors', MODES, { hint: 'Now and then the palette drops to just a few colors: Ashen, Moonlit, or two to four of the flame’s own (they change with the flame). A new few each time. In the mix: some looks. Always: every look, a new few each time.' })}
          ${range('exposure', 'Exposure', 0.5, 2, 0.05, { unit: '×', hint: 'How bright the whole picture is, before its colors snap to the palette.', adv: true })}
          ${range('vignette', 'Vignette', 0, 1.5, 0.05, { hint: 'How much the corners darken.', adv: true })}
          ${select('fog', 'Fog', [...Object.entries(FOGS), ['mix', 'A mix, new each look']], { hint: 'The dark closing in: off (the far scenery stays clear), light (as on the site) or thick (only what’s near the fire shows).' })}
          ${check('shadows', 'The fire casts shadows', { hint: 'The scenery and the weapon throw shadows from the fire. Off is lighter on the graphics card.', adv: true })}
        </fieldset>
        <fieldset>
          <legend>X-Ray</legend>
          ${select('xray', 'X-Ray Flips', MODES, { hint: 'Now and then, on the beat, the picture flips for a beat, two or a bar to one of the passes it’s built from, in its own colors: the normals (which way each surface faces), the lighting alone, the fire’s particles alone, or the flow field through the flames. Never on a drop’s own bar. In the mix: some looks. Always: every look (still now and then). The drop’s own X-Ray hit has its switch in the Effects tab (Drop Hits).' })}
          ${checks('xrayViews', 'X-Ray Views', XRAY_VIEWS, { hint: 'Which passes the x-ray flips (and the X-Ray drop hit) may show.', adv: true })}
        </fieldset>
        <fieldset data-adv>
          <legend>Motion</legend>
          ${select('flameFps', 'Flame Frame Rate', FLAME_FPS_OPTIONS, { hint: 'How many times a second the flames move on: few is choppy, hand-drawn animation; 60 is smooth.' })}
          ${range('colorChange', 'Color Change', 0.2, 4, 0.05, { unit: 's', hint: 'How long a new flame’s colors take to blend in when a weapon lands.' })}
          ${check('trails', 'Firefly light trails', { hint: 'The fireflies leave short trails of light as they dart. Changing it restarts the scene.' })}
        </fieldset>
        <fieldset data-adv>
          <legend>Hits</legend>
          ${select('hitStop', 'Hit-Stop', MODES, { hint: 'A big hit freezes the picture for a few frames, then catches up so the music’s timing holds. In the mix: some looks. Always: every hit.' })}
          ${select('hitFlash', 'Hit Flash', MODES, { hint: 'A big hit lifts the whole frame toward the flame’s core color for a frame or two. Off with the Low Flash preset.' })}
          ${select('debris', 'Debris', MODES, { hint: 'Hits throw bits of the element (embers, sparks, ice chips) that bounce off the scenery.' })}
          ${select('marks', 'Ground Marks', MODES, { hint: 'Hits scorch, frost or scar the ground where they land, fading away.' })}
        </fieldset>`)}

      ${panel('effects', `
        <fieldset class="viz-span">
          <legend>Rave Looks</legend>
          <p class="viz-help">Every effect is Off, In the mix (it comes and goes: looks take turns, the rest are rolled again with each look, each time with new details), or Always.</p>
          ${modeGrid('Looks', effectItems('looks', LOOKS, LOOK_HINTS), { hint: 'The picture’s styles. In the mix they take turns, a new one every few bars and after each drop; Always stays on under whichever look is taking its turn.', noAlways: ['looks.ember'] })}
          ${select('lookBars', 'New Look Every', barOptions('lookBars'), { hint: 'How often the look changes, and the mix is rolled again (always after a drop too).', adv: true })}
        </fieldset>
        <fieldset class="viz-span">
          <legend>Layers</legend>
          ${modeGrid('Over Any Look', Object.entries(LAYERS).map(([k, name]) => [k, name, LAYER_HINTS[k]]), { hint: 'Effects laid over whatever look is playing. In the mix, at most two of the heavier ones come in at once.' })}
          ${checks('mirrors', 'Mirror Kinds', MIRRORS, { hint: 'Which ways the mirror may fold: left–right, top–bottom, or into quarters.', adv: true })}
        </fieldset>
        <fieldset class="viz-span">
          <legend>Drops</legend>
          ${mode('flash', 'Negative Flash', { hint: 'The picture inverts for an instant when the drop hits (at most once every 2 seconds).' })}
          ${modeGrid('Drop Hits', effectItems('dropFx', DROP_FX, DROP_HINTS), { hint: 'The extra effects a drop throws. In the mix: drawn at random; Always: every drop.', adv: true })}
          ${select('dropCount', 'Hits per Drop', [['1', 'One'], ['2', 'Up to two'], ['3', 'Up to three']], { hint: 'How many drop hits land at once (hits set to Always come on top when there are more of them).', adv: true })}
        </fieldset>`)}

      ${panel('scenes', `
        <fieldset>
          <legend>Preset Scenes</legend>
          ${select('scenes', 'Scenes', switchOf('Off: the free show', 'In the mix: come and go', 'Always: one after another'), { hint: 'Preset scenes: a place, a flame and its colors, a framing, a look and its layers, the render, the knights and the fireflies, all set together (made in the Painter). They change inside a flash: on a drop, or on a phrase line as a new blade lands. In the mix they come and go, with stretches of the free show between them. Always: one after another. N plays the next one; Shift+N switches this.' })}
          ${select('sceneBars', 'Change Every', barOptions('sceneBars'), { hint: 'How often the next scene comes: on a phrase line, as a new blade lands with its colors (always on the first beat of a bar). Only on drops: each big drop brings the next one, in its flash. Random picks one of these intervals each time.' })}
          ${select('sceneHold', 'With the Music', [['scene', 'Each scene’s own'], ['hold', 'Hold the scene'], ['base', 'Start from the scene']], { hint: 'Hold: everything the scene sets stays for its stretch; the music only pulses and drops it (drops re-forge its own blade in its colors). Start from the scene: it opens the stretch with its place, colors, framing and look, then the show takes over (its render, knights and fireflies stay). Each scene’s own: as it was saved in the Painter.' })}
        </fieldset>
        <fieldset>
          <legend>Arrivals</legend>
          ${select('sceneCards', 'Scene Cards', switchOf('Off', 'In the mix: some scenes', 'Always: every scene'), { hint: 'A title card with the scene’s name as it arrives, like the main one but smaller. In the mix: some scenes, rolled as each one comes. (The controls always show the scene’s name.)' })}
          ${select('sceneOrder', 'Order', [['turn', 'In Turn'], ['shuffle', 'Shuffled']], { hint: 'In Turn: the loop’s order below. Shuffled: every scene once before any comes again, never the same one twice running.', adv: true })}
          ${select('sceneFrom', 'From', [['both', 'Built-In and Mine'], ['builtin', 'Built-In'], ['mine', 'Mine (made in the Painter)']], { hint: 'Which scenes it loops through: the ones that come with the site, the ones you made in the Painter (kept in this browser), or both.', adv: true })}
        </fieldset>
        <fieldset class="viz-span">
          <legend>The Loop</legend>
          <div class="viz-row">
            <p class="viz-help">The scenes it plays, in this order. Untick one to leave it out; Play Now shows it at once. Built-in scenes come with the site; yours are made in the Painter and kept in this browser.</p>
            <a class="pix-btn viz-painter-link" href="${esc(painter)}" target="_blank" rel="noopener" data-painter-new>Make a Scene in the Painter <span aria-hidden="true">↗</span></a>
          </div>
          <ol class="viz-scenes" data-scene-list></ol>
        </fieldset>`)}

      ${panel('camera', `
        <fieldset>
          <legend>Camera</legend>
          ${select('camera', 'Camera', [['still', 'Still'], ['drift', 'Slow drift'], ['cuts', 'Drift and cut on phrases']], { hint: 'Still: one framing. Drift: a slow move. Cuts: it moves between shots on the music too.' })}
          ${select('cutBars', 'Cut Every', barOptions('cutBars'), { hint: 'How often it cuts to another shot (every bar right after a drop).', adv: true })}
          ${select('transition', 'Between Shots', options(TRANSITIONS, ['mix', 'A mix']), { hint: 'Cut: straight to the next shot. Whip: a fast swing. Glide: a slow move.', adv: true })}
          ${select('swingCam', 'Blade Out', options(SWING_CAMS, ['mix', 'A mix, changing mid-move']), { hint: 'How the camera covers the blade while it fights: close angles, following it, riding on it, tracking or orbiting.', adv: true })}
          ${select('swingEase', 'Blade Camera Feel', options(Object.fromEntries(Object.entries(SWING_EASES).map(([k, e]) => [k, `${e.name}: ${e.hint}`])), ['mix', 'A mix, changing between combo moves']), { hint: 'How the camera moves while it covers the blade: an even lag, a spring, a hand-held bounce, a heavy crane or a snap.', adv: true })}
          ${select('holdCam', 'Held Blade', options(HOLD_CAMS, ['mix', 'A mix']), { hint: 'How the camera frames a blade held over the fire, waiting for the drop.', adv: true })}
          ${mode('punch', 'Zoom Punch & Shake', { hint: 'The view punches in a little on each kick and shakes on drops and impacts.' })}
          ${select('shot', 'Starting Shot', Object.entries(SHOTS).map(([k, s]) => [k, s.name]), { hint: 'The shot it starts on (and stays on with a still camera).', adv: true })}
        </fieldset>`)}

      ${panel('flies', `
        <fieldset>
          <legend>Fireflies</legend>
          ${check('blink', 'Blink and move on the beat', { hint: 'The fireflies flash in patterns and dance to the beat. Off: they just roam.' })}
          ${checks('flyMoves', 'Moves', FLY_MOVES, { hint: 'The dances they can do.', adv: true })}
          ${select('flyBars', 'New Move Every', barOptions('flyBars'), { hint: 'How often they switch dances.', adv: true })}
        </fieldset>`)}

      ${panel('knights', `
        <fieldset>
          <legend>By the Fire</legend>
          ${select('knights', 'Knights', switchOf('Off: the fire burns alone', 'In the mix: they come and go', 'Always'), { hint: 'Knights resting by the fire, who get up and dance at the right moments. In the mix they come and go, but only where the change is hidden: as the music starts, in a big drop’s flash, or when the scene changes, never in the middle of a phrase. Always: they stay. Shift+K sends them away or brings them back (on the next drop if one is coming).' })}
          ${select('knightCount', 'How Many', [['1', 'One'], ['2', 'Two'], ['3', 'Three'], ['4', 'Four'], [RANDOM, 'Random (1–4)']], { hint: 'How many knights come to the fire: the first takes the seat, the others sit on the ground round it. Random: one to four (one or two more often), rolled each time they come in. How many get up to dance follows the song: all of them after a drop, fewer as it calms down. Touch screens show two at most.' })}
          ${checks('knightHelmets', 'Helmets', HELMETS, { hint: 'The helmets they may wear: the great helm, the armet with its beaked visor, the pointed bascinet with its cross-shaped breaths. Each knight draws one as he arrives, and some draw again when the scene changes.', adv: true })}
          ${select('knightSeat', 'Seat Pose', [...Object.entries(SEAT_POSES), ['mix', 'A mix, new now and then']], { hint: 'How they sit by the fire: Resting (the bonfire rest, slumped over the knees, head sunk, dozing now and then) or Watchful (leaning in over his knees, forearms on them, head up at the fire). In the mix: rolled at the hidden moments.' })}
        </fieldset>
        <fieldset>
          <legend>Armor</legend>
          ${select('knightStyle', 'Style', [...Object.entries(KNIGHT_STYLES), ['mix', 'A mix, new now and then']], { hint: STYLE_HINT })}
          ${select('knightFinish', 'Finish', [...Object.entries(FINISH_NAMES), ['mix', 'A mix, leaning to gunmetal']], { hint: FINISH_HINT })}
          ${select('knightGlow', 'Edge Glow', switchOf('Off: plain steel edges', 'In the mix: some stretches, strength rolled', 'Always: at the strength below'), { hint: 'The edges of their armor catch the fire’s color: a rim along every edge that faces the fire, fading toward their backs. In the mix: rolled where it’s hidden (the music starting, a big drop’s flash, a new scene): some stretches glow, each at a strength rolled round the Glow Strength below, some don’t. Always: at the Glow Strength, the whole time. A scene’s knights glow as it’s painted: its own switch and strength.' })}
          ${range('knightRim', 'Glow Strength', 0, 1, 0.05, { hint: 'How strongly the edges glow: 0 none, 1 a bright rim along every edge that faces the fire. With Edge Glow Always, this strength; in the mix, the strength the rolls land round (a little under to a little over).' })}
          ${select('knightShine', 'Armor Shine', switchOf('Off: plain dark plate', 'In the mix: some stretches', 'Always'), { hint: 'The fire’s reflection sweeping over their plate: a gentle band now and then as they rest, and a bright one whenever the fire flares (a blade landing, a ring racing out). In the mix the two come and go apart, rolled where it’s hidden: as the music starts, in a big drop’s flash, when the scene changes. Off with the Low Flash preset.', adv: true })}
          ${select('knightReactions', 'Reactions', switchOf('Off: they take no notice', 'In the mix: some stretches', 'Always'), { hint: 'They flinch when a blade lands, lean away when the fire flares, lift their feet as a ring races past, follow the living blade with their eyes and flinch when it swings close. In the mix they react for some stretches and not others, rolled where it’s hidden (the music starting, a big drop’s flash, a new scene). Off with the Chill preset.', adv: true })}
        </fieldset>
        <fieldset>
          <legend>Dancing</legend>
          ${select('knightDance', 'Dance', switchOf('Off: they sit', 'In the mix: at the right moments', 'Always: whenever the groove is locked'), { hint: 'In the mix: they nod along before the first drop, get up as a build peaks, leap into the dance on the drop, dance while the energy holds and sit back down on a phrase when it falls. Always: up and dancing whenever the beat is locked in the groove. K makes them dance now for a phrase (with Off too), or sit.' })}
          ${select('knightFormation', 'Formation', options(FORMATIONS, ['mix', 'A mix, new each dance']), { hint: 'Round the Fire: spread over the clear sides of the fire, stepping along and turning back each phrase. Line: all together, facing the camera. Solo: each his own move. Canon: the same move, each a step behind the one before. They never stand between the fire and the cameras.', adv: true })}
          ${checks('knightMoves', 'Moves', KNIGHT_MOVES, { hint: 'The moves they may dance. The first two bars after a drop take the big ones (jumps, jumping jacks, spins, Praise the Sun, fist pumps, headbangs), then the groove’s.', adv: true })}
          ${select('danceBars', 'New Move Every', barOptions('danceBars'), { hint: 'How often the dancers change moves (after a drop, always two bars of big moves first).', adv: true })}
          ${select('knightSummon', 'Summon on the Drop', switchOf('Off: they get up and hurry over', 'In the mix: some drops', 'Always: every drop'), { hint: 'On a big drop the dancers are up and in their places in its flash, already leaping, and knights joining appear at once. Off: they spring up from their seats and hurry over, a few beats late, and new ones form out of embers.', adv: true })}
          ${select('knightGestures', 'Gestures on Drops', switchOf('Off', 'In the mix: some drops', 'Always: every drop'), { hint: 'Praise the Sun on a big drop, or a hurrah, a jump for joy or a point: all together, or going round them a beat apart; and a cheer on a small drop (a short cut coming back).', adv: true })}
        </fieldset>
        <fieldset>
          <legend>Camera</legend>
          ${select('knightCam', 'Knight Cameras', switchOf('Off', 'In the mix: some dances', 'Always: every dance'), { hint: 'While the knights dance, about one cut in three goes to them: low among the dancers, circling the fire, wide on the whole ring, or following one with the fire behind him. Only with the camera cutting (Camera tab).' })}
        </fieldset>`)}

      ${panel('titles', `
        <fieldset class="viz-span">
          <legend>Main Title Card</legend>
          <div class="viz-title-fields">
            ${text('title', 'Title', { max: 60, placeholder: 'DJ name or set title', hint: 'The main card’s big line: your DJ name or the set’s title. Empty, the main card never shows.' })}
            ${text('subtitle', 'Subtitle', { max: 90, placeholder: 'Venue, date, anything', hint: 'A smaller line under the title: the venue, the date, anything. Optional.' })}
          </div>
          <div class="viz-row">
            ${check('intro', 'Show it as the intro, when the music starts', { hint: 'The card fills the screen as the set begins.' })}
            ${check('titleOnDrop', 'Show it on drops', { hint: 'The card comes back with each big drop (taking turns with the cards below that show on drops).' })}
            <button class="pix-btn" type="button" data-act="show-title" title="Show the main card now (key: Shift+1)">Show Now</button>
          </div>
        </fieldset>
        <fieldset class="viz-span">
          <legend>More Cards</legend>
          <p class="viz-help">Shout-outs, the next act, a hashtag… Each shows on drops, every 32 bars, or when you press its key (Shift+2 to Shift+9).</p>
          <ol class="viz-cards" data-cards></ol>
          <button class="pix-btn" type="button" data-card-add>+ Add a Card</button>
        </fieldset>`)}

      ${panel('setups', `
        <fieldset class="viz-span">
          <legend>My Setups</legend>
          <p class="viz-help">Save everything as it is now under a name, to load again later. Your input device and volume aren’t part of a setup.</p>
          <div class="viz-row viz-setup-save">
            <input type="text" data-setup-name maxlength="40" placeholder="Name this setup (e.g. Friday residency)" autocomplete="off" aria-label="Setup name">
            <button class="pix-btn" type="button" data-setup-save>Save</button>
          </div>
          <ul class="viz-setups" data-setups></ul>
          <div class="viz-row">
            <button class="pix-btn" type="button" data-setup-export title="Download every saved setup as a file">Export to a File</button>
            <button class="pix-btn" type="button" data-setup-import title="Load setups from an exported file">Import a File</button>
            <input type="file" accept="application/json,.json" data-setup-file hidden>
          </div>
        </fieldset>`)}

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
 * The library as the Scenes tab lists it: From (settings.sceneFrom) picks whose scenes.
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

/**
 * The Scenes tab's loop, as list items: per scene its switch (in or out; `data-scene-toggle`,
 * not a setting of its own), its thumbnail (or its colors), name and summary, where it's
 * from (Built-In or Mine), Play Now and Edit in Painter.
 * @param {{ ref: string, scene: any }[]} library
 * @param {Record<string, any>} settings
 * @param {{ playing?: string|null, thumb?: (ref: string) => string|null, base?: string }} [o]
 */
export function sceneListMarkup(library, settings, { playing = null, thumb = () => null, base = '/' } = {}) {
  const painter = `${base}painter/`;
  const list = scenesFrom(library, settings);
  if (!list.length) {
    const why = { mine: 'No scenes of your own yet: make one in the Painter and save it, and it shows here.', builtin: 'The site has no built-in scenes yet.' }[settings.sceneFrom]
      ?? 'No scenes yet: make one in the Painter and save it, and it shows here.';
    return `<li class="viz-help viz-scenes-empty">${why}</li>`;
  }
  return list.map(({ ref, scene }) => {
    const on = inLoop(settings, ref);
    const now = ref === playing;
    const mine = ref.startsWith('m:');
    const name = esc(scene.name);
    const swatches = sceneSwatches(scene);
    const image = thumb(ref);
    const face = image && /^data:image\/(webp|png|jpeg);base64,/.test(image)
      ? `<img src="${esc(image)}" alt="" width="96" height="54" loading="lazy" decoding="async">`
      : swatches.slice(0, 5).map((c) => `<i style="background:${esc(c)}"></i>`).join('');
    return `
      <li class="viz-scene-row${on ? '' : ' is-out'}${now ? ' is-playing' : ''}" data-scene-row="${esc(ref)}" style="--scene-glow:${esc(swatches[2] ?? '#ffffff')}"${now ? ' aria-current="true"' : ''}>
        <input type="checkbox" data-scene-toggle="${esc(ref)}"${on ? ' checked' : ''} aria-label="${name}: in the loop">
        <span class="viz-scene-thumb" aria-hidden="true">${face}</span>
        <span class="viz-scene-text"><b>${name}</b><span>${esc(sceneSummary(scene))}</span></span>
        <span class="viz-scene-badge${mine ? ' is-mine' : ''}">${mine ? 'Mine' : 'Built-In'}</span>
        <button class="pix-btn" type="button" data-scene-play="${esc(ref)}">Play Now</button>
        <a class="pix-btn" href="${esc(`${painter}?scene=${ref}`)}" target="_blank" rel="noopener">Edit in Painter <span aria-hidden="true">↗</span></a>
      </li>`;
  }).join('');
}

/**
 * Wire the dialog to `settings`: an input writes its value straight through (numbers as
 * numbers; a group keeps at least one switch on), then calls `onChange(key)` with the
 * setting it changed (its top key: 'looks' for 'looks.glitch'; a list of them for a preset
 * or a setup, which change many; nothing for the page's own, like the title cards). Also the tabs, the simple / all switch, presets, setups, the
 * title cards list and the Scenes tab's loop: `scenes()` lists the library ([{ ref, scene }],
 * the site's built-in ones first), `thumb(ref)` a scene's thumbnail if there is one,
 * `onPlayScene(ref)` plays one now (Play Now closes the dialog, to see it). A click on the
 * backdrop closes it. Returns { fill (show the current values), open(tab?), drawScenes,
 * markScene(ref) (the scene playing now), linkStatus }.
 * @param {HTMLDialogElement} dialog
 * @param {Record<string, any>} settings
 * @param {{
 *   onChange: (key?: string | string[]) => void, onNote?: (text: string) => void,
 *   scenes?: () => { ref: string, scene: any }[], thumb?: (ref: string) => string|null,
 *   onPlayScene?: (ref: string) => void, base?: string,
 * }} o
 */
export function bindSettings(dialog, settings, { onChange, onNote = () => {}, scenes = () => [], thumb = () => null, onPlayScene = () => {}, base = '/' }) {
  const form = dialog.querySelector('form');
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
    out.textContent = key === 'offset' || key === 'linkPort' ? String(v) : key === 'volume' ? `${Math.round(v * 100)}%` : Number(v).toFixed(2);
  }
  function fill() {
    for (const el of dialog.querySelectorAll('[data-set]')) {
      const v = getPath(el.dataset.set);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = String(v);
      showOutput(el.dataset.set);
    }
    form.dataset.view = settings.view;
    for (const r of dialog.querySelectorAll('[data-view-pick]')) r.checked = r.value === settings.view;
    drawCards();
    drawSetups();
    drawScenes();
    markPreset(dialog, settings);
  }

  // --- tabs (arrow keys move between them, like any tab list)
  const tabs = [...dialog.querySelectorAll('[data-tab]')];
  function showTab(id, focus = false) {
    for (const t of tabs) {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    for (const p of dialog.querySelectorAll('[data-tab-panel]')) p.hidden = p.dataset.tabPanel !== id;
  }
  dialog.querySelector('.viz-tabs').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    showTab(tabs[next].dataset.tab, true);
  });
  showTab('sound');

  // --- title cards: a list of { title, subtitle, show }
  const cardsEl = dialog.querySelector('[data-cards]');
  function drawCards() {
    cardsEl.innerHTML = settings.cards.map((c, i) => `
      <li class="viz-card" data-card="${i}">
        <span class="viz-card-key" title="Press Shift+${i + 2} to show it">⇧${i + 2}</span>
        <input type="text" data-card-field="title" maxlength="60" value="${esc(c.title)}" placeholder="Title" aria-label="Card ${i + 2} title" autocomplete="off">
        <input type="text" data-card-field="subtitle" maxlength="90" value="${esc(c.subtitle)}" placeholder="Subtitle (optional)" aria-label="Card ${i + 2} subtitle" autocomplete="off">
        <select data-card-field="show" aria-label="When card ${i + 2} shows">${Object.entries(CARD_SHOWS).map(([v, t]) => `<option value="${v}"${c.show === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <button class="pix-btn" type="button" data-card-show title="Show it now">Show</button>
        <button class="pix-btn" type="button" data-card-remove aria-label="Remove card ${i + 2}">✕</button>
      </li>`).join('');
    dialog.querySelector('[data-card-add]').hidden = settings.cards.length >= 8;
  }
  cardsEl.addEventListener('input', (e) => {
    const row = e.target.closest('[data-card]');
    const field = e.target.dataset.cardField;
    if (!row || !field) return;
    settings.cards[Number(row.dataset.card)][field] = e.target.value;
    onChange();
  });

  // --- the Scenes tab's loop: the library, each in or out (settings.sceneList)
  const scenesEl = dialog.querySelector('[data-scene-list]');
  let playing = null;
  function drawScenes() { scenesEl.innerHTML = sceneListMarkup(scenes(), settings, { playing, thumb, base }); }
  scenesEl.addEventListener('change', (e) => {
    const box = /** @type {HTMLInputElement} */ (e.target).closest?.('[data-scene-toggle]');
    if (!box) return;
    const ref = box.dataset.sceneToggle;
    setInLoop(settings, ref, box.checked);
    box.closest('[data-scene-row]')?.classList.toggle('is-out', !box.checked);
    onChange('sceneList');
  });

  // --- setups
  const setupsEl = dialog.querySelector('[data-setups]');
  function drawSetups() {
    const all = readSetups();
    const names = Object.keys(all);
    setupsEl.innerHTML = names.length
      ? names.map((n) => `<li><span>${esc(n)}</span><button class="pix-btn" type="button" data-setup-load="${esc(n)}">Load</button><button class="pix-btn" type="button" data-setup-delete="${esc(n)}" aria-label="Delete ${esc(n)}">✕</button></li>`).join('')
      : '<li class="viz-help">No setups saved yet.</li>';
  }
  const fileInput = dialog.querySelector('[data-setup-file]');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      const all = readSetups();
      let n = 0;
      for (const [name, values] of Object.entries(incoming?.setups ?? {})) {
        if (typeof name === 'string' && values && typeof values === 'object') { all[name.slice(0, 40)] = values; n++; }
      }
      writeSetups(all);
      drawSetups();
      onNote(n ? `Imported ${n} setup${n === 1 ? '' : 's'}` : 'No setups in that file');
    } catch { onNote('That file isn’t a Bonfire Live setups file'); }
  });

  dialog.addEventListener('input', (e) => {
    if (e.target.closest('[data-scene-toggle]')) return; // (the loop's own: its change handler)
    if (e.target.matches('[data-view-pick]')) {
      settings.view = e.target.value;
      form.dataset.view = settings.view;
      onChange();
      return;
    }
    const el = e.target.closest('[data-set]');
    if (!el) return;
    const key = el.dataset.set;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (NUMERIC.has(key) && v !== RANDOM) v = Number(v);
    const group = key.split('.')[0];
    if (AT_LEAST_ONE.has(group) && key.includes('.') && !v && Object.values(settings[group]).filter(Boolean).length <= 1) { el.checked = true; return; }
    setPath(key, v);
    showOutput(key);
    if (key === 'sceneFrom') drawScenes();
    onChange(group);
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) { dialog.close(); return; }
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab) { showTab(tab.dataset.tab); return; }
    const preset = t.closest('[data-preset]');
    if (preset) {
      applyPreset(settings, preset.dataset.preset);
      fill();
      onChange(Object.keys(PRESETS[preset.dataset.preset].values));
      onNote(`Preset: ${PRESETS[preset.dataset.preset].name}`);
      return;
    }
    if (t.closest('[data-card-add]')) {
      settings.cards.push({ title: '', subtitle: '', show: 'drops' });
      drawCards();
      cardsEl.querySelector('[data-card]:last-child input')?.focus();
      onChange();
      return;
    }
    const row = t.closest('[data-card]');
    if (row && t.closest('[data-card-remove]')) {
      settings.cards.splice(Number(row.dataset.card), 1);
      drawCards();
      onChange();
      return;
    }
    if (row && t.closest('[data-card-show]')) {
      dialog.dispatchEvent(new CustomEvent('show-card', { detail: Number(row.dataset.card) + 1 }));
      return;
    }
    const play = t.closest('[data-scene-play]');
    if (play) {
      dialog.close();
      onPlayScene(play.dataset.scenePlay);
      return;
    }
    if (t.closest('[data-setup-save]')) {
      const input = dialog.querySelector('[data-setup-name]');
      const name = input.value.trim() || `Setup ${Object.keys(readSetups()).length + 1}`;
      writeSetups({ ...readSetups(), [name.slice(0, 40)]: snapshot(settings) });
      input.value = '';
      drawSetups();
      onNote(`Saved “${name}”`);
      return;
    }
    const load = t.closest('[data-setup-load]');
    if (load) {
      const values = readSetups()[load.dataset.setupLoad];
      if (values) {
        mergeInto(settings, values);
        fill();
        onChange(Object.keys(values));
        onNote(`Loaded “${load.dataset.setupLoad}”`);
      }
      return;
    }
    const del = t.closest('[data-setup-delete]');
    if (del) {
      const all = readSetups();
      delete all[del.dataset.setupDelete];
      writeSetups(all);
      drawSetups();
      return;
    }
    if (t.closest('[data-setup-export]')) {
      const blob = new Blob([JSON.stringify({ app: 'bonfire-live', setups: readSetups() }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bonfire-live-setups.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    if (t.closest('[data-setup-import]')) fileInput.click();
  });
  fill();
  return {
    fill,
    open(tab) { fill(); if (tab) showTab(tab); dialog.showModal(); },
    /** Draw the loop again (the library changed: a scene saved in the Painter, say). */
    drawScenes,
    /** The scene playing now (its row is marked), or null for the free show. */
    markScene(ref) {
      if (ref === playing) return;
      playing = ref ?? null;
      for (const r of scenesEl.querySelectorAll('[data-scene-row]')) {
        const on = r.getAttribute('data-scene-row') === playing;
        r.classList.toggle('is-playing', on);
        if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
      }
    },
    /** A line of status under the Beat From setting (the Link bridge's state). */
    set linkStatus(text) { dialog.querySelector('[data-link-status]').textContent = text; },
  };
}
