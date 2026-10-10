// The host console's keyboard, focus and warnings (src/larp/host.js, app.js, uiState.js): Space and
// Enter left to a focused control (U09), the tablist keys, polite announcements of phase changes and
// save warnings, the display closing (and offline, why it can't be reopened), an unreadable save
// never written over, the lock's unsaved warning, the dialog's name, the reveal's pace and the
// finished event's Run tab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hostView,
  hostVm,
  isControl,
  keyAction,
  liveNews,
  renderHost,
  reporter,
  revealDue,
  screenCtx,
  shellActions,
  tabKey,
  unreadableFlash,
} from '../src/larp/host.js';
import { createApp } from '../src/larp/app.js';
import { TAB_IDS, createUiStore, defaultUi } from '../src/larp/uiState.js';
import { REVEAL_BANNER_MS } from '../src/larp/types.js';
import { atRound, eventWithTeams, fakeStorage, makeClock, makeIds } from './lib/larpFixtures.mjs';

const LINK = { active: true, takenOver: false, otherHost: 'none', display: 'notOpened', displayWebgl: null };

function makeApp() {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('h') });
  app.newEvent();
  return { app, clock };
}

/** @param {any} app @param {any} ui @param {number} now @param {any} [link] */
const ctxOf = (app, ui, now, link = LINK) => ({
  event: app.getEvent(),
  ui,
  now,
  lang: app.getEvent().config.hostLang,
  saveStatus: app.getSaveStatus(),
  link,
  projection: app.getProjection(now),
});

/** The shell's handlers over a real app, with a log of what they asked of the window. */
function shellFixture({ teams = 0 } = {}) {
  const clock = makeClock();
  const app = createApp({ storage: fakeStorage(), clock: clock.now, newId: makeIds('s') });
  app.newEvent();
  for (let i = 1; i <= teams; i++) app.dispatch('addTeam', { name: `Đội ${i}` });
  const ui = createUiStore();
  const log = [];
  const env = {
    now: clock.now,
    report: reporter(ui),
    confirm: (p) => ui.set({ confirm: p }),
    download: (name, text, type) => log.push(['download', name, type, text.length > 0]),
    openDisplay: () => log.push(['openDisplay']),
    focus: (sel) => log.push(['focus', sel]),
    post: (msg) => log.push(['post', msg.type]),
  };
  const shell = shellActions({
    app,
    ui,
    env,
    link: { takeOver: () => log.push(['takeOver']) },
    handlers: () => shell,
    openKeys: () => log.push(['keys']),
  });
  const run = (name, args = {}) => shell[name]({ el: null, event: null, value: undefined, ...args });
  return { app, ui, log, run };
}

test('Space and Enter belong to a focused button or checkbox, never to the timer', () => {
  const ui = defaultUi();
  const running = atRound(eventWithTeams(2), 0, 'performances', {
    currentTurn: 0,
    timer: { kind: 'turn', status: 'running', durationMs: 45000, deadline: 5, remainingMs: null },
  });
  const el = (tagName, attrs = {}) => ({
    tagName,
    getAttribute: (n) => attrs[n] ?? null,
    hasAttribute: (n) => n in attrs,
  });
  for (const target of [
    el('BUTTON'),
    el('INPUT', { type: 'checkbox' }),
    el('SELECT'),
    el('SUMMARY'),
    el('A', { href: '#x' }),
    el('DIV', { role: 'button' }),
    el('SPAN', { role: 'tab' }),
  ]) {
    assert.equal(isControl(target), true, target.tagName);
    assert.equal(keyAction({ key: ' ' }, { typing: false, control: true, ui, event: running }), null);
    assert.equal(keyAction({ key: 'Enter' }, { typing: false, control: true, ui, event: running }), null);
  }
  for (const target of [el('BODY'), el('MAIN'), el('A'), el('DIV', { role: 'region' }), null]) {
    assert.equal(isControl(target), false, target?.tagName ?? 'nothing');
  }
  assert.equal(keyAction({ key: ' ' }, { typing: false, control: false, ui, event: running }), 'timer.toggle');
  // Letters still work from a button (N on the focused next action moves on).
  assert.equal(keyAction({ key: 'n' }, { typing: false, control: true, ui, event: running }), 'next');
});

test('the tabs follow the tablist keys: arrows to the neighbour (wrapping), Home and End', () => {
  assert.equal(tabKey('ArrowRight', 'run'), 'roster');
  assert.equal(tabKey('ArrowRight', 'setup'), 'run');
  assert.equal(tabKey('ArrowLeft', 'run'), 'setup');
  assert.equal(tabKey('ArrowLeft', 'review'), 'roster');
  assert.equal(tabKey('Home', 'history'), 'run');
  assert.equal(tabKey('End', 'run'), 'setup');
  assert.equal(tabKey('Enter', 'run'), null);
  assert.equal(tabKey('ArrowRight', 'judge'), null);
  assert.equal(tabKey('ArrowRight', undefined), null);
  // Every tab is reachable from the one in the Tab order (keyboard-only setup, U09).
  const seen = new Set(['run']);
  for (let tab = 'run', i = 0; i < TAB_IDS.length; i++) seen.add((tab = tabKey('ArrowRight', tab)));
  assert.deepEqual([...seen].sort(), [...TAB_IDS].sort());
});

test('phase changes, save warnings and the display closing are announced, each once', () => {
  const vm = (phase, failed = false, display = 'open') => ({
    phase,
    save: { failed, text: failed ? 'Not Saved' : 'Saved', warning: failed ? 'Not saved: this browser refused.' : '' },
    display: { state: display, label: display === 'closed' ? 'Display Closed' : 'Display Open' },
  });
  let r = liveNews(null, vm('Setup'));
  assert.equal(r.text, '', 'the first render says nothing');
  r = liveNews(r.state, vm('Setup'));
  assert.equal(r.text, '', 'nothing changed: nothing said (no "Saved" after every command)');
  r = liveNews(r.state, vm('Welcome'));
  assert.equal(r.text, 'Welcome');
  r = liveNews(r.state, vm('Welcome', true));
  assert.equal(r.text, 'Not saved: this browser refused.');
  r = liveNews(r.state, vm('Welcome', true));
  assert.equal(r.text, '');
  r = liveNews(r.state, vm('Round 1 · Faith Discovery · Briefing', true, 'closed'));
  assert.equal(r.text, 'Round 1 · Faith Discovery · Briefing. Display Closed');
  r = liveNews(r.state, vm('Round 1 · Faith Discovery · Briefing', false, 'closed'));
  assert.equal(r.text, 'Saved');
});

test('the display closing warns in the top bar; offline it says reopening needs the network', () => {
  const { app } = makeApp();
  const closed = { ...LINK, display: 'closed' };
  let vm = hostVm(ctxOf(app, defaultUi(), 1, closed));
  assert.equal(vm.display.warn, true);
  let html = renderHost(vm, '');
  assert.match(
    html,
    /larp-display-state is-closed" data-tip="The display was closed\.[^"]*"><span class="larp-warn-glyph" aria-hidden="true">⚠<\/span> Display Closed/,
  );
  assert.doesNotMatch(html, /needs the network/);
  vm = hostVm({ ...ctxOf(app, defaultUi(), 1, closed), online: false });
  html = renderHost(vm, '');
  assert.match(html, /Reopening the display needs the network\./);
  const open = renderHost(hostVm({ ...ctxOf(app, defaultUi(), 1, { ...LINK, display: 'open' }), online: false }), '');
  assert.doesNotMatch(open, /larp-warn-glyph|needs the network/, 'the healthy state stays quiet');
});

test('an unreadable save: the flash says why, in the host language, and offers its download', () => {
  const f = shellFixture();
  const flash = unreadableFlash('newer_version', { saving: true });
  assert.deepEqual(flash, {
    kind: 'error',
    key: 'hint.unreadableKept',
    vars: { why: 'hint.unreadable.newer_version' },
    actionKey: 'action.downloadUnreadable',
    action: 'unreadable.download',
  });
  assert.equal(unreadableFlash('weird', { saving: false }).key, 'hint.unreadableHeld');
  assert.equal(unreadableFlash('weird', { saving: false }).vars.why, 'hint.unreadable.bad_json');
  f.ui.set({ flash });
  const html = renderHost(hostVm(ctxOf(f.app, f.ui.get(), 1)), '');
  assert.match(
    html,
    /role="alert"><span>The saved event was written by a newer version and can&#39;t be read here\. It was kept aside, untouched; this is a new event\.<\/span>/,
  );
  assert.match(html, /data-action="unreadable\.download"[^>]*><span class="larp-btn-label">Download Unreadable Save</);
  f.run('unreadable.download');
  assert.equal(f.ui.get().flash, null, 'nothing to download without one: it just closes');
  const app = { ...f.app, unreadableText: () => '{"schemaVersion":99}' };
  const shell = shellActions({
    app,
    ui: f.ui,
    env: { now: () => 0, download: (...a) => f.log.push(['dl', ...a]) },
    link: {},
    handlers: () => ({}),
    openKeys: () => {},
  });
  shell['unreadable.download']({ el: null, event: null, value: undefined });
  assert.deepEqual(f.log.at(-1), [
    'dl',
    'nghia-si-campfire-unreadable-save-1970-01-01.json',
    '{"schemaVersion":99}',
    'application/json',
  ]);
});

test('a window taken over while its saves were refused warns, with Export Backup on the lock', () => {
  const app = createApp({ storage: null, clock: () => 5, newId: makeIds('l') });
  app.newEvent();
  const html = renderHost(hostVm(ctxOf(app, defaultUi(), 5, { ...LINK, active: false, takenOver: true })), '');
  assert.match(html, /This tab has changes that were never saved\. Export a backup before closing it\./);
  assert.match(html, /data-action="exportBackup"/);
});

test('the confirmation dialog is named by its action', () => {
  const { app } = makeApp();
  const ui = {
    ...defaultUi(),
    confirm: { action: 'next', hintKey: 'hint.confirmPublish', labelKey: 'action.publishReveal' },
  };
  assert.match(
    renderHost(hostVm(ctxOf(app, ui, 1)), ''),
    /role="alertdialog" aria-modal="true" aria-label="Publish And Reveal"/,
  );
});

test('the reveal advances at its pace: a short one a banner every 3 s', () => {
  const base = atRound(eventWithTeams(1), 0, 'reveal');
  const reveal = { roundId: base.rounds[0].id, step: 0, total: 3, paused: false, stepStartedAt: 0 };
  // eventWithTeams has no published awards: one banner each (3 s), as revealDwell says.
  assert.equal(revealDue({ ...base, reveal }, REVEAL_BANNER_MS - 1), false);
  assert.equal(revealDue({ ...base, reveal }, REVEAL_BANNER_MS), true);
});

test('the finished event: the Run tab shows the final standings, the full ranking and the files', () => {
  const f = shellFixture({ teams: 2 });
  const event = f.app.getEvent();
  f.app.dispatch('addMember', { name: 'Mai', teamId: event.teams[0].id });
  for (const type of ['startEvent', 'endEvent']) assert.equal(f.app.dispatch(type).error, null, type);
  const ctx = screenCtx(f.app, f.ui, LINK, 1);
  const { screen, html } = hostView(ctx);
  assert.equal(screen.id, 'run');
  assert.doesNotMatch(html, /Once a round starts/);
  assert.match(html, /The event is finished\./);
  assert.match(html, /Team Standings/);
  assert.match(html, /Individual Ranking/);
  assert.match(html, />Mai</);
  for (const action of ['finished.exportResults', 'exportBackup', 'finished.delete']) {
    assert.match(html, new RegExp(`data-action="${action.replace('.', '\\.')}"`));
  }
  assert.equal((html.match(/larp-btn-primary/g) ?? []).length, 1, 'still one primary: Export Results (U04)');
  const log = [];
  const handlers = screen.actions(f.app, f.ui, {
    now: () => 0,
    download: (name, text, type) => log.push([name, type, text.length > 0]),
    confirm: (p) => log.push(['confirm', p.action]),
  });
  handlers['finished.exportResults']({});
  handlers['finished.delete']({});
  assert.deepEqual(log, [
    ['nghia-si-campfire-results-1970-01-01.csv', 'text/csv', true],
    ['confirm', 'finished.delete'],
  ]);
  handlers['finished.delete']({ confirmed: true });
  assert.equal(f.app.getEvent().phase, 'setup', 'deleted: a fresh event');
  assert.equal(f.ui.get().flash.key, 'hint.deleted');
});
