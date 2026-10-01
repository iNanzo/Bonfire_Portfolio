// Every key the portfolio site answers, as the keyboard shortcuts list shows them (? opens
// it: ui/keysOverlay.js). Listing a key changes nothing: main.js, ui/pack.js,
// ui/renderMenu.js, ui/breakdown.js and ui/photo.js handle them. Pure data, so a test can
// check the list against the render menu's rows.
import { RENDER_ROWS } from './renderMenu.js';

/** @typedef {import('./keysOverlay.js').KeyGroup} KeyGroup */

/** The render settings' digits as one row: "1–6". */
const digits = `${RENDER_ROWS[0].key}–${RENDER_ROWS.at(-1).key}`;

/** @type {KeyGroup[]} */
export const SITE_KEYS = [
  {
    title: 'Getting Around',
    keys: [
      { keys: ['Q'], label: 'Previous screen' },
      { keys: ['E'], label: 'Next screen' },
      { keys: ['Arrows'], label: 'Move through a menu, the inventory or the skills (WASD too)' },
      { keys: ['Enter'], label: 'Pick what’s selected' },
      { keys: ['Esc'], label: 'Back a screen, or close what’s open' },
    ],
  },
  {
    title: 'Tools',
    keys: [
      { keys: ['F'], label: 'Photo Mode: frame the fire and save a picture' },
      { keys: ['B'], label: 'How It’s Made: the picture taken apart' },
      { keys: ['I'], label: 'The pack: travel, swap the weapon, cast a spell, tend the knight' },
      { keys: ['?'], label: 'This list' },
    ],
  },
  {
    title: 'Render Settings',
    keys: [
      { keys: ['P'], label: 'Open or close the render settings' },
      { keys: [digits], label: 'Step a setting (while they’re open)' },
      { keys: ['0'], label: 'Back to the site’s look' },
    ],
  },
];
