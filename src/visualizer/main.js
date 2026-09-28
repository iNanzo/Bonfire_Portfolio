// Bonfire Live: the portfolio's bonfire as an audio-reactive visualizer for DJ sets.
//
//   start     pick a sound source: a line in / mic (an audio interface or a mixer's
//             record out), a shared tab or the whole system's audio (DJ software on
//             this computer), a file, or the synthesized demo track.
//   live      the analyser (analyser.js) reads the sound every frame, inside the
//             bonfire's own render loop; the director (director.js) turns it into the
//             fire's drive, beats, swaps and camera. The HUD shows what it hears and
//             hides itself (and the cursor) when the mouse rests.
//   settings  kept in this browser (settings.js), in tabs, with presets and saved setups.
//   beat      from the music, or set by hand (a BPM, nudges, "this is beat 1"), or from an
//             Ableton Link session through the bridge (tools/link-bridge.mjs).
//   output    a second window with just the picture, for a projector (the canvas is
//             streamed into it), while this one keeps the controls.
//   cards     title cards: the main one as an intro and on drops, more that take turns on
//             drops, show every 32 bars, or on a key (Shift+1…9).
import '../styles.css';
import './visualizer.css';
import { applyCssPalette, base, flames } from '../palette.js';
import { effects } from '../effects.js';
import { startingEquipment, weapons } from '../content.js';
import { elementOr, flameTitle } from '../elements.js';
import { installDitherPatterns } from '../ui/dither.js';
import { applyFlame, setAccentRamp } from '../ui/theme.js';
import { esc } from '../html.js';
import { createAnalyser, BAND_NAMES } from './analyser.js';
import { createDirector } from './director.js';
import { SHOTS } from './camera.js';
import { MODIFIER_MODES } from './looks.js';
import { COLOR_MODES } from './colors.js';
import { createDemo, DEMO_BPM } from './demo.js';
import { bindSettings, loadSettings, resetSettings, saveSettings, settingsMarkup } from './settings.js';
import { createLinkClient } from './link.js';
import { createDiscoveries } from '../ui/discoveries.js';

// Finding this page is one of the site's discoveries (counted when you're back on the site).
createDiscoveries().discover('visualizer');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

// --- Settings (this browser only: settings.js) -----------------------------------------------
const settings = loadSettings();

document.documentElement.classList.add('js');
applyCssPalette();
applyFlame(startingEquipment.flame);
installDitherPatterns(base);

// --- Markup ------------------------------------------------------------------------------------
const SOURCES = [
  ['input', 'Line In or Microphone', 'An audio interface or your mixer’s record out works best; a mic in the room works too. Echo cancelling and auto gain are off.'],
  ['capture', 'Tab or System Audio', 'Share a browser tab, or your whole screen with “Share system audio” ticked to catch rekordbox, Serato or Traktor on this computer.'],
  ['file', 'Play an Audio File', 'A mix or a track from this computer (you can also drop one anywhere on the page). Plays through your speakers.'],
  ['demo', 'Demo Track', `A synthesized ${DEMO_BPM} BPM loop with a breakdown and a drop, to see every reaction.`],
];
const KEYS = [
  ['Space', 'Drop: strike the held blade, or recolor now'],
  ['A', 'Forge a blade and hold it for the drop'],
  ['B', 'Swap on the beat (lands on a downbeat)'],
  ['R', 'A ring out of the fire'],
  ['X', 'The blade leaves the fire (moves on the next beats)'],
  ['G', 'A burst in the current look'],
  ['L', 'Next look'],
  ['M', 'Mirror: in the mix, always, off'],
  ['P', 'Colors: the site’s, harmonious, fully random, a mix'],
  ['1 2 3', 'Hit with flame, lightning or frost'],
  ['← →', 'Hit with the previous or next colors'],
  ['T', 'Tap the tempo (first tap is beat 1)'],
  ['D', 'This beat is beat 1 (fix the bar)'],
  ['[ ]', 'Nudge the beat 10 ms earlier or later'],
  ['Shift+1…9', 'Show a title card (1 = the main one)'],
  ['O', 'Open the output window (for a projector)'],
  ['C', 'Cut to another shot'],
  ['H', 'Hide or show the controls'],
  ['F', 'Full screen'],
  ['S', 'Settings'],
];

const app = document.getElementById('viz');
app.innerHTML = `
  <div class="stage viz-stage" data-stage></div>
  <div class="kindled viz-title-card" data-title-card hidden>
    <div class="kindled-band"><p class="kindled-title" data-title-main></p><p class="kindled-sub" data-title-sub></p></div>
  </div>
  <p class="visually-hidden" aria-live="polite" data-live></p>

  <section class="viz-start" data-start aria-labelledby="viz-title">
    <div class="viz-start-copy">
      <p class="eyebrow">Audio-Reactive Visualizer</p>
      <h1 class="hero-name" id="viz-title" tabindex="-1">Bonfire Live</h1>
      <p class="hero-value">Feed it a DJ set. Kicks stoke the fire, breakdowns forge a new blade over it, and the drop drives it into the ashes.</p>
      <nav class="title-menu viz-sources" aria-label="Sound source">
        <ul role="list" data-sources>
          ${SOURCES.map(([id, label, hint]) => `
            <li><button class="title-item viz-source" type="button" data-source="${id}" data-tip="${esc(hint)}" aria-describedby="viz-src-${id}">
              <span class="cursor" aria-hidden="true"></span><span>${esc(label)}</span>
              <span class="visually-hidden" id="viz-src-${id}">${esc(hint)}</span>
            </button></li>`).join('')}
        </ul>
      </nav>
      <label class="viz-field viz-device" data-device-row hidden>
        <span class="viz-field-label">Input Device</span>
        <select data-device></select>
      </label>
      <button class="pix-btn viz-start-settings" type="button" data-act="settings"><kbd>S</kbd>Settings</button>
      <p class="viz-error" role="alert" data-error hidden></p>
      <input type="file" accept="audio/*" data-file hidden>
    </div>
  </section>

  <footer class="viz-hud" data-hud hidden>
    <div class="viz-group viz-readout" role="group" aria-label="What it hears">
      <div class="viz-meter" aria-hidden="true" title="The sound in five bands, lows to highs">
        ${BAND_NAMES.map((b) => `<span class="viz-band" data-band="${b}"><i></i></span>`).join('')}
      </div>
      <div class="viz-status">
        <p class="viz-wield" data-wield></p>
        <p class="viz-state" data-state>Waiting for sound…</p>
      </div>
    </div>
    <div class="viz-group viz-beat" role="group" aria-label="Beat">
      <span class="viz-group-label">Beat</span>
      <span class="viz-pips" aria-hidden="true" data-pips title="The bar: beat 1 is outlined"><i></i><i></i><i></i><i></i></span>
      <span class="viz-bpm" data-bpm>--- BPM</span>
      <input class="viz-bpm-set" type="number" min="60" max="220" step="0.1" placeholder="Auto" data-bpm-set aria-label="Set the BPM" title="Type a BPM to lock the tempo. Empty: follow the music.">
      <button class="pix-btn" type="button" data-act="nudge-early" title="Beats 10 ms earlier ([)" aria-label="Nudge the beat earlier">‹</button>
      <button class="pix-btn" type="button" data-act="nudge-late" title="Beats 10 ms later (])" aria-label="Nudge the beat later">›</button>
      <button class="pix-btn" type="button" data-act="downbeat" title="Make this beat beat 1 of the bar (D)"><kbd>D</kbd>1</button>
      <button class="pix-btn" type="button" data-act="tap" title="Tap along 4 times or more to set the tempo; the first tap is beat 1"><kbd>T</kbd>Tap</button>
    </div>
    <div class="viz-transport" data-transport hidden>
      <button class="pix-btn" type="button" data-act="play">Pause</button>
      <span class="viz-track" data-track></span>
      <span class="viz-progress" data-progress><i></i></span>
    </div>
    <div class="viz-group viz-actions" role="group" aria-label="Moments">
      <span class="viz-group-label">Moments</span>
      <button class="pix-btn" type="button" data-act="drop" title="The drop: strike the held blade, or recolor the fire now"><kbd>Space</kbd>Drop</button>
      <button class="pix-btn" type="button" data-act="arm" title="Forge a new blade and hold it over the fire until the drop"><kbd>A</kbd><span data-arm-label>Forge</span></button>
      <button class="pix-btn" type="button" data-act="ring" title="The element’s ring races out across the ground"><kbd>R</kbd>Ring</button>
      <button class="pix-btn" type="button" data-act="combo" title="The blade leaves the fire and fights on the next beats"><kbd>X</kbd>Swing</button>
    </div>
    <div class="viz-group viz-actions" role="group" aria-label="View">
      <span class="viz-group-label">View</span>
      <button class="pix-btn" type="button" data-act="cut" title="Cut to another camera shot"><kbd>C</kbd>Shot</button>
      <button class="pix-btn" type="button" data-act="output" title="Open a window with just the picture, to drag onto a projector"><kbd>O</kbd><span data-output-label>Output</span></button>
      <button class="pix-btn" type="button" data-act="settings" title="Settings, presets, title cards"><kbd>S</kbd>Settings</button>
      <button class="pix-btn" type="button" data-act="fullscreen" title="Full screen"><kbd>F</kbd><span data-fs-label>Full Screen</span></button>
    </div>
  </footer>

  ${settingsMarkup(settings, KEYS)}
`;

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
function onFrame(dt) {
  const now = performance.now() / 1000;
  if (settings.beatFrom === 'link' && engine?.source) link.update(now, engine.analyser.tempo);
  else link.close();
  const f = engine?.source ? engine.analyser.update(now, dt, { sensitivity: settings.sensitivity, lead: settings.offset / 1000 }) : IDLE;
  lastFeatures = f;
  director.update(f, dt);
  if (engine?.source) drawHud(f, dt);
}

function failScene(error) {
  fire?.dispose();
  fire = null;
  document.documentElement.classList.add('no-webgl');
  showError('This browser couldn’t start WebGL, so the bonfire can’t render here. Try Chrome or Edge with hardware acceleration on.');
  console.warn('Bonfire unavailable.', error);
}

// More particles than the site: the visualizer is the show. The counts size GPU buffers,
// so changing them rebuilds the scene.
const BASE_COUNTS = structuredClone({ particles: effects.particles, fireflies: effects.fireflies });
const DENSITY = {
  normal: { fire: 1, sparks: 1, forge: 1, impact: 1, flies: 1 },
  more: { fire: 1.6, sparks: 3, forge: 1.5, impact: 1.3, flies: 1.2 },
  max: { fire: 2.4, sparks: 5, forge: 2, impact: 1.7, flies: 1.5 },
};
function applyDensity() {
  const k = DENSITY[settings.particles] ?? DENSITY.more;
  const p = BASE_COUNTS.particles;
  Object.assign(effects.particles, { fire: Math.round(p.fire * k.fire), sparks: Math.round(p.sparks * k.sparks), forge: Math.round(p.forge * k.forge), impact: p.impact * k.impact });
  Object.assign(effects.fireflies, { count: Math.round(BASE_COUNTS.fireflies.count * k.flies), lights: BASE_COUNTS.fireflies.lights });
}

let sceneGeneration = 0;
function startScene() {
  const generation = ++sceneGeneration;
  applyDensity();
  return import('../bonfire/scene.js').then(async ({ createBonfire }) => {
    const candidate = createBonfire(stage, { reducedMotion, sway: 0, lightTrails: true, onImpact, onRamp: setAccentRamp, onError: failScene, onFrame: (dt) => { if (fire === candidate) onFrame(dt); } });
    const nextDirector = createDirector(candidate, { settings, reducedMotion, onEvent });
    await candidate.ready;
    if (generation !== sceneGeneration) { candidate.dispose(); return; }
    const prev = fire;
    fire = candidate;
    director = nextDirector;
    frameFire();
    if (import.meta.env.DEV) window.__viz = { fire, director, settings, get engine() { return engine; }, get features() { return lastFeatures; } };
    fire.setPixelSize(settings.pixelSize);
    const eq = prev ? { weapon: prev.weapon, flame: prev.flame, element: prev.element } : { weapon: startingEquipment.weapon, flame: startingEquipment.flame, element: elementOr(startingEquipment.element) };
    prev?.dispose();
    await fire.equip(eq.weapon, eq.flame, { instant: true, element: eq.element });
    fire.setScenery(settings.scenery === 'mix' ? prev?.scenery ?? 'ruins' : settings.scenery);
    stage.classList.add('is-ready');
    if (output && !output.closed) streamInto(output);
  }).catch(failScene);
}
startScene();

// --- Director events → page ------------------------------------------------------------------
let stateNote = null; // a transient HUD line: { text, until }
function onEvent(type, data = {}) {
  if (type === 'drop') {
    note('Drop!');
    live.textContent = 'Drop.';
    if (data.title !== false) nextCard('drops');
  } else if (type === 'arm') {
    note('Forging a blade for the drop…', 4);
  } else if (type === 'start') {
    if (settings.intro) showCard(0);
  } else if (type === 'bar') {
    if (data.bar > 0 && data.bar % 32 === 0) nextCard('phrases');
  } else if (type === 'stage') {
    note(['', 'Building…', 'Building… halfway', 'Building… three quarters', 'Here it comes'][data.stage] ?? '', 2);
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
function showCard(n, { ms = 3600 } = {}) {
  const card = cardAt(n);
  if (!card?.title?.trim()) return;
  q('[data-title-main]').textContent = card.title;
  q('[data-title-sub]').textContent = card.subtitle ?? '';
  q('[data-title-sub]').hidden = !card.subtitle?.trim();
  titleCard.style.setProperty('--kindle-time', `${ms}ms`);
  titleCard.hidden = true;
  void titleCard.offsetWidth;
  titleCard.hidden = false;
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => { titleCard.hidden = true; }, ms);
}

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

function stopSource() {
  if (!engine?.source) return;
  engine.source.stop();
  engine.source = null;
  engine.analyser.reset();
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
const bandEls = Object.fromEntries(qa('[data-band]').map((el) => [el.dataset.band, el]));
const pips = qa('[data-pips] i');
const bpmEl = q('[data-bpm]');
const stateEl = q('[data-state]');
const armLabel = q('[data-arm-label]');
const progress = q('[data-progress] i');
let hudClock = 0;
let pipOn = -1;
function drawHud(f, dt) {
  // Meter: stepped like everything else.
  for (const b of BAND_NAMES) bandEls[b].style.setProperty('--v', (Math.round(f.bands[b] * 8) / 8).toFixed(3));
  for (const beat of f.beats) {
    if (!f.locked) continue;
    pipOn = beat.beat;
    pips.forEach((p, i) => { p.classList.toggle('is-on', i === pipOn); p.classList.toggle('is-down', i === 0); });
  }
  if (!f.locked && pipOn >= 0) { pips.forEach((p) => p.classList.remove('is-on')); pipOn = -1; }
  hudClock += dt;
  if (hudClock < 0.1) return;
  hudClock = 0;
  const by = engine.analyser.tempo.manual; // tap | manual | link | null (heard)
  const tag = { tap: ' · Tap', manual: ' · Set', link: ' · Link' }[by] ?? '';
  bpmEl.textContent = f.bpm ? `${f.locked ? '' : '~'}${by === 'link' || by === 'manual' ? f.bpm.toFixed(1) : Math.round(f.bpm)} BPM${tag}` : '--- BPM';
  bpmEl.classList.toggle('is-locked', f.locked);
  const now = performance.now() / 1000;
  let text;
  if (stateNote && now < stateNote.until) text = stateNote.text;
  else if (f.state === 'silent') text = 'Waiting for sound…';
  else if (f.state === 'breakdown' || f.state === 'build') {
    const what = f.state === 'build' ? `Build ${Math.round(f.build * 100)}%` : 'Breakdown';
    text = fire?.holding ? `${what} · the blade waits for the drop` : what;
  }
  else if (fire?.holding) text = 'The blade waits for the drop';
  else text = f.locked ? 'In the groove' : 'Listening for the beat…';
  if (stateEl.textContent !== text) stateEl.textContent = text;
  armLabel.textContent = fire?.holding ? 'Strike' : 'Forge';
  const media = engine.source?.media;
  if (media && media.duration) progress.style.setProperty('--p', (media.currentTime / media.duration).toFixed(4));
}

// Idle: the controls and cursor fade when the mouse rests (unless hidden or in use).
let idleTimer = 0;
function wake() {
  document.body.classList.remove('is-idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (document.body.dataset.mode !== 'live' || settingsDialog.open || hud.contains(document.activeElement)) return;
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
  q('[data-fs-label]').textContent = document.fullscreenElement ? 'Exit Full Screen' : 'Full Screen';
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
  combo: () => { if (!director?.combo()) note('The blade is busy (or no beat yet)', 1.5); },
  cut: () => { director?.cut(); note(`Shot: ${SHOTS[director?.shot]?.name ?? ''}`, 1.5); },
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
    note(`Mirror: ${Object.fromEntries(MODIFIER_MODES)[settings.mirror]}`, 1.2);
  },
  settings: () => openSettings(),
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
  'nudge-early': () => nudge(-0.01),
  'nudge-late': () => nudge(0.01),
  downbeat: () => {
    if (!engine?.source) return;
    engine.analyser.tempo.anchor(performance.now() / 1000);
    note('This beat is beat 1', 1.2);
  },
  'reset-settings': () => {
    resetSettings(settings);
    applySettings();
    settingsPanel.fill();
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
  if (settingsDialog.open) return; // the dialog handles its own keys (Esc closes)
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFullscreen();
  else if (k === 's') openSettings();
  else if (k === 'h') { document.body.classList.toggle('hud-off'); wake(); }
  else if (document.body.dataset.mode !== 'live' || !fire) return;
  else if (e.key === ' ') { e.preventDefault(); actions.drop(); }
  else if (k === 'a') actions.arm();
  else if (k === 'b') actions.beat();
  else if (k === 't') tap();
  else if (k === 'd') actions.downbeat();
  else if (e.key === '[') nudge(-0.01);
  else if (e.key === ']') nudge(0.01);
  else if (k === 'o') openOutput();
  else if (e.shiftKey && /^Digit[1-9]$/.test(e.code)) showCard(Number(e.code.slice(5)) - 1);
  else if (k === 'c') actions.cut();
  else if (k === 'r') director.ring(1);
  else if (k === 'x') actions.combo();
  else if (k === 'g') director.glitchHit();
  else if (k === 'l') note(`Look: ${director.nextLook()}`, 1.5);
  else if (k === 'm') actions.mirror();
  else if (k === 'p') actions.colors();
  else if (k === 'escape') { document.body.classList.remove('hud-off'); wake(); }
  else if (['1', '2', '3'].includes(e.key)) director.hit({ element: ['fire', 'lightning', 'ice'][Number(e.key) - 1] });
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') director.hit({ step: e.key === 'ArrowRight' ? 1 : -1, element: fire.element });
});

// --- Settings dialog (settings.js) ---------------------------------------------------------------
let builtDensity = settings.particles;
let rebuildTimer = 0;
/** A setting changed: a new particle density rebuilds the scene; the rest apply at once. */
function applySettings() {
  if (settings.particles !== builtDensity) {
    builtDensity = settings.particles;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(startScene, 200);
  }
  if (engine) engine.monitor.gain.value = settings.volume;
  fire?.setPixelSize(settings.pixelSize);
  if (settings.scenery !== 'mix') fire?.setScenery(settings.scenery);
  director?.setShot(settings.shot);
  saveSettings(settings);
}
const settingsPanel = bindSettings(settingsDialog, settings, { onChange: applySettings, onNote: (text) => note(text, 1.5) });
settingsDialog.addEventListener('show-card', (e) => { settingsDialog.close(); showCard(e.detail); });

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
function openOutput() {
  if (output && !output.closed) { output.focus(); return; }
  if (!stage.querySelector('canvas')?.captureStream) { note('This browser can’t send the picture to another window', 3); return; }
  output = window.open('', 'bonfire-output', 'popup,width=1280,height=720');
  if (!output) { note('The window was blocked: allow pop-ups for this page', 3); return; }
  output.document.title = 'Bonfire Live — Output';
  output.document.body.innerHTML = `
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      video { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
      p { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); margin: 0; padding: 6px 12px;
          font: 14px system-ui, sans-serif; color: #e9e3d2; background: #07070bcc; transition: opacity 600ms; }
      body.quiet p { opacity: 0; } body.quiet { cursor: none; }
    </style>
    <video autoplay muted playsinline></video>
    <p>Drag this window to the projector, then double-click for full screen.</p>`;
  const doc = output.document;
  doc.addEventListener('dblclick', () => (doc.fullscreenElement ? doc.exitFullscreen() : doc.documentElement.requestFullscreen?.()));
  let quiet = 0;
  const wakeOut = () => { doc.body.classList.remove('quiet'); clearTimeout(quiet); quiet = setTimeout(() => doc.body.classList.add('quiet'), 2500); };
  doc.addEventListener('pointermove', wakeOut);
  wakeOut();
  streamInto(output);
  output.addEventListener('pagehide', () => { q('[data-output-label]').textContent = 'Output'; });
  q('[data-output-label]').textContent = 'Output (open)';
  note('Output window open', 2);
}
function openSettings() {
  settingsPanel.open();
  wake();
}
