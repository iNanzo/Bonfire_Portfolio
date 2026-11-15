// Shared final pass writes; the caller supplies its world-space focus point.
export const GLITCH_UNIFORMS = (() => {
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
  return GLITCH_UNIFORMS;
})();
import { passValue, stillClock } from './stillFx.js';
export function createPassWrites({ pass, glitch, reducedMotion = false, paintedLook = false }) {
  const GLITCH_ENTRIES = Object.entries(GLITCH_UNIFORMS);
  const stillOpts = { reducedMotion, paintedLook };
  return function writePass(t, size, fireOnScreen, camera) {
    for (const [k, u] of GLITCH_ENTRIES) pass.uniforms[u].value = passValue(k, glitch[k], stillOpts);
    pass.uniforms.uTime.value = stillClock(stillOpts) ? 0 : t;
    // The ripple is sized to the screen: radius as a fraction of the height, push per 270 rows.
    pass.uniforms.uRippleR.value = glitch.rippleR * size.h;
    pass.uniforms.uRippleAmp.value = reducedMotion ? 0 : (glitch.rippleAmp * size.h) / 270;
    // Where the fire is on screen (texels): the ripple, the iris and the echoes center on it.
    fireOnScreen.project(camera);
    pass.uniforms.uCenter.value.set((fireOnScreen.x * 0.5 + 0.5) * size.w, (fireOnScreen.y * 0.5 + 0.5) * size.h);
  };
}
