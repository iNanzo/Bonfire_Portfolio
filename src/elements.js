// What the bonfire is made of: fire, lightning or ice. Every element burns in the
// current flame's colors, so the fire's state is weapon + flame + element.
// Names, rotation and draw weights come from content.json's `effects.elements`
// (edited in the admin); `elements` is updated in place when the preview changes
// them, like `flames` in palette.js.
import { effects, onEffects } from './effects.js';
import { ELEMENT_IDS } from './effectsDefaults.js';

export const elements = {};

function load(e) {
  for (const id of ELEMENT_IDS) elements[id] = { ...e.elements[id] };
}
load(effects);
onEffects(load);

/** `key` if it's a known element, else fire. */
export const elementOr = (key) => (ELEMENT_IDS.includes(key) ? key : 'fire');

/** A weighted random element from the ones in rotation (`fallback` when none are). */
export function drawElement(fallback = 'fire', random = Math.random) {
  const pool = ELEMENT_IDS.filter((id) => elements[id].rotation !== false && elements[id].weight > 0);
  const total = pool.reduce((sum, id) => sum + elements[id].weight, 0);
  let r = random() * total;
  for (const id of pool) {
    r -= elements[id].weight;
    if (r < 0) return id;
  }
  return pool.at(-1) ?? fallback;
}

/**
 * The fire's display name: the flame's color word + the element.
 * "Azure Flame" → "Azure Lightning"; a flame named without "Flame" keeps its name
 * as fire and gets the element appended otherwise ("Moonlight Ice").
 */
export function flameTitle(flameName, elementKey) {
  const name = String(flameName ?? '').trim();
  const color = name.replace(/\s*\bflame$/i, '');
  const element = elements[elementOr(elementKey)]?.name ?? '';
  if (color !== name) return `${color} ${element}`.trim();
  return elementOr(elementKey) === 'fire' ? name : `${name} ${element}`.trim();
}
