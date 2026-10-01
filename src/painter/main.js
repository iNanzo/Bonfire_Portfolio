// The Bonfire Painter (/painter/): a scene editor for Bonfire Live. Paint a scene (where the
// fire burns and what's in it, its colors, the framing and its move, a look with its layers
// and their details, the drops, the render, the knights, the fireflies), watch it play to a
// silent beat, save it, and play it in Bonfire Live, which loops through scenes like it.
//
//   stage     the same bonfire and director as Bonfire Live (createBonfire with the effects
//             layer, createDirector), the scene held on it by Bonfire Live's own scene
//             player (director.scene: visualizer/scenePlayer.js), so what's painted is what
//             plays. An edit re-applies only the part it changed (a Glow Size slider keeps
//             the rolled grain). The camera is framed by hand on the stage (cameraRig.js).
//   panel     every part of the scene, in sections (panel.js). Hovering a look, a flame, a
//             shot or a layer's switch auditions it on the stage; a click keeps it.
//   preview   Still (silence: the look at its painted strength, the framing held), Beat (a
//             silent 124 BPM groove), Drop Loop (a silent 16 bars: groove, breakdown, build,
//             drop) or the Demo Track (Bonfire Live's, with sound). beat.js makes the silent
//             ones up. Hovering a look bursts it once, so even a look that lives on the beat
//             shows in silence.
//   history   every edit is an undo step (a slider's drag is one): Ctrl+Z, Ctrl+Shift+Z.
//   saving    the scene autosaves as a draft (and at once when the tab is hidden or
//             closed); Save (Ctrl+S) keeps it in My Scenes with a thumbnail (sceneStore.js,
//             this browser); the library (L) opens, duplicates, renames, deletes, imports
//             and exports them (opening another over unsaved changes asks first); built-in
//             scenes open read-only and save as copies. Play in Bonfire Live hands it to an
//             open Bonfire Live tab or opens one playing it.
//   loading   ?scene=m:<id> (mine), ?scene=b:<id> (built-in), #scene=<base64url> (the
//             admin's Open in Painter: a banner offers to save it, or copy its JSON back).
//             A link to the scene the draft has unsaved changes to brings the draft back
//             (a reload); a link to another sets the unsaved draft aside, and a banner
//             offers it back until it's restored or discarded.
//   keys      H the panel, L the library, P the render menu (bound to the scene), I the
//             pack (it paints into the scene), F full screen, Space the beat, D a drop,
//             C a picture of the stage, and the camera's (cameraRig.js); / searches the
//             panel and ? lists them all (toolbar.js PAINTER_KEYS). The Tools menu in the
//             bar reaches the ones only a key did before (Render Settings, Pack, Capture,
//             Full Screen, the keys).
// Reduced motion: the Still preview to start with.
import '../styles.css';
import '../visualizer/visualizer.css';
import './painter.css';
import { applyCssPalette, base, flames, rotation } from '../palette.js';
import { effects } from '../effects.js';
import { scenes as builtInScenes, site, startingEquipment, ui, weapons } from '../content.js';
import { elements, elementOr } from '../elements.js';
import { installDitherPatterns } from '../ui/dither.js';
import { installTooltips } from '../ui/tooltip.js';
import { createKeysOverlay, isHelpKey } from '../ui/keysOverlay.js';
import { searchBoxMarkup } from '../ui/settingsSearch.js';
import { typing } from '../ui/shell.js';
import { applyFlame, setAccentRamp } from '../ui/theme.js';
import { esc } from '../html.js';
import { logoMark } from '../ui/logo.js';
import { createDiscoveries } from '../ui/discoveries.js';
import { createRenderMenu } from '../ui/renderMenu.js';
import { createPack, bonfireItems } from '../ui/pack.js';
import { createDirector, DEFAULT_SETTINGS } from '../visualizer/director.js';
import { SHOTS } from '../visualizer/camera.js';
import { createAnalyser } from '../visualizer/analyser.js';
import { createDemo } from '../visualizer/demo.js';
import { densityCounts } from '../visualizer/density.js';
import { FLAME_FPS, FOGS, PALETTES, PIXEL_SIZES, RENDER_STEPS, XRAY_VIEWS, renderText } from '../visualizer/render.js';
import { LAYER_DETAILS, LAYERS, LOOK_PARAMS } from '../visualizer/looks.js';
import { defaultScene, decodeSceneHash, normalizeScene, parseRef, sceneRef, uniqueSceneId } from '../scenes.js';
import { createSceneStore } from '../sceneStore.js';
import { harmoniousFlame, harmoniousScene, hexToOklch, suggestFlames, suggestScenes, vividScene, wildFlame, wildScene } from '../paletteGen.js';
import { bindPanel, flameChips, getPath, sceneryChips, withPath } from './panel.js';
import { createPanelSearch } from './panelSearch.js';
import { bindTools, PAINTER_KEYS, toolsMarkup } from './toolbar.js';
import { createHistory } from './history.js';
import { createBeatFeed, silentFrame } from './beat.js';
import { createCameraRig } from './cameraRig.js';
import { createLibrary, downloadJson } from './library.js';
import { captureThumb } from './thumbs.js';

// Finding the Painter is one of the site's discoveries (counted when you're back on the site).
createDiscoveries().discover('painter');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const DRAFT = 'bonfire-painter-draft';
/** A draft with unsaved changes that a link to another scene took the place of. */
const DRAFT_ASIDE = 'bonfire-painter-draft-aside';
/** Bonfire Live's tab, by name: Play finds the one it opened. */
const LIVE_TAB = 'bonfire-live';
/** Which of the panel's sections are open, kept for the next visit. */
const PANEL_KEY = 'bonfire-painter-panel';
const BASE_URL = import.meta.env.BASE_URL;
const voidHex = effects.colors.void;
const siteBase = { ...base }; // (the site's own scenery colors, before a scene recolors them)
/** How big a move is when it starts from Still with none (a new scene's). */
const MOVE_AMOUNT = defaultScene().camera.move.amount;

document.documentElement.classList.add('js');
applyCssPalette();
applyFlame(startingEquipment.flame);
installDitherPatterns(base);
const tips = installTooltips();

// --- The scene being painted --------------------------------------------------------------
const store = createSceneStore({ voidHex });
/** Bonfire Live's built-in scenes (content.json), read-only here. */
const builtIns = () => (Array.isArray(builtInScenes) ? builtInScenes : []).map((s) => normalizeScene(s, { voidHex }));
const steps = createHistory({ limit: 150 });
let scene = defaultScene('New Scene');
let ref = null;       // 'm:<id>' saved in My Scenes, 'b:<id>' a built-in as it came, null: not saved
let origin = null;    // the ref it was opened from (kept when painting a built-in makes it a copy)
let dirty = false;    // changed since it was saved (or opened)
let edits = 0;        // every change to the scene on the stage (a thumbnail taken after one is dropped)
let fromAdmin = false;
let restored = false; // the draft's unsaved changes came back over a link to their scene
let auditionScene = null;

/** A ref as kept ('m:…' or 'b:…'), or null. */
const refOr = (r) => (typeof r === 'string' && parseRef(r).source ? r : null);
/** The draft in `key` (its scene normalized), or null. */
function readDraft(key = DRAFT) {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!d || typeof d !== 'object' || !d.scene) return null;
    return { scene: normalizeScene(d.scene, { voidHex }), ref: refOr(d.ref), origin: refOr(d.origin) ?? refOr(d.ref), dirty: !!d.dirty };
  } catch { return null; }
}
function writeDraftTo(key, d) {
  try {
    if (d) localStorage.setItem(key, JSON.stringify({ v: 2, scene: d.scene, ref: d.ref, origin: d.origin, dirty: d.dirty }));
    else localStorage.removeItem(key);
  } catch { /* private mode: no draft */ }
}
let draftTimer = 0;
/** Write the draft now (a change waiting to be written, or the page going away). */
function writeDraft() {
  clearTimeout(draftTimer);
  draftTimer = 0;
  writeDraftTo(DRAFT, { scene, ref, origin, dirty });
}
/** The draft follows the scene (written a moment after the last change). */
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(writeDraft, 300);
}
// Closing the tab, reloading or switching away writes what's waiting at once. (Only what's
// waiting: a Painter left in another tab doesn't write over this one's draft.)
window.addEventListener('pagehide', () => { if (draftTimer) writeDraft(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && draftTimer) writeDraft(); });

/** Whether a scene is a new one no one has painted on yet (nothing to lose). */
const pristine = (s) => JSON.stringify(s) === JSON.stringify(normalizeScene(defaultScene('New Scene'), { voidHex }));
/** A draft whose changes would be lost if another scene took its place. */
const unsavedWork = (d) => !!d && d.dirty && !pristine(d.scene);
let aside = readDraft(DRAFT_ASIDE);
/** Keep an unsaved draft that a link is taking the place of (the banner offers it back). */
function setAside(d) {
  if (!unsavedWork(d)) return;
  aside = d;
  writeDraftTo(DRAFT_ASIDE, d);
}

/**
 * Where the Painter starts: the URL's scene (or the draft's unsaved changes to it), else
 * the draft, else a new one. A link to another scene sets the draft's unsaved work aside.
 */
function startingScene() {
  const params = new URLSearchParams(location.search);
  const draft = readDraft();
  const hash = location.hash.startsWith('#scene=') ? decodeSceneHash(location.hash, { voidHex }) : null;
  if (hash) {
    fromAdmin = true;
    setAside(draft);
    return { scene: hash, ref: null, origin: null, dirty: true };
  }
  const { source, id } = parseRef(params.get('scene'));
  if (source) {
    const want = sceneRef(source, id);
    // (A reload, or a link back to what's being painted: the unsaved changes, not the saved scene.)
    if (unsavedWork(draft) && (draft.ref === want || draft.origin === want)) { restored = true; return draft; }
    const s = source === 'm' ? store.get(id) : builtIns().find((b) => b.id === id);
    if (s) {
      setAside(draft);
      return { scene: s, ref: want, origin: want, dirty: false };
    }
  }
  if (draft) return draft;
  return { scene: defaultScene('New Scene'), ref: null, origin: null, dirty: true };
}
({ scene, ref, origin, dirty } = startingScene());

// --- Markup ---------------------------------------------------------------------------------
const PREVIEWS = [
  ['still', 'Still', 'Still', 'Silence: the look at its painted strength, the framing held still, the knights resting.'],
  ['beat', 'Beat', 'Beat', 'A silent 124 BPM groove: the scene as it plays on the music (Space).'],
  ['drop', 'Drop Loop', 'Drop', 'A silent 16 bars: groove, breakdown, build, and the drop landing in the scene.'],
  ['demo', 'Demo Track', 'Demo', 'Bonfire Live’s demo track, with sound.'],
];
/** The panel's sections left open last time (the page's own: a scene doesn't keep them). */
function readOpen() {
  try {
    const open = JSON.parse(localStorage.getItem(PANEL_KEY) ?? 'null');
    return Array.isArray(open) && open.every((id) => typeof id === 'string') ? open : ['place'];
  } catch { return ['place']; }
}
function saveOpen(open) {
  try { localStorage.setItem(PANEL_KEY, JSON.stringify(open)); } catch { /* private mode: not kept */ }
}
/** A label with a shorter one for phones. */
const label = (long, short) => (short === long ? esc(long) : `<span class="pnt-long">${esc(long)}</span><span class="pnt-short">${esc(short)}</span>`);
const app = document.getElementById('painter');
app.innerHTML = `
  <div class="stage viz-stage pnt-stage" data-stage></div>
  <header class="pnt-bar" data-bar>
    <a class="brand pnt-home" href="${esc(BASE_URL)}" aria-label="${esc(site.name)}: back to the portfolio">${logoMark('brand-mark')}</a>
    <div class="pnt-title">
      <span class="pnt-app">Bonfire Painter</span>
      <label class="pnt-name"><span class="visually-hidden">Scene name</span><input type="text" data-name maxlength="40" spellcheck="false" autocomplete="off"></label>
      <span class="pnt-dot" data-saved role="status"></span>
    </div>
    <div class="pnt-bar-group">
      <button type="button" class="pix-btn" data-cmd="library" aria-keyshortcuts="L"><kbd>L</kbd>Library</button>
      <button type="button" class="pix-btn" data-cmd="save" aria-keyshortcuts="Control+S">Save</button>
      <button type="button" class="pix-btn pnt-icon" data-cmd="undo" aria-label="Undo (Ctrl+Z)" aria-keyshortcuts="Control+Z" data-tip="Undo the last change (Ctrl+Z)">↶</button>
      <button type="button" class="pix-btn pnt-icon" data-cmd="redo" aria-label="Redo (Ctrl+Shift+Z)" aria-keyshortcuts="Control+Shift+Z Control+Y" data-tip="Redo what was undone (Ctrl+Shift+Z or Ctrl+Y)">↷</button>
      ${toolsMarkup()}
    </div>
    <div class="pnt-bar-group pnt-preview" role="group" aria-label="Preview">
      ${PREVIEWS.map(([id, name, short, hint]) => `<button type="button" class="pix-btn" data-preview="${id}" aria-pressed="false" aria-label="${esc(name)}" aria-describedby="pnt-pv-${id}" data-tip="${esc(hint)}" data-tip-side="bottom">${label(name, short)}</button><span class="visually-hidden" id="pnt-pv-${id}">${esc(hint)}</span>`).join('')}
      <span class="pnt-beat" aria-hidden="true" data-beat><i></i><i></i><i></i><i></i><b data-beat-label></b></span>
    </div>
    <div class="pnt-bar-group">
      <button type="button" class="pix-btn pnt-play" data-cmd="play" aria-label="Play in Bonfire Live (opens it)" data-tip="Plays this scene in Bonfire Live: an open Bonfire Live tab at once, else a new one. Changes are saved first." data-tip-side="bottom">${label('Play in Bonfire Live ↗', 'Play ↗')}</button>
      <button type="button" class="pix-btn" data-cmd="panel" aria-keyshortcuts="H" aria-controls="pnt-panel" aria-expanded="true"><kbd>H</kbd><span data-panel-label>Hide Panel</span></button>
    </div>
  </header>
  <div class="pnt-banners">
    <div class="pnt-banner" data-banner hidden>
      <p>Opened from the admin. Save it here, or copy its JSON back into the admin’s Scenes page (Import From Painter).</p>
      <button type="button" class="pix-btn" data-cmd="banner-save">Save to My Scenes</button>
      <button type="button" class="pix-btn" data-cmd="banner-copy">Copy JSON for the Admin</button>
      <button type="button" class="pix-btn pnt-icon" data-cmd="banner-close" aria-label="Close" data-tip="Close this note (the scene stays as it is)">✕</button>
    </div>
    <div class="pnt-banner" data-aside hidden>
      <p data-aside-text></p>
      <button type="button" class="pix-btn" data-cmd="aside-restore" data-aside-restore></button>
      <button type="button" class="pix-btn pnt-danger" data-cmd="aside-discard">Discard It</button>
    </div>
  </div>
  <aside class="pnt-panel frame" id="pnt-panel" data-panel aria-label="Scene">
    <div class="pnt-panel-head">
      ${searchBoxMarkup({ id: 'pnt-search', label: 'Search the Scene’s Settings', placeholder: 'Search settings  /' })}
      <div class="pnt-search-notes" data-search-notes hidden></div>
    </div>
    <div class="pnt-panel-body" data-panel-body></div>
  </aside>
  <div class="pnt-lib" data-library></div>
  <p class="pnt-toast" role="status" aria-live="polite" data-note></p>
  <p class="viz-error pnt-error" role="alert" data-error hidden></p>
`;
const stage = q('[data-stage]');
const panelEl = q('[data-panel]');
const panelBody = /** @type {HTMLElement} */ (q('[data-panel-body]'));
const nameInput = /** @type {HTMLInputElement} */ (q('[data-name]'));
const noteEl = q('[data-note]');
let noteTimer = 0;
/** A note at the stage's corner for a moment (`link`: one to click in it, and it waits longer). */
function note(text, seconds = 2.4, link = null) {
  noteEl.textContent = text;
  noteEl.classList.toggle('has-link', !!link);
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = link.text;
    a.addEventListener('click', () => noteEl.classList.remove('is-on'));
    noteEl.append(' ', a);
  }
  noteEl.classList.add('is-on');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => noteEl.classList.remove('is-on'), seconds * 1000);
}

// --- The bonfire and the show ----------------------------------------------------------------
// The show's own settings under the scene: Bonfire Live's defaults, without what would take
// the painting away (the living blade, phrase swaps, the scene loop).
const settings = { ...structuredClone(DEFAULT_SETTINGS), combos: -1, phraseBars: 0, scenes: 'off', title: '', colors: 'site', sceneColors: 'off' };
// As many particles as Bonfire Live at its default (density.js): the counts size the scene's buffers.
{
  const counts = densityCounts({ particles: effects.particles, fireflies: effects.fireflies }, settings.particles);
  Object.assign(effects.particles, counts.particles);
  Object.assign(effects.fireflies, counts.fireflies);
}

let fire = null;
let director = null;
let feed = null;
let preview = reducedMotion ? 'still' : 'beat';
let silenceNext = false;
let demo = null; // { ctx, analyser, monitor, stop() }

function onImpact(flameKey, _from, instant, selection) {
  document.documentElement.dataset.flame = flameKey;
  document.documentElement.dataset.element = elementOr(selection.element);
  if (instant) applyFlame(flameKey);
  director?.landed(flameKey);
}
function onFrame(dt) {
  const now = performance.now() / 1000;
  let f;
  if (preview === 'demo' && demo) f = demo.analyser.update(now, dt, { sensitivity: 1, lead: settings.offset / 1000 });
  else if (feed) f = feed.frame(now, dt);
  else { f = silentFrame(silenceNext ? ['silence'] : []); silenceNext = false; }
  director.update(f, dt);
  drawBeat(f);
}
function failScene(error) {
  fire?.dispose();
  fire = null;
  document.documentElement.classList.add('no-webgl');
  const el = q('[data-error]');
  el.textContent = 'This browser couldn’t start WebGL, so the bonfire can’t render here. Try Chrome or Edge with hardware acceleration on.';
  el.hidden = false;
  console.warn('Bonfire unavailable.', error);
}

import('../bonfire/scene.js').then(async ({ createBonfire }) => {
  // (paintedLook, the bonfire's and the director's: under reduced motion the look being
  // painted still shows, held still, only its flashes and jitters kept off, so what's painted
  // and its thumbnail are the scene's own look, not Ember; stillFx.js.)
  const candidate = createBonfire(stage, { reducedMotion, paintedLook: true, sway: 0, lightTrails: settings.trails, effects: true, onImpact, onRamp: setAccentRamp, onError: failScene, onFrame: (dt) => { if (fire === candidate) onFrame(dt); } });
  director = createDirector(candidate, { settings, reducedMotion, paintedLook: true, onEvent });
  await candidate.ready;
  fire = candidate;
  const eq = startingEquipment;
  await fire.equip(scene.place.weapon ?? eq.weapon, eq.flame, { instant: true, element: scene.place.element ?? elementOr(eq.element) });
  show(scene, { open: true });
  setPreview(preview);
  frameFire();
  stage.classList.add('is-ready');
  if (import.meta.env.DEV) {
    window.__painter = {
      fire, director, settings, store, steps, panel,
      get scene() { return scene; }, get ref() { return ref; }, get dirty() { return dirty; }, get preview() { return preview; },
      edit, setPreview, save, open: openScene,
    };
  }
}).catch(failScene);

function onEvent(type) {
  if (type === 'drop' && preview !== 'still') flashBeat();
}

// --- Editing --------------------------------------------------------------------------------
/**
 * Hold a scene on the stage through Bonfire Live's scene player: at once, held. `open`: a
 * scene arriving (every part anew: the knights brought in, the look's turn rolled); else an
 * edit (only the parts that changed).
 */
function show(s, { open = false } = {}) {
  director.scene(s, { ref: ref && parseRef(ref).source ? ref : null, mode: 'hold', instant: true, fresh: open });
}
let applyQueued = false;
let burst = false; // a look auditioned: a burst in it once it's on, so even a beat's look shows in silence
/** Show the scene (or an audition) on the stage on the next frame (at most once a frame). */
function queueApply() {
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(() => {
    applyQueued = false;
    if (!fire) return;
    show(auditionScene ?? scene);
    if (burst) { burst = false; director.glitchHit(); }
  });
}
let fillQueued = false;
let fillForced = false;
/** Fill the panel and the bar on the next frame (`force`: the field under the hand too). */
function queueFill({ force = false } = {}) {
  fillForced ||= force;
  if (fillQueued) return;
  fillQueued = true;
  requestAnimationFrame(() => {
    fillQueued = false;
    panel.fill({ force: fillForced });
    fillForced = false;
    drawBar();
  });
}

/**
 * A new version of the scene (one undo step; `key`: edits of the same field close together
 * merge). A built-in being edited becomes a copy of its own.
 */
function commit(next, key = null) {
  const norm = normalizeScene(next, { voidHex });
  if (JSON.stringify(norm) === JSON.stringify(scene)) { queueFill(); return false; }
  steps.push(scene, key);
  if (ref?.startsWith('b:')) {
    // (The address stops naming the built-in: a reload brings back the copy, from the draft.)
    ref = null;
    syncUrl();
    note(`Painting a copy of “${scene.name}”: Save keeps it in My Scenes.`, 3.5);
  }
  scene = norm;
  dirty = true;
  edits++;
  auditionScene = null;
  queueApply();
  queueFill();
  saveDraft();
  return true;
}
/** Set one part of the scene (a panel field, the camera, the pack). */
function edit(path, value, { key = path } = {}) {
  let next = withPath(scene, path, value);
  // A move that starts from Still with no size would never move: it gets a new scene's.
  if (path === 'camera.move.kind' && value !== 'still' && !(scene.camera.move.amount > 0)) {
    next = withPath(next, 'camera.move.amount', MOVE_AMOUNT);
  }
  // The flame's tips are kept readable on the background: say so when that moved them.
  // (And the background kept the darkest scenery color.)
  if (path.startsWith('colors.')) {
    const norm = normalizeScene(next, { voidHex });
    panelBody.dataset.lightened = getPath(next, 'colors.flame.hi') !== norm.colors.flame.hi ? '1' : '';
    panelBody.dataset.darkened = next.colors.scenery && next.colors.scenery.void !== norm.colors.scenery?.void ? '1' : '';
  }
  return commit(next, key);
}
/** Show `s` on the stage for as long as its chip is hovered (null: the scene again). */
function audition(s) {
  const was = (auditionScene ?? scene).look.name;
  auditionScene = s ? normalizeScene(s, { voidHex }) : null;
  if (auditionScene && auditionScene.look.name !== was) burst = true;
  queueApply();
}
// (Undo and redo move the panel's fields too, the one under the hand included: a slider
// left where the undone value was would put it back with the next arrow key.)
function undo() {
  const s = steps.undo(scene);
  if (!s) return;
  scene = s; dirty = true; edits++; auditionScene = null;
  queueApply(); queueFill({ force: true }); saveDraft();
}
function redo() {
  const s = steps.redo(scene);
  if (!s) return;
  scene = s; dirty = true; edits++; auditionScene = null;
  queueApply(); queueFill({ force: true }); saveDraft();
}

/**
 * Open a scene (the library, a new one, the draft set aside): its own history, the stage
 * re-set for it. `from`: the ref it came from, when it isn't `r` (a draft's).
 */
function openScene(s, r = null, { isDirty = false, from = r } = {}) {
  scene = normalizeScene(s, { voidHex });
  ref = r;
  origin = from;
  dirty = isDirty;
  edits++;
  steps.clear();
  auditionScene = null;
  q('[data-banner]').hidden = true; // (the admin's scene isn't the one on the stage now)
  if (fire) show(scene, { open: true });
  panel.draw();
  drawBar();
  writeDraft();
  syncUrl();
}
/** The unsaved draft set aside: offered back in a banner while there is one. */
function drawAside() {
  const box = /** @type {HTMLElement} */ (q('[data-aside]'));
  box.hidden = !aside;
  if (!aside) return;
  q('[data-aside-text]').textContent = `“${aside.scene.name}” had unsaved changes when this scene opened. They’re kept until you restore or discard them.`;
  q('[data-aside-restore]').textContent = `Restore “${aside.scene.name}”`;
}
/** Bring the set-aside draft back (what's here now, if unsaved, goes aside in its place). */
function restoreAside() {
  if (!aside) return;
  const back = aside;
  const here = { scene, ref, origin, dirty };
  aside = null;
  writeDraftTo(DRAFT_ASIDE, null);
  setAside(here);
  openScene(back.scene, back.ref, { isDirty: back.dirty, from: back.origin });
  drawAside();
  note(`Restored the unsaved changes to “${back.scene.name}”.`, 3);
}
function discardAside() {
  const name = aside?.scene.name;
  aside = null;
  writeDraftTo(DRAFT_ASIDE, null);
  drawAside();
  if (name) note(`Discarded the unsaved changes to “${name}”.`, 3);
}
/** The scene's name while it has changes that aren't saved (worth asking before they go). */
const unsavedName = () => (unsavedWork({ scene, dirty }) ? scene.name : null);
function syncUrl() {
  const url = new URL(location.href);
  url.hash = '';
  if (ref) url.searchParams.set('scene', ref); else url.searchParams.delete('scene');
  try { window.history.replaceState(null, '', url); } catch { /* sandboxed */ }
}

// --- The panel ------------------------------------------------------------------------------
const elementNames = Object.fromEntries(Object.entries(elements).map(([id, e]) => [id, e.name ?? id]));
/** Bonfire Live's shot as a scene's framing (its drift as the nearest scene move). */
function shotCamera(s) {
  let move = { kind: 'still', amount: 0, bars: 4 };
  if (s.dolly) move = { kind: 'vertigo', amount: Math.min(1, s.dolly / 0.5), bars: 8 };
  else if (s.crane) move = { kind: 'crane', amount: Math.min(1, s.crane / 1.8), bars: 8 };
  else if (s.spin) move = { kind: 'sweep', amount: 0.6, bars: 16 };
  else if (s.yaw) move = s.yaw > 0.4 ? { kind: 'sweep', amount: Math.min(1, s.yaw / 1.2), bars: 8 } : { kind: 'sway', amount: Math.min(1, s.yaw / 0.35), bars: 4 };
  return normalizeScene({ ...scene, camera: { pos: s.pos, target: s.target, fov: s.fov, roll: s.roll ?? 0, move } }, { voidHex }).camera;
}
const flameColors = (key) => { const f = flames[key]; return { lo: f.ramp[0], mid: f.ramp[1], hi: f.ramp[2], core: f.ramp[3], shade: f.shade, light: f.light }; };
const panelCtx = () => ({
  weapons,
  elements: elementNames,
  flames: rotation().map((key) => ({ key, name: flames[key].name, colors: flameColors(key) })),
  shots: Object.entries(SHOTS).map(([key, s]) => ({ key, name: s.name, camera: shotCamera(s) })),
  siteBase,
  site: { pixelSize: effects.render.pixelSize, ditherMatrix: effects.render.ditherMatrix, flameFps: effects.fire.fps },
});
let flameScheme = 'auto';
const sceneVoid = () => scene.colors.scenery?.void ?? siteBase.void;
/** "Pin What You See": what's on screen now, pinned into the scene. */
function pinWhatYouSee() {
  const d = director?.parts.looks.details;
  if (!d) return;
  let next = structuredClone(scene);
  for (const k of Object.keys(LAYERS)) {
    const m = scene.layers[k] ?? 'off';
    if (m === 'mix') next.layers[k] = d.on[k] ? 'on' : 'off';
    if (next.layers[k] === 'off' || !next.layers[k]) continue;
    for (const key of LAYER_DETAILS[k]) {
      const v = key === 'scan' || key === 'mirror' ? d[key] : d.p[key];
      if (v !== undefined) next.details[key] = structuredClone(v);
    }
  }
  if (next.layers.paint === 'on' && next.layers.wash === 'on') next.layers.wash = 'off';
  if ((next.layers.blend ?? 'off') !== 'off') next.blends = { ...d.blends };
  for (const key of LOOK_PARAMS[scene.look.name] ?? []) next.look.params[key] = d[key];
  next = normalizeScene(next, { voidHex });
  if (commit(next, null)) note('Pinned what’s on the stage: it stays as it is now.');
  else note('Everything on the stage is pinned already.');
}
function act(name, el) {
  const light = scene.colors.flame.light;
  if (name === 'flame-harmonious') edit('colors.flame', { ...harmoniousFlame(Math.random, { voidHex: sceneVoid(), scheme: flameScheme }).colors, light }, { key: null });
  else if (name === 'flame-random') edit('colors.flame', { ...wildFlame(Math.random, { voidHex: sceneVoid() }), light }, { key: null });
  else if (name === 'flame-scheme') flameScheme = /** @type {HTMLSelectElement} */ (el).value;
  else if (name === 'seed-flame') {
    const list = suggestFlames(/** @type {HTMLInputElement} */ (el).value, { voidHex: sceneVoid() });
    panel.suggest('flame', flameChips(list.map((s) => ({ label: s.label, colors: s.colors })), light));
    panel.fill();
  } else if (name === 'seed-scenery') {
    const list = suggestScenes(/** @type {HTMLInputElement} */ (el).value, { flames: [{ hi: scene.colors.flame.hi }] });
    panel.suggest('scenery', sceneryChips(list));
    panel.fill();
  } else if (name === 'scenery-harmonious') edit('colors.scenery', harmoniousScene(Math.random, { flames: [{ hi: scene.colors.flame.hi }] }), { key: null });
  else if (name === 'scenery-vivid') edit('colors.scenery', vividScene(Math.random, { flames: [{ hi: scene.colors.flame.hi }], hue: hexToOklch(scene.colors.flame.mid).h }), { key: null });
  else if (name === 'scenery-random') edit('colors.scenery', wildScene(Math.random, { flames: [{ hi: scene.colors.flame.hi }] }), { key: null });
  else if (name === 'pin-all') pinWhatYouSee();
  else if (name === 'drops-own') { if (!scene.drops) edit('drops', { fx: {}, count: 2 }, { key: null }); }
  else if (name === 'gesture') {
    const g = el.dataset.gesture;
    if (!fire?.knights?.gesture(g, { index: 'all' })) note(reducedMotion ? 'The knights keep still (reduced motion).' : 'No knight free to do that right now.', 1.6);
  }
}
/** @type {ReturnType<typeof createPanelSearch> | null} */
let search = null;
const panel = bindPanel(panelBody, {
  get: () => scene,
  edit,
  audition,
  act,
  live: () => director?.parts.looks.details ?? null,
  ctx: panelCtx,
  open: readOpen(),
  onSection: saveOpen,
  onBulk: (text) => note(text, 3),
  onDraw: () => search?.refresh(),
});
setInterval(() => { if (!panelEl.hidden) panel.refreshLive(); }, 700);
search = createPanelSearch({
  input: /** @type {HTMLInputElement} */ (q('#pnt-search')),
  status: q('[data-panel] [data-search-status]'),
  notes: q('[data-search-notes]'),
  panel,
  scene: () => scene,
  ctx: panelCtx(),
  folded: () => innerWidth < 760, // (a phone's bottom sheet: its room for the rows found)
});

// --- The camera by hand ------------------------------------------------------------------------
const rig = createCameraRig(stage, {
  get: () => scene.camera,
  onFrame: (cam, key) => edit('camera', cam, { key }),
  pause: (on) => director?.parts.camera.pause(on || preview === 'still'),
  onDragEnd: () => steps.seal(),
});

// --- The top bar ------------------------------------------------------------------------------
const savedEl = q('[data-saved]');
function drawBar() {
  if (document.activeElement !== nameInput) nameInput.value = scene.name;
  const state = ref?.startsWith('b:') ? 'builtin' : ref && !dirty ? 'saved' : 'unsaved';
  savedEl.dataset.state = state;
  savedEl.textContent = { builtin: 'Built-In', saved: 'Saved', unsaved: ref ? 'Unsaved Changes' : 'Not Saved Yet' }[state];
  q('[data-cmd="undo"]').disabled = !steps.canUndo;
  q('[data-cmd="redo"]').disabled = !steps.canRedo;
  document.title = `${scene.name} — Bonfire Painter`;
}
nameInput.addEventListener('input', () => edit('name', nameInput.value || scene.name, { key: 'name' }));
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); nameInput.blur(); } });
nameInput.addEventListener('blur', () => { steps.seal(); drawBar(); });

/** Save to My Scenes (a new one gets its own id; a built-in, a copy), with a thumbnail. */
function save({ quiet = false } = {}) {
  let saved;
  const mine = ref?.startsWith('m:') ? parseRef(ref).id : null;
  // (A scene saved the first time takes its id from its name: "Frozen Shrine" → frozen-shrine.)
  const fresh = mine ? { ...scene, id: mine } : { ...scene, id: uniqueSceneId(scene.name, new Set(store.list().map((s) => s.id))) };
  try { saved = store.save(fresh, { fresh: !mine }); } catch (e) {
    note(e?.name === 'StorageFull' ? e.message : 'That couldn’t be saved in this browser.', 5);
    return null;
  }
  scene = { ...scene, id: saved.id };
  ref = sceneRef('m', saved.id);
  origin = ref;
  dirty = false;
  drawBar();
  writeDraft();
  syncUrl();
  if (!quiet) note(store.persistent ? `Saved “${saved.name}” in My Scenes.` : `Saved “${saved.name}” for this visit (this browser keeps nothing).`);
  takeThumb(ref);
  return saved;
}
/**
 * The thumbnail for `r`: the stage a couple of frames on, round the part the panel
 * leaves showing (where the fire is framed), so nothing on the stage moves for it. Not
 * waited for: a tab in the background draws no frames until it's back (Play's tab opens in
 * front), and it's kept only if the scene hasn't changed by then.
 */
function takeThumb(r) {
  if (!fire) return;
  const at = edits;
  captureThumb(fire, visibleArea()).then((url) => {
    if (url && at === edits && ref === r) store.setThumb(r, url);
  }).catch(() => {});
}

// Play in Bonfire Live. The scene goes by its ref: an untouched built-in or a saved scene
// as it is; one with changes (or never saved) is saved first. An open Bonfire Live tab is
// asked first (store.play: it answers within ANSWER_MS) and plays it at once, with no tab
// opened, so nothing flashes open and shut in front of it. Only when none answers does
// Bonfire Live's tab open with the scene: the one Play opened before (found by its name,
// and sent there) or a new one. That's a fraction of a second after the click, well inside
// the time a browser still counts a popup as the click's (a few seconds in Chrome and
// Firefox); if it's blocked anyway, the note has a link to open it by hand.
/** Play the scene in Bonfire Live: an open tab plays it at once, otherwise its tab opens with it. */
async function playInLive(s = scene, r = null) {
  let playRef = r;
  if (!playRef && ref && !dirty) {
    playRef = ref; // (saved, or a built-in as it came)
    if (ref.startsWith('b:') && !store.thumb(ref)) takeThumb(ref); // (the library's card gets its picture)
  }
  if (!playRef) {
    const saved = save({ quiet: true });
    if (!saved) return;
    playRef = sceneRef('m', saved.id);
  }
  if (await store.play(playRef)) {
    note(`Playing “${s.name}” in Bonfire Live.`);
    return;
  }
  const url = `${BASE_URL}visualizer/?scene=${encodeURIComponent(playRef)}&solo`;
  const w = window.open(url, LIVE_TAB);
  if (!w) {
    note('The browser blocked Bonfire Live’s tab.', 10, { href: url, text: 'Open Bonfire Live ↗' });
    return;
  }
  try { w.opener = null; } catch { /* (another page's by now) */ }
  w.focus?.();
  note(`Opened Bonfire Live with “${s.name}”.`);
}

const library = createLibrary(q('[data-library]'), {
  store, builtIns, voidHex,
  current: () => ref,
  onOpen: (s, r) => { openScene(s, r); note(`Opened “${s.name}”.`); },
  onNew: () => { openScene(defaultScene('New Scene'), null, { isDirty: true }); note('A new scene.'); },
  onPlay: (s, r) => playInLive(s, r),
  onRenamed: (s, r) => { if (r === ref) { scene = { ...scene, name: s.name }; drawBar(); saveDraft(); } },
  onDeleted: (r) => { if (r === ref) { ref = null; origin = null; dirty = true; drawBar(); syncUrl(); saveDraft(); } },
  unsaved: unsavedName,
});

// The preview: a silent beat, a drop loop, the demo track, or nothing.
function stopDemo() {
  if (!demo) return;
  demo.stop();
  demo = null;
}
async function startDemo() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC({ latencyHint: 'interactive' });
  const analyser = createAnalyser(ctx);
  const monitor = ctx.createGain();
  monitor.gain.value = 0.8;
  monitor.connect(ctx.destination);
  const bus = ctx.createGain();
  bus.connect(analyser.node);
  bus.connect(monitor);
  const track = createDemo(ctx, bus);
  await ctx.resume();
  track.start();
  demo = { ctx, analyser, monitor, stop() { track.stop(); bus.disconnect(); ctx.close().catch(() => {}); } };
}
function setPreview(mode) {
  if (mode !== 'demo') stopDemo();
  const now = performance.now() / 1000;
  const lead = settings.offset / 1000;
  feed = mode === 'beat' ? createBeatFeed({ shape: 'groove', start: now, lead })
    : mode === 'drop' ? createBeatFeed({ shape: 'dropLoop', start: now, lead }) : null;
  if (mode === 'still' || mode === 'demo') { silenceNext = preview !== 'still'; director?.silence(); }
  preview = mode;
  // Still is a still picture: the framing as painted, its move paused (it plays with the music).
  const cam = director?.parts.camera;
  if (cam) {
    if (mode === 'still' && cam.pinned) cam.pin(cam.pinned, { hold: true, move: 'cut' });
    cam.pause(mode === 'still');
  }
  if (mode === 'demo' && !demo) startDemo().catch(() => { note('The demo track couldn’t start here.', 3); setPreview('still'); });
  for (const b of qa('[data-preview]')) b.setAttribute('aria-pressed', String(b.dataset.preview === mode));
  q('[data-beat]').classList.toggle('is-off', mode === 'still');
  beatLabel.textContent = mode === 'demo' ? 'Listening…' : mode === 'still' ? '' : mode === 'drop' ? 'Groove · Bar 1/16' : '124 BPM';
}
// The beat's pips (and the drop loop's place in its 16 bars).
const pips = qa('[data-beat] i');
const beatLabel = q('[data-beat-label]');
const SECTION_NAMES = { groove: 'Groove', breakdown: 'Breakdown', build: 'Build', silent: '' };
function drawBeat(f) {
  for (const b of f.beats) pips.forEach((p, i) => { p.classList.toggle('is-on', i === b.beat); p.classList.toggle('is-down', i === 0); });
  if (!f.beats.length && f.state === 'silent') pips.forEach((p) => p.classList.remove('is-on'));
  const last = f.beats.at(-1);
  if (preview === 'drop' && last) beatLabel.textContent = `${SECTION_NAMES[f.state] ?? ''} · Bar ${last.bar + 1}/16`;
  else if (preview === 'still') beatLabel.textContent = '';
  else if (last) beatLabel.textContent = preview === 'demo' ? `${Math.round(f.bpm)} BPM` : '124 BPM';
}
function flashBeat() {
  const el = q('[data-beat]');
  el.classList.remove('is-drop');
  void el.offsetWidth;
  el.classList.add('is-drop');
  beatLabel.textContent = 'Drop!';
}

// --- Framing the fire in the part of the stage you can see --------------------------------------
let panelShown = true;
/**
 * The part of the stage the panel leaves showing, as fractions of the window: all of it
 * but the panel's column (or, on phones, its bottom sheet). The fire is framed in its middle.
 */
function visibleArea() {
  const phone = innerWidth < 760;
  const w = panelShown && !phone ? panelEl.offsetWidth : 0;
  const h = panelShown && phone ? panelEl.offsetHeight : 0;
  return { x: 0, y: 0, w: 1 - w / innerWidth, h: 1 - h / innerHeight };
}
function frameFire(instant = false) {
  if (!director) return;
  const area = visibleArea();
  director.frame(-(1 - area.w) / 2, (1 - area.h) / 2, { instant });
}
window.addEventListener('resize', () => frameFire());
new ResizeObserver(() => frameFire()).observe(panelEl);
// (The bar wraps into two rows on phones: what sits under it follows its height.)
new ResizeObserver(() => document.body.style.setProperty('--bar-h', `${q('[data-bar]').offsetHeight}px`)).observe(q('[data-bar]'));
function togglePanel(show = !panelShown) {
  panelShown = show;
  panelEl.hidden = !show;
  document.body.classList.toggle('panel-off', !show);
  q('[data-panel-label]').textContent = show ? 'Hide Panel' : 'Show Panel';
  q('[data-cmd="panel"]').setAttribute('aria-expanded', String(show));
  frameFire();
}

// --- The render menu (P), bound to the scene's render -------------------------------------------
const RENDER_ROWS = [
  { key: '1', id: 'pixelSize', label: 'Pixel Size' },
  { key: '2', id: 'palette', label: 'Palette' },
  { key: '3', id: 'dither', label: 'Dither' },
  { key: '4', id: 'ditherMatrix', label: 'Dither Pattern' },
  { key: '5', id: 'outlines', label: 'Outlines' },
  { key: '6', id: 'fog', label: 'Fog' },
  { key: '7', id: 'flameFps', label: 'Flame Frame Rate' },
  { key: '8', id: 'xray', label: 'X-Ray View' },
];
const STEPS = {
  pixelSize: PIXEL_SIZES, palette: Object.keys(PALETTES), dither: RENDER_STEPS.dither, ditherMatrix: [4, 8],
  outlines: ['on', 'mix', 'off'], fog: Object.keys(FOGS), flameFps: FLAME_FPS, xray: [null, ...Object.keys(XRAY_VIEWS)],
};
/** The scene's render as the menu shows it: Bonfire Live's words (render.js renderText). */
function renderValues() {
  const r = scene.render;
  const values = Object.fromEntries(RENDER_ROWS.map(({ id }) => [id, renderText(r, id)]));
  values.xray = XRAY_VIEWS[r.xray] ?? 'Off'; // (a view held for the scene, not a switch)
  return values;
}
const renderMenu = createRenderMenu({
  title: 'Render Settings',
  rows: RENDER_ROWS,
  className: 'debug-hud pnt-render-menu',
  read: renderValues,
  pick: (id, dir) => {
    const steps = STEPS[id];
    const cur = scene.render[id];
    let i = steps.findIndex((v) => String(v) === String(cur));
    if (i < 0 && typeof cur === 'number') i = Math.max(0, steps.findIndex((v) => Number(v) >= cur) - (dir > 0 ? 1 : 0));
    edit(`render.${id}`, steps[(((i + dir) % steps.length) + steps.length) % steps.length], { key: null });
    return renderValues();
  },
  reset: { key: '0', label: 'Reset Render Settings', hint: 'As a New Scene', run: () => edit('render', defaultScene().render, { key: null }) },
});
app.append(renderMenu.el);

// --- The pack (I): it paints into the scene (the place, the weapon, the element, the flame,
// the first knight's helmet, the knights' style and finish); its gestures are previews. ---------
const siteFlameOf = () => rotation().find((k) => { const c = flameColors(k); return ['lo', 'mid', 'hi', 'core'].every((x) => c[x] === scene.colors.flame[x]); }) ?? null;
const pack = createPack({
  label: ui.pack,
  items: bonfireItems({
    state: () => (fire ? {
      scenery: scene.place.scenery, weapon: fire.weapon, element: fire.element, flame: siteFlameOf(),
      helmet: scene.knights.count ? scene.knights.helmets[0] ?? fire.knights?.helmet ?? 'great' : null,
      presence: scene.knights.count ? 'resting' : 'away',
      style: scene.knights.style && scene.knights.style !== 'mix' ? scene.knights.style : fire.knights?.style ?? null,
      finish: scene.knights.finish !== 'mix' ? scene.knights.finish : fire.knights?.finish ?? null,
    } : null),
    busy: () => !fire || fire.forging,
    reducedMotion,
    onScene: (key) => edit('place.scenery', key, { key: null }),
    onWeapon: (key) => edit('place.weapon', key, { key: null }),
    onRing: () => director?.ring(1),
    onLiving: () => { if (!director?.combo()) note('The blade moves on a beat: start the Beat preview.', 2); },
    onElement: (key) => edit('place.element', key, { key: null }),
    onFlame: (key) => edit('colors.flame', flameColors(key), { key: null }),
    onHelmet: (key) => { if (scene.knights.count) edit('knights.helmets.0', key, { key: null }); },
    onStyle: (key) => edit('knights.style', key, { key: null }),
    onFinish: (key) => edit('knights.finish', key, { key: null }),
    onGesture: (name) => { fire?.knights?.gesture(name, { index: 'all' }); },
    hasKnight: () => scene.knights.count > 0,
  }),
});
app.append(pack.el);

// --- Commands and keys ------------------------------------------------------------------------
function capture() {
  fire?.capture().then((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${scene.id || 'scene'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    note('Saved a picture of the stage.');
  });
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
const keysOverlay = createKeysOverlay({ title: 'Keyboard Shortcuts', groups: PAINTER_KEYS });
/** The Tools menu's items (toolbar.js TOOLS). */
const tool = {
  render: () => renderMenu.open({ focus: true }),
  pack: () => pack.toggle(),
  capture: () => capture(),
  fullscreen: () => toggleFullscreen(),
  keys: () => keysOverlay.open(),
};
const tools = bindTools(q('[data-tools]'), (cmd) => tool[cmd]?.());
/** `/`: the panel's search (the panel shown first if it's hidden). */
function focusSearch() {
  if (!panelShown) togglePanel(true);
  search.focus();
}
const commands = {
  tools: () => tools.toggle(),
  library: () => library.toggle(),
  save: () => save(),
  undo, redo,
  play: () => playInLive(),
  panel: () => togglePanel(),
  'banner-save': async () => { if (await save()) q('[data-banner]').hidden = true; },
  'banner-copy': () => {
    navigator.clipboard?.writeText(JSON.stringify(scene, null, 2)).then(
      () => note('Copied: paste it into the admin’s Scenes page (Import From Painter).', 3.5),
      () => { downloadJson(`${scene.id}.json`, scene); note('Couldn’t copy here: downloaded the JSON instead.', 3.5); },
    );
  },
  'banner-close': () => { q('[data-banner]').hidden = true; },
  'aside-restore': restoreAside,
  'aside-discard': discardAside,
};
document.addEventListener('click', (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  const cmd = /** @type {HTMLElement} */ (t.closest('[data-cmd]'));
  if (cmd) { commands[cmd.dataset.cmd]?.(); return; }
  const pv = /** @type {HTMLElement} */ (t.closest('[data-preview]'));
  if (pv) setPreview(pv.dataset.preview);
});
/** Where Space is the page's (the beat), not a focused control's own (a button presses). */
const spaceIsOurs = (el) => el === document.body || el === document.documentElement || stage.contains(el);
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || keysOverlay.el.open) return; // (a drawer, a menu or the keys' list took it)
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (typing(e.target)) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod || e.altKey) return;
  const k = e.key.toLowerCase();
  // (A key the page answers, off the panel: what it opens comes up clear of a tip left
  // showing by the bar's focus. A panel field's keys move it, and keep its tip.)
  if (!panelEl.contains(/** @type {Node} */ (e.target))) tips.hide();
  if (isHelpKey(e)) { e.preventDefault(); tools.close(); keysOverlay.open(); return; }
  // The library open: L closes it (Esc is its own), / filters it; the stage's keys wait.
  if (library.isOpen) {
    if (k === 'l') { e.preventDefault(); library.close(); }
    else if (e.key === '/') { e.preventDefault(); library.focusFilter(); }
    return;
  }
  if (e.key === '/') { e.preventDefault(); focusSearch(); return; }
  if (renderMenu.handleKey(e)) { e.preventDefault(); return; }
  if (e.key === 'Escape' && renderMenu.isOpen) { renderMenu.close(); return; }
  // The camera's keys act on the stage (not while a panel field has the arrows).
  const onPanel = panelEl.contains(/** @type {Node} */ (e.target));
  if (!onPanel && rig.handleKey(e)) { e.preventDefault(); return; }
  if (k === 'h') togglePanel();
  else if (k === 'l') library.toggle();
  else if (k === 'i') pack.toggle();
  else if (k === 'f') toggleFullscreen();
  else if (k === 'c') capture();
  else if (e.key === ' ' && spaceIsOurs(e.target)) { e.preventDefault(); setPreview(preview === 'beat' ? 'still' : 'beat'); }
  else if (k === 'd') {
    if (feed) feed.drop();
    else director?.strike();
    flashBeat();
  }
});

// --- Other tabs, the admin's scene, and the start -----------------------------------------------
store.onChange(({ remote }) => {
  if (!remote || !ref?.startsWith('m:')) return;
  // Changed in another tab: the library shows it; the scene here stays as painted.
  library.refresh();
});
if (fromAdmin) q('[data-banner]').hidden = false;
drawAside();
drawBar();
syncUrl();
writeDraft();
if (!store.persistent) note('This browser keeps nothing: export your scenes to keep them.', 5);
else if (restored) note(`Restored your unsaved changes to “${scene.name}”.`, 3.5);
