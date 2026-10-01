// The look of the bonfire before any admin edits: the values that used to be
// constants in src/palette.js and src/bonfire/*. content.json's `effects` section
// is merged over these (src/effects.js), and the admin's "Reset to defaults" uses them.
// `RANGES` bounds every number: validation and the admin's sliders both read it.
import { DEFAULT_STYLE, STYLE_KEYS } from './bonfire/knightStyles.js';
import { FINISHES } from './bonfire/steel.js';

export const CURSOR_MODES = ['ember', 'stir', 'wake', 'part', 'draw', 'slash'];
/** What the bonfire is made of. Each one reuses the flame colors; the visuals are code (src/bonfire/). */
export const ELEMENT_IDS = ['fire', 'lightning', 'ice'];
export const DITHER_MATRICES = [4, 8];
export const BASE_COLORS = ['void', 'shadow', 'stone', 'wood', 'bone'];
/** The site knight's helmet: one of the three (knights.js HELMETS), or 'random' (a new one each time he's summoned). */
export const KNIGHT_HELMETS = ['random', 'great', 'armet', 'bascinet'];
/** How the site's knight comes: at his summon sign's call ('sign'), or there from the start ('start'). */
export const KNIGHT_ARRIVALS = ['sign', 'start'];
/** How he sits (knightPose.js SEAT_POSES): the Dark Souls rest, or watchful (leaning in over his knees, forearms on them, head up at the fire). */
export const KNIGHT_SEATS = ['resting', 'watchful'];
/** His styles (bonfire/knightStyles.js STYLES), in menu order. */
export const KNIGHT_STYLES = STYLE_KEYS;
/** His armor's finishes (bonfire/steel.js FINISHES): the steel color within the styles that draw steel. */
export const KNIGHT_FINISHES = Object.keys(FINISHES);

const flame = (id, name, [lo, mid, hi, core], shade, light = 0.34) => ({ id, name, lo, mid, hi, core, shade, light });

export const DEFAULT_EFFECTS = {
  colors: { void: '#07070b', shadow: '#15131d', stone: '#2c2a3a', wood: '#5b4535', bone: '#e9e3d2' },
  flames: [
    flame('ember', 'Ember Flame', ['#8c1d2f', '#e0582a', '#ffc76a', '#fff1d0'], '#5b4535', 0.25),
    flame('verdant', 'Verdant Flame', ['#1f5e2c', '#4fbf3a', '#b8f06a', '#effce0'], '#24382a'),
    flame('blood', 'Blood Flame', ['#4a0a1a', '#c21d3b', '#ff7474', '#ffd9d2'], '#3d2027'),
    flame('spirit', 'Spirit Flame', ['#124a55', '#2fb8b0', '#7ff0e0', '#e6fffb'], '#1d3a3f'),
    flame('arcane', 'Arcane Flame', ['#3a1566', '#8a4ce0', '#d09bff', '#f6e8ff'], '#2e2447'),
    flame('gilded', 'Gilded Flame', ['#6b3a0e', '#e0a020', '#ffe066', '#fffbe0'], '#40331f'),
    flame('rose', 'Rose Flame', ['#5c1240', '#d83a8c', '#ff9ccf', '#ffe6f3'], '#3d2033'),
    flame('azure', 'Azure Flame', ['#0f2f66', '#2f7fe0', '#8cc8ff', '#e8f4ff'], '#1d2b45'),
    flame('phosphor', 'Phosphor Flame', ['#4a4538', '#bdb49c', '#fffaf0', '#ffffff'], '#35332d'),
    flame('umbral', 'Umbral Flame', ['#1c1a4a', '#5b5bd6', '#b0afff', '#ecebff'], '#24233f'),
  ],
  fire: { brightness: 0.3, size: 0.27, height: 0.62, turbulence: 0.42, swirl: 2.6, lifeMin: 0.55, lifeMax: 1.25, glow: 9, fps: 12, stoke: 0.9 },
  particles: { fire: 2200, sparks: 48, forge: 640, impact: 1, touchScale: 0.5 },
  fireflies: { count: 18, lit: 9, lights: 9, speed: 1, touchScale: 0.67 },
  cursor: { mode: 'ember', strength: 1 },
  // Which elements a random draw can pick, and how often (weights are relative).
  elements: {
    fire: { name: 'Flame', rotation: true, weight: 1 },
    lightning: { name: 'Lightning', rotation: true, weight: 1 },
    ice: { name: 'Frost', rotation: true, weight: 1 }, // "Azure Frost", mirroring "Azure Flame"
  },
  // Lightning: a tesla ball with no glass set in the core of the bonfire, lashing strikes
  // out between the logs at the ground around it (src/bonfire/plasma.js); impacts crackle a lightning ring across the ground (lightningRing.js).
  lightning: { size: 0.44, height: 0.3, filaments: 12, strikes: 4, boltWidth: 3, jag: 0.45, branches: 0.5, crackle: 20, drift: 1, brightness: 1.1, cursorPull: 0.8, flicker: 0.6, ringSpeed: 1, ringArcs: 0.6 },
  // Ice: a translucent crystal cluster grows out of the ground around a banked fire
  // (ice.js); impacts send a ring of shards out that spike up and sink back, with chill.
  ice: { pulse: 3.5, shards: 28, height: 1.05, spread: 0.36, thickness: 1, clarity: 0.28, glow: 1, shimmer: 0.5, innerFire: 0.45, frost: 60, growTime: 1.4, ringSpeed: 1, ringHeight: 1, ringHold: 0.08 },
  // How hits land (src/bonfire/scene.js, marks.js, debris.js): a freeze frame, a flash, the
  // ground scorched / frosted / scarred where they struck (fading away), debris, lightning's
  // afterimages and strikes on fireflies, and how much busy moments thin the extras out.
  impact: { hitStop: 0.06, flash: 0.5, marks: true, markLife: 20, debris: 1, afterimages: 0.6, fireflyStrikes: 0.5, budget: 0.6 },
  render: { pixelSize: 4, pixelSizeSmall: 3, dither: 0.16, ditherMatrix: 4, outlines: true, vignette: 0.85, exposure: 1, colorChange: 1.25, shake: true },
  // The knight who comes to the fire (src/bonfire/knights.js, knightArrival.js): whether he
  // may come at all; how (his summon sign on the ground, or there from the start); how long
  // he rests before he burns away into the sign again (minutes, rolled between the two on
  // each summon); his helmet (a new one each summon, or one fixed here); his style
  // (knightStyles.js: how he's drawn) and armor finish (steel.js: its steel's color, in the
  // styles that draw steel); how strongly his edges catch the fire's color; whether the
  // fire's reflection sweeps over his armor (armor.js: now and then, and when the fire
  // flares); how he sits; whether a click on him gets a gesture back; and whether he reacts
  // to what the fire does (flinching at impacts, leaning away from a stoke, watching a
  // weapon rise). Bonfire Live casts its own knights (its Knights settings).
  knight: {
    show: true, arrival: 'sign', restMin: 3, restMax: 5, helmet: 'random', style: DEFAULT_STYLE, finish: 'gunmetal',
    rim: 0.5, shine: true, seat: 'resting', gestures: true, reactions: true,
  },
};

/** [min, max, step, unit?] per number, keyed by path pattern (`flames[].light`). */
export const RANGES = {
  'flames[].light': [0, 1, 0.01],
  'fire.brightness': [0.05, 1, 0.01],
  'fire.size': [0.08, 0.7, 0.01, 'm'],
  'fire.height': [0.2, 1.6, 0.01],
  'fire.turbulence': [0, 1.2, 0.01],
  'fire.swirl': [0.5, 6, 0.1],
  'fire.lifeMin': [0.2, 2, 0.05, 's'],
  'fire.lifeMax': [0.3, 3, 0.05, 's'],
  'fire.glow': [0, 24, 0.5],
  'fire.fps': [6, 60, 1, 'fps'],
  'fire.stoke': [0.1, 2, 0.05],
  'particles.fire': [200, 5000, 50],
  'particles.sparks': [0, 200, 2],
  'particles.forge': [100, 1500, 20],
  'particles.impact': [0.1, 2, 0.05, '×'],
  'particles.touchScale': [0.2, 1, 0.05, '×'],
  'fireflies.count': [0, 40, 1],
  'fireflies.lit': [0, 40, 1],
  'fireflies.lights': [0, 16, 1],
  'fireflies.speed': [0.2, 3, 0.05, '×'],
  'fireflies.touchScale': [0.2, 1, 0.05, '×'],
  'cursor.strength': [0, 2, 0.05, '×'],
  'render.pixelSize': [2, 8, 1, 'px'],
  'render.pixelSizeSmall': [2, 8, 1, 'px'],
  'render.dither': [0, 0.5, 0.01],
  'render.vignette': [0, 1.5, 0.05],
  'render.exposure': [0.3, 2, 0.05],
  'render.colorChange': [0.2, 4, 0.05, 's'],
  'impact.hitStop': [0, 0.15, 0.01, 's'],
  'impact.flash': [0, 1, 0.05],
  'impact.markLife': [3, 60, 1, 's'],
  'impact.debris': [0, 2, 0.05, '×'],
  'impact.afterimages': [0, 1, 0.05],
  'impact.fireflyStrikes': [0, 1, 0.05],
  'impact.budget': [0, 1, 0.05],
  ...Object.fromEntries(ELEMENT_IDS.map((id) => [`elements.${id}.weight`, [0.1, 5, 0.1, '×']])),
  'lightning.size': [0.2, 0.8, 0.01, 'm'],
  'lightning.height': [0.15, 1.2, 0.01, 'm'],
  'lightning.filaments': [2, 32, 1],
  'lightning.strikes': [0, 8, 1],
  'lightning.boltWidth': [1, 6, 0.5, 'px'],
  'lightning.jag': [0, 1, 0.01],
  'lightning.branches': [0, 1, 0.01],
  'lightning.crackle': [4, 40, 1, 'Hz'],
  'lightning.drift': [0, 3, 0.05, '×'],
  'lightning.brightness': [0.2, 2, 0.05, '×'],
  'lightning.cursorPull': [0, 1, 0.05],
  'lightning.flicker': [0, 1, 0.05],
  'lightning.ringSpeed': [0.4, 2, 0.05, '×'],
  'lightning.ringArcs': [0, 1, 0.05],
  'ice.pulse': [0, 12, 0.5, 's'],
  'ice.shards': [6, 40, 1],
  'ice.height': [0.3, 1.4, 0.01, 'm'],
  'ice.spread': [0.1, 0.6, 0.01, 'm'],
  'ice.thickness': [0.5, 2, 0.05, '×'],
  'ice.clarity': [0, 0.8, 0.05],
  'ice.glow': [0.2, 2, 0.05, '×'],
  'ice.shimmer': [0, 1, 0.05],
  'ice.innerFire': [0, 1, 0.05],
  'ice.frost': [0, 200, 5],
  'ice.growTime': [0.2, 3, 0.05, 's'],
  'ice.ringSpeed': [0.4, 2, 0.05, '×'],
  'ice.ringHeight': [0.3, 2, 0.05, '×'],
  'ice.ringHold': [0, 1.5, 0.05, 's'],
  'knight.restMin': [1, 30, 0.5, 'min'],
  'knight.restMax': [1, 30, 0.5, 'min'],
  'knight.rim': [0, 1, 0.05],
};

/** Changing these resizes GPU buffers or light pools, so the scene is rebuilt. */
export const STRUCTURAL = ['particles', 'fireflies.count', 'fireflies.lights', 'fireflies.touchScale'];
