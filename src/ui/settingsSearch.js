// Settings search: the matcher behind the search boxes in Bonfire Live's settings, the
// Painter's panel and the admin, and the box itself.
//
//   buildMatcher   every word typed has to start a word somewhere in a setting (its label,
//                  search keywords, section or tab, its choices, its hint or its key), so
//                  "pix si" finds Pixel Size. A word with synonyms counts as any of them
//                  ("strobe" finds Negative Flash and Flicker); one word of 4+ letters can be
//                  a letter off from a label word of 5+, its first letter right ("exposre"
//                  still finds Exposure).
//                  Results come best first: a match in the label counts most (100), then
//                  keywords 80, section or tab 60, choices 40, hint 20, key 10; ties keep the
//                  order the settings were given in.
//   highlight      a label with what matched in <mark>: every piece escaped first (html.js
//                  esc), so a scene, setup or card name someone imported can't inject markup.
//   createSearchBox  wires an input: the query after typing pauses briefly, Esc clears it (a
//                  second Esc is the page's: it closes the dialog), and a status line read
//                  out once typing stops ("12 settings found"; at once when nothing matches).
// Text is compared folded: accents stripped (NFKD), curly quotes straightened, lower case.
import { esc } from '../html.js';

/**
 * @typedef {{ id: string, label: string, keywords?: string[], section?: string, tab?: string,
 *   options?: string[], hint?: string, key?: string }} SearchEntry
 * @typedef {{ entry: SearchEntry, score: number, ranges: [number, number][],
 *   fields: Record<string, [number, number][]> }} SearchHit
 */

const QUOTES = { '’': "'", '‘': "'", '“': '"', '”': '"' };
/** Text folded for comparing: accents stripped, quotes straightened, lower case. */
export const normalize = (text) => fold(text).text;

/**
 * `text` folded, with where each folded character came from (so a match in the folded text
 * marks the right part of the original): folded character i is the original's from `at[i]`
 * to `to[i]` (one original character can fold to two, "ﬁ" to "fi", or a letter and its accent
 * to one).
 * @param {unknown} text
 * @returns {{ text: string, at: number[], to: number[] }}
 */
function fold(text) {
  const src = String(text ?? '');
  let out = '';
  const at = [];
  const to = [];
  for (let i = 0; i < src.length;) {
    const ch = String.fromCodePoint(src.codePointAt(i));
    const piece = (QUOTES[ch] ?? ch).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    for (let k = 0; k < piece.length; k++) { at.push(i); to.push(i + ch.length); }
    out += piece;
    i += ch.length;
  }
  return { text: out, at, to };
}

const WORD = /[\p{L}\p{N}]/u;
/** The words typed: letters and digits (an apostrophe inside a word stays: "song's"). */
const tokens = (query) => [...new Set(normalize(query).match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [])];
/** A key's words: "knightRim" is "knight rim", "looks.glitch" "looks glitch". */
const keyWords = (key) => String(key ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ');

/** Where `term` starts a word in folded `text`: [start, end] pairs. */
function starts(text, term) {
  const found = [];
  for (let i = text.indexOf(term); i >= 0; i = text.indexOf(term, i + 1)) {
    if (i === 0 || !WORD.test(text[i - 1])) found.push([i, i + term.length]);
  }
  return found;
}

/** Whether two words are at most one edit apart (a letter added, dropped, changed or swapped). */
export function oneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // (changed)
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // (swapped)
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1); // (added or dropped)
}
/**
 * A word typed a letter off from the start of a label word of 5+ letters: [start, end] pairs.
 * (Its first letter has to be right: "lick" isn't Flicker.)
 */
function nearStarts(text, token) {
  if (token.length < 4) return [];
  const found = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = m[0];
    if (word.length < 5 || word[0] !== token[0]) continue;
    for (const n of [token.length - 1, token.length, token.length + 1]) {
      if (n < 1 || n > word.length) continue;
      if (oneEdit(token, word.slice(0, n))) { found.push([m.index, m.index + n]); break; }
    }
  }
  return found;
}

/** How much a match in each part of a setting counts. */
export const WEIGHTS = { label: 100, keywords: 80, section: 60, tab: 60, options: 40, hint: 20, key: 10 };

/**
 * A search over `entries`: `match(query)` gives the entries every word of the query is found
 * in, best first (see the top of this file), with where the label matched (`ranges`, in the
 * label's own characters) and every part that matched (`fields`: label, hint… → ranges; one
 * of several keywords or choices counts as one text, joined with " · "). A blank query
 * matches nothing (the page shows everything then).
 * @param {SearchEntry[]} entries
 * @param {{ synonyms?: Record<string, string[]> }} [o]
 * @returns {(query: string) => SearchHit[]}
 */
export function buildMatcher(entries, { synonyms = {} } = {}) {
  const syn = new Map(Object.entries(synonyms).map(([k, list]) => [normalize(k), list.map(normalize)]));
  const index = entries.map((entry) => ({
    entry,
    parts: /** @type {[string, { text: string, at: number[], to: number[] }][]} */ ([
      ['label', fold(entry.label)],
      ['keywords', fold((entry.keywords ?? []).join(' · '))],
      ['section', fold(entry.section ?? '')],
      ['tab', fold(entry.tab ?? '')],
      ['options', fold((entry.options ?? []).join(' · '))],
      ['hint', fold(entry.hint ?? '')],
      ['key', fold(keyWords(entry.key))],
    ]),
  }));
  return (query) => {
    const words = tokens(query);
    if (!words.length) return [];
    /** @type {(SearchHit & { order: number })[]} */
    const hits = [];
    index.forEach(({ entry, parts }, order) => {
      let score = 0;
      /** @type {Record<string, [number, number][]>} */
      const marks = {};
      for (const word of words) {
        const terms = [word, ...(syn.get(word) ?? [])];
        let best = 0;
        for (const [name, f] of parts) {
          let found = terms.flatMap((t) => starts(f.text, t));
          let worth = WEIGHTS[name];
          if (!found.length && name === 'label') { found = nearStarts(f.text, word); worth /= 2; }
          if (!found.length) continue;
          // (A whole word typed counts a little more than the start of one.)
          const whole = found.some(([, e]) => e === f.text.length || !WORD.test(f.text[e]));
          best = Math.max(best, worth + (whole ? 1 : 0));
          (marks[name] ??= []).push(...found.map(([s, e]) => /** @type {[number, number]} */ ([f.at[s], f.to[e - 1]])));
        }
        if (!best) return; // (a word found nowhere: not a hit)
        score += best;
      }
      hits.push({ entry, score, ranges: merge(marks.label ?? []), fields: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, merge(v)])), order });
    });
    hits.sort((a, b) => b.score - a.score || a.order - b.order);
    return hits.map(({ order, ...hit }) => hit);
  };
}

/** Ranges sorted, overlapping ones joined. @param {[number, number][]} ranges */
function merge(ranges) {
  /** @type {[number, number][]} */
  const out = [];
  for (const [s, e] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * `text` as markup with its `ranges` in <mark>: every piece escaped, so it's safe whatever
 * the text is (an imported name included).
 * @param {string} text @param {[number, number][]} [ranges]
 */
export function highlight(text, ranges = []) {
  const src = String(text ?? '');
  let out = '';
  let at = 0;
  for (const [s, e] of merge(ranges)) {
    const from = Math.max(at, Math.min(s, src.length));
    const to = Math.max(from, Math.min(e, src.length));
    if (to <= from) continue;
    out += `${esc(src.slice(at, from))}<mark>${esc(src.slice(from, to))}</mark>`;
    at = to;
  }
  return out + esc(src.slice(at));
}

/**
 * A search box's markup: a labelled search input in <search>, a note on how it works, and the
 * status line its results are read out from (there from the start, as a live region has to
 * be). createSearchBox wires it.
 * @param {{ id: string, label?: string, placeholder?: string }} o
 */
export const searchBoxMarkup = ({ id, label = 'Search Settings', placeholder = 'Search settings' }) => `
  <search class="settings-search">
    <label class="visually-hidden" for="${esc(id)}">${esc(label)}</label>
    <input type="search" id="${esc(id)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-describedby="${esc(id)}-note">
    <span class="visually-hidden" id="${esc(id)}-note">Results update as you type.</span>
    <p class="settings-search-status" role="status" data-search-status></p>
  </search>`;

/**
 * Wire a search input: `onQuery(query)` runs `debounce` ms after typing pauses (and at once
 * on clear), returning the number of results (or the results); `status` says how many,
 * `announce` ms after typing stops, or at once when there are none. Esc in the box clears it
 * (and the dialog it's in stays open); with nothing to clear, Esc is left to the page.
 * `noun`: what's being searched, for the status line ("setting" → "3 settings found").
 * @param {{ input: HTMLInputElement, status?: HTMLElement | null, onQuery: (query: string) => number | unknown[],
 *   debounce?: number, announce?: number, noun?: string }} o
 * @returns {{ clear: () => boolean, run: (query?: string) => void, destroy: () => void }}
 */
export function createSearchBox({ input, status = null, onQuery, debounce = 80, announce = 500, noun = 'setting' }) {
  const doc = input.ownerDocument;
  const win = doc.defaultView ?? window;
  let typingTimer = 0;
  let sayTimer = 0;
  let cleared = false; // Esc just cleared the box: the dialog's cancel that follows is stopped

  const say = (text) => { if (status && status.textContent !== text) status.textContent = text; };
  function run(query = input.value) {
    win.clearTimeout(typingTimer);
    win.clearTimeout(sayTimer);
    const got = onQuery(query);
    const n = typeof got === 'number' ? got : Array.isArray(got) ? got.length : 0;
    if (!query.trim()) { say(''); return; }
    if (!n) { say(`No ${noun}s match “${query.trim()}”`); return; }
    sayTimer = win.setTimeout(() => say(`${n} ${noun}${n === 1 ? '' : 's'} found`), announce);
  }
  function clear() {
    if (!input.value) return false;
    input.value = '';
    run('');
    return true;
  }
  const onInput = () => {
    win.clearTimeout(typingTimer);
    win.clearTimeout(sayTimer);
    typingTimer = win.setTimeout(() => run(), debounce);
  };
  const onKey = (e) => {
    if (e.key !== 'Escape' || !clear()) return;
    e.preventDefault();
    e.stopPropagation();
    cleared = true;
  };
  const onKeyUp = (e) => { if (e.key === 'Escape') cleared = false; };
  const onCancel = (e) => {
    if (!cleared) return;
    cleared = false;
    e.preventDefault();
  };
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKey);
  input.addEventListener('keyup', onKeyUp);
  doc.addEventListener('cancel', onCancel, true);
  return {
    clear,
    run,
    destroy() {
      win.clearTimeout(typingTimer);
      win.clearTimeout(sayTimer);
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('keyup', onKeyUp);
      doc.removeEventListener('cancel', onCancel, true);
    },
  };
}
