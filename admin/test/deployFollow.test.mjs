// How often the admin asks where a save's deploy is (admin/ui/deployFollow.js): often at
// first, less often once the run is underway, and never past the time a deploy (all of CI,
// about 13–15 minutes) could still be running, so the page stops looking busy for ever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_CHECK, FOLLOW_FOR, QUICK_CHECK, QUICK_FOR, SLOW_CHECK, nextDeployCheck } from '../ui/deployFollow.js';

const MIN = 60_000;

test('deploy follow: every 15 s for 5 minutes, then every 30 s, then it stops at 45 minutes', () => {
  assert.equal(FIRST_CHECK, 4000);
  assert.equal(nextDeployCheck(FIRST_CHECK), QUICK_CHECK);
  assert.equal(QUICK_CHECK, 15_000);
  assert.equal(nextDeployCheck(QUICK_FOR - 1), QUICK_CHECK);
  assert.equal(nextDeployCheck(QUICK_FOR), SLOW_CHECK);
  assert.ok(SLOW_CHECK >= 30_000 && SLOW_CHECK <= 60_000, 'every 30–60 s once underway');
  assert.equal(nextDeployCheck(FOLLOW_FOR - 1), SLOW_CHECK);
  assert.equal(nextDeployCheck(FOLLOW_FOR), null);
  assert.equal(nextDeployCheck(Infinity), null);
  assert.equal(nextDeployCheck(NaN), null, 'a broken clock stops it, not a tight loop');
});

test('deploy follow: a run of 13–15 minutes (and a slow one of 30) is still being followed when it finishes', () => {
  // Walk the schedule as the page does: the checks it makes, and when it stops.
  const checks = [FIRST_CHECK];
  for (let wait = nextDeployCheck(FIRST_CHECK); wait !== null; wait = nextDeployCheck(checks.at(-1)))
    checks.push(checks.at(-1) + wait);
  for (const run of [13, 15, 30])
    assert.ok(
      checks.some((at) => at >= run * MIN && at <= run * MIN + SLOW_CHECK),
      `a check within ${SLOW_CHECK / 1000} s of a ${run}-minute run finishing`,
    );
  assert.ok(checks.at(-1) >= FOLLOW_FOR - SLOW_CHECK && checks.at(-1) <= FOLLOW_FOR + SLOW_CHECK);
  assert.ok(checks.length < 120, `${checks.length} checks in all: not a flood of API calls`);
});
