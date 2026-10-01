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
// drawn into its own image (mipmapped for the glow, the mipmaps made only while it shows),
// maybe repainted, with a ghost trail kept beside it. With the effects the scene is always
// drawn into that image first and the final pass reads it (never the all-in-one pass: with
// the effects' warps and splits it builds the scene four times over, and its shader takes
// seconds to compile). Without them (the site) none of those buffers is sized or drawn: the
// one pass does it all.
//
// After the last pass, while the canvas still holds the frame, photo mode's captures and
// scene thumbnails are taken and onRendered's listeners run (recording a clip). Before the
// first frame, compile() builds the shaders in parallel (where the browser can), so it
// doesn't stall: the ones the first frame draws with are waited for, the rest (the effects'
// other stages, the knight's shadow for when he first comes) build on in the background.
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
   * The pass's stages (with the effects): the scene into its own image, maybe repainted (a
   * style), the ghost trail stepped; then the final pass reads those. (The site's single
   * pass does it all.)
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
    const draw = (stage, target) => {
      pass.use(stage);
      renderer.setRenderTarget(target);
      renderer.render(pass.scene, pass.camera);
    };
    // The scene's image keeps its mipmaps' storage (it's allocated with them), but they're
    // only made in the frames the glow reads them (tSceneMip): everything else reads its top
    // level. (Switched off only for the render itself, after the target is set: a target
    // allocated without mipmaps would have none to make later.)
    pass.use('scene');
    renderer.setRenderTarget(fx.sceneRT);
    fx.sceneRT.texture.generateMipmaps = u.uGlow.value > 0;
    renderer.render(pass.scene, pass.camera);
    fx.sceneRT.texture.generateMipmaps = true;
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

  // Every mesh has three shaders: its own (the color pass), the normals pass's (one material
  // for all: a shader for each kind of mesh, skinned or not) and, if it casts one, the fire's
  // shadow's (a point light's: three.js draws each caster into it with a distance material it
  // keeps, WebGLShadowMap, a shader for each kind of mesh). warm() builds the last two for the
  // kinds among `roots` not built yet: the normals with the pass's own material, the shadow's
  // with a stand-in on the shadow map's settings (kept: the shader stays the one it uses).
  const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
  const warmed = new Set(); // the kinds of mesh whose normals / shadow shaders are built
  /** A stand-in for the shadow map's distance material over `m` (WebGLShadowMap getDepthMaterial's settings). */
  function distanceFor(m) {
    const d = own(new THREE.MeshDistanceMaterial());
    d.side = m.shadowSide ?? SHADOW_SIDE[m.side];
    for (const key of ['alphaMap', 'map', 'displacementMap', 'displacementScale', 'displacementBias', 'clipShadows', 'clippingPlanes', 'clipIntersection', 'wireframe']) d[key] = m[key];
    d.alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest;
    return d;
  }
  /** Each kind of mesh among `roots` (the normals': skinned or not; the shadow's: by skinning, normals, morphs and side). */
  function warm(roots) {
    /** @type {Map<string, THREE.Mesh>} */
    const normals = new Map();
    /** @type {Map<string, THREE.Mesh>} */
    const casters = new Map();
    for (const root of roots) {
      root.traverse((o) => {
        const mesh = /** @type {THREE.Mesh} */ (o);
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const skinned = !!mesh.isSkinnedMesh;
        if (!warmed.has(`n|${skinned}`)) normals.set(`n|${skinned}`, mesh);
        const g = mesh.geometry;
        const kind = `s|${skinned}|${!!g?.attributes.normal}|${Object.keys(g?.morphAttributes ?? {}).join()}|${mesh.material?.side}`;
        if (mesh.castShadow && renderer.shadowMap.enabled && !warmed.has(kind)) casters.set(kind, mesh);
      });
    }
    renderer.setRenderTarget(normalRT);
    for (const [kind, mesh] of normals) {
      const mat = mesh.material;
      mesh.material = normalMaterial;
      renderer.compile(mesh, camera, scene);
      mesh.material = mat;
      warmed.add(kind);
    }
    // (The shadow map is drawn with no fog, into its own target: a target, like the normals'.)
    const fog = scene.fog;
    scene.fog = null;
    for (const [kind, mesh] of casters) {
      const mat = mesh.material;
      mesh.material = distanceFor(/** @type {THREE.Material} */ (mat));
      renderer.compile(mesh, camera, scene);
      mesh.material = mat;
      warmed.add(kind);
    }
    scene.fog = fog;
  }

  /**
   * Build the shaders the frame draws with before the first one (scene.js, at load), in
   * parallel where the browser can (KHR_parallel_shader_compile), so the first frame
   * doesn't stall on them. Resolves when the first frame's are ready, or after `timeout` ms
   * regardless; the rest (the effects' other stages) build on in the background. The
   * scene's are built as the color pass draws (its target; the lights are on every layer,
   * so every pass sees the same ones), with their normals and shadows (warm: the knight's
   * too, though he's away at first: no hitch as he first comes), and the pixel pass's as it
   * draws to the screen.
   */
  function compile({ timeout = 6000 } = {}) {
    const was = renderer.getRenderTarget();
    camera.layers.set(layers.solid);
    camera.layers.enable(layers.ghost);
    renderer.setRenderTarget(colorRT);
    const built = [renderer.compileAsync(scene, camera)];
    warm([scene]);
    renderer.setRenderTarget(null);
    if (!fx) {
      pass.use('single');
      built.push(renderer.compileAsync(pass.scene, pass.camera));
    } else {
      // Bonfire Live: the scene stage and the final pass to the screen (the first frame's),
      // then the other stages, each into the target it draws to (a shader is built per
      // target), in the background: the first look that needs one mustn't stall the show.
      const stage = (name, target) => {
        pass.use(name);
        renderer.setRenderTarget(target);
        return renderer.compileAsync(pass.scene, pass.camera);
      };
      built.push(stage('scene', fx.sceneRT), stage('final', null));
      const later = [stage('style', fx.styleRT), stage('ghost', fx.ghostRT[0]), stage('final', fx.feedbackRT[0]), renderer.compileAsync(fx.copyScene, pass.camera)];
      Promise.all(later).catch(() => {});
      pass.use('final');
    }
    renderer.setRenderTarget(was);
    let timer = 0;
    return Promise.race([
      Promise.all(built),
      new Promise((resolve) => { timer = setTimeout(resolve, timeout); }),
    ]).finally(() => clearTimeout(timer));
  }

  /**
   * Build the shaders of `objects` made after compile() (the site's knight and his sign, built
   * after the first frame), before they're put in the scene: their own, their normals and
   * their shadow's, in parallel where the browser can. Resolves when they're ready (or after
   * `timeout` ms regardless).
   */
  function prepare(objects, { timeout = 4000 } = {}) {
    const was = renderer.getRenderTarget();
    camera.layers.set(layers.solid);
    camera.layers.enable(layers.ghost);
    renderer.setRenderTarget(colorRT);
    const built = objects.map((o) => renderer.compileAsync(o, camera, scene));
    warm(objects);
    renderer.setRenderTarget(was);
    let timer = 0;
    return Promise.race([
      Promise.all(built),
      new Promise((resolve) => { timer = setTimeout(resolve, timeout); }),
    ]).finally(() => clearTimeout(timer));
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
    for (const t of thumbs.splice(0)) t.done(thumbCanvas(t.w, t.h));
    for (const fn of rendered) fn();
  }

  // Thumbnails (thumb): the middle of the frame at w:h, copied straight from the canvas, which
  // is texel-sized (each texel one canvas pixel: setSize), with hard edges. No screen-sized
  // copy, no PNG to encode and decode again.
  const thumbs = [];
  function thumbCanvas(w, h) {
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const k = Math.max(w / canvas.width, h / canvas.height);
    ctx.drawImage(canvas, (w - canvas.width * k) / 2, (h - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
    return out;
  }
  /** The next frame as a w×h WebP data URL (resolves null if it can't be made). */
  function thumb(w, h, quality = 0.7) {
    return new Promise((resolve) => {
      thumbs.push({
        w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)),
        done: (out) => out.toBlob((blob) => {
          if (!blob) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => resolve(/** @type {string} */ (reader.result));
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        }, 'image/webp', quality),
      });
    });
  }

  return {
    pass,
    /** The color pass's depth (the particles test themselves against it). */
    depthTexture: colorRT.depthTexture,
    setSize,
    draw,
    compile,
    prepare,
    get size() { return size; },
    /** This frame as a PNG (resolves with a Blob), at the screen's size with hard pixel edges. */
    capture: () => new Promise((resolve) => captures.push(resolve)),
    thumb,
    /** Call `fn` right after every frame is drawn. Returns an unsubscribe. */
    onRendered(fn) { rendered.add(fn); return () => rendered.delete(fn); },
    /** (Feedback and ghost trails start over: the picture jumped.) */
    reset() { if (fx) { fx.feedbackLive = false; fx.ghostLive = false; } },
  };
}
