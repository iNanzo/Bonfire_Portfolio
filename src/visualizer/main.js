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
import { applyCssPalette, base, flames } from '../palette.js';
import { effects } from '../effects.js';
import { startingEquipment, weapons } from '../content.js';
import { elementOr, flameTitle } from '../elements.js';
import { installDitherPatterns } from '../ui/dither.js';
import { installTooltips } from '../ui/tooltip.js';
import { createKeysOverlay, isHelpKey } from '../ui/keysOverlay.js';
import { applyFlame, setAccentRamp, setAccentRate } from '../ui/theme.js';
import { esc } from '../html.js';
import { createAnalyser, BAND_NAMES } from './analyser.js';
import { createDirector } from './director.js';
import { SHOTS } from './camera.js';
import { MODES, modeOf } from './looks.js';
import { COLOR_MODES } from './colors.js';
import { createDemo, DEMO_BPM } from './demo.js';
import { densityCounts } from './density.js';
import { loadSettings, saveSettings, flushSettings, applyPreset, PRESETS, defaults, scenesFrom, inLoop, frameCap } from './settings.js';
import { bindSettings, settingsMarkup, presetButtons, markPreset } from './settingsDialog.js';
import { KEY_GROUPS, keyList } from './keys.js';
import { createTickBatch } from './tickBatch.js';
import { stepRender, renderText, XRAY_VIEWS, FOGS } from './render.js';
import { HELMETS } from './knightShow.js';
import { STYLE_NAMES } from '../bonfire/knightStyles.js';
import { FINISH_NAMES } from '../bonfire/steel.js';
import { normalizeScene, parseRef, sceneRef, sceneSwatches } from '../scenes.js';
import { createSceneStore, THUMB_MAX } from '../sceneStore.js';
import * as siteContent from '../content.js';
import { createRenderMenu } from '../ui/renderMenu.js';
import { focusedNow } from '../ui/focus.js';
import { createLinkClient } from './link.js';
import { createDiscoveries } from '../ui/discoveries.js';
import { createPack, bonfireItems } from '../ui/pack.js';
import { createRecorder } from './record.js';
import { createMidi, MIDI_ACTIONS } from './midi.js';
import { logoMark } from '../ui/logo.js';
import { SCENERIES } from '../sceneries.js';
import { site, ui } from '../content.js';

// Finding this page is one of the site's discoveries (counted when you're back on the site).
createDiscoveries().discover('visualizer');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

// --- Settings (this browser only: settings.js) -----------------------------------------------
const settings = loadSettings();
// (Saving waits for changes to settle: what's waiting is written as the page goes or hides.)
addEventListener('pagehide', flushSettings);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSettings(); });

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
// ?scene=<ref>: open on that scene (the start screen's backdrop, and the first when the music
// starts); &solo: only that one this visit (the Painter's "Play in Bonfire Live").
const params = new URLSearchParams(location.search);
const askedScene = params.get('scene');
let firstScene = askedScene ? findScene(askedScene) : null;
let solo = firstScene && params.has('solo') ? firstScene.ref : null;

document.documentElement.classList.add('js');
applyCssPalette();
applyFlame(startingEquipment.flame);
installDitherPatterns(base);
installTooltips();
// (The accents follow the flame through a color blend: 8 times a second is smooth enough here,
// and each write restyles the whole page, the open settings too.)
setAccentRate(125);

// --- Markup ------------------------------------------------------------------------------------
const SOURCES = [
  ['input', 'Line In or Microphone', 'An audio interface or your mixer’s record out works best; a mic in the room works too. Echo cancelling and auto gain are off.'],
  ['capture', 'Tab or System Audio', 'Share a browser tab, or your whole screen with “Share system audio” ticked to catch rekordbox, Serato or Traktor on this computer.'],
  ['file', 'Play an Audio File', 'A mix or a track from this computer (you can also drop one anywhere on the page). Plays through your speakers.'],
  ['demo', 'Demo Track', `A synthesized ${DEMO_BPM} BPM loop with a breakdown and a drop, to see every reaction.`],
];
// The HUD's buttons and readouts each say what they do through the shared tooltip (on hover,
// focus or a tap), read out as their description; the ones whose label changes (Forge /
// Strike, Dance / Sit, Full Screen / Exit Full Screen) change their tip with it.
const HUD_TIPS = {
  meter: 'The sound in five bands, lows to highs.',
  pips: 'The bar: beat 1 is outlined.',
  bpm: 'Type a BPM to lock the tempo; leave it empty to follow the music.',
  early: 'Nudges the beat 10 ms earlier ([).',
  late: 'Nudges the beat 10 ms later (]).',
  downbeat: 'Makes this beat beat 1 of the bar (D).',
  tap: 'Tap along 4 times or more to set the tempo; the first tap is beat 1 (T).',
  drop: 'The drop: strikes the held weapon, or recolors the fire now (Space).',
  forge: 'Forges a new weapon and holds it over the fire until the drop (A).',
  strike: 'Strikes the held weapon into the fire now, as if the drop hit (A).',
  ring: 'The element’s ring races out across the ground (R).',
  living: 'The weapon leaves the fire and fights on the next beats (X).',
  dance: 'The knights get up and dance now, for a phrase (K; Shift+K: they come or go).',
  sit: 'The knights sit back down by the fire (K; Shift+K: they come or go).',
  cut: 'Cuts to another camera shot (C).',
  output: 'Opens a window with just the picture, to drag onto a projector (O).',
  record: 'Records a clip of the picture and the sound; press again to stop and save it (V).',
  settings: 'Settings: sound, show, picture, effects, camera, cast, scenes and setups (S).',
  keys: 'Every keyboard shortcut, in groups (?).',
  fullscreen: 'Fills the screen with the show (F).',
  exitFullscreen: 'Back from full screen (F, or Esc).',
};
/** A HUD element's tip: the attribute, and the hidden text read out as its description. */
const hudTip = (id, text = HUD_TIPS[id]) => ` data-tip="${esc(text)}" aria-describedby="viz-hud-${id}"`;
const hudNote = (id, text = HUD_TIPS[id]) => `<span class="visually-hidden" id="viz-hud-${id}">${esc(text)}</span>`;

const app = document.getElementById('viz');
app.innerHTML = `
  <div class="stage viz-stage" data-stage></div>
  <div class="kindled viz-title-card" data-title-card hidden>
    <div class="kindled-band"><p class="kindled-title" data-title-main></p><p class="kindled-sub" data-title-sub></p></div>
  </div>
  <p class="visually-hidden" aria-live="polite" data-live></p>

  <a class="brand viz-home" href="${esc(import.meta.env.BASE_URL)}" aria-label="${esc(site.name)}: back to the portfolio" data-home-link>
    ${logoMark('brand-mark')}<span class="brand-name">${esc(site.name)}</span>
  </a>
  <section class="viz-start" data-start aria-labelledby="viz-title">
    <div class="viz-start-copy">
      <p class="eyebrow">Audio-Reactive Visualizer</p>
      <h1 class="hero-name" id="viz-title" tabindex="-1">Bonfire Live</h1>
      <p class="hero-value">Feed it a DJ set. Kicks stoke the fire, breakdowns forge a new weapon over it, and the drop drives it into the ashes.</p>
      <nav class="title-menu viz-sources" aria-label="Sound Source">
        <ul role="list" data-sources>
          ${SOURCES.map(([id, label, hint]) => `
            <li><button class="title-item viz-source" type="button" data-source="${id}" data-tip="${esc(hint)}" aria-describedby="viz-src-${id}">
              <span class="cursor" aria-hidden="true"></span><span>${esc(label)}</span>
            </button><span class="visually-hidden" id="viz-src-${id}">${esc(hint)}</span></li>`).join('')}
        </ul>
      </nav>
      <label class="viz-field viz-device" data-device-row hidden>
        <span class="viz-field-label">Input Device</span>
        <select data-device></select>
      </label>
      <div class="viz-feel" role="group" aria-label="Presets: a kind of night in one click" data-feel>
        <span class="viz-group-label">Presets</span>
        ${presetButtons('viz-feel-pick', 'viz-start-preset')}
      </div>
      <div class="viz-feel viz-scene-chips" role="group" aria-label="Preset Scenes: play one behind the menu" data-scene-chips hidden></div>
      <p class="viz-solo" data-solo hidden></p>
      <div class="viz-start-row">
        <button class="pix-btn viz-start-settings" type="button" data-act="settings"${hudTip('start-settings', HUD_TIPS.settings)}><kbd>S</kbd>Settings</button>${hudNote('start-settings', HUD_TIPS.settings)}
        <button class="pix-btn viz-start-settings" type="button" data-act="keys"${hudTip('start-keys', HUD_TIPS.keys)}><kbd>?</kbd>Keys</button>${hudNote('start-keys', HUD_TIPS.keys)}
      </div>
      <p class="viz-error" role="alert" data-error hidden></p>
      <input type="file" accept="audio/*" data-file hidden>
    </div>
  </section>

  <footer class="viz-hud" data-hud hidden>
    <div class="viz-group viz-readout" role="group" aria-label="What It Hears">
      <div class="viz-meter" aria-hidden="true" data-tip="${esc(HUD_TIPS.meter)}">
        ${BAND_NAMES.map((b) => `<span class="viz-band" data-band="${b}"><i></i></span>`).join('')}
      </div>
      <div class="viz-status">
        <p class="viz-wield" data-wield></p>
        <p class="viz-state" data-state>Waiting for sound…</p>
        <button class="viz-scene-line" type="button" data-scene-line hidden><span class="viz-scene-label">Scene</span> <span class="viz-scene-name" data-scene-name></span><span class="visually-hidden">: Scenes &amp; Cards settings</span></button>
      </div>
    </div>
    <div class="viz-group viz-beat" role="group" aria-label="Beat">
      <span class="viz-group-label">Beat</span>
      <span class="viz-pips" aria-hidden="true" data-pips data-tip="${esc(HUD_TIPS.pips)}"><i></i><i></i><i></i><i></i></span>
      <span class="viz-bpm" data-bpm>--- BPM</span>
      <input class="viz-bpm-set" type="number" min="60" max="220" step="0.1" placeholder="Auto" data-bpm-set aria-label="Set the BPM"${hudTip('bpm')}>${hudNote('bpm')}
      <button class="pix-btn" type="button" data-act="nudge-early" aria-label="Nudge the Beat Earlier"${hudTip('early')}>‹</button>${hudNote('early')}
      <button class="pix-btn" type="button" data-act="nudge-late" aria-label="Nudge the Beat Later"${hudTip('late')}>›</button>${hudNote('late')}
      <button class="pix-btn" type="button" data-act="downbeat"${hudTip('downbeat')}><kbd>D</kbd>1</button>${hudNote('downbeat')}
      <button class="pix-btn" type="button" data-act="tap"${hudTip('tap')}><kbd>T</kbd>Tap</button>${hudNote('tap')}
    </div>
    <div class="viz-transport" data-transport hidden>
      <button class="pix-btn" type="button" data-act="play">Pause</button>
      <span class="viz-track" data-track></span>
      <span class="viz-progress" data-progress><i></i></span>
    </div>
    <div class="viz-group viz-actions" role="group" aria-label="Moments">
      <span class="viz-group-label">Moments</span>
      <button class="pix-btn" type="button" data-act="drop"${hudTip('drop')}><kbd>Space</kbd>Drop</button>${hudNote('drop')}
      <button class="pix-btn" type="button" data-act="arm"${hudTip('arm', HUD_TIPS.forge)}><kbd>A</kbd><span data-arm-label>Forge</span></button>${hudNote('arm', HUD_TIPS.forge)}
      <button class="pix-btn" type="button" data-act="ring"${hudTip('ring')}><kbd>R</kbd>Ring</button>${hudNote('ring')}
      <button class="pix-btn" type="button" data-act="combo"${hudTip('living')}><kbd>X</kbd>Living Weapon</button>${hudNote('living')}
      <button class="pix-btn" type="button" data-act="dance"${hudTip('dance-act', HUD_TIPS.dance)}><kbd>K</kbd><span data-dance-label>Dance</span></button>${hudNote('dance-act', HUD_TIPS.dance)}
    </div>
    <div class="viz-group viz-actions" role="group" aria-label="View">
      <span class="viz-group-label">View</span>
      <button class="pix-btn" type="button" data-act="cut"${hudTip('cut')}><kbd>C</kbd>Shot</button>${hudNote('cut')}
      <button class="pix-btn" type="button" data-act="output"${hudTip('output')}><kbd>O</kbd><span data-output-label>Output</span></button>${hudNote('output')}
      <button class="pix-btn viz-record" type="button" data-act="record"${hudTip('record')}><kbd>V</kbd><span data-record-label>Record</span></button>${hudNote('record')}
      <button class="pix-btn" type="button" data-act="settings"${hudTip('settings')}><kbd>S</kbd>Settings</button>${hudNote('settings')}
      <button class="pix-btn" type="button" data-act="keys"${hudTip('keys')}><kbd>?</kbd>Keys</button>${hudNote('keys')}
      <button class="pix-btn" type="button" data-act="fullscreen"${hudTip('fs', HUD_TIPS.fullscreen)}><kbd>F</kbd><span data-fs-label>Full Screen</span></button>${hudNote('fs', HUD_TIPS.fullscreen)}
    </div>
  </footer>

  ${settingsMarkup(settings, keyList(), { base: import.meta.env.BASE_URL })}
`;

/** A HUD button's changing label, and its tip with it (written only when it changes). */
function relabel(labelEl, text, tipId, tip) {
  if (labelEl.textContent === text) return;
  labelEl.textContent = text;
  labelEl.closest('[data-tip]')?.setAttribute('data-tip', tip);
  const said = document.getElementById(`viz-hud-${tipId}`);
  if (said) said.textContent = tip;
}

const stage = q('[data-stage]');
const hud = q('[data-hud]');
const start = q('[data-start]');
const live = q('[data-live]');
const errorEl = q('[data-error]');
const settingsDialog = q('[data-settings]');
document.body.dataset.mode = 'start';

// --- The bonfire ---------------------------------------------------------------------------
let fire = null;
let director = null;
let engine = null; // { ctx, analyser, delay, monitor, source }
let lastFeatures = null;
const IDLE = { state: 'silent', bands: Object.fromEntries(BAND_NAMES.map((b) => [b, 0])), level: 0, beats: [], events: [], kick: 0, hat: 0, bpm: 0, locked: false, build: 0 };

function wieldLabel(sel) {
  return `${weapons[sel.weapon] ?? ''} · ${flameTitle(flames[sel.flame]?.name, sel.element)}`;
}
function onImpact(flameKey, _from, instant, selection) {
  document.documentElement.dataset.flame = flameKey;
  document.documentElement.dataset.element = elementOr(selection.element);
  q('[data-wield]').textContent = wieldLabel({ ...selection, flame: flameKey });
  if (instant) applyFlame(flameKey);
  director?.landed(flameKey);
}

// Ableton Link (link.js): while it's the beat's source, the session sets the grid.
const link = createLinkClient({ port: () => settings.linkPort, onStatus: (text) => { if (settingsPanel) settingsPanel.linkStatus = text; } });
// The sound is analysed on every frame the display shows (onTick), whatever Frame Rate
// draws; the director and the HUD go with the drawn frames (onFrame), taking all it heard
// since the last one (tickBatch.js).
const heard = createTickBatch();
function onTick(dt) {
  const now = performance.now() / 1000;
  if (settings.beatFrom === 'link' && engine?.source) link.update(now, engine.analyser.tempo);
  else link.close();
  if (engine?.source) heard.add(engine.analyser.update(now, dt, { sensitivity: settings.sensitivity, lead: settings.offset / 1000 }));
}
function onFrame(dt) {
  const f = (engine?.source && heard.take()) || IDLE;
  lastFeatures = f;
  director.update(f, dt);
  if (engine?.source) drawHud(f, dt);
}
/** Frame Rate as the scene's cap (only when it changed: a new cap starts its count again). */
function applyFrameRate() {
  const cap = frameCap(settings.frameRate);
  if (fire && fire.maxFps !== cap) fire.setMaxFps(cap);
}

function failScene(error) {
  fire?.dispose();
  fire = null;
  document.documentElement.classList.add('no-webgl');
  showError('This browser couldn’t start WebGL, so the bonfire can’t render here. Try Chrome or Edge with hardware acceleration on.');
  console.warn('Bonfire unavailable.', error);
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
      reducedMotion, sway: 0, lightTrails: settings.trails, effects: true, onImpact, onRamp: setAccentRamp, onError: failScene,
      onFrame: (dt) => { if (fire === candidate) onFrame(dt); },
      onTick: (dt) => { if (fire === candidate) onTick(dt); },
    });
    const nextDirector = createDirector(candidate, { settings, reducedMotion, onEvent, scenes: loopLibrary });
    await candidate.ready;
    if (generation !== sceneGeneration) { candidate.dispose(); return; }
    const prev = fire;
    // (A rebuilt scene carries on with the preset scene that was playing.)
    const playing = director?.sceneRef ? findScene(director.sceneRef) : null;
    recorder?.stop(); // (a clip ends with the scene it was recording)
    fire = candidate;
    director = nextDirector;
    frameFire();
    applyFrameRate();
    // (Dev builds, and any build with ?bench in its address: tools/bench-viz.mjs drives the show through it.)
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('bench')) window.__viz = { fire, director, settings, get engine() { return engine; }, get features() { return lastFeatures; } };
    director.applyRender(); // (the Render tab: render.js)
    const eq = prev ? { weapon: prev.weapon, flame: prev.flame, element: prev.element } : { weapon: startingEquipment.weapon, flame: startingEquipment.flame, element: elementOr(startingEquipment.element) };
    prev?.dispose();
    await fire.equip(eq.weapon, eq.flame, { instant: true, element: eq.element });
    fire.setScenery(settings.scenery === 'mix' ? prev?.scenery ?? 'ruins' : settings.scenery);
    // (The first build opens on ?scene= or a chip picked while it loaded.)
    const opening = prev ? playing : playing ?? firstScene;
    if (opening) playScene(opening, { instant: true, lock: opening.ref === solo });
    stage.classList.add('is-ready');
    if (output && !output.closed) streamInto(output);
  }).catch(failScene);
}
startScene();

// --- Director events → page ------------------------------------------------------------------
let stateNote = null; // a transient HUD line: { text, until }
let atDropFor = null; // the ref of the scene N asked for in a breakdown, waiting for the drop's strike
function onEvent(type, data = {}) {
  if (type === 'drop') {
    note('Drop!');
    live.textContent = 'Drop.';
    if (data.title !== false) nextCard('drops');
  } else if (type === 'arm') {
    note('Forging a blade for the drop…', 4);
  } else if (type === 'start') {
    if (settings.intro) showCard(0);
    // (A scene already playing when the music starts, from ?scene=, a chip or N on the start
    // screen, carries on without a new 'scene' event: its picture is kept from here.)
    if (director?.sceneRef) keepThumb(director.sceneRef);
  } else if (type === 'bar') {
    if (data.bar > 0 && data.bar % 32 === 0) nextCard('phrases');
  } else if (type === 'stage') {
    note(['', 'Building…', 'Building… halfway', 'Building… three quarters', 'Here it comes'][data.stage] ?? '', 2);
  } else if (type === 'scene') {
    sceneArrived(data);
  }
}
function note(text, seconds = 2) { stateNote = { text, until: performance.now() / 1000 + seconds }; }

// --- Title cards ----------------------------------------------------------------------------
// Card 0 is the main one (settings.title/subtitle); 1… are settings.cards. `show` says when
// each of the others comes up: on drops (taking turns with the main one, if it shows on
// drops), every 32 bars, or only on its key.
const titleCard = q('[data-title-card]');
let titleTimer = 0;
const cardAt = (n) => (n === 0 ? { title: settings.title, subtitle: settings.subtitle } : settings.cards[n - 1]);
const turns = { drops: 0, phrases: 0 };
/** The next card whose turn it is for `when` (drops | phrases), if any. */
function nextCard(when) {
  const pool = [];
  if (when === 'drops' && settings.titleOnDrop && settings.title.trim()) pool.push(0);
  settings.cards.forEach((c, i) => { if (c.show === when && c.title.trim()) pool.push(i + 1); });
  if (!pool.length) return;
  showCard(pool[turns[when]++ % pool.length]);
}
let cardUntil = 0;       // (performance time) when the card showing goes
let sceneCardNext = null; // a scene's card waiting for the one showing to go
/**
 * Show card `n` (0 the main one), or a card of its own ({ title, subtitle, scene }: a
 * preset scene's name, smaller, which waits for a title card of yours that's showing).
 */
function showCard(n, { ms = 3600 } = {}) {
  const card = typeof n === 'number' ? cardAt(n) : n;
  if (!card?.title?.trim()) return;
  const now = performance.now();
  if (card.scene && !titleCard.hidden && !titleCard.classList.contains('is-scene') && now < cardUntil) { sceneCardNext = card; return; }
  titleCard.classList.toggle('is-scene', !!card.scene);
  q('[data-title-main]').textContent = card.title;
  q('[data-title-sub]').textContent = card.subtitle ?? '';
  q('[data-title-sub]').hidden = !card.subtitle?.trim();
  titleCard.style.setProperty('--kindle-time', `${ms}ms`);
  titleCard.hidden = true;
  void titleCard.offsetWidth;
  titleCard.hidden = false;
  cardUntil = now + ms;
  mirrorCard();
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => {
    titleCard.hidden = true;
    mirrorCard();
    const next = sceneCardNext;
    sceneCardNext = null;
    if (next) showCard(next, { ms: 2600 });
  }, ms);
}

// --- Preset scenes: playing one, naming it, the start screen's chips --------------------------
const sceneLine = q('[data-scene-line]');
const sceneNameEl = q('[data-scene-name]');
const chipsEl = q('[data-scene-chips]');
const soloEl = q('[data-solo]');
const SCENE_SWITCH = { off: 'Off: the show plays free', mix: 'In the mix', on: 'Always' };

/**
 * Play a scene: at once (`instant`: behind the start menu, a rebuilt scene), or while the
 * music plays on its next downbeat, in a flash. `lock`: only this one until N (the Painter's
 * solo); any other pick ends a solo. Null: back to the free show. The loop carries on from it.
 */
function playScene(entry, { instant = false, lock = false } = {}) {
  if (!director) return;
  director.scene(entry, { instant, flash: !instant, onBeat: !instant });
  const next = lock && entry ? entry.ref : null;
  if (next !== solo || lock) director.lockScene(next);
  solo = next;
  showScene();
}

/** The director says a scene arrived ({ name, ref }; no name: the free show again). */
function sceneArrived({ name = null, ref = null } = {}) {
  showScene();
  if (!name || !engine?.source) return;
  note(`Scene: ${name}`, 2);
  live.textContent = `Scene: ${name}.`;
  const cards = modeOf(settings.sceneCards, 'off');
  if (cards === 'on' || (cards === 'mix' && Math.random() < 0.5)) showCard({ title: name, scene: true }, { ms: 2600 });
  if (ref) keepThumb(ref);
}

let named = '';
/** Where a solo scene came from, for the HUD: one of mine from the Painter, a built-in on its own. */
const soloFrom = (ref) => (ref.startsWith('m:') ? 'from the Painter' : 'on its own');

/** The scene playing, everywhere it shows: the HUD's line, the chips, the Scenes tab, the solo note. */
function showScene() {
  const ref = director?.sceneRef ?? null;
  const name = director?.sceneName ?? null;
  const some = loopLibrary().length > 0;
  const key = `${ref}|${name}|${solo}|${modeOf(settings.scenes)}|${some}`;
  if (key === named) return;
  named = key;
  // (The line shows while one plays, or while scenes are on and there are some: the free
  // show in between says so.)
  sceneLine.hidden = !name && (modeOf(settings.scenes) === 'off' || !some);
  sceneLine.classList.toggle('is-free', !name);
  sceneLine.classList.toggle('is-solo', !!solo);
  sceneNameEl.textContent = name ? `${name}${solo ? ` · ${soloFrom(solo)}` : ''}` : 'The Free Show';
  for (const c of chipsEl.querySelectorAll('[data-scene-chip]')) c.setAttribute('aria-pressed', String(c.dataset.sceneChip === ref));
  settingsPanel.markScene(ref);
  soloEl.hidden = !(solo && name);
  soloEl.textContent = solo && name ? `Playing “${name}” ${soloFrom(solo)}. N: back to the loop.` : '';
}

/** The start screen's chips: up to 8 scenes (the loop's first), then All Scenes…. */
function drawChips() {
  const list = loopLibrary();
  const ordered = [...list.filter((e) => inLoop(settings, e.ref)), ...list.filter((e) => !inLoop(settings, e.ref))];
  const shown = ordered.slice(0, 8);
  // (The one playing always has its chip: a hidden built-in, say, from ?scene=.)
  const playing = director?.sceneRef ? findScene(director.sceneRef) : firstScene;
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
  if (e.target.closest('[data-scenes-all]')) { openSettings('scenes'); return; }
  const chip = e.target.closest('[data-scene-chip]');
  if (!chip) return;
  // A click plays it behind the menu (and it opens the show); again: the free show.
  const entry = chip.getAttribute('aria-pressed') === 'true' ? null : findScene(chip.dataset.sceneChip);
  firstScene = entry;
  playScene(entry, { instant: true });
});
sceneLine.addEventListener('click', () => openSettings('scenes'));

/** N: the next scene (at once behind the start menu; live, on the next downbeat in a flash). */
function nextScene() {
  if (!director) return;
  if (document.body.dataset.mode !== 'live') {
    const inLoopNow = loopLibrary().filter((e) => inLoop(settings, e.ref));
    const list = inLoopNow.length ? inLoopNow : loopLibrary();
    if (!list.length) { live.textContent = 'No scenes yet: make one in the Painter.'; return; }
    const next = list[(list.findIndex((e) => e.ref === director.sceneRef) + 1) % list.length];
    firstScene = next;
    playScene(next, { instant: true });
    live.textContent = `Scene: ${next.scene.name}.`;
    return;
  }
  // (Out of a solo too: the loop again. With a blade held for the drop, it waits for the
  // drop's strike: the note says so, and the HUD's line keeps saying so until it lands.)
  const next = director.nextScene();
  solo = null;
  const atDrop = !!next && director.sceneWhen === 'drop';
  atDropFor = atDrop ? next.ref : null;
  note(next ? `Next scene: ${next.scene.name}${atDrop ? ', at the drop' : ''}` : 'No scenes yet: make one in the Painter', atDrop ? 3 : 1.8);
  showScene();
}
/**
 * The name of the scene N asked for while it waits for the drop's strike (null once it has
 * landed, or something else is coming instead), for the HUD's line.
 */
function waitingForDrop() {
  const up = director?.upNext;
  if (atDropFor && (director?.sceneWhen !== 'drop' || typeof up !== 'object' || up?.ref !== atDropFor)) atDropFor = null;
  return atDropFor && typeof up === 'object' ? up?.scene?.name ?? null : null;
}
/** Shift+N: Scenes in the mix → always → off. */
function cycleScenes() {
  const order = ['mix', 'on', 'off'];
  settings.scenes = order[(order.indexOf(modeOf(settings.scenes)) + 1) % order.length];
  settingsPanel.fill();
  applySettings('scenes');
  note(`Scenes: ${SCENE_SWITCH[settings.scenes]}`, 1.5);
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
  if (!ref.startsWith('b:') || store.thumb(ref) || !fire?.captureThumb || thumbing.has(ref)) return;
  thumbing.add(ref);
  setTimeout(() => whenIdle(async () => {
    thumbing.delete(ref);
    if (director?.sceneRef !== ref || !fire || document.body.dataset.mode !== 'live') return;
    try {
      const url = await fire.captureThumb(192, 108);
      if (url?.startsWith('data:image/webp') && url.length <= THUMB_MAX) store.setThumb(ref, url);
    } catch { /* no picture this time */ }
  }), 2500);
}

// The library changes when a Painter tab saves (or deletes) a scene; and a Painter can hand
// one over to play now ("Play in Bonfire Live").
store.onChange(() => {
  libraryCache = null;
  settingsPanel.drawScenes();
  drawChips();
});
store.onPlay((ref) => {
  const entry = findScene(ref);
  if (!entry || !director) return false;
  playScene(entry, { instant: document.body.dataset.mode !== 'live' });
  if (document.body.dataset.mode !== 'live') firstScene = entry;
  note(`Playing “${entry.scene.name}” from the Painter`, 2.5);
  return true;
});

// --- Audio ---------------------------------------------------------------------------------
function openEngine() {
  if (!engine) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    const analyser = createAnalyser(ctx);
    const delay = ctx.createDelay(1);
    delay.connect(analyser.node);
    const monitor = ctx.createGain();
    monitor.gain.value = settings.volume;
    monitor.connect(ctx.destination);
    engine = { ctx, analyser, delay, monitor, source: null };
  }
  return engine;
}

const NO_PROCESSING = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

async function openInput(e, deviceId) {
  const constraints = (id) => ({ audio: { ...NO_PROCESSING, channelCount: { ideal: 2 }, ...(id ? { deviceId: { exact: id } } : {}) } });
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints(deviceId));
  } catch (error) {
    if (!deviceId || error.name !== 'OverconstrainedError') throw error;
    stream = await navigator.mediaDevices.getUserMedia(constraints(''));
  }
  const node = e.ctx.createMediaStreamSource(stream);
  node.connect(e.delay);
  const track = stream.getAudioTracks()[0];
  settings.deviceId = track?.getSettings?.().deviceId ?? deviceId ?? '';
  saveSettings(settings);
  return {
    kind: 'input', name: track?.label || 'Audio input', track,
    stop() { node.disconnect(); stream.getTracks().forEach((t) => t.stop()); },
  };
}

async function openCapture(e) {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser can’t share tab or system audio. Try Chrome or Edge on a computer.');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { ...NO_PROCESSING, suppressLocalAudioPlayback: false },
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  });
  const track = stream.getAudioTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('No sound was shared. Share again, and turn on “Share tab audio” (for a tab) or “Share system audio” (for your screen).');
  }
  stream.getVideoTracks().forEach((t) => t.stop()); // only the sound is needed
  const node = e.ctx.createMediaStreamSource(new MediaStream([track]));
  node.connect(e.delay);
  return {
    kind: 'capture', name: track.label || 'Shared audio', track,
    stop() { node.disconnect(); track.stop(); },
  };
}

function openFile(e, file) {
  const media = new Audio();
  media.src = URL.createObjectURL(file);
  const node = e.ctx.createMediaElementSource(media);
  node.connect(e.delay);
  node.connect(e.monitor);
  return media.play().then(() => ({
    kind: 'file', name: file.name.replace(/\.[a-z0-9]+$/i, ''), media, playback: true,
    stop() { media.pause(); node.disconnect(); URL.revokeObjectURL(media.src); },
  }));
}

function openDemo(e) {
  const bus = e.ctx.createGain();
  bus.connect(e.delay);
  bus.connect(e.monitor);
  const demo = createDemo(e.ctx, bus);
  demo.start();
  return { kind: 'demo', name: `Demo Track · ${DEMO_BPM} BPM`, demo, playback: true, stop() { demo.stop(); bus.disconnect(); } };
}

/** The sound goes (Change, a shared track ending, another source): the show as if it fell silent. */
function stopSource() {
  if (!engine?.source) return;
  engine.source.stop();
  engine.source = null;
  engine.analyser.reset(); // (silent again, without a 'silence' event of its own)
  heard.clear();
  director?.silence();
}

let busy = false;
async function useSource(kind, { file = null } = {}) {
  if (busy) return;
  busy = true;
  hideError();
  const e = openEngine(); // created inside the click, so the browser lets it play
  try {
    const resumed = e.ctx.resume();
    stopSource();
    const source = kind === 'input' ? await openInput(e, settings.deviceId)
      : kind === 'capture' ? await openCapture(e)
      : kind === 'file' ? await openFile(e, file)
      : openDemo(e);
    await resumed;
    // What plays through the speakers is heard after the output latency; delay the
    // analysis by as much so the fire moves with what the room hears.
    const latency = source.playback ? Math.min(0.5, e.ctx.outputLatency || e.ctx.baseLatency || 0.02) : 0;
    e.delay.delayTime.value = latency;
    e.analyser.reset();
    heard.clear();
    e.source = source;
    source.track?.addEventListener('ended', () => {
      if (e.source !== source) return;
      stopSource();
      showStart('The shared sound stopped. Pick a source to carry on.');
    });
    if (kind === 'input') await listDevices();
    goLive();
  } catch (error) {
    showError(describeError(error, kind));
  } finally {
    busy = false;
  }
}

function describeError(error, kind) {
  if (error?.name === 'NotAllowedError') {
    return kind === 'capture' ? 'Sharing was cancelled or blocked.' : 'The browser wasn’t allowed to use the microphone or line in. Allow it in the address bar’s site settings and try again.';
  }
  if (error?.name === 'NotFoundError') return 'No audio input was found. Plug in your interface or mic and try again.';
  if (error?.name === 'NotReadableError') return 'That input is busy or unavailable (another app may have it exclusively).';
  if (kind === 'file') return error?.name === 'NotAllowedError' ? 'The browser held the sound back. Click the page once, then try the file again.' : 'That file couldn’t be played. Try an MP3, WAV, AAC or FLAC file.';
  return error?.message || 'Something went wrong starting the sound.';
}

async function listDevices() {
  const row = q('[data-device-row]');
  const sel = q('[data-device]');
  try {
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId);
    if (!inputs.length || !inputs[0].label) { row.hidden = true; return; }
    sel.innerHTML = inputs.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label)}</option>`).join('');
    sel.value = settings.deviceId && inputs.some((d) => d.deviceId === settings.deviceId) ? settings.deviceId : inputs[0].deviceId;
    row.hidden = false;
  } catch { row.hidden = true; }
}
q('[data-device]').addEventListener('change', (e) => {
  settings.deviceId = e.target.value;
  saveSettings(settings);
  if (engine?.source?.kind === 'input') useSource('input');
});

// --- Start screen ----------------------------------------------------------------------------
const fileInput = q('[data-file]');
qa('[data-source]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.source === 'file') fileInput.click();
    else useSource(btn.dataset.source);
  });
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) useSource('file', { file });
});
// Drop a file anywhere.
window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|aac|m4a|ogg|opus|aiff?)$/i.test(f.name));
  if (!file) return;
  e.preventDefault();
  useSource('file', { file });
});
if (navigator.mediaDevices?.enumerateDevices) listDevices();

// On the start screen the fire moves aside for the menu: to its right on a landscape
// screen (further on a narrower one, where the menu takes more of it), above it on a tall one.
function frameFire() {
  if (!director) return;
  const menu = document.body.dataset.mode === 'start';
  const side = innerWidth >= 760 && innerWidth > innerHeight;
  director.frame(menu && side ? (innerWidth >= 1100 ? 0.2 : 0.36) : 0, menu && !side ? 0.24 : 0);
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
  const s = engine.source;
  q('[data-source-name]').textContent = `${{ input: 'Line in', capture: 'Shared audio', file: 'File', demo: 'Demo' }[s.kind]}: ${s.name}`;
  q('[data-transport]').hidden = !s.media;
  q('[data-track]').textContent = s.media ? s.name : '';
  q('[data-volume-row]').hidden = !s.playback;
  if (fire) q('[data-wield]').textContent = wieldLabel({ weapon: fire.weapon, flame: fire.flame, element: fire.element });
  live.textContent = `Listening to ${s.name}.`;
  frameFire();
  keepAwake();
  wake();
}

// --- HUD -------------------------------------------------------------------------------------
// (Written only when what it shows changes: each write would restyle the HUD.)
const bandEls = BAND_NAMES.map((b) => q(`[data-band="${b}"]`));
const bandShown = BAND_NAMES.map(() => '');
const pips = qa('[data-pips] i');
const bpmEl = q('[data-bpm]');
const stateEl = q('[data-state]');
const armLabel = q('[data-arm-label]');
const danceLabel = q('[data-dance-label]');
const progress = q('[data-progress] i');
let progressShown = '';
let hudClock = 0;
let pipOn = -1;
/** Write `text` into `el` if it isn't there already. */
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
function drawMeter(f) {
  // (Stepped like everything else: eighths.)
  BAND_NAMES.forEach((b, i) => {
    const v = (Math.round(f.bands[b] * 8) / 8).toFixed(3);
    if (v !== bandShown[i]) { bandShown[i] = v; bandEls[i].style.setProperty('--v', v); }
  });
  for (const beat of f.beats) {
    if (!f.locked) continue;
    pipOn = beat.beat;
    pips.forEach((p, i) => { p.classList.toggle('is-on', i === pipOn); p.classList.toggle('is-down', i === 0); });
  }
  if (!f.locked && pipOn >= 0) { pips.forEach((p) => p.classList.remove('is-on')); pipOn = -1; }
}
/** The HUD's state line: a note, the section, a weapon waiting for the drop, the knights. */
function stateText(f) {
  const now = performance.now() / 1000;
  const noting = stateNote && now < stateNote.until;
  // (A scene N asked for in a breakdown: the line says it comes with the drop until it lands.)
  const waiting = waitingForDrop();
  const waits = waiting ? `“${waiting}” comes with the drop` : 'the weapon waits for the drop';
  let text;
  if (noting) text = waiting && !stateNote.text.includes(waiting) ? `${stateNote.text} · ${waits}` : stateNote.text;
  else if (f.state === 'silent') text = 'Waiting for sound…';
  else if (f.state === 'breakdown' || f.state === 'build') {
    const what = f.state === 'build' ? `Build ${Math.round(f.build * 100)}%` : 'Breakdown';
    text = fire?.holding ? `${what} · ${waits}` : what;
  } else if (fire?.holding) text = waiting ? `The weapon waits for the drop: ${waits}` : 'The weapon waits for the drop';
  else text = f.locked ? 'In the groove' : 'Listening for the beat…';
  // ...and what the knights are doing.
  const knights = director?.knights;
  if (knights?.text && !noting && f.state !== 'silent') text += ` · ${knights.text}`;
  return text;
}
function drawHud(f, dt) {
  drawMeter(f);
  hudClock += dt;
  if (hudClock < 0.1) return;
  hudClock = 0;
  const by = engine.analyser.tempo.manual; // tap | manual | link | null (heard)
  const tag = { tap: ' · Tap', manual: ' · Set', link: ' · Link' }[by] ?? '';
  setText(bpmEl, f.bpm ? `${f.locked ? '' : '~'}${by === 'link' || by === 'manual' ? f.bpm.toFixed(1) : Math.round(f.bpm)} BPM${tag}` : '--- BPM');
  bpmEl.classList.toggle('is-locked', f.locked);
  setText(stateEl, stateText(f));
  const holding = !!fire?.holding;
  relabel(armLabel, holding ? 'Strike' : 'Forge', 'arm', holding ? HUD_TIPS.strike : HUD_TIPS.forge);
  const up = !!director?.knights && director.knights.mode !== 'rest';
  relabel(danceLabel, up ? 'Sit' : 'Dance', 'dance-act', up ? HUD_TIPS.sit : HUD_TIPS.dance);
  showScene();
  const media = engine.source?.media;
  if (media && media.duration) {
    const p = (media.currentTime / media.duration).toFixed(3);
    if (p !== progressShown) { progressShown = p; progress.style.setProperty('--p', p); }
  }
}

// Idle: the controls and cursor fade when the mouse rests (unless hidden or in use).
let idleTimer = 0;
function wake() {
  document.body.classList.remove('is-idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (document.body.dataset.mode !== 'live' || settingsDialog.open || keysOverlay.el.open || hud.contains(document.activeElement) || renderMenu.el.contains(document.activeElement)) return;
    document.body.classList.add('is-idle');
  }, 3000);
}
window.addEventListener('pointermove', wake, { passive: true });
window.addEventListener('pointerdown', wake, { passive: true });
hud.addEventListener('focusin', wake);

// Keep the screen on while it's playing.
let wakeLock = null;
async function keepAwake() {
  try { if (!wakeLock || wakeLock.released) wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed: fine */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && engine?.source) keepAwake(); });

// --- Actions ---------------------------------------------------------------------------------
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
document.addEventListener('fullscreenchange', () => {
  const full = !!document.fullscreenElement;
  relabel(q('[data-fs-label]'), full ? 'Exit Full Screen' : 'Full Screen', 'fs', full ? HUD_TIPS.exitFullscreen : HUD_TIPS.fullscreen);
});

function tap() {
  if (!engine?.source) return;
  const bpm = engine.analyser.tempo.tap(performance.now() / 1000);
  note(bpm ? `Tapped ${Math.round(bpm)} BPM` : 'Tap…', 1.2);
}

const actions = {
  drop: () => director?.strike(),
  arm: () => { if (fire?.holding) director.strike(); else director?.arm(); },
  beat: () => { if (director?.forgeOnBeat(lastFeatures?.bpm ? 60 / lastFeatures.bpm : 0)) note('Swapping on the next downbeat', 2); },
  tap,
  ring: () => director?.ring(1),
  combo: () => { if (!director?.combo()) note('The weapon is busy (or no beat yet)', 1.5); },
  cut: () => { director?.cut(); note(`Shot: ${SHOTS[director?.shot]?.name ?? ''}`, 1.5); },
  dance: () => {
    const r = director?.danceNow();
    note(r === 'dance' ? 'The knights get up to dance' : r === 'sit' ? 'The knights sit back down' : reducedMotion ? 'The knights keep still (reduced motion)' : 'No knights by the fire', 1.5);
  },
  knights: () => {
    const r = director?.knightsInOut();
    note({ in: 'The knights come to the fire', out: 'The knights leave the fire', 'in-next': 'The knights come on the next drop', 'out-next': 'The knights leave on the next drop' }[r] ?? 'No knights here', 1.8);
  },
  colors: () => {
    const modes = Object.keys(COLOR_MODES);
    settings.colors = modes[(modes.indexOf(settings.colors) + 1) % modes.length];
    saveSettings(settings);
    note(`Colors: ${COLOR_MODES[settings.colors]}`, 1.5);
  },
  mirror: () => {
    const modes = ['mix', 'on', 'off'];
    settings.mirror = modes[(modes.indexOf(settings.mirror) + 1) % modes.length];
    saveSettings(settings);
    note(`Mirror: ${Object.fromEntries(MODES)[settings.mirror]}`, 1.2);
  },
  settings: () => openSettings(),
  keys: () => openKeys(),
  fullscreen: toggleFullscreen,
  play: () => {
    const m = engine?.source?.media;
    if (!m) return;
    if (m.paused) m.play(); else m.pause();
    q('[data-act="play"]').textContent = m.paused ? 'Play' : 'Pause';
  },
  'change-source': () => { stopSource(); showStart(); },
  'show-title': () => { if (!settings.title.trim()) q('[data-set="title"]').focus(); else { settingsDialog.close(); showCard(0); } },
  output: () => openOutput(),
  record: () => recorder.toggle(),
  'nudge-early': () => nudge(-0.01),
  'nudge-late': () => nudge(0.01),
  downbeat: () => {
    if (!engine?.source) return;
    engine.analyser.tempo.anchor(performance.now() / 1000);
    note('This beat is beat 1', 1.2);
  },
};
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (btn) actions[btn.dataset.act]?.();
});
q('[data-progress]').addEventListener('click', (e) => {
  const m = engine?.source?.media;
  if (!m?.duration) return;
  const r = e.currentTarget.getBoundingClientRect();
  m.currentTime = ((e.clientX - r.left) / r.width) * m.duration;
});

const typing = (el) => el?.closest?.('input, select, textarea, [contenteditable]');
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
  if (settingsDialog.open || keysOverlay.el.open) return; // each handles its own keys (Esc closes)
  // The render menu first: P, and its digits while it's open (before the element hits).
  if (renderMenu.handleKey(e)) { e.preventDefault(); wake(); return; }
  if (e.key === 'Escape' && renderMenu.isOpen) { renderMenu.close(); return; }
  // ? lists the shortcuts; / opens the settings at their search box.
  if (isHelpKey(e)) { e.preventDefault(); openKeys(); return; }
  if (e.key === '/') { e.preventDefault(); openSettings(undefined, { search: true }); return; }
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFullscreen();
  else if (k === 's') openSettings();
  else if (k === 'h') { document.body.classList.toggle('hud-off'); wake(); }
  else if (k === 'i') { pack.toggle(); wake(); }
  else if (k === 'n') { if (e.shiftKey) cycleScenes(); else nextScene(); wake(); }
  else if (document.body.dataset.mode !== 'live' || !fire) return;
  else if (e.key === ' ') { e.preventDefault(); actions.drop(); }
  else if (k === 'a') actions.arm();
  else if (k === 'b') actions.beat();
  else if (k === 't') tap();
  else if (k === 'd') actions.downbeat();
  else if (e.key === '[') nudge(-0.01);
  else if (e.key === ']') nudge(0.01);
  else if (k === 'o') openOutput();
  else if (k === 'v') actions.record();
  else if (e.shiftKey && /^Digit[1-9]$/.test(e.code)) showCard(Number(e.code.slice(5)) - 1);
  else if (k === 'c') actions.cut();
  else if (k === 'r') director.ring(1);
  else if (k === 'x') actions.combo();
  else if (k === 'g') director.glitchHit();
  else if (k === 'l') note(`Look: ${director.nextLook()}`, 1.5);
  else if (k === 'm') actions.mirror();
  else if (k === 'p' && e.shiftKey) actions.colors();
  else if (k === 'k') actions[e.shiftKey ? 'knights' : 'dance']();
  else if (k === 'escape') { document.body.classList.remove('hud-off'); wake(); }
  else if (['1', '2', '3'].includes(e.key)) director.hit({ element: ['fire', 'lightning', 'ice'][Number(e.key) - 1] });
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') director.hit({ step: e.key === 'ArrowRight' ? 1 : -1, element: fire.element });
});

// --- Settings dialog (settingsDialog.js) ---------------------------------------------------------
// Settings the scene is built with (particle counts size its buffers; the fireflies' trails
// are made with it): changing one rebuilds it.
const REBUILD = ['particles', 'trails'];
const builtWith = () => REBUILD.map((k) => String(settings[k])).join();
let built = builtWith();
let rebuildTimer = 0;
/** A render setting changed (the P menu): only the picture, the rest of the show as it is. */
function applyRender() {
  director?.applyRender();
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
  if (keys.length) director?.releaseScene(keys.includes('xray') ? [...keys, 'xrayView'] : keys);
  if (builtWith() !== built) {
    built = builtWith();
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(startScene, 200);
  }
  if (engine) engine.monitor.gain.value = settings.volume;
  applyFrameRate();
  director?.applyRender();
  const held = !!director?.sceneRef;
  if (settings.scenery !== 'mix' && (!held || keys.includes('scenery'))) fire?.setScenery(settings.scenery);
  if (!held || keys.includes('shot')) director?.setShot(settings.shot);
  // Scenes switched off: back to the free show now (a solo from the Painter stays).
  if (keys.includes('scenes') && modeOf(settings.scenes) === 'off' && held && !solo) playScene(null, { instant: !engine?.source });
  if (keys.some((k) => k === 'sceneFrom' || k === 'sceneList')) drawChips();
  saveSettings(settings);
  markPreset(start, settings);
  showScene();
}
const settingsPanel = bindSettings(settingsDialog, settings, {
  onChange: applySettings,
  onNote: (text) => note(text, 1.5),
  scenes: library,
  thumb: (ref) => store.thumb(ref),
  onPlayScene: (ref) => {
    const entry = findScene(ref);
    if (!entry) return;
    if (document.body.dataset.mode !== 'live') firstScene = entry;
    playScene(entry, { instant: document.body.dataset.mode !== 'live' });
  },
  base: import.meta.env.BASE_URL,
  midi: () => MIDI_NAMES,
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
  const shown = director?.parts?.layers?.view ?? settings;
  const over = director?.parts?.layers?.over ?? {};
  const v = Object.fromEntries(RENDER_ROWS.map((r) => [r.id, `${renderText(shown, r.id)}${Object.hasOwn(over, r.id) ? ' · Scene' : ''}`]));
  const live = director?.render;
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
    const over = director?.parts?.layers?.over;
    if (over && Object.hasOwn(over, id)) settings[id] = over[id];
    director?.releaseScene(id === 'xray' ? [id, 'xrayView'] : [id]);
    stepRender(settings, /** @type {any} */ (id), dir);
    applyRender();
    return renderValues();
  },
  reset: {
    key: '0', label: 'Reset Render Settings', hint: 'To the Defaults',
    run: () => {
      const d = defaults();
      for (const r of RENDER_ROWS) settings[r.id] = d[r.id];
      director?.releaseScene([...RENDER_ROWS.map((r) => r.id), 'xrayView']);
      applyRender();
    },
  },
  onToggle: () => wake(),
});
app.append(renderMenu.el);

// --- Recording a clip (record.js) -------------------------------------------------------------
const recordLabel = q('[data-record-label]');
const recorder = createRecorder({
  scene: () => fire,
  audio: () => (engine?.source ? { ctx: engine.ctx, node: engine.delay } : null),
  onState: ({ recording, seconds, saved, error }) => {
    document.body.classList.toggle('is-recording', recording);
    recordLabel.textContent = recording ? `Rec ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Record';
    if (saved) note(`Saved ${saved}`, 3);
    if (error) note(error, 3);
  },
});

// --- The pack (ui/pack.js, the same as the site's): scene, weapon and spells by hand -----------
const pack = createPack({
  label: ui.pack,
  items: bonfireItems({
    state: () => (fire ? {
      scenery: fire.scenery, weapon: fire.weapon, element: fire.element, flame: fire.flame,
      helmet: fire.knights?.present ? fire.knights.helmet : null,
      style: fire.knights?.present ? fire.knights.style ?? null : null,
      finish: fire.knights?.present ? fire.knights.finish ?? null : null,
    } : null),
    busy: () => !fire || fire.forging,
    reducedMotion,
    onScene: (key) => {
      director?.releaseScene(['scenery']); // (your pick wins over a scene's place)
      if (fire?.setScenery(key, { flash: true })) note(`Traveled to ${SCENERIES[key]}`, 1.5);
    },
    onWeapon: (key) => {
      if (!fire || key === fire.weapon) return;
      if (fire.forging) { note('The forge is busy', 1.5); return; }
      fire.equip(key, fire.flame, { element: fire.element }).catch(() => {});
      note(`Forging the ${weapons[key]}`, 2);
    },
    onRing: () => director?.ring(1),
    onLiving: () => actions.combo(),
    onElement: (key) => { if (!director?.hit({ element: key })) note('The forge is busy', 1.5); },
    onFlame: (key) => {
      if (!fire || key === fire.flame) return;
      if (fire.forging) { note('The forge is busy', 1.5); return; }
      fire.equip(fire.weapon, key, { element: fire.element }).catch(() => {});
    },
    // The knights (every one by the fire): a new helmet (hands to the helm), a gesture.
    onHelmet: (key) => {
      if (!fire?.knights?.present) return;
      fire.knights.setHelmet(key);
      note(`Helmet: ${HELMETS[key] ?? key}`, 1.5);
    },
    onGesture: (name) => { fire?.knights?.gesture(name, { index: 'all' }); },
    // ...their style and the color of their steel, for them all (the Knights tab's Style and
    // Finish roll them again at the hidden moments when they're in the mix).
    onStyle: (key) => {
      if (!fire?.knights?.present || !fire.knights.setStyle) return;
      Promise.resolve(fire.knights.setStyle(key)).catch(() => {});
      note(`Style: ${STYLE_NAMES[key] ?? key}`, 1.5);
    },
    onFinish: (key) => {
      if (!fire?.knights?.present || !fire.knights.setFinish) return;
      fire.knights.setFinish(key);
      note(`Finish: ${FINISH_NAMES[key] ?? key}`, 1.5);
    },
  }),
});
app.append(pack.el);
// It sits just above the HUD while the HUD is up. (On the page's own box, not the body: a
// change restyles only what's in it.)
new ResizeObserver(() => app.style.setProperty('--hud-h', `${hud.hidden ? 0 : hud.offsetHeight}px`)).observe(hud);
settingsDialog.addEventListener('show-card', (e) => { settingsDialog.close(); showCard(e.detail); });
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
  drop: () => actions.drop(), arm: () => actions.arm(), ring: () => actions.ring(), combo: () => actions.combo(),
  cut: () => actions.cut(), look: () => note(`Look: ${director?.nextLook()}`, 1.5), scene: () => nextScene(), burst: () => director?.glitchHit(),
  fire: () => director?.hit({ element: 'fire' }), lightning: () => director?.hit({ element: 'lightning' }), ice: () => director?.hit({ element: 'ice' }),
  record: () => actions.record(),
  knightsDance: () => actions.dance(), knights: () => actions.knights(),
};
const midi = createMidi({
  onAction: (id) => { if (document.body.dataset.mode === 'live' && fire) { midiActions[id]?.(); wake(); } },
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

// The start screen's presets: a kind of night in one click, before the music starts.
q('[data-feel]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  applyPreset(settings, b.dataset.preset);
  applySettings(Object.keys(PRESETS[b.dataset.preset].values));
  flushSettings();
  note(`Preset: ${PRESETS[b.dataset.preset].name}`, 1.5);
});
markPreset(start, settings);
drawChips();
if (askedScene && !firstScene) showError('That scene isn’t in this browser (it may have been made in another one). Pick another below, or make one in the Painter.');

// --- Beat by hand: a typed BPM, nudges -----------------------------------------------------
const bpmInput = q('[data-bpm-set]');
bpmInput.addEventListener('change', () => {
  if (!engine?.source) return;
  const v = Number(bpmInput.value);
  const tempo = engine.analyser.tempo;
  if (bpmInput.value && v >= 60 && v <= 220) { tempo.setManual(v, performance.now() / 1000); note(`Tempo set to ${v} BPM`, 1.5); }
  else { bpmInput.value = ''; tempo.clearManual(); note('Following the music’s tempo', 1.5); }
});
bpmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') bpmInput.blur(); });
function nudge(seconds) {
  if (!engine?.source) return;
  engine.analyser.tempo.nudge(seconds);
  note(`Beat ${seconds < 0 ? 'earlier' : 'later'} by ${Math.abs(seconds * 1000)} ms`, 1);
}

// --- The output window: just the picture, for a projector ----------------------------------
// The canvas is streamed into a second window (so it can go full screen on another display)
// while this one keeps the controls. A rebuilt scene (new particle counts) streams again.
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
  if (!stage.querySelector('canvas')?.captureStream) { note('This browser can’t send the picture to another window', 3); return; }
  output = window.open('', 'bonfire-output', 'popup,width=1280,height=720');
  if (!output) { note('The window was blocked: allow pop-ups for this page', 3); return; }
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
  note('Output window open', 2);
}
/** Open the settings (on `tab`; `search`: with the focus in their search box). */
let settingsOpener = null;
function openSettings(tab, { search = false } = {}) {
  if (!settingsDialog.open) settingsOpener = focusedNow();
  settingsPanel.open(tab, { search });
  wake();
}
