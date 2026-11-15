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

test('two paced letters overlap and each finishes its own petal pour', async () => {
  const { createPetalFlow, FLOWS } = await import('../src/invitation/petals.js');
  const m = createNewtMoments(),
    flows = new Map();
  const first = m.equip(selection, { pace: 2 });
  let second = null,
    overlap = false;
  for (let i = 0; i < 180; i++) {
    const picture = m.step({ t: i / 60 });
    overlap ||= picture.letters.length === 2;
    for (const letter of picture.letters) {
      if (!flows.has(letter.id)) flows.set(letter.id, createPetalFlow({ seed: letter.id }));
      const flow = flows.get(letter.id);
      flow.letter({
        c: { x: letter.x, y: letter.y, z: 0 },
        right: { x: 1, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        fwd: { x: 0, y: 0, z: 1 },
        h: 1,
        opening: letter.pose.flap / Math.PI,
        floating: letter.state === 'floating',
        time: letter.time,
      });
    }
    for (const flow of flows.values()) flow.step(1 / 60);
    if (!m.forging && !second) second = m.equip({ ...selection, weapon: 'spear' }, { pace: 2 });
  }
  assert.deepEqual(await first, { status: 'applied' });
  assert.deepEqual(await second, { status: 'applied' });
  assert.equal(overlap, true);
  assert.equal(flows.size, 2);
  for (const flow of flows.values()) assert.equal(flow.emitted.pour, FLOWS.pour.n);
});
