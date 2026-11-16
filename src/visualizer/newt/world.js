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
import { createEnvelopeActor } from '../../invitation/envelopeActor.js';
import { createPetalScene } from '../../invitation/petalScene.js';
import { shared } from '../../invitation/envelopeLook.js';
import { hoverLook, sealGloss } from '../../invitation/envelope.js';
import { PAGES, pageOf, blendPages } from './pages.js';
/** @param {HTMLElement} container @param {Record<string, any>} [options] */
export function createWorld(container, options = {}) {
  const { reducedMotion = false, onTick, onFrame, onError, pageStats, statsParent } = options;
  const scope = createResourceScope();
  let page = pageOf(options.page);
  const duck = createFireDuck({
    onImpact: options.onImpact,
    page: options.page,
    settings: options.settings,
    reduced: reducedMotion,
  });
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
    scope.trackTree(paper);
    scene.add(paper);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x817781, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-3, 7, 4);
    sun.castShadow = true;
    fitShadow(sun, { minX: -7, maxX: 7, minZ: -7, maxZ: 7 }, 2);
    scope.trackTree(sun);
    scene.add(sun, sun.target);
    const actors = new Map();
    const petalScenes = new Map();
    scope.cleanup(() => {
      for (const petals of petalScenes.values()) petals.dispose();
      petalScenes.clear();
      for (const actor of actors.values()) actor.dispose();
      actors.clear();
    });
    let swirl = 1,
      pulseLevel = 0,
      glossAt = -Infinity;
    duck.pulse = (k = 1, { accent = false } = {}) => {
      if (!reducedMotion && Number.isFinite(k) && k > 0) {
        swirl = 1 - Math.min(1, k) * 0.2;
        if (accent) glossAt = t;
        pulseLevel = Math.min(1, k);
      }
    };
    const baseSnapshot = duck.snapshot;
    duck.snapshot = () => {
      const snapshot = baseSnapshot();
      return {
        ...snapshot,
        letter: snapshot.letter
          ? {
              ...snapshot.letter,
              seal: actors.get(snapshot.letter.id)?.sealAt ?? null,
              frame: actors.has(snapshot.letter.id)
                ? new THREE.Vector3().setFromMatrixPosition(actors.get(snapshot.letter.id).inner.matrixWorld)
                : null,
            }
          : null,
        petals: [...petalScenes.values()].reduce((n, petals) => n + petals.live(), 0),
      };
    };
    function letters(dt) {
      const picture = duck.moments;
      const alive = new Set(picture.letters.map((l) => l.id));
      for (const [id, actor] of actors)
        if (!alive.has(id)) {
          actor.dispose();
          petalScenes.get(id)?.letter(null);
          actor.parent.removeFromParent();
          actors.delete(id);
        }
      for (const letter of picture.letters) {
        let actor = actors.get(letter.id);
        if (!actor) {
          actor = createEnvelopeActor({
            size: () => ({ tw: size.w, th: size.h }),
            uniforms: shared({ mark: 0.1, linear: true }),
            snapSeal: true,
          });
          actor.glossAt = -Infinity;
          actor.parent = new THREE.Group();
          actor.parent.add(actor.outer);
          scene.add(actor.parent);
          actor.seal.group.traverse((o) => o.layers.set(layers.ghost));
          actor.specks.points.layers.set(layers.ghost);
          actors.set(letter.id, actor);
          petalScenes.set(
            letter.id,
            createPetalScene({ scene, unit: 1.1, reduced: reducedMotion, mark: 0.1, linear: true }),
          );
        }
        if (picture.petals.some((command) => command.id === letter.id && command.kind === 'bloom')) actor.glossAt = t;
        actor.parent.position.set(letter.x, letter.y, 0);
        actor.parent.updateMatrixWorld(true);
        actor.pose(letter.pose, {
          view: { h: 4, cssH: container.clientHeight || 1, scale: 0.55 * letter.scale },
          camera,
          reduced: reducedMotion,
          lift: hoverLook(pulseLevel),
        });
        const gloss = sealGloss(
          letter.state === 'floating' ? pulseLevel : 0,
          t,
          Math.min(t - glossAt, t - actor.glossAt),
          reducedMotion,
        );
        actor.seal.gloss(gloss.at, gloss.width);
        const petals = petalScenes.get(letter.id);
        petals.letter(actor.inner.matrixWorld, {
          h: (actor.envl.H * 0.55 * letter.scale) / 1.1,
          opening: letter.pose.flap / Math.PI,
          floating: letter.state === 'floating',
          time: letter.time,
        });
      }
      for (const command of picture.petals) {
        if (command.kind === 'cut') {
          for (const petals of petalScenes.values()) petals.cut(0.35);
          continue;
        }
        const actor = actors.get(command.id);
        if (actor)
          petalScenes
            .get(command.id)
            ?.emit(command.kind, new THREE.Vector3().setFromMatrixPosition(actor.inner.matrixWorld));
      }
      pulseLevel *= Math.exp(-dt * 8);
      swirl += (1 - swirl) * Math.min(1, dt * 5);
      for (const [id, petals] of petalScenes) {
        petals.flow.setSwirlScale(swirl);
        petals.step(dt);
        if (!alive.has(id) && !petals.live()) {
          petals.dispose();
          petalScenes.delete(id);
        }
      }
      const next = picture.page
        ? blendPages(picture.page.from, picture.page.to, picture.page.k)
        : (Object.values(PAGES).find((p) => p.name === baseSnapshot().page.name) ?? PAGES.dusk);
      if (next !== page) {
        page = next;
        voidColor.set(page.color);
        paper.material.color.set(page.ink);
        setPalette(paletteChoice);
        frame.reset();
      }
    }
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
    const characterBaseSnapshot = duck.snapshot;
    duck.snapshot = () => ({
      ...characterBaseSnapshot(),
      newt: character ? { state: 'idle', clip: mix.main, grounded: true } : null,
    });
    const writePass = createPassWrites({ pass, glitch: duck.glitch, reducedMotion });
    function draw(dt) {
      const t0 = loop.perf ? performance.now() : 0;
      onFrame?.(dt);
      duck.step(dt);
      t += dt;
      view.apply(dt, size, { sx: 0, sy: 0 });
      letters(dt);
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
