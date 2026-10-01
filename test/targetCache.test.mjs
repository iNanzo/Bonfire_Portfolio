// The render targets kept per size (src/bonfire/targetCache.js, used by frame.js): a size
// used lately is swapped back in, not made again; past KEEP_SETS sizes the one used longest
// ago is freed, once; clearing frees every one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSetCache, KEEP_SETS } from '../src/bonfire/targetCache.js';

function cache(keep) {
  const made = [];
  const freed = [];
  const c = createSetCache(keep, (value, key) => freed.push(`${key}:${value.n}`));
  let n = 0;
  const get = (key) => c.get(key, () => { made.push(key); return { n: n++ }; });
  return { c, get, made, freed };
}

test('a size used lately is swapped back in, not made again', () => {
  const { c, get, made, freed } = cache(3);
  const a = get('480×270');
  const b = get('960×540');
  assert.equal(get('480×270'), a, 'the same set');
  assert.equal(get('960×540'), b);
  assert.deepEqual(made, ['480×270', '960×540']);
  assert.deepEqual(freed, []);
  assert.equal(c.size, 2);
});

test('past `keep` sizes, the one used longest ago is freed (once), and a later visit makes it again', () => {
  const { c, get, made, freed } = cache(3);
  get('a'); get('b'); get('c');
  get('a'); // (now b is the oldest)
  get('d');
  assert.deepEqual(freed, ['b:1']);
  assert.deepEqual(c.keys(), ['c', 'a', 'd']);
  get('b');
  assert.deepEqual(freed, ['b:1', 'c:2']);
  assert.deepEqual(made, ['a', 'b', 'c', 'd', 'b']);
  // A pixel-size shift back and forth between two sizes never frees either.
  const before = freed.length;
  for (let i = 0; i < 10; i++) { get('b'); get('d'); }
  assert.equal(freed.length, before);
});

test('the current set is never the one freed, and clearing frees every one', () => {
  const { c, get, freed } = cache(KEEP_SETS);
  let current = null;
  for (const key of ['1×1', '480×270', '960×540', '320×180', '640×360', '480×270']) {
    const was = current;
    current = get(key);
    assert.ok(!freed.includes(`${key}:${current.n}`));
    if (was && was !== current) assert.ok(c.size <= KEEP_SETS);
  }
  const kept = c.keys();
  freed.length = 0;
  c.clear();
  assert.equal(freed.length, kept.length);
  assert.equal(c.size, 0);
});

test('keeps at least one', () => {
  const { get, freed } = cache(0);
  get('a');
  get('b');
  assert.deepEqual(freed, ['a:0']);
});
