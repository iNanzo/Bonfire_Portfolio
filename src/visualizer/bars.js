// "Every N bars" settings and their Random option. Each interval setting's choices are in
// src/modes.js (the settings fields draw them too); "random" picks one of that setting's
// own intervals, and rolls again each time the thing it times happens. Events stay on
// multiples of the rolled interval, so they still land on phrase boundaries. (sceneBars:
// how often the preset scenes change; 0: only on drops.)
import { pick } from '../math.js';
import { RANDOM, rollable } from '../modes.js';

export { RANDOM, BAR_OPTIONS, RANDOMIZABLE, rollable, barOptions } from '../modes.js';

/**
 * The live intervals: `bars(key)` is the setting's number, or for Random the current roll;
 * `reroll(key)` rolls a new one (call it when the thing it times has happened).
 */
export function createBarClock(settings, rng = Math.random) {
  const rolls = {};
  const roll = (key) => {
    const opts = rollable(key);
    rolls[key] = opts[Math.floor(rng() * opts.length)] ?? pick(opts);
    return rolls[key];
  };
  return {
    bars(key) {
      const v = settings[key];
      if (v !== RANDOM) return v;
      return rolls[key] ?? roll(key);
    },
    reroll(key) { if (settings[key] === RANDOM) roll(key); },
    /** Whether a setting is on Random. */
    isRandom: (key) => settings[key] === RANDOM,
  };
}
