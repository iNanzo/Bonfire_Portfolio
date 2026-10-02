// What happens every frame: the scene's update (the hit's fades, the hover, the scroll's
// sweep, the elements easing in and out, the flame stepped at its own frame rate with the
// glows and candles, every particle system, a flame blend, the lights flickering with the
// element, the weapons and the knights), when the fire's shadow is redrawn, and the frame
// itself (renderFrame: the page's onFrame, the hit-stop's freeze and repayment, the effects
// layer's uniforms, the draw).
import * as THREE from 'three';
import { effects } from '../effects.js';
import { ELEMENT_IDS } from '../effectsDefaults.js';
import { flames, mixFlame, flameEase } from '../palette.js';
import { passValue, stillClock } from './stillFx.js';
import { FIRE_ORIGIN, lightMix, boost } from './sceneContext.js';

const LIGHT_FPS = 12;
const hash = (n) => {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * The update and the frame.
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createSceneUpdate(ctx) {
  const {
    reducedMotion,
    paintedLook,
    onFrame,
    renderer,
    camera,
    frame,
    pass,
    timer,
    pointer,
    view,
    interaction,
    fire,
    plasma,
    crystals,
    chill,
    swingTrail,
    debris,
    flowView,
    marks,
    armor,
    candleLight,
    lamps,
    fireLight,
    FIRE_LIGHT_AT,
    ballLightAt,
    BALL_LIGHT_MIN_Y,
    drive,
    glitch,
    presence,
    white,
    lightBase,
    lightWarm,
    candleFlames,
    glows,
    sceneries,
    renderOverride,
    keepPalette,
    ambient,
    strikeFirefly,
    bladeState,
  } = ctx;
  const blendTime = () => (reducedMotion ? 0.4 : effects.render.colorChange);
  // Each of `glitch`'s values (scene.js), and the pass uniform it's written to (renderFrame).
  const GLITCH_UNIFORMS = {
    slice: 'uSlice',
    sliceSeed: 'uSliceSeed',
    split: 'uSplit',
    block: 'uBlock',
    wave: 'uWave',
    mirror: 'uMirror',
    scan: 'uScan',
    scanMode: 'uScanMode',
    noise: 'uNoise',
    invert: 'uInvert',
    feedback: 'uFeedback',
    zoom: 'uZoom',
    feedRot: 'uFeedRot',
    kaleido: 'uKaleido',
    kaleidoRot: 'uKaleidoRot',
    rippleR: 'uRippleR',
    rippleAmp: 'uRippleAmp',
    iris: 'uIris',
    letterbox: 'uLetterbox',
    ink: 'uInk',
    cycle: 'uCycle',
    temp: 'uTemp',
    blackout: 'uBlackout',
    ghost: 'uGhost',
    ghostKeep: 'uGhostKeep',
    blur: 'uBlur',
    glow: 'uGlow',
    glowSize: 'uGlowSize',
    glowCut: 'uGlowCut',
    grad: 'uGrad',
    gradA: 'uGradA',
    gradB: 'uGradB',
    gradC: 'uGradC',
    style: 'uStyle',
    styleR: 'uStyleR',
    styleMix: 'uStyleMix',
    paintAngle: 'uPaintAngle',
    paintAspect: 'uPaintAspect',
    washEdge: 'uWashEdge',
    flicker: 'uFlicker',
    flickerMode: 'uFlickerMode',
    feedMode: 'uFeedMode',
    ghostMode: 'uGhostMode',
    warpMode: 'uWarpMode',
    warpMix: 'uWarpMix',
    inkMode: 'uInkMode',
    invertMode: 'uInvertMode',
    scanBlend: 'uScanBlend',
    glowMode: 'uGlowMode',
    gradMode: 'uGradMode',
  };
  const GLITCH_ENTRIES = Object.entries(GLITCH_UNIFORMS);
  // Under reduced motion only the still effects reach the picture; the Painter's
  // (`paintedLook`) lets the look being painted through, all but what flashes or jitters
  // (stillFx.js).
  const stillOpts = { reducedMotion, paintedLook };

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
    fire.params.level +=
      (ctx.targetLevel + drive.level + 1.1 * ctx.hoverGlow - fire.params.level) * Math.min(1, dt * 1.1);
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
    ctx.applyFireParams();

    const sparks = interaction.update(camera, pointer.update(realDt, timer.getElapsed()), ctx.sets, dt);
    if (sparks.length) fire.emitSparks(sparks);

    // Stepped simulation for a hand-animated look.
    const fps = effects.fire.fps;
    const fs = Math.floor(t * fps);
    if (fs !== ctx.flameStep) {
      const steps = ctx.flameStep < 0 || fs < ctx.flameStep ? 1 : Math.min(3, fs - ctx.flameStep);
      ctx.flameStep = fs;
      for (let i = 0; i < steps; i++) fire.stepFlame(1 / fps, t);
      candleFlames.forEach((c, i) =>
        c.mesh.scale.set(c.scale.x, c.scale.y * (0.8 + hash(fs * 1.7 + i * 9.1) * 0.4), c.scale.z),
      );
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
    if (ctx.strikeAt >= 0 && t >= ctx.strikeAt) {
      ctx.strikeAt = -1;
      strikeFirefly(1);
    }
    // Now and then the ball reaches for a firefly on its own (more when stoked).
    if (
      ctx.elementKey === 'lightning' &&
      Math.random() < dt * effects.impact.fireflyStrikes * 0.25 * ambient() * Math.max(0.5, fire.params.level)
    )
      strikeFirefly(0.6);

    // After a weapon lands: ease from the old flame into the new one, with the
    // light swelling and settling as the color turns over.
    if (ctx.blend) {
      ctx.blend.t = Math.min(1, ctx.blend.t + (dt / blendTime()) * (ctx.blend.fast ? 4 : 1));
      const k = flameEase(ctx.blend.t);
      ctx.applyColors(
        mixFlame(flames[ctx.blend.from], flames[ctx.blend.to], k),
        THREE.MathUtils.lerp(lightMix(ctx.blend.from), lightMix(ctx.blend.to), k),
      );
      ctx.blendMul = 1 + Math.sin(ctx.blend.t * Math.PI) * 0.35;
      if (ctx.blend.t >= 1) {
        ctx.blend = null;
        ctx.blendMul = 1;
        ctx.applyColors(flames[ctx.flameKey], lightMix(ctx.flameKey));
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
    const iceLight =
      (0.88 + 0.07 * Math.sin(t * 1.3) * effects.ice.shimmer) * effects.ice.glow * 0.8 * (1 + 0.5 * crystals.beatGlow);
    const lit =
      presence.fire * lightFlicker +
      presence.lightning * plasma.lightFlicker * effects.lightning.brightness +
      presence.ice * iceLight;
    const flicker = lit / Math.max(1e-3, presence.fire + presence.lightning + presence.ice);
    // The ball lights the scene from where it hangs — but no lower than the top of the
    // logs, so a ball set down in the core still lights the clearing instead of being
    // shadowed by the logs around it.
    fireLight.position.lerpVectors(
      FIRE_LIGHT_AT,
      ballLightAt.set(FIRE_ORIGIN.x, Math.max(effects.lightning.height, BALL_LIGHT_MIN_Y), FIRE_ORIGIN.z + 0.12),
      presence.lightning,
    );
    // A discharge (weapon impact, stoke) flashes the whole scene for an instant.
    const flash = reducedMotion ? 0 : plasma.flash;
    pass.uniforms.exposure.value =
      (renderOverride.exposure ?? effects.render.exposure) * (1 + flash * 0.45) * boost(drive.exposure);
    keepPalette();
    pass.uniforms.uFlash.value = reducedMotion ? 0 : ctx.flashAmt;
    // The music's color temperature (the visualizer) tints the cast light too.
    const temp = glitch.temp;
    fireLight.color.copy(lightBase);
    if (temp > 0) fireLight.color.lerp(white, temp * 0.45);
    else if (temp < 0) fireLight.color.lerp(lightWarm, -temp * 0.35);
    fireLight.intensity =
      effects.fire.glow *
      Math.min(2.6, Math.max(0.3, fire.params.level)) ** 1.3 *
      flicker *
      ctx.blendMul *
      (1 + flash * 1.5) *
      boost(drive.glow) *
      (1 + 0.6 * ctx.hoverGlow);

    ctx.weapons.update(dt);
    if (ctx.knights) {
      // The armor mirrors the fire as it flickers; the knights glance at a weapon in flight.
      armor.uniforms.uFire.value = Math.min(1.6, fireLight.intensity / Math.max(0.1, effects.fire.glow));
      const b = ctx.weapons.busy ? ctx.weapons.blade(bladeState) : null;
      ctx.knights.update(dt, {
        lookAt: b && ctx.reacts() ? (b.free ? b.tip : b.mid) : null,
        cameraAt: camera.position,
      });
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
    else if (ctx.knights?.moving || (shudder && step !== shadowStep) || (shuddering && !shudder))
      ctx.shadowFrames = Math.max(ctx.shadowFrames, 1);
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
    pass.uniforms.uCenter.value.set(
      (fireOnScreen.x * 0.5 + 0.5) * ctx.size.w,
      (fireOnScreen.y * 0.5 + 0.5) * ctx.size.h,
    );

    const t2 = ctx.perf ? performance.now() : 0;
    const shadows = renderer.shadowMap.enabled && shadowNeedsUpdate();
    ctx.fireflies?.place(camera); // (their instances, for the camera as it is now: fireflies.js)
    frame.draw({ shadows });
    ctx.perf?.frame(t0, t1, t2, performance.now(), shadows);
  }
  return { recolorGlows, renderFrame };
}
