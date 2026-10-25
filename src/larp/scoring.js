// The campfire game's scoring: award validation, round scores, team and member totals, ranking,
// review flags and the live preview. Pure; no DOM. Totals are always derived from published
// results + corrections, never stored.
//
//   validateAward(input, event)  an AwardInput's fields → the first LarpError, or null
//   isPoints(v)                  a safe integer (zero and negatives allowed)
//   exactSum(values)             an exact sum of whole numbers, NaN outside the safe range
//   isLarge(points, base)        |points| > base: flagged for review, never changed
//   teamRoundScore               completion (base when 'complete') + the team's team awards
//   teamTotals / memberTotals    Σ published teamRoundScores (or member awards) + corrections
//   totalsSafe(event)            every derived total (and every preview score) a safe integer
//   rank(entries)                highest first; ties share a place and skip (1, 1, 3)
//   standings(event)             the ranked team totals with movement since the previous round
//   flags(event, roundId)        duplicates, large values, teams without individual awards,
//                                teams with no status, among a round's drafts
//   previewRound(event, roundId) the round's scores and totals as they'd be if published now
//   isDuplicate / duplicatesOf   same round, recipient and normalizeName(name)
//
// Individual awards never add to team scores; corrections never re-apply completion.
/**
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Round} Round
 * @typedef {import('./types.js').Adjustment} Adjustment
 * @typedef {import('./types.js').AwardInput} AwardInput
 * @typedef {import('./types.js').LarpError} LarpError
 * @typedef {import('./types.js').RankedEntry} RankedEntry
 * @typedef {import('./types.js').StandingRow} StandingRow
 * @typedef {import('./types.js').RecipientType} RecipientType
 */
import { performanceQueue } from './config.js';
import { cleanText, normalizeName } from './strings.js';
import { LIMITS, larpError } from './types.js';

/**
 * What duplicate checks compare (an Adjustment, a PublishedAdjustment or a candidate award).
 * @typedef {{ id?: string, roundId: string, recipientType: RecipientType, recipientId: string, name: string }} AwardKey
 */

/**
 * A round's review flags (drafts only). `duplicates`: groups of ≥ 2 adjustment ids sharing a
 * duplicate key. `large`: adjustment ids with |points| > the round's base. `teamsWithoutIndividual`:
 * queued teams none of whose members has an individual award this round. `unsetStatuses`:
 * queued teams with no completion status (these block publishing).
 * @typedef {{ duplicates: string[][], large: string[], teamsWithoutIndividual: string[], unsetStatuses: string[] }} ReviewFlags
 */

/**
 * A round as it would publish now (drafts counted, an unset status counted as zero).
 * `teamRoundScores` per queued team; `projectedTotals` every team's total with this round
 * added; `memberPoints` each member's individual points in this round (members with awards only).
 * @typedef {{
 *   teamRoundScores: Record<string, number>, projectedTotals: Record<string, number>,
 *   memberPoints: Record<string, number>,
 * }} RoundPreview
 */

/**
 * Checks an award's fields: name required (cleanText) within LIMITS.awardName; translation,
 * note and duplicateReason within theirs; points a safe integer; recipientIds non-empty, without
 * repeats, each an existing team or roster member per recipientType; authorId (when given) an
 * existing GM. Doesn't check roles, phases or duplicates.
 *
 * Checked in this order (the first failure is returned): the input is an object ('bad_payload'),
 * recipientType ('bad_payload'), recipients ('no_recipients' for none, a repeat or an id of the
 * other kind; 'not_found' with `ids` for unknown ones), name ('invalid_name'), translation and
 * note ('invalid_text'), points ('invalid_points'), duplicateReason ('invalid_reason': present
 * but blank or too long; null/undefined means none), authorId ('not_found').
 * @param {AwardInput} input
 * @param {LarpEvent} event
 * @returns {LarpError|null}
 */
export function validateAward(input, event) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return larpError('bad_payload', 'award must be an object');
  }
  const { recipientType, recipientIds } = input;
  if (recipientType !== 'team' && recipientType !== 'member') {
    return larpError('bad_payload', "recipientType must be 'team' or 'member'", { field: 'recipientType' });
  }
  const recipientError = checkRecipients(recipientType, recipientIds, event);
  if (recipientError) return recipientError;

  if (typeof input.name !== 'string' || !cleanText(input.name)) {
    return larpError('invalid_name', 'award name is required', { field: 'name' });
  }
  if (length(cleanText(input.name)) > LIMITS.awardName) {
    return larpError('invalid_name', `award name is longer than ${LIMITS.awardName}`, { field: 'name' });
  }
  for (const [field, limit] of /** @type {const} */ ([
    ['translation', LIMITS.awardTranslation],
    ['note', LIMITS.note],
  ])) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || length(cleanText(value)) > limit) {
      return larpError('invalid_text', `${field} must be text of at most ${limit}`, { field });
    }
  }
  if (!isPoints(input.points)) {
    return larpError('invalid_points', 'points must be a safe whole number', { field: 'points' });
  }
  const reason = input.duplicateReason;
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string' || !cleanText(reason) || length(cleanText(reason)) > LIMITS.duplicateReason) {
      return larpError('invalid_reason', `duplicateReason must be 1–${LIMITS.duplicateReason} characters`, {
        field: 'duplicateReason',
      });
    }
  }
  if (input.authorId !== undefined && !event.gms.some((g) => g.id === input.authorId)) {
    return larpError('not_found', 'no such GM', { field: 'authorId', ids: [String(input.authorId)] });
  }
  return null;
}

/**
 * The recipients' check for validateAward.
 * @param {RecipientType} recipientType
 * @param {unknown} recipientIds
 * @param {LarpEvent} event
 * @returns {LarpError|null}
 */
function checkRecipients(recipientType, recipientIds, event) {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return larpError('no_recipients', 'choose at least one recipient', { field: 'recipientIds' });
  }
  if (!recipientIds.every((id) => typeof id === 'string')) {
    return larpError('no_recipients', 'recipient ids must be text', { field: 'recipientIds' });
  }
  const seen = new Set();
  const repeated = [];
  for (const id of recipientIds) {
    if (seen.has(id) && !repeated.includes(id)) repeated.push(id);
    seen.add(id);
  }
  if (repeated.length) {
    return larpError('no_recipients', 'a recipient is listed twice', { field: 'recipientIds', ids: repeated });
  }
  const teamIds = new Set(event.teams.map((t) => t.id));
  const memberIds = new Set(event.roster.map((m) => m.id));
  const [own, other] = recipientType === 'team' ? [teamIds, memberIds] : [memberIds, teamIds];
  const wrongKind = recipientIds.filter((id) => !own.has(id) && other.has(id));
  if (wrongKind.length) {
    return larpError('no_recipients', `not a ${recipientType}`, { field: 'recipientIds', ids: wrongKind });
  }
  const missing = recipientIds.filter((id) => !own.has(id));
  if (missing.length) {
    return larpError('not_found', `no such ${recipientType}`, { field: 'recipientIds', ids: missing });
  }
  return null;
}

/**
 * A string's length in code points (how LIMITS count).
 * @param {string} s
 */
const length = (s) => [...s].length;

/**
 * Whether `v` is a valid points value: a safe integer (0 and negatives allowed).
 * @param {unknown} v
 * @returns {boolean}
 */
export function isPoints(v) {
  return Number.isSafeInteger(v);
}

/**
 * Whether an adjustment is large enough to flag: |points| > the round's base.
 * @param {number} points
 * @param {number} base
 * @returns {boolean}
 */
export function isLarge(points, base) {
  return Math.abs(points) > base;
}

/**
 * Sums whole numbers exactly (BigInt), so the order never matters and nothing wraps or rounds:
 * the exact sum when it is a safe integer, NaN otherwise (or when any term isn't an integer).
 * NaN is the "unsafe" flag totalsSafe() looks for; reduce() never lets one be saved.
 * @param {Iterable<number>} values
 * @returns {number}
 */
export function exactSum(values) {
  let sum = 0n;
  for (const v of values) {
    if (!Number.isInteger(v)) return NaN;
    sum += BigInt(v);
  }
  const n = Number(sum);
  return Number.isSafeInteger(n) && BigInt(n) === sum ? n : NaN;
}

/**
 * Adds `points` to `record[id]` (missing = none yet), collecting the terms for exactSum.
 * @param {Map<string, number[]>} terms
 * @param {string} id
 * @param {number} points
 */
function addTerm(terms, id, points) {
  const list = terms.get(id);
  if (list) list.push(points);
  else terms.set(id, [points]);
}

/**
 * The exact totals of collected terms, keyed in insertion order.
 * @param {Map<string, number[]>} terms
 * @returns {Record<string, number>}
 */
function sumTerms(terms) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [id, list] of terms) out[id] = exactSum(list);
  return out;
}

/**
 * A team's score in a round: the base when its status is 'complete' (else 0) plus the points of
 * its team awards among `adjustments` (the caller passes the ones that count: drafts for a
 * preview, the frozen ones at publication). Member awards and other rounds' awards are ignored.
 * NaN when the score isn't a safe integer.
 * @param {Round} round
 * @param {string} teamId
 * @param {Array<Pick<Adjustment, 'roundId'|'recipientType'|'recipientId'|'points'>>} adjustments
 * @returns {number}
 */
export function teamRoundScore(round, teamId, adjustments) {
  const completion = round.statuses[teamId] === 'complete' ? round.base : 0;
  const awards = adjustments
    .filter((a) => a.roundId === round.id && a.recipientType === 'team' && a.recipientId === teamId)
    .map((a) => a.points);
  return exactSum([completion, ...awards]);
}

/**
 * The terms of every team's total: its published teamRoundScores and its team corrections, with
 * every team keyed (in event order) even when it has none.
 * @param {LarpEvent} event
 * @param {(c: import('./types.js').Correction) => boolean} [keepCorrection]
 * @param {import('./types.js').PublishedResult[]} [results]
 */
function teamTerms(event, keepCorrection = () => true, results = event.results) {
  /** @type {Map<string, number[]>} */
  const terms = new Map(event.teams.map((t) => [t.id, []]));
  for (const result of results) {
    for (const [teamId, points] of Object.entries(result.teamRoundScores)) addTerm(terms, teamId, points);
  }
  for (const c of event.corrections) {
    if (c.recipientType === 'team' && keepCorrection(c)) addTerm(terms, c.recipientId, c.points);
  }
  return terms;
}

/**
 * Every team's total: Σ its published teamRoundScores + its team corrections. Every team has a
 * key (0 when nothing is published). Read from the frozen results, never from live drafts or
 * statuses. NaN for a total outside the safe integer range (see totalsSafe).
 * @param {LarpEvent} event
 * @returns {Record<string, number>}
 */
export function teamTotals(event) {
  return sumTerms(teamTerms(event));
}

/**
 * Every member's individual total: Σ their published member awards + their member corrections.
 * Every roster member has a key; a removed member with published points keeps theirs. Team
 * completion and team awards never count here. NaN for a total outside the safe integer range.
 * @param {LarpEvent} event
 * @returns {Record<string, number>}
 */
export function memberTotals(event) {
  /** @type {Map<string, number[]>} */
  const terms = new Map(event.roster.map((m) => [m.id, []]));
  for (const result of event.results) {
    for (const a of result.adjustments) if (a.recipientType === 'member') addTerm(terms, a.recipientId, a.points);
  }
  for (const c of event.corrections) {
    if (c.recipientType === 'member') addTerm(terms, c.recipientId, c.points);
  }
  return sumTerms(terms);
}

/**
 * Whether every derived total (team, member, and the current round's preview) is a safe integer.
 * reduce() rejects a command that would break this with 'unsafe_total'. Sums are exact, so only
 * the totals matter, never the order the terms were added in.
 * @param {LarpEvent} event
 * @returns {boolean}
 */
export function totalsSafe(event) {
  /** @type {number[]} */
  const all = [...Object.values(teamTotals(event)), ...Object.values(memberTotals(event))];
  const round = event.rounds[event.roundIndex];
  if (round) {
    const p = previewRound(event, round.id);
    all.push(...Object.values(p.teamRoundScores), ...Object.values(p.projectedTotals));
    all.push(...Object.values(p.memberPoints));
  }
  return all.every((n) => Number.isSafeInteger(n));
}

/**
 * Ranks entries highest total first. Ties share a place and the next place skips (1, 1, 3); tied
 * entries keep their input order (no hidden tiebreak). Doesn't mutate `entries`. A total that
 * isn't a number (an unsafe total) ranks last.
 * @param {Array<{ id: string, total: number }>} entries
 * @returns {RankedEntry[]}
 */
export function rank(entries) {
  const key = (/** @type {number} */ n) => (Number.isNaN(n) ? -Infinity : n);
  const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => key(b.e.total) - key(a.e.total) || a.i - b.i);
  /** @type {RankedEntry[]} */
  const out = [];
  sorted.forEach(({ e }, i) => {
    const prev = out[i - 1];
    const place = prev && key(prev.total) === key(e.total) ? prev.place : i + 1;
    out.push({ id: e.id, total: e.total, place });
  });
  return out;
}

/**
 * The team standings: rank(teamTotals) in event team order, each with `movement` = places gained
 * since before the most recent published result (null when fewer than two rounds are published,
 * or for a team that wasn't ranked then).
 *
 * "Before" is the standings without the latest result and without corrections added at or after
 * its publication; the teams ranked then are those in an earlier result's completion.
 * @param {LarpEvent} event
 * @returns {StandingRow[]}
 */
export function standings(event) {
  const totals = teamTotals(event);
  const ranked = rank(event.teams.map((t) => ({ id: t.id, total: totals[t.id] })));
  if (event.results.length < 2) return ranked.map((r) => ({ ...r, movement: null }));

  const latest = event.results[event.results.length - 1];
  const earlier = event.results.slice(0, -1);
  const rankedThen = new Set(earlier.flatMap((r) => Object.keys(r.completion)));
  const before = sumTerms(teamTerms(event, (c) => c.createdAt < latest.publishedAt, earlier));
  const placeThen = new Map(
    rank(event.teams.filter((t) => rankedThen.has(t.id)).map((t) => ({ id: t.id, total: before[t.id] }))).map((r) => [
      r.id,
      r.place,
    ]),
  );
  return ranked.map((r) => {
    const then = placeThen.get(r.id);
    return { ...r, movement: then === undefined ? null : then - r.place };
  });
}

/**
 * The round's performance queue: its `order`, or (before its Briefing builds one) the teams
 * admitted by then, as config.performanceQueue would build it.
 * @param {LarpEvent} event
 * @param {Round} round
 * @returns {string[]}
 */
function queueOf(event, round) {
  if (round.order.length) return round.order;
  return performanceQueue(round, event.teams, event.rounds.indexOf(round));
}

/**
 * A round's review flags, from its draft adjustments and its queue (an unknown round: none).
 * Teams with no roster members are never flagged as lacking individual recognition (there is no
 * one to recognize); a zero-point Recognition counts as recognition.
 * @param {LarpEvent} event
 * @param {string} roundId
 * @returns {ReviewFlags}
 */
export function flags(event, roundId) {
  const round = event.rounds.find((r) => r.id === roundId);
  /** @type {ReviewFlags} */
  const out = { duplicates: [], large: [], teamsWithoutIndividual: [], unsetStatuses: [] };
  if (!round) return out;
  const drafts = event.adjustments.filter((a) => a.roundId === roundId && a.status === 'draft');

  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const a of drafts) {
    const key = JSON.stringify([a.recipientType, a.recipientId, normalizeName(a.name)]);
    const group = groups.get(key);
    if (group) group.push(a.id);
    else groups.set(key, [a.id]);
  }
  out.duplicates = [...groups.values()].filter((g) => g.length > 1);
  out.large = drafts.filter((a) => isLarge(a.points, round.base)).map((a) => a.id);

  const memberTeam = new Map(event.roster.map((m) => [m.id, m.teamId]));
  const recognized = new Set(
    drafts.filter((a) => a.recipientType === 'member').map((a) => memberTeam.get(a.recipientId)),
  );
  const withMembers = new Set(memberTeam.values());
  const queue = queueOf(event, round);
  out.teamsWithoutIndividual = queue.filter((id) => withMembers.has(id) && !recognized.has(id));
  out.unsetStatuses = queue.filter((id) => !Object.hasOwn(round.statuses, id));
  return out;
}

/**
 * The round as it would publish now (A08: +75, +50, −25 on a completed 500 previews 600):
 * every queued team's teamRoundScore over the round's drafts (an unset status counts zero),
 * every team's total with those added, and each awarded member's points. A round already
 * published shows its frozen result (its totals already include it, so nothing counts twice);
 * a skipped or unknown round adds nothing.
 * @param {LarpEvent} event
 * @param {string} roundId
 * @returns {RoundPreview}
 */
export function previewRound(event, roundId) {
  const round = event.rounds.find((r) => r.id === roundId);
  const published = event.results.find((r) => r.roundId === roundId);
  /** @type {Map<string, number[]>} */
  const members = new Map();
  if (published) {
    for (const a of published.adjustments) if (a.recipientType === 'member') addTerm(members, a.recipientId, a.points);
    return {
      teamRoundScores: { ...published.teamRoundScores },
      projectedTotals: teamTotals(event),
      memberPoints: sumTerms(members),
    };
  }
  if (!round || round.skipped) return { teamRoundScores: {}, projectedTotals: teamTotals(event), memberPoints: {} };

  const drafts = event.adjustments.filter((a) => a.roundId === roundId && a.status === 'draft');
  /** @type {Record<string, number>} */
  const teamRoundScores = {};
  for (const teamId of queueOf(event, round)) teamRoundScores[teamId] = teamRoundScore(round, teamId, drafts);

  const terms = teamTerms(event);
  for (const [teamId, points] of Object.entries(teamRoundScores)) addTerm(terms, teamId, points);
  for (const a of drafts) if (a.recipientType === 'member') addTerm(members, a.recipientId, a.points);
  return { teamRoundScores, projectedTotals: sumTerms(terms), memberPoints: sumTerms(members) };
}

/**
 * Whether two awards are duplicates: different ids (a candidate without an id differs from
 * everything), same roundId, recipientType and recipientId, and equal normalizeName(name).
 * @param {AwardKey} a
 * @param {AwardKey} b
 * @returns {boolean}
 */
export function isDuplicate(a, b) {
  if (a.id !== undefined && a.id === b.id) return false;
  return (
    a.roundId === b.roundId &&
    a.recipientType === b.recipientType &&
    a.recipientId === b.recipientId &&
    normalizeName(a.name) === normalizeName(b.name)
  );
}

/**
 * The existing draft or published adjustments a candidate award duplicates (never discarded ones,
 * never the candidate itself by id), in event order.
 * @param {LarpEvent} event
 * @param {AwardKey} candidate
 * @returns {Adjustment[]}
 */
export function duplicatesOf(event, candidate) {
  return event.adjustments.filter((a) => a.status !== 'discarded' && isDuplicate(candidate, a));
}
