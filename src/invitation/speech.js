// What NEWT says in the invitation toy, and when (pure: no DOM, no clock; time comes in as t,
// randomness from an injected rng). Each frame createTalk's step reads what the brain did (its
// BrainOut, this frame's and the last), the gestures, the button pressed and the camera, and
// finds the moments worth a line: the plan's triggers (TRIGGERS) for a tap's wave or spook,
// running off, being caught mid-run, picked up, shaken, thrashing, dropped and landing, walking
// to a floor tap or wandering off, sitting down by himself, still sitting a while, standing up,
// getting the tablet (Screen Time) and lying down with it, idle time
// every 20 to 40 s, the camera spun round a lot or zoomed in very close. A moment speaks at its
// trigger's chance, once its cooldown is over (the admin's, content.json `invitation.speech`,
// read by speechFrom), with one of its lines (`invitation.lines`, linesFrom) picked at random,
// never the line just said. One bubble at a time: while a line is up (lineDuration: typed,
// held, faded, as bubble.js shows it) only a moment that matters more (PRIORITY) replaces it.
// The idle clock runs from the last line coming down; while he's busy (held, running, a
// reaction) it waits, and while he sits it says a still-sitting line instead.

import { between } from './rng.js';
import { wrapAngle } from './steer.js';

/** @typedef {import('./types.js').BrainOut} BrainOut */
/** @typedef {import('./types.js').GestureEvent} GestureEvent */
/** @typedef {import('./types.js').ButtonName} ButtonName */
/**
 * @typedef {'wave'|'spook'|'flee'|'caught'|'pickedUp'|'shaken'|'thrash'|'dropped'|'landed'|'walkTo'|
 *   'wander'|'sitDown'|'sitting'|'standUp'|'device'|'lieDown'|'idle'|'spin'|'zoom'} Trigger
 */
/** @typedef {{chance: number, cooldown: number}} TriggerSetting  chance 0..1; cooldown, seconds */
/**
 * @typedef {object} SpeechSettings  what speechFrom makes of content.json's `invitation.speech`
 * @property {[number, number]} idleEvery  an idle line every lo..hi seconds of quiet
 * @property {Record<string, TriggerSetting>} triggers  every trigger's chance and cooldown
 */
/** @typedef {Partial<Record<Trigger, string[]>>} Lines  each trigger's lines (linesFrom) */
/**
 * @typedef {object} TalkIn  one frame (main.js, after brain.step)
 * @property {number} t  the toy's clock, seconds
 * @property {number} dt
 * @property {(Partial<BrainOut> & {state: string})|null} state  the brain's output this frame
 *   (state, clip, restart, reaction, face, faceCamera, device are read); null before NEWT is in
 * @property {(Partial<BrainOut> & {state: string})|null} [prevState]  last frame's (left out: the
 *   last one step saw)
 * @property {GestureEvent[]} [events]  this frame's gestures (a floor tap marks the walk his)
 * @property {{yaw: number, zoom: number}|null} [camera]  the orbit's yaw, radians, and its
 *   distance over the default's (1: as it starts, 0.5: zoomed all the way in)
 * @property {ButtonName|null} [button]  the toolbar button pressed this frame (Sit: he didn't sit by himself)
 */
/** @typedef {{say: string|null, trigger: Trigger|null}} TalkOut  a line to show now, and why */

/** Every trigger, in the plan's order (its table's kinds: reactions, running, carried, moving, sitting, passive, camera). */
export const TRIGGERS = /** @type {Trigger[]} */ ([
  'wave',
  'spook',
  'flee',
  'caught',
  'pickedUp',
  'shaken',
  'thrash',
  'dropped',
  'landed',
  'walkTo',
  'wander',
  'sitDown',
  'sitting',
  'standUp',
  'device',
  'lieDown',
  'idle',
  'spin',
  'zoom',
]);

/**
 * How much each moment matters: while a line is up, only a higher one replaces it (so a wave
 * stays up over a wander, being caught cuts in over running off, and a thrash's line over a
 * shaken one: a hard shake brings a thrash on sooner, so it would otherwise always be blocked).
 * @type {Record<Trigger, number>}
 */
export const PRIORITY = {
  thrash: 5,
  caught: 4,
  shaken: 4,
  spook: 3,
  flee: 3,
  pickedUp: 3,
  dropped: 3,
  landed: 3,
  wave: 2,
  walkTo: 2,
  sitDown: 2,
  standUp: 2,
  device: 2,
  lieDown: 2,
  spin: 2,
  zoom: 2,
  wander: 1,
  sitting: 1,
  idle: 0,
};

/** The admin's ranges: [min, max, step, unit?] (admin/ui/schema.js shows them as sliders; contentRules.js checks them). */
export const SPEECH_RANGES = {
  chance: /** @type {[number, number, number]} */ ([0, 1, 0.05]),
  cooldown: /** @type {[number, number, number, string]} */ ([0, 120, 1, 's']),
  idle: /** @type {[number, number, number, string]} */ ([5, 180, 1, 's']),
};

/**
 * The settings when content.json has none (or a broken one): what it ships with.
 * @type {SpeechSettings}
 */
export const SPEECH_DEFAULTS = {
  idleEvery: [20, 40],
  triggers: {
    wave: { chance: 0.6, cooldown: 8 },
    spook: { chance: 0.7, cooldown: 8 },
    flee: { chance: 0.8, cooldown: 10 },
    caught: { chance: 0.9, cooldown: 10 },
    pickedUp: { chance: 0.7, cooldown: 8 },
    shaken: { chance: 0.8, cooldown: 6 },
    thrash: { chance: 0.6, cooldown: 8 },
    dropped: { chance: 0.5, cooldown: 8 },
    landed: { chance: 0.6, cooldown: 8 },
    walkTo: { chance: 0.35, cooldown: 12 },
    wander: { chance: 0.15, cooldown: 30 },
    sitDown: { chance: 0.8, cooldown: 30 },
    sitting: { chance: 0.9, cooldown: 20 },
    standUp: { chance: 0.5, cooldown: 15 },
    device: { chance: 0.9, cooldown: 15 },
    lieDown: { chance: 0.9, cooldown: 15 },
    idle: { chance: 0.8, cooldown: 0 },
    spin: { chance: 0.9, cooldown: 20 },
    zoom: { chance: 0.9, cooldown: 20 },
  },
};

/** At most this many lines a trigger, each at most LINE_MAX characters (contentRules.js holds content.json to them too). */
export const LINES_MAX = 20;
export const LINE_MAX = 120;

/** The numbers talk runs on (seconds, characters a second, radians, zoom shares). */
export const TALK = {
  /** A line types out at this many characters a second… */
  typeCps: 30,
  /** …then stays up this long, plus this much a character (time to read it)… */
  hold: 1.6,
  holdPerChar: 0.045,
  /** …then fades out over this long. */
  fade: 0.35,
  /** A walk starting this long after a floor tap is the tap's (he may get up first). */
  walkWindow: 4,
  /** A sit this long after the Sit button is the button's, not his own. */
  sitButton: 1.5,
  /** The camera turned this many turns, recently (a leak of spinDecay s), is a spin. */
  spinTurns: 1.25,
  spinDecay: 3,
  /** Zoomed in to this share of the default distance is close; out past zoomAgain, it may count again. */
  zoomClose: 0.62,
  zoomAgain: 0.8,
  /** Busy when the idle clock comes round: it tries again this much later. */
  busyRetry: 3,
};

/** The states he can say an idle line in (sitting: a still-sitting line). */
const IDLE_STATES = new Set(['idle', 'walk']);

/** A line's length in characters (an emoji is one). @param {string} text */
const charsOf = (text) => Array.from(text).length;

/**
 * How long a line is up, seconds: typed at TALK.typeCps, held to be read, faded (bubble.js
 * shows it on this timeline, with prefers-reduced-motion all at once and held the longer).
 * @param {string} text
 */
export function lineDuration(text) {
  const n = charsOf(text);
  return n / TALK.typeCps + TALK.hold + n * TALK.holdPerChar + TALK.fade;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/**
 * A number clamped into a range, or the fallback when it isn't one.
 * @param {unknown} v
 * @param {Array<number|string>} range  [min, max, …]
 * @param {number} fallback
 */
const inRange = (v, range, fallback) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Number(range[1]), Math.max(Number(range[0]), v)) : fallback;

/**
 * The speech settings from content.json's `invitation.speech` (anything): `idleMin`/`idleMax`,
 * seconds, and each trigger's `{chance, cooldown}`, each value checked on its own (clamped into
 * SPEECH_RANGES, the default's when it isn't a number), unknown triggers dropped.
 * @param {unknown} raw
 * @returns {SpeechSettings}
 */
export function speechFrom(raw) {
  const o = /** @type {Record<string, any>} */ (isObj(raw) ? raw : {});
  const d = SPEECH_DEFAULTS;
  const lo = inRange(o.idleMin, SPEECH_RANGES.idle, d.idleEvery[0]);
  const hi = inRange(o.idleMax, SPEECH_RANGES.idle, d.idleEvery[1]);
  /** @type {Record<string, TriggerSetting>} */
  const triggers = {};
  for (const k of TRIGGERS) {
    const own = isObj(o[k]) ? o[k] : {};
    triggers[k] = {
      chance: inRange(own.chance, SPEECH_RANGES.chance, d.triggers[k].chance),
      cooldown: inRange(own.cooldown, SPEECH_RANGES.cooldown, d.triggers[k].cooldown),
    };
  }
  return { idleEvery: [Math.min(lo, hi), Math.max(lo, hi)], triggers };
}

/**
 * The lines from content.json's `invitation.lines` (anything): each known trigger's list of
 * text, trimmed, the empty, the non-text and the too long (over LINE_MAX) left out, at most
 * LINES_MAX of them.
 * @param {unknown} raw
 * @returns {Lines}
 */
export function linesFrom(raw) {
  const o = /** @type {Record<string, unknown>} */ (isObj(raw) ? raw : {});
  /** @type {Lines} */
  const out = {};
  for (const k of TRIGGERS) {
    const list = o[k];
    if (!Array.isArray(list)) continue;
    out[k] = list
      .filter((l) => typeof l === 'string')
      .map((l) => l.trim())
      .filter((l) => l && charsOf(l) <= LINE_MAX)
      .slice(0, LINES_MAX);
  }
  return out;
}

/**
 * NEWT's talk: step it once a frame; it says which line to show, if any.
 * @param {{lines: Lines, speech?: SpeechSettings, rng: () => number}} opts  speech: speechFrom's
 *   (missing triggers take the defaults)
 */
export function createTalk({ lines, speech, rng }) {
  const idleEvery = speech?.idleEvery ?? SPEECH_DEFAULTS.idleEvery;
  /** @type {Record<string, TriggerSetting>} */
  const settings = { ...SPEECH_DEFAULTS.triggers, ...speech?.triggers };
  const m = {
    t: 0,
    /** @type {TalkIn['state']} */
    prev: null,
    /** @type {{trigger: Trigger, line: string, priority: number, until: number}|null} */
    showing: null,
    /** @type {Partial<Record<Trigger, number>>} when each trigger may speak again */
    ready: {},
    /** @type {string|null} */
    lastLine: null,
    /** @type {number|null} when the idle clock comes round */
    nextIdle: null,
    /** @type {number|null} a floor tap not yet walked to */
    floorTap: null,
    sitPressed: -Infinity,
    /** @type {number|null} */
    yaw: null,
    spin: 0,
    zoomArmed: true,
  };

  const rollIdle = (from) => from + between(rng, idleEvery[0], idleEvery[1]);

  /**
   * A tap's reaction starting: a new one (from another state, another reaction, a tap that turns
   * him to the camera again, or one restarting its clip), not its clip starting after the turn.
   * @param {NonNullable<TalkIn['state']>} s
   * @param {NonNullable<TalkIn['state']>} p
   * @returns {Trigger|null}
   */
  function reaction(s, p) {
    if (s.state !== 'react' || !s.reaction) return null;
    const fresh =
      p.state !== 'react' ||
      p.reaction !== s.reaction ||
      (s.faceCamera && !p.faceCamera) ||
      (s.restart && s.clip === s.reaction && !p.faceCamera);
    if (!fresh) return null;
    return s.reaction === 'Spook' ? 'spook' : 'wave';
  }

  /**
   * His changes of state: running off, being caught or picked up, shaken, thrashing (Thrash
   * starting while he's held: its face is angry, never a shake), dropped, landing, sitting down
   * by himself (not with the tablet), standing up (or getting up from lying), getting the tablet
   * (sitting with it) and lying down with it.
   * @param {NonNullable<TalkIn['state']>} s
   * @param {NonNullable<TalkIn['state']>} p
   * @returns {Trigger[]}
   */
  function changes(s, p) {
    /** @type {Trigger[]} */
    const out = [];
    const entered = (/** @type {string} */ st) => s.state === st && p.state !== st;
    if (entered('flee')) out.push('flee');
    if (entered('held')) out.push(p.state === 'flee' ? 'caught' : 'pickedUp');
    if (s.state === 'held' && p.state === 'held' && s.face === 'surprised' && p.face !== 'surprised')
      out.push('shaken');
    if (s.state === 'held' && s.clip === 'Thrash' && s.restart) out.push('thrash');
    if (s.state === 'fall' && p.state === 'held') out.push('dropped');
    if (s.state === 'land' && p.state === 'fall') out.push('landed');
    if (entered('sitDown') && !s.device && m.t - m.sitPressed > TALK.sitButton + 1e-9) out.push('sitDown');
    if (entered('standUp') || entered('getUp')) out.push('standUp');
    if (entered('deviceSit')) out.push('device');
    if (entered('lieDown')) out.push('lieDown');
    return out;
  }

  /**
   * A walk starting (or a new goal while he walks): a floor tap's, even after getting up first,
   * or a wander.
   * @param {TalkIn} input
   * @param {NonNullable<TalkIn['state']>} s
   * @param {NonNullable<TalkIn['state']>} p
   * @returns {Trigger|null}
   */
  function walking(input, s, p) {
    const floorTap = (input.events ?? []).some((e) => e.type === 'tap' && e.on === 'floor');
    if (floorTap) m.floorTap = m.t;
    if (s.state !== 'walk' || (p.state === 'walk' && !floorTap)) return null;
    const tapped = m.floorTap !== null && m.t - m.floorTap <= TALK.walkWindow + 1e-9;
    m.floorTap = null;
    if (tapped) return 'walkTo';
    return p.state !== 'walk' ? 'wander' : null;
  }

  /**
   * The camera: turned a lot lately (a leaky sum of its turning), or zoomed in close.
   * @param {TalkIn} input
   * @returns {Trigger[]}
   */
  function camera(input) {
    const cam = input.camera;
    /** @type {Trigger[]} */
    const out = [];
    if (!cam) return out;
    if (m.yaw !== null) {
      m.spin = m.spin * Math.exp(-Math.max(0, input.dt) / TALK.spinDecay) + Math.abs(wrapAngle(cam.yaw - m.yaw));
      if (m.spin >= TALK.spinTurns * 2 * Math.PI) {
        out.push('spin');
        m.spin = 0;
      }
    }
    m.yaw = cam.yaw;
    if (cam.zoom >= TALK.zoomAgain) m.zoomArmed = true;
    else if (cam.zoom <= TALK.zoomClose && m.zoomArmed) {
      out.push('zoom');
      m.zoomArmed = false;
    }
    return out;
  }

  /**
   * The idle clock coming round: idle or wandering, an idle line; sitting, a still-sitting one;
   * busy, it tries again a little later.
   * @param {NonNullable<TalkIn['state']>} s
   * @returns {Trigger|null}
   */
  function idleTime(s) {
    if (m.nextIdle === null || m.t < m.nextIdle) return null;
    /** @type {Trigger|null} */
    const k = IDLE_STATES.has(s.state) ? 'idle' : s.state === 'sit' ? 'sitting' : null;
    m.nextIdle = k ? rollIdle(m.t) : m.t + TALK.busyRetry;
    return k;
  }

  /**
   * The moments this frame, from the brain's change of state and the input.
   * @param {TalkIn} input
   * @param {NonNullable<TalkIn['state']>} s
   * @param {NonNullable<TalkIn['state']>} p
   * @returns {Trigger[]}
   */
  function moments(input, s, p) {
    const out = [reaction(s, p), ...changes(s, p), walking(input, s, p), ...camera(input), idleTime(s)];
    return out.filter((k) => k !== null);
  }

  /**
   * One of the trigger's lines at random, never the line just said (null when none is left).
   * @param {Trigger} k
   */
  function pick(k) {
    const list = (lines?.[k] ?? []).filter((l) => l !== m.lastLine);
    return list.length ? list[Math.min(list.length - 1, Math.floor(rng() * list.length))] : null;
  }

  /** The line up now, or null. */
  const up = () => (m.showing && m.t < m.showing.until ? m.showing : null);

  return {
    /**
     * One frame: the moments it finds, the one that matters most first; a moment speaks when its
     * cooldown is over, nothing that matters as much is up, and its chance comes up.
     * @param {TalkIn} input
     * @returns {TalkOut}
     */
    step(input) {
      m.t = input.t;
      const s = input.state;
      const p = input.prevState === undefined ? m.prev : input.prevState;
      m.prev = s;
      if (input.button === 'Sit') m.sitPressed = m.t;
      if (!s) return { say: null, trigger: null };
      if (m.nextIdle === null) m.nextIdle = rollIdle(m.t);
      // (The first frame he's in: nothing has changed yet. The camera starts its count.)
      if (!p) {
        if (input.camera) m.yaw = input.camera.yaw;
        return { say: null, trigger: null };
      }
      const found = moments(input, s, p).sort((a, b) => PRIORITY[b] - PRIORITY[a]);
      for (const k of found) {
        if (m.t < (m.ready[k] ?? -Infinity)) continue;
        const showing = up();
        if (showing && PRIORITY[k] <= showing.priority) continue;
        if (!(rng() < settings[k].chance)) continue;
        const line = pick(k);
        if (!line) continue;
        const until = m.t + lineDuration(line);
        m.showing = { trigger: k, line, priority: PRIORITY[k], until };
        m.ready[k] = m.t + settings[k].cooldown;
        m.lastLine = line;
        m.nextIdle = rollIdle(until);
        return { say: line, trigger: k };
      }
      return { say: null, trigger: null };
    },
    /**
     * Back from a spell the page didn't step him through (the intro): the idle clock starts
     * again from `t`, and no line is up, so he doesn't say an overdue idle line at once.
     * @param {number} t
     */
    rest(t) {
      m.t = t;
      m.showing = null;
      m.nextIdle = rollIdle(t);
    },
    /** What it's doing (for ?test and the specs): the line up, when the idle clock comes round. */
    snapshot() {
      const showing = up();
      return {
        t: m.t,
        showing: showing ? { ...showing } : null,
        lastLine: m.lastLine,
        nextIdle: m.nextIdle,
        ready: { ...m.ready },
      };
    },
  };
}
