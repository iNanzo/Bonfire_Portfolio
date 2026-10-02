// Bonfire Live's frames: with Frame Rate capped, what the analyser hears on the frames the
// cap skips still reaches the director with the next drawn one (src/visualizer/tickBatch.js),
// and a clip being recorded copies at most 60 frames a second, without drifting, whatever the
// display's rate (record.js frameEvery).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTickBatch } from '../src/visualizer/tickBatch.js';
import { frameEvery } from '../src/visualizer/record.js';

test('Frame Rate’s batch: every beat and event heard between drawn frames reaches the next one, the strongest kick too', () => {
  const batch = createTickBatch();
  assert.equal(batch.take(), null, 'nothing heard yet');
  const tick = (o) => ({ beats: [], events: [], kick: 0, hat: 0, drop: null, level: 0.5, bands: { bass: 0 }, ...o });
  // Uncapped: one tick per frame, as it was.
  batch.add(tick({ beats: [{ beat: 0 }], kick: 0.7, level: 0.4 }));
  let f = batch.take();
  assert.deepEqual(f.beats, [{ beat: 0 }]);
  assert.equal(f.kick, 0.7);
  assert.equal(f.level, 0.4);
  // Capped at 30 on a 120 Hz display: four ticks a frame.
  batch.add(tick({ beats: [{ beat: 1 }], kick: 0.2 }));
  batch.add(tick({ events: ['drop'], drop: 'big', kick: 0.9 }));
  batch.add(tick({ hat: 0.6 }));
  batch.add(tick({ beats: [{ beat: 2 }], level: 0.8 }));
  f = batch.take();
  assert.deepEqual(
    f.beats.map((b) => b.beat),
    [1, 2],
    'both beats',
  );
  assert.deepEqual(f.events, ['drop'], 'the drop, though it came two ticks ago');
  assert.equal(f.drop, 'big', 'with its size');
  assert.equal(f.kick, 0.9);
  assert.equal(f.hat, 0.6);
  assert.equal(f.level, 0.8, 'the levels are the latest');
  // The next frame starts empty; what it was handed stays as it was while it's read.
  const handed = f.beats;
  batch.add(tick({}));
  const g = batch.take();
  assert.deepEqual([g.beats.length, g.events.length, g.kick, g.drop], [0, 0, 0, null]);
  assert.deepEqual(
    handed.map((b) => b.beat),
    [],
    'the lists are reused (nothing allocated frame to frame)',
  );
  batch.add(tick({ beats: [{ beat: 3 }] }));
  batch.clear();
  assert.equal(batch.take(), null, 'a new source: forgotten');
});

test('a clip copies at most 60 frames a second: 60 on a 144 Hz display, every frame at 60 Hz, none piled up after a stall', () => {
  const run = (hz, seconds, gate = frameEvery(60), from = 1000) => {
    let n = 0;
    for (let i = 0; i < hz * seconds; i++) if (gate(from + (i * 1000) / hz)) n++;
    return n;
  };
  assert.ok(Math.abs(run(144, 10) - 600) <= 2, `144 Hz: ${run(144, 10)} in 10 s`);
  assert.ok(Math.abs(run(120, 10) - 600) <= 2, `120 Hz: ${run(120, 10)}`);
  assert.equal(run(60, 10), 600, 'a 60 Hz display: every frame (its timestamps a hair early included)');
  assert.equal(run(30, 10), 300, 'slower than 60: every frame');
  const gate = frameEvery(60);
  assert.equal(gate(1000), true);
  assert.equal(gate(1005), false);
  assert.equal(gate(1016.2), true, 'a frame a moment early counts');
  assert.equal(gate(3000), true, 'after a stall');
  assert.equal(gate(3007), false, 'and no burst to catch up');
});
