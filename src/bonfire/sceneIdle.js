// Work spread over the page's idle moments, so it never stalls the fire: a knight's template
// built a few ms at a time (inSteps), and the places built beforehand only in time the page
// has spare (inIdle). Each runs a generator a step at a time and resolves with what it
// returns, or null if the scene is gone first.

// A moment the page isn't busy (a frame's spare time; Safari has no requestIdleCallback).
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 250 }) : setTimeout(fn, 16));
// The places built beforehand (Bonfire Live, the Painter): how long after the show is up they
// start, and the idle time left a step needs to start: most (a few pieces merged, a few rows
// of a height map, a map drawn) take about a ms or less; a place's own build 3 to 10. Never
// more than this share of the display's frame, though: no idle moment is longer than one (a
// 144 Hz screen's offer 4 ms or so at most, Bonfire Live drawing every frame).
export const PREBUILD_AFTER_MS = 4000;
const SMALL_STEP_MS = 3;
export const BIG_STEP_MS = 12;
const STEP_FRAME_SHARE = 0.6;

/**
 * The scene's idle-time runners: they stop when the scene is disposed (`ctx.scope`).
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createSceneIdle(ctx) {
  const { scope } = ctx;
  /**
   * Run `steps` (a generator: knights.js templateSteps) in idle moments, a few ms at a time,
   * so building a knight's template never stalls the fire. Resolves with its return value
   * (null if the scene is gone first).
   */
  function inSteps(steps) {
    return new Promise((resolve, reject) => {
      const slice = (deadline) => {
        if (scope.disposed) { resolve(null); return; }
        const budget = deadline?.timeRemaining ? Math.min(12, Math.max(4, deadline.timeRemaining())) : 8;
        const until = performance.now() + budget;
        try {
          let r = steps.next();
          while (!r.done && performance.now() < until) r = steps.next();
          if (r.done) resolve(r.value);
          else idle(slice);
        } catch (error) { reject(error); }
      };
      idle(slice);
    });
  }
  /**
   * Run `steps` only in time the page truly has spare, for work nobody waits on (the places
   * built beforehand: prepareSceneries). Unlike inSteps there's no timeout, and a step starts
   * only with the time it needs still left of the idle moment, so it ends before the next
   * frame is due: each yields how many ms the next one needs (a number), or nothing
   * (SMALL_STEP_MS), or a promise for the next to wait on, the page idle meanwhile. (A need is
   * capped at STEP_FRAME_SHARE of the display's frame, measured first: a step bigger than any
   * moment, a place's build on a fast screen, starts at the start of an empty one, and runs a
   * few ms past it.) On a page with no spare time (a busy phone) nothing runs, and whoever
   * needs the work first does it then (sceneryOf). Needs requestIdleCallback (Safari has none:
   * its places are built on their first visit). Resolves with the return value (null if the
   * scene is gone first).
   */
  function inIdle(steps) {
    return new Promise((resolve, reject) => {
      let need = SMALL_STEP_MS;
      let frameMs = 1000 / 60;
      const next = () => requestIdleCallback(slice);
      /** @param {IdleDeadline} deadline */
      const slice = (deadline) => {
        if (scope.disposed) { resolve(null); return; }
        try {
          while (deadline.timeRemaining() >= Math.min(need, frameMs * STEP_FRAME_SHARE)) {
            const r = steps.next();
            if (r.done) { resolve(r.value); return; }
            if (typeof r.value?.then === 'function') {
              need = SMALL_STEP_MS;
              r.value.then(next, next);
              return;
            }
            need = typeof r.value === 'number' ? r.value : SMALL_STEP_MS;
          }
          next();
        } catch (error) { reject(error); }
      };
      // (The display's frame first: the shortest of a few, frames being only ever late.)
      let last = -1;
      let frames = 0;
      let shortest = Infinity;
      const measure = (now) => {
        if (scope.disposed) { resolve(null); return; }
        if (last >= 0) shortest = Math.min(shortest, now - last);
        last = now;
        if (++frames <= 8) { requestAnimationFrame(measure); return; }
        if (shortest > 0 && Number.isFinite(shortest)) frameMs = shortest;
        next();
      };
      requestAnimationFrame(measure);
    });
  }
  return { inSteps, inIdle };
}
