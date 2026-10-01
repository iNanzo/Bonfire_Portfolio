// Bonfire Live's preset scenes in a loop: which scene plays next, and when it's due. Pure (no
// three.js, no DOM), like the knights' show: the director asks it at the music's start, on
// phrase lines and at drops, and plays what it hands back through the scene player
// (scenePlayer.js).
//
//   Scenes      Off: the loop never changes anything (a scene picked by hand still plays).
//               Always: a scene at the start, then the next one every Change Every bars
//               (sceneBars, on a phrase line) or at a drop. In the mix: the same, but now and
//               then the next "scene" is a stretch of the free show (the user's own
//               settings), and a free stretch hands back to a scene most of the time.
//   From        Built-In + Mine, Built-In (content.json's, 'b:' refs) or Mine (this
//               browser's, 'm:' refs); a scene switched out of The Loop (sceneList[ref]
//               false) or hidden by the admin never comes round.
//   Order       In Turn (the library's order, round and round) or Shuffled: a deck, dealt
//               out until every scene has played, then shuffled again with its first never
//               the one that just played. Never the same scene twice running (unless it's
//               the only one).
//   when        Change Every N bars: on the phrase lines that are multiples of N (counted
//               from the drop, like every "every N bars" setting; Random rolls a new N at
//               each change, bars.js), once half a stretch (N/2 bars, exactly half
//               included) has played since the scene arrived. A drop brings the next one
//               too, in two steps: the breakdown forges the next scene's blade when half a
//               stretch will have played by the drop (dropDue(ahead): its forge asks about
//               8 bars ahead; nothing is dealt yet, peek()), and the drop itself deals it
//               once a quarter of a stretch really has played (dropReady(): a breakdown
//               shorter than it looked mustn't end a scene after a bar or two). So with
//               16 bars, a scene that arrived on the phrase line where a breakdown begins
//               gives way at that breakdown's drop, 8 bars on. A drop with no blade forged
//               for a scene brings one when both hold at once (half a stretch played).
//               "Only on drops" (0): no phrase lines, and every big drop brings the next
//               one; a breakdown that ends with no big drop (the energy creeping back, a
//               short cut's small drop) brings none either way: the scene forged for stays
//               next (the director's strike()).
//   by hand     N: the next one now, even with Scenes off (next()). ?scene=…&solo: only
//               that one for the session (lock(); N goes back to the loop). A scene picked
//               by hand (Play Now) is where the loop carries on from (jump()).
import { modeOf } from './looks.js';

/** @typedef {{ ref: string, scene: import('../scenes.js').Scene }} SceneEntry */

// In the mix: how likely a scene hands over to a stretch of the free show, and how likely
// a free stretch hands back to a scene.
export const FREE_AFTER_SCENE = 0.3;
export const SCENE_AFTER_FREE = 0.7;

/**
 * The library's scenes that are in the loop: from where Scenes From says (sceneFrom:
 * 'both' | 'builtin' | 'mine'), less those switched out of The Loop (sceneList[ref] ===
 * false) and those the admin hid.
 * @param {SceneEntry[]} entries
 * @param {Record<string, any>} settings
 * @returns {SceneEntry[]}
 */
export function loopEntries(entries, settings) {
  const from = settings.sceneFrom;
  const list = settings.sceneList && typeof settings.sceneList === 'object' ? settings.sceneList : {};
  return (Array.isArray(entries) ? entries : []).filter((e) => {
    if (!e || typeof e.ref !== 'string' || !e.scene) return false;
    const source = e.ref.slice(0, 2);
    if (from === 'builtin' && source !== 'b:') return false;
    if (from === 'mine' && source !== 'm:') return false;
    return list[e.ref] !== false && e.scene.hidden !== true;
  });
}

/**
 * The loop. `settings` is read live (scenes, sceneFrom, sceneOrder, sceneBars, sceneList);
 * `library()` gives every scene there is, in order (the loop filters it: loopEntries);
 * `clock` is the director's bar clock (bars.js, for Change Every's Random).
 * start/advance return a library entry to play, 'free' (the free show) or null (nothing to
 * change).
 * @param {Record<string, any>} settings
 * @param {{ library?: () => SceneEntry[], clock?: { bars: (key: string) => number, reroll: (key: string) => void } | null, rng?: () => number }} [o]
 */
export function createSceneLoop(settings, { library = () => [], clock = null, rng = Math.random } = {}) {
  /** @type {SceneEntry | 'free' | null} */
  let current = null;   // what the loop has playing (null: nothing yet)
  /** @type {SceneEntry | 'free' | null} */
  let upcoming = null;  // peek()'s answer, kept until advance() hands it out
  let deck = [];        // Shuffled: the refs still to be dealt
  let lastRef = null;   // the last scene that played (never twice running)
  let since = 0;        // bars since the last change
  let locked = null;    // ?scene=…&solo: only this ref

  const mode = () => modeOf(settings.scenes, 'mix');
  const entries = () => loopEntries(library(), settings);
  const bars = () => {
    const n = Number(clock ? clock.bars('sceneBars') : settings.sceneBars);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const refOf = (e) => (e && e !== 'free' ? e.ref : null);
  const find = (ref, list = library()) => (ref ? list.find((e) => e?.ref === ref) ?? null : null);

  /** The next scene after `lastRef` in the order the settings say (null: none in the loop). */
  function nextEntry() {
    const list = entries();
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    if (settings.sceneOrder === 'shuffle') {
      const refs = list.map((e) => e.ref);
      deck = deck.filter((r) => refs.includes(r) && r !== lastRef);
      if (!deck.length) {
        deck = refs.slice();
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        // (Never the one that just played first: it goes to the back of the new deck.)
        if (deck[0] === lastRef) deck.push(deck.shift());
      }
      return list.find((e) => e.ref === deck[0]) ?? list[0];
    }
    const at = list.findIndex((e) => e.ref === lastRef);
    return list[(at + 1) % list.length];
  }
  /** What comes next (in the mix, now and then the free show), decided once and kept. */
  function decide() {
    const next = nextEntry();
    if (!next) return null;
    if (mode() !== 'mix') return next;
    const free = current === 'free';
    return (free ? rng() < SCENE_AFTER_FREE : rng() >= FREE_AFTER_SCENE) ? next : 'free';
  }
  /** `e` is playing now: the deck, the count and Change Every's roll move on. */
  function take(e) {
    current = e;
    upcoming = null;
    since = 0;
    const ref = refOf(e);
    if (ref) {
      lastRef = ref;
      deck = deck.filter((r) => r !== ref);
    }
    clock?.reroll('sceneBars');
    return e;
  }
  const active = () => mode() !== 'off' && !lockedNow() && entries().length > 0;
  const lockedNow = () => !!locked && refOf(current) === locked;

  return {
    /** What's playing as far as the loop knows: an entry, 'free' or null. */
    get current() { return current; },
    /** The ref locked for the session (?scene=…&solo), or null. */
    get locked() { return locked; },
    /** Bars since the last change. */
    get since() { return since; },
    /**
     * The music starts: the scene to open with. A scene already playing (picked by hand,
     * ?scene=, locked) carries on; otherwise Always opens with the first (or the deck's
     * first), In the mix rolls a scene or the free show. Null: nothing to change (Off, or
     * nothing in the loop).
     * @returns {SceneEntry | 'free' | null}
     */
    start() {
      since = 0;
      if (locked) {
        const e = find(locked);
        return e ? take(e) : null;
      }
      if (current && current !== 'free') {
        const e = find(current.ref);
        if (e) return take(e);
      }
      if (mode() === 'off' || !entries().length) return null;
      if (mode() === 'on' || rng() < SCENE_AFTER_FREE) {
        upcoming = null;
        return take(nextEntry());
      }
      return take('free');
    },
    /** A bar went by (the director's downbeat). */
    bar() { since++; },
    /**
     * Is a scene change due on the phrase line at `bar` (the downbeat it would land on, the
     * grid's count from the drop)? Change Every's multiples, once half a stretch has played.
     * Never with "only on drops".
     * @param {number} bar
     */
    due(bar) {
      if (!active()) return false;
      const n = bars();
      return n > 0 && bar > 0 && bar % n === 0 && since >= n / 2;
    },
    /**
     * Will the coming (big) drop bring the next scene? Every one with "only on drops"; else
     * once half a stretch will have played by then (`ahead`: bars until the drop, as far as
     * the caller can tell: a breakdown's forge asks about 8 ahead). A forecast: the drop
     * itself confirms it (dropReady).
     * @param {number} [ahead]
     */
    dropDue(ahead = 0) {
      if (!active()) return false;
      const n = bars();
      return n === 0 || current === null || since + ahead >= n / 2;
    },
    /**
     * At the drop itself: may the scene playing give way now? Every drop with "only on
     * drops"; else once a quarter of a stretch has played (a breakdown can be shorter than it
     * looked: no scene lasts a bar or two).
     */
    dropReady() {
      if (!active()) return false;
      const n = bars();
      return n === 0 || current === null || since >= n / 4;
    },
    /** The scene handed out has arrived (its swap landed): its stretch counts from now. */
    arrived() { since = 0; },
    /** What advance() will hand out, without moving on (null: nothing). */
    peek() {
      if (!active()) return null;
      if (upcoming && upcoming !== 'free' && !find(upcoming.ref, entries())) upcoming = null;
      upcoming ??= decide();
      return upcoming;
    },
    /** Move on: the next scene (or, in the mix, maybe the free show). Null: nothing to change. */
    advance() {
      const e = this.peek();
      return e ? take(e) : null;
    },
    /** N: the next scene now, whatever Scenes says (and out of a solo lock). Null: none at all. */
    next() {
      locked = null;
      upcoming = null;
      const e = nextEntry();
      return e ? take(e) : null;
    },
    /** A scene picked by hand is playing (null: the free show): the loop carries on from it. */
    jump(e) {
      take(e && e !== 'free' ? e : 'free');
    },
    /** Only this scene for the session (?scene=…&solo); null lets the loop run again. */
    lock(ref) {
      locked = typeof ref === 'string' && ref ? ref : null;
      upcoming = null;
    },
  };
}
