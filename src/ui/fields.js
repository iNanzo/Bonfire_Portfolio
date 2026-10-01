// Settings fields as markup: the pieces Bonfire Live's settings dialog and the Painter's
// panel are built from. Each field is a label, a "?" that shows its hint, and one input
// bound by `data-set="<key>"` (a dotted key reaches into a group: "looks.glitch"). Whoever
// draws them wires the inputs: they only carry the key, never a handler. `adv` marks a field
// that only the "All settings" view shows (a `data-adv` attribute the page's CSS hides).
//
// The hints: the "?" shows its hint on hover, and while its field has the keyboard's focus
// (visualizer.css). The "?" itself isn't a stop for the keyboard and is hidden from screen
// readers: the field's input reads the hint out as its description (aria-describedby). A
// group of switches (checks, modeGrid) has one "?" for the group: each switch in it reads the
// group's hint out (after its own, if it has one), and one with no hint of its own shows the
// group's while it has focus (data-group-tip in a data-tip-group). A "?" drawn on its own
// (tip() without `control`: a hint no one input stands for) is a stop of its own instead,
// named "Hint" and described by it.
import { esc } from '../html.js';
import { MODES } from '../visualizer/looks.js';
import { BAR_OPTIONS, RANDOMIZABLE, RANDOM, rollable } from '../visualizer/bars.js';

let tipId = 0;
/**
 * A "?" that shows `hint`, and the hidden text it's read out from. With `control`, the input
 * that takes `ref` stands for it (the "?" is only for the eye); without, the "?" is a
 * keyboard stop of its own, named "Hint" and described by it.
 * @param {string} hint
 * @param {{ control?: boolean }} [o]
 * @returns {{ mark: string, ref: string, id: string }} the "?" markup, the aria-describedby
 *   attribute for the input, and the hint's id (to describe more than one input with it)
 */
export const tip = (hint, { control = false } = {}) => {
  if (!hint) return { mark: '', ref: '', id: '' };
  const id = `viz-tip-${++tipId}`;
  const own = control ? 'aria-hidden="true"' : `tabindex="0" role="img" aria-label="Hint" aria-describedby="${id}"`;
  return { mark: `<span class="viz-tip" ${own} data-tip="${esc(hint)}">?</span><span class="visually-hidden" id="${id}">${esc(hint)}</span>`, ref: ` aria-describedby="${id}"`, id };
};
const advAttr = (adv) => (adv ? ' data-adv' : '');
/** An aria-describedby attribute for these hint ids (empty ones left out), or ''. */
const describedBy = (...ids) => {
  const list = ids.filter(Boolean).join(' ');
  return list ? ` aria-describedby="${list}"` : '';
};

/**
 * A slider with its value shown beside the label (in `<output data-out="<key>">`).
 * @param {string} key @param {string} label @param {number} min @param {number} max @param {number} step
 * @param {{ hint?: string, unit?: string, adv?: boolean }} [opts]
 */
export const range = (key, label, min, max, step, { hint = '', unit = '', adv = false } = {}) => {
  const t = tip(hint, { control: true });
  return `
  <label class="viz-field"${advAttr(adv)}>
    <span class="viz-field-label">${label} ${t.mark}<output data-out="${key}"></output>${unit ? `<span class="viz-unit">${unit}</span>` : ''}</span>
    <input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}"${t.ref}>
  </label>`;
};

/**
 * A line of text (at most `max` characters).
 * @param {string} key @param {string} label
 * @param {{ hint?: string, adv?: boolean, max?: number, placeholder?: string }} [opts]
 */
export const text = (key, label, { hint = '', adv = false, max = 60, placeholder = '' } = {}) => {
  const t = tip(hint, { control: true });
  return `
  <label class="viz-field"${advAttr(adv)}>
    <span class="viz-field-label">${label} ${t.mark}</span>
    <input type="text" data-set="${key}" maxlength="${max}" placeholder="${esc(placeholder)}" autocomplete="off"${t.ref}>
  </label>`;
};

/**
 * One checkbox. `group`: the hint id of the group it's in (checks()), read out after its own.
 * @param {string} key @param {string} label (markup: escape it first)
 * @param {{ hint?: string, adv?: boolean, group?: string }} [opts]
 */
export const check = (key, label, { hint = '', adv = false, group = '' } = {}) => {
  const t = tip(hint, { control: true });
  return `<label class="viz-check"${advAttr(adv)}${group && !t.id ? ' data-group-tip' : ''}><input type="checkbox" data-set="${key}"${describedBy(t.id, group)}><span>${label}</span>${t.mark}</label>`;
};

/**
 * A row of checkboxes, one per entry of `names` ({ id: label }), for settings[group], each
 * reading out the group's hint.
 * @param {string} group @param {string} label @param {Record<string, string>} names
 * @param {{ hint?: string, adv?: boolean }} [opts]
 */
export const checks = (group, label, names, { hint = '', adv = false } = {}) => {
  const t = tip(hint, { control: true });
  return `
  <div${advAttr(adv)}${t.id ? ' data-tip-group' : ''}>
    <p class="viz-field-label">${label} ${t.mark}</p>
    <div class="viz-checks">${Object.entries(names).map(([id, name]) => check(`${group}.${id}`, esc(name), { group: t.id })).join('')}</div>
  </div>`;
};

/**
 * A select's choices from a { value: label } map, with an optional first one.
 * @param {Record<string, string>} names @param {[string, string] | null} [first]
 * @returns {[string, string][]}
 */
export const options = (names, first = null) => [...(first ? [first] : []), ...Object.entries(names)];

/**
 * An "every N bars" setting's choices (bars.js), plus Random where it's offered.
 * @param {string} key a key of BAR_OPTIONS
 * @returns {[string, string][]}
 */
export const barOptions = (key) => [
  ...BAR_OPTIONS[key].map(([v, t]) => [String(v), t]),
  ...(RANDOMIZABLE.includes(key) ? [[RANDOM, `Random (${rollable(key).join(', ')} bars, rolled each time)`]] : []),
];

/**
 * A dropdown.
 * @param {string} key @param {string} label @param {string[][]} opts [value, text] pairs
 * @param {{ hint?: string, adv?: boolean }} [opts]
 */
export const select = (key, label, opts, { hint = '', adv = false } = {}) => {
  const t = tip(hint, { control: true });
  return `
  <label class="viz-field"${advAttr(adv)}>
    <span class="viz-field-label">${label} ${t.mark}</span>
    <select data-set="${key}"${t.ref}>${opts.map(([v, text]) => `<option value="${esc(v)}">${esc(text)}</option>`).join('')}</select>
  </label>`;
};

// Effect switches: Off / In the mix / Always.
export const MIX_HINT = 'In the mix: it comes and goes, rolled again each time the look changes. Always: on the whole time.';

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
  const t = tip(hint, { control: true });
  return `
  <div${advAttr(adv)}${t.id ? ' data-tip-group' : ''}>
    <p class="viz-field-label">${label} ${t.mark}</p>
    <div class="viz-modes">${items.map(([key, name, itemHint]) => {
      const it = tip(itemHint, { control: true });
      return `<label class="viz-mode"${t.id && !it.id ? ' data-group-tip' : ''}><span>${esc(name)}</span>${it.mark}<select data-set="${key}" aria-label="${esc(name)}"${describedBy(it.id, t.id)}>${MODES.filter(([v]) => v !== 'on' || !noAlways.includes(key)).map(([v, text]) => `<option value="${v}">${esc(text)}</option>`).join('')}</select></label>`;
    }).join('')}</div>
  </div>`;
};
