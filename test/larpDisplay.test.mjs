// The shared display (src/larp/display.js, src/larp/displayView.js): it renders only the public
// projection it is sent, one focus per phase: Welcome (the teams and their emblems, members paged),
// Briefing (the round card in the display's language mode), Preparation (prompt and timer),
// Performances (the performing team big, the next small), Review (a calm card, no scores), Reveal
// (the banner at the reveal's position: signed points with their unit, deductions neutral and never
// color alone, long queues paged), Results (shared places, movement after round 1, eight rows a page
// turning every 8 s) and Finished (the leading individuals only at the end). The timer is in Pixelify
// Sans, turns amber for its last 10 s and holds on "Time" at zero; the prayer round's is small and
// still. All text is escaped (A22), and Vietnamese never falls back mid-word (U01).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { displayActions, displayVm, pageKeyOf, promptPair, renderDisplay } from '../src/larp/display.js';
import {
  LOW_MS,
  PAGE_MS,
  REVEAL_ROWS,
  STANDINGS_PER_PAGE,
  GROUP_HEAD_MS,
  GROUP_HOLD_MS,
  GROUP_ROW_MS,
  REVEAL_TARGET_MS,
  bannerOf,
  docLang,
  movementVm,
  pageOf,
  pairOf,
  revealDwell,
  revealGrouped,
  revealLength,
  revealVm,
  standingsVm,
  timerVm,
  trackSince,
  unitLang,
  welcomeVm,
} from '../src/larp/displayView.js';
import { createApp } from '../src/larp/app.js';
import { MINUS, t as tr } from '../src/larp/strings.js';
import { REVEAL_BANNER_MS, ROUND_CATEGORIES } from '../src/larp/types.js';
import { fakeStorage, makeClock, makeIds } from './lib/larpFixtures.mjs';

const XSS = '<img src=x onerror=alert(1)>';

/** A fresh app with `names` as teams (and `members` youth on each). */
function game(names = ['Đội Phaolô', 'Đội Giuse'], { members = 0 } = {}) {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('d') });
  app.newEvent();
  for (const name of names) {
    const r = app.dispatch('addTeam', { name, translation: name.startsWith('Đội ') ? `Team ${name.slice(4)}` : '' });
    assert.equal(r.error, null);
  }
  const teams = () => app.getEvent().teams;
  for (const t of teams()) {
    for (let i = 0; i < members; i++) app.dispatch('addMember', { name: `Em ${t.name.slice(-1)}${i}`, teamId: t.id });
  }
  /** The projection as the display hears it (cloned, like a BroadcastChannel message). */
  const proj = () => structuredClone(app.getProjection(clock.now()));
  /** @param {string} type @param {any} [payload] */
  const run = (type, payload = {}) => {
    const r = app.dispatch(type, payload);
    assert.equal(r.error, null, `${type}: ${JSON.stringify(r.error)}`);
    return r;
  };
  return { app, clock, teams, proj, run };
}

/** Plays round `n` (0-based, from Welcome or the previous Results) to its Review. */
function toReview(g, awards = []) {
  g.run('nextRound');
  g.run('startPreparation');
  g.run('endPreparation');
  const round = g.app.getEvent().rounds[g.app.getEvent().roundIndex];
  for (const teamId of round.order) {
    g.run('nextTeam');
    g.run('setStatus', { teamId, status: 'complete' });
  }
  for (const a of awards) g.run('addAward', a);
  g.run('beginReview');
  return round;
}

const vmOf = (p, o = {}) => displayVm(p, { now: p ? p.now : 0, ...o });
const html = (p, o = {}) => renderDisplay(vmOf(p, o));

test('without a projection it waits under the title, with Full Screen and a Close', () => {
  const vm = displayVm(null, { now: 1 });
  assert.equal(vm.scene, 'waiting');
  const out = renderDisplay(vm);
  assert.match(out, /Lửa Trại Nghĩa Sĩ/);
  assert.match(out, /Đang chờ bảng điều khiển của Quản Trò\./);
  assert.match(out, /data-action="display\.fullscreen"/);
  assert.match(out, /data-action="display\.close"/);
  const preview = renderDisplay(displayVm(null, { now: 1, preview: true }));
  assert.doesNotMatch(preview, /data-action/, 'the Preview Display frame has no controls');
});

test('the controls call what the window gives them', () => {
  const calls = [];
  const actions = displayActions({ fullscreen: () => calls.push('fs'), close: () => calls.push('close') });
  actions['display.fullscreen']();
  actions['display.close']();
  assert.deepEqual(calls, ['fs', 'close']);
});

test('Welcome shows every team with its emblem, escaped, and the number of rounds', () => {
  const g = game(['Đội Phaolô', 'Đội Giuse', XSS]);
  const p = g.proj();
  const vm = vmOf(p);
  assert.equal(vm.scene, 'welcome');
  const out = renderDisplay(vm);
  assert.match(out, /Đội Phaolô/);
  assert.match(out, /Team Phaolô/);
  assert.equal((out.match(/data-emblem=/g) ?? []).length, 3);
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(out, /5 Vòng · 5 Rounds/);
  // U01: a Vietnamese name is set wholly in Inter, its English line in Cinzel.
  assert.match(out, /class="larp-face-inter larp-chip-name">Đội Phaolô</);
  assert.match(out, /class="larp-face-cinzel larp-chip-sub" lang="en">Team Phaolô</);
  // Also after Start Event (Welcome, roundIndex -1).
  g.run('startEvent');
  assert.equal(vmOf(g.proj()).scene, 'welcome');
});

test('Welcome lists members when the host shows them, paged every 8 s', () => {
  const names = Array.from({ length: 8 }, (_, i) => `Đội ${i + 1}`);
  const g = game(names, { members: 2 });
  assert.equal(vmOf(g.proj()).welcome.withMembers, false, 'members stay off the display unless the host shows them');
  g.run('setConfig', { showMembers: true });
  const p = g.proj();
  const first = welcomeVm(p, { now: p.now, since: p.now });
  assert.equal(first.withMembers, true);
  assert.equal(first.pages, 2);
  assert.equal(first.teams.length, 6);
  assert.deepEqual(first.teams[0].members, ['Em 10', 'Em 11']);
  const later = welcomeVm(p, { now: p.now + PAGE_MS, since: p.now });
  assert.equal(later.page, 1);
  assert.equal(later.teams.length, 2);
  const out = html(p, { now: p.now + PAGE_MS, since: p.now });
  assert.match(out, /Em 70/);
  assert.match(out, /Trang 2\/2 · Page 2 Of 2/);
});

test('the briefing card follows the display mode: bilingual, English first, Vietnamese only', () => {
  const g = game();
  const roundId = g.app.getEvent().rounds[0].id;
  g.run('editRound', { roundId, prompt: 'Kể về thánh bổn mạng', promptTranslation: 'Tell us about your patron' });
  g.run('startEvent');
  g.run('nextRound');
  const p = g.proj();
  const vm = vmOf(p);
  assert.equal(vm.scene, 'briefing');
  const out = renderDisplay(vm);
  assert.match(out, /class="larp-face-inter larp-bi-main" lang="vi">Vòng 1 · Khám Phá Đức Tin</);
  assert.match(out, /lang="en">Round 1 · Faith Discovery</);
  assert.match(out, /larp-display-title/);
  assert.match(out, /Kể về thánh bổn mạng/);
  assert.match(out, /Tell us about your patron/);
  assert.equal(vm.lang, 'vi');

  g.run('setConfig', { displayMode: 'en-first' });
  const en = vmOf(g.proj());
  assert.equal(en.lang, 'en');
  const enOut = renderDisplay(en);
  assert.ok(enOut.indexOf('Round 1 · Faith Discovery') < enOut.indexOf('Vòng 1 · Khám Phá Đức Tin'));
  assert.ok(enOut.indexOf('Tell us about your patron') < enOut.indexOf('Kể về thánh bổn mạng'));

  g.run('setConfig', { displayMode: 'vi-only' });
  const vi = renderDisplay(vmOf(g.proj()));
  assert.match(vi, /Vòng 1 · Khám Phá Đức Tin/);
  assert.doesNotMatch(vi, /Faith Discovery|Tell us about|Full Screen/);
  assert.match(vi, /Toàn Màn Hình/);
});

test('preparation keeps the prompt up with a big Pixelify timer that turns amber, then holds on Time', () => {
  const g = game();
  g.run('startEvent');
  g.run('nextRound');
  g.run('startPreparation');
  const p = g.proj();
  const vm = vmOf(p);
  assert.equal(vm.scene, 'preparation');
  const out = renderDisplay(vm);
  assert.match(out, /Chuẩn Bị · Preparation/);
  assert.match(out, /class="larp-face-pixelify larp-dtimer-digits">1:30</);
  assert.match(out, /role="timer"/);
  assert.doesNotMatch(out, /aria-live/, 'the timer is not a live region');
  assert.match(out, /larp-dtimer-ring/);
  assert.doesNotMatch(out, /is-low/);

  const low = html(p, { now: p.now + 90_000 - LOW_MS });
  assert.match(low, /larp-dtimer is-low/);
  assert.match(low, />0:10</);
  const zero = html(p, { now: p.now + 90_000 });
  assert.match(zero, /is-done/);
  assert.match(zero, /Hết Giờ/);
  assert.match(zero, /Time/);
  assert.doesNotMatch(zero, /is-low/);
  const after = html(p, { now: p.now + 600_000 });
  assert.match(after, /Hết Giờ/, 'it holds at zero: no buzz, no cut off');

  g.run('pauseTimer');
  const paused = vmOf(g.proj(), { now: p.now + 600_000 });
  assert.equal(paused.timer.paused, true);
  assert.equal(paused.timer.text, '1:30');
});

test('timerVm: idle, running, low, done and the ring fraction', () => {
  const idle = timerVm({ kind: 'turn', status: 'idle', durationMs: 60_000, deadline: null, remainingMs: 60_000 }, 0);
  assert.deepEqual([idle.text, idle.low, idle.done, idle.fraction], ['1:00', false, false, 1]);
  const run = { kind: 'turn', status: 'running', durationMs: 60_000, deadline: 60_000, remainingMs: null };
  assert.equal(timerVm(run, 30_000).fraction, 0.5);
  assert.equal(timerVm(run, 50_000).low, true);
  assert.equal(timerVm(run, 60_000).done, true);
  const none = timerVm({ kind: null, status: 'idle', durationMs: 0, deadline: null, remainingMs: null }, 0);
  assert.equal(none.show, false);
  assert.deepEqual(timerVm(run, 0, { calm: true }).calm, true);
});

test('the prayer round is calm: a small timer, no ring, nothing animated (U07)', () => {
  const g = game();
  g.run('startEvent');
  for (let i = 0; i < 2; i++) {
    toReview(g);
    g.run('publishRound', { roundId: g.proj().round.id });
    g.run('revealSkip');
  }
  g.run('nextRound');
  g.run('startPreparation');
  const vm = vmOf(g.proj());
  assert.equal(vm.round.en, 'Round 3 · Prayer / Sacred Song');
  assert.equal(vm.calm, true);
  const out = renderDisplay(vm);
  assert.match(out, /data-calm="true"/);
  assert.match(out, /larp-dtimer is-calm/);
  assert.doesNotMatch(out, /larp-dtimer-ring/);
});

test('performances: the performing team big with its time, the next team small', () => {
  const g = game(['Đội Phaolô', 'Đội Giuse', 'Đội Maria']);
  g.run('startEvent');
  g.run('nextRound');
  g.run('startPreparation');
  g.run('endPreparation');
  const before = vmOf(g.proj());
  assert.equal(before.scene, 'performances');
  assert.equal(before.performer, null);
  assert.match(renderDisplay(before), /Sắp Tới · Up Next/);
  g.run('nextTeam');
  const p = g.proj();
  const vm = vmOf(p);
  const order = g.app.getEvent().rounds[0].order;
  assert.equal(vm.performer.id, order[0]);
  assert.equal(vm.next.id, order[1]);
  const out = renderDisplay(vm);
  assert.match(out, /Đang Trình Diễn · Performing/);
  assert.match(out, /larp-dperformer/);
  assert.match(out, /Tiếp Theo · Next/);
  assert.match(out, />0:45</);
  // The last team: no next.
  g.run('nextTeam');
  g.run('nextTeam');
  assert.equal(vmOf(g.proj()).next, null);
});

test('review is a calm card with no hint of the scores', () => {
  const g = game();
  g.run('startEvent');
  toReview(g, [
    { recipientType: 'team', recipientIds: [g.teams()[0].id], name: 'Sáng Tạo', translation: 'Creativity', points: 50 },
  ]);
  const vm = vmOf(g.proj());
  assert.equal(vm.scene, 'review');
  const out = renderDisplay(vm);
  assert.match(out, /Ban Giám Khảo đang duyệt điểm/);
  assert.match(out, /HTs are reviewing/);
  assert.doesNotMatch(out, /Sáng Tạo|\+50|Points/);
});

test('the reveal: team header with completion, signed banners, deductions neutral, the standings last', () => {
  const g = game(['Đội Phaolô']);
  g.run('addMember', { name: 'Mai', teamId: g.teams()[0].id });
  const mai = g.app.getEvent().roster[0].id;
  const team = g.teams()[0].id;
  g.run('startEvent');
  toReview(g, [
    {
      recipientType: 'team',
      recipientIds: [team],
      name: 'Cùng Nhau Tỏa Sáng',
      translation: 'Shine Together',
      points: 75,
    },
    { recipientType: 'team', recipientIds: [team], name: 'Quá Giờ', translation: 'Over Time', points: -25 },
    { recipientType: 'member', recipientIds: [mai], name: XSS, translation: 'Narration', points: -25 },
  ]);
  g.run('publishRound', { roundId: g.proj().round.id });

  const header = vmOf(g.proj());
  assert.equal(header.scene, 'reveal');
  assert.equal(header.reveal.kind, 'team');
  let out = renderDisplay(header);
  assert.match(out, /Đội Phaolô/);
  assert.match(out, /Hoàn Thành · Complete/);
  assert.match(out, /\+100 Team Points/);

  g.run('revealAdvance');
  const bonus = vmOf(g.proj());
  assert.equal(bonus.reveal.banner.kind, 'bonus');
  out = renderDisplay(bonus);
  assert.match(out, /larp-dbanner is-bonus/);
  assert.match(out, /Cùng Nhau Tỏa Sáng/);
  assert.match(out, /Shine Together/);
  assert.match(out, /\+75 Team Points/);
  assert.match(out, /Điểm Thưởng · Bonus Points/);

  g.run('revealAdvance');
  out = renderDisplay(vmOf(g.proj()));
  assert.match(out, /larp-dbanner is-deduction/);
  assert.match(out, new RegExp(`${MINUS}25 Team Points`));
  assert.match(out, /Điểm Trừ · Point Deduction/, 'a deduction says so in words, not only by color (U03)');
  assert.match(out, /larp-pts-minus/);

  g.run('revealAdvance');
  const ind = vmOf(g.proj());
  out = renderDisplay(ind);
  assert.equal(ind.reveal.banner.individual, true);
  assert.match(out, new RegExp(`${MINUS}25 Individual Points`));
  assert.match(out, /Mai/);
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img src=x/);
  // The team's last banner: its round score (100 + 75 − 25; Mai's points stay hers, A09).
  assert.equal(ind.reveal.roundScore, 150);
  assert.match(out, /Điểm Vòng · Round Score/);
  assert.equal(ind.reveal.rows.length, 3, 'the team page lists what has been revealed');

  g.run('revealAdvance');
  const last = vmOf(g.proj());
  assert.equal(last.scene, 'results', 'the standings step shows the standings');
  assert.equal(pageKeyOf(g.proj()), `standings:${g.proj().round.id}`);
  g.run('revealAdvance');
  assert.equal(g.proj().roundPhase, 'results');
  assert.equal(pageKeyOf(g.proj()), `standings:${g.proj().round.id}`, 'the same paging carries on into Results');
});

test('a long queue pages its team panel, five rows a page, every award still shown', () => {
  const g = game(['Đội Phaolô']);
  const team = g.teams()[0].id;
  g.run('startEvent');
  const awards = Array.from({ length: 7 }, (_, i) => ({
    recipientType: 'team',
    recipientIds: [team],
    name: `Giải ${i + 1}`,
    translation: `Award ${i + 1}`,
    points: 10 + i,
  }));
  toReview(g, awards);
  g.run('publishRound', { roundId: g.proj().round.id });
  const seen = new Set();
  for (let i = 0; i < 7; i++) {
    g.run('revealAdvance');
    const r = revealVm(g.proj());
    assert.equal(r.kind, 'award');
    seen.add(r.banner.name);
    if (i < REVEAL_ROWS) assert.equal(r.page, 0);
    else {
      assert.equal(r.page, 1);
      assert.equal(r.pages, 2);
      assert.equal(r.rows.length, i + 1 - REVEAL_ROWS);
    }
  }
  assert.equal(seen.size, 7);
  assert.match(html(g.proj()), /Trang 2\/2 · Page 2 Of 2/);
});

test('standings: shared places as equal numbers, eight rows a page turning every 8 s', () => {
  const names = Array.from({ length: 10 }, (_, i) => `Đội ${i + 1}`);
  const g = game(names);
  g.run('startEvent');
  const round = toReview(g, [{ recipientType: 'team', recipientIds: [g.teams()[0].id], name: 'Sáng Tạo', points: 50 }]);
  g.run('publishRound', { roundId: round.id });
  g.run('revealSkip');
  const p = g.proj();
  const vm = vmOf(p, { since: p.now });
  assert.equal(vm.scene, 'results');
  const s = vm.standings;
  assert.equal(s.count, 10);
  assert.equal(s.rows.length, STANDINGS_PER_PAGE);
  assert.deepEqual(
    s.rows.map((r) => r.place),
    [1, 2, 2, 2, 2, 2, 2, 2],
  );
  assert.equal(s.showMovement, false, 'no movement arrows after round 1');
  assert.match(renderDisplay(vm), /Trang 1\/2 · Page 1 Of 2/);
  assert.match(renderDisplay(vm), /Bảng Xếp Hạng · Standings/);
  const next = standingsVm(p, { now: p.now + PAGE_MS, since: p.now, mode: 'bilingual' });
  assert.equal(next.page, 1);
  assert.equal(next.rows.length, 2);
  assert.equal(standingsVm(p, { now: p.now + 2 * PAGE_MS, since: p.now, mode: 'bilingual' }).page, 0);
  // Ranks are what the projection says: the leader's total with its place.
  assert.equal(s.rows[0].totalText, '150');
});

test('movement arrows after round 2, in words as well as arrows', () => {
  const g = game(['Đội A', 'Đội B']);
  g.run('startEvent');
  const [a, b] = g.teams().map((t) => t.id);
  let r = toReview(g, [{ recipientType: 'team', recipientIds: [a], name: 'X', points: 50 }]);
  g.run('publishRound', { roundId: r.id });
  g.run('revealSkip');
  r = toReview(g, [{ recipientType: 'team', recipientIds: [b], name: 'Y', points: 500 }]);
  g.run('publishRound', { roundId: r.id });
  g.run('revealSkip');
  const vm = vmOf(g.proj());
  assert.equal(vm.standings.showMovement, true);
  const out = renderDisplay(vm);
  assert.match(out, /▲1/);
  assert.match(out, /▼1/);
  assert.match(out, /Lên 1 Hạng · Up 1/);
  assert.match(out, /Xuống 1 Hạng · Down 1/);
  assert.deepEqual(movementVm(0)?.arrow, '–');
  assert.equal(movementVm(null), null);
});

test('finished: the final standings and only then the leading individuals', () => {
  const g = game(['Đội Phaolô', 'Đội Giuse']);
  const [a] = g.teams().map((t) => t.id);
  g.run('addMember', { name: 'Mai', teamId: a });
  g.run('addMember', { name: 'Lan', teamId: a });
  const [mai] = g.app.getEvent().roster.map((m) => m.id);
  g.run('startEvent');
  const r = toReview(g, [{ recipientType: 'member', recipientIds: [mai], name: 'Dẫn Truyện', points: 25 }]);
  g.run('publishRound', { roundId: r.id });
  g.run('revealSkip');
  assert.doesNotMatch(html(g.proj()), /Cá Nhân Nổi Bật/, 'no leaders before the end');
  g.run('endEvent');
  const vm = vmOf(g.proj());
  assert.equal(vm.scene, 'finished');
  assert.deepEqual(
    vm.leaders.map((l) => l.name),
    ['Mai'],
    'never anyone at zero',
  );
  const out = renderDisplay(vm);
  assert.match(out, /Bảng Xếp Hạng Chung Cuộc · Final Standings/);
  assert.match(out, /Cá Nhân Nổi Bật · Leading Individuals/);
  assert.match(out, /Mai/);
  assert.doesNotMatch(out, /Lan/);
  assert.equal(pageKeyOf(g.proj()), 'finished');
});

test('the host-closed and new-team chips', () => {
  const g = game(['Đội Phaolô']);
  g.run('startEvent');
  g.run('nextRound');
  g.run('startPreparation');
  g.run('endPreparation');
  g.run('addTeamMidGame', { name: 'Đội Mới Đến', translation: 'Late Team' });
  g.run('nextTeam');
  g.run('nextTeam');
  const vm = vmOf(g.proj(), { hostClosed: true });
  assert.equal(vm.performer.isNew, true);
  const out = renderDisplay(vm);
  assert.match(out, /Đội Mới · New Team/);
  assert.match(out, /Cửa Sổ Quản Trò Đã Đóng · Host Window Closed/);
  assert.doesNotMatch(renderDisplay(vmOf(g.proj())), /Host Window Closed/);
});

test('the test pattern puts a round title, a banner and a timer up', () => {
  const g = game();
  const vm = vmOf(g.proj(), { testPattern: true });
  assert.equal(vm.scene, 'test');
  const out = renderDisplay(vm);
  assert.match(out, /Vòng 4 · Hoạt Cảnh Kinh Thánh/);
  assert.match(out, /Cùng Nhau Tỏa Sáng/);
  assert.match(out, /\+75 Team Points/);
  assert.match(out, /larp-dtimer/);
  assert.match(out, /Mẫu Kiểm Tra · Test Pattern/);
  assert.equal(pageKeyOf(g.proj(), true), 'test');
});

test('each zone carries a key, so the window re-animates only what changed', () => {
  const g = game();
  g.run('startEvent');
  g.run('nextRound');
  g.run('startPreparation');
  const p = g.proj();
  const a = html(p);
  const b = html(p, { now: p.now + 1000 });
  const keys = (s) => [...s.matchAll(/data-zone="(\w+)" data-key="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`);
  assert.deepEqual(keys(a), keys(b));
  assert.notEqual(a, b, 'the timer moved');
  assert.ok(keys(a).some((k) => k.startsWith('top=')));
});

test('displayView helpers', () => {
  assert.deepEqual(pairOf('label.roundsN', { n: 3 }), { vi: '3 Vòng', en: '3 Rounds' });
  assert.deepEqual(pairOf('nope'), { vi: 'nope', en: 'nope' });
  assert.equal(docLang('en-first'), 'en');
  assert.equal(docLang('vi-only'), 'vi');
  assert.equal(unitLang('vi-only'), 'vi');
  assert.equal(unitLang('bilingual'), 'en');
  assert.deepEqual(pageOf(0, 8, 0, 0), { page: 0, pages: 1, start: 0, end: 0 });
  assert.deepEqual(pageOf(17, 8, 2 * PAGE_MS + 1, 1), { page: 2, pages: 3, start: 16, end: 17 });
  assert.equal(pageOf(17, 8, -5, 0).page, 0);
  const t1 = trackSince(null, 'a', 5);
  assert.deepEqual(t1, { key: 'a', since: 5 });
  assert.equal(trackSince(t1, 'a', 9), t1);
  assert.deepEqual(trackSince(t1, 'b', 9), { key: 'b', since: 9 });
  const b = bannerOf({ id: 'x', recipientType: 'team', name: 'R', translation: '', points: 0, recipientName: '' });
  assert.equal(b.kind, 'recognition');
  assert.equal(b.tag.en, 'Recognition');
  assert.equal(revealVm({ reveal: null, revealSteps: [] }), null);
});

test('in vi-only mode units and numbers are Vietnamese', () => {
  const g = game(['Đội Phaolô']);
  const team = g.teams()[0].id;
  g.run('setConfig', { displayMode: 'vi-only' });
  g.run('startEvent');
  toReview(g, [{ recipientType: 'team', recipientIds: [team], name: 'Sáng Tạo', points: 1500 }]);
  g.run('publishRound', { roundId: g.proj().round.id });
  g.run('revealAdvance');
  const out = html(g.proj());
  assert.match(out, /\+1\.500 Điểm Đội/);
  assert.doesNotMatch(out, /Team Points/);
});

test('display text is 7:1 or better on its opaque panels (read from the stylesheet)', () => {
  const css = readFileSync(new URL('../src/larp/css/display.css', import.meta.url), 'utf8');
  const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
  const hex = (src, name) => {
    const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(src);
    assert.ok(m, `${name} is a plain hex color`);
    return m[1];
  };
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const panel = hex(css, '--d-panel');
  assert.ok(ratio(hex(tokens, '--c-bone'), panel) >= 7);
  assert.ok(ratio(hex(css, '--d-dim'), panel) >= 7);
  assert.ok(ratio(hex(css, '--d-amber'), panel) >= 4.5, 'the amber ring stands out');
});

test("a long reveal groups each team on one page, a row at a time, within the round's 30–60 s", () => {
  const names = Array.from({ length: 8 }, (_, i) => `Đội ${i + 1}`);
  const g = game(names);
  g.run('startEvent');
  const awards = g.teams().flatMap((tm) =>
    [50, 25, -25, 10].map((points, i) => ({
      recipientType: 'team',
      recipientIds: [tm.id],
      name: `Giải ${i + 1}`,
      translation: `Award ${i + 1}`,
      points,
    })),
  );
  toReview(g, awards);
  g.run('publishRound', { roundId: g.proj().round.id });
  const steps = g.proj().revealSteps;
  assert.equal(steps.length, 8 + 32 + 1);
  assert.equal(revealGrouped(steps), true, 'one banner each would take 2 minutes');
  const length = revealLength(steps);
  assert.ok(length <= REVEAL_TARGET_MS, `grouped it takes ${length} ms`);
  assert.equal(length, 8 * (GROUP_HEAD_MS + 3 * GROUP_ROW_MS + GROUP_HOLD_MS));
  assert.equal(revealDwell(steps, 0), GROUP_HEAD_MS, "a team's header");
  assert.equal(revealDwell(steps, 1), GROUP_ROW_MS, 'a row');
  assert.equal(revealDwell(steps, 4), GROUP_HOLD_MS, "the team's full page, with its round score");
  assert.equal(revealDwell(steps, steps.length - 1), 0, 'the standings end the reveal');

  // One focus: the team's page, its rows arriving in place (the zone keeps its key), no banner.
  const head = vmOf(g.proj());
  assert.equal(head.reveal.grouped, true);
  let out = renderDisplay(head);
  assert.doesNotMatch(out, /larp-dbanner/);
  assert.match(out, /larp-dteampage is-grouped/);
  assert.doesNotMatch(out, /data-zone="right"/);
  const key = (/** @type {string} */ markup) => /data-zone="left" data-key="([^"]+)"/.exec(markup)?.[1];
  const first = key(out);
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    g.run('revealAdvance');
    out = renderDisplay(vmOf(g.proj()));
    assert.equal(key(out), first, 'the page stays; a row is added');
    assert.doesNotMatch(out, /larp-dbanner/);
    assert.equal((out.match(/class="larp-dline /g) ?? []).length, i + 1);
    seen.add(vmOf(g.proj()).reveal.banner.name);
  }
  assert.match(out, /Điểm Vòng · Round Score/);
  assert.equal(seen.size, 4, 'every award shows');
  g.run('revealAdvance');
  assert.notEqual(key(renderDisplay(vmOf(g.proj()))), first, 'the next team gets its own page');

  // A short queue keeps one banner every 3 s.
  const short = [
    { kind: 'team', teamId: 'a', adjustmentId: null },
    { kind: 'award', teamId: 'a', adjustmentId: 'x' },
    { kind: 'standings', teamId: null, adjustmentId: null },
  ];
  assert.equal(revealGrouped(short), false);
  assert.equal(revealDwell(short, 1), REVEAL_BANNER_MS);
  assert.equal(revealLength(short), 2 * REVEAL_BANNER_MS);
  assert.equal(revealDwell(short, 9), 0);
});

test('Vietnamese only shows no English: no team translations, and the default prompts in Vietnamese', () => {
  const g = game(['Đội Phaolô', 'Đội Giuse']);
  g.run('setConfig', { displayMode: 'vi-only' });
  let out = html(g.proj());
  assert.match(out, /Đội Phaolô/);
  assert.doesNotMatch(out, /Team Phaolô/, 'Welcome: no translation line');
  g.run('startEvent');
  g.run('nextRound');
  out = html(g.proj());
  const faith = ROUND_CATEGORIES.find((c) => c.key === 'faith');
  assert.doesNotMatch(out, /patron saint/, 'the English default prompt is not shown');
  assert.match(out, /lang="vi">Hãy kể một điều về thánh quan thầy/);
  assert.doesNotMatch(out, /Team Phaolô|Team Giuse/, 'Up Next: no translation line');
  assert.equal(tr('hint.defaultPrompt.faith', 'en'), faith.prompt);

  // Bilingual: the default prompt is English, tagged so, beside its Vietnamese.
  g.run('setConfig', { displayMode: 'bilingual' });
  out = html(g.proj());
  assert.match(out, /lang="vi">Hãy kể một điều/);
  assert.match(out, /lang="en">Tell us one thing about your team&#39;s patron saint/);
  assert.match(out, /Team Phaolô/, 'bilingual keeps the translations');

  // A prompt the host typed is shown as entered, its translation beside it.
  const round = { ...g.proj().round, prompt: 'Kể về thánh bổn mạng', promptTranslation: 'Tell us about your patron' };
  assert.deepEqual(promptPair(round), { vi: 'Kể về thánh bổn mạng', en: 'Tell us about your patron' });
  // The default prompt with a translation the host typed for it: that translation is the Vietnamese.
  assert.deepEqual(promptPair({ ...round, prompt: faith.prompt, promptTranslation: 'Bản dịch' }), {
    vi: 'Bản dịch',
    en: faith.prompt,
  });
});
