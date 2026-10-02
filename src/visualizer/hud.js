// Bonfire Live's HUD while the music plays: the meter, the bar's pips, the BPM, the state line
// (a passing note, the section, a weapon waiting for the drop, what the knights do), the
// labels that change (Forge / Strike, Dance / Sit) and the file's progress, written only when
// they change. The controls and the cursor fade when the mouse rests, and the screen is kept
// on while it plays.
import { q, qa } from '../ui/shell.js';
import { BAND_NAMES } from './analyser.js';
import { relabel, HUD_TIPS } from './markup.js';
import { weapons } from '../content.js';
import { flames } from '../palette.js';
import { flameTitle } from '../elements.js';

/** The HUD's line for what's in the fire: the weapon, and its flame in its element. */
export function wieldLabel(sel) {
  return `${weapons[sel.weapon] ?? ''} · ${flameTitle(flames[sel.flame]?.name, sel.element)}`;
}

/**
 * The HUD's part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createHud(ctx) {
  const hud = q('[data-hud]');
  const settingsDialog = q('[data-settings]');

  let stateNote = null; // a transient HUD line: { text, until }
  function note(text, seconds = 2) { stateNote = { text, until: performance.now() / 1000 + seconds }; }

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
    const waiting = ctx.waitingForDrop();
    const waits = waiting ? `“${waiting}” comes with the drop` : 'the weapon waits for the drop';
    let text;
    if (noting) text = waiting && !stateNote.text.includes(waiting) ? `${stateNote.text} · ${waits}` : stateNote.text;
    else if (f.state === 'silent') text = 'Waiting for sound…';
    else if (f.state === 'breakdown' || f.state === 'build') {
      const what = f.state === 'build' ? `Build ${Math.round(f.build * 100)}%` : 'Breakdown';
      text = ctx.fire?.holding ? `${what} · ${waits}` : what;
    } else if (ctx.fire?.holding) text = waiting ? `The weapon waits for the drop: ${waits}` : 'The weapon waits for the drop';
    else text = f.locked ? 'In the groove' : 'Listening for the beat…';
    // ...and what the knights are doing.
    const knights = ctx.director?.knights;
    if (knights?.text && !noting && f.state !== 'silent') text += ` · ${knights.text}`;
    return text;
  }
  function drawHud(f, dt) {
    drawMeter(f);
    hudClock += dt;
    if (hudClock < 0.1) return;
    hudClock = 0;
    const by = ctx.engine.analyser.tempo.manual; // tap | manual | link | null (heard)
    const tag = { tap: ' · Tap', manual: ' · Set', link: ' · Link' }[by] ?? '';
    setText(bpmEl, f.bpm ? `${f.locked ? '' : '~'}${by === 'link' || by === 'manual' ? f.bpm.toFixed(1) : Math.round(f.bpm)} BPM${tag}` : '--- BPM');
    bpmEl.classList.toggle('is-locked', f.locked);
    setText(stateEl, stateText(f));
    const holding = !!ctx.fire?.holding;
    relabel(armLabel, holding ? 'Strike' : 'Forge', 'arm', holding ? HUD_TIPS.strike : HUD_TIPS.forge);
    const up = !!ctx.director?.knights && ctx.director.knights.mode !== 'rest';
    relabel(danceLabel, up ? 'Sit' : 'Dance', 'dance-act', up ? HUD_TIPS.sit : HUD_TIPS.dance);
    ctx.showScene();
    const media = ctx.engine.source?.media;
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
      if (document.body.dataset.mode !== 'live' || settingsDialog.open || ctx.keysOverlay.el.open || hud.contains(document.activeElement) || ctx.renderMenu.el.contains(document.activeElement)) return;
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx.engine?.source) keepAwake(); });

  return { note, drawHud, wake, keepAwake };
}
