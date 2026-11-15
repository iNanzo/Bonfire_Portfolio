import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewtMoments } from '../src/visualizer/newt/newtMoments.js';
const selection = { weapon: 'axe', flame: 'rose', element: 'fire' };
test('start waits for a downbeat or four unlocked seconds; silence seals an end letter', () => {
  const m = createNewtMoments();
  assert.equal(m.step({ t: 0, f: { events: ['start'] } }).letters[0].state, 'floating');
  assert.equal(m.step({ t: 3.9 }).letters[0].state, 'floating');
  assert.equal(m.step({ t: 4 }).letters[0].state, 'opening');
  const end = m.step({ t: 5, f: { events: ['silence'] } }).letters.at(-1);
  assert.equal(end.kind, 'end');
  assert.equal(end.pose.bloom, 0);
});
test('held build opens, strike burns once and changes page only on a big held drop', async () => {
  const hits = [];
  const m = createNewtMoments({ onImpact: (...a) => hits.push(a) });
  const done = m.equip(selection, { hold: true });
  m.step({ t: 1, f: { build: 0.5 }, events: [{ type: 'stage', data: { stage: 2 } }] });
  assert.equal(m.holding, true);
  assert.equal(m.step({ t: 2, events: [{ type: 'stage', data: { stage: 4 } }] }).letters[0].state, 'opening');
  m.step({ t: 3 });
  m.release();
  const picture = m.step({ t: 3, f: { events: ['drop'], drop: 'big' } });
  assert.equal(picture.letters[0].state, 'fading');
  assert.equal(hits.length, 1);
  assert.equal(m.forging, false);
  assert.equal(m.page, 'night');
  assert.equal(picture.page.k, 0);
  assert.deepEqual(await done, { status: 'applied' });
  m.step({ t: 4 });
  assert.equal(hits.length, 1);
});
test('return skips a staged letter immediately; two quick letters have separate owners', async () => {
  const hits = [];
  const m = createNewtMoments({ onImpact: (...a) => hits.push(a) });
  const a = m.equip(selection, { hold: true });
  m.step({ t: 0.7, events: [{ type: 'stage', data: { stage: 2 } }] });
  m.step({ t: 0.8, f: { events: ['return'] } });
  assert.deepEqual(await a, { status: 'applied' });
  assert.equal(hits.length, 1);
  const b = m.equip({ ...selection, weapon: 'spear' }, { pace: 2 });
  assert.equal(m.step({ t: 0.81 }).letters.length, 2);
  m.step({ t: 1.51 });
  assert.deepEqual(await b, { status: 'applied' });
  assert.equal(hits.length, 2);
  assert.equal(m.step({ t: 1.52 }).letters.at(-1).state, 'fading');
  assert.equal(m.page, 'dusk');
});

test('a locked start opens on its first downbeat and burns on a later downbeat', () => {
  const m = createNewtMoments();
  const step = (t, beats = [], events = []) => m.step({ t, f: { locked: true, beats, events } }).letters[0];
  assert.equal(step(0, [], ['start']).state, 'floating');
  assert.equal(step(1, [{ beat: 0 }]).state, 'opening');
  assert.equal(step(1.9).state, 'waiting');
  assert.equal(step(2, [{ beat: 0 }]).state, 'fading');
});
