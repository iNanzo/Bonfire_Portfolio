// The host console's Review and History tabs (the design's Review and Publication).
//
// Review: the current round's teams side by side, each with its completion status (a picker; an
// unset status is the outlined dash and blocks publishing), its completion points, its team awards
// and its members' individual awards (each with its author and private note, Edit and Remove), the
// round score and projected total; the flags scoring.flags finds (duplicates, large values, teams
// without individual recognition, unset statuses); the reveal's estimated length; Reopen Judging and
// Publish And Reveal (confirmed first, disabled with its reason while a team has no status). Before
// Review Round it compares the drafts without publishing; once published it points to History.
//
// History: every published round's frozen result (statuses, completion, every award with its
// author and note), skipped rounds, the corrections (who, how much, the public reason, the original
// award it corrects), Add Correction (a signed difference with a public reason and an optional
// original award), the team standings and the full individual ranking (host only, ties 1, 1, 3).
//
// Owner: the host-review screen. Styles: css/host-review.css. Interface: host.js's Screen.
// Pure apart from reviewActions / historyActions (which only call app, ui and env). Local state,
// all in the UI store: drafts.reviewEdit (the award being edited), drafts.correction (Add
// Correction: type, recipient, points, reason, translation, note, round, target), local.review
// { editing, undo: { id, at } }. Editing reuses hostRun.js's checkEdit / editPayload / fillDraft and
// Undo its undoPayload, so both tabs treat an award the same way.
/**
 * @typedef {import('./host.js').Screen} Screen
 * @typedef {import('./host.js').ScreenCtx} ScreenCtx
 * @typedef {import('./host.js').HostEnv} HostEnv
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Round} Round
 * @typedef {import('./types.js').Team} Team
 * @typedef {import('./types.js').Adjustment} Adjustment
 * @typedef {import('./types.js').PublishedAdjustment} PublishedAdjustment
 * @typedef {import('./types.js').CompletionStatus} CompletionStatus
 * @typedef {import('./types.js').CorrectionInput} CorrectionInput
 * @typedef {import('./types.js').RecipientType} RecipientType
 * @typedef {import('./types.js').CommandType} CommandType
 * @typedef {import('./types.js').Lang} Lang
 * @typedef {import('./uiState.js').UiState} UiState
 * @typedef {import('./uiState.js').UiStore} UiStore
 * @typedef {import('./app.js').App} App
 * @typedef {import('./dom.js').Handlers} Handlers
 */
import { esc } from '../html.js';
import { actorOf } from './uiState.js';
import { COMPLETION_STATUSES, HOST_GM_ID, LIMITS } from './types.js';
import { cleanText, formatClock, formatNumber, formatPoints, parsePoints, t } from './strings.js';
import { exactSum, flags, memberTotals, previewRound, rank, standings, teamTotals } from './scoring.js';
import { canAdvance, revealSteps } from './phases.js';
import { revealLength } from './displayView.js';
import { button, field, label, points, segmented, selectInput, signedPointsInput, teamChip, textInput } from './ui.js';
import { UNDO_MS, checkEdit, currentRound, editPayload, fillDraft, undoPayload } from './hostRun.js';

/** The draft form an award being edited in Review types into. */
export const EDIT_FORM = 'reviewEdit';
/** The draft form Add Correction types into. */
export const CORRECTION_FORM = 'correction';

/**
 * Review's own view choices (ui.local.review).
 * @typedef {{ editing?: string|null, undo?: { id: string, at: number }|null }} ReviewLocal
 */

/** @param {UiState} ui @returns {ReviewLocal} */
const reviewLocal = (ui) => /** @type {ReviewLocal} */ (ui.local?.review ?? {});

// ── Shared pure helpers ──────────────────────────────────────────────────────────────────────

/**
 * A round's title: 'Round 4 · Bible Skit' (host.js roundTitle, by round).
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {Lang} lang
 */
export function roundName(event, round, lang) {
  return `${label('label.roundN', lang, { n: event.rounds.indexOf(round) + 1 })} · ${t(`round.${round.category}`, lang)}`;
}

/**
 * Who an award is from: the host's role word for the host, a co-GM's name, or 'Co-GM' for one
 * since removed.
 * @param {LarpEvent} event
 * @param {string} gmId
 * @param {Lang} lang
 */
function authorName(event, gmId, lang) {
  if (gmId === HOST_GM_ID) return t('role.host', lang);
  return event.gms.find((g) => g.id === gmId)?.name ?? t('role.coGm', lang);
}

/**
 * Names by id: teams, roster members, and members known only from published awards or
 * corrections (removed since).
 * @param {LarpEvent} event
 */
function namesOf(event) {
  const teams = new Map(event.teams.map((tm) => [tm.id, tm]));
  /** @type {Map<string, { name: string, teamId: string, removed: boolean }>} */
  const members = new Map(event.roster.map((m) => [m.id, { name: m.name, teamId: m.teamId, removed: false }]));
  const known = (
    /** @type {{ recipientType: RecipientType, recipientId: string, recipientName: string, teamId: string }} */ a,
  ) => {
    if (a.recipientType === 'member' && !members.has(a.recipientId)) {
      members.set(a.recipientId, { name: a.recipientName, teamId: a.teamId, removed: true });
    }
  };
  for (const r of event.results) r.adjustments.forEach(known);
  event.corrections.forEach(known);
  const teamName = (/** @type {string} */ id) => teams.get(id)?.name ?? '';
  return { teams, members, teamName, memberName: (/** @type {string} */ id) => members.get(id)?.name ?? '' };
}

/** @param {number} n @param {RecipientType} type @param {Lang} lang */
const signed = (n, type, lang) => formatPoints(n, { unit: type === 'team' ? 'team' : 'individual', lang });

// ── Review: pure helpers ──────────────────────────────────────────────────────────────────────

/**
 * One award as Review lists it.
 * @typedef {{
 *   id: string, name: string, translation: string, points: number, unit: 'team'|'individual',
 *   recipient: string, author: string, note: string, duplicate: boolean, large: boolean,
 *   kept: string|null, editing: boolean,
 * }} ReviewAward
 */

/**
 * The round's teams side by side (queue order) with their awards; awards whose team isn't in the
 * queue go in `others`.
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {UiState} ui
 * @param {Lang} lang
 */
export function reviewColumns(event, round, ui, lang) {
  const names = namesOf(event);
  const f = flags(event, round.id);
  const dup = new Set(f.duplicates.flat());
  const large = new Set(f.large);
  const without = new Set(f.teamsWithoutIndividual);
  const preview = previewRound(event, round.id);
  const editing = reviewLocal(ui).editing ?? null;
  const drafts = event.adjustments.filter((a) => a.roundId === round.id && a.status === 'draft');
  /** @param {Adjustment} a @returns {ReviewAward} */
  const row = (a) => ({
    id: a.id,
    name: a.name,
    translation: a.translation,
    points: a.points,
    unit: a.recipientType === 'team' ? 'team' : 'individual',
    recipient: a.recipientType === 'team' ? names.teamName(a.recipientId) : names.memberName(a.recipientId),
    author: authorName(event, a.authorId, lang),
    note: a.note,
    duplicate: dup.has(a.id),
    large: large.has(a.id),
    kept: a.duplicateReason,
    editing: a.id === editing,
  });
  const teamOf = (/** @type {Adjustment} */ a) =>
    a.recipientType === 'team' ? a.recipientId : (names.members.get(a.recipientId)?.teamId ?? '');
  const queue = round.order.filter((id) => names.teams.has(id));
  const columns = queue.map((teamId) => {
    const team = /** @type {Team} */ (names.teams.get(teamId));
    const status = round.statuses[teamId] ?? null;
    const mine = drafts.filter((a) => teamOf(a) === teamId);
    const teamAwards = mine.filter((a) => a.recipientType === 'team').map(row);
    return {
      team,
      status,
      completion: status === 'complete' ? round.base : 0,
      teamAwards,
      memberAwards: mine.filter((a) => a.recipientType === 'member').map(row),
      awardSum: exactSum(teamAwards.map((r) => r.points)),
      roundScore: preview.teamRoundScores[teamId] ?? 0,
      total: preview.projectedTotals[teamId] ?? 0,
      noIndividual: without.has(teamId),
    };
  });
  const inQueue = new Set(queue);
  const others = drafts.filter((a) => !inQueue.has(teamOf(a))).map(row);
  return { columns, others };
}

/**
 * The round's flags as sentences, in the order the host deals with them: unset statuses (these
 * block publishing), duplicates, large values, teams without individual recognition.
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {Lang} lang
 * @returns {Array<{ kind: 'unset'|'duplicate'|'large'|'noIndividual', text: string }>}
 */
export function flagItems(event, round, lang) {
  const f = flags(event, round.id);
  const names = namesOf(event);
  const byId = new Map(event.adjustments.map((a) => [a.id, a]));
  const recipient = (/** @type {Adjustment} */ a) =>
    a.recipientType === 'team' ? names.teamName(a.recipientId) : names.memberName(a.recipientId);
  const teams = (/** @type {string[]} */ ids) => ids.map(names.teamName).join(', ');
  /** @type {Array<{ kind: 'unset'|'duplicate'|'large'|'noIndividual', text: string }>} */
  const out = [];
  if (f.unsetStatuses.length) {
    out.push({ kind: 'unset', text: label('hint.noStatus', lang, { teams: teams(f.unsetStatuses) }) });
  }
  for (const group of f.duplicates) {
    const first = /** @type {Adjustment} */ (byId.get(group[0]));
    out.push({
      kind: 'duplicate',
      text: label('hint.duplicateGroup', lang, { name: recipient(first), n: group.length, award: first.name }),
    });
  }
  for (const id of f.large) {
    const a = /** @type {Adjustment} */ (byId.get(id));
    out.push({
      kind: 'large',
      text: label('hint.largeAward', lang, {
        name: recipient(a),
        points: signed(a.points, a.recipientType, lang),
        base: formatNumber(round.base, lang),
      }),
    });
  }
  if (f.teamsWithoutIndividual.length) {
    out.push({
      kind: 'noIndividual',
      text: label('hint.noIndividualYet', lang, { teams: teams(f.teamsWithoutIndividual) }),
    });
  }
  return out;
}

/**
 * Publish And Reveal for the round under review: its label, and why it is blocked (null when it
 * isn't) with the flash that explains it.
 * @param {LarpEvent} event
 * @param {Lang} lang
 * @returns {{ label: string, blocked: string|null, flash: { key: string, vars?: Record<string, number> }|null }}
 */
export function publishState(event, lang) {
  const text = label('action.publishRevealRound', lang, { n: event.roundIndex + 1 });
  const check = canAdvance(event, 'reveal');
  if (!('error' in check)) return { label: text, blocked: null, flash: null };
  const n = check.error.ids?.length ?? 0;
  /** @type {{ key: string, vars?: Record<string, number> }} */
  const flash =
    check.error.code === 'status_unset'
      ? { key: n === 1 ? 'hint.needStatusOne' : 'hint.needStatusMany', vars: { n } }
      : { key: `error.${check.error.code}` };
  return { label: text, blocked: label(flash.key, lang, flash.vars), flash };
}

/**
 * Review's view model.
 * @param {ScreenCtx} ctx
 */
export function reviewVm(ctx) {
  const { event, ui, now, lang } = ctx;
  const base = { lang, title: t('tab.review', lang), revision: event.revision };
  const round = currentRound(event);
  if (!round) return { ...base, state: /** @type {const} */ ('idle'), hint: t('hint.reviewIdle', lang) };
  const roundTitle = roundName(event, round, lang);
  if (round.skipped)
    return { ...base, state: /** @type {const} */ ('skipped'), round: roundTitle, hint: t('hint.roundSkipped', lang) };
  if (event.results.some((r) => r.roundId === round.id)) {
    return {
      ...base,
      state: /** @type {const} */ ('published'),
      round: roundTitle,
      hint: t('hint.roundPublished', lang),
    };
  }
  const inReview = event.roundPhase === 'review';
  const { columns, others } = reviewColumns(event, round, ui, lang);
  const local = reviewLocal(ui);
  const editingAdj = local.editing
    ? event.adjustments.find((a) => a.id === local.editing && a.status === 'draft' && a.roundId === round.id)
    : undefined;
  const draft = ui.drafts?.[EDIT_FORM] ?? {};
  const check = editingAdj ? checkEdit(event, editingAdj, draft) : null;
  const undoAdj =
    local.undo && now - local.undo.at < UNDO_MS
      ? event.adjustments.find((a) => a.id === local.undo?.id && a.status === 'discarded')
      : undefined;
  const steps = revealSteps(event, round.id);
  const done = columns.filter((c) => c.status !== null).length;
  return {
    ...base,
    state: inReview ? /** @type {const} */ ('review') : /** @type {const} */ ('judging'),
    round: roundTitle,
    hint: inReview ? t('hint.reopen', lang) : t('hint.reviewNotYet', lang),
    base: round.base,
    columns,
    others,
    flags: flagItems(event, round, lang),
    statusCount: label('label.statusCount', lang, { done, total: columns.length }),
    // As the display paces it: a banner every 3 s, or a long queue's grouped team pages.
    reveal: { banners: steps.length, time: formatClock(revealLength(steps)) },
    publish: inReview ? publishState(event, lang) : null,
    edit:
      editingAdj && check
        ? {
            id: editingAdj.id,
            draft,
            duplicates: check.duplicates.length,
            large: check.large,
            error: check.blocked && check.blocked !== 'error.duplicate_award' ? t(check.blocked, lang) : '',
          }
        : null,
    undo: undoAdj ? { text: label('hint.removed', lang, { name: undoAdj.name }) } : null,
  };
}

/**
 * @typedef {ReturnType<typeof reviewVm>} ReviewVm
 * @typedef {Extract<ReviewVm, { state: 'review'|'judging' }>} OpenReviewVm Review with a round to compare
 */

/**
 * A labelled one-line text field bound to a draft form: text(name, label, maxLength, hint, attrs).
 * @param {string} form the draft form
 * @param {string} prefix the fields' id prefix
 * @param {Record<string, string>} draft the form's drafts
 */
const textField =
  (form, prefix, draft) =>
  (
    /** @type {string} */ name,
    /** @type {string} */ text,
    /** @type {number} */ maxLength,
    hint = '',
    /** @type {Record<string, string>} */ extra = undefined,
  ) => {
    const id = `${prefix}-${name}`;
    const value = draft[name] ?? '';
    const control = textInput({ id, draft: `${form}.${name}`, value, maxLength, hint: !!hint, attrs: extra });
    return field({ id, label: text, control, hint });
  };

// ── Review: markup ────────────────────────────────────────────────────────────────────────────

/** @param {string} key @param {Lang} lang @param {string} [extra] */
const tag = (key, lang, extra = '') =>
  `<span class="larp-review-tag${extra ? ` ${extra}` : ''}">${esc(t(key, lang))}</span>`;

/**
 * Review's markup.
 * @param {ReviewVm} vm
 * @returns {string}
 */
export function renderReview(vm) {
  const { lang } = vm;
  if (vm.state === 'idle') {
    return `<section class="larp-panel larp-review larp-review-idle"><h2 class="larp-h2">${esc(vm.title)}</h2><p class="larp-hint">${esc(vm.hint)}</p></section>`;
  }
  const head = `<h2 class="larp-h2" id="review-title">${esc(vm.title)} · ${esc(vm.round)}</h2>`;
  if (vm.state !== 'review' && vm.state !== 'judging') {
    return `<section class="larp-panel larp-review larp-review-idle" aria-labelledby="review-title">${head}<p class="larp-hint">${esc(vm.hint)}</p></section>`;
  }
  const rev = { 'data-revision': vm.revision };
  const actions = vm.publish
    ? `<div class="larp-review-actions">${button(t('action.reopenJudging', lang), 'review.reopen', { attrs: rev })}${button(vm.publish.label, 'review.publish', { disabled: !!vm.publish.blocked, hint: vm.publish.blocked ?? undefined, attrs: rev, focus: 'review-publish' })}</div>${vm.publish.blocked ? `<p class="larp-review-why" role="status">${esc(vm.publish.blocked)}</p>` : ''}`
    : '';
  const flagList = vm.flags.length
    ? `<ul class="larp-review-flags">${vm.flags.map((x) => `<li class="is-${esc(x.kind)}">${esc(x.text)}</li>`).join('')}</ul>`
    : `<p class="larp-hint">${esc(t('hint.reviewClear', lang))}</p>`;
  const undo = vm.undo
    ? `<p class="larp-review-undo" role="status"><span>${esc(vm.undo.text)}</span>${button(t('action.undo', lang), 'review.undo', { variant: 'quiet', focus: 'review-undo' })}</p>`
    : '';
  const summary = `<section class="larp-panel larp-review-summary" aria-labelledby="review-title">${head}
  <p class="larp-hint">${esc(vm.hint)}</p>
  <p class="larp-review-count">${esc(vm.statusCount)}</p>
  <p class="larp-review-reveal"><span class="larp-label">${esc(t('label.revealLength', lang))}</span> ${esc(label('hint.revealEstimate', lang, { time: vm.reveal.time }))}</p>
  ${actions}
  <div class="larp-review-flagbox"><h3 class="larp-label">${esc(t('label.flags', lang))}</h3>${flagList}${undo}</div>
</section>`;
  const cols = vm.columns.map((c) => renderColumn(vm, c)).join('');
  const others = vm.others.length
    ? `<section class="larp-panel larp-review-col larp-review-others"><h3 class="larp-label">${esc(t('label.otherRecipients', lang))}</h3><ul class="larp-review-awards">${vm.others.map((r) => renderAward(vm, r)).join('')}</ul></section>`
    : '';
  return `<div class="larp-review">${summary}<div class="larp-review-cols">${cols}${others}</div></div>`;
}

/**
 * One team's column.
 * @param {OpenReviewVm} vm
 * @param {OpenReviewVm['columns'][number]} c
 */
function renderColumn(vm, c) {
  const { lang } = vm;
  const name = c.team.name;
  const options = [
    { value: '', label: '—' },
    ...COMPLETION_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`, lang) })),
  ];
  const picker = selectInput({
    id: `review-status-${c.team.id}`,
    options,
    value: c.status ?? '',
    action: 'review.status',
    cls: `larp-review-status${c.status ? '' : ' is-unset'}`,
  }).replace(
    'data-change="review.status"',
    `data-change="review.status" data-team-id="${esc(c.team.id)}" aria-label="${esc(label('label.statusFor', lang, { team: name }))}"`,
  );
  const list = (/** @type {ReviewAward[]} */ rows, /** @type {string} */ key) =>
    rows.length
      ? `<h4 class="larp-label">${esc(t(key, lang))}</h4><ul class="larp-review-awards">${rows.map((r) => renderAward(vm, r)).join('')}</ul>`
      : '';
  const noIndividual = c.noIndividual ? `<p class="larp-review-noind">${tag('label.noIndividual', lang)}</p>` : '';
  const empty =
    !c.teamAwards.length && !c.memberAwards.length ? `<p class="larp-hint">${esc(t('hint.noEntries', lang))}</p>` : '';
  const edge = /^#[0-9a-f]{6}$/i.test(c.team.color) ? ` style="--team:${c.team.color}"` : '';
  return `<section class="larp-panel larp-review-col"${edge} aria-label="${esc(name)}">
  <header class="larp-review-col-head">${teamChip(c.team, { sub: true })}${picker}</header>
  <p class="larp-review-score"><span>${esc(t('label.completion', lang))} ${esc(formatNumber(c.completion, lang))}</span> <span>${esc(t('label.awards', lang))} ${points(c.awardSum, { lang })}</span> <span class="larp-review-round">${esc(t('label.roundScore', lang))} <b>${esc(formatNumber(c.roundScore, lang))}</b></span></p>
  <p class="larp-review-total">${esc(t('label.projected', lang))} · ${esc(t('label.total', lang))} ${esc(formatNumber(c.total, lang))}</p>
  ${list(c.teamAwards, 'label.teamAwards')}${list(c.memberAwards, 'label.individualAwards')}${empty}${noIndividual}
</section>`;
}

/**
 * One award: its amount (signed, with its unit), name, translation, recipient (individual), author,
 * flags and private note; Edit and Remove; or its edit form.
 * @param {OpenReviewVm} vm
 * @param {ReviewAward} r
 */
function renderAward(vm, r) {
  const { lang } = vm;
  if (r.editing && vm.edit) return `<li class="larp-review-award is-editing">${renderEdit(vm, r)}</li>`;
  const tags = [
    r.duplicate ? tag('label.duplicate', lang, 'is-warn') : '',
    r.large ? tag('label.largeValue', lang, 'is-warn') : '',
  ].join('');
  const kept = r.kept
    ? `<p class="larp-review-kept">${esc(label('label.keptBecause', lang, { reason: r.kept }))}</p>`
    : '';
  const note = r.note
    ? `<p class="larp-review-note"><span class="larp-label-inline">${esc(t('label.privateNote', lang))}</span> ${esc(r.note)}</p>`
    : '';
  const who = r.unit === 'individual' ? `<span class="larp-review-who">${esc(r.recipient)}</span> · ` : '';
  const translation = r.translation ? ` <span class="larp-review-trans" lang="en">${esc(r.translation)}</span>` : '';
  return `<li class="larp-review-award">
  <div class="larp-review-award-main">${points(r.points, { unit: r.unit, lang })} <span class="larp-review-name">${who}${esc(r.name)}</span>${translation}</div>
  <p class="larp-review-meta">${esc(label('label.fromName', lang, { name: r.author }))}${tags}</p>${kept}${note}
  <span class="larp-review-award-actions">${button(t('action.edit', lang), 'review.edit', { value: r.id, variant: 'quiet' })}${button(t('action.remove', lang), 'review.remove', { value: r.id, variant: 'quiet' })}</span>
</li>`;
}

/**
 * The inline form for the award being edited.
 * @param {OpenReviewVm} vm
 * @param {ReviewAward} r
 */
function renderEdit(vm, r) {
  const { lang } = vm;
  const e = /** @type {NonNullable<OpenReviewVm['edit']>} */ (vm.edit);
  const d = e.draft;
  const id = (/** @type {string} */ k) => `review-edit-${k}`;
  const text = textField(EDIT_FORM, 'review-edit', d);
  const name = text('name', t('label.name', lang), LIMITS.awardName, '', {
    'data-focus': 'review-edit',
    'data-change': 'review.touch',
  });
  const translation = text('translation', t('label.translation', lang), LIMITS.awardTranslation);
  const amount = field({
    id: id('points'),
    label: t('label.points', lang),
    control: signedPointsInput({
      id: id('points'),
      draft: `${EDIT_FORM}.points`,
      value: d.points ?? '',
      label: t('label.points', lang),
      error: !!e.error,
    }),
    error: e.error,
    hint: e.large ? t('hint.large', lang) : '',
  });
  const note = text('note', t('label.privateNote', lang), LIMITS.note, t('hint.privateNote', lang));
  const reason = e.duplicates
    ? text('reason', t('label.duplicateReason', lang), LIMITS.duplicateReason, t('hint.duplicate', lang))
    : '';
  const to = `<p class="larp-review-meta">${esc(t('label.editAward', lang))} · ${esc(r.recipient)}</p>`;
  return `<div class="larp-review-edit">${to}${name}${translation}${amount}${note}${reason}<div class="larp-review-actions">${button(t('action.save', lang), 'review.saveEdit', { disabled: !!e.error })}${button(t('action.cancel', lang), 'review.cancelEdit', { variant: 'quiet' })}</div></div>`;
}

// ── Review: handlers ─────────────────────────────────────────────────────────────────────────

/**
 * Review's handlers (host.js Screen.actions).
 * @param {App} app
 * @param {UiStore} ui
 * @param {HostEnv} env
 * @returns {Handlers}
 */
export function reviewActions(app, ui, env) {
  const local = () => reviewLocal(ui.get());
  /** @param {Partial<ReviewLocal>} patch @param {Record<string, string>|null} [edit] the edit drafts (null clears) */
  const setReview = (patch, edit) =>
    ui.set((s) => {
      const drafts = { ...s.drafts };
      if (edit === null) delete drafts[EDIT_FORM];
      else if (edit) drafts[EDIT_FORM] = edit;
      return { local: { ...s.local, review: { ...s.local.review, ...patch } }, drafts };
    });
  /** @param {CommandType} type @param {any} payload @param {string} [id] */
  const send = (type, payload, id) => env.report(app.dispatch(type, payload, { ...actorOf(ui.get()), id }));
  /** @param {string|undefined} id */
  const adjustment = (id) => app.getEvent()?.adjustments.find((a) => a.id === id);
  /** @param {HTMLElement|null|undefined} el @param {string} name */
  const clickId = (el, name) => {
    const rev = el?.dataset?.revision;
    const event = app.getEvent();
    return rev === undefined || !event ? undefined : `review-${name}-${event.id}-${rev}`;
  };

  return {
    'review.status': ({ el, value }) => {
      const teamId = el?.dataset?.teamId;
      if (teamId) send('setStatus', { teamId, status: value ? /** @type {CompletionStatus} */ (value) : null });
    },
    'review.touch': () => ui.set({}),
    'review.edit': ({ value }) => {
      const adj = adjustment(value);
      if (!adj || adj.status !== 'draft') return;
      setReview({ editing: adj.id }, fillDraft({}, adj));
      env.focus('[data-focus="review-edit"]');
    },
    'review.saveEdit': () => {
      const event = app.getEvent();
      const adj = adjustment(local().editing ?? undefined);
      if (!event || !adj) return setReview({ editing: null }, null);
      const draft = ui.draft(EDIT_FORM);
      const { blocked } = checkEdit(event, adj, draft);
      if (blocked) return ui.set({ flash: { kind: 'error', key: blocked } });
      if (send('editAward', editPayload(event, adj, draft))) setReview({ editing: null }, null);
    },
    'review.cancelEdit': () => setReview({ editing: null }, null),
    'review.remove': ({ value }) => {
      const adj = adjustment(value);
      if (adj && send('removeAward', { adjustmentId: adj.id })) {
        setReview({ undo: { id: adj.id, at: env.now() }, ...(local().editing === adj.id ? { editing: null } : {}) });
        env.focus('[data-focus="review-undo"]');
      }
    },
    'review.undo': () => {
      const adj = adjustment(local().undo?.id);
      if (adj && adj.status === 'discarded' && send('addAward', undoPayload(adj), `review-undo-${adj.id}`)) {
        setReview({ undo: null });
      }
    },
    'review.reopen': ({ el }) => {
      send('reopenJudging', {}, clickId(el, 'reopen'));
    },
    'review.publish': ({ confirmed }) => {
      const event = app.getEvent();
      const round = event && currentRound(event);
      if (!event || !round || event.roundPhase !== 'review') return;
      const state = publishState(event, event.config.hostLang);
      if (state.flash) return ui.set({ flash: { kind: 'error', ...state.flash } });
      if (!confirmed) {
        env.confirm({ action: 'review.publish', hintKey: 'hint.confirmPublish', labelKey: 'action.publishReveal' });
        return;
      }
      // One id per round: a repeated confirmation is applied once (A13).
      if (send('publishRound', { roundId: round.id }, `review-publish-${event.id}-${round.id}`)) {
        ui.set({ tab: 'run' });
      }
    },
  };
}

// ── History: pure helpers ─────────────────────────────────────────────────────────────────────

/**
 * Who a correction can name: every team, or every roster member plus members known only from a
 * published award (removed since), labelled with their team.
 * @param {LarpEvent} event
 * @param {RecipientType} type
 * @param {Lang} lang
 * @returns {Array<{ value: string, label: string }>}
 */
export function correctionRecipients(event, type, lang) {
  const names = namesOf(event);
  if (type === 'team') return event.teams.map((tm) => ({ value: tm.id, label: tm.name }));
  return [...names.members].map(([id, m]) => ({
    value: id,
    label: [m.name, names.teamName(m.teamId), m.removed ? t('label.removedMember', lang) : '']
      .filter(Boolean)
      .join(' · '),
  }));
}

/**
 * The published awards a correction for this recipient may point at (in the chosen round when
 * there is one).
 * @param {LarpEvent} event
 * @param {RecipientType} type
 * @param {string} recipientId
 * @param {string|null} roundId
 * @returns {PublishedAdjustment[]}
 */
export function correctionTargets(event, type, recipientId, roundId) {
  if (!recipientId) return [];
  return event.results
    .filter((r) => roundId === null || r.roundId === roundId)
    .flatMap((r) => r.adjustments)
    .filter((a) => a.recipientType === type && a.recipientId === recipientId);
}

/**
 * The Add Correction form checked against the event: the first reason it can't be sent (a
 * strings.js key) or null, the payload, and the recipient's total before and after.
 * @param {LarpEvent} event
 * @param {Record<string, string>} draft
 */
export function checkCorrection(event, draft) {
  /** @type {RecipientType} */
  const type = draft.type === 'member' ? 'member' : 'team';
  const lang = event.config.hostLang;
  const valid = correctionRecipients(event, type, lang).some((o) => o.value === draft.recipient);
  const recipient = valid ? draft.recipient : '';
  const typed = (draft.points ?? '').trim();
  const value = parsePoints(typed);
  const reason = cleanText(draft.reason ?? '');
  const round = event.results.some((r) => r.roundId === draft.round) ? draft.round : null;
  const target = correctionTargets(event, type, recipient, round).find((a) => a.id === draft.target) ?? null;
  const blocked =
    event.phase === 'setup'
      ? 'hint.correctionsLater'
      : !recipient
        ? 'error.no_recipients'
        : value === null
          ? 'error.invalid_points'
          : value === 0
            ? 'error.zero_correction'
            : !reason || [...reason].length > LIMITS.reason
              ? 'error.invalid_reason'
              : null;
  const totals = type === 'team' ? teamTotals(event) : memberTotals(event);
  const before = recipient ? (totals[recipient] ?? 0) : null;
  const after = before !== null && value !== null ? exactSum([before, value]) : null;
  /** @type {CorrectionInput} */
  const payload = {
    recipientType: type,
    recipientId: recipient,
    points: value ?? 0,
    reason,
    translation: cleanText(draft.translation ?? ''),
    note: (draft.note ?? '').trim(),
    roundId: target ? target.roundId : round,
    targetAdjustmentId: target ? target.id : null,
  };
  return {
    type,
    recipient,
    round,
    target,
    blocked,
    pointsError: !!typed && value === null && !['-', '−', '+'].includes(typed),
    before,
    after,
    payload,
  };
}

/**
 * Every member's individual total, ranked (ties share a place: 1, 1, 3), zero and negative totals
 * included, removed members with published points too: the host's full ranking (U10).
 * @param {LarpEvent} event
 * @param {Lang} _lang
 * @returns {Array<{ id: string, place: number, name: string, team: string, total: number, removed: boolean }>}
 */
export function memberRanking(event, _lang) {
  const names = namesOf(event);
  const totals = memberTotals(event);
  return rank(Object.keys(totals).map((id) => ({ id, total: totals[id] }))).map((r) => {
    const m = names.members.get(r.id);
    return {
      id: r.id,
      place: r.place,
      name: m?.name ?? '',
      team: m ? names.teamName(m.teamId) : '',
      total: r.total,
      removed: !!m?.removed,
    };
  });
}

/**
 * History's view model.
 * @param {ScreenCtx} ctx
 */
export function historyVm(ctx) {
  const { event, ui, lang } = ctx;
  const names = namesOf(event);
  const at = (/** @type {number} */ ms) =>
    event.startedAt === null ? '' : label('label.atEventTime', lang, { time: formatClock(ms - event.startedAt) });
  /** @param {PublishedAdjustment} a */
  const award = (a) => ({
    id: a.id,
    name: a.name,
    translation: a.translation,
    points: a.points,
    unit: a.recipientType === 'team' ? /** @type {const} */ ('team') : /** @type {const} */ ('individual'),
    recipient: a.recipientName,
    team: names.teamName(a.teamId),
    author: authorName(event, a.authorId, lang),
    note: a.note,
  });
  const rounds = event.rounds.flatMap((round) => {
    const result = event.results.find((r) => r.roundId === round.id);
    const title = roundName(event, round, lang);
    if (!result)
      return round.skipped ? [{ id: round.id, title, skipped: true, at: '', teams: [], individual: [] }] : [];
    const frozen = Object.keys(result.completion);
    const order = [
      ...round.order.filter((id) => frozen.includes(id)),
      ...frozen.filter((id) => !round.order.includes(id)),
    ];
    return [
      {
        id: round.id,
        title,
        skipped: false,
        at: at(result.publishedAt),
        teams: order.map((teamId) => ({
          team: names.teams.get(teamId) ?? null,
          name: names.teamName(teamId),
          status: result.completion[teamId].status,
          completion: result.completion[teamId].points,
          score: result.teamRoundScores[teamId] ?? 0,
          awards: result.adjustments.filter((a) => a.recipientType === 'team' && a.recipientId === teamId).map(award),
        })),
        individual: result.adjustments.filter((a) => a.recipientType === 'member').map(award),
      },
    ];
  });
  const allPublished = event.results.flatMap((r) => r.adjustments);
  const corrections = event.corrections.map((c) => {
    const target = c.targetAdjustmentId ? allPublished.find((a) => a.id === c.targetAdjustmentId) : undefined;
    const round = c.roundId ? event.rounds.find((r) => r.id === c.roundId) : undefined;
    return {
      id: c.id,
      recipient: c.recipientName,
      unit: c.recipientType === 'team' ? /** @type {const} */ ('team') : /** @type {const} */ ('individual'),
      team: c.recipientType === 'member' ? names.teamName(c.teamId) : '',
      points: c.points,
      reason: c.reason,
      translation: c.translation,
      note: c.note,
      round: round ? roundName(event, round, lang) : '',
      original: target ? `${target.name} · ${signed(target.points, target.recipientType, lang)}` : '',
      author: authorName(event, c.authorId, lang),
      at: at(c.createdAt),
    };
  });

  const draft = ui.drafts?.[CORRECTION_FORM] ?? {};
  const check = checkCorrection(event, draft);
  const recipients = correctionRecipients(event, check.type, lang);
  const roundOptions = event.results
    .map((r) => event.rounds.find((x) => x.id === r.roundId))
    .filter(Boolean)
    .map((r) => ({ value: r.id, label: roundName(event, /** @type {Round} */ (r), lang) }));
  const targets = correctionTargets(event, check.type, check.recipient, check.round).map((a) => {
    const r = event.rounds.find((x) => x.id === a.roundId);
    const where = r ? `${label('label.roundN', lang, { n: event.rounds.indexOf(r) + 1 })} · ` : '';
    return { value: a.id, label: `${where}${a.name} · ${signed(a.points, a.recipientType, lang)}` };
  });
  const totals = standings(event);
  return {
    lang,
    title: t('tab.history', lang),
    revision: event.revision,
    rounds,
    corrections,
    form: {
      type: check.type,
      recipients,
      recipient: check.recipient,
      rounds: roundOptions,
      round: check.round ?? '',
      targets,
      target: check.target?.id ?? '',
      draft,
      blocked: check.blocked ? t(check.blocked, lang) : null,
      pointsError: check.pointsError,
      preview:
        check.before !== null && check.after !== null
          ? label('label.totalChange', lang, {
              before: formatNumber(check.before, lang),
              after: formatNumber(check.after, lang),
            })
          : '',
    },
    teams: totals.map((r) => ({ id: r.id, place: r.place, total: r.total, team: names.teams.get(r.id) ?? null })),
    members: memberRanking(event, lang),
  };
}

/** @typedef {ReturnType<typeof historyVm>} HistoryVm */

// ── History: markup ───────────────────────────────────────────────────────────────────────────

/**
 * History's markup.
 * @param {HistoryVm} vm
 * @returns {string}
 */
export function renderHistory(vm) {
  return `<div class="larp-history">
<div class="larp-history-main">${renderRounds(vm)}${renderCorrections(vm)}</div>
<div class="larp-history-side">${renderForm(vm)}${renderTotals(vm)}</div>
</div>`;
}

/** @param {HistoryVm} vm */
function renderRounds(vm) {
  const { lang } = vm;
  const head = `<h2 class="larp-h2" id="history-rounds">${esc(t('label.publishedRounds', lang))}</h2>`;
  if (!vm.rounds.length) {
    return `<section class="larp-panel larp-history-rounds" aria-labelledby="history-rounds">${head}<p class="larp-hint">${esc(t('hint.historyEmpty', lang))}</p></section>`;
  }
  const last = vm.rounds.length - 1;
  const items = vm.rounds
    .map((r, i) => {
      if (r.skipped) {
        return `<div class="larp-history-round is-skipped"><h3 class="larp-history-round-title">${esc(r.title)} · ${esc(t('status.skipped', lang))}</h3></div>`;
      }
      const teams = r.teams
        .map((x) => {
          const chip = x.team ? teamChip(x.team) : `<span>${esc(x.name)}</span>`;
          const awards = x.awards.length
            ? `<ul class="larp-history-awards">${x.awards.map((a) => awardLine(a, lang)).join('')}</ul>`
            : '';
          return `<li class="larp-history-team"><div class="larp-history-team-head">${chip}<span class="larp-history-status">${esc(t(`status.${x.status}`, lang))} · ${esc(formatNumber(x.completion, lang))}</span><span class="larp-history-score">${esc(t('label.roundScore', lang))} <b>${esc(formatNumber(x.score, lang))}</b></span></div>${awards}</li>`;
        })
        .join('');
      const individual = r.individual.length
        ? `<h4 class="larp-label">${esc(t('label.individualAwards', lang))}</h4><ul class="larp-history-awards">${r.individual.map((a) => awardLine(a, lang, true)).join('')}</ul>`
        : '';
      const at = r.at ? ` <span class="larp-history-at">${esc(r.at)}</span>` : '';
      return `<details class="larp-history-round"${i === last ? ' open' : ''}><summary class="larp-history-round-title">${esc(r.title)}${at}</summary><ul class="larp-history-teams">${teams}</ul>${individual}</details>`;
    })
    .join('');
  return `<section class="larp-panel larp-history-rounds" aria-labelledby="history-rounds">${head}${items}</section>`;
}

/**
 * A published award's line (host only: its author and private note).
 * @param {HistoryVm['rounds'][number]['individual'][number]} a
 * @param {Lang} lang
 * @param {boolean} [individual]
 */
function awardLine(a, lang, individual = false) {
  const who = individual
    ? `<span class="larp-history-who">${esc(a.recipient)}${a.team ? ` · ${esc(a.team)}` : ''}</span> · `
    : '';
  const translation = a.translation ? ` <span class="larp-history-trans" lang="en">${esc(a.translation)}</span>` : '';
  const note = a.note
    ? ` <span class="larp-history-note"><span class="larp-label-inline">${esc(t('label.privateNote', lang))}</span> ${esc(a.note)}</span>`
    : '';
  return `<li>${points(a.points, { unit: a.unit, lang })} ${who}<span class="larp-history-name">${esc(a.name)}</span>${translation} <span class="larp-history-meta">${esc(label('label.fromName', lang, { name: a.author }))}</span>${note}</li>`;
}

/** @param {HistoryVm} vm */
function renderCorrections(vm) {
  const { lang } = vm;
  const head = `<h2 class="larp-h2" id="history-corrections">${esc(t('label.corrections', lang))}</h2>`;
  const body = vm.corrections.length
    ? `<ul class="larp-history-corrections">${vm.corrections
        .map((c) => {
          const who = `${esc(c.recipient)}${c.team ? ` · ${esc(c.team)}` : ''}`;
          const translation = c.translation ? ` <span class="larp-history-trans">${esc(c.translation)}</span>` : '';
          const meta = [
            c.round,
            c.original ? label('label.correctsEntry', lang, { name: c.original }) : '',
            label('label.fromName', lang, { name: c.author }),
            c.at,
          ]
            .filter(Boolean)
            .map((x) => esc(x))
            .join(' · ');
          const note = c.note
            ? `<p class="larp-history-note"><span class="larp-label-inline">${esc(t('label.privateNote', lang))}</span> ${esc(c.note)}</p>`
            : '';
          return `<li class="larp-history-correction">${points(c.points, { unit: c.unit, lang })} <span class="larp-history-who">${who}</span><p class="larp-history-reason">${esc(c.reason)}${translation}</p><p class="larp-history-meta">${meta}</p>${note}</li>`;
        })
        .join('')}</ul>`
    : `<p class="larp-hint">${esc(t('hint.noCorrections', lang))}</p>`;
  return `<section class="larp-panel larp-history-corrections-panel" aria-labelledby="history-corrections">${head}${body}</section>`;
}

/** @param {HistoryVm} vm */
function renderForm(vm) {
  const { lang } = vm;
  const f = vm.form;
  const d = f.draft;
  const id = (/** @type {string} */ k) => `history-corr-${k}`;
  const type = segmented({
    label: t('label.recipientType', lang),
    action: 'history.type',
    value: f.type,
    options: [
      { value: 'team', label: t('action.team', lang) },
      { value: 'member', label: t('action.individual', lang) },
    ],
  });
  const select = (
    /** @type {string} */ k,
    /** @type {Array<{ value: string, label: string }>} */ options,
    /** @type {string} */ value,
  ) => selectInput({ id: id(k), options, value, draft: `${CORRECTION_FORM}.${k}`, action: 'history.refresh' });
  const recipient = field({
    id: id('recipient'),
    label: t('label.recipient', lang),
    control: select('recipient', [{ value: '', label: t('label.chooseOne', lang) }, ...f.recipients], f.recipient),
  });
  const amount = field({
    id: id('points'),
    label: t('label.difference', lang),
    control: signedPointsInput({
      id: id('points'),
      draft: `${CORRECTION_FORM}.points`,
      value: d.points ?? '',
      label: t('label.difference', lang),
      error: f.pointsError,
    }),
    error: f.pointsError ? t('error.invalid_points', lang) : '',
    hint: f.preview,
  });
  const text = textField(CORRECTION_FORM, 'history-corr', d);
  const reason = text('reason', t('label.publicReason', lang), LIMITS.reason, t('hint.correctionReason', lang));
  const translation = text('translation', t('label.translation', lang), LIMITS.reasonTranslation);
  const note = text('note', t('label.privateNote', lang), LIMITS.note, t('hint.privateNote', lang));
  const round = field({
    id: id('round'),
    label: t('label.round', lang),
    control: select('round', [{ value: '', label: t('label.noRound', lang) }, ...f.rounds], f.round),
  });
  const target = field({
    id: id('target'),
    label: t('label.original', lang),
    control: select('target', [{ value: '', label: t('label.noOriginal', lang) }, ...f.targets], f.target),
    hint: t('hint.originalEntry', lang),
  });
  const submit = button(t('action.addCorrection', lang), 'history.correct', {
    disabled: !!f.blocked,
    hint: f.blocked ?? undefined,
    attrs: { 'data-revision': vm.revision },
  });
  const why = f.blocked ? `<p class="larp-hint" role="status">${esc(f.blocked)}</p>` : '';
  return `<section class="larp-panel larp-history-form" aria-labelledby="history-form-title"><h2 class="larp-h2" id="history-form-title">${esc(t('action.addCorrection', lang))}</h2><p class="larp-hint">${esc(t('hint.correction', lang))}</p>${type}${recipient}${amount}${reason}${translation}${round}${target}${note}<div class="larp-history-actions">${submit}</div>${why}</section>`;
}

/**
 * The team standings and the full individual ranking (History's side, and the finished event's
 * Run tab).
 * @param {Pick<HistoryVm, 'lang'|'teams'|'members'>} vm
 */
export function renderTotals(vm) {
  const { lang } = vm;
  const teamRows = vm.teams
    .map(
      (r) =>
        `<tr><td class="larp-history-place">${esc(String(r.place))}</td><td>${r.team ? teamChip(r.team) : ''}</td><td class="larp-history-num">${esc(formatNumber(r.total, lang))}</td></tr>`,
    )
    .join('');
  const memberRows = vm.members
    .map(
      (r) =>
        `<tr${r.removed ? ' class="is-removed"' : ''}><td class="larp-history-place">${esc(String(r.place))}</td><td>${esc(r.name)}${r.removed ? ` <span class="larp-note">${esc(t('label.removedMember', lang))}</span>` : ''}</td><td>${esc(r.team)}</td><td class="larp-history-num">${esc(formatNumber(r.total, lang))}</td></tr>`,
    )
    .join('');
  const th = (/** @type {string} */ key, /** @type {string} */ cls = '') =>
    `<th scope="col"${cls ? ` class="${cls}"` : ''}>${esc(t(key, lang))}</th>`;
  const members = vm.members.length
    ? `<table class="larp-history-table"><thead><tr>${th('label.place')}${th('label.name')}${th('label.team')}${th('label.total', 'larp-history-num')}</tr></thead><tbody>${memberRows}</tbody></table>`
    : `<p class="larp-hint">${esc(t('hint.noRoster', lang))}</p>`;
  return `<section class="larp-panel larp-history-totals" aria-labelledby="history-totals">
  <h2 class="larp-h2" id="history-totals">${esc(t('label.teamStandings', lang))}</h2>
  <table class="larp-history-table"><thead><tr>${th('label.place')}${th('label.team')}${th('label.total', 'larp-history-num')}</tr></thead><tbody>${teamRows}</tbody></table>
  <h2 class="larp-h2">${esc(t('label.individualRanking', lang))}</h2>
  <p class="larp-hint">${esc(t('hint.hostOnlyRanking', lang))}</p>
  <div class="larp-history-scroll">${members}</div>
</section>`;
}

// ── History: handlers ─────────────────────────────────────────────────────────────────────────

/**
 * History's handlers (host.js Screen.actions).
 * @param {App} app
 * @param {UiStore} ui
 * @param {HostEnv} env
 * @returns {Handlers}
 */
export function historyActions(app, ui, env) {
  /** @param {Record<string, string>} patch */
  const setForm = (patch) =>
    ui.set((s) => ({ drafts: { ...s.drafts, [CORRECTION_FORM]: { ...s.drafts[CORRECTION_FORM], ...patch } } }));
  /** The last click applied (a double-click's second click is ignored before the re-render). */
  let lastId = '';
  return {
    'history.type': ({ value }) => {
      if (value === 'team' || value === 'member') setForm({ type: value, recipient: '', target: '' });
    },
    // A select changed (its value is already kept as a draft): re-render the choices that depend on it.
    'history.refresh': () => ui.set({}),
    'history.correct': ({ el }) => {
      const event = app.getEvent();
      const rev = el?.dataset?.revision;
      const id = rev === undefined || !event ? undefined : `history-correct-${event.id}-${rev}`;
      if (!event || (id && id === lastId)) return;
      const draft = ui.draft(CORRECTION_FORM);
      const check = checkCorrection(event, draft);
      if (check.blocked) return ui.set({ flash: { kind: 'error', key: check.blocked } });
      lastId = id ?? '';
      const result = app.dispatch('addCorrection', check.payload, { ...actorOf(ui.get()), id });
      if (!env.report(result) || result.duplicate) return;
      const name = app.getEvent()?.corrections.at(-1)?.recipientName ?? '';
      ui.set((s) => ({
        drafts: { ...s.drafts, [CORRECTION_FORM]: { type: check.type } },
        flash: { kind: 'info', key: 'hint.correctionAdded', vars: { name } },
      }));
    },
  };
}

/** @type {Screen} */
export const reviewTab = {
  id: 'review',
  labelKey: 'tab.review',
  vm: reviewVm,
  render: renderReview,
  actions: reviewActions,
};

/** @type {Screen} */
export const historyTab = {
  id: 'history',
  labelKey: 'tab.history',
  vm: historyVm,
  render: renderHistory,
  actions: historyActions,
};
