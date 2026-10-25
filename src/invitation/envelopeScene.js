// The envelope that opens /invitation/, drawn and played (envelope.js has its states, gestures,
// timeline and dissolve; petals.js its rose petals): its own small three.js canvas in a fixed
// overlay over the toy (envelope.css, z-index 3) on a plain white page, made as the page
// boots, so it's also the loading screen. Low-poly and flat, in the reference's palette in three
// toon bands: a thin gold envelope seen from the back (its flap hinged on its top edge over the
// side and bottom folds of its pocket), a red wax seal (envelopeSeal.js), and rose petals in
// three shapes and three reds, instanced (one mesh a shape), each tumbling, fluttering and
// drifting its own way. It's drawn at low resolution, twice (its colours, then which part each
// texel is), and put together with a one-texel line in the toy's ink round its silhouette, round
// every petal and along every fold where one part meets another, then scaled up pixelated, like
// the toy. It settles in under a soft flurry of petals as it appears, and bobs and sways until
// it's opened, a petal trickling now and then; the mouse over it, or a touch, stirs a few. Opened,
// the seal blooms first: it swells, then shrinks away as a ring of petals unfurls out of it and
// lifts off; only then the flap lifts, with a burst of petals out of the letter, and the letter
// alone dissolves like a weapon on the Bonfire site (a noisy, dithered edge with a burning rim
// sweeping up across it, shedding specks of paper, embers and wax that drift up and fade) while
// the white page behind clears to the toy; skipped, it drops away with a spill of petals as the
// page clears. Reduced motion: still, no petals, the flap open at once, and a short plain fade
// (the seal fades with the letter).
//
// Input is all its own while it's up: a tap or click, Enter, Space or ArrowUp opens it; Escape or
// ArrowDown skips; a drag follows the finger with some give (the seal starting to open as it goes
// up) and opens or skips on release (envelopeGesture), else springs back; the wheel opens or skips
// once it adds up; Skip Intro skips. It takes focus at boot with no ring: the ring shows once a key
// is pressed. veils(spots) says whether it still hides NEWT (his head, collar and middle: the
// intro's first line waits for it; envelope.js letterCovers at points of each on the letter).
// The hint ("Click or swipe up to open", "Tap ..." on a touch screen, / "Swipe down to skip")
// shows on hover, keyboard focus, or after a while with no input on a touch screen, and reads
// "Open ↑" / "Skip ↓" while dragging. Once it's done (and its last petals have fallen) it
// disposes its renderer, loses its context and leaves the page.
import * as THREE from 'three';
import {
  DISSOLVE,
  ENVELOPE_TEXT,
  FLAP_OPEN,
  SWIPE,
  TIMES,
  createEnvelope,
  dragHint,
  dragPose,
  envelopeGesture,
  envelopeKey,
  hintFor,
  letterCovers,
  particleAt,
  sealBloom,
  shedParticles,
} from './envelope.js';
import { buildSeal, sealTexel } from './envelopeSeal.js';
import { PETAL_SHAPES, POOL, createPetalFlow, petalGrid } from './petals.js';
import {
  BAYER,
  IDS,
  INK,
  LEAN,
  PAPER,
  PETAL,
  PITCH,
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
/** Move the mouse this far (CSS px) over it for another stir of petals. */
const STIR_MOVE = 90;
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
 * pocket where the flap opens, the pocket's two side folds and its bottom fold (each its own
 * part, so a line runs where one shows over another), and the flap hinged on the top edge. Each
 * is one flat tone of the paper's three (LEAN).
 * @param {ReturnType<typeof shared>} u
 */
function buildEnvelope(u) {
  const L = envelopeLayout();
  const { W, H, T } = L;
  const h = H / 2;
  const group = new THREE.Group();
  const paper = (/** @type {keyof typeof LEAN} */ part) => toon(PAPER, u, IDS[part], { lean: LEAN[part] });
  group.add(piece(L.parts.body, paper('body'), T / 2));
  group.add(piece(L.parts.inside, paper('inside'), T / 2 + 0.004));
  group.add(piece(L.parts.left, paper('left'), T / 2 + 0.01));
  group.add(piece(L.parts.right, paper('right'), T / 2 + 0.01));
  group.add(piece(L.parts.bottom, paper('bottom'), T / 2 + 0.02));
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
 * The petals: an instanced mesh a shape (petals.js petalGrid), each petal's shade an instanced
 * attribute (a step lighter or darker through the three reds); never dissolved.
 * @param {ReturnType<typeof shared>} u
 */
function buildPetals(u) {
  return PETAL_SHAPES.map((shape, i) => {
    const grid = petalGrid(shape);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(grid.positions, 3));
    geo.setIndex(grid.index);
    const shade = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
    geo.setAttribute('aShade', shade);
    const mat = toon(PETAL, u, IDS.petal + i, { uniforms: { uDissolve: { value: 0 } }, defines: { PETAL: '' } });
    const mesh = new THREE.InstancedMesh(geo, mat, POOL);
    mesh.count = 0;
    mesh.frustumCulled = false;
    return { mesh, shade };
  });
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
 * outside it, and down every fold.
 */
function buildCompose() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: null },
      uId: { value: null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uInk: { value: rgb(INK) },
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
      varying vec2 vUv;
      // (A neighbour's part; one on the dissolving rim counts as nothing, so no line goes round it.)
      float idAt(vec2 o) {
        vec4 t = texture2D(uId, vUv + o * uTexel);
        return t.g > 0.5 ? 0.0 : floor(t.r * 255.0 + 0.5);
      }
      void main() {
        float me = floor(texture2D(uId, vUv).r * 255.0 + 0.5);
        float near = max(max(idAt(vec2(1.0, 0.0)), idAt(vec2(-1.0, 0.0))), max(idAt(vec2(0.0, 1.0)), idAt(vec2(0.0, -1.0))));
        // (Round the silhouette the corners count too, so the line closes up on the paper.)
        if (me < 0.5) near = max(near, max(max(idAt(vec2(1.0, 1.0)), idAt(vec2(-1.0, 1.0))), max(idAt(vec2(1.0, -1.0)), idAt(vec2(-1.0, -1.0)))));
        if (near > me + 0.5) { gl_FragColor = vec4(uInk, 1.0); return; }
        gl_FragColor = me < 0.5 ? vec4(0.0) : vec4(texture2D(uColor, vUv).rgb, 1.0);
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
 */

/**
 * The envelope over `root` (it goes in first, under nothing), or null where it can't draw.
 * @param {HTMLElement} root
 * @param {EnvelopeSceneOpts} opts
 */
export function createEnvelopeScene(root, { reduced, ready, onOpen, onUncover, onDone }) {
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
  const flow = createPetalFlow({ reduced, seed: 16 });
  /**
   * The petals' clock, seconds: it runs with the frames, at most a twentieth of a second a frame,
   * so a stall while the page loads (NEWT's model coming in) holds them still, never skips them.
   */
  let pt = 0;
  const u = shared();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  camera.position.set(0, 0, DIST);
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
  const sealAt = new THREE.Vector3(envl.seal.x, envl.seal.y, envl.T / 2 + 0.16);
  seal.group.position.copy(sealAt);
  inner.add(seal.group);
  const petals = buildPetals(u);
  for (const p of petals) scene.add(p.mesh);
  const specks = buildSpecks();
  outer.add(specks.points);
  const compose = buildCompose();
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rtOpts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true };
  const colorRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  const idRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  compose.mat.uniforms.uColor.value = colorRT.texture;
  compose.mat.uniforms.uId.value = idRT.texture;
  const tmp = new THREE.Object3D();
  const sealWorld = new THREE.Vector3();
  const v = new THREE.Vector3();
  /** Where the petals start from, in petals.js's letter widths (kept up to date each frame). */
  const spots = {
    letter: { x: 0, y: 0, z: 0.05 },
    seal: { x: 0, y: 0, z: 0.05 },
    mouth: { x: 0, y: 0, z: 0.05 },
    trickle: { x: 0, y: 0, z: 0.05 },
  };
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
    // (The seal's radius on the screen, texels, at rest: its face is drawn at that size and put
    // on the screen texel for texel. It's nearer the camera than the letter.)
    inner.updateMatrix();
    const face = v.copy(sealAt).applyMatrix4(inner.matrix);
    seal.setRadius(sealR / sealTexel(view.h, th, view.scale, face.z * view.scale, DIST));
  }
  resize();
  const onResize = () => resize();
  win.addEventListener('resize', onResize);

  // --- Input.
  /** @type {{id: number, x: number, y: number, t: number, dx: number, dy: number}|null} */
  let drag = null;
  /** The drag's follow as shown (eased toward its target: the give), CSS px; and the flap's lift. */
  const follow = { y: 0, lift: 0 };
  let wheel = 0;
  let wheelAt = 0;
  let hovered = false;
  let keyboard = false;
  let lastInput = clock();
  let frames = 0;
  let uncovered = false;
  /** The burst out of the letter as its flap starts to lift; the drag's stir from the seal. */
  let burst = false;
  let dragStir = false;
  /** The mouse's travel over it since its last stir, CSS px; and where it was. */
  let stirMove = 0;
  /** @type {{x: number, y: number}|null} */
  let stirAt = null;
  /** When it was done (its last petals may hold it up a moment). */
  let doneAt = 0;

  /**
   * A point on the screen (CSS px) in petals.js's units, a little in front of the letter.
   * @param {number} x
   * @param {number} y
   */
  const screenToPetals = (x, y) => ({
    x: ((x / view.cssW - 0.5) * view.w) / letterW(),
    y: (-(y / view.cssH - 0.5) * view.h) / letterW(),
    z: 0.15,
  });
  /** @param {PointerEvent} e  a stir of petals where it is */
  const stirFrom = (e) => flow.stir(pt, screenToPetals(e.clientX, e.clientY));

  function open() {
    const now = clock();
    if (!env.open(now)) return;
    layer.classList.add('is-open');
    // The seal blooms into roses (before the flap: envelope.js's timeline).
    flow.emit('bloom', pt, spots.seal, { radius: (sealR * view.scale) / letterW() });
    onOpen?.();
  }
  function skip() {
    const now = clock();
    if (!env.skip(now)) return;
    layer.classList.add('is-leaving');
    // (The petals up shrink out of the toy's way; a spill goes down with the letter.)
    flow.cut(pt);
    flow.emit('spill', pt, spots.letter);
    uncover('skip');
  }
  /** @param {'open'|'skip'} how */
  function uncover(how) {
    if (uncovered) return;
    uncovered = true;
    layer.classList.add('is-leaving');
    doc.removeEventListener('keydown', onKey, true);
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
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0 };
    dragStir = false;
    // (A touch stirs the petals where it lands.)
    if (e.pointerType !== 'mouse' && env.state === 'floating') stirFrom(e);
    try {
      hit.setPointerCapture(e.pointerId);
    } catch {
      // (a pointer that's already gone)
    }
  });
  hit.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      hovered = true;
      // (The mouse over it stirs a few petals now and then as it moves.)
      if (stirAt) stirMove += Math.hypot(e.clientX - stirAt.x, e.clientY - stirAt.y);
      stirAt = { x: e.clientX, y: e.clientY };
      if (stirMove >= STIR_MOVE && !drag && env.state === 'floating' && stirFrom(e)) stirMove = 0;
    }
    if (!drag || e.pointerId !== drag.id) return;
    lastInput = clock();
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
  });
  const release = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    lastInput = clock();
    if (cancelled) return;
    const small = Math.abs(d.dx) < SWIPE.tap && Math.abs(d.dy) < SWIPE.tap;
    const g = small ? 'open' : envelopeGesture(d.dx, d.dy, performance.now() - d.t, view.cssH);
    if (g === 'open') open();
    else if (g === 'skip') skip();
  };
  hit.addEventListener('pointerup', (e) => release(e, false));
  hit.addEventListener('pointercancel', (e) => release(e, true));
  hit.addEventListener('lostpointercapture', (e) => release(e, true));
  hit.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hovered = true;
    stirAt = { x: e.clientX, y: e.clientY };
    stirMove = 0;
    if (env.state === 'floating') stirFrom(e);
  });
  hit.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hovered = false;
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
  doc.addEventListener('keydown', onKey, true);
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
    pt += dt;
    last = now;
    frames++;
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
    // The hint: live while dragging, else on hover, keyboard focus or a still touch screen.
    const way = drag ? dragHint(drag.dy) : null;
    live.textContent = way === 'open' ? ENVELOPE_TEXT.dragOpen : way === 'skip' ? ENVELOPE_TEXT.dragSkip : '';
    const idle = now - lastInput >= TIMES.idleHint;
    const touchy = touchScreen();
    const words = hintFor(touchy);
    if (hintOpen.textContent !== words) hintOpen.textContent = words;
    const focused = doc.activeElement === hit;
    layer.classList.toggle('is-dragging', Boolean(way));
    layer.classList.toggle(
      'is-hinting',
      !way && env.state === 'floating' && (hovered || (focused && keyboard) || (touchy && idle)),
    );
    // The envelope.
    const pxToWorld = view.h / view.cssH;
    // (Settling in as it arrives: from a touch above, a touch small.)
    const arrive = (1 - p.arrive) * view.h * 0.04;
    outer.position.set(0, p.bob - follow.y * pxToWorld - p.drop * view.h * 0.9 + arrive, p.push * 0.6);
    outer.rotation.set(0, p.yaw, -0.5 * p.drop);
    outer.scale.setScalar(view.scale * (1 + 0.025 * p.pulse) * (0.94 + 0.06 * p.arrive));
    envl.hinge.rotation.x = -p.flap;
    // The seal: whole, starting to open as a finger drags it up, then blooming into petals,
    // shrinking away to nothing before the flap moves. (Stamped upright on the screen, whatever
    // the envelope's lean.)
    const bloom = sealBloom(Math.max(p.bloom, (follow.lift / 0.45) * 0.14));
    seal.group.scale.setScalar(bloom.scale);
    // (Upright on the screen, as its face is drawn: then it goes on texel for texel.)
    seal.group.rotation.z = -TILT + bloom.spin;
    seal.group.visible = bloom.scale > 0;
    outer.updateMatrixWorld(true);
    placeSeal();
    petalsAt(pt, p);
    // The dissolve: the edge across the letter, in its own units.
    toLetter.copy(inner.matrixWorld).invert().premultiply(letterScale);
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
      if (!flow.live(pt) || now - doneAt >= PETAL_GRACE) dispose();
    }
  }

  /**
   * Where the seal's middle falls on the drawing (texels from its lower left), and how big and
   * turned it shows against its face as drawn (seal.place snaps the sway's hair of either away,
   * so its face goes on texel for texel).
   */
  function placeSeal() {
    if (!seal.group.visible) return;
    const c = sealWorld.copy(sealAt).applyMatrix4(inner.matrixWorld).project(camera);
    const cx = (c.x * 0.5 + 0.5) * view.tw;
    const cy = (c.y * 0.5 + 0.5) * view.th;
    const e = seal.group.localToWorld(v.set(sealR, 0, 0)).project(camera);
    const dx = (e.x * 0.5 + 0.5) * view.tw - cx;
    const dy = (e.y * 0.5 + 0.5) * view.th - cy;
    seal.place(cx, cy, Math.hypot(dx, dy) / seal.radius, Math.atan2(dy, dx));
  }

  /**
   * The petals: where they start from now (the letter, its seal, its mouth), the flows due this
   * frame (the flurry as it first appears, the burst as the flap starts to lift, the stir from
   * the seal as a finger drags it up, the trickle while it floats), and each petal's pose.
   * @param {number} now  the petals' clock
   * @param {import('./envelope.js').EnvelopePose} p
   */
  function petalsAt(now, p) {
    const L = letterW();
    /**
     * @param {{x: number, y: number, z: number}} spot
     * @param {THREE.Vector3} w  world
     * @param {number} dz  letter widths in front
     */
    const put = (spot, w, dz) => {
      spot.x = w.x / L;
      spot.y = w.y / L;
      spot.z = w.z / L + dz;
    };
    sealWorld.copy(sealAt).applyMatrix4(inner.matrixWorld);
    put(spots.seal, sealWorld, 0.03);
    put(spots.letter, v.set(0, 0, envl.T).applyMatrix4(inner.matrixWorld), 0.05);
    put(spots.mouth, v.set(0, envl.H * 0.38, envl.T).applyMatrix4(inner.matrixWorld), 0.05);
    put(
      spots.trickle,
      v
        .set(0, -sealR * 0.9, 0)
        .add(sealAt)
        .applyMatrix4(inner.matrixWorld),
      0.03,
    );
    if (frames === 1) flow.emit('spawn', now, spots.letter);
    if (!burst && p.flap > 0) {
      burst = true;
      flow.emit('burst', now, spots.mouth);
    }
    if (drag && !dragStir && follow.lift > 0.2 && env.state === 'floating') {
      dragStir = true;
      flow.stir(now, spots.seal);
    }
    flow.step(now, env.state === 'floating' && !drag ? spots.trickle : null);
    const counts = petals.map(() => 0);
    for (const { petal, pose } of flow.at(now)) {
      const k = PETAL_SHAPES.indexOf(petal.shape);
      const n = counts[k]++;
      tmp.position.set(pose.x * L, pose.y * L, pose.z * L);
      tmp.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]);
      tmp.scale.setScalar(pose.scale * L);
      tmp.updateMatrix();
      petals[k].mesh.setMatrixAt(n, tmp.matrix);
      petals[k].shade.setX(n, petal.shade);
    }
    petals.forEach((m, k) => {
      m.mesh.count = counts[k];
      m.mesh.instanceMatrix.needsUpdate = true;
      m.shade.needsUpdate = true;
    });
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
    doc.removeEventListener('keydown', onKey, true);
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
     * and the petals (how many are up now, and how many each flow has launched).
     */
    snapshot() {
      const now = clock();
      const petalsNow = { live: flow.live(pt), emitted: flow.emitted };
      return { state: env.state, reduced, pose: env.pose(now), flapOpen: FLAP_OPEN, frames, petals: petalsNow };
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
