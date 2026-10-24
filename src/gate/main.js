// The lock page (/unlock/): the portfolio's look, the 404 page's (a pixel flame, the Cinzel
// title, Pixelify words and the blinking cursor; tokens.css and the fonts only, never content.js,
// which would bring the site's content chunk), and the password checked in the browser
// (crypto.js: WebCrypto PBKDF2, with a working state while it runs). The build gives it its words
// and the key inline (#gate-config: vite.config.js gate). The right password sets the nh_gate
// cookie for the days the admin set and goes back where the visitor was going (check.js
// safeDestination). With the lock off, no key, or the cookie already right, it goes straight on
// (once: see GATE_BOUNCE). body[data-gate] is its state (ready, working, wrong, open, stuck),
// for the styles and the tests.
import './gate.css';
import { safeDestination } from './check.js';
import { fromBase64, tokenOf, unlockToken } from './crypto.js';
import { GATE_BOUNCE, GATE_COOKIE, GATE_TO, lockTexts, unlockConfig } from './pages.js';

const BASE = import.meta.env.BASE_URL;
/** Said when this browser can't run the check (no WebCrypto: not on https). */
const NO_CRYPTO = 'This browser can’t check the password here.';
/** Said when the page would only go round (a page cached from another build). */
const STUCK = 'The lock is changing. Try again in a few minutes.';

const session = {
  get(k) {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {
      /* no storage: ?to alone, and no guard against going round */
    }
  },
};

/** The config the build put in the page, read as the lock's own (anything missing: off). */
function readConfig() {
  let own;
  try {
    own = JSON.parse(document.getElementById('gate-config')?.textContent ?? 'null');
  } catch {
    own = null;
  }
  const cfg = { ...unlockConfig(undefined), ...(own && typeof own === 'object' ? own : {}) };
  cfg.lock = lockTexts({ lock: cfg.lock });
  return cfg;
}

const cfg = readConfig();
const lock = cfg.lock;
const params = new URLSearchParams(location.search);
const destination = safeDestination(params.get('to'), session.get(GATE_TO), location.origin, BASE);

/** A new element: class, text, then attributes. @param {string} tag @param {Record<string, string>} [props] */
function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
}

// The 404 page's two-frame pixel flame, in parts: cold stone while the seal holds (its ember
// alight at the foot), kindling while the password is checked, and alight once it breaks
// (gate.css, by state).
const FLAME = `
  <svg viewBox="0 0 10 12" shape-rendering="crispEdges" aria-hidden="true">
    <g class="outer" fill="var(--accent-lo)"><path d="M4 1h2v1H4zM3 2h4v2H3zM2 4h6v4H2zM3 8h4v1H3z"/></g>
    <g class="core" fill="var(--accent)"><path d="M4 4h2v4H4zM5 3h1v1H5z"/></g>
    <g class="tip" fill="var(--accent)"><path d="M5 0h1v1H5zM3 5h1v2H3z"/></g>
    <g class="ember" fill="var(--accent)"><path d="M4 8h2v1H4z"/></g>
    <g class="ember-hi" fill="var(--accent-hi)"><path d="M5 8h1v1H5z"/></g>
    <g fill="var(--c-wood)"><path d="M1 10h8v1H1zM2 9h2v1H2zM6 9h2v1H6z"/></g>
  </svg>`;

const flame = h('div', { class: 'lock-flame' });
flame.innerHTML = FLAME;
const input = h('input', {
  id: 'gate-word',
  name: 'password',
  type: 'password',
  autocomplete: 'current-password',
  autocapitalize: 'off',
  spellcheck: 'false',
  required: '',
  'aria-invalid': 'false',
  'aria-describedby': 'gate-said',
});
const button = h(
  'button',
  { type: 'submit', class: 'press-start' },
  h('span', { class: 'cursor', 'aria-hidden': 'true' }),
  h('span', { text: lock.button }),
);
// (The box's own description, so a wrong password is the field's state, not only a live update.)
const status = h('p', { id: 'gate-said', class: 'lock-status', role: 'status' });
const form = h(
  'form',
  { class: 'lock-form', novalidate: '' },
  h('label', { for: 'gate-word', class: 'lock-label', text: lock.label }),
  input,
  button,
  status,
);

/** @param {'ready' | 'working' | 'wrong' | 'open' | 'stuck'} state @param {string} [said] */
function set(state, said = '') {
  document.body.dataset.gate = state;
  status.textContent = said;
  input.setAttribute('aria-invalid', String(state === 'wrong'));
  const busy = state === 'working' || state === 'open';
  /** @type {HTMLButtonElement} */ (button).disabled = busy;
  /** @type {HTMLInputElement} */ (input).readOnly = busy;
  form.setAttribute('aria-busy', String(state === 'working'));
}

/**
 * Go on to the destination without asking, unless that page has just sent the visitor back
 * here after this page sent them there (a page cached from another build): then stay, and say so.
 */
function goOn() {
  const there = new URL(destination, location.origin).pathname;
  let from;
  try {
    from = new URL(document.referrer).pathname;
  } catch {
    from = '';
  }
  const [at, path] = (session.get(GATE_BOUNCE) ?? '').split(' ');
  if (from === there && path === there && Date.now() - Number(at) < 15000) {
    session.set(GATE_BOUNCE, null);
    return set('stuck', STUCK);
  }
  session.set(GATE_BOUNCE, `${Date.now()} ${there}`);
  location.replace(destination);
}

/** The cookie as it is now. */
const cookie = () => new RegExp(`(?:^|;\\s*)${GATE_COOKIE}=([^;]*)`).exec(document.cookie)?.[1] ?? null;

/** Remember the unlock for the days the admin set (Secure on https; this page's base). */
function remember(token) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${GATE_COOKIE}=${token}; Path=${BASE}; Max-Age=${cfg.remember * 86400}; SameSite=Lax${secure}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (document.body.dataset.gate === 'working' || document.body.dataset.gate === 'open') return;
  const word = /** @type {HTMLInputElement} */ (input).value;
  if (!word) return input.focus();
  set('working', lock.working);
  let token;
  try {
    token = await unlockToken(word, cfg.key);
  } catch {
    set('wrong', NO_CRYPTO);
    return;
  }
  if (!token) {
    set('wrong', lock.wrong);
    /** @type {HTMLInputElement} */ (input).select();
    return;
  }
  remember(token);
  session.set(GATE_TO, null);
  session.set(GATE_BOUNCE, null);
  set('open');
  location.replace(destination);
});

async function start() {
  document.title = `${lock.title} — Newton Hoang`;
  const app = /** @type {HTMLElement} */ (document.getElementById('app'));
  app.replaceChildren(
    h(
      'main',
      { class: 'lock' },
      h(
        'div',
        { class: 'lock-inner' },
        flame,
        h('p', { class: 'lock-eyebrow', text: lock.eyebrow }),
        h('h1', { text: lock.title }),
        h('p', { class: 'flavor', text: lock.flavor }),
        form,
      ),
    ),
  );
  if (!cfg.on || !cfg.key) return goOn();
  const have = cookie();
  if (have && globalThis.crypto?.subtle && have === (await tokenOf(fromBase64(cfg.key.hash)))) return goOn();
  set('ready');
  input.focus();
}

start();
