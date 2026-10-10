// The host console's Setup and Teams & Roster tabs (the design's Setup and Roles): teams (name,
// translation, color, emblem, patron, each name previewed in its display face with a note when it
// falls back to Inter), the roster (one name per line, a team picker, captains), co-GMs, rounds
// (prompts, base points, allowances, the live estimate), the display (language mode, scenery,
// reduced motion, sound, show members, Host PIN), Award Cards, Ready for Offline, export, import
// (a summary and a confirmation first) and Delete Event Data. Late arrivals and team moves while
// running live in Teams & Roster.
// Owner: the host-setup screen. Styles: css/host-setup.css. Interface: host.js's Screen.
//
//   rosterVm / renderRoster      Teams & Roster (pure)
//   setupVm / renderSetup        Setup (pure)
//   rosterActions / setupActions the handlers ('roster.*', 'setup.*'); setupActions takes its few
//                                browser needs (a file's text, a print window, the offline probe)
//                                as `deps`, so tests pass fakes
//   splitNames, parseDuration, fieldValue, teamInput, faceNote, offlineChecklist, awardCardsHtml,
//   resultsFileName              the pure helpers behind them
//   readFileText, openPrint, probeOffline   the thin browser layer (each takes its globals as
//                                arguments with browser defaults)
//
// Team order: Stage 1 has no command to reorder teams (the performance queue rotates each round
// anyway), so this tab adds and removes teams but does not reorder them.
/**
 * @typedef {import('./host.js').Screen} Screen
 * @typedef {import('./host.js').ScreenCtx} ScreenCtx
 * @typedef {import('./host.js').HostEnv} HostEnv
 * @typedef {import('./app.js').App} App
 * @typedef {import('./uiState.js').UiStore} UiStore
 * @typedef {import('./dom.js').Handlers} Handlers
 * @typedef {import('./channel.js').HostLinkStatus} HostLinkStatus
 * @typedef {import('./store.js').BackupSummary} BackupSummary
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Team} Team
 * @typedef {import('./types.js').Lang} Lang
 * @typedef {import('./types.js').ErrorCode} ErrorCode
 * @typedef {import('./fonts.js').Face} Face
 */
import { esc } from '../html.js';
import { DISPLAY_MODES, EMBLEMS, LIMITS, SCENERY_KEYS, larpError } from './types.js';
import { cleanText, formatClock, normalizeName, parsePoints, t } from './strings.js';
import { emblem as emblemAt, estimate, teamColor } from './config.js';
import { displayFace } from './fonts.js';
import { attrs, button, field, label, teamChip, textArea, textInput } from './ui.js';
import { awardCardsHtml, openPrint, probeOffline, readFileText } from './hostSetupIo.js';

export { awardCardsHtml, openPrint, probeOffline, readFileText };

/** The UI store's draft forms this screen types into (no dots: dom.js splits 'form.field'). */
export const FORMS = Object.freeze({
  team: 'setupTeam',
  members: 'setupMembers',
  gm: 'setupGm',
  search: 'setupSearch',
});

/** Teams shown open by default up to this many (more stay folded until opened or searched). */
export const OPEN_TEAMS_UP_TO = 12;

/** The team fields a row edits in place. */
const TEAM_FIELDS = /** @type {const} */ (['name', 'translation', 'patron', 'color', 'emblem']);

// ── Pure helpers ────────────────────────────────────────────────────────────────────────────

/**
 * A pasted roster as names: one per line, list markers ('- ', '• ', '1. ', '2) ') dropped,
 * whitespace collapsed, blank lines skipped. Repeats are kept (two youth may share a name).
 * @param {string} text
 * @returns {string[]}
 */
export function splitNames(text) {
  return String(text ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => cleanText(line.replace(/^\s*(?:[-*•·]|\d{1,3}[.)])\s+/u, '')))
    .filter(Boolean);
}

/**
 * A typed allowance: 'm:ss' ('1:30') or whole seconds ('90') → ms; anything else → null.
 * @param {string} text
 * @returns {number|null}
 */
export function parseDuration(text) {
  const s = String(text ?? '').trim();
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(s);
  if (clock) return (Number(clock[1]) * 60 + Number(clock[2])) * 1000;
  const secs = /^(\d{1,5})$/.exec(s);
  return secs ? Number(secs[1]) * 1000 : null;
}

/**
 * A changed control's text as the value its command wants: 'bool' ('true'/'false'), 'duration'
 * (m:ss → ms), 'points' (a whole number), 'pin' (blank → null, else trimmed), 'text' (as typed).
 * @param {string|undefined} kind
 * @param {string|undefined} raw
 * @returns {{ ok: true, value: any } | { ok: false, code: ErrorCode }}
 */
export function fieldValue(kind, raw) {
  const s = String(raw ?? '');
  if (kind === 'bool') return { ok: true, value: s === 'true' };
  if (kind === 'duration') {
    const ms = parseDuration(s);
    return ms === null ? { ok: false, code: 'invalid_duration' } : { ok: true, value: ms };
  }
  if (kind === 'points') {
    const n = parsePoints(s);
    return n === null ? { ok: false, code: 'invalid_points' } : { ok: true, value: n };
  }
  if (kind === 'pin') return { ok: true, value: s.trim() ? s.trim() : null };
  return { ok: true, value: s };
}

/**
 * The Add Team form's draft as a TeamInput (color and emblem left to cycle by the team count).
 * @param {Record<string, string>} draft
 * @returns {{ name: string, translation: string, patron: string }}
 */
export function teamInput(draft) {
  return { name: draft.name ?? '', translation: draft.translation ?? '', patron: draft.patron ?? '' };
}

/**
 * Which face the display sets a name in, and the note saying so (U01: a name Cinzel can't fully
 * cover is set wholly in Inter).
 * @param {string} name
 * @param {Lang} lang
 * @returns {{ face: Face, fallback: boolean, text: string }}
 */
export function faceNote(name, lang) {
  const face = displayFace(name, 'cinzel');
  const fallback = face === 'inter';
  return { face, fallback, text: t(fallback ? 'hint.faceFallback' : 'hint.faceCinzel', lang) };
}

/**
 * The Export Results file's name, dated by the laptop's clock (UTC day), like host.js fileName.
 * @param {number} now
 */
export function resultsFileName(now) {
  return `nghia-si-campfire-results-${new Date(now).toISOString().slice(0, 10)}.csv`;
}

/**
 * What Ready for Offline last found (probeOffline's answer, as kept in the UI state).
 * @typedef {{
 *   at?: number,
 *   models?: { bonfire?: boolean, knight?: boolean },
 *   fonts?: { inter?: boolean, cinzel?: boolean, pixelify?: boolean },
 * }} OfflineProbe
 */

/**
 * Ready for Offline's checklist: the page, the display opened once (so three.js and the scene
 * loaded), the two models and the three fonts. `ok` null means not checked yet.
 * @param {OfflineProbe|null|undefined} probe
 * @param {Pick<HostLinkStatus, 'display'>} link
 * @param {Lang} lang
 */
export function offlineChecklist(probe, link, lang) {
  const p = probe && typeof probe === 'object' ? probe : null;
  /** @param {unknown} v */
  const seen = (v) => (p ? v === true : null);
  const items = [
    { key: 'page', labelKey: 'label.offlinePage', ok: /** @type {boolean|null} */ (true) },
    { key: 'display', labelKey: 'label.offlineDisplay', ok: link.display !== 'notOpened' },
    { key: 'bonfire', labelKey: 'label.offlineBonfire', ok: seen(p?.models?.bonfire) },
    { key: 'knight', labelKey: 'label.offlineKnight', ok: seen(p?.models?.knight) },
    { key: 'inter', labelKey: 'label.fontInter', ok: seen(p?.fonts?.inter) },
    { key: 'cinzel', labelKey: 'label.fontCinzel', ok: seen(p?.fonts?.cinzel) },
    { key: 'pixelify', labelKey: 'label.fontPixelify', ok: seen(p?.fonts?.pixelify) },
  ].map((item) => ({
    ...item,
    label: t(item.labelKey, lang),
    status: t(item.ok === null ? 'status.notChecked' : item.ok ? 'status.ready' : 'status.missing', lang),
  }));
  const missing = items.filter((item) => item.ok === false).map((item) => item.label);
  const ready = !!p && items.every((item) => item.ok === true);
  const summary = !p
    ? t('hint.offlineNotChecked', lang)
    : ready
      ? t('hint.offlineReady', lang)
      : label('hint.offlineMissing', lang, { items: missing.join(', ') });
  return { checked: !!p, ready, items, summary };
}

/**
 * Whether a team's details are open: the host's choice, else open while searching or while there
 * are few teams.
 * @param {Record<string, unknown>} local the screen's ui.local bag
 * @param {string} teamId
 * @param {number} teamCount
 * @param {string} query
 */
export function teamOpen(local, teamId, teamCount, query) {
  const open = local.open && typeof local.open === 'object' ? /** @type {Record<string, unknown>} */ (local.open) : {};
  if (typeof open[teamId] === 'boolean') return /** @type {boolean} */ (open[teamId]);
  return teamCount <= OPEN_TEAMS_UP_TO || !!query.trim();
}

/**
 * The team the roster paste goes to: the draft's choice while it exists, else the first team.
 * @param {LarpEvent} event
 * @param {string|undefined} teamId
 * @returns {string|null}
 */
export function membersTeam(event, teamId) {
  if (teamId && event.teams.some((tm) => tm.id === teamId)) return teamId;
  return event.teams[0]?.id ?? null;
}

/** @param {Pick<Team, 'name'|'translation'>} team */
const teamName = (team) => (team.translation ? `${team.name} (${team.translation})` : team.name);

// ── Teams & Roster ──────────────────────────────────────────────────────────────────────────

/**
 * The Teams & Roster tab's view model (pure).
 * @param {ScreenCtx} ctx
 */
export function rosterVm(ctx) {
  const { event, ui, lang } = ctx;
  const local = ui.local.roster ?? {};
  const query = ui.drafts[FORMS.search]?.query ?? '';
  const q = normalizeName(query);
  const teamDraft = ui.drafts[FORMS.team] ?? {};
  const memberDraft = ui.drafts[FORMS.members] ?? {};
  /** @type {Map<string, import('./types.js').RosterMember[]>} */
  const byTeam = new Map();
  for (const m of event.roster) byTeam.set(m.teamId, [...(byTeam.get(m.teamId) ?? []), m]);
  /** @param {string} s */
  const hit = (s) => !q || normalizeName(s).includes(q);
  const teams = event.teams.flatMap((team) => {
    const members = byTeam.get(team.id) ?? [];
    const teamHit =
      hit(team.name) || (!!team.translation && hit(team.translation)) || (!!team.patron && hit(team.patron));
    const shown = teamHit ? members : members.filter((m) => hit(m.name));
    if (!teamHit && !shown.length) return [];
    return [
      {
        id: team.id,
        name: team.name,
        translation: team.translation,
        patron: team.patron,
        color: team.color,
        emblem: team.emblem,
        face: faceNote(team.name, lang),
        isNew: event.phase !== 'setup' && team.admittedRound > 0,
        memberCount: members.length,
        members: shown.map((m) => ({ id: m.id, name: m.name, captain: m.captain, teamId: m.teamId })),
        open: teamOpen(local, team.id, event.teams.length, query),
      },
    ];
  });
  const n = event.teams.length;
  const name = teamDraft.name ?? '';
  const performing = event.phase === 'running' && event.roundPhase === 'performances';
  const names = memberDraft.names ?? '';
  return {
    lang,
    phase: event.phase,
    query,
    total: { teams: n, members: event.roster.length },
    teams,
    teamOptions: event.teams.map((tm) => ({ value: tm.id, label: teamName(tm) })),
    canRemoveTeam: event.phase === 'setup',
    add:
      event.phase === 'finished'
        ? null
        : {
            midGame: event.phase === 'running',
            hintKey: event.phase === 'running' ? (performing ? 'hint.midGamePerforming' : 'hint.midGameNext') : '',
            name,
            translation: teamDraft.translation ?? '',
            patron: teamDraft.patron ?? '',
            preview: cleanText(name) ? faceNote(cleanText(name), lang) : null,
            color: teamColor(n),
            emblem: emblemAt(n),
          },
    members: n ? { names, teamId: membersTeam(event, memberDraft.teamId), count: splitNames(names).length } : null,
    gms: event.gms.map((g) => ({ id: g.id, name: g.name, host: g.host })),
    gmName: ui.drafts[FORMS.gm]?.name ?? '',
  };
}

/** @typedef {ReturnType<typeof rosterVm>} RosterVm */

/**
 * A select with extra data attributes (ui.js selectInput has none).
 * @param {{
 *   id: string, options: Array<{ value: string, label: string }>, value?: string|null, action?: string,
 *   label?: string, disabled?: boolean, data?: Record<string, string>, draft?: string,
 * }} o
 */
function select(o) {
  const opts = o.options
    .map((opt) => `<option${attrs({ value: opt.value, selected: opt.value === o.value })}>${esc(opt.label)}</option>`)
    .join('');
  const a = { id: o.id, class: 'larp-input larp-select', 'data-change': o.action, 'data-draft': o.draft };
  return `<select${attrs({ ...a, 'aria-label': o.label, disabled: !!o.disabled, ...o.data })}>${opts}</select>`;
}

/**
 * A checkbox with data attributes and an optional hint under it.
 * @param {{ id: string, label: string, checked: boolean, action: string, data?: Record<string, string>, hint?: string }} o
 */
function check(o) {
  const hintId = o.hint ? `${o.id}-hint` : undefined;
  const a = { type: 'checkbox', id: o.id, class: 'larp-checkbox', checked: o.checked, 'data-change': o.action };
  const input = `<input${attrs({ ...a, 'aria-describedby': hintId, ...o.data })}>`;
  const hint = o.hint ? `<p class="larp-hint" id="${esc(hintId)}">${esc(o.hint)}</p>` : '';
  return `<div class="larp-setup-check"><label class="larp-check" for="${esc(o.id)}">${input}<span>${esc(o.label)}</span></label>${hint}</div>`;
}

/**
 * A labelled text input. `change` commits it through a handler (with `data`); `draft` keeps typing.
 * @param {import('./ui.js').InputOpts & { label: string, hintText?: string, change?: string,
 *   data?: Record<string, string>, disabled?: boolean, fieldCls?: string }} o
 */
function textField({ label: text, hintText, change, data, disabled, fieldCls, ...input }) {
  const a = { 'data-change': change, ...data, disabled: !!disabled, ...input.attrs };
  const control = textInput({ ...input, hint: !!hintText, attrs: a });
  return field({ id: input.id, label: text, hint: hintText, cls: fieldCls, control });
}

/** @param {string} title @param {string} body @param {string} cls @param {string} [extra] */
const panel = (title, body, cls, extra = '') =>
  `<section class="larp-panel ${cls}" aria-label="${esc(title)}"><h2 class="larp-h2">${esc(title)}</h2>${extra}${body}</section>`;

/** @param {{ fallback: boolean, text: string }} note @param {string} [id] */
const faceHint = (note, id) =>
  `<p${attrs({ class: `larp-hint larp-setup-face${note.fallback ? ' is-fallback' : ''}`, id })}>${esc(note.text)}</p>`;

/** @param {string} key @param {Lang} lang */
const hintP = (key, lang) => `<p class="larp-hint">${esc(t(key, lang))}</p>`;

/** A quiet or danger button naming what it acts on for screen readers. @param {string} text @param {string} action @param {string} value @param {string} name @param {'quiet'|'danger'} [variant] */
const namedButton = (text, action, value, name, variant = 'quiet') =>
  button(text, action, { value, variant, attrs: { 'aria-label': `${text} · ${name}` } });

/** The team fields typed in place: field, label key, limit. */
const TEAM_TEXT = /** @type {const} */ ([
  ['name', 'label.name', LIMITS.teamName],
  ['translation', 'label.translation', LIMITS.teamTranslation],
  ['patron', 'label.patron', LIMITS.patron],
]);

/**
 * One team's row: its chip and face note, its fields and its members.
 * @param {RosterVm['teams'][number]} team
 * @param {RosterVm} vm
 */
function renderTeam(team, vm) {
  const { lang } = vm;
  const id = `team-${team.id}`;
  /** @param {string} f */
  const data = (f) => ({ 'data-team': team.id, 'data-field': f });
  const isNew = team.isNew ? `<span class="larp-note">${esc(t('label.newTeam', lang))}</span>` : '';
  const toggle = button(t(team.open ? 'action.hideDetails' : 'action.showDetails', lang), 'roster.toggleTeam', {
    value: team.id,
    variant: 'quiet',
    attrs: { 'aria-expanded': String(team.open), 'aria-controls': `${id}-body` },
  });
  const remove = vm.canRemoveTeam
    ? namedButton(t('action.removeTeam', lang), 'roster.removeTeam', team.id, team.name, 'danger')
    : '';
  const count = esc(label('label.membersN', lang, { n: team.memberCount }));
  const head = `<div class="larp-roster-team-head">${teamChip(team, { sub: true, size: 22 })}${isNew}<span class="larp-roster-count">${count}</span><span class="larp-roster-team-tools">${toggle}${remove}</span></div>${faceHint(team.face)}`;
  if (!team.open) return `<li class="larp-roster-team" id="${esc(id)}">${head}</li>`;
  const texts = TEAM_TEXT.map(([f, key, max]) =>
    textField({
      id: `${id}-${f}`,
      label: t(key, lang),
      value: team[f],
      maxLength: max,
      change: 'roster.editTeam',
      data: data(f),
    }),
  );
  const color = `<input${attrs({ type: 'color', id: `${id}-color`, class: 'larp-setup-color', value: team.color, 'data-change': 'roster.editTeam', ...data('color') })}>`;
  const emblems = EMBLEMS.map((k) => ({ value: k, label: t(`emblem.${k}`, lang) }));
  const fields = [
    ...texts,
    field({ id: `${id}-color`, label: t('label.color', lang), control: color }),
    field({
      id: `${id}-emblem`,
      label: t('label.emblem', lang),
      control: select({
        id: `${id}-emblem`,
        value: team.emblem,
        options: emblems,
        action: 'roster.editTeam',
        data: data('emblem'),
      }),
    }),
  ].join('');
  const members = team.members.length
    ? `<ul class="larp-roster-members">${team.members.map((m) => renderMember(m, vm)).join('')}</ul>`
    : hintP(vm.query.trim() ? 'hint.noMatches' : 'hint.noMembers', lang);
  return `<li class="larp-roster-team" id="${esc(id)}">${head}<div class="larp-roster-team-body" id="${esc(id)}-body"><div class="larp-roster-fields">${fields}</div>${members}</div></li>`;
}

/**
 * A roster member's row: name, captain, move to a team, remove.
 * @param {RosterVm['teams'][number]['members'][number]} m
 * @param {RosterVm} vm
 */
function renderMember(m, vm) {
  const { lang } = vm;
  const id = `m-${m.id}`;
  const data = { 'data-member': m.id };
  const name = textInput({
    id: `${id}-name`,
    value: m.name,
    maxLength: LIMITS.memberName,
    attrs: { ...data, 'data-change': 'roster.editMember', 'aria-label': `${t('label.name', lang)} · ${m.name}` },
  });
  const captain = check({
    id: `${id}-captain`,
    label: t('role.captain', lang),
    checked: m.captain,
    action: 'roster.captain',
    data,
  });
  const move = select({
    id: `${id}-team`,
    value: m.teamId,
    options: vm.teamOptions,
    action: 'roster.moveMember',
    label: `${t('label.moveTo', lang)} · ${m.name}`,
    data,
  });
  const remove = namedButton(t('action.remove', lang), 'roster.removeMember', m.id, m.name);
  return `<li class="larp-roster-member">${name}${captain}${move}${remove}</li>`;
}

/** @param {RosterVm} vm */
function renderAddTeam(vm) {
  const { lang, add } = vm;
  if (!add) return '';
  const preview = add.preview
    ? `<div class="larp-setup-preview" aria-live="polite">${teamChip({ name: add.name.trim(), translation: add.translation.trim(), color: add.color, emblem: add.emblem }, { sub: true, size: 22 })}${faceHint(add.preview, 'add-team-face')}</div>`
    : '';
  const examples = { name: 'Đội Phaolô', translation: 'Team Paul', patron: 'Thánh Phaolô' };
  const fields = TEAM_TEXT.map(([f, key, max]) =>
    textField({
      id: `add-team-${f}`,
      label: t(key, lang),
      draft: `${FORMS.team}.${f}`,
      value: add[f],
      maxLength: max,
      live: f !== 'patron',
      lang: f === 'translation' ? 'en' : undefined,
      placeholder: examples[f],
      attrs: { 'aria-describedby': f === 'name' && add.preview ? 'add-team-face' : undefined },
    }),
  ).join('');
  const hint = add.hintKey ? hintP(add.hintKey, lang) : '';
  const go = button(t(add.midGame ? 'action.addLateTeam' : 'action.addTeam', lang), 'roster.addTeam', {
    variant: 'secondary', // the top bar's next action is the console's one primary button (U04)
    focus: 'add-team',
  });
  const body = `${hint}<div class="larp-setup-form">${fields}</div>${preview}${go}`;
  return panel(t(add.midGame ? 'label.lateTeam' : 'action.addTeam', lang), body, 'larp-roster-add');
}

/** @param {RosterVm} vm */
function renderPaste(vm) {
  const { lang, members } = vm;
  if (!members) return '';
  const names = textArea({
    id: 'paste-names',
    draft: `${FORMS.members}.names`,
    value: members.names,
    rows: 6,
    hint: true,
    placeholder: 'Maria Nguyễn\nGiuse Trần',
  });
  const team = select({
    id: 'paste-team',
    value: members.teamId,
    options: vm.teamOptions,
    draft: `${FORMS.members}.teamId`,
  });
  const body = [
    field({
      id: 'paste-names',
      label: t('label.namesOnePerLine', lang),
      hint: t('hint.namesOnePerLine', lang),
      control: names,
    }),
    field({ id: 'paste-team', label: t('label.team', lang), control: team }),
    button(t('action.addMembers', lang), 'roster.addMembers', { variant: 'secondary', focus: 'add-members' }),
  ].join('');
  return panel(t('label.roster', lang), `<div class="larp-setup-form">${body}</div>`, 'larp-roster-paste');
}

/** @param {RosterVm} vm */
function renderGms(vm) {
  const { lang } = vm;
  const rows = vm.gms
    .map((g) => {
      const aria = `${t('label.name', lang)} · ${g.name}`;
      const a = { 'data-change': 'roster.editGm', 'data-gm': g.id, 'aria-label': aria };
      const name = textInput({ id: `gm-${g.id}-name`, value: g.name, maxLength: LIMITS.gmName, attrs: a });
      const role = `<span class="larp-note">${esc(t(g.host ? 'role.host' : 'role.coGm', lang))}</span>`;
      const remove = g.host ? '' : namedButton(t('action.remove', lang), 'roster.removeGm', g.id, g.name);
      return `<li class="larp-roster-gm">${name}${role}${remove}</li>`;
    })
    .join('');
  const input = textInput({
    id: 'add-gm-name',
    draft: `${FORMS.gm}.name`,
    value: vm.gmName,
    maxLength: LIMITS.gmName,
    placeholder: 'Anh B.',
    attrs: { 'aria-label': t('label.name', lang) },
  });
  const add = `<div class="larp-setup-inline">${input}${button(t('action.addGm', lang), 'roster.addGm', { focus: 'add-gm' })}</div>`;
  const body = `${hintP('hint.coGms', lang)}<ul class="larp-roster-gms-list">${rows}</ul>${add}`;
  return panel(t('label.coGms', lang), body, 'larp-roster-gms');
}

/**
 * The Teams & Roster tab's markup (pure).
 * @param {RosterVm} vm
 * @returns {string}
 */
export function renderRoster(vm) {
  const { lang } = vm;
  const find = t('label.search', lang);
  const search = vm.total.teams
    ? `<div class="larp-roster-search">${textInput({ id: 'roster-search', draft: `${FORMS.search}.query`, value: vm.query, live: true, attrs: { type: 'search', 'aria-label': find, placeholder: find } })}</div>`
    : '';
  const total = `${label('label.teamsN', lang, { n: vm.total.teams })} · ${label('label.membersN', lang, { n: vm.total.members })}`;
  const list = vm.teams.length
    ? `<ul class="larp-roster-teams-list">${vm.teams.map((tm) => renderTeam(tm, vm)).join('')}</ul>`
    : hintP(vm.total.teams ? 'hint.noMatches' : 'hint.noTeamsYet', lang);
  const teams = panel(
    t('label.teams', lang),
    `${search}${list}`,
    'larp-roster-teams',
    `<p class="larp-hint larp-roster-total">${esc(total)}</p>`,
  );
  return `<div class="larp-roster">${teams}<div class="larp-roster-side">${renderAddTeam(vm)}${renderPaste(vm)}${renderGms(vm)}</div></div>`;
}

/**
 * The Teams & Roster handlers. Every change is a command from the host.
 * @param {App} app
 * @param {UiStore} ui
 * @param {HostEnv} env
 * @returns {Handlers}
 */
export function rosterActions(app, ui, env) {
  /** @param {any} type @param {any} payload */
  const dispatch = (type, payload) => env.report(app.dispatch(type, payload));
  /** @param {ErrorCode} code */
  const refuse = (code) => env.report({ ok: false, error: larpError(code), duplicate: false, events: [] });
  /** @param {string|undefined} id */
  const member = (id) => app.getEvent()?.roster.find((m) => m.id === id);
  return {
    'roster.addTeam': () => {
      const event = app.getEvent();
      if (!event) return;
      if (dispatch(event.phase === 'setup' ? 'addTeam' : 'addTeamMidGame', teamInput(ui.draft(FORMS.team)))) {
        ui.clearDraft(FORMS.team);
      }
    },
    'roster.editTeam': ({ el, value }) => {
      const teamId = el?.dataset?.team;
      const key = /** @type {any} */ (el?.dataset?.field);
      if (teamId && TEAM_FIELDS.includes(key)) dispatch('editTeam', { teamId, [key]: value ?? '' });
    },
    'roster.removeTeam': ({ value, confirmed }) => {
      const event = app.getEvent();
      const team = event?.teams.find((tm) => tm.id === value);
      if (!team) return;
      const n = event.roster.filter((m) => m.teamId === team.id).length;
      if (n && !confirmed) {
        env.confirm({
          action: 'roster.removeTeam',
          value: team.id,
          hintKey: 'hint.confirmRemoveTeam',
          labelKey: 'action.removeTeam',
          vars: { team: team.name, n },
        });
        return;
      }
      dispatch('removeTeam', { teamId: team.id });
    },
    'roster.toggleTeam': ({ value }) => {
      const event = app.getEvent();
      if (!event || !value) return;
      const local = ui.get().local.roster ?? {};
      const query = ui.draft(FORMS.search).query ?? '';
      const open = local.open && typeof local.open === 'object' ? local.open : {};
      ui.setLocal('roster', { open: { ...open, [value]: !teamOpen(local, value, event.teams.length, query) } });
    },
    'roster.addMembers': () => {
      const event = app.getEvent();
      const d = ui.draft(FORMS.members);
      const teamId = event && membersTeam(event, d.teamId);
      if (!teamId) return;
      const names = splitNames(d.names ?? '');
      if (!names.length) {
        refuse('invalid_name');
        return;
      }
      if (dispatch('addMembers', { names, teamId })) {
        ui.clearDraft(FORMS.members);
        ui.setDraft(FORMS.members, 'teamId', teamId);
      }
    },
    'roster.editMember': ({ el, value }) => {
      const m = member(el?.dataset?.member);
      if (m) dispatch('editMember', { memberId: m.id, name: value ?? '' });
    },
    'roster.moveMember': ({ el, value }) => {
      const m = member(el?.dataset?.member);
      // A captain leaving keeps one captain per team: the flag stays behind.
      if (m && value && value !== m.teamId) {
        dispatch('editMember', { memberId: m.id, teamId: value, ...(m.captain ? { captain: false } : {}) });
      }
    },
    'roster.captain': ({ el, value }) => {
      const m = member(el?.dataset?.member);
      if (!m) return;
      const on = value === 'true';
      if (on) {
        for (const other of app.getEvent().roster) {
          if (other.teamId === m.teamId && other.captain && other.id !== m.id) {
            dispatch('editMember', { memberId: other.id, captain: false });
          }
        }
      }
      dispatch('editMember', { memberId: m.id, captain: on });
    },
    'roster.removeMember': ({ value }) => {
      if (member(value)) dispatch('removeMember', { memberId: value });
    },
    'roster.addGm': () => {
      if (dispatch('addGm', { name: ui.draft(FORMS.gm).name ?? '' })) ui.clearDraft(FORMS.gm);
    },
    'roster.editGm': ({ el, value }) => {
      const gmId = el?.dataset?.gm;
      if (gmId) dispatch('editGm', { gmId, name: value ?? '' });
    },
    'roster.removeGm': ({ value }) => {
      if (value) dispatch('removeGm', { gmId: value });
    },
  };
}

// ── Setup ───────────────────────────────────────────────────────────────────────────────────

/** @param {unknown} s @returns {s is BackupSummary} */
const isSummary = (s) => {
  const o = /** @type {any} */ (s);
  return !!o && typeof o === 'object' && Number.isFinite(o.teams) && Number.isFinite(o.roundsPublished);
};

/** A round's allowances: field and label key. */
const ROUND_DURATIONS = /** @type {const} */ ([
  ['prepMs', 'label.prepTime'],
  ['turnMs', 'label.turnTime'],
  ['transitionMs', 'label.transitionTime'],
  ['reviewRevealMs', 'label.reviewReveal'],
]);

/** The estimate's fixed segments (settings): field and label key. */
const SEGMENTS = /** @type {const} */ ([
  ['openingMs', 'label.opening'],
  ['finaleMs', 'label.finale'],
  ['bufferMs', 'label.buffer'],
  ['targetMs', 'label.target'],
]);

/**
 * The Setup tab's view model (pure).
 * @param {ScreenCtx} ctx
 */
export function setupVm(ctx) {
  const { event, ui, lang, link } = ctx;
  const local = ui.local.setup ?? {};
  const { config } = event;
  const est = estimate({ ...config, rounds: event.rounds }, event.teams.length);
  const running = event.phase === 'running';
  const finished = event.phase === 'finished';
  const rounds = event.rounds.map((r, i) => {
    const started = running && (i <= event.roundIndex || r.skipped || event.results.some((x) => x.roundId === r.id));
    const locked = finished || started;
    return {
      id: r.id,
      n: i + 1,
      name: t(`round.${r.category}`, lang),
      prompt: r.prompt,
      promptTranslation: r.promptTranslation,
      base: String(r.base),
      durations: Object.fromEntries(ROUND_DURATIONS.map(([f]) => [f, formatClock(r[f])])),
      estimate: formatClock(est.perRound[i]?.ms ?? 0),
      skipped: r.skipped,
      locked,
      baseLocked: locked || running,
      lockKey: finished ? 'error.locked' : started ? 'hint.roundStarted' : running ? 'hint.baseLocked' : '',
    };
  });
  const vars = { total: formatClock(est.totalMs), over: formatClock(est.overrunMs), target: formatClock(est.targetMs) };
  const summary = isSummary(local.importSummary) ? local.importSummary : null;
  return {
    lang,
    phase: event.phase,
    config: { ...config, hostPin: config.hostPin ?? '' },
    estimate: {
      overrun: est.overrunMs > 0,
      text: label(est.overrunMs > 0 ? 'hint.estimateOver' : 'hint.estimateWithin', lang, vars),
      teams: label('hint.estimateTeams', lang, { n: event.teams.length }),
      total: vars.total,
      segments: Object.fromEntries(SEGMENTS.map(([f]) => [f, formatClock(config[f])])),
    },
    rounds,
    importSummary: summary
      ? {
          title: String(summary.title ?? ''),
          text: label('hint.importSummary', lang, { teams: summary.teams, published: summary.roundsPublished }),
        }
      : null,
    offline: offlineChecklist(/** @type {OfflineProbe} */ (local.offline), link, lang),
  };
}

/** @typedef {ReturnType<typeof setupVm>} SetupVm */

/** @param {string} key @param {string} kind */
const cfg = (key, kind) => ({ 'data-field': key, 'data-kind': kind });

/** @param {SetupVm} vm */
function renderGeneral(vm) {
  const { lang, config } = vm;
  const langs = ['vi', 'en'].map((l) => ({ value: l, label: t(`mode.${l}`, lang) }));
  const host = select({
    id: 'setup-host-lang',
    value: config.hostLang,
    options: langs,
    action: 'setup.config',
    data: cfg('hostLang', 'text'),
  });
  const body = [
    textField({
      id: 'setup-title',
      label: t('label.eventTitle', lang),
      value: config.title,
      maxLength: 80,
      change: 'setup.config',
      data: cfg('title', 'text'),
    }),
    field({ id: 'setup-host-lang', label: t('label.hostLanguage', lang), control: host }),
  ].join('');
  return panel(t('label.eventDetails', lang), `<div class="larp-setup-form">${body}</div>`, 'larp-setup-general');
}

/** @param {SetupVm} vm */
function renderSchedule(vm) {
  const { lang, estimate: est } = vm;
  /** @param {string} name @param {string} value */
  const row = (name, value) => `<tr><th scope="row">${esc(name)}</th><td>${esc(value)}</td></tr>`;
  const rounds = vm.rounds.map((r) =>
    row(`${label('label.roundN', lang, { n: r.n })} · ${r.name}`, r.skipped ? t('status.skipped', lang) : r.estimate),
  );
  const [opening, finale, buffer] = SEGMENTS.map(([f, key]) => row(t(key, lang), est.segments[f]));
  const table = `<table class="larp-setup-est"><tbody>${opening}${rounds.join('')}${finale}${buffer}</tbody><tfoot>${row(t('label.estimate', lang), est.total)}</tfoot></table>`;
  const status = `<p class="larp-setup-est-text${est.overrun ? ' is-over' : ''}" role="status">${esc(est.text)}</p><p class="larp-hint">${esc(est.teams)}</p>`;
  const segs = SEGMENTS.map(([f, key]) =>
    textField({
      id: `setup-${f}`,
      label: t(key, lang),
      value: est.segments[f],
      change: 'setup.config',
      data: cfg(f, 'duration'),
      fieldCls: 'larp-setup-dur',
      disabled: vm.phase === 'finished',
    }),
  ).join('');
  return panel(
    t('label.schedule', lang),
    `${status}${table}<div class="larp-setup-durs">${segs}</div>`,
    'larp-setup-schedule',
  );
}

/** @param {SetupVm['rounds'][number]} r @param {Lang} lang */
function renderRound(r, lang) {
  const id = `round-${r.id}`;
  /** @param {string} f @param {string} kind */
  const data = (f, kind) => ({ 'data-round': r.id, ...cfg(f, kind) });
  const change = 'setup.round';
  const prompt = textArea({
    id: `${id}-prompt`,
    value: r.prompt,
    rows: 2,
    maxLength: LIMITS.prompt,
    attrs: { 'data-change': change, ...data('prompt', 'text'), disabled: r.locked },
  });
  const durs = ROUND_DURATIONS.map(([f, key]) =>
    textField({
      id: `${id}-${f}`,
      label: t(key, lang),
      value: r.durations[f],
      change,
      data: data(f, 'duration'),
      disabled: r.locked,
      fieldCls: 'larp-setup-dur',
    }),
  );
  const base = textField({
    id: `${id}-base`,
    label: t('label.basePoints', lang),
    value: r.base,
    change,
    data: data('base', 'points'),
    disabled: r.baseLocked,
    fieldCls: 'larp-setup-dur',
  });
  const body = [
    r.lockKey ? hintP(r.lockKey, lang) : '',
    field({ id: `${id}-prompt`, label: t('label.prompt', lang), control: prompt }),
    textField({
      id: `${id}-promptTranslation`,
      label: t('label.translation', lang),
      value: r.promptTranslation,
      maxLength: LIMITS.prompt,
      change,
      data: data('promptTranslation', 'text'),
      disabled: r.locked,
    }),
    `<div class="larp-setup-durs">${base}${durs.join('')}</div>`,
  ].join('');
  const skipped = r.skipped ? ` <span class="larp-note">${esc(t('status.skipped', lang))}</span>` : '';
  const title = `${label('label.roundN', lang, { n: r.n })} · ${r.name}`;
  const est = `<span class="larp-setup-round-est">${esc(`${t('label.estimate', lang)} ${r.estimate}`)}</span>`;
  return `<fieldset class="larp-setup-round" id="${esc(id)}"><legend>${esc(title)}${skipped} ${est}</legend>${body}</fieldset>`;
}

/** @param {SetupVm} vm */
function renderRounds(vm) {
  const body = `${hintP('hint.duration', vm.lang)}${vm.rounds.map((r) => renderRound(r, vm.lang)).join('')}`;
  return panel(t('label.rounds', vm.lang), body, 'larp-setup-rounds');
}

/** The display's switches: setting, label key, hint key. */
const DISPLAY_SWITCHES = /** @type {const} */ ([
  ['reducedMotion', 'label.reducedMotion', 'hint.reducedMotion'],
  ['sound', 'label.sound', 'hint.sound'],
  ['showMembers', 'label.showMembers', 'hint.showMembers'],
]);

/** @param {SetupVm} vm */
function renderDisplaySettings(vm) {
  const { lang, config } = vm;
  /** @param {string} key @param {string} labelKey @param {readonly string[]} values @param {string} prefix */
  const choice = (key, labelKey, values, prefix) =>
    field({
      id: `setup-${key}`,
      label: t(labelKey, lang),
      control: select({
        id: `setup-${key}`,
        value: config[key],
        options: values.map((v) => ({ value: v, label: t(`${prefix}.${v}`, lang) })),
        action: 'setup.config',
        data: cfg(key, 'text'),
      }),
    });
  const switches = DISPLAY_SWITCHES.map(([key, labelKey, hintKey]) =>
    check({
      id: `setup-${key}`,
      label: t(labelKey, lang),
      checked: config[key],
      action: 'setup.config',
      data: cfg(key, 'bool'),
      hint: t(hintKey, lang),
    }),
  );
  const body = [
    choice('displayMode', 'label.language', DISPLAY_MODES, 'mode'),
    choice('scenery', 'label.scenery', SCENERY_KEYS, 'scenery'),
    ...switches,
    textField({
      id: 'setup-hostPin',
      label: t('label.hostPin', lang),
      hintText: t('hint.hostPin', lang),
      value: config.hostPin,
      maxLength: 12,
      change: 'setup.config',
      // Masked: a co-GM glancing at Setup (or a taken-over tab) doesn't read it off the screen.
      data: { ...cfg('hostPin', 'pin'), type: 'password', autocomplete: 'off', inputmode: 'numeric' },
    }),
  ].join('');
  return panel(t('label.display', lang), `<div class="larp-setup-form">${body}</div>`, 'larp-setup-display');
}

/** @param {string} title @param {string} body */
const group = (title, body) =>
  `<div class="larp-setup-group">${title ? `<h3 class="larp-setup-h3">${esc(title)}</h3>` : ''}${body}</div>`;

/** @param {SetupVm} vm */
function renderData(vm) {
  const { lang, importSummary: sum } = vm;
  const input = `<input${attrs({ type: 'file', class: 'visually-hidden', accept: '.json,application/json', 'data-change': 'setup.importFile', 'data-focus': 'import-file' })}>`;
  const file = `<label class="larp-btn larp-btn-secondary larp-setup-file">${input}<span class="larp-btn-label">${esc(t('action.chooseBackup', lang))}</span></label>`;
  const confirm = button(t('action.importBackup', lang), 'setup.importConfirm', {
    variant: 'danger',
    focus: 'import-confirm',
  });
  const cancel = button(t('action.cancel', lang), 'setup.importCancel', { variant: 'quiet' });
  const pending = sum
    ? `<div class="larp-setup-import" role="status"><p><strong>${esc(sum.title)}</strong></p><p>${esc(sum.text)}</p><div class="larp-setup-inline">${confirm}${cancel}</div></div>`
    : '';
  const exports = [
    button(t('action.exportBackup', lang), 'exportBackup'),
    button(t('action.exportResultsCsv', lang), 'setup.exportResults'),
    file,
  ].join('');
  const body = [
    group(
      t('label.awardCards', lang),
      `${hintP('hint.awardCards', lang)}${button(t('action.printCards', lang), 'setup.printCards')}`,
    ),
    group(t('label.data', lang), `<div class="larp-setup-inline">${exports}</div>${pending}`),
    group(
      '',
      `${hintP('hint.deleteData', lang)}${button(t('action.deleteEventData', lang), 'setup.deleteData', { variant: 'danger' })}`,
    ),
  ].join('');
  return panel(t('label.cardsAndData', lang), body, 'larp-setup-data');
}

/** @param {SetupVm} vm */
function renderOffline(vm) {
  const { lang, offline } = vm;
  const items = offline.items
    .map((item) => {
      const state = item.ok === null ? 'unknown' : item.ok ? 'ready' : 'missing';
      const mark = item.ok === null ? '·' : item.ok ? '✓' : '✗';
      return `<li class="larp-setup-offline-item is-${state}"><span class="larp-setup-mark" aria-hidden="true">${mark}</span><span>${esc(item.label)}</span><span class="larp-setup-status">${esc(item.status)}</span></li>`;
    })
    .join('');
  const go = button(t(offline.checked ? 'action.checkAgain' : 'action.readyOffline', lang), 'setup.checkOffline', {
    focus: 'check-offline',
  });
  const sum = `<p class="larp-setup-offline-sum${offline.ready ? ' is-ready' : ''}" role="status">${esc(offline.summary)}</p>`;
  const body = `${sum}<ul class="larp-setup-offline">${items}</ul>${hintP('hint.offlineKeepOpen', lang)}${go}`;
  return panel(t('action.readyOffline', lang), body, 'larp-setup-offline-panel');
}

/**
 * The Setup tab's markup (pure).
 * @param {SetupVm} vm
 * @returns {string}
 */
export function renderSetup(vm) {
  return `<div class="larp-setup"><div class="larp-setup-main">${renderSchedule(vm)}${renderRounds(vm)}</div><div class="larp-setup-side">${renderGeneral(vm)}${renderDisplaySettings(vm)}${renderData(vm)}${renderOffline(vm)}</div></div>`;
}

// Award Cards and the thin browser layer live in hostSetupIo.js (re-exported here).

/**
 * What setupActions needs from the browser.
 * @typedef {{
 *   readFile: (el: any) => Promise<string|null>,
 *   openPrint: (html: string) => boolean,
 *   probe: () => Promise<OfflineProbe>,
 * }} SetupDeps
 */

/** @type {SetupDeps} */
const BROWSER_DEPS = { readFile: readFileText, openPrint: (html) => openPrint(html), probe: () => probeOffline() };

/**
 * The Setup handlers.
 * @param {App} app
 * @param {UiStore} ui
 * @param {HostEnv} env
 * @param {SetupDeps} [deps]
 * @returns {Handlers}
 */
export function setupActions(app, ui, env, deps = BROWSER_DEPS) {
  /** @param {ErrorCode} code */
  const refuse = (code) => env.report({ ok: false, error: larpError(code), duplicate: false, events: [] });
  const clearImport = () => ui.setLocal('setup', { importText: null, importSummary: null });
  /** @param {string} key */
  const info = (key) => ui.set({ flash: { kind: 'info', key } });
  return {
    'setup.config': ({ el, value }) => {
      const key = el?.dataset?.field;
      if (!key) return;
      const r = fieldValue(el.dataset.kind, value);
      if ('code' in r) refuse(r.code);
      else env.report(app.dispatch('setConfig', { [key]: r.value }));
    },
    'setup.round': ({ el, value }) => {
      const roundId = el?.dataset?.round;
      const key = el?.dataset?.field;
      if (!roundId || !key) return;
      const r = fieldValue(el.dataset.kind, value);
      if ('code' in r) refuse(r.code);
      else env.report(app.dispatch('editRound', { roundId, [key]: r.value }));
    },
    'setup.printCards': () => {
      const event = app.getEvent();
      if (event && !deps.openPrint(awardCardsHtml(event, event.config.hostLang))) {
        ui.set({ flash: { kind: 'error', key: 'hint.popupBlocked' } });
      }
    },
    'setup.exportResults': () => env.download(resultsFileName(env.now()), app.exportResultsCsv(), 'text/csv'),
    'setup.importFile': async ({ el }) => {
      const text = await deps.readFile(el);
      if (text === null) return;
      const r = app.readBackup(text);
      if (r.ok) ui.setLocal('setup', { importText: text, importSummary: r.summary });
      else refuse('reason' in r ? r.reason : 'bad_backup');
    },
    'setup.importConfirm': ({ confirmed }) => {
      const text = ui.get().local.setup?.importText;
      if (typeof text !== 'string') return;
      if (!confirmed) {
        env.confirm({ action: 'setup.importConfirm', hintKey: 'hint.confirmImport', labelKey: 'action.importBackup' });
        return;
      }
      const r = app.readBackup(text);
      clearImport();
      if (!r.ok) {
        refuse('reason' in r ? r.reason : 'bad_backup');
        return;
      }
      app.replaceEvent(r.event);
      info('hint.imported');
    },
    'setup.importCancel': clearImport,
    'setup.deleteData': ({ confirmed }) => {
      if (!confirmed) {
        env.confirm({ action: 'setup.deleteData', hintKey: 'hint.confirmDelete', labelKey: 'action.deleteEventData' });
        return;
      }
      app.deleteEventData();
      clearImport();
      info('hint.deleted');
    },
    'setup.checkOffline': async () => {
      const probe = await deps.probe();
      ui.setLocal('setup', { offline: { ...probe, at: env.now() } });
    },
  };
}

/** @type {Screen} */
export const setupTab = {
  id: 'setup',
  labelKey: 'tab.setup',
  vm: setupVm,
  render: renderSetup,
  actions: (app, ui, env) => setupActions(app, ui, env),
};

/** @type {Screen} */
export const rosterTab = {
  id: 'roster',
  labelKey: 'tab.roster',
  vm: rosterVm,
  render: renderRoster,
  actions: rosterActions,
};
