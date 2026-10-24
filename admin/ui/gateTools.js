// The Access page's Set Password (content.json gate.key), write-only: two new-password boxes,
// the password hashed here in the browser (src/gate/crypto.js makeKey: PBKDF2-SHA256, 600k
// iterations, a 16-byte salt) and only the key written into the draft, so the typed text never
// reaches the draft the admin keeps in localStorage (nh-admin-draft) or a commit; both boxes
// are cleared once it's set. It says when the password was set, warns under 12 characters (the
// hash is public, so a short one can be guessed offline), and that a new one locks out every
// browser that unlocked with the old one. form.js shows it for gate.key, like sceneTools.js.
import { el } from './el.js';
import { makeKey } from '../../src/gate/crypto.js';

/** Under this many characters, Set Password warns. */
export const SHORT_PASSWORD = 12;

/**
 * Set the draft's password from the two boxes. Only gate.key changes.
 * @param {any} ctx  the page's ctx: draft, changed(), toast(), busy()
 * @param {string} first @param {string} second
 * @param {{ iter?: number, today?: Date }} [o]
 * @returns {Promise<{ ok: boolean, short?: boolean, message: string }>}
 */
export async function setPassword(ctx, first, second, o = {}) {
  if (!first || !second) return { ok: false, message: 'Type the new password in both boxes.' };
  if (first !== second) return { ok: false, message: 'The two passwords don’t match, so nothing changed.' };
  const gate = ctx.draft?.gate;
  if (!gate || typeof gate !== 'object' || Array.isArray(gate))
    return { ok: false, message: 'Start the lock from the defaults first.' };
  ctx.busy?.(true, 'Hashing the password…');
  let key;
  try {
    key = await makeKey(first, o);
  } catch {
    return { ok: false, message: 'This browser can’t hash the password here: open the admin over https.' };
  } finally {
    ctx.busy?.(false);
  }
  gate.key = key;
  ctx.changed({ rerender: true });
  const short = [...first].length < SHORT_PASSWORD;
  const tail = short
    ? ` It’s under ${SHORT_PASSWORD} characters: the hash is public, so a short one can be guessed. A few words together are stronger.`
    : '';
  return { ok: true, short, message: `Password set. Save to publish it; until then the old one still works.${tail}` };
}

/**
 * The password field: when it was set (or that there's none), the two boxes and Set Password.
 * @param {any} value  gate.key, or nothing yet
 * @param {(string|number)[]} _path @param {any} ctx
 * @param {{ iter?: number, today?: Date }} [o]
 */
export function gateKeyField(value, _path, ctx, o = {}) {
  const has = value !== null && typeof value === 'object';
  const box = () => el('input', { type: 'password', autocomplete: 'new-password', spellcheck: 'false' });
  const first = box();
  const second = box();
  const button = el('button', {
    type: 'button',
    class: 'button small',
    text: 'Set Password',
    'data-tip': 'Hashes it here: only the hash goes into the draft. Save to publish it.',
    onclick: async () => {
      button.disabled = true;
      const r = await setPassword(ctx, first.value, second.value, o);
      if (r.ok) {
        first.value = '';
        second.value = '';
      }
      button.disabled = false;
      ctx.toast(r.message, r.ok ? 'info' : 'error');
    },
  });
  const state = has
    ? value.set
      ? `Password set ${value.set}.`
      : 'Password set.'
    : 'No password yet: the lock can’t turn on until one is set.';
  return el(
    'div',
    { class: 'gate-key' },
    el('p', { class: 'gate-key-state', text: state }),
    el('label', { class: 'gate-key-row' }, el('span', { text: 'New Password' }), first),
    el('label', { class: 'gate-key-row' }, el('span', { text: 'Type It Again' }), second),
    el('div', { class: 'gate-key-actions' }, button),
    el('p', {
      class: 'help',
      text: 'A new password locks out every browser that unlocked with the old one, and only works once saved.',
    }),
  );
}
