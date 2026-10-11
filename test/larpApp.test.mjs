// The host window's controller (src/larp/app.js): a dispatched action becomes one command for the
// reducer, an accepted one is saved and posted to the display (public projection only, A07), a
// repeated command id changes nothing (A05), a refused one saves and posts nothing, a browser that
// won't store keeps play going in memory with the Saved indicator failed (U06), and a reload
// resumes the saved event (A16). Injected storage, clock, ids and channel: no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlan, createApp, shouldAdopt } from '../src/larp/app.js';
import { HOST_GM_ID } from '../src/larp/types.js';
import { CSV_BOM, STORE_KEY } from '../src/larp/store.js';
import { fakeStorage, makeClock, makeIds } from './lib/larpFixtures.mjs';
import { recordingChannel } from './lib/larpBrowser.mjs';

function setup({ storage = fakeStorage(), channel = recordingChannel(), prefix = 't' } = {}) {
  const clock = makeClock();
  const changes = [];
  const app = createApp({
    storage,
    clock: clock.now,
    newId: makeIds(prefix),
    channel,
    onChange: (a) => changes.push(a),
  });
  return { app, storage, channel, clock, changes };
}

/** A running event at Performances of round 1 with two teams and a co-GM. */
function performing(app) {
  app.newEvent();
  for (const name of ['Đội Phaolô', 'Đội Giuse']) assert.ok(app.dispatch('addTeam', { name }).ok);
  assert.ok(app.dispatch('addGm', { name: 'Anh B.' }).ok);
  for (const type of ['startEvent', 'nextRound', 'startPreparation', 'endPreparation', 'nextTeam']) {
    assert.equal(app.dispatch(type).error, null, type);
  }
  return app.getEvent();
}

test('a new event is saved and posted at once; the Saved indicator says so', () => {
  const { app, storage, channel, changes } = setup();
  assert.equal(app.getEvent(), null);
  assert.equal(app.getProjection(), null);
  assert.deepEqual(app.getSaveStatus(), { state: 'idle' });
  const event = app.newEvent();
  assert.equal(event.phase, 'setup');
  assert.ok(event.id.startsWith('t-event-'));
  assert.equal(app.getSaveStatus().state, 'saved');
  assert.ok(storage.map.has(STORE_KEY));
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].type, 'projection');
  assert.equal(channel.sent[0].projection.eventId, event.id);
  assert.deepEqual(channel.sent[0].events, []);
  assert.ok(changes.length >= 1);
});

test('dispatch builds a command with a fresh id, saves and posts when accepted', () => {
  const { app, storage, channel } = setup();
  app.newEvent();
  const writes = storage.writes;
  const r = app.dispatch('addTeam', { name: 'Đội Phaolô', translation: 'Team Paul' });
  assert.deepEqual({ ok: r.ok, error: r.error, duplicate: r.duplicate }, { ok: true, error: null, duplicate: false });
  assert.equal(r.events[0].type, 'teamAdded');
  assert.equal(app.getEvent().teams[0].name, 'Đội Phaolô');
  assert.equal(app.getEvent().history.at(-1).actorId, HOST_GM_ID);
  assert.equal(storage.writes, writes + 1);
  assert.equal(channel.sent.at(-1).projection.teams[0].translation, 'Team Paul');
  assert.deepEqual(channel.sent.at(-1).events, [{ type: 'teamAdded', teamId: app.getEvent().teams[0].id }]);
  assert.deepEqual(app.lastEvents(), r.events);
  const second = app.dispatch('addTeam', { name: 'Đội Giuse' });
  assert.notEqual(app.getEvent().history.at(-1).commandId, app.getEvent().history.at(-2).commandId);
  assert.ok(second.ok);
});

test('a refused command saves and posts nothing and says why', () => {
  const { app, storage, channel } = setup();
  app.newEvent();
  const before = app.getEvent();
  const writes = storage.writes;
  const posts = channel.sent.length;
  const r = app.dispatch('startEvent');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'no_teams');
  assert.equal(app.getEvent(), before);
  assert.equal(storage.writes, writes);
  assert.equal(channel.sent.length, posts);
  assert.equal(app.dispatch('addTeam', { name: '   ' }).error.code, 'invalid_name');
});

test('a repeated command id (a double-click, Enter twice) applies once (A05)', () => {
  const { app, storage, channel } = setup();
  app.newEvent();
  const first = app.dispatch('addTeam', { name: 'Đội Maria' }, { id: 'click-1' });
  const writes = storage.writes;
  const posts = channel.sent.length;
  const again = app.dispatch('addTeam', { name: 'Đội Maria' }, { id: 'click-1' });
  assert.ok(first.ok);
  assert.deepEqual(again, { ok: true, error: null, duplicate: true, events: [] });
  assert.equal(app.getEvent().teams.length, 1);
  assert.equal(storage.writes, writes);
  assert.equal(channel.sent.length, posts);
});

test('Judge Mode commands carry the co-GM and their mode; phase controls are refused (A03)', () => {
  const { app } = setup();
  performing(app);
  const gm = app.getEvent().gms.find((g) => !g.host);
  const teamId = app.getEvent().teams[0].id;
  const judge = { mode: /** @type {const} */ ('judge'), actorId: gm.id };
  const r = app.dispatch(
    'addAward',
    { recipientType: 'team', recipientIds: [teamId], name: 'Sáng Tạo', points: 50 },
    judge,
  );
  assert.equal(r.error, null);
  const adj = app.getEvent().adjustments.at(-1);
  assert.equal(adj.authorId, gm.id);
  assert.equal(app.getEvent().history.at(-1).mode, 'judge');
  assert.equal(app.dispatch('beginReview', {}, judge).error.code, 'forbidden');
  assert.equal(app.dispatch('nextTeam', {}, judge).error.code, 'forbidden');
});

test('the display is only ever posted the public projection: no notes, authors or draft events (A07)', () => {
  const { app, channel } = setup();
  performing(app);
  const teamId = app.getEvent().teams[0].id;
  const gm = app.getEvent().gms.find((g) => !g.host);
  const before = channel.sent.length;
  app.dispatch('addAward', {
    recipientType: 'team',
    recipientIds: [teamId],
    name: 'Tinh Thần',
    points: 25,
    note: 'secret note for HTs',
    authorId: gm.id,
  });
  // A draft changes nothing public: nothing is posted, not even a bumped revision that would
  // let a listener count the judging going on.
  assert.equal(channel.sent.length, before, 'a draft award posts nothing');
  app.broadcast(); // a display's hello still gets the projection at once
  assert.deepEqual(channel.sent.at(-1).events, [], 'awardAdded is not passed on');
  const all = JSON.stringify(channel.sent);
  assert.doesNotMatch(all, /secret note/);
  assert.doesNotMatch(all, /Tinh Thần/, 'a draft award never reaches the display');
  assert.doesNotMatch(all, new RegExp(gm.id));
  assert.doesNotMatch(all, /seenCommandIds|history|hostPin/);
});

test('storage that refuses keeps play going in memory, with the Saved indicator failed (U06)', () => {
  const storage = fakeStorage({ failFrom: 3 });
  const { app, changes } = setup({ storage });
  app.newEvent();
  assert.equal(app.dispatch('addTeam', { name: 'Đội 1' }).ok, true);
  assert.equal(app.getSaveStatus().state, 'saved');
  const r = app.dispatch('addTeam', { name: 'Đội 2' });
  assert.equal(r.ok, true, 'the command still counts');
  assert.equal(app.getEvent().teams.length, 2);
  assert.deepEqual(
    { state: app.getSaveStatus().state, reason: app.getSaveStatus().reason },
    { state: 'failed', reason: 'storage_failed' },
  );
  assert.ok(changes.length > 0);
});

test('no storage at all (a private window): resume says so, a new event plays in memory', () => {
  const { app } = setup({ storage: null });
  const r = app.resume();
  assert.deepEqual(r, { ok: false, reason: 'storage_unavailable' });
  assert.equal(app.getSaveStatus().state, 'failed');
  app.newEvent();
  assert.ok(app.dispatch('addTeam', { name: 'Đội 1' }).ok);
  assert.equal(app.getSaveStatus().reason, 'storage_unavailable');
});

test('a reload resumes the saved event exactly, and posts it to the display (A16)', () => {
  const storage = fakeStorage();
  const first = setup({ storage });
  performing(first.app);
  const saved = first.app.getEvent();
  const channel = recordingChannel();
  const second = setup({ storage, channel });
  const r = second.app.resume();
  assert.equal(r.ok, true);
  assert.deepEqual(second.app.getEvent(), saved);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].projection.revision, saved.revision);
  const empty = setup().app.resume();
  assert.deepEqual(empty, { ok: true, event: null });
});

test('backups: export, read (replacing nothing), then replace; results CSV; delete event data', () => {
  const { app, storage, channel } = setup();
  performing(app);
  const event = app.getEvent();
  const text = app.exportBackup();
  const other = setup({ prefix: 'o' });
  other.app.newEvent();
  const read = other.app.readBackup(text);
  assert.equal(read.ok, true);
  assert.equal(read.summary.teams, 2);
  assert.notEqual(other.app.getEvent().id, event.id, 'reading replaces nothing');
  other.app.replaceEvent(read.event);
  assert.deepEqual(other.app.getEvent(), event);
  assert.equal(other.channel.sent.at(-1).projection.eventId, event.id);
  assert.equal(other.app.readBackup('{nope').reason, 'bad_json');
  assert.ok(app.exportResultsCsv().startsWith(CSV_BOM + 'Section,'), 'the CSV after its byte-order mark');

  const r = app.deleteEventData();
  assert.equal(r.ok, true);
  assert.notEqual(app.getEvent().id, event.id, 'a fresh event takes its place');
  assert.equal(app.getEvent().phase, 'setup');
  assert.equal(JSON.parse(storage.map.get(STORE_KEY)).id, app.getEvent().id);
  assert.equal(channel.sent.at(-1).projection.eventId, app.getEvent().id);
});

test('without an event: no dispatch, no files', () => {
  const { app } = setup();
  assert.equal(app.dispatch('addTeam', { name: 'X' }).error.code, 'not_found');
  assert.equal(app.exportBackup(), '');
  assert.equal(app.exportResultsCsv(), '');
});

test('behind another host window (setActive false): commands refused, nothing posted', () => {
  const { app, channel, changes } = setup();
  app.newEvent();
  const posts = channel.sent.length;
  const n = changes.length;
  app.setActive(false);
  app.setActive(false);
  assert.equal(changes.length, n + 1, 'one change, not two');
  assert.equal(app.isActive(), false);
  assert.equal(app.dispatch('addTeam', { name: 'Đội 1' }).error.code, 'forbidden');
  app.broadcast();
  assert.equal(channel.sent.length, posts);
  app.setActive(true);
  assert.equal(channel.sent.length, posts + 1, 'holding the lock again posts the projection');
  app.broadcast();
  assert.equal(channel.sent.length, posts + 2);
});

test('subscribe adds listeners and unsubscribes; an app without a channel still works', () => {
  const app = createApp({ storage: fakeStorage(), clock: () => 1, newId: makeIds('x') });
  let calls = 0;
  const off = app.subscribe(() => calls++);
  app.newEvent();
  off();
  app.dispatch('addTeam', { name: 'Đội 1' });
  assert.equal(calls, 1);
  assert.equal(app.getProjection(5).now, 5);
});

test('boot: a save it cannot read is never written over (newer version, damaged JSON)', () => {
  assert.equal(bootPlan({ ok: true, event: null }), 'new');
  assert.equal(bootPlan({ ok: true, event: /** @type {any} */ ({ id: 'e' }) }), 'resume');
  assert.equal(bootPlan({ ok: false, reason: 'storage_unavailable' }), 'new', 'nothing there to protect');
  for (const reason of ['newer_version', 'bad_json', 'bad_backup'])
    assert.equal(bootPlan({ ok: false, reason }), 'protect');

  for (const damage of ['newer', 'json']) {
    const storage = fakeStorage();
    const first = setup({ storage }).app;
    first.newEvent();
    first.dispatch('addTeam', { name: 'Đội Phaolô' });
    const saved = JSON.parse(storage.map.get(STORE_KEY));
    const text = damage === 'newer' ? JSON.stringify({ ...saved, schemaVersion: 99 }) : '{"truncated":';
    storage.map.set(STORE_KEY, text);

    const { app } = setup({ storage, prefix: 'b' });
    const resumed = app.resume();
    assert.equal(resumed.ok, false);
    assert.equal(bootPlan(resumed), 'protect', damage);
    const kept = app.protectUnreadable();
    assert.deepEqual({ kept: kept.kept, saving: kept.saving }, { kept: true, saving: true });
    assert.equal(storage.map.get(kept.copyKey), text, 'the unreadable text is copied aside');
    assert.equal(app.unreadableText(), text);
    app.newEvent();
    assert.equal(storage.map.get(kept.copyKey), text, 'and stays there after the new event is saved');
  }
});

test('boot: when the unreadable save cannot even be copied, saving stays off until Delete Event Data', () => {
  const tiny = fakeStorage({ capacity: 20 });
  tiny.map.set(STORE_KEY, '{not json');
  const { app } = setup({ storage: tiny });
  assert.equal(app.resume().ok, false);
  const kept = app.protectUnreadable();
  assert.deepEqual(kept, { kept: true, copyKey: null, saving: false });
  app.newEvent();
  app.dispatch('addTeam', { name: 'Đội 1' });
  assert.equal(tiny.map.get(STORE_KEY), '{not json', 'never written over');
  assert.equal(app.getSaveStatus().state, 'failed', 'the console says Not Saved (Export Backup)');
  app.deleteEventData();
  assert.notEqual(tiny.map.get(STORE_KEY), '{not json', 'the host chose to delete it: saving resumes');
  assert.equal(app.unreadableText(), null);

  const empty = setup().app;
  assert.deepEqual(empty.protectUnreadable(), { kept: false, copyKey: null, saving: true });
});

test('a new window holds back: it saves and posts nothing until it knows it holds the lock', () => {
  const storage = fakeStorage();
  const channel = recordingChannel();
  const app = createApp({ storage, clock: () => 5, newId: makeIds('i'), channel, holding: true });
  app.resume();
  app.newEvent();
  assert.equal(app.isActive(), false);
  assert.equal(app.dispatch('addTeam', { name: 'Đội 1' }).ok, true, 'the host can start at once');
  assert.equal(channel.sent.length, 0, 'no stale or empty projection reaches the display');
  assert.equal(storage.map.has(STORE_KEY), false, 'and nothing is saved over another window');
  app.setActive(true);
  assert.equal(app.isActive(), true);
  assert.equal(channel.sent.length, 1);
  assert.equal(JSON.parse(storage.map.get(STORE_KEY)).teams.length, 1, 'saved once this window is the host');

  // An older window answered: this one yields, and its fresh event is never saved or posted.
  const other = fakeStorage();
  const quiet = recordingChannel();
  const late = createApp({ storage: other, clock: () => 5, newId: makeIds('j'), channel: quiet, holding: true });
  late.resume();
  late.newEvent();
  late.setActive(false);
  assert.equal(late.isActive(), false);
  assert.equal(late.dispatch('addTeam', { name: 'X' }).error.code, 'forbidden');
  assert.deepEqual([quiet.sent.length, other.map.has(STORE_KEY)], [0, false]);
});

test('Take Over keeps a newer event this window holds instead of the stale saved copy', () => {
  const ev = (id, revision) => /** @type {any} */ ({ id, revision });
  assert.equal(shouldAdopt(null, ev('a', 1)), true);
  assert.equal(shouldAdopt(ev('a', 1), null), false);
  assert.equal(shouldAdopt(ev('a', 5), ev('a', 5)), true);
  assert.equal(shouldAdopt(ev('a', 5), ev('a', 7)), true, 'the other window saved more');
  assert.equal(shouldAdopt(ev('a', 7), ev('a', 5)), false, 'this window is ahead (its saves were refused)');
  assert.equal(shouldAdopt(ev('a', 7), ev('b', 1)), true, 'the other window replaced the event');

  const storage = fakeStorage({ failFrom: 4 });
  const { app } = setup({ storage });
  app.newEvent();
  app.dispatch('addTeam', { name: 'Đội 1' });
  app.dispatch('addTeam', { name: 'Đội 2' }); // refused by the storage: only in memory
  app.dispatch('addTeam', { name: 'Đội 3' });
  assert.equal(app.adoptSaved(), false);
  assert.equal(app.getEvent().teams.length, 3, 'the unsaved progress stays');

  const other = fakeStorage();
  const a = setup({ storage: other }).app;
  a.newEvent();
  const b = setup({ storage: other, prefix: 'q' }).app;
  a.dispatch('addTeam', { name: 'Đội 1' });
  assert.equal(b.adoptSaved(), true);
  assert.equal(b.getEvent().teams.length, 1);
});
