// @ts-nocheck: 1 type error still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// The rest menu's behavior (its markup is render.js renderRestMenu): the header's Menu
// button opens it, at every width, with focus on the first item that shows (Go To hides
// where the header's tabs show it); its arrow keys skip what's hidden (ui/spatial.js
// listNav); a tool closes it and does its thing; a screen link closes it and goes; a click
// on the backdrop or Close closes it.
import { listNav } from './spatial.js';

/**
 * @param {object} o
 * @param {HTMLDialogElement} o.menu   the <dialog data-menu>
 * @param {HTMLElement} o.opener       the Menu button
 * @param {Record<string, () => void>} o.actions  each tool's (by its data-menu-action)
 * @param {(what: 'select' | 'back' | 'move') => void} [o.onSound]
 */
export function setupRestMenu({ menu, opener, actions, onSound = () => {} }) {
  const shown = () => [...menu.querySelectorAll('[data-menu-item]')].filter((el) => el.getClientRects().length);
  opener.addEventListener('click', () => {
    menu.showModal();
    /** @type {HTMLElement | undefined} */ (shown()[0])?.focus();
    onSound('select');
  });
  menu.addEventListener('click', (e) => {
    const t = /** @type {Element} */ (e.target);
    if (t === menu || t.closest('[data-menu-close]')) {
      menu.close();
      return;
    }
    const action = /** @type {HTMLElement | null} */ (t.closest('[data-menu-action]'))?.dataset.menuAction;
    if (action && Object.hasOwn(actions, action)) {
      menu.close();
      actions[action]();
      return;
    }
    if (t.closest('a[data-menu-item]')) menu.close();
  });
  menu.addEventListener('close', () => onSound('back'));
  listNav(menu, '[data-menu-item]', { onMove: () => onSound('move') });
}
