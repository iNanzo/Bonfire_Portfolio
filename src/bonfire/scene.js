// Always-on pixel-art bonfire behind the whole site (and Bonfire Live, the visualizer).
//
// Each frame is drawn in four low-resolution passes (frame.js): normals, color, the
// additive particles, then the pixel pass (outlines, dither, palette). The visualizer
// asks for `effects`: the pixel pass's effects layer and the stages it needs; the site
// leaves them out, so it compiles a lean shader and allocates no extra buffers.
//
// The bonfire has an element — fire, lightning (a tesla ball, plasma.js) or ice
// (glowing shards, ice.js) — that changes when a weapon lands, like the flame
// color. Every element burns in the current flame's colors, and each has its own
// impact: a ring of fire, a ring of lightning, or a ring of ice shards.
//
// Hits have weight (effects.impact): a big one freezes the simulation for a few frames
// (hit-stop, repaid afterwards so the music's timing holds), flashes the frame toward the
// core color, adds camera trauma (view.js), throws debris that bounces off the scenery
// (debris.js) and leaves a mark on the ground that fades (marks.js). While lots is going
// on, the background extras thin out (`busy`) so the main hit reads.
//
// A knight rests at the fire (knights.js, his own model fetched alongside the scene's; the
// fire burns without him if it fails): he looks up at a weapon rising out of the fire,
// flinches at its impact, leans away from a stoke and lifts his feet as a ring passes. On
// the site he follows effects.knight (there or not, which helmet; the visitor's own pick
// from the pack, `knightHelmet`, wins for the visit). In Bonfire Live a few can be
// summoned to dance round the fire (fire.knights); that page casts them itself. His code is
// a chunk of its own (knightBundle.js), fetched with his model. On the site, when he isn't
// there at load (his sign waits for him), the fire's first frame doesn't wait for him: he's
// built after it, a step at a time in idle moments, his shaders compiled before he and his
// sign are put in the scene (the sign kindles as it appears).
import * as THREE from 'three';
import { createResourceScope } from './resources.js';
import { weapons as weaponNames, startingEquipment } from '../content.js';
import { effects } from '../effects.js';
import { ELEMENT_IDS, KNIGHT_HELMETS } from '../effectsDefaults.js';
import { elementOr } from '../elements.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { createFrame } from './frame.js';
import { createFrameGate } from './frameGate.js';
import { createFlame, createParticleMaterial, createEffectMaterial, SHAPE } from './flame.js';
import { createInteraction, MODES } from './interaction.js';
import { createFireflies } from './fireflies.js';
import { createTerrain, readTerrain, createTerrainMaterial } from './terrain.js';
import { createImpactFx, createSmokeMaterial } from './impact.js';
import { createCurlField } from './curl.js';
import { createWeapons } from './weapons.js';
import { SEATS } from './knightPlaces.js';
import { createArmorShared } from './armor.js';
import { MODELS, styleOr, styleModel } from './knightStyles.js';
import { createPlasma } from './plasma.js';
import { createLightningRing } from './lightningRing.js';
import { createCrystals, createIceRing } from './ice.js';
import { createChill } from './chill.js';
import { createSwingTrail } from './swingTrail.js';
import { createView } from './view.js';
import { createPointer } from './pointer.js';
import { createGroundMarks } from './marks.js';
import { createDebris } from './debris.js';
import { createFlowView } from './flowView.js';
import { buildScenery, SCENERIES, MAX_LAMPS } from './scenery.js';
import { mergeSteps } from './sceneryMerge.js';
import { passValue, stillClock } from './stillFx.js';
import { base, flames, flameOr, scenePalette, debugPalettes, mixFlame, flameEase } from '../palette.js';
import { PIXEL_SIZES } from '../pixelSizes.js';
import { LAYER_SOLID, LAYER_FX, LAYER_GHOST, FIRE_ORIGIN, WEAPON_ANCHOR, flameShare, lightMix, boost } from './sceneContext.js';

const BASE = import.meta.env.BASE_URL;
const LIGHT_FPS = 12;

const DEBUG_PALETTES = Object.keys(debugPalettes);
const DITHER_LEVELS = [0.08, 0.16, 0.26]; // (the render menu steps up through these from the current value, then to none)
const MATRIX_SIZES = [4, 8];

const hash = (n) => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };
// The knight's helmets (knights.js HELMETS: the settings' own list, less 'random'; his code
// loads with his model, this is needed before).
const HELMETS = KNIGHT_HELMETS.filter((h) => h !== 'random');
// A moment the page isn't busy (a frame's spare time; Safari has no requestIdleCallback).
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 250 }) : setTimeout(fn, 16));
// The places built beforehand (Bonfire Live, the Painter): how long after the show is up they
// start, and the idle time left a step needs to start: most (a few pieces merged, a few rows
// of a height map, a map drawn) take about a ms or less; a place's own build 3 to 10. Never
// more than this share of the display's frame, though: no idle moment is longer than one (a
// 144 Hz screen's offer 4 ms or so at most, Bonfire Live drawing every frame).
const PREBUILD_AFTER_MS = 4000;
const SMALL_STEP_MS = 3;
const BIG_STEP_MS = 12;
const STEP_FRAME_SHARE = 0.6;

export function createBonfire(container, { reducedMotion = false, paintedLook = false, sway: swayAmount = 1, lightTrails = false, effects: fxLayer = false, knightHelmet = null, onImpact, onFormed, onRamp, onError, onFrame, onTick } = {}) {
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
  const jolt = (v) => { if (!reducedMotion && effects.render.shake) view.shake(v); };

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  // (The scope's first resource, so it's disposed last, after every material and texture has
  // given its GL objects back (resources.js). Then its context is let go at once, not whenever
  // the old canvas is collected: Bonfire Live rebuilds the scene when Particles or Trails
  // change, and each rebuild left a context behind (Chrome keeps 16 at most).)
  scope.own({
    dispose() {
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  });
  scope.cleanup(() => renderer.setAnimationLoop(null));
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  // The fire's shadow is a cube map (six renders of the scenery). three.js would redraw it
  // in every render() call that sees the light (the normals pass and the color pass alike);
  // renderFrame asks for it once, and only when a weapon or the light has moved.
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  renderer.info.autoReset = false; // (counted over the whole frame, all passes: see stats())
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

  // The state the scene's parts share (sceneContext.js lists it): each value that more than
  // one of them reads or changes lives on `ctx`, and only there.
  /** @type {import('./sceneContext.js').SceneContext} */
  const ctx = /** @type {any} */ ({});

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
  fireLight.shadow.normalBias = 0.02; // (no acne on thin, faceted pieces: posts, cylinders)
  fireLight.shadow.camera.near = 0.05;
  fireLight.shadow.camera.far = 10;
  scene.add(fireLight);

  const candleLight = new THREE.PointLight(0xffb25a, 0.35, 2.5, 1.8);
  scene.add(candleLight);
  // The other sceneries' lamps (scenery.js) take their places in a fixed pool, and the
  // candle's light goes dark away from the ruins: every light stays in the scene (and on
  // every layer, once the model is in), so the lit shaders are built once, at load, and a
  // new place or a pass that sees different lights never makes them rebuild.
  const lamps = Array.from({ length: MAX_LAMPS }, () => {
    const l = new THREE.PointLight(0xffb25a, 0, 2, 1.8);
    l.userData.base = 0;
    scene.add(l);
    return l;
  });

  // --- Drawing (frame.js): the passes, their buffers, and (the visualizer) the effects stages
  const frame = createFrame({
    renderer, scene, camera, voidColor, effects: fxLayer,
    layers: { solid: LAYER_SOLID, fx: LAYER_FX, ghost: LAYER_GHOST },
    own: (r) => scope.own(r), track: (t) => scope.trackTree(t),
  });
  const pass = frame.pass;

  // --- Fire particles
  const particleMaterial = createParticleMaterial(frame.depthTexture, pass.uniforms.resolution.value);
  const effectMaterial = createEffectMaterial(particleMaterial);
  // Each element's loose particles have a shape of their own (signatures.js): lightning's
  // sparks flash as crosses, ice glints as diamonds.
  const crossMaterial = createEffectMaterial(particleMaterial, { shape: SHAPE.cross });
  const diamondMaterial = createEffectMaterial(particleMaterial, { shape: SHAPE.diamond });
  for (const m of [particleMaterial, effectMaterial, crossMaterial, diamondMaterial]) scope.own(m);
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
  const plasma = createPlasma({ fxMaterial: effectMaterial, hotMaterial: particleMaterial, sparkMaterial: crossMaterial, field, origin: FIRE_ORIGIN, reducedMotion });
  const chill = createChill({ material: scope.own(createSmokeMaterial()), field, origin: FIRE_ORIGIN, reducedMotion });
  const crystals = createCrystals({ fxMaterial: effectMaterial, glintMaterial: diamondMaterial, origin: new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z), field, chill, reducedMotion });
  for (const o of [...plasma.objects, ...crystals.objects]) { scope.trackTree(o); o.layers.set(LAYER_FX); scene.add(o); }
  for (const l of plasma.lights) scene.add(l);
  crystals.solid.layers.set(LAYER_SOLID); // outlined like the rest of the scenery
  scope.trackTree(chill.points);
  chill.points.layers.set(LAYER_GHOST); // cold mist veils what's behind it, like smoke
  scene.add(chill.points);
  // A swinging blade's trail of fire (the visualizer's sword combos).
  const swingTrail = createSwingTrail({ fxMaterial: effectMaterial, field, count: pCount(1600), reducedMotion });
  for (const o of swingTrail.objects) { scope.trackTree(o); o.layers.set(LAYER_FX); scene.add(o); }
  // Ground marks and bouncing debris (one pool per element, in its particle shape).
  const marks = createGroundMarks({ center: new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z) });
  scope.cleanup(() => marks.dispose());
  const debris = {
    fire: createDebris({ kind: 'fire', material: effectMaterial, count: pCount(140), reducedMotion }),
    ice: createDebris({ kind: 'ice', material: diamondMaterial, count: pCount(140), reducedMotion }),
    lightning: createDebris({ kind: 'lightning', material: crossMaterial, count: pCount(160), reducedMotion }),
  };
  for (const d of Object.values(debris)) { scope.trackTree(d.points); d.points.layers.set(LAYER_FX); scene.add(d.points); }
  ctx.terrainTop = null; // the scenery's height at (x, z), once the model has loaded

  // --- Hit feel. `busy` (0..1) rises with every big moment and drains over a second or
  // so; `ambient()` is how much of the background extras to keep (see the header).
  ctx.busy = 0;
  ctx.hitStop = 0;   // seconds of freeze left
  ctx.timeDebt = 0;  // frozen time still to be repaid
  ctx.simT = 0;      // the simulation's clock (real time minus the freezes still owed)
  ctx.flashAmt = 0;  // the impact flash, 0..1
  let lastFlash = -1;
  ctx.strikeAt = -1; // (simulation time) a firefly strike waiting for the ball to grow in
  const ambient = () => 1 - ctx.busy * effects.impact.budget;
  /**
   * A hit: `weight` 0..1 (a flick ... a weapon landing). Freezes, flashes (at most a couple
   * a second), adds camera trauma and makes the scene busy.
   */
  function hit(weight, { freeze = true, flash = true, shake = true } = {}) {
    const I = effects.impact;
    ctx.busy = Math.min(1, ctx.busy + weight * 0.8);
    if (shake) jolt(0.3 * weight);
    if (reducedMotion) return;
    if (freeze && I.hitStop > 0) ctx.hitStop = Math.max(ctx.hitStop, I.hitStop * weight);
    const now = performance.now() / 1000;
    if (flash && I.flash > 0 && weight >= 0.5 && now - lastFlash > 0.45) { ctx.flashAmt = Math.max(ctx.flashAmt, I.flash * weight); lastFlash = now; }
  }
  const rampNow = () => ctx.currentRamp.map((h) => new THREE.Color(h));
  /** Mark the ground and throw debris for the current element at (x, z). `size` 0..1+. */
  function scar(x, z, size = 1, { ring = false } = {}) {
    if (!ctx.ready) return;
    const kind = ctx.elementKey;
    const colors = rampNow();
    marks.stamp(kind, x, z, ring ? 1.5 : 0.22 + 0.18 * size, colors, { strength: Math.min(1, 0.6 + 0.4 * size), ring });
    const n = Math.round((kind === 'lightning' ? 16 : 10) * size * effects.impact.debris);
    if (n > 0 && !ring) {
      const d = debris[kind];
      d.setRamp(colors);
      d.throw(x, (ctx.terrainTop?.(x, z) ?? 0) + 0.08, z, n, { power: 0.6 + 0.5 * size });
    }
  }

  ctx.elementKey = elementOr(startingEquipment.element);
  const presence = Object.fromEntries(ELEMENT_IDS.map((id) => [id, 0]));
  function setElement(key, instant = false) {
    ctx.elementKey = elementOr(key);
    plasma.setActive(ctx.elementKey === 'lightning', instant);
    crystals.setActive(ctx.elementKey === 'ice', instant);
    swingTrail.setElement(ctx.elementKey);
    if (!instant) return;
    for (const id of ELEMENT_IDS) presence[id] = id === ctx.elementKey ? 1 : 0;
    if (ctx.elementKey !== 'fire') fire.extinguish();
  }

  // Live modulation from outside (the audio visualizer writes it every frame). All
  // zeros is the fire as the settings describe it; each value is a fraction added
  // (level: stoke levels added to the resting level; wind: world m/s).
  const drive = { level: 0, brightness: 0, size: 0, height: 0, turbulence: 0, glow: 0, exposure: 0, windX: 0, windZ: 0 };
  // The pixel pass's effects layer (see pixelPass.js), all off on the site. `sliceSeed`
  // picks a tear pattern; the visualizer changes it with each hit.
  // The layers and blend modes (the visualizer's looks.js) start at their classic ways:
  // echoes lighten, glow adds, scanlines multiply, a warp replaces the picture.
  const glitch = {
    slice: 0, sliceSeed: 0, split: 0, block: 1, wave: 0, mirror: 0, scan: 0, scanMode: 0, noise: 0, invert: 0,
    feedback: 0, zoom: 1, feedRot: 0, kaleido: 0, kaleidoRot: 0, rippleR: 0, rippleAmp: 0, iris: 2, letterbox: 0, ink: 0, cycle: 0,
    temp: 0, blackout: 0,
    ghost: 0, ghostKeep: 0.9, blur: 0, glow: 0, glowSize: 2, glowCut: 0.2, grad: 0, gradA: 0, gradB: 6, gradC: 8,
    style: 0, styleR: 3, styleMix: 1, paintAngle: 0, paintAspect: 1, washEdge: 0, flicker: 0, flickerMode: 0,
    feedMode: 6, ghostMode: 0, warpMode: 0, warpMix: 1, inkMode: 0, invertMode: 0, scanBlend: 3, glowMode: 1, gradMode: 0,
  };
  const GLITCH_UNIFORMS = {
    slice: 'uSlice', sliceSeed: 'uSliceSeed', split: 'uSplit', block: 'uBlock', wave: 'uWave', mirror: 'uMirror', scan: 'uScan', scanMode: 'uScanMode', noise: 'uNoise', invert: 'uInvert',
    feedback: 'uFeedback', zoom: 'uZoom', feedRot: 'uFeedRot', kaleido: 'uKaleido', kaleidoRot: 'uKaleidoRot', rippleR: 'uRippleR', rippleAmp: 'uRippleAmp', iris: 'uIris', letterbox: 'uLetterbox', ink: 'uInk', cycle: 'uCycle',
    temp: 'uTemp', blackout: 'uBlackout',
    ghost: 'uGhost', ghostKeep: 'uGhostKeep', blur: 'uBlur', glow: 'uGlow', glowSize: 'uGlowSize', glowCut: 'uGlowCut', grad: 'uGrad', gradA: 'uGradA', gradB: 'uGradB', gradC: 'uGradC',
    style: 'uStyle', styleR: 'uStyleR', styleMix: 'uStyleMix', paintAngle: 'uPaintAngle', paintAspect: 'uPaintAspect', washEdge: 'uWashEdge', flicker: 'uFlicker', flickerMode: 'uFlickerMode',
    feedMode: 'uFeedMode', ghostMode: 'uGhostMode', warpMode: 'uWarpMode', warpMix: 'uWarpMix', inkMode: 'uInkMode', invertMode: 'uInvertMode', scanBlend: 'uScanBlend', glowMode: 'uGlowMode', gradMode: 'uGradMode',
  };
  const GLITCH_ENTRIES = Object.entries(GLITCH_UNIFORMS);
  // Under reduced motion only the still effects reach the picture; the Painter's
  // (`paintedLook`) lets the look being painted through, all but what flashes or jitters
  // (stillFx.js).
  const stillOpts = { reducedMotion, paintedLook };
  // The site's hover on the fire (hoverAt, below): 1 while the cursor is on it, and eased,
  // how far the fire has risen, brightened and started sparking to meet it (update).
  ctx.hoverFlare = 0;
  ctx.hoverGlow = 0;
  // The page's scrolling (scroll(), below): an impulse that fades in a moment, sweeping the
  // particles and the fireflies a little the way the page moves (-1..1, + up).
  ctx.sweep = 0;

  function applyFireParams() {
    const f = effects.fire;
    // Inside the ice the fire burns low, narrow and slow.
    const banked = presence.ice / Math.max(1e-3, presence.fire + presence.ice);
    Object.assign(fire.params, {
      brightness: f.brightness * (1 - 0.25 * banked) * boost(drive.brightness) * (1 + 0.45 * ctx.hoverGlow),
      radius: f.size * (1 - 0.3 * banked) * boost(drive.size),
      rise: f.height * (1 - 0.5 * banked) * boost(drive.height),
      curlAmp: f.turbulence * (1 - 0.55 * banked) * (reducedMotion ? 0.83 : 1) * boost(drive.turbulence),
      curlFreq: f.swirl, lifeMin: Math.min(f.lifeMin, f.lifeMax), lifeMax: f.lifeMax,
      spawn: Math.min(1, presence.fire + presence.ice * effects.ice.innerFire),
      sparks: presence.fire,
    });
  }
  setElement(ctx.elementKey, true);
  applyFireParams();
  fire.flame.layers.set(LAYER_FX);
  fire.spark.layers.set(LAYER_FX);
  scene.add(fire.flame, fire.spark);
  // Breakdown mode's flow field (hidden until asked for).
  const flowView = createFlowView({ fxMaterial: effectMaterial, field, origin: FIRE_ORIGIN, params: fire.params });
  scope.trackTree(flowView.object);
  flowView.object.layers.set(LAYER_FX);
  scene.add(flowView.object);
  ctx.fireflies = null; // created once the model (and the firefly model) loads
  ctx.fx = null;        // ground flames, smoke and ash for weapon impacts
  ctx.zap = null;       // the lightning ring (lightning impacts)
  ctx.frostRing = null; // the ring of ice shards (ice impacts)
  const smokeMaterial = scope.own(createSmokeMaterial());
  const interaction = createInteraction({ reducedMotion });
  interaction.mode = effects.cursor.mode;
  interaction.strength = effects.cursor.strength;

  ctx.weapons = null; // set once the model loads
  ctx.knights = null; // ...and the knights, once theirs does (knights.js)
  // The armor's shared uniforms: the fire's place and light, the exposure, the flame's ramp,
  // its style, finish and rim (the settings', effects.knight, or Bonfire Live's: applyArmor);
  // the colors his steel snaps to and the style's line art go to the pass (pixelPass.js
  // setSteel). The pass's dither strength and matrix are shared too: the pixel styles
  // dither their band edges with them, so the Dither setting moves him with the scene.
  const armor = createArmorShared({
    fireAt: fireLight.position, exposure: pass.uniforms.exposure, resolution: pass.uniforms.resolution, moonAt: moon.position, reducedMotion,
    dither: pass.uniforms.ditherStrength, ditherScale: pass.uniforms.ditherScale,
    style: styleOr(effects.knight?.style), finish: effects.knight?.finish ?? 'gunmetal', rim: effects.knight?.rim ?? 0.5,
    onSteel: (steel, rim, o) => pass.setSteel(steel, { rim, ...o }),
  });

  // --- Flame color state: eased blends between flames (see flameEase)
  ctx.flameKey = flameOr(startingEquipment.flame);
  ctx.blend = null; // { from, to, t }
  ctx.blendMul = 1;
  ctx.debugPaletteIndex = 0;
  ctx.fewStale = true; // (the palette was set since a few colors were last put over it: keepPalette)
  ctx.currentRamp = flames[ctx.flameKey].ramp;
  const blendTime = () => (reducedMotion ? 0.4 : effects.render.colorChange);
  const white = new THREE.Color('#ffffff');
  const lightBase = new THREE.Color(); // the cast light's color before the temperature
  const lightWarm = new THREE.Color(); // ...and what a warm temperature leans it toward
  // While a weapon is being forged, the next flame's colors join the palette so
  // the forge particles and the new weapon's glow can actually show them; after
  // the impact, the flame being blended to stays in until the blend is done.
  ctx.forgeFlame = null;
  const paletteExtra = () => flames[ctx.forgeFlame] ?? (ctx.blend ? flames[ctx.blend.to] : null);
  ctx.currentShade = flames[ctx.flameKey].shade;
  ctx.currentMix = lightMix(ctx.flameKey);
  // Everything that burns in the flame's colors as they blend. (The impact rings take the
  // new colors at once instead, when a weapon lands: see impact().)
  const tinted = [fire, flowView, plasma, crystals, chill, swingTrail];
  function applyColors(f, mix) {
    ctx.currentRamp = f.ramp;
    ctx.currentShade = f.shade;
    ctx.currentMix = mix;
    for (const s of tinted) s.setRamp(f.ramp);
    // (The armor: the flame's ramp, its shade for the rim and the warm ground he mirrors, and
    // its light, which his steel's lit tones lean toward.)
    armor.setRamp(f.ramp, { shade: f.shade, mix });
    pass.uniforms.uCore.value.set(f.ramp[3]);
    if (ctx.debugPaletteIndex === 0) {
      const extra = paletteExtra();
      pass.setPalette(extra ? [...scenePalette(f), ...extra.ramp, extra.shade] : scenePalette(f), { steel: true });
      ctx.fewStale = true;
    }
    fireLight.color.set(f.ramp[1]).lerp(white, mix);
    lightBase.copy(fireLight.color);
    lightWarm.set(f.ramp[0]);
    onRamp?.(f.ramp);
  }
  applyColors(flames[ctx.flameKey], lightMix(ctx.flameKey));
  // The armor's style, finish and rim: the settings' (effects.knight), or Bonfire Live's over
  // them (fire.knights.setStyle / setFinish / setRim; null gives the settings' back).
  const armorOverride = { style: null, finish: null, rim: null };
  function applyArmor() {
    armor.setFinish(armorOverride.finish ?? effects.knight?.finish ?? 'gunmetal');
    armor.setRim(armorOverride.rim ?? effects.knight?.rim ?? 0.5);
    applyStyle();
  }
  // The style (knightStyles.js): its shader (armor.js) and its model (knights.js). A style with
  // its own model (the first build's) has it fetched and its template built (a step at a time,
  // in idle moments) once: when that style is first chosen, or beforehand (prepareStyle: Bonfire
  // Live and the Painter get them ready once the knights are in, so a roll to one at a drop
  // shows at once). Changing it on a knight who's here burns him away and forms him again in it
  // (`instant`: at once, if its model is ready; if it isn't, he burns and forms when it is,
  // never popping in whole a moment late). Resolves true once it shows, false if it couldn't
  // (no knights, the model didn't load, another style took over).
  const styleModels = new Map(); // model file -> Promise<its scene | null>
  function styleScene(file) {
    if (!styleModels.has(file)) {
      styleModels.set(file, loader.loadAsync(`${BASE}${file}`).then((g) => {
        if (scope.disposed) return null;
        scope.trackTree(g.scene);
        return g.scene;
      }, (error) => {
        // (Not tried again for half a minute: every finish or rim change asks for it.)
        console.warn(`The knight model ${file} did not load; he keeps his style.`, error);
        setTimeout(() => styleModels.delete(file), 30000);
        return null;
      }));
    }
    return styleModels.get(file);
  }
  const styleTemplates = new Map(); // model file -> Promise<its scene, its template built | null>
  const styleReady = new Map();     // model file -> its scene, once its template is built
  /** A style's model fetched and its template built in idle moments (once). Resolves with its scene, or null. */
  function prepareStyleModel(file) {
    if (file === MODELS.main) return Promise.resolve(null);
    if (!styleTemplates.has(file)) {
      const ready = styleScene(file).then((root) => (root && !scope.disposed ? knightsIn.then(() => (ctx.knights && ctx.bundle ? inSteps(ctx.bundle.templateSteps(root)) : null)) : null)).then((t) => {
        if (!t || !ctx.knights || scope.disposed) { styleTemplates.delete(file); return null; }
        ctx.knights.adoptTemplate(t);
        for (const g of ctx.knights.geometries) scope.own(g);
        styleReady.set(file, t.root);
        return t.root;
      }, (error) => {
        console.warn(`The knight model ${file} is unusable; he keeps his style.`, error);
        return null;
      });
      styleTemplates.set(file, ready);
    }
    return styleTemplates.get(file);
  }
  let styleGoal = null; // the style asked for last (it may still be loading)
  let stylePending = null; // { name, promise }: a style asked for whose model isn't ready yet
  function applyStyle({ instant = false } = {}) {
    const name = styleOr(armorOverride.style ?? effects.knight?.style);
    if (!ctx.knights) {
      // (Not there yet: the shader takes it now, the model when they come: addKnights.)
      styleGoal = name;
      if (styleModel(name) === MODELS.main) armor.setStyle(name);
      return Promise.resolve(false);
    }
    // (Asked for again while its model is on its way: the same wait, not a second swap.)
    if (stylePending?.name === name) { styleGoal = name; return stylePending.promise; }
    if (name === styleGoal && (name === ctx.knights.style || ctx.knights.restyling)) return Promise.resolve(true);
    styleGoal = name;
    const file = styleModel(name);
    const root = file === MODELS.main ? null : styleReady.get(file);
    if (file === MODELS.main || root) {
      stylePending = null;
      return ctx.knights.setStyle(name, { model: root, instant });
    }
    const promise = prepareStyleModel(file).then((scene) => {
      if (stylePending?.promise === promise) stylePending = null;
      if (styleGoal !== name || !ctx.knights || scope.disposed) return false;
      if (!scene) { styleGoal = ctx.knights.style; return false; }
      // (Late: he burns away and forms in it, the swap's own way, whatever was asked.)
      return ctx.knights.setStyle(name, { model: scene });
    });
    stylePending = { name, promise };
    return promise;
  }
  /**
   * Run `steps` (a generator: knights.js templateSteps) in idle moments, a few ms at a time,
   * so building a knight's template never stalls the fire. Resolves with its return value
   * (null if the scene is gone first).
   */
  function inSteps(steps) {
    return new Promise((resolve, reject) => {
      const slice = (deadline) => {
        if (scope.disposed) { resolve(null); return; }
        const budget = deadline?.timeRemaining ? Math.min(12, Math.max(4, deadline.timeRemaining())) : 8;
        const until = performance.now() + budget;
        try {
          let r = steps.next();
          while (!r.done && performance.now() < until) r = steps.next();
          if (r.done) resolve(r.value);
          else idle(slice);
        } catch (error) { reject(error); }
      };
      idle(slice);
    });
  }
  /**
   * Run `steps` only in time the page truly has spare, for work nobody waits on (the places
   * built beforehand: prepareSceneries). Unlike inSteps there's no timeout, and a step starts
   * only with the time it needs still left of the idle moment, so it ends before the next
   * frame is due: each yields how many ms the next one needs (a number), or nothing
   * (SMALL_STEP_MS), or a promise for the next to wait on, the page idle meanwhile. (A need is
   * capped at STEP_FRAME_SHARE of the display's frame, measured first: a step bigger than any
   * moment, a place's build on a fast screen, starts at the start of an empty one, and runs a
   * few ms past it.) On a page with no spare time (a busy phone) nothing runs, and whoever
   * needs the work first does it then (sceneryOf). Needs requestIdleCallback (Safari has none:
   * its places are built on their first visit). Resolves with the return value (null if the
   * scene is gone first).
   */
  function inIdle(steps) {
    return new Promise((resolve, reject) => {
      let need = SMALL_STEP_MS;
      let frameMs = 1000 / 60;
      const next = () => requestIdleCallback(slice);
      /** @param {IdleDeadline} deadline */
      const slice = (deadline) => {
        if (scope.disposed) { resolve(null); return; }
        try {
          while (deadline.timeRemaining() >= Math.min(need, frameMs * STEP_FRAME_SHARE)) {
            const r = steps.next();
            if (r.done) { resolve(r.value); return; }
            if (typeof r.value?.then === 'function') {
              need = SMALL_STEP_MS;
              r.value.then(next, next);
              return;
            }
            need = typeof r.value === 'number' ? r.value : SMALL_STEP_MS;
          }
          next();
        } catch (error) { reject(error); }
      };
      // (The display's frame first: the shortest of a few, frames being only ever late.)
      let last = -1;
      let frames = 0;
      let shortest = Infinity;
      const measure = (now) => {
        if (scope.disposed) { resolve(null); return; }
        if (last >= 0) shortest = Math.min(shortest, now - last);
        last = now;
        if (++frames <= 8) { requestAnimationFrame(measure); return; }
        if (shortest > 0 && Number.isFinite(shortest)) frameMs = shortest;
        next();
      };
      requestAnimationFrame(measure);
    });
  }

  // --- Model
  const candleFlames = [];
  // Every glow in its flame-step colors (update: recolorGlows), each by its index here. The
  // model's own (the coals in the ash) come first and burn in every place; each place's join
  // them as it's first built (setScenery), and only the current place's are recolored.
  const glows = [];
  ctx.sharedGlows = 0; // (how many are the model's)
  ctx.ready = false;
  ctx.targetLevel = 1;

  const draco = scope.own(new DRACOLoader());
  const loader = new GLTFLoader().setDRACOLoader(draco);
  // The knight is fetched alongside, his code with his model (knightBundle.js: a chunk of its
  // own); either failing only leaves him out. On the site, when he isn't there from the start
  // (his sign waits for him, or he isn't allowed), the fire doesn't wait for him: he's built
  // after its first frame (knightsIn).
  ctx.bundle = null; // knightBundle.js, once loaded
  ctx.knightsShown = true; // (false while he and his sign are made but not yet in the scene: knightsIn)
  const knightLoaded = Promise.all([loader.loadAsync(`${BASE}models/knight.glb`), import('./knightBundle.js')]).then(([gltf, code]) => {
    ctx.bundle = code;
    return gltf.scene;
  }).catch((error) => {
    console.warn('The knight did not load; the fire burns without him.', error);
    return null;
  });
  const knightLater = !fxLayer && !(effects.knight?.show && effects.knight?.arrival === 'start');
  const modelLoaded = Promise.all([loader.loadAsync(`${BASE}models/bonfire.glb`), knightLater ? null : knightLoaded]).then(([gltf, knightScene]) => {
    const root = gltf.scene;
    if (scope.disposed) {
      const late = createResourceScope();
      late.trackTree(root);
      if (knightScene) late.trackTree(knightScene);
      late.dispose();
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
    // The ruins' seat for the knight (scenery.js): a drum fallen from the pillar, one of the
    // ruins' own pieces from here on (its solid, its shadow, the fireflies' height map).
    const ruinsSeat = buildScenery('ruins', { pillar: root.getObjectByName('Static_Pillar')?.material ?? new THREE.MeshLambertMaterial() }, () => null);
    ruinsSeat.group.traverse((o) => { if (o.isMesh) o.name = 'Static_PillarDrum'; });
    root.add(ruinsSeat.group);
    root.updateMatrixWorld(true);
    ctx.weapons = createWeapons(root, {
      anchor: WEAPON_ANCHOR,
      layerSolid: LAYER_SOLID,
      layerGhost: LAYER_GHOST,
      layerFx: LAYER_FX,
      particleMaterial: effectMaterial,
      // Each element's forge particles in its own shape (signatures.js).
      materials: { fire: effectMaterial, lightning: crossMaterial, ice: diamondMaterial },
      field,
      particles: pCount(P.forge),
      castShadows: renderer.shadowMap.enabled,
      reducedMotion,
      hooks: {
        // The fire sinks while the weapon is forged, and every firefly lights up.
        onSwapStart: (selection) => {
          const nextFlame = selection.flame;
          ctx.weapons.auraElement = selection.element ?? ctx.elementKey;
          ctx.targetLevel = 0.6;
          ctx.forgeFlame = nextFlame;
          // A blend still running from the last swap finishes quickly, so the
          // palette has room for the next flame.
          if (ctx.blend) ctx.blend.fast = true;
          applyColors({ ramp: ctx.currentRamp, shade: ctx.currentShade }, ctx.currentMix);
        },
        // The new weapon finishing its form lands like a hit: a jolt and a flare.
        onFormed: () => {
          hit(0.45, { freeze: false });
          fire.burst(0.45);
          armor.flare(0.8);
          onFormed?.();
        },
        // An element's own big moment in the forge (a bolt out of the sky, the frozen blade
        // shattering, the ice cocoon cracking off): a flash and a jolt.
        onForgeStrike: (weight) => hit(weight, { freeze: false }),
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
          hit(kind === 'slash' ? 0.15 : 0.3, { flash: false });
          // A blow that reaches the ground marks it and kicks up debris.
          if (tip.y - (ctx.terrainTop?.(tip.x, tip.z) ?? 0) < 0.3) scar(tip.x, tip.z, 0.5);
        },
        onSwingImpact: () => {
          ring(1.2);
          fire.burst(1.1 * flameShare(ctx.elementKey));
          hit(1);
          scar(FIRE_ORIGIN.x, FIRE_ORIGIN.z, 1);
          ctx.swingDone?.();
          ctx.swingDone = null;
        },
      },
    });

    scope.trackTree(ctx.weapons.holder); scope.trackTree(ctx.weapons.forge);
    if (ctx.weapons.lines) { scope.trackTree(ctx.weapons.lines); scene.add(ctx.weapons.lines); }
    for (const o of ctx.weapons.extras) { scope.trackTree(o); scene.add(o); }
    scope.cleanup(() => ctx.weapons.cancel());
    const flyTemplate = root.getObjectByName('Firefly');
    flyTemplate.removeFromParent();
    // Solid scenery: fireflies steer around it with a height map and land on its
    // tops and walls (exact contact points and normals come from raycasts).
    const statics = [];
    root.traverse((o) => { if (o.isMesh && o.name.startsWith('Static_')) statics.push(o); });
    // The ruins' own pieces (hidden in the other sceneries: scenery.js).
    ctx.ruinsOnly = statics.filter((o) => /Static_(Pillar|Mortar|Wax)/.test(o.name));
    ctx.baseStatics = statics.filter((o) => !ctx.ruinsOnly.includes(o));
    ctx.liveStatics = statics;
    terrains.ruins = createTerrain(renderer, statics, { material: terrainMaterial });
    // The fireflies (and the strikes, mist and debris) read whichever scenery's height map is current.
    const now = () => terrains[ctx.sceneryKey];
    const terrain = {
      height: (x, z) => now().height(x, z),
      top: (x, z) => now().top(x, z),
      solid: (x, z) => now().solid(x, z),
      slope: (x, z, out) => now().slope(x, z, out),
      get wallSpots() { return now().wallSpots; },
      get cell() { return now().cell; },
    };
    const ray = new THREE.Raycaster();
    const normalMatrix = new THREE.Matrix3();
    const raycast = (origin, dir, far) => {
      ray.set(origin, dir);
      ray.far = far;
      const hit = ray.intersectObjects(ctx.liveStatics, false)[0];
      if (!hit?.face) return null;
      const normal = hit.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      if (normal.dot(dir) > 0) normal.negate();
      return { point: hit.point.clone(), normal };
    };
    ctx.fireflies = createFireflies(flyTemplate, {
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
    scope.trackTree(ctx.fireflies.group);
    if (ctx.fireflies.trails) { scope.trackTree(ctx.fireflies.trails); ctx.fireflies.trails.layers.set(LAYER_FX); scene.add(ctx.fireflies.trails); }
    ctx.fireflies.setRamp(ctx.currentRamp);
    scene.add(ctx.fireflies.group);

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
        if (/Ground|Flagstone|Ash/.test(o.name)) marks.patch(o.material); // hits mark the floor
        o.castShadow = !/Ground|Flagstone/.test(o.name);
        o.receiveShadow = true;
      }
    });
    ctx.sharedGlows = glows.length;
    candleLight.position.copy(candlePos).add(new THREE.Vector3(0.1, 0.25, 0.3));
    ctx.ruinsOnly.push(...candleFlames.map((c) => c.mesh));
    // The model's materials, for the other sceneries.
    for (const [key, name] of [['stone', 'Stone'], ['pillar', 'Pillar'], ['wood', 'Wood'], ['char', 'Charred'], ['wax', 'Wax'], ['mortar', 'Mortar']]) {
      sceneryMaterials[key] = root.getObjectByName(`Static_${name}`)?.material;
    }

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
    ctx.fx = createImpactFx({
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
    for (const object of [ctx.fx.ring, ctx.fx.embers, ctx.fx.wave, ctx.fx.haze, ctx.fx.puff, ctx.fx.flecks]) scope.trackTree(object);
    for (const l of ctx.fx.lights) scene.add(l);
    ctx.fx.ring.layers.set(LAYER_FX);
    ctx.fx.embers.layers.set(LAYER_FX);
    ctx.fx.wave.layers.set(LAYER_FX);
    ctx.fx.haze.layers.set(LAYER_GHOST);
    ctx.fx.puff.layers.set(LAYER_GHOST);
    ctx.fx.flecks.layers.set(LAYER_GHOST);
    ctx.fx.setRamp(ctx.currentRamp);
    scene.add(ctx.fx.ring, ctx.fx.embers, ctx.fx.wave, ctx.fx.haze, ctx.fx.puff, ctx.fx.flecks, ctx.weapons.forge);
    const ground = new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z);
    // Lightning strikes and cold mist follow the scenery's surface (the fireflies' height map).
    plasma.setGround(terrain.top);
    chill.setGround(terrain.top);
    ctx.terrainTop = terrain.top;
    for (const d of Object.values(debris)) d.setGround(terrain.top);
    ctx.zap = createLightningRing({ fxMaterial: effectMaterial, sparkMaterial: crossMaterial, origin: ground, field, reach, ground: terrain.top, emitters: coarse ? 72 : 96, sparks: impactCount(260), lights: coarse ? 4 : 6, reducedMotion });
    ctx.frostRing = createIceRing({ fxMaterial: effectMaterial, glintMaterial: diamondMaterial, origin: ground, field, reach, chill, chips: impactCount(320), lights: coarse ? 4 : 6, reducedMotion });
    for (const o of [...ctx.zap.objects, ...ctx.frostRing.objects]) { scope.trackTree(o); o.layers.set(LAYER_FX); scene.add(o); }
    ctx.frostRing.solid.layers.set(LAYER_SOLID);
    for (const l of [...ctx.zap.lights, ...ctx.frostRing.lights]) scene.add(l);
    ctx.zap.setRamp(ctx.currentRamp);
    ctx.frostRing.setRamp(ctx.currentRamp);
    ctx.sets = [...fire.sets, ...plasma.sets, ...crystals.sets, ...chill.sets, ...ctx.fx.sets, ...ctx.zap.sets, ...ctx.frostRing.sets];
    named([ctx.fx.ring], 'Ring of fire');
    named([ctx.fx.embers], 'Embers');
    named([ctx.fx.haze, ctx.fx.puff], 'Smoke');
    named([ctx.fx.flecks], 'Ash');
    named(ctx.zap.objects, 'Lightning ring');
    named(ctx.frostRing.objects, 'Ice ring');
    named([ctx.weapons.forge], 'Forge (weapon swap)');
    if (ctx.fireflies.trails) named([ctx.fireflies.trails], 'Firefly trails');

    scene.add(root, ctx.weapons.holder);
    ctx.weapons.setRim(ctx.currentRamp[2]);
    ctx.weapons.set(startingEquipment.weapon);
    if (knightScene) addKnights(knightScene);
    // Every light on every layer: each pass (frame.js) then sees the same lights, so the lit
    // materials aren't re-set-up for a different light count every frame (the particles'
    // pass has no lit materials: they change nothing there).
    scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });
    ctx.ready = true;

  });

  /**
   * The knights (knights.js) from their model (`template`: its template, built beforehand in
   * idle moments). None is there at first: on the site the first comes when he's summoned
   * (knightArrival.js: his sign on the ground, the pack) unless the settings have him there
   * from the start; Bonfire Live casts its own (knightShow.js). Returns what goes in the scene
   * (his and his sign's objects): put there now, or (`attach` false) by the caller.
   */
  function addKnights(model, { template = null, attach = true } = {}) {
    scope.trackTree(model);
    try {
      ctx.knights = ctx.bundle.createKnights(model, {
        layerSolid: LAYER_SOLID, layerGhost: LAYER_GHOST, castShadows: renderer.shadowMap.enabled, armor,
        max: coarse ? 2 : 4, reducedMotion, template,
        onSparks: (list) => fire.emitSparks(list),
      });
    } catch (error) {
      console.warn('The knight model is unusable; the fire burns without him.', error);
      ctx.knights = null;
      return [];
    }
    for (const r of [...ctx.knights.materials, ...ctx.knights.geometries]) scope.own(r);
    scope.trackTree(ctx.knights.group);
    const skeletons = ctx.knights.skeletons;
    scope.cleanup(() => skeletons.forEach((s) => s.dispose()));
    const objects = [ctx.knights.group];
    tinted.push(ctx.knights);
    ctx.knights.setRamp(ctx.currentRamp);
    // (His style's model, if it isn't the knight's own: as he first comes, at once.)
    styleGoal = null;
    applyStyle({ instant: true });
    ctx.knights.setScenery(ctx.sceneryKey, terrains[ctx.sceneryKey]);
    fitKnights();
    if (siteKnight) objects.push(...addArrival());
    applyKnight(true);
    if (attach) scene.add(...objects);
    return objects;
  }

  // --- The site's knight (effects.knight). He comes and goes (knightArrival.js): away, his
  // summon sign glows on the ground in front of his seat (summonSign.js) and a click on it,
  // or the pack, summons him; arriving, the sign burns away into him in the current element's
  // own way (the weapon swap's forge); resting a while (effects.knight.rest); leaving, he
  // burns away into the sign. effects.knight.show allows him at all; arrival 'start' has him
  // there from the first frame (and staying) instead. His helmet: the setting's, or for
  // 'random' a new one on each summon, unless the visitor picked one in the pack
  // (`knightHelmet`, remembered by main.js; a pick holds for the visit). A helmet setting
  // changed in the admin shows at once. Bonfire Live (`effects`) casts its own knights and
  // leaves all this alone.
  const siteKnight = !fxLayer;
  let knightSetting = null; // the helmet setting last applied (null: none yet)
  ctx.helmetGoal = null;    // the helmet knight 0 has on or is putting on (fire.knights.helmet)
  ctx.visitorHelmet = HELMETS.includes(knightHelmet) ? knightHelmet : null;
  let arrivalSetting = null; // effects.knight.arrival as last applied
  let showSetting = null;    // ...and effects.knight.show
  ctx.sign = null;          // his summon sign (summonSign.js), on the site
  ctx.arrival = null;       // ...and his comings and goings (knightArrival.js)
  const presenceListeners = new Set();
  function wearHelmet(name, o = {}) {
    if (!ctx.knights || !HELMETS.includes(name)) return Promise.resolve(false);
    if (o.index == null || o.index === 0) ctx.helmetGoal = name;
    return ctx.knights.setHelmet(name, o);
  }
  /** The helmet he comes in: the setting's, the visitor's pick, or a new one at random. */
  function helmetForSummon() {
    const setting = effects.knight.helmet;
    if (HELMETS.includes(setting)) return setting;
    if (ctx.visitorHelmet) return ctx.visitorHelmet;
    const others = HELMETS.filter((h) => h !== ctx.helmetGoal);
    return others[Math.floor(Math.random() * others.length)];
  }
  /** Where his sign lies in a scenery: in front of the seat (knightPlaces.js), on the ground there. */
  function signPlace(name) {
    const s = SEATS[name]?.sign ?? SEATS.ruins.sign;
    const t = terrains[name];
    let y = 0;
    if (t) for (const dx of [-0.2, 0, 0.2]) for (const dz of [-0.25, 0, 0.25]) y = Math.max(y, t.height(s.x + dx, s.z + dz));
    return { x: s.x, y: Math.min(0.08, y) + 0.004, z: s.z, yaw: s.yaw };
  }
  /** The sign and the arrival (the site's knight), once there are knights. Returns their objects (for the scene). */
  function addArrival() {
    ctx.sign = ctx.bundle.createSummonSign({ layer: LAYER_GHOST, layerSolid: LAYER_SOLID, layerFx: LAYER_FX, moteMaterial: effectMaterial, exposure: pass.uniforms.exposure, reducedMotion });
    for (const r of [...ctx.sign.geometries, ...ctx.sign.materials]) scope.own(r);
    scope.trackTree(ctx.sign.group); scope.trackTree(ctx.sign.motes);
    ctx.sign.setRamp(ctx.currentRamp);
    tinted.push(ctx.sign);
    ctx.arrival = ctx.bundle.createKnightArrival({
      knights: ctx.knights, sign: ctx.sign, particleMaterial: effectMaterial,
      materials: { fire: effectMaterial, lightning: crossMaterial, ice: diamondMaterial },
      layerFx: LAYER_FX, field, anchor: WEAPON_ANCHOR, count: pCount(P.forge), reducedMotion,
      now: () => ({ element: ctx.elementKey, ramp: ctx.currentRamp }),
      // (effects.knight's rest is in minutes, rolled between the two on each arrival; one not
      // set: knightArrival.js REST's.)
      rest: () => [effects.knight.restMin, effects.knight.restMax].map((m) => m * 60),
      // (His rest running out waits while he's mid-gesture, changing his helmet or style, or
      // looking at the cursor on him.)
      busy: () => !!ctx.knights?.busyAt(0) || ctx.knights?.hovered === 0,
      hooks: {
        onForgeStrike: (w) => hit(w, { freeze: false }),
        // He's whole: a light hit, and the fire's reflection sweeps his new armor.
        onFormed: (which) => {
          hit(which === 'knight' ? 0.35 : 0.2, { freeze: false });
          if (which === 'knight') { armor.flare(0.8); fire.burst(0.3 * flameShare(ctx.elementKey)); }
        },
      },
    });
    for (const o of ctx.arrival.objects) scope.trackTree(o);
    ctx.arrival.onPresence((p) => { for (const fn of presenceListeners) fn(p); });
    ctx.arrival.setScenery(signPlace(ctx.sceneryKey));
    return [ctx.sign.group, ctx.sign.motes, ...ctx.arrival.objects];
  }
  function applyKnight(first = false) {
    if (!ctx.knights || !siteKnight) return;
    const { show, helmet } = effects.knight;
    const mode = effects.knight.arrival ?? 'sign';
    // The fire's reflection sweeping his armor, at rest now and then and when the fire flares.
    const shine = effects.knight.shine ?? true;
    armor.setShine({ rest: shine, flares: shine });
    // How he sits: resting (the Dark Souls rest) or watchful (only a change eases him over).
    const seat = effects.knight.seat ?? 'resting';
    if (ctx.knights.seatPose !== undefined && seat !== ctx.knights.seatPose) ctx.knights.setSeatPose(seat);
    ctx.arrival.allowed = !!show;
    ctx.arrival.resting = mode !== 'start';
    // There from the start: at load, or the moment the settings say so (the admin's preview:
    // arrival turned to it, or Show turned back on with it).
    if (show && mode === 'start' && (arrivalSetting !== 'start' || !showSetting) && ctx.arrival.presence === 'away') {
      wearHelmet(helmetForSummon(), { index: 0, instant: true });
      ctx.arrival.summon({ instant: true });
    }
    arrivalSetting = mode;
    showSetting = !!show;
    if (helmet === knightSetting) return;
    const was = knightSetting;
    knightSetting = helmet;
    // (A fixed helmet set in the admin shows at once; 'random' waits for the next summon.)
    if (!first && was !== null && HELMETS.includes(helmet)) wearHelmet(helmet, { index: 0, instant: ctx.arrival.presence !== 'resting' });
  }
  /**
   * The visitor did something with the site's knight (a gesture from the pack or a click on
   * him, a new helmet): his rest is topped up so he doesn't leave right after (a minute at least).
   */
  const busyWithHim = (index = 0) => { if (index == null || index === 0 || index === 'all') ctx.arrival?.extendRest(60); };
  /** Summon the site's knight (through the forge from his sign; `instant`: at once). False if he can't come now. */
  function summonKnight({ instant = false } = {}) {
    if (!ctx.arrival || !ctx.knightsShown || ctx.arrival.presence !== 'away' || !ctx.arrival.allowed) return false;
    wearHelmet(helmetForSummon(), { index: 0, instant: true });
    return ctx.arrival.summon({ instant });
  }
  // Whether the knights react (flinch, lean, hop, watch a weapon in flight): the site's
  // follows effects.knight.reactions; Bonfire Live switches its own (setReactions).
  ctx.liveReactions = true;
  const reacts = () => (siteKnight ? effects.knight.reactions : ctx.liveReactions);
  /** Something happened at the fire (knights.js react), if the knights mind it (reacts). */
  function reactKnights(kind, strength, where) { if (ctx.knights && reacts()) ctx.knights.react(kind, strength, where); }

  // --- Scenery (scenery.js): the ruins, the forge or the shrine around the fire. Each has
  // its own height map for the fireflies. In Bonfire Live and the Painter the other places
  // and their height maps are built in idle moments a while after the show starts
  // (prepareSceneries, below), so the first visit to one only puts it in the scene: built
  // then, a place and its map (a draw of the whole place read back from the GPU) froze the
  // frame it came on. (Still built then if it's asked for before they're ready, and on the site.)
  ctx.sceneryKey = 'ruins';
  ctx.ruinsOnly = [];
  ctx.baseStatics = [];
  ctx.liveStatics = [];
  const terrains = {};
  const terrainMaterial = scope.own(createTerrainMaterial()); // (one for every height map: its shader built once)
  const sceneryMaterials = {};
  const sceneries = {};
  const building = {}; // a place being built in idle moments (sceneryParts), till it's done
  /** A place's pieces (scenery.js), built once (prepareSceneries, or its first visit), not yet in the scene. */
  function sceneryOf(name) {
    if (!sceneries[name]) {
      // (One being built in idle moments is finished now, at once.)
      const steps = building[name] ?? sceneryParts(name);
      while (!steps.next().done);
    }
    return sceneries[name];
  }
  /**
   * sceneryOf a step at a time: its pieces built (the biggest step), merged a few at a time
   * (sceneryMerge.js), then readied to show. Not in sceneries till the last step.
   */
  function* sceneryParts(name) {
    const s = buildScenery(name, sceneryMaterials, () => new THREE.MeshBasicMaterial({ color: ctx.currentRamp[1], fog: false }), { merge: false });
    yield;
    yield* mergeSteps(s.group, s.glows);
    s.group.traverse((o) => { if (o.isMesh) { o.layers.set(s.glows.includes(o) ? LAYER_GHOST : LAYER_SOLID); scope.trackTree(o); } });
    s.group.updateMatrixWorld(true);
    // (Its pieces never move: their matrices are made here, once, and not again every frame.
    // The glows keep theirs up to date: a candle's flame stretches.)
    s.group.traverse((o) => { if (!s.glows.includes(o)) o.matrixAutoUpdate = false; });
    s.solids = [];
    s.group.traverse((o) => { if (o.isMesh && !s.glows.includes(o)) s.solids.push(o); });
    s.shown = false;
    sceneries[name] = s;
    delete building[name];
  }
  /** What a place's height map is drawn from: the model's ground and stones, and the place's solids. */
  const staticsOf = (name) => (name === 'ruins' ? [...ctx.baseStatics, ...ctx.ruinsOnly.filter((o) => o.name.startsWith('Static_'))] : [...ctx.baseStatics, ...sceneryOf(name).solids]);
  /** The height map the fireflies (and the strikes, the mist, the debris) read in a place. */
  function terrainOf(name) {
    terrains[name] ??= createTerrain(renderer, staticsOf(name), { material: terrainMaterial });
    return terrains[name];
  }
  /** Move the fire to another place (SCENERIES). `flash`: the change lands like a hit, a flash hiding the cut. */
  function setScenery(name, { flash = false } = {}) {
    if (!ctx.ready || !SCENERIES[name] || name === ctx.sceneryKey) return false;
    if (flash) { hit(0.6, { freeze: false }); fire.burst(0.6 * flameShare(ctx.elementKey)); }
    // (A place not shown is out of the scene, so no pass walks its pieces; the ruins' own are
    // the model's, hidden.)
    const show = (key, on) => {
      if (key === 'ruins') { for (const o of ctx.ruinsOnly) o.visible = on; return; }
      if (on) scene.add(sceneries[key].group);
      else sceneries[key].group.removeFromParent();
    };
    const revisit = !!sceneries[name]?.shown;
    if (name !== 'ruins' && !revisit) {
      // First shown: its glows join the recolored ones (their numbers, in the order the places
      // are first shown, pick each one's flicker), in the flame's color of this moment.
      const s = sceneryOf(name);
      for (const g of s.glows) g.material.color.set(ctx.currentRamp[1]);
      s.glowFrom = glows.length;
      glows.push(...s.glows);
      s.glowTo = glows.length;
      s.shown = true;
    }
    show(ctx.sceneryKey, false);
    show(name, true);
    // (A place shown again takes the colors its glows would have had at the last flame step,
    // as if they'd been recolored all along while it was hidden.)
    if (revisit && ctx.flameStep >= 0) recolorGlows(sceneries[name].glowFrom, sceneries[name].glowTo, ctx.flameStep);
    ctx.sceneryKey = name;
    // Its lamps take the pool's lights (the rest go dark; the candle's is the ruins' own: see update()).
    const list = sceneries[name]?.lights ?? [];
    if (name !== 'ruins') candleLight.intensity = 0;
    lamps.forEach((l, i) => {
      const d = list[i];
      l.userData.base = d ? d.intensity : 0;
      l.intensity = l.userData.base;
      if (d) { l.position.copy(d.at); l.distance = d.distance; }
    });
    ctx.liveStatics = staticsOf(name);
    terrainOf(name);
    // His sign moves to the seat there (a summoning or a leaving under way ends at once), and
    // the knights take their places there, forming out of embers.
    ctx.arrival?.setScenery(signPlace(name));
    ctx.knights?.setScenery(name, terrains[name]);
    ctx.shadowFrames = 2;
    return true;
  }

  // --- Fire level (stoking, UI puffs, weapon impacts)
  let firstStoke = true;
  function stoke() {
    fire.params.level = Math.min(2.4, fire.params.level + effects.fire.stoke);
    fire.burst(Math.min(1.5, effects.fire.stoke / 0.9));
    if (ctx.elementKey === 'lightning') { plasma.discharge(0.5); ctx.zap?.crackle(0.35, 3); }
    if (ctx.elementKey === 'ice') { crystals.burst(0.6); crystals.beat(0.8); crystals.echo(); }
    // Every stoke throws a smaller ring of the element too (skipped under reduced motion).
    ring(0.6, { quiet: true });
    ctx.weapons?.beat(1); // the planted weapon shudders
    hit(0.4, { freeze: false });
    // Lightning reaches for the nearest firefly.
    if (ctx.elementKey === 'lightning') strikeFirefly(1);
    reactKnights('stoke');
    armor.flare(1); // (the flare's reflection sweeps across the knights' armor)
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
    const old = ctx.flameKey;
    ctx.flameKey = nextFlame ?? ctx.flameKey;
    ctx.blend = { from: old, to: ctx.flameKey, t: 0 };
    ctx.forgeFlame = null;
    const ramp = flames[ctx.flameKey].ramp;
    for (const r of [ctx.fx, ctx.zap, ctx.frostRing]) r.setRamp(ramp);
    ctx.weapons.setRim(ramp[2]); // the new weapon arrives rimmed in its new color
    // The bonfire takes the new element. The fire erupts (or the ball discharges,
    // or the ice flashes), a ring races across the ground — flame with a puff of
    // smoke and ash, lightning, or ice shards — and the fireflies scatter.
    setElement(selection.element ?? ctx.elementKey);
    fire.params.level = reducedMotion || stationary ? 2 : 3.2;
    ctx.targetLevel = 1;
    fire.burst((reducedMotion ? 0.8 : 1.7) * flameShare(ctx.elementKey));
    if (ctx.elementKey === 'lightning') { ctx.zap.burst(effects.lightning.height); plasma.discharge(1); }
    else if (ctx.elementKey === 'ice') { ctx.frostRing.burst(); crystals.burst(1); }
    else ctx.fx.burst();
    ctx.fireflies.burst(flames[ctx.flameKey].ramp);
    reactKnights('impact', stationary ? 0.5 : 1);
    reactKnights('ring');
    armor.flare(1);
    hit(stationary ? 0.5 : 1);
    scar(FIRE_ORIGIN.x, FIRE_ORIGIN.z, 1.2);
    // The new ball needs a moment to grow in before it can reach for a firefly.
    if (ctx.elementKey === 'lightning') ctx.strikeAt = ctx.simT + 0.5;
    onImpact?.(ctx.flameKey, old, stationary, { ...selection, weapon: weaponKey });
  }

  /**
   * Swap weapon + flame color. Resolves at impact. `pace` and `hold` go to the swap
   * (see weapons.js): the visualizer times the impact to the beat, or holds the new
   * weapon over the fire until release().
   */
  function equip(weaponKey, key, { instant = false, item = null, element = ctx.elementKey, pace = 1, hold = false, rush = false } = {}) {
    return loaded.then(() => {
      if (scope.disposed) return { status: 'cancelled' };
      if (!Object.hasOwn(flames, key)) throw new Error('Unknown flame: ' + key);
      const selection = { weapon: weaponKey, flame: key, item, element: elementOr(element) };
      if (instant) {
        ctx.weapons.set(weaponKey);
        setElement(selection.element, true);
        ctx.flameKey = key;
        ctx.blend = null;
        ctx.forgeFlame = null;
        applyColors(flames[key], lightMix(key));
        ctx.weapons.setRim(flames[key].ramp[2]);
        ctx.fireflies?.setRamp(flames[key].ramp);
        ctx.targetLevel = 1;
        onImpact?.(key, key, true, selection);
        return { status: 'applied' };
      }
      return ctx.weapons.swap(weaponKey, flames[ctx.flameKey].ramp, flames[key].ramp, selection, { pace, hold, rush });
    });
  }

  /**
   * A beat (the visualizer): the fire kicks up, the ball crackles, the ice pulses.
   * `strength` 0..1; `accent` marks a downbeat (a bigger hit); the fireflies blink along
   * unless `blink` is off.
   */
  function pulse(strength = 1, { accent = false, blink = true } = {}) {
    if (!ctx.ready || reducedMotion) return;
    const s = Math.min(1, Math.max(0, strength));
    fire.burst(0.45 * s * (accent ? 1.5 : 1) * flameShare(ctx.elementKey));
    if (ctx.elementKey === 'lightning') {
      ctx.zap.crackle(0.12 + 0.15 * s, Math.round(2 + 3 * s + (accent ? 3 : 0)));
      if (accent) { plasma.discharge(0.35 * s); if (Math.random() < effects.impact.fireflyStrikes) strikeFirefly(s); }
    } else if (ctx.elementKey === 'ice') {
      crystals.burst(0.4 * s * (accent ? 1.5 : 1));
      crystals.beat(s * (accent ? 1 : 0.7));
    }
    if (blink) ctx.fireflies.pulse(accent ? s : s * 0.45);
    ctx.weapons.beat(s * (accent ? 1 : 0.6));
    ctx.knights?.beat(s * (accent ? 1 : 0.6));
  }
  /**
   * The current element's ring, without a new weapon or colors: a ring of fire, of
   * lightning or of ice shards races out across the ground (the visualizer's extra hits).
   */
  function ring(strength = 1, { quiet = false } = {}) {
    if (!ctx.ready || reducedMotion) return;
    const s = Math.min(1.5, Math.max(0, strength));
    if (!quiet) hit(0.35 * s, { freeze: false, flash: false, shake: false });
    scar(FIRE_ORIGIN.x, FIRE_ORIGIN.z, s, { ring: true });
    if (ctx.elementKey === 'lightning') { ctx.zap.burst(effects.lightning.height); plasma.discharge(0.6 * s); }
    else if (ctx.elementKey === 'ice') { ctx.frostRing.burst(); crystals.burst(0.8 * s); crystals.beat(1); crystals.echo(); }
    else { ctx.fx.burst(); fire.burst(0.9 * s); }
    fire.params.level = Math.max(fire.params.level, 1.6 + s);
    reactKnights('ring', s);
    armor.flare(0.45 + 0.4 * Math.min(1, s));
    jolt(0.12 * s);
  }
  /** Lightning jumps from the ball to the nearest firefly within reach, which flickers hot. */
  function strikeFirefly(power = 1) {
    if (!ctx.fireflies || ctx.elementKey !== 'lightning' || reducedMotion || effects.impact.fireflyStrikes <= 0) return false;
    const f = ctx.fireflies.nearest(plasma.center, 1.4 + effects.lightning.size * 2);
    if (!f || !plasma.jump(f.pos)) return false;
    ctx.fireflies.zap(f, plasma.center, power);
    return true;
  }
  /** An echo of the planted weapon's silhouette bursts out of it (and in ice, the crystals' outlines). */
  function echo() {
    if (!ctx.ready) return;
    ctx.weapons.echo(ctx.currentRamp, ctx.elementKey);
    if (ctx.elementKey === 'ice') crystals.echo();
  }
  /**
   * The living blade (the visualizer): the planted weapon leaves the fire for a routine of
   * moves and plunges back in. plan { hits: [s, …], plunge: s } in seconds from now, and
   * optionally { moves, alive, basis, onMove, onHit } (see weapons.swing). Each move takes
   * its plane from the camera (`basis`, by default where the camera is headed) as it
   * begins. Resolves when the blade is back in the fire (false if it can't swing).
   */
  ctx.swingDone = null;
  function swing(plan) {
    if (!ctx.ready || reducedMotion) return Promise.resolve(false);
    // (It fights clear of the knights: each move's shape avoids them where they are then.)
    const basis = plan.basis ?? view.axes;
    const clearOfKnights = () => Object.assign(basis(), { avoid: ctx.knights?.capsules() ?? [] });
    if (!ctx.weapons.swing({ ...plan, basis: clearOfKnights })) return Promise.resolve(false);
    return new Promise((resolve) => { ctx.swingDone = () => resolve(true); });
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
    if (!ctx.ready || reducedMotion) return;
    fire.sparkle(Math.round(n * ambient()));
  }

  // --- Camera (view.js) and cursor (pointer.js). Each frame the path the cursor traced
  // is handed to the interaction model, which moves flames, sparks and fireflies.
  const view = createView(camera, { reducedMotion, sway: swayAmount });
  const timer = new THREE.Timer(); // (advanced once per rendered frame; paused time is skipped)
  const pointer = createPointer(timer, { signal: events.signal });
  ctx.sets = [...fire.sets, ...plasma.sets, ...crystals.sets, ...chill.sets]; // particle sets the cursor moves (the rings join on load)

  // --- Sizing (fixed on-screen pixel size; the render target scales instead)
  const settings = { pixelSize: null };
  ctx.size = { w: 1, h: 1, pd: 4 };
  const isSmall = () => container.clientWidth < 700;
  const pixelSize = () => settings.pixelSize ?? (isSmall() ? effects.render.pixelSizeSmall : effects.render.pixelSize);
  // --- Render options: the settings' own (effects.render), or absolute values over them
  // (the visualizer's Render tab: setRender, setPalette, setFog, setShadows, setXray). An
  // override stands until it's cleared, applyEffects (the admin preview) included; with
  // none set, everything is exactly as the settings say (the site never sets one).
  const renderOverride = {};
  // Settings read live where they're used (the flame's frame rate, how long a color change
  // takes, how hits land): an override writes through to them, and clearing it puts the
  // settings' own value back. (A value there that isn't the override's is the settings'
  // own: the admin preview replaced it.) The hit ones take true (the settings' own) or
  // false (none: the value after the name).
  const WRITE_THROUGH = {
    flameFps: ['fire', 'fps'], colorChange: ['render', 'colorChange'],
    hitStop: ['impact', 'hitStop', 0], hitFlash: ['impact', 'flash', 0], debris: ['impact', 'debris', 0], marks: ['impact', 'marks', false],
  };
  const ownValues = {};
  function applyRender() {
    const r = { ...effects.render, ...renderOverride };
    pass.uniforms.ditherStrength.value = r.dither;
    pass.uniforms.ditherScale.value = r.ditherMatrix;
    pass.uniforms.outlines.value = r.outlines ? 1 : 0;
    pass.uniforms.vignette.value = r.vignette;
    pass.uniforms.exposure.value = r.exposure;
    for (const [key, [section, name]] of Object.entries(WRITE_THROUGH)) {
      const live = effects[section];
      if (key in renderOverride) {
        if (live[name] !== renderOverride[key]) ownValues[key] = live[name];
        live[name] = renderOverride[key];
      } else if (key in ownValues) {
        live[name] = ownValues[key];
        delete ownValues[key];
      }
    }
  }
  applyRender();
  /**
   * Render options over the settings, as a partial: a value sets one, null clears it back to
   * the settings', and anything left out stays as it is. dither (0..0.5), ditherMatrix (4 | 8),
   * outlines, vignette (0..1.5), exposure, colorChange (seconds), flameFps (the flame's
   * frame rate), pixelSize (CSS px, the same as setPixelSize but redrawn only when it
   * changes), and how hits land: hitStop (seconds of freeze), hitFlash (0..1), debris
   * (×), marks, each also true (the settings') or false (none).
   */
  function setRender(partial = {}) {
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined || key === 'pixelSize') continue;
      const off = WRITE_THROUGH[key]?.[2];
      const v = off !== undefined && typeof value === 'boolean' ? (value ? null : off) : value;
      if (v === null) delete renderOverride[key];
      else renderOverride[key] = v;
    }
    applyRender();
    if (partial.pixelSize !== undefined && (partial.pixelSize ?? null) !== settings.pixelSize) {
      settings.pixelSize = partial.pixelSize ?? null;
      resize();
    }
  }
  // The palette: null (the settings': the flame's own, which the debug HUD may cycle),
  // 'flame' (always the flame's own), a debug palette ('ashen', 'moonlit'), or a few of the
  // flame's own colors ([slot, …] of scenePalette, e.g. [0, 6, 8]), which follow the flame
  // as it changes (keepPalette, every frame).
  ctx.paletteOverride = null;
  const paletteIndex = (id) => Math.max(0, DEBUG_PALETTES.findIndex((n) => n.toLowerCase().startsWith(id)));
  // (A few colors are put over the palette again only when something they come from changed:
  // the slots, the flame's colors (applyColors, which puts the full palette back: fewStale),
  // or the scenery's (palette.js base). Not every frame.)
  let fewSlots = null;
  const fewBase = { void: '', shadow: '', stone: '', wood: '', bone: '' };
  function fewChanged(slots) {
    let changed = ctx.fewStale || slots !== fewSlots;
    for (const k in fewBase) if (fewBase[k] !== base[k]) { fewBase[k] = base[k]; changed = true; }
    ctx.fewStale = false;
    fewSlots = slots;
    return changed;
  }
  function keepPalette(force = false) {
    const p = ctx.paletteOverride;
    if (p === null) return;
    if (Array.isArray(p)) {
      if (!fewChanged(p) && !force) return;
      const all = scenePalette({ ramp: ctx.currentRamp, shade: ctx.currentShade });
      pass.setPalette(p.map((i) => all[i] ?? all[0]));
      return;
    }
    const index = paletteIndex(p);
    if (!force && index === ctx.debugPaletteIndex) return;
    ctx.debugPaletteIndex = index;
    if (index) pass.setPalette(debugPalettes[DEBUG_PALETTES[index]]);
    else applyColors({ ramp: ctx.currentRamp, shade: ctx.currentShade }, ctx.currentMix);
  }
  function setPalette(p = null) {
    const was = ctx.paletteOverride;
    const slots = Array.isArray(p) ? p.filter((i) => Number.isInteger(i) && i >= 0) : null;
    ctx.paletteOverride = slots ? (slots.length ? slots : null) : p ?? null;
    if (ctx.paletteOverride === null) {
      if (was !== null) { ctx.debugPaletteIndex = 0; applyColors({ ramp: ctx.currentRamp, shade: ctx.currentShade }, ctx.currentMix); }
      return;
    }
    // (A few of the flame's colors go over the flame's own palette, which stays the one
    // applyColors keeps, so going back to it is immediate.)
    if (slots) ctx.debugPaletteIndex = 0;
    keepPalette(true);
  }
  // Fog: the scene's own (light), none, or thick (near and far, meters from the camera).
  const FOGS = { light: [scene.fog.near, scene.fog.far], thick: [3.2, 8], off: [1000, 1001] };
  ctx.fogKind = 'light';
  function setFog(kind = 'light') {
    ctx.fogKind = FOGS[kind] ? kind : 'light';
    [scene.fog.near, scene.fog.far] = FOGS[ctx.fogKind];
  }
  /**
   * The fire's shadow on or off, only where shadows are drawn at all. Its strength, not
   * whether the light casts one: no shader changes (none is rebuilt), and while it's off the
   * shadow map isn't redrawn either (shadowNeedsUpdate), so it's lighter on the card.
   */
  ctx.shadowsOn = true;
  function setShadows(on = true) {
    if (!!on === ctx.shadowsOn) return;
    ctx.shadowsOn = !!on;
    fireLight.shadow.intensity = ctx.shadowsOn ? 1 : 0;
    if (ctx.shadowsOn) ctx.shadowFrames = Math.max(ctx.shadowFrames, 1); // (it's stale: redraw it now)
  }
  // X-ray (the visualizer): one of the passes the picture is built from, in place of the
  // scene but carried on through the effects and the palette (pixelPass.js uXray), or the
  // flow field over the fire. null: the picture.
  const XRAY = { normals: 1, lighting: 2, particles: 3, flow: 0 };
  ctx.xrayView = null;
  function setXray(view = null) {
    ctx.xrayView = view in XRAY ? view : null;
    pass.uniforms.uXray.value = XRAY[ctx.xrayView] ?? 0;
    flowView.visible = ctx.xrayView === 'flow';
  }
  function resize() {
    if (scope.disposed) return;
    const dpr = window.devicePixelRatio || 1;
    const cssPx = pixelSize();
    const pd = Math.max(1, Math.round(cssPx * dpr));
    const w = Math.max(1, Math.ceil((container.clientWidth * dpr) / pd));
    const h = Math.max(1, Math.ceil((container.clientHeight * dpr) / pd));
    ctx.size = { w, h, pd };
    frame.setSize(w, h, pd);
    // (Each size has its own targets, the color pass's depth among them: the particles, all
    // sharing this uniform, test themselves against the current one.)
    particleMaterial.uniforms.tDepth.value = frame.depthTexture;
    canvas.style.width = `${(w * pd) / dpr}px`;
    canvas.style.height = `${(h * pd) / dpr}px`;
    pointer.measure(canvas);
    camera.aspect = w / h;
    view.layout = container.clientWidth >= 1100 && w / h > 1.15 ? 'wide' : 'tall';
    fitKnights();
  }
  // The site's tall layout (a phone) frames his seat right under the page's header, with no
  // room over him to stand up in: the dance from the pack is danced in his seat there.
  function fitKnights() { if (ctx.knights && siteKnight) ctx.knights.headroom = view.layout === 'wide'; }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  scope.cleanup(() => observer.disconnect());

  // --- Per-frame update
  ctx.flameStep = -1;
  let lightStep = -1;
  let lightFlicker = 1;
  const fireOnScreen = new THREE.Vector3();
  // The flame's colors as the glows take them (parsed once a flame step, not once a glow),
  // and as the lamps do (once a light step).
  const glowRamp = [0, 1, 2, 3].map(() => new THREE.Color());
  const lampColor = new THREE.Color();

  /**
   * Coals in the ash pulse between the flame's deep, body and bright tones. The scenery's
   * glows go by their kind (scenery.js): embers like the coals; lamps hold a steady light
   * with a rare dip, every window of one lamp together; candle flames flicker bright and
   * waver; stained glass and runes keep their own tone, a step brighter now and then. These
   * are glows[from…to) at flame step `fs`, in glowRamp's colors (each glow's index is its own
   * number in the rolls).
   */
  function recolorGlows(from, to, fs) {
    for (let i = from; i < to; i++) {
      const g = glows[i];
      const k = g.userData.glow;
      if (!k || k.kind === 'ember') {
        const h = hash(fs * 3.3 + i * 5.7);
        g.material.color.copy(glowRamp[h > 0.8 ? 2 : h > 0.3 ? 1 : 0]);
      } else if (k.kind === 'lamp') {
        g.material.color.copy(glowRamp[hash(fs * 1.9 + k.id * 13.1) > 0.92 ? 1 : 2]);
      } else if (k.kind === 'flame') {
        g.material.color.copy(glowRamp[hash(fs * 2.3 + k.id * 7.3) > 0.7 ? 3 : 2]);
        g.userData.baseY ??= g.scale.y;
        g.scale.y = g.userData.baseY * (0.8 + hash(fs * 1.7 + i * 9.1) * 0.4);
      } else {
        const up = hash(Math.floor(fs / 6) * 2.1 + i * 3.7) > 0.8 ? 1 : 0;
        g.material.color.copy(glowRamp[Math.min(3, k.tone + up)]);
      }
    }
  }

  // `dt`, `t`: the simulation's step and clock (they stop during a hit-stop); `realDt`:
  // the frame's own step (the camera, the cursor and the fades of the hit itself).
  function update(dt, t, realDt) {
    ctx.busy = Math.max(0, ctx.busy - realDt * 0.8);
    ctx.flashAmt *= Math.exp(-realDt / 0.05);
    // Hovered (the site), the fire eases up to meet the cursor: taller, brighter, a trickle of sparks.
    ctx.hoverGlow += ((ctx.hoverFlare ? 1 : 0) - ctx.hoverGlow) * Math.min(1, realDt * 6);
    if (ctx.hoverGlow > 0.3 && Math.random() < realDt * 30 * ctx.hoverGlow) fire.sparkle(2);
    fire.params.level += (ctx.targetLevel + drive.level + 1.1 * ctx.hoverGlow - fire.params.level) * Math.min(1, dt * 1.1);
    fire.wind.set(drive.windX, 0, drive.windZ);
    // Scrolling: the loose particles and the fireflies are swept along with the page, a little.
    ctx.sweep *= Math.exp(-realDt / 0.3);
    if (Math.abs(ctx.sweep) > 0.004) {
      const push = ctx.sweep * 2.6 * realDt;
      for (const set of ctx.sets) {
        const V = set.vel;
        const cap = set.maxV ?? 2;
        for (let i = 0; i < set.n; i++) V[i * 3 + 1] = Math.max(-cap, Math.min(cap, V[i * 3 + 1] + push));
      }
      ctx.fireflies.drift.set(0, ctx.sweep * 0.55, 0);
    } else if (ctx.fireflies.drift.y) ctx.fireflies.drift.set(0, 0, 0);
    for (const id of ELEMENT_IDS) {
      const d = (id === ctx.elementKey ? 1 : 0) - presence[id];
      presence[id] += Math.sign(d) * Math.min(Math.abs(d), dt / 0.6);
    }
    applyFireParams();

    const sparks = interaction.update(camera, pointer.update(realDt, timer.getElapsed()), ctx.sets, dt);
    if (sparks.length) fire.emitSparks(sparks);

    // Stepped simulation for a hand-animated look.
    const fps = effects.fire.fps;
    const fs = Math.floor(t * fps);
    if (fs !== ctx.flameStep) {
      const steps = ctx.flameStep < 0 || fs < ctx.flameStep ? 1 : Math.min(3, fs - ctx.flameStep);
      ctx.flameStep = fs;
      for (let i = 0; i < steps; i++) fire.stepFlame(1 / fps, t);
      candleFlames.forEach((c, i) => c.mesh.scale.set(c.scale.x, c.scale.y * (0.8 + hash(fs * 1.7 + i * 9.1) * 0.4), c.scale.z));
      // The glows: the model's coals, and the current place's (the others are hidden, and
      // catch up if they're shown again: setScenery).
      for (let i = 0; i < 4; i++) glowRamp[i].set(ctx.currentRamp[i]);
      recolorGlows(0, ctx.sharedGlows, fs);
      const place = sceneries[ctx.sceneryKey];
      if (place) recolorGlows(place.glowFrom, place.glowTo, fs);
    }
    fire.stepSparks(dt, t);
    // The density budget: background extras thin out while a big hit is on screen.
    crystals.ambient = plasma.ambient = ambient();
    plasma.step(dt, t, fire.params.level, { ray: pointer.ray(camera), flow: interaction.flowWorld });
    crystals.step(dt, t, fire.params.level);
    chill.step(dt, t);
    swingTrail.step(dt, t, camera.position);
    ctx.fx.step(dt, t);
    ctx.zap.step(dt, t);
    ctx.frostRing.step(dt, t);
    for (const d of Object.values(debris)) d.step(dt);
    flowView.step(t);
    marks.step(realDt);
    ctx.fireflies.update(dt, t, camera, pointer.cursor, interaction.flowWorld);
    if (ctx.strikeAt >= 0 && t >= ctx.strikeAt) { ctx.strikeAt = -1; strikeFirefly(1); }
    // Now and then the ball reaches for a firefly on its own (more when stoked).
    if (ctx.elementKey === 'lightning' && Math.random() < dt * effects.impact.fireflyStrikes * 0.25 * ambient() * Math.max(0.5, fire.params.level)) strikeFirefly(0.6);

    // After a weapon lands: ease from the old flame into the new one, with the
    // light swelling and settling as the color turns over.
    if (ctx.blend) {
      ctx.blend.t = Math.min(1, ctx.blend.t + (dt / blendTime()) * (ctx.blend.fast ? 4 : 1));
      const k = flameEase(ctx.blend.t);
      applyColors(mixFlame(flames[ctx.blend.from], flames[ctx.blend.to], k),
        THREE.MathUtils.lerp(lightMix(ctx.blend.from), lightMix(ctx.blend.to), k));
      ctx.blendMul = 1 + Math.sin(ctx.blend.t * Math.PI) * 0.35;
      if (ctx.blend.t >= 1) {
        ctx.blend = null;
        ctx.blendMul = 1;
        applyColors(flames[ctx.flameKey], lightMix(ctx.flameKey));
        ctx.fireflies?.setRamp(flames[ctx.flameKey].ramp);
      }
    }

    const ls = Math.floor(t * LIGHT_FPS);
    if (ls !== lightStep) {
      lightStep = ls;
      lightFlicker = 0.82 + Math.random() * 0.3;
      candleLight.intensity = ctx.sceneryKey === 'ruins' ? 0.28 + Math.random() * 0.12 : 0;
      lampColor.set(ctx.currentRamp[1]).lerp(white, 0.3);
      for (const l of lamps) {
        if (!l.userData.base) continue;
        l.intensity = l.userData.base * (0.8 + Math.random() * 0.3);
        l.color.copy(lampColor);
      }
    }
    // Each element lights the scene its own way: fire flickers, the ball strobes
    // with its crackle, ice glows steadily and breathes.
    const iceLight = (0.88 + 0.07 * Math.sin(t * 1.3) * effects.ice.shimmer) * effects.ice.glow * 0.8 * (1 + 0.5 * crystals.beatGlow);
    const lit = presence.fire * lightFlicker + presence.lightning * plasma.lightFlicker * effects.lightning.brightness + presence.ice * iceLight;
    const flicker = lit / Math.max(1e-3, presence.fire + presence.lightning + presence.ice);
    // The ball lights the scene from where it hangs — but no lower than the top of the
    // logs, so a ball set down in the core still lights the clearing instead of being
    // shadowed by the logs around it.
    fireLight.position.lerpVectors(FIRE_LIGHT_AT, ballLightAt.set(FIRE_ORIGIN.x, Math.max(effects.lightning.height, BALL_LIGHT_MIN_Y), FIRE_ORIGIN.z + 0.12), presence.lightning);
    // A discharge (weapon impact, stoke) flashes the whole scene for an instant.
    const flash = reducedMotion ? 0 : plasma.flash;
    pass.uniforms.exposure.value = (renderOverride.exposure ?? effects.render.exposure) * (1 + flash * 0.45) * boost(drive.exposure);
    keepPalette();
    pass.uniforms.uFlash.value = reducedMotion ? 0 : ctx.flashAmt;
    // The music's color temperature (the visualizer) tints the cast light too.
    const temp = glitch.temp;
    fireLight.color.copy(lightBase);
    if (temp > 0) fireLight.color.lerp(white, temp * 0.45);
    else if (temp < 0) fireLight.color.lerp(lightWarm, -temp * 0.35);
    fireLight.intensity = effects.fire.glow * Math.min(2.6, Math.max(0.3, fire.params.level)) ** 1.3 * flicker * ctx.blendMul * (1 + flash * 1.5) * boost(drive.glow) * (1 + 0.6 * ctx.hoverGlow);

    ctx.weapons.update(dt);
    if (ctx.knights) {
      // The armor mirrors the fire as it flickers; the knights glance at a weapon in flight.
      armor.uniforms.uFire.value = Math.min(1.6, fireLight.intensity / Math.max(0.1, effects.fire.glow));
      const b = ctx.weapons.busy ? ctx.weapons.blade(bladeState) : null;
      ctx.knights.update(dt, { lookAt: b && reacts() ? (b.free ? b.tip : b.mid) : null, cameraAt: camera.position });
      // (The site's: his sign, and his coming and going, after his pose.)
      ctx.arrival?.update(dt);
    }

    view.step(realDt);
  }

  // The shadow is redrawn while a weapon moves (and a frame after), in the frame a knight's
  // pose steps or he forms or goes (knights.moving: the skeleton is updated in the same
  // render, before the shadow, so once is enough), when the light moves (the lightning
  // ball's height), and once after the model loads or the settings change; never while
  // the shadow is switched off (setShadows). A planted weapon's shudder on a hard beat
  // (weapons.moving, but not movingForShadow) redraws it at the art's own 12 fps instead
  // (one frame per light step, none if a knight's step just did: at most 12 a second
  // more), and once more when it's still: with the beats coming every half second, it had
  // all six faces redrawn every frame of the show. It isn't left out altogether: from a
  // light this close the blade's shadow is magnified on the far scenery (the shrine's
  // torii flickers lit and shadowed with it), and held still through the show's near-
  // constant shudders that flicker would be gone. (Sampled at 12 fps, the blade's 8.75 Hz
  // wobble shows in the shadow as a slower, stepped one, not the blade's own rhythm.)
  const shadowLightAt = new THREE.Vector3(Infinity, 0, 0);
  ctx.shadowFrames = 0;
  let shuddering = false;
  let shadowStep = -1; // (the light step of the last redraw)
  function shadowNeedsUpdate() {
    if (!ctx.shadowsOn) return false;
    const shudder = !!ctx.weapons?.moving && !ctx.weapons.movingForShadow;
    const step = Math.floor(ctx.simT * LIGHT_FPS);
    if (ctx.weapons?.movingForShadow) ctx.shadowFrames = 2;
    else if (ctx.knights?.moving || (shudder && step !== shadowStep) || (shuddering && !shudder)) ctx.shadowFrames = Math.max(ctx.shadowFrames, 1);
    shuddering = shudder;
    const stale = ctx.shadowFrames > 0 || !fireLight.position.equals(shadowLightAt);
    ctx.shadowFrames = Math.max(0, ctx.shadowFrames - 1);
    shadowLightAt.copy(fireLight.position);
    if (stale) shadowStep = step;
    return stale;
  }

  function renderFrame(dt) {
    const t0 = ctx.perf ? performance.now() : 0;
    renderer.info.reset();
    const t = timer.getElapsed();
    // The visualizer drives the fire from here, so its changes land in this frame.
    if (ctx.ready) onFrame?.(dt, t);
    const t1 = ctx.perf ? performance.now() : 0;
    // Hit-stop: most of a freeze's time is held back from the simulation, then repaid a
    // little faster than real time, so everything ends up where the music expects it.
    let simDt = dt;
    if (ctx.hitStop > 0) {
      const frozen = Math.min(ctx.hitStop, dt);
      ctx.hitStop -= frozen;
      simDt = dt - frozen * 0.92;
      ctx.timeDebt += frozen * 0.92;
    } else if (ctx.timeDebt > 0) {
      const pay = Math.min(ctx.timeDebt, dt * 0.5);
      ctx.timeDebt -= pay;
      simDt = dt + pay;
    }
    ctx.simT += simDt;
    if (ctx.ready) update(simDt, ctx.simT, dt);
    view.apply(dt, ctx.size, pointer);
    for (const [k, u] of GLITCH_ENTRIES) pass.uniforms[u].value = passValue(k, glitch[k], stillOpts);
    pass.uniforms.uTime.value = stillClock(stillOpts) ? 0 : t;
    // The ripple is sized to the screen: radius as a fraction of the height, push per 270 rows.
    pass.uniforms.uRippleR.value = glitch.rippleR * ctx.size.h;
    pass.uniforms.uRippleAmp.value = reducedMotion ? 0 : (glitch.rippleAmp * ctx.size.h) / 270;
    // Where the fire is on screen (texels): the ripple, the iris and the echoes center on it.
    fireOnScreen.set(FIRE_ORIGIN.x, 0.55, FIRE_ORIGIN.z).project(camera);
    pass.uniforms.uCenter.value.set((fireOnScreen.x * 0.5 + 0.5) * ctx.size.w, (fireOnScreen.y * 0.5 + 0.5) * ctx.size.h);

    const t2 = ctx.perf ? performance.now() : 0;
    const shadows = renderer.shadowMap.enabled && shadowNeedsUpdate();
    ctx.fireflies?.place(camera); // (their instances, for the camera as it is now: fireflies.js)
    frame.draw({ shadows });
    ctx.perf?.frame(t0, t1, t2, performance.now(), shadows);
  }

  // ?perf in the page's address (the site, Bonfire Live and the Painter alike): a small
  // overlay (ui/perfOverlay.js) with the frame rate and times (the page's part, the scene's
  // update, the draw), the draw calls, the shadow's redraws and the GPU's programs and
  // textures, and the same times as performance.measure entries for the browser's profiler.
  // Without it nothing is timed, and the overlay's code isn't even loaded.
  ctx.perf = null;
  if (new URLSearchParams(location.search).has('perf')) {
    import('../ui/perfOverlay.js').then(({ createPerfOverlay }) => {
      if (scope.disposed) return;
      ctx.perf = createPerfOverlay({ info: renderer.info, maxFps: () => gate.maxFps });
      scope.cleanup(() => { ctx.perf?.dispose(); ctx.perf = null; });
    }, (error) => console.warn('The ?perf overlay did not load.', error));
  }

  // The loop runs at the display's rate. With a cap (setMaxFps; none unless asked: every frame
  // the display shows is drawn), the frames in between are skipped: the scene's clock, the
  // page's onFrame and everything after it run only on the frames that are drawn, while
  // onTick(dt) runs on every one (Bonfire Live's audio analysis keeps its time resolution).
  const gate = createFrameGate();
  let lastTick = -1;
  let running = false;
  function syncRunning() {
    const should = ctx.ready && !scope.disposed && !document.hidden;
    if (should === running) return;
    running = should;
    if (running) { timer.reset(); lastTick = -1; } // (the time it was paused doesn't count)
    renderer.setAnimationLoop(running ? (now) => {
      const tickMs = lastTick < 0 ? 0 : now - lastTick;
      lastTick = now;
      try {
        onTick?.(Math.min(tickMs / 1000, 0.1));
        if (!gate.due(tickMs)) return;
        timer.update(); // (performance.now(), like reset(): never a negative step)
        renderFrame(Math.min(timer.getDelta(), 0.1));
      } catch (error) { scope.dispose(); onError?.(error); }
    } : null);
  }
  document.addEventListener('visibilitychange', syncRunning, { signal: events.signal });
  // Only one readiness promise owns startup failures; callers handle its rejection. The
  // shaders are built before the first frame (frame.compile: in parallel where the browser
  // can), so drawing it doesn't stall on them.
  const loaded = modelLoaded
    .then(() => (ctx.ready && !scope.disposed ? frame.compile().catch(() => {}) : null))
    .then(() => { resize(); syncRunning(); })
    .catch((error) => {
      scope.dispose();
      throw error;
    });
  /** Resolves once the frame after this has been drawn (or the scene is gone). */
  const nextFrame = () => new Promise((resolve) => {
    const off = frame.onRendered(() => { off(); resolve(); });
    scope.cleanup(resolve);
  });
  // The site's knight when he isn't there at load: after the fire's first frame, his template
  // is built in idle moments, then he and his sign are made, their shaders compiled, and put in
  // the scene; the sign kindles as it appears (its settling glow). Resolves once he's in (or
  // won't be).
  const knightsIn = !knightLater ? loaded : loaded
    .then(() => Promise.all([knightLoaded, nextFrame()]))
    .then(([model]) => (model && ctx.ready && !scope.disposed ? inSteps(ctx.bundle.templateSteps(model)).then((template) => [model, template]) : null))
    .then((got) => {
      if (!got || !got[1] || scope.disposed) return null;
      ctx.knightsShown = false; // (his sign can't be clicked, nor he summoned, till they're in)
      const objects = addKnights(got[0], { template: got[1], attach: false });
      return objects.length ? frame.prepare(objects).catch(() => {}).then(() => {
        if (scope.disposed) return;
        scene.add(...objects);
        ctx.knightsShown = true;
        if (ctx.sign?.mode === 'lit') ctx.sign.uniforms.uGlow.value = 1.2;
      }) : null;
    })
    .catch((error) => { console.warn('The knight could not be built; the fire burns without him.', error); });
  // (Bonfire Live and the Painter can roll a style with its own model at any moment: its
  // template is built beforehand, in idle moments once the knights are in.)
  if (fxLayer) knightsIn.then(() => { if (ctx.knights) for (const file of new Set(Object.values(MODELS))) prepareStyleModel(file); }, () => {});
  // Bonfire Live and the Painter: every other place, and its height map, built beforehand, so
  // the first visit to one doesn't freeze the show (setScenery). Not in the show's first
  // seconds (they have enough to do: PREBUILD_AFTER_MS), and then only in time the page has
  // spare, in steps of about a ms or less (inIdle), the place's own build the one big one. Its
  // materials are set up for drawing too (frame.prepare: the cult's 46 glows, each its own
  // material, took a frame's worth of setting up the first time they were drawn). On the
  // site, where a visitor seldom changes place, each is built on its first visit.
  function* prepareSceneries() {
    for (const name of Object.keys(SCENERIES)) {
      if (name === 'ruins' || !ctx.ready) continue;
      if (!sceneries[name]) {
        yield BIG_STEP_MS;
        if (!sceneries[name]) yield* (building[name] ??= sceneryParts(name));
        frame.prepare([sceneries[name].group]).catch(() => {});
        yield;
      }
      if (terrains[name]) continue;
      // Its heights are drawn, then read back without waiting on the GPU (the next step waits
      // for them, the page idle meanwhile), then made into its map a few rows at a time. (A
      // visit before that makes its own then, and this one is let go.)
      let steps = null;
      yield readTerrain(renderer, staticsOf(name), { material: terrainMaterial }).then((s) => { steps = s; }, () => {});
      if (!steps || terrains[name]) continue;
      const map = yield* steps;
      terrains[name] ??= map;
    }
  }
  if (fxLayer && typeof requestIdleCallback === 'function') {
    knightsIn
      .then(() => new Promise((resolve) => setTimeout(resolve, PREBUILD_AFTER_MS)), () => null)
      .then(() => (ctx.ready && !scope.disposed ? inIdle(prepareSceneries()) : null))
      .catch((error) => console.warn('The places could not be built beforehand; each is built when first shown.', error));
  }

  // fire.knights: what knights.js offers, forwarded once they exist.
  const knightsApi = {
    /** Resolves true once there are knights (on the site, when he's away at load, a moment after the first frame). */
    ready: knightsIn.then(() => !!ctx.knights, () => false),
    get count() { return ctx.knights?.count ?? 0; },
    get present() { return ctx.knights?.present ?? 0; },
    get max() { return ctx.knights?.max ?? 0; },
    get list() { return ctx.knights?.list ?? []; },
    get positions() { return ctx.knights?.positions ?? []; },
    get moving() { return ctx.knights?.moving ?? false; },
    /** Knight 0's helmet: the one he has on, or the one he's putting on mid-swap. */
    get helmet() { return ctx.knights ? ctx.helmetGoal ?? ctx.knights.helmet : null; },
    set helmet(name) { wearHelmet(name); },
    /** (On the site, knight 0's helmet asked for here, the visitor's pick in the pack, holds for the visit: he comes in it.) */
    setHelmet: (name, o) => {
      if (o?.index == null || o.index === 0) ctx.visitorHelmet = HELMETS.includes(name) ? name : ctx.visitorHelmet;
      busyWithHim(o?.index);
      return wearHelmet(name, o);
    },
    setCast: (o) => { if (o?.helmets) ctx.helmetGoal = null; ctx.knights?.setCast(o); },
    /**
     * The site's knight's presence (knightArrival.js): 'away' (his sign waits on the ground),
     * 'arriving', 'resting', 'leaving'. Bonfire Live: 'resting' while knight 0 is there.
     */
    get presence() { return ctx.arrival?.presence ?? (ctx.knights?.list[0]?.present ? 'resting' : 'away'); },
    /** Summon him (the site: from his sign, through the forge; `instant`: at once). False if he can't come now. */
    summonKnight: (o) => summonKnight(o),
    /** Send him off (the site: he burns away into his sign; `instant`: at once). False if he isn't there. */
    dismissKnight: (o) => ctx.arrival?.dismiss(o) ?? false,
    /** Call `fn(presence)` whenever the site's knight comes or goes. Returns an unsubscribe. */
    onPresence: (fn) => { presenceListeners.add(fn); return () => presenceListeners.delete(fn); },
    /** Seconds of his rest left (the site), Infinity if it doesn't run out; settable (for tests). */
    get restLeft() { return ctx.arrival?.restLeft ?? Infinity; },
    set restLeft(sec) { if (ctx.arrival) ctx.arrival.restLeft = sec; },
    summon: (i, o) => ctx.knights?.summon(i, o) ?? false,
    dismiss: (i, o) => ctx.knights?.dismiss(i, o) ?? false,
    sit: (i = 0) => ctx.knights?.sit(i) ?? false,
    stand: (i = 0) => ctx.knights?.stand(i) ?? false,
    dance: (i, o) => ctx.knights?.dance(i, o) ?? false,
    gesture: (name, o) => {
      const on = ctx.knights?.gesture(name, o) ?? false;
      if (on) busyWithHim(o?.index ?? 0);
      return on;
    },
    /** 'impact' (strength 0..1: a flinch), 'stoke' (he leans away), 'ring' (he lifts his feet as it passes). */
    react: (kind, strength, where) => reactKnights(kind, strength, where),
    /**
     * Bonfire Live: whether the knights react at all (react(), and the fire's own stokes,
     * impacts and rings) and sit up to watch a weapon in flight. The site's knight follows
     * effects.knight.reactions instead.
     */
    setReactions: (on) => { ctx.liveReactions = !!on; },
    get reactions() { return reacts(); },
    /**
     * The fire's reflection sweeping over the armor (armor.js): `rest` (now and then) and
     * `flares` (when the fire flares) on or off; `shine` reads them back.
     */
    setShine: (o) => armor.setShine(o),
    get shine() { return armor.shine; },
    /**
     * The knight's style (knightStyles.js STYLES; null: the settings', effects.knight.style):
     * knights who are here burn away and form again in it (~1.2 s; `{ instant: true }` at
     * once). Resolves true once it shows (a style with its own model fetches it first).
     */
    setStyle: (name = null, { instant = false } = {}) => { armorOverride.style = name ?? null; return applyStyle({ instant }); },
    /**
     * Get a style's model ready beforehand (fetched, its template built in idle moments), so a
     * change to it later shows at once. Resolves true once it's ready (a style on the knight's
     * own model always is).
     */
    prepareStyle: (name) => prepareStyleModel(styleModel(styleOr(name))).then((root) => styleModel(styleOr(name)) === MODELS.main || !!root),
    /** The style he's drawn in now (knightStyles.js key). */
    get style() { return ctx.knights?.style ?? armor.style; },
    /** The armor's finish (steel.js FINISHES; null: the settings'), and the one he wears. */
    setFinish: (name = null) => { armorOverride.finish = name ?? null; applyArmor(); },
    get finish() { return armor.finish; },
    /** The fire's color on his edges, 0..1 (null: the settings'), and how strong it is. */
    setRim: (v = null) => { armorOverride.rim = v ?? null; applyArmor(); },
    get rim() { return armor.rim; },
    /** How they sit (knights.js setSeatPose): 'resting' | 'watchful'; `{ index }` for one knight. The site's follows effects.knight.seat. */
    setSeatPose: (name, o) => ctx.knights?.setSeatPose?.(name, o),
    get seatPose() { return ctx.knights?.seatPose ?? 'resting'; },
    lookAt: (point, o) => ctx.knights?.lookAt(point, o),
    clock: (beatPos, period) => ctx.knights?.clock(beatPos, period),
    slots: (name) => ctx.knights?.slots(name ?? ctx.sceneryKey) ?? null,
    fits: (move, at, facing, name) => ctx.knights?.fits(move, at, facing, name ?? ctx.sceneryKey) ?? true,
  };

  // --- The render settings (the site's P menu, ui/renderMenu.js): cycle() steps one
  // setting on (dir 1) or back (-1, a Shift+click), describe() says what each is now.
  /** The value after `cur` in `list` going `dir` (wrapping; from one that isn't in it, the nearest that way). */
  const stepIn = (list, cur, dir) => {
    const i = list.indexOf(cur);
    if (i >= 0) return list[(i + dir + list.length) % list.length];
    const next = dir > 0 ? list.find((v) => v > cur) : list.findLast((v) => v < cur);
    return next ?? (dir > 0 ? list[0] : list.at(-1));
  };
  function cycle(what, dir = 1) {
    dir = dir < 0 ? -1 : 1;
    if (what === 'pixel') {
      settings.pixelSize = stepIn(PIXEL_SIZES, pixelSize(), dir);
      resize();
    } else if (what === 'palette') {
      ctx.debugPaletteIndex = (ctx.debugPaletteIndex + dir + DEBUG_PALETTES.length) % DEBUG_PALETTES.length;
      const debug = debugPalettes[DEBUG_PALETTES[ctx.debugPaletteIndex]];
      pass.setPalette(debug ?? scenePalette({ ramp: ctx.currentRamp, shade: flames[ctx.flameKey].shade }), { steel: !debug });
      ctx.fewStale = true;
    } else if (what === 'dither') {
      // (Up a level from what's showing now, the settings' own included, then back to none;
      // back, down a level from it, from none to the strongest.)
      const cur = pass.uniforms.ditherStrength.value;
      pass.uniforms.ditherStrength.value = dir > 0
        ? DITHER_LEVELS.find((v) => v > cur + 1e-4) ?? 0
        : cur > 1e-4 ? DITHER_LEVELS.findLast((v) => v < cur - 1e-4) ?? 0 : DITHER_LEVELS.at(-1);
    } else if (what === 'matrix') {
      pass.uniforms.ditherScale.value = stepIn(MATRIX_SIZES, pass.uniforms.ditherScale.value, dir);
    } else if (what === 'interaction') {
      const keys = Object.keys(MODES);
      interaction.mode = keys[(keys.indexOf(interaction.mode) + dir + keys.length) % keys.length];
    } else if (what === 'outlines') {
      pass.uniforms.outlines.value = pass.uniforms.outlines.value ? 0 : 1;
    }
    return describe();
  }
  /** The values as the menu shows them (Title Case, as its options are: "Off", "Ashen (3 Colors)"). */
  function describe() {
    return {
      pixel: `${pixelSize()} px (${ctx.size.w}×${ctx.size.h})`,
      palette: ctx.debugPaletteIndex === 0 ? flames[ctx.flameKey].name : DEBUG_PALETTES[ctx.debugPaletteIndex].replace(/(\d) color\)$/, '$1 Colors)'),
      dither: pass.uniforms.ditherStrength.value ? pass.uniforms.ditherStrength.value.toFixed(2) : 'Off',
      matrix: `${pass.uniforms.ditherScale.value}×${pass.uniforms.ditherScale.value}`,
      outlines: pass.uniforms.outlines.value ? 'On' : 'Off',
      interaction: MODES[interaction.mode].name,
    };
  }

  /** Whether the planted weapon is under the point (client px): the site's flourish on click. */
  const pickRay = new THREE.Raycaster();
  const pickNdc = new THREE.Vector2();
  function weaponAt(clientX, clientY) {
    const w = ctx.weapons?.planted;
    if (!w) return false;
    const r = canvas.getBoundingClientRect();
    pickNdc.set(((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2);
    pickRay.setFromCamera(pickNdc, camera);
    pickRay.params.Mesh = { threshold: 0 };
    return pickRay.intersectObject(w, true).length > 0;
  }
  const knightHit = { distance: Infinity };
  const fireHitAt = new THREE.Vector3();
  // The fire, for hover: a sphere around the flames (world).
  const fireBounds = new THREE.Sphere(new THREE.Vector3(FIRE_ORIGIN.x, 0.45, FIRE_ORIGIN.z), 0.55);
  /**
   * What's under the point (client px): the weapon, else a knight (index) or the fire,
   * whichever is nearer. `knight` false: the knights aren't looked for (a click isn't for
   * them), so the fire behind one counts as the fire.
   */
  function pickAt(clientX, clientY, { knight = true } = {}) {
    const onWeapon = weaponAt(clientX, clientY);
    let onFire = false;
    let onKnight = -1;
    let onSign = false;
    if (!onWeapon) {
      const r = canvas.getBoundingClientRect();
      pickNdc.set(((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2);
      pickRay.setFromCamera(pickNdc, camera);
      onKnight = ctx.knights && knight ? ctx.knights.pick(pickRay.ray, knightHit) : -1;
      // (Whichever is nearest: the fire in front of him, him in front of the fire, or his sign.)
      const fireHit = pickRay.ray.intersectSphere(fireBounds, fireHitAt);
      const fireD = fireHit ? fireHit.distanceTo(pickRay.ray.origin) : Infinity;
      const knightD = onKnight >= 0 ? knightHit.distance : Infinity;
      const signHit = ctx.sign && ctx.knightsShown ? ctx.sign.hit(pickRay.ray) : -1;
      const signD = signHit >= 0 ? signHit : Infinity;
      const nearest = Math.min(fireD, knightD, signD);
      onFire = nearest < Infinity && nearest === fireD;
      onSign = !onFire && nearest < Infinity && nearest === signD;
      if (onFire || onSign) onKnight = -1;
    }
    return { onWeapon, onKnight, onFire, onSign };
  }
  /**
   * What's under the point (client px), for the site's hover effects: 'weapon' (the planted
   * weapon: a click wakes it), 'sign' (the knight's summon sign: a click summons him),
   * 'knight' (a click greets him), 'fire' (a click stokes it) or null. The effect shows in the
   * scene itself: the weapon's rim glows, the sign brightens and its motes rise, the knight's
   * rim warms and he looks at you, the fire flares. `knight` false (a click doesn't greet him:
   * the site's setting, reduced motion, he isn't resting there): he's never the hover, and
   * the fire behind him is.
   */
  function hoverAt(clientX, clientY, { knight = true } = {}) {
    const { onWeapon, onKnight, onFire, onSign } = pickAt(clientX, clientY, { knight });
    if (ctx.weapons) ctx.weapons.hovered = onWeapon;
    if (ctx.sign) ctx.sign.hovered = onSign;
    // A hovered knight's rim warms and he turns his head to you.
    if (ctx.knights) ctx.knights.hovered = onKnight;
    if (onFire && !ctx.hoverFlare) armor.flare(0.7); // (the fire rises to meet the cursor: its reflection sweeps the armor)
    ctx.hoverFlare = onFire ? 1 : 0;
    return onWeapon ? 'weapon' : onSign ? 'sign' : onKnight >= 0 ? 'knight' : onFire ? 'fire' : null;
  }
  /** Whether the knight's summon sign is under the point (client px), as hoverAt sees it: a click there summons him. */
  function signAt(clientX, clientY) {
    return !!ctx.sign && pickAt(clientX, clientY, { knight: false }).onSign;
  }
  /**
   * Which knight is under the point (client px): his index, or -1 (also when the weapon or
   * the fire is in front of him there, as hoverAt sees it: a click on those isn't for him).
   */
  function knightAt(clientX, clientY) {
    return ctx.knights ? pickAt(clientX, clientY).onKnight : -1;
  }
  /** The cursor left the scene: no hint. */
  function hoverOff() { if (ctx.weapons) ctx.weapons.hovered = false; if (ctx.sign) ctx.sign.hovered = false; if (ctx.knights) ctx.knights.hovered = -1; ctx.hoverFlare = 0; }

  /**
   * The living blade's flourish (the site): the planted weapon pulls free, cuts a couple of
   * moves in the air and plunges back in. Resolves when it's back (false if it can't).
   */
  function flourish() {
    const moves = 2 + Math.floor(Math.random() * 2);
    const hits = Array.from({ length: moves }, (_, i) => 0.55 + i * 0.42);
    return swing({ hits, plunge: hits[hits.length - 1] + 0.6 });
  }

  // --- Breakdown mode (the site's "How it's made"): the final image, or one of the passes
  // it's built from, and the flow field drawn over the fire.
  const VIEWS = { final: 0, normals: 1, color: 2, particles: 3, flow: 0 };
  function breakdown(view = 'final') {
    pass.uniforms.uView.value = VIEWS[view] ?? 0;
    flowView.visible = view === 'flow';
  }
  // Particle systems, for the breakdown's counts: the scene's point sets grouped by name.
  const named = (objects, name) => { for (const o of objects) if (o?.isPoints) o.name = name; };
  named([fire.flame], 'Bonfire flames');
  named([fire.spark], 'Bonfire sparks');
  named(plasma.objects, 'Lightning ball');
  named(crystals.objects, 'Frost motes');
  named([chill.points], 'Cold mist');
  named(swingTrail.objects, 'Blade trail');
  named(Object.values(debris).map((d) => d.points), 'Debris');
  function stats() {
    const systems = new Map();
    scene.traverse((o) => {
      if (!o.isPoints || !o.name) return;
      const size = o.geometry.attributes.size.array;
      let live = 0;
      for (let i = 0; i < size.length; i++) if (size[i] > 0) live++;
      const s = systems.get(o.name) ?? { name: o.name, live: 0, total: 0 };
      s.live += live;
      s.total += size.length;
      systems.set(o.name, s);
    });
    // (The site's one knight is a row of the breakdown's own; Bonfire Live's cast counts here.)
    if (ctx.knights && !siteKnight) systems.set('Knights', { name: 'Knights', live: ctx.knights.present, total: ctx.knights.max });
    return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, texels: `${ctx.size.w}×${ctx.size.h}`, systems: [...systems.values()] };
  }

  /**
   * A click anywhere makes the fireflies flash (brightest near the click), and a soft gust
   * goes out from it: the loose particles near the line under the cursor are pushed away.
   */
  const gustRay = new THREE.Raycaster();
  const gustAt = new THREE.Vector3();
  function flash(clientX, clientY) {
    if (!ctx.fireflies) return;
    const r = canvas.getBoundingClientRect();
    ctx.fireflies.flash(clientX - r.left, clientY - r.top, camera, r.width, r.height);
    if (reducedMotion) return;
    pickNdc.set(((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2);
    gustRay.setFromCamera(pickNdc, camera);
    const { origin: o, direction: d } = gustRay.ray;
    const R = 0.5;
    for (const set of ctx.sets) {
      const P = set.pos, V = set.vel;
      const cap = set.maxV ?? 2;
      for (let i = 0; i < set.n; i++) {
        const ix = i * 3;
        const px = P[ix] - o.x, py = P[ix + 1] - o.y, pz = P[ix + 2] - o.z;
        const along = px * d.x + py * d.y + pz * d.z;
        if (along <= 0) continue;
        gustAt.set(px - d.x * along, py - d.y * along, pz - d.z * along); // from the ray to the particle
        const dist = gustAt.length();
        if (dist > R || dist < 1e-4) continue;
        const k = 1.1 * (1 - dist / R) ** 2 / dist;
        V[ix] = Math.max(-cap, Math.min(cap, V[ix] + gustAt.x * k));
        V[ix + 1] = Math.max(-cap, Math.min(cap, V[ix + 1] + gustAt.y * k + 0.15 * (1 - dist / R)));
        V[ix + 2] = Math.max(-cap, Math.min(cap, V[ix + 2] + gustAt.z * k));
      }
    }
  }
  /** The page scrolled by `dy` CSS px (+ down): everything loose is swept a little the way the page moved. */
  function scroll(dy) {
    if (!ctx.ready || reducedMotion || !dy) return;
    ctx.sweep = Math.max(-1, Math.min(1, ctx.sweep + Math.max(-150, Math.min(150, dy)) / 420));
  }

  // (The scenery colors as last taken up. Bonfire Live blends them (colors.js) and asks every
  // frame of the blend, but they're whole hex values: most frames of a slow one bring nothing
  // new, and those are skipped.)
  const baseSeen = { void: '', shadow: '', stone: '', wood: '', bone: '' };
  /** The scenery colors (palette.js `base`) changed: take them up (the visualizer's random palettes). */
  function refreshScene() {
    let moved = false;
    for (const k in baseSeen) if (baseSeen[k] !== base[k]) { baseSeen[k] = base[k]; moved = true; }
    if (!moved) return;
    voidColor.set(base.void);
    scene.fog.color.set(base.void);
    applyColors({ ramp: ctx.currentRamp, shade: ctx.currentShade }, ctx.currentMix);
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
    applyArmor();
    resize();
    if (!ctx.ready) return;
    ctx.fireflies.setLit(fCount(effects.fireflies.lit));
    ctx.fireflies.speed = effects.fireflies.speed;
    ctx.shadowFrames = 2;
    // Colors: a flame may have been edited or deleted mid-blend, so settle on the current one.
    ctx.flameKey = flameOr(ctx.flameKey);
    ctx.blend = null;
    ctx.blendMul = 1;
    ctx.forgeFlame = null;
    ctx.debugPaletteIndex = 0;
    applyColors(flames[ctx.flameKey], lightMix(ctx.flameKey));
    ctx.fireflies.setRamp(ctx.currentRamp);
    for (const r of [ctx.fx, ctx.zap, ctx.frostRing]) r.setRamp(ctx.currentRamp);
    ctx.weapons.setRim(ctx.currentRamp[2]);
    applyKnight();
  }

  return {
    stoke, puff, equip, weaponAt, knightAt, signAt, hoverAt, hoverOff, flourish, breakdown, stats, setScenery, scroll,
    get scenery() { return ctx.sceneryKey; },
    /** This frame as a PNG (resolves with a Blob), at the screen's size with hard pixel edges. */
    capture: frame.capture, setView: view.setView,
    /**
     * The next frame as a small picture (a scene's thumbnail): w×h (192×108 by default), the
     * middle of the frame at that shape, taken from its texels with hard edges, as a WebP data
     * URL (the browser's PNG where it can't make WebP; null if it fails). Cheap: no full-size
     * copy, and the encoding is the browser's, off the page's thread.
     */
    captureThumb: (w = 192, h = 108) => frame.thumb(w, h),
    /**
     * Draw at most `fps` frames a second (0: every frame the display shows, the default). The
     * animation loop keeps the display's rate for onTick; the frames between are skipped.
     */
    setMaxFps: (fps) => gate.setMaxFps(fps),
    /** The cap setMaxFps set (0: none). */
    get maxFps() { return gate.maxFps; },
    /** The canvas the scene draws into (low resolution: see resize). */
    get canvas() { return canvas; },
    /** Call `fn` right after every frame is drawn, while the canvas still holds it (recording a clip). Returns an unsubscribe. */
    onRendered: frame.onRendered, setPose: view.setPose, viewAxes: view.axes, cycle, describe, flash, applyEffects, refreshScene, pulse, sparkle, ring, echo, swing, drive, glitch, ready: loaded,
    /** A jolt of the camera (0..~0.3), if screen shake is on. */
    shake: (amount) => jolt(amount),
    /** Skip ahead: a running weapon swap plays fast up to its impact. False if none is running. */
    hurry: (factor = 4) => ctx.weapons?.hurry(factor) ?? false,
    dispose: () => scope.dispose(),
    /** Let a weapon held over the fire strike (equip with `hold`). False if none is held. */
    release: (strikePace = 1) => ctx.weapons?.release(strikePace) ?? false,
    /** 0..1: how hard a held weapon glows. */
    set charge(v) { if (ctx.weapons) ctx.weapons.charge = v; },
    /** The blade moves as if alive (the visualizer): flourishes, shudders, a held one's sway. */
    set alive(v) { if (ctx.weapons) ctx.weapons.alive = v; },
    /** Where the blade is (see bladeState), or null before the model loads. */
    get blade() { return ctx.weapons?.blade(bladeState) ?? null; },
    /** Render pixel size in CSS px (null: the settings' size). */
    setPixelSize(px) { settings.pixelSize = px; resize(); },
    /** Render options over the settings (see setRender); the palette, the fog, the shadow and the x-ray view. */
    setRender, setPalette, setFog, setShadows, setXray,
    /** The render options in effect: the settings' own with any override over them. */
    get render() {
      return {
        ...effects.render, ...renderOverride, pixelSize: pixelSize(), flameFps: effects.fire.fps,
        hitStop: effects.impact.hitStop, hitFlash: effects.impact.flash, debris: effects.impact.debris, marks: effects.impact.marks,
        palette: ctx.paletteOverride ?? 'flame', fog: ctx.fogKind, shadows: ctx.shadowsOn && renderer.shadowMap.enabled, xray: ctx.xrayView,
      };
    },
    get flame() { return ctx.flameKey; },
    get element() { return ctx.elementKey; },
    get weapon() { return ctx.weapons?.currentKey ?? null; },
    /**
     * The knights (knights.js has the whole API): safe before the model loads and without
     * it (no knights, nothing happens). `ready` resolves true once there are knights.
     */
    knights: knightsApi,
    /** A weapon swap is running (or a weapon is held, waiting to strike, or swinging). */
    get forging() { return ctx.weapons?.busy ?? false; },
    get swinging() { return ctx.weapons?.swinging ?? false; },
    get holding() { return ctx.weapons?.holding ?? false; },
    /** Seconds from equip() to impact at pace 1. */
    get swapTime() { return ctx.weapons?.impactTime ?? 3.58; },
    get fireflies() { return ctx.fireflies; },
    /** Internals for debugging (dev builds expose this as window.__fire). */
    get debug() { return { weapons: ctx.weapons, knights: ctx.knights, sign: ctx.sign, arrival: ctx.arrival, armor, frame, fx: ctx.fx, plasma, zap: ctx.zap, frostRing: ctx.frostRing, crystals, chill, marks, debris, view, hit: { get busy() { return ctx.busy; }, get flash() { return ctx.flashAmt; }, get debt() { return ctx.timeDebt; } } }; },
    get interaction() { return interaction.mode; },
    set interaction(m) { interaction.mode = m; },
  };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
