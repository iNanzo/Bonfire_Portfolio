// Deterministic builders for the campfire game's tests (src/larp/): a laptop clock you move by
// hand (makeClock), readable ids (makeIds), events built as plain objects straight from the
// types (not through state.js's reducer, so each module can be tested on its own): a set-up event
// with n teams (eventWithTeams), the same event put at a round and phase (atRound), awards
// (makeAdjustment, withAwards), published rounds computed by hand (makeResult, withPublished),
// commands (commander), a localStorage stand-in (fakeStorage) and deepFreeze, to prove a function
// never mutates what it's given. Only types.js is imported: its constants are real data.
import {
  DEFAULT_CONFIG,
  EMBLEMS,
  HOST_GM_ID,
  ROUND_CATEGORIES,
  SCHEMA_VERSION,
  TEAM_COLORS,
} from '../../src/larp/types.js';

/**
 * @typedef {import('../../src/larp/types.js').LarpEvent} LarpEvent
 * @typedef {import('../../src/larp/types.js').Round} Round
 * @typedef {import('../../src/larp/types.js').Team} Team
 * @typedef {import('../../src/larp/types.js').RosterMember} RosterMember
 * @typedef {import('../../src/larp/types.js').GM} GM
 * @typedef {import('../../src/larp/types.js').Adjustment} Adjustment
 * @typedef {import('../../src/larp/types.js').PublishedResult} PublishedResult
 * @typedef {import('../../src/larp/types.js').PublishedAdjustment} PublishedAdjustment
 * @typedef {import('../../src/larp/types.js').CompletionStatus} CompletionStatus
 * @typedef {import('../../src/larp/types.js').RoundPhase} RoundPhase
 * @typedef {import('../../src/larp/types.js').Timer} Timer
 * @typedef {import('../../src/larp/types.js').Command} Command
 * @typedef {import('../../src/larp/types.js').CommandType} CommandType
 * @typedef {import('../../src/larp/types.js').IdGen} IdGen
 */

/** The fixtures' "now": 2026-10-10 18:00 UTC. */
export const T0 = Date.UTC(2026, 9, 10, 18, 0, 0);

/**
 * A clock that only moves when told.
 * @param {number} [start]
 */
export function makeClock(start = T0) {
  let t = start;
  return {
    now: () => t,
    /** @param {number} ms */
    advance(ms) {
      t += ms;
      return t;
    },
    /** @param {number} at */
    set(at) {
      t = at;
      return t;
    },
  };
}

/**
 * An id generator: `${prefix}-${kind}-${n}`, one counter for every kind ('p-team-1', 'p-adj-2').
 * @param {string} [prefix]
 * @returns {IdGen}
 */
export function makeIds(prefix = 'id') {
  let n = 0;
  return (kind = 'id') => `${prefix}-${kind}-${++n}`;
}

/** @returns {Timer} */
export const noTimer = () => ({ kind: null, status: 'idle', durationMs: 0, deadline: null, remainingMs: null });

/**
 * The five rounds as defaultRounds() should make them (ids 'round-<key>').
 * @returns {Round[]}
 */
export function makeRounds() {
  return ROUND_CATEGORIES.map((c) => ({
    id: `round-${c.key}`,
    category: c.key,
    prompt: c.prompt,
    promptTranslation: '',
    base: c.base,
    prepMs: c.prepMs,
    turnMs: c.turnMs,
    transitionMs: c.transitionMs,
    reviewRevealMs: c.reviewRevealMs,
    order: [],
    statuses: {},
    skipped: false,
    admittedTeams: [],
  }));
}

/**
 * An event as createEvent({ id, now }) should make it: Setup, the host GM, the five rounds.
 * @param {{ id?: string, now?: number }} [opts]
 * @returns {LarpEvent}
 */
export function blankEvent({ id = 'event-1', now = T0 } = {}) {
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
    rounds: makeRounds(),
    adjustments: [],
    results: [],
    corrections: [],
    timer: noTimer(),
    reveal: null,
    seenCommandIds: [],
    history: [],
  };
}

/**
 * A set-up event with `n` teams ('team-1' … , named 'Đội 1' / 'Team 1'), `membersPerTeam`
 * members each ('m-<team>-<k>', the first a captain) and `gms` co-GMs ('gm-1' …, 'Anh 1' …).
 * @param {number} n
 * @param {{ membersPerTeam?: number, gms?: number, id?: string, now?: number }} [opts]
 * @returns {LarpEvent}
 */
export function eventWithTeams(n, { membersPerTeam = 0, gms = 0, id, now } = {}) {
  const event = blankEvent({ id, now });
  /** @type {Team[]} */
  const teams = Array.from({ length: n }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `Đội ${i + 1}`,
    translation: `Team ${i + 1}`,
    color: TEAM_COLORS[i % TEAM_COLORS.length],
    emblem: EMBLEMS[i % EMBLEMS.length],
    patron: '',
    admittedRound: 0,
  }));
  /** @type {RosterMember[]} */
  const roster = teams.flatMap((team, i) =>
    Array.from({ length: membersPerTeam }, (_, k) => ({
      id: `m-${i + 1}-${k + 1}`,
      name: `Member ${i + 1}.${k + 1}`,
      teamId: team.id,
      captain: k === 0,
    })),
  );
  /** @type {GM[]} */
  const coGms = Array.from({ length: gms }, (_, i) => ({ id: `gm-${i + 1}`, name: `Anh ${i + 1}`, host: false }));
  return { ...event, teams, roster, gms: [...event.gms, ...coGms] };
}

/**
 * The teams taking part in round `roundIndex`, rotated left by roundIndex (what
 * config.performanceQueue should give).
 * @param {Team[]} teams
 * @param {number} roundIndex
 * @returns {string[]}
 */
export function rotatedQueue(teams, roundIndex) {
  const ids = teams.filter((t) => t.admittedRound <= roundIndex).map((t) => t.id);
  if (!ids.length) return [];
  const k = roundIndex % ids.length;
  return [...ids.slice(k), ...ids.slice(0, k)];
}

/**
 * The event, running, at round `roundIndex` in `roundPhase`: the round's queue built
 * (rotatedQueue, unless it already has one), statuses merged in, currentTurn as given (default
 * -1). Earlier rounds are left as they are (publish them with withPublished).
 * @param {LarpEvent} event
 * @param {number} roundIndex
 * @param {RoundPhase} roundPhase
 * @param {{ statuses?: Record<string, CompletionStatus>, currentTurn?: number, timer?: Timer }} [opts]
 * @returns {LarpEvent}
 */
export function atRound(event, roundIndex, roundPhase, { statuses = {}, currentTurn = -1, timer } = {}) {
  const rounds = event.rounds.map((r, i) =>
    i === roundIndex
      ? {
          ...r,
          order: r.order.length ? r.order : rotatedQueue(event.teams, roundIndex),
          statuses: { ...r.statuses, ...statuses },
        }
      : r,
  );
  return {
    ...event,
    phase: 'running',
    startedAt: event.startedAt ?? event.createdAt,
    roundIndex,
    roundPhase,
    currentTurn,
    rounds,
    timer: timer ?? noTimer(),
  };
}

/**
 * An adjustment: a +50 'Sáng Tạo / Creativity' draft for team-1 in round 1 from the host, unless
 * overridden. `batchId` defaults to 'batch-<id>'.
 * @param {Partial<Adjustment>} [over]
 * @returns {Adjustment}
 */
export function makeAdjustment(over = {}) {
  const id = over.id ?? 'adj-1';
  return {
    id,
    roundId: 'round-faith',
    recipientType: 'team',
    recipientId: 'team-1',
    name: 'Sáng Tạo',
    translation: 'Creativity',
    points: 50,
    authorId: HOST_GM_ID,
    note: '',
    batchId: `batch-${id}`,
    status: 'draft',
    duplicateReason: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

/**
 * The event with these awards added as drafts (ids 'adj-<n>' continuing from the event's count;
 * roundId defaults to the current round's, or round 1's).
 * @param {LarpEvent} event
 * @param {Partial<Adjustment>[]} list
 * @returns {LarpEvent}
 */
export function withAwards(event, list) {
  const roundId = event.rounds[Math.max(0, event.roundIndex)].id;
  const added = list.map((over, i) =>
    makeAdjustment({ roundId, id: `adj-${event.adjustments.length + i + 1}`, ...over }),
  );
  return { ...event, adjustments: [...event.adjustments, ...added] };
}

/**
 * A round's published result, computed by hand: completion for every team in the round's queue
 * (or every team admitted by then, when the queue is empty), from `statuses` (default
 * 'complete'); the round's draft adjustments (or `adjustments`) frozen with each recipient's
 * team and name; teamRoundScores = completion + team awards.
 * @param {LarpEvent} event
 * @param {string} roundId
 * @param {{ statuses?: Record<string, CompletionStatus>, adjustments?: Adjustment[], publishedAt?: number, commandId?: string }} [opts]
 * @returns {PublishedResult}
 */
export function makeResult(event, roundId, opts = {}) {
  const roundIndex = event.rounds.findIndex((r) => r.id === roundId);
  const round = event.rounds[roundIndex];
  const order = round.order.length ? round.order : rotatedQueue(event.teams, roundIndex);
  const statuses = { ...round.statuses, ...opts.statuses };
  const drafts = opts.adjustments ?? event.adjustments.filter((a) => a.roundId === roundId && a.status === 'draft');
  /** @type {PublishedAdjustment[]} */
  const adjustments = drafts.map((a) => {
    const member = a.recipientType === 'member' ? event.roster.find((m) => m.id === a.recipientId) : undefined;
    const team = event.teams.find((t) => t.id === (member ? member.teamId : a.recipientId));
    return {
      id: a.id,
      roundId: a.roundId,
      recipientType: a.recipientType,
      recipientId: a.recipientId,
      recipientName: member ? member.name : (team?.name ?? ''),
      teamId: team?.id ?? '',
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
  for (const teamId of order) {
    const status = statuses[teamId] ?? 'complete';
    const points = status === 'complete' ? round.base : 0;
    completion[teamId] = { status, points };
    teamRoundScores[teamId] =
      points +
      adjustments
        .filter((a) => a.recipientType === 'team' && a.recipientId === teamId)
        .reduce((s, a) => s + a.points, 0);
  }
  return {
    roundId,
    roundIndex,
    base: round.base,
    commandId: opts.commandId ?? `cmd-publish-${roundId}`,
    completion,
    adjustments,
    teamRoundScores,
    publishedAt: opts.publishedAt ?? T0,
  };
}

/**
 * The event with round `roundId` published by hand (makeResult): the result appended, the
 * round's statuses and queue filled in, its drafts marked published. The phase is left alone.
 * @param {LarpEvent} event
 * @param {string} roundId
 * @param {Parameters<typeof makeResult>[2]} [opts]
 * @returns {LarpEvent}
 */
export function withPublished(event, roundId, opts = {}) {
  const result = makeResult(event, roundId, opts);
  const published = new Set(result.adjustments.map((a) => a.id));
  return {
    ...event,
    rounds: event.rounds.map((r) =>
      r.id === roundId
        ? {
            ...r,
            order: Object.keys(result.completion),
            statuses: Object.fromEntries(Object.entries(result.completion).map(([id, c]) => [id, c.status])),
          }
        : r,
    ),
    adjustments: event.adjustments.map((a) => (published.has(a.id) ? { ...a, status: 'published' } : a)),
    results: [...event.results, result],
  };
}

/**
 * Command builders: host(type, payload) as the host GM, judge(gmId, type, payload) in Judge
 * Mode; each gets a fresh id ('cmd-<n>') unless `extra.id` repeats one (a double-click).
 * @param {{ clock?: ReturnType<typeof makeClock> }} [opts]
 */
export function commander({ clock = makeClock() } = {}) {
  let n = 0;
  /**
   * @param {string} actorId
   * @param {'host'|'judge'} mode
   * @param {CommandType} type
   * @param {any} payload
   * @param {Partial<Command>} extra
   * @returns {Command}
   */
  const make = (actorId, mode, type, payload, extra) => ({
    id: `cmd-${++n}`,
    type,
    actorId,
    mode,
    payload,
    at: clock.now(),
    ...extra,
  });
  return {
    /** @param {CommandType} type @param {any} [payload] @param {Partial<Command>} [extra] */
    host: (type, payload = {}, extra = {}) => make(HOST_GM_ID, 'host', type, payload, extra),
    /** @param {string} gmId @param {CommandType} type @param {any} [payload] @param {Partial<Command>} [extra] */
    judge: (gmId, type, payload = {}, extra = {}) => make(gmId, 'judge', type, payload, extra),
  };
}

/**
 * A localStorage stand-in: `capacity` in characters (keys + values) past which a write throws
 * like a full localStorage; `failFrom`: every write from the Nth on throws; `failReads`: getItem
 * throws (a blocked storage).
 * @param {{ capacity?: number, failFrom?: number, failReads?: boolean }} [opts]
 */
export function fakeStorage({ capacity = Infinity, failFrom = Infinity, failReads = false } = {}) {
  const m = new Map();
  let writes = 0;
  const size = () => [...m].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
  const quota = () => Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
  return {
    map: m,
    get writes() {
      return writes;
    },
    /** @param {string} k */
    getItem(k) {
      if (failReads) throw Object.assign(new Error('SecurityError'), { name: 'SecurityError' });
      return m.has(k) ? m.get(k) : null;
    },
    /** @param {string} k @param {string} v */
    setItem(k, v) {
      writes++;
      const was = m.get(k);
      if (writes >= failFrom) throw quota();
      m.set(k, String(v));
      if (size() > capacity) {
        if (was === undefined) m.delete(k);
        else m.set(k, was);
        throw quota();
      }
    },
    /** @param {string} k */
    removeItem(k) {
      m.delete(k);
    },
  };
}

/**
 * Freezes a value and everything in it (to prove a pure function doesn't mutate its input).
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
