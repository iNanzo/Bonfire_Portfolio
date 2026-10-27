// The invitation toy's editable content: content.json's `invitation` key, which the admin edits
// (its Invitation page), through `virtual:invitation-content` (vite.config.js invitationContent:
// that subtree alone, so the toy never imports content.json, whose chunk the portfolio's first
// load shares). invitationLines() is each trigger's lines (speech.js linesFrom), speechSettings()
// the quiet spell and each trigger's chance and cooldown (speechFrom), invitationDefaults() the
// Default style's look as the toy stores it (the fields with the right types; look.js validLook
// checks their values, and the admin's override the built-in Default), introScript() the chat
// the envelope and Replay Intro open (introFrom: types.js DialogueScript, each box's flow spelled out),
// textPalette() the text effects' colours (`invitation.text.colors`, markup.js paletteOf: what
// {red|…} in a line is), linkSettings() the link button's (`invitation.link`, link.js linkFrom:
// where it goes and its name). Missing or broken, each falls back: no lines (he stays quiet), the
// built-in speech settings, {} (the built-in look), the toy's own short intro (FALLBACK_INTRO; a
// broken part of the admin's is mended on its own), the built-in colours (DEFAULT_TEXT_COLORS;
// a broken entry in the admin's list is left out), no link (no button; its name Link).
/// <reference path="./virtualContent.d.ts" />
import raw from 'virtual:invitation-content';
import { DIALOGUE_CLIPS, FACE_NAMES } from './clips.js';
import { linkFrom } from './link.js';
import { DEFAULT_TEXT_COLORS, paletteOf } from './markup.js';
import { linesFrom, speechFrom } from './speech.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A box's camera shots (types.js DialogueShot; the admin lists contentRules.js INTRO_CAMERAS, the same). */
const SHOTS = ['close', 'medium', 'wide', 'keep'];
/** The most choices a box offers (contentRules.js INTRO_CHOICES_MAX). */
const CHOICES_MAX = 3;

/**
 * The toy's own intro, for content with none (or none it can play): short, in NEWT's voice, as
 * introFrom gives it. The admin's Start From the Toy’s Own (invitationSchema.js) is this one too.
 * @type {import('./types.js').DialogueScript}
 */
export const FALLBACK_INTRO = {
  speaker: 'NEWT',
  start: 'hi',
  boxes: [
    { id: 'hi', text: 'Oh, hi! I’m NEWT.', face: 'happy', animation: 'Wave', camera: 'medium', next: 'soon' },
    {
      id: 'soon',
      text: 'Something’s on its way to you. Keep an eye out!',
      face: 'smug',
      animation: 'Point',
      camera: 'close',
      next: 'bye',
    },
    {
      id: 'bye',
      text: 'Until then, poke me all you like.',
      face: 'happy',
      animation: 'Cheer',
      camera: 'wide',
      end: true,
    },
  ],
};

/**
 * The intro as the toy plays it (types.js DialogueScript), from anything: content.json's
 * `invitation.intro` as the admin writes it (every field there, the optional ones empty) or one
 * made by hand. Each box's flow is spelled out, so it has exactly one of: its choices (the ones
 * with words that lead to a box, at most 3), `end: true`, or `next` (its own Next when that box is
 * there, else the box after it; the last box ends it). An empty speaker or Auto wait is left out;
 * a face, animation or camera off the toy's lists is neutral, none or keep; a box with no id, or
 * an id an earlier box has, is left out; the start is the first box when it isn't there; with no
 * box left, the toy's own intro (a copy of FALLBACK_INTRO).
 * @param {unknown} data  content.json's `invitation.intro`
 * @returns {import('./types.js').DialogueScript}
 */
export function introFrom(data) {
  const o = /** @type {Record<string, any>} */ (isObj(data) ? data : {});
  const ids = new Set();
  const kept = (Array.isArray(o.boxes) ? o.boxes : []).filter((b) => {
    const ok = isObj(b) && typeof b.id === 'string' && b.id !== '' && !ids.has(b.id);
    if (ok) ids.add(b.id);
    return ok;
  });
  if (!kept.length) return structuredClone(FALLBACK_INTRO);
  const words = (v) => (typeof v === 'string' ? v.trim() : '');
  const boxes = kept.map((b, i) => {
    /** @type {import('./types.js').DialogueBox} */
    const box = {
      id: b.id,
      text: words(b.text),
      face: FACE_NAMES.includes(b.face) ? b.face : 'neutral',
      animation: DIALOGUE_CLIPS.includes(b.animation) ? b.animation : 'none',
      camera: SHOTS.includes(b.camera) ? b.camera : 'keep',
    };
    if (words(b.speaker)) box.speaker = words(b.speaker);
    if (typeof b.auto === 'number' && Number.isFinite(b.auto) && b.auto > 0) box.auto = b.auto;
    const choices = (Array.isArray(b.choices) ? b.choices : [])
      .filter((c) => isObj(c) && words(c.label) && ids.has(c.next))
      .slice(0, CHOICES_MAX)
      .map((c) => ({ label: words(c.label), next: c.next }));
    if (choices.length) box.choices = choices;
    else if (b.end === true) box.end = true;
    else if (ids.has(b.next)) box.next = b.next;
    else if (i + 1 < kept.length) box.next = kept[i + 1].id;
    else box.end = true;
    return box;
  });
  return {
    speaker: words(o.speaker) || FALLBACK_INTRO.speaker,
    start: ids.has(o.start) ? o.start : boxes[0].id,
    boxes,
  };
}

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
 * Content from anything (the virtual module's, or a test's): the lines, the speech settings, the
 * Default look, the intro, the text colours (the admin's list when there is one) and the link.
 * @param {unknown} data  content.json's `invitation`
 */
export function readContent(data) {
  const o = /** @type {Record<string, unknown>} */ (isObj(data) ? data : {});
  return {
    lines: linesFrom(o.lines),
    speech: speechFrom(o.speech),
    defaults: defaultsFrom(o.defaults),
    intro: introFrom(o.intro),
    palette: paletteOf(
      isObj(o.text) && Array.isArray(/** @type {any} */ (o.text).colors)
        ? /** @type {any} */ (o.text).colors
        : DEFAULT_TEXT_COLORS,
    ),
    link: linkFrom(o.link),
  };
}

const content = readContent(raw);

/** Each trigger's lines (speech.js createTalk's `lines`). */
export const invitationLines = () => content.lines;
/** The quiet spell and each trigger's chance and cooldown (createTalk's `speech`). */
export const speechSettings = () => content.speech;
/** The Default style's look as stored (a copy each time), for look.js validLook. */
export const invitationDefaults = () => structuredClone(content.defaults);
/** The text effects' colours by name (markup.js paletteOf: dialogueUi.js and bubble.js draw with them). */
export const textPalette = () => new Map(content.palette);
/** The intro the envelope and Replay Intro open, as the toy plays it (introFrom; a copy each time). */
export const introScript = () => structuredClone(content.intro);
/** The link button's link: where it goes and its name (link.js linkFrom; a copy each time). */
export const linkSettings = () => ({ ...content.link });
