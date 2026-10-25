// Judge Mode (src/larp/judge.js): a co-GM picks their name (the last one offered first), then a
// big plain award form whose recipient defaults to the team that just performed, signed points
// ("Add −25", U05), a private note, recent awards to reuse, My Awards This Round (Edit, Remove,
// Undo: own drafts only) and Also This Round (others', read only). Every command goes out in
// mode 'judge' as the co-GM, so roles.js refusals show as plain flash messages. Review locks it
// with the reason (A11) and the entries stay; Done asks for the Host PIN when one is set. Pure view
// models and markup, plus the handlers driven against a real app with injected storage and clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JUDGE_FORM,
  PIN_FORM,
  judgeActions,
  judgeActor,
  judgeGm,
  judgeRecipient,
  judgeRoundTitle,
  judgeRows,
  judgeScreen,
  judgeVm,
  justPerformedTeamId,
  lockReason,
  pickList,
  pinMatches,
  renderJudge,
} from '../src/larp/judge.js';
import { createApp } from '../src/larp/app.js';
import { createUiStore, defaultUi } from '../src/larp/uiState.js';
import { STRINGS, t } from '../src/larp/strings.js';
import { HOST_GM_ID } from '../src/larp/types.js';
import { atRound, eventWithTeams, fakeStorage, makeClock, makeIds, withAwards } from './lib/larpFixtures.mjs';

const LINK = { active: true, takenOver: false, otherHost: 'none', display: 'open', displayWebgl: true };

/**
 * A real app with three teams (two members each) and two co-GMs, walked to round 1's
 * Performances with `turn` teams started; Judge Mode open (as `gm` when given).
 */
function makeJudge({ turn = 1, gm = 'pick', hostPin = null, lang = 'en' } = {}) {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('j') });
  app.newEvent();
  for (const name of ['Đội Phaolô', 'Đội Giuse', 'Đội Maria']) {
    app.dispatch('addTeam', { name, translation: name.replace('Đội', 'Team') });
  }
  for (const team of app.getEvent().teams) {
    app.dispatch('addMembers', { names: [1, 2].map((k) => `${team.name.replace('Đội ', '')} ${k}`), teamId: team.id });
  }
  app.dispatch('addGm', { name: 'Anh B.' });
  app.dispatch('addGm', { name: 'Chị C.' });
  if (hostPin) app.dispatch('setConfig', { hostPin });
  if (lang !== 'en') app.dispatch('setConfig', { hostLang: lang });
  for (const type of ['startEvent', 'nextRound', 'startPreparation', 'endPreparation']) {
    assert.equal(app.dispatch(type, {}).error, null, type);
  }
  for (let i = 0; i < turn; i++) app.dispatch('nextTeam', {});
  const gms = app.getEvent().gms.filter((g) => !g.host);
  const ui = createUiStore({ storage: fakeStorage() });
  const gmId = gm === 'pick' ? null : gms[gm].id;
  ui.set({ judge: { open: true, gmId, lastGmId: null } });
  const log = { focus: [], confirms: [] };
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
  const handlers = judgeActions(app, ui, env);
  const run = (name, { value, dataset = {} } = {}) =>
    handlers[name]({ el: /** @type {any} */ ({ dataset }), event: null, value });
  const ctx = () => ({
    event: app.getEvent(),
    ui: ui.get(),
    now: clock.now(),
    lang: app.getEvent().config.hostLang,
    saveStatus: app.getSaveStatus(),
    link: LINK,
    projection: null,
  });
  const vm = () => judgeVm(ctx());
  const html = () => renderJudge(vm());
  const order = () => app.getEvent().rounds[0].order;
  const draft = (fields) => {
    for (const [k, v] of Object.entries(fields)) ui.setDraft(JUDGE_FORM, k, v);
  };
  return { app, ui, env, log, clock, run, vm, html, order, draft, gms };
}

const roundAwards = (app) => app.getEvent().adjustments.filter((a) => a.status !== 'discarded');

test('the screen follows the interface: id, label, namespaced handlers', () => {
  const f = makeJudge();
  assert.equal(judgeScreen.id, 'judge');
  assert.equal(judgeScreen.labelKey, 'action.judgeMode');
  assert.equal(judgeScreen.vm, judgeVm);
  assert.equal(judgeScreen.render, renderJudge);
  for (const name of Object.keys(judgeActions(f.app, f.ui, f.env))) assert.match(name, /^judge\.[A-Za-z]+$/);
  assert.deepEqual(judgeActor('gm-1'), { mode: 'judge', actorId: 'gm-1' });
});

test('first the co-GM picks their name; the last co-GM is offered first', () => {
  const f = makeJudge();
  let vm = f.vm();
  assert.equal(vm.stage, 'pick');
  assert.equal(vm.pick.last, null);
  assert.deepEqual(
    vm.pick.gms.map((g) => g.name),
    ['Anh B.', 'Chị C.'],
    'the host is not in the list',
  );
  let html = f.html();
  assert.match(html, /Who Is Judging\?/);
  assert.match(html, /Pick your name so the awards you give are credited to you\./);
  assert.doesNotMatch(html, /larp-judge-form|Add Award/, 'no form before a name is picked');
  assert.match(html, /data-action="judge.done"/, 'Done leaves without picking');

  f.run('judge.pick', { value: f.gms[1].id });
  assert.deepEqual(f.ui.get().judge, { open: true, gmId: f.gms[1].id, lastGmId: f.gms[1].id });
  assert.equal(f.vm().stage, 'judge');
  f.run('judge.switch');
  assert.equal(f.ui.get().judge.gmId, null);
  vm = f.vm();
  assert.equal(vm.pick.last.id, f.gms[1].id);
  assert.equal(vm.pick.last.label, 'Continue As Chị C.');
  assert.deepEqual(
    vm.pick.gms.map((g) => g.name),
    ['Anh B.'],
  );
  html = f.html();
  assert.match(html, /larp-judge-last[^>]*data-value="[^"]+"/);
  // Picking the host or someone unknown does nothing.
  f.run('judge.pick', { value: HOST_GM_ID });
  f.run('judge.pick', { value: 'gm-nobody' });
  assert.equal(f.ui.get().judge.gmId, null);
});

test('pickList and judgeGm: the last co-GM first; a removed GM sends the window back to the picker', () => {
  const event = eventWithTeams(2, { gms: 3 });
  assert.deepEqual(
    pickList(event, 'gm-2').map((g) => g.id),
    ['gm-2', 'gm-1', 'gm-3'],
  );
  assert.deepEqual(
    pickList(event, 'gm-gone').map((g) => g.id),
    ['gm-1', 'gm-2', 'gm-3'],
  );
  const ui = { ...defaultUi(), judge: { open: true, gmId: 'gm-2', lastGmId: null } };
  assert.equal(judgeGm(event, ui).name, 'Anh 2');
  assert.equal(judgeGm(event, { ...ui, judge: { ...ui.judge, gmId: 'gm-9' } }), null);
  assert.equal(judgeGm(event, { ...ui, judge: { ...ui.judge, open: false } }), null);
});

test('with no co-GMs the picker says where to add them', () => {
  const event = atRound(eventWithTeams(2), 0, 'performances', { currentTurn: 0 });
  const ui = { ...defaultUi(), judge: { open: true, gmId: null, lastGmId: null } };
  const html = renderJudge(
    judgeVm({ event, ui, now: 0, lang: 'en', saveStatus: { state: 'idle' }, link: LINK, projection: null }),
  );
  assert.match(html, /No co-GMs yet\. The host adds them in Teams &amp; Roster\./);
  assert.doesNotMatch(html, /data-action="judge.pick"/);
});

test('the recipient defaults to the team that just performed, through the changeover', () => {
  const f = makeJudge({ turn: 2, gm: 0 });
  const [a, b] = f.order();
  // Next Team was just pressed: the new turn is in its changeover, so the team before is default.
  assert.equal(justPerformedTeamId(f.app.getEvent(), f.clock.now()), a);
  assert.deepEqual(judgeRecipient(f.app.getEvent(), f.ui.get(), f.clock.now()), {
    type: 'team',
    ids: [a],
    isDefault: true,
  });
  let vm = f.vm();
  assert.equal(vm.form.recipientId, a);
  f.clock.advance(20_000);
  assert.equal(justPerformedTeamId(f.app.getEvent(), f.clock.now()), b, 'past the changeover: the team on');
  // A paused or expired turn still belongs to the team on.
  f.app.dispatch('pauseTimer', {});
  assert.equal(justPerformedTeamId(f.app.getEvent(), f.clock.now()), b);

  const event = eventWithTeams(3);
  assert.equal(justPerformedTeamId(atRound(event, 0, 'preparation'), 0), null);
  assert.equal(justPerformedTeamId(atRound(event, 0, 'performances', { currentTurn: -1 }), 0), null);
  assert.equal(justPerformedTeamId(atRound(event, 0, 'performances', { currentTurn: 0 }), 0), 'team-1');
  assert.equal(justPerformedTeamId(atRound(event, 0, 'review', { currentTurn: 3 }), 0), 'team-3');
  assert.equal(justPerformedTeamId(event, 0), null);

  // Picking holds for this turn; the next turn goes back to the default.
  f.run('judge.recipient', { value: a });
  vm = f.vm();
  assert.equal(vm.form.recipientId, a);
  f.run('judge.recipientType', { value: 'member' });
  vm = f.vm();
  assert.equal(vm.form.type, 'member');
  assert.equal(vm.form.recipientId, '');
  assert.equal(vm.form.disabled, true, 'no recipient yet');
  assert.equal(vm.form.blockedHint, 'Choose at least one recipient.');
  assert.match(f.html(), /Choose a Recipient/);
  const member = f.app.getEvent().roster[0];
  f.run('judge.recipient', { value: member.id });
  assert.deepEqual(judgeRecipient(f.app.getEvent(), f.ui.get(), f.clock.now()).ids, [member.id]);
  assert.match(f.vm().form.recipientOptions.find((o) => o.value === member.id).label, /Phaolô 1 · Đội Phaolô/);
  f.run('judge.recipientType', { value: 'team' });
  f.run('judge.recipientType', { value: 'nonsense' });
  assert.equal(f.vm().form.type, 'team');
  f.app.dispatch('nextTeam', {});
  assert.equal(judgeRecipient(f.app.getEvent(), f.ui.get(), f.clock.now()).isDefault, true);
});

test('adding an award: signed points, sent in Judge Mode as the co-GM, applied once', () => {
  const f = makeJudge({ gm: 0 });
  const [a] = f.order();
  f.draft({ name: 'Quá Giờ', translation: ' Over  Time ', points: '-25', note: 'Ran long' });
  let vm = f.vm();
  assert.equal(vm.form.submit, 'Add −25');
  assert.match(f.html(), /Add −25/);
  f.ui.setDraft(JUDGE_FORM, 'points', '50');
  assert.equal(f.vm().form.submit, 'Add +50');
  f.ui.setDraft(JUDGE_FORM, 'points', '−25');
  const rev = String(f.app.getEvent().revision);
  f.run('judge.add', { dataset: { revision: rev } });
  f.run('judge.add', { dataset: { revision: rev } }); // a double-click
  const added = roundAwards(f.app);
  assert.equal(added.length, 1);
  assert.equal(added[0].points, -25);
  assert.equal(added[0].recipientId, a);
  assert.equal(added[0].authorId, f.gms[0].id);
  assert.equal(added[0].translation, 'Over Time');
  assert.equal(added[0].note, 'Ran long');
  const entry = f.app.getEvent().history.at(-1);
  assert.equal(entry.mode, 'judge');
  assert.equal(entry.actorId, f.gms[0].id);
  assert.deepEqual(f.ui.draft(JUDGE_FORM), {}, 'the form clears after an add');
  assert.ok(f.log.focus.includes('[data-focus="judge-name"]'));

  vm = f.vm();
  assert.equal(vm.mine.rows.length, 1);
  assert.equal(vm.mine.rows[0].editable, true);
  const html = f.html();
  assert.match(html, /My Awards This Round/);
  assert.match(html, /−25 Team Points/);
  assert.match(html, /data-action="judge.edit"/);
  assert.match(html, /Recent/);
});

test('a blank name, a bad amount or a duplicate without a reason is refused plainly', () => {
  const f = makeJudge({ gm: 0 });
  f.draft({ name: '', points: '25' });
  f.run('judge.add');
  assert.equal(f.ui.get().flash.key, 'error.invalid_name');
  f.draft({ name: 'Sáng Tạo', points: '2.5' });
  assert.equal(f.vm().form.pointsError, t('error.invalid_points', 'en'));
  assert.equal(f.vm().form.disabled, true);
  f.run('judge.add');
  assert.equal(f.ui.get().flash.key, 'error.invalid_points');
  f.draft({ points: '50' });
  f.run('judge.add');
  assert.equal(roundAwards(f.app).length, 1);
  f.draft({ name: 'sang tao', points: '50' });
  assert.match(f.vm().form.duplicate, /already has an award with this name/);
  assert.match(f.html(), /id="judge-reason"/);
  f.run('judge.add');
  assert.equal(f.ui.get().flash.key, 'error.duplicate_award');
  f.draft({ reason: 'A second creative moment' });
  f.run('judge.add');
  const list = roundAwards(f.app);
  assert.equal(list.length, 2);
  assert.equal(list[1].duplicateReason, 'A second creative moment');
  // A large value is flagged, never changed.
  f.draft({ name: 'Huge', points: '500' });
  assert.match(f.vm().form.large, /flagged for review/);
});

test("others' awards are read only; a co-GM's own drafts can be edited, removed and brought back", () => {
  const f = makeJudge({ gm: 0 });
  const [a, b] = f.order();
  f.app.dispatch('addAward', { recipientType: 'team', recipientIds: [b], name: 'Shine Together', points: 75 });
  f.app.dispatch(
    'addAward',
    { recipientType: 'team', recipientIds: [a], name: 'Tinh Thần', points: 25 },
    { mode: 'judge', actorId: f.gms[1].id },
  );
  f.draft({ name: 'Sáng Tạo', translation: 'Creativity', points: '50' });
  f.run('judge.add');
  let vm = f.vm();
  assert.deepEqual(
    vm.others.rows.map((r) => [r.words, r.author, r.editable && r.mine]),
    [
      ['Tinh Thần', 'Chị C.', false],
      ['Shine Together', 'Host', false],
    ],
  );
  let html = f.html();
  assert.match(html, /Also This Round/);
  assert.match(
    html,
    /Shine Together · <span class="larp-judge-author">Host<\/span>|Shine Together<\/span> · <span class="larp-judge-author">Host/,
  );
  const hostAward = roundAwards(f.app).find((x) => x.name === 'Shine Together');
  assert.doesNotMatch(html, new RegExp(`data-action="judge.edit" data-value="${hostAward.id}"`));
  // Trying anyway is refused by roles.js, in plain words.
  f.run('judge.edit', { value: hostAward.id });
  assert.equal(f.ui.get().flash.key, 'error.not_own_award');
  f.ui.set({ flash: null });
  f.run('judge.remove', { value: hostAward.id });
  assert.equal(f.ui.get().flash.key, 'error.not_own_award');
  assert.equal(t(f.ui.get().flash.key, 'en'), 'You can only change your own awards.');

  // Edit one's own: the recipient is fixed, Save sends editAward.
  const mine = vm.mine.rows[0];
  f.draft({ name: 'half-typed' });
  f.run('judge.edit', { value: mine.id });
  vm = f.vm();
  assert.equal(vm.form.heading, 'Edit Award');
  assert.equal(vm.form.submitAction, 'judge.saveEdit');
  assert.match(vm.form.editing.to, /Đội Phaolô/);
  assert.equal(f.ui.draft(JUDGE_FORM).name, 'Sáng Tạo');
  html = f.html();
  assert.match(html, /data-action="judge.cancelEdit"/);
  assert.doesNotMatch(html, /id="judge-to"/);
  f.ui.setDraft(JUDGE_FORM, 'points', '−10');
  f.run('judge.saveEdit');
  assert.equal(roundAwards(f.app).find((x) => x.id === mine.id).points, -10);
  assert.equal(f.ui.draft(JUDGE_FORM).name, 'half-typed', 'the add form comes back as it was');
  assert.equal(f.app.getEvent().history.at(-1).mode, 'judge');
  // Cancel leaves the award as it was.
  f.run('judge.edit', { value: mine.id });
  f.ui.setDraft(JUDGE_FORM, 'name', '');
  f.run('judge.saveEdit');
  assert.equal(f.ui.get().flash.key, 'error.invalid_name');
  f.run('judge.cancelEdit');
  assert.equal(f.vm().form.editing, null);

  // Remove, then Undo within the window.
  f.run('judge.remove', { value: mine.id });
  assert.equal(f.app.getEvent().adjustments.find((x) => x.id === mine.id).status, 'discarded');
  vm = f.vm();
  assert.equal(vm.mine.rows.length, 0);
  assert.match(vm.undo.text, /Removed “Sáng Tạo”\./);
  assert.match(f.html(), /data-action="judge.undo"/);
  f.run('judge.undo');
  const back = roundAwards(f.app).filter((x) => x.authorId === f.gms[0].id);
  assert.equal(back.length, 1);
  assert.equal(back[0].points, -10);
  assert.equal(f.vm().undo, null);
  f.run('judge.remove', { value: back[0].id });
  f.clock.advance(60_000);
  assert.equal(f.vm().undo, null, 'Undo is offered for a few seconds only');
});

test('recent award names fill an editable form', () => {
  const f = makeJudge({ gm: 0 });
  const [a] = f.order();
  f.app.dispatch('addAward', { recipientType: 'team', recipientIds: [a], name: 'Sáng Tạo', points: 50 });
  const vm = f.vm();
  assert.deepEqual(
    vm.recent.map((r) => r.text),
    ['Sáng Tạo +50 Team Points'],
  );
  f.draft({ note: 'keep me' });
  f.run('judge.useRecent', { value: vm.recent[0].id });
  assert.equal(f.ui.draft(JUDGE_FORM).name, 'Sáng Tạo');
  assert.equal(f.ui.draft(JUDGE_FORM).points, '50');
  f.run('judge.useRecent', { value: 'adj-nope' });
});

test('Review locks Judge Mode with the reason; entries stay, nothing can be changed (A11)', () => {
  const f = makeJudge({ gm: 0 });
  f.draft({ name: 'Sáng Tạo', points: '50' });
  f.run('judge.add');
  const own = roundAwards(f.app)[0];
  for (let i = 0; i < 2; i++) f.app.dispatch('nextTeam', {});
  f.app.dispatch('beginReview', {});
  assert.equal(lockReason(f.app.getEvent(), f.gms[0].id), 'hint.judgeLocked');
  const vm = f.vm();
  assert.equal(vm.form, null);
  assert.equal(vm.locked.title, 'Judge Mode Is Locked');
  assert.equal(vm.locked.text, t('hint.judgeLocked', 'en'));
  assert.equal(vm.mine.rows.length, 1, 'awards already added stay');
  assert.equal(vm.mine.rows[0].editable, false);
  const html = f.html();
  assert.match(html, /Judge Mode is locked while the host reviews the round\. Awards already added stay\./);
  assert.doesNotMatch(html, /data-action="judge.(add|edit|remove)"/);
  assert.match(html, /data-action="judge.done"/);
  // A handler run anyway is refused by roles.js and said plainly.
  f.draft({ name: 'Late', points: '10' });
  f.run('judge.add');
  assert.equal(f.ui.get().flash.key, 'error.judging_closed');
  f.ui.set({ flash: null });
  f.run('judge.remove', { value: own.id });
  assert.equal(f.ui.get().flash.key, 'error.judging_closed');
  assert.equal(f.app.getEvent().adjustments.find((x) => x.id === own.id).status, 'draft');
  // A co-GM stepping up now is told before picking a name, not after.
  f.ui.set({ judge: { open: true, gmId: null, lastGmId: null } });
  const pick = f.vm();
  assert.equal(pick.stage, 'pick');
  assert.equal(pick.pick.locked.text, t('hint.judgeLocked', 'en'));
  assert.match(f.html(), /class="larp-judge-locked" role="status"><h2 class="larp-h2">Judge Mode Is Locked<\/h2>/);
  f.ui.set({ judge: { open: true, gmId: f.gms[0].id, lastGmId: null } });
  // The host reopens judging: the form comes back.
  f.app.dispatch('reopenJudging', {});
  f.ui.set({ judge: { open: true, gmId: null, lastGmId: null } });
  assert.equal(f.vm().pick.locked, null, 'judging open: the picker says nothing of a lock');
  f.ui.set({ judge: { open: true, gmId: f.gms[0].id, lastGmId: null } });
  assert.equal(lockReason(f.app.getEvent(), f.gms[0].id), null);
  assert.ok(f.vm().form);
});

test('lockReason names why judging is closed in every other phase', () => {
  const event = eventWithTeams(2, { gms: 1 });
  assert.equal(lockReason(event, 'gm-1'), 'hint.awardsClosed');
  assert.equal(lockReason(atRound(event, 0, 'briefing'), 'gm-1'), 'hint.awardsClosed');
  assert.equal(lockReason(atRound(event, 0, 'preparation'), 'gm-1'), null);
  assert.equal(lockReason(atRound(event, 0, 'reveal'), 'gm-1'), 'hint.judgeRoundOver');
  assert.equal(lockReason(atRound(event, 0, 'results'), 'gm-1'), 'hint.judgeRoundOver');
  assert.equal(lockReason(atRound(event, 0, 'preparation'), 'gm-unknown'), 'error.forbidden');
  // Outside a round there is no round heading and no list to show.
  const ui = { ...defaultUi(), judge: { open: true, gmId: 'gm-1', lastGmId: null } };
  const vm = judgeVm({ event, ui, now: 0, lang: 'en', saveStatus: { state: 'idle' }, link: LINK, projection: null });
  assert.equal(vm.header.round, '');
  assert.equal(vm.mine.rows.length, 0);
  assert.match(
    renderJudge(vm),
    /Awards open when the round&#39;s preparation starts\.|Awards open when the round's preparation starts\./,
  );
  assert.equal(judgeRoundTitle(atRound(event, 3, 'performances'), 'en'), 'Round 4 · Bible Skit');
});

test('judgeRows: newest first, removed ones left out, member awards name their team', () => {
  const base = atRound(eventWithTeams(2, { membersPerTeam: 1, gms: 1 }), 0, 'performances', { currentTurn: 0 });
  const event = withAwards(base, [
    { authorId: 'gm-1', name: 'Old', createdAt: 1 },
    { authorId: 'gm-1', name: 'Gone', status: 'discarded', createdAt: 2 },
    { recipientType: 'member', recipientId: 'm-2-1', name: 'Clear Narration', points: 25, createdAt: 3, note: 'n' },
  ]);
  const rows = judgeRows(event, event.rounds[0], 'gm-1', 'vi');
  assert.deepEqual(
    rows.mine.map((r) => r.words),
    ['Old · Creativity'],
  );
  assert.equal(rows.others[0].to, 'Member 2.1 · Đội 2');
  assert.equal(rows.others[0].author, 'Quản Trò');
  assert.equal(rows.others[0].unit, 'individual');
  assert.equal(rows.others[0].editable, false);
});

test('Done returns to the console, remembering the co-GM and clearing their drafts', () => {
  const f = makeJudge({ gm: 0 });
  f.draft({ name: 'unsent' });
  f.run('judge.done');
  assert.deepEqual(f.ui.get().judge, { open: false, gmId: null, lastGmId: f.gms[0].id });
  assert.deepEqual(f.log.focus.at(-1), '[data-action="judge.open"]', 'focus back on the Judge Mode button');
  assert.deepEqual(f.ui.draft(JUDGE_FORM), {});
  assert.deepEqual(f.ui.get().local.judge, {});
});

test('with a Host PIN, Done asks for it; a wrong PIN keeps Judge Mode open', () => {
  const f = makeJudge({ gm: 1, hostPin: '2468' });
  f.run('judge.done');
  assert.equal(f.ui.get().judge.open, true);
  let vm = f.vm();
  assert.equal(vm.pin.label, 'Host PIN');
  let html = f.html();
  assert.match(html, /type="password"/);
  assert.match(html, /data-draft="judgePin.pin"/);
  assert.match(html, /Enter the host PIN to return to the host console\./);
  assert.doesNotMatch(html, /larp-judge-form/, 'the form is hidden behind the prompt');
  f.ui.setDraft(PIN_FORM, 'pin', '1111');
  f.run('judge.unlock');
  assert.equal(f.ui.get().judge.open, true);
  vm = f.vm();
  assert.equal(vm.pin.error, "That PIN isn't right. Try again.");
  assert.equal(vm.pin.value, '', 'a wrong try is cleared');
  html = f.html();
  assert.match(html, /aria-invalid="true"/);
  f.run('judge.pinCancel');
  assert.equal(f.vm().pin, null);
  assert.equal(f.vm().stage, 'judge');
  f.run('judge.done');
  f.ui.setDraft(PIN_FORM, 'pin', ' 2468 ');
  f.run('judge.unlock');
  assert.deepEqual(f.ui.get().judge, { open: false, gmId: null, lastGmId: f.gms[1].id });
  assert.equal(f.ui.draft(PIN_FORM).pin, undefined, 'the PIN is never kept');
  // The picker is behind the PIN too (otherwise Change Name, then Done, would skip it).
  f.ui.set({ judge: { open: true, gmId: null, lastGmId: null } });
  f.run('judge.done');
  assert.equal(f.ui.get().judge.open, true);
  assert.ok(f.vm().pin);
});

test('pinMatches: trimmed comparison; no PIN always matches', () => {
  assert.equal(pinMatches(null, ''), true);
  assert.equal(pinMatches('  ', 'x'), true);
  assert.equal(pinMatches('12', '12'), true);
  assert.equal(pinMatches('12', ' 12 '), true);
  assert.equal(pinMatches('12', '13'), false);
  assert.equal(pinMatches('12', undefined), false);
});

test('every name and award text is escaped', () => {
  const f = makeJudge({ gm: 0 });
  f.app.dispatch('editGm', { gmId: f.gms[0].id, name: '<b>Anh</b>' });
  const [a] = f.order();
  f.app.dispatch('addAward', {
    recipientType: 'team',
    recipientIds: [a],
    name: '<img src=x onerror=alert(1)>',
    translation: '"quoted"',
    points: 5,
    note: '<i>n</i>',
  });
  f.draft({ name: '"><script>x</script>' });
  const html = f.html();
  assert.doesNotMatch(html, /<img|<script|<b>Anh|<i>n/);
  assert.match(html, /&lt;b&gt;Anh&lt;\/b&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  f.run('judge.switch');
  assert.doesNotMatch(f.html(), /<b>Anh/);
});

test('Judge Mode speaks the host language', () => {
  const f = makeJudge({ gm: 0, lang: 'vi' });
  const html = f.html();
  assert.match(html, /Chế Độ Giám Khảo · Anh B\./);
  assert.match(html, /Điểm Tôi Cho Vòng Này/);
  assert.match(html, /Đổi Người Chấm/);
  assert.match(html, /Vòng 1 · Khám Phá Đức Tin/);
});

test('Judge Mode strings exist in both languages', () => {
  for (const key of [
    'label.whoIsJudging',
    'label.judgeLocked',
    'label.chooseRecipient',
    'action.continueAs',
    'action.changeGm',
    'action.returnToConsole',
    'hint.pickGm',
    'hint.noCoGms',
    'hint.judgeRoundOver',
    'hint.noMyAwards',
    'hint.noOthersAwards',
    'hint.pinToLeave',
    'hint.wrongPin',
  ]) {
    assert.ok(STRINGS[key]?.vi && STRINGS[key]?.en, key);
  }
});
