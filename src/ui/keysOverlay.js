// The keyboard shortcuts, all in one place: `?` opens a list of every key a page answers,
// in groups, with a box that narrows it as you type (the settings search's matcher: "full"
// finds Full Screen, "shift k" the keys with Shift and K). Esc clears the box, then closes
// it. Each page hands over its own groups; no key changes by being listed.
import { esc } from '../html.js';
import { buildMatcher, createSearchBox } from './settingsSearch.js';
import { typing } from './shell.js';

/**
 * @typedef {{ keys: string[], label: string }} KeyRow  one shortcut: the keys pressed together ('Shift', 'K')
 * @typedef {{ title: string, keys: KeyRow[] }} KeyGroup
 */

/** Whether a key press asks for the shortcuts (`?`, not while typing in a field). */
export const isHelpKey = (e) => e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target);

/** A shortcut's keys as <kbd> chips: "Shift+K". @param {string[]} keys */
export const kbds = (keys) => keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('<span class="keys-plus">+</span>');

let uid = 0;
/**
 * The overlay's markup (pure: the tests read it): a title, a close button, the filter box,
 * and the groups, each row `data-keys-row="<group>.<row>"`.
 * @param {{ title?: string, groups: KeyGroup[], id?: string }} o
 */
export function keysOverlayMarkup({ title = 'Keyboard Shortcuts', groups, id = `keys-${++uid}` }) {
  return `
  <div class="keys-overlay-inner">
    <div class="keys-overlay-head">
      <h2 class="keys-overlay-title" id="${id}-title">${esc(title)}</h2>
      <button type="button" class="keys-overlay-close" data-keys-close aria-label="Close">✕</button>
    </div>
    <search class="settings-search keys-overlay-search">
      <label class="visually-hidden" for="${id}-filter">Filter Shortcuts</label>
      <input type="search" id="${id}-filter" placeholder="Filter shortcuts" autocomplete="off" spellcheck="false" data-keys-filter>
      <p class="settings-search-status" role="status" data-search-status></p>
    </search>
    <div class="keys-overlay-groups">${groups
      .map(
        (g, gi) => `
      <section class="keys-group" data-keys-group="${gi}" aria-labelledby="${id}-g${gi}">
        <h3 class="keys-group-title" id="${id}-g${gi}">${esc(g.title)}</h3>
        <dl>${g.keys.map((row, ri) => `<div class="keys-row" data-keys-row="${gi}.${ri}"><dt>${kbds(row.keys)}</dt><dd>${esc(row.label)}</dd></div>`).join('')}</dl>
      </section>`,
      )
      .join('')}
    </div>
  </div>`;
}

/**
 * The rows as search entries (label: what it does; keywords: its keys; section: its group),
 * ids "<group>.<row>" as in the markup.
 * @param {KeyGroup[]} groups
 */
export const keyEntries = (groups) =>
  groups.flatMap((g, gi) =>
    g.keys.map((row, ri) => ({
      id: `${gi}.${ri}`,
      label: row.label,
      keywords: [row.keys.join(' ')],
      section: g.title,
    })),
  );

/**
 * The overlay as a modal <dialog class="keys-overlay"> at the end of the body: open() shows it
 * with the filter focused, close() and toggle(); a click on the backdrop or ✕ closes it.
 * @param {{ title?: string, groups: KeyGroup[], doc?: Document }} o
 * @returns {{ open: () => void, close: () => void, toggle: () => void, el: HTMLDialogElement }}
 */
export function createKeysOverlay({ title = 'Keyboard Shortcuts', groups, doc = document }) {
  const id = `keys-${++uid}`;
  const el = doc.createElement('dialog');
  el.className = 'keys-overlay';
  el.setAttribute('aria-labelledby', `${id}-title`);
  el.innerHTML = keysOverlayMarkup({ title, groups, id });
  doc.body.append(el);

  const input = /** @type {HTMLInputElement} */ (el.querySelector('[data-keys-filter]'));
  const match = buildMatcher(keyEntries(groups));
  const rows = [...el.querySelectorAll('[data-keys-row]')];
  const sections = [...el.querySelectorAll('[data-keys-group]')];
  const search = createSearchBox({
    input,
    status: el.querySelector('[data-search-status]'),
    noun: 'shortcut',
    onQuery(query) {
      const hits = query.trim() ? new Set(match(query).map((h) => h.entry.id)) : null;
      for (const row of rows)
        /** @type {HTMLElement} */ (row).hidden = !!hits && !hits.has(/** @type {HTMLElement} */ (row).dataset.keysRow);
      for (const s of sections)
        /** @type {HTMLElement} */ (s).hidden = ![...s.querySelectorAll('[data-keys-row]')].some(
          (r) => !(/** @type {HTMLElement} */ (r).hidden),
        );
      return hits ? hits.size : rows.length;
    },
  });

  const open = () => {
    if (el.open) return;
    search.clear();
    el.showModal();
    input.focus();
  };
  const close = () => {
    if (el.open) el.close();
  };
  el.addEventListener('click', (e) => {
    const t = /** @type {Element} */ (e.target);
    if (t === el || t.closest('[data-keys-close]')) close();
  });
  return { open, close, toggle: () => (el.open ? close() : open()), el };
}
