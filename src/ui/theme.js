// @ts-nocheck: 1 type error still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
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

// During a color blend the scene calls setAccentRamp() every frame. Each write restyles
// the whole page, so the colors are written at most every 50 ms (setAccentRate: Bonfire
// Live, busier, writes them less often; the blend still reads as smooth), always ending on
// the latest ramp; `now` writes at once (a flame set outright). A color that's already
// what it would be written as isn't written again (the scene also calls it when only the
// scenery's colors changed, with the same ramp).
let accentRamp = null;
let accentRoot = null;
let accentTimer = 0;
let accentLast = -Infinity;
let accentEvery = 50;
function writeAccents() {
  accentTimer = 0;
  accentLast = performance.now();
  accentRamp.forEach((hex, i) => {
    if (accentRoot.style.getPropertyValue(VARS[i]) !== hex) accentRoot.style.setProperty(VARS[i], hex);
  });
}

/** Write the accent colors at most every `ms` during a blend (50 by default). */
export function setAccentRate(ms) {
  accentEvery = Number.isFinite(ms) && ms >= 0 ? ms : 50;
}

export function setAccentRamp(ramp, root = document.documentElement, { now = false } = {}) {
  accentRamp = ramp;
  accentRoot = root;
  const wait = accentEvery - (performance.now() - accentLast);
  if (now || wait <= 0) {
    clearTimeout(accentTimer);
    writeAccents();
  } else if (!accentTimer) accentTimer = setTimeout(writeAccents, wait);
  updateFavicon(ramp);
}

export function applyFlame(key, root = document.documentElement) {
  setAccentRamp(flames[key].ramp, root, { now: true });
  root.dataset.flame = key;
}
