// Accent colors follow the flame. Text uses --accent-hi (always ≥ 4.5:1 on the
// void); --accent / --accent-lo are for borders, gems and decoration. During a
// color change the scene calls setAccentRamp() every frame with the blend.
import { flames } from '../palette.js';
import { faviconSvg } from './logo.js';

const VARS = ['--accent-lo', '--accent', '--accent-hi', '--accent-core'];

// The favicon follows the flame alongside the text, redrawn at most every
// 120 ms during a blend (and once more when it settles).
let faviconTimer = 0;
let faviconLast = 0;
let faviconKey = '';
let faviconRamp = null;
function drawFavicon() {
  faviconTimer = 0;
  faviconLast = performance.now();
  const key = faviconRamp[2] + faviconRamp[0];
  const link = document.querySelector('link[rel="icon"]');
  if (!link || key === faviconKey) return;
  faviconKey = key;
  link.href = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg(faviconRamp[2], faviconRamp[0]));
}
function updateFavicon(ramp) {
  faviconRamp = ramp;
  if (!faviconTimer) faviconTimer = setTimeout(drawFavicon, Math.max(0, 120 - (performance.now() - faviconLast)));
}

export function setAccentRamp(ramp, root = document.documentElement) {
  ramp.forEach((hex, i) => root.style.setProperty(VARS[i], hex));
  updateFavicon(ramp);
}

export function applyFlame(key, root = document.documentElement) {
  setAccentRamp(flames[key].ramp, root);
  root.dataset.flame = key;
}
