import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeToEnd } from '../e2e/helpers/dialogue-route.mjs';

test('ending routes allow a looping first reply and choose a later exit', () => {
  const intro = {
    start: 'menu',
    boxes: [
      { id: 'menu', choices: [{ next: 'story' }, { next: 'bye' }] },
      { id: 'story', next: 'menu' },
      { id: 'bye', end: true },
    ],
  };
  assert.deepEqual(routeToEnd(intro), ['menu', 'bye']);
  assert.deepEqual(routeToEnd(intro, 'story'), ['story', 'menu', 'bye']);
});

test('ending routes follow implicit next boxes and report loops without an exit', () => {
  assert.deepEqual(routeToEnd({ start: 'a', boxes: [{ id: 'a', next: '' }, { id: 'b' }] }), ['a', 'b']);
  assert.throws(() => routeToEnd({ start: 'a', boxes: [{ id: 'a', next: 'a' }] }), /No dialogue ending/);
  assert.throws(() => routeToEnd({ start: 'a', boxes: [{ id: 'a', next: 'missing' }] }), /missing box/);
});

test('every authored invitation box offers a route to an ending', () => {
  const intro = JSON.parse(readFileSync(new URL('../src/content.json', import.meta.url), 'utf8')).invitation.intro;
  for (const box of intro.boxes) assert.ok(routeToEnd(intro, box.id).length, box.id);
});
