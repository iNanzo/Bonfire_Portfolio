// The invitation toy (/invitation/): NEWT on a plain white floor, to play with. This page boots
// it and runs it: the controls (ui.js), the stage (stage.js: renderer, camera, floor, lights,
// retro pass), NEWT (character.js, from models/newt.glb), the Look menu (switched live, kept in
// localStorage: look.js; a first visit gets the admin's Default look, content.js), the orbit
// camera (camera.js: a finger's drag on empty space or the mouse's right-drag turns it, the
// mouse's left-drag on empty space or two fingers pan it, the wheel or a pinch zooms it, Reset
// Camera brings it back), and the render loop (stopped while the page is hidden, steps of at
// most 0.05 s, a lost WebGL context told). While the Look sheet
// is open NEWT stays in sight: the view shows him in the clear space above or beside it
// (focusInsets, pixels.js clearInsets) and the orbit follows him all the way there. The floor
// is endless (rays meet it anywhere) and his play area is the floor the default view shows fully
// zoomed out (area.js viewArea), worked out again on a resize; the light's shadow camera goes
// where he goes (floor.js fitShadow).
//
// A frame, in types.js's order: the pointers' gestures (gesture.js; taps get their floor spot
// by ray) and the buttons → the camera moves → brain.step → his root: steer on the ground,
// carry while he's held (his collar, the Neck bone's head, hung where the pointer's ray meets
// the camera-facing plane through where he was grabbed, plus the grab offset, so the point
// grabbed stays under the cursor; 48 CSS px above a finger, coming in as he's picked up: carry.js
// dragTarget), the fall once he's let go (play.js bodyStep)
// → the clip mix and step phase (play.js mixStep; a restart of a clip still showing fades its
// twin out) → character.setWeights and update → the swing's tilt on his root and the collar
// anchoring, matrices updated before and after → lookStep and applyLook → faceStep and setFace
// → the blob shadow, the marker, the toolbar → render. With Motion Choppy (look.js) his pose
// (the update and applyLook) only moves on the clock's steps, 15 a second; his root, the
// camera and the rest move every frame. The lowest his collar is carried comes from the Held
// clip at load (his collar over his lowest sole, plus a gap).
//
// Without WebGL the stage gets data-webgl="off" and a plain message. `?test` exposes
// window.__invitation for the specs and tools/capture-invitation.mjs: snapshot(), screen(part)
// (a point on NEWT in client px: his head, middle or feet), floorAt(x, y), feet() and bones()
// (his ankles in the world, his bones from his root), grabbed() (while he's held, where the
// point he was grabbed by shows) and play(clip) (forces a clip, Walk and Run going round their
// step at their own pace); `?seed=N` and `?calm` go to the brain.
import { Vector3 } from 'three';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './invitation.css';
import { createBrain } from './brain.js';
import { invitationDefaults } from './content.js';
import { CARRY, carryFeel, dragPlane, dragTarget, gripFor } from './carry.js';
import { NEWT_HEIGHT, playArea, viewArea } from './area.js';
import {
  createOrbit,
  orbitArea,
  orbitEvents,
  orbitFollowAll,
  orbitHold,
  orbitHome,
  orbitPose,
  orbitRelease,
  orbitReset,
  orbitSpan,
  orbitSpot,
  orbitStep,
  orbitWheel,
} from './camera.js';
import { loadCharacter } from './character.js';
import { ANKLE_HEIGHT, BONES, COLLAR, FACE_TRACK, SCALE, fadeFor } from './clips.js';
import { createFaceState, faceStep } from './faces.js';
import { fitShadow, shadowTop } from './floor.js';
import { createGesture, pickScreen, rayPlaneY } from './gesture.js';
import { clearInsets, newtShare, newtTexels, pixelSteps, resolutionOf, stepFor } from './pixels.js';
import { animFps, installDefaults, isCustom, loadLook, lookPreset, motionStep, saveLook, shaderOf } from './look.js';
import { createLook, lookStep } from './lookAt.js';
import { bodyStep, createBody, createMix, lookAim, lookShare, mixStep, twinWeights } from './play.js';
import { createRng } from './rng.js';
import { LIFT, createStage } from './stage.js';
import { centreOf } from './steer.js';
import { bindUi, parseQuery } from './ui.js';

/** The longest step a frame takes, seconds (a slow frame or a tab coming back never jumps). */
const MAX_DT = 0.05;
const BASE = import.meta.env.BASE_URL;
/** A finger carries him this far above itself, CSS px, so it doesn't hide him (a mouse: 0). */
const FINGER_LIFT = 48;
/** His soles hang at least this far over the floor while he's held, world units. */
const HANG_GAP = 0.06;
/** Extra reach for a finger picking him, CSS px. */
const TOUCH_SLOP = 6;
/** States remembered for ?test (the last ones, in order). */
const STATES_KEPT = 40;
/**
 * The shadow camera reaches this high over the floor most of the time, world units (stage.js's,
 * what his shadow's texels were tuned for); higher only while he's carried up past it
 * (floor.js shadowTop).
 */
const SHADOW_TOP = LIFT + NEWT_HEIGHT;
/**
 * Where NEWT may go: the play area (area.js viewArea), one object kept in place (the brain and
 * his steps hold it) and filled in again on a resize; the default view's disc until then.
 * @type {import('./types.js').Bounds}
 */
const area = playArea();

const stageEl = /** @type {HTMLElement} */ (document.querySelector('[data-stage]'));
stageEl.textContent = ''; // (the noscript fallback)
const options = parseQuery(location.search);
// (The admin's Default look over the built-in one, before anything reads a look: a first visit
// gets it, a stored look still wins.)
installDefaults(invitationDefaults());
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
  onSheet,
});

/** @param {import('./look.js').Look} next */
function onLook(next) {
  look = next;
  saveLook(look);
  if (!stage) return;
  // (The style with the user's Shader options written in: lookPreset.)
  const preset = lookPreset(look);
  stage.setLook(preset, look);
  character?.setStyle(preset, look.pixelSize !== 'off');
}

/**
 * The Look sheet opened or closed: the orbit follows NEWT all the way while it's open, and the
 * view shows him in the clear space it leaves (focusInsets).
 * @param {boolean} open
 */
function onSheet(open) {
  if (orbit) orbitFollowAll(orbit, open);
  stage?.refit();
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
      preset: lookPreset(look),
      look,
      insets,
      focus: focusInsets,
      onResize: ({ grid, view }) => {
        // (Pixel Size's steps are this screen's: two resolutions that draw alike here are one.)
        ui.setPixelSteps(screenSteps());
        // (His shirt's plaid by how many texels tall he is, once he's in.)
        character?.setResolution(newtTexels(view, grid));
        if (!orbit || !stage) return;
        orbitHome(orbit, view.distance);
        orbitSpan(orbit, stageSpan(stage));
        setArea(areaOf(stage));
        orbitArea(orbit, area);
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

/** The stage's size, CSS px (a drag across it turns the camera the same share of a turn anywhere). */
function stageSize() {
  return { w: stageEl.clientWidth, h: stageEl.clientHeight };
}

/**
 * The stage for the orbit camera: its size, the canvas's CSS height (the field of view's) and
 * half the clear space insets() leave, round where the point it looks at shows (it keeps NEWT
 * on screen in there).
 * @param {NonNullable<typeof stage>} s
 */
function stageSpan(s) {
  const { w, h } = stageSize();
  const i = insets();
  return { w, h, ch: s.grid.canvasH, hw: (w - i.left - i.right) / 2, hh: (h - i.top - i.bottom) / 2 };
}

/**
 * The play area: the floor the default view shows fully zoomed out, inside the clear space
 * (area.js viewArea); the default view's disc until the stage has a view.
 * @param {NonNullable<typeof stage>} s
 */
function areaOf(s) {
  const { w, h } = stageSize();
  return s.view ? viewArea({ view: s.view, cssW: w, cssH: h, insets: insets() }) : playArea();
}

/**
 * The play area becomes `next`, in place (a disc's `r` gone with it).
 * @param {import('./types.js').Bounds} next
 */
function setArea(next) {
  for (const k of Object.keys(area)) delete area[/** @type {keyof typeof area} */ (k)];
  Object.assign(area, next);
}

/** Pixel Size's steps on this screen (pixels.js pixelSteps: two that draw alike here are one). */
function screenSteps() {
  return pixelSteps(stageEl.clientWidth, stageEl.clientHeight, window.devicePixelRatio || 1);
}

/** Whether the slider shows Native: the Pixel Size is Native, or a resolution at 1 px a texel here. */
function shownNative() {
  return stepFor(look.pixelSize, screenSteps()).value === 'native';
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

/**
 * Where the point the camera looks at shows: the middle of the space insets() leaves, or, with
 * the Look sheet open, of the clear space above or beside it, so a look's changes show on NEWT
 * (and Reset Camera's way back).
 */
function focusInsets() {
  const base = insets();
  if (!ui.sheetOpen) return base;
  const cssW = stageEl.clientWidth;
  const cssH = stageEl.clientHeight;
  const box = stageEl.getBoundingClientRect();
  const r = ui.sheet.getBoundingClientRect();
  return clearInsets({
    cssW,
    cssH,
    insets: base,
    cover: { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top },
    tall: newtShare(cssW, cssH) * Math.min(cssW, cssH),
  });
}

/**
 * The Look's Shader options for ?test: every value (look.js shaderOf), whether the Style row
 * shows Custom, and what the renderer has from them (stage.js lookState).
 * @param {NonNullable<typeof stage>} s
 */
function lookSnapshot(s) {
  return { shader: shaderOf(look), custom: isCustom(look), pass: s.lookState() };
}

/** @param {NonNullable<typeof stage>} s */
function start(s) {
  const { canvas } = s;
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed + 1);
  setArea(areaOf(s));
  const brain = createBrain({ seed, calm: options.calm, bounds: area });
  const gesture = createGesture();
  const body = createBody();
  const mix = createMix();
  const gaze = createLook();
  const faces = createFaceState();
  orbit = createOrbit({ distance: s.view?.distance ?? 20, centre: centreOf(s.bounds), span: stageSize() });
  const cam = orbit;
  orbitSpan(cam, stageSpan(s));
  orbitArea(cam, area);
  s.setCamera(orbitPose(cam));
  /** The light that casts NEWT's shadow (its shadow camera follows him). */
  const sun = /** @type {any} */ (s.scene.children.find((o) => /** @type {any} */ (o).isDirectionalLight)) ?? null;

  let running = false;
  let lost = false;
  let drawn = false;
  let last = -1;
  /** The toy's clock, seconds (the sum of the frames' steps). */
  let t = 0;
  /** Motion Choppy: the time his pose has waited since its last step, seconds. */
  let waiting = 0;
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
  let hangY = 1.1;
  /** @type {import('./carry.js').Grip|null} how he's held, while he is */
  let grip = null;
  /** @type {import('./types.js').XYZ} where his collar was carried last */
  let target = { x: 0, y: hangY, z: 0 };
  /** The retro pass's other path is compiled (stage.js warm), for ?test. */
  let warmed = false;
  /** The toolbar as last set, so the DOM is only touched on a change. */
  const shown = { sit: 'Sit', wander: /** @type {boolean|null} */ (null), enabled: true };

  // (The Look sheet too: it changes height with its hint at Pixel Size Off.)
  const refit = new ResizeObserver(() => s.refit());
  refit.observe(ui.toolbar);
  refit.observe(ui.sheet);

  loadCharacter(`${BASE}models/newt.glb`, {
    preset: lookPreset(look),
    pixel: look.pixelSize !== 'off',
    pixelFaceUrl: `${BASE}models/newt-face.png`,
  })
    .then((c) => {
      character = c;
      if (s.view) c.setResolution(newtTexels(s.view, s.grid));
      c.root.rotation.order = 'XZY'; // (the swing tilts him about the world's axes, after his yaw)
      s.scene.add(c.root);
      s.setSubject(c.root); // (the retro pass's boxes go round him: stage.js)
      hangY = hangHeight(c) + HANG_GAP;
      target = { x: 0, y: hangY, z: 0 };
      sync();
      // (The pass's other path compiled ahead, so the first switch to Off or back never stalls.)
      s.warm()
        .then(() => (warmed = true))
        .catch(() => {});
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
  /**
   * Where a client point meets the floor: anywhere, the floor is endless (null above the horizon).
   * @param {number} x
   * @param {number} y
   */
  function floorAt(x, y) {
    const { o, d } = s.ray(x, y);
    return rayPlaneY(o, d, 0);
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
        e.floor = floorAt(e.x, e.y);
      events.push(e);
    }
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    // (The mouse's left button holds, walks and pans, its right one orbits, its middle one pans
    // (no autoscroll); any other button, or a second one, does nothing: gesture.js.)
    if (e.pointerType !== 'touch' && (e.button > 2 || gesture.current())) return;
    if (e.pointerType !== 'touch' && e.button === 1) e.preventDefault();
    const first = !gesture.current();
    if (first) pressKind = e.pointerType;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // (a pointer that's already gone)
    }
    const evs = gesture.down(
      { ...sample(e), button: e.button },
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
      floor: floorAt(at.x, at.y),
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
      // (Walk and Run take their time from the step phase: it goes round at the clip's own pace.)
      const len = c.clipLength(forced);
      if (len > 0) mix.phase = (mix.phase + dt / len) % 1;
      c.setWeights({ [forced]: 1 }, mix.phase);
      const moved = animate(c, dt);
      finish(c, ptr, pose, dt, { mode: 'camera', weight: 1 }, FACE_TRACK[forced]?.face ?? 'neutral', 'normal', moved);
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
    const moved = animate(c, dt);
    hang(c);
    // 7–8. The look and the face; the toolbar.
    const want = { mode: o.look.mode, weight: o.look.weight * lookShare(mix.weights), ease: o.look.ease };
    finish(c, ptr, pose, dt, want, o.face, o.blink, moved);
    toolbar(o);
  }

  /**
   * Where the point the camera looks at shows, client px (the view's shift from the canvas's
   * middle: a pan keeps the floor under the cursor).
   */
  function shownAt() {
    const r = canvas.getBoundingClientRect();
    const shift = s.view?.shift ?? { x: 0, y: 0 };
    return { x: r.left + r.width / 2 + shift.x, y: r.top + r.height / 2 + shift.y };
  }

  /**
   * The camera this frame: the gestures and Reset Camera move it, it eases and keeps NEWT on
   * screen (holding still while he's held).
   * @param {import('./types.js').GestureEvent[]} evs
   * @param {number} dt
   */
  function moveCamera(evs, dt) {
    orbitEvents(cam, evs, evs.some((e) => e.type === 'pan') ? shownAt() : null);
    if (resetCamera) orbitReset(cam);
    resetCamera = false;
    orbitHold(cam, body.mode === 'held');
    orbitStep(cam, dt, { x: body.root.x, z: body.root.z, y: Math.max(0, body.root.y) });
    const pose = orbitPose(cam);
    s.setCamera(pose);
    // (The zoom, NEWT's size on screen over the default view's: at a resolution the stage sizes
    // the texel to it, so he keeps the chosen sprite resolution at any zoom; cheap every frame.)
    s.setZoomScale(cam.home.distance / cam.distance);
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
   * His root: steered, carried (dragged on the camera-facing plane through where he was grabbed,
   * the point grabbed under the cursor, or a little above a finger: carry.js) or falling
   * (play.js bodyStep).
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
      if (!grip) {
        const collar = c.bonePos(COLLAR, { x: 0, y: 0, z: 0 });
        grip = gripFor(s.ray(press.x, press.y), dragPlane(s.camera.position, collar), collar, t);
      }
      const lift = pressKind === 'touch' ? FINGER_LIFT * Math.min(1, (t - grip.t0) / CARRY.liftIn) : 0;
      target = dragTarget(grip, s.ray(press.x, press.y - lift), t, hangY);
    } else grip = null;
    bodyStep(body, {
      state: o.state,
      move: o.move,
      pointer: ptr?.floor ?? null,
      bounds: area,
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

  /**
   * Step the animation: every frame, or with Motion Choppy on the clock's steps (look.js
   * motionStep, whole ticks of 1/15 s). True when his pose moved this frame.
   * @param {NonNullable<typeof character>} c
   * @param {number} dt
   */
  function animate(c, dt) {
    const fps = animFps(look);
    const m = motionStep(waiting, dt, fps);
    waiting = m.acc;
    if (fps > 0 && !(m.step > 0)) return false;
    c.update(m.step);
    return true;
  }

  /**
   * The look, the face, the blob shadow and the marker.
   * @param {NonNullable<typeof character>} c
   * @param {ReturnType<typeof pointerNow>} ptr
   * @param {{position: import('./types.js').XYZ}} pose
   * @param {number} dt
   * @param {{mode: 'pointer'|'camera'|'forward'|'back', weight: number, ease?: number}} want
   * @param {import('./clips.js').FaceName} face
   * @param {import('./clips.js').BlinkMode} blink
   * @param {boolean} moved  his pose stepped this frame (the look goes on with it)
   */
  function finish(c, ptr, pose, dt, want, face, blink, moved) {
    const root = c.root;
    const head = c.bonePos(BONES.head, { x: 0, y: 0, z: 0 });
    head.y += 0.12; // (his eyes, over the head bone's base)
    const { aim, ahead } = lookAim(want.mode, {
      head,
      yaw: root.rotation.y,
      camera: pose.position,
      pointer: ptr && !ptr.pinch ? { floor: ptr.floor, onNewt: ptr.onNewt, ray: s.ray(ptr.x, ptr.y) } : null,
    });
    lookStep(gaze, want.mode, aim, dt, t, rng, want.weight, ahead, want.ease);
    if (moved) c.applyLook(gaze.yaw, gaze.pitch, gaze.weight);
    c.setFace(faceStep(faces, face, blink, t, rng));
    s.setBlob(root.position.x, root.position.z, body.mode === 'ground' ? 0 : Math.min(1, root.position.y / 0.5));
    if (sun)
      fitShadow(sun, s.bounds, shadowTop(root.position.y, SHADOW_TOP), { x: root.position.x, z: root.position.z });
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
        // (The face sheet showing: a pixel sheet's cell width, 'smooth' for the 1024 sheet, as at
        // Off; his half face in texels.)
        faceSheet: character?.faceSheet ?? null,
        faceTexels: character?.faceTexels ?? 0,
        atlas: character?.atlas ?? null,
        pos: { x: character?.root.position.x ?? 0, z: character?.root.position.z ?? 0 },
        lift: character?.root.position.y ?? 0,
        heading: body.body.yaw,
        headYaw: gaze.yaw * gaze.weight,
        headPitch: gaze.pitch * gaze.weight,
        held: body.mode === 'held',
        stress: out?.stress ?? 0,
        states: [...states],
        buttonsEnabled: out?.buttonsEnabled ?? true,
        // (CSS px a texel: his height on screen over his texels; 1 over the capped DPR at Off.)
        pixelScale: s.grid.pd / s.grid.dpr,
        // (The Pixel Size's sprite resolution N, 'native' where the slider shows Native (a
        // resolution that comes to 1 px here too), null at Off; and his height in texels.)
        resolution: shownNative() ? 'native' : resolutionOf(look.pixelSize),
        newtTexels: s.view ? newtTexels(s.view, s.grid) : 0,
        button: lastButton,
        texels: { w: s.grid.w, h: s.grid.h },
        // (CSS px he stands tall in the default view, where he starts.)
        newtTall: s.view ? (newtTexels(s.view, s.grid) * s.grid.pd) / s.grid.dpr : 0,
        // (The camera's yaw, elevation and distance, the point it looks at on the floor, and
        // whether a pan holds it.)
        camera: {
          yaw: cam.yaw,
          elevation: cam.elevation,
          distance: cam.distance,
          target: { x: cam.target.x, z: cam.target.z },
          panned: cam.panned,
        },
        // (Where he may go: the play area, area.js viewArea.)
        area: { ...area },
        // (Both of the retro pass's paths compiled: the first switch to Off or back won't stall.)
        warmed,
        // (The Shader options: every value, whether any is the user's own, and what reached
        // the renderer.)
        ...lookSnapshot(s),
        cameraHome: { ...cam.home },
        options,
      }),
      /** @param {'head'|'body'|'feet'} part */
      screen(part) {
        const sh = shape();
        if (part === 'head') return { x: sh.head.x, y: sh.head.y };
        if (part === 'feet') return { x: sh.body.a.x, y: sh.body.a.y };
        return { x: (sh.body.a.x + sh.body.b.x) / 2, y: (sh.body.a.y + sh.body.b.y) / 2 };
      },
      floorAt,
      /**
       * While he's held: where the point he was grabbed by shows now, client px (his collar as
       * posed less the grab offset); null otherwise.
       */
      grabbed() {
        if (!grip || !character || body.mode !== 'held') return null;
        const p = character.bonePos(COLLAR, { x: 0, y: 0, z: 0 });
        const at = new Vector3(p.x - grip.offset.x, p.y - grip.offset.y, p.z - grip.offset.z).project(s.camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + ((at.x + 1) / 2) * r.width, y: r.top + ((1 - at.y) / 2) * r.height };
      },
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
