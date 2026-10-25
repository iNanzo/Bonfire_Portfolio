// The host console's Run tab (src/larp/hostRun.js): the queue with completion statuses (unset is
// an outlined dash), the turn timer and its controls, Add Award (recipients defaulting to the team
// now performing, searchable when there are many, signed points with "Add −25" / "Add +25 Each ·
// 3 People" (U05), the duplicate warning with a reason to keep it, the large-value flag, templates
// and recent awards), this round's entries with Edit, Remove and Undo, and the projected totals
// ("Projected · not published", no individual awards yet, the reveal's length). Pure view models
// and markup, plus the handlers driven against a real app with injected storage and clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AWARD_FORM,
  RECENT_LIMIT,
  SEARCH_AT,
  TEMPLATE_LIMIT,
  UNDO_MS,
  addTemplate,
  authorOf,
  awardPayload,
  awardRecipients,
  checkAward,
  clickId,
  currentRound,
  editPayload,
  fillDraft,
  matches,
  performingTeamId,
  pointsText,
  projectedRows,
  readTemplates,
  recentAwards,
  recipientOptions,
  renderRun,
  runActions,
  runTab,
  runVm,
  turnKey,
  undoPayload,
} from '../src/larp/hostRun.js';
import { createApp } from '../src/larp/app.js';
import { createUiStore, defaultUi } from '../src/larp/uiState.js';
import { HOST_GM_ID } from '../src/larp/types.js';
import { atRound, eventWithTeams, fakeStorage, makeClock, makeIds, withAwards } from './lib/larpFixtures.mjs';

const LINK = { active: true, takenOver: false, otherHost: 'none', display: 'open', displayWebgl: true };

/** A real app with teams, members and a co-GM, walked to round 1's Performances (first team up). */
function makeRun({ teams = ['Đội Phaolô', 'Đội Giuse', 'Đội Maria'], members = 2, turn = 1 } = {}) {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('r') });
  app.newEvent();
  for (const name of teams) app.dispatch('addTeam', { name, translation: name.replace('Đội', 'Team') });
  for (const team of app.getEvent().teams) {
    const names = Array.from({ length: members }, (_, k) => `${team.name.replace('Đội ', '')} ${k + 1}`);
    if (names.length) app.dispatch('addMembers', { names, teamId: team.id });
  }
  app.dispatch('addGm', { name: 'Anh B.' });
  for (const type of ['startEvent', 'nextRound', 'startPreparation', 'endPreparation']) {
    assert.equal(app.dispatch(type, {}).error, null, type);
  }
  for (let i = 0; i < turn; i++) app.dispatch('nextTeam', {});
  const ui = createUiStore({ storage: fakeStorage() });
  const log = { confirms: [], downloads: [], focus: [] };
  const env = {
    now: clock.now,
    report: (r) => {
      if (!r.ok && r.error) ui.set({ flash: { kind: 'error', key: `error.${r.error.code}` } });
      return r.ok;
    },
    confirm: (p) => log.confirms.push(p),
    download: (...a) => log.downloads.push(a),
    openDisplay() {},
    focus: (sel) => log.focus.push(sel),
    post() {},
  };
  const handlers = runActions(app, ui, env);
  /** Run a handler as the DOM would: el carries data-* as dataset. */
  const run = (name, { value, dataset = {}, confirmed } = {}) =>
    handlers[name]({ el: /** @type {any} */ ({ dataset }), event: null, value, confirmed });
  const ctx = () => ({
    event: app.getEvent(),
    ui: ui.get(),
    now: clock.now(),
    lang: app.getEvent().config.hostLang,
    saveStatus: app.getSaveStatus(),
    link: LINK,
    projection: null,
  });
  const vm = () => runVm(ctx());
  const html = () => renderRun(vm());
  const teamIds = () => app.getEvent().rounds[0].order;
  const draft = (fields) => {
    for (const [k, v] of Object.entries(fields)) ui.setDraft(AWARD_FORM, k, v);
  };
  return { app, ui, env, log, clock, run, ctx, vm, html, teamIds, draft };
}

const drafts = (app, round) => app.getEvent().adjustments.filter((a) => a.roundId === round && a.status === 'draft');

test('the screen follows the interface: id, label, namespaced handlers', () => {
  const f = makeRun();
  assert.equal(runTab.id, 'run');
  assert.equal(runTab.labelKey, 'tab.run');
  assert.equal(runTab.vm, runVm);
  assert.equal(runTab.render, renderRun);
  for (const name of Object.keys(runActions(f.app, f.ui, f.env))) assert.match(name, /^run\.[A-Za-z]+$/);
});

test('outside a round the tab says what will appear, and nothing else', () => {
  const event = eventWithTeams(2);
  const vm = runVm({
    event,
    ui: defaultUi(),
    now: 0,
    lang: 'en',
    saveStatus: { state: 'idle' },
    link: LINK,
    projection: null,
  });
  assert.equal(vm.idle, true);
  const html = renderRun(vm);
  assert.match(html, /Once a round starts, its queue, timer and awards appear here\./);
  assert.doesNotMatch(html, /data-action/);
  assert.equal(currentRound(event), null);
  assert.equal(performingTeamId(event), null);
  assert.equal(currentRound({ ...atRound(event, 0, 'briefing'), phase: 'finished', roundPhase: null }), null);
});

test('the queue marks who performed, who is on and who is next, with a status picker per team', () => {
  const f = makeRun({ turn: 2 });
  const [a, b, c] = f.teamIds();
  f.app.dispatch('setStatus', { teamId: a, status: 'complete' });
  const q = f.vm().queue;
  assert.deepEqual(
    q.rows.map((r) => [r.id, r.state, r.status]),
    [
      [a, 'performed', 'complete'],
      [b, 'performing', null],
      [c, 'upNext', null],
    ],
  );
  assert.deepEqual(
    q.rows.map((r) => r.stateLabel),
    ['Performed', 'Performing', 'Up Next'],
  );
  const html = f.html();
  // Unset is an outlined dash; every picker is labelled with its team.
  assert.match(
    html,
    /class="larp-input larp-select larp-run-status" data-change="run.status" data-team-id="[^"]+" aria-label="Status · Đội Phaolô"/,
  );
  assert.match(
    html,
    /larp-run-status is-unset" data-change="run.status" data-team-id="[^"]+" aria-label="Status · Đội Giuse"/,
  );
  assert.match(
    html,
    /<option value="" selected>—<\/option><option value="complete">Complete<\/option><option value="passed">Passed<\/option><option value="absent">Absent<\/option>/,
  );
  // Picking the status sets it; the empty choice unsets it.
  f.run('run.status', { value: 'passed', dataset: { teamId: b } });
  assert.equal(f.app.getEvent().rounds[0].statuses[b], 'passed');
  f.run('run.status', { value: '', dataset: { teamId: b } });
  assert.equal(f.app.getEvent().rounds[0].statuses[b], undefined);
  f.run('run.status', { value: 'passed', dataset: {} });
  assert.equal(f.app.getEvent().rounds[0].statuses[b], undefined, 'no team, no command');
});

test('before performances the status is shown read-only; teams are not pickable before preparation', () => {
  const event = atRound(eventWithTeams(3), 0, 'briefing');
  const ctx = {
    event,
    ui: defaultUi(),
    now: 0,
    lang: 'en',
    saveStatus: { state: 'idle' },
    link: LINK,
    projection: null,
  };
  const vm = runVm(ctx);
  assert.equal(vm.queue.statusOpen, false);
  assert.equal(vm.queue.pickable, false);
  assert.equal(vm.queue.rows[0].state, 'upNext');
  assert.equal(vm.form, null);
  assert.equal(vm.closedHint, "Awards open when the round's preparation starts.");
  const html = renderRun(vm);
  assert.match(html, /larp-run-status-text is-unset" aria-label="Status · Đội 1: No Status">—</);
  assert.doesNotMatch(html, /run\.pick/);
  assert.match(html, /No timer runs in this phase\./);
  // A team that left the event is skipped, not drawn empty.
  const gone = { ...event, teams: event.teams.slice(1) };
  assert.equal(runVm({ ...ctx, event: gone }).queue.rows.length, 2);
});

test('the turn timer shows whose turn it is, with Pause, +30 s and Next Team naming the team', () => {
  const f = makeRun();
  const tm = f.vm().timer;
  assert.equal(tm.caption, 'Turn · Đội Phaolô');
  assert.equal(tm.toggle, 'Pause');
  assert.deepEqual(tm.nextTeam, { label: 'Next Team: Đội Giuse', disabled: false, hint: '' });
  const html = f.html();
  assert.match(html, /data-clock="countdown" data-status="running"/);
  assert.match(html, /data-action="timer.toggle"[^>]*>.*Pause.*<kbd class="larp-kbd">Space<\/kbd>/);
  assert.match(html, /data-action="timer.add30"/);
  assert.match(html, /data-action="run.nextTeam" data-revision="\d+"/);
  f.app.dispatch('pauseTimer', {});
  assert.equal(f.vm().timer.toggle, 'Resume');
  // Next Team with one click: a double-click (same rendering) moves on once.
  const rev = String(f.app.getEvent().revision);
  f.run('run.nextTeam', { dataset: { revision: rev } });
  f.run('run.nextTeam', { dataset: { revision: rev } });
  assert.equal(f.app.getEvent().currentTurn, 1);
  // The last team: Next Team is disabled with its reason (Review Round is the next action).
  f.run('run.nextTeam', { dataset: { revision: String(f.app.getEvent().revision) } });
  assert.deepEqual(f.vm().timer.nextTeam, { label: 'Next Team', disabled: true, hint: 'Every team has performed.' });
  // Time up prompts the host; it never moves on by itself.
  f.clock.advance(10 * 60_000);
  assert.equal(f.vm().timer.expired, true);
  assert.match(f.html(), /Time is up\. The host decides what happens next\./);
});

test('preparation has End Preparation, an idle timer offers Start', () => {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('p') });
  app.newEvent();
  app.dispatch('addTeam', { name: 'Đội A' });
  for (const type of ['startEvent', 'nextRound', 'startPreparation']) app.dispatch(type, {});
  const ui = createUiStore();
  const ctx = () => ({
    event: app.getEvent(),
    ui: ui.get(),
    now: clock.now(),
    lang: 'en',
    saveStatus: { state: 'idle' },
    link: LINK,
    projection: null,
  });
  const vm = runVm(ctx());
  assert.equal(vm.timer.caption, 'Preparation');
  assert.equal(vm.timer.endPreparation, 'End Preparation');
  assert.equal(vm.timer.nextTeam, null);
  assert.match(renderRun(vm), /data-action="run.endPreparation" data-revision/);
  const idle = {
    ...app.getEvent(),
    timer: { ...app.getEvent().timer, status: 'idle', deadline: null, remainingMs: 1000 },
  };
  assert.equal(runVm({ ...ctx(), event: idle }).timer.toggle, 'Start');
  // Preparation has no one performing: Add Award has no default recipient.
  assert.deepEqual(awardRecipients(app.getEvent(), ui.get()), { type: 'team', ids: [], isDefault: true });
  const handlers = runActions(app, ui, {
    now: clock.now,
    report: (r) => r.ok,
    confirm() {},
    download() {},
    openDisplay() {},
    focus() {},
    post() {},
  });
  handlers['run.endPreparation']({
    el: /** @type {any} */ ({ dataset: { revision: '9' } }),
    event: null,
    value: undefined,
  });
  assert.equal(app.getEvent().roundPhase, 'performances');
});

test('Add Award defaults to the team now performing; picking holds for the turn, then follows the next team', () => {
  const f = makeRun();
  const [a, b, c] = f.teamIds();
  assert.equal(performingTeamId(f.app.getEvent()), a);
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()), { type: 'team', ids: [a], isDefault: true });
  // Clicking a team in the queue makes it the recipient and focuses the form.
  f.run('run.pick', { value: c });
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()).ids, [c]);
  assert.deepEqual(f.log.focus.at(-1), '[data-focus="add-award"]');
  // Ticking a second team adds it; unticking removes it (and may leave none).
  f.run('run.recipient', { value: 'true', dataset: { value: b } });
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()).ids, [c, b]);
  f.run('run.recipient', { value: 'false', dataset: { value: c } });
  f.run('run.recipient', { value: 'false', dataset: { value: b } });
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()), { type: 'team', ids: [], isDefault: false });
  const vm = f.vm();
  assert.equal(vm.form.disabled, true);
  assert.equal(vm.form.blockedHint, 'Choose at least one recipient.');
  // The next turn: the default follows the new team.
  f.app.dispatch('nextTeam', {});
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()), { type: 'team', ids: [b], isDefault: true });
  assert.equal(turnKey(f.app.getEvent()), `${f.app.getEvent().rounds[0].id}:1`);
  // A stale pick (a team no longer in the round) is dropped.
  f.ui.set({ recipientIds: ['team-gone', b], local: { run: { pickedFor: turnKey(f.app.getEvent()) } } });
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()).ids, [b]);
  f.run('run.pick', { value: '' });
  f.run('run.recipient', { value: 'true', dataset: {} });
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()).ids, [b]);
});

test('in Review the recipient defaults to the team that just performed', () => {
  const event = atRound(eventWithTeams(3), 0, 'review', { currentTurn: 3 });
  assert.equal(performingTeamId(event), event.rounds[0].order[2]);
  assert.equal(performingTeamId(atRound(eventWithTeams(3), 0, 'review', { currentTurn: -1 })), null);
});

test('Individual lists the roster grouped by queue order; the search narrows many choices, keeping the chosen', () => {
  const f = makeRun({ teams: ['Đội Phaolô', 'Đội Giuse', 'Đội Maria', 'Đội Phêrô', 'Đội Têrêsa'], members: 2 });
  f.run('run.recipientType', { value: 'member' });
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()), { type: 'member', ids: [], isDefault: false });
  const options = recipientOptions(f.app.getEvent(), 'member');
  assert.equal(options.length, 10);
  assert.equal(options[0].member, 'Phaolô 1');
  assert.ok(options.length > SEARCH_AT);
  let vm = f.vm();
  assert.equal(vm.form.searchable, true);
  assert.match(
    f.html(),
    /type="search" id="run-search"[^>]*data-draft="award.search" data-live aria-label="Find Recipient"/,
  );
  const giuse = options.find((o) => o.member === 'Giuse 2');
  f.run('run.recipient', { value: 'true', dataset: { value: giuse.id } });
  f.draft({ search: 'tere' });
  vm = f.vm();
  assert.deepEqual(
    vm.form.recipients.map((r) => r.member),
    ['Giuse 2', 'Têrêsa 1', 'Têrêsa 2'],
    'accents ignored; the chosen stays visible',
  );
  f.draft({ search: 'zzz' });
  assert.equal(f.vm().form.emptyHint, '');
  f.run('run.recipient', { value: 'false', dataset: { value: giuse.id } });
  assert.equal(f.vm().form.emptyHint, 'Nothing matches that search.');
  // Members of a team outside the queue sort last.
  const event = f.app.getEvent();
  const extra = { ...event, roster: [{ id: 'm-x', name: 'Late', teamId: 'team-x', captain: false }, ...event.roster] };
  assert.equal(recipientOptions(extra, 'member').at(-1).id, 'm-x');
  // Back to Team: the performing team again; the same type twice changes nothing.
  f.run('run.recipientType', { value: 'team' });
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()).ids, [f.teamIds()[0]]);
  f.run('run.recipientType', { value: 'team' });
  f.run('run.recipientType', { value: 'everyone' });
  assert.equal(f.ui.get().recipientType, 'team');
  assert.equal(matches('Đội Giuse', ''), true);
  assert.equal(matches('Đội Giuse', 'doi giu'), true);
  assert.equal(matches('Đội Giuse', 'maria'), false);
});

test('an empty roster says so under Individual', () => {
  const f = makeRun({ members: 0 });
  f.run('run.recipientType', { value: 'member' });
  assert.equal(f.vm().form.emptyHint, 'The roster has no members yet.');
});

test('the Add button repeats the signed value: Add −25, Add +25 Each · 3 People (U05)', () => {
  const f = makeRun();
  const [a, b, c] = f.teamIds();
  assert.equal(f.vm().form.submit, 'Add');
  f.draft({ points: '-25' });
  assert.equal(f.vm().form.submit, 'Add −25');
  f.draft({ points: '−25' });
  assert.equal(f.vm().form.submit, 'Add −25');
  f.draft({ points: '25' });
  f.run('run.pick', { value: a });
  f.run('run.recipient', { value: 'true', dataset: { value: b } });
  f.run('run.recipient', { value: 'true', dataset: { value: c } });
  assert.equal(f.vm().form.submit, 'Add +25 Each · 3 People');
  const html = f.html();
  assert.match(
    html,
    /data-action="run.add"[^>]*data-revision="\d+"[^>]*><span class="larp-btn-label">Add \+25 Each · 3 People<\/span>/,
  );
  // The sign toggles are the shell's 'sign' action on this draft; the amount field is live.
  assert.match(html, /data-action="sign" data-value="-" data-draft-target="award.points"/);
  assert.match(html, /id="run-points"[^>]*data-draft="award.points" data-live/);
  // A broken amount says so (a lone sign is just unfinished).
  f.draft({ points: '2.5' });
  assert.equal(f.vm().form.pointsError, 'Enter whole points, such as +50 or −25.');
  assert.equal(f.vm().form.disabled, true);
  f.draft({ points: '−' });
  assert.equal(f.vm().form.pointsError, '');
});

test('adding sends one award per recipient from the chosen GM, clears the words and keeps the recipients', () => {
  const f = makeRun();
  const [a, b] = f.teamIds();
  const round = f.app.getEvent().rounds[0].id;
  f.run('run.recipient', { value: 'true', dataset: { value: b } });
  f.draft({
    name: ' Cùng  Nhau Tỏa Sáng ',
    translation: 'Shine Together',
    points: '+75',
    note: 'great energy',
    from: 'r-gm-12',
  });
  const gm = f.app.getEvent().gms.find((g) => !g.host);
  f.draft({ from: gm.id });
  const rev = String(f.app.getEvent().revision);
  f.run('run.add', { dataset: { revision: rev } });
  f.run('run.add', { dataset: { revision: rev } }); // a double-click: same id, applied once
  const added = drafts(f.app, round);
  assert.equal(added.length, 2);
  assert.deepEqual(
    added.map((x) => [x.recipientId, x.name, x.translation, x.points, x.note, x.authorId]),
    [
      [a, 'Cùng Nhau Tỏa Sáng', 'Shine Together', 75, 'great energy', gm.id],
      [b, 'Cùng Nhau Tỏa Sáng', 'Shine Together', 75, 'great energy', gm.id],
    ],
  );
  assert.equal(added[0].batchId, added[1].batchId);
  assert.deepEqual(f.ui.draft(AWARD_FORM), { from: gm.id });
  assert.deepEqual(awardRecipients(f.app.getEvent(), f.ui.get()).ids, [a, b]);
  assert.equal(f.log.focus.at(-1), '[data-focus="add-award"]');
  // The entries list shows them, newest first, with author and Edit/Remove.
  const entries = f.vm().entries.rows;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].author, 'Anh B.');
  assert.equal(entries[0].to, 'Đội Giuse');
  const html = f.html();
  assert.match(html, /<span class="larp-pts larp-pts-plus">\+75 Team Points<\/span>/);
  assert.match(
    html,
    /Đội Phaolô<\/span> · <span>Cùng Nhau Tỏa Sáng · Shine Together<\/span> · <span class="larp-run-entry-author">Anh B\.<\/span>/,
  );
  assert.match(html, /data-tip="great energy"[^>]*>Private Note</);
  assert.match(html, /data-action="run.edit" data-value="[^"]+"/);
});

test('the name and amount are checked when Add is pressed, never sent broken', () => {
  const f = makeRun();
  const round = f.app.getEvent().rounds[0].id;
  f.draft({ points: '50' });
  f.run('run.add');
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'error.invalid_name' });
  f.draft({ name: 'Sáng Tạo', points: 'abc' });
  f.run('run.add');
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'error.invalid_points' });
  assert.equal(drafts(f.app, round).length, 0);
  // From pointing at a GM who left falls back to the host.
  assert.equal(authorOf(f.app.getEvent(), 'gm-gone'), HOST_GM_ID);
  assert.equal(authorOf(f.app.getEvent(), undefined), HOST_GM_ID);
  // The name field leaving re-renders (so a duplicate warning can show).
  let renders = 0;
  f.ui.subscribe(() => renders++);
  f.run('run.touch');
  assert.equal(renders, 1);
});

test('a duplicate warns inline and asks for a reason to keep it; a large value is flagged', () => {
  const f = makeRun();
  const [a] = f.teamIds();
  const round = f.app.getEvent().rounds[0].id;
  f.app.dispatch('addAward', { recipientType: 'team', recipientIds: [a], name: 'Sáng Tạo', points: 50 });
  f.draft({ name: 'sang tao', points: '25' });
  let form = f.vm().form;
  assert.equal(form.duplicate, 'This recipient already has an award with this name this round. Keep it with a reason?');
  assert.match(f.html(), /class="larp-run-duplicate" role="status">.*id="run-reason"[^>]*data-draft="award.reason"/s);
  f.run('run.add');
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'error.duplicate_award' });
  assert.equal(drafts(f.app, round).length, 1);
  f.draft({ reason: 'A second, separate moment' });
  f.run('run.add');
  const kept = drafts(f.app, round);
  assert.equal(kept.length, 2);
  assert.equal(kept[1].duplicateReason, 'A second, separate moment');
  assert.match(f.html(), /data-tip="A second, separate moment">Kept Duplicate</);
  // Larger than the round's completion points (Faith Discovery: 100): flagged, never changed.
  f.draft({ name: 'Huge', points: '150' });
  form = f.vm().form;
  assert.equal(form.large, "Larger than the round's completion points, so it is flagged for review.");
  assert.match(f.html(), /larp-field is-large/);
  f.run('run.add');
  assert.equal(drafts(f.app, round).at(-1).points, 150);
  assert.equal(f.vm().entries.rows[0].large, true);
  assert.match(f.html(), /<span class="larp-note">Large Value<\/span>/);
});

test('checkAward and the payload builders, on their own', () => {
  const base = atRound(eventWithTeams(2, { membersPerTeam: 1, gms: 1 }), 1, 'performances', { currentTurn: 0 });
  const event = withAwards(base, [{ id: 'adj-1', recipientId: 'team-2', name: 'Sáng Tạo', points: 50 }]);
  const ids = ['team-2'];
  const ok = checkAward(event, { type: 'team', ids, draft: { name: 'Tinh Thần', points: '−25' } });
  assert.equal(ok.blocked, null);
  assert.equal(ok.points, -25);
  assert.equal(ok.large, false);
  assert.equal(
    checkAward(event, { type: 'team', ids: [], draft: { name: 'x', points: '1' } }).blocked,
    'error.no_recipients',
  );
  assert.equal(checkAward(event, { type: 'team', ids, draft: { name: 'x' } }).blocked, 'error.invalid_points');
  assert.equal(checkAward(event, { type: 'team', ids, draft: { points: '0' } }).blocked, 'error.invalid_name');
  const dup = checkAward(event, { type: 'team', ids, draft: { name: 'SANG TAO', points: '1' } });
  assert.equal(dup.blocked, 'error.duplicate_award');
  assert.deepEqual(
    dup.duplicates.map((d) => d.id),
    ['adj-1'],
  );
  const closed = { ...event, roundPhase: 'reveal' };
  assert.equal(
    checkAward(closed, { type: 'team', ids, draft: { name: 'x', points: '1' } }).blocked,
    'hint.awardsClosed',
  );
  const payload = awardPayload(event, {
    type: 'team',
    ids,
    draft: { name: 'sang tao', points: '5', reason: ' again ', from: 'gm-1' },
  });
  assert.deepEqual(payload, {
    recipientType: 'team',
    recipientIds: ['team-2'],
    name: 'sang tao',
    translation: '',
    points: 5,
    note: '',
    authorId: 'gm-1',
    duplicateReason: 'again',
  });
  // Editing: only a rename checks duplicates, never against itself.
  const adj = event.adjustments[0];
  assert.equal(
    checkAward(event, { type: 'team', ids, draft: { name: 'Sáng Tạo', points: '9' }, editing: adj }).blocked,
    null,
  );
  assert.deepEqual(editPayload(event, adj, { name: 'Sáng Tạo', points: '9', note: ' n ' }), {
    adjustmentId: 'adj-1',
    name: 'Sáng Tạo',
    translation: '',
    points: 9,
    note: 'n',
  });
  const twin = withAwards(event, [{ id: 'adj-2', recipientId: 'team-2', name: 'Other', points: 5 }]);
  const renamed = editPayload(twin, twin.adjustments[1], { name: 'Sáng Tạo', points: '5', reason: 'twice' });
  assert.equal(renamed.duplicateReason, 'twice');
  assert.deepEqual(undoPayload({ ...adj, duplicateReason: 'why' }), {
    recipientType: 'team',
    recipientIds: ['team-2'],
    name: 'Sáng Tạo',
    translation: 'Creativity',
    points: 50,
    note: '',
    authorId: HOST_GM_ID,
    duplicateReason: 'why',
  });
  assert.equal(pointsText(-25), '−25');
  assert.equal(pointsText(0), '0');
  assert.deepEqual(fillDraft({ from: 'gm-1', search: 's' }, { name: 'N', points: -5 }), {
    from: 'gm-1',
    search: 's',
    name: 'N',
    translation: '',
    points: '−5',
    note: '',
    reason: '',
  });
  assert.equal(clickId('add', event, null), undefined);
  assert.equal(clickId('add', event, /** @type {any} */ ({ dataset: { revision: '4' } })), `run-add-${event.id}-4`);
});

test('Edit fills the form for a draft, Save changes it, Cancel brings back what was being typed', () => {
  const f = makeRun();
  const [a] = f.teamIds();
  f.app.dispatch('addAward', {
    recipientType: 'team',
    recipientIds: [a],
    name: 'Quá Giờ',
    translation: 'Over Time',
    points: -25,
  });
  const adj = f.app.getEvent().adjustments.at(-1);
  f.draft({ name: 'half typed', points: '10' });
  f.run('run.edit', { value: adj.id });
  const form = f.vm().form;
  assert.equal(form.heading, 'Edit Award');
  assert.deepEqual(form.editing, { id: adj.id, to: 'Đội Phaolô' });
  assert.equal(form.draft.points, '−25');
  assert.equal(form.submit, 'Save');
  const html = f.html();
  assert.match(html, /larp-run-form is-editing/);
  assert.doesNotMatch(html, /run\.recipientType/);
  assert.match(html, /data-action="run.saveEdit"/);
  assert.match(html, /data-action="run.cancelEdit"/);
  // Editing a second entry keeps the original half-typed form for Cancel.
  f.run('run.edit', { value: adj.id });
  f.draft({ points: '−30' });
  f.run('run.saveEdit');
  assert.equal(f.app.getEvent().adjustments.find((x) => x.id === adj.id).points, -30);
  assert.equal(f.vm().form.editing, null);
  assert.equal(f.ui.draft(AWARD_FORM).name, 'half typed');
  // Cancel.
  f.run('run.edit', { value: adj.id });
  f.run('run.cancelEdit');
  assert.equal(f.ui.draft(AWARD_FORM).points, '10');
  // A broken edit is refused before sending.
  f.run('run.edit', { value: adj.id });
  f.draft({ points: 'x' });
  f.run('run.saveEdit');
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'error.invalid_points' });
  // Edit of something that isn't a draft does nothing; Save with the draft gone leaves edit mode.
  f.run('run.edit', { value: 'nope' });
  f.ui.set({ local: { run: { editing: 'nope' } } });
  f.run('run.saveEdit');
  assert.equal(f.ui.get().local.run.editing, null);
});

test('Remove takes a draft out at once and offers Undo for a few seconds, which brings it back', () => {
  const f = makeRun();
  const [a] = f.teamIds();
  const round = f.app.getEvent().rounds[0].id;
  f.app.dispatch('addAward', { recipientType: 'team', recipientIds: [a], name: 'Tinh Thần', points: 25, note: 'n' });
  const adj = f.app.getEvent().adjustments.at(-1);
  f.run('run.edit', { value: adj.id });
  f.run('run.remove', { value: adj.id });
  assert.equal(drafts(f.app, round).length, 0);
  assert.equal(f.vm().form.editing, null, 'removing the entry being edited leaves Edit');
  const vm = f.vm();
  assert.deepEqual(vm.undo, { text: 'Removed “Tinh Thần”.', action: 'Undo' });
  assert.match(f.html(), /class="larp-run-undo" role="status">.*data-action="run.undo"/s);
  assert.equal(f.log.focus.at(-1), '[data-focus="run-undo"]');
  f.run('run.undo');
  f.run('run.undo');
  const back = drafts(f.app, round);
  assert.equal(back.length, 1);
  assert.deepEqual([back[0].name, back[0].points, back[0].note, back[0].authorId], ['Tinh Thần', 25, 'n', HOST_GM_ID]);
  assert.equal(f.vm().undo, null);
  // Undo goes away after UNDO_MS.
  f.run('run.remove', { value: back[0].id });
  f.clock.advance(UNDO_MS + 1);
  assert.equal(f.vm().undo, null);
  f.run('run.remove', { value: 'nope' });
  assert.equal(f.vm().entries.rows.length, 0);
  assert.match(f.html(), /No awards this round yet\./);
});

test('Save As Template and recent awards fill an editable form', () => {
  const f = makeRun();
  const [a] = f.teamIds();
  f.run('run.saveTemplate');
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'error.invalid_name' });
  f.draft({ name: 'Sáng Tạo', translation: 'Creativity', points: 'x' });
  f.run('run.saveTemplate');
  assert.deepEqual(f.ui.get().flash, { kind: 'error', key: 'error.invalid_points' });
  f.draft({ points: '+50' });
  f.run('run.saveTemplate');
  f.draft({ name: 'Quá Giờ', translation: '', points: '-25' });
  f.run('run.saveTemplate');
  let form = f.vm().form;
  assert.deepEqual(
    form.templates.map((x) => x.text),
    ['Quá Giờ −25', 'Sáng Tạo +50'],
  );
  assert.match(f.html(), /data-action="run.dropTemplate" data-value="0" aria-label="Remove Template Quá Giờ"/);
  f.ui.clearDraft(AWARD_FORM);
  f.run('run.useTemplate', { value: '1' });
  assert.deepEqual(
    [f.ui.draft(AWARD_FORM).name, f.ui.draft(AWARD_FORM).translation, f.ui.draft(AWARD_FORM).points],
    ['Sáng Tạo', 'Creativity', '50'],
  );
  f.run('run.useTemplate', { value: '7' });
  f.run('run.dropTemplate', { value: '0' });
  assert.deepEqual(
    f.vm().form.templates.map((x) => x.text),
    ['Sáng Tạo +50'],
  );
  // Recent awards come from the event, newest first, one per name and value.
  f.app.dispatch('addAward', {
    recipientType: 'team',
    recipientIds: [a],
    name: 'Tinh Thần',
    translation: 'Team Spirit',
    points: 25,
  });
  f.app.dispatch('addAward', {
    recipientType: 'team',
    recipientIds: [f.teamIds()[1]],
    name: 'tinh thần',
    points: 25,
    duplicateReason: 'x',
  });
  form = f.vm().form;
  assert.deepEqual(
    form.recent.map((x) => x.text),
    ['tinh thần +25'],
  );
  f.run('run.useRecent', { value: f.app.getEvent().adjustments[0].id });
  assert.equal(f.ui.draft(AWARD_FORM).translation, 'Team Spirit');
  f.run('run.useRecent', { value: 'nope' });
});

test('template and recent helpers keep a tidy, bounded list', () => {
  const many = Array.from({ length: TEMPLATE_LIMIT + 3 }, (_, i) => ({ name: `N${i}`, translation: '', points: i }));
  assert.equal(readTemplates(many).length, TEMPLATE_LIMIT);
  assert.deepEqual(readTemplates('nope'), []);
  assert.deepEqual(
    readTemplates([
      { name: ' ', points: 1 },
      { name: 'A', points: 1.5 },
      { name: ' A ', points: 2, translation: 3 },
      null,
    ]),
    [{ name: 'A', translation: '', points: 2 }],
  );
  const list = addTemplate([{ name: 'Sáng Tạo', translation: '', points: 50 }], {
    name: 'sang tao',
    translation: 'C',
    points: 50,
  });
  assert.deepEqual(list, [{ name: 'sang tao', translation: 'C', points: 50 }]);
  const event = withAwards(atRound(eventWithTeams(1), 0, 'performances'), [
    ...Array.from({ length: RECENT_LIMIT + 2 }, (_, i) => ({ name: `A${i}`, points: i, createdAt: i })),
    { name: 'Gone', status: 'discarded', createdAt: 99 },
  ]);
  const recent = recentAwards(event);
  assert.equal(recent.length, RECENT_LIMIT);
  assert.equal(recent[0].name, `A${RECENT_LIMIT + 1}`);
});

test('Projected shows completion + awards = round score and the total, labelled not published', () => {
  const f = makeRun({ turn: 3 });
  const [a, b, c] = f.teamIds();
  f.app.dispatch('setStatus', { teamId: a, status: 'complete' });
  f.app.dispatch('setStatus', { teamId: b, status: 'passed' });
  for (const [name, points] of [
    ['Shine', 75],
    ['Creativity', 50],
    ['Over Time', -25],
  ]) {
    f.app.dispatch('addAward', { recipientType: 'team', recipientIds: [a], name, points });
  }
  const members = f.app.getEvent().roster.filter((m) => m.teamId === a);
  f.app.dispatch('addAward', { recipientType: 'member', recipientIds: [members[0].id], name: 'Leader', points: 10 });
  const p = f.vm().projected;
  assert.equal(p.title, 'Projected');
  assert.equal(p.note, 'Projected · not published');
  assert.deepEqual(
    p.rows.map((r) => [r.team.id, r.completionText, r.awards, r.scoreText, r.totalText]),
    [
      [a, '100', 100, '200', '200'],
      [b, '0', 0, '0', '0'],
      [c, '—', 0, '0', '0'],
    ],
  );
  assert.equal(p.noIndividual, 'No individual awards yet: Đội Giuse, Đội Maria');
  assert.match(p.reveal, /^The reveal takes about \d+:\d\d$/);
  const html = f.html();
  assert.match(html, /<span>100<\/span> <span class="larp-pts larp-pts-plus">\+100<\/span> = <strong>200<\/strong>/);
  assert.match(html, /<span>0<\/span> <span class="larp-run-status-word">\(Passed\)<\/span> = <strong>0<\/strong>/);
  assert.match(
    html,
    /<span class="larp-run-unset" aria-label="No Status">—<\/span><\/span><span class="larp-run-total">Total 0<\/span>/,
  );
  assert.match(html, /Completion \+ Awards = Round Score/);
  // An individual award never adds to the team's projected score.
  assert.equal(projectedRows(f.app.getEvent(), f.app.getEvent().rounds[0])[0].score, 200);
});

test('after publishing: the frozen result, read-only entries and the reveal controls', () => {
  const f = makeRun({ turn: 3 });
  const [a, b, c] = f.teamIds();
  f.app.dispatch('addAward', { recipientType: 'team', recipientIds: [a], name: 'Shine', points: 75 });
  for (const id of [a, b, c]) f.app.dispatch('setStatus', { teamId: id, status: 'complete' });
  f.app.dispatch('beginReview', {});
  assert.equal(f.vm().form.heading, 'Add Award', 'the host still adds during Review');
  const roundId = f.app.getEvent().rounds[0].id;
  assert.equal(f.app.dispatch('publishRound', { roundId }).error, null);
  let vm = f.vm();
  assert.equal(vm.form, null);
  assert.equal(vm.closedHint, 'This round is published; add a correction in History to change it.');
  assert.equal(vm.projected.title, 'Round Score');
  assert.equal(vm.projected.note, '');
  assert.equal(vm.projected.reveal, '');
  assert.equal(vm.entries.rows[0].editable, false);
  assert.equal(vm.entries.rows[0].published, true);
  assert.equal(vm.projected.rows[0].totalText, '175');
  assert.equal(vm.reveal.kind, 'reveal');
  assert.match(vm.reveal.step, /^Banner 1 Of \d+$/);
  let html = f.html();
  assert.match(
    html,
    /data-action="run.revealToggle" aria-pressed="false"[^>]*><span class="larp-btn-label">Pause Reveal/,
  );
  assert.match(html, /data-action="run.revealNext"/);
  assert.match(html, /data-action="run.revealSkip"/);
  assert.doesNotMatch(html, /data-action="run.(edit|remove)"/);
  f.run('run.revealToggle');
  assert.equal(f.app.getEvent().reveal.paused, true);
  assert.equal(f.vm().reveal.toggle, 'Resume Reveal');
  f.run('run.revealToggle');
  assert.equal(f.app.getEvent().reveal.paused, false);
  const step = f.app.getEvent().reveal.step;
  f.run('run.revealNext');
  assert.equal(f.app.getEvent().reveal.step, step + 1);
  f.run('run.revealSkip');
  assert.equal(f.app.getEvent().roundPhase, 'results');
  vm = f.vm();
  assert.equal(vm.reveal.kind, 'results');
  html = f.html();
  assert.match(html, /data-action="run.revealReplay"/);
  f.run('run.revealReplay');
  assert.equal(f.app.getEvent().roundPhase, 'reveal');
  assert.equal(f.app.getEvent().reveal.step, 0);
  // With no reveal running these do nothing.
  f.run('run.revealSkip');
  f.run('run.revealToggle');
  f.run('run.revealNext');
  assert.equal(f.app.getEvent().roundPhase, 'results');
});

test('a skipped round says it counts zero', () => {
  const f = makeRun();
  const roundId = f.app.getEvent().rounds[0].id;
  assert.equal(f.app.dispatch('skipRound', { roundId }).error, null);
  const vm = f.vm();
  assert.equal(vm.closedHint, 'This round was skipped and counts zero.');
  assert.equal(vm.reveal, null);
  assert.equal(vm.projected.noIndividual, '');
});

test('every piece of user text is escaped', () => {
  const f = makeRun({ teams: ['<b>Đội</b>', 'Đội "Q"'] });
  const [a] = f.teamIds();
  f.app.dispatch('addAward', {
    recipientType: 'team',
    recipientIds: [a],
    name: '<img src=x onerror=alert(1)>',
    translation: '"><script>',
    note: '<i>note</i>',
    points: 5,
  });
  f.run('run.useRecent', { value: f.app.getEvent().adjustments.at(-1).id });
  f.draft({ search: '"><b>', reason: '</textarea>' });
  f.run('run.saveTemplate');
  const html = f.html();
  assert.doesNotMatch(html, /<img|<script|<b>|<i>note/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('in Vietnamese the tab speaks Vietnamese', () => {
  const f = makeRun();
  f.app.dispatch('setConfig', { hostLang: 'vi' });
  f.draft({ points: '-25' });
  const vm = f.vm();
  assert.equal(vm.form.submit, 'Thêm −25');
  assert.equal(vm.projected.note, 'Dự kiến · chưa công bố');
  assert.equal(vm.timer.caption, 'Lượt · Đội Phaolô');
  assert.equal(vm.entries.title, 'Vòng Này');
});
