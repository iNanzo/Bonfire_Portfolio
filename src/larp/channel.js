// The link between the host window and the display window (the design's "The Two Windows"): one
// BroadcastChannel on the laptop, no network. The host posts the public projection after every
// change; a display that opens (or reloads) says hello and the host answers with the current one,
// so it catches up at once (mid-reveal included). Heartbeats every second let the host show the
// display window's state (not opened, open, closed) and let a display show "Host window closed";
// they also keep a second host window from editing the same event (A25): the window that opened
// later yields to an active one, and Take Over moves the lock explicitly.
//
//   createChannel({ name, BroadcastChannelImpl })   a thin wrapper (post, onMessage, close) that
//                         never throws; `available` false where BroadcastChannel is missing
//   host side (pure):     initHostLink, hostStart, hostReceive, hostTick, hostTakeOver, hostStatus
//   display side (pure):  initDisplayLink, displayStart, displayReceive, displayTick, displayStatus
//   createHostLink / createDisplayLink   the pure functions wired to a channel and a clock; the
//                         DOM layer calls tick() every HEARTBEAT_MS (setInterval) and close() on
//                         pagehide (which posts 'bye')
//   publicEvents(events)  the game events the display may see (for the stage's cues): never an
//                         award, a status or a setup change, and never their ids
//
// Messages (`windowId` is the sender's; nothing private is ever posted):
//   { type: 'projection', projection: Projection|null, events: PublicEvent[] }   host → display
//   { type: 'hello', windowId }                         display opened: send me the projection
//   { type: 'display', windowId, webgl: boolean|null }  display heartbeat (webgl null: unknown yet)
//   { type: 'hostHello', windowId, startedAt }          a host window opened: is one active?
//   { type: 'host', windowId, startedAt, active }       host heartbeat (and the answer to hostHello)
//   { type: 'takeover', windowId, startedAt }           this host window takes the lock
//   { type: 'bye', windowId, role: 'host'|'display' }   a window closing
//   { type: 'testPattern', show: boolean }              host → display: Show Test Pattern
/**
 * @typedef {import('./types.js').Projection} Projection
 * @typedef {import('./types.js').GameEvent} GameEvent
 * @typedef {Pick<GameEvent, 'type'|'roundId'|'teamId'|'from'|'to'>} PublicEvent
 * @typedef {{ type: 'projection', projection: Projection|null, events: PublicEvent[] }
 *   | { type: 'hello', windowId: string }
 *   | { type: 'display', windowId: string, webgl: boolean|null }
 *   | { type: 'hostHello', windowId: string, startedAt: number }
 *   | { type: 'host', windowId: string, startedAt: number, active: boolean }
 *   | { type: 'takeover', windowId: string, startedAt: number }
 *   | { type: 'bye', windowId: string, role: 'host'|'display' }
 *   | { type: 'testPattern', show: boolean }} LinkMessage
 * @typedef {{ available: boolean, post(msg: LinkMessage): boolean, onMessage(fn: (msg: LinkMessage) => void): () => void, close(): void }} Channel
 */

/** The channel's name: one game per laptop browser, so one fixed name (projections carry eventId). */
export const CHANNEL_NAME = 'larp.channel';
/** How often a window says it's still there (ms). */
export const HEARTBEAT_MS = 1000;
/** A peer unheard for longer than this (ms) counts as closed: three missed heartbeats and a margin. */
export const PEER_TIMEOUT_MS = 3500;

const TYPES = new Set(['projection', 'hello', 'display', 'hostHello', 'host', 'takeover', 'bye', 'testPattern']);

/**
 * Whether `data` looks like one of the link's messages (anything else on the channel is ignored).
 * @param {unknown} data
 * @returns {data is LinkMessage}
 */
export function isMessage(data) {
  return !!data && typeof data === 'object' && TYPES.has(/** @type {any} */ (data).type);
}

/**
 * A BroadcastChannel wrapper that never throws (a closed channel, a value that can't be cloned).
 * @param {{ name?: string, BroadcastChannelImpl?: any }} [opts] BroadcastChannelImpl defaults to the
 *   global one; tests pass a fake with the same shape (postMessage, onmessage or addEventListener, close)
 * @returns {Channel}
 */
export function createChannel({ name = CHANNEL_NAME, BroadcastChannelImpl = globalThis.BroadcastChannel } = {}) {
  /** @type {Set<(msg: LinkMessage) => void>} */
  const listeners = new Set();
  let bc = null;
  try {
    bc = typeof BroadcastChannelImpl === 'function' ? new BroadcastChannelImpl(name) : null;
  } catch {
    bc = null;
  }
  if (bc) {
    bc.onmessage = (/** @type {{ data: unknown }} */ e) => {
      if (!isMessage(e?.data)) return;
      for (const fn of [...listeners]) fn(e.data);
    };
  }
  return {
    available: !!bc,
    post(msg) {
      if (!bc) return false;
      try {
        bc.postMessage(msg);
        return true;
      } catch {
        return false;
      }
    },
    onMessage(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      listeners.clear();
      try {
        bc?.close();
      } catch {
        // already closed
      }
      bc = null;
    },
  };
}

// ── Public game events ──────────────────────────────────────────────────────────────────────

const PUBLIC_EVENT_TYPES = new Set([
  'configChanged',
  'eventStarted',
  'phaseChanged',
  'roundStarted',
  'turnStarted',
  'timerChanged',
  'roundPublished',
  'revealStep',
  'revealFinished',
  'roundSkipped',
  'teamAdded',
  'correctionAdded',
  'eventFinished',
]);

/**
 * The game events the display may know about, stripped to type, round, team and phase names (no
 * ids: a draft's id would hint that an award exists). Awards, statuses, reviews and setup edits are
 * never passed on.
 * @param {GameEvent[]|undefined} events
 * @returns {PublicEvent[]}
 */
export function publicEvents(events) {
  return (events ?? [])
    .filter((e) => PUBLIC_EVENT_TYPES.has(e.type))
    .map((e) => {
      /** @type {PublicEvent} */
      const out = { type: e.type };
      if (e.roundId) out.roundId = e.roundId;
      if (e.teamId) out.teamId = e.teamId;
      if (e.from) out.from = e.from;
      if (e.to) out.to = e.to;
      return out;
    });
}

// ── The host side (pure) ────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ windowId: string, startedAt: number, seen: number, closed: boolean }} PeerHost
 * @typedef {{ windowId: string, seen: number, webgl: boolean|null, closed: boolean }} PeerDisplay
 * @typedef {{
 *   windowId: string, startedAt: number, active: boolean, takenOver: boolean,
 *   otherHost: PeerHost|null, display: PeerDisplay|null,
 * }} HostLinkState
 * @typedef {{
 *   active: boolean, takenOver: boolean, otherHost: 'none'|'active'|'gone',
 *   display: 'notOpened'|'open'|'closed', displayWebgl: boolean|null,
 * }} HostLinkStatus
 * @typedef {{ state: HostLinkState, send: LinkMessage[], sendProjection?: boolean }} HostStep
 */

/**
 * A host window's link state as it opens: active until an older active host answers.
 * @param {{ windowId: string, now: number }} o
 * @returns {HostLinkState}
 */
export function initHostLink({ windowId, now }) {
  return { windowId, startedAt: now, active: true, takenOver: false, otherHost: null, display: null };
}

/** @param {HostLinkState} s @returns {LinkMessage} */
const heartbeat = (s) => ({ type: 'host', windowId: s.windowId, startedAt: s.startedAt, active: s.active });

/**
 * What a host window posts as it opens: hostHello (an active host answers at once).
 * @param {HostLinkState} state
 * @returns {LinkMessage[]}
 */
export function hostStart(state) {
  return [{ type: 'hostHello', windowId: state.windowId, startedAt: state.startedAt }];
}

/**
 * Whether host `a` opened before host `b` (ties broken by window id), so `b` yields to it.
 * @param {{ startedAt: number, windowId: string }} a
 * @param {{ startedAt: number, windowId: string }} b
 */
const older = (a, b) => a.startedAt < b.startedAt || (a.startedAt === b.startedAt && a.windowId < b.windowId);

/**
 * A message arriving at a host window. `sendProjection` asks the caller to post the current
 * projection (a display said hello to the active host).
 * @param {HostLinkState} state
 * @param {LinkMessage} msg
 * @param {number} now
 * @returns {HostStep}
 */
export function hostReceive(state, msg, now) {
  if (!isMessage(msg) || ('windowId' in msg && msg.windowId === state.windowId)) return { state, send: [] };
  const handle = HOST_HANDLERS[msg.type];
  return handle ? handle(state, /** @type {any} */ (msg), now) : { state, send: [] };
}

/** @param {{ windowId: string, startedAt: number }} msg @param {number} now @returns {PeerHost} */
const peerHost = (msg, now) => ({ windowId: msg.windowId, startedAt: msg.startedAt, seen: now, closed: false });

/** @type {Record<string, (state: HostLinkState, msg: any, now: number) => HostStep>} */
const HOST_HANDLERS = {
  // A display said hello (send it the projection) or is still there.
  hello: (state, msg, now) => ({
    state: {
      ...state,
      display: { windowId: msg.windowId, seen: now, webgl: state.display?.webgl ?? null, closed: false },
    },
    send: [],
    sendProjection: state.active,
  }),
  display: (state, msg, now) => ({
    state: { ...state, display: { windowId: msg.windowId, seen: now, webgl: msg.webgl ?? null, closed: false } },
    send: [],
  }),
  // Another host window opened: the active one answers at once, so it knows to yield.
  hostHello: (state) => ({ state, send: state.active ? [heartbeat(state)] : [] }),
  // An older active host wins; a newer one yields when it hears this window's heartbeat.
  host: (state, msg, now) => {
    const peer = peerHost(msg, now);
    if (msg.active && state.active && older(peer, state))
      return { state: { ...state, active: false, otherHost: peer }, send: [] };
    if (!state.active && (msg.active || state.otherHost?.windowId === msg.windowId)) {
      return { state: { ...state, otherHost: peer }, send: [] };
    }
    return { state, send: [] };
  },
  takeover: (state, msg, now) => ({
    state: { ...state, active: false, takenOver: true, otherHost: peerHost(msg, now) },
    send: [],
  }),
  bye: (state, msg) => {
    if (msg.role === 'display' && state.display?.windowId === msg.windowId) {
      return { state: { ...state, display: { ...state.display, closed: true } }, send: [] };
    }
    if (msg.role === 'host' && state.otherHost?.windowId === msg.windowId) {
      return { state: { ...state, otherHost: { ...state.otherHost, closed: true } }, send: [] };
    }
    return { state, send: [] };
  },
};

/**
 * Every HEARTBEAT_MS: an active host says so (an inactive one stays quiet).
 * @param {HostLinkState} state
 * @returns {HostStep}
 */
export function hostTick(state) {
  return { state, send: state.active ? [heartbeat(state)] : [] };
}

/**
 * This window takes the lock: every other host window yields (and shows it was taken over).
 * The caller reloads the saved event before editing (the other window kept saving).
 * @param {HostLinkState} state
 * @returns {HostStep}
 */
export function hostTakeOver(state) {
  const next = { ...state, active: true, takenOver: false, otherHost: null };
  return { state: next, send: [{ type: 'takeover', windowId: state.windowId, startedAt: state.startedAt }] };
}

/**
 * What the host console shows about the link.
 * @param {HostLinkState} state
 * @param {number} now
 * @returns {HostLinkStatus}
 */
export function hostStatus(state, now) {
  const alive = (/** @type {{ seen: number, closed: boolean }|null} */ p) =>
    !!p && !p.closed && now - p.seen <= PEER_TIMEOUT_MS;
  return {
    active: state.active,
    takenOver: state.takenOver,
    otherHost: !state.otherHost ? 'none' : alive(state.otherHost) ? 'active' : 'gone',
    display: !state.display ? 'notOpened' : alive(state.display) ? 'open' : 'closed',
    displayWebgl: state.display?.webgl ?? null,
  };
}

// ── The display side (pure) ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   windowId: string, projection: Projection|null, events: PublicEvent[], received: number,
 *   hostSeen: number|null, hostEver: boolean, testPattern: boolean, webgl: boolean|null,
 * }} DisplayLinkState
 * `received` counts projections (a renderer can tell a new one from a re-render).
 * @typedef {{ hostClosed: boolean, waiting: boolean }} DisplayLinkStatus
 */

/**
 * @param {{ windowId: string }} o
 * @returns {DisplayLinkState}
 */
export function initDisplayLink({ windowId }) {
  return {
    windowId,
    projection: null,
    events: [],
    received: 0,
    hostSeen: null,
    hostEver: false,
    testPattern: false,
    webgl: null,
  };
}

/**
 * What a display posts as it opens: hello (the active host answers with the projection).
 * @param {DisplayLinkState} state
 * @returns {LinkMessage[]}
 */
export function displayStart(state) {
  return [{ type: 'hello', windowId: state.windowId }];
}

/**
 * A message arriving at the display. The display never writes state; it keeps the last
 * projection it was sent (a closed host leaves it on screen).
 * @param {DisplayLinkState} state
 * @param {LinkMessage} msg
 * @param {number} now
 * @returns {DisplayLinkState}
 */
export function displayReceive(state, msg, now) {
  if (!isMessage(msg)) return state;
  switch (msg.type) {
    case 'projection':
      return {
        ...state,
        projection: msg.projection ?? null,
        events: Array.isArray(msg.events) ? msg.events : [],
        received: state.received + 1,
        hostSeen: now,
        hostEver: true,
      };
    case 'host':
      return msg.active ? { ...state, hostSeen: now, hostEver: true } : state;
    case 'bye':
      return msg.role === 'host' ? { ...state, hostSeen: null } : state;
    case 'testPattern':
      return { ...state, testPattern: !!msg.show };
    default:
      return state;
  }
}

/**
 * Every HEARTBEAT_MS: the display says it's open (and whether its scene has WebGL).
 * @param {DisplayLinkState} state
 * @returns {LinkMessage[]}
 */
export function displayTick(state) {
  return [{ type: 'display', windowId: state.windowId, webgl: state.webgl }];
}

/**
 * Whether to show the "Host window closed" chip: a host was heard and has gone quiet or said bye.
 * `waiting`: no host heard yet (the display shows its idle card).
 * @param {DisplayLinkState} state
 * @param {number} now
 * @returns {DisplayLinkStatus}
 */
export function displayStatus(state, now) {
  const quiet = state.hostSeen === null || now - state.hostSeen > PEER_TIMEOUT_MS;
  return { hostClosed: state.hostEver && quiet, waiting: !state.hostEver };
}

// ── Wiring ──────────────────────────────────────────────────────────────────────────────────

/**
 * The host's link: heartbeats, hello answers, the single-host lock.
 * @param {{
 *   channel: Channel, windowId: string, clock: () => number,
 *   onHello?: () => void, onChange?: (status: HostLinkStatus) => void,
 * }} o onHello: post the current projection (app.broadcast); onChange: the status may have changed
 */
export function createHostLink({ channel, windowId, clock, onHello, onChange }) {
  let state = initHostLink({ windowId, now: clock() });
  const post = (/** @type {LinkMessage[]} */ list) => list.forEach((m) => channel.post(m));
  /** @param {HostStep} step */
  const apply = (step) => {
    state = step.state;
    post(step.send);
    if (step.sendProjection) onHello?.();
    onChange?.(hostStatus(state, clock()));
  };
  const off = channel.onMessage((msg) => apply(hostReceive(state, msg, clock())));
  return {
    /** Announce this window (call once, after the app has resumed). */
    start() {
      post(hostStart(state));
      post(hostTick(state).send);
    },
    /** Every HEARTBEAT_MS. */
    tick: () => apply(hostTick(state)),
    takeOver: () => apply(hostTakeOver(state)),
    /** @param {LinkMessage} msg */
    post: (msg) => channel.post(msg),
    status: () => hostStatus(state, clock()),
    state: () => state,
    close() {
      channel.post({ type: 'bye', windowId, role: 'host' });
      off();
    },
  };
}

/**
 * The display's link: hello on start, heartbeats, the last projection.
 * @param {{ channel: Channel, windowId: string, clock: () => number, onChange?: (state: DisplayLinkState) => void }} o
 */
export function createDisplayLink({ channel, windowId, clock, onChange }) {
  let state = initDisplayLink({ windowId });
  const off = channel.onMessage((msg) => {
    const next = displayReceive(state, msg, clock());
    if (next === state) return;
    state = next;
    onChange?.(state);
  });
  return {
    start() {
      displayStart(state).forEach((m) => channel.post(m));
    },
    tick() {
      displayTick(state).forEach((m) => channel.post(m));
    },
    /** @param {boolean} ok whether the scene started (WebGL) */
    setWebgl(ok) {
      state = { ...state, webgl: !!ok };
    },
    state: () => state,
    status: () => displayStatus(state, clock()),
    close() {
      channel.post({ type: 'bye', windowId, role: 'display' });
      off();
    },
  };
}
