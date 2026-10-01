// Reset on the effects pages: a section put back to the site's defaults (effectsDefaults.js),
// worked out here without the page so the tests can run it. The page applies it, then offers
// Undo (main.js), so nothing is asked first and nothing is lost by a slip.
//
// Flame Colors is the one list: Reset gives the built-in palettes their colors, names and
// rotation back (and brings back any that were deleted), in their own order, and keeps the
// palettes you made, unchanged, after them. (It used to replace the whole list, deleting
// those without a word, and could leave the starting colors pointing at nothing.)

/**
 * A section's value put back to `defaults` (a copy), and what to say about it.
 * @param {string} key  the effects section ('fire', 'flames', 'knight'…)
 * @param {any} current  the draft's value now
 * @param {any} defaults  DEFAULT_EFFECTS[key]
 * @returns {{ value: any, kept: number, restored: number }}  `kept`: palettes of your own kept;
 *   `restored`: built-in palettes put back
 */
export function resetSection(key, current, defaults) {
  if (key !== 'flames' || !Array.isArray(current) || !Array.isArray(defaults)) return { value: structuredClone(defaults), kept: 0, restored: 0 };
  const builtIn = new Set(defaults.map((f) => f.id));
  const own = current.filter((f) => !builtIn.has(f?.id));
  return { value: [...structuredClone(defaults), ...own], kept: own.length, restored: defaults.length };
}

/**
 * What the page says once a section is reset (`label`: its name as shown).
 * @param {string} label
 * @param {{ kept: number, restored: number }} r
 */
export function resetMessage(label, { kept, restored }) {
  if (!restored) return `“${label}” is back to the defaults.`;
  const own = kept ? ` Your ${kept} own palette${kept === 1 ? ' is' : 's are'} kept.` : '';
  return `The ${restored} built-in palettes have their colors back.${own}`;
}
