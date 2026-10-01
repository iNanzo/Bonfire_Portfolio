// How the editor presents content.json. The editor itself is generic (any field
// you add to content.json shows up); this file only adds labels, help, grouping
// and the few special cases. Patterns: `projects[].images[].alt` (index → []).
// Labels are run through titleCase(), so write them in any case.
//
// The settings the site shares with Bonfire Live and the Painter (pixel size, dither, Edge
// Glow Strength…) take their names and help from src/settingsMap.js, so each has one name
// in every app. Help is a sentence or two (160 characters at most); anything longer goes in
// MORE, which the form folds under the help. A help line can name another page or field by
// its label, {{page:interface}} or {{label:startingEquipment}}, or quote a value from the
// draft, {{value:effects.elements.ice.name}}: resolveHelp() fills them in as they stand, so
// a page or section renamed with ✎ is named right.
import { KINDLED_SHOW, WEAPON_KEYS } from '../../src/contentRules.js';
import content from '../../src/content.json' with { type: 'json' };
import {
  CURSOR_MODES, DEFAULT_EFFECTS, DITHER_MATRICES, ELEMENT_IDS, KNIGHT_ARRIVALS, KNIGHT_FINISHES, KNIGHT_HELMETS, KNIGHT_SEATS, KNIGHT_STYLES, RANGES,
} from '../../src/effectsDefaults.js';
import { FINISH_NAMES, HELMET_NAMES, STYLE_NAMES } from '../../src/knightNames.js';
import { defaultScene, MUSIC, NAME_MAX } from '../../src/scenes.js';
import { harmoniousFlame, hexToOklch } from '../../src/paletteGen.js';
import { PIXEL_SIZES } from '../../src/visualizer/render.js';
import { adminHelp, adminLabels, meta } from '../../src/settingsMap.js';
import { titleCase } from './text.js';

const PREVIEW_BLURB = 'The preview updates as you edit; nothing is published until you save.';
/** Sidebar pages, grouped, and the content sections (dotted paths allowed) each one edits. */
export const PAGES = [
  { id: 'projects', group: 'Content', label: 'Projects', keys: ['featured', 'projects', 'archive'], blurb: 'The inventory: the flagship first, then projects, then earlier explorations.' },
  { id: 'home', group: 'Content', label: 'Home & site', keys: ['hero', 'site'], blurb: 'The title screen, the “Embers Kindled” banner, and what search engines see.' },
  { id: 'about', group: 'Content', label: 'About', keys: ['about'], blurb: 'Paragraphs and the stat sheet.' },
  { id: 'journey', group: 'Content', label: 'Journey', keys: ['experience', 'leadership', 'education'], blurb: 'Work history, leadership and certificates.' },
  { id: 'skills', group: 'Content', label: 'Skills', keys: ['skills'], blurb: 'Skill groups and the glyphs drawn in their slots.' },
  { id: 'contact', group: 'Content', label: 'Contact', keys: ['contact'], blurb: 'The contact screen and its links.' },
  // The site's effects, on four pages beside the live preview (they were one long Effects page).
  {
    id: 'colors', group: 'Look & feel', label: 'Colors', preview: true, keys: ['effects.flames', 'effects.colors'],
    blurb: `The flame colors the bonfire draws from, and the place colors every frame is built on. ${PREVIEW_BLURB}`,
  },
  {
    id: 'fire', group: 'Look & feel', label: 'Fire & elements', preview: true,
    keys: ['effects.fire', 'effects.elements', 'effects.lightning', 'effects.ice', 'effects.particles'],
    blurb: `How the bonfire burns, what it’s made of (fire, lightning, ice) and how many particles each effect uses. ${PREVIEW_BLURB}`,
  },
  {
    id: 'picture', group: 'Look & feel', label: 'Picture', preview: true, keys: ['effects.render', 'effects.impact', 'effects.fireflies', 'effects.cursor'],
    blurb: `The pixel-art pass over the scene, what makes a hit land, the fireflies and the cursor’s pull on the fire. ${PREVIEW_BLURB}`,
  },
  {
    id: 'knight', group: 'Look & feel', label: 'Knight', preview: true, keys: ['effects.knight'],
    blurb: `The knight who comes to the fire: when he comes, how he’s drawn and how he answers visitors. ${PREVIEW_BLURB}`,
  },
  {
    id: 'scenes', group: 'Look & feel', label: 'Scenes', keys: ['scenes'],
    blurb: 'The preset scenes Bonfire Live loops through, in this order. Make them in the Bonfire Painter, then Import From Painter here.',
  },
  { id: 'headings', group: 'Settings', label: 'Screen headings', keys: ['sections'], blurb: 'The title, flavor line and intro at the top of each screen.' },
  { id: 'interface', group: 'Settings', label: 'Interface', keys: ['screens', 'ui', 'weapons', 'weaponDraw', 'startingEquipment', 'notFound'], blurb: 'Tab names, the header, menus and pack, weapon names and which weapons can be drawn, the starting equipment and the 404 page.' },
];
/** Old page addresses that still work (#effects was the one Effects page). */
export const PAGE_ALIASES = { effects: 'colors' };

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
  weaponDraw: 'Weapons in the draw',
  // (The switches are labelled with the weapons' names as the site ships them.)
  ...Object.fromEntries(WEAPON_KEYS.map((k) => [`weaponDraw.${k}`, content.weapons?.[k] ?? k])),
  startingEquipment: 'Starting equipment',
  notFound: '404 page',
  'hero.kindled': '“Embers Kindled” banner',
  'hero.stokeHint': 'Stoke hint',
  'hero.value': 'Intro line',
  'hero.sceneLabel': 'Scene description (screen readers)',
  'hero.sceneKnight': 'The knight in the scene description',
  'hero.sceneSign': 'His summon sign in the scene description',
  'site.title': 'Browser title',
  'site.description': 'Search / share description',
  'site.url': 'Site address',
  'site.links': 'Profile links',
  'site.resumeUrl': 'Résumé',
  'sections.projects': 'Project inventory screen',
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
  '[].id': 'ID',
  '[].built': 'What I built',
  '[].problem': 'The problem',
  '[].role': 'My role',
  '[].tech': 'Tech tags',
  '[].kind': 'Kind',
  '[].flavor': 'Flavor line',
  '[].outcome': 'Result',
  '[].href': 'Link',
  '[].glyph': 'Glyph',
  '[].todo': 'To confirm',
  // ui: the site's interface text, by where it shows (SUBGROUPS)
  'ui.menu': 'Menu button',
  'ui.resume': 'Résumé button',
  'ui.close': 'Close',
  'ui.back': 'Back',
  'ui.soundOn': 'Sound on',
  'ui.soundOff': 'Sound off',
  'ui.soundHint': 'Sound button tip',
  'ui.skip': 'Skip link',
  'ui.menuFlavor': 'Menu flavor line',
  'ui.keysHint': 'Menu keys line',
  'ui.stokePrompt': 'Stoke prompt',
  'ui.photo': 'Photo mode',
  'ui.photoHint': 'Photo mode tip',
  'ui.breakdown': 'How it’s made',
  'ui.breakdownHint': 'How it’s made tip',
  'ui.discoveries': 'Discoveries',
  'ui.discoveriesFlavor': 'Discoveries flavor line',
  'ui.discovery': 'Discovery note',
  'ui.inspect': 'Inspect button',
  'ui.equipped': 'Equipped',
  'ui.item': 'Item (one)',
  'ui.items': 'Items (more)',
  'ui.prevItem': 'Previous item',
  'ui.nextItem': 'Next item',
  'ui.prevScreen': 'Previous screen',
  'ui.nextScreen': 'Next screen',
  'ui.prevImage': 'Previous image',
  'ui.nextImage': 'Next image',
  'ui.openGallery': 'View full size',
  'ui.gallery': 'Gallery name',
  'ui.problem': 'Problem heading',
  'ui.built': 'What I built heading',
  'ui.role': 'Role heading',
  'ui.tech': 'Tech heading',
  'ui.wields': 'Wields',
  'ui.renderMenu': 'Menu title',
  'ui.renderReset': 'Reset row',
  'ui.pack': 'Pack title',
  'ui.packMap': 'Map',
  'ui.packMapVerb': 'Map action',
  'ui.packAnvil': 'Anvil',
  'ui.packAnvilVerb': 'Anvil action',
  'ui.packSwords': 'Swords heading',
  'ui.packGreatswords': 'Greatswords heading',
  'ui.packPolearms': 'Polearms heading',
  'ui.packAxes': 'Axes & hammers heading',
  'ui.packTome': 'Spell tome',
  'ui.packTomeVerb': 'Spell tome action',
  'ui.packRing': 'Ring of (element)',
  'ui.packLiving': 'Living weapon',
  'ui.packSpells': 'Spells heading',
  'ui.packColors': 'Flame colors heading',
  'ui.packKnight': 'Knight',
  'ui.packKnightVerb': 'Knight action',
  'ui.packSummon': 'Summon',
  'ui.packDismiss': 'Send him off',
  'ui.packHelmets': 'Helmets heading',
  'ui.packStyles': 'Styles heading',
  'ui.packFinishes': 'Finishes heading',
  'ui.packGestures': 'Gestures heading',
  'ui.prompts': 'Key prompts',
  // effects (the shared ones come from the settings map, below)
  'effects.render': 'Pixel art',
  'effects.impact': 'Hits',
  'effects.fire': 'Fire',
  'effects.particles': 'Particles',
  'effects.fireflies': 'Fireflies',
  'effects.cursor': 'Cursor',
  'effects.colors.void': 'Background (void)',
  'effects.colors.bone': 'Light (bone)',
  'effects.colors.shadow': 'Shadow',
  'effects.colors.stone': 'Stone',
  'effects.colors.wood': 'Wood',
  'effects.flames[].lo': 'Embers (lo)',
  'effects.flames[].mid': 'Body (mid)',
  'effects.flames[].hi': 'Tips & text (hi)',
  'effects.flames[].core': 'Core',
  'effects.flames[].shade': 'Firelit stone',
  'effects.fire.size': 'Size',
  'effects.fire.height': 'Rise speed',
  'effects.fire.turbulence': 'Turbulence',
  'effects.fire.swirl': 'Swirl scale',
  'effects.fire.lifeMin': 'Shortest flame life',
  'effects.fire.lifeMax': 'Longest flame life',
  'effects.fire.stoke': 'Stoke flare',
  'effects.particles.fire': 'Fire particles',
  'effects.particles.sparks': 'Sparks',
  'effects.particles.forge': 'Forge particles',
  'effects.particles.impact': 'Impact density',
  'effects.particles.touchScale': 'Touch device scale',
  'effects.fireflies.count': 'How many',
  'effects.fireflies.lit': 'Lit at rest',
  'effects.fireflies.lights': 'Real lights',
  'effects.fireflies.speed': 'Flight speed',
  'effects.fireflies.touchScale': 'Touch device scale',
  'effects.cursor.mode': 'Effect',
  'effects.cursor.strength': 'Strength',
  'effects.impact.markLife': 'Marks fade over',
  'effects.impact.afterimages': 'Lightning afterimages',
  'effects.impact.fireflyStrikes': 'Lightning strikes fireflies',
  'effects.impact.budget': 'Thin out busy moments',
  'effects.elements': 'Elements',
  ...Object.fromEntries(ELEMENT_IDS.flatMap((id) => [
    [`effects.elements.${id}`, id],
    [`effects.elements.${id}.name`, 'Name on the site'],
    [`effects.elements.${id}.rotation`, 'In rotation'],
    [`effects.elements.${id}.weight`, 'Relative chance'],
  ])),
  'effects.lightning': 'Lightning',
  'effects.lightning.size': 'Ball size',
  'effects.lightning.height': 'Ball height',
  'effects.lightning.filaments': 'Filaments',
  'effects.lightning.strikes': 'Ground strikes',
  'effects.lightning.boltWidth': 'Bolt thickness',
  'effects.lightning.jag': 'Jaggedness',
  'effects.lightning.branches': 'Forking',
  'effects.lightning.crackle': 'Crackle rate',
  'effects.lightning.drift': 'Drift speed',
  'effects.lightning.brightness': 'Brightness',
  'effects.lightning.cursorPull': 'Reach for the cursor',
  'effects.lightning.flicker': 'Light strobe',
  'effects.lightning.ringSpeed': 'Ring speed',
  'effects.lightning.ringArcs': 'Ring arcs & forks',
  'effects.ice': 'Ice',
  'effects.ice.shards': 'Crystals',
  'effects.ice.pulse': 'Glow pulse every',
  'effects.ice.clarity': 'Translucency',
  'effects.ice.height': 'Tallest crystal',
  'effects.ice.spread': 'Spread',
  'effects.ice.thickness': 'Thickness',
  'effects.ice.glow': 'Glow',
  'effects.ice.shimmer': 'Shimmer',
  'effects.ice.innerFire': 'Fire inside',
  'effects.ice.frost': 'Frost motes',
  'effects.ice.growTime': 'Freeze time',
  'effects.ice.ringSpeed': 'Ring speed',
  'effects.ice.ringHeight': 'Ring shard height',
  'effects.ice.ringHold': 'Ring shard hold',
  'effects.knight': 'The Knight',
  'effects.knight.show': 'Show the Knight',
  'effects.knight.arrival': 'Arrival',
  'effects.knight.restMin': 'Shortest Rest',
  'effects.knight.restMax': 'Longest Rest',
  // scenes
  scenes: 'Built-In Scenes',
  'scenes[].name': 'Name',
  'scenes[].id': 'ID',
  'scenes[].music': 'With the Music',
  'startingEquipment.element': 'Element',
  'startingEquipment.flame': 'Flame colors',
  // The settings the site shares with Bonfire Live and the Painter: the map's names win.
  ...adminLabels(),
};

export const HELP = {
  featured: 'Always first in the inventory: the flagship. Move To… on any project can swap it in.',
  projects: 'Shown after the featured project, in this order.',
  archive: 'Older work, after the projects. Items without images appear as the inventory’s “Also:” line (using their link) instead of a slot.',
  'hero.kindled': 'The checkpoint banner when the fire is stoked. Preview it on the site with ?kindled.',
  'hero.kindled.duration': 'Milliseconds on screen, fades included.',
  'hero.kindled.show': 'First: only on a visit’s first stoke. Always: on every stoke. Never: no banner.',
  'hero.sceneKnight': 'Read after the scene description while the knight is by the fire; left out while he’s away, or off ({{page:knight}} › {{label:effects.knight.show}}).',
  'hero.sceneSign': 'Read after the scene description while the knight is away and his summon sign waits on the ground. Left out where he can’t come. Optional.',
  screens: 'The site’s own menu. Labels only: the screens themselves are fixed.',
  weapons: 'Display names for the weapons in the fire (the models themselves are fixed).',
  weaponDraw: 'Which weapons a random draw can pick: inspecting a project, clicking the fire, Bonfire Live’s swaps. Keep at least 3 on.',
  startingEquipment: 'What’s in the fire when the site opens (and after Home).',
  'about.stats': 'Label and value rows of the stat sheet.',
  'skills[].items[].glyph': '2–3 characters drawn in the slot.',
  '[].id': 'The page address: /projects/<id>/. Lowercase letters, numbers and dashes.',
  '[].images': 'The first visible image is the inventory icon. Uploads become WebP (full size and a 720 px card). ◉ hides one without deleting it.',
  '[].summary': 'One or two lines for the inventory’s at-a-glance panel.',
  '[].outcome': 'The result in one line, under the title: what it achieved or proved (players, numbers, awards, what it led to). Empty hides it.',
  '[].images[].alt': 'Read aloud instead of the image, and shown if it can’t load. Required: say what’s on screen in a sentence, not “screenshot of…”.',
  '[].tech': 'The tags under the Tech heading on the project’s page.',
  '[].href': 'https://…, mailto:…, or a path on this site like games/x.html.',
  'site.resumeUrl': 'resume.pdf (a file in public/, shown once it’s there) or a https:// link. Empty: no Résumé button.',
  // ui
  'ui.menu': 'The header button that opens the rest menu, and the menu’s title.',
  'ui.resume': 'In the header, the rest menu and on Contact, once {{label:site.resumeUrl}} under {{page:home}} is set.',
  'ui.close': 'Closes the rest menu, the gallery, Discoveries, Photo Mode and How It’s Made.',
  'ui.back': 'On a project’s page: back to the inventory (Esc).',
  'ui.soundOn': 'The sound button’s label while the fire crackles.',
  'ui.soundOff': 'The sound button’s label while it’s muted.',
  'ui.soundHint': 'Shown on the sound button when it’s hovered or focused.',
  'ui.skip': 'The first stop for keyboard and screen-reader visitors: it jumps past the header to the page.',
  'ui.menuFlavor': 'The line under the rest menu’s title.',
  'ui.keysHint': 'The key help at the foot of the rest menu.',
  'ui.stokePrompt': 'Along the bottom of Home: an invitation to click the fire.',
  'ui.photo': 'Its name in the rest menu and on its own toolbar (F).',
  'ui.photoHint': 'Shown on Photo Mode in the rest menu when it’s hovered or focused.',
  'ui.breakdown': 'The render breakdown’s name in the rest menu and on its panel (B).',
  'ui.breakdownHint': 'Shown on How It’s Made in the rest menu when it’s hovered or focused.',
  'ui.discoveries': 'The small secrets a visitor has found: the rest menu’s entry and the list’s title.',
  'ui.discoveriesFlavor': 'The line under the Discoveries title.',
  'ui.discovery': 'Begins the note when a visitor finds a secret: “Discovery 3 / 21”.',
  'ui.inspect': 'Opens the chosen project from the inventory’s at-a-glance panel (Enter).',
  'ui.equipped': 'Before the equipped item’s name under the inventory: “Equipped: …”.',
  'ui.item': 'The inventory’s count when there’s one entry: “1 item”.',
  'ui.items': 'The inventory’s count for more than one: “12 items”.',
  'ui.prevItem': 'Read out for the arrows between projects on a project’s page.',
  'ui.nextItem': 'Read out for the arrows between projects on a project’s page.',
  'ui.prevScreen': 'Read out for the header’s Q key, which steps between screens.',
  'ui.nextScreen': 'Read out for the header’s E key, which steps between screens.',
  'ui.prevImage': 'Read out for the arrows between a project’s screenshots.',
  'ui.nextImage': 'Read out for the arrows between a project’s screenshots.',
  'ui.openGallery': 'On a project’s screenshot: opens it full size.',
  'ui.gallery': 'Read out as the full-size screenshot gallery opens.',
  'ui.problem': 'A heading on each project’s page, over the project’s own Problem.',
  'ui.built': 'A heading on each project’s page, over what was built.',
  'ui.role': 'A heading on each project’s page, over the role played.',
  'ui.tech': 'A heading on each project’s page, over its tech tags.',
  'ui.wields': 'The stat-sheet row on About naming the weapon in the fire.',
  'ui.renderMenu': 'The P menu’s title: where visitors change the pixel size, dither, outlines and more.',
  'ui.renderReset': 'The menu’s last row (0): it puts the site’s own look back.',
  'ui.pack': 'The pack’s name (I): the menu of things to do by the fire.',
  'ui.packMapVerb': 'Under the Map’s name: what it does (it moves the fire to another place).',
  'ui.packAnvilVerb': 'Under the Anvil’s name: what it does (forges another weapon).',
  'ui.packSwords': 'Over the Anvil’s swords.',
  'ui.packGreatswords': 'Over the Anvil’s greatswords.',
  'ui.packPolearms': 'Over the Anvil’s polearms.',
  'ui.packAxes': 'Over the Anvil’s axes and hammers.',
  'ui.packTomeVerb': 'Under the Spell Tome’s name: what it does (changes the fire).',
  'ui.packRing': 'Put before the element’s name for the spell that swaps it: “Ring of Frost”.',
  'ui.packLiving': 'The spell that pulls the weapon from the fire to fight on its own.',
  'ui.packSpells': 'Over the elements in the Spell Tome.',
  'ui.packColors': 'Over the flame colors in the Spell Tome.',
  'ui.packKnightVerb': 'Under the Knight’s name: what his menu does.',
  'ui.packSummon': 'Calls the knight out of his sign.',
  'ui.packDismiss': 'Sends the knight back into his sign.',
  'ui.packHelmets': 'Over the knight’s helmets in his menu.',
  'ui.packStyles': 'Over the knight’s styles in his menu.',
  'ui.packFinishes': 'Over the knight’s armor finishes in his menu.',
  'ui.packGestures': 'Over the knight’s gestures in his menu.',
  'ui.prompts': 'The key hints along the bottom: key, optional second key, label.',
  // effects (the shared ones come from the settings map, below)
  'effects.flames[].id': 'Internal name. Lowercase letters, numbers and dashes.',
  'effects.flames[].hi': 'Also the color of accent text, so it must stay readable on the background (4.5:1).',
  'effects.flames[].shade': 'A dark, tinted neutral for stone lit by this fire.',
  'effects.fire': 'How the bonfire burns at rest. Stoking and weapon swaps flare it from here.',
  'effects.particles': 'How many particles each effect uses: more looks richer but is slower on old machines. A change briefly reloads the preview.',
  'effects.particles.touchScale': 'Phones and tablets use this fraction of every particle count.',
  'effects.particles.impact': 'The ring of fire, smoke, ash and embers when a new weapon lands.',
  'effects.fireflies': 'The fireflies roaming the clearing.',
  'effects.fireflies.count': 'How many roam the clearing. A change briefly reloads the preview.',
  'effects.fireflies.lit': 'How many glow at once while resting. Landing or hovering can light more for a moment.',
  'effects.fireflies.lights': 'Fireflies that cast real light on the scene: the costliest part. A change briefly reloads the preview.',
  'effects.fireflies.speed': 'How fast they fly, as a multiple of their own pace.',
  'effects.fireflies.touchScale': 'Phones and tablets get this fraction of the fireflies. A change briefly reloads the preview.',
  'effects.cursor': 'How moving the cursor through the fire pushes it around.',
  'effects.cursor.mode': 'Ember mixes the others, with a slash on fast swings; the rest are its ingredients, one at a time.',
  'effects.render': 'The pixel-art pass over the whole scene, and the camera’s feel.',
  'effects.colors.void': 'The empty dark behind everything, and the page’s own background.',
  'effects.colors.shadow': 'The darkest shade of the scenery, in the shadows away from the fire.',
  'effects.colors.stone': 'The ruins’ stone as the firelight catches it.',
  'effects.colors.wood': 'The logs, and the scenery’s beams, posts and other wooden things.',
  'effects.colors.bone': 'The lightest neutral: text, ash, candle wax.',
  'effects.fire.size': 'How wide the fire’s base is (m).',
  'effects.fire.height': 'How fast the flames rise, and so how tall the fire stands.',
  'effects.fire.turbulence': 'How much the flames swirl and lick about. 0 is a calm, straight flame.',
  'effects.fire.swirl': 'The size of the swirls: low is big slow curls, high small busy ones.',
  'effects.fire.lifeMin': 'The shortest a flame particle lives before it fades (s). With the longest, it sets how tall and ragged the tongues are.',
  'effects.fire.lifeMax': 'The longest a flame particle lives before it fades (s).',
  'effects.fire.stoke': 'How much a click on the fire flares it up.',
  'effects.particles.fire': 'Particles in the bonfire itself. The biggest cost on slow machines.',
  'effects.particles.sparks': 'Sparks drifting up from the fire.',
  'effects.particles.forge': 'Particles that dissolve the old weapon and form the new one during a swap.',
  'effects.cursor.strength': 'How hard the cursor pushes the fire.',
  'effects.lightning.size': 'The ball’s radius (m).',
  'effects.lightning.filaments': 'How many arcs reach out from the ball.',
  'effects.lightning.jag': 'How crooked the arcs are. 0 is smooth curves.',
  'effects.lightning.branches': 'How often arcs fork into smaller ones.',
  'effects.lightning.drift': 'How fast the arcs wander around the ball.',
  'effects.lightning.brightness': 'How bright the arcs and the light they cast are.',
  'effects.lightning.ringSpeed': 'How fast the ring of lightning races out when a weapon lands.',
  'effects.ice.shards': 'How many crystals grow around the fire.',
  'effects.ice.pulse': 'Every few seconds a slow glow rises through the ice and the crystals’ outlines drift out. 0 is off.',
  'effects.ice.height': 'The tallest crystal’s height (m); the rest are shorter.',
  'effects.ice.spread': 'How far out from the fire the crystals grow (m).',
  'effects.ice.thickness': 'How chunky the crystals are.',
  'effects.ice.glow': 'How strongly the crystals glow from within.',
  'effects.ice.frost': 'Frost motes drifting around the crystals.',
  'effects.ice.ringSpeed': 'How fast the ring of ice shards races out when a weapon lands.',
  'effects.ice.ringHeight': 'How tall the ring’s shards spike up.',
  'effects.impact': 'What makes a hit feel heavy: when a weapon lands, a swing strikes or the fire is stoked.',
  'effects.impact.markLife': 'Seconds until a mark has faded away completely.',
  'effects.impact.afterimages': 'Lightning bolts leave a dim trace for a moment, like the glare after a real flash. 0 is off.',
  'effects.impact.fireflyStrikes': 'How often lightning jumps to a nearby firefly, which flickers bright. 0 is never.',
  'effects.impact.budget': 'When lots happens at once, the background extras (motes, sparkles, trails) thin out so the main hit reads. 0 never thins.',
  'effects.elements': 'What the bonfire is made of. Each draw picks an element from the ones in rotation, weighted by chance, with new flame colors.',
  ...Object.fromEntries(ELEMENT_IDS.flatMap((id) => [
    [`effects.elements.${id}.name`, id === 'fire'
      ? 'The word after the color in the fire’s name on the site: Azure {{value:effects.elements.fire.name}}.'
      : `Takes the place of “{{value:effects.elements.fire.name}}” in the fire’s name: Azure {{value:effects.elements.${id}.name}}.`],
    [`effects.elements.${id}.rotation`, 'Off keeps it out of every random draw; it can still be the starting element.'],
    [`effects.elements.${id}.weight`, 'How often it’s drawn compared to the others.'],
  ])),
  'effects.lightning': 'The bonfire as a tesla ball with no glass: filaments crackle out from a white-hot core, and heavy bolts strike the ground round it.',
  'effects.lightning.height': 'Where the ball sits: about 0.3 m is down in the bonfire’s core, between the logs; about 0.66 m floats above them.',
  'effects.lightning.crackle': 'How many times a second the bolts strike again in a new shape.',
  'effects.lightning.strikes': 'Heavy bolts the ball throws at the ground, logs and stones; each lands with a flash, crawls along the ground, then jumps on.',
  'effects.lightning.boltWidth': 'How thick the heavy bolts are, in scene pixels (they taper as they go). Filaments are a little thinner.',
  'effects.lightning.cursorPull': 'Like a plasma globe: the filaments nearest the cursor reach toward it. 0 is off.',
  'effects.lightning.flicker': 'How hard the light it casts strobes with the crackle. Keep it low for visitors sensitive to flashing light.',
  'effects.lightning.ringArcs': 'Forks skittering off the ring and arcs leaping up from it.',
  'effects.ice': 'The bonfire encased in a glowing crystal cluster that grows up round the blade, with a low fire still burning inside.',
  'effects.ice.clarity': 'How much you can see through the ice (the blade, logs and fire inside). 0 is solid.',
  'effects.ice.innerFire': 'How much of the fire keeps burning inside the ice. 0 is none.',
  'effects.ice.shimmer': 'A slow breathing of the shards’ glow.',
  'effects.ice.growTime': 'How long the shards take to grow in (they sink back a little faster).',
  'effects.ice.ringHold': 'How long each ring shard stays up before sinking. Longer is a wider band of spikes.',
  'effects.knight': 'A knight in steel plate who comes to the fire when he’s summoned, rests a while, then burns away into his sign again.',
  'effects.knight.show': 'Off: no knight and no summon sign; the fire burns alone (and the pack has no Knight item).',
  'effects.knight.arrival': 'Summon Sign: his sign waits on the ground until a visitor calls him. There From the Start: he rests by the fire from the first frame.',
  'effects.knight.restMin': 'The shortest he rests before he burns away into his sign (minutes); each summons rolls a rest between this and the longest.',
  'effects.knight.restMax': 'The longest a rest can roll (minutes). Set it to the shortest for an exact length.',
  // scenes
  scenes: 'The preset scenes Bonfire Live loops through, in this order. ◉ takes one out of the loop without deleting it.',
  'scenes[].name': `Shown on Bonfire Live’s scene cards and in its Scenes list. Up to ${NAME_MAX} characters.`,
  'scenes[].id': 'Bonfire Live’s links and saved loops use it (?scene=b:<id>), so keep it once it’s published. Lowercase letters, numbers and dashes.',
  'scenes[].music': 'Hold the Scene keeps all it sets for its stretch. Start From the Scene opens with its place, colors and look, then the show plays on.',
  // The settings the site shares with Bonfire Live and the Painter: the map's help wins.
  ...adminHelp(),
};

/**
 * The longer explanations, folded under a field's help ("More"): admin-only ones here, the
 * shared settings' from the map (meta('admin', path).more). One line per paragraph.
 */
const OWN_MORE = {
  weaponDraw: 'A weapon switched off never comes up in a draw, but can still be the starting weapon.',
  'hero.sceneKnight': 'He’s also left out where his model doesn’t load.',
  'effects.cursor.mode': 'Stir swirls the flames along the cursor’s swing.\nWake leaves spinning eddies behind it.\nPart pushes the flames aside round it.\nDraw pulls them toward it.\nSlash cuts through on a fast swing, the original effect.',
  'effects.elements': 'Inspecting a project or clicking the fire makes a draw, and every element burns in the flame colors.\n'
    + 'Home brings back the starting element ({{page:interface}} › {{label:startingEquipment}}).',
  'effects.lightning': 'Each heavy bolt lights the ground where it lands.\n'
    + 'When a weapon lands, lightning crackles out of the fire and a ring of lightning races across the ground instead of fire.',
  'effects.ice': 'When a weapon lands, a ring of ice shards spikes up as it races outward and sinks back behind itself, and a tuft of chill rolls off.',
  'effects.knight': 'His summon sign (the NH monogram) glows on the ground by his seat. A click on it, or Summon in the pack, calls him, and he forms out of it in the fire’s element.\n'
    + 'Visitors can summon him, send him off and change his helmet, style and finish from the pack; their picks stay in their browser, over these settings.\n'
    + 'Bonfire Live casts knights of its own (its Cast settings).\n'
    + 'Try him in the preview with the Knight…, Helmet… and Gesture… menus.',
  'effects.knight.arrival': 'With the sign, he burns away into it again after his rest.\nFrom the start, he stays until a visitor sends him off.',
  'effects.knight.restMin': 'There From the Start: he stays instead.',
  scenes: 'Each is made in the Bonfire Painter: Open in Painter shows it there, where you can change it, and Replace From Painter… brings the change back.\n'
    + 'These are the scenes every visitor’s Bonfire Live has; the ones visitors make stay in their own browsers.\n'
    + 'Bonfire Live’s Scenes & Cards settings can shuffle them.',
};
/** A field's longer explanation (its "More"), or ''. */
export const moreFor = (pattern) => hint(OWN_MORE, pattern) ?? meta('admin', pattern)?.more ?? '';

/** Extra words the search finds a field by (the shared settings bring the map's own). */
const OWN_KEYWORDS = {
  'ui.packMap': ['place', 'scenery', 'location'],
  'ui.packMapVerb': ['fast travel'],
  'ui.packAnvil': ['weapon', 'forge'],
  'ui.renderMenu': ['p menu', 'render settings'],
  'ui.renderReset': ['p menu', 'render settings'],
  'ui.prompts': ['keys', 'shortcuts'],
  'effects.particles': ['performance', 'lag', 'gpu'],
  'effects.fireflies.lights': ['performance', 'gpu'],
  'effects.impact.budget': ['performance'],
  'effects.lightning.flicker': ['strobe', 'flash', 'photosensitive'],
  'effects.cursor': ['mouse', 'pointer'],
  'effects.knight': ['knights', 'armor', 'helmet'],
  'effects.knight.style': ['smooth steel'],
  'effects.elements': ['lightning', 'ice', 'frost'],
  weaponDraw: ['weapons', 'random'],
};
/** A field's search words. */
export const keywordsFor = (pattern) => [...(hint(OWN_KEYWORDS, pattern) ?? []), ...(meta('admin', pattern)?.keywords ?? [])];

/**
 * A page's or section's name before any ✎ rename: 'page:<id>' for a page, a content key
 * ('startingEquipment', 'effects.knight.show') for the rest; in Title Case.
 * @param {string} key
 */
export const defaultLabel = (key) => titleCase(key.startsWith('page:') ? PAGES.find((p) => `page:${p.id}` === key)?.label ?? key : LABELS[key] ?? key);

/**
 * Help text with its {{page:id}}, {{label:key}} and {{value:path}} filled in: the names
 * as they stand now (renamed with ✎ or not: the page's `labelOf`) and the draft's values.
 * @param {string | undefined} text
 * @param {{ labelOf?: (key: string) => string, draft?: any }} [o]
 */
export function resolveHelp(text, { labelOf = defaultLabel, draft } = {}) {
  if (!text) return '';
  return text.replace(/\{\{(page|label|value):([^}]+)\}\}/g, (_, kind, key) => {
    if (kind !== 'value') return labelOf(kind === 'page' ? `page:${key}` : key);
    const v = key.split('.').reduce((o, k) => o?.[k], draft);
    const fallback = key.split('.').slice(1).reduce((o, k) => o?.[k], DEFAULT_EFFECTS);
    return String(typeof v === 'string' && v.trim() ? v.trim() : fallback ?? '');
  });
}

/**
 * Sub-headings inside one object: its fields in groups, in this order. A key ending in *
 * takes every key that starts so; fields no group names go last, under More. A heading that
 * would repeat the one above it (or its only field's label) isn't drawn.
 * @type {Record<string, { label: string, keys: string[] }[]>}
 */
export const SUBGROUPS = {
  // The canonical sections the other apps use (settingsMap.js SECTIONS).
  'effects.render': [
    { label: 'Pixel art', keys: ['pixelSize', 'pixelSizeSmall', 'dither', 'ditherMatrix', 'outlines'] },
    { label: 'Place & atmosphere', keys: ['vignette', 'exposure'] },
    { label: 'Colors', keys: ['colorChange'] },
    { label: 'Camera', keys: ['shake'] },
  ],
  'effects.knight': [
    { label: 'Knight', keys: ['show', 'arrival', 'restMin', 'restMax', 'seat', 'helmet'] },
    { label: 'Armor', keys: ['style', 'finish', 'rim', 'shine'] },
    { label: 'Behavior', keys: ['gestures', 'reactions'] },
  ],
  ui: [
    { label: 'Header & menu', keys: ['menu', 'resume', 'close', 'back', 'sound*', 'skip', 'menuFlavor', 'keysHint', 'stokePrompt', 'photo*', 'breakdown*', 'discover*'] },
    { label: 'Inventory & projects', keys: ['inspect', 'equipped', 'item', 'items', 'prev*', 'next*', 'openGallery', 'gallery', 'problem', 'built', 'role', 'tech', 'wields'] },
    { label: 'Render settings', keys: ['render*'] },
    { label: 'Pack', keys: ['pack*'] },
    { label: 'Key prompts', keys: ['prompts'] },
  ],
};

/**
 * An object's keys sorted into its sub-groups (SUBGROUPS[pattern]), in order: [{ label,
 * keys }], with the keys it has that no group names in a last "More" group. Null when the
 * object has no sub-groups.
 * @param {string} pattern
 * @param {string[]} keys the object's own keys, in content order
 */
export function subgroupsOf(pattern, keys) {
  const groups = SUBGROUPS[pattern];
  if (!groups) return null;
  const taken = new Set();
  const matches = (want, k) => (want.endsWith('*') ? k.startsWith(want.slice(0, -1)) : k === want);
  const out = groups.map((g) => {
    const mine = [];
    for (const want of g.keys) for (const k of keys) if (!taken.has(k) && matches(want, k)) { taken.add(k); mine.push(k); }
    return { label: g.label, keys: mine };
  });
  out.push({ label: 'More', keys: keys.filter((k) => !taken.has(k)) });
  return out.filter((g) => g.keys.length);
}

/** Long text: a textarea. */
export const MULTILINE = new Set(['value', 'summary', 'outcome', 'problem', 'built', 'flavor', 'note', 'body', 'text', 'description',
  'intro', 'sceneLabel', 'sceneKnight', 'sceneSign', 'alt', 'subtitle', 'footer', 'todo']);
export const MULTILINE_LISTS = new Set(['about.paragraphs', 'experience[].roles[].bullets']);
/** Short text fields that sit side by side instead of full width. */
export const SHORT = new Set(['id', 'year', 'kind', 'status', 'dates', 'location', 'glyph', 'label', 'name', 'title', 'org', 'role',
  'heading', 'eyebrow', 'menuLabel', 'stokeLabel', 'pointer', 'touch', 'cta', 'caption', 'email', 'url', 'weapon', 'flame', 'show', 'duration']);

/** Lists you can edit but not add to, remove from, reorder or hide. */
export const FIXED = new Set(['screens']);
export const READONLY = new Set(['screens[].id']);

const opts = (list, label = (v) => titleCase(String(v))) => list.map((v) => ({ value: v, label: label(v) }));
/**
 * The pixel sizes Bonfire Live, the Painter and the site's P menu offer (render.js
 * PIXEL_SIZES), plus the content's own if it's another (older content could have a 5 or 7).
 * @param {unknown} current
 */
const pixelSizes = (current) => [...new Set([...PIXEL_SIZES, ...(Number.isInteger(current) ? [current] : [])])]
  .sort((a, b) => Number(a) - Number(b))
  .map((n) => ({ value: n, label: PIXEL_SIZES.includes(Number(n)) ? `${n} px` : `${n} px (not in the menus)` }));
/** The knight's arrivals and seat poses, as the Knight page names them. */
export const ARRIVAL_NAMES = { sign: 'Summon Sign', start: 'There From the Start' };
export const SEAT_NAMES = { resting: 'Resting', watchful: 'Watchful' };
/** Dropdowns: (draft) → [{ value, label }]. */
export const SELECTS = {
  'hero.kindled.show': () => opts(KINDLED_SHOW),
  'startingEquipment.weapon': (d) => opts(WEAPON_KEYS, (k) => d.weapons?.[k] ?? k),
  'startingEquipment.flame': (d) => (d.effects?.flames ?? []).map((f) => ({ value: f.id, label: f.name || f.id })),
  'effects.cursor.mode': () => opts(CURSOR_MODES),
  'effects.knight.helmet': () => opts(KNIGHT_HELMETS, (k) => HELMET_NAMES[k] ?? 'Random Each Summon'),
  'effects.knight.arrival': () => opts(KNIGHT_ARRIVALS, (k) => ARRIVAL_NAMES[k]),
  'effects.knight.style': () => opts(KNIGHT_STYLES, (k) => STYLE_NAMES[k]),
  'effects.knight.finish': () => opts(KNIGHT_FINISHES, (k) => FINISH_NAMES[k]),
  'effects.knight.seat': () => opts(KNIGHT_SEATS, (k) => SEAT_NAMES[k]),
  'effects.render.pixelSize': (d) => pixelSizes(d?.effects?.render?.pixelSize),
  'effects.render.pixelSizeSmall': (d) => pixelSizes(d?.effects?.render?.pixelSizeSmall),
  'scenes[].music': () => opts(Object.keys(MUSIC), (k) => MUSIC[k]),
  'effects.render.ditherMatrix': () => opts(DITHER_MATRICES, (n) => `Bayer ${n}×${n}${n === 4 ? ' (Coarse)' : ' (Fine)'}`),
  'startingEquipment.element': (d) => ELEMENT_IDS.map((id) => {
    const name = d.effects?.elements?.[id]?.name?.trim();
    return { value: id, label: titleCase(name && name.toLowerCase() !== id ? `${id} (${name})` : id) };
  }),
};

/** A slider for a number: [min, max, step, unit?]. */
export const rangeFor = (pattern) => (pattern.startsWith('effects.') ? RANGES[pattern.slice(8)] : undefined);

/** Empty text in these becomes null (not ''). */
export const NULLABLE = new Set(['ui.prompts[][1]', 'site.resumeUrl']);
export const COLUMNS = {
  'about.stats': ['Label', 'Value'],
  'ui.prompts': ['Key', 'Second key', 'Label'],
};

/** A new flame: harmonious colors, its hue in the widest gap between the existing flames'. */
function newFlame(d) {
  const hues = (d?.effects?.flames ?? []).filter((f) => /^#[0-9a-f]{6}$/i.test(f?.mid ?? '')).map((f) => hexToOklch(f.mid).h).sort((a, b) => a - b);
  let hue = Math.random() * 360;
  if (hues.length) {
    let best = -1;
    hues.forEach((h, i) => {
      const next = i + 1 < hues.length ? hues[i + 1] : hues[0] + 360;
      if (next - h > best) { best = next - h; hue = h + best / 2; }
    });
  }
  const { colors } = harmoniousFlame(Math.random, { voidHex: d?.effects?.colors?.void ?? '#07070b', hue });
  return { id: '', name: 'New flame', ...colors, light: 0.34 };
}

/** What “Add” creates in each list (anything else copies the shape of the first entry). Gets the draft. */
export const TEMPLATES = {
  projects: () => ({ id: '', name: 'New project', kind: '', year: String(new Date().getFullYear()), status: '', summary: '', outcome: '',
    problem: '', built: '', role: '', tech: [], flavor: '', note: '', links: [], images: [] }),
  archive: () => ({ id: '', name: 'New item', kind: '', year: String(new Date().getFullYear()), summary: '', outcome: '', flavor: '',
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
  'effects.flames': newFlame,
  // (A new scene is the Painter's default one; its id follows its name until edited.)
  scenes: () => ({ ...defaultScene('New Scene'), id: '' }),
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
  'effects.flames': 'palette',
  scenes: 'scene',
};

/** The field a list entry is titled by. */
export const TITLE_KEYS = ['name', 'title', 'org', 'group', 'label', 'heading'];
/** Flame color fields, in ramp order (shown as a swatch strip on each flame card). */
export const SWATCH_KEYS = ['lo', 'mid', 'hi', 'core', 'shade'];

/** A lookup that tries the exact pattern, then the same pattern from any list (`[].key`). */
export function hint(table, pattern) {
  if (table instanceof Set) return table.has(pattern) || table.has(pattern.replace(/^.*\[\]/, '[]'));
  return table[pattern] ?? table[pattern.replace(/^.*\[\]/, '[]')];
}
