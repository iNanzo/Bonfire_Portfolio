// The shared tooltip: one element shows the hint of whatever `[data-tip]` the pointer rests
// on, the keyboard focuses, or a finger taps (the fields' "?" buttons, src/ui/fields.js),
// in every front end. It replaces the old pure-CSS tips, which lived inside the scroll boxes
// they were drawn in: those were cut off at the top and right edges and could never flip.
//
//   where      the browser's top layer (a manual popover), so no `overflow` clips it. Before
//              it shows it moves into the trigger's open <dialog> (or the body): a modal
//              dialog makes everything outside it inert, a tip included. place() puts it
//              above its trigger (or on the side its data-tip-side, or its CSS's --tip-side,
//              names: beside an item in a list, say, so it doesn't cover the next), else
//              below, else beside, kept 8 px
//              inside the window, and places it again as the page scrolls or the window
//              resizes; it goes when its trigger is gone or scrolled out of sight. Without
//              the Popover API it's position: fixed, on top.
//   when       a pointer resting on a trigger, after `delay` (`warm` when a tip was showing a
//              moment ago, so running along a row of "?"s reads each at once); it stays while
//              the pointer is on the trigger or the tip itself (it can be hovered, to read a
//              long one or select its text), and goes `grace` ms after it leaves both. The
//              keyboard: at once when a trigger takes focus with a visible focus ring, or a
//              field whose hint a "?" shows (the field's aria-describedby names the hint the
//              "?" is described by too). Touch: a tap on a "?" (or on a trigger marked
//              data-tip-tap, one a tap does nothing else with: the site's skills) opens or
//              closes its tip; a tap anywhere else closes it. Esc closes it, and only it: an open dialog stays open.
//              Nothing closes a tip on a timer while it's being read.
//   what       the trigger's data-tip, under its data-tip-title in bold if it has one: set as
//              text, never markup. The tip itself is aria-hidden: every trigger already reads
//              its hint out (aria-describedby), so a screen reader hears it once.
// Positions go through style.setProperty (the admin's Content Security Policy blocks style
// attributes).

/** The widest a tip gets (px), narrower on a window too small for it. */
export const TIP_MAX = 320;
const MARGIN = 8;
/** A tip shown this recently (ms) makes the next one quick to come (the `warm` delay). */
const WARM_MS = 300;
/**
 * The sides a tip tries, in order, for each side it prefers.
 * @type {Record<string, ('top' | 'bottom' | 'left' | 'right')[]>}
 */
const SIDES = {
  top: ['top', 'bottom', 'left', 'right'], bottom: ['bottom', 'top', 'left', 'right'],
  left: ['left', 'right', 'top', 'bottom'], right: ['right', 'left', 'top', 'bottom'],
};

/**
 * Where a tip of `tip` size goes beside an anchor box, in a `view`-sized window: on the
 * `prefer` side if it fits there (`gap` px off the anchor), else the opposite side, else
 * left or right (or top or bottom), shifted along that side to stay `margin` px inside every
 * edge. If no side fits, the roomier of above and below, clamped inside the window (it may
 * cover the anchor then). Its width counts as at most TIP_MAX and the window's width less the
 * margins. Pure: the tests run it.
 * @param {{ left: number, top: number, right: number, bottom: number }} a the anchor (px, the window's)
 * @param {{ width: number, height: number }} tip
 * @param {{ width: number, height: number }} view
 * @param {{ prefer?: 'top' | 'bottom' | 'left' | 'right', gap?: number, margin?: number }} [o]
 * @returns {{ x: number, y: number, side: 'top' | 'bottom' | 'left' | 'right' }} the tip's top-left corner
 */
export function place(a, tip, view, { prefer = 'top', gap = 8, margin = MARGIN } = {}) {
  const w = Math.max(0, Math.min(tip.width, TIP_MAX, view.width - 2 * margin));
  const h = Math.max(0, tip.height);
  const room = {
    top: a.top - gap - margin,
    bottom: view.height - margin - a.bottom - gap,
    left: a.left - gap - margin,
    right: view.width - margin - a.right - gap,
  };
  const tall = h <= view.height - 2 * margin;
  const fits = { top: room.top >= h, bottom: room.bottom >= h, left: tall && room.left >= w, right: tall && room.right >= w };
  const side = (SIDES[prefer] ?? SIDES.top).find((s) => fits[s]) ?? (room.top >= room.bottom ? 'top' : 'bottom');
  const clampX = (x) => Math.max(margin, Math.min(x, view.width - margin - w));
  const clampY = (y) => Math.max(margin, Math.min(y, view.height - margin - h));
  let x;
  let y;
  if (side === 'top' || side === 'bottom') {
    x = clampX((a.left + a.right) / 2 - w / 2);
    y = clampY(side === 'top' ? a.top - gap - h : a.bottom + gap);
  } else {
    x = side === 'left' ? a.left - gap - w : a.right + gap;
    y = clampY((a.top + a.bottom) / 2 - h / 2);
  }
  return { x: Math.round(x), y: Math.round(y), side };
}

/**
 * The box a tip is placed by, in window px: its trigger's (the first element), reaching down
 * or up over the field it describes too (the rest), so a tip above or below clears both but
 * still hangs from the "?" rather than the middle of a wide row.
 */
function boxOf(els) {
  const all = els.map((el) => el.getBoundingClientRect());
  const shown = all.filter((r) => r.width || r.height); // (one not drawn would stretch it to the corner)
  const rects = shown.length ? shown : all;
  const own = rects[0];
  return { left: own.left, right: own.right, top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
}

const installed = new WeakMap();

/**
 * Show every `[data-tip]` on the page through one shared tooltip (see the top of this file).
 * Once per page: a second call hands back the first's.
 * @param {{ doc?: Document, delay?: number, warm?: number, grace?: number }} [o]
 * @returns {{ hide: () => void, destroy: () => void }}
 */
export function installTooltips({ doc = document, delay = 400, warm = 100, grace = 150 } = {}) {
  if (installed.has(doc)) return installed.get(doc);
  const win = doc.defaultView ?? window;
  const tip = doc.createElement('div');
  tip.className = 'ui-tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  const popover = typeof tip.showPopover === 'function';
  if (popover) tip.setAttribute('popover', 'manual');
  else tip.hidden = true;
  const title = doc.createElement('strong');
  title.className = 'ui-tip-title';
  const body = doc.createElement('span');
  body.className = 'ui-tip-text';
  tip.append(title, body);

  /** @type {{ trigger: Element, how: 'hover' | 'focus' | 'click', anchor: Element[] } | null} */
  let current = null;
  /** @type {Element | null} */
  let pending = null;  // the trigger a pointer rests on, its tip on the way
  let showTimer = 0;
  let hideTimer = 0;
  let lastShown = -Infinity;
  let frame = 0;       // a re-place waiting for the next frame (scroll, resize)
  let watch = 0;       // the frame loop that notices a trigger gone (only while a tip shows)
  let escaped = false; // Esc just closed a tip: the dialog's cancel that follows is stopped

  const now = () => win.performance.now();
  const viewSize = () => ({ width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight });

  function open() {
    if (popover) { try { tip.showPopover(); } catch { /* already showing */ } } else tip.hidden = false;
  }
  function close() {
    if (popover) { try { tip.hidePopover(); } catch { /* not showing */ } } else tip.hidden = true;
  }

  /**
   * Show `trigger`'s tip, next to `anchor` (its "?", or the "?" and the field focused).
   * @param {Element} trigger @param {'hover' | 'focus' | 'click'} how @param {Element[]} [anchor]
   */
  function show(trigger, how, anchor = [trigger]) {
    win.clearTimeout(showTimer);
    win.clearTimeout(hideTimer);
    pending = null;
    const text = trigger.getAttribute('data-tip');
    if (!text || !trigger.isConnected) return;
    const host = trigger.closest('dialog[open]') ?? doc.body;
    if (tip.parentNode !== host) {
      close();
      host.append(tip);
    }
    title.textContent = trigger.getAttribute('data-tip-title') ?? '';
    title.hidden = !title.textContent;
    body.textContent = text;
    current = { trigger, how, anchor };
    open();
    position();
    win.cancelAnimationFrame(watch);
    watch = win.requestAnimationFrame(check);
  }

  function hide() {
    win.clearTimeout(showTimer);
    win.clearTimeout(hideTimer);
    pending = null;
    if (!current) return;
    current = null;
    lastShown = now();
    win.cancelAnimationFrame(watch);
    close();
  }
  const hideSoon = () => {
    win.clearTimeout(hideTimer);
    hideTimer = win.setTimeout(hide, grace);
  };

  function position() {
    if (!current) return;
    const view = viewSize();
    tip.style.setProperty('max-width', `${Math.max(0, Math.min(TIP_MAX, view.width - 2 * MARGIN))}px`);
    tip.style.setProperty('max-height', `${Math.max(0, view.height - 2 * MARGIN)}px`);
    // (Measured at the corner, where nothing squeezes it, then moved.)
    tip.style.setProperty('left', '0px');
    tip.style.setProperty('top', '0px');
    const size = tip.getBoundingClientRect();
    const at = place(boxOf(current.anchor), { width: size.width, height: size.height }, view, { prefer: sideOf(current.trigger) });
    tip.style.setProperty('left', `${at.x}px`);
    tip.style.setProperty('top', `${at.y}px`);
    tip.dataset.side = at.side;
  }

  /**
   * The side a trigger's tip would rather be on: its data-tip-side, else its style's
   * `--tip-side` (a page's CSS can set one for a kind of trigger, and per window width), else
   * above.
   * @param {Element} el
   * @returns {any}
   */
  function sideOf(el) {
    return el.getAttribute('data-tip-side') || win.getComputedStyle(el).getPropertyValue('--tip-side').trim() || 'top';
  }

  /** Whether `el` shows at all: on screen, and not scrolled out of a box that clips it. */
  function inView(el) {
    const r = el.getBoundingClientRect();
    const view = viewSize();
    if ((!r.width && !r.height) || r.bottom <= 0 || r.right <= 0 || r.top >= view.height || r.left >= view.width) return false;
    for (let p = el.parentElement; p && p !== doc.body && p !== doc.documentElement; p = p.parentElement) {
      const s = win.getComputedStyle(p);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const b = p.getBoundingClientRect();
      if (r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right) return false;
    }
    return true;
  }

  /** Every frame a tip shows: is its trigger still on the page (a panel redrawn under it)? */
  function check() {
    if (!current) return;
    if (!current.trigger.isConnected || !current.anchor.every((el) => el.isConnected)) { hide(); return; }
    watch = win.requestAnimationFrame(check);
  }
  /** Scrolled or resized: placed again on the next frame, or gone if its trigger went out of sight. */
  function replace() {
    if (!current || frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      if (!current) return;
      if (!current.anchor.some((el) => el.isConnected && inView(el))) hide();
      else position();
    });
  }

  /**
   * The tip a focused element shows: its own (a trigger), or the "?" for the hint it reads out
   * (its aria-describedby, or its group's: a switch's fieldset), beside it and the "?".
   * @param {Element} el
   */
  function triggerFor(el) {
    if (el.matches('[data-tip]')) return { trigger: el, anchor: [el] };
    const holder = el.closest('[aria-describedby]');
    for (const id of holder?.getAttribute('aria-describedby')?.split(/\s+/) ?? []) {
      if (!id) continue;
      const mark = doc.querySelector(`[data-tip][aria-describedby~="${win.CSS?.escape ? win.CSS.escape(id) : id}"]`);
      if (mark && mark !== el) return { trigger: mark, anchor: [mark, el] };
    }
    return null;
  }

  const element = (t) => (t && typeof t === 'object' && 'closest' in t ? /** @type {Element} */ (t) : null);

  function onOver(e) {
    if (e.pointerType === 'touch') return;
    const t = element(e.target);
    if (!t) return;
    if (tip.contains(t)) { win.clearTimeout(hideTimer); return; }
    const trigger = t.closest('[data-tip]');
    if (!trigger) return;
    if (current?.trigger === trigger) { win.clearTimeout(hideTimer); return; }
    if (pending === trigger) return;
    win.clearTimeout(showTimer);
    pending = trigger;
    showTimer = win.setTimeout(() => show(trigger, 'hover'), current || now() - lastShown < WARM_MS ? warm : delay);
  }
  function onOut(e) {
    if (e.pointerType === 'touch') return;
    const from = element(e.target);
    const to = element(e.relatedTarget);
    if (!from) return;
    if (pending && pending.contains(from) && !pending.contains(to)) {
      win.clearTimeout(showTimer);
      pending = null;
    }
    // (A tip opened by the keyboard or a click stays until focus moves, a click elsewhere or Esc.)
    if (!current || current.how !== 'hover') return;
    const onIt = (el) => !!el && (tip.contains(el) || current.trigger.contains(el));
    if (onIt(from) && !onIt(to)) hideSoon();
  }
  function onFocusIn(e) {
    const el = element(e.target);
    if (!el || tip.contains(el)) return;
    let ring = true;
    try { ring = el.matches(':focus-visible'); } catch { /* an old browser: as if it had one */ }
    if (!ring) return;
    const found = triggerFor(el);
    if (found) show(found.trigger, 'focus', found.anchor);
  }
  function onFocusOut(e) {
    if (current?.how !== 'focus') return;
    const to = element(e.relatedTarget);
    if (to && tip.contains(to)) return;
    hide(); // (focus moving to another field shows that one's next)
  }
  function onClick(e) {
    // (A "?", or a trigger a tap does nothing else with that asks for this: data-tip-tap.)
    const mark = element(e.target)?.closest('.viz-tip[data-tip], [data-tip][data-tip-tap]');
    if (!mark) return;
    if (current?.trigger === mark && current.how === 'click') { hide(); return; }
    show(mark, 'click', [mark]);
  }
  function onDown(e) {
    const t = element(e.target);
    // (A press on a button that has a tip acts: its tip, on the way or showing, goes, so it
    // doesn't come up over what the press opened. A "?"'s own click opens or closes it.)
    const pressed = t?.closest('[data-tip]');
    if (pressed && !pressed.matches('.viz-tip')) {
      if (pending === pressed) { win.clearTimeout(showTimer); pending = null; }
      if (current?.trigger === pressed) { hide(); return; }
    }
    if (!current || (t && (tip.contains(t) || current.trigger.contains(t)))) return;
    hide();
  }
  function onKey(e) {
    if (e.key !== 'Escape' || !current) return;
    hide();
    e.preventDefault();
    e.stopPropagation();
    escaped = true;
  }
  function onKeyUp(e) { if (e.key === 'Escape') escaped = false; }
  function onCancel(e) {
    if (!escaped) return;
    escaped = false;
    e.preventDefault();
  }
  function onClose(e) { if (current && e.target === tip.parentNode) hide(); }

  const capture = { capture: true };
  const passive = { capture: true, passive: true };
  /** @type {[string, (e: any) => void, AddEventListenerOptions][]} */
  const listeners = [
    ['pointerover', onOver, passive], ['pointerout', onOut, passive], ['focusin', onFocusIn, capture], ['focusout', onFocusOut, capture],
    ['click', onClick, capture], ['pointerdown', onDown, passive], ['keydown', onKey, capture], ['keyup', onKeyUp, capture],
    ['cancel', onCancel, capture], ['close', onClose, capture], ['scroll', replace, passive],
  ];
  for (const [type, fn, opts] of listeners) doc.addEventListener(type, fn, opts);
  win.addEventListener('resize', replace);

  const api = {
    hide,
    destroy() {
      hide();
      for (const [type, fn, opts] of listeners) doc.removeEventListener(type, fn, opts);
      win.removeEventListener('resize', replace);
      win.cancelAnimationFrame(frame);
      tip.remove();
      installed.delete(doc);
    },
  };
  installed.set(doc, api);
  return api;
}
