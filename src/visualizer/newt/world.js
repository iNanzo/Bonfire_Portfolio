// A page drawn through Bonfire's pixel pipeline. Actors arrive in later tasks.
import * as THREE from 'three';
import { createFrame } from '../../bonfire/frame.js';
import { createView } from '../../bonfire/view.js';
import { createFrameLoop, ownFrameRenderer, attachFrameCanvas, frameCapture } from '../../bonfire/frameLoop.js';
import { createResourceScope } from '../../bonfire/resources.js';
import { applyRenderTo, WRITE_THROUGH } from '../../bonfire/sceneRender.js';
import { createPassWrites } from '../../bonfire/passWrites.js';
import { effects } from '../../effects.js';
import { debugPalettes } from '../../palette.js';
import { loadCharacter } from '../../invitation/character.js';
import { BONES } from '../../invitation/clips.js';
import { createMix, mixStep, lookAim } from '../../invitation/play.js';
import { fitShadow } from '../../invitation/floor.js';
import { createFireDuck } from './fireDuck.js';
import { pageOf } from './pages.js';
/** @param {HTMLElement} container @param {Record<string, any>} [options] */
export function createWorld(container, options = {}) {
  const { reducedMotion = false, onTick, onFrame, onError, pageStats, statsParent } = options;
  const scope = createResourceScope();
  let page = pageOf(options.page);
  const duck = createFireDuck({ onImpact: options.onImpact, page: options.page });
  try {
    // Copied from src/bonfire/scene.js: renderer ownership and context teardown.
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    ownFrameRenderer(scope, renderer);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !matchMedia('(pointer: coarse)').matches;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    const canvas = attachFrameCanvas(scope, renderer, container, onError);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    const view = createView(camera, { reducedMotion, sway: 0 });
    const layers = { solid: 0, fx: 1, ghost: 2 };
    const voidColor = new THREE.Color(page.color);
    const frame = createFrame({
      renderer,
      scene,
      camera,
      layers,
      voidColor,
      effects: true,
      own: scope.own,
      track: scope.trackTree,
    });
    const { pass } = frame;
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({
        color: page.ink,
        opacity: 0.3,
        transparent: true,
        depthWrite: false,
        // Its shadow blends over the void without changing the target's alpha.
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      }),
    );
    paper.rotation.x = -Math.PI / 2;
    paper.receiveShadow = true;
    paper.layers.set(layers.ghost);
    scene.add(paper);
    scope.trackTree(paper);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x817781, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-3, 7, 4);
    sun.castShadow = true;
    fitShadow(sun, { minX: -7, maxX: 7, minZ: -7, maxZ: 7 }, 2);
    scene.add(sun, sun.target);
    scope.trackTree(sun);
    const settings = { pixelSize: null };
    let size = { w: 1, h: 1, pd: 4 };
    const renderOverride = {};
    const ownValues = {};
    const applyRender = () => applyRenderTo(pass, effects, renderOverride, ownValues);
    applyRender();
    /**
     * Render options over the settings, as a partial: a value sets one, null clears it back to
     * the settings', and anything left out stays as it is. dither (0..0.5), ditherMatrix (4 | 8),
     * outlines, exposure, colorChange (seconds), flameFps (the flame's
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

    function resize() {
      if (scope.disposed) return;
      const dpr = devicePixelRatio || 1;
      const px =
        settings.pixelSize ?? (container.clientWidth < 700 ? effects.render.pixelSizeSmall : effects.render.pixelSize);
      const pd = Math.max(1, Math.round(px * dpr));
      const w = Math.max(1, Math.ceil((container.clientWidth * dpr) / pd));
      const h = Math.max(1, Math.ceil((container.clientHeight * dpr) / pd));
      size = { w, h, pd };
      frame.setSize(w, h, pd);
      canvas.style.width = `${(w * pd) / dpr}px`;
      canvas.style.height = `${(h * pd) / dpr}px`;
      camera.aspect = w / h;
      view.layout = container.clientWidth >= 1100 && w / h > 1.15 ? 'wide' : 'tall';
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    scope.cleanup(() => observer.disconnect());
    let paletteChoice = null;
    function setPalette(p = null) {
      paletteChoice = p;
      if (Array.isArray(p)) pass.setPalette(p.map((i) => page.palette[i] ?? page.ink));
      else if (p && p !== 'flame' && debugPalettes[p]) pass.setPalette(debugPalettes[p]);
      else {
        pass.setPalette(page.palette, { steel: true });
        pass.setSteel(page.tones);
      }
      pass.uniforms.uCore.value.set(page.palette[8]);
    }
    const setDuckPage = duck.setPage;
    function setPage(key) {
      page = pageOf(key);
      setDuckPage(key);
      voidColor.set(page.color);
      paper.material.color.set(page.ink);
      setPalette(paletteChoice);
      frame.reset();
    }
    setPalette();
    resize();
    let ready = false;
    let t = 0;
    const center = new THREE.Vector3();
    const chest = { x: 0, y: 0.55, z: 0 };
    const head = { x: 0, y: 0.9, z: 0 };
    let character = null;
    const mix = createMix();
    const baseSnapshot = duck.snapshot;
    duck.snapshot = () => ({
      ...baseSnapshot(),
      newt: character ? { state: 'idle', clip: mix.main, grounded: true } : null,
    });
    const writePass = createPassWrites({ pass, glitch: duck.glitch, reducedMotion });
    function draw(dt) {
      const t0 = loop.perf ? performance.now() : 0;
      onFrame?.(dt);
      duck.step(dt);
      t += dt;
      view.apply(dt, size, { sx: 0, sy: 0 });
      if (character) {
        mixStep(mix, { clip: 'Idle', speed: 0, dt });
        character.setWeights(mix.weights, mix.phase);
        character.update(dt);
        character.root.updateMatrixWorld(true);
        character.bonePos(BONES.head, head);
        head.y += 0.12;
        const { aim } = lookAim('camera', {
          head,
          yaw: character.root.rotation.y,
          camera: camera.position,
          pointer: null,
        });
        character.applyLook(aim?.yaw ?? 0, aim?.pitch ?? 0, 1);
        character.root.updateMatrixWorld(true);
        character.bonePos(BONES.chest, chest);
      }
      center.set(chest.x, chest.y, chest.z);
      writePass(t, size, center, camera);
      pass.uniforms.exposure.value = (renderOverride.exposure ?? effects.render.exposure) * (1 + duck.drive.exposure);
      const t1 = loop.perf ? performance.now() : 0;
      frame.draw({ shadows: renderer.shadowMap.enabled });
      loop.perf?.frame(t0, t1, t1, performance.now(), renderer.shadowMap.enabled);
    }
    const loop = createFrameLoop({
      renderer,
      scope,
      ready: () => ready,
      draw,
      onTick,
      onError,
      pageStats,
      statsParent,
      measureAbsentTick: true,
    });
    const { gate, syncRunning, statsOn } = loop;
    const duckDispose = duck.dispose;
    Object.assign(duck, {
      canvas,
      ready: loadCharacter(`${import.meta.env.BASE_URL}models/newt.glb`, { pixel: false }).then(async (loaded) => {
        if (scope.disposed) {
          loaded.dispose();
          return;
        }
        character = loaded;
        character.root.rotation.order = 'XZY';
        character.setWeights(mix.weights, mix.phase);
        character.update(0);
        scene.add(character.root);
        scope.cleanup(() => {
          character.root.removeFromParent();
          character.dispose();
        });
        await frame.compile();
        if (scope.disposed) return;
        draw(0);
        ready = true;
        syncRunning();
      }),
      setRender,
      setPalette,
      setPage,
      setXray: (v) => {
        pass.uniforms.uXray.value = { normals: 1, lighting: 2, particles: 3 }[v] ?? 0;
      },
      setShadows: (on = true) => {
        sun.castShadow = !!on;
      },
      setPose: view.setPose,
      setView: view.setView,
      shake: (v) => {
        if (!reducedMotion) view.shake(v);
      },
      ...frameCapture(frame),
      setMaxFps: gate.setMaxFps,
      setStats(on) {
        loop.setStats(on);
      },
      dispose() {
        duckDispose();
        scope.dispose();
      },
    });
    Object.defineProperties(duck, { maxFps: { get: () => gate.maxFps }, statsShown: { get: statsOn } });
    return duck;
  } catch (error) {
    duck.dispose();
    scope.dispose();
    throw error;
  }
}
