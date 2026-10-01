// The Painter's silent beat: what the analyser would hear from a track, made up, so a scene
// can be previewed on the music without any sound. Each frame gives the director the same
// features Bonfire Live's analyser does (visualizer/analyser.js): the bands, the level, the
// kicks and hats, the beats on the grid ({ time, count, beat, bar, strength }), the
// sections and their events, a locked tempo.
//
//   groove     a steady four-on-the-floor at `bpm`: a kick on every beat (the downbeat a
//              little harder), a hat on every off-beat, the bands swelling with them. The
//              first frame is the music starting ('start').
//   dropLoop   a 16-bar loop with a drop in it: 8 bars of groove, 4 of breakdown (the kick
//              gone, the build starting to climb), 4 of build (climbing to the top, hats
//              doubling), then the drop on the next bar's first beat, and round again. The
//              bar count starts again at each drop, as the analyser's does.
//   drop()     a drop now (the Painter's D key): on the next frame, and the bar count
//              starts again on the next beat.
//
// Beats come `lead` seconds early, like the analyser's (the director's Visual Lead).
// Pure: no DOM, no audio; `now` is the caller's clock in seconds (performance.now() / 1000).

/** The analyser's band names (visualizer/analyser.js BAND_NAMES). */
const BANDS = ['bass', 'lowMid', 'mid', 'highMid', 'high'];
/** The drop loop's sections, in bars: groove, then breakdown, then build; the drop starts the next loop. */
export const DROP_LOOP = { groove: 8, breakdown: 4, build: 4 };
/** Bars in one turn of the drop loop. */
export const LOOP_BARS = DROP_LOOP.groove + DROP_LOOP.breakdown + DROP_LOOP.build;
/** The preview's shapes. */
export const FEED_SHAPES = ['groove', 'dropLoop'];

/**
 * The features of silence (the Still preview): nothing heard, no beats.
 * @param {string[]} [events]  e.g. ['silence'] for the frame the music stops
 */
export function silentFrame(events = []) {
  return {
    time: 0, rms: 0, level: 0, kick: 0, hat: 0, beats: [], events,
    bands: Object.fromEntries(BANDS.map((b) => [b, 0])), bpm: 0, locked: false, strength: 0,
    state: 'silent', build: 0, breakdownFor: 0, intensity: 0, drop: null, dropScore: 0,
  };
}

/**
 * A made-up track's features, frame by frame.
 * @param {{ bpm?: number, shape?: 'groove' | 'dropLoop', start?: number, lead?: number }} [o]
 *   `start`: when the music starts (the clock's seconds); the first beat lands just after.
 */
export function createBeatFeed({ bpm = 124, shape = 'groove', start = 0, lead = 0 } = {}) {
  const period = 60 / bpm;
  const loopBeats = LOOP_BARS * 4;
  let t0 = start + 0.05;   // when beat 0 of the count falls
  let next = 0;            // the next beat to give (counted from t0)
  let first = true;
  let dropAsked = false;
  let reanchor = false;    // a drop by hand: the count starts again on the next beat
  let lastKick = -Infinity;
  let lastHat = -Infinity;
  let hatStep = -1;        // the last sixteenth (or eighth) a hat was due on
  let lastSection = 'groove';
  let lowAt = 0;           // when the breakdown began (for breakdownFor)

  /** Where beat `n` of the count sits: its bar and beat, and the section it's in. */
  function place(n) {
    const count = shape === 'dropLoop' ? n % loopBeats : n;
    const bar = Math.floor(count / 4);
    const section = shape !== 'dropLoop' || bar < DROP_LOOP.groove ? 'groove'
      : bar < DROP_LOOP.groove + DROP_LOOP.breakdown ? 'breakdown' : 'build';
    return { count, bar, beat: count % 4, section };
  }
  /** 0..1: how far the build has climbed at time `now` (0 outside the breakdown and build). */
  function climb(now) {
    if (shape !== 'dropLoop') return 0;
    const inLoop = (now - t0) / period - Math.floor((now - t0) / period / loopBeats) * loopBeats;
    const from = DROP_LOOP.groove * 4;
    if (inLoop < from) return 0;
    const u = Math.min(1, (inLoop - from) / ((DROP_LOOP.breakdown + DROP_LOOP.build) * 4));
    return u < 0.5 ? 0.8 * u : 0.4 + 1.2 * (u - 0.5); // (slow through the breakdown, fast up the build)
  }

  return {
    /** Beats per minute, and seconds a beat. */
    bpm,
    period,
    shape,
    /** A drop on the next frame (and the bar count starting again on the next beat). */
    drop() { dropAsked = true; },
    /**
     * This frame's features at `now` (seconds).
     * @param {number} now
     * @param {number} [dt]
     */
    frame(now, dt = 1 / 60) {
      void dt;
      const events = [];
      if (first) { events.push('start'); first = false; }
      let drop = null;
      if (dropAsked) {
        dropAsked = false;
        events.push('drop');
        drop = 'big';
        reanchor = true;
      }
      // The beats due by now (a little early: the lead).
      const beats = [];
      let kicked = 0;
      while (t0 + next * period <= now + lead) {
        const time = t0 + next * period;
        if (reanchor) { t0 = time; next = 0; reanchor = false; }
        const p = place(next);
        // The loop's sections turn over on their first beat; its drop is the next loop's beat 1.
        if (p.section !== lastSection) {
          if (p.section === 'breakdown') { events.push('breakdown'); lowAt = time; }
          else if (p.section === 'build') events.push('build');
          else if (p.section === 'groove' && lastSection === 'build' && !events.includes('drop')) { events.push('drop'); drop = 'big'; }
          lastSection = p.section;
        }
        const groove = p.section === 'groove';
        const lastBar = p.section === 'build' && p.bar === LOOP_BARS - 1;
        const strength = groove ? (p.beat === 0 ? 0.95 : 0.82) : lastBar ? 0.3 : 0.04;
        beats.push({ time, count: p.count, beat: p.beat, bar: p.bar, strength });
        if (groove) { kicked = Math.max(kicked, strength); lastKick = time; }
        next++;
      }
      // Hats on the off-beats (every sixteenth up the build; none in the breakdown).
      const section = lastSection;
      const sub = section === 'build' ? 4 : 2;
      const step = Math.floor(((now - t0) / period) * sub);
      let hat = 0;
      if (step !== hatStep && step >= 0) {
        hatStep = step;
        if (section === 'build' || (section === 'groove' && step % 2 === 1)) {
          hat = section === 'build' ? 0.45 : 0.6;
          lastHat = now;
        }
      }

      const build = climb(now);
      const low = section !== 'groove';
      const kickEnv = low ? 0 : Math.exp(-Math.max(0, now - lastKick) / 0.12);
      const hatEnv = Math.exp(-Math.max(0, now - lastHat) / 0.06);
      const level = low ? 0.28 + 0.5 * build : 0.72 + 0.1 * kickEnv;
      const bands = {
        bass: low ? 0.08 : 0.35 + 0.6 * kickEnv,
        lowMid: low ? 0.2 + 0.2 * build : 0.4 + 0.3 * kickEnv,
        mid: 0.42 + 0.08 * Math.sin(now * 1.7) + 0.2 * build,
        highMid: 0.35 + 0.3 * hatEnv + 0.25 * build,
        high: 0.3 + 0.45 * hatEnv + 0.3 * build,
      };
      for (const b of BANDS) bands[b] = Math.min(1, Math.max(0, bands[b]));
      return {
        time: now, rms: 0.3 * level, level, kick: kicked, hat, beats, events,
        bands, bpm, locked: true, strength: 0.8,
        state: section, build: low ? build : 0, breakdownFor: low ? Math.max(0, now - lowAt) : 0,
        intensity: low ? 0.3 : 0.85, drop, dropScore: drop ? 1 : 0,
      };
    },
  };
}
