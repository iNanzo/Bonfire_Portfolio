// The invitation toy's stage: the renderer (no antialiasing, drawn at texel size: pixels.js
// texelGrid, the canvas stretched by CSS), the camera (20° of view; main.js's orbit camera,
// camera.js, moves it with setCamera; pixels.js frameView gives its default view: 36° up, NEWT
// about a fifth of a desktop's short side tall with the whole play area in sight, or a quarter
// of a phone's (the camera follows him there), and the point it looks at shown in the middle of
// the space over the toolbar, or of the clear space beside the open Look sheet (`focus`), by an
// off-centre projection that holds however it turns), the
// floor (floor.js: no room, the preset's background and an invisible floor that only catches
// his shadows), the lights and shadows of the look preset, the blob
// shadow and the floor marker, and the retro pass. A ResizeObserver refits it all (in device
// pixels where the browser measures them, devicePixelContentBoxSize), and so does refit()
// (main.js calls it when the toolbar resizes and when the Look sheet opens, closes or resizes);
// the canvas is only resized when its texel grid changes (a resize clears it).
//
// Lights: a faint HemisphereLight and one DirectionalLight that casts, turned with the camera's
// yaw (camera.js lightDir: his shadow falls the same way on screen, back and to one side, after
// any orbit), its shadow camera refitted as it turns to the play area plus the highest he's
// lifted (floor.js fitShadow). The shadow map type is
// the preset's (BasicShadowMap for DS: three 0.186 has no PCFSoftShadowMap), drawn once a frame
// (autoUpdate off, needsUpdate before the colour pass), on phones too.
//
// The blob shadow under NEWT, the ring marker under the finger and the dashed drop line sit on
// their own layer (LAYERS.decal: rays and the shadow pass leave them out) and write no depth, so
// they make no lines; main.js moves them (setBlob: stronger while he's lifted, and off the floor
// sized, faded and softened by cues.js blobLook, and under his body while he lies; setMarker: the
// ring under him while he's held, Ground Cues, and setPointerMarker, the cursor marker where the
// pointer meets the floor, faded as the view gets low: both drawn by ring.js's shader from the
// distance to a centre on the texel grid, a two-texel rim; setLine: the drop line from his collar to the
// ring, two texels wide and dashed in texels, turned to face the camera). The dust he raises
// landing is on that layer too (setDust: dustLayer.js draws dust.js's puffs, dithered, the pass's
// area grown to take them in), and a big drop's screen shake moves the canvas by a few CSS px
// (setShake: camera.js shakeOffset; the camera never moves). `bounds` is the default view's disc (area.js playArea), kept round the play
// area's middle (setArea: the play area itself is main.js's, area.js viewArea): what a desktop's
// default view keeps in sight (pixels.js frameView) and the size of the shadow camera's box, moved
// to wherever NEWT is (floor.js fitShadow), so his shadow is as fine anywhere in the area.
//
// Cost (round 14, profiled at 390x844@3 and 1280x800@1 with the CPU slowed 4×): the CPU side is
// a millisecond or two a frame; the cost is texels, and at Native on a phone there are three
// million. Each frame the stage hands the retro pass two boxes round NEWT (retro.js
// subjectBoxes: his bounding sphere on screen, and the floor his shadow can fall on), so the post
// shader's neighbour loops (the outer ring, the soft shadow) only run there. NEWT is found as
// the scene's one child the stage didn't add (setSubject names him outright).
//
// Adaptive pixels: setZoomScale(k), k NEWT's size on screen over the default view's (main.js
// passes the orbit's home distance over its distance), sizes the texel to follow the zoom
// (pixels.js blockAt), so he keeps the chosen sprite resolution at any zoom; the grid is only
// refitted when the block changes. Native and Off never change with it.
//
// The frame-time governor (governor.js): each frame's interval goes to it, and while frames stay
// slow it adds device px to every texel (never at Off, never finer than the user's choice), back
// once they're fast; a new Pixel Size starts it afresh. It's on for visitors and off under ?test
// unless ?govern asks for it (CI's software WebGL is slow, and the specs measure the grid).
// ?perf shows the frame times, the GPU's time a frame where the browser can time it
// (EXT_disjoint_timer_query_webgl2), the grid and the governor's level in a corner; lookState()
// reports them for ?test.
import * as THREE from 'three';
import { NEWT_HEIGHT, NEWT_RADIUS, playArea } from './area.js';
import { lightDir } from './camera.js';
import { createGovernor, governReset, governStep, percentile } from './governor.js';
import { blockAt, frameView, resolutionOf, texelGrid } from './pixels.js';
import { FLOOR_SIZE, createFloor, fitShadow, floorLook } from './floor.js';
import { createRetro, decalMaterial, subjectBoxes } from './retro.js';
import { dustBounds } from './dust.js';
import { createDustLayer } from './dustLayer.js';
import { RING_FRAGMENT, elevationAt, markerFade, ringRadius, snapToTexel, texelSize } from './ring.js';
import { parseQuery } from './ui.js';

export const LAYERS = { decal: 2 };
/** The highest NEWT is carried, world units (his root): the shadow camera reaches over it. */
export const LIFT = 2.2;
/** NEWT's bounding sphere from his root: its centre this far up his body, this radius (world units). */
export const SUBJECT = { up: NEWT_HEIGHT / 2, radius: NEWT_HEIGHT / 2 + 0.3 };
/** The zoom setZoomScale takes, as a range (k: NEWT's size on screen over the default view's). */
export const ZOOM_RANGE = { min: 0.125, max: 8 };
/** ?perf: frame intervals kept for its line, and how often the line is rewritten, ms. */
const PERF_FRAMES = 120;
const PERF_EVERY = 500;
const SHADOW_TYPES = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap };
/** The blob's size standing, world units across (off the floor, cues.js blobLook's). */
const BLOB_STANDING = 0.62;
/** The marker ring's size, world units across (its rim's outer edge), and its strength. */
const MARKER = { size: 0.34, opacity: 0.85 };
/** The drop line: texels wide, and its dashes, texels on and off. */
const DASH = { width: 2, on: 4, off: 2 };

/**
 * A radial ramp (white, alpha the way in from the rim: 1 - r) for the blob shadow; its shader
 * turns it into the falloff (BLOB_SHADER: standing, (1 - r)^1.4 as ever; off the floor, a soft
 * edge of cues.js blobLook's share of the radius).
 * @param {number} n  texels across
 */
function blobTexture(n = 32) {
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = Math.max(0, 1 - r);
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
/** The blob's falloff, after its ramp is read and before the decal's cut (blobMaterial). */
const BLOB_SHADER = `#ifdef USE_MAP
	float blobIn = sampledDiffuseColor.a;
	float blobA = mix( pow( blobIn, 1.4 ), smoothstep( 0.0, max( uBlobSoft, 1e-3 ), blobIn ), uBlobHeld );
	sampledDiffuseColor.a = blobA;
	diffuseColor.a = opacity * blobA;
#endif`;

/**
 * The blob's material: retro.js decalMaterial with its falloff (BLOB_SHADER) between the
 * standing one and the held one's soft edge (`uBlobHeld` of the way, `uBlobSoft` of the radius).
 */
function blobMaterial() {
  const m = decalMaterial({ map: blobTexture(), color: 0x000000, opacity: 0.2 });
  const uniforms = { uBlobSoft: { value: 0.15 }, uBlobHeld: { value: 0 } };
  const decal = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    decal.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uBlobSoft;\nuniform float uBlobHeld;\nvoid main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>\n${BLOB_SHADER}`);
  };
  m.customProgramCacheKey = () => 'invitation-blob';
  return { material: m, uniforms };
}

/**
 * The drop line's dashes: DASH texels on, then off, along it (nearest, repeating).
 */
function dashTexture() {
  const n = DASH.on + DASH.off;
  const data = new Uint8Array(n * 4);
  for (let y = 0; y < n; y++) data.set([255, 255, 255, y < DASH.on ? 255 : 0], y * 4);
  const t = new THREE.DataTexture(data, 1, n, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/**
 * The floor ring's material: retro.js decalMaterial drawing ring.js RING_FRAGMENT, the ring from
 * each texel's distance to `uRingCentre` (x, z) out to `uRingRadius`, world units.
 */
function ringMaterial() {
  const m = decalMaterial({ color: 0x000000, opacity: MARKER.opacity });
  const uniforms = { uRingCentre: { value: new THREE.Vector2() }, uRingRadius: { value: MARKER.size / 2 } };
  const decal = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    decal.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vRingWorld;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tvRingWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'varying vec3 vRingWorld;\nuniform vec2 uRingCentre;\nuniform float uRingRadius;\nvoid main() {',
      )
      .replace('#include <alphatest_fragment>', `${RING_FRAGMENT}\n#include <alphatest_fragment>`);
  };
  m.customProgramCacheKey = () => 'invitation-ring';
  return { material: m, uniforms };
}

/**
 * @typedef {object} StageOptions
 * @property {import('./look.js').LookPreset} preset
 * @property {import('./look.js').Look} look
 * @property {boolean} [perf]  show the frame times in a corner (?perf by default)
 * @property {boolean} [govern]  the frame-time governor (by default on, off under ?test unless ?govern)
 * @property {() => import('./pixels.js').Insets} insets  where the floor keeps clear of, CSS px
 * @property {() => import('./pixels.js').Insets} [focus]  where the point the camera looks at
 *   shows: the middle of the space these leave (`insets` by default; the open Look sheet's clear
 *   space), how far back it is unchanged
 * @property {(stage: {grid: import('./pixels.js').Grid, view: import('./pixels.js').View, home: import('./pixels.js').Grid}) => void} [onResize]
 *   the grid refitted: the grid as drawn (the zoom's block and the governor's level in it), the
 *   default view, and `home`, the Pixel Size's own grid (at the default zoom, no governor: what
 *   decides his shirt, so neither the zoom nor the governor changes it)
 */

/**
 * The stage in `container` (which hides the canvas's overhang: overflow hidden).
 * @param {HTMLElement} container
 * @param {StageOptions} o
 */
export function createStage(container, { preset, look, insets, focus, onResize, perf, govern }) {
  const query = parseQuery(globalThis.location?.search ?? '');
  const showPerf = perf ?? query.perf;
  let governOn = govern ?? query.govern ?? !query.test;
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    // (The colour target's clear keeps the background's colour under alpha 0, "nothing drawn":
    // premultiplied, three would clear it to black.)
    premultipliedAlpha: false,
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.className = 'inv-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'NEWT, a small chibi with black hair and a plaid shirt, on a plain white floor');
  container.prepend(canvas);

  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = true;
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 80);
  camera.layers.enable(LAYERS.decal);

  const floor = createFloor(preset);
  scene.add(floor.mesh);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  scene.add(sun, sun.target);

  const blobMat = blobMaterial();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat.material);
  blob.scale.setScalar(BLOB_STANDING);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  blob.renderOrder = 1;
  blob.layers.set(LAYERS.decal);
  const ringMat = ringMaterial();
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat.material);
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.003;
  marker.renderOrder = 2;
  marker.layers.set(LAYERS.decal);
  marker.visible = false;
  // (The drop line: a quad from y 0 to 1, placed by its own matrix each frame: setLine. One pass:
  // three draws a blended two-sided mesh twice, its back then its front, and a flat quad turned
  // to the camera only ever shows one side.)
  const lineGeo = new THREE.PlaneGeometry(1, 1);
  lineGeo.translate(0, 0.5, 0);
  const line = new THREE.Mesh(
    lineGeo,
    decalMaterial({
      map: dashTexture(),
      color: 0x000000,
      opacity: MARKER.opacity,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    }),
  );
  line.matrixAutoUpdate = false;
  line.renderOrder = 2;
  line.layers.set(LAYERS.decal);
  line.visible = false;
  line.frustumCulled = false;
  scene.add(blob, marker, line);
  // (The dust he raises landing: dust.js moves it, setDust.)
  const dust = createDustLayer(LAYERS.decal);
  scene.add(dust.mesh);
  /** The dust's box this frame (dust.js dustBounds), for the pass's area; null: none. */
  let dustBox = /** @type {ReturnType<typeof dustBounds>} */ (null);
  /** The shake's offset as last set, CSS px (setShake). */
  const shakeNow = { x: 0, y: 0 };

  const retro = createRetro(renderer);
  let current = { preset, look };
  /** @type {import('./pixels.js').Grid} */
  let grid = texelGrid({ cssW: 1, cssH: 1, dpr: 1, pixelSize: look.pixelSize });
  /** @type {import('./pixels.js').View|null} */
  let view = null;
  /** @type {{w: number, h: number}|null} the stage in device pixels, as the browser measured it */
  let device = null;
  /** @type {import('./types.js').Bounds} the default view's disc, round the play area's middle (setArea) */
  let bounds = playArea();
  /** @type {{position: import('./types.js').XYZ, target: import('./types.js').XYZ}|null} where main.js put the camera */
  let pose = null;
  /** The blob shadow's strength standing and lifted. */
  let blobOpacity = { opacity: 0.16, lifted: 0.3 };
  /** The blob as last set, for ?test: where, its radius, strength and soft edge, and the held look's share. */
  const blobNow = { x: 0, z: 0, radius: BLOB_STANDING / 2, alpha: 0, soft: 0, held: 0 };
  /** The floor ring as last placed, for ?test: its centre, radius (world units, and texels where it is), strength and the view's elevation over it. */
  const ringNow = { visible: false, x: 0, z: 0, radius: MARKER.size / 2, texels: 0, alpha: 0, elevation: 0 };
  const ringAt = new THREE.Vector3();
  const lineX = new THREE.Vector3();
  const lineY = new THREE.Vector3();
  const lineZ = new THREE.Vector3();
  const lineMid = new THREE.Vector3();
  /** The camera's yaw the light was last turned to. */
  let lightYaw = 0;
  /** The camera's zoom (setZoomScale: NEWT's size on screen over the default view's). */
  let zoom = 1;
  /** The block the zoom holds (pixels.js blockAt's `held`: 0, none yet). */
  let heldBlock = 0;
  /** The stage as last measured: CSS px and the device pixel ratio. */
  let size = { cssW: 1, cssH: 1, dpr: 1 };
  const governor = createGovernor();
  /** performance.now() at the last frame drawn (-1: none yet). */
  let lastFrame = -1;
  /** NEWT: the scene's child the stage didn't add (setSubject names him). */
  let subject = /** @type {any} */ (null);
  const own = new Set();
  const up = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const toLight = new THREE.Vector3();
  /** The visible decals' corners this frame and the dust's box's, for the pass's area (scratch: reused). */
  const corners = Array.from({ length: 16 }, () => new THREE.Vector3());
  /** @type {any[]} */
  const extra = [];

  /**
   * The sun where the look puts it, turned with the camera's yaw and the look's own turn (Light
   * Angle, a Shader option), and its shadow camera fitted.
   */
  function placeSun() {
    const d = lightDir(current.preset.sun.dir, lightYaw + ((current.preset.sun.turn ?? 0) * Math.PI) / 180);
    sun.target.position.set(0, 0, 0);
    sun.position.set(d.x, d.y, d.z).normalize().multiplyScalar(12);
    fitShadow(sun, bounds, LIFT + NEWT_HEIGHT);
  }

  /** The look preset's lights, shadows, background, floor, decals and pass. */
  function applyLook() {
    const { preset: p, look: l } = current;
    hemi.color.setStyle(p.hemi.sky, THREE.SRGBColorSpace);
    hemi.groundColor.setStyle(p.hemi.ground, THREE.SRGBColorSpace);
    hemi.intensity = p.hemi.intensity;
    sun.color.setStyle(p.sun.color, THREE.SRGBColorSpace);
    sun.intensity = p.sun.intensity * (p.sun.strength ?? 1);
    // (three recompiles the materials when the type changes; a new size needs new maps.)
    renderer.shadowMap.type = SHADOW_TYPES[p.shadow.type] ?? THREE.BasicShadowMap;
    if (sun.shadow.mapSize.x !== p.shadow.mapSize) {
      sun.shadow.mapSize.set(p.shadow.mapSize, p.shadow.mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapPass?.dispose();
      sun.shadow.mapPass = null;
    }
    sun.shadow.bias = p.shadow.bias;
    sun.shadow.normalBias = p.shadow.normalBias;
    sun.shadow.radius = p.shadow.radius;
    floor.setLook(p);
    const f = floorLook(p);
    blob.material.color.setHex(f.blob.color, THREE.SRGBColorSpace);
    blobOpacity = f.blob;
    blob.material.opacity = f.blob.opacity;
    container.style.backgroundColor = `#${f.background.toString(16).padStart(6, '0')}`;
    marker.material.color.setStyle(p.marker.color, THREE.SRGBColorSpace);
    line.material.color.setStyle(p.marker.color, THREE.SRGBColorSpace);
    dust.setColor(p.marker.color);
    retro.setParams(p, l);
    container.dataset.pixel = l.pixelSize;
    placeSun();
  }

  /**
   * The floor ring at (x, z) (null: hidden), `across` world units across at least, `k` of its
   * strength times `fade`: its centre snapped to the texel grid and its radius at least
   * RING.minTexels texels where it is (ring.js), the quad just big enough for it.
   * @param {import('./types.js').XZ|null} at
   * @param {number} across
   * @param {number} k
   * @param {number} fade
   */
  function placeRing(at, across, k, fade) {
    const strength = Math.min(1, Math.max(0, k)) * fade;
    marker.visible = Boolean(at) && strength > 0;
    if (!at || !marker.visible) {
      Object.assign(ringNow, { visible: false, alpha: 0, elevation: at ? elevationAt(camera.position, at) : 0 });
      return;
    }
    const y = marker.position.y;
    const mid = snapToTexel(at, camera, grid, y);
    const texel = texelSize(camera.position.distanceTo(ringAt.set(mid.x, y, mid.z)), camera.fov, grid.h);
    const radius = ringRadius(across / 2, texel);
    const elevation = elevationAt(camera.position, mid);
    marker.position.set(mid.x, y, mid.z);
    // (Room for Off's smooth edge, half a texel out, where the floor runs away from the camera
    // and a texel spans more of it.)
    marker.scale.setScalar(2 * (radius + (2 * texel) / Math.max(0.15, Math.sin(elevation))));
    ringMat.uniforms.uRingCentre.value.set(mid.x, mid.z);
    ringMat.uniforms.uRingRadius.value = radius;
    marker.material.opacity = MARKER.opacity * strength;
    Object.assign(ringNow, {
      visible: true,
      x: mid.x,
      z: mid.z,
      radius,
      texels: radius / texel,
      alpha: strength,
      elevation,
    });
  }

  /**
   * The camera at `pose` (the default view's when there's none yet), its projection shifted so
   * the point it looks at shows in the middle of the space over the toolbar.
   */
  function placeCamera() {
    if (!view) return;
    const p = pose ?? { position: view.position, target: view.target };
    camera.position.set(p.position.x, p.position.y, p.position.z);
    camera.lookAt(p.target.x, p.target.y, p.target.z);
    camera.updateMatrixWorld();
    const yaw = Math.atan2(p.position.x - p.target.x, p.position.z - p.target.z);
    if (Math.abs(yaw - lightYaw) > 1e-5) {
      lightYaw = yaw;
      placeSun();
    }
  }

  /** The grid for the stage as measured, the zoom, the block it holds and the governor's level. */
  function gridNow() {
    return texelGrid({
      ...size,
      pixelSize: current.look.pixelSize,
      devW: device?.w,
      devH: device?.h,
      zoom,
      held: heldBlock,
      coarser: governOn ? governor.level : 0,
    });
  }

  /** The Pixel Size's own grid for the stage: at the default zoom, without the governor. */
  function homeGrid() {
    return texelGrid({ ...size, pixelSize: current.look.pixelSize, devW: device?.w, devH: device?.h });
  }

  /** Size the canvas, the pass and the camera to the stage. */
  function resize() {
    const cssW = container.clientWidth;
    const cssH = container.clientHeight;
    if (!cssW || !cssH) return;
    const dpr = window.devicePixelRatio || 1;
    const was = grid;
    size = { cssW, cssH, dpr };
    grid = gridNow();
    heldBlock = grid.pd - grid.coarser;
    // (Setting a canvas's size clears it, even to the same size: a refit that only moves the
    // view, the Look sheet opening, keeps the picture until the next frame.)
    if (!view || grid.w !== was.w || grid.h !== was.h) {
      renderer.setSize(grid.w, grid.h, false);
      retro.setSize(grid.w, grid.h);
    }
    canvas.style.width = `${grid.canvasW}px`;
    canvas.style.height = `${grid.canvasH}px`;
    // (On a desktop the play area and his body at its rim all show.)
    const area = (bounds.r ?? 0) + NEWT_RADIUS;
    view = frameView({ cssW, cssH, grid, insets: insets(), focus: focus?.(), area });
    camera.fov = view.fov;
    camera.near = view.near;
    camera.far = view.far;
    // (setViewOffset sets the aspect too: the canvas's.)
    camera.setViewOffset(grid.canvasW, grid.canvasH, -view.shift.x, -view.shift.y, grid.canvasW, grid.canvasH);
    placeCamera();
    onResize?.({ grid, view, home: homeGrid() });
  }

  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.devicePixelContentBoxSize?.[0];
    device = box ? { w: box.inlineSize, h: box.blockSize } : null;
    resize();
  });
  try {
    observer.observe(container, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(container);
  }

  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  own.add(floor.mesh).add(hemi).add(sun).add(sun.target).add(blob).add(marker).add(line).add(dust.mesh);
  const decals = [blob, marker];
  /** NEWT, once he's in the scene (the one child the stage didn't add), or null. */
  function subjectNow() {
    if (subject?.parent === scene) return subject;
    subject = null;
    for (const o of scene.children) if (!own.has(o)) subject = o;
    return subject;
  }

  /** The retro pass's boxes round NEWT this frame (retro.js subjectBoxes), or none before he's in. */
  function placeBoxes() {
    const s = subjectNow();
    if (!s) return retro.setBoxes(null);
    const m = s.matrixWorld.elements;
    up.set(m[4], m[5], m[6]).normalize();
    centre.setFromMatrixPosition(s.matrixWorld).addScaledVector(up, SUBJECT.up);
    toLight.copy(sun.position).sub(sun.target.position).normalize();
    // (The blob and the marker show over the floor wherever they are: the area takes them in.)
    extra.length = 0;
    for (let i = 0; i < decals.length; i++) {
      const d = decals[i];
      if (!d.visible || !(d.material.opacity > 0)) continue;
      const r = /** @type {any} */ (d.geometry.parameters.width / 2) * d.scale.x;
      for (let j = 0; j < 4; j++)
        extra.push(
          corners[i * 4 + j].set(d.position.x + (j & 1 ? r : -r), d.position.y, d.position.z + (j & 2 ? r : -r)),
        );
    }
    // (The dust round his feet, as high as it rises.)
    if (dustBox)
      for (let j = 0; j < 8; j++)
        extra.push(
          corners[8 + j].set(
            j & 1 ? dustBox.maxX : dustBox.minX,
            j & 4 ? dustBox.top : 0,
            j & 2 ? dustBox.maxZ : dustBox.minZ,
          ),
        );
    retro.setBoxes(
      subjectBoxes({ center: centre, radius: SUBJECT.radius, light: toLight, camera, w: grid.w, h: grid.h, extra }),
    );
  }

  // --- ?perf: the frame times, the GPU's time and the grid in a corner.
  const perfEl = showPerf ? document.createElement('output') : null;
  const perfFrames = new Float64Array(PERF_FRAMES);
  const perfSorted = new Float64Array(PERF_FRAMES);
  let perfCount = 0;
  let perfAt = 0;
  let gpuMs = 0;
  /** @type {any} */
  let timerExt = null;
  /** @type {any[]} the GPU timer queries still to read */
  const pending = [];
  const gl = renderer.getContext();
  if (perfEl) {
    perfEl.className = 'inv-perf';
    perfEl.setAttribute('aria-hidden', 'true');
    container.append(perfEl);
    timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }
  /** The frame times of the last PERF_FRAMES frames: their p50 and p90, ms. */
  function perfTimes() {
    const n = Math.min(perfCount, PERF_FRAMES);
    perfSorted.set(perfFrames);
    return { p50: percentile(perfSorted, n, 0.5), p90: percentile(perfSorted, n, 0.9) };
  }
  /** The GPU timer queries that have come back, into gpuMs (eased). */
  function readTimers() {
    while (pending.length) {
      const q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gpuMs = gpuMs ? gpuMs + (ms - gpuMs) * 0.1 : ms;
      }
      gl.deleteQuery(q);
      pending.shift();
    }
  }
  /**
   * ?perf's line, every PERF_EVERY ms.
   * @param {number} now
   */
  function writePerf(now) {
    if (!perfEl || now - perfAt < PERF_EVERY) return;
    perfAt = now;
    const { p50, p90 } = perfTimes();
    const gpu = timerExt ? ` · GPU ${gpuMs.toFixed(1)} ms` : '';
    const gov = governOn ? (grid.coarser ? ` (+${grid.coarser} slow)` : '') : ' · governor off';
    perfEl.textContent =
      `${p50 > 0 ? Math.round(1000 / p50) : 0} fps · p50 ${p50.toFixed(1)} · p90 ${p90.toFixed(1)} ms${gpu}\n` +
      `${grid.w}×${grid.h} texels · ${grid.pd} px a texel${gov} · zoom ${zoom.toFixed(2)}`;
  }

  applyLook();
  resize();

  return {
    renderer,
    scene,
    camera,
    canvas,
    floor,
    blob,
    marker,
    get grid() {
      return grid;
    },
    get view() {
      return view;
    },
    /**
     * The default view's disc round the play area's middle: the framing's and the shadow
     * camera's size (where NEWT may go is the play area itself: main.js).
     */
    get bounds() {
      return bounds;
    },
    /**
     * The play area (area.js viewArea): the disc goes round its middle, and the light's shadow
     * camera with it.
     * @param {import('./types.js').Bounds} area
     */
    setArea(area) {
      const at = { x: (area.minX + area.maxX) / 2, z: (area.minZ + area.maxZ) / 2 };
      const was = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
      if (Math.abs(at.x - was.x) + Math.abs(at.z - was.z) < 1e-9) return;
      bounds = playArea(bounds.r, at);
      placeSun();
    },
    /**
     * Put the camera at `p` (camera.js orbitPose): where it is and the point it looks at.
     * @param {{position: import('./types.js').XYZ, target: import('./types.js').XYZ}} p
     */
    setCamera(p) {
      pose = p;
      placeCamera();
    },
    /**
     * The blob shadow under him: at (x, z), `lift` 0 standing to 1 lifted high (stronger); with
     * `held` (cues.js blobLook, and `w`, how far it's eased in: blobWeight), off the floor as
     * blobLook has it, its radius, strength and soft edge, `w` of the way from the standing one.
     * @param {number} x
     * @param {number} z
     * @param {number} lift
     * @param {{radius: number, alpha: number, soft: number, w: number}|null} [held]
     */
    setBlob(x, z, lift, held = null) {
      const k = Math.min(1, Math.max(0, lift));
      const w = held ? Math.min(1, Math.max(0, held.w)) : 0;
      const standing = blobOpacity.opacity + (blobOpacity.lifted - blobOpacity.opacity) * k;
      const radius = BLOB_STANDING / 2 + ((held?.radius ?? 0) - BLOB_STANDING / 2) * w;
      const alpha = standing + ((held?.alpha ?? 0) - standing) * w;
      blob.position.x = x;
      blob.position.z = z;
      blob.scale.setScalar(radius * 2);
      blob.material.opacity = alpha;
      blobMat.uniforms.uBlobHeld.value = w;
      blobMat.uniforms.uBlobSoft.value = held?.soft ?? 0.15;
      Object.assign(blobNow, { x, z, radius, alpha, soft: held?.soft ?? 0, held: w });
    },
    /** The blob as last set (setBlob), for ?test. */
    get blobState() {
      return { ...blobNow };
    },
    /** The look's blob strength while he's lifted (floor.js floorLook's blob.lifted). */
    get blobLifted() {
      return blobOpacity.lifted;
    },
    /**
     * The marker ring on the floor at (x, z), `across` world units across and `k` of its strength
     * (0..1), or hidden (null): where the pointer meets the floor, or under him while he's held.
     * @param {import('./types.js').XZ|null} at
     * @param {number} [across]
     * @param {number} [k]
     */
    setMarker(at, across = MARKER.size, k = 1) {
      placeRing(at, across, k, 1);
    },
    /**
     * The cursor marker: the ring where the pointer meets the floor (null: hidden), MARKER.size
     * across, faded out as the view gets low over it (ring.js markerFade).
     * @param {import('./types.js').XZ|null} at
     */
    setPointerMarker(at) {
      placeRing(at, MARKER.size, 1, at ? markerFade(elevationAt(camera.position, at)) : 0);
    },
    /** The ring as last placed, for ?test: shown, its centre, radius (world units and texels), strength and the view's elevation over it (radians). */
    get markerState() {
      return { ...ringNow };
    },
    /**
     * The dashed drop line from `top` (his collar) down to `bottom` (the ring on the floor), `k`
     * of its strength (0 hides it): DASH.width texels wide and dashed in texels where it is,
     * turned to face the camera.
     * @param {import('./types.js').XYZ} top
     * @param {import('./types.js').XYZ} bottom
     * @param {number} k
     */
    setLine(top, bottom, k) {
      lineY.set(top.x - bottom.x, top.y - bottom.y, top.z - bottom.z);
      const len = lineY.length();
      line.visible = k > 0 && len > 1e-3;
      if (!line.visible) return;
      lineMid.set((top.x + bottom.x) / 2, (top.y + bottom.y) / 2, (top.z + bottom.z) / 2);
      // (A texel's world size where the line is: the view's height there over the texels down.)
      const far = lineMid.distanceTo(camera.position);
      const texel = (2 * far * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, grid.h);
      lineZ.copy(camera.position).sub(lineMid);
      lineX.crossVectors(lineY, lineZ).normalize();
      if (!(lineX.lengthSq() > 0)) lineX.set(1, 0, 0);
      lineZ.crossVectors(lineX, lineY).normalize();
      lineX.multiplyScalar(DASH.width * texel);
      line.matrix.makeBasis(lineX, lineY, lineZ).setPosition(bottom.x, bottom.y + 0.003, bottom.z);
      line.matrixWorldNeedsUpdate = true;
      const map = /** @type {THREE.Texture} */ (line.material.map);
      map.repeat.set(1, len / ((DASH.on + DASH.off) * texel));
      line.material.opacity = MARKER.opacity * Math.min(1, k);
    },
    /** The drop line as last set, for ?test: shown, and its strength. */
    get lineState() {
      return { visible: line.visible, alpha: line.visible ? line.material.opacity / MARKER.opacity : 0 };
    },
    /**
     * The dust he raises landing, this frame (dust.js dustPuffs: each puff's middle, radius and
     * strength): drawn on the decal layer (dustLayer.js), the retro pass's area grown to take it in.
     * @param {readonly import('./dust.js').PuffNow[]} puffs
     */
    setDust(puffs) {
      dust.set(puffs);
      dustBox = dustBounds(/** @type {import('./dust.js').PuffNow[]} */ (puffs));
    },
    /** The dust as last set, for ?test: how many puffs, and their box (null: none). */
    get dustState() {
      return { count: dust.count, box: dustBox ? { ...dustBox } : null };
    },
    /**
     * The screen shake's offset, CSS px (camera.js shakeOffset): the canvas moved by it, rounded
     * to device pixels so its texels stay whole (the stage behind is the paper's colour, so an
     * edge it uncovers never shows); 0, 0 puts it back. The camera and the orbit never move.
     * @param {number} x
     * @param {number} y
     */
    setShake(x, y) {
      const d = size.dpr || 1;
      // (+ 0: a -0 rounded from a small negative is 0.)
      const sx = Number.isFinite(x) ? Math.round(x * d) / d + 0 : 0;
      const sy = Number.isFinite(y) ? Math.round(y * d) / d + 0 : 0;
      if (sx === shakeNow.x && sy === shakeNow.y) return;
      shakeNow.x = sx;
      shakeNow.y = sy;
      canvas.style.transform = sx || sy ? `translate(${sx}px, ${sy}px)` : '';
    },
    /** The shake's offset as last set, CSS px, for ?test. */
    get shakeState() {
      return { ...shakeNow };
    },
    /**
     * The dithered highlight on NEWT while the pointer is over him: 0 off to 1 full (retro.js
     * setHover: a rim in the pixel look, a tint in his materials at Off).
     * @param {number} k
     */
    setHover(k) {
      retro.setHover(k);
    },
    /**
     * The dither ring where he was grabbed: client px, radius in texels, 0 gone to 1 full
     * (retro.js setBurst: none until the pass has a target and the canvas a size).
     * @param {number} x
     * @param {number} y
     * @param {number} r
     * @param {number} k
     */
    setBurst(x, y, r, k) {
      retro.setBurst(x, y, r, k);
    },
    /**
     * What the look has set live, for ?test: the post shader's values, the light's strength
     * and its angle round him (degrees, from the camera's yaw: Light Angle), and the shadow's
     * strength on the floor.
     */
    lookState() {
      const u = retro.uniforms;
      const d = lightDir(current.preset.sun.dir, 0);
      const s = sun.position.clone().sub(sun.target.position);
      const turn = Math.atan2(s.x, s.z) - Math.atan2(d.x, d.z) - lightYaw;
      const deg = Math.round((((((turn * 180) / Math.PI + 180) % 360) + 360) % 360) - 180);
      return {
        levels: u.uLevels.value,
        dither: u.uDither.value,
        outline: u.uOutline.value ? u.uDarken.value : 0,
        ink: u.uInk.value.getHexString(THREE.LinearSRGBColorSpace),
        ring: u.uOutside.value > 0,
        shadeSoft: u.uShadeSoft.value,
        shadeSteps: u.uShadeSteps.value,
        shadow: floor.mesh.material.opacity,
        saturation: u.uSat.value,
        exposure: u.uExposure.value,
        contrast: u.uContrast.value,
        tint: u.uTint.value.getHexString(THREE.LinearSRGBColorSpace),
        light: sun.intensity,
        turn: deg === -180 ? 180 : deg,
        // (The grid as drawn: the governor's coarser texels and the zoom.)
        governor: { on: governOn, level: grid.coarser, p90: governor.p90 },
        zoom,
        pd: grid.pd,
      };
    },
    /**
     * Switch the look live (presets, Pixel Size, Dithering, Outlines, the Shader options).
     * @param {import('./look.js').LookPreset} p
     * @param {import('./look.js').Look} l
     */
    setLook(p, l) {
      // (Only the Pixel Size changes the grid: every Style draws on the same one. A new one
      // starts the governor afresh: the user's choice shows first.)
      const resized = l.pixelSize !== current.look.pixelSize;
      current = { preset: p, look: l };
      applyLook();
      if (!resized) return;
      governReset(governor);
      heldBlock = 0;
      resize();
    },
    /**
     * The camera's zoom: k, NEWT's size on screen over the default view's (the orbit's home
     * distance over its distance). At a resolution the texel follows it (pixels.js blockAt), so
     * he keeps the chosen sprite resolution; the grid is refitted only when the block changes.
     * Native and Off don't change. Cheap to call every frame.
     * @param {number} k
     */
    setZoomScale(k) {
      const next = k > 0 && Number.isFinite(k) ? Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, k)) : 1;
      if (next === zoom) return;
      zoom = next;
      const n = resolutionOf(current.look.pixelSize);
      if (n !== null && blockAt(n, size.cssW, size.cssH, size.dpr, zoom, heldBlock) !== heldBlock) resize();
      else grid.zoom = zoom;
    },
    /** The camera's zoom the stage has (setZoomScale's k). */
    get zoomScale() {
      return zoom;
    },
    /**
     * Name NEWT for the pass's boxes (without it, the one child of the scene the stage didn't add).
     * @param {any} o  a THREE.Object3D
     */
    setSubject(o) {
      subject = o;
    },
    /**
     * Turn the frame-time governor on or off (off: the user's Pixel Size exactly).
     * @param {boolean} on
     */
    setGovern(on) {
      if (on === governOn) return;
      governOn = on;
      governReset(governor);
      resize();
    },
    /** The governor and the frame times, for ?test and ?perf. */
    perfState() {
      const { p50, p90 } = perfTimes();
      return {
        governor: { on: governOn, level: grid.coarser, p90: governor.p90 },
        zoom,
        pd: grid.pd,
        p50,
        p90,
        gpu: timerExt ? gpuMs : null,
      };
    },
    refit: resize,
    /**
     * The ray through a client point (on the canvas's own rect, which is larger than the
     * stage): its origin and unit direction, world units.
     * @param {number} x
     * @param {number} y
     */
    ray(x, y) {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -(((y - rect.top) / rect.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      return { o: raycaster.ray.origin.clone(), d: raycaster.ray.direction.clone() };
    },
    /**
     * Where a client point meets the floor, or null off it.
     * @param {number} x
     * @param {number} y
     * @returns {import('./types.js').XZ|null}
     */
    floorPoint(x, y) {
      const { o, d } = this.ray(x, y);
      raycaster.ray.set(o, d);
      if (!raycaster.ray.intersectPlane(FLOOR, hit)) return null;
      if (Math.abs(hit.x) > FLOOR_SIZE / 2 || Math.abs(hit.z) > FLOOR_SIZE / 2) return null;
      return { x: hit.x, z: hit.z };
    },
    /**
     * Compile ahead the programs of the retro pass's other path (retro.js warm): call once
     * everything that draws is in the scene. Resolves once they're ready.
     */
    warm: () => retro.warm(scene, camera),
    /**
     * Draw a frame: the shadow map once, the colour pass, the retro pass (its boxes round NEWT
     * first). The time since the last frame goes to the governor, which may refit the grid.
     */
    render() {
      const now = performance.now();
      if (lastFrame >= 0) {
        const ms = now - lastFrame;
        if (perfEl && ms < 250) perfFrames[perfCount++ % PERF_FRAMES] = ms;
        if (governOn && !grid.off) {
          const was = governor.level;
          if (governStep(governor, ms) !== was) resize();
        }
      }
      lastFrame = now;
      placeBoxes();
      dust.setPixel(!grid.off);
      let timer = null;
      if (timerExt && pending.length < 4) {
        timer = gl.createQuery();
        gl.beginQuery(timerExt.TIME_ELAPSED_EXT, timer);
      }
      renderer.shadowMap.needsUpdate = true;
      retro.render(scene, camera);
      if (timer) {
        gl.endQuery(timerExt.TIME_ELAPSED_EXT);
        pending.push(timer);
      }
      if (timerExt) readTimers();
      writePerf(now);
    },
    dispose() {
      observer.disconnect();
      perfEl?.remove();
      for (const q of pending) gl.deleteQuery(q);
      renderer.setAnimationLoop(null);
      retro.dispose();
      floor.dispose();
      for (const m of [blob, marker, line]) {
        m.geometry.dispose();
        m.material.map?.dispose();
        m.material.dispose();
      }
      dust.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
