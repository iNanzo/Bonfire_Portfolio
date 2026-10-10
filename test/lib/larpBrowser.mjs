// Browser stand-ins for the campfire game's UI tests (no DOM): a BroadcastChannel hub whose
// instances with the same name hear each other (never themselves), delivering at once, and a
// recording channel for the app.
/**
 * A fake BroadcastChannel class. Every instance made from one `fakeBroadcast()` shares a hub.
 * `failPost` makes postMessage throw (a closed channel, a value that can't be cloned).
 */
export function fakeBroadcast({ failPost = false } = {}) {
  /** @type {Set<any>} */
  const hub = new Set();
  const log = [];
  class FakeBroadcastChannel {
    /** @param {string} name */
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      this.closed = false;
      hub.add(this);
    }
    postMessage(data) {
      if (failPost || this.closed) throw new Error('DataCloneError');
      log.push({ from: this.name, data });
      const copy = structuredClone(data);
      for (const other of [...hub]) {
        if (other !== this && other.name === this.name && !other.closed) other.onmessage?.({ data: copy });
      }
    }
    close() {
      this.closed = true;
      hub.delete(this);
    }
  }
  return { FakeBroadcastChannel, hub, log };
}

/** A channel that records what the app posts. */
export function recordingChannel() {
  const sent = [];
  return { sent, post: (msg) => (sent.push(structuredClone(msg)), true) };
}
