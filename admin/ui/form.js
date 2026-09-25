// The editor: renders any part of content.json as a form and writes edits back
// into the draft. Lists of entries are cards (drag or ↑/↓ to reorder, hide, delete,
// add); lists of text and table rows get row editors; `images` gets the image
// manager. Every field carries data-path (e.g. projects[2].images[0].alt) so
// validation messages land on the right field.
//
// User text only ever reaches the page through .value / textContent.
import { ADD_LABELS, COLUMNS, FIXED, HELP, LABELS, MULTILINE, MULTILINE_LISTS, NULLABLE, READONLY, SELECTS, TEMPLATES, TITLE_KEYS, hint } from './schema.js';
import { ID_RE, slugify } from '../../src/contentRules.js';
import { newImageSrc, processImage } from './images.js';

// ---- paths ------------------------------------------------------------------------
export const keyOf = (path) => path.map((k, i) => (typeof k === 'number' ? `[${k}]` : (i ? '.' : '') + k)).join('');
export const patternOf = (path) => path.map((k, i) => (typeof k === 'number' ? '[]' : (i ? '.' : '') + k)).join('');
export const getAt = (obj, path) => path.reduce((o, k) => o?.[k], obj);
const setAt = (obj, path, value) => { getAt(obj, path.slice(0, -1))[path.at(-1)] = value; };

const humanize = (key) => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
export const labelFor = (path) => hint(LABELS, patternOf(path)) ?? humanize(path.at(-1));
const addLabel = (path) => hint(ADD_LABELS, patternOf(path)) ?? 'entry';

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
 *   changed({ rerender }), imageUrl(src), siteUrl, toast(msg), busy(on)
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
  const wrap = el('div', { class: group ? 'group' : 'field', 'data-path': keyOf(path) });
  const id = `f${++uid}`;
  wrap.append(group ? el('h4', { class: 'group-label', text: label }) : el('label', { for: id, text: label }));
  const help = hint(HELP, patternOf(path));
  if (help) wrap.append(el('p', { class: 'help', text: help }));
  const control = renderValue(value, path, ctx);
  if (!group) control.id = id;
  wrap.append(control, el('p', { class: 'error', role: 'alert' }));
  return wrap;
}

function renderScalar(value, path, ctx, { nullable = hint(NULLABLE, patternOf(path)), multiline } = {}) {
  const pattern = patternOf(path);
  const key = path.at(-1);
  const options = SELECTS[pattern]?.();
  if (options) {
    const select = el('select', { onchange: () => update(path, select.value, ctx) }, options.map((o) => el('option', { value: o, text: o })));
    select.value = value;
    return select;
  }
  if (typeof value === 'boolean') {
    const box = el('input', { type: 'checkbox', onchange: () => update(path, box.checked, ctx) });
    box.checked = value;
    return box;
  }
  if (typeof value === 'number') {
    const input = el('input', { type: 'number', inputmode: 'numeric', oninput: () => update(path, input.value === '' ? value : Number(input.value), ctx) });
    input.value = String(value);
    return input;
  }
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

/** Write one edit into the draft, plus the small follow-ups some fields need. */
function update(path, value, ctx) {
  setAt(ctx.draft, path, value);
  const parentPath = path.slice(0, -1);
  const parent = getAt(ctx.draft, parentPath);
  const key = path.at(-1);
  // A new project's id follows its name until you edit the id yourself.
  if (key === 'name' && parent && ctx.fresh.has(parent) && 'id' in parent) {
    parent.id = uniqueId(slugify(value) || 'project', ctx, parent);
    const idField = document.querySelector(`[data-path="${CSS.escape(keyOf([...parentPath, 'id']))}"] input`);
    if (idField) idField.value = parent.id;
  }
  if (key === 'id' && parent) ctx.fresh.delete(parent);
  if (TITLE_KEYS.includes(key)) {
    for (const t of document.querySelectorAll(`[data-title-for="${CSS.escape(keyOf(parentPath))}"]`)) t.textContent = titleOf(parent, 0);
  }
  ctx.changed();
}

function uniqueId(base, ctx, self) {
  const taken = new Set([ctx.draft.featured, ...ctx.draft.projects, ...ctx.draft.archive].filter((p) => p !== self).map((p) => p.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

function renderTodo(obj, path, ctx) {
  return el('div', { class: 'todo' },
    el('span', { class: 'todo-mark', text: 'To confirm' }),
    el('span', { class: 'todo-text', text: obj.todo }),
    el('button', { type: 'button', class: 'link-button', text: 'Mark done', onclick: () => { delete obj.todo; ctx.changed({ rerender: true }); } }));
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
  const entry = make ? make() : blank(list[0]);
  list.push(entry);
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    ctx.open.add(entry);
    if ('id' in entry) { ctx.fresh.add(entry); entry.id = uniqueId(slugify(entry.name ?? '') || 'project', ctx, entry); }
  }
  ctx.focus = keyOf([...path, list.length - 1]);
  ctx.changed({ rerender: true });
}

/** Lists of entries (projects, roles, skills…): one card each. */
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

function renderCard(list, i, path, ctx, fixed) {
  const item = list[i];
  const ipath = [...path, i];
  const key = keyOf(ipath);
  const isProject = path.length === 1 && (path[0] === 'projects' || path[0] === 'archive');
  const open = ctx.open.has(item);
  const card = el('section', { class: `card${item.hidden ? ' is-hidden' : ''}`, 'data-path': key, 'data-index': i });

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
  isProject && item.images?.[0] ? el('img', { class: 'card-thumb', alt: '', src: ctx.thumb(item.images[0].src), loading: 'lazy' }) : null,
  el('span', { class: 'card-title', 'data-title-for': key, text: titleOf(item, i) }),
  isProject ? el('span', { class: 'card-id', text: item.id }) : null);

  const badges = el('span', { class: 'badges' },
    item.hidden ? el('span', { class: 'badge', text: 'Hidden' }) : null,
    typeof item.todo === 'string' ? el('span', { class: 'badge badge-todo', text: 'To confirm' }) : null,
    el('span', { class: 'badge badge-error', text: 'Needs fixing' }));

  const actions = el('span', { class: 'card-actions' });
  if (!fixed) {
    actions.append(
      ...orderButtons(list, i, ctx),
      iconButton(item.hidden ? 'Show on the site' : 'Hide from the site', item.hidden ? '◌' : '◉', () => {
        if (item.hidden) delete item.hidden; else item.hidden = true;
        ctx.changed({ rerender: true });
      }, { 'aria-pressed': String(!!item.hidden), class: `icon eye${item.hidden ? ' is-off' : ''}` }),
      iconButton('Delete', '✕', () => {
        const extra = isProject && item.images?.length ? ' Its images are removed from the site when you save.' : '';
        if (!confirm(`Delete “${titleOf(item, i)}”?${extra}`)) return;
        list.splice(i, 1);
        ctx.changed({ rerender: true });
      }, { class: 'icon danger' }),
    );
  }

  card.append(
    el('div', { class: 'card-head' }, fixed ? null : el('span', { class: 'handle', draggable: 'true', title: 'Drag to reorder', 'aria-hidden': 'true', text: '⋮⋮' }), toggle, badges, actions),
    el('p', { class: 'error', role: 'alert' }),
    body,
  );
  body.append(renderObject(item, ipath, ctx));
  if (isProject) body.append(projectActions(item, list, i, path[0], ctx));
  return card;
}

/** Feature / move between Projects and Earlier explorations / open its page. */
function projectActions(item, list, i, where, ctx) {
  const d = ctx.draft;
  const moveTo = (target) => { list.splice(i, 1); d[target].unshift(item); ctx.changed({ rerender: true }); };
  return el('div', { class: 'card-foot' },
    el('button', { type: 'button', class: 'link-button', text: '★ Feature this', onclick: () => {
      const old = d.featured;
      d.featured = item;
      list[i] = old;
      ctx.changed({ rerender: true });
      ctx.toast(`“${item.name}” is now the featured project; “${old.name}” took its place.`);
    } }),
    where === 'projects'
      ? el('button', { type: 'button', class: 'link-button', text: '→ Move to Earlier explorations', onclick: () => moveTo('archive') })
      : el('button', { type: 'button', class: 'link-button', text: '→ Move to Projects', onclick: () => moveTo('projects') }),
    ctx.siteUrl && ID_RE.test(item.id ?? '') ? el('a', { class: 'link-button', href: `${ctx.siteUrl}projects/${item.id}/`, target: '_blank', rel: 'noopener', text: 'Open its page ↗' }) : null);
}

/** The featured project: one card, always open, no list actions. */
export function renderFeatured(ctx) {
  const item = ctx.draft.featured;
  const card = el('section', { class: `card is-featured${item.hidden ? ' is-hidden' : ''}`, 'data-path': 'featured' },
    el('div', { class: 'card-head' },
      el('span', { class: 'card-toggle is-static' },
        item.images?.[0] ? el('img', { class: 'card-thumb', alt: '', src: ctx.thumb(item.images[0].src) }) : null,
        el('span', { class: 'card-title', 'data-title-for': 'featured', text: titleOf(item, 0) }),
        el('span', { class: 'card-id', text: item.id })),
      el('span', { class: 'badges' },
        item.hidden ? el('span', { class: 'badge', text: 'Hidden' }) : null,
        el('span', { class: 'badge badge-error', text: 'Needs fixing' })),
      el('span', { class: 'card-actions' },
        iconButton(item.hidden ? 'Show on the site' : 'Hide from the site', item.hidden ? '◌' : '◉', () => {
          if (item.hidden) delete item.hidden; else item.hidden = true;
          ctx.changed({ rerender: true });
        }, { 'aria-pressed': String(!!item.hidden), class: `icon eye${item.hidden ? ' is-off' : ''}` }))),
    el('p', { class: 'error', role: 'alert' }),
    el('div', { class: 'card-body' }, renderObject(item, ['featured'], ctx)));
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
  box.append(el('div', { class: 'row row-head', 'aria-hidden': 'true' }, el('span'), ...cols.map((c) => el('span', { text: c }))));
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
    box.append(el('figure', { class: 'image-tile', 'data-index': i, 'data-path': keyOf(ipath) },
      el('div', { class: 'image-frame', draggable: 'true', title: 'Drag to reorder' },
        el('img', { alt: im.alt || '', src: pending?.preview ?? ctx.thumb(im.src), loading: 'lazy' }),
        i === 0 ? el('span', { class: 'image-tag', text: 'Icon' }) : null,
        pending ? el('span', { class: 'image-tag image-new', text: 'New' }) : null),
      el('code', { class: 'image-src', text: im.src }),
      renderField(im.alt ?? '', [...ipath, 'alt'], ctx, 'Alt text (describe it)'),
      renderField(im.caption ?? '', [...ipath, 'caption'], ctx, 'Caption'),
      el('label', { class: 'check' }, pixel, ' Pixel art (keep it crisp)'),
      el('div', { class: 'image-actions' },
        iconButton('Move earlier', '←', () => moveItem(list, i, i - 1, ctx), { disabled: i === 0 }),
        iconButton('Move later', '→', () => moveItem(list, i, i + 1, ctx), { disabled: i === list.length - 1 }),
        iconButton('Remove image', '✕', () => {
          if (!pending && !confirm('Remove this image? It’s deleted from the site when you save.')) return;
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
    el('button', { type: 'button', class: 'add', disabled: !idOk, text: '+ Add images', onclick: () => picker.click() }),
    el('p', { class: 'help', text: idOk ? 'PNG, JPG, WebP or GIF. Converted to WebP here, uploaded when you save.' : 'Give the project a valid id first — images are stored under it.' }));
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
