// The invitation toy's look presets in one place: each one a data file here (ds.js, soft.js),
// and DEFAULT_STYLE, the Style the Look menu starts on: DS, the judge's pick (21 to Soft's 16
// for likeness, readability on a phone and cost). look.js offers these presets; its defaults
// should take their Style from DEFAULT_STYLE.
import ds from './ds.js';
import soft from './soft.js';

/** @type {Record<string, import('../look.js').LookPreset & import('../retro.js').RetroExtras>} */
export const PRESETS = { ds, soft };

/** The Style the Look menu starts on (a key of PRESETS). */
export const DEFAULT_STYLE = 'ds';
