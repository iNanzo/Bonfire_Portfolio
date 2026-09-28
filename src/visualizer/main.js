// Bonfire Live: the portfolio's bonfire as an audio-reactive visualizer for DJ sets.
//
//   start     pick a sound source: a line in / mic (an audio interface or a mixer's
//             record out), a shared tab or the whole system's audio (DJ software on
//             this computer), a file, or the synthesized demo track.
//   live      the analyser (analyser.js) reads the sound every frame, inside the
//             bonfire's own render loop; the director (director.js) turns it into the
//             fire's drive, beats, swaps and camera. The HUD shows what it hears and
//             hides itself (and the cursor) when the mouse rests.
//   settings  kept in this browser (localStorage).
import '../styles.css';
import './visualizer.css';
import { applyCssPalette, base, flames } from '../palette.js';
import { effects } from '../effects.js';
import { startingEquipment, weapons } from '../content.js';
import { elements, elementOr, flameTitle } from '../elements.js';
import { installDitherPatterns } from '../ui/dither.js';
import { applyFlame, setAccentRamp } from '../ui/theme.js';
import { esc } from '../html.js';
import { createAnalyser, BAND_NAMES } from './analyser.js';
import { createDirector, DEFAULT_SETTINGS, SHOTS } from './director.js';
import { LOOKS } from './looks.js';
import { createDemo, DEMO_BPM } from './demo.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const corners = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>';

// --- Settings (this browser only) ---------------------------------------------------------
const STORE = 'bonfire-live';
function loadSettings() {
  const out = structuredClone({ ...DEFAULT_SETTINGS, volume: 0.8, deviceId: '' });
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}');
    for (const [k, v] of Object.entries(saved)) {
      if (!(k in out)) continue;
      if (k === 'elements' || k === 'looks') Object.assign(out[k], v);
      else if (typeof v === typeof out[k]) out[k] = v;
    }
  } catch { /* private mode or bad JSON: defaults */ }
  return out;
}
const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* private mode */ }
}

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
  ['X', 'A sword combo (slashes on the next beats)'],
  ['G', 'A burst in the current look'],
  ['L', 'Next look'],
  ['M', 'Mirror on or off'],
  ['1 2 3', 'Hit with flame, lightning or frost'],
  ['← →', 'Hit with the previous or next colors'],
  ['T', 'Tap the tempo (first tap is beat 1)'],
  ['C', 'Cut to another shot'],
  ['H', 'Hide or show the controls'],
  ['F', 'Full screen'],
  ['S', 'Settings'],
];
const range = (key, label, min, max, step, help, unit = '') => `
  <label class="viz-field">
    <span class="viz-field-label">${label} <output data-out="${key}"></output>${unit ? `<span class="viz-unit">${unit}</span>` : ''}</span>
    <input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}">
    ${help ? `<span class="viz-help">${help}</span>` : ''}
  </label>`;
const check = (key, label) => `<label class="viz-check"><input type="checkbox" data-set="${key}"><span>${label}</span></label>`;
const select = (key, label, options) => `
  <label class="viz-field">
    <span class="viz-field-label">${label}</span>
    <select data-set="${key}">${options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>
  </label>`;

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
          ${SOURCES.map(([id, label]) => `
            <li><button class="title-item" type="button" data-source="${id}" aria-describedby="viz-source-hint">
              <span class="cursor" aria-hidden="true"></span><span>${esc(label)}</span>
            </button></li>`).join('')}
        </ul>
      </nav>
      <label class="viz-field viz-device" data-device-row hidden>
        <span class="viz-field-label">Input Device</span>
        <select data-device></select>
      </label>
      <p class="viz-hint" id="viz-source-hint" data-source-hint>${esc(SOURCES[0][2])}</p>
      <button class="pix-btn viz-start-settings" type="button" data-act="settings"><kbd>S</kbd>Settings</button>
      <p class="viz-error" role="alert" data-error hidden></p>
      <input type="file" accept="audio/*" data-file hidden>
    </div>
  </section>

  <footer class="viz-hud" data-hud hidden>
    <div class="viz-readout">
      <div class="viz-meter" aria-hidden="true">
        ${BAND_NAMES.map((b) => `<span class="viz-band" data-band="${b}"><i></i></span>`).join('')}
      </div>
      <div class="viz-tempo">
        <span class="viz-pips" aria-hidden="true" data-pips><i></i><i></i><i></i><i></i></span>
        <span class="viz-bpm" data-bpm>--- BPM</span>
      </div>
      <div class="viz-status">
        <p class="viz-wield" data-wield></p>
        <p class="viz-state" data-state>Waiting for sound…</p>
      </div>
    </div>
    <div class="viz-transport" data-transport hidden>
      <button class="pix-btn" type="button" data-act="play">Pause</button>
      <span class="viz-track" data-track></span>
      <span class="viz-progress" data-progress><i></i></span>
    </div>
    <div class="viz-actions">
      <button class="pix-btn" type="button" data-act="drop"><kbd>Space</kbd>Drop</button>
      <button class="pix-btn" type="button" data-act="arm"><kbd>A</kbd><span data-arm-label>Forge</span></button>
      <button class="pix-btn" type="button" data-act="ring"><kbd>R</kbd>Ring</button>
      <button class="pix-btn" type="button" data-act="combo"><kbd>X</kbd>Swing</button>
      <button class="pix-btn" type="button" data-act="tap"><kbd>T</kbd>Tap</button>
      <button class="pix-btn" type="button" data-act="cut"><kbd>C</kbd>Shot</button>
      <button class="pix-btn" type="button" data-act="settings"><kbd>S</kbd>Settings</button>
      <button class="pix-btn" type="button" data-act="fullscreen"><kbd>F</kbd><span data-fs-label>Full Screen</span></button>
    </div>
  </footer>

  <dialog class="rest-menu viz-settings" data-settings aria-labelledby="viz-settings-title">
    <form method="dialog" class="rest-menu-inner frame viz-settings-inner">
      ${corners}
      <p class="rest-menu-title" id="viz-settings-title">Settings</p>
      <p class="rest-menu-flavor">Tend the fire to the room. Changes apply at once and stay in this browser.</p>
      <div class="viz-settings-grid">
        <fieldset>
          <legend>Sound</legend>
          <p class="viz-source-line"><span data-source-name>No source</span>
            <button class="pix-btn" type="button" data-act="change-source">Change</button></p>
          ${range('sensitivity', 'Sensitivity', 0.5, 2, 0.05, 'Higher catches softer kicks and hats.', '×')}
          ${range('offset', 'Visual Lead', -100, 200, 5, 'Beats show this early, to make up for projector and display lag.', 'ms')}
          <div data-volume-row>${range('volume', 'Playback Volume', 0, 1, 0.05, '', '')}</div>
        </fieldset>
        <fieldset>
          <legend>Reaction</legend>
          ${range('reactivity', 'Reactivity', 0, 2, 0.05, 'How hard the fire answers the music.', '×')}
          ${select('particles', 'Particles', [['normal', 'As on the site'], ['more', 'More'], ['max', 'Most (a strong GPU)']])}
          ${check('sparks', 'Hi-hats throw sparks')}
          ${check('blink', 'Fireflies blink and dance on the beat')}
        </fieldset>
        <fieldset>
          <legend>Weapons</legend>
          ${check('autoDrops', 'Forge in breakdowns, strike on the drop')}
          ${select('phraseBars', 'New Weapon Every', [['0', 'Only on drops'], ['8', '8 bars'], ['16', '16 bars'], ['32', '32 bars'], ['64', '64 bars']])}
          ${select('ringBars', 'Extra Ring Every', [['0', 'Never'], ['1', 'Bar'], ['2', '2 bars'], ['4', '4 bars'], ['8', '8 bars']])}
          ${check('echo', 'The blade’s silhouette echoes out on the bar')}
          ${select('combos', 'Sword Combos', [['-1', 'Never'], ['0', 'After drops'], ['16', 'Every 16 bars'], ['8', 'Every 8 bars'], ['4', 'Every 4 bars']])}
          <p class="viz-field-label">Elements</p>
          <div class="viz-checks">${Object.keys(settings.elements).map((id) => check(`elements.${id}`, esc(elements[id]?.name ?? id))).join('')}</div>
        </fieldset>
        <fieldset>
          <legend>Camera</legend>
          ${select('camera', 'Camera', [['still', 'Still'], ['drift', 'Slow drift'], ['cuts', 'Drift and cut on phrases']])}
          ${select('cutBars', 'Cut Every', [['1', 'Bar'], ['2', '2 bars'], ['4', '4 bars'], ['8', '8 bars'], ['16', '16 bars']])}
          ${check('punch', 'Zoom punch on kicks, shake on the big hits')}
          ${select('shot', 'Shot', Object.entries(SHOTS).map(([k, s]) => [k, s.name]))}
          ${select('pixelSize', 'Pixel Size', [['2', '2 px (fine)'], ['3', '3 px'], ['4', '4 px (the site)'], ['6', '6 px (chunky)'], ['8', '8 px']])}
        </fieldset>
        <fieldset>
          <legend>Rave FX</legend>
          ${range('glitch', 'Effects', 0, 2, 0.05, 'How strong the looks are. They take turns: a new one every few bars and after each drop.', '×')}
          <p class="viz-field-label">Looks</p>
          <div class="viz-checks">${Object.entries(LOOKS).map(([k, name]) => check(`looks.${k}`, name)).join('')}</div>
          ${select('lookBars', 'New Look Every', [['0', 'Only after drops'], ['8', '8 bars'], ['16', '16 bars'], ['32', '32 bars']])}
          ${check('scanlines', 'Scanlines')}
          ${check('mirror', 'Mirror the picture')}
          ${check('flash', 'Negative flash on drops (at most one every 2 seconds)')}
        </fieldset>
        <fieldset class="viz-span">
          <legend>Title Card</legend>
          <div class="viz-title-fields">
            <label class="viz-field"><span class="viz-field-label">Title</span><input type="text" data-set="title" maxlength="60" placeholder="DJ name or set title" autocomplete="off"></label>
            <label class="viz-field"><span class="viz-field-label">Subtitle</span><input type="text" data-set="subtitle" maxlength="90" placeholder="Venue, date, anything" autocomplete="off"></label>
          </div>
          <div class="viz-row">
            ${check('titleOnDrop', 'Show it on drops and when the music starts')}
            <button class="pix-btn" type="button" data-act="show-title">Show Now</button>
          </div>
        </fieldset>
      </div>
      <details class="viz-keys">
        <summary>Keys</summary>
        <dl>${KEYS.map(([k, v]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </details>
      <div class="viz-row viz-settings-foot">
        <button class="pix-btn" type="button" data-act="reset-settings">Reset to Defaults</button>
        <button class="pix-btn" value="close">Close</button>
      </div>
    </form>
  </dialog>
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
}

function onFrame(dt) {
  const now = performance.now() / 1000;
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
    stage.classList.add('is-ready');
  }).catch(failScene);
}
startScene();

// --- Director events → page ------------------------------------------------------------------
let stateNote = null; // a transient HUD line: { text, until }
function onEvent(type, data = {}) {
  if (type === 'drop') {
    note('Drop!');
    live.textContent = 'Drop.';
    if (data.title) showTitle();
  } else if (type === 'arm') {
    note('Forging a blade for the drop…', 4);
  } else if (type === 'start') {
    if (data.title && settings.titleOnDrop) showTitle();
  }
}
function note(text, seconds = 2) { stateNote = { text, until: performance.now() / 1000 + seconds }; }

// --- Title card -----------------------------------------------------------------------------
const titleCard = q('[data-title-card]');
let titleTimer = 0;
function showTitle({ ms = 3600 } = {}) {
  if (!settings.title.trim()) return;
  q('[data-title-main]').textContent = settings.title;
  q('[data-title-sub]').textContent = settings.subtitle;
  q('[data-title-sub]').hidden = !settings.subtitle.trim();
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
  saveSettings();
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
  saveSettings();
  if (engine?.source?.kind === 'input') useSource('input');
});

// --- Start screen ----------------------------------------------------------------------------
const fileInput = q('[data-file]');
qa('[data-source]').forEach((btn) => {
  const hint = SOURCES.find(([id]) => id === btn.dataset.source)[2];
  const showHint = () => { q('[data-source-hint]').textContent = hint; };
  btn.addEventListener('mouseenter', showHint);
  btn.addEventListener('focus', showHint);
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

// On the start screen the fire moves aside for the menu (right of it when wide, above it when tall).
function frameFire() {
  if (!director) return;
  const menu = document.body.dataset.mode === 'start';
  const wide = innerWidth >= 1100;
  director.frame(menu && wide ? 0.2 : 0, menu && !wide ? 0.24 : 0);
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
  const tapped = engine.analyser.tempo.manual;
  bpmEl.textContent = f.bpm ? `${f.locked ? '' : '~'}${Math.round(f.bpm)} BPM${tapped ? ' · Tap' : ''}` : '--- BPM';
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
  settings: () => openSettings(),
  fullscreen: toggleFullscreen,
  play: () => {
    const m = engine?.source?.media;
    if (!m) return;
    if (m.paused) m.play(); else m.pause();
    q('[data-act="play"]').textContent = m.paused ? 'Play' : 'Pause';
  },
  'change-source': () => { stopSource(); showStart(); },
  'show-title': () => { if (!settings.title.trim()) q('[data-set="title"]').focus(); else { settingsDialog.close(); showTitle(); } },
  'reset-settings': () => {
    const keep = { deviceId: settings.deviceId, title: settings.title, subtitle: settings.subtitle };
    Object.assign(settings, structuredClone(DEFAULT_SETTINGS), { volume: 0.8 }, keep);
    settings.elements = structuredClone(DEFAULT_SETTINGS.elements);
    settings.looks = structuredClone(DEFAULT_SETTINGS.looks);
    applySettings();
    fillSettings();
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
  else if (k === 'c') actions.cut();
  else if (k === 'r') director.ring(1);
  else if (k === 'x') actions.combo();
  else if (k === 'g') director.glitchHit();
  else if (k === 'l') note(`Look: ${director.nextLook()}`, 1.5);
  else if (k === 'm') { settings.mirror = !settings.mirror; saveSettings(); note(settings.mirror ? 'Mirror on' : 'Mirror off', 1.2); }
  else if (k === 'escape') { document.body.classList.remove('hud-off'); wake(); }
  else if (['1', '2', '3'].includes(e.key)) director.hit({ element: ['fire', 'lightning', 'ice'][Number(e.key) - 1] });
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') director.hit({ step: e.key === 'ArrowRight' ? 1 : -1, element: fire.element });
});

// --- Settings dialog ---------------------------------------------------------------------------
const getPath = (key) => key.split('.').reduce((o, k) => o?.[k], settings);
function setPath(key, value) {
  const parts = key.split('.');
  const last = parts.pop();
  parts.reduce((o, k) => o[k], settings)[last] = value;
}
const NUMERIC = new Set(['sensitivity', 'offset', 'volume', 'reactivity', 'phraseBars', 'ringBars', 'cutBars', 'pixelSize', 'glitch', 'combos', 'lookBars']);
function showOutput(key) {
  const out = q(`[data-out="${key}"]`);
  if (!out) return;
  const v = getPath(key);
  out.textContent = key === 'offset' ? String(v) : key === 'volume' ? `${Math.round(v * 100)}%` : Number(v).toFixed(2);
}
function fillSettings() {
  for (const el of qa('[data-set]')) {
    const v = getPath(el.dataset.set);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = String(v);
    showOutput(el.dataset.set);
  }
}
let builtDensity = settings.particles;
let rebuildTimer = 0;
function applySettings() {
  if (settings.particles !== builtDensity) {
    builtDensity = settings.particles;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(startScene, 200);
  }
  if (engine) engine.monitor.gain.value = settings.volume;
  fire?.setPixelSize(settings.pixelSize);
  director?.setShot(settings.shot);
  saveSettings();
}
settingsDialog.addEventListener('input', (e) => {
  const el = e.target.closest('[data-set]');
  if (!el) return;
  const key = el.dataset.set;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (NUMERIC.has(key)) v = Number(v);
  // At least one element (and one look) stays on.
  if (key.startsWith('elements.') && !v && Object.values(settings.elements).filter(Boolean).length <= 1) { el.checked = true; return; }
  if (key.startsWith('looks.') && !v && Object.values(settings.looks).filter(Boolean).length <= 1) { el.checked = true; return; }
  setPath(key, v);
  showOutput(key);
  applySettings();
});
function openSettings() {
  fillSettings();
  settingsDialog.showModal();
  wake();
}
settingsDialog.addEventListener('click', (e) => { if (e.target === settingsDialog) settingsDialog.close(); });
fillSettings();
