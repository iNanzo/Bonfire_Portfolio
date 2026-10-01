// "Every N bars" settings and their Random option. Each interval setting lists its choices
// here (the settings dialog shows them); "random" picks one of that setting's own
// intervals, and rolls again each time the thing it times happens. Events stay on
// multiples of the rolled interval, so they still land on phrase boundaries. (sceneBars:
// how often the preset scenes change; 0: only on drops.)
import { pick } from '../math.js';

export const RANDOM = 'random';

/** Per setting: [value, label] choices. Numbers of bars; 0 / -1 mean off or "only on drops". */
export const BAR_OPTIONS = {
  phraseBars: [[0, 'Only on drops'], [8, '8 bars'], [16, '16 bars'], [32, '32 bars'], [64, '64 bars']],
  ringBars: [[0, 'Never'], [1, 'Bar'], [2, '2 bars'], [4, '4 bars'], [8, '8 bars']],
  combos: [[-1, 'Never'], [0, 'After drops'], [16, 'Every 16 bars'], [8, 'Every 8 bars'], [4, 'Every 4 bars']],
  comboBars: [[0, '1, 2 or 4 bars (random)'], [1, '1 bar'], [2, '2 bars'], [4, '4 bars']],
  flyBars: [[4, '4 bars'], [8, '8 bars'], [16, '16 bars'], [32, '32 bars']],
  danceBars: [[2, '2 bars'], [4, '4 bars'], [8, '8 bars'], [16, '16 bars']],
  cutBars: [[1, 'Bar'], [2, '2 bars'], [4, '4 bars'], [8, '8 bars'], [16, '16 bars']],
  lookBars: [[0, 'Only after drops'], [8, '8 bars'], [16, '16 bars'], [32, '32 bars']],
  sceneBars: [[0, 'Only on drops'], [16, '16 bars'], [32, '32 bars'], [64, '64 bars'], [128, '128 bars']],
};
/** The settings that offer Random (comboBars already has a random choice of its own). */
export const RANDOMIZABLE = Object.keys(BAR_OPTIONS).filter((k) => k !== 'comboBars');

/** Real intervals a Random setting can roll (never "off"). */
export const rollable = (key) => BAR_OPTIONS[key].map(([v]) => v).filter((v) => v > 0);

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
