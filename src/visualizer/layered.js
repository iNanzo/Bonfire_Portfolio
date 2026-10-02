// Settings with a scene laid over them. A preset scene is mostly a temporary layer of
// settings: while it plays, the director and every part of the show (the render show,
// the colors, the knights, the camera, the bar clock) read the scene's values first and
// the user's for everything the scene leaves alone. Writes always go to the user's own
// settings underneath, so saving, My Setups and the presets never see the scene; taking
// the layer away (or releasing a key the user has just touched) hands those values back.
//
// `view` is a Proxy over the user's settings object: reads, `in`, Object.keys, spreads
// and JSON see the overlay's keys over the user's.

/** Keys only a scene's overlay sets (the readers use `?.` and fall back without one). */
export const SCENE_ONLY = ['knightHelmetOrder', 'xrayView'];

/**
 * @param {Record<string, any>} base the user's settings (kept, written to)
 * @returns {{ view: Record<string, any>, set(over: Record<string, any> | null): void,
 *   readonly over: Record<string, any> | null, release(keys: string[]): void }}
 */
export function createLayered(base) {
  /** @type {Record<string, any> | null} */
  let over = null;
  /** @param {string | symbol} k */
  const layered = (k) => over !== null && typeof k === 'string' && Object.hasOwn(over, k);
  const view = new Proxy(base, {
    get: (t, k, r) => (layered(k) ? over[/** @type {string} */ (k)] : Reflect.get(t, k, r)),
    set: (t, k, v) => Reflect.set(t, k, v),
    has: (t, k) => layered(k) || Reflect.has(t, k),
    deleteProperty: (t, k) => Reflect.deleteProperty(t, k),
    ownKeys: (t) => [...new Set([...Reflect.ownKeys(t), ...(over ? Object.keys(over) : [])])],
    getOwnPropertyDescriptor(t, k) {
      if (!layered(k)) return Reflect.getOwnPropertyDescriptor(t, k);
      return { value: over[/** @type {string} */ (k)], writable: true, enumerable: true, configurable: true };
    },
  });
  return {
    view,
    /** Lay a scene's settings over the user's (null: take it away). */
    set(o) {
      over = o ? { ...o } : null;
    },
    /** The overlay as it stands (null: none). */
    get over() {
      return over;
    },
    /** The user's hand wins for these keys until the next overlay. */
    release(keys) {
      if (!over) return;
      for (const k of keys) delete over[k];
    },
  };
}
