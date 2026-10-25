// The invitation toy's frame-time governor (pure: no three.js, no DOM): while frames stay slow it
// steps the texel grid coarser (stage.js adds `level` device px to every texel, never finer than
// the user's Pixel Size), and steps back once they're fast again. stage.js feeds it each frame's
// interval (governStep) and refits the grid when the level changes.
//
// It judges whole seconds of frames: at each second's end, that second's 90th percentile frame
// time (p90). Slow (p90 over GOVERN.slowMs: more than one frame in ten misses a 60 Hz deadline)
// steps one level coarser; a run of fast seconds (p90 under GOVERN.fastMs) as long as `recover`
// steps one finer. Between the two it holds: the hysteresis. A coarser step that doesn't make
// the frames faster (a screen locked at 30 Hz, a busy CPU: fewer texels won't help) is taken back
// and no coarser one is tried for GOVERN.block seconds, nor ever again while the slow seconds
// are about as slow as the one that made it (within GOVERN.same), so it never coarsens for
// nothing: once it has learned that, a 30 Hz screen keeps the user's grid. A finer step that turns
// slow again within GOVERN.relapse seconds doubles the run it takes to try again (up to
// GOVERN.recoverMax, minutes, so a device only fast at a coarser level is tried less and less
// often), and a finer step that holds GOVERN.calm seconds brings that back down. A new Pixel Size
// (governReset) forgets both. The frames just after a change are left out (GOVERN.settle: the
// grid's refit costs a frame), and so is any interval over GOVERN.maxGap (a tab coming back, a
// load).

/** The governor's numbers: milliseconds for frame times, seconds for the rest. */
export const GOVERN = Object.freeze({
  /** A second whose p90 is over this is slow. */
  slowMs: 20,
  /** One whose p90 is under this is fast (60 Hz frames, 16.7 ms, are fast; 50 fps is neither). */
  fastMs: 18,
  /** Fast seconds in a row before it tries one level finer. */
  recover: 3,
  /** The most that run grows to after relapses. */
  recoverMax: 240,
  /** A finer step that's slow again within this many seconds was a relapse. */
  relapse: 5,
  /** Seconds a finer step holds after which the recovery run is back to `recover`. */
  calm: 30,
  /** After a coarser step that didn't help, no coarser step for this long. */
  block: 30,
  /**
   * …nor while a slow second's p90 is within this share of the one that made that step (the
   * same frame time: fewer texels still won't help).
   */
  same: 0.15,
  /** A coarser step helped when the next p90 is under this share of the one before it. */
  helped: 0.9,
  /** Seconds of frames left out after a change. */
  settle: 0.3,
  /** Intervals over this many ms are left out. */
  maxGap: 250,
  /** The fewest frames that make a second worth judging. */
  minFrames: 10,
  /** The coarsest it goes: this many device px added to a texel. */
  maxLevel: 4,
});

/** The most frames a second holds (a 240 Hz screen's, with room). */
const CAP = 512;

/**
 * @typedef {object} GovernorState
 * @property {number} level  device px added to every texel (0: the user's Pixel Size as it is)
 * @property {number} p90  the last judged second's 90th percentile frame time, ms (0 before one)
 * @property {Float64Array} frames  this second's intervals, ms
 * @property {number} count  how many of them
 * @property {number} elapsed  ms of frames in this second so far
 * @property {number} settling  ms of frames still to leave out
 * @property {number} fastRun  fast seconds in a row
 * @property {number} recover  the fast run it takes now
 * @property {number} sinceFiner  seconds since the last finer step, while it holds (Infinity:
 *   none, or a coarser step since)
 * @property {number} sinceChange  seconds since the last change of level
 * @property {number} blocked  seconds left with no coarser step
 * @property {number|null} before  the p90 that made the last coarser step (null: none to check)
 * @property {number|null} failed  the p90 that made the last coarser step that didn't help (null: none)
 * @property {typeof GOVERN} tune
 */

/**
 * A governor at level 0.
 * @param {Partial<typeof GOVERN>} [tune]  any of GOVERN's numbers overridden
 * @returns {GovernorState}
 */
export function createGovernor(tune = {}) {
  const t = { ...GOVERN, ...tune };
  return {
    level: 0,
    p90: 0,
    frames: new Float64Array(CAP),
    count: 0,
    elapsed: 0,
    settling: 0,
    fastRun: 0,
    recover: t.recover,
    sinceFiner: Infinity,
    sinceChange: 0,
    blocked: 0,
    before: null,
    failed: null,
    tune: t,
  };
}

/**
 * The value at share `p` (0..1) of the first `n` entries of `a`, sorted in place (nearest rank).
 * @param {Float64Array} a
 * @param {number} n
 * @param {number} p
 */
export function percentile(a, n, p) {
  if (n <= 0) return 0;
  const s = a.subarray(0, n).sort();
  return s[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
}

/**
 * Back to level `level` (0 by default) with nothing judged or learned yet: a new Pixel Size, or
 * the governor turned on.
 * @param {GovernorState} g
 * @param {number} [level]
 */
export function governReset(g, level = 0) {
  g.level = Math.max(0, Math.min(g.tune.maxLevel, Math.round(level)));
  g.count = 0;
  g.elapsed = 0;
  g.settling = g.tune.settle * 1000;
  g.fastRun = 0;
  g.recover = g.tune.recover;
  g.sinceFiner = Infinity;
  g.sinceChange = 0;
  g.blocked = 0;
  g.before = null;
  g.failed = null;
}

/**
 * A change of level: the frames just after it are left out.
 * @param {GovernorState} g
 * @param {number} level
 */
function change(g, level) {
  g.level = level;
  g.settling = g.tune.settle * 1000;
  g.count = 0;
  g.elapsed = 0;
  g.fastRun = 0;
  g.sinceChange = 0;
}

/**
 * One second judged by its p90.
 * @param {GovernorState} g
 * @param {number} p  ms
 */
function judge(g, p) {
  const t = g.tune;
  g.p90 = p;
  g.sinceFiner += 1;
  g.sinceChange += 1;
  g.blocked = Math.max(0, g.blocked - 1);
  // A finer step that has held a while: the next try needn't wait long.
  if (g.sinceFiner >= t.calm && Number.isFinite(g.sinceFiner)) g.recover = t.recover;
  // The coarser step just taken: when it didn't help, it's taken back, held off a while and
  // remembered (at this frame time it never helps).
  if (g.before !== null) {
    const before = g.before;
    g.before = null;
    if (p > t.helped * before && g.level > 0) {
      g.blocked = t.block;
      g.failed = before;
      change(g, g.level - 1);
      return;
    }
  }
  if (p > t.slowMs) {
    g.fastRun = 0;
    if (g.level >= t.maxLevel || g.blocked > 0) return;
    if (g.failed !== null && Math.abs(p - g.failed) <= t.same * g.failed) return;
    if (g.sinceFiner < t.relapse) g.recover = Math.min(t.recoverMax, g.recover * 2);
    g.sinceFiner = Infinity;
    g.before = p;
    change(g, g.level + 1);
    return;
  }
  if (p < t.fastMs) {
    g.fastRun += 1;
    if (g.level > 0 && g.fastRun >= g.recover) {
      change(g, g.level - 1);
      g.sinceFiner = 0;
    }
    return;
  }
  g.fastRun = 0;
}

/**
 * One frame's interval: kept for this second's p90, and at the second's end the level stepped
 * coarser (slow), finer (fast long enough) or held. Returns the level.
 * @param {GovernorState} g
 * @param {number} ms  the time since the last frame
 */
export function governStep(g, ms) {
  if (!(ms > 0) || ms > g.tune.maxGap) return g.level;
  if (g.settling > 0) {
    g.settling -= ms;
    return g.level;
  }
  if (g.count < CAP) g.frames[g.count++] = ms;
  g.elapsed += ms;
  if (g.elapsed < 1000) return g.level;
  const n = g.count;
  g.count = 0;
  g.elapsed = 0;
  if (n >= g.tune.minFrames) judge(g, percentile(g.frames, n, 0.9));
  return g.level;
}
