// The editor: renders any part of content.json as a form and writes edits back
// into the draft. Lists of entries are cards (drag or ↑/↓ to reorder, hide, delete,
// add); lists of text and table rows get row editors; `images` gets the image
// manager; ranged numbers get sliders and #rrggbb text gets a color picker. Every
// field carries data-path (e.g. projects[2].images[0].alt) so validation messages
// land on the right field.
//
// User text only ever reaches the page through .value / textContent.
import {
  ADD_LABELS, COLUMNS, FIXED, HELP, LABELS, MULTILINE, MULTILINE_LISTS, NULLABLE, READONLY, SELECTS, SHORT, SWATCH_KEYS,
  TEMPLATES, TITLE_KEYS, hint, rangeFor,
} from './schema.js';
import { HEX_RE, ID_RE, shownImages, slugify } from '../../src/contentRules.js';
import { newImageSrc, processImage } from './images.js';
import { flameQuickRoll, flameTools } from './paletteTools.js';
import { titleCase } from './text.js';
import { ELEMENT_IDS } from '../../src/effectsDefaults.js';

// ---- paths ------------------------------------------------------------------------
export const keyOf = (path) => path.map((k, i) => (typeof k === 'number' ? `[${k}]` : (i ? '.' : '') + k)).join('');
export const patternOf = (path) => path.map((k, i) => (typeof k === 'number' ? '[]' : (i ? '.' : '') + k)).join('');
export const getAt = (obj, path) => path.reduce((o, k) => o?.[k], obj);
const setAt = (obj, path, value) => { getAt(obj, path.slice(0, -1))[path.at(-1)] = value; };

const humanize = (key) => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
export const labelFor = (path) => titleCase(hint(LABELS, patternOf(path)) ?? humanize(path.at(-1)));
const addLabel = (path) => titleCase(hint(ADD_LABELS, patternOf(path)) ?? 'entry');

const CATEGORIES = [['featured', 'Featured'], ['projects', 'Projects'], ['archive', 'Earlier Explorations']];

// ---- DOM helper -------------------------------------------------------------------
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
const iconButton = (label, glyph, onclick, extra = {}) => el('button', { type: 'button', class: 'icon', title: label, 'aria-label': label, onclick, ...extra }, glyph);
const eyeButton = (item, onToggle, { on = 'Show on the site', off = 'Hide from the site' } = {}) => iconButton(item.hidden ? on : off, item.hidden ? '◌' : '◉', () => {
  if (item.hidden) delete item.hidden; else item.hidden = true;
  onToggle();
}, { 'aria-pressed': String(!!item.hidden), class: `icon eye${item.hidden ? ' is-off' : ''}` });

// ---- entry titles -------------------------------------------------------------------
export function titleOf(item, index) {
  if (Array.isArray(item)) return item.filter(Boolean).join(' · ') || `Row ${index + 1}`;
  for (const k of TITLE_KEYS) if (typeof item?.[k] === 'string' && item[k].trim()) return item[k];
  return `Entry ${index + 1}`;
}
const autoRows = (text) => Math.min(12, Math.max(2, Math.ceil(String(text ?? '').length / 70) + String(text ?? '').split('\n').length - 1));

// ---- values ------------------------------------------------------------------------
/**
 * @param ctx {
 *   draft, uploads: Map, open: WeakSet, fresh: WeakSet, drag: {},
 *   changed({ rerender }), thumb(src), siteUrl, toast(msg), busy(on), preview?
 * }
 */
export function renderValue(value, path, ctx) {
  if (path.at(-1) === 'images' && Array.isArray(value)) return renderImages(value, path, ctx);
  if (Array.isArray(value)) {
    const sample = value.find((v) => v !== null && v !== undefined) ?? hint(TEMPLATES, patternOf(path))?.();
    if (Array.isArray(sample) || COLUMNS[patternOf(path)]) return renderRows(value, path, ctx);
    if (sample && typeof sample === 'object') return renderCollection(value, path, ctx);
    return renderStrings(value, path, ctx);
  }
  if (value !== null && typeof value === 'object') return renderObject(value, path, ctx);
  return renderScalar(value, path, ctx);
}

const isShort = (value, path) => {
  const key = path.at(-1);
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (typeof value === 'string' && HEX_RE.test(value)) return true;
  if (SELECTS[patternOf(path)]) return true;
  return typeof value === 'string' && SHORT.has(key) && value.length < 60;
};

export function renderObject(obj, path, ctx) {
  const box = el('div', { class: 'fields' });
  if (typeof obj.todo === 'string') box.append(renderTodo(obj, path, ctx));
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'hidden' || k === 'todo') continue;
    box.append(renderField(v, [...path, k], ctx));
  }
  return box;
}

let uid = 0;
export function renderField(value, path, ctx, label = labelFor(path)) {
  const group = value !== null && typeof value === 'object';
  const wrap = el('div', { class: `${group ? 'group' : 'field'}${!group && isShort(value, path) ? ' is-short' : ''}`, 'data-path': keyOf(path) });
  const id = `f${++uid}`;
  // The help is written under the field and is also the label's hover tooltip.
  const help = hint(HELP, patternOf(path));
  wrap.append(group ? el('h4', { class: 'group-label', text: label, ...(help ? { title: help } : {}) }) : el('label', { for: id, text: label, ...(help ? { title: help } : {}) }));
  if (help) wrap.append(el('p', { class: 'help', text: help }));
  const control = renderValue(value, path, ctx);
  if (!group) (control.querySelector?.('[data-main]') ?? control).id = id;
  wrap.append(control, el('p', { class: 'error', role: 'alert' }));
  if (isElementPath(path)) wrap.append(elementFoot(path.at(-1), ctx));
  return wrap;
}

// ---- elements ------------------------------------------------------------------------
const isElementPath = (path) => path.length === 3 && path[0] === 'effects' && path[1] === 'elements' && ELEMENT_IDS.includes(path[2]);

/** Each element's share of the draws, from the draft's weights (only elements in rotation count). */
function chances(draft) {
  const els = draft.effects?.elements ?? {};
  const w = (id) => (els[id]?.rotation !== false && typeof els[id]?.weight === 'number' ? Math.max(0, els[id].weight) : 0);
  const total = ELEMENT_IDS.reduce((sum, id) => sum + w(id), 0);
  return Object.fromEntries(ELEMENT_IDS.map((id) => [id, total ? w(id) / total : 0]));
}
const chanceText = (p) => (p > 0 ? `≈ ${Math.round(p * 100)}% of draws` : 'Never drawn');
function refreshChances(ctx) {
  const c = chances(ctx.draft);
  for (const n of document.querySelectorAll('[data-chance]')) n.textContent = chanceText(c[n.dataset.chance]);
}

function elementFoot(id, ctx) {
  return el('div', { class: 'card-foot' },
    el('span', { class: 'chance', 'data-chance': id, text: chanceText(chances(ctx.draft)[id]) }),
    el('button', { type: 'button', class: 'button small', text: '▶ Try It in the Preview', onclick: () => ctx.preview?.element(id) }));
}

function renderScalar(value, path, ctx, { nullable = hint(NULLABLE, patternOf(path)), multiline } = {}) {
  const pattern = patternOf(path);
  const key = path.at(-1);
  const options = SELECTS[pattern]?.(ctx.draft);
  if (options) {
    const select = el('select', { onchange: () => update(path, typeof value === 'number' ? Number(select.value) : select.value, ctx) },
      options.map((o) => el('option', { value: String(o.value), text: o.label })));
    select.value = String(value);
    return select;
  }
  if (typeof value === 'boolean') {
    const box = el('input', { type: 'checkbox', class: 'switch', role: 'switch', onchange: () => update(path, box.checked, ctx) });
    box.checked = value;
    return box;
  }
  const range = rangeFor(pattern);
  if (typeof value === 'number' && range) return renderSlider(value, path, range, ctx);
  if (typeof value === 'number') {
    const input = el('input', { type: 'number', inputmode: 'numeric', oninput: () => update(path, input.value === '' ? value : Number(input.value), ctx) });
    input.value = String(value);
    return input;
  }
  if (typeof value === 'string' && HEX_RE.test(value)) return renderColor(value, path, ctx);
  multiline ??= MULTILINE.has(key) || (typeof value === 'string' && value.length > 90);
  const input = multiline ? el('textarea', { rows: autoRows(value) }) : el('input', { type: 'text', spellcheck: key === 'id' || key === 'href' || key === 'src' ? 'false' : undefined });
  input.value = value ?? '';
  if (hint(READONLY, pattern)) input.readOnly = true;
  if (nullable) input.placeholder = '(none)';
  input.addEventListener('input', () => {
    update(path, nullable && input.value === '' ? null : input.value, ctx);
    if (multiline) input.rows = autoRows(input.value);
  });
  return input;
}

/** Slider + exact number box, kept in sync. */
function renderSlider(value, path, [min, max, step, unit], ctx) {
  const decimals = String(step).split('.')[1]?.length ?? 0;
  const slider = el('input', { type: 'range', min, max, step, 'data-main': true });
  const box = el('input', { type: 'number', min, max, step, class: 'num', 'aria-label': `${labelFor(path)} value` });
  slider.value = box.value = String(value);
  const fill = () => slider.style.setProperty('--fill', `${((Number(slider.value) - min) / (max - min)) * 100}%`);
  fill();
  slider.addEventListener('input', () => {
    box.value = Number(slider.value).toFixed(decimals);
    fill();
    update(path, Number(Number(slider.value).toFixed(decimals)), ctx);
  });
  box.addEventListener('input', () => {
    if (box.value === '' || !Number.isFinite(Number(box.value))) return;
    slider.value = box.value;
    fill();
    update(path, Number(box.value), ctx);
  });
  return el('div', { class: 'slider' }, slider, box, unit ? el('span', { class: 'unit', text: unit }) : null);
}

/** Swatch (native color picker) + hex text box. */
function renderColor(value, path, ctx) {
  const picker = el('input', { type: 'color', 'aria-label': `${labelFor(path)} picker` });
  const text = el('input', { type: 'text', class: 'hex', spellcheck: 'false', maxlength: 7, 'data-main': true });
  picker.value = value.toLowerCase();
  text.value = value;
  picker.addEventListener('input', () => { text.value = picker.value; update(path, picker.value, ctx); });
  text.addEventListener('input', () => {
    const v = text.value.trim();
    if (HEX_RE.test(v)) picker.value = v.toLowerCase();
    update(path, v, ctx);
  });
  return el('div', { class: 'color' }, picker, text);
}

function scopeIds(ctx, parent) {
  const flames = ctx.draft.effects?.flames ?? [];
  if (flames.includes(parent)) return { taken: flames, fallback: 'flame' };
  return { taken: [ctx.draft.featured, ...ctx.draft.projects, ...ctx.draft.archive], fallback: 'project' };
}
function uniqueId(base, ctx, self) {
  const { taken } = scopeIds(ctx, self);
  const ids = new Set(taken.filter((p) => p !== self).map((p) => p.id));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Write one edit into the draft, plus the small follow-ups some fields need. */
function update(path, value, ctx) {
  setAt(ctx.draft, path, value);
  const parentPath = path.slice(0, -1);
  const parent = getAt(ctx.draft, parentPath);
  const key = path.at(-1);
  // A new entry's id follows its name until you edit the id yourself.
  if (key === 'name' && parent && ctx.fresh.has(parent) && 'id' in parent) {
    parent.id = uniqueId(slugify(value) || scopeIds(ctx, parent).fallback, ctx, parent);
    const idField = document.querySelector(`[data-path="${CSS.escape(keyOf([...parentPath, 'id']))}"] input`);
    if (idField) idField.value = parent.id;
  }
  if (key === 'id' && parent) ctx.fresh.delete(parent);
  if (TITLE_KEYS.includes(key)) {
    for (const t of document.querySelectorAll(`[data-title-for="${CSS.escape(keyOf(parentPath))}"]`)) t.textContent = titleOf(parent, 0);
  }
  if (path[0] === 'effects' && path[1] === 'elements' && (key === 'weight' || key === 'rotation')) refreshChances(ctx);
  if (SWATCH_KEYS.includes(key) && HEX_RE.test(value)) {
    const sw = document.querySelector(`[data-swatch="${CSS.escape(keyOf(path))}"]`);
    if (sw) sw.style.background = value;
  }
  ctx.changed();
}

function renderTodo(obj, path, ctx) {
  return el('div', { class: 'todo' },
    el('span', { class: 'todo-mark', text: 'To Confirm' }),
    el('span', { class: 'todo-text', text: obj.todo }),
    el('button', { type: 'button', class: 'link-button', text: 'Mark Done', onclick: () => { delete obj.todo; ctx.changed({ rerender: true }); } }));
}

// ---- lists -----------------------------------------------------------------------
function moveItem(list, from, to, ctx) {
  if (to < 0 || to >= list.length || from === to) return;
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
  ctx.changed({ rerender: true });
}

/** Drag to reorder within one list: rows carry data-index; the handle starts the drag. */
function sortable(container, list, ctx) {
  container.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('[data-index]');
    if (!row || row.parentElement !== container) return;
    ctx.drag = { list, from: Number(row.dataset.index) };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    row.classList.add('is-dragging');
  });
  container.addEventListener('dragover', (e) => {
    const row = e.target.closest?.('[data-index]');
    if (ctx.drag?.list !== list || !row || row.parentElement !== container) return;
    e.preventDefault();
    for (const r of container.querySelectorAll(':scope > .drop-before, :scope > .drop-after')) r.classList.remove('drop-before', 'drop-after');
    const box = row.getBoundingClientRect();
    const horizontal = getComputedStyle(container).display.includes('grid') && container.classList.contains('images');
    const after = horizontal ? e.clientX > box.left + box.width / 2 : e.clientY > box.top + box.height / 2;
    row.classList.add(after ? 'drop-after' : 'drop-before');
  });
  container.addEventListener('drop', (e) => {
    const row = e.target.closest?.('[data-index]');
    if (ctx.drag?.list !== list || !row || row.parentElement !== container) return;
    e.preventDefault();
    const to = Number(row.dataset.index) + (row.classList.contains('drop-after') ? 1 : 0);
    const from = ctx.drag.from;
    ctx.drag = null;
    moveItem(list, from, to > from ? to - 1 : to, ctx);
  });
  container.addEventListener('dragend', () => {
    ctx.drag = null;
    for (const r of container.querySelectorAll('.is-dragging, .drop-before, .drop-after')) r.classList.remove('is-dragging', 'drop-before', 'drop-after');
  });
}

function orderButtons(list, i, ctx) {
  return [
    iconButton('Move up', '↑', () => moveItem(list, i, i - 1, ctx), { disabled: i === 0 }),
    iconButton('Move down', '↓', () => moveItem(list, i, i + 1, ctx), { disabled: i === list.length - 1 }),
  ];
}

const blank = (sample) => {
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === 'object') return Object.fromEntries(Object.entries(sample).filter(([k]) => k !== 'hidden' && k !== 'todo').map(([k, v]) => [k, blank(v)]));
  return typeof sample === 'number' ? 0 : typeof sample === 'boolean' ? false : sample === null ? null : '';
};

function addEntry(list, path, ctx) {
  const make = hint(TEMPLATES, patternOf(path));
  const entry = make ? make(ctx.draft) : blank(list[0]);
  list.push(entry);
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    ctx.open.add(entry);
    if ('id' in entry) { ctx.fresh.add(entry); entry.id = uniqueId(slugify(entry.name ?? '') || scopeIds(ctx, entry).fallback, ctx, entry); }
  }
  ctx.focus = keyOf([...path, list.length - 1]);
  ctx.changed({ rerender: true });
}

/** Lists of entries (projects, roles, skills, flames…): one card each. */
function renderCollection(list, path, ctx) {
  const fixed = hint(FIXED, patternOf(path));
  const box = el('div', { class: 'collection' });
  list.forEach((item, i) => box.append(renderCard(list, i, path, ctx, fixed)));
  if (!fixed) {
    sortable(box, list, ctx);
    box.append(el('button', { type: 'button', class: 'add', text: `+ Add ${addLabel(path)}`, onclick: () => addEntry(list, path, ctx) }));
  }
  return box;
}

const isProjectPath = (path) => path.length === 1 && (path[0] === 'projects' || path[0] === 'archive');
const isFlamePath = (path) => patternOf(path) === 'effects.flames';

function cardMeta(item, path) {
  if (isProjectPath(path) || path[0] === 'featured') {
    const n = shownImages(item).length;
    const hiddenN = (item.images?.length ?? 0) - n;
    return [item.kind, item.year, item.status, `${n} image${n === 1 ? '' : 's'}${hiddenN ? ` (+${hiddenN} hidden)` : ''}`].filter(Boolean).join(' · ');
  }
  return '';
}

function swatches(item, ipath) {
  return el('span', { class: 'swatches', 'aria-hidden': 'true' },
    SWATCH_KEYS.map((k) => el('span', { class: 'swatch', 'data-swatch': keyOf([...ipath, k]), style: `background:${HEX_RE.test(item[k] ?? '') ? item[k] : 'transparent'}` })));
}

/** The collapsible card head shared by list cards and the featured card. */
function cardShell(item, ipath, ctx, { title, meta, thumb, lead = null, actions, badges, foot = null, open }) {
  const key = keyOf(ipath);
  const card = el('section', { class: `card${item.hidden ? ' is-hidden' : ''}`, 'data-path': key });
  const body = el('div', { class: 'card-body', hidden: !open });
  const toggle = el('button', {
    type: 'button', class: 'card-toggle', 'aria-expanded': String(open),
    onclick: () => {
      const now = body.hidden;
      body.hidden = !now;
      toggle.setAttribute('aria-expanded', String(now));
      if (now) ctx.open.add(item); else ctx.open.delete(item);
    },
  },
  el('span', { class: 'chevron', 'aria-hidden': 'true' }),
  thumb,
  el('span', { class: 'card-titles' },
    el('span', { class: 'card-title', 'data-title-for': key, text: title }),
    meta ? el('span', { class: 'card-meta', text: meta }) : null));
  card.append(
    el('div', { class: 'card-head' }, lead, toggle, badges, el('span', { class: 'card-actions' }, actions)),
    el('p', { class: 'error', role: 'alert' }),
    body);
  body.append(renderObject(item, ipath, ctx));
  if (foot) body.append(foot);
  return card;
}

function badgesFor(item) {
  return el('span', { class: 'badges' },
    item.hidden ? el('span', { class: 'badge', text: 'Hidden' }) : null,
    typeof item.todo === 'string' ? el('span', { class: 'badge badge-todo', text: 'To Confirm' }) : null,
    el('span', { class: 'badge badge-error', text: 'Needs Fixing' }));
}

function renderCard(list, i, path, ctx, fixed) {
  const item = list[i];
  const ipath = [...path, i];
  const isProject = isProjectPath(path);
  const isFlame = isFlamePath(path);
  const cover = isProject ? shownImages(item)[0] : null;
  const actions = fixed ? [] : [
    isFlame ? flameQuickRoll(item, ctx) : null,
    ...orderButtons(list, i, ctx),
    eyeButton(item, () => ctx.changed({ rerender: true }), isFlame ? { on: 'Put back in rotation', off: 'Take out of rotation' } : undefined),
    iconButton('Delete', '✕', () => {
      const extra = isProject && item.images?.length ? ' Its images are removed from the site when you save.' : '';
      if (!confirm(`Delete “${titleOf(item, i)}”?${extra}`)) return;
      list.splice(i, 1);
      ctx.changed({ rerender: true });
    }, { class: 'icon danger' }),
  ];
  const card = cardShell(item, ipath, ctx, {
    title: titleOf(item, i),
    meta: cardMeta(item, path),
    thumb: isProject && cover ? el('img', { class: 'card-thumb', alt: '', src: ctx.thumb(cover.src), loading: 'lazy' })
      : isFlame ? swatches(item, ipath) : null,
    lead: fixed ? null : el('span', { class: 'handle', draggable: 'true', title: 'Drag to reorder', 'aria-hidden': 'true', text: '⋮⋮' }),
    actions,
    badges: badgesFor(item),
    foot: isProject ? projectActions(item, path[0], i, ctx) : isFlame ? flameActions(item, ctx) : null,
    open: ctx.open.has(item),
  });
  card.dataset.index = i;
  if (isFlame && item.hidden) card.querySelector('.badges .badge').textContent = 'Out of Rotation';
  return card;
}

/** Move a project between Featured, Projects and Earlier Explorations. */
function moveProject(item, from, index, to, ctx) {
  const d = ctx.draft;
  if (to === from) return;
  if (to === 'featured') {
    const old = d.featured;
    d.featured = item;
    d[from][index] = old;
    ctx.toast(`“${item.name}” is now featured; “${old.name}” took its place in ${from === 'projects' ? 'Projects' : 'Earlier Explorations'}.`);
  } else if (from === 'featured') {
    const pool = [...d.projects.map((p, i) => ['projects', i, p]), ...d.archive.map((p, i) => ['archive', i, p])];
    const [list, i, next] = pool.find(([, , p]) => !p.hidden && shownImages(p).length) ?? pool[0] ?? [];
    if (!next) { ctx.toast('There’s no other project to feature in its place.', 'error'); return; }
    if (!confirm(`Move “${item.name}” to ${to === 'projects' ? 'Projects' : 'Earlier Explorations'}? “${next.name}” becomes the featured project.`)) return;
    d[list].splice(i, 1);
    d.featured = next;
    d[to].unshift(item);
  } else {
    d[from].splice(index, 1);
    d[to].unshift(item);
  }
  ctx.changed({ rerender: true });
}

function moveMenu(item, from, index, ctx) {
  const select = el('select', { class: 'move-select', 'aria-label': 'Move to', onchange: () => moveProject(item, from, index, select.value, ctx) },
    CATEGORIES.map(([value, label]) => el('option', { value, text: value === from ? `${label} (here)` : label })));
  select.value = from;
  return el('label', { class: 'move' }, el('span', { text: 'Move To' }), select);
}

function projectActions(item, where, i, ctx) {
  return el('div', { class: 'card-foot' },
    moveMenu(item, where, i, ctx),
    ctx.siteUrl && ID_RE.test(item.id ?? '') ? el('a', { class: 'link-button', href: `${ctx.siteUrl}projects/${item.id}/`, target: '_blank', rel: 'noopener', text: 'Open Its Page ↗' }) : null);
}

function flameActions(item, ctx) {
  return el('div', { class: 'flame-foot' },
    flameTools(item, ctx),
    el('div', { class: 'card-foot' },
      el('button', { type: 'button', class: 'button small', text: '▶ Forge It in the Preview', onclick: () => ctx.preview?.flame(item.id) }),
      el('button', { type: 'button', class: 'link-button', text: 'Just Show Its Colors', onclick: () => ctx.preview?.show(item.id) })));
}

/** The featured project: one collapsible card (closed by default). */
export function renderFeatured(ctx) {
  const item = ctx.draft.featured;
  const cover = shownImages(item)[0];
  const card = cardShell(item, ['featured'], ctx, {
    title: titleOf(item, 0),
    meta: cardMeta(item, ['featured']),
    thumb: cover ? el('img', { class: 'card-thumb', alt: '', src: ctx.thumb(cover.src) }) : null,
    actions: [eyeButton(item, () => ctx.changed({ rerender: true }))],
    badges: badgesFor(item),
    foot: projectActions(item, 'featured', 0, ctx),
    open: ctx.open.has(item),
  });
  card.classList.add('is-featured');
  return card;
}

/** Lists of text (tech tags, paragraphs, highlights). */
function renderStrings(list, path, ctx) {
  const box = el('div', { class: 'rows' });
  const multiline = hint(MULTILINE_LISTS, patternOf(path));
  list.forEach((value, i) => {
    const ipath = [...path, i];
    box.append(el('div', { class: 'row', 'data-index': i, 'data-path': keyOf(ipath) },
      el('span', { class: 'handle', draggable: 'true', 'aria-hidden': 'true', text: '⋮⋮' }),
      renderScalar(value, ipath, ctx, { multiline }),
      ...orderButtons(list, i, ctx),
      iconButton('Remove', '✕', () => { list.splice(i, 1); ctx.changed({ rerender: true }); }, { class: 'icon danger' }),
      el('p', { class: 'error', role: 'alert' })));
  });
  sortable(box, list, ctx);
  box.append(el('button', { type: 'button', class: 'add', text: `+ Add ${addLabel(path)}`, onclick: () => {
    list.push('');
    ctx.focus = keyOf([...path, list.length - 1]);
    ctx.changed({ rerender: true });
  } }));
  return box;
}

/** Table rows ([label, value] stats, [key, key, label] prompts). */
function renderRows(list, path, ctx) {
  const pattern = patternOf(path);
  const cols = COLUMNS[pattern] ?? (list[0] ?? []).map((_, c) => `Column ${c + 1}`);
  const box = el('div', { class: 'rows table', style: `--cols: ${cols.length}` });
  box.append(el('div', { class: 'row row-head', 'aria-hidden': 'true' }, el('span'), ...cols.map((c) => el('span', { text: titleCase(c) }))));
  list.forEach((row, i) => {
    const ipath = [...path, i];
    box.append(el('div', { class: 'row', 'data-index': i, 'data-path': keyOf(ipath) },
      el('span', { class: 'handle', draggable: 'true', 'aria-hidden': 'true', text: '⋮⋮' }),
      ...cols.map((c, col) => {
        const cell = renderScalar(row[col] ?? '', [...ipath, col], ctx, { nullable: hint(NULLABLE, `${pattern}[][${col}]`), multiline: false });
        cell.setAttribute('aria-label', `${c}, row ${i + 1}`);
        return cell;
      }),
      ...orderButtons(list, i, ctx),
      iconButton('Remove', '✕', () => { list.splice(i, 1); ctx.changed({ rerender: true }); }, { class: 'icon danger' }),
      el('p', { class: 'error', role: 'alert' })));
  });
  sortable(box, list, ctx);
  box.append(el('button', { type: 'button', class: 'add', text: `+ Add ${addLabel(path)}`, onclick: () => {
    list.push(hint(TEMPLATES, pattern)?.() ?? cols.map(() => ''));
    ctx.changed({ rerender: true });
  } }));
  return box;
}

// ---- images --------------------------------------------------------------------------
function renderImages(list, path, ctx) {
  const project = getAt(ctx.draft, path.slice(0, -1));
  const box = el('div', { class: 'images' });
  const icon = list.find((im) => !im.hidden);
  list.forEach((im, i) => {
    const ipath = [...path, i];
    const pending = ctx.uploads.get(im.src);
    const pixel = el('input', { type: 'checkbox', onchange: async () => {
      if (pixel.checked) im.pixel = true; else delete im.pixel;
      if (pending?.file) { // re-convert a new upload with the other scaling
        ctx.busy(true);
        try { Object.assign(pending, await processImage(pending.file, { pixel: pixel.checked })); } finally { ctx.busy(false); }
      }
      ctx.changed({ rerender: true });
    } });
    pixel.checked = !!im.pixel;
    // A clip: the site plays <src>.mp4 (added to the repo by hand) with this image as its poster.
    const video = el('input', { type: 'checkbox', onchange: () => {
      if (video.checked) im.video = true; else delete im.video;
      ctx.changed({ rerender: true });
    } });
    video.checked = !!im.video;
    box.append(el('figure', { class: `image-tile${im.hidden ? ' is-hidden' : ''}`, 'data-index': i, 'data-path': keyOf(ipath) },
      el('div', { class: 'image-frame', draggable: 'true', title: 'Drag to reorder' },
        el('img', { alt: im.alt || '', src: pending?.preview ?? ctx.thumb(im.src), loading: 'lazy' }),
        im === icon ? el('span', { class: 'image-tag', text: 'Icon' }) : null,
        im.hidden ? el('span', { class: 'image-tag image-hidden', text: 'Hidden' }) : null,
        pending ? el('span', { class: 'image-tag image-new', text: 'New' }) : null),
      el('code', { class: 'image-src', text: im.src }),
      renderField(im.alt ?? '', [...ipath, 'alt'], ctx, 'Alt Text (Describe It)'),
      renderField(im.caption ?? '', [...ipath, 'caption'], ctx, 'Caption'),
      el('label', { class: 'check' }, pixel, ' Pixel Art (Keep It Crisp)'),
      el('label', { class: 'check', title: 'Plays the .mp4 of the same name (put it in the repo beside this image), with this image as its still' }, video, ' Video Clip (Plays the .mp4)'),
      el('div', { class: 'image-actions' },
        iconButton('Move earlier', '←', () => moveItem(list, i, i - 1, ctx), { disabled: i === 0 }),
        iconButton('Move later', '→', () => moveItem(list, i, i + 1, ctx), { disabled: i === list.length - 1 }),
        eyeButton(im, () => ctx.changed({ rerender: true }), { on: 'Show this image on the site', off: 'Hide this image from the site' }),
        iconButton('Remove image', '✕', () => {
          if (!pending && !confirm('Remove this image? It’s deleted from the site when you save. (◉ hides it instead.)')) return;
          if (pending) { URL.revokeObjectURL(pending.preview); ctx.uploads.delete(im.src); }
          list.splice(i, 1);
          ctx.changed({ rerender: true });
        }, { class: 'icon danger' })),
      el('p', { class: 'error', role: 'alert' })));
  });
  sortable(box, list, ctx);

  const idOk = ID_RE.test(project?.id ?? '');
  const picker = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif', multiple: true, hidden: true, onchange: async () => {
    const files = [...picker.files];
    picker.value = '';
    if (!files.length) return;
    ctx.busy(true, `Converting ${files.length} image${files.length > 1 ? 's' : ''}…`);
    try {
      for (const file of files) {
        const taken = new Set([...ctx.uploads.keys(), ...allImageSrcs(ctx.draft)]);
        const src = newImageSrc(project.id, file.name, taken);
        const out = await processImage(file);
        ctx.uploads.set(src, { ...out, file });
        list.push({ src, alt: '', caption: '' });
      }
    } catch (e) {
      ctx.toast(e.message, 'error');
    } finally {
      ctx.busy(false);
      ctx.changed({ rerender: true });
    }
  } });
  const tile = el('div', { class: 'image-add' },
    picker,
    el('button', { type: 'button', class: 'add', disabled: !idOk, text: '+ Add Images', onclick: () => picker.click() }),
    el('p', { class: 'help', text: idOk ? 'PNG, JPG, WebP or GIF. Converted to WebP here, uploaded when you save.' : 'Give the project a valid ID first — images are stored under it.' }));
  return el('div', { class: 'image-manager' }, box, tile);
}

function allImageSrcs(d) {
  return [d.featured, ...d.projects, ...d.archive].flatMap((p) => (p.images ?? []).map((im) => im.src));
}

// ---- validation display ------------------------------------------------------------------
/** Put each error's message on its field (or the nearest enclosing one) and flag the cards around it. */
export function showErrors(root, errors) {
  for (const n of root.querySelectorAll('.has-error, .has-inner-error')) n.classList.remove('has-error', 'has-inner-error');
  for (const p of root.querySelectorAll('.error')) p.textContent = '';
  for (const { path, message } of errors) {
    let p = path;
    let target = root.querySelector(`[data-path="${CSS.escape(p)}"]`);
    while (!target) { // climb to the nearest rendered ancestor: a.b[2].c → a.b[2] → a.b → a
      const up = p.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
      if (!up || up === p) break;
      p = up;
      target = root.querySelector(`[data-path="${CSS.escape(p)}"]`);
    }
    if (target) {
      target.classList.add('has-error');
      const slot = target.querySelector(':scope > .error');
      if (slot && !slot.textContent) slot.textContent = message;
    }
    for (const card of root.querySelectorAll('.card[data-path]')) {
      const k = card.dataset.path;
      if (path === k || path.startsWith(k + '.') || path.startsWith(k + '[')) card.classList.add('has-inner-error');
    }
  }
}
