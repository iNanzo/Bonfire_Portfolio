// The host window's controller: it holds the one true event, turns the host's actions into
// commands for state.reduce(), saves after every accepted one and posts the public projection to
// the display. Everything it touches is injected (storage, clock, ids, channel), so its logic is
// tested without a browser (test/larpApp.test.mjs). No DOM here; timers live in the DOM layer
// (hostDom.js), which only re-renders.
//
//   createApp({ storage, clock, newId, channel, onChange, storeKey, holding })
//     resume()                  load the saved event (or none); a storage that can't be read
//                               leaves play in memory with saveStatus 'failed'
//     protectUnreadable()       a saved event it can't read (newer, damaged) is never written
//                               over: copied aside, or saving stays off (bootPlan says when)
//     adoptSaved()              Take Over: the saved event, unless this window's own is newer
//     newEvent()                a fresh event in Setup, saved and posted
//     dispatch(type, payload, { mode, actorId, id })   → { ok, error, duplicate, events }
//                               a Command with a fresh id (or `id`, to make a repeated submit
//                               harmless: A05), reduced, then saved and posted when accepted
//     getEvent() getProjection(now) getSaveStatus() lastEvents()
//     readBackup(text)          a backup file → { ok, event, summary } (replaces nothing)
//     replaceEvent(event)       Import's confirmed step: the event saved and posted
//     exportBackup() exportResultsCsv()   the files' text (the CSV with its byte-order mark)
//     deleteEventData()         the saved event removed; a fresh event takes its place
//     broadcast(events)         post the projection now (a display said hello); after a command
//                               it is posted only when something public changed (a draft
//                               award's revision bump never reaches the channel)
//     setActive(active)         another host window holds the lock: refuse commands, post and save
//                               nothing. A window made with `holding: true` takes commands but
//                               saves and posts nothing until setActive() says whether it holds
//                               the lock (what changed meanwhile is then saved and posted, or not)
//     subscribe(fn)             fn(app) after every change (event, save status, lock)
/**
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Command} Command
 * @typedef {import('./types.js').CommandType} CommandType
 * @typedef {import('./types.js').CommandPayloads} CommandPayloads
 * @typedef {import('./types.js').ActorMode} ActorMode
 * @typedef {import('./types.js').GameEvent} GameEvent
 * @typedef {import('./types.js').LarpError} LarpError
 * @typedef {import('./types.js').ErrorCode} ErrorCode
 * @typedef {import('./types.js').Projection} Projection
 * @typedef {import('./types.js').IdGen} IdGen
 * @typedef {import('./store.js').StorageLike} StorageLike
 * @typedef {import('./channel.js').Channel} Channel
 */
import { HOST_GM_ID, larpError } from './types.js';
import { createEvent, projection, reduce } from './state.js';
import { CSV_BOM, createStore, exportBackup, exportResultsCsv, importBackup } from './store.js';
import { publicEvents } from './channel.js';

/**
 * The Saved indicator: 'idle' before anything was saved this session, 'saved' after a good save
 * (`at`), 'failed' when the browser refused (`reason` an ErrorCode: storage_unavailable,
 * storage_failed): play continues in memory and the console offers Export Backup (U06).
 * @typedef {{ state: 'idle' } | { state: 'saved', at: number } | { state: 'failed', reason: ErrorCode, at: number }} SaveStatus
 */

/**
 * dispatch()'s answer: `error` null when accepted (or a repeated id, `duplicate` true).
 * @typedef {{ ok: boolean, error: LarpError|null, duplicate: boolean, events: GameEvent[] }} DispatchResult
 */

/**
 * Who sends a command: the host (default) or a GM in Judge Mode; `id` reuses a command id.
 * @typedef {{ mode?: ActorMode, actorId?: string, id?: string }} DispatchOpts
 */

/**
 * What the host window does with resume()'s answer on boot: 'resume' the saved event, start a
 * 'new' one (nothing saved, or a storage that can't be read at all: nothing to protect), or
 * 'protect' a save it can't read (a newer version's, a damaged one) before starting anew, so that
 * save is never written over (the "saved state never breaks" rule).
 * @param {{ ok: true, event: LarpEvent|null } | { ok: false, reason: ErrorCode }} resumed
 * @returns {'resume'|'new'|'protect'}
 */
export function bootPlan(resumed) {
  if (!('reason' in resumed)) return resumed.event ? 'resume' : 'new';
  return resumed.reason === 'storage_unavailable' ? 'new' : 'protect';
}

/**
 * Whether Take Over should load the saved event in place of the one this window holds: always,
 * unless this window's own is the same event at a newer revision (its saves were refused, so the
 * stored copy is behind it).
 * @param {LarpEvent|null} current
 * @param {LarpEvent|null} saved
 */
export function shouldAdopt(current, saved) {
  if (!saved) return false;
  if (!current) return true;
  return !(saved.id === current.id && saved.revision < current.revision);
}

/**
 * The projection without what changes on its own (the time, the revision): two of these differ
 * only when something the display shows changed.
 * @param {Projection|null} p
 */
const publicKey = (p) => (p ? JSON.stringify({ ...p, revision: 0, now: 0, timerRemainingMs: 0 }) : 'null');

/**
 * @param {{
 *   storage: StorageLike|null|undefined, clock: () => number, newId: IdGen,
 *   channel?: Pick<Channel, 'post'>|null, onChange?: (app: any) => void, storeKey?: string,
 *   holding?: boolean,
 * }} deps holding: save and post nothing until setActive() (a new host window, before it knows
 *   whether an older one holds the event)
 */
export function createApp({ storage, clock, newId, channel = null, onChange, storeKey, holding: hold0 = false }) {
  const store = createStore({ storage, key: storeKey });
  /** @type {LarpEvent|null} */
  let event = null;
  /** @type {SaveStatus} */
  let saveStatus = { state: 'idle' };
  /** @type {GameEvent[]} */
  let last = [];
  let active = true;
  // Before the link knows whether this window holds the lock: commands go on, nothing is saved or
  // posted (`dirty` remembers to, once it does).
  let holding = hold0;
  let dirty = false;
  // A save it couldn't read and couldn't copy aside: saving stays off so it is never overwritten.
  let hold = false;
  /** @type {string|null} the unreadable save's text (Download Unreadable Save) */
  let unreadable = null;
  /** The last projection posted (publicKey), so a command changing nothing public posts nothing. */
  let posted = '';
  /** @type {Set<(app: any) => void>} */
  const listeners = new Set(onChange ? [onChange] : []);

  const changed = () => {
    for (const fn of [...listeners]) fn(app);
  };
  const save = () => {
    if (!event) return;
    if (hold) {
      saveStatus = { state: 'failed', reason: 'storage_failed', at: clock() };
      return;
    }
    const r = store.save(event);
    saveStatus = 'reason' in r ? { state: 'failed', reason: r.reason, at: clock() } : { state: 'saved', at: clock() };
  };
  /** @param {GameEvent[]} [events] @param {boolean} [force] post even when nothing public changed */
  const broadcast = (events = [], force = true) => {
    if (!active || holding || !channel) return;
    const p = event ? projection(event, clock()) : null;
    const pub = publicEvents(events);
    const key = publicKey(p);
    if (!force && !pub.length && key === posted) return;
    posted = key;
    channel.post({ type: 'projection', projection: p, events: pub });
  };
  /** @param {LarpEvent} next @param {GameEvent[]} events */
  const commit = (next, events) => {
    event = next;
    last = events;
    if (active && !holding) {
      save();
      broadcast(events, false);
    } else dirty = true;
    changed();
  };

  const app = {
    /** @returns {{ ok: true, event: LarpEvent|null } | { ok: false, reason: ErrorCode }} */
    resume() {
      const r = store.load();
      if ('reason' in r) {
        saveStatus = { state: 'failed', reason: r.reason, at: clock() };
        changed();
        return { ok: false, reason: r.reason };
      }
      if ('event' in r && r.event) {
        event = r.event;
        last = [];
        broadcast();
      }
      changed();
      return { ok: true, event: 'event' in r ? r.event : null };
    },
    /** @returns {LarpEvent} */
    newEvent() {
      const fresh = createEvent({ id: newId('event'), now: clock() });
      commit(fresh, []);
      return fresh;
    },
    /**
     * Keeps a saved event it can't read from being written over: its text is copied aside to
     * '<key>.unreadable-<time>' (saving then goes on as usual); when even that is refused, saving
     * stays off for this session (play continues in memory; Delete Event Data turns it back on).
     * @returns {{ kept: boolean, copyKey: string|null, saving: boolean }} kept: there was text to keep
     */
    protectUnreadable() {
      try {
        unreadable = storage?.getItem(store.key) ?? null;
      } catch {
        unreadable = null;
      }
      if (unreadable === null) return { kept: false, copyKey: null, saving: true };
      const copyKey = `${store.key}.unreadable-${clock()}`;
      try {
        /** @type {StorageLike} */ (storage).setItem(copyKey, unreadable);
        return { kept: true, copyKey, saving: true };
      } catch {
        hold = true;
        return { kept: true, copyKey: null, saving: false };
      }
    },
    /** The text of the save it couldn't read (protectUnreadable), or null. */
    unreadableText: () => unreadable,
    /**
     * Take Over: load the saved event, unless this window's own is newer (shouldAdopt). A save
     * that can't be read leaves this window's event as it is.
     * @returns {boolean} whether the saved event replaced this window's
     */
    adoptSaved() {
      const r = store.load();
      const saved = 'event' in r ? r.event : null;
      if (!shouldAdopt(event, saved)) {
        changed();
        return false;
      }
      event = saved;
      last = [];
      broadcast();
      changed();
      return true;
    },
    /**
     * @template {CommandType} T
     * @param {T} type
     * @param {CommandPayloads[T]} [payload]
     * @param {DispatchOpts} [opts]
     * @returns {DispatchResult}
     */
    dispatch(type, payload, opts = {}) {
      if (!event) return { ok: false, error: larpError('not_found', 'no event'), duplicate: false, events: [] };
      if (!active) {
        return {
          ok: false,
          error: larpError('forbidden', 'another host window is active'),
          duplicate: false,
          events: [],
        };
      }
      const now = clock();
      /** @type {Command} */
      const command = {
        id: opts.id ?? newId('cmd'),
        type,
        actorId: opts.actorId ?? HOST_GM_ID,
        mode: opts.mode ?? 'host',
        payload: payload ?? {},
        at: now,
      };
      const r = reduce(event, command, { now, newId });
      if (r.error) return { ok: false, error: r.error, duplicate: false, events: [] };
      if (r.duplicate) return { ok: true, error: null, duplicate: true, events: [] };
      commit(r.event, r.events);
      return { ok: true, error: null, duplicate: false, events: r.events };
    },
    getEvent: () => event,
    /** @param {number} [now] @returns {Projection|null} */
    getProjection: (now = clock()) => (event ? projection(event, now) : null),
    getSaveStatus: () => saveStatus,
    /** The game events of the last accepted command (for a cue or an announcement). */
    lastEvents: () => last,
    /** Whether this window holds the event (it saves and posts): not while holding or locked out. */
    isActive: () => active && !holding,
    /** @param {string} text */
    readBackup: (text) => importBackup(text),
    /** @param {LarpEvent} next */
    replaceEvent(next) {
      commit(next, []);
    },
    exportBackup: () => (event ? exportBackup(event) : ''),
    /** Export Results' file text: the CSV after a byte-order mark (spreadsheets then read UTF-8). */
    exportResultsCsv: () => (event ? CSV_BOM + exportResultsCsv(event) : ''),
    deleteEventData() {
      hold = false;
      unreadable = null;
      const r = store.clear();
      if ('reason' in r) saveStatus = { state: 'failed', reason: r.reason, at: clock() };
      app.newEvent();
      return r;
    },
    broadcast,
    /** @param {boolean} on */
    setActive(on) {
      const was = active && !holding;
      active = !!on;
      holding = false;
      if (was === active) return;
      if (active && dirty) {
        dirty = false;
        save();
      }
      if (active) broadcast();
      changed();
    },
    /** @param {(app: any) => void} fn fn(app) after every change */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return app;
}

/** @typedef {ReturnType<typeof createApp>} App */
