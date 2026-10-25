import { test } from 'node:test';
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { sceneChoices, sceneFor, createStage } from '../src/larp/stage.js';
import { scenes } from '../src/content.js';

// The game must still work on a projector laptop without WebGL. Test that
// boundary using the real renderer construction, with an unavailable context.
test('stage reports a WebGL startup failure and safely ignores later visual actions', async (t) => {
  const saved = ['document', 'matchMedia', 'BroadcastChannel'].map((k) => [
    k,
    Object.getOwnPropertyDescriptor(globalThis, k),
  ]);
  t.after(() => {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  });
  const canvas = {
    style: {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getContext: () => null,
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElementNS: () => canvas } });
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: undefined });
  t.mock.method(console, 'error', () => {});
  // Supply the same build-time base path Vite injects in these two modules.
  const hooks = registerHooks({
    load(url, context, next) {
      const result = next(url, context);
      if (/\/bonfire\/scene(?:Model|Knight)\.js$/.test(url))
        return { ...result, source: String(result.source).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/')) };
      return result;
    },
  });
  t.after(() => hooks.deregister());
  const failures = [];
  const classes = [];
  const stage = createStage({
    stage: { classList: { add: (name) => classes.push(name) } },
    reducedMotion: () => true,
    onFail: (e) => failures.push(e),
  });
  t.after(() => stage.store?.dispose());
  stage.playRound({ id: 'round', name: 'Round', scene: null, durationMs: 1000 });
  assert.equal(await stage.ready, false);
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /WebGL context/);
  assert.equal(classes.includes('is-ready'), false);
  assert.equal(stage.fire, null);
  assert.equal(stage.director, null);
  assert.equal(stage.knightsHere(), 0);
  assert.equal(stage.knightsCalled, false);
  assert.equal(stage.dismissKnights(), false);
  assert.equal(
    stage.react({ gain: 50, mult: 1, special: true, reaction: 'stoke' }, { knightCount: 4, reducedMotion: false }),
    null,
  );
});

test('stage resolves built-in and local scenes and tolerates unavailable storage', () => {
  const raw = { id: 'local-fire', name: 'My Fire', settings: {} };
  const store = { list: () => [raw], get: (id) => (id === raw.id ? raw : null) };
  const options = sceneChoices(store);
  assert.deepEqual(options.at(-1), { ref: 'm:local-fire', name: 'My Fire (Mine)' });
  const local = sceneFor('m:local-fire', store);
  assert.equal(local.id, raw.id);
  assert.equal(local.name, raw.name);
  for (const builtIn of scenes ?? []) {
    assert.ok(options.some((x) => x.ref === `b:${builtIn.id}`));
    assert.equal(sceneFor(`b:${builtIn.id}`, store).id, builtIn.id);
  }
  assert.equal(sceneFor(null, store), null);
  assert.equal(sceneFor('bad-reference', store), null);
  assert.equal(sceneFor('m:missing', store), null);
  const blocked = {
    list: () => {
      throw Error('blocked');
    },
    get: () => {
      throw Error('blocked');
    },
  };
  assert.deepEqual(sceneChoices(blocked), sceneChoices());
  assert.equal(sceneFor('m:local-fire', blocked), null);
});
