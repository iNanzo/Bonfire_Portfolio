// The invitation toy (/invitation/): NEWT on a plain white floor, to play with. This page boots
// it and runs it: the controls (ui.js), the stage (stage.js: renderer, camera, floor, lights,
// retro pass), NEWT (character.js, from models/newt.glb), the Look menu (switched live, kept in
// localStorage: look.js; a first visit gets the admin's Default look, content.js), the orbit
// camera (camera.js: a finger's drag on empty space or the mouse's right-drag turns it, the
// mouse's left-drag on empty space or two fingers pan it, the wheel or a pinch zooms it about the
// cursor or the fingers' middle, the Camera pad turns, tilts, zooms, follows him and resets it,
// queued like Reset Camera and left be while the intro runs; a tap or a grab on him ends a pan),
// the pixel cursors (cursor.js: the stage's data-cursor each frame from what the pointer is over
// and doing), and the render loop (stopped while the page is hidden, steps of at most 0.05 s, a
// lost WebGL context told). While the Settings sheet
// is open NEWT stays in sight: the view shows him in the clear space above or beside it
// (focusInsets, pixels.js clearInsets) and the orbit follows him all the way there. The floor
// is endless (rays meet it anywhere) and his play area is one rounded square round the orbit's
// centre (area.js viewArea), worked out again on a resize, its middle the brain's and Reset
// Camera's; the light's shadow camera goes where he goes (floor.js fitShadow). Wander, a
// setting, is kept for the next visit (ui.js loadWander) and goes to the brain as its button.
//
// A frame, in types.js's order: the pointers' gestures (gesture.js; taps get their floor spot
// by ray) and the buttons → the camera moves → brain.step → talk.step (speech.js: what he says,
// from the admin's lines and settings, content.js; a line goes to the bubble) → his root: steer
// on the ground, carry while he's held (his collar, the Neck bone's head, hung where the
// pointer's ray meets the camera-facing plane through where he was grabbed, plus the grab
// offset, so the point grabbed stays under the cursor; 48 CSS px above a finger, coming in as
// he's picked up, and near the top of the stage as low as keeps his head on it: carry.js
// dragTarget), the fall once he's let go (play.js bodyStep)
// → the clip mix and step phase (play.js mixStep; a restart of a clip still showing fades its
// twin out) → character.setWeights and update → the swing's tilt on his root and the collar
// anchoring, matrices updated before and after → lookStep and applyLook → faceStep and setFace
// → the blob shadow, the marker, the toolbar → the speech bubble (bubble.js: over his head as
// posed, clear of the toolbar, the open Camera pad and Settings sheet, out of sight while the sheet covers his
// head; near the top, beside his head, narrowed to fit there, or under his feet) → render. With Motion Choppy (look.js) his pose (the update and applyLook) only moves
// on the clock's steps, 15 a second; his root, the camera and the rest move every frame. The
// lowest his collar is carried comes from the Held clip at load (his collar over his lowest
// sole, plus a gap).
//
// Replay Intro (ui.js) runs the intro's dialogue (dialogue.js, on content.js introScript():
// content.json's invitation.intro as the admin writes it, mended, or the toy's own) on the toy's
// clock, shown by dialogueUi.js over the stage: the toolbar rests out of sight, the speech bubble
// goes and stays quiet, the layer takes every press (no drags, no orbit, no floor taps), the first
// line waits (its clock held, nothing typed) until he's up, walked in and turned to the camera
// (BrainOut.talkReady), and the brain acts each box out (brain.js's talk state: BrainIn.dialogue;
// its face through setFace, which
// stands in the nearest of his first four until a dialogue face's sheet is in; a clip the glb
// lacks playing as Idle), he looks at the camera with a little sway (dialogue.js lookSway), and
// the camera goes to each box's shot (camera.js shotView and orbitShot, framed in the clear space
// over the box; cut with reduced motion). At the end the camera eases back to the view before, and
// his free play, the toolbar and the bubble come back.
//
// Without WebGL the stage gets data-webgl="off" and a plain message. `?test` exposes
// window.__invitation for the specs and tools/capture-invitation.mjs: snapshot(), screen(part)
// (a point on NEWT in client px: his head, middle or feet), floorAt(x, y), feet() and bones()
// (his ankles in the world, his bones from his root), grabbed() (while he's held, where the
// point he was grabbed by shows), say(text) (a line in his bubble now), play(clip) (forces a
// clip, Walk and Run going round their step at their own pace) and face(name) (holds any of
// clips.js FACE_NAMES on him, no blinks; null gives it back to the brain); `?seed=N` and `?calm`
// go to the brain (and the seed to talk).
import { Vector3 } from 'three';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './invitation.css';
import './bubble.css';
import './dialogue.css';
import { createBrain } from './brain.js';
import { createBubble, speakerPoint } from './bubble.js';
import { introFrom, introScript, invitationDefaults, invitationLines, speechSettings } from './content.js';
import { CARRY, carryFeel, dragPlane, dragTarget, gripFor } from './carry.js';
import { NEWT_HEIGHT, playArea, viewArea } from './area.js';
import {
  createOrbit,
  orbitArea,
  orbitEvents,
  orbitFollow,
  orbitFollowAll,
  orbitHold,
  orbitHome,
  orbitNudge,
  orbitPanEnd,
  orbitPose,
  orbitRelease,
  orbitReset,
  orbitShot,
  orbitSpan,
  orbitSpot,
  orbitStep,
  orbitTalk,
  orbitTurning,
  orbitWheel,
  orbitZoom,
  shotView,
} from './camera.js';
import { cursorKind, installCursors } from './cursor.js';
import { loadCharacter } from './character.js';
import { ANKLE_HEIGHT, BONES, COLLAR, FACE_NAMES, FACE_TRACK, SCALE, fadeFor } from './clips.js';
import { createDialogue, lookSway, normalizeScript } from './dialogue.js';
import { REPLY_SETTLE, createDialogueUi } from './dialogueUi.js';
import { createFaceState, faceStep } from './faces.js';
import { fitShadow, shadowTop } from './floor.js';
import { createGesture, pickScreen, rayPlaneY } from './gesture.js';
import { clearInsets, newtShare, newtTexels, pixelSteps, resolutionOf, stepFor } from './pixels.js';
import { animFps, installDefaults, isCustom, loadLook, lookPreset, motionStep, saveLook, shaderOf } from './look.js';
import { createLook, lookStep, torsoStep } from './lookAt.js';
import { bodyStep, createBody, createMix, lookAim, lookShare, mixStep, twinWeights } from './play.js';
import { createRng } from './rng.js';
import { createTalk } from './speech.js';
import { LIFT, createStage } from './stage.js';
import { centreOf } from './steer.js';
import { bindUi, deviceLabelOf, loadWander, parseQuery, saveWander } from './ui.js';

/** The longest step a frame takes, seconds (a slow frame or a tab coming back never jumps). */
const MAX_DT = 0.05;
const BASE = import.meta.env.BASE_URL;
/** A finger carries him this far above itself, CSS px, so it doesn't hide him (a mouse: 0). */
const FINGER_LIFT = 48;
/**
 * A finger carrying him near the top of the stage keeps the top of his head this far inside it,
 * CSS px: its lift gives way, then the finger's own spot (a mouse is never moved off its point).
 */
const HEAD_ROOM = 8;
/** The time constant his head's height over the point grabbed is followed at, seconds. */
const HEAD_FOLLOW = 0.1;
/** His soles hang at least this far over the floor while he's held, world units. */
const HANG_GAP = 0.06;
/** Extra reach for a finger picking him, CSS px. */
const TOUCH_SLOP = 6;
/**
 * After a right-button press on the canvas lets go, a context menu this soon after is still its
 * own, ms (Chrome on Windows fires it at the release, on whatever is under the cursor then: the
 * toolbar, at the end of a drag down to tilt the camera; pointer capture doesn't redirect it).
 */
const RIGHT_MENU_MS = 1000;
/** States remembered for ?test (the last ones, in order). */
const STATES_KEPT = 40;
/**
 * The script Play Intro runs: content.js introScript() (the admin's, mended where it's broken, or
 * the toy's own), through dialogue.js normalizeScript as the runner's own safety net.
 */
/** @type {ReturnType<typeof introScript>|null} Only set through the ?test hooks. */
let testIntro = null;
const playScript = () => normalizeScript(testIntro ?? introScript());
/** The space a shot frames him in keeps this far off the Auto row and the chat box (its name tab too), CSS px. */
const SHOT_MARGIN = { top: 10, bottom: 30 };
/**
 * The shadow camera reaches this high over the floor most of the time, world units (stage.js's,
 * what his shadow's texels were tuned for); higher only while he's carried up past it
 * (floor.js shadowTop).
 */
const SHADOW_TOP = LIFT + NEWT_HEIGHT;
/**
 * Where NEWT may go: the play area (area.js viewArea, a rounded square round the orbit's centre),
 * one object kept in place (the brain and his steps hold it) and filled in again on a resize;
 * the default view's disc until then.
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
/** The Camera pad's other presses since the last frame, in order (left be while the intro runs). */
/** @type {Array<import('./ui.js').CameraKey>} */
let cameraPresses = [];
/** Replay Intro was pressed since the last frame. */
let introPressed = false;
/**
 * Wander as the visitor wants it (the Settings switch, or as they left it last time), until the
 * brain has it: null, the brain's own (on, but never under ?calm).
 * @type {boolean|null}
 */
let wanderWanted = options.calm ? null : loadWander();
const ui = bindUi(stageEl, {
  look,
  wander: wanderWanted ?? !options.calm,
  onButton: (name) => {
    pressed = name;
  },
  onLook,
  onCamera: (key) => {
    if (key === 'reset') resetCamera = true;
    else cameraPresses.push(key);
  },
  onWander: (on) => {
    wanderWanted = on;
    saveWander(on);
  },
  onSheet,
  onIntro: () => {
    introPressed = true;
  },
});
installCursors();
stageEl.dataset.cursor = 'arrow';

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
 * The Settings sheet opened or closed: the orbit follows NEWT all the way while it's open, and the
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
/** His height in texels at the Pixel Size's own grid in the default view (his shirt goes by it). */
let homeTexels = 0;
if (webgl2()) {
  try {
    stage = createStage(stageEl, {
      preset: lookPreset(look),
      look,
      insets,
      focus: focusInsets,
      onResize: ({ view, home }) => {
        // (Pixel Size's steps are this screen's: two resolutions that draw alike here are one.)
        ui.setPixelSteps(screenSteps());
        // (His shirt's plaid by how many texels tall the Pixel Size makes him in the default
        // view, once he's in: never the zoom's bigger blocks or the governor's coarser ones.)
        homeTexels = newtTexels(view, home);
        character?.setResolution(homeTexels);
        if (!orbit || !stage) return;
        orbitHome(orbit, view.distance);
        orbitSpan(orbit, stageSpan(stage));
        setArea(areaOf(stage));
        orbitArea(orbit, area);
        stage.setArea(area);
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
 * The play area: a rounded square round the default view's target, the biggest the fully
 * zoomed-out default view shows him whole in (area.js viewArea); the default view's disc until
 * the stage has a view.
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
 * Where the point the camera looks at shows: the middle of the space insets() leaves (the open
 * Camera pad over the stage never changes it), or, with the Settings sheet open, of the clear
 * space above or beside it, so a look's changes show on NEWT.
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
  s.setArea(area);
  const brain = createBrain({ seed, calm: options.calm, bounds: area, middle: centreOf(area) });
  const gesture = createGesture();
  const body = createBody();
  const mix = createMix();
  const gaze = createLook();
  /** How much of a big look his chest takes (lookAt.js torsoStep). */
  let torso = 1;
  const faces = createFaceState();
  // (What he says and when, from the admin's lines and settings; the bubble goes in before the
  // HUD, so the toolbar and the Look sheet stay over it, and runs on the toy's clock, as talk
  // does: a slow frame's capped step or a hidden tab moves both alike, so they agree on when a
  // line is up.)
  const talk = createTalk({ lines: invitationLines(), speech: speechSettings(), rng: createRng(seed + 2) });
  const bubble = createBubble({ root: stageEl, before: stageEl.querySelector('.inv-hud'), now: () => t });
  orbit = createOrbit({ distance: s.view?.distance ?? 20, centre: centreOf(area), span: stageSize() });
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
  /** @type {import('./clips.js').FaceName|null} a face held by ?test's face(), else null (the brain's, with blinks) */
  let forcedFace = null;
  /** @type {import('./types.js').ButtonName|null} the last button the loop took (for ?test) */
  let lastButton = null;
  /** @type {import('./types.js').BrainOut|null} */
  let out = null;
  /** @type {import('./types.js').BrainOut|null} the brain's output talk saw last (think() overwrites `out`) */
  let heard = null;
  /** @type {import('./types.js').GestureEvent[]} gestures since the last frame */
  let events = [];
  /** @type {string[]} */
  const states = [];
  /** The collar's height while he's held, world units (from the Held clip at load). */
  let hangY = 1.1;
  /** @type {import('./carry.js').Grip|null} how he's held, while he is */
  let grip = null;
  /** How far the top of his head shows above the point grabbed, CSS px (followed while held). */
  let headAbove = 0;
  /** @type {import('./types.js').XYZ} where his collar was carried last */
  let target = { x: 0, y: hangY, z: 0 };
  /** The retro pass's other path is compiled (stage.js warm), for ?test. */
  let warmed = false;
  /** The toolbar as last set, so the DOM is only touched on a change. */
  const shown = {
    sit: 'Sit',
    device: /** @type {string} */ ('Give Device'),
    wander: /** @type {boolean|null} */ (null),
    enabled: true,
    cursor: 'arrow',
  };
  /** @type {ReturnType<typeof createDialogue>|null} the intro under way (Play Intro) */
  let intro = null;
  /** The box whose shot the camera last went to (dialogue.js DialogueView seq). */
  let shotSeq = -1;
  /** @type {import('./types.js').DialogueShot|null} the shot showing, for ?test */
  let shot = null;
  /** @type {{top: number, bottom: number}|null} the clear space the shot was framed in, client px, for ?test */
  let framed = null;
  /** The intro just ended and the camera is still easing back. */
  let backFromIntro = false;
  /**
   * The intro's line waits, its clock held, until he's in place (brain.js BrainOut.talkReady: up,
   * walked in, turned to the camera), so its line, face and gesture begin together.
   */
  let introHeld = false;
  /**
   * The clips he's played since the intro's box came up, in order ('gait': Idle, Walk or Run by
   * speed), for ?test.
   */
  const acted = { seq: -1, clips: /** @type {string[]} */ ([]) };
  const talkUi = createDialogueUi(stageEl, {
    onAction: onTalk,
    log: () => intro?.log ?? [],
    replySettle: options.settle ?? REPLY_SETTLE,
  });
  // (A resize while the intro runs, or the chat box growing with a longer line: the shot framed
  // again for the new clear space.)
  const reframe = new ResizeObserver(() => {
    if (intro && shot) goToShot(shot, reducedMotion());
  });
  reframe.observe(stageEl);
  reframe.observe(talkUi.box, { box: 'border-box' });

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
      c.setResolution(homeTexels);
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
  /**
   * Where the point he's held by shows, client px: his collar as posed less the grab offset.
   * @param {import('./carry.js').Grip} g
   */
  function grabbedAt(g) {
    const p = /** @type {NonNullable<typeof character>} */ (character).bonePos(COLLAR, { x: 0, y: 0, z: 0 });
    const at = new Vector3(p.x - g.offset.x, p.y - g.offset.y, p.z - g.offset.z).project(s.camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((at.x + 1) / 2) * r.width, y: r.top + ((1 - at.y) / 2) * r.height };
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
  /** Until when (performance.now(), ms) a context menu is a canvas right-press's own: none for it. */
  let rightMenuUntil = -Infinity;
  /** A press let go: a right press's menu may still come, for a moment. */
  const pressGone = () => {
    if (rightMenuUntil === Infinity) rightMenuUntil = performance.now() + RIGHT_MENU_MS;
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // (Wherever the right button's own menu lands: the toolbar, the sheet, the page.)
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (performance.now() <= rightMenuUntil) e.preventDefault();
    },
    true,
  );
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' && e.button === 2) rightMenuUntil = Infinity;
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
  canvas.addEventListener('pointerup', (e) => {
    pressGone();
    take(gesture.up(sample(e)));
  });
  canvas.addEventListener('pointercancel', (e) => {
    pressGone();
    take(gesture.cancel(e.pointerId, now()));
  });
  canvas.addEventListener('lostpointercapture', (e) => {
    pressGone();
    take(gesture.cancel(e.pointerId, now()));
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch' && !gesture.current()) hover = null;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      // (A trackpad's pinch comes as a wheel with ctrl held, in small steps. About the cursor: the
      // floor under it stays under it.)
      const at = shownAt();
      orbitWheel(cam, e.deltaY * unit * (e.ctrlKey ? 5 : 1), { x: e.clientX - at.x, y: e.clientY - at.y });
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
    // (While the intro runs the layer over the stage takes every press: none reach the brain or
    // the camera.)
    const evs = intro ? [] : events;
    events = [];
    if (introPressed) beginIntro();
    introPressed = false;
    const box = introStep();
    const pose = moveCamera(evs, dt);
    const ptr = pointerNow();
    const button = pressed ?? wanderPress();
    if (pressed) lastButton = pressed;
    pressed = null;
    showCursor(ptr);
    if (forced) {
      // (Walk and Run take their time from the step phase: it goes round at the clip's own pace.)
      const len = c.clipLength(forced);
      if (len > 0) mix.phase = (mix.phase + dt / len) % 1;
      c.setWeights({ [forced]: 1 }, mix.phase);
      const moved = animate(c, dt);
      finish(c, ptr, pose, dt, { mode: 'camera', weight: 1 }, FACE_TRACK[forced]?.face ?? 'neutral', 'normal', moved);
      voice();
      return;
    }
    // 2. The brain, then what he says (nothing while the intro runs).
    const o = think(c, evs, intro ? null : button, ptr, dt, box);
    // (A clip the glb lacks, as an older copy cached from before the dialogue's gestures would,
    // plays as the gait: Idle standing still.)
    if (o.clip !== 'gait' && !c.has(o.clip)) {
      o.clip = 'gait';
      o.restart = false;
    }
    if (box) noteActed(box.seq, o.clip);
    // (Quiet too while the camera eases back after it: its close shots aren't the visitor's zoom.)
    if (backFromIntro && !cam.resetting) backFromIntro = false;
    if (!intro && !backFromIntro) speak(o, evs, button, dt);
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
    const want = {
      mode: o.look.mode,
      weight: o.look.weight * lookShare(mix.weights),
      ease: o.look.ease,
      at: o.look.at ?? null,
    };
    finish(c, intro ? null : ptr, pose, dt, want, o.face, o.blink, moved);
    toolbar(o);
    voice();
  }

  /**
   * Wander as the visitor wants it, as the brain's own button: pressed (toggling it) while the
   * brain has it the other way, never during the intro. Null once the brain has it.
   * @returns {import('./types.js').ButtonName|null}
   */
  function wanderPress() {
    if (wanderWanted === null || !out || intro) return null;
    if (out.wander === wanderWanted) {
      wanderWanted = null;
      return null;
    }
    return 'Wander';
  }

  /**
   * The stage's cursor (cursor.js) as the pointer is now: over him, pressing or holding him,
   * panning or orbiting; the arrow while the intro runs.
   * @param {ReturnType<typeof pointerNow>} ptr
   */
  function showCursor(ptr) {
    const c = gesture.current();
    const kind = cursorKind({
      onNewt: Boolean(ptr?.onNewt && !ptr.touch),
      pressing: c?.on === 'newt',
      held: body.mode === 'held',
      drag: c?.orbit ? 'orbit' : c?.pan ? 'pan' : null,
      talking: Boolean(intro),
    });
    if (kind !== shown.cursor) stageEl.dataset.cursor = shown.cursor = kind;
  }

  /** Whether the visitor asked for less motion (false where it can't be read). */
  function reducedMotion() {
    try {
      return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
      return false;
    }
  }

  /**
   * Play Intro: the dialogue starts from its first box (when the buttons are on: never while he's
   * held or falling); the toolbar rests, the bubble goes, the camera turns to the front.
   */
  function beginIntro() {
    if (intro || !out?.buttonsEnabled || ui.sheetOpen) return;
    intro = createDialogue(playScript(), { reduced: reducedMotion() });
    intro.start(t);
    intro.pause(true, t);
    introHeld = true;
    shotSeq = -1;
    shot = null;
    framed = null;
    acted.seq = -1;
    acted.clips = [];
    hover = null;
    bubble.hide();
    ui.setTalking(true);
    orbitTalk(cam, true, { cut: reducedMotion() });
    talkUi.open();
  }

  /**
   * Notes the clip he plays this frame against the intro's box (a new box starts the list again).
   * @param {number} seq  the box's (dialogue.js DialogueView seq)
   * @param {string} clip
   */
  function noteActed(seq, clip) {
    if (seq !== acted.seq) {
      acted.seq = seq;
      acted.clips = [];
    }
    if (acted.clips.at(-1) !== clip) acted.clips.push(clip);
  }

  /**
   * The intro's over: the layer goes, the camera eases back (cuts, with reduced motion), the
   * toolbar and free play return.
   */
  function endIntro() {
    intro = null;
    introHeld = false;
    shot = null;
    talkUi.close();
    orbitTalk(cam, false, { cut: reducedMotion(), focus: { x: body.root.x, z: body.root.z } });
    backFromIntro = true;
    ui.setTalking(false);
    // (The talk wasn't stepped through the intro: its idle clock starts again from now.)
    talk.rest(t);
  }

  /**
   * The visitor pressed something on the dialogue's screen.
   * @param {import('./dialogueUi.js').TalkAction} a
   */
  function onTalk(a) {
    const d = intro;
    if (!d) return;
    // (A tap while he's still getting into place finishes nothing: the line hasn't begun.)
    if (a.type === 'advance') {
      if (!introHeld) d.advance(t);
    } else if (a.type === 'choose') d.choose(a.index, t);
    else if (a.type === 'auto') d.setAuto(a.on, t);
    else if (a.type === 'skip') d.skip(t);
    else if (a.type === 'pause') d.pause(a.on || introHeld, t);
    else if (a.type === 'end') d.end();
    if (d.view.done) endIntro();
    else {
      // (The new line in the box first: its shot is framed over the box as this line has it.)
      talkUi.render(heldView(d.view));
      shotFor(d.view);
    }
  }

  /**
   * A view as the screen shows it: while the line waits for him to get into place, its box with
   * nothing typed (no ▼, no replies), whatever the runner holds (reduced motion's whole line too).
   * @param {import('./dialogue.js').DialogueView} v
   */
  function heldView(v) {
    return introHeld ? { ...v, shown: 0, typed: false, choices: null } : v;
  }

  /**
   * A new box sends the camera to its shot (cut with reduced motion), as soon as it's up.
   * @param {import('./dialogue.js').DialogueView} v
   */
  function shotFor(v) {
    if (!v.box || v.seq === shotSeq) return;
    shotSeq = v.seq;
    goToShot(v.box.camera, reducedMotion());
  }

  /**
   * The intro this frame: its clock moves on (the typing, Auto) once he's in place, a new box
   * sends the camera to its shot, and the screen shows it. What the brain gets (BrainIn.dialogue),
   * or null.
   * @returns {import('./types.js').DialogueIn|null}
   */
  function introStep() {
    if (!intro) return null;
    // (In place, as of the brain's last frame: the line goes on from its start, unless the Log or
    // the question holds it.)
    if (introHeld && out?.talkReady) {
      introHeld = false;
      intro.pause(talkUi.logOpen || talkUi.asking, t);
    }
    const v = intro.step(t);
    if (v.done || !v.box) {
      endIntro();
      return null;
    }
    talkUi.render(heldView(v));
    shotFor(v);
    return { seq: v.seq, animation: v.box.animation, face: v.box.face, typing: !v.typed };
  }

  /**
   * The camera to a box's shot (keep: as it is), framed in the clear space between the Auto row
   * and the chat box.
   * @param {import('./types.js').DialogueShot} name
   * @param {boolean} cut
   */
  function goToShot(name, cut) {
    const space = talkUi.clearSpace();
    const top = space.top + SHOT_MARGIN.top;
    const bottom = space.bottom - SHOT_MARGIN.bottom;
    const clear = { h: Math.max(80, bottom - top), raise: shownAt().y - (top + bottom) / 2 };
    const view = shotView(cam, name, clear);
    if (!view) return;
    shot = name;
    framed = space;
    orbitShot(cam, view, { cut, focus: { x: body.root.x, z: body.root.z } });
  }

  /**
   * Where the camera faces him from while the intro runs: its goal's way round from him (he turns
   * to where it's going, not to where it is on the way).
   */
  function talkSpot() {
    const d = cam.goal.distance * Math.cos(cam.goal.elevation);
    return { x: body.root.x + d * Math.sin(cam.goal.yaw), z: body.root.z + d * Math.cos(cam.goal.yaw) };
  }

  /**
   * What he says this frame (speech.js): talk reads the brain's output, this frame's and the
   * last, the gestures, the button pressed (Sit: he didn't sit by himself) and the camera's yaw
   * and zoom; a line goes to the bubble.
   * @param {import('./types.js').BrainOut} o
   * @param {import('./types.js').GestureEvent[]} evs
   * @param {import('./types.js').ButtonName|null} button
   * @param {number} dt
   */
  function speak(o, evs, button, dt) {
    const camera = { yaw: cam.yaw, zoom: cam.distance / cam.home.distance };
    const line = talk.step({ t, dt, state: o, prevState: heard, events: evs, button, camera });
    heard = o;
    if (line.say) bubble.say(line.say);
  }

  /**
   * The bubble, while a line is up: over his head as posed this frame (character.js
   * screenShape), clear of the toolbar, the open Camera pad and Settings sheet, out of sight while the sheet
   * covers his head (bubble.js speakerPoint).
   */
  function voice() {
    if (bubble.text === null) return;
    const sheet = ui.sheetOpen ? ui.sheet.getBoundingClientRect() : null;
    const avoid = [ui.toolbar.getBoundingClientRect()];
    if (sheet) avoid.push(sheet);
    if (ui.padOpen) avoid.push(ui.pad.getBoundingClientRect());
    // (His feet's bottom on screen: a bubble with no room over or beside his head goes under him.)
    const sh = shape();
    const feet = Math.max(sh.body.a.y, sh.body.b.y) + sh.body.r;
    bubble.update(speakerPoint(sh.head, [sheet]), avoid, feet);
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
    // (A tap or a grab on him: the user's pan is over, the view takes him again.)
    if (evs.some((e) => e.on === 'newt' && (e.type === 'tap' || e.type === 'grab'))) orbitFollow(cam);
    orbitEvents(cam, evs, evs.some((e) => e.type === 'pan' || e.type === 'pinch') ? shownAt() : null);
    // (Two fingers' pan ends with no release of its own: once nothing pans, it's let go.)
    if (cam.panning && !gesture.current()?.pan) orbitPanEnd(cam);
    if (!intro) for (const key of cameraPresses) padPress(key);
    cameraPresses = [];
    if (resetCamera && !intro) orbitReset(cam);
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
   * One of the Camera pad's presses: Turn Left or Right a 45° turn (Left as a drag to the left
   * turns it), Tilt Up or Down 12°, Zoom In or Out about where it looks, Follow NEWT onto him.
   * @param {import('./ui.js').CameraKey} key
   */
  function padPress(key) {
    const TURN = Math.PI / 4;
    const TILT = (12 * Math.PI) / 180;
    if (key === 'left' || key === 'right') orbitNudge(cam, { yaw: key === 'left' ? TURN : -TURN });
    else if (key === 'up' || key === 'down') orbitNudge(cam, { elevation: key === 'up' ? TILT : -TILT });
    else if (key === 'in' || key === 'out') orbitZoom(cam, key === 'in' ? 1.25 : 0.8);
    else if (key === 'follow') orbitFollow(cam, { x: body.root.x, z: body.root.z });
  }

  /**
   * brain.step, with what the page knows (the clip playing, the carry, the camera's spot).
   * @param {NonNullable<typeof character>} c
   * @param {import('./types.js').GestureEvent[]} evs
   * @param {import('./types.js').ButtonName|null} button
   * @param {ReturnType<typeof pointerNow>} ptr
   * @param {number} dt
   * @param {import('./types.js').DialogueIn|null} [dialogue]  the intro's box, while it runs
   */
  function think(c, evs, button, ptr, dt, dialogue = null) {
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
      camera: dialogue ? talkSpot() : orbitSpot(cam),
      dialogue,
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
        // (The point pressed, where the press began: a grab comes only once the press has strayed
        // moveTol or more, and nothing moved him before it, so the point under the cursor now is
        // not the one grabbed. From the press, the first frame carries him the whole way.)
        const collar = c.bonePos(COLLAR, { x: 0, y: 0, z: 0 });
        grip = gripFor(s.ray(press.x0, press.y0), dragPlane(s.camera.position, collar), collar, t);
        const head = shape().head;
        headAbove = press.y0 - (head.y - head.r);
      }
      // (A finger's lift over itself, coming in as he's picked up. Near the top of the stage it
      // gives way, then the finger's own spot, so the top of his head stays on the screen: lifted,
      // he hangs nearer the camera and his head shows further over the point grabbed, so that's
      // followed from the last frame's pose. A mouse's point stays under the cursor.)
      let y = press.y;
      if (pressKind === 'touch') {
        y -= FINGER_LIFT * Math.min(1, (t - grip.t0) / CARRY.liftIn);
        const head = shape().head;
        headAbove += (grabbedAt(grip).y - (head.y - head.r) - headAbove) * Math.min(1, dt / HEAD_FOLLOW);
        y = Math.max(y, stageEl.getBoundingClientRect().top + HEAD_ROOM + headAbove);
      }
      target = dragTarget(grip, s.ray(press.x, y), hangY);
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
   * The toolbar, only on a change: the Sit/Stand label, Give Device's (what its next press does:
   * the brain's deviceLabel, ui.js deviceLabelOf), Wander's switch, the buttons resting.
   * @param {import('./types.js').BrainOut} o
   */
  function toolbar(o) {
    if (o.sitLabel !== shown.sit) ui.setSitLabel((shown.sit = o.sitLabel));
    const device = deviceLabelOf(o);
    if (device !== shown.device) ui.setDeviceLabel((shown.device = device));
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
   * @param {{mode: 'pointer'|'camera'|'forward'|'back', weight: number, ease?: number, at?: import('./types.js').XZ|null}} want
   *   at: who he runs from ('back')
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
      pursuer: want.at ?? null,
    });
    // (Talking, a little sway on his look at the camera, so it's never a fixed stare.)
    const sway = intro && aim ? lookSway(t) : null;
    const at = sway && aim ? { yaw: aim.yaw + sway.yaw, pitch: aim.pitch + sway.pitch } : aim;
    lookStep(gaze, want.mode, at, dt, t, rng, want.weight, ahead, want.ease);
    // (His chest joins in on his feet only: held, his collar hangs from the cursor.)
    torso = torsoStep(torso, body.mode === 'ground', dt);
    if (moved) c.applyLook(gaze.yaw, gaze.pitch, gaze.weight, torso);
    // (Any of the eight: character.js shows a dialogue face's stand-in until its sheet is in.)
    c.setFace(forcedFace ?? faceStep(faces, face, blink, t, rng));
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

  /**
   * The face asked for and the face really showing (the nearest of the first four until a
   * dialogue face's sheet is in), for ?test's snapshot.
   */
  const facesNow = () => ({ face: character?.face ?? 'neutral', faceShown: character?.faceShown ?? 'neutral' });

  /** The intro for ?test, while it runs (else null). */
  function introSnapshot() {
    const d = intro;
    if (!d) return null;
    const v = heldView(d.view);
    return {
      id: v.box?.id ?? null,
      seq: v.seq,
      speaker: v.speaker,
      text: v.box?.text ?? '',
      shown: v.shown,
      length: v.length,
      typed: v.typed,
      choices: v.choices ? v.choices.map((c) => c.next) : null,
      auto: v.auto,
      paused: v.paused,
      // (The line waits for him to get into place: up, walked in, turned.)
      waiting: introHeld,
      camera: v.box?.camera ?? null,
      shot,
      framed,
      log: d.log.length,
      logOpen: talkUi.logOpen,
      asking: talkUi.asking,
      // (The replies show and take a press: settled since they showed and since the last press.)
      repliesLive: talkUi.repliesLive,
      goal: { ...cam.goal },
      // (His part: getting up, walking in, turning to the camera, talking; and the clips he's
      // played since this box came up.)
      phase: brain.snapshot().talk?.phase ?? null,
      clips: acted.seq === v.seq ? [...acted.clips] : [],
    };
  }

  /** The controls for ?test: Wander as the brain has it, and the stage's cursor. */
  const controlsSnapshot = () => ({ wander: out ? out.wander : null, cursor: stageEl.dataset.cursor || null });

  if (options.test) {
    /** @type {any} */ (window).__invitation = {
      snapshot: () => ({
        ready: drawn,
        state: out?.state ?? 'idle',
        clip: shownClip(),
        reaction: out?.reaction ?? null,
        ...facesNow(),
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
          turning: orbitTurning(cam),
        },
        // (Whether he wanders by himself, as the brain has it; the stage's cursor.)
        ...controlsSnapshot(),
        // (Where he may go: the play area, area.js viewArea, a rounded square.)
        area: { ...area },
        // (Both of the retro pass's paths compiled: the first switch to Off or back won't stall.)
        warmed,
        // (The Shader options: every value, whether any is the user's own, and what reached
        // the renderer.)
        ...lookSnapshot(s),
        cameraHome: { ...cam.home },
        // (What he's saying: the line up and its trigger, when the idle clock comes round.)
        talk: talk.snapshot(),
        // (How long the intro's replies wait after a press that went on, ms: ?settle in specs.)
        replySettle: options.settle ?? REPLY_SETTLE,
        // (The intro, while it runs: the box up, its typing, its replies' targets, Auto, the
        // Log and the question, the shot and where the camera's going.)
        dialogue: introSnapshot(),
        toolbarTalking: ui.talking,
        options,
      }),
      /** @param {'head'|'body'|'feet'} part */
      screen(part) {
        const sh = shape();
        if (part === 'head') return { x: sh.head.x, y: sh.head.y, r: sh.head.r };
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
        return grabbedAt(grip);
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
      /**
       * Show a line in his bubble now, as talk would (its time on screen, seconds).
       * @param {string} text
       */
      say: (text) => bubble.say(String(text)),
      /**
       * Hold a face on him (any of clips.js FACE_NAMES; null: the brain's again). Whether it's one.
       * @param {string|null} name
       */
      face(name) {
        forcedFace = FACE_NAMES.includes(/** @type {any} */ (name)) ? /** @type {any} */ (name) : null;
        return forcedFace !== null;
      },
      /** The intro's script as Play Intro runs it (playScript). */
      intro: () => playScript(),
      /** Use a controlled script for UI behavior tests; null restores the admin’s content.
       * @param {unknown} value
       */
      setIntro(value) {
        testIntro = value == null ? null : introFrom(value);
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
