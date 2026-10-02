// Bonfire Live's preset scenes: the library (the site's built-in scenes and this browser's
// own, made in the Painter), playing one, naming the one playing everywhere it shows (the
// HUD's line, the start screen's chips, the Scenes tab, the solo note), N and Shift+N, and a
// small picture of each built-in one for its row in the loop. main.js makes this part once
// the markup is in; the other parts reach it through ctx (context.js).
import { q } from '../ui/shell.js';
import { createSceneStore, THUMB_MAX } from '../sceneStore.js';
import { effects } from '../effects.js';
import * as siteContent from '../content.js';
import { normalizeScene, sceneRef, parseRef, sceneSwatches } from '../scenes.js';
import { scenesFrom, inLoop } from './settings.js';
import { modeOf } from './looks.js';
import { esc } from '../html.js';

/**
 * The preset scenes' part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createScenesUi(ctx) {
  const { settings } = ctx;
  const live = q('[data-live]');

  // --- Preset scenes: the library -------------------------------------------------------------
  // The site's built-in scenes (content.json, stored normalized; hidden ones are out of the
  // loop but still play by their ref) and this browser's own, made in the Painter. Entries are
  // { ref: 'b:<id>' | 'm:<id>', scene }; the library is read again when the store changes.
  const store = createSceneStore({ voidHex: effects.colors?.void });
  const builtIns = (siteContent.scenes ?? []).map((s) => normalizeScene(s, { voidHex: effects.colors?.void }));
  let libraryCache = null;
  /** Every scene, the built-in ones first (hidden ones left out). */
  function library() {
    libraryCache ??= [
      ...builtIns.filter((s) => !s.hidden).map((scene) => ({ ref: sceneRef('b', scene.id), scene })),
      ...store.list().map((scene) => ({ ref: sceneRef('m', scene.id), scene })),
    ];
    return libraryCache;
  }
  /**
   * The library the loop plays from (Scenes From; its in-or-out switches are the loop's): the
   * same list until the library or Scenes From changes (the HUD asks ten times a second).
   */
  let loopCache = { of: null, from: '', list: [] };
  function loopLibrary() {
    const all = library();
    if (loopCache.of !== all || loopCache.from !== settings.sceneFrom) loopCache = { of: all, from: settings.sceneFrom, list: scenesFrom(all, settings) };
    return loopCache.list;
  }
  /** A scene by its ref (a hidden built-in one too), or null. */
  function findScene(ref) {
    const { source, id } = parseRef(ref);
    const scene = source === 'b' ? builtIns.find((s) => s.id === id) : source === 'm' ? store.get(id) : null;
    return scene ? { ref: sceneRef(source, id), scene } : null;
  }

  // --- Preset scenes: playing one, naming it, the start screen's chips --------------------------
  const sceneLine = q('[data-scene-line]');
  const sceneNameEl = q('[data-scene-name]');
  const chipsEl = q('[data-scene-chips]');
  const soloEl = q('[data-solo]');
  const SCENE_SWITCH = { off: 'Off (the show plays free)', mix: 'In the Mix', on: 'Always' };

  /**
   * Play a scene: at once (`instant`: behind the start menu, a rebuilt scene), or while the
   * music plays on its next downbeat, in a flash. `lock`: only this one until N (the Painter's
   * solo); any other pick ends a solo. Null: back to the free show. The loop carries on from it.
   */
  function playScene(entry, { instant = false, lock = false } = {}) {
    if (!ctx.director) return;
    ctx.director.scene(entry, { instant, flash: !instant, onBeat: !instant });
    const next = lock && entry ? entry.ref : null;
    if (next !== ctx.solo || lock) ctx.director.lockScene(next);
    ctx.solo = next;
    showScene();
  }

  /** The director says a scene arrived ({ name, ref }; no name: the free show again). */
  function sceneArrived({ name = null, ref = null } = {}) {
    showScene();
    if (!name || !ctx.engine?.source) return;
    ctx.note(`Scene: ${name}`, 2);
    live.textContent = `Scene: ${name}.`;
    const cards = modeOf(settings.sceneCards, 'off');
    if (cards === 'on' || (cards === 'mix' && Math.random() < 0.5)) ctx.showCard({ title: name, scene: true }, { ms: 2600 });
    if (ref) keepThumb(ref);
  }

  let named = '';
  /** Where a solo scene came from, for the HUD: one of mine from the Painter, a built-in on its own. */
  const soloFrom = (ref) => (ref.startsWith('m:') ? 'from the Painter' : 'on its own');

  /** The scene playing, everywhere it shows: the HUD's line, the chips, the Scenes tab, the solo note. */
  function showScene() {
    const ref = ctx.director?.sceneRef ?? null;
    const name = ctx.director?.sceneName ?? null;
    const some = loopLibrary().length > 0;
    const key = `${ref}|${name}|${ctx.solo}|${modeOf(settings.scenes)}|${some}`;
    if (key === named) return;
    named = key;
    // (The line shows while one plays, or while scenes are on and there are some: the free
    // show in between says so.)
    sceneLine.hidden = !name && (modeOf(settings.scenes) === 'off' || !some);
    sceneLine.classList.toggle('is-free', !name);
    sceneLine.classList.toggle('is-solo', !!ctx.solo);
    sceneNameEl.textContent = name ? `${name}${ctx.solo ? ` · ${soloFrom(ctx.solo)}` : ''}` : 'The Free Show';
    for (const c of chipsEl.querySelectorAll('[data-scene-chip]')) c.setAttribute('aria-pressed', String(c.dataset.sceneChip === ref));
    ctx.settingsPanel.markScene(ref);
    soloEl.hidden = !(ctx.solo && name);
    soloEl.textContent = ctx.solo && name ? `Playing “${name}” ${soloFrom(ctx.solo)}. N: back to the loop.` : '';
  }

  /** The start screen's chips: up to 8 scenes (the loop's first), then All Scenes…. */
  function drawChips() {
    const list = loopLibrary();
    const ordered = [...list.filter((e) => inLoop(settings, e.ref)), ...list.filter((e) => !inLoop(settings, e.ref))];
    const shown = ordered.slice(0, 8);
    // (The one playing always has its chip: a hidden built-in, say, from ?scene=.)
    const playing = ctx.director?.sceneRef ? findScene(ctx.director.sceneRef) : ctx.firstScene;
    if (playing && !shown.some((e) => e.ref === playing.ref)) shown.splice(7, 1, playing);
    chipsEl.hidden = !shown.length;
    chipsEl.innerHTML = shown.length ? `
      <span class="viz-group-label">Scenes</span>
      ${shown.map(({ ref, scene }) => {
        const sw = sceneSwatches(scene).slice(0, 5);
        return `<button class="pix-btn viz-preset viz-scene-chip" type="button" data-scene-chip="${esc(ref)}" aria-pressed="${ref === playing?.ref}" style="${sw.map((c, i) => `--sw${i}:${esc(c)}`).join(';')}"><span class="viz-chip-swatches" aria-hidden="true">${sw.map(() => '<i></i>').join('')}</span><b>${esc(scene.name)}</b></button>`;
      }).join('')}
      <button class="pix-btn viz-preset viz-scene-chip viz-scenes-all" type="button" data-scenes-all><b>All Scenes…</b></button>` : '';
    named = '';
    showScene();
  }
  chipsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-scenes-all]')) { ctx.openSettings('scenes'); return; }
    const chip = e.target.closest('[data-scene-chip]');
    if (!chip) return;
    // A click plays it behind the menu (and it opens the show); again: the free show.
    const entry = chip.getAttribute('aria-pressed') === 'true' ? null : findScene(chip.dataset.sceneChip);
    ctx.firstScene = entry;
    playScene(entry, { instant: true });
  });
  sceneLine.addEventListener('click', () => ctx.openSettings('scenes'));

  let atDropFor = null; // the ref of the scene N asked for in a breakdown, waiting for the drop's strike
  /** N: the next scene (at once behind the start menu; live, on the next downbeat in a flash). */
  function nextScene() {
    if (!ctx.director) return;
    if (document.body.dataset.mode !== 'live') {
      const inLoopNow = loopLibrary().filter((e) => inLoop(settings, e.ref));
      const list = inLoopNow.length ? inLoopNow : loopLibrary();
      if (!list.length) { live.textContent = 'No scenes yet: make one in the Painter.'; return; }
      const next = list[(list.findIndex((e) => e.ref === ctx.director.sceneRef) + 1) % list.length];
      ctx.firstScene = next;
      playScene(next, { instant: true });
      live.textContent = `Scene: ${next.scene.name}.`;
      return;
    }
    // (Out of a solo too: the loop again. With a blade held for the drop, it waits for the
    // drop's strike: the note says so, and the HUD's line keeps saying so until it lands.)
    const next = ctx.director.nextScene();
    ctx.solo = null;
    const atDrop = !!next && ctx.director.sceneWhen === 'drop';
    atDropFor = atDrop ? next.ref : null;
    ctx.note(next ? `Next scene: ${next.scene.name}${atDrop ? ', at the drop' : ''}` : 'No scenes yet: make one in the Painter', atDrop ? 3 : 1.8);
    showScene();
  }
  /**
   * The name of the scene N asked for while it waits for the drop's strike (null once it has
   * landed, or something else is coming instead), for the HUD's line.
   */
  function waitingForDrop() {
    const up = ctx.director?.upNext;
    if (atDropFor && (ctx.director?.sceneWhen !== 'drop' || typeof up !== 'object' || up?.ref !== atDropFor)) atDropFor = null;
    return atDropFor && typeof up === 'object' ? up?.scene?.name ?? null : null;
  }
  /** Shift+N: Scenes in the mix → always → off. */
  function cycleScenes() {
    const order = ['mix', 'on', 'off'];
    settings.scenes = order[(order.indexOf(modeOf(settings.scenes)) + 1) % order.length];
    ctx.settingsPanel.fill();
    ctx.applySettings('scenes');
    ctx.note(`Preset Scenes: ${SCENE_SWITCH[settings.scenes]}`, 1.5);
  }

  /**
   * The first time a built-in scene plays live, keep a small picture of it for its row in the
   * loop (192×108 WebP, in the scene store; the Painter keeps one for each of yours): 2.5 s in
   * (it has settled), if it's still the one playing. The scene copies it from its own texels
   * straight to that size (fire.captureThumb), when the page has a moment (idle time). Called
   * when a scene arrives live and when the music starts (the scene it opens on).
   */
  const thumbing = new Set(); // (refs with a picture on its way)
  const whenIdle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 0));
  function keepThumb(ref) {
    if (!ref.startsWith('b:') || store.thumb(ref) || !ctx.fire?.captureThumb || thumbing.has(ref)) return;
    thumbing.add(ref);
    setTimeout(() => whenIdle(async () => {
      thumbing.delete(ref);
      if (ctx.director?.sceneRef !== ref || !ctx.fire || document.body.dataset.mode !== 'live') return;
      try {
        const url = await ctx.fire.captureThumb(192, 108);
        if (url?.startsWith('data:image/webp') && url.length <= THUMB_MAX) store.setThumb(ref, url);
      } catch { /* no picture this time */ }
    }), 2500);
  }

  // The library changes when a Painter tab saves (or deletes) a scene; and a Painter can hand
  // one over to play now ("Play in Bonfire Live").
  store.onChange(() => {
    libraryCache = null;
    ctx.settingsPanel.drawScenes();
    drawChips();
  });
  store.onPlay((ref) => {
    const entry = findScene(ref);
    if (!entry || !ctx.director) return false;
    playScene(entry, { instant: document.body.dataset.mode !== 'live' });
    if (document.body.dataset.mode !== 'live') ctx.firstScene = entry;
    ctx.note(`Playing “${entry.scene.name}” from the Painter`, 2.5);
    return true;
  });

  return { store, library, loopLibrary, findScene, playScene, sceneArrived, showScene, drawChips, nextScene, waitingForDrop, cycleScenes, keepThumb };
}
