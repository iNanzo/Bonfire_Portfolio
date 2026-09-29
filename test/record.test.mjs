// Recording a Bonfire Live clip (src/visualizer/record.js): the format and the scale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordType, recordScale } from '../src/visualizer/record.js';

test('clips record as MP4 where the browser can, else WebM', () => {
  assert.match(recordType((t) => t.startsWith('video/mp4')), /^video\/mp4/);
  assert.match(recordType((t) => t.startsWith('video/webm')), /^video\/webm;codecs=vp9/);
  assert.equal(recordType(() => false), '');
});

test('clips scale the pixel-art picture by a whole number to about 1080 lines', () => {
  assert.equal(recordScale(270), 4);
  assert.equal(recordScale(360), 3);
  assert.equal(recordScale(1080), 1);
  assert.equal(recordScale(2000), 1, 'never below 1');
});
