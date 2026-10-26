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
// a "Skip the Intro?" question for Escape. Rendering only: dialogue.js runs the script, and
// main.js hands each frame's view here (render) and turns what's pressed (`onAction`) into the
// runner's calls.
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
// round the layer's buttons. A screen reader hears each line whole once, as plain text, from a
// live region (the typed text is hidden from it), and the Log lists it plain too; the replies are buttons, and focus goes to the first reply
// when they show, into the Log and the question when they open and back when they close.

/** @typedef {import('./dialogue.js').DialogueView} DialogueView */
/** @typedef {import('./dialogue.js').LogEntry} LogEntry */
import { DEFAULT_TEXT_COLORS, paletteOf, parseMarkup, renderMarkup, revealLetters } from './markup.js';
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
    <p class="inv-talk-name"></p>
    <p class="inv-talk-text" aria-hidden="true"><span class="inv-talk-typed"></span></p>
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
 * The Log's entries as list items: each line with its speaker, each reply as the visitor's.
 * @param {LogEntry[]} entries
 */
export function logHtml(entries) {
  return entries
    .map((e) =>
      e.kind === 'reply'
        ? `<li class="inv-talk-log-reply"><span class="inv-talk-log-who">${TALK_TEXT.you}</span> ${html(e.text)}</li>`
        : `<li><span class="inv-talk-log-who">${html(e.speaker)}</span> ${html(e.text)}</li>`,
    )
    .join('');
}

/**
 * The layer, in the stage (over the toolbar and the Look sheet): open() shows it, render() shows
 * a view, close() hides it.
 * @param {HTMLElement} stage
 * @param {{onAction(a: TalkAction): void, log(): LogEntry[], replySettle?: number, palette?: Map<string, string>}} o  log: the entries now (the Log reads them as it opens); replySettle: ms the replies wait (REPLY_SETTLE; ?test can stretch it); palette: the text effects' colours (markup.js paletteOf; content.js textPalette)
 */
export function createDialogueUi(
  stage,
  { onAction, log, replySettle = REPLY_SETTLE, palette: firstPalette = paletteOf(DEFAULT_TEXT_COLORS) },
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
  const $ = (sel) => /** @type {HTMLElement} */ (layer.querySelector(sel));
  const name = $('.inv-talk-name');
  const typed = $('.inv-talk-typed');
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
  };

  const modal = () => !logBox.hidden || !ask.hidden;
  /**
   * What's in reach: under the open Log or the question, Auto, Next, Log and the replies are
   * inert (out of reach of taps, clicks and Tab); the replies too until they show.
   */
  const reach = () => {
    topRow.toggleAttribute('inert', modal());
    skipIntro.toggleAttribute('inert', modal());
    choices.toggleAttribute('inert', modal() || !shown.up);
  };
  const now = () => doc.defaultView?.performance.now() ?? Date.now();
  /** A press that goes on (or lands on a reply too soon): the replies wait REPLY_SETTLE from it. */
  const settle = () => {
    if (shown.up) shown.settle = Math.max(shown.settle, now() + replySettle);
  };

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
      if (!stops.length) return;
      const at = stops.indexOf(/** @type {HTMLElement} */ (doc.activeElement));
      e.preventDefault();
      const to =
        at < 0 ? (e.shiftKey ? stops.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
      stops[to].focus();
      return;
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const target = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
    // (A focused button presses itself: a reply's press waits for them to settle, in the click.)
    if (target?.closest('button')) return;
    e.preventDefault();
    if (modal()) return;
    settle();
    if (!e.repeat) onAction({ type: 'advance' });
  }

  layer.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const button = /** @type {HTMLElement|null} */ (el.closest('button'));
    if (!button) {
      // (Off the buttons: go on, unless the Log or the question is up.)
      if (!modal() && !el.closest('.inv-talk-log, .inv-talk-ask')) {
        settle();
        onAction({ type: 'advance' });
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
      else onAction({ type: 'choose', index: Number(button.dataset.choice) });
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
  // still scrolls with a wheel or trackpad.)
  layer.addEventListener(
    'wheel',
    (e) => {
      const t = /** @type {Element|null} */ (e.target instanceof Element ? e.target : null);
      if (!t?.closest('.inv-talk-log-list')) e.preventDefault();
    },
    { passive: false },
  );
  layer.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    /** Show the layer, its Log and question closed, focus in it. */
    open() {
      layer.hidden = false;
      logBox.hidden = true;
      ask.hidden = true;
      logBtn.setAttribute('aria-expanded', 'false');
      shown.seq = -1;
      reach();
      doc.addEventListener('keydown', onKey);
      layer.focus({ preventScroll: true });
    },
    /** Hide it. */
    close() {
      layer.hidden = true;
      live.textContent = '';
      doc.removeEventListener('keydown', onKey);
    },
    /**
     * Show a view: the name, the line typed so far, the ▼, the replies, Auto; only what changed.
     * @param {DialogueView} v
     */
    render(v) {
      if (layer.hidden || !v.box) return;
      if (v.seq !== shown.seq) {
        shown.seq = v.seq;
        const line = parseMarkup(v.box.text, palette);
        shown.spans = renderMarkup(typed, line);
        shown.n = -1;
        name.textContent = v.speaker;
        name.hidden = !v.speaker;
        live.textContent = v.speaker ? `${v.speaker}: ${line.plain}` : line.plain;
      }
      if (v.shown !== shown.n) {
        revealLetters(shown.spans, v.shown, shown.n);
        shown.n = v.shown;
      }
      const showNext = v.typed && !v.choices;
      if (showNext !== shown.next) next.hidden = !(shown.next = showNext);
      // (A box's replies are laid out from its start, out of sight and out of reach, so its shot
      // frames him over them; they show once its line is typed.)
      const own = v.box.choices?.length ? v.box.choices : null;
      const key = own ? `${v.seq}:${own.map((c) => c.label).join('\n')}` : '';
      if (key !== shown.choices) {
        shown.choices = key;
        choices.innerHTML = (own ?? [])
          .map(
            (c, i) =>
              `<button type="button" class="inv-btn inv-talk-choice" data-choice="${i}">${html(c.label)}</button>`,
          )
          .join('');
        choices.hidden = !own;
        // (Their state set afresh below.)
        shown.up = !(own && v.choices);
      }
      const up = Boolean(own && v.choices);
      if (up !== shown.up) {
        shown.up = up;
        shown.settle = up ? now() + replySettle : 0;
        choices.classList.toggle('is-waiting', !up);
        reach();
        layer.classList.toggle('is-choosing', up);
        if (!modal()) focusHome();
      }
      if (v.auto !== shown.auto) autoBtn.setAttribute('aria-pressed', String((shown.auto = v.auto)));
    },
    /**
     * The text effects' colours from the next box on (the admin's intro preview: its draft's).
     * @param {Map<string, string>} colours  markup.js paletteOf’s
     */
    setPalette(colours) {
      palette = colours;
    },
    get showing() {
      return !layer.hidden;
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
      doc.removeEventListener('keydown', onKey);
      layer.remove();
    },
  };
}
