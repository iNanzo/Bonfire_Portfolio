// The shared display (/larp/#/display, the design's Shared Display): the stage, not a dashboard.
// One focus per phase over the bonfire, in fixed zones that leave the fire visible in the middle
// third: Welcome (the teams and their emblems, members paged), Briefing (the round card),
// Preparation (the prompt and the timer), Performances (the performing team and the time left, big;
// the next team small), Review (a calm "HTs are reviewing" card), Reveal (the banners), Results
// (the standings, paged), Finished (final standings and the leading individuals). It renders ONLY
// the public projection it is sent (channel.js); never drafts, notes, authors or host controls.
// The same markup fills the host's Preview Display frame (host.js), so it must not depend on the
// window. Owner: the display screen. Styles: css/display.css (scoped under .larp-display).
//
//   displayVm(projection, opts) → vm      pure (pieces in displayView.js)
//   renderDisplay(vm) → string             pure: a .larp-display-zones root and its zones, each
//                                          with data-zone and data-key (displayDom.js replaces a
//                                          zone, and replays its entrance, only when its key changes)
//   pageKeyOf(projection, testPattern)     which automatically paged view is up (paging restarts
//                                          when it changes; displayDom.js tracks since when)
//   displayActions(env)                    Full Screen and Close (the window's only controls)
//   displayDom.js mountDisplay(root, deps) the window: the link, the scene (stage.js), the tick
/**
 * @typedef {import('./types.js').Projection} Projection
 * @typedef {import('./types.js').DisplayMode} DisplayMode
 * @typedef {import('./displayView.js').Pair} Pair
 * @typedef {import('./displayView.js').TeamVm} TeamVm
 */
import { esc } from '../html.js';
import { ROUND_CATEGORIES } from './types.js';
import { bilingual, formatNumber, t } from './strings.js';
import { bilingualLines, button, emblem, faceText, points, teamChip } from './ui.js';
import {
  docLang,
  leadersVm,
  pairOf,
  revealVm,
  standingsVm,
  teamVm,
  timerVm,
  unitLang,
  welcomeVm,
} from './displayView.js';

/** The test pattern's sample timer (1:12, as in the design's sketch). */
const SAMPLE_TIMER = Object.freeze({
  kind: 'turn',
  status: 'paused',
  durationMs: 90_000,
  deadline: null,
  remainingMs: 72_000,
});

/**
 * Which screen a projection puts up.
 * @param {Projection|null} p
 * @param {boolean} testPattern
 * @returns {'waiting'|'test'|'welcome'|'briefing'|'preparation'|'performances'|'review'|'reveal'|'results'|'finished'}
 */
function sceneOf(p, testPattern) {
  if (testPattern) return 'test';
  if (!p) return 'waiting';
  if (p.phase === 'finished') return 'finished';
  if (p.phase === 'setup' || p.roundIndex < 0 || !p.roundPhase) return 'welcome';
  if (p.roundPhase === 'reveal') {
    const r = revealVm(p);
    return r && r.kind !== 'standings' ? 'reveal' : 'results';
  }
  return p.roundPhase;
}

/**
 * The automatically paged view a projection shows (null when nothing pages): the standings of a
 * round (the reveal's last step and Results share it), Welcome, the final standings, the test.
 * @param {Projection|null} p
 * @param {boolean} [testPattern]
 * @returns {string|null}
 */
export function pageKeyOf(p, testPattern = false) {
  const scene = sceneOf(p, testPattern);
  if (scene === 'results') return `standings:${p?.round?.id ?? p?.reveal?.roundId ?? ''}`;
  if (scene === 'welcome' || scene === 'finished' || scene === 'test') return scene;
  return null;
}

/**
 * The display's view model (pure). `hostClosed` shows the small chip; `testPattern` the host's
 * Show Test Pattern; `preview` marks the host's small frame (no Full Screen or Close); `since`
 * is when the current paged view began (pageKeyOf; defaults to the projection's time).
 * @param {Projection|null} projection
 * @param {{ now: number, preview?: boolean, hostClosed?: boolean, testPattern?: boolean, since?: number }} opts
 */
export function displayVm(projection, { now, preview = false, hostClosed = false, testPattern = false, since }) {
  const p = projection;
  const mode = p?.config.displayMode ?? 'bilingual';
  const lang = docLang(mode);
  const scene = sceneOf(p, testPattern);
  const isDefaultTitle = !p || p.config.title === t('app.title', 'vi');
  return {
    now,
    preview,
    hostClosed,
    testPattern,
    waiting: !p,
    mode,
    lang,
    scene,
    reducedMotion: !!p?.config.reducedMotion,
    title: isDefaultTitle ? pairOf('app.title') : { vi: p?.config.title ?? '', en: '' },
    ...roundPart(p, scene, now),
    ...contentPart(p, scene, { now, since: since ?? p?.now ?? now, mode }),
    test: scene === 'test' ? testPart(now) : null,
    hostClosedText: t('label.hostClosed', mode),
    controls: preview ? null : { fullScreen: t('action.fullScreen', lang), close: t('action.close', lang) },
  };
}

/** "Vòng 1 · Khám Phá Đức Tin" / "Round 1 · Faith Discovery". @param {number} index @param {string} vi @param {string} en */
const roundHeading = (index, vi, en) => ({
  vi: `${t('label.round', 'vi')} ${index + 1} · ${vi}`,
  en: `${t('label.round', 'en')} ${index + 1} · ${en}`,
});

/**
 * The round card's prompt in both languages. A prompt the host typed is shown as entered (as the
 * Vietnamese line) with its translation; the round's default prompt is English, so it takes the
 * English line, with the translation typed for it or the built-in Vietnamese one (so Vietnamese
 * only shows Vietnamese).
 * @param {NonNullable<Projection['round']>} round
 * @returns {Pair}
 */
export function promptPair(round) {
  const category = ROUND_CATEGORIES.find((c) => c.key === round.category);
  if (!category || round.prompt !== category.prompt) return { vi: round.prompt, en: round.promptTranslation };
  return { vi: round.promptTranslation || t(`hint.defaultPrompt.${category.key}`, 'vi'), en: round.prompt };
}

/** Scenes that name their phase in the title band (the others say it in their own panel). */
const PHASE_IN_TITLE = new Set(['briefing', 'review', 'reveal']);

/**
 * The round's part of the view: its heading, flame, calm flag, prompt and timer.
 * @param {Projection|null} p
 * @param {ReturnType<typeof sceneOf>} scene
 * @param {number} now
 */
function roundPart(p, scene, now) {
  const round = p && !['welcome', 'finished', 'waiting', 'test'].includes(scene) ? p.round : null;
  const calm = !!round?.calm;
  const timed = !!round && (scene === 'preparation' || scene === 'performances') && p?.timer.kind !== null;
  return {
    calm,
    flame: round ? round.flame : 'gilded',
    round: round ? roundHeading(round.index, round.vi, round.en) : null,
    roundKey: round ? round.id : '',
    phase: round && p?.roundPhase && PHASE_IN_TITLE.has(scene) ? pairOf(`phase.${p.roundPhase}`) : null,
    prompt: round ? promptPair(round) : null,
    timer: timed && p ? timerVm(p.timer, now, { calm }) : null,
  };
}

/**
 * What the scene shows besides the round: teams, the reveal, the standings, the leaders.
 * @param {Projection|null} p
 * @param {ReturnType<typeof sceneOf>} scene
 * @param {{ now: number, since: number, mode: DisplayMode }} o
 */
function contentPart(p, scene, { now, since, mode }) {
  const empty = { performer: null, next: null, welcome: null, reveal: null, standings: null, leaders: [] };
  if (!p) return empty;
  const standings = scene === 'results' || scene === 'finished';
  return {
    performer: scene === 'performances' ? teamVm(p, p.currentTeamId) : null,
    next: scene === 'performances' || scene === 'briefing' ? teamVm(p, p.nextTeamId) : null,
    welcome: scene === 'welcome' ? welcomeVm(p, { now, since }) : null,
    reveal: scene === 'reveal' ? revealVm(p) : null,
    standings: standings ? standingsVm(p, { now, since, mode }) : null,
    leaders: scene === 'finished' ? leadersVm(p, mode) : [],
  };
}

/** The test pattern: a round title, a banner and a timer, to check from the back of the room. @param {number} now */
function testPart(now) {
  return {
    round: roundHeading(3, t('round.skit', 'vi'), t('round.skit', 'en')),
    team: {
      name: t('label.sampleTeam', 'vi'),
      translation: t('label.sampleTeam', 'en'),
      color: '#e8b04a',
      emblem: /** @type {const} */ ('shield'),
    },
    award: pairOf('label.sampleAward'),
    timer: timerVm(SAMPLE_TIMER, now),
  };
}

/** @typedef {ReturnType<typeof displayVm>} DisplayVm */

/**
 * The window's controls (Full Screen, and Close shown on hover); displayDom.js binds them.
 * @param {{ fullscreen: () => void, close: () => void }} env
 */
export function displayActions(env) {
  return {
    'display.fullscreen': () => env.fullscreen(),
    'display.close': () => env.close(),
  };
}

// ── Markup ──────────────────────────────────────────────────────────────────────────────────

/** @param {Pair} pair @param {DisplayMode} mode */
const joined = (pair, mode) => bilingual(pair.vi, pair.en, mode);

/** @param {Pair} pair @param {DisplayMode} mode @param {string} [cls] */
const lines = (pair, mode, cls = '') => bilingualLines(pair.vi, pair.en, mode, { cls });

/**
 * One zone: a fixed place on the screen; `key` changes when what it shows is new (an entrance).
 * @param {string} zone
 * @param {string} key
 * @param {string} inner
 * @param {string} [extra] more classes
 */
const zoneOf = (zone, key, inner, extra = '') =>
  inner
    ? `<div class="larp-dz larp-dz-${zone}${extra ? ' ' + extra : ''}" data-zone="${zone}" data-key="${esc(key)}">${inner}</div>`
    : '';

/** A small label over a block, in the display's languages. @param {Pair} pair @param {DisplayMode} mode */
const kicker = (pair, mode) => `<p class="larp-dkicker">${esc(joined(pair, mode))}</p>`;

/** @param {DisplayVm} vm @param {TeamVm|null} team */
const newChip = (vm, team) =>
  team?.isNew ? `<span class="larp-dchip larp-dchip-new">${esc(t('label.newTeam', vm.mode))}</span>` : '';

/**
 * A team's name in both its forms (the Vietnamese name in Inter, the English one in Cinzel) with
 * its emblem in its color.
 * @param {DisplayVm} vm
 * @param {Pick<TeamVm, 'name'|'translation'|'color'|'emblem'>} team
 * @param {string} cls
 * @param {number} size the emblem's attribute size (CSS scales it)
 */
function teamBlock(vm, team, cls, size) {
  const emb = emblem(team.emblem, { color: team.color, size, label: t(`emblem.${team.emblem}`, vm.lang) });
  return `<div class="${cls}">${emb}${bilingualLines(team.name, team.translation, vm.mode, { cls: `${cls}-name` })}</div>`;
}

/** @param {DisplayVm} vm @param {ReturnType<typeof timerVm>} timer */
function renderTimer(vm, timer) {
  const state = [
    timer.calm ? 'is-calm' : '',
    timer.low ? 'is-low' : '',
    timer.done ? 'is-done' : '',
    timer.paused ? 'is-paused' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const c = 2 * Math.PI * 46;
  const ring = timer.calm
    ? ''
    : `<svg class="larp-dtimer-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle class="larp-dtimer-track" cx="50" cy="50" r="46"/><circle class="larp-dtimer-ring" cx="50" cy="50" r="46" stroke-dasharray="${(c * timer.fraction).toFixed(2)} ${c.toFixed(2)}"/></svg>`;
  const face = timer.done
    ? lines(timer.timeUp, vm.mode, 'larp-dtimer-up')
    : faceText(timer.text, 'pixelify', { cls: `larp-dtimer-digits${timer.text.length > 4 ? ' is-long' : ''}` });
  return `<div class="larp-dtimer${state ? ' ' + state : ''}" role="timer" aria-label="${esc(t('label.timer', vm.lang))}">${ring}${face}</div>`;
}

/** The round card's prompt: as entered, with its translation. @param {DisplayVm} vm */
function renderPrompt(vm) {
  if (!vm.prompt || !(vm.prompt.vi || vm.prompt.en)) return '';
  return `<section class="larp-dpanel larp-dprompt">${bilingualLines(vm.prompt.vi, vm.prompt.en, vm.mode, { face: 'inter', cls: 'larp-dprompt-text' })}</section>`;
}

/** @param {DisplayVm} vm */
function renderTop(vm) {
  if (vm.scene === 'test' && vm.test) return lines(vm.test.round, vm.mode, 'larp-display-title');
  if (vm.round) {
    const phase = vm.phase ? `<p class="larp-dphase">${esc(joined(vm.phase, vm.mode))}</p>` : '';
    return `${lines(vm.round, vm.mode, 'larp-display-title')}${phase}`;
  }
  return lines(vm.title, vm.mode, 'larp-display-title larp-display-brand');
}

/** @param {DisplayVm} vm @param {NonNullable<DisplayVm['welcome']>} w */
function renderWelcome(vm, w) {
  const item = (/** @type {typeof w.teams[number]} */ x) => {
    const members = x.members.length
      ? `<p class="larp-dmembers">${x.members.map((m) => faceText(m, 'inter')).join('<span aria-hidden="true"> · </span>')}</p>`
      : '';
    return `<li class="larp-dteam">${teamChip(x.team, { sub: vm.mode !== 'vi-only', size: 40, cls: 'larp-dteam-chip' })}${newChip(vm, x.team)}${members}</li>`;
  };
  const half = Math.ceil(w.teams.length / 2);
  const list = (/** @type {typeof w.teams} */ part) =>
    part.length
      ? `<section class="larp-dpanel"><ul class="larp-dteams${w.withMembers ? ' has-members' : ''}">${part.map(item).join('')}</ul></section>`
      : '';
  const pager = w.pages > 1 ? `<p class="larp-dpager">${esc(joined(w.pageText, vm.mode))}</p>` : '';
  return {
    left: list(w.teams.slice(0, half)),
    right: list(w.teams.slice(half)),
    bottom: `<p class="larp-dpanel larp-dnote">${esc(joined(w.rounds, vm.mode))}</p>${pager}`,
    key: `welcome:${w.page}`,
  };
}

/** @param {DisplayVm} vm @param {NonNullable<DisplayVm['standings']>} s @param {Pair} heading */
function renderStandings(vm, s, heading) {
  const row = (/** @type {typeof s.rows[number]} */ r) => {
    const move = s.showMovement
      ? `<span class="larp-dmove${r.movement ? ` is-${r.movement.dir}` : ''}">${r.movement ? `<span aria-hidden="true">${esc(r.movement.arrow)}</span><span class="visually-hidden">${esc(joined(r.movement.label, vm.mode))}</span>` : ''}</span>`
      : '';
    return `<li class="larp-drow" style="--team:${esc(/^#[0-9a-f]{6}$/i.test(r.team.color) ? r.team.color : 'transparent')}"><span class="larp-dplace">${esc(String(r.place))}</span>${teamChip(r.team, { size: 30, cls: 'larp-drow-team' })}${newChip(vm, r.team)}<span class="larp-dtotal">${esc(r.totalText)}</span>${move}</li>`;
  };
  const pager = s.pages > 1 ? `<p class="larp-dpager">${esc(joined(s.pageText, vm.mode))}</p>` : '';
  return `<section class="larp-dpanel larp-dstandings">${kicker(heading, vm.mode)}<ol class="larp-drows">${s.rows.map(row).join('')}</ol>${pager}</section>`;
}

/** @param {DisplayVm} vm */
function renderLeaders(vm) {
  if (!vm.leaders.length) return '';
  const row = (/** @type {DisplayVm['leaders'][number]} */ l) =>
    `<li class="larp-drow"><span class="larp-dplace">${esc(String(l.place))}</span><span class="larp-dleader">${faceText(l.name, 'cinzel', { cls: 'larp-dleader-name' })}${l.team ? teamChip(l.team, { size: 22, cls: 'larp-dleader-team' }) : ''}</span><span class="larp-dtotal">${esc(l.totalText)}</span></li>`;
  return `<section class="larp-dpanel larp-dleaders">${kicker(pairOf('label.leadingIndividuals'), vm.mode)}<ol class="larp-drows">${vm.leaders.map(row).join('')}</ol></section>`;
}

/**
 * One award banner: who, the bilingual name, the signed points with their unit, and its kind in
 * words (a deduction is neutral stone, never told apart by color alone, U03).
 * @param {DisplayVm} vm
 * @param {import('./displayView.js').Banner} b
 * @param {string} teamHtml
 */
function renderBanner(vm, b, teamHtml) {
  const who = b.individual && b.recipient ? `<p class="larp-dbanner-who">${faceText(b.recipient, 'cinzel')}</p>` : '';
  return `<article class="larp-dpanel larp-dbanner is-${b.kind}">${teamHtml}<p class="larp-dbanner-tag">${esc(joined(b.tag, vm.mode))}</p>${who}${bilingualLines(b.name, b.translation, vm.mode, { cls: 'larp-dbanner-name' })}<p class="larp-dbanner-pts">${points(b.points, { unit: b.unit, lang: unitLang(vm.mode) })}</p></article>`;
}

/** @param {DisplayVm} vm @param {NonNullable<ReturnType<typeof revealVm>>} r */
function renderReveal(vm, r) {
  if (r.kind === 'standings') return { left: '', right: '' };
  const lang = unitLang(vm.mode);
  const team = r.team
    ? teamBlock(vm, r.team, 'larp-dteamhead', 48)
    : r.teamName
      ? `<div class="larp-dteamhead">${faceText(r.teamName, 'cinzel', { cls: 'larp-dteamhead-name' })}</div>`
      : '';
  const completion = r.completion
    ? `<p class="larp-dcompletion"><span class="larp-dcompletion-status">${esc(joined(r.completion.label, vm.mode))}</span> ${
        r.completion.points > 0
          ? points(r.completion.points, { unit: 'team', lang })
          : `<span class="larp-pts larp-pts-zero">${esc(`0 ${t('unit.teamPoints', lang)}`)}</span>`
      }</p>`
    : '';
  const rows = r.rows
    .map(
      (b) =>
        `<li class="larp-dline is-${b.kind}${r.banner && b.id === r.banner.id ? ' is-current' : ''}"><span class="larp-dline-name">${esc(bilingual(b.name, b.translation, vm.mode))}</span><span class="larp-dline-meta">${points(b.points, { unit: b.unit, lang })}${b.recipient ? `<span class="larp-dline-who">${esc(b.recipient)}</span>` : ''}</span></li>`,
    )
    .join('');
  const pager = r.pages > 1 ? `<p class="larp-dpager">${esc(joined(r.pageText, vm.mode))}</p>` : '';
  const score =
    r.roundScore !== null
      ? `<p class="larp-dscore"><span>${esc(t('label.roundScore', vm.mode))}</span> <span class="larp-dscore-n">${esc(formatNumber(r.roundScore, lang))}</span></p>`
      : '';
  // A long queue: the team's one page, its awards arriving as rows (no separate banner beside it).
  if (r.grouped) {
    const list = rows ? `<ul class="larp-dlines">${rows}</ul>` : '';
    return {
      left: `<section class="larp-dpanel larp-dteampage is-grouped">${team}${completion}${list}${pager}${score}</section>`,
      right: '',
    };
  }
  const left =
    r.kind === 'award' && r.banner
      ? renderBanner(vm, r.banner, r.team ? teamChip(r.team, { size: 26, cls: 'larp-dbanner-team' }) : '')
      : `<article class="larp-dpanel larp-dheader">${team}${completion}</article>`;
  const right =
    rows || score
      ? `<section class="larp-dpanel larp-dteampage">${r.team ? teamChip(r.team, { size: 26, sub: false }) : ''}${completion}<ul class="larp-dlines">${rows}</ul>${pager}${score}</section>`
      : '';
  return { left, right };
}

/** @typedef {Record<string, [string, string]>} Zones zone → [key, markup] */

/** @param {DisplayVm} vm @param {string} base @returns {Zones} */
function performancesZones(vm, base) {
  const who = vm.performer;
  const shown = who ?? vm.next;
  const big = shown ? `${teamBlock(vm, shown, 'larp-dperformer', 64)}${newChip(vm, shown)}` : '';
  const timer = who && vm.timer ? renderTimer(vm, vm.timer) : '';
  const head = kicker(pairOf(who ? 'phase.performing' : 'status.upNext'), vm.mode);
  /** @type {Zones} */
  const z = {
    right: [
      `${base}:${shown?.id ?? ''}`,
      big || timer ? `<section class="larp-dpanel larp-dturn">${head}${big}${timer}</section>` : '',
    ],
  };
  if (who && vm.next) {
    z.bottom = [
      `${base}:${vm.next.id}`,
      `<div class="larp-dpanel larp-dnext-small">${kicker(pairOf('label.next'), vm.mode)}${teamChip(vm.next, { size: 26 })}${newChip(vm, vm.next)}</div>`,
    ];
  }
  return z;
}

/** @param {DisplayVm} vm @param {string} base @returns {Zones} */
function testZones(vm, base) {
  const test = /** @type {NonNullable<DisplayVm['test']>} */ (vm.test);
  /** @type {import('./displayView.js').Banner} */
  const banner = {
    id: 'sample',
    kind: 'bonus',
    tag: pairOf('word.bonusPoints'),
    name: test.award.vi,
    translation: test.award.en,
    individual: false,
    recipient: '',
    points: 75,
    unit: 'team',
  };
  return {
    left: [base, renderBanner(vm, banner, teamBlock(vm, test.team, 'larp-dteamhead', 40))],
    right: [base, `<section class="larp-dpanel larp-dclock">${renderTimer(vm, test.timer)}</section>`],
    bottom: [base, `<p class="larp-dpanel larp-dnote">${esc(t('label.testPattern', vm.mode))}</p>`],
  };
}

/** @param {DisplayVm} vm @param {string} base @returns {Zones} */
function standingsZones(vm, base) {
  const s = /** @type {NonNullable<DisplayVm['standings']>} */ (vm.standings);
  const finished = vm.scene === 'finished';
  /** @type {Zones} */
  const z = {
    left: [`${base}:${s.page}`, renderStandings(vm, s, pairOf(finished ? 'label.finalStandings' : 'word.standings'))],
  };
  if (finished) z.right = [base, renderLeaders(vm)];
  return z;
}

/**
 * Each scene's zones besides the title band, the chips and the controls.
 * @type {Record<DisplayVm['scene'], (vm: DisplayVm, base: string) => Zones>}
 */
const SCENE_ZONES = {
  waiting: (vm, base) => ({
    left: [base, `<p class="larp-dpanel larp-dnote">${esc(t('hint.displayWaiting', vm.mode))}</p>`],
  }),
  welcome: (vm, base) => {
    const w = renderWelcome(vm, /** @type {NonNullable<DisplayVm['welcome']>} */ (vm.welcome));
    return { left: [w.key, w.left], right: [w.key, w.right], bottom: [base, w.bottom] };
  },
  briefing: (vm, base) => ({
    left: [base, renderPrompt(vm)],
    right: [
      base,
      vm.next
        ? `<section class="larp-dpanel larp-dnext">${kicker(pairOf('status.upNext'), vm.mode)}${teamChip(vm.next, { sub: vm.mode !== 'vi-only', size: 36 })}</section>`
        : '',
    ],
  }),
  preparation: (vm, base) => ({
    left: [base, renderPrompt(vm)],
    right: [
      base,
      `<section class="larp-dpanel larp-dclock">${kicker(pairOf('phase.preparation'), vm.mode)}${vm.timer ? renderTimer(vm, vm.timer) : ''}</section>`,
    ],
  }),
  performances: performancesZones,
  review: (vm, base) => ({
    left: [
      base,
      `<section class="larp-dpanel larp-dcalm">${lines(pairOf('hint.reviewing'), vm.mode, 'larp-dcalm-text')}</section>`,
    ],
  }),
  reveal: (vm, base) => {
    const r = /** @type {NonNullable<DisplayVm['reveal']>} */ (vm.reveal);
    const parts = renderReveal(vm, r);
    const page = 'groupKey' in r ? `page:${r.groupKey}:${r.page}` : base;
    if (r.grouped) return { left: [page, parts.left] };
    return {
      left: ['key' in r ? `reveal:${r.key}` : base, parts.left],
      right: [page, parts.right],
    };
  },
  results: standingsZones,
  finished: standingsZones,
  test: testZones,
};

/**
 * The zones for this view: { zone: [key, inner] }. A zone with no markup is left out.
 * @param {DisplayVm} vm
 * @returns {Zones}
 */
function zones(vm) {
  const base = `${vm.scene}:${vm.roundKey}`;
  /** @type {Zones} */
  const z = { top: [`top:${base}:${vm.mode}`, renderTop(vm)], ...SCENE_ZONES[vm.scene](vm, base) };
  const chips = vm.hostClosed
    ? `<p class="larp-dchip larp-dchip-host" role="status">${esc(vm.hostClosedText)}</p>`
    : '';
  z.chips = ['chips', chips];
  if (vm.controls) {
    z.controls = [
      'controls',
      `${button(vm.controls.fullScreen, 'display.fullscreen', { variant: 'quiet', cls: 'larp-dctl-full' })}${button(vm.controls.close, 'display.close', { variant: 'quiet', cls: 'larp-dctl-close' })}`,
    ];
  }
  return z;
}

/**
 * The display's markup (pure): one root carrying the view's state, and its zones.
 * @param {DisplayVm} vm
 * @returns {string}
 */
export function renderDisplay(vm) {
  const inner = Object.entries(zones(vm))
    .map(([zone, [key, html]]) => zoneOf(zone, key, html))
    .join('');
  const a = `data-scene="${esc(vm.scene)}" data-mode="${esc(vm.mode)}" data-calm="${vm.calm}" data-reduced="${vm.reducedMotion}" lang="${vm.lang}"`;
  return `<div class="larp-display-zones" ${a}>${inner}</div>`;
}
