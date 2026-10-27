// Exercise the link's actual UI binding with a small DOM stand-in and a controlled clock.
// Browser specs cover layout and native navigation; these check state changes and fallback timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindUi } from '../src/invitation/ui.js';
import { LINK_CLEAR_MS, LINK_FADE } from '../src/invitation/link.js';

class Element {
  constructor() {
    this.hidden = false;
    this.inert = false;
    this.attrs = new Map();
    this.children = [];
    this.queries = new Map();
    this.events = new Map();
    this.dataset = {};
    const classes = new Set();
    this.classList = {
      add: (v) => classes.add(v),
      remove: (v) => classes.delete(v),
      contains: (v) => classes.has(v),
      toggle(v, on = !classes.has(v)) {
        if (on) classes.add(v);
        else classes.delete(v);
        return on;
      },
    };
  }
  append(el) {
    this.children.push(el);
  }
  remove() {
    this.removed = true;
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  set target(v) {
    this.setAttribute('target', v);
  }
  set rel(v) {
    this.setAttribute('rel', v);
  }
  querySelector(sel) {
    if (!this.queries.has(sel)) {
      const el = new Element();
      if (['.inv-sheet', '.inv-camera-pad'].includes(sel)) el.hidden = true;
      el.selector = sel;
      this.queries.set(sel, el);
    }
    return this.queries.get(sel);
  }
  matches(sel) {
    return this.selector === sel;
  }
  closest() {
    return this;
  }
  contains(el) {
    return el === this || [...this.queries.values()].some((child) => child.contains(el));
  }
  focus(options) {
    this.focusOptions = options;
  }
  querySelectorAll() {
    return [];
  }
  addEventListener(k, f) {
    if (!this.events.has(k)) this.events.set(k, new Set());
    this.events.get(k).add(f);
  }
  removeEventListener(k, f) {
    this.events.get(k)?.delete(f);
  }
  emit(k, event) {
    for (const f of this.events.get(k) ?? []) f(event);
  }
}

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  const doc = new Element();
  doc.createElement = (tag) => {
    const el = new Element();
    if (tag === 'canvas') el.getContext = () => null;
    if (tag === 'template') {
      const link = new Element();
      link.hidden = true; // bindUi starts with no configured link.
      el.content = { firstElementChild: link };
    }
    return el;
  };
  const win = new Element();
  win.setTimeout = globalThis.setTimeout;
  const replacements = {
    HTMLElement: Element,
    HTMLButtonElement: class extends Element {},
    HTMLInputElement: class extends Element {},
    document: doc,
    window: win,
    performance: { now: () => now },
    getComputedStyle: (el) => ({
      getPropertyValue: () => '#3a332d',
      opacity: el.classList.contains('is-moving') ? '0' : '1',
    }),
  };
  const restore = [];
  for (const [key, value] of Object.entries(replacements)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    restore.push(() => (old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]));
  }
  const stage = new Element();
  const ui = bindUi(stage, { look: {}, onButton() {}, onLook() {} });
  t.after(() => {
    ui.destroy();
    for (const reset of restore) reset();
  });
  return {
    ui,
    stage,
    win,
    doc,
    hud: stage.children[0],
    el: stage.children[1],
    tick(ms) {
      now += ms;
      t.mock.timers.tick(ms);
    },
  };
}

test('link binding updates destination and reach, and clears stale navigation attributes when hidden', (t) => {
  const { ui, stage, el } = setup(t);
  assert.deepEqual(ui.linkStops(), []);
  ui.placeLink('left');
  assert.equal(ui.linkState().at, 'left', 'an unconfigured link moves immediately');
  ui.placeLink('right');
  ui.placeLink('right');
  assert.equal(ui.linkState().phase, null);
  ui.setLink({ href: 'visualizer/', label: 'Live' });
  assert.equal(ui.linkState().href, '/visualizer/');
  assert.equal(ui.linkState().target, '_blank');
  assert.equal(el.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(ui.linkState().label, 'Live');
  assert.deepEqual(ui.linkStops(), [el]);
  assert.ok(stage.classList.contains('has-link'));
  ui.setLinkBlocked(true);
  ui.setLinkBlocked(true);
  assert.ok(ui.linkState().inert);
  assert.deepEqual(ui.linkStops(), []);
  ui.setLinkBlocked(false);
  assert.deepEqual(ui.linkStops(), [el]);
  ui.setLink({ href: 'mailto:hello@example.com', label: 'Write' });
  assert.equal(ui.linkState().href, 'mailto:hello@example.com');
  assert.equal(ui.linkState().target, null);
  assert.equal(el.getAttribute('rel'), null);
  for (const link of [null, { href: 'javascript:alert(1)', label: 'Unsafe' }, { href: '', label: 'Empty' }]) {
    ui.setLink(link);
    assert.equal(ui.linkState().shown, false);
    assert.equal(ui.linkState().href, '');
    assert.equal(el.getAttribute('target'), null);
    assert.deepEqual(ui.linkStops(), []);
    assert.equal(stage.classList.contains('has-link'), false);
  }
});

test('link corner changes wait for a clear destination, reverse safely, and finish without transition events', (t) => {
  const { ui, el, tick } = setup(t);
  ui.setLink({ href: 'https://example.com', label: 'Link' });
  ui.placeLink('left');
  assert.equal(ui.linkState().at, 'right');
  assert.equal(ui.linkState().phase, 'out');
  tick(3 * LINK_FADE.ms);
  assert.equal(ui.linkState().at, 'left');
  assert.equal(ui.linkState().swapOpacity, 0);
  tick(3 * LINK_FADE.ms);
  assert.equal(ui.linkState().phase, null);
  let clear = false;
  ui.placeLink('right', { clear: () => clear });
  el.emit('transitionend', { target: el, propertyName: 'opacity' });
  assert.equal(ui.linkState().at, 'left', 'corner stays left while its destination is occupied');
  clear = true;
  tick(16);
  assert.equal(ui.linkState().at, 'right');
  tick(3 * LINK_FADE.ms);
  ui.placeLink('left');
  ui.placeLink('right');
  tick(3 * LINK_FADE.ms);
  assert.equal(ui.linkState().at, 'right');
  assert.equal(ui.linkState().phase, null);
  ui.placeLink('left', { reduced: true });
  assert.equal(ui.linkState().at, 'left');
  ui.placeLink('right', { reduced: true, clear: () => false });
  tick(0);
  assert.equal(ui.linkState().at, 'left');
  tick(LINK_CLEAR_MS);
  assert.equal(ui.linkState().at, 'right', 'bounded fallback cannot leave the link hidden forever');
  assert.equal(ui.linkState().phase, null);
  ui.destroy();
  assert.ok(el.removed);
});

test('the link respects Settings and shared toolbar focus, while a held touch shows a label without navigating', (t) => {
  const { ui, el, hud, stage, win, doc, tick } = setup(t);
  ui.setLink({ href: 'https://example.com', label: 'Portfolio' });
  const click = (selector) => hud.emit('click', { target: hud.querySelector(selector) });
  click('[data-look-open]');
  assert.ok(ui.sheetOpen && ui.linkState().inert);
  assert.deepEqual(ui.linkStops(), []);
  doc.emit('keydown', { key: 'Tab', preventDefault() {} });
  doc.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(ui.sheetOpen, false);
  assert.deepEqual(ui.linkStops(), [el]);
  click('[data-camera-open]');
  assert.ok(ui.padOpen);
  doc.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(ui.padOpen, false);
  assert.ok(ui.pad.hidden && ui.sheet.hidden);
  win.emit('keydown', { key: 'Shift' });
  win.emit('keydown', { key: 'Tab' });
  ui.focusToolbar();
  const first = ui.toolbar.querySelector('button:not(:disabled)');
  assert.equal(first.focusOptions.focusVisible, true);
  win.emit('pointerdown', {});
  ui.focusToolbar();
  assert.equal(first.focusOptions.focusVisible, false);
  ui.setEnabled(false);
  ui.setTalking(true);
  ui.setTalking(true);
  assert.ok(ui.talking && ui.toolbar.inert);
  ui.setTalking(false);
  ui.setEnabled(true);
  assert.equal(ui.talking, false);
  assert.equal(ui.toolbar.inert, false);
  ui.setToolbar(false);
  assert.equal(ui.toolbar.hidden, true);
  ui.setToolbar(true);
  ui.setWander(false);
  assert.equal(hud.querySelector('[data-setting="wander"]').checked, false);
  ui.setStatus('Loading', { reload: true });
  assert.equal(hud.querySelector('.inv-status-text').textContent, 'Loading');
  ui.setStatus(null);
  assert.ok(hud.querySelector('.inv-status').hidden);
  el.emit('pointerdown', { target: el, pointerType: 'touch', clientX: 5, clientY: 5, pointerId: 1 });
  tick(1000);
  assert.ok(el.classList.contains('is-label'));
  el.emit('pointerup', { target: el, pointerId: 1 });
  let prevented = false;
  stage.emit('click', {
    target: el,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {},
  });
  assert.ok(prevented, 'releasing the held label cannot follow the link');
  tick(1200);
  assert.equal(el.classList.contains('is-label'), false);
});
