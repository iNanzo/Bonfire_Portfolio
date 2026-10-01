// The Painter's panel: every part of a scene as a field, in sections that fold (Place &
// Atmosphere, Colors, Fire, Pixel Art, Look, Layers, Camera, Knights, Fireflies, Show: the
// settings map's PAINTER_SECTIONS, laid out by layout.js).
//
// panelMarkup(scene) draws it (pure: the tests read it in node); bindPanel wires it. Every
// input names the part of the scene it edits by its path (`data-scene="details.glowSize"`,
// `knights.helmets.1`), the same way Bonfire Live's dialog names a setting (the fields are
// src/ui/fields.js, with `data-set` renamed), so one handler does them all. Labels, hints
// and the longer "More" come from the settings map (meta('painter', path)), the looks', the
// layers' and the drop hits' own hints from its ITEM_HINTS, so a setting reads the same here
// as in Bonfire Live. Every row carries `data-row` (its id in layout.js), which the search
// (panelSearch.js) finds it by.
//
//   fields     sliders, selects, checkboxes and colors: `data-scene` paths, each with a
//              Title Case label and a "?" hint.
//   switches   Off / In the Mix / Always as three radios (src/ui/fields.js tri(): one
//              keyboard stop, the arrow keys move along it): a layer, a drop hit, the
//              outlines, the knights' edge glow, dance, shine and reactions. A section with
//              any says what the three mean once, over its first (the map's TRI_HELP). A
//              layer's choices audition (below).
//   chips      a choice drawn as a button (`data-pick` + `data-value`, JSON): the place, a
//              look, a flame, a shot. Hovering one with `data-audition` (or a layer's
//              choice) shows it on the stage at once (an audition); leaving puts the scene
//              back; a click keeps it (an undo step). The hover is the effect: no text pops up.
//   locks      each detail a look or layer rolls can be pinned (it stays as painted) or
//              left to the dice (rolled again each time the look comes round: the endless
//              variations). A rolled one shows what's on screen now, dimmed; moving its
//              slider pins it. The lock says which in its own tooltip.
//   bulk       a toolbar over the layers, the scene's own drop hits and the move lists (All
//              Off / In the Mix / Always, Shuffle, Defaults; All / None / Defaults, where None
//              is marked unavailable: a list keeps at least one move): one edit, so one undo
//              step (bulkEdit). A list's boxes follow the scene, as every field does.
//   actions    buttons that do more than set one path (`data-paint-act`): a new harmonious
//              or random flame, the place's colors, Pin What You See, a gesture to
//              preview. The page (painter/main.js) does those.
// A section is drawn again only when its own shape changes (a layer turned on shows its
// details, a move that isn't Still shows how big it is: layout.js sectionShapes), and only
// that section; otherwise fill() just sets the values (and shows as many helmet rows as
// there are knights, so dragging the knights' count never swaps the slider out from under
// the pointer). A redraw keeps the keyboard's place (the focused field, chip, lock or button
// is focused again), and one that would come mid-drag waits for the drag to end. fill()
// leaves the field under the user's hand alone (a slider being dragged or just moved), unless
// undo or redo forces it.
import { esc } from '../html.js';
import { range, select, check, tip, tri, bulkBar, bulkValues, more } from '../ui/fields.js';
import { highlight } from '../ui/settingsSearch.js';
import { DROP_FX, LAYER_BLENDS, LAYER_DETAILS, LAYERS, PARAMS } from '../visualizer/looks.js';
import { KNIGHT_MOVES, MAX_KNIGHTS } from '../visualizer/knightShow.js';
import { FLY_MOVES } from '../visualizer/fireflyMoves.js';
import { SCENE_RANGES } from '../scenes.js';
import { SETTINGS, TRI_HELP } from '../settingsMap.js';
import { SCHEMES } from '../paletteGen.js';
import { modeOf } from '../modes.js';
import {
  PANEL_SECTIONS, OWN, FIRE_HELP, MUSIC_HELP, sectionRows, sectionShapes, rowShown, rowText, choices, itemHint,
} from './layout.js';

export { sectionShapes };

/** The panel's sections, in order: [id, name]. */
export const SECTIONS = PANEL_SECTIONS.map((s) => /** @type {[string, string]} */ ([s.id, s.label]));

// --- paths ------------------------------------------------------------------------------
const parts = (path) => path.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p));
/** The value at a dotted path ("knights.helmets.1"), or undefined. */
export function getPath(obj, path) {
  let o = obj;
  for (const p of parts(path)) {
    if (o === null || typeof o !== 'object') return undefined;
    o = o[p];
  }
  return o;
}
/**
 * A copy of `obj` with the value at `path` set (`undefined`: taken out, e.g. a detail back
 * to the dice). Groups on the way are made as needed.
 */
export function withPath(obj, path, value) {
  const out = structuredClone(obj);
  const ps = parts(path);
  let o = out;
  for (let i = 0; i < ps.length - 1; i++) {
    const p = ps[i];
    if (o[p] === null || typeof o[p] !== 'object') o[p] = typeof ps[i + 1] === 'number' ? [] : {};
    o = o[p];
  }
  const last = ps.at(-1);
  if (value === undefined) {
    if (Array.isArray(o)) o[/** @type {number} */ (last)] = null;
    else delete o[last];
  } else o[last] = structuredClone(value);
  return out;
}

/** The flame's colors: [key, label]. */
export const RAMP_LABELS = { lo: 'Embers', mid: 'Body', hi: 'Tips', core: 'Core', shade: 'Shade' };
export const SCENE_LABELS = { void: 'Background', shadow: 'Shadow', stone: 'Stone', wood: 'Wood', bone: 'Bone' };
/** The scene palette's slots (palette.js scenePalette), as the slot picker and the gradient name them. */
export const SLOT_NAMES = ['Background', 'Shadow', 'Stone', 'Wood', 'Bone', 'Embers', 'Body', 'Tips', 'Core', 'Shade'];
/** What a detail's lock says it does, pinned and left to the dice. */
export const LOCK_TIPS = { pinned: 'Pinned: stays as painted', rolled: 'Rolled each time: click to pin' };

// --- pieces -------------------------------------------------------------------------------
/** A field from src/ui/fields.js, bound to a scene path instead of a setting. */
const sc = (html) => html.replace(/ data-set="/g, ' data-scene="');
const numeric = (html) => html.replace('<select ', '<select data-num ');
const unset = (html) => html.replace('<select ', '<select data-unset ');
/** A label's text, where the search marks what it matched (`data-hl`). */
const hl = (label) => `<span data-hl>${esc(label)}</span>`;
/** A row: what the search shows or hides (`data-row`, its id in layout.js). */
const row = (id, html, cls = '') => `<div class="pnt-field${cls ? ` ${cls}` : ''}" data-row="${esc(id)}">${html}</div>`;
/** A row's More (folded), when it has one. */
const moreOf = (text) => (text ? more(text.split('\n'), { adv: false }) : '');

/** A small pixel icon (the lock's pin or die, the section fold's arrow). */
const ICONS = {
  pin: '<svg viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges"><path d="M2 0h3v1H2zM1 1h5v3H1zM3 4h1v3H3z"/></svg>',
  die: '<svg viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 0h7v7H0z" fill-opacity=".35"/><path d="M1 1h1v1H1zM5 1h1v1H5zM3 3h1v1H3zM1 5h1v1H1zM5 5h1v1H5z"/></svg>',
  fold: '<svg viewBox="0 0 5 5" aria-hidden="true" shape-rendering="crispEdges"><path d="M0 1h5v1H0zM1 2h3v1H1zM2 3h1v1H2z"/></svg>',
};

/** Swatches (a few colors side by side). */
export const swatches = (colors) => `<span class="pnt-sw" aria-hidden="true">${colors.map((c) => `<i style="--c:${esc(c)}"></i>`).join('')}</span>`;

/**
 * A choice as a button: picking it sets `path` to `value`. `audition`: hovering it shows it
 * on the stage.
 * @param {string} path @param {unknown} value @param {string} label
 * @param {{ audition?: boolean, colors?: string[] | null, cls?: string, pressedWhenMissing?: boolean }} [o]
 */
export function chip(path, value, label, { audition = true, colors = null, cls = '', pressedWhenMissing = false } = {}) {
  return `<button type="button" class="pnt-chip${cls ? ` ${cls}` : ''}" data-pick="${esc(path)}" data-value="${esc(JSON.stringify(value))}"${audition ? ' data-audition' : ''}${pressedWhenMissing ? ' data-missing' : ''} aria-pressed="false">${colors ? swatches(colors) : ''}<span>${esc(label)}</span></button>`;
}
/** A row's label with its "?" (for groups of chips or buttons, which have no single input). */
const groupHead = (label, hint) => `<p class="viz-field-label">${hl(label)} ${tip(hint, { label }).mark}</p>`;
/** A row headed by its label and "?", over `body`. */
const headed = (id, body, cls = '') => {
  const r = rowText(id);
  return row(id, `${groupHead(r.label, r.hint)}${body}${moreOf(r.more)}`, cls);
};
/**
 * A row of color inputs under one label, and one hint that each reads out: the "?" is only
 * for the eye (not a stop of its own), lit while any of them has the keyboard's focus.
 */
function colorRow(id, base, labels, note) {
  const r = rowText(id);
  const t = tip(r.hint, { control: true, label: r.label });
  return row(id, `<p class="viz-field-label">${hl(r.label)} ${t.mark}</p>
      <div class="pnt-ramp">${Object.entries(labels).map(([key, name]) => `<label class="pnt-swatch"><input type="color" data-scene="${base}.${key}" aria-label="${esc(name)}"${t.ref}><span>${esc(name)}</span></label>`).join('')}</div>${note}`);
}

/** A slider row (its range from scenes.js SCENE_RANGES). */
function rangeRow(id) {
  const r = rowText(id);
  const [min, max, step, unit] = SCENE_RANGES[r.path];
  return row(id, sc(range(r.path, hl(r.label), min, max, step, { hint: r.hint, unit: unit ?? '' })) + moreOf(r.more));
}
/** A dropdown row of `choices(id)`; `num`: its values are numbers; `undef`: '' takes the value out. */
function selectRow(id, c, { num = false, undef = false } = {}) {
  const r = rowText(id);
  let html = sc(select(r.path, hl(r.label), choices(id, c), { hint: r.hint }));
  if (num) html = numeric(html);
  if (undef) html = unset(html);
  return row(id, html + moreOf(r.more));
}
/** The rows that are Off / In the Mix / Always switches (a section with any says what those mean, once). */
const isTri = (id) => ['outlines', 'knightGlow', 'knightShine', 'knightDance', 'knightReactions'].includes(id) || /^(layer|dropFx)\./.test(id);
/** What Off / In the Mix / Always mean, said over a section's first switch. */
const triHelp = () => `<p class="pnt-help" data-tri-help>${esc(TRI_HELP)}</p>`;
/** An Off / In the Mix / Always row. `missing`: the mode a missing value means. */
function triRow(id, { missing = 'off', audition = false } = {}) {
  const r = rowText(id);
  return row(id, sc(tri(r.path, hl(r.label), { hint: r.hint, missing, attr: audition ? ' data-audition' : '' })) + moreOf(r.more), 'pnt-tri');
}

/** A detail a look or a layer rolls, with its lock. */
function detailField(id, scene) {
  const { path } = rowText(id);
  const key = id.split('.')[1];
  const spec = PARAMS[key];
  const pinned = getPath(scene, path) !== undefined;
  const say = pinned ? 'pinned, stays as painted' : 'rolled each time, click to pin';
  const lock = `<button type="button" class="pnt-lock" data-lock="${esc(path)}" aria-pressed="${pinned}" data-tip="${pinned ? LOCK_TIPS.pinned : LOCK_TIPS.rolled}" aria-label="${esc(spec.label)}: ${say}">${pinned ? ICONS.pin : ICONS.die}</button>`;
  let field;
  if (spec.slots) {
    const t = tip(spec.hint, { control: true, label: spec.label }); // (each slot reads it out: the "?" is only for the eye)
    field = `<div class="viz-field"><span class="viz-field-label">${hl(spec.label)} ${t.mark}</span><span class="pnt-slots3">${
      Array.from({ length: spec.slots }, (_, i) => `<select data-scene="${esc(path)}.${i}" data-num aria-label="${esc(spec.label)} ${i + 1}"${t.ref}>${SLOT_NAMES.map((n, s) => `<option value="${s}">${esc(n)}</option>`).join('')}</select>`).join('')
    }</span></div>`;
  } else if (spec.bool) field = sc(check(path, hl(spec.label), { hint: spec.hint }));
  else if (spec.values) field = numeric(sc(select(path, hl(spec.label), choices(id), { hint: spec.hint })));
  else field = sc(range(path, hl(spec.label), spec.range[0], spec.range[1], spec.step ?? 0.01, { hint: spec.hint }));
  return `<div class="pnt-detail${pinned ? '' : ' is-rolled'}" data-detail="${esc(path)}" data-row="${esc(id)}">${field}${lock}</div>`;
}

/**
 * A checklist of names for a list the scene may leave to the show (null), with its bulk
 * toolbar while it's the scene's own. Every box reads out the list's hint.
 */
function pickList(id, scene) {
  const r = rowText(id);
  const list = getPath(scene, r.path);
  const own = Array.isArray(list);
  const t = tip(r.hint, { control: true, label: r.label });
  return `<div class="pnt-field pnt-list" data-list="${esc(r.path)}" data-row="${esc(id)}">
    <p class="viz-field-label">${hl(r.label)} ${t.mark}</p>
    <label class="viz-check"><input type="checkbox" data-list-show="${esc(r.path)}"${own ? '' : ' checked'}${t.ref}><span>The Show’s Moves</span></label>
    ${own ? `${bulkBar(r.path, { kind: 'checks', minOne: true, label: r.label })}
    <div class="viz-checks">${choices(id).map(([key, name]) => `<label class="viz-check"><input type="checkbox" data-list-item="${esc(key)}"${list.includes(key) ? ' checked' : ''}${t.ref}><span>${esc(name)}</span></label>`).join('')}</div>` : ''}
    ${moreOf(r.more)}
  </div>`;
}

/**
 * Each knight's helmet, under one label and one hint that each select reads out: the "?"
 * is only for the eye (not a stop of its own), lit while any of them has the keyboard's
 * focus. Every row is drawn; those past `count` wait, hidden.
 */
function helmetRows(count) {
  const r = rowText('knightHelmets');
  const t = tip(r.hint, { control: true, label: r.label });
  return row('knightHelmets', `<p class="viz-field-label">${hl(r.label)} ${t.mark}</p>
      <div class="pnt-helmets">${Array.from({ length: MAX_KNIGHTS }, (_, i) => `<div class="pnt-helmet" data-helmet="${i}"${i < count ? '' : ' hidden'}>${
    sc(select(`knights.helmets.${i}`, `Knight ${i + 1}`, choices('knightHelmets'))).replace('<select ', `<select${t.ref} `)
  }</div>`).join('')}</div>`);
}

/**
 * Chips for flames (the site's, or ones suggested from a color): each shows its ramp,
 * hovers onto the fire, and sets the scene's flame colors when clicked.
 * @param {{ label: string, colors: { lo: string, mid: string, hi: string, core: string, shade: string, light?: number } }[]} list
 * @param {number} [light]  the light the flames take (the scene's own when they have none)
 */
export function flameChips(list, light = 0.34) {
  return list.map(({ label, colors }) => {
    const flame = { lo: colors.lo, mid: colors.mid, hi: colors.hi, core: colors.core, shade: colors.shade, light: colors.light ?? light };
    return chip('colors.flame', flame, label, { colors: [flame.lo, flame.mid, flame.hi, flame.core] });
  }).join('');
}
/** Chips for place palettes (suggested from a color): hover onto the scene, click to use. */
export function sceneryChips(list) {
  return list.map(({ label, colors }) => chip('colors.scenery', colors, label, { colors: [colors.void, colors.shadow, colors.stone, colors.wood, colors.bone] })).join('');
}

/**
 * The scene's palette slots' colors (palette.js scenePalette: the place's five, the
 * flame's ramp and shade), for the slot picker and the gradient's swatches.
 * @param {any} scene
 * @param {Record<string, string>} siteBase  the site's place colors (for a scene on its own)
 */
export function slotColors(scene, siteBase = SITE_BASE) {
  const s = scene.colors.scenery ?? siteBase;
  const f = scene.colors.flame;
  return [s.void, s.shadow, s.stone, s.wood, s.bone, f.lo, f.mid, f.hi, f.core, f.shade];
}
/** The site's place colors when the page doesn't say (palette.js base). */
const SITE_BASE = { void: '#07070b', shadow: '#15131d', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' };

// --- rows -----------------------------------------------------------------------------------
/**
 * @typedef {{ weapons?: Record<string, string>, elements?: Record<string, string>,
 *   flames?: { key: string, name: string, colors: { lo: string, mid: string, hi: string, core: string, shade: string, light?: number } }[],
 *   shots?: { key: string, name: string, camera: object }[], siteBase?: Record<string, string>,
 *   styles?: Record<string, string>, site?: { pixelSize?: number, ditherMatrix?: number, flameFps?: number },
 *   open?: Iterable<string> }} PanelCtx
 */
/** Each row's markup, by its id (an item row by its kind: "layer.glow" is ROWS.layer). */
const ROWS = {
  scenery: (id) => headed(id, `<div class="pnt-chips" role="group" aria-label="Place">${choices(id).map(([v, name]) => chip('place.scenery', v, name, { audition: false, cls: 'pnt-place' })).join('')}</div>`),
  fog: (id, s, c) => selectRow(id, c),
  exposure: rangeRow,
  vignette: rangeRow,
  shadows: (id) => { const r = rowText(id); return row(id, sc(check(r.path, hl(r.label), { hint: r.hint }))); },

  colors: (id, s, c) => headed(id, `<div class="pnt-chips pnt-flames">${flameChips((c.flames ?? []).map((f) => ({ label: f.name, colors: f.colors })), s.colors.flame.light)}</div>`),
  flameMake: (id) => {
    const h = SETTINGS.scheme;
    const t = tip(h.hint, { control: true, label: h.label }); // (the select reads its hint out: its "?" is only for the eye)
    const opts = [['auto', 'Any Harmony'], ...SCHEMES.map((x) => [x.id, x.label])];
    return headed(id, `<div class="pnt-row">
        <button type="button" class="pix-btn" data-paint-act="flame-harmonious">Harmonious</button>
        <button type="button" class="pix-btn" data-paint-act="flame-random">Fully Random</button>
        <span class="pnt-inline"><label for="pnt-flame-scheme">${esc(h.label)}</label>${t.mark}<select id="pnt-flame-scheme" data-flame-scheme${t.ref}>${opts.map(([v, x]) => `<option value="${esc(v)}">${esc(x)}</option>`).join('')}</select></span>
      </div>`, 'pnt-make');
  },
  flameSeed: (id, s) => headed(id, `<div class="pnt-row"><input type="color" class="pnt-color" data-seed="flame" aria-label="A color to build flames round" value="${esc(s.colors.flame.mid)}"></div>
      <div class="pnt-chips pnt-flames" data-suggest="flame"></div>`),
  flameRamp: (id) => colorRow(id, 'colors.flame', RAMP_LABELS, '<p class="pnt-note" data-readable hidden>The tips were lightened to stay readable.</p>'),
  flameLight: rangeRow,
  sceneColors: (id, s, c) => {
    const b = c.siteBase;
    return headed(id, `<div class="pnt-chips">
        ${chip('colors.scenery', null, 'The Site’s Own', { colors: [b.void, b.shadow, b.stone, b.wood, b.bone] })}
        <button type="button" class="pix-btn" data-paint-act="scenery-harmonious">Harmonious</button>
        <button type="button" class="pix-btn" data-paint-act="scenery-vivid">Vivid</button>
        <button type="button" class="pix-btn" data-paint-act="scenery-random">Fully Random</button>
      </div>`);
  },
  sceneSeed: (id, s, c) => headed(id, `<div class="pnt-row"><input type="color" class="pnt-color" data-seed="scenery" aria-label="A color to build place colors round" value="${esc((s.colors.scenery ?? c.siteBase).stone)}"></div>
      <div class="pnt-chips" data-suggest="scenery"></div>`),
  sceneEdit: (id) => colorRow(id, 'colors.scenery', SCENE_LABELS, '<p class="pnt-note" data-darkest hidden>The background was darkened: it’s the darkest color (the outlines’).</p>'),
  palette: (id, s, c) => selectRow(id, c),
  paletteSlots: (id, s, c) => {
    const cols = slotColors(s, c.siteBase);
    return headed(id, `<div class="pnt-slots">${cols.map((col, i) => `<button type="button" class="pnt-slot" data-slot="${i}" aria-pressed="${s.render.palette.includes(i)}"${i === 0 ? ' disabled' : ''} aria-label="${esc(SLOT_NAMES[i])}"><i style="--c:${esc(col)}"></i></button>`).join('')}</div>`);
  },

  fireLevel: rangeRow, fireSize: rangeRow, fireHeight: rangeRow, fireTurbulence: rangeRow, fireGlow: rangeRow, windX: rangeRow, windZ: rangeRow,

  pixelSize: (id, s, c) => selectRow(id, c, { num: true }),
  dither: rangeRow,
  ditherMatrix: (id, s, c) => selectRow(id, c, { num: true }),
  outlines: (id) => triRow(id, { missing: 'on', audition: true }),
  flameFps: (id, s, c) => selectRow(id, c, { num: true }),

  looks: (id, s) => headed(id, `<div class="pnt-chips pnt-looks">${choices(id).map(([v, name]) => chip('look.name', v, name, { cls: 'pnt-look' })).join('')}</div>
      <p class="pnt-help" data-look-hint>${esc(itemHint('looks', s.look.name))}</p>`),
  param: detailField,
  glitch: rangeRow,
  xrayView: (id, s, c) => selectRow(id, c),

  pinAll: (id) => {
    const r = rowText(id);
    return row(id, `<button type="button" class="pix-btn" data-paint-act="pin-all">${hl(r.label)}</button>${tip(r.hint, { label: r.label }).mark}`, 'pnt-row pnt-pin-all');
  },
  layers: (id) => headed(id, bulkBar('layers', { kind: 'tri', label: 'Layers' })),
  layer: (id, s) => {
    const key = id.split('.')[1];
    const on = modeOf(s.layers[key]) !== 'off';
    const details = on ? LAYER_DETAILS[key] : [];
    const r = rowText(id);
    return `<div class="pnt-layer${on ? ' is-on' : ''}" data-layer="${key}" data-row="${esc(id)}">
        ${sc(tri(r.path, hl(r.label), { hint: r.hint, missing: 'off', attr: ' data-audition' }))}
        ${details.length ? `<div class="pnt-details">${details.map((k) => detailField(`detail.${k}`, s)).join('')}</div>` : ''}
      </div>`;
  },
  blends: (id) => {
    const r = rowText(id);
    return row(id, `${groupHead(r.label, r.hint)}
      ${Object.keys(LAYER_BLENDS).map((b) => {
        const br = rowText(`blend.${b}`);
        return row(`blend.${b}`, unset(sc(select(br.path, hl(br.label), choices(`blend.${b}`), { hint: br.hint }))));
      }).join('')}`, 'pnt-sub');
  },

  cameraDrag: (id) => {
    const r = rowText(id);
    return row(id, `<p class="pnt-help"><strong data-hl>${esc(r.label)}</strong>: ${esc(r.hint)} Q and E tilt the horizon, [ and ] change the lens.</p>`);
  },
  shot: (id, s, c) => headed(id, `<div class="pnt-chips">${(c.shots ?? []).map((x) => chip('camera', x.camera, x.name)).join('')}</div>`),
  lens: rangeRow,
  tilt: rangeRow,
  camera: (id, s, c) => selectRow(id, c),
  moveAmount: rangeRow,
  moveBars: (id, s, c) => selectRow(id, c, { num: true }),

  knightCount: rangeRow,
  knightSeat: (id, s, c) => selectRow(id, c),
  knightHelmets: (id, s) => helmetRows(s.knights.count),
  knightStyle: (id, s, c) => selectRow(id, c),
  knightFinish: (id, s, c) => selectRow(id, c),
  knightGlow: (id) => triRow(id, { missing: 'mix' }),
  knightRim: rangeRow,
  knightShine: (id) => triRow(id),
  knightDance: (id) => triRow(id),
  knightFormation: (id, s, c) => selectRow(id, c),
  knightMoves: pickList,
  knightReactions: (id) => triRow(id),
  // (Its label is the preview's sub-heading's name: the row is the buttons.)
  gestures: (id) => row(id, `<div class="pnt-chips" role="group" aria-labelledby="pnt-g-preview">${choices(id).map(([g, name]) => `<button type="button" class="pix-btn" data-paint-act="gesture" data-gesture="${esc(g)}">${esc(name)}</button>`).join('')}</div>`),

  flyLit: rangeRow,
  flyShow: (id, s, c) => selectRow(id, c),
  flyMoves: pickList,
  flySpeed: rangeRow,

  sceneHold: (id) => headed(id, `<div class="pnt-chips">${choices(id).map(([v, name]) => chip('music', v, name, { audition: false })).join('')}</div>
      <p class="pnt-help">${esc(MUSIC_HELP)}</p>`),
  weapon: (id, s, c) => selectRow(id, c),
  element: (id, s, c) => selectRow(id, c),
  dropSource: (id, s) => {
    const [[, show], [, own]] = choices(id);
    return headed(id, `<div class="pnt-chips">${chip('drops', null, show, { audition: false })}<button type="button" class="pnt-chip" data-paint-act="drops-own" aria-pressed="${s.drops !== null}"><span>${esc(own)}</span></button></div>`);
  },
  dropFx: (id) => headed(id, bulkBar('drops.fx', { kind: 'tri', label: rowText(id).label })),
  dropFxItem: (id) => triRow(id),
  dropCount: (id, s, c) => selectRow(id, c, { num: true }),
};
/** A row's markup. */
function rowMarkup(id, scene, c) {
  const kind = id.includes('.') ? id.split('.')[0] : id;
  const draw = kind === 'dropFx' && id !== 'dropFx' ? ROWS.dropFxItem : ROWS[kind];
  return draw ? draw(id, scene, c) : '';
}

/** panelMarkup's ctx, with the site's place colors filled in. */
const context = (ctx) => ({ ...ctx, siteBase: ctx.siteBase ?? SITE_BASE });

/**
 * One section's body (what's drawn again when its shape changes): its rows by group, each
 * of the Knights' groups under its sub-heading (but the first, which the section's own
 * heading names, and none while there's only the one group: no knights by the fire). A
 * section with Off / In the Mix / Always switches says what those mean once, over its first.
 * @param {string} id  a section (SECTIONS)
 * @param {any} scene
 * @param {PanelCtx} [ctx]
 */
export function sectionMarkup(id, scene, ctx = {}) {
  const c = context(ctx);
  let said = false;
  const rowOf = (r) => {
    const html = rowMarkup(r, scene, c);
    if (said || !html || !isTri(r)) return html;
    said = true;
    return triHelp() + html;
  };
  const groups = sectionRows(id)
    .map(([g, rows]) => /** @type {const} */ ([g, rows.filter((r) => rowShown(r, scene)).map(rowOf).join('')]))
    .filter(([, html]) => html);
  const heads = groups.length > 1;
  const name = PANEL_SECTIONS.find((s) => s.id === id)?.label;
  const body = groups.map(([g, html]) => {
    if (!g.head || !heads || g.head === name) return html;
    const t = g.id === 'preview' ? tip(OWN.gestures.hint, { label: g.head }).mark : '';
    // (The heading's name has an id of its own: a group it heads is named by it alone, not
    // by its "?" and the hint's hidden text too.)
    return `<div class="pnt-group" data-group="${esc(g.id)}"><h3 class="pnt-subhead"><span data-hl id="pnt-g-${esc(g.id)}">${esc(g.head)}</span>${t ? ` ${t}` : ''}</h3>${html}</div>`;
  }).join('');
  return (id === 'fire' ? `<p class="pnt-help">${esc(FIRE_HELP)}</p>` : '') + body;
}

/** A folding section of the panel. */
function section(id, name, body, open) {
  return `<section class="pnt-sec" data-sec="${id}"${open ? ' data-open' : ''} aria-labelledby="pnt-h-${id}">
    <h2 class="pnt-sec-head"><button type="button" id="pnt-h-${id}" data-sec-toggle="${id}" aria-expanded="${open}" aria-controls="pnt-b-${id}"><span>${esc(name)}</span>${ICONS.fold}</button></h2>
    <div class="pnt-sec-body" id="pnt-b-${id}"${open ? '' : ' hidden'}>${body}</div>
  </section>`;
}

/**
 * What the panel's layout depends on (not its values), as one string: every section's
 * (layout.js sectionShapes; bindPanel redraws only the sections whose own changed).
 * @param {any} scene
 */
export const panelShape = (scene) => JSON.stringify(sectionShapes(scene));

/**
 * The panel's markup for `scene`: the phones' strip of section tabs, then every section.
 * @param {any} scene
 * @param {PanelCtx} [ctx]  the page's lists (weapons by key, the site's flames, Bonfire Live's
 *   shots), the site's place colors and own render values, and which sections are open
 *   (default: Place & Atmosphere)
 */
export function panelMarkup(scene, ctx = {}) {
  const open = new Set(ctx.open ?? ['place']);
  return `
    <nav class="pnt-tabs" aria-label="Panel sections">${SECTIONS.map(([id, name]) => `<button type="button" data-sec-tab="${id}" aria-pressed="${open.has(id)}">${esc(name)}</button>`).join('')}</nav>
    ${SECTIONS.map(([id, name]) => section(id, name, sectionMarkup(id, scene, ctx), open.has(id))).join('')}`;
}

// --- bulk -----------------------------------------------------------------------------------
/** The grids a bulk toolbar sets: their items by key (looks.js), what each is called in a note. */
const GRIDS = { layers: [LAYERS, 'Layers'], 'drops.fx': [DROP_FX, 'This Scene’s Hits'] };
const LISTS = { 'knights.moves': [KNIGHT_MOVES, 'Dance Moves'], 'fireflies.moves': [FLY_MOVES, 'Firefly Dances'] };
/**
 * What a bulk toolbar's button does to the scene, as one edit ({ path, value }: one undo
 * step), or null when it can't (the scene has no drop hits of its own). A grid: Off / In the
 * Mix / Always set every switch (Off ones left out, as a new scene leaves them), Shuffle rolls
 * each with `rand`, Defaults is a new scene's (all Off). A move list: All or None (one stays:
 * the list keeps at least one) or Shuffle; Defaults leaves it to the show (null), as a new
 * scene does. `name`: what the grid is called, for a note.
 * @param {any} scene @param {string} group  the toolbar's data-bulk-group (a path)
 * @param {string} action  its data-bulk
 * @param {() => number} [rand]
 * @returns {{ path: string, value: any, name: string } | null}
 */
export function bulkEdit(scene, group, action, rand = Math.random) {
  if (Object.hasOwn(GRIDS, group)) {
    if (group === 'drops.fx' && !scene.drops) return null;
    const [names, name] = GRIDS[group];
    const keys = Object.keys(names);
    const cur = getPath(scene, group) ?? {};
    const now = Object.fromEntries(keys.map((k) => [k, modeOf(cur[k])]));
    const next = action === 'defaults' ? {} : bulkValues(action, keys, now, {}, rand);
    return { path: group, value: Object.fromEntries(Object.entries(next).filter(([, v]) => v !== 'off')), name };
  }
  if (Object.hasOwn(LISTS, group)) {
    const [names, name] = LISTS[group];
    if (action === 'defaults') return { path: group, value: null, name };
    const keys = Object.keys(names);
    const list = getPath(scene, group);
    const now = Object.fromEntries(keys.map((k) => [k, Array.isArray(list) ? list.includes(k) : true]));
    const next = bulkValues(action, keys, now, {}, rand, { minOne: true });
    return { path: group, value: keys.filter((k) => next[k]), name };
  }
  return null;
}

// --- binding ----------------------------------------------------------------------------
const decimals = (step) => { const s = String(step); return s.includes('.') ? s.split('.')[1].length : 0; };
/** What names a focusable thing in the panel (so a redraw can focus it again). */
const FOCUS_ATTRS = ['data-scene', 'data-pick', 'data-value', 'data-sec-toggle', 'data-sec-tab', 'data-paint-act', 'data-gesture', 'data-slot',
  'data-list-show', 'data-list-item', 'data-seed', 'data-flame-scheme', 'data-bulk', 'data-bulk-group', 'data-tip'];
/** How long a field stays "under the hand" after the user moves it (ms): fill() leaves it be. */
const HAND_MS = 300;

/**
 * Wire a panel drawn by panelMarkup into `root`.
 * @param {HTMLElement} root
 * @param {{
 *   get: () => any,
 *   edit: (path: string, value: unknown, o?: { key?: string | null }) => (boolean | void),
 *   audition: (scene: any | null) => void,
 *   act: (name: string, el: HTMLElement) => void,
 *   live?: () => any,
 *   ctx: () => PanelCtx,
 *   open?: Iterable<string>,
 *   onSection?: (open: string[]) => void,
 *   onBulk?: (note: string) => void,
 *   onDraw?: () => void,
 * }} o
 *   `get` the scene; `edit` changes one path (`key`: which field, for undo's merging);
 *   `audition` shows a scene on the stage for a moment (null: back to the scene); `act` an
 *   action button; `live` what the look is doing now (looks.js details); `ctx` panelMarkup's;
 *   `open` the sections open to start with; `onSection` every open section, after one is
 *   opened or closed by hand (the page keeps them); `onBulk` a bulk toolbar's note (one undo
 *   step); `onDraw` after the panel or a section of it is drawn again (the search goes over it).
 */
export function bindPanel(root, { get, edit, audition, act, live = () => null, ctx, open: opened = ['place'], onSection = () => {}, onBulk = () => {}, onDraw = () => {} }) {
  /** @type {Record<string, string>} */
  let shapes = {};
  const ids = new Set(SECTIONS.map(([id]) => id));
  const open = new Set([...opened].filter((id) => ids.has(id)));
  if (!open.size) open.add('place');
  let auditioning = null;
  let dragging = null;    // the slider a pointer is down on (a redraw waits for it)
  let drawLater = false;  // a redraw that waited
  let handAt = 0;         // when the focused field was last moved by the user (performance.now)
  /** @type {Map<string, { ranges: [number, number][], label: string }> | null} */
  let filter = null;      // the search's rows while it has a query (panelSearch.js)
  /** @type {Set<string> | null} */
  let openBefore = null;  // the sections open before a search opened those it found things in

  /**
   * What the focused element in the panel is, as a selector that finds it again in a fresh
   * drawing (its path, its chip's value, its lock, its button), or null.
   */
  function focusKey() {
    const el = /** @type {HTMLInputElement | null} */ (document.activeElement);
    if (!el || el === root || !root.contains(el)) return null;
    // (A lock's tip says whether it's pinned, which a click just changed: it's its path alone.)
    if (el.hasAttribute('data-lock')) return `[data-lock="${CSS.escape(el.getAttribute('data-lock'))}"]`;
    let own = FOCUS_ATTRS.filter((a) => el.hasAttribute(a)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('');
    if (!own) return null;
    if (el.type === 'radio') own += `[value="${CSS.escape(el.value)}"]`; // (a switch's three share a path)
    // (A move in a list is named by its list: the knights' and the fireflies' share ids.)
    const list = /** @type {HTMLElement | null} */ (el.closest('[data-list]'));
    return list && (el.hasAttribute('data-list-item') || el.hasAttribute('data-bulk')) ? `[data-list="${CSS.escape(list.dataset.list)}"] ${own}` : own;
  }
  function refocus(key) {
    if (key) /** @type {HTMLElement | null} */ (root.querySelector(key))?.focus({ preventScroll: true });
  }

  /** The whole panel again (a scene opened). */
  function draw() {
    const scene = get();
    const scroll = root.scrollTop;
    const focus = focusKey();
    root.innerHTML = panelMarkup(scene, { ...ctx(), open });
    shapes = sectionShapes(scene);
    drawLater = false;
    root.scrollTop = scroll;
    refocus(focus);
    fillValues(scene, { force: true });
    applyFilter();
    onDraw();
  }
  /** Only `which` sections again (their shapes changed): their bodies, freshly drawn. */
  function drawSections(scene, which) {
    const scroll = root.scrollTop;
    const c = { ...ctx(), open };
    const bodies = which.map((id) => /** @type {HTMLElement | null} */ (root.querySelector(`#pnt-b-${id}`))).filter(Boolean);
    const focus = bodies.some((b) => b.contains(document.activeElement)) ? focusKey() : null;
    for (const body of bodies) body.innerHTML = sectionMarkup(body.id.slice('pnt-b-'.length), scene, c);
    shapes = sectionShapes(scene);
    drawLater = false;
    root.scrollTop = scroll;
    refocus(focus);
    return bodies;
  }

  /**
   * Every value from the scene (and the rolled details from what's on screen); a section
   * whose shape changed is drawn again first. The field under the user's hand (focused, and
   * dragged or moved in the last moment) keeps what it shows, unless `force` (undo and redo:
   * the scene went back, the field goes with it).
   * @param {{ force?: boolean }} [o]
   */
  function fill({ force = false } = {}) {
    const scene = get();
    const next = sectionShapes(scene);
    const changed = Object.keys(next).filter((id) => next[id] !== shapes[id]);
    /** @type {HTMLElement[]} */
    let fresh = [];
    if (changed.length) {
      if (dragging) drawLater = true; // (the drag ends first: its slider stays under the pointer)
      else fresh = drawSections(scene, changed);
    }
    fillValues(scene, { force, fresh });
    if (fresh.length) {
      applyFilter();
      onDraw();
    }
  }
  /** @param {any} scene @param {{ force?: boolean, fresh?: HTMLElement[] }} o  fresh: sections just drawn (every field set) */
  function fillValues(scene, { force = false, fresh = [] }) {
    const now = live();
    const busy = (input) => !force && input === document.activeElement && input.type !== 'checkbox' && input.type !== 'radio' && input.tagName !== 'SELECT'
      && (input === dragging || performance.now() - handAt < HAND_MS) && !fresh.some((b) => b.contains(input));
    for (const el of root.querySelectorAll('[data-scene]')) {
      const input = /** @type {HTMLInputElement} */ (el);
      const path = input.dataset.scene;
      let v = getPath(scene, path);
      if (input.type === 'radio') { // (Off / In the Mix / Always: missing is the one marked so)
        input.checked = v === undefined || v === null ? input.hasAttribute('data-missing') : modeOf(v) === input.value;
        continue;
      }
      const rolled = v === undefined && /^(details|look\.params)\./.test(path);
      if (rolled) v = liveValue(now, path);
      if (path === 'render.palette') v = Array.isArray(v) ? 'few' : v;
      if (!busy(input)) { // (not under the user's hand; its number follows it all the same)
        if (input.type === 'checkbox') input.checked = !!v;
        else input.value = v === null || v === undefined ? '' : String(v);
      }
      const out = root.querySelector(`[data-out="${CSS.escape(path)}"]`);
      if (out && typeof v === 'number') out.textContent = v.toFixed(decimals(input.step || '0.01'));
    }
    fillChoices(scene);
  }
  /** The chips pressed, the move lists ticked, the helmet rows, the few colors and the notes, as the scene has them. */
  function fillChoices(scene) {
    for (const b of root.querySelectorAll('[data-pick]')) {
      const btn = /** @type {HTMLElement} */ (b);
      const v = getPath(scene, btn.dataset.pick);
      const pressed = v === undefined ? btn.hasAttribute('data-missing') : JSON.stringify(v) === btn.dataset.value;
      btn.setAttribute('aria-pressed', String(pressed));
    }
    // (A list's boxes follow its moves: a bulk button, undo and redo change them without a
    // redraw. A box ticked by hand is read from them, so a stale one would drop a move.)
    for (const l of root.querySelectorAll('[data-list]')) {
      const list = getPath(scene, /** @type {HTMLElement} */ (l).dataset.list);
      const own = Array.isArray(list);
      const show = /** @type {HTMLInputElement | null} */ (l.querySelector('[data-list-show]'));
      if (show) show.checked = !own;
      for (const c of l.querySelectorAll('[data-list-item]')) {
        /** @type {HTMLInputElement} */ (c).checked = own && list.includes(/** @type {HTMLElement} */ (c).dataset.listItem);
      }
    }
    // As many helmet rows as knights.
    for (const r of root.querySelectorAll('[data-helmet]')) /** @type {HTMLElement} */ (r).hidden = Number(/** @type {HTMLElement} */ (r).dataset.helmet) >= scene.knights.count;
    // The few colors: which are picked, in the scene's colors now.
    if (Array.isArray(scene.render.palette)) {
      const cols = slotColors(scene, ctx().siteBase);
      for (const b of root.querySelectorAll('[data-slot]')) {
        const i = Number(/** @type {HTMLElement} */ (b).dataset.slot);
        b.setAttribute('aria-pressed', String(scene.render.palette.includes(i)));
        /** @type {HTMLElement} */ (b.firstElementChild)?.style.setProperty('--c', cols[i]);
      }
    }
    lookHint(auditioning?.dataset.pick === 'look.name' ? JSON.parse(auditioning.dataset.value) : scene.look.name);
    // (The page says when the rules moved a color: the tips lightened, the background darkened.)
    const readable = /** @type {HTMLElement | null} */ (root.querySelector('[data-readable]'));
    if (readable) readable.hidden = !root.dataset.lightened;
    const darkest = /** @type {HTMLElement | null} */ (root.querySelector('[data-darkest]'));
    if (darkest) darkest.hidden = !root.dataset.darkened;
  }
  /** The line under the looks says what the look (painted, or hovered) does. */
  function lookHint(name) {
    const el = root.querySelector('[data-look-hint]');
    const text = itemHint('looks', name);
    if (el && el.textContent !== text) el.textContent = text;
  }
  // A slider held: a redraw its edits call for waits until it's let go.
  root.addEventListener('pointerdown', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.matches?.('input[type="range"]')) dragging = t;
  });
  const letGo = () => {
    if (!dragging) return;
    dragging = null;
    handAt = performance.now();
    if (drawLater) fill();
  };
  window.addEventListener('pointerup', letGo);
  window.addEventListener('pointercancel', letGo);

  /** What a rolled detail is on screen now (looks.js details), for its dimmed field. */
  function liveValue(now, path) {
    if (!now) return undefined;
    const key = path.split('.').pop();
    const at = path.match(/^details\.grad\.(\d)$/);
    if (at) return now.p?.grad?.[Number(at[1])];
    if (path.startsWith('look.params.')) return now[key];
    if (key === 'scan' || key === 'mirror') return now[key];
    return now.p?.[key];
  }
  /** Just the rolled details' values (they change with each look's turn). */
  function refreshLive() {
    const now = live();
    if (!now) return;
    for (const d of root.querySelectorAll('.pnt-detail.is-rolled [data-scene]')) {
      const input = /** @type {HTMLInputElement} */ (d);
      if (input === document.activeElement) continue;
      const v = liveValue(now, input.dataset.scene);
      if (v === undefined) continue;
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = String(v);
      const out = root.querySelector(`[data-out="${CSS.escape(input.dataset.scene)}"]`);
      if (out && typeof v === 'number') out.textContent = v.toFixed(decimals(input.step || '0.01'));
    }
  }

  /** An input's value as the scene keeps it. */
  function read(input) {
    const path = input.dataset.scene;
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'range' || input.type === 'number') return Number(input.value);
    const v = input.value;
    if (input.tagName === 'SELECT') {
      if (v === '') return input.hasAttribute('data-unset') ? undefined : null;
      if (input.hasAttribute('data-num')) return Number(v);
      if (path === 'render.palette' && v === 'few') {
        const cur = get().render.palette;
        return Array.isArray(cur) ? cur : [0, 6, 8];
      }
    }
    return v;
  }
  /** Set one path; a rolled detail's slot of the gradient pins the whole gradient first. */
  function editInput(input) {
    const path = input.dataset.scene;
    const grad = path.match(/^details\.grad\.(\d)$/);
    if (grad && getPath(get(), 'details.grad') === undefined) {
      const now = live()?.p?.grad ?? [0, 6, 8];
      const g = [...now];
      g[Number(grad[1])] = Number(input.value);
      edit('details.grad', g, { key: 'details.grad' });
      return;
    }
    edit(path, read(input), { key: path });
  }
  /** A field that takes its edit on `change` (a click's, not a drag's). */
  const changesOnce = (input) => input.type === 'checkbox' || input.type === 'radio' || input.tagName === 'SELECT';
  root.addEventListener('input', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    handAt = performance.now();
    if (input.dataset?.scene && !changesOnce(input)) editInput(input);
    else if (input.dataset?.seed) act(`seed-${input.dataset.seed}`, input);
  });
  root.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input === dragging) letGo();
    if (input.dataset?.scene && changesOnce(input)) {
      if (input.type === 'radio' && auditioning?.contains(input)) auditioning = null; // (kept: it's the scene now)
      editInput(input);
    } else if (input.dataset?.scene) edit(input.dataset.scene, read(input), { key: null }); // (a drag ended: the next is a step of its own)
    else if (input.hasAttribute?.('data-list-show')) {
      const path = input.dataset.listShow;
      edit(path, input.checked ? null : Object.keys(path.startsWith('knights') ? KNIGHT_MOVES : FLY_MOVES), { key: null });
    } else if (input.hasAttribute?.('data-list-item')) {
      const list = /** @type {HTMLElement} */ (input.closest('[data-list]'));
      const path = list.dataset.list;
      const picked = [...list.querySelectorAll('[data-list-item]')].filter((c) => /** @type {HTMLInputElement} */ (c).checked).map((c) => /** @type {HTMLElement} */ (c).dataset.listItem);
      if (!picked.length) { input.checked = true; return; } // (at least one)
      edit(path, picked, { key: null });
    } else if (input.hasAttribute?.('data-flame-scheme')) act('flame-scheme', input);
  });
  root.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const pick = /** @type {HTMLElement} */ (t.closest('[data-pick]'));
    if (pick) {
      auditioning = null;
      edit(pick.dataset.pick, JSON.parse(pick.dataset.value), { key: null });
      return;
    }
    const lock = /** @type {HTMLElement} */ (t.closest('[data-lock]'));
    if (lock) {
      const path = lock.dataset.lock;
      const cur = getPath(get(), path);
      if (cur !== undefined) edit(path, undefined, { key: null });
      else {
        const v = path === 'details.grad' ? live()?.p?.grad : liveValue(live(), path);
        const input = /** @type {HTMLInputElement} */ (root.querySelector(`[data-scene="${CSS.escape(path)}"]`));
        edit(path, v ?? (input ? read(input) : undefined), { key: null });
      }
      return;
    }
    const bulk = /** @type {HTMLElement} */ (t.closest('[data-bulk]'));
    if (bulk) {
      if (bulk.getAttribute('aria-disabled') === 'true') return;
      const change = bulkEdit(get(), bulk.dataset.bulkGroup, bulk.dataset.bulk);
      if (change && edit(change.path, change.value, { key: null }) !== false) onBulk(`${change.name}: ${bulk.textContent.trim()}. Ctrl+Z undoes it.`);
      return;
    }
    const slot = /** @type {HTMLElement} */ (t.closest('[data-slot]'));
    if (slot) {
      const i = Number(slot.dataset.slot);
      const cur = get().render.palette;
      if (!Array.isArray(cur) || i === 0) return;
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].slice(0, 4);
      if (next.length >= 2) edit('render.palette', [0, ...next.filter((x) => x !== 0)], { key: null });
      return;
    }
    const toggle = /** @type {HTMLElement} */ (t.closest('[data-sec-toggle]'));
    if (toggle) { setOpen(toggle.dataset.secToggle, !open.has(toggle.dataset.secToggle)); return; }
    const tab = /** @type {HTMLElement} */ (t.closest('[data-sec-tab]'));
    if (tab) {
      // (Phones: one section at a time.)
      for (const id of [...open]) if (id !== tab.dataset.secTab) setOpen(id, false);
      setOpen(tab.dataset.secTab, true);
      return;
    }
    const a = /** @type {HTMLElement} */ (t.closest('[data-paint-act]'));
    if (a) act(a.dataset.paintAct, a);
  });
  // Hover = audition: the chip's (or a layer's choice's) scene on the stage while the
  // pointer is on it.
  /** What an audition shows: [path, value]. */
  const auditionOf = (c) => {
    if (c.dataset.pick) return [c.dataset.pick, JSON.parse(c.dataset.value)];
    const input = /** @type {HTMLInputElement | null} */ (c.querySelector('input[data-scene]'));
    return input ? [input.dataset.scene, input.value] : null;
  };
  root.addEventListener('pointerover', (e) => {
    const c = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-audition]'));
    if (!c || c === auditioning || e.pointerType === 'touch') return;
    const shows = auditionOf(c);
    if (!shows) return;
    auditioning = c;
    audition(withPath(get(), shows[0], shows[1]));
    if (shows[0] === 'look.name') lookHint(shows[1]);
  });
  root.addEventListener('pointerout', (e) => {
    if (!auditioning) return;
    const to = /** @type {HTMLElement} */ (e.relatedTarget);
    if (to && auditioning.contains(to)) return;
    auditioning = null;
    audition(null);
    lookHint(get().look.name);
  });

  /** @param {string} id @param {boolean} on @param {{ save?: boolean }} [o]  save: by hand (the page keeps it) */
  function setOpen(id, on, { save = true } = {}) {
    if (on) open.add(id); else open.delete(id);
    const sec = root.querySelector(`[data-sec="${id}"]`);
    if (!sec) return;
    sec.toggleAttribute('data-open', on);
    /** @type {HTMLElement} */ (sec.querySelector('.pnt-sec-body')).hidden = !on;
    sec.querySelector('[data-sec-toggle]').setAttribute('aria-expanded', String(on));
    root.querySelector(`[data-sec-tab="${id}"]`)?.setAttribute('aria-pressed', String(on));
    if (save && !filter) onSection([...open]);
  }

  /**
   * The search's rows shown, the rest hidden: a row found shows with the rows inside it (a
   * layer's details) and round it; a section or group with nothing left goes, one with
   * something is opened; what matched in a label is marked (escaped: settingsSearch.js
   * highlight). With no query, everything's back, and the sections open before it.
   */
  function applyFilter() {
    root.toggleAttribute('data-searching', !!filter);
    for (const m of root.querySelectorAll('[data-hl].has-mark')) { m.replaceChildren(m.textContent); m.classList.remove('has-mark'); }
    const rows = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-row]')]);
    if (!filter) {
      for (const el of root.querySelectorAll('.is-miss')) el.classList.remove('is-miss');
      if (openBefore) {
        for (const [id] of SECTIONS) setOpen(id, openBefore.has(id), { save: false });
        openBefore = null;
      }
      return;
    }
    openBefore ??= new Set(open);
    const hits = rows.filter((r) => filter.has(r.dataset.row));
    for (const r of rows) r.classList.toggle('is-miss', !hits.some((h) => h === r || h.contains(r) || r.contains(h)));
    for (const h of hits) {
      const label = /** @type {HTMLElement | null} */ (h.querySelector('[data-hl]'));
      const found = filter.get(h.dataset.row);
      if (label && found?.ranges.length && label.textContent === found.label) {
        label.innerHTML = highlight(found.label, found.ranges);
        label.classList.add('has-mark');
      }
    }
    for (const g of root.querySelectorAll('[data-group]')) g.classList.toggle('is-miss', !g.querySelector('[data-row]:not(.is-miss)'));
    for (const [id] of SECTIONS) {
      const sec = root.querySelector(`[data-sec="${id}"]`);
      const any = !!sec?.querySelector('[data-row]:not(.is-miss)');
      sec?.classList.toggle('is-miss', !any);
      root.querySelector(`[data-sec-tab="${id}"]`)?.classList.toggle('is-miss', !any);
      if (any !== open.has(id)) setOpen(id, any, { save: false });
    }
  }
  /**
   * Where the panel scrolls to put row `id` at its top (under the phones' strip of tabs, which
   * stays over it), its section's heading with it when the row is near the section's start;
   * 0 for none.
   * @param {string | null} id
   */
  function scrollFor(id) {
    const el = id ? root.querySelector(`[data-row="${CSS.escape(id)}"]`) : null;
    if (!el) return 0;
    const top = root.getBoundingClientRect().top - root.scrollTop;
    const sec = el.closest('[data-sec]');
    const at = (n) => n.getBoundingClientRect().top - top;
    let y = at(el);
    if (sec && y - at(sec) < root.clientHeight / 3) y = at(sec);
    const tabs = /** @type {HTMLElement | null} */ (root.querySelector('.pnt-tabs'));
    const over = tabs && getComputedStyle(tabs).position === 'sticky' ? tabs.offsetHeight : 0;
    return Math.max(0, y - over - 8);
  }
  draw();
  return {
    fill,
    draw,
    refreshLive,
    /** Open a section (and scroll to it). */
    show(id) { setOpen(id, true); root.querySelector(`[data-sec="${id}"]`)?.scrollIntoView({ block: 'nearest' }); },
    get open() { return [...open]; },
    /** Suggestions for a seed color: chips drawn into the section (flame or place). */
    suggest(kind, html) { const el = root.querySelector(`[data-suggest="${kind}"]`); if (el) el.innerHTML = html; },
    /** Whether a hover audition is showing. */
    get auditioning() { return !!auditioning; },
    /** End an audition without waiting for the pointer (a key, a click elsewhere). */
    endAudition() { if (auditioning) { auditioning = null; audition(null); lookHint(get().look.name); } },
    /**
     * Show only the rows a search found (row id → its label and what matched in it), or
     * everything (null). Kept through every redraw until it's set again. `top` (a new query):
     * scrolled to row `to` (the best found), or to the top.
     * @param {Map<string, { ranges: [number, number][], label: string }> | null} rows
     * @param {{ top?: boolean, to?: string | null }} [o]
     */
    filter(rows, { top = false, to = null } = {}) {
      filter = rows;
      applyFilter();
      if (top) root.scrollTop = scrollFor(to);
    },
  };
}
