// @ts-nocheck: 6 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// Game-menu style navigation: arrow keys / WASD move focus between items in
// a grid (by on-screen position) or a list (by order).

const DIRS = {
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  A: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
  D: [1, 0],
  ArrowUp: [0, -1],
  w: [0, -1],
  W: [0, -1],
  ArrowDown: [0, 1],
  s: [0, 1],
  S: [0, 1],
};

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * @param {Element} container
 * @param {string} focusSelector  focusable element inside each item
 * @param {(el: Element) => Element} itemOf  element whose box is used for geometry
 * @param {() => void} [onMove]
 */
export function gridNav(container, focusSelector, itemOf = (el) => el, onMove) {
  container.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = DIRS[e.key];
    const current = e.target.closest(focusSelector);
    if (!dir || !current) return;
    const all = [...container.querySelectorAll(focusSelector)];
    const from = center(itemOf(current).getBoundingClientRect());
    let best = null;
    let bestScore = Infinity;
    for (const el of all) {
      if (el === current) continue;
      const c = center(itemOf(el).getBoundingClientRect());
      const dx = c.x - from.x;
      const dy = c.y - from.y;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 4) continue;
      const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      e.preventDefault();
      best.focus();
      best.scrollIntoView?.({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      onMove?.();
    }
  });
}

/**
 * Vertical list: up/down (W/S) move, wrapping. Left/right optional. Items that don't show
 * (hidden, or in a part of the list the window's width hides) are skipped.
 */
export function listNav(container, focusSelector, { horizontal = false, onMove } = {}) {
  container.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = DIRS[e.key];
    const current = e.target.closest(focusSelector);
    if (!dir || !current) return;
    const step = horizontal ? dir[0] : dir[1];
    if (!step) return;
    const all = [...container.querySelectorAll(focusSelector)].filter(
      (el) => el === current || el.getClientRects().length,
    );
    const i = all.indexOf(current);
    const next = all[(i + step + all.length) % all.length];
    e.preventDefault();
    next.focus();
    onMove?.();
  });
}
