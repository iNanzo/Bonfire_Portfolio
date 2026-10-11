// The campfire game's page, as markup (pure: the tests read it). Three layers over the bonfire:
//   the show     what the projector shows too (each piece copied to the output window by its
//                data-mirror name): the scoreboard, the round and its timer with the round's
//                multipliers, and the banner (the site's own .kindled, with a points line)
//   the controls the host's bar along the bottom (Bonfire Live's HUD: it fades when the mouse
//                rests), the team picker, and the Setup dialog; never in the output window
import { esc, corners } from '../html.js';

/** @param {string} label @param {string} tip @param {string} attrs @param {string} [inner] */
const btn = (label, tip, attrs, inner = esc(label)) =>
  `<button type="button" class="pix-btn" ${attrs} data-tip="${esc(tip)}">${inner}</button>`;

/** The page. */
export function pageMarkup() {
  return `
  <div class="stage larp-stage" data-stage></div>
  <div class="larp-show">
    <section class="larp-board" data-mirror="board" data-board aria-label="Scores"></section>
    <section class="larp-clock" data-mirror="clock" data-clock aria-label="Round and Timer">
      <p class="larp-clock-round" data-clock-round></p>
      <p class="larp-clock-time" data-clock-time>0:00</p>
      <div class="larp-mults" data-mults></div>
    </section>
  </div>
  <div class="kindled larp-banner" data-mirror="banner" data-banner hidden>
    <div class="kindled-band">
      <p class="kindled-title" data-banner-title></p>
      <p class="kindled-sub" data-banner-sub></p>
      <p class="larp-banner-points" data-banner-points></p>
    </div>
  </div>
  <p class="visually-hidden" role="status" aria-live="polite" data-live></p>
  <p class="larp-note" role="status" data-note></p>
  <footer class="larp-hud" data-hud aria-label="Game Controls">
    <div class="larp-hud-group" role="group" aria-label="Round">
      ${btn('◀', 'The previous round (←)', 'data-act="prev" aria-label="Previous Round"')}
      <p class="larp-hud-round" data-hud-round></p>
      ${btn('▶', 'The next round (→)', 'data-act="next" aria-label="Next Round"')}
    </div>
    <div class="larp-hud-group" role="group" aria-label="Timer">
      ${btn('Start', 'Start or pause the timer (Space)', 'data-act="timer"', '<span data-timer-label>Start</span>')}
      ${btn('+1 Min', 'Add a minute to the timer (+)', 'data-act="add"')}
      ${btn('Reset', 'Reset the timer to the round’s length (R)', 'data-act="reset"')}
    </div>
    <div class="larp-hud-mods" role="group" aria-label="Modifiers" data-mods></div>
    <div class="larp-hud-group" role="group" aria-label="Game">
      ${btn('Undo', 'Undo the last points given (Z)', 'data-act="undo"')}
      ${btn('Knights', 'Send the knights away (K)', 'data-act="knights"')}
      ${btn('Output', 'Open a window for the projector: just the fire, scores and banners (O)', 'data-act="output"', '<span data-output-label>Output</span>')}
      ${btn('Setup', 'Teams, rounds, modifiers and the game (S)', 'data-act="setup"')}
      ${btn('?', 'Keyboard shortcuts (?)', 'data-act="keys" aria-label="Keyboard Shortcuts"')}
    </div>
  </footer>
  <div class="larp-picker frame" data-picker role="dialog" aria-modal="false" aria-labelledby="larp-picker-title" hidden>
    ${corners}
    <p class="larp-picker-title" id="larp-picker-title" data-picker-title></p>
    <div class="larp-picker-list" data-picker-list></div>
    <button type="button" class="pix-btn larp-picker-close" data-act="pick-cancel" data-tip="Close without giving anything (Esc)">Cancel</button>
  </div>
  ${setupMarkup()}`;
}

/** The Setup dialog's tabs. */
export const SETUP_TABS = Object.freeze([
  { id: 'teams', label: 'Teams' },
  { id: 'rounds', label: 'Rounds' },
  { id: 'modifiers', label: 'Modifiers' },
  { id: 'game', label: 'Game' },
]);

/** The Setup dialog (its panels are drawn by setup.js). */
export function setupMarkup() {
  return `
  <dialog class="rest-menu larp-setup" data-setup aria-labelledby="larp-setup-title">
    <form method="dialog" class="rest-menu-inner frame larp-setup-inner">
      ${corners}
      <div class="larp-setup-top">
        <div class="larp-setup-head">
          <p class="rest-menu-title" id="larp-setup-title">Setup</p>
          <button type="button" class="viz-close larp-close" data-setup-close aria-label="Close Setup" data-tip="Close (Esc)">✕</button>
        </div>
        <div class="larp-tabs" role="tablist" aria-label="Setup Tabs">
          ${SETUP_TABS.map((t, i) => `<button type="button" role="tab" class="larp-tab" id="larp-tabbtn-${t.id}" aria-controls="larp-tab-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${t.id}">${esc(t.label)}</button>`).join('')}
        </div>
      </div>
      <div class="larp-setup-body">
        ${SETUP_TABS.map((t, i) => `<div class="larp-tab-panel" role="tabpanel" id="larp-tab-${t.id}" aria-labelledby="larp-tabbtn-${t.id}" data-tab-panel="${t.id}"${i ? ' hidden' : ''}></div>`).join('')}
      </div>
      <div class="larp-setup-foot">
        <button class="pix-btn" value="close">Done</button>
      </div>
    </form>
  </dialog>`;
}
