// A cap on how often the bonfire is drawn (fire.setMaxFps), for a loop that runs at the
// display's own rate (requestAnimationFrame: 60, 120, 144 Hz…). Each animation frame says how
// long it's been since the last one, and the gate says whether to draw it.
//
// It keeps the time owed since the last draw (an accumulator), so a 60 cap on a 144 Hz
// display draws every second or third frame, 60 a second on average, without drifting. A
// frame up to 1 ms early still counts (vsync timestamps jitter, and a 60 cap on a 60 Hz
// display must never skip one), and a stall (a hidden tab, a long task) never comes back
// as a burst of draws.

/** 1 ms of slack: a frame this much early is drawn anyway. */
const SLACK_MS = 1;

/**
 * @returns {{ readonly maxFps: number, setMaxFps(fps: number): void, due(ms: number): boolean }}
 */
export function createFrameGate() {
  let maxFps = 0;   // 0: no cap (every frame is drawn)
  let interval = 0; // ms between draws
  let owed = 0;     // ms since the last draw was due (what it was late by carries over; early, it owes nothing)
  let fresh = true; // (the next frame draws, and the cadence starts from it)
  return {
    get maxFps() { return maxFps; },
    /** Draw at most `fps` frames a second (0, or anything not above 0: every frame). The next frame draws. */
    setMaxFps(fps) {
      maxFps = Number.isFinite(fps) && fps > 0 ? fps : 0;
      interval = maxFps ? 1000 / maxFps : 0;
      fresh = true;
    },
    /** An animation frame, `ms` after the last one: true if it's to be drawn. */
    due(ms) {
      if (!interval) return true;
      if (fresh) { fresh = false; owed = 0; return true; }
      owed += Math.max(0, ms);
      if (owed < interval - SLACK_MS) return false;
      // (Late by a whole interval or more, a stall: the cadence starts over from here.)
      const late = owed - interval;
      owed = late >= interval ? 0 : Math.max(0, late);
      return true;
    },
  };
}
