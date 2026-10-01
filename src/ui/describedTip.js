// A tooltip a screen reader hears too. The shared tooltip (ui/tooltip.js) only shows a hint,
// and is aria-hidden itself: so a trigger also names its hint as its description
// (aria-describedby), read from a span beside it. The span is hidden, as the tooltip shows
// the words; a description is read out even from a hidden element when it's named directly.
// It sits beside the trigger, not in it, so it isn't part of the trigger's name. Pure: the
// tests read it.
import { esc } from '../html.js';

/**
 * A trigger's tooltip attributes, and the span its description is read from (put it next
 * to the trigger). No text: neither.
 * @param {string} id     the span's id (unique on the page)
 * @param {string} [text] the hint
 * @returns {{ attrs: string, note: string }}
 */
export function describedTip(id, text) {
  if (!text) return { attrs: '', note: '' };
  return {
    attrs: ` data-tip="${esc(text)}" aria-describedby="${esc(id)}"`,
    note: `<span id="${esc(id)}" hidden>${esc(text)}</span>`,
  };
}
