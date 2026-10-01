// The choices every settings panel shares, kept apart from the show so the fields
// (src/ui/fields.js) can draw them without reaching into Bonfire Live: the three-way switch
// every effect has, and the "every N bars" intervals. Bonfire Live's looks.js and bars.js
// re-export these, so the show and its tests read them where they always have.

/** Every effect's switch: never, in the mix (it comes and goes), always. [value, label] */
export const MODES = [['off', 'Off'], ['mix', 'In the Mix'], ['on', 'Always']];
const MODE_IDS = new Set(MODES.map(([id]) => id));
/**
 * A saved switch as a mode. (Switches were on/off before; `yes` is what `true` meant.)
 * @param {any} v @param {any} [yes]
 */
export const modeOf = (v, yes = 'on') => (v === true ? yes : MODE_IDS.has(v) ? v : 'off');

// "Every N bars" settings: each interval setting's choices. "random" picks one of that
// setting's own intervals and rolls again each time the thing it times happens (bars.js).
export const RANDOM = 'random';

/**
 * Per setting: [value, label] choices. Numbers of bars; 0 / -1 mean off or "only on drops".
 * @type {Record<string, [number, string][]>}
 */
export const BAR_OPTIONS = {
  phraseBars: [[0, 'Only On Drops'], [8, '8 Bars'], [16, '16 Bars'], [32, '32 Bars'], [64, '64 Bars']],
  ringBars: [[0, 'Never'], [1, 'Bar'], [2, '2 Bars'], [4, '4 Bars'], [8, '8 Bars']],
  combos: [[-1, 'Never'], [0, 'After Drops'], [16, 'Every 16 Bars'], [8, 'Every 8 Bars'], [4, 'Every 4 Bars']],
  comboBars: [[0, '1, 2 Or 4 Bars (Random)'], [1, '1 Bar'], [2, '2 Bars'], [4, '4 Bars']],
  flyBars: [[4, '4 Bars'], [8, '8 Bars'], [16, '16 Bars'], [32, '32 Bars']],
  danceBars: [[2, '2 Bars'], [4, '4 Bars'], [8, '8 Bars'], [16, '16 Bars']],
  cutBars: [[1, 'Bar'], [2, '2 Bars'], [4, '4 Bars'], [8, '8 Bars'], [16, '16 Bars']],
  lookBars: [[0, 'Only After Drops'], [8, '8 Bars'], [16, '16 Bars'], [32, '32 Bars']],
  sceneBars: [[0, 'Only On Drops'], [16, '16 Bars'], [32, '32 Bars'], [64, '64 Bars'], [128, '128 Bars']],
};
/** The settings that offer Random (comboBars already has a random choice of its own). */
export const RANDOMIZABLE = Object.keys(BAR_OPTIONS).filter((k) => k !== 'comboBars');

/**
 * Real intervals a Random setting can roll (never "off").
 * @param {string} key a key of BAR_OPTIONS
 * @returns {number[]}
 */
export const rollable = (key) => BAR_OPTIONS[key].map(([v]) => v).filter((v) => v > 0);

/**
 * An "every N bars" setting's choices for a select, plus Random where it's offered (what
 * Random rolls goes in the setting's hint).
 * @param {string} key a key of BAR_OPTIONS
 * @returns {[string, string][]}
 */
export const barOptions = (key) => [
  ...BAR_OPTIONS[key].map(([v, t]) => /** @type {[string, string]} */ ([String(v), t])),
  ...(RANDOMIZABLE.includes(key) ? [/** @type {[string, string]} */ ([RANDOM, `Random (${rollable(key).join(', ')} Bars)`])] : []),
];
