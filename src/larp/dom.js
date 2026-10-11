// The campfire screens' only DOM plumbing, kept small: event delegation from the attributes ui.js
// writes (data-action, data-change, data-draft), a re-render that keeps focus and the caret, the
// clocks' tick, and a file download. Screens never query or listen themselves; they return markup
// and a handler map.
/**
 * What a handler gets: the element carrying the attribute, the DOM event, its data-value (or a
 * changed control's value), and `confirmed` when the shell's confirmation dialog runs it again.
 * @typedef {{ el: HTMLElement, event: Event|null, value: string|undefined, confirmed?: boolean }} ActionArgs
 * @typedef {(args: ActionArgs) => void} Handler
 * @typedef {Record<string, Handler>} Handlers
 */
import { clockText } from './ui.js';

/**
 * Whether a key press submits the form around its field (Enter in a one-line field, as a <form>
 * would): not while an input method is composing (Enter then picks the characters), not with a
 * modifier, not in a search field (it filters) or anything but a text-like input.
 * @param {{ key: string, isComposing?: boolean, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @param {{ tagName?: string, type?: string }|null} target
 */
export function enterSubmits(e, target) {
  if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
  return (
    String(target?.tagName ?? '').toUpperCase() === 'INPUT' && /^(text|password|number|)$/.test(target?.type ?? '')
  );
}

/**
 * Delegates clicks ([data-action]), changes ([data-change]) and typing ([data-draft]) under `root`,
 * and Enter in a field inside [data-submit="name"] (runs handlers[name] with that form's
 * [data-action="name"] button as `el`, so its double-submit guard holds). `getHandlers` is asked on
 * every event, so a re-render may swap them. Typing an input method composes (Vietnamese Telex, for
 * one) is kept as a draft only once the composition ends.
 * @param {HTMLElement} root
 * @param {() => Handlers} getHandlers
 * @param {{ onDraft?: (path: string, value: string, live: boolean) => void }} [o]
 * @returns {() => void} unbind
 */
export function bind(root, getHandlers, { onDraft } = {}) {
  /** @param {Event} e */
  const click = (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-action]'));
    if (!el || !root.contains(el) || el.getAttribute('aria-disabled') === 'true') return;
    const fn = getHandlers()[el.dataset.action ?? ''];
    if (!fn) return;
    e.preventDefault();
    fn({ el, event: e, value: el.dataset.value });
  };
  /** @param {Event} e */
  const change = (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset?.draft) onDraft?.(el.dataset.draft, el.value, false);
    const fn = el.dataset?.change ? getHandlers()[el.dataset.change] : null;
    if (fn) fn({ el, event: e, value: el.type === 'checkbox' ? String(el.checked) : el.value });
  };
  /** @param {Event} e */
  const input = (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (/** @type {InputEvent} */ (e).isComposing) return; // compositionend keeps it
    if (el.dataset?.draft) onDraft?.(el.dataset.draft, el.value, el.hasAttribute('data-live'));
  };
  /** @param {KeyboardEvent} e */
  const keydown = (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (!enterSubmits(e, el)) return;
    const form = /** @type {HTMLElement|null} */ (el.closest('[data-submit]'));
    const name = form?.dataset.submit ?? '';
    const fn = form && root.contains(form) ? getHandlers()[name] : null;
    if (!form || !fn) return;
    e.preventDefault();
    if (el.dataset.draft) onDraft?.(el.dataset.draft, el.value, false);
    const btn = /** @type {HTMLElement} */ (form.querySelector(`[data-action="${CSS.escape(name)}"]`) ?? form);
    fn({ el: btn, event: e, value: btn.dataset.value });
  };
  root.addEventListener('click', click);
  root.addEventListener('change', change);
  root.addEventListener('input', input);
  root.addEventListener('compositionend', input);
  root.addEventListener('keydown', keydown);
  return () => {
    root.removeEventListener('click', click);
    root.removeEventListener('change', change);
    root.removeEventListener('input', input);
    root.removeEventListener('compositionend', input);
    root.removeEventListener('keydown', keydown);
  };
}

/**
 * Replaces `root`'s markup, keeping focus (by id or data-focus) and a text field's caret.
 * @param {HTMLElement} root
 * @param {string} html
 */
export function patch(root, html) {
  const active = /** @type {HTMLInputElement|null} */ (root.ownerDocument.activeElement);
  const inside = active && active !== root && root.contains(active);
  const key = inside ? active.id || active.dataset.focus || '' : '';
  const caret =
    inside && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  root.innerHTML = html;
  if (!key) return;
  const sel = active.id ? `#${CSS.escape(key)}` : `[data-focus="${CSS.escape(key)}"]`;
  const next = /** @type {HTMLInputElement|null} */ (root.querySelector(sel));
  if (!next) return;
  next.focus({ preventScroll: true });
  if (caret && typeof next.setSelectionRange === 'function') {
    try {
      next.setSelectionRange(caret[0], caret[1]);
    } catch {
      // (not a text field)
    }
  }
}

/**
 * Refreshes every [data-clock] under `root` (no re-render, so nothing loses focus).
 * @param {ParentNode} root
 * @param {number} now
 */
export function tickClocks(root, now) {
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[data-clock]'))) {
    const text = clockText(el.dataset, now);
    if (el.textContent !== text) el.textContent = text;
  }
}

/**
 * Saves `text` as a file (Export Backup, Export Results).
 * @param {string} name
 * @param {string} text
 * @param {string} [type]
 */
export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
