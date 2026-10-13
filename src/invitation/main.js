// The invitation toy (/invitation/): NEWT on a plain white floor, to play with. This page boots
// it and runs it: the controls (ui.js), the stage (stage.js: renderer, camera, floor, lights,
// retro pass), NEWT (character.js, from models/newt.glb), the Look menu (switched live, kept in
// localStorage: look.js), the orbit camera (camera.js: a drag on empty space turns it, the
// wheel or a pinch zooms it, Reset Camera brings it back), and the render loop (stopped while
// the page is hidden, steps of at most 0.05 s, a lost WebGL context told).
//
// A frame, in types.js's order: the pointers' gestures (gesture.js; taps get their floor spot
// by ray) and the buttons → the camera moves → brain.step → his root: steer on the ground,
// carry while he's held (his collar, the Neck bone's head, hung from where the pointer's ray
// meets the lift height, 48 CSS px above a finger), the fall once he's let go (play.js bodyStep)
// → the clip mix and step phase (play.js mixStep; a restart of a clip still showing fades its
// twin out) → character.setWeights and update → the swing's tilt on his root and the collar
// anchoring, matrices updated before and after → lookStep and applyLook → faceStep and setFace
// → the blob shadow, the marker, the toolbar → render. The lift height comes from the Held clip
// at load (his collar over his lowest sole, plus a gap).
//
// Without WebGL the stage gets data-webgl="off" and a plain message. `?test` exposes
// window.__invitation for the specs and tools/capture-invitation.mjs: snapshot(), screen(part)
// (a point on NEWT in client px), floorAt(x, y), feet() and bones() (his ankles in the world,
// his bones from his root) and play(clip) (forces a clip); `?seed=N` and `?calm` go to the
// brain.
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './invitation.css';
import { createBrain } from './brain.js';
import { carryFeel } from './carry.js';
import {
  createOrbit,
  orbitEvents,
  orbitHome,
  orbitPose,
  orbitRelease,
  orbitReset,
  orbitSpot,
  orbitStep,
  orbitWheel,
} from './camera.js';
import { loadCharacter } from './character.js';
import { ANKLE_HEIGHT, BONES, COLLAR, FACE_TRACK, SCALE, fadeFor } from './clips.js';
import { createFaceState, faceStep } from './faces.js';
import { createGesture, pickScreen, rayPlaneY } from './gesture.js';
import { loadLook, presetOf, saveLook } from './look.js';
import { createLook, lookStep } from './lookAt.js';
import { bodyStep, createBody, createMix, lookAim, lookShare, mixStep, twinWeights } from './play.js';
import { createRng } from './rng.js';
import { createStage } from './stage.js';
import { centreOf } from './steer.js';
import { bindUi, parseQuery } from './ui.js';

/** The longest step a frame takes, seconds (a slow frame or a tab coming back never jumps). */
const MAX_DT = 0.05;
const BASE = import.meta.env.BASE_URL;
/** A finger carries him this far above itself, CSS px, so it doesn't hide him (a mouse: 0). */
const FINGER_LIFT = 48;
/** His soles hang this far over the floor while he's held, world units. */
const HANG_GAP = 0.3;
/** Extra reach for a finger picking him, CSS px. */
const TOUCH_SLOP = 6;
/** States remembered for ?test (the last ones, in order). */
const STATES_KEPT = 40;

const stageEl = /** @type {HTMLElement} */ (document.querySelector('[data-stage]'));
stageEl.textContent = ''; // (the noscript fallback)
const options = parseQuery(location.search);
let look = loadLook();
/** @type {import('./types.js').ButtonName|null} pressed since the last frame */
let pressed = null;
/** Reset Camera was pressed since the last frame. */
let resetCamera = false;
const ui = bindUi(stageEl, {
  look,
  onButton: (name) => {
    pressed = name;
  },
  onLook,
  onResetCamera: () => {
    resetCamera = true;
  },
});

/** @param {import('./look.js').Look} next */
function onLook(next) {
  look = next;
  saveLook(look);
  if (!stage) return;
  stage.setLook(presetOf(look), look);
  character?.setStyle(presetOf(look), look.pixelSize !== 'off');
}

function webgl2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

/** @type {ReturnType<typeof createStage>|null} */
let stage = null;
/** @type {Awaited<ReturnType<typeof loadCharacter>>|null} */
let character = null;
/** @type {import('./camera.js').OrbitState|null} */
let orbit = null;
if (webgl2()) {
  try {
    stage = createStage(stageEl, {
      preset: presetOf(look),
      look,
      insets,
      onResize: ({ view }) => {
        if (orbit) orbitHome(orbit, view.distance);
      },
    });
  } catch {
    stage = null;
  }
}
if (!stage) {
  stageEl.dataset.webgl = 'off';
  ui.setToolbar(false);
  ui.setStatus('NEWT needs WebGL 2 to draw, and this browser has it turned off.');
} else {
  start(stage);
}

/** Where the default view keeps clear of: a top margin, the toolbar, the side edges (and the safe areas). */
function insets() {
  const hud = /** @type {HTMLElement} */ (stageEl.querySelector('.inv-hud'));
  const pad = getComputedStyle(hud);
  const px = (v) => Number.parseFloat(v) || 0;
  const box = stageEl.getBoundingClientRect();
  const bar = ui.toolbar.getBoundingClientRect();
  return {
    top: 16 + px(pad.paddingTop),
    bottom: Math.max(0, box.bottom - bar.top) + 8,
    left: 24 + px(pad.paddingLeft),
    right: 24 + px(pad.paddingRight),
  };
}

/** @param {NonNullable<typeof stage>} s */
function start(s) {
  const { canvas } = s;
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed + 1);
  const brain = createBrain({ seed, calm: options.calm, bounds: s.bounds });
  const gesture = createGesture();
  const body = createBody();
  const mix = createMix();
  const gaze = createLook();
  const faces = createFaceState();
  orbit = createOrbit({ distance: s.view?.distance ?? 20, centre: centreOf(s.bounds) });
  const cam = orbit;
  s.setCamera(orbitPose(cam));

  let running = false;
  let lost = false;
  let drawn = false;
  let last = -1;
  /** The toy's clock, seconds (the sum of the frames' steps). */
  let t = 0;
  let choppy = 0;
  /** A clip forced by ?test's play(), else null (the brain decides). */
  let forced = null;
  /** @type {import('./types.js').ButtonName|null} the last button the loop took (for ?test) */
  let lastButton = null;
  /** @type {import('./types.js').BrainOut|null} */
  let out = null;
  /** @type {import('./types.js').GestureEvent[]} gestures since the last frame */
  let events = [];
  /** @type {string[]} */
  const states = [];
  /** The collar's height while he's held, world units (from the Held clip at load). */
  let liftY = 1.1;
  /** @type {import('./types.js').XYZ} where his collar was carried last */
  let target = { x: 0, y: liftY, z: 0 };
  /** The toolbar as last set, so the DOM is only touched on a change. */
  const shown = { sit: 'Sit', wander: /** @type {boolean|null} */ (null), enabled: true };

  new ResizeObserver(() => s.refit()).observe(ui.toolbar);

  loadCharacter(`${BASE}models/newt.glb`, {
    preset: presetOf(look),
    pixel: look.pixelSize !== 'off',
    pixelFaceUrl: `${BASE}models/newt-face.png`,
  })
    .then((c) => {
      character = c;
      c.root.rotation.order = 'XZY'; // (the swing tilts him about the world's axes, after his yaw)
      s.scene.add(c.root);
      liftY = hangHeight(c) + HANG_GAP;
      target = { x: 0, y: liftY, z: 0 };
      sync();
    })
    .catch(() => {
      ui.setStatus('NEWT couldn’t load. Check the connection, then reload.', { reload: true });
    });

  // --- Where things are.
  const v3 = { x: 0, y: 0, z: 0 };
  /** His lowest sole's height, world units (the Foot bones' heads are his ankles). */
  function soleY() {
    const c = /** @type {NonNullable<typeof character>} */ (character);
    const l = c.bonePos(BONES.footL, { x: 0, y: 0, z: 0 }).y;
    const r = c.bonePos(BONES.footR, { x: 0, y: 0, z: 0 }).y;
    return Math.min(l, r) - ANKLE_HEIGHT * SCALE;
  }
  /**
   * The collar over his lowest sole in the Held clip, at its highest through the clip (so his
   * feet never brush the floor while he's carried), world units.
   * @param {NonNullable<typeof character>} c
   */
  function hangHeight(c) {
    if (!c.has('Held')) return 0.8;
    const len = c.clipLength('Held');
    c.restart('Held');
    c.setWeights({ Held: 1 }, 0);
    let most = 0;
    for (let i = 0; i < 8; i++) {
      c.update(i ? len / 8 : 0);
      c.root.updateMatrixWorld(true);
      most = Math.max(most, c.bonePos(COLLAR, v3).y - soleY());
    }
    c.setWeights({ Idle: 1 }, 0);
    c.update(0);
    return most;
  }
  /** NEWT's pick shapes on screen. */
  function shape() {
    return /** @type {NonNullable<typeof character>} */ (character).screenShape(
      s.camera,
      canvas.getBoundingClientRect(),
    );
  }
  /** Whether a client point is on NEWT. */
  function onNewt(x, y, slop = 0) {
    if (!character) return false;
    const sh = shape();
    return pickScreen({ x, y }, sh.head, sh.body, slop);
  }

  // --- The pointers: every finger goes to the gesture reader (one carries or orbits, two
  // pinch); the mouse also hovers. Gestures get their floor spot where the ray meets it.
  /** @type {{x: number, y: number}|null} the mouse or pen over the canvas, client px */
  let hover = null;
  /** The kind of pointer that started the press under way. */
  let pressKind = 'mouse';
  const now = () => performance.now() / 1000;
  /** @param {PointerEvent} e */
  const sample = (e) => ({
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    t: now(),
    kind: e.pointerType,
    buttons: e.buttons,
  });
  /** @param {import('./types.js').GestureEvent[]} evs */
  const take = (evs) => {
    for (const e of evs) {
      if (e.type === 'tap' || e.type === 'release' || e.type === 'grab' || e.type === 'cancel')
        e.floor = s.floorPoint(e.x, e.y);
      events.push(e);
    }
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    const first = !gesture.current();
    if (first) pressKind = e.pointerType;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // (a pointer that's already gone)
    }
    const evs = gesture.down(
      sample(e),
      first && onNewt(e.clientX, e.clientY, e.pointerType === 'touch' ? TOUCH_SLOP : 0),
    );
    if (evs.some((g) => g.type === 'pinch')) orbitRelease(cam, Infinity); // (an orbit gives way to the pinch: no fling)
    take(evs);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') hover = { x: e.clientX, y: e.clientY };
    const p = sample(e);
    take(gesture.move(p, !gesture.current() && e.pointerType !== 'touch' && onNewt(p.x, p.y)));
  });
  canvas.addEventListener('pointerup', (e) => take(gesture.up(sample(e))));
  canvas.addEventListener('pointercancel', (e) => take(gesture.cancel(e.pointerId, now())));
  canvas.addEventListener('lostpointercapture', (e) => take(gesture.cancel(e.pointerId, now())));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch' && !gesture.current()) hover = null;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      // (A trackpad's pinch comes as a wheel with ctrl held, in small steps.)
      orbitWheel(cam, e.deltaY * unit * (e.ctrlKey ? 5 : 1));
      events.push({ type: 'pinch', on: 'floor', x: e.clientX, y: e.clientY, t: now(), scale: 1 });
    },
    { passive: false },
  );
  // (Safari's own pinch-zoom ignores touch-action on the page around the canvas.)
  for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault());

  /**
   * The pointer this frame: the press under way (a pinch's middle), else the mouse over the
   * canvas, in client px, with what it points at.
   */
  function pointerNow() {
    const c = gesture.current();
    const at = c ? { x: c.x, y: c.y } : hover;
    if (!at) return null;
    return {
      ...at,
      floor: s.floorPoint(at.x, at.y),
      onNewt: !c?.pinch && onNewt(at.x, at.y, pressKind === 'touch' ? TOUCH_SLOP : 0),
      pinch: Boolean(c?.pinch),
      touch: c ? pressKind === 'touch' : false,
    };
  }

  /**
   * The clip that leads what he shows (the gait's by speed).
   * @returns {string|null}
   */
  function shownClip() {
    if (!character) return null;
    if (forced) return forced;
    if (!out || out.clip === 'gait') return mix.main;
    return out.clip;
  }

  /** @param {number} dt @param {number} wall  performance.now() in seconds */
  function step(dt, wall) {
    const c = /** @type {NonNullable<typeof character>} */ (character);
    t += dt;
    // 1. Gestures and buttons; the camera takes the orbits, pinches and Reset Camera.
    take(gesture.tick(wall));
    const evs = events;
    events = [];
    const pose = moveCamera(evs, dt);
    const ptr = pointerNow();
    const button = pressed;
    if (pressed) lastButton = pressed;
    pressed = null;
    if (forced) {
      c.setWeights({ [forced]: 1 }, mix.phase);
      animate(c, dt);
      finish(c, ptr, pose, dt, { mode: 'camera', weight: 1 }, FACE_TRACK[forced]?.face ?? 'neutral', 'normal');
      return;
    }
    // 2. The brain.
    const o = think(c, evs, button, ptr, dt);
    // 3. His root: steer, carry or the fall.
    moveRoot(c, o, ptr, dt);
    // 4. The mix and the step phase.
    if (o.restart && c.restart(o.clip)) {
      mix.weights = twinWeights(mix.weights, o.clip);
      mix.fade = fadeFor(o.clip, o.clip);
    }
    mixStep(mix, { clip: o.clip, speed: body.body.speed, dt });
    c.setWeights(mix.weights, mix.phase);
    // 5. The animation; 6. held, his collar hung from the anchor.
    animate(c, dt);
    hang(c);
    // 7–8. The look and the face; the toolbar.
    finish(c, ptr, pose, dt, { mode: o.look.mode, weight: o.look.weight * lookShare(mix.weights) }, o.face, o.blink);
    toolbar(o);
  }

  /**
   * The camera this frame: the gestures and Reset Camera move it, it eases and follows NEWT.
   * @param {import('./types.js').GestureEvent[]} evs
   * @param {number} dt
   */
  function moveCamera(evs, dt) {
    orbitEvents(cam, evs);
    if (resetCamera) orbitReset(cam);
    resetCamera = false;
    orbitStep(cam, dt, { x: body.root.x, z: body.root.z });
    const pose = orbitPose(cam);
    s.setCamera(pose);
    return pose;
  }

  /**
   * brain.step, with what the page knows (the clip playing, the carry, the camera's spot).
   * @param {NonNullable<typeof character>} c
   * @param {import('./types.js').GestureEvent[]} evs
   * @param {import('./types.js').ButtonName|null} button
   * @param {ReturnType<typeof pointerNow>} ptr
   * @param {number} dt
   */
  function think(c, evs, button, ptr, dt) {
    const playing = out && out.clip !== 'gait' ? out.clip : null;
    const time = playing ? c.timeOf(playing) : 0;
    const o = brain.step({
      t,
      dt,
      events: evs,
      button,
      pointer: ptr?.floor ?? null,
      newt: { x: body.root.x, z: body.root.z, yaw: body.body.yaw, grounded: body.grounded },
      clip: playing ? { name: playing, time, remaining: c.clipLength(playing) - time } : null,
      carry: body.carry ? carryFeel(body.carry) : null,
      camera: orbitSpot(cam),
    });
    if (states.at(-1) !== o.state) {
      states.push(o.state);
      if (states.length > STATES_KEPT) states.shift();
    }
    out = o;
    return o;
  }

  /**
   * His root: steered, carried (toward where the pointer's ray meets the lift height, above a
   * finger) or falling (play.js bodyStep).
   * @param {NonNullable<typeof character>} c
   * @param {import('./types.js').BrainOut} o
   * @param {ReturnType<typeof pointerNow>} ptr
   * @param {number} dt
   */
  function moveRoot(c, o, ptr, dt) {
    const root = c.root;
    root.updateMatrixWorld(true);
    const press = gesture.current();
    if (press?.grabbed) {
      const ray = s.ray(press.x, press.y - (pressKind === 'touch' ? FINGER_LIFT : 0));
      const hit = rayPlaneY(ray.o, ray.d, liftY);
      if (hit) target = { x: hit.x, y: liftY, z: hit.z };
    }
    bodyStep(body, {
      state: o.state,
      move: o.move,
      pointer: ptr?.floor ?? null,
      bounds: s.bounds,
      dt,
      t,
      collar: c.bonePos(COLLAR, { x: 0, y: 0, z: 0 }),
      target,
      footOffset: soleY() - root.position.y,
    });
    if (body.mode !== 'held') root.position.set(body.root.x, body.root.y, body.root.z);
    root.rotation.set(body.tilt.x, body.body.yaw, body.tilt.z);
  }

  /**
   * Held: his root moved so his collar (posed this frame, the swing's tilt on) meets the
   * anchor, matrices updated before and after.
   * @param {NonNullable<typeof character>} c
   */
  function hang(c) {
    const root = c.root;
    root.updateMatrixWorld(true);
    if (body.mode !== 'held' || !body.carry) return;
    const a = body.carry.anchor;
    const at = c.bonePos(COLLAR, { x: 0, y: 0, z: 0 });
    root.position.x += a.x - at.x;
    root.position.y += a.y - at.y;
    root.position.z += a.z - at.z;
    root.updateMatrixWorld(true);
    body.root = { x: root.position.x, y: root.position.y, z: root.position.z };
  }

  /**
   * The toolbar, only on a change: the Sit/Stand label, Wander's state, the buttons resting.
   * @param {import('./types.js').BrainOut} o
   */
  function toolbar(o) {
    if (o.sitLabel !== shown.sit) ui.setSitLabel((shown.sit = o.sitLabel));
    if (o.wander !== shown.wander) ui.setWander((shown.wander = o.wander));
    if (o.buttonsEnabled !== shown.enabled) ui.setEnabled((shown.enabled = o.buttonsEnabled));
  }

  /** Step the animation (choppy motion: at the preset's animFps when it's set). */
  function animate(c, dt) {
    const fps = presetOf(look).animFps;
    if (fps > 0) {
      choppy += dt;
      if (choppy >= 1 / fps) {
        c.update(choppy);
        choppy = 0;
      }
    } else c.update(dt);
  }

  /**
   * The look, the face, the blob shadow and the marker.
   * @param {NonNullable<typeof character>} c
   * @param {ReturnType<typeof pointerNow>} ptr
   * @param {{position: import('./types.js').XYZ}} pose
   * @param {number} dt
   * @param {{mode: 'pointer'|'camera'|'forward'|'back', weight: number}} want
   * @param {import('./clips.js').FaceName} face
   * @param {import('./clips.js').BlinkMode} blink
   */
  function finish(c, ptr, pose, dt, want, face, blink) {
    const root = c.root;
    const head = c.bonePos(BONES.head, { x: 0, y: 0, z: 0 });
    head.y += 0.12; // (his eyes, over the head bone's base)
    const { aim, ahead } = lookAim(want.mode, {
      head,
      yaw: root.rotation.y,
      camera: pose.position,
      pointer: ptr && !ptr.pinch ? { floor: ptr.floor, onNewt: ptr.onNewt } : null,
    });
    lookStep(gaze, want.mode, aim, dt, t, rng, want.weight, ahead);
    c.applyLook(gaze.yaw, gaze.pitch, gaze.weight);
    c.setFace(faceStep(faces, face, blink, t, rng));
    s.setBlob(root.position.x, root.position.z, body.mode === 'ground' ? 0 : Math.min(1, root.position.y / 0.5));
    const mark = ptr && !ptr.pinch && !ptr.onNewt && body.mode === 'ground' ? ptr.floor : null;
    s.marker.visible = Boolean(mark);
    if (mark) s.marker.position.set(mark.x, s.marker.position.y, mark.z);
  }

  /** @param {number} ms */
  function frame(ms) {
    const dt = last < 0 ? 0 : Math.min((ms - last) / 1000, MAX_DT);
    last = ms;
    try {
      step(dt, ms / 1000);
      s.render();
    } catch {
      lost = true;
      sync();
      ui.setStatus('Something went wrong drawing NEWT. Reload to try again.', { reload: true });
      return;
    }
    if (!drawn) {
      drawn = true;
      stageEl.classList.add('is-ready');
      ui.setStatus(null);
    }
  }

  function sync() {
    const should = Boolean(character) && !lost && !document.hidden;
    if (should === running) return;
    running = should;
    last = -1; // (the time it was hidden doesn't count)
    s.renderer.setAnimationLoop(running ? frame : null);
  }
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    sync();
    ui.setStatus('NEWT’s picture was lost when the graphics driver reset. Reload to bring him back.', {
      reload: true,
    });
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  if (options.test) {
    /** @type {any} */ (window).__invitation = {
      snapshot: () => ({
        ready: drawn,
        state: out?.state ?? 'idle',
        clip: shownClip(),
        reaction: out?.reaction ?? null,
        face: character?.face ?? 'neutral',
        pos: { x: character?.root.position.x ?? 0, z: character?.root.position.z ?? 0 },
        lift: character?.root.position.y ?? 0,
        heading: body.body.yaw,
        headYaw: gaze.yaw * gaze.weight,
        headPitch: gaze.pitch * gaze.weight,
        held: body.mode === 'held',
        stress: out?.stress ?? 0,
        states: [...states],
        buttonsEnabled: out?.buttonsEnabled ?? true,
        // (CSS px a texel: N at N×, 1 over the capped DPR at Off.)
        pixelScale: s.grid.pd / s.grid.dpr,
        button: lastButton,
        texels: { w: s.grid.w, h: s.grid.h },
        camera: { yaw: cam.yaw, elevation: cam.elevation, distance: cam.distance },
        cameraHome: { ...cam.home },
        options,
      }),
      /** @param {'head'|'body'} part */
      screen(part) {
        const sh = shape();
        if (part === 'head') return { x: sh.head.x, y: sh.head.y };
        return { x: (sh.body.a.x + sh.body.b.x) / 2, y: (sh.body.a.y + sh.body.b.y) / 2 };
      },
      /** @param {number} x @param {number} y */
      floorAt: (x, y) => s.floorPoint(x, y),
      /** His ankles (the Foot bones' heads), world units: for measuring foot slide. */
      feet: () =>
        character && {
          l: character.bonePos(BONES.footL, { x: 0, y: 0, z: 0 }),
          r: character.bonePos(BONES.footR, { x: 0, y: 0, z: 0 }),
        },
      /** Every bone's head from his root, world units: for catching a pose that pops. */
      bones: () => {
        if (!character) return null;
        const r = character.root.position;
        /** @type {Record<string, import('./types.js').XYZ>} */
        const at = {};
        for (const name of Object.values(BONES)) {
          const p = character.bonePos(name, { x: 0, y: 0, z: 0 });
          at[name] = { x: p.x - r.x, y: p.y - r.y, z: p.z - r.z };
        }
        return at;
      },
      /** @param {string|null} clip */
      play(clip) {
        forced = clip;
        if (clip) character?.restart(clip);
        return Boolean(clip && character?.has(clip));
      },
    };
  }
}
