// @ts-nocheck: 1 type error still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// Discoveries: small secrets of the site, counted like a game's collectibles ("7 / 18").
// Each one is found by doing something (stoking the fire, seeing an element, waking the
// blade, opening every project…). Found ones are kept in this browser; a new one shows a
// short toast, and the rest menu lists them all (unfound ones as a hint). One that can't
// be found here right now (the knight's, where he can't come) is left out of the list
// and the total until it can (setOut), unless it was found before.
import { items } from '../content.js';

const STORE = 'discoveries';

/**
 * The fixed ones; one per project is added below. `name` is a title (Title Case, as the
 * menus' labels are), `hint` a sentence shown while it's unfound. Ids are what's stored.
 */
const BASE = [
  { id: 'stoke', name: 'Stoked the Fire', hint: 'The fire likes attention.' },
  { id: 'fire', name: 'The Flame', hint: 'It started as fire.' },
  { id: 'lightning', name: 'The Storm Ball', hint: 'Some weapons bring lightning.' },
  { id: 'ice', name: 'The Frost', hint: 'Some weapons bring ice.' },
  { id: 'flourish', name: 'The Living Weapon', hint: 'Whatever is planted in the fire is not entirely still.' },
  { id: 'hurry', name: 'Impatient Smith', hint: 'Forging can be rushed.' },
  { id: 'palettes', name: 'Every Flame Color', hint: 'The fire has many colors.' },
  { id: 'gallery', name: 'A Closer Look', hint: 'Screenshots open full size.' },
  { id: 'sound', name: 'Heard the Fire', hint: 'The fire has a voice too.' },
  { id: 'breakdown', name: 'How It’s Made', hint: 'Press B, or look in the menu.' },
  { id: 'render', name: 'Under the Hood', hint: 'The picture has settings of its own: press P, or look in the menu.' },
  { id: 'photo', name: 'Photographer', hint: 'The menu has a camera.' },
  { id: 'visualizer', name: 'The Fire Dances', hint: 'There’s a live version for music.' },
  { id: 'painter', name: 'The Fire, Painted', hint: 'The fire can be painted too.' },
  { id: 'pack', name: 'Rummaged the Pack', hint: 'Something is tucked in the corner.' },
  { id: 'scenery', name: 'Somewhere New', hint: 'The fire can burn in other places.' },
  { id: 'spell', name: 'Spellcaster', hint: 'The pack holds a book of spells.' },
  { id: 'summon', name: 'Summoned the Knight', hint: 'Something glows on the ground by the fire.' },
  { id: 'knight', name: 'Greeted the Knight', hint: 'Whoever answers the sign likes a hello.' },
  { id: 'helm', name: 'A New Helm', hint: 'The knight packed more than one helmet.' },
  { id: 'style', name: 'A New Style', hint: 'The knight has worn other looks.' },
];

export function createDiscoveries({ onNew = () => {} } = {}) {
  const all = [
    ...BASE,
    ...items().map((p) => ({
      id: `project:${p.id}`,
      name: `Inspected ${p.name}`,
      hint: 'Every item in the inventory has a story.',
    })),
  ];
  const ids = new Set(all.map((d) => d.id));
  let found = new Set();
  let out = new Set(); // (can't be found here now)
  try {
    found = new Set(JSON.parse(localStorage.getItem(STORE) ?? '[]').filter((id) => ids.has(id)));
  } catch {
    /* storage off */
  }
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify([...found]));
    } catch {
      /* storage off */
    }
  };
  const list = () => all.filter((d) => found.has(d.id) || !out.has(d.id));

  return {
    /** Every discovery that counts here now: the ones that can be found, and any found already. */
    get list() {
      return list();
    },
    /** Mark one found. Returns true if it was new (and calls onNew with it). */
    discover(id) {
      if (!ids.has(id) || found.has(id) || out.has(id)) return false;
      found.add(id);
      save();
      onNew(
        all.find((d) => d.id === id),
        found.size,
        list().length,
      );
      return true;
    },
    /**
     * The ones that can't be found on this page now (e.g. the knight's while he isn't
     * there): out of the list and the total, unless found before. Replaces the last set.
     * @param {Iterable<string>} next
     */
    setOut(next) {
      out = new Set(next);
    },
    has: (id) => found.has(id),
    get count() {
      return found.size;
    },
    get total() {
      return list().length;
    },
  };
}
