// The invitation toy's editable content: content.json's `invitation` key, which the admin edits
// (its Invitation page), through `virtual:invitation-content` (vite.config.js invitationContent:
// that subtree alone, so the toy never imports content.json, whose chunk the portfolio's first
// load shares). invitationLines() is each trigger's lines (speech.js linesFrom), speechSettings()
// the quiet spell and each trigger's chance and cooldown (speechFrom), invitationDefaults() the
// Default style's look as the toy stores it (the fields with the right types; look.js validLook
// checks their values, and the admin's override the built-in Default). Missing or broken, each
// falls back: no lines (he stays quiet), the built-in speech settings, {} (the built-in look).
/// <reference path="./virtualContent.d.ts" />
import raw from 'virtual:invitation-content';
import { linesFrom, speechFrom } from './speech.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The Default look's fields as stored (look.js Look): the strings and switches kept when they
 * have the right type, the Shader values as a group (validLook snaps or drops each).
 * @param {unknown} d
 * @returns {Partial<import('./look.js').Look>}
 */
function defaultsFrom(d) {
  if (!isObj(d)) return {};
  const o = /** @type {Record<string, any>} */ (d);
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of ['pixelSize', 'style', 'motion']) if (typeof o[k] === 'string') out[k] = o[k];
  for (const k of ['dither', 'outlines']) if (typeof o[k] === 'boolean') out[k] = o[k];
  if (isObj(o.shader)) out.shader = { ...o.shader };
  return out;
}

/**
 * Content from anything (the virtual module's, or a test's): the lines, the speech settings and
 * the Default look.
 * @param {unknown} data  content.json's `invitation`
 */
export function readContent(data) {
  const o = /** @type {Record<string, unknown>} */ (isObj(data) ? data : {});
  return { lines: linesFrom(o.lines), speech: speechFrom(o.speech), defaults: defaultsFrom(o.defaults) };
}

const content = readContent(raw);

/** Each trigger's lines (speech.js createTalk's `lines`). */
export const invitationLines = () => content.lines;
/** The quiet spell and each trigger's chance and cooldown (createTalk's `speech`). */
export const speechSettings = () => content.speech;
/** The Default style's look as stored (a copy each time), for look.js validLook. */
export const invitationDefaults = () => structuredClone(content.defaults);
