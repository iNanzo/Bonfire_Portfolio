// "My scenes": the scenes made in the Bonfire Painter, kept in this browser and shared by
// the Painter and Bonfire Live (same origin, so the same localStorage).
//
//   scenes      localStorage 'bonfire-scenes': { v, order: [id…], scenes: { id: Scene } },
//               read fresh on every call (another tab may have saved since) and
//               normalized on the way out (scenes.js), so a hand-edited or older entry
//               still plays.
//   thumbnails  'bonfire-scene-thumbs': { ref: WebP data URL }, small (THUMB_MAX), the
//               oldest first in the object. The Painter stores one per saved scene ('m:'
//               refs); Bonfire Live caches one the first time a built-in plays ('b:').
//               They're the first thing to go when the storage is full: a save that
//               doesn't fit drops the oldest thumbnails until it does. Parsed once per
//               stored text (a list of scenes asks for one per row), like the scenes.
//   onChange    another tab (or another store in this one) changed something: a
//               BroadcastChannel message, and the 'storage' event as a fallback for
//               browsers without one (the two are coalesced). This store's own changes
//               tell its listeners at once.
//   play        the Painter's "Play in Bonfire Live": asks an open Bonfire Live tab to
//               play a scene now (onPlay), true if one answered within ANSWER_MS
//               (otherwise the Painter opens a new tab).
// With no localStorage at all (a private window that blocks it) the store keeps the
// scenes in memory for the visit (`persistent` is false), so nothing throws.
import { ID_RE } from './ruleBasics.js';
import { normalizeScene, parseRef, sceneRef, SCENE_VERSION, uniqueSceneId } from './scenes.js';

/** @typedef {import('./scenes.js').Scene} Scene */

export const SCENES_KEY = 'bonfire-scenes';
export const THUMBS_KEY = 'bonfire-scene-thumbs';
/** The longest thumbnail kept: a data URL of a WebP up to 16 KB. */
export const THUMB_MAX = 22000;
/** The most thumbnails kept (the oldest go first). */
export const THUMB_LIMIT = 96;
/** How long play() waits for an open Bonfire Live to answer (ms). */
export const ANSWER_MS = 300;
// Remote changes arriving close together (a message and a storage event for one save)
// are told once.
const COALESCE_MS = 40;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A Storage-shaped map, for when the browser has no localStorage to give. */
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
/** localStorage when the page may use it (reading it throws in some private windows). */
function browserStorage() {
  try {
    const s = globalThis.localStorage;
    s?.getItem(SCENES_KEY);
    return s ?? null;
  } catch {
    return null;
  }
}

/** The storage said no (full, or blocked). */
function fullError(cause) {
  const e = new Error('The browser’s storage is full: delete a scene or two (or their thumbnails), then save again.', { cause });
  e.name = 'StorageFull';
  return e;
}

/**
 * The scene store.
 * @param {{
 *   storage?: { getItem(k: string): string|null, setItem(k: string, v: string): void, removeItem(k: string): void } | null,
 *   channelName?: string,
 *   BroadcastChannel?: any,
 *   events?: { addEventListener: Function, removeEventListener: Function } | null,
 *   answerMs?: number,
 *   voidHex?: string,
 * }} [o]  `storage`: localStorage by default (memory when there's none); `events`: where
 *   'storage' events arrive (the window); `BroadcastChannel`: null to go without;
 *   `voidHex`: the site's void, for scenes on the site's own scenery colors (scenes.js).
 */
export function createSceneStore({
  storage = browserStorage(),
  channelName = 'bonfire-scenes',
  BroadcastChannel: Channel = globalThis.BroadcastChannel,
  events = globalThis.window ?? null,
  answerMs = ANSWER_MS,
  voidHex,
} = {}) {
  const persistent = !!storage;
  const store = storage ?? memoryStorage();
  const listeners = new Set();
  const players = new Set();
  const waiting = new Map(); // play() nonces → settle(answered)
  let pending = null;        // a coalesced remote change: its timer
  let pendingWhat = 'thumbs'; // …and what changed ('scenes' if anything but thumbnails did)
  let cache = { text: /** @type {string|null} */ (null), order: /** @type {string[]} */ ([]), byId: new Map() };
  /** @type {{ text: string|null, map: Readonly<Record<string, string>> }} */
  let thumbCache = { text: null, map: Object.freeze({}) };

  let channel = null;
  try {
    channel = typeof Channel === 'function' ? new Channel(channelName) : null;
    channel?.unref?.(); // (node: never keeps the process alive)
  } catch {
    channel = null;
  }

  const readText = (key) => { try { return store.getItem(key); } catch { return null; } };

  /** The stored scenes: their order and each by id (normalized; cached while the text is the same). */
  function read() {
    const text = readText(SCENES_KEY);
    if (text === cache.text) return cache;
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    const byId = new Map();
    for (const [id, raw] of Object.entries(isObj(data?.scenes) ? data.scenes : {})) {
      if (!ID_RE.test(id) || !isObj(raw)) continue;
      byId.set(id, { ...normalizeScene(raw, { voidHex }), id });
    }
    const listed = Array.isArray(data?.order) ? data.order.filter((id) => typeof id === 'string' && byId.has(id)) : [];
    const order = [...new Set([...listed, ...byId.keys()])];
    cache = { text, order, byId };
    return cache;
  }

  /** The stored thumbnails, oldest first (cached while the text is the same; read-only). */
  function thumbMap() {
    const text = readText(THUMBS_KEY);
    if (text === thumbCache.text) return thumbCache.map;
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    /** @type {Record<string, string>} */
    const out = {};
    if (isObj(data)) for (const [ref, url] of Object.entries(data)) if (parseRef(ref).source && typeof url === 'string') out[ref] = url;
    thumbCache = { text, map: Object.freeze(out) };
    return thumbCache.map;
  }
  /** The thumbnails, oldest first: a copy to change and write back. */
  const readThumbs = () => ({ ...thumbMap() });
  function writeThumbs(thumbs) {
    const text = JSON.stringify(thumbs);
    try {
      if (Object.keys(thumbs).length) store.setItem(THUMBS_KEY, text);
      else store.removeItem(THUMBS_KEY);
      return true;
    } catch {
      return false;
    }
  }
  /** Drop the oldest thumbnail; false when there's none to drop. */
  function dropOldestThumb() {
    const thumbs = readThumbs();
    const [oldest] = Object.keys(thumbs);
    if (!oldest) return false;
    delete thumbs[oldest];
    if (!writeThumbs(thumbs)) { try { store.removeItem(THUMBS_KEY); } catch { /* nothing more to free */ } }
    return true;
  }

  /** Write `text` under `key`, dropping the oldest thumbnails until it fits. */
  function writeWithRoom(key, text) {
    for (;;) {
      try {
        store.setItem(key, text);
        return;
      } catch (e) {
        if (!dropOldestThumb()) throw fullError(e);
      }
    }
  }

  function writeScenes(order, byId) {
    const data = { v: SCENE_VERSION, order, scenes: Object.fromEntries(order.map((id) => [id, byId.get(id)])) };
    writeWithRoom(SCENES_KEY, JSON.stringify(data));
  }

  function emit(detail) { for (const fn of [...listeners]) { try { fn(detail); } catch (e) { console.error(e); } } }
  /** Our own change: tell our listeners now, and the other tabs and stores. */
  function changed(what) {
    emit({ what, remote: false });
    try { channel?.postMessage({ type: 'change', what }); } catch { /* a closed channel */ }
  }
  /** Someone else's change (coalesced: one call for a burst, 'scenes' if any scene changed). */
  function remoteChange(what) {
    if (what === 'scenes') pendingWhat = 'scenes';
    if (pending) return;
    pending = setTimeout(() => {
      const told = pendingWhat;
      pending = null;
      pendingWhat = 'thumbs';
      emit({ what: told, remote: true });
    }, COALESCE_MS);
  }

  function onMessage({ data }) {
    if (!isObj(data)) return;
    if (data.type === 'change') remoteChange(data.what === 'thumbs' ? 'thumbs' : 'scenes');
    else if (data.type === 'play' && typeof data.nonce === 'string') {
      const { source, id } = parseRef(data.ref);
      if (!source || !players.size) return;
      let took = false;
      for (const fn of [...players]) { try { if (fn(sceneRef(source, id)) !== false) took = true; } catch (e) { console.error(e); } }
      if (!took) return;
      try { channel?.postMessage({ type: 'playing', nonce: data.nonce }); } catch { /* closed */ }
    } else if (data.type === 'playing' && typeof data.nonce === 'string') waiting.get(data.nonce)?.(true);
  }
  function onStorage(e) {
    if (e?.key === SCENES_KEY || e?.key === THUMBS_KEY) remoteChange(e.key === THUMBS_KEY ? 'thumbs' : 'scenes');
    else if (e?.key === null) remoteChange('scenes'); // the storage was cleared
  }
  channel?.addEventListener?.('message', onMessage);
  events?.addEventListener?.('storage', onStorage);

  return {
    /** False when the browser keeps nothing (the scenes last for this visit only). */
    persistent,
    /** @returns {Scene[]} My scenes, in their order (copies). */
    list() {
      const { order, byId } = read();
      return order.map((id) => structuredClone(byId.get(id)));
    },
    /** @param {string} id @returns {Scene|null} */
    get(id) {
      const s = read().byId.get(id);
      return s ? structuredClone(s) : null;
    },
    /**
     * Save a scene (normalized) and return what was stored. A scene with an id already
     * stored replaces it; a `fresh` one (new, or a copy: a built-in being edited, a
     * duplicate) or one without a valid id gets an id no other scene has. Throws
     * (name 'StorageFull') when it can't fit even with every thumbnail gone.
     * @param {unknown} scene
     * @param {{ fresh?: boolean }} [o]
     * @returns {Scene}
     */
    save(scene, { fresh = false } = {}) {
      const { order, byId } = read();
      const s = normalizeScene(scene, { voidHex });
      const given = isObj(scene) && typeof (/** @type {any} */ (scene).id) === 'string' && ID_RE.test(/** @type {any} */ (scene).id);
      if ((fresh || !given) && byId.has(s.id)) s.id = uniqueSceneId(s.id, new Set(byId.keys()));
      const next = new Map(byId).set(s.id, s);
      writeScenes(order.includes(s.id) ? order : [...order, s.id], next);
      changed('scenes');
      return structuredClone(s);
    },
    /** Delete a scene (and its thumbnail); throws like save() when the storage refuses. @param {string} id */
    remove(id) {
      const { order, byId } = read();
      if (!byId.has(id)) return;
      const next = new Map(byId);
      next.delete(id);
      writeScenes(order.filter((x) => x !== id), next);
      const thumbs = readThumbs();
      if (Object.hasOwn(thumbs, sceneRef('m', id))) { delete thumbs[sceneRef('m', id)]; writeThumbs(thumbs); }
      changed('scenes');
    },
    /** Put the scenes in this order (ids left out keep theirs, after); throws like save(). @param {string[]} ids */
    reorder(ids) {
      const { order, byId } = read();
      const first = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => byId.has(id)))];
      writeScenes([...first, ...order.filter((id) => !first.includes(id))], byId);
      changed('scenes');
    },
    /** A scene's thumbnail (a data URL), or null. @param {string} ref */
    thumb(ref) {
      const map = thumbMap();
      return typeof ref === 'string' && Object.hasOwn(map, ref) ? map[ref] : null;
    },
    /**
     * Every thumbnail at once ({ ref: data URL }, read-only): one read for a whole list.
     * @returns {Readonly<Record<string, string>>}
     */
    thumbs() {
      return thumbMap();
    },
    /**
     * Keep a thumbnail for a scene ('b:' or 'm:' ref): a data:image URL up to THUMB_MAX
     * long. Drops the oldest ones past THUMB_LIMIT or when the storage is full; false
     * when it couldn't be kept.
     * @param {string} ref
     * @param {string} dataUrl
     */
    setThumb(ref, dataUrl) {
      if (!parseRef(ref).source || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > THUMB_MAX) return false;
      const thumbs = readThumbs();
      delete thumbs[ref];
      thumbs[ref] = dataUrl;
      const refs = Object.keys(thumbs);
      for (const old of refs.slice(0, Math.max(0, refs.length - THUMB_LIMIT))) delete thumbs[old];
      // Make room by dropping older thumbnails, in memory until a write fits (a write that
      // fails changes nothing stored); one that can't fit even alone leaves them all as they were.
      for (;;) {
        if (writeThumbs(thumbs)) break;
        const oldest = Object.keys(thumbs).find((r) => r !== ref);
        if (!oldest) return false;
        delete thumbs[oldest];
      }
      changed('thumbs');
      return true;
    },
    /**
     * Tell `fn({ what: 'scenes'|'thumbs', remote })` when the store changes, here or in
     * another tab. Returns the unsubscribe.
     * @param {(change: { what: string, remote: boolean }) => void} fn
     */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * Ask an open Bonfire Live to play a scene now. Resolves true if one answered within
     * ANSWER_MS, false otherwise (or at once, with no channel to ask on).
     * @param {string} ref
     * @returns {Promise<boolean>}
     */
    play(ref) {
      const { source, id } = parseRef(ref);
      if (!source || !channel) return Promise.resolve(false);
      const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolve) => {
        const settle = (answered) => { clearTimeout(timer); waiting.delete(nonce); resolve(answered); };
        const timer = setTimeout(() => settle(false), answerMs);
        waiting.set(nonce, settle);
        try { channel.postMessage({ type: 'play', ref: sceneRef(source, id), nonce }); } catch { settle(false); }
      });
    },
    /**
     * Bonfire Live's side of play(): `fn(ref)` plays it (returning false turns it down).
     * Returns the unsubscribe.
     * @param {(ref: string) => boolean | void} fn
     */
    onPlay(fn) {
      players.add(fn);
      return () => players.delete(fn);
    },
    /** Stop listening (the channel and the storage events). */
    dispose() {
      clearTimeout(pending);
      pending = null;
      for (const settle of [...waiting.values()]) settle(false);
      channel?.removeEventListener?.('message', onMessage);
      events?.removeEventListener?.('storage', onStorage);
      try { channel?.close(); } catch { /* already closed */ }
      channel = null;
      listeners.clear();
      players.clear();
    },
  };
}
