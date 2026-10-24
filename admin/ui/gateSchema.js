// The Access page's names, help and shape (content.json `gate`, the sitewide password lock;
// src/gate/pages.js has its pieces), spread into schema.js's tables like the Invitation page's.
// The help says plainly what the lock is: it keeps visitors and search engines out, not
// someone who reads the public repository. The password itself is gateTools.js's control.
import { GATE_LOCK, GATE_PAGES, GATE_REMEMBER_DAYS, gateDefaults } from '../../src/gate/pages.js';

/** Settings › Access (schema.js PAGES puts it after Interface). */
export const GATE_PAGE = {
  id: 'access',
  group: 'Settings',
  label: 'Access',
  keys: ['gate'],
  blurb: 'The password lock: which pages need it, the password, and what the lock page says.',
};

export const GATE_LABELS = {
  gate: 'Password lock',
  'gate.on': 'Lock the site',
  'gate.key': 'Password',
  'gate.remember': 'Remember for (days)',
  'gate.pages': 'Locked pages',
  'gate.pages.portfolio': 'Portfolio',
  'gate.pages.live': 'Bonfire Live',
  'gate.pages.painter': 'Bonfire Painter',
  'gate.pages.larp': 'Campfire game',
  'gate.pages.games': 'Reliquary game page',
  'gate.pages.invitation': 'Invitation',
  'gate.lock': 'Lock page',
  'gate.lock.eyebrow': 'Eyebrow',
  'gate.lock.title': 'Title',
  'gate.lock.flavor': 'Flavor line',
  'gate.lock.label': 'Password label',
  'gate.lock.button': 'Button',
  'gate.lock.wrong': 'Wrong password',
  'gate.lock.working': 'While it checks',
};

export const GATE_HELP = {
  gate: 'Keeps visitors and search engines out of the pages you pick. It doesn’t hide the code: this site’s repository is public.',
  'gate.on': 'On: the locked pages ask for the password first. Set one first; a save publishes it in about 15 minutes.',
  'gate.key': 'Typed twice and kept only as a salted slow hash. The hash is public, so pick a long passphrase.',
  'gate.remember': 'How long a browser stays unlocked after the right password, from 1 to 365 days.',
  'gate.pages': 'Which pages ask for the password. The 404 page and the admin never do.',
  'gate.pages.portfolio': 'The title screen, every screen and every project page.',
  'gate.pages.live': 'Bonfire Live, the music visualizer at /visualizer/.',
  'gate.pages.painter': 'The scene editor at /painter/.',
  'gate.pages.larp': 'The campfire game at /larp/, run at events.',
  'gate.pages.games': 'The Reliquary game at /games/reliquary.html.',
  'gate.pages.invitation': 'NEWT’s toy at /invitation/: open to start with.',
  'gate.lock': 'What a locked visitor sees, in the 404 page’s look.',
  'gate.lock.eyebrow': 'The small line in pixel type above the title.',
  'gate.lock.title': 'The big title under the flame.',
  'gate.lock.flavor': 'The italic line under the title.',
  'gate.lock.label': 'The name over the password box.',
  'gate.lock.button': 'The button that checks the password.',
  'gate.lock.wrong': 'What it says when the password is wrong.',
  'gate.lock.working': 'What it says while it checks (about a second on a phone).',
};

export const GATE_MORE = {
  gate:
    'A locked page sends a visitor to the lock page until the right password is typed, and search engines drop it.\n' +
    'It doesn’t keep out someone who reads the code: the repository is public, so the pages’ files and content.json can be read on GitHub, and the cookie can be set by hand.\n' +
    'The stronger path is the site served by a Cloudflare Worker that checks the password on the server (the domain’s DNS moved to Cloudflare), with the repository made private.',
};

export const GATE_KEYWORDS = {
  gate: ['password', 'lock', 'unlock', 'private'],
  'gate.key': ['passphrase', 'change password'],
};

export const GATE_SUBGROUPS = {
  'gate.lock': [
    { label: 'The page', keys: ['eyebrow', 'title', 'flavor'] },
    { label: 'The form', keys: ['label', 'button', 'working', 'wrong'] },
  ],
};

/** Every field the page shows, a missing one as it starts (the password as none yet). */
export const GATE_FIELDS = {
  gate: () => ({
    on: false,
    key: null,
    remember: GATE_REMEMBER_DAYS,
    pages: { ...GATE_PAGES },
    lock: { ...GATE_LOCK },
  }),
  'gate.pages': () => ({ ...GATE_PAGES }),
  'gate.lock': () => ({ ...GATE_LOCK }),
};

/** Content from before the lock starts from the defaults: off, no key. */
export const GATE_STARTERS = { gate: () => gateDefaults() };
