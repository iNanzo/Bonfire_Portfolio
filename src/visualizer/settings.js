// Bonfire Live's settings: kept in this browser (localStorage) and shown in the settings
// dialog. This module owns the values, their storage and the dialog; main.js decides
// what a change does (bindSettings' onChange).
//
// The dialog is in tabs (Sound, Show, Blade, Look, Effects, Camera, Fireflies, Title
// Cards, Setups). "Simple" shows the settings that matter most; "All settings" shows
// every one (the rest carry `adv`). Every setting has a hint: hover or focus its "?" to
// read what it does. Every effect has a three-way switch: off, in the mix (it comes and
// goes), always. Presets set many at once for a kind of night; setups are your own saved
// snapshots (and can be exported to a file and imported on another computer).
import { esc } from '../html.js';
import { elements } from '../elements.js';
import { MOVES } from '../bonfire/bladeMotion.js';
import { DEFAULT_SETTINGS } from './director.js';
import { SHOTS, SWING_CAMS, HOLD_CAMS, TRANSITIONS } from './camera.js';
import { SWING_EASES } from './cameraEase.js';
import { LOOKS, DROP_FX, LAYERS, MIRRORS, MODES, modeOf } from './looks.js';
import { FLY_MOVES } from './fireflyMoves.js';
import { COLOR_MODES, COLOR_SCHEMES } from './colors.js';
import { BAR_OPTIONS, RANDOMIZABLE, RANDOM, rollable } from './bars.js';
import { SCENERIES } from '../bonfire/scenery.js';

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
const GROUPS = ['elements', 'moves', 'flyMoves', 'mirrors'];
// Groups that always keep at least one switch on.
const AT_LEAST_ONE = new Set(['elements', 'moves', 'flyMoves', 'mirrors']);
// Effect switches (off | mix | on): groups with one per effect, and single ones.
const MODE_GROUPS = ['looks', 'dropFx'];
const MODE_KEYS = new Set(['sparks', 'echo', 'punch', 'temperature', 'breathe', 'blackout', 'flash', 'sceneColors', ...Object.keys(LAYERS)]);
// (Ember is the clean fire: taking turns, or not. "Always" would add nothing.)
const NO_ALWAYS = { looks: ['ember'] };
const NUMERIC = new Set(['sensitivity', 'offset', 'volume', 'reactivity', 'phraseBars', 'ringBars', 'cutBars', 'pixelSize', 'glitch', 'combos', 'comboBars', 'lookBars', 'flyBars', 'dropCount', 'linkPort']);
// What a setup (or a preset) never changes: this computer's own things.
const LOCAL = ['deviceId', 'volume', 'view'];
export const CARD_SHOWS = { drops: 'On drops (taking turns)', phrases: 'Every 32 bars', manual: 'Only when I press its key' };

const cleanCards = (v) => (Array.isArray(v) ? v.filter((c) => c && typeof c.title === 'string').slice(0, 9).map((c) => ({
  title: c.title.slice(0, 60), subtitle: typeof c.subtitle === 'string' ? c.subtitle.slice(0, 90) : '', show: CARD_SHOWS[c.show] ? c.show : 'drops',
})) : []);

/**
 * `saved` over `out` (in place): known keys of the right type only. Effect switches saved
 * as on/off (before they had three settings) come back as always/off; a look or drop hit
 * that was switched on comes back in the mix (as they were: taking turns, drawn at random).
 */
function mergeInto(out, saved) {
  for (let [k, v] of Object.entries(saved ?? {})) {
    if (!(k in out)) continue;
    // (Scanlines and the mirror were on/off switches before they joined the looks' mix.
    // The scenery recolor's old "off" was its default, back when it only worked with made
    // palettes: it takes the new default.)
    if ((k === 'scanlines' || k === 'mirror') && typeof v === 'boolean') v = v ? 'on' : 'mix';
    if (k === 'sceneColors' && v === false) continue;
    if (k === 'cards') out.cards = cleanCards(v);
    else if (GROUPS.includes(k)) { for (const id of Object.keys(out[k])) if (typeof v?.[id] === 'boolean') out[k][id] = v[id]; }
    else if (MODE_GROUPS.includes(k)) {
      for (const id of Object.keys(out[k])) {
        if (v?.[id] === undefined) continue;
        const m = modeOf(v[id], 'mix');
        out[k][id] = m === 'on' && NO_ALWAYS[k]?.includes(id) ? 'mix' : m;
      }
    } else if (MODE_KEYS.has(k)) { if (typeof v === 'boolean' || MODES.some(([id]) => id === v)) out[k] = modeOf(v); }
    else if (typeof v === typeof out[k] || (v === RANDOM && RANDOMIZABLE.includes(k))) out[k] = v;
  }
  return out;
}
const defaults = () => structuredClone({ ...DEFAULT_SETTINGS, ...PAGE_DEFAULTS });

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
export const PRESETS = {
  chill: {
    name: 'Chill', hint: 'Slow and warm: drifting camera, soft looks and layers (glow, ghosting, paint), no flashes. Lounges, warm-ups, long sets.',
    values: {
      reactivity: 0.8, glitch: 0.4, camera: 'drift', combos: 16, phraseBars: 32, ringBars: 0, flash: 'off', dropCount: 1, punch: 'off', mirror: 'off', lookBars: 32, blackout: 'off',
      blend: 'mix', ghost: 'mix', glow: 'mix', gradient: 'mix', paint: 'mix', wash: 'mix', blur: 'off', flicker: 'off',
    },
  },
  club: {
    name: 'Club', hint: 'The default balance: cuts on phrases, a swing every 8 bars, the full drop, every layer in the mix.',
    values: {
      reactivity: 1.2, glitch: 1, camera: 'cuts', cutBars: 2, combos: 8, phraseBars: 16, ringBars: 4, flash: 'on', dropCount: 2, punch: 'on', mirror: 'mix', lookBars: 16, blackout: 'on',
      blend: 'mix', ghost: 'mix', glow: 'mix', gradient: 'mix', paint: 'mix', wash: 'mix', blur: 'mix', flicker: 'mix',
    },
  },
  rave: {
    name: 'Rave', hint: 'Everything, faster: cuts every bar, a swing every 4, strong looks, new blend modes every look and up to three drop hits.',
    values: {
      reactivity: 1.6, glitch: 1.6, camera: 'cuts', cutBars: 1, combos: 4, phraseBars: 8, ringBars: 2, flash: 'on', dropCount: 3, punch: 'on', mirror: 'mix', scanlines: 'mix', lookBars: 8, blackout: 'on',
      blend: 'on', ghost: 'mix', glow: 'mix', gradient: 'mix', paint: 'mix', wash: 'mix', blur: 'mix', flicker: 'mix',
    },
  },
  safe: {
    name: 'Low Flash', hint: 'For sensitive rooms and big screens: no negative flashes, blackouts or flicker, gentle looks, glides between shots.',
    values: { flash: 'off', blackout: 'off', flicker: 'off', glitch: 0.5, punch: 'off', dropCount: 1, cutBars: 4, transition: 'glide' },
  },
};
/** Apply a preset's values (the device, volume and the dialog's view are kept). */
export function applyPreset(settings, id) {
  const p = PRESETS[id];
  if (p) mergeInto(settings, p.values);
}

// --- setups: your own saved snapshots ------------------------------------------------------
function readSetups() {
  try { const v = JSON.parse(localStorage.getItem(SETUPS) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function writeSetups(all) { try { localStorage.setItem(SETUPS, JSON.stringify(all)); } catch { /* private mode */ } }
const snapshot = (settings) => Object.fromEntries(Object.entries(structuredClone(settings)).filter(([k]) => !LOCAL.includes(k)));

// --- the dialog ---------------------------------------------------------------------------
const corners = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>';
let tipId = 0;
/** A "?" that shows `hint` on hover or focus (and is read out as the field's description). */
const tip = (hint) => {
  if (!hint) return { mark: '', ref: '' };
  const id = `viz-tip-${++tipId}`;
  return { mark: `<span class="viz-tip" tabindex="0" aria-hidden="true" data-tip="${esc(hint)}">?</span><span class="visually-hidden" id="${id}">${esc(hint)}</span>`, ref: ` aria-describedby="${id}"` };
};
const advAttr = (adv) => (adv ? ' data-adv' : '');
const range = (key, label, min, max, step, { hint = '', unit = '', adv = false } = {}) => {
  const t = tip(hint);
  return `
  <label class="viz-field"${advAttr(adv)}>
    <span class="viz-field-label">${label} ${t.mark}<output data-out="${key}"></output>${unit ? `<span class="viz-unit">${unit}</span>` : ''}</span>
    <input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}"${t.ref}>
  </label>`;
};
const check = (key, label, { hint = '', adv = false } = {}) => {
  const t = tip(hint);
  return `<label class="viz-check"${advAttr(adv)}><input type="checkbox" data-set="${key}"${t.ref}><span>${label}</span>${t.mark}</label>`;
};
/** A row of checkboxes, one per entry of `names` ({ id: label }), for settings[group]. */
const checks = (group, label, names, { hint = '', adv = false } = {}) => {
  const t = tip(hint);
  return `
  <div${advAttr(adv)}>
    <p class="viz-field-label">${label} ${t.mark}</p>
    <div class="viz-checks">${Object.entries(names).map(([id, name]) => check(`${group}.${id}`, esc(name))).join('')}</div>
  </div>`;
};
const options = (names, first = null) => [...(first ? [first] : []), ...Object.entries(names)];
// An "every N bars" setting's choices (bars.js), plus Random where it's offered.
const barOptions = (key) => [
  ...BAR_OPTIONS[key].map(([v, t]) => [String(v), t]),
  ...(RANDOMIZABLE.includes(key) ? [[RANDOM, `Random (${rollable(key).join(', ')} bars, rolled each time)`]] : []),
];
const select = (key, label, opts, { hint = '', adv = false } = {}) => {
  const t = tip(hint);
  return `
  <label class="viz-field"${advAttr(adv)}>
    <span class="viz-field-label">${label} ${t.mark}</span>
    <select data-set="${key}"${t.ref}>${opts.map(([v, text]) => `<option value="${esc(v)}">${esc(text)}</option>`).join('')}</select>
  </label>`;
};

// Effect switches: Off / In the mix / Always.
const MIX_HINT = 'In the mix: it comes and goes, rolled again each time the look changes. Always: on the whole time.';
/** One effect's switch (a select, like any other). */
const mode = (key, label, { hint = '', adv = false } = {}) => select(key, label, MODES, { hint: `${hint} ${MIX_HINT}`.trim(), adv });
/**
 * A grid of effect switches: `items` are [settings key, name, hint?]. Keys may point into
 * a group ("looks.glitch"); `noAlways` lists keys that only take off and in the mix.
 */
const modeGrid = (label, items, { hint = '', adv = false, noAlways = [] } = {}) => {
  const t = tip(hint);
  return `
  <div${advAttr(adv)}>
    <p class="viz-field-label">${label} ${t.mark}</p>
    <div class="viz-modes">${items.map(([key, name, itemHint]) => {
      const it = tip(itemHint);
      return `<label class="viz-mode"><span>${esc(name)}</span>${it.mark}<select data-set="${key}" aria-label="${esc(name)}"${it.ref}>${MODES.filter(([v]) => v !== 'on' || !noAlways.includes(key)).map(([v, text]) => `<option value="${v}">${esc(text)}</option>`).join('')}</select></label>`;
    }).join('')}</div>
  </div>`;
};
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
};
const effectItems = (group, names) => Object.entries(names).map(([id, name]) => [`${group}.${id}`, name]);

const TABS = [
  ['sound', 'Sound'], ['show', 'Show'], ['blade', 'Blade'], ['look', 'Look'], ['effects', 'Effects'],
  ['camera', 'Camera'], ['flies', 'Fireflies'], ['titles', 'Title Cards'], ['setups', 'Presets & Setups'],
];

/** The settings dialog. `keys`: [key, what it does] pairs for its list of keys. */
export function settingsMarkup(settings, keys) {
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
          ${select('scenery', 'Scene', options(SCENERIES, ['mix', 'A new place every other drop']), { hint: 'What stands around the fire: the Gothic ruins, a blacksmith’s forge, or a hillside shrine with a torii gate and stone lanterns.' })}
        </fieldset>
        <fieldset>
          <legend>Colors</legend>
          ${select('colors', 'New Colors', options(COLOR_MODES), { hint: 'Where each new weapon’s colors come from: the site’s palettes, ones made to go together, fully random ones, or a mix. P switches live.' })}
          ${select('scheme', 'Harmony', options(COLOR_SCHEMES), { hint: 'For made palettes: how their colors relate (next to each other on the color wheel, opposite, …).', adv: true })}
          ${select('sceneColors', 'Recolor the Scenery', [['off', 'Off'], ['mix', 'With some flames'], ['on', 'With every flame']], { hint: 'As a new flame lands, the stone, wood, shadows and background blend to colors made for it on the spot, around its hue or any hue, a new set every time, whatever palette it came from. Off: the site’s own scenery.' })}
        </fieldset>
        <fieldset>
          <legend>Picture</legend>
          ${range('glitch', 'Effects Strength', 0, 2, 0.05, { unit: '×', hint: 'How strong every picture effect is (the looks and the layers in the Effects tab). 0 = a clean picture.' })}
          ${select('pixelSize', 'Pixel Size', [['2', '2 px (fine)'], ['3', '3 px'], ['4', '4 px (the site)'], ['6', '6 px (chunky)'], ['8', '8 px']], { hint: 'How big each pixel of the picture is. Bigger is chunkier and lighter on the graphics card.', adv: true })}
        </fieldset>`)}

      ${panel('effects', `
        <fieldset class="viz-span">
          <legend>Rave Looks</legend>
          <p class="viz-help">Every effect is Off, In the mix (it comes and goes: looks take turns, the rest are rolled again with each look, each time with new details), or Always.</p>
          ${modeGrid('Looks', effectItems('looks', LOOKS), { hint: 'The picture’s styles. In the mix they take turns, a new one every few bars and after each drop; Always stays on under whichever look is taking its turn.', noAlways: ['looks.ember'] })}
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
          ${modeGrid('Drop Hits', effectItems('dropFx', DROP_FX), { hint: 'The extra effects a drop throws. In the mix: drawn at random; Always: every drop.', adv: true })}
          ${select('dropCount', 'Hits per Drop', [['1', 'One'], ['2', 'Up to two'], ['3', 'Up to three']], { hint: 'How many drop hits land at once (hits set to Always come on top when there are more of them).', adv: true })}
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

      ${panel('titles', `
        <fieldset class="viz-span">
          <legend>Main Title Card</legend>
          <div class="viz-title-fields">
            <label class="viz-field"><span class="viz-field-label">Title</span><input type="text" data-set="title" maxlength="60" placeholder="DJ name or set title" autocomplete="off"></label>
            <label class="viz-field"><span class="viz-field-label">Subtitle</span><input type="text" data-set="subtitle" maxlength="90" placeholder="Venue, date, anything" autocomplete="off"></label>
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
          <legend>Presets</legend>
          <div class="viz-presets">
            ${Object.entries(PRESETS).map(([id, p]) => `<button class="pix-btn viz-preset" type="button" data-preset="${id}" title="${esc(p.hint)}"><b>${esc(p.name)}</b><span>${esc(p.hint)}</span></button>`).join('')}
          </div>
        </fieldset>
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
 * Wire the dialog to `settings`: an input writes its value straight through (numbers as
 * numbers; a group keeps at least one switch on), then calls `onChange`. Also the tabs, the
 * simple / all switch, presets, setups and the title cards list. A click on the backdrop
 * closes it. Returns { fill (show the current values), open, note }.
 */
export function bindSettings(dialog, settings, { onChange, onNote = () => {} }) {
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
    onChange();
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
      onChange();
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
        onChange();
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
    /** A line of status under the Beat From setting (the Link bridge's state). */
    set linkStatus(text) { dialog.querySelector('[data-link-status]').textContent = text; },
  };
}
