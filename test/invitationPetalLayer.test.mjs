// The page's petal layer (src/invitation/petalLayer.js) makes no WebGL context at boot: only its
// document listeners and an empty canvas. Its renderer comes with the first press or move that may
// shed petals (Rose Petals on, no reduced motion), so a visitor who can never see one never pays
// for it; where it can't be made, it tries once and stays quiet. A fake page stands in for the
// browser (node has no WebGL, so a context asked for is refused).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPetalLayer } from '../src/invitation/petalLayer.js';

/** A page with a canvas that counts how often a context was asked of it (and refuses it). */
function fakePage() {
  /** @type {Record<string, (e: any) => void>} */
  const on = {};
  let asked = 0;
  const canvas = {
    style: {},
    className: '',
    width: 300,
    height: 150,
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    remove() {},
    getContext() {
      asked++;
      return null;
    },
  };
  const win = {
    innerWidth: 800,
    innerHeight: 600,
    performance,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    requestIdleCallback: () => 0,
  };
  const doc = {
    defaultView: win,
    createElement: () => canvas,
    addEventListener: (/** @type {string} */ type, /** @type {(e: any) => void} */ f) => (on[type] = f),
    removeEventListener() {},
  };
  /** @type {any[]} */
  const appended = [];
  const root = /** @type {any} */ ({ ownerDocument: doc, append: (/** @type {any} */ el) => appended.push(el) });
  const press = { isPrimary: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 };
  return {
    root,
    appended,
    asked: () => asked,
    move: (x = 140, y = 120) => on.pointermove?.({ ...press, clientX: x, clientY: y }),
    down: () => on.pointerdown?.(press),
    up: () => on.pointerup?.(press),
  };
}

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
