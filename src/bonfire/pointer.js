// @ts-nocheck: 1 type error still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// The cursor as the fire sees it: where it is on the canvas, the path it traced since
// the last frame and how fast (the interaction model moves flames, sparks and fireflies
// along it), whether it's here at all, and where it is across the window (the camera
// sways toward it).
import * as THREE from 'three';

/** @param {THREE.Timer} timer  the scene's timer  @param {object} o  `signal`: removes the listeners */
export function createPointer(timer, { signal }) {
  const ptr = { x: 0, y: 0, sx: 0, sy: 0, px: null, py: null, lastMove: -10, inside: false };
  window.addEventListener(
    'pointermove',
    (e) => {
      // A new burst of movement (or the cursor entering) starts where the cursor is, so it
      // never reads as one huge swing from wherever it last was.
      if (timer.getElapsed() - ptr.lastMove > 0.2 || !ptr.inside) {
        ptr.px = e.clientX;
        ptr.py = e.clientY;
      }
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      ptr.sx = (e.clientX / window.innerWidth - 0.5) * 2;
      ptr.sy = (e.clientY / window.innerHeight - 0.5) * 2;
      ptr.lastMove = timer.getElapsed();
      ptr.inside = true;
    },
    { passive: true, signal },
  );
  document.documentElement.addEventListener(
    'pointerleave',
    () => {
      ptr.inside = false;
    },
    { signal },
  );

  // This frame's cursor, in canvas CSS px: { ax, ay → bx, by } the path, { vx, vy } px/s.
  const cursor = { ax: 0, ay: 0, bx: 0, by: 0, vx: 0, vy: 0, moving: false, present: false, width: 1, height: 1 };
  // The canvas's place on the page. The stage is fixed, so it only changes on a resize
  // (measuring it every frame would force a layout whenever the page's styles changed).
  let rect = { left: 0, top: 0, width: 1, height: 1 };
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  return {
    cursor,
    /** Where the cursor is across the window, -1..1. */
    get sx() {
      return ptr.sx;
    },
    get sy() {
      return ptr.sy;
    },
    /** Re-measure the canvas (after a resize). */
    measure(canvas) {
      rect = canvas.getBoundingClientRect();
    },
    /** This frame's cursor (see `cursor`). */
    update(dt, t) {
      const r = rect;
      if (ptr.px === null) {
        ptr.px = ptr.x;
        ptr.py = ptr.y;
      }
      const step = Math.max(dt, 1 / 240);
      const moving = t - ptr.lastMove < 0.12 && (ptr.px !== ptr.x || ptr.py !== ptr.y);
      cursor.ax = ptr.px - r.left;
      cursor.ay = ptr.py - r.top;
      cursor.bx = ptr.x - r.left;
      cursor.by = ptr.y - r.top;
      cursor.vx = moving ? (ptr.x - ptr.px) / step : 0;
      cursor.vy = moving ? (ptr.y - ptr.py) / step : 0;
      cursor.moving = moving;
      cursor.present = ptr.inside && t - ptr.lastMove < 4;
      cursor.width = r.width;
      cursor.height = r.height;
      ptr.px = ptr.x;
      ptr.py = ptr.y;
      return cursor;
    },
    /** The cursor's ray into the scene, or null while it's away (the tesla ball reaches for it). */
    ray(camera) {
      if (!cursor.present || cursor.width < 1) return null;
      ndc.set((cursor.bx / cursor.width) * 2 - 1, 1 - (cursor.by / cursor.height) * 2);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray;
    },
  };
}
