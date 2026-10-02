// Bonfire Live: the portfolio's bonfire as an audio-reactive visualizer for DJ sets.
//
//   start     pick a sound source: a line in / mic (an audio interface or a mixer's
//             record out), a shared tab or the whole system's audio (DJ software on
//             this computer), a file, or the synthesized demo track.
//   live      the analyser (analyser.js) reads the sound every frame, inside the
//             bonfire's own render loop; the director (director.js) turns it into the
//             fire's drive, beats, swaps and camera. The HUD shows what it hears and
//             hides itself (and the cursor) when the mouse rests.
//   settings  kept in this browser (settings.js), shown in a dialog (settingsDialog.js) in
//             tabs, with a search (/), presets and saved setups. Saving waits for a burst of
//             changes to settle, and is done at once as the page is hidden or left.
//   keys      ? lists every shortcut (keys.js, the shared keys overlay).
//   frames    Frame Rate (a setting of this computer's) caps how often the picture is drawn;
//             the analyser still hears every frame the display shows (createBonfire's
//             onTick), and what it heard in between reaches the director with the next drawn
//             frame (tickBatch.js).
//   beat      from the music, or set by hand (a BPM, nudges, "this is beat 1"), or from an
//             Ableton Link session through the bridge (tools/link-bridge.mjs).
//   output    a second window with just the picture, for a projector (the canvas is
//             streamed into it), while this one keeps the controls.
//   cards     title cards: the main one as an intro and on drops, more that take turns on
//             drops, show every 32 bars, or on a key (Shift+1…9).
//   render    P opens Render Settings (ui/renderMenu.js, the site's): the Picture tab's
//             pixel size, palette, dither, outlines, fog and x-ray, a digit a step, on the
//             start screen too. (Flame Colors are on Shift+P.)
//   knights   K: the knights dance now, or sit; Shift+K: they come or go (knightShow.js).
//             Their style, finish, edge glow and seat pose are in the Cast tab; the pack
//             swaps the style and the finish by hand.
//   scenes    preset scenes (the director's scene loop and player): the site's built-in
//             ones (content.json `scenes`, hidden = out of the loop) and this browser's own
//             from the Painter (sceneStore.js), filtered by the loop's Scenes From. The HUD
//             names the one playing (a click opens Scenes & Cards); the start screen's chips
//             play one behind the menu (it's the first when the music starts); N plays the
//             next (at once on the start screen, else on the next downbeat, in a flash);
//             Shift+N switches them off / in the mix / always. ?scene=<ref> opens on one
//             (&solo: only that one, the Painter's "Play in Bonfire Live"), and a Painter
//             tab can hand one over (store.onPlay). What the user touches by hand (the
//             dialog, the P menu, a preset) wins over the scene until the next one.
import '../styles.css';
import './visualizer.css';
import { applyCssPalette, base } from '../palette.js';
import { effects } from '../effects.js';
import { startingEquipment, weapons } from '../content.js';
import { elementOr } from '../elements.js';
import { installDitherPatterns } from '../ui/dither.js';
import { installTooltips } from '../ui/tooltip.js';
import { createKeysOverlay } from '../ui/keysOverlay.js';
import { applyFlame, setAccentRamp, setAccentRate } from '../ui/theme.js';
import { esc } from '../html.js';
import { BAND_NAMES } from './analyser.js';
import { createDirector } from './director.js';
import { modeOf } from './looks.js';
import { densityCounts } from './density.js';
import { loadSettings, saveSettings, flushSettings, defaults, frameCap } from './settings.js';
import { bindSettings, markPreset } from './settingsDialog.js';
import { KEY_GROUPS, keyList } from './keys.js';
import { createTickBatch } from './tickBatch.js';
import { stepRender, renderText, XRAY_VIEWS, FOGS } from './render.js';
import { HELMETS } from './knightShow.js';
import { STYLE_NAMES } from '../bonfire/knightStyles.js';
import { FINISH_NAMES } from '../bonfire/steel.js';
import { createRenderMenu } from '../ui/renderMenu.js';
import { focusedNow } from '../ui/focus.js';
import { pageMarkup } from './markup.js';
import { createScenesUi } from './scenesUi.js';
import { createCards } from './cards.js';
import { createSources } from './sources.js';
import { createHud, wieldLabel } from './hud.js';
import { createStart } from './start.js';
import { createActions } from './actions.js';
import { q, failScene } from '../ui/shell.js';
import { createLinkClient } from './link.js';
import { createDiscoveries } from '../ui/discoveries.js';
import { createPack, bonfireItems } from '../ui/pack.js';
import { createRecorder } from './record.js';
import { createMidi, MIDI_ACTIONS } from './midi.js';
import { SCENERIES } from '../sceneries.js';
import { ui } from '../content.js';

// Finding this page is one of the site's discoveries (counted when you're back on the site).
createDiscoveries().discover('visualizer');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Settings (this browser only: settings.js) -----------------------------------------------
const settings = loadSettings();
// (Saving waits for changes to settle: what's waiting is written as the page goes or hides.)
addEventListener('pagehide', flushSettings);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSettings(); });

// --- What the page's parts share (context.js) ---------------------------------------------------
// The scene, its director and the sound come and go while the page is open (a rebuilt scene,
// another source), so each part reads them from here when it needs them.
/** @type {import('./context.js').LiveContext} */
const ctx = { settings, reducedMotion, fire: null, director: null, engine: null, heard: createTickBatch(), lastFeatures: null, firstScene: null, solo: null };

document.documentElement.classList.add('js');
applyCssPalette();
applyFlame(startingEquipment.flame);
installDitherPatterns(base);
installTooltips();
// (The accents follow the flame through a color blend: 8 times a second is smooth enough here,
// and each write restyles the whole page, the open settings too.)
setAccentRate(125);

// --- Markup ------------------------------------------------------------------------------------
const app = document.getElementById('viz');
app.innerHTML = pageMarkup(settings);

const stage = q('[data-stage]');
const hud = q('[data-hud]');
const start = q('[data-start]');
const live = q('[data-live]');
const errorEl = q('[data-error]');
const settingsDialog = q('[data-settings]');
document.body.dataset.mode = 'start';

// --- Preset scenes (scenesUi.js): the library, playing one, naming it, the start screen's chips
Object.assign(ctx, createScenesUi(ctx));
// ?scene=<ref>: open on that scene (the start screen's backdrop, and the first when the music
// starts); &solo: only that one this visit (the Painter's "Play in Bonfire Live").
const params = new URLSearchParams(location.search);
const askedScene = params.get('scene');
ctx.firstScene = askedScene ? ctx.findScene(askedScene) : null;
ctx.solo = ctx.firstScene && params.has('solo') ? ctx.firstScene.ref : null;
// (What main.js still gives the parts, until each moves out.)
Object.assign(ctx, { openSettings, openKeys, applySettings, mirrorCard, openOutput });

// --- The bonfire ---------------------------------------------------------------------------
const IDLE = { state: 'silent', bands: Object.fromEntries(BAND_NAMES.map((b) => [b, 0])), level: 0, beats: [], events: [], kick: 0, hat: 0, bpm: 0, locked: false, build: 0 };

function onImpact(flameKey, _from, instant, selection) {
  document.documentElement.dataset.flame = flameKey;
  document.documentElement.dataset.element = elementOr(selection.element);
  q('[data-wield]').textContent = wieldLabel({ ...selection, flame: flameKey });
  if (instant) applyFlame(flameKey);
  ctx.director?.landed(flameKey);
}

// Ableton Link (link.js): while it's the beat's source, the session sets the grid.
const link = createLinkClient({ port: () => settings.linkPort, onStatus: (text) => { if (settingsPanel) settingsPanel.linkStatus = text; } });
// The sound is analysed on every frame the display shows (onTick), whatever Frame Rate
// draws; the director and the HUD go with the drawn frames (onFrame), taking all it heard
// since the last one (ctx.heard: tickBatch.js).
function onTick(dt) {
  const now = performance.now() / 1000;
  if (settings.beatFrom === 'link' && ctx.engine?.source) link.update(now, ctx.engine.analyser.tempo);
  else link.close();
  if (ctx.engine?.source) ctx.heard.add(ctx.engine.analyser.update(now, dt, { sensitivity: settings.sensitivity, lead: settings.offset / 1000 }));
}
function onFrame(dt) {
  const f = (ctx.engine?.source && ctx.heard.take()) || IDLE;
  ctx.lastFeatures = f;
  ctx.director.update(f, dt);
  if (ctx.engine?.source) ctx.drawHud(f, dt);
}
/** Frame Rate as the scene's cap (only when it changed: a new cap starts its count again). */
function applyFrameRate() {
  const cap = frameCap(settings.frameRate);
  if (ctx.fire && ctx.fire.maxFps !== cap) ctx.fire.setMaxFps(cap);
}

/** The scene couldn't start (no WebGL): it's let go, and the start screen says so (ui/shell.js). */
function sceneFailed(error) {
  ctx.fire?.dispose();
  ctx.fire = null;
  failScene(errorEl, error);
}

// More particles than the site: the visualizer is the show (density.js, the Painter's too).
// The counts size GPU buffers, so changing them rebuilds the scene.
const BASE_COUNTS = structuredClone({ particles: effects.particles, fireflies: effects.fireflies });
function applyDensity() {
  const counts = densityCounts(BASE_COUNTS, settings.particles);
  Object.assign(effects.particles, counts.particles);
  Object.assign(effects.fireflies, counts.fireflies);
}

let sceneGeneration = 0;
function startScene() {
  const generation = ++sceneGeneration;
  applyDensity();
  return import('../bonfire/scene.js').then(async ({ createBonfire }) => {
    const candidate = createBonfire(stage, {
      reducedMotion, sway: 0, lightTrails: settings.trails, effects: true, onImpact, onRamp: setAccentRamp, onError: sceneFailed,
      onFrame: (dt) => { if (ctx.fire === candidate) onFrame(dt); },
      onTick: (dt) => { if (ctx.fire === candidate) onTick(dt); },
    });
    const nextDirector = createDirector(candidate, { settings, reducedMotion, onEvent, scenes: ctx.loopLibrary });
    await candidate.ready;
    if (generation !== sceneGeneration) { candidate.dispose(); return; }
    const prev = ctx.fire;
    // (A rebuilt scene carries on with the preset scene that was playing.)
    const playing = ctx.director?.sceneRef ? ctx.findScene(ctx.director.sceneRef) : null;
    ctx.recorder?.stop(); // (a clip ends with the scene it was recording)
    ctx.fire = candidate;
    ctx.director = nextDirector;
    ctx.frameFire();
    applyFrameRate();
    // (Dev builds, and any build with ?bench in its address: tools/bench-viz.mjs drives the show through it.)
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('bench')) window.__viz = { fire: ctx.fire, director: ctx.director, settings, get engine() { return ctx.engine; }, get features() { return ctx.lastFeatures; } };
    ctx.director.applyRender(); // (the Render tab: render.js)
    const eq = prev ? { weapon: prev.weapon, flame: prev.flame, element: prev.element } : { weapon: startingEquipment.weapon, flame: startingEquipment.flame, element: elementOr(startingEquipment.element) };
    prev?.dispose();
    await ctx.fire.equip(eq.weapon, eq.flame, { instant: true, element: eq.element });
    ctx.fire.setScenery(settings.scenery === 'mix' ? prev?.scenery ?? 'ruins' : settings.scenery);
    // (The first build opens on ?scene= or a chip picked while it loaded.)
    const opening = prev ? playing : playing ?? ctx.firstScene;
    if (opening) ctx.playScene(opening, { instant: true, lock: opening.ref === ctx.solo });
    stage.classList.add('is-ready');
    if (output && !output.closed) streamInto(output);
  }).catch(sceneFailed);
}
startScene();

// --- Director events → page ------------------------------------------------------------------
function onEvent(type, data = {}) {
  if (type === 'drop') {
    ctx.note('Drop!');
    live.textContent = 'Drop.';
    if (data.title !== false) ctx.nextCard('drops');
  } else if (type === 'arm') {
    ctx.note('Forging a weapon for the drop…', 4);
  } else if (type === 'start') {
    if (settings.intro) ctx.showCard(0);
    // (A scene already playing when the music starts, from ?scene=, a chip or N on the start
    // screen, carries on without a new 'scene' event: its picture is kept from here.)
    if (ctx.director?.sceneRef) ctx.keepThumb(ctx.director.sceneRef);
  } else if (type === 'bar') {
    if (data.bar > 0 && data.bar % 32 === 0) ctx.nextCard('phrases');
  } else if (type === 'stage') {
    ctx.note(['', 'Building…', 'Building… halfway', 'Building… three quarters', 'Here it comes'][data.stage] ?? '', 2);
  } else if (type === 'scene') {
    ctx.sceneArrived(data);
  }
}

// --- Title cards (cards.js) ------------------------------------------------------------------
Object.assign(ctx, createCards(ctx));

// --- The sound (sources.js): a line in, a shared tab or the system, a file, the demo ----------
Object.assign(ctx, createSources(ctx));

// --- Start screen (start.js): the sources, the presets; to the show and back --------------------
Object.assign(ctx, createStart(ctx));

// --- HUD (hud.js): what it hears, the beat, the state line, the labels that change; idle -------
Object.assign(ctx, createHud(ctx));

// --- Actions (actions.js): the buttons, the keyboard shortcuts, the beat by hand ---------------
Object.assign(ctx, createActions(ctx));

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
    rebuildTimer = setTimeout(startScene, 200);
  }
  if (ctx.engine) ctx.engine.monitor.gain.value = settings.volume;
  applyFrameRate();
  ctx.director?.applyRender();
  const held = !!ctx.director?.sceneRef;
  if (settings.scenery !== 'mix' && (!held || keys.includes('scenery'))) ctx.fire?.setScenery(settings.scenery);
  if (!held || keys.includes('shot')) ctx.director?.setShot(settings.shot);
  // Scenes switched off: back to the free show now (a solo from the Painter stays).
  if (keys.includes('scenes') && modeOf(settings.scenes) === 'off' && held && !ctx.solo) ctx.playScene(null, { instant: !ctx.engine?.source });
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
  midi: () => MIDI_NAMES,
  keys: keyList(),
  onKeys: () => openKeys(),
});
ctx.settingsPanel = settingsPanel;

// --- The keyboard shortcuts (?): every key, in groups (keys.js) -------------------------------
const keysOverlay = createKeysOverlay({ title: 'Keyboard Shortcuts', groups: KEY_GROUPS });
ctx.keysOverlay = keysOverlay;
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

// --- Render Settings (P; ui/renderMenu.js, as on the site): the Picture tab's switches --------
// Each row steps its setting (render.js RENDER_STEPS) and the picture follows at once. What
// a switch in the mix is doing right now shows after it.
const RENDER_ROWS = [
  { key: '1', id: 'pixelSize', label: 'Pixel Size' },
  { key: '2', id: 'palette', label: 'Palette' },
  { key: '3', id: 'fewColors', label: 'Few Colors' },
  { key: '4', id: 'dither', label: 'Dither' },
  { key: '5', id: 'ditherMatrix', label: 'Dither Pattern' },
  { key: '6', id: 'outlines', label: 'Outlines' },
  { key: '7', id: 'fog', label: 'Fog' },
  { key: '8', id: 'xray', label: 'X-Ray Flips' },
  { key: '9', id: 'pixelShift', label: 'Pixel Size Shifts' },
];
function renderValues() {
  // (What shows: a preset scene's own where it sets one, marked "· Scene".)
  const shown = ctx.director?.parts?.layers?.view ?? settings;
  const over = ctx.director?.parts?.layers?.over ?? {};
  const v = Object.fromEntries(RENDER_ROWS.map((r) => [r.id, `${renderText(shown, r.id)}${Object.hasOwn(over, r.id) ? ' · Scene' : ''}`]));
  const live = ctx.director?.render;
  if (!live) return v;
  const mix = (key) => modeOf(shown[key]) === 'mix';
  if (live.pixelSize && live.pixelSize !== shown.pixelSize) v.pixelSize += ` · ${live.pixelSize} px Now`;
  if (mix('fewColors')) v.fewColors += live.few ? ' · On Now' : ' · Off Now';
  if (mix('outlines')) v.outlines += live.outlines ? ' · On Now' : ' · Off Now';
  if (shown.ditherMatrix === 'mix') v.ditherMatrix += ` · ${live.matrix}×${live.matrix}`;
  if (shown.fog === 'mix') v.fog += ` · ${FOGS[live.fog] ?? live.fog}`;
  if (live.xray) v.xray += ` · ${XRAY_VIEWS[live.xray] ?? live.xray}`;
  return v;
}
const renderMenu = createRenderMenu({
  title: 'Render Settings',
  rows: RENDER_ROWS,
  className: 'debug-hud viz-render-menu',
  read: renderValues,
  pick: (id, dir) => {
    // (Stepping a row the scene sets takes it back from the scene, from its value.)
    const over = ctx.director?.parts?.layers?.over;
    if (over && Object.hasOwn(over, id)) settings[id] = over[id];
    ctx.director?.releaseScene(id === 'xray' ? [id, 'xrayView'] : [id]);
    stepRender(settings, /** @type {any} */ (id), dir);
    applyRender();
    return renderValues();
  },
  reset: {
    key: '0', label: 'Reset Render Settings', hint: 'To the Defaults',
    run: () => {
      const d = defaults();
      for (const r of RENDER_ROWS) settings[r.id] = d[r.id];
      ctx.director?.releaseScene([...RENDER_ROWS.map((r) => r.id), 'xrayView']);
      applyRender();
    },
  },
  onToggle: () => ctx.wake(),
});
app.append(renderMenu.el);
ctx.renderMenu = renderMenu;

// --- Recording a clip (record.js) -------------------------------------------------------------
const recordLabel = q('[data-record-label]');
ctx.recorder = createRecorder({
  scene: () => ctx.fire,
  audio: () => (ctx.engine?.source ? { ctx: ctx.engine.ctx, node: ctx.engine.delay } : null),
  onState: ({ recording, seconds, saved, error }) => {
    document.body.classList.toggle('is-recording', recording);
    recordLabel.textContent = recording ? `Rec ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Record';
    if (saved) ctx.note(`Saved ${saved}`, 3);
    if (error) ctx.note(error, 3);
  },
});

// --- The pack (ui/pack.js, the same as the site's): scene, weapon and spells by hand -----------
const pack = createPack({
  label: ui.pack,
  items: bonfireItems({
    state: () => (ctx.fire ? {
      scenery: ctx.fire.scenery, weapon: ctx.fire.weapon, element: ctx.fire.element, flame: ctx.fire.flame,
      helmet: ctx.fire.knights?.present ? ctx.fire.knights.helmet : null,
      style: ctx.fire.knights?.present ? ctx.fire.knights.style ?? null : null,
      finish: ctx.fire.knights?.present ? ctx.fire.knights.finish ?? null : null,
    } : null),
    busy: () => !ctx.fire || ctx.fire.forging,
    reducedMotion,
    onScene: (key) => {
      ctx.director?.releaseScene(['scenery']); // (your pick wins over a scene's place)
      if (ctx.fire?.setScenery(key, { flash: true })) ctx.note(`Traveled to ${SCENERIES[key]}`, 1.5);
    },
    onWeapon: (key) => {
      if (!ctx.fire || key === ctx.fire.weapon) return;
      if (ctx.fire.forging) { ctx.note('The forge is busy', 1.5); return; }
      ctx.fire.equip(key, ctx.fire.flame, { element: ctx.fire.element }).catch(() => {});
      ctx.note(`Forging the ${weapons[key]}`, 2);
    },
    onRing: () => ctx.director?.ring(1),
    onLiving: () => ctx.actions.combo(),
    onElement: (key) => { if (!ctx.director?.hit({ element: key })) ctx.note('The forge is busy', 1.5); },
    onFlame: (key) => {
      if (!ctx.fire || key === ctx.fire.flame) return;
      if (ctx.fire.forging) { ctx.note('The forge is busy', 1.5); return; }
      ctx.fire.equip(ctx.fire.weapon, key, { element: ctx.fire.element }).catch(() => {});
    },
    // The knights (every one by the fire): a new helmet (hands to the helm), a gesture.
    onHelmet: (key) => {
      if (!ctx.fire?.knights?.present) return;
      ctx.fire.knights.setHelmet(key);
      ctx.note(`Helmet: ${HELMETS[key] ?? key}`, 1.5);
    },
    onGesture: (name) => { ctx.fire?.knights?.gesture(name, { index: 'all' }); },
    // ...their style and the color of their steel, for them all (the Knights tab's Style and
    // Finish roll them again at the hidden moments when they're in the mix).
    onStyle: (key) => {
      if (!ctx.fire?.knights?.present || !ctx.fire.knights.setStyle) return;
      Promise.resolve(ctx.fire.knights.setStyle(key)).catch(() => {});
      ctx.note(`Style: ${STYLE_NAMES[key] ?? key}`, 1.5);
    },
    onFinish: (key) => {
      if (!ctx.fire?.knights?.present || !ctx.fire.knights.setFinish) return;
      ctx.fire.knights.setFinish(key);
      ctx.note(`Finish: ${FINISH_NAMES[key] ?? key}`, 1.5);
    },
  }),
});
app.append(pack.el);
ctx.pack = pack;
// It sits just above the HUD while the HUD is up. (On the page's own box, not the body: a
// change restyles only what's in it.)
new ResizeObserver(() => app.style.setProperty('--hud-h', `${hud.hidden ? 0 : hud.offsetHeight}px`)).observe(hud);
settingsDialog.addEventListener('show-card', (e) => { settingsDialog.close(); ctx.showCard(e.detail); });
// --- A MIDI controller (midi.js): pads for the moments, mapped by learning -----------------
const midiList = q('[data-midi-list]');
const midiStatus = q('[data-midi-status]');
// (The X moment is the Living Weapon everywhere people read it.)
const MIDI_NAMES = { ...MIDI_ACTIONS, combo: 'Living Weapon' };
function drawMidi() {
  const map = midi.mapping;
  midiList.innerHTML = Object.entries(MIDI_NAMES).map(([id, name]) => `
    <li data-row="midi:${id}"><span data-name>${esc(name)}</span><span class="viz-midi-key">${esc(map[id] ?? '—')}</span>
      <button class="pix-btn" type="button" data-midi-learn="${id}"${midi.connected ? '' : ' disabled'} aria-label="Learn ${esc(name)}">Learn</button>
      ${map[id] ? `<button class="pix-btn" type="button" data-midi-forget="${id}" aria-label="Forget ${esc(name)}" data-tip="Forget this pad">✕</button>` : ''}</li>`).join('');
}
const midiActions = {
  drop: () => ctx.actions.drop(), arm: () => ctx.actions.arm(), ring: () => ctx.actions.ring(), combo: () => ctx.actions.combo(),
  cut: () => ctx.actions.cut(), look: () => ctx.note(`Look: ${ctx.director?.nextLook()}`, 1.5), scene: () => ctx.nextScene(), burst: () => ctx.director?.glitchHit(),
  fire: () => ctx.director?.hit({ element: 'fire' }), lightning: () => ctx.director?.hit({ element: 'lightning' }), ice: () => ctx.director?.hit({ element: 'ice' }),
  record: () => ctx.actions.record(),
  knightsDance: () => ctx.actions.dance(), knights: () => ctx.actions.knights(),
};
const midi = createMidi({
  onAction: (id) => { if (document.body.dataset.mode === 'live' && ctx.fire) { midiActions[id]?.(); ctx.wake(); } },
  onStatus: (text) => { midiStatus.textContent = text; },
  onChange: drawMidi,
});
drawMidi();
settingsDialog.addEventListener('click', async (e) => {
  if (e.target.closest('[data-midi-connect]')) { if (await midi.connect()) drawMidi(); return; }
  const learn = e.target.closest('[data-midi-learn]');
  if (learn) { midi.learn(learn.dataset.midiLearn); return; }
  const forget = e.target.closest('[data-midi-forget]');
  if (forget) midi.forget(forget.dataset.midiForget);
});

markPreset(start, settings);
ctx.drawChips();
if (askedScene && !ctx.firstScene) ctx.showError('That scene isn’t in this browser (it may have been made in another one). Pick another below, or make one in the Painter.');

// --- The output window: just the picture, for a projector ----------------------------------
// The canvas is streamed into a second window (so it can go full screen on another display)
// while this one keeps the controls. A rebuilt scene (new particle counts) streams again.
const titleCard = q('[data-title-card]'); // (cards.js shows it here; it's copied there)
let output = null;
function streamInto(win) {
  const canvas = stage.querySelector('canvas');
  const video = win.document.querySelector('video');
  if (!canvas?.captureStream || !video) return false;
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = canvas.captureStream(60);
  return true;
}
/** Copies the title card (and the flame colors and dither tiles it draws with) into the output window. */
function mirrorCard() {
  if (!output || output.closed) return;
  const doc = output.document;
  Object.assign(doc.documentElement.dataset, document.documentElement.dataset);
  doc.documentElement.style.cssText = document.documentElement.style.cssText;
  const copy = doc.importNode(titleCard, true); // a fresh node restarts the fade-in
  const old = doc.querySelector('[data-title-card]');
  if (old) old.replaceWith(copy); else doc.body.append(copy);
}
function openOutput() {
  if (output && !output.closed) { output.focus(); return; }
  if (!stage.querySelector('canvas')?.captureStream) { ctx.note('This browser can’t send the picture to another window', 3); return; }
  output = window.open('', 'bonfire-output', 'popup,width=1280,height=720');
  if (!output) { ctx.note('The window was blocked: allow pop-ups for this page', 3); return; }
  output.document.title = 'Bonfire Live — Output';
  // The page's styles come along so the title card (HTML over the canvas, not in the stream)
  // looks the same there.
  output.document.head.replaceChildren(...[...document.querySelectorAll('link[rel="stylesheet"], style')].map((el) => {
    if (el.tagName !== 'LINK') return el.cloneNode(true);
    const link = output.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = el.href;
    return link;
  }));
  output.document.body.innerHTML = `
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      video { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
      .viz-out-hint { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); margin: 0; padding: 6px 12px;
          font: 14px system-ui, sans-serif; color: #e9e3d2; background: #07070bcc; transition: opacity 600ms; }
      body.quiet .viz-out-hint { opacity: 0; } body.quiet { cursor: none; }
    </style>
    <video autoplay muted playsinline></video>
    <p class="viz-out-hint">Drag this window to the projector, then double-click for full screen.</p>`;
  const doc = output.document;
  doc.addEventListener('dblclick', () => (doc.fullscreenElement ? doc.exitFullscreen() : doc.documentElement.requestFullscreen?.()));
  let quiet = 0;
  const wakeOut = () => { doc.body.classList.remove('quiet'); clearTimeout(quiet); quiet = setTimeout(() => doc.body.classList.add('quiet'), 2500); };
  doc.addEventListener('pointermove', wakeOut);
  wakeOut();
  streamInto(output);
  mirrorCard();
  output.addEventListener('pagehide', () => { q('[data-output-label]').textContent = 'Output'; });
  q('[data-output-label]').textContent = 'Output (open)';
  ctx.note('Output window open', 2);
}
/** Open the settings (on `tab`; `search`: with the focus in their search box). */
let settingsOpener = null;
function openSettings(tab, { search = false } = {}) {
  if (!settingsDialog.open) settingsOpener = focusedNow();
  settingsPanel.open(tab, { search });
  ctx.wake();
}
