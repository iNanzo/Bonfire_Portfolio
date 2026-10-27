// The intro dialogue's screen in the invitation toy (after the envelope opens, or Replay Intro),
// laid out like Uma Musume's chats and drawn in the toy's own style (dialogue.css): a wide box along the bottom with the
// speaker's name on a tab at its top left and the line typed out in it (built once, a span a
// letter with its text effects, markup.js; the rest of the line waits unseen in its place, so
// the box keeps its size), a small bouncing ▼ at its bottom right once the line is up, Auto,
// Next (to the next question, or the end) and Log at the top right of the screen, Skip Intro at its top
// left (on screen all through the intro: it ends it at once, no question), the replies as buttons
// stacked in the middle of it when a box has them (laid out out of sight from the box's start, so
// main.js frames him over them: clearSpace), a gentle dim along the bottom behind the box,
// the Log (a scrollable list of the lines shown and the replies picked, a dialog of its own) and
// a "Skip the Intro?" question for Escape. As the intro ends the whole screen fades out
// (fadeAway), out of reach from its first step, so free play comes back at once. Rendering
// only: dialogue.js runs the script, and main.js hands each frame's view here (render) and turns
// what's pressed (`onAction`) into the runner's calls.
//
// The whole layer is a modal dialog over the stage: a tap or click anywhere off its buttons goes
// on (finishes the line, then the next box), so nothing reaches the canvas (no drags, no orbit).
// The replies take a press only once the presses that went on have stopped for REPLY_SETTLE, so
// a quick second tap or press after the one that finished the line never picks one.
// Keys, wherever focus is: Space or Enter go on (a focused button presses itself instead),
// Escape closes the Log, or asks whether to skip the intro, and a second Escape ends it; a click
// or tap on Auto, Next or Log (or the Log's Close) leaves focus where Space and Enter go on, and
// from the keyboard focus stays on the button (the Log's back on it as it closes); under the Log
// or the question the buttons over the stage are out of reach (inert); Tab goes
// round the layer's buttons, and then what goes with them outside it (`more`: the link button,
// ui.js, at the top left all through the intro; a focused link follows itself on Enter, and
// neither key goes on from it). A screen reader hears each line whole once, as plain text, from a
// live region (the typed text is hidden from it), and the Log lists it plain too; the replies are buttons, and focus goes to the first reply
// when they show, into the Log and the question when they open and back when they close.
// A long line grows the box by a row at most (dialogue.css: four rows, three on a short screen;
// the box takes its size from the line's start, so it never grows as it types), and a longer one
// scrolls inside it: the view follows the typing a row at a time (followRow); once it's all
// typed the wheel, the arrow and Page keys, and a finger dragged anywhere on the screen
// (dragScroll: the screen's own, from the box, its name tab, a button or the stage over it, even
// one that went down as it typed; it flings on, and a drag never goes on) scroll it, with pixel
// cues over and under it where there's more.
// It's plain, as before round 18 (dialogue.css): a light hover where there's a mouse, and a
// button or the box pressed shows a step darker and down (a press held with a finger too,
// holdPressed: CSS :active isn't reliable on touch), the replies pop in, the box rises in with
// a plain fade and the screen fades out plainly at the end. Its one dither: a press
// that goes on, or a reply picked, brings the next box on with the click fade (clickFade,
// TALK_FADE): the old line (a copy of it, where it was) dithers out with its name tab and the
// replies picked, then the new name tab and line dither in, and only then does it type (the
// runner waits TALK_LEAD: main.js), so the two lines never show together; Auto and Next change
// lines at once.

/** @typedef {import('./dialogue.js').DialogueView} DialogueView */
/** @typedef {import('./dialogue.js').LogEntry} LogEntry */
import { ditherMask } from './icons.js';
import { DEFAULT_TEXT_COLORS, paletteOf, parseMarkup, plainText, renderMarkup, revealLetters } from './markup.js';
/**
 * @typedef {{type: 'advance'} | {type: 'choose', index: number} | {type: 'auto', on: boolean} |
 *   {type: 'skip'} | {type: 'pause', on: boolean} | {type: 'end'}} TalkAction  what the visitor
 *   did: pause, the Log or the question opened (on) or closed
 */

/**
 * The least room over the replies, CSS px, for the shots to frame him there (main.js): less, as
 * on a phone held sideways, and they frame him over the chat box, the replies over him.
 */
export const REPLY_ROOM = 120;
/**
 * The replies take a press only once the presses that went on have stopped this long, ms: they
 * show the moment a press finishes the line, under the finger or with focus, so the next press of
 * a tap-tap or a held-down rhythm (each press to go on, ignored there, starts it again) never
 * picks one the visitor didn't choose.
 */
export const REPLY_SETTLE = 450;

/** How long the chat screen takes to fade out as the intro ends, ms (fadeAway). */
export const LEAVE_MS = 150;

/**
 * The click fade: a press that goes on (a click or tap, Space or Enter that brings on the next
 * box) or a reply picked dithers the line that was up out with its name tab (and the replies,
 * picked), then the next box's name tab and line in, and only then does its line type (the
 * runner waits TALK_LEAD for it: main.js). ms: each way; steps: its coverages, heavy to light
 * (out goes down them to nothing, in comes up them to whole), each held, the toolbar's Bayer 4×4
 * at n/16 (talkTile); plainMs: each way with reduced motion, a plain fade.
 */
export const TALK_FADE = { ms: 160, steps: [12, 8, 4], plainMs: 80 };
/** How long a line a press brings on waits before it types, s: its fade out and in. */
export const TALK_LEAD = (2 * TALK_FADE.ms) / 1000;

/**
 * A dither tile of 8×8 CSS px, each of the Bayer 4×4's cells two px square (the toolbar's
 * tiles are drawn at that size), row by row: the cells on at a coverage of `n`/16.
 * @param {number} n  0 to 16
 * @returns {boolean[]}
 */
export function talkTile(n) {
  const cells = ditherMask(n);
  return Array.from({ length: 64 }, (_, i) => cells[((i >> 4) & 3) * 4 + ((i & 7) >> 1)]);
}

/**
 * The click fade's mask tiles (talkTile's cells opaque), drawn once as tiny PNGs: their URLs by
 * coverage, 0 and TALK_FADE.steps (none without a canvas: then the fade goes plainly).
 * @param {Document} doc
 */
function talkMasks(doc) {
  /** @type {Map<number, string>} */
  const masks = new Map();
  const c = doc.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext?.('2d');
  if (!g) return masks;
  g.fillStyle = '#000';
  for (const n of [0, ...TALK_FADE.steps]) {
    g.clearRect(0, 0, 8, 8);
    talkTile(n).forEach((on, i) => on && g.fillRect(i % 8, i >> 3, 1, 1));
    masks.set(n, `url("${c.toDataURL('image/png')}")`);
  }
  return masks;
}

/**
 * A line that shows more letters than this in one frame was finished at once (a tap, reduced
 * motion): the view stays where it is rather than following it down (the cue says there's more).
 */
export const FOLLOW_JUMP = 12;

/**
 * Where a long line's view scrolls to as it types, px: the newest letter's row (its middle at
 * `mid` px down the text) in view at the bottom, rows `rowH` px tall, the view `clientHeight`
 * tall; only ever down, so a row already in view leaves it as it is.
 * @param {{mid: number, rowH: number, clientHeight: number, scrollTop: number}} o
 */
export function followRow({ mid, rowH, clientHeight, scrollTop }) {
  const want = Math.max(0, Math.round((Math.floor(mid / rowH) + 1) * rowH - clientHeight));
  return want > scrollTop ? want : scrollTop;
}

/**
 * A finger's drag on the chat screen (dragScroll): it's a drag once it's gone `slop` px (less is
 * a tap); lifted, it flings on at the speed it had over its last `sample` ms, if that's over
 * `flick` px/ms, slowing as e^(−t/tau) (about a phone's own) till it's under `rest` px/ms; a
 * touch on a fling still faster than `stops` px/ms only stops it, as a phone's does; and the
 * click a drag ends in, if it comes within `click` ms, goes nowhere.
 */
export const DRAG = { slop: 8, sample: 100, flick: 0.15, tau: 325, rest: 0.02, stops: 0.15, click: 700 };

/**
 * How fast a finger was going as it lifted at `at` ms, px/ms down the line (scrollTop's way: a
 * finger going up the screen scrolls it down): over its moves in DRAG.sample ms before, up to the
 * lift (so a pause before it slows it), and the move before them if only one's there (a busy
 * page's frames can come further apart); 0 if it hadn't moved in that time (it had stopped).
 * @param {{t: number, y: number}[]} moves  its moves, oldest first: when (ms) and where (client px)
 * @param {number} at
 */
export function liftSpeed(moves, at) {
  const from = moves.findIndex((m) => at - m.t <= DRAG.sample);
  if (from < 0 || moves.length < 2) return 0;
  const first = moves[Math.min(from, moves.length - 2)];
  return (first.y - moves[moves.length - 1].y) / Math.max(at - first.t, 8);
}
/** How far a fling begun at `v` px/ms has gone after `t` ms, px: v·tau·(1 − e^(−t/tau)). */
export const flingBy = (v, t) => v * DRAG.tau * (1 - Math.exp(-t / DRAG.tau));
/** Its speed then, px/ms. */
export const flingSpeed = (v, t) => v * Math.exp(-t / DRAG.tau);

/**
 * A finger (or a pen) dragged up or down anywhere on `root` scrolls `scroller` while
 * `canScroll()` (a long line, all typed): wherever it starts (the box, its name tab, a button,
 * the stage over it), and from the moment it can (a drag begun while the line still types takes
 * it on from where it is then, with no jump); lifted moving, it flings on and slows to rest
 * (DRAG). A drag never presses what it started on (its click goes nowhere), nor does a touch that
 * stops a fling still going fast. The browser's own pan isn't used (the screen's touch-action is
 * none, dialogue.css): it took a finger only on the line itself, and only one begun once it was
 * typed. The mouse keeps the wheel and the keys. `skip(target)`: a press that isn't the screen's
 * (the Log, the question).
 * @param {HTMLElement} root
 * @param {HTMLElement} scroller
 * @param {{canScroll(): boolean, skip(target: Element|null): boolean}} o
 * @returns {{stop(): void, dispose(): void}}  stop: the fling stopped and a drag under way
 *   taking the view on from where it is (a new line); dispose: no more
 */
export function dragScroll(root, scroller, { canScroll, skip }) {
  const win = /** @type {Window} */ (root.ownerDocument.defaultView);
  const now = () => win.performance.now();
  /** The finger dragging: its pointerId (-1: none), where it went down, its last y, whether it's a drag yet, its moves. */
  const finger = { id: -1, x: 0, y: 0, lastY: 0, dragging: false, moves: /** @type {{t: number, y: number}[]} */ ([]) };
  /** Where the drag has the view, px (NaN: read it from the view at the next move). */
  let pos = NaN;
  /** This press's click goes nowhere (a drag, or a touch that stopped a fast fling); until when, once it's lifted. */
  let swallow = false;
  let swallowBy = 0;
  /** The fling: its speed as it began (px/ms), when (ms) and from where (px), its frame (0: none). */
  const fling = { v: 0, at: 0, from: 0, raf: 0 };

  const most = () => scroller.scrollHeight - scroller.clientHeight;
  const stopFling = () => {
    if (fling.raf) win.cancelAnimationFrame(fling.raf);
    fling.raf = 0;
  };
  const step = () => {
    fling.raf = 0;
    if (!canScroll()) return;
    const t = now() - fling.at;
    const want = fling.from + flingBy(fling.v, t);
    const to = Math.min(Math.max(0, want), most());
    scroller.scrollTop = to;
    // (Till it's at rest, or at the line's end.)
    if (to === want && Math.abs(flingSpeed(fling.v, t)) >= DRAG.rest) fling.raf = win.requestAnimationFrame(step);
  };

  /** @param {PointerEvent} e */
  const down = (e) => {
    // (Any press stops a fling, and is no drag's click.)
    const fast = fling.raf !== 0 && Math.abs(flingSpeed(fling.v, now() - fling.at)) > DRAG.stops;
    stopFling();
    swallowBy = 0;
    if (e.pointerType === 'mouse' || !e.isPrimary || skip(/** @type {Element|null} */ (e.target))) return;
    Object.assign(finger, { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, moves: [] });
    pos = NaN;
    swallow = fast;
  };
  /** @param {PointerEvent} e */
  const move = (e) => {
    if (e.pointerId !== finger.id) return;
    if (!finger.dragging) {
      const dy = e.clientY - finger.y;
      if (Math.hypot(e.clientX - finger.x, dy) <= DRAG.slop) return;
      // (A drag from here: the line moves by what the finger goes past the slop.)
      finger.dragging = true;
      swallow = true;
      finger.lastY = finger.y + Math.sign(dy) * Math.min(Math.abs(dy), DRAG.slop);
    }
    // (Each of its samples since the last move the page saw: the browser gives a frame one move,
    // and a phone's finger can be read several times a frame.)
    const samples = e.getCoalescedEvents?.() ?? [];
    for (const c of samples.length ? samples : [e]) finger.moves.push({ t: c.timeStamp, y: c.clientY });
    if (finger.moves.length > 32) finger.moves.splice(0, finger.moves.length - 32);
    const by = finger.lastY - e.clientY;
    finger.lastY = e.clientY;
    // (While the line can't scroll, the finger's moves go by; once it can, on from the view.)
    if (!canScroll()) {
      pos = NaN;
      return;
    }
    if (Number.isNaN(pos)) pos = scroller.scrollTop;
    pos = Math.min(Math.max(0, pos + by), most());
    scroller.scrollTop = pos;
  };
  /** @param {PointerEvent} e */
  const up = (e) => {
    if (e.pointerId !== finger.id) return;
    finger.id = -1;
    if (swallow) swallowBy = now() + DRAG.click;
    if (!finger.dragging || e.type === 'pointercancel' || !canScroll()) return;
    const v = liftSpeed(finger.moves, e.timeStamp);
    if (Math.abs(v) < DRAG.flick) return;
    Object.assign(fling, { v, at: now(), from: scroller.scrollTop });
    fling.raf = win.requestAnimationFrame(step);
  };
  /** @param {MouseEvent} e */
  const click = (e) => {
    // (A tap's or a click's, not Enter's or Space's on a focused button: detail 0.)
    if (e.detail === 0 || !swallowBy) return;
    const late = now() > swallowBy;
    swallowBy = 0;
    if (late) return;
    e.stopPropagation();
    e.preventDefault();
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('click', click, true);
  root.addEventListener('wheel', stopFling, { passive: true });
  win.addEventListener('pointermove', move);
  win.addEventListener('pointerup', up);
  win.addEventListener('pointercancel', up);
  return {
    stop() {
      stopFling();
      pos = NaN;
    },
    dispose() {
      stopFling();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('click', click, true);
      root.removeEventListener('wheel', stopFling);
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
      win.removeEventListener('pointercancel', up);
    },
  };
}

/**
 * A press held on a button in `root` (or what else `pressable` names) shows as pressed (`cls`
 * on it, dialogue.css) from its pointerdown until that pointer lifts, is cancelled or slides off
 * it: CSS :active isn't reliable on touch, where a finger held on Next or a reply showed
 * nothing. A finger's press is captured by its target till it lifts (no pointerleave meanwhile,
 * where the browser keeps it), so it's let go of, and its moves off the pressed one's box count
 * as sliding off too; so does a finger's or a pen's drag past DRAG.slop, on it or not (the
 * screen's drag scrolls the line then: dragScroll). Returns a function that stops it.
 * @param {HTMLElement} root
 * @param {string} [cls]
 * @param {string} [pressable]  a selector: buttons, or the screen's box too
 */
export function holdPressed(root, cls = 'is-pressed', pressable = 'button') {
  /** @type {HTMLElement|null} */
  let held = null;
  let id = -1;
  /** Where a finger or a pen went down (null: the mouse, which presses till it's off the button). */
  let from = /** @type {{x: number, y: number}|null} */ (null);
  const release = () => {
    if (!held) return;
    held.classList.remove(cls);
    held.removeEventListener('pointerleave', leave);
    held = null;
  };
  /** @param {PointerEvent} e */
  const leave = (e) => {
    if (e.pointerId === id) release();
  };
  /** @param {PointerEvent} e */
  const move = (e) => {
    if (e.pointerId !== id || !held) return;
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > DRAG.slop) return release();
    const r = held.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) release();
  };
  /** @param {PointerEvent} e */
  const down = (e) => {
    const at = /** @type {Element|null} */ (e.target);
    const button = /** @type {HTMLButtonElement|null} */ (at?.closest?.(pressable) ?? null);
    if (!button || button.disabled || e.button !== 0) return;
    release();
    held = button;
    id = e.pointerId;
    from = e.pointerType === 'touch' || e.pointerType === 'pen' ? { x: e.clientX, y: e.clientY } : null;
    button.classList.add(cls);
    if (button.hasPointerCapture?.(e.pointerId)) button.releasePointerCapture(e.pointerId);
    button.addEventListener('pointerleave', leave);
  };
  const win = root.ownerDocument.defaultView;
  root.addEventListener('pointerdown', down);
  win?.addEventListener('pointerup', leave);
  win?.addEventListener('pointercancel', leave);
  win?.addEventListener('pointermove', move);
  return () => {
    release();
    root.removeEventListener('pointerdown', down);
    win?.removeEventListener('pointerup', leave);
    win?.removeEventListener('pointercancel', leave);
    win?.removeEventListener('pointermove', move);
  };
}

/**
 * Run keyframes on `el` (none where the page can't animate: the tests' stand-in document).
 * @param {Element} el
 * @param {Keyframe[]} frames
 * @param {KeyframeAnimationOptions} o
 */
const play = (el, frames, o) => (typeof el.animate === 'function' ? el.animate(frames, o) : null);
/** Each value held until the next (a dither steps, it never blends). @param {Keyframe[]} frames */
const held = (frames) => frames.map((f) => ({ ...f, easing: 'steps(1, end)' }));

/**
 * A click fade's keyframes (TALK_FADE), its mask through the steps in even, held parts: out,
 * down from the heaviest to nothing (held there till it's let go); in, up from the lightest to
 * no mask, whole.
 * @param {boolean} out
 * @param {Map<number, string>} masks  the mask tiles' URLs by coverage (0 and TALK_FADE.steps)
 * @returns {Keyframe[]}
 */
export function fadeFrames(out, masks) {
  const cover = out ? [...TALK_FADE.steps, 0] : [...[...TALK_FADE.steps].reverse(), 16];
  return held(
    cover.map((n, i) => ({ maskImage: n >= 16 ? 'none' : (masks.get(n) ?? 'none'), offset: i / (cover.length - 1) })),
  );
}

/**
 * The chat screen going at the intro's end, in this order: from the start it takes no press, tap
 * or key (`is-leaving` and inert: free play has them at once), it fades out plainly over LEAVE_MS
 * (no dither, reduced motion or not), then it hides, its fade let go so it opens whole next time,
 * and `done` runs. Returns a stop: the screen back as it was, never hidden after (opened again
 * before it had gone).
 * @param {HTMLElement} el
 * @param {() => void} [done]
 * @returns {() => void}
 */
export function fadeAway(el, done) {
  el.classList.add('is-leaving');
  el.toggleAttribute('inert', true);
  const fade = play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: 'linear', fill: 'forwards' });
  let over = false;
  const reachable = () => {
    el.classList.remove('is-leaving');
    el.toggleAttribute('inert', false);
  };
  const gone = () => {
    if (over) return;
    over = true;
    el.hidden = true;
    reachable();
    fade?.cancel();
    done?.();
  };
  if (fade) fade.onfinish = gone;
  else gone();
  return () => {
    if (over) return;
    over = true;
    fade?.cancel();
    reachable();
  };
}

/** The words on the screen: labels in Title Case, the rest sentences. */
export const TALK_TEXT = {
  layer: 'Intro',
  auto: 'Auto',
  next: 'Next',
  log: 'Log',
  logTitle: 'Log',
  close: 'Close',
  you: 'You',
  replies: 'Replies',
  ask: 'Skip the Intro?',
  askHint: 'You can play it again from the toolbar.',
  yes: 'Skip Intro',
  skipIntro: 'Skip Intro',
  no: 'Keep Watching',
  goOn: 'Tap, or press Space, to go on.',
};

/**
 * Text as HTML: its ampersands and angle brackets as entities.
 * @param {string} s
 */
const html = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Text as an attribute's value (in double quotes). @param {string} s */
const attr = (s) => html(s).replace(/"/g, '&quot;');

/**
 * A name or a reply as written (`styled`, its tags kept) for the Log: as it is when it has no
 * tags; else a holder the screen fills with its styled letters (styleHolders), hidden from a
 * screen reader, beside its plain text for one (`plain`).
 * @param {string} plain
 * @param {string|undefined} styled
 */
function styledHtml(plain, styled) {
  if (!styled || styled === plain) return html(plain);
  return `<span class="inv-talk-styled" aria-hidden="true" data-styled="${attr(styled)}"></span><span class="inv-talk-sr">${html(plain)}</span>`;
}

/**
 * Fill each holder in `root` (styledHtml's) with its letters, styled (markup.js).
 * @param {HTMLElement} root
 * @param {Map<string, string>} palette
 */
function styleHolders(root, palette) {
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-styled]')))
    renderMarkup(el, parseMarkup(el.dataset.styled ?? '', palette));
}

/** The layer's markup (hidden until open). */
export function talkHtml() {
  const t = TALK_TEXT;
  return `<div class="inv-talk-dim" aria-hidden="true"></div>
  <div class="inv-talk-top" role="toolbar" aria-label="${t.layer}">
    <button type="button" class="inv-btn inv-talk-btn" data-talk="auto" aria-pressed="false">${t.auto}</button>
    <button type="button" class="inv-btn inv-talk-btn" data-talk="skip">${t.next}</button>
    <button type="button" class="inv-btn inv-talk-btn" data-talk="log" aria-haspopup="dialog" aria-expanded="false">${t.log}</button>
  </div>
  <button type="button" class="inv-btn inv-talk-btn inv-talk-skip-intro" data-intro-skip>${t.skipIntro}</button>
  <div class="inv-talk-choices" role="group" aria-label="${t.replies}" hidden></div>
  <section class="inv-talk-box">
    <p class="inv-talk-name" aria-hidden="true"></p>
    <div class="inv-talk-view">
      <p class="inv-talk-text" aria-hidden="true"><span class="inv-talk-typed"></span></p>
      <span class="inv-talk-more inv-talk-more-up" aria-hidden="true" hidden></span>
      <span class="inv-talk-more inv-talk-more-down" aria-hidden="true" hidden></span>
    </div>
    <p class="inv-talk-live" role="status" aria-live="polite" aria-atomic="true"></p>
    <p class="inv-talk-hint">${t.goOn}</p>
    <span class="inv-talk-next" aria-hidden="true" hidden>▼</span>
  </section>
  <section class="inv-talk-log" role="dialog" aria-modal="true" aria-labelledby="inv-talk-log-title" hidden>
    <header class="inv-talk-log-head"><h2 id="inv-talk-log-title">${t.logTitle}</h2><button type="button" class="inv-btn inv-btn-small" data-talk="log-close">${t.close}</button></header>
    <ol class="inv-talk-log-list"></ol>
  </section>
  <section class="inv-talk-ask" role="alertdialog" aria-modal="true" aria-labelledby="inv-talk-ask-title" aria-describedby="inv-talk-ask-hint" hidden>
    <h2 id="inv-talk-ask-title">${t.ask}</h2>
    <p class="inv-hint" id="inv-talk-ask-hint">${t.askHint}</p>
    <div class="inv-talk-ask-row"><button type="button" class="inv-btn" data-talk="no">${t.no}</button><button type="button" class="inv-btn" data-talk="yes">${t.yes}</button></div>
  </section>`;
}

/**
 * The Log's entries as list items: each line with its speaker, each reply as the visitor's; a
 * name or a reply with tags drawn styled (styledHtml: the screen fills it in), a line's text plain.
 * @param {LogEntry[]} entries
 */
export function logHtml(entries) {
  return entries
    .map((e) =>
      e.kind === 'reply'
        ? `<li class="inv-talk-log-reply"><span class="inv-talk-log-who">${TALK_TEXT.you}</span> ${styledHtml(e.text, e.styled)}</li>`
        : `<li><span class="inv-talk-log-who">${styledHtml(e.speaker, e.styled)}</span> ${html(e.text)}</li>`,
    )
    .join('');
}

/**
 * The layer, in the stage (over the toolbar and the Look sheet): open() shows it, render() shows
 * a view, close() hides it.
 * @param {HTMLElement} stage
 * @param {{onAction(a: TalkAction): void, log(): LogEntry[], replySettle?: number, palette?: Map<string, string>, more?: () => HTMLElement[]}} o  log: the entries now (the Log reads them as it opens); replySettle: ms the replies wait (REPLY_SETTLE; ?test can stretch it); palette: the text effects' colours (markup.js paletteOf; content.js textPalette); more: the stops outside the layer Tab goes round with its own, after them (the link button's, ui.js linkStops)
 */
export function createDialogueUi(
  stage,
  {
    onAction,
    log,
    replySettle = REPLY_SETTLE,
    palette: firstPalette = paletteOf(DEFAULT_TEXT_COLORS),
    more = () => [],
  },
) {
  /** The text effects' colours (setPalette: the admin's intro preview sends its draft's). */
  let palette = firstPalette;
  const doc = stage.ownerDocument;
  const layer = doc.createElement('div');
  layer.className = 'inv-talk';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', TALK_TEXT.layer);
  layer.tabIndex = -1;
  layer.hidden = true;
  layer.innerHTML = talkHtml();
  stage.append(layer);
  const view = doc.defaultView;
  const masks = talkMasks(doc);
  // (A finger held on a button or the box shows it pressed, as the mouse's :active does.)
  const unhold = holdPressed(layer, 'is-pressed', 'button, .inv-talk-box');
  const $ = (sel) => /** @type {HTMLElement} */ (layer.querySelector(sel));
  const name = $('.inv-talk-name');
  const typed = $('.inv-talk-typed');
  const text = $('.inv-talk-text');
  const lineView = $('.inv-talk-view');
  const boxEl = $('.inv-talk-box');
  const moreUp = $('.inv-talk-more-up');
  const moreDown = $('.inv-talk-more-down');
  const live = $('.inv-talk-live');
  const next = $('.inv-talk-next');
  const choices = $('.inv-talk-choices');
  const logBox = $('.inv-talk-log');
  const logList = $('.inv-talk-log-list');
  const ask = $('.inv-talk-ask');
  const topRow = $('.inv-talk-top');
  const skipIntro = $('[data-intro-skip]');
  const autoBtn = $('[data-talk="auto"]');
  const logBtn = $('[data-talk="log"]');

  const shown = {
    seq: -1,
    /** the line's letter spans (markup.js renderMarkup) */
    spans: /** @type {HTMLElement[]} */ ([]),
    n: -1,
    choices: '',
    /** the replies show (else laid out, out of sight and reach) */
    up: false,
    /** until when (performance.now(), ms) the replies take no press: REPLY_SETTLE */
    settle: 0,
    next: false,
    auto: false,
    /** the line is all typed (the visitor may scroll it) */
    typed: false,
    /** its rows' height, px (read once a line) */
    rowH: 0,
  };

  const modal = () => !logBox.hidden || !ask.hidden;
  /**
   * What's in reach: under the open Log or the question, Auto, Next, Log and the replies are
   * inert (out of reach of taps, clicks and Tab); the replies too until they show.
   */
  const reach = () => {
    // (The box takes no hover or press then either: dialogue.css.)
    layer.classList.toggle('is-modal', modal());
    topRow.toggleAttribute('inert', modal());
    skipIntro.toggleAttribute('inert', modal());
    choices.toggleAttribute('inert', modal() || !shown.up);
  };
  const now = () => doc.defaultView?.performance.now() ?? Date.now();
  /** A press that goes on (or lands on a reply too soon): the replies wait REPLY_SETTLE from it. */
  const settle = () => {
    if (shown.up) shown.settle = Math.max(shown.settle, now() + replySettle);
  };

  const reduced = () => Boolean(view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  /** The screen going at the intro's end (fadeAway's stop), or null. */
  let leaving = /** @type {(() => void)|null} */ (null);
  /** A press is on its way to onAction (press): the box it brings on comes with the click fade. */
  let pressing = false;
  /**
   * A press that goes on, or a reply picked: onAction hears of it, and if it brings on the next
   * box (main.js shows it at once, render), the line that was up dithers out and it dithers in.
   * @param {TalkAction} a
   */
  function press(a) {
    pressing = true;
    try {
      onAction(a);
    } finally {
      pressing = false;
    }
  }

  /**
   * The click fade under way (TALK_FADE), or none: out, the line that was up going (a copy of
   * it where it was, the ghost, over the new line laid out unseen), its name tab and the replies
   * picked (their copy); then in, the next box's name tab and line coming. Meanwhile the new
   * line's letters, its ▼ and its replies wait unseen (typeTo), so the two lines never show at
   * once; the box's data-fade says which. Each phase ends on the page's clock (performance.now(),
   * the toy's frames' own), checked as each frame is shown (tickFade); its look, the dither's
   * steps, is the animations'.
   */
  const fade = {
    phase: /** @type {'out'|'in'|null} */ (null),
    /** when the phase began, ms (now()), and how long it lasts */
    at: 0,
    ms: 0,
    anims: /** @type {Animation[]} */ ([]),
    ghosts: /** @type {HTMLElement[]} */ ([]),
    /** the name of the box coming in (its tab keeps the old one's while that goes) */
    speaker: '',
  };
  /**
   * A phase of the fade begins (on the box too: data-fade), or it's over (null).
   * @param {'out'|'in'|null} phase
   */
  function setPhase(phase) {
    fade.phase = phase;
    fade.at = now();
    fade.ms = reduced() ? TALK_FADE.plainMs : TALK_FADE.ms;
    if (phase) boxEl.dataset.fade = phase;
    else delete boxEl.dataset.fade;
  }
  /**
   * The name tab: the speaker's name with its tags, for the eye (a screen reader hears it with
   * the line).
   * @param {string} speaker
   */
  function putName(speaker) {
    renderMarkup(name, parseMarkup(speaker, palette));
    name.hidden = !speaker;
  }
  /**
   * `els` fading out or in together, for the phase's length: dithered (fadeFrames), or with
   * reduced motion a quick plain fade.
   * @param {HTMLElement[]} els
   * @param {boolean} out
   */
  function fadeAll(els, out) {
    const plain = reduced() || [0, ...TALK_FADE.steps].some((n) => !masks.has(n));
    const fill = out ? 'forwards' : 'none';
    for (const el of els) {
      const a = plain
        ? play(el, out ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], {
            duration: fade.ms,
            easing: 'linear',
            fill,
          })
        : play(el, fadeFrames(out, masks), { duration: fade.ms, fill });
      if (a) fade.anims.push(a);
    }
  }
  /** The fade's animations stopped and its copies gone. */
  function letGo() {
    for (const a of fade.anims) a.cancel();
    fade.anims = [];
    for (const g of fade.ghosts) g.remove();
    fade.ghosts = [];
  }
  /**
   * A copy of the line up, where it is and as far scrolled, over the next one's place; of the
   * replies too (`replies`), out of reach.
   * @param {boolean} replies
   */
  function ghostsOf(replies) {
    /** @type {HTMLElement[]} */
    const going = [];
    if (shown.n > 0) {
      const g = doc.createElement('p');
      g.className = 'inv-talk-ghost';
      g.setAttribute('aria-hidden', 'true');
      g.append(...[...typed.childNodes].map((n) => n.cloneNode(true)));
      lineView.append(g);
      g.scrollTop = text.scrollTop;
      going.push(g);
    }
    if (replies) {
      const g = /** @type {HTMLElement} */ (choices.cloneNode(true));
      g.classList.add('is-ghost');
      g.classList.remove('is-waiting');
      for (const a of ['role', 'aria-label', 'hidden']) g.removeAttribute(a);
      g.setAttribute('aria-hidden', 'true');
      g.toggleAttribute('inert', true);
      choices.after(g);
      going.push(g);
    }
    fade.ghosts.push(...going);
    return going;
  }
  /**
   * The click fade for the box a press brought on (`speaker`, its name): the line up dithers
   * out with its name tab (and the replies, if they showed), then the new one comes in. While
   * the old line still goes, a newer box comes in after it; while one comes in, nothing of it
   * typed yet, the newest comes in afresh.
   * @param {string} speaker
   */
  function clickFade(speaker) {
    fade.speaker = speaker;
    if (fade.phase === 'out') return;
    if (fade.phase === 'in') {
      fadeIn();
      return;
    }
    letGo();
    setPhase('out');
    const going = ghostsOf(shown.up);
    if (!name.hidden) going.push(name);
    fadeAll(going, true);
  }
  /** The next box's name tab and line come in (the old line's copies gone), then it types. */
  function fadeIn() {
    letGo();
    setPhase('in');
    putName(fade.speaker);
    fadeAll(name.hidden ? [text] : [name, text], false);
  }
  /** On to the fade's next phase once this one's time is up (each frame shown). */
  function tickFade() {
    if (!fade.phase || now() - fade.at < fade.ms) return;
    if (fade.phase === 'out') fadeIn();
    else stopFade();
  }
  /** No fade any more (over, opened again, closed): the name the box has, nothing going. */
  function stopFade() {
    const was = fade.phase;
    letGo();
    setPhase(null);
    if (was === 'out') putName(fade.speaker);
  }

  /**
   * The view's letters typed (none while a click fade runs: then it types from there), the
   * newest row in view, and the line scrollable once it's all up. Whether it is.
   * @param {DialogueView} v
   */
  function typeTo(v) {
    const want = fade.phase ? 0 : v.shown;
    const typedNow = v.typed && !fade.phase;
    if (want !== shown.n) {
      const was = shown.n;
      revealLetters(shown.spans, want, shown.n);
      shown.n = want;
      // (Typing: the newest row in view. Finished at once: the view stays, the cue says there's more.)
      if (was >= 0 && want - was <= FOLLOW_JUMP) follow();
    }
    if (typedNow !== shown.typed) {
      shown.typed = typedNow;
      scrollState();
    }
    return typedNow;
  }

  /**
   * A long line's view: scrollable once it's all typed and it outgrows the box's four rows (three
   * on a short screen; the wheel, a finger, the keys), and the cues over and under it where
   * there's more.
   */
  function scrollState() {
    const over = text.scrollHeight > text.clientHeight + 1;
    text.classList.toggle('can-scroll', shown.typed && over);
    cues();
  }
  /** The pixel cues: more above (scrolled down), more below (only once it's all typed). */
  function cues() {
    const top = text.scrollTop;
    moreUp.hidden = top <= 1;
    moreDown.hidden = !shown.typed || top + text.clientHeight >= text.scrollHeight - 1;
  }
  /** The newest letter's row kept in view as the line types (followRow). */
  function follow() {
    const span = shown.spans[shown.n - 1];
    if (!span) return;
    if (!shown.rowH) shown.rowH = parseFloat(getComputedStyle(text).lineHeight) || 25;
    const to = followRow({
      mid: span.offsetTop + span.offsetHeight / 2,
      rowH: shown.rowH,
      clientHeight: text.clientHeight,
      scrollTop: text.scrollTop,
    });
    if (to !== text.scrollTop) text.scrollTop = to;
    cues();
  }
  /**
   * The keys that scroll a long line once it's all typed: the arrows a row, Page Up and Down a
   * view less a row. Whether it took the key.
   * @param {string} key
   */
  function scrollKey(key) {
    if (!text.classList.contains('can-scroll')) return false;
    const row = shown.rowH || 25;
    const page = Math.max(row, text.clientHeight - row);
    const by = { ArrowDown: row, ArrowUp: -row, PageDown: page, PageUp: -page }[key];
    if (!by) return false;
    drag.stop();
    text.scrollTop += by;
    cues();
    return true;
  }
  text.addEventListener('scroll', cues, { passive: true });
  if (typeof view?.ResizeObserver === 'function') new view.ResizeObserver(() => scrollState()).observe(text);
  // (A finger's drag anywhere on the screen scrolls a long line once it's all typed, but under the
  // Log or the question, whose own list scrolls.)
  const drag = dragScroll(layer, text, {
    canScroll: () => !layer.hidden && !leaving && !modal() && text.classList.contains('can-scroll'),
    skip: (el) => modal() || Boolean(el?.closest('.inv-talk-log, .inv-talk-ask')),
  });

  /** The Log was opened with a pointer (a click or a tap), not from the keyboard. */
  let logByPointer = false;

  /**
   * @param {boolean} open
   * @param {boolean} [byPointer]  opened or closed with a click or a tap: closed, focus goes back
   *   where a key goes on (else, from the keyboard both ways, back to the Log button)
   */
  function setLog(open, byPointer = false) {
    if (open === !logBox.hidden) return;
    logBox.hidden = !open;
    logBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      logByPointer = byPointer;
      logList.innerHTML = logHtml(log());
      styleHolders(logList, palette);
      // (The latest at the bottom, in view.)
      logList.scrollTop = logList.scrollHeight;
      $('[data-talk="log-close"]').focus();
    }
    reach();
    if (!open) {
      if (byPointer || logByPointer) focusHome();
      else logBtn.focus();
    }
    onAction({ type: 'pause', on: modal() });
  }

  /** @param {boolean} open */
  function setAsk(open) {
    if (open === !ask.hidden) return;
    ask.hidden = !open;
    reach();
    if (open) $('[data-talk="no"]').focus();
    else focusHome();
    onAction({ type: 'pause', on: modal() });
  }

  /** Focus where the visitor goes on from: the first reply while they show, else the layer. */
  function focusHome() {
    const first = /** @type {HTMLElement|null} */ (choices.querySelector('button'));
    (first && shown.up ? first : layer).focus({ preventScroll: true });
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (layer.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!logBox.hidden) setLog(false);
      else if (!ask.hidden) onAction({ type: 'end' });
      else setAsk(true);
      return;
    }
    if (e.key === 'Tab') {
      // (Round the buttons showing, inside the layer, or inside the Log or the question.)
      const scope = !logBox.hidden ? logBox : !ask.hidden ? ask : layer;
      const stops = /** @type {HTMLElement[]} */ ([...scope.querySelectorAll('button')]).filter(
        (b) => !b.closest('[hidden], [inert]') && !(/** @type {HTMLButtonElement} */ (b).disabled),
      );
      // (The layer's own, then the link button over it.)
      if (scope === layer) stops.push(...more());
      if (!stops.length) return;
      const at = stops.indexOf(/** @type {HTMLElement} */ (doc.activeElement));
      e.preventDefault();
      const to =
        at < 0 ? (e.shiftKey ? stops.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
      stops[to].focus();
      return;
    }
    // (A long line, all typed: the arrows and Page Up and Down scroll it.)
    if (!modal() && scrollKey(e.key)) {
      e.preventDefault();
      return;
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const target = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
    // (A focused button presses itself: a reply's press waits for them to settle, in the click.
    // A focused link follows itself on Enter.)
    if (target?.closest('button, a[href]')) return;
    e.preventDefault();
    if (modal()) return;
    settle();
    if (e.repeat) return;
    press({ type: 'advance' });
  }

  layer.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const button = /** @type {HTMLElement|null} */ (el.closest('button'));
    if (!button) {
      // (Off the buttons: go on, unless the Log or the question is up.)
      if (!modal() && !el.closest('.inv-talk-log, .inv-talk-ask')) {
        settle();
        press({ type: 'advance' });
      }
      return;
    }
    // (Under the Log or the question only their own buttons take a press: the rest are inert too.)
    if (modal() && !button.closest('.inv-talk-log, .inv-talk-ask')) return;
    // (Skip Intro: over at once, no question.)
    if (button === skipIntro) {
      onAction({ type: 'end' });
      return;
    }
    const what = button.dataset.talk;
    // (A click or a tap, not a key: detail counts the clicks, 0 for Enter or Space.)
    const byPointer = e.detail > 0;
    if (button.dataset.choice !== undefined) {
      // (Too soon after they showed, or after a press that went on: the press goes nowhere.)
      if (now() < shown.settle) settle();
      else press({ type: 'choose', index: Number(button.dataset.choice) });
    } else if (what === 'auto' || what === 'skip') {
      if (what === 'auto') onAction({ type: 'auto', on: button.getAttribute('aria-pressed') !== 'true' });
      else onAction({ type: 'skip' });
      // (Clicked or tapped, focus goes back where Space and Enter go on, not left on the button.)
      if (byPointer && !layer.hidden && !modal()) focusHome();
    } else if (what === 'log') setLog(Boolean(logBox.hidden), byPointer);
    else if (what === 'log-close') setLog(false, byPointer);
    else if (what === 'no') setAsk(false);
    else if (what === 'yes') onAction({ type: 'end' });
  });
  // (Under the Log or the question, a press off them leaves focus in them.)
  layer.addEventListener('mousedown', (e) => {
    const on = e.target instanceof Element ? e.target.closest('.inv-talk-log, .inv-talk-ask') : null;
    if (modal() && !on) e.preventDefault();
  });
  // (Nothing under the layer takes a wheel or a context menu while it's up; the Log's own list
  // still scrolls with a wheel or trackpad, and so does a long line once it's all typed.)
  layer.addEventListener(
    'wheel',
    (e) => {
      const t = /** @type {Element|null} */ (e.target instanceof Element ? e.target : null);
      if (!t?.closest('.inv-talk-log-list, .inv-talk-text.can-scroll')) e.preventDefault();
    },
    { passive: false },
  );
  layer.addEventListener('contextmenu', (e) => e.preventDefault());

  /**
   * A view on the screen (render): the name, the line typed so far, the ▼, the replies, Auto;
   * only what changed. A box a press brought on comes with the click fade (clickFade).
   * @param {DialogueView} v
   */
  function show(v) {
    if (layer.hidden || leaving || !v.box) return;
    tickFade();
    if (v.seq !== shown.seq) {
      // (After a line, brought on by a press: the old one dithers out, then this one in; its
      // name goes on the tab as it comes in. Anything else shows it at once.)
      if (pressing && shown.seq >= 0) clickFade(v.speaker);
      else if (fade.phase) {
        fade.speaker = v.speaker;
        if (fade.phase === 'in') putName(v.speaker);
      } else putName(v.speaker);
      shown.seq = v.seq;
      const line = parseMarkup(v.box.text, palette);
      shown.spans = renderMarkup(typed, line);
      shown.n = -1;
      // (A new line from its top, not scrollable till it's typed.)
      shown.typed = false;
      shown.rowH = 0;
      drag.stop();
      text.scrollTop = 0;
      text.classList.remove('can-scroll');
      moreUp.hidden = moreDown.hidden = true;
      // (A screen reader hears the name plain, with the line.)
      const who = plainText(v.speaker);
      live.textContent = who ? `${who}: ${line.plain}` : line.plain;
    }
    const typedNow = typeTo(v);
    const showNext = typedNow && !v.choices;
    if (showNext !== shown.next) next.hidden = !(shown.next = showNext);
    // (A box's replies are laid out from its start, out of sight and out of reach, so its shot
    // frames him over them; they show once its line is typed, after any click fade.)
    const own = v.box.choices?.length ? v.box.choices : null;
    const up = Boolean(own && v.choices) && !fade.phase;
    const key = own ? `${v.seq}:${own.map((c) => c.label).join('\n')}` : '';
    if (key !== shown.choices) {
      shown.choices = key;
      // (Each reply's words styled, for the eye; its name plain, for a screen reader.)
      choices.innerHTML = (own ?? [])
        .map(
          (c, i) =>
            `<button type="button" class="inv-btn inv-talk-choice" data-choice="${i}" aria-label="${attr(plainText(c.label))}"><span class="inv-talk-choice-text" aria-hidden="true" data-styled="${attr(c.label)}"></span></button>`,
        )
        .join('');
      styleHolders(choices, palette);
      choices.hidden = !own;
      // (Their state set afresh below.)
      shown.up = !up;
    }
    if (up !== shown.up) {
      shown.up = up;
      shown.settle = up ? now() + replySettle : 0;
      choices.classList.toggle('is-waiting', !up);
      reach();
      layer.classList.toggle('is-choosing', up);
      if (!modal()) focusHome();
    }
    if (v.auto !== shown.auto) autoBtn.setAttribute('aria-pressed', String((shown.auto = v.auto)));
  }

  return {
    /** Show the layer, its Log and question closed, focus in it (whole, if it was still going). */
    open() {
      leaving?.();
      leaving = null;
      stopFade();
      drag.stop();
      layer.hidden = false;
      logBox.hidden = true;
      ask.hidden = true;
      logBtn.setAttribute('aria-expanded', 'false');
      shown.seq = -1;
      reach();
      doc.addEventListener('keydown', onKey);
      layer.focus({ preventScroll: true });
    },
    /**
     * Hide it: faded out (fadeAway: out of reach at once, so free play has every press
     * meanwhile), or with `cut` at once (the intro dropped for a replay or the admin's preview).
     * @param {{cut?: boolean}} [o]
     */
    close({ cut = false } = {}) {
      leaving?.();
      leaving = null;
      stopFade();
      drag.stop();
      live.textContent = '';
      doc.removeEventListener('keydown', onKey);
      if (cut || layer.hidden) {
        layer.hidden = true;
        return;
      }
      leaving = fadeAway(layer, () => {
        leaving = null;
      });
    },
    /**
     * Show a view: the name, the line typed so far, the ▼, the replies, Auto; only what changed.
     * @param {DialogueView} v
     */
    render(v) {
      show(v);
    },
    /**
     * The text effects' colours from the next box on (the admin's intro preview: its draft's).
     * @param {Map<string, string>} colours  markup.js paletteOf’s
     */
    setPalette(colours) {
      palette = colours;
    },
    /** Open (not hidden, nor going). */
    get showing() {
      return !layer.hidden && !leaving;
    },
    /** Out of sight: hidden, its fade as the intro ends over (the link button may take the top right). */
    get gone() {
      return Boolean(layer.hidden);
    },
    get logOpen() {
      return !logBox.hidden;
    },
    get asking() {
      return !ask.hidden;
    },
    /** The replies show and take a press (they've settled: REPLY_SETTLE). */
    get repliesLive() {
      return shown.up && now() >= shown.settle;
    },
    /** The chat box (main.js frames the shots in the space over it, and watches its size). */
    get box() {
      return $('.inv-talk-box');
    },
    /**
     * The space the shots frame him in, client px: from under the Auto, Next and Log row to the
     * chat box's top as it's laid out (its rise as the layer opens left out), or to the replies'
     * top while a box has them and there's REPLY_ROOM over them, so they show under his face.
     */
    clearSpace() {
      const top = $('.inv-talk-top').getBoundingClientRect().bottom;
      const bottom = layer.getBoundingClientRect().top + $('.inv-talk-box').offsetTop;
      // (A box with replies: over them, where they show, when there's room for him there.)
      const over = choices.hidden ? null : choices.getBoundingClientRect().top;
      if (over !== null && over - top >= REPLY_ROOM && over < bottom) return { top, bottom: over };
      return { top, bottom };
    },
    get element() {
      return layer;
    },
    dispose() {
      leaving?.();
      stopFade();
      unhold();
      drag.dispose();
      doc.removeEventListener('keydown', onKey);
      layer.remove();
    },
  };
}
