import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewtMoments } from '../src/visualizer/newt/newtMoments.js';
const selection = { weapon: 'axe', flame: 'rose', element: 'fire' };
test('start waits for a downbeat or four unlocked seconds; silence seals an end letter', () => {
  const m = createNewtMoments();
  assert.equal(m.step({ t: 0, f: { events: ['start'] } }).letters[0].state, 'floating');
  assert.equal(m.step({ t: 3.9 }).letters[0].state, 'floating');
  assert.equal(m.step({ t: 4 }).letters[0].state, 'opening');
  const closing = m.step({ t: 5, f: { events: ['silence'] } });
  assert.ok(closing.petals.some((command) => command.kind === 'cut'));
  const end = closing.letters.at(-1);
  assert.equal(end.kind, 'end');
  assert.equal(end.pose.bloom, 0);
});
test('held build opens, strike burns once and changes page only on a big held drop', async () => {
  const hits = [];
  const m = createNewtMoments({ onImpact: (...a) => hits.push(a) });
  const done = m.equip(selection, { hold: true });
  const lifted = m.step({ t: 1, f: { build: 0.5 }, events: [{ type: 'stage', data: { stage: 2 } }] });
  assert.ok(lifted.letters[0].pose.push > 0);
  assert.equal(lifted.letters[0].pose.bloom, 0);
  const cracked = m.step({ t: 1.5, f: { build: 0.7 }, events: [{ type: 'stage', data: { stage: 3 } }] });
  assert.ok(cracked.letters[0].pose.bloom > 0);
  assert.equal(cracked.petals.filter((command) => command.kind === 'ring').length, 1);
  assert.equal(
    m
      .step({ t: 1.6, f: { build: 0.7 }, events: [{ type: 'stage', data: { stage: 3 } }] })
      .petals.filter((command) => command.kind === 'ring').length,
    0,
  );
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
test('return marks staged letters dismissed; release skips and impact waits until they are gone', async () => {
  for (const stage of [0, 2, 4]) {
    const hits = [],
      m = createNewtMoments({ onImpact: (...args) => hits.push(args) });
    const done = m.equip(selection, { hold: true });
    m.step({ t: 1, events: [{ type: 'stage', data: { stage } }] });
    m.step({ t: 2 });
    const returned = m.step({ t: 2.1, f: { events: ['return'] } });
    assert.equal(m.holding, true);
    assert.equal(returned.letters[0].state, stage === 4 ? 'waiting' : 'floating');
    assert.equal(hits.length, 0);
    assert.equal(m.release(), true);
    assert.equal(m.step({ t: 2.1 }).letters[0].state, 'skipped');
    m.step({ t: 2.54 });
    assert.equal(hits.length, 0);
    assert.equal(m.forging, true);
    assert.equal(m.step({ t: 2.55 }).letters.length, 0);
    assert.deepEqual(await done, { status: 'applied' });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].length, 4);
    assert.equal(m.forging, false);
    assert.equal(m.page, 'dusk');
  }
});

test('return and release on the same frame skip an opening letter; instant equip cancels a pending skip', async () => {
  const hits = [],
    m = createNewtMoments({ onImpact: (...args) => hits.push(args) });
  const skipped = m.equip(selection, { hold: true });
  m.step({ t: 1, events: [{ type: 'stage', data: { stage: 2 } }] });
  m.release();
  assert.equal(m.step({ t: 1, f: { events: ['return'] } }).letters[0].state, 'skipped');
  assert.equal(hits.length, 0);
  await m.equip({ ...selection, weapon: 'spear' }, { instant: true });
  assert.deepEqual(await skipped, { status: 'cancelled' });
  m.step({ t: 2 });
  assert.equal(hits.length, 1);
  assert.equal(m.equipment.weapon, 'spear');
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

test('the page burn blends every palette channel in linear light and clamps its endpoints', async () => {
  const { blendPages, PAGES } = await import('../src/visualizer/newt/pages.js');
  const { Color } = await import('three');
  for (const [from, to] of [
    ['white', 'night'],
    ['dusk', 'cream'],
  ]) {
    const a = PAGES[from],
      b = PAGES[to];
    for (const k of [0, 0.25, 0.5, 1]) {
      const blended = blendPages(from, to, k);
      const expected = (x, y) => new Color(x).lerp(new Color(y), k).getHex();
      assert.equal(blended.color, expected(a.color, b.color));
      assert.equal(blended.ink, expected(a.ink, b.ink));
      assert.deepEqual(
        blended.palette,
        a.palette.map((c, i) => expected(c, b.palette[i])),
      );
      assert.deepEqual(
        blended.tones,
        a.tones.map((c, i) => expected(c, b.tones[i])),
      );
    }
    assert.equal(blendPages(from, to, -1).color, a.color);
    assert.equal(blendPages(from, to, 2).color, b.color);
  }
});

test('an end letter is reused at start; explicit Page changes cancel an in-progress turn', async () => {
  const m = createNewtMoments();
  const end = m.step({ t: 0, f: { events: ['silence'] } }).letters[0];
  const start = m.step({ t: 1, f: { events: ['start'] } }).letters;
  assert.equal(start.length, 1);
  assert.equal(start[0].id, end.id);
  assert.equal(start[0].kind, 'start');
  const done = m.equip(selection, { hold: true });
  m.step({ t: 2, events: [{ type: 'stage', data: { stage: 4 } }] });
  m.release();
  assert.ok(m.step({ t: 3, f: { events: ['drop'], drop: 'big' } }).page);
  assert.deepEqual(await done, { status: 'applied' });
  m.setPage('cream');
  assert.equal(m.page, 'cream');
  assert.equal(m.step({ t: 3.1 }).page, null);
  m.setPage('invalid');
  assert.equal(m.page, 'dusk');
  m.dispose();
  assert.equal(m.step({ t: 4 }).letters.length, 0);
});

test('held letters bob on the beat grid; reduced motion lifts and cracks nothing', () => {
  for (const reduced of [false, true]) {
    const m = createNewtMoments({ reduced });
    void m.equip(selection, { hold: true });
    m.step({ t: 1, f: { time: 100, locked: true, bpm: 120, beats: [{ time: 100, beat: 0 }] } });
    const view = m.step({
      t: 1.125,
      f: { time: 100.125, locked: true, bpm: 120, build: 0.7 },
      events: [{ type: 'stage', data: { stage: 3 } }],
    }).letters[0];
    assert.ok(Math.abs(view.pose.bob - (reduced ? 0 : 0.03)) < 1e-12);
    if (reduced) {
      assert.equal(view.pose.push, 0);
      assert.equal(view.pose.bloom, 0);
    }
    m.dispose();
  }
});

import { newtShow } from './lib/newtShow.mjs';

test('director blackout preserves the held big drop until its strike and turns once', (t) => {
  const show = newtShow(t);
  show.step({ state: 'breakdown', events: ['breakdown'] });
  assert.equal(show.duck.holding, true);
  for (const build of [0.5, 0.75, 0.95]) show.advance(1, { state: 'build', build });
  show.step({ events: ['drop'], drop: 'big' });
  assert.equal(show.duck.holding, true);
  assert.equal(show.duck.snapshot().page.name, 'Dusk');
  show.advance(0.2);
  assert.equal(show.duck.holding, false);
  assert.equal(show.duck.snapshot().page.name, 'Night');
  show.advance(2);
  assert.equal(show.duck.snapshot().page.name, 'Night');
  assert.equal(show.impacts.length, 1);
});

for (const [name, overrides, drop, held] of [
  ['small held drop', {}, 'small', true],
  ['page turns off', { pageTurns: 'off' }, 'big', true],
  ['un-held big drop', {}, 'big', false],
])
  test(`director ${name} does not turn the page`, (t) => {
    const show = newtShow(t, overrides);
    if (held) {
      show.step({ state: 'breakdown', events: ['breakdown'] });
      show.advance(2, { state: 'build', build: 0.95 });
    }
    show.step({ events: ['drop'], drop });
    show.advance(2);
    assert.equal(show.duck.snapshot().page.name, 'Dusk');
    if (!held) assert.equal(show.duck.moments.letters.length, 0);
  });

for (const reduced of [false, true])
  test(`director phrase lands on its planned beat (reduced=${reduced})`, (t) => {
    const show = newtShow(t, { reduced, phraseBars: 4 });
    const targets = [],
      equip = show.duck.equip;
    show.duck.equip = (weapon, flame, options = {}) => {
      if (options.pace) {
        // This fixture stays inside forgeIn's pace limits, so its duration ends on the requested beat.
        assert.ok(options.pace > 0.55 && options.pace < 1.8, 'target beat is not pace-clamped');
        targets.push(show.time + show.duck.swapTime / options.pace);
      }
      return equip(weapon, flame, options);
    };
    for (let count = 0; count <= 40; count++) {
      const time = show.time + 1 / 120;
      show.step({ beats: [{ time, count, beat: count % 4, bar: Math.floor(count / 4) + 1, strength: 0.7 }] });
      show.advance(0.5 - 1 / 120);
    }
    assert.ok(show.impacts.length > 0);
    show.advance(3);
    assert.equal(show.impacts.length, targets.length, 'each requested forge impacts once');
    for (const [{ time }, target] of show.impacts.map((impact, i) => [impact, targets[i]]))
      assert.ok(Math.abs(time - target) <= 1 / 120 + 1e-9, `impact at ${time}, target beat ${target}`);
  });

test('director held forge rejects a second equip without another letter', async (t) => {
  const show = newtShow(t);
  show.step({ state: 'breakdown', events: ['breakdown'] });
  const before = show.duck.moments.letters.length;
  const result = await show.duck.equip(show.duck.weapon === 'axe' ? 'spear' : 'axe', 'ember');
  show.step({ state: 'breakdown' });
  assert.deepEqual(result, { status: 'cancelled' });
  assert.equal(show.duck.moments.letters.length, before);
});

test('a later un-held drop cannot turn an already released letter', (t) => {
  const show = newtShow(t, { blackout: 'off' });
  show.step({ state: 'breakdown', events: ['breakdown'] });
  show.advance(1, { state: 'build', build: 0.3 });
  show.duck.release();
  show.step({ state: 'build', build: 0.3 });
  show.step({ events: ['drop'], drop: 'big' });
  show.advance(2);
  assert.equal(show.duck.snapshot().page.name, 'Dusk');
});

test('director release on the drop frame still latches a big drop without Blackout', (t) => {
  const show = newtShow(t, { blackout: 'off' });
  show.step({ state: 'breakdown', events: ['breakdown'] });
  show.advance(1, { state: 'build', build: 0.5 });
  show.step({ events: ['drop'], drop: 'big' });
  show.advance(2);
  assert.equal(show.duck.snapshot().page.name, 'Night');
});
