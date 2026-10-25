// The page's petal layer (src/invitation/petalLayer.js) makes no WebGL context at boot: only its
// document listeners and an empty canvas. Its renderer comes with the first press or move that may
// shed petals (Rose Petals on, no reduced motion), so a visitor who can never see one never pays
// for it; where it can't be made, it tries once and stays quiet. A fake page stands in for the
// browser (node has no WebGL, so a context asked for is refused).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PETAL_PX, QUIET, createPetalLayer, petalPx, quietAt, texelPx } from '../src/invitation/petalLayer.js';

/** A page with a canvas that counts how often a context was asked of it (and refuses it). */
function fakePage() {
  /** @type {Record<string, (e: any) => void>} */
  const on = {};
  const windowListeners = new Map();
  let removed = false;
  let cancelled = 0;
  let asked = 0;
  const canvas = {
    style: {},
    className: '',
    width: 300,
    height: 150,
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    remove() {
      removed = true;
    },
    getContext() {
      asked++;
      return null;
    },
  };
  const win = {
    innerWidth: 800,
    innerHeight: 600,
    performance,
    addEventListener: (type, fn) => windowListeners.set(type, fn),
    removeEventListener: (type, fn) => {
      if (windowListeners.get(type) === fn) windowListeners.delete(type);
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {
      cancelled++;
    },
    setTimeout: () => 0,
    requestIdleCallback: () => 0,
  };
  const doc = {
    defaultView: win,
    createElement: () => canvas,
    addEventListener: (/** @type {string} */ type, /** @type {(e: any) => void} */ f) => (on[type] = f),
    removeEventListener: (type, fn) => {
      if (on[type] === fn) delete on[type];
    },
  };
  /** @type {any[]} */
  const appended = [];
  /** @type {any[]} where it went: before which of the root's children (null: at the end) */
  const before = [];
  const root = /** @type {any} */ ({
    ownerDocument: doc,
    append: (/** @type {any} */ el) => appended.push(el),
    insertBefore: (/** @type {any} */ el, /** @type {any} */ ref) => {
      appended.push(el);
      before.push(ref);
    },
  });
  /** What the pointer is over: the toy's floor (nothing it's quiet over), or a toolbar button. */
  const floor = { closest: () => null };
  const button = { closest: (/** @type {string} */ sel) => (sel === QUIET ? button : null) };
  const press = { isPrimary: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 };
  return {
    root,
    appended,
    before,
    asked: () => asked,
    move: (x = 140, y = 120, target = floor) => on.pointermove?.({ ...press, clientX: x, clientY: y, target }),
    down: (target = floor) => on.pointerdown?.({ ...press, target }),
    up: () => on.pointerup?.(press),
    button,
    emit: (type, event = {}) => on[type]?.({ ...press, ...event }),
    emitWindow: (type) => windowListeners.get(type)?.(),
    listeners: () => Object.keys(on).length + windowListeners.size,
    removed: () => removed,
    cancelled: () => cancelled,
  };
}

test('a renderer-free layer handles lost pointers and resize, then removes every listener and its canvas on disposal', () => {
  const page = fakePage();
  const layer = createPetalLayer(page.root, { on: () => false });
  assert.ok(page.listeners() > 0);
  page.emitWindow('resize');
  page.emit('pointerout', { isPrimary: false, relatedTarget: null });
  page.emit('pointerout', { relatedTarget: page.button });
  page.emit('pointerout', { relatedTarget: null });
  page.emitWindow('blur');
  page.emit('pointercancel');
  assert.equal(layer.snapshot().running, false);
  assert.equal(page.asked(), 0, 'lifecycle events never allocate a renderer');
  layer.dispose();
  assert.equal(page.listeners(), 0, 'all document and window listeners removed');
  assert.equal(page.removed(), true, 'canvas removed');
  assert.equal(page.cancelled(), 1, 'scheduled frame cancelled');
  page.move();
  page.down();
  page.emitWindow('resize');
  assert.equal(page.asked(), 0, 'disposed layer cannot respond to later input');
});

test('at boot it makes no WebGL context, only its listeners and an empty canvas over the page', () => {
  const page = fakePage();
  const layer = createPetalLayer(page.root, { on: () => true });
  assert.ok(layer, 'a layer even before it can draw');
  assert.equal(page.asked(), 0, 'no context at boot');
  assert.equal(page.appended.length, 1, 'its canvas is on the page');
  const s = layer.snapshot();
  assert.equal(s.gpu, 'none');
  assert.equal(s.running, false);
  assert.equal(s.live, 0);
  assert.deepEqual(s.emitted, { spawn: 0, swirl: 0, pour: 0, ring: 0, trail: 0, wake: 0, bloom: 0, spill: 0 });
});

test('with Rose Petals off or reduced motion, presses and moves never make one', () => {
  const page = fakePage();
  const layer = createPetalLayer(page.root, { on: () => false });
  for (let i = 0; i < 6; i++) page.move(100 + i * 40, 100);
  page.down();
  page.up();
  assert.equal(page.asked(), 0, 'never a context');
  assert.equal(layer?.snapshot().gpu, 'none');
  // (A setting that throws reads as off.)
  const page2 = fakePage();
  createPetalLayer(page2.root, {
    on: () => {
      throw new Error('no settings');
    },
  });
  page2.down();
  page2.move();
  assert.equal(page2.asked(), 0);
});

test('the first press or move that may shed petals makes it; refused, it tries once and stays quiet', () => {
  for (const first of /** @type {const} */ (['move', 'down'])) {
    const page = fakePage();
    let allowed = false;
    const layer = createPetalLayer(page.root, { on: () => allowed });
    page.move();
    assert.equal(page.asked(), 0, `${first}: not while petals can't come`);
    allowed = true;
    // (three says so on the console when the context is refused: kept quiet here.)
    const said = console.error;
    console.error = () => {};
    try {
      page[first]();
    } finally {
      console.error = said;
    }
    assert.ok(page.asked() >= 1, `${first}: it asks for a context`);
    const asked = page.asked();
    assert.equal(layer?.snapshot().gpu, 'failed', `${first}: node has no WebGL`);
    page.move(300, 200);
    page.down();
    page.up();
    assert.equal(page.asked(), asked, `${first}: never asked again`);
    assert.equal(layer?.snapshot().running, false);
  }
});

test('it goes in under the HUD (before the element it is given), not over everything', () => {
  const page = fakePage();
  const hud = { hud: true };
  createPetalLayer(page.root, { on: () => true, before: /** @type {any} */ (hud) });
  assert.equal(page.appended.length, 1);
  assert.equal(page.before[0], hud, 'just before the HUD: over the stage, under the toolbar and the dialogue');
});

test('over a button, the toolbar, the pad, Settings or the dialogue, a press or a move sheds nothing', () => {
  // (Which the layer stays quiet over: the HUD's parts, the dialogue's boxes and every button.)
  for (const sel of ['.inv-hud > *', '.inv-talk-box', '.inv-talk-top', '.inv-talk-choices', 'button'])
    assert.ok(QUIET.includes(sel), `quiet over ${sel}`);
  assert.equal(quietAt(null), false);
  assert.equal(quietAt(/** @type {any} */ ({})), false, 'not an element: not quiet');
  const page = fakePage();
  const layer = createPetalLayer(page.root, { on: () => true });
  assert.equal(quietAt(page.button), true);
  page.down(page.button);
  for (let i = 0; i < 6; i++) page.move(100 + i * 40, 100, page.button);
  page.up();
  assert.equal(page.asked(), 0, 'nothing shed, so no renderer asked for');
  assert.equal(layer?.snapshot().gpu, 'none');
});

test('while NEWT is carried, the pointer trails nothing', () => {
  const page = fakePage();
  const layer = createPetalLayer(page.root, { on: () => true, carrying: () => true });
  for (let i = 0; i < 8; i++) page.move(100 + i * 40, 100);
  assert.equal(page.asked(), 0, 'nothing shed while he is carried');
  assert.equal(layer?.snapshot().gpu, 'none');
});

test('the page’s petals are sized in CSS px, about 10–16 px long, a little smaller on a phone', () => {
  const phone = petalPx(390, 844);
  const desk = petalPx(1280, 800);
  assert.ok(phone < desk, `${phone} on a phone, ${desk} on a desktop`);
  // (Its sizes, PETAL_SIZES 0.75–1.3 of it.)
  assert.ok(desk * 0.75 >= 9 && desk * 1.3 <= 17, `desktop ${desk}`);
  assert.ok(phone * 0.75 >= 8 && phone * 1.3 <= 15, `phone ${phone}`);
  assert.equal(petalPx(844, 390), phone, 'a phone held sideways');
  assert.equal(petalPx(2560, 1440), desk, 'never by the screen’s size');
  assert.deepEqual(Object.keys(PETAL_PX).sort(), ['desktop', 'phone']);
  // (Drawn in texels small enough that even the smallest is a petal, not a dot.)
  for (const [w, h] of [
    [390, 844],
    [844, 390],
    [768, 1024],
    [1280, 800],
    [1920, 1080],
    [3840, 2160],
  ]) {
    const long = (petalPx(w, h) * 0.75) / texelPx(w, h);
    assert.ok(long >= 5, `${w}×${h}: the smallest ${long.toFixed(1)} texels long`);
  }
});
