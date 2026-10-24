// The sitewide password lock's shared pieces (content.json `gate`, the admin's Access page):
// the page switches (everything locked but the invitation to start with), the cookie and the
// session key the lock keeps, the key's fixed shape, the lock page's default words, and what a
// build locks. The rules (src/contentRules.js validateGate), the build (vite.config.js), the
// lock page (src/gate/main.js) and the admin read them from here. No imports: the lock page's
// first load stays small. The cookie name and the session key are stored state: never rename
// them without a migration.

/** The switches, in the admin's order: true = asks for the password. 404 and the admin never do. */
export const GATE_PAGES = Object.freeze({
  portfolio: true,
  live: true,
  painter: true,
  larp: true,
  games: true,
  invitation: false,
});

/** The cookie a browser keeps once it has unlocked: `nh_gate=<token>`. */
export const GATE_COOKIE = 'nh_gate';
/** sessionStorage: where a locked page was going (its path, query and hash), for the way back. */
export const GATE_TO = 'nh-gate-to';
/**
 * sessionStorage: when the lock page last sent a visitor straight on (the lock off, or already
 * unlocked). A page cached from another build (GitHub Pages keeps HTML 10 minutes) could send
 * them straight back; the second time the lock page stays instead of going round.
 */
export const GATE_BOUNCE = 'nh-gate-bounce';

/** How long a browser stays unlocked, in days: [min, max], and the default. */
export const GATE_REMEMBER = /** @type {[number, number]} */ ([1, 365]);
export const GATE_REMEMBER_DAYS = 30;

/** The key's algorithm, its iterations (and the range the rules take), its salt and hash lengths. */
export const GATE_ALG = 'PBKDF2-SHA256';
export const GATE_ITER = 600000;
export const GATE_ITER_RANGE = /** @type {[number, number]} */ ([100000, 5000000]);
export const GATE_SALT_BYTES = 16;
export const GATE_HASH_BYTES = 32;

/** The lock page's words, the defaults (content.json's own come first), and their longest. */
export const GATE_LOCK = Object.freeze({
  eyebrow: 'Warded',
  title: 'The way is sealed',
  flavor: 'An old ward holds this fire. Speak the word, and it will let you pass.',
  label: 'Password',
  button: 'Break the Seal',
  wrong: 'The seal holds. That isn’t the word.',
  working: 'The ward listens…',
});
export const GATE_LOCK_MAX = Object.freeze({
  eyebrow: 40,
  title: 60,
  flavor: 160,
  label: 40,
  button: 40,
  wrong: 160,
  working: 60,
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The gate a site starts with: off, no key, the default switches and words (a fresh copy). */
export function gateDefaults() {
  return { on: false, pages: { ...GATE_PAGES }, remember: GATE_REMEMBER_DAYS, lock: { ...GATE_LOCK } };
}

/**
 * The switches with the defaults filled in: content's own where it has a switch, true or false.
 * @param {any} gate
 * @returns {Record<keyof typeof GATE_PAGES, boolean>}
 */
export function gatePages(gate) {
  const own = isObj(gate?.pages) ? gate.pages : {};
  const out = { ...GATE_PAGES };
  for (const k of Object.keys(GATE_PAGES)) if (typeof own[k] === 'boolean') out[k] = own[k];
  return out;
}

/** Whether `gate` has a key the lock can check (its full rules are validateGate's). @param {any} gate */
export function hasKey(gate) {
  const k = gate?.key;
  return (
    isObj(k) &&
    k.alg === GATE_ALG &&
    Number.isInteger(k.iter) &&
    k.iter > 0 &&
    typeof k.salt === 'string' &&
    k.salt !== '' &&
    typeof k.hash === 'string' &&
    k.hash !== ''
  );
}

/**
 * The pages a build locks: none while the lock is off or has no key, else the switched ones.
 * @param {any} gate
 * @returns {string[]}
 */
export function lockedPages(gate) {
  if (gate?.on !== true || !hasKey(gate)) return [];
  return Object.entries(gatePages(gate))
    .filter(([, on]) => on)
    .map(([k]) => k);
}

/** The lock page's words: content's, the default for any it lacks or leaves empty. @param {any} gate */
export function lockTexts(gate) {
  const own = isObj(gate?.lock) ? gate.lock : {};
  const out = { ...GATE_LOCK };
  for (const k of Object.keys(GATE_LOCK)) if (typeof own[k] === 'string' && own[k].trim()) out[k] = own[k];
  return out;
}

/**
 * What the lock page is given (inline, by the build): whether it's on, how long it remembers,
 * its words, and the key without its day. Nothing else of content.json.
 * @param {any} gate
 */
export function unlockConfig(gate) {
  const days = gate?.remember;
  const [min, max] = GATE_REMEMBER;
  const key = hasKey(gate)
    ? { alg: gate.key.alg, iter: gate.key.iter, salt: gate.key.salt, hash: gate.key.hash }
    : null;
  return {
    on: gate?.on === true && key !== null,
    remember: Number.isInteger(days) && days >= min && days <= max ? days : GATE_REMEMBER_DAYS,
    lock: lockTexts(gate),
    key,
  };
}
