// Drop recognition on the shapes DJ tunes actually take, and on the things that mustn't
// read as drops. Every track: 8 bars of groove, then the section under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, analyse, eventsNamed } from './lib/track.mjs';

const groove = (n, extra = {}) => Array.from({ length: n }, () => ({ ...extra }));
const repeat = (n, spec) => Array.from({ length: n }, (_, i) => (typeof spec === 'function' ? spec(i) : { ...spec }));
const describeEvents = (seen, track) =>
  seen.events
    .map((x) => `${x.e}${x.drop ? `(${x.drop})` : ''}@bar ${((x.t - track.barTime(0)) / track.bar).toFixed(2)}`)
    .join(', ');

function expectDrop(track, seen, bar, size) {
  const drops = eventsNamed(seen, 'drop');
  assert.equal(drops.length, 1, `drops: ${describeEvents(seen, track)}`);
  const at = track.barTime(bar);
  assert.ok(
    drops[0].t >= at - 0.02 && drops[0].t < at + 0.08,
    `drop ${((drops[0].t - at) * 1000).toFixed(0)} ms from the bar line (${describeEvents(seen, track)})`,
  );
  if (size) assert.equal(drops[0].drop, size);
}

test('a build that keeps the kick: a high-passed roll speeding up under a riser, the bass cut [slow]', () => {
  const bars = [
    ...groove(8),
    ...repeat(4, (i) => ({ kick: 1, thin: true, bass: false, hats: true, riser: 0.2 + i * 0.1 })),
    ...repeat(2, (i) => ({ kick: 2, thin: true, bass: false, hats: true, riser: 0.6 + i * 0.15, roll: 8 })),
    ...repeat(2, () => ({ kick: 4, thin: true, bass: false, hats: false, riser: 1, roll: 16 })),
    ...groove(8),
  ];
  const track = buildTrack(bars);
  const seen = analyse(track.audio);
  assert.ok(eventsNamed(seen, 'build').length >= 1, `no build seen: ${describeEvents(seen, track)}`);
  expectDrop(track, seen, 16, 'big');
});

test('a breakdown that keeps a sub-bass pad [slow]', () => {
  const bars = [...groove(8), ...repeat(8, { kick: 0, bass: false, hats: false, pad: true, sub: true }), ...groove(8)];
  const track = buildTrack(bars);
  const seen = analyse(track.audio);
  expectDrop(track, seen, 16, 'big');
});

test('a silence gap on the beat before the drop [slow]', () => {
  const bars = [
    ...groove(8),
    ...repeat(8, (i) => ({
      kick: 0,
      bass: false,
      hats: false,
      pad: true,
      riser: i >= 4 ? (i - 3) / 4 : 0,
      gapLastBeat: i === 7,
    })),
    ...groove(8),
  ];
  const track = buildTrack(bars);
  const seen = analyse(track.audio);
  expectDrop(track, seen, 16, 'big');
});

test('the classic: bass and kick cut for 8 bars, a pad and riser, then everything [slow]', () => {
  const bars = [
    ...groove(8),
    ...repeat(8, (i) => ({ kick: 0, bass: false, hats: false, pad: true, riser: i >= 4 ? (i - 3) / 4 : 0 })),
    ...groove(8),
  ];
  for (const gain of [1, 10 ** (-24 / 20)]) {
    const track = buildTrack(bars, { gain });
    expectDrop(track, analyse(track.audio), 16, 'big');
  }
});

test('a short cut (2 bars) comes back as a small drop at most', () => {
  const bars = [...groove(8), ...repeat(2, { kick: 0, bass: false, hats: true }), ...groove(6)];
  const track = buildTrack(bars);
  const seen = analyse(track.audio);
  for (const d of eventsNamed(seen, 'drop')) assert.equal(d.drop, 'small', describeEvents(seen, track));
});

test('fills and a one-bar kill are not drops', () => {
  const bars = groove(16).map((b, i) => (i === 5 ? { kick: 0 } : i === 11 ? { kick: 0, bass: false } : b));
  const track = buildTrack(bars);
  const seen = analyse(track.audio);
  assert.equal(eventsNamed(seen, 'drop').length, 0, describeEvents(seen, track));
  assert.equal(eventsNamed(seen, 'breakdown').length, 0, describeEvents(seen, track));
});

test('a groove fading in is not a drop', () => {
  const bars = groove(16).map((b, i) => ({ ...b, gain: 10 ** ((-30 + Math.min(30, i * 4)) / 20) }));
  const track = buildTrack(bars);
  const seen = analyse(track.audio);
  assert.equal(eventsNamed(seen, 'drop').length, 0, describeEvents(seen, track));
});

test('a steady groove at 140 and at 174 BPM: no sections at all [slow]', () => {
  for (const bpm of [140, 174]) {
    const track = buildTrack(groove(24), { bpm });
    const seen = analyse(track.audio);
    assert.deepEqual(
      [...new Set(seen.events.map((x) => x.e))],
      ['start', 'silence'],
      `${bpm}: ${describeEvents(seen, track)}`,
    );
  }
});

test('a lone boom in a breakdown is not the drop', () => {
  const bars = [
    ...groove(8),
    ...repeat(8, (i) => ({
      kick: 0,
      bass: false,
      hats: false,
      pad: true,
      riser: i >= 4 ? (i - 3) / 4 : 0,
      boom: i === 3,
    })),
    ...groove(8),
  ];
  const track = buildTrack(bars);
  const seen = analyse(track.audio);
  expectDrop(track, seen, 16, 'big');
});

test('a drop into a half-time groove (kick on 1, snare on 3, a sustained sub)', () => {
  const half = (extra = {}) => ({ kick: 1, halfTime: true, bass: false, sub: true, ...extra });
  const bars = [
    ...repeat(8, half()),
    ...repeat(8, { kick: 0, bass: false, hats: false, pad: true, riser: 0.5 }),
    ...repeat(8, half()),
  ];
  const track = buildTrack(bars, { bpm: 140 });
  const seen = analyse(track.audio);
  expectDrop(track, seen, 16);
});
