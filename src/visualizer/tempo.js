// Tempo and beat phase from an onset-strength envelope (no Web Audio here, so it
// runs in node tests too).
//
//   envelope  onset strength, resampled to RATE Hz by holding each frame's value
//             across the slots it covers (frame rates vary; the envelope doesn't).
//   tempo     autocorrelation of the last WINDOW seconds, each lag scored with its
//             double (a real beat period repeats at 2×) and a log-normal prior
//             around 125 BPM, which settles the octave (64 vs 128) the way a
//             listener would. Parabolic interpolation gives sub-slot precision.
//   phase     a comb over the recent envelope at that period: the offset where
//             the onsets line up is where the beats fall.
//   clock     beats are emitted from a predicted grid, not from onsets, so they
//             can land early (`lead`) to make up for render latency, and keep
//             going through a fill. Small tempo and phase errors are eased out;
//             big ones must persist before the grid jumps.
//   bars      a beat counter: count 0 is a downbeat. anchor() pins it (a drop, a
//             tap, the music starting); otherwise the beat position with the most
//             spectral change (crashes, chord changes) wins as the downbeat.
import { wrap } from '../math.js';

export const RATE = 100; // envelope samples per second
const WINDOW = 8; // seconds analysed
const BUFFER = RATE * 10;

/** Score the tempo lags; returns { period (s), strength (0..1) } or null. `x` is oldest → newest. */
export function estimateTempo(x, { min = 70, max = 185, center = 125, width = 0.75 } = {}) {
  const n = x.length;
  const lo = Math.floor((60 * RATE) / max);
  const hi = Math.ceil((60 * RATE) / min);
  if (n < hi * 3) return null;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i] - mean;
  const ac = new Float32Array(hi * 2 + 2);
  for (let L = 0; L < ac.length && L < n; L++) {
    let s = 0;
    for (let i = L; i < n; i++) s += y[i] * y[i - L];
    ac[L] = s / (n - L);
  }
  if (ac[0] <= 1e-9) return null;
  const score = (L) => {
    const bpm = (60 * RATE) / L;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / center) / width) ** 2);
    return (Math.max(0, ac[L]) + 0.5 * Math.max(0, ac[2 * L] ?? 0)) * prior;
  };
  let best = lo;
  let bestS = -Infinity;
  for (let L = lo; L <= hi; L++) {
    const s = score(L);
    if (s > bestS) { bestS = s; best = L; }
  }
  // Refine on the raw autocorrelation around the pick.
  const a = ac[best - 1] ?? ac[best];
  const b = ac[best];
  const c = ac[best + 1] ?? ac[best];
  const den = a - 2 * b + c;
  const shift = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
  return { period: (best + shift) / RATE, strength: Math.max(0, Math.min(1, b / ac[0])) };
}

/** Time since the most recent beat (s), from a comb over `x` (oldest → newest) at `period` s. */
function estimatePhase(x, period) {
  const L = period * RATE;
  const n = x.length;
  let best = 0;
  let bestS = -Infinity;
  const sums = [];
  for (let phi = 0; phi < Math.ceil(L); phi++) {
    let s = 0;
    let w = 1;
    for (let k = 0; ; k++) {
      const i = Math.round(n - 1 - phi - k * L);
      if (i < 0) break;
      s += w * x[i];
      w *= 0.85; // recent beats count most, so a slightly-off tempo doesn't drag the phase
    }
    sums.push(s);
    if (s > bestS) { bestS = s; best = phi; }
  }
  const m = sums.length;
  const a = sums[(best - 1 + m) % m];
  const c = sums[(best + 1) % m];
  const den = a - 2 * bestS + c;
  const shift = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
  return (best + shift) / RATE;
}

export function createTempoTracker({ min = 70, max = 185 } = {}) {
  const env = new Float32Array(BUFFER);
  let head = 0;       // next slot to write
  let filled = 0;
  let slotTime = -1;  // time at the start of the slot being accumulated
  let acc = 0;
  let lastEstimate = -1;

  // Beat grid.
  let period = 0;      // s; 0 while unknown
  let grid = 0;        // time of a beat on the grid
  let strength = 0;
  let tempoMiss = 0;
  let phaseMiss = 0;
  let pendingPeriod = 0;
  let lastBeat = -Infinity;
  let count = 0;       // beats since the anchor; count % 4 === 0 is a downbeat
  let anchoredAt = -Infinity;
  let anchorPending = false; // anchored before the tempo was known: count from it once it is
  let manualUntil = -Infinity;
  let mode = null; // who set the tempo while manualUntil holds: 'tap', 'manual' (typed in) or 'link'
  const slotChange = new Float32Array(4); // spectral change per bar position, decaying

  function push(time, value) {
    if (slotTime < 0) slotTime = time;
    acc = Math.max(acc, value);
    while (time - slotTime >= 1 / RATE) {
      env[head] = acc;
      head = (head + 1) % BUFFER;
      filled = Math.min(BUFFER, filled + 1);
      slotTime += 1 / RATE;
      // A frame covering several slots holds its value across them.
      if (time - slotTime < 1 / RATE) acc = 0;
    }
  }

  function recent(seconds) {
    const n = Math.min(filled, Math.round(seconds * RATE));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = env[(head - n + i + BUFFER) % BUFFER];
    return out;
  }

  function setGrid(p, beatTime) {
    period = p;
    grid = beatTime;
  }

  /**
   * Re-estimate tempo and phase (call a few times a second). `now` is the analysis clock.
   * `steady`: the music is in a breakdown, where tunes keep their tempo but the onsets
   * left (pads, risers, a snare roll on every 8th) are ambiguous: the grid runs on as it
   * was until the groove comes back.
   */
  function estimate(now, { detectDelay = 0.02, steady = false } = {}) {
    if (now - lastEstimate < 0.25) return;
    lastEstimate = now;
    const x = recent(WINDOW);
    const est = estimateTempo(x, { min, max });
    if (!est) return;
    strength += (est.strength - strength) * 0.3;
    if (est.strength < 0.08) return; // nothing periodic to follow
    const manual = now < manualUntil;
    if (manual && mode !== 'tap') return; // a typed-in tempo or Link owns the grid (phase included)
    // A clear pulse (a groove) may retune the grid; a faint one (a groove thinning out,
    // a breakdown) may only nudge its phase — or, in a breakdown, not even that.
    const clear = est.strength >= 0.25;
    if (steady && period) return; // tunes keep time through a breakdown: let the grid run

    // Tempo: ease small changes in; a different tempo must hold for a second first.
    if (!manual && !steady && (clear || !period)) {
      if (!period) { period = est.period; phaseMiss = 99; } // first lock: take the comb's phase outright
      // Close to the current tempo, the phase loop below fine-tunes it (the autocorrelation
      // peak is a little broad to trust for the last fraction of a percent).
      else if (Math.abs(est.period / period - 1) < 0.015) { period += (est.period - period) * 0.03; tempoMiss = 0; }
      else if (Math.abs(est.period / period - 1) < 0.04) { period += (est.period - period) * 0.25; tempoMiss = 0; }
      else if (pendingPeriod && Math.abs(est.period / pendingPeriod - 1) < 0.03) {
        if (++tempoMiss >= 4) {
          period = est.period;
          tempoMiss = 0;
          phaseMiss = 99;
          // Bars counted at the old tempo mean nothing at the new one: count again from the anchor.
          if (anchoredAt > -Infinity) anchorPending = true;
        }
      } else { pendingPeriod = est.period; tempoMiss = 1; }
    }
    if (!period) return;

    // Phase: the latest beat per the comb, against the grid.
    const since = estimatePhase(x, period);
    const beatAt = slotTime - 0.5 / RATE - since - detectDelay;
    // Rebase the grid onto the beat nearest this one first, so a tempo nudge moves the
    // next beats by that much — not by that much times every beat since the lock.
    grid += Math.round((beatAt - grid) / period) * period;
    const err = beatAt - grid;
    if (Math.abs(err) < 0.18 * period) {
      grid += err * 0.35;
      // A grid that keeps running late or early has the wrong tempo: nudge it.
      if (!manual && !steady && clear) period += err * 0.04;
      phaseMiss = 0;
    }
    else if (!steady && ++phaseMiss >= 4) { grid = beatAt; phaseMiss = 0; }
  }

  /**
   * Beats due by `now + lead`: [{ time, count, beat (0-3 in the bar), bar }].
   * `change` is this frame's spectral change, credited to the nearest bar position.
   */
  function tick(now, { lead = 0, change = 0 } = {}) {
    const out = [];
    if (!period) return out;
    // Credit spectral change to the beat position it's nearest (for downbeats).
    if (change > 0 && lastBeat > -Infinity) {
      const off = (now - lastBeat) / period;
      if (off > -0.1 && off < 0.15) slotChange[wrap(count - 1, 4)] += change;
    }
    for (;;) {
      // The next grid beat at least half a beat after the last one emitted, so a
      // shifted grid neither repeats a beat nor skips one.
      const from = Math.max(lastBeat + period * 0.5, now + lead - period * 1.5);
      const k = Math.ceil((from - grid) / period);
      const time = grid + k * period;
      if (time > now + lead) break;
      if (anchorPending) { count = Math.max(0, Math.round((time - anchoredAt) / period)); anchorPending = false; }
      if (wrap(count, 4) === 0) chooseDownbeat(now);
      const c = count++;
      out.push({ time, count: c, beat: wrap(c, 4), bar: Math.floor(c / 4) });
      lastBeat = time;
    }
    return out;
  }

  // Unless something pinned the bar (anchor), let the most eventful beat position be beat 1.
  function chooseDownbeat(now) {
    for (let i = 0; i < 4; i++) slotChange[i] *= 0.9;
    if (now - anchoredAt < 60) return;
    let best = 0;
    for (let i = 1; i < 4; i++) if (slotChange[i] > slotChange[best]) best = i;
    const second = Math.max(...[0, 1, 2, 3].filter((i) => i !== best).map((i) => slotChange[i]));
    if (best !== 0 && slotChange[best] > second * 1.25 + 1e-6) {
      count += 4 - best; // the beat `best` ahead becomes the downbeat
      const moved = [...slotChange];
      for (let i = 0; i < 4; i++) slotChange[i] = moved[wrap(i + best, 4)];
    }
  }

  /** Make the beat at (or nearest) `time` a downbeat and the start of a phrase. */
  function anchor(time) {
    anchoredAt = time;
    slotChange.fill(0);
    if (!period || lastBeat === -Infinity) { count = 0; anchorPending = true; return; }
    // The next emitted beat's count follows from how far it is from `time`.
    const nextBeat = lastBeat + period;
    const beatsAhead = Math.round((nextBeat - time) / period);
    count = beatsAhead;
  }

  // Tap tempo: the first tap of a run is a downbeat; the tapped tempo holds for 30 s.
  let taps = [];
  function tap(time) {
    if (taps.length && time - taps.at(-1) > 2) taps = [];
    taps.push(time);
    if (taps.length < 3) return null;
    const recentTaps = taps.slice(-8);
    const p = (recentTaps.at(-1) - recentTaps[0]) / (recentTaps.length - 1);
    if (p < 60 / 220 || p > 60 / 60) return null;
    setGrid(p, time);
    lastBeat = time - p * 0.5; // the tap's own beat is emitted next
    count = taps.length - 1;
    anchoredAt = time;
    slotChange.fill(0);
    manualUntil = time + 30;
    mode = 'tap';
    return 60 / p;
  }

  /**
   * A tempo set by hand (the BPM field): it holds until cleared. The beat keeps its phase
   * (the grid runs on from the last beat) unless there was none yet: then `time` is a beat.
   */
  function setManual(bpm, time) {
    const p = 60 / Math.min(220, Math.max(60, bpm));
    const at = lastBeat > -Infinity ? lastBeat : time;
    setGrid(p, at);
    if (lastBeat === -Infinity) lastBeat = at - p * 0.5;
    manualUntil = Infinity;
    mode = 'manual';
    taps = [];
  }
  /** Back to following the music. */
  function clearManual() { manualUntil = -Infinity; mode = null; taps = []; }
  /** Shift the beat grid by `seconds` (a phase nudge: positive = beats land later). */
  function nudge(seconds) {
    if (!period) return;
    grid += seconds;
    lastBeat += seconds;
  }
  /**
   * The beat from outside (an Ableton Link bridge): `bpm`, and `beat`, the session's beat
   * position (beat 0, 4, 8… are downbeats) at `time` on this clock. Holds for 2 s after
   * the last update, so a dropped bridge falls back to listening.
   */
  function external(bpm, beat, time, quantum = 4) {
    const p = 60 / bpm;
    const whole = Math.floor(beat);
    const beatTime = time - (beat - whole) * p; // when the current whole beat fell
    setGrid(p, beatTime);
    if (mode !== 'link' || Math.abs(lastBeat - beatTime) > p * 0.6) {
      lastBeat = beatTime; // (so the next emitted beat is whole + 1)
      count = whole + 1;
      anchoredAt = time;
    }
    // Keep the bar where the session has it.
    const want = ((whole + 1) % quantum + quantum) % quantum;
    const have = ((count % 4) + 4) % 4;
    if (want !== have) count += ((want - have) % 4 + 4) % 4;
    manualUntil = time + 2;
    mode = 'link';
  }

  function reset() {
    env.fill(0); head = 0; filled = 0; slotTime = -1; acc = 0; lastEstimate = -1;
    period = 0; grid = 0; strength = 0; tempoMiss = 0; phaseMiss = 0; pendingPeriod = 0;
    lastBeat = -Infinity; count = 0; anchoredAt = -Infinity; anchorPending = false; manualUntil = -Infinity; taps = []; mode = null;
    slotChange.fill(0);
  }

  return {
    push, estimate, tick, anchor, tap, reset, setManual, clearManual, nudge, external,
    get bpm() { return period ? 60 / period : 0; },
    get period() { return period; },
    /** 0..1: how periodic the onsets are (≥ ~0.2 reads as a steady beat). */
    get strength() { return strength; },
    /** Who's setting the tempo instead of the music ('tap', 'manual', 'link'), or null. */
    get manual() { return mode && slotTime < manualUntil ? mode : null; },
    get count() { return count; },
  };
}
