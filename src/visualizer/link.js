// The Ableton Link client: connects to the bridge (tools/link-bridge.mjs) on this computer
// and hands the session's tempo and beat to the beat tracker, every frame, on its own
// clock. While the bridge is away it retries every few seconds; after 2 s without word the
// tracker goes back to listening on its own (tempo.js external()).

/**
 * @param {object} o
 * @param {() => number} o.port             the bridge's WebSocket port
 * @param {(text: string) => void} o.onStatus  a line for the settings (connected, BPM…)
 */
export function createLinkClient({ port, onStatus = () => {} }) {
  let ws = null;
  let retryAt = 0;
  let last = null; // { bpm, beat, peers, at (s, performance clock) }
  let status = '';
  const say = (text) => { if (text !== status) { status = text; onStatus(text); } };

  function connect(now) {
    retryAt = now + 3;
    try { ws = new WebSocket(`ws://127.0.0.1:${port()}`); } catch { ws = null; return; }
    say(`Looking for the Link bridge on port ${port()}…`);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.bpm > 0 && Number.isFinite(m.beat)) last = { bpm: m.bpm, beat: m.beat, peers: m.peers ?? 0, at: performance.now() / 1000 };
      } catch { /* not ours */ }
    };
    ws.onclose = () => { ws = null; last = null; say(`No Link bridge on port ${port()}. Is it running (npm run link)?`); };
    ws.onerror = () => {};
  }

  return {
    /**
     * Each frame while Link is the beat's source: keep connected, and give `tempo`
     * (tempo.js) the session's beat at `now`. Returns true while it's in charge.
     */
    update(now, tempo) {
      if (!ws && now >= retryAt) connect(now);
      if (!last || now - last.at > 1) return false;
      tempo.external(last.bpm, last.beat + (now - last.at) * (last.bpm / 60), now);
      say(`Linked: ${last.bpm.toFixed(1)} BPM · ${last.peers} other app${last.peers === 1 ? '' : 's'} in the session`);
      return true;
    },
    /** Let go (Link switched off). */
    close() {
      if (ws) { ws.onclose = null; ws.close(); }
      ws = null;
      last = null;
      retryAt = 0;
      say('');
    },
    get bpm() { return last?.bpm ?? 0; },
  };
}
