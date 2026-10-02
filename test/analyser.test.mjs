// The visualizer's analysis, end to end on synthesized audio: a spectrum computed the
// way an AnalyserNode does it (Blackman window, |X|/N, dB), frames at a jittery 60 fps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeatures } from '../src/visualizer/analyser.js';

const SR = 44100;
const N = 2048;
const BPM = 126;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LEAD_IN = 1; // seconds of silence first
// Sections in bars: groove, breakdown (no kick or bass), drop.
const GROOVE = [0, 8];
const BREAKDOWN = [8, 16];
const DROP = [16, 24];
const END = LEAD_IN + DROP[1] * BAR;

function rng(seed = 9) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed / 4294967296) * 2 - 1;
  };
}

/** A DJ-tune-shaped track: kick, hats, offbeat bass; a pad and riser in the breakdown. */
function synthesize(gain = 1) {
  const out = new Float32Array(Math.ceil((END + 3) * SR));
  const noise = rng();
  const add = (start, len, fn) => {
    const s0 = Math.round(start * SR);
    for (let i = 0; i < len * SR && s0 + i < out.length; i++) out[s0 + i] += fn(i / SR) * gain;
  };
  const kick = (t0) => {
    let phase = 0;
    add(t0, 0.35, (t) => {
      const f = 46 + 114 * Math.exp(-t / 0.035);
      phase += (2 * Math.PI * f) / SR;
      return 0.9 * Math.sin(phase) * Math.exp(-t / 0.12);
    });
  };
  const hat = (t0) => {
    let prev = 0;
    add(t0, 0.06, (t) => {
      const n = noise();
      const hp = n - prev;
      prev = n;
      return 0.18 * hp * Math.exp(-t / 0.018);
    });
  };
  const clap = (t0) => {
    let a = 0,
      b = 0;
    add(t0, 0.12, (t) => {
      const n = noise();
      a += (n - a) * 0.3;
      b += (a - b) * 0.3;
      return 0.35 * (a - b) * Math.exp(-t / 0.03);
    });
  };
  const bass = (t0) => {
    let lp = 0;
    add(t0, 0.22, (t) => {
      const saw = ((t * 55) % 1) * 2 - 1;
      lp += (saw - lp) * 0.04;
      return 0.5 * lp * Math.exp(-t / 0.09);
    });
  };
  for (let bar = 0; bar < DROP[1]; bar++) {
    const barT = LEAD_IN + bar * BAR;
    const breakdown = bar >= BREAKDOWN[0] && bar < BREAKDOWN[1];
    for (let b = 0; b < 4; b++) {
      const t = barT + b * BEAT;
      if (!breakdown) {
        kick(t);
        hat(t + BEAT / 2);
        bass(t + BEAT / 2);
      }
    }
    if (breakdown) {
      // Pad: a chord, and a riser climbing in the last half.
      const into = bar - BREAKDOWN[0];
      const chord = (t) =>
        0.05 *
        (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t));
      add(barT, BAR, (t) => chord(barT + t)); // continuous phase: no click at each bar line
      // A snare roll into the drop: 8ths, then 16ths. (On every 8th, the beat's phase is
      // ambiguous: the grid mustn't slip onto the off-beats.)
      if (into >= 6) for (let i = 0; i < (into === 7 ? 16 : 8); i++) clap(barT + (i * BAR) / (into === 7 ? 16 : 8));
      if (into >= 4) {
        let prev = 0;
        add(barT, BAR, (t) => {
          const n = noise();
          const hp = n - prev;
          prev = n;
          return (hp * 0.05 * (into - 4 + t / BAR)) / 4;
        });
      }
    }
  }
  return out;
}

// Iterative radix-2 FFT (in place, re/im).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k),
          wi = Math.sin(ang * k);
        const a = i + k,
          b = i + k + len / 2;
        const xr = re[b] * wr - im[b] * wi,
          xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}
const blackman = Float64Array.from(
  { length: N },
  (_, n) => 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / N) + 0.08 * Math.cos((4 * Math.PI * n) / N),
);

/** Run the analysis over `audio` at a jittery ~60 fps; returns what it saw. */
function analyse(audio, opts = {}) {
  const f = createFeatures({ sampleRate: SR, fftSize: N });
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const r = rng(4);
  const seen = { events: [], beats: [], kicks: [], hats: 0, bpmAt: [] };
  let last = 0;
  for (let t = 0.05; t < audio.length / SR; t += (1 / 60) * (1 + 0.3 * r())) {
    const end = Math.floor(t * SR);
    for (let i = 0; i < N; i++) {
      const s = audio[end - N + i] ?? 0;
      f.wave[i] = s;
      re[i] = s * blackman[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) f.db[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) / N);
    const out = f.process(t, t - last, opts);
    last = t;
    for (const e of out.events) seen.events.push({ e, t });
    for (const b of out.beats) seen.beats.push({ ...b, locked: out.locked });
    if (out.kick) seen.kicks.push(t);
    if (out.hat) seen.hats++;
    seen.bpmAt.push({ t, bpm: out.bpm, locked: out.locked, state: out.state });
  }
  return seen;
}

const barTime = (bar) => LEAD_IN + bar * BAR;

for (const [label, gain] of [
  ['a hot master', 1],
  ['a quiet line in (-24 dB)', 10 ** (-24 / 20)],
]) {
  test(`sections, tempo and beats on ${label} [slow]`, () => {
    const seen = analyse(synthesize(gain));
    const at = (name) => seen.events.filter((x) => x.e === name).map((x) => x.t);

    // The music starts, breaks down once, drops once, and stops.
    const [start] = at('start');
    assert.ok(Math.abs(start - LEAD_IN) < 0.3, `start at ${start}`);
    assert.equal(at('breakdown').length, 1, `breakdowns: ${at('breakdown')}`);
    const breakdown = at('breakdown')[0];
    assert.ok(
      breakdown > barTime(BREAKDOWN[0]) + 1.5 && breakdown < barTime(BREAKDOWN[0]) + 4,
      `breakdown at ${breakdown}, section at ${barTime(BREAKDOWN[0])}`,
    );
    assert.equal(at('drop').length, 1, `drops: ${at('drop')}`);
    const drop = at('drop')[0];
    assert.ok(
      drop >= barTime(DROP[0]) && drop < barTime(DROP[0]) + 0.08,
      `drop at ${drop}, the bass is back at ${barTime(DROP[0])}`,
    );
    assert.ok(at('silence').length === 1 && at('silence')[0] > END, 'silence after the end');

    // Tempo: locked on 126 within a couple of bars, and through the drop.
    const locked = seen.bpmAt.find((x) => x.locked && Math.abs(x.bpm - BPM) < 1);
    assert.ok(locked && locked.t < LEAD_IN + 2 * BAR, `locked at ${locked?.t}`);
    const late = seen.bpmAt.filter((x) => x.t > barTime(DROP[0] + 2) && x.t < END);
    assert.ok(
      late.every((x) => Math.abs(x.bpm - BPM) < 1.5),
      'still 126 after the drop',
    );

    // The bar counts from where the music started (the demo, like most tunes, starts on beat 1).
    const downbeats = seen.beats.filter((b) => b.beat === 0 && b.time > barTime(1) && b.time < barTime(GROOVE[1]));
    assert.ok(downbeats.length >= 5);
    for (const b of downbeats)
      assert.ok(
        Math.abs((b.time - LEAD_IN) / BAR - Math.round((b.time - LEAD_IN) / BAR)) < 0.05,
        `downbeat at ${b.time.toFixed(3)}`,
      );

    // Beats land on the kicks, and the drop's beat is a downbeat (it anchors the bar).
    const kicksOnBeats = seen.beats
      .filter((b) => b.time > barTime(2) && b.time < barTime(GROOVE[1]))
      .map((b) => {
        const u = (b.time - LEAD_IN) / BEAT;
        return (u - Math.round(u)) * BEAT;
      });
    assert.ok(kicksOnBeats.length > 20);
    for (const e of kicksOnBeats) assert.ok(Math.abs(e) < 0.03, `beat ${(e * 1000).toFixed(0)} ms off the kick`);
    // (The drop's own beat goes out a moment before the drop is heard; the next is beat 2.)
    const afterDropBeat = seen.beats.find((b) => b.time > barTime(DROP[0]) + BEAT / 2);
    assert.equal(afterDropBeat.beat, 1, 'the beat after the drop is beat 2 of its bar');
    const afterDrop = seen.beats.filter((b) => b.time > barTime(DROP[0]) + BAR && b.time < END - BAR);
    assert.ok(
      afterDrop.every((b) => (b.beat === 0) === (Math.round((b.time - barTime(DROP[0])) / BEAT) % 4 === 0)),
      'bars count from the drop',
    );

    // Through the breakdown the grid keeps time with the tune.
    const offGrid = seen.beats
      .filter((b) => b.time > barTime(BREAKDOWN[0]) && b.time < barTime(DROP[0]))
      .map((b) => {
        const u = (b.time - LEAD_IN) / BEAT;
        return Math.abs(u - Math.round(u)) * BEAT;
      });
    assert.ok(
      offGrid.length > 25 && offGrid.every((e) => e < 0.035),
      `breakdown beats off by up to ${(Math.max(...offGrid) * 1000).toFixed(0)} ms`,
    );

    // Pulses: strong in the groove, gone in the breakdown, back after the drop.
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const strength = (from, to) => mean(seen.beats.filter((b) => b.time > from && b.time < to).map((b) => b.strength));
    assert.ok(
      strength(barTime(2), barTime(GROOVE[1])) > 0.4,
      `groove pulses ${strength(barTime(2), barTime(GROOVE[1]))}`,
    );
    // (Only until the snare roll: a roll into the drop pulsing the fire is the build-up.)
    assert.ok(strength(barTime(BREAKDOWN[0] + 2), barTime(BREAKDOWN[0] + 6)) < 0.05, 'no pulses in the breakdown');
    assert.ok(strength(barTime(DROP[0] + 1), END) > 0.4, 'pulses come back');
    assert.ok(seen.hats > 20, `hats: ${seen.hats}`);
  });
}

test('no drop without a breakdown: a steady groove only starts [slow]', () => {
  const audio = synthesize(1);
  // Keep only the groove, then the drop section spliced right after it.
  const cut = Math.round(barTime(BREAKDOWN[0]) * SR);
  const resume = Math.round(barTime(DROP[0]) * SR);
  const steady = new Float32Array(cut + (audio.length - resume));
  steady.set(audio.subarray(0, cut));
  steady.set(audio.subarray(resume), cut);
  const seen = analyse(steady);
  assert.deepEqual([...new Set(seen.events.map((x) => x.e))], ['start', 'silence']);
});
