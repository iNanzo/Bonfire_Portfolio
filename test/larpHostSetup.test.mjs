// The host console's Setup and Teams & Roster tabs (src/larp/hostSetup.js): teams with their
// display-face note (U01), the roster pasted one name per line, captains, co-GMs, late teams while
// running, the rounds and the live estimate with its overrun message, the display settings (sound
// off by default), Award Cards, Export Results, Import with a summary and a confirmation, Delete
// Event Data and Ready for Offline. Pure view models and markup, and the handlers on a real app
// with fake browser pieces (no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMS,
  OPEN_TEAMS_UP_TO,
  awardCardsHtml,
  faceNote,
  fieldValue,
  membersTeam,
  offlineChecklist,
  openPrint,
  parseDuration,
  probeOffline,
  readFileText,
  renderRoster,
  renderSetup,
  resultsFileName,
  rosterActions,
  rosterTab,
  rosterVm,
  setupActions,
  setupTab,
  setupVm,
  splitNames,
  teamInput,
  teamOpen,
} from '../src/larp/hostSetup.js';
import { createApp } from '../src/larp/app.js';
import { createUiStore, defaultUi } from '../src/larp/uiState.js';
import { HOST_GM_ID } from '../src/larp/types.js';
import { CSV_BOM } from '../src/larp/store.js';
import { atRound, deepFreeze, eventWithTeams, fakeStorage, makeClock, makeIds, T0 } from './lib/larpFixtures.mjs';

const LINK = { active: true, takenOver: false, otherHost: 'none', display: 'notOpened', displayWebgl: null };

/** @param {any} event @param {any} [ui] @param {any} [link] */
const ctx = (event, ui = defaultUi(), link = LINK) => ({
  event,
  ui,
  now: T0,
  lang: event.config.hostLang,
  saveStatus: { state: 'idle' },
  link,
  projection: null,
});

/** A real app and UI store, a fake env recording what the handlers ask of the shell. */
function rig() {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('s') });
  app.newEvent();
  const ui = createUiStore({ storage: fakeStorage() });
  const log = { confirms: [], downloads: [], reports: [] };
  const env = {
    now: clock.now,
    report: (r) => {
      log.reports.push(r);
      if (!r.ok && r.error) ui.set({ flash: { kind: 'error', key: `error.${r.error.code}` } });
      return r.ok;
    },
    confirm: (p) => log.confirms.push(p),
    download: (name, text, type) => log.downloads.push({ name, text, type }),
    openDisplay: () => {},
    focus: () => {},
    post: () => {},
  };
  return { app, ui, env, log, clock };
}

/** An element stand-in: dataset only (what the handlers read). */
const el = (dataset = {}) => /** @type {any} */ ({ dataset });

// ── Pure helpers ─────────────────────────────────────────────────────────────────────────────

test('a pasted roster splits one name per line, dropping list markers and blank lines', () => {
  assert.deepEqual(splitNames('Maria Nguyễn\r\n\n  - Giuse  Trần \n• Phêrô\n1. Anna\n2) Tôma\n   \n'), [
    'Maria Nguyễn',
    'Giuse Trần',
    'Phêrô',
    'Anna',
    'Tôma',
  ]);
  assert.deepEqual(splitNames('Anna\nAnna'), ['Anna', 'Anna'], 'two youth may share a name');
  assert.deepEqual(splitNames(''), []);
  assert.deepEqual(splitNames(undefined), []);
  assert.deepEqual(splitNames('10 Downing'), ['10 Downing'], 'a number without a marker stays');
});

test('allowances are typed as m:ss or seconds', () => {
  assert.equal(parseDuration('1:30'), 90_000);
  assert.equal(parseDuration(' 0:45 '), 45_000);
  assert.equal(parseDuration('50:00'), 3_000_000);
  assert.equal(parseDuration('90'), 90_000);
  for (const bad of ['', '1:75', '1:5', 'abc', '-1:00', '1.5', undefined]) assert.equal(parseDuration(bad), null, bad);
});

test('a changed control becomes the value its command wants', () => {
  assert.deepEqual(fieldValue('bool', 'true'), { ok: true, value: true });
  assert.deepEqual(fieldValue('bool', 'false'), { ok: true, value: false });
  assert.deepEqual(fieldValue('duration', '2:00'), { ok: true, value: 120_000 });
  assert.deepEqual(fieldValue('duration', 'soon'), { ok: false, code: 'invalid_duration' });
  assert.deepEqual(fieldValue('points', '300'), { ok: true, value: 300 });
  assert.deepEqual(fieldValue('points', '3.5'), { ok: false, code: 'invalid_points' });
  assert.deepEqual(fieldValue('pin', '  '), { ok: true, value: null });
  assert.deepEqual(fieldValue('pin', ' 1234 '), { ok: true, value: '1234' });
  assert.deepEqual(fieldValue('text', 'Lửa Trại'), { ok: true, value: 'Lửa Trại' });
  assert.deepEqual(fieldValue(undefined, undefined), { ok: true, value: '' });
});

test('the face note says when a name falls back to Inter (U01)', () => {
  assert.deepEqual(faceNote('Đội Phaolô', 'en'), {
    face: 'inter',
    fallback: true,
    text: 'The display sets this name in Inter: Cinzel has no Vietnamese letters.',
  });
  assert.equal(faceNote('Team Paul', 'en').face, 'cinzel');
  assert.equal(faceNote('Phaolô', 'en').fallback, false, 'ô is in Cinzel’s Latin subset');
  assert.match(faceNote('Đội Phaolô', 'vi').text, /Inter/);
});

test('small helpers: the team input, the paste target, open teams, the results file name', () => {
  assert.deepEqual(teamInput({ name: 'Đội A', patron: 'Phaolô' }), {
    name: 'Đội A',
    translation: '',
    patron: 'Phaolô',
  });
  const event = eventWithTeams(2);
  assert.equal(membersTeam(event, 'team-2'), 'team-2');
  assert.equal(membersTeam(event, 'gone'), 'team-1');
  assert.equal(membersTeam(eventWithTeams(0), undefined), null);
  assert.equal(teamOpen({}, 'team-1', OPEN_TEAMS_UP_TO, ''), true);
  assert.equal(teamOpen({}, 'team-1', OPEN_TEAMS_UP_TO + 1, ''), false);
  assert.equal(teamOpen({}, 'team-1', 100, 'giu'), true, 'searching opens what matches');
  assert.equal(teamOpen({ open: { 'team-1': false } }, 'team-1', 2, ''), false, 'the host’s choice wins');
  assert.equal(teamOpen({ open: 'odd' }, 'team-1', 2, ''), true);
  assert.equal(resultsFileName(T0), 'nghia-si-campfire-results-2026-10-10.csv');
});

test('the offline checklist maps what the probe found, and says what is missing', () => {
  const none = offlineChecklist(null, LINK, 'en');
  assert.equal(none.checked, false);
  assert.equal(none.ready, false);
  assert.equal(none.summary, 'Not checked yet. Open the display once first.');
  assert.deepEqual(
    none.items.map((i) => [i.key, i.ok]),
    [
      ['page', true],
      ['display', false],
      ['bonfire', null],
      ['knight', null],
      ['inter', null],
      ['cinzel', null],
      ['pixelify', null],
    ],
  );
  assert.equal(none.items[2].status, 'Not Checked');
  const all = { models: { bonfire: true, knight: true }, fonts: { inter: true, cinzel: true, pixelify: true } };
  const ready = offlineChecklist(all, { display: 'closed' }, 'en');
  assert.equal(ready.ready, true);
  assert.equal(ready.summary, 'Everything is loaded to run without the network.');
  assert.ok(ready.items.every((i) => i.status === 'Ready'));
  const part = offlineChecklist({ models: { bonfire: true, knight: 'yes' }, fonts: {} }, { display: 'open' }, 'en');
  assert.equal(part.ready, false);
  assert.equal(part.summary, 'Still missing: Knight Model, Inter Font, Cinzel Font, Pixelify Sans Font.');
  assert.equal(offlineChecklist(all, LINK, 'vi').items[1].status, 'Còn Thiếu');
});

// ── Teams & Roster ───────────────────────────────────────────────────────────────────────────

test('Teams & Roster lists every team with its face note, fields and members', () => {
  const event = deepFreeze({
    ...eventWithTeams(2, { membersPerTeam: 2, gms: 1 }),
    teams: [
      { ...eventWithTeams(1).teams[0], name: 'Đội Phaolô', translation: 'Team Paul', patron: 'Thánh Phaolô' },
      { ...eventWithTeams(2).teams[1], name: 'Joseph', translation: '' },
    ],
  });
  const vm = rosterVm(ctx(event));
  assert.equal(vm.teams.length, 2);
  assert.equal(vm.teams[0].face.fallback, true);
  assert.equal(vm.teams[1].face.face, 'cinzel');
  assert.deepEqual(vm.teamOptions, [
    { value: 'team-1', label: 'Đội Phaolô (Team Paul)' },
    { value: 'team-2', label: 'Joseph' },
  ]);
  assert.equal(vm.canRemoveTeam, true);
  assert.equal(vm.add.midGame, false);
  assert.equal(vm.members.teamId, 'team-1');
  const html = renderRoster(vm);
  assert.match(html, /class="larp-roster"/);
  assert.match(html, /Cinzel has no Vietnamese letters/);
  assert.match(html, /The display sets this name in Cinzel\./);
  assert.match(html, /data-change="roster\.editTeam" data-team="team-1" data-field="name"/);
  assert.match(html, /type="color"[^>]*value="#e8b04a"/);
  assert.match(html, /<option value="star" selected>Star<\/option>/);
  assert.match(html, /data-action="roster\.removeTeam" data-value="team-1"/);
  assert.match(html, /aria-label="Remove Team · Đội Phaolô"/);
  // Members: name, captain, move, remove.
  assert.match(html, /id="m-m-1-1-captain"[^>]*checked/);
  assert.match(html, /data-change="roster\.moveMember"[^>]*data-member="m-2-1"/);
  assert.match(
    html,
    /aria-label="Move To Team · Member 2\.1"[^>]*>(?:(?!<\/select>).)*<option value="team-2" selected>/s,
  );
  assert.match(html, /data-action="roster\.removeMember" data-value="m-1-2"/);
  assert.match(html, /2 Teams · 4 Members/);
  // Co-GMs: the host can't be removed.
  assert.match(html, /data-gm="gm-host"/);
  assert.doesNotMatch(html, /data-action="roster\.removeGm" data-value="gm-host"/);
  assert.match(html, /data-action="roster\.removeGm" data-value="gm-1"/);
  assert.match(html, /Names only: there are no accounts or passwords\./);
});

test('every name is escaped, never markup (A22)', () => {
  const event = eventWithTeams(1, { membersPerTeam: 1, gms: 1 });
  const evil = '<img src=x onerror=alert(1)>';
  const bad = {
    ...event,
    teams: [{ ...event.teams[0], name: evil, translation: evil, patron: evil }],
    roster: [{ ...event.roster[0], name: evil }],
    gms: [event.gms[0], { ...event.gms[1], name: evil }],
  };
  const ui = { ...defaultUi(), drafts: { [FORMS.team]: { name: evil }, [FORMS.search]: { query: '' } } };
  const html = renderRoster(rosterVm(ctx(bad, ui)));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const cards = awardCardsHtml({ ...bad, config: { ...bad.config, title: evil } }, 'en');
  assert.doesNotMatch(cards, /<img/);
});

test('the Add Team form previews the typed name in its display face', () => {
  const event = eventWithTeams(4);
  const ui = { ...defaultUi(), drafts: { [FORMS.team]: { name: 'Đội Maria', translation: 'Team Mary' } } };
  const vm = rosterVm(ctx(event, ui));
  assert.equal(vm.add.preview.fallback, true);
  assert.equal(vm.add.color, '#a77bd1', 'the fifth team takes the fifth color');
  assert.equal(vm.add.emblem, 'dove');
  const html = renderRoster(vm);
  assert.match(html, /id="add-team-name"[^>]*value="Đội Maria"[^>]*data-live/);
  assert.match(html, /class="larp-setup-preview"[^]*Đội Maria[^]*Team Mary/);
  assert.match(html, /id="add-team-face"/);
  assert.match(html, /data-action="roster\.addTeam"[^>]*>.*Add Team/);
  assert.equal(rosterVm(ctx(event)).add.preview, null, 'no preview before typing');
});

test('while running, Teams & Roster adds late teams and never removes one', () => {
  const performing = atRound(eventWithTeams(3), 1, 'performances');
  const vm = rosterVm(ctx(performing));
  assert.equal(vm.canRemoveTeam, false);
  assert.equal(vm.add.midGame, true);
  assert.equal(vm.add.hintKey, 'hint.midGamePerforming');
  const html = renderRoster(vm);
  assert.doesNotMatch(html, /roster\.removeTeam/);
  assert.match(html, /Add a Team During Play/);
  assert.match(html, /joins the end of this round&#39;s queue/);
  assert.match(html, /Add Late Team/);
  assert.equal(rosterVm(ctx(atRound(eventWithTeams(3), 1, 'briefing'))).add.hintKey, 'hint.midGameNext');
  // A team that joined mid-game wears the quiet New Team note.
  const joined = {
    ...performing,
    teams: [...performing.teams, { ...performing.teams[0], id: 'late', admittedRound: 1 }],
  };
  assert.match(renderRoster(rosterVm(ctx(joined))), /New Team/);
  // Finished: nothing to add.
  const done = { ...eventWithTeams(2), phase: 'finished' };
  assert.equal(rosterVm(ctx(done)).add, null);
  assert.doesNotMatch(renderRoster(rosterVm(ctx(done))), /roster\.addTeam/);
});

test('searching filters teams and members; many teams start folded', () => {
  const event = eventWithTeams(20, { membersPerTeam: 2 });
  const folded = rosterVm(ctx(event));
  assert.equal(folded.teams.length, 20);
  assert.ok(folded.teams.every((tm) => !tm.open));
  const html = renderRoster(folded);
  assert.doesNotMatch(html, /roster\.moveMember/, 'folded teams render no member rows');
  assert.match(html, /aria-expanded="false"[^>]*>.*?Show Details/);
  const ui = { ...defaultUi(), drafts: { [FORMS.search]: { query: 'member 7.2' } } };
  const found = rosterVm(ctx(event, ui));
  assert.deepEqual(
    found.teams.map((tm) => [tm.id, tm.members.map((m) => m.id), tm.open]),
    [['team-7', ['m-7-2'], true]],
  );
  const byTeam = rosterVm(ctx(event, { ...ui, drafts: { [FORMS.search]: { query: 'team 12' } } }));
  assert.deepEqual(byTeam.teams[0].members.length, 2, 'a team match shows all its members');
  const nothing = rosterVm(ctx(event, { ...ui, drafts: { [FORMS.search]: { query: 'zzz' } } }));
  assert.match(renderRoster(nothing), /Nothing matches that search\./);
  assert.match(renderRoster(rosterVm(ctx(eventWithTeams(0)))), /No teams yet\. Add the first one\./);
  const empty = rosterVm(ctx(eventWithTeams(1)));
  assert.match(renderRoster(empty), /No members on this team yet\./);
  assert.equal(rosterVm(ctx(eventWithTeams(0))).members, null, 'no roster paste without a team');
});

test('roster handlers: add, edit, remove (with a confirmation when members go too) and fold', () => {
  const { app, ui, env, log } = rig();
  const h = rosterActions(app, ui, env);
  ui.setDraft(FORMS.team, 'name', 'Đội Phaolô');
  ui.setDraft(FORMS.team, 'translation', 'Team Paul');
  h['roster.addTeam']({});
  const [team] = app.getEvent().teams;
  assert.deepEqual([team.name, team.translation, team.admittedRound], ['Đội Phaolô', 'Team Paul', 0]);
  assert.deepEqual(ui.draft(FORMS.team), {}, 'the form clears after adding');
  h['roster.addTeam']({});
  assert.equal(ui.get().flash.key, 'error.invalid_name', 'a blank name is refused with its reason');
  h['roster.editTeam']({ el: el({ team: team.id, field: 'emblem' }), value: 'crown' });
  h['roster.editTeam']({ el: el({ team: team.id, field: 'patron' }), value: 'Thánh Phaolô' });
  h['roster.editTeam']({ el: el({ team: team.id, field: 'id' }), value: 'x' });
  h['roster.editTeam']({ el: el({}), value: 'x' });
  assert.deepEqual([app.getEvent().teams[0].emblem, app.getEvent().teams[0].patron], ['crown', 'Thánh Phaolô']);
  // Fold and unfold.
  h['roster.toggleTeam']({ value: team.id });
  assert.equal(ui.get().local.roster.open[team.id], false);
  h['roster.toggleTeam']({ value: team.id });
  assert.equal(ui.get().local.roster.open[team.id], true);
  h['roster.toggleTeam']({});
  // Remove: no members → at once; with members → confirm first.
  app.dispatch('addTeam', { name: 'Đội Giuse' });
  app.dispatch('addMembers', { names: ['Anna', 'Tôma'], teamId: team.id });
  h['roster.removeTeam']({ value: team.id });
  assert.equal(app.getEvent().teams.length, 2);
  assert.deepEqual(log.confirms.at(-1), {
    action: 'roster.removeTeam',
    value: team.id,
    hintKey: 'hint.confirmRemoveTeam',
    labelKey: 'action.removeTeam',
    vars: { team: 'Đội Phaolô', n: 2 },
  });
  h['roster.removeTeam']({ value: team.id, confirmed: true });
  assert.deepEqual(
    app.getEvent().teams.map((tm) => tm.name),
    ['Đội Giuse'],
  );
  assert.equal(app.getEvent().roster.length, 0);
  h['roster.removeTeam']({ value: app.getEvent().teams[0].id });
  assert.equal(app.getEvent().teams.length, 0);
  h['roster.removeTeam']({ value: 'gone' });
});

test('roster handlers: paste names, rename, move, one captain per team, remove', () => {
  const { app, ui, env } = rig();
  const h = rosterActions(app, ui, env);
  h['roster.addMembers']({});
  app.dispatch('addTeam', { name: 'Đội A' });
  app.dispatch('addTeam', { name: 'Đội B' });
  const [a, b] = app.getEvent().teams;
  h['roster.addMembers']({});
  assert.equal(ui.get().flash.key, 'error.invalid_name', 'nothing pasted');
  ui.setDraft(FORMS.members, 'names', 'Maria\n- Giuse\n\n3. Phêrô');
  ui.setDraft(FORMS.members, 'teamId', b.id);
  h['roster.addMembers']({});
  assert.deepEqual(
    app.getEvent().roster.map((m) => [m.name, m.teamId]),
    [
      ['Maria', b.id],
      ['Giuse', b.id],
      ['Phêrô', b.id],
    ],
  );
  assert.deepEqual(ui.draft(FORMS.members), { teamId: b.id }, 'the names clear; the team stays picked');
  const [maria, giuse, phero] = app.getEvent().roster;
  h['roster.editMember']({ el: el({ member: maria.id }), value: 'Maria Nguyễn' });
  h['roster.editMember']({ el: el({ member: 'gone' }), value: 'x' });
  assert.equal(app.getEvent().roster[0].name, 'Maria Nguyễn');
  h['roster.captain']({ el: el({ member: maria.id }), value: 'true' });
  h['roster.captain']({ el: el({ member: giuse.id }), value: 'true' });
  const captains = () =>
    app
      .getEvent()
      .roster.filter((m) => m.captain)
      .map((m) => m.name);
  assert.deepEqual(captains(), ['Giuse'], 'one captain per team');
  h['roster.captain']({ el: el({ member: giuse.id }), value: 'false' });
  assert.deepEqual(captains(), []);
  h['roster.captain']({ el: el({ member: 'gone' }), value: 'true' });
  h['roster.captain']({ el: el({ member: phero.id }), value: 'true' });
  h['roster.moveMember']({ el: el({ member: phero.id }), value: a.id });
  const moved = app.getEvent().roster.find((m) => m.id === phero.id);
  assert.deepEqual([moved.teamId, moved.captain], [a.id, false], 'a captain who moves leaves the flag behind');
  const rev = app.getEvent().revision;
  h['roster.moveMember']({ el: el({ member: phero.id }), value: a.id });
  assert.equal(app.getEvent().revision, rev, 'moving to the same team does nothing');
  h['roster.removeMember']({ value: giuse.id });
  h['roster.removeMember']({ value: 'gone' });
  assert.deepEqual(
    app.getEvent().roster.map((m) => m.name),
    ['Maria Nguyễn', 'Phêrô'],
  );
});

test('roster handlers: co-GMs by name, and late teams while running', () => {
  const { app, ui, env } = rig();
  const h = rosterActions(app, ui, env);
  ui.setDraft(FORMS.gm, 'name', 'Anh B.');
  h['roster.addGm']({});
  const gm = app.getEvent().gms.find((g) => !g.host);
  assert.equal(gm.name, 'Anh B.');
  assert.deepEqual(ui.draft(FORMS.gm), {});
  h['roster.editGm']({ el: el({ gm: gm.id }), value: 'Chị C.' });
  h['roster.editGm']({ el: el({}), value: 'x' });
  assert.equal(app.getEvent().gms.find((g) => g.id === gm.id).name, 'Chị C.');
  h['roster.removeGm']({ value: HOST_GM_ID });
  assert.equal(ui.get().flash.key, 'error.host_required');
  h['roster.removeGm']({ value: gm.id });
  h['roster.removeGm']({});
  assert.equal(app.getEvent().gms.length, 1);
  // Running: Add Team becomes addTeamMidGame.
  app.dispatch('addTeam', { name: 'Đội A' });
  app.dispatch('startEvent', {});
  ui.setDraft(FORMS.team, 'name', 'Đội Muộn');
  h['roster.addTeam']({});
  const late = app.getEvent().teams.at(-1);
  assert.deepEqual([late.name, late.admittedRound], ['Đội Muộn', 0], 'from Welcome it starts with the next round');
});

test('the roster tab follows the screen interface', () => {
  assert.equal(rosterTab.id, 'roster');
  assert.equal(rosterTab.labelKey, 'tab.roster');
  assert.equal(setupTab.id, 'setup');
  const { app, ui, env } = rig();
  const names = Object.keys({ ...rosterTab.actions(app, ui, env), ...setupTab.actions(app, ui, env) });
  assert.ok(
    names.every((n) => /^(roster|setup)\./.test(n)),
    names.join(),
  );
});

// ── Setup ────────────────────────────────────────────────────────────────────────────────────

test('Setup shows the live estimate: within the target at four teams, the overrun at five', () => {
  const four = setupVm(ctx(eventWithTeams(4)));
  assert.equal(four.estimate.overrun, false);
  assert.equal(four.estimate.text, 'Estimated 50:00 · within the 50:00 target');
  assert.equal(four.estimate.teams, 'Worked out for 4 teams.');
  const five = setupVm(ctx(eventWithTeams(5)));
  assert.equal(five.estimate.text, 'Estimated 56:00 · 6:00 over the 50:00 target');
  const html = renderSetup(five);
  assert.match(html, /class="larp-setup-est-text is-over" role="status">Estimated 56:00 · 6:00 over the 50:00 target/);
  assert.match(html, /Round 4 · Bible Skit<\/th><td>13:45<\/td>/);
  assert.match(html, /<tfoot><tr><th scope="row">Estimate<\/th><td>56:00<\/td>/);
  assert.match(
    html,
    /id="setup-targetMs"[^>]*value="50:00"[^>]*data-change="setup\.config" data-field="targetMs" data-kind="duration"/,
  );
  const vi = setupVm(ctx({ ...eventWithTeams(5), config: { ...eventWithTeams(5).config, hostLang: 'vi' } }));
  assert.match(vi.estimate.text, /vượt 6:00/);
});

test('Setup lists every round with its prompt, base points and allowances', () => {
  const vm = setupVm(ctx(eventWithTeams(2)));
  assert.equal(vm.rounds.length, 5);
  assert.deepEqual(vm.rounds[0].durations, {
    prepMs: '1:30',
    turnMs: '0:45',
    transitionMs: '0:15',
    reviewRevealMs: '0:30',
  });
  assert.equal(vm.rounds[0].base, '100');
  const html = renderSetup(vm);
  assert.match(html, /<legend>Round 1 · Faith Discovery/);
  assert.match(
    html,
    /id="round-round-faith-prompt"[^>]*data-change="setup\.round" data-round="round-faith" data-field="prompt" data-kind="text"/,
  );
  assert.match(html, /id="round-round-dance-base"[^>]*value="200"[^>]*data-kind="points"/);
  assert.match(html, /id="round-round-skit-prepMs"[^>]*value="4:00"/);
  assert.doesNotMatch(html, /id="round-round-faith-base"[^>]*disabled/);
  assert.match(html, /Times are minutes and seconds, such as 1:30\./);
});

test('once running, base points lock and started rounds lock; finished locks all', () => {
  const event = atRound(eventWithTeams(2), 1, 'performances');
  const skipped = { ...event, rounds: event.rounds.map((r, i) => (i === 3 ? { ...r, skipped: true } : r)) };
  const vm = setupVm(ctx(skipped));
  assert.deepEqual(
    vm.rounds.map((r) => [r.locked, r.baseLocked, r.lockKey]),
    [
      [true, true, 'hint.roundStarted'],
      [true, true, 'hint.roundStarted'],
      [false, true, 'hint.baseLocked'],
      [true, true, 'hint.roundStarted'],
      [false, true, 'hint.baseLocked'],
    ],
  );
  const html = renderSetup(vm);
  assert.match(html, /id="round-round-prayer-base"[^>]*disabled/);
  assert.doesNotMatch(html, /id="round-round-prayer-turnMs"[^>]*disabled/);
  assert.match(html, /id="round-round-faith-turnMs"[^>]*disabled/);
  assert.match(html, /This round has started, so it can no longer be changed\./);
  assert.match(html, /Round 4 · Bible Skit<\/th><td>Skipped<\/td>/);
  const done = setupVm(ctx({ ...eventWithTeams(2), phase: 'finished' }));
  assert.ok(done.rounds.every((r) => r.locked && r.lockKey === 'error.locked'));
  assert.match(renderSetup(done), /id="setup-openingMs"[^>]*disabled/);
});

test('display settings: language mode, scenery, reduced motion, sound off by default, show members, Host PIN', () => {
  const vm = setupVm(ctx(eventWithTeams(1)));
  assert.equal(vm.config.sound, false);
  assert.equal(vm.config.hostPin, '');
  const html = renderSetup(vm);
  assert.match(
    html,
    /<option value="bilingual" selected>Bilingual<\/option><option value="en-first">English First<\/option><option value="vi-only">Vietnamese Only<\/option>/,
  );
  assert.match(html, /<option value="ruins" selected>Gothic Ruins<\/option>/);
  assert.match(html, /<option value="cathedral">Cathedral Altar<\/option>/);
  assert.match(html, /id="setup-sound"[^>]*data-change="setup\.config"[^>]*data-field="sound" data-kind="bool"/);
  assert.doesNotMatch(html, /id="setup-sound"[^>]*checked/);
  assert.match(html, /Off by default\. The prayer round is always silent\./);
  assert.match(html, /id="setup-hostPin"[^>]*data-kind="pin"/);
  assert.match(html, /<option value="en" selected>English<\/option>/);
  const on = setupVm(
    ctx({ ...eventWithTeams(1), config: { ...eventWithTeams(1).config, sound: true, hostPin: '42' } }),
  );
  assert.match(renderSetup(on), /id="setup-sound"[^>]*checked/);
  assert.match(renderSetup(on), /id="setup-hostPin"[^>]*value="42"/);
});

test('Setup offers Award Cards, export, import, Delete Event Data and Ready for Offline', () => {
  const html = renderSetup(setupVm(ctx(eventWithTeams(1))));
  assert.match(html, /data-action="setup\.printCards"[^>]*>.*Print Award Cards/);
  assert.match(html, /data-action="exportBackup"[^>]*>.*Export Backup/);
  assert.match(html, /data-action="setup\.exportResults"[^>]*>.*Export Results CSV/);
  assert.match(html, /type="file"[^>]*accept="\.json,application\/json"[^>]*data-change="setup\.importFile"/);
  assert.match(html, /data-action="setup\.deleteData"[^>]*>.*Delete Event Data/);
  assert.match(html, /data-action="setup\.checkOffline"[^>]*>.*Ready For Offline/);
  assert.match(html, /Load the page while online, then close neither the browser nor the display\./);
  assert.match(html, /is-unknown[^]*Bonfire Model[^]*Not Checked/);
  // A pending import shows its summary first.
  const ui = {
    ...defaultUi(),
    local: {
      setup: {
        importSummary: { title: 'Trại <Hè>', teams: 6, roundsPublished: 2 },
        offline: { models: { bonfire: true, knight: true }, fonts: { inter: true, cinzel: true, pixelify: false } },
      },
    },
  };
  const pending = renderSetup(setupVm(ctx(eventWithTeams(1), ui, { ...LINK, display: 'open' })));
  assert.match(pending, /<strong>Trại &lt;Hè&gt;<\/strong>/);
  assert.match(pending, /This backup has 6 teams and 2 published rounds\. Importing replaces the current event\./);
  assert.match(pending, /data-action="setup\.importConfirm"/);
  assert.match(pending, /data-action="setup\.importCancel"/);
  assert.match(pending, /Still missing: Pixelify Sans Font\./);
  assert.match(pending, /Check Again/);
  const odd = { ...defaultUi(), local: { setup: { importSummary: { teams: 'x' } } } };
  assert.equal(setupVm(ctx(eventWithTeams(1), odd)).importSummary, null, 'a stored oddity is ignored');
});

test('setup handlers: settings and rounds dispatch, a bad value flashes its reason', () => {
  const { app, ui, env } = rig();
  const h = setupActions(app, ui, env, { readFile: async () => null, openPrint: () => true, probe: async () => ({}) });
  const config = (field, kind, value) => h['setup.config']({ el: el({ field, kind }), value });
  config('sound', 'bool', 'true');
  config('scenery', 'text', 'cathedral');
  config('targetMs', 'duration', '55:00');
  config('hostPin', 'pin', ' 7 ');
  config('title', 'text', 'Trại Hè 2026');
  const c = app.getEvent().config;
  assert.deepEqual(
    [c.sound, c.scenery, c.targetMs, c.hostPin, c.title],
    [true, 'cathedral', 3_300_000, '7', 'Trại Hè 2026'],
  );
  config('openingMs', 'duration', 'later');
  assert.equal(ui.get().flash.key, 'error.invalid_duration');
  config('scenery', 'text', 'forge');
  assert.equal(ui.get().flash.key, 'error.invalid_config');
  h['setup.config']({ el: el({}), value: 'x' });
  const round = (field, kind, value, roundId = 'round-dance') =>
    h['setup.round']({ el: el({ round: roundId, field, kind }), value });
  round('turnMs', 'duration', '1:15');
  round('base', 'points', '250');
  round('prompt', 'text', 'Bốn động tác.');
  const dance = app.getEvent().rounds[1];
  assert.deepEqual([dance.turnMs, dance.base, dance.prompt], [75_000, 250, 'Bốn động tác.']);
  round('base', 'points', 'lots');
  assert.equal(ui.get().flash.key, 'error.invalid_points');
  h['setup.round']({ el: el({ field: 'base' }), value: '1' });
  // Running: the base is locked.
  app.dispatch('addTeam', { name: 'Đội A' });
  app.dispatch('startEvent', {});
  round('base', 'points', '10');
  assert.equal(ui.get().flash.key, 'error.locked');
});

test('setup handlers: Award Cards open a print page; Export Results downloads the CSV', () => {
  const { app, ui, env, log } = rig();
  app.dispatch('addTeam', { name: 'Đội Phaolô' });
  const printed = [];
  let allow = true;
  const h = setupActions(app, ui, env, {
    readFile: async () => null,
    openPrint: (html) => (printed.push(html), allow),
    probe: async () => ({}),
  });
  h['setup.printCards']({});
  assert.equal(printed.length, 1);
  assert.match(printed[0], /^<!doctype html>/);
  assert.match(printed[0], /Đội Phaolô/);
  allow = false;
  h['setup.printCards']({});
  assert.equal(ui.get().flash.key, 'hint.popupBlocked');
  h['setup.exportResults']({});
  assert.equal(log.downloads[0].name, 'nghia-si-campfire-results-2026-10-10.csv');
  assert.equal(log.downloads[0].type, 'text/csv');
  assert.ok(log.downloads[0].text.startsWith(CSV_BOM), 'with its byte-order mark');
});

test('setup handlers: Import shows a summary, then replaces the event only once confirmed', async () => {
  const source = rig();
  source.app.dispatch('addTeam', { name: 'Đội Nguồn' });
  source.app.dispatch('addTeam', { name: 'Đội Hai' });
  const backup = source.app.exportBackup();
  const { app, ui, env, log } = rig();
  let file = backup;
  const h = setupActions(app, ui, env, {
    readFile: async () => file,
    openPrint: () => true,
    probe: async () => ({}),
  });
  h['setup.importConfirm']({});
  assert.equal(log.confirms.length, 0, 'nothing pending yet');
  await h['setup.importFile']({ el: el() });
  assert.equal(ui.get().local.setup.importSummary.teams, 2);
  assert.equal(app.getEvent().teams.length, 0, 'reading replaces nothing');
  h['setup.importConfirm']({});
  assert.deepEqual(log.confirms[0], {
    action: 'setup.importConfirm',
    hintKey: 'hint.confirmImport',
    labelKey: 'action.importBackup',
  });
  assert.equal(app.getEvent().teams.length, 0);
  h['setup.importConfirm']({ confirmed: true });
  assert.deepEqual(
    app.getEvent().teams.map((tm) => tm.name),
    ['Đội Nguồn', 'Đội Hai'],
  );
  assert.equal(ui.get().local.setup.importSummary, null);
  assert.deepEqual(ui.get().flash, { kind: 'info', key: 'hint.imported' });
  // A bad file flashes its reason; Cancel drops a pending import; no file does nothing.
  file = '{nope';
  await h['setup.importFile']({ el: el() });
  assert.equal(ui.get().flash.key, 'error.bad_json');
  file = backup;
  await h['setup.importFile']({ el: el() });
  h['setup.importCancel']({});
  assert.equal(ui.get().local.setup.importText, null);
  file = null;
  await h['setup.importFile']({ el: el() });
  assert.equal(ui.get().local.setup.importSummary, null);
  // A pending text that went bad (stored copy edited) is refused at confirmation.
  ui.setLocal('setup', { importText: '{"app":"other"}' });
  h['setup.importConfirm']({ confirmed: true });
  assert.equal(ui.get().flash.key, 'error.bad_backup');
});

test('setup handlers: Delete Event Data asks first, then starts a fresh event', () => {
  const { app, ui, env, log } = rig();
  app.dispatch('addTeam', { name: 'Đội A' });
  const h = setupActions(app, ui, env, { readFile: async () => null, openPrint: () => true, probe: async () => ({}) });
  const id = app.getEvent().id;
  h['setup.deleteData']({});
  assert.equal(log.confirms[0].hintKey, 'hint.confirmDelete');
  assert.equal(app.getEvent().teams.length, 1);
  h['setup.deleteData']({ confirmed: true });
  assert.notEqual(app.getEvent().id, id);
  assert.equal(app.getEvent().teams.length, 0);
  assert.equal(ui.get().flash.key, 'hint.deleted');
});

test('setup handlers: Ready for Offline keeps what the probe found', async () => {
  const { app, ui, env, clock } = rig();
  const found = { models: { bonfire: true, knight: false }, fonts: { inter: true, cinzel: true, pixelify: true } };
  const h = setupActions(app, ui, env, { readFile: async () => null, openPrint: () => true, probe: async () => found });
  await h['setup.checkOffline']({});
  assert.deepEqual(ui.get().local.setup.offline, { ...found, at: clock.now() });
  const vm = setupVm({ ...ctx(app.getEvent(), ui.get()), link: { ...LINK, display: 'open' } });
  assert.equal(vm.offline.summary, 'Still missing: Knight Model.');
});

// ── Award Cards ──────────────────────────────────────────────────────────────────────────────

test('Award Cards are a printable page in both languages with the rounds and teams to tick', () => {
  const event = eventWithTeams(3);
  const html = awardCardsHtml(event, 'en');
  assert.match(html, /^<!doctype html><html lang="vi">/);
  assert.match(html, /<title>Award Cards · Lửa Trại Nghĩa Sĩ<\/title>/);
  assert.match(html, /@media print/);
  assert.equal(html.match(/<article class="card">/g).length, 8);
  assert.match(html, /Thẻ Chấm Điểm · Award Cards/);
  assert.match(html, /Điểm · Points/);
  assert.match(html, /Ghi Chú Cho Huynh Trưởng · Note For HTs/);
  assert.match(html, /1 Khám Phá Đức Tin/);
  assert.match(html, /<ul class="teams"><li><span class="box"><\/span><svg[^]*Đội 1<\/li>/);
  assert.match(html, /Press Ctrl\+P \(or ⌘P\) to print\./);
  assert.equal(awardCardsHtml(event, 'en', { cards: 2 }).match(/class="card"/g).length, 2);
  assert.equal(awardCardsHtml(event, 'en', { cards: 0 }).match(/class="card"/g).length, 1);
  const many = awardCardsHtml(eventWithTeams(30), 'vi');
  assert.doesNotMatch(many, /class="teams"/, 'too many teams to list: a line to write on');
  const skipped = { ...event, rounds: event.rounds.map((r, i) => (i === 2 ? { ...r, skipped: true } : r)) };
  assert.doesNotMatch(awardCardsHtml(skipped, 'en'), /3 Cầu Nguyện/);
});

// ── The thin browser layer, with fakes ───────────────────────────────────────────────────────

test('readFileText reads the chosen file, or gives null', async () => {
  assert.equal(await readFileText({ files: [{ text: async () => 'hello' }] }), 'hello');
  assert.equal(await readFileText({ files: [] }), null);
  assert.equal(await readFileText(null), null);
});

test('openPrint writes the page into a new window and prints; a blocked window gives false', () => {
  const calls = [];
  const w = {
    document: {
      open: () => calls.push('open'),
      write: (html) => calls.push(`write:${html}`),
      close: () => calls.push('close'),
    },
    focus: () => calls.push('focus'),
    print: () => calls.push('print'),
  };
  assert.equal(openPrint('<p>x</p>', { open: () => w }), true);
  assert.deepEqual(calls, ['open', 'write:<p>x</p>', 'close', 'focus', 'print']);
  assert.equal(openPrint('<p>x</p>', { open: () => null }), false);
  assert.equal(openPrint('<p>x</p>', undefined), false, 'no window at all (node)');
});

test('probeOffline asks the cache for the models and loads the fonts', async () => {
  const asked = [];
  const result = await probeOffline({
    base: '/base/',
    perf: { getEntriesByType: () => [{ name: 'https://x.test/base/models/knight.glb' }] },
    fetchImpl: async (url, init) => {
      asked.push([url, init.cache]);
      return { ok: url.endsWith('bonfire.glb') };
    },
    fonts: { load: async (font) => (font.includes('Pixelify') ? [] : [{}]) },
  });
  assert.deepEqual(result, {
    models: { bonfire: true, knight: true },
    fonts: { inter: true, cinzel: true, pixelify: false },
  });
  assert.deepEqual(asked, [['/base/models/bonfire.glb', 'only-if-cached']], 'what timing saw needs no fetch');
  const offline = await probeOffline({
    perf: null,
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
    fonts: {
      load: async () => {
        throw new Error('NetworkError');
      },
    },
  });
  assert.deepEqual(offline, {
    models: { bonfire: false, knight: false },
    fonts: { inter: false, cinzel: false, pixelify: false },
  });
  const bare = await probeOffline({ perf: null, fetchImpl: async () => null, fonts: null });
  assert.deepEqual(bare.fonts, { inter: false, cinzel: false, pixelify: false });
});
