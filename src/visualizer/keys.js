// Bonfire Live's keyboard shortcuts, as people read them: in four groups (the moments you
// play, the beat, the show's switches, the view and the menus) for the keys overlay (?,
// src/ui/keysOverlay.js) and the settings search. What each key does is actions.js's keydown;
// this is only what the list says. No key is remapped by being listed here: the test keeps
// this list and the handler's keys the same.

/** @typedef {{ keys: string[], label: string }} KeyRow */

/** @type {{ title: string, keys: KeyRow[] }[]} */
export const KEY_GROUPS = [
  {
    title: 'Moments',
    keys: [
      { keys: ['Space'], label: 'Drop: strike the held weapon, or recolor the fire now' },
      { keys: ['A'], label: 'Forge a weapon and hold it over the fire for the drop' },
      { keys: ['B'], label: 'Swap the weapon on the beat (it lands on a downbeat)' },
      { keys: ['R'], label: 'A ring races out of the fire' },
      { keys: ['X'], label: 'Living Weapon: it leaves the fire and fights on the next beats' },
      { keys: ['G'], label: 'A burst in the look playing' },
      { keys: ['1 / 2 / 3'], label: 'Hit with flame, lightning or frost' },
      { keys: ['← / →'], label: 'Hit with the previous or next colors' },
    ],
  },
  {
    title: 'Beat',
    keys: [
      { keys: ['T'], label: 'Tap the tempo (the first tap is beat 1)' },
      { keys: ['D'], label: 'This beat is beat 1 (fixes the bar)' },
      { keys: ['[ / ]'], label: 'Nudge the beat 10 ms earlier or later' },
    ],
  },
  {
    title: 'Show',
    keys: [
      { keys: ['L'], label: 'The next look' },
      { keys: ['M'], label: 'Mirror: In the Mix, Always, Off' },
      {
        keys: ['N'],
        label: 'The next preset scene (on the next downbeat, in a flash; at the drop if a weapon is held for it)',
      },
      { keys: ['Shift', 'N'], label: 'Preset Scenes: In the Mix, Always, Off' },
      { keys: ['K'], label: 'The knights dance now (for a phrase), or sit back down' },
      { keys: ['Shift', 'K'], label: 'The knights come or go (on the next drop if one is coming)' },
      { keys: ['Shift', 'P'], label: 'Flame Colors: the site’s, harmonious, fully random, a mix' },
      { keys: ['Shift', '1…9'], label: 'Show a title card (1 is the main one)' },
    ],
  },
  {
    title: 'View & Menus',
    keys: [
      {
        keys: ['P'],
        label:
          'Render Settings: pixel size, palette, dither, outlines, fog, x-ray (its digits step them, 0 resets them)',
      },
      { keys: ['C'], label: 'Cut to another shot' },
      { keys: ['H'], label: 'Hide or show the controls (Esc shows them again)' },
      { keys: ['F'], label: 'Full screen' },
      { keys: ['O'], label: 'Open the output window, for a projector' },
      { keys: ['V'], label: 'Record a clip of the picture and the sound, saved when you stop' },
      { keys: ['S'], label: 'Settings' },
      { keys: ['/'], label: 'Search the settings' },
      { keys: ['I'], label: 'The pack: fast travel, swap the weapon, cast a ring, a living weapon or a new element' },
      { keys: ['U'], label: 'The stats overlay: frame rate, particles, and the show’s section, look and live layers' },
      { keys: ['?'], label: 'These keyboard shortcuts' },
    ],
  },
];

/**
 * The shortcuts as one list of [keys, what it does] ("Shift+K"), for the settings search.
 * (A row's keys are pressed together; "1 / 2 / 3" is one chip: any of them.)
 * @returns {[string, string][]}
 */
export const keyList = () =>
  KEY_GROUPS.flatMap((g) => g.keys.map((row) => /** @type {[string, string]} */ ([row.keys.join('+'), row.label])));
