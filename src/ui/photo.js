// Photo mode: the page steps aside and the fire is yours to frame. Drag to orbit, scroll
// (or pinch) to zoom, change its colors or element, and save the frame as a PNG at full
// pixel size. Esc (or Exit) gives the page back, and the camera returns to the screen's
// own view. A click without a drag still stokes the fire.
import { ui } from '../content.js';
import { esc } from '../html.js';
import { blip } from './audio.js';

const TARGET = [0.02, 0.55, 0.02]; // the fire, a little above the ground
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * @param {object} o
 * @param {() => object|null} o.getFire  the bonfire (scene.js), or null while it loads
 * @param {() => void} o.onExit          put the page's camera view back
 * @param {() => void} o.onColors        draw new colors (the site's roll)
 * @param {() => void} o.onElement       next element
 * @param {() => void} o.onEnter         (a discovery)
 */
export function createPhotoMode({ getFire, onExit, onColors, onElement, onEnter = () => {} }) {
  const bar = document.createElement('div');
  bar.className = 'photo-bar frame';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', ui.photo);
  bar.innerHTML = `
    <p class="photo-hint">Drag to orbit · Scroll to zoom · Click to stoke</p>
    <button class="pix-btn" type="button" data-photo="colors" title="Draw new flame colors">Colors</button>
    <button class="pix-btn" type="button" data-photo="element" title="Switch between fire, lightning and ice">Element</button>
    <button class="pix-btn" type="button" data-photo="save" title="Save this frame as a PNG">Save picture</button>
    <button class="pix-btn" type="button" data-photo="exit">${esc(ui.close)} <kbd>Esc</kbd></button>`;
  document.body.appendChild(bar);

  const view = { yaw: 0, pitch: 0.32, dist: 4.2 };
  let active = false;
  let drag = null;
  let dragged = false;

  function pose(instant) {
    const cp = Math.cos(view.pitch);
    const pos = [
      TARGET[0] + Math.sin(view.yaw) * cp * view.dist,
      TARGET[1] + Math.sin(view.pitch) * view.dist,
      TARGET[2] + Math.cos(view.yaw) * cp * view.dist,
    ];
    getFire()?.setPose({ pos, target: TARGET, fov: 32 }, { instant, duration: 0.8 });
  }

  function enter() {
    if (active || !getFire()) return;
    active = true;
    document.documentElement.classList.add('is-photo');
    bar.hidden = false;
    view.yaw = 0; view.pitch = 0.32; view.dist = 4.2;
    pose(false);
    bar.querySelector('[data-photo="save"]').focus();
    blip('select');
    onEnter();
  }
  function exit() {
    if (!active) return;
    active = false;
    document.documentElement.classList.remove('is-photo');
    bar.hidden = true;
    onExit();
    blip('back');
  }
  async function save() {
    const blob = await getFire()?.capture();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bonfire-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    blip('kindle');
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-photo]');
    if (!b) return;
    e.stopPropagation(); // (not a click on the page)
    const act = b.dataset.photo;
    if (act === 'exit') exit();
    else if (act === 'save') save();
    else if (act === 'colors') onColors();
    else if (act === 'element') onElement();
  });
  window.addEventListener('pointerdown', (e) => {
    if (!active || e.target.closest('.photo-bar') || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch };
    dragged = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!active || !drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) dragged = true;
    view.yaw = drag.yaw - dx * 0.006;
    view.pitch = clampN(drag.pitch + dy * 0.004, 0.04, 1.2);
    pose(true);
  });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('wheel', (e) => {
    if (!active) return;
    e.preventDefault();
    view.dist = clampN(view.dist * Math.exp(e.deltaY * 0.001), 1.6, 7);
    pose(true);
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (active && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); exit(); }
  });

  return {
    enter,
    exit,
    toggle() { if (active) exit(); else enter(); },
    get active() { return active; },
    /** True if the click that just ended was the end of a drag (it shouldn't stoke). */
    wasDrag() { const d = dragged; dragged = false; return d; },
  };
}
