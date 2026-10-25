// The host console's Review and History tabs (src/larp/hostReview.js). Review: the round's teams
// side by side (completion status, completion points, team and individual awards with author and
// private note, round score and projected total), the flags scoring.flags finds (duplicates, large
// values, teams without individual recognition, unset statuses), Edit / Remove / Undo, Reopen
// Judging, Publish And Reveal (confirmed first, disabled with "2 teams need a status.") and the
// reveal's estimated length. History: every published round's frozen result, skipped rounds, the
// corrections (Add Correction: a signed difference, a public reason, an optional original award),
// team standings and the full individual ranking (ties 1, 1, 3). Pure view models and markup, plus
// the handlers driven against a real app with injected storage and clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORRECTION_FORM,
  EDIT_FORM,
  checkCorrection,
  correctionRecipients,
  correctionTargets,
  flagItems,
  historyActions,
  historyTab,
  historyVm,
  memberRanking,
  publishState,
  renderHistory,
  renderReview,
  reviewActions,
  reviewColumns,
  reviewTab,
  reviewVm,
  roundName,
} from '../src/larp/hostReview.js';
import { createApp } from '../src/larp/app.js';
import { createUiStore, defaultUi } from '../src/larp/uiState.js';
import { HOST_GM_ID } from '../src/larp/types.js';
import { formatClock } from '../src/larp/strings.js';
import { revealSteps } from '../src/larp/phases.js';
import { eventWithTeams, fakeStorage, makeClock, makeIds } from './lib/larpFixtures.mjs';

const LINK = { active: true, takenOver: false, otherHost: 'none', display: 'open', displayWebgl: true };

/**
 * A real app with teams, members and a co-GM, walked to round 1 (Faith Discovery, base 100):
 * 'review' (every team performed, Review Round chosen), 'performances' or 'setup'.
 */
function makeGame({ teams = ['Đội Phaolô', 'Đội Giuse', 'Đội Maria'], members = 2, phase = 'review' } = {}) {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('v') });
  app.newEvent();
  for (const name of teams) app.dispatch('addTeam', { name, translation: name.replace('Đội', 'Team') });
  for (const team of app.getEvent().teams) {
    const names = Array.from({ length: members }, (_, k) => `${team.name.replace('Đội ', '')} ${k + 1}`);
    if (names.length) app.dispatch('addMembers', { names, teamId: team.id });
  }
  app.dispatch('addGm', { name: 'Anh B.' });
  if (phase !== 'setup') {
    for (const type of ['startEvent', 'nextRound', 'startPreparation', 'endPreparation']) {
      assert.equal(app.dispatch(type, {}).error, null, type);
    }
    for (let i = 0; i < teams.length; i++) app.dispatch('nextTeam', {});
    if (phase === 'review') assert.equal(app.dispatch('beginReview', {}).error, null);
  }
  const ui = createUiStore({ storage: fakeStorage() });
  const log = { confirms: [], focus: [] };
  const env = {
    now: clock.now,
    report: (r) => {
      if (!r.ok && r.error) ui.set({ flash: { kind: 'error', key: `error.${r.error.code}` } });
      return r.ok;
    },
    confirm: (p) => log.confirms.push(p),
    download() {},
    openDisplay() {},
    focus: (sel) => log.focus.push(sel),
    post() {},
  };
  const review = reviewActions(app, ui, env);
  const history = historyActions(app, ui, env);
  const all = { ...review, ...history };
  /** Run a handler as the DOM would: el carries data-* as dataset. */
  const run = (name, { value, dataset = {}, confirmed } = {}) =>
    all[name]({ el: /** @type {any} */ ({ dataset }), event: null, value, confirmed });
  const ctx = () => ({
    event: app.getEvent(),
    ui: ui.get(),
    now: clock.now(),
    lang: app.getEvent().config.hostLang,
    saveStatus: app.getSaveStatus(),
    link: LINK,
    projection: null,
  });
  const teamIds = () => app.getEvent().rounds[0].order;
  const member = (teamId, k = 0) => app.getEvent().roster.filter((m) => m.teamId === teamId)[k];
  const coGm = () => app.getEvent().gms.find((g) => !g.host).id;
  /** @param {Record<string, unknown>} p */
  const award = (p) => {
    const r = app.dispatch('addAward', { recipientType: 'team', translation: '', note: '', ...p });
    assert.equal(r.error, null, JSON.stringify(r.error));
    return r;
  };
  const setAll = (status = 'complete') => {
    for (const id of teamIds()) app.dispatch('setStatus', { teamId: id, status });
  };
  const draft = (form, fields) => {
    for (const [k, v] of Object.entries(fields)) ui.setDraft(form, k, v);
  };
  return {
    app,
    ui,
    env,
    log,
    clock,
    run,
    ctx,
    teamIds,
    member,
    coGm,
    award,
    setAll,
    draft,
    rvm: () => reviewVm(ctx()),
    rhtml: () => renderReview(reviewVm(ctx())),
    hvm: () => historyVm(ctx()),
    hhtml: () => renderHistory(historyVm(ctx())),
  };
}

/** Publish round 1 from Review with every team complete. */
function publish(f) {
  f.setAll();
  f.run('review.publish', { confirmed: true });
  assert.equal(f.app.getEvent().results.length, 1);
}

// ── The interface ─────────────────────────────────────────────────────────────────────────────

test('both screens follow the interface: ids, labels, namespaced handlers', () => {
  const f = makeGame();
  assert.equal(reviewTab.id, 'review');
  assert.equal(reviewTab.labelKey, 'tab.review');
  assert.equal(reviewTab.vm, reviewVm);
  assert.equal(reviewTab.render, renderReview);
  assert.equal(historyTab.id, 'history');
  assert.equal(historyTab.labelKey, 'tab.history');
  assert.equal(historyTab.vm, historyVm);
  assert.equal(historyTab.render, renderHistory);
  for (const name of Object.keys(reviewTab.actions(f.app, f.ui, f.env))) assert.match(name, /^review\.[A-Za-z]+$/);
  for (const name of Object.keys(historyTab.actions(f.app, f.ui, f.env))) assert.match(name, /^history\.[A-Za-z]+$/);
});

// ── Review ────────────────────────────────────────────────────────────────────────────────────

test('outside a round Review says what will appear and offers nothing to press', () => {
  const event = eventWithTeams(2);
  const vm = reviewVm({ event, ui: defaultUi(), now: 0, lang: 'en', saveStatus: { state: 'idle' }, link: LINK });
  assert.equal(vm.state, 'idle');
  const html = renderReview(vm);
  assert.match(html, /class="larp-panel larp-review/);
  assert.match(html, /Once a round starts, its teams appear here side by side\./);
  assert.doesNotMatch(html, /data-action/);
});

test('the teams stand side by side in queue order with completion, awards, author and private note', () => {
  const f = makeGame();
  const [a, b, c] = f.teamIds();
  f.app.dispatch('setStatus', { teamId: a, status: 'complete' });
  f.app.dispatch('setStatus', { teamId: b, status: 'passed' });
  // A08 in round 1's numbers: +75, +50, −25 on a completed 100 previews 200.
  f.award({ recipientIds: [a], name: 'Cùng Nhau Tỏa Sáng', translation: 'Shine Together', points: 75, note: 'Lovely' });
  f.award({ recipientIds: [a], name: 'Sáng Tạo', points: 50, authorId: f.coGm() });
  f.award({ recipientIds: [a], name: 'Quá Giờ', points: -25 });
  // A09: Mai's +25 goes in Phaolô's column as individual points and leaves the team score alone.
  f.award({ recipientType: 'member', recipientIds: [f.member(a).id], name: 'Clear Narration', points: 25 });

  const vm = f.rvm();
  assert.equal(vm.state, 'review');
  assert.equal(vm.round, 'Round 1 · Faith Discovery');
  assert.deepEqual(
    vm.columns.map((col) => col.team.id),
    [a, b, c],
  );
  const [pa, pb, pc] = vm.columns;
  assert.equal(pa.status, 'complete');
  assert.equal(pa.completion, 100);
  assert.equal(pa.awardSum, 100);
  assert.equal(pa.roundScore, 200);
  assert.equal(pa.total, 200);
  assert.deepEqual(
    pa.teamAwards.map((r) => [r.name, r.points, r.author, r.note]),
    [
      ['Cùng Nhau Tỏa Sáng', 75, 'Host', 'Lovely'],
      ['Sáng Tạo', 50, 'Anh B.', ''],
      ['Quá Giờ', -25, 'Host', ''],
    ],
  );
  assert.deepEqual(
    pa.memberAwards.map((r) => [r.recipient, r.points, r.unit]),
    [['Phaolô 1', 25, 'individual']],
  );
  assert.equal(pb.status, 'passed');
  assert.equal(pb.completion, 0);
  assert.equal(pc.status, null);
  assert.equal(vm.statusCount, '2 Of 3 Teams Have a Status');

  const html = f.rhtml();
  assert.match(html, /class="larp-review-cols"/);
  assert.match(html, /\+75 Team Points/);
  assert.match(html, /−25 Team Points/);
  assert.match(html, /\+25 Individual Points/);
  assert.match(html, /Shine Together/);
  assert.match(html, /From Anh B\./);
  assert.match(html, /Lovely/);
  assert.match(html, /Private Note/);
  // The status picker per team, labelled with the team; unset is the outlined dash.
  assert.match(html, /data-change="review.status" data-team-id="[^"]+" aria-label="Status · Đội Maria"/);
  assert.match(html, /is-unset/);
  assert.match(html, /Round Score/);
  assert.match(html, /200/);
});

test('flags: duplicates, large values, teams without individual awards and unset statuses', () => {
  const f = makeGame();
  const [a, b] = f.teamIds();
  f.app.dispatch('setStatus', { teamId: a, status: 'complete' });
  f.award({ recipientIds: [b], name: 'Sáng Tạo', points: 50 });
  f.award({ recipientIds: [b], name: 'sang tao', points: 25, duplicateReason: 'Two moments' });
  f.award({ recipientIds: [a], name: 'Huge', points: 150 });
  f.award({ recipientType: 'member', recipientIds: [f.member(a).id], name: 'Helper', points: 25 });

  const items = flagItems(f.app.getEvent(), f.app.getEvent().rounds[0], 'en');
  assert.deepEqual(
    items.map((x) => x.kind),
    ['unset', 'duplicate', 'large', 'noIndividual'],
  );
  assert.equal(items[0].text, 'No status yet: Đội Giuse, Đội Maria.');
  assert.equal(items[1].text, 'Đội Giuse has 2 awards named “Sáng Tạo”.');
  assert.equal(items[2].text, 'Đội Phaolô: +150 Team Points is more than the 100 completion points.');
  assert.equal(items[3].text, 'No individual awards yet: Đội Giuse, Đội Maria');

  const cols = reviewColumns(f.app.getEvent(), f.app.getEvent().rounds[0], defaultUi(), 'en');
  const giuse = cols.columns[1];
  assert.deepEqual(
    giuse.teamAwards.map((r) => [r.duplicate, r.kept]),
    [
      [true, null],
      [true, 'Two moments'],
    ],
  );
  assert.equal(cols.columns[0].teamAwards[0].large, true);
  assert.equal(cols.columns[0].noIndividual, false);
  assert.equal(giuse.noIndividual, true);

  const html = f.rhtml();
  assert.match(html, /Duplicate/);
  assert.match(html, /Kept: Two moments/);
  assert.match(html, /Large Value/);
  assert.match(html, /No Individual Awards Yet/);

  // Nothing flagged says so.
  const g = makeGame({ members: 0 });
  g.setAll();
  assert.deepEqual(flagItems(g.app.getEvent(), g.app.getEvent().rounds[0], 'en'), []);
  assert.match(g.rhtml(), /Nothing is flagged\./);
});

test('Publish And Reveal is disabled while a team has no status, and says how many', () => {
  const f = makeGame();
  const [a] = f.teamIds();
  f.app.dispatch('setStatus', { teamId: a, status: 'complete' });
  let p = publishState(f.app.getEvent(), 'en');
  assert.equal(p.label, 'Publish And Reveal Round 1');
  assert.equal(p.blocked, '2 teams need a status.');
  let html = f.rhtml();
  assert.match(html, /data-action="review.publish"[^>]*aria-disabled="true"/);
  assert.match(html, /2 teams need a status\./);
  // It is never the primary button: the shell's next action is the only one (U04).
  assert.doesNotMatch(html, /larp-btn-primary/);

  f.app.dispatch('setStatus', { teamId: f.teamIds()[1], status: 'absent' });
  assert.equal(publishState(f.app.getEvent(), 'en').blocked, '1 team needs a status.');
  f.setAll();
  p = publishState(f.app.getEvent(), 'en');
  assert.equal(p.blocked, null);
  html = f.rhtml();
  assert.doesNotMatch(html, /data-action="review.publish"[^>]*aria-disabled/);
  assert.match(html, /data-action="review.reopen"/);

  // In Vietnamese.
  assert.equal(publishState(f.app.getEvent(), 'vi').label, 'Công Bố Và Trình Chiếu Vòng 1');
});

test('the reveal length is estimated from the banners the round would show', () => {
  const f = makeGame();
  const [a, b] = f.teamIds();
  f.award({ recipientIds: [a], name: 'One', points: 10 });
  f.award({ recipientIds: [b], name: 'Two', points: 20 });
  const event = f.app.getEvent();
  const steps = revealSteps(event, event.rounds[0].id);
  const vm = f.rvm();
  assert.equal(vm.reveal.banners, steps.length);
  // A banner every 3 s up to the standings (which end the reveal at once).
  assert.equal(vm.reveal.time, formatClock((steps.length - 1) * 3000));
  assert.match(f.rhtml(), new RegExp(`The reveal takes about ${vm.reveal.time}`));
});

test('publishing asks first, publishes once, then shows the Run tab with the reveal', () => {
  const f = makeGame();
  f.setAll();
  f.run('review.publish');
  assert.deepEqual(f.log.confirms, [
    { action: 'review.publish', hintKey: 'hint.confirmPublish', labelKey: 'action.publishReveal' },
  ]);
  assert.equal(f.app.getEvent().results.length, 0, 'nothing published before the confirmation');
  f.run('review.publish', { confirmed: true });
  f.run('review.publish', { confirmed: true });
  const event = f.app.getEvent();
  assert.equal(event.results.length, 1, 'a repeated confirmation publishes once (A13)');
  assert.equal(event.roundPhase, 'reveal');
  assert.equal(f.ui.get().tab, 'run');
  assert.equal(f.ui.get().flash, null);
  // Afterwards Review points to History.
  const vm = f.rvm();
  assert.equal(vm.state, 'published');
  assert.match(renderReview(vm), /add a correction in History/);
});

test('a blocked publish asks nothing and explains', () => {
  const f = makeGame();
  f.run('review.publish', { confirmed: false });
  assert.equal(f.log.confirms.length, 0);
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'hint.needStatusMany', vars: { n: 3 } });
  assert.equal(f.app.getEvent().roundPhase, 'review');
});

test('Reopen Judging goes back to performances; before Review the tab compares but cannot publish', () => {
  const f = makeGame();
  f.run('review.reopen', { dataset: { revision: '7' } });
  assert.equal(f.app.getEvent().roundPhase, 'performances');
  const vm = f.rvm();
  assert.equal(vm.state, 'judging');
  assert.equal(vm.publish, null);
  const html = renderReview(vm);
  assert.match(html, /Choose Review Round to lock Judge Mode, then publish\./);
  assert.doesNotMatch(html, /review\.publish|review\.reopen/);
  assert.match(html, /larp-review-cols/);
});

test('Edit changes an award in place; Cancel leaves it as it was', () => {
  const f = makeGame();
  const [a] = f.teamIds();
  f.award({ recipientIds: [a], name: 'Sáng Tạo', points: 75, note: 'first' });
  const adj = f.app.getEvent().adjustments[0];
  f.run('review.edit', { value: adj.id });
  assert.deepEqual(f.ui.draft(EDIT_FORM), {
    name: 'Sáng Tạo',
    translation: '',
    points: '75',
    note: 'first',
    reason: '',
  });
  let vm = f.rvm();
  assert.equal(vm.columns[0].teamAwards[0].editing, true);
  let html = renderReview(vm);
  assert.match(html, /data-draft="reviewEdit.name"/);
  assert.match(html, /data-draft="reviewEdit.points"/);
  assert.match(html, /data-action="review.saveEdit"/);
  assert.match(html, /data-focus="review-edit"/);
  assert.deepEqual(f.log.focus, ['[data-focus="review-edit"]']);

  f.draft(EDIT_FORM, { points: '−25', note: 'changed' });
  f.run('review.saveEdit');
  const after = f.app.getEvent().adjustments[0];
  assert.equal(after.points, -25);
  assert.equal(after.note, 'changed');
  assert.equal(f.rvm().columns[0].teamAwards[0].editing, false);

  // A bad amount is refused with a reason and keeps the form open.
  f.run('review.edit', { value: adj.id });
  f.draft(EDIT_FORM, { points: '1.5' });
  vm = f.rvm();
  assert.equal(vm.edit.error, 'Enter whole points, such as +50 or −25.');
  f.run('review.saveEdit');
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'error.invalid_points' });
  assert.equal(f.app.getEvent().adjustments[0].points, -25);
  f.run('review.cancelEdit');
  assert.equal(f.rvm().edit, null);
  assert.deepEqual(f.ui.draft(EDIT_FORM), {});
  html = f.rhtml();
  assert.doesNotMatch(html, /reviewEdit/);
  // Editing something that's gone does nothing.
  f.run('review.edit', { value: 'nope' });
  assert.equal(f.rvm().edit, null);
});

test('Remove takes an award out at once, with Undo for a few seconds', () => {
  const f = makeGame();
  const [a] = f.teamIds();
  f.award({ recipientIds: [a], name: 'Oops', points: 30 });
  const id = f.app.getEvent().adjustments[0].id;
  f.run('review.remove', { value: id });
  assert.equal(f.app.getEvent().adjustments[0].status, 'discarded');
  const vm = f.rvm();
  assert.equal(vm.columns[0].teamAwards.length, 0);
  assert.deepEqual(vm.undo, { text: 'Removed “Oops”.' });
  assert.match(renderReview(vm), /data-action="review.undo"/);
  f.run('review.undo');
  const live = f.app.getEvent().adjustments.filter((x) => x.status === 'draft');
  assert.deepEqual(
    live.map((x) => [x.name, x.points]),
    [['Oops', 30]],
  );
  assert.equal(f.rvm().undo, null);
  // Undo lapses after UNDO_MS.
  f.run('review.remove', { value: live[0].id });
  f.clock.advance(60_000);
  assert.equal(f.rvm().undo, null);
});

test('the status picker sets and unsets a team status', () => {
  const f = makeGame();
  const [a] = f.teamIds();
  f.run('review.status', { value: 'complete', dataset: { teamId: a } });
  assert.equal(f.app.getEvent().rounds[0].statuses[a], 'complete');
  f.run('review.status', { value: '', dataset: { teamId: a } });
  assert.equal(f.app.getEvent().rounds[0].statuses[a], undefined);
  f.run('review.status', { value: 'complete', dataset: {} });
  assert.equal(f.app.getEvent().rounds[0].statuses[a], undefined);
});

test('names, notes and reasons with markup are escaped; Vietnamese stays intact (A22)', () => {
  const f = makeGame({ teams: ['<b>Đội</b> "X"', 'Đội Giuse'] });
  const [a] = f.teamIds();
  f.award({ recipientIds: [a], name: '<img src=x onerror=alert(1)>', points: 10, note: '<script>x</script>' });
  const html = f.rhtml();
  assert.doesNotMatch(html, /<img src=x|<script>|<b>Đội/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;Đội&lt;\/b&gt; &quot;X&quot;/);
});

test('Review in Vietnamese', () => {
  const f = makeGame();
  f.app.dispatch('setConfig', { hostLang: 'vi' });
  const vm = f.rvm();
  assert.equal(vm.round, 'Vòng 1 · Khám Phá Đức Tin');
  assert.equal(vm.publish.blocked, 'Còn 3 đội chưa có trạng thái.');
  assert.match(renderReview(vm), /Mở Lại Chấm Điểm/);
});

test('a hundred teams all get a column (A26)', () => {
  const f = makeGame({ teams: Array.from({ length: 100 }, (_, i) => `Đội ${i + 1}`), members: 0 });
  assert.equal(f.rvm().columns.length, 100);
});

// ── History ───────────────────────────────────────────────────────────────────────────────────

test('before anything is published History says so and corrections wait for the event', () => {
  const f = makeGame({ phase: 'setup' });
  const vm = f.hvm();
  assert.equal(vm.rounds.length, 0);
  assert.equal(vm.form.blocked, 'Corrections open once the event starts.');
  const html = renderHistory(vm);
  assert.match(html, /class="[^"]*larp-history/);
  assert.match(html, /No round is published yet\./);
  assert.match(html, /No corrections yet\./);
  assert.match(html, /data-action="history.correct"[^>]*aria-disabled="true"/);
});

test('a published round shows its frozen result: statuses, completion, awards with authors and notes', () => {
  const f = makeGame();
  const [a, b] = f.teamIds();
  f.award({ recipientIds: [a], name: 'Shine', points: 75, note: 'secret', authorId: f.coGm() });
  f.award({ recipientType: 'member', recipientIds: [f.member(b).id], name: 'Narration', points: 25 });
  f.setAll();
  f.app.dispatch('setStatus', { teamId: b, status: 'passed' });
  f.run('review.publish', { confirmed: true });
  // A later rename never changes history.
  f.app.dispatch('editTeam', { teamId: a, name: 'Renamed' });

  const vm = f.hvm();
  assert.equal(vm.rounds.length, 1);
  const r = vm.rounds[0];
  assert.equal(r.title, 'Round 1 · Faith Discovery');
  assert.equal(r.skipped, false);
  assert.deepEqual(
    r.teams.map((x) => [x.status, x.completion, x.score]),
    [
      ['complete', 100, 175],
      ['passed', 0, 0],
      ['complete', 100, 100],
    ],
  );
  assert.deepEqual(
    r.teams[0].awards.map((x) => [x.name, x.points, x.author, x.note]),
    [['Shine', 75, 'Anh B.', 'secret']],
  );
  assert.deepEqual(
    r.individual.map((x) => [x.recipient, x.name, x.points]),
    [['Giuse 1', 'Narration', 25]],
  );
  const html = renderHistory(vm);
  assert.match(html, /Round 1 · Faith Discovery/);
  assert.match(html, /\+75 Team Points/);
  assert.match(html, /\+25 Individual Points/);
  assert.match(html, /secret/);
  assert.match(html, /Passed/);
});

test('a skipped round is listed as skipped', () => {
  const f = makeGame();
  publish(f);
  f.app.dispatch('revealSkip', {});
  const next = f.app.getEvent().rounds[1];
  assert.equal(f.app.dispatch('skipRound', { roundId: next.id }).error, null);
  const vm = f.hvm();
  assert.deepEqual(
    vm.rounds.map((r) => [r.title, r.skipped]),
    [
      ['Round 1 · Faith Discovery', false],
      ['Round 2 · Dance', true],
    ],
  );
  assert.match(renderHistory(vm), /Skipped/);
});

test('the correction form is checked in order and builds its payload', () => {
  const f = makeGame();
  const [a] = f.teamIds();
  f.award({ recipientIds: [a], name: 'Shine', points: 75 });
  publish(f);
  const event = f.app.getEvent();
  const adj = event.results[0].adjustments[0];

  const blocked = (draft) => checkCorrection(event, draft).blocked;
  assert.equal(blocked({}), 'error.no_recipients');
  assert.equal(blocked({ recipient: a }), 'error.invalid_points');
  assert.equal(blocked({ recipient: a, points: '0' }), 'error.zero_correction');
  assert.equal(blocked({ recipient: a, points: '−25' }), 'error.invalid_reason');
  assert.equal(blocked({ recipient: a, points: '−25', reason: 'x'.repeat(121) }), 'error.invalid_reason');
  assert.equal(blocked({ recipient: 'nobody', points: '−25', reason: 'r' }), 'error.no_recipients');
  const ok = checkCorrection(event, { recipient: a, points: '−25', reason: ' Should be +50 ', target: adj.id });
  assert.equal(ok.blocked, null);
  assert.equal(ok.before, 175);
  assert.equal(ok.after, 150);
  assert.deepEqual(
    checkCorrection(event, { recipient: a, points: '−25', reason: ' Should be +50 ', target: adj.id }).payload,
    {
      recipientType: 'team',
      recipientId: a,
      points: -25,
      reason: 'Should be +50',
      translation: '',
      note: '',
      roundId: event.rounds[0].id,
      targetAdjustmentId: adj.id,
    },
  );
  // A target of another recipient, or outside the chosen round, is ignored.
  const other = checkCorrection(event, { recipient: f.teamIds()[1], points: '5', reason: 'r', target: adj.id });
  assert.equal(other.payload.targetAdjustmentId, null);
  assert.deepEqual(
    correctionTargets(event, 'team', a, null).map((x) => x.id),
    [adj.id],
  );
  assert.deepEqual(correctionTargets(event, 'team', a, 'round-nope'), []);
  assert.equal(checkCorrection(event, { recipient: a, round: 'round-nope' }).payload.roundId, null);
});

test('Add Correction changes the total once and keeps both records (A15)', () => {
  const f = makeGame();
  const [a] = f.teamIds();
  f.award({ recipientIds: [a], name: 'Shine', points: 75 });
  publish(f);
  const adj = f.app.getEvent().results[0].adjustments[0];
  f.draft(CORRECTION_FORM, {
    recipient: a,
    points: '−25',
    reason: 'Should have been +50',
    translation: 'Đáng lẽ +50',
    note: 'Mixed up',
    target: adj.id,
  });
  let vm = f.hvm();
  assert.equal(vm.form.preview, 'Total: 175 → 150');
  f.run('history.correct', { dataset: { revision: '20' } });
  f.run('history.correct', { dataset: { revision: '20' } });
  const event = f.app.getEvent();
  assert.equal(event.corrections.length, 1, 'a double-click adds one correction');
  assert.equal(event.results[0].adjustments[0].points, 75, 'the original stays');
  assert.deepEqual(f.ui.get().flash, { kind: 'info', key: 'hint.correctionAdded', vars: { name: 'Đội Phaolô' } });
  assert.deepEqual(f.ui.draft(CORRECTION_FORM), { type: 'team' });

  vm = f.hvm();
  assert.deepEqual(
    vm.corrections.map((c) => [c.recipient, c.points, c.reason, c.translation, c.note, c.original, c.author]),
    [['Đội Phaolô', -25, 'Should have been +50', 'Đáng lẽ +50', 'Mixed up', 'Shine · +75 Team Points', 'Host']],
  );
  assert.equal(vm.corrections[0].round, 'Round 1 · Faith Discovery');
  assert.equal(vm.teams.find((r) => r.id === a).total, 150);
  const html = renderHistory(vm);
  assert.match(html, /−25 Team Points/);
  assert.match(html, /Should have been \+50/);
  assert.match(html, /Corrects: Shine · \+75 Team Points/);

  // A blocked form refuses with its reason.
  f.run('history.correct');
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'error.no_recipients' });
});

test('switching Team / Individual clears the recipient and the original award', () => {
  const f = makeGame();
  publish(f);
  f.draft(CORRECTION_FORM, { recipient: f.teamIds()[0], target: 'x', points: '5' });
  f.run('history.type', { value: 'member' });
  assert.deepEqual(f.ui.draft(CORRECTION_FORM), { recipient: '', target: '', points: '5', type: 'member' });
  f.run('history.type', { value: 'bogus' });
  assert.equal(f.ui.draft(CORRECTION_FORM).type, 'member');
  const vm = f.hvm();
  assert.equal(vm.form.type, 'member');
  assert.equal(vm.form.recipients.length, 6);
  assert.match(renderHistory(vm), /data-action="history.type" data-value="member" aria-pressed="true"/);
  // Picking from a select re-renders (its value is already kept as a draft).
  let renders = 0;
  f.ui.subscribe(() => renders++);
  f.run('history.refresh');
  assert.equal(renders, 1);
});

test('a removed member with published points can still be corrected and ranked', () => {
  const f = makeGame();
  const [a] = f.teamIds();
  const mai = f.member(a);
  f.award({ recipientType: 'member', recipientIds: [mai.id], name: 'Narration', points: 25 });
  publish(f);
  f.app.dispatch('removeMember', { memberId: mai.id });
  const event = f.app.getEvent();
  const opts = correctionRecipients(event, 'member', 'en');
  const gone = opts.find((o) => o.value === mai.id);
  assert.equal(gone.label, 'Phaolô 1 · Đội Phaolô · Removed From Roster');
  const ranking = memberRanking(event, 'en');
  assert.deepEqual(ranking[0], {
    id: mai.id,
    place: 1,
    name: 'Phaolô 1',
    team: 'Đội Phaolô',
    total: 25,
    removed: true,
  });
});

test('the full individual ranking: everyone, ties share a place (1, 1, 3), negatives included', () => {
  const f = makeGame();
  const [a, b, c] = f.teamIds();
  f.award({ recipientType: 'member', recipientIds: [f.member(a).id, f.member(b).id], name: 'Helper', points: 25 });
  f.award({ recipientType: 'member', recipientIds: [f.member(c).id], name: 'Late', points: -10 });
  publish(f);
  const ranking = memberRanking(f.app.getEvent(), 'en');
  assert.equal(ranking.length, 6);
  assert.deepEqual(
    ranking.map((r) => [r.name, r.place, r.total]),
    [
      ['Phaolô 1', 1, 25],
      ['Giuse 1', 1, 25],
      ['Phaolô 2', 3, 0],
      ['Giuse 2', 3, 0],
      ['Maria 2', 3, 0],
      ['Maria 1', 6, -10],
    ],
  );
  const vm = f.hvm();
  assert.deepEqual(
    vm.teams.map((r) => [r.place, r.total]),
    [
      [1, 100],
      [1, 100],
      [1, 100],
    ],
  );
  const html = renderHistory(vm);
  assert.match(html, /Individual Ranking/);
  assert.match(html, /Team Standings/);
  assert.match(html, /−10/);
});

test('History escapes what people typed', () => {
  const f = makeGame();
  const [a] = f.teamIds();
  f.award({ recipientIds: [a], name: '<i>n</i>', points: 5, note: '<u>' });
  publish(f);
  f.app.dispatch('addCorrection', { recipientType: 'team', recipientId: a, points: 5, reason: '<script>r</script>' });
  const html = f.hhtml();
  assert.doesNotMatch(html, /<i>n<\/i>|<u>|<script>/);
  assert.match(html, /&lt;script&gt;r&lt;\/script&gt;/);
});

test('round names and the host as author', () => {
  const f = makeGame();
  const event = f.app.getEvent();
  assert.equal(roundName(event, event.rounds[3], 'en'), 'Round 4 · Bible Skit');
  assert.equal(roundName(event, event.rounds[3], 'vi'), 'Vòng 4 · Hoạt Cảnh Kinh Thánh');
  f.award({ recipientIds: [f.teamIds()[0]], name: 'X', points: 1, authorId: HOST_GM_ID });
  f.app.dispatch('setConfig', { hostLang: 'vi' });
  assert.equal(f.rvm().columns[0].teamAwards[0].author, 'Quản Trò');
});
