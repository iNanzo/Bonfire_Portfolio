// The settings dialog's fields, one per setting: CONTROLS[key](settings, meta) draws a
// setting's control with the shared field helpers (src/ui/fields.js), named and explained
// by the settings map (meta: src/settingsMap.js). What kind of control each is follows from
// the setting: a fixed list of choices is a dropdown (OPTIONS), an effect switch the
// three-way Off / In the Mix / Always, a group of switches a checklist (with All, None and
// Defaults over it) or a grid of three-way switches (with All Off, All In the Mix, All
// Always, Shuffle and Defaults), a yes/no a checkbox, a number a slider (the Link bridge's
// port a box to type in).
//
// row() wraps each one: the row the search finds and the dialog marks (data-row), with its
// "More" folded under it, the line saying why it's off for now (needs), and the "All
// Settings" badge it wears when a search shows it in the Simple view. BLOCKS are a section's
// own markup beyond its settings (the source line, the Link help, the MIDI list, the loop,
// the cards, the setups). And the lists drawn again as they change: the loop's scenes, the
// title cards, the setups, the presets and the search's keyboard shortcuts.
import { esc } from '../html.js';
import { elements } from '../elements.js';
import { MOVES } from '../bonfire/bladeMotion.js';
import { DEFAULT_SETTINGS } from './director.js';
import { SHOTS, SWING_CAMS, HOLD_CAMS, TRANSITIONS, CAMERA_MODES } from './camera.js';
import { SWING_EASES } from './cameraEase.js';
import { LOOKS, DROP_FX, LAYERS, MIRRORS } from './looks.js';
import { FLY_MOVES } from './fireflyMoves.js';
import { COLOR_MODES, COLOR_SCHEMES } from './colors.js';
import { barOptions } from './bars.js';
import { range, number, check, checks, options, select, text, tri, triGrid, tip, bulkBar, more } from '../ui/fields.js';
import { PALETTES, FOGS, FLAME_FPS, PIXEL_SIZES, XRAY_VIEWS } from './render.js';
import { KNIGHT_MOVES, HELMETS, FORMATIONS, SEAT_POSES, KNIGHT_STYLES } from './knightShow.js';
import { FINISH_NAMES } from '../bonfire/steel.js';
import { SCENERIES } from '../sceneries.js';
import { sceneSwatches, sceneSummary } from '../scenes.js';
import { entriesFor, ITEM_HINTS, sharedRange } from '../settingsMap.js';
import {
  CARD_SHOWS,
  PRESETS,
  RANDOM,
  AT_LEAST_ONE,
  GROUPS,
  MODE_KEYS,
  NO_ALWAYS,
  scenesFrom,
  inLoop,
} from './settings.js';

let uid = 0;

/**
 * A hint shown by the shared tooltip on an element that isn't a "?" (a button, a badge):
 * the attributes for it, and the hidden text its aria-describedby reads out (the tooltip
 * itself is hidden from screen readers).
 * @param {string} hint
 * @returns {{ attrs: string, note: string, id: string }}
 */
export function tipped(hint) {
  const id = `viz-hint-${++uid}`;
  return {
    attrs: ` data-tip="${esc(hint)}" aria-describedby="${id}"`,
    note: `<span class="visually-hidden" id="${id}">${esc(hint)}</span>`,
    id,
  };
}

const PIXEL_NOTES = { 2: ' (Fine)', 4: ' (As On the Site)', 6: ' (Chunky)' };
// The flame's frame rates, with the site's own among them.
const FLAME_FPS_OPTIONS = [...new Set([...FLAME_FPS, DEFAULT_SETTINGS.flameFps])]
  .sort((a, b) => a - b)
  .map((fps) => [
    String(fps),
    `${fps} fps${fps === DEFAULT_SETTINGS.flameFps ? ' (As On the Site)' : fps < 12 ? ' (Choppy)' : fps >= 60 ? ' (Smooth)' : ''}`,
  ]);

/**
 * Every dropdown's choices, [value, what it says] (Title Case: what a choice means more
 * fully is in its setting's hint, or its More).
 * @type {Record<string, string[][]>}
 */
export const OPTIONS = {
  beatFrom: [
    ['music', 'The Music (Heard)'],
    ['link', 'Ableton Link (Helper App)'],
  ],
  phraseBars: barOptions('phraseBars'),
  ringBars: barOptions('ringBars'),
  combos: barOptions('combos'),
  comboBars: barOptions('comboBars'),
  rhythm: [
    ['varied', 'Varied'],
    ['beats', 'Every Beat'],
  ],
  dropCount: [
    ['1', 'One'],
    ['2', 'Up To Two'],
    ['3', 'Up To Three'],
  ],
  scenery: options(SCENERIES, ['mix', 'A New Place Every Other Drop']),
  fog: [...Object.entries(FOGS), ['mix', 'A Mix, New Each Look']],
  colors: options(COLOR_MODES),
  scheme: options(COLOR_SCHEMES),
  palette: options(PALETTES),
  pixelSize: PIXEL_SIZES.map((px) => [String(px), `${px} px${PIXEL_NOTES[px] ?? ''}`]),
  ditherMatrix: [
    ['4', '4×4 (As On the Site)'],
    ['8', '8×8 (Finer)'],
    ['mix', 'A Mix, New Each Look'],
  ],
  flameFps: FLAME_FPS_OPTIONS,
  frameRate: [
    ['display', 'Display'],
    ['60', '60 fps'],
    ['30', '30 fps'],
  ],
  particles: [
    ['normal', 'As On the Site'],
    ['more', 'More'],
    ['max', 'Most (Strong GPU)'],
  ],
  lookBars: barOptions('lookBars'),
  camera: options(CAMERA_MODES),
  shot: Object.entries(SHOTS).map(([k, s]) => [k, s.name]),
  cutBars: barOptions('cutBars'),
  transition: options(TRANSITIONS, ['mix', 'A Mix']),
  swingCam: options(SWING_CAMS, ['mix', 'A Mix, Changing Mid-Move']),
  // (Names only: each feel's line is in the setting's More.)
  swingEase: [...Object.entries(SWING_EASES).map(([k, e]) => [k, e.name]), ['mix', 'A Mix, Changing Between Attacks']],
  holdCam: options(HOLD_CAMS, ['mix', 'A Mix']),
  knightCount: [
    ['1', 'One'],
    ['2', 'Two'],
    ['3', 'Three'],
    ['4', 'Four'],
    [RANDOM, 'Random (1–4)'],
  ],
  knightSeat: [...Object.entries(SEAT_POSES), ['mix', 'A Mix, New Now And Then']],
  knightStyle: [...Object.entries(KNIGHT_STYLES), ['mix', 'A Mix, New Now And Then']],
  knightFinish: [...Object.entries(FINISH_NAMES), ['mix', 'A Mix, Leaning To Gunmetal']],
  knightFormation: options(FORMATIONS, ['mix', 'A Mix, New Each Dance']),
  danceBars: barOptions('danceBars'),
  flyBars: barOptions('flyBars'),
  sceneBars: barOptions('sceneBars'),
  sceneHold: [
    ['scene', 'Each Scene’s Own'],
    ['hold', 'Hold the Scene'],
    ['base', 'Start From the Scene'],
  ],
  sceneOrder: [
    ['turn', 'In Turn'],
    ['shuffle', 'Shuffled'],
  ],
  sceneFrom: [
    ['both', 'Built-In And Mine'],
    ['builtin', 'Built-In'],
    ['mine', 'Mine (Made In the Painter)'],
  ],
};

/**
 * The items of a group of switches, { id: name }: the checklists' and the grids'.
 * @param {string} group @param {Record<string, any>} [settings]
 * @returns {Record<string, string>}
 */
export function itemNames(group, settings = DEFAULT_SETTINGS) {
  switch (group) {
    case 'elements':
      return Object.fromEntries(
        Object.keys(settings.elements ?? DEFAULT_SETTINGS.elements).map((id) => [id, elements[id]?.name ?? id]),
      );
    case 'moves':
      return MOVES;
    case 'mirrors':
      return MIRRORS;
    case 'xrayViews':
      return XRAY_VIEWS;
    case 'knightHelmets':
      return HELMETS;
    case 'knightMoves':
      return KNIGHT_MOVES;
    case 'flyMoves':
      return FLY_MOVES;
    case 'looks':
      return LOOKS;
    case 'dropFx':
      return DROP_FX;
    case 'layers':
      return LAYERS;
    default:
      return {};
  }
}
/** The grids of three-way switches: their items' settings keys (a layer's is its own). */
export const GRID_KEYS = {
  looks: Object.keys(LOOKS).map((id) => `looks.${id}`),
  dropFx: Object.keys(DROP_FX).map((id) => `dropFx.${id}`),
  layers: Object.keys(LAYERS),
};
/** An item's own hint (the looks, layers, drop hits and x-ray views have one each). */
export const itemHint = (group, id) => ITEM_HINTS[group]?.[id] ?? '';

/** What kind of control a setting is. */
export function kindOf(key) {
  if (key === 'linkPort') return 'number';
  if (key === 'title' || key === 'subtitle') return 'text';
  if (Object.hasOwn(GRID_KEYS, key)) return 'grid';
  if (GROUPS.includes(key)) return 'checks';
  if (Object.hasOwn(OPTIONS, key)) return 'select';
  if (MODE_KEYS.has(key)) return 'tri';
  if (typeof DEFAULT_SETTINGS[key] === 'boolean' || key === 'intro') return 'check';
  return 'range';
}

/**
 * A group's items as rows of their own (data-row: the search finds and marks each one): a
 * grid's three-way switches, a checklist's boxes.
 * @param {string} html a triGrid's or a checklist's markup
 */
const itemRows = (html) =>
  html
    .replace(
      /<fieldset class="tri" data-set-group="([^"]+)"/g,
      '<fieldset class="tri" data-row="$1" data-set-group="$1"',
    )
    .replace(
      /<(label|div) class="viz-check"([^>]*)>(<label>)?<input type="checkbox" data-set="([^"]+)"/g,
      '<$1 class="viz-check" data-row="$4"$2>$3<input type="checkbox" data-set="$4"',
    );
/** A label as markup, its text marked for the search to light up (fields.js takes markup). */
const named = (label) => `<span data-name>${esc(label)}</span>`;
/** A slider's range: the map's, the same in every app that has it. */
const rangeOf = (m) => sharedRange(m.id) ?? [0, 1, 0.05];

/**
 * A checklist: one checkbox per item, the group's hint over them, and All / None / Defaults
 * (None unavailable where at least one stays on). Items with hints of their own (the x-ray
 * views) get their own "?" each.
 * @param {string} group @param {string} label @param {Record<string, string>} names @param {string} hint
 */
function checklist(group, label, names, hint) {
  const minOne = AT_LEAST_ONE.has(group);
  if (!Object.keys(names).some((id) => itemHint(group, id)))
    return checks(group, named(label), names, { hint, bulk: true, minOne });
  const t = tip(hint, { label });
  return `
  <div data-tip-group>
    <p class="viz-field-label">${named(label)} ${t.mark}</p>
    ${bulkBar(group, { kind: 'checks', minOne, label })}
    <div class="viz-checks" data-bulk-list="${esc(group)}">${Object.entries(names)
      .map(([id, name]) => check(`${group}.${id}`, esc(name), { hint: itemHint(group, id), group: t.id }))
      .join('')}</div>
  </div>`;
}

/**
 * One setting's control.
 * @param {string} key @param {Record<string, any>} settings
 * @param {{ id: string, label: string, hint: string }} m its meta (src/settingsMap.js)
 */
function control(key, settings, m) {
  const { label, hint } = m;
  switch (kindOf(key)) {
    case 'number': {
      const [min, max, step] = rangeOf(m);
      return number(key, named(label), { hint, min, max, step });
    }
    case 'text':
      return key === 'title'
        ? text(key, named(label), { hint, max: 60, placeholder: 'DJ name or set title' })
        : text(key, named(label), { hint, max: 90, placeholder: 'Venue, date, anything' });
    case 'grid': {
      const ids = Object.keys(itemNames(key));
      const items = /** @type {[string, string, string][]} */ (
        GRID_KEYS[key].map((k, i) => [k, itemNames(key)[ids[i]], itemHint(key, ids[i])])
      );
      const noAlways = (NO_ALWAYS[key] ?? []).map((id) => `${key}.${id}`);
      return itemRows(triGrid(named(label), items, { hint, noAlways, bulk: key }));
    }
    case 'checks':
      return itemRows(checklist(key, label, itemNames(key, settings), hint));
    case 'select':
      return select(key, named(label), OPTIONS[key], { hint });
    case 'tri':
      return tri(key, named(label), { hint });
    case 'check':
      return check(key, named(label), { hint });
    default: {
      const [min, max, step, unit = ''] = rangeOf(m);
      return range(key, named(label), min, max, step, { hint, unit });
    }
  }
}

/**
 * Every setting's control: CONTROLS[key](settings, meta) → markup (without its row()).
 * @type {Record<string, (settings: Record<string, any>, m: { id: string, label: string, hint: string }) => string>}
 */
export const CONTROLS = Object.fromEntries(
  entriesFor('live').map((e) => [e.live, (settings, m) => control(e.live, settings, m)]),
);

/**
 * A setting's row: its control, its More (folded, the All Settings view's), the line saying
 * why it does nothing as things stand (needs; filled in by the dialog), and the badge a
 * search shows on a row from All Settings in the Simple view.
 * @param {string} key
 * @param {{ adv: boolean, more: string, needs: any }} m
 * @param {string} inner the control
 */
export function row(key, m, inner) {
  const wide = kindOf(key) === 'grid' ? ' viz-setting-wide' : '';
  const badge = m.adv ? '<span class="viz-adv-badge">All Settings</span>' : '';
  const why = m.needs ? `<p class="viz-why" id="viz-why-${esc(key)}" data-why hidden></p>` : '';
  const folded = m.more ? more(m.more.split('\n')) : '';
  const extra = key === 'volume' ? ' data-volume-row' : '';
  return `<div class="viz-setting${wide}" data-row="${esc(key)}"${m.adv ? ' data-adv' : ''}${extra}>${badge}${inner}${folded}${why}</div>`;
}

const painterLink = (base) => `${base}painter/`;

/**
 * A section's own markup beyond its settings: at its `start`, after a setting (`after`), or
 * at its `end`. `base`: the site's base URL (the Painter's links).
 * @type {Record<string, (o: { base: string }) => { start?: string, after?: Record<string, string>, end?: string }>}
 */
export const BLOCKS = {
  source: () => ({
    start: `
      <p class="viz-source-line" data-row="block:source"><span data-source-name>No sound yet</span>
        <button class="pix-btn" type="button" data-act="change-source">Change</button></p>`,
  }),
  beat: () => ({
    after: { beatFrom: '<p class="viz-help" data-link-status></p>' },
    end: `
      <details class="viz-link-help" data-adv data-row="block:link">
        <summary data-name>Setting Up Ableton Link</summary>
        <ol>
          <li>Get <a href="https://github.com/Deep-Symmetry/carabiner/releases" target="_blank" rel="noopener noreferrer">Carabiner</a> (free) for this computer and start it.</li>
          <li>Turn Link on in your DJ software.</li>
          <li>Run the bridge from this project: <code>npm run link</code>.</li>
          <li>Pick Ableton Link in Beat From. The BPM in the controls turns to “Link”.</li>
        </ol>
      </details>`,
  }),
  midi: () => ({
    end: `
      <div class="viz-row" data-row="block:midi"><button class="pix-btn" type="button" data-midi-connect><span data-name>Connect MIDI</span></button><span class="viz-help" data-midi-status></span></div>
      <ul class="viz-midi" role="list" data-midi-list></ul>`,
  }),
  loop: ({ base }) => ({
    end: `
      <div class="viz-row" data-row="block:loop">
        <p class="viz-help">Built-in scenes come with the site; yours are made in the Painter and kept in this browser.</p>
        <a class="pix-btn viz-painter-link" href="${esc(painterLink(base))}" target="_blank" rel="noopener" data-painter-new><span data-name>Make a Scene In the Painter</span> <span aria-hidden="true">↗</span></a>
      </div>
      <ol class="viz-scenes" data-scene-list></ol>`,
  }),
  titles: () => {
    const t = tipped('Shows the main card now (Shift+1).');
    return {
      end: `<div class="viz-row"><button class="pix-btn" type="button" data-act="show-title"${t.attrs}>Show Now</button>${t.note}</div>`,
    };
  },
  moreCards: () => ({
    end: `
      <ol class="viz-cards" data-cards></ol>
      <div class="viz-row" data-row="block:cards"><button class="pix-btn" type="button" data-card-add>+ <span data-name>Add a Card</span></button></div>`,
  }),
  setups: () => {
    const exp = tipped('Downloads every saved setup as one file, to import on another computer.');
    const imp = tipped('Adds the setups from an exported file (one with the same name is replaced).');
    return {
      end: `
      <div class="viz-row viz-setup-save" data-row="block:setups">
        <input type="text" data-setup-name maxlength="40" placeholder="Name this setup (e.g. Friday residency)" autocomplete="off" aria-label="Setup Name">
        <button class="pix-btn" type="button" data-setup-save>Save</button>
      </div>
      <ul class="viz-setups" data-setups></ul>
      <div class="viz-row">
        <button class="pix-btn" type="button" data-setup-export${exp.attrs}>Export Setups</button>${exp.note}
        <button class="pix-btn" type="button" data-setup-import${imp.attrs}>Import Setups</button>${imp.note}
        <input type="file" accept="application/json,.json" data-setup-file hidden>
      </div>`,
    };
  },
};

/**
 * The presets as a row of buttons (the dialog's header, the start screen): each named by its
 * name, described by its hint (shown under it where there's room, and as its tip).
 * @param {string} [cls] @param {string} [prefix] keeps their ids apart where there are two rows
 */
export const presetButtons = (cls = '', prefix = 'viz-preset') =>
  Object.entries(PRESETS)
    .map(
      ([id, p]) => `
  <button class="pix-btn viz-preset ${cls}" type="button" data-preset="${id}" data-row="preset:${id}" aria-pressed="false" data-tip="${esc(p.hint)}" aria-labelledby="${prefix}-${id}" aria-describedby="${prefix}-${id}-hint"><b id="${prefix}-${id}" data-name>${esc(p.name)}</b><span id="${prefix}-${id}-hint">${esc(p.hint)}</span></button>`,
    )
    .join('');

/**
 * The loop, as list items: per scene its switch (in or out; `data-scene-toggle`, not a
 * setting of its own), its thumbnail (or its colors), name and summary, where it's from
 * (Built-In or Mine), Play Now and Edit In Painter.
 * @param {{ ref: string, scene: any }[]} library
 * @param {Record<string, any>} settings
 * @param {{ playing?: string|null, thumb?: (ref: string) => string|null, base?: string }} [o]
 */
export function sceneListMarkup(library, settings, { playing = null, thumb = () => null, base = '/' } = {}) {
  const list = scenesFrom(library, settings);
  if (!list.length) {
    const why =
      {
        mine: 'No scenes of your own yet: make one in the Painter and save it, and it shows here.',
        builtin: 'The site has no built-in scenes yet.',
      }[settings.sceneFrom] ?? 'No scenes yet: make one in the Painter and save it, and it shows here.';
    return `<li class="viz-help viz-scenes-empty">${why}</li>`;
  }
  return list
    .map(({ ref, scene }) => {
      const on = inLoop(settings, ref);
      const now = ref === playing;
      const mine = ref.startsWith('m:');
      const name = esc(scene.name);
      const swatches = sceneSwatches(scene);
      const image = thumb(ref);
      const face =
        image && /^data:image\/(webp|png|jpeg);base64,/.test(image)
          ? `<img src="${esc(image)}" alt="" width="96" height="54" loading="lazy" decoding="async">`
          : swatches
              .slice(0, 5)
              .map((c) => `<i style="background:${esc(c)}"></i>`)
              .join('');
      return `
      <li class="viz-scene-row${on ? '' : ' is-out'}${now ? ' is-playing' : ''}" data-scene-row="${esc(ref)}" data-row="scene:${esc(ref)}" style="--scene-glow:${esc(swatches[2] ?? '#ffffff')}"${now ? ' aria-current="true"' : ''}>
        <input type="checkbox" data-scene-toggle="${esc(ref)}"${on ? ' checked' : ''} aria-label="${name}: In the Loop">
        <span class="viz-scene-thumb" aria-hidden="true">${face}</span>
        <span class="viz-scene-text"><b data-name>${name}</b><span>${esc(sceneSummary(scene))}</span></span>
        <span class="viz-scene-badge${mine ? ' is-mine' : ''}">${mine ? 'Mine' : 'Built-In'}</span>
        <button class="pix-btn" type="button" data-scene-play="${esc(ref)}">Play Now</button>
        <a class="pix-btn" href="${esc(`${painterLink(base)}?scene=${ref}`)}" target="_blank" rel="noopener">Edit In Painter <span aria-hidden="true">↗</span></a>
      </li>`;
    })
    .join('');
}

/** The title cards after the main one, as list items (card n + 2 shows on Shift+n+2). */
export const cardsMarkup = (cards) =>
  cards
    .map((c, i) => {
      const show = tipped(`Shows card ${i + 2} now.`);
      return `
      <li class="viz-card" data-card="${i}" data-row="card:${i}">
        <span class="viz-card-key" aria-hidden="true" data-tip="Shift+${i + 2} shows it">⇧${i + 2}</span><span class="visually-hidden">Shift+${i + 2}</span>
        <input type="text" data-card-field="title" maxlength="60" value="${esc(c.title)}" placeholder="Title" aria-label="Card ${i + 2} Title" autocomplete="off">
        <input type="text" data-card-field="subtitle" maxlength="90" value="${esc(c.subtitle)}" placeholder="Subtitle (optional)" aria-label="Card ${i + 2} Subtitle" autocomplete="off">
        <select data-card-field="show" aria-label="When Card ${i + 2} Shows">${Object.entries(CARD_SHOWS)
          .map(([v, t]) => `<option value="${v}"${c.show === v ? ' selected' : ''}>${esc(t)}</option>`)
          .join('')}</select>
        <button class="pix-btn" type="button" data-card-show${show.attrs}>Show</button>${show.note}
        <button class="pix-btn" type="button" data-card-remove aria-label="Remove Card ${i + 2}" data-tip="Remove this card">✕</button>
      </li>`;
    })
    .join('');

/** The saved setups, as list items (or a line saying there are none). */
export const setupsMarkup = (names) =>
  names.length
    ? names
        .map(
          (n) =>
            `<li data-row="setup:${esc(n)}"><span data-name>${esc(n)}</span><button class="pix-btn" type="button" data-setup-load="${esc(n)}">Load</button><button class="pix-btn" type="button" data-setup-delete="${esc(n)}" aria-label="Delete ${esc(n)}" data-tip="Delete this setup">✕</button></li>`,
        )
        .join('')
    : '<li class="viz-help">No setups saved yet.</li>';

/**
 * The keyboard shortcuts as the search shows them ([keys, what it does] pairs): a row each,
 * hidden until a search finds it.
 * @param {[string, string][]} keys
 */
export const keysResultsMarkup = (keys) => `
  <section class="viz-keys-results" data-keys-results aria-labelledby="viz-keys-results-title" hidden>
    <h3 class="viz-keys-results-title" id="viz-keys-results-title"><span class="viz-crumb">Keyboard Shortcuts</span></h3>
    <dl>${keys.map(([k, v], i) => `<div data-row="key:${i}"><dt><kbd data-name>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <button class="pix-btn" type="button" data-keys-open>All Shortcuts</button>
  </section>`;
