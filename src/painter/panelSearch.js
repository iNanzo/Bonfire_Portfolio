// The Painter's panel search: a box over the panel (outside what's drawn again, so it keeps
// its focus and its query through a redraw) that narrows the panel to the rows it finds.
//
//   the index   every row of the panel (layout.js: the map's settings, the Painter's own rows,
//               every layer, drop hit, detail and blend), with its label, its search words,
//               its section (and its group: a sub-heading, or the map's name for it, "The
//               Drop"), its choices and its hint and More, matched by the shared settings
//               search (src/ui/settingsSearch.js: each word starts a word somewhere, synonyms,
//               a typo forgiven), best first. A row found only in its hint (or its path) is
//               left out when others are found by their names: "drop" finds Drop Hits, not
//               every hint that mentions a drop.
//   showing     the panel shows only the rows found (bindPanel's filter): their sections
//               opened, the rest hidden, what matched marked in each label, the best found
//               scrolled to the top. The query is searched again whenever the panel is drawn
//               again (the scene's shape changed).
//   not shown   a row the scene's shape leaves out (a layer's detail while the layer is off,
//               Movement Size while the camera is still, the knights' fields with none by the
//               fire) is listed under the box, with how to bring it back: "Glow Strength: turn
//               on Glow in Layers to see this" (many left out for one reason share a line); the
//               row that does (Glow's switch) shows in the panel, one click from the note. On
//               a phone the list starts folded to its count.
//   tools       a switch of the page's that isn't a part of the scene (the Stats Overlay, in the
//               Tools menu) is found by its words from the settings map too, and listed with the
//               rows left out, saying where it is: "Stats Overlay: turn it on in Tools, or press U".
//   keys        `/` focuses the box (the page's keys, main.js); Esc clears it, and Esc in an
//               empty box hands the keyboard back to the page. How many were found is read out
//               once typing stops.
import { buildMatcher, createSearchBox } from '../ui/settingsSearch.js';
import { SECTIONS as MAP_SECTIONS, SETTINGS, SYNONYMS } from '../settingsMap.js';
import { LAYER_BLENDS, LAYER_DETAILS } from '../visualizer/looks.js';
import { PANEL_SECTIONS, sectionRows, rowText, shownRule, choices } from './layout.js';

/**
 * @typedef {import('../ui/settingsSearch.js').SearchEntry & { id: string }} PanelEntry
 * @typedef {{ rows: Map<string, { ranges: [number, number][], label: string }>, hidden: { id: string, label: string, why: string, note: string }[],
 *   via: Set<string>, first: string | null }} PanelFound
 */

/**
 * The shared synonyms, and the Painter's: words its own rows are searched by that the
 * settings use another form of ("firefly" isn't the start of "fireflies").
 */
export const PAINTER_SYNONYMS = { ...SYNONYMS, firefly: ['fireflies'] };
/** Where a match is only a mention: a row found by these alone gives way to rows found by name. */
const WEAK = new Set(['hint', 'key']);

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
    // (Its group by name, headed or not: "drop" finds every drop hit, in The Drop.)
    const named = group.head ?? MAP_SECTIONS.find((m) => m.id === group.id)?.label ?? '';
    const tab = named === section.label ? '' : named;
    out.push({ id, label: t.label, keywords: t.keywords, section: section.label, tab, options, hint, key: t.path });
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

/** The page's switches the search finds (in Tools, not the panel), by the map's words, and where each is. */
const TOOL_SWITCHES = [{ id: 'tool.stats', entry: SETTINGS.stats, where: 'turn it on in Tools, or press U' }];

/**
 * The Tools menu's switches as search entries (their own index: they aren't rows of the panel).
 * @returns {PanelEntry[]}
 */
export const toolEntries = () =>
  TOOL_SWITCHES.map(({ id, entry }) => ({
    id,
    label: entry.label,
    keywords: entry.keywords ?? [],
    section: 'Tools',
    tab: '',
    options: [],
    hint: entry.hint,
    key: '',
  }));

/**
 * What a query finds for `scene`: the rows the panel shows (id → its label and where the
 * query matched in it), and those the scene's shape leaves out, each with how to bring it
 * back. A row found only in its hint or path is left out when any is found by name (its
 * label, words, group or choices). For a row left out, the row that brings it back shows
 * too (`via`: shown for that, not found). `first`: the row the panel scrolls to (the best
 * found, or what brings it back). `tools` (buildMatcher's, over toolEntries): a Tools switch
 * found by name is listed with those left out, saying where it is. Pure.
 * @param {(query: string) => import('../ui/settingsSearch.js').SearchHit[]} match  buildMatcher's, over searchEntries
 * @param {string} query
 * @param {any} scene
 * @param {((query: string) => import('../ui/settingsSearch.js').SearchHit[]) | null} [tools]
 * @returns {PanelFound}
 */
export function findInPanel(match, query, scene, tools = null) {
  /** @type {PanelFound} */
  const found = { rows: new Map(), hidden: [], via: new Set(), first: null };
  const hits = match(query);
  const named = (hit) => Object.keys(hit.fields).some((f) => !WEAK.has(f));
  const kept = hits.some(named) ? hits.filter(named) : hits;
  /** @type {string[]} */
  const back = [];
  for (const hit of kept) {
    const { id, label } = /** @type {PanelEntry} */ (hit.entry);
    const rule = shownRule(id);
    if (rule && !rule[0](scene)) {
      found.hidden.push({ id, label, why: rule[1], note: `${label}: ${rule[1]}` });
      const by = rule[2].find((r) => !shownRule(r) || shownRule(r)[0](scene));
      if (by) back.push(by);
      found.first ??= by ?? null;
    } else {
      found.rows.set(id, { ranges: hit.ranges, label });
      found.first ??= id;
    }
  }
  for (const id of back) {
    if (found.rows.has(id)) continue;
    found.rows.set(id, { ranges: [], label: rowText(id)?.label ?? '' });
    found.via.add(id);
  }
  for (const hit of tools?.(query).filter(named) ?? []) {
    const { id, label } = /** @type {PanelEntry} */ (hit.entry);
    const where = TOOL_SWITCHES.find((t) => t.id === id)?.where ?? 'in Tools';
    found.hidden.push({ id, label, why: where, note: `${label}: ${where}` });
  }
  return found;
}

/** More rows than this left out for one reason share a line. */
const SHARED_NOTE = 3;
/**
 * The notes under the box, one a row ("Glow Strength: turn on Glow in Layers to see this"),
 * but where many are left out for one reason (the scene's own drop hits, the blends), one
 * line for them all: "Shatter, Shock, Burst and 10 more: pick This Scene’s Own under Drop
 * Hits to see this". In the order found. Pure.
 * @param {PanelFound['hidden']} hidden
 * @returns {string[]}
 */
export function notesFor(hidden) {
  /** @type {Map<string, PanelFound['hidden']>} */
  const by = new Map();
  for (const h of hidden) by.set(h.why, [...(by.get(h.why) ?? []), h]);
  return [...by.entries()].flatMap(([why, list]) =>
    list.length > SHARED_NOTE
      ? [
          `${list
            .slice(0, SHARED_NOTE)
            .map((h) => h.label)
            .join(', ')} and ${list.length - SHARED_NOTE} more: ${why}`,
        ]
      : list.map((h) => h.note),
  );
}

/**
 * Wire the panel's search box. `panel`: bindPanel's (its filter); `scene`: the scene now;
 * `notes`: where the rows the scene leaves out are listed (folded to their count to start
 * with where `folded()` says: a phone's short bottom sheet). Returns refresh() (search again:
 * the panel was drawn again), focus() and clear().
 * @param {{ input: HTMLInputElement, status: HTMLElement | null, notes: HTMLElement,
 *   panel: { filter: (rows: PanelFound['rows'] | null, o?: { top?: boolean, to?: string | null }) => void }, scene: () => any, ctx?: object,
 *   folded?: () => boolean }} o
 */
export function createPanelSearch({ input, status, notes, panel, scene, ctx = {}, folded = () => false }) {
  const match = buildMatcher(searchEntries(ctx), { synonyms: PAINTER_SYNONYMS });
  const tools = buildMatcher(toolEntries(), { synonyms: PAINTER_SYNONYMS });
  let query = '';
  let shown = ''; // the notes as last listed (so a redraw that changes nothing leaves them be)
  const doc = notes.ownerDocument;
  // The list: a fold (its count the summary), so it can give its room to the rows found; it
  // stays as it was left from one query to the next.
  const fold = doc.createElement('details');
  fold.className = 'pnt-search-notes-fold';
  const title = doc.createElement('summary');
  title.className = 'pnt-search-notes-title';
  const ul = doc.createElement('ul');
  fold.append(title, ul);
  let opened = false; // (the fold set open or not for the first list: after that, the user's)

  /** The rows the scene leaves out, under the box. */
  function list(hidden) {
    const key = hidden.map((h) => h.id).join();
    if (key === shown) return;
    shown = key;
    notes.hidden = !hidden.length;
    if (!hidden.length) {
      notes.replaceChildren();
      return;
    }
    if (!opened) {
      fold.open = !folded();
      opened = true;
    }
    title.textContent = `Not shown now (${hidden.length})`; // (how many: the list scrolls)
    ul.replaceChildren(
      ...notesFor(hidden).map((text) => {
        const li = doc.createElement('li');
        li.textContent = text;
        return li;
      }),
    );
    if (fold.parentNode !== notes) notes.replaceChildren(fold);
  }
  /**
   * Search for `q` and show what it finds; how many (the rows shown only to bring back one
   * left out aren't counted). A query typed scrolls the panel to the best row found (not
   * wherever it was); the same one searched again after a redraw leaves it where it is.
   */
  function run(q, { again = false } = {}) {
    const typed = !again && q.trim() !== query.trim();
    query = q;
    if (!q.trim()) {
      panel.filter(null);
      list([]);
      return 0;
    }
    const found = findInPanel(match, q, scene(), tools);
    panel.filter(found.rows, { top: typed, to: found.first });
    list(found.hidden);
    return found.rows.size - found.via.size + found.hidden.length;
  }
  const box = createSearchBox({ input, status, onQuery: (q) => run(q), noun: 'setting' });
  // (Esc in an empty box: back to the page, so its keys work again.)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !input.value && !e.defaultPrevented) input.blur();
  });
  return {
    /** Search again (the scene's shape changed what the panel shows). */
    refresh() {
      if (query.trim()) run(query, { again: true });
    },
    focus() {
      input.focus();
      input.select();
    },
    clear: () => box.clear(),
    get query() {
      return query;
    },
  };
}
