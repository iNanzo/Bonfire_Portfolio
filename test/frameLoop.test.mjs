import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../src/bonfire/frameLoop.js';
import { createResourceScope } from '../src/bonfire/resources.js';
test('capped loops tick every display frame, draw only gated frames, and unsubscribe on teardown', () => {
  const oldDocument = globalThis.document,
    oldLocation = globalThis.location;
  const doc = new EventTarget();
  doc.hidden = false;
  globalThis.document = doc;
  globalThis.location = { search: '' };
  try {
    const scope = createResourceScope();
    let callback = null,
      subscriptions = 0,
      ticks = 0,
      draws = 0;
    let removals = 0;
    const remove = doc.removeEventListener.bind(doc);
    doc.removeEventListener = (...args) => {
      removals++;
      remove(...args);
    };
    const original = doc.addEventListener.bind(doc);
    doc.addEventListener = (...args) => {
      subscriptions++;
      original(...args);
    };
    const renderer = {
      info: {},
      setAnimationLoop(fn) {
        callback = fn;
      },
    };
    const loop = createFrameLoop({
      renderer,
      scope,
      ready: () => true,
      draw: () => draws++,
      onTick: () => ticks++,
      onError: (e) => {
        throw e;
      },
      pageStats: null,
      statsParent: null,
    });
    loop.gate.setMaxFps(30);
    loop.syncRunning();
    for (const t of [0, 16, 33, 50, 66, 83, 100]) callback(t);
    assert.equal(ticks, 7);
    assert.equal(draws, 4);
    assert.equal(subscriptions, 1);
    scope.dispose();
    assert.equal(removals, 1);
    assert.equal(callback, null);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(callback, null);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(callback, null);
  } finally {
    globalThis.document = oldDocument;
    globalThis.location = oldLocation;
  }
});

test('renderer and canvas ownership release resources, abort context listeners, and preserve capture APIs', async () => {
  const { ownFrameRenderer, attachFrameCanvas, frameCapture } = await import('../src/bonfire/frameLoop.js');
  const scope = createResourceScope(),
    order = [];
  const canvas = new EventTarget();
  canvas.setAttribute = (key, value) => {
    canvas[key] = value;
  };
  canvas.remove = () => order.push('canvas');
  let lost = false,
    errors = 0;
  const renderer = {
    domElement: canvas,
    setAnimationLoop: () => {},
    dispose: () => order.push('renderer'),
    getContext: () => ({ isContextLost: () => lost }),
    forceContextLoss: () => {
      lost = true;
      order.push('context');
    },
  };
  ownFrameRenderer(scope, renderer);
  const container = { appendChild: (child) => assert.equal(child, canvas) };
  assert.equal(
    attachFrameCanvas(scope, renderer, container, () => errors++),
    canvas,
  );
  assert.equal(canvas.className, 'bonfire-canvas');
  assert.equal(canvas['aria-hidden'], 'true');
  scope.own({ dispose: () => order.push('mesh') });
  const event = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(errors, 1);
  assert.equal(lost, true);
  assert.ok(order.indexOf('mesh') < order.indexOf('renderer'));
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(errors, 1);
  const capture = () => Promise.resolve('png'),
    onRendered = () => () => {};
  const api = frameCapture({ capture, onRendered, thumb: (w, h) => [w, h] });
  assert.equal(api.capture, capture);
  assert.equal(api.onRendered, onRendered);
  assert.deepEqual(api.captureThumb(), [192, 108]);
  assert.deepEqual(api.captureThumb(64, 32), [64, 32]);
});
