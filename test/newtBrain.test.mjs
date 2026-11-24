// The real Live director drives NEWT's pure brain, body and speech on one controlled clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewtBrain } from '../src/visualizer/newt/newtBrain.js';
import { speechFrom, TRIGGERS } from '../src/invitation/speech.js';
import { newtShow } from './lib/newtShow.mjs';
import { WANDER_BOUNDS } from '../src/visualizer/newt/shots.js';

// Short fixture lines exercise speech triggers without an unrelated priority overlap.
const lines = Object.fromEntries(TRIGGERS.map((k) => [k, [k]]));
const speech = speechFrom(Object.fromEntries(TRIGGERS.map((k) => [k, { chance: 1, cooldown: 0 }])));
function performanceFor(t, settings = {}) {
  const performer = createNewtBrain({ lines, speech, seed: 87 });
  const frames = [];
  const show = newtShow(t, { ...settings, performer, onPicture: (p) => frames.push(structuredClone(p)) });
  return { ...show, performer, frames };
}
function held(s) {
  s.step({ state: 'breakdown', events: ['breakdown'] });
  assert.equal(s.duck.holding, true);
  s.advance(1, { state: 'build', build: 0.5 });
  s.advance(1, { state: 'build', build: 0.76 });
  s.advance(4, { state: 'build', build: 0.95 });
  assert.equal(s.performer.snapshot().state, 'held');
}
const presses = (s) => s.frames.map((p) => p.button).filter(Boolean);
const gestures = (s, type) => s.frames.filter((p) => p.events.some((e) => e.type === type));

test('NEWT wanders on grounded feet for a minute without a show press', (t) => {
  const s = performanceFor(t, { autoDrops: false });
  s.advance(60);
  assert.deepEqual(presses(s), []);
  const roots = s.frames.map((p) => p.newt.root);
  assert.ok(roots.every((p) => p.y === 0 && Math.hypot(p.x, p.z) <= 2.001));
  assert.ok(roots.some((p) => Math.hypot(p.x, p.z) > 0.4));
  assert.ok(s.frames.some((p) => p.newt.state === 'walk'));
  assert.ok(
    ['idle', 'walk'].includes(s.performer.snapshot().state),
    'still standing in the groove after sixty seconds',
  );
});

test('build fallback presses Sit and Run once despite dips and waits out flee before pickedUp', (t) => {
  const s = performanceFor(t, { stages: false });
  s.step({ state: 'breakdown', events: ['breakdown'] });
  s.advance(2, { state: 'build', build: 0.5 });
  s.step({ state: 'build', events: ['build'], build: 0.5 });
  s.advance(0.2, { state: 'build', build: 0.2 });
  s.advance(0.2, { state: 'build', build: 0.5 });
  s.advance(0.2, { state: 'build', build: 0.76 });
  s.advance(0.2, { state: 'build', build: 0.2 });
  s.advance(0.2, { state: 'build', build: 0.95 });
  assert.equal(gestures(s, 'grab').length, 0);
  s.advance(4, { state: 'build', build: 0.95 });
  assert.deepEqual(presses(s), ['Sit', 'Sit', 'Run']);
  assert.equal(gestures(s, 'grab').length, 1);
  const flee = s.frames.findIndex((p) => p.newt.state === 'flee');
  const ended = s.frames.findIndex((p, i) => i > flee && p.newt.state !== 'flee');
  assert.ok(
    s.frames[ended + 1].events.some((e) => e.type === 'grab'),
    'grab is the first frame observing flee has ended',
  );
  const said = s.frames.map((p) => p.newt.talk.trigger).filter(Boolean);
  assert.ok(said.includes('pickedUp'));
  assert.ok(!said.includes('caught'));
});

test('Blackout keeps the carry until the actual 90 ms strike and never spooks the held drop', (t) => {
  const s = performanceFor(t);
  held(s);
  s.step({ events: ['drop'], drop: 'big' });
  assert.equal(s.performer.snapshot().state, 'held');
  s.advance(0.075);
  assert.equal(gestures(s, 'release').length, 0);
  s.advance(0.025);
  assert.equal(gestures(s, 'release').length, 1);
  assert.equal(presses(s).filter((p) => p === 'Spook').length, 0);
  s.advance(3);
  assert.equal(s.performer.snapshot().grounded, true);
});

for (const end of ['return', 'silence', 'instant'])
  test(`${end} cancels a carry and lands NEWT`, (t) => {
    const s = performanceFor(t);
    held(s);
    if (end === 'instant') s.duck.equip('longsword', 'ember', { instant: true });
    else s.step({ state: end === 'silence' ? 'silent' : 'groove', events: [end] });
    if (end === 'return') s.step({ beats: [{ beat: 0, time: 0 }] });
    s.advance(4, { state: end === 'silence' ? 'silent' : 'groove' });
    assert.equal(gestures(s, 'release').length, 1);
    assert.equal(s.performer.snapshot().grounded, true);
  });

for (const reduced of [false, true])
  test(`letter approach and lift preserve a stable collar anchor (reduced=${reduced})`, (t) => {
    const s = performanceFor(t, { reduced, stages: false });
    s.performer.body.root.x = 0.8;
    s.performer.body.body.x = 0.8;
    held(s);
    const index = s.frames.findIndex((p) => p.events.some((e) => e.type === 'grab'));
    const first = s.frames[index];
    assert.ok(
      Math.hypot(
        first.newt.root.x - s.frames[index - 1].newt.root.x,
        first.newt.root.z - s.frames[index - 1].newt.root.z,
      ) < 0.1,
      'grab preserves the previous floor position',
    );
    const start = first.newt.root;
    const approach = s.frames[index + 60];
    const letter = approach.letters.find((l) => l.kind === 'held');
    assert.ok(Math.hypot(letter.x - start.x, letter.z - start.z) < 0.1);
    assert.ok(Math.hypot(approach.newt.root.x - start.x, approach.newt.root.z - start.z) < 0.1);
    const lifted = s.frames[index + 120];
    assert.ok(Math.abs(lifted.newt.root.y - s.frames[index - 1].newt.root.y - 0.6) < 0.03, 'lift rises 0.6 m');
    if (reduced) assert.ok(Math.abs(first.newt.root.y - lifted.newt.root.y) < 0.03, 'reduced lift is immediate');
    assert.ok(lifted.letters.find((l) => l.kind === 'held').y - 0.38 > lifted.newt.root.y + 1);
    s.step({ events: ['drop'], drop: 'big' });
    s.advance(0.15);
    const release = gestures(s, 'release')[0];
    assert.deepEqual(release.released, reduced ? { x: 0, y: 0, z: 0 } : { x: 0.4, y: 1.2, z: 0 });
    if (reduced) {
      const from = release.newt.root;
      s.advance(0.25);
      const falling = s.frames.slice(s.frames.indexOf(release));
      assert.ok(
        falling.every((p) => p.newt.root.y <= from.y + 0.001),
        'no upward release arc',
      );
      assert.ok(
        falling.every((p) => Math.hypot(p.newt.root.x - from.x, p.newt.root.z - from.z) < 0.01),
        'no lateral toss',
      );
    }
  });

test('start taps the centre and waves on the start letter fading edge', (t) => {
  const s = performanceFor(t, { autoDrops: false });
  const first = s.step({ events: ['start'], locked: false });
  assert.deepEqual(first.events.find((e) => e.type === 'tap')?.floor, { x: 0, z: 0 });
  s.advance(7, { locked: false });
  const edge = s.frames.findIndex((p) => p.letters.some((l) => l.kind === 'start' && l.state === 'fading'));
  assert.ok(edge > 0);
  assert.equal(s.frames[edge].button, 'Wave');
  assert.equal(presses(s).filter((p) => p === 'Wave').length, 1);
});

test('unheld big strikes spook once at the delayed strike; small drops tap once', (t) => {
  const s = performanceFor(t, { autoDrops: false });
  s.step({ state: 'breakdown', events: ['breakdown'] });
  assert.ok(!presses(s).includes('Sit'));
  // Arm is off, but unheld big drops still use the director strike when Auto Drops is enabled.
  s.settings.autoDrops = true;
  s.advance(1, { state: 'build', build: 0.5 });
  const before = s.frames.length;
  s.step({ events: ['drop'], drop: 'big' });
  assert.equal(s.frames.at(-1).button, null);
  s.advance(0.075);
  assert.ok(!presses(s).includes('Spook'));
  s.advance(0.025);
  assert.equal(presses(s).filter((p) => p === 'Spook').length, 1);
  assert.ok(s.frames.findIndex((p) => p.button === 'Spook') >= before + 10);
  s.advance(4);
  const taps = gestures(s, 'tap').length;
  s.step({ events: ['drop'], drop: 'small' });
  assert.equal(gestures(s, 'tap').length, taps + 1);
});

test('a strike before flee ends never grabs or releases NEWT', (t) => {
  const s = performanceFor(t);
  s.step({ state: 'breakdown', events: ['breakdown'] });
  s.advance(1, { state: 'build', build: 0.5 });
  s.advance(0.2, { state: 'build', build: 0.76 });
  s.advance(0.2, { state: 'build', build: 0.95 });
  s.step({ events: ['drop'], drop: 'big' });
  s.advance(5);
  assert.equal(gestures(s, 'grab').length, 0);
  assert.equal(gestures(s, 'release').length, 0);
  assert.ok(!presses(s).includes('Spook'), 'held letter strike is not an unheld drop');
});

test('long locked breakdown requests Device once after eight bars', (t) => {
  const s = performanceFor(t, { autoDrops: false });
  s.step({ state: 'breakdown', events: ['breakdown'], breakdownFor: 0 });
  s.advance(1, { state: 'breakdown', locked: false, breakdownFor: 40 });
  s.advance(1, { state: 'breakdown', breakdownFor: 15.9 });
  assert.ok(!presses(s).includes('Device'));
  s.advance(8, { state: 'breakdown', breakdownFor: 16 });
  assert.equal(presses(s).filter((p) => p === 'Device').length, 1);
  assert.equal(s.performer.snapshot().state, 'deviceSit');
});

test('silence asks for Device twice, waits for its line, and stays lying', (t) => {
  const s = performanceFor(t, { autoDrops: false });
  s.step();
  s.step({ state: 'silent', events: ['silence'] });
  s.advance(15, { state: 'silent' });
  const deviceFrames = s.frames.map((p, i) => (p.button === 'Device' ? i : -1)).filter((i) => i >= 0);
  assert.equal(deviceFrames.length, 2);
  assert.ok(deviceFrames[1] - deviceFrames[0] > 120);
  assert.equal(s.frames[deviceFrames[1] - 1].newt.showing, false, 'second Device waits for the line to finish');
  assert.equal(s.performer.snapshot().state, 'deviceLie');
});

test('return only stands sitting states and never toggles standUp back down', (t) => {
  const s = performanceFor(t);
  s.step({ state: 'breakdown', events: ['breakdown'] });
  s.advance(2, { state: 'breakdown' });
  assert.equal(s.performer.snapshot().state, 'sit');
  assert.equal(s.step({ events: ['return'] }).button, 'Sit');
  assert.equal(s.performer.snapshot().state, 'standUp');
  assert.equal(s.step({ events: ['return'] }).button, null);
  s.advance(3);
  assert.notEqual(s.performer.snapshot().state, 'sit');
});

test('a released letter burns in place when another held letter arrives', (t) => {
  const s = performanceFor(t);
  held(s);
  const old = s.frames.at(-1).letters.find((l) => l.kind === 'held');
  s.duck.release();
  s.step();
  void s.duck.equip('spear', 'azure', { hold: true });
  s.advance(0.1);
  assert.equal(s.duck.holding, true);
  assert.ok(s.frames.at(-1).letters.some((l) => l.id !== old.id && l.kind === 'held'));
  const burning = s.frames.at(-1).letters.find((l) => l.id === old.id);
  assert.ok(burning, 'old letter still visible');
  assert.deepEqual({ x: burning.x, y: burning.y, z: burning.z }, { x: old.x, y: old.y, z: old.z });
});

test('a build jumping all thresholds stands and runs before its deferred grab', (t) => {
  const s = performanceFor(t, { stages: false });
  s.step({ state: 'breakdown', events: ['breakdown'] });
  s.advance(2, { state: 'breakdown' });
  assert.equal(s.performer.snapshot().state, 'sit');
  assert.equal(s.step({ state: 'build', events: ['build'], build: 0.95 }).button, 'Sit');
  assert.equal(gestures(s, 'grab').length, 0);
  assert.equal(s.step({ state: 'build', build: 0.95 }).button, 'Run');
  assert.equal(gestures(s, 'grab').length, 0);
  s.advance(3.5, { state: 'build', build: 0.95 });
  assert.equal(gestures(s, 'grab').length, 1);
  assert.deepEqual(presses(s), ['Sit', 'Sit', 'Run']);
});

test('NEWT movement uses the same wander disc as shot framing', (t) => {
  const saved = { ...WANDER_BOUNDS };
  try {
    Object.assign(WANDER_BOUNDS, { minX: -0.8, maxX: 0.8, minZ: -0.8, maxZ: 0.8, r: 0.8 });
    const s = performanceFor(t, { autoDrops: false });
    s.advance(60);
    const distances = s.frames.map((p) => Math.hypot(p.newt.root.x, p.newt.root.z));
    assert.ok(
      distances.some((d) => d > 0.1),
      'NEWT really walks within the shared disc',
    );
    assert.ok(
      distances.every((d) => d <= 0.801),
      `movement exceeded shot framing disc: ${Math.max(...distances)}`,
    );
  } finally {
    Object.assign(WANDER_BOUNDS, saved);
  }
});
