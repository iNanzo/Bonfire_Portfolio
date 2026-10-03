// @ts-nocheck: 1 type error still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// What Bonfire Live does when it's asked: every button's action (a data-act anywhere on the
// page), the keyboard shortcuts (the list people read is keys.js; this is what each key
// does) and the beat set by hand (a typed BPM, the nudges). Typing in a field leaves the keys
// alone, and the settings, the keys overlay and the render menu take their own keys first.
import { q, toggleFullscreen, typing } from '../ui/shell.js';
import { relabel, HUD_TIPS } from './markup.js';
import { SHOTS } from './camera.js';
import { COLOR_MODES } from './colors.js';
import { saveSettings } from './settings.js';
import { MODES } from './looks.js';
import { isHelpKey } from '../ui/keysOverlay.js';

/**
 * The actions' part of the page.
 * @param {import('./context.js').LiveContext} ctx
 */
export function createActions(ctx) {
  const { settings, reducedMotion } = ctx;
  const settingsDialog = q('[data-settings]');

  // --- Actions ---------------------------------------------------------------------------------
  document.addEventListener('fullscreenchange', () => {
    const full = !!document.fullscreenElement;
    relabel(
      q('[data-fs-label]'),
      full ? 'Exit Full Screen' : 'Full Screen',
      'fs',
      full ? HUD_TIPS.exitFullscreen : HUD_TIPS.fullscreen,
    );
  });

  function tap() {
    if (!ctx.engine?.source) return;
    const bpm = ctx.engine.analyser.tempo.tap(performance.now() / 1000);
    ctx.note(bpm ? `Tapped ${Math.round(bpm)} BPM` : 'Tap…', 1.2);
  }

  const actions = {
    drop: () => ctx.director?.strike(),
    arm: () => {
      if (ctx.fire?.holding) ctx.director.strike();
      else ctx.director?.arm();
    },
    beat: () => {
      if (ctx.director?.forgeOnBeat(ctx.lastFeatures?.bpm ? 60 / ctx.lastFeatures.bpm : 0))
        ctx.note('Swapping on the next downbeat', 2);
    },
    tap,
    ring: () => ctx.director?.ring(1),
    combo: () => {
      if (!ctx.director?.combo()) ctx.note('The weapon is busy (or no beat yet)', 1.5);
    },
    cut: () => {
      ctx.director?.cut();
      ctx.note(`Shot: ${SHOTS[ctx.director?.shot]?.name ?? ''}`, 1.5);
    },
    dance: () => {
      const r = ctx.director?.danceNow();
      ctx.note(
        r === 'dance'
          ? 'The knights get up to dance'
          : r === 'sit'
            ? 'The knights sit back down'
            : reducedMotion
              ? 'The knights keep still (reduced motion)'
              : 'No knights by the fire',
        1.5,
      );
    },
    knights: () => {
      const r = ctx.director?.knightsInOut();
      ctx.note(
        {
          in: 'The knights come to the fire',
          out: 'The knights leave the fire',
          'in-next': 'The knights come on the next drop',
          'out-next': 'The knights leave on the next drop',
        }[r] ?? 'No knights here',
        1.8,
      );
    },
    colors: () => {
      const modes = Object.keys(COLOR_MODES);
      settings.colors = modes[(modes.indexOf(settings.colors) + 1) % modes.length];
      saveSettings(settings);
      ctx.note(`Flame Colors: ${COLOR_MODES[settings.colors]}`, 1.5);
    },
    stats: () => {
      settings.stats = !settings.stats;
      saveSettings(settings);
      ctx.applyStats();
      ctx.note(`Stats Overlay: ${settings.stats ? 'On' : 'Off'}`, 1.2);
    },
    mirror: () => {
      const modes = ['mix', 'on', 'off'];
      settings.mirror = modes[(modes.indexOf(settings.mirror) + 1) % modes.length];
      saveSettings(settings);
      ctx.note(`Mirror: ${Object.fromEntries(MODES)[settings.mirror]}`, 1.2);
    },
    settings: () => ctx.openSettings(),
    keys: () => ctx.openKeys(),
    fullscreen: toggleFullscreen,
    play: () => {
      const m = ctx.engine?.source?.media;
      if (!m) return;
      if (m.paused) m.play();
      else m.pause();
      q('[data-act="play"]').textContent = m.paused ? 'Play' : 'Pause';
    },
    'change-source': () => {
      ctx.stopSource();
      ctx.showStart();
    },
    'show-title': () => {
      if (!settings.title.trim()) q('[data-set="title"]').focus();
      else {
        settingsDialog.close();
        ctx.showCard(0);
      }
    },
    output: () => ctx.openOutput(),
    record: () => ctx.recorder.toggle(),
    'nudge-early': () => nudge(-0.01),
    'nudge-late': () => nudge(0.01),
    downbeat: () => {
      if (!ctx.engine?.source) return;
      ctx.engine.analyser.tempo.anchor(performance.now() / 1000);
      ctx.note('This beat is beat 1', 1.2);
    },
  };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) actions[btn.dataset.act]?.();
  });
  q('[data-progress]').addEventListener('click', (e) => {
    const m = ctx.engine?.source?.media;
    if (!m?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    m.currentTime = ((e.clientX - r.left) / r.width) * m.duration;
  });

  // Typing (ui/shell.js: a text field, a select; a slider, a checkbox or a button isn't) leaves
  // the keys alone. (A field in a dialog that has just closed isn't being typed in: the focus
  // can wait there until the dialog's close event hands it back, and a key pressed in between
  // is the page's.)
  const typingIn = (el) => typing(el) && !el.closest('dialog:not([open])');
  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || typingIn(e.target)) return;
    if (settingsDialog.open || ctx.keysOverlay.el.open) return; // each handles its own keys (Esc closes)
    // The render menu first: P, and its digits while it's open (before the element hits).
    if (ctx.renderMenu.handleKey(e)) {
      e.preventDefault();
      ctx.wake();
      return;
    }
    if (e.key === 'Escape' && ctx.renderMenu.isOpen) {
      ctx.renderMenu.close();
      return;
    }
    // In the show, Shift+1…9 shows a title card by the key's place, whatever it types: before
    // ? and /, which are what Shift+7 types on German, Spanish, Italian or Russian keyboards.
    const live = document.body.dataset.mode === 'live' && !!ctx.fire;
    if (live && e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      ctx.showCard(Number(e.code.slice(5)) - 1);
      return;
    }
    // ? lists the shortcuts; / opens the settings at their search box.
    if (isHelpKey(e)) {
      e.preventDefault();
      ctx.openKeys();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      ctx.openSettings(undefined, { search: true });
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'f') toggleFullscreen();
    else if (k === 's') ctx.openSettings();
    else if (k === 'h') {
      document.body.classList.toggle('hud-off');
      ctx.wake();
    } else if (k === 'i') {
      ctx.pack.toggle();
      ctx.wake();
    } else if (k === 'u') actions.stats();
    else if (k === 'n') {
      if (e.shiftKey) ctx.cycleScenes();
      else ctx.nextScene();
      ctx.wake();
    } else if (!live) return;
    else if (e.key === ' ') {
      e.preventDefault();
      actions.drop();
    } else if (k === 'a') actions.arm();
    else if (k === 'b') actions.beat();
    else if (k === 't') tap();
    else if (k === 'd') actions.downbeat();
    else if (e.key === '[') nudge(-0.01);
    else if (e.key === ']') nudge(0.01);
    else if (k === 'o') ctx.openOutput();
    else if (k === 'v') actions.record();
    else if (k === 'c') actions.cut();
    else if (k === 'r') ctx.director.ring(1);
    else if (k === 'x') actions.combo();
    else if (k === 'g') ctx.director.glitchHit();
    else if (k === 'l') ctx.note(`Look: ${ctx.director.nextLook()}`, 1.5);
    else if (k === 'm') actions.mirror();
    else if (k === 'p' && e.shiftKey) actions.colors();
    else if (k === 'k') actions[e.shiftKey ? 'knights' : 'dance']();
    else if (k === 'escape') {
      document.body.classList.remove('hud-off');
      ctx.wake();
    } else if (['1', '2', '3'].includes(e.key))
      ctx.director.hit({ element: ['fire', 'lightning', 'ice'][Number(e.key) - 1] });
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft')
      ctx.director.hit({ step: e.key === 'ArrowRight' ? 1 : -1, element: ctx.fire.element });
  });

  // --- Beat by hand: a typed BPM, nudges -----------------------------------------------------
  const bpmInput = q('[data-bpm-set]');
  bpmInput.addEventListener('change', () => {
    if (!ctx.engine?.source) return;
    const v = Number(bpmInput.value);
    const tempo = ctx.engine.analyser.tempo;
    if (bpmInput.value && v >= 60 && v <= 220) {
      tempo.setManual(v, performance.now() / 1000);
      ctx.note(`Tempo set to ${v} BPM`, 1.5);
    } else {
      bpmInput.value = '';
      tempo.clearManual();
      ctx.note('Following the music’s tempo', 1.5);
    }
  });
  bpmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') bpmInput.blur();
  });
  function nudge(seconds) {
    if (!ctx.engine?.source) return;
    ctx.engine.analyser.tempo.nudge(seconds);
    ctx.note(`Beat ${seconds < 0 ? 'earlier' : 'later'} by ${Math.abs(seconds * 1000)} ms`, 1);
  }

  return { actions };
}
