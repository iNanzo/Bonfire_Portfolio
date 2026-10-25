// The Setup tab's printable Award Cards and its thin browser layer (reading an imported file,
// opening the print window, Ready for Offline's probe): each takes its globals as arguments with
// browser defaults, so the tests pass fakes. Split from hostSetup.js (which re-exports them).
/**
 * @typedef {import('./types.js').LarpEvent} LarpEvent
 * @typedef {import('./types.js').Lang} Lang
 * @typedef {import('./hostSetup.js').OfflineProbe} OfflineProbe
 */
import { esc } from '../html.js';
import { t } from './strings.js';
import { emblemSvg } from './emblems.js';

// ── Award Cards (a printable page) ──────────────────────────────────────────────────────────

/** The print page's own styles: black on white, four cards to a page, cut lines dashed. */
const PRINT_CSS = `@page{margin:10mm}
*{box-sizing:border-box}
body{margin:0;padding:10mm;font:10.5pt/1.35 system-ui,'Segoe UI',sans-serif;color:#000;background:#fff}
.note{margin:0 0 6mm;font-size:11pt}
.sheet{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.card{border:1px dashed #000;padding:4mm 5mm;height:128mm;overflow:hidden;break-inside:avoid;display:flex;flex-direction:column;gap:2.2mm}
.card header{display:flex;justify-content:space-between;gap:4mm;border-bottom:1.5px solid #000;padding-bottom:1.5mm}
.card header span{font-size:9pt}
.k{display:block;font-size:7.5pt;letter-spacing:.04em;text-transform:uppercase}
.opts{display:flex;flex-wrap:wrap;gap:1mm 4mm;align-items:center}
.box{display:inline-block;width:3.4mm;height:3.4mm;border:1px solid #000;margin-right:1.2mm;vertical-align:-0.4mm}
.teams{columns:2;gap:4mm;margin:0;padding:0;list-style:none;font-size:9pt}
.teams li{break-inside:avoid}
.teams svg{vertical-align:-0.3mm;margin-right:1mm}
.line{border-bottom:1px solid #000;min-height:8mm}
.grow{flex:1}
@media print{body{padding:0}.note{display:none}.sheet{gap:4mm}}`;

/** Teams listed on a card (more than this leaves a line to write the team on). */
const CARD_TEAMS = 12;

/**
 * Award Cards: a printable page of paper cards for co-GMs to note awards on and hand to the host
 * (labels in both languages, the event's rounds and teams to tick). A whole HTML document; every
 * text is escaped.
 * @param {LarpEvent} event
 * @param {Lang} lang the host's language (the page's own note)
 * @param {{ cards?: number }} [o]
 * @returns {string}
 */
export function awardCardsHtml(event, lang, o = {}) {
  const count = Math.max(1, Math.min(40, Math.floor(o.cards ?? 8)));
  /** @param {string} key */
  const both = (key) => esc(t(key, 'bilingual'));
  const box = '<span class="box"></span>';
  const rounds = event.rounds
    .map((r, i) => (r.skipped ? '' : `<span>${box}${i + 1} ${esc(t(`round.${r.category}`, 'vi'))}</span>`))
    .join('');
  const teams =
    event.teams.length && event.teams.length <= CARD_TEAMS
      ? `<ul class="teams">${event.teams.map((tm) => `<li>${box}${emblemSvg(tm.emblem, { size: 10 })}${esc(tm.name)}</li>`).join('')}</ul>`
      : '<div class="line"></div>';
  const line = (/** @type {string} */ key, cls = '') =>
    `<div class="line${cls}"><span class="k">${both(key)}</span></div>`;
  const card = `<article class="card"><header><strong>${both('label.awardCards')}</strong><span>${esc(event.config.title)}</span></header>
<div><span class="k">${both('label.round')}</span><div class="opts">${rounds}</div></div>
<div><span class="k">${both('label.to')}</span><div class="opts"><span>${box}${both('label.team')}</span><span>${box}${both('label.individual')}</span></div></div>
<div><span class="k">${both('label.team')}</span>${teams}</div>
${line('role.member')}${line('label.name')}${line('label.translation')}
<div><span class="k">${both('label.points')}</span><div class="opts"><span>${box}+</span><span>${box}−</span><span class="line grow"></span></div></div>
${line('label.from')}${line('label.noteForHts', ' grow')}</article>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(`${t('label.awardCards', lang)} · ${event.config.title}`)}</title><style>${PRINT_CSS}</style></head><body><p class="note" lang="${esc(lang)}">${esc(t('hint.printCards', lang))}</p><main class="sheet">${Array.from({ length: count }, () => card).join('')}</main></body></html>`;
}

// ── The thin browser layer (globals injected, browser defaults) ─────────────────────────────

/**
 * The chosen file's text (Import), or null when none was chosen.
 * @param {{ files?: ArrayLike<{ text(): Promise<string> }> | null } | null | undefined} el
 * @returns {Promise<string|null>}
 */
export async function readFileText(el) {
  const file = el?.files?.[0];
  return file ? file.text() : null;
}

/**
 * Opens `html` in a new window and asks to print it; false when the browser blocked the window.
 * @param {string} html
 * @param {{ open(url: string, target: string): any } | undefined} [win]
 * @returns {boolean}
 */
export function openPrint(html, win = globalThis.window) {
  const w = win?.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus?.();
  w.print?.();
  return true;
}

/** The fonts Ready for Offline asks for: a CSS font and text that needs its subsets. */
const FONT_SPECS = Object.freeze({
  inter: ['400 16px Inter', 'Aộ'],
  cinzel: ['600 16px Cinzel', 'A'],
  pixelify: ['400 16px "Pixelify Sans"', '0'],
});

/**
 * Ready for Offline's probe: whether the scene's models are in this browser's cache (seen in this
 * window's resource timing, or answered by `fetch` with `cache: 'only-if-cached'`, which also finds
 * what the display window fetched) and whether the three fonts load (FontFaceSet.load resolves
 * with their faces from the cache, or fails offline).
 * @param {{
 *   fetchImpl?: (url: string, init: object) => Promise<{ ok: boolean }>,
 *   fonts?: { load(font: string, text?: string): Promise<unknown[]> } | null,
 *   perf?: { getEntriesByType(type: string): Array<{ name: string }> } | null,
 *   base?: string,
 * }} [deps]
 * @returns {Promise<Required<Pick<OfflineProbe, 'models'|'fonts'>>>}
 */
export async function probeOffline(deps = {}) {
  const {
    fetchImpl = globalThis.fetch,
    fonts = globalThis.document?.fonts,
    perf = globalThis.performance,
    base = import.meta.env?.BASE_URL ?? '/',
  } = deps;
  /** @param {string} path */
  const model = async (path) => {
    try {
      if (perf?.getEntriesByType('resource').some((e) => e.name.endsWith(`/${path}`))) return true;
      const r = await fetchImpl(`${base}${path}`, { cache: 'only-if-cached', mode: 'same-origin' });
      return !!r?.ok;
    } catch {
      return false;
    }
  };
  /** @param {readonly string[]} spec */
  const font = async ([css, text]) => {
    try {
      return ((await fonts?.load(css, text)) ?? []).length > 0;
    } catch {
      return false;
    }
  };
  const [bonfire, knight, inter, cinzel, pixelify] = await Promise.all([
    model('models/bonfire.glb'),
    model('models/knight.glb'),
    font(FONT_SPECS.inter),
    font(FONT_SPECS.cinzel),
    font(FONT_SPECS.pixelify),
  ]);
  return { models: { bonfire, knight }, fonts: { inter, cinzel, pixelify } };
}
