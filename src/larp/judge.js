// Judge Mode (the design's Judge Mode): the same window, taken over by a co-GM during a
// changeover. It replaces the whole console while ui.judge.open: first a name picker (the last
// co-GM remembered in ui.judge.lastGmId and offered first), then only a big, plain award form
// (recipient defaulting to the team that just performed, name, translation, signed points with
// − / + toggles, a private note, "Add +50"), the recent award names to reuse, My Awards This Round
// (Edit, Remove, Undo: own drafts only) and Also This Round (others', read only, so a duplicate
// warning makes sense in context). Timers, phases, Setup and publishing are never shown.
// Starting Review locks it with the reason (A11): the entries stay listed, nothing can be changed,
// and the host can reopen judging from the console. Done returns to the console, asking for the
// Host PIN first when the host set one (Stage 1's config.hostPin, Setup → Host PIN; off = null).
// Owner: the judge screen. Styles: css/judge.css. Interface: host.js's Screen.
//
// Every command goes out as app.dispatch(type, payload, { mode: 'judge', actorId: <the co-GM> }),
// so roles.js decides; a refusal (judging_closed, not_own_award, not_draft, forbidden) comes back
// through env.report and shows as the shell's flash in plain words (strings.js error.*).
//
// Local state, all in the UI store (never in the event):
//   ui.judge             { open, gmId, lastGmId } (uiState.js); gmId null shows the picker
//   drafts.judge         name, translation, points, note, reason (raw typed text)
//   drafts.judgePin      pin (what is typed to leave; cleared on every try and on Done)
//   local.judge          { pickedFor, type, id, editing, stash, undo, pinAsk, pinWrong }: the
//                        recipient chosen for this turn (until the turn changes, the default
//                        follows the team that just performed), the award being edited, Undo
//                        after Remove, and the PIN prompt. Done clears drafts.judge, drafts.judgePin
//                        and local.judge so the next co-GM starts fresh.
//
// For the DOM layer: the name field carries data-autofocus (the first thing to type into after a
// name is picked); hostDom.js may focus `[data-autofocus]` after a render that changed stage.
/**
 * @typedef {import('./host.js').Screen} Screen
 * @typedef {import('./host.js').ScreenCtx} ScreenCtx
 * @typedef {import('./host.js').HostEnv} HostEnv
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Round} Round
 * @typedef {import('./types.js').GM} GM
 * @typedef {import('./types.js').Adjustment} Adjustment
 * @typedef {import('./types.js').RecipientType} RecipientType
 * @typedef {import('./types.js').CommandType} CommandType
 * @typedef {import('./types.js').Lang} Lang
 * @typedef {import('./uiState.js').UiState} UiState
 * @typedef {import('./uiState.js').UiStore} UiStore
 * @typedef {import('./app.js').App} App
 * @typedef {import('./dom.js').Handlers} Handlers
 */
import { esc } from '../html.js';
import { LIMITS } from './types.js';
import { cleanText, formatPoints, t } from './strings.js';
import { check as roleCheck } from './roles.js';
import { remaining } from './phases.js';
import {
  checkAward,
  checkEdit,
  currentRound,
  editPayload,
  fillDraft,
  recentAwards,
  recipientOptions,
  turnKey,
  undoPayload,
  undoVm,
} from './hostRun.js';
import {
  addLabel,
  attrs,
  button,
  field,
  hintP,
  label,
  points,
  segmented,
  selectInput,
  signedPointsInput,
} from './ui.js';

/** The draft form the award fields type into (drafts.judge). */
export const JUDGE_FORM = 'judge';
/** The draft form the Host PIN is typed into (drafts.judgePin). */
export const PIN_FORM = 'judgePin';

/**
 * Judge Mode's own view choices (ui.local.judge).
 * @typedef {{
 *   pickedFor?: string, type?: RecipientType, id?: string, editing?: string|null,
 *   stash?: Record<string, string>|null, undo?: { id: string, at: number }|null,
 *   pinAsk?: boolean, pinWrong?: boolean,
 * }} JudgeLocal
 */

/** @param {UiState} ui @returns {JudgeLocal} */
const judgeLocal = (ui) => /** @type {JudgeLocal} */ (ui.local?.judge ?? {});

// ── Pure helpers (exported for the tests) ───────────────────────────────────────────────────

/**
 * The co-GMs a person can pick, the last one to judge first.
 * @param {LarpEvent} event
 * @param {string|null} lastGmId
 * @returns {GM[]}
 */
export function pickList(event, lastGmId) {
  const list = event.gms.filter((g) => !g.host);
  const last = list.find((g) => g.id === lastGmId);
  return last ? [last, ...list.filter((g) => g !== last)] : list;
}

/**
 * The GM judging now: ui.judge.gmId when Judge Mode is open and that GM is still in the event
 * (a removed GM sends the window back to the picker); null otherwise.
 * @param {LarpEvent} event
 * @param {UiState} ui
 * @returns {GM|null}
 */
export function judgeGm(event, ui) {
  const id = ui.judge?.open ? ui.judge.gmId : null;
  return (id && event.gms.find((g) => g.id === id)) || null;
}

/**
 * The actor every Judge Mode command is sent as.
 * @param {string} gmId
 */
export const judgeActor = (gmId) => ({ mode: /** @type {const} */ ('judge'), actorId: gmId });

/**
 * The team that just performed, which Judge Mode's recipient defaults to. During Performances it
 * is the team whose turn it is, except in the changeover right after Next Team (the new turn's
 * timer has run less than the round's transition time): then it is the team before. During Review
 * it is the last team. Null in other phases or before the first turn.
 * @param {LarpEvent} event
 * @param {number} now
 * @returns {string|null}
 */
export function justPerformedTeamId(event, now) {
  const round = currentRound(event);
  if (!round || !round.order.length) return null;
  if (event.roundPhase === 'review') return round.order[round.order.length - 1];
  if (event.roundPhase !== 'performances' || event.currentTurn < 0) return null;
  let i = Math.min(event.currentTurn, round.order.length - 1);
  const tm = event.timer;
  if (i > 0 && tm.kind === 'turn' && tm.status !== 'idle' && tm.durationMs - remaining(tm, now) < round.transitionMs) {
    i -= 1;
  }
  return round.order[i] ?? null;
}

/**
 * Judge Mode's recipient as it stands: the one picked for this turn (when it can still receive),
 * else the team that just performed. One recipient at a time keeps the form plain.
 * @param {LarpEvent} event
 * @param {UiState} ui
 * @param {number} now
 * @returns {{ type: RecipientType, ids: string[], isDefault: boolean }}
 */
export function judgeRecipient(event, ui, now) {
  const local = judgeLocal(ui);
  if (local.pickedFor === turnKey(event)) {
    const type = local.type === 'member' ? 'member' : 'team';
    const valid = recipientOptions(event, type).some((o) => o.id === local.id);
    return { type, ids: valid && local.id ? [local.id] : [], isDefault: false };
  }
  const team = justPerformedTeamId(event, now);
  return { type: 'team', ids: team ? [team] : [], isDefault: true };
}

/**
 * Why Judge Mode is locked for this GM now (a strings.js key), or null while judging is open:
 * Review has started (hint.judgeLocked, A11), the round is revealed or over (hint.judgeRoundOver),
 * no round's preparation has started yet (hint.awardsClosed), or roles.js refuses outright.
 * @param {LarpEvent} event
 * @param {string} gmId
 * @returns {string|null}
 */
export function lockReason(event, gmId) {
  const error = roleCheck({ gmId, mode: 'judge' }, 'addAward', event);
  if (!error) return null;
  if (error.code !== 'judging_closed') return `error.${error.code}`;
  if (event.roundPhase === 'review') return 'hint.judgeLocked';
  if (event.roundPhase === 'reveal' || event.roundPhase === 'results') return 'hint.judgeRoundOver';
  return 'hint.awardsClosed';
}

/**
 * Whether the typed PIN is the host's (both trimmed; no PIN set always matches).
 * @param {string|null|undefined} hostPin
 * @param {string|null|undefined} typed
 */
export function pinMatches(hostPin, typed) {
  if (!hostPin || !hostPin.trim()) return true;
  return String(typed ?? '').trim() === hostPin.trim();
}

/**
 * A round's heading: 'Round 4 · Bible Skit'.
 * @param {LarpEvent} event
 * @param {Lang} lang
 */
export function judgeRoundTitle(event, lang) {
  const round = currentRound(event);
  if (!round) return '';
  return `${label('label.roundN', lang, { n: event.roundIndex + 1 })} · ${t(`round.${round.category}`, lang)}`;
}

/**
 * This round's awards for Judge Mode: the GM's own (Edit and Remove while roles.js allows) and
 * everyone else's (read only, with who gave them). Newest first; removed ones left out.
 * @param {LarpEvent} event
 * @param {Round} round
 * @param {string} gmId
 * @param {Lang} lang
 */
export function judgeRows(event, round, gmId, lang) {
  const actor = { gmId, mode: /** @type {const} */ ('judge') };
  const teamById = new Map(event.teams.map((tm) => [tm.id, tm]));
  const memberById = new Map(event.roster.map((m) => [m.id, m]));
  const author = (/** @type {string} */ id) => {
    const gm = event.gms.find((g) => g.id === id);
    return gm?.host ? t('role.host', lang) : (gm?.name ?? '');
  };
  const rows = event.adjustments
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.roundId === round.id && a.status !== 'discarded')
    .sort((x, y) => y.a.createdAt - x.a.createdAt || y.i - x.i)
    .map(({ a }) => {
      const member = a.recipientType === 'member' ? memberById.get(a.recipientId) : undefined;
      const team = teamById.get(member ? member.teamId : a.recipientId);
      return {
        id: a.id,
        mine: a.authorId === gmId,
        points: a.points,
        unit: /** @type {'team'|'individual'} */ (a.recipientType === 'team' ? 'team' : 'individual'),
        to: member ? `${member.name} · ${team?.name ?? ''}` : (team?.name ?? ''),
        words: [a.name, a.translation].filter(Boolean).join(' · '),
        author: author(a.authorId),
        note: a.note,
        published: a.status === 'published',
        editable: roleCheck(actor, 'editAward', event, a) === null,
      };
    });
  return { mine: rows.filter((r) => r.mine), others: rows.filter((r) => !r.mine) };
}

/** @typedef {ReturnType<typeof judgeRows>['mine'][number]} JudgeRow */

// ── The view model ──────────────────────────────────────────────────────────────────────────

/**
 * Judge Mode's view model (pure).
 * @param {ScreenCtx} ctx
 */
export function judgeVm(ctx) {
  const { event, ui, now, lang } = ctx;
  const local = judgeLocal(ui);
  const gm = judgeGm(event, ui);
  const base = {
    lang,
    title: t('action.judgeMode', lang),
    done: t('action.done', lang),
    pin: local.pinAsk && event.config.hostPin ? pinVm(ui, local, lang) : null,
  };
  if (!gm) {
    const gms = pickList(event, ui.judge?.lastGmId ?? null);
    const last = gms.find((g) => g.id === ui.judge?.lastGmId) ?? null;
    // Locked now (Review started, the round is over…): said before a name is picked, not after.
    const reason = gms.length ? lockReason(event, gms[0].id) : null;
    return {
      ...base,
      stage: /** @type {const} */ ('pick'),
      pick: {
        locked: reason ? { title: t('label.judgeLocked', lang), text: t(reason, lang) } : null,
        heading: t('label.whoIsJudging', lang),
        hint: t(gms.length ? 'hint.pickGm' : 'hint.noCoGms', lang),
        last: last ? { id: last.id, label: label('action.continueAs', lang, { name: last.name }) } : null,
        gms: gms.filter((g) => g !== last).map((g) => ({ id: g.id, name: g.name })),
      },
    };
  }
  const round = currentRound(event);
  const reason = lockReason(event, gm.id);
  const rows = round ? judgeRows(event, round, gm.id, lang) : { mine: [], others: [] };
  return {
    ...base,
    stage: /** @type {const} */ ('judge'),
    revision: event.revision,
    header: {
      title: label('label.judgeModeFor', lang, { name: gm.name }),
      round: judgeRoundTitle(event, lang),
      change: t('action.changeGm', lang),
    },
    locked: reason ? { title: t('label.judgeLocked', lang), text: t(reason, lang) } : null,
    form: reason ? null : formVm(event, ui, { now, lang, local }),
    recent: reason
      ? []
      : recentAwards(event).map((a) => ({
          id: a.id,
          text: `${a.name} ${formatPoints(a.points, { unit: a.recipientType === 'team' ? 'team' : 'individual', lang })}`,
        })),
    mine: {
      title: t('label.myAwards', lang),
      empty: t('hint.noMyAwards', lang),
      rows: rows.mine.map((r) => ({ ...r, editable: !reason && r.editable })),
    },
    others: { title: t('label.othersAwards', lang), empty: t('hint.noOthersAwards', lang), rows: rows.others },
    undo: reason ? null : undoVm(event, local, now, lang),
  };
}

/** @typedef {ReturnType<typeof judgeVm>} JudgeVm */
/** @typedef {ReturnType<typeof formVm>} JudgeForm */

/**
 * The Host PIN prompt shown by Done.
 * @param {UiState} ui
 * @param {JudgeLocal} local
 * @param {Lang} lang
 */
function pinVm(ui, local, lang) {
  return {
    label: t('label.hostPin', lang),
    hint: t('hint.pinToLeave', lang),
    error: local.pinWrong ? t('hint.wrongPin', lang) : '',
    value: ui.drafts?.[PIN_FORM]?.pin ?? '',
    unlock: t('action.returnToConsole', lang),
    cancel: t('action.cancel', lang),
  };
}

/**
 * The award form (add, or edit one of the GM's own drafts).
 * @param {LarpEvent} event
 * @param {UiState} ui
 * @param {{ now: number, lang: Lang, local: JudgeLocal }} o
 */
function formVm(event, ui, { now, lang, local }) {
  const draft = ui.drafts?.[JUDGE_FORM] ?? {};
  const editing =
    (local.editing && event.adjustments.find((a) => a.id === local.editing && a.status === 'draft')) || null;
  const { type, ids } = editing
    ? { type: editing.recipientType, ids: [editing.recipientId] }
    : judgeRecipient(event, ui, now);
  const check = checkAward(event, { type, ids, draft, editing });
  const options = recipientOptions(event, type).map((o) => ({
    value: o.id,
    label: o.member
      ? [o.member, o.team?.name].filter(Boolean).join(' · ')
      : [o.team?.name, o.team?.translation].filter(Boolean).join(' · '),
  }));
  const toText = editing ? (options.find((o) => o.value === editing.recipientId)?.label ?? '') : '';
  return {
    heading: t(editing ? 'label.editAward' : 'label.addAward', lang),
    editing: editing ? { id: editing.id, to: toText } : null,
    type,
    typeOptions: [
      { value: 'team', label: t('action.team', lang) },
      { value: 'member', label: t('action.individual', lang) },
    ],
    recipientId: ids[0] ?? '',
    recipientOptions: [{ value: '', label: t('label.chooseRecipient', lang) }, ...options],
    draft,
    pointsError: check.pointsError ? t('error.invalid_points', lang) : '',
    large: check.large ? t('hint.large', lang) : '',
    duplicate: check.duplicates.length ? t('hint.duplicate', lang) : '',
    submit: editing ? t('action.save', lang) : addLabel({ points: draft.points ?? '', lang }),
    submitAction: editing ? 'judge.saveEdit' : 'judge.add',
    // As on the Run tab: only what re-renders while typing (recipient, points) disables the button.
    disabled: ['error.no_recipients', 'error.invalid_points'].includes(check.blocked ?? ''),
    blockedHint: check.blocked ? t(check.blocked, lang) : '',
  };
}

// ── The markup ──────────────────────────────────────────────────────────────────────────────

/**
 * Judge Mode's markup (pure).
 * @param {JudgeVm} vm
 * @returns {string}
 */
export function renderJudge(vm) {
  const done = button(vm.done, 'judge.done', { variant: 'primary', cls: 'larp-judge-done', focus: 'judge-done' });
  if (vm.pin) return `<div class="larp-judge">${renderPin(vm.pin, vm.title)}</div>`;
  if (vm.stage === 'pick') return `<div class="larp-judge">${renderPick(vm, done)}</div>`;
  const { header, lang } = vm;
  const head = `<header class="larp-panel larp-judge-head"><div class="larp-judge-who"><h1 class="larp-judge-title">${esc(header.title)}</h1>${header.round ? `<p class="larp-judge-round">${esc(header.round)}</p>` : ''}</div><div class="larp-judge-head-actions">${button(header.change, 'judge.switch', { variant: 'quiet' })}${done}</div></header>`;
  const locked = vm.locked
    ? `<section class="larp-panel larp-judge-locked" role="status" aria-labelledby="judge-locked-title"><h2 class="larp-h2" id="judge-locked-title">${esc(vm.locked.title)}</h2><p>${esc(vm.locked.text)}</p></section>`
    : '';
  const form = vm.form ? renderForm(vm.form, vm.revision, lang) : '';
  const recent = vm.recent.length
    ? `<div class="larp-judge-recent"><h2 class="larp-label">${esc(t('label.recent', lang))}</h2><div class="larp-judge-chips">${vm.recent.map((x) => button(x.text, 'judge.useRecent', { value: x.id, variant: 'quiet', cls: 'larp-judge-chip' })).join('')}</div></div>`
    : '';
  const undo = vm.undo
    ? `<p class="larp-judge-undo" role="status"><span>${esc(vm.undo.text)}</span>${button(vm.undo.action, 'judge.undo', { focus: 'judge-undo' })}</p>`
    : '';
  const lists = `<section class="larp-panel larp-judge-lists">${recent}${undo}${renderRows(vm.mine, 'judge-mine', lang)}${renderRows(vm.others, 'judge-others', lang)}</section>`;
  return `<div class="larp-judge">${head}${locked}${form}${lists}</div>`;
}

/**
 * @param {Extract<JudgeVm, { stage: 'pick' }>} vm
 * @param {string} done
 */
function renderPick(vm, done) {
  const p = vm.pick;
  const last = p.last
    ? button(p.last.label, 'judge.pick', {
        value: p.last.id,
        variant: 'primary',
        cls: 'larp-judge-gm larp-judge-last',
        focus: 'judge-last',
      })
    : '';
  const gms = p.gms.map((g) => `<li>${button(g.name, 'judge.pick', { value: g.id, cls: 'larp-judge-gm' })}</li>`);
  const list = gms.length ? `<ul class="larp-judge-gms">${gms.join('')}</ul>` : '';
  const locked = p.locked
    ? `<div class="larp-judge-locked" role="status"><h2 class="larp-h2">${esc(p.locked.title)}</h2><p>${esc(p.locked.text)}</p></div>`
    : '';
  return `<section class="larp-panel larp-judge-pick" aria-labelledby="judge-pick-title"><p class="larp-judge-kicker">${esc(vm.title)}</p><h1 class="larp-judge-title" id="judge-pick-title">${esc(p.heading)}</h1>${locked}${hintP(p.hint)}${last}${list}<div class="larp-judge-pick-actions">${done}</div></section>`;
}

/**
 * @param {NonNullable<JudgeVm['pin']>} pin
 * @param {string} title
 */
function renderPin(pin, title) {
  const input = `<input${attrs({
    type: 'password',
    id: 'judge-pin',
    class: 'larp-input larp-judge-pin',
    value: pin.value,
    autocomplete: 'off',
    inputmode: 'numeric',
    'data-draft': `${PIN_FORM}.pin`,
    'data-focus': 'judge-pin',
    'data-autofocus': true,
    'aria-invalid': pin.error ? 'true' : undefined,
    'aria-describedby': pin.error ? 'judge-pin-hint judge-pin-error' : 'judge-pin-hint',
  })}>`;
  return `<section class="larp-panel larp-judge-pinbox" aria-labelledby="judge-pin-title" data-submit="judge.unlock"><p class="larp-judge-kicker">${esc(title)}</p><h1 class="larp-judge-title" id="judge-pin-title">${esc(pin.label)}</h1>${field({ id: 'judge-pin', label: pin.label, control: input, hint: pin.hint, error: pin.error })}<div class="larp-judge-actions">${button(pin.unlock, 'judge.unlock', { variant: 'primary' })}${button(pin.cancel, 'judge.pinCancel', { variant: 'quiet' })}</div></section>`;
}

/**
 * A labelled text field typing into drafts.judge.<name>.
 * @param {string} name
 * @param {string} text
 * @param {string} value
 * @param {number} maxLength
 * @param {{ hint?: string, attrs?: Record<string, string|boolean> }} [o]
 */
function judgeField(name, text, value, maxLength, o = {}) {
  const id = `judge-${name}`;
  const hintId = o.hint ? `${id}-hint` : undefined;
  const control = `<input${attrs({
    type: 'text',
    id,
    class: 'larp-input',
    value,
    maxlength: maxLength,
    autocomplete: 'off',
    spellcheck: 'false',
    'data-draft': `${JUDGE_FORM}.${name}`,
    'aria-describedby': hintId,
    ...o.attrs,
  })}>`;
  return field({ id, label: text, control, hint: o.hint });
}

/**
 * @param {JudgeForm} f
 * @param {number} revision
 * @param {Lang} lang
 */
function renderForm(f, revision, lang) {
  const d = f.draft;
  const to = t('label.to', lang);
  const recipient = f.editing
    ? `<p class="larp-judge-to"><span class="larp-label">${esc(to)}</span> ${esc(f.editing.to)}</p>`
    : `${segmented({ label: t('label.recipientType', lang), action: 'judge.recipientType', value: f.type, options: f.typeOptions, cls: 'larp-judge-type' })}${field({ id: 'judge-to', label: to, control: selectInput({ id: 'judge-to', options: f.recipientOptions, value: f.recipientId, action: 'judge.recipient' }) })}`;
  const pointsLabel = t('label.points', lang);
  const amount = field({
    id: 'judge-points',
    label: pointsLabel,
    control: signedPointsInput({
      id: 'judge-points',
      draft: `${JUDGE_FORM}.points`,
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
  const name = judgeField('name', t('label.name', lang), d.name ?? '', LIMITS.awardName, {
    attrs: { 'data-focus': 'judge-name', 'data-change': 'judge.touch', 'data-autofocus': true },
  });
  const translation = judgeField(
    'translation',
    t('label.translation', lang),
    d.translation ?? '',
    LIMITS.awardTranslation,
  );
  const note = judgeField('note', t('label.noteForHts', lang), d.note ?? '', LIMITS.note, {
    hint: t('hint.privateNote', lang),
  });
  const duplicate = f.duplicate
    ? `<div class="larp-judge-duplicate" role="status"><p>${esc(f.duplicate)}</p>${judgeField('reason', t('label.duplicateReason', lang), d.reason ?? '', LIMITS.duplicateReason)}</div>`
    : '';
  const submit = button(f.submit, f.submitAction, {
    variant: 'primary',
    cls: 'larp-judge-submit',
    disabled: f.disabled,
    hint: f.disabled ? f.blockedHint : undefined,
    attrs: { 'data-revision': revision },
  });
  const cancel = f.editing ? button(t('action.cancel', lang), 'judge.cancelEdit', { variant: 'quiet' }) : '';
  // Enter in a field runs the submit button's action (dom.js bind: data-submit), as a click would.
  return `<section class="larp-panel larp-judge-form${f.editing ? ' is-editing' : ''}" aria-labelledby="judge-form-title" data-submit="${esc(f.submitAction)}">
<h2 class="larp-h2" id="judge-form-title">${esc(f.heading)}</h2>
${recipient}${name}${translation}${amount}${note}${duplicate}
<div class="larp-judge-actions">${submit}${cancel}</div>
</section>`;
}

/**
 * @param {{ title: string, empty: string, rows: JudgeRow[] }} list
 * @param {string} id
 * @param {Lang} lang
 */
function renderRows(list, id, lang) {
  const rows = list.rows.map((r) => {
    const tags = [
      r.note
        ? `<span class="larp-note"${attrs({ 'data-tip': r.note })}>${esc(t('label.privateNote', lang))}</span>`
        : '',
      r.published ? `<span class="larp-note">${esc(t('status.published', lang))}</span>` : '',
    ].join('');
    const author = r.mine ? '' : ` · <span class="larp-judge-author">${esc(r.author)}</span>`;
    const actions = r.editable
      ? `<span class="larp-judge-row-actions">${button(t('action.edit', lang), 'judge.edit', { value: r.id, variant: 'quiet' })}${button(t('action.remove', lang), 'judge.remove', { value: r.id, variant: 'quiet' })}</span>`
      : '';
    return `<li class="larp-judge-row">${points(r.points, { unit: r.unit, lang })}<span class="larp-judge-row-text"><span class="larp-judge-row-to">${esc(r.to)}</span> · <span>${esc(r.words)}</span>${author}${tags}</span>${actions}</li>`;
  });
  const body = rows.length ? `<ul class="larp-judge-rows">${rows.join('')}</ul>` : hintP(list.empty);
  return `<div class="larp-judge-list" aria-labelledby="${id}-title"><h2 class="larp-h2" id="${id}-title">${esc(list.title)}</h2>${body}</div>`;
}

// ── The handlers ────────────────────────────────────────────────────────────────────────────

/**
 * Judge Mode's handlers (host.js Screen.actions). Every command is sent as the co-GM in Judge
 * Mode; roles.js refusals come back through env.report as the flash.
 * @param {App} app
 * @param {UiStore} ui
 * @param {HostEnv} env
 * @returns {Handlers}
 */
export function judgeActions(app, ui, env) {
  const draft = () => ui.draft(JUDGE_FORM);
  const local = () => judgeLocal(ui.get());
  /** @param {Partial<JudgeLocal>} patch @param {Record<string, string>} [fields] the award drafts to set */
  const setJudge = (patch, fields) =>
    ui.set((s) => ({
      local: { ...s.local, judge: { ...s.local.judge, ...patch } },
      ...(fields ? { drafts: { ...s.drafts, [JUDGE_FORM]: fields } } : {}),
    }));
  /** @param {string} key */
  const refuse = (key) => ui.set({ flash: { kind: 'error', key } });
  /** The GM judging, with the event; null in the picker. */
  const current = () => {
    const event = app.getEvent();
    const gm = event ? judgeGm(event, ui.get()) : null;
    return event && gm ? { event, gm } : null;
  };
  /** @param {CommandType} type @param {any} payload @param {string} gmId @param {string} [id] */
  const send = (type, payload, gmId, id) => env.report(app.dispatch(type, payload, { ...judgeActor(gmId), id }));
  /** @param {string|undefined} id */
  const adjustment = (id) => app.getEvent()?.adjustments.find((a) => a.id === id);
  const leaveEdit = () => setJudge({ editing: null, stash: null }, { ...(local().stash ?? {}) });
  const close = () =>
    ui.set((s) => {
      const drafts = { ...s.drafts };
      delete drafts[JUDGE_FORM];
      delete drafts[PIN_FORM];
      return {
        judge: { open: false, gmId: null, lastGmId: s.judge.gmId ?? s.judge.lastGmId },
        drafts,
        local: { ...s.local, judge: {} },
      };
    });
  /** Back to the console, focus on the Judge Mode button that opened it. */
  const leave = () => {
    close();
    env.focus('[data-action="judge.open"]');
  };
  /** @param {Record<string, string>} pin */
  const setPin = (pin) => ui.set((s) => ({ drafts: { ...s.drafts, [PIN_FORM]: pin } }));

  return {
    'judge.pick': ({ value }) => {
      const event = app.getEvent();
      if (!event || !value || !event.gms.some((g) => g.id === value && !g.host)) return;
      ui.set((s) => ({
        judge: { open: true, gmId: value, lastGmId: value },
        local: { ...s.local, judge: { ...s.local.judge, editing: null, stash: null, undo: null } },
      }));
      env.focus('[data-focus="judge-name"]');
    },
    'judge.switch': () => ui.set((s) => ({ judge: { ...s.judge, open: true, gmId: null } })),
    'judge.recipientType': ({ value }) => {
      const event = app.getEvent();
      if (!event || (value !== 'team' && value !== 'member')) return;
      const id = value === 'team' ? (justPerformedTeamId(event, env.now()) ?? '') : '';
      setJudge({ pickedFor: turnKey(event), type: value, id });
    },
    'judge.recipient': ({ value }) => {
      const event = app.getEvent();
      if (!event) return;
      const type = judgeRecipient(event, ui.get(), env.now()).type;
      setJudge({ pickedFor: turnKey(event), type, id: value ?? '' });
    },
    // The name field left: re-render so a duplicate warning shows before Add is pressed.
    'judge.touch': () => ui.set({}),
    'judge.add': ({ el }) => {
      const c = current();
      if (!c) return;
      const { type, ids } = judgeRecipient(c.event, ui.get(), env.now());
      const d = draft();
      const checked = checkAward(c.event, { type, ids, draft: d });
      if (checked.blocked) return refuse(checked.blocked);
      const { name, points: value, duplicates, reason } = checked;
      const payload = {
        recipientType: type,
        recipientIds: [...ids],
        name,
        translation: cleanText(d.translation ?? ''),
        points: value,
        note: (d.note ?? '').trim(),
        authorId: c.gm.id,
        ...(duplicates.length ? { duplicateReason: reason } : {}),
      };
      const rev = el?.dataset?.revision;
      const id = rev === undefined ? undefined : `judge-add-${c.event.id}-${rev}`;
      if (send('addAward', payload, c.gm.id, id)) {
        setJudge({}, {});
        env.focus('[data-focus="judge-name"]');
      }
    },
    'judge.useRecent': ({ value }) => {
      const adj = adjustment(value);
      if (!adj) return;
      setJudge({}, fillDraft(draft(), { name: adj.name, translation: adj.translation, points: adj.points }));
      env.focus('[data-focus="judge-name"]');
    },
    'judge.edit': ({ value }) => {
      const adj = adjustment(value);
      const c = current();
      if (!adj || !c) return;
      if (adj.authorId !== c.gm.id) return refuse('error.not_own_award');
      if (adj.status !== 'draft') return refuse('error.not_draft');
      const before = local().editing ? (local().stash ?? {}) : { ...draft() };
      setJudge({ editing: adj.id, stash: before }, fillDraft({}, adj));
      env.focus('[data-focus="judge-name"]');
    },
    'judge.saveEdit': () => {
      const c = current();
      const adj = adjustment(local().editing ?? undefined);
      if (!c || !adj) return leaveEdit();
      const { blocked } = checkEdit(c.event, adj, draft());
      if (blocked) return refuse(blocked);
      if (send('editAward', editPayload(c.event, adj, draft()), c.gm.id)) leaveEdit();
    },
    'judge.cancelEdit': () => leaveEdit(),
    'judge.remove': ({ value }) => {
      const c = current();
      const adj = adjustment(value);
      if (!c || !adj) return;
      if (send('removeAward', { adjustmentId: adj.id }, c.gm.id)) {
        if (local().editing === adj.id) leaveEdit();
        setJudge({ undo: { id: adj.id, at: env.now() } });
        env.focus('[data-focus="judge-undo"]');
      }
    },
    'judge.undo': () => {
      const c = current();
      const adj = adjustment(local().undo?.id);
      if (!c || !adj || adj.status !== 'discarded') return;
      if (send('addAward', undoPayload(adj), c.gm.id, `judge-undo-${adj.id}`)) setJudge({ undo: null });
    },
    'judge.done': () => {
      const hostPin = app.getEvent()?.config.hostPin;
      if (hostPin && hostPin.trim()) {
        setPin({});
        setJudge({ pinAsk: true, pinWrong: false });
        env.focus('[data-focus="judge-pin"]');
        return;
      }
      leave();
    },
    'judge.unlock': () => {
      const hostPin = app.getEvent()?.config.hostPin;
      if (pinMatches(hostPin, ui.draft(PIN_FORM).pin)) return leave();
      setPin({});
      setJudge({ pinWrong: true });
      env.focus('[data-focus="judge-pin"]');
    },
    'judge.pinCancel': () => {
      setPin({});
      setJudge({ pinAsk: false, pinWrong: false });
    },
  };
}

/** @type {Screen} */
export const judgeScreen = {
  id: 'judge',
  labelKey: 'action.judgeMode',
  vm: judgeVm,
  render: renderJudge,
  actions: judgeActions,
};
