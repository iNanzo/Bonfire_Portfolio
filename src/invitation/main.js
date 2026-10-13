// The invitation toy (/invitation/): NEWT on a plain white floor, to play with. This page boots
// it: the controls (ui.js), the stage (stage.js: renderer, camera, floor, lights, retro pass),
// NEWT (character.js, from models/newt.glb), the Look menu wired to all three (switched live,
// kept in localStorage: look.js), the render loop (stopped while the page is hidden, steps of at
// most 0.05 s, a lost WebGL context told), and the pointer on the canvas (the first one only,
// captured; a marker on the floor where it points).
//
// Behaviour comes in at the integration step: the brain, steering, carrying, the blend, the
// look-at and the faces (types.js has the frame order) plug in where `INTEGRATION:` says.
// Without WebGL the stage gets data-webgl="off" and a plain message. `?test` exposes
// window.__invitation for the specs and tools/capture-invitation.mjs: snapshot(), screen(part)
// (a point on NEWT in client px) and play(clip) (forces a clip); `?seed=N` and `?calm` are read
// here and handed to the brain.
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './invitation.css';
import { loadCharacter } from './character.js';
import { DEFAULT_LOOK, LOOKS, loadLook, presetOf, saveLook } from './look.js';
import { DEFAULT_PIXEL } from './pixels.js';
import { createStage } from './stage.js';
import { bindUi, parseQuery } from './ui.js';

/** The longest step a frame takes, seconds (a slow frame or a tab coming back never jumps). */
const MAX_DT = 0.05;
const BASE = import.meta.env.BASE_URL;

const stageEl = /** @type {HTMLElement} */ (document.querySelector('[data-stage]'));
stageEl.textContent = ''; // (the noscript fallback)
const options = parseQuery(location.search);
let look = loadLook();
/** @type {import('./types.js').ButtonName|null} pressed since the last frame */
let pressed = null;
const ui = bindUi(stageEl, { look, onButton, onLook });

/** @param {import('./types.js').ButtonName} name */
function onButton(name) {
  // INTEGRATION: brain.step takes it as BrainIn.button on the next frame; its BrainOut sets the
  // Sit/Stand label (ui.setSitLabel), Wander's state (ui.setWander) and the buttons (ui.setEnabled).
  pressed = name;
}

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
if (webgl2()) {
  try {
    stage = createStage(stageEl, {
      preset: presetOf(look),
      look,
      insets,
      framingTexels: LOOKS[DEFAULT_LOOK.style].texels[DEFAULT_PIXEL],
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

/** Where the floor keeps clear of: a top margin, the toolbar, the side edges (and the safe areas). */
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
  let running = false;
  let lost = false;
  let drawn = false;
  let last = -1;
  /** A clip forced by ?test's play(), else null: Idle (or the T-pose placeholder). */
  let forced = null;
  let choppy = 0;
  /** @type {import('./types.js').ButtonName|null} the last button the loop took (for ?test) */
  let lastButton = null;
  const head = { yaw: 0, pitch: 0, weight: 0 };

  new ResizeObserver(() => s.refit()).observe(ui.toolbar);

  loadCharacter(`${BASE}models/newt.glb`, {
    preset: presetOf(look),
    pixel: look.pixelSize !== 'off',
    pixelFaceUrl: `${BASE}models/newt-face.png`,
  })
    .then((c) => {
      character = c;
      s.scene.add(c.root);
      // INTEGRATION: createBrain({ seed: options.seed, calm: options.calm }) and the rest here.
      sync();
    })
    .catch(() => {
      ui.setStatus('NEWT couldn’t load. Check the connection, then reload.', { reload: true });
    });

  /** The clip weights this frame: until the brain is wired in, the forced clip or Idle. */
  function weights() {
    const clip = forced ?? (character.has('Idle') ? 'Idle' : null);
    return clip ? { [clip]: 1 } : {};
  }

  /** @param {number} dt */
  function step(dt) {
    // INTEGRATION (types.js's frame order, 1–4): gesture events, brain.step({..., button:
    // pressed}), steer or carry the root, blendStep and gaitPhase give the weights and phase.
    if (pressed) lastButton = pressed;
    pressed = null;
    character.setWeights(weights(), 0);
    // 5. The animation (choppy motion: stepped at the preset's animFps when it's set).
    const fps = presetOf(look).animFps;
    if (fps > 0) {
      choppy += dt;
      if (choppy >= 1 / fps) {
        character.update(choppy);
        choppy = 0;
      }
    } else character.update(dt);
    // INTEGRATION (6): while held, carry's collar anchoring after root.updateMatrixWorld.
    // INTEGRATION (7–8): lookStep → head; faceStep → the face.
    character.applyLook(head.yaw, head.pitch, head.weight);
    s.blob.position.x = character.root.position.x;
    s.blob.position.z = character.root.position.z;
  }

  /** @param {number} now */
  function frame(now) {
    const dt = last < 0 ? 0 : Math.min((now - last) / 1000, MAX_DT);
    last = now;
    try {
      step(dt);
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

  // --- The pointer: the first one only, captured; the marker where it meets the floor.
  /** @type {number|null} */
  let pointer = null;
  const mark = (e) => {
    const at = s.floorPoint(e.clientX, e.clientY);
    s.marker.visible = Boolean(at);
    if (at) s.marker.position.set(at.x, s.marker.position.y, at.z);
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (pointer !== null) return;
    pointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    mark(e);
    // INTEGRATION: gesture.down(sample, on NEWT? (pickScreen over character.screenShape)).
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointer === null ? e.pointerType !== 'mouse' : e.pointerId !== pointer) return;
    mark(e);
    // INTEGRATION: gesture.move(sample); a hover (no press) aims his look.
  });
  const end = (e) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (e.pointerType !== 'mouse') s.marker.visible = false;
    // INTEGRATION: gesture.up (pointerup) or gesture.cancel (pointercancel, lostpointercapture: a drop, never a tap).
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('pointerleave', (e) => {
    if (pointer === null) s.marker.visible = false;
  });

  if (options.test) {
    /** @type {any} */ (window).__invitation = {
      snapshot: () => ({
        ready: drawn,
        state: 'idle',
        clip: character ? (forced ?? (character.has('Idle') ? 'Idle' : null)) : null,
        face: character?.face ?? 'neutral',
        pos: { x: character?.root.position.x ?? 0, z: character?.root.position.z ?? 0 },
        heading: character?.root.rotation.y ?? 0,
        headYaw: head.yaw,
        headPitch: head.pitch,
        held: false,
        pixelScale: s.grid.pd,
        button: lastButton,
        texels: { w: s.grid.w, h: s.grid.h },
        options,
      }),
      /** @param {'head'|'body'} part */
      screen(part) {
        const shape = character.screenShape(s.camera, canvas.getBoundingClientRect());
        if (part === 'head') return { x: shape.head.x, y: shape.head.y };
        return { x: (shape.body.a.x + shape.body.b.x) / 2, y: (shape.body.a.y + shape.body.b.y) / 2 };
      },
      /** @param {string} clip */
      play(clip) {
        forced = clip;
        character?.restart(clip);
        return Boolean(character?.has(clip));
      },
    };
  }
}
