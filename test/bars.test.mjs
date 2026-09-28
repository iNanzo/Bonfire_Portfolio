// "Every N bars" settings (src/visualizer/bars.js): fixed values pass through, Random
// rolls one of the setting's own intervals and rolls again when asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBarClock, rollable, RANDOMIZABLE, RANDOM } from '../src/visualizer/bars.js';

test('bar clock: fixed settings are used as they are', () => {
  const clock = createBarClock({ cutBars: 4, combos: -1 });
  assert.equal(clock.bars('cutBars'), 4);
  assert.equal(clock.bars('combos'), -1);
});

test('bar clock: Random rolls among the setting\'s own intervals, never "off"', () => {
  for (const key of RANDOMIZABLE) {
    const settings = { [key]: RANDOM };
    const clock = createBarClock(settings);
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const v = clock.bars(key);
      assert.ok(rollable(key).includes(v) && v > 0, `${key}: ${v}`);
      assert.equal(clock.bars(key), v, 'stable until rerolled');
      seen.add(v);
      clock.reroll(key);
    }
    assert.equal(seen.size, rollable(key).length, `${key} reaches every interval`);
  }
});
