// The music heard between two drawn frames, as one frame's worth. With a Frame Rate cap the
// bonfire skips some of the display's frames (scene.js setMaxFps), but the analyser still
// listens on every one (createBonfire's onTick), so a beat is placed as finely as before.
// What it hears on the skipped frames mustn't be lost before the next drawn frame hands it
// to the director: every beat and section event is kept, the strongest kick and hat, and
// the drop's size from the frame it was heard on. The levels (bands, the state, the tempo)
// are the latest. Uncapped, each frame takes exactly the one tick before it.

/**
 * @typedef {{ beats: any[], events: string[], kick: number, hat: number, drop: string | null }} Moments
 * the parts of the analyser's features (analyser.js) that happen on one frame
 */

/**
 * @returns {{ add(f: Moments & Record<string, any>): void, take(): (Moments & Record<string, any>) | null, clear(): void }}
 */
export function createTickBatch() {
  /** @type {Record<string, any> | null} */
  let last = null;
  // Two sets of lists, swapped: the one a take() handed out stays as it was while the
  // director reads it, the other fills (nothing allocated frame to frame).
  let filling = { beats: [], events: [] };
  let handed = { beats: [], events: [] };
  let kick = 0;
  let hat = 0;
  /** @type {string | null} */
  let drop = null;
  /** @type {any} */
  const out = {};
  return {
    /** A tick's features (the analyser reuses its object: the lists are copied out now). */
    add(f) {
      last = f;
      for (const b of f.beats) filling.beats.push(b);
      for (const e of f.events) filling.events.push(e);
      kick = Math.max(kick, f.kick || 0);
      hat = Math.max(hat, f.hat || 0);
      if (f.drop) drop ??= f.drop;
    },
    /** Everything since the last take, as one frame's features (null: nothing heard yet). */
    take() {
      if (!last) return null;
      [handed, filling] = [filling, handed];
      filling.beats.length = 0;
      filling.events.length = 0;
      Object.assign(out, last, { beats: handed.beats, events: handed.events, kick, hat, drop });
      kick = 0;
      hat = 0;
      drop = null;
      return out;
    },
    /** Forget it all (a new source: what the last one played is gone). */
    clear() {
      last = null;
      filling.beats.length = 0;
      filling.events.length = 0;
      kick = 0;
      hat = 0;
      drop = null;
    },
  };
}
