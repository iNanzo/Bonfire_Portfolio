// Synthesized DJ-tune-shaped audio and an AnalyserNode-style analysis of it, for the
// visualizer's tests. A track is a list of bars, each saying what plays in it.
import { createFeatures } from '../../src/visualizer/analyser.js';

export const SR = 44100;
export const N = 2048;

export function rng(seed = 9) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed / 4294967296) * 2 - 1;
  };
}

/**
 * bars: [{ kick: 1|2|4 (per beat: fours, 8ths, 16ths) or 0, kickGain, thin (a high-passed kick), halfTime (a kick on 1, a snare on 3),
 *   boom (one kick on beat 1), bass, hats, pad, sub, riser (0..1),
 * roll: 0|8|16 (claps per bar), gapLastBeat, gain }], defaults: kick 1, bass, hats.
 * Returns { audio, barTime(bar), beat, bar, end }.
 */
export function buildTrack(bars, { bpm = 126, leadIn = 1, tail = 3, gain = 1, seed = 9 } = {}) {
  const beat = 60 / bpm;
  const bar = beat * 4;
  const end = leadIn + bars.length * bar;
  const out = new Float32Array(Math.ceil((end + tail) * SR));
  const noise = rng(seed);
  const add = (start, len, fn) => {
    const s0 = Math.round(start * SR);
    for (let i = 0; i < len * SR && s0 + i < out.length; i++) out[s0 + i] += fn(i / SR);
  };
  const kick = (t0, g, thin = false) => {
    let phase = 0;
    add(t0, 0.35, (t) => {
      const f = thin ? 170 + 200 * Math.exp(-t / 0.035) : 46 + 114 * Math.exp(-t / 0.035);
      phase += (2 * Math.PI * f) / SR;
      return g * 0.9 * Math.sin(phase) * Math.exp(-t / 0.12);
    });
  };
  const hat = (t0, g) => {
    let prev = 0;
    add(t0, 0.06, (t) => { const n = noise(); const hp = n - prev; prev = n; return g * 0.18 * hp * Math.exp(-t / 0.018); });
  };
  const clap = (t0, g) => {
    let a = 0, b = 0;
    add(t0, 0.12, (t) => { const n = noise(); a += (n - a) * 0.3; b += (a - b) * 0.3; return g * 0.35 * (a - b) * Math.exp(-t / 0.03); });
  };
  const bass = (t0, g) => {
    let lp = 0;
    add(t0, 0.22, (t) => { const saw = ((t * 55) % 1) * 2 - 1; lp += (saw - lp) * 0.04; return g * 0.5 * lp * Math.exp(-t / 0.09); });
  };
  bars.forEach((spec, i) => {
    const s = { kick: 1, bass: true, hats: true, ...spec };
    const g = gain * (s.gain ?? 1);
    const barT = leadIn + i * bar;
    const beats = s.gapLastBeat ? 3 : 4;
    for (let b = 0; b < beats; b++) {
      const t = barT + b * beat;
      if (s.kick && !(s.halfTime && b !== 0)) for (let k = 0; k < s.kick; k++) kick(t + (k * beat) / s.kick, g * (s.kickGain ?? 1), s.thin);
      if (s.halfTime && b === 2) clap(t, g * 1.5);
      if (s.boom && b === 0) kick(t, g);
      if (s.hats) hat(t + beat / 2, g);
      if (s.bass) bass(t + beat / 2, g);
    }
    const len = bar - (s.gapLastBeat ? beat : 0);
    if (s.pad) {
      const chord = (t) => 0.05 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t));
      add(barT, len, (t) => g * chord(barT + t)); // continuous phase: no click at each bar line
    }
    if (s.sub) add(barT, len, (t) => g * 0.3 * Math.sin(2 * Math.PI * 45 * (barT + t)));
    if (s.riser) {
      let prev = 0;
      add(barT, len, (t) => { const n = noise(); const hp = n - prev; prev = n; return g * hp * 0.2 * s.riser * (0.6 + 0.4 * t / bar); });
    }
    if (s.roll) for (let k = 0; k < (s.gapLastBeat ? (s.roll * 3) / 4 : s.roll); k++) clap(barT + (k * bar) / s.roll, g);
  });
  return { audio: out, barTime: (n) => leadIn + n * bar, beat, bar, end };
}

// Iterative radix-2 FFT (in place, re/im).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = i + k + len / 2;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}
const blackman = Float64Array.from({ length: N }, (_, n) => 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / N) + 0.08 * Math.cos((4 * Math.PI * n) / N));

/** Run the analysis over `audio` at a jittery ~60 fps; returns what it saw. */
export function analyse(audio, opts = {}) {
  const f = createFeatures({ sampleRate: SR, fftSize: N });
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const r = rng(4);
  const seen = { events: [], beats: [], kicks: [], hats: 0, frames: [] };
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
    for (const e of out.events) seen.events.push({ e, t, drop: out.drop });
    for (const b of out.beats) seen.beats.push({ ...b, locked: out.locked });
    if (out.kick) seen.kicks.push(t);
    if (out.hat) seen.hats++;
    seen.frames.push({ t, bpm: out.bpm, locked: out.locked, state: out.state, build: out.build, intensity: out.intensity, dropScore: out.dropScore });
  }
  return seen;
}

export const eventsNamed = (seen, name) => seen.events.filter((x) => x.e === name);
