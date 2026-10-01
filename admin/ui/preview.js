// The live preview: the real site in a frame, opened as ?preview, with the
// draft's effects streamed in over postMessage (see "Admin live preview" in
// src/main.js). The frame renders at a real desktop or phone size and is scaled
// to fit the pane, so the layout matches what visitors see.
import { el } from './form.js';
import { WEAPON_KEYS } from '../../src/contentRules.js';
import content from '../../src/content.json' with { type: 'json' };
import { HELMET_NAMES, GESTURE_NAMES } from '../../src/knightNames.js';

const VIEWPORTS = { desktop: [1280, 800], phone: [390, 780] };
const SCREENS = [['home', 'Home'], ['projects', 'Projects'], ['experience', 'Journey'], ['skills', 'Skills'], ['about', 'About'], ['contact', 'Contact']];

export function createPreview(siteUrl) {
  const url = new URL(siteUrl || '/', location.href);
  url.searchParams.set('preview', '1');
  const origin = url.origin;
  let ready = false;
  let effects = null;
  let frameQueued = false;
  let viewport = 'desktop';

  const frame = el('iframe', { 'aria-label': 'Live preview of the site', class: 'preview-frame', loading: 'lazy' });
  const stage = el('div', { class: 'preview-stage' }, frame);
  const state = el('span', { class: 'preview-state', text: 'Loading…' });

  const send = (msg) => { if (ready) frame.contentWindow?.postMessage(msg, origin); };
  const flush = () => { frameQueued = false; if (effects) send({ type: 'nh:effects', effects }); };

  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== origin || e.data?.type !== 'nh:ready') return;
    ready = true;
    state.textContent = 'Live';
    state.dataset.tone = 'ok';
    flush();
  });

  function fit() {
    const [w, h] = VIEWPORTS[viewport];
    const scale = Math.min(stage.clientWidth / w, 1);
    frame.style.setProperty('width', `${w}px`);
    frame.style.setProperty('height', `${h}px`);
    frame.style.setProperty('transform', `scale(${scale})`);
    stage.style.setProperty('height', `${Math.round(h * scale)}px`);
  }
  new ResizeObserver(fit).observe(stage);

  const screen = el('select', { 'aria-label': 'Screen', onchange: () => send({ type: 'nh:screen', screen: screen.value }) },
    SCREENS.map(([value, label]) => el('option', { value, text: label })));
  const size = el('select', { 'aria-label': 'Viewport', onchange: () => { viewport = size.value; fit(); } },
    el('option', { value: 'desktop', text: 'Desktop' }), el('option', { value: 'phone', text: 'Phone' }));
  // Forge a chosen weapon in the preview (the full swap), in the fire's current colors.
  const weapon = el('select', {
    'aria-label': 'Preview a weapon',
    'data-tip': 'Forge this weapon in the preview: the whole swap, then it stands in the fire',
    onchange: () => { if (weapon.value) send({ type: 'nh:weapon', key: weapon.value }); weapon.value = ''; },
  },
  el('option', { value: '', text: 'Weapon…' }),
  WEAPON_KEYS.map((k) => el('option', { value: k, text: content.weapons?.[k] ?? k })));
  // The knight: summon him or send him off (his arrival and leaving, in the fire's current
  // element), swap his helmet (the full 1.6 s swap), or ask for a gesture.
  const oneShot = (label, tip, options, type, key) => {
    const select = el('select', {
      'aria-label': label, 'data-tip': tip,
      onchange: () => { if (select.value) send({ type, [key]: select.value }); select.value = ''; },
    },
    el('option', { value: '', text: `${label}…` }),
    Object.entries(options).map(([value, text]) => el('option', { value, text })));
    return select;
  };
  const knight = oneShot('Knight', 'Summon the knight from his sign, or send him off into it (in the fire’s current element)', { summon: 'Summon', dismiss: 'Send Him Off' }, 'nh:knight', 'do');
  const helmet = oneShot('Helmet', 'Put this helmet on the knight in the preview: the whole swap (it isn’t saved)', HELMET_NAMES, 'nh:helmet', 'key');
  const gesture = oneShot('Gesture', 'The knight makes this gesture in the preview', GESTURE_NAMES, 'nh:gesture', 'name');
  const reload = () => { ready = false; state.textContent = 'Loading…'; delete state.dataset.tone; frame.src = url.href; };

  const pane = el('aside', { class: 'preview', 'aria-label': 'Live preview' },
    el('div', { class: 'preview-head' },
      el('h2', { text: 'Live Preview' }), state,
      el('a', { class: 'link-button', href: url.href.replace(/[?&]preview=1/, ''), target: '_blank', rel: 'noopener', text: 'Open Site ↗' })),
    stage,
    el('div', { class: 'preview-tools' },
      screen, size, weapon, knight, helmet, gesture,
      el('button', { type: 'button', class: 'button small', text: 'Stoke', 'data-tip': 'Stoke the fire: a flare, the element’s ring, a ground mark', onclick: () => send({ type: 'nh:stoke' }) }),
      el('button', { type: 'button', class: 'button small', text: 'Random Swap', 'data-tip': 'Forge a random new weapon, colors and element: the full swap and its impact', onclick: () => send({ type: 'nh:roll' }) }),
      el('button', { type: 'button', class: 'button small', text: 'Wake the Blade', 'data-tip': 'The planted weapon pulls free for a flourish and plunges back in (hit-stop, flash, shake, debris)', onclick: () => send({ type: 'nh:flourish' }) }),
      el('button', { type: 'button', class: 'button small ghost', text: 'Reload', 'data-tip': 'Load the site in the preview again', onclick: reload })),
    el('p', { class: 'help', text: 'Move your cursor through the fire to try the cursor effect, click the summon sign to call the knight, or click him to greet him. Unsaved — visitors see the saved version.' }));

  return {
    pane,
    /**
     * Start loading the site (first time the pane is shown). Sized at once, so the page can
     * measure the pane before it scrolls to a field below it.
     */
    open() { if (!frame.src) reload(); fit(); requestAnimationFrame(fit); },
    /** Push the draft's effects, at most once per frame. */
    update(next, { valid = true } = {}) {
      if (!valid) { state.textContent = 'Paused — fix the flagged fields'; state.dataset.tone = 'bad'; return; }
      if (ready) { state.textContent = 'Live'; state.dataset.tone = 'ok'; }
      effects = next;
      if (!frameQueued) { frameQueued = true; requestAnimationFrame(flush); }
    },
    /** Forge a flame (a new weapon, the full swap). */
    flame(id) { send({ type: 'nh:flame', id }); },
    /** Recolor the fire to a flame in place (no swap), e.g. while trying palettes. */
    show(id) { send({ type: 'nh:flame', id, instant: true }); },
    /** Forge a new weapon into the fire as this element. */
    element(id) { send({ type: 'nh:element', id }); },
  };
}
