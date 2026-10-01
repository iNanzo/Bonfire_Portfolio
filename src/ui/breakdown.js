// "How it's made" (breakdown mode): the page steps aside and a panel takes the picture
// apart. Pick a view to see one of the passes the frame is built from, or the flow field
// that moves the fire. Below it the render settings fold open (P, the same menu as the
// site's HUD: ui/renderMenu.js), and the counts show what's in the fire and what the
// knight has on and is doing (so a pick from the pack, which stays in its corner, shows up
// here as it lands), the frame's cost and every particle system live.
//
// Keys while it's open: B or Esc closes it, P opens or folds the render settings, their
// digits step them. Closed, focus goes back to what had it when it opened (the link, the
// menu button…: ui/focus.js). It's the Portfolio project's "Take This Page Apart"
// (BREAKDOWN_HASH), and a link straight to it opens the page with it open.
//
// The counts come from fire.stats() (scene.js) every 250 ms: drawCalls, texels, the
// particle systems, and any `rows` ([label, value] pairs) the scene adds for itself.
import { ui, weapons } from '../content.js';
import { esc } from '../html.js';
import { flames } from '../palette.js';
import { flameTitle } from '../elements.js';
import { SCENERIES } from '../sceneries.js';
import { blip } from './audio.js';
import { createRenderMenu } from './renderMenu.js';
import { focusedNow, holdsFocus, returnFocus } from './focus.js';
import { HELMET_NAMES, STYLE_NAMES } from '../knightNames.js';
import { isEditing } from '../routes.js';

/** Links to this hash open the breakdown (main.js), in place or on arrival. */
export const BREAKDOWN_HASH = '#how-its-made';

const VIEWS = [
  ['final', 'Final Image', 'Everything combined, then snapped to a small palette and dithered: the pixel-art look is made here, at the end, from a normal 3D render.'],
  ['normals', 'Normals & Depth', 'Which way each surface faces, and how far away it is. Where either jumps between neighboring pixels, the final pass draws an outline. The knight’s armor, when he’s there, is a set of plates, so the pass traces every plate’s edge and each one reads as a shape of its own.'],
  ['color', 'Lighting', 'The scenery lit by the fire, the fireflies and the moon, with shadows from the fire; and the knight, when he’s by it: his armor takes the fire’s color wherever it lights him and fades to shadow toward his back, in the few tones of his style. No particles yet.'],
  ['particles', 'Particles', 'Every particle system on its own layer: flames, sparks, rings, debris. Added on top of the lighting as light.'],
  ['flow', 'Flow Field', 'Where the fire’s flow carries a particle right now: rising heat, swirling curl noise, and a pull toward the middle that shapes the flame into tongues.'],
];

/**
 * @param {object} o
 * @param {() => object|null} o.getFire  the bonfire (scene.js)
 * @param {Parameters<typeof createRenderMenu>[0]} o.render  the render menu's settings
 *   (read, pick, rows, reset…): the panel folds its own copy open under the views
 * @param {() => void} [o.onEnter]  it opened (the site closes photo mode and hands the HUD over)
 * @param {() => void} [o.onExit]   it closed (...and takes the render settings back as the HUD)
 */
export function createBreakdown({ getFire, render, onEnter = () => {}, onExit = () => {} }) {
  const panel = document.createElement('aside');
  panel.className = 'breakdown frame';
  panel.hidden = true;
  panel.setAttribute('aria-label', ui.breakdown);
  panel.innerHTML = `
    <p class="breakdown-title">${esc(ui.breakdown)}</p>
    <div class="breakdown-views" role="radiogroup" aria-label="View">
      ${VIEWS.map(([id, name], i) => `<label class="breakdown-view"><input type="radio" name="breakdown-view" value="${id}"${i ? '' : ' checked'}><span>${esc(name)}</span></label>`).join('')}
    </div>
    <p class="breakdown-about" data-bd-about>${esc(VIEWS[0][2])}</p>
    <div data-bd-render></div>
    <dl class="breakdown-stats" data-bd-stats></dl>
    <button class="pix-btn" type="button" data-bd-close>${esc(ui.close)} <kbd>Esc</kbd></button>`;
  const menu = createRenderMenu({ ...render, collapse: 'rows', className: 'breakdown-render' });
  panel.querySelector('[data-bd-render]').replaceWith(menu.el);
  document.body.appendChild(panel);

  let active = false;
  let timer = 0;
  let opener = null; // what had focus as it opened (it gets it back)
  // The knight: his helmet, his style and what he's doing (none without the model); away,
  // his summon sign waits for him on the ground.
  const DOING = { sitting: 'resting', arriving: 'forming', leaving: 'burning away' };
  function knightRow(fire) {
    const k = fire.knights?.list[0];
    if (!k) return [];
    const presence = fire.knights.presence;
    if (presence === 'away') return [['Knight', 'away (his sign waits)', 'now']];
    if (!k.present) return [['Knight', 'not here', 'now']];
    const doing = presence === 'arriving' || presence === 'leaving' ? DOING[presence] : DOING[k.state] ?? k.state;
    const look = [HELMET_NAMES[fire.knights.helmet] ?? k.helmet, STYLE_NAMES[fire.knights.style], doing];
    return [['Knight', look.filter(Boolean).join(', '), 'now']];
  }
  function drawStats() {
    const fire = getFire();
    const s = fire?.stats();
    if (!s) return;
    const rows = [
      ['Scene', SCENERIES[fire.scenery] ?? fire.scenery, 'now'],
      ['Weapon', weapons[fire.weapon] ?? '—', 'now'],
      ['Fire', flameTitle(flames[fire.flame]?.name, fire.element), 'now'],
      ...knightRow(fire),
      ['Draw Calls', s.drawCalls],
      ['Render Size', `${s.texels} px`],
      ...(s.rows ?? []), // (anything else the scene counts: [label, value] pairs)
      ...s.systems.filter((x) => x.total > 0).map((x) => [x.name, `${x.live} / ${x.total}`, x.live ? '' : 'idle']),
    ];
    const html = rows.map(([k, v, kind]) => `<div${kind ? ` class="is-${kind}"` : ''}><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join('');
    const dl = panel.querySelector('[data-bd-stats]');
    if (dl.innerHTML !== html) dl.innerHTML = html;
  }
  function enter() {
    if (active || !getFire()) return;
    active = true;
    opener = focusedNow();
    document.documentElement.classList.add('is-breakdown');
    panel.hidden = false;
    drawStats();
    timer = setInterval(drawStats, 250);
    panel.querySelector('input:checked').focus();
    blip('select');
    onEnter();
  }
  function exit() {
    if (!active) return;
    active = false;
    clearInterval(timer);
    const giveBack = holdsFocus(panel); // (not when photo mode took over: it has focus)
    if (panel.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur();
    document.documentElement.classList.remove('is-breakdown');
    panel.hidden = true;
    getFire()?.breakdown('final');
    panel.querySelector('input[value="final"]').checked = true;
    panel.querySelector('[data-bd-about]').textContent = VIEWS[0][2];
    blip('back');
    onExit();
    if (giveBack) returnFocus(opener);
    opener = null;
  }
  panel.addEventListener('change', (e) => {
    const id = /** @type {HTMLInputElement} */ (e.target).value;
    if (!VIEWS.some((v) => v[0] === id)) return;
    getFire()?.breakdown(id);
    panel.querySelector('[data-bd-about]').textContent = VIEWS.find((v) => v[0] === id)[2];
    blip('move');
  });
  panel.addEventListener('click', (e) => {
    e.stopPropagation(); // (not a click on the page)
    if (/** @type {Element} */ (e.target).closest('[data-bd-close]')) exit();
  });
  // Its keys come first (it's created before the page's own), so the page doesn't also act.
  // Not while someone types in a field (a b, a p or a digit is a letter then), nor while a
  // dialog is open over it (the rest menu, the discoveries, the keys: Esc closes that one).
  window.addEventListener('keydown', (e) => {
    if (!active || isEditing(e.target) || document.querySelector('dialog[open]')) return;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'Escape') { stop(); exit(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'b' || e.key === 'B') { stop(); exit(); return; }
    const wasOpen = menu.isOpen;
    if (menu.handleKey(e)) {
      stop();
      if (!wasOpen && menu.isOpen) menu.open({ focus: true }); // (P from the keyboard: straight into the rows)
    }
  });
  return {
    enter,
    exit,
    toggle() { if (active) exit(); else enter(); },
    get active() { return active; },
    /** The panel's render settings (so the page's HUD and this fold can hand over). */
    render: menu,
  };
}
