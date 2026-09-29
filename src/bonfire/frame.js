// Drawing a frame (scene.js calls draw() once per frame), all at low resolution:
//   1. normals — outlined solid geometry → view-space normals + depth
//   2. color   — solid geometry + "ghost" emissives (candle flames, dissolving weapons)
//                → linear color + depth
//   3. fx      — particle fire + sparks, additive, depth-tested by hand against pass 2's depth
//   4. pixel   — outlines, + fx, vignette, Bayer dither, palette → canvas (pixelPass.js)
//
// With `effects` (the visualizer) the pixel pass carries its effects layer and the stages
// the heavier effects need: frame feedback for the echo (the pass reads the last frame
// from one buffer while writing the other, then a copy puts it on screen), and the scene
// drawn into its own image (mipmapped, for the glow), maybe repainted, with a ghost trail
// kept beside it. Without it (the site) none of those buffers is sized or drawn.
//
// After the last pass, while the canvas still holds the frame, photo mode's captures
// are taken and onRendered's listeners run (recording a clip).
import * as THREE from 'three';
import { createPixelPass } from './pixelPass.js';

/**
 * @param {object} o
 * @param {THREE.WebGLRenderer} o.renderer
 * @param {THREE.Scene} o.scene
 * @param {THREE.PerspectiveCamera} o.camera
 * @param {{ solid: number, fx: number, ghost: number }} o.layers
 * @param {THREE.Color} o.voidColor   the color pass's clear color
 * @param {boolean} [o.effects]       the visualizer's effects layer and stages
 * @param {(r: any) => any} o.own     hands a GPU resource to the scene's scope (disposed with it)
 * @param {(tree: THREE.Object3D) => any} o.track  ...and a whole tree's geometries and materials
 */
export function createFrame({ renderer, scene, camera, layers, voidColor, effects = false, own, track }) {
  const canvas = renderer.domElement;
  const rtOpts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const colorRT = own(new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) }));
  const normalRT = own(new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthTexture: new THREE.DepthTexture(1, 1) }));
  const fxRT = own(new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, type: THREE.HalfFloatType, depthBuffer: false }));
  const normalMaterial = own(new THREE.MeshNormalMaterial({ flatShading: true }));
  const pass = createPixelPass({ effects });
  for (const m of Object.values(pass.materials)) own(m);
  track(pass.scene);
  const u = pass.uniforms;
  u.tColor.value = colorRT.texture;
  u.tDepth.value = colorRT.depthTexture;
  u.tNormal.value = normalRT.texture;
  u.tNormalDepth.value = normalRT.depthTexture;
  u.tFx.value = fxRT.texture;
  u.cameraNear.value = camera.near;
  u.cameraFar.value = camera.far;

  // --- The visualizer's stages (only with `effects`).
  const fx = effects ? createStages() : null;
  function createStages() {
    const feedbackRT = [0, 1].map(() => own(new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthBuffer: false })));
    const copyScene = new THREE.Scene();
    const copyMaterial = own(new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, resolution: u.resolution },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform vec2 resolution; void main() { gl_FragColor = texture2D(map, gl_FragCoord.xy / resolution); }',
      depthTest: false, depthWrite: false,
    }));
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial);
    quad.frustumCulled = false;
    copyScene.add(quad);
    track(copyScene);
    const stageOpts = { type: THREE.HalfFloatType, depthBuffer: false };
    const sceneRT = own(new THREE.WebGLRenderTarget(1, 1, { ...stageOpts, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }));
    const styleRT = own(new THREE.WebGLRenderTarget(1, 1, { ...stageOpts, ...rtOpts }));
    const ghostRT = [0, 1].map(() => own(new THREE.WebGLRenderTarget(1, 1, { ...stageOpts, ...rtOpts })));
    return {
      feedbackRT, copyScene, copyMaterial, sceneRT, styleRT, ghostRT,
      feedbackFlip: 0, feedbackLive: false, ghostFlip: 0, ghostLive: false,
      // Motion blur compares each frame's camera with the last one's.
      lastViewProj: new THREE.Matrix4(), viewProj: new THREE.Matrix4(),
      lastCamPos: new THREE.Vector3(Infinity, 0, 0), lastCamQuat: new THREE.Quaternion(),
      all: () => [...feedbackRT, sceneRT, styleRT, ...ghostRT],
    };
  }

  let size = { w: 1, h: 1, pd: 4 };
  /** Size every buffer to w×h texels (each drawn pd device pixels wide). */
  function setSize(w, h, pd) {
    size = { w, h, pd };
    renderer.setSize(w, h, false);
    for (const rt of [colorRT, normalRT, fxRT, ...(fx ? fx.all() : [])]) rt.setSize(w, h);
    if (fx) { fx.feedbackLive = false; fx.ghostLive = false; }
    u.resolution.value.set(w, h);
  }

  /**
   * The pass's stages, when an effect needs them (motion blur, ghosting, glow, a repaint):
   * the scene into its own image, maybe repainted, the ghost trail stepped; then the final
   * pass reads those. Otherwise the single pass does it all.
   */
  function renderStages() {
    if (!fx) { pass.use('single'); return; }
    // Motion blur: this frame's view space → last frame's clip space. A cut (the camera
    // jumping) starts over instead of smearing the whole frame.
    camera.updateMatrixWorld();
    fx.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const cut = camera.position.distanceTo(fx.lastCamPos) > 0.6 || camera.quaternion.angleTo(fx.lastCamQuat) > 0.35;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uPrevFromView.value.multiplyMatrices(cut ? fx.viewProj : fx.lastViewProj, camera.matrixWorld);
    fx.lastViewProj.copy(fx.viewProj);
    fx.lastCamPos.copy(camera.position);
    fx.lastCamQuat.copy(camera.quaternion);

    const style = u.uStyle.value > 0.5 && u.uStyleMix.value > 0;
    const ghost = u.uGhost.value > 0;
    if (!style && !ghost && !(u.uGlow.value > 0) && !(u.uBlur.value > 0)) {
      fx.ghostLive = false;
      pass.use('single');
      return;
    }
    const draw = (stage, target) => {
      pass.use(stage);
      renderer.setRenderTarget(target);
      renderer.render(pass.scene, pass.camera);
    };
    draw('scene', fx.sceneRT);
    u.tScene.value = fx.sceneRT.texture;
    u.tSceneMip.value = fx.sceneRT.texture;
    if (style) {
      draw('style', fx.styleRT);
      u.tScene.value = fx.styleRT.texture;
    }
    if (ghost) {
      // A new trail starts as the scene itself.
      const write = fx.ghostRT[fx.ghostFlip];
      u.tGhost.value = fx.ghostRT[1 - fx.ghostFlip].texture;
      if (!fx.ghostLive) u.uGhostKeep.value = 0;
      draw('ghost', write);
      fx.ghostFlip = 1 - fx.ghostFlip;
      fx.ghostLive = true;
      u.tGhost.value = write.texture;
    } else fx.ghostLive = false;
    pass.use('final');
  }

  const captures = [];
  const rendered = new Set();

  /** Draw this frame. `shadows`: whether the fire's shadow must be redrawn this frame. */
  function draw({ shadows = false } = {}) {
    scene.overrideMaterial = normalMaterial;
    camera.layers.set(layers.solid);
    renderer.setRenderTarget(normalRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;

    camera.layers.set(layers.solid);
    camera.layers.enable(layers.ghost);
    if (shadows) renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(colorRT);
    renderer.setClearColor(voidColor, 1);
    renderer.clear();
    renderer.render(scene, camera);

    camera.layers.set(layers.fx);
    renderer.setRenderTarget(fxRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);

    renderStages();
    if (fx && u.uFeedback.value > 0) {
      if (!fx.feedbackLive) {
        for (const rt of fx.feedbackRT) { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); }
        fx.feedbackLive = true;
      }
      const write = fx.feedbackRT[fx.feedbackFlip];
      u.tPrev.value = fx.feedbackRT[1 - fx.feedbackFlip].texture;
      fx.feedbackFlip = 1 - fx.feedbackFlip;
      renderer.setRenderTarget(write);
      renderer.clear();
      renderer.render(pass.scene, pass.camera);
      fx.copyMaterial.uniforms.map.value = write.texture;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(fx.copyScene, pass.camera);
    } else {
      if (fx) fx.feedbackLive = false;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(pass.scene, pass.camera);
    }
    // A picture was asked for (photo mode): copy this frame now, while the canvas still
    // holds it, scaled up with hard pixel edges.
    if (captures.length) {
      const out = document.createElement('canvas');
      out.width = size.w * size.pd;
      out.height = size.h * size.pd;
      const ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, out.width, out.height);
      for (const done of captures.splice(0)) out.toBlob(done, 'image/png');
    }
    for (const fn of rendered) fn();
  }

  return {
    pass,
    /** The color pass's depth (the particles test themselves against it). */
    depthTexture: colorRT.depthTexture,
    setSize,
    draw,
    get size() { return size; },
    /** This frame as a PNG (resolves with a Blob), at the screen's size with hard pixel edges. */
    capture: () => new Promise((resolve) => captures.push(resolve)),
    /** Call `fn` right after every frame is drawn. Returns an unsubscribe. */
    onRendered(fn) { rendered.add(fn); return () => rendered.delete(fn); },
    /** (Feedback and ghost trails start over: the picture jumped.) */
    reset() { if (fx) { fx.feedbackLive = false; fx.ghostLive = false; } },
  };
}
