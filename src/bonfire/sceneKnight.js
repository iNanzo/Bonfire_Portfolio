// A knight rests at the fire (knights.js, his own model fetched alongside the scene's; the
// fire burns without him if it fails): he looks up at a weapon rising out of the fire,
// flinches at its impact, leans away from a stoke and lifts his feet as a ring passes. On
// the site he follows effects.knight (there or not, which helmet; the visitor's own pick
// from the pack, `knightHelmet`, wins for the visit). In Bonfire Live a few can be
// summoned to dance round the fire (fire.knights); that page casts them itself. His code is
// a chunk of its own (knightBundle.js), fetched with his model. On the site, when he isn't
// there at load (his sign waits for him), the fire's first frame doesn't wait for him: he's
// built after it, a step at a time in idle moments, his shaders compiled before he and his
// sign are put in the scene (the sign kindles as it appears).
import { effects } from '../effects.js';
import { KNIGHT_HELMETS } from '../effectsDefaults.js';
import { SEATS } from './knightPlaces.js';
import { MODELS, styleOr, styleModel } from './knightStyles.js';
import { LAYER_SOLID, LAYER_FX, LAYER_GHOST, WEAPON_ANCHOR, flameShare } from './sceneContext.js';

const BASE = import.meta.env.BASE_URL;
// The knight's helmets (knights.js HELMETS: the settings' own list, less 'random'; his code
// loads with his model, this is needed before).
export const HELMETS = KNIGHT_HELMETS.filter((h) => h !== 'random');

/**
 * The knights: his style's shader and model, the knights themselves once their model is in,
 * the site's knight's comings and goings, and whether they react.
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createSceneKnight(ctx) {
  const {
    scope,
    renderer,
    scene,
    frame,
    pass,
    fire,
    armor,
    effectMaterial,
    crossMaterial,
    diamondMaterial,
    field,
    P,
    pCount,
    coarse,
    reducedMotion,
    fxLayer,
    siteKnight,
    knightHelmet,
    tinted,
    loader,
    knightLoaded,
    knightLater,
    loaded,
    terrains,
    hit,
    fitKnights,
  } = ctx;
  // The armor's style, finish and rim: the settings' (effects.knight), or Bonfire Live's over
  // them (fire.knights.setStyle / setFinish / setRim; null gives the settings' back).
  const armorOverride = { style: null, finish: null, rim: null };
  function applyArmor() {
    armor.setFinish(armorOverride.finish ?? effects.knight?.finish ?? 'gunmetal');
    armor.setRim(armorOverride.rim ?? effects.knight?.rim ?? 0.5);
    applyStyle();
  }
  // The style (knightStyles.js): its shader (armor.js) and its model (knights.js). A style with
  // its own model (the first build's) has it fetched and its template built (a step at a time,
  // in idle moments) once: when that style is first chosen, or beforehand (prepareStyle: Bonfire
  // Live and the Painter get them ready once the knights are in, so a roll to one at a drop
  // shows at once). Changing it on a knight who's here burns him away and forms him again in it
  // (`instant`: at once, if its model is ready; if it isn't, he burns and forms when it is,
  // never popping in whole a moment late). Resolves true once it shows, false if it couldn't
  // (no knights, the model didn't load, another style took over).
  const styleModels = new Map(); // model file -> Promise<its scene | null>
  function styleScene(file) {
    if (!styleModels.has(file)) {
      styleModels.set(
        file,
        loader.loadAsync(`${BASE}${file}`).then(
          (g) => {
            if (scope.disposed) return null;
            scope.trackTree(g.scene);
            return g.scene;
          },
          (error) => {
            // (Not tried again for half a minute: every finish or rim change asks for it.)
            console.warn(`The knight model ${file} did not load; he keeps his style.`, error);
            setTimeout(() => styleModels.delete(file), 30000);
            return null;
          },
        ),
      );
    }
    return styleModels.get(file);
  }
  const styleTemplates = new Map(); // model file -> Promise<its scene, its template built | null>
  const styleReady = new Map(); // model file -> its scene, once its template is built
  /** A style's model fetched and its template built in idle moments (once). Resolves with its scene, or null. */
  function prepareStyleModel(file) {
    if (file === MODELS.main) return Promise.resolve(null);
    if (!styleTemplates.has(file)) {
      const ready = styleScene(file)
        .then((root) =>
          root && !scope.disposed
            ? knightsIn.then(() => (ctx.knights && ctx.bundle ? ctx.inSteps(ctx.bundle.templateSteps(root)) : null))
            : null,
        )
        .then(
          (t) => {
            if (!t || !ctx.knights || scope.disposed) {
              styleTemplates.delete(file);
              return null;
            }
            ctx.knights.adoptTemplate(t);
            for (const g of ctx.knights.geometries) scope.own(g);
            styleReady.set(file, t.root);
            return t.root;
          },
          (error) => {
            console.warn(`The knight model ${file} is unusable; he keeps his style.`, error);
            return null;
          },
        );
      styleTemplates.set(file, ready);
    }
    return styleTemplates.get(file);
  }
  let styleGoal = null; // the style asked for last (it may still be loading)
  let stylePending = null; // { name, promise }: a style asked for whose model isn't ready yet
  function applyStyle({ instant = false } = {}) {
    const name = styleOr(armorOverride.style ?? effects.knight?.style);
    if (!ctx.knights) {
      // (Not there yet: the shader takes it now, the model when they come: addKnights.)
      styleGoal = name;
      if (styleModel(name) === MODELS.main) armor.setStyle(name);
      return Promise.resolve(false);
    }
    // (Asked for again while its model is on its way: the same wait, not a second swap.)
    if (stylePending?.name === name) {
      styleGoal = name;
      return stylePending.promise;
    }
    if (name === styleGoal && (name === ctx.knights.style || ctx.knights.restyling)) return Promise.resolve(true);
    styleGoal = name;
    const file = styleModel(name);
    const root = file === MODELS.main ? null : styleReady.get(file);
    if (file === MODELS.main || root) {
      stylePending = null;
      return ctx.knights.setStyle(name, { model: root, instant });
    }
    const promise = prepareStyleModel(file).then((scene) => {
      if (stylePending?.promise === promise) stylePending = null;
      if (styleGoal !== name || !ctx.knights || scope.disposed) return false;
      if (!scene) {
        styleGoal = ctx.knights.style;
        return false;
      }
      // (Late: he burns away and forms in it, the swap's own way, whatever was asked.)
      return ctx.knights.setStyle(name, { model: scene });
    });
    stylePending = { name, promise };
    return promise;
  }

  /**
   * The knights (knights.js) from their model (`template`: its template, built beforehand in
   * idle moments). None is there at first: on the site the first comes when he's summoned
   * (knightArrival.js: his sign on the ground, the pack) unless the settings have him there
   * from the start; Bonfire Live casts its own (knightShow.js). Returns what goes in the scene
   * (his and his sign's objects): put there now, or (`attach` false) by the caller.
   */
  function addKnights(model, { template = null, attach = true } = {}) {
    scope.trackTree(model);
    try {
      ctx.knights = ctx.bundle.createKnights(model, {
        layerSolid: LAYER_SOLID,
        layerGhost: LAYER_GHOST,
        castShadows: renderer.shadowMap.enabled,
        armor,
        max: coarse ? 2 : 4,
        reducedMotion,
        template,
        onSparks: (list) => fire.emitSparks(list),
      });
    } catch (error) {
      console.warn('The knight model is unusable; the fire burns without him.', error);
      ctx.knights = null;
      return [];
    }
    for (const r of [...ctx.knights.materials, ...ctx.knights.geometries]) scope.own(r);
    scope.trackTree(ctx.knights.group);
    const skeletons = ctx.knights.skeletons;
    scope.cleanup(() => skeletons.forEach((s) => s.dispose()));
    const objects = [ctx.knights.group];
    tinted.push(ctx.knights);
    ctx.knights.setRamp(ctx.currentRamp);
    // (His style's model, if it isn't the knight's own: as he first comes, at once.)
    styleGoal = null;
    applyStyle({ instant: true });
    ctx.knights.setScenery(ctx.sceneryKey, terrains[ctx.sceneryKey]);
    fitKnights();
    if (siteKnight) objects.push(...addArrival());
    applyKnight(true);
    if (attach) scene.add(...objects);
    return objects;
  }

  // --- The site's knight (effects.knight). He comes and goes (knightArrival.js): away, his
  // summon sign glows on the ground in front of his seat (summonSign.js) and a click on it,
  // or the pack, summons him; arriving, the sign burns away into him in the current element's
  // own way (the weapon swap's forge); resting a while (effects.knight.rest); leaving, he
  // burns away into the sign. effects.knight.show allows him at all; arrival 'start' has him
  // there from the first frame (and staying) instead. His helmet: the setting's, or for
  // 'random' a new one on each summon, unless the visitor picked one in the pack
  // (`knightHelmet`, remembered by main.js; a pick holds for the visit). A helmet setting
  // changed in the admin shows at once. Bonfire Live (`effects`) casts its own knights and
  // leaves all this alone.
  let knightSetting = null; // the helmet setting last applied (null: none yet)
  ctx.helmetGoal = null; // the helmet knight 0 has on or is putting on (fire.knights.helmet)
  ctx.visitorHelmet = HELMETS.includes(knightHelmet) ? knightHelmet : null;
  let arrivalSetting = null; // effects.knight.arrival as last applied
  let showSetting = null; // ...and effects.knight.show
  ctx.sign = null; // his summon sign (summonSign.js), on the site
  ctx.arrival = null; // ...and his comings and goings (knightArrival.js)
  const presenceListeners = new Set();
  function wearHelmet(name, o = {}) {
    if (!ctx.knights || !HELMETS.includes(name)) return Promise.resolve(false);
    if (o.index == null || o.index === 0) ctx.helmetGoal = name;
    return ctx.knights.setHelmet(name, o);
  }
  /** The helmet he comes in: the setting's, the visitor's pick, or a new one at random. */
  function helmetForSummon() {
    const setting = effects.knight.helmet;
    if (HELMETS.includes(setting)) return setting;
    if (ctx.visitorHelmet) return ctx.visitorHelmet;
    const others = HELMETS.filter((h) => h !== ctx.helmetGoal);
    return others[Math.floor(Math.random() * others.length)];
  }
  /** Where his sign lies in a scenery: in front of the seat (knightPlaces.js), on the ground there. */
  function signPlace(name) {
    const s = SEATS[name]?.sign ?? SEATS.ruins.sign;
    const t = terrains[name];
    let y = 0;
    if (t)
      for (const dx of [-0.2, 0, 0.2]) for (const dz of [-0.25, 0, 0.25]) y = Math.max(y, t.height(s.x + dx, s.z + dz));
    return { x: s.x, y: Math.min(0.08, y) + 0.004, z: s.z, yaw: s.yaw };
  }
  /** The sign and the arrival (the site's knight), once there are knights. Returns their objects (for the scene). */
  function addArrival() {
    ctx.sign = ctx.bundle.createSummonSign({
      layer: LAYER_GHOST,
      layerSolid: LAYER_SOLID,
      layerFx: LAYER_FX,
      moteMaterial: effectMaterial,
      exposure: pass.uniforms.exposure,
      reducedMotion,
    });
    for (const r of [...ctx.sign.geometries, ...ctx.sign.materials]) scope.own(r);
    scope.trackTree(ctx.sign.group);
    scope.trackTree(ctx.sign.motes);
    ctx.sign.setRamp(ctx.currentRamp);
    tinted.push(ctx.sign);
    ctx.arrival = ctx.bundle.createKnightArrival({
      knights: ctx.knights,
      sign: ctx.sign,
      particleMaterial: effectMaterial,
      materials: { fire: effectMaterial, lightning: crossMaterial, ice: diamondMaterial },
      layerFx: LAYER_FX,
      field,
      anchor: WEAPON_ANCHOR,
      count: pCount(P.forge),
      reducedMotion,
      now: () => ({ element: ctx.elementKey, ramp: ctx.currentRamp }),
      // (effects.knight's rest is in minutes, rolled between the two on each arrival; one not
      // set: knightArrival.js REST's.)
      rest: () => [effects.knight.restMin, effects.knight.restMax].map((m) => m * 60),
      // (His rest running out waits while he's mid-gesture, changing his helmet or style, or
      // looking at the cursor on him.)
      busy: () => !!ctx.knights?.busyAt(0) || ctx.knights?.hovered === 0,
      hooks: {
        onForgeStrike: (w) => hit(w, { freeze: false }),
        // He's whole: a light hit, and the fire's reflection sweeps his new armor.
        onFormed: (which) => {
          hit(which === 'knight' ? 0.35 : 0.2, { freeze: false });
          if (which === 'knight') {
            armor.flare(0.8);
            fire.burst(0.3 * flameShare(ctx.elementKey));
          }
        },
      },
    });
    for (const o of ctx.arrival.objects) scope.trackTree(o);
    ctx.arrival.onPresence((p) => {
      for (const fn of presenceListeners) fn(p);
    });
    ctx.arrival.setScenery(signPlace(ctx.sceneryKey));
    return [ctx.sign.group, ctx.sign.motes, ...ctx.arrival.objects];
  }
  function applyKnight(first = false) {
    if (!ctx.knights || !siteKnight) return;
    const { show, helmet } = effects.knight;
    const mode = effects.knight.arrival ?? 'sign';
    // The fire's reflection sweeping his armor, at rest now and then and when the fire flares.
    const shine = effects.knight.shine ?? true;
    armor.setShine({ rest: shine, flares: shine });
    // How he sits: resting (the Dark Souls rest) or watchful (only a change eases him over).
    const seat = effects.knight.seat ?? 'resting';
    if (ctx.knights.seatPose !== undefined && seat !== ctx.knights.seatPose) ctx.knights.setSeatPose(seat);
    ctx.arrival.allowed = !!show;
    ctx.arrival.resting = mode !== 'start';
    // There from the start: at load, or the moment the settings say so (the admin's preview:
    // arrival turned to it, or Show turned back on with it).
    if (show && mode === 'start' && (arrivalSetting !== 'start' || !showSetting) && ctx.arrival.presence === 'away') {
      wearHelmet(helmetForSummon(), { index: 0, instant: true });
      ctx.arrival.summon({ instant: true });
    }
    arrivalSetting = mode;
    showSetting = !!show;
    if (helmet === knightSetting) return;
    const was = knightSetting;
    knightSetting = helmet;
    // (A fixed helmet set in the admin shows at once; 'random' waits for the next summon.)
    if (!first && was !== null && HELMETS.includes(helmet))
      wearHelmet(helmet, { index: 0, instant: ctx.arrival.presence !== 'resting' });
  }
  /**
   * The visitor did something with the site's knight (a gesture from the pack or a click on
   * him, a new helmet): his rest is topped up so he doesn't leave right after (a minute at least).
   * @param {number | 'all' | null} [index]
   */
  const busyWithHim = (index = 0) => {
    if (index == null || index === 0 || index === 'all') ctx.arrival?.extendRest(60);
  };
  /** Summon the site's knight (through the forge from his sign; `instant`: at once). False if he can't come now. */
  function summonKnight({ instant = false } = {}) {
    if (!ctx.arrival || !ctx.knightsShown || ctx.arrival.presence !== 'away' || !ctx.arrival.allowed) return false;
    wearHelmet(helmetForSummon(), { index: 0, instant: true });
    return ctx.arrival.summon({ instant });
  }
  // Whether the knights react (flinch, lean, hop, watch a weapon in flight): the site's
  // follows effects.knight.reactions; Bonfire Live switches its own (setReactions).
  ctx.liveReactions = true;
  const reacts = () => (siteKnight ? effects.knight.reactions : ctx.liveReactions);
  /** Something happened at the fire (knights.js react), if the knights mind it (reacts). */
  function reactKnights(kind, strength, where) {
    if (ctx.knights && reacts()) ctx.knights.react(kind, strength, where);
  }

  /**
   * Resolves once the frame after this has been drawn (or the scene is gone).
   * @returns {Promise<void>}
   */
  const nextFrame = () =>
    new Promise((resolve) => {
      const off = frame.onRendered(() => {
        off();
        resolve();
      });
      scope.cleanup(resolve);
    });
  // The site's knight when he isn't there at load: after the fire's first frame, his template
  // is built in idle moments, then he and his sign are made, their shaders compiled, and put in
  // the scene; the sign kindles as it appears (its settling glow). Resolves once he's in (or
  // won't be).
  const knightsIn = !knightLater
    ? loaded
    : loaded
        .then(() => Promise.all([knightLoaded, nextFrame()]))
        .then(([model]) =>
          model && ctx.ready && !scope.disposed
            ? ctx.inSteps(ctx.bundle.templateSteps(model)).then((template) => [model, template])
            : null,
        )
        .then((got) => {
          if (!got || !got[1] || scope.disposed) return null;
          ctx.knightsShown = false; // (his sign can't be clicked, nor he summoned, till they're in)
          const objects = addKnights(got[0], { template: got[1], attach: false });
          return objects.length
            ? frame
                .prepare(objects)
                .catch(() => {})
                .then(() => {
                  if (scope.disposed) return;
                  scene.add(...objects);
                  ctx.knightsShown = true;
                  if (ctx.sign?.mode === 'lit') ctx.sign.uniforms.uGlow.value = 1.2;
                })
            : null;
        })
        .catch((error) => {
          console.warn('The knight could not be built; the fire burns without him.', error);
        });
  // (Bonfire Live and the Painter can roll a style with its own model at any moment: its
  // template is built beforehand, in idle moments once the knights are in.)
  if (fxLayer)
    knightsIn.then(
      () => {
        if (ctx.knights) for (const file of new Set(Object.values(MODELS))) prepareStyleModel(file);
      },
      () => {},
    );
  return {
    knightsIn,
    applyArmor,
    applyStyle,
    prepareStyleModel,
    armorOverride,
    addKnights,
    signPlace,
    wearHelmet,
    applyKnight,
    busyWithHim,
    summonKnight,
    presenceListeners,
    reacts,
    reactKnights,
  };
}

/**
 * fire.knights: what knights.js offers, forwarded once they exist (scene.js makes it last, so
 * its `ready` waits on knightsIn after everything else that does).
 * @param {import('./sceneContext.js').SceneContext} ctx
 */
export function createKnightsApi(ctx) {
  const {
    armor,
    knightsIn,
    armorOverride,
    applyArmor,
    applyStyle,
    prepareStyleModel,
    wearHelmet,
    busyWithHim,
    summonKnight,
    presenceListeners,
    reacts,
    reactKnights,
  } = ctx;
  return {
    /** Resolves true once there are knights (on the site, when he's away at load, a moment after the first frame). */
    ready: knightsIn.then(
      () => !!ctx.knights,
      () => false,
    ),
    get count() {
      return ctx.knights?.count ?? 0;
    },
    get present() {
      return ctx.knights?.present ?? 0;
    },
    get max() {
      return ctx.knights?.max ?? 0;
    },
    get list() {
      return ctx.knights?.list ?? [];
    },
    get positions() {
      return ctx.knights?.positions ?? [];
    },
    get moving() {
      return ctx.knights?.moving ?? false;
    },
    /** Knight 0's helmet: the one he has on, or the one he's putting on mid-swap. */
    get helmet() {
      return ctx.knights ? (ctx.helmetGoal ?? ctx.knights.helmet) : null;
    },
    set helmet(name) {
      wearHelmet(name);
    },
    /** (On the site, knight 0's helmet asked for here, the visitor's pick in the pack, holds for the visit: he comes in it.) */
    setHelmet: (name, o) => {
      if (o?.index == null || o.index === 0) ctx.visitorHelmet = HELMETS.includes(name) ? name : ctx.visitorHelmet;
      busyWithHim(o?.index);
      return wearHelmet(name, o);
    },
    setCast: (o) => {
      if (o?.helmets) ctx.helmetGoal = null;
      ctx.knights?.setCast(o);
    },
    /**
     * The site's knight's presence (knightArrival.js): 'away' (his sign waits on the ground),
     * 'arriving', 'resting', 'leaving'. Bonfire Live: 'resting' while knight 0 is there.
     */
    get presence() {
      return ctx.arrival?.presence ?? (ctx.knights?.list[0]?.present ? 'resting' : 'away');
    },
    /** Summon him (the site: from his sign, through the forge; `instant`: at once). False if he can't come now. */
    summonKnight: (o) => summonKnight(o),
    /** Send him off (the site: he burns away into his sign; `instant`: at once). False if he isn't there. */
    dismissKnight: (o) => ctx.arrival?.dismiss(o) ?? false,
    /** Call `fn(presence)` whenever the site's knight comes or goes. Returns an unsubscribe. */
    onPresence: (fn) => {
      presenceListeners.add(fn);
      return () => presenceListeners.delete(fn);
    },
    /** Seconds of his rest left (the site), Infinity if it doesn't run out; settable (for tests). */
    get restLeft() {
      return ctx.arrival?.restLeft ?? Infinity;
    },
    set restLeft(sec) {
      if (ctx.arrival) ctx.arrival.restLeft = sec;
    },
    summon: (i, o) => ctx.knights?.summon(i, o) ?? false,
    dismiss: (i, o) => ctx.knights?.dismiss(i, o) ?? false,
    sit: (i = 0) => ctx.knights?.sit(i) ?? false,
    stand: (i = 0) => ctx.knights?.stand(i) ?? false,
    dance: (i, o) => ctx.knights?.dance(i, o) ?? false,
    gesture: (name, o) => {
      const on = ctx.knights?.gesture(name, o) ?? false;
      if (on) busyWithHim(o?.index ?? 0);
      return on;
    },
    /** 'impact' (strength 0..1: a flinch), 'stoke' (he leans away), 'ring' (he lifts his feet as it passes). */
    react: (kind, strength, where) => reactKnights(kind, strength, where),
    /**
     * Bonfire Live: whether the knights react at all (react(), and the fire's own stokes,
     * impacts and rings) and sit up to watch a weapon in flight. The site's knight follows
     * effects.knight.reactions instead.
     */
    setReactions: (on) => {
      ctx.liveReactions = !!on;
    },
    get reactions() {
      return reacts();
    },
    /**
     * The fire's reflection sweeping over the armor (armor.js): `rest` (now and then) and
     * `flares` (when the fire flares) on or off; `shine` reads them back.
     */
    setShine: (o) => armor.setShine(o),
    get shine() {
      return armor.shine;
    },
    /**
     * The knight's style (knightStyles.js STYLES; null: the settings', effects.knight.style):
     * knights who are here burn away and form again in it (~1.2 s; `{ instant: true }` at
     * once). Resolves true once it shows (a style with its own model fetches it first).
     */
    setStyle: (name = null, { instant = false } = {}) => {
      armorOverride.style = name ?? null;
      return applyStyle({ instant });
    },
    /**
     * Get a style's model ready beforehand (fetched, its template built in idle moments), so a
     * change to it later shows at once. Resolves true once it's ready (a style on the knight's
     * own model always is).
     */
    prepareStyle: (name) =>
      prepareStyleModel(styleModel(styleOr(name))).then((root) => styleModel(styleOr(name)) === MODELS.main || !!root),
    /** The style he's drawn in now (knightStyles.js key). */
    get style() {
      return ctx.knights?.style ?? armor.style;
    },
    /** The armor's finish (steel.js FINISHES; null: the settings'), and the one he wears. */
    setFinish: (name = null) => {
      armorOverride.finish = name ?? null;
      applyArmor();
    },
    get finish() {
      return armor.finish;
    },
    /** The fire's color on his edges, 0..1 (null: the settings'), and how strong it is. */
    setRim: (v = null) => {
      armorOverride.rim = v ?? null;
      applyArmor();
    },
    get rim() {
      return armor.rim;
    },
    /** How they sit (knights.js setSeatPose): 'resting' | 'watchful'; `{ index }` for one knight. The site's follows effects.knight.seat. */
    setSeatPose: (name, o) => ctx.knights?.setSeatPose?.(name, o),
    get seatPose() {
      return ctx.knights?.seatPose ?? 'resting';
    },
    lookAt: (point, o) => ctx.knights?.lookAt(point, o),
    clock: (beatPos, period) => ctx.knights?.clock(beatPos, period),
    slots: (name) => ctx.knights?.slots(name ?? ctx.sceneryKey) ?? null,
    fits: (move, at, facing, name) => ctx.knights?.fits(move, at, facing, name ?? ctx.sceneryKey) ?? true,
  };
}
