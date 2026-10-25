// Saving the campfire game in this browser: the game as JSON under localStorage
// 'larp.game', written after every change. A save it can't read (broken, or from a newer
// version) is never written over: it's copied aside under 'larp.game.unreadable' first. The
// first version's event ('larp.event', schema 1: teams with rosters, five category rounds,
// published results) is read once into the new shape: its teams and colors, its rounds' names
// and lengths, and each team's points so far as one carried-over entry; the old key is left
// as it was. Export and Import move a game between laptops as a file.
//
//   loadGame(storage, env)   → { game, from: 'saved'|'old'|'new'|'unreadable' }
//   saveGame(storage, game)  → whether it was written
//   fromOldEvent(event)      the first version's event → a raw game (normalizeGame finishes it)
//   gameFile(game) / readGameFile(text, env)
// Storage is injected (window.localStorage in the page, a Map-backed one in tests); every
// access is in try/catch, so a private window or a full disk only stops the saving.
import { GAME_VERSION, normalizeGame } from './game.js';

export const STORE_KEY = 'larp.game';
export const ASIDE_KEY = 'larp.game.unreadable';
/** The first version's event (src/larp/store.js before the rebuild). */
export const OLD_KEY = 'larp.event';
/** An export file's `app`. */
export const FILE_APP = 'campfire-game';

/** The first version's round categories' English names, for its rounds. */
const OLD_ROUNDS = {
  faith: 'Faith Discovery',
  dance: 'Dance',
  prayer: 'Prayer',
  skit: 'Bible Skit',
  cheer: 'Team Cheer',
};

/**
 * @typedef {{ getItem(k: string): string|null, setItem(k: string, v: string): void }} Storage
 * @typedef {import('./game.js').Game} Game
 */

/** @param {Storage|null} storage @param {string} key */
function read(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
/** @param {Storage|null} storage @param {string} key @param {string} value */
function write(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return !!storage;
  } catch {
    return false;
  }
}

/**
 * The first version's event as a raw new game: its title, teams (name and color), rounds
 * (the category's English name; the preparation time as the countdown), and each team's
 * points so far (published rounds plus corrections) as one "Carried Over" entry.
 * @param {any} ev
 * @returns {Record<string, unknown>|null}
 */
export function fromOldEvent(ev) {
  if (!ev || typeof ev !== 'object' || !Array.isArray(ev.teams)) return null;
  const teams = ev.teams.map((/** @type {any} */ t) => ({
    id: t?.id,
    name: t?.translation || t?.name,
    color: t?.color,
  }));
  const rounds = (Array.isArray(ev.rounds) ? ev.rounds : [])
    .filter((/** @type {any} */ r) => r && !r.skipped)
    .map((/** @type {any} */ r) => ({
      id: r.id,
      name: OLD_ROUNDS[r.category] ?? 'Round',
      durationMs: r.prepMs,
      scene: null,
    }));
  /** @type {Record<string, number>} */
  const totals = {};
  for (const res of Array.isArray(ev.results) ? ev.results : [])
    for (const [id, n] of Object.entries(res?.teamRoundScores ?? {})) totals[id] = (totals[id] ?? 0) + (Number(n) || 0);
  for (const c of Array.isArray(ev.corrections) ? ev.corrections : [])
    if (c?.teamId) totals[c.teamId] = (totals[c.teamId] ?? 0) + (Number(c.points) || 0);
  const log = Object.entries(totals)
    .filter(([, n]) => n !== 0)
    .map(([teamId, n], i) => ({
      id: `carried-${i}`,
      round: 0,
      teamId,
      title: 'Carried Over',
      points: n,
      gain: n,
      mult: 1,
      at: 0,
    }));
  return { title: typeof ev.config?.title === 'string' ? ev.config.title : undefined, teams, rounds, log };
}

/**
 * The saved game, or the first version's carried over, or a new one.
 * @param {Storage|null} storage
 * @param {Partial<import('./game.js').Env>} [env]
 * @returns {{ game: Game, from: 'saved'|'old'|'new'|'unreadable' }}
 */
export function loadGame(storage, env = {}) {
  const text = read(storage, STORE_KEY);
  if (text != null) {
    try {
      const raw = JSON.parse(text);
      if (!raw || typeof raw !== 'object' || !(Number(raw.v) <= GAME_VERSION)) throw new Error('unreadable');
      return { game: normalizeGame(raw, env), from: 'saved' };
    } catch {
      write(storage, ASIDE_KEY, text);
      return { game: normalizeGame(null, env), from: 'unreadable' };
    }
  }
  const old = read(storage, OLD_KEY);
  if (old != null) {
    try {
      const raw = fromOldEvent(JSON.parse(old));
      if (raw) return { game: normalizeGame(raw, env), from: 'old' };
    } catch {
      /* a broken old event: start new, and leave it where it is */
    }
  }
  return { game: normalizeGame(null, env), from: 'new' };
}

/**
 * @param {Storage|null} storage
 * @param {Game} game
 */
export function saveGame(storage, game) {
  // A backup attempted by loadGame may have failed (for example, storage was full).
  // Never replace an unreadable original until its exact contents are safely aside.
  try {
    const text = storage?.getItem(STORE_KEY);
    if (text != null) {
      let readable = false;
      try {
        const raw = JSON.parse(text);
        readable = !!raw && typeof raw === 'object' && Number(raw.v) <= GAME_VERSION;
      } catch {
        // Preserve malformed JSON too.
      }
      if (!readable && read(storage, ASIDE_KEY) !== text && !write(storage, ASIDE_KEY, text)) return false;
    }
  } catch {
    return false;
  }
  return write(storage, STORE_KEY, JSON.stringify(game));
}

/** @param {Game} game */
export const gameFile = (game) => ({ app: FILE_APP, v: GAME_VERSION, game });

/**
 * An exported file's game (or a bare game), or null if it isn't one.
 * @param {string} text
 * @param {Partial<import('./game.js').Env>} [env]
 * @returns {Game|null}
 */
export function readGameFile(text, env = {}) {
  try {
    const raw = JSON.parse(text);
    const game = raw?.app === FILE_APP ? raw.game : raw;
    if (!game || typeof game !== 'object' || !Array.isArray(game.teams) || !(Number(game.v ?? 1) <= GAME_VERSION))
      return null;
    return normalizeGame(game, env);
  } catch {
    return null;
  }
}
