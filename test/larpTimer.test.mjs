// The campfire game's round timer (src/larp/timer.js): idle until started, a deadline while
// running, what was left while paused, added time in every state, never negative, and the
// clock text the screen shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addTime,
  cleanTimer,
  clockText,
  expired,
  MAX_TIMER_MS,
  newTimer,
  remaining,
  toggle,
} from '../src/larp/timer.js';

const SEC = 1000;
const T0 = 1_700_000_000_000;

test('timer: a new one is idle and never counts down', () => {
  const t = newTimer(60 * SEC);
  assert.deepEqual(t, { status: 'idle', durationMs: 60 * SEC, deadline: null, remainingMs: 60 * SEC });
  assert.equal(remaining(t, T0 + 999 * SEC), 60 * SEC);
  assert.equal(expired(t, T0), false);
  assert.equal(newTimer(-5).durationMs, 0);
  assert.equal(newTimer(Number.NaN).durationMs, 0);
  assert.equal(newTimer(MAX_TIMER_MS * 2).durationMs, MAX_TIMER_MS);
});

test('timer: toggle starts, pauses with what was left, and resumes from it', () => {
  const running = toggle(newTimer(60 * SEC), T0);
  assert.equal(running.status, 'running');
  assert.equal(running.deadline, T0 + 60 * SEC);
  assert.equal(remaining(running, T0 + 15 * SEC), 45 * SEC);
  const paused = toggle(running, T0 + 20 * SEC);
  assert.equal(paused.status, 'paused');
  assert.equal(remaining(paused, T0 + 500 * SEC), 40 * SEC, 'a paused timer holds still');
  const resumed = toggle(paused, T0 + 100 * SEC);
  assert.equal(resumed.deadline, T0 + 140 * SEC);
});

test('timer: it stops at zero and says so', () => {
  const running = toggle(newTimer(10 * SEC), T0);
  assert.equal(remaining(running, T0 + 60 * SEC), 0);
  assert.equal(expired(running, T0 + 10 * SEC), true);
  assert.equal(expired(running, T0 + 9 * SEC), false);
});

test('timer: added time lands in every state, from now once it has run out', () => {
  assert.equal(remaining(addTime(newTimer(10 * SEC), 60 * SEC, T0), T0), 70 * SEC);
  const running = toggle(newTimer(10 * SEC), T0);
  assert.equal(remaining(addTime(running, 60 * SEC, T0 + 5 * SEC), T0 + 5 * SEC), 65 * SEC);
  assert.equal(
    remaining(addTime(running, 60 * SEC, T0 + 30 * SEC), T0 + 30 * SEC),
    60 * SEC,
    'expired: the full minute',
  );
  const t = newTimer(10 * SEC);
  assert.equal(addTime(t, 0, T0), t);
  assert.equal(addTime(t, -5, T0), t);
  assert.equal(addTime(t, 1.5, T0), t);
});

test('timer: the clock reads m:ss, h:mm:ss from an hour, rounding up', () => {
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(1), '0:01');
  assert.equal(clockText(65 * SEC), '1:05');
  assert.equal(clockText(3600 * SEC + 61 * SEC), '1:01:01');
  assert.equal(clockText(-5), '0:00');
});

test('timer: a stored timer is cleaned, a broken one replaced', () => {
  assert.deepEqual(cleanTimer(null, 30 * SEC), newTimer(30 * SEC));
  assert.deepEqual(cleanTimer({ status: 'running', durationMs: 60 * SEC, deadline: T0 }, 1), {
    status: 'running',
    durationMs: 60 * SEC,
    deadline: T0,
    remainingMs: null,
  });
  assert.equal(cleanTimer({ status: 'paused', durationMs: 60 * SEC, remainingMs: -4 }, 1).remainingMs, 0);
  assert.equal(cleanTimer({ status: 'running', durationMs: 60 * SEC, deadline: 'soon' }, 1).status, 'idle');
});
