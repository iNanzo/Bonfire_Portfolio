// How the editor presents content.json. The editor itself is generic (any field
// you add to content.json shows up); this file only adds labels, help, grouping
// and the few special cases. Patterns: `projects[].images[].alt` (index → []).
import { FLAME_KEYS, KINDLED_SHOW, WEAPON_KEYS } from '../../src/contentRules.js';

/** Sidebar pages and the top-level content sections each one edits. */
export const PAGES = [
  { id: 'projects', label: 'Projects', keys: ['featured', 'projects', 'archive'] },
  { id: 'home', label: 'Home & site', keys: ['hero', 'site'] },
  { id: 'about', label: 'About', keys: ['about'] },
  { id: 'journey', label: 'Journey', keys: ['experience', 'leadership', 'education'] },
  { id: 'skills', label: 'Skills', keys: ['skills'] },
  { id: 'contact', label: 'Contact', keys: ['contact'] },
  { id: 'headings', label: 'Screen headings', keys: ['sections'] },
  { id: 'interface', label: 'Interface', keys: ['screens', 'ui', 'weapons', 'startingEquipment', 'notFound'] },
];

export const LABELS = {
  featured: 'Featured project',
  projects: 'Projects',
  archive: 'Earlier explorations',
  hero: 'Home screen',
  site: 'Site details',
  about: 'About',
  experience: 'Experience',
  leadership: 'Leadership & earlier work',
  education: 'Education & certificates',
  skills: 'Skill groups',
  contact: 'Contact',
  sections: 'Screen headings',
  screens: 'Screens (tab names)',
  ui: 'Interface text',
  weapons: 'Weapon names',
  startingEquipment: 'Starting equipment',
  notFound: '404 page',
  'hero.kindled': '“Embers Kindled” banner',
  'hero.stokeHint': 'Stoke hint',
  'hero.value': 'Intro line',
  'hero.sceneLabel': 'Scene description (screen readers)',
  'site.title': 'Browser title',
  'site.description': 'Search / share description',
  'site.url': 'Site address',
  'site.links': 'Profile links',
  'sections.projects': 'Project Inventory screen',
  'sections.archive': 'Earlier explorations',
  'sections.about': 'About screen',
  'sections.experience': 'Journey screen',
  'sections.skills': 'Skills screen',
  'sections.contact': 'Contact screen',
  'about.paragraphs': 'Paragraphs',
  'about.stats': 'Stat sheet',
  'experience[].org': 'Organization',
  'experience[].roles': 'Roles',
  'experience[].roles[].bullets': 'Highlights',
  'leadership.items': 'Entries',
  'skills[].items': 'Skills',
  'contact.links': 'Links',
  'contact.backToTop': 'Back-to-top link',
  'ui.prompts': 'Key prompts',
  '[].built': 'What I built',
  '[].problem': 'The problem',
  '[].role': 'My role',
  '[].tech': 'Tech (attributes)',
  '[].kind': 'Kind',
  '[].flavor': 'Flavor line',
  '[].href': 'Link',
  '[].glyph': 'Glyph',
  '[].todo': 'To confirm',
};

export const HELP = {
  featured: 'Always first in the inventory — the flagship. “Feature this” on any project swaps it in.',
  projects: 'Shown after the featured project, in this order.',
  archive: 'Older work, after the projects. Items without images appear as the inventory’s “Also:” line (using their link) instead of a slot.',
  'hero.kindled': 'The checkpoint banner when the fire is stoked. Preview it on the site with ?kindled.',
  'hero.kindled.duration': 'Milliseconds on screen, fades included.',
  'hero.kindled.show': '“first”: the first stoke of a visit · “always”: every stoke · “never”.',
  screens: 'Labels only — the screens themselves are fixed.',
  weapons: 'Display names for the weapons in the fire (the models themselves are fixed).',
  startingEquipment: 'What’s in the fire when the site opens (and after Home).',
  'about.stats': 'Label and value rows of the stat sheet.',
  'ui.prompts': 'The key hints along the bottom: key, optional second key, label.',
  'skills[].items[].glyph': '2–3 characters drawn in the slot.',
  '[].id': 'The page address: /projects/<id>/. Lowercase letters, numbers and dashes.',
  '[].images': 'The first image is the inventory icon. Uploads are converted to WebP (full size + a 720 px card).',
  '[].summary': 'One or two lines for the inventory’s at-a-glance panel.',
  '[].href': 'https://…, mailto:…, or a path on this site like games/x.html.',
};

/** Long text: a textarea. */
export const MULTILINE = new Set(['value', 'summary', 'problem', 'built', 'flavor', 'note', 'body', 'text', 'description',
  'intro', 'sceneLabel', 'alt', 'subtitle', 'footer', 'todo']);
export const MULTILINE_LISTS = new Set(['about.paragraphs', 'experience[].roles[].bullets']);

/** Lists you can edit but not add to, remove from, reorder or hide. */
export const FIXED = new Set(['screens']);
export const READONLY = new Set(['screens[].id']);

export const SELECTS = {
  'hero.kindled.show': () => KINDLED_SHOW,
  'startingEquipment.weapon': () => WEAPON_KEYS,
  'startingEquipment.flame': () => FLAME_KEYS,
};

/** Empty text in these becomes null (not ''). */
export const NULLABLE = new Set(['ui.prompts[][1]', 'site.resumeUrl']);
export const COLUMNS = {
  'about.stats': ['Label', 'Value'],
  'ui.prompts': ['Key', 'Second key', 'Label'],
};

/** What “Add” creates in each list (anything else copies the shape of the first entry). */
export const TEMPLATES = {
  projects: () => ({ id: '', name: 'New project', kind: '', year: String(new Date().getFullYear()), status: '', summary: '',
    problem: '', built: '', role: '', tech: [], flavor: '', note: '', links: [], images: [] }),
  archive: () => ({ id: '', name: 'New item', kind: '', year: String(new Date().getFullYear()), summary: '', flavor: '',
    problem: '', built: '', role: '', tech: [], note: '', links: [], images: [] }),
  experience: () => ({ org: 'New organization', location: '', roles: [] }),
  'experience[].roles': () => ({ title: 'New role', dates: '', bullets: [] }),
  'leadership.items': () => ({ org: 'New entry', role: '', dates: '', text: '' }),
  education: () => ({ name: 'New certificate', org: '', dates: '' }),
  skills: () => ({ group: 'New group', items: [] }),
  'skills[].items': () => ({ name: 'New skill', glyph: '', flavor: '' }),
  'contact.links': () => ({ label: 'New link', value: '', href: 'https://' }),
  '[].links': () => ({ label: 'New link', href: 'https://' }),
  'about.stats': () => ['', ''],
  'ui.prompts': () => ['', null, ''],
};

/** “+ Add …” button wording per list. */
export const ADD_LABELS = {
  projects: 'project',
  archive: 'item',
  experience: 'organization',
  'experience[].roles': 'role',
  'experience[].roles[].bullets': 'highlight',
  'leadership.items': 'entry',
  education: 'certificate',
  skills: 'skill group',
  'skills[].items': 'skill',
  'contact.links': 'link',
  '[].links': 'link',
  '[].tech': 'tag',
  'about.paragraphs': 'paragraph',
  'about.stats': 'stat',
  'ui.prompts': 'prompt',
};

/** The field a list entry is titled by. */
export const TITLE_KEYS = ['name', 'title', 'org', 'group', 'label', 'heading'];

/** A lookup that tries the exact pattern, then the same pattern from any list (`[].key`). */
export function hint(table, pattern) {
  if (table instanceof Set) return table.has(pattern) || table.has(pattern.replace(/^.*\[\]/, '[]'));
  return table[pattern] ?? table[pattern.replace(/^.*\[\]/, '[]')];
}
