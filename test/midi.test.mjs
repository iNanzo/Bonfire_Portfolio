// A MIDI controller for Bonfire Live (src/visualizer/midi.js): reading messages, presses, names,
// and learning a pad for an action (Next Scene, say).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi, pressDetector, controlName, createMidi, MIDI_ACTIONS } from '../src/visualizer/midi.js';

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

test('MIDI: Next Scene is an action a pad can learn, and a press plays it', async () => {
  assert.equal(MIDI_ACTIONS.scene, 'Next Scene');
  for (const name of Object.values(MIDI_ACTIONS)) assert.match(name, /^[A-Z]/, `${name}: a Title Case name`);
  const saved = new Map();
  globalThis.localStorage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, String(v)) };
  const input = { name: 'Pads', onmidimessage: null };
  const access = { inputs: new Map([['1', input]]), onstatechange: null };
  Object.defineProperty(globalThis, 'navigator', { value: { requestMIDIAccess: async () => access }, configurable: true });
  const played = [];
  const midi = createMidi({ onAction: (a) => played.push(a), onStatus: () => {} });
  assert.equal(await midi.connect(), true);
  midi.learn('scene');
  input.onmidimessage({ data: [0x99, 40, 100] });
  assert.equal(midi.mapping.scene, 'Note 40 · Ch 10');
  input.onmidimessage({ data: [0x99, 40, 90] });
  assert.deepEqual(played, ['scene']);
  assert.deepEqual(JSON.parse(saved.get('bonfire-live-midi')), { scene: 'note:10:40' }, 'kept with this computer');
});
