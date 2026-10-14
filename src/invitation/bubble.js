// NEWT's speech bubble on the invitation toy: a line from him (speech.js says which, and when)
// in the page's own style (bubble.css: cream, a dark outline, Pixelify Sans, rounded, a tail
// toward him), above his head and following him. createBubble({root}) gives say(text), then
// update(head, avoid) once a frame with his head on screen (its middle and radius, client px:
// character.js screenShape) and what it must keep clear of (the toolbar, the open Look sheet:
// client rects). Near the top of the stage it goes beside his head instead, or under it, never
// over his face. It types the line out at a readable pace, holds it, then fades it, on the timeline
// speech.js counts (lineDuration; with prefers-reduced-motion the whole line at once, held as
// long, no fade). It stays on the stage, clear of what it's told to avoid (clearRegion, then
// placeBubble: pure, tested), never takes a press (pointer-events none) and sits under the
// toolbar and the sheet (it goes in before `before`, the page's HUD). A screen reader hears the
// whole line at once from a polite live region; the typed letters themselves are aria-hidden.

import { TALK, lineDuration } from './speech.js';

/** @typedef {{left: number, top: number, right: number, bottom: number}} Rect  client px */

/** The bubble's numbers, CSS px (bubble.css draws the same tail and corners). */
export const BUBBLE = {
  /** Kept this far from the stage's edges and from what it avoids. */
  margin: 8,
  /** Between the tail's tip and the point over his head. */
  gap: 6,
  /** How far the tail reaches out of the bubble. */
  tail: 10,
  /** The rounded corner the tail keeps clear of. */
  corner: 14,
};

/**
 * The space the bubble may use: the stage less a margin and less each rect it must avoid (the
 * toolbar, the open Look sheet), each cut off on whichever side leaves the most room (above a
 * bar along the bottom, beside a sheet down one side). Rects with no size, or off the space, are
 * ignored.
 * @param {Rect} area  the stage
 * @param {Rect[]} [avoid]
 * @param {number} [margin]
 * @returns {Rect}
 */
export function clearRegion(area, avoid = [], margin = BUBBLE.margin) {
  let r = {
    left: area.left + margin,
    top: area.top + margin,
    right: area.right - margin,
    bottom: area.bottom - margin,
  };
  for (const a of avoid) {
    if (!a || !(a.right > a.left) || !(a.bottom > a.top)) continue;
    if (a.right <= r.left || a.left >= r.right || a.bottom <= r.top || a.top >= r.bottom) continue;
    const options = [
      { ...r, bottom: Math.min(r.bottom, a.top - margin) },
      { ...r, top: Math.max(r.top, a.bottom + margin) },
      { ...r, right: Math.min(r.right, a.left - margin) },
      { ...r, left: Math.max(r.left, a.right + margin) },
    ];
    const room = (o) => Math.max(0, o.right - o.left) * Math.max(0, o.bottom - o.top);
    r = options.reduce((best, o) => (room(o) > room(best) ? o : best));
  }
  return r;
}

/**
 * Where the bubble goes, for his head (its middle and radius on screen): centred over it, its
 * tail's length above it, kept inside the region (pushed in from an edge, or up off a bar he's
 * behind). With no room above (his head near the top), beside his head on the side with more
 * room, level with it, its tail pointing across at him; with no room there, under his head, its
 * tail pointing up (over his body, never his face); with no room anywhere, over him, kept on
 * screen, with no tail.
 * @param {{point: {x: number, y: number, r?: number}, size: {w: number, h: number}, region: Rect,
 *   gap?: number, tail?: number, corner?: number}} o
 * @returns {{x: number, y: number, tail: 'down'|'up'|'left'|'right'|'none', tailX: number, tailY: number}}
 *   x, y: its top left, client px; tail: the way its tail points; tailX, tailY: the tail's middle
 *   from its left and top edges
 */
export function placeBubble({ point, size, region, gap = BUBBLE.gap, tail = BUBBLE.tail, corner = BUBBLE.corner }) {
  const { w, h } = size;
  const r = point.r ?? 0;
  const reach = r + gap + tail;
  const inset = corner + tail;
  const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));
  /** Along an edge of length `len`, clear of the corners. */
  const along = (v, len) => (len < 2 * inset ? len / 2 : clamp(v, inset, len - inset));
  const x = clamp(point.x - w / 2, region.left, region.right - w);
  const above = point.y - reach - h;
  if (above >= region.top) {
    const y = Math.max(region.top, Math.min(above, region.bottom - h));
    return { x, y, tail: 'down', tailX: along(point.x - x, w), tailY: h };
  }
  const y = clamp(point.y - h / 2, region.top, region.bottom - h);
  const tailY = along(point.y - y, h);
  // (Off an edge himself, it waits at that edge, its tail toward him.)
  const rightOf = Math.max(point.x + reach, region.left);
  const leftOf = Math.min(point.x - reach, region.right);
  const sides = [
    { room: region.right - rightOf, x: rightOf, tail: /** @type {'left'} */ ('left'), tailX: 0 },
    { room: leftOf - region.left, x: leftOf - w, tail: /** @type {'right'} */ ('right'), tailX: w },
  ]
    .filter((o) => o.room >= w)
    .sort((a, b) => b.room - a.room);
  if (sides.length) return { x: sides[0].x, y, tail: sides[0].tail, tailX: sides[0].tailX, tailY };
  const below = Math.max(region.top, point.y + reach);
  if (below + h <= region.bottom) return { x, y: below, tail: 'up', tailX: along(point.x - x, w), tailY: 0 };
  return { x, y: clamp(above, region.top, region.bottom - h), tail: 'none', tailX: along(point.x - x, w), tailY: 0 };
}

/**
 * The bubble at `elapsed` seconds into its line: how many characters show, and its phase (typing,
 * holding, fading, done), on lineDuration's timeline. Reduced motion: all of it from the start,
 * held for the typing's time too.
 * @param {string} text
 * @param {number} elapsed
 * @param {boolean} reduced
 * @returns {{shown: number, phase: 'type'|'hold'|'fade'|'done'}}
 */
export function bubbleFrame(text, elapsed, reduced) {
  const n = Array.from(text).length;
  const total = lineDuration(text);
  if (elapsed >= total) return { shown: n, phase: 'done' };
  if (elapsed >= total - TALK.fade) return { shown: n, phase: 'fade' };
  const typing = reduced ? 0 : n / TALK.typeCps;
  if (elapsed >= typing) return { shown: n, phase: 'hold' };
  return { shown: Math.min(n, Math.floor(Math.max(0, elapsed) * TALK.typeCps + 1e-9)), phase: 'type' };
}

/** Whether the visitor asked for less motion (false where it can't be read). */
function prefersReduced() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * The bubble, in `root` (the stage), before `before` (the HUD, so the toolbar and sheet stay on
 * top). `now` is the clock, seconds; `reducedMotion` asks at each line.
 * @param {{root: HTMLElement, before?: Element|null, now?: () => number, reducedMotion?: () => boolean}} o
 */
export function createBubble({
  root,
  before = null,
  now = () => performance.now() / 1000,
  reducedMotion = prefersReduced,
}) {
  const doc = root.ownerDocument;
  const make = (/** @type {string} */ tag, /** @type {string} */ cls) => {
    const e = doc.createElement(tag);
    e.className = cls;
    return e;
  };
  const box = make('div', 'inv-bubble');
  box.setAttribute('aria-hidden', 'true');
  box.hidden = true;
  const line = make('p', 'inv-bubble-text');
  const typed = make('span', 'inv-bubble-typed');
  const rest = make('span', 'inv-bubble-rest');
  line.append(typed, rest);
  box.append(line, make('span', 'inv-bubble-tail'));
  const live = make('p', 'inv-bubble-live');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  root.insertBefore(box, before);
  root.append(live);

  const s = {
    /** @type {string|null} */
    text: null,
    /** @type {string[]} */
    chars: [],
    start: 0,
    reduced: false,
    shown: -1,
    size: { w: 0, h: 0 },
  };

  /** The bubble's size with its whole line in (the untyped rest keeps its place, unseen). */
  function measure() {
    s.size = { w: box.offsetWidth, h: box.offsetHeight };
  }

  /** @param {number} n */
  function show(n) {
    if (n === s.shown) return;
    s.shown = n;
    typed.textContent = s.chars.slice(0, n).join('');
    rest.textContent = s.chars.slice(n).join('');
  }

  function hide() {
    s.text = null;
    box.hidden = true;
    box.classList.remove('is-fading', 'is-away');
    live.textContent = '';
  }

  return {
    /**
     * Show a line (replacing any up): typed from the start. Its time on screen, seconds.
     * @param {string} text
     */
    say(text) {
      s.text = text;
      s.chars = Array.from(text);
      s.start = now();
      s.reduced = reducedMotion();
      s.shown = -1;
      box.hidden = false;
      box.classList.remove('is-fading');
      // (Out of sight until the next update places it.)
      box.classList.add('is-away');
      box.classList.toggle('is-still', s.reduced);
      show(bubbleFrame(text, 0, s.reduced).shown);
      measure();
      live.textContent = `NEWT: ${text}`;
      // (The page's font may still be on its way: measured again once it's in.)
      doc.fonts?.ready?.then(() => s.text === text && measure()).catch(() => {});
      return lineDuration(text);
    },
    /**
     * A frame: the typing, the fade, and where it goes.
     * @param {{x: number, y: number, r?: number}|null} point  his head on screen: its middle and
     *   radius, client px (character.js screenShape's head; null: out of sight)
     * @param {Rect[]} [avoid]  client rects to keep clear of
     */
    update(point, avoid = []) {
      if (s.text === null) return;
      const f = bubbleFrame(s.text, now() - s.start, s.reduced);
      if (f.phase === 'done') return hide();
      show(f.shown);
      box.classList.toggle('is-fading', f.phase === 'fade');
      if (!point) {
        box.classList.add('is-away');
        return;
      }
      const area = root.getBoundingClientRect();
      const p = placeBubble({ point, size: s.size, region: clearRegion(area, avoid) });
      box.style.transform = `translate(${Math.round(p.x - area.left)}px, ${Math.round(p.y - area.top)}px)`;
      box.style.setProperty('--tail-x', `${Math.round(p.tailX)}px`);
      box.style.setProperty('--tail-y', `${Math.round(p.tailY)}px`);
      box.dataset.tail = p.tail;
      box.classList.remove('is-away');
    },
    hide,
    dispose() {
      box.remove();
      live.remove();
    },
    /** The line up now, or null (for ?test). */
    get text() {
      return s.text;
    },
    /** The bubble's box (for ?test: where it is). */
    get element() {
      return box;
    },
  };
}
