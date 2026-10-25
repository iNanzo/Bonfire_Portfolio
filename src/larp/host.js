// The host console's frame (/larp/#/host): the top bar (round and phase, the event clock against
// its target, the Saved indicator, the display window's state, the one next action as the biggest
// button), the tabs, the Preview Display slot, Judge Mode, the confirmation dialog and the lock a
// second host window sees. Each tab's body comes from its own module. Pure: view models and
// markup; the DOM wiring is hostDom.js.
//
// ── The screen interface (every tab module, and Judge Mode, follows it) ─────────────────────
//
// A screen is a plain object (see the Screen typedef below):
//
//   { id, labelKey, vm(ctx) → vm, render(vm) → string, actions(app, ui, env) → handlers }
//
//   vm(ctx)        PURE. ScreenCtx: { event, ui, now, lang, saveStatus, link, projection }. It
//                  works out everything the markup shows (labels in `lang`, formatted values,
//                  what is disabled and why) from the event and the UI state. Unit-tested.
//   render(vm)     PURE. An HTML string from the view model, built with ui.js helpers; every
//                  text through esc(). No DOM, no globals, no Date.now(). Unit-tested.
//   actions(app, ui, env)   the handler map for the data-action / data-change names its markup
//                  uses, namespaced by screen ('run.addAward', 'setup.addTeam', 'judge.done').
//                  A handler gets ActionArgs { el, event, value, confirmed } (dom.js) and:
//                    - changes the game only through app.dispatch(type, payload, actorOf(ui.get()))
//                      and hands the result to env.report(result) (an error becomes the flash);
//                    - changes local state through ui.set / ui.setDraft / ui.clearDraft / ui.setLocal;
//                    - asks first, for what is hard to undo, with env.confirm({ action, value,
//                      hintKey, labelKey }): the shell's dialog runs the same handler again with
//                      `confirmed: true`.
//                  Keep handlers thin: compute payloads with pure helpers the module exports.
//
// Where each screen lives (and its CSS, which only that screen's owner edits):
//
//   hostRun.js     runTab                    css/host-run.css
//   hostSetup.js   setupTab, rosterTab       css/host-setup.css   (Setup; Teams & Roster)
//   hostReview.js  reviewTab, historyTab     css/host-review.css  (Review; History)
//   hostFinished.js finishedTab              css/host-review.css  (Run, once the event ends)
//   judge.js       judgeScreen               css/judge.css        (replaces the console while
//                                                                  ui.judge.open)
//   display.js     displayVm, renderDisplay  css/display.css      (the projector window, and
//                  displayDom.js mountDisplay                      the Preview Display frame)
//   stage.js       cuesFor, applyCue                               (scene cues, display only)
//   host.js        this frame; hostDom.js mounts it                css/base.css (shared)
//
// The UI state (uiState.js UiState) is the window's own: current tab, Judge Mode and its GM, the
// Add Award recipients, form drafts, a pending confirmation, the flash. It is never part of the
// saved event and never a command; drafts and choices persist in sessionStorage ('larp.ui.state').
//
// The shell owns these handler names: 'tab', 'next', 'sign', 'confirm.yes', 'confirm.no',
// 'openDisplay', 'preview', 'judge.open', 'exportBackup', 'takeOver', 'flash.dismiss',
// 'unreadable.download', 'timer.toggle', 'timer.add30', 'focus.award', 'keys' (hostDom.js), and
// the frame-level tick: the clocks ([data-clock]), the link's heartbeat and the reveal's
// auto-advance (revealDue). The tabs follow the tablist keys (tabKey): ←/→, Home and End.
/**
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Lang} Lang
 * @typedef {import('./types.js').CommandType} CommandType
 * @typedef {import('./types.js').Projection} Projection
 * @typedef {import('./types.js').Actor} Actor
 * @typedef {import('./app.js').App} App
 * @typedef {import('./app.js').SaveStatus} SaveStatus
 * @typedef {import('./app.js').DispatchResult} DispatchResult
 * @typedef {import('./uiState.js').UiState} UiState
 * @typedef {import('./uiState.js').UiStore} UiStore
 * @typedef {import('./uiState.js').TabId} TabId
 * @typedef {import('./uiState.js').PendingConfirm} PendingConfirm
 * @typedef {import('./channel.js').HostLinkStatus} HostLinkStatus
 * @typedef {import('./channel.js').LinkMessage} LinkMessage
 * @typedef {import('./dom.js').Handlers} Handlers
 */
import { esc } from '../html.js';
import { ROUND_CATEGORIES } from './types.js';
import { formatClock, t } from './strings.js';
import { canAdvance, canSkip, expired, nextRoundIndex, revealSteps } from './phases.js';
import { revealDwell } from './displayView.js';
import { TAB_IDS, actorOf } from './uiState.js';
import { estimate } from './config.js';
import { button, elapsed, label, withSign } from './ui.js';
import { runTab } from './hostRun.js';
import { rosterTab, setupTab } from './hostSetup.js';
import { historyTab, reviewTab } from './hostReview.js';
import { finishedTab } from './hostFinished.js';
import { displayVm, renderDisplay } from './display.js';
import { judgeScreen } from './judge.js';

/**
 * What every screen's vm() is given. `online` is the browser's word on the network (reopening a
 * closed display needs it); true when unknown.
 * @typedef {{
 *   event: LarpEvent, ui: UiState, now: number, lang: Lang, saveStatus: SaveStatus,
 *   link: HostLinkStatus, projection: Projection|null, online?: boolean,
 * }} ScreenCtx
 */

/**
 * What the shell hands every screen's actions(): the clock, reporting a dispatch, asking for
 * confirmation, files and the display window.
 * @typedef {{
 *   now: () => number,
 *   report: (result: DispatchResult) => boolean,
 *   confirm: (pending: PendingConfirm) => void,
 *   download: (name: string, text: string, type?: string) => void,
 *   openDisplay: () => void,
 *   focus: (selector: string) => void,
 *   post: (msg: LinkMessage) => void,
 * }} HostEnv
 */

/**
 * A screen module's export (a tab, or Judge Mode).
 * @typedef {{
 *   id: string, labelKey: string,
 *   vm: (ctx: ScreenCtx) => any,
 *   render: (vm: any) => string,
 *   actions: (app: App, ui: UiStore, env: HostEnv) => Handlers,
 * }} Screen
 */

/** The tabs, in order (uiState.TAB_IDS), each with its screen. @type {ReadonlyArray<Screen>} */
export const TABS = Object.freeze([runTab, rosterTab, reviewTab, historyTab, setupTab]);

/** Who the commands are from (uiState.js, shared by every screen). */
export { actorOf };

// ── The one next action (U04) ───────────────────────────────────────────────────────────────

/**
 * The single next step the top bar shows as its biggest button, labelled with what it does.
 * `command` is what the button dispatches (null for a UI step: `ui` names the shell handler);
 * `confirm` asks first; `blocked` disables it and says why (a strings.js key and its vars);
 * `detail` is an optional second line (the round it starts).
 * @typedef {{
 *   id: string, label: string,
 *   command: { type: CommandType, payload: Record<string, unknown> } | null,
 *   ui?: string, confirm?: { hintKey: string, labelKey: string }, blocked?: { key: string, vars?: Record<string, string|number> },
 *   detail?: string,
 * }} NextAction
 */

/** @param {CommandType} type @param {Record<string, unknown>} [payload] */
const cmd = (type, payload = {}) => ({ type, payload });

/**
 * A round's title: 'Round 4 · Bible Skit'.
 * @param {LarpEvent} event
 * @param {number} index
 * @param {Lang} lang
 */
export function roundTitle(event, index, lang) {
  const round = event.rounds[index];
  if (!round) return '';
  return `${label('label.roundN', lang, { n: index + 1 })} · ${t(`round.${round.category}`, lang)}`;
}

/**
 * The host's one next action for the event as it stands (every phase has exactly one).
 * @param {LarpEvent} event
 * @param {Lang} [lang] defaults to the event's host language
 * @returns {NextAction}
 */
export function nextAction(event, lang = event.config.hostLang) {
  const endEvent = () => ({
    id: 'endEvent',
    label: t('action.endEvent', lang),
    command: cmd('endEvent'),
    confirm: { hintKey: 'hint.confirmEnd', labelKey: 'action.endEvent' },
  });
  if (event.phase === 'setup') {
    const action = { id: 'startEvent', label: t('action.startEvent', lang), command: cmd('startEvent') };
    return event.teams.length ? action : { ...action, blocked: { key: 'error.no_teams' } };
  }
  if (event.phase === 'finished') {
    return { id: 'exportResults', label: t('action.exportResults', lang), command: null, ui: 'exportResults' };
  }
  const round = event.rounds[event.roundIndex];
  switch (event.roundPhase) {
    case null: {
      const next = nextRoundIndex(event);
      if (next === -1) return endEvent();
      return {
        id: 'startRound',
        label: label('action.startRoundN', lang, { n: next + 1 }),
        command: cmd('nextRound'),
        detail: roundTitle(event, next, lang),
      };
    }
    case 'briefing':
      return { id: 'startPreparation', label: t('action.startPreparation', lang), command: cmd('startPreparation') };
    case 'preparation':
      return { id: 'startPerformances', label: t('action.startPerformances', lang), command: cmd('endPreparation') };
    case 'performances': {
      const nextId = round?.order[event.currentTurn + 1];
      if (nextId === undefined)
        return { id: 'reviewRound', label: t('action.reviewRound', lang), command: cmd('beginReview') };
      const team = event.teams.find((tm) => tm.id === nextId);
      return {
        id: 'nextTeam',
        label: team ? label('action.nextTeamNamed', lang, { team: team.name }) : t('action.nextTeam', lang),
        command: cmd('nextTeam'),
      };
    }
    case 'review':
      return publishAction(event, lang);
    case 'reveal': {
      const r = event.reveal;
      if (r && r.step < r.total - 1)
        return { id: 'nextBanner', label: t('action.nextBanner', lang), command: cmd('revealAdvance') };
      return {
        id: 'showResults',
        label: t('action.showResults', lang),
        command: cmd(r ? 'revealAdvance' : 'revealSkip'),
      };
    }
    case 'results':
    default: {
      const next = nextRoundIndex(event);
      if (next === -1) return endEvent();
      return {
        id: 'startNextRound',
        label: t('action.startNextRound', lang),
        command: cmd('nextRound'),
        detail: roundTitle(event, next, lang),
      };
    }
  }
}

/**
 * Review's next action: Publish and Reveal Round N, blocked (with why) while a team has no status.
 * @param {LarpEvent} event
 * @param {Lang} lang
 * @returns {NextAction}
 */
function publishAction(event, lang) {
  const round = event.rounds[event.roundIndex];
  /** @type {NextAction} */
  const action = {
    id: 'publish',
    label: label('action.publishRevealRound', lang, { n: event.roundIndex + 1 }),
    command: cmd('publishRound', { roundId: round?.id }),
    confirm: { hintKey: 'hint.confirmPublish', labelKey: 'action.publishReveal' },
  };
  const check = canAdvance(event, 'reveal');
  if (!('error' in check)) return action;
  const n = check.error.ids?.length ?? 0;
  if (check.error.code === 'status_unset') {
    return { ...action, blocked: { key: n === 1 ? 'hint.needStatusOne' : 'hint.needStatusMany', vars: { n } } };
  }
  return { ...action, blocked: { key: `error.${check.error.code}` } };
}

/**
 * Whether the shell's tick should advance the reveal now: an unpaused reveal whose step has been
 * up its time (displayView.revealDwell: a banner each, or a long queue's grouped team pages), or
 * one that has reached its standings, which are the round's Results: it moves on to them at once,
 * so the console's next action becomes the real next step (Start Next Round) and the reveal's
 * controls go away as the room sees the standings.
 * @param {LarpEvent} event
 * @param {number} now
 */
export function revealDue(event, now) {
  const r = event.reveal;
  if (event.phase !== 'running' || event.roundPhase !== 'reveal' || !r) return false;
  if (r.step >= r.total - 1) return true;
  return !r.paused && now - r.stepStartedAt >= revealDwell(revealSteps(event, r.roundId), r.step);
}

/**
 * What changes with time alone (a timer running out, a peer going quiet): the tick re-renders
 * when this differs from last time; otherwise it only refreshes the clocks' text.
 * @param {LarpEvent|null} event
 * @param {HostLinkStatus} link
 * @param {number} now
 */
export function tickKey(event, link, now) {
  return [event ? expired(event.timer, now) : false, link.display, link.otherHost, link.displayWebgl].join('|');
}

/**
 * The host's live announcement after a render (one polite region the DOM keeps outside the
 * re-rendered markup): what changed since `prev` among the round and phase, the save warning and
 * the display closing. The first render says nothing (`prev` null). The timer is never announced.
 * @param {{ phase: string, failed: boolean, display: string }|null} prev
 * @param {Pick<HostVm, 'phase'|'save'|'display'>} vm
 * @returns {{ state: { phase: string, failed: boolean, display: string }, text: string }}
 */
export function liveNews(prev, vm) {
  const state = { phase: vm.phase, failed: vm.save.failed, display: vm.display.state };
  if (!prev) return { state, text: '' };
  const parts = [];
  if (state.phase !== prev.phase) parts.push(vm.phase);
  if (state.failed !== prev.failed) parts.push(state.failed ? vm.save.warning : vm.save.text);
  if (state.display === 'closed' && prev.display !== 'closed') parts.push(vm.display.label);
  return { state, text: parts.join('. ') };
}

// ── Keyboard ────────────────────────────────────────────────────────────────────────────────

/**
 * The shortcuts the `?` overlay lists (keysOverlay.js groups), in the host's language.
 * @param {Lang} lang
 */
export function hostKeys(lang) {
  return [
    {
      title: t('tab.run', lang),
      keys: [
        { keys: ['Space'], label: t('key.toggleTimer', lang) },
        { keys: ['N'], label: t('action.nextTeam', lang) },
        { keys: ['T'], label: t('action.add30', lang) },
      ],
    },
    {
      title: t('key.groupJudging', lang),
      keys: [
        { keys: ['A'], label: t('label.addAward', lang) },
        { keys: ['J'], label: t('action.judgeMode', lang) },
        { keys: ['?'], label: t('key.showKeys', lang) },
      ],
    },
  ];
}

/**
 * Whether `el` is a control that Space or Enter works itself (a button, a checkbox, a select, a
 * link…): the shortcuts then leave those keys to it.
 * @param {{ tagName?: string, getAttribute?: (name: string) => string|null, hasAttribute?: (name: string) => boolean }|null|undefined} el
 */
export function isControl(el) {
  const tag = String(el?.tagName ?? '').toLowerCase();
  if (['button', 'input', 'select', 'textarea', 'summary'].includes(tag)) return true;
  if (tag === 'a' && el?.hasAttribute?.('href')) return true;
  const role = el?.getAttribute?.('role') ?? '';
  return ['button', 'tab', 'checkbox', 'radio', 'switch', 'menuitem', 'option', 'link'].includes(role);
}

/**
 * The tab a key moves to from the focused tab `current` (the tablist pattern: ← and → to the
 * neighbour, wrapping; Home and End to the first and last), or null for any other key.
 * @param {string} key
 * @param {string|null|undefined} current
 * @returns {TabId|null}
 */
export function tabKey(key, current) {
  const i = TAB_IDS.indexOf(/** @type {TabId} */ (current));
  if (i === -1) return null;
  const n = TAB_IDS.length;
  if (key === 'ArrowRight') return TAB_IDS[(i + 1) % n];
  if (key === 'ArrowLeft') return TAB_IDS[(i - 1 + n) % n];
  if (key === 'Home') return TAB_IDS[0];
  if (key === 'End') return TAB_IDS[n - 1];
  return null;
}

/**
 * The shell handler a key press asks for, or null. Silent while typing, with a modifier, in Judge
 * Mode or behind the lock; Space and Enter are left to a focused control (a button, a checkbox).
 * No key ever publishes (Publish needs its button and confirmation).
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @param {{ typing: boolean, control?: boolean, ui: UiState, event: LarpEvent|null, locked?: boolean }} o
 *   control: focus is on a control that Space and Enter work (isControl)
 * @returns {string|null}
 */
export function keyAction(e, { typing, control = false, ui, event, locked = false }) {
  if (ui.confirm && e.key === 'Escape') return 'confirm.no';
  const quiet = typing || e.ctrlKey || e.metaKey || e.altKey || locked || !!ui.confirm || ui.judge.open || !event;
  if (quiet || (control && (e.key === ' ' || e.key === 'Enter'))) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const anytime = /** @type {Record<string, string>} */ ({ '?': 'keys', j: 'judge.open', a: 'focus.award' });
  if (anytime[key]) return anytime[key];
  if (event.phase !== 'running') return null;
  if (key === ' ' && event.timer.kind) return 'timer.toggle';
  if (key === 't' && event.timer.kind) return 'timer.add30';
  if (key === 'n' && nextAction(event).id === 'nextTeam') return 'next';
  return null;
}

/**
 * The command Space sends: pause a running timer, resume a paused one, start an idle one.
 * @param {LarpEvent} event
 * @returns {CommandType|null}
 */
export function timerToggle(event) {
  const s = event.timer.kind ? event.timer.status : null;
  return s === 'running' ? 'pauseTimer' : s === 'paused' ? 'resumeTimer' : s === 'idle' ? 'startTimer' : null;
}

// ── The frame's view model and markup ──────────────────────────────────────────────────────

/**
 * The top bar's round and phase: 'Round 4 · Bible Skit · Performances', 'Setup', 'Welcome'.
 * @param {LarpEvent} event
 * @param {Lang} lang
 */
export function phaseLine(event, lang) {
  if (event.phase === 'setup') return t('phase.setup', lang);
  if (event.phase === 'finished') return t('phase.finished', lang);
  if (event.roundPhase === null) return t('phase.welcome', lang);
  return `${roundTitle(event, event.roundIndex, lang)} · ${t(`phase.${event.roundPhase}`, lang)}`;
}

/**
 * The frame's view model.
 * @param {ScreenCtx} ctx
 */
export function hostVm(ctx) {
  const { event, ui, now, lang, saveStatus, link } = ctx;
  const est = estimate({ ...event.config, rounds: event.rounds }, event.teams.length);
  const tab = TABS.find((x) => x.id === ui.tab) ?? TABS[0];
  const round = event.rounds[event.roundIndex];
  const category = round ? ROUND_CATEGORIES.find((c) => c.key === round.category) : undefined;
  const display = {
    state: link.display,
    label: t(
      link.display === 'open'
        ? 'label.displayOpen'
        : link.display === 'closed'
          ? 'label.displayClosed'
          : 'label.displayNotOpened',
      lang,
    ),
    canOpen: link.display !== 'open',
    noWebgl: link.display === 'open' && link.displayWebgl === false,
    // Closed mid-event: a warning (reopening resumes it), and offline it can't be reopened at all.
    warn: link.display === 'closed',
    offline: link.display !== 'open' && ctx.online === false ? t('hint.reopenNeedsNetwork', lang) : '',
  };
  return {
    lang,
    title: t('app.host', lang),
    appTitle: t('app.title', lang),
    phase: phaseLine(event, lang),
    flame: event.phase === 'running' && category ? category.flame : 'gilded',
    clock: {
      startedAt: event.startedAt,
      now,
      target: formatClock(est.targetMs),
      over: est.overrunMs > 0 ? label('label.estOver', lang, { over: formatClock(est.overrunMs) }) : '',
    },
    save: {
      failed: saveStatus.state === 'failed',
      text: t(saveStatus.state === 'failed' ? 'label.notSaved' : 'label.saved', lang),
      hint: saveStatus.state === 'failed' ? t('hint.storageRefused', lang) : '',
      // The banner under the top bar while saving is refused: why, that play goes on, what to do.
      warning: saveStatus.state === 'failed' ? t('hint.storageWarning', lang) : '',
      // 'idle' means nothing was written yet this session: the event shown came from the save.
      show: true,
    },
    display,
    next: nextAction(event, lang),
    skip: skipVm(event, lang),
    checklist: checklistVm(ui, link, lang),
    tabs: TABS.map((x) => ({ id: x.id, label: t(x.labelKey, lang), current: x.id === tab.id })),
    tab: tab.id,
    preview: ui.preview && ctx.projection ? displayVm(ctx.projection, { now, preview: true }) : null,
    flash: ui.flash
      ? {
          kind: ui.flash.kind,
          text: label(ui.flash.key, lang, flashVars(ui.flash.vars, lang)),
          button: t(ui.flash.actionKey ?? 'action.close', lang),
          action: ui.flash.action ?? 'flash.dismiss',
        }
      : null,
    confirm: ui.confirm
      ? {
          hint: label(ui.confirm.hintKey, lang, ui.confirm.vars),
          confirm: t(ui.confirm.labelKey, lang),
          cancel: t('action.cancel', lang),
        }
      : null,
    lock: link.active ? null : lockVm(link, lang, saveStatus.state === 'failed'),
  };
}

/**
 * A flash's vars, with a var whose value is a strings.js key ('hint.…') put into words in `lang`
 * (the unreadable save's reason is stored as its key, so the flash follows the host language).
 * @param {Record<string, string|number>|undefined} vars
 * @param {Lang} lang
 */
function flashVars(vars, lang) {
  if (!vars) return vars;
  return Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('hint.') ? t(v, lang) : v]),
  );
}

/** @typedef {ReturnType<typeof hostVm>} HostVm */

/**
 * Skip Round beside the next action: the current round while it can still be skipped (Briefing to
 * Review, unpublished). `drafts` counts its unpublished awards: skipping then asks first.
 * @param {LarpEvent} event
 * @param {Lang} lang
 * @returns {{ roundId: string, label: string, hint: string, drafts: number } | null}
 */
export function skipVm(event, lang) {
  const round = event.rounds[event.roundIndex];
  if (!round || event.phase !== 'running' || 'error' in canSkip(event, round.id)) return null;
  const drafts = event.adjustments.filter((a) => a.roundId === round.id && a.status === 'draft').length;
  return { roundId: round.id, label: t('action.skipRound', lang), hint: t('hint.skipRound', lang), drafts };
}

/**
 * The projector checklist (shown on first opening the display, and from the top bar after): the
 * three steps and Show Test Pattern, which puts a sample title, banner and timer on the display.
 * @param {UiState} ui
 * @param {HostLinkStatus} link
 * @param {Lang} lang
 */
export function checklistVm(ui, link, lang) {
  const shell = ui.local.shell ?? {};
  if (!shell.checklist) return null;
  const pattern = !!shell.testPattern;
  return {
    title: t('label.projectorChecklist', lang),
    hint: t('hint.checklist', lang),
    // The last step: closing the display mid-event can't be undone offline (no service worker yet).
    steps: ['check.extend', 'check.drag', 'check.fullScreen', 'check.keepOpen'].map((k) => t(k, lang)),
    pattern,
    patternLabel: t(pattern ? 'action.hideTestPattern' : 'action.testPattern', lang),
    patternHint: t('hint.testPattern', lang),
    displayOpen: link.display === 'open',
    close: t('action.close', lang),
  };
}

/**
 * The second host window's lock (A25): another tab holds the event, or took it over. A window
 * whose saves were refused says so, with Export Backup (the other tab only has the older save).
 * @param {HostLinkStatus} link
 * @param {Lang} lang
 * @param {boolean} [unsaved]
 */
function lockVm(link, lang, unsaved = false) {
  const key = link.takenOver ? 'hint.takenOver' : link.otherHost === 'gone' ? 'hint.otherHostGone' : 'hint.otherHost';
  return {
    title: t('label.otherHost', lang),
    text: t(key, lang),
    takeOver: t('action.takeOver', lang),
    unsaved: unsaved ? { text: t('hint.unsavedHere', lang), button: t('action.exportBackup', lang) } : null,
  };
}

/**
 * The next-action button, disabled with its reason when blocked.
 * @param {NextAction} next
 * @param {Lang} lang
 */
function nextButton(next, lang) {
  const reason = next.blocked ? label(next.blocked.key, lang, next.blocked.vars) : '';
  const btn = button(next.label, 'next', {
    variant: 'primary',
    cls: 'larp-next',
    disabled: !!next.blocked,
    hint: reason || undefined,
    focus: 'next',
    attrs: { 'data-next': next.id },
  });
  const detail = next.detail ? `<span class="larp-next-detail">${esc(next.detail)}</span>` : '';
  const why = reason ? `<span class="larp-next-why" role="status">${esc(reason)}</span>` : '';
  return `<div class="larp-next-wrap">${btn}${detail}${why}</div>`;
}

/**
 * The whole host window: the lock, or the frame with `body` (the current tab's markup, or Judge
 * Mode's, which replaces the frame) inside it.
 * @param {HostVm} vm
 * @param {string} body trusted markup from a screen's render()
 * @param {{ judge?: boolean }} [o] judge: Judge Mode's screen fills the window (no top bar or tabs)
 * @returns {string}
 */
export function renderHost(vm, body, o = {}) {
  if (vm.lock) {
    const unsaved = vm.lock.unsaved
      ? `<p class="larp-lock-unsaved">${esc(vm.lock.unsaved.text)}</p>${button(vm.lock.unsaved.button, 'exportBackup', { variant: 'danger' })}`
      : '';
    return `<main class="larp-lock" id="main" tabindex="-1"><section class="larp-panel larp-lock-panel" aria-labelledby="larp-lock-title"><h1 id="larp-lock-title">${esc(vm.lock.title)}</h1><p>${esc(vm.lock.text)}</p>${unsaved}${button(vm.lock.takeOver, 'takeOver', { variant: 'primary', focus: 'takeOver' })}</section></main>`;
  }
  const dialog = vm.confirm ? renderConfirm(vm.confirm) : '';
  const flash = vm.flash
    ? `<div class="larp-flash larp-flash-${vm.flash.kind}" role="${vm.flash.kind === 'error' ? 'alert' : 'status'}"><span>${esc(vm.flash.text)}</span>${button(vm.flash.button, vm.flash.action, { variant: 'quiet', focus: 'flash' })}</div>`
    : '';
  if (o.judge) return `<main class="larp-judge-shell" id="main" tabindex="-1">${flash}${body}</main>${dialog}`;
  const warning = vm.save.warning
    ? `<div class="larp-save-warning"><p>${esc(vm.save.warning)}</p>${button(t('action.exportBackup', vm.lang), 'exportBackup', { variant: 'danger', focus: 'exportBackup-warning' })}</div>`
    : '';
  return `${renderTopBar(vm)}${renderTabs(vm)}${warning}${flash}${renderChecklist(vm)}<main class="larp-host-main" id="main" tabindex="-1"><div class="larp-tab-body" id="larp-tab-${esc(vm.tab)}" role="tabpanel" aria-labelledby="larp-tabbtn-${esc(vm.tab)}">${body}</div>${renderPreview(vm)}</main>${dialog}`;
}

/** @param {HostVm} vm */
function renderTopBar(vm) {
  const { clock, save, display, lang } = vm;
  const saved = save.show
    ? `<span class="larp-saved${save.failed ? ' is-failed' : ''}"${save.hint ? ` data-tip="${esc(save.hint)}"` : ''}>${esc(save.text)}</span>`
    : '';
  const over = clock.over ? ` <span class="larp-est-over">(${esc(clock.over)})</span>` : '';
  const webgl = display.noWebgl
    ? `<span class="larp-note" data-tip="${esc(t('hint.noWebgl', lang))}">${esc(t('label.webglOff', lang))}</span>`
    : '';
  const open = display.canOpen
    ? button(t('action.openDisplay', lang), 'openDisplay', { variant: 'secondary' })
    : vm.checklist
      ? ''
      : button(t('label.projectorChecklist', lang), 'checklist', { variant: 'quiet' });
  const skip = vm.skip
    ? button(vm.skip.label, 'skipRound', {
        variant: 'quiet',
        cls: 'larp-skip',
        hint: vm.skip.hint,
        value: vm.skip.roundId,
      })
    : '';
  return `<header class="larp-topbar">
  <div class="larp-topbar-where"><p class="larp-app-name">${esc(vm.appTitle)}</p><h1 class="larp-phase">${esc(vm.phase)}</h1></div>
  <p class="larp-event-clock"><span class="larp-label-inline">${esc(t('label.event', lang))}</span> ${elapsed(clock.startedAt, clock.now)} / ${esc(clock.target)}${over}</p>
  <div class="larp-topbar-status"><span class="larp-display-state is-${esc(display.state)}"${display.warn ? ` data-tip="${esc(t('hint.reopenDisplay', lang))}"` : ''}>${display.warn ? '<span class="larp-warn-glyph" aria-hidden="true">⚠</span> ' : ''}${esc(display.label)}</span>${display.offline ? `<span class="larp-note is-warn">${esc(display.offline)}</span>` : ''}${webgl}${open}${saved}</div>
  <div class="larp-topbar-next">${skip}${nextButton(vm.next, lang)}</div>
</header>`;
}

/** @param {HostVm} vm */
function renderChecklist(vm) {
  const c = vm.checklist;
  if (!c) return '';
  const steps = c.steps.map((s) => `<li>${esc(s)}</li>`).join('');
  const pattern = button(c.patternLabel, 'testPattern', {
    variant: 'secondary',
    pressed: c.pattern,
    disabled: !c.displayOpen,
    hint: c.patternHint,
    focus: 'testPattern',
  });
  return `<section class="larp-panel larp-checklist" aria-labelledby="larp-checklist-title"><div class="larp-checklist-text"><h2 id="larp-checklist-title">${esc(c.title)}</h2><p class="larp-hint">${esc(c.hint)}</p><ol>${steps}</ol></div><div class="larp-checklist-actions">${pattern}${button(c.close, 'checklist.close', { variant: 'quiet' })}</div></section>`;
}

/** @param {HostVm} vm */
function renderTabs(vm) {
  const tabs = vm.tabs
    .map(
      (x) =>
        `<button type="button" role="tab" class="larp-tab" id="larp-tabbtn-${esc(x.id)}" data-action="tab" data-value="${esc(x.id)}" aria-selected="${x.current}" aria-controls="larp-tab-${esc(x.id)}"${x.current ? '' : ' tabindex="-1"'}>${esc(x.label)}</button>`,
    )
    .join('');
  const preview = button(t(vm.preview ? 'action.hidePreview' : 'action.previewDisplay', vm.lang), 'preview', {
    variant: 'quiet',
    pressed: !!vm.preview,
  });
  const judge = button(t('action.judgeMode', vm.lang), 'judge.open', { variant: 'secondary', kbd: 'J' });
  return `<nav class="larp-tabs-bar" aria-label="${esc(vm.title)}"><div class="larp-tabs" role="tablist">${tabs}</div><div class="larp-tabs-extra">${preview}${judge}</div></nav>`;
}

/** @param {HostVm} vm */
function renderPreview(vm) {
  if (!vm.preview) return '';
  return `<aside class="larp-preview" aria-label="${esc(t('action.previewDisplay', vm.lang))}"><div class="larp-preview-frame larp-display" inert>${renderDisplay(vm.preview)}</div></aside>`;
}

/** @param {NonNullable<HostVm['confirm']>} c */
function renderConfirm(c) {
  return `<div class="larp-backdrop"><div class="larp-panel larp-dialog" role="alertdialog" aria-modal="true" aria-label="${esc(c.confirm)}" aria-describedby="larp-confirm-text"><p id="larp-confirm-text">${esc(c.hint)}</p><div class="larp-dialog-actions">${button(c.cancel, 'confirm.no', { focus: 'confirm.no' })}${button(c.confirm, 'confirm.yes', { variant: 'primary', focus: 'confirm.yes' })}</div></div></div>`;
}

/**
 * What a dispatch result does to the flash: an error shows its message; success clears an error.
 * @param {UiStore} ui
 * @returns {(result: DispatchResult) => boolean}
 */
export function reporter(ui) {
  return (result) => {
    if (!result.ok && result.error) ui.set({ flash: { kind: 'error', key: `error.${result.error.code}` } });
    else if (ui.get().flash?.kind === 'error') ui.set({ flash: null });
    return result.ok;
  };
}

/**
 * A downloaded file's name: 'nghia-si-campfire-backup-2026-10-10.json' (Export Backup) or
 * '…-results-2026-10-10.csv' (Export Results), dated by the laptop's clock (UTC day).
 * @param {'backup'|'results'|'unreadable'} kind
 * @param {number} now
 */
export function fileName(kind, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (kind === 'unreadable') return `nghia-si-campfire-unreadable-save-${day}.json`;
  return kind === 'results' ? `nghia-si-campfire-results-${day}.csv` : `nghia-si-campfire-backup-${day}.json`;
}

/**
 * Reopened mid-event (a closed tab, a crash, a restart): "Resume the event: Round 3 · Bible Skit,
 * Performances" with Resume Event, and a word when the timer ran out while the console was closed
 * (a paused timer comes back paused; a running one continues from its saved deadline). A timer
 * already out at the last save ran out while the console was open: the plain words.
 * @param {LarpEvent|null} event
 * @param {number} now
 * @returns {import('./uiState.js').Flash|null}
 */
export function resumeFlash(event, now) {
  if (!event || event.phase !== 'running') return null;
  const lang = event.config.hostLang;
  const round = event.roundPhase === null ? '' : roundTitle(event, event.roundIndex, lang);
  const phase = t(event.roundPhase === null ? 'phase.welcome' : `phase.${event.roundPhase}`, lang);
  // Ran out while closed: it was still running at the last save (its deadline after updatedAt).
  const timer = event.timer;
  const late =
    timer.kind !== null &&
    timer.status === 'running' &&
    expired(timer, now) &&
    (timer.deadline ?? 0) > (event.updatedAt ?? 0);
  return {
    kind: 'info',
    key: late ? 'hint.resumeTimeUp' : 'hint.resume',
    vars: { round: round || t('phase.welcome', lang), phase: round ? phase : t('phase.running', lang) },
    actionKey: 'action.resumeEvent',
  };
}

/**
 * Started anew over a save it couldn't read (app.bootPlan 'protect'): why, and whether that save
 * was copied aside (saving goes on) or is held untouched (saving stays off), with Download
 * Unreadable Save. The reason stays a key, so the words follow the host language.
 * @param {string} reason the ErrorCode (newer_version, bad_json, bad_backup)
 * @param {{ saving: boolean }} kept app.protectUnreadable()'s answer
 * @returns {import('./uiState.js').Flash}
 */
export function unreadableFlash(reason, kept) {
  const why = ['newer_version', 'bad_json', 'bad_backup'].includes(reason) ? reason : 'bad_json';
  return {
    kind: 'error',
    key: kept.saving ? 'hint.unreadableKept' : 'hint.unreadableHeld',
    vars: { why: `hint.unreadable.${why}` },
    actionKey: 'action.downloadUnreadable',
    action: 'unreadable.download',
  };
}

/** How long (ms) the next-action button ignores clicks after one went through (a double-click). */
export const NEXT_GUARD_MS = 600;

// ── Putting it together (hostDom.js calls these; they are pure or take fakes in tests) ─────

/**
 * The context every vm() gets, from the app, the UI state and the link right now; null without an
 * event (the shell always has one after boot).
 * @param {App} app
 * @param {UiStore} ui
 * @param {HostLinkStatus} link
 * @param {number} now
 * @param {boolean} [online] the browser's navigator.onLine
 * @returns {ScreenCtx|null}
 */
export function screenCtx(app, ui, link, now, online = true) {
  const event = app.getEvent();
  if (!event) return null;
  const u = ui.get();
  return {
    event,
    ui: u,
    now,
    lang: event.config.hostLang,
    saveStatus: app.getSaveStatus(),
    link,
    projection: u.preview ? app.getProjection(now) : null,
    online,
  };
}

/**
 * The whole window for a context: the frame's view model, the screen showing (Judge Mode while
 * it's open, else the current tab; none behind the lock) and the markup.
 * @param {ScreenCtx} ctx
 * @returns {{ vm: HostVm, screen: Screen|null, html: string }}
 */
export function hostView(ctx) {
  const vm = hostVm(ctx);
  if (vm.lock) return { vm, screen: null, html: renderHost(vm, '') };
  const judge = ctx.ui.judge.open;
  const tab = TABS.find((x) => x.id === vm.tab) ?? TABS[0];
  // Once the event ends, the Run tab shows the final standings and the end-of-event files.
  const screen = judge ? judgeScreen : tab === runTab && ctx.event.phase === 'finished' ? finishedTab : tab;
  return { vm, screen, html: renderHost(vm, screen.render(screen.vm(ctx)), { judge }) };
}

/**
 * The shell's own handlers (the names in this file's header). Made once per window: the next
 * action's double-click guard lives here.
 * @param {{
 *   app: App, ui: UiStore, env: HostEnv,
 *   link: { takeOver(): void },
 *   handlers: () => Handlers, render?: () => void, openKeys: () => void,
 * }} deps handlers: every handler now (the confirmation runs the asking one again); env.focus
 *   draws first, so a handler may move focus to what it just made appear
 * @returns {Handlers}
 */
export function shellActions({ app, ui, env, link, handlers, openKeys }) {
  let lastNext = -Infinity;
  return {
    tab: ({ value }) => {
      if (TABS.some((x) => x.id === value)) ui.set({ tab: /** @type {TabId} */ (value) });
    },
    next: ({ confirmed, el, event: dom }) => {
      const event = app.getEvent();
      // A double-click's second click (detail 2), a repeated Enter (detail 0) or a key press soon
      // after a step went through is ignored; a deliberate single click on the new label is not.
      const single = /** @type {MouseEvent|null} */ (dom)?.detail === 1;
      if (!event || (!single && env.now() - lastNext < NEXT_GUARD_MS)) return;
      const next = nextAction(event);
      if (next.blocked) return;
      if (next.ui === 'exportResults') {
        env.download(fileName('results', env.now()), app.exportResultsCsv(), 'text/csv');
        return;
      }
      if (next.confirm && !confirmed) {
        env.confirm({ action: 'next', hintKey: next.confirm.hintKey, labelKey: next.confirm.labelKey });
        return;
      }
      // The same id for every click on one rendering of the button: a double-click applies once.
      const id = `next-${event.id}-${el?.dataset?.revision ?? event.revision}`;
      const payload = /** @type {any} */ (next.command?.payload);
      if (!next.command || !env.report(app.dispatch(next.command.type, payload, { id }))) return;
      lastNext = env.now();
      // Published: the reveal's controls (pause, next banner, skip) are on the Run tab.
      if (next.id === 'publish' && ui.get().tab !== 'run') ui.set({ tab: 'run' });
    },
    sign: ({ el, value }) => {
      const [form, name] = String(el?.dataset?.draftTarget ?? '').split('.');
      if (!form || !name) return;
      ui.setDraft(form, name, withSign(ui.draft(form)[name] ?? '', value ?? '+'), { silent: false });
      // Straight back to the amount, the caret after the sign, so the digits follow it.
      const field = el?.getAttribute?.('aria-controls');
      if (field) env.focus(`#${field}`);
    },
    'confirm.yes': (args) => {
      const pending = ui.get().confirm;
      ui.set({ confirm: null });
      if (pending) handlers()[pending.action]?.({ ...args, value: pending.value, confirmed: true });
    },
    'confirm.no': () => ui.set({ confirm: null }),
    openDisplay: () => {
      env.openDisplay();
      if (!ui.get().local.shell?.checklistSeen) ui.setLocal('shell', { checklist: true, checklistSeen: true });
    },
    checklist: () => ui.setLocal('shell', { checklist: true }),
    'checklist.close': () => {
      if (ui.get().local.shell?.testPattern) env.post({ type: 'testPattern', show: false });
      ui.setLocal('shell', { checklist: false, testPattern: false });
    },
    testPattern: () => {
      const show = !ui.get().local.shell?.testPattern;
      env.post({ type: 'testPattern', show });
      ui.setLocal('shell', { testPattern: show });
    },
    skipRound: ({ value, confirmed }) => {
      const event = app.getEvent();
      const skip = event && skipVm(event, event.config.hostLang);
      if (!skip || (value && value !== skip.roundId)) return;
      if (skip.drafts && !confirmed) {
        env.confirm({
          action: 'skipRound',
          value: skip.roundId,
          hintKey: 'hint.confirmSkip',
          labelKey: 'action.skipRound',
        });
        return;
      }
      env.report(app.dispatch('skipRound', { roundId: skip.roundId }, { id: `skip-${skip.roundId}` }));
    },
    preview: () => ui.set((s) => ({ preview: !s.preview })),
    'judge.open': () => {
      ui.set((s) => ({ judge: { ...s.judge, open: true, gmId: null } }));
      // Into the picker: the remembered co-GM's button, else the first name, else Done.
      env.focus('[data-focus="judge-last"], .larp-judge-gm, [data-focus="judge-done"]');
    },
    exportBackup: () => env.download(fileName('backup', env.now()), app.exportBackup(), 'application/json'),
    takeOver: () => {
      link.takeOver();
      // The saved event, unless this window's own is newer (its saves were refused).
      app.adoptSaved();
    },
    'flash.dismiss': () => ui.set({ flash: null }),
    'unreadable.download': () => {
      const text = app.unreadableText?.();
      if (text) env.download(fileName('unreadable', env.now()), text, 'application/json');
      ui.set({ flash: null });
    },
    'timer.toggle': () => {
      const event = app.getEvent();
      const type = event && timerToggle(event);
      if (type) env.report(app.dispatch(type, {}));
    },
    'timer.add30': () => env.report(app.dispatch('addTime', { ms: 30_000 })),
    'focus.award': () => {
      ui.set({ tab: 'run' });
      env.focus('[data-focus="add-award"]');
    },
    keys: () => openKeys(),
  };
}
