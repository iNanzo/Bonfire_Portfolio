// Going to a field: the page it's on (an old page address still finds its page) and what
// it takes to show it, every card on the way down opened. The page (main.js reveal) does the
// going: it opens the cards, shows the page, scrolls the field into view, focuses it and
// flashes it.
import { PAGES, PAGE_ALIASES } from './schema.js';
import { parsePath, within } from './paths.js';

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
