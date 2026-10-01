// Photo mode: the page steps aside and the fire is yours to frame. Drag to orbit, scroll
// (or pinch, two fingers) to zoom, change its colors or element, and save the frame as a
// PNG at full pixel size. Esc (or Close) gives the page back, and the camera returns to the
// screen's own view (and focus to what had it: ui/focus.js). A click without a drag still
// stokes the fire. The orbit's math (turn, tilt, distance round the fire) is ui/orbit.js,
// which the Painter's stage uses too.
//
// The toolbar's line says how, for a mouse or for touch; its buttons say what they do as
// their tooltips (the shared one, ui/tooltip.js), which a screen reader hears as their
// descriptions (ui/describedTip.js).
import { ui } from '../content.js';
import { esc } from '../html.js';
import { elements } from '../elements.js';
import { ELEMENT_IDS } from '../effectsDefaults.js';
import { isEditing } from '../routes.js';
import { blip } from './audio.js';
import { focusedNow, holdsFocus, returnFocus } from './focus.js';
import { describedTip } from './describedTip.js';
import { dragOrbit, orbitPose, zoomOrbit, ORBIT_TARGET, PHOTO_LIMITS, DRAG_RATE } from './orbit.js';

/** What Element does, with the elements' names as the site calls them (the content's: Flame, Lightning, Frost). */
export const elementHint = () => `The next element, in turn: ${ELEMENT_IDS.map((id) => elements[id]?.name ?? id).join(', ')}`;

/**
 * The toolbar's insides (pure: the tests read it): how to frame the fire, for a mouse or for
 * touch, then its buttons, each with its tooltip and description.
 * @param {{ touch?: boolean }} [o]
 */
export function photoBarHtml({ touch = false } = {}) {
  const button = (act, label, hint) => {
    const tip = describedTip(`photo-tip-${act}`, hint);
    return `<button class="pix-btn" type="button" data-photo="${act}"${tip.attrs}>${esc(label)}</button>${tip.note}`;
  };
  return `
    <p class="photo-hint">${touch ? 'Drag to orbit · Pinch to zoom · Tap to stoke' : 'Drag to orbit · Scroll to zoom · Click to stoke'}</p>
    ${button('colors', 'Colors', 'New flame colors, picked at random')}
    ${button('element', 'Element', elementHint())}
    ${button('save', 'Save Picture', 'Save this frame as a PNG, at full pixel size')}
    <button class="pix-btn" type="button" data-photo="exit">${esc(ui.close)} <kbd>Esc</kbd></button>`;
}

/**
 * @param {object} o
 * @param {() => object|null} o.getFire  the bonfire (scene.js), or null while it loads
 * @param {() => void} o.onExit          put the page's camera view back
 * @param {() => void} o.onColors        draw new colors (the site's roll)
 * @param {() => void} o.onElement       next element
 * @param {() => void} o.onEnter         (a discovery)
 * @param {boolean} [o.touch]            a touch screen (the line says pinch and tap)
 */
export function createPhotoMode({ getFire, onExit, onColors, onElement, onEnter = () => {}, touch = false }) {
  const bar = document.createElement('div');
  bar.className = 'photo-bar frame';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', ui.photo);
  bar.innerHTML = photoBarHtml({ touch });
  document.body.appendChild(bar);

  let view = { yaw: 0, pitch: 0.32, dist: 4.2, target: ORBIT_TARGET };
  let active = false;
  let drag = null;
  let dragged = false;
  /** @type {Map<number, { x: number, y: number }>} the fingers (pointers) down on the scene */
  const pointers = new Map();
  let pinch = null; // two fingers down: how far apart they began, and the view then
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
    // (The elements' names as they are now: the admin's preview can rename them.)
    const hint = elementHint();
    bar.querySelector('[data-photo="element"]').setAttribute('data-tip', hint);
    bar.querySelector('#photo-tip-element').textContent = hint;
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
  // One pointer drags the orbit round; a second finger makes it a pinch, which zooms (as far
  // as the fingers spread or close: the wheel's own rate, so both feel the same).
  const spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  window.addEventListener('pointerdown', (e) => {
    if (!active || e.target.closest('.photo-bar') || e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      drag = null;
      dragged = true; // (a pinch isn't a tap: it doesn't stoke)
      pinch = { d: spread(), from: view };
      return;
    }
    if (pointers.size > 2) return;
    drag = { x: e.clientX, y: e.clientY, from: view };
    dragged = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!active) return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      view = zoomOrbit(pinch.from, Math.log(pinch.d / spread()) / DRAG_RATE.zoom, PHOTO_LIMITS);
      pose(true);
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) dragged = true;
    view = dragOrbit(drag.from, dx, dy, PHOTO_LIMITS);
    pose(true);
  });
  const lift = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    drag = null;
  };
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);
  window.addEventListener('wheel', (e) => {
    if (!active) return;
    e.preventDefault();
    // (No nearer than 2.1 m, so the camera never ends up inside the knight by the fire.)
    view = zoomOrbit(view, e.deltaY, PHOTO_LIMITS);
    pose(true);
  }, { passive: false });
  // Esc gives the page back: not while typing, and not under a dialog (the shortcuts list,
  // ?, opens over photo mode, and the Esc is its own).
  window.addEventListener('keydown', (e) => {
    if (!active || e.key !== 'Escape' || isEditing(e.target) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    exit();
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
