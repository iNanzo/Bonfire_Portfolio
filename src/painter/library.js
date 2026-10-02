// The Painter's library: a drawer with every scene to open.
//
//   My Scenes       the ones saved in this browser (sceneStore.js), each with the
//                   thumbnail taken as it was saved: open, play in Bonfire Live,
//                   duplicate, rename, export, delete (asked twice, on the card).
//   Built-In        Bonfire Live's own (content.json's scenes), read-only: open one and
//                   paint on, and saving makes it a copy in My Scenes.
//   New, Import, Export All   a fresh scene; scenes from a file the Painter exported
//                   (or a scene's JSON from the admin), ids that clash saved as copies;
//                   every one of mine in one file (bonfire-scenes.json).
// A card lifts on hover with a dithered glow in its own flame's color (an effect, no text).
// A box over the lists filters both by name as you type (/ goes to it; Esc clears it, a
// second Esc closes the drawer), and keeps filtering as the lists change.
// The drawer lists what the store has each time it opens, and again when another tab
// changes it; a redraw keeps the keyboard's place (the same button on the same card, or
// the next card's when that one's gone). Opening a scene or starting a new one while the
// one being painted has unsaved changes asks first, in place (Discard and Open / Keep
// Painting). Esc closes the drawer wherever the focus is.
import { esc } from '../html.js';
import { createSearchBox, normalize, searchBoxMarkup } from '../ui/settingsSearch.js';
import { readSceneFile, sceneFile, sceneRef, sceneSummary, sceneSwatches } from '../scenes.js';
import { swatches } from './panel.js';

/** A file download of `data` as JSON. */
export function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * One scene's card (pure markup).
 * @param {any} scene @param {string} ref @param {{ thumb?: string | null, current?: boolean, mine?: boolean }} o
 */
function cardMarkup(scene, ref, { thumb = null, current = false, mine = false } = {}) {
  const sw = sceneSwatches(scene);
  const picture = thumb ? `<img src="${esc(thumb)}" alt="" width="192" height="108" loading="lazy">` : swatches(sw);
  return `
    <li class="pnt-card${current ? ' is-current' : ''}" data-card="${esc(ref)}" style="--glow:${esc(scene.colors.flame.mid)};--glow-hi:${esc(scene.colors.flame.hi)}">
      <button type="button" class="pnt-card-open" data-lib="open" aria-label="Open “${esc(scene.name)}”"${current ? ' aria-current="true"' : ''}>${picture}</button>
      <p class="pnt-card-name" data-lib="open" data-card-name>${esc(scene.name)}</p>
      <p class="pnt-card-sum">${esc(sceneSummary(scene))}</p>
      <div class="pnt-card-acts">
        <button type="button" class="pix-btn" data-lib="play">Play in Bonfire Live ↗</button>
        <button type="button" class="pix-btn" data-lib="duplicate">Duplicate</button>
        ${mine ? '<button type="button" class="pix-btn" data-lib="rename">Rename</button>' : ''}
        <button type="button" class="pix-btn" data-lib="export">Export</button>
        ${mine ? '<button type="button" class="pix-btn pnt-danger" data-lib="delete">Delete</button>' : ''}
      </div>
      <div class="pnt-card-confirm" data-confirm hidden>
        <span>Delete “${esc(scene.name)}” for good?</span>
        <button type="button" class="pix-btn pnt-danger" data-lib="delete-yes">Delete</button>
        <button type="button" class="pix-btn" data-lib="delete-no">Keep It</button>
      </div>
      <div class="pnt-card-confirm" data-discard hidden>
        <span data-discard-text></span>
        <button type="button" class="pix-btn pnt-danger" data-lib="open-yes">Discard and Open</button>
        <button type="button" class="pix-btn" data-lib="keep">Keep Painting</button>
      </div>
    </li>`;
}
/** The question asked before unsaved changes are dropped. */
const discardText = (name) => `Discard the unsaved changes to “${name}”?`;

/**
 * @param {HTMLElement} el  the drawer (empty: it's filled here)
 * @param {{
 *   store: ReturnType<typeof import('../sceneStore.js').createSceneStore>,
 *   builtIns: () => any[],
 *   current: () => string | null,
 *   voidHex?: string,
 *   onOpen: (scene: any, ref: string) => void,
 *   onNew: () => void,
 *   onPlay: (scene: any, ref: string) => void,
 *   onRenamed?: (scene: any, ref: string) => void,
 *   onDeleted?: (ref: string) => void,
 *   onToggle?: (open: boolean) => void,
 *   unsaved?: () => string | null,
 * }} o
 *   `unsaved`: the name of the scene being painted when it has changes that aren't saved
 *   (opening another or a new one asks first), else null.
 */
export function createLibrary(el, { store, builtIns, current, voidHex, onOpen, onNew, onPlay, onRenamed = () => {}, onDeleted = () => {}, onToggle = () => {}, unsaved = () => null }) {
  el.innerHTML = `
    <div class="pnt-lib-inner" role="dialog" aria-modal="false" aria-labelledby="pnt-lib-title">
      <header class="pnt-lib-head">
        <h2 class="pnt-lib-title" id="pnt-lib-title">Library</h2>
        <div class="pnt-row">
          <button type="button" class="pix-btn" data-lib="new">New Scene</button>
          <button type="button" class="pix-btn" data-lib="import">Import…</button>
          <button type="button" class="pix-btn" data-lib="export-all">Export All</button>
          <button type="button" class="pix-btn" data-lib="close" aria-label="Close the library">Close <kbd>Esc</kbd></button>
        </div>
        <div class="pnt-card-confirm pnt-lib-confirm" data-new-confirm hidden>
          <span data-discard-text></span>
          <button type="button" class="pix-btn pnt-danger" data-lib="new-yes">Discard and Start New</button>
          <button type="button" class="pix-btn" data-lib="keep">Keep Painting</button>
        </div>
        <input type="file" accept="application/json,.json" data-lib-file hidden>
        ${searchBoxMarkup({ id: 'pnt-lib-filter', label: 'Filter Scenes by Name', placeholder: 'Filter by name  /' }).replace('class="settings-search"', 'class="settings-search pnt-lib-search"')}
      </header>
      <p class="pnt-lib-note" role="status" data-lib-note></p>
      <h3 class="pnt-lib-sub">My Scenes</h3>
      <p class="pnt-help" data-lib-empty hidden>Nothing saved yet: paint a scene and press Save (Ctrl+S). Saved scenes stay in this browser; Export makes a file of them.</p>
      <ul class="pnt-cards" role="list" data-lib-mine></ul>
      <h3 class="pnt-lib-sub">Built-In Scenes</h3>
      <p class="pnt-help">Bonfire Live’s own. Open one to paint on it: saving makes it a copy in My Scenes.</p>
      <ul class="pnt-cards" role="list" data-lib-built></ul>
    </div>`;
  el.hidden = true;
  const mineEl = el.querySelector('[data-lib-mine]');
  const builtEl = el.querySelector('[data-lib-built]');
  const noteEl = el.querySelector('[data-lib-note]');
  const fileEl = /** @type {HTMLInputElement} */ (el.querySelector('[data-lib-file]'));
  const filterEl = /** @type {HTMLInputElement} */ (el.querySelector('#pnt-lib-filter'));
  let opener = null;
  let query = '';

  const note = (text) => { noteEl.textContent = text; };
  /** A scene by its ref ('m:' mine, 'b:' built-in). */
  function find(ref) {
    const [src, id] = [ref.slice(0, 1), ref.slice(2)];
    if (src === 'm') return store.get(id);
    return builtIns().find((s) => s.id === id) ?? null;
  }
  /** The focused card and button, as [card ref, data-lib] (null: not on a card's button). */
  function focusedOn() {
    const b = /** @type {HTMLElement | null} */ (document.activeElement);
    const card = /** @type {HTMLElement | null} */ (b?.closest?.('[data-card]'));
    return card && el.contains(card) && b.dataset.lib ? [card.dataset.card, b.dataset.lib] : null;
  }
  /**
   * List the scenes again. The keyboard keeps its place: `focus` ([card ref, data-lib]),
   * else the button that had it; a card that's gone passes it to the card after it (or
   * before it, or New Scene).
   * @param {{ focus?: [string, string] | null }} [o]
   */
  function draw({ focus = focusedOn() } = {}) {
    const cur = current();
    const mine = store.list();
    const order = focus ? [...el.querySelectorAll('[data-card]')].map((c) => /** @type {HTMLElement} */ (c).dataset.card) : [];
    mineEl.innerHTML = mine.map((s) => cardMarkup(s, sceneRef('m', s.id), { thumb: store.thumb(sceneRef('m', s.id)), current: cur === sceneRef('m', s.id), mine: true })).join('');
    el.querySelector('[data-lib-empty]').hidden = mine.length > 0;
    builtEl.innerHTML = builtIns().map((s) => cardMarkup(s, sceneRef('b', s.id), { thumb: store.thumb(sceneRef('b', s.id)), current: cur === sceneRef('b', s.id) })).join('')
      || '<li class="pnt-help">No built-in scenes yet.</li>';
    filter();
    if (!focus) return;
    const [ref, act] = focus;
    const cardOf = (r) => /** @type {HTMLElement | null} */ (el.querySelector(`[data-card="${CSS.escape(r)}"]`));
    let target = /** @type {HTMLElement | null} */ (cardOf(ref)?.querySelector(`[data-lib="${CSS.escape(act)}"]:not([hidden] *)`) ?? cardOf(ref)?.querySelector('.pnt-card-open'));
    if (!target) {
      // (Gone: the nearest card still here, after it first.)
      const at = order.indexOf(ref);
      const near = [...order.slice(at + 1), ...order.slice(0, Math.max(0, at)).reverse()].map(cardOf).find(Boolean);
      target = /** @type {HTMLElement | null} */ (near?.querySelector('.pnt-card-open') ?? el.querySelector('[data-lib="new"]'));
    }
    target?.focus();
  }
  store.onChange(() => { if (!el.hidden) draw(); });

  /** Only the cards whose names have every word typed (anywhere in them); how many. */
  function filter() {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    let n = 0;
    for (const card of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('[data-card]'))) {
      const name = normalize(card.querySelector('[data-card-name]')?.textContent ?? '');
      card.hidden = !words.every((w) => name.includes(w));
      if (!card.hidden) n++;
    }
    return n;
  }
  createSearchBox({ input: filterEl, status: el.querySelector('[data-search-status]'), noun: 'scene', onQuery: (q) => { query = q; return filter(); } });

  function open() {
    if (!el.hidden) return;
    opener = document.activeElement;
    note('');
    askNew(false);
    draw({ focus: null });
    el.hidden = false;
    document.body.classList.add('lib-open');
    document.addEventListener('keydown', onKey);
    /** @type {HTMLElement} */ (el.querySelector('.pnt-card.is-current .pnt-card-open') ?? el.querySelector('[data-lib="new"]'))?.focus();
    onToggle(true);
  }
  function close() {
    if (el.hidden) return;
    el.hidden = true;
    document.body.classList.remove('lib-open');
    document.removeEventListener('keydown', onKey);
    if (opener && document.contains(opener)) /** @type {HTMLElement} */ (opener).focus?.();
    opener = null;
    onToggle(false);
  }
  /** Esc closes the drawer wherever the focus is (a field's own Esc comes first). */
  function onKey(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    close();
  }

  /** New Scene's question (shown, or put away). */
  function askNew(show) {
    const box = /** @type {HTMLElement} */ (el.querySelector('[data-new-confirm]'));
    if (show) box.querySelector('[data-discard-text]').textContent = discardText(unsaved());
    box.hidden = !show;
    if (show) /** @type {HTMLElement} */ (box.querySelector('[data-lib="keep"]')).focus();
  }
  /** A card's question before it opens over unsaved changes (shown, or put away). */
  function askOpen(card, show) {
    const box = /** @type {HTMLElement} */ (card.querySelector('[data-discard]'));
    if (show) box.querySelector('[data-discard-text]').textContent = discardText(unsaved());
    box.hidden = !show;
    /** @type {HTMLElement} */ (card.querySelector(show ? '[data-discard] [data-lib="keep"]' : '.pnt-card-open')).focus();
  }

  /** Save, telling the note when the browser's storage is full. */
  function save(scene, o) {
    try { return store.save(scene, o); } catch (e) {
      note(e?.name === 'StorageFull' ? e.message : 'That couldn’t be saved in this browser.');
      return null;
    }
  }

  el.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (/** @type {HTMLElement} */ (e.target).closest('[data-lib]'));
    if (!b) return;
    const act = b.dataset.lib;
    const card = /** @type {HTMLElement} */ (b.closest('[data-card]'));
    const ref = card?.dataset.card ?? null;
    const scene = ref ? find(ref) : null;
    if (act === 'close') close();
    else if (act === 'new') { if (unsaved()) askNew(true); else { onNew(); close(); } }
    else if (act === 'new-yes') { askNew(false); onNew(); close(); }
    else if (act === 'keep' && !card) { askNew(false); /** @type {HTMLElement} */ (el.querySelector('[data-lib="new"]')).focus(); }
    else if (act === 'import') fileEl.click();
    else if (act === 'export-all') {
      const all = store.list();
      if (!all.length) { note('Nothing saved yet to export.'); return; }
      downloadJson('bonfire-scenes.json', sceneFile(all));
      note(`Exported ${all.length} scene${all.length > 1 ? 's' : ''} to bonfire-scenes.json.`);
    } else if (!scene) return;
    else if (act === 'open') { if (unsaved()) askOpen(card, true); else { onOpen(scene, ref); close(); } }
    else if (act === 'open-yes') { onOpen(scene, ref); close(); }
    else if (act === 'keep') askOpen(card, false);
    else if (act === 'play') onPlay(scene, ref);
    else if (act === 'export') downloadJson(`${scene.id}.json`, sceneFile([scene]));
    else if (act === 'duplicate') {
      const copy = save({ ...scene, name: `${scene.name.slice(0, 34)} (Copy)` }, { fresh: true });
      if (copy) { note(`Saved “${copy.name}” in My Scenes.`); draw(); } // (the focus stays on this card’s Duplicate)
    } else if (act === 'rename') rename(card, scene);
    else if (act === 'delete') { card.querySelector('[data-confirm]').hidden = false; /** @type {HTMLElement} */ (card.querySelector('[data-lib="delete-no"]')).focus(); }
    else if (act === 'delete-no') { card.querySelector('[data-confirm]').hidden = true; /** @type {HTMLElement} */ (card.querySelector('[data-lib="delete"]')).focus(); }
    else if (act === 'delete-yes') {
      try { store.remove(scene.id); } catch (err) { note(err?.message ?? 'That couldn’t be deleted.'); return; }
      note(`Deleted “${scene.name}”.`);
      onDeleted(ref);
      draw(); // (its card gone: the focus goes to the next one’s)
    }
  });

  function rename(card, scene) {
    const nameEl = card.querySelector('[data-card-name]');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pnt-card-rename';
    input.value = scene.name;
    input.maxLength = 40;
    input.setAttribute('aria-label', `New name for “${scene.name}”`);
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const ref = sceneRef('m', scene.id);
    const finish = (keep) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (keep && name && name !== scene.name) {
        const saved = save({ ...scene, name });
        if (saved) { note(`Renamed to “${saved.name}”.`); onRenamed(saved, sceneRef('m', saved.id)); }
      }
      // (Back on its Rename button, unless the focus went somewhere else on purpose.)
      const away = document.activeElement && document.activeElement !== input && document.activeElement !== document.body;
      draw({ focus: away ? focusedOn() : [ref, 'rename'] });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  fileEl.addEventListener('change', async () => {
    const file = fileEl.files?.[0];
    fileEl.value = '';
    if (!file) return;
    const { scenes, errors } = readSceneFile(await file.text(), { voidHex });
    const took = [];
    for (const s of scenes) {
      const clash = store.get(s.id);
      const saved = save(s, { fresh: !!clash });
      if (!saved) break;
      took.push(clash ? `“${saved.name}” (as a copy)` : `“${saved.name}”`);
    }
    note([took.length ? `Imported ${took.join(', ')}.` : 'Nothing imported.', ...errors].join(' '));
    draw();
  });

  return {
    open, close,
    toggle() { if (el.hidden) open(); else close(); },
    refresh() { if (!el.hidden) draw(); },
    get isOpen() { return !el.hidden; },
    note,
    /** Focus the name filter (the drawer open). */
    focusFilter() { filterEl.focus(); filterEl.select(); },
  };
}
