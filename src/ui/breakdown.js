// "How it's made" (breakdown mode): the page steps aside and a panel takes the picture
// apart. Pick a view to see one of the passes the frame is built from, or the flow field
// that moves the fire; the counts show the frame's cost and every particle system live.
import { ui } from '../content.js';
import { esc } from '../html.js';
import { blip } from './audio.js';

const VIEWS = [
  ['final', 'Final image', 'Everything combined, then snapped to a small palette and dithered: the pixel-art look is made here, at the end, from a normal 3D render.'],
  ['normals', 'Normals & depth', 'Which way each surface faces, and how far away it is. Where either jumps between neighboring pixels, the final pass draws an outline.'],
  ['color', 'Lighting', 'The scenery lit by the fire, the fireflies and the moon, with shadows from the fire. No particles yet.'],
  ['particles', 'Particles', 'Every particle system on its own layer: flames, sparks, rings, debris. Added on top of the lighting as light.'],
  ['flow', 'Flow field', 'Where the fire’s flow carries a particle right now: rising heat, swirling curl noise, and a pull toward the middle that shapes the flame into tongues.'],
];

/**
 * @param {object} o
 * @param {() => object|null} o.getFire  the bonfire (scene.js)
 * @param {() => void} o.onEnter         (a discovery)
 */
export function createBreakdown({ getFire, onEnter = () => {} }) {
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
    <dl class="breakdown-stats" data-bd-stats></dl>
    <button class="pix-btn" type="button" data-bd-close>${esc(ui.close)} <kbd>Esc</kbd></button>`;
  document.body.appendChild(panel);

  let active = false;
  let timer = 0;
  function drawStats() {
    const s = getFire()?.stats();
    if (!s) return;
    const rows = [
      ['Draw calls', s.drawCalls],
      ['Render size', `${s.texels} px`],
      ...s.systems.filter((x) => x.total > 0).map((x) => [x.name, `${x.live} / ${x.total}`]),
    ];
    panel.querySelector('[data-bd-stats]').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join('');
  }
  function enter() {
    if (active || !getFire()) return;
    active = true;
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
    document.documentElement.classList.remove('is-breakdown');
    panel.hidden = true;
    getFire()?.breakdown('final');
    panel.querySelector('input[value="final"]').checked = true;
    panel.querySelector('[data-bd-about]').textContent = VIEWS[0][2];
    blip('back');
  }
  panel.addEventListener('change', (e) => {
    const id = e.target.value;
    getFire()?.breakdown(id);
    panel.querySelector('[data-bd-about]').textContent = VIEWS.find((v) => v[0] === id)[2];
    blip('move');
  });
  panel.addEventListener('click', (e) => {
    e.stopPropagation(); // (not a click on the page)
    if (e.target.closest('[data-bd-close]')) exit();
  });
  window.addEventListener('keydown', (e) => {
    if (active && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); exit(); }
  });
  return { enter, exit, toggle() { if (active) exit(); else enter(); }, get active() { return active; } };
}
