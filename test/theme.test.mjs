// The page's accent colors (src/ui/theme.js): during a color blend the scene asks every
// frame; a color is written only when it's new (each write restyles the whole page), at most
// every 50 ms (setAccentRate changes that), and always ending on the latest ramp.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let now = 0;
const timers = [];
before(() => {
  // (A page's bits theme.js touches: the clock, timers, the favicon's link.)
  globalThis.document = { querySelector: () => null, documentElement: null };
  performance.now = () => now;
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, at: now + ms });
    return timers.length;
  };
  globalThis.clearTimeout = () => {};
});
const runTimers = () => {
  for (const t of timers.splice(0))
    if (t.at <= now) t.fn();
    else timers.push(t);
};

/** A root element's inline style that counts its writes. */
function root() {
  const props = new Map();
  const writes = [];
  return {
    writes,
    props,
    style: {
      getPropertyValue: (k) => props.get(k) ?? '',
      setProperty: (k, v) => {
        writes.push([k, v]);
        props.set(k, v);
      },
    },
  };
}
const RAMP_A = ['#2a0f08', '#c2410c', '#fb923c', '#fff1d6'];
const RAMP_B = ['#2a0f08', '#c2410c', '#fdba74', '#fff1d6'];

test('accents: written once, then only the colors that changed, never the same again', async () => {
  const { setAccentRamp } = await import('../src/ui/theme.js');
  const r = root();
  now = 1000;
  setAccentRamp(RAMP_A, r, { now: true });
  assert.equal(r.writes.length, 4);
  r.writes.length = 0;
  now += 100;
  setAccentRamp(RAMP_A, r);
  assert.deepEqual(r.writes, [], 'the same ramp again writes nothing');
  now += 100;
  setAccentRamp(RAMP_B, r);
  assert.deepEqual(r.writes, [['--accent-hi', '#fdba74']]);
});

test('accents: at most every 50 ms, ending on the latest; setAccentRate slows it', async () => {
  const { setAccentRamp, setAccentRate } = await import('../src/ui/theme.js');
  const r = root();
  now = 5000;
  setAccentRamp(RAMP_A, r, { now: true });
  r.writes.length = 0;
  now += 10;
  setAccentRamp(RAMP_B, r); // (too soon: a timer for the rest of the 50 ms)
  assert.deepEqual(r.writes, []);
  now += 50;
  runTimers();
  assert.deepEqual(r.writes, [['--accent-hi', '#fdba74']]);
  setAccentRate(125);
  r.writes.length = 0;
  now += 60;
  setAccentRamp(RAMP_A, r);
  assert.deepEqual(r.writes, [], '60 ms after the last write, at 8 Hz: not yet');
  now += 70;
  runTimers();
  assert.deepEqual(r.writes, [['--accent-hi', '#fb923c']]);
  setAccentRate(undefined); // (anything not a number: back to 50 ms)
  r.writes.length = 0;
  now += 55;
  setAccentRamp(RAMP_B, r);
  assert.deepEqual(r.writes, [['--accent-hi', '#fdba74']]);
});
