// A MIDI controller for Bonfire Live (src/visualizer/midi.js): reading messages, presses, names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi, pressDetector, controlName } from '../src/visualizer/midi.js';

test('MIDI: notes and control changes become controls; the rest is ignored', () => {
  assert.deepEqual(parseMidi([0x99, 36, 100]), { key: 'note:10:36', value: 100 }, 'a pad on channel 10');
  assert.deepEqual(parseMidi([0x89, 36, 0]), { key: 'note:10:36', value: 0 }, 'note-off');
  assert.deepEqual(parseMidi([0xb0, 64, 127]), { key: 'cc:1:64', value: 127 });
  assert.equal(parseMidi([0xf8]), null, 'clock');
  assert.equal(parseMidi([0xe0, 0, 64]), null, 'pitch bend');
  assert.equal(controlName('note:10:36'), 'Note 36 · Ch 10');
  assert.equal(controlName('cc:1:64'), 'CC 64 · Ch 1');
});

test('MIDI: a press is a note-on, or a control change crossing up past halfway', () => {
  const press = pressDetector();
  assert.equal(press(parseMidi([0x90, 40, 90])), true);
  assert.equal(press(parseMidi([0x90, 40, 0])), false, 'note-on at velocity 0 is a release');
  assert.equal(press(parseMidi([0xb0, 20, 127])), true);
  assert.equal(press(parseMidi([0xb0, 20, 120])), false, 'still held');
  assert.equal(press(parseMidi([0xb0, 20, 0])), false);
  assert.equal(press(parseMidi([0xb0, 20, 100])), true, 'pressed again');
});
