// The campfire game's banners: the site's own "Embers Kindled" banner (.kindled in
// styles.css, the main site's render.js) with a third line for what was awarded and to whom.
// Each holds for the game's Banner Time; banners given quickly wait their turn, so none is
// cut short. Each one is copied to the output window as it comes and goes.
//
//   bannerLines(entry, team)     → { title, subtitle, points } (pure)
//   createBanner({ el, mirror }) → { show(lines, ms, onShow), clear(), get queued }
import { gainText } from './game.js';

/**
 * The banner's three lines for an entry: its title and subtitle, and "+50 · Red Team".
 * @param {Pick<import('./game.js').Entry, 'title'|'subtitle'|'gain'|'mult'>} entry
 * @param {{ name: string } | null | undefined} team
 */
export function bannerLines(entry, team) {
  return {
    title: entry.title,
    subtitle: entry.subtitle,
    points: team ? `${gainText(entry)} · ${team.name}` : gainText(entry),
  };
}

/** The most banners waiting at once (more are dropped: the scores already have them). */
export const MAX_QUEUE = 6;
/** The breath between one banner going and the next coming (ms). */
export const GAP_MS = 250;

/**
 * @param {{ el: HTMLElement, mirror?: (el: HTMLElement) => void, timers?: { set: (fn: () => void, ms: number) => any, clear: (t: any) => void } }} o
 */
export function createBanner({
  el,
  mirror = () => {},
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) },
}) {
  const title = /** @type {HTMLElement} */ (el.querySelector('[data-banner-title]'));
  const sub = /** @type {HTMLElement} */ (el.querySelector('[data-banner-sub]'));
  const points = /** @type {HTMLElement} */ (el.querySelector('[data-banner-points]'));
  /** @type {{ lines: ReturnType<typeof bannerLines>, ms: number, onShow?: () => void, color?: string }[]} */
  const queue = [];
  let showing = false;
  /** @type {any} */
  let timer = 0;

  function next() {
    const item = queue.shift();
    if (!item) {
      showing = false;
      return;
    }
    showing = true;
    title.textContent = item.lines.title;
    sub.textContent = item.lines.subtitle;
    sub.hidden = !item.lines.subtitle;
    points.textContent = item.lines.points;
    if (item.color) points.style.setProperty('--team', item.color);
    else points.style.removeProperty('--team');
    el.style.setProperty('--kindle-time', `${item.ms}ms`);
    el.hidden = true;
    void el.offsetWidth; // (restarts the kindle animation)
    el.hidden = false;
    mirror(el);
    item.onShow?.();
    timer = timers.set(() => {
      el.hidden = true;
      mirror(el);
      timer = timers.set(next, GAP_MS);
    }, item.ms);
  }

  return {
    /**
     * Shows a banner now, or after the ones waiting; `onShow` runs as it comes up (the fire's
     * reaction lands with it).
     * @param {ReturnType<typeof bannerLines>} lines
     * @param {number} ms
     * @param {{ onShow?: () => void, color?: string }} [o]
     */
    show(lines, ms, { onShow, color } = {}) {
      if (queue.length >= MAX_QUEUE) return false;
      queue.push({ lines, ms, onShow, color });
      if (!showing) next();
      return true;
    },
    /** Takes the banner down and forgets the ones waiting. */
    clear() {
      queue.length = 0;
      timers.clear(timer);
      showing = false;
      el.hidden = true;
      mirror(el);
    },
    get queued() {
      return queue.length;
    },
    get showing() {
      return showing;
    },
  };
}
