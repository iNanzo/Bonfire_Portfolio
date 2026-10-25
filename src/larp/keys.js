// The campfire game's keyboard shortcuts, as people read them, for the keys overlay (?,
// src/ui/keysOverlay.js). What each key does is overlay.js's keydown; the test keeps this list
// and the handler's keys the same.

/** @typedef {{ keys: string[], label: string }} KeyRow */

/** @type {{ title: string, keys: KeyRow[] }[]} */
export const KEY_GROUPS = [
  {
    title: 'Timer',
    keys: [
      { keys: ['Space'], label: 'Start or pause the round’s timer' },
      { keys: ['+'], label: 'Add a minute to the timer' },
      { keys: ['R'], label: 'Reset the timer to the round’s length' },
    ],
  },
  {
    title: 'Rounds',
    keys: [{ keys: ['← / →'], label: 'The previous or next round (and its scene)' }],
  },
  {
    title: 'Points',
    keys: [
      { keys: ['1–9'], label: 'Give that modifier (then 1–9 picks the team)' },
      { keys: ['Esc'], label: 'Close the team picker without giving anything' },
      { keys: ['Z'], label: 'Undo the last points given' },
      { keys: ['K'], label: 'Send the knights away' },
    ],
  },
  {
    title: 'Screen',
    keys: [
      { keys: ['O'], label: 'Open the output window for the projector' },
      { keys: ['F'], label: 'Full screen' },
      { keys: ['H'], label: 'Hide or show the controls' },
      { keys: ['S'], label: 'Setup: teams, rounds, modifiers and the game' },
      { keys: ['?'], label: 'These keyboard shortcuts' },
    ],
  },
];
