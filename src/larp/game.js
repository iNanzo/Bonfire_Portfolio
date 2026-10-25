// The campfire game's state: teams (a name and a color), rounds (a name, a countdown and the
// scene the bonfire plays), modifiers (a banner's title and subtitle, points and/or a
// multiplier for the rest of the round, Special to call the knights in, and the fire's
// reaction), the round being played, its timer, and the log of everything awarded.
//
// Scores are the log's sums. An entry keeps what it awarded as it was (its `gain`, after the
// multipliers then active), so editing a modifier later never rewrites the past. A multiplier
// counts from the moment it's given, for that team, to the end of that round; several multiply.
// Undo takes the last entry back.
//
//   newGame()                     the starting setup (two teams, three rounds, four modifiers)
//   normalizeGame(raw)            any value → a valid game; never throws
//   reduce(game, action, env)     → the next game (the same object when nothing changed)
//   standings(game)               teams by score, ties sharing a place (1, 1, 3)
//   activeMults(game)             this round's multipliers, per team
//   gainText(entry)               "+50", "−10", "×2", "+20 ×2" for a banner
// Pure: env = { now, newId } comes from the page (Date.now, crypto ids) or a test.
import { cleanTimer, newTimer, toggle, addTime, MAX_TIMER_MS } from './timer.js';
import { REACTIONS } from './reactions.js';

/** The saved game's version (store.js migrates older shapes). */
export const GAME_VERSION = 1;

/** Teams' colors, handed out in turn. */
export const TEAM_COLORS = Object.freeze([
  '#d9645f',
  '#5fa8d3',
  '#6dbf73',
  '#e8b04a',
  '#a77bd1',
  '#e07b39',
  '#4fc1b0',
  '#d97aa6',
]);

export const LIMITS = Object.freeze({
  teams: 12,
  rounds: 24,
  modifiers: 18,
  name: 32,
  title: 40,
  subtitle: 80,
  points: 100000,
  mult: 10,
  log: 2000,
  knights: 4,
});

/** How long a banner holds, in ms (the Game tab's Banner Time). */
export const BANNER_MS = Object.freeze({ min: 1500, max: 10000, default: 3600 });

/**
 * @typedef {import('./timer.js').Timer} Timer
 * @typedef {{ id: string, name: string, color: string }} Team
 * @typedef {{ id: string, name: string, durationMs: number, scene: string|null }} Round
 * @typedef {{ id: string, title: string, subtitle: string, points: number, mult: number, special: boolean, reaction: string }} Modifier
 * @typedef {{ id: string, round: number, teamId: string, modId: string|null, title: string, subtitle: string,
 *   points: number, mult: number, gain: number, special: boolean, reaction: string, at: number }} Entry
 * @typedef {{ v: number, title: string, bannerMs: number, knightCount: number, reducedMotion: boolean,
 *   teams: Team[], rounds: Round[], modifiers: Modifier[], roundIndex: number, timer: Timer, log: Entry[] }} Game
 * @typedef {{ now: number, newId: () => string }} Env
 */

const MIN = 60 * 1000;

let fallbackId = 0;
/** Ids for tests and old browsers; the page passes crypto.randomUUID. */
export const simpleId = () => `id-${Date.now().toString(36)}-${(++fallbackId).toString(36)}`;

/** @param {Env} [env] */
const ids = (env) => env?.newId ?? simpleId;

/**
 * The starting game: two teams, three five-minute rounds on the site's own bonfire, and four
 * modifiers to show what they can do.
 * @param {Partial<Env>} [env]
 * @returns {Game}
 */
export function newGame(env = {}) {
  const id = env.newId ?? simpleId;
  const rounds = [1, 2, 3].map((n) => ({ id: id(), name: `Round ${n}`, durationMs: 5 * MIN, scene: null }));
  return {
    v: GAME_VERSION,
    title: 'The Campfire Game',
    bannerMs: BANNER_MS.default,
    knightCount: 2,
    reducedMotion: false,
    teams: [
      { id: id(), name: 'Red Team', color: TEAM_COLORS[0] },
      { id: id(), name: 'Blue Team', color: TEAM_COLORS[1] },
    ],
    rounds,
    modifiers: [
      {
        id: id(),
        title: 'Well Played',
        subtitle: 'A fine showing',
        points: 10,
        mult: 1,
        special: false,
        reaction: 'random',
      },
      {
        id: id(),
        title: 'Embers Kindled',
        subtitle: 'The knights answer the call',
        points: 50,
        mult: 1,
        special: true,
        reaction: 'ring',
      },
      {
        id: id(),
        title: 'Twice the Flame',
        subtitle: 'Double points for the rest of the round',
        points: 0,
        mult: 2,
        special: false,
        reaction: 'swap',
      },
      {
        id: id(),
        title: 'Penalty',
        subtitle: 'The fire dims',
        points: -10,
        mult: 1,
        special: false,
        reaction: 'random',
      },
    ],
    roundIndex: 0,
    timer: newTimer(rounds[0].durationMs),
    log: [],
  };
}

// --- Cleaning ------------------------------------------------------------------------------

/** @param {unknown} v @param {number} max @param {string} [fallback] */
const str = (v, max, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);
/** @param {unknown} v @param {number} lo @param {number} hi @param {number} fallback */
const int = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
/** A multiplier: 1 (none) to LIMITS.mult, in halves. @param {unknown} v */
const mult = (v) => {
  const n = Math.round(Number(v) * 2) / 2;
  return Number.isFinite(n) ? Math.min(LIMITS.mult, Math.max(1, n)) : 1;
};
const HEX = /^#[0-9a-f]{6}$/i;
/** @param {unknown} v @param {number} i */
const color = (v, i) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : TEAM_COLORS[i % TEAM_COLORS.length]);
/** @param {unknown} v */
const reaction = (v) => (typeof v === 'string' && Object.hasOwn(REACTIONS, v) ? v : 'random');
/** A scene ref ('b:<id>' built in, 'm:<id>' mine) or null (the site's own bonfire). @param {unknown} v */
const sceneRef = (v) => (typeof v === 'string' && /^[bm]:[\w-]{1,48}$/.test(v) ? v : null);

/** Unique, non-empty ids through a list (a repeat or a blank gets a new one). */
function uniq(list, newId) {
  const seen = new Set();
  return list.map((x) => {
    let id = typeof x.id === 'string' && x.id ? x.id.slice(0, 64) : '';
    if (!id || seen.has(id)) id = newId();
    seen.add(id);
    return { ...x, id };
  });
}

/** @param {any} t @param {number} i @returns {Team} */
const cleanTeam = (t, i) => ({
  id: t?.id,
  name: str(t?.name, LIMITS.name) || `Team ${i + 1}`,
  color: color(t?.color, i),
});
/** @param {any} r @param {number} i @returns {Round} */
const cleanRound = (r, i) => ({
  id: r?.id,
  name: str(r?.name, LIMITS.name) || `Round ${i + 1}`,
  durationMs: int(r?.durationMs, 0, MAX_TIMER_MS, 5 * MIN),
  scene: sceneRef(r?.scene),
});
/** @param {any} m @param {number} i @returns {Modifier} */
const cleanModifier = (m, i) => ({
  id: m?.id,
  title: str(m?.title, LIMITS.title) || `Modifier ${i + 1}`,
  subtitle: str(m?.subtitle, LIMITS.subtitle),
  points: int(m?.points, -LIMITS.points, LIMITS.points, 0),
  mult: mult(m?.mult),
  special: m?.special === true,
  reaction: reaction(m?.reaction),
});

/**
 * Any value as a valid game: what's missing filled from newGame(), numbers clamped, lists
 * capped, ids made unique, log entries for a team that's gone dropped. Never throws.
 * @param {any} raw
 * @param {Partial<Env>} [env]
 * @returns {Game}
 */
export function normalizeGame(raw, env = {}) {
  const base = newGame(env);
  if (!raw || typeof raw !== 'object') return base;
  const newId = env.newId ?? simpleId;
  const list = (/** @type {unknown} */ v, /** @type {number} */ max) => (Array.isArray(v) ? v.slice(0, max) : null);
  const teams = uniq((list(raw.teams, LIMITS.teams) ?? base.teams).map(cleanTeam), newId);
  const roundsIn = list(raw.rounds, LIMITS.rounds);
  const rounds = uniq((roundsIn?.length ? roundsIn : base.rounds).map(cleanRound), newId);
  const modifiers = uniq((list(raw.modifiers, LIMITS.modifiers) ?? base.modifiers).map(cleanModifier), newId);
  const roundIndex = int(raw.roundIndex, 0, rounds.length - 1, 0);
  const teamIds = new Set(teams.map((t) => t.id));
  const log = (list(raw.log, LIMITS.log) ?? [])
    .filter((e) => e && teamIds.has(e.teamId))
    .map((e) => {
      const m = cleanModifier(e, 0);
      return {
        id: typeof e.id === 'string' ? e.id : newId(),
        round: int(e.round, 0, LIMITS.rounds - 1, 0),
        teamId: e.teamId,
        modId: typeof e.modId === 'string' ? e.modId : null,
        title: m.title,
        subtitle: m.subtitle,
        points: m.points,
        mult: m.mult,
        gain: int(e.gain, -LIMITS.points * 1000, LIMITS.points * 1000, m.points),
        special: m.special,
        reaction: m.reaction,
        at: Number.isFinite(e.at) ? e.at : 0,
      };
    });
  return {
    v: GAME_VERSION,
    title: str(raw.title, LIMITS.title) || base.title,
    bannerMs: int(raw.bannerMs, BANNER_MS.min, BANNER_MS.max, BANNER_MS.default),
    knightCount: int(raw.knightCount, 1, LIMITS.knights, base.knightCount),
    reducedMotion: raw.reducedMotion === true,
    teams,
    rounds,
    modifiers,
    roundIndex,
    timer: cleanTimer(raw.timer, rounds[roundIndex].durationMs),
    log,
  };
}

// --- Reading -------------------------------------------------------------------------------

/**
 * Each team's score.
 * @param {Game} game
 * @returns {Map<string, number>}
 */
export function scores(game) {
  const out = new Map(game.teams.map((t) => [t.id, 0]));
  for (const e of game.log) if (out.has(e.teamId)) out.set(e.teamId, (out.get(e.teamId) ?? 0) + e.gain);
  return out;
}

/**
 * The teams by score, highest first (ties keep the setup's order and share a place: 1, 1, 3).
 * @param {Game} game
 * @returns {{ team: Team, score: number, place: number }[]}
 */
export function standings(game) {
  const s = scores(game);
  const rows = game.teams.map((team, i) => ({ team, score: s.get(team.id) ?? 0, i }));
  rows.sort((a, b) => b.score - a.score || a.i - b.i);
  return rows.map((r) => ({ team: r.team, score: r.score, place: rows.findIndex((x) => x.score === r.score) + 1 }));
}

/**
 * The multiplier on a team's points right now in round `round` (1: none).
 * @param {Game} game
 * @param {string} teamId
 * @param {number} [round]
 */
export function multOf(game, teamId, round = game.roundIndex) {
  let m = 1;
  for (const e of game.log) if (e.round === round && e.teamId === teamId && e.mult > 1) m *= e.mult;
  return Math.min(LIMITS.mult ** 2, m);
}

/**
 * This round's multipliers, per team that has one: { team, mult }.
 * @param {Game} game
 * @returns {{ team: Team, mult: number }[]}
 */
export function activeMults(game) {
  return game.teams.map((team) => ({ team, mult: multOf(game, team.id) })).filter((x) => x.mult > 1);
}

/** A whole number with its sign ("+50", "−10", "0"). @param {number} n */
export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
/** A multiplier as written ("×2", "×1.5"). @param {number} m */
export const times = (m) => `×${m}`;

/**
 * What an entry gave, for its banner: its gain (after the multipliers then active) and the
 * multiplier it starts; "0" for neither.
 * @param {Pick<Entry, 'gain'|'mult'>} e
 */
export function gainText(e) {
  const parts = [];
  if (e.gain !== 0) parts.push(signed(e.gain));
  if (e.mult > 1) parts.push(times(e.mult));
  return parts.join(' ') || '0';
}

/** @param {Game} game */
export const currentRound = (game) => game.rounds[game.roundIndex] ?? game.rounds[0];

// --- Changing ------------------------------------------------------------------------------

/**
 * @typedef {{ type: 'award', teamId: string, modId?: string|null, points?: number, title?: string, subtitle?: string }
 *   | { type: 'undo' }
 *   | { type: 'round', index: number }
 *   | { type: 'timer', op: 'toggle'|'reset'|'add', ms?: number }
 *   | { type: 'set', key: 'title'|'bannerMs'|'knightCount'|'reducedMotion', value: unknown }
 *   | { type: 'add', list: 'teams'|'rounds'|'modifiers' }
 *   | { type: 'edit', list: 'teams'|'rounds'|'modifiers', id: string, key: string, value: unknown }
 *   | { type: 'remove', list: 'teams'|'rounds'|'modifiers', id: string }
 *   | { type: 'move', list: 'teams'|'rounds'|'modifiers', id: string, by: number }
 *   | { type: 'clearScores' }
 *   | { type: 'replace', game: unknown }} Action
 */

const CLEAN = { teams: cleanTeam, rounds: cleanRound, modifiers: cleanModifier };
const EDITABLE = {
  teams: ['name', 'color'],
  rounds: ['name', 'durationMs', 'scene'],
  modifiers: ['title', 'subtitle', 'points', 'mult', 'special', 'reaction'],
};

/** @typedef {(game: Game, action: any, now: number, newId: () => string, env: Partial<Env>) => Game} Handler */

/** @type {Record<string, Handler>} */
const HANDLERS = {
  award(game, action, now, newId) {
    if (!game.teams.some((t) => t.id === action.teamId) || game.log.length >= LIMITS.log) return game;
    const mod = action.modId ? game.modifiers.find((m) => m.id === action.modId) : null;
    if (action.modId && !mod) return game;
    const base =
      mod ??
      cleanModifier({ title: action.title || 'Points', subtitle: action.subtitle ?? '', points: action.points }, 0);
    if (!mod && base.points === 0) return game;
    /** @type {Entry} */
    const entry = {
      id: newId(),
      round: game.roundIndex,
      teamId: action.teamId,
      modId: mod?.id ?? null,
      title: base.title,
      subtitle: base.subtitle,
      points: base.points,
      mult: base.mult,
      gain: Math.round(base.points * multOf(game, action.teamId)),
      special: base.special,
      reaction: base.reaction,
      at: now,
    };
    return { ...game, log: [...game.log, entry] };
  },
  undo: (game) => (game.log.length ? { ...game, log: game.log.slice(0, -1) } : game),
  round(game, action) {
    const index = Math.round(Number(action.index));
    if (!Number.isFinite(index) || index < 0 || index >= game.rounds.length || index === game.roundIndex) return game;
    return { ...game, roundIndex: index, timer: newTimer(game.rounds[index].durationMs) };
  },
  timer(game, action, now) {
    if (action.op === 'toggle') return { ...game, timer: toggle(game.timer, now) };
    if (action.op === 'reset') return { ...game, timer: newTimer(currentRound(game).durationMs) };
    if (action.op !== 'add') return game;
    const t = addTime(game.timer, Math.round(Number(action.ms)), now);
    return t === game.timer ? game : { ...game, timer: t };
  },
  set(game, action, _now, _id, env) {
    if (!['title', 'bannerMs', 'knightCount', 'reducedMotion'].includes(action.key)) return game;
    const next = normalizeGame({ ...game, [action.key]: action.value }, env);
    return next[action.key] === game[action.key] ? game : { ...game, [action.key]: next[action.key] };
  },
  add(game, action, _now, newId) {
    const list = game[action.list];
    if (!Array.isArray(list) || list.length >= LIMITS[action.list]) return game;
    /** @type {any} */
    const item = { ...CLEAN[action.list]({}, list.length), id: newId() };
    if (action.list === 'teams')
      item.color = TEAM_COLORS.find((c) => !game.teams.some((t) => t.color === c)) ?? item.color;
    return { ...game, [action.list]: [...list, item] };
  },
  edit(game, action) {
    const list = game[action.list];
    const at = Array.isArray(list) ? list.findIndex((x) => x.id === action.id) : -1;
    if (at < 0 || !EDITABLE[action.list].includes(action.key)) return game;
    /** @type {any} */
    const item = { ...CLEAN[action.list]({ ...list[at], [action.key]: action.value }, at), id: action.id };
    const copy = [...list];
    copy[at] = item;
    const next = { ...game, [action.list]: copy };
    // (The round being played got a new length while its timer hasn't started: the timer follows.)
    if (
      action.list === 'rounds' &&
      at === game.roundIndex &&
      action.key === 'durationMs' &&
      game.timer.status === 'idle'
    )
      next.timer = newTimer(item.durationMs);
    return next;
  },
  remove(game, action) {
    const list = game[action.list];
    const at = Array.isArray(list) ? list.findIndex((x) => x.id === action.id) : -1;
    if (at < 0 || (action.list !== 'modifiers' && list.length <= 1)) return game;
    const next = { ...game, [action.list]: list.filter((/** @type {any} */ x) => x.id !== action.id) };
    if (action.list === 'teams') next.log = game.log.filter((e) => e.teamId !== action.id);
    if (action.list !== 'rounds') return next;
    // Entries keep their round's place: those after the removed one move up, its own go.
    next.log = game.log.filter((e) => e.round !== at).map((e) => (e.round > at ? { ...e, round: e.round - 1 } : e));
    const ri = game.roundIndex > at || game.roundIndex === next.rounds.length ? game.roundIndex - 1 : game.roundIndex;
    next.roundIndex = Math.max(0, ri);
    if (at === game.roundIndex) next.timer = newTimer(next.rounds[next.roundIndex].durationMs);
    return next;
  },
  move(game, action) {
    const list = game[action.list];
    const at = Array.isArray(list) ? list.findIndex((x) => x.id === action.id) : -1;
    const to = at + Math.sign(Number(action.by) || 0);
    if (at < 0 || to < 0 || to >= list.length || to === at) return game;
    const copy = [...list];
    [copy[at], copy[to]] = [copy[to], copy[at]];
    const next = { ...game, [action.list]: copy };
    if (action.list !== 'rounds') return next;
    const swap = (/** @type {number} */ r) => (r === at ? to : r === to ? at : r);
    next.log = game.log.map((e) => (e.round === at || e.round === to ? { ...e, round: swap(e.round) } : e));
    next.roundIndex = swap(game.roundIndex);
    return next;
  },
  clearScores: (game) => ({ ...game, log: [], roundIndex: 0, timer: newTimer(game.rounds[0].durationMs) }),
  replace: (_game, action, _now, _id, env) => normalizeGame(action.game, env),
};

/**
 * The game after `action`. An action that can't apply (an unknown team, a full list, the
 * last round removed) returns `game` itself, so the page can tell nothing happened.
 * @param {Game} game
 * @param {Action} action
 * @param {Partial<Env>} [env]
 * @returns {Game}
 */
export function reduce(game, action, env = {}) {
  const handler = action && Object.hasOwn(HANDLERS, action.type) ? HANDLERS[action.type] : null;
  return handler ? handler(game, action, env.now ?? Date.now(), ids(/** @type {Env} */ (env)), env) : game;
}
