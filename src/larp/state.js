// The campfire game's state: a new event, the command reducer and the display's public
// projection. The only module that creates new event objects; it never mutates its input. Pure:
// the clock (`now`) and the id generator (`newId`) are injected.
//
//   createEvent({ id, now })        a new event in Setup: the host GM (HOST_GM_ID), the five
//                                   default rounds, DEFAULT_CONFIG, no teams
//   reduce(event, command, ctx)     → { event, events, error, duplicate? }: validates the
//                                   command (shape, role via roles.js, phase, payload), applies
//                                   it, bumps `revision`, records history and the command id
//   projection(event, now)          the public view for the display: never drafts, private
//                                   notes, duplicate reasons, authors, the PIN or history
//
// The rules themselves live in the other modules and are only called from here: field checks
// (config.validate*, scoring.validateAward), roles (roles.check), phase moves and timers
// (phases.*), scores (scoring.*), text cleaning (strings.cleanText). What is decided here:
//   - Setup-only: addTeam, removeTeam (a removed team's members go with it), startEvent. Team,
//     roster and GM edits work in every phase (a late arrival, a typo fixed before exporting).
//   - Awards: in Preparation, Performances and (host only) Review of the current round. A team
//     award goes only to a team in the round's queue. A duplicate (scoring.duplicatesOf) needs a
//     duplicateReason ('' counts as none); the reason is kept only on the records that duplicate.
//     Renaming an award checks duplicates again, as does clearing a kept duplicate's reason;
//     changing only its points never does.
//   - A removed member's draft awards are discarded; their published points stay theirs.
//   - publishRound freezes completion (base when 'complete'), every draft (with its recipient's
//     name and, for a member, team at that moment) and teamRoundScores (scoring.teamRoundScore,
//     the rule previewRound uses), then starts the reveal at step 0.
//   - The reveal ends (advancing past the last step, or revealSkip) in Results with reveal null.
//     revealReplay starts it again (from Reveal or Results) at any step; scores never move.
//   - Timers: startPreparation and nextTeam start their countdowns; other phases have none.
//     Time added to a turn also lengthens the round's turnMs, so every later turn gets it.
//   - addTeamMidGame: during Performances the team joins the end of the current queue
//     (admittedRound = this round), otherwise it starts next round (admittedRound = roundIndex+1).
//   - endEvent discards every draft; an unpublished current round simply has no result.
//   - Commands that can move a score are checked with scoring.totalsSafe ('unsafe_total').
/**
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Command} Command
 * @typedef {import('./types.js').CommandType} CommandType
 * @typedef {import('./types.js').ReduceContext} ReduceContext
 * @typedef {import('./types.js').ReduceResult} ReduceResult
 * @typedef {import('./types.js').Projection} Projection
 * @typedef {import('./types.js').GameEvent} GameEvent
 * @typedef {import('./types.js').LarpError} LarpError
 * @typedef {import('./types.js').ErrorCode} ErrorCode
 * @typedef {import('./types.js').Team} Team
 * @typedef {import('./types.js').RosterMember} RosterMember
 * @typedef {import('./types.js').Round} Round
 * @typedef {import('./types.js').RoundPhase} RoundPhase
 * @typedef {import('./types.js').Adjustment} Adjustment
 * @typedef {import('./types.js').PublishedAdjustment} PublishedAdjustment
 * @typedef {import('./types.js').PublishedResult} PublishedResult
 * @typedef {import('./types.js').Correction} Correction
 * @typedef {import('./types.js').Timer} Timer
 * @typedef {import('./types.js').EventConfig} EventConfig
 * @typedef {import('./types.js').AwardInput} AwardInput
 * @typedef {import('./types.js').CompletionStatus} CompletionStatus
 * @typedef {import('./types.js').RecipientType} RecipientType
 */
import {
  defaultRounds,
  emblem,
  performanceQueue,
  teamColor,
  validateGm,
  validateMember,
  validateTeam,
} from './config.js';
import {
  addTime,
  canAdvance,
  canSkip,
  emptyTimer,
  idleTimer,
  nextRoundIndex,
  pauseTimer,
  remaining,
  resumeTimer,
  revealSteps,
  startTimer,
} from './phases.js';
import { check as roleCheck } from './roles.js';
import {
  duplicatesOf,
  isPoints,
  memberTotals,
  rank,
  standings,
  teamRoundScore,
  totalsSafe,
  validateAward,
} from './scoring.js';
import { LANGS, cleanText, normalizeName } from './strings.js';
import {
  COMMAND_TYPES,
  COMPLETION_STATUSES,
  DEFAULT_CONFIG,
  DISPLAY_MODES,
  HOST_GM_ID,
  LIMITS,
  ROUND_CATEGORIES,
  SCENERY_KEYS,
  SCHEMA_VERSION,
  larpError,
} from './types.js';

/**
 * What a command handler gets: the event, the payload (always an object), the command, the
 * clock and an id maker that never repeats an id already in the event.
 * @typedef {{ event: LarpEvent, p: Record<string, any>, cmd: Command, now: number, id: (kind: string) => string }} Step
 */

/**
 * A handler's answer: the refusal, or the next event with what happened and the ids it touched
 * (for the history entry).
 * @typedef {{ error: LarpError } | { next: LarpEvent, events: GameEvent[], ids: string[] }} Outcome
 */

/** @typedef {(s: Step) => Outcome} Handler */

/** The round phases in which awards may be added, edited or removed (Review: the host only). */
const AWARD_PHASES = /** @type {readonly RoundPhase[]} */ (['preparation', 'performances', 'review']);

/** Commands that can change a derived total, checked with totalsSafe after they apply. */
const SCORING_COMMANDS = new Set([
  'addAward',
  'editAward',
  'removeAward',
  'setStatus',
  'publishRound',
  'addCorrection',
]);

/** The longest an estimate segment (target, opening, finale, buffer) may be: a day. */
const MAX_SEGMENT_MS = 24 * 60 * 60 * 1000;

/** The longest event title and host PIN (code points). */
const TITLE_MAX = 60;
const PIN_MAX = 12;

/** How many places of individual leaders the display celebrates at the end (ties included). */
const LEADER_PLACES = 3;

// ── Small helpers ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {ErrorCode} code
 * @param {string} message
 * @param {{ field?: string, ids?: string[] }} [extra]
 * @returns {{ error: LarpError }}
 */
const fail = (code, message, extra) => ({ error: larpError(code, message, extra) });

/**
 * @param {LarpEvent} next
 * @param {GameEvent[]} events
 * @param {string[]} [ids]
 * @returns {Outcome}
 */
const done = (next, events, ids = []) => ({ next, events, ids });

/**
 * A phases.js Check's refusal as an Outcome, or null when it passed.
 * @param {import('./types.js').Check} check
 * @returns {{ error: LarpError } | null}
 */
const refusal = (check) => ('error' in check ? { error: check.error } : null);

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** @param {unknown} v @returns {v is string} */
const isId = (v) => typeof v === 'string' && v.length > 0;

/** @param {string} s */
const codePoints = (s) => [...s].length;

/** @param {unknown} ms @param {number} [min] @param {number} [max] */
const isDuration = (ms, min = 0, max = LIMITS.maxDurationMs) =>
  Number.isSafeInteger(ms) && /** @type {number} */ (ms) >= min && /** @type {number} */ (ms) <= max;

/**
 * Replaces the item with id `id` (one new array, the item rebuilt by `fn`).
 * @template {{ id: string }} T
 * @param {T[]} list
 * @param {string} id
 * @param {(item: T) => T} fn
 * @returns {T[]}
 */
const replaceById = (list, id, fn) => list.map((item) => (item.id === id ? fn(item) : item));

/**
 * The event with round `index` rebuilt by `fn`.
 * @param {LarpEvent} event
 * @param {number} index
 * @param {(round: Round) => Round} fn
 * @returns {Round[]}
 */
const withRound = (event, index, fn) => event.rounds.map((r, i) => (i === index ? fn(r) : r));

/**
 * The current round while the event is inside one (running, roundPhase set), else null.
 * @param {LarpEvent} event
 * @returns {Round|null}
 */
function currentRound(event) {
  if (event.phase !== 'running' || event.roundPhase === null) return null;
  return event.rounds[event.roundIndex] ?? null;
}

/**
 * 'wrong_phase' unless the event is running inside a round in one of `phases`.
 * @param {LarpEvent} event
 * @param {readonly RoundPhase[]} phases
 * @param {string} what
 * @returns {{ error: LarpError } | null}
 */
function needRoundPhase(event, phases, what) {
  if (currentRound(event) && phases.includes(/** @type {RoundPhase} */ (event.roundPhase))) return null;
  const now = event.phase !== 'running' ? event.phase : (event.roundPhase ?? 'welcome');
  return fail('wrong_phase', `${what} needs ${phases.join(' or ')} (now ${now})`);
}

/**
 * Every id the event holds or still points to: live records, and the ids of removed members,
 * GMs and teams that published results, corrections, awards (author, recipient) and history
 * still name. None of these may be handed out again, or a newcomer would inherit them.
 * @param {LarpEvent} event
 * @returns {Set<string>}
 */
function referencedIds(event) {
  const ids = new Set();
  for (const list of [event.teams, event.roster, event.gms, event.rounds, event.corrections]) {
    for (const x of list) ids.add(x.id);
  }
  for (const a of event.adjustments) ids.add(a.id).add(a.batchId).add(a.recipientId).add(a.authorId);
  for (const r of event.rounds) for (const id of [...r.order, ...r.admittedTeams]) ids.add(id);
  for (const r of event.results) {
    for (const id of Object.keys(r.completion)) ids.add(id);
    for (const a of r.adjustments) ids.add(a.id).add(a.batchId).add(a.recipientId).add(a.teamId).add(a.authorId);
  }
  for (const c of event.corrections) ids.add(c.recipientId).add(c.teamId).add(c.authorId);
  for (const h of event.history) {
    ids.add(h.actorId);
    for (const id of h.ids) ids.add(id);
  }
  return ids;
}

/**
 * An id maker over the event's ids: newId(kind) until it gives one not used or referenced yet
 * (a generator that restarted after a reload would otherwise repeat ids the save still holds,
 * including a removed member's or GM's, whose published points and awards still name them).
 * @param {(kind?: string) => string} newId
 * @param {LarpEvent} event
 * @returns {(kind: string) => string}
 */
function idMaker(newId, event) {
  /** @type {Set<string>|null} */
  let taken = null;
  return (kind) => {
    taken ??= referencedIds(event);
    // A counter-like generator finds a free id within taken.size + 1 tries; one that never does
    // is broken (a programming error, like a missing ctx).
    for (let i = 0; i <= taken.size + 100; i++) {
      const id = newId(kind);
      if (isId(id) && !taken.has(id)) {
        taken.add(id);
        return id;
      }
    }
    throw new Error(`newId kept giving used or empty ids for ${kind}`);
  };
}

/**
 * A text field as stored: cleanText, or `fallback` when absent.
 * @param {unknown} v
 * @param {string} [fallback]
 */
const text = (v, fallback = '') => (v === undefined ? fallback : cleanText(v));

// ── createEvent ───────────────────────────────────────────────────────────────────────────────

/**
 * A new event in Setup: phase 'setup', roundIndex -1, roundPhase null, currentTurn -1,
 * revision 0, schemaVersion SCHEMA_VERSION, config a copy of DEFAULT_CONFIG, gms [the host
 * { id: HOST_GM_ID, name: 'Host', host: true }], rounds defaultRounds(), everything else empty,
 * timer emptyTimer(), reveal null, createdAt = updatedAt = now.
 * @param {{ id: string, now: number }} opts
 * @returns {LarpEvent}
 */
export function createEvent({ id, now }) {
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    phase: 'setup',
    roundIndex: -1,
    roundPhase: null,
    currentTurn: -1,
    config: { ...DEFAULT_CONFIG },
    teams: [],
    roster: [],
    gms: [{ id: HOST_GM_ID, name: 'Host', host: true }],
    rounds: defaultRounds(),
    adjustments: [],
    results: [],
    corrections: [],
    timer: emptyTimer(),
    reveal: null,
    seenCommandIds: [],
    history: [],
  };
}

// ── Setup: teams, roster, GMs, rounds, settings ───────────────────────────────────────────────

/**
 * A new team from a TeamInput (validated), colors and emblems cycling by the team count.
 * @param {Step} s
 * @param {number} admittedRound
 * @returns {{ error: LarpError } | { team: Team }}
 */
function newTeam(s, admittedRound) {
  const error = validateTeam(s.p);
  if (error) return { error };
  const i = s.event.teams.length;
  return {
    team: {
      id: s.id('team'),
      name: cleanText(s.p.name),
      translation: text(s.p.translation),
      color: s.p.color ?? teamColor(i),
      emblem: s.p.emblem ?? emblem(i),
      patron: text(s.p.patron),
      admittedRound,
    },
  };
}

/** @type {Handler} */
function addTeam(s) {
  if (s.event.phase !== 'setup') return fail('wrong_phase', 'once the event runs, teams join with addTeamMidGame');
  const made = newTeam(s, 0);
  if ('error' in made) return made;
  return done(
    { ...s.event, teams: [...s.event.teams, made.team] },
    [{ type: 'teamAdded', teamId: made.team.id }],
    [made.team.id],
  );
}

/** @type {Handler} */
function editTeam(s) {
  const { teamId, ...rest } = s.p;
  if (!isId(teamId)) return fail('bad_payload', 'teamId is required', { field: 'teamId' });
  if (!s.event.teams.some((t) => t.id === teamId)) return fail('not_found', `no team ${teamId}`, { ids: [teamId] });
  const error = validateTeam(rest, true);
  if (error) return { error };
  const teams = replaceById(s.event.teams, teamId, (t) => ({
    ...t,
    name: text(rest.name, t.name),
    translation: text(rest.translation, t.translation),
    patron: text(rest.patron, t.patron),
    color: rest.color ?? t.color,
    emblem: rest.emblem ?? t.emblem,
  }));
  return done({ ...s.event, teams }, [{ type: 'setupChanged', teamId }], [teamId]);
}

/** @type {Handler} */
function removeTeam(s) {
  if (s.event.phase !== 'setup') return fail('wrong_phase', 'teams can only be removed in Setup');
  const { teamId } = s.p;
  if (!isId(teamId)) return fail('bad_payload', 'teamId is required', { field: 'teamId' });
  if (!s.event.teams.some((t) => t.id === teamId)) return fail('not_found', `no team ${teamId}`, { ids: [teamId] });
  const gone = s.event.roster.filter((m) => m.teamId === teamId).map((m) => m.id);
  return done(
    {
      ...s.event,
      teams: s.event.teams.filter((t) => t.id !== teamId),
      roster: s.event.roster.filter((m) => m.teamId !== teamId),
    },
    [{ type: 'setupChanged', teamId, ids: gone }],
    [teamId, ...gone],
  );
}

/**
 * @param {Step} s
 * @param {string} name already cleaned
 * @param {string} teamId
 * @param {boolean} captain
 * @returns {RosterMember}
 */
const newMember = (s, name, teamId, captain) => ({ id: s.id('member'), name, teamId, captain });

/** @type {Handler} */
function addMember(s) {
  const error = validateMember(s.p, s.event);
  if (error) return { error };
  const member = newMember(s, cleanText(s.p.name), s.p.teamId, s.p.captain ?? false);
  return done(
    { ...s.event, roster: [...s.event.roster, member] },
    [{ type: 'setupChanged', ids: [member.id] }],
    [member.id],
  );
}

/** @type {Handler} */
function addMembers(s) {
  const { names, teamId } = s.p;
  if (!Array.isArray(names) || !names.every((n) => typeof n === 'string')) {
    return fail('bad_payload', 'names must be a list of names', { field: 'names' });
  }
  const cleaned = names.map(cleanText).filter(Boolean);
  if (!cleaned.length) return fail('invalid_name', 'no names given', { field: 'names' });
  for (const name of cleaned) {
    const error = validateMember({ name, teamId }, s.event);
    if (error) return { error };
  }
  const added = cleaned.map((name) => newMember(s, name, teamId, false));
  const ids = added.map((m) => m.id);
  return done({ ...s.event, roster: [...s.event.roster, ...added] }, [{ type: 'setupChanged', teamId, ids }], ids);
}

/** @type {Handler} */
function editMember(s) {
  const { memberId, ...rest } = s.p;
  if (!isId(memberId)) return fail('bad_payload', 'memberId is required', { field: 'memberId' });
  if (!s.event.roster.some((m) => m.id === memberId)) {
    return fail('not_found', `no member ${memberId}`, { ids: [memberId] });
  }
  const error = validateMember(rest, s.event, true);
  if (error) return { error };
  const roster = replaceById(s.event.roster, memberId, (m) => ({
    ...m,
    name: text(rest.name, m.name),
    teamId: rest.teamId ?? m.teamId,
    captain: rest.captain ?? m.captain,
  }));
  return done({ ...s.event, roster }, [{ type: 'setupChanged', ids: [memberId] }], [memberId]);
}

/** @type {Handler} */
function removeMember(s) {
  const { memberId } = s.p;
  if (!isId(memberId)) return fail('bad_payload', 'memberId is required', { field: 'memberId' });
  if (!s.event.roster.some((m) => m.id === memberId)) {
    return fail('not_found', `no member ${memberId}`, { ids: [memberId] });
  }
  const discarded = [];
  const adjustments = s.event.adjustments.map((a) => {
    if (a.status !== 'draft' || a.recipientType !== 'member' || a.recipientId !== memberId) return a;
    discarded.push(a.id);
    return { ...a, status: /** @type {const} */ ('discarded'), updatedAt: s.now };
  });
  return done(
    { ...s.event, roster: s.event.roster.filter((m) => m.id !== memberId), adjustments },
    [{ type: 'setupChanged', ids: [memberId, ...discarded] }],
    [memberId, ...discarded],
  );
}

/** @type {Handler} */
function addGm(s) {
  const error = validateGm(s.p);
  if (error) return { error };
  const gm = { id: s.id('gm'), name: cleanText(s.p.name), host: false };
  return done({ ...s.event, gms: [...s.event.gms, gm] }, [{ type: 'setupChanged', ids: [gm.id] }], [gm.id]);
}

/** @type {Handler} */
function editGm(s) {
  const { gmId, name } = s.p;
  if (!isId(gmId)) return fail('bad_payload', 'gmId is required', { field: 'gmId' });
  if (!s.event.gms.some((g) => g.id === gmId)) return fail('not_found', `no GM ${gmId}`, { ids: [gmId] });
  const error = validateGm({ name });
  if (error) return { error };
  const gms = replaceById(s.event.gms, gmId, (g) => ({ ...g, name: cleanText(name) }));
  return done({ ...s.event, gms }, [{ type: 'setupChanged', ids: [gmId] }], [gmId]);
}

/** @type {Handler} */
function removeGm(s) {
  const { gmId } = s.p;
  if (!isId(gmId)) return fail('bad_payload', 'gmId is required', { field: 'gmId' });
  const gm = s.event.gms.find((g) => g.id === gmId);
  if (!gm) return fail('not_found', `no GM ${gmId}`, { ids: [gmId] });
  if (gm.host) return fail('host_required', 'the host GM cannot be removed', { ids: [gmId] });
  return done(
    { ...s.event, gms: s.event.gms.filter((g) => g.id !== gmId) },
    [{ type: 'setupChanged', ids: [gmId] }],
    [gmId],
  );
}

const ROUND_DURATIONS = /** @type {const} */ (['prepMs', 'turnMs', 'transitionMs', 'reviewRevealMs']);

/** @type {Handler} */
function editRound(s) {
  const { roundId } = s.p;
  if (!isId(roundId)) return fail('bad_payload', 'roundId is required', { field: 'roundId' });
  const index = s.event.rounds.findIndex((r) => r.id === roundId);
  if (index === -1) return fail('not_found', `no round ${roundId}`, { ids: [roundId] });
  const round = s.event.rounds[index];
  const e = s.event;
  if (e.phase === 'finished') return fail('locked', 'the event is over');
  if (e.phase === 'running') {
    if (s.p.base !== undefined) {
      return fail('locked', 'base points are locked once the event starts', { field: 'base' });
    }
    const started = index <= e.roundIndex || round.skipped || e.results.some((r) => r.roundId === roundId);
    if (started) return fail('locked', `${roundId} has started`, { ids: [roundId] });
  }
  const { prompt, promptTranslation, base } = s.p;
  if (prompt !== undefined) {
    if (typeof prompt !== 'string' || !cleanText(prompt) || codePoints(cleanText(prompt)) > LIMITS.prompt) {
      return fail('invalid_text', `the prompt must be 1–${LIMITS.prompt} characters`, { field: 'prompt' });
    }
  }
  if (promptTranslation !== undefined) {
    if (typeof promptTranslation !== 'string' || codePoints(cleanText(promptTranslation)) > LIMITS.prompt) {
      return fail('invalid_text', `the translation must be at most ${LIMITS.prompt} characters`, {
        field: 'promptTranslation',
      });
    }
  }
  if (base !== undefined && !(isPoints(base) && base >= 0)) {
    return fail('invalid_points', 'base points must be a whole number, 0 or more', { field: 'base' });
  }
  for (const field of ROUND_DURATIONS) {
    if (s.p[field] !== undefined && !isDuration(s.p[field])) {
      return fail('invalid_duration', `${field} must be whole ms from 0 to ${LIMITS.maxDurationMs}`, { field });
    }
  }
  const rounds = withRound(e, index, (r) => ({
    ...r,
    prompt: text(prompt, r.prompt),
    promptTranslation: text(promptTranslation, r.promptTranslation),
    base: base ?? r.base,
    prepMs: s.p.prepMs ?? r.prepMs,
    turnMs: s.p.turnMs ?? r.turnMs,
    transitionMs: s.p.transitionMs ?? r.transitionMs,
    reviewRevealMs: s.p.reviewRevealMs ?? r.reviewRevealMs,
  }));
  return done({ ...e, rounds }, [{ type: 'setupChanged', roundId }], [roundId]);
}

/** @param {unknown} v */
const isBool = (v) => typeof v === 'boolean';

/**
 * Each setting's check (and how it is stored).
 * @type {Record<keyof EventConfig, { ok: (v: any) => boolean, code?: ErrorCode, store?: (v: any) => any }>}
 */
const CONFIG_RULES = {
  title: {
    ok: (v) => typeof v === 'string' && !!cleanText(v) && codePoints(cleanText(v)) <= TITLE_MAX,
    store: cleanText,
  },
  displayMode: { ok: (v) => DISPLAY_MODES.includes(v) },
  hostLang: { ok: (v) => LANGS.includes(v) },
  scenery: { ok: (v) => SCENERY_KEYS.includes(v) },
  reducedMotion: { ok: isBool },
  sound: { ok: isBool },
  showMembers: { ok: isBool },
  hostPin: {
    ok: (v) => v === null || (typeof v === 'string' && !!v.trim() && codePoints(v.trim()) <= PIN_MAX),
    store: (v) => (v === null ? null : v.trim()),
  },
  targetMs: { ok: (v) => isDuration(v, 0, MAX_SEGMENT_MS), code: 'invalid_duration' },
  openingMs: { ok: (v) => isDuration(v, 0, MAX_SEGMENT_MS), code: 'invalid_duration' },
  finaleMs: { ok: (v) => isDuration(v, 0, MAX_SEGMENT_MS), code: 'invalid_duration' },
  bufferMs: { ok: (v) => isDuration(v, 0, MAX_SEGMENT_MS), code: 'invalid_duration' },
};

/** @type {Handler} */
function setConfig(s) {
  /** @type {Record<string, any>} */
  const changes = {};
  for (const [key, value] of Object.entries(s.p)) {
    const rule = Object.hasOwn(CONFIG_RULES, key) ? CONFIG_RULES[/** @type {keyof EventConfig} */ (key)] : null;
    if (!rule) return fail('invalid_config', `unknown setting ${key}`, { field: key });
    if (!rule.ok(value)) return fail(rule.code ?? 'invalid_config', `${key} is out of range`, { field: key });
    changes[key] = rule.store ? rule.store(value) : value;
  }
  return done({ ...s.event, config: { ...s.event.config, ...changes } }, [{ type: 'configChanged' }]);
}

/** @type {Handler} */
function startEvent(s) {
  if (s.event.phase !== 'setup') return fail('wrong_phase', `the event is already ${s.event.phase}`);
  if (!s.event.teams.length) return fail('no_teams', 'add at least one team first');
  return done(
    {
      ...s.event,
      phase: 'running',
      roundIndex: -1,
      roundPhase: null,
      currentTurn: -1,
      startedAt: s.now,
      timer: emptyTimer(),
      reveal: null,
    },
    [{ type: 'eventStarted' }, { type: 'phaseChanged', from: 'setup', to: 'welcome' }],
  );
}

// ── The round flow ────────────────────────────────────────────────────────────────────────────

/**
 * @param {LarpEvent} event
 * @param {RoundPhase|'welcome'|'finished'} to
 * @returns {GameEvent}
 */
const phaseChanged = (event, to) => ({
  type: 'phaseChanged',
  roundId: event.rounds[event.roundIndex]?.id,
  from: event.roundPhase ?? (event.phase === 'running' ? 'welcome' : event.phase),
  to,
});

/** @type {Handler} */
function nextRound(s) {
  const blocked = refusal(canAdvance(s.event, 'briefing'));
  if (blocked) return blocked;
  const index = nextRoundIndex(s.event);
  const round = s.event.rounds[index];
  const order = performanceQueue(round, s.event.teams, index);
  const next = {
    ...s.event,
    roundIndex: index,
    roundPhase: /** @type {RoundPhase} */ ('briefing'),
    currentTurn: -1,
    timer: emptyTimer(),
    reveal: null,
    rounds: withRound(s.event, index, (r) => ({ ...r, order })),
  };
  return done(
    next,
    [
      { type: 'roundStarted', roundId: round.id },
      { ...phaseChanged(s.event, 'briefing'), roundId: round.id },
    ],
    [round.id],
  );
}

/** @type {Handler} */
function startPreparation(s) {
  const blocked = refusal(canAdvance(s.event, 'preparation'));
  if (blocked) return blocked;
  const round = s.event.rounds[s.event.roundIndex];
  const timer = startTimer(idleTimer('preparation', round.prepMs), s.now);
  return done(
    { ...s.event, roundPhase: 'preparation', timer },
    [phaseChanged(s.event, 'preparation'), { type: 'timerChanged', roundId: round.id }],
    [round.id],
  );
}

/** @type {Handler} */
function endPreparation(s) {
  const wrong = needRoundPhase(s.event, ['preparation'], 'endPreparation');
  if (wrong) return wrong;
  const blocked = refusal(canAdvance(s.event, 'performances'));
  if (blocked) return blocked;
  const round = s.event.rounds[s.event.roundIndex];
  return done(
    { ...s.event, roundPhase: 'performances', currentTurn: -1, timer: emptyTimer() },
    [phaseChanged(s.event, 'performances'), { type: 'timerChanged', roundId: round.id }],
    [round.id],
  );
}

/** @type {Handler} */
function nextTeam(s) {
  const wrong = needRoundPhase(s.event, ['performances'], 'nextTeam');
  if (wrong) return wrong;
  const round = s.event.rounds[s.event.roundIndex];
  const turn = s.event.currentTurn + 1;
  if (turn >= round.order.length) return fail('no_next_team', 'every team has performed');
  const teamId = round.order[turn];
  const timer = startTimer(idleTimer('turn', round.turnMs), s.now);
  return done(
    { ...s.event, currentTurn: turn, timer },
    [
      { type: 'turnStarted', roundId: round.id, teamId },
      { type: 'timerChanged', roundId: round.id },
    ],
    [teamId],
  );
}

/** @type {Handler} */
function beginReview(s) {
  const blocked = refusal(canAdvance(s.event, 'review'));
  if (blocked) return blocked;
  const round = s.event.rounds[s.event.roundIndex];
  return done(
    { ...s.event, roundPhase: 'review', timer: emptyTimer() },
    [{ type: 'reviewBegan', roundId: round.id }, phaseChanged(s.event, 'review')],
    [round.id],
  );
}

/** @type {Handler} */
function reopenJudging(s) {
  const wrong = needRoundPhase(s.event, ['review'], 'reopenJudging');
  if (wrong) return wrong;
  const blocked = refusal(canAdvance(s.event, 'performances'));
  if (blocked) return blocked;
  const round = s.event.rounds[s.event.roundIndex];
  return done(
    { ...s.event, roundPhase: 'performances', timer: emptyTimer() },
    [{ type: 'judgingReopened', roundId: round.id }, phaseChanged(s.event, 'performances')],
    [round.id],
  );
}

/**
 * A round's one result: completion for every queued team, every draft frozen with its
 * recipient's name and (for a member) team now, and teamRoundScores by scoring.teamRoundScore
 * over those drafts (exactly what previewRound shows).
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {Adjustment[]} drafts
 * @param {Command} cmd
 * @param {number} now
 * @returns {PublishedResult}
 */
function buildResult(event, round, drafts, cmd, now) {
  const teams = new Map(event.teams.map((t) => [t.id, t]));
  const members = new Map(event.roster.map((m) => [m.id, m]));
  /** @type {PublishedAdjustment[]} */
  const adjustments = drafts.map((a) => {
    const member = a.recipientType === 'member' ? members.get(a.recipientId) : undefined;
    const teamId = a.recipientType === 'member' ? (member?.teamId ?? '') : a.recipientId;
    return {
      id: a.id,
      roundId: a.roundId,
      recipientType: a.recipientType,
      recipientId: a.recipientId,
      recipientName: (a.recipientType === 'member' ? member?.name : teams.get(a.recipientId)?.name) ?? '',
      teamId,
      name: a.name,
      translation: a.translation,
      points: a.points,
      authorId: a.authorId,
      note: a.note,
      batchId: a.batchId,
      duplicateReason: a.duplicateReason,
    };
  });
  /** @type {PublishedResult['completion']} */
  const completion = {};
  /** @type {Record<string, number>} */
  const teamRoundScores = {};
  for (const teamId of round.order) {
    const status = round.statuses[teamId];
    completion[teamId] = { status, points: status === 'complete' ? round.base : 0 };
    teamRoundScores[teamId] = teamRoundScore(round, teamId, drafts);
  }
  return {
    roundId: round.id,
    roundIndex: event.rounds.indexOf(round),
    base: round.base,
    commandId: cmd.id,
    completion,
    adjustments,
    teamRoundScores,
    publishedAt: now,
  };
}

/** @type {Handler} */
function publishRound(s) {
  const { roundId } = s.p;
  if (!isId(roundId)) return fail('bad_payload', 'roundId is required', { field: 'roundId' });
  const round = s.event.rounds.find((r) => r.id === roundId);
  if (!round) return fail('not_found', `no round ${roundId}`, { ids: [roundId] });
  if (s.event.results.some((r) => r.roundId === roundId)) {
    return fail('already_published', `${roundId} is already published`, { ids: [roundId] });
  }
  if (currentRound(s.event) !== round) return fail('wrong_phase', `${roundId} is not the round under review`);
  const blocked = refusal(canAdvance(s.event, 'reveal'));
  if (blocked) return blocked;

  const drafts = s.event.adjustments.filter((a) => a.roundId === roundId && a.status === 'draft');
  const result = buildResult(s.event, round, drafts, s.cmd, s.now);
  const published = new Set(drafts.map((a) => a.id));
  /** @type {LarpEvent} */
  const next = {
    ...s.event,
    roundPhase: 'reveal',
    timer: emptyTimer(),
    adjustments: s.event.adjustments.map((a) =>
      published.has(a.id) ? { ...a, status: /** @type {const} */ ('published'), updatedAt: s.now } : a,
    ),
    results: [...s.event.results, result],
  };
  const total = revealSteps(next, roundId).length;
  next.reveal = { roundId, step: 0, total, paused: false, stepStartedAt: s.now };
  return done(
    next,
    [
      { type: 'roundPublished', roundId, ids: [...published] },
      phaseChanged(s.event, 'reveal'),
      { type: 'revealStep', roundId },
    ],
    [roundId],
  );
}

/**
 * 'wrong_phase' unless the reveal is on.
 * @param {LarpEvent} event
 */
function needReveal(event) {
  if (!event.reveal) return fail('wrong_phase', 'no reveal is on');
  return needRoundPhase(event, ['reveal'], 'the reveal controls');
}

/**
 * The reveal ends: Results, reveal cleared. Scores were frozen at publication.
 * @param {LarpEvent} event
 * @returns {Outcome}
 */
function finishReveal(event) {
  const roundId = event.reveal?.roundId;
  return done({ ...event, roundPhase: 'results', reveal: null }, [
    { type: 'revealFinished', roundId },
    phaseChanged(event, 'results'),
  ]);
}

/** @type {Handler} */
function revealAdvance(s) {
  const wrong = needReveal(s.event);
  if (wrong) return wrong;
  const reveal = /** @type {import('./types.js').RevealPosition} */ (s.event.reveal);
  const step = reveal.step + 1;
  if (step >= reveal.total) return finishReveal(s.event);
  return done({ ...s.event, reveal: { ...reveal, step, stepStartedAt: s.now } }, [
    { type: 'revealStep', roundId: reveal.roundId },
  ]);
}

/** @type {Handler} */
function revealPause(s) {
  const wrong = needReveal(s.event);
  if (wrong) return wrong;
  const reveal = /** @type {import('./types.js').RevealPosition} */ (s.event.reveal);
  if (reveal.paused) return fail('wrong_phase', 'the reveal is already paused');
  return done({ ...s.event, reveal: { ...reveal, paused: true } }, [{ type: 'revealStep', roundId: reveal.roundId }]);
}

/** @type {Handler} */
function revealResume(s) {
  const wrong = needReveal(s.event);
  if (wrong) return wrong;
  const reveal = /** @type {import('./types.js').RevealPosition} */ (s.event.reveal);
  if (!reveal.paused) return fail('wrong_phase', 'the reveal is not paused');
  return done({ ...s.event, reveal: { ...reveal, paused: false, stepStartedAt: s.now } }, [
    { type: 'revealStep', roundId: reveal.roundId },
  ]);
}

/** @type {Handler} */
function revealSkip(s) {
  const wrong = needReveal(s.event);
  return wrong ?? finishReveal(s.event);
}

/** @type {Handler} */
function revealReplay(s) {
  const wrong = needRoundPhase(s.event, ['reveal', 'results'], 'revealReplay');
  if (wrong) return wrong;
  const round = /** @type {Round} */ (currentRound(s.event));
  if (!s.event.results.some((r) => r.roundId === round.id)) {
    return fail('wrong_phase', `${round.id} has no published result to replay`, { ids: [round.id] });
  }
  const total = revealSteps(s.event, round.id).length;
  const { step = 0 } = s.p;
  if (!Number.isSafeInteger(step) || step < 0 || step >= total) {
    return fail('bad_payload', `step must be a whole number from 0 to ${total - 1}`, { field: 'step' });
  }
  /** @type {GameEvent[]} */
  const events = s.event.roundPhase === 'results' ? [phaseChanged(s.event, 'reveal')] : [];
  return done(
    {
      ...s.event,
      roundPhase: 'reveal',
      reveal: { roundId: round.id, step, total, paused: false, stepStartedAt: s.now },
    },
    [...events, { type: 'revealStep', roundId: round.id }],
    [round.id],
  );
}

/**
 * The adjustments with every draft that `pred` picks marked discarded.
 * @param {LarpEvent} event
 * @param {(a: Adjustment) => boolean} pred
 * @param {number} now
 */
function discardDrafts(event, pred, now) {
  /** @type {string[]} */
  const ids = [];
  const adjustments = event.adjustments.map((a) => {
    if (a.status !== 'draft' || !pred(a)) return a;
    ids.push(a.id);
    return { ...a, status: /** @type {const} */ ('discarded'), updatedAt: now };
  });
  return { adjustments, ids };
}

/** @type {Handler} */
function skipRound(s) {
  const { roundId } = s.p;
  if (!isId(roundId)) return fail('bad_payload', 'roundId is required', { field: 'roundId' });
  const blocked = refusal(canSkip(s.event, roundId));
  if (blocked) return blocked;
  const index = s.event.rounds.findIndex((r) => r.id === roundId);
  const { adjustments, ids } = discardDrafts(s.event, (a) => a.roundId === roundId, s.now);
  const rounds = withRound(s.event, index, (r) => ({ ...r, skipped: true }));
  /** @type {GameEvent[]} */
  const events = [{ type: 'roundSkipped', roundId, ids }];
  let next = { ...s.event, rounds, adjustments };
  if (index === s.event.roundIndex) {
    next = { ...next, roundPhase: 'results', currentTurn: -1, timer: emptyTimer(), reveal: null };
    events.push(phaseChanged(s.event, 'results'));
  }
  return done(next, events, [roundId, ...ids]);
}

/** @type {Handler} */
function endEvent(s) {
  if (s.event.phase !== 'running') return fail('wrong_phase', `the event is ${s.event.phase}`);
  const { adjustments, ids } = discardDrafts(s.event, () => true, s.now);
  return done(
    {
      ...s.event,
      phase: 'finished',
      roundPhase: null,
      currentTurn: -1,
      timer: emptyTimer(),
      reveal: null,
      finishedAt: s.now,
      adjustments,
    },
    [{ type: 'eventFinished', ids }, phaseChanged(s.event, 'finished')],
    ids,
  );
}

// ── Timers ────────────────────────────────────────────────────────────────────────────────────

/**
 * A timer command: the event running with a countdown in `status` ('timer_state' otherwise).
 * @param {Step} s
 * @param {Timer['status']} status
 * @param {(timer: Timer) => Timer} change
 * @returns {Outcome}
 */
function timerCommand(s, status, change) {
  if (s.event.phase !== 'running') return fail('wrong_phase', `the event is ${s.event.phase}`);
  const { timer } = s.event;
  if (timer.kind === null) return fail('timer_state', 'this phase has no countdown');
  if (timer.status !== status) return fail('timer_state', `the countdown is ${timer.status}`);
  return done({ ...s.event, timer: change(timer) }, [
    { type: 'timerChanged', roundId: s.event.rounds[s.event.roundIndex]?.id },
  ]);
}

/** @type {Handler} */
const startTimerCommand = (s) => timerCommand(s, 'idle', (t) => startTimer(t, s.now));
/** @type {Handler} */
const pauseTimerCommand = (s) => timerCommand(s, 'running', (t) => pauseTimer(t, s.now));
/** @type {Handler} */
const resumeTimerCommand = (s) => timerCommand(s, 'paused', (t) => resumeTimer(t, s.now));

/** @type {Handler} */
function addTimeCommand(s) {
  if (s.event.phase !== 'running') return fail('wrong_phase', `the event is ${s.event.phase}`);
  if (s.event.timer.kind === null) return fail('timer_state', 'this phase has no countdown');
  const { ms } = s.p;
  if (!isDuration(ms, 1)) {
    return fail('invalid_duration', `added time must be whole ms from 1 to ${LIMITS.maxDurationMs}`, { field: 'ms' });
  }
  // A time change applies to the whole round, never to one team: time added to a turn goes into
  // the round's turn allowance too, so every later turn gets it.
  let { rounds } = s.event;
  if (s.event.timer.kind === 'turn') {
    const round = s.event.rounds[s.event.roundIndex];
    if (!round) return fail('timer_state', 'no round is running');
    const turnMs = round.turnMs + ms;
    if (!isDuration(turnMs)) {
      return fail('invalid_duration', `a turn may last at most ${LIMITS.maxDurationMs} ms`, { field: 'ms' });
    }
    rounds = withRound(s.event, s.event.roundIndex, (r) => ({ ...r, turnMs }));
  }
  return done({ ...s.event, rounds, timer: addTime(s.event.timer, ms, s.now) }, [
    { type: 'timerChanged', roundId: s.event.rounds[s.event.roundIndex]?.id },
  ]);
}

// ── Judging ───────────────────────────────────────────────────────────────────────────────────

/** @type {Handler} */
function setStatus(s) {
  const wrong = needRoundPhase(s.event, ['performances', 'review'], 'setStatus');
  if (wrong) return wrong;
  const { teamId, status } = s.p;
  if (!isId(teamId)) return fail('bad_payload', 'teamId is required', { field: 'teamId' });
  if (status !== null && !COMPLETION_STATUSES.includes(status)) {
    return fail('invalid_status', `status must be ${COMPLETION_STATUSES.join(', ')} or null`, { field: 'status' });
  }
  const round = s.event.rounds[s.event.roundIndex];
  if (!round.order.includes(teamId)) return fail('not_found', `${teamId} is not in this round`, { ids: [teamId] });
  const statuses = { ...round.statuses };
  if (status === null) delete statuses[teamId];
  else statuses[teamId] = status;
  return done(
    { ...s.event, rounds: withRound(s.event, s.event.roundIndex, (r) => ({ ...r, statuses })) },
    [{ type: 'statusSet', roundId: round.id, teamId }],
    [teamId],
  );
}

/**
 * A duplicateReason as sent: blank ('' or spaces) counts as none (undefined); null clears.
 * @param {unknown} reason
 * @returns {any} the reason, undefined or null (validateAward checks the rest)
 */
const reasonOf = (reason) => (typeof reason === 'string' && !cleanText(reason) ? undefined : reason);

/** @type {Handler} */
function addAward(s) {
  const wrong = needRoundPhase(s.event, AWARD_PHASES, 'addAward');
  if (wrong) return wrong;
  const round = /** @type {Round} */ (currentRound(s.event));
  /** @type {AwardInput} */
  const input = /** @type {AwardInput} */ ({ ...s.p, duplicateReason: reasonOf(s.p.duplicateReason) });
  const error = validateAward(input, s.event);
  if (error) return { error };
  const { recipientType, recipientIds } = input;
  if (recipientType === 'team') {
    const outside = recipientIds.filter((id) => !round.order.includes(id));
    if (outside.length) {
      return fail('not_found', 'a team not in this round cannot get its awards', {
        field: 'recipientIds',
        ids: outside,
      });
    }
  }
  const name = cleanText(input.name);
  const reason = input.duplicateReason ? cleanText(input.duplicateReason) : null;
  const dupes = recipientIds.map((recipientId) =>
    duplicatesOf(s.event, { roundId: round.id, recipientType, recipientId, name }).map((a) => a.id),
  );
  const existing = dupes.flat();
  if (existing.length && !reason) {
    return fail('duplicate_award', 'the same award was already given: keep it with a reason', {
      field: 'name',
      ids: existing,
    });
  }
  const batchId = s.id('batch');
  /** @type {Adjustment[]} */
  const added = recipientIds.map((recipientId, i) => ({
    id: s.id('adj'),
    roundId: round.id,
    recipientType,
    recipientId,
    name,
    translation: text(input.translation ?? undefined),
    points: input.points,
    authorId: input.authorId ?? s.cmd.actorId,
    note: text(input.note ?? undefined),
    batchId,
    status: 'draft',
    duplicateReason: dupes[i].length ? reason : null,
    createdAt: s.now,
    updatedAt: s.now,
  }));
  const ids = added.map((a) => a.id);
  return done(
    { ...s.event, adjustments: [...s.event.adjustments, ...added] },
    [{ type: 'awardAdded', roundId: round.id, ids }],
    ids,
  );
}

/**
 * The draft an editAward / removeAward aims at, in the current round's judging phases.
 * @param {Step} s
 * @param {string} what
 * @returns {{ error: LarpError } | { adj: Adjustment }}
 */
function draftFor(s, what) {
  const wrong = needRoundPhase(s.event, AWARD_PHASES, what);
  if (wrong) return wrong;
  const { adjustmentId } = s.p;
  if (!isId(adjustmentId)) return fail('bad_payload', 'adjustmentId is required', { field: 'adjustmentId' });
  const adj = s.event.adjustments.find((a) => a.id === adjustmentId);
  if (!adj) return fail('not_found', `no award ${adjustmentId}`, { ids: [adjustmentId] });
  if (adj.status !== 'draft') return fail('not_draft', `that award is ${adj.status}`, { ids: [adjustmentId] });
  if (adj.roundId !== currentRound(s.event)?.id) return fail('wrong_phase', 'that award belongs to another round');
  return { adj };
}

/** @type {Handler} */
function editAward(s) {
  const found = draftFor(s, 'editAward');
  if ('error' in found) return found;
  const { adj } = found;
  /** @param {string} key @param {any} fallback */
  const pick = (key, fallback) => (s.p[key] === undefined ? fallback : s.p[key]);
  const sentReason = reasonOf(s.p.duplicateReason);
  /** @type {AwardInput} */
  const input = {
    recipientType: adj.recipientType,
    recipientIds: [adj.recipientId],
    name: pick('name', adj.name),
    translation: pick('translation', adj.translation),
    note: pick('note', adj.note),
    points: pick('points', adj.points),
    duplicateReason: sentReason === undefined ? adj.duplicateReason : sentReason,
  };
  const error = validateAward(input, s.event);
  if (error) return { error };
  const name = cleanText(input.name);
  let reason = input.duplicateReason ? cleanText(input.duplicateReason) : null;
  // A rename checks duplicates again, and so does clearing a kept duplicate's reason (it may go
  // only once the award no longer duplicates anything). Changing only the points never checks.
  if (normalizeName(name) !== normalizeName(adj.name) || (adj.duplicateReason && !reason)) {
    const existing = duplicatesOf(s.event, { ...adj, name }).map((a) => a.id);
    if (existing.length && !reason) {
      return fail('duplicate_award', 'the same award was already given: keep it with a reason', {
        field: 'name',
        ids: existing,
      });
    }
    if (!existing.length) reason = null;
  }
  const adjustments = replaceById(s.event.adjustments, adj.id, (a) => ({
    ...a,
    name,
    translation: text(input.translation ?? ''),
    note: text(input.note ?? ''),
    points: input.points,
    duplicateReason: reason,
    updatedAt: s.now,
  }));
  return done({ ...s.event, adjustments }, [{ type: 'awardEdited', roundId: adj.roundId, ids: [adj.id] }], [adj.id]);
}

/** @type {Handler} */
function removeAward(s) {
  const found = draftFor(s, 'removeAward');
  if ('error' in found) return found;
  const { adj } = found;
  const adjustments = replaceById(s.event.adjustments, adj.id, (a) => ({
    ...a,
    status: /** @type {const} */ ('discarded'),
    updatedAt: s.now,
  }));
  return done({ ...s.event, adjustments }, [{ type: 'awardRemoved', roundId: adj.roundId, ids: [adj.id] }], [adj.id]);
}

// ── Mid-game ──────────────────────────────────────────────────────────────────────────────────

/** @type {Handler} */
function addTeamMidGame(s) {
  const e = s.event;
  if (e.phase !== 'running') {
    return fail('wrong_phase', e.phase === 'setup' ? 'in Setup, use addTeam' : 'the event is over');
  }
  const performing = e.roundPhase === 'performances';
  const made = newTeam(s, performing ? e.roundIndex : e.roundIndex + 1);
  if ('error' in made) return made;
  const { team } = made;
  const rounds = performing
    ? withRound(e, e.roundIndex, (r) => ({
        ...r,
        order: [...r.order, team.id],
        admittedTeams: [...r.admittedTeams, team.id],
      }))
    : e.rounds;
  return done({ ...e, teams: [...e.teams, team], rounds }, [{ type: 'teamAdded', teamId: team.id }], [team.id]);
}

/**
 * Who a correction names: a team, a roster member, or a removed member known from a published
 * award (their published name and team).
 * @param {LarpEvent} event
 * @param {RecipientType} type
 * @param {string} id
 * @returns {{ name: string, teamId: string } | null}
 */
function correctionRecipient(event, type, id) {
  if (type === 'team') {
    const team = event.teams.find((t) => t.id === id);
    return team ? { name: team.name, teamId: team.id } : null;
  }
  const member = event.roster.find((m) => m.id === id);
  if (member) return { name: member.name, teamId: member.teamId };
  for (const result of event.results) {
    const a = result.adjustments.find((x) => x.recipientType === 'member' && x.recipientId === id);
    if (a) return { name: a.recipientName, teamId: a.teamId };
  }
  return null;
}

/** @type {Handler} */
function addCorrection(s) {
  const e = s.event;
  if (e.phase === 'setup') return fail('wrong_phase', 'nothing is published yet');
  const { recipientType, recipientId, points, reason, translation, note } = s.p;
  if (recipientType !== 'team' && recipientType !== 'member') {
    return fail('bad_payload', "recipientType must be 'team' or 'member'", { field: 'recipientType' });
  }
  if (!isId(recipientId)) return fail('bad_payload', 'recipientId is required', { field: 'recipientId' });
  const who = correctionRecipient(e, recipientType, recipientId);
  if (!who) {
    return fail('not_found', `no ${recipientType} ${recipientId}`, { field: 'recipientId', ids: [recipientId] });
  }
  if (!isPoints(points)) return fail('invalid_points', 'points must be a safe whole number', { field: 'points' });
  if (points === 0) return fail('zero_correction', 'a correction must change the score');
  if (typeof reason !== 'string' || !cleanText(reason) || codePoints(cleanText(reason)) > LIMITS.reason) {
    return fail('invalid_reason', `the public reason must be 1–${LIMITS.reason} characters`, { field: 'reason' });
  }
  for (const [field, value, max] of /** @type {const} */ ([
    ['translation', translation, LIMITS.reasonTranslation],
    ['note', note, LIMITS.note],
  ])) {
    if (value !== undefined && (typeof value !== 'string' || codePoints(cleanText(value)) > max)) {
      return fail('invalid_text', `${field} must be text of at most ${max}`, { field });
    }
  }
  let roundId = s.p.roundId ?? null;
  const targetId = s.p.targetAdjustmentId ?? null;
  if (roundId !== null && !e.results.some((r) => r.roundId === roundId)) {
    return fail('not_found', `${roundId} has no published result`, { field: 'roundId', ids: [String(roundId)] });
  }
  if (targetId !== null) {
    const target = e.results.flatMap((r) => r.adjustments).find((a) => a.id === targetId);
    if (!target) {
      return fail('not_found', `no published award ${targetId}`, {
        field: 'targetAdjustmentId',
        ids: [String(targetId)],
      });
    }
    if (
      target.recipientType !== recipientType ||
      target.recipientId !== recipientId ||
      (roundId ?? target.roundId) !== target.roundId
    ) {
      return fail('bad_payload', 'the correction must name the same recipient and round as its award', {
        field: 'targetAdjustmentId',
      });
    }
    roundId = target.roundId;
  }
  /** @type {Correction} */
  const correction = {
    id: s.id('corr'),
    recipientType,
    recipientId,
    recipientName: who.name,
    teamId: who.teamId,
    points,
    reason: cleanText(reason),
    translation: text(translation),
    note: text(note),
    roundId,
    targetAdjustmentId: targetId,
    authorId: s.cmd.actorId,
    createdAt: s.now,
  };
  return done(
    { ...e, corrections: [...e.corrections, correction] },
    [{ type: 'correctionAdded', teamId: who.teamId, ids: [correction.id] }],
    [correction.id],
  );
}

/** @type {Record<CommandType, Handler>} */
const HANDLERS = {
  addTeam,
  editTeam,
  removeTeam,
  addMember,
  addMembers,
  editMember,
  removeMember,
  addGm,
  editGm,
  removeGm,
  editRound,
  setConfig,
  startEvent,
  nextRound,
  startPreparation,
  endPreparation,
  nextTeam,
  beginReview,
  reopenJudging,
  publishRound,
  skipRound,
  endEvent,
  startTimer: startTimerCommand,
  pauseTimer: pauseTimerCommand,
  resumeTimer: resumeTimerCommand,
  addTime: addTimeCommand,
  setStatus,
  addAward,
  editAward,
  removeAward,
  revealAdvance,
  revealPause,
  revealResume,
  revealSkip,
  revealReplay,
  addTeamMidGame,
  addCorrection,
};

const KNOWN_COMMANDS = new Set(COMMAND_TYPES);

/**
 * What roles.check needs to know about the command's target: the would-be author of a new
 * award, or the stored award an edit or removal aims at.
 * @param {LarpEvent} event
 * @param {CommandType} type
 * @param {Record<string, any>} p
 */
function roleTarget(event, type, p) {
  if (type === 'addAward') return { authorId: p.authorId };
  if (type === 'editAward' || type === 'removeAward') return event.adjustments.find((a) => a.id === p.adjustmentId);
  return undefined;
}

// ── reduce ────────────────────────────────────────────────────────────────────────────────────

/**
 * Applies one command. Order of checks: a repeated command id (in seenCommandIds) → the input
 * unchanged with duplicate: true; a malformed command → 'bad_command'; an unknown type →
 * 'unknown_command'; roles.check; phase legality; payload validation; derived totals still safe
 * ('unsafe_total'). On any error the input event comes back unchanged with events []. On success
 * a new event with revision + 1, updatedAt = ctx.now, the command id remembered (bounded by
 * LIMITS.maxSeenCommands) and a HistoryEntry appended. A missing or broken ctx is a programming
 * error and throws a TypeError.
 * @param {LarpEvent} event
 * @param {Command} command
 * @param {ReduceContext} ctx
 * @returns {ReduceResult}
 */
export function reduce(event, command, ctx) {
  if (!ctx || !Number.isSafeInteger(ctx.now) || typeof ctx.newId !== 'function') {
    throw new TypeError('reduce() needs ctx { now: epoch ms, newId(kind) }');
  }
  /** @param {LarpError} error @returns {ReduceResult} */
  const reject = (error) => ({ event, events: [], error });

  if (isRecord(command) && isId(command.id) && event.seenCommandIds.includes(command.id)) {
    return { event, events: [], error: null, duplicate: true };
  }
  if (
    !isRecord(command) ||
    !isId(command.id) ||
    typeof command.type !== 'string' ||
    !isId(command.actorId) ||
    typeof command.mode !== 'string'
  ) {
    return reject(larpError('bad_command', 'a command needs an id, type, actorId and mode'));
  }
  const { type } = command;
  if (!KNOWN_COMMANDS.has(type)) return reject(larpError('unknown_command', `unknown command ${type}`));

  const payload = command.payload ?? {};
  const p = isRecord(payload) ? payload : {};
  const roleError = roleCheck({ gmId: command.actorId, mode: command.mode }, type, event, roleTarget(event, type, p));
  if (roleError) return reject(roleError);
  if (!isRecord(payload)) return reject(larpError('bad_payload', 'the payload must be an object'));

  const out = HANDLERS[type]({ event, p, cmd: command, now: ctx.now, id: idMaker(ctx.newId, event) });
  if ('error' in out) return reject(out.error);
  if (SCORING_COMMANDS.has(type) && !totalsSafe(out.next)) {
    return reject(larpError('unsafe_total', 'a total would leave the safe integer range'));
  }

  const revision = event.revision + 1;
  const seen = [...event.seenCommandIds, command.id];
  /** @type {import('./types.js').HistoryEntry} */
  const entry = {
    revision,
    commandId: command.id,
    type,
    actorId: command.actorId,
    mode: command.mode,
    at: Number.isSafeInteger(command.at) ? command.at : ctx.now,
    ids: out.ids,
  };
  return {
    event: {
      ...out.next,
      revision,
      updatedAt: ctx.now,
      seenCommandIds: seen.length > LIMITS.maxSeenCommands ? seen.slice(-LIMITS.maxSeenCommands) : seen,
      history: [...event.history, entry],
    },
    events: out.events,
    error: null,
  };
}

// ── projection ────────────────────────────────────────────────────────────────────────────────

/**
 * The public projection the display renders (and the channel posts): see the Projection type.
 * Built field by field from public data only, so nothing private can slip in by spreading a
 * record: published results without authors, notes, duplicate reasons or command ids;
 * corrections without authors or notes; members only with config.showMembers; individual
 * leaders (the top LEADER_PLACES places, positive totals only) once the event is finished.
 * @param {LarpEvent} event
 * @param {number} now
 * @returns {Projection}
 */
export function projection(event, now) {
  const round = currentRound(event);
  const category = round ? ROUND_CATEGORIES.find((c) => c.key === round.category) : undefined;
  const performing = event.roundPhase === 'performances';
  const queue = round ? [...round.order] : [];
  const midGame = new Set(event.rounds.flatMap((r) => r.admittedTeams));
  const { config } = event;

  return {
    eventId: event.id,
    revision: event.revision,
    now,
    phase: event.phase,
    roundIndex: event.roundIndex,
    roundPhase: event.roundPhase,
    roundCount: event.rounds.length,
    config: {
      title: config.title,
      displayMode: config.displayMode,
      scenery: config.scenery,
      reducedMotion: config.reducedMotion,
      sound: config.sound,
    },
    round:
      round && category
        ? {
            id: round.id,
            index: event.roundIndex,
            category: round.category,
            vi: category.vi,
            en: category.en,
            prompt: round.prompt,
            promptTranslation: round.promptTranslation,
            base: round.base,
            turnMs: round.turnMs,
            calm: category.calm,
            flame: category.flame,
          }
        : null,
    teams: event.teams.map((t) => ({
      id: t.id,
      name: t.name,
      translation: t.translation,
      color: t.color,
      emblem: t.emblem,
      patron: t.patron,
      admittedRound: t.admittedRound,
      isNew: t.admittedRound > 0 || midGame.has(t.id),
    })),
    members: config.showMembers ? event.roster.map((m) => ({ id: m.id, name: m.name, teamId: m.teamId })) : [],
    queue,
    currentTeamId: performing ? (queue[event.currentTurn] ?? null) : null,
    nextTeamId: performing
      ? (queue[event.currentTurn + 1] ?? null)
      : event.roundPhase === 'briefing' || event.roundPhase === 'preparation'
        ? (queue[0] ?? null)
        : null,
    timer: { ...event.timer },
    timerRemainingMs: remaining(event.timer, now),
    reveal: event.reveal ? { ...event.reveal } : null,
    revealSteps: event.reveal ? revealSteps(event, event.reveal.roundId) : [],
    results: event.results.map((r) => ({
      roundId: r.roundId,
      roundIndex: r.roundIndex,
      base: r.base,
      completion: Object.fromEntries(
        Object.entries(r.completion).map(([teamId, c]) => [teamId, { status: c.status, points: c.points }]),
      ),
      adjustments: r.adjustments.map((a) => ({
        id: a.id,
        roundId: a.roundId,
        recipientType: a.recipientType,
        recipientId: a.recipientId,
        recipientName: a.recipientName,
        teamId: a.teamId,
        name: a.name,
        translation: a.translation,
        points: a.points,
        batchId: a.batchId,
      })),
      teamRoundScores: { ...r.teamRoundScores },
      publishedAt: r.publishedAt,
    })),
    corrections: event.corrections.map((c) => ({
      id: c.id,
      recipientType: c.recipientType,
      recipientId: c.recipientId,
      recipientName: c.recipientName,
      teamId: c.teamId,
      points: c.points,
      reason: c.reason,
      translation: c.translation,
      roundId: c.roundId,
      targetAdjustmentId: c.targetAdjustmentId,
      createdAt: c.createdAt,
    })),
    standings: standings(event),
    leaders: event.phase === 'finished' ? leaders(event) : [],
  };
}

/**
 * The leading individuals: members ranked by individual total, the top LEADER_PLACES places,
 * never a zero or negative total; each with the name and team they're known by (a removed
 * member by their published name).
 * @param {LarpEvent} event
 * @returns {Projection['leaders']}
 */
function leaders(event) {
  const totals = memberTotals(event);
  /** @type {Map<string, { name: string, teamId: string }>} */
  const known = new Map();
  for (const r of event.results) {
    for (const a of r.adjustments) {
      if (a.recipientType === 'member') known.set(a.recipientId, { name: a.recipientName, teamId: a.teamId });
    }
  }
  for (const c of event.corrections) {
    if (c.recipientType === 'member' && !known.has(c.recipientId)) {
      known.set(c.recipientId, { name: c.recipientName, teamId: c.teamId });
    }
  }
  for (const m of event.roster) known.set(m.id, { name: m.name, teamId: m.teamId });
  return rank(Object.entries(totals).map(([id, total]) => ({ id, total })))
    .filter((r) => r.total > 0 && r.place <= LEADER_PLACES)
    .map((r) => ({ ...r, name: known.get(r.id)?.name ?? '', teamId: known.get(r.id)?.teamId ?? '' }));
}
