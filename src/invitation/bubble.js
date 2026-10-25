// NEWT's speech bubble on the invitation toy: a line from him (speech.js says which, and when)
// in the page's own style (bubble.css: cream, a dark outline, Pixelify Sans, rounded, a tail
// toward him), above his head and following him. createBubble({root}) gives say(text), then
// update(head, avoid) once a frame with his head on screen (its middle and radius, client px:
// character.js screenShape; speakerPoint makes it null while the open Look sheet covers it) and
// what it must keep clear of (the toolbar, the open Look sheet: client rects). Near the top of
// the stage it goes beside his head instead (narrowed to fit there, its line on more rows, on a
// phone), or under his feet, never over his face or body. It types the line out at a readable pace, holds it, then fades it, on the timeline
// speech.js counts (lineDuration; with prefers-reduced-motion the whole line at once, held as
// long, no fade). It stays on the stage, clear of what it's told to avoid (clearRegion, then
// placeBubble: pure, tested), never takes a press (pointer-events none) and sits under the
// toolbar and the sheet (it goes in before `before`, the page's HUD). A line's text effects
// (markup.js: {red,wave|…}) show as it types, built once as a span a letter; its timing counts
// the letters that show. A screen reader hears the whole line at once, plain, from a polite live
// region; the typed letters themselves are aria-hidden.

import { DEFAULT_TEXT_COLORS, letterCount, paletteOf, parseMarkup, renderMarkup, revealLetters } from './markup.js';
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
  /** The narrowest it's wrapped to, to fit beside his head (bubble.css's padding and a word or two). */
  minW: 110,
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
 * What the bubble points at: his head on screen, or null (it waits out of sight) while one of
 * `covers` (the open Look sheet) is over his head's middle. Rects with no size are ignored.
 * @param {{x: number, y: number, r?: number}|null} head
 * @param {Array<Rect|null>} [covers]
 */
export function speakerPoint(head, covers = []) {
  if (!head) return null;
  for (const c of covers) {
    if (!c || !(c.right > c.left) || !(c.bottom > c.top)) continue;
    if (head.x >= c.left && head.x <= c.right && head.y >= c.top && head.y <= c.bottom) return null;
  }
  return head;
}

/**
 * Where the bubble goes, for his head (its middle and radius on screen): centred over it, its
 * tail's length above it, kept inside the region (pushed in from an edge, or up off a bar he's
 * behind). With no room above (his head near the top), beside his head on the side with more
 * room, level with it, its tail pointing across at him; with no room there for the line as it
 * is, beside him all the same, narrowed to that side's room (no narrower than BUBBLE.minW),
 * the line wrapped onto more rows (`fit`: the bubble's size wrapped to a width); with no room
 * there either, under him (under his feet, `under`, when it's given; else under his head), its
 * tail pointing up; with no room anywhere, over him, kept on screen, with no tail.
 * @param {{point: {x: number, y: number, r?: number}, size: {w: number, h: number}, region: Rect,
 *   under?: number|null, fit?: ((maxW: number) => {w: number, h: number, maxW?: number})|null,
 *   gap?: number, tail?: number, corner?: number}} o
 * @returns {{x: number, y: number, tail: 'down'|'up'|'left'|'right'|'none', tailX: number, tailY: number,
 *   w: number, h: number, maxW: number|null}}
 *   x, y: its top left, client px; tail: the way its tail points; tailX, tailY: the tail's middle
 *   from its left and top edges; w, h: its size there; maxW: the width it's wrapped to (null: as
 *   it is)
 */
export function placeBubble({
  point,
  size,
  region,
  under = null,
  fit = null,
  gap = BUBBLE.gap,
  tail = BUBBLE.tail,
  corner = BUBBLE.corner,
}) {
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
    return { x, y, tail: 'down', tailX: along(point.x - x, w), tailY: h, w, h, maxW: null };
  }
  // (Off an edge himself, it waits at that edge, its tail toward him.)
  const rightOf = Math.max(point.x + reach, region.left);
  const leftOf = Math.min(point.x - reach, region.right);
  const sides = [
    { room: region.right - rightOf, right: true },
    { room: leftOf - region.left, right: false },
  ].sort((a, b) => b.room - a.room);
  /**
   * Beside him, on that side, level with his head.
   * @param {{room: number, right: boolean}} side
   * @param {{w: number, h: number}} at
   * @param {number|null} maxW
   */
  const beside = (side, at, maxW) => {
    const y = clamp(point.y - at.h / 2, region.top, region.bottom - at.h);
    return {
      x: side.right ? rightOf : leftOf - at.w,
      y,
      tail: /** @type {'left'|'right'} */ (side.right ? 'left' : 'right'),
      tailX: side.right ? 0 : at.w,
      tailY: along(point.y - y, at.h),
      w: at.w,
      h: at.h,
      maxW,
    };
  };
  const roomy = sides.find((o) => o.room >= w);
  if (roomy) return beside(roomy, size, null);
  // (Too wide for either side: narrowed to the roomier one, onto more rows.)
  const most = sides[0];
  if (fit && most.room >= BUBBLE.minW) {
    const narrow = fit(most.room);
    if (narrow.w <= most.room + 0.5 && narrow.h <= region.bottom - region.top)
      return beside(most, narrow, narrow.maxW ?? Math.floor(most.room));
  }
  const below = Math.max(region.top, (under ?? point.y + r) + gap + tail);
  if (below + h <= region.bottom)
    return { x, y: below, tail: 'up', tailX: along(point.x - x, w), tailY: 0, w, h, maxW: null };
  return {
    x,
    y: clamp(above, region.top, region.bottom - h),
    tail: 'none',
    tailX: along(point.x - x, w),
    tailY: 0,
    w,
    h,
    maxW: null,
  };
}

/**
 * The bubble at `elapsed` seconds into its line: how many letters show (markup.js: its tags aside), and its phase (typing,
 * holding, fading, done), on lineDuration's timeline. Reduced motion: all of it from the start,
 * held for the typing's time too.
 * @param {string} text
 * @param {number} elapsed
 * @param {boolean} reduced
 * @returns {{shown: number, phase: 'type'|'hold'|'fade'|'done'}}
 */
export function bubbleFrame(text, elapsed, reduced) {
  const n = letterCount(text);
  const total = lineDuration(text);
  if (elapsed >= total) return { shown: n, phase: 'done' };
  if (elapsed >= total - TALK.fade) return { shown: n, phase: 'fade' };
  const typing = reduced ? 0 : n / TALK.typeCps;
  if (elapsed >= typing) return { shown: n, phase: 'hold' };
  return { shown: Math.min(n, Math.floor(Math.max(0, elapsed) * TALK.typeCps + 1e-9)), phase: 'type' };
}

/** The widths a narrowed bubble is wrapped to go in steps of this many CSS px. */
const FIT_STEP = 8;

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
 * top). `now` is the clock, seconds; `reducedMotion` asks at each line; `palette`: the text
 * effects' colours (markup.js paletteOf; content.js textPalette).
 * @param {{root: HTMLElement, before?: Element|null, now?: () => number, reducedMotion?: () => boolean, palette?: Map<string, string>}} o
 */
export function createBubble({
  root,
  before = null,
  now = () => performance.now() / 1000,
  reducedMotion = prefersReduced,
  palette = paletteOf(DEFAULT_TEXT_COLORS),
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
  // (The line's letters, all of them: the typed ones show, the rest keep their place unseen.)
  const typed = make('span', 'inv-bubble-typed');
  line.append(typed);
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
    /** @type {HTMLElement[]} the line's letter spans (markup.js renderMarkup) */
    spans: [],
    start: 0,
    reduced: false,
    shown: -1,
    size: { w: 0, h: 0 },
    /** @type {Map<number, {w: number, h: number, maxW: number}>} its size wrapped to each width tried */
    fits: new Map(),
    /** @type {number|null} the width it's wrapped to now (null: its own) */
    maxW: null,
  };

  /** The bubble's size with its whole line in (the untyped rest keeps its place, unseen). */
  function measure() {
    box.style.maxWidth = '';
    s.size = { w: box.offsetWidth, h: box.offsetHeight };
    s.fits.clear();
    s.maxW = null;
  }

  /**
   * Its size with the line wrapped to at most `maxW` CSS px (in steps of FIT_STEP, each measured
   * once a line: a narrowed bubble beside his head follows him without a layout every frame).
   * @param {number} maxW
   */
  function fit(maxW) {
    const key = Math.max(FIT_STEP, Math.floor(maxW / FIT_STEP) * FIT_STEP);
    let at = s.fits.get(key);
    if (!at) {
      box.style.maxWidth = `${key}px`;
      at = { w: box.offsetWidth, h: box.offsetHeight, maxW: key };
      box.style.maxWidth = s.maxW === null ? '' : `${s.maxW}px`;
      s.fits.set(key, at);
    }
    return at;
  }

  /** @param {number} n */
  function show(n) {
    if (n === s.shown) return;
    revealLetters(s.spans, n, s.shown);
    s.shown = n;
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
      const parsed = parseMarkup(text, palette);
      s.spans = renderMarkup(typed, parsed);
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
      live.textContent = `NEWT: ${parsed.plain}`;
      // (The page's font may still be on its way: measured again once it's in.)
      doc.fonts?.ready?.then(() => s.text === text && measure()).catch(() => {});
      return lineDuration(text);
    },
    /**
     * A frame: the typing, the fade, and where it goes.
     * @param {{x: number, y: number, r?: number}|null} point  his head on screen: its middle and
     *   radius, client px (character.js screenShape's head; null: out of sight)
     * @param {Rect[]} [avoid]  client rects to keep clear of
     * @param {number|null} [under]  the bottom of his feet on screen, client px (a bubble that
     *   must go under him goes under them)
     */
    update(point, avoid = [], under = null) {
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
      const p = placeBubble({ point, size: s.size, region: clearRegion(area, avoid), under, fit });
      if (p.maxW !== s.maxW) {
        s.maxW = p.maxW;
        box.style.maxWidth = p.maxW === null ? '' : `${p.maxW}px`;
      }
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
