// Bonfire Live's settings dialog: its markup, laid out by the settings map, and what its
// controls do. The values are settings.js's; each field is settingsControls.js's; the search
// is settingsSearchUi.js's.
//
//   layout    a header that stays put (the title, the search box, Simple / All Settings, a
//             close button, the presets), the tab bar under it, the tab's sections, and a
//             footer (Keyboard Shortcuts, Reset To Defaults, Close). The tabs, their sections
//             and each section's settings, in order, are the map's (TABS, sectionsFor,
//             entriesFor('live')): every label and hint is the map's. "Simple" shows the
//             settings that matter most, each section saying how many more All Settings has;
//             a tab with three-way switches says once what Off, In the Mix and Always mean.
//   changes   a field writes its setting at once (numbers as numbers; a group keeps at least
//             one switch on), then onChange(key) (its top key: 'looks' for 'looks.glitch';
//             a list of them for anything that changes many; nothing for the page's own,
//             like the title cards). A grid's or a checklist's bulk buttons, a section's
//             Reset Section, Reset To Defaults, a preset and a setup change many at once: one
//             onChange for them all, and an Undo in the footer that puts them back.
//   needs     a setting that does nothing as the others stand (Edge Glow Strength with Edge
//             Glow Off, say: the map's `needs`) is disabled, with a line saying why.
//   lists     the loop's scenes (`scenes()`: the library, the site's built-in ones first;
//             `thumb(ref)`; Play Now: `onPlayScene(ref)`, which closes the dialog), the title
//             cards and the setups, drawn again as they change.
// The fields are filled in when the dialog opens (and while it's open); a change made while
// it's closed (the P menu, a key) waits for then.
import { esc, corners } from '../html.js';
import { TABS, TRI_HELP, sectionsFor, entriesFor, meta, blockedBy } from '../settingsMap.js';
import { searchBoxMarkup } from '../ui/settingsSearch.js';
import { BULK_ACTIONS } from '../ui/fields.js';
import { sceneSummary } from '../scenes.js';
import {
  NUMERIC, AT_LEAST_ONE, RANDOM, PRESETS, applyPreset, presetOf, resetSettings, flushSettings, scenesFrom, setInLoop, inLoop,
  readSetups, saveSetup, loadSetup, deleteSetup, exportSetups, importSetups,
} from './settings.js';
import { CONTROLS, BLOCKS, row, kindOf, presetButtons, sceneListMarkup, cardsMarkup, setupsMarkup, keysResultsMarkup } from './settingsControls.js';
import { bulkPlan, sectionPlan, sectionKeys, applyValues, topKeys, changes, getPath, setPath } from './settingsBulk.js';
import { createLiveSearch } from './settingsSearchUi.js';

export { presetButtons, sceneListMarkup };

// Sections as wide as the dialog: grids, lists and the cards.
const WIDE = new Set(['midi', 'drop', 'looks', 'layers', 'loop', 'titles', 'moreCards', 'setups']);
const tabOf = (id) => TABS.find((t) => t.id === id);

/** Mark the preset in use (aria-pressed) on every preset button under `root`. */
export function markPreset(root, settings) {
  const on = presetOf(settings);
  for (const b of root.querySelectorAll('[data-preset]')) b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.preset === on));
}

/**
 * One section of a tab: its heading (with the tab's name before it while searching), its
 * line of intro, its settings in the map's order with its blocks among them, and its foot:
 * how many more All Settings has, and Reset Section.
 * @param {{ id: string, tab: string, label: string, intro?: string }} s
 * @param {Record<string, any>} settings @param {string} base
 */
function sectionMarkup(s, settings, base) {
  const entries = entriesFor('live').filter((e) => e.section === s.id);
  const block = BLOCKS[s.id]?.({ base }) ?? {};
  const rows = entries.map((e) => {
    const m = meta('live', e.live);
    return row(e.live, m, CONTROLS[e.live](settings, m)) + (block.after?.[e.live] ?? '');
  }).join('');
  const more = entries.filter((e) => !e.simple).length;
  const cue = more ? `<button type="button" class="viz-more-cue" data-show-all="${s.id}">${more} More In All Settings</button>` : '';
  const reset = sectionKeys(s.id).length ? `<button type="button" class="bulk-btn viz-reset-section" data-reset-section="${s.id}" aria-label="Reset Section: ${esc(s.label)}">Reset Section</button>` : '';
  return `
        <fieldset class="viz-section${WIDE.has(s.id) ? ' viz-span' : ''}" data-section="${s.id}">
          <legend><span class="viz-crumb">${esc(tabOf(s.tab)?.label ?? '')} › </span>${esc(s.label)}</legend>
          ${s.intro ? `<p class="viz-help">${esc(s.intro)}</p>` : ''}${block.start ?? ''}${rows}${block.end ?? ''}
          ${cue || reset ? `<div class="viz-section-foot">${cue}${reset}</div>` : ''}
        </fieldset>`;
}

/**
 * The settings dialog. `keys`: [keys, what they do] pairs, for the search (the shortcuts
 * themselves are the keys overlay's); `base`: the site's base URL (the Painter's links).
 * @param {Record<string, any>} settings
 * @param {[string, string][]} [keys]
 * @param {{ base?: string }} [o]
 */
export function settingsMarkup(settings, keys = [], { base = '/' } = {}) {
  const sections = sectionsFor('live');
  const hasTri = (tab) => entriesFor('live').some((e) => sections.find((s) => s.id === e.section)?.tab === tab && ['tri', 'grid'].includes(kindOf(e.live)));
  const panel = (t) => `
      <div class="viz-tab-panel" role="tabpanel" id="viz-tab-${t.id}" aria-labelledby="viz-tabbtn-${t.id}" data-tab-panel="${t.id}" hidden>
        ${hasTri(t.id) ? `<p class="viz-help viz-tri-help">${esc(TRI_HELP)}</p>` : ''}
        <div class="viz-settings-grid">${sections.filter((s) => s.tab === t.id).map((s) => sectionMarkup(s, settings, base)).join('')}</div>
      </div>`;
  return `
  <dialog class="rest-menu viz-settings" data-settings aria-labelledby="viz-settings-title">
    <form method="dialog" class="rest-menu-inner frame viz-settings-inner" data-view="simple">
      ${corners}
      <div class="viz-settings-top">
        <div class="viz-settings-head">
          <p class="rest-menu-title" id="viz-settings-title">Settings</p>
          <div class="viz-search" data-settings-search>${searchBoxMarkup({ id: 'viz-settings-search', label: 'Search Settings', placeholder: 'Search settings  /' })}</div>
          <div class="viz-view-switch" role="radiogroup" aria-label="How Many Settings to Show">
            <label><input type="radio" name="viz-view" value="simple" data-view-pick> Simple</label>
            <label><input type="radio" name="viz-view" value="all" data-view-pick> All Settings</label>
          </div>
          <button type="button" class="viz-close" data-settings-close aria-label="Close Settings" data-tip="Close (Esc)">✕</button>
        </div>
        <div class="viz-presets viz-presets-top" role="group" aria-label="Presets">${presetButtons()}</div>
        <div class="viz-tabs" role="tablist" aria-label="Settings Tabs">
          ${TABS.map((t, i) => `<button type="button" role="tab" class="viz-tab" id="viz-tabbtn-${t.id}" aria-controls="viz-tab-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${t.id}"${i === 0 ? ' autofocus' : ''}>${esc(t.label)}<span class="viz-tab-count" data-tab-count hidden></span></button>`).join('')}
        </div>
      </div>
      <div class="viz-settings-body" data-settings-body>
        ${TABS.map(panel).join('')}
        ${keysResultsMarkup(keys)}
        <div class="viz-search-empty" data-search-empty hidden>
          <p>No settings match “<span data-search-query></span>”.</p>
          <p class="viz-help">Try one of these: <span data-search-suggest></span></p>
          <button type="button" class="pix-btn" data-search-clear>Clear Search</button>
        </div>
      </div>
      <div class="viz-settings-foot">
        <button class="pix-btn viz-keys-btn" type="button" data-keys-open><kbd>?</kbd><span>Keyboard Shortcuts</span></button>
        <p class="viz-toast" role="status" data-toast><span data-toast-text></span><button type="button" class="bulk-btn" data-toast-undo hidden>Undo</button></p>
        <button class="pix-btn" type="button" data-reset-all>Reset To Defaults</button>
        <button class="pix-btn" value="close">Close</button>
      </div>
    </form>
  </dialog>`;
}

/** The words a bulk button's toast says ("Looks: All Off"). */
const actionName = (action) => Object.values(BULK_ACTIONS).flat().find(([a]) => a === action)?.[1] ?? action;

/**
 * Wire the dialog to `settings` (see the top of this file). `midi()`: the MIDI actions'
 * names, `keys`: the shortcuts as [keys, what they do] (both for the search); `onKeys()`
 * opens the keyboard shortcuts. A click on the backdrop closes it. Returns { fill (show the
 * current values: at once if it's open, else when it opens), open(tab?, { search }), drawScenes,
 * markScene(ref) (the scene playing now), linkStatus, reveal(key) (a setting's row, shown and
 * focused), search(query) }.
 * @param {HTMLDialogElement} dialog
 * @param {Record<string, any>} settings
 * @param {{
 *   onChange: (key?: string | string[]) => void, onNote?: (text: string) => void,
 *   scenes?: () => { ref: string, scene: any }[], thumb?: (ref: string) => string|null,
 *   onPlayScene?: (ref: string) => void, base?: string, midi?: () => Record<string, string>,
 *   keys?: [string, string][], onKeys?: () => void,
 * }} o
 */
export function bindSettings(dialog, settings, { onChange, onNote = () => {}, scenes = () => [], thumb = () => null, onPlayScene = () => {}, base = '/', midi = () => ({}), keys = [], onKeys = () => {} }) {
  const form = /** @type {HTMLFormElement} */ (dialog.querySelector('form'));
  const q = (s) => /** @type {HTMLElement} */ (dialog.querySelector(s));
  // (The settings' fields never change: found once. The lists' are drawn again.)
  const fields = /** @type {(HTMLInputElement | HTMLSelectElement)[]} */ ([...dialog.querySelectorAll('[data-set]')]);
  const outputs = new Map([...dialog.querySelectorAll('[data-out]')].map((o) => [/** @type {HTMLElement} */ (o).dataset.out, o]));

  function showOutput(key) {
    const out = outputs.get(key);
    if (!out) return;
    const v = getPath(settings, key);
    const text = key === 'offset' || key === 'linkPort' ? String(v) : key === 'volume' ? `${Math.round(v * 100)}%` : Number(v).toFixed(2);
    if (out.textContent !== text) out.textContent = text;
  }
  /** The fields show the settings (only the fields: the lists are drawn on their own). */
  function fillFields() {
    for (const el of fields) {
      const v = getPath(settings, el.dataset.set);
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!v;
      else if (el instanceof HTMLInputElement && el.type === 'radio') el.checked = el.value === String(v);
      else el.value = String(v);
      showOutput(el.dataset.set);
    }
    form.dataset.view = settings.view;
    for (const r of dialog.querySelectorAll('[data-view-pick]')) /** @type {HTMLInputElement} */ (r).checked = /** @type {HTMLInputElement} */ (r).value === settings.view;
    markPreset(dialog, settings);
    applyDeps();
  }
  function fillNow() {
    fillFields();
    drawCards();
    drawSetups();
    drawScenes();
  }
  /** Show the current values: now if the dialog is open, else as it next opens (it fills then). */
  function fill() {
    if (dialog.open) fillNow();
  }

  // --- needs: a setting that does nothing as things stand is off, saying why
  const needs = entriesFor('live').filter((e) => e.needs?.live).map((e) => ({ key: e.live, row: q(`[data-row="${e.live}"]`), why: q(`#viz-why-${e.live}`) })).filter((n) => n.row && n.why);
  const describedBy = (el) => (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  function applyDeps() {
    for (const { key, row: r, why } of needs) {
      const reason = blockedBy(key, settings);
      const off = !!reason;
      if (r.dataset.blocked === String(off) && why.textContent === (reason ?? '')) continue;
      r.dataset.blocked = String(off);
      why.textContent = reason ?? '';
      why.hidden = !off;
      for (const el of r.querySelectorAll('select[data-set], input[data-set]:not(fieldset.tri input), fieldset.tri, .bulk-btn')) {
        /** @type {HTMLInputElement} */ (el).disabled = off;
        if (el.matches('.bulk-btn')) continue;
        const ids = describedBy(el).filter((id) => id !== why.id);
        el.setAttribute('aria-describedby', [...ids, ...(off ? [why.id] : [])].join(' '));
      }
    }
  }

  // --- tabs (arrow keys move between them, like any tab list)
  const tabs = /** @type {HTMLElement[]} */ ([...dialog.querySelectorAll('[data-tab]')]);
  function showTab(id, focus = false) {
    for (const t of tabs) {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      t.toggleAttribute('autofocus', on); // (the dialog opens with focus on its tab)
      if (on && focus) t.focus();
      if (on) t.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); // (a phone's tab bar scrolls)
    }
    for (const p of dialog.querySelectorAll('[data-tab-panel]')) /** @type {HTMLElement} */ (p).hidden = /** @type {HTMLElement} */ (p).dataset.tabPanel !== id;
  }
  q('.viz-tabs').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    showTab(tabs[next].dataset.tab, true);
  });
  showTab(TABS[0].id);

  // --- the footer's toast: what just changed many settings, and its Undo
  const toastEl = q('[data-toast]');
  const toastText = q('[data-toast-text]');
  const undoBtn = /** @type {HTMLButtonElement} */ (q('[data-toast-undo]'));
  let undoing = null;
  let toastTimer = 0;
  function quiet() {
    clearTimeout(toastTimer);
    // (Never pulled from under the keyboard: it waits while Undo has the focus.)
    if (document.activeElement === undoBtn) { toastTimer = window.setTimeout(quiet, 2000); return; }
    toastText.textContent = '';
    undoBtn.hidden = true;
    undoing = null;
    toastEl.classList.remove('is-on');
  }
  function toast(text, undo = null) {
    toastText.textContent = text;
    undoBtn.hidden = !undo;
    undoing = undo;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(quiet, 8000);
  }
  /**
   * Many settings changed at once (`tops`: their top keys), as one change: one onChange, the
   * fields shown again, saved at once (`flush`), and an Undo that puts `undo` back the same way.
   * @param {string} what what the toast says @param {string[]} tops
   * @param {(() => void) | null} undo @param {{ flush?: boolean, all?: boolean }} [o]
   */
  function changed(what, tops, undo, { flush = false, all = false } = {}) {
    if (all) fillNow(); else fillFields();
    onChange(tops);
    if (flush) flushSettings();
    toast(what, undo && (() => {
      undo();
      if (all) fillNow(); else fillFields();
      onChange(tops);
      flushSettings();
      toast(`${what}: undone`);
    }));
  }
  /** A bulk button or Reset Section's plan, applied as one change (Undo: its `before`). */
  function commit(plan, what) {
    if (!changes(plan)) { toast(`${what}: already so`); return; }
    applyValues(settings, plan.values);
    changed(what, topKeys(plan.values), () => applyValues(settings, plan.before));
  }
  /** Everything as it was (a preset, a setup or Reset To Defaults undone). */
  const restoreAll = (before) => () => {
    for (const k of Object.keys(settings)) if (!(k in before)) delete settings[k];
    Object.assign(settings, structuredClone(before));
  };

  // --- title cards: a list of { title, subtitle, show }
  const cardsEl = q('[data-cards]');
  function drawCards() {
    cardsEl.innerHTML = cardsMarkup(settings.cards);
    q('[data-card-add]').hidden = settings.cards.length >= 8;
  }
  cardsEl.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const r = t.closest('[data-card]');
    const field = t.dataset.cardField;
    if (!r || !field) return;
    settings.cards[Number(/** @type {HTMLElement} */ (r).dataset.card)][field] = t.value;
    onChange();
  });

  // --- the loop: the library, each in or out (settings.sceneList); drawn again only when it changed
  const scenesEl = q('[data-scene-list]');
  let playing = null;
  let scenesDrawn = '';
  function drawScenes() {
    if (!dialog.open) return; // (drawn as it opens)
    const lib = scenes();
    const sig = `${settings.sceneFrom}|${scenesFrom(lib, settings).map(({ ref, scene }) => `${ref}:${scene.name}:${thumb(ref) ? 1 : 0}:${inLoop(settings, ref) ? 1 : 0}`).join(',')}`;
    if (sig === scenesDrawn) return;
    scenesDrawn = sig;
    scenesEl.innerHTML = sceneListMarkup(lib, settings, { playing, thumb, base });
  }
  scenesEl.addEventListener('change', (e) => {
    const box = /** @type {HTMLInputElement} */ (e.target).closest?.('[data-scene-toggle]');
    if (!(box instanceof HTMLInputElement)) return;
    setInLoop(settings, box.dataset.sceneToggle, box.checked);
    box.closest('[data-scene-row]')?.classList.toggle('is-out', !box.checked);
    scenesDrawn = ''; // (its switch is part of what's drawn)
    onChange('sceneList');
  });

  // --- setups
  const setupsEl = q('[data-setups]');
  const drawSetups = () => { setupsEl.innerHTML = setupsMarkup(Object.keys(readSetups())); };
  const fileInput = /** @type {HTMLInputElement} */ (q('[data-setup-file]'));
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const n = importSetups(await file.text());
      drawSetups();
      search.refresh();
      onNote(n ? `Imported ${n} setup${n === 1 ? '' : 's'}` : 'No setups in that file');
    } catch { onNote('That file isn’t a Bonfire Live setups file'); }
  });

  // --- a field changed
  dialog.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.closest('[data-scene-toggle]')) return; // (the loop's own: its change handler)
    if (t.matches('[data-view-pick]')) {
      settings.view = t.value;
      form.dataset.view = settings.view;
      onChange();
      return;
    }
    const el = /** @type {HTMLInputElement | null} */ (t.closest('[data-set]'));
    if (!el) return;
    const key = el.dataset.set;
    /** @type {any} */
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (NUMERIC.has(key) && v !== RANDOM) v = Number(v);
    // (A port typed in: only a whole number in range; until then, the last good one stands.)
    if (key === 'linkPort' && !(Number.isInteger(v) && v >= 1024 && v <= 65535)) return;
    const group = key.split('.')[0];
    if (AT_LEAST_ONE.has(group) && key.includes('.') && !v && Object.values(settings[group]).filter(Boolean).length <= 1) { el.checked = true; return; }
    setPath(settings, key, v);
    showOutput(key);
    applyDeps();
    markPreset(dialog, settings);
    if (key === 'sceneFrom') drawScenes();
    onChange(group);
  });

  // --- clicks
  const ACTIONS = {
    '[data-settings-close]': () => dialog.close(),
    '[data-keys-open]': () => onKeys(),
    '[data-toast-undo]': () => { const fn = undoing; undoing = null; fn?.(); },
    '[data-show-all]': (/** @type {HTMLElement} */ b) => {
      settings.view = 'all';
      fillFields();
      onChange();
      q(`[data-section="${b.dataset.showAll}"]`)?.scrollIntoView({ block: 'start' });
    },
    '[data-bulk]': (/** @type {HTMLElement} */ b) => {
      if (b.getAttribute('aria-disabled') === 'true') return; // (None, where one has to stay: its tip says why)
      const group = b.dataset.bulkGroup;
      const name = meta('live', group)?.label ?? group;
      commit(bulkPlan(group, b.dataset.bulk, settings), `${name}: ${actionName(b.dataset.bulk)}`);
    },
    '[data-reset-section]': (/** @type {HTMLElement} */ b) => {
      const id = b.dataset.resetSection;
      commit(sectionPlan(id, settings), `${sectionsFor('live').find((s) => s.id === id)?.label ?? id}: Reset`);
    },
    '[data-reset-all]': () => {
      const before = structuredClone(settings);
      resetSettings(settings);
      changed('Every setting is back to its default', Object.keys(settings), restoreAll(before), { flush: true, all: true });
    },
    '[data-preset]': (/** @type {HTMLElement} */ b) => {
      const p = PRESETS[b.dataset.preset];
      const before = structuredClone(settings);
      applyPreset(settings, b.dataset.preset);
      changed(`Preset: ${p.name}`, Object.keys(p.values), restoreAll(before), { flush: true });
      onNote(`Preset: ${p.name}`);
    },
    '[data-card-add]': () => {
      settings.cards.push({ title: '', subtitle: '', show: 'drops' });
      drawCards();
      /** @type {HTMLElement | null} */ (cardsEl.querySelector('[data-card]:last-child input'))?.focus();
      onChange();
    },
    '[data-card-remove]': (/** @type {HTMLElement} */ b) => {
      settings.cards.splice(Number(/** @type {HTMLElement} */ (b.closest('[data-card]')).dataset.card), 1);
      drawCards();
      onChange();
    },
    '[data-card-show]': (/** @type {HTMLElement} */ b) => dialog.dispatchEvent(new CustomEvent('show-card', { detail: Number(/** @type {HTMLElement} */ (b.closest('[data-card]')).dataset.card) + 1 })),
    '[data-scene-play]': (/** @type {HTMLElement} */ b) => { dialog.close(); onPlayScene(b.dataset.scenePlay); },
    '[data-setup-save]': () => {
      const input = /** @type {HTMLInputElement} */ (q('[data-setup-name]'));
      const name = saveSetup(settings, input.value);
      input.value = '';
      drawSetups();
      onNote(`Saved “${name}”`);
      toast(`Saved “${name}”`);
    },
    '[data-setup-load]': (/** @type {HTMLElement} */ b) => {
      const before = structuredClone(settings);
      const set = loadSetup(settings, b.dataset.setupLoad);
      if (!set) return;
      changed(`Loaded “${b.dataset.setupLoad}”`, set, restoreAll(before), { flush: true, all: true });
      onNote(`Loaded “${b.dataset.setupLoad}”`);
    },
    '[data-setup-delete]': (/** @type {HTMLElement} */ b) => {
      const name = b.dataset.setupDelete;
      const kept = readSetups()[name];
      deleteSetup(name);
      drawSetups();
      toast(`Deleted “${name}”`, kept ? () => { saveSetup(kept, name); drawSetups(); } : null);
    },
    '[data-setup-export]': () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([exportSetups()], { type: 'application/json' }));
      a.download = 'bonfire-live-setups.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    '[data-setup-import]': () => fileInput.click(),
  };
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) { dialog.close(); return; }
    const t = /** @type {Element} */ (e.target);
    const tab = /** @type {HTMLElement | null} */ (t.closest('[data-tab]'));
    if (tab) {
      // (While searching every tab with finds shows: a tab goes to its part of the list.)
      if (search.active) q(`[data-tab-panel="${tab.dataset.tab}"]`)?.scrollIntoView({ block: 'start' });
      else showTab(tab.dataset.tab);
      return;
    }
    for (const [sel, run] of Object.entries(ACTIONS)) {
      const b = /** @type {HTMLElement | null} */ (t.closest(sel));
      if (b && dialog.contains(b)) { run(b); return; }
    }
  });

  // --- search
  const search = createLiveSearch({
    dialog,
    settings,
    showTab,
    onKeys,
    dynamic: () => ({
      scenes: scenesFrom(scenes(), settings).map(({ ref, scene }) => ({ ref, name: scene.name, summary: sceneSummary(scene) })),
      cards: settings.cards,
      setups: Object.keys(readSetups()),
      midi: midi(),
      presets: PRESETS,
      keys,
    }),
  });
  dialog.addEventListener('close', () => {
    if (search.active) search.clear();
    quiet();
  });
  // (The fields once now, so they hold the settings even before it first opens.)
  fillFields();

  return {
    fill,
    /**
     * Open the dialog (on `tab`, or the one it was on), the fields filled in; `search`: with
     * the focus in the search box.
     * @param {string} [tab] @param {{ search?: boolean }} [o]
     */
    open(tab, { search: toSearch = false } = {}) {
      if (!dialog.open) dialog.showModal();
      fillNow();
      if (tab) showTab(tab, !toSearch);
      if (toSearch) search.focus();
    },
    /** Draw the loop again (the library changed: a scene saved in the Painter, say). */
    drawScenes() { scenesDrawn = ''; drawScenes(); search.refresh(); },
    /** The scene playing now (its row is marked), or null for the free show. */
    markScene(ref) {
      if (ref === playing) return;
      playing = ref ?? null;
      for (const r of scenesEl.querySelectorAll('[data-scene-row]')) {
        const on = r.getAttribute('data-scene-row') === playing;
        r.classList.toggle('is-playing', on);
        if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current');
      }
    },
    /** A line of status under the Beat From setting (the Link bridge's state). */
    set linkStatus(text) { q('[data-link-status]').textContent = text; },
    /** Open the dialog on a setting's row (a settings key, or a group's item: 'looks.echo'), shown and focused. */
    reveal(key) {
      if (!dialog.open) this.open();
      return search.reveal(key);
    },
    /** Open the dialog filtered to `query`. */
    search(query) {
      if (!dialog.open) this.open();
      search.run(query);
    },
  };
}
