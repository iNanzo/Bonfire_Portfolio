// The envelope that opens /invitation/, drawn and played (envelope.js has its states, gestures,
// timeline and dissolve; petals.js its rose petals): its own small three.js canvas in a fixed
// overlay over the toy (envelope.css, z-index 3) on a plain white page, made as the page
// boots, so it's also the loading screen. Low-poly and flat, in the reference's palette in three
// toon bands: a thin gold envelope seen from the back (its flap hinged on its top edge over its
// pocket), a red wax seal on the flap's tip (envelopeSeal.js), and rose petals in
// three shapes and three reds, instanced (one mesh a shape), each tumbling, fluttering and
// drifting its own way. It's drawn at low resolution, twice (its colours, then which part each
// texel is), and put together with a one-texel line in the toy's ink round its silhouette, round
// every petal and along the flap's V (and the pocket's mouth, open), then scaled up pixelated, like
// the toy. It settles in under a soft flurry of petals as it appears, and bobs and sways until
// it's opened, a slow helix of petals swirling round it (its back half behind the letter) and a
// few shed off its trailing edge as it moves (the cursor's petals are the page's: petalLayer.js).
// Opened, the swirl is flung outward and the seal blooms first: it swells, then shrinks away as a
// ring of petals unfurls out of it and lifts off; only then the flap lifts, petals pouring up out
// of the letter's inside, and the letter
// alone dissolves like a weapon on the Bonfire site (a noisy, dithered edge with a burning rim
// sweeping up across it, shedding specks of paper, embers and wax that drift up and fade) while
// the white page behind clears to the toy; skipped, it drops away with a spill of petals as the
// page clears. Reduced motion: still, no petals, the flap open at once, and a short plain fade
// (the seal fades with the letter).
//
// Input is all its own while it's up: a tap or click, Enter, Space or ArrowUp opens it; Escape or
// ArrowDown skips; a drag follows the finger with some give (the seal starting to open as it goes
// up) and opens or skips on release (releaseGesture), else springs back; the wheel opens or skips
// once it adds up; Skip Intro skips. While it floats it leans clearly toward the pointer (a finger
// while it's down), and a sideways drag or a held ArrowLeft or ArrowRight turns it further, springing
// back (turnGoal; a sideways drag never opens or skips it); hovered, a glow pulses slowly round
// it (hoverPulse: a wide dithered gold glow, a warm rim, the letter lifting a little toward the
// camera and its paper a step brighter at the peak, all gone between pulses: hoverLook), shown
// strongly at once while a finger (or the mouse) is down on the letter (pressStep), and on a touch
// screen while it's left alone; a white glint sweeps across the seal as each pulse rises, and once,
// quick and bright, as it's opened (sealGloss). It takes focus at boot with no ring: the ring shows once a key
// is pressed. veils(spots) says whether it still hides NEWT (his head, collar and middle: the
// intro's first line waits for it; envelope.js letterCovers at points of each on the letter).
// The hint ("Click or swipe up to open", "Tap ..." on a touch screen, / "Swipe down to skip")
// shows on hover, keyboard focus, or after a while with no input on a touch screen, and reads
// "Open ↑" / "Skip ↓" while dragging. Once it's done (and its last petals have fallen) it
// disposes its renderer, loses its context and leaves the page. Rose Petals off (Settings): none.
import * as THREE from 'three';
import {
  DISSOLVE,
  ENVELOPE_TEXT,
  FLAP_OPEN,
  GLOSS,
  TIMES,
  createEnvelope,
  dragHint,
  dragPose,
  envelopeKey,
  hintFor,
  hoverLook,
  hoverPulse,
  hoverStep,
  letterCovers,
  pressStep,
  shownPulse,
  turnGoal,
  turnRoll,
  turnStep,
  particleAt,
  releaseGesture,
  sealBloom,
  sealGloss,
  shedParticles,
} from './envelope.js';
import { buildSeal, sealOnScreen } from './envelopeSeal.js';
import { createPetalScene } from './petalScene.js';
import {
  BAYER,
  DEPTH,
  GLOW,
  HOVER,
  IDS,
  INK,
  LEAN,
  PAPER,
  PAPER_LIT,
  PITCH,
  SHINE,
  TILT,
  WAX,
  envelopeLayout,
  rgb,
  shared,
  toon,
} from './envelopeLook.js';

/** Where veils looks on each of NEWT's spots: its middle and four points its radius round it. */
const SPOT_POINTS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** Texels along the screen's shorter side (it's scaled up pixelated). */
const TEXELS = 300;
/** The camera's field of view (degrees) and distance. */
const FOV = 30;
const DIST = 6;
/** The wheel opens or skips once this much (CSS px) adds up one way. */
const WHEEL_STEP = 80;
/** Its last petals may hold it up this long (seconds) once it's done. */
const PETAL_GRACE = 1.2;
/** Specks the letter sheds as it dissolves. */
const SPECKS = 220;
/** The specks' colours: paper (gold and charred), embers (hot and glowing), wax. */
const SPECK_TONES = {
  paper: [0xe4b85d, 0xd3983d, 0x7a4a24, 0x5a3418],
  ember: [0xffe7a0, 0xf59a32, 0xe8662a],
  wax: [WAX[1], WAX[2]],
};

/**
 * A flat polygon as a mesh (a fan from its first point; its points counter-clockwise), at depth
 * `z`.
 * @param {number[][]} pts  [x, y]
 * @param {THREE.Material} mat
 * @param {number} z
 */
function piece(pts, mat, z) {
  const v = pts.map(([x, y]) => new THREE.Vector3(x, y, z));
  const tris = [];
  for (let i = 1; i < v.length - 1; i++) tris.push(v[0], v[i], v[i + 1]);
  return new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(tris), mat);
}

/**
 * The envelope's parts (envelopeLook.js envelopeLayout), built to a width of 2 (the group scales
 * it to the screen), each a flat piece a little in front of the last: the body, the inside of the
 * pocket where the flap opens, the pocket in one piece (a little way in front of the inside, so
 * petals pouring from inside it hide behind it until they rise out of its mouth), and the flap
 * hinged on the top edge. Each is one flat tone of the paper's three (LEAN).
 * @param {ReturnType<typeof shared>} u
 */
function buildEnvelope(u) {
  const L = envelopeLayout();
  const { W, H, T } = L;
  const h = H / 2;
  const group = new THREE.Group();
  const paper = (/** @type {keyof typeof LEAN} */ part) =>
    toon(PAPER, u, IDS[part], { lean: LEAN[part], lit: PAPER_LIT });
  group.add(piece(L.parts.body, paper('body'), T / 2));
  group.add(piece(L.parts.inside, paper('inside'), T / 2 + DEPTH.inside));
  group.add(piece(L.parts.pocket, paper('pocket'), T / 2 + DEPTH.pocket));
  // The flap, hinged on the top edge (its points from the hinge).
  const hinge = new THREE.Group();
  hinge.position.set(0, h, T / 2 + 0.1);
  hinge.add(
    piece(
      L.parts.flap.map(([x, y]) => [x, y - h]),
      paper('flap'),
      0,
    ),
  );
  group.add(hinge);
  return { group, hinge, W, H, T, tipY: L.tip[1], seal: L.seal };
}

/**
 * The specks as square points `size` texels across, each shown through a dither as it fades.
 * They're on layer 1, drawn after the letter is put together, with no line round them.
 */
function buildSpecks() {
  const specks = shedParticles(SPECKS);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SPECKS * 3);
  const col = new Float32Array(SPECKS * 3);
  const size = new Float32Array(SPECKS);
  const alpha = new Float32Array(SPECKS);
  specks.forEach((s, i) => {
    const tones = SPECK_TONES[s.kind];
    const c = rgb(tones[(i * 7) % tones.length]);
    col.set([c.x, c.y, c.z], i * 3);
    size[i] = s.size;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAlpha > 0.0 ? aSize : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      ${BAYER}
      void main() {
        if (bayer(gl_FragCoord.xy) >= vAlpha) discard;
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.layers.set(1);
  return { points, specks, pos, alpha, geo };
}

/**
 * The pass that puts it together: the colours, and a line in the ink on each texel that borders
 * a part in front of it (by the parts' order, IDS): round the silhouette, on the paper just
 * outside it, and along the flap's V. Hovered (uPulse, 0..1: envelope.js hoverPulse, or a finger
 * down on it), a Bayer-dithered warm rim on the letter's outermost uRim texels (a warm shine: gold
 * barely shows on the gold paper) and a glow past its line out to uReach texels (envelope.js
 * hoverLook), bright gold next to it and NEWT's hover gold (retro.js) further out, thinning with
 * distance: the letter's parts only, seal and all, never the petals.
 */
function buildCompose() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: null },
      uId: { value: null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uInk: { value: rgb(INK) },
      uPulse: { value: 0 },
      uReach: { value: 0 },
      uRim: { value: 0 },
      uGold: { value: rgb(HOVER) },
      uGlow: { value: rgb(GLOW) },
      uShine: { value: rgb(SHINE) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uColor;
      uniform sampler2D uId;
      uniform vec2 uTexel;
      uniform vec3 uInk;
      uniform float uPulse;
      uniform float uReach;
      uniform float uRim;
      uniform vec3 uGold;
      uniform vec3 uGlow;
      uniform vec3 uShine;
      varying vec2 vUv;
      ${BAYER}
      const vec2 STEPS[4] = vec2[4](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0));
      // (Sixteen ways round, for the glow's distance to the letter: a ring of them each texel out.)
      const vec2 ROUND[16] = vec2[16](
        vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0),
        vec2(0.7071, 0.7071), vec2(-0.7071, 0.7071), vec2(0.7071, -0.7071), vec2(-0.7071, -0.7071),
        vec2(0.9239, 0.3827), vec2(-0.9239, 0.3827), vec2(0.9239, -0.3827), vec2(-0.9239, -0.3827),
        vec2(0.3827, 0.9239), vec2(-0.3827, 0.9239), vec2(0.3827, -0.9239), vec2(-0.3827, -0.9239)
      );
      // (A neighbour's part; one on the dissolving rim counts as nothing, so no line goes round it.)
      float idAt(vec2 o) {
        // (Its own level, no gradients: the glow reads these in a loop that stops early.)
        vec4 t = textureLod(uId, vUv + o * uTexel, 0.0);
        return t.g > 0.5 ? 0.0 : floor(t.r * 255.0 + 0.5);
      }
      // (The letter's parts, the seal too; not the petals, nor nothing.)
      bool letterAt(vec2 o) {
        float i = idAt(o);
        return i > 0.5 && i < ${IDS.petal.toFixed(1)} - 0.5;
      }
      void main() {
        float me = floor(texture2D(uId, vUv).r * 255.0 + 0.5);
        float near = max(max(idAt(vec2(1.0, 0.0)), idAt(vec2(-1.0, 0.0))), max(idAt(vec2(0.0, 1.0)), idAt(vec2(0.0, -1.0))));
        // (Round the silhouette the corners count too, so the line closes up on the paper.)
        if (me < 0.5) near = max(near, max(max(idAt(vec2(1.0, 1.0)), idAt(vec2(-1.0, 1.0))), max(idAt(vec2(1.0, -1.0)), idAt(vec2(-1.0, -1.0)))));
        if (near > me + 0.5) { gl_FragColor = vec4(uInk, 1.0); return; }
        float dither = bayer(gl_FragCoord.xy);
        if (me < 0.5) {
          gl_FragColor = vec4(0.0);
          if (uPulse > 0.0 && uReach > 0.0)
            // (The nearest of the letter, texels out (the line is the first), as far as it reaches.)
            for (int r = 2; r <= 8; r++) {
              float fr = float(r);
              if (fr > uReach + 0.5) break;
              bool near = false;
              for (int k = 0; k < 16; k++) near = near || letterAt(floor(ROUND[k] * fr + 0.5));
              if (!near) continue;
              float fall = 1.0 - (fr - 2.0) / (uReach + 0.5);
              if (dither < uPulse * fall) gl_FragColor = vec4(fr < 3.5 ? uGlow : uGold, 1.0);
              break;
            }
          return;
        }
        vec3 c = texture2D(uColor, vUv).rgb;
        // (The rim: a letter's texel within uRim of nothing; a petal over it isn't its edge.)
        if (uPulse > 0.0 && me < ${IDS.petal.toFixed(1)} - 0.5) {
          bool rim = false;
          for (int k = 0; k < 4; k++)
            for (int r = 1; r <= 3; r++)
              rim = rim || (float(r) <= uRim + 0.01 && idAt(float(r) * STEPS[k]) < 0.5);
          if (rim && dither < uPulse) c = mix(c, uShine, 0.8);
        }
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, mat, mesh };
}

/**
 * @typedef {object} EnvelopeSceneOpts
 * @property {boolean} reduced  reduced motion
 * @property {() => boolean} ready  NEWT is in (the toy's first frame is drawn)
 * @property {() => void} [onOpen]  it was opened (it's opening)
 * @property {(how: 'open'|'skip') => void} [onUncover]  it stops covering the toy: fading
 *   into the intro, or skipped
 * @property {() => void} [onDone]  it's gone and disposed
 * @property {boolean} [petals]  Rose Petals (Settings, on by default): off, none at all
 */

/**
 * The envelope over `root` (it goes in first, under nothing), or null where it can't draw.
 * @param {HTMLElement} root
 * @param {EnvelopeSceneOpts} opts
 */
export function createEnvelopeScene(root, { reduced, ready, onOpen, onUncover, onDone, petals: petalsOn = true }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const touchScreen = () => win.matchMedia?.('(hover: none)').matches ?? false;
  const layer = doc.createElement('div');
  layer.className = 'inv-envelope';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', ENVELOPE_TEXT.layer);
  const t = ENVELOPE_TEXT;
  layer.innerHTML = `<div class="inv-envelope-paper" aria-hidden="true"></div>
  <canvas class="inv-envelope-canvas" aria-hidden="true"></canvas>
  <div class="inv-envelope-hit" data-envelope role="button" tabindex="0" aria-label="${t.open}" aria-describedby="inv-envelope-hint"></div>
  <p class="inv-envelope-hint" id="inv-envelope-hint"><span class="inv-envelope-hint-open">${hintFor(touchScreen())}</span> <span class="inv-envelope-hint-skip">${t.hintSkip}</span></p>
  <p class="inv-envelope-live" aria-hidden="true"></p>
  <button type="button" class="inv-btn inv-envelope-skip" data-intro-skip>${t.skip}</button>`;
  const paper = /** @type {HTMLElement} */ (layer.querySelector('.inv-envelope-paper'));
  const canvas = /** @type {HTMLCanvasElement} */ (layer.querySelector('canvas'));
  const hit = /** @type {HTMLElement} */ (layer.querySelector('[data-envelope]'));
  const hintOpen = /** @type {HTMLElement} */ (layer.querySelector('.inv-envelope-hint-open'));
  const live = /** @type {HTMLElement} */ (layer.querySelector('.inv-envelope-live'));
  const skipBtn = /** @type {HTMLButtonElement} */ (layer.querySelector('[data-intro-skip]'));

  /** @type {any} */
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  root.append(layer);

  const clock = () => win.performance.now() / 1000;
  const env = createEnvelope({ reduced, born: clock() });
  const u = shared();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  camera.position.set(0, 0, DIST);
  // (Its matrices as it stands, before anything is drawn: the seal's placement reads them.)
  camera.updateMatrixWorld();
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.z = TILT;
  inner.rotation.x = PITCH;
  outer.add(inner);
  scene.add(outer);
  const envl = buildEnvelope(u);
  inner.add(envl.group);
  const sealR = envl.seal.r;
  const seal = buildSeal(u, sealR);
  // (On the flap's tip.)
  // (On the flap's tip, a hair over it, so it moves with the flap as one: no parallax, and its
  // middle rounds to the screen's texels with the tip.)
  seal.group.position.set(envl.seal.x, envl.seal.y - envl.H / 2, 0.01);
  envl.hinge.add(seal.group);
  // (The petals: in with the letter, so it hides the swirl's back half and its ink runs round them.)
  const petals = createPetalScene({ scene, seed: 16, reduced: reduced || !petalsOn, uniforms: u, id: IDS.petal });
  const specks = buildSpecks();
  outer.add(specks.points);
  const compose = buildCompose();
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rtOpts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true };
  const colorRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  const idRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  compose.mat.uniforms.uColor.value = colorRT.texture;
  compose.mat.uniforms.uId.value = idRT.texture;
  // (Every shader compiled now, so the first frame isn't held up making them; then the seal hides
  // until it's been placed: the red box on reload was a seal drawn where it had never been put.)
  renderer.compile(scene, camera);
  renderer.compile(compose.scene, flat);
  /** The seal has been placed on the screen once (for ?test: it's hidden till then). */
  let sealPlaced = false;
  seal.group.visible = false;
  const v = new THREE.Vector3();
  /** Where the petals start from, world (kept up to date each frame): the letter's middle, its seal. */
  const spots = { letter: new THREE.Vector3(), seal: new THREE.Vector3() };
  /** A letter's width, world units (petals.js's unit). */
  const letterW = () => envl.W * view.scale;
  /** The letter's own units (−1…1 across and up its body), from the world. */
  const toLetter = new THREE.Matrix4();
  const letterScale = new THREE.Matrix4().makeScale(2 / envl.W, 2 / envl.H, 1);

  /** The view's height at the envelope, world units, and the screen's CSS size. */
  const view = { h: 1, w: 1, cssW: 1, cssH: 1, scale: 1, tw: 1, th: 1 };
  function resize() {
    const cssW = Math.max(1, layer.clientWidth || win.innerWidth);
    const cssH = Math.max(1, layer.clientHeight || win.innerHeight);
    const px = Math.max(1.25, Math.min(cssW, cssH) / TEXELS);
    const tw = Math.max(1, Math.round(cssW / px));
    const th = Math.max(1, Math.round(cssH / px));
    renderer.setSize(tw, th, false);
    colorRT.setSize(tw, th);
    idRT.setSize(tw, th);
    compose.mat.uniforms.uTexel.value.set(1 / tw, 1 / th);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    view.h = 2 * DIST * Math.tan(((FOV / 2) * Math.PI) / 180);
    view.w = view.h * camera.aspect;
    view.cssW = cssW;
    view.cssH = cssH;
    view.tw = tw;
    view.th = th;
    const c = Math.cos(-TILT);
    const s = Math.sin(-TILT);
    const aspect = envl.W / envl.H;
    const w = Math.min((0.82 * view.w) / (c + s / aspect), (0.52 * view.h) / (s + c / aspect));
    view.scale = w / envl.W;
  }
  resize();
  const onResize = () => resize();
  win.addEventListener('resize', onResize);

  // --- Input.
  /** @type {{id: number, x: number, y: number, t: number, dx: number, dy: number, far: number, on: boolean}|null} the press: where and when it went down, its last offset and the farthest it got (CSS px), and whether it went down on the letter */
  let drag = null;
  /** The drag's follow as shown (eased toward its target: the give), CSS px; and the flap's lift. */
  const follow = { y: 0, lift: 0 };
  let wheel = 0;
  let wheelAt = 0;
  let hovered = false;
  /** The mouse is over the letter itself (not just the layer). */
  let overLetter = false;
  /**
   * The hover pulse: eased in (k), seconds into it (t: from its start), a press down on the letter
   * (press: envelope.js pressStep), as shown (pulse: the stronger of the two) and how (look).
   */
  const hover = { k: 0, t: 0, press: 0, pulse: 0, look: hoverLook(0) };
  /**
   * The letter's turn as shown (radians), the pointer's x it leans toward (−1 left edge to 1
   * right: the mouse anywhere over it, a finger while it's down; null without one) and the arrow
   * key held (−1 ArrowLeft, 1 ArrowRight, 0 none).
   */
  let turn = 0;
  /** @type {number|null} */
  let pointerX = null;
  let keyTurn = 0;
  /** @param {PointerEvent} e */
  const leanTo = (e) => {
    pointerX = (e.clientX / view.cssW) * 2 - 1;
  };
  let keyboard = false;
  let lastInput = clock();
  let frames = 0;
  let uncovered = false;
  /** When it was pressed on or opened (the seal's one quick glint: envelope.js sealGloss), or never. */
  let clickedAt = -Infinity;
  /** The seal's glint as shown (for ?test). */
  let gloss = sealGloss(0, 0);
  /** When it was done (its last petals may hold it up a moment). */
  let doneAt = 0;
  /**
   * For ?test: the seal's first placement on the screen (the frame, its middle and axes in
   * texels: envelopeSeal.js sealOnScreen), and its latest.
   * @type {{frame: number, x: number, y: number, axes: number[]}|null}
   */
  let firstSeal = null;
  /** @type {{x: number, y: number, axes: number[]}|null} */
  let lastSeal = null;

  function open() {
    const now = clock();
    if (!env.open(now)) return;
    // (Opened by a key, or after a long press: its glint now.)
    if (now - clickedAt > GLOSS.click) clickedAt = now;
    layer.classList.add('is-open');
    // The seal blooms into roses (before the flap: envelope.js's timeline).
    petals.emit('bloom', spots.seal, { radius: sealR * view.scale });
    onOpen?.();
  }
  function skip() {
    const now = clock();
    if (!env.skip(now)) return;
    layer.classList.add('is-leaving');
    // (The petals up shrink out of the toy's way; a spill goes down with the letter.)
    petals.cut();
    petals.emit('spill', spots.letter);
    uncover('skip');
  }
  /** @param {'open'|'skip'} how */
  function uncover(how) {
    if (uncovered) return;
    uncovered = true;
    layer.classList.add('is-leaving');
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('keyup', onKeyUp, true);
    keyTurn = 0;
    onUncover?.(how);
  }
  /** A key was pressed: from now on keyboard focus shows its ring. */
  function byKeyboard() {
    keyboard = true;
    layer.classList.add('is-keyboard');
  }

  hit.addEventListener('pointerdown', (e) => {
    lastInput = clock();
    if (drag || (e.pointerType === 'mouse' && e.button !== 0) || !env.covers) return;
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      dx: 0,
      dy: 0,
      far: 0,
      on: onLetterAt(e.clientX, e.clientY),
    };
    // (Pressed on the letter: the seal's quick glint starts now, before the click opens it.)
    if (drag.on && env.state === 'floating') clickedAt = clock();
    leanTo(e);
    try {
      hit.setPointerCapture(e.pointerId);
    } catch {
      // (a pointer that's already gone)
    }
  });
  hit.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      hovered = true;
      overLetter = onLetterAt(e.clientX, e.clientY);
      leanTo(e);
    }
    if (!drag || e.pointerId !== drag.id) return;
    lastInput = clock();
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    // (The farthest it got: a drag out and back to its start is no tap.)
    drag.far = Math.max(drag.far, Math.abs(drag.dx), Math.abs(drag.dy));
    leanTo(e);
  });
  const release = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    lastInput = clock();
    // (A finger lifted: nothing to lean toward.)
    if (e.pointerType !== 'mouse') pointerX = null;
    if (cancelled) return;
    const g = releaseGesture({ dx: d.dx, dy: d.dy, far: d.far, ms: performance.now() - d.t }, view.cssH);
    if (g === 'open') open();
    else if (g === 'skip') skip();
  };
  hit.addEventListener('pointerup', (e) => release(e, false));
  hit.addEventListener('pointercancel', (e) => release(e, true));
  hit.addEventListener('lostpointercapture', (e) => release(e, true));
  hit.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovered = true;
  });
  hit.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovered = false;
    overLetter = false;
    pointerX = null;
  });
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  layer.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      lastInput = clock();
      const now = clock();
      if (now - wheelAt > 0.4) wheel = 0;
      wheelAt = now;
      wheel += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.cssH : 1);
      if (wheel <= -WHEEL_STEP) open();
      else if (wheel >= WHEEL_STEP) skip();
    },
    { passive: false },
  );
  skipBtn.addEventListener('click', () => skip());
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    lastInput = clock();
    if (e.key === 'Tab') {
      // (Round the two: the envelope and Skip Intro.)
      byKeyboard();
      e.preventDefault();
      (doc.activeElement === hit ? skipBtn : hit).focus();
      return;
    }
    // (The arrows across turn it further while they're held.)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      byKeyboard();
      keyTurn = e.key === 'ArrowLeft' ? -1 : 1;
      return;
    }
    const what = envelopeKey(e.key);
    if (!what) return;
    // (Skip Intro presses itself with Enter or Space.)
    if (doc.activeElement === skipBtn && (e.key === 'Enter' || e.key === ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    byKeyboard();
    if (what === 'open') open();
    else skip();
  }
  /** @param {KeyboardEvent} e */
  function onKeyUp(e) {
    if ((e.key === 'ArrowLeft' && keyTurn < 0) || (e.key === 'ArrowRight' && keyTurn > 0)) keyTurn = 0;
  }
  const onBlur = () => {
    keyTurn = 0;
  };
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('keyup', onKeyUp, true);
  win.addEventListener('blur', onBlur);
  // (Focus at boot isn't the visitor's: no ring until a key is pressed. focusVisible is newer
  // than the DOM's types.)
  hit.focus(/** @type {FocusOptions} */ ({ preventScroll: true, focusVisible: false }));

  // --- Where it hides NEWT.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const face = new THREE.Plane();
  const normal = new THREE.Vector3();
  const hitAt = new THREE.Vector3();
  /**
   * A point on the screen (client px) on the letter, in its own units (−1…1 across and up its
   * body; envelope.js letterCovers), as it was last drawn; null where its plane isn't.
   * @param {number} x
   * @param {number} y
   */
  function onLetter(x, y) {
    ndc.set((x / view.cssW) * 2 - 1, 1 - (y / view.cssH) * 2);
    ray.setFromCamera(ndc, camera);
    normal.set(0, 0, 1).transformDirection(inner.matrixWorld);
    face.setFromNormalAndCoplanarPoint(normal, hitAt.set(0, 0, envl.T / 2).applyMatrix4(inner.matrixWorld));
    if (!ray.ray.intersectPlane(face, hitAt)) return null;
    hitAt.applyMatrix4(toLetter);
    return { x: hitAt.x, y: hitAt.y };
  }
  /**
   * Whether a point on the screen (client px) is on the letter, as it was last drawn.
   * @param {number} x
   * @param {number} y
   */
  function onLetterAt(x, y) {
    const q = onLetter(x, y);
    return Boolean(q && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1);
  }
  /**
   * Whether it still hides NEWT (`spots`: his head, collar and middle on screen, client px, each
   * with its radius): while it covers the toy; fading, while the page behind is half up or the
   * letter hides the middle of any of them or a point its radius round it (envelope.js
   * letterCovers); skipped or gone, never.
   * @param {{x: number, y: number, r: number}[]} spots
   */
  function veils(spots) {
    if (env.covers) return true;
    if (env.state !== 'fading') return false;
    const p = env.pose(clock());
    if (p.backdrop > 0.5) return true;
    for (const at of spots)
      for (const [dx, dy] of SPOT_POINTS) {
        const q = onLetter(at.x + dx * at.r, at.y + dy * at.r);
        if (q && letterCovers(p, q.x, q.y)) return true;
      }
    return false;
  }

  // --- Each frame.
  let raf = 0;
  let last = clock();
  let gone = false;
  function frame() {
    raf = win.requestAnimationFrame(frame);
    const now = clock();
    const dt = Math.min(0.05, now - last);
    last = now;
    frames++;
    camera.updateMatrixWorld();
    const state = env.step(now, ready());
    if (state === 'fading' || state === 'gone') uncover('open');
    const p = env.pose(now);
    // The drag: the follow and the flap's lift, eased (the give); back to rest when let go.
    // (Opened, it stays where the finger left it: its seal blooms there.)
    const rest = env.opened ? { follow: follow.y, lift: 0 } : { follow: 0, lift: 0 };
    const target = drag && env.covers ? dragPose(drag.dy, view.cssH) : rest;
    const k = reduced ? 1 : 1 - Math.exp(-dt / 0.07);
    follow.y += (target.follow - follow.y) * k;
    follow.lift += (target.lift - follow.lift) * k;
    cues(now, dt);
    // The envelope.
    const pxToWorld = view.h / view.cssH;
    // (Settling in as it arrives: from a touch above, a touch small.)
    const arrive = (1 - p.arrive) * view.h * 0.04;
    // (Hovered, it lifts a little toward the camera in time with the pulse: envelope.js hoverLook.)
    const lift = reduced ? hoverLook(0) : hover.look;
    outer.position.set(
      0,
      p.bob - follow.y * pxToWorld - p.drop * view.h * 0.9 + arrive,
      p.push * 0.6 + lift.toward * DIST,
    );
    // (Turned toward the pointer, and further by a sideways drag or a held arrow, while it floats.)
    const goal =
      env.state === 'floating' ? turnGoal({ pointer: pointerX, dx: drag?.dx ?? 0, w: view.cssW, key: keyTurn }) : 0;
    turn = turnStep(turn, goal, dt, reduced);
    outer.rotation.set(0, p.yaw + turn, -0.5 * p.drop + turnRoll(turn));
    outer.scale.setScalar(view.scale * (1 + 0.025 * p.pulse) * (0.94 + 0.06 * p.arrive) * lift.scale);
    envl.hinge.rotation.x = -p.flap;
    // The seal: whole, starting to open as a finger drags it up, then blooming into petals,
    // shrinking away to nothing before the flap moves. It leans, turns and narrows with the
    // letter, its face drawn for that (its stamp upright on the screen).
    const bloom = sealBloom(Math.max(p.bloom, (follow.lift / 0.45) * 0.14));
    seal.group.scale.setScalar(bloom.scale);
    seal.group.rotation.z = bloom.spin;
    outer.updateMatrixWorld(true);
    seal.group.visible = bloom.scale > 0 && placeSeal();
    petalsAt(dt, p);
    // The dissolve: the edge across the letter, in its own units.
    u.uToInner.value.copy(inner.matrixWorld).invert();
    toLetter.copy(u.uToInner.value).premultiply(letterScale);
    u.uToLetter.value.copy(toLetter);
    u.uEdge.value = DISSOLVE.edge(p.dissolve);
    u.uDissolve.value = p.dissolve;
    specksAt(p.since);
    // The white page behind: up while it covers the toy, then clearing (a plain fade). Reduced
    // motion fades the whole layer instead.
    paper.style.opacity = p.crossfade ? '' : String(p.backdrop);
    layer.style.opacity = p.crossfade ? String(1 - p.fade) : '';
    draw();
    if (env.done(now)) {
      doneAt ||= now;
      if (!petals.live() || now - doneAt >= PETAL_GRACE) dispose();
    }
  }

  /**
   * The hint (live while dragging, else on hover, keyboard focus or a still touch screen) and the
   * hover pulse round the letter (the mouse over it, keyboard focus, or a touch screen left alone;
   * from the start of a pulse each time it comes on).
   * @param {number} now
   * @param {number} dt
   */
  function cues(now, dt) {
    const way = drag ? dragHint(drag.dy) : null;
    live.textContent = way === 'open' ? ENVELOPE_TEXT.dragOpen : way === 'skip' ? ENVELOPE_TEXT.dragSkip : '';
    const idle = now - lastInput >= TIMES.idleHint;
    const touchy = touchScreen();
    const words = hintFor(touchy);
    if (hintOpen.textContent !== words) hintOpen.textContent = words;
    const focused = doc.activeElement === hit;
    const floating = env.state === 'floating';
    layer.classList.toggle('is-dragging', Boolean(way));
    layer.classList.toggle('is-hinting', !way && floating && (hovered || (focused && keyboard) || (touchy && idle)));
    const hoverOn = floating && !drag && (overLetter || (focused && keyboard) || (touchy && idle));
    hover.k = hoverStep(hover.k, hoverOn, dt);
    hover.t = hover.k > 0 ? hover.t + dt : 0;
    // (A finger down on the letter shows it strongly at once: a touch screen has no hover.)
    hover.press = pressStep(hover.press, floating && Boolean(drag?.on), dt);
    hover.pulse = shownPulse(hoverPulse(hover.k, hover.t, reduced), hover.press);
    hover.look = hoverLook(hover.pulse);
    compose.mat.uniforms.uPulse.value = hover.pulse;
    compose.mat.uniforms.uReach.value = hover.look.reach;
    compose.mat.uniforms.uRim.value = hover.look.rim;
    u.uBright.value = reduced ? 0 : hover.look.bright;
    // (The seal's glint, on the hover's time; once, quick and bright, as it's opened.)
    gloss = sealGloss(floating ? hover.k : 0, hover.t, now - clickedAt, reduced);
    seal.gloss(gloss.at, gloss.width);
  }

  /**
   * Where the seal's middle falls on the drawing (texels from its lower left) and its axes there,
   * from its own matrices (envelopeSeal.js sealOnScreen): its face is drawn for them and put on
   * texel for texel (seal.place). Whether it shows (not while it's too small to draw).
   */
  function placeSeal() {
    const at = sealOnScreen(seal.group, camera, sealR, view.tw, view.th);
    if (!seal.place(at.x, at.y, at.axes)) return false;
    if (!sealPlaced) firstSeal = { frame: frames, x: at.x, y: at.y, axes: at.axes };
    sealPlaced = true;
    lastSeal = { x: at.x, y: at.y, axes: at.axes };
    return true;
  }

  /**
   * The petals: where they start from now (the letter's middle and its seal, a little in front),
   * the flurry as it first appears, and the letter as it is for the swirl round it while it
   * floats (flung out as it opens), the pour out of it as the flap lifts and its wake as it
   * moves; then on `dt` (at most a twentieth of a second a frame, so a stall while the page loads
   * holds them still, never skips them).
   * @param {number} dt
   * @param {import('./envelope.js').EnvelopePose} p
   */
  function petalsAt(dt, p) {
    const L = letterW();
    petals.unit = L;
    // (The seal's middle from its own matrix: it's on the flap, envl.hinge.)
    spots.seal.setFromMatrixPosition(seal.group.matrixWorld).z += 0.03 * L;
    spots.letter.set(0, 0, envl.T).applyMatrix4(inner.matrixWorld).z += 0.05 * L;
    if (frames === 1) petals.emit('spawn', spots.letter);
    const here = env.state !== 'skipped' && env.state !== 'gone';
    petals.letter(here ? inner.matrixWorld : null, {
      h: envl.H / envl.W,
      opening: Math.min(1, Math.max(0, p.flap / FLAP_OPEN)),
      time: last,
      floating: env.state === 'floating',
      // (The pour starts between its inside's face and its pocket's, so the pocket hides it till it
      // rises out of the mouth.)
      inside: (envl.T / 2 + DEPTH.inside) / envl.W,
      pocket: (envl.T / 2 + DEPTH.pocket) / envl.W,
    });
    petals.step(dt);
  }

  /**
   * The specks the letter sheds, `since` seconds into the fade: each where the edge reached it
   * (on the paper, in front of it), drifting from there.
   * @param {number} since
   */
  function specksAt(since) {
    specks.points.visible = since > 0;
    if (!(since > 0)) return;
    for (let i = 0; i < SPECKS; i++) {
      const s = specks.specks[i];
      const at = particleAt(s, since);
      specks.alpha[i] = at.alpha;
      if (!at.alpha) continue;
      v.set((s.x * envl.W) / 2, (s.y * envl.H) / 2, envl.T / 2 + 0.12).applyMatrix4(inner.matrix);
      specks.pos.set([v.x + at.x * envl.W, v.y + at.y * envl.W, v.z + at.z * envl.W], i * 3);
    }
    specks.geo.attributes.position.needsUpdate = true;
    specks.geo.attributes.aAlpha.needsUpdate = true;
  }

  /** Its colours, then which part each texel is, then the two put together with the ink; the specks on top. */
  function draw() {
    camera.layers.set(0);
    u.uIdPass.value = 0;
    renderer.setRenderTarget(colorRT);
    renderer.clear();
    renderer.render(scene, camera);
    u.uIdPass.value = 1;
    renderer.setRenderTarget(idRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(compose.scene, flat);
    if (specks.points.visible) {
      camera.layers.set(1);
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = true;
      camera.layers.set(0);
    }
  }
  raf = win.requestAnimationFrame(frame);

  function dispose() {
    if (gone) return;
    gone = true;
    win.cancelAnimationFrame(raf);
    win.removeEventListener('resize', onResize);
    win.removeEventListener('blur', onBlur);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('keyup', onKeyUp, true);
    for (const s of [scene, compose.scene]) {
      s.traverse((o) => {
        const m = /** @type {any} */ (o);
        m.geometry?.dispose();
        m.material?.dispose?.();
      });
    }
    seal.dispose();
    colorRT.dispose();
    idRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    layer.remove();
    onDone?.();
  }

  return {
    get state() {
      return env.state;
    },
    /** It still covers the toy. */
    get covers() {
      return env.covers;
    },
    veils,
    /**
     * For ?test: the state, reduced motion, the pose now, the flap's open angle, frames drawn,
     * the petals (how many are up now, and how many each flow has launched) and the seal's
     * placements on the screen (its first and its latest).
     */
    snapshot() {
      const now = clock();
      const petalsNow = { live: petals.live(), emitted: petals.emitted };
      const sealNow = { first: firstSeal, last: lastSeal };
      const hoverNow = {
        k: hover.k,
        press: hover.press,
        pulse: hover.pulse,
        look: { ...hover.look },
        gloss: { ...gloss },
      };
      const turnNow = { now: turn, pointer: pointerX, key: keyTurn };
      return {
        state: env.state,
        reduced,
        pose: env.pose(now),
        flapOpen: FLAP_OPEN,
        frames,
        petals: petalsNow,
        seal: sealNow,
        hover: hoverNow,
        turn: turnNow,
      };
    },
    /** Steps aside (no WebGL for the toy, or it couldn't load): skipped, with no intro. */
    aside() {
      skip();
    },
    open,
    skip,
    dispose,
    get element() {
      return layer;
    },
  };
}
