// @ts-nocheck: 6 type errors still to fix (tsconfig.json checks every module; delete this line once tsc is clean here).
// The bonfire's model (public/models/bonfire.glb), fetched with the knight's (his code comes
// with it: knightBundle.js, a chunk of its own; either failing only leaves him out). Once it's
// in: the ruins' seat for the knight, the weapons and their swaps (weapons.js, whose hooks are
// the fire's hits and rings), the fireflies on the ruins' height map, the scenery's own
// materials, glows and candle flames, and the impacts' rings of fire, lightning and ice, each
// running only as far as the scenery lets it. scene.js waits on `modelLoaded` to draw.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { createResourceScope } from './resources.js';
import { weapons as weaponNames, startingEquipment } from '../content.js';
import { effects } from '../effects.js';
import { createFireflies } from './fireflies.js';
import { createTerrain } from './terrain.js';
import { createImpactFx } from './impact.js';
import { createWeapons } from './weapons.js';
import { createLightningRing } from './lightningRing.js';
import { createIceRing } from './ice.js';
import { LAYER_SOLID, LAYER_FX, LAYER_GHOST, FIRE_ORIGIN, WEAPON_ANCHOR, flameShare } from './sceneContext.js';

const BASE = import.meta.env.BASE_URL;

/**
 * Fetch the model (and the knight's), and build what's made from it once it's in.
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createSceneModel(ctx) {
  const {
    scope,
    renderer,
    scene,
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
  } = ctx;
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
  const knightLoaded = Promise.all([loader.loadAsync(`${BASE}models/knight.glb`), import('./knightBundle.js')])
    .then(([gltf, code]) => {
      ctx.bundle = code;
      return gltf.scene;
    })
    .catch((error) => {
      console.warn('The knight did not load; the fire burns without him.', error);
      return null;
    });
  const knightLater = !fxLayer && !(effects.knight?.show && effects.knight?.arrival === 'start');
  const modelLoaded = Promise.all([
    loader.loadAsync(`${BASE}models/bonfire.glb`),
    knightLater ? null : knightLoaded,
  ]).then(([gltf, knightScene]) => {
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
          ctx.applyColors({ ramp: ctx.currentRamp, shade: ctx.currentShade }, ctx.currentMix);
        },
        // The new weapon finishing its form lands like a hit: a jolt and a flare.
        onFormed: () => {
          ctx.hit(0.45, { freeze: false });
          fire.burst(0.45);
          armor.flare(0.8);
          onFormed?.();
        },
        // An element's own big moment in the forge (a bolt out of the sky, the frozen blade
        // shattering, the ice cocoon cracking off): a flash and a jolt.
        onForgeStrike: (weight) => ctx.hit(weight, { freeze: false }),
        onImpact: ctx.impact,
        // A sword combo: the blade sheds fire and knocks the flames along its swing,
        // and plunging back in throws the element's ring.
        onSwingFrame: (g0, t0, g1, t1, dt) => {
          swingTrail.emit(g0, t0, g1, t1, dt);
          ctx.bladeWake(g0, t0, g1, t1, dt);
        },
        // Each move's hit throws a spray off the point.
        onSwingHit: (kind, tip, dir) => {
          swingTrail.hit(tip, dir, kind === 'thrust' ? 1 : 0.6);
          ctx.hit(kind === 'slash' ? 0.15 : 0.3, { flash: false });
          // A blow that reaches the ground marks it and kicks up debris.
          if (tip.y - (ctx.terrainTop?.(tip.x, tip.z) ?? 0) < 0.3) ctx.scar(tip.x, tip.z, 0.5);
        },
        onSwingImpact: () => {
          ctx.ring(1.2);
          fire.burst(1.1 * flameShare(ctx.elementKey));
          ctx.hit(1);
          ctx.scar(FIRE_ORIGIN.x, FIRE_ORIGIN.z, 1);
          ctx.swingDone?.();
          ctx.swingDone = null;
        },
      },
    });

    scope.trackTree(ctx.weapons.holder);
    scope.trackTree(ctx.weapons.forge);
    if (ctx.weapons.lines) {
      scope.trackTree(ctx.weapons.lines);
      scene.add(ctx.weapons.lines);
    }
    for (const o of ctx.weapons.extras) {
      scope.trackTree(o);
      scene.add(o);
    }
    scope.cleanup(() => ctx.weapons.cancel());
    const flyTemplate = root.getObjectByName('Firefly');
    flyTemplate.removeFromParent();
    // Solid scenery: fireflies steer around it with a height map and land on its
    // tops and walls (exact contact points and normals come from raycasts).
    const statics = [];
    root.traverse((o) => {
      if (o.isMesh && o.name.startsWith('Static_')) statics.push(o);
    });
    // The ruins' own pieces (hidden in the other sceneries: scenery.js).
    ctx.ruinsOnly = statics.filter((o) => /Static_(Pillar|Mortar|Wax)/.test(o.name));
    ctx.baseStatics = statics.filter((o) => !ctx.ruinsOnly.includes(o));
    ctx.liveStatics = statics;
    ctx.terrains.ruins = createTerrain(renderer, statics, { material: ctx.terrainMaterial });
    // The fireflies (and the strikes, mist and debris) read whichever scenery's height map is current.
    const now = () => ctx.terrains[ctx.sceneryKey];
    const terrain = {
      height: (x, z) => now().height(x, z),
      top: (x, z) => now().top(x, z),
      solid: (x, z) => now().solid(x, z),
      slope: (x, z, out) => now().slope(x, z, out),
      get wallSpots() {
        return now().wallSpots;
      },
      get cell() {
        return now().cell;
      },
    };
    const ray = new THREE.Raycaster();
    const normalMatrix = new THREE.Matrix3();
    const raycast = (origin, dir, far) => {
      ray.set(origin, dir);
      ray.far = far;
      const hit = ray.intersectObjects(ctx.liveStatics, false)[0];
      if (!hit?.face) return null;
      const normal = hit.face.normal
        .clone()
        .applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
        .normalize();
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
    if (ctx.fireflies.trails) {
      scope.trackTree(ctx.fireflies.trails);
      ctx.fireflies.trails.layers.set(LAYER_FX);
      scene.add(ctx.fireflies.trails);
    }
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
    for (const [key, name] of [
      ['stone', 'Stone'],
      ['pillar', 'Pillar'],
      ['wood', 'Wood'],
      ['char', 'Charred'],
      ['wax', 'Wax'],
      ['mortar', 'Mortar'],
    ]) {
      ctx.sceneryMaterials[key] = root.getObjectByName(`Static_${name}`)?.material;
    }

    // How far a ground flame can run in each direction before it hits something.
    const blockers = [];
    root.traverse((o) => {
      if (o.isMesh && !/Ground|Flagstone|Ash|Glow|Candle/.test(o.name)) blockers.push(o);
    });
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
    const reach = (a) =>
      reachDist[Math.round(((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * BINS) % BINS];
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
    for (const object of [ctx.fx.ring, ctx.fx.embers, ctx.fx.wave, ctx.fx.haze, ctx.fx.puff, ctx.fx.flecks])
      scope.trackTree(object);
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
    ctx.zap = createLightningRing({
      fxMaterial: effectMaterial,
      sparkMaterial: crossMaterial,
      origin: ground,
      field,
      reach,
      ground: terrain.top,
      emitters: coarse ? 72 : 96,
      sparks: impactCount(260),
      lights: coarse ? 4 : 6,
      reducedMotion,
    });
    ctx.frostRing = createIceRing({
      fxMaterial: effectMaterial,
      glintMaterial: diamondMaterial,
      origin: ground,
      field,
      reach,
      chill,
      chips: impactCount(320),
      lights: coarse ? 4 : 6,
      reducedMotion,
    });
    for (const o of [...ctx.zap.objects, ...ctx.frostRing.objects]) {
      scope.trackTree(o);
      o.layers.set(LAYER_FX);
      scene.add(o);
    }
    ctx.frostRing.solid.layers.set(LAYER_SOLID);
    for (const l of [...ctx.zap.lights, ...ctx.frostRing.lights]) scene.add(l);
    ctx.zap.setRamp(ctx.currentRamp);
    ctx.frostRing.setRamp(ctx.currentRamp);
    ctx.sets = [
      ...fire.sets,
      ...plasma.sets,
      ...crystals.sets,
      ...chill.sets,
      ...ctx.fx.sets,
      ...ctx.zap.sets,
      ...ctx.frostRing.sets,
    ];
    ctx.named([ctx.fx.ring], 'Ring of fire');
    ctx.named([ctx.fx.embers], 'Embers');
    ctx.named([ctx.fx.haze, ctx.fx.puff], 'Smoke');
    ctx.named([ctx.fx.flecks], 'Ash');
    ctx.named(ctx.zap.objects, 'Lightning ring');
    ctx.named(ctx.frostRing.objects, 'Ice ring');
    ctx.named([ctx.weapons.forge], 'Forge (weapon swap)');
    if (ctx.fireflies.trails) ctx.named([ctx.fireflies.trails], 'Firefly trails');

    scene.add(root, ctx.weapons.holder);
    ctx.weapons.setRim(ctx.currentRamp[2]);
    ctx.weapons.set(startingEquipment.weapon);
    if (knightScene) ctx.addKnights(knightScene);
    // Every light on every layer: each pass (frame.js) then sees the same lights, so the lit
    // materials aren't re-set-up for a different light count every frame (the particles'
    // pass has no lit materials: they change nothing there).
    scene.traverse((o) => {
      if (o.isLight) o.layers.enableAll();
    });
    ctx.ready = true;
  });
  return { candleFlames, glows, loader, knightLoaded, knightLater, modelLoaded };
}
