// A scene's resources (src/bonfire/resources.js): everything it made is freed once, cleanups
// first, then the resources last made first, so the renderer, owned before anything else, is
// freed after every material and texture has given its GL objects back (three's renderer
// forgets them all in its own dispose(): anything after it would stay on the GPU).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResourceScope } from '../src/bonfire/resources.js';

function tracker() {
  const log = [];
  const resource = (name) => ({ name, dispose() { log.push(name); } });
  return { log, resource };
}
/** A tiny stand-in for an Object3D tree: traverse() over a mesh and its children. */
function mesh(name, geometry, material, children = []) {
  return {
    name, geometry, material, children,
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); },
  };
}

test('dispose: cleanups in reverse, then the resources in reverse, the renderer (first owned) last', () => {
  const { log, resource } = tracker();
  const scope = createResourceScope();
  scope.own(resource('renderer'));
  scope.cleanup(() => log.push('cleanup 1'));
  scope.own(resource('render target'));
  const map = { isTexture: true, ...resource('texture') };
  const mat = { ...resource('material'), map };
  scope.trackTree(mesh('root', resource('geometry'), mat));
  scope.cleanup(() => log.push('cleanup 2'));
  scope.dispose();
  assert.deepEqual(log, ['cleanup 2', 'cleanup 1', 'texture', 'material', 'geometry', 'render target', 'renderer']);
  assert.equal(scope.disposed, true);
});

test('dispose: each resource once (shared geometry, a second dispose), and late swaps are caught', () => {
  const { log, resource } = tracker();
  const scope = createResourceScope();
  scope.own(resource('renderer'));
  const shared = resource('shared geometry');
  const a = mesh('a', shared, resource('material a'));
  const b = mesh('b', shared, resource('material b'));
  scope.trackTree(mesh('root', null, null, [a, b]));
  b.material = resource('material swapped in'); // (after tracking: found again at dispose)
  scope.dispose();
  scope.dispose();
  assert.equal(log.filter((n) => n === 'shared geometry').length, 1);
  assert.ok(log.includes('material b') && log.includes('material swapped in'));
  assert.equal(log.at(-1), 'renderer');
  assert.equal(new Set(log).size, log.length);
});

test('dispose: a light’s shadow is disposed with the cleanups', () => {
  const { log, resource } = tracker();
  const scope = createResourceScope();
  scope.own(resource('renderer'));
  const light = mesh('light', null, null);
  light.shadow = resource('shadow');
  scope.trackTree(light);
  scope.dispose();
  assert.ok(log.indexOf('shadow') < log.indexOf('renderer'));
});
