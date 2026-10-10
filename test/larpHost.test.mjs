// The host console's frame (src/larp/host.js): exactly one primary next action in every phase,
// labelled with what it does, and dispatching it walks a whole event from Setup to the end (U04);
// Publish is blocked with its reason until every team has a status (A12) and asks first; the keys
// stay quiet while typing and never publish; the reveal advances on its own short of the
// standings; the top bar shows the Saved warning with Export Backup (U06), the display window's
// state and the second window's lock (A25). Plus the placeholder screens every agent builds on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NEXT_GUARD_MS,
  TABS,
  actorOf,
  fileName,
  hostKeys,
  hostVm,
  keyAction,
  nextAction,
  phaseLine,
  renderHost,
  reporter,
  resumeFlash,
  revealDue,
  roundTitle,
  screenCtx,
  hostView,
  shellActions,
  skipVm,
  tickKey,
  timerToggle,
} from '../src/larp/host.js';
import { createApp } from '../src/larp/app.js';
import { TAB_IDS, createUiStore, defaultUi } from '../src/larp/uiState.js';
import { HOST_GM_ID, REVEAL_BANNER_MS } from '../src/larp/types.js';
import { judgeScreen } from '../src/larp/judge.js';
import { displayVm, renderDisplay } from '../src/larp/display.js';
import { applyCue, cuesFor } from '../src/larp/stage.js';
import { newId, route, storage } from '../src/larp/browser.js';
import { atRound, eventWithTeams, fakeStorage, makeClock, makeIds } from './lib/larpFixtures.mjs';

/** An app holding `event` (as a resumed one would). */
function createAppWith(event) {
  const app = createApp({ storage: fakeStorage(), clock: () => 1, newId: makeIds('w') });
  app.replaceEvent(event);
  return app;
}

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

test('the next action walks a whole event, one labelled step at a time (U04)', () => {
  const { app, clock } = makeApp();
  const seen = [];
  const step = () => {
    const next = nextAction(app.getEvent());
    seen.push(next.label);
    assert.equal(next.blocked, undefined, `${next.id} is blocked: ${JSON.stringify(next.blocked)}`);
    if (next.command) assert.equal(app.dispatch(next.command.type, next.command.payload).error, null, next.label);
    clock.advance(1000);
    return next;
  };
  const first = nextAction(app.getEvent());
  assert.deepEqual(
    { id: first.id, label: first.label, blocked: first.blocked },
    { id: 'startEvent', label: 'Start Event', blocked: { key: 'error.no_teams' } },
  );
  for (const name of ['Đội Phaolô', 'Đội Giuse']) app.dispatch('addTeam', { name });
  step(); // Start Event
  for (let r = 0; r < 5; r++) {
    assert.ok(['startRound', 'startNextRound'].includes(step().id));
    assert.equal(step().id, 'startPreparation');
    assert.equal(step().id, 'startPerformances');
    const queue = app.getEvent().rounds[app.getEvent().roundIndex].order;
    for (const teamId of queue) {
      const next = step();
      assert.equal(next.id, 'nextTeam');
      assert.equal(next.label, `Next Team: ${app.getEvent().teams.find((t) => t.id === teamId).name}`);
    }
    assert.equal(step().id, 'reviewRound');
    const blocked = nextAction(app.getEvent());
    assert.equal(blocked.id, 'publish');
    assert.equal(blocked.label, `Publish And Reveal Round ${r + 1}`);
    assert.deepEqual(blocked.blocked, { key: 'hint.needStatusMany', vars: { n: 2 } });
    assert.deepEqual(blocked.confirm, { hintKey: 'hint.confirmPublish', labelKey: 'action.publishReveal' });
    app.dispatch('setStatus', { teamId: queue[0], status: 'complete' });
    assert.deepEqual(nextAction(app.getEvent()).blocked, { key: 'hint.needStatusOne', vars: { n: 1 } });
    app.dispatch('setStatus', { teamId: queue[1], status: 'passed' });
    assert.equal(step().id, 'publish');
    let guard = 0;
    while (nextAction(app.getEvent()).id === 'nextBanner' && guard++ < 50) step();
    assert.equal(step().id, 'showResults');
    assert.equal(app.getEvent().roundPhase, 'results');
  }
  const end = nextAction(app.getEvent());
  assert.equal(end.id, 'endEvent');
  assert.ok(end.confirm);
  step();
  assert.equal(app.getEvent().phase, 'finished');
  const last = nextAction(app.getEvent());
  assert.deepEqual(
    { id: last.id, command: last.command, ui: last.ui, label: last.label },
    { id: 'exportResults', command: null, ui: 'exportResults', label: 'Export Results' },
  );
  assert.ok(seen.includes('Start Round 1') && seen.includes('Start Next Round'));
});

test('next-action edge cases: Vietnamese labels, every round skipped, a reveal with no position', () => {
  const event = atRound(eventWithTeams(2), 0, 'briefing');
  assert.equal(nextAction(event, 'vi').label, 'Bắt Đầu Chuẩn Bị');
  const welcome = { ...event, roundIndex: -1, roundPhase: null };
  assert.equal(nextAction(welcome).detail, 'Round 1 · Faith Discovery');
  const allSkipped = { ...welcome, rounds: welcome.rounds.map((r) => ({ ...r, skipped: true })) };
  assert.equal(nextAction(allSkipped).id, 'endEvent');
  assert.equal(nextAction({ ...event, roundPhase: 'reveal', reveal: null }).command.type, 'revealSkip');
  const performing = atRound(eventWithTeams(2), 1, 'performances', { currentTurn: -1 });
  const ghost = { ...performing, teams: [] };
  assert.equal(nextAction(ghost).label, 'Next Team');
  const published = { ...atRound(eventWithTeams(1), 0, 'review', { statuses: { 'team-1': 'complete' } }) };
  const withResult = { ...published, results: [/** @type {any} */ ({ roundId: published.rounds[0].id })] };
  assert.deepEqual(nextAction(withResult).blocked, { key: 'error.already_published' });
  assert.equal(roundTitle(event, 9, 'en'), '');
});

test('the reveal advances on its own every banner, holds when paused, and moves on to Results at its standings', () => {
  const base = atRound(eventWithTeams(1), 0, 'reveal');
  const reveal = { roundId: base.rounds[0].id, step: 0, total: 3, paused: false, stepStartedAt: 1000 };
  const e = { ...base, reveal };
  assert.equal(revealDue(e, 1000 + REVEAL_BANNER_MS - 1), false);
  assert.equal(revealDue(e, 1000 + REVEAL_BANNER_MS), true);
  assert.equal(revealDue({ ...e, reveal: { ...reveal, paused: true } }, 1e9), false);
  // The standings are the round's Results: the console moves there at once (its next action is
  // then Start Next Round, and the reveal's controls go), paused or not.
  assert.equal(revealDue({ ...e, reveal: { ...reveal, step: 2 } }, 1000), true, 'the standings are Results');
  assert.equal(revealDue({ ...e, reveal: { ...reveal, step: 2, paused: true } }, 1000), true);
  assert.equal(revealDue({ ...e, roundPhase: 'results' }, 1e9), false);
  assert.equal(revealDue({ ...e, reveal: null }, 1e9), false);
});

test('keys: quiet while typing, in Judge Mode, behind the lock or with a modifier; none publishes', () => {
  const ui = defaultUi();
  const running = atRound(eventWithTeams(2), 0, 'performances', {
    currentTurn: 0,
    timer: { kind: 'turn', status: 'running', durationMs: 45000, deadline: 5, remainingMs: null },
  });
  const k = (key, o = {}) => keyAction({ key, ...o.mods }, { typing: false, ui, event: running, ...o });
  assert.equal(k(' '), 'timer.toggle');
  assert.equal(k('t'), 'timer.add30');
  assert.equal(k('N'), 'next');
  assert.equal(k('a'), 'focus.award');
  assert.equal(k('J'), 'judge.open');
  assert.equal(k('?'), 'keys');
  assert.equal(k('p'), null);
  assert.equal(k('n', { typing: true }), null);
  assert.equal(k('n', { mods: { ctrlKey: true } }), null);
  assert.equal(k('n', { locked: true }), null);
  assert.equal(k('n', { ui: { ...ui, judge: { open: true, gmId: 'g', lastGmId: null } } }), null);
  assert.equal(k('n', { event: null }), null);
  const review = atRound(eventWithTeams(2), 0, 'review');
  for (const key of ['n', 'p', 'Enter', ' '])
    assert.equal(keyAction({ key }, { typing: false, ui, event: review }), null, key);
  const setup = eventWithTeams(1);
  assert.equal(keyAction({ key: ' ' }, { typing: false, ui, event: setup }), null);
  const confirming = { ...ui, confirm: { action: 'next', hintKey: 'h', labelKey: 'l' } };
  assert.equal(keyAction({ key: 'Escape' }, { typing: true, ui: confirming, event: running }), 'confirm.no');
  assert.equal(keyAction({ key: 'n' }, { typing: false, ui: confirming, event: running }), null);
  assert.equal(hostKeys('en').flatMap((g) => g.keys).length, 6);
  assert.equal(hostKeys('vi')[0].title, 'Điều Khiển');
});

test('Space pauses, resumes or starts the phase timer', () => {
  const e = atRound(eventWithTeams(1), 0, 'preparation');
  const timer = (status) => ({
    ...e,
    timer: { kind: 'preparation', status, durationMs: 1, deadline: null, remainingMs: 1 },
  });
  assert.equal(timerToggle(timer('running')), 'pauseTimer');
  assert.equal(timerToggle(timer('paused')), 'resumeTimer');
  assert.equal(timerToggle(timer('idle')), 'startTimer');
  assert.equal(timerToggle(e), null);
});

test('commands come from the host, or from the co-GM in Judge Mode', () => {
  const ui = defaultUi();
  assert.deepEqual(actorOf(ui), { mode: 'host', actorId: HOST_GM_ID });
  assert.deepEqual(actorOf({ ...ui, judge: { open: true, gmId: null, lastGmId: null } }), {
    mode: 'host',
    actorId: HOST_GM_ID,
  });
  assert.deepEqual(actorOf({ ...ui, judge: { open: true, gmId: 'gm-2', lastGmId: null } }), {
    mode: 'judge',
    actorId: 'gm-2',
  });
});

test('the frame: phase, clock, Saved, the display state, one primary button, the tabs', () => {
  const { app, clock } = makeApp();
  const ui = defaultUi();
  let vm = hostVm(ctxOf(app, ui, clock.now()));
  assert.equal(vm.phase, 'Setup');
  assert.equal(vm.flame, 'gilded');
  assert.equal(vm.save.text, 'Saved');
  assert.equal(vm.display.canOpen, true);
  assert.deepEqual(
    vm.tabs.map((x) => x.id),
    [...TAB_IDS],
  );
  let html = renderHost(vm, '<p>body</p>');
  assert.equal((html.match(/larp-btn-primary/g) ?? []).length, 1, 'exactly one primary button (U04)');
  assert.match(html, /data-action="next"[^>]*aria-disabled="true"/);
  assert.match(html, /larp-next-why" role="status">Add at least one team to start\.</);
  assert.match(html, /Open Display Window/);
  assert.match(html, /Display Not Opened/);
  assert.match(html, /role="tab"[^>]*data-value="run" aria-selected="true"/);
  assert.match(html, /<p>body<\/p>/);
  assert.match(html, /data-clock="elapsed">0:00/);

  app.dispatch('addTeam', { name: 'Đội Phaolô' });
  app.dispatch('startEvent');
  app.dispatch('nextRound');
  clock.advance(61_000);
  const link = { ...LINK, display: 'open', displayWebgl: false };
  vm = hostVm(ctxOf(app, { ...ui, tab: 'setup', preview: true }, clock.now(), link));
  assert.equal(vm.phase, 'Round 1 · Faith Discovery · Briefing');
  assert.equal(vm.flame, 'ember');
  assert.equal(vm.display.canOpen, false);
  html = renderHost(vm, '');
  assert.match(html, /Display Open/);
  assert.match(html, /Display Without WebGL/);
  assert.doesNotMatch(html, /Open Display Window/);
  assert.match(html, /data-since="\d+">1:01</);
  assert.match(html, /aria-selected="true"[^>]*>Setup</);
  assert.match(html, /class="larp-preview"/);
  assert.match(html, /Hide Preview/);
  assert.equal((html.match(/larp-btn-primary/g) ?? []).length, 1);
});

test('storage refused: a clear warning with Export Backup right there (U06)', () => {
  const app = createApp({ storage: null, clock: () => 5, newId: makeIds('s') });
  app.newEvent();
  const vm = hostVm(ctxOf(app, defaultUi(), 5));
  assert.equal(vm.save.failed, true);
  const html = renderHost(vm, '');
  assert.match(html, /larp-saved is-failed" data-tip="This browser refused to save\./);
  assert.match(html, /Not Saved/);
  // The banner: why, that play goes on, and what to do, beside Export Backup.
  assert.match(
    html,
    /class="larp-save-warning"><p>Not saved: this browser refused storage \(private browsing, or full\)\. Play continues; export a backup before closing the tab\.<\/p>/,
  );
  assert.match(html, /data-action="exportBackup"/);
  assert.doesNotMatch(html, /larp-saved[^>]*role="status"/, 'the live region is the persistent one hostDom keeps');
  const idle = createApp({ storage: fakeStorage(), clock: () => 5, newId: makeIds('i') });
  idle.replaceEvent(eventWithTeams(1));
  const loaded = hostVm({ ...ctxOf(idle, defaultUi(), 5), saveStatus: { state: 'idle' } }).save;
  assert.deepEqual([loaded.show, loaded.text], [true, 'Saved'], 'idle: the event shown came from the save');
});

test('an over-long schedule shows its overrun beside the event clock', () => {
  const app = createApp({ storage: fakeStorage(), clock: () => 5, newId: makeIds('o') });
  app.replaceEvent(eventWithTeams(6));
  assert.equal(hostVm(ctxOf(app, defaultUi(), 5)).clock.over, 'Est. +12:00');
  app.replaceEvent(eventWithTeams(4));
  assert.equal(hostVm(ctxOf(app, defaultUi(), 5)).clock.over, '');
});

test('the confirmation dialog, the flash and Judge Mode taking the window', () => {
  const { app, clock } = makeApp();
  const ui = {
    ...defaultUi(),
    confirm: { action: 'next', hintKey: 'hint.confirmPublish', labelKey: 'action.publishReveal' },
    flash: { kind: 'error', key: 'error.no_teams' },
  };
  const vm = hostVm(ctxOf(app, ui, clock.now()));
  const html = renderHost(vm, '');
  assert.match(html, /role="alertdialog" aria-modal="true"/);
  assert.match(html, /Publish this round\?/);
  assert.match(html, /data-action="confirm\.yes"[^>]*>.*Publish And Reveal/);
  assert.match(html, /data-action="confirm\.no"/);
  assert.match(html, /larp-flash-error" role="alert"><span>Add at least one team to start\./);
  const info = renderHost(
    hostVm(
      ctxOf(
        app,
        {
          ...defaultUi(),
          flash: { kind: 'info', key: 'hint.resume', vars: { round: 'Round 3', phase: 'Performances' } },
        },
        1,
      ),
    ),
    '',
  );
  assert.match(info, /role="status"><span>Resume the event: Round 3, Performances</);
  const judge = renderHost(vm, '<section>judge</section>', { judge: true });
  assert.doesNotMatch(judge, /larp-topbar|role="tab"/, 'Judge Mode hides timers, phases and tabs');
  assert.match(judge, /<section>judge<\/section>/);
});

test('a second host window sees only the lock and Take Over (A25)', () => {
  const { app } = makeApp();
  for (const [link, text] of [
    [{ ...LINK, active: false, otherHost: 'active' }, 'already open in another tab'],
    [{ ...LINK, active: false, otherHost: 'gone' }, 'has closed'],
    [{ ...LINK, active: false, takenOver: true, otherHost: 'active' }, 'took over'],
  ]) {
    const html = renderHost(hostVm(ctxOf(app, defaultUi(), 1, link)), '<p>never</p>');
    assert.match(html, new RegExp(text));
    assert.match(html, /data-action="takeOver"/);
    assert.doesNotMatch(html, /never|data-action="next"/);
  }
});

test('the tick re-renders only when time alone changed what is shown', () => {
  const e = atRound(eventWithTeams(1), 0, 'preparation', {
    timer: { kind: 'preparation', status: 'running', durationMs: 1000, deadline: 2000, remainingMs: null },
  });
  assert.notEqual(tickKey(e, LINK, 1999), tickKey(e, LINK, 2000), 'the timer ran out');
  assert.equal(tickKey(e, LINK, 2000), tickKey(e, LINK, 9000));
  assert.notEqual(tickKey(e, LINK, 1), tickKey(e, { ...LINK, display: 'closed' }, 1));
  assert.equal(tickKey(null, LINK, 1), 'false|notOpened|none|');
});

test('dispatch results feed the flash; files are named by day', () => {
  const ui = createUiStore();
  const report = reporter(ui);
  assert.equal(report({ ok: false, error: { code: 'wrong_phase', message: '' }, duplicate: false, events: [] }), false);
  assert.deepEqual(ui.get().flash, { kind: 'error', key: 'error.wrong_phase' });
  assert.equal(report({ ok: true, error: null, duplicate: false, events: [] }), true);
  assert.equal(ui.get().flash, null);
  ui.set({ flash: { kind: 'info', key: 'hint.offline' } });
  report({ ok: true, error: null, duplicate: false, events: [] });
  assert.equal(ui.get().flash.kind, 'info', 'information stays');
  const day = Date.UTC(2026, 9, 10, 18);
  assert.equal(fileName('backup', day), 'nghia-si-campfire-backup-2026-10-10.json');
  assert.equal(fileName('results', day), 'nghia-si-campfire-results-2026-10-10.csv');
  assert.ok(NEXT_GUARD_MS >= 300);
  assert.equal(phaseLine({ ...eventWithTeams(1), phase: 'finished' }, 'en'), 'Finished');
  assert.equal(phaseLine({ ...eventWithTeams(1), phase: 'running' }, 'vi'), 'Chào Mừng');
});

test('every screen follows the interface: vm(ctx) and render(vm) pure, actions a handler map', () => {
  const { app, clock } = makeApp();
  const ui = createUiStore();
  const env = {
    now: clock.now,
    report: () => true,
    confirm() {},
    download() {},
    openDisplay() {},
    focus() {},
    post() {},
  };
  for (const screen of [...TABS, judgeScreen]) {
    assert.equal(typeof screen.id, 'string');
    assert.match(screen.labelKey, /^(tab|action)\./);
    const html = screen.render(screen.vm(ctxOf(app, ui.get(), clock.now())));
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 0, screen.id);
    const handlers = screen.actions(app, ui, env);
    for (const [name, fn] of Object.entries(handlers)) {
      assert.equal(typeof fn, 'function');
      assert.match(name, /^[a-z]+\.[A-Za-z]+$/, `${screen.id}: handler names are namespaced (${name})`);
    }
  }
  ui.set({ judge: { open: true, gmId: 'gm-1', lastGmId: null } });
  judgeScreen.actions(app, ui, env)['judge.done']({ el: null, event: null, value: undefined });
  assert.deepEqual(ui.get().judge, { open: false, gmId: null, lastGmId: 'gm-1' });
});

test('the display renders the projection it is sent, and the stage plays only cues a scene has', () => {
  const { app, clock } = makeApp();
  const waiting = renderDisplay(displayVm(null, { now: 1 }));
  assert.match(waiting, /Lửa Trại Nghĩa Sĩ/);
  app.dispatch('addTeam', { name: 'Đội 1' });
  app.dispatch('startEvent');
  app.dispatch('nextRound');
  const vm = displayVm(app.getProjection(clock.now()), { now: clock.now(), hostClosed: true });
  const html = renderDisplay(vm);
  assert.match(html, /Vòng 1 · Khám Phá Đức Tin/);
  assert.match(html, /Round 1 · Faith Discovery/);
  assert.match(html, /Cửa Sổ Quản Trò Đã Đóng · Host Window Closed/);
  assert.deepEqual(cuesFor(null, null, []), []);
  const calls = [];
  const scene = {
    ring: (...a) => calls.push(a),
    flash() {
      throw new Error('x');
    },
  };
  assert.equal(applyCue(scene, { method: 'ring', args: [1] }), true);
  assert.equal(applyCue(scene, { method: 'ring' }), true);
  assert.deepEqual(calls, [[1], []]);
  assert.equal(applyCue(scene, { method: 'flash' }), false);
  assert.equal(applyCue(scene, { method: 'pulse' }), false);
  assert.equal(applyCue(null, { method: 'ring' }), false);
});

test('the browser adapters: the route, readable unique ids, storage that may be refused', () => {
  assert.equal(route('#/display'), 'display');
  assert.equal(route('#/display?x=1'), 'display');
  assert.equal(route('#/host'), 'host');
  assert.equal(route(''), 'host');
  assert.equal(route('#/displays'), 'host');
  assert.equal(route(undefined), 'host');
  const a = newId('team');
  assert.match(a, /^team-[0-9a-f-]{36}$/);
  assert.notEqual(newId('team'), a);
  assert.match(newId(), /^id-/);
  assert.equal(storage('localStorage'), null, 'no window in Node: refused, not thrown');
});

/** The shell's handlers over a real app and UI store, with a recording env. */
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
  const link = { takeOver: () => log.push(['takeOver']) };
  let all = {};
  const shell = shellActions({
    app,
    ui,
    env,
    link,
    handlers: () => all,
    render: () => log.push(['render']),
    openKeys: () => log.push(['keys']),
  });
  all = { ...shell };
  const run = (name, args = {}) => all[name]({ el: null, event: null, value: undefined, ...args });
  return { app, ui, log, shell, run, clock, setHandlers: (h) => (all = { ...shell, ...h }) };
}

test('the shell: the next action dispatches once per click, asks first when it must, and says why not', () => {
  const f = shellFixture();
  f.run('next');
  assert.equal(f.app.getEvent().phase, 'setup', 'blocked with no teams: nothing happens');
  f.app.dispatch('addTeam', { name: 'Đội 1' });
  const el = { dataset: { revision: String(f.app.getEvent().revision) } };
  f.run('next', { el });
  assert.equal(f.app.getEvent().phase, 'running');
  const revision = f.app.getEvent().revision;
  f.run('next', { el });
  assert.equal(f.app.getEvent().revision, revision, 'a double-click on the same button applies once');
  f.clock.advance(NEXT_GUARD_MS - 1);
  f.run('next');
  assert.equal(f.app.getEvent().revision, revision, 'and the guard holds just after');
  f.clock.advance(1);
  f.run('next');
  assert.equal(f.app.getEvent().roundPhase, 'briefing');
  // Play to Results of the last round, then End Event asks first.
  const app = f.app;
  for (let guard = 0; guard < 200 && nextAction(app.getEvent()).id !== 'endEvent'; guard++) {
    const next = nextAction(app.getEvent());
    if (next.id === 'publish') {
      for (const teamId of app.getEvent().rounds[app.getEvent().roundIndex].order)
        app.dispatch('setStatus', { teamId, status: 'complete' });
      f.run('next');
      assert.equal(f.ui.get().confirm.action, 'next', 'Publish asks first');
      f.clock.advance(NEXT_GUARD_MS);
      f.run('confirm.yes');
      assert.equal(app.getEvent().roundPhase, 'reveal');
    } else f.run('next');
    f.clock.advance(NEXT_GUARD_MS);
  }
  f.run('next');
  assert.equal(f.ui.get().confirm.hintKey, 'hint.confirmEnd');
  f.run('confirm.no');
  assert.equal(f.ui.get().confirm, null);
  assert.equal(app.getEvent().phase, 'running');
  f.run('next');
  f.run('confirm.yes');
  assert.equal(app.getEvent().phase, 'finished');
  f.clock.advance(NEXT_GUARD_MS);
  f.run('next');
  assert.deepEqual(f.log.at(-1), ['download', 'nghia-si-campfire-results-2026-10-10.csv', 'text/csv', true]);
  f.run('confirm.yes');
  assert.equal(f.ui.get().confirm, null, 'nothing pending: nothing runs');
});

test('the shell: tabs, sign toggles, preview, Judge Mode, files, takeover, timers, focus and keys', () => {
  const f = shellFixture({ teams: 2 });
  f.run('tab', { value: 'review' });
  assert.equal(f.ui.get().tab, 'review');
  f.run('tab', { value: 'admin' });
  assert.equal(f.ui.get().tab, 'review', 'only real tabs');
  f.ui.setDraft('award', 'points', '25');
  f.run('sign', { el: { dataset: { draftTarget: 'award.points' } }, value: '-' });
  assert.equal(f.ui.draft('award').points, '−25');
  f.run('sign', { el: { dataset: { draftTarget: 'award.points' } }, value: '+' });
  assert.equal(f.ui.draft('award').points, '25');
  f.run('sign', { el: { dataset: { draftTarget: 'bad' } }, value: '-' });
  f.run('sign', { el: { dataset: { draftTarget: 'new.points' } } });
  assert.equal(f.ui.draft('new').points, '');
  f.run('preview');
  assert.equal(f.ui.get().preview, true);
  f.run('judge.open');
  assert.deepEqual(f.ui.get().judge, { open: true, gmId: null, lastGmId: null });
  f.ui.set({ flash: { kind: 'info', key: 'hint.offline' } });
  f.run('flash.dismiss');
  assert.equal(f.ui.get().flash, null);
  f.run('openDisplay');
  f.run('exportBackup');
  f.run('takeOver');
  f.run('keys');
  f.run('focus.award');
  assert.equal(f.ui.get().tab, 'run');
  assert.deepEqual(f.log.slice(0, 4), [
    ['focus', '[data-focus="judge-last"], .larp-judge-gm, [data-focus="judge-done"]'],
    ['openDisplay'],
    ['download', 'nghia-si-campfire-backup-2026-10-10.json', 'application/json', true],
    ['takeOver'],
  ]);
  assert.deepEqual(f.log.slice(4), [['keys'], ['focus', '[data-focus="add-award"]']]);
  // Timers: Space and T in a phase with a timer; outside one, an error flash.
  f.run('timer.add30');
  assert.equal(f.ui.get().flash.key, 'error.wrong_phase');
  f.run('timer.toggle');
  for (const type of ['startEvent', 'nextRound', 'startPreparation']) f.app.dispatch(type);
  f.run('timer.toggle');
  assert.equal(f.app.getEvent().timer.status, 'paused');
  f.run('timer.toggle');
  assert.equal(f.app.getEvent().timer.status, 'running');
  const before = f.app.getEvent().timer.deadline;
  f.run('timer.add30');
  assert.equal(f.app.getEvent().timer.deadline, before + 30_000);
  // The confirmation runs the asking handler again, confirmed, with its value.
  const calls = [];
  f.setHandlers({ 'setup.delete': (a) => calls.push([a.value, a.confirmed]) });
  f.ui.set({
    confirm: { action: 'setup.delete', value: 'x', hintKey: 'hint.confirmDelete', labelKey: 'action.deleteEventData' },
  });
  f.run('confirm.yes');
  assert.deepEqual(calls, [['x', true]]);
});

test('screenCtx and hostView put the window together: the tab, Judge Mode, or the lock', () => {
  const { app } = makeApp();
  const ui = createUiStore();
  assert.equal(screenCtx(createApp({ storage: null, clock: () => 1, newId: makeIds('n') }), ui, LINK, 1), null);
  let ctx = screenCtx(app, ui, LINK, 7);
  assert.equal(ctx.now, 7);
  assert.equal(ctx.projection, null, 'the projection only for the preview');
  assert.equal(hostView(ctx).screen.id, 'run');
  ui.set({ preview: true, tab: 'history' });
  ctx = screenCtx(app, ui, LINK, 7);
  assert.equal(ctx.projection.now, 7);
  assert.equal(hostView(ctx).screen.id, 'history');
  assert.match(hostView(ctx).html, /larp-tab-body" id="larp-tab-history"/);
  ui.set({ judge: { open: true, gmId: null, lastGmId: null } });
  const judge = hostView(screenCtx(app, ui, LINK, 7));
  assert.equal(judge.screen.id, 'judge');
  assert.doesNotMatch(judge.html, /larp-topbar/);
  const locked = hostView(screenCtx(app, ui, { ...LINK, active: false, otherHost: 'active' }, 7));
  assert.equal(locked.screen, null);
  assert.match(locked.html, /larp-lock/);
});

test('exactly one primary button on every tab in every phase of a whole event (U04)', () => {
  const { app, clock } = makeApp();
  for (const name of ['Đội Phaolô', 'Đội Giuse']) app.dispatch('addTeam', { name });
  app.dispatch('addMembers', { teamId: app.getEvent().teams[0].id, names: ['Mai'] });
  const ui = createUiStore();
  const seen = new Set();
  for (let guard = 0; guard < 200; guard++) {
    const event = app.getEvent();
    for (const tab of TAB_IDS) {
      ui.set({ tab });
      const { html } = hostView(screenCtx(app, ui, LINK, clock.now()));
      const n = (html.match(/larp-btn-primary/g) ?? []).length;
      assert.equal(n, 1, `${tab} in ${event.phase}/${event.roundPhase}: ${n} primary buttons`);
    }
    seen.add(`${event.phase}/${event.roundPhase}`);
    const next = nextAction(event);
    if (!next.command) break;
    if (next.id === 'nextTeam' && event.currentTurn === 0)
      app.dispatch('addAward', {
        recipientType: 'team',
        recipientIds: [event.teams[0].id],
        name: 'Sáng Tạo',
        points: 50,
      });
    if (next.id === 'publish')
      for (const teamId of event.rounds[event.roundIndex].order)
        app.dispatch('setStatus', { teamId, status: 'complete' });
    app.dispatch(next.command.type, next.command.payload);
    clock.advance(1000);
  }
  for (const phase of ['setup/null', 'running/briefing', 'running/performances', 'running/review', 'running/reveal'])
    assert.ok(seen.has(phase), phase);
  assert.ok(seen.has('finished/null'));
});

test('Skip Round: offered Briefing to Review, asks first only when the round has drafts', () => {
  const f = shellFixture({ teams: 2 });
  assert.equal(skipVm(f.app.getEvent(), 'en'), null, 'not in Setup');
  for (const type of ['startEvent', 'nextRound']) f.app.dispatch(type);
  const round = f.app.getEvent().rounds[0];
  assert.deepEqual(skipVm(f.app.getEvent(), 'en'), {
    roundId: round.id,
    label: 'Skip Round',
    hint: 'Skip this round: it counts zero and has no reveal.',
    drafts: 0,
  });
  let html = renderHost(hostVm(ctxOf(f.app, f.ui.get(), 1)), '');
  assert.match(html, /data-action="skipRound"[^>]*data-value="round-/);
  for (const type of ['startPreparation', 'endPreparation', 'nextTeam']) f.app.dispatch(type);
  f.app.dispatch('addAward', {
    recipientType: 'team',
    recipientIds: [f.app.getEvent().teams[0].id],
    name: 'X',
    points: 5,
  });
  f.run('skipRound', { value: 'round-other' });
  assert.equal(f.ui.get().confirm, null, 'a stale button does nothing');
  f.run('skipRound', { value: round.id });
  assert.deepEqual(f.ui.get().confirm, {
    action: 'skipRound',
    value: round.id,
    hintKey: 'hint.confirmSkip',
    labelKey: 'action.skipRound',
  });
  f.run('confirm.yes');
  assert.equal(f.app.getEvent().rounds[0].skipped, true);
  assert.equal(f.app.getEvent().roundPhase, 'results');
  assert.equal(skipVm(f.app.getEvent(), 'en'), null, 'nothing to skip in Results');
  // The next round, with no drafts: skipped straight away.
  f.app.dispatch('nextRound');
  f.run('skipRound');
  assert.equal(f.app.getEvent().rounds[1].skipped, true);
  html = renderHost(hostVm(ctxOf(f.app, f.ui.get(), 1)), '');
  assert.doesNotMatch(html, /data-action="skipRound"/);
});

test('the projector checklist opens with the display once, and Show Test Pattern posts to it', () => {
  const f = shellFixture({ teams: 1 });
  f.run('openDisplay');
  assert.deepEqual(f.ui.get().local.shell, { checklist: true, checklistSeen: true });
  const closed = { ...LINK, display: 'notOpened' };
  let vm = hostVm(ctxOf(f.app, f.ui.get(), 1, closed));
  assert.deepEqual(vm.checklist.steps, [
    'Set your display to Extend, not Mirror',
    'Drag this page to the projector',
    'Press Full Screen',
    "Don't close the display: without the network it can't be reopened",
  ]);
  let html = renderHost(vm, '');
  assert.match(html, /aria-labelledby="larp-checklist-title"/);
  assert.match(html, /data-action="testPattern"[^>]*aria-disabled="true"/, 'only once the display is open');
  f.run('testPattern');
  assert.deepEqual(f.log.at(-1), ['post', 'testPattern']);
  vm = hostVm(ctxOf(f.app, f.ui.get(), 1, { ...LINK, display: 'open' }));
  html = renderHost(vm, '');
  assert.match(html, /Hide Test Pattern/);
  assert.doesNotMatch(html, /data-action="checklist"/, 'its own reopen button hides while it shows');
  f.run('checklist.close');
  assert.deepEqual(f.log.at(-1), ['post', 'testPattern'], 'the pattern goes away with it');
  assert.equal(f.ui.get().local.shell.testPattern, false);
  html = renderHost(hostVm(ctxOf(f.app, f.ui.get(), 1, { ...LINK, display: 'open' })), '');
  assert.doesNotMatch(html, /larp-checklist"/);
  assert.match(html, /data-action="checklist"[^>]*><span class="larp-btn-label">Projector Checklist/);
  f.run('openDisplay');
  assert.equal(f.ui.get().local.shell.checklist, false, 'only the first time');
  f.run('checklist');
  assert.equal(f.ui.get().local.shell.checklist, true);
  f.run('checklist.close');
  assert.equal(f.log.filter(([k]) => k === 'post').length, 2, 'no pattern up: nothing more posted');
});

test('reopened mid-event: Resume the event, with a word when the timer ran out meanwhile', () => {
  assert.equal(resumeFlash(null, 1), null);
  assert.equal(resumeFlash(eventWithTeams(1), 1), null, 'Setup: nothing to resume');
  const prep = {
    ...atRound(eventWithTeams(1), 3, 'preparation', {
      timer: { kind: 'preparation', status: 'running', durationMs: 1000, deadline: 2000, remainingMs: null },
    }),
    updatedAt: 1000,
  };
  assert.deepEqual(resumeFlash(prep, 1000), {
    kind: 'info',
    key: 'hint.resume',
    vars: { round: 'Round 4 · Bible Skit', phase: 'Preparation' },
    actionKey: 'action.resumeEvent',
  });
  assert.equal(resumeFlash(prep, 5000).key, 'hint.resumeTimeUp');
  // Already out at the last save: it ran out while the console was open, so the plain words.
  assert.equal(resumeFlash({ ...prep, updatedAt: 2500 }, 5000).key, 'hint.resume');
  const paused = { ...prep, timer: { ...prep.timer, status: 'paused', deadline: null, remainingMs: 500 } };
  assert.equal(resumeFlash(paused, 5000).key, 'hint.resume', 'a paused timer comes back paused');
  const welcome = { ...prep, roundIndex: -1, roundPhase: null, timer: { ...prep.timer, kind: null } };
  assert.deepEqual(resumeFlash(welcome, 1).vars, { round: 'Welcome', phase: 'Running' });
  const html = renderHost(
    hostVm(ctxOf(createAppWith(prep), { ...defaultUi(), flash: resumeFlash(prep, 1000) }, 1000)),
    '',
  );
  assert.match(html, /Resume the event: Round 4 · Bible Skit, Preparation/);
  assert.match(html, /data-action="flash\.dismiss"[^>]*><span class="larp-btn-label">Resume Event</);
});

test('the next action: a deliberate single click on the new label goes through; Publish opens the Run tab', () => {
  const f = shellFixture({ teams: 1 });
  f.run('next');
  const click = { detail: 1 };
  f.run('next', { event: click });
  assert.equal(f.app.getEvent().roundPhase, 'briefing', 'a second single click right after is not a double-click');
  f.run('next', { event: { detail: 2 } });
  assert.equal(f.app.getEvent().roundPhase, 'briefing', "a double-click's second click is ignored");
  for (const label of ['startPreparation', 'endPreparation', 'nextTeam', 'beginReview']) f.app.dispatch(label);
  f.app.dispatch('setStatus', { teamId: f.app.getEvent().teams[0].id, status: 'complete' });
  f.ui.set({ tab: 'review' });
  f.run('next', { event: click });
  f.run('confirm.yes', { event: click });
  assert.equal(f.app.getEvent().roundPhase, 'reveal');
  assert.equal(f.ui.get().tab, 'run', 'the reveal controls are on the Run tab');
});

test('the sign toggles hand focus back to their amount', () => {
  const f = shellFixture();
  const el = {
    dataset: { draftTarget: 'award.points' },
    getAttribute: (n) => (n === 'aria-controls' ? 'run-points' : null),
  };
  f.run('sign', { el, value: '-' });
  assert.equal(f.ui.draft('award').points, '−');
  assert.deepEqual(f.log.at(-1), ['focus', '#run-points']);
});
