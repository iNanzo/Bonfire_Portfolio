// The basics the content rules are made of: color and id formats, the WCAG contrast
// check, the slug an id is made from, the weapons the 3D model has, and what counts as a
// group of fields. They live here, apart from contentRules.js, so the modules that
// contentRules.js itself checks with (the scene format, src/scenes.js) can use them too
// without the two importing each other. contentRules.js re-exports the rest, so nothing
// that imported them from there changes; isObj is for the modules that read saved data
// (the content rules, effects.js, scenes.js, sceneStore.js).

/** A group of fields: an object, not null and not a list (what JSON calls an object). */
export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A color as the content stores it: #rrggbb. */
export const HEX_RE = /^#[0-9a-f]{6}$/i;
/** An id: lowercase letters and numbers in words joined by single dashes. */
export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Weapons are nodes in public/models/bonfire.glb; their keys can't change. */
export const WEAPON_KEYS = [
  'longsword',
  'broadsword',
  'bastard',
  'claymore',
  'katana',
  'uchigatana',
  'sabre',
  'rapier',
  'estoc',
  'spear',
  'greatsword',
  'glaive',
  'naginata',
  'zweihander',
  'flamberge',
  'flambergezwei',
  'wingedspear',
  'battleaxe',
  'mace',
  'warhammer',
  'morningstar',
  'halberd',
  'lance',
];

/** A text as an id (at most 48 characters): "Frozen Shrine!" → "frozen-shrine". */
export const slugify = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/**
 * The relative luminance of a #rrggbb color (WCAG: 0 black … 1 white).
 * @param {string} hex
 */
export const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * WCAG contrast ratio of two #rrggbb colors (1 … 21).
 * @param {string} a
 * @param {string} b
 */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
