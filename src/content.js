// Portfolio copy and metadata. Rendering and generated SEO pages share this data.
//
// The data itself lives in src/content.json, which the admin panel edits (and you
// can edit by hand). This module re-exports it under the names the site uses and
// adds the helpers below. src/contentRules.js checks every edit before it's saved.
//
// Two voices:
//   - Main copy: plain, first person, written for someone skimming.
//   - `flavor`: short atmospheric lines (tooltips, subtitles). Always secondary.
//
// Entries with a `todo` note need Newton's confirmation before publishing (the
// site never shows it; the admin panel does).
//
// Hide & order:
//   - `hidden: true` on any entry keeps it off the site without deleting it: a
//     project, archive item, experience org or role, leadership item, education
//     row, skill group or skill, or contact link. A hidden project's page falls back
//     to the inventory.
//   - Everything appears in the order it's written; move an entry to reorder it.
//
// Shapes worth knowing:
//   - Projects (featured, projects, archive): problem → what I built → tech → my
//     role. `images[0]` is the inventory icon; each image is
//     public/<src>.webp plus a ~720px public/<src>-card.webp. Archive items with no
//     images appear as the inventory's "Also:" line (via `href`) instead of a slot.
//   - weapons: display names for the models in the fire (the keys are fixed by the
//     model). Flame colors and every other look setting live in `effects`
//     (read through src/effects.js; see src/effectsDefaults.js).
//   - hero.kindled: the "Embers Kindled" banner. show: 'first' | 'always' | 'never';
//     duration in ms. Preview with ?kindled.
//   - skills[].items[].glyph: the 2–3 letter mark drawn in the slot.
//   - about.stats: [label, value] rows of the stat sheet.
//   - images[].hidden keeps an image in the repo but off the site; the first
//     *visible* image is the icon. Hidden images are stripped here, so the rest
//     of the site never sees them.
import content from './content.json' with { type: 'json' };

export const {
  site, screens, weapons, startingEquipment, hero, sections,
  about, experience, leadership, education, skills, contact, ui, notFound,
} = content;

const withShownImages = (p) => (Array.isArray(p.images) ? { ...p, images: p.images.filter((im) => !im.hidden) } : p);
export const featured = withShownImages(content.featured);
export const projects = content.projects.map(withShownImages);
export const archive = content.archive.map(withShownImages);

/** Entries of a list that aren't hidden. */
export const shown = (list) => list.filter((entry) => !entry.hidden);

// Inventory order: flagship first, then projects, then earlier explorations (hidden ones left out).
export const items = () => shown([featured, ...projects, ...archive.filter((a) => a.images?.length)]);
