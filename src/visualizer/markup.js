// Bonfire Live's page: the start screen (the sound sources, the presets, the scene chips and
// the error line), the title card, the HUD (what it hears, the beat, the moments, the view)
// and the settings dialog, with the tips the HUD's controls show (the shared tooltip, read out
// as each one's description). main.js writes it into #viz before any part looks for its
// elements, and hands it what's drawn elsewhere (the settings dialog, the preset buttons), so
// this is only strings: Node can test it, and it joins the type check.
import { esc } from '../html.js';
import { BAND_NAMES } from './analyser.js';
import { DEMO_BPM } from './demo.js';
import { logoMark } from '../ui/logo.js';
import { site } from '../content.js';

const SOURCES = [
  [
    'input',
    'Line In or Microphone',
    'An audio interface or your mixer’s record out works best; a mic in the room works too. Echo cancelling and auto gain are off.',
  ],
  [
    'capture',
    'Tab or System Audio',
    'Share a browser tab, or your whole screen with “Share system audio” ticked to catch rekordbox, Serato or Traktor on this computer.',
  ],
  [
    'file',
    'Play an Audio File',
    'A mix or a track from this computer (you can also drop one anywhere on the page). Plays through your speakers.',
  ],
  ['demo', 'Demo Track', `A synthesized ${DEMO_BPM} BPM loop with a breakdown and a drop, to see every reaction.`],
];
// The HUD's buttons and readouts each say what they do through the shared tooltip (on hover,
// focus or a tap), read out as their description; the ones whose label changes (Forge /
// Strike, Dance / Sit, Full Screen / Exit Full Screen) change their tip with it.
export const HUD_TIPS = {
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

/**
 * The page's markup, for #viz.
 * @param {{ base: string, presets: string, settingsDialog: string }} parts  the site's base URL
 *   (the home link), the start screen's preset buttons and the settings dialog (settingsDialog.js
 *   presetButtons and settingsMarkup)
 */
export const pageMarkup = ({ base, presets, settingsDialog }) => `
  <div class="stage viz-stage" data-stage></div>
  <div class="kindled viz-title-card" data-title-card hidden>
    <div class="kindled-band"><p class="kindled-title" data-title-main></p><p class="kindled-sub" data-title-sub></p></div>
  </div>
  <p class="visually-hidden" aria-live="polite" data-live></p>

  <a class="brand viz-home" href="${esc(base)}" aria-label="${esc(site.name)}: back to the portfolio" data-home-link>
    ${logoMark('brand-mark')}<span class="brand-name">${esc(site.name)}</span>
  </a>
  <section class="viz-start" data-start aria-labelledby="viz-title">
    <div class="viz-start-copy">
      <p class="eyebrow">Audio-Reactive Visualizer</p>
      <h1 class="hero-name" id="viz-title" tabindex="-1">Bonfire Live</h1>
      <p class="hero-value">Feed it a DJ set. Kicks stoke the fire, breakdowns forge a new weapon over it, and the drop drives it into the ashes.</p>
      <nav class="title-menu viz-sources" aria-label="Sound Source">
        <ul role="list" data-sources>
          ${SOURCES.map(
            ([id, label, hint]) => `
            <li><button class="title-item viz-source" type="button" data-source="${id}" data-tip="${esc(hint)}" aria-describedby="viz-src-${id}">
              <span class="cursor" aria-hidden="true"></span><span>${esc(label)}</span>
            </button><span class="visually-hidden" id="viz-src-${id}">${esc(hint)}</span></li>`,
          ).join('')}
        </ul>
      </nav>
      <label class="viz-field viz-device" data-device-row hidden>
        <span class="viz-field-label">Input Device</span>
        <select data-device></select>
      </label>
      <div class="viz-feel" role="group" aria-label="Presets: a kind of night in one click" data-feel>
        <span class="viz-group-label">Presets</span>
        ${presets}
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

  ${settingsDialog}
`;

/** A HUD button's changing label, and its tip with it (written only when it changes). */
export function relabel(labelEl, text, tipId, tip) {
  if (labelEl.textContent === text) return;
  labelEl.textContent = text;
  labelEl.closest('[data-tip]')?.setAttribute('data-tip', tip);
  const said = document.getElementById(`viz-hud-${tipId}`);
  if (said) said.textContent = tip;
}
