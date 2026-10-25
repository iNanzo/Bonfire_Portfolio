// The host console's Run tab (the design's Host Console sketch): the performance queue with each
// team's completion status, the turn timer and its controls, Add Award beside the queue (picking a
// team selects it as the recipient; From defaults to the host), this round's awards with Edit,
// Remove and Undo, and the projected totals ("Projected · not published"), plus the reveal's
// controls (Pause Reveal, Next Banner, Skip To Results) during Reveal. The shell (host.js) owns the
// next-action button, the clocks' tick and the reveal's auto-advance; this tab doesn't repeat them.
// Owner: the host-run screen. Styles: css/host-run.css. Interface: host.js's Screen.
//
// Pure apart from runActions (which only calls app, ui and env). Local state, all in the UI store:
//
//   drafts.award        name, translation, points, note, from, reason, search (raw typed text)
//   recipientType/Ids   the Add Award recipients (UiState); until the host picks some for the
//                       current turn (local.run.pickedFor === turnKey), the recipient is the team
//                       now performing (or the one that just performed, during Review)
//   local.run           { pickedFor, editing, stash, undo: { id, at }, templates }
//
// Undo after Remove re-adds the discarded award as a new draft (Stage 1 keeps discarded awards,
// and they never count as duplicates), so no confirmation is needed for an ordinary removal.
/**
 * @typedef {import('./host.js').Screen} Screen
 * @typedef {import('./host.js').ScreenCtx} ScreenCtx
 * @typedef {import('./host.js').HostEnv} HostEnv
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Round} Round
 * @typedef {import('./types.js').Team} Team
 * @typedef {import('./types.js').Adjustment} Adjustment
 * @typedef {import('./types.js').AwardInput} AwardInput
 * @typedef {import('./types.js').CompletionStatus} CompletionStatus
 * @typedef {import('./types.js').RecipientType} RecipientType
 * @typedef {import('./types.js').Lang} Lang
 * @typedef {import('./uiState.js').UiState} UiState
 * @typedef {import('./uiState.js').UiStore} UiStore
 * @typedef {import('./app.js').App} App
 * @typedef {import('./dom.js').Handlers} Handlers
 */
import { esc } from '../html.js';
import { actorOf } from './uiState.js';
import { COMPLETION_STATUSES, HOST_GM_ID, LIMITS } from './types.js';
import { MINUS, cleanText, formatClock, formatNumber, formatPoints, normalizeName, parsePoints, t } from './strings.js';
import { duplicatesOf, flags, isLarge, previewRound } from './scoring.js';
import { expired, revealSteps } from './phases.js';
import { revealLength } from './displayView.js';
import {
  addLabel,
  attrs,
  button,
  countdown,
  field,
  hintP,
  label,
  points,
  segmented,
  selectInput,
  signedPointsInput,
  teamChip,
  textInput,
} from './ui.js';

/** The draft form Add Award types into (drafts.award). */
export const AWARD_FORM = 'award';
/** More recipients to choose from than this shows the search field. */
export const SEARCH_AT = 8;
/** How long Undo stays offered after a removal (ms). */
export const UNDO_MS = 8000;
/** At most this many templates are kept (the newest first). */
export const TEMPLATE_LIMIT = 12;
/** At most this many recent awards are offered. */
export const RECENT_LIMIT = 6;
/** A queue row's state word. @type {Record<string, string>} */
const STATE_KEYS = { performed: 'status.performed', performing: 'phase.performing', upNext: 'status.upNext' };
/** The round phases in which the host may add, edit and remove awards (state.js AWARD_PHASES). */
const AWARD_PHASES = ['preparation', 'performances', 'review'];

/**
 * A saved award template (local.run.templates).
 * @typedef {{ name: string, translation: string, points: number }} AwardTemplate
 */

/**
 * The Run tab's own view choices (ui.local.run).
 * @typedef {{
 *   pickedFor?: string, editing?: string|null, stash?: Record<string, string>|null,
 *   undo?: { id: string, at: number }|null, templates?: AwardTemplate[],
 * }} RunLocal
 */

/** @param {UiState} ui @returns {RunLocal} */
const runLocal = (ui) => /** @type {RunLocal} */ (ui.local?.run ?? {});

// ── Pure helpers (exported for the tests and for other screens) ──────────────────────────────

/**
 * The round being played, or null (Setup, Welcome, Finished).
 * @param {LarpEvent} event
 * @returns {Round|null}
 */
export function currentRound(event) {
  if (event.phase !== 'running' || !event.roundPhase) return null;
  return event.rounds[event.roundIndex] ?? null;
}

/**
 * The team performing now (Performances), or the one that just performed (Review); null otherwise.
 * @param {LarpEvent} event
 * @returns {string|null}
 */
export function performingTeamId(event) {
  const round = currentRound(event);
  if (!round || (event.roundPhase !== 'performances' && event.roundPhase !== 'review')) return null;
  const i = Math.min(event.currentTurn, round.order.length - 1);
  return i >= 0 ? (round.order[i] ?? null) : null;
}

/**
 * What the default recipient follows: the round and turn. Picking recipients holds until it changes.
 * @param {LarpEvent} event
 */
export function turnKey(event) {
  return `${currentRound(event)?.id ?? ''}:${event.currentTurn}`;
}

/**
 * The Add Award recipients as they stand: the host's picks for this turn (only ones that can
 * still receive: a team in the round's queue, a member on the roster), else the team now performing.
 * @param {LarpEvent} event
 * @param {UiState} ui
 * @returns {{ type: RecipientType, ids: string[], isDefault: boolean }}
 */
export function awardRecipients(event, ui) {
  const type = ui.recipientType === 'member' ? 'member' : 'team';
  const valid = new Set(type === 'team' ? (currentRound(event)?.order ?? []) : event.roster.map((m) => m.id));
  if (runLocal(ui).pickedFor === turnKey(event)) {
    return { type, ids: (ui.recipientIds ?? []).filter((id) => valid.has(id)), isDefault: false };
  }
  const team = performingTeamId(event);
  return { type, ids: type === 'team' && team ? [team] : [], isDefault: true };
}

/**
 * Who can be chosen: the round's queued teams, or the roster's members (grouped by their team's
 * place in the queue). `label` is what the search matches.
 * @param {LarpEvent} event
 * @param {RecipientType} type
 * @returns {Array<{ id: string, label: string, team: Team|null, member: string }>}
 */
export function recipientOptions(event, type) {
  const order = currentRound(event)?.order ?? [];
  const teamById = new Map(event.teams.map((tm) => [tm.id, tm]));
  if (type === 'team') {
    return order
      .map((id) => teamById.get(id))
      .filter(Boolean)
      .map((tm) => ({ id: tm.id, label: `${tm.name} ${tm.translation}`, team: tm, member: '' }));
  }
  const place = (/** @type {string} */ teamId) => {
    const i = order.indexOf(teamId);
    return i === -1 ? order.length : i;
  };
  return event.roster
    .map((m, i) => ({ m, i }))
    .sort((a, b) => place(a.m.teamId) - place(b.m.teamId) || a.i - b.i)
    .map(({ m }) => {
      const team = teamById.get(m.teamId) ?? null;
      return { id: m.id, label: [m.name, team?.name ?? ''].join(' '), team, member: m.name };
    });
}

/**
 * Whether a recipient matches the search text (case and accents ignored: 'giuse' finds 'Giuse').
 * @param {string} text
 * @param {string} query
 */
export function matches(text, query) {
  const q = normalizeName(query);
  return !q || normalizeName(text).includes(q);
}

/**
 * Signed points as the amount field's text: '−25', '50', '0'.
 * @param {number} n
 */
export function pointsText(n) {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}

/**
 * The award form checked against the event: the parsed values, the awards it would duplicate,
 * whether it is large, and the first reason it can't be sent yet (a strings.js key), or null.
 * `editing` is the draft being edited (its recipient is fixed; only a rename checks duplicates).
 * @param {LarpEvent} event
 * @param {{ type: RecipientType, ids: string[], draft: Record<string, string>, editing?: Adjustment|null }} o
 */
export function checkAward(event, { type, ids, draft, editing = null }) {
  const round = currentRound(event);
  const typed = (draft.points ?? '').trim();
  const value = parsePoints(typed);
  const name = cleanText(draft.name ?? '');
  const reason = cleanText(draft.reason ?? '');
  const open = !!round && AWARD_PHASES.includes(/** @type {string} */ (event.roundPhase));
  /** @type {Adjustment[]} */
  let duplicates = [];
  if (open && name) {
    if (editing) {
      if (normalizeName(name) !== normalizeName(editing.name)) duplicates = duplicatesOf(event, { ...editing, name });
    } else {
      duplicates = ids.flatMap((recipientId) =>
        duplicatesOf(event, { roundId: round.id, recipientType: type, recipientId, name }),
      );
    }
  }
  const blocked = !open
    ? 'hint.awardsClosed'
    : !editing && !ids.length
      ? 'error.no_recipients'
      : value === null
        ? 'error.invalid_points'
        : !name
          ? 'error.invalid_name'
          : duplicates.length && !reason
            ? 'error.duplicate_award'
            : null;
  return {
    name,
    points: value,
    reason,
    duplicates,
    large: value !== null && !!round && isLarge(value, round.base),
    pointsError: typed && value === null && typed !== '-' && typed !== MINUS && typed !== '+',
    blocked,
  };
}

/**
 * The From choice: the GM in the draft when it still exists, else the host.
 * @param {LarpEvent} event
 * @param {string|undefined} from
 */
export function authorOf(event, from) {
  return event.gms.some((g) => g.id === from) ? /** @type {string} */ (from) : HOST_GM_ID;
}

/**
 * The addAward payload for the form as it stands (check it with checkAward first).
 * @param {LarpEvent} event
 * @param {{ type: RecipientType, ids: string[], draft: Record<string, string> }} o
 * @returns {AwardInput}
 */
export function awardPayload(event, { type, ids, draft }) {
  const words = wordsOf(checkAward(event, { type, ids, draft }), draft);
  return { recipientType: type, recipientIds: [...ids], ...words, authorId: authorOf(event, draft.from) };
}

/**
 * The words, amount, note and (for a duplicate) the reason to keep it, as both payloads send them.
 * @param {ReturnType<typeof checkAward>} check
 * @param {Record<string, string>} draft
 * @returns {{ name: string, translation: string, points: number, note: string, duplicateReason?: string }}
 */
function wordsOf(check, draft) {
  const { name, points: value, duplicates, reason } = check;
  const words = {
    name,
    translation: cleanText(draft.translation ?? ''),
    points: value,
    note: (draft.note ?? '').trim(),
  };
  return duplicates.length ? { ...words, duplicateReason: reason } : words;
}

/**
 * The editAward payload for a draft being edited.
 * @param {LarpEvent} event
 * @param {Adjustment} adj
 * @param {Record<string, string>} draft
 */
export function editPayload(event, adj, draft) {
  return { adjustmentId: adj.id, ...wordsOf(checkEdit(event, adj, draft), draft) };
}

/**
 * checkAward for a draft being edited (its recipient fixed).
 * @param {LarpEvent} event
 * @param {Adjustment} adj
 * @param {Record<string, string>} draft
 */
export function checkEdit(event, adj, draft) {
  return checkAward(event, { type: adj.recipientType, ids: [adj.recipientId], draft, editing: adj });
}

/**
 * The addAward payload that brings a removed award back (Undo): the same recipient, words, points,
 * note, author and kept-duplicate reason, as a new draft.
 * @param {Adjustment} adj
 * @returns {AwardInput}
 */
export function undoPayload(adj) {
  const { recipientType, recipientId, name, translation, points: value, note, authorId, duplicateReason } = adj;
  const payload = { recipientType, recipientIds: [recipientId], name, translation, points: value, note, authorId };
  return duplicateReason ? { ...payload, duplicateReason } : payload;
}

/**
 * The award form's drafts filled from a template, a recent award or an award being edited
 * (keeping From and the search).
 * @param {Record<string, string>} draft
 * @param {{ name: string, translation?: string, points: number, note?: string, duplicateReason?: string|null }} from
 * @returns {Record<string, string>}
 */
export function fillDraft(draft, from) {
  return {
    ...draft,
    name: from.name,
    translation: from.translation ?? '',
    points: pointsText(from.points),
    note: from.note ?? '',
    reason: from.duplicateReason ?? '',
  };
}

/**
 * Recent award names to reuse: newest first, one per name and value, never discarded ones.
 * @param {LarpEvent} event
 * @param {number} [limit]
 * @returns {Adjustment[]}
 */
export function recentAwards(event, limit = RECENT_LIMIT) {
  const seen = new Set();
  /** @type {Adjustment[]} */
  const out = [];
  const list = event.adjustments
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.status !== 'discarded')
    .sort((x, y) => y.a.createdAt - x.a.createdAt || y.i - x.i);
  for (const { a } of list) {
    const key = `${normalizeName(a.name)}|${a.points}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The templates kept in the UI store, with anything malformed left out.
 * @param {unknown} list
 * @returns {AwardTemplate[]}
 */
export function readTemplates(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x.name === 'string' && cleanText(x.name) && Number.isSafeInteger(x.points))
    .map((x) => ({
      name: cleanText(x.name),
      translation: typeof x.translation === 'string' ? x.translation : '',
      points: x.points,
    }))
    .slice(0, TEMPLATE_LIMIT);
}

/**
 * The templates with one saved first (replacing one of the same name and value), at most TEMPLATE_LIMIT.
 * @param {AwardTemplate[]} list
 * @param {AwardTemplate} tpl
 * @returns {AwardTemplate[]}
 */
export function addTemplate(list, tpl) {
  const key = (/** @type {AwardTemplate} */ x) => `${normalizeName(x.name)}|${x.points}`;
  return [tpl, ...readTemplates(list).filter((x) => key(x) !== key(tpl))].slice(0, TEMPLATE_LIMIT);
}

/**
 * The Projected column: every team in the round with its completion points (null while it has no
 * status), the sum of its team awards, its round score and its total with the round added. A
 * published round shows its frozen result.
 * @param {LarpEvent} event
 * @param {Round} round
 */
export function projectedRows(event, round) {
  const preview = previewRound(event, round.id);
  const result = event.results.find((r) => r.roundId === round.id);
  const ids = result ? Object.keys(result.completion) : round.order;
  return ids
    .map((id) => {
      const team = event.teams.find((tm) => tm.id === id);
      if (!team) return null;
      /** @type {CompletionStatus|null} */
      const status = result ? (result.completion[id]?.status ?? null) : (round.statuses[id] ?? null);
      const completion =
        status === null ? null : result ? result.completion[id].points : status === 'complete' ? round.base : 0;
      const score = preview.teamRoundScores[id] ?? 0;
      const total = preview.projectedTotals[id] ?? 0;
      return { team, status, completion, awards: score - (completion ?? 0), score, total };
    })
    .filter(Boolean);
}

// ── The view model ──────────────────────────────────────────────────────────────────────────

/**
 * The Run tab's view model (pure).
 * @param {ScreenCtx} ctx
 */
export function runVm(ctx) {
  const { event, ui, now, lang } = ctx;
  const round = currentRound(event);
  const title = t('tab.run', lang);
  if (!round) return { lang, title, idle: true, hint: t('hint.runIdle', lang) };
  const phase = /** @type {string} */ (event.roundPhase);
  const local = runLocal(ui);
  const teamById = new Map(event.teams.map((tm) => [tm.id, tm]));
  const gmName = (/** @type {string} */ id) =>
    id === HOST_GM_ID ? t('label.me', lang) : (event.gms.find((g) => g.id === id)?.name ?? '');
  const awardsOpen = AWARD_PHASES.includes(phase);
  const statusOpen = phase === 'performances' || phase === 'review';
  const published = event.results.some((r) => r.roundId === round.id);
  return {
    lang,
    title,
    idle: false,
    revision: event.revision,
    queue: queueVm(event, round, { lang, awardsOpen, statusOpen, teamById }),
    timer: timerVm(event, round, { now, lang, teamById }),
    reveal: revealVm(event, phase, lang),
    form: awardsOpen ? formVm(event, ui, { lang, gmName, local }) : null,
    closedHint: awardsOpen
      ? ''
      : t(round.skipped ? 'hint.roundSkipped' : published ? 'hint.roundPublished' : 'hint.awardsClosed', lang),
    entries: entriesVm(event, round, { lang, awardsOpen, gmName, teamById }),
    undo: undoVm(event, local, now, lang),
    projected: projectedVm(event, round, { lang, published }),
  };
}

/** @typedef {ReturnType<typeof runVm>} RunVm */

/**
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {{ lang: Lang, awardsOpen: boolean, statusOpen: boolean, teamById: Map<string, Team> }} o
 */
function queueVm(event, round, { lang, awardsOpen, statusOpen, teamById }) {
  const performing = event.roundPhase === 'performances';
  const done = ['review', 'reveal', 'results'].includes(/** @type {string} */ (event.roundPhase));
  const rows = round.order
    .map((id, i) => {
      const team = teamById.get(id);
      if (!team) return null;
      const status = round.statuses[id] ?? null;
      const state =
        done || (performing && i < event.currentTurn)
          ? 'performed'
          : i === event.currentTurn
            ? 'performing'
            : i === event.currentTurn + 1
              ? 'upNext'
              : 'waiting';
      return {
        id,
        index: i,
        team,
        state,
        stateLabel: STATE_KEYS[state] ? t(STATE_KEYS[state], lang) : '',
        status,
        statusLabel: t(status ? `status.${status}` : 'status.unset', lang),
        statusAria: label('label.statusFor', lang, { team: team.name }),
      };
    })
    .filter(Boolean);
  return {
    rows,
    statusOpen,
    pickable: awardsOpen,
    statusOptions: [
      { value: '', label: '—' },
      ...COMPLETION_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`, lang) })),
    ],
  };
}

/**
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {{ now: number, lang: Lang, teamById: Map<string, Team> }} o
 */
function timerVm(event, round, { now, lang, teamById }) {
  const timer = event.timer;
  const phase = event.roundPhase;
  const current = teamById.get(round.order[event.currentTurn] ?? '');
  const next = teamById.get(round.order[event.currentTurn + 1] ?? '');
  const status = timer.kind ? timer.status : null;
  return {
    kind: timer.kind,
    timer,
    now,
    caption:
      timer.kind === 'preparation'
        ? t('phase.preparation', lang)
        : timer.kind === 'turn' && current
          ? label('label.turnOf', lang, { team: current.name })
          : '',
    toggle: status
      ? t(status === 'running' ? 'action.pause' : status === 'paused' ? 'action.resume' : 'action.start', lang)
      : '',
    expired: !!timer.kind && expired(timer, now),
    endPreparation: phase === 'preparation' ? t('action.endPreparation', lang) : '',
    nextTeam:
      phase === 'performances'
        ? {
            label: next ? label('action.nextTeamNamed', lang, { team: next.name }) : t('action.nextTeam', lang),
            disabled: !next,
            hint: next ? '' : t('error.no_next_team', lang),
          }
        : null,
  };
}

/**
 * @param {LarpEvent} event
 * @param {string} phase
 * @param {Lang} lang
 */
function revealVm(event, phase, lang) {
  const r = event.reveal;
  if (phase === 'reveal' && r) {
    return {
      kind: 'reveal',
      title: t('phase.reveal', lang),
      step: label('label.bannerOf', lang, { step: Math.min(r.step + 1, r.total), total: r.total }),
      toggle: t(r.paused ? 'action.resumeReveal' : 'action.pauseReveal', lang),
      paused: r.paused,
      next: r.step < r.total - 1 ? t('action.nextBanner', lang) : '',
      skip: t('action.skipToResults', lang),
    };
  }
  const round = event.rounds[event.roundIndex];
  if (phase === 'results' && round && event.results.some((x) => x.roundId === round.id)) {
    return { kind: 'results', title: t('phase.results', lang), replay: t('action.replayReveal', lang) };
  }
  return null;
}

/**
 * @param {LarpEvent} event
 * @param {UiState} ui
 * @param {{ lang: Lang, gmName: (id: string) => string, local: RunLocal }} o
 */
function formVm(event, ui, { lang, gmName, local }) {
  const draft = ui.drafts?.[AWARD_FORM] ?? {};
  const editing =
    (local.editing && event.adjustments.find((a) => a.id === local.editing && a.status === 'draft')) || null;
  const { type, ids } = editing
    ? { type: editing.recipientType, ids: [editing.recipientId] }
    : awardRecipients(event, ui);
  const check = checkAward(event, { type, ids, draft, editing });
  const chosen = new Set(ids);
  const all = recipientOptions(event, type);
  const search = draft.search ?? '';
  const searchable = all.length > SEARCH_AT;
  const shown = all.filter((o) => chosen.has(o.id) || !searchable || matches(o.label, search));
  const memberName = (/** @type {string} */ id) => event.roster.find((m) => m.id === id)?.name ?? '';
  const teamName = (/** @type {string} */ id) => event.teams.find((tm) => tm.id === id)?.name ?? '';
  const templates = readTemplates(local.templates);
  return {
    heading: t(editing ? 'label.editAward' : 'label.addAward', lang),
    editing: editing
      ? {
          id: editing.id,
          to: editing.recipientType === 'team' ? teamName(editing.recipientId) : memberName(editing.recipientId),
        }
      : null,
    type,
    typeOptions: [
      { value: 'team', label: t('action.team', lang) },
      { value: 'member', label: t('action.individual', lang) },
    ],
    recipients: shown.map((o, i) => ({
      key: `run-rcp-${i}`,
      id: o.id,
      team: o.team,
      member: o.member,
      checked: chosen.has(o.id),
    })),
    emptyHint: emptyHint(all.length, shown.length, type, lang),
    searchable,
    search,
    draft,
    pointsError: check.pointsError ? t('error.invalid_points', lang) : '',
    large: check.large ? t('hint.large', lang) : '',
    duplicate: check.duplicates.length ? t('hint.duplicate', lang) : '',
    from: authorOf(event, draft.from),
    fromOptions: event.gms.map((g) => ({ value: g.id, label: g.host ? `${gmName(g.id)} · ${g.name}` : g.name })),
    submit: editing ? t('action.save', lang) : addLabel({ points: draft.points ?? '', count: ids.length, lang }),
    submitAction: editing ? 'run.saveEdit' : 'run.add',
    // Only what re-renders while typing (recipients, points) disables the button; the name and a
    // duplicate's reason are checked when it is pressed (typing a name never re-renders, for IMEs).
    disabled: ['hint.awardsClosed', 'error.no_recipients', 'error.invalid_points'].includes(check.blocked ?? ''),
    blockedHint: check.blocked ? t(check.blocked, lang) : '',
    templates: templates.map((tpl, i) => ({
      index: i,
      text: `${tpl.name} ${formatPoints(tpl.points, { lang })}`,
      remove: label('action.removeTemplate', lang, { name: tpl.name }),
    })),
    recent: recentAwards(event).map((a) => ({ id: a.id, text: `${a.name} ${formatPoints(a.points, { lang })}` })),
  };
}

/**
 * What the recipients list says when it shows nobody.
 * @param {number} all
 * @param {number} shown
 * @param {RecipientType} type
 * @param {Lang} lang
 */
function emptyHint(all, shown, type, lang) {
  if (!all) return t(type === 'member' ? 'hint.noRoster' : 'hint.runIdle', lang);
  return shown ? '' : t('hint.noMatches', lang);
}

/**
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {{ lang: Lang, awardsOpen: boolean, gmName: (id: string) => string, teamById: Map<string, Team> }} o
 */
function entriesVm(event, round, { lang, awardsOpen, gmName, teamById }) {
  const roundFlags = flags(event, round.id);
  const large = new Set(roundFlags.large);
  const memberById = new Map(event.roster.map((m) => [m.id, m]));
  const rows = event.adjustments
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.roundId === round.id && a.status !== 'discarded')
    .sort((x, y) => y.a.createdAt - x.a.createdAt || y.i - x.i)
    .map(({ a }) => {
      const member = a.recipientType === 'member' ? memberById.get(a.recipientId) : undefined;
      const team = teamById.get(member ? member.teamId : a.recipientId);
      return {
        id: a.id,
        points: a.points,
        unit: /** @type {'team'|'individual'} */ (a.recipientType === 'team' ? 'team' : 'individual'),
        to: member ? `${member.name} · ${team?.name ?? ''}` : (team?.name ?? ''),
        name: a.name,
        translation: a.translation,
        author: gmName(a.authorId),
        note: a.note,
        large: large.has(a.id),
        kept: a.duplicateReason ?? '',
        editable: awardsOpen && a.status === 'draft',
        published: a.status === 'published',
      };
    });
  return {
    title: t('label.thisRound', lang),
    rows,
  };
}

/**
 * Undo, while the removal is fresh and the award is still removed.
 * @param {LarpEvent} event
 * @param {RunLocal} local
 * @param {number} now
 * @param {Lang} lang
 */
export function undoVm(event, local, now, lang) {
  const u = local.undo;
  if (!u || now - u.at > UNDO_MS) return null;
  const adj = event.adjustments.find((a) => a.id === u.id && a.status === 'discarded');
  if (!adj) return null;
  return { text: label('hint.removed', lang, { name: adj.name }), action: t('action.undo', lang) };
}

/**
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {{ lang: Lang, published: boolean }} o
 */
function projectedVm(event, round, { lang, published }) {
  const roundFlags = flags(event, round.id);
  const teamName = (/** @type {string} */ id) => event.teams.find((tm) => tm.id === id)?.name ?? '';
  const without = published || round.skipped ? [] : roundFlags.teamsWithoutIndividual.map(teamName).filter(Boolean);
  const steps = round.skipped ? [] : revealSteps(event, round.id);
  return {
    title: t(published ? 'label.roundScore' : 'label.projected', lang),
    note: published ? '' : t('hint.projected', lang),
    rows: projectedRows(event, round).map((r) => ({
      ...r,
      statusLabel: r.status ? t(`status.${r.status}`, lang) : '',
      completionText: r.completion === null ? '—' : formatNumber(r.completion, lang),
      totalText: formatNumber(r.total, lang),
      scoreText: formatNumber(r.score, lang),
    })),
    noIndividual: without.length ? label('hint.noIndividualYet', lang, { teams: without.join(', ') }) : '',
    reveal:
      steps.length && !published ? label('hint.revealEstimate', lang, { time: formatClock(revealLength(steps)) }) : '',
  };
}

// ── The markup ──────────────────────────────────────────────────────────────────────────────

/** @param {string} title @param {string} body @param {string} cls @param {string} [id] a heading id */
const panel = (title, body, cls, id = '') =>
  `<section class="larp-panel ${cls}"${id ? ` aria-labelledby="${id}"` : ''}><h2 class="larp-h2"${id ? ` id="${id}"` : ''}>${esc(title)}</h2>${body}</section>`;

/**
 * A labelled text field typing into drafts.award.<name>.
 * @param {string} name
 * @param {string} text the label
 * @param {string} value
 * @param {number} maxLength
 * @param {{ hint?: string, attrs?: Record<string, string> }} [o]
 */
function awardField(name, text, value, maxLength, o = {}) {
  const id = `run-${name}`;
  const control = textInput({ id, draft: `${AWARD_FORM}.${name}`, value, maxLength, hint: !!o.hint, attrs: o.attrs });
  return field({ id, label: text, control, hint: o.hint });
}

/**
 * The Run tab's markup (pure).
 * @param {RunVm} vm
 * @returns {string}
 */
export function renderRun(vm) {
  if (vm.idle) return panel(vm.title, hintP(vm.hint), 'larp-run larp-run-idle');
  const { lang } = vm;
  const form = vm.form
    ? renderForm(vm.form, vm.revision, lang)
    : panel(t('label.addAward', lang), hintP(vm.closedHint), 'larp-run-closed');
  return `<div class="larp-run"><div class="larp-run-col larp-run-left">${renderQueue(vm.queue, lang)}${renderTimer(vm.timer, vm.revision, lang)}${renderReveal(vm.reveal)}</div><div class="larp-run-col larp-run-middle">${form}${renderEntries(vm.entries, vm.undo, lang)}</div><div class="larp-run-col larp-run-right">${renderProjected(vm.projected, lang)}</div></div>`;
}

/** @param {RunVm['queue']} q @param {Lang} lang */
function renderQueue(q, lang) {
  const tip = t('hint.pickTeam', lang);
  const rows = q.rows.map((r) => {
    const chip = teamChip(r.team, { sub: true });
    const who = q.pickable
      ? `<button type="button"${attrs({ class: 'larp-run-pick', 'data-action': 'run.pick', 'data-value': r.id, 'data-tip': tip, 'aria-description': tip })}>${chip}</button>`
      : `<span class="larp-run-who">${chip}</span>`;
    const state = r.stateLabel ? `<span class="larp-run-state">${esc(r.stateLabel)}</span>` : '';
    const unset = r.status ? '' : ' is-unset';
    const options = q.statusOptions.map(
      (o) => `<option${attrs({ value: o.value, selected: o.value === (r.status ?? '') })}>${esc(o.label)}</option>`,
    );
    const status = q.statusOpen
      ? `<select${attrs({ id: `run-status-${r.index}`, class: `larp-input larp-select larp-run-status${unset}`, 'data-change': 'run.status', 'data-team-id': r.id, 'aria-label': r.statusAria })}>${options.join('')}</select>`
      : `<span class="larp-run-status-text${unset}"${attrs({ 'aria-label': `${r.statusAria}: ${r.statusLabel}` })}>${esc(r.status ? r.statusLabel : '—')}</span>`;
    return `<li class="larp-run-row is-${esc(r.state)}"><span class="larp-run-mark" aria-hidden="true"></span>${who}${state}${status}</li>`;
  });
  return panel(
    t('label.queue', lang),
    `<ol class="larp-run-list">${rows.join('')}</ol>`,
    'larp-run-queue',
    'run-queue-title',
  );
}

/** @param {RunVm['timer']} tm @param {number} revision @param {Lang} lang */
function renderTimer(tm, revision, lang) {
  const rev = { 'data-revision': revision };
  const caption = tm.caption ? `<span class="larp-run-caption">${esc(tm.caption)}</span>` : '';
  const clock = tm.kind
    ? `<p class="larp-run-clockline">${caption}${countdown(tm.timer, tm.now, { cls: `larp-run-clock${tm.expired ? ' is-expired' : ''}` })}</p>${tm.expired ? `<p class="larp-run-timeup" role="status">${esc(t('hint.timeUp', lang))}</p>` : ''}`
    : hintP(t('hint.noTimer', lang));
  const next = tm.nextTeam;
  const controls = [
    tm.kind ? button(tm.toggle, 'timer.toggle', { kbd: 'Space' }) : '',
    tm.kind ? button(t('action.add30', lang), 'timer.add30', { kbd: 'T' }) : '',
    tm.endPreparation ? button(tm.endPreparation, 'run.endPreparation', { attrs: rev }) : '',
    next
      ? button(next.label, 'run.nextTeam', {
          kbd: 'N',
          disabled: next.disabled,
          hint: next.hint || undefined,
          attrs: rev,
        })
      : '',
  ].join('');
  const actions = controls ? `<div class="larp-run-actions">${controls}</div>` : '';
  return panel(t('label.timer', lang), clock + actions, 'larp-run-timer', 'run-timer-title');
}

/** @param {RunVm['reveal']} r */
function renderReveal(r) {
  if (!r) return '';
  const body =
    r.kind === 'reveal'
      ? `<p class="larp-run-step">${esc(r.step)}</p><div class="larp-run-actions">${button(r.toggle, 'run.revealToggle', { pressed: r.paused })}${r.next ? button(r.next, 'run.revealNext') : ''}${button(r.skip, 'run.revealSkip')}</div>`
      : `<div class="larp-run-actions">${button(r.replay, 'run.revealReplay')}</div>`;
  return panel(r.title, body, 'larp-run-reveal');
}

/** @param {NonNullable<RunVm['form']>} f @param {Lang} lang */
function renderRecipients(f, lang) {
  const to = t('label.to', lang);
  if (f.editing) return `<p class="larp-run-to"><span class="larp-label">${esc(to)}</span> ${esc(f.editing.to)}</p>`;
  const find = t('label.findRecipient', lang);
  const search = f.searchable
    ? textInput({
        id: 'run-search',
        draft: `${AWARD_FORM}.search`,
        value: f.search,
        live: true,
        cls: 'larp-run-search',
        attrs: { type: 'search', 'aria-label': find, placeholder: find },
      })
    : '';
  const options = f.recipients.map((o) => {
    const member = `<span class="larp-run-member">${esc(o.member)}</span>`;
    const text = !o.team
      ? member
      : o.member
        ? member + teamChip(o.team, { cls: 'larp-run-chip-sm', size: 14 })
        : teamChip(o.team, { sub: true });
    return `<label class="larp-check larp-run-recipient" for="${esc(o.key)}"><input${attrs({ type: 'checkbox', class: 'larp-checkbox', id: o.key, checked: o.checked, 'data-change': 'run.recipient', 'data-value': o.id })}>${text}</label>`;
  });
  return `<fieldset class="larp-run-recipients"><legend class="larp-label">${esc(to)}</legend>${search}<div class="larp-run-options">${options.join('')}</div>${hintP(f.emptyHint)}</fieldset>`;
}

/**
 * @param {NonNullable<RunVm['form']>} f
 * @param {number} revision
 * @param {Lang} lang
 */
function renderForm(f, revision, lang) {
  const d = f.draft;
  const toggle = f.editing
    ? ''
    : segmented({
        label: t('label.recipientType', lang),
        action: 'run.recipientType',
        value: f.type,
        options: f.typeOptions,
      });
  const pointsLabel = t('label.points', lang);
  const amount = field({
    id: 'run-points',
    label: pointsLabel,
    control: signedPointsInput({
      id: 'run-points',
      draft: `${AWARD_FORM}.points`,
      value: d.points ?? '',
      label: pointsLabel,
      lang,
      error: !!f.pointsError,
      hint: !!f.large,
    }),
    error: f.pointsError,
    hint: f.large,
    cls: f.large ? 'is-large' : '',
  });
  const from = f.editing
    ? ''
    : field({
        id: 'run-from',
        label: t('label.from', lang),
        control: selectInput({ id: 'run-from', options: f.fromOptions, value: f.from, draft: `${AWARD_FORM}.from` }),
      });
  const duplicate = f.duplicate
    ? `<div class="larp-run-duplicate" role="status"><p>${esc(f.duplicate)}</p>${awardField('reason', t('label.duplicateReason', lang), d.reason ?? '', LIMITS.duplicateReason)}</div>`
    : '';
  const submit = button(f.submit, f.submitAction, {
    variant: 'secondary', // the top bar's next action is the console's one primary button (U04)
    cls: 'larp-run-submit',
    disabled: f.disabled,
    hint: f.disabled ? f.blockedHint : undefined,
    attrs: { 'data-revision': revision },
  });
  const extra = f.editing
    ? button(t('action.cancel', lang), 'run.cancelEdit', { variant: 'quiet' })
    : button(t('action.saveTemplate', lang), 'run.saveTemplate', { variant: 'quiet' });
  const chips = (/** @type {string} */ key, /** @type {string[]} */ items) =>
    items.length
      ? `<div class="larp-run-reuse"><h3 class="larp-label">${esc(t(key, lang))}</h3><div class="larp-run-chips">${items.join('')}</div></div>`
      : '';
  const templates = f.templates.map(
    (x) =>
      `<span class="larp-run-template">${button(x.text, 'run.useTemplate', { value: x.index, cls: 'larp-run-reuse-btn' })}<button type="button"${attrs({ class: 'larp-run-drop', 'data-action': 'run.dropTemplate', 'data-value': x.index, 'aria-label': x.remove })}>×</button></span>`,
  );
  const recent = f.recent.map((x) => button(x.text, 'run.useRecent', { value: x.id, cls: 'larp-run-reuse-btn' }));
  const name = awardField('name', t('label.name', lang), d.name ?? '', LIMITS.awardName, {
    attrs: { 'data-focus': 'add-award', 'data-change': 'run.touch' },
  });
  const translation = awardField(
    'translation',
    t('label.translation', lang),
    d.translation ?? '',
    LIMITS.awardTranslation,
  );
  const note = awardField('note', t('label.privateNote', lang), d.note ?? '', LIMITS.note, {
    hint: t('hint.privateNote', lang),
  });
  // Enter in a field runs the submit button's action (dom.js bind: data-submit), as a click would.
  return `<section class="larp-panel larp-run-form${f.editing ? ' is-editing' : ''}" aria-labelledby="run-form-title" data-submit="${esc(f.submitAction)}">
<div class="larp-run-form-head"><h2 class="larp-h2" id="run-form-title">${esc(f.heading)}</h2>${toggle}</div>
${renderRecipients(f, lang)}
<div class="larp-run-fields">${name}${translation}</div>
<div class="larp-run-fields larp-run-fields-points">${amount}${from}</div>
${note}${duplicate}
<div class="larp-run-actions">${submit}${extra}</div>
${chips('label.templates', templates)}${chips('label.recent', recent)}
</section>`;
}

/** @param {RunVm['entries']} e @param {RunVm['undo']} undo @param {Lang} lang */
function renderEntries(e, undo, lang) {
  const tag = (/** @type {string} */ key, /** @type {string} */ tip = '') =>
    `<span class="larp-note"${attrs({ 'data-tip': tip || undefined })}>${esc(t(key, lang))}</span>`;
  const rows = e.rows.map((r) => {
    const words = [r.name, r.translation].filter(Boolean).join(' · ');
    const tags = [
      r.large ? tag('label.largeValue') : '',
      r.kept ? tag('label.keptDuplicate', r.kept) : '',
      r.note ? tag('label.privateNote', r.note) : '',
      r.published ? tag('status.published') : '',
    ].join('');
    const actions = r.editable
      ? `<span class="larp-run-entry-actions">${button(t('action.edit', lang), 'run.edit', { value: r.id, variant: 'quiet' })}${button(t('action.remove', lang), 'run.remove', { value: r.id, variant: 'quiet' })}</span>`
      : '';
    return `<li class="larp-run-entry">${points(r.points, { unit: r.unit, lang })}<span class="larp-run-entry-text"><span class="larp-run-entry-to">${esc(r.to)}</span> · <span>${esc(words)}</span> · <span class="larp-run-entry-author">${esc(r.author)}</span>${tags}</span>${actions}</li>`;
  });
  const undoBar = undo
    ? `<p class="larp-run-undo" role="status"><span>${esc(undo.text)}</span>${button(undo.action, 'run.undo', { focus: 'run-undo' })}</p>`
    : '';
  const list = rows.length ? `<ul class="larp-run-entries">${rows.join('')}</ul>` : hintP(t('hint.noEntries', lang));
  return panel(e.title, undoBar + list, 'larp-run-round', 'run-round-title');
}

/** @param {RunVm['projected']} p @param {Lang} lang */
function renderProjected(p, lang) {
  const rows = p.rows.map((r) => {
    const awards = r.awards ? ` ${points(r.awards)}` : '';
    const word = r.status !== 'complete' ? ` <span class="larp-run-status-word">(${esc(r.statusLabel)})</span>` : '';
    const completion =
      r.completion === null
        ? `<span class="larp-run-unset" aria-label="${esc(t('status.unset', lang))}">—</span>`
        : `<span>${esc(r.completionText)}</span>${word}`;
    const score = r.completion === null && !r.awards ? '' : ` = <strong>${esc(r.scoreText)}</strong>`;
    return `<li class="larp-run-proj-row">${teamChip(r.team)}<span class="larp-run-formula">${completion}${awards}${score}</span><span class="larp-run-total">${esc(t('label.total', lang))} ${esc(r.totalText)}</span></li>`;
  });
  const note = p.note ? `<p class="larp-run-proj-note">${esc(p.note)}</p>` : '';
  const without = p.noIndividual ? `<p class="larp-run-flag">${esc(p.noIndividual)}</p>` : '';
  const reveal = p.reveal
    ? `<div class="larp-run-reveal-est"><h3 class="larp-label">${esc(t('label.revealLength', lang))}</h3><p>${esc(p.reveal)}</p></div>`
    : '';
  const body = `${note}<p class="larp-hint larp-run-legend">${esc(t('label.projectedLegend', lang))}</p><ul class="larp-run-proj">${rows.join('')}</ul>${without}${reveal}`;
  return panel(p.title, body, 'larp-run-projected', 'run-proj-title');
}

// ── The handlers ────────────────────────────────────────────────────────────────────────────

/**
 * A command id that stays the same for every click on one rendering of a button (its
 * data-revision), so a double-click applies once; undefined (a fresh id) without one.
 * @param {string} name
 * @param {LarpEvent} event
 * @param {HTMLElement|null|undefined} el
 */
export function clickId(name, event, el) {
  const rev = el?.dataset?.revision;
  return rev === undefined ? undefined : `run-${name}-${event.id}-${rev}`;
}

/**
 * The Run tab's handlers (host.js Screen.actions).
 * @param {App} app
 * @param {UiStore} ui
 * @param {HostEnv} env
 * @returns {Handlers}
 */
export function runActions(app, ui, env) {
  const draft = () => ui.draft(AWARD_FORM);
  const local = () => runLocal(ui.get());
  /** @param {Partial<RunLocal>} patch @param {Record<string, string>} [award] the award drafts to set */
  const setRun = (patch, award) =>
    ui.set((s) => ({
      local: { ...s.local, run: { ...s.local.run, ...patch } },
      ...(award ? { drafts: { ...s.drafts, [AWARD_FORM]: award } } : {}),
    }));
  /** The host's recipients for this turn. @param {LarpEvent} event @param {RecipientType} type @param {string[]} ids */
  const pick = (event, type, ids) =>
    ui.set((s) => ({
      recipientType: type,
      recipientIds: ids,
      local: { ...s.local, run: { ...s.local.run, pickedFor: turnKey(event) } },
    }));
  /** @param {import('./types.js').CommandType} type @param {any} payload @param {string} [id] */
  const send = (type, payload, id) => env.report(app.dispatch(type, payload, { ...actorOf(ui.get()), id }));
  /** @param {string} key */
  const refuse = (key) => ui.set({ flash: { kind: 'error', key } });
  /** @param {string|undefined} id */
  const adjustment = (id) => app.getEvent()?.adjustments.find((a) => a.id === id);
  /** After Save or Cancel: the add form comes back as it was before Edit. */
  const leaveEdit = () => setRun({ editing: null, stash: null }, { ...(local().stash ?? {}) });
  /** A phase step's button (End Preparation, Next Team), applied once per rendering. @param {'endPreparation'|'nextTeam'} type */
  const step =
    (type) =>
    (/** @type {{ el: HTMLElement|null }} */ { el }) => {
      const event = app.getEvent();
      if (event) send(type, {}, clickId(type, event, el));
    };
  /** The form's words and amount cleared after an add; recipients, From and the search stay. */
  const keptAfterAdd = () => {
    const d = draft();
    return Object.fromEntries(Object.entries({ from: d.from, search: d.search }).filter(([, v]) => v !== undefined));
  };

  return {
    'run.status': ({ el, value }) => {
      const teamId = el?.dataset?.teamId;
      if (teamId) send('setStatus', { teamId, status: value ? /** @type {CompletionStatus} */ (value) : null });
    },
    'run.pick': ({ value }) => {
      const event = app.getEvent();
      if (!event || !value) return;
      pick(event, 'team', [value]);
      env.focus('[data-focus="add-award"]');
    },
    'run.recipientType': ({ value }) => {
      const event = app.getEvent();
      if (!event || (value !== 'team' && value !== 'member')) return;
      if (value === ui.get().recipientType) return;
      const team = performingTeamId(event);
      pick(event, value, value === 'team' && team ? [team] : []);
    },
    'run.recipient': ({ el, value }) => {
      const event = app.getEvent();
      const id = el?.dataset?.value;
      if (!event || !id) return;
      const ids = awardRecipients(event, ui.get()).ids.filter((x) => x !== id);
      if (value === 'true') ids.push(id);
      pick(event, ui.get().recipientType, ids);
    },
    // The name field left: re-render so a duplicate warning shows before Add is pressed.
    'run.touch': () => ui.set({}),
    'run.add': ({ el }) => {
      const event = app.getEvent();
      if (!event) return;
      const { type, ids } = awardRecipients(event, ui.get());
      const d = draft();
      const check = checkAward(event, { type, ids, draft: d });
      if (check.blocked) return refuse(check.blocked);
      if (send('addAward', awardPayload(event, { type, ids, draft: d }), clickId('add', event, el))) {
        setRun({}, keptAfterAdd());
        env.focus('[data-focus="add-award"]');
      }
    },
    'run.edit': ({ value }) => {
      const adj = adjustment(value);
      if (!adj || adj.status !== 'draft') return;
      const before = local().editing ? (local().stash ?? {}) : { ...draft() };
      setRun({ editing: adj.id, stash: before }, fillDraft({ from: draft().from ?? '' }, adj));
      env.focus('[data-focus="add-award"]');
    },
    'run.saveEdit': () => {
      const event = app.getEvent();
      const adj = adjustment(local().editing ?? undefined);
      if (!event || !adj) return leaveEdit();
      const { blocked } = checkEdit(event, adj, draft());
      if (blocked) return refuse(blocked);
      if (send('editAward', editPayload(event, adj, draft()))) leaveEdit();
    },
    'run.cancelEdit': () => leaveEdit(),
    'run.remove': ({ value }) => {
      const adj = adjustment(value);
      if (adj && send('removeAward', { adjustmentId: adj.id })) {
        if (local().editing === adj.id) leaveEdit();
        setRun({ undo: { id: adj.id, at: env.now() } });
        env.focus('[data-focus="run-undo"]');
      }
    },
    'run.undo': () => {
      const adj = adjustment(local().undo?.id);
      if (adj && adj.status === 'discarded' && send('addAward', undoPayload(adj), `run-undo-${adj.id}`)) {
        setRun({ undo: null });
      }
    },
    'run.saveTemplate': () => {
      const d = draft();
      const name = cleanText(d.name ?? '');
      const value = parsePoints(d.points ?? '');
      if (!name) return refuse('error.invalid_name');
      if (value === null) return refuse('error.invalid_points');
      const tpl = { name, translation: cleanText(d.translation ?? ''), points: value };
      setRun({ templates: addTemplate(readTemplates(local().templates), tpl) });
    },
    'run.useTemplate': ({ value }) => {
      const tpl = readTemplates(local().templates)[Number(value)];
      if (tpl) setRun({}, fillDraft(draft(), tpl));
    },
    'run.dropTemplate': ({ value }) => {
      setRun({ templates: readTemplates(local().templates).filter((_, i) => i !== Number(value)) });
    },
    'run.useRecent': ({ value }) => {
      const adj = adjustment(value);
      if (adj) setRun({}, fillDraft(draft(), { name: adj.name, translation: adj.translation, points: adj.points }));
      env.focus('[data-focus="add-award"]');
    },
    'run.endPreparation': step('endPreparation'),
    'run.nextTeam': step('nextTeam'),
    'run.revealToggle': () => {
      const r = app.getEvent()?.reveal;
      if (r) send(r.paused ? 'revealResume' : 'revealPause', {});
    },
    'run.revealNext': () => {
      const r = app.getEvent()?.reveal;
      // The shell's auto-advance uses the same id: a click as the banner times out advances once.
      if (r) send('revealAdvance', {}, `reveal-${r.roundId}-${r.step}-${r.stepStartedAt}`);
    },
    'run.revealSkip': () => send('revealSkip', {}),
    'run.revealReplay': () => send('revealReplay', { step: 0 }),
  };
}

/** @type {Screen} */
export const runTab = {
  id: 'run',
  labelKey: 'tab.run',
  vm: runVm,
  render: renderRun,
  actions: runActions,
};
