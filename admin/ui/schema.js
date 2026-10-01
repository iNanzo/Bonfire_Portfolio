// How the editor presents content.json. The editor itself is generic (any field
// you add to content.json shows up); this file only adds labels, help, grouping
// and the few special cases. Patterns: `projects[].images[].alt` (index → []).
// Labels are run through titleCase(), so write them in any case.
import { KINDLED_SHOW, WEAPON_KEYS } from '../../src/contentRules.js';
import content from '../../src/content.json' with { type: 'json' };
import {
  CURSOR_MODES, DEFAULT_EFFECTS, DITHER_MATRICES, ELEMENT_IDS, KNIGHT_ARRIVALS, KNIGHT_FINISHES, KNIGHT_HELMETS, KNIGHT_SEATS, KNIGHT_STYLES, RANGES,
} from '../../src/effectsDefaults.js';
import { FINISH_NAMES, HELMET_NAMES, STYLE_NAMES } from '../../src/knightNames.js';
import { DEFAULT_STYLE, STYLES } from '../../src/bonfire/knightStyles.js';
import { defaultScene, MUSIC, NAME_MAX } from '../../src/scenes.js';
import { harmoniousFlame, hexToOklch } from '../../src/paletteGen.js';
import { titleCase } from './text.js';

/** Sidebar pages, grouped, and the content sections (dotted paths allowed) each one edits. */
export const PAGES = [
  { id: 'projects', group: 'Content', label: 'Projects', keys: ['featured', 'projects', 'archive'], blurb: 'The inventory: the flagship first, then projects, then earlier explorations.' },
  { id: 'home', group: 'Content', label: 'Home & site', keys: ['hero', 'site'], blurb: 'The title screen, the “Embers Kindled” banner, and what search engines see.' },
  { id: 'about', group: 'Content', label: 'About', keys: ['about'], blurb: 'Paragraphs and the stat sheet.' },
  { id: 'journey', group: 'Content', label: 'Journey', keys: ['experience', 'leadership', 'education'], blurb: 'Work history, leadership and certificates.' },
  { id: 'skills', group: 'Content', label: 'Skills', keys: ['skills'], blurb: 'Skill groups and the glyphs drawn in their slots.' },
  { id: 'contact', group: 'Content', label: 'Contact', keys: ['contact'], blurb: 'The contact screen and its links.' },
  {
    id: 'effects', group: 'Look & feel', label: 'Effects', preview: true,
    keys: ['effects.flames', 'effects.elements', 'effects.fire', 'effects.lightning', 'effects.ice', 'effects.impact', 'effects.fireflies', 'effects.cursor', 'effects.particles', 'effects.render', 'effects.knight', 'effects.colors'],
    blurb: 'Bonfire colors, its elements (fire, lightning, ice), fireflies, the cursor, the pixel-art look and the knight who comes to the fire. The preview updates as you edit; nothing is published until you save.',
  },
  {
    id: 'scenes', group: 'Look & feel', label: 'Scenes', keys: ['scenes'],
    blurb: 'The preset scenes Bonfire Live loops through, in this order. Make them in the Bonfire Painter, then Import From Painter here.',
  },
  { id: 'headings', group: 'Settings', label: 'Screen headings', keys: ['sections'], blurb: 'The title, flavor line and intro at the top of each screen.' },
  { id: 'interface', group: 'Settings', label: 'Interface', keys: ['screens', 'ui', 'weapons', 'weaponDraw', 'startingEquipment', 'notFound'], blurb: 'Tab names, button text, weapon names and which weapons can be drawn, the starting equipment and the 404 page.' },
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
  'ui.prompts': 'Key prompts',
  '[].id': 'ID',
  '[].built': 'What I built',
  '[].problem': 'The problem',
  '[].role': 'My role',
  '[].tech': 'Tech (attributes)',
  '[].kind': 'Kind',
  '[].flavor': 'Flavor line',
  '[].outcome': 'Result',
  '[].href': 'Link',
  '[].glyph': 'Glyph',
  '[].todo': 'To confirm',
  // effects
  'effects.flames': 'Bonfire colors',
  'effects.colors': 'Scene colors',
  'effects.fire': 'Fire',
  'effects.particles': 'Particles',
  'effects.fireflies': 'Fireflies',
  'effects.cursor': 'Cursor effect',
  'effects.render': 'Rendering',
  'effects.colors.void': 'Background (void)',
  'effects.colors.bone': 'Light (bone)',
  'effects.colors.shadow': 'Shadow',
  'effects.colors.stone': 'Stone',
  'effects.colors.wood': 'Wood',
  'effects.render.outlines': 'Outlines',
  'effects.render.vignette': 'Dark edges (vignette)',
  'effects.render.exposure': 'Overall brightness',
  'effects.flames[].lo': 'Embers (lo)',
  'effects.flames[].mid': 'Body (mid)',
  'effects.flames[].hi': 'Tips & text (hi)',
  'effects.flames[].core': 'Core',
  'effects.flames[].shade': 'Firelit stone',
  'effects.flames[].light': 'Cast light whiteness',
  'effects.fire.brightness': 'Intensity',
  'effects.fire.size': 'Size',
  'effects.fire.height': 'Height',
  'effects.fire.turbulence': 'Turbulence',
  'effects.fire.swirl': 'Swirl scale',
  'effects.fire.lifeMin': 'Shortest flame life',
  'effects.fire.lifeMax': 'Longest flame life',
  'effects.fire.glow': 'Cast light',
  'effects.fire.fps': 'Animation frame rate',
  'effects.fire.stoke': 'Stoke flare',
  'effects.particles.fire': 'Fire particles',
  'effects.particles.sparks': 'Sparks',
  'effects.particles.forge': 'Forge particles (weapon swap)',
  'effects.particles.impact': 'Impact density',
  'effects.particles.touchScale': 'Touch device scale',
  'effects.fireflies.count': 'Fireflies',
  'effects.fireflies.lit': 'Lit at rest',
  'effects.fireflies.lights': 'Real lights',
  'effects.fireflies.speed': 'Flight speed',
  'effects.fireflies.touchScale': 'Touch device scale',
  'effects.cursor.mode': 'Effect',
  'effects.cursor.strength': 'Strength',
  'effects.render.pixelSize': 'Pixel size',
  'effects.render.pixelSizeSmall': 'Pixel size (small screens)',
  'effects.render.dither': 'Dither strength',
  'effects.render.ditherMatrix': 'Dither pattern',
  'effects.render.colorChange': 'Color change time',
  'effects.render.shake': 'Screen shake',
  'effects.impact': 'Hits & impacts',
  'effects.impact.hitStop': 'Freeze frame on hits',
  'effects.impact.flash': 'Impact flash',
  'effects.impact.marks': 'Ground marks',
  'effects.impact.markLife': 'Marks fade over',
  'effects.impact.debris': 'Bouncing debris',
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
  'effects.knight.helmet': 'Helmet',
  'effects.knight.style': 'Style',
  'effects.knight.finish': 'Armor Finish',
  'effects.knight.rim': 'Edge Glow',
  'effects.knight.shine': 'Armor Shine',
  'effects.knight.seat': 'Seat Pose',
  'effects.knight.gestures': 'Answers a Click',
  'effects.knight.reactions': 'Reactions',
  // scenes
  scenes: 'Built-In Scenes',
  'scenes[].name': 'Name',
  'scenes[].id': 'ID',
  'scenes[].music': 'With the Music',
  'startingEquipment.element': 'Element',
  'startingEquipment.flame': 'Bonfire colors',
};

export const HELP = {
  featured: 'Always first in the inventory — the flagship. “Move to…” on any project can swap it in.',
  projects: 'Shown after the featured project, in this order.',
  archive: 'Older work, after the projects. Items without images appear as the inventory’s “Also:” line (using their link) instead of a slot.',
  'hero.kindled': 'The checkpoint banner when the fire is stoked. Preview it on the site with ?kindled.',
  'hero.kindled.duration': 'Milliseconds on screen, fades included.',
  'hero.kindled.show': '“first”: the first stoke of a visit · “always”: every stoke · “never”.',
  'hero.sceneKnight': 'Read after the scene description while the knight is by the fire. Left out when he’s away, off (Effects → The Knight) or his model doesn’t load.',
  'hero.sceneSign': 'Read after the scene description while the knight is away and his summon sign waits on the ground. Left out where he can’t come. Optional.',
  screens: 'The site’s own menu. Labels only — the screens themselves are fixed.',
  weapons: 'Display names for the weapons in the fire (the models themselves are fixed).',
  weaponDraw: 'Which weapons a random draw can pick (inspecting a project, clicking the fire, the visualizer’s swaps). A weapon switched off never comes up, but can still be the starting weapon. Keep at least 3 on.',
  startingEquipment: 'What’s in the fire when the site opens (and after Home).',
  'about.stats': 'Label and value rows of the stat sheet.',
  'ui.prompts': 'The key hints along the bottom: key, optional second key, label.',
  'skills[].items[].glyph': '2–3 characters drawn in the slot.',
  '[].id': 'The page address: /projects/<id>/. Lowercase letters, numbers and dashes.',
  '[].images': 'The first visible image is the inventory icon. Uploads are converted to WebP (full size + a 720 px card). ◉ hides an image from the site without deleting it.',
  '[].summary': 'One or two lines for the inventory’s at-a-glance panel.',
  '[].outcome': 'The result in one line, shown under the title: what it achieved or proved (players, numbers, awards, what it led to). Leave empty to hide.',
  '[].images[].alt': 'Read aloud instead of the image, and shown if it can’t load. Say what’s on screen in a sentence (“The scene editor: a forest level with…”), not “screenshot of…”. Required.',
  '[].href': 'https://…, mailto:…, or a path on this site like games/x.html.',
  'site.resumeUrl': 'resume.pdf (a file in public/, shown once it’s there) or a https:// link. Empty: no Résumé button.',
  // effects
  'effects.flames': 'The color sets the bonfire can take. Fire, lightning and ice all burn in them, and the site’s accent colors follow along. Inspecting a project or clicking the fire draws one at random; hidden ones stay out of the draw (one can still be the starting colors). Keep at least 3 in rotation.',
  'effects.flames[].id': 'Internal name. Lowercase letters, numbers and dashes.',
  'effects.flames[].hi': 'Also the color of accent text, so it must stay readable on the background (4.5:1).',
  'effects.flames[].shade': 'A dark, tinted neutral for stone lit by this fire.',
  'effects.flames[].light': '0 = the fire casts its full color on the scene, 1 = plain white light.',
  'effects.colors': 'The neutral colors every frame is built from, plus the current flame. The background also colors the page behind the text.',
  'effects.fire': 'How the bonfire burns at rest. Stoking and weapon swaps flare it from here.',
  'effects.fire.fps': 'The fire moves in steps for a hand-animated look. Higher is smoother, less pixel-art.',
  'effects.fire.glow': 'How strongly the fire lights the scene.',
  'effects.particles': 'How many particles each effect uses. More looks richer but costs speed on slow machines. Changing these briefly reloads the preview.',
  'effects.particles.touchScale': 'Phones and tablets use this fraction of every particle count.',
  'effects.particles.impact': 'The ring of fire, smoke, ash and embers when a new weapon lands.',
  'effects.fireflies': 'The fireflies roaming the clearing.',
  'effects.fireflies.lit': 'How many glow at once while resting. Landing or hovering can light more for a moment.',
  'effects.fireflies.lights': 'Fireflies that cast real light on the scene (the costliest part).',
  'effects.cursor': 'How moving the cursor through the fire pushes it around.',
  'effects.cursor.mode': 'Ember mixes the others: stir + a soft part + a lean, with a slash on fast swings. Stir, Wake, Part, Draw and Slash are the ingredients alone.',
  'effects.render': 'The pixel-art pass over the whole scene.',
  'effects.colors.void': 'The empty dark behind everything, and the page’s own background.',
  'effects.colors.shadow': 'The darkest shade of the scenery, in the shadows away from the fire.',
  'effects.colors.stone': 'The ruins’ stone as the firelight catches it.',
  'effects.colors.wood': 'Logs and wooden things.',
  'effects.colors.bone': 'The lightest neutral: text, ash, candle wax.',
  'effects.fire.brightness': 'How bright each flame particle is. Higher burns whiter at the core.',
  'effects.fire.size': 'How wide the fire’s base is (m).',
  'effects.fire.height': 'How fast the flames rise, so how tall the fire stands.',
  'effects.fire.turbulence': 'How much the flames swirl and lick about. 0 = a calm, straight flame.',
  'effects.fire.swirl': 'The size of the swirls: low = big slow curls, high = small busy ones.',
  'effects.fire.lifeMin': 'The shortest a flame particle lives before it fades (s). Together with the longest, it sets how tall and ragged the tongues are.',
  'effects.fire.lifeMax': 'The longest a flame particle lives (s).',
  'effects.fire.stoke': 'How much a click on the fire flares it up.',
  'effects.particles.fire': 'Particles in the bonfire itself. The biggest cost on slow machines.',
  'effects.particles.sparks': 'Sparks drifting up from the fire.',
  'effects.particles.forge': 'Particles that dissolve the old weapon and form the new one during a swap.',
  'effects.fireflies.count': 'How many fireflies roam the clearing.',
  'effects.fireflies.speed': 'How fast they fly.',
  'effects.fireflies.touchScale': 'Phones and tablets get this fraction of the fireflies.',
  'effects.cursor.strength': 'How hard the cursor pushes the fire.',
  'effects.lightning.size': 'The ball’s radius (m).',
  'effects.lightning.filaments': 'How many arcs reach out from the ball.',
  'effects.lightning.jag': 'How crooked the arcs are. 0 = smooth curves.',
  'effects.lightning.branches': 'How often arcs fork into smaller ones.',
  'effects.lightning.drift': 'How fast the arcs wander around the ball.',
  'effects.lightning.brightness': 'How bright the arcs and the light they cast are.',
  'effects.lightning.ringSpeed': 'How fast the ring of lightning races out when a weapon lands.',
  'effects.ice.shards': 'How many crystals grow around the fire.',
  'effects.ice.pulse': 'Every few seconds a slow glow rises through the ice and the crystals’ outlines drift out. 0 = off.',
  'effects.ice.height': 'The tallest crystal’s height (m); the rest are shorter.',
  'effects.ice.spread': 'How far out from the fire the crystals grow (m).',
  'effects.ice.thickness': 'How chunky the crystals are.',
  'effects.ice.glow': 'How strongly the crystals glow from within.',
  'effects.ice.frost': 'Frost motes drifting around the crystals.',
  'effects.ice.ringSpeed': 'How fast the ring of ice shards races out when a weapon lands.',
  'effects.ice.ringHeight': 'How tall the ring’s shards spike up.',
  'effects.render.pixelSizeSmall': 'The same, on screens narrower than 700 px (phones).',
  'effects.render.ditherMatrix': 'The dither pattern: coarse 4×4 reads as classic pixel art, fine 8×8 as smoother gradients.',
  'effects.render.outlines': 'Dark outlines around shapes, like hand-drawn pixel art.',
  'effects.render.vignette': 'How much the corners darken, framing the fire. 0 = none.',
  'effects.render.exposure': 'The whole picture’s brightness.',
  'effects.render.shake': 'The camera shakes on impacts (off for everyone who asks their system for reduced motion).',
  'effects.impact': 'What makes a hit feel heavy: when a weapon lands, a swing strikes or the fire is stoked.',
  'effects.impact.hitStop': 'The scene freezes for this long on a big hit, then catches up (the camera keeps moving). 0 = off.',
  'effects.impact.flash': 'A one-frame flash of the flame’s core color on a big hit. Kept to a couple a second. 0 = off.',
  'effects.impact.marks': 'Hits leave scorch marks (fire), frost (ice) or branching burns (lightning) on the ground.',
  'effects.impact.markLife': 'Seconds until a mark has faded away completely.',
  'effects.impact.debris': 'Glowing coals, ice chips or sparks that bounce off the ground after a hit. 0 = none.',
  'effects.impact.afterimages': 'Lightning bolts leave a dim trace for a moment, like the glare after a real flash. 0 = off.',
  'effects.impact.fireflyStrikes': 'How often lightning jumps to a nearby firefly, which flickers bright. 0 = never.',
  'effects.impact.budget': 'When lots is happening at once, the background extras (motes, sparkles, trails) thin out so the main hit reads. 0 = never thin.',
  'effects.render.pixelSize': 'Screen pixels per scene pixel. Bigger = chunkier and faster.',
  'effects.render.dither': 'How much ordered dithering blends colors. 0 = flat bands.',
  'effects.render.colorChange': 'How long the bonfire takes to ease into new colors.',
  'effects.elements': 'What the bonfire is made of. Every draw (inspecting a project, clicking the fire) picks an element from the ones in rotation — weighted by chance — along with new bonfire colors, and every element burns in them. Home brings back the starting element (Interface → Starting Equipment).',
  ...Object.fromEntries(ELEMENT_IDS.flatMap((id) => [
    [`effects.elements.${id}.name`, id === 'fire'
      ? 'The word after the color in the fire’s name on the site: Azure Flame.'
      : `Takes the place of “Flame” in the fire’s name: Azure Flame → Azure ${DEFAULT_EFFECTS.elements[id].name}.`],
    [`effects.elements.${id}.weight`, 'How often it’s drawn compared to the others.'],
  ])),
  'effects.lightning': 'The bonfire as a tesla ball with no glass: filaments crackle out from a white-hot core around the blade and heavy bolts strike the ground around it, lighting it where they land. When a weapon lands, lightning crackles out of the fire and a ring of lightning races across the ground instead of fire.',
  'effects.lightning.height': 'Where the ball sits: about 0.3 m is down in the core of the bonfire, between the logs; about 0.66 m floats above them.',
  'effects.lightning.crackle': 'How many times a second the bolts re-strike into a new shape.',
  'effects.lightning.strikes': 'Heavy bolts the ball keeps throwing at the ground, logs and stones around it. Each one lands with a flash of light, crawls along the ground, then jumps somewhere new.',
  'effects.lightning.boltWidth': 'How thick the heavy bolts are, in scene pixels (they taper as they go). Filaments are a little thinner.',
  'effects.lightning.cursorPull': 'Like a plasma globe: the filaments nearest the cursor reach toward it. 0 = off.',
  'effects.lightning.flicker': 'How hard the light it casts strobes with the crackle.',
  'effects.lightning.ringArcs': 'Forks skittering off the ring and arcs leaping up from it.',
  'effects.ice': 'The bonfire encased in a glowing crystal cluster that grows up out of the ground around the blade, with a low fire still burning inside. When a weapon lands, a ring of ice shards spikes up as it expands outward and sinks back behind itself, and a tuft of chill rolls off.',
  'effects.ice.clarity': 'How much you can see through the ice (the blade, logs and fire inside). 0 = solid.',
  'effects.ice.innerFire': 'How much of the fire keeps burning inside the ice. 0 = none.',
  'effects.ice.shimmer': 'A slow breathing of the shards’ glow.',
  'effects.ice.growTime': 'How long the shards take to grow in (they sink back a little faster).',
  'effects.ice.ringHold': 'How long each ring shard stays up before sinking. Longer = a wider band of spikes.',
  'effects.knight': 'A knight in steel plate comes to the fire when he’s summoned. His summon sign (the NH monogram) glows on the ground by his seat; a click on it, or Summon in the pack, calls him, and he forms out of it in the fire’s current element (the weapon swap’s own dissolve). He rests a while, then burns away into the sign again. Visitors can summon him, send him off and change his helmet, style and armor finish from the pack (their picks are remembered in their browser, over the settings here). Bonfire Live has knight settings of its own. Try him in the preview with the Knight…, Helmet… and Gesture… menus.',
  'effects.knight.show': 'Off: no knight and no summon sign; the fire burns alone (and the pack has no Knight item).',
  'effects.knight.arrival': 'Summon Sign: he isn’t there when a page opens; his sign glows on the ground until a visitor clicks it (or picks Summon in the pack), and after his rest he burns away into it again. There From the Start: he’s resting by the fire from the first frame and stays until a visitor sends him off.',
  'effects.knight.restMin': 'The shortest he rests by the fire before he burns away into his sign again (minutes). Each summons rolls a rest between the shortest and the longest. There From the Start: he stays instead.',
  'effects.knight.restMax': 'The longest he rests (minutes). The same as the shortest for an exact length.',
  'effects.knight.helmet': 'The great helm, the armet or the pointed bascinet. “Random Each Summon” puts a new one on him each time he comes (unless the visitor picked one in the pack).',
  'effects.knight.style': `How he’s drawn; a change burns him away and forms him again in it. ${Object.entries(STYLE_NAMES)
    .map(([k, n]) => `${n}${k === DEFAULT_STYLE ? ' (the default)' : ''} — ${STYLES[k].hint.replace(/^./, (c) => c.toLowerCase())}`).join(' ')}`,
  'effects.knight.finish': `The color of his steel, in the styles that draw steel (all but ${Object.keys(STYLES).filter((k) => !STYLES[k].finish).map((k) => STYLE_NAMES[k]).join(' and ')}, which have their own): Gunmetal is a cool mid grey, Blackened darker with mostly reflections, Polished Steel bright with a mirror sheen, Burnished a warm rubbed brown.`,
  'effects.knight.rim': 'How strongly his edges catch the fire’s color: a thin line in the flame’s colors around him, brightest on the side facing the fire. 0 = none.',
  'effects.knight.shine': 'The fire’s reflection sweeping over his plate: a gentle band every few seconds at rest, and a bright one whenever the fire flares (a stoke, a weapon landing, a ring, the cursor on the fire). Off: his plate keeps a calm, steady look. Never for visitors who ask for reduced motion.',
  'effects.knight.seat': 'Resting: slumped by the fire, like a rest at a bonfire. Watchful: leaning in over his knees, forearms on them, head up at the fire, keeping watch.',
  'effects.knight.gestures': 'While he rests, a click on him gets a gesture back (Praise the Sun most often); hovered, he looks up at you and his rim warms to say so. Off: he isn’t a click target (no hover, and a click on him stokes the fire like anywhere else); the pack’s gestures still work. Never for visitors who ask for reduced motion.',
  'effects.knight.reactions': 'He sits up to watch a new weapon rise, flinches when it lands, leans away from a stoke and lifts his feet as a ring passes. Off: he just rests.',
  // scenes
  scenes: 'Bonfire Live loops through these in this order (its Scenes tab can shuffle them). ◉ takes one out of the loop without deleting it. Each is made in the Bonfire Painter: Open in Painter shows it there, where you can change it, and Replace From Painter… brings the change back. These are the scenes every visitor’s Bonfire Live has; the ones visitors make stay in their own browsers.',
  'scenes[].name': `Shown on Bonfire Live’s scene cards and in its Scenes list. Up to ${NAME_MAX} characters.`,
  'scenes[].id': 'The scene’s internal name: Bonfire Live’s links and saved loops use it (?scene=b:<id>), so keep it once it’s published. Lowercase letters, numbers and dashes.',
  'scenes[].music': 'Hold the Scene: everything it sets stays for its stretch; the music only pulses and drops it. Start From the Scene: its place, colors, framing and look open the stretch, then the show plays on.',
};

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
/** The knight's arrivals and seat poses, as the Knight section names them. */
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
  'scenes[].music': () => opts(Object.keys(MUSIC), (k) => MUSIC[k]),
  'effects.render.ditherMatrix': () => opts(DITHER_MATRICES, (n) => `Bayer ${n}×${n}${n === 4 ? ' (coarse)' : ' (fine)'}`),
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
