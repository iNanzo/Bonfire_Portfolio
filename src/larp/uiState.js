// The host window's local UI state: which tab is open, who is in Judge Mode, the Add Award
// recipients, form drafts, a pending confirmation, the last message. It is NOT part of the saved
// event (never in a backup, never on the display, never a command). Drafts and choices are kept in
// an injected sessionStorage-like storage under 'larp.ui.' so a reload keeps what was being typed;
// a storage that's missing or throws is simply skipped. Pure apart from that storage; no DOM.
//
//   createUiStore({ storage, key })   get(), set(patch), setDraft(form, field, value), draft(form),
//                                     clearDraft(form), setLocal(ns, patch), subscribe(fn)
//   readUi(text) / defaultUi()        what a stored copy restores to (anything odd → defaults)
//   actorOf(ui)                       who a screen's commands are from (Judge Mode's GM, or the host)
//   judgeLockText / judgeLockPatch    Judge Mode's lock, kept where every host window reads it
//                                     (localStorage 'larp.judgeLock'), so a new tab, a reopened
//                                     one or Take Over can't skip the Host PIN
import { HOST_GM_ID } from './types.js';

/**
 * @typedef {import('./types.js').RecipientType} RecipientType
 * @typedef {import('./store.js').StorageLike} StorageLike
 */

/** The host console's tabs, in order. */
export const TAB_IDS = /** @type {const} */ (['run', 'roster', 'review', 'history', 'setup']);
/** @typedef {(typeof TAB_IDS)[number]} TabId */

/** Where the UI state is kept (sessionStorage: this tab only). */
export const UI_KEY = 'larp.ui.state';
/** Where Judge Mode's lock is kept (localStorage: every host window of this browser). */
export const JUDGE_LOCK_KEY = 'larp.judgeLock';

/**
 * A confirmation the shell shows as a dialog: Confirm runs handler `action` again with
 * `confirmed: true` (and `value`); the hint and label are strings.js keys filled with `vars`.
 * @typedef {{ action: string, value?: string, hintKey: string, labelKey: string, vars?: Record<string, string|number> }} PendingConfirm
 */

/**
 * A short message under the top bar: an error from a refused command (`key` 'error.<code>'),
 * or information. `key` is a strings.js key, `vars` fills it; `actionKey` names its dismiss button
 * (Close by default; Resume Event on reopening) and `action` the handler it runs ('flash.dismiss'
 * by default; Download Unreadable Save's 'unreadable.download').
 * @typedef {{ kind: 'error'|'info', key: string, vars?: Record<string, string|number>, actionKey?: string, action?: string }} Flash
 */

/**
 * The UI state. `judge.open` with `gmId` null shows Judge Mode's name picker; `lastGmId` is the
 * co-GM remembered for a quick return. `local` is a namespaced bag each screen may use for its own
 * view choices (`local.run`, `local.setup`…), kept like drafts. `drafts[form][field]` holds the
 * raw text of a form's fields (`data-draft="form.field"` inputs fill it).
 * @typedef {{
 *   tab: TabId,
 *   judge: { open: boolean, gmId: string|null, lastGmId: string|null },
 *   recipientType: RecipientType, recipientIds: string[],
 *   drafts: Record<string, Record<string, string>>,
 *   local: Record<string, Record<string, unknown>>,
 *   preview: boolean,
 *   confirm: PendingConfirm|null, flash: Flash|null,
 * }} UiState
 */

/** @returns {UiState} */
export function defaultUi() {
  return {
    tab: 'run',
    judge: { open: false, gmId: null, lastGmId: null },
    recipientType: 'team',
    recipientIds: [],
    drafts: {},
    local: {},
    preview: false,
    confirm: null,
    flash: null,
  };
}

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v */
const idOrNull = (v) => (typeof v === 'string' && v ? v : null);

/**
 * A stored copy back to a UI state: each field kept only when it has the right shape. Confirm and
 * flash never come back (a reload is a fresh start for them).
 * @param {string|null} text
 * @returns {UiState}
 */
export function readUi(text) {
  const ui = defaultUi();
  let raw;
  try {
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (!isObj(raw)) return ui;
  if (TAB_IDS.includes(raw.tab)) ui.tab = raw.tab;
  if (isObj(raw.judge)) {
    ui.judge = {
      open: raw.judge.open === true,
      gmId: idOrNull(raw.judge.gmId),
      lastGmId: idOrNull(raw.judge.lastGmId),
    };
  }
  if (raw.recipientType === 'team' || raw.recipientType === 'member') ui.recipientType = raw.recipientType;
  if (Array.isArray(raw.recipientIds)) ui.recipientIds = raw.recipientIds.filter((id) => typeof id === 'string');
  if (isObj(raw.drafts)) {
    for (const [form, fields] of Object.entries(raw.drafts)) {
      if (!isObj(fields)) continue;
      const kept = Object.entries(fields).filter(([, v]) => typeof v === 'string');
      if (kept.length) ui.drafts[form] = Object.fromEntries(kept);
    }
  }
  if (isObj(raw.local)) {
    for (const [ns, bag] of Object.entries(raw.local)) if (isObj(bag)) ui.local[ns] = { ...bag };
  }
  ui.preview = raw.preview === true;
  return ui;
}

/**
 * Who the commands are from: the GM in Judge Mode, else the host (every screen sends as this).
 * @param {UiState} ui
 * @returns {{ mode: 'host'|'judge', actorId: string }}
 */
export function actorOf(ui) {
  return ui.judge?.open && ui.judge.gmId
    ? { mode: 'judge', actorId: ui.judge.gmId }
    : { mode: 'host', actorId: HOST_GM_ID };
}

// ── Judge Mode's lock ───────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ config: { hostPin: string|null }, id: string, gms: Array<{ id: string }> }} LockEvent
 */

/** @param {LockEvent|null|undefined} event */
const pinSet = (event) => !!event?.config.hostPin?.trim();

/**
 * The lock this window's UI state calls for: Judge Mode is open and the host set a PIN → the
 * text to keep under JUDGE_LOCK_KEY; otherwise null (no lock: remove it).
 * @param {UiState} ui
 * @param {LockEvent|null|undefined} event
 * @returns {string|null}
 */
export function judgeLockText(ui, event) {
  if (!ui.judge.open || !event || !pinSet(event)) return null;
  return JSON.stringify({ eventId: event.id, gmId: ui.judge.gmId ?? null });
}

/**
 * What a host window that starts, or takes over, does with a stored lock: reopen Judge Mode (the
 * same co-GM, while they are still in the event) so leaving it asks for the Host PIN. Null when
 * there is nothing to do (no lock, another event's, no PIN set, Judge Mode already open).
 * @param {UiState} ui
 * @param {string|null} text the stored lock
 * @param {LockEvent|null|undefined} event
 * @returns {Partial<UiState>|null}
 */
export function judgeLockPatch(ui, text, event) {
  if (!text || !event || !pinSet(event) || ui.judge.open) return null;
  let lock;
  try {
    lock = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(lock) || lock.eventId !== event.id) return null;
  const gmId = idOrNull(lock.gmId);
  const known = gmId && event.gms.some((g) => g.id === gmId) ? gmId : null;
  return { judge: { open: true, gmId: known, lastGmId: known ?? ui.judge.lastGmId } };
}

/** @param {UiState} ui */
const persisted = (ui) =>
  JSON.stringify({
    tab: ui.tab,
    judge: ui.judge,
    recipientType: ui.recipientType,
    recipientIds: ui.recipientIds,
    drafts: ui.drafts,
    local: ui.local,
    preview: ui.preview,
  });

/**
 * @param {{ storage?: StorageLike|null, key?: string }} [deps]
 */
export function createUiStore({ storage = null, key = UI_KEY } = {}) {
  let state;
  try {
    state = readUi(storage?.getItem(key) ?? null);
  } catch {
    state = readUi(null);
  }
  /** @type {Set<(ui: UiState) => void>} */
  const listeners = new Set();
  const keep = () => {
    try {
      storage?.setItem(key, persisted(state));
    } catch {
      // a full or blocked session storage only loses the drafts
    }
  };
  /** @param {boolean} silent */
  const changed = (silent) => {
    keep();
    if (!silent) for (const fn of [...listeners]) fn(state);
  };

  return {
    /** @returns {UiState} */
    get: () => state,
    /**
     * Merge a patch (or a function of the state giving one) and re-render (unless `silent`).
     * @param {Partial<UiState> | ((ui: UiState) => Partial<UiState>)} patch
     * @param {{ silent?: boolean }} [opts]
     */
    set(patch, { silent = false } = {}) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      changed(silent);
    },
    /**
     * One field of a form's draft (raw text). Silent by default: typing never re-renders, except
     * where the caller asks (a live label like "Add −25").
     * @param {string} form
     * @param {string} field
     * @param {string} value
     * @param {{ silent?: boolean }} [opts]
     */
    setDraft(form, field, value, { silent = true } = {}) {
      state = { ...state, drafts: { ...state.drafts, [form]: { ...state.drafts[form], [field]: String(value) } } };
      changed(silent);
    },
    /** @param {string} form @returns {Record<string, string>} */
    draft: (form) => state.drafts[form] ?? {},
    /** @param {string} form */
    clearDraft(form) {
      const drafts = { ...state.drafts };
      delete drafts[form];
      state = { ...state, drafts };
      changed(false);
    },
    /**
     * A screen's own view choices (`ns` its tab or screen id).
     * @param {string} ns
     * @param {Record<string, unknown>} patch
     */
    setLocal(ns, patch) {
      state = { ...state, local: { ...state.local, [ns]: { ...state.local[ns], ...patch } } };
      changed(false);
    },
    /** @param {(ui: UiState) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** @typedef {ReturnType<typeof createUiStore>} UiStore */
