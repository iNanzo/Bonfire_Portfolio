// The admin's search (Ctrl+K or /): a box at the top of the sidebar that finds any field on
// any page and goes to it.
//
//   buildIndex   every page × a walk of the draft at each of its sections: sections, groups,
//                sub-groups, list entries (by their titles: a project's name, a flame's) and
//                fields, each with its label, help and More, search words (the settings map's
//                for the shared ones), a dropdown's choices and a short text field's value, so
//                "Fast Travel" finds the pack's Map action. Labels are as the page shows them
//                (renamed with ✎ or not).
//   the matcher  src/ui/settingsSearch.js, the one Bonfire Live and the Painter use: every word
//                typed must start a word somewhere; a label match counts most. Its synonyms are
//                the settings map's.
//   createSearch the box: results in a listbox under it, "Page › Group › Field" and a line of
//                help (or the value that matched), what matched marked (escaped first: content
//                is text, never markup). ↑/↓ choose, Enter goes, Esc clears and then closes.
//   revealPlan   what going to a field takes: its page, and every card on the way to open.
// The page (main.js) does the going: it opens the cards, shows the page, scrolls the field
// into view, focuses it and flashes it.
import { HEX_RE } from '../../src/contentRules.js';
import { SYNONYMS } from '../../src/settingsMap.js';
import { buildMatcher, createSearchBox, highlight } from '../../src/ui/settingsSearch.js';
import { PAGES, PAGE_ALIASES, SELECTS, defaultLabel, keywordsFor, subgroupsOf } from './schema.js';
import { helpFor, labelFor, subgroupHeading, titleOf } from './form.js';
import { el } from './el.js';
import { getAt, keyOf, parsePath, patternOf, within } from './paths.js';

/** The page with this id (or an old id's page: #effects is Colors now), or null. @param {string} id */
export const pageById = (id) => PAGES.find((p) => p.id === (PAGE_ALIASES[id] ?? id)) ?? null;
/** The page a field is on (an effects path no page names: Colors; anything else: the first). @param {string} key */
export const pageOf = (key) => PAGES.find((p) => p.keys.some((k) => within(key, k))) ?? (within(key, 'effects') ? pageById('colors') : PAGES[0]);

/**
 * What going to the field at `key` takes: its page, its path, and every object on the way
 * down (cards to open, the field's own included).
 * @param {any} draft @param {string} key
 */
export function revealPlan(draft, key) {
  const path = parsePath(key);
  const opens = [];
  let node = draft;
  for (const k of path) {
    node = node?.[k];
    if (node && typeof node === 'object' && !Array.isArray(node)) opens.push(node);
  }
  return { page: pageOf(key), path, opens };
}

/**
 * @typedef {{ id: string, page: string, pageLabel: string, crumbs: string[], label: string, hint: string,
 *   keywords: string[], options: string[], value: string, kind: 'section' | 'group' | 'entry' | 'field' }} AdminEntry
 */
/** A text value long enough to be prose isn't searched (a project's summary, a paragraph). */
const VALUE_MAX = 120;
/**
 * Cards that show only some of their entry's keys as fields: a scene's, an image's. An image
 * shows all of its own, its two switches too, set or not (they're only stored when on).
 */
const ONLY = { 'scenes[]': ['name', 'id', 'music'], '[].images[]': ['alt', 'caption', 'pixel', 'video'] };
const ALWAYS = new Set(['[].images[]']);
const isGroup = (v) => v !== null && typeof v === 'object';

/**
 * Everything the search can find in `draft`, page by page in the order the pages show it.
 * @param {any} draft
 * @param {{ labelOf?: (key: string) => string }} [o]  the page's names (renames included)
 * @returns {AdminEntry[]}
 */
export function buildIndex(draft, { labelOf = defaultLabel } = {}) {
  const out = [];
  const ctx = { labelOf, draft };
  let page = PAGES[0];
  let pageLabel = '';
  const words = (path) => {
    const { help, more } = helpFor(path, ctx);
    return [help, more].filter(Boolean).join(' ');
  };
  const add = (path, label, kind, crumbs, extra = {}) => out.push({
    id: keyOf(path), page: page.id, pageLabel, crumbs, label, kind, hint: words(path),
    keywords: keywordsFor(patternOf(path)), options: [], value: '', ...extra,
  });

  function walk(value, path, crumbs) {
    if (Array.isArray(value)) return walkList(value, path, crumbs);
    if (!isGroup(value)) return;
    const kind = patternOf(path).replace(/^.*\.images\[\]$/, '[].images[]');
    const only = ONLY[kind];
    const keys = ALWAYS.has(kind) ? only : Object.keys(value).filter((k) => k !== 'hidden' && k !== 'todo' && (!only || only.includes(k)));
    const groups = subgroupsOf(patternOf(path), keys) ?? [{ label: '', keys }];
    for (const g of groups) {
      const heading = g.label ? subgroupHeading(g, path, ctx) : null;
      const under = heading ? [...crumbs, heading] : crumbs;
      for (const k of g.keys) field(value[k], [...path, k], under);
    }
  }
  function walkList(list, path, crumbs) {
    list.forEach((item, i) => {
      const ipath = [...path, i];
      if (Array.isArray(item)) { // a table row: found by its cells
        add(ipath, titleOf(item, i), 'entry', crumbs, { value: item.filter((c) => typeof c === 'string').join(' · ') });
      } else if (isGroup(item)) { // a card: found by its title, then its fields under it
        const title = path.at(-1) === 'images' ? `Image ${i + 1}` : titleOf(item, i);
        add(ipath, title, 'entry', crumbs);
        walk(item, ipath, [...crumbs, title]);
      } else if (typeof item === 'string') { // a list of text: found by what it says
        add(ipath, labelFor(path), 'field', crumbs, { value: item.length <= VALUE_MAX ? item : '' });
      }
    });
  }
  function field(value, path, crumbs) {
    const label = labelFor(path);
    if (isGroup(value)) {
      add(path, label, 'group', crumbs);
      return walk(value, path, [...crumbs, label]);
    }
    const options = SELECTS[patternOf(path)]?.(draft).map((o) => o.label) ?? [];
    const text = typeof value === 'string' && value.length <= VALUE_MAX && !HEX_RE.test(value) ? value : '';
    add(path, label, 'field', crumbs, { options, value: text });
  }

  for (const p of PAGES) {
    page = p;
    pageLabel = labelOf(`page:${p.id}`);
    for (const key of p.keys) {
      const path = parsePath(key);
      const value = getAt(draft, path);
      if (value === undefined) continue; // ("Missing from content.json": nothing to find)
      const label = labelOf(key);
      add(path, label, 'section', []);
      walk(value, path, [label]);
    }
  }
  return out;
}

/** The trail to show over a result: the page, then the groups, each once ("The Knight" in Knight counts as Knight). */
export function crumbsOf(entry) {
  const plain = (s) => s.toLowerCase().replace(/^the\s+/, '');
  const trail = [];
  for (const c of [entry.pageLabel, ...entry.crumbs]) if (!trail.length || plain(trail.at(-1)) !== plain(c)) trail.push(c);
  if (trail.length > 1 && plain(trail.at(-1)) === plain(entry.label)) trail.pop();
  return trail;
}

/**
 * A search over an index: query → results, best first ({ entry, score, ranges, fields } from
 * settingsSearch.js buildMatcher, with each AdminEntry as the entry).
 * @param {AdminEntry[]} entries
 */
export function matcherFor(entries) {
  return buildMatcher(entries.map((e) => ({
    id: e.id, label: e.label, keywords: e.keywords, section: e.crumbs.join(' · '), tab: e.pageLabel,
    options: [...e.options, e.value].filter(Boolean), hint: e.hint, key: e.id.split(/[.[\]]/).filter(Boolean).at(-1), admin: e,
  })), { synonyms: SYNONYMS });
}

/**
 * The line under a result: the value that matched, else the help (what matched marked), as
 * markup (escaped).
 * @param {{ entry: any, fields: Record<string, [number, number][]> }} hit
 */
export function snippetOf(hit) {
  /** @type {AdminEntry} */
  const e = hit.entry.admin;
  if (e.value && hit.fields.options) {
    const start = [...e.options, e.value].join(' · ').length - e.value.length;
    const ranges = hit.fields.options.filter(([s]) => s >= start).map(([s, t]) => /** @type {[number, number]} */ ([s - start, t - start]));
    if (ranges.length) return `“${highlight(e.value, ranges)}”`;
  }
  const hint = e.hint.length > 150 ? `${e.hint.slice(0, 150).replace(/\s+\S*$/, '')}…` : e.hint;
  return highlight(hint, (hit.fields.hint ?? []).filter(([, t]) => t <= hint.length));
}

const MAX_RESULTS = 30;

/**
 * The search box and its results (a <search> for the sidebar). `entries()` gives the index
 * (the page rebuilds it when the draft changes: call `refresh()`); `onPick(key)` goes to a
 * result.
 * @param {{ entries: () => AdminEntry[], onPick: (key: string) => void, doc?: Document }} o
 */
export function createSearch({ entries, onPick, doc = document }) {
  const win = doc.defaultView ?? window;
  const id = 'admin-search';
  const input = el('input', {
    type: 'search', id: `${id}-input`, class: 'admin-search-input', placeholder: 'Search', autocomplete: 'off', spellcheck: 'false',
    enterkeyhint: 'go', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': `${id}-list`, 'aria-autocomplete': 'list',
    'aria-describedby': `${id}-note`, 'aria-keyshortcuts': 'Control+K /',
  });
  const list = el('ul', { id: `${id}-list`, class: 'search-results', role: 'listbox', 'aria-label': 'Search results', popover: 'manual' });
  const status = el('p', { class: 'settings-search-status', role: 'status' });
  const root = el('search', { class: 'admin-search settings-search' },
    el('label', { class: 'visually-hidden', for: input.id, text: 'Search the admin' }),
    el('span', { class: 'admin-search-row' }, input, el('kbd', { class: 'admin-search-key', 'aria-hidden': 'true', text: 'Ctrl K' })),
    el('span', { class: 'visually-hidden', id: `${id}-note`, text: 'Results update as you type: up and down choose one, Enter goes to it, Escape clears.' }),
    status, list);

  /** @type {ReturnType<typeof matcherFor> | null} */
  let matcher = null;
  let hits = [];
  let active = -1;
  /** @type {Element | null} */
  let back = null; // where focus goes back to when the search closes

  const popover = typeof list.showPopover === 'function';
  const isOpen = () => input.getAttribute('aria-expanded') === 'true';
  function place() {
    const r = input.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    const vh = doc.documentElement.clientHeight;
    const width = Math.min(560, vw - 16);
    list.style.setProperty('left', `${Math.round(Math.max(8, Math.min(r.left, vw - 8 - width)))}px`);
    list.style.setProperty('top', `${Math.round(r.bottom + 6)}px`);
    list.style.setProperty('width', `${Math.round(width)}px`);
    list.style.setProperty('max-height', `${Math.max(120, Math.round(vh - r.bottom - 14))}px`);
  }
  function open() {
    if (!hits.length) return close();
    if (!isOpen()) {
      if (popover) { try { list.showPopover(); } catch { /* showing */ } } else list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    place();
  }
  function close() {
    if (popover) { try { list.hidePopover(); } catch { /* hidden */ } } else list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  if (!popover) list.hidden = true;

  function setActive(i) {
    active = hits.length ? (i + hits.length) % hits.length : -1;
    for (const [n, li] of [...list.children].entries()) li.setAttribute('aria-selected', String(n === active));
    const li = list.children[active];
    if (li) {
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }
  }
  function render() {
    list.replaceChildren(...hits.map((hit, i) => {
      const e = hit.entry.admin;
      const label = el('span', { class: 'sr-label' });
      label.innerHTML = highlight(e.label, hit.ranges); // (escaped, then marked)
      const line = el('span', { class: 'sr-hint' });
      line.innerHTML = snippetOf(hit);
      return el('li', {
        id: `${id}-opt-${i}`, role: 'option', class: 'search-result', 'aria-selected': 'false', 'data-key': e.id,
        onpointerdown: (ev) => ev.preventDefault(), // (keeps the focus in the box until the pick)
        onpointermove: () => { if (active !== i) setActive(i); },
        onclick: () => pick(i),
      },
      el('span', { class: 'sr-path' }, crumbsOf(e).map((c) => el('span', { class: 'sr-crumb', text: c })), label),
      line.textContent ? line : null);
    }));
    setActive(hits.length ? 0 : -1);
    if (doc.activeElement === input) open(); else close();
  }
  function run(query) {
    const q = query.trim();
    if (!q) { hits = []; render(); return 0; }
    matcher ??= matcherFor(entries());
    const all = matcher(q);
    hits = all.slice(0, MAX_RESULTS);
    render();
    return all.length;
  }
  const box = createSearchBox({ input, status, onQuery: run, noun: 'result' });

  function pick(i = active) {
    const hit = hits[i] ?? hits[0];
    if (!hit) return;
    close();
    back = null;
    onPick(hit.entry.admin.id);
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return;
      e.preventDefault();
      if (!isOpen()) open();
      setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      if (!hits.length) return;
      e.preventDefault();
      pick();
    } else if (e.key === 'Escape' && !e.defaultPrevented) { // (the box had nothing left to clear)
      e.preventDefault();
      api.close({ restore: true });
    }
  });
  // (Back in the box: the query again, on the draft as it is now.)
  input.addEventListener('focus', () => { if (input.value.trim()) box.run(); });
  root.addEventListener('focusout', (e) => {
    if (!root.contains(/** @type {Node | null} */ (e.relatedTarget))) close();
  });
  const replace = () => { if (isOpen()) place(); };
  win.addEventListener('resize', replace);
  doc.addEventListener('scroll', replace, { capture: true, passive: true });

  const api = {
    root,
    /** Open the search: the box focused, its text selected, its results back. */
    focus() {
      const already = doc.activeElement === input;
      if (!already) back = doc.activeElement;
      input.focus(); // (taking the focus runs the query again)
      input.select();
      if (already && input.value.trim()) box.run();
    },
    /** Close the results; `restore`: the focus goes back to where it was before the search. */
    close({ restore = false } = {}) {
      close();
      const to = back;
      back = null;
      if (restore && to instanceof win.HTMLElement && to.isConnected && to !== doc.body) to.focus();
      else if (restore) input.blur();
    },
    /** The draft (or a name) changed: the next search builds the index again. */
    refresh() {
      matcher = null;
      if (isOpen() && input.value.trim()) box.run();
    },
  };
  return api;
}
