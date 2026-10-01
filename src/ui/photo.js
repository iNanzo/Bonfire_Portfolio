// Photo mode: the page steps aside and the fire is yours to frame. Drag to orbit, scroll
// (or pinch) to zoom, change its colors or element, and save the frame as a PNG at full
// pixel size. Esc (or Exit) gives the page back, and the camera returns to the screen's
// own view (and focus to what had it: ui/focus.js). A click without a drag still stokes
// the fire. The orbit's math (turn, tilt, distance round the fire) is ui/orbit.js, which
// the Painter's stage uses too.
import { ui } from '../content.js';
import { esc } from '../html.js';
import { blip } from './audio.js';
import { focusedNow, holdsFocus, returnFocus } from './focus.js';
import { dragOrbit, orbitPose, zoomOrbit, ORBIT_TARGET, PHOTO_LIMITS } from './orbit.js';

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

  let view = { yaw: 0, pitch: 0.32, dist: 4.2, target: ORBIT_TARGET };
  let active = false;
  let drag = null;
  let dragged = false;
  let opener = null; // what had focus as it opened (it gets it back)

  function pose(instant) {
    getFire()?.setPose({ ...orbitPose(view), fov: 32 }, { instant, duration: 0.8 });
  }

  function enter() {
    if (active || !getFire()) return;
    active = true;
    opener = focusedNow();
    document.documentElement.classList.add('is-photo');
    bar.hidden = false;
    view = { yaw: 0, pitch: 0.32, dist: 4.2, target: ORBIT_TARGET };
    pose(false);
    bar.querySelector('[data-photo="save"]').focus();
    blip('select');
    onEnter();
  }
  function exit() {
    if (!active) return;
    active = false;
    const giveBack = holdsFocus(bar); // (not when the breakdown took over: it has focus)
    document.documentElement.classList.remove('is-photo');
    bar.hidden = true;
    onExit();
    blip('back');
    if (giveBack) returnFocus(opener);
    opener = null;
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
    drag = { x: e.clientX, y: e.clientY, from: view };
    dragged = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!active || !drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) dragged = true;
    view = dragOrbit(drag.from, dx, dy, PHOTO_LIMITS);
    pose(true);
  });
  window.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('wheel', (e) => {
    if (!active) return;
    e.preventDefault();
    // (No nearer than 2.1 m, so the camera never ends up inside the knight by the fire.)
    view = zoomOrbit(view, e.deltaY, PHOTO_LIMITS);
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
