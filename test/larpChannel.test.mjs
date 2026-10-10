// The link between the host and display windows (src/larp/channel.js): a display that opens or
// reloads asks for the projection and gets it at once (A17), heartbeats tell the host whether the
// display window is open and tell the display when the host window has closed, a second host
// window yields to the active one until it takes over explicitly (A25), and the stage only ever
// hears public game events (A07). Pure message handling plus the wiring, over a fake channel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_NAME,
  PEER_TIMEOUT_MS,
  createChannel,
  createDisplayLink,
  createHostLink,
  displayReceive,
  displayStart,
  displayStatus,
  displayTick,
  hostReceive,
  hostStart,
  hostStatus,
  hostTakeOver,
  hostTick,
  initDisplayLink,
  initHostLink,
  isMessage,
  publicEvents,
} from '../src/larp/channel.js';
import { fakeBroadcast } from './lib/larpBrowser.mjs';
import { makeClock } from './lib/larpFixtures.mjs';

const T = 1_000_000;

test('createChannel wraps BroadcastChannel, ignores foreign data and never throws', () => {
  const { FakeBroadcastChannel } = fakeBroadcast();
  const a = createChannel({ BroadcastChannelImpl: FakeBroadcastChannel });
  const b = createChannel({ BroadcastChannelImpl: FakeBroadcastChannel });
  const elsewhere = createChannel({ name: 'other', BroadcastChannelImpl: FakeBroadcastChannel });
  const got = [];
  const off = b.onMessage((m) => got.push(m));
  elsewhere.onMessage((m) => got.push(['wrong channel', m]));
  assert.equal(a.available, true);
  assert.equal(a.post({ type: 'hello', windowId: 'w1' }), true);
  a.post(/** @type {any} */ ({ type: 'nonsense' }));
  a.post(/** @type {any} */ ('text'));
  assert.deepEqual(got, [{ type: 'hello', windowId: 'w1' }]);
  off();
  a.post({ type: 'hello', windowId: 'w2' });
  assert.equal(got.length, 1);
  a.close();
  a.close();
  assert.equal(a.post({ type: 'hello', windowId: 'w3' }), false);

  const none = createChannel({ BroadcastChannelImpl: null });
  assert.equal(none.available, false);
  assert.equal(none.post({ type: 'hello', windowId: 'x' }), false);
  none.close();
  const throwing = createChannel({
    BroadcastChannelImpl: class {
      constructor() {
        throw new Error('blocked');
      }
    },
  });
  assert.equal(throwing.available, false);
  const failing = createChannel({ BroadcastChannelImpl: fakeBroadcast({ failPost: true }).FakeBroadcastChannel });
  assert.equal(failing.post({ type: 'hello', windowId: 'x' }), false);
  assert.equal(CHANNEL_NAME.startsWith('larp.'), true);
});

test('isMessage knows the link messages only', () => {
  assert.equal(isMessage({ type: 'projection' }), true);
  assert.equal(isMessage({ type: 'evil' }), false);
  assert.equal(isMessage(null), false);
  assert.equal(isMessage('hello'), false);
});

test('the active host answers a display hello with the projection; heartbeats mark it open, then closed', () => {
  let s = initHostLink({ windowId: 'h1', now: T });
  assert.deepEqual(hostStart(s), [{ type: 'hostHello', windowId: 'h1', startedAt: T }]);
  assert.equal(hostStatus(s, T).display, 'notOpened');
  const step = hostReceive(s, { type: 'hello', windowId: 'd1' }, T + 10);
  assert.equal(step.sendProjection, true);
  s = step.state;
  assert.equal(hostStatus(s, T + 10).display, 'open');
  assert.equal(hostStatus(s, T + 10).displayWebgl, null);
  s = hostReceive(s, { type: 'display', windowId: 'd1', webgl: false }, T + 1000).state;
  assert.deepEqual(hostStatus(s, T + 1000), {
    active: true,
    takenOver: false,
    otherHost: 'none',
    display: 'open',
    displayWebgl: false,
  });
  assert.equal(hostStatus(s, T + 1000 + PEER_TIMEOUT_MS + 1).display, 'closed', 'missed heartbeats');
  s = hostReceive(s, { type: 'hello', windowId: 'd1' }, T + 2000).state;
  assert.equal(hostStatus(s, T + 2000).displayWebgl, false, 'hello keeps what the display said');
  s = hostReceive(s, { type: 'bye', windowId: 'd1', role: 'display' }, T + 2001).state;
  assert.equal(hostStatus(s, T + 2001).display, 'closed', 'bye closes at once');
  const ignored = hostReceive(s, { type: 'bye', windowId: 'd9', role: 'display' }, T + 2002);
  assert.equal(ignored.state, s);
  assert.deepEqual(hostTick(s).send, [{ type: 'host', windowId: 'h1', startedAt: T, active: true }]);
});

test('a second host window yields to the older active one, and Take Over moves the lock (A25)', () => {
  let older = initHostLink({ windowId: 'h1', now: T });
  let newer = initHostLink({ windowId: 'h2', now: T + 5000 });
  // The newer one says hello; the older active one answers with its heartbeat.
  const answer = hostReceive(older, hostStart(newer)[0], T + 5001);
  assert.deepEqual(answer.send, [{ type: 'host', windowId: 'h1', startedAt: T, active: true }]);
  newer = hostReceive(newer, answer.send[0], T + 5002).state;
  assert.equal(newer.active, false);
  assert.equal(hostStatus(newer, T + 5002).otherHost, 'active');
  assert.deepEqual(hostTick(newer).send, [], 'an inactive host stays quiet');
  assert.deepEqual(hostReceive(newer, { type: 'hostHello', windowId: 'h3', startedAt: T + 9000 }, T + 9000).send, []);
  // The older one ignores the newer one's heartbeat (it yields on its own).
  const ignored = hostReceive(older, { type: 'host', windowId: 'h2', startedAt: T + 5000, active: true }, T + 5003);
  assert.equal(ignored.state, older);
  // A display's hello is the active host's to answer.
  assert.equal(hostReceive(newer, { type: 'hello', windowId: 'd' }, T + 5004).sendProjection, false);
  // Take over.
  const take = hostTakeOver(newer);
  newer = take.state;
  assert.equal(newer.active, true);
  assert.deepEqual(take.send, [{ type: 'takeover', windowId: 'h2', startedAt: T + 5000 }]);
  older = hostReceive(older, take.send[0], T + 6000).state;
  assert.deepEqual(
    { active: older.active, takenOver: older.takenOver, other: hostStatus(older, T + 6000).otherHost },
    { active: false, takenOver: true, other: 'active' },
  );
  older = hostReceive(older, hostTick(newer).send[0], T + 7000).state;
  assert.equal(older.otherHost.seen, T + 7000);
  assert.equal(hostStatus(older, T + 7000 + PEER_TIMEOUT_MS + 1).otherHost, 'gone');
  older = hostReceive(older, { type: 'bye', windowId: 'h2', role: 'host' }, T + 7001).state;
  assert.equal(hostStatus(older, T + 7001).otherHost, 'gone');
  assert.equal(hostReceive(older, { type: 'bye', windowId: 'zz', role: 'host' }, T).state, older);
  // Ties go by window id; own echoes, non-messages and display-only messages are ignored.
  const a = initHostLink({ windowId: 'a', now: T });
  const b = initHostLink({ windowId: 'b', now: T });
  assert.equal(hostReceive(b, { type: 'host', windowId: 'a', startedAt: T, active: true }, T).state.active, false);
  assert.equal(hostReceive(a, { type: 'host', windowId: 'b', startedAt: T, active: true }, T).state.active, true);
  assert.equal(hostReceive(a, { type: 'host', windowId: 'a', startedAt: 0, active: true }, T).state, a);
  assert.equal(hostReceive(a, /** @type {any} */ ({ type: 'x' }), T).state, a);
  assert.equal(hostReceive(a, { type: 'testPattern', show: true }, T).state, a);
  assert.equal(hostReceive(a, { type: 'host', windowId: 'q', startedAt: 0, active: false }, T).state, a);
});

test('the display keeps the last projection, notices the host closing, and shows the test pattern', () => {
  let s = initDisplayLink({ windowId: 'd1' });
  assert.deepEqual(displayStart(s), [{ type: 'hello', windowId: 'd1' }]);
  assert.deepEqual(displayStatus(s, T), { hostClosed: false, waiting: true });
  const projection = /** @type {any} */ ({ eventId: 'e', revision: 3 });
  s = displayReceive(s, { type: 'projection', projection, events: [{ type: 'phaseChanged' }] }, T);
  assert.equal(s.projection, projection);
  assert.equal(s.received, 1);
  assert.deepEqual(s.events, [{ type: 'phaseChanged' }]);
  assert.deepEqual(displayStatus(s, T + 1000), { hostClosed: false, waiting: false });
  assert.equal(displayStatus(s, T + PEER_TIMEOUT_MS + 1).hostClosed, true, 'no heartbeat');
  s = displayReceive(s, { type: 'host', windowId: 'h', startedAt: 0, active: true }, T + PEER_TIMEOUT_MS);
  assert.equal(displayStatus(s, T + PEER_TIMEOUT_MS + 1).hostClosed, false);
  assert.equal(displayReceive(s, { type: 'host', windowId: 'h', startedAt: 0, active: false }, T), s);
  s = displayReceive(s, { type: 'bye', windowId: 'h', role: 'host' }, T + 5000);
  assert.equal(displayStatus(s, T + 5000).hostClosed, true);
  assert.equal(s.projection, projection, 'the last state stays on screen');
  assert.equal(displayReceive(s, { type: 'bye', windowId: 'd2', role: 'display' }, T), s);
  s = displayReceive(s, { type: 'testPattern', show: true }, T);
  assert.equal(s.testPattern, true);
  s = displayReceive(s, /** @type {any} */ ({ type: 'projection', projection: undefined, events: 'x' }), T);
  assert.equal(s.projection, null);
  assert.deepEqual(s.events, []);
  assert.equal(displayReceive(s, /** @type {any} */ ({ type: 'nope' }), T), s);
  assert.equal(displayReceive(s, { type: 'hello', windowId: 'd3' }, T), s);
  assert.deepEqual(displayTick({ ...s, webgl: true }), [{ type: 'display', windowId: 'd1', webgl: true }]);
});

test('publicEvents passes phase, round, team and reveal moments on, without ids; never awards or setup', () => {
  const events = /** @type {any[]} */ ([
    { type: 'awardAdded', roundId: 'r', ids: ['adj-1'] },
    { type: 'statusSet', roundId: 'r', teamId: 't' },
    { type: 'setupChanged', teamId: 't' },
    { type: 'judgingReopened', roundId: 'r' },
    { type: 'phaseChanged', from: 'review', to: 'reveal' },
    { type: 'roundPublished', roundId: 'r', ids: ['adj-1', 'adj-2'] },
    { type: 'turnStarted', roundId: 'r', teamId: 't' },
    { type: 'correctionAdded', teamId: 't', ids: ['c'] },
  ]);
  assert.deepEqual(publicEvents(events), [
    { type: 'phaseChanged', from: 'review', to: 'reveal' },
    { type: 'roundPublished', roundId: 'r' },
    { type: 'turnStarted', roundId: 'r', teamId: 't' },
    { type: 'correctionAdded', teamId: 't' },
  ]);
  assert.deepEqual(publicEvents(undefined), []);
});

test('wired up: two host windows and a display on one channel', () => {
  const { FakeBroadcastChannel } = fakeBroadcast();
  const clock = makeClock(T);
  const chan = () => createChannel({ BroadcastChannelImpl: FakeBroadcastChannel });
  let hellos1 = 0;
  const statuses = [];
  const h1 = createHostLink({
    channel: chan(),
    windowId: 'h1',
    clock: clock.now,
    onHello: () => hellos1++,
    onChange: (s) => statuses.push(s),
  });
  h1.start();
  clock.advance(100);
  const projections = [];
  const dChan = chan();
  const d = createDisplayLink({
    channel: dChan,
    windowId: 'd1',
    clock: clock.now,
    onChange: (s) => projections.push(s.projection),
  });
  d.setWebgl(false);
  d.start();
  assert.equal(hellos1, 1, 'the active host was asked for the projection');
  assert.equal(h1.status().display, 'open');
  d.tick();
  assert.equal(h1.status().displayWebgl, false);
  h1.post({ type: 'projection', projection: /** @type {any} */ ({ eventId: 'e' }), events: [] });
  assert.deepEqual(projections.at(-1), { eventId: 'e' });
  assert.equal(d.state().projection.eventId, 'e');

  clock.advance(1000);
  const h2 = createHostLink({ channel: chan(), windowId: 'h2', clock: clock.now });
  h2.start();
  assert.equal(h2.status().active, false, 'the second window yields at once');
  h1.tick();
  assert.equal(h1.state().active, true);
  h2.takeOver();
  assert.deepEqual(
    { active: h1.status().active, takenOver: h1.status().takenOver },
    { active: false, takenOver: true },
  );
  assert.equal(h2.status().active, true);
  assert.equal(statuses.at(-1).active, false, 'onChange told the first window');
  h2.close();
  assert.equal(d.status().hostClosed, true, 'the display saw the host say bye');
  assert.equal(h1.status().otherHost, 'gone');
  d.close();
  assert.equal(h1.status().display, 'closed');
  h1.close();
});
