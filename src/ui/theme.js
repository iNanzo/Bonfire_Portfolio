// Accent colors follow the flame. Text uses --accent-hi (always ≥ 4.5:1 on the
// void); --accent / --accent-lo are for borders, gems and decoration. During a
// color change the scene calls setAccentRamp() every frame with the blend.
import { flames } from '../palette.js';

const VARS = ['--accent-lo', '--accent', '--accent-hi', '--accent-core'];

export function setAccentRamp(ramp, root = document.documentElement) {
  ramp.forEach((hex, i) => root.style.setProperty(VARS[i], hex));
}

export function applyFlame(key, root = document.documentElement) {
  setAccentRamp(flames[key].ramp, root);
  root.dataset.flame = key;
}
