// The look of the bonfire before any admin edits: the values that used to be
// constants in src/palette.js and src/bonfire/*. content.json's `effects` section
// is merged over these (src/effects.js), and the admin's "Reset to defaults" uses them.
// `RANGES` bounds every number: validation and the admin's sliders both read it.

export const CURSOR_MODES = ['ember', 'stir', 'wake', 'part', 'draw', 'slash'];
export const DITHER_MATRICES = [4, 8];
export const BASE_COLORS = ['void', 'shadow', 'stone', 'wood', 'bone'];

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
  render: { pixelSize: 4, pixelSizeSmall: 3, dither: 0.16, ditherMatrix: 4, outlines: true, vignette: 0.85, exposure: 1, colorChange: 1.25, shake: true },
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
};

/** Changing these resizes GPU buffers or light pools, so the scene is rebuilt. */
export const STRUCTURAL = ['particles', 'fireflies.count', 'fireflies.lights', 'fireflies.touchScale'];
