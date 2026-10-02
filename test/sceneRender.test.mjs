// The site's P menu steps (src/bonfire/sceneRender.js stepIn): the next value in a list going
// one way or the other, wrapping at the ends, and from a value that isn't in the list (a
// setting's own, like a pixel size of 5) the nearest one that way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepIn } from '../src/bonfire/sceneRender.js';

test('stepIn: on and back through a list, wrapping at both ends', () => {
  const list = [4, 8];
  assert.equal(stepIn(list, 4, 1), 8);
  assert.equal(stepIn(list, 8, 1), 4, 'past the last: the first');
  assert.equal(stepIn(list, 4, -1), 8, 'before the first: the last');
  assert.equal(stepIn(list, 8, -1), 4);
});

test('stepIn: from a value that isn’t in the list, the nearest one that way', () => {
  const sizes = [2, 3, 4, 6, 8];
  assert.equal(stepIn(sizes, 5, 1), 6);
  assert.equal(stepIn(sizes, 5, -1), 4);
  assert.equal(stepIn(sizes, 10, 1), 2, 'above them all, going on: wraps to the first');
  assert.equal(stepIn(sizes, 1, -1), 8, 'below them all, going back: wraps to the last');
  assert.equal(stepIn(sizes, 1, 1), 2);
  assert.equal(stepIn(sizes, 10, -1), 8);
});
