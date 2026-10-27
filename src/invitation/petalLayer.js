// The page's rose petals (petals.js moves them, petalScene.js draws them): a fixed overlay canvas
// over the stage and under the HUD and the dialogue (it goes in just before the HUD, with no
// z-index of its own; while the envelope is up it rises over it), letting every press through
// (pointer-events none), with its own small three.js renderer drawing only petals and their ink
// at the envelope's texel size, scaled up pixelated, each petal sized in CSS px (petalPx) so it
// reads as a petal beside NEWT whatever the screen. At boot it is only its listeners and an empty
// canvas: its renderer (a WebGL context, its targets and meshes) comes with the first press or move
// that may shed petals, so with Rose Petals off or reduced motion there is never one; then it lives
// for the rest of the page (refused, it tries once and stays quiet). Document-level passive
// pointer listeners (never preventDefault, in the capture phase so nothing stops them) drive the
// cursor trail (createTrail: a mouse moving, a finger dragging, a finger held still; lifted when
// the pointer leaves the window or it loses focus, so a return elsewhere sheds nothing) and a burst
// ring at every click or tap (createClick: let go within CLICK.tol px of where it went down, on
// the release, never as it goes down and never once the press turns into a drag of the camera,
// the letter or NEWT), over the envelope and through the toy alike; none over the UI (QUIET: a
// button, the toolbar, the pad, Settings, the dialogue's boxes). Carrying NEWT keeps the trail
// active but never bursts a ring. It draws only while petals are
// up or a finger is held, and sleeps otherwise (cleared, no frames). Rose Petals off (Settings) or
// reduced motion: none at all (any up shrink away). ?test reads snapshot().
import * as THREE from 'three';
import { buildInk, createPetalScene } from './petalScene.js';
import { FLOWS, PETAL_LEN, createTrail } from './petals.js';

/** Texels along the screen's shorter side (the envelope's), as long as a texel stays in TEXEL_PX. */
const TEXELS = 300;
/**
 * A texel's size, CSS px: never finer than the first or coarser than the second, so a petal sized
 * in CSS px (petalPx) is always 5 texels long or more and reads as a petal, not a dot.
 */
export const TEXEL_PX = [1.25, 1.75];

/**
 * A texel's size on a screen `w` × `h` CSS px: the envelope's (TEXELS along its shorter side),
 * held within TEXEL_PX.
 * @param {number} w
 * @param {number} h
 */
export const texelPx = (w, h) => Math.min(TEXEL_PX[1], Math.max(TEXEL_PX[0], Math.min(w, h) / TEXELS));
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

/** A page petal's length (a PETAL_SIZES 1 petal), CSS px: a little smaller on a phone. */
export const PETAL_PX = { desktop: 12.5, phone: 11 };

/**
 * A page petal's length (a PETAL_SIZES 1 petal; they come 0.75 to 1.3 of it) on a screen `w` × `h`
 * CSS px: a phone's (its shorter side under 600 px, either way up), else a desktop's; never
 * the screen's size.
 * @param {number} w
 * @param {number} h
 */
export const petalPx = (w, h) => (Math.min(w, h) < 600 ? PETAL_PX.phone : PETAL_PX.desktop);

/**
 * What the layer stays quiet over (no trail, no burst): the HUD's parts (the toolbar and its pad,
 * the Settings sheet, the status), the dialogue's boxes (the line, its replies, Auto/Next/Log, the
 * log and its question) and every button (the envelope's Skip Intro).
 */
export const QUIET =
  '.inv-hud > *, .inv-talk-top, .inv-talk-choices, .inv-talk-box, .inv-talk-log, .inv-talk-ask, button';

/**
 * Whether `el` (what the pointer is over) is UI the layer stays quiet over (QUIET).
 * @param {unknown} el
 */
export function quietAt(el) {
  const e = /** @type {{closest?: (sel: string) => unknown}|null} */ (el);
  return Boolean(e && typeof e.closest === 'function' && e.closest(QUIET));
}

/** A click or a tap may wander this far (CSS px) from where it went down; further, it's a drag. */
export const CLICK = { tol: 8 };

/**
 * One press at a time, told apart as a click or not: `down` where it went down, `move` as it
 * goes (past `tol` px from there it's a drag from then on, even back where it started), `spoil`
 * when it's turned into something else (NEWT picked up, a second finger), `cancel` when it's
 * lost; `up` at its release says whether it was a click (its own pointer, let go within `tol`).
 * @param {{tol?: number}} [o]
 */
export function createClick({ tol = CLICK.tol } = {}) {
  /** @type {{id: number, x: number, y: number, spoilt: boolean}|null} */
  let press = null;
  const far = (/** @type {{x: number, y: number}} */ p, /** @type {number} */ x, /** @type {number} */ y) =>
    Math.hypot(x - p.x, y - p.y) > tol;
  return {
    /** @param {number} id @param {number} x @param {number} y */
    down(id, x, y) {
      press = { id, x, y, spoilt: false };
    },
    /** @param {number} id @param {number} x @param {number} y */
    move(id, x, y) {
      if (press && id === press.id && far(press, x, y)) press.spoilt = true;
    },
    spoil() {
      if (press) press.spoilt = true;
    },
    cancel() {
      press = null;
    },
    /** @param {number} id @param {number} x @param {number} y */
    up(id, x, y) {
      if (!press || id !== press.id) return false;
      const p = press;
      press = null;
      return !p.spoilt && !far(p, x, y);
    },
  };
}

/**
 * @typedef {object} PetalLayerOpts
 * @property {() => boolean} on  whether petals may come now (Rose Petals on, no reduced motion)
 * @property {Element|null} [before]  what it goes in before (the HUD: it's under it); else last
 * @property {() => boolean} [over]  whether it goes over everything now (the envelope is up)
 * @property {() => boolean} [carrying]  whether NEWT is being carried now (no click ring then)
 */

/**
 * The page's petal layer over `root`: its listeners and canvas now, its renderer once petals may come.
 * @param {HTMLElement} root
 * @param {PetalLayerOpts} opts
 */
export function createPetalLayer(root, { on, before = null, over = () => false, carrying = () => false }) {
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
    imageRendering: 'pixelated',
  });
  root.insertBefore(canvas, before);
  /** Over everything (the envelope's z-index 3) while the envelope is up, else in its place. */
  const place = () => {
    const z = ask(over) ? '4' : '';
    if (canvas.style.zIndex !== z) canvas.style.zIndex = z;
  };
  const clock = () => win.performance.now() / 1000;
  let running = false;
  let raf = 0;
  let last = 0;

  /**
   * One of its callers' answers (one that throws reads as no).
   * @param {() => boolean} f
   */
  const ask = (f) => {
    try {
      return Boolean(f());
    } catch {
      return false;
    }
  };
  /** Petals may come now. */
  const allowed = () => ask(on);

  /** @type {ReturnType<typeof build>} the renderer and its scene, once made */
  let gpu = null;
  /** @type {'none'|'up'|'failed'} not made yet, made, or refused (never asked again) */
  let gpuState = 'none';
  /** The renderer and its scene, made the first time petals may come (null if it's refused). */
  function ensure() {
    if (gpuState === 'none') {
      gpu = build();
      gpuState = gpu ? 'up' : 'failed';
    }
    return gpu;
  }
  /** The renderer, its scene and targets on `canvas`, or null where it can't draw. */
  function build() {
    /** @type {THREE.WebGLRenderer} */
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    } catch {
      return null;
    }
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
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

    function resize() {
      const cssW = Math.max(1, win.innerWidth);
      const cssH = Math.max(1, win.innerHeight);
      const px = texelPx(cssW, cssH);
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
      // (Each petal its length in CSS px, whatever the screen: world units a CSS px, over its unit.)
      petals.size = (petalPx(cssW, cssH) * (view.h / cssH)) / (PETAL_LEN * petals.unit);
      if (!running) clear();
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
    resize();
    // (Its shaders built while the page is idle, so the first petals don't hitch.)
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
      petals,
      view,
      resize,
      draw,
      clear,
      /**
       * A point on the screen (CSS px) on the petals' plane, world.
       * @param {number} x
       * @param {number} y
       */
      toWorld: (x, y) => ({ x: (x / view.cssW - 0.5) * view.w, y: -(y / view.cssH - 0.5) * view.h, z: 0 }),
      /**
       * A velocity on the screen (CSS px a second), world.
       * @param {number} vx
       * @param {number} vy
       */
      velWorld: (vx, vy) => ({ x: (vx / view.cssW) * view.w, y: -(vy / view.cssH) * view.h, z: 0 }),
      dispose() {
        petals.dispose();
        ink.dispose();
        colorRT.dispose();
        idRT.dispose();
        renderer.dispose();
      },
    };
  }
  const onResize = () => gpu?.resize();
  win.addEventListener('resize', onResize);

  // --- The pointer: the trail as it moves, a ring where it presses, a finger held still.
  const trail = createTrail({ seed: 29 });
  /** The press as a click or a drag (its ring comes on a click's release). */
  const click = createClick();
  /** The press the trail follows (the primary pointer's), and whether it holds (a finger). */
  /** @type {number|null} */
  let pressId = null;
  let holds = false;
  /** @param {import('./petals.js').TrailStep[]} steps */
  function shed(steps) {
    const g = ensure();
    if (!g) return;
    for (const s of steps) g.petals.emit('trail', g.toWorld(s.x, s.y), { v: g.velWorld(s.vx, s.vy), n: s.n });
    if (steps.length) wake();
  }
  /**
   * The pointer is over UI the layer stays quiet over (what's under it, not the element that has
   * its capture: a drag from the floor onto the toolbar goes quiet too).
   * @param {PointerEvent} e
   */
  const overUi = (e) => quietAt(doc.elementFromPoint?.(e.clientX, e.clientY) ?? e.target);
  /** @param {PointerEvent} e */
  const onDown = (e) => {
    // (A second finger turns the press into a pinch: no click.)
    if (!e.isPrimary) {
      click.spoil();
      return;
    }
    if ((e.pointerType === 'mouse' && e.button !== 0) || !allowed()) return;
    if (overUi(e)) {
      trail.lift();
      return;
    }
    pressId = e.pointerId;
    holds = e.pointerType !== 'mouse';
    trail.down(clock(), e.clientX, e.clientY, holds);
    click.down(e.pointerId, e.clientX, e.clientY);
    // (Made now, so its ring on the release doesn't wait on it; a held finger keeps it drawing.)
    if (ensure() && holds) wake();
  };
  /** @param {PointerEvent} e */
  const onMove = (e) => {
    if (!e.isPrimary) return;
    click.move(e.pointerId, e.clientX, e.clientY);
    // (Carrying keeps the trail, but its press is never a click. UI still interrupts the trail.)
    if (ask(carrying)) click.spoil();
    if (overUi(e)) {
      trail.lift();
      return;
    }
    const steps = trail.move(clock(), e.clientX, e.clientY);
    if (allowed()) shed(steps);
  };
  /** @param {PointerEvent} e */
  const onUp = (e) => {
    if (e.pointerId !== pressId) return;
    pressId = null;
    holds = false;
    trail.up();
    // (A click or a tap: its ring where it was let go. Not over the UI, nor once NEWT's carried.)
    const clicked = e.type !== 'pointercancel' && click.up(e.pointerId, e.clientX, e.clientY);
    click.cancel();
    if (!clicked || ask(carrying) || !allowed() || overUi(e)) return;
    const g = ensure();
    if (!g) return;
    g.petals.emit('ring', g.toWorld(e.clientX, e.clientY));
    wake();
  };
  /** A press lost outside the page must not keep the renderer awake waiting for pointerup. */
  const losePointer = () => {
    click.cancel();
    pressId = null;
    holds = false;
    trail.up();
    trail.lift();
  };
  /** @param {PointerEvent} e  out of the window (no element it went to): no trail across the gap */
  const onOut = (e) => {
    if (e.isPrimary && !e.relatedTarget) losePointer();
  };
  const onBlur = losePointer;
  const listen = { passive: true, capture: true };
  doc.addEventListener('pointerdown', onDown, listen);
  doc.addEventListener('pointermove', onMove, listen);
  doc.addEventListener('pointerup', onUp, listen);
  doc.addEventListener('pointercancel', onUp, listen);
  doc.addEventListener('pointerout', onOut, listen);
  win.addEventListener('blur', onBlur);

  // --- Each frame, while there's anything to draw.
  function wake() {
    if (running || !gpu) return;
    running = true;
    place();
    last = clock();
    raf = win.requestAnimationFrame(frame);
  }
  function frame() {
    const g = gpu;
    if (!g) return;
    const now = clock();
    const dt = Math.min(0.05, Math.max(0, now - last));
    last = now;
    place();
    // (A finger held still on carried NEWT keeps its trail, but the press is never a tap.)
    if (ask(carrying)) click.spoil();
    const steps = trail.hold(now);
    if (allowed()) shed(steps);
    else g.petals.cut(0.2);
    g.petals.step(dt);
    if (!g.petals.live() && !(pressId !== null && holds)) {
      running = false;
      g.clear();
      return;
    }
    g.draw();
    raf = win.requestAnimationFrame(frame);
  }
  /** Nothing launched yet, flow by flow (before its renderer is made). */
  const none = Object.fromEntries(Object.keys(FLOWS).map((k) => [k, 0]));

  return {
    /**
     * For ?test: whether its renderer is made ('none' until petals may come, 'failed' if it was
     * refused), whether it's drawing, how many are up, how many each flow has launched, its texels,
     * and a PETAL_SIZES 1 petal's length as drawn, CSS px.
     */
    snapshot() {
      return {
        gpu: gpuState,
        running,
        on: allowed(),
        live: gpu ? gpu.petals.live() : 0,
        emitted: gpu ? gpu.petals.emitted : { ...none },
        texels: gpu ? [gpu.view.tw, gpu.view.th] : [0, 0],
        petalPx: gpu ? (PETAL_LEN * gpu.petals.unit * gpu.petals.size * gpu.view.cssH) / gpu.view.h : 0,
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
      doc.removeEventListener('pointerout', onOut, listen);
      win.removeEventListener('blur', onBlur);
      gpu?.dispose();
      gpu = null;
      canvas.remove();
    },
  };
}
