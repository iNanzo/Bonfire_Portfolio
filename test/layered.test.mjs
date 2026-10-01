// A scene's settings laid over the user's (src/visualizer/layered.js): reads take the scene's
// first, writes (and so saving) go to the user's, spreads and JSON see the layered view,
// releasing a key hands it back, and the director reads through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayered, SCENE_ONLY } from '../src/visualizer/layered.js';
import { directorFor } from './lib/fakeScene.mjs';
import { defaultScene } from '../src/scenes.js';

test('the overlay: read first, never written, released key by key', () => {
  const base = { scenery: 'ruins', glitch: 1, looks: { ember: 'mix' } };
  const layers = createLayered(base);
  const s = layers.view;
  assert.equal(s.scenery, 'ruins');
  layers.set({ scenery: 'shrine', knightHelmetOrder: ['armet'] });
  assert.equal(s.scenery, 'shrine');
  assert.deepEqual(s.knightHelmetOrder, ['armet']);
  assert.ok('knightHelmetOrder' in s);
  assert.deepEqual(Object.keys(s).sort(), ['glitch', 'knightHelmetOrder', 'looks', 'scenery']);
  assert.equal({ ...s }.scenery, 'shrine');
  assert.equal(JSON.parse(JSON.stringify(s)).scenery, 'shrine');
  s.glitch = 0.5;
  s.scenery = 'forge';
  assert.equal(base.glitch, 0.5, 'writes go to the user’s');
  assert.equal(base.scenery, 'forge');
  assert.equal(s.scenery, 'shrine', '...while the scene still shows its own');
  assert.equal(JSON.stringify(base).includes('knightHelmetOrder'), false, 'saving the user’s never sees the scene');
  layers.release(['scenery']);
  assert.equal(s.scenery, 'forge', 'released: the user’s hand wins');
  assert.deepEqual(layers.over, { knightHelmetOrder: ['armet'] });
  layers.set(null);
  assert.equal(s.knightHelmetOrder, undefined);
  assert.equal(layers.over, null);
  layers.release(['glitch']);
  assert.ok(SCENE_ONLY.includes('knightHelmetOrder') && SCENE_ONLY.includes('xrayView'));
});

test('the director reads the user’s settings through the layer, and writes land in them', () => {
  const { settings, director } = directorFor({ scenery: 'ruins' });
  const { layers } = director.parts;
  // Nothing playing: the free show, nothing to release.
  assert.equal(director.scene(null), false);
  assert.equal(director.sceneName, null);
  assert.equal(director.sceneRef, null);
  assert.equal(director.nextScene(), null, 'no scenes in the library');
  const sc = defaultScene('Still Waters');
  sc.camera.move.kind = 'still';
  sc.knights.count = 0;
  sc.knights.helmets = [];
  director.scene({ ref: 'm:still-waters', scene: sc });
  assert.equal(director.sceneName, 'Still Waters');
  assert.equal(director.sceneRef, 'm:still-waters');
  assert.equal(layers.view.camera, 'still', 'the scene’s, read through the layer');
  assert.equal(layers.view.knights, 'off');
  assert.equal(settings.camera, 'cuts', 'the user’s stay as they were');
  director.releaseScene(['camera']);
  assert.equal(layers.over.camera, undefined, 'released: the user’s again');
  assert.equal(layers.over.knights, 'off');
  assert.equal(director.parts.camera.pinned, null, 'and the framing handed back');
  director.scene(null);
  assert.equal(layers.over, null);
  assert.equal(director.sceneName, null);
});
