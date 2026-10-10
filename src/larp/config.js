// The campfire game's configuration rules: the five default rounds, the 50-minute estimate, the
// rotating performance queue, team colors and emblems, and validating team, member and GM input.
// Pure; no DOM.
//
//   defaultRounds()        five Rounds from ROUND_CATEGORIES, ids 'round-<key>' (deterministic)
//   estimate(input, teams) total = opening + Σ unskipped rounds [prep + teams × (turn +
//                          transition) + reviewReveal] + finale + buffer; 4 teams at the
//                          defaults = 50:00, each extra team +6:00
//   performanceQueue       the teams taking part in a round (admittedRound ≤ roundIndex), in
//                          event order rotated so the first performer moves each round
//   teamColor / emblem     cycle TEAM_COLORS and EMBLEMS (repeats allowed, never a team limit)
//   validateTeam / validateMember / validateGm   input checks → the first LarpError, or null:
//                          invalid_name (missing/blank/over the cap, field 'name'), invalid_text
//                          (translation/patron over the cap), bad_payload (wrong type, bad
//                          color/emblem/captain, missing teamId), not_found (unknown teamId)
//   Lengths are code points after cleaning (NFC, trimmed, inner whitespace collapsed).
import { EMBLEMS, LIMITS, ROUND_CATEGORIES, TEAM_COLORS, larpError } from './types.js';

/**
 * @typedef {import('./types.js').Round} Round
 * @typedef {import('./types.js').Team} Team
 * @typedef {import('./types.js').EventConfig} EventConfig
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').LarpError} LarpError
 * @typedef {import('./types.js').EmblemKey} EmblemKey
 * @typedef {import('./types.js').TeamInput} TeamInput
 * @typedef {import('./types.js').MemberInput} MemberInput
 * @typedef {import('./types.js').GmInput} GmInput
 * @typedef {import('./types.js').RoundCategoryKey} RoundCategoryKey
 */

/**
 * What the estimate needs: the rounds and the fixed segments (pass `{ ...event.config, rounds:
 * event.rounds }`).
 * @typedef {Pick<EventConfig, 'targetMs'|'openingMs'|'finaleMs'|'bufferMs'> & { rounds: Round[] }} EstimateInput
 */

/**
 * The estimate. `overrunMs` is max(0, total − target); `perRound` has one row per round in
 * order (0 ms for a skipped one).
 * @typedef {{
 *   totalMs: number, targetMs: number, overrunMs: number,
 *   perRound: Array<{ roundId: string, category: RoundCategoryKey, ms: number }>,
 * }} Estimate
 */

/**
 * The five rounds with their default prompts, bases and allowances, in play order. Each has
 * id 'round-<category>', empty order/statuses/admittedTeams, skipped false, promptTranslation ''.
 * @returns {Round[]}
 */
export function defaultRounds() {
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
 * The schedule estimate for `teamCount` teams (recalculated whenever teams or allowances change).
 * @param {EstimateInput} input
 * @param {number} teamCount
 * @returns {Estimate}
 */
export function estimate(input, teamCount) {
  const teams = Number.isFinite(teamCount) && teamCount > 0 ? Math.floor(teamCount) : 0;
  const perRound = input.rounds.map((r) => ({
    roundId: r.id,
    category: r.category,
    ms: r.skipped ? 0 : r.prepMs + teams * (r.turnMs + r.transitionMs) + r.reviewRevealMs,
  }));
  const totalMs = input.openingMs + perRound.reduce((s, r) => s + r.ms, 0) + input.finaleMs + input.bufferMs;
  return { totalMs, targetMs: input.targetMs, overrunMs: Math.max(0, totalMs - input.targetMs), perRound };
}

/**
 * A round's performance queue: the ids of the teams taking part (admittedRound ≤ roundIndex), in
 * `teams` order rotated left by roundIndex modulo their count, so the first performer moves on
 * each round. Every team is included (no limit); empty when there are none.
 * @param {Round} round
 * @param {Team[]} teams
 * @param {number} roundIndex
 * @returns {string[]}
 */
export function performanceQueue(round, teams, roundIndex) {
  const ids = teams.filter((t) => t.admittedRound <= roundIndex).map((t) => t.id);
  if (!ids.length) return [];
  const k = cycle(roundIndex, ids.length);
  return [...ids.slice(k), ...ids.slice(0, k)];
}

/**
 * The swatch color for the index-th team (TEAM_COLORS, cycling).
 * @param {number} index
 * @returns {string}
 */
export function teamColor(index) {
  return TEAM_COLORS[cycle(index, TEAM_COLORS.length)];
}

/**
 * The emblem for the index-th team (EMBLEMS, cycling).
 * @param {number} index
 * @returns {EmblemKey}
 */
export function emblem(index) {
  return EMBLEMS[cycle(index, EMBLEMS.length)];
}

/**
 * Checks a team's fields: name required (after cleanText) and within LIMITS.teamName;
 * translation and patron within their limits; color a #rrggbb hex; emblem one of EMBLEMS. With
 * `partial` (an edit) missing fields are not required.
 * @param {Partial<TeamInput>} input
 * @param {boolean} [partial]
 * @returns {LarpError|null}
 */
export function validateTeam(input, partial) {
  if (!isRecord(input)) return larpError('bad_payload', 'team must be an object');
  return (
    checkName(input.name, LIMITS.teamName, partial) ||
    checkText(input, 'translation', LIMITS.teamTranslation) ||
    checkText(input, 'patron', LIMITS.patron) ||
    (input.color !== undefined && !(typeof input.color === 'string' && HEX_COLOR.test(input.color))
      ? larpError('bad_payload', 'color must be #rrggbb', { field: 'color' })
      : null) ||
    (input.emblem !== undefined && !EMBLEMS.includes(/** @type {EmblemKey} */ (input.emblem))
      ? larpError('bad_payload', 'unknown emblem', { field: 'emblem' })
      : null)
  );
}

/**
 * Checks a roster member: name required and within LIMITS.memberName; teamId an existing team;
 * captain a boolean when given. With `partial` missing fields are not required.
 * @param {Partial<MemberInput>} input
 * @param {LarpEvent} event
 * @param {boolean} [partial]
 * @returns {LarpError|null}
 */
export function validateMember(input, event, partial) {
  if (!isRecord(input)) return larpError('bad_payload', 'member must be an object');
  const nameError = checkName(input.name, LIMITS.memberName, partial);
  if (nameError) return nameError;
  const { teamId, captain } = input;
  if (teamId === undefined ? !partial : typeof teamId !== 'string') {
    return larpError('bad_payload', 'teamId must be a team id', { field: 'teamId' });
  }
  if (teamId !== undefined && !event.teams.some((t) => t.id === teamId)) {
    return larpError('not_found', `no team ${teamId}`, { field: 'teamId', ids: [teamId] });
  }
  if (captain !== undefined && typeof captain !== 'boolean') {
    return larpError('bad_payload', 'captain must be a boolean', { field: 'captain' });
  }
  return null;
}

/**
 * Checks a GM: name required and within LIMITS.gmName.
 * @param {Partial<GmInput>} input
 * @returns {LarpError|null}
 */
export function validateGm(input) {
  if (!isRecord(input)) return larpError('bad_payload', 'GM must be an object');
  return checkName(input.name, LIMITS.gmName, false);
}

// ---------------------------------------------------------------------------------------------
// Helpers

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * `index` wrapped into 0 … length - 1 (negative counts back from the end; a fraction is floored;
 * NaN or ±Infinity is 0), so a cycled table never runs out.
 * @param {number} index
 * @param {number} length
 */
function cycle(index, length) {
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  return ((i % length) + length) % length;
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Text as it is stored and measured: NFC, trimmed, inner whitespace runs collapsed to one space.
 * (The same rule as strings.cleanText; kept local so config.js stands on types.js alone.)
 * @param {string} s
 */
function clean(s) {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** @param {string} s */
const codePoints = (s) => [...s].length;

/**
 * A required name: missing or blank → invalid_name (unless `partial` and missing), not a string →
 * bad_payload, longer than `max` code points after cleaning → invalid_name.
 * @param {unknown} name
 * @param {number} max
 * @param {boolean|undefined} partial
 * @returns {LarpError|null}
 */
function checkName(name, max, partial) {
  if (name === undefined && partial) return null;
  if (name === undefined || name === null) return larpError('invalid_name', 'name is required', { field: 'name' });
  if (typeof name !== 'string') return larpError('bad_payload', 'name must be text', { field: 'name' });
  const cleaned = clean(name);
  if (!cleaned) return larpError('invalid_name', 'name is blank', { field: 'name' });
  if (codePoints(cleaned) > max) return larpError('invalid_name', `name is over ${max} characters`, { field: 'name' });
  return null;
}

/**
 * An optional text field: absent or blank is fine, not a string → bad_payload, longer than `max`
 * code points after cleaning → invalid_text.
 * @param {Record<string, unknown>} input
 * @param {string} field
 * @param {number} max
 * @returns {LarpError|null}
 */
function checkText(input, field, max) {
  const v = input[field];
  if (v === undefined) return null;
  if (typeof v !== 'string') return larpError('bad_payload', `${field} must be text`, { field });
  if (codePoints(clean(v)) > max) return larpError('invalid_text', `${field} is over ${max} characters`, { field });
  return null;
}
