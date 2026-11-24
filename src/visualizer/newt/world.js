// NEWT, letters and one shared petal flow drawn through Bonfire's pixel pipeline.
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
import { createFireDuck, snapshotLetter } from './fireDuck.js';
import { createContactShadow } from './contactShadow.js';
import { createElementRings } from './elementRings.js';
import { createEnvelopeActor } from '../../invitation/envelopeActor.js';
import { createPetalScene } from '../../invitation/petalScene.js';
import { shared } from '../../invitation/envelopeLook.js';
import { hoverLook, sealGloss, FLAP_OPEN } from '../../invitation/envelope.js';
import { PAGES, pageOf, blendPages, elementPalette } from './pages.js';
/** @param {HTMLElement} container @param {Record<string, any>} [options] */
export function createWorld(container, options = {}) {
  const { reducedMotion = false, onTick, onFrame, onError, pageStats, statsParent } = options;
  const scope = createResourceScope();
  let page = pageOf(options.page);
  let rings;
  const duck = createFireDuck({
    onImpact: (flame, old, stationary, selection) => {
      if (!stationary) rings?.impact(selection.element, flame);
      else rings?.setElement(selection.element, flame);
      options.onImpact?.(flame, old, stationary, selection);
    },
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
    const coarse = matchMedia('(pointer: coarse)').matches;
    renderer.shadowMap.enabled = !coarse;
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
    rings = createElementRings({
      scene,
      frame,
      scope,
      page: () => duck.snapshot().page.name.toLowerCase(),
      letter: () => duck.snapshot().letter?.frame ?? null,
      coarse,
      reducedMotion,
    });
    duck.ring = rings.ring;
    const onEvent = duck.onEvent;
    duck.onEvent = (type, data) => {
      onEvent(type, data);
      if (type === 'dropfx') rings.drop(duck.element, duck.flame, duck.forging, data?.strength ?? 1);
    };
    const snapshot = duck.snapshot;
    duck.snapshot = () => ({
      ...snapshot(),
      rings: { element: rings.element, marks: rings.marks.count, time: rings.time },
    });
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({
        color: page.shadow,
        opacity: 0.65,
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
    const blob = createContactShadow({ scene, scope, color: page.shadow, ghost: layers.ghost });
    scene.add(new THREE.HemisphereLight(0xffffff, 0x817781, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-3, 7, 4);
    sun.castShadow = true;
    fitShadow(sun, { minX: -7, maxX: 7, minZ: -7, maxZ: 7 }, 2);
    scope.trackTree(sun);
    scene.add(sun, sun.target);
    const actors = new Map();
    const petals = createPetalScene({ scene, unit: 1.1, reduced: reducedMotion, mark: 0.1, linear: true });
    let turnAt = null;
    scope.cleanup(() => {
      petals.dispose();
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
    const letterFrame = (actor) => new THREE.Vector3().setFromMatrixPosition(actor.inner.matrixWorld);
    duck.snapshot = () => {
      const snapshot = baseSnapshot();
      return {
        ...snapshot,
        letter: snapshotLetter(snapshot.letter, actors.get(snapshot.letter?.id), letterFrame),
        petals: petals.live(),
        size: { w: size.w, h: size.h },
      };
    };
    function letters(dt) {
      const picture = duck.moments;
      const alive = new Set(picture.letters.map((l) => l.id));
      for (const [id, actor] of actors)
        if (!alive.has(id)) {
          actor.dispose();
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
        if (letter.state === 'fading' || letter.pose.dissolve > 0)
          actor.envl.group.traverse((o) => o.layers.set(layers.ghost));
        if (letter.id === picture.letters.at(-1)?.id)
          petals.letter(actor.inner.matrixWorld, {
            h: (actor.envl.H * 0.55 * letter.scale) / 1.1,
            opening: letter.pose.flap / FLAP_OPEN,
            floating: letter.state === 'floating',
            time: letter.time,
          });
      }
      if (!picture.letters.length) petals.letter(null);
      for (const command of picture.petals) {
        if (command.kind === 'ring') {
          rings.ring(1);
          continue;
        }
        if (command.kind === 'cut') {
          petals.cut(0.35);
          continue;
        }
        const actor = actors.get(command.id);
        if (actor) {
          const bloom = command.kind === 'bloom';
          const matrix = bloom ? actor.seal.group.matrixWorld : actor.inner.matrixWorld;
          petals.emit(
            command.kind,
            new THREE.Vector3().setFromMatrixPosition(matrix),
            bloom ? { radius: actor.sealR * new THREE.Vector3().setFromMatrixScale(matrix).x } : {},
          );
        }
      }
      pulseLevel *= Math.exp(-dt * 8);
      swirl += (1 - swirl) * Math.min(1, dt * 5);
      petals.flow.setSwirlScale(swirl);
      petals.step(dt);
      const next = picture.page
        ? blendPages(picture.page.from, picture.page.to, picture.page.k)
        : (Object.values(PAGES).find((p) => p.name === baseSnapshot().page.name) ?? PAGES.dusk);
      if (next !== page) {
        page = next;
        voidColor.set(page.color);
        paper.material.color.set(page.shadow);
        blob.material.color.set(page.shadow);
        setPalette(paletteChoice);
        if (picture.page ? picture.page.at !== turnAt : turnAt === null) frame.reset();
        turnAt = picture.page?.at ?? null;
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
      rings.setDepth(frame.depthTexture);
      canvas.style.width = `${(w * pd) / dpr}px`;
      canvas.style.height = `${(h * pd) / dpr}px`;
      camera.aspect = w / h;
      view.layout = container.clientWidth >= 1100 && w / h > 1.15 ? 'wide' : 'tall';
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    scope.cleanup(() => observer.disconnect());
    let paletteChoice = null,
      paletteElement = null;
    function setPalette(p = null) {
      paletteChoice = p;
      paletteElement = rings.element;
      if (Array.isArray(p)) pass.setPalette(p.map((i) => page.palette[i] ?? page.ink));
      else if (p && p !== 'flame' && debugPalettes[p]) pass.setPalette(debugPalettes[p]);
      else {
        pass.setPalette(elementPalette(page, rings.element), { steel: true });
        pass.setSteel(page.tones);
      }
      pass.uniforms.uCore.value.set(page.palette[8]);
    }
    const setDuckPage = duck.setPage;
    function setPage(key) {
      page = pageOf(key);
      setDuckPage(key);
      voidColor.set(page.color);
      paper.material.color.set(page.shadow);
      blob.material.color.set(page.shadow);
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
    const project = (point) => {
      const v = new THREE.Vector3(point.x, point.y, point.z).project(camera);
      return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
    };
    const characterBaseSnapshot = duck.snapshot;
    duck.snapshot = () => ({
      ...characterBaseSnapshot(),
      newt: character ? { state: 'idle', clip: mix.main, grounded: true } : null,
      projected: {
        chest: project(chest),
        legs: project({ x: chest.x, y: 0.175, z: chest.z }),
        floor: project({ x: chest.x, y: 0, z: chest.z }),
        get ringCenter() {
          return project({ ...rings.markRing, y: 0 });
        },
        get ring() {
          return Array.from({ length: 32 }, (_, i) => {
            const angle = (i / 32) * Math.PI * 2;
            const stamp = rings.markRing;
            return project({
              x: stamp.x + Math.cos(angle) * stamp.radius,
              y: 0,
              z: stamp.z + Math.sin(angle) * stamp.radius,
            });
          });
        },
        paper: (() => {
          const actor = actors.get(duck.moments.letters.at(-1)?.id);
          if (!actor) return null;
          const { W, H, T, group } = actor.envl;
          return [
            [-W / 2, -H / 2],
            [W / 2, -H / 2],
            [W / 2, H / 2],
            [-W / 2, H / 2],
          ].map(([x, y]) => project(group.localToWorld(new THREE.Vector3(x, y, T / 2))));
        })(),
        letter: duck.moments.letters.at(-1)
          ? project({ x: duck.moments.letters.at(-1).x, y: duck.moments.letters.at(-1).y, z: 0 })
          : null,
      },
    });
    const writePass = createPassWrites({ pass, glitch: duck.glitch, reducedMotion });
    function draw(dt) {
      const t0 = loop.perf ? performance.now() : 0;
      if (character) rings.setOrigin(character.root.position.x, character.root.position.z);
      onFrame?.(dt);
      duck.step(dt);
      rings.step(dt);
      if (paletteElement !== rings.element) setPalette(paletteChoice);
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
      blob.visible = !renderer.shadowMap.enabled || !sun.castShadow;
      if (character) {
        blob.position.x = character.root.position.x;
        blob.position.z = character.root.position.z;
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
      ready: loadCharacter(`${import.meta.env.BASE_URL}models/newt.glb`, { pixel: false })
        .then(async (loaded) => {
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
        })
        .catch((error) => {
          scope.dispose();
          throw error;
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
