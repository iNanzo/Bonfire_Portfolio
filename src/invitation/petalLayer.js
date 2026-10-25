// The page's rose petals (petals.js moves them, petalScene.js draws them): a fixed overlay canvas
// over the whole page (the toy, its toolbar and the envelope), letting every press through
// (pointer-events none), with its own small three.js renderer drawing only petals and their ink
// at the envelope's texel size, scaled up pixelated. It's made at boot and lives for the whole
// page. Document-level passive pointer listeners (never preventDefault, in the capture phase so
// nothing stops them) drive the cursor trail (createTrail: a mouse moving, a finger dragging, a
// finger held still) and a burst ring at every press, over the envelope and through the toy
// alike. It draws only while petals are up or a finger is held, and sleeps otherwise (cleared,
// no frames). Rose Petals off (Settings) or reduced motion: none at all (any up shrink away).
// ?test reads snapshot().
import * as THREE from 'three';
import { buildInk, createPetalScene } from './petalScene.js';
import { createTrail } from './petals.js';

/** Texels along the screen's shorter side (the envelope's, so its petals and these match). */
const TEXELS = 300;
/** The camera's field of view (degrees) and distance (the envelope's). */
const FOV = 30;
const DIST = 6;
/** The page's petals are this much of the envelope's (a share of its letter's width). */
export const LAYER_SCALE = 0.8;

/**
 * The page's petal unit, world units: about the envelope's letter width on a view `w` × `h`
 * world units at its distance, times LAYER_SCALE.
 * @param {number} w
 * @param {number} h
 */
export const pageUnit = (w, h) => Math.min(0.7 * w, 0.53 * h) * LAYER_SCALE;

/**
 * @typedef {object} PetalLayerOpts
 * @property {() => boolean} on  whether petals may come now (Rose Petals on, no reduced motion)
 */

/**
 * The page's petal layer over `root`, or null where it can't draw.
 * @param {HTMLElement} root
 * @param {PetalLayerOpts} opts
 */
export function createPetalLayer(root, { on }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const canvas = doc.createElement('canvas');
  canvas.className = 'inv-petals';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '4',
    imageRendering: 'pixelated',
  });
  /** @type {THREE.WebGLRenderer} */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  root.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  camera.position.set(0, 0, DIST);
  const uIdPass = { value: 0 };
  const petals = createPetalScene({ scene, seed: 23, uniforms: { uIdPass } });
  const rtOpts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true };
  const colorRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  const idRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  const ink = buildInk();
  /** The view at the petals' plane, world units, and the screen's CSS size and texels. */
  const view = { w: 1, h: 1, cssW: 1, cssH: 1, tw: 1, th: 1 };
  const clock = () => win.performance.now() / 1000;
  let running = false;
  let raf = 0;
  let last = 0;

  function resize() {
    const cssW = Math.max(1, win.innerWidth);
    const cssH = Math.max(1, win.innerHeight);
    const px = Math.max(1.25, Math.min(cssW, cssH) / TEXELS);
    const tw = Math.max(1, Math.round(cssW / px));
    const th = Math.max(1, Math.round(cssH / px));
    renderer.setSize(tw, th, false);
    colorRT.setSize(tw, th);
    idRT.setSize(tw, th);
    ink.set(colorRT.texture, idRT.texture, tw, th);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    view.h = 2 * DIST * Math.tan(((FOV / 2) * Math.PI) / 180);
    view.w = view.h * camera.aspect;
    Object.assign(view, { cssW, cssH, tw, th });
    petals.unit = pageUnit(view.w, view.h);
    if (!running) clear();
  }
  resize();
  const onResize = () => resize();
  win.addEventListener('resize', onResize);

  /** Petals may come now (a setting that throws reads as off). */
  const allowed = () => {
    try {
      return on();
    } catch {
      return false;
    }
  };
  /**
   * A point on the screen (CSS px) on the petals' plane, world.
   * @param {number} x
   * @param {number} y
   */
  const toWorld = (x, y) => ({ x: (x / view.cssW - 0.5) * view.w, y: -(y / view.cssH - 0.5) * view.h, z: 0 });
  /**
   * A velocity on the screen (CSS px a second), world.
   * @param {number} vx
   * @param {number} vy
   */
  const velWorld = (vx, vy) => ({ x: (vx / view.cssW) * view.w, y: -(vy / view.cssH) * view.h, z: 0 });

  // --- The pointer: the trail as it moves, a ring where it presses, a finger held still.
  const trail = createTrail({ seed: 29 });
  /** The press the trail follows (the primary pointer's), and whether it holds (a finger). */
  /** @type {number|null} */
  let pressId = null;
  let holds = false;
  /** @param {import('./petals.js').TrailStep[]} steps */
  function shed(steps) {
    for (const s of steps) petals.emit('trail', toWorld(s.x, s.y), { v: velWorld(s.vx, s.vy), n: s.n });
    if (steps.length) wake();
  }
  /** @param {PointerEvent} e */
  const onDown = (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !allowed()) return;
    pressId = e.pointerId;
    holds = e.pointerType !== 'mouse';
    trail.down(clock(), e.clientX, e.clientY, holds);
    petals.emit('ring', toWorld(e.clientX, e.clientY));
    wake();
  };
  /** @param {PointerEvent} e */
  const onMove = (e) => {
    if (!e.isPrimary) return;
    const steps = trail.move(clock(), e.clientX, e.clientY);
    if (allowed()) shed(steps);
  };
  /** @param {PointerEvent} e */
  const onUp = (e) => {
    if (e.pointerId !== pressId) return;
    pressId = null;
    holds = false;
    trail.up();
  };
  const listen = { passive: true, capture: true };
  doc.addEventListener('pointerdown', onDown, listen);
  doc.addEventListener('pointermove', onMove, listen);
  doc.addEventListener('pointerup', onUp, listen);
  doc.addEventListener('pointercancel', onUp, listen);

  // --- Each frame, while there's anything to draw.
  function wake() {
    if (running) return;
    running = true;
    last = clock();
    raf = win.requestAnimationFrame(frame);
  }
  function frame() {
    const now = clock();
    const dt = Math.min(0.05, Math.max(0, now - last));
    last = now;
    const steps = trail.hold(now);
    if (allowed()) shed(steps);
    else petals.cut(0.2);
    petals.step(dt);
    if (!petals.live() && !(pressId !== null && holds)) {
      running = false;
      clear();
      return;
    }
    draw();
    raf = win.requestAnimationFrame(frame);
  }
  /** The petals' colours, then which shape each texel is, then the two put together with the ink. */
  function draw() {
    uIdPass.value = 0;
    renderer.setRenderTarget(colorRT);
    renderer.clear();
    renderer.render(scene, camera);
    uIdPass.value = 1;
    renderer.setRenderTarget(idRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(ink.scene, ink.camera);
  }
  function clear() {
    renderer.setRenderTarget(null);
    renderer.clear();
  }
  // (Its shaders built while the page is idle, so the first press doesn't hitch.)
  const idle =
    /** @type {any} */ (win).requestIdleCallback ?? ((/** @type {() => void} */ f) => win.setTimeout(f, 200));
  idle(() => {
    try {
      renderer.compile(scene, camera);
      renderer.compile(ink.scene, ink.camera);
    } catch {
      // (a context that's gone: it simply builds them on first use)
    }
  });

  return {
    /** For ?test: whether it's drawing, how many are up, how many each flow has launched, its texels. */
    snapshot() {
      return {
        running,
        on: allowed(),
        live: petals.live(),
        emitted: petals.emitted,
        texels: [view.tw, view.th],
      };
    },
    element: canvas,
    dispose() {
      win.cancelAnimationFrame(raf);
      running = false;
      win.removeEventListener('resize', onResize);
      doc.removeEventListener('pointerdown', onDown, listen);
      doc.removeEventListener('pointermove', onMove, listen);
      doc.removeEventListener('pointerup', onUp, listen);
      doc.removeEventListener('pointercancel', onUp, listen);
      petals.dispose();
      ink.dispose();
      colorRT.dispose();
      idRT.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
