// Many settings at once, worked out before anything changes (pure: the tests run these).
// A bulk button over a grid or a checklist (All Off, Shuffle, None, Defaults…), a section's
// Reset Section and Reset to Defaults each become a plan: the new values by key ("looks.echo",
// "glow") and the values they replace, so the dialog applies it as one change (one onChange,
// one save) and its Undo puts `before` back the same way.
import { bulkValues } from '../ui/fields.js';
import { entriesFor } from '../settingsMap.js';
import { AT_LEAST_ONE, NO_ALWAYS, GROUPS, defaults } from './settings.js';
import { GRID_KEYS } from './settingsControls.js';

/** @typedef {{ values: Record<string, any>, before: Record<string, any> }} Plan */

/** A dotted key's value ("looks.echo": settings.looks.echo). */
export const getPath = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);
/** Set a dotted key's value. */
export function setPath(obj, key, value) {
  const parts = key.split('.');
  const last = parts.pop();
  const into = parts.reduce((o, k) => o[k], obj);
  into[last] = value;
}
/** Every value of a plan into the settings (a copy of each object, so `before` stays as it was). */
export function applyValues(settings, values) {
  for (const [key, v] of Object.entries(values)) setPath(settings, key, v && typeof v === 'object' ? structuredClone(v) : v);
}
/** The settings a plan touches, by their top key (what onChange is told: 'looks' for 'looks.echo'). */
export const topKeys = (values) => [...new Set(Object.keys(values).map((k) => k.split('.')[0]))];

/**
 * A group's switches as settings keys: a grid's (GRID_KEYS: the looks, the drop hits, the
 * layers) or a checklist's ("moves.slash"…), each with whether it lacks Always.
 * @param {string} group
 * @param {Record<string, any>} [settings]
 * @returns {{ key: string, noAlways: boolean }[]}
 */
export function groupItems(group, settings = defaults()) {
  const noAlways = (id) => (NO_ALWAYS[group] ?? []).includes(id);
  if (Object.hasOwn(GRID_KEYS, group)) return GRID_KEYS[group].map((key) => ({ key, noAlways: noAlways(key.split('.').pop()) }));
  if (GROUPS.includes(group)) return Object.keys(settings[group] ?? {}).map((id) => ({ key: `${group}.${id}`, noAlways: false }));
  return [];
}

/**
 * A bulk button's plan for a grid or a checklist: 'off' | 'mix' | 'on' | 'shuffle' |
 * 'defaults' for a grid, 'all' | 'none' | 'defaults' for a checklist. A switch with no
 * Always takes In the Mix for All Always; a group that keeps one on keeps one on.
 * @param {string} group @param {string} action @param {Record<string, any>} settings
 * @param {{ rand?: () => number }} [o]
 * @returns {Plan}
 */
export function bulkPlan(group, action, settings, { rand = Math.random } = {}) {
  const items = groupItems(group, settings);
  const d = defaults();
  const current = Object.fromEntries(items.map(({ key }) => [key, getPath(settings, key)]));
  const defs = Object.fromEntries(items.map(({ key }) => [key, getPath(d, key)]));
  const out = bulkValues(action, items, current, defs, rand, { minOne: AT_LEAST_ONE.has(group) });
  const values = Object.fromEntries(items.map(({ key }) => [key, out[key]]));
  return { values, before: current };
}

/**
 * The settings keys a section of the dialog holds: its entries', a group's as its items, the
 * 14 layers as theirs. (Title Cards' words are yours, not settings: no Reset Section there.)
 * @param {string} section a section id (src/settingsMap.js SECTIONS)
 * @param {Record<string, any>} [settings]
 */
export function sectionKeys(section, settings = defaults()) {
  if (section === 'titles') return [];
  return entriesFor('live').filter((e) => e.section === section).flatMap((e) => {
    const items = groupItems(e.live, settings);
    return items.length ? items.map((it) => it.key) : [e.live];
  });
}

/**
 * Reset Section's plan: every setting in the section back to its default.
 * @param {string} section @param {Record<string, any>} settings
 * @returns {Plan}
 */
export function sectionPlan(section, settings) {
  const d = defaults();
  const keys = sectionKeys(section, settings).filter((k) => getPath(d, k) !== undefined);
  return {
    values: Object.fromEntries(keys.map((k) => [k, structuredClone(getPath(d, k))])),
    before: Object.fromEntries(keys.map((k) => [k, structuredClone(getPath(settings, k))])),
  };
}

/** Whether a plan changes anything (each value compared as it would be saved). */
export const changes = (plan) => Object.entries(plan.values).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(plan.before[k]));
