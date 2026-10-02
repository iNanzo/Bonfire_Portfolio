// The places around the fire (scenery.js): the ruins, the forge, the shrine, the cathedral and
// the cult. Each has its own height map for the fireflies. In Bonfire Live and the Painter the
// other places and their height maps are built in idle moments a while after the show starts
// (prepareSceneries: scene.js runs it), so the first visit to one only puts it in the scene:
// built then, a place and its map (a draw of the whole place read back from the GPU) froze the
// frame it came on. (Still built then if it's asked for before they're ready, and on the site.)
import * as THREE from 'three';
import { createTerrain, readTerrain, createTerrainMaterial } from './terrain.js';
import { buildScenery, SCENERIES } from './scenery.js';
import { mergeSteps } from './sceneryMerge.js';
import { BIG_STEP_MS } from './sceneIdle.js';
import { LAYER_SOLID, LAYER_GHOST, flameShare } from './sceneContext.js';

/**
 * The places, and moving the fire between them.
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createSceneScenery(ctx) {
  const { scope, renderer, scene, frame, fire, candleLight, lamps, glows } = ctx;
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
    if (flash) { ctx.hit(0.6, { freeze: false }); fire.burst(0.6 * flameShare(ctx.elementKey)); }
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
    if (revisit && ctx.flameStep >= 0) ctx.recolorGlows(sceneries[name].glowFrom, sceneries[name].glowTo, ctx.flameStep);
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
    ctx.arrival?.setScenery(ctx.signPlace(name));
    ctx.knights?.setScenery(name, terrains[name]);
    ctx.shadowFrames = 2;
    return true;
  }
  /** Every other place and its height map, a step at a time (scene.js builds them beforehand: inIdle). */
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
  return { terrains, terrainMaterial, sceneryMaterials, sceneries, setScenery, prepareSceneries };
}
