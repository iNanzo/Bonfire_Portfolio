// The intro dialogue's runner in the invitation toy (the envelope, Replay Intro): an Uma Musume-style chat, one
// box at a time, on an injected clock (no DOM, no three.js). normalizeScript makes any script
// safe to run (types.js DialogueScript: content.json `invitation.intro`, or the page's own
// fallback): a face, clip or shot it doesn't know falls back (neutral, none, keep), a missing or
// doubled id gets its own, a start that isn't there is the first box, text is capped at
// DIALOGUE.maxText letters and choices at DIALOGUE.maxChoices; with no box at all it's null.
// A line, a speaker's name and a reply may carry text effects' tags (markup.js: {red,wave|…}):
// they're kept (the screen draws them), and everything here counts the letters that show (an
// emoji is one; a name or a reply that shows nothing is none).
// createDialogue runs it:
//   - the line types out at DIALOGUE.cps letters a second, a beat after punctuation
//     (DIALOGUE.pause); with reduced motion it shows at once;
//   - advance (a tap, Space, Enter) finishes the typing first, then goes on: a box's `next`, else
//     the box after it; `end`, the last box or a `next` that isn't there ends it;
//   - a box's choices show once its line is typed, and a tap never passes them: choose(i) goes to
//     that reply's box (one that isn't there ends it);
//   - Auto goes on by itself once the line is typed and the box's `auto` seconds have passed (or
//     autoDelay's, from the line's length), never past a choice;
//   - Next (the top right's button; skip here) goes to the next box with choices, typed, or to
//     the end (a loop with no choice in it ends rather than going round);
//   - the log keeps every line shown (its speaker and plain text) and every reply picked, in order,
//     each name and reply plain and as written (styled: its tags, for the Log to draw);
//   - pause holds its clock (the Log or the "Skip intro?" question open): no typing, no Auto.
// lookSway is the small, slow drift his look has on top of looking at the camera while he talks.

import { DIALOGUE_CLIPS, FACE_NAMES } from './clips.js';
import { clipMarkup, letterCount, plainText, visibleLetters } from './markup.js';

/** @typedef {import('./types.js').DialogueScript} DialogueScript */
/** @typedef {import('./types.js').DialogueBox} DialogueBox */
/** @typedef {import('./types.js').DialogueShot} DialogueShot */

/**
 * cps: letters typed a second; pause: extra seconds after a letter before the next shows;
 * autoBase + autoPerChar × letters: Auto's wait once a line is typed, between autoMin and
 * autoMax seconds; maxText: letters a line keeps (its tags aside); maxChoices: replies a box keeps; maxAuto: the
 * longest wait a box may ask for, seconds.
 */
export const DIALOGUE = {
  cps: 32,
  /** @type {Record<string, number>} */
  pause: { ',': 0.1, ';': 0.12, ':': 0.12, '—': 0.12, '.': 0.24, '!': 0.24, '?': 0.24, '…': 0.3 },
  autoBase: 1.1,
  autoPerChar: 0.035,
  autoMin: 1.4,
  autoMax: 6,
  maxText: 240,
  maxChoices: 3,
  maxAuto: 30,
  speaker: 'NEWT',
};
/** Every camera a box may ask for (types.js DialogueShot). */
export const SHOT_NAMES = /** @type {DialogueShot[]} */ (['close', 'medium', 'wide', 'keep']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
/** Text with a letter that shows (its tags aside). @param {unknown} v */
const shows = (v) => plainText(str(v)).trim() !== '';

/**
 * Seconds from a line's start until each letter that shows does: the i-th (from 1) at i / cps,
 * plus the beats after the punctuation before it (its tags take no time).
 * @param {string} text
 */
function charTimes(text) {
  const chars = visibleLetters(text);
  const out = new Array(chars.length);
  let at = 0;
  for (let i = 0; i < chars.length; i++) {
    at += 1 / DIALOGUE.cps;
    out[i] = at;
    // (A beat after punctuation, but not before a closing quote or more of it: "Wait..." pauses once.)
    const next = chars[i + 1];
    if (next !== undefined && !(next in DIALOGUE.pause) && !/["'’”)]/.test(next)) at += DIALOGUE.pause[chars[i]] ?? 0;
  }
  return out;
}

/**
 * How many letters of `text` show `elapsed` seconds into it.
 * @param {string} text
 * @param {number} elapsed
 */
export function charsAt(text, elapsed) {
  const times = charTimes(text);
  let n = 0;
  while (n < times.length && times[n] <= elapsed + 1e-9) n++;
  return n;
}

/**
 * Seconds to type the whole line.
 * @param {string} text
 */
export function typeDuration(text) {
  const times = charTimes(text);
  return times.length ? times[times.length - 1] : 0;
}

/**
 * Auto's wait once a box's line is typed: its own `auto`, else one from the line's length.
 * @param {{text: string, auto?: number}} box
 */
export function autoDelay(box) {
  if (typeof box.auto === 'number' && Number.isFinite(box.auto) && box.auto >= 0) return box.auto;
  const n = letterCount(box.text ?? '');
  return Math.min(DIALOGUE.autoMax, Math.max(DIALOGUE.autoMin, DIALOGUE.autoBase + n * DIALOGUE.autoPerChar));
}

/**
 * Any script made safe to run (see the header), or null when it has nothing to show.
 * @param {unknown} raw
 * @returns {DialogueScript|null}
 */
export function normalizeScript(raw) {
  if (!isObj(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (!Array.isArray(o.boxes)) return null;
  const used = new Set();
  /** @param {string} want */
  const uniqueId = (want, i) => {
    let id = want.trim() || `box-${i + 1}`;
    for (let k = 2; used.has(id); k++) id = `${want.trim() || `box-${i + 1}`}-${k}`;
    used.add(id);
    return id;
  };
  /** @type {DialogueBox[]} */
  const boxes = [];
  o.boxes.forEach((b, i) => {
    if (!isObj(b)) return;
    const r = /** @type {Record<string, any>} */ (b);
    /** @type {DialogueBox} */
    const box = {
      id: uniqueId(str(r.id), i),
      text: clipMarkup(str(r.text), DIALOGUE.maxText),
      face: FACE_NAMES.includes(r.face) ? r.face : 'neutral',
      animation: r.animation === 'none' || DIALOGUE_CLIPS.includes(r.animation) ? r.animation : 'none',
      camera: SHOT_NAMES.includes(r.camera) ? r.camera : 'keep',
    };
    if (shows(r.speaker)) box.speaker = str(r.speaker).trim();
    if (typeof r.auto === 'number' && Number.isFinite(r.auto) && r.auto >= 0)
      box.auto = Math.min(DIALOGUE.maxAuto, r.auto);
    if (str(r.next).trim()) box.next = str(r.next).trim();
    if (Array.isArray(r.choices)) {
      const choices = r.choices
        .filter((c) => isObj(c) && shows(c.label))
        .slice(0, DIALOGUE.maxChoices)
        .map((c) => ({ label: str(c.label).trim(), next: str(c.next).trim() }));
      if (choices.length) box.choices = choices;
    }
    if (r.end === true) box.end = true;
    boxes.push(box);
  });
  if (!boxes.length) return null;
  const start = str(o.start).trim();
  return {
    speaker: shows(o.speaker) ? str(o.speaker).trim() : DIALOGUE.speaker,
    start: boxes.some((b) => b.id === start) ? start : boxes[0].id,
    boxes,
  };
}

/**
 * @typedef {object} DialogueView  what the page shows now
 * @property {boolean} done  it's over (or never began)
 * @property {DialogueBox|null} box  the box up now
 * @property {string} speaker  its name tab
 * @property {number} seq  counts the boxes shown (a new box: a new seq)
 * @property {number} shown  letters typed so far (markup.js: the ones that show)
 * @property {number} length  letters in the line
 * @property {boolean} typed  the whole line is up
 * @property {Array<{label: string, next: string}>|null} choices  the replies, once the line is typed
 * @property {boolean} auto
 * @property {boolean} paused
 */
/**
 * @typedef {{kind: 'line', speaker: string, styled: string, text: string} |
 *   {kind: 'reply', text: string, styled: string, speaker?: undefined}} LogEntry  speaker and
 *   text plain (a line's text always is); styled: the name or the reply as written, its tags kept
 */

/**
 * The runner for a script (normalizeScript's; null or nothing to show ends at the start).
 * @param {DialogueScript|null} script
 * @param {{reduced?: boolean}} [o]  reduced: every line at once
 */
export function createDialogue(script, { reduced = false } = {}) {
  const boxes = script?.boxes ?? [];
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const m = {
    /** @type {DialogueBox|null} */
    box: null,
    done: true,
    seq: 0,
    /** when the box's line began, on the runner's clock (paused time taken out) */
    start: 0,
    /** the line finished by a tap or Skip */
    forced: false,
    /** when the line was all up, or null while it types */
    typedAt: /** @type {number|null} */ (null),
    auto: false,
    /** @type {number|null} when the pause began */
    pausedAt: null,
    /** the clock's last reading */
    t: 0,
    /** @type {LogEntry[]} */
    log: [],
  };

  /** @param {DialogueBox} b */
  const lengthOf = (b) => letterCount(b.text);
  /** Seconds into the line now. */
  const elapsed = () => (m.pausedAt ?? m.t) - m.start;
  /** Characters up now. */
  const shown = () => {
    if (!m.box) return 0;
    if (reduced || m.forced) return lengthOf(m.box);
    return charsAt(m.box.text, elapsed());
  };
  const typed = () => Boolean(m.box) && shown() >= lengthOf(/** @type {DialogueBox} */ (m.box));

  /**
   * The box after `b` when it's done (null: the end): its `next`, else the following box.
   * @param {DialogueBox} b
   */
  function after(b) {
    if (b.end) return null;
    if (b.next) return byId.get(b.next) ?? null;
    const i = boxes.indexOf(b);
    return boxes[i + 1] ?? null;
  }

  /**
   * Show `b` (null: the end), typed from its start or all at once.
   * @param {DialogueBox|null} b
   * @param {boolean} [whole]
   */
  function enter(b, whole = false) {
    if (!b) return finish();
    m.box = b;
    m.seq += 1;
    m.start = m.pausedAt ?? m.t;
    m.forced = whole;
    m.typedAt = null;
    const who = b.speaker ?? script?.speaker ?? DIALOGUE.speaker;
    m.log.push({ kind: 'line', speaker: plainText(who), styled: who, text: plainText(b.text) });
    markTyped();
  }

  function finish() {
    m.box = null;
    m.done = true;
    m.pausedAt = null;
  }

  /** Notes when the line came up whole (Auto counts its wait from then). */
  function markTyped() {
    if (m.typedAt !== null || !m.box || !typed()) return;
    const times = charTimes(m.box.text);
    m.typedAt = m.forced || reduced ? (m.pausedAt ?? m.t) : m.start + (times.at(-1) ?? 0);
  }

  /** @param {number} t */
  const tick = (t) => {
    if (Number.isFinite(t)) m.t = Math.max(m.t, t);
  };

  /** @returns {DialogueView} */
  function view() {
    const b = m.box;
    const up = typed();
    return {
      done: m.done,
      box: b,
      speaker: b ? (b.speaker ?? script?.speaker ?? DIALOGUE.speaker) : '',
      seq: m.seq,
      shown: shown(),
      length: b ? lengthOf(b) : 0,
      typed: up,
      choices: b && up && b.choices?.length ? b.choices : null,
      auto: m.auto,
      paused: m.pausedAt !== null,
    };
  }

  return {
    /**
     * Begin at the script's start box.
     * @param {number} t
     */
    start(t) {
      m.t = Number.isFinite(t) ? t : 0;
      m.done = false;
      m.log = [];
      m.pausedAt = null;
      enter(script ? (byId.get(script.start) ?? boxes[0] ?? null) : null);
    },
    /**
     * A frame: the typing moves on and Auto goes on when its wait is over.
     * @param {number} t
     * @returns {DialogueView}
     */
    step(t) {
      tick(t);
      if (m.done || m.pausedAt !== null || !m.box) return view();
      markTyped();
      const b = m.box;
      if (m.auto && m.typedAt !== null && !b.choices?.length && m.t - m.typedAt >= autoDelay(b) - 1e-9) enter(after(b));
      return view();
    },
    /**
     * A tap: finish the typing, else go on (never past a choice).
     * @param {number} t
     * @returns {'typed'|'next'|'wait'|'end'}
     */
    advance(t) {
      tick(t);
      if (m.done || !m.box) return 'end';
      if (!typed()) {
        m.forced = true;
        markTyped();
        return 'typed';
      }
      if (m.box.choices?.length) return 'wait';
      enter(after(m.box));
      return m.done ? 'end' : 'next';
    },
    /**
     * Pick reply `i` of the box up (once its choices show): its box, or the end.
     * @param {number} i
     * @param {number} t
     */
    choose(i, t) {
      tick(t);
      const c = view().choices?.[i];
      if (!c) return false;
      m.log.push({ kind: 'reply', text: plainText(c.label), styled: c.label });
      enter(byId.get(c.next) ?? null);
      return true;
    },
    /**
     * Auto on or off.
     * @param {boolean} on
     * @param {number} t
     */
    setAuto(on, t) {
      tick(t);
      m.auto = on;
    },
    /**
     * Next (the top right's button): to the next box with choices (typed at once), or the end;
     * at a box with choices, its line finishes.
     * @param {number} t
     */
    skip(t) {
      tick(t);
      if (m.done || !m.box) return;
      if (m.box.choices?.length) {
        m.forced = true;
        markTyped();
        return;
      }
      const seen = new Set([m.box]);
      let b = after(m.box);
      while (b && !b.choices?.length && !seen.has(b)) {
        seen.add(b);
        b = after(b);
      }
      enter(b && b.choices?.length ? b : null, true);
    },
    /**
     * Hold the clock (on) or let it go on from where it was.
     * @param {boolean} on
     * @param {number} t
     */
    pause(on, t) {
      tick(t);
      if (on && m.pausedAt === null) m.pausedAt = m.t;
      else if (!on && m.pausedAt !== null) {
        const held = m.t - m.pausedAt;
        m.start += held;
        if (m.typedAt !== null) m.typedAt += held;
        m.pausedAt = null;
      }
    },
    /** End it now. */
    end: finish,
    get view() {
      return view();
    },
    /** @returns {LogEntry[]} */
    get log() {
      return m.log.map((e) => ({ ...e }));
    },
  };
}

/**
 * The small drift his look has on top of the camera while he talks, radians: a few degrees, slow,
 * never a stare.
 * @param {number} t  seconds
 */
export function lookSway(t) {
  return {
    yaw: 0.045 * Math.sin(t * 0.73) + 0.02 * Math.sin(t * 1.91 + 1.3),
    pitch: 0.03 * Math.sin(t * 0.57 + 0.6) + 0.012 * Math.sin(t * 1.37 + 2.1),
  };
}
