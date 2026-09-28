// The visualizer's beat tracker, fed synthetic onset envelopes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempoTracker, estimateTempo, RATE } from '../src/visualizer/tempo.js';

// A seeded random, so failures reproduce.
function rng(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * Onset strength at time t for a pattern: kicks on every beat (4-on-the-floor), optional
 * off-beat hats (weaker), and noise. Returns a function of time.
 */
function pattern({ bpm, offset = 0.13, hats = 0.35, noise = 0.08, kickEvery = 1, seed = 3 }) {
  const period = 60 / bpm;
  const r = rng(seed);
  return (t) => {
    const u = (t - offset) / period;
    const k = u - Math.floor(u);
    const beat = Math.floor(u);
    let v = 0;
    if (beat % kickEvery === 0) v += Math.exp(-(k * period) / 0.025) * (t >= offset ? 1 : 0);
    const h = u - 0.5 - Math.floor(u - 0.5);
    v += hats * Math.exp(-(h * period) / 0.015);
    return v + noise * r();
  };
}

/** Run the tracker over `seconds` at a jittery ~60 fps; returns the beats it emitted. */
function run(tracker, onset, seconds, { start = 0, fps = 60, seed = 7 } = {}) {
  const r = rng(seed);
  const beats = [];
  for (let t = start; t < start + seconds; t += (1 / fps) * (0.7 + 0.6 * r())) {
    tracker.push(t, onset(t));
    tracker.estimate(t, { detectDelay: 0 });
    beats.push(...tracker.tick(t));
  }
  return beats;
}

const nearestErr = (time, bpm, offset) => {
  const p = 60 / bpm;
  const u = (time - offset) / p;
  return (u - Math.round(u)) * p;
};

for (const bpm of [100, 124, 128, 140, 174]) {
  test(`locks onto ${bpm} BPM and its phase`, () => {
    const tr = createTempoTracker();
    const beats = run(tr, pattern({ bpm }), 14);
    // An octave is a fair reading of the same beat, but it should prefer the one near 125.
    const got = tr.bpm;
    const ratio = got / bpm;
    const octave = [0.5, 1, 2].find((m) => Math.abs(ratio / m - 1) < 0.015);
    assert.ok(octave, `tempo ${got.toFixed(2)} vs ${bpm}`);
    if (bpm >= 90 && bpm <= 150) assert.equal(octave, 1, `expected ${bpm}, got ${got.toFixed(2)}`);
    // The last few seconds of beats land on the kicks.
    const late = beats.filter((b) => b.time > 10);
    assert.ok(late.length >= 4);
    const kickPeriod = 60 / bpm;
    for (const b of late) {
      const err = Math.abs(nearestErr(b.time, 60 / (kickPeriod * Math.max(1, 1 / octave)), 0.13));
      assert.ok(err < 0.025, `beat ${b.time.toFixed(3)} is ${(err * 1000).toFixed(0)} ms off`);
    }
  });
}

test('beats come evenly, one per period, counting up', () => {
  const tr = createTempoTracker();
  const beats = run(tr, pattern({ bpm: 128 }), 16).filter((b) => b.time > 8);
  for (let i = 1; i < beats.length; i++) {
    assert.equal(beats[i].count, beats[i - 1].count + 1);
    const gap = beats[i].time - beats[i - 1].time;
    assert.ok(Math.abs(gap - 60 / 128) < 0.02, `gap ${gap}`);
  }
});

test('follows a tempo change', () => {
  const tr = createTempoTracker();
  run(tr, pattern({ bpm: 122 }), 12);
  assert.ok(Math.abs(tr.bpm - 122) < 1.5, `before: ${tr.bpm}`);
  run(tr, pattern({ bpm: 128, offset: 12.05 }), 12, { start: 12 });
  assert.ok(Math.abs(tr.bpm - 128) < 1.5, `after: ${tr.bpm}`);
});

test('no tempo from noise', () => {
  const tr = createTempoTracker();
  const r = rng(11);
  run(tr, () => 0.3 * r(), 12);
  assert.ok(tr.strength < 0.2, `strength ${tr.strength}`);
});

test('the lead makes beats arrive early', () => {
  const tr = createTempoTracker();
  const onset = pattern({ bpm: 125 });
  const r = rng(5);
  const beats = [];
  for (let t = 0; t < 14; t += (1 / 60) * (0.7 + 0.6 * r())) {
    tr.push(t, onset(t));
    tr.estimate(t, { detectDelay: 0 });
    for (const b of tr.tick(t, { lead: 0.06 })) beats.push({ ...b, emittedAt: t });
  }
  const late = beats.filter((b) => b.time > 10);
  for (const b of late) assert.ok(b.time - b.emittedAt > 0.03, `emitted ${(b.time - b.emittedAt).toFixed(3)} s early`);
});

test('anchor makes the next beat a downbeat', () => {
  const tr = createTempoTracker();
  const onset = pattern({ bpm: 128 });
  let beats = run(tr, onset, 10);
  const last = beats.at(-1);
  tr.anchor(last.time);
  beats = run(tr, onset, 3, { start: 10 });
  // The anchored beat was count 0, so the next ones are 1, 2, 3, then a downbeat.
  assert.equal(beats[0].count % 4, 1);
  assert.equal(beats.find((b) => b.count % 4 === 0).count, beats[0].count + 3);
});

test('an anchor set before the tempo is known counts from its own time', () => {
  const tr = createTempoTracker();
  const onset = pattern({ bpm: 128, offset: 0.13 });
  tr.anchor(0.13 + (60 / 128) * 2); // the music "starts" on the third kick: that's beat 1
  const beats = run(tr, onset, 12).filter((b) => b.time > 6);
  for (const b of beats) {
    const n = Math.round((b.time - 0.13) / (60 / 128)) - 2;
    assert.equal(b.beat, ((n % 4) + 4) % 4, `beat at ${b.time.toFixed(2)}`);
  }
});

test('tap tempo sets tempo and makes the first tap a downbeat', () => {
  const tr = createTempoTracker();
  const p = 60 / 120;
  let bpm = null;
  for (let i = 0; i < 4; i++) bpm = tr.tap(1 + i * p);
  assert.ok(Math.abs(bpm - 120) < 0.01);
  const beats = tr.tick(1 + 3 * p + 0.001);
  assert.equal(beats[0].count, 3); // the 4th tap is beat 4 of the bar
  const next = tr.tick(1 + 4 * p + 0.001);
  assert.equal(next[0].beat, 0);
});

test('estimateTempo prefers the beat over its double and half', () => {
  const n = RATE * 8;
  const x = new Float32Array(n);
  const L = (60 * RATE) / 126;
  for (let k = 0; k * L < n; k++) x[Math.round(k * L)] = 1;
  const est = estimateTempo(x);
  assert.ok(Math.abs(60 / est.period - 126) < 1.2, `${60 / est.period}`);
  assert.ok(est.strength > 0.3);
});

test('manual tempo, phase nudges and an outside beat (Link) own the grid', async () => {
  const { createTempoTracker } = await import('../src/visualizer/tempo.js');
  const t = createTempoTracker();
  // A typed-in 128 BPM: beats every 60/128 s from the first.
  t.setManual(128, 10);
  let beats = [];
  for (let now = 10; now < 14; now += 1 / 60) { t.push(now, 0); beats.push(...t.tick(now)); }
  const gaps = beats.slice(1).map((b, i) => b.time - beats[i].time);
  assert.ok(gaps.every((g) => Math.abs(g - 60 / 128) < 1e-6), 'steady at the typed tempo');
  assert.equal(t.manual, 'manual');
  // A nudge moves the next beats later by exactly that much.
  const last = beats.at(-1).time;
  t.nudge(0.02);
  beats = [];
  for (let now = 14; now < 15; now += 1 / 60) beats.push(...t.tick(now));
  assert.ok(Math.abs(beats[0].time - (last + 60 / 128 + 0.02)) < 1e-6, 'nudged later');
  t.clearManual();
  assert.equal(t.manual, null);

  // Link: 120 BPM, the session at beat 7.5 at t = 20 → the next beat (8, a downbeat) at 20.25.
  const l = createTempoTracker();
  l.push(20, 0);
  l.external(120, 7.5, 20);
  const next = l.tick(20.3);
  assert.equal(next.length, 1);
  assert.ok(Math.abs(next[0].time - 20.25) < 1e-6, `on the session's beat (${next[0].time})`);
  assert.equal(next[0].beat, 0, 'beat 8 is a downbeat');
  assert.equal(l.manual, 'link');
  l.push(23, 0);
  assert.equal(l.manual, null, 'a silent bridge lets go after 2 s');
});
