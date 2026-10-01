// My scenes in the browser (src/sceneStore.js): saved normalized and in order, fresh ones
// get ids of their own; a corrupt entry reads as nothing; thumbnails are small, the
// oldest dropped first, read once per stored text (a list's rows ask for free), and the
// first thing to go when the storage is full; a storage
// that refuses a write leaves the scenes as they were; changes reach other tabs by
// BroadcastChannel or, without one, the 'storage' event; Play in Bonfire Live is answered
// (or not) within the window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSceneStore, SCENES_KEY, THUMBS_KEY, THUMB_LIMIT, THUMB_MAX } from '../src/sceneStore.js';
import { defaultScene, validateScene } from '../src/scenes.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Wait until `ok()` (the channel's messages arrive a moment later, later still on a busy machine), at most `ms`. */
async function until(ok, ms = 3000) {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await wait(10);
}

/**
 * A Storage stand-in: `capacity` in characters (keys + values) past which a write throws
 * like a full localStorage, and `failFrom`: every write from the Nth on throws.
 */
function fakeStorage({ capacity = Infinity, failFrom = Infinity } = {}) {
  const m = new Map();
  let writes = 0;
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    map: m,
    get writes() { return writes; },
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      writes++;
      const was = m.get(k);
      if (writes >= failFrom) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
      m.set(k, String(v));
      if (size() > capacity) {
        if (was === undefined) m.delete(k); else m.set(k, was);
        throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
      }
    },
    removeItem: (k) => { m.delete(k); },
  };
}
const thumbOf = (n, size = 4000) => `data:image/webp;base64,${String(n).padStart(size, 'A')}`;
const valid = (s) => { const out = []; validateScene(s, (p) => out.push(p)); return out; };
const quiet = (o = {}) => createSceneStore({ BroadcastChannel: null, events: null, ...o });

test('saving: normalized, in order; the same id replaces; fresh ones get their own id', () => {
  const storage = fakeStorage();
  const store = quiet({ storage });
  assert.equal(store.persistent, true);
  assert.deepEqual(store.list(), []);

  const a = store.save({ ...defaultScene('Moonlit Ruins'), bogus: true, fire: { level: 9 } });
  assert.equal(a.id, 'moonlit-ruins');
  assert.equal('bogus' in a, false);
  assert.equal(a.fire.level, 1);
  assert.deepEqual(valid(a), []);
  const b = store.save(defaultScene('Forge Rave'));
  assert.deepEqual(store.list().map((s) => s.id), ['moonlit-ruins', 'forge-rave']);

  // Saving the same id again is an edit.
  store.save({ ...b, name: 'Forge Rave II' });
  assert.deepEqual(store.list().map((s) => s.name), ['Moonlit Ruins', 'Forge Rave II']);
  // A copy (fresh) or a scene without an id never overwrites one.
  const copy = store.save(b, { fresh: true });
  assert.equal(copy.id, 'forge-rave-2');
  const noId = store.save({ name: 'Moonlit Ruins' });
  assert.equal(noId.id, 'moonlit-ruins-2');
  assert.equal(store.list().length, 4);

  // What's handed out is a copy: changing it changes nothing stored.
  const got = store.get('moonlit-ruins');
  got.name = 'Changed';
  assert.equal(store.get('moonlit-ruins').name, 'Moonlit Ruins');
  assert.equal(store.get('nope'), null);

  store.reorder(['forge-rave-2', 'nope', 'moonlit-ruins']);
  assert.deepEqual(store.list().map((s) => s.id), ['forge-rave-2', 'moonlit-ruins', 'forge-rave', 'moonlit-ruins-2']);
  store.setThumb('m:forge-rave', thumbOf(1));
  store.remove('forge-rave');
  assert.deepEqual(store.list().map((s) => s.id), ['forge-rave-2', 'moonlit-ruins', 'moonlit-ruins-2']);
  assert.equal(store.thumb('m:forge-rave'), null, 'its thumbnail goes with it');

  // What's stored: { v, order, scenes }.
  const data = JSON.parse(storage.getItem(SCENES_KEY));
  assert.equal(data.v, 1);
  assert.deepEqual(data.order, ['forge-rave-2', 'moonlit-ruins', 'moonlit-ruins-2']);
  assert.deepEqual(Object.keys(data.scenes).sort(), [...data.order].sort());
});

test('corrupt or hand-edited storage reads as far as it can, and saving still works', () => {
  const storage = fakeStorage();
  storage.setItem(SCENES_KEY, '{oops');
  const store = quiet({ storage });
  assert.deepEqual(store.list(), []);
  storage.setItem(SCENES_KEY, JSON.stringify({ v: 1, order: ['b', 'ghost', 'b'], scenes: { a: { name: 'A', look: { name: 'disco' } }, b: { name: 'B' }, 'Bad Id': { name: 'C' }, c: 'nope' } }));
  const list = store.list();
  assert.deepEqual(list.map((s) => s.id), ['b', 'a'], 'the order kept, the rest after, junk skipped');
  assert.equal(list[1].look.name, 'ember', 'normalized on the way out');
  for (const s of list) assert.deepEqual(valid(s), []);
  store.save(defaultScene('Fresh'));
  assert.equal(store.list().length, 3);
});

test('no localStorage at all: the scenes last for the visit, nothing throws', () => {
  const store = quiet({ storage: null });
  assert.equal(store.persistent, false);
  store.save(defaultScene('Only Now'));
  assert.equal(store.list()[0].name, 'Only Now');
  assert.equal(store.setThumb('m:only-now', thumbOf(1)), true);
});

test('thumbnails: small images only, the oldest dropped past the limit', () => {
  const store = quiet({ storage: fakeStorage() });
  assert.equal(store.setThumb('m:x', 'javascript:alert(1)'), false);
  assert.equal(store.setThumb('m:x', `data:image/webp;base64,${'A'.repeat(THUMB_MAX)}`), false, 'too big');
  assert.equal(store.setThumb('nope', thumbOf(1)), false, 'not a scene reference');
  assert.equal(store.setThumb('b:frozen-shrine', thumbOf(1, 100)), true, 'built-ins get cached thumbnails too');
  for (let i = 0; i < THUMB_LIMIT + 5; i++) assert.equal(store.setThumb(`m:s-${i}`, thumbOf(i, 100)), true);
  assert.equal(store.thumb('b:frozen-shrine'), null, 'the oldest went first');
  assert.equal(store.thumb('m:s-4'), null);
  assert.equal(store.thumb('m:s-5'), thumbOf(5, 100));
  // Setting one again makes it the newest.
  store.setThumb('m:s-5', thumbOf(50, 100));
  store.setThumb('m:s-new', thumbOf(51, 100));
  assert.equal(store.thumb('m:s-5'), thumbOf(50, 100));
  assert.equal(store.thumb('m:s-6'), null);
});

test('thumbnails are parsed once per stored text: a list asks per row for free; another tab’s write is seen', () => {
  const storage = fakeStorage();
  const store = quiet({ storage });
  for (let i = 0; i < 48; i++) store.setThumb(`m:s-${i}`, thumbOf(i, 2000));
  const parse = JSON.parse;
  let parsed = 0;
  JSON.parse = (...a) => { parsed++; return parse(...a); };
  try {
    for (let redraw = 0; redraw < 3; redraw++) for (let i = 0; i < 48; i++) assert.equal(store.thumb(`m:s-${i}`), thumbOf(i, 2000));
    assert.equal(Object.keys(store.thumbs()).length, 48, 'or all at once');
    assert.ok(parsed <= 1, `parsed ${parsed} times`);
    // Another tab (or store) writes: the new text is read.
    const other = quiet({ storage });
    other.setThumb('m:s-0', thumbOf(99, 2000));
    assert.equal(store.thumb('m:s-0'), thumbOf(99, 2000));
    storage.setItem(THUMBS_KEY, JSON.stringify({ 'b:hand-made': thumbOf(7, 10) }));
    assert.deepEqual([store.thumb('m:s-1'), store.thumb('b:hand-made')], [null, thumbOf(7, 10)]);
  } finally {
    JSON.parse = parse;
  }
  // Only its own refs: never what every object inherits.
  for (const ref of ['constructor', 'toString', '__proto__', 'm:constructor']) assert.equal(store.thumb(ref), null, ref);
  assert.ok(Object.isFrozen(store.thumbs()), 'the snapshot is read-only');
});

test('a full storage: thumbnails go first, then the save is refused and nothing changes', () => {
  const storage = fakeStorage({ capacity: 30000 });
  const store = quiet({ storage });
  store.save(defaultScene('First'));
  for (let i = 0; i < 5; i++) store.setThumb(`m:t-${i}`, thumbOf(i));
  assert.equal(Object.keys(JSON.parse(storage.getItem(THUMBS_KEY))).length, 5);
  // Saving more scenes makes room by dropping the oldest thumbnails (only as many as it takes).
  for (let i = 0; i < 12; i++) store.save(defaultScene(`Scene ${i}`));
  const left = Object.keys(JSON.parse(storage.getItem(THUMBS_KEY) ?? '{}'));
  assert.ok(left.length > 0 && left.length < 5, `some thumbnails dropped (${left.length} left)`);
  assert.deepEqual(left, ['m:t-0', 'm:t-1', 'm:t-2', 'm:t-3', 'm:t-4'].slice(5 - left.length), 'the oldest went first');
  assert.equal(store.list().length, 13, 'every scene saved');
  // A thumbnail that can't fit even alone is refused, and the scenes and the other
  // thumbnails stay as they were.
  const before = storage.getItem(SCENES_KEY);
  const thumbsBefore = storage.getItem(THUMBS_KEY);
  assert.equal(store.setThumb('m:huge', thumbOf('h', THUMB_MAX - 100)), false);
  assert.equal(storage.getItem(SCENES_KEY), before);
  assert.equal(storage.getItem(THUMBS_KEY), thumbsBefore, 'the thumbnails it would have pushed out are kept');
  assert.equal(store.thumb('m:huge'), null);

  // Keep saving until even with every thumbnail gone it doesn't fit: refused, the rest intact.
  let refused = null;
  for (let i = 0; i < 100 && !refused; i++) {
    try { store.save(defaultScene(`More ${i}`)); } catch (e) { refused = e; }
  }
  assert.ok(refused, 'eventually the storage is full');
  assert.equal(refused.name, 'StorageFull');
  assert.match(refused.message, /storage is full/);
  assert.equal(storage.getItem(THUMBS_KEY), null, 'every thumbnail was given up first');
  const n = store.list().length;
  assert.ok(n > 13);
  assert.throws(() => store.save(defaultScene('One Too Many')), { name: 'StorageFull' });
  assert.equal(store.list().length, n, 'nothing half-written');
});

test('a storage that throws on the Nth write: that save fails cleanly, reads still work', () => {
  const storage = fakeStorage({ failFrom: 3 });
  const store = quiet({ storage });
  store.save(defaultScene('One'));
  store.save(defaultScene('Two'));
  assert.throws(() => store.save(defaultScene('Three')), { name: 'StorageFull' });
  assert.deepEqual(store.list().map((s) => s.id), ['one', 'two']);
  assert.equal(store.setThumb('m:one', thumbOf(1)), false);
  assert.throws(() => store.remove('one'), { name: 'StorageFull' });
  assert.equal(store.list().length, 2);
});

test('changes: this store tells its listeners at once; other stores hear by BroadcastChannel', async () => {
  const storage = fakeStorage();
  const channelName = `scenes-test-${Math.random()}`;
  const painter = createSceneStore({ storage, channelName, events: null });
  const live = createSceneStore({ storage, channelName, events: null });
  const heard = { painter: [], live: [] };
  painter.onChange((c) => heard.painter.push(c));
  const off = live.onChange((c) => heard.live.push(c));
  painter.save(defaultScene('Shared'));
  assert.deepEqual(heard.painter, [{ what: 'scenes', remote: false }]);
  await until(() => heard.live.length > 0);
  assert.deepEqual(heard.live, [{ what: 'scenes', remote: true }]);
  assert.equal(live.get('shared').name, 'Shared', 'the other store reads it (same storage)');
  painter.setThumb('m:shared', thumbOf(1, 50));
  painter.save(defaultScene('Burst'));
  await until(() => heard.live.length > 1);
  await wait(150);
  assert.equal(heard.live.length, 2, 'a burst of changes is told once');
  assert.deepEqual(heard.live[1], { what: 'scenes', remote: true }, 'a thumbnail and a scene: the scenes changed');
  off();
  painter.save(defaultScene('Unheard'));
  await wait(120);
  assert.equal(heard.live.length, 2, 'unsubscribed');
  painter.dispose();
  live.dispose();
});

test('without BroadcastChannel, the storage event carries changes (coalesced)', async () => {
  const storage = fakeStorage();
  const events = new EventTarget();
  const store = createSceneStore({ storage, BroadcastChannel: null, events });
  const heard = [];
  store.onChange((c) => heard.push(c));
  const storageEvent = (key) => Object.assign(new Event('storage'), { key });
  events.dispatchEvent(storageEvent(SCENES_KEY));
  events.dispatchEvent(storageEvent(SCENES_KEY));
  events.dispatchEvent(storageEvent('something-else'));
  await wait(100);
  assert.deepEqual(heard, [{ what: 'scenes', remote: true }]);
  events.dispatchEvent(storageEvent(THUMBS_KEY));
  await wait(100);
  assert.deepEqual(heard.at(-1), { what: 'thumbs', remote: true });
  events.dispatchEvent(storageEvent(null));
  await wait(100);
  assert.equal(heard.length, 3, 'the storage being cleared counts too');
  store.dispose();
  events.dispatchEvent(storageEvent(SCENES_KEY));
  await wait(100);
  assert.equal(heard.length, 3, 'disposed: no more');
  assert.equal(await store.play('m:x'), false, 'no channel: nobody to ask');
});

test('Play in Bonfire Live: answered within the window, or false', async () => {
  const storage = fakeStorage();
  const channelName = `play-test-${Math.random()}`;
  const painter = createSceneStore({ storage, channelName, events: null, answerMs: 150 });
  const live = createSceneStore({ storage, channelName, events: null });
  assert.equal(await painter.play('m:anything'), false, 'no Bonfire Live listening');
  const played = [];
  const off = live.onPlay((ref) => { played.push(ref); });
  assert.equal(await painter.play('m:frozen-shrine'), true);
  assert.equal(await painter.play('b:forge-rave'), true);
  assert.deepEqual(played, ['m:frozen-shrine', 'b:forge-rave']);
  assert.equal(await painter.play('not a ref'), false, 'refs are checked before asking');
  off();
  live.onPlay(() => false);
  assert.equal(await painter.play('m:frozen-shrine'), false, 'turned down');
  // A hand-made message with a bad ref is ignored.
  const raw = new BroadcastChannel(channelName);
  raw.postMessage({ type: 'play', ref: 'x:<script>', nonce: 'n' });
  await wait(30);
  assert.equal(played.length, 2);
  raw.close();
  painter.dispose();
  live.dispose();
});
