import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveLoad } from '../vite.config.js';
const chunk = (name, modules, imports = [], dynamicImports = []) => ({
  type: 'chunk',
  fileName: `${name}.js`,
  name,
  isEntry: name === 'visualizer',
  imports,
  dynamicImports,
  code: 'code',
  modules: Object.fromEntries(modules.map((id) => [id, { renderedLength: 10 }])),
});
test('Live first load permits a lazy world but rejects planted static world or invitation imports', () => {
  const lean = {
    'visualizer.js': chunk('visualizer', ['/r/src/visualizer/main.js'], ['shared.js'], ['newt.js']),
    'shared.js': chunk('shared', ['/r/src/bonfire/frame.js']),
    'newt.js': chunk('newt', ['/r/src/visualizer/newt/world.js', '/r/src/invitation/character.js']),
  };
  assert.deepEqual(liveLoad(lean), []);
  const planted = { ...lean, 'shared.js': chunk('shared', ['/r/src/bonfire/frame.js'], ['newt.js']) };
  assert.deepEqual(liveLoad(planted).sort(), ['/r/src/invitation/character.js', '/r/src/visualizer/newt/world.js']);
  assert.deepEqual(liveLoad({ 'visualizer.js': chunk('visualizer', ['C:\\repo\\src\\invitation\\content.js']) }), [
    'C:\\repo\\src\\invitation\\content.js',
  ]);
});
