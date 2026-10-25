import { test } from 'node:test';
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';

// Exercise the game's scene orchestration at the renderer boundary without requiring a GPU.
test('stage starts the queued round, dispatches reactions and cancels old-round gestures', async (t) => {
  const calls = [];
  let options;
  let settings;
  const fire = {
    ready: Promise.resolve(),
    weapon: 'sword',
    flame: 'flame',
    element: 'fire',
    knights: { present: 2, max: 4, gesture: (...args) => calls.push(['gesture', ...args]) },
    equip: async (...args) => calls.push(['equip', ...args]),
    stoke: () => calls.push(['stoke']),
    pulse: (...args) => calls.push(['pulse', ...args]),
    flash: (...args) => calls.push(['flash', ...args]),
    sparkle: (...args) => calls.push(['sparkle', ...args]),
    ring: (...args) => calls.push(['ring', ...args]),
    dispose: () => calls.push(['dispose']),
  };
  const director = {
    scene: (...args) => calls.push(['scene', ...args]),
    update: (...args) => calls.push(['update', ...args]),
    landed: (...args) => calls.push(['landed', ...args]),
    releaseScene: (...args) => calls.push(['release', ...args]),
  };
  globalThis.__stageTest = {
    createBonfire: (_stage, o) => {
      options = o;
      return fire;
    },
    createDirector: (_fire, o) => {
      settings = o.settings;
      return director;
    },
  };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.endsWith('/larp/stage.js')) {
        if (specifier === '../bonfire/scene.js')
          return {
            shortCircuit: true,
            url: 'data:text/javascript,export const createBonfire = globalThis.__stageTest.createBonfire;',
          };
        if (specifier === '../visualizer/director.js')
          return {
            shortCircuit: true,
            url: 'data:text/javascript,export const createDirector = globalThis.__stageTest.createDirector; export const DEFAULT_SETTINGS = {};',
          };
      }
      return next(specifier, context);
    },
  });
  t.after(() => {
    hooks.deregister();
    delete globalThis.__stageTest;
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createStage } = await import('../src/larp/stage.js');
  const classes = [];
  const errors = [];
  const stage = createStage({
    stage: {
      classList: { add: (c) => classes.push(c) },
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 200 }),
    },
    reducedMotion: () => false,
    onFail: (e) => errors.push(e),
    onImpact: (e) => calls.push(['impact', e]),
  });
  t.after(() => stage.store?.dispose());
  const round = { id: 'a', scene: null };
  stage.playRound(round);
  assert.equal(await stage.ready, true);
  assert.deepEqual(classes, ['is-ready']);
  assert.equal(stage.fire, fire);
  assert.equal(stage.director, director);
  assert.ok(calls.find((c) => c[0] === 'equip')[3].instant);
  assert.deepEqual(calls.find((c) => c[0] === 'scene').slice(1), [
    null,
    { ref: null, mode: 'hold', instant: true, fresh: true },
  ]);
  options.onFrame(0.1);
  options.onImpact('flame');
  assert.ok(calls.some((c) => c[0] === 'update'));
  assert.ok(calls.some((c) => c[0] === 'landed' && c[1] === 'flame'));
  assert.ok(calls.some((c) => c[0] === 'impact' && c[1] === 'flame'));
  const game = { knightCount: 4, reducedMotion: false };
  const entry = { gain: 100, mult: 1, special: true, reaction: 'stoke' };
  stage.react(entry, game);
  assert.equal(stage.knightsCalled, true);
  assert.equal(settings.knights, 'on');
  assert.equal(settings.knightCount, 4);
  t.mock.timers.tick(2500);
  assert.equal(calls.filter((c) => c[0] === 'gesture').length, 4);
  assert.equal(calls.filter((c) => c[0] === 'stoke').length, 2);
  calls.length = 0;
  stage.react(entry, game);
  stage.playRound({ id: 'b', scene: null });
  t.mock.timers.tick(2500);
  assert.equal(calls.filter((c) => c[0] === 'gesture').length, 0, 'next round cancels old gestures');
  assert.equal(stage.knightsCalled, false);
  assert.equal(settings.knights, 'off');
  stage.react({ ...entry, reaction: 'flash', special: false }, game);
  assert.deepEqual(
    calls.find((c) => c[0] === 'flash'),
    ['flash', 60, 140],
  );
  stage.react({ ...entry, reaction: 'swap', special: false }, game);
  await Promise.resolve();
  assert.ok(calls.some((c) => c[0] === 'equip' && c[3].element !== 'fire'));
  assert.equal(stage.dismissKnights(), true);
  assert.ok(Array.isArray(stage.sceneChoices()));
  const error = Error('context lost');
  options.onError(error);
  assert.deepEqual(errors, [error]);
  assert.ok(calls.some((c) => c[0] === 'dispose'));
  assert.equal(stage.fire, null);
  assert.equal(stage.director, null);
  assert.equal(stage.dismissKnights(), false);
});
