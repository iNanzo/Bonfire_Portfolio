// The shared display's view-model pieces (display.js composes them): pure functions over the
// public Projection, no DOM, no clock of their own (`now` and `since` are handed in).
//
//   pairOf(key)                        a strings.js label in both languages, for bilingualLines
//   docLang(mode)                      the page's main language for a display mode
//   pageOf(count, perPage, now, since) which page an automatically paged list is on (8 s a page)
//   trackSince(prev, key, now)         when the current paged view started (the DOM keeps it)
//   timerVm(timer, now, o)             the big timer: digits, the amber last 10 s, "Time" at zero
//   teamVm / isNewTeam                 a team as the display draws it, and whether it just joined
//   welcomeVm                          the teams and their emblems (and members, paged)
//   standingsVm / leadersVm            the standings (shared places, movement, paged) and leaders
//   revealVm                           the banner at the reveal's position and its team's page
//   revealGrouped / revealDwell / revealLength   the reveal's pacing: a banner every 3 s, or, for a
//                                      long queue, each team's awards as rows on one team page
/**
 * @typedef {import('./types.js').Projection} Projection
 * @typedef {import('./types.js').Timer} Timer
 * @typedef {import('./types.js').DisplayMode} DisplayMode
 * @typedef {import('./types.js').Lang} Lang
 * @typedef {Projection['teams'][number]} ProjectedTeam
 * @typedef {{ vi: string, en: string }} Pair
 */
import { fill, formatClock, formatNumber, STRINGS } from './strings.js';
import { remaining } from './phases.js';
import { REVEAL_BANNER_MS } from './types.js';

/** Rows on one standings page at 1080p. */
export const STANDINGS_PER_PAGE = 8;
/** How long one page of a paged list stays up (ms). */
export const PAGE_MS = 8000;
/** The timer's last stretch, when its ring turns amber (ms). */
export const LOW_MS = 10_000;
/** Award rows on one page of a team's reveal panel (a long queue pages). */
export const REVEAL_ROWS = 5;
/** The reveal's target length (the design's 30–60 s a round): past it, the reveal groups. */
export const REVEAL_TARGET_MS = 60_000;
/** A grouped reveal's pacing (ms): the team's header, each award row, and the full page's hold. */
export const GROUP_HEAD_MS = 1500;
export const GROUP_ROW_MS = 1000;
export const GROUP_HOLD_MS = 2500;
/** Teams on one Welcome page: names only, or with their members. */
export const WELCOME_PER_PAGE = 12;
export const WELCOME_MEMBERS_PER_PAGE = 6;

/**
 * A label in both languages (the key itself on both sides when it's missing), filled.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {Pair}
 */
export function pairOf(key, vars) {
  const entry = Object.hasOwn(STRINGS, key) ? STRINGS[key] : { vi: key, en: key };
  return vars ? { vi: fill(entry.vi, vars), en: fill(entry.en, vars) } : { vi: entry.vi, en: entry.en };
}

/**
 * The display's main language: English first → 'en', otherwise Vietnamese.
 * @param {DisplayMode} mode
 * @returns {Lang}
 */
export function docLang(mode) {
  return mode === 'en-first' ? 'en' : 'vi';
}

/**
 * The language numbers and units are written in: Vietnamese only → 'vi'; the bilingual modes keep
 * the design's English units ("+75 Team Points").
 * @param {DisplayMode} mode
 * @returns {Lang}
 */
export function unitLang(mode) {
  return mode === 'vi-only' ? 'vi' : 'en';
}

/**
 * The page an automatically paged list shows: a new page every PAGE_MS since the view began, round
 * and round. One page (or none) never moves.
 * @param {number} count items
 * @param {number} perPage
 * @param {number} now
 * @param {number} since when the view began
 * @returns {{ page: number, pages: number, start: number, end: number }} page is 0-based; start/end slice the items
 */
export function pageOf(count, perPage, now, since) {
  const pages = Math.max(1, Math.ceil(Math.max(0, count) / perPage));
  const ticks = Math.floor(Math.max(0, now - since) / PAGE_MS);
  const page = pages > 1 && Number.isFinite(ticks) ? ticks % pages : 0;
  return { page, pages, start: page * perPage, end: Math.min(count, (page + 1) * perPage) };
}

/**
 * When the current paged view began: kept while `key` is unchanged, `now` when it changes.
 * @param {{ key: string|null, since: number }|null} prev
 * @param {string|null} key
 * @param {number} now
 * @returns {{ key: string|null, since: number }}
 */
export function trackSince(prev, key, now) {
  return prev && prev.key === key ? prev : { key, since: now };
}

/**
 * The timer as the display shows it. `done`: it has run out (it reads "Time" and holds, no buzz);
 * `low`: the last 10 s (the ring turns amber, never red, never flashing); `calm`: the prayer round's
 * small timer, no ring. `fraction` is what's left of the allowance (0–1) for the ring.
 * @param {Timer} timer
 * @param {number} now
 * @param {{ calm?: boolean }} [o]
 */
export function timerVm(timer, now, o = {}) {
  const left = remaining(timer, now);
  const started = timer.kind !== null && timer.status !== 'idle';
  const done = started && left === 0;
  const duration = Math.max(timer.durationMs || 0, left, 1);
  return {
    show: timer.kind !== null,
    status: timer.status,
    text: formatClock(left),
    leftMs: left,
    done,
    low: !done && timer.kind !== null && left <= LOW_MS && timer.status !== 'idle',
    paused: timer.status === 'paused',
    calm: !!o.calm,
    fraction: Math.min(1, Math.max(0, left / duration)),
    timeUp: pairOf('word.time'),
  };
}

/**
 * Whether a team added mid-game is still new: from when it is added until the end of the first
 * round it plays (a quiet chip, never a banner).
 * @param {Projection} p
 * @param {ProjectedTeam} team
 */
export function isNewTeam(p, team) {
  return !!team.isNew && p.phase === 'running' && p.roundIndex <= team.admittedRound;
}

/**
 * A team as the display draws it (null for an unknown id).
 * @param {Projection} p
 * @param {string|null|undefined} id
 */
export function teamVm(p, id) {
  const team = id ? p.teams.find((t) => t.id === id) : undefined;
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    translation: team.translation,
    color: team.color,
    emblem: team.emblem,
    isNew: isNewTeam(p, team),
  };
}

/** @typedef {NonNullable<ReturnType<typeof teamVm>>} TeamVm */

/**
 * The Welcome screen: every team with its emblem (and its members when the host shows them),
 * paged when they don't fit.
 * @param {Projection} p
 * @param {{ now: number, since: number }} o
 */
export function welcomeVm(p, { now, since }) {
  const withMembers = p.members.length > 0;
  const perPage = withMembers ? WELCOME_MEMBERS_PER_PAGE : WELCOME_PER_PAGE;
  const all = p.teams.map((t) => ({
    team: /** @type {TeamVm} */ (teamVm(p, t.id)),
    members: withMembers ? p.members.filter((m) => m.teamId === t.id).map((m) => m.name) : [],
  }));
  const paging = pageOf(all.length, perPage, now, since);
  return {
    withMembers,
    teams: all.slice(paging.start, paging.end),
    page: paging.page,
    pages: paging.pages,
    pageText: pairOf('label.pageOf', { page: paging.page + 1, pages: paging.pages }),
    rounds: pairOf('label.roundsN', { n: p.roundCount }),
  };
}

/**
 * The movement since the previous round as an arrow and words (never only a color): null before
 * a second round is published, or for a team that wasn't ranked then.
 * @param {number|null} movement places gained
 * @returns {{ dir: 'up'|'down'|'same', n: number, arrow: string, label: Pair }|null}
 */
export function movementVm(movement) {
  if (movement === null || movement === undefined || !Number.isFinite(movement)) return null;
  const n = Math.abs(movement);
  if (movement > 0) return { dir: 'up', n, arrow: `▲${n}`, label: pairOf('label.movedUp', { n }) };
  if (movement < 0) return { dir: 'down', n, arrow: `▼${n}`, label: pairOf('label.movedDown', { n }) };
  return { dir: 'same', n: 0, arrow: '–', label: pairOf('label.noMove') };
}

/**
 * The team standings: shared places as equal numbers (2, 2, 4), movement arrows after round 1,
 * eight rows a page, the pages turning by themselves.
 * @param {Projection} p
 * @param {{ now: number, since: number, mode: DisplayMode }} o
 */
export function standingsVm(p, { now, since, mode }) {
  const lang = unitLang(mode);
  const all = p.standings.flatMap((row) => {
    const team = teamVm(p, row.id);
    if (!team) return [];
    return [
      {
        place: row.place,
        total: row.total,
        totalText: formatNumber(row.total, lang),
        movement: movementVm(row.movement),
        team,
      },
    ];
  });
  const paging = pageOf(all.length, STANDINGS_PER_PAGE, now, since);
  return {
    rows: all.slice(paging.start, paging.end),
    count: all.length,
    page: paging.page,
    pages: paging.pages,
    pageText: pairOf('label.pageOf', { page: paging.page + 1, pages: paging.pages }),
    showMovement: all.some((r) => r.movement !== null),
  };
}

/**
 * The leading individuals (the projection carries them only once the event is finished, and
 * never anyone at zero or below), each with their team.
 * @param {Projection} p
 * @param {DisplayMode} mode
 */
export function leadersVm(p, mode) {
  const lang = unitLang(mode);
  return p.leaders
    .filter((l) => l.total > 0)
    .map((l) => ({ place: l.place, name: l.name, totalText: formatNumber(l.total, lang), team: teamVm(p, l.teamId) }));
}

/**
 * The reveal at its current position: a team's header (its completion), one award banner (team or
 * individual, bonus or deduction) or the standings; plus the team's page: the awards revealed so
 * far in its group, REVEAL_ROWS a page (the page holding the current one), and its round score
 * once its last award is up. Null when there is no reveal or no published result for it.
 * @param {Projection} p
 */
export function revealVm(p) {
  const reveal = p.reveal;
  if (!reveal || !p.revealSteps.length) return null;
  const result = p.results.find((r) => r.roundId === reveal.roundId);
  if (!result) return null;
  const index = Math.min(Math.max(0, reveal.step), p.revealSteps.length - 1);
  const step = p.revealSteps[index];
  const position = {
    step: index,
    total: p.revealSteps.length,
    paused: !!reveal.paused,
    grouped: revealGrouped(p.revealSteps),
  };
  if (step.kind === 'standings')
    return { kind: /** @type {const} */ ('standings'), ...position, roundId: result.roundId };

  const adjustment = (/** @type {string|null} */ id) => result.adjustments.find((a) => a.id === id) ?? null;
  const teamId = step.teamId;
  const team = teamVm(p, teamId);
  const completion = teamId ? (result.completion[teamId] ?? null) : null;

  // The team's group: from its header to the step before the next header (or the standings).
  let first = index;
  while (first > 0 && p.revealSteps[first].kind !== 'team') first--;
  let last = index;
  while (last + 1 < p.revealSteps.length && p.revealSteps[last + 1].kind === 'award') last++;
  const groupAwards = p.revealSteps
    .slice(first, index + 1)
    .filter((s) => s.kind === 'award')
    .map((s) => adjustment(s.adjustmentId))
    .filter((a) => a !== null)
    .map((a) => bannerOf(a));
  const pageIndex = groupAwards.length ? Math.floor((groupAwards.length - 1) / REVEAL_ROWS) : 0;
  const pages = Math.max(1, Math.ceil(groupAwards.length / REVEAL_ROWS));
  const current = step.kind === 'award' ? adjustment(step.adjustmentId) : null;

  return {
    kind: step.kind === 'award' ? /** @type {const} */ ('award') : /** @type {const} */ ('team'),
    ...position,
    roundId: result.roundId,
    key: `${result.roundId}:${index}`,
    groupKey: `${result.roundId}:${first}`,
    team,
    teamName: team ? team.name : current?.recipientType === 'team' ? current.recipientName : '',
    completion: completion
      ? { status: completion.status, points: completion.points, label: pairOf(`status.${completion.status}`) }
      : null,
    banner: current ? bannerOf(current) : null,
    rows: groupAwards.slice(pageIndex * REVEAL_ROWS, (pageIndex + 1) * REVEAL_ROWS),
    page: pageIndex,
    pages,
    pageText: pairOf('label.pageOf', { page: pageIndex + 1, pages }),
    roundScore:
      index === last && teamId && Object.hasOwn(result.teamRoundScores, teamId) ? result.teamRoundScores[teamId] : null,
  };
}

/**
 * @typedef {import('./types.js').RevealStep} RevealStep
 */

/**
 * Whether a reveal groups its awards: when one banner every REVEAL_BANNER_MS would run past
 * REVEAL_TARGET_MS, each team's awards appear as rows on its one team page (a row a second, no
 * separate banner), so a long queue stays within the round's time and every award still shows.
 * @param {ReadonlyArray<RevealStep>} steps
 */
export function revealGrouped(steps) {
  const shown = steps.filter((s) => s.kind !== 'standings').length;
  return shown * REVEAL_BANNER_MS > REVEAL_TARGET_MS;
}

/**
 * How long step `index` stays up before the reveal moves on (ms). One banner each: REVEAL_BANNER_MS.
 * Grouped: a team's header GROUP_HEAD_MS, each award row GROUP_ROW_MS, and the group's last step
 * (its full page, with its round score) GROUP_HOLD_MS. The standings end the reveal at once (they
 * are Results, which stay until the host moves on): 0.
 * @param {ReadonlyArray<RevealStep>} steps
 * @param {number} index
 */
export function revealDwell(steps, index) {
  const step = steps[index];
  if (!step || step.kind === 'standings') return 0;
  if (!revealGrouped(steps)) return REVEAL_BANNER_MS;
  const lastOfGroup = steps[index + 1]?.kind !== 'award';
  if (lastOfGroup) return GROUP_HOLD_MS;
  return step.kind === 'team' ? GROUP_HEAD_MS : GROUP_ROW_MS;
}

/**
 * The reveal's length before the standings (what Review and the Run tab estimate).
 * @param {ReadonlyArray<RevealStep>} steps
 */
export function revealLength(steps) {
  return steps.reduce((sum, _, i) => sum + revealDwell(steps, i), 0);
}

/**
 * One award as a banner: its bilingual name, who got it, its signed points and its kind (a bonus
 * gets the warm accent, a deduction or a recognition stays neutral; the words say which).
 * @param {import('./types.js').PublicAdjustment} a
 */
export function bannerOf(a) {
  const kind = a.points > 0 ? 'bonus' : a.points < 0 ? 'deduction' : 'recognition';
  const tagKey = kind === 'bonus' ? 'word.bonusPoints' : kind === 'deduction' ? 'word.deduction' : 'unit.recognition';
  return {
    id: a.id,
    kind,
    tag: pairOf(tagKey),
    name: a.name,
    translation: a.translation,
    individual: a.recipientType === 'member',
    recipient: a.recipientType === 'member' ? a.recipientName : '',
    points: a.points,
    unit: a.recipientType === 'member' ? /** @type {const} */ ('individual') : /** @type {const} */ ('team'),
  };
}

/** @typedef {ReturnType<typeof bannerOf>} Banner */
