// @ts-nocheck: 12 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
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
// Hits have weight (sceneFire.js): a freeze, a flash, the camera's trauma, debris and a
// mark on the ground, and the background extras thinning out so the main hit reads.
//
// A knight rests at the fire and reacts to it (sceneKnight.js); on the site he comes and goes
// from his summon sign, and in Bonfire Live a few dance round the fire.
//
// createBonfire builds it all and returns its API. It makes the renderer and its passes, the
// flame, the elements and their particles, the flame's colors, the frame loop and the moment
// the scene is ready; the rest are parts of their own, each made with the one `ctx` they
// share (sceneContext.js says what's in it), in this order:
//   sceneIdle.js     work spread over idle moments (a knight's template, the places ahead)
//   sceneModel.js    the model, and the weapons, the fireflies and the rings made from it
//   sceneScenery.js  the places around the fire and their height maps
//   sceneFire.js     hits, stokes, impacts, beats, rings, the living blade
//   sceneRender.js   render options over the settings, the size, the P menu, the breakdown
//   sceneUpdate.js   the per-frame update, the shadow's redraws, the frame itself
//   sceneKnight.js   the knights' style, the site's knight, fire.knights
//   scenePick.js     what's under the cursor, a click's gust, the scroll's sweep
// (and the lights, sceneLights.js, made first). Each is made at its own point in the build:
// what it makes, fetches or hangs on a promise as it's made keeps its place among the rest
// (three.js numbers its objects and materials as they're made, and sorts what it draws by
// those numbers where nothing else decides).
import * as THREE from 'three';
import { createResourceScope } from './resources.js';
import { startingEquipment } from '../content.js';
import { effects } from '../effects.js';
import { ELEMENT_IDS } from '../effectsDefaults.js';
import { elementOr } from '../elements.js';
import { createFrame } from './frame.js';
import { createFrameGate } from './frameGate.js';
import { createFlame, createParticleMaterial, createEffectMaterial, SHAPE } from './flame.js';
import { createInteraction } from './interaction.js';
import { createSmokeMaterial } from './impact.js';
import { createCurlField } from './curl.js';
import { createArmorShared } from './armor.js';
import { styleOr } from './knightStyles.js';
import { createPlasma } from './plasma.js';
import { createCrystals } from './ice.js';
import { createChill } from './chill.js';
import { createSwingTrail } from './swingTrail.js';
import { createView } from './view.js';
import { createPointer } from './pointer.js';
import { createGroundMarks } from './marks.js';
import { createDebris } from './debris.js';
import { createFlowView } from './flowView.js';
import { base, flames, flameOr, scenePalette } from '../palette.js';
import { LAYER_SOLID, LAYER_FX, LAYER_GHOST, FIRE_ORIGIN, lightMix, boost } from './sceneContext.js';
import { createSceneLights } from './sceneLights.js';
import { createSceneIdle, PREBUILD_AFTER_MS } from './sceneIdle.js';
import { createSceneModel } from './sceneModel.js';
import { createSceneScenery } from './sceneScenery.js';
import { createSceneFire } from './sceneFire.js';
import { createSceneRender } from './sceneRender.js';
import { createSceneUpdate } from './sceneUpdate.js';
import { createScenePick } from './scenePick.js';
import { createSceneKnight, createKnightsApi } from './sceneKnight.js';

export function createBonfire(
  container,
  {
    reducedMotion = false,
    paintedLook = false,
    sway: swayAmount = 1,
    lightTrails = false,
    effects: fxLayer = false,
    knightHelmet = null,
    onImpact,
    onFormed,
    onRamp,
    onError,
    onFrame,
    onTick,
    pageStats = () => null,
  } = {},
) {
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
    const jolt = (v) => {
      if (!reducedMotion && effects.render.shake) view.shake(v);
    };

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
    canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        scope.dispose();
        onError?.(new Error('WebGL context lost'));
      },
      { signal: events.signal },
    );

    const scene = scope.trackTree(new THREE.Scene());
    const voidColor = new THREE.Color(base.void);
    scene.fog = new THREE.Fog(voidColor, 5, 9.5);

    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 40);

    // What the scene's parts share (sceneContext.js lists it): each value that more than one of
    // them reads or changes lives on `ctx`, and only there; what's made here and never replaced
    // is handed to it before the first part that needs it.
    /** @type {import('./sceneContext.js').SceneContext} */
    const ctx = /** @type {any} */ ({ scope });

    // --- Lights (sceneLights.js)
    const { moon, fireLight, FIRE_LIGHT_AT, ballLightAt, BALL_LIGHT_MIN_Y, candleLight, lamps } = createSceneLights(
      scene,
      renderer,
    );

    // --- Drawing (frame.js): the passes, their buffers, and (the visualizer) the effects stages
    const frame = createFrame({
      renderer,
      scene,
      camera,
      voidColor,
      effects: fxLayer,
      layers: { solid: LAYER_SOLID, fx: LAYER_FX, ghost: LAYER_GHOST },
      own: (r) => scope.own(r),
      track: (t) => scope.trackTree(t),
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
    const plasma = createPlasma({
      fxMaterial: effectMaterial,
      hotMaterial: particleMaterial,
      sparkMaterial: crossMaterial,
      field,
      origin: FIRE_ORIGIN,
      reducedMotion,
    });
    const chill = createChill({
      material: scope.own(createSmokeMaterial()),
      field,
      origin: FIRE_ORIGIN,
      reducedMotion,
    });
    const crystals = createCrystals({
      fxMaterial: effectMaterial,
      glintMaterial: diamondMaterial,
      origin: new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z),
      field,
      chill,
      reducedMotion,
    });
    for (const o of [...plasma.objects, ...crystals.objects]) {
      scope.trackTree(o);
      o.layers.set(LAYER_FX);
      scene.add(o);
    }
    for (const l of plasma.lights) scene.add(l);
    crystals.solid.layers.set(LAYER_SOLID); // outlined like the rest of the scenery
    scope.trackTree(chill.points);
    chill.points.layers.set(LAYER_GHOST); // cold mist veils what's behind it, like smoke
    scene.add(chill.points);
    // A swinging blade's trail of fire (the visualizer's sword combos).
    const swingTrail = createSwingTrail({ fxMaterial: effectMaterial, field, count: pCount(1600), reducedMotion });
    for (const o of swingTrail.objects) {
      scope.trackTree(o);
      o.layers.set(LAYER_FX);
      scene.add(o);
    }
    // Ground marks and bouncing debris (one pool per element, in its particle shape).
    const marks = createGroundMarks({ center: new THREE.Vector3(FIRE_ORIGIN.x, 0, FIRE_ORIGIN.z) });
    scope.cleanup(() => marks.dispose());
    const debris = {
      fire: createDebris({ kind: 'fire', material: effectMaterial, count: pCount(140), reducedMotion }),
      ice: createDebris({ kind: 'ice', material: diamondMaterial, count: pCount(140), reducedMotion }),
      lightning: createDebris({ kind: 'lightning', material: crossMaterial, count: pCount(160), reducedMotion }),
    };
    for (const d of Object.values(debris)) {
      scope.trackTree(d.points);
      d.points.layers.set(LAYER_FX);
      scene.add(d.points);
    }
    ctx.terrainTop = null; // the scenery's height at (x, z), once the model has loaded

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
    const drive = {
      level: 0,
      brightness: 0,
      size: 0,
      height: 0,
      turbulence: 0,
      glow: 0,
      exposure: 0,
      windX: 0,
      windZ: 0,
    };
    // The pixel pass's effects layer (see pixelPass.js), all off on the site. `sliceSeed`
    // picks a tear pattern; the visualizer changes it with each hit.
    // The layers and blend modes (the visualizer's looks.js) start at their classic ways:
    // echoes lighten, glow adds, scanlines multiply, a warp replaces the picture.
    const glitch = {
      slice: 0,
      sliceSeed: 0,
      split: 0,
      block: 1,
      wave: 0,
      mirror: 0,
      scan: 0,
      scanMode: 0,
      noise: 0,
      invert: 0,
      feedback: 0,
      zoom: 1,
      feedRot: 0,
      kaleido: 0,
      kaleidoRot: 0,
      rippleR: 0,
      rippleAmp: 0,
      iris: 2,
      letterbox: 0,
      ink: 0,
      cycle: 0,
      temp: 0,
      blackout: 0,
      ghost: 0,
      ghostKeep: 0.9,
      blur: 0,
      glow: 0,
      glowSize: 2,
      glowCut: 0.2,
      grad: 0,
      gradA: 0,
      gradB: 6,
      gradC: 8,
      style: 0,
      styleR: 3,
      styleMix: 1,
      paintAngle: 0,
      paintAspect: 1,
      washEdge: 0,
      flicker: 0,
      flickerMode: 0,
      feedMode: 6,
      ghostMode: 0,
      warpMode: 0,
      warpMix: 1,
      inkMode: 0,
      invertMode: 0,
      scanBlend: 3,
      glowMode: 1,
      gradMode: 0,
    };
    // The site's hover on the fire (scenePick.js hoverAt): 1 while the cursor is on it, and eased,
    // how far the fire has risen, brightened and started sparking to meet it (sceneUpdate.js).
    ctx.hoverFlare = 0;
    ctx.hoverGlow = 0;
    // The page's scrolling (scenePick.js scroll): an impulse that fades in a moment, sweeping the
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
        curlFreq: f.swirl,
        lifeMin: Math.min(f.lifeMin, f.lifeMax),
        lifeMax: f.lifeMax,
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
    ctx.fx = null; // ground flames, smoke and ash for weapon impacts
    ctx.zap = null; // the lightning ring (lightning impacts)
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
      fireAt: fireLight.position,
      exposure: pass.uniforms.exposure,
      resolution: pass.uniforms.resolution,
      moonAt: moon.position,
      reducedMotion,
      dither: pass.uniforms.ditherStrength,
      ditherScale: pass.uniforms.ditherScale,
      style: styleOr(effects.knight?.style),
      finish: effects.knight?.finish ?? 'gunmetal',
      rim: effects.knight?.rim ?? 0.5,
      onSteel: (steel, rim, o) => pass.setSteel(steel, { rim, ...o }),
    });

    // --- Flame color state: eased blends between flames (see flameEase)
    ctx.flameKey = flameOr(startingEquipment.flame);
    ctx.blend = null; // { from, to, t }
    ctx.blendMul = 1;
    ctx.debugPaletteIndex = 0;
    ctx.fewStale = true; // (the palette was set since a few colors were last put over it: keepPalette)
    ctx.currentRamp = flames[ctx.flameKey].ramp;
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
    // (What the parts call of what's made here.)
    Object.assign(ctx, { setElement, applyFireParams, applyColors });

    // (Building in idle moments: sceneIdle.js.)
    Object.assign(ctx, createSceneIdle(ctx));

    // --- Model (sceneModel.js): fetched with the knight's, then the weapons, the fireflies, the impacts' rings
    Object.assign(ctx, {
      container,
      reducedMotion,
      lightTrails,
      fxLayer,
      onFormed,
      coarse,
      P,
      F,
      pCount,
      fCount,
      impactCount,
      renderer,
      scene,
      candleLight,
      effectMaterial,
      crossMaterial,
      diamondMaterial,
      field,
      fire,
      plasma,
      chill,
      crystals,
      swingTrail,
      marks,
      debris,
      smokeMaterial,
      armor,
    });
    Object.assign(ctx, createSceneModel(ctx));
    const { modelLoaded } = ctx;

    // The site's knight (sceneKnight.js); Bonfire Live (`effects`) casts its own knights.
    const siteKnight = !fxLayer;

    // --- Scenery (sceneScenery.js): the places around the fire, and their height maps
    Object.assign(ctx, { frame, lamps });
    Object.assign(ctx, createSceneScenery(ctx));
    const { setScenery } = ctx;

    // --- Camera (view.js) and cursor (pointer.js). Each frame the path the cursor traced
    // is handed to the interaction model, which moves flames, sparks and fireflies.
    const view = createView(camera, { reducedMotion, sway: swayAmount });
    const timer = new THREE.Timer(); // (advanced once per rendered frame; paused time is skipped)
    const pointer = createPointer(timer, { signal: events.signal });
    ctx.sets = [...fire.sets, ...plasma.sets, ...crystals.sets, ...chill.sets]; // particle sets the cursor moves (the rings join on load)

    // --- The fire's moments (sceneFire.js): hits, stokes, impacts, beats, rings, the living blade
    Object.assign(ctx, { jolt, view, onImpact });
    Object.assign(ctx, createSceneFire(ctx));
    const { bladeState, stoke, puff, equip, pulse, ring, echo, swing, flourish, sparkle } = ctx;

    // --- Render options, the size, the P menu's steps and the breakdown (sceneRender.js)
    Object.assign(ctx, {
      canvas,
      camera,
      pass,
      fireLight,
      particleMaterial,
      flowView,
      interaction,
      pointer,
      siteKnight,
    });
    Object.assign(ctx, createSceneRender(ctx));
    const {
      settings,
      renderOverride,
      pixelSize,
      applyRender,
      setRender,
      setPalette,
      setFog,
      setShadows,
      setXray,
      resize,
      cycle,
      describe,
      breakdown,
      stats,
    } = ctx;

    // --- The per-frame update and the draw (sceneUpdate.js)
    Object.assign(ctx, {
      paintedLook,
      onFrame,
      timer,
      FIRE_LIGHT_AT,
      ballLightAt,
      BALL_LIGHT_MIN_Y,
      drive,
      glitch,
      presence,
      white,
      lightBase,
      lightWarm,
    });
    Object.assign(ctx, createSceneUpdate(ctx));
    const { renderFrame } = ctx;

    // The stats overlay (ui/perfOverlay.js): ?perf in the page's address (the site, Bonfire Live
    // and the Painter alike), or the page's own switch (setStats: Bonfire Live's Stats Overlay
    // setting, the Painter's Tools menu). The frame rate and times (the page's onTick, on every
    // frame the display shows: Bonfire Live's audio analysis; the page's onFrame; the scene's
    // update; the draw), the draw calls, the shadow's redraws and the GPU's programs and
    // textures; the particle systems running (stats()); and the page's own part (pageStats:
    // Bonfire Live's show, the Painter's scene). With ?perf, the same times as
    // performance.measure entries for the browser's profiler. Off, nothing is timed or counted,
    // and the overlay's code isn't even loaded.
    ctx.perf = null;
    const perfAsked = new URLSearchParams(location.search).has('perf');
    let statsWanted = false;
    let statsLoading = false;
    const statsOn = () => (perfAsked || statsWanted) && !scope.disposed;
    function syncStats() {
      if (!statsOn()) {
        ctx.perf?.dispose();
        ctx.perf = null;
        return;
      }
      if (ctx.perf || statsLoading) return;
      statsLoading = true;
      import('../ui/perfOverlay.js').then(
        ({ createPerfOverlay }) => {
          statsLoading = false;
          if (!statsOn() || ctx.perf) return;
          ctx.perf = createPerfOverlay({
            info: renderer.info,
            maxFps: () => gate.maxFps,
            particles: () => stats().systems,
            page: pageStats,
            measures: perfAsked,
          });
        },
        (error) => {
          statsLoading = false;
          console.warn('The stats overlay did not load.', error);
        },
      );
    }
    scope.cleanup(() => {
      ctx.perf?.dispose();
      ctx.perf = null;
    });
    syncStats();

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
      if (running) {
        timer.reset();
        lastTick = -1;
      } // (the time it was paused doesn't count)
      renderer.setAnimationLoop(
        running
          ? (now) => {
              const tickMs = lastTick < 0 ? 0 : now - lastTick;
              lastTick = now;
              try {
                if (onTick) {
                  const t0 = ctx.perf ? performance.now() : 0;
                  onTick(Math.min(tickMs / 1000, 0.1));
                  ctx.perf?.tick(t0, performance.now()); // (outside renderFrame's parts: its own)
                }
                if (!gate.due(tickMs)) return;
                timer.update(); // (performance.now(), like reset(): never a negative step)
                renderFrame(Math.min(timer.getDelta(), 0.1));
              } catch (error) {
                scope.dispose();
                onError?.(error);
              }
            }
          : null,
      );
    }
    document.addEventListener('visibilitychange', syncRunning, { signal: events.signal });
    // Only one readiness promise owns startup failures; callers handle its rejection. The
    // shaders are built before the first frame (frame.compile: in parallel where the browser
    // can), so drawing it doesn't stall on them.
    const loaded = modelLoaded
      .then(() => (ctx.ready && !scope.disposed ? frame.compile().catch(() => {}) : null))
      .then(() => {
        resize();
        syncRunning();
      })
      .catch((error) => {
        scope.dispose();
        throw error;
      });
    // --- The knights (sceneKnight.js): his style, the site's knight, and when they're in
    Object.assign(ctx, { loaded, knightHelmet, tinted });
    Object.assign(ctx, createSceneKnight(ctx));
    const { knightsIn, applyArmor, applyKnight } = ctx;
    // Bonfire Live and the Painter: every other place, and its height map, built beforehand, so
    // the first visit to one doesn't freeze the show (setScenery). Not in the show's first
    // seconds (they have enough to do: PREBUILD_AFTER_MS), and then only in time the page has
    // spare, in steps of about a ms or less (inIdle), the place's own build the one big one. Its
    // materials are set up for drawing too (frame.prepare: the cult's 46 glows, each its own
    // material, took a frame's worth of setting up the first time they were drawn). On the
    // site, where a visitor seldom changes place, each is built on its first visit.
    if (fxLayer && typeof requestIdleCallback === 'function') {
      knightsIn
        .then(
          () => new Promise((resolve) => setTimeout(resolve, PREBUILD_AFTER_MS)),
          () => null,
        )
        .then(() => (ctx.ready && !scope.disposed ? ctx.inIdle(ctx.prepareSceneries()) : null))
        .catch((error) =>
          console.warn('The places could not be built beforehand; each is built when first shown.', error),
        );
    }

    // fire.knights (sceneKnight.js): what knights.js offers, forwarded once they exist.
    const knightsApi = createKnightsApi(ctx);

    // --- What's under the cursor, and what a click or a scroll does to the scene (scenePick.js)
    Object.assign(ctx, createScenePick(ctx));
    const { weaponAt, knightAt, signAt, hoverAt, hoverOff, flash, scroll } = ctx;

    // (The scenery colors as last taken up. Bonfire Live blends them (colors.js) and asks every
    // frame of the blend, but they're whole hex values: most frames of a slow one bring nothing
    // new, and those are skipped.)
    const baseSeen = { void: '', shadow: '', stone: '', wood: '', bone: '' };
    /** The scenery colors (palette.js `base`) changed: take them up (the visualizer's random palettes). */
    function refreshScene() {
      let moved = false;
      for (const k in baseSeen)
        if (baseSeen[k] !== base[k]) {
          baseSeen[k] = base[k];
          moved = true;
        }
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
      stoke,
      puff,
      equip,
      weaponAt,
      knightAt,
      signAt,
      hoverAt,
      hoverOff,
      flourish,
      breakdown,
      stats,
      setScenery,
      scroll,
      get scenery() {
        return ctx.sceneryKey;
      },
      /** This frame as a PNG (resolves with a Blob), at the screen's size with hard pixel edges. */
      capture: frame.capture,
      setView: view.setView,
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
      get maxFps() {
        return gate.maxFps;
      },
      /**
       * Show the stats overlay or take it away (?perf in the address shows it either way): the
       * frames, the particles running and the page's own part (createBonfire's pageStats).
       */
      setStats(on) {
        statsWanted = !!on;
        syncStats();
      },
      /** The stats overlay is showing (or on its way). */
      get statsShown() {
        return statsOn();
      },
      /** The canvas the scene draws into (low resolution: see resize). */
      get canvas() {
        return canvas;
      },
      /** Call `fn` right after every frame is drawn, while the canvas still holds it (recording a clip). Returns an unsubscribe. */
      onRendered: frame.onRendered,
      setPose: view.setPose,
      viewAxes: view.axes,
      cycle,
      describe,
      flash,
      applyEffects,
      refreshScene,
      pulse,
      sparkle,
      ring,
      echo,
      swing,
      drive,
      glitch,
      ready: loaded,
      /** A jolt of the camera (0..~0.3), if screen shake is on. */
      shake: (amount) => jolt(amount),
      /** Skip ahead: a running weapon swap plays fast up to its impact. False if none is running. */
      hurry: (factor = 4) => ctx.weapons?.hurry(factor) ?? false,
      dispose: () => scope.dispose(),
      /** Let a weapon held over the fire strike (equip with `hold`). False if none is held. */
      release: (strikePace = 1) => ctx.weapons?.release(strikePace) ?? false,
      /** 0..1: how hard a held weapon glows. */
      set charge(v) {
        if (ctx.weapons) ctx.weapons.charge = v;
      },
      /** The blade moves as if alive (the visualizer): flourishes, shudders, a held one's sway. */
      set alive(v) {
        if (ctx.weapons) ctx.weapons.alive = v;
      },
      /** Where the blade is (see bladeState), or null before the model loads. */
      get blade() {
        return ctx.weapons?.blade(bladeState) ?? null;
      },
      /** Render pixel size in CSS px (null: the settings' size). */
      setPixelSize(px) {
        settings.pixelSize = px;
        resize();
      },
      /** Render options over the settings (see setRender); the palette, the fog, the shadow and the x-ray view. */
      setRender,
      setPalette,
      setFog,
      setShadows,
      setXray,
      /** The render options in effect: the settings' own with any override over them. */
      get render() {
        return {
          ...effects.render,
          ...renderOverride,
          pixelSize: pixelSize(),
          flameFps: effects.fire.fps,
          hitStop: effects.impact.hitStop,
          hitFlash: effects.impact.flash,
          debris: effects.impact.debris,
          marks: effects.impact.marks,
          palette: ctx.paletteOverride ?? 'flame',
          fog: ctx.fogKind,
          shadows: ctx.shadowsOn && renderer.shadowMap.enabled,
          xray: ctx.xrayView,
        };
      },
      get flame() {
        return ctx.flameKey;
      },
      get element() {
        return ctx.elementKey;
      },
      get weapon() {
        return ctx.weapons?.currentKey ?? null;
      },
      /**
       * The knights (knights.js has the whole API): safe before the model loads and without
       * it (no knights, nothing happens). `ready` resolves true once there are knights.
       */
      knights: knightsApi,
      /** A weapon swap is running (or a weapon is held, waiting to strike, or swinging). */
      get forging() {
        return ctx.weapons?.busy ?? false;
      },
      get swinging() {
        return ctx.weapons?.swinging ?? false;
      },
      get holding() {
        return ctx.weapons?.holding ?? false;
      },
      /** Seconds from equip() to impact at pace 1. */
      get swapTime() {
        return ctx.weapons?.impactTime ?? 3.58;
      },
      get fireflies() {
        return ctx.fireflies;
      },
      /** Internals for debugging (dev builds expose this as window.__fire). */
      get debug() {
        return {
          weapons: ctx.weapons,
          knights: ctx.knights,
          sign: ctx.sign,
          arrival: ctx.arrival,
          armor,
          frame,
          fx: ctx.fx,
          plasma,
          zap: ctx.zap,
          frostRing: ctx.frostRing,
          crystals,
          chill,
          marks,
          debris,
          view,
          hit: {
            get busy() {
              return ctx.busy;
            },
            get flash() {
              return ctx.flashAmt;
            },
            get debt() {
              return ctx.timeDebt;
            },
          },
        };
      },
      get interaction() {
        return interaction.mode;
      },
      set interaction(m) {
        interaction.mode = m;
      },
    };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
