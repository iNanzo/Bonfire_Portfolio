// Framing a scene by hand on the Painter's stage: the camera orbits what it looks at.
//
//   drag            orbit round the point it looks at (ui/orbit.js, as photo mode does)
//   Shift-drag      slide that point (and the camera with it) across the screen; a right
//   (or right-drag) drag does the same
//   wheel, pinch    nearer or further
//   arrows          orbit a step (Shift: slide); + and - come nearer or go back
//   Q, E            tilt the horizon; [ and ] narrow or widen the lens
// Every move goes through the clearing's rule (visualizer/clearing.js keepInClearing: above
// the ground, out of the fire, in front of the ruins), the same one Bonfire Live plays it
// under, so a framing can't be painted where it can't play. The scene's own move is paused
// while you drag (camera.pause) and starts again from the new framing when you let go.
// Each change is handed to `onFrame(camera, key)`; the page makes it an edit (one undo step
// per drag: `key` 'camera').
import { dragOrbit, orbitPose, panOrbit, poseToOrbit, zoomOrbit } from '../ui/orbit.js';
import { keepInClearing } from '../visualizer/clearing.js';
import { SCENE_RANGES, TARGET_BOX } from '../scenes.js';
import { clamp } from '../math.js';

/** How far a painted camera may tilt up or down and come in or go out. */
export const PAINT_LIMITS = { pitch: [-0.35, 1.45], dist: [0.6, 9] };

/**
 * A scene camera moved to an orbit: the position kept in the clearing, the point it looks at
 * kept near the fire. Pure (the tests use it).
 * @param {{ pos: number[], target: number[], fov: number, roll: number, move: object }} cam
 * @param {import('../ui/orbit.js').Orbit} view
 */
export function cameraAt(cam, view) {
  const target = (view.target ?? cam.target).map((v, i) => clamp(v, ...[TARGET_BOX.x, TARGET_BOX.y, TARGET_BOX.z][i]));
  const { pos } = orbitPose({ ...view, target });
  const p = keepInClearing({ x: pos[0], y: pos[1], z: pos[2] });
  return { ...cam, pos: [p.x, p.y, p.z], target };
}

/**
 * @param {HTMLElement} stage  the element over the canvas (pointer and wheel)
 * @param {{
 *   get: () => { pos: number[], target: number[], fov: number, roll: number, move: object },
 *   onFrame: (camera: object, key: string) => void,
 *   pause: (on: boolean) => void,
 *   onDragEnd?: () => void,
 * }} o
 */
export function createCameraRig(stage, { get, onFrame, pause, onDragEnd = () => {} }) {
  const pointers = new Map(); // id → { x, y }
  let drag = null; // { x, y, from: Orbit, pan }
  let pinch = null; // { d, from: Orbit }
  const [fovMin, fovMax] = SCENE_RANGES['camera.fov'];
  const [rollMin, rollMax] = SCENE_RANGES['camera.roll'];

  const orbit = () => poseToOrbit(get());
  const send = (view) => onFrame(cameraAt(get(), view), 'camera');

  function begin(e) {
    const pan = e.shiftKey || e.button === 2;
    drag = { x: e.clientX, y: e.clientY, from: orbit(), pan };
    pause(true);
    stage.classList.add(pan ? 'is-panning' : 'is-orbiting');
  }
  function end() {
    if (!drag && !pinch) return;
    drag = null;
    pinch = null;
    pause(false);
    stage.classList.remove('is-panning', 'is-orbiting');
    onDragEnd();
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    stage.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      // Two fingers: pinch to zoom.
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), from: orbit() };
      drag = null;
      return;
    }
    begin(e);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const view = pinch.from;
      send({ ...view, dist: clamp(view.dist * (pinch.d / d), ...PAINT_LIMITS.dist) });
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    send(
      drag.pan
        ? panOrbit(drag.from, dx, dy, { fov: get().fov, height: stage.clientHeight })
        : dragOrbit(drag.from, dx, dy, PAINT_LIMITS),
    );
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) end();
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('contextmenu', (e) => e.preventDefault()); // (right-drag slides)
  let wheelTimer = 0;
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      pause(true);
      send(zoomOrbit(orbit(), e.deltaY, PAINT_LIMITS));
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        pause(false);
        onDragEnd();
      }, 250);
    },
    { passive: false },
  );

  return {
    /**
     * A key for the camera (the page's keydown, when the stage's keys apply). True if it
     * was one.
     * @param {KeyboardEvent} e
     */
    handleKey(e) {
      const cam = get();
      const view = orbit();
      const k = e.key;
      const step = 24; // px of drag a key press stands for
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        send(
          e.shiftKey
            ? panOrbit(view, dx, dy, { fov: cam.fov, height: stage.clientHeight })
            : dragOrbit(view, dx, dy, PAINT_LIMITS),
        );
      } else if (k === '+' || k === '=') send(zoomOrbit(view, -120, PAINT_LIMITS));
      else if (k === '-' || k === '_') send(zoomOrbit(view, 120, PAINT_LIMITS));
      else if (k === 'q' || k === 'Q')
        onFrame({ ...cam, roll: clamp(cam.roll - 0.02, rollMin, rollMax) }, 'camera.roll');
      else if (k === 'e' || k === 'E')
        onFrame({ ...cam, roll: clamp(cam.roll + 0.02, rollMin, rollMax) }, 'camera.roll');
      else if (k === '[') onFrame({ ...cam, fov: clamp(cam.fov - 2, fovMin, fovMax) }, 'camera.fov');
      else if (k === ']') onFrame({ ...cam, fov: clamp(cam.fov + 2, fovMin, fovMax) }, 'camera.fov');
      else return false;
      return true;
    },
    /** Whether a drag (or pinch) is going on. */
    get dragging() {
      return !!(drag || pinch);
    },
  };
}
