// The shared render helpers every campfire screen builds its markup from (the host console's tabs,
// Judge Mode, the display). Pure: plain data in, an HTML string out; every piece of text goes
// through esc() (src/html.js), so a name with markup in it renders as text (A22). Behaviour is
// attached by the DOM layer (dom.js bind) through attributes, never inline handlers:
//
//   data-action="name"        a click runs handlers[name] (buttons; aria-disabled ones don't)
//   data-value="…"            passed to that handler as `value`
//   data-change="name"        a select/checkbox change runs handlers[name] with the new value
//   data-draft="form.field"   typing keeps the field's raw text in the UI store's drafts
//   data-live                 …and re-renders as it changes (a live label such as "Add −25")
//   data-clock="countdown|elapsed"   text the shell's tick refreshes (clockText) without a re-render
//   data-focus="key"          a stable key the re-render keeps focus on (also an element's id);
//                             button() gives every button one ('action' or 'action:value')
//
//   label(key, lang, vars)              a strings.js label, filled
//   button(label, action, opts)         a <button type="button"> with data-action
//   field / textInput / textArea / selectInput / checkbox / segmented   form pieces
//   signedPointsInput(opts)             − / + toggles beside the amount (typed - and − work too)
//   withSign(text, sign) / signOf(text) the toggles' arithmetic on the raw text
//   addLabel({ points, count, lang })   'Add −25', 'Add +25 Each · 3 People' (U05, A10)
//   points(n, opts)                     a signed amount with its unit, never color alone (U03)
//   emblem(key, opts) / teamChip(team, opts)   a team's pixel emblem and its chip
//   faceText(text, preferred, opts)     text in the display face when it covers it, else Inter (U01)
//   bilingualLines(vi, en, mode, opts)  the two languages as a main and a sub line
//   countdown(timer, now) / elapsed(since, now) / clockText(data, now)   clocks
//   errorText(error, lang)              a refused command's message
//   hintP(text)                         a hint paragraph (nothing for no text)
import { esc } from '../html.js';
import { bilingual, fill, formatClock, formatPoints, MINUS, parsePoints, t } from './strings.js';
import { displayFace } from './fonts.js';
import { emblemSvg } from './emblems.js';
import { remaining } from './phases.js';

/**
 * @typedef {import('./types.js').Lang} Lang
 * @typedef {import('./types.js').DisplayMode} DisplayMode
 * @typedef {import('./types.js').Team} Team
 * @typedef {import('./types.js').Timer} Timer
 * @typedef {import('./types.js').LarpError} LarpError
 * @typedef {import('./fonts.js').Face} Face
 */

/** @param {string} s */
const cls = (s) => s.trim().replace(/\s+/g, ' ');

/**
 * A label from strings.js in `lang`, its {placeholders} filled.
 * @param {string} key
 * @param {Lang|DisplayMode} lang
 * @param {Record<string, string|number>} [vars]
 */
export function label(key, lang, vars) {
  const text = t(key, lang);
  return vars ? fill(text, vars) : text;
}

/**
 * Extra attributes, escaped: { 'aria-controls': 'x' } → ' aria-controls="x"'. false/null/undefined
 * values are left out; true gives the bare attribute.
 * @param {Record<string, string|number|boolean|null|undefined>} [list]
 */
export function attrs(list = {}) {
  return Object.entries(list)
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? ` ${esc(k)}` : ` ${esc(k)}="${esc(String(v))}"`))
    .join('');
}

/**
 * @typedef {{
 *   value?: string|number, variant?: 'primary'|'secondary'|'quiet'|'danger', disabled?: boolean,
 *   pressed?: boolean, hint?: string, id?: string, cls?: string, kbd?: string, icon?: string,
 *   focus?: string, attrs?: Record<string, string|number|boolean|null|undefined>,
 * }} ButtonOpts
 * `disabled` sets aria-disabled (still focusable, its hint still shows; bind() skips it); `hint`
 * is a sentence shown by the shared tooltip (data-tip); `kbd` a shortcut shown beside the label;
 * `icon` TRUSTED markup put before the label (an emblem from this module, never user text).
 */

/**
 * A button that runs handlers[action] when clicked.
 * @param {string} text the label (plain text)
 * @param {string} action
 * @param {ButtonOpts} [o]
 * @returns {string}
 */
export function button(text, action, o = {}) {
  const variant = o.variant ?? 'secondary';
  const a = {
    id: o.id,
    class: cls(`larp-btn larp-btn-${variant} ${o.cls ?? ''}`),
    'data-action': action,
    'data-value': o.value === undefined ? undefined : String(o.value),
    'aria-disabled': o.disabled ? 'true' : undefined,
    'aria-pressed': o.pressed === undefined ? undefined : String(o.pressed),
    'data-tip': o.hint,
    'aria-description': o.hint,
    ...o.attrs,
    // Every button keeps focus through a re-render (and a dialog can hand it back): its own key,
    // else its action and value.
    'data-focus': o.focus ?? o.attrs?.['data-focus'] ?? (o.value === undefined ? action : `${action}:${o.value}`),
  };
  const kbd = o.kbd ? ` <kbd class="larp-kbd">${esc(o.kbd)}</kbd>` : '';
  return `<button type="button"${attrs(a)}>${o.icon ?? ''}<span class="larp-btn-label">${esc(text)}</span>${kbd}</button>`;
}

/**
 * A labelled field: the label, the control (markup from the helpers below), a hint and an error.
 * @param {{ id: string, label: string, control: string, hint?: string, error?: string, cls?: string }} o
 * @returns {string}
 */
export function field({ id, label: text, control, hint = '', error = '', cls: extra = '' }) {
  const hintLine = hint ? `<p class="larp-hint" id="${esc(id)}-hint">${esc(hint)}</p>` : '';
  const errorLine = error ? `<p class="larp-error" id="${esc(id)}-error" role="alert">${esc(error)}</p>` : '';
  return `<div class="${cls(`larp-field ${extra}`)}"><label class="larp-label" for="${esc(id)}">${esc(text)}</label>${control}${hintLine}${errorLine}</div>`;
}

/**
 * aria-describedby for a field's hint and error (ids as field() makes them).
 * @param {string} id
 * @param {{ hint?: boolean, error?: boolean }} o
 */
const describedBy = (id, { hint, error }) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

/**
 * @typedef {{
 *   id: string, draft?: string, value?: string, maxLength?: number, placeholder?: string,
 *   required?: boolean, live?: boolean, lang?: string, hint?: boolean, error?: boolean,
 *   cls?: string, attrs?: Record<string, string|number|boolean|null|undefined>,
 * }} InputOpts
 * `draft` 'form.field' keeps the typed text in the UI store; `hint`/`error` say the field() around
 * it shows them (for aria-describedby).
 */

/**
 * A one-line text input.
 * @param {InputOpts} o
 * @returns {string}
 */
export function textInput(o) {
  const a = {
    type: 'text',
    id: o.id,
    class: cls(`larp-input ${o.cls ?? ''}`),
    value: o.value ?? '',
    maxlength: o.maxLength,
    placeholder: o.placeholder,
    required: !!o.required,
    lang: o.lang,
    autocomplete: 'off',
    spellcheck: 'false',
    'data-draft': o.draft,
    'data-live': !!o.live,
    'aria-invalid': o.error ? 'true' : undefined,
    'aria-describedby': describedBy(o.id, o),
    ...o.attrs,
  };
  return `<input${attrs(a)}>`;
}

/**
 * A multi-line text area (a roster pasted one name per line).
 * @param {InputOpts & { rows?: number }} o
 * @returns {string}
 */
export function textArea(o) {
  const a = {
    id: o.id,
    class: cls(`larp-input larp-textarea ${o.cls ?? ''}`),
    rows: o.rows ?? 4,
    maxlength: o.maxLength,
    placeholder: o.placeholder,
    lang: o.lang,
    spellcheck: 'false',
    'data-draft': o.draft,
    'data-live': !!o.live,
    'aria-invalid': o.error ? 'true' : undefined,
    'aria-describedby': describedBy(o.id, o),
    ...o.attrs,
  };
  return `<textarea${attrs(a)}>${esc(o.value ?? '')}</textarea>`;
}

/**
 * A select. `action` (data-change) runs a handler on change; `draft` keeps the choice as a draft.
 * @param {{
 *   id: string, options: Array<{ value: string, label: string, disabled?: boolean }>, value?: string,
 *   draft?: string, action?: string, hint?: boolean, cls?: string,
 * }} o
 * @returns {string}
 */
export function selectInput(o) {
  const a = {
    id: o.id,
    class: cls(`larp-input larp-select ${o.cls ?? ''}`),
    'data-draft': o.draft,
    'data-change': o.action,
    'aria-describedby': describedBy(o.id, o),
  };
  const opts = o.options
    .map(
      (opt) =>
        `<option${attrs({ value: opt.value, selected: opt.value === o.value, disabled: !!opt.disabled })}>${esc(opt.label)}</option>`,
    )
    .join('');
  return `<select${attrs(a)}>${opts}</select>`;
}

/**
 * A checkbox with its label; `action` (data-change) gets 'true' or 'false'.
 * @param {{ id: string, label: string, checked?: boolean, action?: string, value?: string, hint?: string }} o
 * @returns {string}
 */
export function checkbox(o) {
  const a = {
    type: 'checkbox',
    id: o.id,
    class: 'larp-checkbox',
    checked: !!o.checked,
    'data-change': o.action,
    'data-value': o.value,
    'data-tip': o.hint,
    'aria-description': o.hint,
  };
  return `<label class="larp-check" for="${esc(o.id)}"><input${attrs(a)}><span>${esc(o.label)}</span></label>`;
}

/**
 * A row of mutually exclusive buttons (Team / Individual): each runs `action` with its value;
 * the chosen one is aria-pressed.
 * @param {{ label: string, action: string, value: string, options: Array<{ value: string, label: string }>, cls?: string }} o
 * @returns {string}
 */
export function segmented(o) {
  const buttons = o.options
    .map((opt) =>
      button(opt.label, o.action, { value: opt.value, pressed: opt.value === o.value, cls: 'larp-seg-btn' }),
    )
    .join('');
  return `<div class="${cls(`larp-seg ${o.cls ?? ''}`)}" role="group" aria-label="${esc(o.label)}">${buttons}</div>`;
}

// ── Signed points ───────────────────────────────────────────────────────────────────────────

/**
 * The sign a typed amount has: '-' for '-' or '−', '+' for '+' or none.
 * @param {string} text
 * @returns {'+'|'-'}
 */
export function signOf(text) {
  return /^\s*[-−]/.test(String(text ?? '')) ? '-' : '+';
}

/**
 * The amount's text with its sign set by a toggle: '25' + '-' → '−25', '−25' + '+' → '25', ''
 * + '-' → '−' (the host then types the digits). A typed '-' becomes '−' (U+2212).
 * @param {string} text
 * @param {string} sign '+' or '-' (or '−')
 * @returns {string}
 */
export function withSign(text, sign) {
  const digits = String(text ?? '')
    .trim()
    .replace(/^[+\-−]\s*/, '');
  return sign === '-' || sign === MINUS ? MINUS + digits : digits;
}

/**
 * The amount input with − and + toggles (aria-pressed shows the current sign). The toggles run the
 * shell's 'sign' action on the draft named by `draft`; typing '-' or '−' works as well (U05).
 * @param {{ id: string, draft: string, value?: string, label: string, error?: boolean, hint?: boolean, lang?: Lang }} o
 *   lang: the toggles' accessible names ('Minus', 'Dấu Trừ'); English by default
 * @returns {string}
 */
export function signedPointsInput(o) {
  const text = o.value ?? '';
  const minus = signOf(text) === '-';
  const toggle = (/** @type {'-'|'+'} */ sign, /** @type {string} */ glyph, /** @type {string} */ name) =>
    `<button type="button"${attrs({
      class: 'larp-sign',
      'data-action': 'sign',
      'data-value': sign,
      'data-draft-target': o.draft,
      'aria-pressed': String(sign === '-' ? minus : !minus),
      'aria-label': name,
      'aria-controls': o.id,
      'data-focus': `${o.id}-sign${sign}`,
    })}>${glyph}</button>`;
  const input = textInput({
    id: o.id,
    draft: o.draft,
    value: text,
    live: true,
    error: o.error,
    hint: o.hint,
    cls: 'larp-amount',
    attrs: { inputmode: 'text', 'aria-label': o.label },
  });
  return `<div class="larp-signed" role="group" aria-label="${esc(o.label)}">${toggle('-', MINUS, t('label.minus', o.lang ?? 'en'))}${input}${toggle('+', '+', t('label.plus', o.lang ?? 'en'))}</div>`;
}

/**
 * The Add button's label, repeating the signed value: 'Add −25', 'Add +25 Each · 3 People', or
 * plain 'Add' while the amount isn't a whole number yet.
 * @param {{ points: number|string|null, count?: number, lang: Lang }} o points: a number or the
 *   typed text (parsed with strings.parsePoints)
 * @returns {string}
 */
export function addLabel({ points: amount, count = 1, lang }) {
  const n = typeof amount === 'number' ? (Number.isSafeInteger(amount) ? amount : null) : parsePoints(amount ?? '');
  if (n === null) return t('action.add', lang);
  if (count > 1) return label('action.addEach', lang, { points: formatPoints(n, { each: true, lang }), n: count });
  return label('action.addPoints', lang, { points: formatPoints(n, { lang }) });
}

/**
 * A signed amount with its unit ('+75 Team Points', '−25 Individual Points'): the sign and the
 * word are always in the text; the class only adds the warm or stone styling (U03).
 * @param {number} n
 * @param {{ unit?: 'team'|'individual'|'plain', each?: boolean, lang?: Lang, cls?: string }} [o]
 * @returns {string}
 */
export function points(n, o = {}) {
  const kind = n > 0 ? 'plus' : n < 0 ? 'minus' : 'zero';
  const text = formatPoints(n, { unit: o.unit, each: o.each, lang: o.lang });
  return `<span class="${cls(`larp-pts larp-pts-${kind} ${o.cls ?? ''}`)}">${esc(text)}</span>`;
}

// ── Teams and type ──────────────────────────────────────────────────────────────────────────

/** A #rrggbb color, or null (a team color is only ever put in a style when it's this shape). */
const safeColor = (/** @type {unknown} */ c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);

/**
 * A team's emblem, colored with `color` (a #rrggbb; otherwise the surrounding text color).
 * @param {string} key an EMBLEMS key
 * @param {{ color?: string, size?: number, label?: string, cls?: string }} [o] label: the accessible
 *   name (e.g. t('emblem.star')); without one it is decorative
 * @returns {string}
 */
export function emblem(key, o = {}) {
  const svg = emblemSvg(key, { size: o.size, label: o.label, cls: o.cls });
  const color = safeColor(o.color);
  return color ? `<span class="larp-emblem-wrap" style="color:${color}">${svg}</span>` : svg;
}

/**
 * Text set in `preferred` when that face covers every character, else all of it in Inter (U01):
 * a span with class larp-face-<face>.
 * @param {string} text
 * @param {Face} [preferred] defaults to 'cinzel'
 * @param {{ tag?: string, cls?: string, lang?: string }} [o]
 * @returns {string}
 */
export function faceText(text, preferred = 'cinzel', o = {}) {
  const tag = /^[a-z][a-z0-9]*$/.test(o.tag ?? '') ? o.tag : 'span';
  const face = displayFace(text, preferred);
  return `<${tag}${attrs({ class: cls(`larp-face-${face} ${o.cls ?? ''}`), lang: o.lang })}>${esc(text)}</${tag}>`;
}

/**
 * A team's chip: the emblem in the team's color, a colored edge (never colored text) and the name
 * in its display face. `sub` adds the translation ("Team Paul") as a second line.
 * @param {Pick<Team, 'name'|'translation'|'color'|'emblem'> & { id?: string }} team
 * @param {{ face?: Face, sub?: boolean, size?: number, cls?: string }} [o]
 * @returns {string}
 */
export function teamChip(team, o = {}) {
  const color = safeColor(team.color);
  const style = color ? ` style="--team:${color}"` : '';
  const sub =
    o.sub && team.translation
      ? faceText(team.translation, o.face ?? 'cinzel', { cls: 'larp-chip-sub', lang: 'en' })
      : '';
  return `<span class="${cls(`larp-chip ${o.cls ?? ''}`)}"${attrs({ 'data-team': team.id })}${style}>${emblemSvg(team.emblem, { size: o.size ?? 18 })}<span class="larp-chip-text">${faceText(team.name, o.face ?? 'cinzel', { cls: 'larp-chip-name' })}${sub}</span></span>`;
}

/**
 * Two languages as a main and a sub line for the display mode ('bilingual': Vietnamese then
 * English; 'en-first': English then Vietnamese; 'vi-only': Vietnamese). Each line picks its own
 * face (Vietnamese ends up in Inter, an English title may be Cinzel). An empty side or two equal
 * texts give one line.
 * @param {string} vi
 * @param {string} en
 * @param {DisplayMode|Lang} mode
 * @param {{ face?: Face, cls?: string }} [o]
 * @returns {string}
 */
export function bilingualLines(vi, en, mode, o = {}) {
  const face = o.face ?? 'cinzel';
  const main = bilingual(vi, en, mode === 'en-first' || mode === 'en' ? 'en' : 'vi');
  const mainLang = main === vi && vi ? 'vi' : 'en';
  const other = mainLang === 'vi' ? en : vi;
  const showSub = (mode === 'bilingual' || mode === 'en-first') && other && other !== main;
  const sub = showSub ? faceText(other, face, { cls: 'larp-bi-sub', lang: mainLang === 'vi' ? 'en' : 'vi' }) : '';
  return `<span class="${cls(`larp-bi ${o.cls ?? ''}`)}">${faceText(main, face, { cls: 'larp-bi-main', lang: mainLang })}${sub}</span>`;
}

// ── Clocks ──────────────────────────────────────────────────────────────────────────────────

/**
 * A countdown the shell's tick keeps current: its text now, the timer in data attributes.
 * @param {Timer} timer
 * @param {number} now
 * @param {{ cls?: string }} [o]
 * @returns {string}
 */
export function countdown(timer, now, o = {}) {
  const a = {
    class: cls(`larp-clock ${o.cls ?? ''}`),
    'data-clock': 'countdown',
    'data-status': timer.status,
    'data-deadline': timer.deadline ?? undefined,
    'data-remaining': timer.status === 'running' ? undefined : (timer.remainingMs ?? timer.durationMs),
  };
  return `<span${attrs(a)}>${esc(formatClock(remaining(timer, now)))}</span>`;
}

/**
 * Time since `since` (the event clock), kept current by the tick; '0:00' when not started.
 * @param {number|null} since epoch ms
 * @param {number} now
 * @param {{ cls?: string }} [o]
 * @returns {string}
 */
export function elapsed(since, now, o = {}) {
  const a = { class: cls(`larp-clock ${o.cls ?? ''}`), 'data-clock': 'elapsed', 'data-since': since ?? undefined };
  return `<span${attrs(a)}>${esc(formatElapsed(since, now))}</span>`;
}

/** @param {number|null} since @param {number} now */
const formatElapsed = (since, now) => (since === null ? '0:00' : formatClock(Math.floor((now - since) / 1000) * 1000));

/**
 * A clock element's text from its data attributes (what the tick writes): a countdown's remaining
 * time (from its deadline while running), or the time elapsed since data-since.
 * @param {{ clock?: string, status?: string, deadline?: string, remaining?: string, since?: string }} data
 * @param {number} now
 * @returns {string}
 */
export function clockText(data, now) {
  if (data.clock === 'elapsed') return formatElapsed(data.since ? Number(data.since) : null, now);
  if (data.status === 'running' && data.deadline) return formatClock(Number(data.deadline) - now);
  return formatClock(Number(data.remaining ?? 0));
}

/**
 * A refused command's message in `lang` (strings.js 'error.<code>').
 * @param {LarpError|null|undefined} error
 * @param {Lang} lang
 */
export function errorText(error, lang) {
  return error ? t(`error.${error.code}`, lang) : '';
}

/**
 * A hint paragraph, or nothing when there is no text.
 * @param {string} text
 * @returns {string}
 */
export function hintP(text) {
  return text ? `<p class="larp-hint">${esc(text)}</p>` : '';
}
