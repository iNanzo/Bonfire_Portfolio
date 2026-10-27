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
// is endless (rays meet it anywhere) and his play area is one disc round the orbit's centre
// holding all the floor the default view shows however it's turned (area.js viewArea; a tap near
// the top of the screen walks him only as far as keeps his head on it, area.js tapReach), worked
// out again on a resize (the view eases onto its middle; a shrink under him walks him back in:
// brain.js, steer.js backInGoal), its middle where the view rests at the default zoom, the
// brain's and Reset Camera's; it carries what's on screen each frame (its `sight`, camera.js
// orbitSight), so wander goals and a flee keep to the screen. The light's shadow camera goes
// where he goes (floor.js fitShadow). Wander, a setting, is kept for the next visit (ui.js
// loadWander) and goes to the brain as its button.
//
// A frame, in types.js's order: the pointers' gestures (gesture.js; taps get their floor spot
// by ray) and the buttons → the camera moves → brain.step → talk.step (speech.js: what he says,
// from the admin's lines and settings, content.js; a line goes to the bubble) → his root: steer
// on the ground, carry while he's held (his collar, the Neck bone's head, hung where the bead hold
// puts it: holds/bead.js createBeadHold for each grab, through hold.js's interface; a bead on the
// pointer's ray, plus the grab offset as it eases out, so his collar comes under the cursor; the
// hold's lift above a finger, coming in as he's picked up; the wheel and a second finger go to
// the hold for his height), the fall once he's let go (play.js bodyStep, with the hold's release
// velocity), the hold's squash and stretch on his root
// → the clip mix and step phase (play.js mixStep; a restart of a clip still showing fades its
// twin out) → character.setWeights and update → the swing's tilt on his root and the collar
// anchoring, matrices updated before and after → lookStep and applyLook → faceStep and setFace
// → the blob shadow (off the floor, sized and faded by his lowest foot's height: cues.js; held,
// or flying from a let-go, on the floor point the ring and the drop line share, cueSpot, else
// under his hips), the marker (or, while he's held, the ring under him and the dashed drop
// line, Ground Cues), the toolbar → the speech bubble (bubble.js: over his head as
// posed, clear of the toolbar, the open Camera pad and Settings sheet, out of sight while the sheet covers his
// head; near the top, beside his head, narrowed to fit there, or under his feet) → a landing's
// dust and screen shake (dropFx: dust.js through stage.setDust, camera.js shakeOffset through
// stage.setShake) → render. With Motion Choppy (look.js) his pose (the update and applyLook) only moves
// on the clock's steps, 15 a second; his root, the camera and the rest move every frame. The
// lowest his collar is carried comes from the Held clip at load (his collar over his lowest
// sole, plus a gap).
//
// The envelope (envelopeScene.js, envelope.js) opens the page every visit: made right after the
// controls, so it's the loading screen too, it covers the toy and takes every press (the HUD is
// inert under it); the toy draws its first frame (.is-ready) and waits behind it, paused. Opened,
// it fades and the intro starts by itself (introWanted, held until the buttons are on), the
// camera cut to the talk shot behind the letter, its first line and his gesture held until the
// letter no longer hides his head and chest (envelope.veils, envelopeVeils); skipped, it drops
// away and the toy is free, focus on the toolbar.
// Without WebGL 2, or if NEWT can't load, it steps aside for the message. ?test skips it unless
// &envelope. Replay Intro resets the scene and spawns it again (replay: any intro ended, a hold
// dropped, NEWT, his brain, mix, gaze and faces as they started, the camera cut home, the bubble,
// the grab ring and the hover gone), the toy paused behind it as at boot; opened, the intro starts
// the same way. Under ?test without &envelope, Replay Intro runs the dialogue alone.
//
// The link button (ui.js linkHtml and link.js; content.js linkSettings(), the admin's link) sits
// over everything at the top left while the envelope is up and while the intro runs or is about
// to (opened, not yet begun), so it stays put from the one into the other, and at the top right
// in the toy (syncLink: each frame, and as the envelope comes and goes; ui.js fades it between
// the two). In the envelope's and the intro's corner their layer owns it (aria-owns) and their
// Tab order takes it after their own buttons (linkStops); the intro's Log and question put it out
// of reach, as the Settings sheet does. Under ?preview there's none.
//
// Replay Intro without an envelope runs the intro's dialogue (dialogue.js, on content.js introScript():
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
// window.__invitation for the specs and tools/capture-invitation.mjs: snapshot(), petals() (the
// page's petal layer, petalLayer.js), screen(part)
// (a point on NEWT in client px: his head, middle or feet), floorAt(x, y), feet() and bones()
// (his ankles in the world, his bones from his root), grabbed() (while he's held, where the
// point he was grabbed by shows), say(text) (a line in his bubble now), play(clip) (forces a
// clip, Walk and Run going round their step at their own pace), face(name) (holds any of
// clips.js FACE_NAMES on him, no blinks; null gives it back to the brain) and press(name) (a
// toolbar button's press, as the brain gets it: types.js ButtonName); snapshot().motion is the
// carry (his collar on screen, how long he's been held, the anchor and the drag plane, whether
// he's pushed at the edge), the limp layer (its weight, the most a limb has swung) and Screen
// Time (the brain's device and label, the tablet shown and where, his turn off the camera);
// snapshot().drag is the hold's (its height controls, the collar's gap from where it's aimed, CSS px,
// the hold height, the anchor's depth along the camera's level axis, the blob, his hips' floor
// point and lowest foot, the floor point the cues share, the ring, the drop line and Ground Cues
// as they play, the blob's and the ring's centres on screen, the way his root faces as drawn);
// view({yaw, elevation, zoom}) eases the camera there; `?seed=N` and `?calm` go to the brain (and
// the seed to talk).
// clock() is the toy's clock (it stands still while the envelope covers him), envelope() the
// envelope's state and pose (null without one); setLink({href, label}) gives the link button a
// link of the spec's own (link.js linkFrom; none under ?preview), and snapshot().link is how it
// stands (shown, its href and label, its corner, where it's drawn, its fade, inert).
//
// `?preview` is the admin's intro preview (admin/ui/introPreview.js frames it): no envelope, calm
// (no wandering), no bubble lines and no petals. It listens only to its parent window, at the
// origin preview.js previewOrigin gives (the framing page's own), takes the messages preview.js
// readPreview checks (the draft's intro, its text colours, a box, the viewport, restart) and
// plays that box (playPreview, on the frame's next step): the intro started from it as Replay
// Intro starts one (he turns to the camera, the box's shot, face, gesture and line, its replies),
// with restart the scene first as it began (replay without the envelope: he walks in again). It
// holds there; a tap or a reply goes on as in the intro. It answers with preview.js previewState:
// ready once he's drawn, playing as each box comes up (with where Next goes from it), done as it
// ends. It never takes the focus from the admin's page (preview.js keepFocusOut). ?test's
// snapshot().preview says what it listens to and plays.
import { Vector3 } from 'three';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './invitation.css';
import './bubble.css';
import './dialogue.css';
import './envelope.css';
import { DANGLE, createBrain, dangleLift, talkPhase } from './brain.js';
import { createBubble, speakerPoint } from './bubble.js';
import {
  introFrom,
  introScript,
  invitationDefaults,
  invitationLines,
  linkSettings,
  speechSettings,
  textPalette,
} from './content.js';
import { CARRY, createHand, handFeel, handStep } from './carry.js';
import {
  CUES,
  blobLook,
  blobWeight,
  cueSpot,
  cueStep,
  groundCueMode,
  lineMode,
  lineShare,
  mixWants,
  ringFloor,
  ringStrength,
} from './cues.js';
import { depthAlong, levelAxes, squash } from './hold.js';
import { createBeadHold } from './holds/bead.js';
import { NEWT_HEIGHT, playArea, tapReach, viewArea } from './area.js';
import {
  areaFits,
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
  orbitSight,
  orbitSpan,
  orbitSpot,
  orbitStep,
  orbitTalk,
  orbitTurning,
  orbitWheel,
  orbitZoom,
  shakeKick,
  shakeOffset,
  shotView,
} from './camera.js';
import { cursorKind, installCursors } from './cursor.js';
import { loadCharacter } from './character.js';
import { ANKLE_HEIGHT, BONES, COLLAR, DIALOGUE_WAYS, FACE_NAMES, FACE_TRACK, SCALE, fadeFor } from './clips.js';
import { createDialogue, lookSway, normalizeScript } from './dialogue.js';
import { REPLY_SETTLE, TALK_LEAD, createDialogueUi } from './dialogueUi.js';
import { createDust, dustLand, dustPuffs } from './dust.js';
import { createEnvelopeScene } from './envelopeScene.js';
import { createPetalLayer } from './petalLayer.js';
import { keepFocusOut, nextBox, previewOrigin, previewState, readPreview } from './preview.js';
import { createFaceState, faceStep } from './faces.js';
import { fitShadow, shadowTop } from './floor.js';
import { createGesture, pickScreen, rayPlaneY } from './gesture.js';
import { clearInsets, newtShare, newtTexels, pixelSteps, resolutionOf, stepFor } from './pixels.js';
import {
  animFps,
  installDefaults,
  isCustom,
  loadLook,
  lookPreset,
  motionStep,
  petalsOn,
  saveLook,
  shaderOf,
  shakeOn,
} from './look.js';
import { createGlance, createLook, glanceLook, glanceStep, lookStep, torsoStep } from './lookAt.js';
import {
  bodyStep,
  createBody,
  createMix,
  glanceFront,
  lookAim,
  lookFront,
  lookShare,
  mixStep,
  twinWeights,
} from './play.js';
import { burstAt, hoverEase } from './retro.js';
import { blobCentre, lieWeight } from './ring.js';
import { createRng } from './rng.js';
import { createTalk } from './speech.js';
import { LIFT, createStage } from './stage.js';
import { centreOf } from './steer.js';
import { bindUi, deviceLabelOf, loadWander, parseQuery, saveWander } from './ui.js';
import { linkCorner, linkFrom } from './link.js';

/** The longest step a frame takes, seconds (a slow frame or a tab coming back never jumps). */
const MAX_DT = 0.05;
const BASE = import.meta.env.BASE_URL;
/** A finger carries him this far above itself, CSS px, so it doesn't hide him (a mouse: 0). */
const FINGER_LIFT = 24;
/**
 * A finger carrying him near the top of the stage keeps the top of his head this far inside it,
 * CSS px: its lift gives way, then the finger's own spot (a mouse is never moved off its point).
 */
const HEAD_ROOM = 8;
/** The time constant his head's height over the point grabbed is followed at, seconds. */
const HEAD_FOLLOW = 0.1;
/** How far along a Foot bone his toes' underside is, model units (pointed down, they're his lowest). */
const TOE_REACH = 0.8;
/** His shoe under the Foot bone's line at the toe, model units. */
const TOE_DEPTH = 0.12;
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
 * The script the intro runs (from the envelope or Replay Intro): content.js introScript() (the admin's, mended where it's broken, or
 * the toy's own), through dialogue.js normalizeScript as the runner's own safety net.
 */
/** @type {ReturnType<typeof introScript>|null} Only set through the ?test hooks. */
let testIntro = null;
const playScript = () => normalizeScript(previewNow?.script ?? testIntro ?? introScript());
/** The space a shot frames him in keeps this far off the Auto row and the chat box (its name tab too), CSS px. */
const SHOT_MARGIN = { top: 10, bottom: 30 };
/**
 * The shadow camera reaches this high over the floor most of the time, world units (stage.js's,
 * what his shadow's texels were tuned for); higher only while he's carried up past it
 * (floor.js shadowTop).
 */
const SHADOW_TOP = LIFT + NEWT_HEIGHT;
/**
 * Where NEWT may go: the play area (area.js viewArea, a disc round the orbit's centre), one
 * object kept in place (the brain and his steps hold it) and filled in again on a resize, the
 * default view's disc until then; its `sight`, what's on screen, is filled in every frame.
 * @type {import('./types.js').Bounds}
 */
const area = playArea();

const stageEl = /** @type {HTMLElement} */ (document.querySelector('[data-stage]'));
stageEl.textContent = ''; // (the noscript fallback)
const options = parseQuery(location.search);
/**
 * The admin's intro preview (?preview in its frame, preview.js): the origin it listens to and
 * answers (null: it takes nothing), the box asked for till the loop takes it, the one playing.
 */
const previewFrom = options.preview
  ? previewOrigin({
      search: location.search,
      framed: window.parent !== window,
      ancestors: location.ancestorOrigins ?? null,
    })
  : null;
// (In the admin's frame the toy never pulls the focus out of the field being typed in.)
if (previewFrom) keepFocusOut(window);
/** @type {import('./preview.js').PreviewRequest|null} */
let previewWant = null;
/** @type {import('./preview.js').PreviewRequest|null} */
let previewNow = null;
if (previewFrom)
  window.addEventListener('message', (e) => {
    const p = readPreview(e, { parent: window.parent, origin: previewFrom });
    if (p) previewWant = p;
  });
/**
 * Tells the admin's preview how it's going (nothing outside it).
 * @param {'ready'|'playing'|'done'} state
 * @param {{box?: string, next?: string|null, choices?: boolean}} [o]
 */
function tellAdmin(state, o) {
  if (previewFrom) window.parent.postMessage(previewState(state, o), previewFrom);
}
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
/**
 * The envelope was opened: the intro starts by itself as soon as it can (the buttons on), and
 * this stays set until it has (beginIntro clears it), unlike the one-shot introPressed.
 */
let introWanted = false;
const ui = bindUi(stageEl, {
  look,
  wander: wanderWanted ?? !options.calm,
  // (The admin's link button, none in its intro preview; at the top left from the start under
  // the envelope.)
  link: options.preview ? null : linkSettings(),
  base: BASE,
  corner: options.envelope ? 'left' : 'right',
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
/** NEWT is being carried now (start() says, once he's in). */
let carrying = () => false;
/**
 * The page's rose petals (the cursor trail and a ring at every press), for good (its renderer
 * made only once petals may come): over the stage and under the HUD and the dialogue, over the
 * envelope while it's up; no trail while he's carried.
 */
const petalLayer = createPetalLayer(stageEl, {
  on: () => petalsOn(look) && !prefersReduced() && !options.preview,
  before: stageEl.querySelector('.inv-hud'),
  over: () => Boolean(envelope?.element.isConnected),
  carrying: () => carrying(),
});

/** Whether the visitor asked for less motion (false where it can't be read). */
function prefersReduced() {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/** The toy behind the envelope has drawn its first frame (then it waits, paused, behind it). */
let toyReady = false;
/** The envelope stopped covering the toy (start() sets it: the loop runs again). */
let envelopeGone = () => {};
const hudEl = /** @type {HTMLElement} */ (stageEl.querySelector('.inv-hud'));
/** @type {ReturnType<typeof createEnvelopeScene>} the envelope (at boot, or Replay Intro's), null once there's none */
let envelope = null;
/**
 * The envelope over the toy (at boot, and again on Replay Intro): the HUD inert under it; opened,
 * the intro starts by itself (introWanted); skipped, focus on the toolbar.
 */
function spawnEnvelope() {
  envelope?.dispose();
  envelope = createEnvelopeScene(stageEl, {
    reduced: prefersReduced(),
    petals: petalsOn(look),
    ready: () => toyReady,
    more: () => ui.linkStops(),
    onUncover: (how) => {
      hudEl.removeAttribute('inert');
      if (how === 'open') introWanted = true;
      // (Skipped: the toy is free, focus on the toolbar's first button, its ring only after a key.)
      else ui.focusToolbar();
      envelopeGone();
      syncLink();
    },
  });
  if (envelope) hudEl.setAttribute('inert', '');
  syncLink();
}
/** @type {Element|null} the modal layer that owns the link button for screen readers, if any */
let linkOwner = null;
/**
 * The link button's corner (link.js linkCorner): the top left while the envelope's up and while
 * the intro runs or is about to (opened, it hasn't started yet), so it stays put from the one
 * into the other; else the top right. And while it's in a modal layer's corner (the envelope's,
 * the intro's), that layer owns it (aria-owns), so a screen reader finds it in the dialog.
 */
function syncLink() {
  const covers = Boolean(envelope?.covers);
  ui.placeLink(linkCorner({ envelope: covers, intro: introWanted || ui.talking }), { reduced: prefersReduced() });
  const owner = !ui.linkStops().length
    ? null
    : covers
      ? (envelope?.element ?? null)
      : ui.talking
        ? stageEl.querySelector('.inv-talk')
        : null;
  if (owner === linkOwner) return;
  linkOwner?.removeAttribute('aria-owns');
  owner?.setAttribute('aria-owns', 'inv-link');
  linkOwner = owner;
}
if (options.envelope) spawnEnvelope();
/** The envelope's state for ?test (types.js EnvelopeState), null without one. */
const envelopeState = () => (envelope ? envelope.state : null);

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
if (webgl2()) {
  try {
    stage = createStage(stageEl, {
      preset: lookPreset(look),
      look,
      insets,
      focus: focusInsets,
      onResize: ({ view }) => {
        // (Pixel Size's steps are this screen's: two resolutions that draw alike here are one.)
        ui.setPixelSteps(screenSteps());
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
  envelope?.aside();
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
 * The play area: a disc round the default view's target holding all the floor the default view
 * shows across the stage, however it's turned (area.js viewArea); the default view's disc until
 * the stage has a view.
 * @param {NonNullable<typeof stage>} s
 */
function areaOf(s) {
  const { w, h } = stageSize();
  return s.view ? viewArea({ view: s.view, cssW: w, cssH: h, insets: insets() }) : playArea();
}

/**
 * The play area becomes `next`, in place (its old shape's keys gone with it; what's on screen
 * kept until the next frame's).
 * @param {import('./types.js').Bounds} next
 */
function setArea(next) {
  const sight = area.sight;
  for (const k of Object.keys(area)) delete area[/** @type {keyof typeof area} */ (k)];
  Object.assign(area, next);
  if (sight) area.sight = sight;
}

/** The play area for ?test: its shape (`area`) and what's on screen (`sight`, or null). */
function areaSnapshot() {
  const shape = { ...area };
  delete shape.sight;
  return { area: shape, sight: area.sight ? { ...area.sight } : null };
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
  const gesture = createGesture({ holdLift: () => Boolean(hold?.feel.secondFinger && hold.onSecondFinger) });
  // (Made again by Replay Intro's reset: replay.)
  let body = createBody();
  carrying = () => body.mode === 'held';
  let mix = createMix();
  let gaze = createLook();
  /** Held, his glance up at you (lookAt.js createGlance), and the look put on this frame. */
  let glance = createGlance();
  let headTurn = { yaw: 0, pitch: 0, weight: 1 };
  /** How much of a big look his chest takes (lookAt.js torsoStep). */
  let torso = 1;
  let faces = createFaceState();
  // (What he says and when, from the admin's lines and settings; the bubble goes in before the
  // HUD, so the toolbar and the Look sheet stay over it, and runs on the toy's clock, as talk
  // does: a slow frame's capped step or a hidden tab moves both alike, so they agree on when a
  // line is up.)
  const talk = createTalk({ lines: invitationLines(), speech: speechSettings(), rng: createRng(seed + 2) });
  const bubble = createBubble({
    root: stageEl,
    before: stageEl.querySelector('.inv-hud'),
    now: () => t,
    palette: textPalette(),
  });
  /** The camera at home (at boot, and cut there again by Replay Intro's reset). */
  const homeCamera = () => {
    const o = createOrbit({ distance: s.view?.distance ?? 20, centre: centreOf(area), span: stageSize() });
    orbitSpan(o, stageSpan(s));
    orbitArea(o, area);
    s.setCamera(orbitPose(o));
    orbit = o;
    return o;
  };
  let cam = homeCamera();
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
  /** The step his pose last moved by, seconds (0: it didn't this frame): the limp layer's and the earrings'. */
  let stepped = 0;
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
  /** @type {import('./hold.js').Hold|null} how he's held (the bead hold), while he is */
  let hold = null;
  /** @type {import('./hold.js').Hold|null} a hold not yet grabbed with, for ?test's controls */
  let spareHold = null;
  /** When he was last grabbed (the toy's clock). */
  let holdT0 = 0;
  /** @type {import('./hold.js').HoldStep|null} the hold's last frame */
  let holdNow = null;
  /** @type {import('./types.js').HandState|null} the user's own pointer while he's held: what the brain feels (carry.js handStep) */
  let hand = null;
  /** @type {{x: number, y: number}|null} where the hold aims his collar, client px (the pointer, lifted over a finger) */
  let aimPx = null;
  /** The last hold has the squash and stretch (it plays on through his landing). */
  let squashing = false;
  /** The hold's own random numbers (a stream of their own: the rest stay as seeded). */
  const holdRng = createRng(seed + 7);
  /** The dust he raises landing (dust.js), on random numbers of its own. */
  const dust = createDust();
  const dustRng = createRng(seed + 11);
  /**
   * The last landing seen (play.js BodyState.landing), and its screen shake (camera.js
   * shakeKick: null for none, or once it's over) and when it began.
   */
  const drop = {
    seen: /** @type {import('./play.js').Landing|null} */ (null),
    kick: /** @type {import('./camera.js').ShakeKick|null} */ (null),
    at: 0,
  };
  /**
   * The ground cues (cues.js): the blob's held look eased in, the ring's and the drop line's
   * strengths, when the ring last pulsed, whether he was pushed at the edge last frame, where the
   * hold said he'd land as he was let go (the ring waits there till he does: hold.js
   * Hold.landing), and, for ?test, Ground Cues as it plays, where the ring is while it shows and
   * the floor point the cues share (cues.js cueSpot: null while he's on his feet).
   */
  const cue = {
    flight: /** @type {import('./types.js').XZ|null} */ (null),
    blob: 0,
    ring: 0,
    line: 0,
    pulse: /** @type {number|null} */ (null),
    pushed: false,
    mode: /** @type {import('./hold.js').CueMode} */ ('off'),
    ringAt: /** @type {import('./types.js').XZ|null} */ (null),
    spot: /** @type {import('./types.js').XZ|null} */ (null),
  };
  /** How far the top of his head shows above the point grabbed, CSS px (followed while held). */
  let headAbove = 0;
  /** @type {import('./types.js').XYZ} where his collar was carried last */
  let target = { x: 0, y: hangY, z: 0 };
  /** The retro pass's other path is compiled (stage.js warm), for ?test. */
  let warmed = false;
  /** The hover dither, 0..1 (eased: retro.js hoverEase). */
  let hoverK = 0;
  /** @type {{t0: number, x: number, y: number}|null} the grab ring under way: when, and where (client px) */
  let burst = null;
  /** The toolbar as last set, so the DOM is only touched on a change. */
  const shown = {
    sit: 'Sit',
    device: /** @type {string} */ ('Screen Time'),
    wander: /** @type {boolean|null} */ (null),
    enabled: true,
    cursor: 'arrow',
  };
  /** @type {ReturnType<typeof createDialogue>|null} the intro under way (the envelope or Replay Intro) */
  let intro = null;
  /** The box whose shot the camera last went to (dialogue.js DialogueView seq). */
  let shotSeq = -1;
  /** @type {import('./types.js').DialogueShot|null} the shot showing, for ?test */
  let shot = null;
  /** @type {{top: number, bottom: number}|null} the clear space the shot was framed in, client px, for ?test */
  let framed = null;
  /** The intro just ended and the camera is still easing back. */
  let backFromIntro = false;
  /** The admin's intro preview: its box waits to start (takePreview), and the box it last heard of (seq). */
  let previewBegin = false;
  let toldSeq = -1;
  /**
   * The intro's line waits, its clock held, until he's in place (brain.js BrainOut.talkReady: up,
   * walked in, turned to the camera), so its line, face and gesture begin together.
   */
  let introHeld = false;
  /**
   * The envelope still hides him (envelope.veils: covering the toy, or fading with the letter
   * still over his head or chest), as of this frame's step: the intro's first line waits on it.
   * (With an envelope it starts out over him.)
   */
  let envelopeVeils = Boolean(envelope);
  const veiled = () => Boolean(envelope && character && envelope.veils(newtSpots()));
  /** His head, collar and middle on screen, client px, each with its radius (for envelope.veils). */
  function newtSpots() {
    const { head, body } = shape();
    return [
      head,
      { x: body.b.x, y: body.b.y, r: body.r },
      { x: (body.a.x + body.b.x) / 2, y: (body.a.y + body.b.y) / 2, r: body.r },
    ];
  }
  /**
   * The clips he's played since the intro's box came up, in order ('gait': Idle, Walk or Run by
   * speed), for ?test.
   */
  const acted = { seq: -1, clips: /** @type {string[]} */ ([]) };
  const talkUi = createDialogueUi(stageEl, {
    onAction: onTalk,
    log: () => intro?.log ?? [],
    replySettle: options.settle ?? REPLY_SETTLE,
    palette: textPalette(),
    more: () => ui.linkStops(),
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
      envelope?.aside();
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
  /** His lowest point, world units: a sole, or a toe pointed down (Held's dangle). */
  function lowestY() {
    const c = /** @type {NonNullable<typeof character>} */ (character);
    const toe = (name) => c.pointOn(name, TOE_REACH, { x: 0, y: 0, z: 0 }).y - TOE_DEPTH * SCALE;
    return Math.min(soleY(), toe(BONES.footL), toe(BONES.footR));
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
  /**
   * Where a tap on the floor at `p` walks him: the play area stops short of the top of the screen
   * by his height there at the default zoom (area.js tapReach, with the camera turned as it is).
   * @param {import('./types.js').XZ} p
   */
  function tapGoal(p) {
    if (!s.view) return p;
    const { w, h } = stageSize();
    return tapReach({ view: s.view, cssW: w, cssH: h, insets: insets() }, cam.yaw, p);
  }
  /** NEWT's pick shapes on screen. */
  function shape() {
    return /** @type {NonNullable<typeof character>} */ (character).screenShape(
      s.camera,
      canvas.getBoundingClientRect(),
    );
  }
  /**
   * Where the point he's held by shows, client px: his collar as posed less the grab offset as
   * it is now (eased out: his collar, once the grab is in), as the hold has it.
   * @param {import('./hold.js').Hold} h
   */
  function grabbedAt(h) {
    const p = /** @type {NonNullable<typeof character>} */ (character).bonePos(COLLAR, { x: 0, y: 0, z: 0 });
    return h.grabbedAt(t, p, onScreen);
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
      // (A second finger lifting him: the hold's height, not the brain's.)
      if (e.type === 'holdLift') {
        hold?.onSecondFinger?.(e.dy ?? 0);
        continue;
      }
      if (e.type === 'tap' || e.type === 'release' || e.type === 'grab' || e.type === 'cancel')
        e.floor = floorAt(e.x, e.y);
      // (A tap on the floor near the top of the screen walks him only as far as keeps his head on it.)
      if (e.type === 'tap' && e.on === 'floor' && e.floor) e.floor = tapGoal(e.floor);
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
      // (Held, the hold takes the wheel for his height; a trackpad's pinch still zooms.)
      if (gesture.current()?.grabbed && !e.ctrlKey && hold?.onWheel?.(e.deltaY * unit)) return;
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
    introNow();
    envelopeVeils = veiled();
    const box = introStep();
    const pose = moveCamera(evs, dt);
    const ptr = pointerNow();
    effects(ptr, dt);
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
    // (The admin's intro preview: no bubble lines at all.)
    if (!intro && !backFromIntro && !options.preview) speak(o, evs, button, dt);
    // 3. His root: steer, carry or the fall.
    moveRoot(c, o, ptr, dt);
    // 4. The mix and the step phase.
    if (o.restart && c.restart(o.clip)) {
      mix.weights = twinWeights(mix.weights, o.clip);
      mix.fade = fadeFor(o.clip, o.clip);
    }
    mixStep(mix, { clip: o.clip, speed: body.body.speed, dt });
    // (A box's Walk or Run steps in place at its own pace: he has no speed to step it on.)
    if (o.state === 'talk' && DIALOGUE_WAYS[o.clip] === 'inPlace')
      mix.phase = talkPhase(mix.phase, dt, c.clipLength(o.clip));
    c.setWeights(mix.weights, mix.phase);
    // 5. The animation; 6. held, his collar hung from the anchor (a box's dangle: lifted clear).
    const moved = animate(c, dt);
    // (His limbs limp while he's carried and falling, eased out once he's down: character.js.)
    c.limp(stepped, body.mode !== 'ground');
    hang(c);
    if (o.state === 'talk') dangle(c);
    // 7–8. The look and the face; the toolbar.
    const want = {
      mode: o.look.mode,
      weight: o.look.weight * lookShare(mix.weights),
      ease: o.look.ease,
      at: o.look.at ?? null,
      pitch: o.look.pitch,
      up: o.look.up,
      lift: o.look.lift,
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

  /**
   * The retro pass's pointer effects: the hover dither eases toward 1 while the pointer is on
   * him, he's on the ground and no intro runs (a finger pressing on him too, before it grabs),
   * else toward 0; the grab ring grows out and thins away from where he was grabbed, following
   * that point, and nothing more shows for the rest of the drag.
   * @param {ReturnType<typeof pointerNow>} ptr
   * @param {number} dt
   */
  function effects(ptr, dt) {
    const on = Boolean(ptr?.onNewt) && body.mode === 'ground' && !intro && !hold;
    hoverK = hoverEase(hoverK, on, dt);
    s.setHover(hoverK);
    if (!burst) return;
    const b = character ? burstAt(t - burst.t0) : null;
    if (!b) {
      burst = null;
      s.setBurst(0, 0, 0, 0);
      return;
    }
    const at = hold ? grabbedAt(hold) : burst;
    s.setBurst(at.x, at.y, b.radius, b.strength);
  }

  /** Whether the visitor asked for less motion (false where it can't be read). */
  function reducedMotion() {
    return prefersReduced();
  }

  /**
   * Replay Intro, or the envelope opened: the dialogue starts from its first box (when the
   * buttons are on: never while he's held or falling); the toolbar rests, the bubble goes, the
   * camera turns to the front (from the envelope it cuts there: the envelope fades onto the shot).
   */
  function beginIntro() {
    if (intro || !out?.buttonsEnabled || ui.sheetOpen) return;
    const fromEnvelope = introWanted;
    introWanted = false;
    // (A line a press brings on types once the old one has dithered out and it has dithered in.)
    intro = createDialogue(playScript(), { reduced: reducedMotion(), lead: TALK_LEAD });
    intro.start(t);
    intro.pause(true, t);
    introHeld = true;
    shotSeq = -1;
    toldSeq = -1;
    shot = null;
    framed = null;
    acted.seq = -1;
    acted.clips = [];
    hover = null;
    bubble.hide();
    ui.setTalking(true);
    orbitTalk(cam, true, { cut: fromEnvelope || reducedMotion() });
    talkUi.open();
  }

  /**
   * Replay Intro pressed, or the envelope opened: with an envelope, Replay Intro resets the scene
   * and spawns it again (replay); else, and once it's opened, the dialogue starts (beginIntro).
   */
  function introNow() {
    if (previewWant) takePreview();
    if (previewBegin) {
      beginIntro();
      if (intro) previewBegin = false;
    }
    if (introPressed && options.envelope && !envelope?.covers) replay();
    else if (introPressed || introWanted) beginIntro();
    introPressed = false;
  }

  /**
   * The admin's intro preview asked for a box (preview.js PreviewRequest): its colours from the
   * next box on, any intro under way dropped where it is (the camera stays on him), or with
   * restart the scene as it began (replay, no envelope: he walks in again); then the intro from
   * that box, as soon as it can start (beginIntro: never while he's held or falling).
   */
  function takePreview() {
    const p = /** @type {import('./preview.js').PreviewRequest} */ (previewWant);
    previewWant = null;
    previewNow = p;
    talkUi.setPalette(p.palette);
    if (p.restart) replay({ again: false });
    else if (intro) {
      intro = null;
      introHeld = false;
      shot = null;
      framed = null;
      talkUi.close({ cut: true });
    }
    previewBegin = true;
  }

  /**
   * Replay Intro with an envelope: the scene as it started and the envelope over it again. Any
   * intro ends (no easing back: the camera cuts home), a hold is dropped, NEWT's body, brain, mix,
   * gaze and faces start again where they began, the talk's idle clock restarts, the bubble, the
   * grab ring and the hover go; then the envelope comes (the HUD inert under it) and the toy
   * pauses behind it once this frame is drawn. Opened, the intro starts as at boot (introWanted);
   * if no envelope can be made (its renderer refused), the intro starts by itself all the same.
   * `again` false (the admin's intro preview, restarting): the scene alone, no envelope.
   */
  function replay({ again = true } = {}) {
    if (intro) {
      intro = null;
      introHeld = false;
      shot = null;
      framed = null;
      talkUi.close({ cut: true });
      ui.setTalking(false);
    }
    backFromIntro = false;
    lastButton = null;
    introWanted = false;
    hold = null;
    holdNow = null;
    hand = null;
    aimPx = null;
    squashing = false;
    body = createBody();
    brain.reset();
    mix = createMix();
    gaze = createLook();
    glance = createGlance();
    headTurn = { yaw: 0, pitch: 0, weight: 1 };
    torso = 1;
    faces = createFaceState();
    out = null;
    heard = null;
    target = { x: 0, y: hangY, z: 0 };
    Object.assign(cue, {
      flight: null,
      blob: 0,
      ring: 0,
      line: 0,
      pulse: null,
      pushed: false,
      ringAt: null,
      spot: null,
    });
    talk.rest(t);
    cam = homeCamera();
    bubble.hide();
    hover = null;
    hoverK = 0;
    s.setHover(0);
    burst = null;
    s.setBurst(0, 0, 0, 0);
    if (!again) return;
    spawnEnvelope();
    envelopeVeils = Boolean(envelope);
    // (No envelope could be made, its renderer refused: the intro alone, as without one, once the
    // buttons are on again.)
    if (!envelope) introWanted = true;
    // (Paused behind it once this frame is drawn, as at boot.)
    sync();
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
   * The intro's over: the layer fades out (out of reach at once), the camera eases back (cuts,
   * with reduced motion), the toolbar and free play return.
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
    if (previewNow) tellAdmin('done');
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
    // (From the envelope, the line waits on the letter too: until it no longer hides him.)
    if (introHeld && out?.talkReady && !envelopeVeils) {
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
    // (The admin's intro preview hears of each box as it comes up, and where Next goes from it.)
    if (previewNow && v.seq !== toldSeq) {
      toldSeq = v.seq;
      const choices = Boolean(v.box.choices?.length);
      tellAdmin('playing', { box: v.box.id, next: nextBox(previewNow.script, v.box.id), choices });
    }
    // (Held back, the brain sees no box yet: he waits idle with his own face, and the box's
    // gesture and face start with its line.)
    if (introHeld) return { seq: -1, animation: 'none', face: v.box.face, typing: false };
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
    // (What's on screen now: the brain's wander goals and a flee keep to it, the play area being
    // bigger than the screen.)
    const sight = orbitSight(cam);
    if (sight) area.sight = sight;
    else delete area.sight;
    const pose = orbitPose(cam);
    s.setCamera(pose);
    // (The zoom, NEWT's size on screen over the default view's: at a resolution the stage sizes
    // the texel to it, so he keeps the chosen sprite resolution at any zoom; cheap every frame.)
    s.setZoomScale(cam.home.distance / cam.distance);
    return pose;
  }

  /**
   * One of the Camera pad's presses: Turn Left or Right a 45° turn (Left turns the scene
   * counter-clockwise, the way its arrow shows: the camera's yaw goes down, as a drag to the right
   * turns it), Tilt Up or Down 12°, Zoom In or Out about where it looks, Follow NEWT onto him.
   * @param {import('./ui.js').CameraKey} key
   */
  function padPress(key) {
    const TURN = Math.PI / 4;
    const TILT = (12 * Math.PI) / 180;
    if (key === 'left' || key === 'right') orbitNudge(cam, { yaw: key === 'left' ? -TURN : TURN });
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
      carry: body.carry && hand ? handFeel(hand) : null,
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
   * CSS px a world unit across the screen at `p` (along the camera's level right), so the hand's
   * shake in px reads in the world units the brain's TUNE.shakeSoft and shakeHard are in.
   * @param {import('./types.js').XYZ} p
   */
  function pxPerUnit(p) {
    const { right } = levelAxes(cam.yaw);
    const a = onScreen(p);
    const b = onScreen({ x: p.x + right.x * 0.1, y: p.y, z: p.z + right.z * 0.1 });
    return Math.hypot(b.x - a.x, b.y - a.y) / 0.1;
  }

  /** The camera as the hold reads it (hold.js HoldCamera). */
  function holdCamera() {
    const p = s.camera.position;
    return {
      position: { x: p.x, y: p.y, z: p.z },
      yaw: cam.yaw,
      elevation: cam.elevation,
      distance: cam.distance,
      target: { x: cam.target.x, z: cam.target.z },
    };
  }

  /**
   * The press holding him, this frame: on the grab, a bead hold (holds/bead.js createBeadHold)
   * started where the press began; then its step, his collar's target (aimed at the pointer, or a
   * finger's lift over it); let go, the velocity the hold lets him go with (null: carry.js toss).
   * @param {NonNullable<typeof character>} c
   * @param {number} dt
   * @param {string} clip  the clip he's showing (the brain's)
   * @returns {import('./types.js').XYZ|null}
   */
  function carryStep(c, dt, clip) {
    const press = gesture.current();
    if (press?.grabbed) {
      const view = holdCamera();
      /** @param {number} x @param {number} y */
      const rayAt = (x, y) => s.ray(x, y);
      if (!hold) {
        // (The point pressed, where the press began: a grab comes only once the press has strayed
        // moveTol or more, and nothing moved him before it, so the point under the cursor now is
        // not the one grabbed. From the press, the first frame carries him the whole way.)
        const collar = c.bonePos(COLLAR, { x: 0, y: 0, z: 0 });
        hold = createBeadHold({ rng: holdRng });
        holdT0 = t;
        squashing = hold.feel.squash;
        hold.start({
          t,
          collar,
          press: { x: press.x0, y: press.y0 },
          collarPx: onScreen(collar),
          rayAt,
          camera: view,
          low: hangY,
          bounds: area,
          touch: pressKind === 'touch',
        });
        const head = shape().head;
        headAbove = press.y0 - (head.y - head.r);
        // (The grab ring, where the grip is made; it follows the point grabbed: effects.)
        burst = { t0: t, x: press.x, y: press.y };
        // (What he feels: the pointer itself, from where it is as he's grabbed.)
        hand = createHand({ x: press.x, y: press.y }, t);
      }
      // (A finger's lift over itself, coming in as he's picked up. Near the top of the stage it
      // gives way, then the finger's own spot, so the top of his head stays on the screen: lifted,
      // he hangs nearer the camera and his head shows further over the point grabbed, so that's
      // followed from the last frame's pose. A mouse's cursor has his collar under it, once the
      // grab offset has eased out.)
      let y = press.y;
      const box = stageEl.getBoundingClientRect();
      if (pressKind === 'touch') {
        y -= (hold.feel.fingerLift ?? FINGER_LIFT) * Math.min(1, (t - holdT0) / CARRY.liftIn);
        const head = shape().head;
        headAbove += (grabbedAt(hold).y - (head.y - head.r) - headAbove) * Math.min(1, dt / HEAD_FOLLOW);
        y = Math.max(y, box.top + HEAD_ROOM + headAbove);
      }
      aimPx = { x: press.x, y };
      holdNow = hold.step({
        t,
        dt,
        px: aimPx,
        rayAt,
        camera: view,
        low: hangY,
        bounds: area,
        carry: body.mode === 'held' ? body.carry : null,
        clip,
        project: onScreen,
        stage: { top: box.top, height: box.height },
      });
      target = holdNow.anchor;
      // (Shaken and dragged only by the user's own pointer, never by the hold easing him onto it.)
      if (hand) handStep(hand, { x: press.x, y: press.y }, dt, t, pxPerUnit(target));
      // (The plane he's dragged on: at the play area's edge he stops along it, carry.js holdStep.)
      if (body.carry) body.carry.plane = holdNow.plane;
      return null;
    }
    if (!hold) return null;
    // (Let go: the hold's release velocity, or carry.js toss with none.)
    const released = body.mode === 'held' && body.carry ? hold.release(body.carry, t) : null;
    cue.flight = released ? (hold.landing ?? null) : null;
    hold = null;
    holdNow = null;
    hand = null;
    aimPx = null;
    return released;
  }

  /**
   * His root: steered, carried (where the bead hold puts his collar: the point grabbed under the
   * cursor, or above a finger) or falling (play.js bodyStep, let go with the hold's release
   * velocity or carry.js toss), the hold's squash and stretch on his root.
   * @param {NonNullable<typeof character>} c
   * @param {import('./types.js').BrainOut} o
   * @param {ReturnType<typeof pointerNow>} ptr
   * @param {number} dt
   */
  function moveRoot(c, o, ptr, dt) {
    const root = c.root;
    root.updateMatrixWorld(true);
    const released = carryStep(c, dt, o.clip);
    bodyStep(body, {
      state: o.state,
      move: o.move,
      pointer: ptr?.floor ?? null,
      bounds: area,
      dt,
      t,
      collar: c.bonePos(COLLAR, { x: 0, y: 0, z: 0 }),
      target,
      // A dangling toe can touch before the ankle-based sole. Use the same
      // lowest point as the visible floor clearance, so contact is not delayed.
      footOffset: lowestY() - root.position.y,
      released,
    });
    // (Just landed: the dust, and a big drop's shake.)
    if (body.landing && body.landing !== drop.seen) landed(body.landing);
    // (The hold's side clamp: its push, kept for the toss.)
    if (holdNow && holdNow.push !== undefined && body.carry) body.carry.push = holdNow.push;
    // (The hold's own body: its tilt in place of the swing. Never his heading: held, falling and
    // landing he keeps the one he had as he was grabbed, the user's rule, so the hold never turns him.)
    if (holdNow?.tilt && body.mode === 'held') body.tilt = { x: holdNow.tilt.x, z: holdNow.tilt.z };
    if (body.mode !== 'held') root.position.set(body.root.x, body.root.y, body.root.z);
    root.rotation.set(body.tilt.x, body.body.yaw, body.tilt.z);
    const sq = squashing
      ? squash(body.mode === 'held' ? t - holdT0 : null, body.landedAt !== null ? t - body.landedAt : null)
      : null;
    // (On his model's own scale, clips.js SCALE.)
    root.scale.set(SCALE * (sq?.xz ?? 1), SCALE * (sq?.y ?? 1), SCALE * (sq?.xz ?? 1));
  }

  /**
   * A landing (play.js BodyState.landing): the dust round his feet (dust.js dustLand, sized by
   * how fast he came down) and, from high enough, the screen shake (camera.js shakeKick: none
   * with Screen Shake off or reduced motion).
   * @param {import('./play.js').Landing} at
   */
  function landed(at) {
    drop.seen = at;
    dustLand(dust, at, at.speed, t, dustRng);
    drop.kick = shakeKick(at.speed, { on: shakeOn(look), reduced: reducedMotion() });
    drop.at = t;
  }

  /**
   * The dust and the shake this frame: the puffs to the stage (dust.js dustPuffs), and the
   * shake's offset on its picture (camera.js shakeOffset), cut short by a grab, Screen Shake
   * switched off or reduced motion (the orbit never moves).
   */
  function dropFx() {
    s.setDust(dustPuffs(dust, t));
    const k = drop.kick;
    if (k && (t - drop.at >= k.time || body.mode === 'held' || !shakeOn(look) || reducedMotion())) drop.kick = null;
    const o = shakeOffset(drop.kick, t - drop.at);
    s.setShake(o.x, o.y);
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
   * A box dangling him from an unseen hand (Held, Thrash, Fall: clips.js DIALOGUE_WAYS): his root
   * lifted by their share till his lowest point clears the floor, Fall a hop (brain.js dangleLift).
   * @param {NonNullable<typeof character>} c
   */
  function dangle(c) {
    const share = DANGLE.clips.reduce((sum, k) => sum + c.weightOf(k), 0);
    if (!(share > 0)) return;
    const len = c.clipLength('Fall');
    const fallU = len > 0 ? c.timeOf('Fall') / len : 0;
    c.root.position.y += dangleLift({ hang: share, sole: lowestY(), fall: c.weightOf('Fall'), fallU });
    c.root.updateMatrixWorld(true);
  }

  /**
   * The toolbar, only on a change: the Sit/Stand label, Screen Time's (what its next press does:
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
    stepped = 0;
    if (fps > 0 && !(m.step > 0)) return false;
    c.update(m.step);
    stepped = m.step;
    return true;
  }

  /**
   * The look, the face, the blob shadow and the marker.
   * @param {NonNullable<typeof character>} c
   * @param {ReturnType<typeof pointerNow>} ptr
   * @param {{position: import('./types.js').XYZ}} pose
   * @param {number} dt
   * @param {{mode: 'pointer'|'camera'|'forward'|'back', weight: number, ease?: number, at?: import('./types.js').XZ|null, pitch?: number, up?: number, lift?: number, upWeight?: number}} want
   *   at: who he runs from ('back'); pitch: 'ahead' at this pitch (held: his head hangs); up:
   *   held, his glance up toward the viewer at upWeight (play.js glanceFront, lookAt.js
   *   glanceLook)
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
    const front = lookFront(ahead, want);
    lookStep(gaze, want.mode, at, dt, t, rng, want.weight, front, want.ease);
    // (Held, his glance up: its own look on the viewer, the hung one turned into it.)
    glanceStep(glance, want.up, glanceFront(ahead, want), dt, t, rng);
    headTurn = glanceLook(gaze, glance, want.upWeight);
    // (His chest joins in on his feet only: held, his collar hangs from the cursor.)
    torso = torsoStep(torso, body.mode === 'ground', dt);
    if (moved) c.applyLook(headTurn.yaw, headTurn.pitch, headTurn.weight, torso);
    // (Any of the eight: character.js shows a dialogue face's stand-in until its sheet is in.)
    c.setFace(forcedFace ?? faceStep(faces, face, blink, t, rng));
    // (Off the floor, the blob is sized and faded by his lowest foot's height: cues.js blobLook,
    // eased in and out. Held, or flying from a let-go, it sits on the floor point the ring and the
    // drop line share, so it's always in the ring's middle (cues.js cueSpot: under his collar,
    // not his swinging hips, or where he'll land); otherwise off the floor, under his hips. Lying
    // on the floor, under his body, not his feet: ring.js blobCentre, by the lying clips' weight.)
    const off = body.mode !== 'ground';
    const footH = Math.max(0, lowestY() - CARRY.floorY);
    const hips = c.bonePos(BONES.hips, { x: 0, y: 0, z: 0 });
    const spot = cueSpotNow(hips);
    const under = spot ?? (off ? hips : blobCentre(root.position, hips, head, lieWeight(c.weightOf)));
    cue.blob = blobWeight(cue.blob, off, dt);
    s.setBlob(under.x, under.z, off ? Math.min(1, root.position.y / 0.5) : 0, {
      ...blobLook(footH, s.blobLifted),
      w: cue.blob,
    });
    if (sun)
      fitShadow(sun, s.bounds, shadowTop(root.position.y, SHADOW_TOP), { x: root.position.x, z: root.position.z });
    const mark = ptr && !ptr.pinch && !ptr.onNewt && body.mode === 'ground' ? ptr.floor : null;
    groundCues(c, footH, spot ?? hips, mark, dt);
    // (His earrings swing on his head as the look left it; the tablet goes to his palms.)
    c.accessories(moved ? stepped : 0, t);
  }

  /**
   * The floor point the ground cues share while he's held, or flying from a let-go (cues.js
   * cueSpot: the hold's ring spot, else where it said he'd land); null otherwise.
   * @param {import('./types.js').XZ} hips
   */
  function cueSpotNow(hips) {
    // (Let go where the hold said he'd land: the ring waits there till he does, then fades.)
    if (body.mode !== 'fall') cue.flight = null;
    const isHeld = body.mode === 'held' && Boolean(body.carry && hold);
    cue.spot = isHeld || cue.flight !== null ? cueSpot(isHeld ? holdNow?.cues.ring : null, cue.flight, hips) : null;
    return cue.spot;
  }

  /**
   * The ring under him and the dashed drop line from his collar to it while he's held (Ground
   * Cues: the look's, or In the Mix with none picked; In the Mix as cues.js mixWants says),
   * the ring pulsing on a wall clamp; otherwise the marker where the pointer meets the floor.
   * @param {NonNullable<typeof character>} c
   * @param {number} footH  his lowest foot's height
   * @param {import('./types.js').XZ} at  the floor point the cues share (cueSpotNow), or his hips'
   * @param {import('./types.js').XZ|null} mark  the pointer's spot on the floor, when it shows
   * @param {number} dt
   */
  function groundCues(c, footH, at, mark, dt) {
    const carry = body.mode === 'held' ? body.carry : null;
    const isHeld = Boolean(carry && hold);
    const flying = cue.flight !== null;
    const cues = holdNow?.cues ?? (flying ? { ring: cue.flight, line: false } : {});
    const mode = groundCueMode(look.groundCues);
    const want = mixWants(footH, carry ? Math.hypot(carry.vel.x, carry.vel.z) : 0);
    cue.ring = cueStep(cue.ring, { mode, want: want || flying, held: isHeld || flying, dt });
    cue.line = cueStep(cue.line, { mode: lineMode(mode, cues.line), want, held: isHeld, dt });
    // (A wall clamp: the hold says, or the edge starts pushing him.)
    const pushed = Boolean(carry?.push);
    if (isHeld && (cues.pulse || (pushed && !cue.pushed))) cue.pulse = t;
    cue.pushed = pushed;
    const pulsed = ringStrength(cue.ring, cue.pulse === null ? null : t - cue.pulse, mode);
    const ring = isHeld ? ringFloor(pulsed, mode, cues.floor, t - holdT0) : flying ? pulsed : 0;
    cue.mode = mode;
    cue.ringAt = ring > 0 ? at : null;
    if (ring > 0) s.setMarker(at, 2 * CUES.ring * NEWT_HEIGHT, ring);
    else s.setPointerMarker(mark);
    s.setLine(
      c.bonePos(COLLAR, { x: 0, y: 0, z: 0 }),
      { x: at.x, y: CARRY.floorY, z: at.z },
      cue.line * lineShare(footH),
    );
  }

  /** @param {number} ms */
  function frame(ms) {
    const dt = last < 0 ? 0 : Math.min((ms - last) / 1000, MAX_DT);
    last = ms;
    try {
      step(dt, ms / 1000);
      dropFx();
      s.render();
      // (The link button: its corner, and out of reach while the intro's Log or question is up.)
      ui.setLinkBlocked(talkUi.logOpen || talkUi.asking);
      syncLink();
    } catch {
      lost = true;
      sync();
      ui.setStatus('Something went wrong drawing NEWT. Reload to try again.', { reload: true });
      envelope?.aside();
      return;
    }
    if (!drawn) {
      drawn = true;
      stageEl.classList.add('is-ready');
      ui.setStatus(null);
      // (Under the envelope: drawn once, then it waits there until it's uncovered.)
      toyReady = true;
      sync();
      tellAdmin('ready');
    }
  }

  function sync() {
    const should = Boolean(character) && !lost && !document.hidden && !(drawn && envelope?.covers);
    if (should === running) return;
    running = should;
    last = -1; // (the time it was hidden doesn't count)
    s.renderer.setAnimationLoop(running ? frame : null);
  }
  document.addEventListener('visibilitychange', sync);
  envelopeGone = sync;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    sync();
    envelope?.aside();
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

  /**
   * A world point on the screen, client px.
   * @param {import('./types.js').XYZ} p
   */
  function onScreen(p) {
    const at = new Vector3(p.x, p.y, p.z).project(s.camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((at.x + 1) / 2) * r.width, y: r.top + ((1 - at.y) / 2) * r.height };
  }

  /** The carry, the limp layer and Screen Time, for ?test (snapshot().motion). */
  function motionSnapshot() {
    const c = character;
    const carry = body.mode === 'held' ? body.carry : null;
    const eye = s.camera.position;
    const r = c?.root.position ?? { x: 0, z: 0 };
    const off = body.body.yaw - Math.atan2(eye.x - r.x, eye.z - r.z);
    const tabletShown = Boolean(c?.tablet.visible);
    return {
      collar: c && carry ? onScreen(c.bonePos(COLLAR, { x: 0, y: 0, z: 0 })) : null,
      heldFor: carry && hold ? t - holdT0 : null,
      anchor: carry ? { ...carry.anchor } : null,
      plane: hold?.plane ? { x: hold.plane.normal.x, z: hold.plane.normal.z } : null,
      pushed: Boolean(carry?.push),
      limp: { weight: c?.limpWeight ?? 0, most: c ? Math.max(0, ...Object.values(c.limpAngles())) : 0 },
      device: {
        state: out?.device ?? null,
        label: out?.deviceLabel ?? 'Screen Time',
        shown: tabletShown,
        turn: Math.abs(Math.atan2(Math.sin(off), Math.cos(off))),
        screen: c && tabletShown ? onScreen(c.tablet.getWorldPosition(new Vector3())) : null,
      },
    };
  }

  /**
   * The hold for ?test (snapshot().drag): its own height controls, where its collar is aimed and how far the collar is from it
   * (CSS px), the hold height, the anchor and its depth along the camera's level axis (away
   * positive), the blob, his hips' floor point and lowest foot, the ring and the drop line, Ground
   * Cues as it plays, whether he's pushed at the edge, and the way his root faces as drawn (radians).
   */
  function dragSnapshot() {
    const c = character;
    const carry = body.mode === 'held' ? body.carry : null;
    const collar = c && carry ? onScreen(c.bonePos(COLLAR, { x: 0, y: 0, z: 0 })) : null;
    const hips = c ? c.bonePos(BONES.hips, { x: 0, y: 0, z: 0 }) : null;
    const press = gesture.current();
    const h = hold ?? (spareHold ??= createBeadHold());
    return {
      // (The hold's own height controls, for the tools: the wheel, a second finger.)
      controls: { wheel: typeof h.onWheel === 'function', secondFinger: h.feel.secondFinger },
      aim: aimPx && carry ? { ...aimPx } : null,
      pointer: press?.grabbed ? { x: press.x, y: press.y } : null,
      gap: collar && aimPx ? Math.hypot(collar.x - aimPx.x, collar.y - aimPx.y) : null,
      holdY: carry ? (holdNow?.holdY ?? carry.anchor.y) : null,
      anchor: carry ? { ...carry.anchor } : null,
      depth: carry ? depthAlong(carry.anchor, cam.yaw) : null,
      blob: s.blobState,
      hips: hips ? { x: hips.x, z: hips.z } : null,
      lowestFoot: c ? lowestY() : null,
      ring: cue.ringAt ? { x: cue.ringAt.x, z: cue.ringAt.z, alpha: s.marker.material.opacity / 0.85 } : null,
      spot: cue.spot ? { ...cue.spot } : null,
      // (The floor ring as drawn: the cursor marker or the ring under him, ring.js.)
      marker: s.markerState,
      // (The blob's and the ring's centres as drawn, client px; the ring's null while it's hidden.)
      floorPx: { blob: onScreen(s.blob.position), ring: s.marker.visible ? onScreen(s.marker.position) : null },
      line: s.lineState,
      groundCues: cue.mode,
      pushed: Boolean(carry?.push),
      facing: c ? c.root.rotation.y : null,
    };
  }

  /** The last landing, the dust as drawn and the screen shake (its offset, CSS px, and its kick), for ?test (snapshot().drop). */
  const dropSnapshot = () => ({
    landing: body.landing ? { ...body.landing } : null,
    dust: s.dustState,
    shake: s.shakeState,
    kick: drop.kick ? { ...drop.kick } : null,
  });

  /** The admin's intro preview for ?test: the origin it listens to, the box asked for, its viewport, and whether it waits to start. */
  const previewSnapshot = () => ({
    origin: previewFrom,
    box: previewNow?.box ?? null,
    viewport: previewNow?.viewport ?? null,
    waiting: Boolean(previewWant || previewBegin),
  });

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
        pos: { x: character?.root.position.x ?? 0, z: character?.root.position.z ?? 0 },
        lift: character?.root.position.y ?? 0,
        heading: body.body.yaw,
        headYaw: headTurn.yaw * headTurn.weight,
        headPitch: headTurn.pitch * headTurn.weight,
        // (Held: how far up his glance at you is, 0 hung to 1 up: brain.js BrainOut.look.up.)
        lookUp: out?.look.up ?? 0,
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
        // (The camera's yaw, elevation and distance, the point it looks at on the floor, whether
        // a pan holds it, and whether the play area fits the screen at this zoom: no following.)
        camera: {
          yaw: cam.yaw,
          elevation: cam.elevation,
          distance: cam.distance,
          target: { x: cam.target.x, z: cam.target.z },
          panned: cam.panned,
          fits: areaFits(cam),
          turning: orbitTurning(cam),
        },
        // (Whether he wanders by himself, as the brain has it; the stage's cursor.)
        ...controlsSnapshot(),
        // (Where he may go: the play area, area.js viewArea, a disc; and what's on screen, its
        // sight, camera.js orbitSight: a trapezoid turned with the camera, or null.)
        ...areaSnapshot(),
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
        // (The retro pass's pointer effects: the hover dither 0..1, and whether the grab ring's up.)
        hover: hoverK,
        burst: Boolean(burst),
        // (The envelope's state, null without one: types.js EnvelopeState.)
        envelope: envelopeState(),
        // (The link button: shown, its href and label, its corner and where it's drawn, its
        // fade's phase and its opacity as it last changed corners, inert.)
        link: ui.linkState(),
        // (It still hides him, as of the last step: the intro's first line waits on it.)
        envelopeVeils,
        // (The admin's intro preview: the origin it listens to, and the box it was asked for.)
        preview: previewSnapshot(),
        options,
        motion: motionSnapshot(),
        drag: dragSnapshot(),
        drop: dropSnapshot(),
      }),
      /**
       * Ease the camera to `yaw` and `elevation` (radians, as snapshot().camera has them) and a
       * zoom (the home distance over the distance: 2 is twice as near), each left as it is when
       * left out, as the Camera pad would.
       * @param {{yaw?: number, elevation?: number, zoom?: number}} v
       */
      view({ yaw, elevation, zoom } = {}) {
        orbitNudge(cam, {
          yaw: yaw === undefined ? 0 : yaw - cam.goal.yaw,
          elevation: elevation === undefined ? 0 : elevation - cam.goal.elevation,
        });
        if (zoom) orbitZoom(cam, (cam.goal.distance * zoom) / cam.home.distance);
      },
      /** The toy's clock, seconds (it stands still while the envelope covers him). */
      clock: () => t,
      /** The envelope's state, reduced motion, pose and frames drawn; null without one. */
      envelope: () => envelope?.snapshot() ?? null,
      /** The page's petal layer (petalLayer.js snapshot): its renderer, drawing, on, up, launched. */
      petals: () => petalLayer.snapshot(),
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
       * posed less the grab offset as it eases out); null otherwise.
       */
      grabbed() {
        if (!hold || !character || body.mode !== 'held') return null;
        return grabbedAt(hold);
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
      /** The intro's script as the envelope and Replay Intro run it (playScript). */
      intro: () => playScript(),
      /**
       * The link button's link, the spec's own (link.js linkFrom: anything; an empty or unsafe
       * href hides it); none under ?preview, as the page has none there.
       * @param {unknown} value
       */
      setLink(value) {
        ui.setLink(options.preview ? null : linkFrom(value));
        syncLink();
      },
      /** Use a controlled script for UI behavior tests; null restores the admin’s content.
       * @param {unknown} value
       */
      setIntro(value) {
        testIntro = value == null ? null : introFrom(value);
      },
      /**
       * A toolbar button's press, as the brain gets it (Screen Time's before the toolbar has one).
       * @param {import('./types.js').ButtonName} name
       */
      press(name) {
        pressed = name;
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
