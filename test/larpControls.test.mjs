// Exercise the host controls at their DOM boundary: events must reach the reducer,
// confirmations guard destructive actions, and projector updates avoid needless copies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSetup } from '../src/larp/setup.js';
import { createShow } from '../src/larp/show.js';
import { newGame, reduce } from '../src/larp/game.js';

function element(dataset = {}) {
  const listeners = new Map();
  return {
    dataset,
    hidden: false,
    value: '',
    type: 'text',
    innerHTML: '',
    textContent: '',
    attributes: {},
    fields: [],
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    addEventListener(k, fn) {
      listeners.set(k, fn);
    },
    emit(type, target, extra = {}) {
      return listeners.get(type)?.({ type, target, ...extra });
    },
    querySelectorAll() {
      return this.fields;
    },
    focus() {
      globalThis.document.activeElement = this;
    },
    closest() {
      return this;
    },
    hasAttribute(k) {
      return k in this.attributes;
    },
  };
}
function host(t) {
  t.mock.method(globalThis, 'setTimeout', () => 0);
  const old = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: null } });
  t.after(() => (old ? Object.defineProperty(globalThis, 'document', old) : delete globalThis.document));
  let n = 0;
  const env = { now: 1000, newId: () => `control-${++n}` };
  let game = newGame(env);
  let confirm = false;
  const calls = [];
  const tabs = ['teams', 'rounds', 'modifiers', 'game'].map((tab) => element({ tab }));
  const panels = tabs.map((tab) => element({ tabPanel: tab.dataset.tab }));
  const tablist = element();
  const dialog = element();
  dialog.querySelectorAll = (s) => (s === '[data-tab]' ? tabs : panels);
  dialog.querySelector = (s) => (s === '[role="tablist"]' ? tablist : null);
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
  };
  const dispatch = (action) => {
    calls.push(action);
    const next = reduce(game, action, env);
    const changed = next !== game;
    game = next;
    return changed;
  };
  const setup = createSetup(dialog, {
    game: () => game,
    dispatch,
    scenes: () => [],
    confirm: () => confirm,
    exportGame: () => calls.push('export'),
    importGame: (file) => calls.push(file),
  });
  return {
    setup,
    dialog,
    tabs,
    panels,
    tablist,
    calls,
    env,
    dispatch,
    game: () => game,
    confirm: (value) => {
      confirm = value;
    },
    click: (data) => dialog.emit('click', element(data)),
  };
}

test('setup keeps tab selection accessible and wraps keyboard navigation', (t) => {
  const h = host(t);
  h.setup.open();
  assert.equal(h.dialog.open, true);
  assert.equal(h.tabs[0].attributes['aria-selected'], 'true');
  assert.deepEqual(
    h.panels.map((p) => p.hidden),
    [false, true, true, true],
  );
  let prevented = 0;
  h.tablist.emit('keydown', h.tabs[0], { key: 'ArrowLeft', preventDefault: () => prevented++ });
  assert.equal(globalThis.document.activeElement, h.tabs[3]);
  assert.equal(h.tabs[3].tabIndex, 0);
  assert.equal(h.tabs[0].tabIndex, -1);
  assert.equal(prevented, 1);
  h.tablist.emit('keydown', h.tabs[3], { key: 'ArrowRight', preventDefault: () => prevented++ });
  assert.equal(globalThis.document.activeElement, h.tabs[0]);
  h.tablist.emit('keydown', h.tabs[0], { key: 'Enter', preventDefault: () => prevented++ });
  assert.equal(prevented, 2);
  h.click({ tab: 'rounds' });
  assert.match(h.panels[1].innerHTML, /Add a Round/);
  h.dialog.emit('click', h.dialog);
  assert.equal(h.dialog.open, false);
  h.setup.open();
  assert.equal(h.tabs[1].attributes['aria-selected'], 'true', 'reopen remembers its tab');
  h.setup.open('missing');
  assert.equal(h.tabs[0].attributes['aria-selected'], 'true', 'unknown tab falls back safely');
});

test('setup edits the game, preserves focused text, and refreshes external changes', (t) => {
  const h = host(t);
  const team = h.game().teams[0];
  const name = element({ set: `teams.${team.id}.name` });
  name.closest = () => h.panels[0];
  h.panels[0].fields = [name];
  h.setup.open();
  assert.equal(name.value, team.name);
  name.focus();
  name.value = 'Owls';
  h.dialog.emit('input', name);
  assert.equal(h.game().teams[0].name, 'Owls');
  h.dispatch({ type: 'edit', list: 'teams', id: team.id, key: 'name', value: 'Foxes' });
  h.setup.refresh();
  assert.equal(name.value, 'Owls', 'refresh does not replace text being typed');
  globalThis.document.activeElement = null;
  h.setup.refresh();
  assert.equal(name.value, 'Foxes');
  const duration = element({ set: `rounds.${h.game().rounds[0].id}.minutes` });
  duration.type = 'number';
  duration.value = '2.5';
  duration.closest = () => h.panels[1];
  h.dialog.emit('input', duration);
  assert.equal(h.game().rounds[0].durationMs, 300000, 'number input waits for commit');
  h.dialog.emit('change', duration);
  assert.equal(h.game().rounds[0].durationMs, 150000);
  const motion = element({ set: 'game.reducedMotion' });
  motion.type = 'checkbox';
  motion.checked = true;
  motion.closest = () => h.panels[3];
  h.panels[3].fields = [motion];
  h.dialog.emit('change', motion);
  assert.equal(h.game().reducedMotion, true);
  h.setup.open('game');
  assert.equal(motion.checked, true);
});

test('setup adds and reorders teams, but deletion and reset require confirmation', (t) => {
  const h = host(t);
  h.setup.open();
  const first = h.game().teams[0];
  h.click({ add: 'teams' });
  assert.equal(h.game().teams.length, 3);
  h.click({ move: 'teams', id: first.id, by: '1' });
  assert.equal(h.game().teams[1].id, first.id);
  h.click({ remove: 'teams', id: first.id });
  assert.equal(h.game().teams.length, 3);
  h.confirm(true);
  h.click({ remove: 'teams', id: first.id });
  assert.equal(
    h.game().teams.some((x) => x.id === first.id),
    false,
  );
  h.dispatch({ type: 'award', teamId: h.game().teams[0].id, points: 20 });
  h.confirm(false);
  h.click({ game: 'clear' });
  assert.equal(h.game().log.length, 1);
  h.confirm(true);
  h.click({ game: 'clear' });
  assert.equal(h.game().log.length, 0);
  h.dispatch({ type: 'set', key: 'title', value: 'Keep Me' });
  h.confirm(false);
  h.click({ game: 'new' });
  assert.equal(h.game().title, 'Keep Me');
  h.confirm(true);
  h.click({ game: 'new' });
  assert.notEqual(h.game().title, 'Keep Me');
});

test('setup exports and allows importing the same file twice', (t) => {
  const h = host(t);
  h.click({ game: 'export' });
  assert.equal(h.calls.at(-1), 'export');
  const input = element({ game: 'import' });
  const file = { name: 'game.json' };
  input.files = [file];
  input.value = 'game.json';
  h.dialog.emit('change', input);
  assert.equal(h.calls.at(-1), file);
  assert.equal(input.value, '', 'reset lets the file picker select the same file again');
  input.files = [];
  const count = h.calls.length;
  h.dialog.emit('change', input);
  assert.equal(h.calls.length, count, 'cancelled file picker does not import');
});

test('projector only mirrors changed board/clock content and escapes multiplier labels', () => {
  let n = 0;
  const env = { now: 1000, newId: () => `show-${++n}` };
  let game = newGame(env);
  const board = element(),
    clock = element();
  const round = element(),
    time = element(),
    mults = element();
  clock.querySelector = (s) => ({ '[data-clock-round]': round, '[data-clock-time]': time, '[data-mults]': mults })[s];
  const copies = [];
  const show = createShow({ board, clock, mirror: (el) => copies.push(el) });
  show.draw(game, 1000);
  assert.deepEqual(copies, [board, clock]);
  assert.equal(time.textContent, '5:00');
  show.draw(game, 1100);
  assert.equal(copies.length, 2);
  game = reduce(game, { type: 'timer', op: 'toggle' }, env);
  show.draw(game, 1000);
  assert.equal(clock.dataset.state, 'running');
  assert.equal(copies.at(-1), clock);
  show.draw(game, 2000);
  assert.equal(time.textContent, '4:59');
  const team = game.teams[0];
  game = reduce(game, { type: 'edit', list: 'teams', id: team.id, key: 'name', value: '<Owls>' }, env);
  const mod = game.modifiers.find((x) => x.mult > 1);
  game = reduce(game, { type: 'award', teamId: team.id, modId: mod.id }, env);
  show.draw(game, 2000);
  assert.match(mults.innerHTML, /&lt;Owls&gt;/);
  assert.doesNotMatch(mults.innerHTML, /<Owls>/);
  assert.deepEqual(copies.slice(-2), [board, clock]);
});

// The overlay has no browser rendering dependency; drive real callbacks against
// small event targets and keep the real game reducer behind each action.
function overlayHost(t, createOverlay) {
  const h = host(t);
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const win = element();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  t.after(() => (oldWindow ? Object.defineProperty(globalThis, 'window', oldWindow) : delete globalThis.window));
  const classes = new Set();
  globalThis.document.body = {
    classList: {
      add: (v) => classes.add(v),
      remove: (v) => classes.delete(v),
      toggle: (v) => (classes.has(v) ? classes.delete(v) : classes.add(v)),
    },
  };
  globalThis.document.documentElement = {};
  let idle;
  t.mock.method(globalThis, 'setTimeout', (fn) => {
    idle = fn;
    return 0;
  });
  const nodes = Object.fromEntries(
    ['hud', 'picker', 'picker-title', 'picker-list', 'mods', 'hud-round', 'timer-label'].map((k) => [
      `[data-${k}]`,
      element(),
    ]),
  );
  const root = element();
  root.querySelector = (s) => nodes[s];
  const hud = nodes['[data-hud]'],
    picker = nodes['[data-picker]'],
    list = nodes['[data-picker-list]'];
  hud.matches = () => false;
  hud.contains = (el) => el === hud;
  picker.hidden = true;
  const focus = element();
  list.querySelector = () => focus;
  let setupOpen = false,
    keysOpen = false;
  const awards = [],
    commands = [],
    notes = [];
  const overlay = createOverlay({
    root,
    game: h.game,
    dispatch: h.dispatch,
    award: (teamId, what) => {
      awards.push({ teamId, ...what });
      h.dispatch({ type: 'award', teamId, ...what });
    },
    output: () => commands.push('output'),
    setup: () => commands.push('setup'),
    keys: () => commands.push('keys'),
    dismissKnights: () => commands.push('knights'),
    setupOpen: () => setupOpen,
    keysOpen: () => keysOpen,
    note: (msg) => notes.push(msg),
  });
  return {
    ...h,
    overlay,
    nodes,
    picker,
    list,
    hud,
    win,
    awards,
    commands,
    notes,
    classes,
    key: (key, extra = {}) => overlay.handleKey({ key, code: '', target: null, ...extra }),
    modal: (setup, keys) => {
      setupOpen = setup;
      keysOpen = keys;
    },
    idle: () => idle(),
    click: (data) => {
      const b = element(data);
      b.closest = (s) => (s === '[data-act]' ? b : null);
      root.emit('click', b);
    },
  };
}

import { createOverlay } from '../src/larp/overlay.js';

test('overlay keyboard changes rounds and timer, but leaves typing and modal dialogs alone', (t) => {
  const h = overlayHost(t, createOverlay);
  assert.equal(h.key(' '), true);
  assert.equal(h.game().timer.status, 'running');
  h.overlay.draw(h.game());
  assert.equal(h.nodes['[data-timer-label]'].textContent, 'Pause');
  h.key(' ');
  h.overlay.draw(h.game());
  assert.equal(h.nodes['[data-timer-label]'].textContent, 'Resume');
  h.key('r');
  h.overlay.draw(h.game());
  assert.equal(h.nodes['[data-timer-label]'].textContent, 'Start');
  h.key('ArrowRight');
  assert.equal(h.game().roundIndex, 1);
  h.key('ArrowLeft');
  assert.equal(h.game().roundIndex, 0);
  const count = h.calls.length;
  for (const extra of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { target: { closest: () => ({ tagName: 'INPUT', type: 'text' }) } },
  ]) {
    assert.equal(h.key(' ', extra), false);
  }
  h.modal(true, false);
  assert.equal(h.key(' '), false);
  h.modal(false, true);
  assert.equal(h.key(' '), false);
  assert.equal(h.calls.length, count);
  h.modal(false, false);
  assert.equal(h.key('unassigned'), false);
  h.key('O');
  h.key('S');
  h.key('K');
  h.key('?');
  assert.deepEqual(h.commands, ['output', 'setup', 'knights', 'keys']);
  h.key('h');
  assert.equal(h.classes.has('hud-off'), true);
  h.key('h');
  assert.equal(h.classes.has('hud-off'), false);
});

test('overlay picker awards the selected team and returns focus; removed targets close it', (t) => {
  const h = overlayHost(t, createOverlay);
  const origin = element();
  origin.isConnected = true;
  origin.focus();
  const mod = h.game().modifiers[0],
    team = h.game().teams[1];
  assert.equal(h.key('1', { code: 'Digit1' }), true);
  assert.equal(h.picker.hidden, false);
  assert.match(h.nodes['[data-picker-title]'].textContent, /Which Team/);
  assert.equal(h.key(' '), false, 'timer shortcut does not leak through picker');
  h.list.fields = [{ click: () => h.click({ act: 'pick', team: team.id }) }];
  h.key('1', { code: 'Digit1' });
  assert.deepEqual(h.awards, [{ teamId: team.id, modId: mod.id }]);
  assert.equal(h.picker.hidden, true);
  assert.equal(globalThis.document.activeElement, origin);
  h.overlay.pickPoints(team.id);
  h.click({ act: 'hand', points: '-5' });
  assert.deepEqual(h.awards.at(-1), { teamId: team.id, points: -5 });
  h.overlay.pickPoints(team.id);
  h.key('Escape');
  assert.equal(h.picker.hidden, true);
  h.overlay.pickFor(mod.id);
  h.dispatch({ type: 'remove', list: 'modifiers', id: mod.id });
  h.overlay.draw(h.game());
  assert.equal(h.picker.hidden, true);
  h.overlay.pickPoints(team.id);
  h.dispatch({ type: 'remove', list: 'teams', id: team.id });
  h.overlay.draw(h.game());
  assert.equal(h.picker.hidden, true);
  const remainingMod = h.game().modifiers[0];
  h.overlay.pickFor(remainingMod.id);
  assert.equal(h.picker.hidden, true, 'one team receives the modifier directly');
  assert.equal(h.awards.at(-1).teamId, h.game().teams[0].id);
  h.overlay.pickFor('missing');
  h.overlay.pickPoints('missing');
  assert.equal(h.picker.hidden, true);
});

test('overlay undo and idle visibility respect the host’s current activity', (t) => {
  const h = overlayHost(t, createOverlay);
  h.key('z');
  assert.equal(h.notes.at(-1), 'Nothing to undo');
  const team = h.game().teams[0];
  h.dispatch({ type: 'award', teamId: team.id, points: 10 });
  h.key('z');
  assert.equal(h.game().log.length, 0);
  assert.match(h.notes.at(-1), /^Undone:/);
  h.idle();
  assert.equal(h.classes.has('is-idle'), true);
  h.win.emit('pointermove');
  assert.equal(h.classes.has('is-idle'), false);
  h.hud.focus();
  h.idle();
  assert.equal(h.classes.has('is-idle'), false);
  globalThis.document.activeElement = null;
  h.modal(true, false);
  h.idle();
  assert.equal(h.classes.has('is-idle'), false);
  h.modal(false, false);
  h.overlay.pickPoints(team.id);
  h.idle();
  assert.equal(h.classes.has('is-idle'), false);
  h.click({ act: 'pick-cancel' });
  h.idle();
  assert.equal(h.classes.has('is-idle'), true);
});
