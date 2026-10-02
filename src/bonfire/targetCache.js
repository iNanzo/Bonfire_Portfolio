// The last few of something costly to make, by key, the one used longest ago let go first
// (frame.js keeps a set of render targets per size in one: a pixel size shift back to a
// recent size swaps its set in instead of allocating nine targets again). Pure: no three.js.

/** How many sizes' render targets frame.js keeps. */
export const KEEP_SETS = 3;

/**
 * @template T
 * @param {number} keep              how many to keep (at least 1)
 * @param {(value: T, key: string) => void} release  frees one let go (or cleared)
 */
export function createSetCache(keep, release) {
  /** @type {Map<string, T>} (in the order they were last used: the oldest first) */
  const map = new Map();
  return {
    /**
     * The value for `key`: the one kept, now the most recently used, or a new one from
     * `make()`, the oldest let go first if there are `keep` already.
     * @param {string} key
     * @param {() => T} make
     * @returns {T}
     */
    get(key, make) {
      if (map.has(key)) {
        const value = map.get(key);
        map.delete(key);
        map.set(key, value);
        return value;
      }
      while (map.size >= Math.max(1, keep)) {
        const [oldKey, old] = map.entries().next().value;
        map.delete(oldKey);
        release(old, oldKey);
      }
      const value = make();
      map.set(key, value);
      return value;
    },
    /** The keys kept, the oldest first. */
    keys: () => [...map.keys()],
    get size() {
      return map.size;
    },
    /** Let every one go. */
    clear() {
      for (const [key, value] of map) release(value, key);
      map.clear();
    },
  };
}
