// The bonfire's tunable look: content.json's `effects` merged over the defaults.
// `effects` is one live object; the admin preview replaces its contents with
// setEffects() and subscribers (palette, scene) pick the change up.
import content from './content.json' with { type: 'json' };
import { DEFAULT_EFFECTS } from './effectsDefaults.js';
import { isObj } from './ruleBasics.js';

/** `src` over `into`, recursing into groups (so a saved `elements.ice` keeps any keys it lacks). */
function merge(into, src) {
  for (const [k, v] of Object.entries(src)) {
    if (isObj(into[k]) && isObj(v)) merge(into[k], v);
    else if (k in into && !isObj(v)) into[k] = structuredClone(v);
  }
}

/** Saved values over the defaults, section by section (a saved flame list replaces the default one). */
export function resolveEffects(saved) {
  const out = structuredClone(DEFAULT_EFFECTS);
  if (!isObj(saved)) return out;
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'flames' && Array.isArray(v) && v.length) out.flames = structuredClone(v);
    else if (isObj(out[k]) && isObj(v)) merge(out[k], v);
  }
  return out;
}

export const effects = resolveEffects(content.effects);

const listeners = new Set();
export const onEffects = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Replace the live effects (preview only). `prev` is handed to subscribers. */
export function setEffects(next) {
  const prev = structuredClone(effects);
  const resolved = resolveEffects(next);
  for (const k of Object.keys(effects)) delete effects[k];
  Object.assign(effects, resolved);
  for (const fn of listeners) fn(effects, prev);
}
