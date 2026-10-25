// The envelope that opens /invitation/, drawn and played (envelope.js has its states, gestures
// and timeline): its own small three.js canvas in a fixed overlay over the toy (envelope.css,
// z-index 3), made as the page boots, so it's also the loading screen. Low-poly and flat, in
// the reference's palette in three toon bands with dithered edges: a thin gold envelope with its
// flap hinged on its top edge, a ten-sided red wax seal with a jittered rim and the NH monogram
// raised on it (logo.js's strokes, copied here: the page takes no shared modules), a small drip
// of wax, a dozen petals drifting down from it, and a dark teal backdrop with a dithered gothic
// arch. It's drawn at low resolution and scaled up pixelated, like the toy. It bobs and sways
// until it's opened: the seal cracks and falls, the flap lifts, and it pushes toward the camera
// as it dithers out to the toy; skipped, it drops away. Reduced motion: still, the flap open at
// once, and a short crossfade.
//
// Input is all its own while it's up: a tap or click, Enter, Space or ArrowUp opens it; Escape or
// ArrowDown skips; a drag follows the finger with some give (the flap lifting as it goes up) and
// opens or skips on release (envelopeGesture), else springs back; the wheel opens or skips once
// it adds up; Skip Intro skips. The hint ("Click or swipe up to open" / "Swipe down to skip")
// shows on hover, keyboard focus, or after a while with no input on a touch screen, and reads
// "Open ↑" / "Skip ↓" while dragging. Once it's done it disposes its renderer, loses its context
// and leaves the page.
import * as THREE from 'three';
import {
  ENVELOPE_TEXT,
  FLAP_OPEN,
  SWIPE,
  TIMES,
  createEnvelope,
  dragHint,
  dragPose,
  envelopeGesture,
  envelopeKey,
} from './envelope.js';

/** Texels along the screen's shorter side (it's scaled up pixelated). */
const TEXELS = 300;
/** The camera's field of view (degrees) and distance. */
const FOV = 30;
const DIST = 6;
/** How far the envelope tilts, clockwise, radians (the reference's lean). */
const TILT = -0.36;
/** The envelope's aspect, width over height. */
const ASPECT = 1.45;
/** The wheel opens or skips once this much (CSS px) adds up one way. */
const WHEEL_STEP = 80;
/** Petals drifting from the seal. */
const PETALS = 12;

/** sRGB hex as a vec3's components (the shaders write them as they are). */
const rgb = (hex) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
/** The reference's palette: light, mid, shade. */
const PAPER = [0xf1d786, 0xe4b85d, 0xd3983d];
const INSIDE = [0xc99a48, 0xb0803a, 0x8f6127];
const CREASE = [0xf2aa91, 0xf2aa91, 0xe08f78];
const WAX = [0xcd5e58, 0xa13a25, 0x6e1511];
const MONO = [0xf3d997, 0xe9c27e, 0xc99a6a];
const PETAL = [0xe44544, 0xac2e29, 0x851d1b];

/** The NH monogram's strokes (logo.js PATH, in its units: x −27.5…27.5 across, y 2…78 down). */
const STROKES = [
  [-15, 78, -15, 27],
  [-15, 27, -4.5, 68],
  [-4.5, 68, -4.5, 2],
  [4.5, 2, 4.5, 68],
  [15, 27, 15, 78],
  [-27.5, 47, 27.5, 47],
];
/**
 * The monogram as bars `height` tall, strokes `stroke` wide (logo.js logoBars): each bar's
 * middle (u right, v up from the glyph's middle), length and angle.
 * @param {number} height
 * @param {number} stroke
 */
export function monogramBars(height, stroke) {
  const k = height / (78 - 2);
  const cy = (2 + 78) / 2;
  return STROKES.map(([ax, ay, bx, by]) => {
    const u0 = ax * k;
    const v0 = (cy - ay) * k;
    const u1 = bx * k;
    const v1 = (cy - by) * k;
    return {
      u: (u0 + u1) / 2,
      v: (v0 + v1) / 2,
      len: Math.hypot(u1 - u0, v1 - v0),
      angle: Math.atan2(v1 - v0, u1 - u0),
      width: stroke,
    };
  });
}

const BAYER = /* glsl */ `
  float bayer(vec2 p) {
    const float B[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    ivec2 i = ivec2(mod(floor(p), 4.0));
    return (B[i.y * 4 + i.x] + 0.5) / 16.0;
  }
`;

/** The shared uniforms: the fade (dithered out, 0..1) and the light, in view space. */
const shared = () => ({ uFade: { value: 0 }, uLight: { value: new THREE.Vector3(-0.5, 0.62, 0.6).normalize() } });

/**
 * A flat-shaded toon material in three tones, its band edges dithered on the texel grid, that
 * dithers away as the fade grows.
 * @param {number[]} tones  light, mid, shade (sRGB hex)
 * @param {ReturnType<typeof shared>} u
 */
function toon(tones, u) {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uTones: { value: tones.map(rgb) } },
    vertexShader: /* glsl */ `
      varying vec3 vView;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        vec4 mv = modelViewMatrix * p;
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTones[3];
      uniform vec3 uLight;
      uniform float uFade;
      varying vec3 vView;
      ${BAYER}
      void main() {
        float b = bayer(gl_FragCoord.xy);
        if (uFade > 0.0 && b < uFade) discard;
        vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
        float v = dot(n, uLight) + (b - 0.5) * 0.06;
        vec3 c = v > 0.74 ? uTones[0] : v > 0.4 ? uTones[1] : uTones[2];
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

/**
 * The backdrop: dark teal, a dithered gothic arch (its frame, a mullion and a round window),
 * leaves and a few roses at the edges, all on the texel grid.
 * @param {ReturnType<typeof shared>} u
 */
function backdrop(u) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...u, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 uRes;
      uniform float uFade;
      ${BAYER}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
      }
      // Inside a pointed arch half \`w\` wide springing at height \`s\` (from its centre line).
      bool inArch(vec2 q, float w, float s) {
        if (abs(q.x) > w) return false;
        if (q.y < s) return true;
        vec2 r = vec2(q.x, q.y - s);
        return length(r - vec2(w, 0.0)) < 2.0 * w && length(r + vec2(w, 0.0)) < 2.0 * w;
      }
      void main() {
        vec2 p = gl_FragCoord.xy;
        float b = bayer(p);
        if (uFade > 0.0 && b < uFade) discard;
        float m = min(uRes.x, uRes.y);
        vec2 q = (p - vec2(uRes.x * 0.5, 0.0)) / m;
        float top = uRes.y / m;
        vec3 deep = vec3(0.071, 0.137, 0.153);
        vec3 teal = vec3(0.110, 0.196, 0.212);
        vec3 slate = vec3(0.184, 0.220, 0.239);
        vec3 stone = vec3(0.243, 0.282, 0.298);
        // (The wall: darker toward the edges and the top, dithered.)
        float vig = length((p / uRes - 0.5) * vec2(1.2, 1.0));
        vec3 c = (vig + (b - 0.5) * 0.18) > 0.5 ? deep : teal;
        // (The arch, nearly the screen's height, a quarter of the way up from the floor.)
        float w = min(0.42, uRes.x / m * 0.36);
        float s = top * 0.5;
        vec2 a = vec2(q.x, q.y - top * 0.06);
        if (inArch(a, w + 0.05, s)) c = stone;
        if (inArch(a, w, s)) {
          // (The window: lighter toward its top, dithered in two steps.)
          float g = a.y / (s + w * 1.8) + (b - 0.5) * 0.22;
          c = g > 0.62 ? vec3(0.149, 0.247, 0.263) : g > 0.32 ? teal : deep;
          if (abs(a.x) < 0.012) c = slate;
          if (abs(length(a - vec2(0.0, s + w * 0.75)) - w * 0.42) < 0.012) c = slate;
          if (a.y < s && abs(a.y - s * 0.55) < 0.008) c = slate;
        }
        // (Leaves and roses up the sides and along the floor.)
        float edge = min(p.x, uRes.x - p.x) / m + p.y / m * 0.35;
        float leaf = noise(p / 7.0) * 0.6 + noise(p / 19.0) * 0.4;
        if (leaf - edge * 2.2 + (b - 0.5) * 0.12 > 0.38) c = vec3(0.090, 0.196, 0.169);
        if (leaf - edge * 2.2 > 0.5 && noise(p / 5.0 + 13.0) > 0.78) c = vec3(0.522, 0.114, 0.106);
        // (A floor line.)
        if (q.y < top * 0.06) c = (b > 0.5) ? deep : vec3(0.094, 0.165, 0.180);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * A small deterministic jitter (the seal's rim, the paper's creases): the same every visit.
 * @param {number} i
 */
const jitter = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

/**
 * The envelope's parts, built to a width of 2 (the group scales it to the screen).
 * @param {ReturnType<typeof shared>} u
 */
function buildEnvelope(u) {
  const W = 2;
  const H = W / ASPECT;
  const T = 0.03;
  const group = new THREE.Group();
  const mats = { paper: toon(PAPER, u), inside: toon(INSIDE, u), crease: toon(CREASE, u) };
  // The back, gently creased (a few faces lean, so the bands show).
  const back = new THREE.PlaneGeometry(W, H, 4, 3);
  const pos = back.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const edge = Math.abs(pos.getX(i)) > W / 2 - 1e-3 || Math.abs(pos.getY(i)) > H / 2 - 1e-3;
    if (!edge) pos.setZ(i, jitter(i) * 0.09);
  }
  back.computeVertexNormals();
  const backMesh = new THREE.Mesh(back, mats.paper);
  backMesh.position.z = T / 2;
  group.add(backMesh);
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), mats.paper);
  group.add(body);
  // The inside of the pocket, under the flap (it shows as the flap lifts).
  const inside = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-W / 2, H / 2, 0),
    new THREE.Vector3(0, H / 2 - H * 0.6, 0),
    new THREE.Vector3(W / 2, H / 2, 0),
  ]);
  const insideMesh = new THREE.Mesh(inside, mats.inside);
  insideMesh.position.z = T / 2 + 0.03;
  group.add(insideMesh);
  // The flap: a fan of four faces from its tip to the top edge, hinged there.
  const hinge = new THREE.Group();
  hinge.position.set(0, H / 2, T / 2 + 0.035);
  const tip = new THREE.Vector3(0, -H * 0.62, 0);
  // (Two faces with a low ridge down the middle, so each side takes its own band.)
  const ridge = new THREE.Vector3(0, 0, 0.06);
  const flapVerts = [tip, ridge, new THREE.Vector3(-W / 2, 0, 0), tip, new THREE.Vector3(W / 2, 0, 0), ridge];
  const flapGeo = new THREE.BufferGeometry().setFromPoints(flapVerts);
  const flap = new THREE.Mesh(flapGeo, mats.paper);
  hinge.add(flap);
  // Its creases: thin pink lines down its two edges.
  for (const side of [-1, 1]) {
    const from = new THREE.Vector3((side * W) / 2, 0, 0);
    const len = from.distanceTo(tip);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.022), mats.crease);
    line.position.set((from.x + tip.x) / 2, (from.y + tip.y) / 2, 0.006);
    line.rotation.z = Math.atan2(tip.y - from.y, tip.x - from.x);
    hinge.add(line);
  }
  group.add(hinge);
  return { group, hinge, mats, W, H, tipY: H / 2 + tip.y };
}

/**
 * The wax seal in two halves (it cracks down the middle), ten-sided with a jittered rim, the
 * monogram raised on it, and a small drip beside it.
 * @param {ReturnType<typeof shared>} u
 * @param {number} r  its radius
 */
function buildSeal(u, r) {
  const wax = toon(WAX, u);
  const mono = toon(MONO, u);
  const n = 10;
  const rim = Array.from({ length: n }, (_, i) => {
    const a = Math.PI / 2 + (i / n) * Math.PI * 2;
    const k = 1 + jitter(i + 3) * 0.09;
    return new THREE.Vector2(Math.cos(a) * r * k, Math.sin(a) * r * k);
  });
  // (The crack: a zigzag down the middle, shared by both halves.)
  const crack = [0.5, 0.25, 0, -0.25, -0.5].map((f, i) => new THREE.Vector2(i % 2 ? r * 0.08 : -r * 0.04, f * r * 2));
  const extrude = {
    depth: r * 0.18,
    bevelEnabled: true,
    bevelThickness: r * 0.12,
    bevelSize: r * 0.1,
    bevelSegments: 1,
  };
  const halves = [];
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    // (Round its own side of the rim, top to bottom, then back up the crack.)
    const own = side < 0 ? rim.slice(0, n / 2 + 1) : [...rim.slice(n / 2), rim[0]];
    const path = side < 0 ? [crack[0], ...own, crack[4]] : [crack[4], ...own, crack[0]];
    const back = side < 0 ? crack.slice(1, 4).reverse() : crack.slice(1, 4);
    path.push(...back);
    shape.setFromPoints(path);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, extrude), wax));
    halves.push(g);
  }
  // The monogram, raised on the wax: each bar on the half it's in (the crossbar on both).
  const top = r * 0.18 + r * 0.12 + 0.012;
  for (const bar of monogramBars(r * 1.25, r * 1.25 * 0.06)) {
    const parts =
      Math.abs(bar.angle) < 1e-6 && bar.len > r * 0.5
        ? [
            { ...bar, u: -bar.len / 4, len: bar.len / 2 },
            { ...bar, u: bar.len / 4, len: bar.len / 2 },
          ]
        : [bar];
    for (const b of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.len + b.width, b.width, 0.03), mono);
      m.position.set(b.u, b.v, top);
      m.rotation.z = b.angle;
      halves[b.u < 0 ? 0 : 1].add(m);
    }
  }
  const drip = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.16, 0), wax);
  drip.position.set(r * 1.32, r * 0.35, r * 0.1);
  drip.scale.z = 0.6;
  return { halves, drip, wax, mono };
}

/**
 * Petals as one instanced mesh: small bent quads in the petals' three tones.
 * @param {ReturnType<typeof shared>} u
 */
function buildPetals(u) {
  // (A rounded teardrop, cupped along its length.)
  const outline = [
    [-0.15, 0],
    [-0.09, 0.07],
    [0.03, 0.09],
    [0.14, 0.03],
    [0.15, -0.02],
    [0.04, -0.08],
    [-0.09, -0.06],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.ShapeGeometry(new THREE.Shape(outline));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.05 * (1 - (p.getY(i) / 0.09) ** 2));
  const mat = toon(PETAL, u);
  const mesh = new THREE.InstancedMesh(geo, mat, PETALS);
  mesh.frustumCulled = false;
  return { mesh, mat };
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
  const layer = doc.createElement('div');
  layer.className = 'inv-envelope';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', ENVELOPE_TEXT.layer);
  const t = ENVELOPE_TEXT;
  layer.innerHTML = `<canvas class="inv-envelope-canvas" aria-hidden="true"></canvas>
  <div class="inv-envelope-hit" data-envelope role="button" tabindex="0" aria-label="${t.open}" aria-describedby="inv-envelope-hint"></div>
  <p class="inv-envelope-hint" id="inv-envelope-hint"><span class="inv-envelope-hint-open">${t.hint}</span> <span class="inv-envelope-hint-skip">${t.hintSkip}</span></p>
  <p class="inv-envelope-live" aria-hidden="true"></p>
  <button type="button" class="inv-btn inv-envelope-skip" data-intro-skip>${t.skip}</button>`;
  const canvas = /** @type {HTMLCanvasElement} */ (layer.querySelector('canvas'));
  const hit = /** @type {HTMLElement} */ (layer.querySelector('[data-envelope]'));
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

  const env = createEnvelope({ reduced });
  const u = shared();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  camera.position.set(0, 0, DIST);
  const back = backdrop(u);
  scene.add(back);
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.z = TILT;
  inner.rotation.x = -0.12;
  outer.add(inner);
  scene.add(outer);
  const envl = buildEnvelope(u);
  inner.add(envl.group);
  const sealR = envl.W * 0.15;
  const seal = buildSeal(u, sealR);
  const sealAt = new THREE.Vector3(0, envl.tipY + sealR * 0.15, 0.09);
  for (const h of seal.halves) {
    h.position.copy(sealAt);
    inner.add(h);
  }
  seal.drip.position.add(sealAt);
  inner.add(seal.drip);
  const petals = buildPetals(u);
  scene.add(petals.mesh);
  const tmp = new THREE.Object3D();
  const sealWorld = new THREE.Vector3();

  /** The view's height at the envelope, world units, and the screen's CSS size. */
  const view = { h: 1, w: 1, cssW: 1, cssH: 1, scale: 1 };
  function resize() {
    const cssW = Math.max(1, layer.clientWidth || win.innerWidth);
    const cssH = Math.max(1, layer.clientHeight || win.innerHeight);
    const px = Math.max(1.25, Math.min(cssW, cssH) / TEXELS);
    const tw = Math.max(1, Math.round(cssW / px));
    const th = Math.max(1, Math.round(cssH / px));
    renderer.setSize(tw, th, false);
    back.material.uniforms.uRes.value.set(tw, th);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    view.h = 2 * DIST * Math.tan(((FOV / 2) * Math.PI) / 180);
    view.w = view.h * camera.aspect;
    view.cssW = cssW;
    view.cssH = cssH;
    const c = Math.cos(-TILT);
    const s = Math.sin(-TILT);
    const w = Math.min((0.82 * view.w) / (c + s / ASPECT), (0.52 * view.h) / (s + c / ASPECT));
    view.scale = w / envl.W;
  }
  resize();
  const onResize = () => resize();
  win.addEventListener('resize', onResize);

  // --- Input.
  const clock = () => win.performance.now() / 1000;
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

  function open() {
    if (!env.open(clock())) return;
    layer.classList.add('is-open');
    onOpen?.();
  }
  function skip() {
    if (!env.skip(clock())) return;
    layer.classList.add('is-leaving');
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

  hit.addEventListener('pointerdown', (e) => {
    lastInput = clock();
    if (drag || (e.pointerType === 'mouse' && e.button !== 0) || !env.covers) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0 };
    try {
      hit.setPointerCapture(e.pointerId);
    } catch {
      // (a pointer that's already gone)
    }
  });
  hit.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') hovered = true;
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
    if (e.pointerType === 'mouse') hovered = true;
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
      keyboard = true;
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
    keyboard = true;
    if (what === 'open') open();
    else skip();
  }
  doc.addEventListener('keydown', onKey, true);
  hit.focus({ preventScroll: true });

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
    const state = env.step(now, ready());
    if (state === 'fading' || state === 'gone') uncover('open');
    const p = env.pose(now);
    // The drag: the follow and the flap's lift, eased (the give); back to rest when let go.
    const target = drag && env.covers ? dragPose(drag.dy, view.cssH) : { follow: 0, lift: 0 };
    const k = reduced ? 1 : 1 - Math.exp(-dt / 0.07);
    follow.y += (target.follow - follow.y) * k;
    follow.lift += (target.lift - follow.lift) * k;
    // The hint: live while dragging, else on hover, keyboard focus or a still touch screen.
    const way = drag ? dragHint(drag.dy) : null;
    live.textContent = way === 'open' ? ENVELOPE_TEXT.dragOpen : way === 'skip' ? ENVELOPE_TEXT.dragSkip : '';
    const idle = now - lastInput >= TIMES.idleHint;
    const touchy = win.matchMedia?.('(hover: none)').matches ?? false;
    const focused = doc.activeElement === hit;
    layer.classList.toggle('is-dragging', Boolean(way));
    layer.classList.toggle(
      'is-hinting',
      !way && env.state === 'floating' && (hovered || (focused && keyboard) || (touchy && idle)),
    );
    // The envelope.
    const pxToWorld = view.h / view.cssH;
    outer.position.set(0, p.bob - follow.y * pxToWorld - p.drop * view.h * 0.9, p.push * 3.2);
    outer.rotation.set(0, p.yaw, -0.5 * p.drop);
    outer.scale.setScalar(view.scale * (1 + 0.025 * p.pulse));
    envl.hinge.rotation.x = -Math.max(p.flap, follow.lift * FLAP_OPEN);
    // The seal: whole, then cracked apart, then falling away as the flap lifts.
    const since = Math.max(0, p.flap / FLAP_OPEN - 0.15);
    seal.halves.forEach((h, i) => {
      const side = i ? 1 : -1;
      const fall = since * since * 3;
      h.position.set(sealAt.x + side * sealR * 0.25 * p.crack + side * fall * 0.3, sealAt.y - fall, sealAt.z);
      // (Stamped upright on the screen, whatever the envelope's lean.)
      h.rotation.z = -TILT * 0.85 - side * 0.35 * p.crack - side * fall * 1.5;
    });
    seal.drip.visible = p.crack < 0.5;
    // The petals: a ribbon from the seal down to the lower left, faster once it opens.
    inner.updateMatrixWorld(true);
    outer.updateMatrixWorld(true);
    sealWorld.copy(sealAt).applyMatrix4(inner.matrixWorld);
    const speed = env.opened ? 0.22 : 0.07;
    for (let i = 0; i < PETALS; i++) {
      const s = (((reduced ? 0 : now) * speed * (0.8 + 0.4 * ((i * 7) % 5) * 0.25) + i / PETALS) % 1) * 1;
      const sway = Math.sin(now * 1.3 + i * 2.1) * 0.12 * s;
      tmp.position.set(
        sealWorld.x - s * view.w * 0.32 + sway - (env.opened ? s * jitter(i) * 0.6 : 0),
        sealWorld.y - s * view.h * 0.62,
        sealWorld.z + 0.1 + s * 0.8,
      );
      tmp.rotation.set(now * 0.9 + i, now * 1.4 + i * 0.7, i * 0.9 + s * 3);
      tmp.scale.setScalar(view.scale * (0.6 + 0.5 * Math.min(1, s * 4)));
      tmp.updateMatrix();
      petals.mesh.setMatrixAt(i, tmp.matrix);
    }
    petals.mesh.instanceMatrix.needsUpdate = true;
    // The fade: dithered out, or with reduced motion a crossfade.
    u.uFade.value = p.crossfade ? 0 : p.fade;
    layer.style.opacity = p.crossfade ? String(1 - p.fade) : '';
    renderer.render(scene, camera);
    if (env.done(now)) dispose();
  }
  raf = win.requestAnimationFrame(frame);

  function dispose() {
    if (gone) return;
    gone = true;
    win.cancelAnimationFrame(raf);
    win.removeEventListener('resize', onResize);
    doc.removeEventListener('keydown', onKey, true);
    scene.traverse((o) => {
      const m = /** @type {any} */ (o);
      m.geometry?.dispose();
      m.material?.dispose?.();
    });
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
    /** For ?test: the state, reduced motion, the pose now, the flap's open angle, frames drawn. */
    snapshot() {
      return { state: env.state, reduced, pose: env.pose(clock()), flapOpen: FLAP_OPEN, frames };
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
