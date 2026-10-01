// The Painter's panel search: a box over the panel (outside what's drawn again, so it keeps
// its focus and its query through a redraw) that narrows the panel to the rows it finds.
//
//   the index   every row of the panel (layout.js: the map's settings, the Painter's own rows,
//               every layer, drop hit, detail and blend), with its label, its search words,
//               its section (and sub-heading), its choices and its hint and More, matched by
//               the shared settings search (src/ui/settingsSearch.js: each word starts a word
//               somewhere, synonyms, a typo forgiven), best first.
//   showing     the panel shows only the rows found (bindPanel's filter): their sections
//               opened, the rest hidden, what matched marked in each label. The query is
//               searched again whenever the panel is drawn again (the scene's shape changed).
//   not shown   a row the scene's shape leaves out (a layer's detail while the layer is off,
//               Movement Size while the camera is still, the knights' fields with none by the
//               fire) is listed under the box, with how to bring it back: "Glow Strength: turn
//               on Glow in Layers to see this".
//   keys        `/` focuses the box (the page's keys, main.js); Esc clears it, and Esc in an
//               empty box hands the keyboard back to the page. How many were found is read out
//               once typing stops.
import { buildMatcher, createSearchBox } from '../ui/settingsSearch.js';
import { SYNONYMS } from '../settingsMap.js';
import { LAYER_BLENDS, LAYER_DETAILS } from '../visualizer/looks.js';
import { PANEL_SECTIONS, sectionRows, rowText, shownRule, choices } from './layout.js';

/**
 * @typedef {import('../ui/settingsSearch.js').SearchEntry & { id: string }} PanelEntry
 * @typedef {{ rows: Map<string, { ranges: [number, number][], label: string }>, hidden: { id: string, label: string, note: string }[] }} PanelFound
 */

/**
 * Every row of the panel as a search entry, in the panel's order (a layer's details after
 * it, the blends after How Each Layer Blends). `ctx`: panelMarkup's (the page's weapons,
 * elements, flames and shots, as choices).
 * @param {object} [ctx]
 * @returns {PanelEntry[]}
 */
export function searchEntries(ctx = {}) {
  /** @type {PanelEntry[]} */
  const out = [];
  const seen = new Set();
  const add = (id, section, group) => {
    if (seen.has(id)) return;
    const t = rowText(id);
    if (!t) return;
    seen.add(id);
    // (A row's choices by name: "kaleido" finds the looks, "armet" the helmets.)
    const options = choices(id, ctx).map(([, name]) => name);
    const hint = [t.hint, t.more].filter(Boolean).join(' ');
    out.push({ id, label: t.label, keywords: t.keywords, section: section.label, tab: group.head ?? '', options, hint, key: t.path });
  };
  /** A row's own rows: a layer's details, the blends. */
  const inside = (id) => {
    const [kind, key] = id.split('.');
    if (kind === 'layer') return (LAYER_DETAILS[key] ?? []).map((d) => `detail.${d}`);
    return id === 'blends' ? Object.keys(LAYER_BLENDS).map((b) => `blend.${b}`) : [];
  };
  for (const sec of PANEL_SECTIONS) {
    for (const [group, rows] of sectionRows(sec.id)) {
      for (const id of rows.flatMap((r) => [r, ...inside(r)])) add(id, sec, group);
    }
  }
  return out;
}

/**
 * What a query finds for `scene`: the rows the panel shows (id → its label and where the
 * query matched in it), and those the scene's shape leaves out, each with how to bring it
 * back. Pure.
 * @param {(query: string) => import('../ui/settingsSearch.js').SearchHit[]} match  buildMatcher's, over searchEntries
 * @param {string} query
 * @param {any} scene
 * @returns {PanelFound}
 */
export function findInPanel(match, query, scene) {
  /** @type {PanelFound} */
  const found = { rows: new Map(), hidden: [] };
  for (const hit of match(query)) {
    const { id, label } = /** @type {PanelEntry} */ (hit.entry);
    const rule = shownRule(id);
    if (rule && !rule[0](scene)) found.hidden.push({ id, label, note: `${label}: ${rule[1]}` });
    else found.rows.set(id, { ranges: hit.ranges, label });
  }
  return found;
}

/**
 * Wire the panel's search box. `panel`: bindPanel's (its filter); `scene`: the scene now;
 * `notes`: where the rows the scene leaves out are listed. Returns refresh() (search again:
 * the panel was drawn again), focus() and clear().
 * @param {{ input: HTMLInputElement, status: HTMLElement | null, notes: HTMLElement,
 *   panel: { filter: (rows: PanelFound['rows'] | null, o?: { top?: boolean }) => void }, scene: () => any, ctx?: object }} o
 */
export function createPanelSearch({ input, status, notes, panel, scene, ctx = {} }) {
  const match = buildMatcher(searchEntries(ctx), { synonyms: SYNONYMS });
  let query = '';
  let shown = '';  // the notes as last listed (so a redraw that changes nothing leaves them be)

  /** The rows the scene leaves out, under the box. */
  function list(hidden) {
    const key = hidden.map((h) => h.id).join();
    if (key === shown) return;
    shown = key;
    notes.hidden = !hidden.length;
    const title = notes.ownerDocument.createElement('p');
    title.className = 'pnt-search-notes-title';
    title.textContent = `Not shown now (${hidden.length})`; // (how many: the list scrolls)
    const ul = notes.ownerDocument.createElement('ul');
    for (const h of hidden) {
      const li = notes.ownerDocument.createElement('li');
      li.textContent = h.note;
      ul.append(li);
    }
    notes.replaceChildren(...(hidden.length ? [title, ul] : []));
  }
  /**
   * Search for `q` and show what it finds; how many. A query typed starts the panel at its
   * top (the first row found, not wherever it was scrolled to); the same one searched again
   * after a redraw leaves it where it is.
   */
  function run(q, { again = false } = {}) {
    const typed = !again && q.trim() !== query.trim();
    query = q;
    if (!q.trim()) {
      panel.filter(null);
      list([]);
      return 0;
    }
    const found = findInPanel(match, q, scene());
    panel.filter(found.rows, { top: typed });
    list(found.hidden);
    return found.rows.size + found.hidden.length;
  }
  const box = createSearchBox({ input, status, onQuery: (q) => run(q), noun: 'setting' });
  // (Esc in an empty box: back to the page, so its keys work again.)
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !input.value && !e.defaultPrevented) input.blur(); });
  return {
    /** Search again (the scene's shape changed what the panel shows). */
    refresh() { if (query.trim()) run(query, { again: true }); },
    focus() { input.focus(); input.select(); },
    clear: () => box.clear(),
    get query() { return query; },
  };
}
