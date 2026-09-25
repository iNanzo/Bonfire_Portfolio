// Always-on pixel-art bonfire behind the whole site.
//
// Render passes per frame (all at low resolution):
//   1. normals  — outlined solid geometry → view-space normals + depth
//   2. color    — solid geometry + "ghost" emissives (candle flames, dissolving
//                 weapons) → linear color + depth
//   3. fx       — particle fire + sparks, additive, depth-tested by hand against
//                 pass 2's depth
//   4. pixel    — outlines, + fx, vignette, Bayer dither, palette → canvas
import * as THREE from 'three';
import { createResourceScope } from './resources.js';
import { weapons as weaponNames } from '../content.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { createPixelPass } from './pixelPass.js';
import { createFlame, createParticleMaterial, createEffectMaterial } from './flame.js';
import { createInteraction, MODES } from './interaction.js';
import { createFireflies } from './fireflies.js';
import { createTerrain } from './terrain.js';
import { createImpactFx, createSmokeMaterial } from './impact.js';
import { createCurlField } from './curl.js';
import { createWeapons } from './weapons.js';
import { getPov } from './povs.js';
import { base, flames, defaultFlame, scenePalette, debugPalettes, mixFlame, flameEase } from '../palette.js';

const BASE = import.meta.env.BASE_URL;
const LAYER_SOLID = 0;
const LAYER_FX = 1;
const LAYER_GHOST = 2;
const FLAME_FPS = 12;
const LIGHT_FPS = 12;
const FIRE_ORIGIN = new THREE.Vector3(0.02, 0.12, 0.02);
const WEAPON_ANCHOR = new THREE.Vector3(0.04, 0, 0.03);

const PIXEL_SIZES = [2, 3, 4, 6];
const DEBUG_PALETTES = Object.keys(debugPalettes);
const DITHER_LEVELS = [0.16, 0.26, 0.08, 0];
const MATRIX_SIZES = [4, 8];

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const hash = (n) => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };

export function createBonfire(container, { reducedMotion = false, onImpact, onRamp, onError } = {}) {
  const scope = createResourceScope();
  const events = new AbortController();
  scope.cleanup(() => events.abort());
  try {
  const coarse = matchMedia('(pointer: coarse)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  scope.own(renderer);
  scope.cleanup(() => renderer.setAnimationLoop(null));
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.className = 'bonfire-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  scope.cleanup(() => canvas.remove());
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    scope.dispose();
    onError?.(new Error('WebGL context lost'));
  }, { signal: events.signal });

  const scene = scope.trackTree(new THREE.Scene());
  const voidColor = new THREE.Color(base.void);
  scene.fog = new THREE.Fog(voidColor, 5, 9.5);

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 40);

  // --- Lights
  scene.add(new THREE.HemisphereLight(0x3a3f58, 0x07070b, 0.18));
  const moon = new THREE.DirectionalLight(0x6f7fb0, 0.22);
  moon.position.set(-3, 5, -4);
  scene.add(moon);

  const fireLight = new THREE.PointLight(0xff8a3c, 9, 0, 1.6);
  fireLight.position.set(0, 0.95, 0.28); // slightly in front, so the weapon's face catches light
  fireLight.castShadow = renderer.shadowMap.enabled;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.bias = -0.004;
  fireLight.shadow.camera.near = 0.05;
  fireLight.shadow.camera.far = 10;
  scene.add(fireLight);

  const candleLight = new THREE.PointLight(0xffb25a, 0.35, 2.5, 1.8);
  scene.add(candleLight);

  // --- Render targets
  const rtOpts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
  const normalRT = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthTexture: new THREE.DepthTexture(1, 1) });
  const fxRT = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, type: THREE.HalfFloatType, depthBuffer: false });
  const normalMaterial = new THREE.MeshNormalMaterial({ flatShading: true });
  const pass = createPixelPass();
  [colorRT, normalRT, fxRT, normalMaterial].forEach((r) => scope.own(r));
  scope.trackTree(pass.scene);
  pass.uniforms.tColor.value = colorRT.texture;
  pass.uniforms.tDepth.value = colorRT.depthTexture;
  pass.uniforms.tNormal.value = normalRT.texture;
  pass.uniforms.tNormalDepth.value = normalRT.depthTexture;
  pass.uniforms.tFx.value = fxRT.texture;
  pass.uniforms.cameraNear.value = camera.near;
  pass.uniforms.cameraFar.value = camera.far;

  // --- Fire particles
  const particleMaterial = createParticleMaterial(colorRT.depthTexture, pass.uniforms.resolution.value);
  const effectMaterial = createEffectMaterial(particleMaterial);
  scope.own(particleMaterial); scope.own(effectMaterial);
  const field = createCurlField();
  const fire = createFlame({
    field,
    count: coarse ? 1000 : 2200,
    sparks: coarse ? 24 : 48,
    material: particleMaterial,
    origin: FIRE_ORIGIN,
    reducedMotion,
  });
  if (reducedMotion) Object.assign(fire.params, { rise: 0.6, curlAmp: 0.35 });
  fire.flame.layers.set(LAYER_FX);
  fire.spark.layers.set(LAYER_FX);
  scene.add(fire.flame, fire.spark);
  let fireflies = null; // created once the model (and the firefly model) loads
  let fx = null;        // ground flames, smoke and ash for weapon impacts
  const smokeMaterial = scope.own(createSmokeMaterial());
  const interaction = createInteraction({ reducedMotion });

  let weapons = null; // set once the model loads

  // --- Flame color state: eased blends between flames (see flameEase)
  let flameKey = defaultFlame;
  let blend = null; // { from, to, t }
  let blendMul = 1;
  let debugPaletteIndex = 0;
  let currentRamp = flames[flameKey].ramp;
  const BLEND_TIME = reducedMotion ? 0.4 : 1.25;
  const white = new THREE.Color('#ffffff');
  // Keep the cast light less saturated than the flame so lit stone lands on the
  // dark tinted shade, with the ramp's mid tone only in hot spots.
  const lightMix = (key) => (key === 'ember' ? 0.25 : 0.34);
  // While a weapon is being forged, the next flame's colors join the palette so
  // the forge particles and the new weapon's glow can actually show them; after
  // the impact, the flame being blended to stays in until the blend is done.
  let forgeFlame = null;
  const paletteExtra = () => flames[forgeFlame] ?? (blend ? flames[blend.to] : null);
  let currentShade = flames[flameKey].shade;
  let currentMix = lightMix(flameKey);
  function applyColors(f, mix) {
    currentRamp = f.ramp;
    currentShade = f.shade;
    currentMix = mix;
    fire.setRamp(f.ramp);
    pass.uniforms.uCore.value.set(f.ramp[3]);
    if (debugPaletteIndex === 0) {
      const extra = paletteExtra();
      pass.setPalette(extra ? [...scenePalette(f), ...extra.ramp, extra.shade] : scenePalette(f));
    }
    fireLight.color.set(f.ramp[1]).lerp(white, mix);
    onRamp?.(f.ramp);
  }
  applyColors(flames[flameKey], lightMix(flameKey));

  // --- Model
  const candleFlames = [];
  const glows = [];
  let ready = false;
  let targetLevel = 1;
  let shake = 0;

  const draco = scope.own(new DRACOLoader());
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const modelLoaded = loader.loadAsync(`${BASE}models/bonfire.glb`).then((gltf) => {
    const root = gltf.scene;
    if (scope.disposed) {
      const late = createResourceScope();
      late.trackTree(root); late.dispose();
      return;
    }
    scope.trackTree(root);
    const required = ['Firefly', ...Object.keys(weaponNames).map((key) => 'Weapon_' + key)];
    for (const name of required) {
      if (!root.getObjectByName(name)) throw new Error('Model is missing required node: ' + name);
    }
    for (const name of ['Firefly_Lantern', 'Firefly_Wings']) {
      if (!root.getObjectByName(name)) throw new Error('Model is missing required node: ' + name);
    }
    root.updateMatrixWorld(true);
    weapons = createWeapons(root, {
      anchor: WEAPON_ANCHOR,
      layerSolid: LAYER_SOLID,
      layerGhost: LAYER_GHOST,
      layerFx: LAYER_FX,
      particleMaterial: effectMaterial,
      field,
      particles: coarse ? 320 : 640,
      castShadows: renderer.shadowMap.enabled,
      reducedMotion,
      hooks: {
        // The fire sinks while the weapon is forged, and every firefly lights up.
        onSwapStart: (selection) => {
          const nextFlame = selection.flame;
          targetLevel = 0.6;
          forgeFlame = nextFlame;
          // A blend still running from the last swap finishes quickly, so the
          // palette has room for the next flame.
          if (blend) blend.fast = true;
          applyColors({ ramp: currentRamp, shade: currentShade }, currentMix);
        },
        // The new weapon finishing its form lands like a hit: a jolt and a flare.
        onFormed: () => {
          if (!reducedMotion) shake = Math.max(shake, 0.14);
          fire.burst(0.45);
        },
        onImpact: impact,
      },
    });

    scope.trackTree(weapons.holder); scope.trackTree(weapons.forge);
    if (weapons.lines) { scope.trackTree(weapons.lines); scene.add(weapons.lines); }
    scope.cleanup(() => weapons.cancel());
    const flyTemplate = root.getObjectByName('Firefly');
    flyTemplate.removeFromParent();
    // Solid scenery: fireflies steer around it with a height map and land on its
    // tops and walls (exact contact points and normals come from raycasts).
    const statics = [];
    root.traverse((o) => { if (o.isMesh && o.name.startsWith('Static_')) statics.push(o); });
    const terrain = createTerrain(renderer, statics);
    const ray = new THREE.Raycaster();
    const normalMatrix = new THREE.Matrix3();
    const raycast = (origin, dir, far) => {
      ray.set(origin, dir);
      ray.far = far;
      const hit = ray.intersectObjects(statics, false)[0];
      if (!hit?.face) return null;
      const normal = hit.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      if (normal.dot(dir) > 0) normal.negate();
      return { point: hit.point.clone(), normal };
    };
    fireflies = createFireflies(flyTemplate, {
      count: coarse ? 12 : 18,
      litCount: coarse ? 6 : 9,
      lightCount: coarse ? 5 : 9,
      center: new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z),
      layer: LAYER_GHOST,
      terrain,
      raycast,
      reducedMotion,
    });
    scope.trackTree(fireflies.group);
    fireflies.setRamp(currentRamp);
    scene.add(fireflies.group);

    const candlePos = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const color = o.material.color.clone();
      if (o.name.startsWith('CandleFlame_') || o.name.startsWith('Glow_')) {
        o.material = new THREE.MeshBasicMaterial({ color, fog: false });
        o.layers.set(LAYER_GHOST);
        if (o.name.startsWith('CandleFlame_')) {
          candleFlames.push({ mesh: o, scale: o.scale.clone() });
          o.getWorldPosition(candlePos);
        } else {
          glows.push(o);
        }
      } else {
        o.material = new THREE.MeshLambertMaterial({ color, flatShading: true });
        o.castShadow = !/Ground|Flagstone/.test(o.name);
        o.receiveShadow = true;
      }
    });
    candleLight.position.copy(candlePos).add(new THREE.Vector3(0.1, 0.25, 0.3));

    // How far a ground flame can run in each direction before it hits something.
    const blockers = [];
    root.traverse((o) => { if (o.isMesh && !/Ground|Flagstone|Ash|Glow|Candle/.test(o.name)) blockers.push(o); });
    const BINS = 96;
    const reachDist = new Float32Array(BINS);
    const rc = new THREE.Raycaster();
    rc.far = 3.8;
    const from = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (let b = 0; b < BINS; b++) {
      const a = (b / BINS) * Math.PI * 2;
      dir.set(Math.cos(a), 0, Math.sin(a));
      let d = 4.6;
      for (const y of [0.07, 0.22]) {
        from.set(FIRE_ORIGIN.x + dir.x * 0.85, y, FIRE_ORIGIN.z + dir.z * 0.85);
        rc.set(from, dir);
        const hit = rc.intersectObjects(blockers, false)[0];
        if (hit) d = Math.min(d, hit.distance + 0.85);
      }
      reachDist[b] = d;
    }
    const reach = (a) => reachDist[Math.round((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * BINS) % BINS];
    fx = createImpactFx({
      fireMaterial: effectMaterial,
      smokeMaterial,
      origin: new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z),
      reach,
      field,
      emitters: coarse ? 90 : 144,
      flames: coarse ? 1500 : 3200,
      haze: coarse ? 700 : 1500,
      smoke: coarse ? 260 : 520,
      ash: coarse ? 110 : 220,
      embers: coarse ? 80 : 160,
      lights: coarse ? 4 : 6,
      reducedMotion,
    });
    for (const object of [fx.ring, fx.embers, fx.wave, fx.haze, fx.puff, fx.flecks]) scope.trackTree(object);
    for (const l of fx.lights) scene.add(l);
    fx.ring.layers.set(LAYER_FX);
    fx.embers.layers.set(LAYER_FX);
    fx.wave.layers.set(LAYER_FX);
    fx.haze.layers.set(LAYER_GHOST);
    fx.puff.layers.set(LAYER_GHOST);
    fx.flecks.layers.set(LAYER_GHOST);
    fx.setRamp(currentRamp);
    scene.add(fx.ring, fx.embers, fx.wave, fx.haze, fx.puff, fx.flecks, weapons.forge);

    scene.add(root, weapons.holder);
    weapons.setRim(currentRamp[2]);
    weapons.set('longsword');
    ready = true;

  });

  // --- Fire level (stoking, UI puffs, weapon impacts)
  let firstStoke = true;
  function stoke() {
    fire.params.level = Math.min(2.4, fire.params.level + 0.9);
    fire.burst(1);
    if (!reducedMotion) shake = 0.18;
    const wasFirst = firstStoke;
    firstStoke = false;
    return wasFirst;
  }
  function puff(amount = 0.3) {
    fire.params.level = Math.min(2, fire.params.level + amount);
    fire.burst(amount * 0.5);
  }
  function impact(selection, weaponKey, stationary = false) {
    const nextFlame = selection.flame;
    const old = flameKey;
    flameKey = nextFlame ?? flameKey;
    blend = { from: old, to: flameKey, t: 0 };
    forgeFlame = null;
    fx.setRamp(flames[flameKey].ramp);
    weapons.setRim(flames[flameKey].ramp[2]); // the new weapon arrives rimmed in its new color
    // The fire erupts, a ring of flame races across the ground with a puff of
    // smoke and ash, and the fireflies scatter.
    fire.params.level = reducedMotion || stationary ? 2 : 3.2;
    targetLevel = 1;
    fire.burst(reducedMotion ? 0.8 : 1.7);
    fx.burst();
    fireflies.burst(flames[flameKey].ramp);
    if (!reducedMotion) shake = 0.3;
    onImpact?.(flameKey, old, stationary, { ...selection, weapon: weaponKey });
  }

  /** Swap weapon + flame color. Resolves at impact. */
  function equip(weaponKey, key, { instant = false, item = null } = {}) {
    return loaded.then(() => {
      if (scope.disposed) return { status: 'cancelled' };
      if (!Object.hasOwn(flames, key)) throw new Error('Unknown flame: ' + key);
      const selection = { weapon: weaponKey, flame: key, item };
      if (instant) {
        weapons.set(weaponKey);
        flameKey = key;
        blend = null;
        forgeFlame = null;
        applyColors(flames[key], lightMix(key));
        weapons.setRim(flames[key].ramp[2]);
        fireflies?.setRamp(flames[key].ramp);
        targetLevel = 1;
        onImpact?.(key, key, true, selection);
        return { status: 'applied' };
      }
      return weapons.swap(weaponKey, flames[flameKey].ramp, flames[key].ramp, selection);
    });
  }

  // --- Camera: point-of-view tweening + snapped sway
  let layout = 'wide';
  const toPose = (p) => ({ pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target), fov: p.fov, sx: p.sx, sy: p.sy });
  const clonePose = (p) => ({ pos: p.pos.clone(), target: p.target.clone(), fov: p.fov, sx: p.sx, sy: p.sy });
  const view = { name: 'home', cur: toPose(getPov('home', layout)), from: null, to: null, t: 1, dur: 1.25 };
  function setView(name, { instant = false } = {}) {
    view.name = name;
    const to = toPose(getPov(name, layout));
    if (instant || reducedMotion) {
      view.cur = to;
      view.t = 1;
    } else {
      view.from = clonePose(view.cur);
      view.to = to;
      view.t = 0;
    }
  }

  // --- Cursor → fire. Each frame the path the cursor traced (screen space) is
  // handed to the interaction model, which moves flames, sparks and fireflies.
  const clock = new THREE.Clock();
  const ptr = { x: 0, y: 0, sx: 0, sy: 0, px: null, py: null, lastMove: -10, inside: false };
  window.addEventListener('pointermove', (e) => {
    // A new burst of movement (or the cursor entering) starts where the cursor
    // is, so it never reads as one huge swing from wherever it last was.
    if (clock.elapsedTime - ptr.lastMove > 0.2 || !ptr.inside) { ptr.px = e.clientX; ptr.py = e.clientY; }
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.sx = (e.clientX / window.innerWidth - 0.5) * 2;
    ptr.sy = (e.clientY / window.innerHeight - 0.5) * 2;
    ptr.lastMove = clock.elapsedTime;
    ptr.inside = true;
  }, { passive: true, signal: events.signal });
  document.documentElement.addEventListener('pointerleave', () => { ptr.inside = false; }, { signal: events.signal });

  const cursor = { ax: 0, ay: 0, bx: 0, by: 0, vx: 0, vy: 0, moving: false, present: false, width: 1, height: 1 };
  function updateCursor(dt, t) {
    const r = canvas.getBoundingClientRect();
    if (ptr.px === null) { ptr.px = ptr.x; ptr.py = ptr.y; }
    const step = Math.max(dt, 1 / 240);
    const moving = t - ptr.lastMove < 0.12 && (ptr.px !== ptr.x || ptr.py !== ptr.y);
    Object.assign(cursor, {
      ax: ptr.px - r.left, ay: ptr.py - r.top,
      bx: ptr.x - r.left, by: ptr.y - r.top,
      vx: moving ? (ptr.x - ptr.px) / step : 0,
      vy: moving ? (ptr.y - ptr.py) / step : 0,
      moving,
      present: ptr.inside && t - ptr.lastMove < 4,
      width: r.width, height: r.height,
    });
    ptr.px = ptr.x;
    ptr.py = ptr.y;
    const sparks = interaction.update(camera, cursor, fx ? [...fire.sets, ...fx.sets] : fire.sets, dt);
    if (sparks.length) fire.emitSparks(sparks);
  }

  // --- Sizing (fixed on-screen pixel size; the render target scales instead)
  const settings = { pixelSize: null, ditherIndex: 0, matrixIndex: 0 };
  let size = { w: 1, h: 1, pd: 4 };
  const isSmall = () => container.clientWidth < 700;
  function resize() {
    if (scope.disposed) return;
    const dpr = window.devicePixelRatio || 1;
    const cssPx = settings.pixelSize ?? (isSmall() ? 3 : 4);
    const pd = Math.max(1, Math.round(cssPx * dpr));
    const w = Math.max(1, Math.ceil((container.clientWidth * dpr) / pd));
    const h = Math.max(1, Math.ceil((container.clientHeight * dpr) / pd));
    size = { w, h, pd };
    renderer.setSize(w, h, false);
    colorRT.setSize(w, h);
    normalRT.setSize(w, h);
    fxRT.setSize(w, h);
    pass.uniforms.resolution.value.set(w, h);
    canvas.style.width = `${(w * pd) / dpr}px`;
    canvas.style.height = `${(h * pd) / dpr}px`;
    camera.aspect = w / h;
    const next = container.clientWidth >= 1100 && w / h > 1.15 ? 'wide' : 'tall';
    if (next !== layout) {
      layout = next;
      setView(view.name, { instant: true });
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  scope.cleanup(() => observer.disconnect());

  // --- Per-frame update
  let flameStep = -1;
  let lightStep = -1;
  let lightFlicker = 1;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const sway = { x: 0, y: 0 };

  function update(dt, t) {
    fire.params.level += (targetLevel - fire.params.level) * Math.min(1, dt * 1.1);

    updateCursor(dt, t);

    // Stepped simulation for a hand-animated look.
    const fs = Math.floor(t * FLAME_FPS);
    if (fs !== flameStep) {
      const steps = flameStep < 0 ? 1 : Math.min(3, fs - flameStep);
      flameStep = fs;
      for (let i = 0; i < steps; i++) fire.stepFlame(1 / FLAME_FPS, t);
      candleFlames.forEach((c, i) => c.mesh.scale.set(c.scale.x, c.scale.y * (0.8 + hash(fs * 1.7 + i * 9.1) * 0.4), c.scale.z));
      // Coals in the ash pulse between the flame's deep, body and bright tones.
      glows.forEach((g, i) => {
        const h = hash(fs * 3.3 + i * 5.7);
        g.material.color.set(currentRamp[h > 0.8 ? 2 : h > 0.3 ? 1 : 0]);
      });
    }
    fire.stepSparks(dt, t);
    fx.step(dt, t);
    fireflies.update(dt, t, camera, cursor, interaction.flowWorld);

    // After a weapon lands: ease from the old flame into the new one, with the
    // light swelling and settling as the color turns over.
    if (blend) {
      blend.t = Math.min(1, blend.t + (dt / BLEND_TIME) * (blend.fast ? 4 : 1));
      const k = flameEase(blend.t);
      applyColors(mixFlame(flames[blend.from], flames[blend.to], k),
        THREE.MathUtils.lerp(lightMix(blend.from), lightMix(blend.to), k));
      blendMul = 1 + Math.sin(blend.t * Math.PI) * 0.35;
      if (blend.t >= 1) {
        blend = null;
        blendMul = 1;
        applyColors(flames[flameKey], lightMix(flameKey));
        fireflies?.setRamp(flames[flameKey].ramp);
      }
    }

    const ls = Math.floor(t * LIGHT_FPS);
    if (ls !== lightStep) {
      lightStep = ls;
      lightFlicker = 0.82 + Math.random() * 0.3;
      candleLight.intensity = 0.28 + Math.random() * 0.12;
    }
    fireLight.intensity = 9 * Math.min(2.6, Math.max(0.3, fire.params.level)) ** 1.3 * lightFlicker * blendMul;

    weapons.update(dt);

    if (view.t < 1) {
      view.t = Math.min(1, view.t + dt / view.dur);
      const k = easeInOut(view.t);
      view.cur.pos.lerpVectors(view.from.pos, view.to.pos, k);
      view.cur.target.lerpVectors(view.from.target, view.to.target, k);
      view.cur.fov = THREE.MathUtils.lerp(view.from.fov, view.to.fov, k);
      view.cur.sx = THREE.MathUtils.lerp(view.from.sx, view.to.sx, k);
      view.cur.sy = THREE.MathUtils.lerp(view.from.sy, view.to.sy, k);
    }
  }

  function applyCamera(dt) {
    const { pos, target, fov, sx, sy } = view.cur;
    camera.fov = fov;
    camera.setViewOffset(size.w, size.h, -Math.round(sx * size.w), Math.round(sy * size.h), size.w, size.h);
    camera.updateProjectionMatrix();

    // Sway toward the cursor, snapped to whole texels at the focal distance so
    // the image never swims between pixels.
    if (!reducedMotion) {
      sway.x += (ptr.sx - sway.x) * Math.min(1, dt * 2.5);
      sway.y += (ptr.sy - sway.y) * Math.min(1, dt * 2.5);
    }
    const dist = pos.distanceTo(target);
    const texel = (2 * dist * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / size.h;
    let ox = sway.x * 0.14;
    let oy = -sway.y * 0.08;
    if (shake > 0) {
      shake -= dt;
      ox += (Math.random() - 0.5) * texel * 4;
      oy += (Math.random() - 0.5) * texel * 4;
    }
    ox = Math.round(ox / texel) * texel;
    oy = Math.round(oy / texel) * texel;
    camera.position.copy(pos);
    camera.quaternion.setFromRotationMatrix(m4.lookAt(pos, target, camera.up));
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(right, ox).addScaledVector(up, oy);
  }

  function renderFrame(dt) {
    if (ready) update(dt, clock.elapsedTime);
    applyCamera(dt);

    scene.overrideMaterial = normalMaterial;
    camera.layers.set(LAYER_SOLID);
    renderer.setRenderTarget(normalRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;

    camera.layers.set(LAYER_SOLID);
    camera.layers.enable(LAYER_GHOST);
    renderer.setRenderTarget(colorRT);
    renderer.setClearColor(voidColor, 1);
    renderer.clear();
    renderer.render(scene, camera);

    camera.layers.set(LAYER_FX);
    renderer.setRenderTarget(fxRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(pass.scene, pass.camera);
  }

  let running = false;
  function syncRunning() {
    const should = ready && !scope.disposed && !document.hidden;
    if (should === running) return;
    running = should;
    if (running) clock.getDelta();
    renderer.setAnimationLoop(running ? () => {
      try { renderFrame(Math.min(clock.getDelta(), 0.1)); }
      catch (error) { scope.dispose(); onError?.(error); }
    } : null);
  }
  document.addEventListener('visibilitychange', syncRunning, { signal: events.signal });
  // Only one readiness promise owns startup failures; callers handle its rejection.
  const loaded = modelLoaded.then(() => { resize(); syncRunning(); }).catch((error) => {
    scope.dispose();
    throw error;
  });

  // --- Debug HUD
  function cycle(what) {
    if (what === 'pixel') {
      const cur = settings.pixelSize ?? (isSmall() ? 3 : 4);
      settings.pixelSize = PIXEL_SIZES[(PIXEL_SIZES.indexOf(cur) + 1) % PIXEL_SIZES.length];
      resize();
    } else if (what === 'palette') {
      debugPaletteIndex = (debugPaletteIndex + 1) % DEBUG_PALETTES.length;
      pass.setPalette(debugPalettes[DEBUG_PALETTES[debugPaletteIndex]] ?? scenePalette({ ramp: currentRamp, shade: flames[flameKey].shade }));
    } else if (what === 'dither') {
      settings.ditherIndex = (settings.ditherIndex + 1) % DITHER_LEVELS.length;
      pass.uniforms.ditherStrength.value = DITHER_LEVELS[settings.ditherIndex];
    } else if (what === 'matrix') {
      settings.matrixIndex = (settings.matrixIndex + 1) % MATRIX_SIZES.length;
      pass.uniforms.ditherScale.value = MATRIX_SIZES[settings.matrixIndex];
    } else if (what === 'interaction') {
      const keys = Object.keys(MODES);
      interaction.mode = keys[(keys.indexOf(interaction.mode) + 1) % keys.length];
    } else if (what === 'outlines') {
      pass.uniforms.outlines.value = pass.uniforms.outlines.value ? 0 : 1;
    }
    return describe();
  }
  function describe() {
    return {
      pixel: `${settings.pixelSize ?? (isSmall() ? 3 : 4)}px (${size.w}×${size.h})`,
      palette: debugPaletteIndex === 0 ? flames[flameKey].name : DEBUG_PALETTES[debugPaletteIndex],
      dither: pass.uniforms.ditherStrength.value ? pass.uniforms.ditherStrength.value.toFixed(2) : 'off',
      matrix: `${pass.uniforms.ditherScale.value}×${pass.uniforms.ditherScale.value}`,
      outlines: pass.uniforms.outlines.value ? 'on' : 'off',
      interaction: MODES[interaction.mode].name,
    };
  }

  /** A click anywhere makes the fireflies flash (brightest near the click). */
  function flash(clientX, clientY) {
    if (!fireflies) return;
    const r = canvas.getBoundingClientRect();
    fireflies.flash(clientX - r.left, clientY - r.top, camera, r.width, r.height);
  }

  return {
    stoke, puff, equip, setView, cycle, describe, flash, ready: loaded,
    dispose: () => scope.dispose(),
    get flame() { return flameKey; },
    get fireflies() { return fireflies; },
    /** Internals for debugging (dev builds expose this as window.__fire). */
    get debug() { return { weapons, fx }; },
    get interaction() { return interaction.mode; },
    set interaction(m) { interaction.mode = m; },
  };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
