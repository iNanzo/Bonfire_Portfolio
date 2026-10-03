// Bonfire Live's two dialogs: the settings (settingsDialog.js draws and binds them; this is
// what a change does to the show, a render setting from the P menu included) and the
// keyboard shortcuts (?, the shared keys overlay). Each gives the focus back to what had it
// when it opened.
import { q } from '../ui/shell.js';
import { saveSettings } from './settings.js';
import { markPreset, bindSettings } from './settingsDialog.js';
import { modeOf } from './looks.js';
import { keyList, KEY_GROUPS } from './keys.js';
import { createKeysOverlay } from '../ui/keysOverlay.js';
import { focusedNow } from '../ui/focus.js';

/**
 * The dialogs' part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createDialogs(ctx) {
  const { settings } = ctx;
  const start = q('[data-start]');
  const settingsDialog = q('[data-settings]');

  // --- Settings dialog (settingsDialog.js) ---------------------------------------------------------
  // Settings the scene is built with (particle counts size its buffers; the fireflies' trails
  // are made with it): changing one rebuilds it.
  const REBUILD = ['particles', 'trails'];
  const builtWith = () => REBUILD.map((k) => String(settings[k])).join();
  let built = builtWith();
  let rebuildTimer = 0;
  /** A render setting changed (the P menu): only the picture, the rest of the show as it is. */
  function applyRender() {
    ctx.director?.applyRender();
    saveSettings(settings);
    markPreset(start, settings);
    settingsPanel.fill(); // (only while the dialog is open: it fills as it opens)
  }
  /**
   * A setting changed (`key`: the one, or the ones a preset or a setup changed): one the scene
   * is built with rebuilds it; the rest apply at once. What you touch by hand wins over the
   * preset scene playing, until the next one; while a scene holds, the place and the shot stay
   * its own unless it's them you changed.
   */
  function applySettings(key) {
    const keys = [key].flat().filter((k) => typeof k === 'string');
    if (keys.length) ctx.director?.releaseScene(keys.includes('xray') ? [...keys, 'xrayView'] : keys);
    if (builtWith() !== built) {
      built = builtWith();
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(ctx.startScene, 200);
    }
    if (ctx.engine) ctx.engine.monitor.gain.value = settings.volume;
    ctx.applyFrameRate();
    ctx.applyStats();
    ctx.director?.applyRender();
    const held = !!ctx.director?.sceneRef;
    if (settings.scenery !== 'mix' && (!held || keys.includes('scenery'))) ctx.fire?.setScenery(settings.scenery);
    if (!held || keys.includes('shot')) ctx.director?.setShot(settings.shot);
    // Scenes switched off: back to the free show now (a solo from the Painter stays).
    if (keys.includes('scenes') && modeOf(settings.scenes) === 'off' && held && !ctx.solo)
      ctx.playScene(null, { instant: !ctx.engine?.source });
    if (keys.some((k) => k === 'sceneFrom' || k === 'sceneList')) ctx.drawChips();
    saveSettings(settings);
    markPreset(start, settings);
    ctx.showScene();
  }
  const settingsPanel = bindSettings(settingsDialog, settings, {
    onChange: applySettings,
    onNote: (text) => ctx.note(text, 1.5),
    scenes: ctx.library,
    thumb: (ref) => ctx.store.thumb(ref),
    onPlayScene: (ref) => {
      const entry = ctx.findScene(ref);
      if (!entry) return;
      if (document.body.dataset.mode !== 'live') ctx.firstScene = entry;
      ctx.playScene(entry, { instant: document.body.dataset.mode !== 'live' });
    },
    base: import.meta.env.BASE_URL,
    midi: () => ctx.midiNames,
    keys: keyList(),
    onKeys: () => openKeys(),
  });

  // --- The keyboard shortcuts (?): every key, in groups (keys.js) -------------------------------
  const keysOverlay = createKeysOverlay({ title: 'Keyboard Shortcuts', groups: KEY_GROUPS });
  let keysOpener = null;
  function openKeys() {
    keysOpener = focusedNow();
    keysOverlay.open();
  }
  /**
   * A dialog closing with focus inside it gives focus back to what had it as it opened (the
   * browser gives it back only to an element: opened from the page itself, a closed dialog's
   * field would keep the focus a moment, and the next key would count as typing in it).
   * @param {HTMLDialogElement} dialog @param {() => Element | null} opener
   */
  function handBackFocus(dialog, opener) {
    dialog.addEventListener('close', () => {
      const a = /** @type {HTMLElement | null} */ (document.activeElement);
      if (!a || !dialog.contains(a)) return;
      const to = /** @type {HTMLElement | null} */ (opener());
      if (to?.isConnected && to.getClientRects().length) to.focus({ preventScroll: true });
      else a.blur();
    });
  }
  handBackFocus(keysOverlay.el, () => keysOpener);
  handBackFocus(settingsDialog, () => settingsOpener);

  settingsDialog.addEventListener('show-card', (e) => {
    settingsDialog.close();
    ctx.showCard(e.detail);
  });

  /** Open the settings (on `tab`; `search`: with the focus in their search box). */
  let settingsOpener = null;
  function openSettings(tab, { search = false } = {}) {
    if (!settingsDialog.open) settingsOpener = focusedNow();
    settingsPanel.open(tab, { search });
    ctx.wake();
  }

  return { settingsPanel, keysOverlay, applySettings, applyRender, openSettings, openKeys };
}
