// Where the music is in a tune: groove, breakdown, build, drop. No Web Audio here (the
// analyser hands it levels and onsets), so tests can drive it.
//
//   windows    the music is summed up beat by beat (every half second until the tempo
//              locks): the low band, overall loudness, the highs, and how many kicks
//              and onsets landed.
//   reference  each level's full-energy value for this tune: it rises at once, falls
//              slowly, and holds still through a breakdown or build.
//   breakdown  the kick gone for a bar and a half while the music plays on (pads, a
//              sub, vocals, a DJ's EQ kill: the kick band's onsets stop either way).
//   build      tension: the highs climbing (risers), onsets coming faster (rolls), the
//              bass thinned out. It can happen inside a breakdown or over a kick roll.
//   drop       scored every frame for low latency, once the tune has been low for a
//              bar and a half:
//                · how far the bass, the loudness and the balance of bass over highs
//                  jumped against the last beat (risers stop and the bass slams in),
//                · the kick coming back after an absence (or just a kick landing),
//                · landing on a downbeat (a phrase boundary more so),
//                · the tension before it, and a silence gap just before.
//              A clear drop where one is expected (a phrase boundary, after a build or a
//              gap) fires at once. Otherwise it waits a beat: another kick on the next
//              beat with the energy held confirms it (so a lone boom in a breakdown
//              doesn't count). A short cut makes a small drop; a long
//              breakdown or a real build, a big one. If the energy creeps back without
//              a jump, the section just returns to the groove.
import { approach, clamp01 } from '../math.js';

const SILENT_RMS = 10 ** (-64 / 20);
const dB = (a) => 20 * Math.log10(Math.max(a, 1e-7));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Least-squares slope of ys over their index (units per window). */
function slope(ys) {
  const n = ys.length;
  if (n < 3) return 0;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (ys[i] - my); den += (i - mx) ** 2; }
  return num / den;
}

export function createSections() {
  let state = 'silent';
  let quietFor = 10;
  let loudFor = 0;
  let stateSince = 0;
  let hist = [];            // closed windows, newest last
  let ref = null;           // full-energy levels (dB): low, tot, high
  let win = null;           // the window being summed
  let lowFast = 0;
  let totFast = 0;
  let highFast = 0;
  let tension = 0;
  let settle = 0;           // windows to wait after a drop before judging sections again
  let lowSince = -Infinity; // when the current breakdown/build began
  let lastKick = -Infinity;
  let gapUntil = -Infinity;
  let lastBeat = null;      // { time, beat, bar }
  let pending = null;       // a borderline drop waiting for the next beat
  let returnUntil = -Infinity; // the kick just came back after an absence
  let dropScore = 0;

  function openWindow(now) {
    win = { t0: now, lowSq: 0, totSq: 0, highSq: 0, flux: 0, n: 0, kicks: 0, onsets: 0 };
  }

  function closeWindow(now, events) {
    const n = win.n;
    const w = {
      t: now,
      t0: win.t0,
      lowDb: dB(Math.sqrt(win.lowSq / n)),
      totDb: dB(Math.sqrt(win.totSq / n)),
      highDb: dB(Math.sqrt(win.highSq / n)),
      kicks: win.kicks,
      onsets: win.onsets,
      flux: win.flux / n,
      I: 1,
      tension: 0,
    };
    openWindow(now);
    if (state === 'silent') return;
    hist.push(w);
    if (hist.length > 64) hist.shift();

    // The reference: up at once, down slowly, and hardly at all while the tune is low.
    const low = state === 'breakdown' || state === 'build';
    if (!ref) ref = { low: w.lowDb, tot: w.totDb, high: w.highDb };
    else {
      for (const [k, v] of [['low', w.lowDb], ['tot', w.totDb], ['high', w.highDb]]) {
        if (v > ref[k]) ref[k] += (v - ref[k]) * (low ? 0.1 : 0.35);
        else if (!low) ref[k] += (v - ref[k]) * 0.01;
      }
    }

    // Intensity: the bass, the loudness and the kicks against the reference.
    const kickRate = mean(hist.slice(-4).map((x) => (x.kicks > 0 ? 1 : 0)));
    w.I = 0.35 * clamp01(1 + (w.lowDb - ref.low) / 18) + 0.3 * clamp01(1 + (w.totDb - ref.tot) / 14) + 0.35 * kickRate;

    // Tension over the last two bars: risers, rolls, the bass thinned.
    // (Risers climb a fraction of a dB a beat; rolls show as the spectrum changing more
    // and more often, which onset counting misses once they're dense.)
    const highSlope = slope(hist.slice(-8).map((x) => x.highDb));
    const fluxBefore = mean(hist.slice(-8, -3).map((x) => x.flux));
    const accel = hist.length >= 8 ? mean(hist.slice(-3).map((x) => x.flux)) / Math.max(1e-6, fluxBefore) - 1 : 0;
    const thinned = clamp01((ref.low - w.lowDb - 3) / 12);
    const raw = 0.45 * clamp01(highSlope / 0.5) + 0.3 * clamp01(accel / 0.8) + 0.25 * thinned;
    tension += (raw - tension) * 0.4;
    w.tension = tension;

    // A silence gap: a whole beat far quieter than the breakdown around it (the mix cut
    // right before the drop). Hats or a pad keep each beat's level, so they don't count.
    const inLow = hist.slice(-5, -1);
    if (low && inLow.length === 4 && inLow.every((x) => x.t0 >= lowSince) && w.totDb < mean(inLow.map((x) => x.totDb)) - 10) {
      gapUntil = now + (now - w.t0) * 2;
    }

    if (settle > 0) { settle--; return; }
    // (The kick has to have been there to be gone: an ambient intro isn't a breakdown.)
    const kickless = hist.length >= 6 && hist.slice(-6).every((x) => x.kicks === 0) && hist.slice(-16, -6).some((x) => x.kicks > 0) && w.totDb > ref.tot - 30;
    const tense = hist.length >= 3 && hist.slice(-3).every((x) => x.tension > 0.5);
    if (state === 'groove') {
      if (kickless) { enter('breakdown', now, events); lowSince = hist.at(-6).t0; }
      else if (tense) { enter('build', now, events); lowSince = hist.at(-3).t0; }
    } else if (low) {
      if (state === 'breakdown' && tension > 0.45) enter('build', now, events);
      // Back without a drop: the kick and the energy crept back in.
      const back = hist.slice(-4);
      if (back.length === 4 && back.every((x) => x.kicks > 0 && x.I > 0.65) && tension < 0.4) enter('groove', now, events, 'return');
    }
  }

  function enter(next, now, events, name = next) {
    state = next;
    stateSince = now;
    events.push(name);
  }

  function dropNow(now, events, period) {
    const lowFor = now - lowSince;
    const size = lowFor >= period * 14 || tension > 0.5 || now < gapUntil + period ? 'big' : 'small';
    enter('groove', now, events, 'drop');
    settle = 4;
    tension = 0;
    gapUntil = -Infinity;
    pending = null;
    return size;
  }

  /**
   * One frame. m: { rms, low, high (band amplitudes), kick, onset (onset strengths this
   * frame, 0 if none), flux (the whole spectrum's flux rate), beats (emitted this
   * frame), period (s, 0 if unknown) }.
   * Returns { state, events, intensity, tension, drop ('big' | 'small' | null), dropScore }.
   */
  function update(now, dt, m) {
    dt = Math.max(1 / 240, Math.min(0.1, dt));
    const events = [];
    let drop = null;
    if (m.rms < SILENT_RMS) { quietFor += dt; loudFor = 0; } else { loudFor += dt; quietFor = 0; }
    if (!win) openWindow(now);

    if (state === 'silent') {
      if (loudFor > 0.25) {
        enter('groove', now, events, 'start');
        hist = [];
        ref = null;
        tension = 0;
        settle = 6; // (the detectors are still finding their levels)
        pending = null;
        openWindow(now);
      }
    } else if (quietFor > 2.5) {
      enter('silent', now, events, 'silence');
    }

    lowFast = approach(lowFast, m.low, m.low > lowFast ? 0.008 : 0.12, dt);
    totFast = approach(totFast, m.rms, m.rms > totFast ? 0.015 : 0.15, dt);
    highFast = approach(highFast, m.high, m.high > highFast ? 0.015 : 0.15, dt);
    const kickNow = m.kick > 0;
    if (kickNow && hist.length >= 6 && hist.slice(-6).every((x) => x.kicks === 0) && win.kicks === 0) returnUntil = now + 0.15;
    const kickReturn = now < returnUntil;
    if (kickNow) lastKick = now;
    for (const b of m.beats) lastBeat = { time: b.time, beat: b.beat, bar: b.bar };

    win.lowSq += m.low * m.low;
    win.totSq += m.rms * m.rms;
    win.highSq += m.high * m.high;
    win.flux += m.flux ?? 0;
    win.n++;
    if (kickNow) win.kicks++;
    if (m.onset) win.onsets++;
    const close = m.beats.length ? true : !m.period && now - win.t0 >= 0.5;
    if (close && win.n >= 3) closeWindow(now, events);

    // The drop, judged every frame.
    dropScore = 0;
    const low = state === 'breakdown' || state === 'build';
    const period = m.period || 0.5;
    if (low && ref && hist.length >= 4) {
      const pre = hist.slice(-4);
      const preLow = mean(pre.map((x) => x.lowDb));
      const preTot = mean(pre.map((x) => x.totDb));
      const preTilt = mean(pre.map((x) => x.lowDb - x.highDb));
      const lowNow = dB(lowFast);
      const totNow = dB(totFast);
      if (pending) {
        // A borderline drop is confirmed by a kick on the next beat with the energy held.
        // (The level shows up a frame or two after the onset, so look just after the kick.)
        if (now > pending.until) pending = null;
        else {
          if (kickNow && now - pending.t > period * 0.6) pending.kickAt = now;
          if (now - (pending.kickAt ?? -Infinity) < 0.12 && lowNow > pending.preLow + 3 && totNow > pending.preTot) drop = dropNow(now, events, period);
        }
      }
      // Scored every frame; a borderline score gets 120 ms to clear the bar (the levels
      // catch up with the onset), then waits for the next beat's kick.
      if (!drop && (!pending || now - pending.t < 0.12) && now - lowSince >= Math.max(3, period * 6)) {
        let beatNear = false;
        let downbeat = false;
        let phrase = false;
        if (lastBeat && m.period) {
          // The beat nearest now: the last one emitted (beats go out a little early), or the next.
          const toLast = Math.abs(now - lastBeat.time);
          const toNext = Math.abs(lastBeat.time + period - now);
          const next = toNext < toLast;
          beatNear = Math.min(toLast, toNext) < 0.12;
          const beatIdx = next ? (lastBeat.beat + 1) % 4 : lastBeat.beat;
          const bar = next && lastBeat.beat === 3 ? lastBeat.bar + 1 : lastBeat.bar;
          downbeat = beatNear && beatIdx === 0;
          phrase = downbeat && bar % 8 === 0;
        }
        const jumpLow = lowNow - preLow;
        const jumpTot = totNow - preTot;
        const jumpTilt = lowNow - dB(highFast) - preTilt;
        const tensionBefore = Math.max(...pre.map((x) => x.tension));
        dropScore = 0.3 * clamp01((jumpLow - 3) / 9) + 0.15 * clamp01((jumpTot - 1.5) / 6) + 0.15 * clamp01((jumpTilt - 3) / 9)
          + (kickReturn ? 0.25 : now - lastKick < 0.08 ? 0.1 : 0)
          + (downbeat ? 0.12 : beatNear ? 0.05 : 0) + (phrase ? 0.08 : 0)
          + 0.12 * clamp01(tensionBefore / 0.6) + (now < gapUntil ? 0.12 : 0);
        const restored = lowNow > ref.low - 10;
        // Firing at once needs a reason to expect a drop here: a phrase boundary, a build
        // before it or a gap. Otherwise even a clear hit waits a beat for the next kick
        // (an impact boom mid-breakdown has none).
        const expected = phrase || tensionBefore >= 0.4 || now < gapUntil;
        if (restored && dropScore >= 0.7 && expected) drop = dropNow(now, events, period);
        else if (!pending && restored && dropScore >= 0.5 && now - lastKick < 0.08) pending = { t: now, until: now + period * 1.6, preLow, preTot };
      }
    }

    const I = hist.length ? hist.at(-1).I : 1;
    return { state, events, intensity: I, tension: low ? tension : Math.min(tension, 0.4), drop, dropScore, since: now - stateSince };
  }

  return {
    update,
    get state() { return state; },
    reset() {
      state = 'silent'; quietFor = 10; loudFor = 0; hist = []; ref = null; win = null;
      tension = 0; settle = 0; lastKick = -Infinity; gapUntil = -Infinity; lastBeat = null; pending = null; returnUntil = -Infinity;
    },
  };
}
