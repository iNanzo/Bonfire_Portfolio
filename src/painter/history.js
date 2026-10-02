// The Painter's undo and redo: every edit is a step, and the scene before it is kept.
//
// Edits come in fast while a slider is dragged or a color is picked, so steps on the same
// field (the same `key`, a scene path like "details.glowSize") within `coalesceMs` of the
// last one merge into one: undo takes the whole drag back, not one pixel of it. A new edit
// after an undo drops what could have been redone. At most `limit` steps are kept (the
// oldest go first).
//
// States are copied in and out (structuredClone), so nobody can change a kept one by
// accident. Pure: no DOM, the clock passed in (tests use their own).

/**
 * @template T
 * @param {{ limit?: number, coalesceMs?: number, now?: () => number }} [o]
 */
export function createHistory({ limit = 100, coalesceMs = 600, now = () => Date.now() } = {}) {
  /** @type {T[]} */
  let past = [];
  /** @type {T[]} */
  let future = [];
  let lastKey = null; // the field the last step changed (null: none to merge with)
  let lastAt = -Infinity;

  return {
    /**
     * An edit is about to change `before` (the scene as it is now). `key`: which field
     * (edits of the same one close together merge into one step; null never merges).
     * Returns true if it began a new step.
     * @param {T} before
     * @param {string | null} [key]
     */
    push(before, key = null) {
      const t = now();
      const merge = key !== null && key === lastKey && t - lastAt <= coalesceMs && past.length > 0;
      lastKey = key;
      lastAt = t;
      future = [];
      if (merge) return false;
      past.push(structuredClone(before));
      if (past.length > limit) past = past.slice(past.length - limit);
      return true;
    },
    /**
     * Step back: the scene before the last step (`current` goes to redo), or null.
     * @param {T} current
     * @returns {T | null}
     */
    undo(current) {
      if (!past.length) return null;
      future.push(structuredClone(current));
      lastKey = null;
      return structuredClone(past.pop());
    },
    /**
     * Step forward again: the scene an undo took back (`current` goes to undo), or null.
     * @param {T} current
     * @returns {T | null}
     */
    redo(current) {
      if (!future.length) return null;
      past.push(structuredClone(current));
      lastKey = null;
      return structuredClone(future.pop());
    },
    /** The next edit starts a step of its own, whatever it changes (a click after a drag). */
    seal() {
      lastKey = null;
    },
    /** Forget every step (a scene opened from the library). */
    clear() {
      past = [];
      future = [];
      lastKey = null;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    /** How many steps back there are. */
    get size() {
      return past.length;
    },
  };
}
