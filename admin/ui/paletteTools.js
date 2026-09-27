// Palette tools on the Effects page (the color math lives in palettes.js):
//   • each flame card: 🎲 a harmonious palette (any scheme, or one you pick), a fully
//     random one, suggestions built from a color, and Undo;
//   • the Bonfire Colors block: re-roll every palette at once, hues spread apart;
//   • the Scene Colors block: harmonious / random neutrals, or suggestions from a color.
// A change is an ordinary edit (Discard still brings back the saved colors), and the
// preview switches to the flame you're working on so you see it in the fire at once.
import { el } from './form.js';
import {
  FLAME_KEYS, SCENE_KEYS, SCHEMES, flameSet, harmoniousFlame, harmoniousScene, suggestFlames, suggestScenes, wildFlame, wildScene,
} from './palettes.js';
import { HEX_RE } from '../../src/contentRules.js';

const HISTORY = 20;
// Per flame (keyed by its draft object) and per draft (the whole-block tools): undo
// history, the last suggestions and the chosen scheme. Discarding makes a new draft,
// so its history starts fresh.
const flameState = new WeakMap();
const blockState = new WeakMap();
const stateOf = (map, key, init) => { if (!map.has(key)) map.set(key, init()); return map.get(key); };
const forFlame = (item) => stateOf(flameState, item, () => ({ history: [], suggestions: null, seed: null, scheme: 'auto' }));
function blockOf(ctx, name) {
  const all = stateOf(blockState, ctx.draft, () => ({}));
  all[name] ??= { history: [], suggestions: null, seed: null };
  return all[name];
}

const voidOf = (ctx) => (HEX_RE.test(ctx.draft.effects?.colors?.void ?? '') ? ctx.draft.effects.colors.void : '#07070b');
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
const remember = (st, snapshot) => { st.history.push(snapshot); if (st.history.length > HISTORY) st.history.shift(); };

/** A strip of color swatches (the last one set a little apart, like the card's). */
function strip(colors, keys, cls = 'pt-strip') {
  return el('span', { class: cls, 'aria-hidden': 'true' }, keys.map((k) => el('i', { style: `background:${colors[k]}` })));
}
const toolButton = (text, title, onclick, extra = {}) => el('button', { type: 'button', class: 'button small', text, title, onclick, ...extra });

/** Suggestion chips: click one to apply it. */
function chips(list, keys, onPick) {
  return el('div', { class: 'pt-chips', role: 'list' }, list.map((s) => el('button', {
    type: 'button', class: 'pt-chip', role: 'listitem', title: s.blurb ? `${s.label} — ${s.blurb}` : s.label,
    'aria-label': `Use the ${s.label} palette`, onclick: () => onPick(s.colors),
  }, strip(s.colors, keys), el('span', { class: 'pt-chip-label', text: s.label }))));
}

/** A color well that seeds suggestions, plus the current colors as quick starting points. */
function seedPicker(current, keys, seed, onSeed) {
  const well = el('input', { type: 'color', class: 'pt-seed', 'aria-label': 'Pick a color to build palettes around' });
  well.value = (HEX_RE.test(seed ?? '') ? seed : current[keys[1]] ?? '#e0582a').toLowerCase();
  let queued = false;
  well.addEventListener('input', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; onSeed(well.value); });
  });
  return el('span', { class: 'pt-seeds' },
    well,
    el('span', { class: 'pt-or', text: 'or start from' }),
    keys.filter((k) => HEX_RE.test(current[k] ?? '')).map((k) => el('button', {
      type: 'button', class: 'pt-dot', title: `Start from ${k} (${current[k]})`, 'aria-label': `Suggest palettes from the ${k} color`,
      style: `background:${current[k]}`, onclick: () => { well.value = current[k].toLowerCase(); onSeed(current[k]); },
    })));
}

// ---- one flame ----------------------------------------------------------------------------
/** The palette panel at the foot of a flame card. */
export function flameTools(item, ctx) {
  const st = forFlame(item);
  const apply = (colors) => {
    remember(st, pick(item, FLAME_KEYS));
    Object.assign(item, pick(colors, FLAME_KEYS));
    ctx.changed({ rerender: true });
    if (item.id) ctx.preview?.show(item.id);
  };
  const schemeSelect = el('select', { class: 'pt-scheme', 'aria-label': 'Color scheme', onchange: () => { st.scheme = schemeSelect.value; } },
    el('option', { value: 'auto', text: 'Any Scheme' }),
    SCHEMES.map((s) => el('option', { value: s.id, text: s.label, title: s.blurb })));
  schemeSelect.value = st.scheme;

  const suggestions = el('div', { class: 'pt-suggest' });
  const showSuggestions = () => {
    suggestions.replaceChildren(st.suggestions?.length
      ? chips(st.suggestions, FLAME_KEYS, apply)
      : el('p', { class: 'help', text: 'Pick a color (or one of this palette’s own) to see palettes built around it.' }));
  };
  showSuggestions();
  const onSeed = (hex) => {
    st.seed = hex;
    st.suggestions = suggestFlames(hex, { voidHex: voidOf(ctx) });
    showSuggestions();
  };

  return el('div', { class: 'palette-tools' },
    el('div', { class: 'pt-row' },
      el('span', { class: 'pt-label', text: 'Palette' }),
      toolButton('🎲 Harmonious', 'A random palette whose colors work together (in the chosen scheme)', () => apply(harmoniousFlame(Math.random, { voidHex: voidOf(ctx), scheme: st.scheme }).colors)),
      schemeSelect,
      toolButton('🎲 Fully Random', 'Five random colors — only the tips get lightened if they’d be unreadable as text', () => apply(wildFlame(Math.random, { voidHex: voidOf(ctx) }))),
      toolButton('↶ Undo', 'Put back the colors from before the last palette change', () => {
        const prev = st.history.pop();
        if (!prev) return;
        Object.assign(item, prev);
        ctx.changed({ rerender: true });
        if (item.id) ctx.preview?.show(item.id);
      }, { class: 'button small ghost', disabled: !st.history.length })),
    el('div', { class: 'pt-row' },
      el('span', { class: 'pt-label', text: 'From a Color' }),
      seedPicker(item, ['lo', 'mid', 'hi', 'core'], st.seed, onSeed)),
    suggestions);
}

/** The 🎲 in a flame card's head: a quick harmonious re-roll, even while it's collapsed. */
export function flameQuickRoll(item, ctx) {
  return el('button', {
    type: 'button', class: 'icon', title: 'New harmonious colors', 'aria-label': 'New harmonious colors', text: '🎲',
    onclick: () => {
      const st = forFlame(item);
      remember(st, pick(item, FLAME_KEYS));
      Object.assign(item, harmoniousFlame(Math.random, { voidHex: voidOf(ctx), scheme: st.scheme }).colors);
      ctx.changed({ rerender: true });
      if (item.id) ctx.preview?.show(item.id);
    },
  });
}

// ---- every flame at once ------------------------------------------------------------------
export function flamesBlockTools(ctx) {
  const flames = ctx.draft.effects?.flames;
  if (!Array.isArray(flames)) return null;
  const st = blockOf(ctx, 'flames');
  const roll = (wild) => {
    remember(st, flames.map((f) => pick(f, FLAME_KEYS)));
    flameSet(flames.length, Math.random, { voidHex: voidOf(ctx), wild }).forEach((colors, i) => Object.assign(flames[i], colors));
    ctx.changed({ rerender: true });
  };
  return el('div', { class: 'palette-tools is-block' },
    el('div', { class: 'pt-row' },
      el('span', { class: 'pt-label', text: 'All Palettes' }),
      toolButton('🎲 Harmonious Set', 'New harmonious colors for every palette, their hues spread around the wheel so each looks different', () => roll(false)),
      toolButton('🎲 Fully Random Set', 'Random colors for every palette', () => roll(true)),
      toolButton('↶ Undo', 'Put back every palette’s colors from before the last set', () => {
        const prev = st.history.pop();
        if (!prev) return;
        prev.forEach((colors, i) => { if (flames[i]) Object.assign(flames[i], colors); });
        ctx.changed({ rerender: true });
      }, { class: 'button small ghost', disabled: !st.history.length })),
    el('p', { class: 'help', text: 'Names, IDs, rotation and cast light stay as they are. Each palette card has its own tools too.' }));
}

// ---- scene colors --------------------------------------------------------------------------
export function sceneBlockTools(ctx) {
  const colors = ctx.draft.effects?.colors;
  if (!colors) return null;
  const st = blockOf(ctx, 'scene');
  const flames = () => ctx.draft.effects?.flames ?? [];
  const apply = (next) => {
    remember(st, pick(colors, SCENE_KEYS));
    Object.assign(colors, pick(next, SCENE_KEYS));
    ctx.changed({ rerender: true });
  };
  const suggestions = el('div', { class: 'pt-suggest' });
  const showSuggestions = () => suggestions.replaceChildren(st.suggestions?.length ? chips(st.suggestions, SCENE_KEYS, apply) : '');
  showSuggestions();
  return el('div', { class: 'palette-tools is-block' },
    el('div', { class: 'pt-row' },
      el('span', { class: 'pt-label', text: 'Palette' }),
      toolButton('🎲 Harmonious', 'Neutrals tinted one hue with a matching accent for wood and bone', () => apply(harmoniousScene(Math.random, { flames: flames() }))),
      toolButton('🎲 Fully Random', 'Random hues and strengths. Lightness stays in order (background darkest, bone lightest) so the site stays readable', () => apply(wildScene(Math.random, { flames: flames() }))),
      toolButton('↶ Undo', 'Put back the scene colors from before the last palette change', () => {
        const prev = st.history.pop();
        if (!prev) return;
        Object.assign(colors, prev);
        ctx.changed({ rerender: true });
      }, { class: 'button small ghost', disabled: !st.history.length })),
    el('div', { class: 'pt-row' },
      el('span', { class: 'pt-label', text: 'From a Color' }),
      seedPicker(colors, ['stone', 'wood', 'bone'], st.seed, (hex) => {
        st.seed = hex;
        st.suggestions = suggestScenes(hex, { flames: flames() });
        showSuggestions();
      })),
    suggestions,
    el('p', { class: 'help', text: 'The background is kept dark enough for every palette’s text color to stay readable on it.' }));
}
