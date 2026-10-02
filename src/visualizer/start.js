// Bonfire Live's start screen: the sound sources (a file picked or dropped anywhere on the
// page), the presets (a kind of night in one click), the error line, and the way between it
// and the show (goLive, showStart). While it's up the fire moves aside for the menu
// (frameFire).
import { q, qa } from '../ui/shell.js';
import { wieldLabel } from './hud.js';
import { applyPreset, PRESETS, flushSettings } from './settings.js';

/**
 * The start screen's part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createStart(ctx) {
  const { settings } = ctx;
  const start = q('[data-start]');
  const hud = q('[data-hud]');
  const live = q('[data-live]');
  const errorEl = q('[data-error]');
  const settingsDialog = q('[data-settings]');

  // --- Start screen ----------------------------------------------------------------------------
  const fileInput = q('[data-file]');
  qa('[data-source]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.source === 'file') fileInput.click();
      else ctx.useSource(btn.dataset.source);
    });
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) ctx.useSource('file', { file });
  });
  // Drop a file anywhere.
  window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|aac|m4a|ogg|opus|aiff?)$/i.test(f.name));
    if (!file) return;
    e.preventDefault();
    ctx.useSource('file', { file });
  });
  if (navigator.mediaDevices?.enumerateDevices) ctx.listDevices();

  // On the start screen the fire moves aside for the menu: to its right on a landscape
  // screen (further on a narrower one, where the menu takes more of it), above it on a tall one.
  function frameFire() {
    if (!ctx.director) return;
    const menu = document.body.dataset.mode === 'start';
    const side = innerWidth >= 760 && innerWidth > innerHeight;
    ctx.director.frame(menu && side ? (innerWidth >= 1100 ? 0.2 : 0.36) : 0, menu && !side ? 0.24 : 0);
  }
  window.addEventListener('resize', frameFire);

  function showError(text) { errorEl.textContent = text; errorEl.hidden = false; }
  function hideError() { errorEl.hidden = true; }

  function showStart(message) {
    document.body.dataset.mode = 'start';
    start.hidden = false;
    hud.hidden = true;
    if (settingsDialog.open) settingsDialog.close();
    if (message) showError(message);
    frameFire();
    q('#viz-title').focus({ preventScroll: true });
  }
  function goLive() {
    document.body.dataset.mode = 'live';
    start.hidden = true;
    hud.hidden = false;
    const s = ctx.engine.source;
    q('[data-source-name]').textContent = `${{ input: 'Line in', capture: 'Shared audio', file: 'File', demo: 'Demo' }[s.kind]}: ${s.name}`;
    q('[data-transport]').hidden = !s.media;
    q('[data-track]').textContent = s.media ? s.name : '';
    q('[data-volume-row]').hidden = !s.playback;
    if (ctx.fire) q('[data-wield]').textContent = wieldLabel({ weapon: ctx.fire.weapon, flame: ctx.fire.flame, element: ctx.fire.element });
    live.textContent = `Listening to ${s.name}.`;
    frameFire();
    ctx.keepAwake();
    ctx.wake();
  }

  // The start screen's presets: a kind of night in one click, before the music starts.
  q('[data-feel]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    applyPreset(settings, b.dataset.preset);
    ctx.applySettings(Object.keys(PRESETS[b.dataset.preset].values));
    flushSettings();
    ctx.note(`Preset: ${PRESETS[b.dataset.preset].name}`, 1.5);
  });

  return { frameFire, showError, hideError, showStart, goLive };
}
