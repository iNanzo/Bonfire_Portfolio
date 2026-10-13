// The invitation toy's stage: the renderer (no antialiasing, drawn at texel size: pixels.js
// texelGrid, the canvas stretched by CSS), the camera (20° of view; main.js's orbit camera,
// camera.js, moves it with setCamera; pixels.js frameView gives its default view: 36° up, NEWT
// about a fifth of the short side tall, the whole play area in sight, and the point it looks at
// shown in the middle of the space over the toolbar, by an off-centre projection that holds
// however it turns), the floor (floor.js: no room, the preset's background and an invisible
// floor that only catches his shadows), the lights and shadows of the look preset, the blob
// shadow and the floor marker, and the retro pass. A ResizeObserver refits it all (in device
// pixels where the browser measures them, devicePixelContentBoxSize), and so does refit()
// (main.js calls it when the toolbar resizes).
//
// Lights: a faint HemisphereLight and one DirectionalLight that casts, its shadow camera fitted
// to the play area plus the highest he's lifted (floor.js fitShadow). The shadow map type is
// the preset's (BasicShadowMap for DS: three 0.186 has no PCFSoftShadowMap), drawn once a frame
// (autoUpdate off, needsUpdate before the colour pass), on phones too.
//
// The blob shadow under NEWT and the ring marker under the finger sit on their own layer
// (LAYERS.decal: rays and the shadow pass leave them out) and write no depth, so they make no
// lines; main.js moves them (setBlob: stronger while he's lifted; the marker where the pointer
// meets the floor). `bounds` is the play area (area.js: a fixed disc on the floor).
import * as THREE from 'three';
import { NEWT_HEIGHT, NEWT_RADIUS, playArea } from './area.js';
import { frameView, texelGrid } from './pixels.js';
import { FLOOR_SIZE, createFloor, fitShadow, floorLook } from './floor.js';
import { createRetro, decalMaterial } from './retro.js';

export const LAYERS = { decal: 2 };
/** The highest NEWT is carried, world units (his root): the shadow camera reaches over it. */
export const LIFT = 2.2;
const SHADOW_TYPES = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap };

/**
 * A radial falloff (white, alpha fading out) for the blob shadow.
 * @param {number} n  texels across
 */
function blobTexture(n = 32) {
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = Math.max(0, 1 - r) ** 1.4;
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
/**
 * A pixel ring for the floor marker: two texels thick, nearest.
 * @param {number} n  texels across
 */
function ringTexture(n = 16) {
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2);
      const on = r <= n / 2 - 0.5 && r >= n / 2 - 2.5;
      data.set([255, 255, 255, on ? 255 : 0], (y * n + x) * 4);
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * @typedef {object} StageOptions
 * @property {import('./look.js').LookPreset} preset
 * @property {import('./look.js').Look} look
 * @property {() => import('./pixels.js').Insets} insets  where the floor keeps clear of, CSS px
 * @property {(stage: {grid: import('./pixels.js').Grid, view: import('./pixels.js').View}) => void} [onResize]
 */

/**
 * The stage in `container` (which hides the canvas's overhang: overflow hidden).
 * @param {HTMLElement} container
 * @param {StageOptions} o
 */
export function createStage(container, { preset, look, insets, onResize }) {
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

  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    decalMaterial({ map: blobTexture(), color: 0x000000, opacity: 0.2 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.002;
  blob.renderOrder = 1;
  blob.layers.set(LAYERS.decal);
  const marker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    decalMaterial({ map: ringTexture(), color: 0x000000, opacity: 0.85, alphaTest: 0.5 }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.003;
  marker.renderOrder = 2;
  marker.layers.set(LAYERS.decal);
  marker.visible = false;
  scene.add(blob, marker);

  const retro = createRetro(renderer);
  let current = { preset, look };
  /** @type {import('./pixels.js').Grid} */
  let grid = texelGrid({ cssW: 1, cssH: 1, dpr: 1, pixelSize: look.pixelSize });
  /** @type {import('./pixels.js').View|null} */
  let view = null;
  /** @type {{w: number, h: number}|null} the stage in device pixels, as the browser measured it */
  let device = null;
  /** @type {import('./types.js').Bounds} the play area */
  const bounds = playArea();
  /** @type {{position: import('./types.js').XYZ, target: import('./types.js').XYZ}|null} where main.js put the camera */
  let pose = null;
  /** The blob shadow's strength standing and lifted. */
  let blobOpacity = { opacity: 0.16, lifted: 0.3 };

  /** The look preset's lights, shadows, background, floor, decals and pass. */
  function applyLook() {
    const { preset: p, look: l } = current;
    hemi.color.setStyle(p.hemi.sky, THREE.SRGBColorSpace);
    hemi.groundColor.setStyle(p.hemi.ground, THREE.SRGBColorSpace);
    hemi.intensity = p.hemi.intensity;
    sun.color.setStyle(p.sun.color, THREE.SRGBColorSpace);
    sun.intensity = p.sun.intensity;
    const dir = new THREE.Vector3(...p.sun.dir).normalize();
    sun.target.position.set(0, 0, 0);
    sun.position.copy(dir).multiplyScalar(12);
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
    retro.setParams(p, l);
    container.dataset.pixel = l.pixelSize;
    fitShadow(sun, bounds, LIFT + NEWT_HEIGHT);
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
  }

  /** Size the canvas, the pass and the camera to the stage. */
  function resize() {
    const cssW = container.clientWidth;
    const cssH = container.clientHeight;
    if (!cssW || !cssH) return;
    const dpr = window.devicePixelRatio || 1;
    grid = texelGrid({ cssW, cssH, dpr, pixelSize: current.look.pixelSize, devW: device?.w, devH: device?.h });
    renderer.setSize(grid.w, grid.h, false);
    canvas.style.width = `${grid.canvasW}px`;
    canvas.style.height = `${grid.canvasH}px`;
    retro.setSize(grid.w, grid.h);
    // (The play area and his body at its rim all show.)
    const area = (bounds.r ?? 0) + NEWT_RADIUS;
    view = frameView({ cssW, cssH, grid, insets: insets(), area });
    camera.fov = view.fov;
    camera.near = view.near;
    camera.far = view.far;
    // (setViewOffset sets the aspect too: the canvas's.)
    camera.setViewOffset(grid.canvasW, grid.canvasH, -view.shift.x, -view.shift.y, grid.canvasW, grid.canvasH);
    placeCamera();
    onResize?.({ grid, view });
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
    /** The play area: where NEWT's root may go (a fixed disc). */
    get bounds() {
      return bounds;
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
     * The blob shadow under him: at (x, z), `lift` 0 standing to 1 lifted high (stronger).
     * @param {number} x
     * @param {number} z
     * @param {number} lift
     */
    setBlob(x, z, lift) {
      const k = Math.min(1, Math.max(0, lift));
      blob.position.x = x;
      blob.position.z = z;
      blob.material.opacity = blobOpacity.opacity + (blobOpacity.lifted - blobOpacity.opacity) * k;
    },
    /**
     * Switch the look live (presets, Pixel Size, Dithering, Outlines).
     * @param {import('./look.js').LookPreset} p
     * @param {import('./look.js').Look} l
     */
    setLook(p, l) {
      // (Only the Pixel Size changes the grid: every Style draws on the same one.)
      const resized = l.pixelSize !== current.look.pixelSize;
      current = { preset: p, look: l };
      applyLook();
      if (resized) resize();
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
    /** Draw a frame: the shadow map once, the colour pass, the retro pass. */
    render() {
      renderer.shadowMap.needsUpdate = true;
      retro.render(scene, camera);
    },
    dispose() {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      retro.dispose();
      floor.dispose();
      for (const m of [blob, marker]) {
        m.geometry.dispose();
        m.material.map?.dispose();
        m.material.dispose();
      }
      sun.shadow.map?.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
