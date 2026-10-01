// Rules every saved src/content.json must pass. The admin panel checks them as you
// edit and the admin API enforces them on save, so an edit can't publish something
// the site would choke on: an unsafe link (the renderer throws on those), a bad
// image path, a duplicate project id, a weapon the 3D model doesn't have.
import { isSafeUrl } from './html.js';
import {
  BASE_COLORS, CURSOR_MODES, DEFAULT_EFFECTS, DITHER_MATRICES, ELEMENT_IDS, KNIGHT_ARRIVALS, KNIGHT_FINISHES, KNIGHT_HELMETS, KNIGHT_SEATS,
  KNIGHT_STYLES, RANGES,
} from './effectsDefaults.js';
import { contrast, HEX_RE, ID_RE, WEAPON_KEYS } from './ruleBasics.js';
import { validateScenes } from './scenes.js';

// The basics moved to ruleBasics.js (so scenes.js can use them); re-exported for everyone
// who imports them from here.
export { contrast, HEX_RE, ID_RE, luminance, slugify, WEAPON_KEYS } from './ruleBasics.js';

export const CONTENT_PATH = 'src/content.json';
export const SECTIONS = ['site', 'screens', 'weapons', 'weaponDraw', 'startingEquipment', 'hero', 'sections', 'featured', 'projects',
  'archive', 'about', 'experience', 'leadership', 'education', 'skills', 'contact', 'ui', 'notFound', 'effects'];
/** Screens are wired into the layout and camera; their ids can't change. */
export const SCREEN_IDS = ['home', 'projects', 'experience', 'skills', 'about', 'contact'];
/** The fewest weapons a random draw may pick from. */
export const MIN_WEAPONS = 3;
export const flameIds = (c) => (Array.isArray(c?.effects?.flames) ? c.effects.flames.map((f) => f?.id) : []);
/** Flames a random draw can pick from: it skips the current and the starting flame. */
export const MIN_ROTATION = 3;
export const KINDLED_SHOW = ['first', 'always', 'never'];
/** An image's `src`: public/<src>.webp and public/<src>-card.webp. */
export const IMAGE_RE = /^assets\/projects\/[a-z0-9-]+\/[a-z0-9-]+$/;
/** More slots than this and the inventory grid overflows its 4×4 box. */
export const GRID_SLOTS = 16;

/** Every project-like entry, in inventory order. */
export const inventoryEntries = (c) => [c.featured, ...(c.projects ?? []), ...(c.archive ?? [])].filter(Boolean);

/** A project's images the site shows (hidden ones stay in the repo, off the site). */
export const shownImages = (p) => (Array.isArray(p?.images) ? p.images.filter((im) => !im?.hidden) : []);

/** Every image src the content references. */
export function imageRefs(c) {
  const refs = new Set();
  for (const p of inventoryEntries(c)) for (const im of Array.isArray(p.images) ? p.images : []) if (typeof im?.src === 'string') refs.add(im.src);
  return refs;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Check the `effects` section. `err(path, message)` gets paths like
 * `effects.flames[2].hi`. Every number must sit inside RANGES.
 */
export function validateEffects(e, err, base = 'effects') {
  if (!isObj(e)) return err(base, 'Must be a group of fields.');
  const at = (p) => `${base}.${p}`;
  const color = (v, p) => { if (typeof v !== 'string' || !HEX_RE.test(v)) err(at(p), 'Use a color like #ff8800.'); };
  const num = (v, p, pattern = p) => {
    const [min, max] = RANGES[pattern];
    if (typeof v !== 'number' || !Number.isFinite(v)) err(at(p), 'Must be a number.');
    else if (v < min || v > max) err(at(p), `Between ${min} and ${max}.`);
  };
  const group = (key, check) => {
    if (e[key] === undefined) return;
    if (!isObj(e[key])) return err(at(key), 'Must be a group of fields.');
    for (const [k, v] of Object.entries(e[key])) {
      if (!(k in DEFAULT_EFFECTS[key])) err(at(`${key}.${k}`), 'Unknown setting.');
      else check(k, v, `${key}.${k}`);
    }
  };
  const bool = (v, p) => { if (typeof v !== 'boolean') err(at(p), 'Must be on or off.'); };

  group('colors', (k, v, p) => color(v, p));
  const voidColor = HEX_RE.test(e.colors?.void ?? '') ? e.colors.void : DEFAULT_EFFECTS.colors.void;

  if (e.flames !== undefined) {
    if (!Array.isArray(e.flames)) err(at('flames'), 'Must be a list.');
    else {
      const seen = new Set();
      e.flames.forEach((f, i) => {
        const p = `flames[${i}]`;
        if (!isObj(f)) return err(at(p), 'Must be a group of fields.');
        if (typeof f.id !== 'string' || !ID_RE.test(f.id)) err(at(`${p}.id`), 'Use lowercase letters, numbers and single dashes.');
        else if (seen.has(f.id)) err(at(`${p}.id`), `“${f.id}” is already used by another palette.`);
        else seen.add(f.id);
        if (typeof f.name !== 'string' || !f.name.trim()) err(at(`${p}.name`), 'Can’t be empty.');
        for (const k of ['lo', 'mid', 'hi', 'core', 'shade']) color(f[k], `${p}.${k}`);
        if (HEX_RE.test(f.hi ?? '') && contrast(f.hi, voidColor) < 4.5) {
          err(at(`${p}.hi`), `Too dark for text on the background (${contrast(f.hi, voidColor).toFixed(1)}:1, needs 4.5:1). Lighten it.`);
        }
        if (f.light !== undefined) num(f.light, `${p}.light`, 'flames[].light');
        if (f.hidden !== undefined) bool(f.hidden, `${p}.hidden`);
      });
      const inRotation = e.flames.filter((f) => isObj(f) && !f.hidden).length;
      if (inRotation < MIN_ROTATION) err(at('flames'), `Keep at least ${MIN_ROTATION} palettes in rotation (not hidden), so a new one can always be drawn.`);
    }
  }

  const numbers = (k, v, p) => num(v, p);
  group('fire', numbers);
  if (isObj(e.fire) && e.fire.lifeMin > e.fire.lifeMax) err(at('fire.lifeMax'), 'Must be at least the shortest life.');
  group('particles', numbers);
  group('fireflies', numbers);
  if (isObj(e.fireflies) && e.fireflies.lit > e.fireflies.count) err(at('fireflies.lit'), 'Can’t be more than the number of fireflies.');
  group('cursor', (k, v, p) => {
    if (k === 'mode') { if (!CURSOR_MODES.includes(v)) err(at(p), `One of: ${CURSOR_MODES.join(', ')}.`); } else num(v, p);
  });
  group('render', (k, v, p) => {
    if (k === 'outlines' || k === 'shake') bool(v, p);
    else if (k === 'ditherMatrix') { if (!DITHER_MATRICES.includes(v)) err(at(p), `One of: ${DITHER_MATRICES.join(', ')}.`); } else num(v, p);
  });
  group('elements', (id, el, p) => {
    if (!isObj(el)) return err(at(p), 'Must be a group of fields.');
    for (const [k, v] of Object.entries(el)) {
      if (k === 'name') { if (typeof v !== 'string' || !v.trim() || v.length > 24) err(at(`${p}.name`), 'A name up to 24 characters.'); }
      else if (k === 'rotation') bool(v, `${p}.rotation`);
      else if (k === 'weight') num(v, `${p}.weight`);
      else err(at(`${p}.${k}`), 'Unknown setting.');
    }
  });
  if (isObj(e.elements) && ELEMENT_IDS.every((id) => e.elements[id]?.rotation === false)) {
    err(at('elements'), 'Keep at least one element in rotation.');
  }
  group('impact', (k, v, p) => (k === 'marks' ? bool(v, p) : num(v, p)));
  group('lightning', numbers);
  group('ice', numbers);
  // (The helmet, arrival, style, finish and seat are one of their lists; the rest and the edge
  // glow are numbers; show, shine, gestures and reactions are on or off.)
  const KNIGHT_CHOICES = { helmet: KNIGHT_HELMETS, arrival: KNIGHT_ARRIVALS, style: KNIGHT_STYLES, finish: KNIGHT_FINISHES, seat: KNIGHT_SEATS };
  group('knight', (k, v, p) => {
    if (Object.hasOwn(KNIGHT_CHOICES, k)) { if (!KNIGHT_CHOICES[k].includes(v)) err(at(p), `One of: ${KNIGHT_CHOICES[k].join(', ')}.`); }
    else if (RANGES[p]) num(v, p);
    else bool(v, p);
  });
  if (isObj(e.knight) && e.knight.restMin > e.knight.restMax) err(at('knight.restMax'), 'Must be at least the shortest rest.');
  for (const k of Object.keys(e)) if (!(k in DEFAULT_EFFECTS)) err(at(k), 'Unknown section.');
  if (isObj(e.colors)) for (const k of BASE_COLORS) if (!(k in e.colors)) err(at(`colors.${k}`), 'Missing color.');
}

/**
 * Check a whole content object. Returns [{ path, message }] (empty when it's fine);
 * paths look like `projects[2].images[0].alt`. `warnings` are allowed through.
 */
export function validateContent(c) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });
  const text = (v, path, required = false) => {
    if (typeof v !== 'string') err(path, 'Must be text.');
    else if (required && !v.trim()) err(path, 'Can’t be empty.');
  };
  const texts = (obj, path, keys, required = false) => { for (const k of keys) text(obj?.[k], `${path}.${k}`, required); };
  const list = (v, path, each) => {
    if (!Array.isArray(v)) return err(path, 'Must be a list.');
    v.forEach((x, i) => each(x, `${path}[${i}]`));
  };
  const obj = (v, path) => { if (!isObj(v)) { err(path, 'Must be a group of fields.'); return false; } return true; };
  const flag = (v, path) => { if (v !== undefined && typeof v !== 'boolean') err(path, 'Must be on or off.'); };
  const optional = (o, path, keys) => { for (const k of keys) if (o[k] !== undefined) text(o[k], `${path}.${k}`); };
  const link = (href, path) => { if (!isSafeUrl(href)) err(path, 'Not a link the site can use (https://…, mailto:…, or a path like games/x.html).'); };
  const links = (v, path) => list(v, path, (l, p) => {
    if (!obj(l, p)) return;
    text(l.label, `${p}.label`, true);
    link(l.href, `${p}.href`);
    flag(l.hidden, `${p}.hidden`);
  });

  if (!isObj(c)) return { errors: [{ path: '', message: 'Content must be an object.' }], warnings };
  for (const key of SECTIONS) if (!(key in c)) err(key, 'Missing section.');
  if (errors.length) return { errors, warnings };

  // site
  if (obj(c.site, 'site')) {
    texts(c.site, 'site', ['name', 'title', 'description'], true);
    if (c.site.url !== undefined && !/^https:\/\//.test(c.site.url ?? '')) err('site.url', 'Must start with https://.');
    if (c.site.email !== undefined) text(c.site.email, 'site.email');
    if (c.site.resumeUrl !== undefined && c.site.resumeUrl !== null && c.site.resumeUrl !== '') link(c.site.resumeUrl, 'site.resumeUrl');
    if (c.site.links !== undefined && obj(c.site.links, 'site.links')) for (const [k, v] of Object.entries(c.site.links)) link(v, `site.links.${k}`);
  }

  // screens: fixed ids, editable labels, any order
  list(c.screens, 'screens', (s, p) => { if (obj(s, p)) text(s.label, `${p}.label`, true); });
  if (Array.isArray(c.screens)) {
    const ids = c.screens.map((s) => s?.id);
    if (ids.length !== SCREEN_IDS.length || SCREEN_IDS.some((id) => !ids.includes(id))) err('screens', `Screens must be exactly: ${SCREEN_IDS.join(', ')}.`);
  }

  // weapons + starting equipment
  if (obj(c.weapons, 'weapons')) {
    const keys = Object.keys(c.weapons);
    if (keys.length !== WEAPON_KEYS.length || WEAPON_KEYS.some((k) => !keys.includes(k))) err('weapons', 'The weapon list is fixed by the 3D model; only names can change.');
    for (const k of keys) text(c.weapons[k], `weapons.${k}`, true);
  }
  // Which weapons a random draw can pick (a missing one counts as on).
  if (c.weaponDraw !== undefined && obj(c.weaponDraw, 'weaponDraw')) {
    for (const [k, v] of Object.entries(c.weaponDraw)) {
      if (!WEAPON_KEYS.includes(k)) err(`weaponDraw.${k}`, 'Not one of the weapons.');
      else flag(v, `weaponDraw.${k}`);
    }
    const on = WEAPON_KEYS.filter((k) => c.weaponDraw[k] !== false).length;
    if (on < MIN_WEAPONS) err('weaponDraw', `Keep at least ${MIN_WEAPONS} weapons in the draw, so a new one can always be picked.`);
  }
  if (obj(c.startingEquipment, 'startingEquipment')) {
    if (!WEAPON_KEYS.includes(c.startingEquipment.weapon)) err('startingEquipment.weapon', 'Pick one of the weapons.');
    if (!flameIds(c).includes(c.startingEquipment.flame)) err('startingEquipment.flame', 'Pick one of the bonfire palettes.');
    if (c.startingEquipment.element !== undefined && !ELEMENT_IDS.includes(c.startingEquipment.element)) err('startingEquipment.element', 'Pick one of the elements.');
  }

  validateEffects(c.effects, err);

  // admin panel's own label overrides (the site ignores them)
  if (c.admin !== undefined && obj(c.admin, 'admin') && c.admin.labels !== undefined && obj(c.admin.labels, 'admin.labels')) {
    for (const [k, v] of Object.entries(c.admin.labels)) {
      if (typeof v !== 'string' || v.length > 60) err(`admin.labels.${k}`, 'Text up to 60 characters.');
    }
  }

  // Bonfire Live's preset scenes (made in the Painter): optional like `admin`, but checked
  // in full when it's there (scenes.js), against the site's own void when a scene keeps
  // the site's scenery colors.
  if (c.scenes !== undefined) validateScenes(c.scenes, err, 'scenes', { voidHex: c.effects?.colors?.void });

  // hero
  if (obj(c.hero, 'hero')) {
    texts(c.hero, 'hero', ['eyebrow', 'value', 'menuLabel', 'stokeLabel', 'sceneLabel', 'sceneKnight']);
    optional(c.hero, 'hero', ['sceneSign']); // (his summon sign, while he's away)
    if (obj(c.hero.stokeHint, 'hero.stokeHint')) texts(c.hero.stokeHint, 'hero.stokeHint', ['pointer', 'touch']);
    if (obj(c.hero.kindled, 'hero.kindled')) {
      texts(c.hero.kindled, 'hero.kindled', ['title', 'subtitle']);
      if (!KINDLED_SHOW.includes(c.hero.kindled.show)) err('hero.kindled.show', `Must be one of: ${KINDLED_SHOW.join(', ')}.`);
      const d = c.hero.kindled.duration;
      if (typeof d !== 'number' || !Number.isFinite(d) || d < 500 || d > 20000) err('hero.kindled.duration', 'Between 500 and 20000 ms.');
    }
  }

  // screen headings
  if (obj(c.sections, 'sections')) for (const [k, s] of Object.entries(c.sections)) {
    if (!obj(s, `sections.${k}`)) continue;
    text(s.title, `sections.${k}.title`, true);
    optional(s, `sections.${k}`, ['flavor', 'intro']);
  }

  // projects: featured, projects, archive
  const seen = new Map();
  const project = (p, path, { needsImages }) => {
    if (!obj(p, path)) return;
    if (typeof p.id !== 'string' || !ID_RE.test(p.id)) err(`${path}.id`, 'Use lowercase letters, numbers and single dashes (it becomes the page address).');
    else if (seen.has(p.id)) err(`${path}.id`, `“${p.id}” is already used by ${seen.get(p.id)}.`);
    else seen.set(p.id, p.name || p.id);
    text(p.name, `${path}.name`, true);
    optional(p, path, ['kind', 'year', 'status', 'summary', 'outcome', 'problem', 'built', 'role', 'flavor', 'note', 'todo']);
    flag(p.hidden, `${path}.hidden`);
    if (p.tech !== undefined) list(p.tech, `${path}.tech`, (t, tp) => text(t, tp, true));
    if (p.links !== undefined) links(p.links, `${path}.links`);
    if (p.href !== undefined) link(p.href, `${path}.href`);
    if (p.images !== undefined) {
      list(p.images, `${path}.images`, (im, ip) => {
        if (!obj(im, ip)) return;
        if (typeof im.src !== 'string' || !IMAGE_RE.test(im.src)) err(`${ip}.src`, 'Image path must look like assets/projects/<folder>/<name>.');
        text(im.alt, `${ip}.alt`, true);
        // Alt text is read aloud in place of the screenshot: it should say what's in it.
        if (typeof im.alt === 'string' && im.alt.trim()) {
          const alt = im.alt.trim();
          if (alt.length < 15 || /^(image|screenshot|picture|photo|img)\b/i.test(alt) || alt === im.caption) {
            warn(`${ip}.alt`, 'Describe what the screenshot shows (what’s on screen, not “screenshot of…”), in a sentence.');
          }
        }
        if (im.caption !== undefined) text(im.caption, `${ip}.caption`);
        flag(im.pixel, `${ip}.pixel`);
        flag(im.video, `${ip}.video`);
        flag(im.hidden, `${ip}.hidden`);
      });
    }
    const imageCount = shownImages(p).length;
    if (needsImages && !imageCount) err(`${path}.images`, 'Add at least one visible image (the first visible one is the inventory icon).');
    if (!needsImages && !imageCount && !p.href) warn(path, 'With no images and no link, this won’t appear anywhere.');
  };
  project(c.featured, 'featured', { needsImages: true });
  list(c.projects, 'projects', (p, path) => project(p, path, { needsImages: true }));
  list(c.archive, 'archive', (p, path) => project(p, path, { needsImages: false }));
  const slots = inventoryEntries(c).filter((p) => isObj(p) && !p.hidden && shownImages(p).length).length;
  if (slots > GRID_SLOTS) warn('projects', `${slots} visible items; the inventory grid holds ${GRID_SLOTS} before it grows past its box.`);

  // about
  if (obj(c.about, 'about')) {
    list(c.about.paragraphs, 'about.paragraphs', (t, p) => text(t, p, true));
    list(c.about.stats, 'about.stats', (row, p) => {
      if (!Array.isArray(row) || row.length !== 2) return err(p, 'Each stat is a label and a value.');
      text(row[0], `${p}[0]`, true); text(row[1], `${p}[1]`, true);
    });
  }

  // journey
  list(c.experience, 'experience', (org, p) => {
    if (!obj(org, p)) return;
    text(org.org, `${p}.org`, true); text(org.location, `${p}.location`);
    flag(org.hidden, `${p}.hidden`);
    list(org.roles, `${p}.roles`, (r, rp) => {
      if (!obj(r, rp)) return;
      text(r.title, `${rp}.title`, true); text(r.dates, `${rp}.dates`);
      flag(r.hidden, `${rp}.hidden`);
      list(r.bullets, `${rp}.bullets`, (b, bp) => text(b, bp, true));
    });
  });
  if (obj(c.leadership, 'leadership')) {
    text(c.leadership.title, 'leadership.title', true); text(c.leadership.flavor, 'leadership.flavor');
    list(c.leadership.items, 'leadership.items', (it, p) => {
      if (!obj(it, p)) return;
      text(it.org, `${p}.org`, true); texts(it, p, ['role', 'dates', 'text']);
      flag(it.hidden, `${p}.hidden`);
    });
  }
  list(c.education, 'education', (e, p) => {
    if (!obj(e, p)) return;
    text(e.name, `${p}.name`, true); texts(e, p, ['org', 'dates']);
    flag(e.hidden, `${p}.hidden`);
  });

  // skills
  list(c.skills, 'skills', (g, p) => {
    if (!obj(g, p)) return;
    text(g.group, `${p}.group`, true);
    flag(g.hidden, `${p}.hidden`);
    list(g.items, `${p}.items`, (s, sp) => {
      if (!obj(s, sp)) return;
      text(s.name, `${sp}.name`, true); text(s.flavor, `${sp}.flavor`);
      flag(s.hidden, `${sp}.hidden`);
      if (typeof s.glyph !== 'string' || !s.glyph.trim()) err(`${sp}.glyph`, 'Can’t be empty.');
      else if ([...s.glyph].length > 3) err(`${sp}.glyph`, 'At most 3 characters (it has to fit the slot).');
    });
  });

  // contact
  if (obj(c.contact, 'contact')) {
    texts(c.contact, 'contact', ['heading', 'body', 'footer', 'backToTop']);
    optional(c.contact, 'contact', ['todo']);
    list(c.contact.links, 'contact.links', (l, p) => {
      if (!obj(l, p)) return;
      text(l.label, `${p}.label`, true); text(l.value, `${p}.value`);
      link(l.href, `${p}.href`);
      flag(l.hidden, `${p}.hidden`);
    });
  }

  // interface text
  if (obj(c.ui, 'ui')) for (const [k, v] of Object.entries(c.ui)) {
    if (k !== 'prompts') { text(v, `ui.${k}`); continue; }
    list(v, 'ui.prompts', (row, p) => {
      if (!Array.isArray(row) || row.length !== 3) return err(p, 'Each prompt is: key, second key (or empty), label.');
      text(row[0], `${p}[0]`, true);
      if (row[1] !== null) text(row[1], `${p}[1]`);
      text(row[2], `${p}[2]`, true);
    });
  }
  if (obj(c.notFound, 'notFound')) texts(c.notFound, 'notFound', ['title', 'flavor', 'body', 'cta']);

  return { errors, warnings };
}
