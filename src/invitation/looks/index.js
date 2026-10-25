// The invitation toy's look presets in one place: each one a data file here (default.js, ds.js,
// soft.js), in the Style row's order, and DEFAULT_STYLE, the Style the Look menu starts on:
// Default, the user's own look (Soft with their values, round 14), so a first visit never sees
// Custom; DS (round 13's default, the judge's pick) and Soft stay beside it. look.js offers these presets (its LOOKS) and
// takes its default Style from DEFAULT_STYLE. Each sets every Shader option the Look menu shows
// (shader.js SHADER_CONTROLS reads them from its fields: levels, dither, outline, toon, shadow,
// sun, grade), and the user's changes are written into a copy of it (look.js lookPreset).
import byDefault from './default.js';
import ds from './ds.js';
import soft from './soft.js';

/** @type {Record<string, import('../look.js').LookPreset & import('../retro.js').RetroExtras>} */
export const PRESETS = { default: byDefault, ds, soft };

/** The Style the Look menu starts on (a key of PRESETS). */
export const DEFAULT_STYLE = 'default';
