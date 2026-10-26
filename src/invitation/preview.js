// The admin's intro preview, as the invitation toy takes it (pure but keepFocusOut, which takes the window): /invitation/?preview
// inside a frame (admin/ui/introPreview.js, beside the Invitation page) plays one chat box of the
// admin's draft. main.js runs it; this says who may drive it and what it takes:
//   - previewOrigin: the one origin it listens to, the framing page's own as the browser reports
//     it (location.ancestorOrigins, Chrome and Safari), else the `admin` address the admin puts in
//     the query (an http(s) origin, nothing more); an address that disagrees with the browser's,
//     a sandboxed framer, or a page that isn't framed: none, and nothing is taken. (As with the
//     site's own preview, src/main.js, any page may frame it: it plays what that page sends, in
//     that page only, and nothing is saved.)
//   - readPreview: a message from its parent window at that origin, {type: PREVIEW_MESSAGE,
//     script, palette, box, viewport, restart}, every field checked: the script as the admin
//     writes `invitation.intro`, mended as content.js introScript() mends it (introFrom) but
//     refused when it has no box with an id (or more than MAX_BOXES), the box one of its ids, the
//     palette a list of {name, color} (markup.js paletteOf; none: the toy's own), the viewport
//     one of PREVIEW_VIEWPORTS (none: desktop), restart only when true. Anything else: null.
//     The script it gives starts from that box (dialogue.js normalizeScript over it).
//   - nextBox: where Next goes from a box (its next, as introFrom spells each box's flow; none at
//     a box with choices or one that ends it).
//   - previewState: what the toy says back (ready, playing a box, done).
//   - keepFocusOut: in the frame the toy never takes the focus from the admin's page (the field
//     being typed in): any focus() in it does nothing while the frame doesn't have the focus, so
//     a box played again, its replies showing or the toolbar coming back leave the typing where
//     it is; once the frame is clicked or tapped into, focus moves in it as ever. (Chrome lets a
//     framed page's focus() pull the focus out of the page around it.)
import { introFrom } from './content.js';
import { normalizeScript } from './dialogue.js';
import { DEFAULT_TEXT_COLORS, paletteOf } from './markup.js';

/** The admin's message to play a box. */
export const PREVIEW_MESSAGE = 'invitation-intro-preview';
/** The toy's answers. */
export const PREVIEW_STATE = 'invitation-intro-preview-state';
/** The sizes the admin shows it at. */
export const PREVIEW_VIEWPORTS = /** @type {const} */ (['desktop', 'phone']);
/** The most boxes a preview script may have (the admin's own are far fewer). */
const MAX_BOXES = 500;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * An http(s) origin exactly as given (no path, no query), else null.
 * @param {unknown} v
 */
function originOf(v) {
  if (typeof v !== 'string' || !v) return null;
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === v ? v : null;
  } catch {
    return null;
  }
}

/**
 * The origin the preview listens to (see the header), or null.
 * @param {{search: string, framed: boolean, ancestors?: ArrayLike<string>|null}} o  framed: window.parent !== window; ancestors: location.ancestorOrigins where the browser has it
 */
export function previewOrigin({ search, framed, ancestors = null }) {
  if (!framed) return null;
  const q = new URLSearchParams(search);
  const given = q.has('admin') ? originOf(q.get('admin')) : null;
  if (q.has('admin') && !given) return null;
  if (ancestors && ancestors.length) {
    const framer = originOf(ancestors[0]);
    if (!framer || (given && given !== framer)) return null;
    return framer;
  }
  return given;
}

/**
 * The admin's draft intro has a box the toy can play (one with an id).
 * @param {unknown} s
 */
const playable = (s) =>
  isObj(s) &&
  Array.isArray(/** @type {any} */ (s).boxes) &&
  /** @type {any[]} */ (/** @type {any} */ (s).boxes).length <= MAX_BOXES &&
  /** @type {any[]} */ (/** @type {any} */ (s).boxes).some((b) => isObj(b) && typeof b.id === 'string' && b.id !== '');

/**
 * @typedef {object} PreviewRequest
 * @property {import('./types.js').DialogueScript} script  the draft, mended, starting from `box`
 * @property {string} box
 * @property {Map<string, string>} palette  the text effects' colours
 * @property {'desktop'|'phone'} viewport
 * @property {boolean} restart  the scene from the start (he walks in again), else from where he is
 */

/**
 * A message the preview takes, checked (see the header), or null.
 * @param {{source: unknown, origin: string, data: unknown}} e  a message event
 * @param {{parent: unknown, origin: string|null}} from  the window and origin it listens to
 * @returns {PreviewRequest|null}
 */
export function readPreview(e, { parent, origin }) {
  if (!origin || e.source !== parent || e.origin !== origin) return null;
  const d = /** @type {Record<string, unknown>} */ (e.data);
  if (!isObj(d) || d.type !== PREVIEW_MESSAGE || !playable(d.script)) return null;
  if (d.palette !== undefined && !Array.isArray(d.palette)) return null;
  const viewport = d.viewport === undefined ? 'desktop' : d.viewport;
  if (!PREVIEW_VIEWPORTS.includes(/** @type {any} */ (viewport))) return null;
  const mended = introFrom(d.script);
  if (typeof d.box !== 'string' || !mended.boxes.some((b) => b.id === d.box)) return null;
  const script = normalizeScript({ ...mended, start: d.box });
  if (!script) return null;
  return {
    script,
    box: d.box,
    palette: paletteOf(Array.isArray(d.palette) ? d.palette : DEFAULT_TEXT_COLORS),
    viewport: /** @type {'desktop'|'phone'} */ (viewport),
    restart: d.restart === true,
  };
}

/**
 * Where Next goes from box `id`: its next (or the box after it), none at choices or the end.
 * @param {import('./types.js').DialogueScript|null} script
 * @param {string} id
 * @returns {string|null}
 */
export function nextBox(script, id) {
  const boxes = script?.boxes ?? [];
  const i = boxes.findIndex((b) => b.id === id);
  const b = boxes[i];
  if (!b || b.choices?.length || b.end) return null;
  if (b.next) return boxes.some((x) => x.id === b.next) ? b.next : null;
  return boxes[i + 1]?.id ?? null;
}

/**
 * What the toy says back to the admin.
 * @param {'ready'|'playing'|'done'} state
 * @param {{box?: string, next?: string|null, choices?: boolean}} [o]  playing: the box up, where Next goes, whether it asks
 */
export const previewState = (state, o = {}) => ({ type: PREVIEW_STATE, state, ...o });

/** The windows keepFocusOut has already done. */
const keptOut = new WeakSet();
/**
 * The toy's focus() calls kept inside its own frame (see the header): on every element of `win`
 * (HTML and SVG), focus() does as ever only while its document has the focus.
 * @param {{document: {hasFocus(): boolean}, HTMLElement?: {prototype: object}, SVGElement?: {prototype: object}}} win
 */
export function keepFocusOut(win) {
  if (keptOut.has(win)) return;
  keptOut.add(win);
  for (const kind of [win.HTMLElement, win.SVGElement]) {
    const proto = /** @type {{focus?: (...a: unknown[]) => void}|undefined} */ (kind?.prototype);
    const focus = proto?.focus;
    if (!proto || typeof focus !== 'function') continue;
    proto.focus = function (/** @type {unknown[]} */ ...a) {
      if (win.document.hasFocus()) focus.apply(this, a);
    };
  }
}
