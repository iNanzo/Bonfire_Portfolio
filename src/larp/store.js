// Saving the campfire game: the event as JSON with its schema version, migrations for older
// saves (like src/scenes.js MIGRATIONS), an injected localStorage-like storage, backup export
// and import, and the results CSV. Pure apart from the storage it's handed; failures come back
// as { ok: false, reason }, never thrown.
//
//   serialize(event) / deserialize(json)   JSON text ⇄ event (migrated, checked)
//   migrate(raw)            an older saved shape stepped up to SCHEMA_VERSION (MIGRATIONS[v])
//   createStore({ storage, key })   save / load / clear under the 'larp.' key prefix
//   exportBackup(event)     the whole event (private notes included) as a backup file's text
//   importBackup(text)      a backup (or a bare saved event) → the event and a summary
//   exportResultsCsv(event) published scores and award reasons; no notes, drafts or authors
/**
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').ErrorCode} ErrorCode
 * @typedef {import('./types.js').EventPhase} EventPhase
 * @typedef {import('./types.js').RoundPhase} RoundPhase
 * @typedef {import('./types.js').Timer} Timer
 */
import {
  COMPLETION_STATUSES,
  DISPLAY_MODES,
  EVENT_PHASES,
  ROUND_CATEGORIES,
  ROUND_KEYS,
  ROUND_PHASES,
  SCENERY_KEYS,
  SCHEMA_VERSION,
} from './types.js';
import { LANGS } from './strings.js';
import { exactSum, memberTotals, rank, standings, totalsSafe } from './scoring.js';
import { revealSteps } from './phases.js';

/** The default storage key (the game's own 'larp.' prefix; never another app's keys). */
export const STORE_KEY = 'larp.event';

/** The `app` marker of a backup file. */
export const BACKUP_APP = 'nghia-si-campfire';

/**
 * A failure: `reason` is an ErrorCode ('storage_unavailable', 'storage_failed', 'bad_json',
 * 'bad_backup', 'newer_version').
 * @typedef {{ ok: false, reason: ErrorCode, message?: string }} StoreFailure
 * @typedef {{ ok: true } | StoreFailure} StoreResult
 * @typedef {{ ok: true, event: LarpEvent } | StoreFailure} EventResult
 * @typedef {{ ok: true, event: LarpEvent|null } | StoreFailure} LoadResult
 */

/**
 * The part of the Web Storage API the store uses (localStorage, or a test double).
 * @typedef {{ getItem(key: string): string|null, setItem(key: string, value: string): void, removeItem(key: string): void }} StorageLike
 */

/**
 * A store over injected storage. save() after every command; load() gives null when nothing is
 * saved; a storage that's missing or throws gives a StoreFailure (play continues in memory).
 * @typedef {{ key: string, save(event: LarpEvent): StoreResult, load(): LoadResult, clear(): StoreResult }} Store
 */

/**
 * What Import shows before replacing anything.
 * @typedef {{
 *   title: string, teams: number, members: number, gms: number, roundsPublished: number,
 *   phase: EventPhase, roundIndex: number, roundPhase: RoundPhase|null, updatedAt: number,
 * }} BackupSummary
 */

// ── Migrations ───────────────────────────────────────────────────────────────────────────────

/**
 * The idle timer a phase without one has.
 * @returns {Timer}
 */
const noTimer = () => ({ kind: null, status: 'idle', durationMs: 0, deadline: null, remainingMs: null });

/**
 * The pre-release (schemaVersion 0) timer { kind, running, endsAt, remainingMs, durationMs } as
 * a Timer: running → its deadline (never restarted), stopped with time left → paused, otherwise
 * idle at its full duration.
 * @param {any} t
 * @returns {any}
 */
function timerFromV0(t) {
  if (!isObj(t)) return noTimer();
  const kind = t.kind ?? null;
  const durationMs = Number.isSafeInteger(t.durationMs) ? t.durationMs : 0;
  if (t.running && t.endsAt != null)
    return { kind, status: 'running', durationMs, deadline: t.endsAt, remainingMs: null };
  if (t.remainingMs != null) return { kind, status: 'paused', durationMs, deadline: null, remainingMs: t.remainingMs };
  if (kind === null) return noTimer();
  return { kind, status: 'idle', durationMs, deadline: null, remainingMs: durationMs };
}

/**
 * Older saved shapes, each one step up: MIGRATIONS[v](event) → the event as version v + 1 (the
 * caller sets schemaVersion). Each step builds new objects and only fills what's missing, so a
 * field already in the newer shape is kept. A future format change adds MIGRATIONS[1] and a test
 * that loads a version-1 save.
 *
 * 0 → 1: the pre-release prototype's saves had no corrections, history, seen command ids or
 * reveal; teams had no admittedRound (all were set-up teams: 0), rounds no admittedTeams, awards
 * (drafts and the frozen copies in published results alike) no batchId (each its own batch) or
 * duplicateReason, the config no showMembers or hostPin, and the timer was { running, endsAt,
 * remainingMs }. A save made mid-reveal gets its reveal rebuilt from the first banner.
 * @type {Readonly<Record<number, (raw: any) => any>>}
 */
export const MIGRATIONS = Object.freeze({
  0: (/** @type {any} */ e) => {
    const next = {
      ...e,
      config: isObj(e.config) ? { showMembers: false, hostPin: null, ...e.config } : e.config,
      teams: Array.isArray(e.teams) ? e.teams.map((t) => (isObj(t) ? { admittedRound: 0, ...t } : t)) : e.teams,
      rounds: Array.isArray(e.rounds) ? e.rounds.map((r) => (isObj(r) ? { admittedTeams: [], ...r } : r)) : e.rounds,
      adjustments: awardsFromV0(e.adjustments),
      results: Array.isArray(e.results)
        ? e.results.map((r) => (isObj(r) ? { ...r, adjustments: awardsFromV0(r.adjustments) } : r))
        : e.results,
      corrections: e.corrections ?? [],
      history: e.history ?? [],
      seenCommandIds: e.seenCommandIds ?? [],
      reveal: e.reveal ?? null,
      timer: isObj(e.timer) && 'status' in e.timer ? e.timer : timerFromV0(e.timer),
    };
    return { ...next, reveal: next.reveal ?? revealFromV0(next) };
  },
});

/**
 * Awards as v0 kept them (no batchId or duplicateReason) with those filled: each its own batch,
 * no reason. Anything that isn't a list of objects is left for the shape check to refuse.
 * @param {any} list
 * @returns {any}
 */
function awardsFromV0(list) {
  return Array.isArray(list)
    ? list.map((a) => (isObj(a) ? { batchId: `batch-${a.id}`, duplicateReason: null, ...a } : a))
    : list;
}

/**
 * The reveal of a v0 save made in Reveal (v0 kept no reveal position): the current round's
 * reveal from its first banner, as if just published. null outside Reveal, or when the round
 * has no result (the shape check then refuses the save).
 * @param {any} e the event with everything else already migrated
 * @returns {any}
 */
function revealFromV0(e) {
  if (e.roundPhase !== 'reveal' || !Array.isArray(e.rounds) || !Array.isArray(e.results)) return null;
  const round = e.rounds[e.roundIndex];
  if (!isObj(round) || !e.results.some((/** @type {any} */ r) => isObj(r) && r.roundId === round.id)) return null;
  const total = revealSteps(e, round.id).length;
  const at = Number.isSafeInteger(e.updatedAt) ? e.updatedAt : 0;
  return { roundId: round.id, step: 0, total, paused: false, stepStartedAt: at };
}

/**
 * A saved object's schema version: its schemaVersion, or 1 when it has none (the first release
 * always wrote one; a bare event without it is read as the first release's shape).
 * @param {Record<string, any>} raw
 */
const versionOf = (raw) => (raw.schemaVersion === undefined ? 1 : raw.schemaVersion);

/**
 * Steps an older saved event up to SCHEMA_VERSION through MIGRATIONS[v] (each v → v + 1). A
 * missing schemaVersion is read as 1. Exported so tests can load each old shape. Never mutates
 * `raw`; a current (or unreadable) value comes back as it is.
 * @param {any} raw
 * @returns {any}
 */
export function migrate(raw) {
  if (!isObj(raw)) return raw;
  let v = versionOf(raw);
  if (!Number.isSafeInteger(v)) return raw;
  let e = raw;
  while (v < SCHEMA_VERSION && MIGRATIONS[v]) {
    e = { ...MIGRATIONS[v](e), schemaVersion: v + 1 };
    v++;
  }
  return e;
}

// ── Shape checks (imported text is data: every field is checked, nothing is run) ──────────────

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObj(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * A validator: null when `v` fits, else the path of the first field that doesn't.
 * @typedef {(v: any, path: string) => string|null} Validator
 */

/** @param {(v: any) => boolean} pred @returns {Validator} */
const is = (pred) => (v, path) => (pred(v) ? null : path);
const str = is((v) => typeof v === 'string');
const bool = is((v) => typeof v === 'boolean');
const int = is(Number.isSafeInteger);
const nonNegInt = is((v) => Number.isSafeInteger(v) && v >= 0);
const id = is((v) => typeof v === 'string' && v.length > 0);
/** @param {readonly any[]} values @returns {Validator} */
const oneOf = (values) => is((v) => values.includes(v));
/** @param {Validator} check @returns {Validator} */
const maybe = (check) => (v, path) => (v === null ? null : check(v, path));

/** @param {Record<string, Validator>} fields @returns {Validator} */
const record = (fields) => (v, path) => {
  if (!isObj(v)) return path;
  for (const [key, check] of Object.entries(fields)) {
    const bad = check(v[key], `${path}.${key}`);
    if (bad) return bad;
  }
  return null;
};

/** @param {Validator} item @param {string} [unique] a key each item must hold a different value of @returns {Validator} */
const list = (item, unique) => (v, path) => {
  if (!Array.isArray(v)) return path;
  const seen = new Set();
  for (let i = 0; i < v.length; i++) {
    const bad = item(v[i], `${path}[${i}]`);
    if (bad) return bad;
    if (unique) {
      if (seen.has(v[i][unique])) return `${path}[${i}].${unique} (repeated)`;
      seen.add(v[i][unique]);
    }
  }
  return null;
};

/** @param {Validator} value @returns {Validator} */
const dict = (value) => (v, path) => {
  if (!isObj(v)) return path;
  for (const [key, item] of Object.entries(v)) {
    const bad = value(item, `${path}.${key}`);
    if (bad) return bad;
  }
  return null;
};

const recipientType = oneOf(['team', 'member']);
const ids = list(str);

const configShape = record({
  title: str,
  displayMode: oneOf(DISPLAY_MODES),
  hostLang: oneOf(LANGS),
  scenery: oneOf(SCENERY_KEYS),
  reducedMotion: bool,
  sound: bool,
  showMembers: bool,
  hostPin: maybe(str),
  targetMs: nonNegInt,
  openingMs: nonNegInt,
  finaleMs: nonNegInt,
  bufferMs: nonNegInt,
});

const teamShape = record({
  id,
  name: str,
  translation: str,
  color: str,
  emblem: str,
  patron: str,
  admittedRound: nonNegInt,
});

const memberShape = record({ id, name: str, teamId: str, captain: bool });
const gmShape = record({ id, name: str, host: bool });

const roundShape = record({
  id,
  category: oneOf(ROUND_KEYS),
  prompt: str,
  promptTranslation: str,
  base: int,
  prepMs: nonNegInt,
  turnMs: nonNegInt,
  transitionMs: nonNegInt,
  reviewRevealMs: nonNegInt,
  order: ids,
  statuses: dict(oneOf(COMPLETION_STATUSES)),
  skipped: bool,
  admittedTeams: ids,
});

const adjustmentShape = record({
  id,
  roundId: str,
  recipientType,
  recipientId: str,
  name: str,
  translation: str,
  points: int,
  authorId: str,
  note: str,
  batchId: str,
  status: oneOf(['draft', 'published', 'discarded']),
  duplicateReason: maybe(str),
  createdAt: int,
  updatedAt: int,
});

const publishedAdjustmentShape = record({
  id,
  roundId: str,
  recipientType,
  recipientId: str,
  recipientName: str,
  teamId: str,
  name: str,
  translation: str,
  points: int,
  authorId: str,
  note: str,
  batchId: str,
  duplicateReason: maybe(str),
});

const resultShape = record({
  roundId: id,
  roundIndex: nonNegInt,
  base: int,
  commandId: str,
  completion: dict(record({ status: oneOf(COMPLETION_STATUSES), points: int })),
  adjustments: list(publishedAdjustmentShape),
  teamRoundScores: dict(int),
  publishedAt: int,
});

const correctionShape = record({
  id,
  recipientType,
  recipientId: str,
  recipientName: str,
  teamId: str,
  points: int,
  reason: str,
  translation: str,
  note: str,
  roundId: maybe(str),
  targetAdjustmentId: maybe(str),
  authorId: str,
  createdAt: int,
});

const timerShape = record({
  kind: maybe(oneOf(['preparation', 'turn'])),
  status: oneOf(['idle', 'running', 'paused']),
  durationMs: nonNegInt,
  deadline: maybe(int),
  remainingMs: maybe(int),
});

const revealShape = record({ roundId: str, step: nonNegInt, total: nonNegInt, paused: bool, stepStartedAt: int });

const historyShape = record({
  revision: nonNegInt,
  commandId: str,
  type: str,
  actorId: str,
  mode: oneOf(['host', 'judge']),
  at: int,
  ids,
});

const eventShape = record({
  id,
  schemaVersion: oneOf([SCHEMA_VERSION]),
  revision: nonNegInt,
  createdAt: int,
  updatedAt: int,
  startedAt: maybe(int),
  finishedAt: maybe(int),
  phase: oneOf(EVENT_PHASES),
  roundIndex: is((v) => Number.isSafeInteger(v) && v >= -1),
  roundPhase: maybe(oneOf(ROUND_PHASES)),
  currentTurn: is((v) => Number.isSafeInteger(v) && v >= -1),
  config: configShape,
  teams: list(teamShape, 'id'),
  roster: list(memberShape, 'id'),
  gms: list(gmShape, 'id'),
  rounds: list(roundShape, 'id'),
  adjustments: list(adjustmentShape, 'id'),
  results: list(resultShape, 'roundId'),
  corrections: list(correctionShape, 'id'),
  timer: timerShape,
  reveal: maybe(revealShape),
  seenCommandIds: ids,
  history: list(historyShape),
});

/**
 * Where a migrated event breaks the contract (a field path and what's wrong), or null.
 * @param {any} e
 * @returns {string|null}
 */
function eventProblem(e) {
  const bad = eventShape(e, 'event');
  if (bad) return `${bad} is missing or malformed`;
  if (!e.rounds.length) return 'event.rounds is empty';
  if (e.roundIndex >= e.rounds.length) return 'event.roundIndex is past the last round';
  if (e.gms.filter((g) => g.host).length !== 1) return 'event.gms needs exactly one host';
  for (const [i, result] of e.results.entries()) {
    const problem = resultProblem(e, result);
    if (problem) return `event.results[${i}] ${problem}`;
  }
  if (!totalsSafe(e)) return 'a derived total is outside the safe integer range';
  return revealProblem(e);
}

/**
 * Where a published result disagrees with itself or the rounds: it must name a round that isn't
 * skipped; each team's completion points must be the base when 'complete' and 0 otherwise; and
 * teamRoundScores must hold exactly the completion's teams, each the completion points plus that
 * team's team awards in the result (what publishRound froze, and what the totals sum).
 * @param {LarpEvent} e
 * @param {import('./types.js').PublishedResult} result
 * @returns {string|null}
 */
function resultProblem(e, result) {
  const round = e.rounds.find((r) => r.id === result.roundId);
  if (!round) return `names no round (${result.roundId})`;
  if (round.skipped) return `is for a skipped round (${result.roundId})`;
  const teams = Object.keys(result.completion);
  for (const [teamId, c] of Object.entries(result.completion)) {
    if (c.points !== (c.status === 'complete' ? result.base : 0))
      return `.completion.${teamId}.points does not match its status and base`;
    if (!Object.hasOwn(result.teamRoundScores, teamId)) return `.teamRoundScores.${teamId} is missing`;
    const awards = result.adjustments.filter((a) => a.recipientType === 'team' && a.recipientId === teamId);
    const score = exactSum([c.points, ...awards.map((a) => a.points)]);
    if (result.teamRoundScores[teamId] !== score) return `.teamRoundScores.${teamId} is not completion + team awards`;
  }
  const extra = Object.keys(result.teamRoundScores).find((teamId) => !teams.includes(teamId));
  return extra ? `.teamRoundScores.${extra} has no completion` : null;
}

/**
 * Where the reveal disagrees with the phase: Reveal needs a reveal of the current round, which
 * must have a result, at a step before its total; every other phase has none.
 * @param {LarpEvent} e
 * @returns {string|null}
 */
function revealProblem(e) {
  const inReveal = e.phase === 'running' && e.roundPhase === 'reveal';
  if (!e.reveal) return inReveal ? 'event.reveal is missing in Reveal' : null;
  if (!inReveal) return 'event.reveal is set outside Reveal';
  const round = e.rounds[e.roundIndex];
  if (!round || e.reveal.roundId !== round.id) return 'event.reveal is not the current round’s';
  if (!e.results.some((r) => r.roundId === round.id)) return 'event.reveal is for a round with no result';
  if (e.reveal.step >= e.reveal.total) return 'event.reveal.step is past its total';
  return null;
}

// ── Reading ──────────────────────────────────────────────────────────────────────────────────

/**
 * @param {ErrorCode} reason
 * @param {string} [message]
 * @returns {StoreFailure}
 */
const fail = (reason, message = reason) => ({ ok: false, reason, message });

/**
 * JSON text → a value, keeping only data: `__proto__` keys are dropped so nothing read can
 * reach an object's prototype later.
 * @param {unknown} text
 * @returns {{ ok: true, value: any } | StoreFailure}
 */
function parse(text) {
  if (typeof text !== 'string') return fail('bad_json', 'not text');
  try {
    return { ok: true, value: JSON.parse(text, (key, value) => (key === '__proto__' ? undefined : value)) };
  } catch (err) {
    return fail('bad_json', err instanceof Error ? err.message : 'not JSON');
  }
}

/**
 * A parsed saved event (any version) → the current event, or why not.
 * @param {any} raw
 * @returns {EventResult}
 */
function fromRaw(raw) {
  if (!isObj(raw)) return fail('bad_backup', 'not an event');
  const v = versionOf(raw);
  if (!Number.isSafeInteger(v) || v < 0) return fail('bad_backup', `unreadable schemaVersion ${JSON.stringify(v)}`);
  if (v > SCHEMA_VERSION)
    return fail('newer_version', `saved by schema ${v}; this build reads up to ${SCHEMA_VERSION}`);
  let event;
  try {
    event = migrate(raw);
    if (event.schemaVersion === undefined) event = { ...event, schemaVersion: v };
  } catch (err) {
    return fail('bad_backup', `could not migrate from schema ${v}: ${err instanceof Error ? err.message : err}`);
  }
  const problem = eventProblem(event);
  return problem ? fail('bad_backup', problem) : { ok: true, event };
}

/**
 * The event as saved: JSON of the whole event, schemaVersion included.
 * @param {LarpEvent} event
 * @returns {string}
 */
export function serialize(event) {
  return JSON.stringify({ ...event, schemaVersion: SCHEMA_VERSION });
}

/**
 * Saved text back to an event: parsed ('bad_json'), migrated from older schema versions,
 * rejected when newer than SCHEMA_VERSION ('newer_version') or not an event ('bad_backup').
 * @param {string} json
 * @returns {EventResult}
 */
export function deserialize(json) {
  const parsed = parse(json);
  return parsed.ok ? fromRaw(parsed.value) : /** @type {StoreFailure} */ (parsed);
}

// ── The store ────────────────────────────────────────────────────────────────────────────────

/** @param {unknown} err */
const describe = (err) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

/**
 * A store saving the event under `key` in `storage`. A key outside the game's 'larp.' prefix is
 * put inside it ('rehearsal' → 'larp.rehearsal'), so the game never touches another app's keys.
 * Nothing here throws: a missing or non-storage `storage`, or one whose read throws, gives
 * 'storage_unavailable'; a refused write or remove gives 'storage_failed' (the previous save, if
 * any, stays as the storage kept it). load() never removes what it can't read.
 * @param {{ storage: StorageLike|null|undefined, key?: string }} opts key defaults to STORE_KEY
 * @returns {Store}
 */
export function createStore({ storage, key = STORE_KEY }) {
  const prefix = STORE_KEY.slice(0, STORE_KEY.indexOf('.') + 1);
  const k = key.startsWith(prefix) ? key : prefix + key;
  const usable =
    isObj(storage) &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function';
  const unavailable = () => fail('storage_unavailable', 'no storage');
  return {
    key: k,
    save(event) {
      if (!usable) return unavailable();
      try {
        storage.setItem(k, serialize(event));
        return { ok: true };
      } catch (err) {
        return fail('storage_failed', describe(err));
      }
    },
    load() {
      if (!usable) return unavailable();
      let text;
      try {
        text = storage.getItem(k);
      } catch (err) {
        return fail('storage_unavailable', describe(err));
      }
      if (text === null || text === undefined) return { ok: true, event: null };
      return deserialize(text);
    },
    clear() {
      if (!usable) return unavailable();
      try {
        storage.removeItem(k);
        return { ok: true };
      } catch (err) {
        return fail('storage_failed', describe(err));
      }
    },
  };
}

// ── Backups ──────────────────────────────────────────────────────────────────────────────────

/**
 * The backup file's text: { app: BACKUP_APP, schemaVersion, exportedAt: event.updatedAt, event },
 * the whole event with private notes (indented, so a person can read it).
 * @param {LarpEvent} event
 * @returns {string}
 */
export function exportBackup(event) {
  const file = {
    app: BACKUP_APP,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: event.updatedAt,
    event: { ...event, schemaVersion: SCHEMA_VERSION },
  };
  return JSON.stringify(file, null, 2);
}

/**
 * What Import shows before replacing anything.
 * @param {LarpEvent} event
 * @returns {BackupSummary}
 */
function summarize(event) {
  return {
    title: event.config.title,
    teams: event.teams.length,
    members: event.roster.length,
    gms: event.gms.length,
    roundsPublished: event.results.length,
    phase: event.phase,
    roundIndex: event.roundIndex,
    roundPhase: event.roundPhase,
    updatedAt: event.updatedAt,
  };
}

/**
 * Reads a backup file (or a bare saved event): the migrated event and its summary, or a failure.
 * A file with an `app` field is a backup: it must be this game's ('bad_backup' otherwise), hold
 * an event, and not come from a newer schema ('newer_version'). Anything else is read as a bare
 * saved event.
 * @param {string} text
 * @returns {{ ok: true, event: LarpEvent, summary: BackupSummary } | StoreFailure}
 */
export function importBackup(text) {
  const parsed = parse(text);
  if (!parsed.ok) return /** @type {StoreFailure} */ (parsed);
  let raw = parsed.value;
  if (isObj(raw) && 'app' in raw) {
    if (raw.app !== BACKUP_APP) return fail('bad_backup', `not a ${BACKUP_APP} backup`);
    const v = raw.schemaVersion;
    if (Number.isSafeInteger(v) && v > SCHEMA_VERSION) {
      return fail('newer_version', `backup from schema ${v}; this build reads up to ${SCHEMA_VERSION}`);
    }
    if (!isObj(raw.event)) return fail('bad_backup', 'the backup holds no event');
    raw = raw.event;
  }
  const read = fromRaw(raw);
  return read.ok ? { ok: true, event: read.event, summary: summarize(read.event) } : /** @type {StoreFailure} */ (read);
}

// ── Export Results ───────────────────────────────────────────────────────────────────────────

/** The results CSV's columns. */
export const CSV_COLUMNS = Object.freeze([
  'Section',
  'Place',
  'Team',
  'Team Translation',
  'Member',
  'Round',
  'Detail',
  'Name',
  'Translation',
  'Points',
]);

/**
 * A byte-order mark for the download to put before exportResultsCsv's text, so spreadsheet
 * apps read the Vietnamese as UTF-8 (the CSV text itself starts with the header).
 */
export const CSV_BOM = '﻿';

/**
 * One CSV cell (RFC 4180): quoted when it holds a comma, quote, CR or LF, with quotes doubled.
 * Text that a spreadsheet would run as a formula (starting =, +, -, @, tab or CR) gets a leading
 * apostrophe; numbers are written as they are.
 * @param {string|number} value
 */
function cell(value) {
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COMPLETION_LABELS = Object.freeze({ complete: 'Complete', passed: 'Passed', absent: 'Absent' });

/**
 * The results as CSV (RFC 4180 quoting, '\r\n' rows, a header row of CSV_COLUMNS), in sections:
 * 'Standing' (every team, ranked 1, 1, 3), 'Round Score' (each published round, each team in its
 * queue, with its completion), 'Skipped Round', 'Award' (every published award with its team and,
 * for an individual award, the member's name as published), 'Correction' (with its public reason)
 * and 'Member Total' (every member's individual total, ranked). Read only from published results
 * and corrections: never private notes, duplicate reasons, drafts, discarded awards, ids or GM
 * attribution. Points are plain integers ('-30').
 * @param {LarpEvent} event
 * @returns {string}
 */
export function exportResultsCsv(event) {
  /** @type {Array<Array<string|number>>} */
  const rows = [[...CSV_COLUMNS]];
  /** @param {Partial<Record<(typeof CSV_COLUMNS)[number], string|number>>} r */
  const add = (r) => rows.push(CSV_COLUMNS.map((c) => r[c] ?? ''));

  const teams = new Map(event.teams.map((t) => [t.id, t]));
  const teamCols = (/** @type {string} */ teamId) => ({
    Team: teams.get(teamId)?.name ?? '',
    'Team Translation': teams.get(teamId)?.translation ?? '',
  });
  const roundLabel = (/** @type {string|null} */ roundId) => {
    const round = event.rounds.find((r) => r.id === roundId);
    const cat = round && ROUND_CATEGORIES.find((c) => c.key === round.category);
    return cat ? `${event.rounds.indexOf(round) + 1}. ${cat.vi} / ${cat.en}` : '';
  };

  for (const s of standings(event)) add({ Section: 'Standing', Place: s.place, ...teamCols(s.id), Points: s.total });

  const results = [...event.results].sort((a, b) => a.roundIndex - b.roundIndex);
  for (const result of results) {
    for (const [teamId, completion] of Object.entries(result.completion)) {
      add({
        Section: 'Round Score',
        ...teamCols(teamId),
        Round: roundLabel(result.roundId),
        Detail: COMPLETION_LABELS[completion.status] ?? completion.status,
        Points: result.teamRoundScores[teamId] ?? completion.points,
      });
    }
  }
  for (const round of event.rounds) {
    if (round.skipped) add({ Section: 'Skipped Round', Round: roundLabel(round.id), Detail: 'Skipped', Points: 0 });
  }

  /** Published names of members (a removed member keeps the name their award was published with). */
  const memberNames = new Map();
  for (const result of results) {
    for (const a of result.adjustments) {
      const member = a.recipientType === 'member';
      if (member) memberNames.set(a.recipientId, { name: a.recipientName, teamId: a.teamId });
      add({
        Section: 'Award',
        ...teamCols(a.teamId),
        Member: member ? a.recipientName : '',
        Round: roundLabel(a.roundId),
        Detail: member ? 'Individual Award' : 'Team Award',
        Name: a.name,
        Translation: a.translation,
        Points: a.points,
      });
    }
  }

  for (const c of event.corrections) {
    const member = c.recipientType === 'member';
    if (member && !memberNames.has(c.recipientId)) {
      memberNames.set(c.recipientId, { name: c.recipientName, teamId: c.teamId });
    }
    add({
      Section: 'Correction',
      ...teamCols(c.teamId),
      Member: member ? c.recipientName : '',
      Round: roundLabel(c.roundId),
      Detail: member ? 'Individual Correction' : 'Team Correction',
      Name: c.reason,
      Translation: c.translation,
      Points: c.points,
    });
  }

  const totals = memberTotals(event);
  for (const m of event.roster) memberNames.set(m.id, { name: m.name, teamId: m.teamId });
  const members = rank(Object.keys(totals).map((memberId) => ({ id: memberId, total: totals[memberId] })));
  for (const r of members) {
    const who = memberNames.get(r.id);
    add({
      Section: 'Member Total',
      Place: r.place,
      ...teamCols(who?.teamId ?? ''),
      Member: who?.name ?? '',
      Points: r.total,
    });
  }

  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
