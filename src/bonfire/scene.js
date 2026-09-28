// Always-on pixel-art bonfire behind the whole site.
//
// Render passes per frame (all at low resolution):
//   1. normals  — outlined solid geometry → view-space normals + depth
//   2. color    — solid geometry + "ghost" emissives (candle flames, dissolving
//                 weapons) → linear color + depth
//   3. fx       — particle fire + sparks, additive, depth-tested by hand against
//                 pass 2's depth
//   4. pixel    — outlines, + fx, vignette, Bayer dither, palette → canvas
//
// The bonfire has an element — fire, lightning (a tesla ball, plasma.js) or ice
// (glowing shards, ice.js) — that changes when a weapon lands, like the flame
// color. Every element burns in the current flame's colors, and each has its own
// impact: a ring of fire, a ring of lightning, or a ring of ice shards.
import * as THREE from 'three';
import { createResourceScope } from './resources.js';
import { weapons as weaponNames, startingEquipment } from '../content.js';
import { effects } from '../effects.js';
import { ELEMENT_IDS } from '../effectsDefaults.js';
import { elementOr } from '../elements.js';
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
import { createPlasma } from './plasma.js';
import { createLightningRing } from './lightningRing.js';
import { createCrystals, createIceRing } from './ice.js';
import { createChill } from './chill.js';
import { createSwingTrail } from './swingTrail.js';
import { getPov } from './povs.js';
import { base, flames, flameOr, scenePalette, debugPalettes, mixFlame, flameEase } from '../palette.js';

const BASE = import.meta.env.BASE_URL;
const LAYER_SOLID = 0;
const LAYER_FX = 1;
const LAYER_GHOST = 2;
const LIGHT_FPS = 12;
const FIRE_ORIGIN = new THREE.Vector3(0.02, 0.12, 0.02);
const WEAPON_ANCHOR = new THREE.Vector3(0.04, 0, 0.03);

const PIXEL_SIZES = [2, 3, 4, 6];
const DEBUG_PALETTES = Object.keys(debugPalettes);
const DITHER_LEVELS = [0.16, 0.26, 0.08, 0];
const MATRIX_SIZES = [4, 8];

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const hash = (n) => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };

export function createBonfire(container, { reducedMotion = false, sway: swayAmount = 1, lightTrails = false, onImpact, onRamp, onError, onFrame } = {}) {
  const scope = createResourceScope();
  const events = new AbortController();
  scope.cleanup(() => events.abort());
  try {
  const coarse = matchMedia('(pointer: coarse)').matches;
  // Counts from the effects settings; touch devices get the scaled-down tier.
  const { particles: P, fireflies: F } = effects;
  const pCount = (n) => Math.max(1, Math.round(n * (coarse ? P.touchScale : 1)));
  const fCount = (n) => Math.round(n * (coarse ? F.touchScale : 1));
  const impactCount = (n) => Math.max(1, Math.round(n * P.impact * (coarse ? P.touchScale : 1)));
  const jolt = (v) => { if (!reducedMotion && effects.render.shake) shake = Math.max(shake, v); };

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
  const FIRE_LIGHT_AT = new THREE.Vector3(0, 0.95, 0.28); // slightly in front, so the weapon's face catches light
  const ballLightAt = new THREE.Vector3();
  const BALL_LIGHT_MIN_Y = 0.62; // just above the logs' teepee
  fireLight.position.copy(FIRE_LIGHT_AT);
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
  // Frame feedback for the echo effect (the visualizer): the pass renders into one buffer
  // reading the last frame from the other, then a copy puts it on screen.
  const feedbackRT = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthBuffer: false }));
  let feedbackFlip = 0;
  let feedbackLive = false;
  const copyScene = new THREE.Scene();
  const copyMaterial = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, resolution: pass.uniforms.resolution },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec2 resolution; void main() { gl_FragColor = texture2D(map, gl_FragCoord.xy / resolution); }',
    depthTest: false, depthWrite: false,
  });
  copyScene.add(Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial), { frustumCulled: false }));
  [...feedbackRT, copyMaterial].forEach((r) => scope.own(r));
  scope.trackTree(copyScene);
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
    count: pCount(P.fire),
    sparks: Math.round(P.sparks * (coarse ? P.touchScale : 1)),
    material: particleMaterial,
    origin: FIRE_ORIGIN,
    reducedMotion,
  });
  // --- Elements. `presence` eases each element in (1) and out (0) over a moment;
  // the flame reads it to die out (lightning) or bank low and slow inside the ice.
  const plasma = createPlasma({ fxMaterial: effectMaterial, hotMaterial: particleMaterial, field, origin: FIRE_ORIGIN, reducedMotion });
  const chill = createChill({ material: scope.own(createSmokeMaterial()), field, origin: FIRE_ORIGIN, reducedMotion });
  const crystals = createCrystals({ fxMaterial: effectMaterial, origin: new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z), field, chill, reducedMotion });
  for (const o of [...plasma.objects, ...crystals.objects]) { scope.trackTree(o); o.layers.set(LAYER_FX); scene.add(o); }
  for (const l of plasma.lights) scene.add(l);
  crystals.solid.layers.set(LAYER_SOLID); // outlined like the rest of the scenery
  scope.trackTree(chill.points);
  chill.points.layers.set(LAYER_GHOST); // cold mist veils what's behind it, like smoke
  scene.add(chill.points);
  // A swinging blade's trail of fire (the visualizer's sword combos).
  const swingTrail = createSwingTrail({ fxMaterial: effectMaterial, field, count: pCount(1600), reducedMotion });
  for (const o of swingTrail.objects) { scope.trackTree(o); o.layers.set(LAYER_FX); scene.add(o); }
  let elementKey = elementOr(startingEquipment.element);
  const presence = Object.fromEntries(ELEMENT_IDS.map((id) => [id, 0]));
  function setElement(key, instant = false) {
    elementKey = elementOr(key);
    plasma.setActive(elementKey === 'lightning', instant);
    crystals.setActive(elementKey === 'ice', instant);
    swingTrail.setElement(elementKey);
    if (!instant) return;
    for (const id of ELEMENT_IDS) presence[id] = id === elementKey ? 1 : 0;
    if (elementKey !== 'fire') fire.extinguish();
  }
  /** How much of the fire burns for an element: all of it, a banked glow in the ice, none in the ball. */
  const flameShare = (key) => (key === 'fire' ? 1 : key === 'ice' ? effects.ice.innerFire : 0);

  // Live modulation from outside (the audio visualizer writes it every frame). All
  // zeros is the fire as the settings describe it; each value is a fraction added
  // (level: stoke levels added to the resting level; wind: world m/s).
  const drive = { level: 0, brightness: 0, size: 0, height: 0, turbulence: 0, glow: 0, exposure: 0, windX: 0, windZ: 0 };
  // The pixel pass's effects layer (see pixelPass.js), all off on the site. `sliceSeed`
  // picks a tear pattern; the visualizer changes it with each hit.
  const glitch = {
    slice: 0, sliceSeed: 0, split: 0, block: 1, wave: 0, mirror: 0, scan: 0, scanMode: 0, noise: 0, invert: 0,
    feedback: 0, zoom: 1, feedRot: 0, kaleido: 0, kaleidoRot: 0, rippleR: 0, rippleAmp: 0, iris: 2, letterbox: 0, ink: 0, cycle: 0,
  };
  const GLITCH_UNIFORMS = {
    slice: 'uSlice', sliceSeed: 'uSliceSeed', split: 'uSplit', block: 'uBlock', wave: 'uWave', mirror: 'uMirror', scan: 'uScan', scanMode: 'uScanMode', noise: 'uNoise', invert: 'uInvert',
    feedback: 'uFeedback', zoom: 'uZoom', feedRot: 'uFeedRot', kaleido: 'uKaleido', kaleidoRot: 'uKaleidoRot', rippleR: 'uRippleR', rippleAmp: 'uRippleAmp', iris: 'uIris', letterbox: 'uLetterbox', ink: 'uInk', cycle: 'uCycle',
  };
  // Effects that are a still look rather than motion or flashing (kept under reduced motion).
  const STILL = new Set(['mirror', 'scan', 'scanMode', 'block', 'letterbox', 'iris', 'zoom']);
  const OFF = { iris: 2, zoom: 1, block: 1 };
  const boost = (v) => Math.max(0.1, 1 + v);

  function applyFireParams() {
    const f = effects.fire;
    // Inside the ice the fire burns low, narrow and slow.
    const banked = presence.ice / Math.max(1e-3, presence.fire + presence.ice);
    Object.assign(fire.params, {
      brightness: f.brightness * (1 - 0.25 * banked) * boost(drive.brightness),
      radius: f.size * (1 - 0.3 * banked) * boost(drive.size),
      rise: f.height * (1 - 0.5 * banked) * boost(drive.height),
      curlAmp: f.turbulence * (1 - 0.55 * banked) * (reducedMotion ? 0.83 : 1) * boost(drive.turbulence),
      curlFreq: f.swirl, lifeMin: Math.min(f.lifeMin, f.lifeMax), lifeMax: f.lifeMax,
      spawn: Math.min(1, presence.fire + presence.ice * effects.ice.innerFire),
      sparks: presence.fire,
    });
  }
  setElement(elementKey, true);
  applyFireParams();
  fire.flame.layers.set(LAYER_FX);
  fire.spark.layers.set(LAYER_FX);
  scene.add(fire.flame, fire.spark);
  let fireflies = null; // created once the model (and the firefly model) loads
  let fx = null;        // ground flames, smoke and ash for weapon impacts
  let zap = null;       // the lightning ring (lightning impacts)
  let frostRing = null; // the ring of ice shards (ice impacts)
  const smokeMaterial = scope.own(createSmokeMaterial());
  const interaction = createInteraction({ reducedMotion });
  interaction.mode = effects.cursor.mode;
  interaction.strength = effects.cursor.strength;

  let weapons = null; // set once the model loads

  // --- Flame color state: eased blends between flames (see flameEase)
  let flameKey = flameOr(startingEquipment.flame);
  let blend = null; // { from, to, t }
  let blendMul = 1;
  let debugPaletteIndex = 0;
  let currentRamp = flames[flameKey].ramp;
  const blendTime = () => (reducedMotion ? 0.4 : effects.render.colorChange);
  const white = new THREE.Color('#ffffff');
  // Keep the cast light less saturated than the flame so lit stone lands on the
  // dark tinted shade, with the ramp's mid tone only in hot spots.
  const lightMix = (key) => flames[key]?.light ?? 0.34;
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
    plasma.setRamp(f.ramp);
    crystals.setRamp(f.ramp);
    chill.setRamp(f.ramp);
    swingTrail.setRamp(f.ramp);
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
      particles: pCount(P.forge),
      castShadows: renderer.shadowMap.enabled,
      reducedMotion,
      hooks: {
        // The fire sinks while the weapon is forged, and every firefly lights up.
        onSwapStart: (selection) => {
          const nextFlame = selection.flame;
          weapons.auraElement = selection.element ?? elementKey;
          targetLevel = 0.6;
          forgeFlame = nextFlame;
          // A blend still running from the last swap finishes quickly, so the
          // palette has room for the next flame.
          if (blend) blend.fast = true;
          applyColors({ ramp: currentRamp, shade: currentShade }, currentMix);
        },
        // The new weapon finishing its form lands like a hit: a jolt and a flare.
        onFormed: () => {
          jolt(0.14);
          fire.burst(0.45);
        },
        onImpact: impact,
        // A sword combo: the blade sheds fire and knocks the flames along its swing,
        // and plunging back in throws the element's ring.
        onSwingFrame: (g0, t0, g1, t1, dt) => {
          swingTrail.emit(g0, t0, g1, t1, dt);
          bladeWake(g0, t0, g1, t1, dt);
        },
        // Each move's hit throws a spray off the point.
        onSwingHit: (kind, tip, dir) => {
          swingTrail.hit(tip, dir, kind === 'thrust' ? 1 : 0.6);
          jolt(kind === 'slash' ? 0.04 : 0.07);
        },
        onSwingImpact: () => {
          ring(1.2);
          fire.burst(1.1 * flameShare(elementKey));
          jolt(0.3);
          swingDone?.();
          swingDone = null;
        },
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
      count: fCount(F.count),
      litCount: fCount(F.lit),
      lightCount: fCount(F.lights),
      speed: F.speed,
      center: new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z),
      layer: LAYER_GHOST,
      terrain,
      raycast,
      reducedMotion,
      trailMaterial: lightTrails ? effectMaterial : null,
    });
    scope.trackTree(fireflies.group);
    if (fireflies.trails) { scope.trackTree(fireflies.trails); fireflies.trails.layers.set(LAYER_FX); scene.add(fireflies.trails); }
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
      flames: impactCount(3200),
      haze: impactCount(1500),
      smoke: impactCount(520),
      ash: impactCount(220),
      embers: impactCount(160),
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
    const ground = new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z);
    // Lightning strikes and cold mist follow the scenery's surface (the fireflies' height map).
    plasma.setGround(terrain.top);
    chill.setGround(terrain.top);
    zap = createLightningRing({ fxMaterial: effectMaterial, origin: ground, field, reach, ground: terrain.top, emitters: coarse ? 72 : 96, sparks: impactCount(260), lights: coarse ? 4 : 6, reducedMotion });
    frostRing = createIceRing({ fxMaterial: effectMaterial, origin: ground, field, reach, chill, chips: impactCount(320), lights: coarse ? 4 : 6, reducedMotion });
    for (const o of [...zap.objects, ...frostRing.objects]) { scope.trackTree(o); o.layers.set(LAYER_FX); scene.add(o); }
    frostRing.solid.layers.set(LAYER_SOLID);
    for (const l of [...zap.lights, ...frostRing.lights]) scene.add(l);
    zap.setRamp(currentRamp);
    frostRing.setRamp(currentRamp);
    sets = [...fire.sets, ...plasma.sets, ...crystals.sets, ...chill.sets, ...fx.sets, ...zap.sets, ...frostRing.sets];

    scene.add(root, weapons.holder);
    weapons.setRim(currentRamp[2]);
    weapons.set(startingEquipment.weapon);
    ready = true;

  });

  // --- Fire level (stoking, UI puffs, weapon impacts)
  let firstStoke = true;
  function stoke() {
    fire.params.level = Math.min(2.4, fire.params.level + effects.fire.stoke);
    fire.burst(Math.min(1.5, effects.fire.stoke / 0.9));
    if (elementKey === 'lightning') { plasma.discharge(0.5); zap?.crackle(0.35, 3); }
    if (elementKey === 'ice') crystals.burst(0.6);
    jolt(0.18);
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
    const ramp = flames[flameKey].ramp;
    for (const r of [fx, zap, frostRing]) r.setRamp(ramp);
    weapons.setRim(ramp[2]); // the new weapon arrives rimmed in its new color
    // The bonfire takes the new element. The fire erupts (or the ball discharges,
    // or the ice flashes), a ring races across the ground — flame with a puff of
    // smoke and ash, lightning, or ice shards — and the fireflies scatter.
    setElement(selection.element ?? elementKey);
    fire.params.level = reducedMotion || stationary ? 2 : 3.2;
    targetLevel = 1;
    fire.burst((reducedMotion ? 0.8 : 1.7) * flameShare(elementKey));
    if (elementKey === 'lightning') { zap.burst(effects.lightning.height); plasma.discharge(1); }
    else if (elementKey === 'ice') { frostRing.burst(); crystals.burst(1); }
    else fx.burst();
    fireflies.burst(flames[flameKey].ramp);
    jolt(0.3);
    onImpact?.(flameKey, old, stationary, { ...selection, weapon: weaponKey });
  }

  /**
   * Swap weapon + flame color. Resolves at impact. `pace` and `hold` go to the swap
   * (see weapons.js): the visualizer times the impact to the beat, or holds the new
   * weapon over the fire until release().
   */
  function equip(weaponKey, key, { instant = false, item = null, element = elementKey, pace = 1, hold = false } = {}) {
    return loaded.then(() => {
      if (scope.disposed) return { status: 'cancelled' };
      if (!Object.hasOwn(flames, key)) throw new Error('Unknown flame: ' + key);
      const selection = { weapon: weaponKey, flame: key, item, element: elementOr(element) };
      if (instant) {
        weapons.set(weaponKey);
        setElement(selection.element, true);
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
      return weapons.swap(weaponKey, flames[flameKey].ramp, flames[key].ramp, selection, { pace, hold });
    });
  }

  /**
   * A beat (the visualizer): the fire kicks up, the ball crackles, the ice pulses.
   * `strength` 0..1; `accent` marks a downbeat (a bigger hit); the fireflies blink along
   * unless `blink` is off.
   */
  function pulse(strength = 1, { accent = false, blink = true } = {}) {
    if (!ready || reducedMotion) return;
    const s = Math.min(1, Math.max(0, strength));
    fire.burst(0.45 * s * (accent ? 1.5 : 1) * flameShare(elementKey));
    if (elementKey === 'lightning') {
      zap.crackle(0.12 + 0.15 * s, Math.round(2 + 3 * s + (accent ? 3 : 0)));
      if (accent) plasma.discharge(0.35 * s);
    } else if (elementKey === 'ice') {
      crystals.burst(0.4 * s * (accent ? 1.5 : 1));
    }
    if (blink) fireflies.pulse(accent ? s : s * 0.45);
    weapons.beat(s * (accent ? 1 : 0.6));
  }
  /**
   * The current element's ring, without a new weapon or colors: a ring of fire, of
   * lightning or of ice shards races out across the ground (the visualizer's extra hits).
   */
  function ring(strength = 1) {
    if (!ready || reducedMotion) return;
    const s = Math.min(1.5, Math.max(0, strength));
    if (elementKey === 'lightning') { zap.burst(effects.lightning.height); plasma.discharge(0.6 * s); }
    else if (elementKey === 'ice') { frostRing.burst(); crystals.burst(0.8 * s); }
    else { fx.burst(); fire.burst(0.9 * s); }
    fire.params.level = Math.max(fire.params.level, 1.6 + s);
    jolt(0.12 * s);
  }
  /** An echo of the planted weapon's silhouette bursts out of it. */
  function echo() {
    if (ready) weapons.echo(currentRamp);
  }
  /**
   * The living blade (the visualizer): the planted weapon leaves the fire for a routine of
   * moves and plunges back in. plan { hits: [s, …], plunge: s } in seconds from now, and
   * optionally { moves, alive, basis, onMove, onHit } (see weapons.swing). Each move takes
   * its plane from the camera (`basis`, by default where the camera is headed) as it
   * begins. Resolves when the blade is back in the fire (false if it can't swing).
   */
  let swingDone = null;
  function swing(plan) {
    if (!ready || reducedMotion) return Promise.resolve(false);
    if (!weapons.swing({ basis: viewAxes, ...plan })) return Promise.resolve(false);
    return new Promise((resolve) => { swingDone = () => resolve(true); });
  }
  /** Where the blade is (world): { mid, tip, grip, normal, quat, len, swinging, free }, or null. */
  const bladeState = { mid: new THREE.Vector3(), tip: new THREE.Vector3(), grip: new THREE.Vector3(), normal: new THREE.Vector3(), quat: new THREE.Quaternion(), len: 1, swinging: false, free: false };
  /** Flames and sparks near the moving blade get knocked along with it. */
  function bladeWake(g0, t0, g1, t1, dt) {
    const inv = 1 / Math.max(dt, 1e-3);
    const vgx = (g1.x - g0.x) * inv, vgy = (g1.y - g0.y) * inv, vgz = (g1.z - g0.z) * inv;
    const vtx = (t1.x - t0.x) * inv, vty = (t1.y - t0.y) * inv, vtz = (t1.z - t0.z) * inv;
    const abx = t1.x - g1.x, aby = t1.y - g1.y, abz = t1.z - g1.z;
    const len2 = abx * abx + aby * aby + abz * abz || 1;
    const R = 0.3;
    for (const set of fire.sets) {
      const P = set.pos;
      const V = set.vel;
      for (let i = 0; i < set.n; i++) {
        const ix = i * 3;
        const px = P[ix] - g1.x, py = P[ix + 1] - g1.y, pz = P[ix + 2] - g1.z;
        const s = Math.min(1, Math.max(0, (px * abx + py * aby + pz * abz) / len2));
        const dx = px - abx * s, dy = py - aby * s, dz = pz - abz * s;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R * R) continue;
        const k = 0.45 * (1 - Math.sqrt(d2) / R);
        V[ix] = Math.max(-4, Math.min(4, V[ix] + (vgx + (vtx - vgx) * s) * k));
        V[ix + 1] = Math.max(-4, Math.min(4, V[ix + 1] + (vgy + (vty - vgy) * s) * k));
        V[ix + 2] = Math.max(-4, Math.min(4, V[ix + 2] + (vgz + (vtz - vgz) * s) * k));
      }
    }
  }
  /** A few sparks off the flame (hi-hats). */
  function sparkle(n = 3) {
    if (!ready || reducedMotion) return;
    fire.sparkle(n);
  }

  // --- Camera: point-of-view tweening + snapped sway
  let layout = 'wide';
  const toPose = (p) => ({ pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target), fov: p.fov, sx: p.sx, sy: p.sy, roll: p.roll ?? 0 });
  const clonePose = (p) => ({ pos: p.pos.clone(), target: p.target.clone(), fov: p.fov, sx: p.sx, sy: p.sy, roll: p.roll });
  const view = { name: 'home', cur: toPose(getPov('home', layout)), from: null, to: null, t: 1, dur: 1.25 };
  function setView(name, { instant = false } = {}) {
    view.name = name;
    moveTo(toPose(getPov(name, layout)), instant, 1.25);
  }
  /**
   * A camera pose of your own ({ pos, target, fov, sx, sy }, arrays for the vectors),
   * outside the site's per-screen points of view. It's kept through layout changes.
   */
  function setPose(p, { instant = false, duration = 1.25 } = {}) {
    view.name = null;
    moveTo(toPose({ sx: 0, sy: 0, ...p }), instant, duration);
  }
  /** The camera's axes and position where it's headed (world): { right, up, toCam, pos }. */
  function viewAxes() {
    const { pos, target, roll } = view.to && view.t < 1 ? view.to : view.cur;
    const toCam = pos.clone().sub(target).normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(toCam);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(toCam, right);
    if (roll) {
      const c = Math.cos(roll);
      const s = Math.sin(roll);
      const r = right.clone();
      right.multiplyScalar(c).addScaledVector(up, s);
      up.multiplyScalar(c).addScaledVector(r, -s);
    }
    return { right, up, toCam, pos: pos.clone() };
  }
  function moveTo(to, instant, duration) {
    if (instant || reducedMotion) {
      view.cur = to;
      view.t = 1;
    } else {
      view.from = clonePose(view.cur);
      view.to = to;
      view.t = 0;
      view.dur = duration;
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
    const sparks = interaction.update(camera, cursor, sets, dt);
    if (sparks.length) fire.emitSparks(sparks);
  }
  let sets = [...fire.sets, ...plasma.sets, ...crystals.sets, ...chill.sets]; // particle sets the cursor moves (the rings join on load)

  /** The cursor's ray into the scene, or null while it's away (the tesla ball reaches for it). */
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  function pointerRay() {
    if (!cursor.present || cursor.width < 1) return null;
    ndc.set((cursor.bx / cursor.width) * 2 - 1, 1 - (cursor.by / cursor.height) * 2);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }

  // --- Sizing (fixed on-screen pixel size; the render target scales instead)
  const settings = { pixelSize: null, ditherIndex: 0, matrixIndex: 0 };
  let size = { w: 1, h: 1, pd: 4 };
  const isSmall = () => container.clientWidth < 700;
  const pixelSize = () => settings.pixelSize ?? (isSmall() ? effects.render.pixelSizeSmall : effects.render.pixelSize);
  function applyRender() {
    const r = effects.render;
    pass.uniforms.ditherStrength.value = r.dither;
    pass.uniforms.ditherScale.value = r.ditherMatrix;
    pass.uniforms.outlines.value = r.outlines ? 1 : 0;
    pass.uniforms.vignette.value = r.vignette;
    pass.uniforms.exposure.value = r.exposure;
  }
  applyRender();
  function resize() {
    if (scope.disposed) return;
    const dpr = window.devicePixelRatio || 1;
    const cssPx = pixelSize();
    const pd = Math.max(1, Math.round(cssPx * dpr));
    const w = Math.max(1, Math.ceil((container.clientWidth * dpr) / pd));
    const h = Math.max(1, Math.ceil((container.clientHeight * dpr) / pd));
    size = { w, h, pd };
    renderer.setSize(w, h, false);
    colorRT.setSize(w, h);
    normalRT.setSize(w, h);
    fxRT.setSize(w, h);
    for (const rt of feedbackRT) rt.setSize(w, h);
    feedbackLive = false;
    pass.uniforms.resolution.value.set(w, h);
    canvas.style.width = `${(w * pd) / dpr}px`;
    canvas.style.height = `${(h * pd) / dpr}px`;
    camera.aspect = w / h;
    const next = container.clientWidth >= 1100 && w / h > 1.15 ? 'wide' : 'tall';
    if (next !== layout) {
      layout = next;
      if (view.name) setView(view.name, { instant: true });
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
  const rollQ = new THREE.Quaternion();
  const fireOnScreen = new THREE.Vector3();
  const VIEW_AXIS = new THREE.Vector3(0, 0, 1);
  const sway = { x: 0, y: 0 };

  function update(dt, t) {
    fire.params.level += (targetLevel + drive.level - fire.params.level) * Math.min(1, dt * 1.1);
    fire.wind.set(drive.windX, 0, drive.windZ);
    for (const id of ELEMENT_IDS) {
      const d = (id === elementKey ? 1 : 0) - presence[id];
      presence[id] += Math.sign(d) * Math.min(Math.abs(d), dt / 0.6);
    }
    applyFireParams();

    updateCursor(dt, t);

    // Stepped simulation for a hand-animated look.
    const fps = effects.fire.fps;
    const fs = Math.floor(t * fps);
    if (fs !== flameStep) {
      const steps = flameStep < 0 || fs < flameStep ? 1 : Math.min(3, fs - flameStep);
      flameStep = fs;
      for (let i = 0; i < steps; i++) fire.stepFlame(1 / fps, t);
      candleFlames.forEach((c, i) => c.mesh.scale.set(c.scale.x, c.scale.y * (0.8 + hash(fs * 1.7 + i * 9.1) * 0.4), c.scale.z));
      // Coals in the ash pulse between the flame's deep, body and bright tones.
      glows.forEach((g, i) => {
        const h = hash(fs * 3.3 + i * 5.7);
        g.material.color.set(currentRamp[h > 0.8 ? 2 : h > 0.3 ? 1 : 0]);
      });
    }
    fire.stepSparks(dt, t);
    plasma.step(dt, t, fire.params.level, { ray: pointerRay(), flow: interaction.flowWorld });
    crystals.step(dt, t, fire.params.level);
    chill.step(dt, t);
    swingTrail.step(dt, t);
    fx.step(dt, t);
    zap.step(dt, t);
    frostRing.step(dt, t);
    fireflies.update(dt, t, camera, cursor, interaction.flowWorld);

    // After a weapon lands: ease from the old flame into the new one, with the
    // light swelling and settling as the color turns over.
    if (blend) {
      blend.t = Math.min(1, blend.t + (dt / blendTime()) * (blend.fast ? 4 : 1));
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
    // Each element lights the scene its own way: fire flickers, the ball strobes
    // with its crackle, ice glows steadily and breathes.
    const iceLight = (0.88 + 0.07 * Math.sin(t * 1.3) * effects.ice.shimmer) * effects.ice.glow * 0.8;
    const lit = presence.fire * lightFlicker + presence.lightning * plasma.lightFlicker * effects.lightning.brightness + presence.ice * iceLight;
    const flicker = lit / Math.max(1e-3, presence.fire + presence.lightning + presence.ice);
    // The ball lights the scene from where it hangs — but no lower than the top of the
    // logs, so a ball set down in the core still lights the clearing instead of being
    // shadowed by the logs around it.
    fireLight.position.lerpVectors(FIRE_LIGHT_AT, ballLightAt.set(FIRE_ORIGIN.x, Math.max(effects.lightning.height, BALL_LIGHT_MIN_Y), FIRE_ORIGIN.z + 0.12), presence.lightning);
    // A discharge (weapon impact, stoke) flashes the whole scene for an instant.
    const flash = reducedMotion ? 0 : plasma.flash;
    pass.uniforms.exposure.value = effects.render.exposure * (1 + flash * 0.45) * boost(drive.exposure);
    fireLight.intensity = effects.fire.glow * Math.min(2.6, Math.max(0.3, fire.params.level)) ** 1.3 * flicker * blendMul * (1 + flash * 1.5) * boost(drive.glow);

    weapons.update(dt);

    if (view.t < 1) {
      view.t = Math.min(1, view.t + dt / view.dur);
      const k = easeInOut(view.t);
      view.cur.pos.lerpVectors(view.from.pos, view.to.pos, k);
      view.cur.target.lerpVectors(view.from.target, view.to.target, k);
      view.cur.fov = THREE.MathUtils.lerp(view.from.fov, view.to.fov, k);
      view.cur.sx = THREE.MathUtils.lerp(view.from.sx, view.to.sx, k);
      view.cur.sy = THREE.MathUtils.lerp(view.from.sy, view.to.sy, k);
      view.cur.roll = THREE.MathUtils.lerp(view.from.roll, view.to.roll, k);
    }
  }

  function applyCamera(dt) {
    const { pos, target, fov, sx, sy, roll } = view.cur;
    camera.fov = fov;
    camera.setViewOffset(size.w, size.h, -Math.round(sx * size.w), Math.round(sy * size.h), size.w, size.h);
    camera.updateProjectionMatrix();

    // Sway toward the cursor, snapped to whole texels at the focal distance so
    // the image never swims between pixels.
    if (!reducedMotion) {
      sway.x += (ptr.sx * swayAmount - sway.x) * Math.min(1, dt * 2.5);
      sway.y += (ptr.sy * swayAmount - sway.y) * Math.min(1, dt * 2.5);
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
    if (roll) camera.quaternion.multiply(rollQ.setFromAxisAngle(VIEW_AXIS, roll));
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(right, ox).addScaledVector(up, oy);
  }

  function renderFrame(dt) {
    // The visualizer drives the fire from here, so its changes land in this frame.
    if (ready) onFrame?.(dt, clock.elapsedTime);
    if (ready) update(dt, clock.elapsedTime);
    applyCamera(dt);
    for (const [k, u] of Object.entries(GLITCH_UNIFORMS)) {
      pass.uniforms[u].value = reducedMotion && !STILL.has(k) ? OFF[k] ?? 0 : glitch[k];
    }
    pass.uniforms.uTime.value = clock.elapsedTime;
    // The ripple is sized to the screen: radius as a fraction of the height, push per 270 rows.
    pass.uniforms.uRippleR.value = glitch.rippleR * size.h;
    pass.uniforms.uRippleAmp.value = reducedMotion ? 0 : (glitch.rippleAmp * size.h) / 270;
    // Where the fire is on screen (texels): the ripple, the iris and the echoes center on it.
    fireOnScreen.set(FIRE_ORIGIN.x, 0.55, FIRE_ORIGIN.z).project(camera);
    pass.uniforms.uCenter.value.set((fireOnScreen.x * 0.5 + 0.5) * size.w, (fireOnScreen.y * 0.5 + 0.5) * size.h);

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

    if (pass.uniforms.uFeedback.value > 0) {
      if (!feedbackLive) {
        for (const rt of feedbackRT) { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); }
        feedbackLive = true;
      }
      const write = feedbackRT[feedbackFlip];
      pass.uniforms.tPrev.value = feedbackRT[1 - feedbackFlip].texture;
      feedbackFlip = 1 - feedbackFlip;
      renderer.setRenderTarget(write);
      renderer.clear();
      renderer.render(pass.scene, pass.camera);
      copyMaterial.uniforms.map.value = write.texture;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(copyScene, pass.camera);
    } else {
      feedbackLive = false;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(pass.scene, pass.camera);
    }
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
      const cur = pixelSize();
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
      pixel: `${pixelSize()}px (${size.w}×${size.h})`,
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

  /** The scenery colors (palette.js `base`) changed: take them up (the visualizer's random palettes). */
  function refreshScene() {
    voidColor.set(base.void);
    scene.fog.color.set(base.void);
    applyColors({ ramp: currentRamp, shade: currentShade }, currentMix);
  }

  /**
   * Re-read the live effects settings (admin preview). Counts are fixed at
   * creation; the caller rebuilds the scene when those change.
   */
  function applyEffects() {
    applyFireParams();
    applyRender();
    interaction.mode = effects.cursor.mode;
    interaction.strength = effects.cursor.strength;
    settings.pixelSize = null;
    voidColor.set(base.void);
    scene.fog.color.set(base.void);
    resize();
    if (!ready) return;
    fireflies.setLit(fCount(effects.fireflies.lit));
    fireflies.speed = effects.fireflies.speed;
    // Colors: a flame may have been edited or deleted mid-blend, so settle on the current one.
    flameKey = flameOr(flameKey);
    blend = null;
    blendMul = 1;
    forgeFlame = null;
    debugPaletteIndex = 0;
    applyColors(flames[flameKey], lightMix(flameKey));
    fireflies.setRamp(currentRamp);
    for (const r of [fx, zap, frostRing]) r.setRamp(currentRamp);
    weapons.setRim(currentRamp[2]);
  }

  return {
    stoke, puff, equip, setView, setPose, viewAxes, cycle, describe, flash, applyEffects, refreshScene, pulse, sparkle, ring, echo, swing, drive, glitch, ready: loaded,
    /** A jolt of the camera (0..~0.3), if screen shake is on. */
    shake: (amount) => jolt(amount),
    dispose: () => scope.dispose(),
    /** Let a weapon held over the fire strike (equip with `hold`). False if none is held. */
    release: (strikePace = 1) => weapons?.release(strikePace) ?? false,
    /** 0..1: how hard a held weapon glows. */
    set charge(v) { if (weapons) weapons.charge = v; },
    /** The blade moves as if alive (the visualizer): flourishes, shudders, a held one's sway. */
    set alive(v) { if (weapons) weapons.alive = v; },
    /** Where the blade is (see bladeState), or null before the model loads. */
    get blade() { return weapons?.blade(bladeState) ?? null; },
    /** Render pixel size in CSS px (null: the settings' size). */
    setPixelSize(px) { settings.pixelSize = px; resize(); },
    get flame() { return flameKey; },
    get element() { return elementKey; },
    get weapon() { return weapons?.currentKey ?? null; },
    /** A weapon swap is running (or a weapon is held, waiting to strike, or swinging). */
    get forging() { return weapons?.busy ?? false; },
    get swinging() { return weapons?.swinging ?? false; },
    get holding() { return weapons?.holding ?? false; },
    /** Seconds from equip() to impact at pace 1. */
    get swapTime() { return weapons?.impactTime ?? 3.58; },
    get fireflies() { return fireflies; },
    /** Internals for debugging (dev builds expose this as window.__fire). */
    get debug() { return { weapons, fx, plasma, zap, frostRing, crystals, chill }; },
    get interaction() { return interaction.mode; },
    set interaction(m) { interaction.mode = m; },
  };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
