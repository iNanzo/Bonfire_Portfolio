// Discoveries: small secrets of the site, counted like a game's collectibles ("7 / 18").
// Each one is found by doing something (stoking the fire, seeing an element, waking the
// blade, opening every project…). Found ones are kept in this browser; a new one shows a
// short toast, and the rest menu lists them all (unfound ones as a hint).
import { items } from '../content.js';

const STORE = 'discoveries';

/** The fixed ones; one per project is added below. `hint` is shown while it's unfound. */
const BASE = [
  { id: 'stoke', name: 'Stoked the fire', hint: 'The fire likes attention.' },
  { id: 'fire', name: 'The flame', hint: 'It started as fire.' },
  { id: 'lightning', name: 'The storm ball', hint: 'Some weapons bring lightning.' },
  { id: 'ice', name: 'The frost', hint: 'Some weapons bring ice.' },
  { id: 'flourish', name: 'The living blade', hint: 'Whatever is planted in the fire is not entirely still.' },
  { id: 'hurry', name: 'Impatient smith', hint: 'Forging can be rushed.' },
  { id: 'palettes', name: 'Every color of flame', hint: 'The fire has many colors.' },
  { id: 'gallery', name: 'A closer look', hint: 'Screenshots open full size.' },
  { id: 'sound', name: 'Heard the fire', hint: 'The fire has a voice too.' },
  { id: 'breakdown', name: 'How it’s made', hint: 'Press B.' },
  { id: 'photo', name: 'Photographer', hint: 'The menu has a camera.' },
  { id: 'visualizer', name: 'The fire dances', hint: 'There’s a live version for music.' },
  { id: 'pack', name: 'Rummaged the pack', hint: 'Something is tucked in the corner.' },
  { id: 'scenery', name: 'Somewhere new', hint: 'The fire can burn in other places.' },
  { id: 'spell', name: 'Spellcaster', hint: 'The pack holds a book of spells.' },
];

export function createDiscoveries({ onNew = () => {} } = {}) {
  const list = [
    ...BASE,
    ...items().map((p) => ({ id: `project:${p.id}`, name: `Inspected ${p.name}`, hint: 'Every item in the inventory has a story.' })),
  ];
  const ids = new Set(list.map((d) => d.id));
  let found = new Set();
  try { found = new Set(JSON.parse(localStorage.getItem(STORE) ?? '[]').filter((id) => ids.has(id))); } catch { /* storage off */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify([...found])); } catch { /* storage off */ } };

  return {
    list,
    /** Mark one found. Returns true if it was new (and calls onNew with it). */
    discover(id) {
      if (!ids.has(id) || found.has(id)) return false;
      found.add(id);
      save();
      onNew(list.find((d) => d.id === id), found.size, list.length);
      return true;
    },
    has: (id) => found.has(id),
    get count() { return found.size; },
    get total() { return list.length; },
  };
}
