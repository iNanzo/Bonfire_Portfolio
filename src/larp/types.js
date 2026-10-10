// Lửa Trại Nghĩa Sĩ (the campfire game): the shared contract. Every record's shape, the command
// catalogue, the error codes and the fixed tables, so the modules below agree without importing
// each other's internals. Design: docs/design/nghia-si-campfire.md.
//
// Module boundaries (all of src/larp/ in Stage 1 is pure: no DOM, no three.js, no window,
// document or localStorage globals, no Date.now() or Math.random(); time and ids are injected):
//
//   types.js    this file: typedefs, constants, larpError(). No game logic.
//   strings.js  the Vietnamese/English string map (t), points and clock formatting, parsing a
//               typed signed amount, and the name normalizing that duplicate checks use
//   config.js   the default rounds, the 50-minute estimate, the performance queue and its
//               rotation, team colors and emblems, validating team/member/GM input
//   scoring.js  award validation, round scores, team and member totals (always derived from
//               published results + corrections), ranking (1, 1, 3), review flags, previews,
//               duplicate detection, the safe-integer check on derived totals
//   phases.js   which phase may follow which, the next phase, the timer arithmetic (deadline
//               while running, remainingMs while paused) and the reveal's steps and length
//   roles.js    who may do what: the host everything; a co-GM in Judge Mode only their own
//               unpublished awards, only while judging is open
//   store.js    serialize/deserialize with MIGRATIONS (like src/scenes.js), the injected-storage
//               save/load/clear, backup export/import, the results CSV
//   state.js    createEvent, reduce(event, command, ctx) and projection(event, now)
//
// state.js is the only module that creates new event objects. Every other module is a pure
// function over an event (or a part of one) and never mutates what it is given; reduce() never
// mutates its input either: it returns a new event (sharing unchanged parts is fine).
// Scores are never stored as running totals: they are derived from `results` and `corrections`.

/** The saved event's format version; older ones are migrated by store.js as they are read. */
export const SCHEMA_VERSION = 1;

/** The GM id createEvent() gives the host (the GM with `host: true`). */
export const HOST_GM_ID = 'gm-host';

/** The event's phases. */
export const EVENT_PHASES = /** @type {const} */ (['setup', 'running', 'finished']);

/** The phases inside each round, in order. */
export const ROUND_PHASES = /** @type {const} */ ([
  'briefing',
  'preparation',
  'performances',
  'review',
  'reveal',
  'results',
]);

/** The round phases in which awards may be added or edited (judging is open). */
export const JUDGING_OPEN_PHASES = /** @type {const} */ (['preparation', 'performances']);

/** A team's completion status in a round; unset (no key in Round.statuses) blocks publishing. */
export const COMPLETION_STATUSES = /** @type {const} */ (['complete', 'passed', 'absent']);

/** The display's language modes (Setup → Display). */
export const DISPLAY_MODES = /** @type {const} */ (['bilingual', 'en-first', 'vi-only']);

/** The sceneries the game offers (src/sceneries.js keys; never 'cult', 'forge' left out). */
export const SCENERY_KEYS = /** @type {const} */ (['ruins', 'shrine', 'cathedral']);

/** About how long one reveal banner stays up (ms). */
export const REVEAL_BANNER_MS = 3000;

const SEC = 1000;
const MIN = 60 * SEC;

/**
 * The five rounds, in play order, with their defaults (the design's table "The Five Rounds" and
 * "The 50-Minute Run"). `flame` is a src/palette.js flame key the stage resolves with flameOr();
 * `calm` marks the prayer round (no rings, flashes, gestures or sound).
 * @type {readonly Readonly<RoundCategory>[]}
 */
export const ROUND_CATEGORIES = Object.freeze([
  Object.freeze({
    key: /** @type {const} */ ('faith'),
    vi: 'Khám Phá Đức Tin',
    en: 'Faith Discovery',
    base: 100,
    prepMs: 90 * SEC,
    turnMs: 45 * SEC,
    transitionMs: 15 * SEC,
    reviewRevealMs: 30 * SEC,
    flame: 'ember',
    calm: false,
    prompt: "Tell us one thing about your team's patron saint and one way we can follow that example this week.",
  }),
  Object.freeze({
    key: /** @type {const} */ ('dance'),
    vi: 'Vũ Điệu',
    en: 'Dance',
    base: 200,
    prepMs: 2 * MIN,
    turnMs: 60 * SEC,
    transitionMs: 15 * SEC,
    reviewRevealMs: 60 * SEC,
    flame: 'rose',
    calm: false,
    prompt: 'Create four repeatable movements that tell a story about working together.',
  }),
  Object.freeze({
    key: /** @type {const} */ ('prayer'),
    vi: 'Cầu Nguyện / Thánh Ca',
    en: 'Prayer / Sacred Song',
    base: 300,
    prepMs: 2 * MIN,
    turnMs: 60 * SEC,
    transitionMs: 15 * SEC,
    reviewRevealMs: 60 * SEC,
    flame: 'spirit',
    calm: true,
    prompt: 'Prepare a prayer of gratitude or a verse about trust in God.',
  }),
  Object.freeze({
    key: /** @type {const} */ ('skit'),
    vi: 'Hoạt Cảnh Kinh Thánh',
    en: 'Bible Skit',
    base: 500,
    prepMs: 4 * MIN,
    turnMs: 90 * SEC,
    transitionMs: 15 * SEC,
    reviewRevealMs: 60 * SEC,
    flame: 'ember',
    calm: false,
    prompt: 'Show a moment from the Good Samaritan and end with one sentence about being a neighbor.',
  }),
  Object.freeze({
    key: /** @type {const} */ ('cheer'),
    vi: 'Băng Reo Đội',
    en: 'Team Cheer',
    base: 300,
    prepMs: 2 * MIN,
    turnMs: 30 * SEC,
    transitionMs: 15 * SEC,
    reviewRevealMs: 60 * SEC,
    flame: 'gilded',
    calm: false,
    prompt: 'Include your team name, one value you want to live, and a response everyone can join.',
  }),
]);

/** The round category keys, in play order. */
export const ROUND_KEYS = /** @type {const} */ (['faith', 'dance', 'prayer', 'skit', 'cheer']);

/**
 * Team swatch colors, cycled by config.teamColor(index); repeats are allowed once they run out
 * (the palette's size is never a team limit). Never used for text.
 */
export const TEAM_COLORS = Object.freeze([
  '#e8b04a',
  '#5fa8d3',
  '#d9645f',
  '#6dbf73',
  '#a77bd1',
  '#e07b39',
  '#4fc1b0',
  '#d97aa6',
]);

/** Team emblem keys (pixel-art shapes), cycled by config.emblem(index). */
export const EMBLEMS = /** @type {const} */ (['shield', 'star', 'flame', 'cross', 'dove', 'crown', 'anchor', 'lamp']);

/** Text and size limits (characters are counted as code points, `[...s].length`). */
export const LIMITS = Object.freeze({
  awardName: 60,
  awardTranslation: 80,
  note: 500,
  teamName: 40,
  teamTranslation: 40,
  patron: 40,
  memberName: 40,
  gmName: 40,
  prompt: 300,
  reason: 120,
  reasonTranslation: 120,
  duplicateReason: 120,
  /** The longest allowance or timer a round may set (ms). */
  maxDurationMs: 60 * MIN,
  /** Command ids remembered for double-submission protection (oldest dropped first). */
  maxSeenCommands: 500,
});

/**
 * A new event's configuration (state.createEvent copies it). The estimate's fixed segments come
 * from the design's 50-minute table: opening 5:00, finale 3:00, buffer 2:00, target 50:00.
 * @type {Readonly<EventConfig>}
 */
export const DEFAULT_CONFIG = Object.freeze({
  title: 'Lửa Trại Nghĩa Sĩ',
  displayMode: 'bilingual',
  hostLang: 'en',
  scenery: 'ruins',
  reducedMotion: false,
  sound: false,
  showMembers: false,
  hostPin: null,
  targetMs: 50 * MIN,
  openingMs: 5 * MIN,
  finaleMs: 3 * MIN,
  bufferMs: 2 * MIN,
});

/**
 * Every command reduce() understands. Judge Mode entry and exit are UI-only, not commands: a
 * co-GM's commands carry `mode: 'judge'`. Which phase each is legal in:
 *
 * Setup (phase 'setup'; the roster and team edits also while running, see below):
 *   addTeam, editTeam, removeTeam (setup only), addMember, addMembers, editMember, removeMember,
 *   addGm, editGm, removeGm, editRound (base locked once running; while running only rounds not
 *   yet started), setConfig (any phase), startEvent (needs ≥ 1 team) → running, Welcome
 *   (roundIndex -1, roundPhase null).
 * Round flow (host only):
 *   nextRound      Welcome or Results → the next unskipped round's Briefing (builds Round.order)
 *   startPreparation  Briefing → Preparation, prep timer running
 *   endPreparation    Preparation → Performances, currentTurn -1, timer cleared
 *   nextTeam       Performances: currentTurn + 1, that team's turn timer running
 *   startTimer, pauseTimer, resumeTimer, addTime { ms }   the current phase's timer
 *                  (time added to a turn also lengthens the round's turnMs: every later turn gets it)
 *   setStatus      Performances or Review: a team's completion status (null unsets)
 *   beginReview    Performances → Review (Judge Mode locks)
 *   reopenJudging  Review → Performances
 *   publishRound   Review → Reveal; one immutable PublishedResult; needs every status set
 *   revealAdvance, revealPause, revealResume   Reveal; advancing past the last step → Results
 *   revealSkip     Reveal → Results (scores unchanged)
 *   revealReplay { step? }   Reveal or Results of a published round: the reveal again from `step`
 *                  (default 0, the start), back in Reveal; replaying never changes a score
 *   skipRound      the current unpublished round (→ its Results, drafts discarded) or a future one
 *   addTeamMidGame running: joins the END of the current queue during Performances, otherwise
 *                  starts next round; score starts at 0, no retroactive completion
 *   addCorrection  running or finished, host only; a signed difference with a public reason
 *   endEvent       running → finished (an unpublished current round counts zero, drafts discarded)
 * Judging (host, or a co-GM in Judge Mode while judging is open):
 *   addAward (recipients → one Adjustment each, one batchId), editAward, removeAward
 *   The host may also add/edit/remove during Review.
 */
export const COMMAND_TYPES = /** @type {const} */ ([
  // Setup
  'addTeam',
  'editTeam',
  'removeTeam',
  'addMember',
  'addMembers',
  'editMember',
  'removeMember',
  'addGm',
  'editGm',
  'removeGm',
  'editRound',
  'setConfig',
  'startEvent',
  // Phases
  'nextRound',
  'startPreparation',
  'endPreparation',
  'nextTeam',
  'beginReview',
  'reopenJudging',
  'publishRound',
  'skipRound',
  'endEvent',
  // Timers
  'startTimer',
  'pauseTimer',
  'resumeTimer',
  'addTime',
  // Judging
  'setStatus',
  'addAward',
  'editAward',
  'removeAward',
  // Reveal
  'revealAdvance',
  'revealPause',
  'revealResume',
  'revealSkip',
  'revealReplay',
  // Mid-game
  'addTeamMidGame',
  'addCorrection',
]);

/** Actions roles.can() answers besides the commands: seeing a round's drafts, authors and notes. */
export const VIEW_ACTIONS = /** @type {const} */ (['viewJudging']);

/** What reduce() reports happened, for the stage adapter and the UI (never needed for correctness). */
export const GAME_EVENT_TYPES = /** @type {const} */ ([
  'setupChanged',
  'configChanged',
  'eventStarted',
  'phaseChanged',
  'roundStarted',
  'turnStarted',
  'timerChanged',
  'statusSet',
  'awardAdded',
  'awardEdited',
  'awardRemoved',
  'reviewBegan',
  'judgingReopened',
  'roundPublished',
  'revealStep',
  'revealFinished',
  'roundSkipped',
  'teamAdded',
  'correctionAdded',
  'eventFinished',
]);

/** Every error code a module may return (never thrown for expected failures). */
export const ERROR_CODES = /** @type {const} */ ([
  // Commands
  'bad_command', // not a command: missing id, type, actorId or mode
  'unknown_command', // a type not in COMMAND_TYPES
  'bad_payload', // a payload field missing or of the wrong type
  'forbidden', // the actor's role may not do this (roles.js)
  'wrong_phase', // not legal in the current event or round phase
  'not_found', // a referenced team, member, GM, round or adjustment doesn't exist
  // Validation
  'invalid_name', // blank or too long
  'invalid_text', // a translation, note, prompt or patron too long
  'invalid_points', // not a safe integer (fractions, NaN, Infinity, strings)
  'invalid_duration', // an allowance or added time out of range or not whole ms
  'invalid_status', // not a CompletionStatus (or null)
  'invalid_config', // a config value out of its set
  'unsafe_total', // a derived total would leave the safe integer range
  'no_recipients', // an award with no recipients, a repeated one, or the wrong kind
  'duplicate_award', // same normalized name, recipient and round: resend with duplicateReason
  'invalid_reason', // a correction or duplicate reason blank or too long
  'zero_correction', // a correction of 0 points
  // Flow
  'judging_closed', // a co-GM award action outside Preparation/Performances
  'not_own_award', // a co-GM touching another GM's award
  'not_draft', // editing or removing an award that is published or discarded
  'status_unset', // publishing while a queued team has no status
  'already_published', // publishing (or skipping) a round that has a result
  'locked', // e.g. a round's base once the event is running, a started round's allowances
  'no_teams', // starting with no teams
  'no_next_team', // nextTeam past the end of the queue
  'no_more_rounds', // nextRound after the last round
  'timer_state', // pause when not running, resume when not paused, start when running…
  'host_required', // removing or demoting the host GM
  // Store
  'storage_unavailable', // no storage injected, or it threw on access
  'storage_failed', // a write refused (quota, private window)
  'bad_json', // not parseable
  'bad_backup', // parseable but not an event or backup
  'newer_version', // saved by a newer schema than this build reads
]);

/**
 * Build an error value (modules return these; they never throw for expected failures).
 * @param {ErrorCode} code
 * @param {string} [message] English, for logs and tests; the UI maps `code` through strings.js
 * @param {{ field?: string, ids?: string[] }} [extra]
 * @returns {LarpError}
 */
export function larpError(code, message = code, extra = {}) {
  return { code, message, ...extra };
}

/**
 * @typedef {(typeof EVENT_PHASES)[number]} EventPhase
 * @typedef {(typeof ROUND_PHASES)[number]} RoundPhase
 * @typedef {(typeof COMPLETION_STATUSES)[number]} CompletionStatus
 * @typedef {(typeof DISPLAY_MODES)[number]} DisplayMode
 * @typedef {(typeof SCENERY_KEYS)[number]} SceneryKey
 * @typedef {(typeof ROUND_KEYS)[number]} RoundCategoryKey
 * @typedef {(typeof EMBLEMS)[number]} EmblemKey
 * @typedef {(typeof COMMAND_TYPES)[number]} CommandType
 * @typedef {(typeof VIEW_ACTIONS)[number]} ViewAction
 * @typedef {CommandType | ViewAction} RoleAction
 * @typedef {(typeof GAME_EVENT_TYPES)[number]} GameEventType
 * @typedef {(typeof ERROR_CODES)[number]} ErrorCode
 * @typedef {'vi'|'en'} Lang
 * @typedef {'team'|'member'} RecipientType
 * @typedef {'draft'|'published'|'discarded'} AdjustmentStatus
 * @typedef {'preparation'|'turn'} TimerKind
 * @typedef {'host'|'judge'} ActorMode
 */

/**
 * An error value: `code` is the contract, `message` is for people reading logs.
 * @typedef {{ code: ErrorCode, message: string, field?: string, ids?: string[] }} LarpError
 */

/**
 * A pass/fail answer with the reason (phases.canAdvance).
 * @typedef {{ ok: true } | { ok: false, error: LarpError }} Check
 */

/**
 * One of the five fixed subjects and its defaults (ROUND_CATEGORIES).
 * @typedef {{
 *   key: RoundCategoryKey, vi: string, en: string, base: number,
 *   prepMs: number, turnMs: number, transitionMs: number, reviewRevealMs: number,
 *   flame: string, calm: boolean, prompt: string,
 * }} RoundCategory
 */

/**
 * The event's settings. The estimate segments (opening, finale, buffer) and the target are ms.
 * `hostPin` (null = off) is only asked for when leaving Judge Mode; it's not security.
 * `showMembers` lets the display list each team's members on the Welcome screen.
 * @typedef {{
 *   title: string, displayMode: DisplayMode, hostLang: Lang, scenery: SceneryKey,
 *   reducedMotion: boolean, sound: boolean, showMembers: boolean, hostPin: string|null,
 *   targetMs: number, openingMs: number, finaleMs: number, bufferMs: number,
 * }} EventConfig
 */

/**
 * A team. `translation` is the English (or second-language) name ("Team Paul"), '' if none.
 * `admittedRound` is the first round index it takes part in: 0 for teams made in Setup; for a
 * team added mid-game, the current round during Performances, otherwise the next one.
 * @typedef {{
 *   id: string, name: string, translation: string, color: string, emblem: EmblemKey,
 *   patron: string, admittedRound: number,
 * }} Team
 */

/**
 * A youth on the roster: display name only (no ages or contact details).
 * @typedef {{ id: string, name: string, teamId: string, captain: boolean }} RosterMember
 */

/**
 * A GM: the host (exactly one, `host: true`, id HOST_GM_ID) or a co-GM added by name.
 * @typedef {{ id: string, name: string, host: boolean }} GM
 */

/**
 * A round. `event.rounds` is in play order (one per ROUND_CATEGORIES entry). `order` is the
 * performance queue (team ids), empty until the round's Briefing builds it with
 * config.performanceQueue; a team added during Performances is appended to it and listed in
 * `admittedTeams`. `statuses` holds only the statuses set (unset = no key).
 * @typedef {{
 *   id: string, category: RoundCategoryKey, prompt: string, promptTranslation: string,
 *   base: number, prepMs: number, turnMs: number, transitionMs: number, reviewRevealMs: number,
 *   order: string[], statuses: Record<string, CompletionStatus>, skipped: boolean,
 *   admittedTeams: string[],
 * }} Round
 */

/**
 * A team or individual award (a "modifier"): signed whole points, zero allowed (Recognition).
 * A batch award (several recipients) is one record per recipient sharing `batchId`.
 * `note` is private to the HTs; `duplicateReason` is set when a duplicate was kept on purpose.
 * Removing a draft marks it 'discarded' (kept for history, never counted or shown publicly);
 * publishing marks it 'published' (the PublishedResult holds the frozen copy that counts).
 * @typedef {{
 *   id: string, roundId: string, recipientType: RecipientType, recipientId: string,
 *   name: string, translation: string, points: number, authorId: string, note: string,
 *   batchId: string, status: AdjustmentStatus, duplicateReason: string|null,
 *   createdAt: number, updatedAt: number,
 * }} Adjustment
 */

/**
 * An adjustment as frozen at publication. `teamId` is the recipient team, or for a member award
 * the member's team at that moment; `recipientName` snapshots the team's or member's name so a
 * later rename or removal never changes history.
 * @typedef {{
 *   id: string, roundId: string, recipientType: RecipientType, recipientId: string,
 *   recipientName: string, teamId: string, name: string, translation: string, points: number,
 *   authorId: string, note: string, batchId: string, duplicateReason: string|null,
 * }} PublishedAdjustment
 */

/**
 * One team's frozen completion in a published round: its status and the points it earned
 * (the base when complete, else 0).
 * @typedef {{ status: CompletionStatus, points: number }} CompletionAward
 */

/**
 * A round's one immutable result. `completion` and `teamRoundScores` have a key for every team
 * in the round's queue; teamRoundScores = completion points + that team's team adjustments
 * (member awards never add to team scores).
 * @typedef {{
 *   roundId: string, roundIndex: number, base: number, commandId: string,
 *   completion: Record<string, CompletionAward>, adjustments: PublishedAdjustment[],
 *   teamRoundScores: Record<string, number>, publishedAt: number,
 * }} PublishedResult
 */

/**
 * A correction to published points: a signed, non-zero difference with a public reason, public
 * the moment it's added. It never re-applies completion. `roundId` and `targetAdjustmentId`
 * point at what it corrects when there is one; `teamId` snapshots a member's team.
 * @typedef {{
 *   id: string, recipientType: RecipientType, recipientId: string, recipientName: string,
 *   teamId: string, points: number, reason: string, translation: string, note: string,
 *   roundId: string|null, targetAdjustmentId: string|null, authorId: string, createdAt: number,
 * }} Correction
 */

/**
 * A countdown on the laptop's clock. idle: not started (remainingMs = durationMs, deadline null);
 * running: `deadline` (epoch ms) set, remainingMs null; paused: remainingMs set, deadline null.
 * `kind` null (and status idle, durationMs 0) when no timer belongs to the phase. A countdown at
 * zero only prompts the host; it never changes the phase.
 * @typedef {{
 *   kind: TimerKind|null, status: 'idle'|'running'|'paused', durationMs: number,
 *   deadline: number|null, remainingMs: number|null,
 * }} Timer
 */

/**
 * Where the reveal is. `step` indexes phases.revealSteps(event, roundId) (0 … total - 1);
 * `stepStartedAt` is when the current step began (the host UI advances after REVEAL_BANNER_MS
 * unless paused). A reloaded display resumes here.
 * @typedef {{ roundId: string, step: number, total: number, paused: boolean, stepStartedAt: number }} RevealPosition
 */

/**
 * One reveal step: a team's header (its completion), one published award (team or individual,
 * in its team's group) or the standings at the end.
 * @typedef {{ kind: 'team'|'award'|'standings', teamId: string|null, adjustmentId: string|null }} RevealStep
 */

/**
 * One accepted command, for the History tab (host only: it names the actor).
 * @typedef {{
 *   revision: number, commandId: string, type: CommandType, actorId: string, mode: ActorMode,
 *   at: number, ids: string[],
 * }} HistoryEntry
 */

/**
 * The person at the laptop: a GM and how they're using it. 'host' needs the host GM; 'judge' is
 * any GM in Judge Mode.
 * @typedef {{ gmId: string, mode: ActorMode }} Actor
 */

/**
 * A command. `id` is unique per user action (a double-click resends the same id, and reduce()
 * then changes nothing). `actorId` + `mode` form the Actor; `at` is when it was issued and goes
 * into history; all time arithmetic uses the reducer's ctx.now.
 * @typedef {{ id: string, type: CommandType, actorId: string, mode: ActorMode, payload: any, at: number }} Command
 */

/**
 * Each command's payload. Optional fields keep their current value (edits) or a default (adds).
 * @typedef {{ name: string, translation?: string, patron?: string, color?: string, emblem?: EmblemKey }} TeamInput
 * @typedef {{ name: string, teamId: string, captain?: boolean }} MemberInput
 * @typedef {{ name: string }} GmInput
 * @typedef {{
 *   recipientType: RecipientType, recipientIds: string[], name: string, translation?: string,
 *   points: number, note?: string, authorId?: string, duplicateReason?: string,
 * }} AwardInput
 * @typedef {{
 *   recipientType: RecipientType, recipientId: string, points: number, reason: string,
 *   translation?: string, note?: string, roundId?: string|null, targetAdjustmentId?: string|null,
 * }} CorrectionInput
 * @typedef {{
 *   addTeam: TeamInput,
 *   editTeam: { teamId: string } & Partial<TeamInput>,
 *   removeTeam: { teamId: string },
 *   addMember: MemberInput,
 *   addMembers: { names: string[], teamId: string },
 *   editMember: { memberId: string, name?: string, teamId?: string, captain?: boolean },
 *   removeMember: { memberId: string },
 *   addGm: GmInput,
 *   editGm: { gmId: string, name: string },
 *   removeGm: { gmId: string },
 *   editRound: { roundId: string, prompt?: string, promptTranslation?: string, base?: number,
 *     prepMs?: number, turnMs?: number, transitionMs?: number, reviewRevealMs?: number },
 *   setConfig: Partial<EventConfig>,
 *   startEvent: {},
 *   nextRound: {},
 *   startPreparation: {},
 *   endPreparation: {},
 *   nextTeam: {},
 *   beginReview: {},
 *   reopenJudging: {},
 *   publishRound: { roundId: string },
 *   skipRound: { roundId: string },
 *   endEvent: {},
 *   startTimer: {},
 *   pauseTimer: {},
 *   resumeTimer: {},
 *   addTime: { ms: number },
 *   setStatus: { teamId: string, status: CompletionStatus|null },
 *   addAward: AwardInput,
 *   editAward: { adjustmentId: string, name?: string, translation?: string, points?: number,
 *     note?: string, duplicateReason?: string|null },
 *   removeAward: { adjustmentId: string },
 *   revealAdvance: {},
 *   revealPause: {},
 *   revealResume: {},
 *   revealSkip: {},
 *   revealReplay: { step?: number },
 *   addTeamMidGame: TeamInput,
 *   addCorrection: CorrectionInput,
 * }} CommandPayloads
 */

/**
 * The game event record. Called LarpEvent so it never collides with the DOM's global `Event`
 * (a bare `@param {Event}` without importing is the DOM type). `Event` is exported as an alias.
 *
 * - phase 'setup': roundIndex -1, roundPhase null (the display shows Welcome).
 * - phase 'running': roundIndex -1 and roundPhase null is the Welcome/opening (after startEvent);
 *   otherwise roundIndex indexes `rounds` and roundPhase is set.
 * - phase 'finished': roundPhase null, roundIndex the last round reached.
 * - `currentTurn` indexes the current round's `order`: -1 before the first nextTeam, and may
 *   equal order.length once every team has performed.
 * - `adjustments` holds every award of every round (drafts, published, discarded).
 * - `seenCommandIds` is bounded by LIMITS.maxSeenCommands (oldest dropped).
 * - `revision` goes up by 1 for every accepted command (never for a rejected or repeated one).
 * @typedef {{
 *   id: string, schemaVersion: number, revision: number, createdAt: number, updatedAt: number,
 *   startedAt: number|null, finishedAt: number|null,
 *   phase: EventPhase, roundIndex: number, roundPhase: RoundPhase|null, currentTurn: number,
 *   config: EventConfig, teams: Team[], roster: RosterMember[], gms: GM[], rounds: Round[],
 *   adjustments: Adjustment[], results: PublishedResult[], corrections: Correction[],
 *   timer: Timer, reveal: RevealPosition|null, seenCommandIds: string[], history: HistoryEntry[],
 * }} LarpEvent
 */

/** @typedef {LarpEvent} Event */

/**
 * What reduce() reports, for the stage adapter and UI.
 * @typedef {{ type: GameEventType, roundId?: string, teamId?: string, ids?: string[], from?: string, to?: string }} GameEvent
 */

/**
 * reduce()'s answer. On error `event` is the input unchanged and `events` empty. A repeated
 * command id returns the input unchanged with `duplicate: true` and no error.
 * @typedef {{ event: LarpEvent, events: GameEvent[], error: LarpError|null, duplicate?: boolean }} ReduceResult
 */

/**
 * reduce()'s injected context: the laptop clock and the id generator (`kind` like 'team',
 * 'member', 'gm', 'adj', 'batch', 'corr' only makes ids readable).
 * @typedef {(kind?: string) => string} IdGen
 * @typedef {{ now: number, newId: IdGen }} ReduceContext
 */

/**
 * A published award as the display may see it: no author, note or duplicate reason.
 * @typedef {Omit<PublishedAdjustment, 'authorId'|'note'|'duplicateReason'>} PublicAdjustment
 * @typedef {Omit<PublishedResult, 'adjustments'|'commandId'> & { adjustments: PublicAdjustment[] }} PublicResult
 * @typedef {Omit<Correction, 'authorId'|'note'>} PublicCorrection
 */

/**
 * A ranked row (scoring.rank): ties share a place, the next place skips (1, 1, 3).
 * @typedef {{ id: string, total: number, place: number }} RankedEntry
 */

/**
 * A standings row on the display. `movement` is places gained since the previous published
 * round (positive = up), null in round 1 or for a new team.
 * @typedef {RankedEntry & { movement: number|null }} StandingRow
 */

/**
 * The public view of the event, the only thing the display window is ever sent. Never drafts,
 * private notes, duplicate reasons, authors, the host PIN, history or roster details beyond what
 * a published award names (plus `members` only when config.showMembers).
 * `timerRemainingMs` is phases.remaining(timer, now) at projection time (the display may
 * recompute it from `timer` as its clock moves). `round` is null in Setup, Welcome and Finished. `leaders` (individual leaders) only when
 * finished, and never members with zero or negative totals.
 * @typedef {{
 *   eventId: string, revision: number, now: number,
 *   phase: EventPhase, roundIndex: number, roundPhase: RoundPhase|null, roundCount: number,
 *   config: Pick<EventConfig, 'title'|'displayMode'|'scenery'|'reducedMotion'|'sound'>,
 *   round: { id: string, index: number, category: RoundCategoryKey, vi: string, en: string,
 *     prompt: string, promptTranslation: string, base: number, turnMs: number, calm: boolean,
 *     flame: string } | null,
 *   teams: Array<Pick<Team, 'id'|'name'|'translation'|'color'|'emblem'|'patron'|'admittedRound'> & { isNew: boolean }>,
 *   members: Array<Pick<RosterMember, 'id'|'name'|'teamId'>>,
 *   queue: string[], currentTeamId: string|null, nextTeamId: string|null,
 *   timer: Timer, timerRemainingMs: number, reveal: RevealPosition|null, revealSteps: RevealStep[],
 *   results: PublicResult[], corrections: PublicCorrection[],
 *   standings: StandingRow[], leaders: Array<RankedEntry & { name: string, teamId: string }>,
 * }} Projection
 */
