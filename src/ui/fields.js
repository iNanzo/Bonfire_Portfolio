// Settings fields as markup: the pieces Bonfire Live's settings dialog and the Painter's
// panel are built from. Each field is a label, a "?" that shows its hint, and one input
// bound by `data-set="<key>"` (a dotted key reaches into a group: "looks.glitch"). Whoever
// draws them wires the inputs: they only carry the key, never a handler. `adv` marks a field
// that only the "All settings" view shows (a `data-adv` attribute the page's CSS hides).
//
// The hints: the "?" is a small button beside the label (never inside it: a click on it
// would reach the field, and tick a checkbox). It shows its hint through the shared tooltip
// (src/ui/tooltip.js): on hover, on a tap, and while its field has the keyboard's focus. So a
// field's "?" isn't a keyboard stop of its own (tabindex -1): the field's input reads the
// hint out as its description (aria-describedby), and focusing it shows the tip. A group of
// switches (checks, modeGrid, triGrid) has one "?" for the group: each switch in it reads the
// group's hint out (after its own, if it has one), and focusing one shows its own tip, or the
// group's. A "?" drawn on its own (tip() without `control`: a hint no one input stands for)
// is a stop of its own instead, described by it; so is a grid's when some of its switches
// have hints of their own (focusing those shows theirs, so the grid's would never come up).
//
// A field with no hint keeps the simplest markup, its label wrapping its input; one with a
// hint names its input by id instead, so the "?" can sit beside the label rather than in it.
import { esc } from '../html.js';
import { MODES } from '../modes.js';

export { barOptions } from '../modes.js';

let uid = 0;
/** A field's label as plain text for an attribute (labels are markup: escaped, maybe tagged). */
const plain = (label) => String(label).replace(/<[^>]*>/g, '').replace(/"/g, '&quot;').trim();

/**
 * A "?" that shows `hint`, and the hidden text it's read out from. With `control`, the input
 * that takes `ref` stands for it (the "?" is for the eye, the pointer and touch: not a stop of
 * its own); without, the "?" is a keyboard stop of its own, described by it. `label` names the
 * button ("About <label>"; "Hint" without one).
 * @param {string} hint
 * @param {{ control?: boolean, label?: string }} [o]
 * @returns {{ mark: string, button: string, note: string, ref: string, id: string }} the "?"
 *   markup (`button` then `note`, the hidden hint: apart, for a "?" that goes where its text
 *   mustn't, in a legend), the aria-describedby attribute for the input, and the hint's id
 *   (to describe more than one input with it)
 */
export const tip = (hint, { control = false, label = '' } = {}) => {
  if (!hint) return { mark: '', button: '', note: '', ref: '', id: '' };
  const id = `viz-tip-${++uid}`;
  const name = label ? `About ${plain(label)}` : 'Hint';
  const button = `<button type="button" class="viz-tip" tabindex="${control ? -1 : 0}" data-tip="${esc(hint)}" aria-label="${name}" aria-describedby="${id}">?</button>`;
  const note = `<span class="visually-hidden" id="${id}">${esc(hint)}</span>`;
  return { mark: button + note, button, note, ref: ` aria-describedby="${id}"`, id };
};
const advAttr = (adv) => (adv ? ' data-adv' : '');
/** An aria-describedby attribute for these hint ids (empty ones left out), or ''. */
const describedBy = (...ids) => {
  const list = ids.filter(Boolean).join(' ');
  return list ? ` aria-describedby="${list}"` : '';
};

/**
 * A labelled field: the label (with its "?", and `after` it: a value, a unit) over one
 * control. `control(idAttr)` draws the control, taking the id its label names it by.
 * @param {string} label @param {{ mark: string, id: string }} t its tip()
 * @param {(idAttr: string) => string} control
 * @param {{ adv?: boolean, after?: string }} [o]
 */
const field = (label, t, control, { adv = false, after = '' } = {}) => {
  if (!t.id) {
    return `
  <label class="viz-field"${advAttr(adv)}>
    <span class="viz-field-label">${label} ${after}</span>
    ${control('')}
  </label>`;
  }
  const id = `viz-fld-${++uid}`;
  return `
  <div class="viz-field"${advAttr(adv)}>
    <span class="viz-field-label"><label for="${id}">${label}</label> ${t.mark}${after}</span>
    ${control(` id="${id}"`)}
  </div>`;
};

/**
 * A slider with its value shown beside the label (in `<output data-out="<key>">`).
 * @param {string} key @param {string} label @param {number} min @param {number} max @param {number} step
 * @param {{ hint?: string, unit?: string, adv?: boolean }} [opts]
 */
export const range = (key, label, min, max, step, { hint = '', unit = '', adv = false } = {}) => {
  const t = tip(hint, { control: true, label });
  const after = `<output data-out="${key}"></output>${unit ? `<span class="viz-unit">${unit}</span>` : ''}`;
  return field(label, t, (id) => `<input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}"${id}${t.ref}>`, { adv, after });
};

/**
 * A number typed in (a port, a count): a box rather than a slider, for values too many to
 * drag through.
 * @param {string} key @param {string} label
 * @param {{ hint?: string, unit?: string, adv?: boolean, min?: number, max?: number, step?: number }} [opts]
 */
export const number = (key, label, { hint = '', unit = '', adv = false, min, max, step = 1 } = {}) => {
  const t = tip(hint, { control: true, label });
  const limits = `${min === undefined ? '' : ` min="${min}"`}${max === undefined ? '' : ` max="${max}"`} step="${step}"`;
  const after = unit ? `<span class="viz-unit">${unit}</span>` : '';
  // (A phone's numeric keypad has no decimal point: a fraction's step gets the decimal one.)
  const keypad = Number.isInteger(step) ? 'numeric' : 'decimal';
  return field(label, t, (id) => `<input type="number" data-set="${key}"${limits} inputmode="${keypad}"${id}${t.ref}>`, { adv, after });
};

/**
 * A line of text (at most `max` characters).
 * @param {string} key @param {string} label
 * @param {{ hint?: string, adv?: boolean, max?: number, placeholder?: string }} [opts]
 */
export const text = (key, label, { hint = '', adv = false, max = 60, placeholder = '' } = {}) => {
  const t = tip(hint, { control: true, label });
  return field(label, t, (id) => `<input type="text" data-set="${key}" maxlength="${max}" placeholder="${esc(placeholder)}" autocomplete="off"${id}${t.ref}>`, { adv });
};

/**
 * One checkbox. `group`: the hint id of the group it's in (checks()), read out after its own.
 * @param {string} key @param {string} label (markup: escape it first)
 * @param {{ hint?: string, adv?: boolean, group?: string }} [opts]
 */
export const check = (key, label, { hint = '', adv = false, group = '' } = {}) => {
  const t = tip(hint, { control: true, label });
  const box = `<input type="checkbox" data-set="${key}"${describedBy(t.id, group)}><span>${label}</span>`;
  if (!t.id) return `<label class="viz-check"${advAttr(adv)}${group ? ' data-group-tip' : ''}>${box}</label>`;
  return `<div class="viz-check"${advAttr(adv)}><label>${box}</label>${t.mark}</div>`;
};

/**
 * A row of checkboxes, one per entry of `names` ({ id: label }), for settings[group], each
 * reading out the group's hint. `bulk`: with a toolbar of All / None / Defaults over them
 * (bulkBar; `minOne`: the group keeps at least one on, so None can't empty it).
 * @param {string} group @param {string} label @param {Record<string, string>} names
 * @param {{ hint?: string, adv?: boolean, bulk?: boolean, minOne?: boolean }} [opts]
 */
export const checks = (group, label, names, { hint = '', adv = false, bulk = false, minOne = false } = {}) => {
  const t = tip(hint, { control: true, label });
  return `
  <div${advAttr(adv)}${t.id ? ' data-tip-group' : ''}>
    <p class="viz-field-label">${label} ${t.mark}</p>${bulk ? `
    ${bulkBar(group, { kind: 'checks', minOne, label })}` : ''}
    <div class="viz-checks"${bulk ? ` data-bulk-list="${esc(group)}"` : ''}>${Object.entries(names).map(([id, name]) => check(`${group}.${id}`, esc(name), { group: t.id })).join('')}</div>
  </div>`;
};

/**
 * A select's choices from a { value: label } map, with an optional first one.
 * @param {Record<string, string>} names @param {[string, string] | null} [first]
 * @returns {[string, string][]}
 */
export const options = (names, first = null) => [...(first ? [first] : []), ...Object.entries(names)];

/**
 * A dropdown.
 * @param {string} key @param {string} label @param {string[][]} opts [value, text] pairs
 * @param {{ hint?: string, adv?: boolean }} [opts]
 */
export const select = (key, label, opts, { hint = '', adv = false } = {}) => {
  const t = tip(hint, { control: true, label });
  return field(label, t, (id) => `<select data-set="${key}"${id}${t.ref}>${opts.map(([v, text]) => `<option value="${esc(v)}">${esc(text)}</option>`).join('')}</select>`, { adv });
};

/**
 * Whether some of a grid's switches have hints of their own: then focusing one shows its own
 * tip, never the grid's, so the grid's "?" is a keyboard stop of its own.
 * @param {[string, string, string?][]} items
 */
const ownHints = (items) => items.some(([, , itemHint]) => !!itemHint);

// Effect switches: Off / In the Mix / Always.
export const MIX_HINT = 'In the Mix: it comes and goes, rolled again each time the look changes. Always: on the whole time.';

/**
 * One effect's switch (a select of MODES, like any other), its hint ending with what the
 * three settings mean.
 * @param {string} key @param {string} label @param {{ hint?: string, adv?: boolean }} [opts]
 */
export const mode = (key, label, { hint = '', adv = false } = {}) => select(key, label, MODES, { hint: `${hint} ${MIX_HINT}`.trim(), adv });

/**
 * A grid of effect switches: `items` are [settings key, name, hint?]. Keys may point into
 * a group ("looks.glitch"); `noAlways` lists keys that only take off and in the mix. Each
 * switch reads out its own hint, then the grid's.
 * @param {string} label @param {[string, string, string?][]} items
 * @param {{ hint?: string, adv?: boolean, noAlways?: string[] }} [opts]
 */
export const modeGrid = (label, items, { hint = '', adv = false, noAlways = [] } = {}) => {
  const t = tip(hint, { control: !ownHints(items), label });
  return `
  <div${advAttr(adv)}${t.id ? ' data-tip-group' : ''}>
    <p class="viz-field-label">${label} ${t.mark}</p>
    <div class="viz-modes">${items.map(([key, name, itemHint]) => {
      const it = tip(itemHint, { control: true, label: esc(name) });
      const choices = MODES.filter(([v]) => v !== 'on' || !noAlways.includes(key)).map(([v, text]) => `<option value="${v}">${esc(text)}</option>`).join('');
      const pick = (id) => `<select data-set="${key}"${id} aria-label="${esc(name)}"${describedBy(it.id, t.id)}>${choices}</select>`;
      if (!it.id) return `<label class="viz-mode"${t.id ? ' data-group-tip' : ''}><span>${esc(name)}</span>${pick('')}</label>`;
      const id = `viz-fld-${++uid}`;
      return `<div class="viz-mode"><label for="${id}">${esc(name)}</label>${it.mark}${pick(` id="${id}"`)}</div>`;
    }).join('')}</div>
  </div>`;
};

/**
 * One effect's switch as three radio buttons, Off / In the Mix / Always (one keyboard stop:
 * the arrow keys move along it). Each radio carries `data-set` and its value, so a page reads
 * one the way it reads a select (the checked radio's value). The fieldset carries
 * `data-set-group="<key>"`, and `data-no-always` where there's no Always (`noAlways`).
 * `missing`: the value marked `data-missing` (what a missing value means, the Painter's);
 * `group`: the hint id of the grid it's in, read out after its own; `attr`: more attributes
 * for each choice's label (the Painter's data-audition).
 *
 * The "?" sits in the legend: a disabled fieldset disables every button in it but those in
 * its legend, and a switch that's off for now still has to say what it does (to a finger
 * too). The legend's name alone names the group (aria-labelledby), not the "?" in it, and
 * the hint's hidden text stays out of it.
 * @param {string} key @param {string} label (markup: escape it first)
 * @param {{ hint?: string, adv?: boolean, noAlways?: boolean, missing?: string, group?: string, attr?: string }} [opts]
 */
export const tri = (key, label, { hint = '', adv = false, noAlways = false, missing = '', group = '', attr = '' } = {}) => {
  const t = tip(hint, { control: true, label });
  const name = `viz-tri-${++uid}`;
  const choices = MODES.filter(([v]) => v !== 'on' || !noAlways).map(([v, text]) => (
    `<label class="tri-opt"${attr}><input type="radio" name="${name}" data-set="${key}" value="${v}"${v === missing ? ' data-missing' : ''}><span>${esc(text)}</span></label>`
  )).join('');
  const nameId = t.id ? `${name}-name` : '';
  const legend = `<legend><span class="tri-name"${nameId ? ` id="${nameId}"` : ''}>${label}</span>${t.id ? ` ${t.button}` : ''}</legend>${t.note}`;
  return `<fieldset class="tri"${advAttr(adv)} data-set-group="${esc(key)}"${noAlways ? ' data-no-always' : ''}${nameId ? ` aria-labelledby="${nameId}"` : ''}${describedBy(t.id, group)}>${legend}<span class="tri-opts">${choices}</span></fieldset>`;
};

/**
 * A grid of tri() switches: `items` are [settings key, name, hint?] (like modeGrid's), each
 * reading out its own hint, then the grid's. `noAlways` lists keys that only take off and in
 * the mix. `bulk`: the grid's name for a toolbar over it (bulkBar: All Off, All In the Mix,
 * All Always, Shuffle, Defaults), its switches in `data-bulk-list="<bulk>"`.
 * @param {string} label @param {[string, string, string?][]} items
 * @param {{ hint?: string, adv?: boolean, noAlways?: string[], bulk?: string }} [opts]
 */
export const triGrid = (label, items, { hint = '', adv = false, noAlways = [], bulk = '' } = {}) => {
  const t = tip(hint, { control: !ownHints(items), label });
  return `
  <div class="tri-grid-wrap"${advAttr(adv)}${t.id ? ' data-tip-group' : ''}>
    <p class="viz-field-label">${label} ${t.mark}</p>${bulk ? `
    ${bulkBar(bulk, { kind: 'tri', label })}` : ''}
    <div class="tri-grid"${bulk ? ` data-bulk-list="${esc(bulk)}"` : ''}>${items.map(([key, name, itemHint]) => tri(key, esc(name), { hint: itemHint, noAlways: noAlways.includes(key), group: t.id })).join('')}</div>
  </div>`;
};

/** A bulk toolbar's buttons per kind: [data-bulk action, label]. */
export const BULK_ACTIONS = {
  tri: [['off', 'All Off'], ['mix', 'All In the Mix'], ['on', 'All Always'], ['shuffle', 'Shuffle'], ['defaults', 'Defaults']],
  checks: [['all', 'All'], ['none', 'None'], ['defaults', 'Defaults']],
};
/** Why a list that keeps one on has no None. */
const ONE_STAYS = 'At least one has to stay on.';
/**
 * A toolbar that sets a whole grid or checklist at once: buttons with `data-bulk="<action>"`
 * and `data-bulk-group="<group>"` (the page wires them; bulkValues works out the new values).
 * `minOne`: the list keeps at least one on, so None is marked unavailable (aria-disabled:
 * still focusable, with a tip saying why, and the same words read out: the tip itself is
 * hidden from screen readers). A plain group of buttons, each a Tab stop (not a toolbar:
 * that promises arrow keys between them).
 * @param {string} group @param {{ kind?: 'tri' | 'checks', minOne?: boolean, label?: string }} [o]
 */
export const bulkBar = (group, { kind = 'tri', minOne = false, label = '' } = {}) => {
  const g = esc(group);
  const buttons = BULK_ACTIONS[kind].map(([action, text]) => {
    const button = (more) => `<button type="button" class="bulk-btn" data-bulk="${action}" data-bulk-group="${g}"${more}>${text}</button>`;
    if (action !== 'none' || !minOne) return button('');
    const why = `viz-why-${++uid}`;
    return `${button(` aria-disabled="true" data-tip="${ONE_STAYS}" aria-describedby="${why}"`)}<span class="visually-hidden" id="${why}">${ONE_STAYS}</span>`;
  }).join('');
  return `<div class="bulk" role="group" aria-label="${label ? `Set All ${plain(label)}` : 'Set All'}">${buttons}</div>`;
};

/**
 * A bulk toolbar's action worked out (pure): the new values for `items` (keys, or { key,
 * noAlways }) from their `current` ones. 'off' / 'mix' / 'on' set every switch (one without
 * Always takes In the Mix for 'on'); 'all' / 'none' tick or clear every box; 'defaults' puts
 * each back (`defaults[key]`); 'shuffle' rolls each with `rand()`: a switch any of its states,
 * a box on or off. `minOne`: if that leaves none on, the first one that was on stays on (or
 * the first). Returns a new object: `current`'s other keys as they were, the items' new.
 * @param {string} action
 * @param {(string | { key: string, noAlways?: boolean })[]} items
 * @param {Record<string, any>} current @param {Record<string, any>} defaults
 * @param {() => number} [rand]
 * @param {{ minOne?: boolean }} [o]
 * @returns {Record<string, any>}
 */
export function bulkValues(action, items, current = {}, defaults = {}, rand = Math.random, { minOne = false } = {}) {
  const list = items.map((it) => (typeof it === 'string' ? { key: it, noAlways: false } : { key: it.key, noAlways: !!it.noAlways }));
  const out = { ...current };
  const isBox = (key) => typeof (current[key] ?? defaults[key]) === 'boolean';
  const on = (v) => v === true || (typeof v === 'string' && v !== 'off');
  for (const { key, noAlways } of list) {
    if (action === 'off' || action === 'mix' || action === 'on') out[key] = action === 'on' && noAlways ? 'mix' : action;
    else if (action === 'all' || action === 'none') out[key] = action === 'all';
    else if (action === 'defaults') out[key] = key in defaults ? defaults[key] : current[key];
    else if (action === 'shuffle') {
      const states = isBox(key) ? [false, true] : MODES.map(([v]) => v).filter((v) => v !== 'on' || !noAlways);
      out[key] = states[Math.min(states.length - 1, Math.floor(rand() * states.length))];
    }
  }
  if (minOne && list.length && !list.some(({ key }) => on(out[key]))) {
    const keep = list.find(({ key }) => on(current[key])) ?? list[0];
    out[keep.key] = on(current[keep.key]) ? current[keep.key] : isBox(keep.key) ? true : 'mix';
  }
  return out;
}

/**
 * "More": a longer explanation folded under a field, opened on demand (a line of text, or a
 * list of lines). Only the All settings view shows it, unless `adv` is false.
 * @param {string | string[]} body plain text
 * @param {{ adv?: boolean }} [o]
 */
export const more = (body, { adv = true } = {}) => {
  const inner = Array.isArray(body) ? `<ul>${body.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : `<p>${esc(body)}</p>`;
  return `<details class="viz-more"${advAttr(adv)}><summary>More</summary>${inner}</details>`;
};
