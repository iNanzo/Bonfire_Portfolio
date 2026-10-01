// Search in Bonfire Live's settings: what the box finds, and the dialog filtered to it.
//
//   index     every row the dialog has, as a search entry (src/ui/settingsSearch.js): each
//             setting (its label, hint and More, search words, choices, section and tab from
//             the settings map), each item of a grid or a checklist (Echo, Flicker, Slash…),
//             the sections' own blocks (the Link help, the MIDI and setups rows), and, read
//             again at every query because they change, the loop's scenes, the title cards,
//             the setups, the MIDI actions, the presets and the keyboard shortcuts. An entry's
//             id is its row's data-row in the dialog.
//   plan      which rows a query shows (pure): a row found, a group whose items were found
//             (only those show), a group found itself (all of its items show); how many each
//             tab holds (a group found counts once, not its items too).
//   in place  the dialog's every tab at once while a query stands (form[data-searching]):
//             each section headed "Tab › Section", rows that don't match hidden, then
//             sections and tabs with nothing left; tab buttons count their finds (0 greyed),
//             a row from All Settings shows in the Simple view with a badge, and the words
//             found are marked in the names (escaped: an imported setup's name is text).
//   keys      / or Ctrl+F in the dialog goes to the box; Esc clears it (a second Esc closes
//             the dialog); ↓ goes to the first result; Enter on a single result reveals it
//             (its tab, scrolled to, focused and flashed, unless motion is reduced).
//             Nothing found: words that would find something, from the map's synonyms.
import { esc } from '../html.js';
import { buildMatcher, highlight, createSearchBox, normalize, oneEdit } from '../ui/settingsSearch.js';
import { typing } from '../ui/shell.js';
import { TABS, SECTIONS, SYNONYMS, entriesFor, meta } from '../settingsMap.js';
import { OPTIONS, itemNames, itemHint, kindOf, GRID_KEYS } from './settingsControls.js';
import { GROUPS } from './settings.js';

/**
 * @typedef {import('../ui/settingsSearch.js').SearchEntry & { tabId?: string, parent?: string }} RowEntry
 * @typedef {import('../ui/settingsSearch.js').SearchHit} Hit
 */

const tabLabel = (id) => TABS.find((t) => t.id === id)?.label ?? '';
const sectionById = (id) => SECTIONS.find((s) => s.id === id);

/**
 * A section's own rows beyond its settings: [row id, section, name, what it is, search words].
 * @type {[string, string, string, string, string[]][]}
 */
const BLOCK_ROWS = [
  ['block:source', 'source', 'Sound Source', 'What the fire is listening to now; Change picks another source.', ['input', 'microphone', 'line in', 'file', 'demo']],
  ['block:link', 'beat', 'Setting Up Ableton Link', 'Carabiner, the Link bridge (npm run link) and Link in your DJ software, step by step.', ['carabiner', 'bridge', 'ableton', 'djay', 'rekordbox', 'traktor']],
  ['block:midi', 'midi', 'Connect MIDI', 'Play the moments from a pad controller: connect it, press Learn beside an action, then the pad.', ['controller', 'pads', 'learn', 'mapping']],
  ['block:loop', 'loop', 'Make a Scene In the Painter', 'Opens the Painter, where preset scenes are made and saved for the loop.', ['painter', 'new scene']],
  ['block:cards', 'moreCards', 'Add a Card', 'More title cards: shout-outs, the next act, a hashtag, each on drops, every 32 bars or on its key.', ['title card', 'shout-out']],
  ['block:setups', 'setups', 'Save a Setup', 'Saves everything as it is now under a name, to load again, export or import.', ['save', 'export', 'import', 'snapshot']],
];

/**
 * Every row the dialog always has, as search entries: the settings (in the map's order),
 * each grid's and checklist's items, and the sections' blocks.
 * @param {Record<string, any>} [settings] (the elements' names come from its keys)
 * @returns {RowEntry[]}
 */
export function staticEntries(settings) {
  /** @type {RowEntry[]} */
  const out = [];
  for (const e of entriesFor('live')) {
    const m = meta('live', e.live);
    const sec = sectionById(e.section);
    const tab = tabLabel(sec?.tab);
    out.push({
      id: e.live, key: e.live, label: m.label, keywords: m.keywords, section: sec?.label ?? '', tab, tabId: sec?.tab,
      options: kindOf(e.live) === 'select' ? OPTIONS[e.live].map(([, text]) => text) : [],
      hint: m.more ? `${m.hint} ${m.more.replace(/\n/g, ' ')}` : m.hint,
    });
    if (!Object.hasOwn(GRID_KEYS, e.live) && !GROUPS.includes(e.live)) continue;
    // (A group's items: each its own row, in the group's section, under the group's name.)
    const names = itemNames(e.live, settings);
    const keys = GRID_KEYS[e.live] ?? Object.keys(names).map((id) => `${e.live}.${id}`);
    Object.keys(names).forEach((id, i) => out.push({
      id: keys[i], key: keys[i], label: names[id], section: m.label, tab, tabId: sec?.tab, hint: itemHint(e.live, id), parent: e.live,
    }));
  }
  for (const [id, section, label, hint, keywords] of BLOCK_ROWS) {
    const sec = sectionById(section);
    out.push({ id, label, hint, keywords, section: sec?.label ?? '', tab: tabLabel(sec?.tab), tabId: sec?.tab });
  }
  return out;
}

/**
 * The rows that change, as search entries (read again at each query).
 * @param {{ scenes?: { ref: string, name: string, summary?: string }[], cards?: { title: string, subtitle?: string }[],
 *   setups?: string[], midi?: Record<string, string>, presets?: Record<string, { name: string, hint: string }>,
 *   keys?: [string, string][] }} o
 * @returns {RowEntry[]}
 */
export function dynamicEntries({ scenes = [], cards = [], setups = [], midi = {}, presets = {}, keys = [] } = {}) {
  const at = (section) => { const s = sectionById(section); return { section: s?.label ?? '', tab: tabLabel(s?.tab), tabId: s?.tab }; };
  return [
    ...scenes.map((s) => ({ id: `scene:${s.ref}`, label: s.name, hint: s.summary ?? '', keywords: ['scene'], ...at('loop') })),
    ...cards.map((c, i) => ({ id: `card:${i}`, label: c.title.trim() || `Card ${i + 2}`, hint: c.subtitle ?? '', keywords: ['card', `shift ${i + 2}`], ...at('moreCards') })),
    ...setups.map((name) => ({ id: `setup:${name}`, label: name, keywords: ['setup'], ...at('setups') })),
    ...Object.entries(midi).map(([id, name]) => ({ id: `midi:${id}`, label: name, keywords: ['midi', 'pad'], ...at('midi') })),
    ...Object.entries(presets).map(([id, p]) => ({ id: `preset:${id}`, label: p.name, hint: p.hint, keywords: ['preset'], section: 'Presets', tab: '' })),
    // (A shortcut is named by its keys; what it does is its hint, so a synonym doesn't find it.)
    ...keys.map(([k, what], i) => ({ id: `key:${i}`, label: k, hint: what, keywords: ['key', 'shortcut'], section: 'Keyboard Shortcuts', tab: '' })),
  ];
}

/**
 * A search over `entries` (the shared matcher), where a word's synonyms find names, search
 * words, sections and choices but not hints: "strobe" finds Negative Flash and Flicker, not
 * every hint that mentions a drop's flash. The word itself is looked for everywhere. Hits come
 * best first, each entry once.
 * @param {RowEntry[]} entries
 * @returns {(query: string) => Hit[]}
 */
export function matcherFor(entries) {
  const plain = buildMatcher(entries);
  const named = buildMatcher(entries.map((e) => ({ ...e, hint: '' })), { synonyms: SYNONYMS });
  const order = new Map(entries.map((e, i) => [e.id, i]));
  return (query) => {
    /** @type {Map<string, Hit>} */
    const best = new Map();
    for (const hit of [...plain(query), ...named(query)]) {
      const had = best.get(hit.entry.id);
      if (!had || hit.score > had.score) best.set(hit.entry.id, had && !hit.ranges.length ? { ...hit, ranges: had.ranges } : hit);
    }
    // (Back to the entries' own objects, in score order; ties in the given order.)
    return [...best.values()].map((h) => ({ ...h, entry: entries[order.get(h.entry.id)] }))
      .sort((a, b) => b.score - a.score || order.get(a.entry.id) - order.get(b.entry.id));
  };
}

/**
 * Which rows a query's hits show. `entries` are the ones searched (for the groups' items).
 * Returns the rows found (id → where the name matched), the groups shown whole, the groups
 * shown for some of their items, and the finds per tab (a group found counts once).
 * @param {Hit[]} hits
 * @param {RowEntry[]} entries
 */
export function planSearch(hits, entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  /** @type {Map<string, [number, number][]>} */
  const found = new Map(hits.map((h) => [h.entry.id, h.ranges]));
  const whole = new Set();
  const partly = new Set();
  for (const id of found.keys()) {
    const e = byId.get(id);
    if (!e) continue;
    if (e.parent) partly.add(e.parent);
    if (entries.some((x) => x.parent === id)) whole.add(id);
  }
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(TABS.map((t) => [t.id, 0]));
  let total = 0;
  for (const id of found.keys()) {
    const e = byId.get(id);
    if (e?.parent && whole.has(e.parent)) continue; // (its group counts for it)
    total++;
    if (e?.tabId && Object.hasOwn(counts, e.tabId)) counts[e.tabId]++;
  }
  return { found, whole, partly, counts, total };
}

/**
 * Words to try when a query finds nothing: synonyms near what was typed (a word starting the
 * same, or a letter off), else a few that always find something.
 * @param {string} query
 * @returns {string[]}
 */
export function suggestFor(query) {
  const words = normalize(query).match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set();
  const nearTo = (w) => (t) => (w.length >= 3 && t.startsWith(w.slice(0, 3))) || (w.length >= 4 && oneEdit(w, t));
  for (const w of words) {
    const near = nearTo(w);
    for (const [word, to] of Object.entries(SYNONYMS)) {
      // (A synonym near it brings the words it stands for; a word it stands for, itself.)
      for (const t of near(word) ? [word, ...to] : to.filter(near)) out.add(t);
    }
  }
  const list = [...out].filter((w) => !words.includes(w)).slice(0, 4);
  return list.length ? list : ['flash', 'frame rate', 'knights', 'colors'];
}

/** What a revealed row focuses, the first there is in this order. */
const FOCUS = [
  'input:checked:not(:disabled)', 'input:not([type="hidden"]):not([type="radio"]):not(:disabled)', 'select:not(:disabled)',
  'textarea:not(:disabled)', 'button:not(:disabled):not(.viz-tip)', 'a[href]', 'summary',
];
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Wire the dialog's search box. `dynamic()` gives the changing rows' data at each query
 * (dynamicEntries' input); `showTab(id)` shows a tab; `settings` names the elements.
 * Returns run(query) (what the box would do with it), clear(), reveal(rowId) and whether a
 * query stands.
 * @param {{ dialog: HTMLDialogElement, settings: Record<string, any>, dynamic: () => Parameters<typeof dynamicEntries>[0],
 *   showTab: (id: string) => void, onKeys?: () => void }} o
 */
export function createLiveSearch({ dialog, settings, dynamic, showTab, onKeys = () => {} }) {
  const form = /** @type {HTMLFormElement} */ (dialog.querySelector('form'));
  const input = /** @type {HTMLInputElement} */ (dialog.querySelector('[data-settings-search] input[type="search"]'));
  const emptyEl = /** @type {HTMLElement} */ (dialog.querySelector('[data-search-empty]'));
  const keysEl = /** @type {HTMLElement} */ (dialog.querySelector('[data-keys-results]'));
  const statics = staticEntries(settings);
  const matchStatic = matcherFor(statics);
  /** @type {{ el: Element, text: string }[]} */
  let marked = [];
  /** @type {{ hits: Hit[], plan: ReturnType<typeof planSearch> } | null} */
  let last = null;

  const rowEl = (id) => form.querySelector(`[data-row="${CSS.escape(id)}"]`);
  /** A row's name, where its matched words are marked. */
  const nameOf = (row) => (row.matches('fieldset.tri, .viz-check') ? row.querySelector('.tri-name, label > span') : row.querySelector('[data-name]'));
  const parentRow = (row) => row.parentElement?.closest('[data-row]') ?? null;
  /** An item whose whole group was found (the group counts for it). */
  const inWhole = (row) => { const up = parentRow(row); return !!up && !!last?.plan.whole.has(/** @type {HTMLElement} */ (up).dataset.row); };
  /** The rows found that show: the tabs' in the dialog's order, then the presets (in the header). */
  const results = () => [...form.querySelectorAll('.viz-settings-body [data-row].is-hit'), ...form.querySelectorAll('.viz-settings-top [data-row].is-hit')]
    .filter((r) => !r.closest('.is-miss, [hidden]:not([data-tab-panel])'));
  /** What to focus in a row: its switch's choice, its input, its button (never its "?"). */
  const focusable = (row) => {
    for (const s of FOCUS) {
      const el = /** @type {HTMLElement | null} */ (row.querySelector(s));
      if (el) return el;
    }
    return row.matches('button, summary') ? /** @type {HTMLElement} */ (row) : null;
  };

  function unmark() {
    for (const { el, text } of marked) el.textContent = text;
    marked = [];
    for (const el of form.querySelectorAll('.is-hit, .is-miss, .is-partly')) el.classList.remove('is-hit', 'is-miss', 'is-partly');
  }

  /** The dialog as it is without a query: one tab, every row, nothing marked. */
  function reset() {
    unmark();
    delete form.dataset.searching;
    emptyEl.hidden = true;
    keysEl.hidden = true;
    for (const b of form.querySelectorAll('[data-tab-count]')) { b.textContent = ''; b.hidden = true; }
    for (const t of form.querySelectorAll('[data-tab].is-empty')) t.classList.remove('is-empty');
    const on = form.querySelector('[data-tab][aria-selected="true"]');
    showTab(/** @type {HTMLElement} */ (on)?.dataset.tab ?? TABS[0].id);
    last = null;
  }

  /** Filter the dialog to `query`: how many rows it found. */
  function apply(query) {
    if (!query.trim()) { reset(); return 0; }
    unmark();
    for (const el of form.querySelectorAll('.is-revealed')) el.classList.remove('is-revealed');
    const extra = dynamicEntries(dynamic());
    const hits = [...matchStatic(query), ...matcherFor(extra)(query)];
    const plan = planSearch(hits, [...statics, ...extra]);
    last = { hits, plan };
    form.dataset.searching = '';
    for (const p of form.querySelectorAll('[data-tab-panel]')) /** @type {HTMLElement} */ (p).hidden = false;
    // Rows: found, shown for a group, or missed. (The presets stay in the header, found or
    // not: one found is ringed.)
    for (const row of form.querySelectorAll('[data-row]')) {
      const id = /** @type {HTMLElement} */ (row).dataset.row;
      const up = parentRow(row);
      const upId = up ? /** @type {HTMLElement} */ (up).dataset.row : null;
      const hit = plan.found.has(id);
      const shown = hit || (upId && plan.whole.has(upId)) || plan.partly.has(id) || id.startsWith('preset:');
      row.classList.toggle('is-hit', hit);
      row.classList.toggle('is-partly', !hit && plan.partly.has(id));
      row.classList.toggle('is-miss', !shown);
      const ranges = plan.found.get(id);
      const name = hit && ranges?.length ? nameOf(row) : null;
      if (name) {
        const text = name.textContent;
        marked.push({ el: name, text });
        name.innerHTML = highlight(text, ranges);
      }
    }
    // Sections, panels and tabs with nothing left go; the rest count their finds.
    const visible = (row) => !row.classList.contains('is-miss') && !row.closest('[hidden]:not([data-tab-panel])');
    for (const sec of form.querySelectorAll('[data-section]')) {
      sec.classList.toggle('is-miss', ![...sec.querySelectorAll('[data-row]')].some(visible));
    }
    for (const panel of form.querySelectorAll('[data-tab-panel]')) {
      const id = /** @type {HTMLElement} */ (panel).dataset.tabPanel;
      const n = [...panel.querySelectorAll('[data-row].is-hit')].filter((r) => visible(r) && !inWhole(r)).length;
      panel.classList.toggle('is-miss', !n && ![...panel.querySelectorAll('[data-row]')].some(visible));
      const tab = form.querySelector(`[data-tab="${id}"]`);
      const count = tab?.querySelector('[data-tab-count]');
      if (count) { count.textContent = String(n); /** @type {HTMLElement} */ (count).hidden = false; }
      tab?.classList.toggle('is-empty', !n);
    }
    keysEl.hidden = ![...keysEl.querySelectorAll('[data-row]')].some((r) => !r.classList.contains('is-miss'));
    // (Counted as shown: a row hidden for now, like the volume without a file playing, isn't.)
    const total = results().filter((r) => !inWhole(r)).length;
    emptyEl.hidden = total > 0;
    if (!total) {
      emptyEl.querySelector('[data-search-query]').textContent = query.trim();
      emptyEl.querySelector('[data-search-suggest]').innerHTML = suggestFor(query)
        .map((w) => `<button type="button" class="bulk-btn" data-suggest="${esc(w)}">${esc(w)}</button>`).join(' ');
    }
    return total;
  }

  const box = createSearchBox({ input, status: dialog.querySelector('[data-settings-search] [data-search-status]'), onQuery: apply, noun: 'setting' });

  /**
   * Show a row: the search cleared, its tab, scrolled to the middle and focused, a short
   * flash (none with reduced motion). A row only All Settings has stays shown in the Simple
   * view (marked, like a search's) until the dialog closes. False if there's no such row.
   * @param {string} id a row's data-row (a settings key, "looks.echo", "scene:b:x"…)
   */
  function reveal(id) {
    let row = rowEl(id);
    if (!row) return false;
    if (id.startsWith('key:')) { onKeys(); return true; }
    if (input.value) box.clear();
    row = rowEl(id) ?? row;
    const panel = row.closest('[data-tab-panel]');
    if (panel) showTab(/** @type {HTMLElement} */ (panel).dataset.tabPanel);
    for (let el = row; el && el !== form; el = el.parentElement) {
      if (el.hasAttribute('data-adv')) el.classList.add('is-revealed');
      if (el instanceof HTMLDetailsElement) el.open = true;
    }
    const still = reducedMotion();
    row.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    focusable(row)?.focus({ preventScroll: true });
    if (!still) {
      row.classList.remove('is-found');
      void (/** @type {HTMLElement} */ (row)).offsetWidth;
      row.classList.add('is-found');
      setTimeout(() => row.classList.remove('is-found'), 1400);
    }
    return true;
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // (the form is method=dialog: Enter would close it)
      box.run();
      const found = results().filter((r) => !inWhole(r));
      if (found.length === 1) reveal(/** @type {HTMLElement} */ (found[0]).dataset.row);
    } else if (e.key === 'ArrowDown' && input.value.trim()) {
      box.run();
      const first = results().map(focusable).find(Boolean);
      if (first) { e.preventDefault(); first.focus(); first.scrollIntoView({ block: 'nearest' }); }
    }
  });
  // In the dialog: / or Ctrl+F go to the box; Esc clears a query from anywhere first.
  let cleared = false;
  dialog.addEventListener('keydown', (e) => {
    if (e.target === input) return;
    if ((e.key === '/' && !typing(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f')) {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      cleared = true;
      box.clear();
      input.focus();
    }
  });
  dialog.addEventListener('keyup', (e) => { if (e.key === 'Escape') cleared = false; });
  dialog.addEventListener('cancel', (e) => { if (cleared) { cleared = false; e.preventDefault(); } });
  dialog.addEventListener('click', (e) => {
    const t = /** @type {Element} */ (e.target);
    const word = t.closest?.('[data-suggest]');
    if (word) { input.value = /** @type {HTMLElement} */ (word).dataset.suggest; box.run(); input.focus(); return; }
    if (t.closest?.('[data-search-clear]')) { box.clear(); input.focus(); }
  });
  dialog.addEventListener('close', () => {
    for (const el of form.querySelectorAll('.is-revealed')) el.classList.remove('is-revealed');
  });

  return {
    /** Search for `query` now (as if typed), or clear with ''. */
    run(query) { input.value = query; box.run(query); },
    clear: () => box.clear(),
    reveal,
    focus() { input.focus(); input.select(); },
    get active() { return !!input.value.trim(); },
    /** The query again (the rows it reads changed: a scene saved, a card added). */
    refresh() { if (input.value.trim()) box.run(); },
  };
}
