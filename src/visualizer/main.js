// Bonfire Live: the portfolio's bonfire as an audio-reactive visualizer for DJ sets. This
// file builds the page: the markup, the scene and its director, and the parts that make up
// the rest, each a module made with the page's shared `ctx` (context.js says what's in it).
//
//   start     pick a sound source (start.js, sources.js): a line in / mic (an audio
//             interface or a mixer's record out), a shared tab or the whole system's audio
//             (DJ software on this computer), a file, or the synthesized demo track.
//   live      the analyser (analyser.js) reads the sound every frame, inside the
//             bonfire's own render loop; the director (director.js) turns it into the
//             fire's drive, beats, swaps and camera. The HUD (hud.js) shows what it hears
//             and hides itself (and the cursor) when the mouse rests.
//   settings  kept in this browser (settings.js), shown in a dialog (settingsDialog.js) in
//             tabs, with a search (/), presets and saved setups; what a change does to the
//             show is dialogs.js. Saving waits for a burst of changes to settle, and is done
//             at once as the page is hidden or left.
//   keys      ? lists every shortcut (keys.js, the shared keys overlay); what each key and
//             button does is actions.js.
//   frames    Frame Rate (a setting of this computer's) caps how often the picture is drawn;
//             the analyser still hears every frame the display shows (createBonfire's
//             onTick), and what it heard in between reaches the director with the next drawn
//             frame (tickBatch.js).
//   beat      from the music, or set by hand (actions.js: a BPM, nudges, "this is beat 1"),
//             or from an Ableton Link session through the bridge (tools/link-bridge.mjs).
//   output    a second window with just the picture, for a projector (the canvas is
//             streamed into it), while this one keeps the controls (output.js).
//   cards     title cards (cards.js): the main one as an intro and on drops, more that take
//             turns on drops, show every 32 bars, or on a key (Shift+1…9).
//   render    P opens Render Settings (renderUi.js, on the site's ui/renderMenu.js): the
//             Picture tab's pixel size, palette, dither, outlines, fog and x-ray, a digit a
//             step, on the start screen too. (Flame Colors are on Shift+P.)
//   knights   K: the knights dance now, or sit; Shift+K: they come or go (knightShow.js).
//             Their style, finish, edge glow and seat pose are in the Cast tab; the pack
//             (packUi.js) swaps the style and the finish by hand.
//   midi      a MIDI controller's pads play the moments, each learned (midiUi.js, midi.js).
//   scenes    preset scenes (scenesUi.js; the director's scene loop and player): the site's
//             built-in ones (content.json `scenes`, hidden = out of the loop) and this
//             browser's own from the Painter (sceneStore.js), filtered by the loop's Scenes
//             From. The HUD names the one playing (a click opens Scenes & Cards); the start
//             screen's chips play one behind the menu (it's the first when the music
//             starts); N plays the next (at once on the start screen, else on the next
//             downbeat, in a flash); Shift+N switches them off / in the mix / always.
//             ?scene=<ref> opens on one (&solo: only that one, the Painter's "Play in Bonfire
//             Live"), and a Painter tab can hand one over (store.onPlay). What the user
//             touches by hand (the dialog, the P menu, a preset) wins over the scene until
//             the next one.
import '../styles.css';
import './visualizer.css';
import { applyCssPalette, base } from '../palette.js';
import { effects } from '../effects.js';
import { startingEquipment } from '../content.js';
import { elementOr } from '../elements.js';
import { installDitherPatterns } from '../ui/dither.js';
import { installTooltips } from '../ui/tooltip.js';
import { applyFlame, setAccentRamp, setAccentRate } from '../ui/theme.js';
import { BAND_NAMES } from './analyser.js';
import { createDirector } from './director.js';
import { densityCounts } from './density.js';
import { loadSettings, flushSettings, frameCap } from './settings.js';
import { markPreset, presetButtons, settingsMarkup } from './settingsDialog.js';
import { keyList } from './keys.js';
import { createTickBatch } from './tickBatch.js';
import { pageMarkup } from './markup.js';
import { createScenesUi } from './scenesUi.js';
import { createCards } from './cards.js';
import { createSources } from './sources.js';
import { createHud, wieldLabel } from './hud.js';
import { createStart } from './start.js';
import { createActions } from './actions.js';
import { createDialogs } from './dialogs.js';
import { createRenderUi } from './renderUi.js';
import { createPackUi } from './packUi.js';
import { createMidiUi } from './midiUi.js';
import { createOutput } from './output.js';
import { q, failScene } from '../ui/shell.js';
import { createLinkClient } from './link.js';
import { createDiscoveries } from '../ui/discoveries.js';
import { createRecorder } from './record.js';

// Finding this page is one of the site's discoveries (counted when you're back on the site).
createDiscoveries().discover('visualizer');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Settings (this browser only: settings.js) -----------------------------------------------
const settings = loadSettings();
// (Saving waits for changes to settle: what's waiting is written as the page goes or hides.)
addEventListener('pagehide', flushSettings);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushSettings();
});

// --- What the page's parts share (context.js) ---------------------------------------------------
// The scene, its director and the sound come and go while the page is open (a rebuilt scene,
// another source), so each part reads them from here when it needs them.
/** @type {import('./context.js').LiveContext} */
const ctx = {
  settings,
  reducedMotion,
  fire: null,
  director: null,
  engine: null,
  heard: createTickBatch(),
  lastFeatures: null,
  firstScene: null,
  solo: null,
};

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
app.innerHTML = pageMarkup({
  base: import.meta.env.BASE_URL,
  presets: presetButtons('viz-feel-pick', 'viz-start-preset'),
  settingsDialog: settingsMarkup(settings, keyList(), { base: import.meta.env.BASE_URL }),
});

const stage = q('[data-stage]');
const hud = q('[data-hud]');
const start = q('[data-start]');
const live = q('[data-live]');
const errorEl = q('[data-error]');
document.body.dataset.mode = 'start';

// --- Preset scenes (scenesUi.js): the library, playing one, naming it, the start screen's chips
Object.assign(ctx, createScenesUi(ctx));
// ?scene=<ref>: open on that scene (the start screen's backdrop, and the first when the music
// starts); &solo: only that one this visit (the Painter's "Play in Bonfire Live").
const params = new URLSearchParams(location.search);
const askedScene = params.get('scene');
ctx.firstScene = askedScene ? ctx.findScene(askedScene) : null;
ctx.solo = ctx.firstScene && params.has('solo') ? ctx.firstScene.ref : null;

// --- The bonfire ---------------------------------------------------------------------------
const IDLE = {
  state: 'silent',
  bands: Object.fromEntries(BAND_NAMES.map((b) => [b, 0])),
  level: 0,
  beats: [],
  events: [],
  kick: 0,
  hat: 0,
  bpm: 0,
  locked: false,
  build: 0,
};

function onImpact(flameKey, _from, instant, selection) {
  document.documentElement.dataset.flame = flameKey;
  document.documentElement.dataset.element = elementOr(selection.element);
  q('[data-wield]').textContent = wieldLabel({ ...selection, flame: flameKey });
  if (instant) applyFlame(flameKey);
  ctx.director?.landed(flameKey);
}

// Ableton Link (link.js): while it's the beat's source, the session sets the grid.
const link = createLinkClient({
  port: () => settings.linkPort,
  onStatus: (text) => {
    if (ctx.settingsPanel) ctx.settingsPanel.linkStatus = text;
  },
});
// The sound is analysed on every frame the display shows (onTick), whatever Frame Rate
// draws; the director and the HUD go with the drawn frames (onFrame), taking all it heard
// since the last one (ctx.heard: tickBatch.js).
function onTick(dt) {
  const now = performance.now() / 1000;
  if (settings.beatFrom === 'link' && ctx.engine?.source) link.update(now, ctx.engine.analyser.tempo);
  else link.close();
  if (ctx.engine?.source)
    ctx.heard.add(
      ctx.engine.analyser.update(now, dt, { sensitivity: settings.sensitivity, lead: settings.offset / 1000 }),
    );
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
  return import('../bonfire/scene.js')
    .then(async ({ createBonfire }) => {
      const candidate = createBonfire(stage, {
        reducedMotion,
        sway: 0,
        lightTrails: settings.trails,
        effects: true,
        onImpact,
        onRamp: setAccentRamp,
        onError: sceneFailed,
        onFrame: (dt) => {
          if (ctx.fire === candidate) onFrame(dt);
        },
        onTick: (dt) => {
          if (ctx.fire === candidate) onTick(dt);
        },
      });
      const nextDirector = createDirector(candidate, { settings, reducedMotion, onEvent, scenes: ctx.loopLibrary });
      await candidate.ready;
      if (generation !== sceneGeneration) {
        candidate.dispose();
        return;
      }
      const prev = ctx.fire;
      // (A rebuilt scene carries on with the preset scene that was playing.)
      const playing = ctx.director?.sceneRef ? ctx.findScene(ctx.director.sceneRef) : null;
      ctx.recorder?.stop(); // (a clip ends with the scene it was recording)
      ctx.fire = candidate;
      ctx.director = nextDirector;
      ctx.frameFire();
      applyFrameRate();
      // (Dev builds, and any build with ?bench in its address: tools/bench-viz.mjs drives the show through it.)
      if (import.meta.env.DEV || new URLSearchParams(location.search).has('bench'))
        window.__viz = {
          fire: ctx.fire,
          director: ctx.director,
          settings,
          get engine() {
            return ctx.engine;
          },
          get features() {
            return ctx.lastFeatures;
          },
        };
      ctx.director.applyRender(); // (the Render tab: render.js)
      const eq = prev
        ? { weapon: prev.weapon, flame: prev.flame, element: prev.element }
        : {
            weapon: startingEquipment.weapon,
            flame: startingEquipment.flame,
            element: elementOr(startingEquipment.element),
          };
      prev?.dispose();
      await ctx.fire.equip(eq.weapon, eq.flame, { instant: true, element: eq.element });
      ctx.fire.setScenery(settings.scenery === 'mix' ? (prev?.scenery ?? 'ruins') : settings.scenery);
      // (The first build opens on ?scene= or a chip picked while it loaded.)
      const opening = prev ? playing : (playing ?? ctx.firstScene);
      if (opening) ctx.playScene(opening, { instant: true, lock: opening.ref === ctx.solo });
      stage.classList.add('is-ready');
      ctx.streamOutput();
    })
    .catch(sceneFailed);
}
// (A settings change rebuilds the scene, or caps its frame rate: dialogs.js.)
Object.assign(ctx, { startScene, applyFrameRate });
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

// --- Settings and the keyboard shortcuts (dialogs.js) --------------------------------------------
Object.assign(ctx, createDialogs(ctx));

// --- Render Settings (renderUi.js): P, the Picture tab's switches, as on the site --------------
Object.assign(ctx, createRenderUi(ctx));
app.append(ctx.renderMenu.el);

// --- Recording a clip (record.js) -------------------------------------------------------------
const recordLabel = q('[data-record-label]');
ctx.recorder = createRecorder({
  scene: () => ctx.fire,
  audio: () => (ctx.engine?.source ? { ctx: ctx.engine.ctx, node: ctx.engine.delay } : null),
  onState: ({ recording, seconds, saved, error }) => {
    document.body.classList.toggle('is-recording', recording);
    recordLabel.textContent = recording
      ? `Rec ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : 'Record';
    if (saved) ctx.note(`Saved ${saved}`, 3);
    if (error) ctx.note(error, 3);
  },
});

// --- The pack (packUi.js): scene, weapon, spells and the knights by hand ------------------------
Object.assign(ctx, createPackUi(ctx));
app.append(ctx.pack.el);
// It sits just above the HUD while the HUD is up. (On the page's own box, not the body: a
// change restyles only what's in it.)
new ResizeObserver(() => app.style.setProperty('--hud-h', `${hud.hidden ? 0 : hud.offsetHeight}px`)).observe(hud);

// --- A MIDI controller (midiUi.js): pads for the moments, mapped by learning -------------------
Object.assign(ctx, createMidiUi(ctx));

// --- The output window (output.js): just the picture, for a projector -------------------------
Object.assign(ctx, createOutput(ctx));

markPreset(start, settings);
ctx.drawChips();
if (askedScene && !ctx.firstScene)
  ctx.showError(
    'That scene isn’t in this browser (it may have been made in another one). Pick another below, or make one in the Painter.',
  );
