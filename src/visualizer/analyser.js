// Live audio → what the visualizer reacts to, once per frame.
//
//   bands     bass / low-mid / mid / high-mid / high, each an envelope (fast attack,
//             slower release) over its own slowly decaying peak, so every band reads
//             0..1 whatever the input level: a quiet line-in and a hot master both work.
//   onsets    kicks (40–150 Hz) and hats (7–16 kHz) by spectral flux: the rise in
//             log-magnitude since the last frame, as a rate (per second, so 60 and
//             144 Hz monitors agree), over an adaptive threshold (recent mean + k·std;
//             sensitivity sets k) with a refractory gap.
//   tempo     the flux envelope feeds the beat tracker (tempo.js), which emits beats
//             on a predicted grid, `lead` seconds early to cover render latency.
//             Each beat carries how hard the kicks have been landing on the grid,
//             so pulses fade out in a breakdown and come back with the kick.
//   sections  groove, breakdown, build, drop and silence, from the levels and onsets
//             (sections.js). A drop re-anchors the bar count: it's beat 1.
import { createTempoTracker } from './tempo.js';
import { createSections } from './sections.js';

const FFT = 2048;
const ease = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

export const BAND_NAMES = ['bass', 'lowMid', 'mid', 'highMid', 'high'];

/** An onset detector over a flux rate; returns the onset strength (0 = none) each frame. */
function onsetDetector({ refractory, history = 0.8 }) {
  const times = [];
  const values = [];
  let peak = 1e-6;
  let over = false;
  let last = -Infinity;
  const out = { onset: 0, value: 0 };
  return (now, dt, rate, sensitivity) => {
    times.push(now);
    values.push(rate);
    while (times.length && now - times[0] > history) { times.shift(); values.shift(); }
    let mean = 0;
    for (const v of values) mean += v;
    mean /= values.length;
    let varSum = 0;
    for (const v of values) varSum += (v - mean) ** 2;
    const std = Math.sqrt(varSum / values.length);
    peak = Math.max(rate, peak * Math.exp(-dt / 6), 1e-6);
    const threshold = mean + (1.6 / sensitivity) * std;
    const wasOver = over;
    over = rate > threshold && rate > 0.12 * peak;
    out.onset = 0;
    if (over && !wasOver && now - last > refractory) {
      last = now;
      out.onset = Math.min(1, rate / (0.6 * peak));
    }
    out.value = Math.max(0, rate - mean) / peak;
    return out;
  };
}

/** An AnalyserNode on `ctx` feeding the features: connect the sound to `.node`. */
export function createAnalyser(ctx) {
  const node = ctx.createAnalyser();
  node.fftSize = FFT;
  node.smoothingTimeConstant = 0;
  const features = createFeatures({ sampleRate: ctx.sampleRate, fftSize: FFT });
  return {
    ...features,
    node,
    update(now, dt, opts) {
      node.getFloatFrequencyData(features.db);
      node.getFloatTimeDomainData(features.wave);
      return features.process(now, dt, opts);
    },
  };
}

/**
 * The analysis itself, on a spectrum in dB (as an AnalyserNode gives it: Blackman
 * window, |X|/N, no smoothing) and the waveform it came from. Fill `db` and `wave`,
 * then call process(). Tests drive this directly with synthesized audio.
 */
export function createFeatures({ sampleRate, fftSize = FFT }) {
  const bins = fftSize / 2;
  const hz = sampleRate / fftSize;
  const binOf = (f) => Math.max(1, Math.min(bins - 1, Math.round(f / hz)));
  const range = (a, b) => { const lo = binOf(a); return [lo, Math.max(lo + 1, binOf(b))]; };
  const BANDS = { bass: range(30, 150), lowMid: range(150, 500), mid: range(500, 2000), highMid: range(2000, 6000), high: range(6000, 16000) };
  const KICK = range(40, 150);
  const HAT = range(7000, 16000);

  const db = new Float32Array(bins);
  const prev = new Float32Array(bins);
  const wave = new Float32Array(fftSize);
  const tempo = createTempoTracker();
  const kickDetector = onsetDetector({ refractory: 0.14 }); // short enough for an off-beat bass note not to mask the next kick
  let kickLevelPeak = 1e-7; // the loudest the kick band gets (slowly forgotten)
  let kickCandidate = null; // an onset waiting (a frame or two) for its level to show
  const hatDetector = onsetDetector({ refractory: 0.07, history: 0.5 });
  const fullDetector = onsetDetector({ refractory: 0.1 });

  let specRef = 1e-6; // running peak magnitude: flux is measured relative to it, so level doesn't change its shape
  const env = Object.fromEntries(BAND_NAMES.map((b) => [b, 0]));
  const peak = Object.fromEntries(BAND_NAMES.map((b) => [b, 1e-5]));
  let levelEnv = 0;
  let levelPeak = 1e-5;

  const sections = createSections();
  let state = 'silent';
  let lowSince = 0;

  // How hard the kicks land on the beat grid: the strongest onset near each beat.
  let beatMemory = 0;
  let lastBeatTime = -Infinity;
  let hitNow = 0;   // onset credited to the last emitted beat
  let hitNext = 0;  // one that arrived just before its beat was emitted

  const features = {
    time: 0, rms: 0, level: 0, kick: 0, hat: 0, beats: [], events: [],
    bands: { ...env }, bpm: 0, locked: false, strength: 0, state, build: 0, breakdownFor: 0,
    intensity: 1, drop: null, dropScore: 0,
  };

  /**
   * Analyse the latest audio. `now` in seconds (performance clock); options:
   * sensitivity (0.5–2, onset thresholds), lead (s, beats this early).
   */
  function process(now, dt, { sensitivity = 1, lead = 0 } = {}) {
    dt = Math.max(1 / 240, Math.min(0.1, dt));
    let sq = 0;
    for (let i = 0; i < fftSize; i++) sq += wave[i] * wave[i];
    const rms = Math.sqrt(sq / fftSize);

    // Log-magnitude flux, whole spectrum and per detector band; band powers. Magnitudes
    // are taken relative to the running peak first (the loudest bin lands near 200), so
    // a quiet line in and a hot master compress alike.
    let full = 0, kick = 0, hat = 0;
    const power = { bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };
    let kickPower = 0;
    let maxA = 0;
    const scale = 200 / Math.max(specRef, 1e-7);
    for (let k = 1; k < bins; k++) {
      const a = db[k] > -200 ? 10 ** (db[k] / 20) : 0;
      if (a > maxA) maxA = a;
      const m = Math.log1p(scale * a);
      const d = m - prev[k];
      prev[k] = m;
      if (d > 0) {
        full += d;
        if (k >= KICK[0] && k < KICK[1]) kick += d;
        if (k >= HAT[0] && k < HAT[1]) hat += d;
      }
      const p = a * a;
      if (k >= KICK[0] && k < KICK[1]) kickPower += p;
      for (const b of BAND_NAMES) if (k >= BANDS[b][0] && k < BANDS[b][1]) { power[b] += p; break; }
    }
    // The reference follows the input level (not the arrangement): up at once, down slowly.
    specRef = Math.max(maxA, specRef * Math.exp(-dt / 25), 1e-7);

    // Bands: envelope over a decaying peak.
    for (const b of BAND_NAMES) {
      const amp = Math.sqrt(power[b] / (BANDS[b][1] - BANDS[b][0]));
      env[b] = ease(env[b], amp, amp > env[b] ? 0.015 : 0.16, dt);
      peak[b] = Math.max(env[b], peak[b] * Math.exp(-dt / 14), 1e-5);
      features.bands[b] = Math.min(1, env[b] / peak[b]) ** 1.3;
    }
    levelEnv = ease(levelEnv, rms, rms > levelEnv ? 0.03 : 0.3, dt);
    levelPeak = Math.max(levelEnv, levelPeak * Math.exp(-dt / 20), 1e-4);
    features.level = Math.min(1, levelEnv / levelPeak);
    features.rms = rms;

    // Onsets.
    const rate = (v) => v / dt;
    const k = kickDetector(now, dt, rate(kick), sensitivity);
    const h = hatDetector(now, dt, rate(hat), sensitivity);
    const f = fullDetector(now, dt, rate(full), sensitivity);
    const live = state !== 'silent';
    // A kick is loud in the kick band: within 24 dB of the loudest recent ones. (Deep in a
    // breakdown the onset detector's own scale has relaxed, and a pad or riser swelling in
    // the low end could otherwise pass for one.) The level shows a frame or two after the
    // onset, so an onset waits up to 50 ms for it.
    const kickAmp = Math.sqrt(kickPower / (KICK[1] - KICK[0]));
    kickLevelPeak = Math.max(kickAmp, kickLevelPeak * Math.exp(-dt / 30));
    if (k.onset) kickCandidate = { strength: k.onset, until: now + 0.05 };
    let kickNow = 0;
    if (kickCandidate) {
      if (kickAmp >= kickLevelPeak * 0.063) { kickNow = kickCandidate.strength; kickCandidate = null; }
      else if (now > kickCandidate.until) kickCandidate = null;
    }
    features.kick = live ? kickNow : 0;
    features.hat = live ? h.onset : 0;
    if (features.kick && tempo.period) {
      const win = Math.max(0.07, tempo.period * 0.2);
      if (Math.abs(now - lastBeatTime) < win) hitNow = Math.max(hitNow, features.kick);
      else if (Math.abs(now - (lastBeatTime + tempo.period)) < win) hitNext = Math.max(hitNext, features.kick);
    }

    // Tempo: kicks lead, the full spectrum fills in.
    tempo.push(now, live ? k.value + 0.35 * f.value : 0);
    tempo.estimate(now, { steady: state === 'breakdown' || state === 'build' });
    const beats = tempo.tick(now, { lead, change: live ? f.value : 0 });
    for (const b of beats) {
      // Settle the previous beat: a kick landed on it, or the pulses fade.
      if (lastBeatTime > -Infinity) beatMemory = hitNow ? beatMemory * 0.4 + hitNow * 0.6 : beatMemory * 0.5;
      hitNow = hitNext;
      hitNext = 0;
      lastBeatTime = b.time;
      b.strength = live ? beatMemory : 0;
    }
    features.beats = beats;
    features.bpm = tempo.bpm;
    features.strength = tempo.strength;
    features.locked = tempo.bpm > 0 && tempo.strength > 0.18;

    // Sections.
    const bassAmp = kickAmp;
    const highAmp = Math.sqrt(power.high / (BANDS.high[1] - BANDS.high[0]));
    const sec = sections.update(now, dt, { rms, low: bassAmp, high: highAmp, kick: kickNow, onset: f.onset, flux: rate(full), beats, period: tempo.period });
    const was = state;
    state = sec.state;
    if ((state === 'breakdown' || state === 'build') && was !== 'breakdown' && was !== 'build') lowSince = now;
    for (const e of sec.events) {
      if (e === 'start') tempo.anchor(now - 0.25); // when the sound began
      else if (e === 'drop') tempo.anchor(now);
    }
    features.events = sec.events;
    features.state = state;
    features.drop = sec.drop;
    features.dropScore = sec.dropScore;
    features.intensity = sec.intensity;
    features.build = state === 'breakdown' || state === 'build' ? sec.tension : 0;
    features.breakdownFor = state === 'breakdown' || state === 'build' ? now - lowSince : 0;
    features.time = now;
    return features;
  }

  return {
    db,
    wave,
    process,
    tempo,
    /** Clear everything learned (a new source). */
    reset() {
      tempo.reset();
      sections.reset();
      state = 'silent';
      beatMemory = 0;
      lastBeatTime = -Infinity;
      hitNow = 0;
      hitNext = 0;
      prev.fill(0);
      specRef = 1e-6;
      kickLevelPeak = 1e-7;
      kickCandidate = null;
    },
  };
}
