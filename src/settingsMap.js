// One map of the settings Bonfire Live, the Bonfire Painter and the admin's effects pages
// show: what each is called, what its hint says (and its longer "More"), where it sits,
// the range a number keeps to in every app, and which setting it needs. Each app reads its
// labels, hints and sections from here, and the settings search indexes it, so the same
// thing has the same name everywhere ("Flame Colors", "Place", "Edge Glow Strength").
//
// An entry is a concept, bound to what each app stores: Live's settings key (`live`), the
// Painter's scene path (`painter`) and the admin's content path (`admin`). The bindings are
// the saved names and are never renamed here; only what people read changes. A group binds
// once (looks for looks.echo, knights.helmets for knights.helmets.1; Live's 14 layer keys
// are the 'layers' entry) and its items take their hints from ITEM_HINTS.
//
// Copy rules (test/settingsMap.test.mjs holds them): labels in Title Case (titleCase in
// src/text.js: every word capitalized but a/an/the after the first), at most 32 characters;
// hints a sentence or two, 12–160 characters, saying what it does and why it matters
// without repeating the label; anything longer goes in `more` (one line per item, "\n"
// between them), which the apps show folded and the search reads. Where that text would be
// wrong in an app (Live's presets, a switch the admin keeps as on/off), `mores` gives the
// app its own, or null for none.
//
// No imports: the site, the admin and node's tests load it without pulling in anything else.

/**
 * A setting that does nothing while another is set a certain way: `when(value, all)` is
 * true then (`value` is the setting `key`'s, `all` every setting), and `reason` says why.
 * @typedef {{ key: string, when: (value: any, all: Record<string, any>) => boolean, reason: string }} Need
 */
/**
 * @typedef {{
 *   section: string, label: string, hint: string, more?: string, keywords?: string[], simple?: boolean,
 *   range?: [number, number, number, string?], live?: string, painter?: string, admin?: string,
 *   labels?: { live?: string, painter?: string, admin?: string }, hints?: { live?: string, painter?: string, admin?: string },
 *   mores?: { live?: string | null, painter?: string | null, admin?: string | null }, needs?: { live?: Need },
 * }} Entry
 */

/** Bonfire Live's settings tabs, in order. */
export const TABS = [
  { id: 'sound', label: 'Sound' },
  { id: 'show', label: 'Show' },
  { id: 'drops', label: 'Drops' },
  { id: 'picture', label: 'Picture' },
  { id: 'effects', label: 'Effects' },
  { id: 'camera', label: 'Camera' },
  { id: 'cast', label: 'Cast' },
  { id: 'scenes', label: 'Scenes & Cards' },
  { id: 'setups', label: 'My Setups' },
];

/**
 * Every section, in the order all the apps keep (each shows the ones it has). `tab`: Live's
 * tab, or null for a section only the Painter or the admin has. `intro`: a line under the
 * heading, for a section that's more than its fields.
 * @type {{ id: string, tab: string | null, label: string, intro?: string }[]}
 */
export const SECTIONS = [
  { id: 'source', tab: 'sound', label: 'Source' },
  { id: 'beat', tab: 'sound', label: 'Beat' },
  { id: 'midi', tab: 'sound', label: 'MIDI Controller', intro: 'Play the moments from a pad controller: connect it, press Learn beside an action, then press the pad. The mapping stays with this computer.' },
  { id: 'reaction', tab: 'show', label: 'Reaction' },
  { id: 'weapons', tab: 'show', label: 'Weapons' },
  { id: 'living', tab: 'show', label: 'Living Weapon' },
  { id: 'drop', tab: 'drops', label: 'The Drop' },
  { id: 'hits', tab: 'drops', label: 'Hits' },
  { id: 'place', tab: 'picture', label: 'Place & Atmosphere' },
  { id: 'colors', tab: 'picture', label: 'Colors' },
  { id: 'fire', tab: null, label: 'Fire' },
  { id: 'elements', tab: null, label: 'Elements' },
  { id: 'lightning', tab: null, label: 'Lightning' },
  { id: 'ice', tab: null, label: 'Ice' },
  { id: 'particles', tab: null, label: 'Particles' },
  { id: 'pixels', tab: 'picture', label: 'Pixel Art' },
  { id: 'performance', tab: 'picture', label: 'Performance' },
  { id: 'strength', tab: 'effects', label: 'Strength & Pace' },
  { id: 'looks', tab: 'effects', label: 'Looks' },
  { id: 'layers', tab: 'effects', label: 'Layers' },
  { id: 'xray', tab: 'effects', label: 'X-Ray' },
  { id: 'camera', tab: 'camera', label: 'Camera' },
  { id: 'cuts', tab: 'camera', label: 'Cuts' },
  { id: 'weaponShots', tab: 'camera', label: 'Weapon Shots' },
  { id: 'knights', tab: 'cast', label: 'Knights' },
  { id: 'armor', tab: 'cast', label: 'Armor' },
  { id: 'dancing', tab: 'cast', label: 'Dancing' },
  { id: 'behavior', tab: 'cast', label: 'Behavior' },
  { id: 'fireflies', tab: 'cast', label: 'Fireflies' },
  { id: 'cursor', tab: null, label: 'Cursor' },
  { id: 'presetScenes', tab: 'scenes', label: 'Preset Scenes' },
  { id: 'loop', tab: 'scenes', label: 'The Loop', intro: 'The scenes it plays, in this order. Untick one to leave it out; Play Now shows it at once.' },
  { id: 'titles', tab: 'scenes', label: 'Title Cards' },
  { id: 'moreCards', tab: 'scenes', label: 'More Cards', intro: 'Shout-outs, the next act, a hashtag… Each shows on drops, every 32 bars, or when you press its key (Shift+2 to Shift+9).' },
  { id: 'setups', tab: 'setups', label: 'My Setups', intro: 'Save everything as it is now under a name, to load again later. Your input device and volume aren’t part of a setup.' },
];

/**
 * The Painter's panel sections, in order, each gathering the shared sections in `from`, in
 * the order it shows them (a scene's parts sit where Live keeps the same setting; Show is
 * the Painter's own: what a scene leaves to the music, With the Music first).
 * @type {{ id: string, label: string, from: string[] }[]}
 */
export const PAINTER_SECTIONS = [
  { id: 'place', label: 'Place & Atmosphere', from: ['place'] },
  { id: 'colors', label: 'Colors', from: ['colors'] },
  { id: 'fire', label: 'Fire', from: ['fire'] },
  { id: 'pixels', label: 'Pixel Art', from: ['pixels'] },
  { id: 'look', label: 'Look', from: ['looks', 'strength', 'xray'] },
  { id: 'layers', label: 'Layers', from: ['layers'] },
  { id: 'camera', label: 'Camera', from: ['camera'] },
  { id: 'knights', label: 'Knights', from: ['knights', 'armor', 'dancing', 'behavior'] },
  { id: 'fireflies', label: 'Fireflies', from: ['fireflies'] },
  { id: 'show', label: 'Show', from: ['presetScenes', 'weapons', 'drop'] },
];

/** What the three-way switch's words mean (once per tab or section that has them). */
export const TRI_HELP = 'Off never plays it, In the Mix lets it come and go (rolled again now and then, with new details each time), and Always keeps it on.';

// A switch's value is Off (looks.js modeOf: anything but true, 'mix' or 'on').
const isOff = (v) => v !== true && v !== 'mix' && v !== 'on';

/** @type {Record<string, Entry>} Every setting, in the order the sections and the apps show them. */
export const SETTINGS = {
  // --- Sound › Source
  sensitivity: {
    section: 'source', label: 'Sensitivity', live: 'sensitivity', simple: true, range: [0.5, 2, 0.05, '×'],
    hint: 'How easily a sound counts as a kick or a hi-hat: raise it for quiet or muddy sound, lower it if the fire reacts to everything.',
    keywords: ['threshold', 'gain', 'input level'],
  },
  offset: {
    section: 'source', label: 'Visual Lead', live: 'offset', simple: true, range: [-100, 200, 5, 'ms'],
    hint: 'Shows each beat this much early, for projectors, TVs and Bluetooth speakers that lag. If the fire hits after the kick you hear, raise it.',
    keywords: ['latency', 'delay', 'sync', 'offset'],
  },
  volume: {
    section: 'source', label: 'Playback Volume', live: 'volume', simple: true, range: [0, 1, 0.05],
    hint: 'How loud a file or the demo track plays through this computer. It doesn’t change what the fire hears.',
    keywords: ['loudness', 'speakers'],
  },
  // --- Sound › Beat
  beatFrom: {
    section: 'beat', label: 'Beat From', live: 'beatFrom', simple: true,
    hint: 'Where the beat grid comes from: worked out from the music the fire hears, or exactly in time with DJ software over Ableton Link.',
    keywords: ['bpm', 'tempo', 'ableton', 'link', 'djay', 'rekordbox', 'traktor'],
  },
  linkPort: {
    section: 'beat', label: 'Link Bridge Port', live: 'linkPort', range: [1024, 65535, 1],
    hint: 'The port the Link bridge listens on (17001 unless you started it with --port).',
    keywords: ['ableton', 'carabiner', 'network'],
    needs: { live: { key: 'beatFrom', when: (v) => v !== 'link', reason: 'Only with Beat From: Ableton Link' } },
  },

  // --- Show › Reaction
  reactivity: {
    section: 'reaction', label: 'Reactivity', live: 'reactivity', simple: true, range: [0, 2, 0.05, '×'],
    hint: 'How hard the fire answers the music: how high it jumps and how bright it flares.',
    keywords: ['intensity', 'response'],
  },
  budget: {
    section: 'reaction', label: 'Follow the Song’s Shape', live: 'budget',
    hint: 'Calm in intros and breakdowns, busy in the groove, everything in the bars after a drop. Off: always as busy as the settings allow.',
    keywords: ['energy', 'calm', 'busy'],
  },
  stages: {
    section: 'reaction', label: 'Build-ups Climb In Stages', live: 'stages',
    hint: 'A build-up adds a notch every quarter of the way: pulses, a look burst, a ring, then sparks and tremors.',
    keywords: ['build', 'riser'],
  },
  sparks: {
    section: 'reaction', label: 'Hi-Hat Sparks', live: 'sparks',
    hint: 'Each hi-hat throws a few sparks up out of the fire.',
    keywords: ['hats', 'embers'],
  },
  temperature: {
    section: 'reaction', label: 'Color Temperature', live: 'temperature',
    hint: 'Strong highs tint the picture a little cooler and heavy lows a little warmer, so the colors lean with the music.',
    keywords: ['warm', 'cool', 'tint'],
  },
  breathe: {
    section: 'reaction', label: 'Sub-Bass Breathing', live: 'breathe',
    hint: 'The fire and the view swell slowly with the low end.',
    keywords: ['bass', 'swell'],
  },

  // --- Show › Weapons
  autoDrops: {
    section: 'weapons', label: 'Forge & Strike On Drops', live: 'autoDrops', simple: true,
    hint: 'When the bass drops out, a new weapon is forged over the fire and held; when the drop hits, it slams in.',
    keywords: ['breakdown', 'forge', 'strike', 'weapon swap'],
  },
  phraseBars: {
    section: 'weapons', label: 'New Weapon Every', live: 'phraseBars', simple: true,
    hint: 'Swaps the weapon, colors and element on a phrase, landing on its first beat. Random picks one of these intervals each time.',
    keywords: ['swap', 'phrase', 'sword'],
  },
  elements: {
    section: 'weapons', label: 'Elements', live: 'elements', simple: true,
    hint: 'Which elements new weapons may bring: flame, lightning (a tesla ball) or ice (crystals). At least one stays on.',
    keywords: ['fire', 'lightning', 'ice', 'frost'],
  },
  ringBars: {
    section: 'weapons', label: 'Extra Ring Every', live: 'ringBars',
    hint: 'The element’s ring races across the ground on the bar, with no weapon swap.',
    keywords: ['shockwave'],
  },
  echo: {
    section: 'weapons', label: 'Outline Burst', live: 'echo',
    hint: 'An outline of the planted weapon bursts out of it on each bar.',
    keywords: ['echo', 'silhouette'],
  },
  weapon: {
    section: 'weapons', label: 'Weapon', painter: 'place.weapon',
    hint: 'The weapon planted in the fire. Drawn by the Show brings a new one each time a drop forges one, as Bonfire Live does.',
    keywords: ['sword', 'blade'],
  },
  element: {
    section: 'weapons', label: 'Element', painter: 'place.element',
    hint: 'What the fire is made of: flame, a lightning ball or ice. Drawn by the Show draws one on each drop from those Bonfire Live allows.',
    keywords: ['fire', 'lightning', 'ice', 'frost'],
  },

  // --- Show › Living Weapon
  combos: {
    section: 'living', label: 'Comes Out Every', live: 'combos', simple: true,
    hint: 'How often the planted weapon pulls itself out and fights on the beat, then plunges back in (X calls it now).',
    keywords: ['living weapon', 'swing', 'combo', 'blade'],
  },
  comboBars: {
    section: 'living', label: 'Stays Out For', live: 'comboBars',
    hint: 'How many bars the living weapon fights each time it comes out.',
    keywords: ['combo', 'length'],
  },
  moves: {
    section: 'living', label: 'Attacks', live: 'moves',
    hint: 'The moves the living weapon may make: slashes, thrusts and spins. At least one stays on.',
    keywords: ['moves', 'slash', 'thrust', 'spin'],
  },
  rhythm: {
    section: 'living', label: 'Rhythm', live: 'rhythm',
    hint: 'Varied rests now and then and, at slow tempos, hits twice in a beat; Every Beat lands one move on each beat.',
    keywords: ['timing', 'tempo'],
  },
  alive: {
    section: 'living', label: 'Alive Between Attacks', live: 'alive', simple: true,
    hint: 'The weapon twirls and flips between moves, and a held one sways and shudders as the build rises.',
    keywords: ['twirl', 'flourish', 'sway'],
  },

  // --- Drops › The Drop
  blackout: {
    section: 'drop', label: 'Black Beat Before the Drop', live: 'blackout', simple: true,
    hint: 'After a build-up the screen goes black for a split second and the drop lands out of it. Off with the Low Flash preset.',
    keywords: ['blackout', 'silence', 'strobe'],
  },
  flash: {
    section: 'drop', label: 'Negative Flash', live: 'flash', simple: true,
    hint: 'The picture inverts for an instant when the drop hits, at most once every 2 seconds. Off with the Low Flash preset.',
    keywords: ['invert', 'strobe'],
  },
  dropSource: {
    section: 'drop', label: 'Drop Hits', painter: 'drops',
    hint: 'Whether this scene throws the show’s drop hits (Bonfire Live’s settings) or a set of its own.',
    keywords: ['drop effects'],
  },
  dropFx: {
    section: 'drop', label: 'Drop Hits', live: 'dropFx', painter: 'drops.fx',
    hint: 'The extra effects each drop throws: those set to Always every time, plus some drawn from those In the Mix.',
    labels: { painter: 'This Scene’s Hits' },
    hints: { painter: 'The extra effects a drop throws while this scene plays: Always every drop, In the Mix drawn at random.' },
    keywords: ['drop effects', 'impact'],
  },
  dropCount: {
    section: 'drop', label: 'Hits Per Drop', live: 'dropCount', painter: 'drops.count',
    hint: 'How many drop hits land at once. Hits set to Always come on top when there are more of them.',
    keywords: ['count'],
  },

  // --- Drops › Hits
  hitStop: {
    section: 'hits', label: 'Hit-Stop', live: 'hitStop', admin: 'effects.impact.hitStop', simple: true, range: [0, 0.15, 0.01, 's'],
    hint: 'A big hit freezes the picture for a few frames, then catches up so the music’s timing holds.',
    hints: { admin: 'How long a big hit freezes the picture before it catches up (the camera keeps moving). 0 is off.' },
    keywords: ['freeze', 'impact', 'pause'],
  },
  hitFlash: {
    section: 'hits', label: 'Hit Flash', live: 'hitFlash', admin: 'effects.impact.flash', simple: true, range: [0, 1, 0.05],
    hint: 'A big hit lifts the whole frame toward the flame’s core color for a frame or two. Off with the Low Flash preset.',
    hints: { admin: 'How far a big hit lifts the frame toward the flame’s core color, kept to a couple a second. 0 is off.' },
    keywords: ['impact flash', 'strobe'],
  },
  debris: {
    section: 'hits', label: 'Debris', live: 'debris', admin: 'effects.impact.debris', range: [0, 2, 0.05, '×'],
    hint: 'Hits throw bits of the element (embers, sparks, ice chips) that bounce off the scenery.',
    hints: { admin: 'How much of the element a hit throws (glowing coals, ice chips or sparks) to bounce off the ground. 0 is none.' },
    keywords: ['bits', 'chips', 'impact'],
  },
  marks: {
    section: 'hits', label: 'Ground Marks', live: 'marks', admin: 'effects.impact.marks',
    hint: 'Hits scorch, frost or scar the ground where they land, fading away.',
    keywords: ['scorch', 'frost', 'burns'],
  },

  // --- Picture › Place & Atmosphere
  scenery: {
    section: 'place', label: 'Place', live: 'scenery', painter: 'place.scenery', simple: true,
    hint: 'What stands round the fire: the Gothic ruins, a forge, a hillside shrine, a cathedral’s altar or a cult’s circle of stones.',
    hints: { painter: 'Where this scene burns: the Gothic ruins, the forge, the hillside shrine, the cathedral’s altar or the cult’s circle.' },
    keywords: ['scenery', 'scene', 'map', 'location', 'stage', 'fast travel'],
  },
  fog: {
    section: 'place', label: 'Fog', live: 'fog', painter: 'render.fog', simple: true,
    hint: 'The dark closing in: Off keeps the far scenery clear, Light is the site’s, and Thick shows only what’s near the fire.',
    keywords: ['mist', 'haze', 'darkness'],
  },
  exposure: {
    section: 'place', label: 'Exposure', live: 'exposure', painter: 'render.exposure', admin: 'effects.render.exposure', range: [0.5, 2, 0.05, '×'],
    hint: 'How bright the whole picture is, before its colors snap to the palette.',
    keywords: ['brightness', 'gamma'],
  },
  vignette: {
    section: 'place', label: 'Vignette', live: 'vignette', painter: 'render.vignette', admin: 'effects.render.vignette', range: [0, 1.5, 0.05],
    hint: 'How much the corners darken, framing the fire (0 is none).',
    keywords: ['dark edges', 'corners'],
  },
  shadows: {
    section: 'place', label: 'Fire Shadows', live: 'shadows', painter: 'render.shadows',
    hint: 'The scenery and the weapon cast the fire’s shadows. Off is lighter on the graphics card.',
    keywords: ['performance', 'gpu'],
  },

  // --- Picture › Colors
  colors: {
    section: 'colors', label: 'Flame Colors', live: 'colors', painter: 'colors.flame', admin: 'effects.flames', simple: true,
    hint: 'Where each new weapon’s colors come from: the site’s palettes, ones made to go together, fully random ones, or a mix (Shift+P switches).',
    hints: {
      painter: 'The flame’s five colors, embers to core, and the shade firelit stone takes: one of the site’s, one made here, or each set by hand.',
      admin: 'The color sets the bonfire can take; fire, lightning and ice burn in them and the site’s accents follow. Keep at least 3 in rotation.',
    },
    mores: { admin: 'Inspecting a project or clicking the fire draws one at random; hidden ones stay out of the draw (one can still be the starting colors).' },
    keywords: ['palette', 'flame', 'bonfire colors', 'theme'],
  },
  scheme: {
    section: 'colors', label: 'Harmony', live: 'scheme',
    hint: 'How a made flame’s colors relate on the color wheel: a hue shift, neighbors, one hue, opposites, a triad…',
    keywords: ['scheme', 'color wheel', 'complementary', 'analogous', 'triadic', 'monochrome'],
    needs: { live: { key: 'colors', when: (v) => v === 'site' || v === 'wild', reason: 'Only with Harmonious Random flame colors (or a mix)' } },
  },
  sceneColors: {
    section: 'colors', label: 'Place Colors', live: 'sceneColors', painter: 'colors.scenery', admin: 'effects.colors', simple: true,
    hint: 'As a new flame lands, the stone, wood, shadows and background blend to colors made for it. Off keeps the site’s own.',
    hints: {
      painter: 'The stone, wood, shadows and background: the site’s own, or made for this scene (harmonious, vivid, fully random, or from a color).',
      admin: 'The neutral colors every frame is built from, with the current flame. The background also colors the page behind the text.',
    },
    keywords: ['scenery colors', 'recolor', 'background', 'stone', 'wood'],
  },
  flameLight: {
    section: 'colors', label: 'Light Whiteness', painter: 'colors.flame.light', admin: 'effects.flames[].light', range: [0, 1, 0.01],
    hint: 'How white the light the fire casts is: low keeps the flame’s own color on everything it lights.',
    keywords: ['cast light', 'tint'],
  },
  colorChange: {
    section: 'colors', label: 'Color Blend Time', live: 'colorChange', admin: 'effects.render.colorChange', range: [0.2, 4, 0.05, 's'],
    hint: 'How long a new flame’s colors take to blend in when a weapon lands.',
    keywords: ['color change', 'transition', 'fade'],
  },
  palette: {
    section: 'colors', label: 'Palette', live: 'palette', painter: 'render.palette', simple: true,
    hint: 'The colors everything snaps to: the flame’s own, Ashen’s three (black, ember, bone) or Moonlit’s four (black and three blues).',
    hints: { painter: 'The colors everything snaps to: the flame’s own, Ashen’s three, Moonlit’s four, or a few of this scene’s own (picked below).' },
    keywords: ['ashen', 'moonlit', 'quantize'],
  },
  fewColors: {
    section: 'colors', label: 'Few Colors', live: 'fewColors', simple: true,
    hint: 'Now and then the palette drops to a few colors: Ashen, Moonlit, or two to four of the flame’s own, a new few each time.',
    keywords: ['palette', 'limited', '1-bit'],
  },

  // --- Fire (the Painter's shape on top of the music's; the admin's own fire)
  fireLevel: {
    section: 'fire', label: 'Fire Level', painter: 'fire.level', range: [-1, 1, 0.05],
    hint: 'Added to how high the fire burns, on top of what the music does to it.',
    keywords: ['intensity', 'height'],
  },
  fireSize: {
    section: 'fire', label: 'Flame Size', painter: 'fire.size', range: [-1, 1, 0.05],
    hint: 'Added to how wide the flames are, on top of the music’s swell.',
    keywords: ['width'],
  },
  fireHeight: {
    section: 'fire', label: 'Flame Height', painter: 'fire.height', range: [-1, 1, 0.05],
    hint: 'Added to how tall the flames reach, on top of the kicks’ punches.',
    keywords: ['tall'],
  },
  fireTurbulence: {
    section: 'fire', label: 'Turbulence', painter: 'fire.turbulence', range: [-1, 1, 0.05],
    hint: 'Added to how much the flames churn and flicker.',
    keywords: ['swirl', 'churn'],
  },
  fireGlow: {
    section: 'fire', label: 'Firelight', painter: 'fire.glow', admin: 'effects.fire.glow',
    hint: 'How brightly the fire lights everything round it.',
    hints: { painter: 'Added to how brightly the fire lights everything round it, on top of the music.' },
    keywords: ['glow', 'cast light', 'brightness'],
  },
  windX: {
    section: 'fire', label: 'Wind Across', painter: 'fire.windX', range: [-1, 1, 0.05],
    hint: 'A steady wind across the fire: negative blows the flames left, positive right.',
    keywords: ['lean', 'breeze'],
  },
  windZ: {
    section: 'fire', label: 'Wind Toward You', painter: 'fire.windZ', range: [-1, 1, 0.05],
    hint: 'A steady wind toward the camera (positive) or away from it (negative).',
    keywords: ['lean', 'breeze'],
  },
  fireBrightness: {
    section: 'fire', label: 'Brightness', admin: 'effects.fire.brightness', range: [0.05, 1, 0.01],
    hint: 'How bright each flame particle is; higher burns whiter at the core.',
    keywords: ['intensity'],
  },

  // --- Picture › Pixel Art
  pixelSize: {
    section: 'pixels', label: 'Pixel Size', live: 'pixelSize', painter: 'render.pixelSize', admin: 'effects.render.pixelSize', simple: true,
    hint: 'How big each pixel of the picture is: small keeps fine detail, big is chunky and lighter on the graphics card.',
    hints: { admin: 'The site’s pixel size: screen pixels per scene pixel. Bigger is chunkier and lighter on the graphics card.' },
    keywords: ['resolution', 'chunky', 'scale'],
  },
  pixelSizeSmall: {
    section: 'pixels', label: 'Pixel Size On Phones', admin: 'effects.render.pixelSizeSmall',
    hint: 'The site’s pixel size on screens narrower than 700 px, in screen pixels per scene pixel.',
    keywords: ['resolution', 'mobile', 'small screens'],
  },
  pixelShift: {
    section: 'pixels', label: 'Pixel Size Shifts', live: 'pixelShift', simple: true,
    hint: 'The pixel size jumps to another, from half to twice the one set: with a new look, and again when a drop lands.',
    keywords: ['resolution', 'jump'],
  },
  dither: {
    section: 'pixels', label: 'Dither', live: 'dither', painter: 'render.dither', admin: 'effects.render.dither', range: [0, 0.4, 0.02],
    hint: 'How much colors are dithered where they meet: 0 is flat bands, more is a finer checkered blend (the site uses a little).',
    hints: { admin: 'How much the site’s colors are dithered where they meet: 0 is flat bands, more is a finer checkered blend.' },
    keywords: ['checker', 'blend', 'bayer'],
  },
  ditherMatrix: {
    section: 'pixels', label: 'Dither Pattern', live: 'ditherMatrix', painter: 'render.ditherMatrix', admin: 'effects.render.ditherMatrix',
    hint: 'The ordered dither’s grid: 4×4 is the classic pixel-art crosshatch, 8×8 a finer one with more steps.',
    keywords: ['bayer', 'matrix', 'crosshatch'],
    needs: { live: { key: 'dither', when: (v) => !(Number(v) > 0), reason: 'Dither is 0' } },
  },
  outlines: {
    section: 'pixels', label: 'Outlines', live: 'outlines', painter: 'render.outlines', admin: 'effects.render.outlines', simple: true,
    hint: 'Dark outlines round everything solid and bright creases between facets, like hand-drawn pixel art.',
    keywords: ['ink', 'lines', 'edges'],
  },
  flameFps: {
    section: 'pixels', label: 'Flame Frame Rate', live: 'flameFps', painter: 'render.flameFps', admin: 'effects.fire.fps', range: [6, 60, 1, 'fps'],
    hint: 'How many times a second the flames move on: few is choppy, hand-drawn animation; 60 is smooth.',
    keywords: ['fps', 'animation', 'choppy', 'smooth'],
  },

  // --- Picture › Performance
  frameRate: {
    section: 'performance', label: 'Frame Rate', live: 'frameRate', simple: true,
    hint: 'How often the picture is drawn: Display matches your screen; 60 or 30 fps eases the load on a busy computer.',
    keywords: ['fps', 'lag', 'cap', 'refresh', 'vsync'],
  },
  particles: {
    section: 'performance', label: 'Particles', live: 'particles',
    hint: 'How many particles each effect uses: more looks richer but needs a stronger graphics card. Changing it restarts the scene.',
    keywords: ['gpu', 'lag', 'sparks'],
  },

  // --- Effects › Strength & Pace
  glitch: {
    section: 'strength', label: 'Effects Strength', live: 'glitch', painter: 'look.amount', simple: true, range: [0, 2, 0.05, '×'],
    hint: 'How strong every picture effect is, the looks and the layers alike. 0 is a clean picture.',
    labels: { painter: 'Strength' },
    hints: { painter: 'How strong the look is, even when the music is quiet; the beat still pulses and bursts it on top.' },
    keywords: ['intensity', 'amount', 'glitch'],
  },
  lookBars: {
    section: 'strength', label: 'New Look Every', live: 'lookBars',
    hint: 'How often the look changes and the mix is rolled again (always after a drop too).',
    keywords: ['pace', 'change'],
  },

  // --- Effects › Looks
  looks: {
    section: 'looks', label: 'Looks', live: 'looks', painter: 'look.name', simple: true,
    hint: 'The picture’s styles. In the Mix they take turns, a new one every few bars and after each drop; Always stays on under whichever is playing.',
    labels: { painter: 'Look' },
    hints: { painter: 'The picture’s style for this scene. Hover a look to see it on the stage, click to paint with it.' },
    keywords: ['style', 'effects', 'visuals'],
  },
  lookDetails: {
    section: 'looks', label: 'Look Details', painter: 'look.params',
    hint: 'What this look rolls each time it comes round: pin a detail to keep it as painted, or leave it to the dice.',
    keywords: ['params', 'pin', 'dice'],
  },

  // --- Effects › Layers
  layers: {
    section: 'layers', label: 'Layers', live: 'layers', painter: 'layers',
    hint: 'Effects laid over whatever look is playing. In the Mix, at most two of the heavier ones come in at once.',
    hints: { painter: 'Effects laid over the look. In the Mix a layer is rolled in or out each time the look comes round.' },
    keywords: ['overlays', 'filters'],
  },
  layerDetails: {
    section: 'layers', label: 'Layer Details', painter: 'details',
    hint: 'What each layer rolls each time the look comes round: pin a detail to keep it as painted, or leave it to the dice.',
    keywords: ['params', 'pin', 'dice'],
  },
  blends: {
    section: 'layers', label: 'How Each Layer Blends', painter: 'blends',
    hint: 'With Blend Modes on: how each layer lies over the picture. Rolled Each Turn picks a new way each time the look comes round.',
    keywords: ['blend modes', 'screen', 'overlay', 'difference'],
  },
  mirrors: {
    section: 'layers', label: 'Mirror Kinds', live: 'mirrors',
    hint: 'Which ways the mirror may fold: left–right, top–bottom or into quarters. The drop’s Mirror Flips use them too.',
    keywords: ['symmetry', 'flip'],
  },

  // --- Effects › X-Ray
  xray: {
    section: 'xray', label: 'X-Ray Flips', live: 'xray', simple: true,
    hint: 'Now and then, on the beat, the picture flips to one of the passes it’s built from for a beat, two or a bar.',
    more: 'The passes: the normals (which way each surface faces), the lighting alone, the fire’s particles alone, or the flow field through the flames.\n'
      + 'Never on a drop’s own bar. In the Mix: some looks. Always: every look, still only now and then.\n'
      + 'The drop’s own X-Ray hit has its switch in Drop Hits; both are off with the Low Flash preset.',
    keywords: ['passes', 'normals', 'debug'],
  },
  xrayViews: {
    section: 'xray', label: 'X-Ray Views', live: 'xrayViews',
    hint: 'Which passes the X-Ray flips and the X-Ray drop hit may show. At least one stays on.',
    keywords: ['passes', 'normals', 'lighting', 'flow'],
    needs: {
      live: { key: 'xray', when: (v, all) => isOff(v) && isOff(all.dropFx?.xray ?? 'mix'), reason: 'X-Ray Flips and the X-Ray drop hit are Off' },
    },
  },
  xrayView: {
    section: 'xray', label: 'X-Ray View', painter: 'render.xray',
    hint: 'Holds the picture in one of the passes it’s built from for the whole scene. Off shows the finished picture.',
    keywords: ['passes', 'normals', 'debug'],
  },

  // --- Camera › Camera
  camera: {
    section: 'camera', label: 'Movement', live: 'camera', painter: 'camera.move.kind', simple: true,
    hint: 'Still holds one framing, Slow Drift moves gently, and Drift & Cut also cuts between shots on the music.',
    hints: { painter: 'How the framing moves while the scene holds, in time with the music: a sway, a sweep, a push in and out, a crane or a vertigo zoom.' },
    keywords: ['camera mode', 'motion', 'drift', 'cuts', 'move'],
  },
  shot: {
    section: 'camera', label: 'Starting Shot', live: 'shot', painter: 'camera',
    hint: 'The shot it starts on, and stays on with a Still camera.',
    labels: { painter: 'Start From a Shot' },
    hints: { painter: 'Bonfire Live’s own framings. Hover one to see it, click to start from it, then drag the stage to make it yours.' },
    keywords: ['framing', 'angle', 'view'],
  },
  punch: {
    section: 'camera', label: 'Zoom Punch & Shake', live: 'punch', simple: true,
    hint: 'The view punches in a little on each kick and shakes on drops and impacts.',
    keywords: ['shake', 'zoom', 'kick'],
  },
  shake: {
    section: 'camera', label: 'Screen Shake', admin: 'effects.render.shake',
    hint: 'The site’s camera shakes on impacts (never for visitors who ask their system for reduced motion).',
    keywords: ['impact', 'camera'],
  },
  lens: {
    section: 'camera', label: 'Lens', painter: 'camera.fov', range: [14, 80, 1, '°'],
    hint: 'Narrow is a long lens, flat and close; wide takes in everything, stretched at the edges.',
    keywords: ['fov', 'field of view', 'zoom'],
  },
  tilt: {
    section: 'camera', label: 'Tilt', painter: 'camera.roll', range: [-0.6, 0.6, 0.01],
    hint: 'Tilts the horizon for a Dutch angle, one way or the other.',
    keywords: ['roll', 'dutch angle', 'horizon'],
  },
  moveAmount: {
    section: 'camera', label: 'Movement Size', painter: 'camera.move.amount', range: [0, 1, 0.05],
    hint: 'How big the move is. It’s kept inside the clearing: near the edge it only swings the other way.',
    keywords: ['amount', 'distance'],
  },
  moveBars: {
    section: 'camera', label: 'Cycle Length', painter: 'camera.move.bars',
    hint: 'How many bars one cycle of the move takes; it comes back to your framing at the end of each.',
    keywords: ['bars', 'loop', 'period'],
  },

  // --- Camera › Cuts
  cutBars: {
    section: 'cuts', label: 'Cut Every', live: 'cutBars',
    hint: 'How often the camera cuts to another shot (every bar right after a drop).',
    keywords: ['shots', 'edit'],
    // (A cut by hand, C, also takes it as how long the new shot's push runs: too small a
    // thing to keep the setting live for while the camera doesn't cut on its own.)
    needs: { live: { key: 'camera', when: (v) => v !== 'cuts', reason: 'Movement doesn’t cut between shots' } },
  },
  transition: {
    section: 'cuts', label: 'Between Shots', live: 'transition',
    hint: 'How it gets to the next shot: a straight cut, a fast whip pan or a slow glide.',
    keywords: ['transition', 'whip', 'glide'],
  },
  knightCam: {
    section: 'cuts', label: 'Knight Shots', live: 'knightCam', simple: true,
    hint: 'While the knights dance, some shots go to them: low among the dancers, circling the fire, or following one.',
    keywords: ['dancers', 'camera'],
    needs: { live: { key: 'camera', when: (v) => v === 'still', reason: 'The camera is Still' } },
  },

  // --- Camera › Weapon Shots
  swingCam: {
    section: 'weaponShots', label: 'While It Fights', live: 'swingCam',
    hint: 'How the camera covers the living weapon: close angles, following it, riding on it, tracking or orbiting.',
    keywords: ['living weapon', 'combo', 'blade'],
  },
  swingEase: {
    section: 'weaponShots', label: 'Camera Feel', live: 'swingEase',
    hint: 'How the camera moves while it covers the weapon: an even lag, a spring, a hand-held bounce, a heavy crane or a snap.',
    // (The feels' own hints, cameraEase.js SWING_EASES: the test keeps these lines the same.)
    more: 'Smooth: Glides after the weapon with an even lag.\n'
      + 'Spring: Builds speed and lands softly, with no overshoot.\n'
      + 'Bouncy: Swings past the weapon a little and settles back, like a hand-held camera.\n'
      + 'Heavy: A slow, weighty crane that trails well behind.\n'
      + 'Snappy: Jumps onto the weapon and eases into place.',
    keywords: ['easing', 'spring', 'smooth'],
  },
  holdCam: {
    section: 'weaponShots', label: 'While It’s Held', live: 'holdCam',
    hint: 'How the camera frames a weapon held over the fire, waiting for the drop.',
    keywords: ['breakdown', 'blade'],
  },

  // --- Cast › Knights
  knights: {
    section: 'knights', label: 'Knights', live: 'knights', simple: true,
    hint: 'They rest by the fire and get up to dance at the right moments (Shift+K sends them off or brings them back).',
    more: 'In the Mix they come and go, but only where the change is hidden: as the music starts, in a big drop’s flash, or when the scene changes, never mid-phrase.\n'
      + 'Always: they stay. Shift+K acts on the next drop if one is coming.',
    keywords: ['knight', 'cast', 'characters'],
  },
  knightCount: {
    section: 'knights', label: 'How Many', live: 'knightCount', painter: 'knights.count', simple: true, range: [0, 4, 1],
    hint: 'The number of knights who come to the fire; Random rolls one to four each time they come in. Touch screens show two at most.',
    labels: { painter: 'Knights' },
    hints: { painter: 'How many knights are by the fire in this scene (0: the fire burns alone). Touch screens show two at most.' },
    more: 'The first takes the seat; the others sit on the ground round it. How many get up to dance follows the song: all of them after a drop, fewer as it calms.',
    keywords: ['count', 'number'],
  },
  knightSeat: {
    section: 'knights', label: 'Seat Pose', live: 'knightSeat', painter: 'knights.seat', admin: 'effects.knight.seat', simple: true,
    hint: 'How they sit: Resting, slumped over their knees and dozing now and then, or Watchful, leaning in with heads up at the fire.',
    hints: { admin: 'Resting: slumped by the fire, like a rest at a bonfire. Watchful: leaning in over his knees, head up at the fire.' },
    keywords: ['sit', 'resting', 'watchful'],
  },
  knightHelmets: {
    section: 'knights', label: 'Helmets', live: 'knightHelmets', painter: 'knights.helmets', admin: 'effects.knight.helmet',
    hint: 'The helmets they may wear: the great helm, the armet or the pointed bascinet. Each knight draws one as he arrives.',
    labels: { admin: 'Helmet' },
    hints: {
      painter: 'Each knight’s helmet: Drawn at Random (a new one each time the scene comes round), or one of the three.',
      admin: 'The great helm, the armet or the pointed bascinet; Random Each Summon puts a new one on him each time he comes.',
    },
    mores: { admin: 'A helmet the visitor picks in the pack wins over this (it’s kept in their browser).' },
    keywords: ['helm', 'armet', 'bascinet'],
  },

  // --- Cast › Armor
  knightStyle: {
    section: 'armor', label: 'Style', live: 'knightStyle', painter: 'knights.style', admin: 'effects.knight.style', simple: true,
    hint: 'How the knights are drawn, one style for them all: The Site’s Own is the portfolio’s; In the Mix rolls one at the hidden moments.',
    hints: {
      painter: 'How the knights are drawn: Bonfire Live’s Own leaves it to its settings; In the Mix rolls one each time the scene comes round.',
      admin: 'How he’s drawn on the site; a change burns him away and forms him again in it.',
    },
    // (One line per style, knightStyles.js: the test checks every style has its line.)
    more: 'Pixel Cel: a hand-drawn sprite in flat bands and ink lines, grey steel wearing the fire’s color where it lights him.\n'
      + 'Pixel Painterly: the sprite with a painter’s touch: warm shadows, softer lines, lit plate lips.\n'
      + 'Pixel Chiaroscuro: hard firelight: near-black backs, the flame’s color only where it strikes.\n'
      + 'Smooth Steel: natural light on gunmetal steel, plate wear and a thin fire rim.\n'
      + 'Black & Gold: blackened plate and dark gilt trim that catches the fire.\n'
      + 'First Build: the boxy original, its trim glowing in the flame’s colors.',
    keywords: ['look', 'sprite', 'cel', 'painterly', 'chiaroscuro'],
  },
  knightFinish: {
    section: 'armor', label: 'Finish', live: 'knightFinish', painter: 'knights.finish', admin: 'effects.knight.finish', simple: true,
    hint: 'The color of their steel, one for the whole cast; In the Mix leans to Gunmetal. Black & Gold and First Build wear their own.',
    hints: { admin: 'The color of his steel in the styles that draw steel (Black & Gold and First Build wear their own).' },
    more: 'Gunmetal: a cool mid grey, his own.\n'
      + 'Blackened: darker, mostly its reflections.\n'
      + 'Polished Steel: bright, with a mirror sheen.\n'
      + 'Burnished: warm browned steel, rubbed smooth.',
    keywords: ['steel', 'metal', 'armor color'],
  },
  knightGlow: {
    section: 'armor', label: 'Edge Glow', live: 'knightGlow', painter: 'knights.glow', simple: true,
    hint: 'The edges of their armor catch the fire’s color, brightest on the side facing it.',
    more: 'In the Mix: rolled at the hidden moments (the music starting, a big drop’s flash, a new scene); some stretches glow at a strength rolled round Edge Glow Strength, some don’t.\n'
      + 'Always: at Edge Glow Strength the whole time.\n'
      + 'A preset scene’s knights glow as it was painted: its own switch and strength.',
    mores: {
      painter: 'In the Mix: rolled as the scene arrives and in each big drop’s flash; some stretches glow at a strength rolled round Edge Glow Strength, some don’t.\n'
        + 'Always: at Edge Glow Strength the whole time.',
    },
    keywords: ['rim', 'glow', 'edges'],
  },
  knightRim: {
    section: 'armor', label: 'Edge Glow Strength', live: 'knightRim', painter: 'knights.rim', admin: 'effects.knight.rim', simple: true, range: [0, 1, 0.05],
    hint: 'How strongly the edges glow: 0 is none, 1 a bright rim on every edge that faces the fire.',
    hints: { admin: 'How strongly his edges catch the fire’s color: a thin line in the flame’s colors, brightest on the side facing it. 0 is none.' },
    keywords: ['rim', 'glow', 'edges'],
    needs: { live: { key: 'knightGlow', when: (v) => isOff(v), reason: 'Edge Glow is Off' } },
  },
  knightShine: {
    section: 'armor', label: 'Armor Shine', live: 'knightShine', painter: 'knights.shine', admin: 'effects.knight.shine',
    hint: 'The fire’s reflection sweeps over their plate: gently now and then at rest, brightly when the fire flares. Off with Low Flash.',
    hints: {
      painter: 'The fire’s reflection sweeps over their plate: gently now and then at rest, brightly when the fire flares.',
      admin: 'The fire’s reflection sweeps over his plate: gently every few seconds at rest, brightly when the fire flares. Off keeps it steady.',
    },
    more: 'A gentle band sweeps over the plate now and then as they rest, and a bright one whenever the fire flares (a weapon landing, a ring racing out).\n'
      + 'In the Mix the two come and go apart, rolled where it’s hidden: as the music starts, in a big drop’s flash, when the scene changes.',
    // (scenePlayer.js: Live's own Armor Shine set Off, or reduced motion, keeps a scene's off.)
    mores: {
      painter: 'A gentle band sweeps over the plate now and then as they rest, and a bright one whenever the fire flares (a weapon landing, a ring racing out).\n'
        + 'In the Mix the two come and go apart, rolled as the scene arrives and in each big drop’s flash.\n'
        + 'Bonfire Live keeps it off while its own Armor Shine is Off, or for a viewer who asks for reduced motion.',
      admin: 'The bright band comes whenever the fire flares: a stoke, a weapon landing, a ring, the cursor on the fire.\n'
        + 'Never for visitors who ask their system for reduced motion.',
    },
    keywords: ['reflection', 'sheen', 'sweep'],
  },

  // --- Cast › Dancing
  knightDance: {
    section: 'dancing', label: 'Dance', live: 'knightDance', painter: 'knights.dance', simple: true,
    hint: 'In the Mix they get up as a build peaks, dance while the energy holds and sit on a phrase; Always whenever the groove locks (K).',
    hints: { painter: 'Whether they get up and dance with the music: In the Mix at the right moments, Always whenever the groove is locked.' },
    keywords: ['dancers', 'groove'],
  },
  knightFormation: {
    section: 'dancing', label: 'Formation', live: 'knightFormation', painter: 'knights.formation',
    hint: 'Round the Fire steps along its clear sides, Line faces the camera, Solo gives each his own move, Canon a step apart.',
    keywords: ['ring', 'line', 'solo', 'canon'],
  },
  knightMoves: {
    section: 'dancing', label: 'Dance Moves', live: 'knightMoves', painter: 'knights.moves',
    hint: 'The moves they may dance. The first two bars after a drop take the big ones (jumps, spins, Praise the Sun), then the groove’s.',
    hints: { painter: 'The dance moves they may do in this scene; The Show’s Moves leaves it to Bonfire Live’s own.' },
    keywords: ['moves', 'praise the sun', 'jumping jacks'],
  },
  danceBars: {
    section: 'dancing', label: 'New Dance Move Every', live: 'danceBars',
    hint: 'How often the dancers change moves (after a drop, always two bars of big moves first).',
    keywords: ['moves', 'change'],
  },
  knightSummon: {
    section: 'dancing', label: 'Summon On the Drop', live: 'knightSummon',
    hint: 'On a big drop the dancers are up and in place in its flash, already leaping. Off: they spring up and hurry over a few beats late.',
    keywords: ['arrive', 'appear'],
  },

  // --- Cast › Behavior
  knightReactions: {
    section: 'behavior', label: 'Reactions', live: 'knightReactions', painter: 'knights.reactions', admin: 'effects.knight.reactions',
    hint: 'They flinch when a weapon lands, lean from a flare, lift their feet as a ring passes and watch the living weapon.',
    hints: { admin: 'He sits up to watch a new weapon rise, flinches when it lands, leans away from a stoke and lifts his feet as a ring passes.' },
    more: 'In the Mix they react for some stretches and not others, rolled where it’s hidden (the music starting, a big drop’s flash, a new scene).\n'
      + 'Off with the Chill preset.',
    mores: { painter: 'In the Mix they react for some stretches and not others, rolled as the scene arrives and in each big drop’s flash.', admin: null },
    keywords: ['flinch', 'react'],
  },
  knightGestures: {
    section: 'behavior', label: 'Gestures On Drops', live: 'knightGestures', admin: 'effects.knight.gestures',
    hint: 'Praise the Sun, a hurrah, a jump for joy or a point on a big drop, all together or a beat apart; a cheer on a small one.',
    labels: { admin: 'Gestures On Click' },
    hints: { admin: 'While he rests, a click on him gets a gesture back (Praise the Sun most often). Never with reduced motion.' },
    mores: {
      admin: 'Hovered, he looks up at you and his rim warms to say so.\n'
        + 'Off: he isn’t a click target (a click on him stokes the fire like anywhere else); the pack’s gestures still work.',
    },
    keywords: ['praise the sun', 'wave', 'cheer'],
  },

  // --- Cast › Fireflies
  blink: {
    section: 'fireflies', label: 'Blink & Dance On the Beat', live: 'blink', simple: true,
    hint: 'The fireflies flash in patterns and dance to the beat. Off: they just roam.',
    keywords: ['fireflies', 'light show'],
  },
  flyMoves: {
    section: 'fireflies', label: 'Firefly Dances', live: 'flyMoves', painter: 'fireflies.moves',
    hint: 'The dances they may do on the beat: swinging, bouncing, darting, round the compass and more. At least one stays on.',
    hints: { painter: 'The dances they may do on the beat in this scene; The Show’s Moves leaves it to Bonfire Live’s own.' },
    keywords: ['moves', 'bugs'],
    // (A preset scene with a light show of its own brings the dances back.)
    needs: { live: { key: 'blink', when: (v, all) => !v && isOff(all.scenes), reason: 'Blink & Dance and Preset Scenes are Off' } },
  },
  flyBars: {
    section: 'fireflies', label: 'New Firefly Dance Every', live: 'flyBars',
    hint: 'How often the fireflies switch to another dance.',
    keywords: ['moves', 'change'],
    needs: { live: { key: 'blink', when: (v, all) => !v && isOff(all.scenes), reason: 'Blink & Dance and Preset Scenes are Off' } },
  },
  trails: {
    section: 'fireflies', label: 'Light Trails', live: 'trails',
    hint: 'The fireflies leave short trails of light as they dart. Changing it restarts the scene.',
    keywords: ['streaks', 'trail'],
  },
  flyLit: {
    section: 'fireflies', label: 'Fireflies Lit', painter: 'fireflies.lit',
    hint: 'How many fireflies are glowing round the fire in this scene.',
    keywords: ['count', 'glowing'],
  },
  flyShow: {
    section: 'fireflies', label: 'Light Show', painter: 'fireflies.show',
    hint: 'Their light show: blinking patterns, one kind each, chasing round, twinkling, breathing, strobing, or a mix that changes.',
    keywords: ['blink', 'pattern', 'strobe'],
  },
  flySpeed: {
    section: 'fireflies', label: 'Speed', painter: 'fireflies.speed', range: [0.3, 2, 0.05, '×'],
    hint: 'How fast they fly, on top of what the music does.',
    keywords: ['flight'],
  },

  // --- Scenes & Cards › Preset Scenes
  scenes: {
    section: 'presetScenes', label: 'Preset Scenes', live: 'scenes', simple: true,
    hint: 'Scenes made in the Painter take over the place, colors, look and cast for a stretch. N plays the next; Shift+N switches this.',
    more: 'A scene sets a place, a flame and its colors, a framing, a look and its layers, the render, the knights and the fireflies, all together.\n'
      + 'They change inside a flash: on a drop, or on a phrase line as a new weapon lands.\n'
      + 'In the Mix they come and go, with stretches of the free show between them. Always: one after another.',
    keywords: ['scene', 'painter', 'loop'],
  },
  sceneBars: {
    section: 'presetScenes', label: 'Change Every', live: 'sceneBars', simple: true,
    hint: 'How often the next scene comes, on a phrase line as a new weapon lands; Only On Drops waits for each big drop’s flash.',
    keywords: ['interval', 'next scene'],
    needs: { live: { key: 'scenes', when: (v) => isOff(v), reason: 'Preset Scenes is Off' } },
  },
  sceneHold: {
    section: 'presetScenes', label: 'With the Music', live: 'sceneHold', painter: 'music', simple: true,
    hint: 'Whether a scene holds everything it sets for its stretch, or only opens the stretch before the show takes over.',
    hints: { painter: 'Hold keeps everything painted here for the scene’s stretch; Start From opens the stretch with it, then the show plays on.' },
    more: 'Hold the Scene: everything it sets stays for its stretch; the music only pulses it, and drops re-forge its own weapon in its colors.\n'
      + 'Start From the Scene: it opens the stretch with its place, colors, framing and look, then the show takes over (its render, knights and fireflies stay).\n'
      + 'Each Scene’s Own: as it was saved in the Painter.',
    mores: {
      painter: 'Hold the Scene: everything it sets stays for its stretch; the music only pulses it, and drops re-forge its own weapon in its colors.\n'
        + 'Start From the Scene: it opens the stretch with its place, colors, framing and look, then the show takes over (its render, knights and fireflies stay).\n'
        + 'Bonfire Live plays it this way unless its own With the Music holds or starts from every scene.',
    },
    keywords: ['hold', 'start from'],
  },
  sceneCards: {
    section: 'presetScenes', label: 'Scene Name Cards', live: 'sceneCards', simple: true,
    hint: 'A title card with the scene’s name as it arrives, like the main one but smaller (the controls always show the name).',
    keywords: ['title', 'name'],
  },

  // --- Scenes & Cards › The Loop
  sceneOrder: {
    section: 'loop', label: 'Order', live: 'sceneOrder',
    hint: 'In Turn follows the loop’s order below; Shuffled plays every scene once before any comes again, never one twice running.',
    keywords: ['shuffle', 'random'],
  },
  sceneFrom: {
    section: 'loop', label: 'Scenes From', live: 'sceneFrom',
    hint: 'Which scenes it loops through: the site’s built-in ones, the ones you made in the Painter (kept in this browser), or both.',
    keywords: ['built-in', 'mine', 'library'],
  },

  // --- Scenes & Cards › Title Cards
  title: {
    section: 'titles', label: 'Title', live: 'title', simple: true,
    hint: 'The main card’s big line: your DJ name or the set’s title. Left empty, the main card never shows.',
    keywords: ['dj', 'name', 'logo'],
  },
  subtitle: {
    section: 'titles', label: 'Subtitle', live: 'subtitle', simple: true,
    hint: 'A smaller line under the title: the venue, the date, anything. Optional.',
    keywords: ['venue', 'date'],
  },
  intro: {
    section: 'titles', label: 'Show As the Intro', live: 'intro', simple: true,
    hint: 'The main card fills the screen as the set begins.',
    keywords: ['start', 'opening'],
  },
  titleOnDrop: {
    section: 'titles', label: 'Show On Drops', live: 'titleOnDrop', simple: true,
    hint: 'The main card comes back with each big drop, taking turns with the cards below that show on drops.',
    keywords: ['title card', 'drop'],
  },
};

/**
 * One hint per item of the grids: the looks, the layers, the drop hits and the x-ray views
 * (looks.js LOOKS, LAYERS, DROP_FX; render.js XRAY_VIEWS), the same in Live and the Painter.
 */
export const ITEM_HINTS = {
  looks: {
    ember: 'Just the fire, clean: no effect of its own, while the zoom punch and shake still land. In the Mix it takes its turn like the rest.',
    glitch: 'Torn rows, an RGB split on the kick, crunchy pixels and static, tearing more and more through a build-up.',
    echo: 'The last frame echoes out of the fire like a tunnel; downbeats step the flame’s colors round, unless Color Cycle (Drop Hits) is Off.',
    ripple: 'A shockwave ring pushes out of the fire on every kick, three at once on a big hit.',
    kaleido: 'A kaleidoscope folded round the fire, spinning with the kicks over a light echo; big hits change its segments.',
    ink: 'Downbeats flash the picture to 1-bit, dithered to black and the flame’s core, over scanlines. Off with the Low Flash preset.',
    vortex: 'Echoes turning as they stream out of the fire: a spiral, flung faster on the kicks and big hits.',
    mosaic: 'The kicks crunch the picture into big pixels that settle back.',
    haze: 'The rows shimmer sideways like heat over the fire, swelling with the music.',
    prism: 'The red and blue split apart, kicked wider on every beat and every big hit.',
  },
  layers: {
    scanlines: 'CRT-style lines over the picture: thin rows, thick rows or columns, as dark, light or contrast lines.',
    mirror: 'The picture folded onto itself, a half or a quarter copied over the rest, from the Mirror Kinds (M switches it).',
    blend: 'The layers blend in new ways each look: echoes in screen or difference, ink in overlay… Off keeps each one’s classic way.',
    ghost: 'Everything that moves leaves a fading trail.',
    blur: 'The camera’s moves smear the picture: whips, shakes and zoom punches.',
    glow: 'Light spills from the bright parts, swelling on the kicks.',
    gradient: 'The picture recolored by brightness through three palette colors: the fire’s, the stone’s, or any three.',
    paint: 'The picture repainted in brush strokes, their size and direction new each time.',
    wash: 'The picture washed into flat watercolor patches, pigment pooling at the edges.',
    flicker: 'The light dips on the beat, a dark band rolls down, film jitters, or it wavers like a candle; kept faint. Off with Low Flash.',
    grain: 'Film grain over the picture, its amount new each time; sometimes it swells on the kicks.',
    cinema: 'Black bars slide in top and bottom for a widescreen frame, their height new each time.',
    spotlight: 'A dithered circle of light round the fire with the rest dark, breathing wider with the music and the kicks.',
    chroma: 'The red and blue drift a pixel or two apart, like a cheap lens, kicked wider on the beat.',
  },
  dropFx: {
    shatter: 'The picture tears into rows thrown sideways and chunky blocks for half a second, the Glitch look’s biggest hit.',
    shock: 'Four shockwave rings race out of the fire one after another, their fronts glowing in the flame’s core color.',
    burst: 'A burst of echoes streams out of the fire for about a second, the Echo look in one hit.',
    spiral: 'Echoes stream out of the fire turning as they go, a spinning spiral for about a second.',
    kaleido: 'For about a second and a half the picture folds into a kaleidoscope round the fire.',
    flips: 'For two seconds the picture mirrors itself, a new fold on every beat, from the Mirror Kinds.',
    cycle: 'The flame’s colors spin round its palette for a moment. Off stops every palette cycle, the Echo look’s steps too, scenes included.',
    split: 'The red and blue split far apart for an instant, then snap back together.',
    crunch: 'The picture crunches into big blocky pixels for half a second, then settles back.',
    iris: 'The picture opens out of a pinhole round the fire, a black iris snapping wide.',
    slam: 'Black bars slam shut from top and bottom, then spring back open.',
    ink: 'The picture flashes to 1-bit for an instant, dithered to black and the flame’s core. Off with the Low Flash preset.',
    xray: 'The drop lands in one of the X-Ray Views for a beat: the picture as one of the passes it’s built from. Off with Low Flash.',
  },
  xrayViews: {
    normals: 'Which way each surface faces, as color, the far side fading with depth.',
    lighting: 'The lighting alone: the scenery as the fire lights it, without the flames and particles.',
    particles: 'The fire’s particles alone: flames, sparks and embers glowing on black.',
    flow: 'The flow field made visible: short strokes through the fire showing where its flames are carried.',
  },
};

/**
 * Words people search for, and the words the settings use for them (all lowercase): a
 * query's word also finds these.
 * @type {Record<string, string[]>}
 */
export const SYNONYMS = {
  brightness: ['exposure', 'firelight'],
  bright: ['exposure'],
  gamma: ['exposure'],
  dark: ['vignette', 'fog'],
  darkness: ['vignette', 'fog'],
  strobe: ['flash', 'flicker'],
  strobing: ['flash', 'flicker'],
  flashing: ['flash', 'flicker'],
  epilepsy: ['low flash', 'flash', 'flicker'],
  photosensitive: ['low flash', 'flash', 'flicker'],
  seizure: ['low flash', 'flash', 'flicker'],
  fps: ['frame rate'],
  framerate: ['frame rate'],
  lag: ['frame rate', 'particles', 'pixel size', 'shadows'],
  stutter: ['frame rate', 'particles'],
  performance: ['frame rate', 'particles', 'shadows'],
  gpu: ['particles', 'shadows', 'pixel size'],
  bpm: ['beat', 'tempo'],
  tempo: ['beat'],
  sync: ['beat', 'visual lead', 'link'],
  latency: ['visual lead'],
  delay: ['visual lead'],
  ableton: ['link'],
  colour: ['color'],
  colours: ['colors'],
  armour: ['armor'],
  behaviour: ['behavior'],
  resolution: ['pixel size'],
  pixels: ['pixel size'],
  shake: ['zoom punch', 'shake'],
  blur: ['motion blur'],
  glitch: ['effects strength', 'glitch'],
  intensity: ['effects strength', 'reactivity'],
  bloom: ['glow'],
  crt: ['scanlines'],
  vhs: ['scanlines', 'grain', 'chroma split'],
  noise: ['grain'],
  film: ['grain', 'flicker', 'cinema bars'],
  letterbox: ['cinema bars', 'letterbox slam'],
  widescreen: ['cinema bars'],
  kaleidoscope: ['kaleido'],
  tunnel: ['echo'],
  feedback: ['echo'],
  invert: ['negative flash'],
  scenery: ['place'],
  map: ['place'],
  location: ['place'],
  background: ['place colors', 'place'],
  theme: ['flame colors', 'palette'],
  mist: ['fog'],
  fov: ['lens'],
  zoom: ['zoom punch', 'lens'],
  angle: ['shot', 'tilt'],
  roll: ['tilt'],
  sword: ['weapon'],
  blade: ['weapon', 'living weapon'],
  swing: ['living weapon', 'attacks'],
  combo: ['living weapon', 'attacks'],
  knight: ['knights'],
  dancers: ['dance'],
  helm: ['helmets'],
  rim: ['edge glow'],
  reflection: ['armor shine'],
  bugs: ['fireflies'],
  mic: ['source'],
  microphone: ['source'],
  audio: ['sound', 'source'],
  controller: ['midi'],
  dj: ['title'],
  logo: ['title'],
  random: ['mix'],
  shuffle: ['order'],
  outline: ['outlines', 'outline burst'],
  trail: ['ghosting', 'light trails'],
  checker: ['dither'],
  bayer: ['dither pattern'],
};

// --- lookups ---------------------------------------------------------------------------
const APPS = /** @type {const} */ (['live', 'painter', 'admin']);
// Bindings that stand for a group: a key or path under one (looks.echo, knights.helmets.1,
// details.glowSize) belongs to its group's entry. (Live's layers are 14 keys of their own,
// the 'layers' entry: ITEM_HINTS.layers names them.)
const GROUPS = {
  live: ['looks', 'dropFx', 'mirrors', 'elements', 'moves', 'knightMoves', 'flyMoves', 'xrayViews', 'knightHelmets'],
  painter: ['colors.flame', 'colors.scenery', 'look.params', 'layers', 'details', 'blends', 'drops.fx', 'knights.helmets', 'knights.moves', 'fireflies.moves'],
  admin: [],
};
/** Per app, binding → entry id. */
const INDEX = Object.fromEntries(APPS.map((app) => [app, new Map(Object.entries(SETTINGS).filter(([, e]) => e[app] !== undefined).map(([id, e]) => [e[app], id]))]));

/**
 * The entry a setting key (`live`), scene path (`painter`) or content path (`admin`)
 * belongs to: its own, its group's (looks.echo → looks; a layer key → layers; a list
 * entry's effects.flames[2].light → effects.flames[].light), or null.
 * @param {'live'|'painter'|'admin'} app
 * @param {string} binding
 * @returns {string | null}
 */
export function conceptOf(app, binding) {
  const by = INDEX[app];
  if (!by || typeof binding !== 'string') return null;
  const b = app === 'admin' ? binding.replace(/\[\d+\]/g, '[]') : binding;
  if (by.has(b)) return by.get(b);
  if (app === 'live' && Object.hasOwn(ITEM_HINTS.layers, b)) return by.get('layers') ?? null;
  const group = GROUPS[app].find((g) => b.startsWith(`${g}.`));
  return group ? by.get(group) ?? null : null;
}

/**
 * What an app shows for a setting: its label and hint (the app's own where the control
 * means something else there), the longer text (its own there too, '' for none), whether
 * it's only in Live's All Settings view (`adv`), what it needs (Live), its search words and
 * its section. Null when the map has no entry for it.
 * @param {'live'|'painter'|'admin'} app
 * @param {string} binding
 */
export function meta(app, binding) {
  const id = conceptOf(app, binding);
  if (!id) return null;
  const e = SETTINGS[id];
  return {
    id,
    label: e.labels?.[app] ?? e.label,
    hint: e.hints?.[app] ?? e.hint,
    more: (e.mores && Object.hasOwn(e.mores, app) ? e.mores[app] : e.more) ?? '',
    adv: app === 'live' && !e.simple,
    needs: e.needs?.[app] ?? null,
    keywords: e.keywords ?? [],
    section: e.section,
  };
}

/**
 * The entries an app binds, in order, each with its id.
 * @param {'live'|'painter'|'admin'} app
 * @returns {(Entry & { id: string })[]}
 */
export const entriesFor = (app) => Object.entries(SETTINGS).filter(([, e]) => e[app] !== undefined).map(([id, e]) => ({ id, ...e }));

/**
 * An app's sections, in order: Live's (every section with a tab), the Painter's own
 * (PAINTER_SECTIONS), and for the admin the shared sections its effects pages use.
 * @param {'live'|'painter'|'admin'} app
 */
export function sectionsFor(app) {
  if (app === 'painter') return PAINTER_SECTIONS.map((s) => ({ ...s, from: [...s.from] }));
  if (app === 'live') return SECTIONS.filter((s) => s.tab).map((s) => ({ ...s }));
  const used = new Set(entriesFor(app).map((e) => e.section));
  return SECTIONS.filter((s) => used.has(s.id)).map((s) => ({ ...s }));
}

/** The admin's labels for the settings it shares, by content path (schema.js LABELS). */
export const adminLabels = () => Object.fromEntries(entriesFor('admin').map((e) => [e.admin, e.labels?.admin ?? e.label]));
/** ...and their help (schema.js HELP). */
export const adminHelp = () => Object.fromEntries(entriesFor('admin').map((e) => [e.admin, e.hints?.admin ?? e.hint]));

/**
 * A number's range, the same in every app that has it: [min, max, step, unit?] (a copy),
 * or undefined.
 * @param {string} id  an entry's id
 * @returns {[number, number, number, string?] | undefined}
 */
export function sharedRange(id) {
  const r = Object.hasOwn(SETTINGS, id) ? SETTINGS[id].range : undefined;
  return r ? /** @type {[number, number, number, string?]} */ ([...r]) : undefined;
}

/**
 * Why a Live setting does nothing as the settings stand (its entry's need), or null when
 * it does something.
 * @param {string} key  a settings key (or a group's item: looks.echo)
 * @param {Record<string, any>} settings
 */
export function blockedBy(key, settings) {
  const need = meta('live', key)?.needs;
  return need && need.when(settings?.[need.key], settings ?? {}) ? need.reason : null;
}
